import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CHART_TOOLS, parseEffort, verboseLine, verboseVerdict } from '../src/harness.js';
import { POLICY_STATUS_TOOL } from '../src/chart.js';
import { gateSources, sourcesHash } from '../src/sources.js';
import { litmus } from '../src/litmus.js';
import { generateCases, SEED } from '../src/synthetic/generate.js';

const cases = generateCases(SEED);
const c = cases[0]!;

describe('the why field (item 2: the API returns redacted thinking, so the model states its reason in the tool call)', () => {
  test('read_entry and policy_status require a one-sentence why; list_entries does not', () => {
    const read = CHART_TOOLS.find(t => t.name === 'read_entry')!;
    const props = read.inputSchema['properties'] as Record<string, { type: string; description: string }>;
    assert.equal(props['why']?.type, 'string');
    assert.match(props['why']!.description, /one sentence/i);
    assert.ok((read.inputSchema['required'] as string[]).includes('why'));
    const policyProps = POLICY_STATUS_TOOL.inputSchema['properties'] as Record<string, { type: string }>;
    assert.equal(policyProps['why']?.type, 'string');
    assert.ok((POLICY_STATUS_TOOL.inputSchema['required'] as string[]).includes('why'));
    const list = CHART_TOOLS.find(t => t.name === 'list_entries')!;
    assert.ok(!('why' in (list.inputSchema['properties'] as object)));
  });
});

describe('the sources hash', () => {
  test('is a sha256 over the admissible sources alone, the same for any draft on the case, and not the gate input hash', () => {
    const s = gateSources(c);
    const h = sourcesHash(s);
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(sourcesHash(gateSources(c)), h);
    const g = litmus(s, { warranted: false, reason: 'x', evidence: [], sentences: [] });
    assert.notEqual(g.inputHash, h, 'the input hash covers the draft too, so it differs between two drafts; the sources hash does not');
    assert.notEqual(sourcesHash(gateSources(cases[1]!)), h);
  });
});

describe('verbose lines for the terminal', () => {
  test('one line per tool call: time since start, tool, input, entry id, ok, why; never wider than 140 columns', () => {
    const line = verboseLine({ step: 3, tool: 'read_entry', input: { id: 'note-013', why: 'x'.repeat(500) }, entryId: 'note-013', atMs: 4360, ok: true, why: 'x'.repeat(500) });
    assert.ok(line.length <= 140, `${line.length} columns`);
    assert.match(line, /^\s*4\.4 s\b/);
    assert.ok(line.includes('read_entry'));
    assert.ok(line.includes('note-013'));
    assert.ok(line.includes('ok'));
    const live = verboseLine({ step: 0, tool: 'policy_status', input: { authority: 'cms', code: 'KDOB1', date_of_service: '2026-09-13', why: 'to check freshness' }, atMs: 1562, ok: true, live: true, note: 'cms: criteria last changed 2026-09-27' });
    assert.ok(live.includes('policy_status') && live.includes('KDOB1') && live.includes('live'), live);
    assert.ok(live.length <= 140);
    const failed = verboseLine({ step: 1, tool: 'read_entry', input: { id: 'note-999' }, entryId: 'note-999', atMs: 20, ok: false, note: 'no such entry' });
    assert.ok(failed.includes('failed'));
  });

  test('the verdict block names the verdict, the counts, the gate version, the input hash, and the sources hash', () => {
    const s = gateSources(c);
    const g = litmus(s, { warranted: false, reason: 'no evidence', evidence: [], sentences: [] });
    const lines = verboseVerdict(g, s);
    assert.ok(lines.some(l => /DECLINED/.test(l)));
    assert.ok(lines.some(l => l.includes(g.inputHash)));
    assert.ok(lines.some(l => l.includes(sourcesHash(s))));
    assert.ok(lines.some(l => /v1\.\d/.test(l)));
    for (const l of lines) assert.ok(l.length <= 140, l);
  });
});

describe('effort', () => {
  test('low, medium, and high are accepted; anything else is refused by name', () => {
    assert.equal(parseEffort('low'), 'low');
    assert.equal(parseEffort('medium'), 'medium');
    assert.equal(parseEffort('high'), 'high');
    assert.throws(() => parseEffort('xhigh'), /effort/);
    assert.throws(() => parseEffort('max'), /effort/);
  });
});
