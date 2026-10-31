// Document intake: the denial as it arrives, a one-page remittance letter
// (build/synthetic/letters/, rendered by src/synthetic/letters.ts), sent to a
// Meta model as an image with a JSON schema for the eight administrative
// fields on the page, and each field scored against the case file. This is
// intake of an administrative letter and nothing clinical: the fields are the
// claim's code and code system, its dates of service, the billed amount, the
// reason and remark codes, the reviewer's remark, and the payer's name. No
// chart entry is sent and no clinical judgment is asked for. Image input is
// the Messages protocol's image block with a base64 source (dev.meta.ai docs,
// Messages schemas, read Oct 31, 2026); the same client setup as provider.ts,
// never the fields the endpoint rejects.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { costUsd, type Usage } from './cost.js';
import { parseEffort, mapWithConcurrency } from './harness.js';
import type { Effort } from './provider.js';
import { letterFields, type LetterFields } from './synthetic/letters.js';
import { generateCases, SEED } from './synthetic/generate.js';
import type { SyntheticCase } from './synthetic/types.js';

export const INTAKE_FIELDS = ['carc', 'remark', 'dateOfService', 'serviceEnd', 'code', 'codeSystem', 'billedUsd', 'payerName'] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];

export const INTAKE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['carc', 'remark', 'dateOfService', 'serviceEnd', 'code', 'codeSystem', 'billedUsd', 'payerName'],
  properties: {
    carc: { type: 'string', description: 'the claim adjustment reason code number as printed after CARC, e.g. 50' },
    remark: { type: 'string', description: "the reviewer's remark paragraph, copied exactly as printed, no words changed" },
    dateOfService: { type: 'string', description: 'the first date of service on the claim line, YYYY-MM-DD' },
    serviceEnd: { type: 'string', description: 'the last date of service when the claim line prints a range, YYYY-MM-DD; an empty string when it prints a single date' },
    code: { type: 'string', description: 'the billing code on the claim line, the code alone, e.g. 27447, J9271, 871, 0104, KDOB1' },
    codeSystem: { type: 'string', enum: ['CPT', 'HCPCS', 'MS-DRG', 'CMG', 'HIPPS'], description: 'the code system printed before the code' },
    billedUsd: { type: 'number', description: 'the billed amount on the claim line in dollars, as a number' },
    payerName: { type: 'string', description: "the plan's name as printed in the letterhead" },
  },
} as const;

export const INTAKE_SYSTEM = 'You read administrative correspondence from health plans for a medical practice\'s billing office. The image is one page of a remittance notice denying a claim. Transcribe the eight fields the schema names from what is printed on the page, exactly as printed. This is document intake of an administrative letter and nothing clinical: make no judgment about the care, add nothing that is not on the page, and leave a field empty rather than guess.';

export const INTAKE_PROMPT = 'Read this one-page claim denial letter and return the eight fields as the JSON object the schema describes: the CARC number, the reviewer\'s remark copied exactly, the first and last dates of service on the claim line (last date empty when a single date is printed), the billing code and its code system, the billed amount as a number, and the payer\'s name from the letterhead. This is administrative intake only.';

// --- scoring -----------------------------------------------------------------

const canon = (s: string): string => s.normalize('NFC').replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const CODE_SYSTEMS: Record<string, string> = { cpt: 'CPT', hcpcs: 'HCPCS', 'ms-drg': 'MS-DRG', msdrg: 'MS-DRG', drg: 'MS-DRG', cmg: 'CMG', hipps: 'HIPPS' };

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function money(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,\s]/g, '').replace(/^usd/i, ''));
    return Number.isFinite(n) && v.trim() !== '' ? n : null;
  }
  return null;
}

export interface FieldScore { expected: unknown; got: unknown; correct: boolean }

export function scoreFields(expected: LetterFields, got: unknown): Record<IntakeField, FieldScore> {
  const g = (got && typeof got === 'object' ? got : {}) as Record<string, unknown>;
  const out = {} as Record<IntakeField, FieldScore>;
  const code = str(g['code'])?.replace(/^(?:cpt|hcpcs|ms-?drg|drg|cmg|hipps)[:\s]*/i, '').toUpperCase() ?? null;
  const codeSystemRaw = str(g['codeSystem']);
  const codeSystem = codeSystemRaw ? CODE_SYSTEMS[canon(codeSystemRaw)] ?? codeSystemRaw.toUpperCase() : null;
  const amount = money(g['billedUsd']);
  const remark = str(g['remark']);
  const payer = str(g['payerName']);
  const serviceEnd = str(g['serviceEnd']);
  const carc = str(g['carc'])?.replace(/^carc\s*/i, '') ?? null;
  out.carc = { expected: expected.carc, got: carc, correct: carc === expected.carc };
  out.remark = { expected: expected.remark, got: remark, correct: remark !== null && canon(remark) === canon(expected.remark) };
  out.dateOfService = { expected: expected.dateOfService, got: str(g['dateOfService']), correct: str(g['dateOfService']) === expected.dateOfService };
  out.serviceEnd = { expected: expected.serviceEnd, got: serviceEnd, correct: serviceEnd === expected.serviceEnd };
  out.code = { expected: expected.code, got: code, correct: code === expected.code.toUpperCase() };
  out.codeSystem = { expected: expected.codeSystem, got: codeSystem, correct: codeSystem === expected.codeSystem };
  out.billedUsd = { expected: expected.billedUsd, got: amount, correct: amount !== null && Math.abs(amount - expected.billedUsd) < 0.005 };
  out.payerName = { expected: expected.payerName, got: payer, correct: payer !== null && canon(payer) === canon(expected.payerName) };
  return out;
}

// --- the call --------------------------------------------------------------------

export interface IntakeClient { baseURL: string; authToken: string; model: string; priceKey?: string; fetch?: typeof fetch }

export interface IntakeCaseResult {
  caseId: string;
  latencyMs: number;
  usage: Usage;
  costUsd: number;
  stopReason?: string | null;
  fields?: Record<string, FieldScore>; // one entry per intake field
  got?: unknown; // the parsed answer as returned
  error?: string;
  rawPreview?: string;
}

function readUsage(u: Record<string, unknown>): Usage {
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const details = (u['output_tokens_details'] ?? {}) as Record<string, unknown>;
  return { inputTokens: n(u['input_tokens']), cachedInputTokens: n(u['cache_read_input_tokens']), cacheWriteTokens: n(u['cache_creation_input_tokens']), outputTokens: n(u['output_tokens']), thinkingTokens: n(details['thinking_tokens']) };
}

export async function readLetter(client: IntakeClient, c: SyntheticCase, png: Buffer, effort: Effort): Promise<IntakeCaseResult> {
  const anthropic = new Anthropic({ baseURL: client.baseURL, authToken: client.authToken, apiKey: null, maxRetries: 2, timeout: 180_000, ...(client.fetch ? { fetch: client.fetch } : {}) });
  const priceKey = client.priceKey ?? client.model;
  const started = Date.now();
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: client.model,
      max_tokens: 2048,
      system: [{ type: 'text', text: INTAKE_SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort, format: { type: 'json_schema', schema: INTAKE_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } },
          { type: 'text', text: INTAKE_PROMPT },
        ],
      }],
    });
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    const kind = error instanceof Error ? error.constructor.name : 'Error';
    return { caseId: c.id, latencyMs: Date.now() - started, usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, thinkingTokens: 0 }, costUsd: 0, error: `request failed: ${kind}${status ? ` (HTTP ${status})` : ''}` };
  }
  const latencyMs = Date.now() - started;
  const usage = readUsage((response.usage ?? {}) as unknown as Record<string, unknown>);
  const cost = costUsd(priceKey, usage);
  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  let got: unknown;
  try {
    got = JSON.parse(text);
  } catch {
    return { caseId: c.id, latencyMs, usage, costUsd: cost, stopReason: response.stop_reason, error: 'parse failed: answer is not valid JSON', rawPreview: text.slice(0, 200) };
  }
  return { caseId: c.id, latencyMs, usage, costUsd: cost, stopReason: response.stop_reason, got, fields: scoreFields(letterFields(c), got) };
}

export interface IntakeSummary {
  cases: number;
  fieldsCorrect: Record<string, number>;
  allCorrect: number;
  failed: number;
  costUsd: { total: number; perCase: number };
  latencyMs: { mean: number; p50: number; p95: number };
  tokens: { input: number; output: number; thinking: number };
}

export function summarizeIntake(results: IntakeCaseResult[]): IntakeSummary {
  const fieldsCorrect: Record<string, number> = {};
  for (const r of results) for (const [f, s] of Object.entries(r.fields ?? {})) fieldsCorrect[f] = (fieldsCorrect[f] ?? 0) + (s.correct ? 1 : 0);
  const lat = results.filter(r => r.latencyMs > 0 && !r.error).map(r => r.latencyMs).sort((a, b) => a - b);
  const pct = (p: number): number => (lat.length ? lat[Math.max(0, Math.min(lat.length - 1, Math.ceil((p / 100) * lat.length) - 1))]! : 0);
  const total = results.reduce((n, r) => n + r.costUsd, 0);
  return {
    cases: results.length,
    fieldsCorrect,
    allCorrect: results.filter(r => r.fields && Object.values(r.fields).every(s => s.correct)).length,
    failed: results.filter(r => r.error).length,
    costUsd: { total, perCase: total / Math.max(1, results.length) },
    latencyMs: { mean: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0, p50: pct(50), p95: pct(95) },
    tokens: { input: results.reduce((n, r) => n + r.usage.inputTokens + r.usage.cachedInputTokens + r.usage.cacheWriteTokens, 0), output: results.reduce((n, r) => n + r.usage.outputTokens, 0), thinking: results.reduce((n, r) => n + r.usage.thinkingTokens, 0) },
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: 'string', default: 'muse-spark-1.3' }, effort: { type: 'string', default: 'low' }, case: { type: 'string', multiple: true }, limit: { type: 'string' }, concurrency: { type: 'string', default: '4' }, 'out-dir': { type: 'string' } } });
  const key = process.env['MODEL_API_KEY'];
  if (!key || !key.trim()) throw new Error('MODEL_API_KEY is not set');
  const effort = parseEffort(values.effort!);
  const here = dirname(fileURLToPath(import.meta.url));
  const lettersDir = join(here, '..', 'synthetic', 'letters');
  let cases = generateCases(SEED);
  if (values.case && values.case.length > 0) cases = cases.filter(c => values.case!.includes(c.id));
  if (values.limit) cases = cases.slice(0, Number(values.limit));
  for (const c of cases) if (!existsSync(join(lettersDir, `${c.id}.png`))) throw new Error(`${c.id}.png is not in ${lettersDir}; run npm run letters first`);
  const client: IntakeClient = { baseURL: 'https://api.meta.ai', authToken: key, model: values.model! };
  const startedAt = new Date().toISOString();
  console.error(`reading ${cases.length} letter(s) with ${client.model}, effort ${effort}`);
  const results = await mapWithConcurrency(cases, Number(values.concurrency), async c => {
    const r = await readLetter(client, c, readFileSync(join(lettersDir, `${c.id}.png`)), effort);
    const wrong = r.fields ? Object.entries(r.fields).filter(([, s]) => !s.correct).map(([f]) => f) : [];
    console.error(`${c.id} ${r.error ?? (wrong.length ? `wrong: ${wrong.join(', ')}` : 'all eight correct')} ${r.latencyMs}ms $${r.costUsd.toFixed(4)}`);
    return r;
  });
  const summary = summarizeIntake(results);
  console.error(`cost of this run: $${summary.costUsd.total.toFixed(4)} over ${results.length} letter(s), $${summary.costUsd.perCase.toFixed(4)} per letter`);
  const outDir = values['out-dir'] ? resolve(values['out-dir']) : join(here, '..', 'results', 'intake');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `meta-${client.model.replace(/[^a-z0-9.-]+/gi, '_')}-${effort}-intake-${startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ run: { startedAt, finishedAt: new Date().toISOString(), provider: 'meta', model: client.model, effort, cases: cases.length, letters: 'build/synthetic/letters', fields: INTAKE_FIELDS, synthetic: true, administrative: 'document intake of a remittance letter; nothing clinical is read or judged' }, summary, results }, null, 2) + '\n');
  console.error(`wrote ${file}`);
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.constructor.name}: ${error.message.slice(0, 200)}` : String(error));
    process.exit(1);
  });
}
