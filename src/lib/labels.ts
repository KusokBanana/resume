import type { Lang, Section } from '../schema/index';

/** Локализованные заголовки секций и подписи. Единое место для UI-строк. */
export const SECTION_TITLES: Record<Section, Record<Lang, string>> = {
  summary: { ru: 'Кратко', en: 'Summary' },
  achievements: { ru: 'Ключевые результаты', en: 'Key results' },
  experience: { ru: 'Опыт работы', en: 'Experience' },
  projects: { ru: 'Проекты', en: 'Projects' },
  skills: { ru: 'Навыки', en: 'Skills' },
  languages: { ru: 'Языки', en: 'Languages' },
  education: { ru: 'Образование', en: 'Education' },
};

export const UI = {
  present: { ru: 'наст. время', en: 'present' },
  stack: { ru: 'Стек', en: 'Stack' },
  downloadPdf: { ru: 'Скачать PDF', en: 'Download PDF' },
  downloadMd: { ru: 'Скачать Markdown', en: 'Download Markdown' },
  downloadTxt: { ru: 'Скачать TXT', en: 'Download TXT' },
  viewOnline: { ru: 'Смотреть онлайн', en: 'View online' },
  variants: { ru: 'Варианты резюме', en: 'Resume variants' },
} as const satisfies Record<string, Record<Lang, string>>;

export function sectionTitle(s: Section, lang: Lang): string {
  return SECTION_TITLES[s][lang];
}

export function endLabel(end: string, lang: Lang): string {
  return end === 'present' ? UI.present[lang] : end;
}

/** Диапазон дат «начало — конец» с локализованным `present`. */
export function dateRange(start: string, end: string, lang: Lang): string {
  return `${start} — ${endLabel(end, lang)}`;
}

/**
 * Период образования как «2015 — 2019» (обе даты необязательны). Пустая строка,
 * если нет ни начала, ни конца. Обёртку (скобки / позицию) добавляет вызывающий.
 */
export function educationPeriod(
  edu: { start?: string; end?: string },
  lang: Lang,
): string {
  return [edu.start, edu.end ? endLabel(edu.end, lang) : undefined]
    .filter(Boolean)
    .join(' — ');
}

/** Число месяцев между YYYY[-MM] включительно; end='present' → до текущего месяца. */
function monthsBetween(start: string, end: string, now: Date): number {
  const parse = (s: string): [number, number] => {
    const [y, m] = s.split('-');
    return [Number(y), m ? Number(m) : 1];
  };
  const [sy, sm] = parse(start);
  const [ey, em] =
    end === 'present' ? [now.getFullYear(), now.getMonth() + 1] : parse(end);
  return Math.max(ey * 12 + em - (sy * 12 + sm) + 1, 1);
}

/** Русская плюрализация через платформенный Intl.PluralRules: pluralRu(n, 'год', 'года', 'лет'). */
const ruPlural = new Intl.PluralRules('ru');
function pluralRu(n: number, one: string, few: string, many: string): string {
  const cat = ruPlural.select(n);
  return cat === 'one' ? one : cat === 'few' ? few : many;
}

/** Суммарный стаж на месте работы: «2 года 7 мес.» / «2 yrs 7 mos». */
export function durationLabel(
  start: string,
  end: string,
  lang: Lang,
  now = new Date(),
): string {
  const total = monthsBetween(start, end, now);
  const y = Math.floor(total / 12);
  const m = total % 12;
  if (lang === 'ru') {
    const yl = y ? `${y} ${pluralRu(y, 'год', 'года', 'лет')}` : '';
    const ml = m ? `${m} мес.` : '';
    return [yl, ml].filter(Boolean).join(' ') || '1 мес.';
  }
  const yl = y ? `${y} ${y === 1 ? 'yr' : 'yrs'}` : '';
  const ml = m ? `${m} ${m === 1 ? 'mo' : 'mos'}` : '';
  return [yl, ml].filter(Boolean).join(' ') || '1 mo';
}
