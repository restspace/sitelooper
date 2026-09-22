# Verify report: round46b

Commit: `2623dbf9` (`bench: verify-round46b prompt`, on branch `fix/round46`)

This is a re-verification of `fix/round46` after `a39d1496` ("round 46
follow-ups: verification failures fixed, and `{{totp:NAME}}` one-time
codes") landed the fixes for the two test failures reported in the
prior `round46` verification (commit `dc58c297`).

## a. Main suite — `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  104 passed | 11 skipped (115)
     Tests  2156 passed | 297 skipped (2453)
```

No failures.

## b. Browser tests — `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  114 passed | 1 skipped (115)
     Tests  2332 passed | 121 skipped (2453)
```

No failures.

## c. Parity tests — `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  121 passed (121)
```

No failures.

## d/e. Corpus check — `node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Row count: 268 (previous snapshot `r43-4fa1125c.json`: 256 rows)
- Rows changed status (present in both, `status` differs): **0**
- New rows (runid not present in the r43 snapshot): 12
  - `fwrd82` → compiled
  - `fwod78` → compiled
  - `fwgr67` → compiled
  - `fwkb38` → compiled
  - `fwop8` → compiled
  - `fwop9` → compiled
  - `fwgt5` → refused
  - `fwvk6` → compiled
  - `fwec6` → compiled
  - `fwec7` → compiled
  - `fwsi6` → compiled
  - `fwgh8` → compiled
- Rows present in r43 but missing from this run: 0

No runid regressed from `compiled` to `refused`/`error`.

(Note: the corpus-check tool's own built-in "movement against the branch's
own compile log" section reports 5 fixed / 5 newly-refusing / 22
still-refusing. That compares each branch against a stamp baked into that
branch's own log, not against the `r43` snapshot, so it is not the
comparison asked for here. The diff above is computed directly from
`bench/corpus-snapshots/r43-4fa1125c.json` and `/tmp/v/corpus.json`, keyed
by `runid`/`status`.)

New corpus snapshot copied to `bench/corpus-snapshots/r46-2623dbf9.json`.

## Overall: **PASS**

a–c have 0 failures, and in the d/e comparison no runid moved from
`compiled` to `refused`/`error` against `bench/corpus-snapshots/r43-4fa1125c.json`.
