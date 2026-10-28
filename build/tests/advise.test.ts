import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adviseCase, buildAdvicePrompt, summarizeAdvice, ADVISOR_INSTRUCTIONS } from '../scripts/advise.js';
import { regate } from '../scripts/regate.js';
import { parseAdvice, ADVICE_SCHEMA } from '../src/schema.js';
import { messagesProvider } from '../src/provider.js';
import { loadCases, type CaseResult } from '../src/harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const cases = loadCases(join(here, '..', 'synthetic', 'cases'));
const byId = new Map(cases.map(c => [c.id, c]));
const resultsDir = join(here, '..', 'results');
const files = readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort();

function fakeTransport(body: unknown, captured: { body: unknown }[] = []): typeof fetch {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    captured.push({ body: JSON.parse(String(init?.body ?? '{}')) });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'muse-wonder-1.0', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 200, output_tokens: 60 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

describe('advice contract', () => {
  test('parseAdvice is lenient on an empty why and strict on the verdict', () => {
    assert.equal(parseAdvice(JSON.stringify({ items: [{ criterion: 'crit-1', verdict: 'partial' }] })).ok, true);
    assert.equal(parseAdvice(JSON.stringify({ items: [{ criterion: 'crit-1', verdict: 'maybe', why: '' }] })).ok, false);
    assert.equal(parseAdvice('not json').ok, false);
    assert.deepEqual(Object.keys((ADVICE_SCHEMA.properties.items.items as { properties: object }).properties), ['criterion', 'verdict', 'why']);
  });
});

describe('the advisor pass', () => {
  const c = byId.get('case-001')!;
  const sample: CaseResult = {
    caseId: c.id, category: c.category, setting: c.setting, stakesUsd: c.stakesUsd, expected: { warranted: true }, provider: 'meta', model: 'muse-spark-1.3',
    stopReason: 'end_turn', latencyMs: 1000, usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, thinkingTokens: 0 }, costUsd: 0.001,
    outcome: 'false-pass', warrantedMatch: false, citationPrecision: 1,
    draft: { warranted: true, reason: '', evidence: [{ criterion: 'crit-1', citation: 'note-001', quote: 'two words' }], sentences: [] },
    gate: { litmus: 'x', verdict: 'pass', reasons: [], errored: false, inputHash: 'h', sentences: [], evidence: [{ index: 0, criterion: 'crit-1', citation: 'note-001', quote: 'two words', status: 'verified', reason: 'verified' } as never], criteria: Object.fromEntries(c.criteria.map(k => [k.id, k.id === 'crit-1' ? 'verified' : 'unverified'])), counts: { sentences: 0, verified: 0, unresolved: 0, refuted: 0, needsCitation: 0, error: 0, evidence: 1, evidenceVerified: 1 } },
  };

  test('the prompt lists every criterion in order with only verified quotes, and names uncited ones', () => {
    const p = buildAdvicePrompt(c, sample);
    for (const k of c.criteria) assert.ok(p.includes(`${k.id}: ${k.text}`));
    assert.ok(p.includes('quote from note-001: "two words"'));
    assert.ok(p.includes('quotes: none cited'));
    assert.ok(p.indexOf('crit-1:') < p.indexOf('crit-2:'));
    assert.match(ADVISOR_INSTRUCTIONS, /Do not add facts/);
  });

  test('asks with the advice schema and cached instructions, keeps only known criteria, and summarizes doubts against the gate', async () => {
    const captured: { body: unknown }[] = [];
    const provider = messagesProvider({ label: 'meta', baseURL: 'https://example.invalid', authToken: 'k', model: 'muse-wonder-1.0', fetch: fakeTransport({ items: [{ criterion: 'crit-1', verdict: 'partial', why: 'answers frequency, not intensity' }, { criterion: 'crit-9', verdict: 'silent', why: '' }] }, captured) });
    const a = await adviseCase(provider, c, sample, 'low');
    assert.equal(a.error, undefined);
    assert.deepEqual(a.items, [{ criterion: 'crit-1', verdict: 'partial', why: 'answers frequency, not intensity' }]);
    const body = captured[0]!.body as { output_config: { format: { schema: unknown } }; system: { cache_control?: unknown }[]; tools?: unknown };
    assert.deepEqual(body.output_config.format.schema, ADVICE_SCHEMA);
    assert.ok(body.system[0]!.cache_control);
    assert.equal(body.tools, undefined);
    const s = summarizeAdvice([{ ...sample, advice: a }], 'meta', 'muse-wonder-1.0');
    assert.equal(s.cases, 1);
    assert.equal(s.partial, 1);
    assert.equal(s.gateVerifiedAdvisorDoubts, 1);
    assert.equal(s.falsePassesFlagged, 1);
    assert.equal(s.falsePasses, 1);
  });

  test('a bad answer is recorded as an error on the case, never thrown', async () => {
    const provider = messagesProvider({ label: 'meta', baseURL: 'https://example.invalid', authToken: 'k', model: 'muse-wonder-1.0', fetch: fakeTransport('not json') });
    const a = await adviseCase(provider, c, sample, 'low');
    assert.match(a.error!, /not valid JSON/);
    assert.deepEqual(a.items, []);
  });
});

describe('regate', () => {
  test('re-gating a kept run reproduces every inputHash, never changes a verdict between v1.2 and v1.3, and records the re-gate', () => {
    for (const f of files) {
      const parsed = JSON.parse(readFileSync(join(resultsDir, f), 'utf8'));
      const { file, changedVerdicts } = regate(parsed, byId);
      assert.equal(changedVerdicts, 0, f);
      assert.equal(file.results.length, parsed.results.length);
      assert.ok(file.run.regated!.length >= 1);
      assert.deepEqual(file.summary.outcomes, parsed.summary.outcomes, f);
    }
  });
});
