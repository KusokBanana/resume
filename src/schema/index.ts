import { z } from 'zod';

/**
 * Схемы единого источника истины.
 *
 * Принципы:
 * - Любой текст, видимый человеку, — двуязычный (`Localized`: ru + en).
 * - Каждый блок несёт `tags` (audience / systems / domains) и `priority`.
 *   Это позволяет `compose` отбирать и ранжировать блоки под конкретный target,
 *   а в будущем — LLM-подбору осмысленно фильтровать содержимое под вакансию.
 */

export const LANGS = ['ru', 'en'] as const;
export const Lang = z.enum(LANGS);
export type Lang = z.infer<typeof Lang>;

/** Двуязычная строка. Оба языка обязательны — это единый источник истины. */
export const Localized = z.object({
  ru: z.string().min(1),
  en: z.string().min(1),
});
export type Localized = z.infer<typeof Localized>;

export const Audience = z.enum(['hr', 'ats', 'technical']);
export type Audience = z.infer<typeof Audience>;

export const Tags = z
  .object({
    /** Для кого этот блок релевантен. Пусто = для всех. */
    audience: z.array(Audience).optional(),
    /** Системы, под которые блок особенно уместен (hh, linkedin, ...). Пусто = универсальный. */
    systems: z.array(z.string()).optional(),
    /** Предметные домены/ключевые слова (backend, fintech, k8s, ...). */
    domains: z.array(z.string()).optional(),
  })
  .default({});
export type Tags = z.infer<typeof Tags>;

/** Дата как YYYY или YYYY-MM. */
const YearMonth = z
  .string()
  .regex(/^\d{4}(-\d{2})?$/, 'дата должна быть в формате YYYY или YYYY-MM');
const EndDate = z.union([YearMonth, z.literal('present')]);

/** Маркированный пункт с собственными тегами — отбор возможен попунктно. */
const Highlight = z.object({
  text: Localized,
  tags: Tags,
});
export type Highlight = z.infer<typeof Highlight>;

/** Подсекция опыта: локализованный заголовок + свои пункты (напр. «Команды и процессы»). */
const HighlightGroup = z.object({
  title: Localized,
  highlights: z.array(Highlight).default([]),
});
export type HighlightGroup = z.infer<typeof HighlightGroup>;

// ---- Content-файлы ------------------------------------------------------

export const ProfileSchema = z.object({
  name: Localized,
  title: Localized, // headline / желаемая должность
  location: Localized.optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  /** Путь к портретному фото относительно public/, напр. "photo.jpg". Используется на лендинге. */
  photo: z.string().optional(),
  birthYear: z.number().int().optional(),
  links: z
    .array(
      z.object({
        label: z.string(),
        url: z.string().url(),
        /** необязательная подпись для системы: github, linkedin, telegram... */
        kind: z.string().optional(),
      }),
    )
    .default([]),
  /** Личная ссылка для блока «Помимо работы» */
  instagram: z.string().url().optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SummarySchema = z.object({
  variants: z
    .array(
      z.object({
        id: z.string(),
        text: Localized,
        tags: Tags,
        priority: z.number().default(0),
      }),
    )
    .min(1),
});
export type Summary = z.infer<typeof SummarySchema>;

export const ExperienceSchema = z.object({
  id: z.string(),
  company: z.string(),
  companyUrl: z.string().url().optional(),
  /** Путь к логотипу относительно public/, напр. "logos/vk.svg". */
  logo: z.string().optional(),
  role: Localized,
  location: Localized.optional(),
  start: YearMonth,
  end: EndDate,
  summary: Localized.optional(),
  /** Плоские пункты (когда подсекции не нужны). */
  highlights: z.array(Highlight).default([]),
  /** Сгруппированные пункты с подзаголовками (для богатого опыта). */
  groups: z.array(HighlightGroup).default([]),
  stack: z.array(z.string()).default([]),
  tags: Tags,
  priority: z.number().default(0),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: Localized,
  url: z.string().url().optional(),
  description: Localized,
  highlights: z.array(Highlight).default([]),
  stack: z.array(z.string()).default([]),
  tags: Tags,
  priority: z.number().default(0),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Навык: либо языко-нейтральная строка (технология), либо двуязычный термин. */
export const SkillItem = z.union([z.string(), Localized]);
export type SkillItem = z.infer<typeof SkillItem>;

export const SkillsSchema = z.object({
  groups: z
    .array(
      z.object({
        id: z.string(),
        name: Localized,
        items: z.array(SkillItem).min(1),
        tags: Tags,
        priority: z.number().default(0),
      }),
    )
    .min(1),
});
export type Skills = z.infer<typeof SkillsSchema>;

export const AchievementsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        text: Localized,
        tags: Tags,
        priority: z.number().default(0),
      }),
    )
    .default([]),
});
export type Achievements = z.infer<typeof AchievementsSchema>;

export const LanguagesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        name: Localized,
        level: Localized,
        tags: Tags,
        priority: z.number().default(0),
      }),
    )
    .default([]),
});
export type Languages = z.infer<typeof LanguagesSchema>;

export const EducationSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        institution: Localized,
        degree: Localized.optional(),
        field: Localized.optional(),
        start: YearMonth.optional(),
        end: EndDate.optional(),
        tags: Tags,
        priority: z.number().default(0),
      }),
    )
    .default([]),
});
export type Education = z.infer<typeof EducationSchema>;

/**
 * Личные увлечения — только для лендинга (человеческое измерение).
 * Намеренно НЕ протаскивается через compose/ResumeDocument/экспорты.
 */
export const InterestsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        /** Эмодзи/глиф для чипа, напр. "🤿". */
        icon: z.string().optional(),
        label: Localized,
        /** Путь к фото относительно public/, напр. "interests/diving.jpg". При наличии чип кликабелен и открывает фото. */
        photo: z.string().optional(),
        priority: z.number().default(0),
      }),
    )
    .default([]),
});
export type Interests = z.infer<typeof InterestsSchema>;

/** Весь загруженный и провалидированный content. */
export interface Content {
  profile: Profile;
  summary: Summary;
  achievements: Achievements;
  experience: Experience[];
  projects: Project[];
  skills: Skills;
  languages: Languages;
  education: Education;
  interests: Interests;
}

// ---- Target (профиль сборки) -------------------------------------------

export const SECTIONS = [
  'summary',
  'achievements',
  'experience',
  'projects',
  'skills',
  'languages',
  'education',
] as const;
export const Section = z.enum(SECTIONS);
export type Section = z.infer<typeof Section>;

const Select = z
  .object({
    /** Включить только блоки, чей набор тегов пересекается с этими. Пусто = не фильтровать по include. */
    includeTags: z.array(z.string()).optional(),
    /** Исключить блоки с любым из этих тегов. */
    excludeTags: z.array(z.string()).optional(),
    /** Принудительно включить блоки по id (минуя фильтры тегов). */
    includeIds: z.array(z.string()).optional(),
    /** Исключить блоки по id. */
    excludeIds: z.array(z.string()).optional(),
  })
  .default({});
export type Select = z.infer<typeof Select>;

export const TargetSchema = z.object({
  id: z.string(),
  label: Localized,
  languages: z.array(Lang).min(1),
  system: z.enum(['hh', 'linkedin', 'habr', 'general']),
  audience: Audience,
  formats: z.array(z.enum(['html', 'pdf', 'md', 'json', 'txt'])).default(['html']),
  layout: z.enum(['rich', 'ats']).default('rich'),
  select: Select,
  /** Порядок и состав секций. По умолчанию — стандартный порядок ниже. */
  sections: z.array(Section).default([...SECTIONS]),
});
export type Target = z.infer<typeof TargetSchema>;

// ---- ResumeDocument (результат compose: один target × один язык) --------

export interface ResumeDocument {
  meta: {
    targetId: string;
    system: Target['system'];
    audience: Audience;
    layout: Target['layout'];
    language: Lang;
    label: string;
  };
  profile: {
    name: string;
    title: string;
    location?: string;
    email?: string;
    phone?: string;
    birthYear?: number;
    links: { label: string; url: string; kind?: string }[];
  };
  summary?: string;
  achievements: string[];
  experience: {
    company: string;
    companyUrl?: string;
    role: string;
    location?: string;
    start: string;
    end: string;
    summary?: string;
    highlights: string[];
    groups: { title: string; highlights: string[] }[];
    stack: string[];
  }[];
  projects: {
    name: string;
    url?: string;
    description: string;
    highlights: string[];
    stack: string[];
  }[];
  skills: { name: string; items: string[] }[];
  languages: { name: string; level: string }[];
  education: {
    institution: string;
    degree?: string;
    field?: string;
    start?: string;
    end?: string;
  }[];
}
