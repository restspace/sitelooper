# Verify followups

Commit: `dfb9625e followups: build converges by default; a recording's last non-success work is adopted, the rest is named` (contains test/tail-adoption.test.ts, decideBuildConvergence, omitted-work).
Chromium: revision 1228 installed (/opt/pw-browsers/chromium-1228, headless-shell-1228); 1194 also present on the box, tests used the repo's default (1228 via @playwright/test).

## c. Parity (BP_PARITY_TESTS=1, maxForks=1)
Exit 0, wall 1848s (~31 min). Test Files 1 passed (1); Tests 210 passed (210).

## a. Default suite (maxForks=4)
Exit 0. Test Files 206 passed | 27 skipped (233); Tests 3354 passed | 460 skipped (3814).

## b. Browser suite (BP_BROWSER_TESTS=1, maxForks=2)
Exit 1. Test Files 1 failed | 230 passed | 2 skipped (233); Tests 1 failed | 3602 passed | 211 skipped (3814).
(test/execution-parity.test.ts shows skipped here because BP_PARITY_TESTS was not set; it ran in c: 210 passed.)

Failing test: test/assert-e2e.browser.test.ts > sitelooper assert, end to end > re-issued directly, replays the stored assertion with no model call, and a miss is the answer (22915ms)
```
 FAIL  test/assert-e2e.browser.test.ts > sitelooper assert, end to end > re-issued directly, replays the stored assertion with no model call, and a miss is the answer
AssertionError: expected [ [ 'value_equals', false ] ] to deeply equal [ [ 'value_equals', true ], …(1) ]

- Expected
+ Received

  [
    [
      "value_equals",
-     true,
-   ],
-   [
-     "count",
      false,
    ],
  ]

 ❯ test/assert-e2e.browser.test.ts:573:96
    571|     expect(counted.report.status).toBe('failure');
    572|     expect(counted.assertFailed.kind).toBe('failed');
    573|     expect(counted.assertions.map((c: { state: string; held: boolean }…
       |                                                                                                ^
    574|     expect(two.model.calls()).toBe(0);
    575| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 230 passed | 2 skipped (233)
      Tests  1 failed | 3602 passed | 211 skipped (3814)
```
One permitted retry of that file alone (BP_BROWSER_TESTS=1, maxForks=2): Test Files 1 passed; Tests 10 passed (10), the same test taking 39s. So it failed once under the full-suite load and passed on retry — apparently a load-sensitive flake, but unproven.

Named files (browser run):
- test/tail-adoption.test.ts:  ✓ test/tail-adoption.test.ts (10 tests) 16ms
- test/build-default.test.ts:  ✓ test/build-default.test.ts (7 tests) 6ms
- test/build-converge.test.ts:  ✓ test/build-converge.test.ts (17 tests) 14ms
- test/flow.test.ts:  ✓ test/flow.test.ts (179 tests) 2062ms
- test/rebuild.test.ts:  ✓ test/rebuild.test.ts (9 tests) 3761ms
- test/learn-recoveries.test.ts:  ✓ test/learn-recoveries.test.ts (20 tests) 1173ms
- test/no-silent-pass.test.ts:  ✓ test/no-silent-pass.test.ts (21 tests) 24854ms
- test/spec-repair.test.ts:  ✓ test/spec-repair.test.ts (131 tests) 718ms
- test/spec-emit.test.ts:  ✓ test/spec-emit.test.ts (167 tests) 33331ms
- test/execution-expect.test.ts:  ✓ test/execution-expect.test.ts (48 tests) 327ms
- test/execution-resolve-emit.test.ts:  ✓ test/execution-resolve-emit.test.ts (21 tests) 3794ms
- test/hide-toggle.test.ts:  ✓ test/hide-toggle.test.ts (8 tests) 119ms
- test/assert-spec.test.ts:  ✓ test/assert-spec.test.ts (34 tests) 25915ms
- test/assert-e2e.browser.test.ts:  ❯ test/assert-e2e.browser.test.ts (10 tests | 1 failed) 162507ms
- test/execution-browser.test.ts:  ✓ test/execution-browser.test.ts (25 tests) 515ms
- test/cli-acceptance.test.ts:  ✓ test/cli-acceptance.test.ts (11 tests) 4313ms
- test/execution-parity.test.ts:  ↓ test/execution-parity.test.ts (210 tests | 210 skipped)

## d/e. Corpus (branch dfb9625e vs main c1ebbba0)
Rows: 411 on each side. Runids with status change: 0. Lint totals differing per row: 0.
Status counts (both sides): compiled 311, refused 82, incomplete 18.
Lint totals (both sides): gate-before-goto 6, frozen-literal 377, own-output-slot 68, demoted-pin 15, dead-read 114, frozen-locator-id 1651.
No compiled -> refused. (The gate's FAIL vs bench/corpus-baseline.json is stale, informational.)

## Overall: FAIL by the strict rule (b had 1 failure on the first run); that failure passed on its single retry, and a, c, d/e are clean.
