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

// --- the agentic path --------------------------------------------------------
// The model gets an index of the chart and tools to read entries, and the
// provider loops on tool_use until end_turn. Every tool call is recorded in a
// trace with its timestamp so a results file can replay what the model read.

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolOutcome {
  ok: boolean;
  content: string; // what the model sees
  entryId?: string; // for read_entry: the entry fetched
  live?: boolean; // a query against an external data source, labeled as such downstream
  note?: string; // short human-readable note for the trace
}

export interface TraceEvent {
  step: number;
  tool: string;
  input: Record<string, unknown>;
  entryId?: string;
  atMs: number; // since the case started
  ok: boolean;
  live?: boolean;
  note?: string;
}

export interface AgenticRequest extends ProposeRequest {
  tools: ToolDefinition[];
  execute: (call: ToolCall) => Promise<ToolOutcome>;
  maxTurns?: number; // model turns, each ending in tool_use or end_turn; default 24
}

export interface AgenticResult extends ProposeResult {
  turns: number;
  trace: TraceEvent[];
}

// A plain structured question, used by the advisor: system, user, a JSON
// schema for the answer, and the text back. No tools, no appeal contract.
export interface AskRequest {
  system: SystemBlock[];
  user: string;
  schema: Record<string, unknown>;
  effort: Effort;
  maxTokens: number;
}

export interface AskResult {
  provider: string;
  model: string;
  stopReason: string | null;
  latencyMs: number;
  usage: Usage;
  costUsd: number;
  rawText: string;
}

export interface Provider {
  readonly label: string;
  readonly model: string;
  propose(request: ProposeRequest): Promise<ProposeResult>;
  proposeAgentic?(request: AgenticRequest): Promise<AgenticResult>;
  ask?(request: AskRequest): Promise<AskResult>;
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

  const readUsage = (response: Anthropic.Message): Usage => {
    const u = (response.usage ?? {}) as MetaUsage;
    return {
      inputTokens: count(u.input_tokens, 'input_tokens'),
      cachedInputTokens: count(u.cache_read_input_tokens, 'cache_read_input_tokens', true),
      cacheWriteTokens: count(u.cache_creation_input_tokens, 'cache_creation_input_tokens', true),
      outputTokens: count(u.output_tokens, 'output_tokens'),
      thinkingTokens: count(u.output_tokens_details?.thinking_tokens, 'thinking_tokens', true),
    };
  };
  const systemBlocks = (request: ProposeRequest) => request.system.map(b => ({ type: 'text' as const, text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) }));
  const textOf = (response: Anthropic.Message) => response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');

  return {
    label: options.label,
    model: options.model,

    async proposeAgentic(request: AgenticRequest): Promise<AgenticResult> {
      const started = Date.now();
      const maxTurns = request.maxTurns ?? 24;
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: request.user }];
      const trace: TraceEvent[] = [];
      const usage: Usage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, thinkingTokens: 0 };
      let turns = 0;
      let response: Anthropic.Message | null = null;
      while (turns < maxTurns) {
        // tool_choice stays at its default (auto): the Meta endpoint rejects a named tool.
        response = await client.messages.create({
          model: options.model,
          max_tokens: request.maxTokens,
          system: systemBlocks(request),
          tools: request.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool['input_schema'] })),
          output_config: { effort: request.effort, format: { type: 'json_schema', schema: APPEAL_SCHEMA } },
          messages,
        });
        turns += 1;
        const u = readUsage(response);
        usage.inputTokens += u.inputTokens;
        usage.cachedInputTokens += u.cachedInputTokens;
        usage.cacheWriteTokens += u.cacheWriteTokens;
        usage.outputTokens += u.outputTokens;
        usage.thinkingTokens += u.thinkingTokens;
        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        if (response.stop_reason !== 'tool_use' || toolUses.length === 0) break;
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const call of toolUses) {
          const input = (call.input ?? {}) as Record<string, unknown>;
          const atMs = Date.now() - started;
          let outcome: ToolOutcome;
          try {
            outcome = await request.execute({ name: call.name, input });
          } catch (error: unknown) {
            outcome = { ok: false, content: `tool failed: ${error instanceof Error ? error.constructor.name : 'Error'}`, note: 'tool threw' };
          }
          trace.push({
            step: trace.length, tool: call.name, input, atMs, ok: outcome.ok,
            ...(outcome.entryId ? { entryId: outcome.entryId } : {}),
            ...(outcome.live ? { live: true } : {}),
            ...(outcome.note ? { note: outcome.note } : {}),
          });
          results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, ...(outcome.ok ? {} : { is_error: true }) });
        }
        messages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });
        messages.push({ role: 'user', content: results });
      }
      const latencyMs = Date.now() - started;
      const ended = response !== null && response.stop_reason !== 'tool_use';
      const rawText = response && ended ? textOf(response) : '';
      const stopReason = ended ? response!.stop_reason : 'max_turns';
      return {
        provider: options.label,
        model: response?.model ?? options.model,
        stopReason,
        latencyMs,
        usage,
        costUsd: costUsd(priceKey, usage),
        draft: rawText ? parseAppeal(rawText) : { ok: false, error: `no text in response (stop reason ${stopReason})` },
        rawText,
        turns,
        trace,
      };
    },

    async ask(request: AskRequest): Promise<AskResult> {
      const started = Date.now();
      const response = await client.messages.create({
        model: options.model,
        max_tokens: request.maxTokens,
        system: systemBlocks(request),
        output_config: { effort: request.effort, format: { type: 'json_schema', schema: request.schema } },
        messages: [{ role: 'user', content: request.user }],
      });
      const latencyMs = Date.now() - started;
      const usage = readUsage(response);
      return { provider: options.label, model: response.model, stopReason: response.stop_reason, latencyMs, usage, costUsd: costUsd(priceKey, usage), rawText: textOf(response) };
    },

    async propose(request: ProposeRequest): Promise<ProposeResult> {
      const started = Date.now();
      const response = await client.messages.create({
        model: options.model,
        max_tokens: request.maxTokens,
        system: systemBlocks(request),
        output_config: { effort: request.effort, format: { type: 'json_schema', schema: APPEAL_SCHEMA } },
        messages: [{ role: 'user', content: request.user }],
      });
      const latencyMs = Date.now() - started;
      const usage = readUsage(response);
      const rawText = textOf(response);
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
