# Verify report: fix/phaseAB

- **Commit:** `1146f81c` — "bench: verify-phaseAB prompt (baseline r60-cb5caf27)"
- **Chromium revision:** 1228 (Chrome for Testing 149.0.7827.55), via `SITELOOPER_EXECUTABLE=/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`. The box's default `/opt/pw-browsers/chromium` symlink still points at chromium-1194 and was not used.

## a. Main suite (`npx vitest run --pool=forks --poolOptions.forks.maxForks=4`)

```
Test Files  142 passed | 16 skipped (158)
     Tests  2495 passed | 368 skipped (2863)
```

0 failures.

## b. Browser suite (`BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  157 passed | 1 skipped (158)
     Tests  2692 passed | 171 skipped (2863)
```

0 failures.

## c. Execution parity (`BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  1 passed (1)
     Tests  171 passed (171)
```

0 failures. This includes the "both runners bound a navigation that never completes" case that failed on chromium-1194 during the round-56c run; it passed here under chromium-1228.

## d. Corpus compile (`bench/corpus-check.mjs`)

- **Row count:** 326
- **Rows changed vs. baseline:** 0

## e. Diff vs. baseline (`results/verify-round60-dlpfzr:bench/corpus-snapshots/r60-cb5caf27.json`)

Compared `/tmp/v/corpus.json` (326 rows) against the round-60 baseline (326 rows), keyed by `runid`, field `status`:

- Changed status: **none**
- New runids (present in this run, absent from baseline): **none**
- Runids present in baseline but missing from this run: **none**

Every row's `status` in this run matches the round-60 baseline exactly. (The corpus-check tool's own internal `movement` field, computed against the mutation log's original recording state rather than the round-60 baseline, separately reports 5 `newly-refusing` and 5 `fixed` rows — that comparison is orthogonal to the baseline diff this report is scored on and is unchanged from the baseline run, so it does not affect the PASS/FAIL verdict below.)

## Overall: **PASS**

a–c: 0 failures. d/e: no runid moved from `compiled` to `refused`/`error` relative to the round-60 baseline (0 status changes of any kind).

Snapshot copied to `bench/corpus-snapshots/rAB-1146f81c.json`.
