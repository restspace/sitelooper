# Goal: ticket flow (Directus)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Directus at {{APP_URL}}. Its Data Studio is at {{APP_URL}}admin/.
Sign in with email `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.
Pass the password to the browser exactly as the text `{{env:APP_PASSWORD}}` (it is filled in when typed); never write `$APP_PASSWORD`, never guess or spell out a password.

## Objectives

1. Report the titles of the items in the Tickets collection whose title starts with `Seed:`,
   exactly as shown.
2. A ticket titled `<RUNID> Bench Ticket` exists whose description has a paragraph that
   includes the runid.
3. Its customer is the existing customer `Bench Customer`.
4. Its status is `In progress` and its only tag is `hardware`.
5. Its due date is 2026-12-31 and its estimated hours are 6.
6. It has a comment whose text includes the runid.
7. Report the ticket's ID exactly as it appears in the address of its page (the Data Studio
   addresses a ticket as `/admin/content/tickets/<id>`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed tickets (titles starting `Seed:`) or the existing customers;
  objective 1 only reads the tickets.
- The description is a rich-text editor: text only counts once it has been typed into the
  editor and the ticket saved, and the paragraph should appear once, not twice.
- The customer field picks from the existing records of the Customers collection; it can
  also create a new customer, which objective 3 does not want. Other customers have similar
  names (`Bench Customer Ltd`, `Bench Customers Group`).
- The tags field offers preset tags and also accepts typed text; objective 4 needs the one
  tag `hardware` and nothing else (a preset `hardware-return` also exists).
- Nothing on the ticket counts until it has been saved. A ticket has an ID only once it has
  been saved for the first time, and comments are left from the item's sidebar.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (titles, description, customer, status, tags, due date, estimated hours,
comment, ID). If an objective defeated you, say so plainly — do not guess a value or claim
success you did not verify.
