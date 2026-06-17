import type { APIRoute } from 'astro';
import { absUrl } from '../lib/canonical';
import { withBase } from '../lib/url';

/** robots.txt: индексировать всё, кроме скрытой /exports; ссылка на sitemap. */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL;
  const body = [
    'User-agent: *',
    'Allow: /',
    `Disallow: ${withBase(base, 'exports')}`,
    '',
    `Sitemap: ${absUrl(site, base, 'sitemap.xml')}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
