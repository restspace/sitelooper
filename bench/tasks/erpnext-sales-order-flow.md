# Goal: sales order flow (ERPNext)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is ERPNext at {{APP_URL}}.
Sign in with username `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.
Pass the password to the browser exactly as the text `{{env:APP_PASSWORD}}` (it is filled in when typed); never write `$APP_PASSWORD`, never guess or spell out a password.

## Objectives

1. Report the customer names of the existing Sales Orders whose customer name starts with
   `Seed:`, exactly as shown.
2. A customer named `<RUNID> Bench Customer` exists (its customer group and territory can
   be left at their defaults).
3. A Sales Order for that customer exists, with delivery date 2026-12-31.
4. It has exactly two item lines: `Bench Widget` with quantity 3 and `Bench Gadget` with
   quantity 2, each at the item's default rate.
5. It is submitted (not a draft).
6. Its timeline has a comment whose text includes the runid.
7. Report the Sales Order's ID exactly as it appears in the address of its page
   (ERPNext addresses a Sales Order as `/app/sales-order/<id>`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed Sales Orders (customers starting `Seed:`); objective 1 only reads
  them.
- The customer and item fields are link fields: a value only counts once a record has
  actually been chosen from the field's dropdown suggestions, not merely typed. Other
  customers and items have similar names (`Bench Customer Ltd`, `Bench Widget Pro`, ...).
- Item lines live in the order's Items table; each line's cells become editable when
  clicked.
- Saving leaves a Sales Order as a draft; it only counts as submitted once it has been
  submitted and that submission confirmed.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (customer names, customer, delivery date, items with quantities and rates,
status, comment, ID). If an objective defeated you, say so plainly — do not guess a value or
claim success you did not verify.
