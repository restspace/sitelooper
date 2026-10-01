# verify r85-erpnext

Commit: `1ec59c13 bench: verify-r85-erpnext and fwen4-luna prompts` (landedAs in gates.ts and test/r85-erpnext.test.ts present)
Chromium: playwright chromium v1228 (Chrome for Testing 149.0.7827.55, /opt/pw-browsers/chromium-1228); 1194 also on box but not used.
Note: the container restarted twice during the first parity attempts (killed runs, not failures); the parity run below is the complete re-run.

## c. parity (BP_PARITY_TESTS=1)
exit 0 wall 1826s
 Test Files  1 passed (1)
      Tests  204 passed (204)

## a. suite
exit 0 wall 87s
 Test Files  195 passed | 26 skipped (221)
      Tests  3129 passed | 439 skipped (3568)

## b. browser (BP_BROWSER_TESTS=1)
exit 0 wall 622s
 Test Files  219 passed | 2 skipped (221)
      Tests  3363 passed | 205 skipped (3568)
No failing tests. Requested files, all passed in b (parity ran in c: 204 passed; shown skipped in b as expected):
```
✓ test/facts-stage4-corpus.test.ts (23 tests) 67ms
✓ test/facts-stage3-corpus.test.ts (18 tests) 20ms
✓ test/facts-stage2-corpus.test.ts (21 tests) 18ms
✓ test/facts-stage1-corpus.test.ts (17 tests) 27ms
✓ test/facts-value.test.ts (47 tests) 156ms
✓ test/facts.test.ts (33 tests) 29ms
✓ test/ledger.test.ts (58 tests) 81ms
✓ test/sourcing.test.ts (17 tests) 33ms
✓ test/quoted-literal.test.ts (11 tests) 21ms
✓ test/commentary-report.test.ts (6 tests) 33ms
✓ test/replay-heal-guard.test.ts (9 tests) 35ms
✓ test/compile-typed-prefix.test.ts (2 tests) 26ms
✓ test/credential-facts.test.ts (4 tests) 32ms
✓ test/sourcing-hold.browser.test.ts (7 tests) 4000ms
✓ test/spec-emit.test.ts (167 tests) 32000ms
✓ test/hash-id-slot.test.ts (4 tests) 5ms
✓ test/execution-refill.test.ts (14 tests) 24ms
✓ test/press-focus.browser.test.ts (2 tests) 823ms
✓ test/execution-browser.test.ts (25 tests) 512ms
✓ test/slow-submit.browser.test.ts (1 test) 3671ms
✓ test/unasked-word.test.ts (11 tests) 35ms
✓ test/read-mint.test.ts (3 tests) 104ms
✓ test/mask-published-marker.test.ts (3 tests) 5ms
✓ test/control-args-unslotted.test.ts (3 tests) 46ms
✓ test/retried-submit.test.ts (9 tests) 67ms
✓ test/restored-field.test.ts (8 tests) 125ms
✓ test/read-mint.browser.test.ts (1 test) 1420ms
✓ test/minted-fill.test.ts (4 tests) 198ms
✓ test/carry-choice.test.ts (8 tests) 72ms
✓ test/carry-reopen.test.ts (8 tests) 70ms
✓ test/app-minted-url.test.ts (14 tests) 103ms
✓ test/r84-erpnext.test.ts (10 tests) 142ms
✓ test/r85-erpnext.test.ts (19 tests) 4449ms
✓ test/cli-acceptance.test.ts (11 tests) 4256ms
✓ test/shape-gate.test.ts (26 tests) 439ms
✓ test/observation.browser.test.ts (5 tests) 19840ms
✓ test/replay-linknav.test.ts (7 tests) 37ms
✓ test/execution-expect.test.ts (48 tests) 278ms
✓ test/execution-linknav.test.ts (14 tests) 29ms
✓ test/execution-source.test.ts (7 tests) 4455ms
✓ test/rebuild.test.ts (9 tests) 3711ms
↓ test/execution-parity.test.ts (204 tests | 204 skipped)
```

## d/e. corpus
Rows: 411 (baseline 411). Changed status: 0. New runids: 0. Removed: 0. Baseline: r84e-27cf12df.json.
411 branch(es); 18 incomplete (no flow or no store); 1 known-unfixable, reported but not scored.

**compile rate 79.3%** (311/392 scorable) — compiled 311, refused 82, crashed 0.

Informational per-branch movement vs old compile logs (does not decide verdict):
- newly-refusing (5): fwrd50 (unbound-pin, unbound-slot), fwod52, fwgr47, fwkb8, fwkb15 (unsourced-ref)
- fixed (6): fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4

## f. facts-report
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
exit 0
```

## Overall: PASS
