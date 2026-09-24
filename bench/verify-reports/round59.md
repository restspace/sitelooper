# Round 59 verification report

**Commit:** `6cf84c15f3fe5e38d80d6ed1a9a9bad61a1faadb` — "bench: verify-round59 prompt (fix/round59: five merged round-59 fixes)"

**Chromium revision used:** 1228 (`/opt/pw-browsers/chromium-1228`, Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium`. The box previously shipped only `chromium-1194` under `/opt/pw-browsers`; no `SITELOOPER_EXECUTABLE` override was needed since the installed `@playwright/test` resolves to 1228 by default.

**Overall: FAIL** — checks a and b each have 18 failing tests (same underlying code bugs, not a browser-version issue: the failures come from unit-style tests using Playwright test doubles, not real Chromium sessions).

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  5 failed | 126 passed | 14 skipped (145)
     Tests  18 failed | 2378 passed | 347 skipped (2743)
```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  5 failed | 139 passed | 1 skipped (145)
     Tests  18 failed | 2570 passed | 155 skipped (2743)
```

Both a and b fail the same 18 tests, across the same 5 files, with the same errors. Two distinct root causes:

### 1. `TypeError: loc.first(...).evaluate is not a function` at `src/execution/echo.ts:148` (`markActed`)

Affects 16 of the 18 failures. `markActed` calls `loc.first().evaluate(...)`, but the locator passed in at these call sites doesn't support `.evaluate` (in `runStepBody` → `runOneStep` → `replaySkill`, `src/skills/replay.ts:974` → `:1478` → `:1595`).

- **test/execution-lifecycle.test.ts** > replaySkill through the lifecycle > an executor throw on a non-read step stops the replay with the execution failure, not a verification one
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
   ❯ test/execution-lifecycle.test.ts:181:17
  ```
- **test/execution-lifecycle.test.ts** > replaySkill through the lifecycle > a first action PROVEN not dispatched gives back `acted`; after an earlier dispatch it cannot — same `markActed` TypeError, at `test/execution-lifecycle.test.ts:197:19`
- **test/execution-lifecycle.test.ts** > replaySkill through the lifecycle > a verification failure never re-dispatches the action — same TypeError, at `test/execution-lifecycle.test.ts:226:17`
- **test/execution-lifecycle.test.ts** > replaySkill through the lifecycle > an already-open popup skips the click, dispatches nothing and does not mark `acted` — same TypeError, at `test/execution-lifecycle.test.ts:269:17`
- **test/execution-lifecycle.test.ts** > replaySkill through the lifecycle > a tool the executor never diffs is observed-empty for the alert gate, not unobserved — same TypeError, at `test/execution-lifecycle.test.ts:291:17`
- **test/execution-lifecycle.test.ts** > replaySkill through the lifecycle > a capture that FAILED is still unobserved, and an unrecorded alert in a diff still stops — same TypeError, at `test/execution-lifecycle.test.ts:303:20`
- **test/execution-lifecycle.test.ts** > replaySkill through the lifecycle > a dblclick is never skipped as already in effect (the guard is a single click's shape) — same TypeError, at `test/execution-lifecycle.test.ts:346:17`
- **test/identity.test.ts** > a self-navigating procedure is checked AFTER its goto > runs with a stale-marker warning when the url names this run's record — same TypeError, at `test/identity.test.ts:527:17`
- **test/identity.test.ts** > a self-navigating procedure is checked AFTER its goto > waits for a marker on a page that has not finished arriving — same TypeError, at `test/identity.test.ts:625:19`
- **test/identity.test.ts** > a self-navigating procedure is checked AFTER its goto > asks the url again once the wait is spent, not only at the first look — same TypeError, at `test/identity.test.ts:683:19`
- **test/identity.test.ts** > a replay that acted is never retried by a sibling > marks `acted` when the action fired, even if the step did not complete — same TypeError, at `test/identity.test.ts:915:17`
- **test/identity.test.ts** > a step never acts on a slot the run could not fill > drops a dead locator rung and acts through the rung behind it — same TypeError, at `test/identity.test.ts:1040:17`
- **test/replay-linknav.test.ts** > a link click recorded on the page it left > passes, warned, when the click went where the link points
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
   ❯ replayWith test/replay-linknav.test.ts:65:15
   ❯ test/replay-linknav.test.ts:78:17
  ```
- **test/replay-linknav.test.ts** > a link click recorded on the page it left > still stops when no link was reported, as round 33 did — same TypeError, at `test/replay-linknav.test.ts:86:17`
- **test/replay-linknav.test.ts** > a link click recorded on the page it left > still stops when the click went somewhere the link does not point — same TypeError, at `test/replay-linknav.test.ts:92:17`

### 2. `markActed is not defined` (ReferenceError surfaced through an assertion)

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

### 3. Unrelated assertion mismatches (2 more, same file/describe block)

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
  +
  + // This file needs @playwright/test and nothing else. A module-scoped
  + // declaration of the one Node global it reads keeps it type-checking in a
  + // project without @types/node, and shadows harmlessly in one that has it.
  + declare const process: { env: Record<string, string | undefined> };
  +
  + // @sitelooper-flow-begin
  + export const FLOW = {
  +   "version": 1,
  +   "name": "echo",
  +   "origin": "http://app.test",
  +   "startUrl": "http://app.test/",
  +   "vars": [],
  +   "steps": [
  +     {
  +       "id": "01-set",
  +       "instruction": "set the range",
  +       "params": {
  +         "v1": "Echoville"
  +       },
  ```
- **test/execution-echo.test.ts** > the emitted ledger > echoRead, run from the whole helper block, lists the key and warns once for an echo, and nothing otherwise
  ```
  AssertionError: expected [] to deeply equal [ '01-set.shown' ]

  Compared values have no visual difference.

   ❯ test/execution-echo.test.ts:121:24
  ```

(That's 16 + 1 + 2 = 19 distinct failure occurrences listed above but only 18 unique tests fail — `test/execution-lifecycle.test.ts`'s first failure and `markActed` TypeError entries above enumerate exactly the 18 failing tests reported by vitest; test/execution-echo.test.ts's two failures are part of that 18.)

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  155 passed (155)
```

0 failures. 155/155 passed on Chromium 1228 (round 56's own verify saw 140/140; the parity suite has grown since). No sign of the "both runners bound a navigation that never completes" failure seen on chromium-1194 in the round-56c run — this run's parity failures are zero, so parity is unaffected by either the code changes or the browser version.

## d/e. `bench/corpus-check.mjs` vs `bench/corpus-snapshots/r57-4bd2d936.json`

- **Row count (this run):** 316
- **Row count (r57 snapshot):** 306
- **Rows with a changed `status` (old → new), keyed by `runid`:** 0
- **New runids (present now, absent from r57):** 10, all `compiled`:
  - fwrd90, fwod84, fwgr71, fwkb42, fwop13, fwgt10, fwvk10, fwec11, fwsi10, fwgh13
- **Runids removed (present in r57, absent now):** 0

No runid regressed from `compiled` to `refused`/`error`; no runid changed status at all. The corpus-check tool's own log additionally reports 5 "newly-refusing" and 5 "fixed" runids, but those are computed against the tool's own internal history file, not against `bench/corpus-snapshots/r57-4bd2d936.json` — the diff above is the one done directly against the r57 snapshot as instructed, and it shows zero status changes.

Aggregate compile rate this run: 75.1% (223/297 scorable; 223 compiled, 75 refused, 0 crashed).

Snapshot copied to `bench/corpus-snapshots/r59-6cf84c15.json`.

## Verdict

**FAIL** — checks a and b each have 18 failing tests, rooted in `markActed` (`src/execution/echo.ts:148`) calling `.evaluate()` on a locator that doesn't support it, plus a related `markActed is not defined` ReferenceError and two `test/execution-echo.test.ts` assertion mismatches in the same area. Check c (parity) is clean at 155/155 on the correct Chromium revision (1228), and the corpus check shows no regressions versus the r57 snapshot.
