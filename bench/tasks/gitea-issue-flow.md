# Goal: issue flow (Gitea)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Gitea at {{APP_URL}}.
Sign in with username `{{APP_EMAIL}}` and password `{{APP_PASSWORD}}`.

## Objectives

1. In the repository `bench/bench-repo`, report the titles of the open issues whose title
   starts with `Seed:`, exactly as shown.
2. An issue titled `<RUNID> Bench Issue` exists in `bench/bench-repo`, with a description
   that includes the runid.
3. That issue has exactly the labels `bug` and `priority-high`.
4. It is assigned to the user `bench-assignee`.
5. Its milestone is `Bench Milestone`.
6. It has a comment whose text includes the runid.
7. Report the issue's number exactly as the app displays it (Gitea shows it as `#<number>`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed issues (titles starting `Seed:`); objective 1 only reads them.
- Labels, assignees and the milestone are set from pickers in the issue's sidebar. A
  picker's choice only counts once the app has applied it and shows it on the issue, not
  merely when an item in the open menu is ticked.
- The description and the comment are written in markdown text areas.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (titles, labels, assignee, milestone, number). If an objective defeated you,
say so plainly — do not guess a value or claim success you did not verify.
