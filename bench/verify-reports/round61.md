# round61 verify report

Commit: `98da7127` (branch `fix/round61`)

Chromium: repo's @playwright/test resolved to revision **1228** (`/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`, Chrome for Testing 149.0.7827.55). No system `chrome`/`msedge` channel was present on the box, so the daemon's channel fallback (`chrome` → `msedge` → `chromium`) landed on the bundled `chromium` channel, which playwright-core resolves to the installed 1228 revision, not the pre-existing 1194 revision also present under `/opt/pw-browsers`. `SITELOOPER_EXECUTABLE` was not needed.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  148 passed | 17 skipped (165)
     Tests  2536 passed | 388 skipped (2924)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  164 passed | 1 skipped (165)
     Tests  2738 passed | 186 skipped (2924)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed (1)
     Tests  2 failed | 184 passed (186)
```

Reproduced identically on one retry (same two assertions, same diff) — a consistent code failure, not a browser-version flake.

### Failing test 1

`execution parity (daemon replay vs emitted artifact) > recorded points > both runners resolve a recorded point to the element of the recorded kind under it`

```
AssertionError: expected [] to deeply equal [ 'mark:near' ]

- Expected
+ Received

- [
-   "mark:near",
- ]
+ []

 ❯ test/execution-parity.test.ts:6037:25
    6035|       const { replay, emitted, replayLog, emittedLog } = await both(fa…
    6036|
    6037|       expect(replayLog).toEqual(['mark:near']);
       |                         ^
    6038|       expect(emittedLog).toEqual(['mark:near']);
    6039|       expect(replay.ok, replay.reason ?? '').toBe(true);
```

### Failing test 2

`execution parity (daemon replay vs emitted artifact) > recorded points > both runners refuse a structural guess far from the recorded point, and take it when no point was recorded`

```
AssertionError: replay must not act on a guess 3000px from the recorded box: expected [] to deeply equal [ 'mark:near' ]

- Expected
+ Received

- [
-   "mark:near",
- ]
+ []

 ❯ test/execution-parity.test.ts:6053:96
    6051|       const point = await nearPoint();
    6052|       const guarded = await both(farSteps([gone, farGuess, point]), 0);
    6053|       expect(guarded.replayLog, 'replay must not act on a guess 3000px…
       |                                                                                                ^
    6054|       expect(guarded.emittedLog, 'the artifact must not act on a guess…
    6055|       expect(guarded.replay.ok, guarded.replay.reason ?? '').toBe(true…
```

## d. `bench/corpus-check.mjs`

Row count: **336** (`/tmp/v/corpus.json`, commit `98da7127`, wallMs 56779).

## e. Comparison with baseline (`results/verify-phaseAB:bench/corpus-snapshots/rAB-1146f81c.json`, 326 rows), keyed by `runid`, field `status`

- Status changed: **0**
- New runids: **10**

| runid | status |
| --- | --- |
| fwrd92 | compiled |
| fwod86 | compiled |
| fwgr73 | compiled |
| fwkb44 | compiled |
| fwop15 | refused |
| fwgt12 | compiled |
| fwvk12 | compiled |
| fwec13 | compiled |
| fwsi12 | compiled |
| fwgh15 | compiled |

No runid present in both snapshots changed status; in particular none went from `compiled` to `refused`/`error`. The one new `refused` row (`fwop15`) has no baseline entry, so it is not a regression.

## Overall: **FAIL**

Checks a and b are clean, and d/e show no compiled→refused/error regressions against the baseline. Check c (execution-parity) has 2 consistent failures (reproduced on retry), so the overall result is FAIL per the PASS criterion (a-c must have 0 failures).
