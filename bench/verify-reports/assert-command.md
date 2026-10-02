# verify assert-command

Commit: c1948c81 assert: end-to-end browser test, docs, vars banked when declared
Chromium: playwright chromium v1228 (Chrome for Testing 149.0.7827.55), /opt/pw-browsers/chromium-1228; SITELOOPER_EXECUTABLE unset, so Playwright resolves its pinned 1228 (1194 also present, unused).

## c. parity (BP_PARITY_TESTS=1, maxForks=1)
```
exit=0 wall=1889s
 Test Files  1 passed (1)
      Tests  208 passed (208)
```

## a. full suite (maxForks=4), exit 0
```
 Test Files  199 passed | 27 skipped (226)
      Tests  3235 passed | 453 skipped (3688)
```

## b. browser suite (BP_BROWSER_TESTS=1, maxForks=2), exit 0
```
 Test Files  224 passed | 2 skipped (226)
      Tests  3479 passed | 209 skipped (3688)
```
No failing tests in a, b or c. Named files (all passed in b; execution-parity is skipped in b by design and passed 208/208 in c):
```
✓ test/facts-stage4-corpus.test.ts (23 tests) 70ms
✓ test/facts-stage3-corpus.test.ts (18 tests) 19ms
✓ test/facts-stage2-corpus.test.ts (21 tests) 19ms
✓ test/facts-stage1-corpus.test.ts (17 tests) 33ms
✓ test/facts-value.test.ts (47 tests) 119ms
✓ test/facts.test.ts (33 tests) 28ms
✓ test/ledger.test.ts (58 tests) 59ms
✓ test/sourcing.test.ts (17 tests) 26ms
✓ test/quoted-literal.test.ts (11 tests) 19ms
✓ test/commentary-report.test.ts (6 tests) 29ms
✓ test/replay-heal-guard.test.ts (9 tests) 34ms
✓ test/compile-typed-prefix.test.ts (2 tests) 24ms
✓ test/credential-facts.test.ts (4 tests) 23ms
✓ test/sourcing-hold.browser.test.ts (7 tests) 3737ms
✓ test/spec-emit.test.ts (167 tests) 34302ms
✓ test/hash-id-slot.test.ts (4 tests) 7ms
✓ test/execution-refill.test.ts (14 tests) 23ms
✓ test/press-focus.browser.test.ts (2 tests) 767ms
✓ test/execution-browser.test.ts (25 tests) 518ms
✓ test/slow-submit.browser.test.ts (1 test) 3630ms
✓ test/unasked-word.test.ts (11 tests) 31ms
✓ test/read-mint.test.ts (3 tests) 113ms
✓ test/mask-published-marker.test.ts (3 tests) 6ms
✓ test/control-args-unslotted.test.ts (3 tests) 48ms
✓ test/retried-submit.test.ts (9 tests) 65ms
✓ test/restored-field.test.ts (8 tests) 144ms
✓ test/read-mint.browser.test.ts (1 test) 1368ms
✓ test/minted-fill.test.ts (4 tests) 235ms
✓ test/carry-choice.test.ts (8 tests) 45ms
✓ test/carry-reopen.test.ts (8 tests) 76ms
✓ test/app-minted-url.test.ts (14 tests) 128ms
✓ test/r84-erpnext.test.ts (10 tests) 160ms
✓ test/r85-erpnext.test.ts (19 tests) 5038ms
✓ test/r86-erpnext.test.ts (19 tests) 1690ms
✓ test/assert-record.test.ts (21 tests) 2592ms
✓ test/assert-replay.test.ts (32 tests) 92ms
✓ test/assert-spec.test.ts (34 tests) 26146ms
✓ test/assert-e2e.browser.test.ts (10 tests) 117253ms
✓ test/cli-acceptance.test.ts (11 tests) 4675ms
✓ test/shape-gate.test.ts (26 tests) 536ms
✓ test/observation.browser.test.ts (5 tests) 19571ms
✓ test/replay-linknav.test.ts (7 tests) 39ms
✓ test/execution-expect.test.ts (48 tests) 275ms
✓ test/execution-linknav.test.ts (14 tests) 38ms
✓ test/execution-source.test.ts (7 tests) 5285ms
✓ test/rebuild.test.ts (9 tests) 3942ms
↓ test/execution-parity.test.ts (208 tests | 208 skipped)
```

## d/e. corpus-check vs bench/corpus-snapshots/r86e-c8566eb0.json
Rows: 411 (baseline 411). Status changed: 0. New runids: 0. Missing runids: 0. compiled -> refused: none.
Informational (corpus-check vs each branch's OLD compile log; never decides verdict): compile rate 79.3% (311/392 scorable), compiled 311, refused 82, crashed 0; fixed 6 (fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4), newly-refusing 5 (fwrd50 unbound-pin+unbound-slot; fwod52, fwgr47, fwkb8, fwkb15 unsourced-ref), still-refusing 33. These match the baseline snapshot, so they are not changes introduced by this branch.

## f. facts-report fwod26-skills (exit 0)
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

## Overall: PASS
