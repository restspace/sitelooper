# Verify report: hold-verdict-prose

**Commit:** `6e44dc7d370a63b3932a6fc3b4bd79854678a52c` (`fix/hold-verdict-prose`)
sourcing hold: a verdict with commentary is a verdict, not a value to source (fwrd94 07-set errors_shown)

**Chromium revision used:** 1228 (`/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`, via `SITELOOPER_EXECUTABLE`). The box's default `chromium` symlink under `/opt/pw-browsers` still points at the older 1194 revision, so it was bypassed explicitly for the browser and parity suites.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  163 passed | 23 skipped (186)
     Tests  2665 passed | 432 skipped (3097)
```

No failing tests.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  184 passed | 2 skipped (186)
     Tests  2892 passed | 205 skipped (3097)
```

No failing tests.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failing tests.

## d. `bench/corpus-check.mjs`

- Row count: 368
- Compile rate: 77.1% (269/349 scorable) — compiled 269, refused 81, crashed 0
- Movement against each branch's own compile log: fixed 5, still-refusing 32, newly-refusing 5, unchanged-ok 232, no-record 76 (this is the tool's internal historical comparison, not the baseline diff in step e)

## e. Comparison against baseline `results/verify-round63-5iu88l` (`bench/corpus-snapshots/r63-8212f830.json`)

- Baseline row count: 351
- This run's row count: 368
- Runids with a changed `status` (old -> new): **0**
- New runids (present now, absent from baseline) — 17, all newly-recorded branches, not status changes:
  fwrd93, fwrd94, fwod89, fwod90, fwgr76, fwkb45, fwop18, fwop19, fwgt15, fwgt16, fwvk15, fwec15, fwec16, fwsi15, fwsi16, fwgh18, fwgh19

Full snapshot copied to `bench/corpus-snapshots/hvp-6e44dc7d.json`.

## Overall: PASS

Suites a-c: 0 failures. Corpus check e: 0 runid status changes against the baseline.
