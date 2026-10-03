# Goal: recipe flow (Mealie)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Mealie at {{APP_URL}}.
Sign in with email `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.
Pass the password to the browser exactly as the text `{{env:APP_PASSWORD}}` (it is filled in when typed); never write `$APP_PASSWORD`, never guess or spell out a password.

## Objectives

1. Report the names of the recipes whose name starts with `Seed:`, exactly as shown.
2. A recipe named `<RUNID> Bench Recipe` exists whose description includes the runid.
3. Its only category is the existing category `Bench Dinner`, and its only tag is the existing
   tag `Bench Quick`.
4. Its ingredients are exactly these two lines, in this order, each with no note:
   amount `2`, unit `Bench Cup`, food `Bench Flour`; then amount `3`, unit `Bench Spoon`,
   food `Bench Butter`. Its instructions are exactly these two steps, in this order:
   `Whisk the flour and butter.` then `Bake until golden (<RUNID>).`
5. Its servings is 4.
6. It has exactly one comment, and that comment includes the runid.
7. Report the recipe's slug exactly as the app shows it in the address of the recipe's page.

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed recipes (names starting `Seed:`); objective 1 only reads them.
- The recipe editor saves nothing until its Save button is pressed; changes made in the editor
  and not saved are lost.
- A new recipe starts with one placeholder ingredient and one placeholder step; objective 4
  needs the lists to hold only the lines it names.
- The category, tag, unit and food fields create a NEW entry from whatever text is typed unless
  an existing one is chosen from their suggestions; objectives 3 and 4 need the existing
  entries, not new ones. Similar entries `Bench Dinner Party`, `Bench Quickfire` and
  `Bench Flour Blend` also exist.
- Comments are posted from the recipe's page with their own submit button, separately from the
  editor's Save.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (names, category, tag, ingredients, steps, servings, comment, slug). If an
objective defeated you, say so plainly — do not guess a value or claim success you did not
verify.
