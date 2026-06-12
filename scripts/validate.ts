import { loadContent, loadTargets } from '../src/lib/load';
import { compose, targetLangPairs } from '../src/lib/compose';

/** Валидирует весь content + targets и пробует собрать каждый вариант. */
function main() {
  const content = loadContent();
  const targets = loadTargets();
  const pairs = targetLangPairs(targets);

  console.log(`✓ content валиден`);
  console.log(`✓ targets: ${targets.map((t) => t.id).join(', ')}`);

  for (const { target, lang } of pairs) {
    const doc = compose(content, target, lang);
    const exp = doc.experience.length;
    const proj = doc.projects.length;
    console.log(
      `✓ ${target.id} [${lang}] → ${exp} опыт, ${proj} проектов, summary: ${doc.summary ? 'да' : 'нет'}`,
    );
  }
  console.log(`\nВсего вариантов: ${pairs.length}`);
}

try {
  main();
} catch (err) {
  console.error('\n✗ Валидация не прошла:\n');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
