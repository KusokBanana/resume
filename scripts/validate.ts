import { loadContent, loadTargets } from '../src/lib/load';
import { compose, targetLangPairs } from '../src/lib/compose';
import { experienceDescription, LINKEDIN_MAX_STACK } from '../src/lib/render-plain';

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

  // Инвариант лендинга: PDF для кнопки «Скачать» берётся у единственного
  // canonical-варианта (downloads.ts). Двух быть не должно, нуля — тоже.
  const canonical = targets.filter((t) => t.canonical);
  if (canonical.length !== 1 || !canonical[0].formats.includes('pdf')) {
    violations.push(
      `canonical-таргетов с форматом pdf должно быть ровно 1, найдено: ${
        canonical.length ? canonical.map((t) => t.id).join(', ') : 'ни одного'
      }`,
    );
  }

  for (const { target, lang } of pairs) {
    const doc = compose(content, target, lang);
    const exp = doc.experience.length;
    const proj = doc.projects.length;
    // summaryId в выводе: видно, какой ролевой вариант «Кратко» реально выбрался
    // (матрица закреплена в test/compose-matrix.test.ts).
    console.log(
      `✓ ${target.id} [${lang}] → ${exp} опыт, ${proj} проектов, summary: ${doc.meta.summaryId ?? 'нет'}`,
    );

    const limit = POSITION_LIMITS[target.system];
    if (limit) {
      for (const e of doc.experience) {
        // Считаем длину так же, как рендерит renderPlain: со стек-кэпом LinkedIn.
        const maxStack = target.system === 'linkedin' ? LINKEDIN_MAX_STACK : Infinity;
        const len = experienceDescription(e, lang, maxStack).length;
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
    throw new Error(`Нарушения:\n  ${violations.join('\n  ')}`);
  }
}

try {
  main();
} catch (err) {
  console.error('\n✗ Валидация не прошла:\n');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
