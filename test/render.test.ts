import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/lib/render-md';
import { renderPlain, experienceDescription } from '../src/lib/render-plain';
import { toJsonResume } from '../src/lib/export-jsonresume';
import type { ResumeDocument, Section } from '../src/schema/index';

/** Компактная фикстура, покрывающая все ветки рендера. */
const doc: ResumeDocument = {
  meta: {
    targetId: 't',
    system: 'hh',
    audience: 'hr',
    layout: 'rich',
    language: 'ru',
    label: 'hh',
  },
  profile: {
    name: 'Имя',
    title: 'Роль',
    email: 'a@b.co',
    links: [{ label: 'GH', url: 'https://gh' }],
  },
  summary: 'Кратко о себе.',
  achievements: ['Достижение **X**'],
  experience: [
    {
      company: 'Acme',
      companyUrl: 'https://acme',
      role: 'Инженер',
      location: 'Москва',
      start: '2020-01',
      end: 'present',
      summary: 'Тут работал.',
      metrics: ['**100** метрика'],
      highlights: ['Сделал дело'],
      groups: [{ title: 'Процессы', highlights: ['Наладил'] }],
      stack: ['TS', 'Go'],
    },
  ],
  projects: [],
  skills: [{ name: 'Языки', items: ['TS', 'Go'] }],
  languages: [{ name: 'Русский', level: 'родной' }],
  education: [
    { institution: 'МИФИ', degree: 'Магистр', field: 'CS', start: '2013', end: '2015' },
  ],
};
const sections: Section[] = [
  'summary',
  'achievements',
  'experience',
  'skills',
  'languages',
  'education',
];

test('renderMarkdown: golden', () => {
  const expected =
    '# Имя\n**Роль**\na@b.co\n[GH](https://gh)\n\n## Кратко\n\nКратко о себе.\n\n' +
    '## Ключевые результаты\n\n- Достижение **X**\n\n## Опыт работы\n\n' +
    '### Инженер — [Acme](https://acme)\n*2020-01 — наст. время · Москва*\n**100** метрика\n' +
    'Тут работал.\n- Сделал дело\n\n**Процессы**\n- Наладил\n\nСтек: TS, Go\n\n' +
    '## Навыки\n\n- **Языки:** TS, Go\n\n## Языки\n\n- **Русский** — родной\n\n' +
    '## Образование\n\n- **МИФИ** — Магистр, CS (2013 — 2015)\n';
  assert.equal(renderMarkdown(doc, sections), expected);
});

test('renderPlain: golden (капс-заголовки, буллеты •, жирный снят, метрики опущены)', () => {
  const expected =
    'Имя\nРоль\na@b.co\nGH: https://gh\n\nКРАТКО\n\nКратко о себе.\n\n' +
    'КЛЮЧЕВЫЕ РЕЗУЛЬТАТЫ\n\n• Достижение X\n\nОПЫТ РАБОТЫ\n\nИнженер — Acme\n' +
    '2020-01 — наст. время · Москва\nТут работал.\n• Сделал дело\n\nПроцессы:\n• Наладил\n' +
    'Стек: TS, Go\n\nНАВЫКИ\n\nЯзыки: TS, Go\n\nЯЗЫКИ\n\nРусский — родной\n\n' +
    'ОБРАЗОВАНИЕ\n\nМИФИ — Магистр, CS (2013 — 2015)\n';
  assert.equal(renderPlain(doc, sections), expected);
});

test('experienceDescription: стек полный по умолчанию, maxStack режет с хвостом (+N)', () => {
  const e: ResumeDocument['experience'][number] = {
    company: 'Acme',
    role: 'Инженер',
    start: '2020-01',
    end: 'present',
    metrics: [],
    highlights: [],
    groups: [],
    stack: Array.from({ length: 13 }, (_, i) => `T${i + 1}`),
  };
  // Без кэпа (hh и прочие) — все 13 позиций, без «(+N)».
  const full = experienceDescription(e, 'ru');
  assert.ok(full.includes('T13'));
  assert.ok(!full.includes('(+'));
  // С кэпом 12 (LinkedIn) — хвост «… (+1)».
  const capped = experienceDescription(e, 'ru', 12);
  assert.ok(capped.includes('T12'));
  assert.ok(!capped.includes('T13'));
  assert.ok(capped.includes('… (+1)'));
});

test('toJsonResume: present → без endDate, маппинг полей', () => {
  // проверяем сериализованную форму (её и пишет build:json — undefined-ключи выпадают)
  const jr = JSON.parse(JSON.stringify(toJsonResume(doc)));
  assert.equal(jr.basics.name, 'Имя');
  assert.equal(jr.basics.profiles[0].network, 'GH');
  // present трактуется как отсутствие endDate
  assert.equal('endDate' in jr.work[0], false);
  assert.equal(jr.work[0].startDate, '2020-01');
  assert.deepEqual(jr.skills[0], { name: 'Языки', keywords: ['TS', 'Go'] });
  // образование: field→area, degree→studyType, конечная дата остаётся
  assert.equal(jr.education[0].area, 'CS');
  assert.equal(jr.education[0].studyType, 'Магистр');
  assert.equal(jr.education[0].endDate, '2015');
});
