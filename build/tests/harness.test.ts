import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, gateSources, classify, expectedFor, INSTRUCTIONS_PAYER, mapWithConcurrency, resolveOutDir, resultFileName, runCase, summarize, type CaseResult } from '../src/harness.js';
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
    // Roughly four characters per token: the shared block has to clear the cache minimum (1,024 tokens) with margin.
    assert.ok(req.system[0]!.text.length >= 4600, `shared block is ${req.system[0]!.text.length} chars, too short to be cached`);
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

describe('agentic harness', async () => {
  const { chartIndex, chartToolExecutor, CHART_TOOLS, buildAgenticRequest, INSTRUCTIONS_AGENTIC } = await import('../src/harness.js');
  type AgenticProvider = Provider & { proposeAgentic: NonNullable<Provider['proposeAgentic']> };

  test('the chart index carries id, date, kind, and the opening words of each entry, never the whole text', () => {
    const index = chartIndex(warrantedCase);
    for (const e of warrantedCase.chart) assert.ok(index.includes(`${e.id} ${e.date} ${e.kind}`), `${e.id} missing from the index`);
    const longest = warrantedCase.chart.reduce((a, b) => (a.text.length > b.text.length ? a : b));
    assert.ok(!index.includes(longest.text), 'the index must not contain a full entry');
    assert.ok(index.split('\n').length >= warrantedCase.chart.length);
  });

  test('list_entries returns the index and read_entry returns one entry in full, or an error for an unknown id', async () => {
    const execute = chartToolExecutor(warrantedCase);
    const list = await execute({ name: 'list_entries', input: {} });
    assert.equal(list.ok, true);
    assert.ok(list.content.includes(warrantedCase.chart[0]!.id));
    const e = warrantedCase.chart[3]!;
    const read = await execute({ name: 'read_entry', input: { id: e.id } });
    assert.equal(read.ok, true);
    assert.equal(read.entryId, e.id);
    assert.ok(read.content.includes(`[${e.id}] ${e.date} ${e.kind}`) && read.content.includes(e.text));
    const bad = await execute({ name: 'read_entry', input: { id: 'note-999' } });
    assert.equal(bad.ok, false);
    assert.equal(bad.entryId, 'note-999');
    const unknown = await execute({ name: 'policy_status', input: {} });
    assert.equal(unknown.ok, false);
  });

  test('the agentic request puts the shared instructions in a cached block and the index, not the chart, in the second', async () => {
    const req = buildAgenticRequest(warrantedCase, 'low', 12288);
    assert.equal(req.system[0]?.cache, true);
    assert.ok(req.system[0]!.text.length >= 4600, 'shared block too short to be cached');
    assert.ok(req.system[0]!.text.includes('read_entry'));
    assert.ok(!req.system[0]!.text.includes(warrantedCase.id));
    const longest = warrantedCase.chart.reduce((a, b) => (a.text.length > b.text.length ? a : b));
    assert.ok(!req.system[1]!.text.includes(longest.text));
    assert.deepEqual(req.tools.map(t => t.name), CHART_TOOLS.map(t => t.name));
    assert.ok(req.user.includes(`CARC ${warrantedCase.denial.carc}`));
    assert.ok(INSTRUCTIONS_AGENTIC.includes('list_entries'));
    assert.ok(!req.system[1]!.text.includes('policy_status'));
    const { POLICY_STATUS_TOOL } = await import('../src/chart.js');
    const withChart = buildAgenticRequest(warrantedCase, 'low', 12288, { tools: [POLICY_STATUS_TOOL] });
    assert.ok(withChart.system[1]!.text.includes('policy_status'));
    assert.equal(withChart.system[0]!.text, req.system[0]!.text, 'the cached block must not change when a tool is added');
    assert.deepEqual(withChart.tools.map(t => t.name), ['list_entries', 'read_entry', 'policy_status']);
  });

  test('runCase with agentic records the trace, the entries read against the chart, and whether the key entries were read; the gate is unchanged', async () => {
    const c = warrantedCase;
    const appeal = perfectDraft(c);
    const supportIds = [...new Set(Object.values(c.expected.support).flat())];
    const toRead = [supportIds[0]!, c.expected.distractors[0]!];
    const provider: AgenticProvider = {
      label: 'fake', model: 'fake-1',
      async propose() { throw new Error('agentic run must not call propose'); },
      async proposeAgentic(req) {
        const trace = [];
        await req.execute({ name: 'list_entries', input: {} });
        trace.push({ step: 0, tool: 'list_entries', input: {}, atMs: 10, ok: true });
        for (const id of toRead) {
          const out = await req.execute({ name: 'read_entry', input: { id } });
          trace.push({ step: trace.length, tool: 'read_entry', input: { id }, entryId: out.entryId!, atMs: 20 * trace.length, ok: out.ok });
        }
        return {
          provider: 'fake', model: 'fake-1', stopReason: 'end_turn', latencyMs: 300,
          usage: { inputTokens: 2000, cachedInputTokens: 3000, cacheWriteTokens: 0, outputTokens: 900, thinkingTokens: 400 },
          costUsd: 0.01, draft: { ok: true, appeal }, rawText: JSON.stringify(appeal), turns: 4, trace,
        };
      },
    };
    const r = await runCase(provider, c, { effort: 'low', maxTokens: 12288, agentic: true });
    assert.equal(r.outcome, 'correct-pass');
    assert.equal(r.turns, 4);
    assert.equal(r.trace?.length, 3);
    assert.deepEqual(r.reading, { entriesRead: 2, chartSize: c.chart.length, supportRead: 1, supportTotal: supportIds.length });
    assert.equal(r.gate?.verdict, 'pass');
    const plain = await runCase(fakeProvider(appeal), c, { effort: 'low', maxTokens: 12288 });
    assert.equal(plain.gate?.inputHash, r.gate?.inputHash, 'same draft, same gate record');
  });

  test('summarize reports mean entries read, mean chart size, and support coverage over agentic results', () => {
    const base = { category: 'x', setting: 'outpatient', stakesUsd: 1, expected: { warranted: true }, provider: 'fake', model: 'fake-1', stopReason: 'end_turn', latencyMs: 10, usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, thinkingTokens: 0 }, costUsd: 0.001, outcome: 'correct-pass' as const, warrantedMatch: true, citationPrecision: 1 };
    const s = summarize([
      { ...base, caseId: 'case-001', turns: 4, reading: { entriesRead: 6, chartSize: 20, supportRead: 3, supportTotal: 4 } },
      { ...base, caseId: 'case-002', turns: 2, reading: { entriesRead: 10, chartSize: 30, supportRead: 2, supportTotal: 2 } },
    ]);
    assert.deepEqual(s.reading, { entriesReadPerCase: 8, chartSizePerCase: 25, supportCoverage: 5 / 6, turnsPerCase: 3 });
    assert.equal(summarize([{ ...base, caseId: 'case-001' }]).reading, undefined);
  });
});

describe('gateSources is shared with the viewer', () => {
  test('the harness and src/sources.ts export the same function', async () => {
    const shared = await import('../src/sources.js');
    assert.equal(gateSources, shared.gateSources);
  });
});

describe('the payer side: the same gate pointed at the insurer', () => {
  test('buildRequest for the payer side swaps the shared block and asks for the determination; the chart block is unchanged', () => {
    const req = buildRequest(warrantedCase, 'low', 12288, 'payer');
    const physician = buildRequest(warrantedCase, 'low', 12288);
    assert.equal(req.system[0]!.text, INSTRUCTIONS_PAYER);
    assert.equal(req.system[0]!.cache, true);
    assert.equal(req.system[1]!.text, physician.system[1]!.text);
    assert.match(req.user, /determination/i);
    assert.ok(!req.user.includes('Decide whether an appeal is warranted'));
    assert.ok(req.system[0]!.text.length >= 4600, `payer block is ${req.system[0]!.text.length} chars, too short to be cached`);
    assert.ok(!req.system[0]!.text.includes(warrantedCase.id));
  });

  test('the payer instructions: a medical director signs, the same verifier, warranted means the denial stands, no clinical advice, and the verifier\'s limit is stated', () => {
    for (const re of [/medical director/i, /deterministic gate/i, /warranted to true only if/i, /not clinical advice/i, /not that your reading/i]) assert.match(INSTRUCTIONS_PAYER, re);
    assert.ok(!INSTRUCTIONS_PAYER.includes('!'));
  });

  test('the payer key is the appeal key inverted: a denial is warranted where the record fails a criterion', () => {
    assert.equal(expectedFor(warrantedCase, 'payer').warranted, false);
    assert.equal(expectedFor(declinedCase, 'payer').warranted, true);
    assert.equal(expectedFor(declinedCase, 'payer').subtype, 'absent');
    assert.deepEqual(expectedFor(warrantedCase, 'physician'), { warranted: true });
  });

  test('runCase on the payer side records the side, classifies against the inverted key, and runs the same gate', async () => {
    const note = (id: string) => warrantedCase.chart.find(e => e.id === id)!;
    const [crit, ids] = Object.entries(warrantedCase.expected.support)[0]!;
    const cite = ids[0]!;
    const quote = firstWords(note(cite).text, 6);
    const declining: Appeal = { warranted: false, reason: 'the record documents every criterion', evidence: [{ criterion: crit, citation: cite, quote }], sentences: [] };
    const r1 = await runCase(fakeProvider(declining), warrantedCase, { effort: 'low', maxTokens: 12288, agentic: false, side: 'payer' });
    assert.equal(r1.side, 'payer');
    assert.equal(r1.expected.warranted, false);
    assert.equal(r1.outcome, 'correct-decline');
    assert.equal(r1.warrantedMatch, true);

    // The packet rule holds on this side too: every criterion needs verified evidence of what the record documents.
    const allEvidence = perfectDraft().evidence;
    const fabricated: Appeal = { warranted: true, evidence: allEvidence, sentences: [{ text: 'The record documents only 9999 sessions, short of the requirement.', citation: cite, quote }] };
    const r2 = await runCase(fakeProvider(fabricated), warrantedCase, { effort: 'low', maxTokens: 12288, agentic: false, side: 'payer' });
    assert.equal(r2.outcome, 'blocked');
    assert.equal(r2.gate!.sentences[0]!.status, 'refuted');

    const misreading: Appeal = { warranted: true, evidence: allEvidence, sentences: [{ text: 'The record does not establish this criterion.', citation: cite, quote }] };
    const r3 = await runCase(fakeProvider(misreading), warrantedCase, { effort: 'low', maxTokens: 12288, agentic: false, side: 'payer' });
    assert.equal(r3.outcome, 'false-pass', 'a denial with real quotes under a wrong reading passes the gate: the referential limit from the other chair');

    const physician = await runCase(fakeProvider(perfectDraft()), warrantedCase, { effort: 'low', maxTokens: 12288, agentic: false });
    assert.equal(physician.side, undefined);
    assert.equal(physician.outcome, 'correct-pass');
  });

  test('payer-side files carry the side in their name and land in results/payer, which the viewer and the build log never read', () => {
    const name = resultFileName({ label: 'meta', model: 'muse-spark-1.3', effort: 'low', agentic: false, chart: false, startedAt: '2026-10-30T07:00:00.000Z', side: 'payer' });
    assert.equal(name, 'meta-muse-spark-1.3-low-payer-2026-10-30T07-00-00-000Z.json');
    assert.equal(resultFileName({ label: 'meta', model: 'muse-spark-1.3', effort: 'low', agentic: false, chart: false, startedAt: '2026-10-30T07:00:00.000Z' }), 'meta-muse-spark-1.3-low-2026-10-30T07-00-00-000Z.json');
    assert.equal(resolveOutDir('/repo/build/src', undefined, 'payer'), '/repo/build/src/../results/payer'.replace('/src/../', '/'));
    assert.equal(resolveOutDir('/repo/build/src', undefined), '/repo/build/results');
  });
});
