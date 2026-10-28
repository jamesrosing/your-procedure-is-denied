// The advisor: a second, visible opinion beside each criterion. For every case
// in a results file whose draft reached the gate with evidence, ask a model
// whether the quoted evidence, read literally, satisfies each criterion:
// supports, partial, or silent, with one sentence why. The answer is stored
// under `advice` with the model's name and never touches the gate or the
// outcome. The gate answers whether a statement is in the record; the advisor
// answers whether the record satisfies the criterion, which is interpretation,
// so it is shown to the physician as an opinion with a name on it.
//
//   npm run advise -- --file results/<file>.json --provider meta --model muse-wonder-1.0 [--effort low] [--concurrency 4]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAdvice, ADVICE_SCHEMA, type Advice } from '../src/schema.js';
import type { Provider, Effort } from '../src/provider.js';
import { loadCases, mapWithConcurrency, selectProvider, type CaseResult, type Summary } from '../src/harness.js';
import type { SyntheticCase } from '../src/synthetic/types.js';

export interface CaseAdvice {
  provider: string;
  model: string;
  effort: Effort;
  latencyMs: number;
  costUsd: number;
  items: Advice['items'];
  error?: string;
}

export interface AdviceSummary {
  provider: string;
  model: string;
  cases: number; // cases the advisor was asked about
  criteria: number;
  supports: number;
  partial: number;
  silent: number;
  gateVerifiedAdvisorDoubts: number; // criteria the gate marked verified that the advisor called partial or silent
  falsePassesFlagged: number; // false-pass cases where the advisor doubted at least one criterion
  falsePasses: number;
  costUsd: number;
}

export const ADVISOR_INSTRUCTIONS = `You are reviewing an appeal draft beside a physician. For each payer criterion you are given the exact quotes from the patient's chart that a drafting model cited as evidence for it.

Judge, for each criterion, whether the quotes read literally satisfy it:
- supports: the quotes establish every element of the criterion.
- partial: the quotes address some elements and not others. Name the missing element.
- silent: the quotes do not address the criterion.

Use only the quotes. Do not assume anything the quotes do not say. Do not add facts. Answer with one item per criterion, in the order given, each with one sentence of reasoning.`;

export function buildAdvicePrompt(c: SyntheticCase, r: CaseResult): string {
  const gate = r.gate!;
  const lines: string[] = [];
  lines.push(`Denial: ${c.denial.text}`);
  lines.push('');
  for (const k of c.criteria) {
    lines.push(`${k.id}: ${k.text}`);
    const quotes = gate.evidence.filter(e => e.criterion === k.id && e.status === 'verified');
    if (quotes.length === 0) lines.push('  quotes: none cited');
    for (const q of quotes) lines.push(`  quote from ${q.citation}: "${q.quote}"`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function adviseCase(provider: Provider, c: SyntheticCase, r: CaseResult, effort: Effort): Promise<CaseAdvice> {
  if (!provider.ask) throw new Error(`${provider.label} cannot answer a structured question`);
  const base = { provider: provider.label, model: provider.model, effort };
  try {
    const a = await provider.ask({ system: [{ text: ADVISOR_INSTRUCTIONS, cache: true }], user: buildAdvicePrompt(c, r), schema: ADVICE_SCHEMA, effort, maxTokens: 2048 });
    const parsed = parseAdvice(a.rawText);
    if (!parsed.ok) return { ...base, model: a.model, latencyMs: a.latencyMs, costUsd: a.costUsd, items: [], error: parsed.error };
    const known = new Set(c.criteria.map(k => k.id));
    return { ...base, model: a.model, latencyMs: a.latencyMs, costUsd: a.costUsd, items: parsed.advice.items.filter(i => known.has(i.criterion)) };
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    const kind = error instanceof Error ? error.constructor.name : 'Error';
    return { ...base, latencyMs: 0, costUsd: 0, items: [], error: `request failed: ${kind}${status ? ` (HTTP ${status})` : ''}` };
  }
}

export function summarizeAdvice(results: (CaseResult & { advice?: CaseAdvice })[], provider: string, model: string): AdviceSummary {
  const advised = results.filter(r => r.advice && r.gate);
  let criteria = 0, supports = 0, partial = 0, silent = 0, doubts = 0, flagged = 0, cost = 0;
  for (const r of advised) {
    cost += r.advice!.costUsd;
    let doubted = false;
    for (const item of r.advice!.items) {
      criteria += 1;
      if (item.verdict === 'supports') supports += 1;
      else if (item.verdict === 'partial') partial += 1;
      else silent += 1;
      if (item.verdict !== 'supports' && r.gate!.criteria[item.criterion] === 'verified') { doubts += 1; doubted = true; }
    }
    if (doubted && r.outcome === 'false-pass') flagged += 1;
  }
  return {
    provider, model, cases: advised.length, criteria, supports, partial, silent,
    gateVerifiedAdvisorDoubts: doubts, falsePassesFlagged: flagged, falsePasses: results.filter(r => r.outcome === 'false-pass').length,
    costUsd: cost,
  };
}

interface ResultsFile {
  run: Record<string, unknown>;
  summary: Summary & { advice?: AdviceSummary };
  results: (CaseResult & { advice?: CaseAdvice })[];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', multiple: true },
      provider: { type: 'string', default: 'meta' },
      model: { type: 'string', default: 'muse-wonder-1.0' },
      effort: { type: 'string', default: 'low' },
      concurrency: { type: 'string', default: '4' },
    },
  });
  if (!values.file?.length) throw new Error('usage: npm run advise -- --file results/<file>.json --provider meta --model muse-wonder-1.0');
  const effort = values.effort as Effort;
  const provider = selectProvider(values.provider!, values.model);
  const here = dirname(fileURLToPath(import.meta.url));
  const byId = new Map(loadCases(join(here, '..', 'synthetic', 'cases')).map(c => [c.id, c]));
  for (const path of values.file) {
    const file = JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;
    const targets = file.results.filter(r => r.gate && r.draft && r.draft.warranted && r.gate.evidence.length > 0);
    const started = Date.now();
    const advised = await mapWithConcurrency(targets, Number(values.concurrency), async r => ({ caseId: r.caseId, advice: await adviseCase(provider, byId.get(r.caseId)!, r, effort) }));
    const byCase = new Map(advised.map(a => [a.caseId, a.advice]));
    file.results = file.results.map(r => (byCase.has(r.caseId) ? { ...r, advice: byCase.get(r.caseId)! } : r));
    file.summary = { ...file.summary, advice: summarizeAdvice(file.results, provider.label, provider.model) };
    writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
    const s = file.summary.advice!;
    const errors = advised.filter(a => a.advice.error).length;
    console.log(`${path}: advised ${s.cases} case(s) in ${((Date.now() - started) / 1000).toFixed(0)} s, ${errors} error(s); ${s.criteria} criteria: ${s.supports} supports, ${s.partial} partial, ${s.silent} silent; advisor doubted ${s.gateVerifiedAdvisorDoubts} gate-verified criteria; false passes flagged ${s.falsePassesFlagged} of ${s.falsePasses}; $${s.costUsd.toFixed(3)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
