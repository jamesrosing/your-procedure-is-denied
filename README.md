# The Denial Machine

Oct 26, 2026 · James H. Rosing, MD, FACS

Insurers have built machines that say no at scale. Physicians answer with fax machines and hold music. The denial costs the payer a fraction of a second. The appeal costs the doctor hours, and the patient goes without care while it waits.

The asymmetry is the business model. Most denials are never appealed, and most that are appealed get overturned. Every denial nobody fights is money the insurer keeps, whether the care was necessary or not.

heme exists to end that asymmetry. It gives the physician a machine of their own, and holds that machine to a higher evidence standard than the one used against them.

## The evidence

The largest insurers in the country have been caught denying care by algorithm, and the federal government is now importing the model into traditional Medicare.

| Who | Tool | What it does | The number | Where it stands |
| --- | --- | --- | --- | --- |
| UnitedHealth (naviHealth) | [nH Predict](https://distilinfo.com/2026/03/12/court-orders-unitedhealth-to-disclose-ai-denial-algorithm/) | Predicts how long elderly Medicare Advantage patients "should" stay in post-acute care | Plaintiffs allege a 90% error rate: about 9 in 10 denials reversed on appeal | Class action in discovery, D. Minn.; March 9, 2026 order compels internal records back to 2017 |
| UnitedHealthcare | Post-acute review ([Senate PSI](https://www.healthcaredive.com/news/medicare-advantage-AI-denials-cvs-humana-unitedhealthcare-senate-report/730383/)) | Prior authorization for rehab, skilled nursing, long-term acute care | Post-acute denial rate rose from 8.7% (2019) to 22.7% (2022) | Senate investigation report, October 2024 |
| CVS Health | [Post-Acute Analytics](https://www.healthcaredive.com/news/medicare-advantage-AI-denials-cvs-humana-unitedhealthcare-senate-report/730383/) | AI project to cut skilled nursing spending | Savings target raised from $10M to $15M to $77.3M over 3 years | Senate investigation report, October 2024 |
| Cigna | [PxDx](https://www.healthcaredive.com/news/cigna-lawsuit-algorithm-claims-denials-california/) | Batch-rejects claims where diagnosis and procedure codes do not match its list | 300,000+ claims denied in 2 months of 2022, averaging 1.2 s each; one medical director denied 60,000 in a month | Class action, E.D. Cal., filed July 2023 |
| CMS | [WISeR](https://www.medicaleconomics.com/view/medicare-wiser-prior-authorizations-needed-congress-prior-authorization-lawmakers-say) | AI-supported prior authorization in traditional Medicare; contractors paid from reduced spending | Live since January 2026 in 6 states, covering skin substitutes, nerve stimulators, knee replacements, and cervical fusions | GAO found it is a rule that should have gone to Congress; repeal resolution pending |

The insurers dispute these characterizations. UnitedHealth says nH Predict only guides care planning, and Cigna says PxDx is not AI. A court in Minnesota found the appeal process so futile it waived the exhaustion requirement.

## Why denial pays

In 2023, Medicare Advantage plans denied 3.2 million prior authorization requests. Only 11.7% were appealed, and 81.7% of those appeals won ([KFF](https://www.kff.org/f63a430)). That means about 2.8 million denials stood simply because nobody fought them, even though the denials that were challenged lost more than four times in five.

The cost of fighting falls on the people with the least time. Physicians handle an average of 40 prior authorizations per week, which takes 13 hours of physician and staff time. 79% say patients have abandoned treatment while waiting, and 26% report a serious adverse event, according to the [AMA's 2025 survey](https://www.ama-assn.org/press-center/ama-press-releases/ama-survey-prior-authorization-reform-pledge-falls-short-physicians) released May 2026. Six in ten physicians fear AI will push denial rates higher.

A denial issued in 1.2 seconds that stands nearly nine times in ten because nobody appeals is not a review process. It is a toll booth, and the toll is paid in delayed surgery, unpaid wound care, and physicians who give up appealing.

## The answer: a machine on the physician's side

heme answers every denial the chart can defeat with an appeal the payer has to answer, and it refuses to send any argument it cannot prove from the chart. The payer's algorithm is judged by whether it saves money. Ours is judged by whether every sentence traces to evidence.

1. **heme** is the EHR where the care is documented and the claim originates. It handles FHIR R4, the 837P claim, the 835 remittance, and the 278 prior authorization, so the denial arrives in the same system that holds the chart.
2. **writ** reads the denial and adjudicates it against the payer's own medical-necessity rules. It is fail-closed: if the record does not meet the criteria, it says so instead of arguing anyway.
3. **CHART** supplies those rules. It is a versioned database of payer coverage criteria, so an appeal cites the policy that was in force on the date of service, not one from last year.
4. **The Gladiator** drafts the appeal from the patient's chart and the matching criteria. Every claim in the letter must pass a grounding gate that ties it to a specific chart entry. Anything ungrounded is blocked, not softened.
5. **The physician signs.** The machine does the hours of assembly. The doctor makes the medical judgment and owns the letter.

The insurer's tool can deny 300,000 claims without opening a file. Ours cannot send one appeal without citing one.

## Why Meta open weights

Open weights let an independent practice run the same class of machine the payers run, without sending patient records to a vendor it does not control. A model hosted inside heme's own boundary keeps protected health information where it belongs.

The grounding gate makes the model swappable. If the proposer can be any model and the verifier still blocks every ungrounded sentence, then the practice picks the cheapest model that passes, not the most famous one. That is how a two-surgeon practice affords what a Fortune 50 insurer built.

The hackathon build proves it with numbers: the same 50 synthetic denials run through the current model, Muse Spark, and an open-weights model, each scored on gate pass rate (%), ungrounded claims caught (count), latency (s per appeal), and cost ($ per appeal).

## Sources

- [Court orders UnitedHealth to disclose AI denial algorithm](https://distilinfo.com/2026/03/12/court-orders-unitedhealth-to-disclose-ai-denial-algorithm/), DistilINFO, March 2026
- [Senate report: Medicare Advantage AI denials at CVS, Humana, UnitedHealthcare](https://www.healthcaredive.com/news/medicare-advantage-AI-denials-cvs-humana-unitedhealthcare-senate-report/730383/), Healthcare Dive, October 2024
- [Senate PSI majority staff report on Medicare Advantage](https://www.hsgac.senate.gov/wp-content/uploads/2024.10.17-PSI-Majority-Staff-Report-on-Medicare-Advantage.pdf), October 17, 2024
- [Cigna sued over algorithm used to deny claims](https://www.healthcaredive.com/news/cigna-lawsuit-algorithm-claims-denials-california/), Healthcare Dive, July 2023
- [Medicare Advantage prior authorization, 2023 data](https://www.kff.org/f63a430), KFF
- [AMA survey: prior authorization reform pledge falls short](https://www.ama-assn.org/press-center/ama-press-releases/ama-survey-prior-authorization-reform-pledge-falls-short-physicians), AMA, May 2026
- [Lawmakers say WISeR prior authorizations needed Congress](https://www.medicaleconomics.com/view/medicare-wiser-prior-authorizations-needed-congress-prior-authorization-lawmakers-say), Medical Economics, May 2026
