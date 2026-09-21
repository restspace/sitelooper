# Goal: work package flow (OpenProject)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is OpenProject at {{APP_URL}}.
Sign in with username `{{APP_EMAIL}}` and password `{{APP_PASSWORD}}`.

## Objectives

1. In the project named `Bench Project`, report the subjects of the work packages whose
   subject starts with `Seed:`, exactly as shown.
2. A work package of type `Task` titled `<RUNID> Bench Work Package` exists in
   `Bench Project`, with a description that includes the runid.
3. That work package is assigned to the user `Bench Assignee`.
4. Its status is `In progress`.
5. Its finish date is 2026-12-31.
6. It has a comment whose text includes the runid.
7. Report the work package's numeric ID exactly as the app displays it (OpenProject shows
   it as `#<number>`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed work packages (subjects starting `Seed:`); objective 1 only reads
  them.
- The assignee field is an autocomplete: a value only counts once an option from its
  dropdown has actually been chosen, not merely typed.
- Many fields on a work package's page are edited in place: they become editable when
  clicked and save on their own, without a separate Save button for the whole page.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (subjects, assignee, status, date, ID). If an objective defeated you, say so
plainly — do not guess a value or claim success you did not verify.
