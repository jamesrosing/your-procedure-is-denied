import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fabricatedQuotes, resolvePending, type Commit } from '../scripts/build-log.js';

const commit = (hash: string, author = 'James'): Commit => ({ hash, author, bot: author === 'github-actions[bot]', date: '2026-10-30 09:00', subject: 's', tags: [], results: { added: [], removed: [] } });
const rows = (entries: [string, string][]): Map<string, { date: string; text: string }> => new Map(entries.map(([h, t]) => [h, { date: '2026-10-30', text: t }]));

describe('the ledger pending row', () => {
  test('belongs to HEAD when HEAD is an authored commit without a row', () => {
    const r = resolvePending([commit('aaaaaaa'), commit('bbbbbbb')], rows([['aaaaaaa', 'first'], ['pending', 'second']]));
    assert.equal(r.get('bbbbbbb')?.text, 'second');
    assert.equal(r.has('pending'), false);
  });

  test('skips the build-log bot commit at HEAD and lands on the authored commit beneath it', () => {
    const r = resolvePending([commit('aaaaaaa'), commit('bbbbbbb'), commit('ccccccc', 'github-actions[bot]')], rows([['aaaaaaa', 'first'], ['pending', 'second']]));
    assert.equal(r.get('bbbbbbb')?.text, 'second');
    assert.equal(r.has('ccccccc'), false);
    assert.equal(r.has('pending'), false);
  });

  test('stays pending when every authored commit already has its row', () => {
    const r = resolvePending([commit('aaaaaaa'), commit('ccccccc', 'github-actions[bot]')], rows([['aaaaaaa', 'first'], ['pending', 'next']]));
    assert.equal(r.get('pending')?.text, 'next');
    assert.equal(r.has('ccccccc'), false);
  });
});

describe('fabricated quotes', () => {
  const file = (results: unknown[]) => ({ results } as Parameters<typeof fabricatedQuotes>[0]);
  const refuted = (quote: string, citation: string) => ({ status: 'refuted', reason: 'quote-not-in-entry: the quote does not appear verbatim in ' + citation, quote, citation });

  test('counts a quote the gate refuted in an evidence item, not only in a sentence', () => {
    assert.equal(fabricatedQuotes(file([{ caseId: 'case-040', gate: { sentences: [], evidence: [refuted('Infliximab induction dose 1', 'note-008')] } }])), 1);
  });

  test('counts the same quote once when it sits in both a sentence and an evidence item of one case', () => {
    const q = 'Consent signed for laparoscopic sleeve gastrectomy';
    assert.equal(fabricatedQuotes(file([{ caseId: 'case-022', gate: { sentences: [refuted(q, 'note-031')], evidence: [refuted(q, 'note-031')] } }])), 1);
  });

  test('does not count a refutation for an unsourced token, or a quote that was merely too short', () => {
    const r = file([{ caseId: 'case-032', gate: { sentences: [{ status: 'refuted', reason: 'unsourced-token: 21', quote: 'a b', citation: 'note-001' }], evidence: [{ status: 'refuted', reason: 'quote-too-short: a quote must be at least two words', quote: 'x', citation: 'note-002' }] } }]);
    assert.equal(fabricatedQuotes(r), 0);
  });
});

// --- the post hoc tables (Oct 31) ------------------------------------------------
import { repairRow, effortRow, intakeRows } from '../scripts/build-log.js';

describe('Table 5, the repair turn', () => {
  test('counts blocked before and after, repairs to pass and to decline, still blocked, false passes created, and cost per case with and without the repair, from the per-case records', () => {
    const run = { startedAt: '2026-10-31T06:00:00.000Z', provider: 'meta', model: 'muse-spark-1.3', effort: 'low', cases: 5, agentic: true, repair: 1, tools: ['list_entries', 'read_entry', 'policy_status'] };
    const results = [
      { caseId: 'case-001', outcome: 'correct-pass', firstOutcome: 'blocked', expected: { warranted: true }, costUsd: 0.03, gate: { verdict: 'pass' }, repairs: [{ turn: 1, costUsd: 0.01, latencyMs: 10 }] },
      { caseId: 'case-002', outcome: 'missed', firstOutcome: 'blocked', expected: { warranted: true }, costUsd: 0.03, gate: { verdict: 'declined' }, repairs: [{ turn: 1, costUsd: 0.01, latencyMs: 10 }] },
      { caseId: 'case-003', outcome: 'blocked', firstOutcome: 'blocked', expected: { warranted: true }, costUsd: 0.03, gate: { verdict: 'blocked' }, repairs: [{ turn: 1, costUsd: 0.01, latencyMs: 10 }] },
      { caseId: 'case-004', outcome: 'false-pass', firstOutcome: 'blocked', expected: { warranted: false }, costUsd: 0.03, gate: { verdict: 'pass' }, repairs: [{ turn: 1, costUsd: 0.01, latencyMs: 10 }] },
      { caseId: 'case-005', outcome: 'correct-decline', firstOutcome: 'correct-decline', expected: { warranted: false }, costUsd: 0.02, gate: { verdict: 'declined' }, repairs: [] },
    ];
    const summary = { outcomes: { 'correct-pass': 1, missed: 1, blocked: 1, 'false-pass': 1, 'correct-decline': 1 }, sentencesVerified: 0, costUsd: { perCase: 0.028, total: 0.14 }, latencyMs: { p50: 10 } };
    const row = repairRow({ file: 'x', run, summary, results } as unknown as Parameters<typeof repairRow>[0]);
    assert.equal(row.blockedBefore, 4);
    assert.equal(row.blockedAfter, 1);
    assert.equal(row.repairedToPass, 2);
    assert.equal(row.repairedToDecline, 1);
    assert.equal(row.stillBlocked, 1);
    assert.equal(row.falsePassesCreated, 1);
    assert.equal(row.agreedBefore, 1);
    assert.equal(row.agreedAfter, 2);
    assert.ok(Math.abs(row.costPerCase - 0.028) < 1e-9);
    assert.ok(Math.abs(row.costPerCaseFirstTurn - (0.14 - 0.04) / 5) < 1e-9);
  });
});

describe('Table 6, the effort sweep', () => {
  test('reports agreed, blocked, empty warranted answers, failed, thinking tokens per case, median latency, and cost per case', () => {
    const run = { startedAt: '2026-10-31T06:00:00.000Z', provider: 'meta', model: 'muse-spark-1.3', effort: 'medium', cases: 3, agentic: true, tools: ['list_entries', 'read_entry', 'policy_status'] };
    const results = [
      { caseId: 'case-001', outcome: 'correct-pass', draft: { warranted: true, sentences: [{}] }, gate: { verdict: 'pass', reasons: [] } },
      { caseId: 'case-002', outcome: 'blocked', draft: { warranted: true, sentences: [] }, gate: { verdict: 'blocked', reasons: ['no cited sentences: a warranted draft with nothing to verify is blocked'] } },
      { caseId: 'case-003', outcome: 'error', error: 'parse failed: draft is not valid JSON' },
    ];
    const summary = { outcomes: { 'correct-pass': 1, blocked: 1, error: 1 }, sentencesVerified: 1, costUsd: { perCase: 0.02 }, latencyMs: { p50: 9000 }, tokens: { perCase: { input: 1, output: 2, thinking: 1234 } } };
    const row = effortRow({ file: 'x', run, summary, results } as unknown as Parameters<typeof effortRow>[0]);
    assert.equal(row.effort, 'medium');
    assert.equal(row.agreed, 1);
    assert.equal(row.blocked, 1);
    assert.equal(row.emptyWarranted, 1);
    assert.equal(row.failed, 1);
    assert.equal(row.thinkingPerCase, 1234);
    assert.equal(row.latencyP50Ms, 9000);
    assert.equal(row.costPerCase, 0.02);
  });
});

describe('Table 7, document intake', () => {
  test('one row per field: correct of N and the errors read, from the per-letter field records', () => {
    const file = { run: { model: 'muse-spark-1.3', cases: 2 }, results: [
      { caseId: 'case-001', fields: { carc: { expected: '50', got: '50', correct: true }, billedUsd: { expected: 8000, got: 800, correct: false } } },
      { caseId: 'case-002', fields: { carc: { expected: '197', got: '197', correct: true }, billedUsd: { expected: 25000, got: 25000, correct: true } } },
    ] };
    const rows = intakeRows(file as unknown as Parameters<typeof intakeRows>[0]);
    assert.deepEqual(rows.map(r => [r.field, r.correct, r.total]), [['carc', 2, 2], ['billedUsd', 1, 2]]);
    assert.deepEqual(rows[1]!.errors, ['case-001: read 800 for 8000']);
  });
});
