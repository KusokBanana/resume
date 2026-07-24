/**
 * Доказательства навыков и компании-фильтр для лендинга: в каких местах работы
 * применялся навык (по `at` реестра) и суммарный стаж. Чистая логика, без Astro.
 * Имя навыка / стек компании / группы глобальной секции живут в compose.ts.
 */
import { byStartDesc } from './compose';
import type { Experience, SkillEntry } from '../schema/index';

/** Запись опыта, подтверждающая навык (для поповера/фильтра). */
export interface EvidenceEntry {
  id: string;
  company: string;
  /** Короткое имя компании для поповера (напр. «PT», «Фриланс»); нет — показываем company. */
  short?: string;
  start: string;
  end: string; // YYYY[-MM] | 'present'
}

/** YYYY[-MM] → индекс месяца начала (без месяца → январь). */
const startRank = (s: string): number => {
  const [y, m] = s.split('-');
  return Number(y) * 12 + (m ? Number(m) : 1);
};
/** Индекс месяца конца; 'present' → +∞ (самый поздний). */
const endRank = (s: string): number => {
  if (s === 'present') return Infinity;
  const [y, m] = s.split('-');
  return Number(y) * 12 + (m ? Number(m) : 12);
};

/**
 * Места работы навыка (по `at`), новейшие сверху. Несколько ролей одной компании
 * схлопываются в один пункт: период — от самого раннего начала до самого позднего конца,
 * id — новейшей роли (ссылка ведёт к самой свежей карточке компании). Питает поповер.
 */
export function evidenceForSkill(
  s: SkillEntry,
  experience: Experience[],
): EvidenceEntry[] {
  const roles = s.at
    .map((id) => experience.find((e) => e.id === id))
    .filter((e): e is Experience => Boolean(e));

  const byCompany = new Map<string, EvidenceEntry>();
  const newestStart = new Map<string, number>();
  for (const e of roles) {
    const cur = byCompany.get(e.company);
    if (!cur) {
      const entry: EvidenceEntry = {
        id: e.id,
        company: e.company,
        start: e.start,
        end: e.end,
      };
      if (e.short) entry.short = e.short;
      byCompany.set(e.company, entry);
      newestStart.set(e.company, startRank(e.start));
      continue;
    }
    if (startRank(e.start) < startRank(cur.start)) cur.start = e.start;
    if (endRank(e.end) > endRank(cur.end)) cur.end = e.end;
    if (startRank(e.start) > (newestStart.get(e.company) ?? -Infinity)) {
      newestStart.set(e.company, startRank(e.start));
      cur.id = e.id;
      if (e.short) cur.short = e.short;
    }
  }

  return [...byCompany.values()].sort(byStartDesc);
}

/** Компания-фильтр: стабильный ключ, полное имя и короткая метка (до «/» или скобки). */
export interface Company {
  key: string;
  name: string;
  label: string;
}

/** Компании из опыта: новейшие первыми, без дублей по имени, с ключами c0…cN. */
export function orderedCompanies(experience: Experience[]): Company[] {
  const seen = new Set<string>();
  const out: Company[] = [];
  for (const e of [...experience].sort(byStartDesc)) {
    if (seen.has(e.company)) continue;
    seen.add(e.company);
    out.push({
      key: `c${out.length}`,
      name: e.company,
      label: e.company.split(/\s*[/(]/)[0].trim(),
    });
  }
  return out;
}

/** Все id из `at` навыков — для валидации против id мест работы. */
export function collectAtIds(items: { at: string[] }[]): string[] {
  const ids = new Set<string>();
  for (const s of items) for (const id of s.at) ids.add(id);
  return [...ids];
}

/** YYYY[-MM] → сквозной индекс месяца; 'present' → текущий месяц. */
function monthIndex(s: string, now: Date): number {
  if (s === 'present') return now.getFullYear() * 12 + now.getMonth() + 1;
  const [y, m] = s.split('-');
  return Number(y) * 12 + (m ? Number(m) : 1);
}

/**
 * Суммарные месяцы по записям с объединением пересекающихся и смежных интервалов
 * (границы включительно, как в durationLabel) — чтобы параллельные/встык идущие
 * места работы не считались дважды. Для бейджа «N лет M мес.» в поповере.
 */
export function totalMonths(
  entries: { start: string; end: string }[],
  now = new Date(),
): number {
  const spans = entries
    .map((e) => [monthIndex(e.start, now), monthIndex(e.end, now)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of spans) {
    if (cur && s <= cur[1] + 1) {
      cur[1] = Math.max(cur[1], e);
    } else {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = [s, e];
    }
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}
