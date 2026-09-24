# Verify report: round56c

Commit: `c2dea2ff93a7257ffa030679b38cfca968024e2c` ("bench: verify-round56c prompt (full re-verify of main after the comment fix)")

Note on environment: this container's pre-installed Playwright browser (`/opt/pw-browsers`, chromium-1194) does not match the project's pinned `@playwright/test` (`^1.61.1`, which wants chromium revision 1228), and the daemon's browser launcher (`src/daemon/browser.ts`) only tries the `chrome`/`msedge`/`chromium` *channels*, not Playwright's own downloaded browser. The first run of check (b) failed every test that needed a real browser with "could not launch a browser (tried channels: chrome, msedge, chromium)". Checks (b), (c) and (d) below were run with `SITELOOPER_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` set so the tests could actually execute; no source or test file was changed.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  121 passed | 13 skipped (134)
     Tests  2332 passed | 328 skipped (2660)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  133 passed | 1 skipped (134)
     Tests  2518 passed | 142 skipped (2660)
```

0 failures (with `SITELOOPER_EXECUTABLE` set as noted above; the first attempt without it failed 21 files / 28 tests purely on browser launch).

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed (1)
     Tests  1 failed | 139 passed (140)
```

1 failing test (reproduced on retry, not a flake):

**`execution parity (daemon replay vs emitted artifact) > both runners bound a navigation that never completes, and report it`**

```
AssertionError: expected [ 'visit:rec-77' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "visit:rec-77",
+ ]

 ❯ test/execution-parity.test.ts:1233:23
    1231|     // Neither reached the server, and neither went on to do the work:…
    1232|     // that read the dead navigation as an arrival would have marked s…
    1233|     expect(replayLog).toEqual([]);
       |                       ^
    1234|     expect(emittedLog).toEqual([]);
    1235|
```

## d/e. `node bench/corpus-check.mjs` vs `bench/corpus-snapshots/r55-42122950.json`

- Row count: new = 301, old (r55) = 286.
- Runids with a changed `status` (old -> new): **0**.
- Runids new since r55 (not present in the r55 snapshot): **15**, all from branches that didn't exist at r55 time:
  - fwrd88 -> compiled
  - fwrd89 -> compiled
  - fwod82 -> refused
  - fwod83 -> compiled
  - fwgr69 -> refused
  - fwgr70 -> compiled
  - fwkb40 -> compiled
  - fwkb41 -> compiled
  - fwop11 -> compiled
  - fwop12 -> compiled
  - fwgt8 -> compiled
  - fwvk8 -> compiled
  - fwec9 -> compiled
  - fwsi8 -> compiled
  - fwgh11 -> compiled
- No runid present in both snapshots changed status, and none went from compiled to refused/error.
- New corpus.json copied to `bench/corpus-snapshots/r56c-c2dea2ff.json`.

## Overall: **FAIL**

Checks a, b, d/e are clean, but check c has one reproducible failure (`execution-parity.test.ts`, "both runners bound a navigation that never completes, and report it") on commit c2dea2ff of main.
