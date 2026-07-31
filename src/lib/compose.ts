import type {
  Content,
  Target,
  Lang,
  Localized,
  Tags,
  ResumeDocument,
  Highlight,
  Skills,
  SkillEntry,
} from '../schema/index';

const pick = (l: Localized, lang: Lang): string => l[lang];

/** Отображаемое имя навыка: язык-нейтральное `name` либо локализованное ru/en (по умолч. en). */
export function skillName(s: SkillEntry, lang: Lang = 'en'): string {
  return s.name ?? (lang === 'ru' ? (s.ru as string) : (s.en as string));
}

/** Стек компании: имена навыков реестра с этим id в `at` и stack:true, в порядке реестра. */
export function stackFor(skills: Skills, expId: string, lang?: Lang): string[] {
  return skills.items
    .filter((s) => s.stack && s.at.includes(expId))
    .map((s) => skillName(s, lang));
}

/** Группа глобальной секции с её навыками (global:true), группы по priority. */
export interface SkillGroupView {
  id: string;
  name: Localized;
  items: SkillEntry[];
}
export function globalSkillGroups(skills: Skills): SkillGroupView[] {
  return [...skills.groups].sort(byPriority).map((g) => ({
    id: g.id,
    name: g.name,
    items: skills.items.filter((s) => s.global && s.group === g.id),
  }));
}

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
export function byPriority<T extends { priority?: number }>(a: T, b: T): number {
  return (b.priority ?? 0) - (a.priority ?? 0);
}

/** Ключ даты для сравнения: YYYY или YYYY-MM → сопоставимая строка. */
const dateKey = (d: string) => (d.length === 4 ? `${d}-00` : d);

/**
 * Опыт сортируется по дате начала (новое сверху) — порядок отображения не зависит
 * от имён файлов и не требует ручного priority. priority остаётся тай-брейком.
 */
export function byStartDesc(
  a: { start: string; priority?: number },
  b: { start: string; priority?: number },
): number {
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
      metrics: e.metrics.map((m) => pick(m, lang)),
      highlights: localizeHighlights(e.highlights, target, lang, includeAll),
      groups: localizeGroups(e.groups, target, lang, includeAll),
      stack: stackFor(content.skills, e.id, lang),
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

  // Глобальная секция навыков: группы реестра с их global-навыками (по priority).
  const skills = globalSkillGroups(content.skills)
    .map((g) => ({
      name: pick(g.name, lang),
      items: g.items.map((s) => skillName(s, lang)),
    }))
    .filter((g) => g.items.length > 0);

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
      // id выбранного варианта «Кратко» — для гейта: сдвиг priority в summary.yaml
      // молча уводит ролевое резюме на чужой текст (см. test/compose-matrix.test.ts).
      summaryId: summaryVariant?.id ?? null,
    },
    profile: {
      name: pick(profile.name, lang),
      // Заголовок (желаемая должность): target может переопределить profile.title.
      title: pick(target.title ?? profile.title, lang),
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

/** Все валидные пары (target, язык) — удобно для getStaticPaths и скриптов. */
export function targetLangPairs(targets: Target[]): { target: Target; lang: Lang }[] {
  return targets.flatMap((t) => t.languages.map((lang) => ({ target: t, lang })));
}
