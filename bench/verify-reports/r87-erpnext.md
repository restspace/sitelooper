# verify r87-erpnext

Commit: 38a761b7 bench: verify-r87-erpnext and fwen7-luna prompts
fwen6 markers present. Chromium: revision 1228 installed (/opt/pw-browsers/chromium-1228 and chromium_headless_shell-1228; 1194 also on box); tests ran with the repo's playwright default (1228).

## c. parity (BP_PARITY_TESTS=1, maxForks=1)
exit 0, wall 2106s
 Test Files  1 passed (1)
      Tests  210 passed (210)

## a. default suite (maxForks=4), exit 0
 Test Files  200 passed | 27 skipped (227)
      Tests  3256 passed | 455 skipped (3711)

## b. browser suite (BP_BROWSER_TESTS=1, maxForks=2), exit 1 on first run
 Test Files  1 failed | 224 passed | 2 skipped (227)
      Tests  1 failed | 3499 passed | 211 skipped (3711)

One failure on the first run, PASSED on the single permitted retry (test/assert-e2e.browser.test.ts alone: 10/10 passed, exit 0). Possibly a timing flake (the failing test took 15137ms; its siblings 5-13s). Not root-caused, no fix attempted.

Failing test: test/assert-e2e.browser.test.ts > sitelooper assert, end to end > re-issued directly, replays the stored assertion with no model call, and a miss is the answer
```
 FAIL  test/assert-e2e.browser.test.ts > sitelooper assert, end to end > re-issued directly, replays the stored assertion with no model call, and a miss is the answer
AssertionError: expected [ [ 'value_equals', false ] ] to deeply equal [ [ 'value_equals', true ], …(1) ]

- Expected
+ Received

  [
    [
      "value_equals",
-     true,
-   ],
-   [
-     "count",
      false,
    ],
  ]

 ❯ test/assert-e2e.browser.test.ts:573:96
    571|     expect(counted.report.status).toBe('failure');
    572|     expect(counted.assertFailed.kind).toBe('failed');
    573|     expect(counted.assertions.map((c: { state: string; held: boolean }…
       |                                                                                                ^
    574|     expect(two.model.calls()).toBe(0);
    575| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

Named files (all in the b run, all passed except the one above on first run): facts-stage4/3/2/1-corpus, facts-value, facts, ledger, sourcing, quoted-literal, commentary-report, replay-heal-guard, compile-typed-prefix, credential-facts, sourcing-hold.browser, spec-emit, hash-id-slot, execution-refill, press-focus.browser, execution-browser, slow-submit.browser, unasked-word, read-mint, mask-published-marker, control-args-unslotted, retried-submit, restored-field, read-mint.browser, minted-fill, carry-choice, carry-reopen, app-minted-url, r84/r85/r86/r87-erpnext, report-asks, step-verdict-asks, execution-lifecycle, assert-record, assert-replay, assert-spec, assert-e2e.browser, cli-acceptance, shape-gate, observation.browser, replay-linknav, execution-expect, execution-linknav, execution-source, rebuild, execution-parity.
Per-file results:
- facts-stage4-corpus: 23 passed, 0 failed
- facts-stage3-corpus: 18 passed, 0 failed
- facts-stage2-corpus: 21 passed, 0 failed
- facts-stage1-corpus: 17 passed, 0 failed
- facts-value: 47 passed, 0 failed
- facts: 33 passed, 0 failed
- ledger: 58 passed, 0 failed
- sourcing: 17 passed, 0 failed
- quoted-literal: 11 passed, 0 failed
- commentary-report: 6 passed, 0 failed
- replay-heal-guard: 9 passed, 0 failed
- compile-typed-prefix: 2 passed, 0 failed
- credential-facts: 4 passed, 0 failed
- sourcing-hold.browser: 7 passed, 0 failed
- spec-emit: 167 passed, 0 failed
- hash-id-slot: 4 passed, 0 failed
- execution-refill: 14 passed, 0 failed
- press-focus.browser: 2 passed, 0 failed
- execution-browser: 25 passed, 0 failed
- slow-submit.browser: 1 passed, 0 failed
- unasked-word: 11 passed, 0 failed
- read-mint: 3 passed, 0 failed
- mask-published-marker: 3 passed, 0 failed
- control-args-unslotted: 3 passed, 0 failed
- retried-submit: 9 passed, 0 failed
- restored-field: 8 passed, 0 failed
- read-mint.browser: 1 passed, 0 failed
- minted-fill: 4 passed, 0 failed
- carry-choice: 8 passed, 0 failed
- carry-reopen: 8 passed, 0 failed
- app-minted-url: 14 passed, 0 failed
- r84-erpnext: 10 passed, 0 failed
- r85-erpnext: 19 passed, 0 failed
- r86-erpnext: 19 passed, 0 failed
- r87-erpnext: 21 passed, 0 failed
- report-asks: 12 passed, 0 failed
- step-verdict-asks: 3 passed, 0 failed
- execution-lifecycle: 34 passed, 0 failed
- assert-record: 21 passed, 0 failed
- assert-replay: 32 passed, 0 failed
- assert-spec: 34 passed, 0 failed
- assert-e2e.browser: 9 passed, 1 failed
- cli-acceptance: 11 passed, 0 failed
- shape-gate: 26 passed, 0 failed
- observation.browser: 5 passed, 0 failed
- replay-linknav: 7 passed, 0 failed
- execution-expect: 48 passed, 0 failed
- execution-linknav: 14 passed, 0 failed
- execution-source: 7 passed, 0 failed
- rebuild: 9 passed, 0 failed
- execution-parity: 210 passed (parity run)

## d/e. corpus-check
rows: 411 (baseline 411); status changed: 0; new runids: 0; dropped: 0. No compiled -> refused, no refused -> compiled.
corpus-check's own movement (INFORMATIONAL only, vs each branch's old compile log): newly-refusing 5 (fwrd50, fwod52, fwgr47, fwkb8, fwkb15), fixed 6 (fwrd55, fwod48, fwod57, fwgr64, fwkb45, fwgh4).

## f. facts-report (exit 0)
```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

## Overall: PASS
(a-c: 0 failures after the single permitted retry of one browser test; e: no status change.)
