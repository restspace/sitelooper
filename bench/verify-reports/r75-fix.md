# Verify r75-fix

Branch: `fix/r75-provenance-url-slot`
Commit: `016e883d3a0b4d452f513a418c5e2317faf11ecc`
> compile: a banked url id below the text floor is a slot by provenance, wherever the span carries it

`grep -q 'EVERY banked url id' src/skills/compile.ts` — found (provenance slot arm present).

Chromium: revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. The box's pre-existing `/opt/pw-browsers/chromium-1194` was left in place but not used — `playwright-core`'s bundled `browsers.json` (for `@playwright/test` `^1.61.1`) pins revision 1228, and no `SITELOOPER_EXECUTABLE` override was needed or set.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  184 passed | 23 skipped (207)
      Tests  3029 passed | 434 skipped (3463)
   Start at  08:47:26
   Duration  71.44s (transform 8.68s, setup 0ms, collect 80.64s, tests 135.67s, environment 46ms, prepare 18.38s)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  205 passed | 2 skipped (207)
      Tests  3258 passed | 205 skipped (3463)
   Start at  08:48:41
   Duration  565.86s (transform 4.69s, setup 0ms, collect 55.43s, tests 460.89s, environment 35ms, prepare 11.98s)
```

0 failures.

Named tests (file, tests, result):

| test file | tests | result |
|---|---|---|
| test/facts-stage4-corpus.test.ts | 23 | pass |
| test/facts-stage3-corpus.test.ts | 18 | pass |
| test/facts-stage2-corpus.test.ts | 21 | pass |
| test/facts-stage1-corpus.test.ts | 17 | pass |
| test/facts-value.test.ts | 47 | pass |
| test/facts.test.ts | 33 | pass |
| test/ledger.test.ts | 58 | pass |
| test/sourcing.test.ts | 17 | pass |
| test/quoted-literal.test.ts | 11 | pass |
| test/commentary-report.test.ts | 6 | pass |
| test/replay-heal-guard.test.ts | 9 | pass |
| test/compile-typed-prefix.test.ts | 2 | pass |
| test/credential-facts.test.ts | 4 | pass |
| test/sourcing-hold.browser.test.ts | 7 | pass (skipped in the plain run without `BP_BROWSER_TESTS`, ran and passed under b) |
| test/spec-emit.test.ts | 166 | pass |
| test/hash-id-slot.test.ts | 4 | pass |
| test/provenance-url-slot.test.ts | 6 | pass |
| test/landed-path-id.test.ts | 10 | pass |
| test/execution-parity.test.ts | 204 | skipped under a/b (gated on `BP_PARITY_TESTS`); ran and passed under c |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
   Start at  08:58:12
   Duration  1785.22s (transform 23.49s, setup 0ms, collect 2.63s, tests 1781.86s, environment 0ms, prepare 57ms)
```

0 failures.

## d/e. Corpus compile check vs. r73 baseline

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` compiled every published `results/*` store.

- Row count (this run): **409**
- Baseline (`results/verify-r73-fix:bench/corpus-snapshots/r73-a635f240.json`) row count: **401**
- Runids present in both, keyed by `runid`/`status`, with a status change: **0**
- New runids (present now, absent from the r73 baseline — new stores published since r73), all compiled:

  | runid | status |
  |---|---|
  | fwod100 | compiled |
  | fwod101 | compiled |
  | fwgr87 | compiled |
  | fwop29 | compiled |
  | fwop30 | compiled |
  | fwgt28 | compiled |
  | fwgt29 | compiled |
  | fwsi26 | compiled |

- Runids in the baseline missing from this run: **0**

No runid went `compiled -> refused`. No runid went `refused -> compiled` either (none of the matched runids changed status at all).

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code: 0.

## Overall verdict: **PASS**

a, b, c: 0 failures. d/e: no runid went `compiled -> refused`. f: matches the expected 0/0/0 output with exit 0.
