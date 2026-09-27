# Verify report: feat/site-facts-4

- **Commit:** `ed236ec1606c701b87ee9b59e83d5083f875e0da` (`ed236ec1`)
- **Chromium revision used:** 1228 (`/opt/pw-browsers/chromium-1228`, Chrome for Testing 149.0.7827.55). Box shipped an older `chromium-1194` under `/opt/pw-browsers`; `npx playwright install --with-deps chromium` downloaded and installed 1228 alongside it, and tests ran against 1228 without needing `SITELOOPER_EXECUTABLE`.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  182 passed | 23 skipped (205)
      Tests  3012 passed | 434 skipped (3446)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  203 passed | 2 skipped (205)
      Tests  3241 passed | 205 skipped (3446)
```

0 failures. Named files, all passing:

| file | result |
| --- | --- |
| test/facts-stage4-corpus.test.ts | ✓ 23 tests passed |
| test/facts-stage3-corpus.test.ts | ✓ 18 tests passed |
| test/facts-stage2-corpus.test.ts | ✓ 21 tests passed |
| test/facts-stage1-corpus.test.ts | ✓ 17 tests passed |
| test/facts-value.test.ts | ✓ 47 tests passed |
| test/facts.test.ts | ✓ 33 tests passed |
| test/ledger.test.ts | ✓ 58 tests passed |
| test/sourcing.test.ts | ✓ 17 tests passed |
| test/quoted-literal.test.ts | ✓ 11 tests passed |
| test/commentary-report.test.ts | ✓ 6 tests passed |
| test/replay-heal-guard.test.ts | ✓ 9 tests passed |
| test/compile-typed-prefix.test.ts | ✓ 2 tests passed |
| test/credential-facts.test.ts | ✓ 4 tests passed |
| test/sourcing-hold.browser.test.ts | ✓ 7 tests passed |
| test/spec-emit.test.ts | ✓ 166 tests passed |
| test/execution-parity.test.ts | ↓ 204 tests skipped (gated behind `BP_PARITY_TESTS`; run separately in step c) |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
```

0 failures.

## d/e. Corpus check vs. baseline (results/verify-site-facts-3-6iet8x, sf3-e5c1206f.json)

- Row count (this run): **394** (baseline: 383)
- Rows whose `status` changed for an existing `runid`: **0**
- New `runid`s (11), all newly added by this round's corpus, none are a status transition:

| runid | status |
| --- | --- |
| fwod96 | compiled |
| fwod97 | compiled |
| fwgr81 | compiled |
| fwop24 | refused (`unsourced-ref`) |
| fwop25 | compiled |
| fwop26 | compiled |
| fwgt22 | compiled |
| fwgt23 | compiled |
| fwgt24 | compiled |
| fwsi21 | compiled |
| fwsi22 | compiled |

No `runid` present in both baseline and current run changed status, and no `runid` went compiled -> refused (fwop24 is a brand-new runid, not a transition of an existing one; it is `refused` for `unsourced-ref`, unrelated to the stage-4 seed/role fact decisions — no store in this corpus yet carries a `site-facts.json` with seed/role facts, so every fact decision fell back to today's rule as expected).

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code: 0.

## Overall: PASS

a-c have 0 failures; no runid in the corpus comparison went compiled -> refused; facts-report on the no-`site-facts.json` store printed 0 facts / 0 rows / applied 0 and exited 0.
