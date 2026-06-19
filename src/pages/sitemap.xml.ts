import type { APIRoute } from 'astro';
import { absUrl } from '../lib/canonical';

/**
 * sitemap.xml: только публичное — лендинг и каноническое резюме для ИИ (md/json).
 * Каталог вариантов живёт под /exports (скрыт, Disallow в robots) и сюда не входит.
 */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL;
  const urls = new Set<string>();

  urls.add(absUrl(site, base, ''));
  urls.add(absUrl(site, base, 'llms.txt'));
  for (const lang of ['ru', 'en'] as const) {
    urls.add(absUrl(site, base, `${lang}/resume.md`));
    urls.add(absUrl(site, base, `${lang}/resume.json`));
  }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...urls].map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
    '\n</urlset>\n';

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
