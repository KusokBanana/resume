import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceForSkill,
  orderedCompanies,
  collectAtIds,
  totalMonths,
} from '../src/lib/skill-evidence';
import { skillName, stackFor, globalSkillGroups } from '../src/lib/compose';
import type { Experience, SkillEntry, Skills } from '../src/schema/index';

/** Минимальная запись опыта. */
const exp = (
  id: string,
  start: string,
  end: string,
  company = id.toUpperCase(),
): Experience => ({ id, company, start, end }) as unknown as Experience;

/** Полный SkillEntry (в юнит-тесте дефолты Zod не применяются — задаём явно). */
const skill = (over: Partial<SkillEntry>): SkillEntry =>
  ({ at: [], stack: true, global: true, ...over }) as SkillEntry;

const world = [
  exp('pt', '2024-03', 'present', 'Positive Technologies'),
  exp('vk-lead', '2023-04', '2023-12', 'VK'),
  exp('vk-senior', '2022-08', '2023-04', 'VK'),
  exp('yandex', '2019-01', '2022-05', 'Яндекс'),
];

test('skillName: name язык-нейтрально, иначе ru/en', () => {
  assert.equal(skillName(skill({ name: 'React' }), 'ru'), 'React');
  assert.equal(skillName(skill({ ru: 'найм', en: 'hiring' }), 'ru'), 'найм');
  assert.equal(skillName(skill({ ru: 'найм', en: 'hiring' }), 'en'), 'hiring');
  assert.equal(skillName(skill({ ru: 'найм', en: 'hiring' })), 'hiring'); // по умолчанию en
});

test('evidenceForSkill: места работы по at, новейшие сверху', () => {
  const s = skill({ name: 'React', at: ['yandex', 'pt', 'vk-lead'] });
  assert.deepEqual(
    evidenceForSkill(s, world).map((e) => e.id),
    ['pt', 'vk-lead', 'yandex'],
  );
});

test('evidenceForSkill: несуществующий id пропускается', () => {
  const s = skill({ name: 'X', at: ['nope', 'pt'] });
  assert.deepEqual(
    evidenceForSkill(s, world).map((e) => e.id),
    ['pt'],
  );
});

test('evidenceForSkill: несколько ролей одной компании схлопываются в один пункт', () => {
  // vk-senior 2022-08–2023-04 + vk-lead 2023-04–2023-12 → один VK 2022-08–2023-12, id новейшей роли
  const s = skill({ name: 'X', at: ['vk-senior', 'vk-lead'] });
  const ev = evidenceForSkill(s, world);
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0], {
    id: 'vk-lead',
    company: 'VK',
    start: '2022-08',
    end: '2023-12',
  });
});

const registry: Skills = {
  groups: [
    { id: 'frontend', name: { ru: 'Frontend', en: 'Frontend' }, priority: 90 },
    { id: 'backend', name: { ru: 'Backend', en: 'Backend' }, priority: 70 },
  ],
  items: [
    skill({ name: 'React', at: ['yandex', 'pt'], group: 'frontend' }),
    skill({ ru: 'найм', en: 'hiring', at: ['pt'], stack: false, group: 'frontend' }),
    skill({ name: 'PHP', at: ['yandex'], group: 'backend' }),
    skill({ name: '1C-Bitrix', at: ['yandex'], global: false }),
  ],
};

test('stackFor: только stack:true с этим id, в порядке реестра', () => {
  // pt: React (stack, at pt). найм stack:false → нет. PHP не at pt. Bitrix не at pt.
  assert.deepEqual(stackFor(registry, 'pt'), ['React']);
  // yandex: React, PHP, 1C-Bitrix (все stack:true, at yandex); найм stack:false исключён
  assert.deepEqual(stackFor(registry, 'yandex'), ['React', 'PHP', '1C-Bitrix']);
});

test('stackFor: локализация имени навыка', () => {
  const reg: Skills = {
    groups: [{ id: 'g', name: { ru: 'g', en: 'g' }, priority: 0 }],
    items: [skill({ ru: 'Линукс', en: 'Linux', at: ['pt'], group: 'g' })],
  };
  assert.deepEqual(stackFor(reg, 'pt', 'ru'), ['Линукс']);
  assert.deepEqual(stackFor(reg, 'pt', 'en'), ['Linux']);
});

test('globalSkillGroups: группы по priority, только global-навыки своей группы', () => {
  const groups = globalSkillGroups(registry);
  assert.deepEqual(
    groups.map((g) => g.id),
    ['frontend', 'backend'],
  );
  // frontend: React + найм (global), Bitrix исключён (global:false, и не этой группы)
  assert.deepEqual(
    groups[0].items.map((s) => skillName(s)),
    ['React', 'hiring'],
  );
  assert.deepEqual(
    groups[1].items.map((s) => skillName(s)),
    ['PHP'],
  );
});

test('orderedCompanies: новейшие первыми, дубли по имени схлопнуты, короткая метка', () => {
  const list = [
    ...world,
    exp('freelance', '2017-03', '2017-08', 'Фриланс / прямой заказчик'),
  ];
  const cos = orderedCompanies(list);
  assert.deepEqual(
    cos.map((c) => c.name),
    ['Positive Technologies', 'VK', 'Яндекс', 'Фриланс / прямой заказчик'],
  );
  assert.deepEqual(
    cos.map((c) => c.key),
    ['c0', 'c1', 'c2', 'c3'],
  );
  assert.equal(cos[3].label, 'Фриланс');
});

test('collectAtIds: собирает все id из at навыков', () => {
  assert.deepEqual(collectAtIds(registry.items).sort(), ['pt', 'yandex']);
});

test('totalMonths: пересекающиеся интервалы не считаются дважды', () => {
  assert.equal(
    totalMonths([
      { start: '2016-01', end: '2016-06' },
      { start: '2016-06', end: '2016-12' },
    ]),
    12,
  );
});

test('totalMonths: present считается до переданного now', () => {
  assert.equal(
    totalMonths([{ start: '2024-11', end: 'present' }], new Date(2025, 0, 15)),
    3,
  );
});
