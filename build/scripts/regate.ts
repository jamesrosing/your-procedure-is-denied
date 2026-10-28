// Re-run the gate over the drafts stored in a results file. The gate is a pure
// function of the chart, the criteria, the denial, the case facts, and the
// draft (its inputHash records exactly that), so a new gate version can be
// applied to a kept run without a model call. Verdicts can only move in the
// direction the version note describes; the ledger records every re-gate.
//
//   npm run regate -- --file results/<file>.json [--file ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { litmus, LITMUS_VERSION } from '../src/litmus.js';
import { classify, gateSources, loadCases, summarize, type CaseResult, type Summary } from '../src/harness.js';

interface ResultsFile {
  run: Record<string, unknown> & { litmus?: string; regated?: { from: string; to: string; at: string; changedVerdicts: number }[] };
  summary: Summary;
  results: CaseResult[];
}

export function regate(file: ResultsFile, casesById: Map<string, ReturnType<typeof loadCases>[number]>): { file: ResultsFile; changedVerdicts: number; changedStatuses: number } {
  let changedVerdicts = 0;
  let changedStatuses = 0;
  const results = file.results.map(r => {
    if (!r.draft || !r.gate) return r;
    const c = casesById.get(r.caseId);
    if (!c) throw new Error(`case ${r.caseId} not found`);
    const gate = litmus(gateSources(c), r.draft);
    if (gate.inputHash !== r.gate.inputHash) throw new Error(`${r.caseId}: gate inputs differ from the stored run (inputHash)`);
    if (gate.verdict !== r.gate.verdict) changedVerdicts += 1;
    changedStatuses += gate.sentences.filter((s, i) => s.status !== r.gate!.sentences[i]?.status).length;
    return { ...r, outcome: classify(c.expected.warranted, gate.verdict), gate };
  });
  const from = String(file.run.litmus ?? 'unknown');
  const run = { ...file.run, litmus: LITMUS_VERSION, regated: [...(file.run.regated ?? []), { from, to: LITMUS_VERSION, at: new Date().toISOString(), changedVerdicts }] };
  return { file: { run, summary: summarize(results), results }, changedVerdicts, changedStatuses };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { file: { type: 'string', multiple: true } } });
  if (!values.file?.length) throw new Error('usage: npm run regate -- --file results/<file>.json');
  const here = dirname(fileURLToPath(import.meta.url));
  const cases = loadCases(join(here, '..', 'synthetic', 'cases'));
  const byId = new Map(cases.map(c => [c.id, c]));
  for (const path of values.file) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;
    const { file, changedVerdicts, changedStatuses } = regate(parsed, byId);
    writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
    console.log(`${path}: ${changedStatuses} sentence status(es) changed, ${changedVerdicts} verdict(s) changed; now ${LITMUS_VERSION.split(' ')[1]}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
