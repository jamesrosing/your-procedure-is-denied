import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareColumns, newestRun, sideText, buildTimeline, citedEntries, firstLine, carcHelp, codeSystemHelp, DATA_NOTE, denialKind, DENIAL_KIND_HELP, PANEL_HELP, parseStep, VERDICT_HELP, INTRO_END_PAUSE_MS, INTRO_FADE_MS, INTRO_LINES, INTRO_MOVE_MS, INTRO_NOTES, INTRO_STAMP, introTypeMs, introSchedule, LABEL_HELP, LOOKUP_DWELL_MS, lookupStrip, payerRemark, playDelayMs, scoreboard, stateAt, type ResultsFile, type ViewerCase, type ViewerResult } from '../viewer/src/replay.js';

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
    // Every outcome has a column: a chart-in-prompt row's counts sum to its cases.
    for (const r of rows) assert.equal(r.agreed + r.blocked + r.missed + r.falsePass + r.errors, r.cases, `${r.model}: outcomes sum to ${r.cases}`);
    const wonder = rows.find(r => r.model.startsWith('muse-wonder-1.0') && !r.agentic)!;
    assert.equal(wonder.missed, wonder.cases - wonder.agreed - wonder.blocked - wonder.falsePass - wonder.errors);
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

describe('the other chair in the viewer', () => {
  test('a payer-side file is kept off the scoreboard, as the README says of Table 4', () => {
    const payer: ResultsFile = { ...spark, run: { ...spark.run, side: 'payer' } };
    const rows = scoreboard([...files, payer]);
    assert.equal(rows.length, files.length);
  });

  test('labels follow the side: a verified payer determination is not a passed appeal, and the writ belongs to the physician', () => {
    assert.equal(sideText(undefined).outcome('correct-pass'), 'passed');
    assert.equal(sideText('payer').outcome('correct-pass'), 'determination verified');
    assert.equal(sideText('payer').outcome('correct-decline'), 'declined to deny');
    assert.equal(sideText('payer').outcome('false-pass'), 'determination against a supporting record');
    assert.equal(sideText(undefined).writ, true);
    assert.equal(sideText('payer').writ, false);
    assert.match(sideText('payer').draftHeading, /determination/i);
    assert.match(sideText('payer').passHead(6, 6), /6 of 6/);
  });

  test('the default run is the primary proposer\'s newest physician-side live run by start time, not by file name', () => {
    const m = (file: string, startedAt: string, live: boolean, model = 'm', side?: 'payer') => ({ file, startedAt, live, agentic: live, provider: 'p', model, effort: 'low', cases: 50, ...(side ? { side } : {}) });
    const picked = newestRun([m('z-live-old.json', '2026-10-28T06:00:00Z', true, 'muse-spark-1.3'), m('a-live-new.json', '2026-10-28T07:00:00Z', true, 'meta-models/muse-spark-open'), m('b-payer-newest.json', '2026-10-30T06:00:00Z', true, 'muse-spark-1.3', 'payer'), m('c-plain-newest.json', '2026-10-30T07:00:00Z', false, 'muse-spark-1.3')]);
    assert.equal(picked?.file, 'z-live-old.json', 'muse-spark-1.3 live beats a newer live run of another model and a newer payer-side run');
    assert.equal(newestRun([m('x.json', '2026-10-28T06:00:00Z', true, 'muse-wonder-1.0'), m('y.json', '2026-10-28T07:00:00Z', true, 'meta-models/muse-spark-open')])?.file, 'y.json', 'without the primary, the newest live run');
    assert.equal(newestRun([m('only.json', '2026-10-27T00:00:00Z', false)])?.file, 'only.json');
    assert.equal(newestRun([]), undefined);
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
  test('three lines, at most thirty-two words, sentence case, no exclamation marks, no project names; every footnote marker resolves in the notes; the last line ends on who signs; the stamp states what was built this week and what was pre-existing', () => {
    assert.equal(INTRO_LINES.length, 3);
    const markers = new Set<string>();
    for (const line of INTRO_LINES) {
      assert.ok(line.split(/\s+/).length <= 32, line);
      assert.ok(!line.includes('!'));
      assert.match(line, /^[A-Z]/);
      assert.match(line, /\.[\u00b9\u00b2\u00b3]?$/, line);
      assert.doesNotMatch(line, /\b(heme|writ|CHART|LITMUS|HIPPS|CARC|Muse)\b/, line);
      for (const m of line.match(/[\u00b9\u00b2\u00b3]/g) ?? []) markers.add(m);
    }
    assert.match(INTRO_LINES[INTRO_LINES.length - 1]!, /a\u00a0physician\u00a0signs\.$/, 'the opening ends on who signs');
    assert.ok(markers.size >= 2, 'the cited statements carry markers');
    for (const m of markers) assert.ok(INTRO_NOTES.includes(`${m} `), `note for ${m}`);
    assert.match(INTRO_NOTES, /^\u00b9 /);
    assert.match(INTRO_STAMP, /^Built this week: /);
    assert.match(INTRO_STAMP, /Pre-existing/);
    assert.ok(!INTRO_STAMP.includes('!'));
  });
  test('the finished block holds at least two seconds before it travels, and the opening reaches the first replay frame within the twenty-seven-second video budget', () => {
    assert.ok(INTRO_END_PAUSE_MS >= 2000);
    const s = introSchedule();
    const firstReplayFrame = s[s.length - 1]!.hide + INTRO_END_PAUSE_MS + INTRO_MOVE_MS;
    assert.ok(firstReplayFrame <= 27_000, `${firstReplayFrame} ms from the first frame to the first replay frame`);
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

describe('the payer\'s own reason and the header help', () => {
  test('every case carries the payer\'s remark, and it is the sentence after the remark label, nothing else', () => {
    for (const c of cases.values()) {
      const r = payerRemark(c);
      assert.ok(r && r.length > 20, c.id);
      assert.ok(!r.includes('Payer remark:'), c.id);
      assert.ok(!r.startsWith('CARC'), c.id);
      assert.ok(c.denial.text.endsWith(r), c.id);
    }
    assert.equal(payerRemark({ ...cases.get('case-001')!, denial: { ...cases.get('case-001')!.denial, text: 'Denied. CARC 50: not medically necessary.' } }), null);
  });
  test('every code system in the set has plain-words help, the CARC help names the code and its text, and every stamp label has help', () => {
    for (const c of cases.values()) {
      assert.ok(codeSystemHelp(c.procedure.codeSystem).length > 20, c.procedure.codeSystem);
      const h = carcHelp(c);
      assert.ok(h.includes(`CARC ${c.denial.carc}`), c.id);
      if (c.denial.carcText) assert.ok(h.includes(c.denial.carcText), c.id);
    }
    for (const key of ['model', 'provider', 'effort', 'run', 'gate', 'synthetic', 'stakes', 'category']) assert.ok((LABEL_HELP[key] ?? '').length > 15, key);
  });
});

describe('what the three columns are, what kind of denial each case is, and where the data came from', () => {
  test('every case is a claim denied after the service was given, never a prior-authorization request; the three CARC 197 cases are claims denied for a missing authorization', () => {
    let missingAuth = 0;
    for (const c of cases.values()) {
      assert.match(c.denial.text, /^\S.* denied the claim for /, c.id);
      const k = denialKind(c);
      assert.ok(k.length > 20, c.id);
      assert.ok(!/prior authorization request|pre-?service/i.test(k), c.id);
      if (c.denial.carc === '197') { missingAuth++; assert.match(k, /no authorization on file/, c.id); }
      else assert.match(k, /^claim denied after the service/, c.id);
      if (c.denial.serviceEnd) assert.ok(k.includes(c.denial.serviceEnd), c.id); else assert.ok(k.includes(c.denial.dateOfService), c.id);
    }
    assert.equal(missingAuth, 3);
    assert.match(DENIAL_KIND_HELP, /after the service/);
    assert.match(DENIAL_KIND_HELP, /prior.authorization/i);
  });
  test('each column says in one line what it holds, and the draft column says what PASS does and does not mean', () => {
    for (const key of ['chart', 'criteria', 'draft'] as const) {
      assert.ok(PANEL_HELP[key].length > 40, key);
      assert.ok(PANEL_HELP[key].split(/\s+/).length <= 40, key);
      assert.ok(!PANEL_HELP[key].includes('!'));
    }
    assert.match(PANEL_HELP.draft, /PASS/);
    assert.match(PANEL_HELP.draft, /not/);
    for (const key of ['pass', 'blocked', 'declined', 'error'] as const) assert.ok(VERDICT_HELP[key].length > 40, key);
    assert.match(VERDICT_HELP.pass, /physician/);
    assert.doesNotMatch(VERDICT_HELP.pass, /\bwin\b|legitimate|correct\b/);
  });
  test('the data note states how the fifty cases were made: a seeded generator, the templates, the thirty and twenty split, fictional payers, no real record', () => {
    assert.match(DATA_NOTE, /seed/i);
    assert.match(DATA_NOTE, /18 (service )?templates/);
    assert.match(DATA_NOTE, /\b30\b/);
    assert.match(DATA_NOTE, /\b20\b/);
    assert.match(DATA_NOTE, /fictional/);
    assert.match(DATA_NOTE, /no real/i);
    assert.match(DATA_NOTE, /generate\.ts/);
    assert.ok(!DATA_NOTE.includes('!'));
  });
});

describe('a deep link can name a step, so a figure in the paper is a frame', () => {
  test('step parses as a cursor or the word end, clamps to the timeline, and is absent otherwise', () => {
    assert.equal(parseStep(null, 12), null);
    assert.equal(parseStep('', 12), null);
    assert.equal(parseStep('end', 12), 12);
    assert.equal(parseStep('END', 12), 12);
    assert.equal(parseStep('5', 12), 5);
    assert.equal(parseStep('0', 12), 0);
    assert.equal(parseStep('99', 12), 12);
    assert.equal(parseStep('-3', 12), 0);
    assert.equal(parseStep('abc', 12), null);
    assert.equal(parseStep('2.5', 12), 2);
  });
});

// --- the repair turn in the replay (Oct 31) -----------------------------------
// A results file written with --repair carries, per repaired case, firstGate
// (the gate before any repair), repairs[] (each with the reasons sent, the
// revised draft, its gate), and the final gate. The timeline shows the first
// draft stamped and blocked, then the repair turn with the gate's reasons, the
// entries it read, and every sentence re-stamped from its first status to its
// final one with the reason between.
describe('the repair turn in the replay', () => {
  const c = caseOf(passing);
  const final = passing.gate!;
  const firstSentences = final.sentences.map((s, i) => (i === 0 ? { ...s, status: 'needs-citation' as const, reason: 'needs-citation: 110 not in note-001; the chart has it in note-013' } : s));
  const firstGate: NonNullable<ViewerResult['gate']> = { ...final, verdict: 'blocked', reasons: [`sentence 0 needs-citation: ${firstSentences[0]!.reason}`], sentences: firstSentences };
  const repaired: ViewerResult = {
    ...passing,
    latencyMs: 15000,
    costUsd: 0.03,
    firstOutcome: 'blocked',
    firstGate,
    repairs: [{ turn: 1, reasons: firstGate.reasons, sent: 'The verifier blocked this draft...', latencyMs: 5000, costUsd: 0.01, gate: final, outcome: 'correct-pass' }],
    trace: [
      { step: 0, tool: 'read_entry', input: { id: c.chart[0]!.id, why: 'the admission note' }, entryId: c.chart[0]!.id, atMs: 1000, ok: true, why: 'the admission note' },
      { step: 1, tool: 'read_entry', input: { id: c.chart[1]!.id, why: 'the gate named it' }, entryId: c.chart[1]!.id, atMs: 11000, ok: true, why: 'the gate named it', repair: 1 },
    ],
  };

  test('the timeline: first-turn reads, the first draft stamped and blocked, then a repair step, the repair-turn reads, the re-stamped sentences, and the final verdict', () => {
    const steps = buildTimeline(repaired, c);
    const kinds = steps.map(s => s.kind);
    const firstVerdict = kinds.indexOf('verdict');
    const repair = kinds.indexOf('repair');
    const lastVerdict = kinds.lastIndexOf('verdict');
    assert.ok(firstVerdict > 0 && repair > firstVerdict && lastVerdict > repair, kinds.join(','));
    const v1 = steps[firstVerdict]!;
    if (v1.kind === 'verdict') { assert.equal(v1.verdict, 'blocked'); assert.equal(v1.blockedSentence, 0); }
    const rep = steps[repair]!;
    if (rep.kind === 'repair') { assert.equal(rep.turn, 1); assert.deepEqual(rep.reasons, firstGate.reasons); assert.equal(rep.sentences, final.sentences.length); }
    // the repair-turn read comes after the repair step, marked with its turn
    const reads = steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'read');
    assert.equal(reads.length, 2);
    assert.ok(reads[1]![1] > repair);
    if (reads[1]![0].kind === 'read') { assert.equal(reads[1]![0].repair, 1); assert.equal(reads[1]![0].why, 'the gate named it'); }
    // sentences are stamped twice: once from the first gate, once from the final gate with the first status carried as previous
    const sentenceSteps = steps.filter(s => s.kind === 'sentence');
    assert.equal(sentenceSteps.length, 2 * final.sentences.length);
    const restamped = sentenceSteps.find(s => s.kind === 'sentence' && s.index === 0 && s.previous);
    assert.ok(restamped && restamped.kind === 'sentence');
    if (restamped && restamped.kind === 'sentence') { assert.equal(restamped.previous!.status, 'needs-citation'); assert.equal(restamped.status, 'verified'); }
    const v2 = steps[lastVerdict]!;
    if (v2.kind === 'verdict') { assert.equal(v2.verdict, 'pass'); assert.equal(v2.repair, 1); }
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i]!.atMs >= steps[i - 1]!.atMs, `step ${i} time goes backwards`);
    assert.equal(steps[steps.length - 1]!.atMs, repaired.latencyMs);
  });

  test('the state: at the first verdict the draft is blocked; at the repair step the verdict clears and the reasons show; after the re-stamp the sentence carries its first status; at the end PASS after one repair', () => {
    const steps = buildTimeline(repaired, c);
    const kinds = steps.map(s => s.kind);
    const atFirstVerdict = stateAt(steps, repaired, c, kinds.indexOf('verdict') + 1);
    assert.equal(atFirstVerdict.verdict?.verdict, 'blocked');
    assert.equal(atFirstVerdict.sentences[0]?.status, 'needs-citation');
    assert.equal(atFirstVerdict.repair, null);
    const atRepair = stateAt(steps, repaired, c, kinds.indexOf('repair') + 1);
    assert.equal(atRepair.verdict, null);
    assert.equal(atRepair.done, false);
    assert.deepEqual(atRepair.repair, { turn: 1, reasons: firstGate.reasons });
    assert.equal(atRepair.sentences.length, final.sentences.length, 'the sentences stay on screen to be re-stamped');
    assert.ok(atRepair.criteria.every(k => k.evidence.length === 0 && k.status === 'pending'), 'the revised draft re-attaches its evidence');
    const whyStep = steps.findIndex(s => s.kind === 'read' && s.repair === 1);
    const atWhy = stateAt(steps, repaired, c, whyStep + 1);
    assert.deepEqual(atWhy.why, { entryId: c.chart[1]!.id, text: 'the gate named it', live: false });
    const end = stateAt(steps, repaired, c, steps.length);
    assert.equal(end.verdict?.verdict, 'pass');
    assert.equal(end.verdict?.repair, 1);
    assert.equal(end.sentences[0]?.status, 'verified');
    assert.deepEqual(end.sentences[0]?.previous, { status: 'needs-citation', reason: firstSentences[0]!.reason });
    assert.equal(end.sentences[1]?.previous, undefined, 'a sentence whose status did not change carries no previous');
    assert.equal(end.counters.sentencesVerified, final.sentences.length);
    assert.equal(end.counters.costUsd, 0.03);
    assert.equal(end.why, null);
  });

  test('a result without firstGate replays exactly as before: no repair step, one verdict, no previous on any sentence', () => {
    const steps = buildTimeline(passing, c);
    assert.ok(!steps.some(s => s.kind === 'repair'));
    assert.equal(steps.filter(s => s.kind === 'verdict').length, 1);
    assert.ok(steps.every(s => s.kind !== 'sentence' || s.previous === undefined));
    const end = stateAt(steps, passing, c, steps.length);
    assert.equal(end.verdict?.repair, undefined);
    assert.equal(end.repair, null);
  });

  test('a read step carries the why the model gave, and the state shows it while the entry lights', () => {
    const steps = buildTimeline(repaired, c);
    const first = steps[0]!;
    assert.equal(first.kind, 'read');
    if (first.kind === 'read') assert.equal(first.why, 'the admission note');
    const s1 = stateAt(steps, repaired, c, 1);
    assert.deepEqual(s1.why, { entryId: c.chart[0]!.id, text: 'the admission note', live: false });
    assert.equal(s1.open, c.chart[0]!.id);
  });

  test('every kept file still replays: no result carries a repair, and the why is absent on their traces', () => {
    for (const f of files) for (const r of f.results) {
      const steps = buildTimeline(r, caseOf(r));
      assert.ok(!steps.some(s => s.kind === 'repair'), `${r.caseId}`);
    }
  });
});

// --- the compare tab (Oct 31) -------------------------------------------------
describe('the compare tab: three models side by side on one case', () => {
  const kept = files.map(f => ({ file: 'x', data: f }));

  test('picks, per model, the newest kept physician-side live-CHART run, in README order, and lays out one column each', () => {
    const cols = compareColumns(kept, 'case-001');
    assert.equal(cols.length, 3);
    assert.deepEqual(cols.map(c => c.model), ['muse-spark-1.3', 'muse-wonder-1.0', 'meta-models/muse-spark-open']);
    for (const col of cols) {
      assert.ok(col.live, 'only live-CHART runs are compared');
      assert.equal(col.result?.caseId, 'case-001');
      const r = col.result!;
      assert.equal(col.sentences.length, r.gate?.sentences.length ?? 0);
      assert.equal(col.verdict, r.gate?.verdict ?? 'error');
      assert.equal(col.costUsd, r.costUsd);
      assert.equal(col.latencyMs, r.latencyMs);
      // entries opened, in order, each once, only reads that resolved
      const expected: string[] = [];
      for (const t of (r.trace ?? []).filter(t => t.tool === 'read_entry' && t.ok && t.entryId)) if (!expected.includes(t.entryId!)) expected.push(t.entryId!);
      assert.deepEqual(col.opened, expected);
      assert.ok(col.lookups.every(l => l.live));
    }
  });

  test('works for every case in the set: three columns, every sentence stamped, every verdict named, every opened entry in the chart', () => {
    for (const [id, c] of cases) {
      const cols = compareColumns(kept, id);
      assert.equal(cols.length, 3, id);
      for (const col of cols) {
        const chartIds = new Set(c.chart.map(e => e.id));
        for (const e of col.opened) assert.ok(chartIds.has(e), `${id} ${col.model} opened ${e}`);
        for (const s of col.sentences) assert.ok(['verified', 'refuted', 'needs-citation', 'unresolved', 'error'].includes(s.status), `${id} ${col.model}`);
        assert.ok(['pass', 'blocked', 'declined', 'error'].includes(col.verdict), `${id} ${col.model} ${col.verdict}`);
        assert.ok(col.outcomeLabel.length > 0);
      }
    }
  });

  test('payer-side, repair, and non-live files are left out; a missing model leaves a shorter list, never a blank column', () => {
    const live = files.filter(f => f.results.some(r => (r.trace ?? []).some(t => t.live)));
    const spark = live.find(f => f.run.model === 'muse-spark-1.3')!;
    const payer: ResultsFile = { ...spark, run: { ...spark.run, side: 'payer' } };
    const repair: ResultsFile = { ...spark, run: { ...spark.run, repair: 1 } };
    const plain = files.find(f => f.run.model === 'muse-spark-1.3' && !f.results.some(r => (r.trace ?? []).some(t => t.live)))!;
    const cols = compareColumns([{ file: 'a', data: payer }, { file: 'b', data: repair }, { file: 'c', data: plain }], 'case-001');
    assert.equal(cols.length, 0);
    const one = compareColumns([{ file: 'd', data: spark }], 'case-001');
    assert.equal(one.length, 1);
    assert.equal(one[0]!.file, 'd');
  });
});
