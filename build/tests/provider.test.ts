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

describe('messagesProvider.proposeAgentic', () => {
  const INDEX_REQ = {
    ...REQ,
    tools: [
      { name: 'list_entries', description: 'list', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
      { name: 'read_entry', description: 'read', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } }, additionalProperties: false } },
    ],
    maxTurns: 6,
  };

  function sequence(replies: Record<string, unknown>[], captured: Captured[]): typeof fetch {
    let i = 0;
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
      captured.push({ url: String(input), headers, body: JSON.parse(String(init?.body)) });
      const reply = replies[Math.min(i++, replies.length - 1)]!;
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  }

  const TOOL_TURN = {
    ...REPLY,
    content: [
      { type: 'redacted_thinking', data: 'x' },
      { type: 'tool_use', id: 'tu_1', name: 'read_entry', input: { id: 'note-001' } },
      { type: 'tool_use', id: 'tu_2', name: 'read_entry', input: { id: 'note-999' } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, output_tokens_details: { thinking_tokens: 30 } },
  };
  const FINAL_TURN = { ...REPLY, usage: { input_tokens: 200, output_tokens: 400, cache_read_input_tokens: 1100, output_tokens_details: { thinking_tokens: 300 } } };

  test('loops on tool_use, feeds each result back, sums usage, and records a trace', async () => {
    const captured: Captured[] = [];
    const calls: { name: string; input: Record<string, unknown> }[] = [];
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: sequence([TOOL_TURN, FINAL_TURN], captured) });
    const r = await p.proposeAgentic!({
      ...INDEX_REQ,
      execute: async call => {
        calls.push(call);
        const id = String(call.input['id']);
        return id === 'note-001' ? { ok: true, content: '[note-001] text', entryId: id } : { ok: false, content: 'no such entry', entryId: id, note: 'no such entry' };
      },
    });
    assert.equal(captured.length, 2);
    const first = captured[0]!.body;
    const tools = first['tools'] as { name: string; input_schema: unknown }[];
    assert.deepEqual(tools.map(t => t.name), ['list_entries', 'read_entry']);
    assert.ok(tools[1]!.input_schema, 'tool schema is sent as input_schema');
    assert.ok(!('tool_choice' in first), 'tool_choice is left at its default (auto)');
    for (const f of FORBIDDEN_FIELDS) assert.ok(!(f in first), `${f} must not be sent`);
    assert.equal((first['output_config'] as { effort: string }).effort, 'low');
    const second = captured[1]!.body;
    const msgs = second['messages'] as { role: string; content: unknown }[];
    assert.equal(msgs.length, 3);
    assert.equal(msgs[1]?.role, 'assistant');
    assert.equal(msgs[2]?.role, 'user');
    const results = msgs[2]!.content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[];
    assert.deepEqual(results.map(x => [x.type, x.tool_use_id, x.content, x.is_error ?? false]), [['tool_result', 'tu_1', '[note-001] text', false], ['tool_result', 'tu_2', 'no such entry', true]]);
    assert.deepEqual(calls.map(c => c.input['id']), ['note-001', 'note-999']);
    assert.deepEqual(r.usage, { inputTokens: 300, cachedInputTokens: 2100, cacheWriteTokens: 0, outputTokens: 450, thinkingTokens: 330 });
    assert.equal(r.turns, 2);
    assert.equal(r.stopReason, 'end_turn');
    assert.equal(r.draft.ok, true);
    assert.deepEqual(r.trace.map(t => [t.step, t.tool, t.entryId, t.ok]), [[0, 'read_entry', 'note-001', true], [1, 'read_entry', 'note-999', false]]);
    assert.ok(r.trace.every(t => t.atMs >= 0));
    assert.ok(r.costUsd > 0);
  });

  test('a loop that never ends is cut at maxTurns and reported, not run forever', async () => {
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: sequence([TOOL_TURN], []) });
    const r = await p.proposeAgentic!({ ...INDEX_REQ, maxTurns: 3, execute: async () => ({ ok: true, content: 'x' }) });
    assert.equal(r.turns, 3);
    assert.equal(r.stopReason, 'max_turns');
    assert.equal(r.draft.ok, false);
    assert.equal(r.trace.length, 6);
  });
});

describe('the repair turn in the provider (resume) and the why field in the trace', () => {
  const TOOLS = [
    { name: 'list_entries', description: 'list', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'read_entry', description: 'read', inputSchema: { type: 'object', required: ['id', 'why'], properties: { id: { type: 'string' }, why: { type: 'string' } }, additionalProperties: false } },
  ];
  function sequence(replies: Record<string, unknown>[], captured: Captured[]): typeof fetch {
    let i = 0;
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
      captured.push({ url: String(input), headers, body: JSON.parse(String(init?.body)) });
      const reply = replies[Math.min(i++, replies.length - 1)]!;
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  }
  const TOOL_TURN = {
    ...REPLY,
    content: [{ type: 'redacted_thinking', data: 'x' }, { type: 'tool_use', id: 'tu_1', name: 'read_entry', input: { id: 'note-001', why: ' The admission note should carry the qualifying stay. ' } }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, output_tokens_details: { thinking_tokens: 30 } },
  };

  test('the agentic result returns the transcript, including the final assistant turn, and the trace carries the why the model gave', async () => {
    const captured: Captured[] = [];
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: sequence([TOOL_TURN, REPLY], captured) });
    const r = await p.proposeAgentic!({ ...REQ, tools: TOOLS, maxTurns: 4, execute: async () => ({ ok: true, content: '[note-001] text', entryId: 'note-001' }) });
    assert.equal(r.trace[0]?.why, 'The admission note should carry the qualifying stay.');
    assert.deepEqual(r.trace[0]?.input, { id: 'note-001', why: ' The admission note should carry the qualifying stay. ' }, 'the input is kept as the model sent it');
    // user, assistant(tool_use), user(tool_result), assistant(final)
    const roles = (r.transcript.messages as { role: string }[]).map(m => m.role);
    assert.deepEqual(roles, ['user', 'assistant', 'user', 'assistant']);
    const last = r.transcript.messages[3] as { content: { type: string }[] };
    assert.ok(last.content.some(b => b.type === 'redacted_thinking'), 'redacted thinking is kept in the transcript so it is replayed, as the Meta docs ask');
  });

  test('a resumed agentic request replays the transcript, appends the repair turn as a user message, keeps the tools, and the same cached system blocks', async () => {
    const captured: Captured[] = [];
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: sequence([TOOL_TURN, REPLY, TOOL_TURN, REPLY], captured) });
    const first = await p.proposeAgentic!({ ...REQ, tools: TOOLS, maxTurns: 4, execute: async () => ({ ok: true, content: 'x', entryId: 'note-001' }) });
    captured.length = 0;
    const second = await p.proposeAgentic!({ ...REQ, tools: TOOLS, maxTurns: 4, execute: async () => ({ ok: true, content: 'y', entryId: 'note-002' }), resume: { transcript: first.transcript, user: 'REPAIR: sentence 0 refuted' } });
    const body = captured[0]!.body;
    const msgs = body['messages'] as { role: string; content: unknown }[];
    assert.equal(msgs.length, 5);
    assert.equal(msgs[4]!.role, 'user');
    assert.equal(msgs[4]!.content, 'REPAIR: sentence 0 refuted');
    assert.deepEqual(msgs.slice(0, 4).map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
    assert.ok(Array.isArray(body['tools']) && (body['tools'] as unknown[]).length === 2, 'the model keeps its tools');
    const sys = body['system'] as { text: string; cache_control?: unknown }[];
    assert.equal(sys[0]!.text, 'SHARED INSTRUCTIONS');
    assert.ok(sys[0]!.cache_control);
    for (const f of FORBIDDEN_FIELDS) assert.ok(!(f in body));
    assert.equal(second.trace[0]?.entryId, 'note-002');
    assert.equal((second.transcript.messages as unknown[]).length, 8, 'five replayed, then tool_use, tool_result, and the final draft');
    assert.equal(second.usage.inputTokens, 100 + 55);
  });

  test('a resumed plain propose replays the first exchange as text turns', async () => {
    const captured: Captured[] = [];
    const p = messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: fakeFetch(REPLY, captured) });
    const first = await p.propose(REQ);
    assert.deepEqual((first.transcript.messages as { role: string }[]).map(m => m.role), ['user', 'assistant']);
    captured.length = 0;
    await p.propose({ ...REQ, resume: { transcript: first.transcript, user: 'REPAIR' } });
    const msgs = captured[0]!.body['messages'] as { role: string; content: unknown }[];
    assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant', 'user']);
    assert.equal(msgs[0]!.content, 'DENIAL');
    assert.equal(msgs[2]!.content, 'REPAIR');
  });
});
