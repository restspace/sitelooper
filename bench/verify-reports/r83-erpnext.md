# verify r83-erpnext

Commit: 859906a2 bench: verify-r83-erpnext prompt (branch fix/r83-erpnext). Required fixes present (app-minted-url.ts, leftByLink, maxRestNodes).
Chromium: playwright chromium-1228 installed in /opt/pw-browsers (headless-shell 149.0.7827.55); 1194 also present on box, tests ran with default resolution (no SITELOOPER_EXECUTABLE override).

## c. parity (BP_PARITY_TESTS=1, maxForks=1)
exit 0, wall 1811s
 Test Files  1 passed (1)
      Tests  204 passed (204)

## a. full suite
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 192 passed | 26 skipped (219)
      Tests  1 failed | 3099 passed | 439 skipped (3539)

Failing: test/shape-gate.test.ts > no second copy under another name > fences every alphanumeric class outside shape.ts behind the allowlist
```
 FAIL  test/shape-gate.test.ts > no second copy under another name > fences every alphanumeric class outside shape.ts behind the allowlist
AssertionError: A character class that reads alphanumerics appeared (or moved) outside shape.ts. If it asks "is this an id?" or "is this a whole token?", call digitDominant/looksLikeId/tokenPattern/skeleton instead. If it is honest syntax, add it to ALLOWLIST with the question it answers.: expected { …(15) } to deeply equal { …(14) }

- Expected
+ Received

@@ -24,10 +24,13 @@
      "[A-Za-z0-9_-]{1",
    ],
    "src/shared/secrets.ts": [
      "[A-Za-z0-9_]*",
    ],
+   "src/skills/app-minted-url.ts": [
+     "[a-z0-9+.-]*",
+   ],
    "src/skills/compile.ts": [
      "(?![A-Za-z0-9)]",
      "(?<![A-Za-z0-9(=]",
    ],
    "src/skills/facts-url.ts": [

 ❯ test/shape-gate.test.ts:315:7
    313|         '"is this an id?" or "is this a whole token?", call digitDomin…
    314|         'instead. If it is honest syntax, add it to ALLOWLIST with the…
    315|     ).toEqual(expected);
       |       ^
    316|   });
    317| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```
Retried once (file alone): still fails (1 failed | 25 passed). Deterministic: new file src/skills/app-minted-url.ts contains class `[a-z0-9+.-]*` not in the shape-gate ALLOWLIST.

## b. browser run (BP_BROWSER_TESTS=1, maxForks=2)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed | 216 passed | 2 skipped (219)
      Tests  1 failed | 3333 passed | 205 skipped (3539)
Same single failure (shape-gate, as above).

```
 ✓ test/facts-stage4-corpus.test.ts (23 tests) 41ms
 ✓ test/facts-stage3-corpus.test.ts (18 tests) 21ms
 ✓ test/facts-stage2-corpus.test.ts (21 tests) 17ms
 ✓ test/facts-stage1-corpus.test.ts (17 tests) 25ms
 ✓ test/facts-value.test.ts (47 tests) 94ms
 ✓ test/facts.test.ts (33 tests) 29ms
 ✓ test/ledger.test.ts (58 tests) 58ms
 ✓ test/sourcing.test.ts (17 tests) 19ms
 ✓ test/quoted-literal.test.ts (11 tests) 17ms
 ✓ test/commentary-report.test.ts (6 tests) 28ms
 ✓ test/replay-heal-guard.test.ts (9 tests) 35ms
 ✓ test/compile-typed-prefix.test.ts (2 tests) 34ms
 ✓ test/credential-facts.test.ts (4 tests) 22ms
 ✓ test/sourcing-hold.browser.test.ts (7 tests) 3545ms
 ✓ test/spec-emit.test.ts (167 tests) 30931ms
 ✓ test/hash-id-slot.test.ts (4 tests) 5ms
 ✓ test/execution-refill.test.ts (14 tests) 28ms
 ✓ test/press-focus.browser.test.ts (2 tests) 847ms
 ✓ test/execution-browser.test.ts (25 tests) 512ms
 ✓ test/slow-submit.browser.test.ts (1 test) 3529ms
 ✓ test/unasked-word.test.ts (11 tests) 31ms
 ✓ test/read-mint.test.ts (3 tests) 100ms
 ✓ test/mask-published-marker.test.ts (3 tests) 5ms
 ✓ test/control-args-unslotted.test.ts (3 tests) 39ms
 ✓ test/retried-submit.test.ts (9 tests) 58ms
 ✓ test/restored-field.test.ts (8 tests) 126ms
 ✓ test/read-mint.browser.test.ts (1 test) 1225ms
 ✓ test/minted-fill.test.ts (4 tests) 214ms
 ✓ test/carry-choice.test.ts (8 tests) 39ms
 ✓ test/carry-reopen.test.ts (8 tests) 68ms
 ✓ test/app-minted-url.test.ts (14 tests) 89ms
 ✓ test/observation.browser.test.ts (5 tests) 19193ms
 ✓ test/replay-linknav.test.ts (7 tests) 25ms
 ✓ test/execution-expect.test.ts (48 tests) 261ms
 ✓ test/execution-linknav.test.ts (14 tests) 30ms
 ✓ test/execution-source.test.ts (7 tests) 4794ms
 ✓ test/rebuild.test.ts (9 tests) 3558ms
 ↓ test/execution-parity.test.ts (204 tests | 204 skipped)
```
(execution-parity is skipped in this run; it ran in c and passed.)

## d/e. corpus
411 rows (baseline 411). Changed: 0. New: 0. Gone: 0. compile rate 79.3% (311/392 scorable): compiled 311, refused 82, crashed 0. No compiled->refused changes.

## f. facts-report
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
exit 0
```

## Overall: FAIL
Reason: a and b each have 1 failing test (shape-gate allowlist: src/skills/app-minted-url.ts `[a-z0-9+.-]*` needs an ALLOWLIST entry in test/shape-gate.test.ts or use of the shape.ts helpers). Parity, corpus (0 status changes) and facts-report are fine. No source or test changed by this run.
