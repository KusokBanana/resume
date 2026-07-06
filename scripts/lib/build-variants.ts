import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent, loadTargets, ROOT } from '../../src/lib/load';
import { compose } from '../../src/lib/compose';
import { variantSlug } from '../../src/lib/slug';
import type { ResumeDocument } from '../../src/schema/index';

const OUT = join(ROOT, 'dist', 'generated');

/**
 * Общий проход по вариантам под текстовые экспорты (md/json/txt): для каждого
 * target с нужным форматом и каждого его языка собирает ResumeDocument, рендерит
 * его переданной функцией и пишет `dist/generated/<slug>.<ext>`.
 */
export function buildVariants(opts: {
  format: 'md' | 'json' | 'txt';
  ext: string;
  render: (doc: ResumeDocument, target: ReturnType<typeof loadTargets>[number]) => string;
  kind: string;
}): void {
  mkdirSync(OUT, { recursive: true });
  const content = loadContent();
  const targets = loadTargets();
  let n = 0;

  for (const target of targets) {
    if (!target.formats.includes(opts.format)) continue;
    for (const lang of target.languages) {
      const doc = compose(content, target, lang);
      const slug = variantSlug(target.id, lang);
      writeFileSync(join(OUT, `${slug}.${opts.ext}`), opts.render(doc, target), 'utf8');
      n++;
      console.log(`✓ ${slug}.${opts.ext}`);
    }
  }
  console.log(`\n${opts.kind}: ${n}`);
}
