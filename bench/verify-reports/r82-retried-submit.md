# Verify r82-retried-submit

Commit: `72f9a2ce compile: a submit the recording had to retry compiles to the attempt that took` (branch fix/r82-retried-submit; `dropRetriedSubmits` present).
Chromium: revision 1228 (/opt/pw-browsers/chromium-1228, installed via `npx playwright install --with-deps chromium`; no SITELOOPER_EXECUTABLE override).

## c. execution-parity (BP_PARITY_TESTS=1, maxForks=1)
- exit 0, wall 2050s
- Test Files  1 passed (1); Tests  204 passed (204)
- 0 failing tests

## a. default suite (maxForks=4), exit 0
- Test Files  192 passed | 26 skipped (218)
- Tests  3076 passed | 438 skipped (3514)
- 0 failing tests

## b. BP_BROWSER_TESTS=1 (maxForks=2), exit 0
- Test Files  216 passed | 2 skipped (218)
- Tests  3309 passed | 205 skipped (3514)  (the 2 skipped files are execution-parity, run under c, and one other)
- 0 failing tests

Named files (all passed in b; in a the *.browser files skip by design; execution-parity passed in c):
facts-stage4-corpus 23, facts-stage3-corpus 18, facts-stage2-corpus 21, facts-stage1-corpus 17, facts-value 47, facts 33, ledger 58, sourcing 17, quoted-literal 11, commentary-report 6, replay-heal-guard 9, compile-typed-prefix 2, credential-facts 4, sourcing-hold.browser 7, spec-emit 166, hash-id-slot 4, execution-refill 14, press-focus.browser 2, execution-browser 25, slow-submit.browser 1, unasked-word 11, read-mint 3, mask-published-marker 3, control-args-unslotted 3, retried-submit 9, restored-field 8, read-mint.browser 1, minted-fill 4, carry-choice 8, carry-reopen 8, rebuild 9, execution-parity 204 (c).

## d/e. corpus-check vs baseline (r81c-57b71c4e.json)
- rows: 411 (baseline 411)
- status changes: 0; new runids: 0; missing runids: 0
- compiled -> refused: none; refused -> compiled: none
- corpus-check's own movement vs old compile logs (informational only): 6 fixed (fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4); still-refusing includes fwrd50, fwod52, fwgr47, fwkb8, fwkb15; fwod56 known-unfixable.

## f. facts-report fwod26-skills (exit 0)
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

## Overall: PASS
