import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withBase } from '../src/lib/url';

test('withBase: корневой base', () => {
  assert.equal(withBase('/', 'ru/resume.md'), '/ru/resume.md');
  assert.equal(withBase('/', '/ru'), '/ru');
  assert.equal(withBase('/'), '/');
});

test('withBase: base без завершающего слеша (форк <user>.github.io/<repo>)', () => {
  assert.equal(withBase('/resume', 'ru'), '/resume/ru');
  assert.equal(withBase('/resume', '/ru'), '/resume/ru');
  assert.equal(withBase('/resume'), '/resume/');
});

test('withBase: base со слешем — не должно быть двойного', () => {
  assert.equal(withBase('/resume/', 'ru'), '/resume/ru');
  assert.equal(withBase('/resume/', '/ru'), '/resume/ru');
  assert.equal(withBase('/resume/'), '/resume/');
});
