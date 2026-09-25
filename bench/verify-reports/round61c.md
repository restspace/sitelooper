# Verify round61c

Commit: `b27a74cf` (round 61 gr2: fix the quoting of a test name (transform error)), branch `fix/round61c`.

Chromium revision: **1228** (`/opt/pw-browsers/chromium-1228`, Chrome for Testing 149.0.7827.55). Confirmed installed via `npx playwright install --with-deps chromium`, and used for both the browser suite and the parity suite — never the older `chromium-1194`.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  151 passed | 22 skipped (173)
     Tests  2581 passed | 404 skipped (2985)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  171 passed | 2 skipped (173)
     Tests  2798 passed | 187 skipped (2985)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed (1)
     Tests  1 failed | 185 passed (186)
```

Failing test: `test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners bound a navigation that never completes, and report it`

```
FAIL  test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners bound a navigation that never completes, and report it
Error: Test timed out in 90000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ test/execution-parity.test.ts:1521:3
    1519|   };
    1520|
    1521|   it('both runners bound a navigation that never completes, and report…
       |   ^
    1522|     const slotted = `${origin}/record/{{v1}}`;
    1523|     reset(0);
```

This is the same test that failed on a round-56c run on chromium-1194 (which passed 140/140 on round 56's own verify, and this run's task was framed to tell that browser-version artifact apart from a real code failure). Chromium **1228** is confirmed installed and in use here — this is not a repeat of the 1194 issue. Per the task's retry rule, the test was re-run once in isolation:

```
npx vitest run test/execution-parity.test.ts -t "both runners bound a navigation that never completes" --pool=forks --poolOptions.forks.maxForks=1
```

```
Test Files  1 failed (1)
     Tests  1 failed | 185 skipped (186)
```

Same timeout, same location, on the second run. The failure is reproducible on the correct Chromium revision — it is a real code failure in this round, not a browser-version artifact.

## d/e. Corpus check (`bench/corpus-check.mjs`) vs `bench/corpus-snapshots/rAB-1146f81c.json`

- Rows in rAB-1146f81c baseline: 326. Rows in round61c corpus.json: 336.
- Compared by `runid`, field `status`: **0 changed**, **10 new** runids (present in round61c, absent from the baseline — all newly added corpus branches, not regressions), **0 removed**.

New runids and their status:

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

No runid present in both snapshots changed status (no compiled→refused/error transitions).

## Overall: **FAIL**

Reason: (c) has 1 failing test (`both runners bound a navigation that never completes, and report it` in `test/execution-parity.test.ts`), reproduced on a retry, and confirmed to run on the correct Chromium revision (1228) — so a-c do not have 0 failures and this is not the round-56c browser-version artifact. The corpus comparison (d/e) shows no regressions (0 changed statuses, no compiled→refused/error transitions, 10 new additions only).
