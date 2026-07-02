/**
 * apply.ts — связка «поиск → отклик»: по выбранной из find-jobs вакансии запускает
 * подбор резюме (tailor) и генерацию сопроводительного письма (cover-letter).
 *
 * Запуск (id берётся из вывода find-jobs / out/jobs/<from>.json):
 *   npm run apply -- --from hh-lead --id 12345678 --lang ru
 *
 * Результат:
 *   targets/tailored-<slug>.yaml          — подобранный вариант резюме (gitignored)
 *   out/cover-letters/<slug>-<lang>.md    — письмо (требует OPENAI_API_KEY)
 * Оба артефакта — ревьюируемые черновики; проверь перед отправкой.
 */
import { loadContent } from '../src/lib/load';
import { loadMatches } from './find-jobs';
import { runTailor } from './tailor';
import { runCoverLetter } from './cover-letter';
import type { Lang } from '../src/schema/index';

interface Args {
  from: string;
  id: string;
  lang?: Lang;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const from = get('--from');
  const id = get('--id');
  if (!from || !id) {
    console.error('Использование: npm run apply -- --from <jobs-slug> --id <vacancyId> [--lang ru|en]');
    process.exit(1);
  }
  return { from, id, lang: get('--lang') as Lang | undefined };
}

/** Безопасный slug из строки: латиница/цифры/дефис. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = loadMatches(args.from);
  const match = file.matches.find((m) => m.id === args.id);
  if (!match) {
    console.error(`✗ Вакансия с id «${args.id}» не найдена в out/jobs/${args.from}.json.`);
    console.error(`  Доступные id: ${file.matches.map((m) => m.id).join(', ')}`);
    process.exit(1);
  }

  const lang = args.lang ?? file.lang;
  const slug = `${slugify(match.company)}-${args.id}`.replace(/-+/g, '-');
  const content = loadContent();

  console.log(`▶ Откликаемся на: ${match.company} — ${match.title} (${lang})`);

  const tailor = await runTailor(content, {
    job: match.description,
    lang,
    system: 'general',
    slug,
  });
  console.log(
    `✓ Резюме подобрано (${tailor.source}): targets/tailored-${slug}.yaml ` +
      `[${tailor.includeIds.join(', ')}]`,
  );

  try {
    const cover = await runCoverLetter(content, {
      job: match.description,
      lang,
      slug,
      company: match.company,
      tone: 'formal',
      length: 'short', // отклик из find-jobs обычно на hh — короткий формат
    });
    console.log(`✓ Письмо: ${relativeOut(cover.outPath)}`);
  } catch (err) {
    console.error(`⚠ Письмо не сгенерировано: ${(err as Error).message}`);
  }

  console.log('\n  Дальше: отревьюй target и письмо, затем `npm run build && npm run build:all`.');
}

function relativeOut(abs: string): string {
  const i = abs.indexOf('/out/');
  return i >= 0 ? abs.slice(i + 1) : abs;
}

void main();
