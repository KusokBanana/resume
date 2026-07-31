import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, byPriority, byStartDesc } from '../src/lib/compose';
import type { Content, Target } from '../src/schema/index';

const loc = (s: string) => ({ ru: s, en: s });

/** Минимальный валидный Content с точечными переопределениями для теста. */
function makeContent(over: Partial<Content> = {}): Content {
  return {
    profile: { name: loc('Name'), title: loc('Title'), links: [] },
    summary: { variants: [{ id: 'base', text: loc('base'), tags: {}, priority: 0 }] },
    achievements: { items: [] },
    experience: [],
    projects: [],
    skills: { groups: [], items: [] },
    languages: { items: [] },
    education: { items: [] },
    interests: { items: [] },
    stats: { items: [] },
    theses: { items: [] },
    ...over,
  } as Content;
}

const target = (over: Partial<Target> = {}): Target =>
  ({
    id: 't',
    label: loc('t'),
    languages: ['ru'],
    system: 'hh',
    audience: 'hr',
    formats: ['html'],
    layout: 'rich',
    select: {},
    sections: ['summary', 'experience'],
    ...over,
  }) as Target;

test('summary: выбирается релевантный вариант с наибольшим priority', () => {
  const content = makeContent({
    summary: {
      variants: [
        { id: 'ats', text: loc('ats'), tags: { audience: ['ats'] }, priority: 10 },
        { id: 'hr', text: loc('hr'), tags: {}, priority: 1 },
      ],
    },
  });
  // audience=hr: ats-вариант отфильтрован, несмотря на больший priority
  assert.equal(compose(content, target({ audience: 'hr' }), 'ru').summary, 'hr');
  // includeAll: фильтр аудитории снят → берётся вариант с макс. priority
  assert.equal(compose(content, target({ audience: 'hr' }), 'ru', true).summary, 'ats');
});

test('title: target.title переопределяет profile.title, без него — profile.title', () => {
  const content = makeContent();
  assert.equal(compose(content, target(), 'ru').profile.title, 'Title');
  const t = target({ title: { ru: 'Фулстек', en: 'Fullstack' } });
  assert.equal(compose(content, t, 'ru').profile.title, 'Фулстек');
  assert.equal(compose(content, t, 'en').profile.title, 'Fullstack');
});

test('experience: фильтр по системе блока', () => {
  const content = makeContent({
    experience: [
      {
        id: 'a',
        company: 'A',
        role: loc('A'),
        start: '2020',
        end: 'present',
        highlights: [],
        groups: [],
        metrics: [],
        tags: { systems: ['linkedin'] },
        priority: 0,
      },
      {
        id: 'b',
        company: 'B',
        role: loc('B'),
        start: '2019',
        end: '2020',
        highlights: [],
        groups: [],
        metrics: [],
        tags: {},
        priority: 0,
      },
    ] as Content['experience'],
  });
  const hh = compose(content, target({ system: 'hh' }), 'ru');
  assert.deepEqual(
    hh.experience.map((e) => e.company),
    ['B'],
  );
  const li = compose(content, target({ system: 'linkedin' }), 'ru');
  assert.deepEqual(li.experience.map((e) => e.company).sort(), ['A', 'B']);
});

test('experience: пункты фильтруются попунктно по системе', () => {
  const content = makeContent({
    experience: [
      {
        id: 'a',
        company: 'A',
        role: loc('A'),
        start: '2020',
        end: 'present',
        highlights: [
          { text: loc('common'), tags: {} },
          { text: loc('li-only'), tags: { systems: ['linkedin'] } },
        ],
        groups: [],
        metrics: [],
        tags: {},
        priority: 0,
      },
    ] as Content['experience'],
  });
  assert.deepEqual(
    compose(content, target({ system: 'hh' }), 'ru').experience[0].highlights,
    ['common'],
  );
  assert.deepEqual(
    compose(
      content,
      target({ system: 'linkedin' }),
      'ru',
    ).experience[0].highlights.sort(),
    ['common', 'li-only'],
  );
});

test('select: excludeIds исключает, includeIds переопределяет фильтр', () => {
  const mk = (over: Partial<Content['experience'][number]>) =>
    ({
      id: 'x',
      company: 'X',
      role: loc('X'),
      start: '2020',
      end: '2021',
      highlights: [],
      groups: [],
      metrics: [],
      tags: {},
      priority: 0,
      ...over,
    }) as Content['experience'][number];
  const content = makeContent({
    experience: [
      mk({ id: 'keep' }),
      mk({ id: 'drop' }),
      mk({ id: 'liOnly', tags: { systems: ['linkedin'] } }),
    ],
  });
  // excludeIds: остаётся только keep (drop исключён, liOnly отфильтрован системой hh)
  const ex = compose(
    content,
    target({ system: 'hh', select: { excludeIds: ['drop'] } }),
    'ru',
  );
  assert.equal(ex.experience.length, 1);
  // includeIds переопределяет фильтр по системе → liOnly возвращается (keep+drop+liOnly)
  const inc = compose(
    content,
    target({ system: 'hh', select: { includeIds: ['liOnly'] } }),
    'ru',
  );
  assert.equal(inc.experience.length, 3);
});

test('experience сортируется по дате начала по убыванию', () => {
  const mk = (id: string, start: string) =>
    ({
      id,
      company: id,
      role: loc(id),
      start,
      end: 'present',
      highlights: [],
      groups: [],
      metrics: [],
      tags: {},
      priority: 0,
    }) as Content['experience'][number];
  const content = makeContent({
    experience: [mk('old', '2015'), mk('new', '2023-06'), mk('mid', '2019-01')],
  });
  assert.deepEqual(
    compose(content, target(), 'ru').experience.map((e) => e.company),
    ['new', 'mid', 'old'],
  );
});

test('byPriority / byStartDesc — компараторы', () => {
  assert.deepEqual(
    [{ priority: 1 }, { priority: 3 }, { priority: 2 }]
      .sort(byPriority)
      .map((x) => x.priority),
    [3, 2, 1],
  );
  // YYYY vs YYYY-MM сопоставимы; при равных датах тай-брейк по priority
  const a = { start: '2020', priority: 1 };
  const b = { start: '2020-06', priority: 0 };
  assert.deepEqual([a, b].sort(byStartDesc), [b, a]);
});
