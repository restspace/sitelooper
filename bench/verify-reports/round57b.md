# Verify round57b

Commit: `ebfa26a0` (bench: round 58 prompts (all ten apps) and verify-round57b (main on Chromium 1228)), branch `main`.

Chromium: revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. The box's pre-existing `/opt/pw-browsers/chromium-1194` was left in place but not used — no `SITELOOPER_EXECUTABLE` override was needed or set.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  125 passed | 14 skipped (139)
     Tests  2365 passed | 340 skipped (2705)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  138 passed | 1 skipped (139)
     Tests  2557 passed | 148 skipped (2705)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  148 passed (148)
```

No failures on Chromium 1228 — 148/148 parity cases pass, including "both runners bound a navigation that never completes, and report it" (the case that failed on chromium-1194 in the round-56c run) and "both runners refill a fill once when the page replaced its document before the fill was checked" (fwvk8), which passed cleanly at 18784ms after one internal refill retry (visible in its own console warning, not a test failure). This confirms main continues to pass the full parity suite on the pinned Chromium revision.

## d/e. Corpus check (`bench/corpus-check.mjs`) vs `bench/corpus-snapshots/r57-4bd2d936.json`

- Rows in r57 snapshot: 306. Rows in round57b corpus.json: 308.
- Compared by `runid`, field `status`: **0 changed**, **2 new** runids (present in round57b, absent from the r57 snapshot).

New runids and their status:

| runid | status |
| --- | --- |
| fwrd90 | compiled |
| fwgr71 | compiled |

No runid present in both snapshots changed status (no compiled→refused/error transitions, and no transitions of any kind).

For reference, the corpus-check tool's own "movement against the branch's own compile log" section (computed against each branch's own historical/embedded compile record, not the r57 snapshot) lists 5 "newly-refusing" (`fwrd50`, `fwod52`, `fwgr47`, `fwkb8`, `fwkb15`) and 5 "fixed" (`fwrd55`, `fwod48`, `fwod57`, `fwgr64`, `fwgh4`) entries. Cross-checked against the r57 snapshot: all 5 "newly-refusing" runids are already `refused` in the r57 snapshot, and all 5 "fixed" runids are already `compiled` in the r57 snapshot — no discrepancy with the round57b result above.

`/tmp/v/corpus.json` copied to `bench/corpus-snapshots/r56c-ebfa26a0.json`.

## Overall: **PASS**

Reason: (a), (b) and (c) have 0 failures, and the corpus comparison (d/e) shows 0 changed statuses and no runid moved from compiled to refused/error — only 2 new runids, both compiled.
