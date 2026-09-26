# Verify: fix/quoted-literal

**Commit:** `cd348cc66812d48957ec59f8a184f6a2bb69b38a` (cd348cc6)
"bench: fwgr14 baseline on the digit-bearing variant of the quoted-literal guard (crossStepRefs 16 -> 15; instruction and params unchanged)"

**Chromium revision:** 1228 (Chrome for Testing 149.0.7827.55), installed fresh alongside the pre-existing 1194 under `/opt/pw-browsers`. Confirmed present via `ls /opt/pw-browsers` before running the browser suites; no `SITELOOPER_EXECUTABLE` override was needed (tests picked up 1228 by default).

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  180 passed | 23 skipped (203)
     Tests  2956 passed | 434 skipped (3390)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  201 passed | 2 skipped (203)
     Tests  3185 passed | 205 skipped (3390)
```

No failures. Named files:

| file | result |
| --- | --- |
| test/quoted-literal.test.ts | ✓ passed (6 tests) |
| test/commentary-report.test.ts | ✓ passed (6 tests) |
| test/flow.test.ts | ✓ passed (179 tests) |
| test/rebuild.test.ts | ✓ passed (9 tests) |
| test/recorder-evidence.test.ts | ✓ passed (13 tests) |
| test/spec-repair.test.ts | ✓ passed (131 tests) |
| test/rerecord.test.ts | ✓ passed (33 tests) |
| test/execution-parity.test.ts | ↓ skipped (204 tests skipped — requires `BP_PARITY_TESTS=1`, run separately in check c) |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failures.

## d/e. Corpus check vs. baseline

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` compiled all published `results/*` branches (389 rows, wall time 73.8s).

Baseline: `origin/results/verify-site-facts-1-bbjdrb:bench/corpus-snapshots/sf1-2aa5e726.json` (378 rows).

Comparison keyed by `runid`, field `status`:

- **Rows compared:** 378 runids present in both baseline and current corpus.
- **Status changes:** **0**
- **New runids** (present in current corpus, not in baseline — published since baseline was taken): 11
  - fwod94, fwod96, fwgr79, fwgr81, fwop22, fwop24, fwop25, fwgt20, fwgt22, fwsi19, fwsi21

No runid changed status (compiled/refused) relative to the baseline. In particular, no runid moved from `compiled` to `refused`.

(Note: the corpus-check tool's own report also tracks movement against each branch's *own* recorded compile log — separate from the baseline comparison above — showing 5 `fixed` (refused-then, compiles-now) and 5 `newly-refusing` (compiled-then, refuses-now) among branches with a compile-log record. These are internal-history deltas, not deltas against the `sf1-2aa5e726` baseline snapshot, and none of the 5 newly-refusing runids appear as a status change in the baseline diff above because none of them existed as `compiled` in the baseline snapshot to begin with.)

Snapshot copied to `bench/corpus-snapshots/ql-cd348cc6.json`.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code: 0. Matches expectation (store has no site-facts.json: 0 facts, 0 rows, applied 0, exit 0).

## Overall: **PASS**

a-c: 0 failures across all three check runs. d/e: 0 baseline status changes, no compiled→refused regressions. f: matches expected output exactly.
