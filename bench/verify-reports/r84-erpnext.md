# verify r84-erpnext — PASS

Commit: `27cf12df bench: verify-r84-erpnext and fwen3-luna prompts` (fwen2 fixes present: anchorMarkerValues, test/r84-erpnext.test.ts).
Chromium: revision 1228 installed (/opt/pw-browsers/chromium-1228, chromium_headless_shell-1228); 1194 not used.

## c. parity (BP_PARITY_TESTS=1, maxForks=1)
exit 0, wall 1826s
- Test Files  1 passed (1)
- Tests  204 passed (204)

## a. suite
- Test Files  194 passed | 26 skipped (220)
- Tests  3110 passed | 439 skipped (3549)
exit 0, 0 failures.

## b. browser (BP_BROWSER_TESTS=1, maxForks=2)
- Test Files  218 passed | 2 skipped (220)
- Tests  3344 passed | 205 skipped (3549)
exit 0, 0 failures. (Per-file results are in /tmp/v/browser.log; no file failed.)

## d. corpus-check
411 rows; 18 incomplete; compile rate 79.3% (311/392): compiled 311, refused 82, crashed 0.
Informational movement vs each branch's OLD compile log (not deciding):
- fixed (6): fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4
- newly-refusing (5): fwrd50 (unbound-pin, unbound-slot), fwod52, fwgr47, fwkb8, fwkb15 (unsourced-ref)
- still-refusing 33, unchanged-ok 273, no-record 76

## e. snapshot comparison vs r83e-859906a2.json (by runid, status)
Rows: base 411, now 411. Changed: 0. New runids: 0. Dropped: 0.
No compiled -> refused change.

## f. facts-report (fwod26-skills)
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```
exit 0

## Overall: PASS
