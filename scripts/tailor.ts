/**
 * tailor.ts — подбор «идеального резюме под вакансию».
 *
 * СТАТУС: рабочий каркас. Сейчас работает БЕЗ вызова LLM — использует простую
 * эвристику пересечения ключевых слов/доменов, чтобы предложить target-профиль
 * (какие блоки включить, какой summary взять). Это даёт сразу полезный результат
 * и фиксирует контракт, в который позже встанет LLM.
 *
 * БУДУЩИЙ ШАГ (LLM): заменить `proposeHeuristic` на вызов Claude — см.
 * `tailorWithClaude` ниже (референс-реализация, требует `@anthropic-ai/sdk` и
 * ANTHROPIC_API_KEY в .env). Модель по умолчанию: claude-opus-4-8.
 *
 * Human-in-the-loop: скрипт ПИШЕТ предложенный target в targets/tailored-<slug>.yaml,
 * который ты ревьюишь и правишь перед сборкой. Он не публикует ничего сам.
 *
 * Запуск:
 *   npm run tailor -- --job ./vacancy.txt --lang ru --system general --slug acme-backend
 *   npm run tailor -- --job "текст вакансии прямо в аргументе" --lang en
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as toYaml } from 'yaml';
import { loadContent, TARGETS_DIR } from '../src/lib/load';
import type { Content, Lang } from '../src/schema/index';

interface Args {
  job: string; // текст вакансии или путь к файлу
  lang: Lang;
  system: string;
  slug: string;
}

function parseArgs(argv: string[]): Args {
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

/** Плоский каталог блоков с их id, тегами и текстом — вход для отбора. */
function catalog(content: Content, lang: Lang) {
  const blocks: { id: string; kind: string; text: string; domains: string[] }[] = [];
  for (const e of content.experience) {
    const flat = e.highlights.map((h) => h.text[lang]);
    const grouped = e.groups.flatMap((g) => g.highlights.map((h) => h.text[lang]));
    blocks.push({
      id: e.id,
      kind: 'experience',
      text: `${e.role[lang]} ${e.stack.join(' ')} ${[...flat, ...grouped].join(' ')}`,
      domains: e.tags.domains ?? [],
    });
  }
  for (const p of content.projects)
    blocks.push({
      id: p.id,
      kind: 'project',
      text: `${p.name[lang]} ${p.description[lang]} ${p.stack.join(' ')}`,
      domains: p.tags.domains ?? [],
    });
  return blocks;
}

/**
 * Эвристика-заглушка: считает пересечение слов вакансии со словами блока.
 * Возвращает блоки, отсортированные по релевантности (для includeIds/порядка).
 */
function proposeHeuristic(content: Content, args: Args): string[] {
  const jobWords = new Set(
    args.job
      .toLowerCase()
      .split(/[^a-zа-я0-9+#.]+/i)
      .filter((w) => w.length > 2),
  );
  const scored = catalog(content, args.lang).map((b) => {
    const words = b.text.toLowerCase().split(/[^a-zа-я0-9+#.]+/i);
    const score = words.filter((w) => jobWords.has(w)).length;
    return { id: b.id, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.id);
}

/** Системный промпт для будущего LLM-шага (см. tailorWithClaude). */
export const TAILOR_SYSTEM_PROMPT = `Ты помогаешь подобрать резюме под конкретную вакансию.
На вход: (1) структурированный каталог блоков резюме кандидата с id, тегами и текстом;
(2) текст вакансии. Задача: выбрать наиболее релевантные блоки, ранжировать их,
и предложить переформулировку summary под акценты вакансии — НЕ выдумывая фактов,
которых нет в каталоге. Верни строго JSON по схеме.`;

/**
 * РЕФЕРЕНС-РЕАЛИЗАЦИЯ LLM-шага (пока не подключена).
 * Чтобы включить: `npm i @anthropic-ai/sdk`, положить ANTHROPIC_API_KEY в .env,
 * раскомментировать и вызвать вместо proposeHeuristic.
 *
 *   import Anthropic from '@anthropic-ai/sdk';
 *   const client = new Anthropic();
 *   const resp = await client.messages.create({
 *     model: 'claude-opus-4-8',
 *     max_tokens: 4000,
 *     thinking: { type: 'adaptive' },
 *     system: TAILOR_SYSTEM_PROMPT,
 *     output_config: { format: { type: 'json_schema', schema: TAILOR_SCHEMA } },
 *     messages: [{ role: 'user', content: buildUserPrompt(catalog, job) }],
 *   });
 *   // -> { includeIds: string[], order: string[], summaryRewrite: {ru,en} }
 *
 * Результат маппится в тот же target-конфиг, что и эвристика ниже.
 */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = loadContent();
  const includeIds = proposeHeuristic(content, args);

  if (includeIds.length === 0) {
    console.log('⚠ Ни один блок не пересёкся с вакансией по ключевым словам.');
    console.log('  Подключи LLM-шаг (tailorWithClaude) для смыслового подбора.');
  }

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

  const out = join(TARGETS_DIR, `tailored-${args.slug}.yaml`);
  const header =
    '# Сгенерировано scripts/tailor.ts (эвристика). ОТРЕВЬЮЙ и поправь перед сборкой.\n' +
    '# includeIds — блоки, отобранные по релевантности вакансии.\n';
  writeFileSync(out, header + toYaml(target), 'utf8');

  console.log(`✓ Предложенный target записан: targets/tailored-${args.slug}.yaml`);
  console.log(`  Отобрано блоков: ${includeIds.length} [${includeIds.join(', ')}]`);
  console.log('  Дальше: проверь файл, затем `npm run build && npm run build:all`.');
}

main();
