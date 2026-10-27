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

  test('lists every property as required, so strict-mode hosts accept it', () => {
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const n = node as { type?: string; properties?: Record<string, unknown>; required?: string[]; items?: unknown; additionalProperties?: boolean };
      if (n.type === 'object' && n.properties) {
        assert.deepEqual([...(n.required ?? [])].sort(), Object.keys(n.properties).sort());
        assert.equal(n.additionalProperties, false);
        for (const v of Object.values(n.properties)) walk(v);
      }
      if (n.items) walk(n.items);
    };
    walk(APPEAL_SCHEMA);
  });

  test('every sentence and every evidence item carries a quote', () => {
    const props = APPEAL_SCHEMA.properties;
    assert.ok('quote' in props.sentences.items.properties);
    assert.ok('quote' in props.evidence.items.properties);
    assert.ok('criterion' in props.evidence.items.properties);
  });
});

describe('parseAppeal', () => {
  test('accepts a warranted draft with evidence and quoted sentences', () => {
    const r = parseAppeal(JSON.stringify({
      warranted: true,
      reason: '',
      evidence: [{ criterion: 'crit-1', citation: 'note-001', quote: 'daily by the afternoon' }],
      sentences: [{ text: 'A.', citation: 'note-001', quote: 'daily by the afternoon' }],
    }));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.appeal.warranted, true);
      assert.equal(r.appeal.reason, undefined);
      assert.equal(r.appeal.evidence[0]?.criterion, 'crit-1');
      assert.equal(r.appeal.sentences[0]?.quote, 'daily by the afternoon');
    }
  });

  test('accepts an unwarranted draft with a reason and no sentences', () => {
    const r = parseAppeal(JSON.stringify({ warranted: false, reason: 'no conservative care documented', evidence: [], sentences: [] }));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.appeal.reason, 'no conservative care documented');
  });

  test('tolerates null for optional strings and missing arrays', () => {
    const r = parseAppeal(JSON.stringify({ warranted: true, reason: null, sentences: [{ text: 'A.', citation: 'note-001', quote: null }] }));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.appeal.reason, undefined);
      assert.deepEqual(r.appeal.evidence, []);
      assert.equal(r.appeal.sentences[0]?.quote, '');
    }
  });

  test('drops sentences with empty text, even when their citation is junk', () => {
    const r = parseAppeal(JSON.stringify({ warranted: true, reason: '', evidence: [], sentences: [{ text: '  ', citation: '', quote: '' }, { text: 'B.', citation: 'note-002', quote: 'x y' }] }));
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.appeal.sentences.map(s => s.citation), ['note-002']);
  });

  test('keeps a malformed citation on a real sentence: resolution is the gate\'s job, and it must see the miss', () => {
    const r = parseAppeal(JSON.stringify({ warranted: true, reason: '', evidence: [], sentences: [{ text: 'A.', citation: 'the chart', quote: 'x y' }] }));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.appeal.sentences[0]?.citation, 'the chart');
  });

  test('rejects a draft missing warranted', () => {
    const r = parseAppeal(JSON.stringify({ sentences: [] }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /warranted/);
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
