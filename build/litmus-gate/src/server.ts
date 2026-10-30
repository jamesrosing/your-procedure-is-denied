// The MCP server: three read-only tools and one resource over the gate. A
// fresh McpServer per connection, as the SDK's factory contract asks.
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { APPEAL_SCHEMA, LITMUS_VERSION, draftInputSchema, renderMarkdown, renderSentenceMarkdown, sourcesInputSchema, toJson, verifyDraft, verifySentence } from './lib.js';

export const SERVER_NAME = 'litmus-gate';
export const SERVER_VERSION = '0.1.0';

const responseFormat = z.enum(['markdown', 'json']).default('markdown').describe("'markdown' for a readable report, 'json' for the full gate record as structured content");

const sentenceInput = z.object({
  text: z.string().min(1).describe('one sentence of the draft, in the author\'s words'),
  citation: z.string().min(1).describe('the id of the single chart entry the sentence rests on, e.g. note-012'),
  quote: z.string().min(1).describe('at least two words copied exactly from that entry'),
});

const RULES = [
  'Each sentence cites one chart entry and carries a verbatim quote from it; the quote must appear in that entry with only whitespace, case, and quote glyphs normalized.',
  'Every hard token in the sentence (number, date, code, and a side, left or right) must appear in the cited entry, the criteria, the denial, or the stated case facts; otherwise the sentence is refuted and the token named.',
  'When every missing token lives in another entry of the same chart, the sentence is returned as needs-citation naming that entry; the draft is still blocked.',
  'A draft passes only when every sentence verifies and every criterion it claims has verified evidence. A check that throws is an error, never a pass.',
  'The gate verifies presence, not sufficiency: that the words are in the record, not that the record meets the criterion. A physician reads and signs.',
];

export function contract(): { litmus: string; server: string; version: string; rules: string[]; appealSchema: typeof APPEAL_SCHEMA; sourcesShape: string } {
  return {
    litmus: LITMUS_VERSION,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    rules: RULES,
    appealSchema: APPEAL_SCHEMA,
    sourcesShape: 'Either {chart: [{id, date?, kind?, text}], criteria: [{id, text}], denial: string[], facts?: string[]} or a case file {chart, criteria, denial: {carc, rarc?, text, dateOfService, serviceEnd?}, patient: {alias, age, sex}, procedure: {code, codeSystem, description}, payer: {name, planType}}.',
  };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'litmus_verify_draft',
    {
      title: 'Verify a draft against the record',
      description: `Run the LITMUS referential gate over a drafted appeal (or any cited draft) against the chart it cites. Deterministic, no model inside, fails closed.

Returns the verdict (pass, blocked, or declined), each sentence's status (verified, refuted with the invented token named, needs-citation with the entry to add, unresolved for an unknown citation, error), each evidence item's status, which criteria have verified evidence, and a SHA-256 of the inputs for the provenance record.

Use it before a draft is shown to anyone: a blocked draft names what to fix. Use litmus_check_sentence while editing one sentence, and litmus_contract for the draft schema. The gate verifies that each statement is in the record; it does not judge whether the record satisfies the criterion.`,
      inputSchema: z.strictObject({ sources: sourcesInputSchema, draft: draftInputSchema, response_format: responseFormat }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ sources, draft, response_format }) => {
      const out = verifyDraft(sources, draft);
      if (!out.ok) return { content: [{ type: 'text', text: out.error }], isError: true };
      if (response_format === 'json') return { content: [{ type: 'text', text: toJson(out.result) }], structuredContent: JSON.parse(toJson(out.result)) as Record<string, unknown> };
      return { content: [{ type: 'text', text: renderMarkdown(out.result) }] };
    },
  );

  server.registerTool(
    'litmus_check_sentence',
    {
      title: 'Check one sentence',
      description: `Run the gate's sentence check on one sentence, its citation, and its quote, against the chart: the same check litmus_verify_draft applies to every sentence, for use while a sentence is being written or repaired. Returns the status and, when it fails, the reason, the tokens with no admissible source, and the entries that would source them.`,
      inputSchema: z.strictObject({ sources: sourcesInputSchema, sentence: sentenceInput, response_format: responseFormat }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ sources, sentence, response_format }) => {
      const record = verifySentence(sources, sentence);
      const json = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
      if (response_format === 'json') return { content: [{ type: 'text', text: JSON.stringify(json, null, 2) }], structuredContent: json };
      return { content: [{ type: 'text', text: renderSentenceMarkdown(record) }], structuredContent: json };
    },
  );

  server.registerTool(
    'litmus_contract',
    {
      title: 'The draft contract and the gate rules',
      description: 'Returns the JSON Schema a draft must satisfy (warranted, reason, evidence, sentences, each sentence with one citation and a verbatim quote), the shape of the admissible sources, the gate rules in plain words, and the gate version string that is stamped into every verdict. Call it once before drafting.',
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const c = contract();
      return { content: [{ type: 'text', text: JSON.stringify(c, null, 2) }], structuredContent: JSON.parse(JSON.stringify(c)) as Record<string, unknown> };
    },
  );

  server.registerResource(
    'litmus-contract',
    'litmus://contract',
    { title: 'LITMUS gate contract', description: 'The draft schema, the admissible sources, the rules, and the gate version', mimeType: 'application/json' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(contract(), null, 2) }] }),
  );

  return server;
}
