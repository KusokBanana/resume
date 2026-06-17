import type {
  Content,
  Target,
  Lang,
  Localized,
  Tags,
  ResumeDocument,
  Highlight,
} from '../schema/index';

const pick = (l: Localized, lang: Lang): string => l[lang];

/** Все теги блока, сплющенные в один набор строк (для include/exclude по тегам). */
function flatten(tags: Tags): Set<string> {
  return new Set<string>([
    ...(tags.audience ?? []),
    ...(tags.systems ?? []),
    ...(tags.domains ?? []),
  ]);
}

interface Tagged {
  id?: string;
  tags: Tags;
  priority?: number;
}

/**
 * Релевантен ли блок данному target.
 * Правила (в порядке приоритета):
 *  1. excludeIds / includeIds — явное переопределение по id.
 *  2. система: если у блока задан `systems` и не содержит target.system — исключаем.
 *  3. аудитория: если у блока задан `audience` и не содержит target.audience — исключаем.
 *  4. excludeTags: пересечение -> исключаем.
 *  5. includeTags (если задан): требуем пересечение, иначе исключаем.
 */
function isRelevant(block: Tagged, target: Target, includeAll = false): boolean {
  // Полный («канонический») вариант — без фильтрации по audience/system/тегам.
  if (includeAll) return true;

  const { select, system, audience } = target;
  const flat = flatten(block.tags);

  if (block.id && select.excludeIds?.includes(block.id)) return false;
  if (block.id && select.includeIds?.includes(block.id)) return true;

  const sys = block.tags.systems;
  if (sys && sys.length > 0 && !sys.includes(system)) return false;

  const aud = block.tags.audience;
  if (aud && aud.length > 0 && !aud.includes(audience)) return false;

  if (select.excludeTags?.some((t) => flat.has(t))) return false;

  if (select.includeTags && select.includeTags.length > 0) {
    if (!select.includeTags.some((t) => flat.has(t))) return false;
  }

  return true;
}

/** Сортировка по убыванию priority, стабильная для равных. */
function byPriority<T extends { priority?: number }>(a: T, b: T): number {
  return (b.priority ?? 0) - (a.priority ?? 0);
}

/** Ключ даты для сравнения: YYYY или YYYY-MM → сопоставимая строка. */
const dateKey = (d: string) => (d.length === 4 ? `${d}-00` : d);

/**
 * Опыт сортируется по дате начала (новое сверху) — порядок отображения не зависит
 * от имён файлов и не требует ручного priority. priority остаётся тай-брейком.
 */
function byStartDesc(a: { start: string; priority?: number }, b: { start: string; priority?: number }): number {
  const cmp = dateKey(b.start).localeCompare(dateKey(a.start));
  return cmp !== 0 ? cmp : byPriority(a, b);
}

function localizeHighlights(
  highlights: Highlight[],
  target: Target,
  lang: Lang,
  includeAll = false,
): string[] {
  return highlights
    .filter((h) => isRelevant(h, target, includeAll))
    .map((h) => pick(h.text, lang));
}

function localizeGroups(
  groups: { title: Localized; highlights: Highlight[] }[],
  target: Target,
  lang: Lang,
  includeAll = false,
): { title: string; highlights: string[] }[] {
  return groups
    .map((g) => ({
      title: pick(g.title, lang),
      highlights: localizeHighlights(g.highlights, target, lang, includeAll),
    }))
    .filter((g) => g.highlights.length > 0);
}

/**
 * Собирает ResumeDocument из content под конкретный target и язык.
 * `includeAll` — собрать «полный» (канонический) документ без фильтрации по
 * audience/system/тегам (для публичного md/json и AI-точек входа).
 */
export function compose(
  content: Content,
  target: Target,
  lang: Lang,
  includeAll = false,
): ResumeDocument {
  const { profile } = content;

  // Summary: лучший по priority релевантный вариант.
  const summaryVariant = content.summary.variants
    .filter((v) => isRelevant(v, target, includeAll))
    .sort(byPriority)[0];

  const achievements = content.achievements.items
    .filter((a) => isRelevant(a, target, includeAll))
    .sort(byPriority)
    .map((a) => pick(a.text, lang));

  const experience = content.experience
    .filter((e) => isRelevant(e, target, includeAll))
    .sort(byStartDesc)
    .map((e) => ({
      company: e.company,
      companyUrl: e.companyUrl,
      role: pick(e.role, lang),
      location: e.location ? pick(e.location, lang) : undefined,
      start: e.start,
      end: e.end,
      summary: e.summary ? pick(e.summary, lang) : undefined,
      highlights: localizeHighlights(e.highlights, target, lang, includeAll),
      groups: localizeGroups(e.groups, target, lang, includeAll),
      stack: e.stack,
    }));

  const projects = content.projects
    .filter((p) => isRelevant(p, target, includeAll))
    .sort(byPriority)
    .map((p) => ({
      name: pick(p.name, lang),
      url: p.url,
      description: pick(p.description, lang),
      highlights: localizeHighlights(p.highlights, target, lang, includeAll),
      stack: p.stack,
    }));

  const skills = content.skills.groups
    .filter((g) => isRelevant(g, target, includeAll))
    .sort(byPriority)
    .map((g) => ({
      name: pick(g.name, lang),
      items: g.items.map((it) => (typeof it === 'string' ? it : pick(it, lang))),
    }));

  const languages = content.languages.items
    .filter((l) => isRelevant(l, target, includeAll))
    .sort(byPriority)
    .map((l) => ({ name: pick(l.name, lang), level: pick(l.level, lang) }));

  const education = content.education.items
    .filter((e) => isRelevant(e, target, includeAll))
    .sort(byPriority)
    .map((e) => ({
      institution: pick(e.institution, lang),
      degree: e.degree ? pick(e.degree, lang) : undefined,
      field: e.field ? pick(e.field, lang) : undefined,
      start: e.start,
      end: e.end,
    }));

  return {
    meta: {
      targetId: target.id,
      system: target.system,
      audience: target.audience,
      layout: target.layout,
      language: lang,
      label: pick(target.label, lang),
    },
    profile: {
      name: pick(profile.name, lang),
      title: pick(profile.title, lang),
      location: profile.location ? pick(profile.location, lang) : undefined,
      email: profile.email,
      phone: profile.phone,
      birthYear: profile.birthYear,
      links: profile.links,
    },
    summary: summaryVariant ? pick(summaryVariant.text, lang) : undefined,
    achievements,
    experience,
    projects,
    skills,
    languages,
    education,
  };
}

/** Какие секции и в каком порядке показывать (из target.sections). */
export function orderedSections(target: Target): Target['sections'] {
  return target.sections;
}

/** Все валидные пары (target, язык) — удобно для getStaticPaths и скриптов. */
export function targetLangPairs(targets: Target[]): { target: Target; lang: Lang }[] {
  return targets.flatMap((t) => t.languages.map((lang) => ({ target: t, lang })));
}
