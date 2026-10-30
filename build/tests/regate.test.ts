import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regate } from '../scripts/regate.js';
import { litmus } from '../src/litmus.js';
import { expectedFor, gateSources, loadCases, summarize, type CaseResult } from '../src/harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const cases = loadCases(join(here, '..', 'synthetic', 'cases'));
const byId = new Map(cases.map(c => [c.id, c]));

// A payer-side result on a case the physician key calls warranted: the payer
// key is the inverse, so a declined determination is a correct decline there
// and a miss under the physician key.
function payerDecline(): CaseResult {
  const c = cases.find(x => x.expected.warranted)!;
  const draft = { warranted: false, reason: 'the record supports the care', evidence: [], sentences: [] };
  const gate = litmus(gateSources(c), draft);
  return {
    caseId: c.id, category: c.category, setting: c.setting, stakesUsd: c.stakesUsd,
    expected: expectedFor(c, 'payer'), side: 'payer',
    provider: 'test', model: 'test', stopReason: 'end_turn', latencyMs: 1,
    usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, thinkingTokens: 0 }, costUsd: 0,
    outcome: 'correct-decline', warrantedMatch: true, citationPrecision: null, draft, gate,
  };
}

test('regate classifies each result against the key stored on it, not the physician key', () => {
  const r = payerDecline();
  assert.equal(r.expected.warranted, false);
  const out = regate({ run: { litmus: 'v0' }, summary: summarize([r]), results: [r] }, byId);
  assert.equal(out.file.results[0]!.outcome, 'correct-decline');
  assert.equal(out.changedVerdicts, 0);
});

test('regate keeps the advisor summary the file already carries', () => {
  const r = payerDecline();
  const advice = { provider: 'test', model: 'test', cases: 1 };
  const out = regate({ run: { litmus: 'v0' }, summary: { ...summarize([r]), advice }, results: [r] }, byId);
  assert.deepEqual(out.file.summary.advice, advice);
});
