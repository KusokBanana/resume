import type { ResumeDocument, Section, Lang } from '../schema/index';
import { sectionTitle, endLabel, UI } from './labels';

const dateRange = (start: string, end: string, lang: Lang) =>
  `${start} — ${endLabel(end, lang)}`;

/** Рендерит ResumeDocument в Markdown. sections задаёт состав и порядок. */
export function renderMarkdown(doc: ResumeDocument, sections: Section[]): string {
  const lang = doc.meta.language;
  const out: string[] = [];

  // Шапка
  out.push(`# ${doc.profile.name}`);
  out.push(`**${doc.profile.title}**`);
  const contacts: string[] = [];
  if (doc.profile.location) contacts.push(doc.profile.location);
  if (doc.profile.email) contacts.push(doc.profile.email);
  if (doc.profile.phone) contacts.push(doc.profile.phone);
  if (contacts.length) out.push(contacts.join(' · '));
  if (doc.profile.links.length) {
    out.push(doc.profile.links.map((l) => `[${l.label}](${l.url})`).join(' · '));
  }

  for (const section of sections) {
    if (section === 'summary' && doc.summary) {
      out.push(`\n## ${sectionTitle('summary', lang)}\n`);
      out.push(doc.summary);
    }

    if (section === 'achievements' && doc.achievements.length) {
      out.push(`\n## ${sectionTitle('achievements', lang)}\n`);
      for (const a of doc.achievements) out.push(`- ${a}`);
    }

    if (section === 'experience' && doc.experience.length) {
      out.push(`\n## ${sectionTitle('experience', lang)}\n`);
      for (const e of doc.experience) {
        const head = e.companyUrl ? `[${e.company}](${e.companyUrl})` : e.company;
        out.push(`### ${e.role} — ${head}`);
        const meta = [dateRange(e.start, e.end, lang), e.location]
          .filter(Boolean)
          .join(' · ');
        out.push(`*${meta}*`);
        if (e.summary) out.push(e.summary);
        for (const h of e.highlights) out.push(`- ${h}`);
        for (const g of e.groups) {
          out.push(`\n**${g.title}**`);
          for (const h of g.highlights) out.push(`- ${h}`);
        }
        if (e.stack.length) out.push(`\n${UI.stack[lang]}: ${e.stack.join(', ')}`);
        out.push('');
      }
    }

    if (section === 'projects' && doc.projects.length) {
      out.push(`\n## ${sectionTitle('projects', lang)}\n`);
      for (const p of doc.projects) {
        const head = p.url ? `[${p.name}](${p.url})` : p.name;
        out.push(`### ${head}`);
        out.push(p.description);
        for (const h of p.highlights) out.push(`- ${h}`);
        if (p.stack.length) out.push(`\n${UI.stack[lang]}: ${p.stack.join(', ')}`);
        out.push('');
      }
    }

    if (section === 'skills' && doc.skills.length) {
      out.push(`\n## ${sectionTitle('skills', lang)}\n`);
      for (const g of doc.skills) {
        out.push(`- **${g.name}:** ${g.items.join(', ')}`);
      }
    }

    if (section === 'languages' && doc.languages.length) {
      out.push(`\n## ${sectionTitle('languages', lang)}\n`);
      for (const l of doc.languages) out.push(`- **${l.name}** — ${l.level}`);
    }

    if (section === 'education' && doc.education.length) {
      out.push(`\n## ${sectionTitle('education', lang)}\n`);
      for (const e of doc.education) {
        const parts = [e.degree, e.field].filter(Boolean).join(', ');
        const when =
          e.start || e.end
            ? ` (${[e.start, e.end ? endLabel(e.end, lang) : undefined]
                .filter(Boolean)
                .join(' — ')})`
            : '';
        out.push(`- **${e.institution}**${parts ? ` — ${parts}` : ''}${when}`);
      }
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
