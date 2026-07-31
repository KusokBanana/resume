import type { ResumeDocument, Section } from '../schema/index';
import { SECTIONS } from '../schema/index';

/** Убираем markdown-жирный `**...**` — в JSON Resume разметки нет. */
const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1');

/**
 * Экспорт в стандарт JSON Resume (https://jsonresume.org/schema).
 * Даёт совместимость с экосистемой тем и импортёров.
 * 'present' трактуется как отсутствие endDate.
 *
 * ⚠ В JSON Resume нет подсекций опыта, поэтому пункты из `groups` склеиваются
 * в общий `highlights` с префиксом заголовка группы («Продукты: …»). Без этого
 * у мест работы, где все пункты сгруппированы (например Positive Technologies),
 * `highlights` оказывался пустым.
 *
 * `sections` — тот же гейт, что у остальных рендереров (`target.sections`):
 * секция, не включённая в target, не попадает в вывод.
 */
export function toJsonResume(
  doc: ResumeDocument,
  sections: Section[] = [...SECTIONS],
): Record<string, unknown> {
  const endDate = (end?: string) => (!end || end === 'present' ? undefined : end);
  const has = (s: Section) => sections.includes(s);

  // Достижения в JSON Resume отдельной секции не имеют — дописываем в basics.summary.
  const summaryParts = [
    has('summary') ? doc.summary : undefined,
    has('achievements') && doc.achievements.length
      ? doc.achievements.map(stripBold).join('\n')
      : undefined,
  ].filter(Boolean);

  return {
    $schema:
      'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: {
      name: doc.profile.name,
      label: doc.profile.title,
      email: doc.profile.email,
      phone: doc.profile.phone,
      summary: summaryParts.length ? summaryParts.join('\n\n') : undefined,
      location: doc.profile.location ? { address: doc.profile.location } : undefined,
      profiles: doc.profile.links.map((l) => ({
        network: l.kind ?? l.label,
        url: l.url,
      })),
    },
    work: has('experience')
      ? doc.experience.map((e) => ({
          name: e.company,
          position: e.role,
          url: e.companyUrl,
          location: e.location,
          startDate: e.start,
          endDate: endDate(e.end),
          summary: e.summary,
          highlights: [
            ...e.highlights,
            ...e.groups.flatMap((g) => g.highlights.map((h) => `${g.title}: ${h}`)),
          ].map(stripBold),
        }))
      : undefined,
    projects: has('projects')
      ? doc.projects.map((p) => ({
          name: p.name,
          description: p.description,
          url: p.url,
          highlights: p.highlights.map(stripBold),
          keywords: p.stack,
        }))
      : undefined,
    skills: has('skills')
      ? doc.skills.map((g) => ({
          name: g.name,
          keywords: g.items,
        }))
      : undefined,
    languages: has('languages')
      ? doc.languages.map((l) => ({ language: l.name, fluency: l.level }))
      : undefined,
    education: has('education')
      ? doc.education.map((e) => ({
          institution: e.institution,
          area: e.field,
          studyType: e.degree,
          startDate: e.start,
          endDate: endDate(e.end),
        }))
      : undefined,
    meta: {
      language: doc.meta.language,
      target: doc.meta.targetId,
      canonical: 'resume-as-code',
    },
  };
}
