# Verify: fix/r76-slow-submit

**Commit:** `df1ec3ec` — execution: a click Playwright logged as done before its timeout went out — a slow submit is not a click that failed
**Chromium revision used by tests:** 1228 (`/opt/pw-browsers/chromium-1228`)

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  184 passed | 25 skipped (209)
      Tests  3033 passed | 437 skipped (3470)
```
0 failing tests.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  207 passed | 2 skipped (209)
      Tests  3265 passed | 205 skipped (3470)
```
0 failing tests. All named files ran and passed: facts-stage4-corpus, facts-stage3-corpus, facts-stage2-corpus, facts-stage1-corpus, facts-value, facts, ledger, sourcing, quoted-literal, commentary-report, replay-heal-guard, compile-typed-prefix, credential-facts, sourcing-hold.browser, spec-emit, hash-id-slot, execution-refill, press-focus.browser, execution-browser, slow-submit.browser. (execution-parity.test.ts was present but fully skipped in this run — it needs `BP_PARITY_TESTS=1`, exercised separately in step c.)

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
      Tests  204 passed (204)
```
0 failing tests.

## d. `bench/corpus-check.mjs` (compile-only, `APP_PASSWORD=bench-admin-pass`)

411 branches checked; 18 incomplete (no flow/store); 1 known-unfixable (not scored). Compile rate 79.1% (310/392 scorable) — compiled 310, refused 83, crashed 0.

**Movement against the branch's own compile log:** fixed 5, still-refusing 34, **newly-refusing 5**, unchanged-ok 273, no-record 76.

This branch is a run-time change (the corpus is not expected to move), but the compile-log comparison shows 10 status changes total:

**newly-refusing (5) — compiled -> refused — this is the failure condition the task calls out:**

| runid | kinds now (compile log) |
| --- | --- |
| fwrd50 | unbound-pin, unbound-slot |
| fwod52 | unsourced-ref |
| fwgr47 | unsourced-ref |
| fwkb8 | unsourced-ref |
| fwkb15 | unsourced-ref |

**fixed (5) — refused -> compiled — allowed:**

| runid | kinds then (compile log) |
| --- | --- |
| fwrd55 | refused |
| fwod48 | refused |
| fwod57 | unfilled-slot |
| fwgr64 | unbound-pin |
| fwgh4 | unsourced-ref |

Per the task's own d-criterion ("the verdict is PASS only if no runid went compiled -> refused"), **step d fails**: 5 runids (fwrd50, fwod52, fwgr47, fwkb8, fwkb15) went from compiled to refused against the branch's own recorded compile log, purely from this run-time change.

corpus.json copied to `bench/corpus-snapshots/r76s-df1ec3ec.json` (411 rows).

## e. Baseline diff vs `results/verify-r73-fix:bench/corpus-snapshots/r73-a635f240.json`

- Baseline (r73) row count: 401
- This run's row count: 411
- Rows changed (same runid, different `status`, keyed on `runid`/`status`): **0**
- New runids (present now, absent from r73 baseline): **10**, all `compiled`: fwod100, fwod101, fwgr87, fwop29, fwop30, fwgt28, fwgt29, fwgt30, fwsi26, fwsi27

No runid regressed from `compiled` to `refused` relative to the r73 baseline (all 5 "newly-refusing" runids from step d were already `refused` in the r73 snapshot — that regression is only visible against the branch's own more-recent compile log, not against the older r73 baseline).

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```
Exit code: 0. Matches the expected 0 facts / 0 rows / applied 0.

## Overall verdict: **FAIL**

a, b, c and f all pass cleanly, and the e-comparison against the r73 baseline shows no compiled->refused regressions. However step d's own comparison — against the branch's own recorded compile log, which is the more current reference and the one the task's d-instructions explicitly gate on ("the verdict is PASS only if no runid went compiled -> refused") — shows 5 runids (fwrd50, fwod52, fwgr47, fwkb8, fwkb15) regressing from compiled to refused as a direct result of this run-time change. That is the failure condition the task was designed to catch, so the overall verdict is FAIL.
