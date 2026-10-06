# Goal: project and timesheet flow (Kimai)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Kimai time tracking at {{APP_URL}}. Its sign-in page is {{APP_URL}}en/login.
Sign in with `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.
Pass the password to the browser exactly as the text `{{env:APP_PASSWORD}}` (it is filled in when typed); never write `$APP_PASSWORD`, never guess or spell out a password.

## Objectives

1. Report the names of the projects whose name starts with `Seed:`, exactly as shown.
2. A project named `<RUNID> Bench Project` exists whose description includes the runid.
3. Its customer is the existing customer `Bench Customer`.
4. Its order number is `PO-4471` and its order date is 2026-11-15.
5. A timesheet record exists on that project for 2026-09-16 from 09:00 to 11:30 whose
   description includes the runid.
6. That timesheet's activity is the existing activity `Consulting` and its only tag is `onsite`.
7. Report the project's ID exactly as it appears in the address of its details page (Kimai
   addresses a project's details as `/en/admin/project/<id>/details`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed projects (names starting `Seed:`), the existing customers, activities
  or tags; objective 1 only reads the projects.
- Customers, projects and activities are chosen from searchable drop-downs. Other customers
  have similar names (`Bench Customer Ltd`, `Bench Customers Group`), and so do other
  activities (`Consulting Travel`, `Consultancy Review`).
- The tags field suggests existing tags as you type and can also create a new tag from typed
  text, which objective 6 does not want. Similar tags exist (`onsite-remote`, `offsite`).
- Times are shown and entered in the signed-in user's own timezone; enter them as given.
- Nothing counts until its form has been saved. A project has an ID only once it has been
  saved for the first time; create the project and the timesheet once each.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (project names, description, customer, order number, order date, timesheet date
and times, description, activity, tags, ID). If an objective defeated you, say so plainly — do
not guess a value or claim success you did not verify.
