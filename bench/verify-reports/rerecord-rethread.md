# Verify: fix/rerecord-rethread

Commit: `1865b6bb` — rerecord: a re-recorded step's reported value that is a part of its end url is re-threaded to the url part (fwgr74-cv2)

Chromium: revision 1228 (Chrome for Testing 149.0.7827.55), installed fresh to `/opt/pw-browsers/chromium-1228` via `npx playwright install --with-deps chromium`. The box previously only had chromium-1194 under `/opt/pw-browsers`; `@playwright/test`'s `browsers.json` pins revision 1228, which is what the suites below ran against.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  163 passed | 23 skipped (186)
     Tests  2667 passed | 432 skipped (3099)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  184 passed | 2 skipped (186)
     Tests  2894 passed | 205 skipped (3099)
```

0 failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

0 failures.

## d. `bench/corpus-check.mjs`

368 rows in `/tmp/v/corpus.json` (copied to `bench/corpus-snapshots/rrt-1865b6bb.json`).

`fwod88` and `fwgr74` both show `status: "refused"` (`unsourced-ref`), consistent with the baseline (see below) — the box has `c8ee4fd7`, so the "-cv shadowing" concern noted in the task does not apply here.

## e. Comparison against baseline `results/verify-round63-5iu88l:bench/corpus-snapshots/r63-8212f830.json`

Baseline: 351 rows. Current: 368 rows. Compared keyed by `runid`, field `status`.

**Status changes: 0.**

**New runids (17)** — present in the current corpus but not in the baseline (expected corpus growth since the baseline was recorded, not caused by this branch):

| runid | status |
| --- | --- |
| fwrd93 | compiled |
| fwrd94 | compiled |
| fwod89 | compiled |
| fwod90 | refused |
| fwgr76 | compiled |
| fwkb45 | refused |
| fwop18 | compiled |
| fwop19 | compiled |
| fwgt15 | compiled |
| fwgt16 | compiled |
| fwvk15 | compiled |
| fwec15 | compiled |
| fwec16 | compiled |
| fwsi15 | compiled |
| fwsi16 | refused |
| fwgh18 | compiled |
| fwgh19 | compiled |

## Overall: PASS

a-c: 0 failures across all three suites. e: 0 runid status changes among the 351 runids common to both the baseline and current corpus (17 new runids beyond the baseline, no status regressions or improvements among matched runids).
