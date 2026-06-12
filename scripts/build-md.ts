import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent, loadTargets, ROOT } from '../src/lib/load';
import { compose } from '../src/lib/compose';
import { renderMarkdown } from '../src/lib/render-md';
import { variantSlug } from '../src/lib/slug';

const OUT = join(ROOT, 'dist', 'generated');

function main() {
  mkdirSync(OUT, { recursive: true });
  const content = loadContent();
  const targets = loadTargets();
  let n = 0;

  for (const target of targets) {
    if (!target.formats.includes('md')) continue;
    for (const lang of target.languages) {
      const doc = compose(content, target, lang);
      const md = renderMarkdown(doc, target.sections);
      const file = join(OUT, `${variantSlug(target.id, lang)}.md`);
      writeFileSync(file, md, 'utf8');
      n++;
      console.log(`✓ ${variantSlug(target.id, lang)}.md`);
    }
  }
  console.log(`\nСгенерировано MD-файлов: ${n}`);
}

main();
