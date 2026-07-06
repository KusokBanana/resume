import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderInline } from '../src/lib/inline';

test('escapeHtml экранирует &, <, > (кавычки не трогает)', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('<x>'), '&lt;x&gt;');
  assert.equal(escapeHtml('say "hi"'), 'say "hi"');
  assert.equal(escapeHtml('a<b>&c'), 'a&lt;b&gt;&amp;c');
});

test('renderInline: **жирный** → <strong>, с экранированием вокруг', () => {
  assert.equal(renderInline('**bold**'), '<strong>bold</strong>');
  assert.equal(
    renderInline('**a** & <b>'),
    '<strong>a</strong> &amp; &lt;b&gt;',
  );
  // амперсанд внутри жирного тоже экранируется до вставки <strong>
  assert.equal(renderInline('**A&B**'), '<strong>A&amp;B</strong>');
});

test('renderInline: несколько жирных фрагментов, нежадно', () => {
  assert.equal(renderInline('**a** и **b**'), '<strong>a</strong> и <strong>b</strong>');
});
