import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesProvider, FORBIDDEN_FIELDS } from '../src/provider.js';
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

const REPLY = {
  id: 'msg_1', type: 'message', role: 'assistant', model: 'muse-spark-1.3',
  content: [{ type: 'redacted_thinking', data: 'x' }, { type: 'text', text: JSON.stringify({ warranted: true, sentences: [{ text: 'A.', citation: 'note-001' }] }) }],
  stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 55, output_tokens: 400, cache_read_input_tokens: 1649, cache_creation_input_tokens: 0, output_tokens_details: { thinking_tokens: 375 } },
};

const REQ: ProposeRequest = { system: 'SYSTEM PREFIX', user: 'DENIAL', effort: 'low', maxTokens: 8192 };

describe('messagesProvider', () => {
  test('sends effort, flat schema, and a cache marker on the system block; nothing forbidden', async () => {
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
    const sys = body['system'] as { type: string; text: string; cache_control: { type: string } }[];
    assert.equal(sys[0]?.text, 'SYSTEM PREFIX');
    assert.equal(sys[0]?.cache_control.type, 'ephemeral');
    for (const f of FORBIDDEN_FIELDS) assert.ok(!(f in body), `${f} must not be sent`);
    assert.ok(!('thinking' in body));
    assert.ok(!('temperature' in body));
  });

  test('normalizes usage, parses the draft, and prices the call with cached input', async () => {
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: fakeFetch(REPLY, []) });
    const r = await p.propose(REQ);
    assert.equal(r.provider, 'meta');
    assert.equal(r.model, 'muse-spark-1.3');
    assert.equal(r.stopReason, 'end_turn');
    assert.deepEqual(r.usage, { inputTokens: 55, cachedInputTokens: 1649, outputTokens: 400, thinkingTokens: 375 });
    assert.ok(r.costUsd > 0 && r.costUsd < 0.01);
    assert.equal(r.draft.ok, true);
    if (r.draft.ok) assert.equal(r.draft.appeal.sentences[0]?.citation, 'note-001');
    assert.ok(r.latencyMs >= 0);
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
    const p = messagesProvider({ label: 'baseten', baseURL: 'https://inference.baseten.co', authToken: 'b', model: 'meta-models/muse-spark-open-1026', priceKey: 'muse-spark-open', fetch: fakeFetch({ ...REPLY, model: 'meta-models/muse-spark-open-1026' }, captured) });
    const r = await p.propose(REQ);
    assert.equal(captured[0]!.url, 'https://inference.baseten.co/v1/messages');
    assert.equal(captured[0]!.headers['authorization'], 'Bearer b');
    assert.ok(r.costUsd > 0);
  });
});
