import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recheck, recheckLabel, EDIT_HELP, EDIT_NOTE, type EditedSentence } from '../viewer/src/gatecheck.js';
import { checkSentence, litmus } from '../src/litmus.js';
import { gateSources } from '../src/sources.js';
import type { ResultsFile, ViewerCase } from '../viewer/src/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const file = JSON.parse(readFileSync(join(root, 'results', 'meta-muse-spark-1.3-low-agentic-chart-2026-10-28T06-48-41-422Z.json'), 'utf8')) as ResultsFile;
const case001 = JSON.parse(readFileSync(join(root, 'synthetic', 'cases', 'case-001.json'), 'utf8')) as ViewerCase;
const r001 = file.results.find(r => r.caseId === 'case-001')!;
const stored = r001.gate!.sentences;
const s3 = stored[3]!; // "In the first week ... ambulation progressed from 40 feet to 110 feet ..." citing note-013

describe('the gate in the browser: recheck one edited sentence against the same case', () => {
  test('an unchanged stored sentence re-verifies with the same reason the harness recorded', () => {
    for (const s of stored) {
      const out = recheck(case001, { text: s.text, citation: s.citation, quote: s.quote });
      assert.equal(out.status, s.status, s.text);
      assert.equal(out.reason, s.reason);
    }
  });

  test('a number the chart never states is refuted and named', () => {
    assert.match(s3.text, /110 feet/);
    const out = recheck(case001, { text: s3.text.replace('110 feet', '150 feet'), citation: s3.citation, quote: s3.quote });
    assert.equal(out.status, 'refuted');
    assert.match(out.reason, /unsourced-token: 150/);
    assert.deepEqual(out.missing, ['150']);
  });

  test('a number that lives in another entry comes back as needs-citation naming that entry', () => {
    // 300 feet is in note-025 (the later progress note), not in note-013
    const out = recheck(case001, { text: s3.text.replace('110 feet', '300 feet'), citation: s3.citation, quote: s3.quote });
    assert.equal(out.status, 'needs-citation');
    assert.ok(out.alsoCite?.includes('note-025'), out.reason);
  });

  test('moving the citation to an entry that lacks the quote is refuted', () => {
    const out = recheck(case001, { text: s3.text, citation: 'note-001', quote: s3.quote });
    assert.equal(out.status, 'refuted');
    assert.match(out.reason, /quote-not-in-entry/);
  });

  test('changing one word of the quote is refuted; a citation to no entry is unresolved', () => {
    const q = s3.quote.replace(/\b(\w+)\b/, 'altered');
    assert.notEqual(q, s3.quote);
    assert.equal(recheck(case001, { text: s3.text, citation: s3.citation, quote: q }).status, 'refuted');
    assert.equal(recheck(case001, { text: s3.text, citation: 'note-999', quote: s3.quote }).status, 'unresolved');
  });

  test('a swapped side is caught where the entry names the other side', () => {
    const c = structuredClone(case001);
    const e = c.chart.find(x => x.id === 'note-013')!;
    e.text = e.text + ' Left knee without effusion.';
    const good: EditedSentence = { text: 'The left knee was without effusion.', citation: 'note-013', quote: 'Left knee without effusion' };
    assert.equal(recheck(c, good).status, 'verified');
    assert.notEqual(recheck(c, { ...good, text: 'The right knee was without effusion.' }).status, 'verified');
  });

  test('recheck is the harness gate: it agrees with litmus() and checkSentence() record for record, and never mutates its inputs', () => {
    const before = JSON.stringify(case001);
    const whole = litmus(gateSources(case001), r001.draft!);
    whole.sentences.forEach((s, i) => {
      const one = checkSentence(gateSources(case001), { text: s.text, citation: s.citation, quote: s.quote }, i);
      assert.equal(one.status, s.status);
      assert.equal(one.reason, s.reason);
      assert.equal(recheck(case001, { text: s.text, citation: s.citation, quote: s.quote }).reason, s.reason);
    });
    assert.equal(JSON.stringify(case001), before);
  });

  test('labels and copy: every status has a label; the help says the gate runs here and nothing is saved', () => {
    for (const s of ['verified', 'refuted', 'needs-citation', 'unresolved', 'error'] as const) assert.ok(recheckLabel(s).length > 0);
    assert.equal(recheckLabel('needs-citation'), 'needs citation');
    assert.match(EDIT_HELP, /browser/i);
    assert.match(EDIT_HELP, /nothing (is )?saved|not saved/i);
    assert.match(EDIT_NOTE, /re-checked|rechecked/i);
    for (const s of [EDIT_HELP, EDIT_NOTE]) assert.ok(!s.includes('!'));
  });
});

describe('the gate module stays bundleable for the browser', () => {
  test('litmus.ts and sources.ts import nothing from node', () => {
    for (const f of ['litmus.ts', 'sources.ts', 'hash.ts']) {
      const src = readFileSync(join(root, 'src', f), 'utf8');
      assert.ok(!/from 'node:/.test(src), `${f} imports from node:`);
    }
  });
});
