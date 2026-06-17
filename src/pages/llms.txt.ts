import type { APIRoute } from 'astro';
import { loadContent } from '../lib/load';
import { absUrl } from '../lib/canonical';

/**
 * llms.txt по конвенции (https://llmstxt.org): точка входа для ИИ-инструментов.
 * Указывает на полный markdown и структурированные данные — чистый текст
 * предпочтительнее HTML для LLM. English-first (международная аудитория).
 */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL;
  const { profile, summary } = loadContent();
  const general =
    summary.variants.find((v) => v.id === 'summary-general') ?? summary.variants[0];
  const u = (path: string) => absUrl(site, base, path);

  const contacts = [
    profile.email,
    ...profile.links.map((l) => `${l.label}: ${l.url}`),
  ]
    .filter(Boolean)
    .join(' · ');

  const lines = [
    `# ${profile.name.en} — ${profile.title.en}`,
    '',
    `> ${general.text.en}`,
    '',
    contacts ? `Contact: ${contacts}` : '',
    '',
    '## Full résumé (Markdown)',
    `- [Full résumé — English](${u('en/resume.md')})`,
    `- [Полное резюме — русский](${u('ru/resume.md')})`,
    '',
    '## Structured data (JSON Resume)',
    `- [JSON Resume — English](${u('en/resume.json')})`,
    `- [JSON Resume — русский](${u('ru/resume.json')})`,
    '',
    '## Website',
    `- [Resume website](${u('')})`,
    '',
  ];

  // BOM: статика отдаёт .txt как text/plain без charset; BOM заставляет браузер
  // распознать UTF-8 (иначе кириллица в summary — кракозябры).
  return new Response(String.fromCharCode(0xfeff) + lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
