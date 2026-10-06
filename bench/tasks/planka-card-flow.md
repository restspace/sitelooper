# Goal: card flow (Planka)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Planka at {{APP_URL}}.
Sign in with email `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.
Pass the password to the browser exactly as the text `{{env:APP_PASSWORD}}` (it is filled in when typed); never write `$APP_PASSWORD`, never guess or spell out a password.

All the work is on the board `Bench Board` in the project `Bench Project`.

## Objectives

1. Report the names of the cards on the board whose name starts with `Seed:`, exactly as
   shown.
2. A card named `<RUNID> Bench Card` exists in the board's `In Progress` list, and its
   description has a paragraph that includes the runid.
3. Its only label is the existing label `Hardware`.
4. Its only member is the existing user `Bench Tester`.
5. Its due date is 2026-12-31.
6. It has a comment whose text includes the runid.
7. Report the card's ID exactly as it appears in the address of its page (Planka addresses a
   card as `/cards/<id>`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed cards (names starting `Seed:`, in the `To Do` list) or the board's
  existing labels, lists and members; objective 1 only reads the cards.
- The description is a text editor: text only counts once it has been saved, and the
  paragraph should appear once, not twice.
- The label picker lists the board's existing labels and can also create a new label, which
  objective 3 does not want. Other labels have similar names (`Hardware Return`,
  `Hardware Spares`).
- The member picker lists the board's members; another member has a similar name
  (`Bench Tester Lead`).
- Any time of day on 2026-12-31 is fine for the due date.
- A card has an ID only once it has been created, and comments are left from the card's own
  view.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (names, list, description, label, member, due date, comment, ID). If an
objective defeated you, say so plainly — do not guess a value or claim success you did not
verify.
