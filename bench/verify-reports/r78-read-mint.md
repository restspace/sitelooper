# Verify: fix/r78-read-mint

- Commit: `34ed3cc82dea81449f96e6843d799e3548d30a86` ("compile + both runners: a minted value the procedure read and then typed is bound from that read")
- Chromium revision used: 1228 (`/opt/pw-browsers/chromium-1228`, Chrome for Testing 149.0.7827.55)

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  186 passed | 26 skipped (212)
      Tests  3048 passed | 438 skipped (3486)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  210 passed | 2 skipped (212)
      Tests  3281 passed | 205 skipped (3486)
```

No failures.

Named tests (all passed):

| test file | result |
| --- | --- |
| test/facts-stage4-corpus.test.ts | ✓ 23 tests |
| test/facts-stage3-corpus.test.ts | ✓ 18 tests |
| test/facts-stage2-corpus.test.ts | ✓ 21 tests |
| test/facts-stage1-corpus.test.ts | ✓ 17 tests |
| test/facts-value.test.ts | ✓ 47 tests |
| test/facts.test.ts | ✓ 33 tests |
| test/ledger.test.ts | ✓ 58 tests |
| test/sourcing.test.ts | ✓ 17 tests |
| test/quoted-literal.test.ts | ✓ 11 tests |
| test/commentary-report.test.ts | ✓ 6 tests |
| test/replay-heal-guard.test.ts | ✓ 9 tests |
| test/compile-typed-prefix.test.ts | ✓ 2 tests |
| test/credential-facts.test.ts | ✓ 4 tests |
| test/sourcing-hold.browser.test.ts | ✓ 7 tests |
| test/spec-emit.test.ts | ✓ 166 tests |
| test/hash-id-slot.test.ts | ✓ 4 tests |
| test/execution-refill.test.ts | ✓ 14 tests |
| test/press-focus.browser.test.ts | ✓ 2 tests |
| test/execution-browser.test.ts | ✓ 25 tests |
| test/slow-submit.browser.test.ts | ✓ 1 test |
| test/unasked-word.test.ts | ✓ 11 tests |
| test/read-mint.test.ts | ✓ 3 tests |
| test/read-mint.browser.test.ts | ✓ 1 test |
| test/minted-fill.test.ts | ✓ 4 tests |
| test/rebuild.test.ts | ✓ 9 tests |
| test/execution-parity.test.ts | skipped in this run (gated behind `BP_PARITY_TESTS`; see check c) |

No failing tests to report.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
```

No failures.

## d/e. Corpus compile check vs. baseline

`bench/corpus-check.mjs` ran against commit `34ed3cc8`: 411 branches total (18 incomplete, 1 known-unfixable reported but not scored), compile rate 79.1% (310/392 scorable: compiled 310, refused 83, crashed 0).

Baseline: `origin/results/verify-r76-slow-submit-933cbr:bench/corpus-snapshots/r76s-df1ec3ec.json`

- Row count: current 411, baseline 411
- Number of status changes (keyed by `runid`, field `status`): **0**
- New runids not present in baseline: **0**
- Changes: none

corpus-check's own informational movement against each branch's *own* prior compile log (not the verdict signal, listed for visibility only):

| verdict | branches |
| --- | ---: |
| fixed | 5 |
| still-refusing | 34 |
| newly-refusing | 5 |
| unchanged-ok | 273 |
| no-record | 76 |

newly-refusing (own-log, informational): fwrd50 (unbound-pin, unbound-slot), fwod52 (unsourced-ref), fwgr47 (unsourced-ref), fwkb8 (unsourced-ref), fwkb15 (unsourced-ref)

fixed (own-log, informational): fwrd55, fwod48, fwod57, fwgr64, fwgh4

This is expected: published stores are already compiled, and the change is run-time-only, so the current-vs-baseline snapshot comparison (which is what decides the verdict) shows no movement at all.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code 0, as expected for a store with no site-facts.json.

## Overall verdict: PASS

Checks a-c had 0 failures. The corpus snapshot comparison (step e) shows 0 runid status changes versus the baseline — in particular no runid moved from `compiled` to `refused`. facts-report (f) behaved as expected.
