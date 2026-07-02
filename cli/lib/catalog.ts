/**
 * Каталог блоков резюме и дешёвые текстовые эвристики — общий вход для LLM-подбора
 * (tailor), генерации письма (cover-letter) и сопоставления вакансий (find-jobs).
 */
import type { Content, Lang } from '../../src/schema/index';

export interface CatalogBlock {
  id: string;
  kind: 'experience' | 'project';
  text: string;
  domains: string[];
}

/** Плоский каталог блоков (id, домены, текст) — компактный вход для модели. */
export function catalog(content: Content, lang: Lang): CatalogBlock[] {
  const blocks: CatalogBlock[] = [];
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

const WORD_SPLIT = /[^a-zа-я0-9+#.]+/i;

/** Множество значимых слов из текста (для дешёвого предфильтра). */
export function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(WORD_SPLIT)
      .filter((w) => w.length > 2),
  );
}

/** Сколько слов из refWords встречается в тексте — дешёвая мера релевантности. */
export function keywordScore(text: string, refWords: Set<string>): number {
  return text
    .toLowerCase()
    .split(WORD_SPLIT)
    .filter((w) => refWords.has(w)).length;
}

/** Слова всего каталога + ключевых фраз профиля — эталон для предфильтра вакансий. */
export function resumeWords(content: Content, lang: Lang): Set<string> {
  const blocks = catalog(content, lang);
  const text = [
    ...blocks.map((b) => `${b.text} ${b.domains.join(' ')}`),
    ...(content.profile.keywords?.[lang] ?? []),
    content.profile.title[lang],
  ].join(' ');
  return words(text);
}

/** Выжимка профиля для промптов (письмо, сопоставление вакансий). */
export interface ProfileFacts {
  name: string;
  title: string;
  location?: string;
  email?: string;
  summary?: string;
  keywords: string[];
  links: { label: string; url: string }[];
}

export function profileFacts(content: Content, lang: Lang): ProfileFacts {
  const p = content.profile;
  const summary = [...content.summary.variants].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  )[0];
  return {
    name: p.name[lang],
    title: p.title[lang],
    location: p.location?.[lang],
    email: p.email,
    summary: summary?.text[lang],
    keywords: p.keywords?.[lang] ?? [],
    links: p.links.map((l) => ({ label: l.label, url: l.url })),
  };
}
