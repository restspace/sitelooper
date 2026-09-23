# Verify round53

Commit: `c923af62` (bench: verify-round53 prompt (baseline r51))

## a. Main suite (`npx vitest run --pool=forks --poolOptions.forks.maxForks=4`)

```
Test Files  109 passed | 12 skipped (121)
     Tests  2227 passed | 308 skipped (2535)
```

No failures.

## b. Browser suite (`BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  120 passed | 1 skipped (121)
     Tests  2408 passed | 127 skipped (2535)
```

No failures.

Note: the first attempt failed all browser-launch tests (19 files / 26 tests) because the
pre-installed Chromium (v1194) did not match the version this repo's `@playwright/test@^1.61.1`
pin expects (v1228) — `browserType.launch` errored with `Executable doesn't exist at
/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`. Ran `npx playwright install --with-deps
chromium` (as step 1 specifies) to fetch the matching v1228 build, then re-ran the suite clean
with the result above.

## c. Parity suite (`BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  1 passed (1)
     Tests  127 passed (127)
```

No failures.

## d/e. Corpus check

`node bench/corpus-check.mjs` compiled every published `results/*` branch: 276 branches total,
18 incomplete (no flow or no store), 1 known-unfixable (reported, not scored), 257 scorable —
186 compiled, 72 refused, 0 crashed (72.4% compile rate).

Comparison of `/tmp/v/corpus.json` against `bench/corpus-snapshots/r51-a441a86e.json`, keyed by
`runid`, field `status`:

- Old row count: 275
- New row count: 276
- **Status changed: 0**
- **New runids: 1**
  - `fwrd86`: status `compiled`
- Missing runids (present in r51, absent now): 0

No runid regressed from `compiled` to `refused`/`error`. The single new row (`fwrd86`) reflects
a branch published since the r51 baseline and compiles cleanly.

(For reference, corpus-check.mjs's own "movement against the branch's own compile log" — a
different comparison, against each branch's *own* recorded compile log rather than the r51
snapshot — reported 5 fixed and 5 newly-refusing among branches that carry that per-branch
history. That metric is informational only; it is not the r51-snapshot diff this report scores
against, and none of those runids' status changes are visible in the runid/status diff above.)

## Overall: PASS

a-c: 0 failures across all three suites. d/e: 0 status changes and no runid moved from
compiled to refused/error against the r51 baseline.
