# Held-out comparison: sitelooper vs e2e on apps neither has seen

Written 2026-10-03, BEFORE either tool has been run against any of the apps below.
Committed first so the rules cannot be bent to fit the results.

## Why

The ten-app comparison (e2e arm, results/e2*) put sitelooper at 30/30 clean runs and
e2e at 22/30. That compares sitelooper after ~87 rounds of fixes driven by those exact
apps against e2e at first contact. Sitelooper's own first contact with a new app
(ERPNext fwen1: n2 2/7; the round-40 confirmation of five new apps: 5/10 green) looked
much like e2e's. This test removes the asymmetry: three apps neither tool has met.

## Frozen code

- sitelooper: `src/`, `test/` and the package files exactly as main `e34fd2d7`. No change
  to them until every held-out run below has published. The bench harness may change
  only as allowed under "Infrastructure fixes".
- e2e: npm `e2e` 0.16.0 via `bench/e2e-arm/package-lock.json`, test derived from the task
  by `bench/e2e-arm/task.mjs` exactly as in the ten-app runs (commit 63a491dd).

## The apps

Three self-hosted apps, chosen by client technology not seen in the existing ten, before
any tool touched them:

| target | app | stresses |
|---|---|---|
| directus (dx) | Directus 11.17.4 Data Studio | Vue 3 with its own component library, relational pickers in side drawers, WYSIWYG field, datetime picker |
| mealie (ml) | Mealie 3.28.0 | Nuxt + Vuetify, combobox chips that create on type, recipe editor with ingredient and step lists |
| bookstack (bs) | BookStack 25.12.9 | Laravel Blade, TinyMCE WYSIWYG page editor, tag inputs, book/chapter/page hierarchy and move |

Versions were pinned when the targets were written (2026-10-03, before any run; the table first said
Mealie 2, but the current release is 3.28.0). Each task follows the same template as the existing ten (a report-only read of `Seed:`
records, a created record named after the runid, three or four attribute objectives
through the app's own widgets including one existing-choice picker with a decoy, one
secondary record, a report-only minted id). Tasks and verifiers are written from the
apps' documentation and APIs, without running either tool.

## Validating the infrastructure (no tool involved)

Before any tool runs, an API oracle (`bench/oracle-<target>.mjs`) performs every objective
through the app's API. The verifier must score the oracle's run all-PASS, and must score
an untouched runid on a reset app all-FAIL. Only then do tool runs start.

## Runs

Per app, three repetitions, each on its own fresh cloud box, each running BOTH arms
back to back against a reset app, arm order alternating (rep 1 sitelooper first, rep 2
e2e first, rep 3 sitelooper first):

- sitelooper: `bench/sweep.mjs --k 3` exactly as the fw*-luna sweeps (GPT-6 Luna
  orchestrator and fallback, deepseek-v4.1-flash inner, `--coarse --granularity
  objective`, SITELOOPER_SOURCING_HOLD=on, `--maxUsd 3.00`), then the compiled spec.
- e2e: `bench/e2e-sweep.mjs` (n1 record, n2/n3 replay, strict cache), GPT-6 Luna.

## Scoring, fixed now

Per arm, over 3 apps x 3 repetitions:

1. **Clean runs**: of the 27 normal runs (n1-n3), how many the verifier scores all-PASS
   with no DUPLICATE or EXTRA MUTATION line. The headline.
2. **No-model replay**: of the 9 sweeps, how many have a clean no-model run: sitelooper's
   compiled spec (report-only objectives may be UNVERIFIABLE), e2e's strict-cache run.
3. **Model-free replays**: of the 18 replays (n2, n3), how many took no model turn for
   acting (sitelooper: every step tier A, 0 turns; e2e: every act self-finalized or an act
   that records no action). e2e's assert/extract calls are reported separately.
4. Cost (USD at bench/rates.json or the tool's own estimate) and wall clock, per run.

A "green" sweep in sitelooper's own sense is reported too, but the headline is (1).

## Infrastructure fixes

Allowed during the test only for the bench harness (setup, reset, verifier, oracle,
publish), and only when the evidence shows the harness is wrong independent of either
tool. Any repetition whose run was corrupted by such a bug is rerun for BOTH arms.
No change to sitelooper's `src/` or to the e2e arm's test or config. A tool failure is
a result, not a bug to fix.

## Reporting

Every run, including failed and retried ones, is listed with its results branch. A
retried box (classifier refusal, box died) is reported as such.

## Log

- 2026-10-05: infrastructure validated on the holdout environment (results/heldout-validate,
  no tool run): every target's oracle run scored 7/7, an untouched run 0/7, resets idempotent.
  Infra fixes found by that box and applied before any tool run: BookStack's nginx needs its
  IPv6 listens removed on these boxes; Directus rejects a `.local` admin email, so its admin is
  admin@example.com; seed.sh's tinker needs HOME set. Run boxes recreate their app from the
  checked-out files (bench/heldout/bring-up.sh) because the environment snapshot is cached.
