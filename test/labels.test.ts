import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endLabel, dateRange, durationLabel } from '../src/lib/labels';

test('endLabel: present локализуется, дата отдаётся как есть', () => {
  assert.equal(endLabel('present', 'ru'), 'наст. время');
  assert.equal(endLabel('present', 'en'), 'present');
  assert.equal(endLabel('2020', 'ru'), '2020');
  assert.equal(endLabel('2020-05', 'en'), '2020-05');
});

test('dateRange: соединяет начало и конец', () => {
  assert.equal(dateRange('2019', 'present', 'ru'), '2019 — наст. время');
  assert.equal(dateRange('2019-01', '2020-03', 'en'), '2019-01 — 2020-03');
});

test('durationLabel: русская плюрализация года (1/2/5/11/21)', () => {
  // ровно N лет и 0 месяцев: start YYYY-01, end (YYYY+N-1)-12
  const y = (n: number) => durationLabel('2000-01', `${1999 + n}-12`, 'ru');
  assert.equal(y(1), '1 год');
  assert.equal(y(2), '2 года');
  assert.equal(y(5), '5 лет');
  assert.equal(y(11), '11 лет'); // 11 — исключение (many, не one)
  assert.equal(y(21), '21 год'); // оканчивается на 1, но не 11 → one
});

test('durationLabel: годы + месяцы', () => {
  // 2020-01 .. 2022-07 включительно = 31 мес = 2 года 7 мес
  assert.equal(durationLabel('2020-01', '2022-07', 'ru'), '2 года 7 мес.');
});

test('durationLabel: end=present считается до переданного now', () => {
  const now = new Date('2024-03-15T00:00:00Z');
  // 2023-01 .. 2024-03 включительно = 15 мес = 1 год 3 мес
  assert.equal(durationLabel('2023-01', 'present', 'en', now), '1 yr 3 mos');
  assert.equal(durationLabel('2023-01', 'present', 'ru', now), '1 год 3 мес.');
});

test('durationLabel: минимум 1 месяц', () => {
  assert.equal(durationLabel('2020-05', '2020-05', 'ru'), '1 мес.');
  assert.equal(durationLabel('2020-05', '2020-05', 'en'), '1 mo');
});

test('durationLabel: английская плюрализация yr/yrs, mo/mos', () => {
  assert.equal(durationLabel('2000-01', '2000-12', 'en'), '1 yr');
  assert.equal(durationLabel('2000-01', '2001-12', 'en'), '2 yrs');
});
