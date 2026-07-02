import type { APIRoute } from 'astro';
import { loadContent } from '../../lib/load';
import { fullDoc } from '../../lib/canonical';
import { renderMarkdown } from '../../lib/render-md';
import { SECTIONS, type Lang } from '../../schema/index';

/** Канонический полный md для каждого языка: /<base>/<lang>/resume.md */
export function getStaticPaths() {
  return [{ params: { lang: 'ru' } }, { params: { lang: 'en' } }];
}

const BOM = String.fromCharCode(0xfeff);

export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Lang;
  const md = renderMarkdown(fullDoc(loadContent(), lang), [...SECTIONS]);
  // BOM: статический хостинг отдаёт .md как text/markdown без charset; BOM
  // заставляет браузер распознать UTF-8 (иначе кириллица — кракозябры).
  return new Response(BOM + md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // Имя файла при сохранении. NB: на статическом GitHub Pages заголовки
      // Response игнорируются (файл отдаётся по расширению) — действует только
      // в astro dev/preview или при переходе на SSR. Для прод-скачивания имя
      // задаёт атрибут download="…" на ссылках (см. exports.astro).
      'Content-Disposition': `inline; filename="resume-${lang}.md"`,
    },
  });
};
