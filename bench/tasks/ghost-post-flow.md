# Goal: post flow (Ghost)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Ghost at {{APP_URL}}. Its admin is at {{APP_URL}}ghost/.
Sign in with email `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.

## Objectives

1. Report the titles of the published posts whose title starts with `Seed:`, exactly as shown.
2. A post titled `<RUNID> Bench Post` exists whose body has a paragraph that includes the
   runid.
3. Its only tag is the existing tag `Bench News`.
4. Its custom excerpt includes the runid.
5. It is published (not a draft, not scheduled), visible to the public.
6. Its publish date is 2026-09-01.
7. Report the post's URL slug exactly as the app shows it in the post's settings.

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed posts (titles starting `Seed:`); objective 1 only reads them.
- The post body is a rich-text editor: text only counts once it has been typed into the
  editor and the post saved, and the paragraph should appear once, not twice.
- Tag, excerpt, publish date and URL live in the post's settings panel. The tag field
  creates a NEW tag from whatever text is typed unless an existing tag is chosen from its
  suggestions; objective 3 needs the existing `Bench News`, not a new tag, and a similar
  tag `Bench Newsletter` also exists.
- Publishing is its own confirmation flow; the post is only published once that flow has
  been completed. A publish date in the future schedules the post instead of publishing it.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (titles, tag, excerpt, status, publish date, slug). If an objective defeated
you, say so plainly — do not guess a value or claim success you did not verify.
