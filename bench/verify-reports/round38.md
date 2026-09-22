# Round 38 cloud verification

Commit: `796eb5b` (bench: cloud verification prompt for round 38; corpus snapshot r37)

## a. Main suite — `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  93 passed | 11 skipped (104)
     Tests  2044 passed | 276 skipped (2320)
```

No failures.

## b. Browser suite — `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  103 passed | 1 skipped (104)
     Tests  2213 passed | 107 skipped (2320)
```

No failures.

## c. Execution parity — `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  107 passed (107)
```

No failures.

## d/e. Corpus check — `node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

Row count: 235 (up from 229 in r37-ebfed7d).

Comparison against `bench/corpus-snapshots/r37-ebfed7d.json`, keyed by `runid`, field `status`:

- Changed status: **0**
- New runids: **6**, all `compiled`:
  - `fwec2`: compiled
  - `fwgh2`: compiled
  - `fwgh3`: compiled
  - `fwgt2`: compiled
  - `fwsi2`: compiled
  - `fwvk2`: compiled
- Removed runids (present in r37, absent now): 0

No runid regressed from `compiled` to `refused`/`error`.

Note: the corpus-check tool's own report (comparing each branch against its own historical compile log, a different baseline than the r37 snapshot used above) separately lists 5 branches as "newly-refusing" (`fwrd50`, `fwod52`, `fwgr47`, `fwkb8`, `fwkb15`) and 4 as "fixed" (`fwrd55`, `fwod48`, `fwod57`, `fwgr64`). These are pre-existing runids whose status is unchanged between r37 and this run (see above) — the tool's own movement column reflects drift against each branch's individual recorded compile log, not the r37 snapshot, so it does not affect the PASS criterion for this report.

## Overall: PASS

a-c had 0 failures; no runid in the r37 comparison went from compiled to refused/error.
