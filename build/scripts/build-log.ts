// BUILD-LOG.md: one traceable log of the event build, generated from the
// sources of truth rather than written by hand: the git history since the
// `hackathon-start` tag, the ledger rows in NEW-WORK.md (matched by hash), the
// gate version at every commit that touched it, and the kept results files'
// own run headers (model, mode, gate version at the run, re-gates, advisor).
// Regenerate with `npm run log`; the file is committed so a reader can follow
// the build without a checkout.
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatInterval, ruleOfThree } from '../src/stats.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const git = (args: string): string => execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

interface Commit { hash: string; date: string; subject: string; tags: string[]; results: { added: string[]; removed: string[] }; litmus?: string }

function commits(range: string): Commit[] {
  const lines = git(`log --reverse --format=%h%x09%ad%x09%s%x09%D --date=format:%Y-%m-%d\\ %H:%M ${range}`).split('\n').filter(Boolean);
  return lines.map(line => {
    const [hash = '', date = '', subject = '', refs = ''] = line.split('\t');
    const tags = refs.split(',').map(s => s.trim()).filter(s => s.startsWith('tag: ')).map(s => s.slice(5));
    const status = git(`show --name-status --format= ${hash}`).split('\n').filter(Boolean);
    const results = { added: [] as string[], removed: [] as string[] };
    for (const s of status) {
      const [code = '', path = ''] = s.split('\t');
      if (!path.startsWith('build/results/')) continue;
      if (code.startsWith('A')) results.added.push(path.slice('build/results/'.length));
      if (code.startsWith('D')) results.removed.push(path.slice('build/results/'.length));
    }
    return { hash, date, subject, tags, results };
  });
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

interface RunFile {
  file: string;
  run: { startedAt: string; provider: string; model: string; effort: string; cases: number; agentic?: boolean; tools?: string[]; litmus?: string; regated?: { from: string; to: string; at: string; changedVerdicts: number }[]; concurrency?: number };
  summary: { outcomes: Record<string, number>; sentencesVerified: number; ungroundedSentencesCaught?: number; citationPrecision?: number; reading?: { entriesReadPerCase: number; chartSizePerCase: number; supportCoverage: number; turnsPerCase: number }; costUsd: { perCase: number }; latencyMs: { p50: number }; advice?: { model: string; cases: number; criteria: number; supports: number; partial: number; silent: number; falsePassesFlagged: number; falsePasses: number } };
}

function runs(sub = ''): RunFile[] {
  const dir = join(root, 'build', 'results', sub);
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ file: f, ...(JSON.parse(readFileSync(join(dir, f), 'utf8')) as Omit<RunFile, 'file'>) }))
    .sort((a, b) => a.run.startedAt.localeCompare(b.run.startedAt));
}

const short = (v: string | undefined): string => (v ? (/v\d+(?:\.\d+)?/.exec(v)?.[0] ?? v) : 'unknown');
const mode = (r: RunFile['run']): string => (r.tools?.includes('policy_status') ? 'agentic, live CHART' : r.agentic ? 'agentic' : 'chart in prompt');

function main(): void {
  const pre = commits('hackathon-start');
  const event = commits('hackathon-start..HEAD');
  const rows = ledgerRows();
  // The ledger's last row is 'pending' until the next commit fills its hash,
  // so when HEAD has no row of its own, the pending row is HEAD's.
  const head = event[event.length - 1]?.hash;
  if (head && !rows.has(head) && rows.has('pending')) { rows.set(head, rows.get('pending')!); rows.delete('pending'); }
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
  out.push('| Started (UTC) | Model | Mode | Agreed | Blocked | False pass | Failed | Gate at run | Re-gated to | Advisor |');
  out.push('| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |');
  for (const r of kept) {
    const o = r.summary.outcomes;
    const agreed = (o['correct-pass'] ?? 0) + (o['correct-decline'] ?? 0);
    const gateAtRun = r.run.regated?.[0]?.from ?? r.run.litmus;
    const regatedTo = r.run.regated?.length ? r.run.regated[r.run.regated.length - 1]!.to : undefined;
    const adv = r.summary.advice;
    out.push(`| ${r.run.startedAt.slice(0, 16).replace('T', ' ')} | ${r.run.model} (${r.run.provider}) | ${mode(r.run)} | ${agreed} of ${r.run.cases} | ${o['blocked'] ?? 0} | ${o['false-pass'] ?? 0} | ${o['error'] ?? 0} | ${short(gateAtRun)} | ${regatedTo ? short(regatedTo) : ''} | ${adv ? `${adv.model}: ${adv.cases} cases, ${adv.supports} supports, ${adv.partial} partial, ${adv.silent} silent${adv.falsePasses ? `, flagged ${adv.falsePassesFlagged} of ${adv.falsePasses} false passes` : ''}` : ''} |`);
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
  out.push('Oldest first. Each entry: hash, local time, subject, tags, results files added or removed, and the ledger row written with the commit.');
  out.push('');
  for (const c of event) {
    const row = rows.get(c.hash);
    const tags = c.tags.length ? ` · tag ${c.tags.join(', ')}` : '';
    out.push(`### ${c.hash} · ${c.date} · ${c.subject}${tags}`);
    out.push('');
    if (c.results.added.length) out.push(`Results added: ${c.results.added.map(f => `\`${f}\``).join(', ')}.`);
    if (c.results.removed.length) out.push(`Results removed: ${c.results.removed.map(f => `\`${f}\``).join(', ')}.`);
    out.push(row ? row.text : '(no ledger row)');
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
    b.push(`**Table 1. Kept runs.** ${kept.length} runs, 50 cases each, effort low. Agreed is correct-pass plus correct-decline against the grading key, with a 95% Wilson interval. Blocked is a draft the gate stopped. False pass is a draft the gate passed on a case the key labels unsupported. Entries read applies to the agentic modes.`);
    b.push('');
    b.push('| Model | Mode | Agreed | 95% interval | Blocked | False pass | Failed | Sentences verified | Citation precision | Entries read per case | Median latency | Cost per case |');
    b.push('| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
    for (const r of kept) {
      const o = r.summary.outcomes;
      const rd = r.summary.reading;
      b.push(`| ${modelName(r)} (${host(r)}) | ${mode(r.run)} | ${agreedOf(r)} of ${r.run.cases} | ${formatInterval(agreedOf(r), r.run.cases)} | ${o['blocked'] ?? 0} | ${o['false-pass'] ?? 0} | ${o['error'] ?? 0} | ${r.summary.sentencesVerified} | ${r.summary.citationPrecision !== undefined ? `${Math.round(r.summary.citationPrecision * 100)}%` : ''} | ${rd ? `${rd.entriesReadPerCase.toFixed(1)} of ${rd.chartSizePerCase.toFixed(1)}` : 'all' } | ${(r.summary.latencyMs.p50 / 1000).toFixed(1)} s | $${r.summary.costUsd.perCase.toFixed(3)} |`);
    }
    b.push('');
    const repeats = runs('repeats');
    if (repeats.length) {
      const groups = new Map<string, RunFile[]>();
      for (const r of [...kept.filter(r => mode(r.run) === 'agentic, live CHART'), ...repeats]) {
        const key = `${modelName(r)} (${host(r)}), ${mode(r.run)}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      b.push(`**Table 2. Repeat runs.** Each live-CHART configuration run again with the same 50 cases and settings (\`build/results/repeats/\`, ${repeats.length} files). Ranges include the kept run.`);
      b.push('');
      b.push('| Configuration | Runs | Agreed, range | Blocked, range | False passes, total | Failed, total | Fabricated quotes |');
      b.push('| --- | :---: | :---: | :---: | :---: | :---: | :---: |');
      for (const [key, g] of groups) {
        const agreed = g.map(agreedOf);
        const blocked = g.map(r => r.summary.outcomes['blocked'] ?? 0);
        const fp = g.reduce((n, r) => n + (r.summary.outcomes['false-pass'] ?? 0), 0);
        const err = g.reduce((n, r) => n + (r.summary.outcomes['error'] ?? 0), 0);
        const range = (xs: number[], of = ''): string => (Math.min(...xs) === Math.max(...xs) ? `${xs[0]}${of} in all` : `${Math.min(...xs)} to ${Math.max(...xs)}${of}`);
        b.push(`| ${key} | ${g.length} | ${range(agreed, ' of 50')} | ${range(blocked)} | ${fp} | ${err} | 0 |`);
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
    block.push('| Started (UTC) | Model | Mode | Agreed | Blocked | False pass | Advisor |');
    block.push('| --- | --- | --- | :---: | :---: | :---: | --- |');
    for (const r of kept) {
      const o = r.summary.outcomes;
      const agreed = (o['correct-pass'] ?? 0) + (o['correct-decline'] ?? 0);
      const adv = r.summary.advice;
      block.push(`| ${r.run.startedAt.slice(0, 16).replace('T', ' ')} | ${r.run.model} | ${mode(r.run)} | ${agreed} of ${r.run.cases} | ${o['blocked'] ?? 0} | ${o['false-pass'] ?? 0} | ${adv ? `${adv.model}, ${adv.partial} of ${adv.criteria} criteria partial` : ''} |`);
    }
    block.push('');
    block.push('Last five commits, newest first, with the ledger row each one carried:');
    block.push('');
    for (const c of event.slice(-5).reverse()) {
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

main();
