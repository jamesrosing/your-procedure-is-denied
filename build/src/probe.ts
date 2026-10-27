// Probe for three roadmap assumptions on muse-spark-1.3, Oct 26, 2026:
//   1. how many reasoning tokens a realistic appeal prompt spends at each effort
//   2. whether output_config.format with a flat JSON schema is honored
//   3. whether a repeated prefix is served from cache (usage.cache_read_input_tokens)
// All chart text below is synthetic: a fabricated case with no real identifiers.
import Anthropic from '@anthropic-ai/sdk';

const META_BASE_URL = 'https://api.meta.ai';
const MODEL = 'muse-spark-1.3';
type Effort = 'low' | 'medium' | 'high';

interface MetaUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number };
}

const APPEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['warranted', 'sentences'],
  properties: {
    warranted: { type: 'boolean', description: 'false when the chart does not support an appeal' },
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'citation'],
        properties: {
          text: { type: 'string' },
          citation: { type: 'string', description: 'the chart entry id this sentence rests on, e.g. note-003' },
        },
      },
    },
  },
} as const;

// Synthetic chart: enough entries to make the prompt several thousand tokens.
function syntheticChart(): string {
  const entries: string[] = [];
  for (let i = 1; i <= 40; i++) {
    const id = `note-${String(i).padStart(3, '0')}`;
    entries.push(
      `[${id}] Visit ${i}, synthetic date 2026-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}. ` +
        `Patient SYN-001 reports persistent upper back and neck pain rated ${(i % 5) + 4}/10, worse at the end of the day, ` +
        `with shoulder grooving from bra straps and intertrigo in the inframammary folds. ` +
        `Conservative measures tried this interval: supportive garments, physical therapy session ${i}, NSAID course, topical antifungal for the folds. ` +
        `Examination: macromastia, grade 3 ptosis, erythema in the inframammary folds, paraspinal tenderness. ` +
        `Height 165 cm, weight 78 kg, body mass index 28.7. Estimated resection 650 g per side. ` +
        `Plan: continue conservative care and reassess; discussed reduction mammaplasty as the next step if symptoms persist.`,
    );
  }
  return entries.join('\n');
}

const SYSTEM =
  'You draft administrative appeals of insurance claim denials for a surgeon to review and sign. ' +
  'This is payer-policy adjudication, not clinical advice. Every sentence of the appeal must cite exactly one chart entry id that supports it. ' +
  'If the chart does not support an appeal, set warranted to false and return no sentences. Synthetic chart follows.\n\n' +
  syntheticChart();

const DENIAL =
  'Denial: CPT 19318 bilateral reduction mammaplasty, CARC 50 (not deemed a medical necessity by the payer). ' +
  'Payer criteria: documented symptoms for at least six months, failure of at least three months of conservative treatment, ' +
  'and estimated resection weight above the Schnur threshold for the body surface area. Draft the appeal.';

async function call(client: Anthropic, effort: Effort): Promise<void> {
  const started = Date.now();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM,
    output_config: { effort, format: { type: 'json_schema', schema: APPEAL_SCHEMA } },
    messages: [{ role: 'user', content: DENIAL }],
  });
  const latencyMs = Date.now() - started;
  const usage = response.usage as unknown as MetaUsage;
  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  let parsed: { warranted?: boolean; sentences?: { text: string; citation: string }[] } | null = null;
  let schemaOk = false;
  try {
    parsed = JSON.parse(text);
    schemaOk =
      typeof parsed?.warranted === 'boolean' &&
      Array.isArray(parsed?.sentences) &&
      parsed.sentences.every(s => typeof s.text === 'string' && /^note-\d{3}$/.test(s.citation));
  } catch {
    schemaOk = false;
  }
  console.log(
    JSON.stringify({
      effort,
      stopReason: response.stop_reason,
      latencyMs,
      input: usage.input_tokens,
      cacheRead: usage.cache_read_input_tokens ?? null,
      cacheCreate: usage.cache_creation_input_tokens ?? null,
      output: usage.output_tokens,
      thinking: usage.output_tokens_details?.thinking_tokens ?? null,
      schemaOk,
      warranted: parsed?.warranted ?? null,
      sentences: parsed?.sentences?.length ?? null,
      firstSentence: parsed?.sentences?.[0] ?? null,
    }),
  );
}

async function main(): Promise<void> {
  const key = process.env['MODEL_API_KEY'];
  if (!key) throw new Error('MODEL_API_KEY is not set');
  const client = new Anthropic({ baseURL: META_BASE_URL, authToken: key, apiKey: null });
  for (const effort of ['low', 'low', 'medium', 'high'] as Effort[]) await call(client, effort);
}

main().catch((error: unknown) => {
  if (error instanceof Anthropic.APIError) console.error(`Meta API error ${error.status}: ${error.message}`);
  else console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
