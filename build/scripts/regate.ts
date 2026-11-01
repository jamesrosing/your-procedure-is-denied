// Re-run the gate over the drafts stored in a results file. The gate is a pure
// function of the chart, the criteria, the denial, the case facts, and the
// draft (its inputHash records exactly that), so a new gate version can be
// applied to a kept run without a model call. Verdicts can only move in the
// direction the version note describes; the ledger records every re-gate.
//
//   npm run regate -- --file results/<file>.json [--file ...]
//
// Two shapes beside the appeal run (Oct 31): a dictated run was gated against
// the dictated copy of its case under synthetic/dictated/, which casesFor()
// loads when the run header says so; an intake run has no drafts, gates, or
// keys at all and passes through untouched. A regate that changes nothing at
// the current version writes nothing and records nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { litmus, LITMUS_VERSION } from '../src/litmus.js';
import { classify, gateSources, loadCases, summarize, type CaseResult, type Summary } from '../src/harness.js';

type Run = Record<string, unknown> & { litmus?: string; dictated?: { entryId: string }; regated?: { from: string; to: string; at: string; changedVerdicts: number }[] };
interface ResultsFile {
  run: Run;
  summary: Summary & { advice?: unknown }; // advice: the advisor's summary, written by scripts/advise.ts, never by the gate
  results: CaseResult[];
}

// The cases a result file was gated against. A dictated run (src/dictation.ts)
// writes the case it built, the transcript standing in for one entry, to
// synthetic/dictated/<caseId>.json; those copies replace the originals here, so
// the gate sees the same inputs the run saw and the inputHash agrees.
export function casesFor(run: Run, syntheticDir: string): Map<string, ReturnType<typeof loadCases>[number]> {
  const byId = new Map(loadCases(join(syntheticDir, 'cases')).map(c => [c.id, c]));
  const dictatedDir = join(syntheticDir, 'dictated');
  if (run.dictated && existsSync(dictatedDir)) for (const c of loadCases(dictatedDir)) byId.set(c.id, c);
  return byId;
}

type Gated = CaseResult & { draft: NonNullable<CaseResult['draft']>; gate: NonNullable<CaseResult['gate']> };
const gated = (r: CaseResult): r is Gated => Boolean(r.draft && r.gate && r.expected);

export function regate(file: ResultsFile, casesById: Map<string, ReturnType<typeof loadCases>[number]>): { file: ResultsFile; changedVerdicts: number; changedStatuses: number; unchanged: boolean } {
  // Nothing in the file went through the gate (an intake run): nothing to regate.
  if (!file.results.some(gated)) return { file, changedVerdicts: 0, changedStatuses: 0, unchanged: true };
  let changedVerdicts = 0;
  let changedStatuses = 0;
  const results = file.results.map(r => {
    if (!gated(r)) return r;
    const c = casesById.get(r.caseId);
    if (!c) throw new Error(`case ${r.caseId} not found`);
    const gate = litmus(gateSources(c), r.draft);
    if (gate.inputHash !== r.gate.inputHash) throw new Error(`${r.caseId}: gate inputs differ from the stored run (inputHash)`);
    if (gate.verdict !== r.gate.verdict) changedVerdicts += 1;
    changedStatuses += gate.sentences.filter((s, i) => s.status !== r.gate.sentences[i]?.status).length;
    // The key the run was scored against is the one stored on the result: for
    // a payer-side run it is the inverse of the case's physician key.
    return { ...r, outcome: classify(r.expected.warranted, gate.verdict), gate };
  });
  const from = String(file.run.litmus ?? 'unknown');
  // Same version in, no label or verdict moved: the file is already what this
  // regate would write. Leave it, and leave run.regated[] alone.
  if (from === LITMUS_VERSION && changedVerdicts === 0 && changedStatuses === 0) return { file, changedVerdicts, changedStatuses, unchanged: true };
  const run = { ...file.run, litmus: LITMUS_VERSION, regated: [...(file.run.regated ?? []), { from, to: LITMUS_VERSION, at: new Date().toISOString(), changedVerdicts }] };
  // summarize() knows nothing of the advisor; keep its summary when the file has one.
  const summary = { ...summarize(results), ...(file.summary.advice !== undefined ? { advice: file.summary.advice } : {}) };
  return { file: { run, summary, results }, changedVerdicts, changedStatuses, unchanged: false };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { file: { type: 'string', multiple: true } } });
  if (!values.file?.length) throw new Error('usage: npm run regate -- --file results/<file>.json');
  const here = dirname(fileURLToPath(import.meta.url));
  const syntheticDir = join(here, '..', 'synthetic');
  for (const path of values.file) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;
    const { file, changedVerdicts, changedStatuses, unchanged } = regate(parsed, casesFor(parsed.run, syntheticDir));
    if (unchanged) { console.log(`${path}: unchanged${parsed.run.litmus ? ` at ${String(parsed.run.litmus).split(' ')[1]}` : ' (nothing in the file went through the gate)'}; not rewritten`); continue; }
    writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
    console.log(`${path}: ${changedStatuses} sentence status(es) changed, ${changedVerdicts} verdict(s) changed; now ${LITMUS_VERSION.split(' ')[1]}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
