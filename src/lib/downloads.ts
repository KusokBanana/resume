import { loadContent, loadTargets } from './load';
import { variantSlug } from './slug';
import { withBase } from './url';
import type { Lang } from '../schema/index';

/**
 * Ссылки на скачиваемый PDF для лендинга: берём самый полный «человеческий»
 * вариант — rich + hr + без отбора по тегам (это hh), с фолбэками. Плюс опрятное
 * латинское имя файла (не все браузеры дружат с кириллицей в download).
 */
export function pdfDownloads(base: string): {
  ru: string | null;
  en: string | null;
  nameBase: string;
} {
  const targets = loadTargets();
  const pdfTarget =
    targets.find((t) => t.canonical && t.formats.includes('pdf')) ??
    targets.find(
      (t) =>
        t.formats.includes('pdf') &&
        t.layout === 'rich' &&
        t.audience === 'hr' &&
        Object.keys(t.select ?? {}).length === 0,
    ) ??
    targets.find((t) => t.formats.includes('pdf') && t.layout === 'rich') ??
    targets.find((t) => t.formats.includes('pdf'));
  const href = (lang: Lang) =>
    pdfTarget && pdfTarget.languages.includes(lang)
      ? withBase(base, `generated/${variantSlug(pdfTarget.id, lang)}.pdf`)
      : null;
  return {
    ru: href('ru'),
    en: href('en'),
    nameBase: loadContent().profile.name.en.replace(/\s+/g, '_'),
  };
}
