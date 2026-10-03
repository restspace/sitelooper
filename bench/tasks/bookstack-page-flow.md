# Goal: page flow (BookStack)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is BookStack at {{APP_URL}}.
Sign in with email `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.
Pass the password to the browser exactly as the text `{{env:APP_PASSWORD}}` (it is filled in when typed); never write `$APP_PASSWORD`, never guess or spell out a password.

## Objectives

1. Report the names of the pages in the book `Bench Handbook` whose name starts with `Seed:`,
   exactly as shown.
2. A page named `<RUNID> Bench Page` exists whose body has a paragraph that includes the
   runid.
3. Its only tag has the existing name `Review Status` and the existing value `Approved`.
4. Its body also has a heading `Overview` (a heading, not bold or plain text).
5. It is in the chapter `Release Notes` of the book `Bench Handbook`.
6. It has exactly one comment, and that comment includes the runid.
7. Report the page's URL slug (the last part of the page's web address) exactly as the app
   shows it.

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed pages (names starting `Seed:`); objective 1 only reads them.
- The page body is a rich-text editor. The editor autosaves a draft while you type, but a
  draft is not the page: the page only exists, with its name, body and tags, once Save Page
  has been used. The paragraph should appear once, not twice.
- Tags are a name and a value. Both are saved exactly as typed, so a tag only matches the
  existing one if the same name and value are used; a similar tag name `Review State` also
  exists.
- A page can be created in a book or in a chapter, and moved later with the page's Move
  action. The book `Bench Handbook` has the chapters `Release Notes` and
  `Release Notes Archive`; a similarly named book `Bench Handbooks` also has a chapter
  `Release Notes`.
- Comments are posted on the page itself, not in the editor.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (names, tag, heading, book and chapter, comment, slug). If an objective defeated
you, say so plainly — do not guess a value or claim success you did not verify.
