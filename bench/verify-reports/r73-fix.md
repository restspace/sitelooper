# verify r73-fix

Commit: `a635f240` — round 73 fix: compile writes a position-only url id into a control NAME where the app prints it as the record number (substituteHashIds).

Chromium revision actually run: **1228** (`Chrome for Testing 149.0.7827.55`, at `/opt/pw-browsers/chromium-1228`; the box shipped an older `chromium-1194` under the same `PLAYWRIGHT_BROWSERS_PATH`, upgraded via `npx playwright install --with-deps chromium`).

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  183 passed | 23 skipped (206)
      Tests  3023 passed | 434 skipped (3457)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  204 passed | 2 skipped (206)
      Tests  3252 passed | 205 skipped (3457)
```

0 failures. Named tests, all passing:

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
| test/execution-parity.test.ts | skipped in this run (204 tests skipped — run separately under `BP_PARITY_TESTS=1`, see c) |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
```

0 failures.

## d/e. Corpus check + baseline comparison

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` against 401 branches (397 in the r72 baseline):

- **Row count:** 401 (current) vs 397 (baseline `results/verify-r72-fix:bench/corpus-snapshots/r72-58115c43.json`).
- **Compile rate:** 78.5% (300/382 scorable) — compiled 300, refused 83, crashed 0.
- **Number of runids with a changed `status` vs baseline (keyed by runid):** **0**.
- **New runids (present now, absent from the r72 baseline)** — 4, all `compiled`, none `refused`:

  | runid | status |
  | --- | --- |
  | fwod99 | compiled |
  | fwop28 | compiled |
  | fwgt27 | compiled |
  | fwsi24 | compiled |

- No runid present in both went `compiled -> refused`, and none present in both went `refused -> compiled` (no prior-status runid changed at all).

The corpus tool's own compile-log movement (informational, not the baseline diff): fixed 5 (fwrd55, fwod48, fwod57, fwgr64, fwgh4), newly-refusing 5 (fwrd50, fwod52, fwgr47, fwkb8, fwkb15), unchanged-ok 263, no-record 76. One known-unfixable, reported but not scored: `fwod56` (refusing a genuinely unpublished dependency, unrelated to this fix).

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit 0.

## Overall verdict: **PASS**

a-c: 0 failures. d/e: no runid went `compiled -> refused` against the r72 baseline (0 status changes overall; 4 new runids, all compiled). f: matches the expected 0/0/0 output with exit 0.
