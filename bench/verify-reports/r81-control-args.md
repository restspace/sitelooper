# verify r81-control-args

Commit: `57b71c4e compile: a read's kind, a wait's state and other control args are never slotted` (fix/r81-control-args; restoreControlArgs guard present)
Chromium: revision 1228 installed (/opt/pw-browsers/chromium-1228, headless shell 149.0.7827.55); tests ran with PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers.

## a. Suite (maxForks=4)
Test Files  191 passed | 26 skipped (217)
Tests  3067 passed | 438 skipped (3505) — 0 failures

## b. Browser suite (BP_BROWSER_TESTS=1, maxForks=2)
Test Files  215 passed | 2 skipped (217)
Tests  3300 passed | 205 skipped (3505) — 0 failures
Named files: all passed (facts-stage4/3/2/1-corpus 23/18/21/17, facts-value 47, facts 33, ledger 58, sourcing 17, quoted-literal 11, commentary-report 6, replay-heal-guard 9, compile-typed-prefix 2, credential-facts 4, sourcing-hold.browser 7, spec-emit 166, hash-id-slot 4, execution-refill 14, press-focus.browser 2, execution-browser 25, slow-submit.browser 1, unasked-word 11, read-mint 3, mask-published-marker 3, control-args-unslotted 3, read-mint.browser 1, minted-fill 4, carry-choice 8, carry-reopen 8, rebuild 9).
test/execution-parity.test.ts: skipped (204 tests) in this run (needs BP_PARITY_TESTS).

## c. Parity (BP_PARITY_TESTS=1, test/execution-parity.test.ts) — DID NOT COMPLETE
Run 1: no test result after 30 min (killed at the background limit; vitest worker at ~5 GB RSS).
Retry (once, with --testTimeout=120000 and `timeout 1500`): killed by timeout after 25 min (exit 124), still no summary line.
No test failure was reported; the log only shows `[sitelooper warn/skip]` lines. Result is INCONCLUSIVE, not a pass. Logs: /tmp/v/parity.log, /tmp/v/parity2.log (not committed).

## d/e. Corpus check
Rows: 411 (baseline 411). Changed: 1. New runids: 0.
- fwkb45: refused -> compiled (expected, allowed)
No compiled -> refused changes.
corpus-check's own movement (informational, vs each branch's OLD compile log): fixed 6 (fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4); newly-refusing 5 (fwrd50, fwod52, fwgr47, fwkb8, fwkb15) — these do NOT differ from the r80 snapshot baseline, so they are not regressions of this branch; fwod56 known-unfixable.

## f. facts-report (fwod26-skills), exit 0
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

## Overall: FAIL
a, b, d/e, f are clean, but check c (parity) never completed in two attempts (hang/very slow), so the PASS condition "a-c have 0 failures" cannot be confirmed.
