// BUILD-LOG.md: one traceable log of the event build, generated from the
// sources of truth rather than written by hand: the git history since the
// `hackathon-start` tag, the ledger rows in NEW-WORK.md (matched by hash), the
// gate version at every commit that touched it, and the kept results files'
// own run headers (model, mode, gate version at the run, re-gates, advisor).
// Regenerate with `npm run log`; the file is committed so a reader can follow
// the build without a checkout.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatInterval, ruleOfThree } from '../src/stats.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
// Every commit date is rendered in one zone, the author's (Pacific), whatever
// zone the committer wrote in: the bot commits from the Action are UTC.
const TZ = 'America/Los_Angeles';
const git = (args: string): string => execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, TZ } }).trim();

// The Action that regenerates this log commits as github-actions[bot]; those
// commits touch only the generated files and carry no ledger row.
const BOT_AUTHOR = 'github-actions[bot]';

export interface Commit { hash: string; author: string; bot: boolean; date: string; subject: string; tags: string[]; results: { added: string[]; removed: string[] }; litmus?: string }

function commits(range: string): Commit[] {
  const lines = git(`log --reverse --format=%h%x09%an%x09%ad%x09%s%x09%D --date=format-local:%Y-%m-%d\\ %H:%M ${range}`).split('\n').filter(Boolean);
  return lines.map(line => {
    const [hash = '', author = '', date = '', subject = '', refs = ''] = line.split('\t');
    const tags = refs.split(',').map(s => s.trim()).filter(s => s.startsWith('tag: ')).map(s => s.slice(5));
    const status = git(`show --name-status --format= ${hash}`).split('\n').filter(Boolean);
    const results = { added: [] as string[], removed: [] as string[] };
    for (const s of status) {
      const [code = '', path = ''] = s.split('\t');
      if (!path.startsWith('build/results/')) continue;
      if (code.startsWith('A')) results.added.push(path.slice('build/results/'.length));
      if (code.startsWith('D')) results.removed.push(path.slice('build/results/'.length));
    }
    return { hash, author, bot: author === BOT_AUTHOR, date, subject, tags, results };
  });
}

// The ledger's last row is 'pending' until the next commit fills its hash. The
// row belongs to the newest authored commit that has none of its own; a bot
// commit at HEAD is skipped, since it never carries a row.
export function resolvePending(event: Commit[], rows: Map<string, { date: string; text: string }>): Map<string, { date: string; text: string }> {
  const out = new Map(rows);
  const pending = out.get('pending');
  if (!pending) return out;
  const target = [...event].reverse().find(c => !c.bot);
  if (target && !out.has(target.hash)) { out.set(target.hash, pending); out.delete('pending'); }
  return out;
}

// A fabricated quote is one the gate refuted because it is not in the entry it
// cites, whether it sits in a sentence or in an evidence item; the same quote
// cited the same way in both counts once. Refutations for an unsourced token
// or a too-short quote are not fabrications.
type Quoted = { status: string; reason: string; quote: string; citation: string };
export function fabricatedQuotes(file: { results?: { caseId: string; gate?: { sentences?: Quoted[]; evidence?: Quoted[] } }[] }): number {
  const seen = new Set<string>();
  for (const r of file.results ?? []) {
    for (const q of [...(r.gate?.sentences ?? []), ...(r.gate?.evidence ?? [])]) {
      if (q.status === 'refuted' && q.reason.startsWith('quote-not-in-entry')) seen.add(`${r.caseId}\u0000${q.citation}\u0000${q.quote.trim().toLowerCase()}`);
    }
  }
  return seen.size;
}

function litmusAt(hash: string): string | undefined {
  try {
    const src = git(`show ${hash}:build/src/litmus.ts`);
    const m = /LITMUS_VERSION = '([^']+)'/.exec(src);
    return m?.[1];
  } catch {
    return undefined;
  }
}

function ledgerRows(): Map<string, { date: string; text: string }> {
  const text = readFileSync(join(root, 'NEW-WORK.md'), 'utf8');
  const rows = new Map<string, { date: string; text: string }>();
  for (const line of text.split('\n')) {
    const m = /^\| (\d{4}-\d{2}-\d{2}) \| ([0-9a-f]{7}|pending) \| (.*) \|$/.exec(line);
    if (m) rows.set(m[2]!, { date: m[1]!, text: m[3]! });
  }
  return rows;
}

export interface RunFile {
  file: string;
  run: { startedAt: string; provider: string; model: string; effort: string; cases: number; agentic?: boolean; repair?: number; tools?: string[]; litmus?: string; regated?: { from: string; to: string; at: string; changedVerdicts: number }[]; concurrency?: number };
  summary: { outcomes: Record<string, number>; bySubtype?: Record<string, Record<string, number>>; sentencesVerified: number; ungroundedSentencesCaught?: number; citationPrecision?: number; reading?: { entriesReadPerCase: number; chartSizePerCase: number; supportCoverage: number; turnsPerCase: number }; costUsd: { perCase: number; total?: number }; latencyMs: { p50: number }; tokens?: { perCase?: { input: number; output: number; thinking: number } }; stakesUsd?: { total: number; defended: number; warranted: number }; advice?: { model: string; cases: number; criteria: number; supports: number; partial: number; silent: number; falsePassesFlagged: number; falsePasses: number } };
  results?: { caseId: string; outcome?: string; firstOutcome?: string; error?: string; expected?: { warranted: boolean }; draft?: { warranted: boolean; sentences?: unknown[] }; gate?: { verdict?: string; reasons?: string[]; sentences?: Quoted[]; evidence?: Quoted[] }; repairs?: { turn: number; costUsd: number; latencyMs: number; error?: string }[] }[];
}

// --- the post hoc tables (Oct 31) ----------------------------------------------

// Table 5, the repair turn (results/repair/): per run, what one repair turn did
// to the blocked drafts, from the per-case records (firstOutcome, outcome, the
// final verdict). Repaired to pass counts every blocked draft that ended in
// pass, false passes included; false passes created is the subset on cases the
// key labels unsupported, the repair eroding the decline.
export interface RepairRow { model: string; provider: string; blockedBefore: number; blockedAfter: number; repairedToPass: number; repairedToDecline: number; stillBlocked: number; falsePassesCreated: number; failed: number; agreedBefore: number; agreedAfter: number; costPerCase: number; costPerCaseFirstTurn: number }
export function repairRow(r: RunFile): RepairRow {
  const results = r.results ?? [];
  const first = (o: string): number => results.filter(x => x.firstOutcome === o).length;
  const offered = results.filter(x => (x.repairs?.length ?? 0) > 0);
  const verdict = (x: NonNullable<RunFile['results']>[number]): string | undefined => x.gate?.verdict;
  const repairCost = offered.reduce((n, x) => n + x.repairs!.reduce((m, y) => m + y.costUsd, 0), 0);
  const total = r.summary.costUsd.total ?? r.summary.costUsd.perCase * r.run.cases;
  const o = r.summary.outcomes;
  return {
    model: r.run.model, provider: r.run.provider,
    blockedBefore: first('blocked'),
    blockedAfter: o['blocked'] ?? 0,
    repairedToPass: offered.filter(x => verdict(x) === 'pass').length,
    repairedToDecline: offered.filter(x => verdict(x) === 'declined').length,
    stillBlocked: offered.filter(x => verdict(x) === 'blocked').length,
    falsePassesCreated: offered.filter(x => x.firstOutcome === 'blocked' && x.outcome === 'false-pass').length,
    failed: offered.filter(x => x.repairs!.some(y => y.error)).length,
    agreedBefore: first('correct-pass') + first('correct-decline'),
    agreedAfter: (o['correct-pass'] ?? 0) + (o['correct-decline'] ?? 0),
    costPerCase: r.summary.costUsd.perCase,
    costPerCaseFirstTurn: (total - repairCost) / r.run.cases,
  };
}

// Table 6, the effort sweep (results/effort/, with the kept low run of each
// model as its first row): outcomes, empty warranted answers (a draft that set
// warranted with no sentences, the fail-closed case), thinking tokens per
// case, median latency, cost per case.
export interface EffortRow { model: string; provider: string; effort: string; agreed: number; blocked: number; emptyWarranted: number; falsePass: number; missed: number; failed: number; thinkingPerCase: number; latencyP50Ms: number; costPerCase: number }
export function effortRow(r: RunFile): EffortRow {
  const o = r.summary.outcomes;
  const results = r.results ?? [];
  const empty = results.filter(x => x.gate?.verdict === 'blocked' && (x.gate.reasons ?? []).some(reason => reason.startsWith('no cited sentences'))).length;
  return {
    model: r.run.model, provider: r.run.provider, effort: r.run.effort,
    agreed: (o['correct-pass'] ?? 0) + (o['correct-decline'] ?? 0),
    blocked: o['blocked'] ?? 0,
    emptyWarranted: empty,
    falsePass: o['false-pass'] ?? 0,
    missed: o['missed'] ?? 0,
    failed: o['error'] ?? 0,
    thinkingPerCase: r.summary.tokens?.perCase?.thinking ?? 0,
    latencyP50Ms: r.summary.latencyMs.p50,
    costPerCase: r.summary.costUsd.perCase,
  };
}

// Table 7, document intake (results/intake/): each synthetic denial rendered as
// a one-page letter image and read back by the model into eight fields; one
// row per field with the count read correctly and every error, named.
export interface IntakeFile { run: { model: string; cases: number; startedAt?: string; provider?: string; costUsd?: number; latencyMs?: { p50: number } }; summary?: { costUsd?: { total: number; perCase: number }; latencyMs?: { p50: number } }; results: { caseId: string; error?: string; fields?: Record<string, { expected: unknown; got: unknown; correct: boolean }> }[] }
export interface IntakeRow { field: string; correct: number; total: number; errors: string[] }
export function intakeRows(file: IntakeFile): IntakeRow[] {
  const fields: string[] = [];
  for (const r of file.results) for (const f of Object.keys(r.fields ?? {})) if (!fields.includes(f)) fields.push(f);
  const show = (v: unknown): string => (v === null || v === undefined || v === '' ? 'nothing' : typeof v === 'string' ? v : JSON.stringify(v));
  return fields.map(field => {
    const rows = file.results.filter(r => r.fields?.[field]);
    const errors = rows.filter(r => !r.fields![field]!.correct).map(r => `${r.caseId}: read ${show(r.fields![field]!.got)} for ${show(r.fields![field]!.expected)}`);
    const failed = file.results.filter(r => !r.fields).map(r => `${r.caseId}: ${r.error ?? 'no answer'}`);
    return { field, correct: rows.filter(r => r.fields![field]!.correct).length, total: file.results.length, errors: [...errors, ...failed] };
  });
}

function runs(sub = ''): RunFile[] {
  const dir = join(root, 'build', 'results', sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ file: f, ...(JSON.parse(readFileSync(join(dir, f), 'utf8')) as Omit<RunFile, 'file'>) }))
    .sort((a, b) => a.run.startedAt.localeCompare(b.run.startedAt));
}

const short = (v: string | undefined): string => (v ? (/v\d+(?:\.\d+)?/.exec(v)?.[0] ?? v) : 'unknown');
const mode = (r: RunFile['run']): string => (r.tools?.includes('policy_status') ? 'agentic, live CHART' : r.agentic ? 'agentic' : 'chart in prompt');

function main(): void {
  const pre = commits('hackathon-start');
  const event = commits('hackathon-start..HEAD');
  const rows = resolvePending(event, ledgerRows());
  const kept = runs();
  const out: string[] = [];
  out.push('# Build log');
  out.push('');
  out.push(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`build/scripts/build-log.ts\` (\`npm run log\`) from the git history, the ledger in [NEW-WORK.md](NEW-WORK.md), the gate source at each commit, and the run headers inside \`build/results/\`. Nothing here is typed by hand; regenerate it after every commit that should appear.`);
  out.push('');
  out.push('## Before the event');
  out.push('');
  out.push(`${pre.length} commits from ${pre[0]?.date ?? '?'} to ${pre[pre.length - 1]?.date ?? '?'}, ending at the tag \`hackathon-start\` (${pre[pre.length - 1]?.hash ?? '?'}): the landing page, figures, and the written case. No model code, no synthetic set, no gate. Everything below is event work.`);
  out.push('');
  out.push('## Runs kept in `build/results/`');
  out.push('');
  out.push('Every file carries its own header: model, mode, gate version at the run, any later re-gate (the gate is a pure function of its inputs, so a re-gate changes labels, never inputs), and the advisor pass if one was run. Superseded or discarded runs are not in the directory; they are listed in the next section from the ledger.');
  out.push('');
  out.push('| Started (UTC) | Model | Mode | Agreed | Blocked | Missed | False pass | Failed | Fabricated quotes | Gate at run | Re-gated to | Advisor |');
  out.push('| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |');
  for (const r of kept) {
    const o = r.summary.outcomes;
    const agreed = (o['correct-pass'] ?? 0) + (o['correct-decline'] ?? 0);
    const gateAtRun = r.run.regated?.[0]?.from ?? r.run.litmus;
    const regatedTo = r.run.regated?.length ? r.run.regated[r.run.regated.length - 1]!.to : undefined;
    const adv = r.summary.advice;
    out.push(`| ${r.run.startedAt.slice(0, 16).replace('T', ' ')} | ${r.run.model} (${r.run.provider}) | ${mode(r.run)} | ${agreed} of ${r.run.cases} | ${o['blocked'] ?? 0} | ${o['missed'] ?? 0} | ${o['false-pass'] ?? 0} | ${o['error'] ?? 0} | ${fabricatedQuotes(r)} | ${short(gateAtRun)} | ${regatedTo ? short(regatedTo) : ''} | ${adv ? `${adv.model}: ${adv.cases} cases, ${adv.supports} supports, ${adv.partial} partial, ${adv.silent} silent${adv.falsePasses ? `, flagged ${adv.falsePassesFlagged} of ${adv.falsePasses} false passes` : ''}` : ''} |`);
  }
  out.push('');
  out.push('## Runs superseded or discarded');
  out.push('');
  out.push('From the ledger rows that say so. A run is superseded when a gate defect it exposed was fixed and the run repeated; discarded when the transport failed before the model answered.');
  out.push('');
  for (const [hash, row] of rows) {
    if (/superseded|discarded/i.test(row.text)) out.push(`- ${row.date} ${hash}: ${row.text}`);
  }
  out.push('');
  out.push('## Gate versions');
  out.push('');
  out.push('Each commit that changed the version string in `build/src/litmus.ts`. The gate is deterministic; its version is stamped into every verdict.');
  out.push('');
  let last: string | undefined;
  for (const c of event) {
    const v = litmusAt(c.hash);
    if (v && v !== last) { out.push(`- ${c.date} ${c.hash}: ${v}`); last = v; }
  }
  out.push('');
  out.push('## Commits since `hackathon-start`');
  out.push('');
  out.push(`Oldest first. Each entry: hash, Pacific time, subject, tags, results files added or removed, and the ledger row written with the commit. The ${event.filter(c => c.bot).length} commits by ${BOT_AUTHOR} are this log regenerating itself after a push; they touch only the generated files and carry no ledger row.`);
  out.push('');
  for (const c of event) {
    const row = rows.get(c.hash);
    const tags = c.tags.length ? ` · tag ${c.tags.join(', ')}` : '';
    out.push(`### ${c.hash} · ${c.date} · ${c.subject}${tags}`);
    out.push('');
    if (c.results.added.length) out.push(`Results added: ${c.results.added.map(f => `\`${f}\``).join(', ')}.`);
    if (c.results.removed.length) out.push(`Results removed: ${c.results.removed.map(f => `\`${f}\``).join(', ')}.`);
    out.push(row ? row.text : c.bot ? '(generated files only; no ledger row by design)' : '(no ledger row)');
    out.push('');
  }
  const pending = rows.get('pending');
  if (pending) {
    out.push('### next commit · the one that carries this regeneration');
    out.push('');
    out.push(pending.text);
    out.push('');
  }
  writeFileSync(join(root, 'BUILD-LOG.md'), out.join('\n'));

  // The Results section of the README is generated between its own markers:
  // the kept runs with Wilson intervals, the repeat runs as ranges, and the
  // gate's sensitivity by corruption class from the mutation report.
  const readmePath0 = join(root, 'README.md');
  const readme0 = readFileSync(readmePath0, 'utf8');
  const rs = '<!-- results:start -->';
  const re = '<!-- results:end -->';
  if (readme0.includes(rs) && readme0.includes(re)) {
    const agreedOf = (r: RunFile): number => (r.summary.outcomes['correct-pass'] ?? 0) + (r.summary.outcomes['correct-decline'] ?? 0);
    const modelName = (r: RunFile): string => (r.run.model.startsWith('meta-models/muse-spark-open') ? 'Muse Spark Open' : r.run.model);
    const host = (r: RunFile): string => (r.run.provider === 'baseten' ? 'open weights on Baseten' : 'Meta Model API');
    const b: string[] = [rs];
    b.push(`_Tables generated from the result files by \`npm run log\`; the prose below them is written by hand. Last regenerated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC._`);
    b.push('');
    const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
    const warrantedStake = kept[0]?.summary.stakesUsd?.warranted ?? 0;
    const totalStake = kept[0]?.summary.stakesUsd?.total ?? 0;
    b.push(`**Table 1. Kept runs.** ${kept.length} runs, 50 cases each, effort low. Agreed is correct-pass plus correct-decline against the grading key, with a 95% Wilson interval. Blocked is a draft the gate stopped. Missed is a decline on a case the key labels warranted. False pass is a draft the gate passed on a case the key labels unsupported. The five outcome columns sum to 50. Fabricated quotes counts quotes the gate refuted as not in the entry cited, in a sentence or in an evidence item, on any draft including declined ones. Care defended is the billed value of the warranted cases whose appeal passed the gate, out of the ${usd(warrantedStake)} billed across the thirty warranted cases (${usd(totalStake)} across all fifty); the values are the synthetic set's, not a payer's. Entries read applies to the agentic modes.`);
    b.push('');
    b.push('| Model | Mode | Agreed | 95% interval | Blocked | Missed | False pass | Failed | Fabricated quotes | Care defended | Sentences verified | Citation precision | Entries read per case | Median latency | Cost per case |');
    b.push('| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
    for (const r of kept) {
      const o = r.summary.outcomes;
      const rd = r.summary.reading;
      const st = r.summary.stakesUsd;
      b.push(`| ${modelName(r)} (${host(r)}) | ${mode(r.run)} | ${agreedOf(r)} of ${r.run.cases} | ${formatInterval(agreedOf(r), r.run.cases)} | ${o['blocked'] ?? 0} | ${o['missed'] ?? 0} | ${o['false-pass'] ?? 0} | ${o['error'] ?? 0} | ${fabricatedQuotes(r)} | ${st ? usd(st.defended) : ''} | ${r.summary.sentencesVerified} | ${r.summary.citationPrecision !== undefined ? `${Math.round(r.summary.citationPrecision * 100)}%` : ''} | ${rd ? `${rd.entriesReadPerCase.toFixed(1)} of ${rd.chartSizePerCase.toFixed(1)}` : 'all' } | ${(r.summary.latencyMs.p50 / 1000).toFixed(1)} s | $${r.summary.costUsd.perCase.toFixed(3)} |`);
    }
    b.push('');
    // Blocked is two things: a true derivation stopped on a warranted case (a
    // lost appeal) and a baseless warranted answer stopped on an unsupported
    // case (the design working). The taxonomy keeps one column; this line
    // splits it from the per-case records.
    const blockedOn = (warranted: boolean): number => kept.reduce((n, r) => n + (r.results ?? []).filter(c => c.outcome === 'blocked' && c.expected?.warranted === warranted).length, 0);
    const fullRuns = kept.filter(r => r.summary.stakesUsd && r.summary.stakesUsd.defended === r.summary.stakesUsd.warranted);
    const runCosts = fullRuns.map(r => r.summary.costUsd.perCase * r.run.cases);
    const fullNote = fullRuns.length ? ` The full ${usd(warrantedStake)} was defended in ${fullRuns.length} of ${kept.length} runs (${fullRuns.map(r => `${modelName(r)}, ${mode(r.run)}`).join('; ')}), at $${Math.min(...runCosts).toFixed(2)} to $${Math.max(...runCosts).toFixed(2)} for the fifty cases of a run.` : '';
    b.push(`Of the ${blockedOn(true) + blockedOn(false)} blocked drafts in the kept runs, ${blockedOn(true)} were on cases the key labels warranted (a true derivation the gate could not source; an appeal not sent) and ${blockedOn(false)} on cases it labels unsupported (a warranted answer with nothing to verify, stopped).${fullNote}`);
    b.push('');
    const repeats = runs('repeats');
    if (repeats.length) {
      const groups = new Map<string, RunFile[]>();
      for (const r of [...kept.filter(r => mode(r.run) === 'agentic, live CHART'), ...repeats]) {
        const key = `${modelName(r)} (${host(r)}), ${mode(r.run)}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      b.push(`**Table 2. Repeat runs.** Each live-CHART configuration run again with the same 50 cases and settings (\`build/results/repeats/\`, ${repeats.length} files). Ranges include the kept run. Fabricated quotes are counted as in Table 1, over sentences and evidence items.`);
      b.push('');
      b.push('| Configuration | Runs | Agreed, range | Blocked, range | Missed, total | False passes, total | Failed, total | Fabricated quotes |');
      b.push('| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
      for (const [key, g] of groups) {
        const agreed = g.map(agreedOf);
        const blocked = g.map(r => r.summary.outcomes['blocked'] ?? 0);
        const total = (k: string): number => g.reduce((n, r) => n + (r.summary.outcomes[k] ?? 0), 0);
        const fabricated = g.reduce((n, r) => n + fabricatedQuotes(r), 0);
        const range = (xs: number[], of = ''): string => (Math.min(...xs) === Math.max(...xs) ? `${xs[0]}${of} in all` : `${Math.min(...xs)} to ${Math.max(...xs)}${of}`);
        b.push(`| ${key} | ${g.length} | ${range(agreed, ' of 50')} | ${range(blocked)} | ${total('missed')} | ${total('false-pass')} | ${total('error')} | ${fabricated} |`);
      }
      b.push('');
    }
    try {
      const rep = JSON.parse(readFileSync(join(root, 'build', 'results', 'mutations', 'report.json'), 'utf8')) as { gate: string; summary: { byClass: Record<string, { attempted: number; caught: number; passed: number }>; byKind: Record<string, { attempted: number; caught: number; passed: number }> } };
      const cls = rep.summary.byClass;
      const kinds = rep.summary.byKind;
      const kindLabel: Record<string, string> = {
        'number-absent': 'number replaced by a value absent from every admissible source',
        'citation-moved': 'citation moved to an entry that lacks the quote',
        'quote-word-dropped': 'a word dropped from the quote',
        'date-shift': 'date shifted',
        'laterality-swap': 'side swapped, other side absent from the cited entry',
        'number-collision': 'number replaced by a value that appears in the criteria, the denial, or the case facts',
        'laterality-collision': 'side swapped, other side present somewhere in the cited entry',
        'negation-flip': 'negation flipped',
        'pronoun-swap': 'pronoun swapped',
      };
      const kindClass: Record<string, string> = { 'number-absent': 'hard', 'citation-moved': 'hard', 'quote-word-dropped': 'hard', 'date-shift': 'hard', 'laterality-swap': 'hard', 'number-collision': 'collision', 'laterality-collision': 'collision', 'negation-flip': 'soft', 'pronoun-swap': 'soft' };
      const total = Object.values(cls).reduce((n, c) => n + c.attempted, 0);
      b.push(`**Table 3. Gate sensitivity by corruption class** (\`build/scripts/mutate.ts\`, gate ${short(rep.gate)}). ${total.toLocaleString()} fabrications injected one at a time into the sentences the kept runs verified; caught means the gate returned refuted or needs-citation. Where zero were missed, the 95% upper bound on the miss rate is by the rule of three.`);
      b.push('');
      b.push('| Class | Corruption | Injected | Caught | Sensitivity | Miss rate, 95% upper bound |');
      b.push('| --- | --- | :---: | :---: | :---: | :---: |');
      for (const c of ['hard', 'collision', 'soft']) {
        for (const [k, v] of Object.entries(kinds)) {
          if (kindClass[k] !== c) continue;
          const sens = `${Math.round((v.caught / v.attempted) * 100)}%`;
          const bound = v.passed === 0 ? `${(ruleOfThree(v.attempted) * 100).toFixed(2)}%` : '';
          b.push(`| ${c} | ${kindLabel[k] ?? k} | ${v.attempted.toLocaleString()} | ${v.caught.toLocaleString()} | ${sens} | ${bound} |`);
        }
        const t = cls[c];
        if (t) b.push(`| **${c}, all** | | **${t.attempted.toLocaleString()}** | **${t.caught.toLocaleString()}** | **${Math.round((t.caught / t.attempted) * 100)}%** | ${t.passed === 0 ? `**${(ruleOfThree(t.attempted) * 100).toFixed(2)}%**` : ''} |`);
      }
      b.push('');
    } catch { /* no mutation report yet */ }

    // Table 4, post hoc: the same gate pointed at the plan's determination.
    // Files under results/payer/ are written by `harness --side payer`; the
    // key is inverted there (warranted means the denial stands), so
    // correct-decline is a supporting record the model declined to deny and
    // correct-pass a failing record with a verified determination.
    let payer: RunFile[] = [];
    try { payer = runs('payer'); } catch { /* no payer-side runs */ }
    if (payer.length) {
      const supporting = (r: RunFile): number => Object.values(r.summary.bySubtype?.['warranted'] ?? {}).reduce((a, b) => a + b, 0);
      const failing = (r: RunFile): number => r.run.cases - supporting(r);
      b.push(`**Table 4. The other chair (post hoc).** The same models asked for the plan's written claim determination over the same ${payer[0]!.run.cases} charts, under the same contract and gate (\`build/results/payer/\`, ${payer.length} files, chart in prompt, effort low). The key is inverted: a denial is warranted exactly where the record fails a criterion. These runs are kept apart from Tables 1 and 2 and from the viewer's scoreboard.`);
      b.push('');
      b.push('| Model | Declined to deny a record that supports the service | Verified determination where the record fails a criterion | Determination written against a supporting record | Blocked | Failed | Fabricated quotes | Sentences verified | Median latency | Cost per case |');
      b.push('| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
      for (const r of payer) {
        const o = r.summary.outcomes;
        b.push(`| ${modelName(r)} (${host(r)}) | ${o['correct-decline'] ?? 0} of ${supporting(r)} | ${o['correct-pass'] ?? 0} of ${failing(r)} | ${o['false-pass'] ?? 0} | ${o['blocked'] ?? 0} | ${o['error'] ?? 0} | ${fabricatedQuotes(r)} | ${r.summary.sentencesVerified} | ${(r.summary.latencyMs.p50 / 1000).toFixed(1)} s | $${r.summary.costUsd.perCase.toFixed(3)} |`);
      }
      b.push('');
    }
    // Table 5, post hoc: one repair turn on the live-CHART configuration.
    const repair = runs('repair');
    if (repair.length) {
      b.push(`**Table 5. The repair turn (post hoc).** The three live-CHART configurations run again with \`--repair 1\` (\`build/results/repair/\`, ${repair.length} files, agentic, live CHART, effort low): when the gate blocked a warranted draft, its record went back to the model verbatim, one line per finding (sentence index, status, reason, and the entries a needs-citation names), the model kept its tools and its reads, and the complete revised draft was re-gated. A declined draft was never offered a repair. Repaired to pass counts every blocked draft that ended in PASS; false passes created is the subset on cases the key labels unsupported, the repair eroding the decline. Agreed, first turn is the no-repair figure from the same file. These runs are kept apart from Tables 1 and 2 and from the viewer's scoreboard.`);
      b.push('');
      b.push('| Model | Blocked before | Blocked after | Repaired to pass | Repaired to decline | Still blocked | False passes created | Agreed, first turn | Agreed, after repair | Cost per case, first turn | Cost per case with repair |');
      b.push('| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
      for (const r of repair) {
        const x = repairRow(r);
        b.push(`| ${modelName(r)} (${host(r)}) | ${x.blockedBefore} | ${x.blockedAfter} | ${x.repairedToPass} | ${x.repairedToDecline} | ${x.stillBlocked} | ${x.falsePassesCreated} | ${x.agreedBefore} of ${r.run.cases} | ${x.agreedAfter} of ${r.run.cases} | $${x.costPerCaseFirstTurn.toFixed(3)} | $${x.costPerCase.toFixed(3)} |`);
      }
      b.push('');
    }

    // Table 6, post hoc: the effort sweep, with the kept low run of each model first.
    const effort = runs('effort');
    if (effort.length) {
      const effortRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
      const models = [...new Set(effort.map(modelName))];
      const rowsOut: RunFile[] = [];
      for (const m of models) {
        const low = kept.filter(r => modelName(r) === m && mode(r.run) === 'agentic, live CHART').sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt))[0];
        if (low) rowsOut.push(low);
        rowsOut.push(...effort.filter(r => modelName(r) === m).sort((a, b) => (effortRank[a.run.effort] ?? 9) - (effortRank[b.run.effort] ?? 9)));
      }
      b.push(`**Table 6. The effort sweep (post hoc).** muse-spark-1.3 and Muse Spark Open in the live-CHART configuration at effort medium and high (\`build/results/effort/\`, ${effort.length} files, same 50 cases, same settings otherwise), with each model's kept effort-low run from Table 1 as its first row. Empty warranted answers are drafts that set warranted to true with no sentences, which the gate blocks. Thinking tokens are the API's \`thinking_tokens\` count per case; Muse Spark Open on Baseten reports none. These runs are kept apart from Tables 1 and 2 and from the viewer's scoreboard.`);
      b.push('');
      b.push('| Model | Effort | Agreed | Blocked | Empty warranted answers | False pass | Missed | Failed | Thinking tokens per case | Median latency | Cost per case |');
      b.push('| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
      for (const r of rowsOut) {
        const x = effortRow(r);
        const keptNote = kept.includes(r) ? ' (kept run, Table 1)' : '';
        b.push(`| ${modelName(r)} (${host(r)}) | ${x.effort}${keptNote} | ${x.agreed} of ${r.run.cases} | ${x.blocked} | ${x.emptyWarranted} | ${x.falsePass} | ${x.missed} | ${x.failed} | ${x.thinkingPerCase > 0 ? x.thinkingPerCase.toLocaleString('en-US') : 'not reported'} | ${(x.latencyP50Ms / 1000).toFixed(1)} s | $${x.costPerCase.toFixed(3)} |`);
      }
      b.push('');
    }

    // Table 7, post hoc: document intake of the letter images.
    try {
      const intakeDir = join(root, 'build', 'results', 'intake');
      const intakeFiles = existsSync(intakeDir) ? readdirSync(intakeDir).filter(f => f.endsWith('.json')).sort() : [];
      const intakeName = intakeFiles[intakeFiles.length - 1];
      if (intakeName) {
        const intake = JSON.parse(readFileSync(join(intakeDir, intakeName), 'utf8')) as IntakeFile;
        const rowsI = intakeRows(intake);
        const perCase = intake.summary?.costUsd?.perCase;
        const p50 = intake.summary?.latencyMs?.p50;
        b.push(`**Table 7. Document intake (post hoc).** Each of the 50 synthetic denials rendered as a one-page remittance letter image (\`build/synthetic/letters/\`, 1275 by 1650 px, deterministic from the case file) and sent to ${intake.run.model} as an image with a JSON schema for eight fields (\`build/src/intake.ts\`, \`build/results/intake/\`); each field read is scored against the case file. This is document intake of an administrative letter and nothing clinical: the fields are the claim's code, dates, amount, reason codes, and payer. ${perCase !== undefined ? `Cost $${perCase.toFixed(4)} per letter` : ''}${p50 !== undefined ? `, median latency ${(p50 / 1000).toFixed(1)} s` : ''}.`);
        b.push('');
        b.push('| Field | Correct of 50 | Errors read |');
        b.push('| --- | :---: | --- |');
        for (const row of rowsI) b.push(`| ${row.field} | ${row.correct} of ${row.total} | ${row.errors.length ? row.errors.join('; ') : 'none'} |`);
        b.push('');
      }
    } catch { /* no intake run yet */ }

    b.push(re);
    const next0 = readme0.slice(0, readme0.indexOf(rs)) + b.join('\n') + readme0.slice(readme0.indexOf(re) + re.length);
    if (next0 !== readme0) writeFileSync(readmePath0, next0);
  }

  // The README carries a short, self-updating section between two markers:
  // the count of commits, the kept runs, and the last five commits with their
  // ledger rows. A GitHub Action reruns this after every push to main.
  const readmePath = join(root, 'README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const start = '<!-- build-log:start -->';
  const end = '<!-- build-log:end -->';
  if (readme.includes(start) && readme.includes(end)) {
    const lastEvent = event[event.length - 1];
    const gateNow = litmusAt('HEAD');
    const block: string[] = [];
    block.push(start);
    block.push(`_Generated from the git history, the ledger, and the result files by \`npm run log\`; a GitHub Action regenerates it after every push. Last regenerated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. The full log is [BUILD-LOG.md](BUILD-LOG.md)._`);
    block.push('');
    block.push(`${event.length} commits since the \`hackathon-start\` tag, the last at ${lastEvent?.date ?? '?'} (${lastEvent?.hash ?? '?'}). Gate ${short(gateNow)}. ${kept.length} runs kept, every one re-gated under the current gate; superseded runs are named in the ledger and the log, never silently replaced.`);
    block.push('');
    block.push('| Started (UTC) | Model | Mode | Agreed | Blocked | Missed | False pass | Advisor |');
    block.push('| --- | --- | --- | :---: | :---: | :---: | :---: | --- |');
    for (const r of kept) {
      const o = r.summary.outcomes;
      const agreed = (o['correct-pass'] ?? 0) + (o['correct-decline'] ?? 0);
      const adv = r.summary.advice;
      block.push(`| ${r.run.startedAt.slice(0, 16).replace('T', ' ')} | ${r.run.model} | ${mode(r.run)} | ${agreed} of ${r.run.cases} | ${o['blocked'] ?? 0} | ${o['missed'] ?? 0} | ${o['false-pass'] ?? 0} | ${adv ? `${adv.model}, ${adv.partial} of ${adv.criteria} criteria partial` : ''} |`);
    }
    block.push('');
    block.push('Last five authored commits, newest first, with the ledger row each one carried (the bot\'s regenerate commits are left out):');
    block.push('');
    for (const c of event.filter(c => !c.bot).slice(-5).reverse()) {
      const row = rows.get(c.hash);
      const text = row ? row.text : '(no ledger row)';
      block.push(`- **${c.hash} · ${c.date}** · ${c.subject}${c.tags.length ? ` · tag ${c.tags.join(', ')}` : ''}. ${text.length > 360 ? text.slice(0, 357).replace(/\s+\S*$/, '') + '…' : text}`);
    }
    block.push(end);
    const next = readme.slice(0, readme.indexOf(start)) + block.join('\n') + readme.slice(readme.indexOf(end) + end.length);
    if (next !== readme) writeFileSync(readmePath, next);
  }
  console.log(`BUILD-LOG.md: ${event.length} event commits, ${kept.length} kept runs, ${rows.size} ledger rows`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
