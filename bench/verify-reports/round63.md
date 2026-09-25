# Verify round63

**Commit:** `8212f830` (branch `fix/round63`)
**Environment:** cloud container, Chromium revision 1228 (Chrome for Testing 149.0.7827.55), confirmed via `chromium.executablePath()` → `/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  162 passed | 22 skipped (184)
      Tests  2654 passed | 426 skipped (3080)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  182 passed | 2 skipped (184)
      Tests  2875 passed | 205 skipped (3080)
```

0 failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
```

0 failures. This includes the navigation/wait cases flagged by the round-56c note (e.g. "both runners pass a text wait whose text another recorded candidate already shows, and go on", "both runners navigate straight to a concrete recorded destination when no link to it is left", and the round-61 `fwop15` link-clicks-that-go-nowhere group) — all passed cleanly on chromium-1228, with no navigation hang. The round-56c failure was a chromium-1194-specific issue, not a code regression.

## d. `bench/corpus-check.mjs` (APP_PASSWORD=bench-admin-pass, compiles every `results/*` branch)

- Row count: **351** (up from 344 in the r62-b82a85e6 baseline)
- Wall time: 67.0s

## e. Diff vs baseline (`results/verify-round62-4p1bhk:bench/corpus-snapshots/r62-b82a85e6.json`), keyed by `runid`, field `status`

- **Runids with a changed status: 0**
- **New runids since baseline: 7** — all newly-recorded/pushed branches since round 62, not present in the r62 snapshot at all:

| runid | status |
| --- | --- |
| fwod88 | refused |
| fwgr75 | compiled |
| fwop17 | compiled |
| fwgt14 | compiled |
| fwvk14 | compiled |
| fwsi14 | compiled |
| fwgh17 | compiled |

No runid went from `compiled` to `refused`/`error`. `fwod88`'s `refused` status is on a run that has no baseline entry to compare against (it didn't exist at round 62), so it is not a regression by the PASS criterion, only a new corpus entry.

The `corpus-check.mjs` snapshot copied to `bench/corpus-snapshots/r63-8212f830.json`.

## Overall: **PASS**

a–c: 0 failures. e: no runid moved from compiled to refused/error against the round-62 baseline.
