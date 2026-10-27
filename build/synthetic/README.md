# Synthetic denial set

Fifty fabricated denial cases for the evaluation harness. Nothing here comes from a real record. Patients are `SYN-001` through `SYN-050` with an age and sex only: no names, dates of birth, record numbers, member numbers, or claim numbers exist anywhere in these files. The six payers are fictional, and the coverage criteria attributed to them were written for this benchmark; they are not any insurer's policy.

The set is generated, not hand-written: `src/synthetic/generate.ts` builds it deterministically from a fixed seed, and `tests/synthetic.test.ts` checks that the committed files match the generator. Regenerate with `npm run synthetic`.

## What a case holds

| Field | Contents |
| --- | --- |
| `patient` | alias, age, sex |
| `procedure` | CPT code and description |
| `payer` | fictional payer name and plan type |
| `denial` | CARC code and its standard text, optional RARC, the denial as the payer worded it, date of service |
| `criteria` | the payer's medical-necessity criteria as numbered items `crit-1`, `crit-2`, ... |
| `chart` | 15 to 40 dated entries `note-001`, `note-002`, ... in dictation voice, each with a kind and free text |
| `expected` | the grading key: `warranted`, an optional `subtype` when not warranted, the criteria the chart meets, which notes support each criterion, which notes are unrelated, and a one-line rationale |

Charts are written the way a surgeon dictates, not the way a payer checklist reads. The chart says "finished 12 weeks of PT across the street, says it helped while she was there and then right back to baseline"; the criterion says "at least 3 months of conservative treatment without adequate relief." Translating one into the other is the proposer's job, and quoting the chart's own words is how the gate checks it. Roughly half the entries in every chart are unrelated visits (blood pressure checks, a sprained ankle, a refill call) so a citation has to land on the right entry.

## Composition

| Procedure | CPT | Cases |
| --- | --- | --- |
| Bilateral reduction mammaplasty | 19318 | 8 |
| Panniculectomy | 15847 | 7 |
| Upper eyelid blepharoplasty | 15823 | 6 |
| Septoplasty | 30520 | 6 |
| Capsulectomy with implant removal | 19371 | 5 |
| Breast reconstruction with tissue expander | 19357 | 6 |
| Suction lipectomy for lipedema | 15877 | 6 |
| Carpal tunnel release | 64721 | 6 |

CARC codes used: 4, 11, 29, 50, 56, 96, 119, 151, 167, 197. Payers alternate between a standard and a strict criteria profile (longer symptom and treatment durations, flat resection thresholds instead of the Schnur scale), so the same chart can be warranted under one payer and not another.

## Labels

Thirty cases are warranted: the chart documents every criterion and the denial can be answered from the record. Twenty are not, in four subtypes, each a different way an eager drafter goes wrong:

| Subtype | Count | What the chart does |
| --- | --- | --- |
| `absent` | 7 | Never addresses one criterion. An appeal would assert what the record does not contain. |
| `near-miss` | 6 | Raises the criterion but does not meet it: physical therapy was recommended, not completed; the visual field loss is 8 degrees, not 12; the weight is still falling. |
| `wrong-remedy` | 4 | Supports every criterion, but the denial is administrative (timely filing, a modifier error, a benefit maximum, a plan that refuses retrospective review). A medical-necessity appeal is the wrong instrument. |
| `exclusion` | 3 | Contains a documented fact that triggers a categorical plan exclusion, or the plan's criteria state the service is never covered. No chart content can meet it. |

For these twenty, `warranted: false` is the correct answer and the gate's record should show which criterion lacked evidence.
