# verify r87-erpnext — PASS

Commit: `e2c6a390 assert: a compiled check waits the runners' default, not the recording model's timeout; fwen7 prompt runs on the branch`
fwen6 markers (movedAfterMs, holdForRecordedMove, askedAsRecorded, test/r87-erpnext.test.ts, assert-negative): all present.
Browser: Chromium revision 1228 installed (/opt/pw-browsers/chromium-1228, default PLAYWRIGHT_BROWSERS_PATH; 1194 also present on the box, SITELOOPER_EXECUTABLE not set). Browser tests ran with the repo's @playwright/test default, which wants 1228.

## a-c tests (0 failures, no failing tests)
- c parity (BP_PARITY_TESTS=1, maxForks=1): exit 0, wall 2132s. Test Files 1 passed (1); Tests 210 passed (210).
- a suite: Test Files 200 passed | 27 skipped (227); Tests 3256 passed | 455 skipped (3711).
- b browser (BP_BROWSER_TESTS=1): Test Files 225 passed | 2 skipped (227); Tests 3500 passed | 211 skipped (3711). Skipped: test/execution-parity.test.ts (needs BP_PARITY_TESTS, passed in c), test/journal-overhead.browser.test.ts.
- Every named file passed in the browser run (including all of facts-*, ledger, sourcing, quoted-literal, commentary-report, r84-r87-erpnext (r87: 21 tests), report-asks, step-verdict-asks, execution-lifecycle, assert-*, assert-e2e.browser (10), cli-acceptance, shape-gate, observation.browser, replay-linknav, execution-*, rebuild, spec-emit (167), press-focus.browser, slow-submit.browser, read-mint.browser, sourcing-hold.browser). In the plain suite the *.browser files are skipped as expected; execution-parity passed in c.

## d/e corpus
- 411 rows (18 incomplete, 392 scorable): compiled 311, refused 82, crashed 0, compile rate 79.3%.
- Compared with baseline asrt-c1948c81.json by runid: 411 rows in baseline, 0 status changes, 0 new runids, 0 missing.
- No compiled -> refused change; no refused -> compiled change.
- corpus-check's own movement vs old per-branch logs (INFORMATIONAL ONLY): fixed 6 (fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4); newly-refusing 5 (fwrd50 unbound-pin/unbound-slot; fwod52, fwgr47, fwkb8, fwkb15 unsourced-ref); still-refusing 33. Known-unfixable: fwod56.
- Snapshot: bench/corpus-snapshots/r87e-e2c6a390.json

## f facts-report (verbatim)
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```
exit 0

## Overall: PASS
