# Verify round49

Commit: `50dd9aed1904378bad43baf86c4896a7032e8d66` (50dd9aed) — "bench: verify-round49 prompt (baseline r48b)"

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  106 passed | 12 skipped (118)
     Tests  2188 passed | 301 skipped (2489)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  117 passed | 1 skipped (118)
     Tests  2367 passed | 122 skipped (2489)
```

0 failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  122 passed (122)
```

0 failures.

## d. `APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Row count: 274

## e. Comparison of `/tmp/v/corpus.json` with `bench/corpus-snapshots/r48b-27c9c616.json` (keyed by `runid`, field `status`)

- Old row count: 272
- New row count: 274
- Number of runids with a changed status: 0
- Number of new runids: 2

Runids whose status changed (old -> new): none.

New runids:

| runid | status |
| --- | --- |
| fwrd84 | refused |
| fwod80 | compiled |

No runid transitioned from `compiled` to `refused`/`error` (the "changed" set is empty — both differences are brand-new runids with no prior status to regress from).

## Overall: PASS

Checks a-c had 0 failures. In check e, no runid went from `compiled` to `refused`/`error`; the only differences from the r48b baseline are two new runids (`fwrd84` refused, `fwod80` compiled), neither of which represents a regression of a previously-compiled entry.
