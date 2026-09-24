# Round 59c verify

Commit: `9454ff01` (branch `fix/round59`, "bench: verify-round59c prompt (echo fixes restored)")

Chromium: revision 1228 (Chrome for Testing 149.0.7827.55), installed via
`npx playwright install --with-deps chromium` under `/opt/pw-browsers`
(the box already had chromium-1194; tests ran against 1228, confirmed by
`ls /opt/pw-browsers` and no `SITELOOPER_EXECUTABLE` override needed since
the default Playwright channel resolution picked up the matching 1228 build).

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  131 passed | 14 skipped (145)
     Tests  2399 passed | 347 skipped (2746)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  144 passed | 1 skipped (145)
     Tests  2591 passed | 155 skipped (2746)
```

0 failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  155 passed (155)
```

0 failures.

## d/e. `bench/corpus-check.mjs` vs `bench/corpus-snapshots/r59-6cf84c15.json`

Note: `bench/corpus-snapshots/r59-6cf84c15.json` is not present on `fix/round59`
or `main` — it only exists on `results/verify-round59-pk50z8`. It was read
from that branch (`git show origin/results/verify-round59-pk50z8:bench/corpus-snapshots/r59-6cf84c15.json`)
for this comparison only; it was not added to this branch.

- Row count (new, `/tmp/v/corpus.json`): 326 (baseline: 316 rows)
- Overall compile rate: 75.9% (233/307 scorable; 233 compiled, 75 refused, 0 crashed)
- Runids present in both with a changed `status`: **0**
- Runids new in this run (not present in the baseline): **10**, all `compiled`:
  - fwrd91, fwod85, fwgr72, fwkb43, fwop14, fwgt11, fwvk11, fwec12, fwsi11, fwgh14
- Runids present in the baseline but missing from this run: 0

The corpus-check tool's own "movement against the branch's own compile log"
section (a separate, per-branch comparison against each branch's earlier
compile log, not the round59 snapshot) reports: fixed 5, still-refusing 26,
newly-refusing 5, unchanged-ok 196, no-record 76. The 5 "newly-refusing"
entries there (fwrd50, fwod52, fwgr47, fwkb8, fwkb15) are pre-existing,
already reported in earlier verify rounds against each branch's own log —
none of them appear as a status change against the r59-6cf84c15.json
snapshot itself (see above: 0 changed).

Snapshot of this run saved to `bench/corpus-snapshots/r59c-9454ff01.json`.

## Overall: PASS

a, b, c all show 0 failures. In d/e, no runid moved from `compiled` to
`refused`/`error` relative to `bench/corpus-snapshots/r59-6cf84c15.json`
(0 changed statuses; the 10 new runids all compiled).
