import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { casesFor, regate } from '../scripts/regate.js';
import { litmus, LITMUS_VERSION } from '../src/litmus.js';
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

// Oct 31 (review): `npm run regate` crashed on two of the committed result
// files, the dictated run and the intake run, because it loaded only
// synthetic/cases and assumed every record was an appeal. These three tests hold
// the committed files themselves to the regate.
const syntheticDir = join(here, '..', 'synthetic');
function committed(sub: string): { path: string; parsed: Parameters<typeof regate>[0] } {
  const dir = join(here, '..', 'results', sub);
  const name = readdirSync(dir).filter(f => f.endsWith('.json')).sort()[0]!;
  return { path: join(dir, name), parsed: JSON.parse(readFileSync(join(dir, name), 'utf8')) as Parameters<typeof regate>[0] };
}

test('a dictated-shape result is regated against the dictated copy of its case, not the original chart', () => {
  const { parsed } = committed('dictated');
  assert.ok(parsed.run.dictated, 'the committed dictated run names its dictated entry');
  const dictatedCases = casesFor(parsed.run, syntheticDir);
  const out = regate(parsed, dictatedCases);
  assert.equal(out.changedVerdicts, 0);
  assert.equal(out.file.results[0]!.gate!.verdict, parsed.results[0]!.gate!.verdict);
  // The original chart is the wrong input for this file, and regate says so rather than mislabeling.
  assert.throws(() => regate(parsed, byId), /inputHash/);
});

test('an intake-shape result, which has no drafts, gates, or keys, passes through unchanged and is not rewritten', () => {
  const { parsed } = committed('intake');
  assert.equal('draft' in parsed.results[0]!, false);
  const out = regate(parsed, casesFor(parsed.run, syntheticDir));
  assert.equal(out.unchanged, true);
  assert.equal(out.changedVerdicts, 0);
  assert.deepEqual(out.file, parsed);
});

test('a regate from the current gate version to itself with nothing changed writes nothing and appends nothing to run.regated', () => {
  const r = payerDecline();
  const file = { run: { litmus: LITMUS_VERSION, regated: [{ from: 'v0', to: LITMUS_VERSION, at: '2026-10-30T00:00:00.000Z', changedVerdicts: 0 }] }, summary: summarize([r]), results: [r] };
  const out = regate(file, byId);
  assert.equal(out.unchanged, true);
  assert.equal(out.file, file);
  assert.equal(out.file.run.regated!.length, 1);
  // A regate from an older version is still recorded, even with nothing changed.
  const older = regate({ ...file, run: { litmus: 'v0' } }, byId);
  assert.equal(older.unchanged, false);
  assert.equal(older.file.run.regated!.length, 1);
  assert.equal(older.file.run.regated![0]!.from, 'v0');
});
