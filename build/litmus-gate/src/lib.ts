// litmus-gate: the LITMUS referential gate as a tool. One library behind a
// CLI and an MCP server, wrapping the same litmus() the harness and the
// viewer call (build/src/litmus.ts), so a verdict from any surface is the same
// verdict, hash included. The gate verifies that a statement is in the record;
// it does not verify that the record satisfies the criterion. That reading,
// and the signature, stay with the physician.
import * as z from 'zod/v4';
import { litmus, checkSentence, LITMUS_VERSION, type GateResult, type GateSources, type SentenceRecord, type SentenceInput } from '../../src/litmus.js';
import { gateSources, type GateCase } from '../../src/sources.js';
import { APPEAL_SCHEMA, parseAppeal } from '../../src/schema.js';

export { LITMUS_VERSION, APPEAL_SCHEMA };

// --- the admissible set ------------------------------------------------------

const entry = z.object({ id: z.string().min(1).describe('entry id the draft cites, e.g. note-012'), date: z.string().optional(), kind: z.string().optional(), text: z.string().describe('the entry text as written') });
const criterion = z.object({ id: z.string().min(1).describe('criterion id, e.g. crit-2'), text: z.string() });

// The explicit shape: what the gate may treat as admissible.
export const sourcesSchema = z.object({
  chart: z.array(entry).min(1).describe('the chart entries the draft may cite'),
  criteria: z.array(criterion).describe("the payer's criteria, by id"),
  denial: z.array(z.string()).describe("the denial's own text fields; numbers here are admissible"),
  facts: z.array(z.string()).optional().describe('other stated case facts, e.g. the patient line and the procedure code'),
});

// The case shape the harness and the viewer use (build/synthetic/cases/*.json).
export const caseSchema = z.object({
  chart: z.array(entry).min(1),
  criteria: z.array(criterion),
  denial: z.object({ carc: z.string(), rarc: z.string().optional(), text: z.string(), dateOfService: z.string(), serviceEnd: z.string().optional() }),
  patient: z.object({ alias: z.string(), age: z.number(), sex: z.string() }),
  procedure: z.object({ code: z.string(), codeSystem: z.string(), description: z.string() }),
  payer: z.object({ name: z.string(), planType: z.string() }),
});

export const sourcesInputSchema = z.union([sourcesSchema, caseSchema]).describe('the admissible set: either {chart, criteria, denial: string[], facts?} or a case file {chart, criteria, denial: {...}, patient, procedure, payer}');

// zod 4 strips optional keys that are undefined only when absent; the gate's
// types use exactOptionalPropertyTypes, so drop undefined values explicitly.
const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function normalizeSources(input: unknown): GateSources {
  const asCase = caseSchema.safeParse(input);
  if (asCase.success && !Array.isArray((input as { denial?: unknown }).denial)) {
    const c = asCase.data;
    return gateSources({ ...c, chart: c.chart.map(compact), denial: compact(c.denial) } as GateCase);
  }
  const asSources = sourcesSchema.safeParse(input);
  if (asSources.success) {
    const s = asSources.data;
    return compact({ chart: s.chart.map(compact), criteria: s.criteria, denial: s.denial, facts: s.facts }) as GateSources;
  }
  const issue = (asCase.success ? asSources : asCase).error?.issues[0];
  throw new Error(`sources are neither a case file nor an admissible set: ${issue ? `${issue.path.join('.') || 'root'}: ${issue.message}` : 'unknown shape'}. Expected {chart: [{id, text}], criteria: [{id, text}], denial: string[], facts?: string[]}, or a case file with denial, patient, procedure, and payer objects.`);
}

// --- the draft ---------------------------------------------------------------

// Loose on purpose and validated by the same parseAppeal() the harness applies
// to a model's answer, so a draft that fails here fails there too.
export const draftInputSchema = z.object({
  warranted: z.boolean().describe('true when the draft appeals; false when it declines'),
  reason: z.string().nullish().describe('when declining, the criterion the record cannot support'),
  evidence: z.array(z.object({ criterion: z.string(), citation: z.string(), quote: z.string() })).nullish().describe('per criterion: the entry cited and a verbatim quote from it'),
  sentences: z.array(z.object({ text: z.string(), citation: z.string(), quote: z.string() })).nullish().describe('the appeal, one sentence per item, each citing one entry with a verbatim quote'),
}).describe('the draft under the appeal contract (litmus_contract returns the JSON Schema)');

export type Verified = { ok: true; result: GateResult } | { ok: false; error: string };

export function verifyDraft(sources: unknown, draft: unknown): Verified {
  let gate: GateSources;
  try { gate = normalizeSources(sources); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  const parsed = parseAppeal(JSON.stringify(draft ?? null));
  if (!parsed.ok) return { ok: false, error: `${parsed.error}. Call litmus_contract for the schema.` };
  return { ok: true, result: litmus(gate, parsed.appeal) };
}

export function verifySentence(sources: unknown, sentence: SentenceInput): SentenceRecord {
  return checkSentence(normalizeSources(sources), sentence);
}

// --- rendering ---------------------------------------------------------------

// JSON.stringify drops the module-private verified symbol; this is the shape a
// caller sees, identical to the gate record stored in the result files.
export function toJson(result: GateResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderMarkdown(r: GateResult): string {
  const lines: string[] = [];
  lines.push(`# LITMUS gate: ${r.verdict.toUpperCase()}`);
  lines.push(`${r.litmus.split(':')[0]?.trim() ?? r.litmus} · input hash ${r.inputHash.slice(0, 16)}…${r.errored ? ' · a check threw (error, not a pass)' : ''}`);
  if (r.declinedReason) lines.push(`Declined: ${r.declinedReason}`);
  if (r.reasons.length) { lines.push('', '## Why it is blocked'); for (const x of r.reasons) lines.push(`- ${x}`); }
  lines.push('', `## Sentences (${r.counts.verified} verified of ${r.counts.sentences})`);
  if (r.sentences.length === 0) lines.push('(none)');
  for (const s of r.sentences) {
    const extra = s.status === 'verified' ? '' : ` — ${s.reason}${s.alsoCite?.length ? ` — also cite ${s.alsoCite.join(', ')}` : ''}`;
    lines.push(`${s.index + 1}. [${s.status}] ${s.text} (cites ${s.citation})${extra}`);
  }
  lines.push('', `## Evidence (${r.counts.evidenceVerified} verified of ${r.counts.evidence})`);
  if (r.evidence.length === 0) lines.push('(none)');
  for (const e of r.evidence) lines.push(`- [${e.status}] ${e.criterion} ← ${e.citation}: “${e.quote}”${e.status === 'verified' ? '' : ` — ${e.reason}`}`);
  const crit = Object.entries(r.criteria);
  if (crit.length) { lines.push('', '## Criteria'); for (const [id, st] of crit) lines.push(`- ${id}: ${st}`); }
  lines.push('', 'The gate verifies that each statement is in the record. It does not verify that the record satisfies the criterion; a physician reads and signs.');
  return lines.join('\n');
}

export function renderSentenceMarkdown(s: SentenceRecord): string {
  const extra = s.status === 'verified' ? '' : `\n${s.reason}${s.missing?.length ? `\nmissing: ${s.missing.join(', ')}` : ''}${s.alsoCite?.length ? `\nalso cite: ${s.alsoCite.join(', ')}` : ''}`;
  return `[${s.status}] ${s.text} (cites ${s.citation}, quote “${s.quote}”)${extra}`;
}
