// The page: loads the manifest the build script writes into data/, picks a
// results file and a case, and renders `stateAt` for the current cursor.
// Everything that decides what a step means lives in replay.ts.
import {
  buildTimeline, firstLine, formatSeconds, formatUsd, INTRO_CHAR_MS, INTRO_FADE_MS, INTRO_LINES, introSchedule, playDelayMs, scoreboard, stateAt,
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
  tabReplay: $<HTMLButtonElement>('tab-replay'),
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
  introSkip: $<HTMLButtonElement>('intro-skip'),
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
  const run = session.file?.run;
  const sep = () => text('span', 'sep', '›');
  ui.ctxCrumb.replaceChildren(text('span', 'mono', c.id), sep(), text('span', '', c.patient.alias), sep(), text('span', '', `${c.patient.age} year old ${c.patient.sex}`));
  ui.ctxTitle.textContent = c.procedure.description;
  ui.ctxMeta.replaceChildren(
    text('span', 'mono', `${c.procedure.codeSystem} ${c.procedure.code}`),
    text('span', 'mono strong', `CARC ${c.denial.carc}`),
    text('span', '', `${c.payer.name}, ${c.payer.planType}`),
    text('span', '', r.category),
    text('span', '', `about $${c.stakesUsd.toLocaleString()} at stake`),
  );
  const gate = r.gate?.litmus ?? '';
  const gateVersion = /v\d+\.\d+/.exec(gate)?.[0] ?? '';
  ui.ctxStamp.replaceChildren(
    ...(run ? [text('span', '', `model ${run.model}`), text('span', '', `provider ${run.provider}`), text('span', '', `effort ${run.effort}`), text('span', '', `run ${run.startedAt.slice(0, 10)}`)] : []),
    ...(gateVersion ? [text('span', '', `gate litmus ${gateVersion}`)] : []),
    text('span', '', 'synthetic record'),
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
    li.append(text('div', 'text', s.text), text('span', 'stamp', `${s.status === 'verified' ? '✓' : s.status === 'needs-citation' ? '◐' : '⚠'} ${s.status === 'needs-citation' ? 'needs citation' : s.status}`), why);
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
  const stateRow = (name: string, head: string) => {
    const row = text('div', 'state', '');
    row.append(text('span', 'state-name', name), text('span', 'state-head', head));
    return row;
  };
  const parts: HTMLElement[] = [];
  if (v.verdict === 'pass') {
    parts.push(stateRow('PASS', `${state.counters.sentencesVerified} of ${state.counters.sentencesTotal} sentences verified against the chart; ready for the physician to read and sign`));
  } else if (v.verdict === 'blocked') {
    const bad = v.blockedSentence !== undefined ? state.sentences.find(s => s.index === v.blockedSentence) : undefined;
    parts.push(stateRow('BLOCKED', bad ? `“${bad.text}” did not verify; nothing leaves until every sentence does` : 'nothing leaves until every sentence and every criterion verifies'));
    for (const r of v.reasons) parts.push(text('div', 'reason', r));
  } else if (v.verdict === 'declined') {
    parts.push(stateRow('DECLINED', 'the model read the chart and declined to draft'), text('div', 'reason', v.declinedReason ?? ''));
  } else {
    parts.push(stateRow('FAILED', v.error ?? 'the request failed before the gate ran'));
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
  ui.board.setAttribute('aria-selected', String(on));
  ui.tabReplay.setAttribute('aria-selected', String(!on));
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
  const anyFalsePass = rows.some(r => r.falsePass > 0);
  const head = document.createElement('tr');
  const cols = ['Model', 'Agreed with the key', 'Gate blocked a draft', ...(anyFalsePass ? ['Gate passed, key says no'] : []), ...(anyErrors ? ['Answer failed'] : []), 'Sentences verified', 'Latency, median', 'Cost per appeal', ...(anyAgentic ? ['Entries read of chart', 'Key entries read'] : [])];
  head.append(...cols.map(c => text('th', '', c)));
  const body = rows.map(r => {
    const tr = document.createElement('tr');
    const model = text('td', 'model', r.model);
    if (r.agentic) model.append(text('span', 'agentic-tag', r.live ? 'agentic, live CHART' : 'agentic'));
    const agreed = text('td', r.agreed === r.cases ? 'strong' : '', `${r.agreed} of ${r.cases}`);
    const blocked = text('td', r.blocked > 0 ? 'red' : 'dim', String(r.blocked));
    tr.append(model, agreed, blocked);
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
// click skips. With reduced motion the four lines show at once and wait. The
// lines type one after another and stay, gathering at the top of the page
// over the case itself, rewound to the untouched chart; the reveal lights the
// three column headers left to right (styles.css).

let introTimers: number[] = [];
let introOpen = false;

function endIntro(): void {
  if (!introOpen) return;
  introOpen = false;
  for (const t of introTimers) window.clearTimeout(t);
  introTimers = [];
  ui.intro.classList.add('leaving');
  document.body.classList.remove('cards');
  window.setTimeout(() => { ui.intro.hidden = true; ui.intro.classList.remove('leaving'); }, INTRO_FADE_MS);
}

function playIntro(): void {
  if (introOpen) return;
  introOpen = true;
  stop();
  seek(0);
  document.body.classList.add('cards');
  const lines = [...ui.intro.querySelectorAll<HTMLElement>('.intro-line')];
  lines.forEach(el => { el.textContent = ''; el.classList.remove('show', 'typing'); });
  ui.intro.hidden = false;
  ui.intro.classList.remove('leaving');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    lines.forEach((el, i) => { el.textContent = INTRO_LINES[i] ?? ''; el.classList.add('show'); });
    return;
  }
  const schedule = introSchedule();
  schedule.forEach((slot, i) => {
    const el = lines[i];
    const text = INTRO_LINES[i] ?? '';
    if (!el) return;
    // Lay the whole line out at once, every character hidden, so revealing
    // them one by one never reflows the line.
    el.replaceChildren(...[...text].map(ch => { const sp = document.createElement('span'); sp.className = 'ch'; sp.textContent = ch; return sp; }));
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
        if (n < chars.length) introTimers.push(window.setTimeout(tick, INTRO_CHAR_MS));
        else el.classList.remove('typing'); // the cursor stays, blinking, until the next line or the fade
      };
      tick();
    }, slot.show));
  });
  // The block and the scrim leave together on one fade, so the first replay
  // frame is the last line's hide plus the fade: the figure the budget test holds.
  const last = schedule[schedule.length - 1];
  introTimers.push(window.setTimeout(endIntro, last ? last.hide : 0));
}

// A deep link is `#file=<results file>&case=<case id>`. Applied at boot and
// whenever the hash changes on an open page (a link pasted into the same tab),
// so a link always lands on its case with the board closed. selectCase writes
// the same hash back, which fires this again as a no-op.
async function applyHash(): Promise<void> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const wantedFile = params.get('file');
  const wantedCase = params.get('case');
  const fileChanged = !!wantedFile && wantedFile !== ui.filePicker.value && session.manifest.results.some(m => m.file === wantedFile);
  const caseChanged = !!wantedCase && wantedCase !== session.result?.caseId;
  if (!fileChanged && !caseChanged && session.file) return;
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
  if (!ui.boardSection.hasAttribute('hidden')) showBoard(false);
}

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
  // Read before applyHash, which writes the case into the hash.
  const deepLinked = window.location.hash.length > 1;
  // Without a deep link, open on the newest run that used every tool.
  if (!deepLinked) {
    const newest = [...session.manifest.results].reverse().find(m => m.live) ?? session.manifest.results[session.manifest.results.length - 1];
    if (newest) ui.filePicker.value = newest.file;
  }
  await applyHash();
  void renderBoard();
  window.addEventListener('hashchange', () => { void applyHash(); });
  ui.introSkip.addEventListener('click', endIntro);
  ui.intro.addEventListener('click', endIntro);
  if (!deepLinked) playIntro();

  ui.filePicker.addEventListener('change', () => { void selectFile(ui.filePicker.value); });
  ui.casePicker.addEventListener('change', () => selectCase(ui.casePicker.value));
  ui.play.addEventListener('click', play);
  ui.step.addEventListener('click', () => { stop(); seek(session.cursor + 1); });
  ui.back.addEventListener('click', () => { stop(); seek(session.cursor - 1); });
  ui.restart.addEventListener('click', () => { stop(); seek(0); });
  ui.end.addEventListener('click', () => { stop(); seek(session.steps.length); });
  ui.board.addEventListener('click', () => showBoard(true));
  ui.tabReplay.addEventListener('click', () => showBoard(false));
  const paintTheme = () => { ui.theme.textContent = document.documentElement.dataset['theme'] === 'dark' ? 'light theme' : 'dark theme'; };
  paintTheme();
  ui.theme.addEventListener('click', () => {
    const dark = document.documentElement.dataset['theme'] !== 'dark';
    if (dark) document.documentElement.dataset['theme'] = 'dark'; else delete document.documentElement.dataset['theme'];
    try { localStorage.setItem('ypid-theme', dark ? 'dark' : 'light'); } catch { /* per-viewer convenience only */ }
    paintTheme();
  });
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    if (introOpen) { e.preventDefault(); endIntro(); return; }
    switch (e.key) {
      case 'i': case 'I': playIntro(); break;
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
