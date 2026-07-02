/**
 * cover-letter.ts — генерация сопроводительного письма под вакансию.
 *
 * Письмо пишется СТРОГО по фактам резюме (профиль + каталог блоков), без выдумок.
 * Требует OPENAI_API_KEY (.env) — без LLM письмо не генерируется. Результат —
 * ревьюируемый Markdown в приватной папке out/cover-letters/ (gitignored).
 *
 * Запуск:
 *   npm run cover-letter -- --job ./vacancy.txt --lang ru --slug acme --company "Acme"
 *   npm run cover-letter -- --job "текст вакансии" --lang en --tone warm --length medium
 *
 * --length: short (по умолчанию — как отклик на hh) | medium | long (email/LinkedIn).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { loadContent, ROOT } from '../src/lib/load';
import { catalog, profileFacts, type ProfileFacts } from './lib/catalog';
import { callStructured, hasOpenAIKey, modelName } from './lib/llm';
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

/** Пресеты длины: объём тела + акцент формата. Инъектируется в промпт. */
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

export const COVER_LETTER_SYSTEM_PROMPT = `
Ты выступаешь как опытный Hiring Manager / Head of Engineering, который нанял сотни Team Lead, Engineering Manager, Head of Engineering и CTO.

Твоя задача — не просто написать сопроводительное письмо, а максимизировать вероятность приглашения кандидата на интервью.

На вход подаются:
1. Факты о кандидате (имя, текущая должность, summary, ключевые компетенции).
2. Каталог блоков опыта с id и текстом.
3. Текст вакансии.
4. Требуемая ДЛИНА письма.

Перед генерацией письма мысленно выполни следующие шаги:

- Определи главные задачи и боли работодателя.
- Выдели 3–5 требований, которые действительно влияют на решение о приглашении.
- Выбери только те блоки опыта кандидата, которые лучше всего подтверждают соответствие этим требованиям.
- Если какой-то опыт отсутствует, не пытайся его компенсировать выдумками. Лучше покажи, почему близкий опыт позволяет быстро закрыть этот пробел.

При написании письма:

- Не пересказывай резюме.
- Не перечисляй все места работы.
- Каждый абзац должен отвечать на вопрос работодателя: "Почему именно этого человека стоит пригласить?"
- Используй язык вакансии (delivery, ownership, architecture, engineering metrics, platform, people management и т.д.), но только если это подтверждается фактами кандидата.
- Делай акцент на влиянии на бизнес, масштабе ответственности, лидерстве и достигнутых результатах, а не на перечислении технологий.
- Лучше использовать 1–3 сильных факта, чем перечислить десять слабых.
- Если предложение не увеличивает вероятность приглашения на интервью — не включай его.
- Придерживайся заданной длины письма.

ЖЁСТКОЕ правило:
Используй ТОЛЬКО факты из входных данных.
Не выдумывай цифры, технологии, компании, достижения или обязанности.

Стиль:
- уверенный, спокойный, профессиональный;
- без канцелярита, штампов и излишней эмоциональности;
- письмо должно звучать так, как будто его написал сильный инженерный руководитель, а не ИИ.

Верни строго JSON по заданной схеме.
`

const CoverLetterSchema = z.object({
  greeting: z.string().describe('приветствие, напр. «Здравствуйте!» или с именем компании'),
  paragraphs: z
    .array(z.string())
    .describe('тело письма по фактам резюме; число абзацев и объём — по инструкции ДЛИНА'),
  closing: z.string().describe('завершающая фраза перед подписью'),
  usedFacts: z
    .array(z.string())
    .describe('какие факты/id блоков из входа реально задействованы (анти-галлюцинация)'),
  rationale: z.string().describe('1–2 предложения: на чём сделан акцент и почему'),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

function buildUserPrompt(args: CoverLetterArgs, facts: ProfileFacts, content: Content): string {
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

/** Собирает Markdown письма: тело от модели + подпись из профиля. */
function renderMarkdown(letter: CoverLetter, facts: ProfileFacts, args: CoverLetterArgs): string {
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
  letter: CoverLetter;
}

/** Ядро генерации письма. Бросает, если нет ключа OpenAI. */
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
  const letter = await callStructured(
    COVER_LETTER_SYSTEM_PROMPT,
    buildUserPrompt(args, facts, content),
    CoverLetterSchema,
    'cover_letter',
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${args.slug}-${args.lang}.md`);
  writeFileSync(outPath, renderMarkdown(letter, facts, args), 'utf8');
  return { outPath, letter };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = loadContent();
  try {
    const res = await runCoverLetter(content, args);
    console.log(`✓ Письмо сгенерировано через OpenAI (${modelName()})`);
    console.log(`  Файл: out/cover-letters/${args.slug}-${args.lang}.md`);
    console.log(`  Акцент: ${res.letter.rationale}`);
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
