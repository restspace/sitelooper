# verify r86-erpnext

Commit: c8566eb0 bench: verify-r86-erpnext and fwen5-luna prompts (branch fix/r86-erpnext; fwen4 markers present)
Chromium: playwright revision 1228 (/opt/pw-browsers/chromium-1228, Chrome 149.0.7827.55); SITELOOPER_EXECUTABLE pointed at it.

## c. parity (BP_PARITY_TESTS=1, maxForks=1)
 Test Files  1 passed (1)
      Tests  204 passed (204)
 exit 0, wall 1815s

## a. default suite (maxForks=4)
 Test Files  196 passed | 26 skipped (222)
      Tests  3148 passed | 439 skipped (3587)

## b. BP_BROWSER_TESTS=1 (maxForks=2)
 Test Files  220 passed | 2 skipped (222)
      Tests  3382 passed | 205 skipped (3587)

Named files: all passed in the browser run (every listed file ✓, none failing). In the default run (a) the *.browser tests (sourcing-hold, press-focus, slow-submit, read-mint.browser, observation.browser) and execution-parity were skipped by design; execution-parity passed in c (204/204). All other named files passed in both runs. No failing tests.

## d/e. corpus
Rows: 411 (baseline r85e-1ec59c13: 411). Status changed: 0. New runids: 0. No compiled -> refused, no refused -> compiled.
corpus-check informational movement vs each branch's OLD compile log (does not decide verdict):
- newly-refusing (5): fwrd50 (unbound-pin, unbound-slot), fwod52, fwgr47, fwkb8, fwkb15 (unsourced-ref)
- fixed (6): fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4
- known-unfixable: fwod56 (refused, genuine unpublished dependency)

## f. facts-report (fwod26-skills)
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
exit 0
```

## Overall: PASS
