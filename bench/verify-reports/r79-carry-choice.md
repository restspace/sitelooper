# verify r79-carry-choice

**Overall: PASS** (with one parity flake: see c)

Commit: 75e3c7e6 compile: carry a dead attempt's choice that stuck into the instruction that took it for granted
Chromium: revision 1228 installed via `npx playwright install --with-deps chromium` (/opt/pw-browsers/chromium-1228, chromium_headless_shell-1228); 1194 also present on the box but not selected by this repo's Playwright.

## a. default suite
Test Files  187 passed | 26 skipped (213)
Tests  3056 passed | 438 skipped (3494)
0 failures.

## b. BP_BROWSER_TESTS=1
Test Files  211 passed | 2 skipped (213)
Tests  3289 passed | 205 skipped (3494)
0 failures. Named files (first result line each; all files passed; execution-parity skips here, it runs under c):
- test/facts-stage4-corpus.test.ts:  ✓ test/facts-stage4-corpus.test.ts > fwop24: "Bench" is a fragment of t
- test/facts-stage3-corpus.test.ts:  ✓ test/facts-stage3-corpus.test.ts > fwod84: FURN_7777 is a reliable co
- test/facts-stage2-corpus.test.ts:  ✓ test/facts-stage2-corpus.test.ts > fwec13 / the espo amount: classify
- test/facts-stage1-corpus.test.ts:  ✓ test/facts-stage1-corpus.test.ts > fwop15-cv2: preconditionVerdictWit
- test/facts-value.test.ts:  ✓ test/facts-value.test.ts > admissionStrength: what the ledger admission prove
- test/facts.test.ts:  ✓ test/facts.test.ts > constants and empty > matches the contract 2ms
- test/ledger.test.ts:  ✓ test/ledger.test.ts > looksLikeId (the one copy) > accepts minted ids, including t
- test/sourcing.test.ts:  ✓ test/sourcing.test.ts > sourcingHoldOn > is off unless SITELOOPER_SOURCING_HOLD=
- test/quoted-literal.test.ts:  ✓ test/quoted-literal.test.ts > a reported word is not threaded inside the a
- test/commentary-report.test.ts:  ✓ test/commentary-report.test.ts > a report value the page never showed i
- test/replay-heal-guard.test.ts:  ✓ test/replay-heal-guard.test.ts > rule O — the fwod94 shape through re
- test/compile-typed-prefix.test.ts:  ✓ test/compile-typed-prefix.test.ts > a typed prefix swallowed by a lo
- test/credential-facts.test.ts:  ✓ test/credential-facts.test.ts > the credential fact reaches the recorder
- test/sourcing-hold.browser.test.ts:  ✓ test/sourcing-hold.browser.test.ts > the sourcing hold at the loop 
- test/spec-emit.test.ts:  ✓ test/spec-emit.test.ts > emitFlowFile layout > opens with the version marker an
- test/hash-id-slot.test.ts:  ✓ test/hash-id-slot.test.ts > substituteHashIds > writes a position-only url i
- test/execution-refill.test.ts:  ✓ test/execution-refill.test.ts > standing fills (fwvk1 n3 01-open) > refi
- test/press-focus.browser.test.ts:  ✓ test/press-focus.browser.test.ts > a key press after the pre-submit c
- test/execution-browser.test.ts:  ✓ test/execution-browser.test.ts > shared click dispatch safety > never r
- test/slow-submit.browser.test.ts:  ✓ test/slow-submit.browser.test.ts > a click whose submit is still load
- test/unasked-word.test.ts:  ✓ test/unasked-word.test.ts > an unasked word the run cannot have made is not 
- test/read-mint.test.ts:  ✓ test/read-mint.test.ts > a minted value the procedure read and then typed is bo
- test/read-mint.browser.test.ts:  ✓ test/read-mint.browser.test.ts > a read-minted value in a live replay >
- test/minted-fill.test.ts:  ✓ test/minted-fill.test.ts > a fill of a value the app minted is never replayed
- test/carry-choice.test.ts:  ✓ test/carry-choice.test.ts > carryOpener: a dead attempt's choice that stuck 
- test/carry-reopen.test.ts:  ✓ test/carry-reopen.test.ts > carryOpener: a picker the dead instruction opene
- test/rebuild.test.ts:  ✓ test/rebuild.test.ts > recorded-flow rebuild > dist/ is not older than src/ (run 
- test/execution-parity.test.ts:  ↓ test/execution-parity.test.ts > execution parity (daemon replay vs emitt

## c. BP_PARITY_TESTS=1 execution-parity
First run: Test Files 1 failed (1); Tests 1 failed | 203 passed (204)
Failing test: execution parity > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (delay-500)
```
 FAIL  test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (delay-500)
AssertionError: fill failed: locator.evaluate: Execution context was destroyed, most likely because of a navigation [outcome: unknown]: expected false to be true // Object.is equality

[32m- Expected[39m
[31m+ Received[39m

[32m- true[39m
[31m+ false[39m

 ❯ test/execution-parity.test.ts:7332:48
    7330|       it(`both runners sign in once (${mode})`, async () => {
    7331|         const { replay, emitted, replayLog, emittedLog } = await both(…
    7332|         expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                                ^
    7333|         expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7334|         expect(replayLog).toEqual(['commit:login:admin:pass-x62']);
```
This is a navigation-timing race ("Execution context was destroyed") in a delay-500 case, unrelated to compile. One retry (that test alone, -t "both runners sign in once"): Test Files 1 passed; Tests 4 passed | 200 skipped. Counted as a flake, not retried further.

## d/e. corpus
411 rows (baseline 411); 0 statuses changed; 0 new runids; 0 missing. Expected (carriedChoices fires on fwgt32-luna-n1 only; no status movement).
Compile rate 79.1% (310/392 scorable): compiled 310, refused 83, crashed 0.
corpus-check's own movement vs OLD per-branch logs (informational only, not the verdict): newly-refusing 5 (fwrd50, fwod52, fwgr47, fwkb8, fwkb15); fixed 5 (fwrd55, fwod48, fwod57, fwgr64, fwgh4). These are identical-vs-baseline in the snapshot comparison, so they predate this branch.

## f. facts-report fwod26-skills (exit 0)
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```
