/**
 * tailor.ts — подбор «идеального резюме под вакансию».
 *
 * СТАТУС: рабочий каркас с подключённым LLM-шагом (OpenAI).
 *   - Если задан OPENAI_API_KEY (.env) — смысловой подбор через OpenAI:
 *     модель сама выбирает релевантные блоки и переформулирует summary.
 *   - Если ключа нет (или вызов упал) — откат на эвристику пересечения
 *     ключевых слов/доменов. То есть скрипт всегда даёт результат.
 *
 * Human-in-the-loop: скрипт ПИШЕТ предложенный target в targets/tailored-<slug>.yaml,
 * который ты ревьюишь и правишь перед сборкой. Он не публикует ничего сам.
 * Переформулировка summary и обоснование пишутся КОММЕНТАРИЯМИ в шапке YAML —
 * это подсказка для ручной правки content/summary, а не автоматическая подмена.
 *
 * Настройка LLM: см. cli/lib/llm.ts (OPENAI_API_KEY/OPENAI_MODEL в .env).
 *
 * Запуск:
 *   npm run tailor -- --job ./vacancy.txt --lang ru --system general --slug acme-backend
 *   npm run tailor -- --job "текст вакансии прямо в аргументе" --lang en
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as toYaml } from 'yaml';
import { z } from 'zod';
import { loadContent, TARGETS_DIR } from '../src/lib/load';
import { catalog, words, keywordScore } from './lib/catalog';
import { callStructured, hasOpenAIKey, modelName } from './lib/llm';
import type { Content, Lang } from '../src/schema/index';

export interface TailorArgs {
  job: string; // текст вакансии или путь к файлу
  lang: Lang;
  system: string;
  slug: string;
}

function parseArgs(argv: string[]): TailorArgs {
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const jobArg = get('--job');
  if (!jobArg) {
    console.error('Укажи вакансию: --job <файл|текст>');
    process.exit(1);
  }
  const job = existsSync(jobArg) ? readFileSync(jobArg, 'utf8') : jobArg;
  const lang = (get('--lang', 'ru') as Lang) ?? 'ru';
  return {
    job,
    lang,
    system: get('--system', 'general')!,
    slug: get('--slug', 'tailored')!,
  };
}

/**
 * Эвристика-фолбэк: считает пересечение слов вакансии со словами блока.
 * Возвращает id блоков, отсортированные по релевантности.
 */
function proposeHeuristic(content: Content, args: TailorArgs): string[] {
  const jobWords = words(args.job);
  return catalog(content, args.lang)
    .map((b) => ({ id: b.id, score: keywordScore(b.text, jobWords) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.id);
}

/** Системный промпт LLM-шага (провайдеро-независим). */
export const TAILOR_SYSTEM_PROMPT = `Ты помогаешь подобрать резюме под конкретную вакансию.
На вход: (1) структурированный каталог блоков резюме кандидата с id, тегами и текстом;
(2) текст вакансии. Задача: выбрать наиболее релевантные блоки, ранжировать их по убыванию
важности для этой вакансии, и предложить переформулировку summary под её акценты — СТРОГО на
основе фактов из каталога, НЕ выдумывая того, чего там нет. Используй только id, реально
присутствующие в каталоге. Верни строго JSON по заданной схеме.`;

/** Схема ответа LLM (Structured Outputs). */
const TailorOutputSchema = z.object({
  includeIds: z
    .array(z.string())
    .describe('id блоков из каталога, релевантных вакансии, в порядке убывания важности'),
  summaryRewrite: z
    .string()
    .describe('переформулированный summary на языке резюме, только по фактам каталога'),
  rationale: z.string().describe('1–3 предложения: почему такой отбор и акценты'),
});
type TailorOutput = z.infer<typeof TailorOutputSchema>;

/** Собирает пользовательский промпт из каталога и текста вакансии. */
function buildUserPrompt(
  blocks: ReturnType<typeof catalog>,
  job: string,
  lang: Lang,
): string {
  return [
    `ЯЗЫК РЕЗЮМЕ: ${lang}`,
    '',
    'КАТАЛОГ БЛОКОВ (JSON):',
    JSON.stringify(blocks, null, 2),
    '',
    'ТЕКСТ ВАКАНСИИ:',
    job,
  ].join('\n');
}

/** LLM-шаг через OpenAI: возвращает отбор/ранжирование/переформулировку summary. */
async function tailorWithOpenAI(content: Content, args: TailorArgs): Promise<TailorOutput> {
  const blocks = catalog(content, args.lang);
  const parsed = await callStructured(
    TAILOR_SYSTEM_PROMPT,
    buildUserPrompt(blocks, args.job, args.lang),
    TailorOutputSchema,
    'tailor',
  );
  // Защита от галлюцинированных id: оставляем только реально существующие.
  const known = new Set(blocks.map((b) => b.id));
  parsed.includeIds = parsed.includeIds.filter((id) => known.has(id));
  return parsed;
}

export interface TailorResult {
  outPath: string;
  includeIds: string[];
  source: 'llm' | 'heuristic';
  llm?: TailorOutput;
}

/**
 * Ядро подбора: отбирает блоки (LLM или эвристика) и пишет targets/tailored-<slug>.yaml.
 * Используется из CLI (main) и из apply.ts. Печать оставлена вызывающему.
 */
export async function runTailor(content: Content, args: TailorArgs): Promise<TailorResult> {
  let includeIds: string[] | undefined;
  let llm: TailorOutput | undefined;

  if (hasOpenAIKey()) {
    try {
      llm = await tailorWithOpenAI(content, args);
      includeIds = llm.includeIds;
    } catch (err) {
      console.error(`⚠ LLM-шаг (tailor) упал, откатываюсь на эвристику: ${(err as Error).message}`);
    }
  }
  if (!includeIds) includeIds = proposeHeuristic(content, args);

  const target = {
    id: `tailored-${args.slug}`,
    label: { ru: `Под вакансию: ${args.slug}`, en: `Tailored: ${args.slug}` },
    languages: [args.lang],
    system: args.system,
    audience: 'hr',
    layout: 'rich',
    formats: ['html', 'pdf', 'md'],
    sections: ['summary', 'experience', 'projects', 'skills', 'education'],
    select: { includeIds },
  };

  const outPath = join(TARGETS_DIR, `tailored-${args.slug}.yaml`);
  const source: 'llm' | 'heuristic' = llm ? 'llm' : 'heuristic';
  const label = llm ? `LLM (OpenAI ${modelName()})` : 'эвристика';
  let header =
    `# Сгенерировано scripts/tailor.ts (${label}). ОТРЕВЬЮЙ и поправь перед сборкой.\n` +
    '# includeIds — блоки, отобранные по релевантности вакансии (порядок = важность).\n';
  if (llm) {
    const comment = (s: string) => s.split('\n').map((l) => `#   ${l}`.trimEnd()).join('\n');
    header +=
      '#\n# Обоснование отбора:\n' +
      comment(llm.rationale) +
      '\n#\n# Предложенная переформулировка summary (перенеси вручную в content/summary):\n' +
      comment(llm.summaryRewrite) +
      '\n';
  }
  writeFileSync(outPath, header + toYaml(target), 'utf8');

  return { outPath, includeIds, source, llm };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = loadContent();

  if (!hasOpenAIKey()) {
    console.log('ℹ OPENAI_API_KEY не задан — использую эвристику.');
    console.log('  Добавь ключ в .env для смыслового подбора (см. cli/lib/llm.ts).');
  }

  const res = await runTailor(content, args);

  if (res.source === 'llm') console.log(`✓ Смысловой подбор через OpenAI (${modelName()})`);
  if (res.includeIds.length === 0) {
    console.log('⚠ Ни один блок не отобран. Проверь текст вакансии и каталог.');
  }
  console.log(`✓ Предложенный target записан: targets/tailored-${args.slug}.yaml`);
  console.log(`  Отобрано блоков: ${res.includeIds.length} [${res.includeIds.join(', ')}]`);
  console.log('  Дальше: проверь файл, затем `npm run build && npm run build:all`.');
}

// Запускаем CLI только при прямом вызове, не при импорте из apply.ts.
if (process.argv[1] && process.argv[1].endsWith('tailor.ts')) {
  void main();
}
