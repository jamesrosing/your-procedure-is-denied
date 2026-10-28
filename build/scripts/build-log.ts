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
  summary: { outcomes: Record<string, number>; sentencesVerified: number; costUsd: { perCase: number }; latencyMs: { p50: number }; advice?: { model: string; cases: number; criteria: number; supports: number; partial: number; silent: number; falsePassesFlagged: number; falsePasses: number } };
}

function runs(): RunFile[] {
  const dir = join(root, 'build', 'results');
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
