import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z, ZodError } from 'zod';
import {
  type Content,
  type Target,
  ProfileSchema,
  SummarySchema,
  AchievementsSchema,
  ExperienceSchema,
  ProjectSchema,
  SkillsSchema,
  LanguagesSchema,
  EducationSchema,
  InterestsSchema,
  StatsSchema,
  ThesesSchema,
  TargetSchema,
} from '../schema/index';

/**
 * Корень проекта. Берём cwd: loadContent зовётся только на этапе сборки
 * (getStaticPaths / рендер страниц / build-скрипты), а `astro build` и `tsx`
 * запускаются из корня. Через import.meta.url ROOT ломается в Astro 7: он
 * складывает prerender-чанки в dist/.prerender/, и относительный путь съезжает.
 */
const ROOT = process.cwd();
const CONTENT_DIR = join(ROOT, 'content');
const TARGETS_DIR = join(ROOT, 'targets');

function readYaml(path: string): unknown {
  return parseYaml(readFileSync(path, 'utf8'));
}

function validate<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  where: string,
): z.output<S> {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(`Ошибка валидации в ${where}:\n${issues}`, { cause: err });
    }
    throw err;
  }
}

function listYaml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => join(dir, f));
}

// Кэш в пределах процесса: YAML не меняется во время сборки, а loadContent
// зовётся из каждой страницы/эндпоинта — парсим один раз.
let contentCache: Content | undefined;
let targetsCache: Target[] | undefined;

/** Загружает и валидирует весь content. Бросает читаемую ошибку при проблемах. */
export function loadContent(): Content {
  if (contentCache) return contentCache;
  const profile = validate(
    ProfileSchema,
    readYaml(join(CONTENT_DIR, 'profile.yaml')),
    'content/profile.yaml',
  );
  const summary = validate(
    SummarySchema,
    readYaml(join(CONTENT_DIR, 'summary.yaml')),
    'content/summary.yaml',
  );
  const achievements = validate(
    AchievementsSchema,
    existsSync(join(CONTENT_DIR, 'achievements.yaml'))
      ? readYaml(join(CONTENT_DIR, 'achievements.yaml'))
      : { items: [] },
    'content/achievements.yaml',
  );
  const skills = validate(
    SkillsSchema,
    readYaml(join(CONTENT_DIR, 'skills.yaml')),
    'content/skills.yaml',
  );
  const languages = validate(
    LanguagesSchema,
    existsSync(join(CONTENT_DIR, 'languages.yaml'))
      ? readYaml(join(CONTENT_DIR, 'languages.yaml'))
      : { items: [] },
    'content/languages.yaml',
  );
  const education = validate(
    EducationSchema,
    existsSync(join(CONTENT_DIR, 'education.yaml'))
      ? readYaml(join(CONTENT_DIR, 'education.yaml'))
      : { items: [] },
    'content/education.yaml',
  );
  const interests = validate(
    InterestsSchema,
    existsSync(join(CONTENT_DIR, 'interests.yaml'))
      ? readYaml(join(CONTENT_DIR, 'interests.yaml'))
      : { items: [] },
    'content/interests.yaml',
  );
  const stats = validate(
    StatsSchema,
    existsSync(join(CONTENT_DIR, 'stats.yaml'))
      ? readYaml(join(CONTENT_DIR, 'stats.yaml'))
      : { items: [] },
    'content/stats.yaml',
  );
  const theses = validate(
    ThesesSchema,
    existsSync(join(CONTENT_DIR, 'theses.yaml'))
      ? readYaml(join(CONTENT_DIR, 'theses.yaml'))
      : { items: [] },
    'content/theses.yaml',
  );

  const experience = listYaml(join(CONTENT_DIR, 'experience')).map((p) =>
    validate(ExperienceSchema, readYaml(p), `content/experience/${basename(p)}`),
  );
  const projects = listYaml(join(CONTENT_DIR, 'projects')).map((p) =>
    validate(ProjectSchema, readYaml(p), `content/projects/${basename(p)}`),
  );

  contentCache = {
    profile,
    summary,
    achievements,
    experience,
    projects,
    skills,
    languages,
    education,
    interests,
    stats,
    theses,
  };
  return contentCache;
}

/** Загружает и валидирует все targets из targets/. */
export function loadTargets(): Target[] {
  if (targetsCache) return targetsCache;
  const targets = listYaml(TARGETS_DIR).map((p) =>
    validate(TargetSchema, readYaml(p), `targets/${basename(p)}`),
  );
  const ids = new Set<string>();
  for (const t of targets) {
    if (ids.has(t.id)) throw new Error(`Дублирующийся target id: ${t.id}`);
    ids.add(t.id);
  }
  targetsCache = targets;
  return targetsCache;
}

export { ROOT, CONTENT_DIR, TARGETS_DIR };
