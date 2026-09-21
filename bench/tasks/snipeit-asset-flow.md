# Goal: asset flow (Snipe-IT)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Snipe-IT at {{APP_URL}}.
Sign in with username `{{APP_EMAIL}}` and password `{{APP_PASSWORD}}`.

## Objectives

1. Report the asset tags of the assets whose name starts with `Seed:`, each with its name,
   exactly as shown.
2. An asset named `<RUNID> Bench Asset` exists, of the model `Bench Laptop Model`, with the
   status `Ready to Deploy`.
3. Its default location is `Bench Office`.
4. Its purchase date is 2026-03-15.
5. It is checked out to the user `Bench Assignee`.
6. That checkout carries a note whose text includes the runid.
7. Report the asset's asset tag exactly as the app displays it (Snipe-IT assigns tags
   like `BA-00012`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed assets (names starting `Seed:`); objective 1 only reads them.
- Model, status, location and user fields are searchable dropdowns: a value only counts
  once an option from the dropdown has actually been chosen, not merely typed. Do not
  create new models, locations or users; everything the task names already exists.
- Check the asset out once. Checking out is its own action on the asset, separate from
  creating or editing it.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (tags, model, status, location, date, assignee). If an objective defeated
you, say so plainly — do not guess a value or claim success you did not verify.
