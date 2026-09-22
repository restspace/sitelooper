# Verify report: round48b

**Commit:** `27c9c616` (branch `fix/round48`)

## a. Main suite — `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  106 passed | 12 skipped (118)
     Tests  2186 passed | 301 skipped (2487)
```

0 failing tests.

## b. Browser suite — `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  117 passed | 1 skipped (118)
     Tests  2365 passed | 122 skipped (2487)
```

0 failing tests.

## c. Parity suite — `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  122 passed (122)
```

0 failing tests.

## d. Corpus check — `APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Row count: **272**
- Compile rate: 72.3% (183/253 scorable) — compiled 183, refused 71, crashed 0
- 18 incomplete (no flow or no store), 1 known-unfixable (reported, not scored)

## e. Comparison vs `bench/corpus-snapshots/r47-a47c8e5e.json` (keyed by `runid`, field `status`)

- Rows in r47 snapshot: 268
- Rows in this run: 272
- **Runids with a changed status: 0**
- **New runids (not present in r47): 4** — all `compiled`

| runid | status |
| --- | --- |
| fwgh9 | compiled |
| fwgt6 | compiled |
| fwod79 | compiled |
| fwrd83 | compiled |

No runid present in both snapshots changed status. No runid went from compiled to refused/error. No runid from r47 is missing in this run.

New snapshot copied to `bench/corpus-snapshots/r48b-27c9c616.json`.

## Overall: **PASS**

a–c have 0 failures; no runid in (e) went from compiled to refused/error.
