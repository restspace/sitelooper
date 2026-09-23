# Verify round50

Commit: `5ded1631` (bench: verify-round50 prompt (baseline r49)) on branch `fix/round50`

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  106 passed | 12 skipped (118)
     Tests  2195 passed | 301 skipped (2496)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  117 passed | 1 skipped (118)
     Tests  2374 passed | 122 skipped (2496)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  122 passed (122)
```

No failures.

## d. `bench/corpus-check.mjs`

- Row count: 275 (`rows.length` in `/tmp/v/corpus.json`)
- 275 branch(es) total; 18 incomplete (no flow or no store); 1 known-unfixable, reported but not scored
- Compile rate 72.3% (185/256 scorable) — compiled 185, refused 72, crashed 0
- Saved to `bench/corpus-snapshots/r50-5ded1631.json`

## e. Comparison of `/tmp/v/corpus.json` vs `bench/corpus-snapshots/r49-50dd9aed.json` (keyed by `runid`, field `status`)

- Row count: current 275, baseline 274
- Number of runids with a changed status: **0**
- New runids (present now, absent from baseline): **1**
  - `fwrd85` — status `compiled`

No runid changed status between the two snapshots (in particular, none went from `compiled` to `refused`/`error`).

Note: the corpus-check script's own "movement against the branch's own compile log" section (a different, per-branch-embedded baseline, not `r49-50dd9aed.json`) separately reports 5 "newly-refusing" and 5 "fixed" branches. That section is unrelated to the d/e comparison this report is scored on, which uses only `r49-50dd9aed.json` and shows zero status changes.

## Overall: PASS

a-c have 0 failures, and no runid in the e) comparison went from `compiled` to `refused`/`error`.
