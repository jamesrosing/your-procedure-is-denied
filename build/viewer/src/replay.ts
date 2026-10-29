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
  denial: { carc: string; text: string; dateOfService: string };
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
}

export interface ResultsFile {
  run: { startedAt: string; provider: string; model: string; effort: string; cases: number; agentic?: boolean };
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
  | { kind: 'read'; entryId: string; tool: string; live: boolean; note?: string; atMs: number }
  | { kind: 'lookup'; tool: string; note: string; live: boolean; input?: LookupQuestion; atMs: number }
  | { kind: 'read-all'; entryIds: string[]; atMs: number }
  | { kind: 'evidence'; criterion: string; citation: string; quote: string; status: RecordStatus; reason: string; atMs: number }
  | { kind: 'sentence'; index: number; text: string; citation: string; quote: string; status: RecordStatus; reason: string; atMs: number }
  | { kind: 'advice'; model: string; items: { criterion: string; verdict: 'supports' | 'partial' | 'silent'; why: string }[]; atMs: number }
  | { kind: 'verdict'; verdict: 'pass' | 'blocked' | 'declined' | 'error'; reasons: string[]; declinedReason?: string; blockedSentence?: number; error?: string; atMs: number };

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
  counters: { entriesRead: number; chartSize: number; sentencesVerified: number; sentencesTotal: number; costUsd: number; elapsedMs: number };
  done: boolean;
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
  let readingEnds = 0;

  if (trace.length > 0) {
    for (const t of trace) {
      if (t.tool === 'read_entry' && t.entryId && chartIds.has(t.entryId)) {
        steps.push({ kind: 'read', entryId: t.entryId, tool: t.tool, live: t.live ?? false, ...(t.note ? { note: t.note } : {}), atMs: t.atMs });
      } else if (t.tool !== 'read_entry') {
        const input = lookupQuestion(t.input);
        steps.push({ kind: 'lookup', tool: t.tool, note: t.note ?? (t.ok ? 'ok' : 'failed'), live: t.live ?? false, ...(input ? { input } : {}), atMs: t.atMs });
      }
      readingEnds = Math.max(readingEnds, t.atMs);
    }
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
  // them across the remaining latency so the replay has a visible rhythm.
  const tail = gate.evidence.length + gate.sentences.length + 1;
  const span = Math.max(0, result.latencyMs - readingEnds);
  const at = (i: number) => Math.round(readingEnds + (span * (i + 1)) / tail);
  let i = 0;
  for (const e of gate.evidence) {
    steps.push({ kind: 'evidence', criterion: e.criterion, citation: e.citation, quote: e.quote, status: e.status, reason: e.reason, atMs: at(i++) });
  }
  for (const s of gate.sentences) {
    steps.push({ kind: 'sentence', index: s.index, text: s.text, citation: s.citation, quote: s.quote, status: s.status, reason: s.reason, atMs: at(i++) });
  }
  const blocked = gate.sentences.find(s => s.status !== 'verified');
  steps.push({
    kind: 'verdict',
    verdict: gate.verdict,
    reasons: gate.reasons,
    ...(gate.declinedReason ? { declinedReason: gate.declinedReason } : {}),
    ...(gate.verdict === 'blocked' && blocked ? { blockedSentence: blocked.index } : {}),
    atMs: result.latencyMs,
  });
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
    counters: { entriesRead: 0, chartSize: c.chart.length, sentencesVerified: 0, sentencesTotal: result.gate?.sentences.length ?? 0, costUsd: 0, elapsedMs: 0 },
    done: steps.length === 0,
  };
}

function apply(state: ReplayState, step: Step, result: ViewerResult, c: ViewerCase): ReplayState {
  const next: ReplayState = {
    ...state,
    strip: null,
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
      break;
    case 'read-all':
      for (const id of step.entryIds) if (!next.read.includes(id)) next.read.push(id);
      next.open = step.entryIds[step.entryIds.length - 1] ?? null;
      break;
    case 'lookup':
      next.lookups.push({ tool: step.tool, note: step.note, live: step.live, ...(step.input ? { input: step.input } : {}) });
      next.strip = lookupStrip(step, c);
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
    case 'sentence':
      next.sentences.push({ index: step.index, text: step.text, citation: step.citation, quote: step.quote, status: step.status, reason: step.reason });
      next.open = step.citation;
      break;
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

export function scoreboard(files: ResultsFile[]): ScoreboardRow[] {
  return files
    .map(scoreboardRow)
    .sort((a, b) => Number(a.agentic) - Number(b.agentic) || Number(a.live) - Number(b.live) || rank(a.model) - rank(b.model) || a.model.localeCompare(b.model));
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
// three lines, at most thirty words each, sentence case, no exclamation
// marks, no jargon; a statement that warrants a source carries a superscript
// marker that INTRO_NOTES resolves.
export const INTRO_LINES: readonly string[] = [
  "In the United States, when a doctor bills a health insurer or Medicare, payment depends on what the doctor documented, judged against that payer's coverage rules.",
  "Those rules differ by payer.\u00b9 Federal investigators have found Medicare Advantage plans denying care that met Medicare's own criteria.\u00b2",
  "This project places the payer policy in force on the date of service beside the doctor's record, so each side can be checked against the other.",
];

// The sources for the marked statements, small, at the bottom with the stamp.
// A test holds every marker in the lines to an entry here.
export const INTRO_NOTES = "\u00b9 \u00b2 HHS Office of Inspector General, report OEI-09-18-00260, April 2022: Medicare Advantage plans applied clinical criteria not in Medicare coverage rules, and 13 percent of the requests they denied met those rules";

export const INTRO_STAMP = "Built this week: everything shown here. Pre-existing, not shown: the author's record system, appeal engine, coverage index, and the published LITMUS standard.";

export const INTRO_CHAR_MS = 36; // per typed character
export const INTRO_HOLD_MS = 2000; // after the last character, cursor still blinking
export const INTRO_FADE_MS = 400;

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
