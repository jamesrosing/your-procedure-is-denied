#!/usr/bin/env node
// litmus-gate: the LITMUS gate on the command line and as an MCP server.
//
//   litmus-gate check <draft.json> <case.json> [--json]   exit 0 pass, 1 blocked, 2 declined
//   litmus-gate mcp                                        serve the tools over stdio
//   litmus-gate contract                                   print the draft schema and the rules
import { readFileSync } from 'node:fs';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { renderMarkdown, toJson, verifyDraft } from './lib.js';
import { contract, createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

const USAGE = `${SERVER_NAME} ${SERVER_VERSION}
usage:
  litmus-gate check <draft.json> <case.json> [--json]   verify a draft against the record; exit 0 pass, 1 blocked, 2 declined
  litmus-gate mcp                                        serve litmus_verify_draft, litmus_check_sentence, litmus_contract over stdio
  litmus-gate contract                                   print the draft schema, the admissible sources, and the rules
The gate verifies that each statement is in the record, not that the record satisfies the criterion.`;

const EXIT = { pass: 0, blocked: 1, declined: 2 } as const;

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`); }
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === 'mcp') {
    serveStdio(createServer);
    console.error(`${SERVER_NAME} ${SERVER_VERSION} on stdio (gate ${contract().litmus.split(':')[0]})`);
    return -1; // keep the process alive for the transport
  }
  if (cmd === 'contract') { process.stdout.write(JSON.stringify(contract(), null, 2) + '\n'); return 0; }
  if (cmd === 'check') {
    const json = rest.includes('--json');
    const files = rest.filter(a => !a.startsWith('--'));
    if (files.length !== 2) { console.error(USAGE); return 64; }
    const [draftPath, casePath] = files as [string, string];
    const out = verifyDraft(readJson(casePath), readJson(draftPath));
    if (!out.ok) { console.error(out.error); return 65; }
    process.stdout.write((json ? toJson(out.result) : renderMarkdown(out.result)) + '\n');
    return EXIT[out.result.verdict];
  }
  console.error(USAGE);
  return 64;
}

try {
  const code = main(process.argv.slice(2));
  if (code >= 0) process.exit(code);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(70);
}
