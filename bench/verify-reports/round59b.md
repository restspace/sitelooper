# Round 59b verification report

**Commit:** `c3493d7c54ba9e4a7278cc7697cf5a7746faeed6` — "bench: verify-round59b prompt (echo fixes bab9725; baseline r59-6cf84c15)"

**Chromium revision used:** 1228 (`/opt/pw-browsers/chromium-1228`, Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium`. The box shipped only `chromium-1194` under `/opt/pw-browsers` beforehand (plus an unrelated `/opt/pw-browsers/chromium` symlink that still points at the 1194 binary — not used here). No `SITELOOPER_EXECUTABLE` override was needed: the app imports `playwright-core` directly and `@playwright/test` pins its own nested `playwright-core@1.61.1`, both of which resolve `chromium.executablePath()` to `/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`. (A stray top-level `node_modules/playwright@1.63.0-alpha`, hoisted from `@playwright/mcp`, resolves to a *different* revision (1237) and is unused by the app or tests — a red herring, not a browser-version problem.)

**Overall: FAIL** — checks a and b each have the same 18 failing tests, across the same 5 files. This is the identical bug reported in the round59 verify (commit `5bd86b97`, prior to this branch's "echo fixes" commit `bab97252`): `bab97252` did **not** fix the `markActed` bug it claims to address. The failures are unit-style tests using Playwright test doubles, not a Chromium-revision issue — parity (c) is clean at 155/155 on 1228, ruling out the round-56c-style navigation regression this run was checking for.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  5 failed | 126 passed | 14 skipped (145)
     Tests  18 failed | 2378 passed | 347 skipped (2743)
```

18 distinct failing tests, two root causes:

### 1. `TypeError: loc.first(...).evaluate is not a function` at `src/execution/echo.ts:148` (`markActed`) — 16 of 18

`markActed` calls `loc.first().evaluate(...)`, but the locator passed in at these call sites doesn't support `.evaluate` (reached via `runStepBody` → `runOneStep` → `replaySkill`, `src/skills/replay.ts:974` → `:1478` → `:1595`). Confirmed still present at `src/execution/echo.ts:143-148` on this commit — unchanged since round59's own verify.

Failing tests (all share this trace shape):
- `test/execution-lifecycle.test.ts` > replaySkill through the lifecycle > an executor throw on a non-read step stops the replay with the execution failure, not a verification one — `test/execution-lifecycle.test.ts:181:17`
- `test/execution-lifecycle.test.ts` > replaySkill through the lifecycle > a first action PROVEN not dispatched gives back `acted`; after an earlier dispatch it cannot — `:197:19`
- `test/execution-lifecycle.test.ts` > replaySkill through the lifecycle > a verification failure never re-dispatches the action — `:226:17`
- `test/execution-lifecycle.test.ts` > replaySkill through the lifecycle > an already-open popup skips the click, dispatches nothing and does not mark `acted` — `:269:17`
- `test/execution-lifecycle.test.ts` > replaySkill through the lifecycle > a tool the executor never diffs is observed-empty for the alert gate, not unobserved — `:291:17`
- `test/execution-lifecycle.test.ts` > replaySkill through the lifecycle > a capture that FAILED is still unobserved, and an unrecorded alert in a diff still stops — `:303:20`
- `test/execution-lifecycle.test.ts` > replaySkill through the lifecycle > a dblclick is never skipped as already in effect (the guard is a single click's shape) — `:346:17`
- `test/identity.test.ts` > a self-navigating procedure is checked AFTER its goto > runs with a stale-marker warning when the url names this run's record — `:527:17`
- `test/identity.test.ts` > a self-navigating procedure is checked AFTER its goto > waits for a marker on a page that has not finished arriving — `:625:19`
- `test/identity.test.ts` > a self-navigating procedure is checked AFTER its goto > asks the url again once the wait is spent, not only at the first look — `:683:19`
- `test/identity.test.ts` > a replay that acted is never retried by a sibling > marks `acted` when the action fired, even if the step did not complete — `:915:17`
- `test/identity.test.ts` > a step never acts on a slot the run could not fill > drops a dead locator rung and acts through the rung behind it — `:1040:17`
- `test/replay-linknav.test.ts` > a link click recorded on the page it left > passes, warned, when the click went where the link points — `:78:17`
- `test/replay-linknav.test.ts` > a link click recorded on the page it left > still stops when no link was reported, as round 33 did — `:86:17`
- `test/replay-linknav.test.ts` > a link click recorded on the page it left > still stops when the click went somewhere the link does not point — `:92:17`

Representative error (identical shape at every site above, only the final test-file line number changes):
```
TypeError: loc.first(...).evaluate is not a function
 ❯ markActed src/execution/echo.ts:148:6
    146|   const index = await loc
    147|     .first()
    148|     .evaluate((el, key) => {
       |      ^
    149|       const w = window as unknown as { __sitelooperActed?: Record<stri…
    150|       const all = (w.__sitelooperActed ??= {});
 ❯ runStepBody src/skills/replay.ts:974:15
 ❯ runOneStep src/skills/replay.ts:1478:21
 ❯ replaySkill src/skills/replay.ts:1595:20
```

### 2. `markActed is not defined` (ReferenceError surfaced through an assertion) — 1 of 18

- **test/spec-diagnostics.test.ts** > the emitter on a flagged step > a post-resolution failure carries the note at run time, and a pick failure is not noted twice
  ```
  AssertionError: expected [Function] to throw error including 'locator.click: Timeout 10000ms exceed…' but got 'markActed is not defined'

  - Expected
  + Received

  - locator.click: Timeout 10000ms exceeded. [outcome: unknown]
  -   it is pinned to the demoted skill s_demo — fix: sitelooper rerecord flows/demo.json 01-do
  + markActed is not defined

   ❯ test/spec-diagnostics.test.ts:427:5
  ```

### 3. Unrelated assertion mismatches — 2 of 18, same describe block

- **test/execution-echo.test.ts** > the emitted ledger > declares one ledger per segment, feeds it from what a step sets and what a resolved target is named, and asks it at the read
  ```
  AssertionError: expected '// @sitelooper-flow v1\n// Generated …' to contain 'echoRead(typed1, run, \'shown\', \'01…'

  - Expected
  + Received

  - echoRead(typed1, run, 'shown', '01-set.shown', outputs['01-set.shown'], '01-set s_echo/4');
  + // @sitelooper-flow v1
  + // Generated by sitelooper from flow "echo" — do not edit by hand.
  + // Repair drift with `sitelooper repair <this file>`; the FLOW constant below is the source of truth.
  + import { type ElementHandle, expect, test, type Locator, type Page } from '@playwright/test';
  + ... (flow fixture body follows)
  ```
- **test/execution-echo.test.ts** > the emitted ledger > echoRead, run from the whole helper block, lists the key and warns once for an echo, and nothing otherwise
  ```
  AssertionError: expected [] to deeply equal [ '01-set.shown' ]

  Compared values have no visual difference.

   ❯ test/execution-echo.test.ts:121:24
  ```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  5 failed | 139 passed | 1 skipped (145)
     Tests  18 failed | 2570 passed | 155 skipped (2743)
```

Same 18 tests, same 5 files, byte-identical errors and stack traces to (a) above (only the pass/skip counts of unrelated tests differ, as expected with browser tests enabled). Not reproduced again here for brevity — see (a).

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  155 passed (155)
```

0 failures. Confirms the round-56c "both runners bound a navigation that never completes" parity failure does not reproduce on Chromium 1228 — this run's browser-version question is answered clean.

## d/e. Corpus check vs. `bench/corpus-snapshots/r59-6cf84c15.json`

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` ran clean (exit 0), compiling 316 branches (223 compiled, 75 refused, 0 crashed, 18 incomplete/no-store), compile rate 75.1%.

Diff against `bench/corpus-snapshots/r59-6cf84c15.json`, keyed by `runid`, field `status`:

- **row count:** 316 in the baseline, 316 in this run
- **runids with a changed `status`:** 0
- **new runids (present now, absent from baseline):** 0
- **runids missing now (present in baseline, absent now):** 0

No compiled→refused/error regressions, no changes at all.

## Overall: FAIL

- a: 18 failures (not 0)
- b: 18 failures (not 0)
- c: 0 failures
- d/e: 0 runid status changes (no compiled→refused/error regressions)

PASS requires 0 failures in a-c; a and b each fail 18 tests, so this run is a **FAIL**. This is not a browser-version regression (parity is clean on 1228) — it is the same `markActed`/`src/execution/echo.ts:148` bug already reported against `fix/round59` before commit `bab97252` ("the echo element rule is best-effort...") was merged to address it. That commit did not fix the bug: the failing tests, error messages, and stack traces are unchanged from the prior verify.

Corpus snapshot for this run copied to `bench/corpus-snapshots/r59b-c3493d7c.json`.
