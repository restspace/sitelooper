# Goal: opportunity flow (EspoCRM)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is EspoCRM at {{APP_URL}}.
Sign in with username `{{APP_EMAIL}}` and password `{{APP_PASSWORD}}`.

## Objectives

1. Report the names of the opportunities whose name starts with `Seed:`, exactly as shown.
2. An opportunity named `<RUNID> Bench Opportunity` exists, linked to the account
   `Bench Account`, with a description that includes the runid.
3. Its stage is `Negotiation`.
4. Its amount is 12500 (in the default currency) and its close date is 2026-12-31.
5. It is assigned to the user `Bench Assignee`.
6. Its Stream has a post whose text includes the runid.
7. Report the opportunity's record ID exactly as it appears in the address of its page
   (EspoCRM addresses a record as `#Opportunity/view/<id>`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed opportunities (names starting `Seed:`); objective 1 only reads them.
- The account and assigned-user fields are link fields: a value only counts once a record
  has actually been chosen, from the field's suggestions or its select dialog, not merely
  typed. Other accounts and users have similar names.
- A field on a record's page can be edited in place from its pencil icon, or the whole
  record from its Edit button; either way the change only counts once it is saved.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (names, account, stage, amount, close date, assignee, ID). If an objective
defeated you, say so plainly — do not guess a value or claim success you did not verify.
