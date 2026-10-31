# The video as one take: an introduction, then the page, control by control

Three minutes, one screen recording of <https://demo.hemeehr.com/> at 1920 by 1080, one voice track. The introduction is the abstract's own sentences (the opening two and the question), the walkthrough is the page's controls in the order a first visitor would press them, the close is the abstract's last sentence. 376 spoken words, sized at 140 words a minute; speech ends at about 2:48, which leaves the clicks their time. `narration.srt` carries the same words as 23 caption cues on these planned times; after the take, the cues are re-timed to the recording.

Recording: voice first, in Audacity, from the script below; then the screen in OBS at 30 fps while the voice plays in headphones, following the action column, so the picture follows the words. Browser at 100 percent, F11, dark theme, cursor on (it is part of the walkthrough). Open before the take, and press `i` at 0:00:

<https://demo.hemeehr.com/#file=meta-muse-spark-1.3-low-agentic-chart-2026-10-28T06-48-41-422Z.json&case=case-001&step=0>

| Start | Screen | Do | Say | Words | Read at 140 wpm / beat |
| --- | --- | --- | --- | --- | --- |
| 0:03 | The typed opening over the page | Before the take: the page open at the deep link below, F11 full screen, dark theme, cursor off the page. At 0:00 press i. The three lines type for 22 s, hold, and travel to the bottom. Speak from 0:03. | The insurer has given the denial to a machine, and the machine answers in seconds. The physician has been given nothing, and must meet in hours what was done in an instant, so most denials are never met at all. I asked whether Meta's models, one of them open weights, could prepare that reply from the chart, with every sentence held to the record by a deterministic check, and decline when the record could not support one. | 77 | 33.0 s / 33 s |
| 0:36 | case-001 at rest, three columns | Nothing moves. The opening has landed on case-001 at step 0: the chart column dim, the payer's reason over the four criteria, the draft panel empty. | Fifty synthetic denials, no real patient anywhere; thirty the chart can answer, twenty it cannot. Left to right: the physician's record, the payer's rules under the payer's own reason, and the appeal. The run picker holds nine kept runs on three Meta models; the case picker, the fifty cases. | 49 | 21.0 s / 21 s |
| 0:57 | The replay of case-001 to PASS | Say "Play" and press Space (or click Play). The live-query strip, then eleven entries light and open, quotes attach to the criteria, eight sentences stamp, PASS; 10.7 s at 1x. | Play. Spark 1.3 first asks my coverage index when this payer's criteria last changed, then opens only the entries it needs, eleven of twenty-six. Every sentence cites one entry and quotes it. A deterministic gate, not a model, checks that the quote is in that entry and that every number, date, code, and side is sourced. Eight of eight. Pass. | 60 | 25.7 s / 26 s |
| 1:23 | The gate tested by hand | Click "test the gate" under the fourth sentence (ambulation 40 feet to 110 feet). In the box change 110 to 150, click check: the stamp turns refuted, live. Click restore. | Test the gate yourself: change one number in a verified sentence and it refutes the edit, in the browser. | 19 | 8.1 s / 9 s |
| 1:32 | case-044 on Muse Wonder, DECLINED | Run picker: the muse-wonder-1.0 run ("muse-wonder-1.0, meta, agentic, live CHART, 2026-10-28"). Case picker: case-044. Press End (or the last transport button): DECLINED, the reason naming the sepsis criterion. | A case the chart cannot answer: Muse Wonder read all twenty-two entries looking for the sepsis criterion, found nothing, and declined, naming it. Declining is the right answer for twenty of the fifty. | 33 | 14.1 s / 15 s |
| 1:47 | The scoreboard | Click the Scoreboard tab (or press s). One row per kept run. | The scoreboard: nine kept runs; agreement with the key, forty-five to fifty of fifty; no fabricated quote in any sentence; Spark 1.3 under a dollar a run. | 27 | 11.6 s / 12 s |
| 1:59 | Compare, three models on one case | Case picker: case-001. Then click the Compare tab (or press c): the three models on case-001 side by side. | Compare: the three models on one case, side by side; the entries each opened, in order, every sentence with its stamp, and the verdicts. | 24 | 10.3 s / 11 s |
| 2:10 | The writ | Click Replay. Run picker: the muse-spark-1.3 run ("muse-spark-1.3, meta, agentic, live CHART, 2026-10-28"); case-001 stays. Press End. On the PASS row click "the writ". The instrument opens below: the band, the heading, the footnoted sentences, the blank signature line. | Back to the pass, and the writ: the draft as the instrument the physician would sign, every sentence footnoted to the entry it quotes, the plan's own reason answered, the signature line blank. | 33 | 14.1 s / 15 s |
| 2:25 | Print, save as text | Click print: the browser's print dialog opens on the sheet (Save as PDF). Cancel. Click save .txt: the file downloads. | Print it, or save it as text, and it is still a draft; nothing leaves this page signed. | 18 | 7.7 s / 8 s |
| 2:33 | The close | Hold on the writ, the signature line in frame, to the end. Stop the recording three seconds after the last word. | The gate verifies that a statement is in the record, not that the record satisfies the criterion. The machine prepares the instrument and cannot issue it. The physician's signature is what makes the draft a writ. | 36 | 15.4 s / 27 s |

## Every number spoken, and its source

- Seconds, hours, most denials never met: README 1.1 (KFF: 11.7 percent of in-network denials appealed).
- Fifty synthetic denials, thirty answerable and twenty not: build/synthetic/README.md and README 2.3.
- Nine kept runs on three Meta models: README Table 1.
- Eleven of twenty-six entries, eight of eight sentences, PASS: the case-001 result in the muse-spark-1.3 live-CHART run (`reading.entriesRead`, `gate.sentences`, `gate.verdict`).
- The gate's checks (quote, number, date, code, side): README 2.4, build/src/litmus.ts.
- 110 feet to 150 feet refuted in the browser: build/viewer/src/gatecheck.ts over case-001 sentence 4; 150 is in no entry.
- Twenty-two entries read, declined naming the sepsis criterion: the case-044 result in the muse-wonder-1.0 live-CHART run.
- Agreement 45 to 50 of 50, no fabricated quote, Spark 1.3 at $0.63 to $0.96 a run: README Table 1 and the abstract.
- The writ, print and save as text: build/viewer/src/writ.ts, README 2.2 and Figure 8; nothing is signed or sent.
- The close: the abstract's last sentence; README 4.3 and 5.

## Supersedes

`SHOT-LIST.md` (Oct 29 to 31) planned the same three minutes as ten separately recorded shots cut to slots; the author chose one continuous take with a spoken introduction instead (Oct 31). The shot list stays as the record of the step addresses and the sourced numbers.
