# The video: the author's own introduction, then the page control by control, with the live run cut in

Three minutes, one screen recording of <https://demo.hemeehr.com/> at 1920 by 1080 with one 11-second terminal clip cut in at 1:32, one voice track. The script is the author's own words (Nov 1): who is speaking, the problem, one case, how the system works on it, what was found, and what comes next. The picture is timed to the words: every click lands at its beat's first word at 140 words a minute, and the presenter spotlight (`window.ypid.spotlight`, build/viewer/src/spotlight.ts) rings the part of the page being spoken about, so the speaker reading over the picture sees what to say and the viewer sees where to look. 404 spoken words; speech ends at about 2:56, then the writ holds to 3:00. `narration.srt` carries the same words as 32 caption cues on these planned times; after the cut, the cues are re-timed to the recording. The take is recorded twice, in the dark theme and in the light, the same seconds in both; the author picks one for the cut.

The featured case is case-025: intensity modulated radiation therapy planning after lumpectomy for breast cancer, a 47-year-old woman, denied by a Medicare Advantage plan as not medically necessary, $25,000 at stake; the muse-spark-1.3 live-CHART run read 6 of 27 entries and all 8 sentences verified, and every kept run of the case passed. The decline is case-044 on muse-wonder-1.0. The browser take is recorded headlessly from the live page by a script that presses each control at its planned second and calls the spotlight at the word it belongs to; it is not recorded by hand. The take opens on this deep link with `i` pressed at 0:00:

<https://demo.hemeehr.com/#file=meta-muse-spark-1.3-low-agentic-chart-2026-10-28T06-48-41-422Z.json&case=case-025&step=0>

| Start | Screen | Do | Spotlight | Say | Words | Read at 140 wpm / beat |
| --- | --- | --- | --- | --- | --- | --- |
| 0:03 | The typed opening over the page | Before the take: the page open at the deep link, F11, dark theme. At 0:00 press i. The three lines type for 22 s, hold, and travel to the bottom; the stamp says what this line says. Speak from 0:03. | none | My name is James Rosing. I'm a physician and surgeon in Newport Beach, California, and this is my entry. Everything you'll see, I built this week, on top of my own record system, appeal engine, and coverage index. | 38 | 16.3 s / 16 s |
| 0:19 | The opening lands on case-025 at rest | Nothing to click. The block travels to the bottom at about 0:27 and case-025 sits at step 0 underneath: the chart column dim, the payer's reason over the three criteria, the draft panel empty. | none | The problem is simple. When an insurer denies a claim, a machine does it in about a second. If the physician appeals, they do it by hand, which takes hours. For this reason most denials are never answered. | 38 | 16.3 s / 16 s |
| 0:35 | The case header, then the three columns in turn | The spotlight moves with the words: the case header, then the chart, the rules, the appeal. At "one of fifty" the case picker opens for a moment, showing the fifty cases, and closes. | 0:35 context; 0:51 chart; 0:53 criteria; 0:56 draft | This is one of fifty synthetic cases without any real patient data: a 47-year-old woman undergoes radiation planning after lumpectomy for breast cancer, denied by her Medicare Advantage plan as not medically necessary. Her chart is on the left, the insurance plan's rules in the middle, and the appeal on the right. | 52 | 22.3 s / 22 s |
| 0:57 | The replay of case-025 to PASS | Press Space (or click Play) at the beat's first word. The live-query strip, then six entries light and open, quotes attach to the three criteria, eight sentences stamp, PASS; about 9 s at 1x. | 0:57 strip; 1:03 chart; 1:06 sentences; 1:22 verdict | Now watch: Spark 1.3 asks my coverage index when this plan's rules last changed, then opens only the entries it needs. Every sentence it writes cites one entry and quotes it. Then a deterministic gate verifies the quote is in that entry and every number, date, code, and side is sourced accurately. The gate is not a model. Eight of eight. Pass. | 62 | 26.6 s / 27 s |
| 1:24 | The gate tested by hand | Click "test the gate" under the fourth sentence (mean heart dose of 6.1 Gy). In the box change 6.1 to 8.1, click check: the stamp turns refuted, live. Click restore. | 1:24 sentence:3 | Try it yourself. Change one number in a verified sentence, and the gate refuses it, right in the browser. | 19 | 8.1 s / 8 s |
| 1:32 | The live run in the terminal (the second clip, cut in here) | The terminal clip, recorded separately: npm run live -- --case case-025 streaming one line per tool call, then the verdict block ending on the record hash. The browser take holds on the restored sentence underneath and is replaced by the clip. | 1:32 clear | Live, not a replay: the same case in a terminal, the model saying why it opens each entry, ending on the record hash the page shows. | 26 | 11.1 s / 11 s |
| 1:43 | case-044 on Muse Wonder, DECLINED | Run picker: the muse-wonder-1.0 run. Case picker: case-044. Press End: DECLINED, the reason naming the sepsis criterion. | 1:43 clear; 1:47 chart; 1:51 verdict | When the chart can't answer, it says so. Muse Wonder read all twenty-two entries for the sepsis criterion, found nothing, declined and named it. | 24 | 10.3 s / 10 s |
| 1:53 | The scoreboard | Click the Scoreboard tab (or press s): one row per kept run. At "nine runs" the run picker opens for a moment, the nine runs listed, and closes. At 2:02 the Figures tab (or f): the paper's figures and tables, each a frame of this replay. At 2:07 case picker case-025 and the Compare tab (or c): the three models on the case, side by side, four seconds before the words. | 1:53 board; 2:02 figures; 2:07 compare | Here are nine runs using three Meta models including the open-weights one. Agreement with the key, forty-five to fifty of fifty. Not a single fabricated quote in a sentence and using Spark 1.3 kept it under a dollar a run. | 40 | 17.1 s / 17 s |
| 2:11 | Compare, three models on one case | Already on Compare since 2:07; the words land on the grid. | 2:11 compare | Three models, one case, side by side. | 7 | 3.0 s / 3 s |
| 2:14 | The writ | Click Replay. Run picker: the muse-spark-1.3 run; case-025 stays. Press End. On the PASS row click "the writ": the instrument opens below. | 2:14 writ; 2:19 writ-footnotes; 2:22 writ-reason | And the writ, which is the draft that I would sign. Every sentence is footnoted to the entry it quotes, with the plan's denial reason fully answered. | 27 | 11.6 s / 12 s |
| 2:25 | Print, save as text | Hover print, click save .txt. | 2:25 writ-tools | This can be printed or saved, but remains a draft. Nothing signed leaves the page. | 15 | 6.4 s / 6 s |
| 2:32 | The close, the signature line in frame | Hold on the writ to 3:00. Speech ends at about 2:56. | 2:32 writ-signature | What I discovered: with a check outside the model holding every sentence to the record, these models draft a consistently true and valid appeal in seconds, for cents. I challenged the gate with nine and a half thousand injected fabrications; every hard one was caught. Next, my own practice first, then a method for prior authorizations. | 56 | 24.0 s / 28 s |

## The terminal clip: the live run, recorded as a second clip

Eleven seconds in the cut, between "test the gate" and the decline. Recorded by the author from `build/`, at 1920 by 1080, a terminal at least 140 columns wide in a large font, dark theme; it is a live model call, so the reads and the whys differ from take to take; the verdict is PASS as in every kept run of case-025, and the record hash is the same every time. `.env` holds `MODEL_API_KEY` and the CHART key; the run costs about three cents and writes no file.

```
cd ~/projects/your-procedure-is-denied/build && clear && npm run live -- --case case-025
```

The screen shows the command; within seconds the `list_entries` and `policy_status` lines, the latter with the typed answer (`live cms: criteria last changed 2026-09-27, last checked 2026-09-28`); one line per `read_entry` with the model's stated reason; then the verdict block:

```
verdict PASS  8 of 8 sentences verified  gate v1.5
input hash    <64 hex characters; a new draft, so a new value every run>
sources hash  6f43998d3d119ae70b3427a63e99d1bad449739b13a995676b8e693fb4840578
```

The sentence count may differ from eight; the gate must read v1.5; the sources hash is the record alone and the viewer's case header shows its first twelve characters as `record 6f43998d3d11`. In the cut, keep the command and the first streaming lines (about 5 s), then the verdict block (about 6 s); the wait between them is dropped.

## The cut

- The browser take runs the full 3:00 with its clicks at the beat seconds above; between 1:32 and 1:43 it holds on the restored sentence and is replaced by the terminal clip.
- Voice track laid at 0:03. Add `narration.srt` as the caption track after re-timing to the cut.

## Every number spoken, and its source

- Built this week; pre-existing record system, appeal engine, coverage index: NEW-WORK.md, What this builds on (heme, writ, CHART, LITMUS); README, What this is, and is not; the viewer's `INTRO_STAMP` says the same.
- A second to deny, hours to appeal, most never answered: README 1.1 (Cigna PxDx 1.2 s per denial; AMA 13 h/week; KFF 11.7 percent of in-network denials appealed).
- Fifty synthetic cases, no real patient data: build/synthetic/README.md and README 2.3; the Ethics declaration.
- The 47-year-old, IMRT after lumpectomy, Medicare Advantage, not medically necessary: build/synthetic/cases/case-025.json (patient, procedure, payer, denial CARC 50).
- The coverage index query, the entries opened, eight of eight, PASS: the case-025 result in the muse-spark-1.3 live-CHART run (`trace`, `reading.entriesRead` 6 of 27, `gate.counts`, `gate.verdict`).
- The gate's checks (quote, number, date, code, side), not a model: README 2.4, build/src/litmus.ts v1.5.
- 6.1 to 8.1 Gy refuted in the browser: build/viewer/src/gatecheck.ts over case-025 sentence 4; 8.1 is in no admissible source.
- The live run, the why, the record hash: `verboseLine` and `verboseVerdict` in build/src/harness.ts; `sourcesHash` in build/src/sources.ts, shown as `record` in the viewer's case header; README 2.8 and 2.9.
- Twenty-two entries read, declined naming the sepsis criterion: the case-044 result in the muse-wonder-1.0 live-CHART run.
- Nine runs, three Meta models, one open weights; agreement 45 to 50 of 50; no fabricated quote in a sentence; Spark 1.3 at $0.63 to $0.96 a run: README Table 1 and the abstract.
- The writ, footnotes, the plan's reason answered, print and save: build/viewer/src/writ.ts, README 2.2 and Figure 8; nothing is signed or sent.
- Seconds and cents: Table 1, median latency 4.3 to 16.3 s, $0.007 to $0.054 a case. Nine and a half thousand fabrications, every hard one caught: Table 3, 9,518 injected, 5,824 of 5,824 hard caught under v1.5 (collision and soft classes pass by design, README 4.3).
- My own practice first, then prior authorization: README 4.7 and the Declarations.

## Supersedes

The Oct 31 plan (an introduction read from the abstract, then the page) and `SHOT-LIST.md` (Oct 29 to 31, ten cut shots). The author replaced the abstract reading with his own introduction and script on Nov 1, moved the featured case from case-001 to case-025, and asked for the spotlight so the picture leads the words. The shot list stays as the record of the step addresses.
