# The video as one take, with the live run cut in: an introduction, the page control by control, and the terminal

Three minutes, one screen recording of <https://demo.hemeehr.com/> at 1920 by 1080 with one 11-second terminal clip cut in at 1:32, one voice track. The introduction is the abstract's own sentences (the opening two and the question) with one spoken line on what is prior work and what was built during the event; the walkthrough is the page's controls in the order a first visitor would press them, broken once for the live run in the terminal; the close is the abstract's last sentence. 380 spoken words, sized at 140 words a minute; speech ends at about 2:50, which leaves the clicks their time. `narration.srt` carries the same words as 25 caption cues on these planned times; after the cut, the cues are re-timed to the recording.

Recording: the browser picture is already recorded, one take with the clicks at the planned seconds, from the first version of this plan; it is not re-recorded. The voice is read in Audacity from the script below while the picture plays, so the words follow the action. The terminal clip is recorded on its own (see the next section) and cut in. Browser at 100 percent, F11, dark theme, cursor on (it is part of the walkthrough). The browser take opens on this deep link with `i` pressed at 0:00:

<https://demo.hemeehr.com/#file=meta-muse-spark-1.3-low-agentic-chart-2026-10-28T06-48-41-422Z.json&case=case-001&step=0>

| Start | Screen | Do | Say | Words | Read at 140 wpm / beat |
| --- | --- | --- | --- | --- | --- |
| 0:03 | The typed opening over the page | Before the take: the page open at the deep link below, F11 full screen, dark theme, cursor off the page. At 0:00 press i. The three lines type for 22 s, hold, and travel to the bottom. Speak from 0:03. | The insurer has given the denial to a machine, and the machine answers in seconds. The physician has been given nothing, and must meet in hours what was done in an instant, so most denials are never met at all. | 40 | 17.1 s / 17 s |
| 0:20 | The typed stamp, still on screen | Nothing to do; the third line is finishing (it completes about 22.5 s in). The prior-versus-new line is spoken over the stamp that says the same thing, so a listener who never reads the screen hears it. | Everything shown was built this week, on my pre-existing record system, appeal engine, and coverage index. | 16 | 6.9 s / 7 s |
| 0:27 | The block holds, then travels to the bottom | Nothing moves but the block. Finish the question as it lands. | I asked whether Meta's models, one of them open weights, could prepare that reply from the chart, with every sentence held to the record by a deterministic check, and decline when the record could not support one. | 37 | 15.9 s / 16 s |
| 0:43 | case-001 at rest, three columns | Nothing moves. The opening has landed on case-001 at step 0: the chart column dim, the payer's reason over the four criteria, the draft panel empty. | Fifty synthetic denials, no real patient anywhere; thirty the chart can answer, twenty it cannot. Left to right: the physician's record, the payer's rules under the payer's own reason, and the appeal. | 32 | 13.7 s / 14 s |
| 0:57 | The replay of case-001 to PASS | Say "Play" and press Space (or click Play). The live-query strip, then eleven entries light and open, quotes attach to the criteria, eight sentences stamp, PASS; 10.7 s at 1x. | Play. Spark 1.3 first asks my coverage index when this payer's criteria last changed, then opens only the entries it needs, eleven of twenty-six. Every sentence cites one entry and quotes it. A deterministic gate, not a model, checks that the quote is in that entry and that every number, date, code, and side is sourced. Eight of eight. Pass. | 60 | 25.7 s / 26 s |
| 1:23 | The gate tested by hand | Click "test the gate" under the fourth sentence (ambulation 40 feet to 110 feet). In the box change 110 to 150, click check: the stamp turns refuted, live. Click restore. | Test the gate yourself: change one number in a verified sentence and it refutes the edit, in the browser. | 19 | 8.1 s / 9 s |
| 1:32 | The live run in the terminal (the second clip, cut in here) | The terminal clip, recorded separately (below): `npm run live -- --case case-001` streaming one line per tool call, then the verdict block ending on the record hash. The browser take resumes at 1:43 from its own 1:32. | Live, not a replay: Spark 1.3 reads the chart, says why it opens each entry, and ends on the record hash the page shows. | 24 | 10.3 s / 11 s |
| 1:43 | case-044 on Muse Wonder, DECLINED | Run picker: the muse-wonder-1.0 run ("muse-wonder-1.0, meta, agentic, live CHART, 2026-10-28"). Case picker: case-044. Press End (or the last transport button): DECLINED, the reason naming the sepsis criterion. | A case the chart cannot answer: Muse Wonder read all twenty-two entries looking for the sepsis criterion, found nothing, and declined, naming it. Declining is the right answer for twenty of the fifty. | 33 | 14.1 s / 15 s |
| 1:58 | The scoreboard | Click the Scoreboard tab (or press s). One row per kept run. | The scoreboard: nine kept runs; agreement with the key, forty-five to fifty of fifty; no fabricated quote in any sentence; Spark 1.3 under a dollar a run. | 27 | 11.6 s / 12 s |
| 2:10 | Compare, three models on one case | Case picker: case-001. Then click the Compare tab (or press c): the three models on case-001 side by side. In the cut this beat keeps the first 5 s of the browser take's 11. | Compare: three models, one case, side by side, every sentence stamped. | 11 | 4.7 s / 5 s |
| 2:15 | The writ | Click Replay. Run picker: the muse-spark-1.3 run ("muse-spark-1.3, meta, agentic, live CHART, 2026-10-28"); case-001 stays. Press End. On the PASS row click "the writ". The instrument opens below: the band, the heading, the footnoted sentences, the blank signature line. | Back to the pass, and the writ: the draft as the instrument the physician would sign, every sentence footnoted to the entry it quotes, the plan's own reason answered, the signature line blank. | 33 | 14.1 s / 15 s |
| 2:30 | Print, save as text | Click print: the browser's print dialog opens on the sheet (Save as PDF). Cancel. Click save .txt: the file downloads. In the cut this beat keeps 5 s of the browser take's 8: trim the dialog hold, keep the clicks. | Print it or save it as text; nothing leaves this page signed. | 12 | 5.1 s / 5 s |
| 2:35 | The close | Hold on the writ, the signature line in frame, to 3:00. Speech ends at about 2:50. | The gate verifies that a statement is in the record, not that the record satisfies the criterion. The machine prepares the instrument and cannot issue it. The physician's signature is what makes the draft a writ. | 36 | 15.4 s / 25 s |

Against the first version of this plan (Oct 31, morning): the run-picker sentence at 0:36 is out (nine kept runs are spoken again at the scoreboard, three models at Compare) and the prior-versus-new line is in at 0:20, spoken over the typed stamp that says the same; the terminal run takes 11 seconds at 1:32, paid for by 6 seconds of the Compare beat, 3 of the print-and-save beat, and 2 of the silent hold at the close; "test the gate" keeps its full 9 seconds. The total stays 3:00.

## The terminal clip: the live run, recorded as a second clip

Eleven seconds in the cut, at 1:32 to 1:43, between "test the gate" and case-044. Recorded on its own, from `build/`, at 1920 by 1080 in the same dark theme as the browser take; it is a live model call, so the reads and the whys differ from take to take, the verdict is PASS as in every kept run of case-001, and the record hash is the same every time.

Before pressing record: a terminal at least 140 columns wide, a large font (the verdict block's hash lines are 78 characters; nothing should wrap), the working directory `build/`, the screen cleared, the prompt alone. `.env` holds `MODEL_API_KEY` and the CHART key; the run costs about three cents and writes no file.

The one command:

```
cd ~/projects/your-procedure-is-denied/build && clear && npm run live -- --case case-001
```

What the screen shows, in order: the command; within about two seconds the first streaming line, `policy_status` for the payer with `ok` and the typed answer (`live cms: criteria last changed 2026-09-27, last checked 2026-09-28`); then one line per `read_entry`, each with the time since the start, the entry id, `ok`, and the model's stated reason for opening it; after about fifteen to twenty seconds the verdict block:

```
verdict PASS  8 of 8 sentences verified  gate v1.5
input hash    <64 hex characters; a new draft, so a new value every run>
sources hash  4ee7910eac9e68249b823addf1e7b82afffc7045d9b66f7a019f44b46d6891eb
```

The sentence count may differ from eight; the gate is v1.5 (the kept runs were re-gated to it on Oct 31, so the replay and the terminal name the same version); the sources hash is the record alone and the viewer's case header shows its first twelve characters as `record 4ee7910eac9e`. Retake if the verdict is not PASS or a line wraps. In the cut, keep the command and the first four or five streaming lines (about 5 s), then the verdict block (about 6 s); the wait between them is dropped.

## The cut

- Browser take 0:00 to 1:32, as recorded, at 0:00.
- Terminal clip, 11 s, at 1:32.
- Browser take 1:32 to 2:04 (case-044, the scoreboard, and the first 5 s of Compare) at 1:43.
- Browser take 2:10 to 2:30 (the writ and 5 s of print-and-save) at 2:15; if the save click falls after 2:30 in the take, trim the dialog hold instead and keep the clicks.
- Browser take 2:33 to 2:58 (the close) at 2:35, ending at 3:00.
- Voice track laid at 0:03; the words from 1:43 on fall 11 s later than in the first plan, as the table above times them. Add `narration.srt` as the caption track after re-timing to the cut.

## Every number spoken, and its source

- Seconds, hours, most denials never met: README 1.1 (KFF: 11.7 percent of in-network denials appealed).
- Built this week; pre-existing record system, appeal engine, coverage index: NEW-WORK.md, What this builds on (heme, writ, CHART, LITMUS); README, What this is, and is not; the viewer's `INTRO_STAMP` (build/viewer/src/replay.ts) says the same.
- Fifty synthetic denials, thirty answerable and twenty not: build/synthetic/README.md and README 2.3.
- Eleven of twenty-six entries, eight of eight sentences, PASS: the case-001 result in the muse-spark-1.3 live-CHART run (`reading.entriesRead`, `gate.sentences`, `gate.verdict`); unchanged by the Oct 31 re-gate to v1.5.
- The gate's checks (quote, number, date, code, side): README 2.4, build/src/litmus.ts v1.5.
- 110 feet to 150 feet refuted in the browser: build/viewer/src/gatecheck.ts over case-001 sentence 4; 150 is in no entry.
- The live run, the why, the record hash: `verboseLine` and `verboseVerdict` in build/src/harness.ts; `sourcesHash` in build/src/sources.ts over the chart, criteria, denial, and case facts (no draft), shown as `record` in the viewer's case header (`renderContext` in build/viewer/src/main.ts); README 2.8 and 2.9.
- Twenty-two entries read, declined naming the sepsis criterion: the case-044 result in the muse-wonder-1.0 live-CHART run (`reading.entriesRead` 22 of 22, `gate.verdict` declined, `declinedReason` names crit-1).
- Nine kept runs; agreement 45 to 50 of 50; no fabricated quote in a sentence; Spark 1.3 at $0.63 to $0.96 a run: README Table 1 and the abstract (re-checked Oct 31 evening against the re-gated files: no number moved).
- The writ, print and save as text: build/viewer/src/writ.ts, README 2.2 and Figure 8; nothing is signed or sent.
- The close: the abstract's last sentence; README 4.3 and 5.

## Supersedes

`SHOT-LIST.md` (Oct 29 to 31) planned the same three minutes as ten separately recorded shots cut to slots; the author chose one continuous take with a spoken introduction instead (Oct 31). Its shot 8, the live run in the terminal, returns here as the one clip cut into the take (Oct 31, evening, after review). The shot list stays as the record of the step addresses and the sourced numbers.
