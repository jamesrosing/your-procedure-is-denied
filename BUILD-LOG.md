# Build log

Generated 2026-10-30 00:20 UTC by `build/scripts/build-log.ts` (`npm run log`) from the git history, the ledger in [NEW-WORK.md](NEW-WORK.md), the gate source at each commit, and the run headers inside `build/results/`. Nothing here is typed by hand; regenerate it after every commit that should appear.

## Before the event

14 commits from 2026-10-26 01:10 to 2026-10-26 14:03, ending at the tag `hackathon-start` (2632b57): the landing page, figures, and the written case. No model code, no synthetic set, no gate. Everything below is event work.

## Runs kept in `build/results/`

Every file carries its own header: model, mode, gate version at the run, any later re-gate (the gate is a pure function of its inputs, so a re-gate changes labels, never inputs), and the advisor pass if one was run. Superseded or discarded runs are not in the directory; they are listed in the next section from the ledger.

| Started (UTC) | Model | Mode | Agreed | Blocked | False pass | Failed | Gate at run | Re-gated to | Advisor |
| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 2026-10-27 08:17 | muse-spark-1.3 (meta) | chart in prompt | 50 of 50 | 0 | 0 | 0 | v1 | v1.4 |  |
| 2026-10-27 08:19 | muse-wonder-1.0 (meta) | chart in prompt | 49 of 50 | 0 | 0 | 0 | v1 | v1.4 |  |
| 2026-10-27 08:20 | meta-models/muse-spark-open (baseten) | chart in prompt | 49 of 50 | 1 | 0 | 0 | v1 | v1.4 |  |
| 2026-10-28 03:20 | muse-spark-1.3 (meta) | agentic | 50 of 50 | 0 | 0 | 0 | v1.1 | v1.4 |  |
| 2026-10-28 03:24 | muse-wonder-1.0 (meta) | agentic | 49 of 50 | 1 | 0 | 0 | v1.1 | v1.4 |  |
| 2026-10-28 03:24 | meta-models/muse-spark-open (baseten) | agentic | 48 of 50 | 1 | 0 | 1 | v1.1 | v1.4 |  |
| 2026-10-28 06:48 | muse-spark-1.3 (meta) | agentic, live CHART | 49 of 50 | 1 | 0 | 0 | v1.2 | v1.4 |  |
| 2026-10-28 06:51 | muse-wonder-1.0 (meta) | agentic, live CHART | 50 of 50 | 0 | 0 | 0 | v1.2 | v1.4 |  |
| 2026-10-28 07:13 | meta-models/muse-spark-open (baseten) | agentic, live CHART | 45 of 50 | 4 | 1 | 0 | v1.2 | v1.4 |  |

## Runs superseded or discarded

From the ledger rows that say so. A run is superseded when a gate defect it exposed was fixed and the run repeated; discarded when the transport failed before the model answered.

- 2026-10-27 24a3949: First full 50-case run on muse-spark-1.3, effort low, concurrency 8: 42 of 50 agreed with the grading key, 5 blocked, 0 check errors, $0.64. Reviewing the 8 disagreements showed two grading-key defects in the synthetic set (below); that results file is superseded and was removed in the next commit
- 2026-10-27 8ab33f1: Grading-key fixes found by the first run: the rehabilitation charts documented only two physician visits in 14 days against a criterion of three per week (now eight visits), and the sepsis case labeled 'absent' still carried lactate and hypotension values in later notes (now none). Five cases regenerated, the other 45 byte-identical. Rerun of all 50: 47 of 50 agreed, 3 blocked, 0 check errors; superseded by the next row
- 2026-10-27 d2afefb: Three-model runs on the final synthetic set (`build/results/`): muse-spark-1.3, muse-wonder-1.0, and Muse Spark Open on Baseten, 50 cases each, effort low, concurrency 8. One more grading-key leak fixed first, found by the Spark Open run: the fusion case labeled 'absent' had a follow-up note that still mentioned the slip and the motion on the films (case-045 regenerated, the other 49 byte-identical). Earlier result files were superseded and removed. Tag `event-04-three-model-runs`
- 2026-10-27 e656833: Final three-model runs on the corrected set (`build/results/`, one file per model): muse-spark-1.3 50 of 50, muse-wonder-1.0 49 of 50, Muse Spark Open on Baseten 49 of 50. Earlier result files removed as superseded
- 2026-10-28 d57cf6c: The agentic proposer: `proposeAgentic` in `build/src/provider.ts` loops on tool_use until end_turn, feeding each tool result back, summing usage across turns, and recording a trace of every tool call with its timestamp (tool_choice left at its default; nothing forbidden sent). `build/src/harness.ts --agentic` gives the model a chart index (id, date, kind, opening words) and the tools `list_entries` and `read_entry`, records `trace[]` and reading statistics per case (entries read of chart size, grading-key entries read), and the summary gains per-case means; the gate is unchanged. Gate fix found by the first agentic run: compound number words (eighty-one, ninety-nine) are now one number, not two; the first run (49 of 50, one draft blocked on exactly that) was superseded and removed. Final agentic run on muse-spark-1.3 (`build/results/meta-muse-spark-1.3-low-agentic-2026-10-28T03-20-47-965Z.json`): 50 of 50, 265 sentences verified, 9.6 of 25.6 entries read per case, 96 percent of key entries read, $0.85. README fourth row; 88 tests; the viewer replays the trace. Vercel deploy config (`vercel.json`, `.vercelignore`) for the viewer. Tag `event-05-agentic`
- 2026-10-28 a86b063: Harness reads the CHART key from `CHART_API_KEY` or `CHART_CUSTOM_TOKEN`. First live probe (case-038, muse-spark-1.3): the model called `policy_status` right after the index with the correct code and date, CHART answered 401 because the token in `.env` was not a CHART key, the model proceeded on the given criteria and passed the gate; results file discarded as a failed-lookup probe
- 2026-10-28 b255222: First successful live CHART lookup. The coverage index shape is now known (`authorities[].last_changed`, `oldest_check`, ISO instants) and `chart.ts` reads it, trimming instants to the day; test fixture is the live shape; harness also accepts `CHART_VERIFY_KEY`. Probe on case-038 (muse-spark-1.3): `policy_status` was the first tool call, answered "cms: criteria last changed 2026-09-27, last checked 2026-09-28", then six entries read, passed the gate, and the draft carried no CHART fact. Probe file discarded; the 50-case run follows
- 2026-10-28 8db4fc3: First 50-case run with the live tool (muse-spark-1.3) read and superseded, not kept: 47 of 50, three blocks. Two were the gate catching a warranted answer on an absent case (case-023 with no evidence at all; case-044 with a placeholder sentence "Dummy." and no evidence for the sepsis criterion). One was a gate defect: "one hundred ten feet" and "two hundred feet" read as bare 100, refuting a true sentence (case-032). Gate v1.2 reads hundreds as one number, with a test. The run made about 50 metered CHART queries because the memo was keyed on code and date; the live index returns the same authority table whatever the code, so the memo is now keyed on the authority alone, and printed codes like "MS-DRG 871" or "CMG 0104" are normalized instead of rejected (six lookups had been refused locally). 97 tests. Rerun follows
- 2026-10-28 5b133e0: Live CHART run on muse-wonder-1.0: 50 of 50, 229 sentences, p50 9.0 s, $0.054 per case, 7.9 of 25.6 entries read, 95% of key entries, `policy_status` first in all 50 cases, one metered query and 49 from memory, no CHART fact in any draft. Eighth README row. The same run on Muse Spark Open failed on all 50 with Baseten HTTP 402 (payment status), file discarded, retry once credit is added
- 2026-10-28 e6600f2: Live CHART run on Muse Spark Open (Baseten, concurrency 3 after a run at 8 lost 16 cases to HTTP 429 and was discarded): 45 of 50, 245 sentences, p50 7.3 s, $0.016 per case, 9.3 of 25.6 entries read, 97% of key entries, `policy_status` in all 50 cases (40 first), one metered query. Four blocks read: each a true sentence citing one entry for a fact in another (antianginal count, 150-foot goal vs 160-foot discharge note, "bilateral", "8 weeks of PT"), gate right by its one-citation rule. One false pass kept and reported: case-023, absent (no intensity documentation), model cited "plan 5 to 6 days a week" for the 3-hours-a-day criterion and the gate passed it, the referential limit from the LITMUS papers now on the public scoreboard. Ninth README row and paragraph. Viewer scoreboard gains a "Gate passed, key says no" column when any run has one; asset links v8. 98 tests
- 2026-10-28 a60c2a3: Build log: `build/scripts/build-log.ts` (`npm run log`) generates `BUILD-LOG.md` from the git history since `hackathon-start`, the ledger rows matched by hash, the gate version at every commit that changed it, and the run headers in `build/results/` (model, mode, gate at run, re-gates, advisor), plus the kept and superseded runs; it also rewrites a Build log section of the README between markers. `.github/workflows/build-log.yml` reruns it after every push to main and commits the two generated files as github-actions[bot] with no ledger row (the ledger says so). README navigation links the section

## Gate versions

Each commit that changed the version string in `build/src/litmus.ts`. The gate is deterministic; its version is stamped into every verdict.

- 2026-10-27 00:32 25583ac: build/src/litmus.ts v1 (2026-10-27): exact-quote referential gate from the LITMUS papers
- 2026-10-27 20:22 d57cf6c: build/src/litmus.ts v1.1 (2026-10-28): exact-quote referential gate from the LITMUS papers; compound number words read as one number
- 2026-10-27 23:48 8db4fc3: build/src/litmus.ts v1.2 (2026-10-28): exact-quote referential gate from the LITMUS papers; compound number words, hundreds included, read as one number
- 2026-10-28 00:49 2b86e41: build/src/litmus.ts v1.3 (2026-10-28): exact-quote referential gate from the LITMUS papers; compound number words read as one number; a sentence whose unsourced tokens all live in another chart entry is returned as needs-citation naming that entry, still blocked
- 2026-10-28 21:52 3b0a483: build/src/litmus.ts v1.4 (2026-10-28): exact-quote referential gate from the LITMUS papers; compound number words read as one number; a sentence whose unsourced tokens all live in another chart entry is returned as needs-citation naming that entry, still blocked; a side (left or right) is a hard token wherever it names a side, not only before a fixed anatomy list

## Commits since `hackathon-start`

Oldest first. Each entry: hash, local time, subject, tags, results files added or removed, and the ledger row written with the commit.

### 79e5e21 · 2026-10-26 20:38 · Add hackathon scaffolding: NEW-WORK.md and /build

Hackathon scaffolding: NEW-WORK.md, /build, .gitignore fixes so /build is tracked and ROADMAP.md never is

### 4685260 · 2026-10-26 20:38 · First test call to muse-spark-1.3 through the Anthropic SDK base-URL swap

First call to muse-spark-1.3 on the Meta Model API through the Anthropic SDK base-URL swap (`build/src/test-call.ts`), with the /build package set up for TypeScript

### 8082dc1 · 2026-10-26 20:38 · Probe reasoning tokens by effort, JSON Schema output, and prompt caching on muse-spark-1.3

Probe of reasoning-token spend by effort, JSON Schema output, and prompt caching on muse-spark-1.3 (`build/src/probe.ts`), synthetic chart only

### ee1cab6 · 2026-10-26 20:38 · Ignore Windows Zone.Identifier marker files

Ignore Windows Zone.Identifier marker files

### 3e57e4c · 2026-10-26 21:08 · Provider adapter, appeal JSON Schema contract, price table, tests, and live smoke test

Provider adapter (`build/src/provider.ts`), appeal JSON Schema contract and validator (`build/src/schema.ts`), price table (`build/src/cost.ts`), 12 unit tests with a stubbed transport, and a live smoke test through Meta and Baseten (`build/src/smoke.ts`)

### 4fba43c · 2026-10-26 23:55 · Synthetic denial set: seeded generator, 50 cases with grading keys, README, and tests

Synthetic denial set, first cut: generator (`build/src/synthetic/`), 50 committed cases with grading keys (`build/synthetic/cases/`), README, and 9 tests

### 3589e3a · 2026-10-27 00:07 · WIP checkpoint: v2 contract and LITMUS gate tests, start of cross-specialty generator refactor

Work-in-progress checkpoint: tests for the v2 appeal contract (quotes per sentence, evidence per criterion), cache-write pricing, provider system blocks, and the LITMUS gate (`build/tests/litmus.test.ts`); start of the generator refactor toward a cross-specialty case mix (`build/src/synthetic/template.ts`, new case types)

### 20455d3 · 2026-10-27 00:25 · Synthetic denial set, cross-specialty: 18 templates across the high-dollar denial categories, 50 regenerated cases with stakes, README · tag event-01-synthetic-set

Synthetic denial set, cross-specialty: 18 templates in `build/src/synthetic/templates/` spanning post-acute, inpatient, oncology, vascular, cardiology, spine, orthopedics, wound care, biologics, bariatric, and plastic surgery; 50 regenerated cases with category, setting, and stakes; README rewritten. Tag `event-01-synthetic-set`

### 25583ac · 2026-10-27 00:32 · LITMUS gate, appeal contract v2 with verbatim quotes, evaluation harness, cache-write pricing · tag event-02-litmus-gate

Appeal contract v2 with quotes and per-criterion evidence (`build/src/schema.ts`), cache-write pricing (`build/src/cost.ts`), provider system blocks and usage validation (`build/src/provider.ts`), the LITMUS gate (`build/src/litmus.ts`), the evaluation harness (`build/src/harness.ts`), smoke test updated; 64 tests. Tag `event-02-litmus-gate`

### 63e8132 · 2026-10-27 00:36 · First live pass through muse-spark-1.3 and the gate; shared prompt block sized for the prompt cache · tag event-03-first-live-pass

Results added: `meta-muse-spark-1.3-low-2026-10-27T07-32-49-403Z.json`.
First live pass: one denial end to end through muse-spark-1.3 and the gate (`build/results/`), shared prompt block extended to clear the cache minimum, test pinning its size. Tag `event-03-first-live-pass`

### 24a3949 · 2026-10-27 00:40 · First full 50-case run on muse-spark-1.3 at effort low

Results added: `meta-muse-spark-1.3-low-2026-10-27T07-37-56-236Z.json`.
First full 50-case run on muse-spark-1.3, effort low, concurrency 8: 42 of 50 agreed with the grading key, 5 blocked, 0 check errors, $0.64. Reviewing the 8 disagreements showed two grading-key defects in the synthetic set (below); that results file is superseded and was removed in the next commit

### 8ab33f1 · 2026-10-27 00:44 · Fix two grading-key defects found by the first run; rerun all 50 on muse-spark-1.3

Grading-key fixes found by the first run: the rehabilitation charts documented only two physician visits in 14 days against a criterion of three per week (now eight visits), and the sepsis case labeled 'absent' still carried lactate and hypotension values in later notes (now none). Five cases regenerated, the other 45 byte-identical. Rerun of all 50: 47 of 50 agreed, 3 blocked, 0 check errors; superseded by the next row

### eb97a52 · 2026-10-27 00:50 · Widen the gate's fact sourcing to the whole cited entry; rerun all 50 on muse-spark-1.3

Gate widened on the author's direction: a sentence's numbers, dates, codes, and laterality may come from anywhere in the cited entry, not only the quoted span, and a single substantive word is an acceptable quote. The gate exists to catch invented facts, not to grade quoting form against a payer's vocabulary. All three remaining blocks had been facts present in the cited entry. Rerun of all 50 on muse-spark-1.3 (`build/results/meta-muse-spark-1.3-low-2026-10-27T07-48-28-494Z.json`): 50 of 50 agree, 244 sentences verified, 0 blocked, 0 check errors, $0.67

### 3930e37 · 2026-10-27 00:53 · README header: physician appeal bar as a thin line with end ticks

README header figures: the physician-appeal bar drawn as a thin line with end ticks, per the author's design, in both the dark and light variants (`assets/header-dark.svg`, `assets/header-light.svg`)

### fd870f2 · 2026-10-27 01:08 · Ignore browser tool scratch directory

Ignore the browser tool's scratch directory

### d2afefb · 2026-10-27 01:15 · Three-model runs on the final synthetic set; fix one more grading-key leak in the fusion absent case · tag event-04-three-model-runs

Results added: `baseten-meta-models_muse-spark-open-low-2026-10-27T08-14-33-191Z.json`, `meta-muse-wonder-1.0-low-2026-10-27T08-13-19-002Z.json`.
Results removed: `meta-muse-spark-1.3-low-2026-10-27T07-32-49-403Z.json`.
Three-model runs on the final synthetic set (`build/results/`): muse-spark-1.3, muse-wonder-1.0, and Muse Spark Open on Baseten, 50 cases each, effort low, concurrency 8. One more grading-key leak fixed first, found by the Spark Open run: the fusion case labeled 'absent' had a follow-up note that still mentioned the slip and the motion on the films (case-045 regenerated, the other 49 byte-identical). Earlier result files were superseded and removed. Tag `event-04-three-model-runs`

### ba77feb · 2026-10-27 01:16 · PHI check: ignore digit runs embedded in hex hashes

`scripts/phi_check.py`: a ten-digit run inside a longer hex string (a SHA-256 hash in a results file) is no longer reported as a possible NPI; test added. Commits are now gated on the check's exit status rather than a piped tail

### d9a2ed0 · 2026-10-27 01:17 · Carotid cases: surgery within 14 days of the index event, as the criterion requires

Carotid cases: the TIA was 12 days before the clinic visit and surgery 10 to 13 days after it, so 'within 14 days of the index event' was never true; muse-wonder-1.0 declined it correctly. Timing fixed, two cases regenerated, the other 48 byte-identical

### e656833 · 2026-10-27 01:21 · Final three-model runs on the corrected synthetic set

Final three-model runs on the corrected set (`build/results/`, one file per model): muse-spark-1.3 50 of 50, muse-wonder-1.0 49 of 50, Muse Spark Open on Baseten 49 of 50. Earlier result files removed as superseded

### 071f0dc · 2026-10-27 09:40 · README: results for the three Meta models, the disagreements, and the limitations

README: results table for the three Meta models from the October 27 runs, the two disagreements read and explained, the four grading-key defects the models found, and the limitations (referential limit, no derivation, unchecked pronouns, small counts, synthetic data). `build/README.md` contents list brought up to date with the gate, harness, and results

### 27d0f25 · 2026-10-27 20:15 · Judge-facing viewer: static replay of a results file, one case at a time, with the scoreboard

The judge-facing viewer (`build/viewer/`): one static page, no framework, no server, that loads any results file and replays one case at a time with play, pause, step, and a case picker. Three panels: the chart index (every entry dim, lighting and sliding open as it is read, unread entries staying dim), the payer criteria as a checklist filling with verbatim quotes, and the draft sentence by sentence with the gate's stamp and reason; blocked drafts turn the panel red and name the sentence, declined cases show the empty criterion and the model's reason. Counters: entries read of total, sentences verified, cost, elapsed. A scoreboard screen renders every results file as the README table. Replay logic is pure functions in `build/viewer/src/replay.ts` with 15 tests (80 total); `npm run viewer` builds it. Non-agentic result files light every cited entry at once; agentic traces will replay one tool call at a time

### d57cf6c · 2026-10-27 20:22 · Agentic proposer: chart index plus list_entries and read_entry tools, trace per case, 50 of 50 on muse-spark-1.3; gate reads compound number words; Vercel config for the viewer · tag event-05-agentic

Results added: `meta-muse-spark-1.3-low-agentic-2026-10-28T03-20-47-965Z.json`.
The agentic proposer: `proposeAgentic` in `build/src/provider.ts` loops on tool_use until end_turn, feeding each tool result back, summing usage across turns, and recording a trace of every tool call with its timestamp (tool_choice left at its default; nothing forbidden sent). `build/src/harness.ts --agentic` gives the model a chart index (id, date, kind, opening words) and the tools `list_entries` and `read_entry`, records `trace[]` and reading statistics per case (entries read of chart size, grading-key entries read), and the summary gains per-case means; the gate is unchanged. Gate fix found by the first agentic run: compound number words (eighty-one, ninety-nine) are now one number, not two; the first run (49 of 50, one draft blocked on exactly that) was superseded and removed. Final agentic run on muse-spark-1.3 (`build/results/meta-muse-spark-1.3-low-agentic-2026-10-28T03-20-47-965Z.json`): 50 of 50, 265 sentences verified, 9.6 of 25.6 entries read per case, 96 percent of key entries read, $0.85. README fourth row; 88 tests; the viewer replays the trace. Vercel deploy config (`vercel.json`, `.vercelignore`) for the viewer. Tag `event-05-agentic`

### ac15c57 · 2026-10-27 20:24 · Vercel: install devDependencies for the viewer build; ignore the local project link

Vercel config: install devDependencies on the build host (`npm ci --include=dev`, since Vercel builds with NODE_ENV=production), ignore the local `.vercel/` link

### 8982686 · 2026-10-27 20:28 · Agentic runs on muse-wonder-1.0 and Muse Spark Open; policy_status tool against CHART with tests; raw preview on parse failures

Results added: `baseten-meta-models_muse-spark-open-low-agentic-2026-10-28T03-24-43-339Z.json`, `meta-muse-wonder-1.0-low-agentic-2026-10-28T03-24-24-509Z.json`.
Agentic runs on the other two models (`build/results/`, files carry `-agentic`): muse-wonder-1.0 49 of 50 (one absent case answered warranted with nothing to verify; the gate blocked it), Muse Spark Open on Baseten 48 of 50 (the count sentence blocked again, one answer not valid JSON). README rows and notes. `build/src/chart.ts`: the `policy_status` tool, a live query against CHART's coverage index (a pre-existing data source, labeled as such in every answer, the trace, and the viewer); lenient parser over the index, bearer key from `CHART_API_KEY`, 402 and 401 reported as a key problem and the model told to proceed without it; 7 tests against a stubbed transport; `--chart` flag on the harness, refused without `--agentic` or without the key. Parse failures now keep a 400-character preview of the raw answer (synthetic data). 95 tests

### 239ede5 · 2026-10-27 20:30 · Viewer: scoreboard polish for the agentic rows, errored cases leave criteria unchecked

Viewer polish against the real traces: scoreboard gains an answer-failed column when any run has one, short agentic tag, no wrapping, wider board, agentic footnote; an errored case leaves the criteria unchecked instead of marking them unverified (test)

### 988b108 · 2026-10-27 20:31 · Viewer: version the stylesheet and script links

Viewer: versioned asset links so a redeploy is never served a stale stylesheet

### 75620e0 · 2026-10-27 23:06 · policy_status: one metered CHART query per authority, code, and date per run

`policy_status` answers from a run-scoped memo: one metered CHART query per authority, code, and date across the 50 cases instead of one per case; failures are not memoized; `cache: false` opt-out; test. 96 tests

### ec0d3a2 · 2026-10-27 23:23 · Viewer live at demo.hemeehr.com: README links, favicon

Deployed: the viewer is live at https://demo.hemeehr.com (Vercel project linked to this repository, builds on every push to main; DNS on Cloudflare). README links it; viewer gains an inline favicon

### a86b063 · 2026-10-27 23:39 · Harness: accept CHART_CUSTOM_TOKEN for the CHART key

Harness reads the CHART key from `CHART_API_KEY` or `CHART_CUSTOM_TOKEN`. First live probe (case-038, muse-spark-1.3): the model called `policy_status` right after the index with the correct code and date, CHART answered 401 because the token in `.env` was not a CHART key, the model proceeded on the given criteria and passed the gate; results file discarded as a failed-lookup probe

### b255222 · 2026-10-27 23:44 · chart.ts reads the live coverage-index shape; first successful policy_status lookup

First successful live CHART lookup. The coverage index shape is now known (`authorities[].last_changed`, `oldest_check`, ISO instants) and `chart.ts` reads it, trimming instants to the day; test fixture is the live shape; harness also accepts `CHART_VERIFY_KEY`. Probe on case-038 (muse-spark-1.3): `policy_status` was the first tool call, answered "cms: criteria last changed 2026-09-27, last checked 2026-09-28", then six entries read, passed the gate, and the draft carried no CHART fact. Probe file discarded; the 50-case run follows

### 8db4fc3 · 2026-10-27 23:48 · Gate v1.2 reads hundreds as one number; policy_status memo keyed on authority, printed codes normalized

First 50-case run with the live tool (muse-spark-1.3) read and superseded, not kept: 47 of 50, three blocks. Two were the gate catching a warranted answer on an absent case (case-023 with no evidence at all; case-044 with a placeholder sentence "Dummy." and no evidence for the sepsis criterion). One was a gate defect: "one hundred ten feet" and "two hundred feet" read as bare 100, refuting a true sentence (case-032). Gate v1.2 reads hundreds as one number, with a test. The run made about 50 metered CHART queries because the memo was keyed on code and date; the live index returns the same authority table whatever the code, so the memo is now keyed on the authority alone, and printed codes like "MS-DRG 871" or "CMG 0104" are normalized instead of rejected (six lookups had been refused locally). 97 tests. Rerun follows

### 62a5c48 · 2026-10-27 23:50 · Live CHART run on muse-spark-1.3: seventh README row; viewer labels live-tool runs

Results added: `meta-muse-spark-1.3-low-agentic-chart-2026-10-28T06-48-41-422Z.json`.
Live CHART run kept: muse-spark-1.3 agentic with `policy_status`, 49 of 50, 263 sentences, p50 10.8 s, $0.019 per case, 9.8 of 25.6 entries read, 96% of key entries; the tool was called in all 50 cases (41 as the first move), 44 answers from the per-authority memo, no CHART fact in any draft; one block is an empty warranted answer on an absent wound-care case. Seventh README row and paragraph. Viewer flags live-tool runs in the picker and scoreboard (`live` in the manifest, rows sorted last) with a test; asset links v4. 98 tests

### 5b133e0 · 2026-10-27 23:53 · Live CHART run on muse-wonder-1.0: 50 of 50, eighth README row

Results added: `meta-muse-wonder-1.0-low-agentic-chart-2026-10-28T06-51-47-640Z.json`.
Live CHART run on muse-wonder-1.0: 50 of 50, 229 sentences, p50 9.0 s, $0.054 per case, 7.9 of 25.6 entries read, 95% of key entries, `policy_status` first in all 50 cases, one metered query and 49 from memory, no CHART fact in any draft. Eighth README row. The same run on Muse Spark Open failed on all 50 with Baseten HTTP 402 (payment status), file discarded, retry once credit is added

### 9fe6a8d · 2026-10-27 23:55 · Viewer: apply deep links on hash change

Viewer: deep links apply on hash change in an open tab (run, case, board closed), not only at load; asset links v5

### 42f6ef5 · 2026-10-28 00:06 · Viewer and README figures in the CHART Library composite of the heme design system

Viewer restyled to the CHART Library composite of the heme design system (Jim pointed at both Claude Design projects): ink-ramp light chrome with a dark remap behind a theme button (remembered per viewer), Google Sans Flex interface, JetBrains Mono for ids, dates, codes, money and provenance, EB Garamond for record text, quotes and the letter, the low-chroma oklch state set (pass, blocked, declined, failed) with the result state in mono like the Resolve surface, warrant-style highlights on quotes and sentences, a book-style case header with crumb, title, meta and provenance stamp (model, provider, effort, run date, gate version), tabs for Replay and Scoreboard, 32px footer strip; README figures remapped to the ink ramp and sans stack as single light assets (dark variants removed); asset links v7. 98 tests

### e6600f2 · 2026-10-28 00:17 · Live CHART run on Muse Spark Open: 45 of 50 with one referential-limit false pass reported; scoreboard shows gate misses

Results added: `baseten-meta-models_muse-spark-open-low-agentic-chart-2026-10-28T07-13-57-225Z.json`.
Live CHART run on Muse Spark Open (Baseten, concurrency 3 after a run at 8 lost 16 cases to HTTP 429 and was discarded): 45 of 50, 245 sentences, p50 7.3 s, $0.016 per case, 9.3 of 25.6 entries read, 97% of key entries, `policy_status` in all 50 cases (40 first), one metered query. Four blocks read: each a true sentence citing one entry for a fact in another (antianginal count, 150-foot goal vs 160-foot discharge note, "bilateral", "8 weeks of PT"), gate right by its one-citation rule. One false pass kept and reported: case-023, absent (no intensity documentation), model cited "plan 5 to 6 days a week" for the 3-hours-a-day criterion and the gate passed it, the referential limit from the LITMUS papers now on the public scoreboard. Ninth README row and paragraph. Viewer scoreboard gains a "Gate passed, key says no" column when any run has one; asset links v8. 98 tests

### a493073 · 2026-10-28 00:18 · Viewer: scoreboard headings wrap

Viewer scoreboard: column headings wrap so ten columns fit without horizontal scroll; asset links v9

### 2b86e41 · 2026-10-28 00:49 · Gate v1.3 names the entry to cite; advisor beside each criterion, run on the three live-CHART runs; re-gate script

Gate v1.3 (`build/src/litmus.ts`): a sentence refuted only for hard tokens that all live in another entry of the same chart comes back as `needs-citation` naming that entry; the draft stays blocked, the physician is told what to add; a token in no entry stays refuted; the reason text says plainly that a count the chart never states must be rewritten. Three tests, three older tests updated to the new label. `scripts/regate.ts` re-gates stored drafts (pure function, inputHash checked); all nine kept runs re-gated: 7 sentence labels changed (all Spark Open), 0 verdicts, recorded in each file under `run.regated`. The advisor: `ADVICE_SCHEMA` and `parseAdvice` in schema.ts, a generic `ask` on the Messages provider, `scripts/advise.ts` asks a model per drafted case whether the cited quotes satisfy each criterion (supports, partial, silent, one sentence why), stored under `advice` with the model named, never a gate input; summary in `summary.advice`. muse-wonder-1.0 advised the three live-CHART runs: 91 cases, 363 criteria, $2.47, 73% supports, 27% partial, the false pass (case-023) flagged on exactly the intensity criterion, 2 cases on the spark run answered invalid JSON and carry an error. Viewer shows the advisor beside each criterion as a named opinion after the verdict, and a needs-citation stamp; README paragraphs for both; 107 tests

### a60c2a3 · 2026-10-28 00:55 · Build log generated from git, the ledger and the result files; README section regenerated by a GitHub Action

Build log: `build/scripts/build-log.ts` (`npm run log`) generates `BUILD-LOG.md` from the git history since `hackathon-start`, the ledger rows matched by hash, the gate version at every commit that changed it, and the run headers in `build/results/` (model, mode, gate at run, re-gates, advisor), plus the kept and superseded runs; it also rewrites a Build log section of the README between markers. `.github/workflows/build-log.yml` reruns it after every push to main and commits the two generated files as github-actions[bot] with no ledger row (the ledger says so). README navigation links the section

### 162a2a7 · 2026-10-28 07:55 · Build log: regenerate after a60c2a3

(no ledger row)

### 3b5c60d · 2026-10-28 01:02 · Viewer: title cards before the first replay

Viewer title cards: three lines shown one at a time at full screen width (type up to 124px), each held one second plus a quarter second per word, then dissolving into the replay; plays when the page opens without a deep link, any key or click skips, the i key replays; reduced motion shows all three and waits. Copy names the health insurer, the surgery, and the appeal deficit. Without a deep link the page opens on the newest live-tool run. Tests for the copy discipline and the schedule; asset links v10; 109 tests

### a517514 · 2026-10-28 08:02 · Build log: regenerate after 3b5c60d

(no ledger row)

### 799d7b3 · 2026-10-28 01:04 · Title card one: the carrier, the treatment, and the doctor who may never answer

Title card one reworded to Jim's line: the medical insurance carrier denies treatment in a second, the doctor takes hours to answer, if they ever do; word cap raised to 24, the hold scales with it; asset links v11

### 10051f0 · 2026-10-28 08:04 · Build log: regenerate after 799d7b3

(no ledger row)

### be17ec7 · 2026-10-28 01:05 · Title cards type out letter by letter

Title cards type out letter by letter at about 35 characters a second with a blinking cursor, hold 1.4 s once complete, then fade; reduced motion shows the full text; schedule and copy tests updated; asset links v12

### 6473f37 · 2026-10-28 08:05 · Build log: regenerate after be17ec7

(no ledger row)

### 951863a · 2026-10-28 01:10 · Title cards: sans, fixed layout while typing, slightly slower

Title cards: set in the interface sans like the case header, the whole line laid out at once with each character revealed in place so the sentence never shifts, typing slowed to 36 ms per character; asset links v13

### a83d4c5 · 2026-10-28 08:10 · Build log: regenerate after 951863a

(no ledger row)

### c119e09 · 2026-10-28 01:12 · Title cards: monospace, block cursor stays, two-second hold

Title cards in JetBrains Mono with a block cursor that keeps blinking after the line is typed; each card holds 2 s once complete; asset links v14

### ce40903 · 2026-10-28 08:12 · Build log: regenerate after c119e09

(no ledger row)

### 3b0a483 · 2026-10-28 21:52 · Mutation harness over the 2,201 verified sentences; gate v1.4 closes the 48 swapped-side passes it found; nine runs re-gated with no verdict change; harness --out-dir for repeat runs

Results added: `mutations/report-v1.3.json`, `mutations/report.json`.
Mutation harness (`build/scripts/mutate.ts`, `npm run mutate`, 13 tests): each of the 2,201 sentences the nine kept runs verified gets one fabrication at a time, 9,475 in all, and the gate runs on each. Under gate v1.3: numbers replaced by values absent from every admissible source, citations moved to an entry lacking the quote, a word dropped from the quote, and dates shifted were caught 100 percent; 48 swapped sides passed, all in contexts outside the anatomy word list (left ventricle, left forefoot ulcer, left total knee arthroplasty). Gate v1.4 (`build/src/litmus.ts`, three tests): a side is a hard token wherever it names a side, idioms masked; the nine kept runs re-gated, 0 labels and 0 verdicts changed, recorded under `run.regated`. Under v1.4 the harness catches 5,781 of 5,781 hard corruptions; 1,308 presence collisions and 2,386 soft corruptions (negation flips, pronoun swaps) pass by design and are now counted. Reports in `build/results/mutations/`, the v1.3 report kept as `report-v1.3.json`. Harness gains `--out-dir` (5 tests) so repeat runs can be written to `build/results/repeats/` without joining the scoreboard. 130 tests

### a39857c · 2026-10-28 21:53 · README: primary-source check of every statistic; KFF footnote rewritten, WISeR services per CMS, framing paragraph, the gate's measured catch rate under Limitations

README: primary-source check of every statistic spoken in the video or shown on a title card. The KFF short link had died and KFF now serves the 2024 edition at the 2023 slug; footnote rewritten (2023 figures kept, the 81.7 percent overturn rate attributed as the 2023 rate through AHA News, the 2024 figures noted: 52.8 million requests, 4.1 million denied, 80.7 percent of appeals overturned). WISeR services corrected from "knee replacements", copied from Medical Economics, to knee arthroscopy for osteoarthritis per CMS's own list, with a CMS footnote. AMA, Cigna, UnitedHealth court order, and Senate figures confirmed at their sources (the Senate PDF only through Healthcare Dive; it blocks automated download). A framing paragraph near the top, what this is and is not. A paragraph under Limitations reporting what the mutation harness measured, with the referential limit as counts

### 1e4ead3 · 2026-10-29 04:53 · Build log: regenerate after a39857c

(no ledger row)

### 78a2105 · 2026-10-28 22:59 · Repeat runs: two more per live-CHART configuration in build/results/repeats; run-to-run variance reported as ranges under Limitations

Results added: `repeats/baseten-meta-models_muse-spark-open-low-agentic-chart-2026-10-29T04-29-17-118Z.json`, `repeats/baseten-meta-models_muse-spark-open-low-agentic-chart-2026-10-29T04-31-36-875Z.json`, `repeats/meta-muse-spark-1.3-low-agentic-chart-2026-10-29T04-29-16-858Z.json`, `repeats/meta-muse-spark-1.3-low-agentic-chart-2026-10-29T04-30-27-555Z.json`, `repeats/meta-muse-wonder-1.0-low-agentic-chart-2026-10-29T04-31-38-694Z.json`, `repeats/meta-muse-wonder-1.0-low-agentic-chart-2026-10-29T04-33-41-439Z.json`.
Repeat runs: each live-CHART configuration run twice more with the same 50 cases and settings (`build/results/repeats/`, six files, re-gated to v1.4). muse-wonder-1.0 50 of 50 both times; muse-spark-1.3 47 and 50 (the 47: three empty warranted answers on absent cases, all blocked by the gate); Muse Spark Open on Baseten 48 and 42 (the 42: seven blocks, every one a true sentence citing one entry for facts that live in two or a rounded figure the chart never states, plus the case-023 referential-limit false pass again). Zero fabricated quotes in all six. README gains a run-to-run variance bullet under Limitations, and the small-counts bullet no longer says there are no repeat runs

### b693de6 · 2026-10-29 05:59 · Build log: regenerate after 78a2105

(no ledger row)

### 6f31fd6 · 2026-10-28 23:12 · Two more Spark Open repeats on the Baseten hackathon credit with the dated model id; Spark Open reported across five runs

Results added: `repeats/baseten-meta-models_muse-spark-open-1026-low-agentic-chart-2026-10-29T06-00-58-292Z.json`, `repeats/baseten-meta-models_muse-spark-open-1026-low-agentic-chart-2026-10-29T06-03-20-472Z.json`.
Two more Spark Open repeats on the Baseten hackathon credit with the dated id `meta-models/muse-spark-open-1026` (`build/results/repeats/`, gate v1.4 at run time): 46 of 50 (three blocks: case-023 drafted warranted on the absent case and blocked on a 150-foot goal cited to the discharge note that says 160, the antianginal count again, and a day count the chart never states; one invalid-JSON answer, case-030) and 48 of 50 (the count sentence; one invalid-JSON answer, case-043). Spark Open now has five runs, 42 to 48. README variance bullet says which key and id each pair used. The Baseten Messages path reports zero thinking tokens on the hackathon key too

### 60fb2e4 · 2026-10-29 06:13 · Build log: regenerate after 6f31fd6

(no ledger row)

### d249a33 · 2026-10-28 23:58 · Title cards rewritten for the video opening: four lines gather at the top over the replay page itself, dimmed; one fade reveals the page and lights the column headers left to right; budget and backdrop tests

Title cards rewritten and restaged for the video opening (`build/viewer/`): four lines typed one after another at the top of the page and kept as a block, the first stating what was pre-existing and what was built this week as the event rule asks, then what is below left to right, the Meta model and the gate, and no advice to patients with the physician who reads and signs; behind them the replay page itself, rewound to the untouched chart, under a scrim near solid beneath the text and light over the three columns; the block and the scrim leave on one 400 ms fade and the column headers light left to right 200 ms apart; the i key rewinds the open case to step 0 and plays the cards over it; reduced motion shows all four lines at once over a plain scrim with the headers already lit. Two tests: the opening reaches the first replay frame within the 20 s budget (19.69 s), and at cursor 0 nothing is lit for every result in every file; 132 tests; asset links v15

### 273dbfa · 2026-10-29 00:15 · Title cards rewritten from a cold viewer's distance: three lines on how care is paid for, payer rules, and what this sets side by side; no project names in the lines; the pre-existing versus built-this-week line as a plain-words stamp

Title cards rewritten again from a cold viewer's distance (`build/viewer/`): three typed lines at the top of the page, kept as a block, on how care is paid for in the United States, that rules differ by payer and payers have been cited for denying care automatically, and that this sets the payer's current policy beside the doctor's documentation so both are accountable; no project names in the lines, a copy test forbids them. The event rule's line, what was pre-existing and what was built this week, is a small solid stamp at the bottom from the first frame, in plain words. Scrim heavy to 320 px for the taller block. First replay frame 19.88 s; 132 tests; asset links v16

### d619d20 · 2026-10-29 00:41 · Title cards footnoted: markers on the two sourced statements resolve in a notes line beside the provenance stamp; Medicare Advantage named where the citations apply; closing line is the project's aim. README: payer rules differ (OIG 2022), the Journal's reporting on insurer-added diagnoses and the DOJ investigations the company disclosed, three footnotes

Title cards footnoted (`build/viewer/`): the two statements that warrant a source carry superscript markers, resolved in a small notes line at the bottom beside the provenance stamp (HHS OIG report OEI-09-18-00260, April 2022; the Senate Permanent Subcommittee on Investigations report, October 2024; the Cigna PxDx class action, July 2023); the denials line now says Medicare Advantage plans, which is what the citations cover; a copy test holds every marker to a note; the closing sentence is now the project's aim, to level the playing field for the provider. The text block narrowed to 90 percent of the viewport for a margin at the right. README: a sentence under The problem on rules that differ by payer with the OIG footnote, a public-record row for the Wall Street Journal's reporting on insurer-added diagnoses in Medicare Advantage with the company's response and the Department of Justice investigations it disclosed in July 2025, three new footnotes. First replay frame 19.60 s; 132 tests; asset links v17

### f6aa618 · 2026-10-29 01:07 · The cards end by travelling into a preamble paragraph at the bottom of the page, sources and stamp beneath, dismiss and restore; the live CHART query shown as a four-node strip with the answer typed, held 3.2 s in playback; closing line names its subject

The cards end by travelling (`build/viewer/`): the block of three lines shrinks and slides down into a preamble paragraph at the bottom of the page, the sources and the provenance stamp under it, with a dismiss button; the p key or the footer's "about this page" brings it back, and the stage gives up the height only while it is open. The closing line names its subject ("This project sets ..."); the word cap is thirty. The live CHART query is now shown as a strip: for the one step the query is the last thing that happened, the criteria list gives way to four nodes, the payer, the authority asked, the index that answered, and the answer typed out, with the question (tool, code, date of service) beneath, then the criteria return with the query's line. Pure parts in `build/viewer/src/replay.ts`: lookup steps carry their question from the trace, `lookupStrip` builds the four nodes, `stateAt` carries the strip for exactly one step, and playback dwells at least 3.2 s on a live query (`LOOKUP_DWELL_MS`); three tests. Reduced motion skips the travel and the typing. 135 tests; asset links v18

### 3e005bb · 2026-10-29 08:23 · Build log: regenerate after f6aa618

(no ledger row)

### 2516a20 · 2026-10-29 01:31 · Title cards in the author's words: payment depends on what the doctor documented, judged against that payer's coverage rules; those rules differ by payer, and federal investigators found Medicare Advantage plans denying care that met Medicare's own criteria; this project places the payer policy in force on the date of service beside the doctor's record. Budget test 24 s

Title cards in Jim's words (`build/viewer/src/replay.ts`): payment depends on what the doctor documented, judged against that payer's coverage rules; those rules differ by payer, and federal investigators found Medicare Advantage plans denying care that met Medicare's own criteria (both markers to the HHS Inspector General's 2022 report); this project places the payer policy in force on the date of service beside the doctor's record so each side can be checked against the other. Six rows at 1080p, the scrim's solid band deepened to fit; the budget test moves from 20 to 24 s (23.34 s to the first replay frame at the unchanged pace). Asset links v19

### f55898d · 2026-10-29 08:33 · Build log: regenerate after 2516a20

(no ledger row)

### 0e347d9 · 2026-10-29 01:48 · Title block holds two seconds longer before it travels, the travel takes 700 ms, and typed characters are scheduled at absolute times so long lines do not drift; budget test 26 s

The finished title block holds two seconds longer before it travels, and the travel takes 700 ms instead of 400 (`INTRO_END_PAUSE_MS`, `INTRO_MOVE_MS` in `build/viewer/src/replay.ts`; the scrim and caption band fade over the same time); the budget test holds the pause and moves to 26 s (25.64 s to the first replay frame). Each typed character is now due at an absolute time from the start instead of chained timers, so long lines no longer drift (the last line had landed about half a second late, eating the hold); measured hold after the last line 4.05 s. Asset links v20

### 83bf7dd · 2026-10-29 17:13 · Build log: regenerate after 0e347d9

(no ledger row)

### 0f4e153 · 2026-10-29 10:17 · The opening ends on who signs: it drafts; a physician signs

The opening ends on who signs: "It drafts; a physician signs." closes the third line, held together with no-break spaces so it never splits across rows; the copy test asserts the ending and allows thirty-two words; the scrim's solid band deepened for seven rows; budget test 27 s (26.72 s to the first replay frame). Asset links v21

### 92dc31a · 2026-10-29 17:41 · Build log: regenerate after 0f4e153

(no ledger row)

### 69f1081 · 2026-10-29 11:22 · The payer's own reason above the criteria, labeled with its CARC code; every case header label explains itself on hover; footnote markers set apart in the heading color

The payer's own reason on screen (`build/viewer/`): the sentence after "Payer remark:" in each denial now sits above the criteria list, labeled with its CARC code, so the insurer's claim is read against the record's quotes beneath it (`payerRemark`, one test over all 50 cases). Every label in the case header explains itself on hover: the billing code system, the CARC code with its text, the plan, the category, the stakes, the model, the provider, the effort, the run date, the gate version, the synthetic record (`codeSystemHelp`, `carcHelp`, `LABEL_HELP`, one test). The footnote markers in the opening lines and the paragraph are set in the heading color and bold so they are seen. 137 tests; asset links v22

### 97c67cc · 2026-10-29 18:25 · Build log: regenerate after 69f1081

(no ledger row)

### 37cb44e · 2026-10-29 16:14 · Each column says what it holds; the case header says what kind of denial it is; the result stamp and the about panel say what PASS means and where the fifty cases came from

What the three columns are, said on the page (`build/viewer/`): one line under each column header (the physician's record, entries lit as read; the payer's written rules under the payer's own reason, lit when the draft cites verified evidence; the appeal drafted one sentence at a time, each stamped by the gate, with PASS defined as every sentence in the record, not that the appeal would prevail), repeated on the header's hover (`PANEL_HELP`); the result stamp explains itself on hover (`VERDICT_HELP`: PASS is the gate's word, the physician decides whether the record satisfies the criteria; DECLINED is the expected answer for 20 of 50). The case header now says what kind of denial each case is (`denialKind`, `DENIAL_KIND_HELP`): every one a claim denied after the service was given, none a prior-authorization request, the three CARC 197 cases claims denied for a missing authorization. Where the fifty cases came from, in the about panel and under the scoreboard (`DATA_NOTE`: seeded generator, 18 templates, the 30 and 20 split by subtype, fictional payers, no real record). README gains a subsection, The fifty cases, stating the kind of denial against the prior-authorization statistics above it and how the set was generated, with links to the generator, the templates, and the synthetic README. Three tests; 140 tests; asset links v23
