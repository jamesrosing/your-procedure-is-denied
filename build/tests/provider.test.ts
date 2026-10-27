import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesProvider, openAiProvider, FORBIDDEN_FIELDS } from '../src/provider.js';
import type { ProposeRequest } from '../src/provider.js';

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(reply: Record<string, unknown>, captured: Captured[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    captured.push({ url: String(input), headers, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const DRAFT = { warranted: true, reason: '', evidence: [{ criterion: 'crit-1', citation: 'note-001', quote: 'a b' }], sentences: [{ text: 'A.', citation: 'note-001', quote: 'a b' }] };

const REPLY = {
  id: 'msg_1', type: 'message', role: 'assistant', model: 'muse-spark-1.3',
  content: [{ type: 'redacted_thinking', data: 'x' }, { type: 'text', text: JSON.stringify(DRAFT) }],
  stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 55, output_tokens: 400, cache_read_input_tokens: 1649, cache_creation_input_tokens: 210, output_tokens_details: { thinking_tokens: 375 } },
};

const REQ: ProposeRequest = {
  system: [{ text: 'SHARED INSTRUCTIONS', cache: true }, { text: 'CHART FOR THIS CASE' }],
  user: 'DENIAL',
  effort: 'low',
  maxTokens: 8192,
};

describe('messagesProvider', () => {
  test('sends effort, the flat schema, and a cache marker only on the flagged block; nothing forbidden', async () => {
    const captured: Captured[] = [];
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: fakeFetch(REPLY, captured) });
    await p.propose(REQ);
    const body = captured[0]!.body;
    assert.equal(captured[0]!.url, 'https://api.meta.ai/v1/messages');
    assert.equal(captured[0]!.headers['authorization'], 'Bearer k');
    assert.equal(body['model'], 'muse-spark-1.3');
    assert.equal(body['max_tokens'], 8192);
    const oc = body['output_config'] as { effort: string; format: { type: string; schema: { type: string } } };
    assert.equal(oc.effort, 'low');
    assert.equal(oc.format.type, 'json_schema');
    assert.equal(oc.format.schema.type, 'object');
    const sys = body['system'] as { type: string; text: string; cache_control?: { type: string } }[];
    assert.equal(sys.length, 2);
    assert.equal(sys[0]?.text, 'SHARED INSTRUCTIONS');
    assert.equal(sys[0]?.cache_control?.type, 'ephemeral');
    assert.equal(sys[1]?.text, 'CHART FOR THIS CASE');
    assert.equal(sys[1]?.cache_control, undefined);
    for (const f of FORBIDDEN_FIELDS) assert.ok(!(f in body), `${f} must not be sent`);
    assert.ok(!('temperature' in body));
  });

  test('normalizes usage including cache writes, parses the draft, and prices the call', async () => {
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: fakeFetch(REPLY, []) });
    const r = await p.propose(REQ);
    assert.equal(r.provider, 'meta');
    assert.equal(r.model, 'muse-spark-1.3');
    assert.equal(r.stopReason, 'end_turn');
    assert.deepEqual(r.usage, { inputTokens: 55, cachedInputTokens: 1649, cacheWriteTokens: 210, outputTokens: 400, thinkingTokens: 375 });
    assert.ok(r.costUsd > 0 && r.costUsd < 0.01);
    assert.equal(r.draft.ok, true);
    if (r.draft.ok) assert.equal(r.draft.appeal.sentences[0]?.quote, 'a b');
    assert.ok(r.latencyMs >= 0);
  });

  test('a usage block missing a count is reported as an error, not priced as NaN', async () => {
    const reply = { ...REPLY, usage: { output_tokens: 400 } };
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: fakeFetch(reply, []) });
    await assert.rejects(p.propose(REQ), /usage/);
  });

  test('a max_tokens stop with no text is a parse failure, not a throw', async () => {
    const reply = { ...REPLY, content: [{ type: 'redacted_thinking', data: 'x' }], stop_reason: 'max_tokens' };
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: fakeFetch(reply, []) });
    const r = await p.propose(REQ);
    assert.equal(r.stopReason, 'max_tokens');
    assert.equal(r.draft.ok, false);
  });

  test('extra headers reach the request (Baseten path)', async () => {
    const captured: Captured[] = [];
    const p = messagesProvider({ label: 'baseten', baseURL: 'https://inference.baseten.co', authToken: 'b', model: 'meta-models/muse-spark-open', priceKey: 'muse-spark-open', fetch: fakeFetch({ ...REPLY, model: 'meta-models/muse-spark-open' }, captured) });
    const r = await p.propose(REQ);
    assert.equal(captured[0]!.url, 'https://inference.baseten.co/v1/messages');
    assert.equal(captured[0]!.headers['authorization'], 'Bearer b');
    assert.ok(r.costUsd > 0);
  });
});

describe('openAiProvider', () => {
  const REPLY_OA = {
    model: 'accounts/fireworks/models/muse-spark-open',
    choices: [{ message: { content: JSON.stringify(DRAFT) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1700, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 1600 }, completion_tokens_details: { reasoning_tokens: 300 } },
  };

  test('joins the system blocks, sends the schema, and normalizes usage', async () => {
    const captured: Captured[] = [];
    const p = openAiProvider({ label: 'fireworks', baseURL: 'https://api.fireworks.ai/inference/v1', apiKey: 'f', model: 'accounts/fireworks/models/muse-spark-open', priceKey: 'muse-spark-open', fetch: fakeFetch(REPLY_OA, captured) });
    const r = await p.propose(REQ);
    const body = captured[0]!.body;
    const msgs = body['messages'] as { role: string; content: string }[];
    assert.equal(msgs[0]?.role, 'system');
    assert.match(msgs[0]?.content ?? '', /SHARED INSTRUCTIONS[\s\S]*CHART FOR THIS CASE/);
    assert.equal(body['reasoning_effort'], 'low');
    assert.deepEqual(r.usage, { inputTokens: 100, cachedInputTokens: 1600, cacheWriteTokens: 0, outputTokens: 500, thinkingTokens: 300 });
    assert.equal(r.draft.ok, true);
  });

  test('a 200 without a usage block is an error with context, not a crash', async () => {
    const p = openAiProvider({ label: 'fireworks', baseURL: 'https://api.fireworks.ai/inference/v1', apiKey: 'f', model: 'm', priceKey: 'muse-spark-open', fetch: fakeFetch({ model: 'm', choices: REPLY_OA.choices }, []) });
    await assert.rejects(p.propose(REQ), /usage/);
  });
});
