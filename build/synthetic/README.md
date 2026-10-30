# Synthetic denial set

Fifty fabricated denial cases for the evaluation harness. Nothing here comes from a real record. Patients are `SYN-001` through `SYN-050` with an age and sex only: no names, dates of birth, record numbers, member numbers, or claim numbers exist anywhere in these files. The six payers are fictional, and the coverage criteria attributed to them were written for this benchmark from publicly described policy patterns; they are not any insurer's policy.

The set is generated, not hand-written: `src/synthetic/generate.ts` builds it deterministically from a fixed seed using the templates in `src/synthetic/templates/`, and `tests/synthetic.test.ts` checks that the committed files match the generator. Regenerate with `npm run synthetic`.

## Why this mix

The denial machines documented in the repository README target specific services: post-acute care in Medicare Advantage (nH Predict), inpatient admissions downgraded to observation, code-mismatch batch denials (PxDx), and the WISeR list of skin substitutes, nerve stimulators, knee replacements, and spinal fusions. Those are also where the dollars sit: a denied rehabilitation admission or spinal fusion is worth twenty to forty times a denied office procedure, and a denied oncology drug recurs every cycle. The set is weighted toward those categories so the measured result is about the denials that matter, not the ones that are easy to generate.

Each case carries a `category`, a `setting` (outpatient, inpatient, or post-acute), and `stakesUsd`, an order-of-magnitude typical allowed amount for the denied service. The stakes figures are synthetic reference values for weighting results, not pricing data. Across the set they total about $940,000, of which $568,500 sits in the 30 cases the chart can defend.

| Category | Service | Code | Cases | Stakes per case |
| --- | --- | --- | --- | --- |
| Post-acute care | Inpatient rehabilitation facility admission after stroke | CMG 0104 | 4 | $25,000 |
| Post-acute care | Skilled nursing facility continued stay after hip fracture repair | HIPPS KDOB1 | 4 | $8,000 |
| Inpatient level of care | Sepsis admission denied as observation | MS-DRG 871 | 4 | $12,000 |
| Oncology | Pembrolizumab, first-line metastatic non-small cell lung cancer | HCPCS J9271 | 3 | $11,000 per cycle |
| Oncology | Intensity modulated radiation, left breast | CPT 77301 | 3 | $25,000 |
| Oncology | Next-generation sequencing panel, metastatic colorectal cancer | CPT 81455 | 2 | $3,500 |
| Vascular surgery | Femoral-popliteal revascularization for limb-threatening ischemia | CPT 37227 | 4 | $15,000 |
| Vascular surgery | Carotid endarterectomy after transient ischemic attack | CPT 35301 | 2 | $18,000 |
| Cardiology | Implantable cardioverter-defibrillator | CPT 33249 | 3 | $35,000 |
| Cardiology | Coronary stent for refractory stable angina | CPT 92928 | 2 | $20,000 |
| Spine surgery | Lumbar interbody fusion for spondylolisthesis | CPT 22630 | 3 | $45,000 |
| Spine surgery | Spinal cord stimulator implant | CPT 63685 | 2 | $40,000 |
| Orthopedic surgery | Total knee arthroplasty | CPT 27447 | 3 | $25,000 |
| Wound care | Skin substitute for diabetic foot ulcer | CPT 15271 | 3 | $8,000 |
| Biologic therapy | Infliximab induction for Crohn disease | HCPCS J1745 | 2 | $6,000 |
| Bariatric surgery | Laparoscopic sleeve gastrectomy | CPT 43775 | 2 | $18,000 |
| Plastic surgery | Bilateral reduction mammaplasty | CPT 19318 | 2 | $9,000 |
| Plastic surgery | Post-mastectomy reconstruction with tissue expander | CPT 19357 | 2 | $12,000 |

CARC codes used: 4, 11, 29, 50, 56, 96, 119, 151, 167, 197. Payers alternate between a standard and a strict criteria profile (longer treatment durations, flat thresholds), and the post-acute cases all sit with the Medicare Advantage payer, where that review happens.

## What a case holds

| Field | Contents |
| --- | --- |
| `category`, `setting`, `stakesUsd` | service category, care setting, approximate dollars at stake |
| `patient` | alias, age, sex |
| `procedure` | code, code system (CPT, HCPCS, MS-DRG, CMG, or HIPPS), description |
| `payer` | fictional payer name and plan type |
| `denial` | CARC code and its standard text, optional RARC, the denial as the payer worded it, the date of service, and for continued stays the last denied day |
| `criteria` | the payer's coverage criteria as numbered items `crit-1`, `crit-2`, ... |
| `chart` | 19 to 35 dated entries `note-001`, `note-002`, ... in dictation voice, each with a kind and free text; about two thirds are routine traffic unrelated to the denial |
| `expected` | the grading key: `warranted`, an optional `subtype` when not warranted, the criteria the chart meets, which notes support each criterion, which notes are unrelated, and a one-line rationale |

Charts are written the way clinicians dictate, not the way a payer checklist reads. The therapy note says "ambulation 40 feet to 110 feet with the rolling walker and contact guard"; the criterion says "documented, measurable functional progress toward the goals in the plan of care." Translating one into the other is the proposer's job, and quoting the chart's own words is how the gate checks it. Roughly half the entries in every chart are routine traffic (a fall-risk assessment, a cholesterol call, a dietitian consult) so a citation has to land on the right entry.

## Labels

Thirty cases are warranted: the chart documents every criterion and the denial can be answered from the record. Twenty are not, in four subtypes, each a different way an eager drafter goes wrong:

| Subtype | Count | What the chart does |
| --- | --- | --- |
| `absent` | 6 | Never addresses one criterion: no lactate or hypotension in the sepsis chart, no comparison plan for IMRT, no stenosis measurement before carotid surgery, no instability films before fusion, no conservative care before knee replacement, no perfusion study before a skin substitute. |
| `near-miss` | 7 | Raises the criterion but does not meet it: the stroke patient tolerates 90 minutes of therapy a day, not 3 hours; a second stroke chart names the intensity of therapy only in passing, in its screening and progress notes, and never documents the three hours (case-023, relabeled from absent on 2026-10-30, text unchanged); the hip fracture patient has plateaued; the sepsis patient went home the next morning; the claudicant never did supervised exercise; the ejection fraction recovered to 38 percent; the stimulator trial gave 30 percent relief. |
| `wrong-remedy` | 4 | Supports every criterion, but the denial is administrative: skilled nursing benefit days exhausted, an invalid modifier pair on a stent claim, an infusion given with no authorization under a plan that refuses retrospective review, a reconstruction claim filed late. A medical-necessity appeal is the wrong instrument. |
| `exclusion` | 3 | Contains a documented fact that triggers a categorical exclusion (an EGFR mutation that makes immunotherapy the wrong first-line drug), or the plan's criteria say the service is never covered (large sequencing panels, bariatric surgery). No chart content can meet it. |

For these twenty, `warranted: false` is the correct answer and the gate's record should show which criterion lacked evidence.
