/**
 * find-jobs.ts — поиск вакансий и сопоставление с резюме (human-in-the-loop).
 *
 * Источники: hh.ru API (--source hh) или ручной файл (--source file --file <path>,
 * YAML/JSON со списком {title, company, url, text}).
 *
 * Скоринг в два этапа (экономит токены):
 *   1) дешёвый предфильтр по пересечению слов резюме и вакансии → берём top-N;
 *   2) LLM-ранжирование только top-N (если задан OPENAI_API_KEY; иначе остаётся
 *      эвристический скор). Один батч-вызов на все N.
 *
 * Выдача — ПРИВАТНО (репо публичный): out/jobs/<slug>.json (для apply.ts) +
 * out/jobs/<slug>.md (для осмотра) + таблица в терминал. Папка out/ в .gitignore.
 *
 * Запуск:
 *   npm run find-jobs -- --source hh --lang ru --top 10 --out hh-lead
 *   npm run find-jobs -- --source file --file ./vacancies.yaml --lang ru --out manual
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { loadContent, ROOT } from '../src/lib/load';
import { resumeWords, keywordScore, profileFacts, catalog } from './lib/catalog';
import { callStructured, hasOpenAIKey, modelName } from './lib/llm';
import { searchVacancies, fetchVacancy, HhError, type VacancyBrief } from './lib/hh';
import type { Content, Lang } from '../src/schema/index';

const OUT_DIR = join(ROOT, 'out', 'jobs');

export type Verdict = 'strong' | 'maybe' | 'weak';

export interface Match {
  id: string;
  title: string;
  company: string;
  url?: string;
  area?: string;
  salary?: string;
  prefilterScore: number;
  score: number; // 0–100
  verdict: Verdict;
  strengths: string[];
  gaps: string[];
  whyFit: string;
  description: string; // полный текст вакансии — вход для apply.ts
}

export interface MatchFile {
  slug: string;
  lang: Lang;
  source: string;
  query?: string;
  matches: Match[];
}

interface Args {
  source: 'hh' | 'file';
  file?: string;
  lang: Lang;
  query?: string;
  area?: string;
  top: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const source = (get('--source', 'hh') as 'hh' | 'file') ?? 'hh';
  const file = get('--file');
  if (source === 'file' && !file) {
    console.error('Для --source file укажи --file <path> (YAML/JSON со списком вакансий).');
    process.exit(1);
  }
  return {
    source,
    file,
    lang: (get('--lang', 'ru') as Lang) ?? 'ru',
    query: get('--query'),
    area: get('--area'),
    top: Number(get('--top', '10')),
    out: get('--out', 'jobs')!,
  };
}

/** Нормализованная вакансия до скоринга. */
interface Candidate {
  id: string;
  title: string;
  company: string;
  url?: string;
  area?: string;
  salary?: string;
  prefilterText: string; // для дешёвого предфильтра
  description?: string; // полный текст (если уже есть; для hh дотягиваем позже)
  brief?: VacancyBrief; // исходная карточка hh для дозагрузки
}

/** Сбор вакансий из ручного файла (YAML/JSON). */
function collectFromFile(path: string): Candidate[] {
  const raw = readFileSync(path, 'utf8');
  const data = path.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw);
  const items: Array<Record<string, unknown>> = Array.isArray(data) ? data : (data?.items ?? []);
  return items.map((v, i) => {
    const text = String(v.text ?? v.description ?? '');
    return {
      id: String(v.id ?? `file-${i + 1}`),
      title: String(v.title ?? v.name ?? `Вакансия ${i + 1}`),
      company: String(v.company ?? '—'),
      url: v.url ? String(v.url) : undefined,
      prefilterText: `${v.title ?? ''} ${text}`,
      description: text || undefined,
    };
  });
}

/** Сбор вакансий из hh.ru (без детальных описаний — снимем только для top-N). */
async function collectFromHh(content: Content, args: Args): Promise<Candidate[]> {
  // Дефолтный запрос из title профиля: берём первый сегмент (title может быть
  // двуязычным/составным через «·», что для полнотекстового поиска бесполезно).
  const defaultQuery = content.profile.title[args.lang].split(/[·|/]/)[0].trim();
  const query = args.query ?? defaultQuery;
  console.log(`  Запрос к hh.ru: «${query}»${args.area ? `, регион ${args.area}` : ''}`);
  const briefs = await searchVacancies(
    { text: query, area: args.area, perPage: 100 },
    content.profile.email,
  );
  return briefs.map((b) => ({
    id: b.id,
    title: b.title,
    company: b.company,
    url: b.url,
    area: b.area,
    salary: b.salary,
    prefilterText: b.snippet,
    brief: b,
  }));
}

// ---- Этап 2: LLM-ранжирование ------------------------------------------

const RANK_SYSTEM_PROMPT = `Ты помогаешь кандидату оценить, насколько вакансии подходят его резюме.
На вход: (1) факты о кандидате и каталог его опыта; (2) список вакансий с id и описанием.
Для КАЖДОЙ вакансии верни оценку соответствия резюме: score 0–100, verdict
(strong/maybe/weak), сильные стороны (почему подходит), пробелы (чего не хватает по сравнению
с требованиями) и краткий вывод whyFit. Опирайся только на факты резюме, не преувеличивай.
Верни строго JSON по схеме, по одному элементу на каждую вакансию из входа.`;

const RankSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      verdict: z.enum(['strong', 'maybe', 'weak']),
      strengths: z.array(z.string()),
      gaps: z.array(z.string()),
      whyFit: z.string(),
    }),
  ),
});

function verdictFromScore(score: number): Verdict {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'maybe';
  return 'weak';
}

async function rankWithOpenAI(
  content: Content,
  lang: Lang,
  candidates: Candidate[],
): Promise<Map<string, z.infer<typeof RankSchema>['matches'][number]>> {
  const facts = profileFacts(content, lang);
  const vacancies = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    company: c.company,
    description: (c.description ?? c.prefilterText).slice(0, 1800),
  }));
  const user = [
    `ЯЗЫК: ${lang}`,
    '',
    'ФАКТЫ О КАНДИДАТЕ (JSON):',
    JSON.stringify(facts, null, 2),
    '',
    'КАТАЛОГ ОПЫТА (JSON):',
    JSON.stringify(catalog(content, lang), null, 2),
    '',
    'ВАКАНСИИ (JSON):',
    JSON.stringify(vacancies, null, 2),
  ].join('\n');

  const parsed = await callStructured(RANK_SYSTEM_PROMPT, user, RankSchema, 'job_matches');
  return new Map(parsed.matches.map((m) => [m.id, m]));
}

// ---- Оркестрация --------------------------------------------------------

export async function runFindJobs(content: Content, args: Args): Promise<MatchFile> {
  // Сбор
  const candidates =
    args.source === 'file' ? collectFromFile(args.file!) : await collectFromHh(content, args);
  if (candidates.length === 0) throw new Error('Не нашлось ни одной вакансии в источнике.');

  // Этап 1: дешёвый предфильтр
  const refWords = resumeWords(content, args.lang);
  const ranked = candidates
    .map((c) => ({ c, prefilterScore: keywordScore(c.prefilterText, refWords) }))
    .sort((a, b) => b.prefilterScore - a.prefilterScore)
    .slice(0, args.top);
  console.log(`  Собрано ${candidates.length}, предфильтр оставил top-${ranked.length}.`);

  // Для hh — дотягиваем полные описания только у отобранных
  for (const r of ranked) {
    if (!r.c.description && r.c.brief) {
      try {
        r.c.description = (await fetchVacancy(r.c.brief, content.profile.email)).description;
      } catch (err) {
        console.error(`  ⚠ не удалось получить описание ${r.c.id}: ${(err as Error).message}`);
      }
    }
  }

  // Этап 2: LLM-ранжирование (если есть ключ)
  let llmById: Map<string, z.infer<typeof RankSchema>['matches'][number]> | undefined;
  if (hasOpenAIKey()) {
    try {
      llmById = await rankWithOpenAI(content, args.lang, ranked.map((r) => r.c));
      console.log(`✓ LLM-ранжирование через OpenAI (${modelName()})`);
    } catch (err) {
      console.error(`⚠ LLM-ранжирование упало, оставляю эвристику: ${(err as Error).message}`);
    }
  } else {
    console.log('ℹ OPENAI_API_KEY не задан — ранжирование только эвристикой.');
  }

  const matches: Match[] = ranked.map(({ c, prefilterScore }) => {
    const llm = llmById?.get(c.id);
    const score = llm?.score ?? Math.min(100, prefilterScore * 8);
    return {
      id: c.id,
      title: c.title,
      company: c.company,
      url: c.url,
      area: c.area,
      salary: c.salary,
      prefilterScore,
      score,
      verdict: llm?.verdict ?? verdictFromScore(score),
      strengths: llm?.strengths ?? [],
      gaps: llm?.gaps ?? [],
      whyFit: llm?.whyFit ?? 'Оценка по пересечению ключевых слов (без LLM).',
      description: c.description ?? c.prefilterText,
    };
  });
  matches.sort((a, b) => b.score - a.score);

  const result: MatchFile = {
    slug: args.out,
    lang: args.lang,
    source: args.source,
    query: args.query,
    matches,
  };

  // Запись приватных артефактов
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${args.out}.json`), JSON.stringify(result, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, `${args.out}.md`), renderMatchesMd(result), 'utf8');
  return result;
}

function renderMatchesMd(file: MatchFile): string {
  const lines: string[] = [
    `# Вакансии под резюме — ${file.slug}`,
    '',
    `Источник: ${file.source}${file.query ? ` · запрос: «${file.query}»` : ''} · язык: ${file.lang}`,
    '',
  ];
  for (const m of file.matches) {
    lines.push(`## ${m.score} · ${m.verdict.toUpperCase()} — ${m.company}: ${m.title}`);
    if (m.url) lines.push(`- ${m.url}`);
    if (m.salary) lines.push(`- Зарплата: ${m.salary}`);
    if (m.area) lines.push(`- Регион: ${m.area}`);
    lines.push(`- id: \`${m.id}\``);
    if (m.whyFit) lines.push(`- Вывод: ${m.whyFit}`);
    if (m.strengths.length) lines.push(`- Сильные стороны: ${m.strengths.join('; ')}`);
    if (m.gaps.length) lines.push(`- Пробелы: ${m.gaps.join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

function printTable(file: MatchFile): void {
  console.log(`\n  score │ verdict │ компания / вакансия`);
  console.log('  ──────┼─────────┼────────────────────');
  for (const m of file.matches) {
    const score = String(m.score).padStart(5);
    const verdict = m.verdict.padEnd(7);
    console.log(`  ${score} │ ${verdict} │ ${m.company}: ${m.title}`);
    if (m.url) console.log(`        │         │ ${m.url}  (id ${m.id})`);
  }
}

/** Загружает ранее сохранённые матчи (вход для apply.ts). */
export function loadMatches(slug: string): MatchFile {
  const path = join(OUT_DIR, `${slug}.json`);
  if (!existsSync(path)) {
    throw new Error(`Нет файла матчей out/jobs/${slug}.json — сначала запусти find-jobs.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as MatchFile;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = loadContent();
  let res: MatchFile;
  try {
    res = await runFindJobs(content, args);
  } catch (err) {
    if (err instanceof HhError && err.status === 403) {
      console.error('\n✗ hh.ru закрыл доступ к поиску /vacancies (403 forbidden).');
      console.error('  Публичный поиск вакансий hh.ru теперь требует авторизации. Варианты:');
      console.error('   1) Зарегистрируй приложение на https://dev.hh.ru/ → получи OAuth-токен');
      console.error('      и положи его в .env:  HH_TOKEN=...');
      console.error('   2) Без hh: ручной источник — собери вакансии в файл и запусти');
      console.error('      npm run find-jobs -- --source file --file ./vacancies.yaml --lang ' + args.lang);
      console.error('      (формат файла — в cli/README.md)');
      console.error(`  Ответ hh: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  printTable(res);
  console.log(`\n✓ Результаты: out/jobs/${args.out}.json и out/jobs/${args.out}.md`);
  console.log(`  Дальше: выбери вакансию и запусти`);
  console.log(`  npm run apply -- --from ${args.out} --id <vacancyId> --lang ${args.lang}`);
}

if (process.argv[1] && process.argv[1].endsWith('find-jobs.ts')) {
  void main();
}
