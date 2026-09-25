# Verify round62

Commit: `b82a85e6c29c7bd3b533e8c69d66947638a1653c` (`b82a85e6` — "bench: verify-round62 prompt (baseline rM62-8a699bfa)")

Chromium: revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. The box's pre-existing `/opt/pw-browsers/chromium-1194` was left in place but not used — `playwright-core`'s bundled `browsers.json` pins revision 1228, and no `SITELOOPER_EXECUTABLE` override was needed or set.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  158 passed | 22 skipped (180)
     Tests  2631 passed | 421 skipped (3052)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  178 passed | 2 skipped (180)
     Tests  2852 passed | 200 skipped (3052)
```

No failures. In particular, the parity fixture cases that exercise real browser navigation (sign-in reload/clear, toggle-record, vision, fault injection) all passed under chromium-1228.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  199 passed (199)
```

No failures — 199/199, including the round-62 fwvk13 sign-in-reload cases and the round-61 fwgr73/fwop15 cases. The round-56c failure ("both runners bound a navigation that never completes"), which reproduced under the stale chromium-1194, did not reproduce here under chromium-1228.

## d. `bench/corpus-check.mjs`

- Row count: **344**
- Compared against baseline `rM62-8a699bfa` (341 rows, `results/verify-main62-oyb3wi`)

## e. Comparison vs. baseline (keyed by `runid`, field `status`)

- Runids with a changed `status`: **0**
- New runids (present now, absent from baseline): **3**, all `compiled`:
  - `fwec14`: compiled
  - `fwsi13`: compiled
  - `fwgh16`: compiled
- Runids present in baseline but missing now: 0

No runid moved from `compiled` to `refused`/`error`.

## Overall: PASS

a–c have 0 failures; no runid in e regressed from compiled to refused/error.
