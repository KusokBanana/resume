import type { ResumeDocument } from '../schema/index';

/**
 * Экспорт в стандарт JSON Resume (https://jsonresume.org/schema).
 * Даёт совместимость с экосистемой тем и импортёров.
 * 'present' трактуется как отсутствие endDate.
 */
export function toJsonResume(doc: ResumeDocument): Record<string, unknown> {
  const endDate = (end?: string) =>
    !end || end === 'present' ? undefined : end;

  return {
    $schema:
      'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: {
      name: doc.profile.name,
      label: doc.profile.title,
      email: doc.profile.email,
      phone: doc.profile.phone,
      summary: doc.summary,
      location: doc.profile.location
        ? { address: doc.profile.location }
        : undefined,
      profiles: doc.profile.links.map((l) => ({
        network: l.kind ?? l.label,
        url: l.url,
      })),
    },
    work: doc.experience.map((e) => ({
      name: e.company,
      position: e.role,
      url: e.companyUrl,
      location: e.location,
      startDate: e.start,
      endDate: endDate(e.end),
      summary: e.summary,
      highlights: e.highlights,
    })),
    projects: doc.projects.map((p) => ({
      name: p.name,
      description: p.description,
      url: p.url,
      highlights: p.highlights,
      keywords: p.stack,
    })),
    skills: doc.skills.map((g) => ({
      name: g.name,
      keywords: g.items,
    })),
    education: doc.education.map((e) => ({
      institution: e.institution,
      area: e.field,
      studyType: e.degree,
      startDate: e.start,
      endDate: endDate(e.end),
    })),
    meta: {
      language: doc.meta.language,
      target: doc.meta.targetId,
      canonical: 'resume-as-code',
    },
  };
}
