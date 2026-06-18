import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ZodError, type ZodType } from 'zod';
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
  TargetSchema,
} from '../schema/index';

/** Корень проекта (src/lib/load.ts -> ../../). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTENT_DIR = join(ROOT, 'content');
const TARGETS_DIR = join(ROOT, 'targets');

function readYaml(path: string): unknown {
  return parseYaml(readFileSync(path, 'utf8'));
}

function validate<T>(schema: ZodType<T>, data: unknown, where: string): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(`Ошибка валидации в ${where}:\n${issues}`);
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

/** Загружает и валидирует весь content. Бросает читаемую ошибку при проблемах. */
export function loadContent(): Content {
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

  const experience = listYaml(join(CONTENT_DIR, 'experience')).map((p) =>
    validate(ExperienceSchema, readYaml(p), `content/experience/${basename(p)}`),
  );
  const projects = listYaml(join(CONTENT_DIR, 'projects')).map((p) =>
    validate(ProjectSchema, readYaml(p), `content/projects/${basename(p)}`),
  );

  return {
    profile,
    summary,
    achievements,
    experience,
    projects,
    skills,
    languages,
    education,
    interests,
  };
}

/** Загружает и валидирует все targets из targets/. */
export function loadTargets(): Target[] {
  const targets = listYaml(TARGETS_DIR).map((p) =>
    validate(TargetSchema, readYaml(p), `targets/${basename(p)}`),
  );
  const ids = new Set<string>();
  for (const t of targets) {
    if (ids.has(t.id)) throw new Error(`Дублирующийся target id: ${t.id}`);
    ids.add(t.id);
  }
  return targets;
}

export { ROOT, CONTENT_DIR, TARGETS_DIR };
