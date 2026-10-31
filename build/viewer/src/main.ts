// The page: loads the manifest the build script writes into data/, picks a
// results file and a case, and renders `stateAt` for the current cursor.
// Everything that decides what a step means lives in replay.ts.
import {
  buildTimeline, carcHelp, codeSystemHelp, compareColumns, DATA_NOTE, denialKind, DENIAL_KIND_HELP, firstLine, PANEL_HELP, parseStep, VERDICT_HELP, formatSeconds, formatUsd, INTRO_CHAR_MS, LABEL_HELP, payerRemark, INTRO_END_PAUSE_MS, INTRO_FADE_MS, INTRO_LINES, INTRO_MOVE_MS, INTRO_NOTES, INTRO_STAMP, introSchedule, newestRun, playDelayMs, scoreboard, sideText, stateAt,
  type ReplayState, type ResultsFile, type Step, type ViewerCase, type ViewerResult,
  type SentenceState,
} from './replay.js';
import { recheck, recheckLabel, EDIT_BUTTON, EDIT_HELP, EDIT_NOTE } from './gatecheck.js';
import { writDocument, writText, WRIT_BUTTON, WRIT_HELP } from './writ.js';
import { gateSources, sourcesHash } from '../../src/sources.js';

// group: where the file sits. kept is results/ (Table 1, the scoreboard, the
// compare tab); payer, repair, and effort are the post hoc directories, listed
// last in the picker, labeled, and kept off the scoreboard.
type Group = 'kept' | 'payer' | 'repair' | 'effort';
interface ManifestRun { file: string; provider: string; model: string; effort: string; startedAt: string; cases: number; agentic: boolean; live?: boolean; side?: 'payer'; group?: Group; repair?: number }
interface Manifest {
  results: ManifestRun[];
  cases: string;
}
const groupOf = (m: ManifestRun): Group => m.group ?? (m.side === 'payer' ? 'payer' : 'kept');
type View = 'replay' | 'board' | 'compare';
let view: View = 'replay';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const ui = {
  filePicker: $<HTMLSelectElement>('file-picker'),
  casePicker: $<HTMLSelectElement>('case-picker'),
  restart: $<HTMLButtonElement>('btn-restart'),
  back: $<HTMLButtonElement>('btn-back'),
  play: $<HTMLButtonElement>('btn-play'),
  step: $<HTMLButtonElement>('btn-step'),
  end: $<HTMLButtonElement>('btn-end'),
  speed: $<HTMLSelectElement>('speed'),
  board: $<HTMLButtonElement>('btn-board'),
  tabReplay: $<HTMLButtonElement>('tab-replay'),
  tabCompare: $<HTMLButtonElement>('tab-compare'),
  compareSection: $<HTMLElement>('compare'),
  compareGrid: $<HTMLElement>('compare-grid'),
  compareHead: $<HTMLElement>('compare-case'),
  chartWhy: $<HTMLElement>('chart-why'),
  theme: $<HTMLButtonElement>('btn-theme'),
  ctxCrumb: $<HTMLElement>('ctx-crumb'),
  ctxTitle: $<HTMLElement>('ctx-title'),
  ctxMeta: $<HTMLElement>('ctx-meta'),
  ctxStamp: $<HTMLElement>('ctx-stamp'),
  stage: $<HTMLElement>('stage'),
  context: $<HTMLElement>('context'),
  entries: $<HTMLOListElement>('entries'),
  chartMeta: $<HTMLElement>('chart-meta'),
  criteria: $<HTMLOListElement>('criteria'),
  critMeta: $<HTMLElement>('crit-meta'),
  lookups: $<HTMLUListElement>('lookups'),
  sentences: $<HTMLOListElement>('sentences'),
  draftMeta: $<HTMLElement>('draft-meta'),
  draftEmpty: $<HTMLElement>('draft-empty'),
  verdict: $<HTMLElement>('verdict'),
  cRead: $<HTMLElement>('c-read'),
  cReadL: $<HTMLElement>('c-read-l'),
  cVerified: $<HTMLElement>('c-verified'),
  cVerifiedL: $<HTMLElement>('c-verified-l'),
  cCost: $<HTMLElement>('c-cost'),
  cElapsed: $<HTMLElement>('c-elapsed'),
  progress: $<HTMLElement>('progress'),
  boardSection: $<HTMLElement>('board'),
  intro: $<HTMLElement>('intro'),
  introStage: $<HTMLElement>('intro-stage'),
  strip: $<HTMLElement>('strip'),
  payerReason: $<HTMLElement>('payer-reason'),
  preamble: $<HTMLElement>('preamble'),
  preambleText: $<HTMLElement>('preamble-text'),
  preambleNotes: $<HTMLElement>('preamble-notes'),
  preambleData: $<HTMLElement>('preamble-data'),
  preambleStamp: $<HTMLElement>('preamble-stamp'),
  preambleClose: $<HTMLButtonElement>('preamble-close'),
  about: $<HTMLButtonElement>('btn-about'),
  writ: $<HTMLElement>('writ'),
  writPrint: $<HTMLButtonElement>('writ-print'),
  writText: $<HTMLButtonElement>('writ-text'),
  writClose: $<HTMLButtonElement>('writ-close'),
  writBand: $<HTMLElement>('writ-band'),
  writHeading: $<HTMLElement>('writ-h'),
  writTo: $<HTMLElement>('writ-to'),
  writRe: $<HTMLElement>('writ-re'),
  writReason: $<HTMLElement>('writ-reason'),
  writOpening: $<HTMLElement>('writ-opening'),
  writBody: $<HTMLElement>('writ-body'),
  writFootnotes: $<HTMLOListElement>('writ-footnotes'),
  writProvenance: $<HTMLElement>('writ-provenance'),
  writSignature: $<HTMLElement>('writ-signature'),
  introStamp: $<HTMLElement>('intro-stamp'),
  introSources: $<HTMLElement>('intro-sources'),
  introSkip: $<HTMLButtonElement>('intro-skip'),
  boardTable: $<HTMLTableElement>('board-table'),
  boardData: $<HTMLElement>('board-data'),
  panelSub: { chart: $<HTMLElement>('chart-sub'), criteria: $<HTMLElement>('crit-sub'), draft: $<HTMLElement>('draft-sub') },
  panelHead: { chart: $<HTMLElement>('chart-h'), criteria: $<HTMLElement>('crit-h'), draft: $<HTMLElement>('draft-h') },
};

interface Session {
  manifest: Manifest;
  cases: Map<string, ViewerCase>;
  files: Map<string, ResultsFile>; // by manifest file name, loaded on demand
  file: ResultsFile | null;
  result: ViewerResult | null;
  caseData: ViewerCase | null;
  steps: Step[];
  cursor: number;
  playing: boolean;
  timer: number | null;
  rendered: { caseId: string | null; file: string | null };
}

const session: Session = {
  manifest: { results: [], cases: '' },
  cases: new Map(),
  files: new Map(),
  file: null,
  result: null,
  caseData: null,
  steps: [],
  cursor: 0,
  playing: false,
  timer: null,
  rendered: { caseId: null, file: null },
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`could not load ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function text(tag: string, cls: string, content: string): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.textContent = content;
  return el;
}

// --- rendering ---------------------------------------------------------------

function renderContext(c: ViewerCase, r: ViewerResult): void {
  const run = session.file?.run;
  const side = sideText(run?.side);
  const sep = () => text('span', 'sep', '›');
  ui.ctxCrumb.replaceChildren(text('span', 'mono', c.id), sep(), text('span', '', c.patient.alias), sep(), text('span', '', `${c.patient.age} year old ${c.patient.sex}`));
  ui.ctxTitle.textContent = c.procedure.description;
  // Each label explains itself on hover; the narration says the same once.
  const help = (el: HTMLElement, title: string): HTMLElement => { el.title = title; return el; };
  ui.ctxMeta.replaceChildren(
    help(text('span', 'mono', `${c.procedure.codeSystem} ${c.procedure.code}`), codeSystemHelp(c.procedure.codeSystem)),
    help(text('span', 'mono strong', `CARC ${c.denial.carc}`), carcHelp(c)),
    help(text('span', '', denialKind(c)), DENIAL_KIND_HELP),
    help(text('span', '', `${c.payer.name}, ${c.payer.planType}`), 'The payer that denied the claim, a fictional plan, and its plan type.'),
    help(text('span', '', r.category), LABEL_HELP['category'] ?? ''),
    help(text('span', '', `about $${c.stakesUsd.toLocaleString()} at stake`), LABEL_HELP['stakes'] ?? ''),
  );
  const gate = r.gate?.litmus ?? '';
  const gateVersion = /v\d+\.\d+/.exec(gate)?.[0] ?? '';
  ui.ctxStamp.replaceChildren(
    ...(run ? [help(text('span', '', `model ${run.model}`), LABEL_HELP['model'] ?? ''), help(text('span', '', `provider ${run.provider}`), LABEL_HELP['provider'] ?? ''), help(text('span', '', `effort ${run.effort}`), LABEL_HELP['effort'] ?? ''), help(text('span', '', `run ${run.startedAt.slice(0, 10)}`), LABEL_HELP['run'] ?? '')] : []),
    ...(gateVersion ? [help(text('span', '', `gate litmus ${gateVersion}`), LABEL_HELP['gate'] ?? '')] : []),
    ...(run?.repair ? [help(text('span', 'strong', `repair turn \u00d7${run.repair}, post hoc`), LABEL_HELP['repair'] ?? '')] : []),
    ...(side.stamp ? [help(text('span', 'strong', side.stamp), side.draftHelp)] : []),
    help(text('span', 'mono', `record ${sourcesHash(gateSources(c)).slice(0, 12)}`), LABEL_HELP['record'] ?? ''),
    help(text('span', '', 'synthetic record'), LABEL_HELP['synthetic'] ?? ''),
  );
  if (ui.panelHead.draft.textContent !== side.draftHeading) { ui.panelHead.draft.textContent = side.draftHeading; ui.panelHead.draft.title = side.draftHelp; ui.panelSub.draft.textContent = side.draftHelp; }
  // The payer's own reason, above the criteria, so the insurer's claim sits
  // over the record's quotes that answer it.
  const remark = payerRemark(c);
  if (remark) {
    const q = document.createElement('q');
    q.textContent = remark;
    ui.payerReason.replaceChildren(text('span', 'lbl', `the payer's reason, CARC ${c.denial.carc}`), q);
    ui.payerReason.hidden = false;
  } else {
    ui.payerReason.replaceChildren();
    ui.payerReason.hidden = true;
  }
}

// The chart index is built once per case and then only its data-state changes,
// so the slide-open transition runs instead of the list re-rendering.
function buildEntries(c: ViewerCase): void {
  ui.entries.replaceChildren(...c.chart.map(e => {
    const li = document.createElement('li');
    li.className = 'entry';
    li.dataset['id'] = e.id;
    li.dataset['state'] = 'dim';
    const head = document.createElement('div');
    head.className = 'head';
    head.append(text('span', 'id', e.id), text('span', 'date', e.date), text('span', 'kind', e.kind), text('span', 'tag', ''));
    const full = document.createElement('div');
    full.className = 'full';
    const inner = document.createElement('div');
    inner.append(text('p', '', e.text));
    full.append(inner);
    li.append(head, text('div', 'line', firstLine(e.text)), full);
    return li;
  }));
}

function renderEntries(state: ReplayState, steps: Step[]): void {
  const readAt = new Map<string, Step>();
  for (const s of steps.slice(0, state.cursor)) if (s.kind === 'read' && !readAt.has(s.entryId)) readAt.set(s.entryId, s);
  for (const li of ui.entries.children) {
    const el = li as HTMLElement;
    const id = el.dataset['id'] ?? '';
    const next = id === state.open ? 'open' : state.read.includes(id) ? 'read' : 'dim';
    if (el.dataset['state'] !== next) el.dataset['state'] = next;
    const tag = el.querySelector('.tag') as HTMLElement;
    const s = readAt.get(id);
    const label: string = s?.kind === 'read' ? `${s.tool}${s.live ? ', live' : ''}${s.repair ? `, repair turn ${s.repair}` : ''}` : state.read.includes(id) ? 'cited' : '';
    if (tag.textContent !== label) tag.textContent = label;
    tag.classList.toggle('live', s?.kind === 'read' && s.live === true);
    tag.classList.toggle('repair', s?.kind === 'read' && s.repair !== undefined);
  }
  // state.open is a citation the model wrote; escape it so a stray quote or
  // bracket cannot throw inside render and stall playback.
  const open = state.open ? ui.entries.querySelector<HTMLElement>(`[data-id="${CSS.escape(state.open)}"]`) : null;
  open?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  ui.chartMeta.textContent = `${state.counters.chartSize} entries, ${state.read.length} read`;
  renderWhy(state);
}

// The model's reason for the read it is making, typed out under the chart
// header while the entry lights (the API returns only redacted thinking, so
// the reason is the one the model wrote into the tool call). Typed once per
// visit to the step; a re-render at the same cursor leaves it alone.
let whyTimers: number[] = [];
let whyKey = '';
function renderWhy(state: ReplayState): void {
  const why = state.why;
  const key = why ? `${session.rendered.file ?? ''}|${session.result?.caseId ?? ''}|${state.cursor}` : '';
  if (!why) {
    if (!ui.chartWhy.hidden) { ui.chartWhy.hidden = true; ui.chartWhy.replaceChildren(); }
    for (const t of whyTimers) window.clearTimeout(t);
    whyTimers = []; whyKey = '';
    return;
  }
  if (key === whyKey && !ui.chartWhy.hidden) return;
  for (const t of whyTimers) window.clearTimeout(t);
  whyTimers = []; whyKey = key;
  const lbl = text('span', 'lbl', why.entryId ? `why ${why.entryId}` : why.live ? 'why the live query' : 'why');
  const val = text('span', 'val', '');
  ui.chartWhy.replaceChildren(lbl, val);
  ui.chartWhy.hidden = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { val.textContent = why.text; return; }
  const chars = [...why.text];
  const cursor = text('span', 'cursor', '');
  val.append(cursor);
  let n = 0;
  const tick = (): void => {
    const ch = chars[n];
    if (ch !== undefined) cursor.before(document.createTextNode(ch));
    n += 1;
    if (n < chars.length) whyTimers.push(window.setTimeout(tick, Math.max(8, INTRO_CHAR_MS / 3)));
    else whyTimers.push(window.setTimeout(() => cursor.remove(), 600));
  };
  tick();
}

function renderCriteria(state: ReplayState): void {
  renderStrip(state);
  ui.criteria.replaceChildren(...state.criteria.map(k => {
    const li = document.createElement('li');
    li.className = 'criterion';
    li.dataset['status'] = k.status;
    const box = text('span', 'box', k.status === 'verified' ? '✓' : k.status === 'unverified' ? '⚠' : '');
    const t = document.createElement('div');
    t.className = 'text';
    t.append(text('span', 'cid', k.id), k.text);
    li.append(box, t);
    if (k.evidence.length > 0) {
      const ev = document.createElement('div');
      ev.className = 'evidence';
      for (const e of k.evidence) {
        const q = document.createElement('div');
        q.className = 'quote';
        q.dataset['status'] = e.status;
        q.append(text('span', '', `“${e.quote}”`), text('span', 'src', e.citation));
        if (e.status !== 'verified') q.append(text('span', 'why', e.reason));
        ev.append(q);
      }
      li.append(ev);
    } else if (k.status === 'unverified') {
      li.append(text('div', 'none', '⚠ No evidence found in the chart for this criterion.'));
    }
    if (k.advice) {
      // The advisor's opinion: interpretation, named, beside the criterion, never a gate input.
      const a = document.createElement('div');
      a.className = 'advice';
      a.dataset['verdict'] = k.advice.verdict;
      const glyph = k.advice.verdict === 'supports' ? '✓' : k.advice.verdict === 'partial' ? '◐' : '◌';
      a.append(text('span', 'advice-tag', `advisor ${k.advice.model}`), text('span', 'advice-verdict', `${glyph} ${k.advice.verdict}`), text('span', 'advice-why', k.advice.why));
      li.append(a);
    }
    return li;
  }));
  const met = state.criteria.filter(k => k.status === 'verified').length;
  ui.critMeta.textContent = `${met} of ${state.criteria.length} with verified evidence`;
  ui.lookups.replaceChildren(...state.lookups.map(l => {
    const li = document.createElement('li');
    if (l.live) li.append(text('span', 'live-tag', 'live CHART query, prior-work data source'));
    li.append(text('span', '', `${l.tool}: ${l.note}`));
    return li;
  }));
}

// The live query strip. The answer types out once per visit to the step; a
// re-render at the same cursor leaves it alone.
let stripTimers: number[] = [];
let stripKey = '';
function renderStrip(state: ReplayState): void {
  const strip = state.strip;
  const key = strip ? `${session.rendered.file ?? ''}|${session.result?.caseId ?? ''}|${state.cursor}` : '';
  if (!strip) {
    if (!ui.strip.hidden) { ui.strip.hidden = true; ui.criteria.hidden = false; ui.lookups.hidden = false; }
    for (const t of stripTimers) window.clearTimeout(t);
    stripTimers = []; stripKey = '';
    return;
  }
  if (key === stripKey && !ui.strip.hidden) return;
  for (const t of stripTimers) window.clearTimeout(t);
  stripTimers = []; stripKey = key;
  const node = (cls: string, label: string, value: string) => {
    const n = document.createElement('div');
    n.className = `node ${cls}`;
    n.append(text('span', 'lbl', label), text('span', 'val', value));
    return n;
  };
  const arrow = () => text('span', 'arrow', '→');
  const answer = node('answer', 'answer', '');
  const q = text('div', 'q', '');
  q.append(text('span', 'live-tag', 'live CHART query, prior-work data source'), text('span', '', strip.question));
  ui.strip.replaceChildren(node('payer', 'payer', strip.payer), arrow(), node('authority', 'authority asked', strip.authority), arrow(), node('index', 'index', strip.index), arrow(), answer, q);
  ui.criteria.hidden = true;
  ui.lookups.hidden = true; // the strip carries the query's line; the list returns with the criteria
  ui.strip.hidden = false;
  const val = answer.querySelector<HTMLElement>('.val')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { val.textContent = strip.answer; return; }
  // Type the answer after the nodes have arrived, at the title cards' pace.
  const chars = [...strip.answer];
  const cursor = text('span', 'cursor', '');
  val.append(cursor);
  let n = 0;
  const tick = (): void => {
    const ch = chars[n];
    if (ch !== undefined) cursor.before(document.createTextNode(ch));
    n += 1;
    if (n < chars.length) stripTimers.push(window.setTimeout(tick, INTRO_CHAR_MS));
    else stripTimers.push(window.setTimeout(() => cursor.remove(), 900));
  };
  stripTimers.push(window.setTimeout(tick, 560));
}

// A sentence as the gate judged it: text, citation, quote, status, reason. Kept
// per rendered row so the in-browser editor can restore it after an edit.
interface SentenceOriginal { text: string; citation: string; quote: string; status: SentenceState['status']; reason: string }
const originals = new WeakMap<HTMLElement, SentenceOriginal>();

function stampText(status: SentenceState['status']): string {
  return `${status === 'verified' ? '✓' : status === 'needs-citation' ? '◐' : '⚠'} ${recheckLabel(status)}`;
}

function fillWhy(why: HTMLElement, s: SentenceOriginal, previous?: { status: SentenceState['status']; reason: string }): void {
  why.className = s.status === 'verified' ? 'why' : 'why bad';
  why.replaceChildren();
  // A re-stamped sentence shows its first stamp and the gate's reason, then the stamp it carries now.
  if (previous) {
    const first = text('div', 'restamp', '');
    first.dataset['status'] = previous.status;
    first.append(text('b', '', `first ${stampText(previous.status)}`), text('span', '', ` ${previous.reason}`), text('span', 'then', ` \u2192 after the repair turn ${stampText(s.status)}`));
    why.append(first);
  }
  if (s.status === 'verified') {
    why.append(text('b', '', 'verified '), text('span', 'src', `${s.citation}: `), (() => { const q = document.createElement('q'); q.textContent = s.quote; return q; })());
  } else {
    why.append(text('b', '', `${recheckLabel(s.status)} `), text('span', '', `${s.reason} (cited ${s.citation})`));
  }
}

function renderSentences(state: ReplayState): void {
  const named = state.verdict?.kind === 'verdict' ? state.verdict.blockedSentence : undefined;
  const existing = ui.sentences.children.length;
  // Append only the new sentences so earlier ones keep still and the new one animates in.
  if (existing > state.sentences.length) ui.sentences.replaceChildren();
  // A repair turn re-stamps a sentence in place: the row stays, its stamp and
  // reason change, and the first stamp is kept above the new one.
  for (let i = 0; i < Math.min(ui.sentences.children.length, state.sentences.length); i++) {
    const li = ui.sentences.children[i] as HTMLElement;
    const s = state.sentences[i]!;
    const o = originals.get(li);
    if (!o || li.dataset['editing'] || (o.status === s.status && o.reason === s.reason && o.text === s.text && o.citation === s.citation && o.quote === s.quote)) continue;
    const original: SentenceOriginal = { text: s.text, citation: s.citation, quote: s.quote, status: s.status, reason: s.reason };
    originals.set(li, original);
    li.dataset['status'] = s.status;
    li.classList.add('restamped');
    li.querySelector<HTMLElement>('.text')!.textContent = s.text;
    li.querySelector<HTMLElement>('.stamp')!.textContent = stampText(s.status);
    fillWhy(li.querySelector<HTMLElement>('.why')!, original, s.previous);
  }
  for (const s of state.sentences.slice(ui.sentences.children.length)) {
    const li = document.createElement('li');
    li.className = 'sentence';
    li.dataset['status'] = s.status;
    li.dataset['index'] = String(s.index);
    const original: SentenceOriginal = { text: s.text, citation: s.citation, quote: s.quote, status: s.status, reason: s.reason };
    originals.set(li, original);
    const why = document.createElement('div');
    fillWhy(why, original, s.previous);
    if (s.previous) li.classList.add('restamped');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit';
    edit.textContent = EDIT_BUTTON;
    edit.title = EDIT_HELP;
    li.append(text('div', 'text', s.text), text('span', 'stamp', stampText(s.status)), why, edit);
    ui.sentences.append(li);
  }
  // The gate can be tested by hand once the replay has reached its verdict.
  ui.sentences.dataset['editable'] = state.verdict ? 'true' : 'false';
  for (const li of ui.sentences.children) (li as HTMLElement).classList.toggle('named', named !== undefined && (li as HTMLElement).dataset['index'] === String(named));
  ui.sentences.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  ui.draftEmpty.hidden = state.sentences.length > 0 || state.verdict !== null;
  ui.draftMeta.textContent = state.counters.sentencesTotal > 0 ? `${state.counters.sentencesVerified} of ${state.counters.sentencesTotal} sentences verified` : '';
}

// The gate in the browser: the reader edits a sentence, its quote, or its
// citation, and the same gate the harness ran re-checks it against the same
// case. Nothing is saved; restore puts the stored record back.
function openEditor(li: HTMLElement): void {
  const original = originals.get(li);
  const c = session.caseData;
  if (!original || !c || li.dataset['editing']) return;
  li.dataset['editing'] = 'true';
  const textEl = li.querySelector<HTMLElement>('.text')!;
  const stamp = li.querySelector<HTMLElement>('.stamp')!;
  const why = li.querySelector<HTMLElement>('.why')!;
  textEl.replaceChildren();
  const sentence = document.createElement('textarea');
  sentence.className = 'edit-text';
  sentence.value = original.text;
  sentence.rows = 3;
  sentence.setAttribute('aria-label', 'the sentence');
  textEl.append(sentence);

  const form = document.createElement('div');
  form.className = 'editor';
  const quote = document.createElement('textarea');
  quote.className = 'edit-quote';
  quote.value = original.quote;
  quote.rows = 2;
  quote.setAttribute('aria-label', 'the quote');
  const cite = document.createElement('select');
  cite.className = 'edit-cite';
  cite.setAttribute('aria-label', 'the cited entry');
  for (const e of c.chart) {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.id} · ${e.date} · ${e.kind}`;
    opt.selected = e.id === original.citation;
    cite.append(opt);
  }
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'btn primary small';
  check.textContent = 'check';
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.className = 'btn small';
  restore.textContent = 'restore';
  const row = text('div', 'row', '');
  row.append(check, restore);
  const note = text('div', 'edit-note', EDIT_HELP);
  form.append(text('label', '', 'quote'), quote, text('label', '', 'cites'), cite, row, note);
  li.append(form);
  sentence.focus();

  check.addEventListener('click', () => {
    const out = recheck(c, { text: sentence.value, citation: cite.value, quote: quote.value });
    const version = /v\d+(?:\.\d+)?/.exec(out.gate)?.[0] ?? '';
    li.dataset['status'] = out.status;
    li.dataset['edited'] = 'true';
    stamp.textContent = stampText(out.status);
    fillWhy(why, { text: sentence.value, citation: cite.value, quote: quote.value, status: out.status, reason: out.reason });
    note.textContent = `${EDIT_NOTE} (gate ${version})`;
  });
  restore.addEventListener('click', () => {
    li.dataset['status'] = original.status;
    delete li.dataset['edited'];
    delete li.dataset['editing'];
    textEl.replaceChildren(document.createTextNode(original.text));
    stamp.textContent = stampText(original.status);
    fillWhy(why, original);
    form.remove();
  });
}

function renderVerdict(state: ReplayState): void {
  const v = state.verdict;
  ui.stage.dataset['verdict'] = v ? v.verdict : state.repair ? 'repair' : '';
  if (!v && state.repair) {
    // The repair turn: the gate's record went back to the model, verbatim.
    ui.verdict.hidden = false;
    ui.verdict.dataset['verdict'] = 'repair';
    const row = text('div', 'state', '');
    const stamp = text('span', 'state-name', `REPAIR TURN ${state.repair.turn}`);
    stamp.title = LABEL_HELP['repair'] ?? '';
    row.append(stamp, text('span', 'state-head', 'the gate\u2019s record sent back to the model, verbatim; the revised draft is re-stamped below'));
    ui.verdict.replaceChildren(row, ...state.repair.reasons.map(r => text('div', 'reason', r)));
    return;
  }
  if (!v) { ui.verdict.hidden = true; ui.verdict.replaceChildren(); return; }
  ui.verdict.hidden = false;
  ui.verdict.dataset['verdict'] = v.verdict;
  const stateRow = (name: string, head: string) => {
    const row = text('div', 'state', '');
    const stamp = text('span', 'state-name', name);
    stamp.title = VERDICT_HELP[v.verdict];
    row.append(stamp, text('span', 'state-head', head));
    return row;
  };
  const parts: HTMLElement[] = [];
  if (v.verdict === 'pass') {
    const side = sideText(session.file?.run.side);
    const row = stateRow('PASS', side.passHead(state.counters.sentencesVerified, state.counters.sentencesTotal));
    if (side.writ && session.result && session.caseData && session.file && writDocument(session.caseData, session.result, session.file.run)) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn writ-open';
      open.textContent = WRIT_BUTTON;
      open.title = WRIT_HELP;
      open.addEventListener('click', () => showWrit(true));
      row.append(open);
    }
    parts.push(row);
  } else if (v.verdict === 'blocked') {
    const bad = v.blockedSentence !== undefined ? state.sentences.find(s => s.index === v.blockedSentence) : undefined;
    parts.push(stateRow('BLOCKED', bad ? `“${bad.text}” did not verify; nothing leaves until every sentence does` : 'nothing leaves until every sentence and every criterion verifies'));
    for (const r of v.reasons) parts.push(text('div', 'reason', r));
  } else if (v.verdict === 'declined') {
    parts.push(stateRow('DECLINED', sideText(session.file?.run.side).declinedHead), text('div', 'reason', v.declinedReason ?? ''));
  } else {
    parts.push(stateRow('FAILED', v.error ?? 'the request failed before the gate ran'));
  }
  if (v.repair) parts.push(text('div', 'after-repair', `after repair turn ${v.repair}; the first verdict was BLOCKED and each re-stamped sentence keeps its first stamp above`));
  ui.verdict.replaceChildren(...parts);
}

// The writ: the passing draft rendered as the instrument, under a band that
// says it is a draft, unsigned, not sent. Print shows only the sheet; save
// writes the plain-text rendering. Nothing is sent anywhere.
function showWrit(open: boolean): void {
  if (!open) { ui.writ.hidden = true; return; }
  if (!sideText(session.file?.run.side).writ) return; // the instrument is the physician's; the payer side has none
  const c = session.caseData, r = session.result, f = session.file;
  // The instrument exists only once the replay has reached its verdict: PASS
  // is the gate's word on screen, not a stored field read ahead of it.
  const reached = c && r ? stateAt(session.steps, r, c, session.cursor).verdict?.verdict === 'pass' : false;
  const doc = reached && c && r && f ? writDocument(c, r, f.run) : null;
  if (!doc) return;
  ui.writBand.textContent = doc.band;
  ui.writHeading.textContent = doc.heading;
  ui.writTo.textContent = `To: ${doc.to}`;
  ui.writRe.textContent = `Re: ${doc.re}`;
  ui.writReason.replaceChildren();
  ui.writReason.hidden = !doc.payerReason;
  if (doc.payerReason) ui.writReason.append(text('span', 'lbl', 'the payer\u2019s reason'), document.createTextNode(doc.payerReason));
  ui.writOpening.textContent = doc.opening;
  ui.writBody.replaceChildren();
  doc.sentences.forEach((s, i) => {
    ui.writBody.append(document.createTextNode((i > 0 ? ' ' : '') + s.text));
    ui.writBody.append(text('sup', '', String(s.n)));
  });
  ui.writFootnotes.replaceChildren(...doc.footnotes.map(fn => {
    const li = document.createElement('li');
    const q = document.createElement('q');
    q.textContent = fn.quote;
    li.append(text('span', 'src', `${fn.entryId}, ${fn.date}, ${fn.kind}: `), q);
    return li;
  }));
  ui.writProvenance.textContent = doc.provenance;
  ui.writSignature.textContent = doc.signature;
  ui.writ.hidden = false;
  ui.writ.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function saveWritText(): void {
  const c = session.caseData, r = session.result, f = session.file;
  // The instrument exists only once the replay has reached its verdict: PASS
  // is the gate's word on screen, not a stored field read ahead of it.
  const reached = c && r ? stateAt(session.steps, r, c, session.cursor).verdict?.verdict === 'pass' : false;
  const doc = reached && c && r && f ? writDocument(c, r, f.run) : null;
  if (!doc) return;
  const blob = new Blob([writText(doc)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c!.id}-draft-unsigned.txt`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderCounters(state: ReplayState): void {
  ui.cRead.textContent = String(state.counters.entriesRead);
  ui.cReadL.textContent = `of ${state.counters.chartSize} chart entries read`;
  ui.cVerified.textContent = String(state.counters.sentencesVerified);
  ui.cVerifiedL.textContent = `of ${state.counters.sentencesTotal} sentences verified`;
  ui.cCost.textContent = formatUsd(state.counters.costUsd);
  ui.cElapsed.textContent = formatSeconds(state.counters.elapsedMs);
  ui.progress.style.width = state.total > 0 ? `${(100 * state.cursor) / state.total}%` : '0%';
}

function render(): void {
  const { result, caseData, steps } = session;
  if (!result || !caseData) return;
  const state = stateAt(steps, result, caseData, session.cursor);
  if (session.rendered.caseId !== caseData.id || session.rendered.file !== ui.filePicker.value) {
    buildEntries(caseData);
    ui.sentences.replaceChildren();
    renderContext(caseData, result);
    session.rendered = { caseId: caseData.id, file: ui.filePicker.value };
  }
  renderEntries(state, steps);
  renderCriteria(state);
  renderSentences(state);
  renderVerdict(state);
  // The writ follows the verdict: off the PASS frame, or on another case, it closes.
  if (!ui.writ.hidden && (!state.verdict || state.verdict.verdict !== 'pass')) ui.writ.hidden = true;
  renderCounters(state);
  if (view === 'compare') renderCompare();
  ui.back.disabled = session.cursor === 0;
  ui.restart.disabled = session.cursor === 0;
  ui.step.disabled = state.done;
  ui.end.disabled = state.done;
  ui.play.textContent = session.playing ? 'Pause' : state.done ? 'Replay' : 'Play';
}

// --- transport ---------------------------------------------------------------

function stop(): void {
  session.playing = false;
  if (session.timer !== null) { window.clearTimeout(session.timer); session.timer = null; }
}

function seek(cursor: number): void {
  session.cursor = Math.max(0, Math.min(cursor, session.steps.length));
  render();
}

function tick(): void {
  if (!session.playing) return;
  if (session.cursor >= session.steps.length) { stop(); render(); return; }
  seek(session.cursor + 1);
  if (session.cursor >= session.steps.length) { stop(); render(); return; }
  session.timer = window.setTimeout(tick, playDelayMs(session.steps, session.cursor, Number(ui.speed.value)));
}

function play(): void {
  if (session.playing) { stop(); render(); return; }
  if (session.cursor >= session.steps.length) session.cursor = 0;
  session.playing = true;
  render();
  session.timer = window.setTimeout(tick, playDelayMs(session.steps, session.cursor, Number(ui.speed.value)));
}

// --- selection ---------------------------------------------------------------

function outcomeLabel(o: string): string {
  return sideText(session.file?.run.side).outcome(o);
}

async function selectFile(name: string): Promise<void> {
  stop();
  let file = session.files.get(name);
  if (!file) {
    file = await fetchJson<ResultsFile>(`data/results/${name}`);
    session.files.set(name, file);
  }
  session.file = file;
  const current = ui.casePicker.value;
  ui.casePicker.replaceChildren(...file.results.map(r => {
    const o = document.createElement('option');
    o.value = r.caseId;
    o.textContent = `${r.caseId}, ${r.category}, ${outcomeLabel(r.outcome)}`;
    return o;
  }));
  const wanted = file.results.some(r => r.caseId === current) ? current : file.results[0]?.caseId ?? '';
  ui.casePicker.value = wanted;
  selectCase(wanted);
}

// A case the file does not hold (a stale or mistyped link) falls back to the
// file's first case rather than an empty page. The address is rewritten in
// place: changing case is not a page a reader would want to go back to.
function selectCase(caseId: string, step: string | null = null): void {
  stop();
  const file = session.file;
  if (!file) return;
  const result = file.results.find(r => r.caseId === caseId) ?? file.results[0] ?? null;
  if (result && result.caseId !== caseId) { caseId = result.caseId; ui.casePicker.value = caseId; }
  const caseData = session.cases.get(caseId) ?? null;
  session.result = result;
  session.caseData = caseData;
  session.steps = result && caseData ? buildTimeline(result, caseData) : [];
  session.cursor = 0;
  writeAddress(caseId, step);
  render();
}

// The hash is the address of the frame on screen: file, case, and, when the
// page was opened on one, the step. Written without a history entry, so the
// back button leaves the page rather than walking through cases.
function writeAddress(caseId: string, step: string | null): void {
  const next = `#file=${encodeURIComponent(ui.filePicker.value)}&case=${caseId}${step !== null && step !== '' ? `&step=${encodeURIComponent(step)}` : ''}${view === 'compare' ? '&view=compare' : ''}`;
  if (window.location.hash !== next) history.replaceState(null, '', next);
}

// Three surfaces share the header: the replay, the scoreboard, and the compare
// tab. The case picker drives the replay and the compare tab alike.
function showView(next: View): void {
  view = next;
  ui.tabReplay.setAttribute('aria-selected', String(next === 'replay'));
  ui.board.setAttribute('aria-selected', String(next === 'board'));
  ui.tabCompare.setAttribute('aria-selected', String(next === 'compare'));
  ui.stage.hidden = next !== 'replay';
  ui.boardSection.hidden = next !== 'board';
  ui.compareSection.hidden = next !== 'compare';
  if (next !== 'replay') { stop(); render(); }
  if (next === 'compare') void renderCompare();
  if (session.result) writeAddress(session.result.caseId, null);
}
function showBoard(on: boolean): void { showView(on ? 'board' : 'replay'); }

// The kept runs: results/ itself, the files of Table 1 and the scoreboard.
function keptManifest(): ManifestRun[] {
  return session.manifest.results.filter(m => groupOf(m) === 'kept');
}

async function loadFiles(runs: ManifestRun[]): Promise<{ file: string; data: ResultsFile }[]> {
  return Promise.all(runs.map(async m => {
    let f = session.files.get(m.file);
    if (!f) { f = await fetchJson<ResultsFile>(`data/results/${m.file}`); session.files.set(m.file, f); }
    return { file: m.file, data: f };
  }));
}

// The compare tab: the case on the picker, the three models' kept live-CHART
// results in three columns, from the stored files. Nothing is re-run.
let compareKey = '';
async function renderCompare(): Promise<void> {
  const caseId = session.result?.caseId ?? ui.casePicker.value;
  const c = session.cases.get(caseId);
  if (!c) return;
  const files = await loadFiles(keptManifest());
  const cols = compareColumns(files, caseId);
  const key = `${caseId}|${cols.map(x => x.file).join(',')}`;
  if (key === compareKey) return;
  compareKey = key;
  ui.compareHead.replaceChildren(text('span', 'mono', c.id), text('span', '', ` \u203a ${c.procedure.description} \u203a CARC ${c.denial.carc}, ${c.payer.name}`), text('span', 'dim', ` \u00b7 the three models\u2019 kept live-CHART runs on this case, from the stored files; the key labels this case ${c.expected.warranted ? 'warranted' : `not warranted (${c.expected.subtype ?? 'unsupported'})`}`));
  ui.compareGrid.replaceChildren(...cols.map(col => {
    const el = document.createElement('article');
    el.className = 'col';
    el.dataset['verdict'] = col.verdict;
    const head = text('header', 'col-head', '');
    head.append(text('h3', '', col.label), text('span', 'mono dim', `${col.provider} \u00b7 run ${col.startedAt.slice(0, 10)}`));
    const verdict = text('div', 'col-verdict', '');
    verdict.dataset['verdict'] = col.verdict;
    verdict.append(text('span', 'state-name', col.verdict.toUpperCase()), text('span', 'state-head', col.outcomeLabel));
    const facts = text('div', 'col-facts', '');
    facts.append(text('span', '', `${col.sentences.filter(s => s.status === 'verified').length} of ${col.sentences.length} sentences verified`), text('span', '', `${col.entriesRead}${col.chartSize !== null ? ` of ${col.chartSize}` : ''} entries opened`), text('span', '', formatSeconds(col.latencyMs)), text('span', '', formatUsd(col.costUsd)));
    el.append(head, verdict, facts);
    if (col.declinedReason) el.append(text('p', 'col-reason', col.declinedReason));
    for (const r of col.reasons) el.append(text('p', 'col-reason mono', r));
    const openedH = text('h4', '', 'entries opened, in order');
    const opened = document.createElement('ol');
    opened.className = 'col-opened';
    const entries = new Map(c.chart.map(e => [e.id, e]));
    for (const l of col.lookups) { const li = text('li', 'lookup', ''); li.append(text('span', 'live-tag', l.live ? 'live CHART query' : l.tool), text('span', 'mono', ` ${l.tool}: ${l.note}`)); opened.append(li); }
    for (const id of col.opened) {
      const e = entries.get(id);
      const li = document.createElement('li');
      li.append(text('span', 'mono', id), text('span', 'dim', e ? ` ${e.date} ${e.kind}` : ''), text('span', 'line', e ? ` ${firstLine(e.text, 56)}` : ''));
      opened.append(li);
    }
    if (col.opened.length === 0 && col.lookups.length === 0) opened.append(text('li', 'dim', 'none'));
    const sentH = text('h4', '', col.sentences.length ? 'sentences, with the gate\u2019s stamps' : 'no sentences');
    const sentences = document.createElement('ol');
    sentences.className = 'col-sentences';
    for (const s of col.sentences) {
      const li = document.createElement('li');
      li.dataset['status'] = s.status;
      li.append(text('span', 'stamp', stampText(s.status)), text('span', 'text', s.text), text('span', 'cite mono', ` ${s.citation}`));
      sentences.append(li);
    }
    el.append(openedH, opened, sentH, sentences);
    return el;
  }));
  if (cols.length === 0) ui.compareGrid.append(text('p', 'dim', 'No kept live-CHART run holds this case.'));
}

async function renderBoard(): Promise<void> {
  const files = (await loadFiles(keptManifest())).map(f => f.data);
  const rows = scoreboard(files);
  const anyAgentic = rows.some(r => r.agentic);
  const anyErrors = rows.some(r => r.errors > 0);
  const anyMissed = rows.some(r => r.missed > 0);
  const anyFalsePass = rows.some(r => r.falsePass > 0);
  const head = document.createElement('tr');
  const cols = ['Model', 'Agreed with the key', 'Gate blocked a draft', ...(anyMissed ? ['Declined, key says yes'] : []), ...(anyFalsePass ? ['Gate passed, key says no'] : []), ...(anyErrors ? ['Answer failed'] : []), 'Sentences verified', 'Latency, median', 'Cost per appeal', ...(anyAgentic ? ['Entries read of chart', 'Key entries read'] : [])];
  head.append(...cols.map(c => text('th', '', c)));
  const body = rows.map(r => {
    const tr = document.createElement('tr');
    const model = text('td', 'model', r.model);
    if (r.agentic) model.append(text('span', 'agentic-tag', r.live ? 'agentic, live CHART' : 'agentic'));
    const agreed = text('td', r.agreed === r.cases ? 'strong' : '', `${r.agreed} of ${r.cases}`);
    const blocked = text('td', r.blocked > 0 ? 'red' : 'dim', String(r.blocked));
    tr.append(model, agreed, blocked);
    if (anyMissed) tr.append(text('td', r.missed > 0 ? 'red' : 'dim', String(r.missed)));
    if (anyFalsePass) tr.append(text('td', r.falsePass > 0 ? 'red' : 'dim', String(r.falsePass)));
    if (anyErrors) tr.append(text('td', r.errors > 0 ? 'red' : 'dim', String(r.errors)));
    tr.append(text('td', '', String(r.sentencesVerified)), text('td', '', formatSeconds(r.latencyP50Ms)), text('td', '', formatUsd(r.costPerCaseUsd)));
    if (anyAgentic) {
      tr.append(
        text('td', r.entriesRead === null ? 'dim' : '', r.entriesRead === null ? 'chart in prompt' : `${r.entriesRead.toFixed(1)} of ${r.chartSize?.toFixed(1)}`),
        text('td', r.supportCoverage === null ? 'dim' : '', r.supportCoverage === null ? '' : `${Math.round(r.supportCoverage * 100)}%`),
      );
    }
    return tr;
  });
  ui.boardTable.replaceChildren(head, ...body);
}

// --- boot --------------------------------------------------------------------

// --- title cards ---------------------------------------------------------------
// Plays when the page opens without a deep link, and on the i key. Any key or
// click skips. With reduced motion the three lines show at once and wait. The
// lines type one after another and stay, gathering at the top of the page
// over the case itself, rewound to the untouched chart; the reveal lights the
// three column headers left to right (styles.css).

let introTimers: number[] = [];
let introOpen = false;

function showPreamble(on: boolean): void {
  if (on) {
    // The footnote markers are set apart so they read at paragraph size.
    ui.preambleText.replaceChildren(...INTRO_LINES.join(' ').split(/([\u00b9\u00b2\u00b3])/).map(part => /^[\u00b9\u00b2\u00b3]$/.test(part) ? text('span', 'mark', part) : document.createTextNode(part)));
    ui.preambleNotes.textContent = INTRO_NOTES;
    ui.preambleData.textContent = DATA_NOTE;
    ui.preambleStamp.textContent = INTRO_STAMP;
  }
  ui.preamble.hidden = !on;
}

// The cards end by travelling: the block of lines shrinks and slides down to
// where the preamble paragraph sits at the bottom of the page, while the scrim
// lifts and the column headers light; then the paragraph takes over. Reduced
// motion, or an ended animation, goes straight to the paragraph.
function endIntro(): void {
  if (!introOpen) return;
  introOpen = false;
  for (const t of introTimers) window.clearTimeout(t);
  introTimers = [];
  ui.intro.classList.add('leaving');
  document.body.classList.remove('cards');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = (): void => { ui.intro.hidden = true; ui.intro.classList.remove('leaving'); ui.introStage.style.transform = ''; ui.preamble.style.visibility = ''; };
  showPreamble(true);
  if (reduced || typeof ui.introStage.animate !== 'function') { finish(); return; }
  ui.preamble.style.visibility = 'hidden';
  const first = ui.introStage.getBoundingClientRect();
  const last = ui.preambleText.getBoundingClientRect();
  if (first.width === 0 || first.height === 0) { finish(); return; }
  const dx = last.left - first.left;
  const dy = last.top - first.top;
  // One scale for both axes, the ratio of the two type sizes, so the glyphs
  // keep their shape and arrive at the paragraph's size; the paragraph then
  // takes over with its own line breaks.
  const line = ui.introStage.querySelector<HTMLElement>('.intro-line');
  const from = line ? parseFloat(getComputedStyle(line).fontSize) : 35;
  const to = parseFloat(getComputedStyle(ui.preambleText).fontSize) || 14;
  const scale = Math.max(0.05, to / from);
  const run = ui.introStage.animate(
    [{ transform: 'translate(0px, 0px) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.4 }],
    { duration: INTRO_MOVE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
  );
  run.addEventListener('finish', () => { run.cancel(); finish(); });
  run.addEventListener('cancel', finish);
}

function playIntro(): void {
  if (introOpen) return;
  introOpen = true;
  stop();
  seek(0);
  showPreamble(false);
  document.body.classList.add('cards');
  const lines = [...ui.intro.querySelectorAll<HTMLElement>('.intro-line')];
  lines.forEach(el => { el.textContent = ''; el.classList.remove('show', 'typing'); });
  ui.introStamp.textContent = INTRO_STAMP;
  ui.introSources.textContent = INTRO_NOTES;
  ui.intro.hidden = false;
  ui.intro.classList.remove('leaving');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    lines.forEach((el, i) => { el.textContent = INTRO_LINES[i] ?? ''; el.classList.add('show'); });
    return;
  }
  const schedule = introSchedule();
  // Every character is due at an absolute time from the start, so a chain of
  // timers cannot drift and the last character lands when the schedule says.
  const t0 = performance.now();
  schedule.forEach((slot, i) => {
    const el = lines[i];
    const text = INTRO_LINES[i] ?? '';
    if (!el) return;
    // Lay the whole line out at once, every character hidden, so revealing
    // them one by one never reflows the line.
    el.replaceChildren(...[...text].map(ch => { const sp = document.createElement('span'); sp.className = /[\u00b9\u00b2\u00b3]/.test(ch) ? 'ch mark' : 'ch'; sp.textContent = ch; return sp; }));
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    const chars = [...el.querySelectorAll<HTMLElement>('.ch')];
    introTimers.push(window.setTimeout(() => {
      // Only the newest line carries the cursor; the ones above keep their place.
      lines[i - 1]?.querySelector('.cursor')?.remove();
      el.classList.add('show', 'typing');
      el.prepend(cursor);
      let n = 0;
      const tick = (): void => {
        const c = chars[n];
        if (c) { c.classList.add('on'); c.after(cursor); }
        n += 1;
        if (n < chars.length) introTimers.push(window.setTimeout(tick, Math.max(0, t0 + slot.show + n * INTRO_CHAR_MS - performance.now())));
        else el.classList.remove('typing'); // the cursor stays, blinking, until the next line or the travel
      };
      tick();
    }, slot.show));
  });
  // The finished block holds a while longer, then it and the scrim leave
  // together on one travel, so the first replay frame is the last line's hide
  // plus the pause plus the move: the figure the budget test holds.
  const last = schedule[schedule.length - 1];
  introTimers.push(window.setTimeout(endIntro, (last ? last.hide : 0) + INTRO_END_PAUSE_MS));
}

// A deep link is `#file=<results file>&case=<case id>`, optionally with
// `&step=<n>` or `&step=end` to land on one frame, so a figure in the paper
// is an address. Applied at boot and whenever the hash changes on an open
// page (a link pasted into the same tab), so a link always lands on its case
// with the board closed. selectCase rewrites the address in place (no history
// entry, no hashchange), keeping the step a link arrived with so a reload
// lands on the same frame.
async function applyHash(): Promise<void> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const wantedFile = params.get('file');
  const wantedCase = params.get('case');
  const wantedStep = params.get('step');
  const wantedView: View = params.get('view') === 'compare' ? 'compare' : 'replay';
  if (wantedView !== view && view !== 'board') view = wantedView;
  const landOnStep = (): void => {
    const n = parseStep(wantedStep, session.steps.length);
    if (n !== null) { stop(); seek(n); }
    if (session.result) writeAddress(session.result.caseId, n !== null ? wantedStep : null);
  };
  const fileChanged = !!wantedFile && wantedFile !== ui.filePicker.value && session.manifest.results.some(m => m.file === wantedFile);
  const caseChanged = !!wantedCase && wantedCase !== session.result?.caseId;
  if (!fileChanged && !caseChanged && session.file) { landOnStep(); return; }
  if (fileChanged) ui.filePicker.value = wantedFile;
  if (wantedCase) {
    // selectFile keeps the picker's current case when the file has it; seed it.
    const o = document.createElement('option');
    o.value = wantedCase;
    ui.casePicker.replaceChildren(o);
    ui.casePicker.value = wantedCase;
  }
  if (fileChanged || !session.file) await selectFile(ui.filePicker.value);
  else if (wantedCase) selectCase(wantedCase);
  landOnStep();
  if (view === 'board') showView('replay');
  showView(wantedView);
}

async function boot(): Promise<void> {
  session.manifest = await fetchJson<Manifest>('data/index.json');
  const cases = await fetchJson<ViewerCase[]>(`data/${session.manifest.cases}`);
  session.cases = new Map(cases.map(c => [c.id, c]));
  ui.filePicker.replaceChildren(...session.manifest.results.map(m => {
    const o = document.createElement('option');
    o.value = m.file;
    const g = groupOf(m);
    const tag = g === 'payer' ? ', payer side' : g === 'repair' ? `, ${m.repair ?? 1} repair turn, post hoc` : g === 'effort' ? `, effort ${m.effort}, post hoc` : '';
    o.textContent = `${m.model}, ${m.provider}${m.agentic ? (m.live ? ', agentic, live CHART' : ', agentic') : ''}${tag}, ${m.startedAt.slice(0, 10)}`;
    return o;
  }));
  // Read before applyHash, which writes the case into the hash.
  const deepLinked = window.location.hash.length > 1;
  // Without a deep link, open on the newest kept run that used every tool.
  if (!deepLinked) {
    const newest = newestRun(keptManifest());
    if (newest) ui.filePicker.value = newest.file;
  }
  await applyHash();
  void renderBoard();
  window.addEventListener('hashchange', () => { void applyHash(); });
  ui.introSkip.addEventListener('click', endIntro);
  ui.intro.addEventListener('click', endIntro);
  ui.preambleClose.addEventListener('click', () => showPreamble(false));
  ui.about.addEventListener('click', () => showPreamble(true));
  if (!deepLinked) playIntro();

  ui.filePicker.addEventListener('change', () => { void selectFile(ui.filePicker.value); });
  ui.casePicker.addEventListener('change', () => selectCase(ui.casePicker.value));
  ui.play.addEventListener('click', play);
  ui.step.addEventListener('click', () => { stop(); seek(session.cursor + 1); });
  ui.back.addEventListener('click', () => { stop(); seek(session.cursor - 1); });
  ui.restart.addEventListener('click', () => { stop(); seek(0); });
  ui.end.addEventListener('click', () => { stop(); seek(session.steps.length); });
  ui.board.addEventListener('click', () => showView('board'));
  ui.tabReplay.addEventListener('click', () => showView('replay'));
  ui.tabCompare.addEventListener('click', () => showView('compare'));
  // Each column says in one line what it holds; the header repeats it on hover.
  for (const key of ['chart', 'criteria', 'draft'] as const) { ui.panelSub[key].textContent = PANEL_HELP[key]; ui.panelHead[key].title = PANEL_HELP[key]; }
  ui.boardData.textContent = DATA_NOTE;
  const paintTheme = () => { ui.theme.textContent = document.documentElement.dataset['theme'] === 'dark' ? 'light theme' : 'dark theme'; };
  paintTheme();
  ui.theme.addEventListener('click', () => {
    const dark = document.documentElement.dataset['theme'] !== 'dark';
    if (dark) document.documentElement.dataset['theme'] = 'dark'; else delete document.documentElement.dataset['theme'];
    try { localStorage.setItem('ypid-theme', dark ? 'dark' : 'light'); } catch { /* per-viewer convenience only */ }
    paintTheme();
  });
  ui.writClose.addEventListener('click', () => showWrit(false));
  ui.writPrint.addEventListener('click', () => window.print());
  ui.writText.addEventListener('click', saveWritText);
  ui.sentences.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest('button.edit');
    const li = button?.closest<HTMLElement>('li.sentence');
    if (button && li) openEditor(li);
  });
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // A focused button keeps Space and Enter for itself (the gate-check "check"
    // button, the transport); a held modifier is the browser's shortcut, not ours.
    if (e.target instanceof HTMLButtonElement || e.ctrlKey || e.metaKey || e.altKey) return;
    if (introOpen) { e.preventDefault(); endIntro(); return; }
    switch (e.key) {
      case 'i': case 'I': playIntro(); break;
      case ' ': e.preventDefault(); play(); break;
      case 'ArrowRight': e.preventDefault(); stop(); seek(session.cursor + 1); break;
      case 'ArrowLeft': e.preventDefault(); stop(); seek(session.cursor - 1); break;
      case 'Home': e.preventDefault(); stop(); seek(0); break;
      case 'End': e.preventDefault(); stop(); seek(session.steps.length); break;
      case 's': case 'S': showView(view === 'board' ? 'replay' : 'board'); break;
      case 'c': case 'C': showView(view === 'compare' ? 'replay' : 'compare'); break;
      case 'p': case 'P': showPreamble(ui.preamble.hidden !== false); break;
      case 'w': case 'W': showWrit(ui.writ.hidden !== false); break;
      case 'Escape': if (!ui.writ.hidden) showWrit(false); break;
    }
  });
}

boot().catch((error: unknown) => {
  ui.context.textContent = error instanceof Error ? error.message : String(error);
  ui.context.style.color = 'var(--red)';
});
