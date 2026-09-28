# Verify: r75-press (fix/r75-press-focus)

Commit: `d450e525` — execution: the check before a key press leaves focus where the recording left it

Chromium revision used by tests: **1228** (installed under `/opt/pw-browsers/chromium-1228`; Chrome for Testing 149.0.7827.55)

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  183 passed | 24 skipped (207)
     Tests  3025 passed | 436 skipped (3461)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  205 passed | 2 skipped (207)
     Tests  3256 passed | 205 skipped (3461)
```

No failures. Named tests, all passed:

- test/facts-stage4-corpus.test.ts (23 tests)
- test/facts-stage3-corpus.test.ts (18 tests)
- test/facts-stage2-corpus.test.ts (21 tests)
- test/facts-stage1-corpus.test.ts (17 tests)
- test/facts-value.test.ts (47 tests)
- test/facts.test.ts (33 tests)
- test/ledger.test.ts (58 tests)
- test/sourcing.test.ts (17 tests)
- test/quoted-literal.test.ts (11 tests)
- test/commentary-report.test.ts (6 tests)
- test/replay-heal-guard.test.ts (9 tests)
- test/compile-typed-prefix.test.ts (2 tests)
- test/credential-facts.test.ts (4 tests)
- test/sourcing-hold.browser.test.ts (7 tests)
- test/spec-emit.test.ts (166 tests)
- test/hash-id-slot.test.ts (4 tests)
- test/execution-refill.test.ts (14 tests)
- test/press-focus.browser.test.ts (2 tests) — ran for real here (was skipped in run a)
- test/execution-parity.test.ts — skipped in this run (204 tests | 204 skipped); it is gated on `BP_PARITY_TESTS` and covered separately in (c)

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failures.

## d/e. Corpus check vs. baseline (r73)

`bench/corpus-check.mjs` output summary: 409 branch(es); 18 incomplete; 1 known-unfixable (not scored). Compile rate 79.0% (308/390 scorable) — compiled 308, refused 83, crashed 0.

Row count: **409** (vs. 401 in baseline `results/verify-r73-fix:bench/corpus-snapshots/r73-a635f240.json`).

Comparison keyed by `runid`, field `status`, against the r73 baseline:

- **Changed status (old -> new): 0** — no runid present in both the baseline and this run changed status.
- **compiled -> refused: 0** (this is the failure condition — none occurred).
- **refused -> compiled: 0** (none occurred; would have been allowed/listed if present).
- **New runids (8)**, all `compiled` (new results branches published since the r73 baseline, no prior status to compare against):
  - fwgr87: compiled
  - fwgt28: compiled
  - fwgt29: compiled
  - fwod100: compiled
  - fwod101: compiled
  - fwop29: compiled
  - fwop30: compiled
  - fwsi26: compiled (the round-75 snipe-it fix's own recording)

For additional context, `corpus-check.mjs`'s own embedded movement-vs-branch's-own-prior-log (a separate mechanism from the r73 baseline comparison above, comparing each branch's row against a compile log recorded on that branch) reported: fixed 5 (fwrd55, fwod48, fwod57, fwgr64, fwgh4), newly-refusing 5 (fwrd50, fwod52, fwgr47, fwkb8, fwkb15), still-refusing 34, unchanged-ok 271, no-record 76. This is informational only — the baseline (r73) comparison above is what determines the PASS/FAIL verdict per the task instructions, and it shows 0 compiled -> refused.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Matches expectation (0 facts, 0 rows, applied 0, exit 0).

## Verdict: **PASS**

a-c have 0 failures; the r73-baseline corpus comparison (e) shows no runid moved from `compiled` to `refused`.
