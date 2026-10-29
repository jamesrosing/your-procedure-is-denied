import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline, citedEntries, firstLine, INTRO_FADE_MS, INTRO_LINES, INTRO_NOTES, INTRO_STAMP, introTypeMs, introSchedule, LOOKUP_DWELL_MS, lookupStrip, playDelayMs, scoreboard, stateAt, type ResultsFile, type ViewerCase, type ViewerResult } from '../viewer/src/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, '..', 'results');
const casesDir = join(here, '..', 'synthetic', 'cases');

const files: ResultsFile[] = readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(resultsDir, f), 'utf8')) as ResultsFile);
const cases = new Map<string, ViewerCase>(readdirSync(casesDir).filter(f => f.endsWith('.json')).map(f => {
  const c = JSON.parse(readFileSync(join(casesDir, f), 'utf8')) as ViewerCase;
  return [c.id, c];
}));

const spark = files.find(f => f.run.model === 'muse-spark-1.3')!;
const passing = spark.results.find(r => r.outcome === 'correct-pass')!;
const declined = spark.results.find(r => r.outcome === 'correct-decline')!;
const caseOf = (r: ViewerResult) => cases.get(r.caseId)!;

describe('firstLine', () => {
  test('keeps a short line and cuts a long one at a word boundary', () => {
    assert.equal(firstLine('PT evaluation on admission.'), 'PT evaluation on admission.');
    const long = firstLine('79 year old man admitted for skilled rehabilitation. History of osteoporosis, hypertension, chronic kidney disease stage 3.', 40);
    assert.ok(long.length <= 41 && long.endsWith('…'), long);
    assert.ok(!long.includes(' …'), 'no trailing space before the ellipsis');
  });
});

describe('buildTimeline without a trace', () => {
  test('lights every cited entry at once, then attaches evidence, then stamps sentences, then the verdict', () => {
    const steps = buildTimeline(passing, caseOf(passing));
    assert.equal(steps[0]?.kind, 'read-all');
    const cited = citedEntries(passing);
    assert.ok(cited.length > 0);
    if (steps[0]?.kind === 'read-all') assert.deepEqual(steps[0].entryIds, cited);
    const kinds = steps.map(s => s.kind);
    const lastRead = kinds.lastIndexOf('read-all');
    const firstEvidence = kinds.indexOf('evidence');
    const firstSentence = kinds.indexOf('sentence');
    assert.ok(lastRead < firstEvidence && firstEvidence < firstSentence, kinds.join(','));
    assert.equal(kinds[kinds.length - 1], 'verdict');
    assert.equal(kinds.filter(k => k === 'sentence').length, passing.gate!.sentences.length);
    assert.equal(kinds.filter(k => k === 'evidence').length, passing.gate!.evidence.length);
  });

  test('timestamps never go backwards and end at the call latency', () => {
    const steps = buildTimeline(passing, caseOf(passing));
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i]!.atMs >= steps[i - 1]!.atMs, `step ${i}`);
    assert.equal(steps[steps.length - 1]!.atMs, passing.latencyMs);
  });

  test('a declined case ends in a declined verdict carrying the model reason and no sentences', () => {
    const steps = buildTimeline(declined, caseOf(declined));
    const last = steps[steps.length - 1]!;
    assert.equal(last.kind, 'verdict');
    if (last.kind === 'verdict') {
      assert.equal(last.verdict, 'declined');
      assert.ok(last.declinedReason && last.declinedReason.length > 0);
    }
    assert.equal(steps.filter(s => s.kind === 'sentence').length, 0);
  });

  test('a request error becomes an error verdict', () => {
    const r: ViewerResult = { caseId: passing.caseId, category: passing.category, outcome: 'error', latencyMs: 0, costUsd: 0, error: 'request failed: APIError (HTTP 500)' };
    const steps = buildTimeline(r, caseOf(passing));
    assert.equal(steps.length, 1);
    assert.equal(steps[0]?.kind, 'verdict');
    if (steps[0]?.kind === 'verdict') assert.equal(steps[0].verdict, 'error');
    const s = stateAt(steps, r, caseOf(passing), 1);
    assert.ok(s.criteria.every(k => k.status === 'pending'), 'an error leaves the criteria unchecked, not unverified');
    assert.equal(s.done, true);
  });
});

describe('buildTimeline with a trace', () => {
  const c = caseOf(passing);
  const traced: ViewerResult = {
    ...passing,
    trace: [
      { step: 0, tool: 'list_entries', input: {}, atMs: 900, ok: true, note: '26 entries' },
      { step: 1, tool: 'read_entry', input: { id: 'note-001' }, entryId: 'note-001', atMs: 2100, ok: true },
      { step: 2, tool: 'read_entry', input: { id: 'note-013' }, entryId: 'note-013', atMs: 3400, ok: true },
      { step: 3, tool: 'read_entry', input: { id: 'note-999' }, entryId: 'note-999', atMs: 3900, ok: false, note: 'no such entry' },
      { step: 4, tool: 'policy_status', input: { code: 'KDOB1' }, atMs: 5000, ok: true, live: true, note: 'criteria last verified 2026-10-20' },
    ],
  };

  test('one read step per entry fetched, in trace order; unknown ids are dropped; other tools become lookups', () => {
    const steps = buildTimeline(traced, c);
    const reads = steps.filter(s => s.kind === 'read');
    assert.deepEqual(reads.map(s => (s.kind === 'read' ? s.entryId : '')), ['note-001', 'note-013']);
    const lookups = steps.filter(s => s.kind === 'lookup');
    assert.equal(lookups.length, 2);
    assert.ok(lookups.some(l => l.kind === 'lookup' && l.live && l.tool === 'policy_status'));
    assert.ok(!steps.some(s => s.kind === 'read-all'));
    const firstEvidence = steps.findIndex(s => s.kind === 'evidence');
    assert.ok(steps[firstEvidence]!.atMs >= 5000, 'gate records come after the last tool call');
  });

  test('unread entries stay dim: the state lists only entries the trace fetched', () => {
    const steps = buildTimeline(traced, c);
    const final = stateAt(steps, traced, c, steps.length);
    assert.deepEqual(final.read, ['note-001', 'note-013']);
    assert.equal(final.counters.entriesRead, 2);
    assert.equal(final.counters.chartSize, c.chart.length);
    assert.equal(final.lookups.length, 2);
  });
});

describe('stateAt', () => {
  const c = caseOf(passing);
  const steps = buildTimeline(passing, c);

  test('cursor 0 is the untouched chart: nothing read, every criterion pending, no sentences, no verdict', () => {
    const s = stateAt(steps, passing, c, 0);
    assert.equal(s.read.length, 0);
    assert.ok(s.criteria.every(k => k.status === 'pending' && k.evidence.length === 0));
    assert.equal(s.sentences.length, 0);
    assert.equal(s.verdict, null);
    assert.equal(s.done, false);
    assert.equal(s.counters.sentencesTotal, passing.gate!.sentences.length);
    assert.equal(s.counters.costUsd, 0);
  });

  test('is a pure fold: the state at k matches applying k steps, and the cursor is clamped', () => {
    const mid = Math.floor(steps.length / 2);
    const s = stateAt(steps, passing, c, mid);
    assert.equal(s.cursor, mid);
    const applied = steps.slice(0, mid);
    assert.equal(s.sentences.length, applied.filter(x => x.kind === 'sentence').length);
    assert.equal(s.counters.elapsedMs, applied[applied.length - 1]!.atMs);
    assert.equal(stateAt(steps, passing, c, 999).cursor, steps.length);
    assert.equal(stateAt(steps, passing, c, -3).cursor, 0);
  });

  test('the final state carries the verdict, the cost, every criterion resolved, and the verified count', () => {
    const s = stateAt(steps, passing, c, steps.length);
    assert.ok(s.done);
    assert.equal(s.verdict?.verdict, 'pass');
    assert.equal(s.counters.costUsd, passing.costUsd);
    assert.equal(s.counters.elapsedMs, passing.latencyMs);
    assert.ok(s.criteria.every(k => k.status !== 'pending'));
    assert.equal(s.counters.sentencesVerified, passing.gate!.sentences.filter(x => x.status === 'verified').length);
    for (const k of s.criteria) assert.equal(k.status, passing.gate!.criteria[k.id], k.id);
  });

  test('a blocked draft names the first unverified sentence', () => {
    const blocked = files.flatMap(f => f.results).find(r => r.gate?.verdict === 'blocked');
    assert.ok(blocked, 'the committed runs include one blocked draft');
    const bc = caseOf(blocked);
    const bs = buildTimeline(blocked, bc);
    const s = stateAt(bs, blocked, bc, bs.length);
    assert.equal(s.verdict?.verdict, 'blocked');
    const named = s.verdict?.blockedSentence;
    assert.ok(named !== undefined);
    const sentence = s.sentences.find(x => x.index === named);
    assert.ok(sentence && sentence.status !== 'verified');
    assert.ok(sentence.reason.startsWith('unsourced-token') || sentence.reason.startsWith('needs-citation') || sentence.reason.startsWith('quote-'), sentence.reason);
  });

  test('a declined case resolves the unsupported criterion as unverified and shows the reason', () => {
    const dc = caseOf(declined);
    const ds = buildTimeline(declined, dc);
    const s = stateAt(ds, declined, dc, ds.length);
    assert.equal(s.verdict?.verdict, 'declined');
    assert.ok(s.criteria.some(k => k.status === 'unverified'));
    assert.equal(s.sentences.length, 0);
  });
});

describe('playDelayMs', () => {
  test('compresses model latency, with a floor and a ceiling, and speeds up', () => {
    const c = caseOf(passing);
    const steps = buildTimeline(passing, c);
    for (let i = 0; i < steps.length; i++) {
      const d = playDelayMs(steps, i);
      assert.ok(d >= 220 && d <= 1400, `step ${i}: ${d}`);
    }
    assert.equal(playDelayMs(steps, 1, 2), playDelayMs(steps, 1) / 2);
  });
});

describe('scoreboard', () => {
  test('one row per results file with the README columns, non-agentic rows first', () => {
    const rows = scoreboard(files);
    assert.equal(rows.length, files.length);
    const spark13 = rows.find(r => r.model.startsWith('muse-spark-1.3'))!;
    assert.equal(spark13.agreed, 50);
    assert.equal(spark13.blocked, 0);
    assert.equal(spark13.errors, 0);
    const openAgentic = rows.find(r => r.agentic && r.model.includes('Spark Open'));
    if (openAgentic) assert.equal(openAgentic.errors, 1);
    assert.equal(spark13.sentencesVerified, spark.summary.sentencesVerified);
    assert.equal(spark13.latencyP50Ms, spark.summary.latencyMs.p50);
    assert.ok(spark13.costPerCaseUsd > 0.01 && spark13.costPerCaseUsd < 0.02);
    assert.equal(spark13.agentic, false);
    assert.equal(spark13.entriesRead, null);
    const open = rows.find(r => r.model.includes('Spark Open'))!;
    assert.equal(open.blocked, 1);
    assert.deepEqual(rows.filter(r => !r.agentic).map(r => r.model.split(' ')[0]), ['muse-spark-1.3', 'muse-wonder-1.0', 'Muse']);
    assert.ok(rows.every((r, i) => i === 0 || Number(r.agentic) >= Number(rows[i - 1]!.agentic)), 'agentic rows come last');
  });

  test('an agentic file reports entries read against chart size and support coverage', () => {
    const agentic: ResultsFile = {
      run: { ...spark.run, agentic: true },
      summary: spark.summary,
      results: spark.results.slice(0, 2).map((r, i) => ({ ...r, trace: [{ step: 0, tool: 'read_entry', input: {}, entryId: 'note-001', atMs: 1, ok: true }], reading: { entriesRead: 6 + i, chartSize: 26, supportRead: 3, supportTotal: 4 } })),
    };
    const [row] = scoreboard([agentic]);
    assert.equal(row?.agentic, true);
    assert.equal(row?.entriesRead, 6.5);
    assert.equal(row?.chartSize, 26);
    assert.equal(row?.supportCoverage, 0.75);
    const rows = scoreboard([agentic, spark]);
    assert.equal(rows[0]?.agentic, false);
    assert.equal(rows[1]?.agentic, true);
  });
});

describe('live-tool rows', () => {
  test('a run whose traces carry a live query is flagged and sorted after the plain agentic rows', () => {
    const rows = scoreboard(files);
    const firstLive = rows.findIndex(r => r.live);
    if (firstLive === -1) return; // no live run on disk yet
    assert.ok(rows.slice(firstLive).every(r => r.live && r.agentic), 'live rows sit together at the end');
    assert.ok(rows.slice(0, firstLive).every(r => !r.live));
  });
});

describe('the advisor step', () => {
  test('advice attaches to its criterion after the verdict and never changes the gate status or the verdict', () => {
    const c = cases.get('case-001')!;
    const base = files.find(f => f.results.some(r => r.caseId === 'case-001' && r.gate?.verdict === 'pass'))!.results.find(r => r.caseId === 'case-001')!;
    const r = { ...base, advice: { provider: 'meta', model: 'muse-wonder-1.0', items: [{ criterion: 'crit-1', verdict: 'partial' as const, why: 'answers frequency, not intensity' }, { criterion: 'crit-99', verdict: 'silent' as const, why: '' }] } };
    const steps = buildTimeline(r, c);
    assert.equal(steps[steps.length - 1]!.kind, 'advice');
    assert.equal(steps[steps.length - 2]!.kind, 'verdict');
    const before = stateAt(steps, r, c, steps.length - 1);
    const after = stateAt(steps, r, c, steps.length);
    assert.equal(before.criteria[0]!.advice, undefined);
    assert.deepEqual(after.criteria[0]!.advice, { model: 'muse-wonder-1.0', verdict: 'partial', why: 'answers frequency, not intensity' });
    assert.equal(after.criteria[0]!.status, before.criteria[0]!.status);
    assert.equal(after.verdict?.verdict, 'pass');
    assert.ok(after.done);
    assert.ok(after.criteria.every(k => k.id !== 'crit-99'));
  });
});

describe('the title cards', () => {
  test('three lines, at most thirty words, sentence case, no exclamation marks, no project names; every footnote marker resolves in the notes; the stamp states what was built this week and what was pre-existing', () => {
    assert.equal(INTRO_LINES.length, 3);
    const markers = new Set<string>();
    for (const line of INTRO_LINES) {
      assert.ok(line.split(/\s+/).length <= 30, line);
      assert.ok(!line.includes('!'));
      assert.match(line, /^[A-Z]/);
      assert.match(line, /\.[\u00b9\u00b2\u00b3]?$/, line);
      assert.doesNotMatch(line, /\b(heme|writ|CHART|LITMUS|HIPPS|CARC|Muse)\b/, line);
      for (const m of line.match(/[\u00b9\u00b2\u00b3]/g) ?? []) markers.add(m);
    }
    assert.ok(markers.size >= 2, 'the cited statements carry markers');
    for (const m of markers) assert.ok(INTRO_NOTES.includes(`${m} `), `note for ${m}`);
    assert.match(INTRO_NOTES, /^\u00b9 /);
    assert.match(INTRO_STAMP, /^Built this week: /);
    assert.match(INTRO_STAMP, /Pre-existing/);
    assert.ok(!INTRO_STAMP.includes('!'));
  });
  test('the opening reaches the first replay frame within the twenty-second video budget', () => {
    const s = introSchedule();
    const firstReplayFrame = s[s.length - 1]!.hide + INTRO_FADE_MS;
    assert.ok(firstReplayFrame <= 20_000, `${firstReplayFrame} ms from the first frame to the first replay frame`);
  });
  test('behind the cards nothing is lit: at cursor 0 every entry is dim, no criterion has evidence, a check, or an opinion, and the draft is empty, for every result in every file', () => {
    let checked = 0;
    for (const f of files) for (const r of f.results) {
      const c = cases.get(r.caseId)!;
      const s = stateAt(buildTimeline(r, c), r, c, 0);
      assert.deepEqual(s.read, [], r.caseId);
      assert.equal(s.open, null, r.caseId);
      assert.deepEqual(s.lookups, [], r.caseId);
      assert.ok(s.criteria.every(k => k.status === 'pending' && k.evidence.length === 0 && k.advice === undefined), r.caseId);
      assert.deepEqual(s.sentences, [], r.caseId);
      assert.equal(s.verdict, null, r.caseId);
      assert.equal(s.counters.entriesRead, 0, r.caseId);
      assert.equal(s.counters.sentencesVerified, 0, r.caseId);
      assert.equal(s.done, false, r.caseId);
      checked += 1;
    }
    assert.ok(checked >= 450, String(checked));
  });
  test('each card types at about twenty-eight characters a second, holds once complete, and the cards never overlap', () => {
    assert.equal(introTypeMs('abcd'), 144);
    const s = introSchedule();
    for (const slot of s) assert.ok(slot.show < slot.typed && slot.typed < slot.hide);
    for (let i = 1; i < s.length; i++) assert.ok(s[i]!.show >= s[i - 1]!.hide, 'no overlap');
    const total = s[s.length - 1]!.hide;
    assert.ok(total > 9000 && total < 25000, String(total));
  });
});

describe('the live CHART query, shown as a strip while it is the last step applied', () => {
  const liveFile = files.find(f => f.results.some(r => (r.trace ?? []).some(t => t.live === true)))!;
  const liveResult = liveFile.results.find(r => (r.trace ?? []).some(t => t.live === true && t.tool === 'policy_status'))!;
  const c = cases.get(liveResult.caseId)!;
  const steps = buildTimeline(liveResult, c);
  const at = steps.findIndex(s => s.kind === 'lookup' && s.live);

  test('a live lookup step carries its question: the authority, the code, and the date of service', () => {
    const step = steps[at]!;
    assert.equal(step.kind, 'lookup');
    if (step.kind === 'lookup') {
      assert.equal(step.live, true);
      assert.deepEqual(step.input, { authority: 'cms', code: c.procedure.code, asOf: c.denial.dateOfService });
    }
  });

  test('the state carries the strip only while the last step applied is a live lookup: payer, authority, index, question, answer', () => {
    const during = stateAt(steps, liveResult, c, at + 1);
    assert.ok(during.strip, 'strip present at the lookup');
    assert.equal(during.strip!.payer, c.payer.name);
    assert.equal(during.strip!.authority, 'CMS');
    assert.match(during.strip!.index, /CHART/);
    assert.match(during.strip!.question, new RegExp(`${c.procedure.code}.*${c.denial.dateOfService}`));
    assert.match(during.strip!.answer, /criteria last changed \d{4}-\d{2}-\d{2}, last checked \d{4}-\d{2}-\d{2}/);
    assert.ok(!during.strip!.answer.startsWith('cms:'), 'the authority is its own node, not a prefix on the answer');
    assert.equal(stateAt(steps, liveResult, c, at).strip, null, 'nothing before the lookup');
    assert.equal(stateAt(steps, liveResult, c, at + 2).strip, null, 'gone once the next step applies');
    assert.equal(lookupStrip({ kind: 'lookup', tool: 'policy_status', note: 'CHART HTTP 402', live: true, atMs: 0 }, c)?.answer, 'CHART HTTP 402', 'a failed query still shows its answer');
    assert.equal(lookupStrip({ kind: 'lookup', tool: 'list_entries', note: '26 entries', live: false, atMs: 0 }, c), null, 'no strip for an index listing');
  });

  test('playback dwells on a live lookup long enough to read the typed answer, scaled by speed', () => {
    assert.ok(LOOKUP_DWELL_MS >= 3000);
    assert.equal(playDelayMs(steps, at + 1, 1), Math.max(LOOKUP_DWELL_MS, playDelayMs(steps.map((s, i) => i === at ? { ...s, live: false } : s), at + 1, 1)));
    assert.equal(playDelayMs(steps, at + 1, 2), playDelayMs(steps, at + 1, 1) / 2);
    assert.ok(playDelayMs(steps, at, 1) <= 1400, 'the step into the lookup is paced as before');
  });
});
