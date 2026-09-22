# Verify report — round 39

Commit: `af106d1a` (branch `fix/round39`)

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  94 passed | 11 skipped (105)
     Tests  2058 passed | 278 skipped (2336)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  104 passed | 1 skipped (105)
     Tests  2229 passed | 107 skipped (2336)
```

0 failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  107 passed (107)
```

0 failures.

## d/e. Corpus check vs `bench/corpus-snapshots/r38-796eb5b.json`

`node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` — compile rate 68.6% (151/220 scorable), compiled 151, refused 70, crashed 0.

- Row count (new, `/tmp/v/corpus.json`): **239** (old snapshot: 235 rows)
- Runids with a changed `status` (old -> new): **0**
- New runids (present in new corpus.json, absent from r38 snapshot): **4**, all `compiled`:
  - `fwvk3` — compiled
  - `fwec3` — compiled
  - `fwsi3` — compiled
  - `fwgh4` — compiled
- Runids removed (present in r38, absent from new): 0

No runid went from `compiled` to `refused`/`error`; no existing runid's status changed at all. The 4 new runids (all newly-added branches from round 38/39: `fwvk3`, `fwec3`, `fwsi3`, `fwgh4`) all compile.

(Note: corpus-check.mjs also prints its own "movement against the branch's own compile log" section — 5 fixed, 5 newly-refusing, 21 still-refusing, 114 unchanged-ok, 76 no-record — which tracks each branch's *own* previously-recorded compile log, a different baseline than the r38 snapshot comparison required by this report. That section is informational only; the r38-snapshot diff above is what determines PASS/FAIL here.)

Snapshot copied to `bench/corpus-snapshots/r39-af106d1a.json`.

## Overall: PASS

a-c: 0 failures. d/e: 0 runids regressed from compiled to refused/error (0 status changes at all; only 4 new compiled rows).
