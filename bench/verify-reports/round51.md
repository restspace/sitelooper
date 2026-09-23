# Verify round51

Commit: `a441a86e` (bench: verify-round51 prompt (baseline r50)), on branch `fix/round51`.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  108 passed | 12 skipped (120)
     Tests  2209 passed | 302 skipped (2511)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  119 passed | 1 skipped (120)
     Tests  2388 passed | 123 skipped (2511)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  123 passed (123)
```

No failures.

**Note:** a prior run on this same commit (branch `results/verify-round51-8bnb5p`, commit `6972633b`)
reported a FAIL with 1 failing test in this exact file: "both runners resolve an unpublished
control label to its recorded value when the page shows it". In this run that same test passed
cleanly (9987ms). All 123 parity tests passed with 0 failures on this run. This suggests that
test (or something in its environment/timing) is flaky rather than a deterministic failure tied
to the round51 diff — worth a closer look, but per the task rules this run is not retried further
and nothing is being fixed here.

## d/e. Corpus check

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- 275 branches; 18 incomplete (no flow or no store); 1 known-unfixable (reported, not scored).
- Compile rate 72.3% (185/256 scorable) — compiled 185, refused 72, crashed 0.
- Compared against `bench/corpus-snapshots/r50-5ded1631.json`, keyed by `runid`, field `status`:
  - Row count: 275 (old) vs 275 (new).
  - Number changed: **0**.
  - New runids: **0**.
  - No runid changed status; in particular, no runid went from `compiled` to `refused`/`error`.

(The corpus-check tool's own internal "movement against the branch's own compile log" section
separately reports 5 "newly-refusing" and 5 "fixed" branches — that comparison is against each
branch's own historical compile log, not against the r50 snapshot, and is not the comparison this
report is scored on per the task instructions.)

## Overall: **PASS**

a, b, and c have 0 failures; the d/e corpus comparison shows 0 status changes and 0 new runids
against the r50 snapshot, so no runid regressed from compiled to refused/error.
