// The provider seam: one interface the harness calls, implemented for the
// Messages protocol (Meta Model API and Baseten, both through the Anthropic
// SDK with the base URL swapped) and for OpenAI-compatible endpoints
// (Fireworks, fallback). Everything model-specific lives here so the harness,
// the verifier, and the results table never see a vendor type.
import Anthropic from '@anthropic-ai/sdk';
import { APPEAL_SCHEMA, parseAppeal, type ParsedAppeal } from './schema.js';
import { costUsd, type Usage } from './cost.js';

export type Effort = 'low' | 'medium' | 'high';

export interface ProposeRequest {
  system: string; // the shared, cacheable prefix: instructions plus the synthetic chart
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
  rawText: string; // kept for the verifier; never logged by the harness
}

export interface Provider {
  readonly label: string;
  readonly model: string;
  propose(request: ProposeRequest): Promise<ProposeResult>;
}

// Fields the Meta Model API answers with HTTP 400 (dev.meta.ai/docs/protocols/messages,
// Oct 26, 2026). The provider never sets them; the test pins that.
export const FORBIDDEN_FIELDS = ['stop_sequences', 'top_k', 'container', 'inference_geo', 'tool_choice'] as const;

interface MetaUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number } | null;
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
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: request.effort, format: { type: 'json_schema', schema: APPEAL_SCHEMA } },
        messages: [{ role: 'user', content: request.user }],
      });
      const latencyMs = Date.now() - started;
      const u = response.usage as unknown as MetaUsage;
      const usage: Usage = {
        inputTokens: u.input_tokens,
        cachedInputTokens: u.cache_read_input_tokens ?? 0,
        outputTokens: u.output_tokens,
        thinkingTokens: u.output_tokens_details?.thinking_tokens ?? 0,
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
    completion_tokens_details?: { reasoning_tokens?: number } | null;
  };
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
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) throw new Error(`${options.label} returned HTTP ${res.status}`);
      const body = (await res.json()) as ChatCompletion;
      const choice = body.choices[0];
      const rawText = choice?.message.content ?? '';
      const cached = body.usage.prompt_tokens_details?.cached_tokens ?? 0;
      const usage: Usage = {
        inputTokens: body.usage.prompt_tokens - cached,
        cachedInputTokens: cached,
        outputTokens: body.usage.completion_tokens,
        thinkingTokens: body.usage.completion_tokens_details?.reasoning_tokens ?? 0,
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
