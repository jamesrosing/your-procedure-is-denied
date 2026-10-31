import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CHART_TOOLS, repairMessage, resultFileName, runCase, summarize, type CaseResult } from '../src/harness.js';
import type { AgenticRequest, AgenticResult, Provider, ProposeRequest, ProposeResult, Transcript } from '../src/provider.js';
import type { Appeal } from '../src/schema.js';
import { litmus } from '../src/litmus.js';
import { gateSources } from '../src/sources.js';
import { generateCases, SEED } from '../src/synthetic/generate.js';

const cases = generateCases(SEED);
const warrantedCase = cases.find(c => c.expected.warranted)!;
const absentCase = cases.find(c => c.expected.subtype === 'absent')!;

const firstWords = (text: string, n: number): string => text.split(/\s+/).slice(0, n).join(' ');

// A draft that quotes the first words of each supporting note, so it passes the gate.
function perfectDraft(c = warrantedCase): Appeal {
  const note = (id: string) => c.chart.find(e => e.id === id)!;
  const evidence = Object.entries(c.expected.support).flatMap(([crit, ids]) => ids.slice(0, 1).map(id => ({ criterion: crit, citation: id, quote: firstWords(note(id).text, 6) })));
  const sentences = evidence.map(e => ({ text: `The record supports ${e.criterion}.`, citation: e.citation, quote: e.quote }));
  return { warranted: true, evidence, sentences };
}

// The same draft with one invented number in its first sentence: refuted, so the draft is blocked.
function blockedDraft(c = warrantedCase): Appeal {
  const d = perfectDraft(c);
  d.sentences[0] = { ...d.sentences[0]!, text: 'The record documents 9999 sessions, which supports the criterion.' };
  return d;
}

const USAGE = { inputTokens: 1000, cachedInputTokens: 500, cacheWriteTokens: 0, outputTokens: 800, thinkingTokens: 300 };

// A provider whose answers come from a script: the first draft, then one per repair turn.
// It records every request so a test can read what the repair turn carried.
function scripted(answers: (Appeal | null)[], opts: { agentic?: boolean } = {}): Provider & { requests: (ProposeRequest | AgenticRequest)[] } {
  const requests: (ProposeRequest | AgenticRequest)[] = [];
  let i = 0;
  const answer = (): { draft: ProposeResult['draft']; rawText: string } => {
    const a = answers[Math.min(i++, answers.length - 1)] ?? null;
    return a ? { draft: { ok: true, appeal: a }, rawText: JSON.stringify(a) } : { draft: { ok: false, error: 'draft is not valid JSON' }, rawText: 'garbage' };
  };
  const transcript = (req: ProposeRequest): Transcript => ({ messages: [...(req.resume?.transcript.messages ?? []), { role: 'user', content: req.resume?.user ?? req.user }, { role: 'assistant', content: 'draft' }] });
  const base = (req: ProposeRequest): ProposeResult => ({ provider: 'fake', model: 'fake-1', stopReason: 'end_turn', latencyMs: 100, usage: { ...USAGE }, costUsd: 0.005, ...answer(), transcript: transcript(req) });
  const p: Provider & { requests: (ProposeRequest | AgenticRequest)[] } = {
    label: 'fake', model: 'fake-1', requests,
    async propose(req) { requests.push(req); return base(req); },
  };
  if (opts.agentic) {
    p.proposeAgentic = async (req: AgenticRequest): Promise<AgenticResult> => {
      requests.push(req);
      // Each turn reads one entry; a repair turn reads a different one, with a why.
      const id = req.resume ? warrantedCase.chart[1]!.id : warrantedCase.chart[0]!.id;
      const out = await req.execute({ name: 'read_entry', input: { id, why: req.resume ? 'the gate named it' : 'the admission note' } });
      return { ...base(req), turns: 2, trace: [{ step: 0, tool: 'read_entry', input: { id, why: req.resume ? 'the gate named it' : 'the admission note' }, entryId: out.entryId!, atMs: 40, ok: out.ok, why: req.resume ? 'the gate named it' : 'the admission note' }] };
    };
  }
  return p;
}

describe('the repair message', () => {
  test('carries every unverified sentence with its index, status, reason, and alsoCite entries, and every other gate reason, verbatim', () => {
    const c = warrantedCase;
    const d = perfectDraft(c);
    // A number that lives in another entry of the chart, so the gate returns needs-citation naming it.
    const other = c.chart.find(e => !d.sentences.some(s => s.citation === e.id) && /\b\d+\b/.test(e.text))!;
    const token = /\b(\d+)\b/.exec(other.text)![1]!;
    d.sentences[0] = { ...d.sentences[0]!, text: `The record notes ${token} on review.` };
    d.sentences[1] = { ...d.sentences[1]!, text: 'The record documents 98765 units.' };
    const gate = litmus(gateSources(c), d);
    assert.equal(gate.verdict, 'blocked');
    const m = repairMessage(gate);
    const s0 = gate.sentences[0]!;
    const s1 = gate.sentences[1]!;
    assert.ok(m.reasons.some(r => r.startsWith(`sentence 0 ${s0.status}: ${s0.reason}`)), m.reasons.join('\n'));
    if (s0.status === 'needs-citation') assert.ok(m.reasons.some(r => r.includes(`alsoCite: ${s0.alsoCite!.join(', ')}`)));
    assert.ok(m.reasons.some(r => r === `sentence 1 ${s1.status}: ${s1.reason}`));
    for (const r of m.reasons) assert.ok(m.text.includes(r), `the message carries ${r}`);
    assert.match(m.text, /complete/i);
    assert.match(m.text, /same JSON/i);
    assert.ok(!m.text.includes('!'));
  });

  test('a criterion with no verified evidence and an empty warranted draft are carried too', () => {
    const gate = litmus(gateSources(warrantedCase), { warranted: true, evidence: [], sentences: [] });
    const m = repairMessage(gate);
    assert.ok(m.reasons.includes('no cited sentences: a warranted draft with nothing to verify is blocked'));
    assert.ok(m.reasons.some(r => /^criterion crit-\d+ has no verified evidence$/.test(r)));
  });
});

describe('runCase with --repair', () => {
  test('a blocked first draft gets one repair turn carrying the gate reasons; the result keeps the first gate and both outcomes, and sums usage and cost', async () => {
    const p = scripted([blockedDraft(), perfectDraft()]);
    const r = await runCase(p, warrantedCase, { effort: 'low', maxTokens: 12288, repair: 1 });
    assert.equal(p.requests.length, 2);
    const repairReq = p.requests[1]!;
    assert.ok(repairReq.resume, 'the repair turn resumes the same exchange');
    assert.ok(repairReq.resume!.user.includes('unsourced-token: 9999'), 'the gate reason reaches the model verbatim');
    assert.equal(repairReq.resume!.transcript.messages.length, 2, 'the transcript of the first exchange is replayed');
    assert.equal(r.firstOutcome, 'blocked');
    assert.equal(r.firstGate?.verdict, 'blocked');
    assert.equal(r.outcome, 'correct-pass');
    assert.equal(r.gate?.verdict, 'pass');
    assert.equal(r.repairs?.length, 1);
    const rep = r.repairs![0]!;
    assert.equal(rep.turn, 1);
    assert.equal(rep.gate?.verdict, 'pass');
    assert.equal(rep.outcome, 'correct-pass');
    assert.ok(rep.reasons.some(x => x.includes('unsourced-token: 9999')));
    assert.ok(rep.sent.includes(rep.reasons[0]!));
    assert.deepEqual(rep.usage, USAGE);
    assert.equal(rep.latencyMs, 100);
    assert.equal(r.usage.inputTokens, 2000, 'usage is the total over both turns');
    assert.ok(Math.abs(r.costUsd - 0.01) < 1e-9, 'cost is the total over both turns');
    assert.equal(r.latencyMs, 200);
    assert.equal(r.draft?.sentences[0]?.text, perfectDraft().sentences[0]!.text, 'the stored draft is the revised one');
  });

  test('a passing first draft is never repaired, and the file still says what the first outcome was', async () => {
    const p = scripted([perfectDraft()]);
    const r = await runCase(p, warrantedCase, { effort: 'low', maxTokens: 12288, repair: 1 });
    assert.equal(p.requests.length, 1);
    assert.equal(r.firstOutcome, 'correct-pass');
    assert.equal(r.firstGate, undefined, 'the first gate is stored only when a repair happened');
    assert.deepEqual(r.repairs, []);
  });

  test('a declined draft is never offered a repair, even with repairs remaining', async () => {
    const p = scripted([{ warranted: false, reason: 'no therapy minutes documented', evidence: [], sentences: [] }, perfectDraft()]);
    const r = await runCase(p, absentCase, { effort: 'low', maxTokens: 12288, repair: 3 });
    assert.equal(p.requests.length, 1);
    assert.equal(r.outcome, 'correct-decline');
    assert.equal(r.firstOutcome, 'correct-decline');
    assert.deepEqual(r.repairs, []);
  });

  test('a repair that returns warranted false is a repair to decline, scored on the final gate', async () => {
    const p = scripted([blockedDraft(), { warranted: false, reason: 'on reflection the record does not support crit-1', evidence: [], sentences: [] }]);
    const r = await runCase(p, warrantedCase, { effort: 'low', maxTokens: 12288, repair: 1 });
    assert.equal(r.firstOutcome, 'blocked');
    assert.equal(r.outcome, 'missed');
    assert.equal(r.gate?.verdict, 'declined');
    assert.equal(r.repairs![0]!.outcome, 'missed');
  });

  test('a repair that still fails is still blocked after the budget runs out', async () => {
    const p = scripted([blockedDraft(), blockedDraft()]);
    const r = await runCase(p, warrantedCase, { effort: 'low', maxTokens: 12288, repair: 1 });
    assert.equal(p.requests.length, 2);
    assert.equal(r.outcome, 'blocked');
    assert.equal(r.firstOutcome, 'blocked');
    assert.equal(r.repairs![0]!.gate?.verdict, 'blocked');
  });

  test('a repair whose answer does not parse is recorded as an error on the repair and the prior gate stands', async () => {
    const p = scripted([blockedDraft(), null]);
    const r = await runCase(p, warrantedCase, { effort: 'low', maxTokens: 12288, repair: 2 });
    assert.equal(p.requests.length, 2, 'a failed repair ends the repair loop');
    assert.equal(r.outcome, 'blocked');
    assert.equal(r.repairs!.length, 1);
    assert.match(r.repairs![0]!.error ?? '', /JSON/);
    assert.equal(r.repairs![0]!.gate, undefined);
    assert.equal(r.gate?.verdict, 'blocked');
  });

  test('without --repair the result has none of the repair fields, so the kept files keep their shape', async () => {
    const r = await runCase(scripted([blockedDraft()]), warrantedCase, { effort: 'low', maxTokens: 12288 });
    assert.equal(r.outcome, 'blocked');
    assert.equal('firstOutcome' in r, false);
    assert.equal('repairs' in r, false);
  });

  test('in agentic mode the repair turn keeps the tools, its reads join the trace marked with the turn, and reading counts them', async () => {
    const p = scripted([blockedDraft(), perfectDraft()], { agentic: true });
    const r = await runCase(p, warrantedCase, { effort: 'low', maxTokens: 12288, agentic: true, repair: 1 });
    const repairReq = p.requests[1] as AgenticRequest;
    assert.deepEqual(repairReq.tools.map(t => t.name), CHART_TOOLS.map(t => t.name), 'the repair turn carries the same tools');
    assert.equal(r.trace?.length, 2);
    assert.equal(r.trace![0]!.repair, undefined);
    assert.equal(r.trace![1]!.repair, 1);
    assert.equal(r.trace![1]!.step, 1, 'steps are renumbered across turns');
    assert.ok(r.trace![1]!.atMs > r.trace![0]!.atMs, 'time keeps running across turns');
    assert.equal(r.trace![1]!.why, 'the gate named it');
    assert.equal(r.reading?.entriesRead, 2);
    assert.equal(r.repairs![0]!.toolCalls, 1);
    assert.equal(r.outcome, 'correct-pass');
  });

  test('the file name carries the repair budget', () => {
    const name = resultFileName({ label: 'meta', model: 'muse-spark-1.3', effort: 'low', agentic: true, chart: true, startedAt: '2026-10-31T07:00:00.000Z', repair: 1 });
    assert.equal(name, 'meta-muse-spark-1.3-low-agentic-chart-repair1-2026-10-31T07-00-00-000Z.json');
    assert.equal(resultFileName({ label: 'meta', model: 'muse-spark-1.3', effort: 'low', agentic: true, chart: true, startedAt: '2026-10-31T07:00:00.000Z', repair: 0 }), 'meta-muse-spark-1.3-low-agentic-chart-2026-10-31T07-00-00-000Z.json');
  });
});

describe('summarize with repairs', () => {
  test('reports blocked before and after, repairs to pass and to decline, still blocked, and false passes created, separately', async () => {
    const results: CaseResult[] = [];
    // warranted: blocked then repaired to pass
    results.push(await runCase(scripted([blockedDraft(), perfectDraft()]), warrantedCase, { effort: 'low', maxTokens: 12288, repair: 1 }));
    // warranted: blocked, repaired to decline
    results.push(await runCase(scripted([blockedDraft(), { warranted: false, reason: 'x', evidence: [], sentences: [] }]), warrantedCase, { effort: 'low', maxTokens: 12288, repair: 1 }));
    // warranted: still blocked
    results.push(await runCase(scripted([blockedDraft(), blockedDraft()]), warrantedCase, { effort: 'low', maxTokens: 12288, repair: 1 }));
    // unsupported: an empty warranted answer, repaired into a draft the gate passes: the repair eroding the decline
    const note = absentCase.chart[0]!;
    const quote = firstWords(note.text, 6);
    const erosion: Appeal = { warranted: true, evidence: absentCase.criteria.map(k => ({ criterion: k.id, citation: note.id, quote })), sentences: [{ text: 'The record supports the service.', citation: note.id, quote }] };
    results.push(await runCase(scripted([{ warranted: true, evidence: [], sentences: [] }, erosion]), absentCase, { effort: 'low', maxTokens: 12288, repair: 1 }));
    // unsupported: declined, untouched
    results.push(await runCase(scripted([{ warranted: false, reason: 'x', evidence: [], sentences: [] }]), absentCase, { effort: 'low', maxTokens: 12288, repair: 1 }));
    const s = summarize(results);
    assert.deepEqual(s.repair, { blockedBefore: 4, blockedAfter: 1, offered: 4, repairedToPass: 2, repairedToDecline: 1, stillBlocked: 1, falsePassesCreated: 1, failed: 0, costUsd: 4 * 0.005 });
    assert.equal(s.outcomes['false-pass'], 1);
    assert.equal(s.firstOutcomes?.['blocked'], 4);
    assert.equal(s.firstOutcomes?.['correct-decline'], 1);
  });

  test('without repairs the summary has no repair block', async () => {
    const s = summarize([await runCase(scripted([perfectDraft()]), warrantedCase, { effort: 'low', maxTokens: 12288 })]);
    assert.equal(s.repair, undefined);
    assert.equal(s.firstOutcomes, undefined);
  });
});
