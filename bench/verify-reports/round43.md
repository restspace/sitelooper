# Round 43 cloud verification

Commit: `4fa1125c` (round 43 (pending cloud verification): fixes from round 42)

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  102 passed | 11 skipped (113)
     Tests  2119 passed | 282 skipped (2401)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  112 passed | 1 skipped (113)
     Tests  2291 passed | 110 skipped (2401)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  110 passed (110)
```

No failures.

## d/e. Corpus check vs `bench/corpus-snapshots/r41-bf26abd5.json`

- Row count: old 251, new 256 (`/tmp/v/corpus.json`, keyed by `runid`).
- Number of `status` changes on runids present in both snapshots: **0**.
- New runids in this run, not present in r41: 5, all `compiled`:
  - `fwop7` — compiled
  - `fwgt4` — compiled
  - `fwvk5` — compiled
  - `fwec5` — compiled
  - `fwgh7` — compiled
- Removed runids (present in r41, absent now): 0.

No runid regressed from `compiled` to `refused`/`error`, and no runid's status changed at all.

(Note: the corpus-check tool's own built-in "movement against the branch's own compile log" section — 5 fixed / 5 newly-refusing / 21 still-refusing — compares each branch against a stamp baked into that branch's own log, not against the r41 snapshot. It is not the comparison asked for here; the r41-vs-r43 `runid`/`status` diff above is computed directly from the two JSON files.)

## Overall: **PASS**

a–c have 0 failures, and in the d/e comparison no runid moved from `compiled` to `refused`/`error` against `bench/corpus-snapshots/r41-bf26abd5.json`.
