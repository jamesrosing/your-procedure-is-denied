// The page: loads the manifest the build script writes into data/, picks a
// results file and a case, and renders `stateAt` for the current cursor.
// Everything that decides what a step means lives in replay.ts.
import {
  buildTimeline, firstLine, formatSeconds, formatUsd, playDelayMs, scoreboard, stateAt,
  type ReplayState, type ResultsFile, type Step, type ViewerCase, type ViewerResult,
} from './replay.js';

interface Manifest {
  results: { file: string; provider: string; model: string; effort: string; startedAt: string; cases: number; agentic: boolean; live?: boolean }[];
  cases: string;
}

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
  boardTable: $<HTMLTableElement>('board-table'),
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
  ui.context.replaceChildren(
    text('span', 'who', `${c.id}, ${c.patient.alias}, ${c.patient.age} year old ${c.patient.sex}`),
    (() => {
      const el = document.createElement('span');
      el.className = 'what';
      el.append(text('b', '', `${c.procedure.codeSystem} ${c.procedure.code}`), ` ${c.procedure.description}. ${c.payer.name}, ${c.payer.planType}.`);
      return el;
    })(),
    text('span', 'carc', `CARC ${c.denial.carc}`),
    text('span', 'stakes', `${r.category}, about $${c.stakesUsd.toLocaleString()} at stake`),
  );
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
    const label: string = s?.kind === 'read' ? `${s.tool}${s.live ? ', live' : ''}` : state.read.includes(id) ? 'cited' : '';
    if (tag.textContent !== label) tag.textContent = label;
    tag.classList.toggle('live', s?.kind === 'read' && s.live === true);
  }
  const open = state.open ? ui.entries.querySelector<HTMLElement>(`[data-id="${state.open}"]`) : null;
  open?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  ui.chartMeta.textContent = `${state.counters.chartSize} entries, ${state.read.length} read`;
}

function renderCriteria(state: ReplayState): void {
  ui.criteria.replaceChildren(...state.criteria.map(k => {
    const li = document.createElement('li');
    li.className = 'criterion';
    li.dataset['status'] = k.status;
    const box = text('span', 'box', k.status === 'verified' ? '✓' : k.status === 'unverified' ? '–' : '');
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
      li.append(text('div', 'none', 'No evidence found in the chart for this criterion.'));
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

function renderSentences(state: ReplayState): void {
  const named = state.verdict?.kind === 'verdict' ? state.verdict.blockedSentence : undefined;
  const existing = ui.sentences.children.length;
  // Append only the new sentences so earlier ones keep still and the new one animates in.
  if (existing > state.sentences.length) ui.sentences.replaceChildren();
  for (const s of state.sentences.slice(ui.sentences.children.length)) {
    const li = document.createElement('li');
    li.className = 'sentence';
    li.dataset['status'] = s.status;
    li.dataset['index'] = String(s.index);
    const why = document.createElement('div');
    why.className = s.status === 'verified' ? 'why' : 'why bad';
    if (s.status === 'verified') {
      why.append(text('b', '', 'verified '), text('span', 'src', `${s.citation}: `), (() => { const q = document.createElement('q'); q.textContent = s.quote; return q; })());
    } else {
      why.append(text('b', '', `${s.status} `), text('span', '', `${s.reason} (cited ${s.citation})`));
    }
    li.append(text('div', 'text', s.text), text('span', 'stamp', s.status), why);
    ui.sentences.append(li);
  }
  for (const li of ui.sentences.children) (li as HTMLElement).classList.toggle('named', named !== undefined && (li as HTMLElement).dataset['index'] === String(named));
  ui.sentences.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  ui.draftEmpty.hidden = state.sentences.length > 0 || state.verdict !== null;
  ui.draftMeta.textContent = state.counters.sentencesTotal > 0 ? `${state.counters.sentencesVerified} of ${state.counters.sentencesTotal} sentences verified` : '';
}

function renderVerdict(state: ReplayState): void {
  const v = state.verdict;
  ui.stage.dataset['verdict'] = v ? v.verdict : '';
  if (!v) { ui.verdict.hidden = true; ui.verdict.replaceChildren(); return; }
  ui.verdict.hidden = false;
  ui.verdict.dataset['verdict'] = v.verdict;
  const parts: HTMLElement[] = [];
  if (v.verdict === 'pass') {
    parts.push(text('div', '', ''));
    parts[0]!.append(text('b', '', 'Passed the gate. '), `${state.counters.sentencesVerified} of ${state.counters.sentencesTotal} sentences verified against the chart. Ready for the physician to read and sign.`);
  } else if (v.verdict === 'blocked') {
    const head = text('div', '', '');
    const bad = v.blockedSentence !== undefined ? state.sentences.find(s => s.index === v.blockedSentence) : undefined;
    head.append(text('b', '', 'Blocked. '), bad ? `“${bad.text}” did not verify. Nothing leaves until every sentence does.` : 'Nothing leaves until every sentence and every criterion verifies.');
    parts.push(head);
    for (const r of v.reasons) parts.push(text('div', 'reason', r));
  } else if (v.verdict === 'declined') {
    const head = text('div', '', '');
    head.append(text('b', '', 'No appeal. '), 'The model read the chart and declined to draft.');
    parts.push(head, text('div', 'reason', v.declinedReason ?? ''));
  } else {
    const head = text('div', '', '');
    head.append(text('b', '', 'Error. '), v.error ?? 'The request failed before the gate ran.');
    parts.push(head);
  }
  ui.verdict.replaceChildren(...parts);
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
  renderCounters(state);
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
  return { 'correct-pass': 'passed', 'correct-decline': 'declined', blocked: 'blocked', missed: 'missed', 'false-pass': 'false pass', error: 'error' }[o] ?? o;
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

function selectCase(caseId: string): void {
  stop();
  const file = session.file;
  if (!file) return;
  const result = file.results.find(r => r.caseId === caseId) ?? null;
  const caseData = session.cases.get(caseId) ?? null;
  session.result = result;
  session.caseData = caseData;
  session.steps = result && caseData ? buildTimeline(result, caseData) : [];
  session.cursor = 0;
  window.location.hash = `#file=${encodeURIComponent(ui.filePicker.value)}&case=${caseId}`;
  render();
}

function showBoard(on: boolean): void {
  ui.board.setAttribute('aria-pressed', String(on));
  ui.boardSection.hidden = !on;
  ui.stage.hidden = on;
  if (on) { stop(); render(); }
}

async function renderBoard(): Promise<void> {
  const files = await Promise.all(session.manifest.results.map(async m => {
    let f = session.files.get(m.file);
    if (!f) { f = await fetchJson<ResultsFile>(`data/results/${m.file}`); session.files.set(m.file, f); }
    return f;
  }));
  const rows = scoreboard(files);
  const anyAgentic = rows.some(r => r.agentic);
  const anyErrors = rows.some(r => r.errors > 0);
  const head = document.createElement('tr');
  const cols = ['Model', 'Agreed with the key', 'Gate blocked a draft', ...(anyErrors ? ['Answer failed'] : []), 'Sentences verified', 'Latency, median', 'Cost per appeal', ...(anyAgentic ? ['Entries read of chart', 'Key entries read'] : [])];
  head.append(...cols.map(c => text('th', '', c)));
  const body = rows.map(r => {
    const tr = document.createElement('tr');
    const model = text('td', 'model', r.model);
    if (r.agentic) model.append(text('span', 'agentic-tag', r.live ? 'agentic, live CHART' : 'agentic'));
    const agreed = text('td', r.agreed === r.cases ? 'strong' : '', `${r.agreed} of ${r.cases}`);
    const blocked = text('td', r.blocked > 0 ? 'red' : 'dim', String(r.blocked));
    tr.append(model, agreed, blocked);
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

async function boot(): Promise<void> {
  session.manifest = await fetchJson<Manifest>('data/index.json');
  const cases = await fetchJson<ViewerCase[]>(`data/${session.manifest.cases}`);
  session.cases = new Map(cases.map(c => [c.id, c]));
  ui.filePicker.replaceChildren(...session.manifest.results.map(m => {
    const o = document.createElement('option');
    o.value = m.file;
    o.textContent = `${m.model}, ${m.provider}${m.agentic ? (m.live ? ', agentic, live CHART' : ', agentic') : ''}, ${m.startedAt.slice(0, 10)}`;
    return o;
  }));
  const params = new URLSearchParams(window.location.hash.slice(1));
  const wantedFile = params.get('file');
  if (wantedFile && session.manifest.results.some(m => m.file === wantedFile)) ui.filePicker.value = wantedFile;
  const wantedCase = params.get('case');
  if (wantedCase) {
    const o = document.createElement('option');
    o.value = wantedCase;
    ui.casePicker.replaceChildren(o);
    ui.casePicker.value = wantedCase;
  }
  await selectFile(ui.filePicker.value);
  void renderBoard();

  ui.filePicker.addEventListener('change', () => { void selectFile(ui.filePicker.value); });
  ui.casePicker.addEventListener('change', () => selectCase(ui.casePicker.value));
  ui.play.addEventListener('click', play);
  ui.step.addEventListener('click', () => { stop(); seek(session.cursor + 1); });
  ui.back.addEventListener('click', () => { stop(); seek(session.cursor - 1); });
  ui.restart.addEventListener('click', () => { stop(); seek(0); });
  ui.end.addEventListener('click', () => { stop(); seek(session.steps.length); });
  ui.board.addEventListener('click', () => showBoard(ui.boardSection.hasAttribute('hidden')));
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case ' ': e.preventDefault(); play(); break;
      case 'ArrowRight': e.preventDefault(); stop(); seek(session.cursor + 1); break;
      case 'ArrowLeft': e.preventDefault(); stop(); seek(session.cursor - 1); break;
      case 'Home': e.preventDefault(); stop(); seek(0); break;
      case 'End': e.preventDefault(); stop(); seek(session.steps.length); break;
      case 's': case 'S': showBoard(ui.boardSection.hasAttribute('hidden')); break;
    }
  });
}

boot().catch((error: unknown) => {
  ui.context.textContent = error instanceof Error ? error.message : String(error);
  ui.context.style.color = 'var(--red)';
});
