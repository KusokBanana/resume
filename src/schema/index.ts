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
  /**
   * Короткий «продающий» одностроч (~120–150 симв.) для мета-тегов:
   * description / og:description / twitter:description. Соцсети и Google
   * обрезают длинные описания — держим сжато. Фолбэк — summary, если не задан.
   */
  pitch: Localized.optional(),
  location: Localized.optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  /** Путь к портретному фото относительно public/, напр. "photo.jpg". Используется на лендинге. */
  photo: z.string().optional(),
  birthYear: z.number().int().optional(),
  links: z
    .array(
      z.object({
        label: z.string(),
        url: z.url(),
        /** необязательная подпись для системы: github, linkedin, telegram... */
        kind: z.string().optional(),
      }),
    )
    .default([]),
  /** Личная ссылка для блока «Помимо работы» */
  instagram: z.url().optional(),
  /**
   * Целевые ключевые фразы экспертизы (двуязычно). Отдаются в JSON-LD
   * `knowsAbout` — это то, по чему AI-рекрутер/поиск матчит профиль.
   * Ручной список (не из skills): лидерские формулировки, а не технологии.
   */
  keywords: z.object({ ru: z.array(z.string()), en: z.array(z.string()) }).optional(),
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
  /** Короткое имя для карточки на мобильном (напр. «PT»). Только лендинг; фильтр/экспорты — company. */
  short: z.string().optional(),
  companyUrl: z.url().optional(),
  /** Путь к логотипу относительно public/, напр. "logos/vk.svg". */
  logo: z.string().optional(),
  role: Localized,
  location: Localized.optional(),
  /** Индустрия/домен для бейджа у названия компании (напр. «финтех»). Только лендинг. */
  industry: Localized.optional(),
  start: YearMonth,
  end: EndDate,
  summary: Localized.optional(),
  /** Плоские пункты (когда подсекции не нужны). */
  highlights: z.array(Highlight).default([]),
  /** Сгруппированные пункты с подзаголовками (для богатого опыта). */
  groups: z.array(HighlightGroup).default([]),
  /**
   * Короткие «кричащие» метрики масштаба для чипов на лендинге
   * (напр. «**~100M** MAU»). Поддерживают **акцент**. Только лендинг —
   * в compose/экспорты не идут.
   */
  metrics: z.array(Localized).default([]),
  // Стека здесь больше нет — единый источник в content/skills.yaml (реестр).
  // Стек компании выводится из навыков реестра с этим id в `at` (см. skill-evidence).
  tags: Tags,
  priority: z.number().default(0),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: Localized,
  url: z.url().optional(),
  description: Localized,
  highlights: z.array(Highlight).default([]),
  stack: z.array(z.string()).default([]),
  tags: Tags,
  priority: z.number().default(0),
});
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Единый реестр навыков — источник истины и для глобальной секции навыков, и для
 * строки «Стек» в карточках опыта/экспортах (стек больше не хранится в experience).
 *
 * Навык: `name` (язык-нейтральная строка, напр. технология) ЛИБО `ru`+`en` (двуязычный
 * термин, напр. компетенция). Ровно одно из двух.
 *  - `at`     — id мест работы, где применялся (≥1). Стек компании = навыки с её id и stack:true.
 *  - `stack`  — попадает ли в строку «Стек» карточек опыта и экспортов (по умолчанию true;
 *               компетенциям вроде «найм»/«архитектура» ставим false).
 *  - `global` — показывать ли в глобальной секции навыков (по умолчанию true; легаси вроде
 *               1C-Bitrix ставим false — оно остаётся только в стеке опыта).
 *  - `group`  — группа глобальной секции (обязательна при global:true).
 */
export const SkillEntry = z
  .object({
    name: z.string().optional(),
    ru: z.string().optional(),
    en: z.string().optional(),
    at: z.array(z.string()).min(1),
    stack: z.boolean().default(true),
    global: z.boolean().default(true),
    group: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    const neutral = typeof s.name === 'string';
    const localized = typeof s.ru === 'string' && typeof s.en === 'string';
    if (neutral === localized) {
      ctx.addIssue({
        code: 'custom',
        message: 'навык: задай либо name, либо пару ru+en',
      });
    }
    if (s.global && !s.group) {
      ctx.addIssue({
        code: 'custom',
        message: `навык "${s.name ?? s.ru}": global:true требует group`,
      });
    }
  });
export type SkillEntry = z.infer<typeof SkillEntry>;

export const SkillsSchema = z.object({
  groups: z
    .array(
      z.object({
        id: z.string(),
        name: Localized,
        priority: z.number().default(0),
      }),
    )
    .min(1),
  items: z.array(SkillEntry).min(1),
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

/**
 * Крупные метрики для «продающей» полосы под hero — только лендинг.
 * Намеренно НЕ протаскивается через compose/ResumeDocument/экспорты.
 */
export const StatsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        /** Значение метрики, напр. «50+», «91%», «1,5×». Двуязычно (единицы могут отличаться). */
        value: Localized,
        /** Подпись под числом, напр. «собеседований провёл». */
        label: Localized,
        priority: z.number().default(0),
      }),
    )
    .default([]),
});
export type Stats = z.infer<typeof StatsSchema>;

/**
 * Ёмкие лидерские тезисы под полосой цифр — только лендинг.
 * Намеренно НЕ протаскивается через compose/ResumeDocument/экспорты.
 */
export const ThesesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        /** Текст тезиса; поддерживает **акцент** (renderInline). */
        text: Localized,
        priority: z.number().default(0),
      }),
    )
    .default([]),
});
export type Theses = z.infer<typeof ThesesSchema>;

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
  stats: Stats;
  theses: Theses;
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
  /**
   * Переопределение заголовка (желаемой должности) для этого target'а.
   * По умолчанию — profile.title. Нужен, когда один и тот же контент
   * подаётся под разные роли (EM / техлид / fullstack) на одной площадке.
   */
  title: Localized.optional(),
  languages: z.array(Lang).min(1),
  system: z.enum(['hh', 'linkedin', 'habr', 'general']),
  audience: Audience,
  formats: z.array(z.enum(['html', 'pdf', 'md', 'json', 'txt'])).default(['html']),
  layout: z.enum(['rich', 'ats']).default('rich'),
  select: Select,
  /** Порядок и состав секций. По умолчанию — стандартный порядок ниже. */
  sections: z.array(Section).default([...SECTIONS]),
  /**
   * Канонический «самый полный человеческий» вариант — его PDF отдаёт лендинг.
   * Раньше выбирался эвристикой «rich+hr+пустой select», но select канонического
   * target'а теперь непустой (ролевой отбор достижений).
   */
  canonical: z.boolean().default(false),
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
    /** id выбранного варианта summary (null, если ни один не подошёл). */
    summaryId: string | null;
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
    metrics: string[];
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
