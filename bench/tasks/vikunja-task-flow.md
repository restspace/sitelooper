# Goal: task flow (Vikunja)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Vikunja at {{APP_URL}}.
Sign in with username `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.

## Objectives

1. In the project named `Bench Project`, report the titles of the tasks whose title starts
   with `Seed:`, exactly as shown.
2. A task titled `<RUNID> Bench Task` exists in `Bench Project`, with a description that
   includes the runid.
3. Its due date is 2026-12-31.
4. Its priority is `High`.
5. It carries the existing label `Backend`.
6. It has a comment whose text includes the runid.
7. Report the task's identifier exactly as the app displays it on the task's page
   (Vikunja shows it as `BENCH-<number>` for this project).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed tasks (titles starting `Seed:`); objective 1 only reads them.
- A task's page edits its fields in place: most save on their own when changed or when
  you leave them, without a Save button for the whole page.
- The label field creates a NEW label from whatever text is typed unless an existing label
  is chosen from its suggestions. Objective 5 needs the existing `Backend` label, not a new
  one with the same name.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (titles, due date, priority, label, identifier). If an objective defeated you,
say so plainly — do not guess a value or claim success you did not verify.
