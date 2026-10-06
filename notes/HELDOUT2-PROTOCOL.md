# Held-out 2: does feat/spec-reliability make compiled specs pass more often?

Written 2026-10-06, BEFORE any run against the apps below, and committed first so the rules
cannot be bent to fit the results.

## Why

Items 1-4 of notes/CONTRACT-spec-reliability.md (learn from recoveries, cross-run
calibration, no silent passes, build --converge) were designed from failures on the ten
bench apps and the first held-out set (Directus, Mealie, BookStack). Those apps are spent as
evidence. This test measures the change on three apps neither code version has met, as an
A/B on the same boxes.

## Code under test

- **before**: sitelooper `src/`, `test/` and package files exactly as main `e34fd2d7`.
- **after**: the same paths exactly as `feat/spec-reliability` `4e901145` (merged into this
  branch, `bench/heldout2`).
- Bench harness, tasks, verifiers: this branch, identical for both arms. No change to either
  arm's `src/` until every run below has published.

## The apps

| target | app | port | stresses |
|---|---|---|---|
| planka (pk) | Planka (kanban) | 8104 | React + Redux single-page app, drag-free card editing, labels and members popovers, card modal |
| kimai (km) | Kimai (time tracking) | 8105 | Symfony server-rendered forms, select widgets with search, date/time pickers, modal forms |
| grocy (gc) | Grocy (household ERP) | 8106 | PHP + jQuery/Bootstrap, selectpicker comboboxes, product/stock forms, numeric inputs |

Tasks follow the template of the existing apps (a report-only read of `Seed:` records, a
created record named after the runid, three or four attribute objectives through the app's
own widgets including one existing-choice picker with a decoy, one secondary record, a
report-only minted id). Tasks, verifiers and oracles are written from the apps'
documentation and APIs before either arm runs.

## Validating the infrastructure (no tool involved)

An API oracle (`bench/oracle-<target>.mjs`) performs every objective through the API; the
verifier must score it all-PASS, and an untouched runid on a reset app all-FAIL (report
objectives UNVERIFIABLE). Only then do arm runs start.

## Runs

Per app, three repetitions, each on its own fresh cloud box, each running BOTH arms back to
back against a reset app, order alternating (rep 1 after first, rep 2 before first, rep 3
after first). Each arm: `bench/sweep.mjs --k 3` exactly as the held-out sweeps (GPT-6 Luna
orchestrator and fallback, deepseek-v4.1-flash inner, `--coarse --granularity objective`,
SITELOOPER_SOURCING_HOLD=on, `--maxUsd 3.00`), then the compiled spec via
`bench/spec-replay.mjs --reset`, then the verifier. The **after** arm additionally runs
`sitelooper build --converge 2` on a copy of its recording when its compiled spec was not
clean, then the spec of the converged recording and the verifier (secondary metric).

Run ids: `ha<code><rep>` (after), `hb<code><rep>` (before).

## Scoring, fixed now

Per arm, over 3 apps x 3 repetitions (9 sweeps):

1. **Clean compiled spec (headline)**: of the 9 sweeps, how many have a compiled spec that
   ran and that the verifier scores with every STATE objective PASS and no DUPLICATE or
   EXTRA MUTATION line. Report-only objectives are excluded from the headline because the
   after arm hands the spec's findings to the verifier and the before arm cannot; they are
   reported separately (2b).
2. **Honest spec**: of the 9 compiled specs that ran, how many have Playwright's verdict
   agree with the verifier (pass ⇔ all state objectives PASS). A spec that passes while a
   state objective FAILs is a silent pass. (2b: report objectives scored for the after arm.)
3. **Compile refusals**, with their diagnostic codes (an `unproven-pin` refusal counts as
   not clean in 1 and as honest in 2).
4. **Model-free replays**: of the 18 replays (n2, n3), how many took 0 model turns.
5. **Clean normal runs**: of the 27 normal runs (n1-n3), how many score all-PASS (a
   regression check: the after arm must not lose here).
6. Secondary, after arm only: of the sweeps whose spec was not clean, how many `build
   --converge 2` turned into a clean spec, and at what model cost.
7. Cost and wall clock per arm.

The difference that would count as an improvement is decided now: the after arm's headline
must exceed the before arm's by at least 2 sweeps of 9, with metric 5 not lower by more than
2 runs of 27. Anything smaller is reported as no measurable difference.

## Infrastructure fixes

Allowed during the test only for the bench harness (setup, reset, verifier, oracle,
publish), and only when the evidence shows the harness is wrong independent of either arm.
A repetition corrupted by such a bug is rerun for BOTH arms. No change to either arm's
`src/`. An arm failure is a result, not a bug to fix.

## Log

- 2026-10-06 11:20Z, validation box (results/heldout2-validate): oracle 7/7 and untouched 0/7 on all
  three targets; resets idempotent; every widget, choice and decoy the tasks name exists after a
  reset. Two infrastructure fixes from the box, applied before any arm run: kimai `TRUSTED_HOSTS`
  is one regex in Kimai's framework.yaml (a comma list answered 400 "Untrusted Host"); grocy
  seed.sh waits for grocy.db to hold a schema (`/` answered 302 before the migrations wrote it:
  "no such table: users").
