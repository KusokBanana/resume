import type { APIRoute } from 'astro';
import { loadContent } from '../../lib/load';
import { fullDoc } from '../../lib/canonical';
import { toJsonResume } from '../../lib/export-jsonresume';
import type { Lang } from '../../schema/index';

/** Канонический JSON Resume для каждого языка: /<base>/<lang>/resume.json */
export function getStaticPaths() {
  return [{ params: { lang: 'ru' } }, { params: { lang: 'en' } }];
}

export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Lang;
  const json = toJsonResume(fullDoc(loadContent(), lang));
  return new Response(JSON.stringify(json, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
