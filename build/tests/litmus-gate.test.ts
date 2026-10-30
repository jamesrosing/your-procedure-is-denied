// The gate as a tool: the CLI and the MCP server wrap the same litmus() the
// harness and the viewer call, so a verdict from any of the three is the same
// verdict, hash included.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { normalizeSources, verifyDraft, renderMarkdown } from '../litmus-gate/src/lib.js';
import { createServer } from '../litmus-gate/src/server.js';
import { gateSources } from '../src/sources.js';
import { LITMUS_VERSION } from '../src/litmus.js';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, '..');
const casesDir = join(build, 'synthetic', 'cases');
const caseJson = (id: string): unknown => JSON.parse(readFileSync(join(casesDir, `${id}.json`), 'utf8'));
const resultsFile = JSON.parse(readFileSync(join(build, 'results', 'meta-muse-spark-1.3-low-2026-10-27T08-17-14-218Z.json'), 'utf8')) as {
  results: { caseId: string; draft?: { warranted: boolean; reason?: string; evidence: unknown[]; sentences: unknown[] }; gate?: { verdict: string; inputHash: string } }[];
};
const stored = resultsFile.results.find(r => r.caseId === 'case-001' && r.gate?.verdict === 'pass')!;

describe('litmus-gate library', () => {
  test('a synthetic case file and the explicit admissible set normalize to the same sources', () => {
    const c = caseJson('case-001') as Parameters<typeof gateSources>[0];
    const fromCase = normalizeSources(c);
    const fromSources = normalizeSources(gateSources(c));
    assert.deepEqual(fromCase, gateSources(c));
    assert.deepEqual(fromSources, gateSources(c));
  });

  test('reproduces every stored verdict and input hash of a kept run', () => {
    let checked = 0;
    for (const r of resultsFile.results) {
      if (!r.draft || !r.gate) continue;
      const out = verifyDraft(caseJson(r.caseId), r.draft);
      assert.ok(out.ok, `${r.caseId}: ${out.ok ? '' : out.error}`);
      if (!out.ok) continue;
      assert.equal(out.result.verdict, r.gate.verdict, r.caseId);
      assert.equal(out.result.inputHash, r.gate.inputHash, r.caseId);
      checked += 1;
    }
    assert.ok(checked >= 45, `checked ${checked}`);
  });

  test('a draft that is not the contract is an error the caller can read, never a verdict', () => {
    const out = verifyDraft(caseJson('case-001'), { sentences: 'no' });
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /contract/);
  });

  test('the markdown rendering names the verdict, the gate version, and every sentence status', () => {
    const out = verifyDraft(caseJson('case-001'), stored.draft);
    assert.ok(out.ok);
    if (!out.ok) return;
    const md = renderMarkdown(out.result);
    assert.match(md, /^# LITMUS gate: PASS/);
    assert.ok(md.includes('v1.4'));
    assert.equal((md.match(/\[verified\]/g) ?? []).length, out.result.counts.verified + out.result.counts.evidenceVerified);
  });
});

describe('litmus-gate MCP server', () => {
  async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
    const handler = createMcpHandler(createServer);
    const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), { fetch: (url, init) => handler.fetch(new Request(url, init)) });
    const client = new Client({ name: 'test', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } });
    await client.connect(transport);
    return { client, close: async () => { await client.close(); await handler.close(); } };
  }

  test('lists the three tools', async () => {
    const { client, close } = await connect();
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map(t => t.name).sort(), ['litmus_check_sentence', 'litmus_contract', 'litmus_verify_draft']);
      assert.ok(tools.every(t => t.annotations?.readOnlyHint === true));
    } finally { await close(); }
  });

  test('litmus_verify_draft returns the stored verdict and hash as structured content, and markdown by default', async () => {
    const { client, close } = await connect();
    try {
      const json = await client.callTool({ name: 'litmus_verify_draft', arguments: { sources: caseJson('case-001'), draft: stored.draft, response_format: 'json' } });
      assert.ok(!json.isError, JSON.stringify(json.content));
      const sc = json.structuredContent as { verdict: string; inputHash: string; litmus: string };
      assert.equal(sc.verdict, 'pass');
      assert.equal(sc.inputHash, stored.gate!.inputHash);
      assert.equal(sc.litmus, LITMUS_VERSION);
      const md = await client.callTool({ name: 'litmus_verify_draft', arguments: { sources: caseJson('case-001'), draft: stored.draft } });
      const text = (md.content as { type: string; text: string }[])[0]!.text;
      assert.match(text, /^# LITMUS gate: PASS/);
    } finally { await close(); }
  });

  test('litmus_check_sentence refutes an invented number and names the token', async () => {
    const { client, close } = await connect();
    try {
      const c = caseJson('case-001') as { chart: { id: string; text: string }[] };
      const entry = c.chart.find(e => /\d/.test(e.text))!;
      const words = entry.text.split(' ').slice(0, 4).join(' ');
      const res = await client.callTool({ name: 'litmus_check_sentence', arguments: { sources: c, sentence: { text: `The record shows 987654 units, ${words}.`, citation: entry.id, quote: words } } });
      assert.ok(!res.isError, JSON.stringify(res.content));
      const sc = res.structuredContent as { status: string; reason: string; missing?: string[] };
      assert.equal(sc.status, 'refuted');
      assert.ok(sc.missing?.includes('987654'), sc.reason);
    } finally { await close(); }
  });

  test('a draft off the contract is a tool error the model can read, and litmus_contract carries the schema', async () => {
    const { client, close } = await connect();
    try {
      const bad = await client.callTool({ name: 'litmus_verify_draft', arguments: { sources: caseJson('case-001'), draft: { warranted: 'yes' } } });
      assert.equal(bad.isError, true);
      const contract = await client.callTool({ name: 'litmus_contract', arguments: {} });
      const sc = contract.structuredContent as { litmus: string; appealSchema: { required: string[] } };
      assert.equal(sc.litmus, LITMUS_VERSION);
      assert.deepEqual(sc.appealSchema.required, ['warranted', 'reason', 'evidence', 'sentences']);
    } finally { await close(); }
  });
});

describe('litmus-gate CLI', () => {
  const cli = join(build, 'litmus-gate', 'src', 'cli.ts');
  const run = (args: string[]): { code: number; out: string } => {
    try {
      return { code: 0, out: execFileSync(process.execPath, ['--import', 'tsx', cli, ...args], { cwd: build, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
  };

  test('check exits 0 on PASS, 1 on BLOCKED, and 64 on usage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'litmus-gate-'));
    const draftPath = join(dir, 'draft.json');
    writeFileSync(draftPath, JSON.stringify(stored.draft));
    const pass = run(['check', draftPath, join(casesDir, 'case-001.json')]);
    assert.equal(pass.code, 0, pass.out);
    assert.match(pass.out, /PASS/);
    const draft = stored.draft!;
    const corrupted = { ...draft, sentences: [{ ...(draft.sentences[0] as object), text: 'The patient walked 123456 feet.' }, ...draft.sentences.slice(1)] };
    writeFileSync(draftPath, JSON.stringify(corrupted));
    const blocked = run(['check', draftPath, join(casesDir, 'case-001.json'), '--json']);
    assert.equal(blocked.code, 1, blocked.out);
    const parsed = JSON.parse(blocked.out) as { verdict: string; sentences: { status: string }[] };
    assert.equal(parsed.verdict, 'blocked');
    assert.equal(parsed.sentences[0]?.status, 'refuted');
    assert.equal(run(['check']).code, 64);
    assert.ok(readdirSync(dir).length === 1);
  });
});
