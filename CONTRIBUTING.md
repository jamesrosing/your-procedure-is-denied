# Contributing

This repository is a public record of work on insurer claim denials and the LITMUS standard. Contributions of evidence, corrections, and critique are welcome from physicians, billers, patients, people who work at payers, and engineers.

## The one rule that cannot be bent

**No real patient data. Ever.**

Do not include protected health information (PHI) in an issue, pull request, comment, commit, file, screenshot, or log. This includes names, dates of service, member or claim numbers, provider NPIs tied to a specific encounter, free text from a real chart, or any detail that could identify a patient in combination with other information. De-identification is not sufficient; synthetic data is the only kind accepted here. If you are unsure whether something counts, it does. Leave it out.

If you post PHI by mistake, do not try to fix it by editing. Report it immediately as described in [SECURITY.md](SECURITY.md) so the history can be purged.

## What is most useful

Field reports. What you have seen inside a practice, a billing office, or a payer that the README gets wrong, overstates, or misses. Use the field report issue template.

Corrections. A figure, date, case status, or citation that is inaccurate or out of date. Use the correction template and link the source.

Critique of the standard. Arguments that LITMUS is wrong, unworkable, or incomplete. These are as valuable as agreement.

Code, once there is code. The hackathon work will land here. When it does, pull requests that add tests, fix defects, or improve verification are welcome.

## How to contribute

Open an issue first for anything beyond a typo. It saves both of us time when the change is one I would not merge.

For pull requests: fork the repository, make the change on a branch, and open a pull request against `main`. Keep each pull request to one logical change. Fill in the template. The pull request must affirm that it contains no real patient data.

Prose follows the style of the README: plain sentences, figures with units, allegations described as allegations, and a cited source for every number.

## Licensing of contributions

By contributing you agree that your contribution is licensed under the same terms as the repository: Apache-2.0 for code and CC BY 4.0 for written content. See [LICENSE](LICENSE) and [LICENSE-CONTENT.md](LICENSE-CONTENT.md).

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
