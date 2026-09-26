# Verify site-facts-2

Commit: `8400f179` (site facts stage 2: display format facts decide, in both runners (report classification, identity checks, counter masking) and in the daemon's read-back; the affix observer tightened), branch `feat/site-facts-2`.

Chromium: revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. The box's pre-existing `/opt/pw-browsers/chromium-1194` was left in place but not used; no `SITELOOPER_EXECUTABLE` override was needed.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  175 passed | 23 skipped (198)
     Tests  2892 passed | 433 skipped (3325)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  196 passed | 2 skipped (198)
     Tests  3120 passed | 205 skipped (3325)
```

No failures. The named tests all passed:

| test file | result |
| --- | --- |
| test/facts-stage2-corpus.test.ts | ✓ passed (21 tests) |
| test/facts-display.test.ts | ✓ passed (14 tests) |
| test/facts-format.test.ts | ✓ passed (23 tests) |
| test/readback.test.ts | ✓ passed (34 tests) |
| test/report.test.ts | ✓ passed (47 tests) |
| test/identity.test.ts | ✓ passed (47 tests) |
| test/execution-gates.test.ts | ✓ passed (85 tests) |
| test/spec-emit.test.ts | ✓ passed (166 tests) |
| test/readback-row.browser.test.ts | ✓ passed (3 tests) |
| test/execution-parity.test.ts | ↓ skipped (204 tests, gated on `BP_PARITY_TESTS`; run separately in (c)) |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failures. (Log shows two informational `[sitelooper drift]` lines noting a fallback locator match on `01-clear s_parity` — these are diagnostic notices from the test, not assertion failures; the test itself passed.)

## d/e. Corpus check (`bench/corpus-check.mjs`) vs `bench/corpus-snapshots/sf1-2aa5e726.json`

- Rows in baseline (sf1) snapshot: 378. Rows in site-facts-2 `corpus.json`: 383.
- Compared by `runid`, field `status`: **0 changed**, **5 new** runids (present in site-facts-2, absent from the baseline).

New runids and their status:

| runid | status |
| --- | --- |
| fwod94 | compiled |
| fwgr79 | compiled |
| fwop22 | compiled |
| fwgt20 | compiled |
| fwsi19 | compiled |

No runid present in both snapshots changed status. This matches the branch's expectation: no published store carries a `site-facts.json`, so every decision falls back to today's rule and the corpus shows 0 status changes.

The corpus-check tool's own "movement against the branch's own compile log" section separately lists 5 "newly-refusing" (`fwrd50`, `fwod52`, `fwgr47`, `fwkb8`, `fwkb15`) and 5 "fixed" (`fwrd55`, `fwod48`, `fwod57`, `fwgr64`, `fwgh4`) entries, computed against each branch's own historical/embedded compile record, not the sf1 snapshot. Cross-checked against the sf1 snapshot: all 5 "newly-refusing" runids are already `refused` in the sf1 snapshot, and all 5 "fixed" runids are already `compiled` in the sf1 snapshot — no discrepancy with the site-facts-2 result.

`/tmp/v/corpus.json` copied to `bench/corpus-snapshots/sf2-8400f179.json`.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code: 0. Matches expectation for a store with no `site-facts.json`: 0 facts, 0 rows, applied 0.

## Overall: **PASS**

Reason: (a), (b), and (c) all have 0 failures (2892 + 3120 + 204 tests passed across the three runs, all named tests present and passing), and (d/e) show 0 runid status changes against the sf1 baseline (only 5 new runids added, all `compiled`). (f) prints exactly the expected zero-facts output with exit 0.
