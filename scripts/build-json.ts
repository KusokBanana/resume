import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent, loadTargets, ROOT } from '../src/lib/load';
import { compose } from '../src/lib/compose';
import { toJsonResume } from '../src/lib/export-jsonresume';
import { variantSlug } from '../src/lib/slug';

const OUT = join(ROOT, 'dist', 'generated');

function main() {
  mkdirSync(OUT, { recursive: true });
  const content = loadContent();
  const targets = loadTargets();
  let n = 0;

  for (const target of targets) {
    if (!target.formats.includes('json')) continue;
    for (const lang of target.languages) {
      const doc = compose(content, target, lang);
      const json = JSON.stringify(toJsonResume(doc), null, 2);
      const file = join(OUT, `${variantSlug(target.id, lang)}.json`);
      writeFileSync(file, json + '\n', 'utf8');
      n++;
      console.log(`✓ ${variantSlug(target.id, lang)}.json`);
    }
  }
  console.log(`\nСгенерировано JSON Resume: ${n}`);
}

main();
