# New work: Meta Global AI Developer Hackathon

Event window: October 26 to November 4, 2026. This file is the ledger of everything built during the event, kept so that judges can tell new work from prior work without reading git history.

## How the repository separates new from prior work

- This repository contains only work done during the event. The pre-existing pieces it builds on are described below and are not included: the event rules ask for a standalone extract, with the existing codebase kept out.
- The git tag `hackathon-start` marks the last commit before event code began: the README, figures, community files, and the patient-data check, all prose and tooling written on October 26 before any model was called.
- Tags named `event-NN-<milestone>` mark each milestone of event work after that point (`event-01-synthetic-set`, `event-02-litmus-gate`, and so on), so the new work can be checked out and judged piece by piece.
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

- `build/src/provider.ts`, `schema.ts`, `cost.ts` (Oct 26): the provider seam. One `propose` interface over the Messages protocol (Meta Model API and Baseten through the Anthropic SDK with the base URL swapped) and over OpenAI-compatible hosts (Fireworks, fallback). Sends effort, the flat JSON Schema, and a cache marker; never sends the fields the Meta endpoint rejects. Normalizes usage (input, cached input, output, thinking), prices the call, and validates the draft: `warranted`, optional `reason`, and `sentences[]` of `{text, citation}` where every citation is a chart entry id. Tests in `build/tests/` run against a stubbed transport.

- `build/src/synthetic/` and `build/synthetic/cases/` (Oct 26 to 27): the 50-case synthetic denial set. A seeded generator writes charts in dictation voice from 18 templates across the categories where denial dollars concentrate: post-acute care in Medicare Advantage (rehabilitation and skilled nursing stays), inpatient level of care, oncology drugs, radiation, and genomic testing, vascular and cardiac procedures, spine and joint surgery, wound care, biologics, bariatric and plastic surgery. Six fictional payers, ten CARC codes, three care settings, and an approximate dollars-at-stake figure per case. Each case has a grading key: 30 warranted, 20 not (criterion absent, near-miss, wrong remedy, plan exclusion). Tests pin the composition, the labels, and that the committed files match the generator; no patient identifiers appear anywhere in the set. The first cut (Oct 26) was plastic surgery only; it was replaced on Oct 27 so the benchmark measures the denials that matter most.

- `build/src/schema.ts` v2 (Oct 27): every sentence and every piece of evidence carries a verbatim quote from the cited chart entry, and the draft maps each payer criterion to its evidence. Parsing tolerates null optionals and blank placeholders; citation resolution moved to the gate so a hallucinated id is counted, not hidden. `build/src/cost.ts` prices cache writes (at the input rate, since Meta publishes no write price) and refuses non-numeric usage. `build/src/provider.ts` sends the shared instructions as a cached system block and the chart as a separate one, and validates usage before pricing.
- `build/src/litmus.ts` (Oct 27): the LITMUS gate, written from the two Zenodo papers, not copied from writ. Deterministic, external to the model, fail-closed. Per sentence: resolve the citation; require the quote verbatim in that entry (whitespace, case, and quote glyphs normalized, nothing else); require every number, date, code, and anatomical laterality in the sentence to appear in the quote, the payer criteria, the denial, or the case facts. Statuses are verified, unresolved, refuted, or error, and only this module can mint verified (a private type brand). A warranted draft is blocked when any sentence is not verified, any criterion lacks verified evidence, or there are no cited sentences; an errored check blocks and is flagged apart from a refutation. Every result carries a SHA-256 of its inputs. No resemblance threshold and no keyword list: the evidence is the clinician's own words.
- `build/src/harness.ts` (Oct 27): runs cases through a provider and the gate with a concurrency cap (default 8), effort low, scores each against the grading key (correct pass, correct decline, blocked, missed, false pass, error), and writes a results file with pass and agreement rates, ungrounded sentences caught, check errors, latency percentiles, input, cached, cache-write, output and thinking tokens, cost per case, dollars at stake defended, and citation precision against the key. 33 new tests across these modules run against fakes; no network.

Still to come: the model runs, and the agentic step.

## Commit ledger

Every commit made during the event, oldest first. A commit's hash is recorded by the commit that follows it.

| Date (PT) | Commit | What it added |
| --- | --- | --- |
| 2026-10-26 | 79e5e21 | Hackathon scaffolding: NEW-WORK.md, /build, .gitignore fixes so /build is tracked and ROADMAP.md never is |
| 2026-10-26 | 4685260 | First call to muse-spark-1.3 on the Meta Model API through the Anthropic SDK base-URL swap (`build/src/test-call.ts`), with the /build package set up for TypeScript |
| 2026-10-26 | 8082dc1 | Probe of reasoning-token spend by effort, JSON Schema output, and prompt caching on muse-spark-1.3 (`build/src/probe.ts`), synthetic chart only |
| 2026-10-26 | ee1cab6 | Ignore Windows Zone.Identifier marker files |
| 2026-10-26 | 3e57e4c | Provider adapter (`build/src/provider.ts`), appeal JSON Schema contract and validator (`build/src/schema.ts`), price table (`build/src/cost.ts`), 12 unit tests with a stubbed transport, and a live smoke test through Meta and Baseten (`build/src/smoke.ts`) |
| 2026-10-26 | 4fba43c | Synthetic denial set, first cut: generator (`build/src/synthetic/`), 50 committed cases with grading keys (`build/synthetic/cases/`), README, and 9 tests |
| 2026-10-27 | 3589e3a | Work-in-progress checkpoint: tests for the v2 appeal contract (quotes per sentence, evidence per criterion), cache-write pricing, provider system blocks, and the LITMUS gate (`build/tests/litmus.test.ts`); start of the generator refactor toward a cross-specialty case mix (`build/src/synthetic/template.ts`, new case types) |
| 2026-10-27 | 20455d3 | Synthetic denial set, cross-specialty: 18 templates in `build/src/synthetic/templates/` spanning post-acute, inpatient, oncology, vascular, cardiology, spine, orthopedics, wound care, biologics, bariatric, and plastic surgery; 50 regenerated cases with category, setting, and stakes; README rewritten. Tag `event-01-synthetic-set` |
| 2026-10-27 | pending | Appeal contract v2 with quotes and per-criterion evidence (`build/src/schema.ts`), cache-write pricing (`build/src/cost.ts`), provider system blocks and usage validation (`build/src/provider.ts`), the LITMUS gate (`build/src/litmus.ts`), the evaluation harness (`build/src/harness.ts`), smoke test updated; 64 tests. Tag `event-02-litmus-gate` |
