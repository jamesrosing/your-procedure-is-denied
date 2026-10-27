// The provider seam: one interface the harness calls, implemented for the
// Messages protocol (Meta Model API and Baseten, both through the Anthropic
// SDK with the base URL swapped) and for OpenAI-compatible endpoints
// (Fireworks, fallback). Everything model-specific lives here so the harness,
// the verifier, and the results table never see a vendor type.
import Anthropic from '@anthropic-ai/sdk';
import { APPEAL_SCHEMA, parseAppeal, type ParsedAppeal } from './schema.js';
import { costUsd, type Usage } from './cost.js';

export type Effort = 'low' | 'medium' | 'high';

export interface SystemBlock {
  text: string;
  cache?: boolean; // mark the shared prefix so it is written to and read from the prompt cache
}

export interface ProposeRequest {
  system: SystemBlock[]; // instructions (shared, cached) then the chart for this case
  user: string; // the denial and the payer criteria
  effort: Effort;
  maxTokens: number;
}

export interface ProposeResult {
  provider: string;
  model: string;
  stopReason: string | null;
  latencyMs: number;
  usage: Usage;
  costUsd: number;
  draft: ParsedAppeal;
  rawText: string; // kept for the verifier; the harness stores it only for synthetic runs
}

export interface Provider {
  readonly label: string;
  readonly model: string;
  propose(request: ProposeRequest): Promise<ProposeResult>;
}

// Fields the Meta Model API answers with HTTP 400 (dev.meta.ai/docs/protocols/messages,
// Oct 26, 2026). The provider never sets them; the test pins that.
export const FORBIDDEN_FIELDS = ['stop_sequences', 'top_k', 'container', 'inference_geo', 'tool_choice', 'thinking'] as const;

interface MetaUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  output_tokens_details?: { thinking_tokens?: unknown } | null;
}

function count(value: unknown, field: string, optional = false): number {
  if (value === undefined || value === null) {
    if (optional) return 0;
    throw new Error(`usage field ${field} missing from the response`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`usage field ${field} is not a number`);
  return value;
}

export interface MessagesProviderOptions {
  label: string;
  baseURL: string;
  authToken: string;
  model: string;
  priceKey?: string; // defaults to model
  fetch?: typeof fetch; // tests inject a fake
}

export function messagesProvider(options: MessagesProviderOptions): Provider {
  const client = new Anthropic({
    baseURL: options.baseURL,
    authToken: options.authToken,
    apiKey: null,
    maxRetries: 2,
    timeout: 180_000,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const priceKey = options.priceKey ?? options.model;

  return {
    label: options.label,
    model: options.model,
    async propose(request: ProposeRequest): Promise<ProposeResult> {
      const started = Date.now();
      const response = await client.messages.create({
        model: options.model,
        max_tokens: request.maxTokens,
        system: request.system.map(b => ({ type: 'text' as const, text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) })),
        output_config: { effort: request.effort, format: { type: 'json_schema', schema: APPEAL_SCHEMA } },
        messages: [{ role: 'user', content: request.user }],
      });
      const latencyMs = Date.now() - started;
      const u = (response.usage ?? {}) as MetaUsage;
      const usage: Usage = {
        inputTokens: count(u.input_tokens, 'input_tokens'),
        cachedInputTokens: count(u.cache_read_input_tokens, 'cache_read_input_tokens', true),
        cacheWriteTokens: count(u.cache_creation_input_tokens, 'cache_creation_input_tokens', true),
        outputTokens: count(u.output_tokens, 'output_tokens'),
        thinkingTokens: count(u.output_tokens_details?.thinking_tokens, 'thinking_tokens', true),
      };
      const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      return {
        provider: options.label,
        model: response.model,
        stopReason: response.stop_reason,
        latencyMs,
        usage,
        costUsd: costUsd(priceKey, usage),
        draft: rawText ? parseAppeal(rawText) : { ok: false, error: `no text in response (stop reason ${response.stop_reason})` },
        rawText,
      };
    },
  };
}

export interface OpenAiProviderOptions {
  label: string;
  baseURL: string; // e.g. https://api.fireworks.ai/inference/v1
  apiKey: string;
  model: string;
  priceKey: string;
  fetch?: typeof fetch;
}

interface ChatCompletion {
  model: string;
  choices: { message: { content: string | null }; finish_reason: string | null }[];
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown } | null;
    completion_tokens_details?: { reasoning_tokens?: unknown } | null;
  } | null;
}

// Fallback path for OpenAI-compatible hosts. Kept to fetch so the only SDK in
// the harness is the one the primary path needs.
export function openAiProvider(options: OpenAiProviderOptions): Provider {
  const doFetch = options.fetch ?? fetch;
  return {
    label: options.label,
    model: options.model,
    async propose(request: ProposeRequest): Promise<ProposeResult> {
      const started = Date.now();
      const res = await doFetch(`${options.baseURL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model,
          max_tokens: request.maxTokens,
          reasoning_effort: request.effort,
          response_format: { type: 'json_schema', json_schema: { name: 'appeal', schema: APPEAL_SCHEMA, strict: true } },
          messages: [
            { role: 'system', content: request.system.map(b => b.text).join('\n\n') },
            { role: 'user', content: request.user },
          ],
        }),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) throw new Error(`${options.label} returned HTTP ${res.status}`);
      const body = (await res.json()) as ChatCompletion;
      if (!body.usage) throw new Error(`${options.label} response has no usage block`);
      const choice = body.choices[0];
      const rawText = choice?.message.content ?? '';
      const cached = count(body.usage.prompt_tokens_details?.cached_tokens, 'cached_tokens', true);
      const usage: Usage = {
        inputTokens: count(body.usage.prompt_tokens, 'prompt_tokens') - cached,
        cachedInputTokens: cached,
        cacheWriteTokens: 0,
        outputTokens: count(body.usage.completion_tokens, 'completion_tokens'),
        thinkingTokens: count(body.usage.completion_tokens_details?.reasoning_tokens, 'reasoning_tokens', true),
      };
      return {
        provider: options.label,
        model: body.model,
        stopReason: choice?.finish_reason ?? null,
        latencyMs,
        usage,
        costUsd: costUsd(options.priceKey, usage),
        draft: rawText ? parseAppeal(rawText) : { ok: false, error: 'no text in response' },
        rawText,
      };
    },
  };
}
