import type { Lang } from '../schema/index';

/** Единое имя варианта для путей и файлов: <targetId>-<lang>. */
export function variantSlug(targetId: string, lang: Lang): string {
  return `${targetId}-${lang}`;
}
