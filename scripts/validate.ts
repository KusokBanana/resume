import { loadContent, loadTargets } from '../src/lib/load';
import { compose, targetLangPairs } from '../src/lib/compose';
import { experienceDescription } from '../src/lib/render-plain';

/** Лимиты на длину описания одной позиции по системам (символы). */
const POSITION_LIMITS: Record<string, number> = {
  linkedin: 2000,
};

/** Валидирует весь content + targets и пробует собрать каждый вариант. */
function main() {
  const content = loadContent();
  const targets = loadTargets();
  const pairs = targetLangPairs(targets);
  const violations: string[] = [];

  console.log(`✓ content валиден`);
  console.log(`✓ targets: ${targets.map((t) => t.id).join(', ')}`);

  for (const { target, lang } of pairs) {
    const doc = compose(content, target, lang);
    const exp = doc.experience.length;
    const proj = doc.projects.length;
    console.log(
      `✓ ${target.id} [${lang}] → ${exp} опыт, ${proj} проектов, summary: ${doc.summary ? 'да' : 'нет'}`,
    );

    const limit = POSITION_LIMITS[target.system];
    if (limit) {
      for (const e of doc.experience) {
        const len = experienceDescription(e, lang).length;
        if (len > limit) {
          violations.push(
            `${target.id} [${lang}] «${e.company}»: описание ${len} симв. > лимита ${limit}`,
          );
        }
      }
    }
  }
  console.log(`\nВсего вариантов: ${pairs.length}`);

  if (violations.length) {
    throw new Error(
      `Превышен лимит длины описания позиции:\n  ${violations.join('\n  ')}`,
    );
  }
}

try {
  main();
} catch (err) {
  console.error('\n✗ Валидация не прошла:\n');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
