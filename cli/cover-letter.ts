/**
 * cover-letter.ts — генерация сопроводительного письма под вакансию.
 *
 * ДВУХЭТАПНЫЙ пайплайн (plan → write):
 *   Этап 1 (analyzeVacancy) — LLM в роли Hiring Manager анализирует вакансию и
 *     строит СТРАТЕГИЮ отклика: требования, покрытие опытом, приоритизированные
 *     talking points, что подчеркнуть / чего избегать / честные пробелы. Только JSON,
 *     без текста письма. Результат сохраняется в <slug>-<lang>.plan.json (инспекция).
 *   Этап 2 (writeLetter) — LLM пишет письмо, получая ТОЛЬКО план и отобранные блоки
 *     опыта (не весь каталог) — пересказать резюме физически нечем. Код проверяет,
 *     что закрыты ВСЕ high-тезисы плана (по paragraphMap); при потере — один ретрай.
 * Между этапами — код-валидация id блоков (защита от галлюцинаций).
 * Компания берётся из --company, иначе извлекается этапом 1 из текста вакансии.
 * Если этап 1 упал/refusal — откат на одностадийный промпт (всегда даём результат).
 *
 * Письмо пишется СТРОГО по фактам резюме, без выдумок. Требует OPENAI_API_KEY (.env).
 * Результат — ревьюируемый Markdown в приватной папке out/cover-letters/ (gitignored).
 *
 * Запуск:
 *   npm run cover-letter -- --job ./vacancy.txt --lang ru --slug acme --company "Acme"
 *   npm run cover-letter -- --job "текст вакансии" --lang en --tone warm --length medium
 *   npm run cover-letter -- --job https://hh.ru/vacancy/123456 --lang ru --slug acme
 *
 * --job принимает файл, текст или ссылку на вакансию hh.ru (текст и компания
 * достаются из JSON-LD страницы, см. cli/lib/fetch-job.ts).
 * --length: short (по умолчанию — как отклик на hh) | medium | long (email/LinkedIn).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { loadContent, ROOT } from '../src/lib/load';
import { catalog, profileFacts, type ProfileFacts } from './lib/catalog';
import { callStructured, hasOpenAIKey, modelName } from './lib/llm';
import { isJobUrl, fetchJobByUrl } from './lib/fetch-job';
import type { Content, Lang } from '../src/schema/index';

export type Tone = 'formal' | 'warm';
export type Length = 'short' | 'medium' | 'long';

export interface CoverLetterArgs {
  job: string; // текст вакансии или путь к файлу
  lang: Lang;
  slug: string;
  company?: string;
  tone: Tone;
  length: Length;
}

const OUT_DIR = join(ROOT, 'out', 'cover-letters');

/** Пресеты длины: объём тела + акцент формата. Инъектируется в промпт этапа 2. */
const LENGTH_SPEC: Record<Length, { paras: string; words: string; note: string }> = {
  short: {
    paras: '1–2 коротких абзаца',
    words: '60–110 слов в теле',
    note: 'Формат отклика на hh.ru: коротко — кто ты, чем полезен именно этой вакансии (1–2 конкретных факта), приглашение обсудить. НЕ пересказывай всю карьеру и не перечисляй все места работы.',
  },
  medium: {
    paras: '2 абзаца',
    words: '120–180 слов в теле',
    note: 'Сжато, но с 2–3 релевантными фактами.',
  },
  long: {
    paras: '3–4 абзаца',
    words: '250–350 слов в теле',
    note: 'Развёрнуто — для письма по email или в LinkedIn.',
  },
};

function parseArgs(argv: string[]): CoverLetterArgs {
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
  return {
    job,
    lang: (get('--lang', 'ru') as Lang) ?? 'ru',
    slug: get('--slug', 'cover')!,
    company: get('--company'),
    tone: (get('--tone', 'formal') as Tone) ?? 'formal',
    length: (get('--length', 'short') as Length) ?? 'short',
  };
}

// ============================================================================
// Этап 1 — анализ вакансии и стратегия отклика (без текста письма)
// ============================================================================

const Coverage = z.enum(['strong', 'partial', 'none']);
const Importance = z.enum(['high', 'medium', 'low']);

const LetterPlanSchema = z.object({
  company: z
    .string()
    .nullable()
    .describe('название компании, если оно есть в тексте вакансии; null если не найдено'),
  positioningAngle: z
    .string()
    .describe('одна фраза — главный угол, под которым продаём кандидата этой роли'),
  roleAnalysis: z.object({
    mainObjectives: z.array(z.string()).describe('главные задачи роли'),
    mustHaves: z.array(z.string()).describe('обязательные требования'),
    niceToHaves: z.array(z.string()).describe('желательные требования'),
    decisionCriteria: z
      .array(z.string())
      .describe('реальные критерии, по которым примут решение о приглашении'),
  }),
  requirements: z
    .array(
      z.object({
        requirement: z.string(),
        coverage: Coverage,
        evidenceBlockIds: z.array(z.string()).describe('id блоков-доказательств; [] если none'),
      }),
    )
    .describe('покрытие каждого значимого требования опытом кандидата'),
  talkingPoints: z
    .array(
      z.object({
        claim: z.string().describe('тезис, продающий кандидата (вывод, а не пересказ пункта)'),
        addressesRequirement: z.string(),
        evidenceBlockIds: z.array(z.string()),
        importance: Importance,
      }),
    )
    .describe('3–7 приоритизированных тезисов; этап 2 возьмёт верхние под длину'),
  emphasize: z.array(z.string()).describe('сильные стороны для максимального акцента'),
  avoid: z.array(z.string()).describe('о чём НЕ писать (слабые/нерелевантные темы)'),
  honestGaps: z.array(z.string()).describe('требования, которые нельзя закрыть честно'),
});
export type LetterPlan = z.infer<typeof LetterPlanSchema>;

export const ANALYZE_SYSTEM_PROMPT = `Ты — опытный Hiring Manager / Head of Engineering, нанявший сотни Team Lead,
Engineering Manager и Head of Engineering. Ты НЕ пишешь сопроводительное письмо.
Твоя задача — построить стратегию отклика и вернуть её СТРОГО как JSON по схеме.

На вход: (1) факты о кандидате; (2) каталог блоков опыта (id + текст); (3) вакансия.

Действуй как при реальном скрининге:
0. Извлеки название компании из текста вакансии (поле company; null, если его там нет).
1. Определи, что роли действительно нужно: главные задачи, обязательные и желательные
   требования, реальные критерии решения о приглашении.
2. Для каждого значимого требования оцени покрытие опытом кандидата
   (strong/partial/none) и укажи id блоков-доказательств. Ссылайся ТОЛЬКО на
   существующие id из каталога.
3. Построй 3–7 talking points — тезисов, которые продают кандидата под эту роль.
   Тезис — это ВЫВОД («сможет быстро выстроить процессы в растущей команде»),
   подкреплённый блоками, а не пересказ пункта резюме. Отсортируй по важности.
4. Честно назови honestGaps — чего нет и что не стоит выдавать за наличие.
   Назови avoid — слабые/нерелевантные темы, размывающие позиционирование.

Принципы: приоритет силы над полнотой (лучше 3 сильных тезиса, чем 8 слабых);
никаких выдумок сверх входных данных; НЕ пиши текст письма. Только JSON по схеме.`;

function buildAnalyzePrompt(args: CoverLetterArgs, facts: ProfileFacts, content: Content): string {
  return [
    `ЯЗЫК: ${args.lang}`,
    args.company ? `КОМПАНИЯ: ${args.company}` : '',
    '',
    'ФАКТЫ О КАНДИДАТЕ (JSON):',
    JSON.stringify(facts, null, 2),
    '',
    'КАТАЛОГ БЛОКОВ ОПЫТА (JSON):',
    JSON.stringify(catalog(content, args.lang), null, 2),
    '',
    'ТЕКСТ ВАКАНСИИ:',
    args.job,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Оставляет только реально существующие id и вычисляет блоки для этапа 2. */
function sanitizePlan(
  plan: LetterPlan,
  knownIds: Set<string>,
): { plan: LetterPlan; selectedIds: string[] } {
  const keep = (ids: string[]) => ids.filter((id) => knownIds.has(id));
  const requirements = plan.requirements.map((r) => ({ ...r, evidenceBlockIds: keep(r.evidenceBlockIds) }));
  const talkingPoints = plan.talkingPoints.map((t) => ({ ...t, evidenceBlockIds: keep(t.evidenceBlockIds) }));

  const selected = new Set<string>();
  for (const t of talkingPoints) t.evidenceBlockIds.forEach((id) => selected.add(id));
  // Подстраховка: если тезисы без доказательств — берём id из требований.
  if (selected.size === 0) for (const r of requirements) r.evidenceBlockIds.forEach((id) => selected.add(id));

  return { plan: { ...plan, requirements, talkingPoints }, selectedIds: [...selected] };
}

async function analyzeVacancy(
  content: Content,
  args: CoverLetterArgs,
  facts: ProfileFacts,
): Promise<LetterPlan> {
  return callStructured(
    ANALYZE_SYSTEM_PROMPT,
    buildAnalyzePrompt(args, facts, content),
    LetterPlanSchema,
    'letter_plan',
  );
}

// ============================================================================
// Этап 2 — написание письма по плану (видит только отобранные блоки)
// ============================================================================

const CoverLetterSchema = z.object({
  greeting: z
    .string()
    .describe('приветствие — просто «Здравствуйте!» (без обращения к компании по имени)'),
  paragraphs: z
    .array(z.string())
    .describe('тело письма; число абзацев и объём — по инструкции ДЛИНА'),
  closing: z
    .string()
    .describe(
      'завершающая фраза перед подписью — БЕЗ имени, без «С уважением» и любых подписей: подпись добавляет шаблон',
    ),
  paragraphMap: z
    .array(
      z.object({
        paragraphIndex: z.number().describe('0-based индекс абзаца в paragraphs'),
        talkingPointIndices: z
          .array(z.number())
          .describe('0-based индексы тезисов plan.talkingPoints, которые закрывает абзац ([] если абзац не про тезис)'),
        addressesTalkingPoint: z.string().describe('какой тезис/требование закрывает абзац (словами)'),
      }),
    )
    .describe('self-check: каждый абзац должен закрывать тезис плана'),
  usedFacts: z
    .array(z.string())
    .describe('какие факты/id блоков реально задействованы (анти-галлюцинация)'),
  rationale: z.string().describe('1–2 предложения: на чём сделан акцент и почему'),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

export const WRITE_SYSTEM_PROMPT = `Ты пишешь от лица кандидата — сильного инженерного руководителя. Анализ вакансии
УЖЕ сделан: тебе дан готовый план (talking points, что подчеркнуть, чего избегать,
честные пробелы). НЕ анализируй вакансию заново и НЕ пересматривай отбор.

На вход: факты о кандидате; план (JSON); ТОЛЬКО отобранные блоки опыта; ДЛИНА и ТОН.

Задача — написать максимально убедительное письмо:
- ОБЯЗАН закрыть ВСЕ talking points с importance=high. Если длина не позволяет дать
  каждому свой абзац — объединяй два смежных тезиса в один абзац (одним-двумя
  предложениями каждый), но НЕ выбрасывай high-тезис;
- первое предложение — хук под главную задачу роли (из roleAnalysis.mainObjectives):
  что кандидат сделает для НИХ. ЗАПРЕЩЕНО открывать письмо автобиографией вида
  «Я инженерный руководитель с N годами опыта» — это пересказ резюме;
- возражение нанимающего снимай ТОЛЬКО если оно центральное для решения (прямо
  следует из decisionCriteria или must-have, который кандидат не закрывает) И рефрейм
  превращает его в сильную сторону. Второстепенные пробелы НЕ упоминай вовсе:
  «не обещаю X» и прочие дисклеймеры сажают читателю сомнение, которого у него
  могло не быть;
- метрики подбирай под уровень роли: для руководящих ролей (Head/CTO/EM) — результаты
  уровня бизнеса и организации (масштабирование команды, удержание, time-to-market,
  предсказуемость поставки), а операционные микро-метрики (минуты, счётчики багов)
  оставь резюме — если только вакансия не про них. Максимум 2–3 цифры на письмо;
- каждый абзац отвечает на вопрос работодателя «почему стоит пригласить именно этого
  человека»;
- опирайся ТОЛЬКО на предоставленные блоки и факты — другого материала у тебя нет;
- язык вакансии (delivery, ownership, architecture, people management и т.п.) —
  лишь там, где подтверждён блоками;
- не касайся тем из avoid; не заявляй того, что в honestGaps;
- без пересказа резюме, без канцелярита; звучи как живой человек, не как ИИ;
- название компании упоминай в теле максимум один раз (повторение в каждом абзаце
  звучит роботично); в greeting и closing — не упоминай;
- closing — только короткая фраза-приглашение к разговору, БЕЗ имени и подписи;
- строго соблюдай длину.

Верни JSON по схеме, включая paragraphMap: для каждого абзаца — индексы закрытых
тезисов plan.talkingPoints (talkingPointIndices).`;

function buildWritePrompt(
  args: CoverLetterArgs,
  facts: ProfileFacts,
  plan: LetterPlan,
  blocks: ReturnType<typeof catalog>,
): string {
  const len = LENGTH_SPEC[args.length];
  return [
    `ЯЗЫК ПИСЬМА: ${args.lang}`,
    `ТОН: ${args.tone === 'warm' ? 'тёплый, человечный' : 'деловой, сдержанный'}`,
    `ДЛИНА: ${len.paras}, ${len.words}. ${len.note}`,
    args.company ? `КОМПАНИЯ: ${args.company}` : '',
    '',
    'ФАКТЫ О КАНДИДАТЕ (JSON):',
    JSON.stringify(facts, null, 2),
    '',
    'ПЛАН ОТКЛИКА — этап 1 (JSON):',
    JSON.stringify(plan, null, 2),
    '',
    'ОТОБРАННЫЕ БЛОКИ ОПЫТА — используй только их (JSON):',
    JSON.stringify(blocks, null, 2),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Индексы high-тезисов плана, не закрытых ни одним абзацем (по paragraphMap). */
export function uncoveredHighPoints(plan: LetterPlan, letter: CoverLetter): number[] {
  const covered = new Set(letter.paragraphMap.flatMap((p) => p.talkingPointIndices));
  return plan.talkingPoints
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => t.importance === 'high' && !covered.has(i))
    .map(({ i }) => i);
}

export async function writeLetter(
  content: Content,
  args: CoverLetterArgs,
  facts: ProfileFacts,
  plan: LetterPlan,
  selectedIds: string[],
): Promise<CoverLetter> {
  const all = catalog(content, args.lang);
  // Этап 2 видит только отобранные блоки. Если план не выбрал ни одного — даём весь
  // каталог (безопасный дегрейд, чтобы письмо не осталось без фактуры).
  const blocks = selectedIds.length ? all.filter((b) => selectedIds.includes(b.id)) : all;
  const basePrompt = buildWritePrompt(args, facts, plan, blocks);

  let letter = await callStructured(WRITE_SYSTEM_PROMPT, basePrompt, CoverLetterSchema, 'cover_letter');

  // Enforce: все high-тезисы плана должны быть закрыты. Один ретрай с перечнем потерь —
  // paragraphMap заполняет модель, поэтому проверка сообщает и о честных пропусках,
  // и о незадекларированных абзацах (последние ретраем не чиним — не отличить).
  const missing = uncoveredHighPoints(plan, letter);
  if (missing.length > 0) {
    console.error(
      `⚠ Письмо не закрыло high-тезисы [${missing.join(', ')}] — повторная попытка.`,
    );
    const retryPrompt = [
      basePrompt,
      '',
      'ПРЕДЫДУЩАЯ ПОПЫТКА ОТКЛОНЕНА: не закрыты обязательные (importance=high) тезисы плана:',
      ...missing.map((i) => `- [${i}] ${plan.talkingPoints[i].claim}`),
      'Перепиши письмо так, чтобы КАЖДЫЙ из них был закрыт (объединяй тезисы в абзацах, если не хватает длины).',
    ].join('\n');
    const retry = await callStructured(WRITE_SYSTEM_PROMPT, retryPrompt, CoverLetterSchema, 'cover_letter');
    if (uncoveredHighPoints(plan, retry).length < missing.length) letter = retry;
  }
  return letter;
}

// ============================================================================
// Fallback — одностадийная генерация (если этап 1 недоступен)
// ============================================================================

export const FALLBACK_SYSTEM_PROMPT = `Ты выступаешь как опытный Hiring Manager / Head of Engineering, который нанял сотни
Team Lead, Engineering Manager, Head of Engineering и CTO. Твоя задача — максимизировать
вероятность приглашения кандидата на интервью.

На вход: (1) факты о кандидате; (2) каталог блоков опыта (id + текст); (3) вакансия;
(4) ДЛИНА и ТОН.

Мысленно: определи главные задачи и боли работодателя; выдели 3–5 требований, реально
влияющих на решение; выбери только блоки, лучше всего их подтверждающие. Отсутствующий
опыт не компенсируй выдумками.

Письмо: не пересказывай резюме и не перечисляй все места работы; каждый абзац отвечает
на «почему именно этого человека стоит пригласить»; язык вакансии — только где подтверждён
фактами; акцент на влиянии на бизнес, масштабе и результатах, а не на списке технологий;
лучше 1–3 сильных факта, чем десять слабых; держи длину.

ЖЁСТКОЕ правило: используй ТОЛЬКО факты из входных данных, ничего не выдумывай (ни цифр,
ни компаний, ни технологий, ни достижений). Стиль — уверенный, без канцелярита; должно
звучать как письмо сильного инженерного руководителя, не как ИИ. Верни JSON по схеме.`;

function buildFallbackPrompt(args: CoverLetterArgs, facts: ProfileFacts, content: Content): string {
  const len = LENGTH_SPEC[args.length];
  return [
    `ЯЗЫК ПИСЬМА: ${args.lang}`,
    `ТОН: ${args.tone === 'warm' ? 'тёплый, человечный' : 'деловой, сдержанный'}`,
    `ДЛИНА: ${len.paras}, ${len.words}. ${len.note}`,
    args.company ? `КОМПАНИЯ: ${args.company}` : '',
    '',
    'ФАКТЫ О КАНДИДАТЕ (JSON):',
    JSON.stringify(facts, null, 2),
    '',
    'КАТАЛОГ БЛОКОВ ОПЫТА (JSON):',
    JSON.stringify(catalog(content, args.lang), null, 2),
    '',
    'ТЕКСТ ВАКАНСИИ:',
    args.job,
  ]
    .filter(Boolean)
    .join('\n');
}

// ============================================================================
// Рендер + оркестрация
// ============================================================================

/** Собирает Markdown письма: тело от модели + подпись из профиля. */
export function renderMarkdown(letter: CoverLetter, facts: ProfileFacts, args: CoverLetterArgs): string {
  const heading = args.company
    ? `# Сопроводительное письмо — ${args.company}`
    : `# Сопроводительное письмо — ${args.slug}`;
  // Подпись масштабируется под длину: для короткого hh-отклика не вываливаем все
  // контакты (профиль и так виден работодателю), для email/LinkedIn — полная.
  const signature =
    args.length === 'short'
      ? [`— **${facts.name}**  `, facts.email ? facts.email : ''].filter(Boolean)
      : [
          '—  ',
          `**${facts.name}**  `,
          `${facts.title}  `,
          facts.email ? `${facts.email}  ` : '',
          ...facts.links.map((l) => `${l.label}: ${l.url}  `),
        ].filter(Boolean);

  return [
    heading,
    '',
    letter.greeting,
    '',
    ...letter.paragraphs.flatMap((p) => [p, '']),
    letter.closing,
    '',
    signature.join('\n'),
    '',
  ].join('\n');
}

export interface CoverLetterResult {
  outPath: string;
  planPath?: string;
  letter: CoverLetter;
  plan?: LetterPlan;
  source: 'two-stage' | 'fallback';
}

/** Ядро генерации письма (двухэтапно, с откатом). Бросает, если нет ключа OpenAI. */
export async function runCoverLetter(
  content: Content,
  args: CoverLetterArgs,
): Promise<CoverLetterResult> {
  if (!hasOpenAIKey()) {
    throw new Error(
      'Для генерации письма нужен OPENAI_API_KEY в .env (см. cli/lib/llm.ts). ' +
        'Это ключ OpenAI API, не подписка ChatGPT.',
    );
  }
  const facts = profileFacts(content, args.lang);
  const knownIds = new Set(catalog(content, args.lang).map((b) => b.id));

  let letter: CoverLetter;
  let plan: LetterPlan | undefined;
  let source: CoverLetterResult['source'] = 'two-stage';

  try {
    const raw = await analyzeVacancy(content, args, facts);
    const sanitized = sanitizePlan(raw, knownIds);
    plan = sanitized.plan;
    // Компания: явный --company важнее; иначе — извлечённая этапом 1 из вакансии.
    if (!args.company && plan.company) args = { ...args, company: plan.company };
    letter = await writeLetter(content, args, facts, plan, sanitized.selectedIds);
  } catch (err) {
    console.error(
      `⚠ Двухэтапный режим не сработал (${(err as Error).message}); откат на одностадийный.`,
    );
    source = 'fallback';
    plan = undefined;
    letter = await callStructured(
      FALLBACK_SYSTEM_PROMPT,
      buildFallbackPrompt(args, facts, content),
      CoverLetterSchema,
      'cover_letter',
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${args.slug}-${args.lang}.md`);
  writeFileSync(outPath, renderMarkdown(letter, facts, args), 'utf8');

  let planPath: string | undefined;
  if (plan) {
    planPath = join(OUT_DIR, `${args.slug}-${args.lang}.plan.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  }
  return { outPath, planPath, letter, plan, source };
}

function rel(abs: string): string {
  const i = abs.indexOf('/out/');
  return i >= 0 ? abs.slice(i + 1) : abs;
}

async function main() {
  let args = parseArgs(process.argv.slice(2));
  const content = loadContent();
  try {
    // --job со ссылкой: скачиваем вакансию (пока только hh.ru) до генерации.
    if (isJobUrl(args.job)) {
      const fetched = await fetchJobByUrl(args.job);
      console.log(`✓ Вакансия с hh: «${fetched.title}»${fetched.company ? ` — ${fetched.company}` : ''}`);
      args = { ...args, job: fetched.text, company: args.company ?? fetched.company };
    }
    const res = await runCoverLetter(content, args);
    const mode = res.source === 'two-stage' ? 'двухэтапно' : 'одностадийно (fallback)';
    console.log(`✓ Письмо сгенерировано через OpenAI (${modelName()}, ${mode})`);
    console.log(`  Файл: ${rel(res.outPath)}`);
    if (res.plan) {
      console.log(`  План: ${rel(res.planPath!)}`);
      console.log(`  Угол: ${res.plan.positioningAngle}`);
      if (res.plan.honestGaps.length) console.log(`  Честные пробелы: ${res.plan.honestGaps.join('; ')}`);
    }
    console.log(`  Задействованы факты: ${res.letter.usedFacts.join(', ')}`);
    console.log('  Дальше: отревьюй письмо перед отправкой.');
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('cover-letter.ts')) {
  void main();
}
