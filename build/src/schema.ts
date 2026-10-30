// The output contract for the appeal-drafting proposer. Flat on purpose: the
// Meta Model API rejects recursive schemas and caps nesting at 10 levels.
//
// Version 2 (Oct 27): every sentence and every piece of evidence carries a
// verbatim quote from the cited chart entry. The gate checks the quote is
// really there and that the sentence's numbers come from an admissible source.
// No resemblance scoring, no keyword list: the evidence is the clinician's own
// words, and the physician reviews criterion, quote, and sentence side by side.
import { z } from 'zod';

// The citation id pattern lives in its own module so the gate (and the viewer's
// browser bundle) can import it without pulling in zod.
export { CITATION_ID } from './citation.js';
import { CITATION_ID } from './citation.js';

export const APPEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['warranted', 'reason', 'evidence', 'sentences'],
  properties: {
    warranted: {
      type: 'boolean',
      description: 'true only when the chart supports an appeal of this denial under every listed criterion; false means do not appeal',
    },
    reason: {
      type: 'string',
      description: 'when warranted is false, one sentence naming the criterion the chart cannot support or why the denial is not a medical-necessity question; empty string when warranted',
    },
    evidence: {
      type: 'array',
      description: 'for each payer criterion the chart supports, one or more items naming the criterion id, the chart entry id, and a verbatim quote from that entry that supports it',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion', 'citation', 'quote'],
        properties: {
          criterion: { type: 'string', description: 'the criterion id, e.g. crit-2' },
          citation: { type: 'string', description: 'the chart entry id the quote comes from, e.g. note-012' },
          quote: { type: 'string', description: 'at least two words copied exactly from the text of that entry, no paraphrase' },
        },
      },
    },
    sentences: {
      type: 'array',
      description: 'the appeal, one sentence per item, in order; empty when warranted is false',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'citation', 'quote'],
        properties: {
          text: { type: 'string', description: 'one sentence of the appeal in your own words' },
          citation: { type: 'string', description: 'the id of the single chart entry this sentence rests on, e.g. note-012' },
          quote: { type: 'string', description: 'at least two words copied exactly from the text of that entry that back this sentence; every number in the sentence must appear in the quote, the payer criteria, or the denial' },
        },
      },
    },
  },
} as const;

// Lenient where a model is sloppy (null for an unused string, a missing array,
// a blank placeholder sentence), strict where the gate depends on structure.
// Citation ids are not validated here: the gate resolves them, and it has to
// see a hallucinated id to count it.
const str = z.string().nullish().transform(v => (v ?? '').trim());
const evidenceSchema = z.object({ criterion: str, citation: str, quote: str });
const sentenceSchema = z.object({ text: str, citation: str, quote: str });

const appealSchema = z
  .object({
    warranted: z.boolean(),
    reason: str,
    evidence: z.array(evidenceSchema).nullish().transform(v => v ?? []),
    sentences: z.array(sentenceSchema).nullish().transform(v => v ?? []),
  })
  .transform(a => ({
    warranted: a.warranted,
    ...(a.reason ? { reason: a.reason } : {}),
    evidence: a.evidence,
    sentences: a.sentences.filter(s => s.text.length > 0),
  }));

export type Appeal = z.infer<typeof appealSchema>;
export type Sentence = Appeal['sentences'][number];
export type Evidence = Appeal['evidence'][number];
export type ParsedAppeal = { ok: true; appeal: Appeal } | { ok: false; error: string };

// Errors never echo the model text: on real runs that text is a draft about a
// patient, and the harness log is not the place for it.
export function parseAppeal(text: string): ParsedAppeal {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'draft is not valid JSON' };
  }
  const result = appealSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `draft failed the contract at ${issue?.path.join('.') || 'root'}: ${issue?.message ?? 'unknown'}` };
  }
  return { ok: true, appeal: result.data };
}

// --- the advisor -------------------------------------------------------------
// A second, visible opinion beside each criterion: does the quoted evidence,
// read literally, satisfy the criterion? It never feeds the gate. The gate
// answers whether a statement is in the record; the advisor answers whether
// the record satisfies the criterion, which is interpretation, and so it is
// shown with the model's name beside the criterion for the physician to weigh.

export const ADVICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      description: 'one item per payer criterion, in the order given',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion', 'verdict', 'why'],
        properties: {
          criterion: { type: 'string', description: 'the criterion id, e.g. crit-2' },
          verdict: { type: 'string', enum: ['supports', 'partial', 'silent'], description: 'supports: the quotes establish every element of the criterion; partial: the quotes address some elements and not others; silent: the quotes do not address the criterion' },
          why: { type: 'string', description: 'one sentence naming which element the quotes establish or lack; use only the quotes, add no facts' },
        },
      },
    },
  },
} as const;

const adviceSchema = z.object({
  items: z.array(z.object({
    criterion: z.string(),
    verdict: z.enum(['supports', 'partial', 'silent']),
    why: z.string().default(''),
  })).default([]),
});
export type Advice = z.infer<typeof adviceSchema>;
export type ParsedAdvice = { ok: true; advice: Advice } | { ok: false; error: string };

export function parseAdvice(text: string): ParsedAdvice {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'advice is not valid JSON' };
  }
  const result = adviceSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `advice failed the contract at ${issue?.path.join('.') || 'root'}: ${issue?.message ?? 'unknown'}` };
  }
  return { ok: true, advice: result.data };
}
