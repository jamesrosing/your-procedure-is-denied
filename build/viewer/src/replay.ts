// Replay logic for the judge-facing viewer: pure functions over a results
// file and the synthetic case it was run on. No DOM here, so the tests run
// under node and the page is a thin renderer over `stateAt`.
//
// A case replays as an ordered list of steps: entries read (one per tool call
// in an agentic trace, or all cited entries at once for a non-agentic run),
// then each piece of evidence attaching to its criterion, then each sentence
// with the gate's stamp, then the verdict. The state at step k is the fold of
// steps 0..k, so play, pause, and step are a cursor over the list.

export interface ViewerEntry {
  id: string;
  date: string;
  kind: string;
  text: string;
}

export interface ViewerCriterion {
  id: string;
  text: string;
}

export interface ViewerCase {
  id: string;
  category: string;
  setting: string;
  stakesUsd: number;
  patient: { alias: string; age: number; sex: string };
  procedure: { code: string; codeSystem: string; description: string };
  payer: { name: string; planType: string };
  denial: { carc: string; carcText?: string; rarc?: string; text: string; dateOfService: string; serviceEnd?: string };
  criteria: ViewerCriterion[];
  chart: ViewerEntry[];
  expected: { warranted: boolean; subtype?: string; support: Record<string, string[]>; note: string };
}

export type RecordStatus = 'verified' | 'unresolved' | 'refuted' | 'needs-citation' | 'error';

export interface TraceEvent {
  step: number;
  tool: string; // list_entries, read_entry, policy_status
  input: Record<string, unknown>;
  entryId?: string;
  atMs: number; // since the case started
  ok: boolean;
  live?: boolean; // a query against an external data source, labeled in the viewer
  note?: string;
  why?: string; // the model's one-sentence reason for the call (the API returns only redacted thinking, so the tool input carries it)
  repair?: number; // the repair turn this call was made in; absent for the first turn
}

// One repair turn (harness --repair): the gate's reasons sent back verbatim,
// the revised draft's gate, and what the turn cost. Offered only on a blocked draft.
export interface RepairRecord {
  turn: number;
  reasons: string[];
  sent: string;
  latencyMs: number;
  costUsd: number;
  gate?: ViewerResult['gate'];
  outcome?: string;
  error?: string;
}

export interface ViewerResult {
  caseId: string;
  category: string;
  outcome: string;
  latencyMs: number;
  costUsd: number;
  error?: string;
  draft?: {
    warranted: boolean;
    reason?: string;
    evidence: { criterion: string; citation: string; quote: string }[];
    sentences: { text: string; citation: string; quote: string }[];
  };
  gate?: {
    litmus?: string; // the gate version string recorded with the verdict
    inputHash?: string; // sha256 of the sources and the draft, for the provenance record
    verdict: 'pass' | 'blocked' | 'declined';
    reasons: string[];
    declinedReason?: string;
    sentences: { index: number; text: string; citation: string; quote: string; status: RecordStatus; reason: string }[];
    evidence: { index: number; criterion: string; citation: string; quote: string; status: RecordStatus; reason: string }[];
    criteria: Record<string, 'verified' | 'unverified'>;
  };
  trace?: TraceEvent[];
  reading?: { entriesRead: number; chartSize: number; supportRead: number; supportTotal: number };
  // the advisor's opinion per criterion, with the model's name; never a gate input
  advice?: { provider: string; model: string; items: { criterion: string; verdict: 'supports' | 'partial' | 'silent'; why: string }[]; error?: string };
  // --repair runs: the outcome above is scored on the final gate; these keep the no-repair result
  firstOutcome?: string;
  firstGate?: ViewerResult['gate']; // present only when a repair turn happened
  repairs?: RepairRecord[];
}

export type Side = 'payer' | undefined; // absent: the physician's side, the default

export interface ResultsFile {
  run: { startedAt: string; provider: string; model: string; effort: string; cases: number; agentic?: boolean; side?: 'payer'; repair?: number };
  summary: {
    cases: number;
    outcomes: Record<string, number>;
    agreementRate: number;
    sentencesVerified: number;
    ungroundedSentencesCaught: number;
    latencyMs: { p50: number };
    costUsd: { perCase: number };
    reading?: { entriesReadPerCase: number; chartSizePerCase: number; supportCoverage: number };
  };
  results: ViewerResult[];
}

export type Step =
  | { kind: 'read'; entryId: string; tool: string; live: boolean; note?: string; why?: string; repair?: number; atMs: number }
  | { kind: 'lookup'; tool: string; note: string; live: boolean; input?: LookupQuestion; why?: string; repair?: number; atMs: number }
  | { kind: 'read-all'; entryIds: string[]; atMs: number }
  | { kind: 'evidence'; criterion: string; citation: string; quote: string; status: RecordStatus; reason: string; atMs: number }
  // previous: the stamp this sentence carried before a repair turn re-stamped it; the reason is shown between the two
  | { kind: 'sentence'; index: number; text: string; citation: string; quote: string; status: RecordStatus; reason: string; previous?: { status: RecordStatus; reason: string }; repair?: number; atMs: number }
  // the repair turn: the gate's reasons go back to the model verbatim; `sentences` is the revised draft's count
  | { kind: 'repair'; turn: number; reasons: string[]; sentences: number; atMs: number }
  | { kind: 'advice'; model: string; items: { criterion: string; verdict: 'supports' | 'partial' | 'silent'; why: string }[]; atMs: number }
  | { kind: 'verdict'; verdict: 'pass' | 'blocked' | 'declined' | 'error'; reasons: string[]; declinedReason?: string; blockedSentence?: number; error?: string; repair?: number; atMs: number };

export interface CriterionState {
  id: string;
  text: string;
  status: 'pending' | 'verified' | 'unverified';
  evidence: { citation: string; quote: string; status: RecordStatus; reason: string }[];
  advice?: { model: string; verdict: 'supports' | 'partial' | 'silent'; why: string }; // the advisor's opinion, shown after the gate
}

export interface SentenceState {
  index: number;
  text: string;
  citation: string;
  quote: string;
  status: RecordStatus;
  reason: string;
  previous?: { status: RecordStatus; reason: string }; // the stamp before a repair turn re-stamped this sentence
}

export interface ReplayState {
  cursor: number; // steps applied so far; 0 is the untouched chart
  total: number;
  read: string[]; // entry ids lit, in the order they were read
  open: string | null; // the entry whose text is slid open, the last one read
  lookups: { tool: string; note: string; live: boolean; input?: LookupQuestion }[];
  strip: LookupStrip | null; // the live CHART query as a strip, only while it is the last step applied
  criteria: CriterionState[];
  sentences: SentenceState[];
  verdict: Extract<Step, { kind: 'verdict' }> | null;
  repair: { turn: number; reasons: string[] } | null; // the repair turn in progress or just finished
  why: { entryId: string | null; text: string; live: boolean } | null; // the model's reason for the last read or query, while that step is the last applied
  counters: { entriesRead: number; chartSize: number; sentencesVerified: number; sentencesTotal: number; costUsd: number; elapsedMs: number };
  done: boolean;
}

// The payer's own reason for the denial, the sentence after "Payer remark:" in
// the denial text, so the viewer can set the insurer's claim above the
// criteria and the record's quotes that answer it. Null when the denial
// carries no remark.
export function payerRemark(c: ViewerCase): string | null {
  const m = /Payer remark:\s*(.+)$/s.exec(c.denial.text);
  const r = m?.[1]?.trim();
  return r && r.length > 0 ? r : null;
}

// A deep link may name a step: `&step=7` or `&step=end`, so a figure in the
// paper can point at one frame of a replay. Clamped to the timeline; null when
// absent or unreadable.
export function parseStep(value: string | null, total: number): number | null {
  if (value === null) return null;
  const v = value.trim();
  if (v === '') return null;
  if (v.toLowerCase() === 'end') return total;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(n, total));
}

// Plain-words help for the labels in the case header, shown on hover; the
// narration says the same once. Two cold readers asked what the labels were.
export const LABEL_HELP: Record<string, string> = {
  model: 'The Meta model that drafted this appeal.',
  provider: 'Where the model ran: meta is the Meta Model API; baseten is the open-weights model on Baseten.',
  effort: 'The reasoning effort the model was asked for. The kept runs used low; the effort sweep (post hoc, README Table 6) ran medium and high.',
  repair: 'A post hoc run in which a blocked draft was sent back to the model once with the gate\u2019s reasons, verbatim, and the revised draft re-gated (README Table 5). The outcome shown is the final one; the first stamp of each re-stamped sentence is kept in the replay.',
  record: 'A hash of the record alone: the chart, the criteria, the denial, and the case facts, with no draft in it. A live run of this case in a terminal (npm run live) prints the same value, which is how a reader can tell the two are on the same record.',
  run: 'The date of this run.',
  gate: 'The version of the deterministic check that verifies every sentence against the chart.',
  synthetic: 'A synthetic patient and chart; no real record appears anywhere in this repository.',
  stakes: 'An approximate dollar value of the service that was denied.',
  category: 'The area of care this denial falls in.',
};

// What kind of denial this is, in the case header. Every case in the set is a
// claim denied after the service was given: the payer's remittance with a
// claim adjustment reason code. None is a prior-authorization request. The
// three CARC 197 cases are claims denied because no authorization was on file.
export function denialKind(c: ViewerCase): string {
  const when = c.denial.serviceEnd ? `${c.denial.dateOfService} to ${c.denial.serviceEnd}` : `on ${c.denial.dateOfService}`;
  if (c.denial.carc === '197') return `claim denied, no authorization on file, for care ${when}`;
  return `claim denied after the service, given ${when}`;
}

export const DENIAL_KIND_HELP = "Every case here is a claim denied after the service was given: the payer's remittance carrying a claim adjustment reason code. None is a prior-authorization request. Three claims (CARC 197) were denied because no authorization was on file; two plans allow a retrospective medical-necessity review and the chart answers it, and one plan refuses that review, so a medical-necessity appeal is the wrong instrument.";

// One line under each column header saying what the column holds, and what
// the stamps in it mean. The draft column says what PASS is not.
export const PANEL_HELP = {
  chart: "The physician's record for this patient: dated entries in dictation voice, about half of them unrelated to the denial. An entry lights when the model reads it.",
  criteria: "The payer's written coverage rules for this service, under the payer's own reason for the denial. A criterion lights when the draft cites verified evidence for it.",
  draft: "The appeal the model drafts to this denial, one sentence at a time, each stamped by the gate against the chart. PASS means every sentence is in the record, not that the appeal would prevail.",
} as const;

// The words that change with the chair. On the payer side (build/results/payer/,
// README Table 4) the draft is the plan's determination, a verified PASS is a
// determination whose every sentence is in the record, DECLINED is the model
// declining to deny, and there is no writ: the instrument is the physician's.
export interface SideText {
  side: Side;
  draftHeading: string;
  draftHelp: string;
  passHead: (verified: number, total: number) => string;
  declinedHead: string;
  outcome: (o: string) => string;
  writ: boolean;
  stamp?: string; // a label for the context line
}

export function sideText(side: Side): SideText {
  if (side === 'payer') {
    return {
      side,
      draftHeading: 'Draft determination',
      draftHelp: "The plan's written claim determination the model drafts, arguing the insurer's side, one sentence at a time, each stamped by the gate against the same chart. PASS means every sentence is in the record, not that the denial is right: whether the record fails the criterion is a reading the gate does not make.",
      passHead: (verified, total) => `${verified} of ${total} sentences verified against the chart; a determination held to the record, and the reading of the criterion is not the gate's to make`,
      declinedHead: 'the model read the chart and declined to deny',
      outcome: o => ({ 'correct-pass': 'determination verified', 'correct-decline': 'declined to deny', blocked: 'blocked', missed: 'did not deny a failing record', 'false-pass': 'determination against a supporting record', error: 'error' }[o] ?? o),
      writ: false,
      stamp: 'payer side, post hoc',
    };
  }
  return {
    side,
    draftHeading: 'Draft appeal',
    draftHelp: PANEL_HELP.draft,
    passHead: (verified, total) => `${verified} of ${total} sentences verified against the chart; ready for the physician to read and sign`,
    declinedHead: 'the model read the chart and declined to draft',
    outcome: o => ({ 'correct-pass': 'passed', 'correct-decline': 'declined', blocked: 'blocked', missed: 'missed', 'false-pass': 'false pass', error: 'error' }[o] ?? o),
    writ: true,
  };
}

// The run the page opens on without a deep link: the primary proposer's
// (muse-spark-1.3) newest physician-side run that used every tool, by start
// time; failing that, any model's newest live run; failing that, the newest run.
export const PRIMARY_MODEL = 'muse-spark-1.3';
export function newestRun<T extends { startedAt: string; live?: boolean; side?: 'payer'; model?: string }>(runs: readonly T[]): T | undefined {
  const own = runs.filter(r => r.side !== 'payer');
  const pool = own.length ? own : [...runs];
  const newestFirst = [...pool].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return newestFirst.find(r => r.live && r.model === PRIMARY_MODEL) ?? newestFirst.find(r => r.live) ?? newestFirst[0];
}

// The result stamp, on hover. PASS is the gate's word, not a verdict on the
// appeal: the physician who signs decides whether the record satisfies the criteria.
export const VERDICT_HELP = {
  pass: "PASS: the model judged that the record supports an appeal, and the gate found every quoted phrase in the entry it cites and every number, date, code, and side sourced. It does not say the record satisfies the criteria or that the appeal would prevail; the physician who reads and signs decides that.",
  blocked: "BLOCKED: the model drafted an appeal, and at least one sentence did not verify against the chart, or a criterion had no verified evidence. Nothing leaves. The physician is shown what failed and why.",
  declined: "DECLINED: the model read the chart and decided the record does not support a medical-necessity appeal, and said why. For 20 of the 50 cases this is the answer the grading key expects.",
  error: "FAILED: the request did not complete, for instance an answer that was not valid JSON, so the gate never ran. The run file keeps the failure.",
} as const;

// Where the fifty cases came from, for the about panel and the scoreboard.
export const DATA_NOTE = "The fifty cases are synthetic, built by a seeded program (build/src/synthetic/generate.ts, seed 20261027) from 18 service templates in the categories where denial dollars concentrate, so the committed files are reproducible and a test checks them against the generator. 30 cases are warranted: the chart documents every criterion. 20 are not: 6 never address a criterion, 7 raise it but fall short, 4 are administrative denials a medical-necessity appeal cannot answer, and 3 are plan exclusions. The six payers are fictional, and their criteria were written for the benchmark from publicly described policy patterns, not any insurer's policy. Each chart is 19 to 35 dated entries in dictation voice, about two thirds of them routine traffic unrelated to the denial. A patient is an alias, an age, and a sex. No real record appears anywhere.";

const CODE_SYSTEM_HELP: Record<string, string> = {
  HIPPS: 'HIPPS: the billing code for a skilled nursing stay and its level of care.',
  CMG: 'CMG: the billing code for an inpatient rehabilitation stay.',
  'MS-DRG': 'MS-DRG: the billing code for an inpatient hospital stay.',
  CPT: 'CPT: the billing code for the procedure.',
  HCPCS: 'HCPCS: the billing code for the drug, device, or service.',
};

export function codeSystemHelp(codeSystem: string): string {
  return CODE_SYSTEM_HELP[codeSystem] ?? `${codeSystem}: the billing code for this service.`;
}

export function carcHelp(c: ViewerCase): string {
  const text = c.denial.carcText ? ` ${c.denial.carcText}` : '';
  return `CARC ${c.denial.carc}: the claim adjustment reason code the payer put on the denial.${text}`;
}

// The index shows one line per entry: the date, the kind, and the opening words.
export function firstLine(text: string, maxChars = 72): string {
  const line = text.split(/\n/)[0]?.trim() ?? '';
  if (line.length <= maxChars) return line;
  const cut = line.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 24 ? lastSpace : maxChars)}…`;
}

// Entries the draft rests on, in first-citation order, for runs with no trace.
export function citedEntries(result: ViewerResult): string[] {
  const ids: string[] = [];
  const push = (id: string) => { if (id && !ids.includes(id)) ids.push(id); };
  for (const e of result.gate?.evidence ?? result.draft?.evidence ?? []) push(e.citation);
  for (const s of result.gate?.sentences ?? result.draft?.sentences ?? []) push(s.citation);
  return ids;
}

// The question a live query asked, as the trace recorded it.
export interface LookupQuestion { authority: string; code: string; asOf: string }

export function lookupQuestion(input: Record<string, unknown> | undefined): LookupQuestion | undefined {
  if (!input) return undefined;
  const authority = String(input['authority'] ?? '').trim().toLowerCase();
  const code = String(input['code'] ?? '').trim();
  const asOf = String(input['date_of_service'] ?? input['asOf'] ?? '').trim();
  if (!authority && !code && !asOf) return undefined;
  return { authority: authority || 'cms', code, asOf };
}

// The live CHART query as four nodes: the payer whose denial this is, the
// authority asked about, the index that answered, and the answer, typed out.
// Shown in place of the criteria list for the one step the query is the
// last thing that happened, then the criteria return with the query's line.
export interface LookupStrip { payer: string; authority: string; index: string; question: string; answer: string }

export function lookupStrip(step: Step, c: ViewerCase): LookupStrip | null {
  if (step.kind !== 'lookup' || !step.live) return null;
  const authorityId = step.input?.authority ?? 'cms';
  const answer = step.note.replace(new RegExp(`^${authorityId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '');
  const question = step.input ? `${step.tool}: ${step.input.code} as of ${step.input.asOf}` : step.tool;
  return { payer: c.payer.name, authority: authorityId.toUpperCase(), index: 'CHART coverage index, prior-work data source', question, answer };
}

export function buildTimeline(result: ViewerResult, c: ViewerCase): Step[] {
  const steps: Step[] = [];
  const chartIds = new Set(c.chart.map(e => e.id));
  const trace = (result.trace ?? []).slice().sort((a, b) => a.step - b.step);

  // Tool calls become read and lookup steps; the model's why and the repair
  // turn ride along. Returns when the reading ended.
  const pushReads = (events: TraceEvent[]): number => {
    let ends = 0;
    for (const t of events) {
      const extra = { ...(t.why ? { why: t.why } : {}), ...(t.repair ? { repair: t.repair } : {}) };
      if (t.tool === 'read_entry' && t.entryId && chartIds.has(t.entryId)) {
        steps.push({ kind: 'read', entryId: t.entryId, tool: t.tool, live: t.live ?? false, ...(t.note ? { note: t.note } : {}), ...extra, atMs: t.atMs });
      } else if (t.tool !== 'read_entry') {
        const input = lookupQuestion(t.input);
        steps.push({ kind: 'lookup', tool: t.tool, note: t.note ?? (t.ok ? 'ok' : 'failed'), live: t.live ?? false, ...(input ? { input } : {}), ...extra, atMs: t.atMs });
      }
      ends = Math.max(ends, t.atMs);
    }
    return ends;
  };

  let readingEnds = 0;
  if (trace.length > 0) {
    readingEnds = pushReads(trace.filter(t => !t.repair));
  } else {
    const ids = citedEntries(result).filter(id => chartIds.has(id));
    if (ids.length > 0) steps.push({ kind: 'read-all', entryIds: ids, atMs: 0 });
  }

  if (result.error && !result.gate) {
    steps.push({ kind: 'verdict', verdict: 'error', reasons: [], error: result.error, atMs: result.latencyMs });
    return steps;
  }
  const gate = result.gate;
  if (!gate) return steps;

  // The gate's records come back in one shot after the model answers; spread
  // them across the remaining latency so the replay has a visible rhythm. A
  // sentence re-stamped by a repair turn carries its earlier stamp as previous.
  type Gate = NonNullable<ViewerResult['gate']>;
  const pushGate = (g: Gate, from: number, to: number, previous: Gate | null, repair: number | undefined): void => {
    const tail = g.evidence.length + g.sentences.length + 1;
    const span = Math.max(0, to - from);
    const at = (i: number) => Math.round(from + (span * (i + 1)) / tail);
    let i = 0;
    for (const e of g.evidence) {
      steps.push({ kind: 'evidence', criterion: e.criterion, citation: e.citation, quote: e.quote, status: e.status, reason: e.reason, atMs: at(i++) });
    }
    for (const s of g.sentences) {
      const prev = previous?.sentences.find(p => p.index === s.index);
      const changed = prev !== undefined && (prev.status !== s.status || prev.reason !== s.reason || prev.text !== s.text);
      steps.push({ kind: 'sentence', index: s.index, text: s.text, citation: s.citation, quote: s.quote, status: s.status, reason: s.reason, ...(changed ? { previous: { status: prev.status, reason: prev.reason } } : {}), ...(repair ? { repair } : {}), atMs: at(i++) });
    }
    const blocked = g.sentences.find(s => s.status !== 'verified');
    steps.push({
      kind: 'verdict',
      verdict: g.verdict,
      reasons: g.reasons,
      ...(g.declinedReason ? { declinedReason: g.declinedReason } : {}),
      ...(g.verdict === 'blocked' && blocked ? { blockedSentence: blocked.index } : {}),
      ...(repair ? { repair } : {}),
      atMs: to,
    });
  };

  const repairs = (result.repairs ?? []).filter(r => r.gate);
  if (result.firstGate && repairs.length > 0) {
    // The first draft, stamped and blocked; then each repair turn: the reasons
    // sent, the entries it read, the revised draft re-stamped, its verdict.
    const repairLatency = repairs.reduce((n, r) => n + r.latencyMs, 0);
    const firstEnd = Math.max(readingEnds, result.latencyMs - repairLatency);
    pushGate(result.firstGate, readingEnds, firstEnd, null, undefined);
    let t0 = firstEnd;
    let previous: Gate = result.firstGate;
    repairs.forEach((r, i) => {
      const g = r.gate!;
      steps.push({ kind: 'repair', turn: r.turn, reasons: r.reasons, sentences: g.sentences.length, atMs: t0 });
      const ends = Math.max(t0, pushReads(trace.filter(t => t.repair === r.turn)));
      const to = Math.max(ends, i === repairs.length - 1 ? result.latencyMs : t0 + r.latencyMs);
      pushGate(g, ends, to, previous, r.turn);
      previous = g;
      t0 = to;
    });
  } else {
    pushGate(gate, readingEnds, result.latencyMs, null, undefined);
  }
  if (result.advice && result.advice.items.length > 0) {
    steps.push({ kind: 'advice', model: result.advice.model, items: result.advice.items, atMs: result.latencyMs + 1 });
  }
  return steps;
}

export function initialState(steps: Step[], result: ViewerResult, c: ViewerCase): ReplayState {
  return {
    cursor: 0,
    total: steps.length,
    read: [],
    open: null,
    lookups: [],
    strip: null,
    criteria: c.criteria.map(k => ({ id: k.id, text: k.text, status: 'pending', evidence: [] })),
    sentences: [],
    verdict: null,
    repair: null,
    why: null,
    counters: { entriesRead: 0, chartSize: c.chart.length, sentencesVerified: 0, sentencesTotal: result.gate?.sentences.length ?? 0, costUsd: 0, elapsedMs: 0 },
    done: steps.length === 0,
  };
}

function apply(state: ReplayState, step: Step, result: ViewerResult, c: ViewerCase): ReplayState {
  const next: ReplayState = {
    ...state,
    strip: null,
    why: null,
    read: state.read.slice(),
    lookups: state.lookups.slice(),
    criteria: state.criteria.map(k => ({ ...k, evidence: k.evidence.slice() })),
    sentences: state.sentences.slice(),
    counters: { ...state.counters, elapsedMs: step.atMs },
  };
  switch (step.kind) {
    case 'read':
      if (!next.read.includes(step.entryId)) next.read.push(step.entryId);
      next.open = step.entryId;
      if (step.why) next.why = { entryId: step.entryId, text: step.why, live: step.live };
      break;
    case 'read-all':
      for (const id of step.entryIds) if (!next.read.includes(id)) next.read.push(id);
      next.open = step.entryIds[step.entryIds.length - 1] ?? null;
      break;
    case 'lookup':
      next.lookups.push({ tool: step.tool, note: step.note, live: step.live, ...(step.input ? { input: step.input } : {}) });
      next.strip = lookupStrip(step, c);
      if (step.why) next.why = { entryId: null, text: step.why, live: step.live };
      break;
    case 'repair':
      // The gate's reasons go back to the model. The verdict clears, the
      // revised draft re-attaches its evidence, and the sentences stay on
      // screen to be re-stamped one by one; any beyond the revised count go.
      next.verdict = null;
      next.done = false;
      next.repair = { turn: step.turn, reasons: step.reasons };
      next.criteria = next.criteria.map(k => ({ id: k.id, text: k.text, status: 'pending', evidence: [] }));
      next.sentences = next.sentences.slice(0, step.sentences);
      break;
    case 'evidence': {
      const k = next.criteria.find(x => x.id === step.criterion);
      if (k) {
        k.evidence.push({ citation: step.citation, quote: step.quote, status: step.status, reason: step.reason });
        if (step.status === 'verified') k.status = 'verified';
      }
      next.open = step.citation;
      break;
    }
    case 'sentence': {
      const record: SentenceState = { index: step.index, text: step.text, citation: step.citation, quote: step.quote, status: step.status, reason: step.reason, ...(step.previous ? { previous: step.previous } : {}) };
      const at = next.sentences.findIndex(s => s.index === step.index);
      if (at === -1) next.sentences.push(record); else next.sentences[at] = record;
      next.open = step.citation;
      break;
    }
    case 'advice':
      for (const item of step.items) {
        const k = next.criteria.find(x => x.id === item.criterion);
        if (k) k.advice = { model: step.model, verdict: item.verdict, why: item.why };
      }
      break;
    case 'verdict':
      next.verdict = step;
      next.done = true;
      next.counters.costUsd = result.costUsd;
      // An error means the gate never ran: the criteria were not checked, so they stay pending.
      if (step.verdict !== 'error') for (const k of next.criteria) if (k.status === 'pending') k.status = 'unverified';
      break;
  }
  next.counters.entriesRead = next.read.length;
  next.counters.sentencesVerified = next.sentences.filter(s => s.status === 'verified').length;
  return next;
}

export function stateAt(steps: Step[], result: ViewerResult, c: ViewerCase, cursor: number): ReplayState {
  const k = Math.max(0, Math.min(cursor, steps.length));
  let state = initialState(steps, result, c);
  for (let i = 0; i < k; i++) state = apply(state, steps[i]!, result, c);
  state.cursor = k;
  state.done = k >= steps.length;
  return state;
}

// Milliseconds of wall-clock to wait between two steps when playing. Model
// latency is compressed so a 16 second call replays in a few seconds, with a
// floor so each step registers on screen.
export function playDelayMs(steps: Step[], cursor: number, speed = 1): number {
  const before = cursor > 0 ? steps[cursor - 1] : undefined;
  const prev = before?.atMs ?? 0;
  const cur = steps[cursor]?.atMs ?? prev;
  const real = Math.max(0, cur - prev);
  let wait = Math.max(220, Math.min(1400, real / 8));
  // A live query is shown as a strip with its answer typed out; hold it long enough to read.
  if (before?.kind === 'lookup' && before.live) wait = Math.max(wait, LOOKUP_DWELL_MS);
  return wait / speed;
}

export const LOOKUP_DWELL_MS = 3200;

// --- the scoreboard ----------------------------------------------------------

export interface ScoreboardRow {
  model: string;
  provider: string;
  agentic: boolean;
  live: boolean; // at least one case made a live query against an external data source (CHART)
  cases: number;
  agreed: number;
  blocked: number;
  missed: number; // the model declined a case the key labels warranted: a judgment call, not an invented fact
  errors: number; // answers that failed before the gate: request errors and unparseable drafts
  falsePass: number; // the gate passed a draft on a case the key labels absent or near-miss: the referential limit
  sentencesVerified: number;
  latencyP50Ms: number;
  costPerCaseUsd: number;
  entriesRead: number | null; // mean entries read per case, agentic runs only
  chartSize: number | null;
  supportCoverage: number | null;
}

export const MODEL_LABELS: Record<string, string> = {
  'muse-spark-1.3': 'muse-spark-1.3 (Meta Model API)',
  'muse-wonder-1.0': 'muse-wonder-1.0 (Meta Model API)',
  'meta-models/muse-spark-open': 'Muse Spark Open (open weights, hosted on Baseten)',
  'meta-models/muse-spark-open-1026': 'Muse Spark Open (open weights, hosted on Baseten)',
};

export function scoreboardRow(file: ResultsFile): ScoreboardRow {
  const s = file.summary;
  const results = file.results ?? [];
  const agentic = file.run.agentic === true || results.some(r => (r.trace?.length ?? 0) > 0);
  const live = results.some(r => (r.trace ?? []).some(t => t.live === true));
  const reading = results.map(r => r.reading).filter((r): r is NonNullable<ViewerResult['reading']> => !!r);
  const mean = (f: (r: NonNullable<ViewerResult['reading']>) => number) => (reading.length ? reading.reduce((a, r) => a + f(r), 0) / reading.length : null);
  const supportTotal = reading.reduce((a, r) => a + r.supportTotal, 0);
  return {
    model: MODEL_LABELS[file.run.model] ?? file.run.model,
    provider: file.run.provider,
    agentic,
    live,
    cases: s.cases,
    agreed: (s.outcomes['correct-pass'] ?? 0) + (s.outcomes['correct-decline'] ?? 0),
    blocked: s.outcomes['blocked'] ?? 0,
    missed: s.outcomes['missed'] ?? 0,
    errors: s.outcomes['error'] ?? 0,
    falsePass: s.outcomes['false-pass'] ?? 0,
    sentencesVerified: s.sentencesVerified,
    latencyP50Ms: s.latencyMs.p50,
    costPerCaseUsd: s.costUsd.perCase,
    entriesRead: mean(r => r.entriesRead),
    chartSize: mean(r => r.chartSize),
    supportCoverage: supportTotal > 0 ? reading.reduce((a, r) => a + r.supportRead, 0) / supportTotal : null,
  };
}

// README order: the primary proposer, the quality ceiling, then open weights; agentic rows after, live-tool rows last.
const MODEL_RANK = ['muse-spark-1.3', 'muse-wonder-1.0', 'Muse Spark Open'];
function rank(model: string): number {
  const i = MODEL_RANK.findIndex(m => model.startsWith(m));
  return i === -1 ? MODEL_RANK.length : i;
}

// Payer-side runs (README Table 4) stay off the board, as the README says.
export function scoreboard(files: ResultsFile[]): ScoreboardRow[] {
  return files
    .filter(f => f.run.side !== 'payer')
    .map(scoreboardRow)
    .sort((a, b) => Number(a.agentic) - Number(b.agentic) || Number(a.live) - Number(b.live) || rank(a.model) - rank(b.model) || a.model.localeCompare(b.model));
}

// --- the compare tab -------------------------------------------------------------
// One case, the three models' kept live-CHART results side by side: the entries
// each opened in order, its sentences with the gate's stamps, its verdict, cost,
// and latency. Pure layout over the stored files; nothing is re-run. Payer-side
// and repair runs are left out, as are runs that made no live query; per model
// the newest run by start time is taken, in README order.
export interface CompareColumn {
  file: string;
  model: string; // run.model as stored
  label: string; // MODEL_LABELS
  provider: string;
  startedAt: string;
  live: boolean;
  result: ViewerResult | null;
  opened: string[]; // entry ids, in the order first read, reads that resolved only
  lookups: { tool: string; note: string; live: boolean }[];
  sentences: SentenceState[];
  verdict: 'pass' | 'blocked' | 'declined' | 'error';
  reasons: string[];
  declinedReason?: string;
  outcomeLabel: string;
  costUsd: number;
  latencyMs: number;
  entriesRead: number;
  chartSize: number | null;
}

export function compareColumns(files: { file: string; data: ResultsFile }[], caseId: string): CompareColumn[] {
  const live = files.filter(f => f.data.run.side !== 'payer' && !f.data.run.repair && f.data.results.some(r => (r.trace ?? []).some(t => t.live === true)));
  const byModel = new Map<string, { file: string; data: ResultsFile }>();
  for (const f of live) {
    const key = MODEL_LABELS[f.data.run.model] ?? f.data.run.model;
    const current = byModel.get(key);
    if (!current || f.data.run.startedAt.localeCompare(current.data.run.startedAt) > 0) byModel.set(key, f);
  }
  const ordered = [...byModel.values()].sort((a, b) => rank(MODEL_LABELS[a.data.run.model] ?? a.data.run.model) - rank(MODEL_LABELS[b.data.run.model] ?? b.data.run.model));
  return ordered.map(f => {
    const r = f.data.results.find(x => x.caseId === caseId) ?? null;
    const opened: string[] = [];
    const lookups: CompareColumn['lookups'] = [];
    for (const t of (r?.trace ?? []).slice().sort((a, b) => a.step - b.step)) {
      if (t.tool === 'read_entry') { if (t.ok && t.entryId && !opened.includes(t.entryId)) opened.push(t.entryId); }
      else lookups.push({ tool: t.tool, note: t.note ?? (t.ok ? 'ok' : 'failed'), live: t.live ?? false });
    }
    const gate = r?.gate;
    return {
      file: f.file,
      model: f.data.run.model,
      label: MODEL_LABELS[f.data.run.model] ?? f.data.run.model,
      provider: f.data.run.provider,
      startedAt: f.data.run.startedAt,
      live: true,
      result: r,
      opened,
      lookups,
      sentences: (gate?.sentences ?? []).map(s => ({ index: s.index, text: s.text, citation: s.citation, quote: s.quote, status: s.status, reason: s.reason })),
      verdict: gate ? gate.verdict : 'error',
      reasons: gate?.reasons ?? [],
      ...(gate?.declinedReason ? { declinedReason: gate.declinedReason } : {}),
      outcomeLabel: r ? sideText(undefined).outcome(r.outcome) : 'not in this run',
      costUsd: r?.costUsd ?? 0,
      latencyMs: r?.latencyMs ?? 0,
      entriesRead: opened.length,
      chartSize: r?.reading?.chartSize ?? null,
    };
  });
}

export function formatUsd(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

// The title cards: three lines typed out letter by letter at about
// twenty-eight characters a second, each held a moment once complete and kept
// while the next types, so the block gathers at the top of the page as one
// short paragraph while the replay waits below; then the block fades and the
// page comes into focus. Written from far out, for someone who has never seen
// the project: how care is paid for in the United States, what payers have
// been cited for, and what this does about it. No project names: a cold viewer
// cannot know them. Kept here so a test can hold the copy to its discipline:
// three lines, at most thirty-two words each, sentence case, no exclamation
// marks, no jargon; a statement that warrants a source carries a superscript
// marker that INTRO_NOTES resolves.
export const INTRO_LINES: readonly string[] = [
  "In the United States, when a doctor bills a health insurer or Medicare, payment depends on what the doctor documented, judged against that payer's coverage rules.",
  "Those rules differ by payer.\u00b9 Federal investigators have found Medicare Advantage plans denying care that met Medicare's own criteria.\u00b2",
  // The closing sentence is held together with no-break spaces so it never splits across rows.
  "This project places the payer policy in force on the date of service beside the doctor's record, so each side can be checked against the other. It\u00a0drafts;\u00a0a\u00a0physician\u00a0signs.",
];

// The sources for the marked statements, small, at the bottom with the stamp.
// A test holds every marker in the lines to an entry here.
export const INTRO_NOTES = "\u00b9 \u00b2 HHS Office of Inspector General, report OEI-09-18-00260, April 2022: Medicare Advantage plans applied clinical criteria not in Medicare coverage rules, and 13 percent of the requests they denied met those rules";

export const INTRO_STAMP = "Built this week: everything shown here. Pre-existing, not shown: the author's record system, appeal engine, coverage index, and the published LITMUS standard.";

export const INTRO_CHAR_MS = 36; // per typed character
export const INTRO_HOLD_MS = 2000; // after the last character, cursor still blinking
export const INTRO_FADE_MS = 400;
// After the last line is typed and held, the finished block stays this much
// longer before it travels to the bottom of the page; the travel itself takes
// INTRO_MOVE_MS (styles.css fades the scrim and the caption band over the same
// time). Both are Jim's: "leave an additional 2 seconds at end of cards before
// moving to bottom", with the move slowed a little.
export const INTRO_END_PAUSE_MS = 2000;
export const INTRO_MOVE_MS = 700;

export function introTypeMs(line: string): number {
  return line.length * INTRO_CHAR_MS;
}

// When each card starts typing, finishes, and leaves, from the start of the sequence.
export function introSchedule(lines: readonly string[] = INTRO_LINES): { show: number; typed: number; hide: number }[] {
  const out: { show: number; typed: number; hide: number }[] = [];
  let t = 300;
  for (const line of lines) {
    const show = t;
    const typed = show + introTypeMs(line);
    const hide = typed + INTRO_HOLD_MS;
    out.push({ show, typed, hide });
    t = hide + INTRO_FADE_MS;
  }
  return out;
}
