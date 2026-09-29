# verify r80-marker-mask

Commit: `b8327e6b compile: never wildcard inside a marker, nor a punctuation-only published value` (fix/r80-marker-mask; `function replaceOutsideMarkers` present in src/skills/compile.ts).
Chromium: playwright chromium v1228 (Chrome for Testing 149.0.7827.55) installed at /opt/pw-browsers/chromium-1228 and used via PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers (1194 also present on the box; not used).

## a-c tests
    /tmp/v/suite.log: Test Files  189 passed | 26 skipped (215)
    /tmp/v/suite.log:      Tests  3062 passed | 438 skipped (3500)
    /tmp/v/browser.log: Test Files  213 passed | 2 skipped (215)
    /tmp/v/browser.log:      Tests  3295 passed | 205 skipped (3500)
    /tmp/v/parity.log: Test Files  1 passed (1)
    /tmp/v/parity.log:      Tests  204 passed (204)

(a suite.log, b browser.log, c parity.log in that order.) 0 failing tests in each.

Named files (browser run, all passed; execution-parity is skipped in b and run in c: 204 passed):
- ✓ test/facts-stage4-corpus.test.ts (23 tests) 58ms
- ✓ test/facts-stage3-corpus.test.ts (18 tests) 25ms
- ✓ test/facts-stage2-corpus.test.ts (21 tests) 21ms
- ✓ test/facts-stage1-corpus.test.ts (17 tests) 31ms
- ✓ test/facts-value.test.ts (47 tests) 120ms
- ✓ test/facts.test.ts (33 tests) 39ms
- ✓ test/ledger.test.ts (58 tests) 92ms
- ✓ test/sourcing.test.ts (17 tests) 20ms
- ✓ test/quoted-literal.test.ts (11 tests) 21ms
- ✓ test/commentary-report.test.ts (6 tests) 33ms
- ✓ test/replay-heal-guard.test.ts (9 tests) 40ms
- ✓ test/compile-typed-prefix.test.ts (2 tests) 28ms
- ✓ test/credential-facts.test.ts (4 tests) 23ms
- ✓ test/sourcing-hold.browser.test.ts (7 tests) 4806ms
- ✓ test/spec-emit.test.ts (166 tests) 40014ms
- ✓ test/hash-id-slot.test.ts (4 tests) 8ms
- ✓ test/execution-refill.test.ts (14 tests) 30ms
- ✓ test/press-focus.browser.test.ts (2 tests) 1008ms
- ✓ test/execution-browser.test.ts (25 tests) 527ms
- ✓ test/slow-submit.browser.test.ts (1 test) 3792ms
- ✓ test/unasked-word.test.ts (11 tests) 36ms
- ✓ test/read-mint.test.ts (3 tests) 109ms
- ✓ test/mask-published-marker.test.ts (3 tests) 7ms
- ✓ test/carry-choice.test.ts (8 tests) 51ms
- ✓ test/read-mint.browser.test.ts (1 test) 1658ms
- ✓ test/minted-fill.test.ts (4 tests) 276ms
- ✓ test/carry-reopen.test.ts (8 tests) 94ms
- ✓ test/rebuild.test.ts (9 tests) 4783ms
- ↓ test/execution-parity.test.ts (204 tests | 204 skipped)

## d/e corpus
Rows: 411 (baseline r79c-75e3c7e6: 411). Status changes vs baseline by runid: 0. New runids: 0. Gone: 0.
No compiled -> refused change, no refused -> compiled change.
corpus-check's own movement vs each branch's OLD compile log (INFORMATIONAL ONLY, does not decide verdict):
- newly-refusing (5): fwrd50 (unbound-pin, unbound-slot), fwod52, fwgr47, fwkb8, fwkb15 (unsourced-ref)
- fixed (5): fwrd55, fwod48, fwod57, fwgr64, fwgh4
- known-unfixable: fwod56 (refused, genuine unpublished dependency)
Snapshot: bench/corpus-snapshots/r80m-b8327e6b.json

## f facts-report (verbatim, exit 0)
    == bench/results-published/fwod26-skills ==
    facts: 0 across 0 origin(s)
    shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied

## Overall: PASS
