// Self-check over stdio: starts the built CLI as an MCP server the way a host
// would, lists the tools, verifies a stored draft, and exits non-zero on any
// difference. Run with: npm run gate:smoke
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, '..', '..');
const file = JSON.parse(readFileSync(join(build, 'results', 'meta-muse-spark-1.3-low-2026-10-27T08-17-14-218Z.json'), 'utf8')) as { results: { caseId: string; draft?: unknown; gate?: { verdict: string; inputHash: string } }[] };
const r = file.results.find(x => x.caseId === 'case-001')!;
const sources = JSON.parse(readFileSync(join(build, 'synthetic', 'cases', 'case-001.json'), 'utf8')) as unknown;

const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(here, '..', 'dist', 'cli.js'), 'mcp'], env: getDefaultEnvironment() }));
const { tools } = await client.listTools();
assert.deepEqual(tools.map(t => t.name).sort(), ['litmus_check_sentence', 'litmus_contract', 'litmus_verify_draft']);
const res = await client.callTool({ name: 'litmus_verify_draft', arguments: { sources, draft: r.draft, response_format: 'json' } });
assert.ok(!res.isError, JSON.stringify(res.content));
const sc = res.structuredContent as { verdict: string; inputHash: string };
assert.equal(sc.verdict, r.gate!.verdict);
assert.equal(sc.inputHash, r.gate!.inputHash);
const bad = await client.callTool({ name: 'litmus_verify_draft', arguments: { sources, draft: { warranted: 'yes' } } });
assert.equal(bad.isError, true);
await client.close();
console.error('litmus-gate smoke passed: stdio server reproduces the stored verdict and hash');
