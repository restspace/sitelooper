# Verify report: fix/r72-opener-evalwrite

**Commit:** `58115c4345940726fd8cf51d8e8cea6692c61ad3` (58115c43)
> round 72 fixes: the popup-opener guard skips a click only when its popup AND every line of its
> other recorded work already show (odoo fwod98 06-open: "Send and cancel" skipped on every replay
> because the top-bar company menu it brought back into view was already there; the shared
> execution/expect.ts openerAlreadyShowing, replay and the artifact alike); evalMutation refuses an
> eval that sends a request (fetch with a writing method or body, XMLHttpRequest, sendBeacon) or
> patches window.fetch or a prototype (gitea fwgt24-n1 set its labels, assignee and milestone by
> POSTing with fetch(), which no replay reproduces); round 72 rows in bench/SWEEPS.md; round 73
> prompts and verify-r72-fix

Preflight guard: `grep -q 'function openerAlreadyShowing' src/execution/expect.ts` → found. OK to proceed.

**Browser:** Chromium revision **1228**, confirmed installed at `/opt/pw-browsers/chromium-1228`
(`playwright-core/browsers.json` also pins `"chromium": "1228"`). The box additionally ships an
older `chromium-1194` under the same `PLAYWRIGHT_BROWSERS_PATH`, but `@playwright/test` resolved
1228 on its own; `SITELOOPER_EXECUTABLE` was not needed/set.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

**Test Files** 1 failed | 181 passed | 23 skipped (205)
**Tests** 1 failed | 3018 passed | 434 skipped (3453)

Failing test (first 30 lines of error):

```
FAIL  test/execution-lifecycle.test.ts > emitted step lifecycle > an already-open popup returns skipped from act, so no postcondition runs on a click that did not fire
AssertionError: expected 46 to be less than -1
 ❯ test/execution-lifecycle.test.ts:555:52
    553|     // The already-in-effect question is asked AFTER the target resolv…
    554|     // replay orders it, so the pick still runs on a click that is ski…
    555|     expect(act.body.indexOf('await pick(page, [')).toBeLessThan(act.bo…
       |                                                    ^
    556|   });
    557|
```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

**Test Files** 1 failed | 202 passed | 2 skipped (205)
**Tests** 1 failed | 3247 passed | 205 skipped (3453)

Same failing test as in (a) (first 30 lines of error):

```
FAIL  test/execution-lifecycle.test.ts > emitted step lifecycle > an already-open popup returns skipped from act, so no postcondition runs on a click that did not fire
AssertionError: expected 46 to be less than -1
 ❯ test/execution-lifecycle.test.ts:555:52
    553|     // The already-in-effect question is asked AFTER the target resolv…
    554|     // replay orders it, so the pick still runs on a click that is ski…
    555|     expect(act.body.indexOf('await pick(page, [')).toBeLessThan(act.bo…
       |                                                    ^
    556|   });
    557|
```

Named files from the requested list, all passed:

| file | result |
| --- | --- |
| test/facts-stage4-corpus.test.ts | ✓ 23 tests |
| test/facts-stage3-corpus.test.ts | ✓ 18 tests |
| test/facts-stage2-corpus.test.ts | ✓ 21 tests |
| test/facts-stage1-corpus.test.ts | ✓ 17 tests |
| test/facts-value.test.ts | ✓ 47 tests |
| test/facts.test.ts | ✓ 33 tests |
| test/ledger.test.ts | ✓ 58 tests |
| test/sourcing.test.ts | ✓ 17 tests |
| test/quoted-literal.test.ts | ✓ 11 tests |
| test/commentary-report.test.ts | ✓ 6 tests |
| test/replay-heal-guard.test.ts | ✓ 9 tests |
| test/compile-typed-prefix.test.ts | ✓ 2 tests |
| test/credential-facts.test.ts | ✓ 4 tests |
| test/sourcing-hold.browser.test.ts | ✓ 7 tests |
| test/spec-emit.test.ts | ✓ 166 tests |
| test/execution-parity.test.ts | skipped here (204 tests, gated on `BP_PARITY_TESTS`; run separately, see (c)) |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

**Test Files** 1 passed (1)
**Tests** 204 passed (204)

No failures.

## d/e. Corpus check vs. baseline

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`
ran to completion: **397 rows** (branches), compile rate 78.3% (296/378 scorable), 0 crashed.

**Baseline comparison (e) could not be performed as specified**: the baseline branch
`results/verify-r72-fix-u7oy18` does not exist on `origin` (`git fetch origin
results/verify-r72-fix-u7oy18` → `fatal: couldn't find remote ref`). Not retried a second time per
the rules; no substitute branch was guessed. A branch `results/verify-site-facts-4-u7oy18` exists
but is for an unrelated verify task and was not used as a stand-in.

As a substitute signal, `corpus-check.mjs` itself computes movement against **each branch's own
previously-recorded compile log** (`then` / `movement` fields embedded in `/tmp/v/corpus.json`),
which is the same "compiled → refused" question step e was meant to answer, just keyed against a
different (per-branch, tool-internal) reference than the missing external snapshot:

| verdict | branches |
| --- | ---: |
| fixed | 5 |
| still-refusing | 34 |
| **newly-refusing** | **5** |
| unchanged-ok | 259 |
| no-record | 76 |

**5 runids moved compiled → refused** (this is exactly the regression the PASS criterion checks for):

| runid | branch | kinds now |
| --- | --- | --- |
| fwrd50 | results/fwrd50-yr1zk4 | unbound-pin, unbound-slot |
| fwod52 | results/fwod52 | unsourced-ref |
| fwgr47 | results/fwgr47-u4h5a2 | unsourced-ref (+ warn: contradicted-step) |
| fwkb8 | results/fwkb8-4fvnjj | unsourced-ref (+ warn: noop-step) |
| fwkb15 | results/fwkb15-7nh5l8 | unsourced-ref (+ warn: noop-step) |

5 runids moved refused → compiled (listed and allowed by the rules):

| runid | branch | kinds then |
| --- | --- | --- |
| fwrd55 | — | refused |
| fwod48 | — | refused |
| fwod57 | — | unfilled-slot |
| fwgr64 | — | unbound-pin |
| fwgh4 | — | unsourced-ref |

1 known-unfixable, not scored: `fwod56` (refused; recorder authored steps against
`{{05-open.quotation_reference}}`, which 05-open's procedure never publishes — correct refusal).

Because the intended baseline file is missing, it cannot be confirmed whether the 5 newly-refusing
runids above are *new* as of this branch specifically, versus pre-existing drift already present at
the `u7oy18` baseline. They are flagged here as the closest available evidence to what step e asked
for.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

Output verbatim:

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code: 0. Matches the expected "0 facts, 0 rows, applied 0, exit 0".

## Overall verdict: **FAIL**

Reasons:
1. `a` and `b` each have 1 failing test (the same test, `test/execution-lifecycle.test.ts`), not 0.
2. Step `e`'s prescribed baseline branch (`results/verify-r72-fix-u7oy18`) does not exist on
   `origin`, so the required compiled→refused comparison against it could not be run. The tool's
   own internal per-branch movement tracking shows 5 runids (fwrd50, fwod52, fwgr47, fwkb8, fwkb15)
   moved compiled → refused, which is the condition that would fail PASS criterion (e) had the
   comparison been runnable as specified.
