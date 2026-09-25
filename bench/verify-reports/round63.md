# Verify round63

**Commit:** `8212f830` (bench: verify-round63 prompt, baseline r62-b82a85e6)

**Chromium revision:** 1228 (`/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`), installed via
`npx playwright install --with-deps chromium`, confirmed against
`node_modules/playwright-core/browsers.json` (expected revision `1228`). The box also had
`chromium-1194` present under `/opt/pw-browsers`; `PLAYWRIGHT_BROWSERS_PATH` pointed at
`/opt/pw-browsers` and tests resolved the 1228 binary automatically — `SITELOOPER_EXECUTABLE`
override was not needed. The round-56c parity case that failed on chromium-1194 ("both runners
bound a navigation that never completes, and report it") **passed** on this run (see check c).

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  162 passed | 22 skipped (184)
     Tests  2654 passed | 426 skipped (3080)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  182 passed | 2 skipped (184)
     Tests  2875 passed | 205 skipped (3080)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failures. Includes: `both runners bound a navigation that never completes, and report it` — **passed** (4646ms).

## d. `bench/corpus-check.mjs`

Row count: **354**

`corpus-check`'s own then/now summary (against its embedded prior state, not the round62 snapshot):

- newly-refusing (5): fwrd50 (unbound-pin, unbound-slot), fwod52 (unsourced-ref), fwgr47 (unsourced-ref), fwkb8 (unsourced-ref), fwkb15 (unsourced-ref)
- fixed (5): fwrd55 (was refused), fwod48 (was refused), fwod57 (was unfilled-slot), fwgr64 (was unbound-pin), fwgh4 (was unsourced-ref)
- known-unfixable (not scored): fwod56 — refusing correctly (recording references an unpublished `{{05-open.quotation_reference}}`; the recording is wrong, not the compiler)

## e. Comparison against baseline `results/verify-round62-4p1bhk:bench/corpus-snapshots/r62-b82a85e6.json`

Baseline rows: 344. Current rows: 354.

**Number of runids with a changed `status`: 0**

**New runids (not present in baseline): 10**

| runid | status |
| --- | --- |
| fwrd93 | compiled |
| fwod88 | refused |
| fwgr75 | compiled |
| fwkb45 | refused |
| fwop17 | compiled |
| fwgt14 | compiled |
| fwvk14 | compiled |
| fwec15 | compiled |
| fwsi14 | compiled |
| fwgh17 | compiled |

Removed runids (in baseline, not in current): 0

No runid transitioned from `compiled` to `refused`/`error`.

## Overall: **PASS**

a–c: 0 failures. e: no runid went from compiled to refused/error.
