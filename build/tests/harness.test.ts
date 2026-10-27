import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, gateSources, classify, mapWithConcurrency, runCase, summarize, type CaseResult } from '../src/harness.js';
import type { Provider, ProposeRequest, ProposeResult } from '../src/provider.js';
import type { Appeal } from '../src/schema.js';
import { generateCases, SEED } from '../src/synthetic/generate.js';

const cases = generateCases(SEED);
const warrantedCase = cases.find(c => c.expected.warranted)!;
const declinedCase = cases.find(c => c.expected.subtype === 'absent')!;

function firstWords(text: string, n: number): string {
  return text.split(/\s+/).slice(0, n).join(' ');
}

// A draft that quotes the first words of each supporting note, so it passes the gate.
function perfectDraft(c = warrantedCase): Appeal {
  const note = (id: string) => c.chart.find(e => e.id === id)!;
  const evidence = Object.entries(c.expected.support).flatMap(([crit, ids]) => ids.slice(0, 1).map(id => ({ criterion: crit, citation: id, quote: firstWords(note(id).text, 6) })));
  const sentences = evidence.map(e => ({ text: `The record supports ${e.criterion}.`, citation: e.citation, quote: e.quote }));
  return { warranted: true, evidence, sentences };
}

function fakeProvider(appeal: Appeal | null, opts: { delayMs?: number; onCall?: () => void } = {}): Provider {
  return {
    label: 'fake',
    model: 'fake-1',
    async propose(_req: ProposeRequest): Promise<ProposeResult> {
      opts.onCall?.();
      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
      const draft = appeal ? { ok: true as const, appeal } : { ok: false as const, error: 'draft is not valid JSON' };
      return {
        provider: 'fake', model: 'fake-1', stopReason: 'end_turn', latencyMs: 12,
        usage: { inputTokens: 1000, cachedInputTokens: 500, cacheWriteTokens: 0, outputTokens: 800, thinkingTokens: 300 },
        costUsd: 0.005, draft, rawText: appeal ? JSON.stringify(appeal) : 'garbage',
      };
    },
  };
}

describe('buildRequest', () => {
  test('puts the shared instructions in a cached block and the chart in an uncached one', () => {
    const req = buildRequest(warrantedCase, 'low', 12288);
    assert.equal(req.system.length, 2);
    assert.equal(req.system[0]?.cache, true);
    assert.equal(req.system[1]?.cache, undefined);
    for (const e of warrantedCase.chart) assert.ok(req.system[1]!.text.includes(`[${e.id}] ${e.date} ${e.kind}`), `${e.id} header missing`);
    assert.ok(req.user.includes(`CARC ${warrantedCase.denial.carc}`));
    for (const k of warrantedCase.criteria) assert.ok(req.user.includes(`${k.id}: ${k.text}`));
    assert.equal(req.effort, 'low');
    assert.ok(!req.system[0]!.text.includes(warrantedCase.id), 'the shared block must not vary by case or the cache misses');
  });
});

describe('gateSources', () => {
  test('exposes the chart, the criteria, the denial text, and the case facts', () => {
    const s = gateSources(warrantedCase);
    assert.equal(s.chart.length, warrantedCase.chart.length);
    assert.deepEqual(s.criteria, warrantedCase.criteria);
    assert.ok(s.denial.some(d => d.includes(warrantedCase.denial.text)));
    assert.ok(s.facts!.some(x => x.includes(String(warrantedCase.patient.age))));
  });
});

describe('classify', () => {
  test('maps the expected label and the gate verdict to an outcome', () => {
    assert.equal(classify(true, 'pass'), 'correct-pass');
    assert.equal(classify(true, 'blocked'), 'blocked');
    assert.equal(classify(true, 'declined'), 'missed');
    assert.equal(classify(false, 'declined'), 'correct-decline');
    assert.equal(classify(false, 'pass'), 'false-pass');
    assert.equal(classify(false, 'blocked'), 'blocked');
  });
});

describe('mapWithConcurrency', () => {
  test('never exceeds the cap and preserves order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async n => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5 + (n % 3) * 3));
      inFlight--;
      return n * 2;
    });
    assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    assert.equal(peak, 3);
  });
});

describe('runCase', () => {
  test('a grounded draft on a warranted case is a correct pass with full citation precision', async () => {
    const r = await runCase(fakeProvider(perfectDraft()), warrantedCase, { effort: 'low', maxTokens: 12288 });
    assert.equal(r.outcome, 'correct-pass');
    assert.equal(r.gate?.verdict, 'pass');
    assert.equal(r.warrantedMatch, true);
    assert.equal(r.citationPrecision, 1);
    assert.equal(r.costUsd, 0.005);
    assert.equal(r.stakesUsd, warrantedCase.stakesUsd);
    assert.ok(r.draft && r.draft.sentences.length > 0, 'synthetic runs keep the draft for the demo');
  });

  test('a draft citing the wrong notes passes the gate but scores low citation precision', async () => {
    const c = warrantedCase;
    const wrongNote = c.chart.find(e => c.expected.distractors.includes(e.id))!;
    const draft = perfectDraft(c);
    draft.evidence = draft.evidence.map(e => ({ ...e, citation: wrongNote.id, quote: firstWords(wrongNote.text, 6) }));
    draft.sentences = draft.evidence.map(e => ({ text: `The record supports ${e.criterion}.`, citation: e.citation, quote: e.quote }));
    const r = await runCase(fakeProvider(draft), c, { effort: 'low', maxTokens: 12288 });
    assert.equal(r.gate?.verdict, 'pass');
    assert.equal(r.citationPrecision, 0);
  });

  test('a declined draft on an absent case is a correct decline', async () => {
    const r = await runCase(fakeProvider({ warranted: false, reason: 'no therapy minutes documented', evidence: [], sentences: [] }), declinedCase, { effort: 'low', maxTokens: 12288 });
    assert.equal(r.outcome, 'correct-decline');
    assert.equal(r.gate?.verdict, 'declined');
  });

  test('a parse failure is an error outcome with no gate record and no draft', async () => {
    const r = await runCase(fakeProvider(null), warrantedCase, { effort: 'low', maxTokens: 12288 });
    assert.equal(r.outcome, 'error');
    assert.equal(r.gate, undefined);
    assert.equal(r.draft, undefined);
    assert.match(r.error ?? '', /JSON/);
  });

  test('a provider that throws is an error outcome, and the message never includes the chart', async () => {
    const throwing: Provider = { label: 'fake', model: 'fake-1', propose: async () => { throw new Error(`HTTP 500 body: ${warrantedCase.chart[0]!.text}`); } };
    const r = await runCase(throwing, warrantedCase, { effort: 'low', maxTokens: 12288 });
    assert.equal(r.outcome, 'error');
    assert.ok(!(r.error ?? '').includes(warrantedCase.chart[0]!.text.slice(0, 30)));
  });
});

describe('summarize', () => {
  test('aggregates outcomes, latency percentiles, tokens, cost, stakes, and citation precision', async () => {
    const results: CaseResult[] = [];
    for (const c of cases.slice(0, 6)) {
      const appeal = c.expected.warranted ? perfectDraft(c) : { warranted: false, reason: 'unsupported', evidence: [], sentences: [] };
      results.push(await runCase(fakeProvider(appeal), c, { effort: 'low', maxTokens: 12288 }));
    }
    results.push(await runCase(fakeProvider(null), cases[6]!, { effort: 'low', maxTokens: 12288 }));
    const s = summarize(results);
    assert.equal(s.cases, 7);
    assert.equal(s.outcomes['error'], 1);
    assert.equal((s.outcomes['correct-pass'] ?? 0) + (s.outcomes['correct-decline'] ?? 0), 6);
    assert.equal(s.agreementRate, 6 / 7);
    assert.equal(s.ungroundedSentencesCaught, 0);
    assert.equal(s.checkErrors, 0);
    assert.equal(s.latencyMs.p50, 12);
    assert.equal(s.latencyMs.p95, 12);
    assert.equal(s.tokens.input, 7000);
    assert.equal(s.tokens.thinking, 2100);
    assert.ok(Math.abs(s.costUsd.total - 0.035) < 1e-9);
    assert.ok(Math.abs(s.costUsd.perCase - 0.005) < 1e-9);
    const defended = results.filter(r => r.outcome === 'correct-pass').reduce((n, r) => n + r.stakesUsd, 0);
    assert.equal(s.stakesUsd.defended, defended);
    assert.equal(s.stakesUsd.total, results.reduce((n, r) => n + r.stakesUsd, 0));
    assert.equal(s.citationPrecision, 1);
  });
});
