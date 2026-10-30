# litmus-gate

The LITMUS referential gate as a command-line tool and an MCP server. It verifies that every sentence of a drafted appeal quotes the chart entry it cites, verbatim, and that every number, date, code, and side in the sentence has an admissible source: the cited entry, the payer's criteria, the denial's own text, or the stated case facts. It is deterministic, has no model inside, and fails closed: a draft passes only when every sentence verifies and every criterion it claims has verified evidence.

It wraps the same module the study harness and the viewer at [demo.hemeehr.com](https://demo.hemeehr.com) call ([`build/src/litmus.ts`](../src/litmus.ts)), so a verdict from any of the three is the same verdict, with the same SHA-256 of the inputs stamped on it. The gate and its measurements are described in the repository [README](../../README.md); the gate itself is reimplemented from the LITMUS papers ([10.5281/zenodo.21227402](https://doi.org/10.5281/zenodo.21227402), [10.5281/zenodo.21227855](https://doi.org/10.5281/zenodo.21227855)).

What it does not do: it verifies that a statement is in the record, not that the record satisfies the criterion. That reading, and the signature, stay with the physician.

## Command line

From this repository:

```
cd build && npm ci
npm run gate -- check draft.json case.json          # a readable report; exit 0 pass, 1 blocked, 2 declined
npm run gate -- check draft.json case.json --json   # the full gate record, as stored in the result files
npm run gate -- contract                            # the draft schema, the admissible sources, the rules
```

`npm run gate:build` bundles it to `litmus-gate/dist/cli.js` (one file, dependencies external), which is what the `bin` entry and `npx litmus-gate` run.

`draft.json` follows the appeal contract: `warranted`, `reason`, `evidence[]` (criterion, citation, quote), `sentences[]` (text, citation, quote). `case.json` is either a case file as in [`build/synthetic/cases/`](../synthetic/cases/) or the explicit admissible set `{chart, criteria, denial: string[], facts?}`.

## MCP server

Three read-only tools over stdio, plus the contract as a resource at `litmus://contract`.

| Tool | What it does |
| --- | --- |
| `litmus_verify_draft` | The gate over a whole draft: verdict, every sentence's status and reason, every evidence item, which criteria have verified evidence, the input hash. Markdown by default, the full record as structured content with `response_format: "json"`. |
| `litmus_check_sentence` | One sentence, its citation, and its quote, for use while a sentence is being written or repaired: status, the tokens with no source, the entries that would source them. |
| `litmus_contract` | The JSON Schema a draft must satisfy, the shape of the sources, the rules in plain words, and the gate version string. |

Add it to a host that launches stdio servers. Claude Code, from this repository:

```
claude mcp add litmus-gate -- node --import tsx /path/to/your-procedure-is-denied/build/litmus-gate/src/cli.ts mcp
```

or, after `npm run gate:build`, without tsx:

```
claude mcp add litmus-gate -- node /path/to/your-procedure-is-denied/build/litmus-gate/dist/cli.js mcp
```

Any other MCP host takes the same command and arguments in its server configuration (`command: node`, `args: [".../dist/cli.js", "mcp"]`). Nothing leaves the process: the server reads the chart and the draft from the tool call and answers from memory.

The package is on npm as [`litmus-gate`](https://www.npmjs.com/package/litmus-gate) (0.1.0, Apache 2.0, published October 30, 2026), so no checkout is needed:

```
claude mcp add litmus-gate -- npx -y litmus-gate mcp
npx -y litmus-gate check draft.json case.json
```

## Publishing

From the repository, in a shell where `npm whoami` answers (run `npm login` once; it opens the browser):

```
cd build && npm ci
cd litmus-gate && npm publish --access public
```

`prepack` runs the bundle step, so the tarball holds `dist/cli.js` and this README and nothing else (`npm pack --dry-run` shows the three files). The version in `package.json` is the one that ships; bump it before a second publish.

`npm run gate:smoke` starts the built server over stdio as a host would, lists the tools, verifies a stored draft from the study, and exits non-zero if the verdict or the hash differs from the one in the result file.

## On data

The study used synthetic charts only. Pointing this tool at real records is a local operation with no network call, but what you do with its output is a clinical and legal act: a physician reads the draft, the quotes, and the criteria together, and signs or does not.
