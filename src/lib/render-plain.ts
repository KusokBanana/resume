import type { ResumeDocument, Section, Lang } from '../schema/index';
import { sectionTitle, endLabel, UI } from './labels';

/**
 * Рендер ResumeDocument в «плоский» plain text под textarea hh/LinkedIn.
 *
 * Ключевая идея: поля hh — это обычные <textarea>, они принимают только текст
 * (переносы строк сохраняются, любая разметка теряется). Поэтому здесь НЕТ
 * markdown-символов (`#`, `**`, `[](...)`, `-`): заголовки секций даны капсом,
 * пункты — юникод-буллетом `•`. После вставки структура (буллеты + переносы)
 * остаётся. Документ строится по секциям — нужный блок копируется в своё поле.
 */
const dateRange = (start: string, end: string, lang: Lang) =>
  `${start} — ${endLabel(end, lang)}`;

/** Убираем markdown-жирный `**...**`, оставляя сам текст. */
const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1');

/**
 * Текст «поля описания» одной позиции опыта (summary + пункты + группы + стек),
 * без строки должности/дат/компании — на LinkedIn это отдельные поля.
 * Используется и рендером, и проверкой лимита (LinkedIn — 2000 символов).
 */
export function experienceDescription(
  e: ResumeDocument['experience'][number],
  lang: Lang,
): string {
  const out: string[] = [];
  if (e.summary) out.push(stripBold(e.summary));
  for (const h of e.highlights) out.push(`• ${stripBold(h)}`);
  for (const g of e.groups) {
    out.push('', g.title);
    for (const h of g.highlights) out.push(`• ${stripBold(h)}`);
  }
  if (e.stack.length) out.push(`${UI.stack[lang]}: ${e.stack.join(', ')}`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function renderPlain(doc: ResumeDocument, sections: Section[]): string {
  const lang = doc.meta.language;
  const out: string[] = [];
  const heading = (s: Section) => out.push('', sectionTitle(s, lang).toUpperCase(), '');

  // Шапка
  out.push(doc.profile.name);
  out.push(doc.profile.title);
  const contacts = [doc.profile.location, doc.profile.email, doc.profile.phone].filter(
    Boolean,
  );
  if (contacts.length) out.push(contacts.join(' · '));
  for (const l of doc.profile.links) out.push(`${l.label}: ${l.url}`);

  for (const section of sections) {
    if (section === 'summary' && doc.summary) {
      heading('summary');
      out.push(stripBold(doc.summary));
    }

    if (section === 'achievements' && doc.achievements.length) {
      heading('achievements');
      for (const a of doc.achievements) out.push(`• ${stripBold(a)}`);
    }

    if (section === 'experience' && doc.experience.length) {
      heading('experience');
      for (const e of doc.experience) {
        out.push(`${e.role} — ${e.company}`);
        const meta = [dateRange(e.start, e.end, lang), e.location]
          .filter(Boolean)
          .join(' · ');
        out.push(meta);
        out.push(experienceDescription(e, lang));
        out.push('');
      }
    }

    if (section === 'projects' && doc.projects.length) {
      heading('projects');
      for (const p of doc.projects) {
        out.push(p.name);
        out.push(stripBold(p.description));
        for (const h of p.highlights) out.push(`• ${stripBold(h)}`);
        if (p.stack.length) out.push(`${UI.stack[lang]}: ${p.stack.join(', ')}`);
        out.push('');
      }
    }

    if (section === 'skills' && doc.skills.length) {
      heading('skills');
      for (const g of doc.skills) out.push(`${g.name}: ${g.items.join(', ')}`);
    }

    if (section === 'languages' && doc.languages.length) {
      heading('languages');
      for (const l of doc.languages) out.push(`${l.name} — ${l.level}`);
    }

    if (section === 'education' && doc.education.length) {
      heading('education');
      for (const e of doc.education) {
        const parts = [e.degree, e.field].filter(Boolean).join(', ');
        const when =
          e.start || e.end
            ? ` (${[e.start, e.end ? endLabel(e.end, lang) : undefined]
                .filter(Boolean)
                .join(' — ')})`
            : '';
        out.push(`${e.institution}${parts ? ` — ${parts}` : ''}${when}`);
      }
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
