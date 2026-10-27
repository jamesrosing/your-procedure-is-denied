// One test call to muse-spark-1.3 on the Meta Model API through the Anthropic
// SDK with only the base URL, token, and model name changed.
//
// Field names checked against https://dev.meta.ai/docs/protocols/messages on
// Oct 26, 2026: effort lives at output_config.effort (low, medium, high, xhigh;
// max on some models) and reasoning tokens are reported at
// usage.output_tokens_details.thinking_tokens. Not sent, because the endpoint
// returns 400 for them: stop_sequences, top_k, thinking {type: "disabled"},
// named tool_choice. Effort is set explicitly on every call because reasoning
// tokens bill as output.
import Anthropic from '@anthropic-ai/sdk';

const META_BASE_URL = 'https://api.meta.ai';
const MODEL = 'muse-spark-1.3';

interface MetaUsage {
  input_tokens: number;
  output_tokens: number;
  output_tokens_details?: { thinking_tokens?: number };
}

function requireKey(): string {
  const key = process.env['MODEL_API_KEY'];
  if (!key) {
    throw new Error('MODEL_API_KEY is not set. Put it in the repository .env (gitignored) and run with --env-file=../.env.');
  }
  return key;
}

async function main(): Promise<void> {
  const client = new Anthropic({ baseURL: META_BASE_URL, authToken: requireKey(), apiKey: null });
  const started = Date.now();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'Reply with one sentence confirming which model you are and that you received this message.' }],
  });
  const latencyMs = Date.now() - started;

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');
  const usage = response.usage as unknown as MetaUsage;

  console.log(JSON.stringify({
    model: response.model,
    stopReason: response.stop_reason,
    latencyMs,
    usage: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      thinking: usage.output_tokens_details?.thinking_tokens ?? null,
    },
    contentBlockTypes: response.content.map(block => block.type),
    text,
  }, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof Anthropic.APIError) {
    console.error(`Meta API error ${error.status}: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});
