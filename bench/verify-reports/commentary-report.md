# Verify: commentary-report

Branch: `fix/commentary-report`
Commit: `36fa5f7c` — "bench: round 67 (site facts stage 0) first rows: facts written on every app, 195/196 shadow rows agree; op/si artifacts failed on fresh-recording defects; od/gt clean but results lost to the box classifier; gr re-fired"
Chromium revision: 1228 (Chrome for Testing 149.0.7827.55), installed fresh at `/opt/pw-browsers/chromium-1228` — the box's own `/opt/pw-browsers` only shipped chromium-1194; tests ran against 1228.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  170 passed | 23 skipped (193)
     Tests  2779 passed | 432 skipped (3211)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  191 passed | 2 skipped (193)
     Tests  3006 passed | 205 skipped (3211)
```

0 failures. Named tests, all passed:

- `test/commentary-report.test.ts` (6 tests) — passed (ran under check a; the file has no browser-only cases)
- `test/flow.test.ts` (179 tests) — passed
- `test/task-constants.test.ts` (8 tests) — passed
- `test/ledger.test.ts` (46 tests) — passed
- `test/facts-value.test.ts` (22 tests) — passed
- `test/spec-repair.test.ts` (131 tests) — passed
- `test/rerecord.test.ts` (33 tests) — passed
- `test/sourcing-hold.browser.test.ts` (6 tests) — passed:
  - "the sourcing hold at the loop > holds once for an asked value the page does not show that an eval returned, and publishes the retry's labelled read" — 329ms
  - "the sourcing hold at the loop > accepts a stubborn retry as it stands, and names a data-changing gesture after the hold" — 1652ms

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

0 failures.

## d/e. Corpus check vs. baseline

`bench/corpus-check.mjs` compiled every `results/*` branch (377 branches; 358 scorable): compile rate 77.4% (277 compiled, 82 refused, 0 crashed).

Comparison of `/tmp/v/corpus.json` (this run, 377 rows) against the baseline `/tmp/v/base.json` (`results/verify-site-facts-0:bench/corpus-snapshots/sf0-41b794a7.json`, 373 rows), keyed by `runid`, field `status`:

- **Row count:** 377 (baseline: 373)
- **Number changed:** 0
- **Each change:** none — no runid present in both snapshots changed status.
- **New runids** (present now, absent from the baseline — new branches recorded since, not status regressions): `fwod93` (compiled), `fwgr78` (compiled), `fwop21` (compiled), `fwsi18` (compiled).

0 status changes on any runid shared with the baseline, as required.

## f. Offline rebuild of `results/fwgt17-cf64fa`

`node bench/rebuild-flow.mjs --tag fwgt17 --dir /tmp/v/gt17/bench/results-published`, output filtered to `crossStepRefs|markers`:

```
      "crossStepRefs": 18,
      "stepsPublishing": 8,
      "flowSteps": 8,
      "adoptedSteps": 0,
      "markers": [
        "3232b1:{{v1}} = \"fwgt17-n1\"",
        "3232b1:{{v2}} = \"fwgt17-n1 Bench Issue\"",
        "063288:{{v2}} = \"fwgt17-n1\"",
```

08-report step's instruction and params:

```
Do a fresh full page load of {{02-create.url}} and report the full text of every comment shown on the issue page (the comment body text), plus confirm the issue is open (not closed). Do not change anything.
{"v1":"{{02-create.url}}","v5":"{{runid}}"}
```

Matched expectation: yes.

- The 08-report instruction reads `(not closed)` literally — confirmed.
- Params carry no `labels_picker_state` — confirmed (only `v1` and `v5` are present).
- `crossStepRefs` is 18 — confirmed. This is main's 20 minus the two references this fix drops: the labels-picker state and the joined `"bug, priority-high"` labels string, neither of which any element on the page displays.

## Overall: PASS

Checks a–c: 0 failures. Check e: 0 status changes on any runid shared with the baseline. Check f matched its expectation exactly.
