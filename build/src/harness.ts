// The evaluation harness: runs synthetic denial cases through a proposer and
// the LITMUS gate, scores each against the case's grading key, and writes one
// results file per run. Concurrency is capped so a 429 or a schema bug cannot
// cost a whole run. Effort is low on every call unless overridden.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { messagesProvider, openAiProvider, type Effort, type Provider, type ProposeRequest } from './provider.js';
import type { Usage } from './cost.js';
import type { Appeal } from './schema.js';
import { litmus, LITMUS_VERSION, type GateResult, type GateSources } from './litmus.js';
import type { SyntheticCase } from './synthetic/types.js';

// The shared block is identical for every case and every model, and long
// enough to clear the prompt cache minimum (the Oct 26 probe cached a 1,704
// token prefix; a 500 token block was never written to cache). The CARC
// reference and the worked example are the same for every run.
export const INSTRUCTIONS = `You draft administrative appeals of health insurance claim denials for a physician to review and sign. This is payer-policy adjudication and administrative drafting, not clinical advice: the physician makes every medical judgment and owns the letter.

You will receive a chart of dated entries, each headed by an id like note-012, then a denial and the payer's coverage criteria, numbered crit-1, crit-2, and so on.

Rules.
1. Decide warranted. Set warranted to true only if, for every criterion, some chart entry's text supports it. Set it to false, with a one-sentence reason, if any criterion lacks support, if a criterion states a categorical exclusion that the chart confirms applies, or if the denial is administrative rather than a medical-necessity question. When warranted is false, sentences must be empty, but still list the evidence you did find.
2. Evidence. For each criterion the chart supports, give one or more items of {criterion, citation, quote}. The citation is the entry id. The quote is text copied exactly from that entry, at least two words, with no words changed, added, or dropped. Quote the span that carries the fact, including its numbers. A criterion about a duration or a threshold needs a quote that contains the number.
3. Sentences. When warranted is true, write the appeal as 6 to 12 sentences in your own words. Each sentence cites exactly one entry and carries a verbatim quote from that entry that backs it. Every number, date, measurement, or code in a sentence must appear in its quote, in the payer's criteria, or in the denial. State nothing the chart does not say. Do not invent policy language or cite documents you were not given. Do not restate the denial or the criteria as if they were chart facts.
4. Output only the JSON object described by the schema.

What a verifier does with your output. A deterministic gate, not a model, checks every quote against the cited entry character for character (ignoring case, spacing, and quote marks), checks that every number in a sentence has a source, and blocks the whole appeal if any sentence fails or any criterion has no verified evidence. A paraphrase inside a quote fails. A quote attached to the wrong entry fails. A number you remembered from another entry fails. There is no partial credit, so quote carefully and cite the entry the words came from.

Claim adjustment reason codes you may see, and what they mean for the decision.
CARC 50: not deemed a medical necessity by the payer. A medical-necessity question: appeal if the chart meets the criteria.
CARC 56: deemed experimental or investigational. A medical-necessity question when the payer's criteria list conditions for coverage; if the criteria say the service is never covered, the chart cannot answer it.
CARC 96: non-covered charge. Often a cosmetic or exclusion determination; appeal if the chart meets criteria that make the service covered, not if the plan excludes it outright.
CARC 11: the diagnosis is inconsistent with the procedure. Appeal if the chart documents the diagnosis that supports the procedure.
CARC 167: the diagnosis is not covered. Appeal if the chart documents a covered diagnosis that fits the criteria.
CARC 151: the information submitted does not support this many or this frequency of services. Appeal if the chart supports the frequency billed.
CARC 197: precertification or authorization absent. If the denial invites a retrospective medical-necessity review, appeal on the chart; if the plan refuses retrospective review, the chart cannot answer it.
CARC 4: the procedure code is inconsistent with the modifier. A coding correction, not a medical-necessity appeal.
CARC 29: the time limit for filing has expired. A filing question, not a medical-necessity appeal.
CARC 119: the benefit maximum has been reached. A benefits question under the plan document, not a medical-necessity appeal.

A worked example of the form, with invented content. Chart entry note-004 reads: "Finished 12 weeks of PT across the street, says it helped while she was there and then right back to baseline." Criterion crit-2 reads: "At least 3 months of conservative treatment without adequate relief." Good evidence: {criterion: "crit-2", citation: "note-004", quote: "Finished 12 weeks of PT across the street, says it helped while she was there and then right back to baseline"}. Good sentence: {text: "The record documents twelve weeks of physical therapy without lasting relief, which exceeds the 3 months the policy requires.", citation: "note-004", quote: "Finished 12 weeks of PT across the street, says it helped while she was there and then right back to baseline"}. The sentence may translate PT into physical therapy and 12 weeks into twelve weeks; the quote may not. The 3 months comes from the criterion, so it is sourced. A sentence claiming 16 weeks would be blocked.`;

export function renderChart(c: SyntheticCase): string {
  return c.chart.map(e => `[${e.id}] ${e.date} ${e.kind}\n${e.text}`).join('\n\n');
}

export function buildRequest(c: SyntheticCase, effort: Effort, maxTokens: number): ProposeRequest {
  const criteria = c.criteria.map(k => `${k.id}: ${k.text}`).join('\n');
  return {
    system: [
      { text: INSTRUCTIONS, cache: true },
      { text: `Chart for patient ${c.patient.alias}, ${c.patient.age} year old ${c.patient.sex}. Synthetic record.\n\n${renderChart(c)}` },
    ],
    user: `Denial (CARC ${c.denial.carc}): ${c.denial.text}\n\nService: ${c.procedure.codeSystem} ${c.procedure.code}, ${c.procedure.description}.\n\nPayer criteria (${c.payer.name}, ${c.payer.planType}):\n${criteria}\n\nDecide whether an appeal is warranted and, if so, draft it.`,
    effort,
    maxTokens,
  };
}

export function gateSources(c: SyntheticCase): GateSources {
  return {
    chart: c.chart,
    criteria: c.criteria,
    denial: [c.denial.text, `CARC ${c.denial.carc}`, c.denial.dateOfService, ...(c.denial.serviceEnd ? [c.denial.serviceEnd] : []), ...(c.denial.rarc ? [c.denial.rarc] : [])],
    facts: [`Patient ${c.patient.alias}, ${c.patient.age} year old ${c.patient.sex}`, `${c.procedure.codeSystem} ${c.procedure.code} ${c.procedure.description}`, `${c.payer.name}, ${c.payer.planType}`],
  };
}

export type Outcome = 'correct-pass' | 'correct-decline' | 'blocked' | 'missed' | 'false-pass' | 'error';

export function classify(expectedWarranted: boolean, verdict: GateResult['verdict']): Outcome {
  if (verdict === 'blocked') return 'blocked';
  if (expectedWarranted) return verdict === 'pass' ? 'correct-pass' : 'missed';
  return verdict === 'declined' ? 'correct-decline' : 'false-pass';
}

export interface CaseResult {
  caseId: string;
  category: string;
  setting: string;
  stakesUsd: number;
  expected: { warranted: boolean; subtype?: string };
  provider: string;
  model: string;
  stopReason: string | null;
  latencyMs: number;
  usage: Usage;
  costUsd: number;
  outcome: Outcome;
  warrantedMatch: boolean | null;
  citationPrecision: number | null; // verified evidence whose note is in the grading key, over verified evidence
  error?: string;
  draft?: Appeal; // kept because the data is synthetic; a real run would store only the gate record
  gate?: GateResult;
}

export interface RunOptions {
  effort: Effort;
  maxTokens: number;
}

const EMPTY_USAGE: Usage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, thinkingTokens: 0 };

export async function runCase(provider: Provider, c: SyntheticCase, opts: RunOptions): Promise<CaseResult> {
  const base = {
    caseId: c.id, category: c.category, setting: c.setting, stakesUsd: c.stakesUsd,
    expected: { warranted: c.expected.warranted, ...(c.expected.subtype ? { subtype: c.expected.subtype } : {}) },
    provider: provider.label, model: provider.model,
  };
  let result;
  try {
    result = await provider.propose(buildRequest(c, opts.effort, opts.maxTokens));
  } catch (error: unknown) {
    // Error class and HTTP status only: SDK messages can echo the request body.
    const status = (error as { status?: number }).status;
    const kind = error instanceof Error ? error.constructor.name : 'Error';
    return { ...base, stopReason: null, latencyMs: 0, usage: EMPTY_USAGE, costUsd: 0, outcome: 'error', warrantedMatch: null, citationPrecision: null, error: `request failed: ${kind}${status ? ` (HTTP ${status})` : ''}` };
  }
  const common = { ...base, stopReason: result.stopReason, latencyMs: result.latencyMs, usage: result.usage, costUsd: result.costUsd };
  if (!result.draft.ok) {
    return { ...common, outcome: 'error', warrantedMatch: null, citationPrecision: null, error: `parse failed: ${result.draft.error}` };
  }
  const appeal = result.draft.appeal;
  const gate = litmus(gateSources(c), appeal);
  const verifiedEvidence = gate.evidence.filter(e => e.status === 'verified');
  const onKey = verifiedEvidence.filter(e => (c.expected.support[e.criterion] ?? []).includes(e.citation)).length;
  return {
    ...common,
    outcome: classify(c.expected.warranted, gate.verdict),
    warrantedMatch: appeal.warranted === c.expected.warranted,
    citationPrecision: verifiedEvidence.length > 0 ? onKey / verifiedEvidence.length : null,
    draft: appeal,
    gate,
  };
}

export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export interface Summary {
  cases: number;
  outcomes: Partial<Record<Outcome, number>>;
  agreementRate: number; // correct-pass + correct-decline over cases
  gatePassRate: number | null; // passes over drafts that claimed warranted and reached the gate
  ungroundedSentencesCaught: number; // refuted + unresolved sentences
  sentencesVerified: number;
  checkErrors: number;
  latencyMs: { mean: number; p50: number; p95: number };
  tokens: { input: number; cachedInput: number; cacheWrite: number; output: number; thinking: number; perCase: { input: number; output: number; thinking: number } };
  costUsd: { total: number; perCase: number };
  stakesUsd: { total: number; defended: number; warranted: number };
  citationPrecision: number | null;
  bySubtype: Record<string, Partial<Record<Outcome, number>>>;
  byCategory: Record<string, Partial<Record<Outcome, number>>>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function summarize(results: CaseResult[]): Summary {
  const outcomes: Partial<Record<Outcome, number>> = {};
  const bySubtype: Summary['bySubtype'] = {};
  const byCategory: Summary['byCategory'] = {};
  for (const r of results) {
    outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    const sub = r.expected.subtype ?? 'warranted';
    (bySubtype[sub] ??= {})[r.outcome] = ((bySubtype[sub] ?? {})[r.outcome] ?? 0) + 1;
    (byCategory[r.category] ??= {})[r.outcome] = ((byCategory[r.category] ?? {})[r.outcome] ?? 0) + 1;
  }
  const gated = results.filter(r => r.gate && r.draft?.warranted);
  const latencies = results.filter(r => r.latencyMs > 0).map(r => r.latencyMs).sort((a, b) => a - b);
  const sum = (f: (r: CaseResult) => number) => results.reduce((n, r) => n + f(r), 0);
  const n = results.length || 1;
  const precisions = results.map(r => r.citationPrecision).filter((p): p is number => p !== null);
  return {
    cases: results.length,
    outcomes,
    agreementRate: ((outcomes['correct-pass'] ?? 0) + (outcomes['correct-decline'] ?? 0)) / n,
    gatePassRate: gated.length > 0 ? gated.filter(r => r.gate!.verdict === 'pass').length / gated.length : null,
    ungroundedSentencesCaught: sum(r => (r.gate ? r.gate.counts.refuted + r.gate.counts.unresolved : 0)),
    sentencesVerified: sum(r => r.gate?.counts.verified ?? 0),
    checkErrors: sum(r => r.gate?.counts.error ?? 0),
    latencyMs: {
      mean: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    },
    tokens: {
      input: sum(r => r.usage.inputTokens),
      cachedInput: sum(r => r.usage.cachedInputTokens),
      cacheWrite: sum(r => r.usage.cacheWriteTokens),
      output: sum(r => r.usage.outputTokens),
      thinking: sum(r => r.usage.thinkingTokens),
      perCase: { input: Math.round(sum(r => r.usage.inputTokens + r.usage.cachedInputTokens + r.usage.cacheWriteTokens) / n), output: Math.round(sum(r => r.usage.outputTokens) / n), thinking: Math.round(sum(r => r.usage.thinkingTokens) / n) },
    },
    costUsd: { total: sum(r => r.costUsd), perCase: sum(r => r.costUsd) / n },
    stakesUsd: {
      total: sum(r => r.stakesUsd),
      defended: sum(r => (r.outcome === 'correct-pass' ? r.stakesUsd : 0)),
      warranted: sum(r => (r.expected.warranted ? r.stakesUsd : 0)),
    },
    citationPrecision: precisions.length ? precisions.reduce((a, b) => a + b, 0) / precisions.length : null,
    bySubtype,
    byCategory,
  };
}

// --- CLI ----------------------------------------------------------------------

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v : undefined;
}

function selectProvider(name: string, model: string | undefined): Provider {
  switch (name) {
    case 'meta': {
      const key = env('MODEL_API_KEY');
      if (!key) throw new Error('MODEL_API_KEY is not set');
      return messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: key, model: model ?? 'muse-spark-1.3' });
    }
    case 'baseten': {
      const key = env('BASETEN_API_KEY');
      if (!key) throw new Error('BASETEN_API_KEY is not set');
      return messagesProvider({ label: 'baseten', baseURL: 'https://inference.baseten.co', authToken: key, model: model ?? 'meta-models/muse-spark-open', priceKey: 'muse-spark-open' });
    }
    case 'fireworks': {
      const key = env('FIREWORKS_API_KEY');
      if (!key) throw new Error('FIREWORKS_API_KEY is not set');
      return openAiProvider({ label: 'fireworks', baseURL: 'https://api.fireworks.ai/inference/v1', apiKey: key, model: model ?? 'accounts/fireworks/models/muse-spark-open', priceKey: 'muse-spark-open' });
    }
    default:
      throw new Error(`unknown provider ${name}`);
  }
}

export function loadCases(dir: string): SyntheticCase[] {
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SyntheticCase);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string', default: 'meta' },
      model: { type: 'string' },
      effort: { type: 'string', default: 'low' },
      concurrency: { type: 'string', default: '8' },
      limit: { type: 'string' },
      case: { type: 'string', multiple: true },
      'max-tokens': { type: 'string', default: '12288' },
      label: { type: 'string' },
    },
  });
  const effort = values.effort as Effort;
  if (!['low', 'medium'].includes(effort)) throw new Error('effort must be low or medium; high and xhigh are not run (see ROADMAP measurements)');
  const here = dirname(fileURLToPath(import.meta.url));
  let cases = loadCases(join(here, '..', 'synthetic', 'cases'));
  if (values.case && values.case.length > 0) cases = cases.filter(c => values.case!.includes(c.id));
  if (values.limit) cases = cases.slice(0, Number(values.limit));
  const provider = selectProvider(values.provider!, values.model);
  const concurrency = Number(values.concurrency);
  const maxTokens = Number(values['max-tokens']);
  const startedAt = new Date().toISOString();
  console.error(`running ${cases.length} case(s) on ${provider.label}/${provider.model}, effort ${effort}, concurrency ${concurrency}`);

  const results = await mapWithConcurrency(cases, concurrency, async c => {
    const r = await runCase(provider, c, { effort, maxTokens });
    console.error(`${r.caseId} ${r.outcome.padEnd(15)} ${r.gate ? `${r.gate.verdict.padEnd(8)} verified ${r.gate.counts.verified}/${r.gate.counts.sentences}` : (r.error ?? '')} ${r.latencyMs}ms $${r.costUsd.toFixed(4)}`);
    return r;
  });
  const summary = summarize(results);
  const safeModel = provider.model.replace(/[^a-z0-9.-]+/gi, '_');
  const stamp = startedAt.replace(/[:.]/g, '-');
  const outDir = join(here, '..', 'results');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${values.label ?? provider.label}-${safeModel}-${effort}-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ run: { startedAt, finishedAt: new Date().toISOString(), provider: provider.label, model: provider.model, effort, concurrency, maxTokens, cases: cases.length, litmus: LITMUS_VERSION, synthetic: true }, summary, results }, null, 2) + '\n');
  console.error(`wrote ${file}`);
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.constructor.name}: ${error.message.slice(0, 200)}` : String(error));
    process.exit(1);
  });
}
