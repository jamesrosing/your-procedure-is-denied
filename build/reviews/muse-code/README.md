# Reviews of this repository by Meta's coding agent

Two headless runs of Muse Code, Meta's terminal coding agent, against a read-only clone of this repository at commit 4cafe9f, on the night of November 1 to 2, 2026, after the second cycle of the author's own three-agent review. Each folder holds the report as the agent printed it, the prompt it was given, its stderr, the complete local trace it wrote, the exported session trajectory, the settings in force, and a RUN.md with the exact command and the facts of the run. Nothing in the reports was edited.

| Folder | Model | Effort | Workspace | Outcome |
|---|---|---|---|---|
| `2026-11-01-muse-spark-1.3-high/` | muse-spark-1.3 | high | untrusted, single agent | 4 blockers, 2 serious, 5 minor, 1 nit |
| `2026-11-02-muse-wonder-1.0-xhigh/` | muse-wonder-1.0 | xhigh (ultra closed to this account) | trusted | 4 blockers, 7 serious, 9 minor, 3 nits |

What the two runs agree on, and what the author's review had not found: the gate's hard-token vocabulary has classes it never had (a count written as "one" or "a", a date written with a month name, a side written R or L, a code whose letter or system word is wrong), a two-stopword quote satisfies the verbatim bar, and numbers can be recombined from a date or from vitals in the cited entry. None of these moves a stored verdict; none is among the spike-in's 9,518 corruptions. The findings are the work list for the next gate version, each as a new spike-in class. The reports' file links point into the clones' temporary paths; read them as `build/<path>:<line>`.
