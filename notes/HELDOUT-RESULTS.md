# Held-out comparison: results

Protocol: notes/HELDOUT-PROTOCOL.md (pre-registered before any run). Three apps neither tool had
seen (Directus 11.17.4, Mealie 3.28.0, BookStack 25.12.9), three repetitions each, both arms per
box against a reset app, GPT-6 Luna for both. sitelooper frozen at main e34fd2d7; e2e 0.16.0.
Scored by `node bench/heldout/score.mjs` from the results/hs* and results/he* branches.

## Headline

| metric (protocol "Scoring, fixed now") | sitelooper | e2e |
|---|---|---|
| 1. clean normal runs (n1-n3) | **18/27** | **18/27** |
| 2. clean no-model run (compiled spec / strict cache) | 3/9 | 4/9 |
| 3. model-free replays (n2, n3) | 9/18 | 7/18 |
| 4. model spend, all normal runs | $0.53 | $0.28 |

A tie on the headline. Neither tool is more reliable than the other on unseen apps.

## Score sheet

```
app        rep | sitelooper n1 n2 n3 | spec      | e2e n1 n2 n3        | strict
directus   1   | 7/7 7/7·m 7/7·m | 3/7✗ | 7/7 7/7·m 7/7 | 7/7
directus   2   | 7/7 7/7 7/7 | 5/7 | 7/7 7/7·m 7/7 | 7/7
directus   3   | 7/7 7/7·m 7/7·m | 4/7✗ | 7/7 7/7 7/7 | 7/7
mealie     1   | 6/7✗ 6/7✗ 6/7✗ | 0/7✗ | 7/7 7/7·m 7/7·m | 5/7✗
mealie     2   | 6/7✗ 6/7✗·m 6/7✗ | refused✗ | 5/7✗ 6/7✗·m 6/7✗·m | 5/7✗
mealie     3   | 7/7 7/7 7/7 | 5/7 | 7/7 6/7✗·m 6/7✗·m | 5/7✗
bookstack  1   | 7/7 6/7✗·m 6/7✗·m | 4/7✗ | 7/7 6/7✗·m 6/7✗ | 6/7✗
bookstack  2   | 7/7 6/7✗·m 7/7·m | 1/7✗ | 7/7 7/7·m 7/7 | 7/7
bookstack  3   | 7/7 7/7 7/7 | 5/7 | 7/7 6/7✗·m 6/7✗ | 6/7✗

✗ = not clean (a FAIL, an EXTRA/DUPLICATE line, or unscored); ·m = a replay that used the model for acting

sitelooper: clean normal runs 18/27, clean no-model runs 3/9, model-free replays 9/18, total $0.53 over 9 sweep(s)
e2e       : clean normal runs 18/27, clean no-model runs 4/9, model-free replays 7/18, total $0.28 over 9 sweep(s)

Not clean, with the reason:
  hsdx1-spec: obj 5: FAIL — due_date=(none), estimated_hours=(none); want 2026-12-31 and 6 | obj 6: FAIL — 0 comment(s), 0 carrying the runid
  hsdx3-spec: obj 6: FAIL — 0 comment(s), 0 carrying the runid
  hsml1-n1: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)",""] (WRONG)
  hsml1-n2: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)",""] (WRONG)
  hsml1-n3: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)",""] (WRONG)
  hsml1-spec: obj 2: FAIL — recipe not found | obj 3: FAIL — no recipe | obj 4: FAIL — no recipe | obj 5: FAIL — no recipe | obj 6: FAIL — no recipe
  heml1-strict: obj 4: FAIL — ingredients=[0 - - note="1 Cup Flour"] (WRONG); steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)"] (WRONG) | obj 5: FAIL — servings=0, want 4
  hsml2-n1: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)",""] (WRONG)
  hsml2-n2: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)",""] (WRONG)
  hsml2-n3: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)",""] (WRONG)
  hsml2-spec: re-record the step(s) with the fix command above, or pass --allow-demoted to compile the demoted pin anyway. sitelooper: refused: a step is pinned to a demoted skill — see the diagnostics above (--allow-demoted compiles it anyway)
  heml2-n1: obj 3: FAIL — categories=Bench Dinner (bench-dinner); tags=(none); want only the seeded Bench Dinner (bench-dinner) and Bench Quick (bench-quick) | obj 5: FAIL — servings=0, want 4
  heml2-n2: obj 5: FAIL — servings=0, want 4
  heml2-n3: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)"] (WRONG)
  heml2-strict: obj 4: FAIL — ingredients=[0 - - note="1 Cup Flour"] (WRONG); steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)"] (WRONG) | obj 5: FAIL — servings=0, want 4
  heml3-n2: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)"] (WRONG)
  heml3-n3: obj 4: FAIL — ingredients=[2 Bench Cup Bench Flour | 3 Bench Spoon Bench Butter]; steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)"] (WRONG)
  heml3-strict: obj 4: FAIL — ingredients=[0 - - note="1 Cup Flour"] (WRONG); steps=["Recipe steps as well as other fields in the recipe page support markdown syntax. **Add a link** [My Link](https://demo.mealie.io)"] (WRONG) | obj 5: FAIL — servings=0, want 4
  hsbs1-n2: obj 1: FAIL — not in report: Seed: Getting started, Seed: Release checklist, Seed: House style
  hsbs1-n3: obj 1: FAIL — not in report: Seed: Getting started, Seed: Release checklist, Seed: House style
  hsbs1-spec: obj 5: FAIL — in book "Bench Handbook" (id 1), chapter (none); want "Release Notes" (id 3) of "Bench Handbook" (id 1)
  hebs1-n2: obj 2: FAIL — hebs1-n2-bench-page, body includes runid=false
  hebs1-n3: obj 2: FAIL — hebs1-n3-bench-page, body includes runid=false
  hebs1-strict: obj 2: FAIL — hebs1-strict-bench-page, body includes runid=false
  hsbs2-n2: obj 1: FAIL — not in report: Seed: Getting started, Seed: Release checklist, Seed: House style
  hsbs2-spec: obj 3: FAIL — tags=(none), want only "Review Status"="Approved" | obj 4: FAIL — headings=(none), want "Overview" | obj 5: FAIL — in book "Bench Handbook" (id 1), chapter (none); want "Release Notes" (id 3) of "Bench Handbook" (id 1) | obj 6: FAIL — 0 comment(s)
  hebs3-n2: obj 2: FAIL — hebs3-n2-bench-page, body includes runid=false
  hebs3-n3: obj 2: FAIL — hebs3-n3-bench-page, body includes runid=false
  hebs3-strict: obj 2: FAIL — hebs3-strict-bench-page, body includes runid=false
```

## Where each one failed

- **Mealie, both tools:** the new-recipe placeholder instruction step was left in place
  (sitelooper on every run of reps 1 and 2; e2e on 3 replays and every strict run). e2e also
  left servings at 0 or the tag unset on rep 2.
- **BookStack, sitelooper:** replays withheld the seed page names from the report ("only what
  this run typed", the value-provenance rule), 3 of 6 replays.
- **BookStack, e2e:** a replayed page body kept the RECORDING's runid (the title was substituted
  through `unique()`, the editor text was not), and the live `agent.assert` after it passed
  anyway: a silent wrong pass, caught only by the app-side verifier. 4 of 6 replays and 2 strict
  runs.
- **Compiled specs (sitelooper):** 6 of 9 not clean: dropped date/comment steps on Directus, one
  refused (demoted pin) and one that found no recipe on Mealie, a missing move/tag on BookStack.
- Directus: both tools clean on every normal run.

## Not shown here

- Three repetitions per app is a small sample; a 18/27 tie is consistent with a real difference of
  a few runs either way.
- The e2e test is derived from the task text (bench/e2e-arm/task.mjs); a hand-written e2e test
  with deterministic `expect` checks would likely do better, as tuning would help sitelooper.
- Infrastructure incidents, none affecting a scored run: the env's setup script was killed at ~5
  min (moved to the session hook); BookStack IPv6 and Directus email fixes before any run; the
  five second-wave boxes first found no docker daemon on the cached snapshot and stopped before
  running anything, then were re-fired with the same bases.

## Does each tool say when it failed? (bench/heldout/honesty.mjs)

The tool's own verdict set against the verifier's, per run (36 per arm):

```

== sitelooper
  record    9 runs: clean 7, failed 2 (silent 2, loud 0), false alarm 0
  replay    18 runs: clean 11, failed 7 (silent 7, loud 0), false alarm 0
  no-model  9 runs: clean 3, failed 5 (silent 1, loud 4), false alarm 0
  all       36 runs: clean 21, failed 14 (silent 10, loud 4), false alarm 0
  objectives the verifier failed where the tool gave a per-objective verdict: 2, of which the tool claimed 2 as done

== e2e
  record    9 runs: clean 2, failed 1 (silent 0, loud 1), false alarm 6
  replay    18 runs: clean 2, failed 8 (silent 3, loud 5), false alarm 8
  no-model  9 runs: clean 1, failed 5 (silent 1, loud 4), false alarm 3
  all       36 runs: clean 5, failed 14 (silent 4, loud 10), false alarm 17
  objectives the verifier failed where the tool gave a per-objective verdict: 18, of which the tool claimed 6 as done
```

sitelooper's failures were mostly silent (10 of 14: it reported success, the app disagreed);
e2e's were mostly loud (10 of 14), at the cost of 17 false alarms (mostly report-only extracts
and inconclusive judgments on runs the verifier scored clean). Neither is a clean win.
