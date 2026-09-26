# Verify report: feat/site-facts-3

**Commit:** `e5c1206f` — "site facts stage 3: value class facts decide the ledger's kind, the export's strip, the sourcing hold, the task constants and the credential scrub; a healed candidate must carry what the recorded one carried; a dropped slot's literal is re-slotted"

**Chromium revision used:** 1228 (`/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`, confirmed via `chromium.executablePath()`). The box also had a stale `chromium-1194` under `/opt/pw-browsers`; `npx playwright install --with-deps chromium` installed 1228 and Playwright resolved to it by default — `SITELOOPER_EXECUTABLE` override was not needed.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  179 passed | 23 skipped (202)
      Tests  2950 passed | 434 skipped (3384)
```

0 failures. No failing tests to report.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  200 passed | 2 skipped (202)
      Tests  3179 passed | 205 skipped (3384)
```

0 failures. Named files, all passed (execution-parity.test.ts is skipped here by design — it runs separately under `BP_PARITY_TESTS=1` in step c):

| test file | result |
| --- | --- |
| test/facts-stage3-corpus.test.ts | ✓ 18 tests passed |
| test/facts-stage2-corpus.test.ts | ✓ 21 tests passed |
| test/facts-stage1-corpus.test.ts | ✓ 17 tests passed |
| test/ledger.test.ts | ✓ 56 tests passed |
| test/sourcing.test.ts | ✓ 13 tests passed |
| test/replay-heal-guard.test.ts | ✓ 9 tests passed |
| test/compile-typed-prefix.test.ts | ✓ 2 tests passed |
| test/credential-facts.test.ts | ✓ 4 tests passed |
| test/sourcing-hold.browser.test.ts | ✓ 7 tests passed |
| test/spec-emit.test.ts | ✓ 166 tests passed |
| test/execution-parity.test.ts | ↓ 204 tests skipped (runs in step c) |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
```

0 failures. No failing tests to report.

## d. `bench/corpus-check.mjs`

- 383 branches; 18 incomplete (no flow or no store); 1 known-unfixable (reported, not scored).
- Compile rate 77.7% (283/364 scorable) — compiled 283, refused 82, crashed 0.
- The tool's own internal "movement" comparison (against each branch's own historical compile-log record, not the sf1 baseline) reported 5 "newly-refusing" and 5 "fixed" branches. Cross-checked against the sf1 baseline (see e. below): all 5 "newly-refusing" runids (fwrd50, fwod52, fwgr47, fwkb8, fwkb15) were **already `refused` in the sf1 snapshot**, so none of them represent a regression introduced on this branch.
- `bench/results-published/fwod26-skills` carries no `site-facts.json`, matching the expectation that no published store does.

Full corpus-check log copied to `bench/corpus-snapshots/sf3-e5c1206f.json`.

## e. Diff against baseline (`results/verify-site-facts-1-bbjdrb:bench/corpus-snapshots/sf1-2aa5e726.json`)

- Baseline rows: 378. Current rows: 383.
- **Changed status (old → new): 0.** No runid changed status between the sf1 baseline and this run.
- **New runids (5), all `compiled`:**

| runid | status |
| --- | --- |
| fwod94 | compiled |
| fwgr79 | compiled |
| fwop22 | compiled |
| fwgt20 | compiled |
| fwsi19 | compiled |

- No runids present in the baseline are missing from the current run.
- No runid went `compiled → refused`. (The 5 runids the tool's own internal log flagged as "newly-refusing" were confirmed `refused` in the sf1 baseline too — see d. above — so this is not a status change relative to the baseline.)

## f. `bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code: 0. Matches expectation (a store with no site-facts.json: 0 facts, 0 rows, applied 0, exit 0).

## Overall verdict: **PASS**

- a–c: 0 failures across all three vitest runs.
- e: no runid went `compiled → refused` against the sf1 baseline (0 status changes total; only 5 new runids, all `compiled`).
- f: matched exactly.
