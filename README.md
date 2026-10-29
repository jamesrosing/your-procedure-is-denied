<img alt="Your procedure is denied. Claim adjustment reason code 50: not deemed a medical necessity by the payer. A denial takes an insurer about one second. An appeal takes a physician hours." src="assets/header.svg" width="100%">

<p align="center">
  <a href="#the-problem">The problem</a> ·
  <a href="#the-public-record">The record</a> ·
  <a href="#a-standard-not-a-product">The standard</a> ·
  <a href="#what-i-am-building">The work</a> ·
  <a href="#measured-in-public">Results</a> ·
  <a href="https://demo.hemeehr.com">Live replay</a> ·
  <a href="#build-log">Build log</a> ·
  <a href="#from-the-inside">Contribute</a>
</p>

<p align="center">
  <a href="https://doi.org/10.5281/zenodo.21227402"><img alt="LITMUS paper DOI" src="https://zenodo.org/badge/DOI/10.5281/zenodo.21227402.svg"></a>
  <a href="https://doi.org/10.5281/zenodo.21227855"><img alt="LITMUS architecture DOI" src="https://zenodo.org/badge/DOI/10.5281/zenodo.21227855.svg"></a>
  <img alt="Data: synthetic only" src="https://img.shields.io/badge/data-synthetic%20only-2b333d">
  <img alt="Meta Global AI Developer Hackathon, Oct 26 to Nov 4, 2026" src="https://img.shields.io/badge/Meta%20Global%20AI%20Developer%20Hackathon-Oct%2026%20to%20Nov%204%2C%202026-2b333d">
</p>

<br>

> An insurer can now issue a claim denial in about a second. Answering it takes a physician hours. In between, a patient waits to learn whether the operation their surgeon recommended will be approved or refused.
>
> — James H. Rosing, MD, FACS · Board-certified in general and plastic surgery · Newport Beach, California

This repository is the public record of one physician's attempt to change that balance: the evidence, the standard I believe every medical AI should meet, and the work of meeting it, measured in the open.

**What this is, and is not.** The software here drafts the administrative response to a payer's denial, from the physician's own chart, against the payer's own written criteria, for the physician to read and sign. It gives no advice to patients, recommends no treatment, and sends nothing on its own. Every sentence it drafts is checked against the record by a deterministic gate before a physician sees it, and the physician's signature is the only thing that makes it an appeal.

<br>

## The problem

| Requests denied | Denials appealed | Appeals overturned |
| :---: | :---: | :---: |
| **3.2 million** | **about 374,000** | **about 306,000** |
| 6.4% of 49.8 million requests | 11.7% of denials | 81.7% of appeals |

<sub>Medicare Advantage prior authorization, 2023.[^kff] Appealed and overturned counts are derived from the reported rates.</sub>

<img alt="Bar chart: 3.2 million requests denied; about 374,000 appealed; about 306,000 overturned on appeal; about 2.8 million denials never appealed." src="assets/attrition.svg" width="100%">

When denials are challenged, most fall. Most are never challenged, because the cost of answering lands on the people with the least time. Physicians report 13 hours a week spent on prior authorization, and 79% say patients have abandoned treatment while waiting.[^ama]

The rules are not uniform. Each payer writes its own, and in 2022 the HHS Inspector General found Medicare Advantage plans applying clinical criteria that Medicare itself does not use, denying requests that met Medicare coverage rules.[^oig]

The surgeon whose judgment is overridden spent four years in medical school and five or more in residency and specialty training, and carries the license, the liability, and the duty to see the patient through. The decision to refuse carries none of that weight.

I do not think most of the people who build these systems set out to harm patients. But a system rewarded for saying no, and rarely asked to show its reasons, will say no more often than it should.

<br>

## The public record

<img alt="Timeline: 2019 nH Predict deployed; 2022 Cigna PxDx denies over 300,000 claims in two months; July 2023 Cigna class action; November 2023 nH Predict class action; October 2024 Senate report; January 2026 WISeR goes live; March 2026 court compels UnitedHealth records; October 2026 this work." src="assets/timeline.svg" width="100%">

<details>
<summary><b>Read the five cases</b></summary>
<br>

| Who | Tool | What is alleged or reported | Status |
| --- | --- | --- | --- |
| UnitedHealth (naviHealth) | nH Predict[^unh] | Predicts post-acute length of stay for Medicare Advantage patients; plaintiffs allege about 9 in 10 denials were reversed on appeal | Class action in discovery, D. Minn.; March 2026 order compels records back to 2017 |
| UnitedHealthcare | Post-acute review[^psi] | Post-acute denial rate rose from 8.7% (2019) to 22.7% (2022) | Senate investigation report, October 2024 |
| CVS Health | Post-Acute Analytics[^psi] | AI project to reduce skilled nursing spending; savings target raised to $77.3M over 3 years | Senate investigation report, October 2024 |
| Cigna | PxDx[^cigna] | 300,000+ claims denied in 2 months of 2022, averaging 1.2 s each | Class action, E.D. Cal., filed July 2023 |
| Medicare Advantage insurers, UnitedHealth foremost | Insurer-initiated diagnoses[^wsj] | Wall Street Journal analysis: diagnoses added by insurers rather than by a treating doctor drew about $50 billion from Medicare over 2018 to 2021, many of them recorded by nurses the insurers sent into members' homes; about 66,000 patients were coded with diabetic cataracts after cataract surgery, which removes the lens, and UnitedHealth members were about 15 times as likely as traditional Medicare patients to carry that diagnosis | Series, July to August 2024. In July 2025 the company disclosed that it is cooperating with Department of Justice criminal and civil investigations of its Medicare billing[^doj] |
| CMS | WISeR[^wiser] | AI-supported prior authorization in traditional Medicare across 6 states, including skin substitutes, nerve stimulators, knee arthroscopy for osteoarthritis, and cervical fusions[^cms] | Live since January 2026; repeal resolution pending |

The insurers dispute these characterizations. UnitedHealth says nH Predict only guides care planning, called the Journal's analysis of its diagnoses "inaccurate and biased," and says it has full confidence in its practices; Cigna says PxDx is not AI.

</details>

<br>

## A standard, not a product

<table><tr><td>
<br>
<p align="center"><b>No machine should make a claim about a patient's care that it cannot support.</b></p>
<p align="center">It must cite its source or show its derivation.<br>If it cannot, it stops, and the physician decides.</p>
<br>
</td></tr></table>

I wrote that standard down as **LITMUS** and published it openly under CC BY 4.0, so anyone can use it, test it, or argue with it. It applies to an insurer's algorithm as much as to mine.

#### [Litmus: The Admissible Set](https://doi.org/10.5281/zenodo.21227402)
<sub>Position paper · Rosing, J. H. · Zenodo, July 6, 2026 · doi:10.5281/zenodo.21227402</sub>

Generative artificial intelligence is entering clinical work ahead of any agreed method for making it safe. This paper argues that an autonomous system can be trusted only in proportion to the strength of the external check that verifies it, and that medicine has exactly one valid check: the certified specialist physician. That check has a definite shape. It returns membership in a small admissible set of treatments a qualified body would accept, a structure independently confirmed by a century of malpractice doctrine. Because the basis for membership is partly explicit and partly tacit, the machine may act alone only where consensus is explicit and settled, and must defer to the physician everywhere else. The paper sets out this method, litmus-gated reach, and the buildable system it implies.

#### [Litmus: The Admissible Set (System Architecture)](https://doi.org/10.5281/zenodo.21227855)
<sub>Architecture companion · Rosing, J. H. · Zenodo, July 6, 2026 · doi:10.5281/zenodo.21227855</sub>

This companion document specifies the system architecture implied by Litmus: The Admissible Set. The design is one substrate applied to many workflows: a model-pluggable agent runtime, an extensible registry of standardized tools, and a fail-closed verification spine whose criteria are curated per specialty. The machine acts alone where physician consensus is explicit, routes an evidence-bounded case to the certified specialist where it is not, and records every claim, gate decision, and verdict in a provenance layer. Feedback from physician verdicts, payer adjudication, and clinical outcomes widens what can be verified over time. The document details the layers, the runtime flow, an end-to-end medical coding and appeals workflow, the build sequence from existing components, and how the architecture scales across specialties and absorbs advances in model capability.

<details>
<summary>Cite</summary>

```bibtex
@misc{rosing2026litmus,
  author    = {Rosing, James H.},
  title     = {Litmus: The Admissible Set},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.21227402}
}
@misc{rosing2026litmusarch,
  author    = {Rosing, James H.},
  title     = {Litmus: The Admissible Set (System Architecture)},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.21227855}
}
```

</details>

<br>

## What I am building

Software that answers a denial the way a careful physician would, with every statement held to the standard above.

<img alt="Flow: a denial arrives as an 835 remittance with reason codes; it is checked against the payer criteria in force on the date of service; a response is drafted from the chart with every statement citing a chart entry; the LITMUS gate checks every statement; if warranted, the physician reviews and signs; if not, the draft is blocked and the physician decides." src="assets/flow.svg" width="100%">

If the record does not support an appeal, the software says so instead of arguing anyway. Nothing is sent without a physician's signature.

<br>

## Measured in public

During the Meta Global AI Developer Hackathon[^hack] (Oct 26 to Nov 4, 2026), I am testing whether open-weight models can do the drafting while the verification step holds them to the same standard. If they can, an independent practice can run this without sending patient records to a vendor it does not control.

The test runs on 50 synthetic denials across the categories where denial dollars concentrate: post-acute care, inpatient level of care, oncology, vascular and cardiac procedures, spine and joint surgery, wound care, biologics, bariatric and plastic surgery. Thirty can be answered from the chart. Twenty cannot, and the right answer for those is to decline. No real patient data is used. The set, the gate, the harness, and every result file are in [`/build`](build/), and [NEW-WORK.md](NEW-WORK.md) is the ledger of what was built when.

### Results

Three Meta models, 50 cases each, one run per model on October 27, 2026, effort low, eight cases in flight at a time. A result agrees with the grading key when the model drafts an appeal for a case the chart supports and the gate verifies every sentence, or when the model declines a case the chart does not support.

| Model | Agreed with the key | Gate blocked a draft | Sentences verified | Latency, median | Cost per appeal |
| --- | :---: | :---: | :---: | :---: | :---: |
| muse-spark-1.3 (Meta Model API) | 50 of 50 | 0 | 247 | 16.3 s | $0.013 |
| muse-wonder-1.0 (Meta Model API) | 49 of 50 | 0 | 236 | 8.8 s | $0.037 |
| Muse Spark Open (open weights, hosted on Baseten) | 49 of 50 | 1 | 233 | 4.3 s | $0.007[^open] |
| muse-spark-1.3, agentic: reads the chart by tool call, 9.6 of 25.6 entries per case | 50 of 50 | 0 | 265 | 8.0 s | $0.017 |
| muse-wonder-1.0, agentic, 8.7 of 25.6 entries per case | 49 of 50 | 1 | 244 | 10.0 s | $0.052 |
| Muse Spark Open on Baseten, agentic, 9.4 of 25.6 entries per case | 48 of 50 | 1 | 239 | 9.9 s | $0.018[^open] |
| muse-spark-1.3, agentic with a live CHART query, 9.8 of 25.6 entries per case | 49 of 50 | 1 | 263 | 10.8 s | $0.019 |
| muse-wonder-1.0, agentic with a live CHART query, 7.9 of 25.6 entries per case | 50 of 50 | 0 | 229 | 9.0 s | $0.054 |
| Muse Spark Open on Baseten, agentic with a live CHART query, 9.3 of 25.6 entries per case | 45 of 50 | 4 | 245 | 7.3 s | $0.016[^open] |

The last three rows are the agentic step, run October 28. The model no longer receives the chart. It gets an index, one line per entry with the id, date, kind, and opening words, and two tools, `list_entries` and `read_entry`, and reads what it decides it needs. The three models read between 8.7 and 9.6 of 25.6 entries per case, in 2.3 to 3.5 model turns, and reached 93 to 98 percent of the entries the grading key names as evidence. They read the chart the way a reviewer does: a modifier denial (CARC 4) was declined without opening a single entry, because the chart cannot answer it; the cases labeled absent, where the evidence is not there, were read almost completely (one chart of 27 entries was read entry by entry) before the model declined. Each case's results carry a trace of every tool call, and the viewer replays it, one tool call at a time, at [demo.hemeehr.com](https://demo.hemeehr.com) (source in [`build/viewer/`](build/viewer/)).

The agentic disagreements: muse-wonder-1.0 answered one absent wound-care case with warranted set to true and no evidence and no sentences at all, and the gate blocked it, which is the fail-closed design doing its job. Muse Spark Open blocked on the same count sentence as before ("three antianginals", true, unsourced) and once returned an answer that was not valid JSON (the case passes on a repeat call; the run file keeps the failure).

The two disagreements:

- **muse-wonder-1.0 declined a wound-care case the key calls warranted.** The criterion lists infection control and glycemic management among the components of standard wound care. The weekly notes document debridement, dressings, and offloading, and the chart holds a normal A1c and a clean wound elsewhere. The model read the criterion strictly and said the record did not meet it. That is a judgment a physician could share. It is not an invented fact.
- **The gate blocked one Muse Spark Open draft.** The sentence said the patient was on three antianginal agents, citing a note that lists metoprolol, amlodipine, and isosorbide. The count is correct, and the gate blocked it anyway, because the number three appears nowhere in the record. The gate cannot count. See the limitations below.

The agentic run also found a defect in the gate. A draft wrote "seventy to ninety-nine percent" and "eighty-one percent", both exactly what the cited imaging entries say, and the gate refuted both sentences because it read "ninety-nine" as 90 and 9 and "eighty-one" as 80 and 1. Compound number words are now read as one number (a widening that lets no invented fact through), and the run was repeated under the corrected gate; the ledger records the blocked run.

Every warranted draft from all three models cited the chart entries the key expected, with citation precision above 95 percent, and across the three runs no model invented a quote. One did in an earlier, superseded run: muse-wonder-1.0 wrote "Proceededed" inside a quotation, and the gate refuted the sentence. That is the check doing its job.

### What the models found wrong with my test

Four of my grading keys were defective, and each was found by a model reading the chart more carefully than I had. A rehabilitation chart labeled warranted documented two physician visits in 14 days against a criterion of three a week. A sepsis chart labeled absent still carried a lactate and a blood pressure in a later note. A fusion chart labeled absent still mentioned the slip and the motion on the films. A carotid chart put surgery outside the 14-day window the criterion requires. Each was fixed by regenerating only the affected cases, and the ledger records every one. A benchmark written by one person has that person's blind spots, and the models were useful reviewers of it.

### Limitations

- **The gate checks consistency, not correctness.** It verifies that the quoted words are in the cited entry and that every number, date, code, and side in the sentence is sourced. It does not verify that those words satisfy the criterion. In an earlier run, a model quoted "plan 5 to 6 days a week" for a therapy-intensity criterion and "significant plaque on the left" for a stenosis criterion. Both quotes are real, neither meets the criterion, and the gate passed both. The papers call this the referential limit, and it is the reason nothing is sent without a physician's signature.
- **The gate cannot derive.** A count read off a list, a duration computed from two dates, or a side inferred from an entry that names it elsewhere is blocked unless the token appears verbatim. The one block above is a false block. The design favors blocking a true derivation over passing an invented one, and whether to exempt simple counts is an open question.
- **Pronouns and other soft words are not checked.** A model once wrote "he" for a female patient. Nothing in the sentence tripped the gate. Sex, age, and alias are case facts and could be checked next. The size of this blind spot is measured below.
- **The counts are small.** Fifty synthetic cases, one seed. The three live-CHART configurations were run three to five times each (below); the other six rows are single runs. The charts and the criteria were written by the same person, which makes the test easier than a real chart against a real policy.
- **The data are synthetic.** The charts are generated in dictation voice from 18 templates. No result here says anything about performance on real records, and that measurement cannot be made in public.
- **What the gate catches, measured.** No model fabricated anything in the kept runs: across 2,208 sentences the gate verified 2,201 and refuted none, so its catch rate could not be read off the runs. It was measured instead by injecting fabrications into the 2,201 verified sentences, one at a time, 9,475 in all, and running the gate on each (`build/scripts/mutate.ts`, report in `build/results/mutations/`). Under gate v1.4, every hard corruption was caught, 5,781 of 5,781: a number replaced by a value absent from every admissible source (1,194), the citation moved to an entry that lacks the quote (2,201), a word dropped from the quote (2,148), a date shifted (13), a side swapped (225). Under v1.3 the same harness had passed 48 swapped sides, every one in a context outside the gate's anatomy word list ("left ventricle", "left forefoot ulcer", "left total knee arthroplasty"); v1.4 treats a side as a hard token wherever it names one, and re-gating the nine kept runs under it changed no label and no verdict. Two blind spots are now counted rather than described. A wrong number that happens to appear in the criteria, the denial, or the case facts passes, 1,194 of 1,194 (in one, "45 to 60 minutes" became "79 to 60 minutes" because the patient is 79), and so does a swapped side when the other side appears somewhere in the cited entry (114 of 114): the gate checks presence, not correspondence. And nothing without a hard token is checked at all: 1,864 flipped negations and 522 swapped pronouns passed, every one. That is the referential limit with a number on it, and the physician who signs is the check on it.
- **Run-to-run variance, measured.** Each live-CHART configuration was run at least twice more on October 28 with the same 50 cases and settings, written to `build/results/repeats/` so the scoreboard stays at nine rows. muse-wonder-1.0 agreed with the key on 50 of 50 in all three runs. muse-spark-1.3 ranged from 47 to 50: in one run it answered three absent cases warranted with no evidence and no sentences, and the gate blocked all three. Muse Spark Open on Baseten was run four more times, twice on a workspace key with the undated model id and twice on the hackathon credit with the dated id `meta-models/muse-spark-open-1026`; across all five runs it ranged from 42 to 48, with 1 to 7 blocks per run, every block a true sentence citing one entry for facts that live in two, or a figure the chart never states, and in two of the runs one answer that was not valid JSON. The referential-limit false pass on case-023 recurred in one of the four repeats; in another the model again drafted that absent case as warranted and the gate blocked it on a different sentence, so that catch was the one-citation rule, not judgment. No run in the seventeen now kept contains a fabricated quote. These ranges are the honest width of a single number on this set.

The last three rows add a third tool, `policy_status`, a live query against CHART, my pre-existing coverage index of US payer policy at chart.hemeehr.com, which answers when the named authority's coverage material last changed and was last checked. It returns no policy text: the criteria in the request stay the criteria. All three models called it in all 50 cases, muse-spark-1.3 in 41 as its first move, muse-wonder-1.0 in all 50, Muse Spark Open in 40, and none wrote any of its answer into a draft; the gate would have blocked it if it had, since CHART is not the chart. The run is labeled as a live query against a prior-work data source wherever its answer appears: the trace, the viewer, and this table. The one block on muse-spark-1.3 is the gate refusing a warranted answer with no evidence and no sentences on a case labeled absent, which is the gate doing its job; muse-wonder-1.0 agreed with the key on all 50. Muse Spark Open's row is the most instructive. Four blocks, each a sentence that was true to the chart but cited one entry for a fact that lives in another: the count of antianginal agents again, a 150-foot goal from the plan of care quoted against the discharge note that reports 160 feet, "bilateral" from a different imaging line, and "8 weeks of PT" cited to the injection note. The gate's rule is one citation per sentence and every hard token in the cited entry, and it held. The fiftieth case is the one that got through: a rehabilitation admission labeled absent because the chart never documents the intensity criterion, three hours of therapy a day. The model cited "plan 5 to 6 days a week" for it, real words from a real entry that answer the frequency half of the criterion and not the intensity half, and the gate passed it. That is the referential limit stated in the LITMUS papers, now on the public scoreboard rather than in a superseded run: the gate checks that every statement is in the record, not that the record satisfies the criterion. The physician who signs is the check on the second question, and the viewer shows this case with the criterion text beside the quote so a reader can see the gap.

Two things followed from reading those five cases, both built the same morning. The first is gate v1.3. When a sentence fails only because a number or a word is not in the entry it cites, the gate now looks for that token in the rest of the chart. If every missing token is in some other entry, the sentence comes back as needs-citation, naming the entry, instead of refuted. The draft is still blocked, because the rule is still one citation per sentence and every hard token in it; what changes is that the physician is told what to fix. Re-gating the nine kept runs under v1.3 changed seven sentence labels and no verdicts, and the ledger records the re-gate. The hint is honest about its limit: for the antianginal count it says the chart has a 3 somewhere else and that a count the chart never states must be rewritten, because the gate cannot tell a count from a figure. The second is the advisor. After the gate, a second model is shown each criterion with the quotes the draft cited for it and asked one question: do these quotes, read literally, satisfy the criterion? It answers supports, partial, or silent, with one sentence why, and the answer is stored with the model's name and shown beside the criterion in the viewer. It never feeds the gate and never changes an outcome. The gate answers whether a statement is in the record; the advisor answers whether the record satisfies the criterion, which is interpretation, so it is presented as an opinion with a name on it, for the physician to weigh. muse-wonder-1.0 advised the three live-CHART runs, 91 drafted cases, 363 criteria, for about $2.50. It called 73 percent of the cited quotes sufficient and 27 percent partial, and it never said silent. On the false pass it did what the gate cannot: for the intensity criterion it wrote that the quote "addresses a plan for 5 to 6 days per week, but is missing the at least 3 hours of therapy per day." It also doubted 97 criteria the gate had verified on cases the key labels warranted, most of them a quote that establishes the fact and not the surrounding clause, such as a survival estimate without the functional-status half of the criterion. That is a strict reader, which is the right default for an advisor whose job is to point at gaps; the physician decides which gaps matter. The first run with the tool found one more gate defect, "one hundred ten feet" read as a bare 100, fixed as gate v1.2 with a test; that run was superseded and is not reported. The tool is in `build/src/chart.ts` with tests against a stubbed transport, and it memoizes per authority so a 50-case run is a handful of metered queries, not fifty.

<br>

## Build log

Every commit since the event began has a row in [NEW-WORK.md](NEW-WORK.md), every result file carries its model, mode, gate version, and any re-gate in its own header, and this section is regenerated from those sources after every push. Nothing in it is typed by hand.

<!-- build-log:start -->
_Generated from the git history, the ledger, and the result files by `npm run log`; a GitHub Action regenerates it after every push. Last regenerated 2026-10-29 18:25 UTC. The full log is [BUILD-LOG.md](BUILD-LOG.md)._

69 commits since the `hackathon-start` tag, the last at 2026-10-29 11:22 (69f1081). Gate v1.4. 9 runs kept, every one re-gated under the current gate; superseded runs are named in the ledger and the log, never silently replaced.

| Started (UTC) | Model | Mode | Agreed | Blocked | False pass | Advisor |
| --- | --- | --- | :---: | :---: | :---: | --- |
| 2026-10-27 08:17 | muse-spark-1.3 | chart in prompt | 50 of 50 | 0 | 0 |  |
| 2026-10-27 08:19 | muse-wonder-1.0 | chart in prompt | 49 of 50 | 0 | 0 |  |
| 2026-10-27 08:20 | meta-models/muse-spark-open | chart in prompt | 49 of 50 | 1 | 0 |  |
| 2026-10-28 03:20 | muse-spark-1.3 | agentic | 50 of 50 | 0 | 0 |  |
| 2026-10-28 03:24 | muse-wonder-1.0 | agentic | 49 of 50 | 1 | 0 |  |
| 2026-10-28 03:24 | meta-models/muse-spark-open | agentic | 48 of 50 | 1 | 0 |  |
| 2026-10-28 06:48 | muse-spark-1.3 | agentic, live CHART | 49 of 50 | 1 | 0 |  |
| 2026-10-28 06:51 | muse-wonder-1.0 | agentic, live CHART | 50 of 50 | 0 | 0 |  |
| 2026-10-28 07:13 | meta-models/muse-spark-open | agentic, live CHART | 45 of 50 | 4 | 1 |  |

Last five commits, newest first, with the ledger row each one carried:

- **69f1081 · 2026-10-29 11:22** · The payer's own reason above the criteria, labeled with its CARC code; every case header label explains itself on hover; footnote markers set apart in the heading color. The payer's own reason on screen (`build/viewer/`): the sentence after "Payer remark:" in each denial now sits above the criteria list, labeled with its CARC code, so the insurer's claim is read against the record's quotes beneath it (`payerRemark`, one test over all 50 cases). Every label in the case header explains itself on hover: the billing code…
- **92dc31a · 2026-10-29 17:41** · Build log: regenerate after 0f4e153. (no ledger row)
- **0f4e153 · 2026-10-29 10:17** · The opening ends on who signs: it drafts; a physician signs. The opening ends on who signs: "It drafts; a physician signs." closes the third line, held together with no-break spaces so it never splits across rows; the copy test asserts the ending and allows thirty-two words; the scrim's solid band deepened for seven rows; budget test 27 s (26.72 s to the first replay frame). Asset links v21
- **83bf7dd · 2026-10-29 17:13** · Build log: regenerate after 0e347d9. (no ledger row)
- **0e347d9 · 2026-10-29 01:48** · Title block holds two seconds longer before it travels, the travel takes 700 ms, and typed characters are scheduled at absolute times so long lines do not drift; budget test 26 s. The finished title block holds two seconds longer before it travels, and the travel takes 700 ms instead of 400 (`INTRO_END_PAUSE_MS`, `INTRO_MOVE_MS` in `build/viewer/src/replay.ts`; the scrim and caption band fade over the same time); the budget test holds the pause and moves to 26 s (25.64 s to the first replay frame). Each typed character is now due…
<!-- build-log:end -->

## From the inside

Physicians, billers, patients, and people who work at payers: I want to hear what you have seen, where this approach is wrong, and what it misses. [Open an issue](https://github.com/jamesrosing/your-procedure-is-denied/issues) to start the conversation.

<br>

---

<sub>Written by a practicing surgeon. Figures are drawn from public reporting and court records cited below; allegations in pending litigation are described as allegations. LITMUS papers © 2026 James H. Rosing, CC BY 4.0. Content in this repository is <a href="LICENSE-CONTENT.md">CC BY 4.0</a>; code is <a href="LICENSE">Apache-2.0</a>. See <a href="CONTRIBUTING.md">how to contribute</a> and the <a href="SECURITY.md">security policy</a>.</sub>

[^kff]: KFF, "Medicare Advantage Insurers Made Nearly 50 Million Prior Authorization Determinations in 2023," January 28, 2025; the 81.7% overturn rate is for appeals decided in 2023, as summarized by AHA News, January 29, 2025: https://www.aha.org/news/headline/2025-01-29-kff-ma-insurers-made-nearly-50-million-prior-authorization-determinations-2023. KFF's page now carries the 2024 figures, which are larger: 52.8 million requests, 4.1 million denied (7.7%), 80.7% of appeals overturned. https://www.kff.org/medicare/issue-brief/nearly-50-million-prior-authorization-requests-were-sent-to-medicare-advantage-insurers-in-2023/
[^ama]: AMA, "AMA survey: Prior authorization reform pledge falls short with physicians," May 2026. https://www.ama-assn.org/press-center/ama-press-releases/ama-survey-prior-authorization-reform-pledge-falls-short-physicians
[^unh]: DistilINFO, "Court orders UnitedHealth to disclose AI denial algorithm," March 2026. https://distilinfo.com/2026/03/12/court-orders-unitedhealth-to-disclose-ai-denial-algorithm/
[^psi]: Healthcare Dive on the U.S. Senate Permanent Subcommittee on Investigations report, October 2024. https://www.healthcaredive.com/news/medicare-advantage-AI-denials-cvs-humana-unitedhealthcare-senate-report/730383/ Full report: https://www.hsgac.senate.gov/wp-content/uploads/2024.10.17-PSI-Majority-Staff-Report-on-Medicare-Advantage.pdf
[^cigna]: Healthcare Dive, Cigna lawsuit over PxDx claim denials, July 2023. https://www.healthcaredive.com/news/cigna-lawsuit-algorithm-claims-denials-california/
[^oig]: HHS Office of Inspector General, "Some Medicare Advantage Organization Denials of Prior Authorization Requests Raise Concerns About Beneficiary Access to Medically Necessary Care," OEI-09-18-00260, April 27, 2022: "MAOs used clinical criteria that are not contained in Medicare coverage rules," and 13 percent of denied requests met Medicare coverage rules. https://oig.hhs.gov/reports/all/2022/some-medicare-advantage-organization-denials-of-prior-authorization-requests-raise-concerns-about-beneficiary-access-to-medically-necessary-care/
[^wsj]: The Wall Street Journal, "Insurers Pocketed $50 Billion From Medicare for Diseases No Doctor Treated," July 2024, and "The One-Hour Nurse Visits That Let Insurers Collect $15 Billion From Medicare," August 2024 (subscription). Summaries: Rise Health, July 9, 2024, https://www.risehealth.org/insights-articles/article/wsj-investigation-medicare-advantage-plans-were-paid-billions-for-diseases-patients-never-had/ and KFF Health News, https://kffhealthnews.org/morning-breakout/insurers-bilked-50b-from-medicare-for-dubious-diagnoses-review-finds/
[^doj]: Medical Economics, "UnitedHealth Group under DOJ investigation over Medicare billing practices," July 24, 2025: the company "disclosed Thursday that it is cooperating with a criminal and civil investigation" and has "begun complying with formal criminal and civil requests." https://www.medicaleconomics.com/view/unitedhealth-group-under-doj-investigation-over-medicare-billing-practices
[^wiser]: Medical Economics, lawmakers on the WISeR model, May 2026. https://www.medicaleconomics.com/view/medicare-wiser-prior-authorizations-needed-congress-prior-authorization-lawmakers-say
[^cms]: CMS, the WISeR model page and its provider office-hours slides, which list the services: skin and tissue substitutes, electrical nerve stimulators, arthroscopic lavage and debridement for the osteoarthritic knee, cervical fusion, epidural steroid injections, and others. The Medical Economics piece says "knee replacements"; CMS's own list says knee arthroscopy. https://www.cms.gov/priorities/innovation/innovation-models/wiser
[^open]: Muse Spark Open reported zero reasoning tokens through the Baseten endpoint on every call, so its cost may be understated if reasoning is billed as output. Latency is wall-clock and unaffected.
[^hack]: Meta Global AI Developer Hackathon, hosted by Meta and Cerebral Valley. https://cerebralvalley.ai/e/meta-ai-developer-hackathon
