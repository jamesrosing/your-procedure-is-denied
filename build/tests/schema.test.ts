import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { APPEAL_SCHEMA, parseAppeal } from '../src/schema.js';

describe('APPEAL_SCHEMA', () => {
  test('is flat: no $ref, no recursion, nesting depth under 10', () => {
    const json = JSON.stringify(APPEAL_SCHEMA);
    assert.ok(!json.includes('$ref'));
    let depth = 0;
    let max = 0;
    for (const ch of json) {
      if (ch === '{' || ch === '[') max = Math.max(max, ++depth);
      if (ch === '}' || ch === ']') depth--;
    }
    assert.ok(max < 10, `nesting ${max}`);
  });
});

describe('parseAppeal', () => {
  test('accepts a warranted draft with cited sentences', () => {
    const r = parseAppeal(JSON.stringify({ warranted: true, sentences: [{ text: 'A.', citation: 'note-001' }] }));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.appeal.warranted, true);
      assert.equal(r.appeal.sentences.length, 1);
      assert.equal(r.appeal.sentences[0]?.citation, 'note-001');
    }
  });

  test('accepts an unwarranted draft with no sentences and a reason', () => {
    const r = parseAppeal(JSON.stringify({ warranted: false, reason: 'no conservative care documented', sentences: [] }));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.appeal.reason, 'no conservative care documented');
  });

  test('drops sentences with empty text instead of failing the whole draft', () => {
    const r = parseAppeal(JSON.stringify({ warranted: true, sentences: [{ text: '  ', citation: 'note-001' }, { text: 'B.', citation: 'note-002' }] }));
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.appeal.sentences.map(s => s.citation), ['note-002']);
  });

  test('rejects a citation that is not a chart entry id', () => {
    const r = parseAppeal(JSON.stringify({ warranted: true, sentences: [{ text: 'A.', citation: 'the chart' }] }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /citation/);
  });

  test('rejects non-JSON with a short error, never echoing the text', () => {
    const r = parseAppeal('Sure! Here is the appeal: {');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /not valid JSON/);
      assert.ok(!r.error.includes('Sure!'));
    }
  });
});
