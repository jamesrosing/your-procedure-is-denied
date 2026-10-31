import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { INTAKE_FIELDS, INTAKE_SCHEMA, readLetter, scoreFields, summarizeIntake, type IntakeCaseResult } from '../src/intake.js';
import { FORBIDDEN_FIELDS } from '../src/provider.js';
import { letterFields } from '../src/synthetic/letters.js';
import { generateCases, SEED } from '../src/synthetic/generate.js';

const cases = generateCases(SEED);
const c1 = cases[0]!;

describe('document intake (item 4): scoring what the model read against the case file', () => {
  test('every field is scored; exact values are correct, and the small variations a reader makes are allowed: a code-system prefix on the code, a dollar string for the amount, an empty string for no service end, spacing and case in text', () => {
    const expected = letterFields(c1);
    const got = { carc: ' 50', remark: expected.remark.toUpperCase(), dateOfService: expected.dateOfService, serviceEnd: expected.serviceEnd, code: `HIPPS ${expected.code.toLowerCase()}`, codeSystem: 'hipps', billedUsd: '$8,000.00', payerName: `  ${expected.payerName}  ` };
    const s = scoreFields(expected, got);
    assert.deepEqual(Object.keys(s), [...INTAKE_FIELDS]);
    for (const f of INTAKE_FIELDS) assert.equal(s[f]!.correct, true, `${f}: ${JSON.stringify(s[f])}`);
    assert.equal(s['billedUsd']!.got, 8000);
  });

  test('a wrong code, a shifted date, a different amount, a paraphrased remark, and a missing field are errors, each with what was read', () => {
    const expected = letterFields(c1);
    const got = { carc: '197', remark: `${expected.remark} More.`, dateOfService: '2026-09-14', serviceEnd: '', code: 'KDOB2', codeSystem: 'MS-DRG', billedUsd: 800 };
    const s = scoreFields(expected, got);
    for (const f of INTAKE_FIELDS) assert.equal(s[f]!.correct, false, f);
    assert.equal(s['payerName']!.got, null);
    assert.equal(s['billedUsd']!.got, 800);
    assert.equal(s['serviceEnd']!.got, null);
  });

  test('a single-date claim scores an empty or null service end as correct', () => {
    const single = cases.find(c => !c.denial.serviceEnd)!;
    const expected = letterFields(single);
    assert.equal(scoreFields(expected, { ...expected, serviceEnd: '' })['serviceEnd']!.correct, true);
    assert.equal(scoreFields(expected, { ...expected, serviceEnd: null })['serviceEnd']!.correct, true);
    assert.equal(scoreFields(expected, { ...expected, serviceEnd: '2026-01-01' })['serviceEnd']!.correct, false);
  });

  test('the schema asks for the eight fields and nothing else, as strings and one number, with no nesting the Meta endpoint rejects', () => {
    assert.deepEqual(Object.keys(INTAKE_SCHEMA.properties).sort(), [...INTAKE_FIELDS].sort());
    assert.deepEqual([...INTAKE_SCHEMA.required].sort(), [...INTAKE_FIELDS].sort());
    assert.equal(INTAKE_SCHEMA.properties.billedUsd.type, 'number');
    assert.equal(INTAKE_SCHEMA.additionalProperties, false);
  });

  test('the call sends the letter as a base64 PNG image block with the schema and effort, and never a forbidden field; the answer is scored and priced', async () => {
    const captured: Record<string, unknown>[] = [];
    const expected = letterFields(c1);
    const reply = {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'muse-spark-1.3',
      content: [{ type: 'redacted_thinking', data: 'x' }, { type: 'text', text: JSON.stringify({ ...expected, serviceEnd: expected.serviceEnd ?? '' }) }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1500, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens_details: { thinking_tokens: 40 } },
    };
    const fake = (async (_input: string | URL | Request, init?: RequestInit) => {
      captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const r = await readLetter({ baseURL: 'https://api.meta.ai', authToken: 'k', model: 'muse-spark-1.3', fetch: fake }, c1, png, 'low');
    const body = captured[0]!;
    assert.equal(body['model'], 'muse-spark-1.3');
    const oc = body['output_config'] as { effort: string; format: { type: string; schema: unknown } };
    assert.equal(oc.effort, 'low');
    assert.equal(oc.format.type, 'json_schema');
    for (const f of FORBIDDEN_FIELDS) assert.ok(!(f in body), `${f} must not be sent`);
    const msgs = body['messages'] as { role: string; content: { type: string; source?: { type: string; media_type: string; data: string }; text?: string }[] }[];
    assert.equal(msgs.length, 1);
    const image = msgs[0]!.content.find(b => b.type === 'image');
    assert.ok(image && image.source, 'an image block');
    assert.equal(image!.source!.type, 'base64');
    assert.equal(image!.source!.media_type, 'image/png');
    assert.equal(image!.source!.data, png.toString('base64'));
    const text = msgs[0]!.content.find(b => b.type === 'text')?.text ?? '';
    assert.match(text, /administrative/i);
    assert.ok(!/chart|clinical judgment is yours|diagnos/i.test(text), 'the intake prompt asks for nothing clinical');
    const sys = JSON.stringify(body['system']);
    assert.match(sys, /nothing clinical|not clinical/i);
    assert.equal(r.caseId, c1.id);
    assert.ok(r.fields && Object.values(r.fields).every(f => f.correct), JSON.stringify(r.fields));
    assert.equal(r.usage.inputTokens, 1500);
    assert.ok(r.costUsd > 0);
    assert.equal(r.error, undefined);
  });

  test('summarize counts fields correct of N, letters with every field correct, cost, and latency', () => {
    const results: IntakeCaseResult[] = [
      { caseId: 'case-001', latencyMs: 1000, usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, thinkingTokens: 0 }, costUsd: 0.01, fields: { carc: { expected: '50', got: '50', correct: true }, code: { expected: 'A', got: 'B', correct: false } } },
      { caseId: 'case-002', latencyMs: 3000, usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, thinkingTokens: 0 }, costUsd: 0.03, fields: { carc: { expected: '50', got: '50', correct: true }, code: { expected: 'A', got: 'A', correct: true } } },
      { caseId: 'case-003', latencyMs: 0, usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, thinkingTokens: 0 }, costUsd: 0, error: 'parse failed' },
    ];
    const s = summarizeIntake(results);
    assert.equal(s.cases, 3);
    assert.deepEqual(s.fieldsCorrect, { carc: 2, code: 1 });
    assert.equal(s.allCorrect, 1);
    assert.equal(s.failed, 1);
    assert.ok(Math.abs(s.costUsd.total - 0.04) < 1e-9);
    assert.equal(s.latencyMs.p50, 1000);
  });
});
