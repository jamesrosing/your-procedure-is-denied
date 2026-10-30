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
