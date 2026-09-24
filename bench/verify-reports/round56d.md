# Verify round56d

Commit: `1a464d5b` (bench: verify-round56d prompt (main, on the pinned Chromium revision)), branch `main`.

Chromium: `npx playwright install --with-deps chromium` installed revision **1228** (Chrome for Testing 149.0.7827.55) to `/opt/pw-browsers/chromium-1228`, matching the revision pinned in `node_modules/playwright-core`'s `browsers.json`. All test runs below ran against 1228, not the pre-existing 1194 install.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  121 passed | 13 skipped (134)
     Tests  2334 passed | 326 skipped (2660)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  133 passed | 1 skipped (134)
     Tests  2520 passed | 140 skipped (2660)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  140 passed (140)
```

No failures. In particular, `both runners bound a navigation that never completes, and report it` — the case that failed on round56c under chromium-1194 — **passed** here under chromium-1228, confirming that failure was a browser-version issue, not a code regression.

## d/e. Corpus check (`bench/corpus-check.mjs`) vs `bench/corpus-snapshots/r55-42122950.json`

- Rows in r55 snapshot: 286. Rows in round56d corpus.json: 306.
- Compared by `runid`, field `status`: **0 changed**, **20 new** runids (present in round56d, absent from the r55 snapshot — all newly added corpus branches, not regressions). No runid from the r55 snapshot is missing from round56d.

New runids and their status:

| runid | status |
| --- | --- |
| fwrd88 | compiled |
| fwrd89 | compiled |
| fwod82 | refused |
| fwod83 | compiled |
| fwgr69 | refused |
| fwgr70 | compiled |
| fwkb40 | compiled |
| fwkb41 | compiled |
| fwop11 | compiled |
| fwop12 | compiled |
| fwgt8 | compiled |
| fwgt9 | compiled |
| fwvk8 | compiled |
| fwvk9 | compiled |
| fwec9 | compiled |
| fwec10 | compiled |
| fwsi8 | compiled |
| fwsi9 | refused |
| fwgh11 | compiled |
| fwgh12 | compiled |

No runid present in both snapshots changed status (no compiled→refused/error transitions, no refused→compiled transitions either). The corpus-check tool's own "movement against the branch's own compile log" section lists 5 "fixed" and 5 "newly-refusing" entries, but those are against each branch's own historical/embedded compile record, not the r55 snapshot; checked against the r55 snapshot directly, all 5 "newly-refusing" runids (`fwrd50`, `fwod52`, `fwgr47`, `fwkb8`, `fwkb15`) are `refused` in both r55 and round56d, and all 5 "fixed" runids (`fwrd55`, `fwod48`, `fwod57`, `fwgr64`, `fwgh4`) are `compiled` in both — no discrepancy between the two comparisons.

## Overall: **PASS**

Reason: (a), (b), (c) all have 0 failures. The corpus comparison (d/e) shows 0 changed statuses among runids present in both snapshots, and no runid went from compiled to refused/error.
