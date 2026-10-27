# New work: Meta Global AI Developer Hackathon

Event window: October 26 to November 4, 2026. This file is the ledger of everything built during the event, kept so that judges can tell new work from prior work without reading git history.

## How the repository separates new from prior work

- This repository contains only work done during the event. The pre-existing pieces it builds on are described below and are not included: the event rules ask for a standalone extract, with the existing codebase kept out.
- The git tag `hackathon-start` marks the last commit before event code began: the README, figures, community files, and the patient-data check, all prose and tooling written on October 26 before any model was called.
- `/build` holds every line of hackathon code.
- Every commit after the tag appears in the ledger below.

## What this builds on (pre-existing, not included)

- **heme**, the author's electronic health record, where the chart lives and the denial arrives. Private.
- **writ**, the author's denial and appeal recovery engine, which holds the production LITMUS gate: a fail-closed check that stamps a citation verified only after it resolves to its source, and blocks any packet that is not fully verified. Private. First written July 2026.
- **LITMUS**, the published standard the gate implements: [Litmus: The Admissible Set](https://doi.org/10.5281/zenodo.21227402) and its [architecture companion](https://doi.org/10.5281/zenodo.21227855), both July 2026, CC BY 4.0.

The hackathon work reimplements the LITMUS gate contract in `/build` against synthetic charts, written during the event from the published papers, so that the verifier the proposers run behind is itself inspectable here.

## What is new

- `build/src/test-call.ts` (Oct 26): one call to muse-spark-1.3 through the Anthropic SDK with the base URL swapped to the Meta Model API. Confirms the endpoint, the effort field, and where reasoning tokens are reported.
- `build/src/probe.ts` (Oct 26): a synthetic 40-entry chart and one denial, run at three effort levels with a flat JSON Schema output contract. Measured thinking tokens per effort, confirmed the schema is honored, and found that caching needs an explicit cache marker.

Still to come: the provider adapter, the JSON Schema output contract, the synthetic denial set, the evaluation harness, the LITMUS gate reimplementation, the model runs, and the agentic step.

## Commit ledger

Every commit made during the event, oldest first. A commit's hash is recorded by the commit that follows it.

| Date (PT) | Commit | What it added |
| --- | --- | --- |
| 2026-10-26 | 79e5e21 | Hackathon scaffolding: NEW-WORK.md, /build, .gitignore fixes so /build is tracked and ROADMAP.md never is |
| 2026-10-26 | 4685260 | First call to muse-spark-1.3 on the Meta Model API through the Anthropic SDK base-URL swap (`build/src/test-call.ts`), with the /build package set up for TypeScript |
| 2026-10-26 | 8082dc1 | Probe of reasoning-token spend by effort, JSON Schema output, and prompt caching on muse-spark-1.3 (`build/src/probe.ts`), synthetic chart only |
| 2026-10-26 | pending | Ignore Windows Zone.Identifier marker files |
