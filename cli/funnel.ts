/**
 * funnel.ts — учёт воронки откликов (ПРИВАТНО: out/funnel.yaml, папка out/ в .gitignore).
 *
 * Зачем: единственный способ узнать, что реально конвертит (канал, резюме, письмо),
 * — считать этапы. Через 3–4 недели статистика покажет, где чинить: нет просмотров →
 * заголовок/зарплата; просмотры без скринингов → содержание; скрининги без офферов —
 * не резюме.
 *
 * Команды:
 *   npm run funnel -- add --url https://hh.ru/vacancy/123 --resume hh --channel hh
 *       (для hh-ссылок название/компания подтянутся сами; иначе --title/--company)
 *   npm run funnel -- add --title "Head of Engineering" --company Acme --resume hh-head --channel referral --letter acme
 *   npm run funnel -- set 3 --status viewed          # applied|viewed|screening|interview|offer|rejected|silence|withdrawn
 *   npm run funnel -- set 3 --status rejected --note "автоотказ за 2 минуты"
 *   npm run funnel -- list [--status applied]
 *   npm run funnel -- stats
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { z } from 'zod';
import { ROOT } from '../src/lib/load';
import { isJobUrl, fetchJobByUrl } from './lib/fetch-job';

const FILE = join(ROOT, 'out', 'funnel.yaml');

export const STATUSES = [
  'applied', // откликнулся
  'viewed', // просмотрели резюме
  'screening', // позвали на скрининг/звонок
  'interview', // техническое/финальное интервью
  'offer', // оффер
  'rejected', // отказ
  'silence', // тишина (закрыл сам по таймауту)
  'withdrawn', // отозвал отклик сам
] as const;
export type Status = (typeof STATUSES)[number];

/** Этапы «положительного» продвижения — для конверсий в stats. */
const PROGRESS: Status[] = ['viewed', 'screening', 'interview', 'offer'];

const Entry = z.object({
  id: z.number(),
  date: z.string(), // YYYY-MM-DD отклика
  title: z.string(),
  company: z.string().default(''),
  url: z.string().optional(),
  /** Каким резюме откликнулся: id target'а (hh, hh-head, hh-teamlead, hh-fullstack) или свободный текст. */
  resume: z.string(),
  /** Канал: hh | getmatch | referral | telegram | direct | ... */
  channel: z.string(),
  /** Slug сопроводительного письма (out/cover-letters/<slug>-*.md), если было. */
  letter: z.string().optional(),
  status: z.enum(STATUSES),
  history: z.array(z.object({ date: z.string(), status: z.enum(STATUSES) })).default([]),
  note: z.string().optional(),
});
export type FunnelEntry = z.infer<typeof Entry>;
const FunnelFile = z.object({ entries: z.array(Entry).default([]) });

function load(): FunnelEntry[] {
  if (!existsSync(FILE)) return [];
  return FunnelFile.parse(parseYaml(readFileSync(FILE, 'utf8')) ?? {}).entries;
}

function save(entries: FunnelEntry[]): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, toYaml({ entries }), 'utf8');
}

const today = () => new Date().toISOString().slice(0, 10);

function getFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
}

// ---- add ------------------------------------------------------------------

async function cmdAdd(argv: string[]): Promise<void> {
  const url = getFlag(argv, '--url');
  let title = getFlag(argv, '--title');
  let company = getFlag(argv, '--company');
  const resume = getFlag(argv, '--resume');
  const channel = getFlag(argv, '--channel') ?? (url?.includes('hh.ru') ? 'hh' : undefined);

  if (url && isJobUrl(url) && (!title || !company)) {
    try {
      const job = await fetchJobByUrl(url);
      title = title ?? job.title;
      company = company ?? job.company;
    } catch (err) {
      console.error(`⚠ Не смог подтянуть вакансию по URL (${(err as Error).message})`);
    }
  }
  if (!title || !resume || !channel) {
    console.error(
      'Нужны: --title (или hh --url), --resume <target-id>, --channel <hh|getmatch|referral|...>',
    );
    process.exit(1);
  }

  const entries = load();
  const id = entries.length ? Math.max(...entries.map((e) => e.id)) + 1 : 1;
  const entry: FunnelEntry = {
    id,
    date: today(),
    title,
    company: company ?? '',
    url,
    resume,
    channel,
    letter: getFlag(argv, '--letter'),
    status: 'applied',
    history: [{ date: today(), status: 'applied' }],
    note: getFlag(argv, '--note'),
  };
  save([...entries, entry]);
  console.log(`✓ #${id} ${entry.title}${entry.company ? ` — ${entry.company}` : ''} [${entry.resume} · ${entry.channel}]`);
}

// ---- set ------------------------------------------------------------------

function cmdSet(argv: string[]): void {
  const id = Number(argv[0]);
  const status = getFlag(argv, '--status') as Status | undefined;
  const note = getFlag(argv, '--note');
  if (!Number.isInteger(id) || (!status && !note)) {
    console.error('Формат: set <id> --status <статус> [--note "..."]');
    process.exit(1);
  }
  if (status && !STATUSES.includes(status)) {
    console.error(`Неизвестный статус «${status}». Допустимые: ${STATUSES.join(', ')}`);
    process.exit(1);
  }
  const entries = load();
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    console.error(`Запись #${id} не найдена (см. npm run funnel -- list).`);
    process.exit(1);
  }
  if (status && status !== entry.status) {
    entry.status = status;
    entry.history.push({ date: today(), status });
  }
  if (note) entry.note = note;
  save(entries);
  console.log(`✓ #${id} → ${entry.status}${note ? ` («${note}»)` : ''}`);
}

// ---- list -----------------------------------------------------------------

function cmdList(argv: string[]): void {
  const filter = getFlag(argv, '--status');
  const entries = load().filter((e) => !filter || e.status === filter);
  if (!entries.length) {
    console.log(filter ? `Нет записей со статусом «${filter}».` : 'Воронка пуста — добавь первый отклик: npm run funnel -- add …');
    return;
  }
  for (const e of entries) {
    const co = e.company ? ` — ${e.company}` : '';
    console.log(
      `#${e.id}\t${e.date}\t[${e.status}]\t${e.title}${co}\t(${e.resume} · ${e.channel}${e.letter ? ' · письмо' : ''})`,
    );
    if (e.note) console.log(`\t\t${e.note}`);
  }
}

// ---- stats ----------------------------------------------------------------

/** Дошла ли запись хотя бы до этапа `stage` (по истории, не по текущему статусу). */
export function reached(e: FunnelEntry, stage: Status): boolean {
  const idx = PROGRESS.indexOf(stage);
  return e.history.some((h) => PROGRESS.indexOf(h.status) >= idx && PROGRESS.includes(h.status));
}

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');

function cmdStats(): void {
  const entries = load();
  if (!entries.length) {
    console.log('Воронка пуста.');
    return;
  }
  const total = entries.length;
  const viewed = entries.filter((e) => reached(e, 'viewed')).length;
  const screening = entries.filter((e) => reached(e, 'screening')).length;
  const interview = entries.filter((e) => reached(e, 'interview')).length;
  const offer = entries.filter((e) => reached(e, 'offer')).length;
  const rejected = entries.filter((e) => e.status === 'rejected').length;

  console.log(`Откликов: ${total}`);
  console.log(`  → просмотр:  ${viewed} (${pct(viewed, total)})`);
  console.log(`  → скрининг:  ${screening} (${pct(screening, total)})`);
  console.log(`  → интервью:  ${interview} (${pct(interview, total)})`);
  console.log(`  → оффер:     ${offer} (${pct(offer, total)})`);
  console.log(`  отказы: ${rejected} (${pct(rejected, total)})`);

  for (const dim of ['resume', 'channel'] as const) {
    console.log(`\nПо ${dim === 'resume' ? 'резюме' : 'каналам'}:`);
    const groups = new Map<string, FunnelEntry[]>();
    for (const e of entries) {
      const key = e[dim];
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    for (const [key, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const v = list.filter((e) => reached(e, 'viewed')).length;
      const s = list.filter((e) => reached(e, 'screening')).length;
      console.log(
        `  ${key}: ${list.length} откл. → ${v} просмотров (${pct(v, list.length)}) → ${s} скринингов (${pct(s, list.length)})`,
      );
    }
  }
  // Диагноз по главному разрыву воронки — куда смотреть в первую очередь.
  if (viewed / total < 0.2) {
    console.log('\nℹ Главный разрыв: отклик → просмотр. Чинить: заголовок, зарплату, ключевые навыки, время отклика.');
  } else if (screening / Math.max(viewed, 1) < 0.2) {
    console.log('\nℹ Главный разрыв: просмотр → скрининг. Чинить: содержание первого экрана и сопроводительное.');
  }
}

// ---- main -----------------------------------------------------------------

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'add':
      await cmdAdd(rest);
      break;
    case 'set':
      cmdSet(rest);
      break;
    case 'list':
      cmdList(rest);
      break;
    case 'stats':
      cmdStats();
      break;
    default:
      console.error('Команды: add | set <id> | list | stats (подробности — в шапке cli/funnel.ts)');
      process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('funnel.ts')) {
  void main();
}
