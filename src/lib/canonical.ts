import type { Content, Lang, ResumeDocument, Target } from '../schema/index';
import { SECTIONS } from '../schema/index';
import { compose } from './compose';
import { withBase } from './url';

/**
 * Виртуальный «первичный» таргет для публичного канонического резюме:
 * все секции, без отбора по audience/system/тегам (используется с includeAll).
 */
export const PRIMARY_TARGET: Target = {
  id: 'full',
  label: { ru: 'Полное резюме', en: 'Full résumé' },
  languages: ['ru', 'en'],
  system: 'general',
  audience: 'hr',
  formats: ['md', 'json'],
  layout: 'rich',
  select: {},
  sections: [...SECTIONS],
};

/**
 * Канонический «полный» документ: всё содержимое без фильтров.
 * summary берём человеко-ориентированный general-вариант (как на лендинге),
 * т.к. при includeAll по priority выбрался бы плотный ats-вариант.
 */
export function fullDoc(content: Content, lang: Lang): ResumeDocument {
  const doc = compose(content, PRIMARY_TARGET, lang, true);
  const general = content.summary.variants.find((v) => v.id === 'summary-general');
  if (general) doc.summary = general.text[lang];
  return doc;
}

/** Абсолютный URL: site (origin) + base + path. */
export function absUrl(site: URL | string | undefined, base: string, path = ''): string {
  const rel = withBase(base, path);
  return site ? new URL(rel, site).href : rel;
}
