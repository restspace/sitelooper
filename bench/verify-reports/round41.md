# Round 41 verification report

Commit: `bf26abd5` (round 41 (pending cloud verification): fixes from the round-40 confirmation sweeps), branch `fix/round41`

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  100 passed | 11 skipped (111)
      Tests  2107 passed | 281 skipped (2388)
```

No failing tests.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  110 passed | 1 skipped (111)
      Tests  2279 passed | 109 skipped (2388)
```

No failing tests.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  109 passed (109)
```

No failing tests.

## d/e. Corpus check

`node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Row count: 251
- Compared against `bench/corpus-snapshots/r39-af106d1a.json` (239 rows), keyed by `runid`, field `status`.
- Number of runids with a changed `status`: **0**
- Runids present in the new run but not in the r39 snapshot (new): **12**, all `status: compiled`:
  - fwrd81, fwod77, fwgr66, fwkb37, fwop6, fwgt3, fwvk4, fwec4, fwsi4, fwsi5, fwgh5, fwgh6
- No runid present in both snapshots changed status, and none went from `compiled` to `refused`/`error`.
- No runid from the r39 snapshot is missing from the new run.

Snapshot copied to `bench/corpus-snapshots/r41-bf26abd5.json`.

## Overall: PASS

Checks a-c report 0 failures. Check e shows no runid regressed from `compiled` to `refused`/`error`; all status changes are net-new `compiled` rows.
