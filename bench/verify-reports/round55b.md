# Verify round55b

Commit: `42122950` (bench: verify-round55b prompt (rerun after the rebuild-flow fix))

## a. Main suite (`npx vitest run --pool=forks --poolOptions.forks.maxForks=4`)

```
Test Files  115 passed | 12 skipped (127)
     Tests  2285 passed | 315 skipped (2600)
```

No failures.

## b. Browser suite (`BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  126 passed | 1 skipped (127)
     Tests  2469 passed | 131 skipped (2600)
```

No failures.

## c. Parity suite (`BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  1 passed (1)
     Tests  131 passed (131)
```

No failures.

## d/e. Corpus check

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`
compiled every published `results/*` branch: 286 branches total, 18 incomplete (no flow or no
store), 1 known-unfixable (`fwod56`, reported, not scored), 267 scorable — 196 compiled, 71
refused, 0 crashed (73.4% compile rate).

Comparison of `/tmp/v/corpus.json` against `bench/corpus-snapshots/r53-c923af62.json`, keyed by
`runid`, field `status`:

- Old row count: 276
- New row count: 286
- **Status changed: 0**
- **New runids: 10**
  - `fwrd87`: status `compiled`
  - `fwod81`: status `compiled`
  - `fwgr68`: status `compiled`
  - `fwkb39`: status `compiled`
  - `fwop10`: status `compiled`
  - `fwgt7`: status `compiled`
  - `fwvk7`: status `compiled`
  - `fwec8`: status `compiled`
  - `fwsi7`: status `compiled`
  - `fwgh10`: status `compiled`
- Missing runids (present in r53, absent now): 0

No runid regressed from `compiled` to `refused`/`error` against the r53 baseline. All 10 new
rows reflect branches published since the r53 baseline, and all 10 compile cleanly.

(For reference, corpus-check.mjs's own "movement against the branch's own compile log" — a
different comparison, against each branch's *own* recorded compile log rather than the r53
snapshot — reported 5 fixed and 5 newly-refusing among branches that carry that per-branch
history. That metric is informational only; it is not the r53-snapshot diff this report scores
against, and none of those runids' status changes are visible in the runid/status diff above.)

## Overall: PASS

a-c: 0 failures across all three suites. d/e: 0 status changes and no runid moved from
compiled to refused/error against the r53 baseline.
