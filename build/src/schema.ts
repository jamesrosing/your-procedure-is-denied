// The output contract for the appeal-drafting proposer. Flat on purpose: the
// Meta Model API rejects recursive schemas and caps nesting at 10 levels, and
// the verifier only needs one thing per sentence, the chart entry it rests on.
import { z } from 'zod';

export const CITATION_ID = /^note-\d{3}$/;

export const APPEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['warranted', 'sentences'],
  properties: {
    warranted: {
      type: 'boolean',
      description: 'true only when the chart supports an appeal of this denial; false means do not appeal',
    },
    reason: {
      type: 'string',
      description: 'when warranted is false, one sentence on what the chart lacks; otherwise omit or leave empty',
    },
    sentences: {
      type: 'array',
      description: 'the appeal, one sentence per item, in order; empty when warranted is false',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'citation'],
        properties: {
          text: { type: 'string', description: 'one sentence of the appeal' },
          citation: { type: 'string', description: 'the id of the single chart entry this sentence rests on, e.g. note-012' },
        },
      },
    },
  },
} as const;

const sentenceSchema = z.object({
  text: z.string(),
  citation: z.string().regex(CITATION_ID, 'citation must be a chart entry id like note-012'),
});

// Lenient where the model is sloppy (blank sentences, missing reason), strict
// where the verifier depends on it (the citation id shape).
const appealSchema = z.object({
  warranted: z.boolean(),
  reason: z.string().optional(),
  sentences: z.array(sentenceSchema).default([]),
}).transform(a => ({
  warranted: a.warranted,
  ...(a.reason && a.reason.trim() ? { reason: a.reason.trim() } : {}),
  sentences: a.sentences.filter(s => s.text.trim().length > 0).map(s => ({ text: s.text.trim(), citation: s.citation })),
}));

export type Appeal = z.infer<typeof appealSchema>;
export type ParsedAppeal = { ok: true; appeal: Appeal } | { ok: false; error: string };

// Errors never echo the model text: on real runs that text is a draft about a
// (synthetic) patient, and the harness log is not the place for it.
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
