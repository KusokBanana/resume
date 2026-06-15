import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent, loadTargets, ROOT } from '../src/lib/load';
import { compose } from '../src/lib/compose';
import { renderPlain } from '../src/lib/render-plain';
import { variantSlug } from '../src/lib/slug';

const OUT = join(ROOT, 'dist', 'generated');

function main() {
  mkdirSync(OUT, { recursive: true });
  const content = loadContent();
  const targets = loadTargets();
  let n = 0;

  for (const target of targets) {
    if (!target.formats.includes('txt')) continue;
    for (const lang of target.languages) {
      const doc = compose(content, target, lang);
      const txt = renderPlain(doc, target.sections);
      const file = join(OUT, `${variantSlug(target.id, lang)}.txt`);
      writeFileSync(file, txt, 'utf8');
      n++;
      console.log(`✓ ${variantSlug(target.id, lang)}.txt`);
    }
  }
  console.log(`\nСгенерировано TXT-файлов: ${n}`);
}

main();
