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

export const UI: Record<string, Record<Lang, string>> = {
  present: { ru: 'наст. время', en: 'present' },
  stack: { ru: 'Стек', en: 'Stack' },
  downloadPdf: { ru: 'Скачать PDF', en: 'Download PDF' },
  downloadMd: { ru: 'Скачать Markdown', en: 'Download Markdown' },
  viewOnline: { ru: 'Смотреть онлайн', en: 'View online' },
  variants: { ru: 'Варианты резюме', en: 'Resume variants' },
  sourceOfTruth: {
    ru: 'Единый источник истины, собирается автоматически.',
    en: 'Single source of truth, built automatically.',
  },
};

export function sectionTitle(s: Section, lang: Lang): string {
  return SECTION_TITLES[s][lang];
}

export function endLabel(end: string, lang: Lang): string {
  return end === 'present' ? UI.present[lang] : end;
}
