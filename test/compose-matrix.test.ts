import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadTargets } from '../src/lib/load';
import { compose } from '../src/lib/compose';
import { pdfDownloads } from '../src/lib/downloads';

/**
 * Гейт на РЕАЛЬНОМ контенте (в отличие от compose.test.ts, который проверяет
 * логику на синтетических фикстурах).
 *
 * Зачем: ролевые summary выбираются по priority среди релевантных, и правка одной
 * цифры в content/summary.yaml молча уводит чужое резюме на другой текст —
 * Head-резюме уезжало на тимлидский summary при зелёных validate и тестах.
 * Матрица ниже фиксирует, какой вариант «Кратко» обязан выбираться каждым таргетом.
 */
const EXPECTED_SUMMARY: Record<string, string> = {
  hh: 'summary-em',
  'hh-head': 'summary-head',
  'hh-teamlead': 'summary-teamlead',
  'hh-fullstack': 'summary-fullstack',
  'ats-general': 'summary-ats',
  habr: 'summary-general',
  linkedin: 'summary-general',
};

test('матрица: каждый target выбирает свой ролевой summary', () => {
  const content = loadContent();
  for (const target of loadTargets()) {
    const expected = EXPECTED_SUMMARY[target.id];
    if (!expected) continue; // tailored-* и новые таргеты не гейтим
    for (const lang of target.languages) {
      assert.equal(
        compose(content, target, lang).meta.summaryId,
        expected,
        `target ${target.id} [${lang}] должен брать ${expected}`,
      );
    }
  }
});

test('матрица: все ожидаемые таргеты существуют (карта не устарела)', () => {
  const ids = new Set(loadTargets().map((t) => t.id));
  for (const id of Object.keys(EXPECTED_SUMMARY)) {
    assert.ok(ids.has(id), `в targets/ нет ${id} — обнови карту в этом тесте`);
  }
});

test('canonical: ровно один target помечен canonical и умеет pdf', () => {
  const canonical = loadTargets().filter((t) => t.canonical);
  assert.equal(canonical.length, 1, 'canonical должен быть ровно один');
  assert.ok(canonical[0].formats.includes('pdf'), 'canonical-таргет обязан собирать pdf');
});

test('pdfDownloads: лендинг отдаёт PDF canonical-варианта, base учитывается', () => {
  const canonicalId = loadTargets().find((t) => t.canonical)!.id;
  assert.deepEqual(pdfDownloads('/'), {
    ru: `/generated/${canonicalId}-ru.pdf`,
    en: `/generated/${canonicalId}-en.pdf`,
    nameBase: 'Svyatoslav_Demochkin',
  });
  // Форк на <user>.github.io/<repo>: base без завершающего слеша.
  assert.equal(pdfDownloads('/resume').ru, `/resume/generated/${canonicalId}-ru.pdf`);
});
