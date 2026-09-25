# Verify: repin-route-query

**Commit:** `67e35381` — a re-pin candidate's end and the next pin's start agree as the replay gate reads urls: the query string is view state unless both carry a key with different literals (fwop15-cv2: five whole recordings of 01-open refused on ?query_props alone); verify prompt; SWEEPS row

**Chromium revision:** 1228 (confirmed at `/opt/pw-browsers/chromium-1228`; box previously shipped 1194 alongside it, tests configured/run against 1228)

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  163 passed | 23 skipped (186)
     Tests  2672 passed | 432 skipped (3104)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  184 passed | 2 skipped (186)
     Tests  2899 passed | 205 skipped (3104)
```

0 failures.

- `test/repin-round57.test.ts`: **passed** (8 tests)
- `test/skills.test.ts`: **passed** (184 tests)

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

0 failures.

(No failing tests in a–c, so no error excerpts to report.)

## d. Corpus compile check (`bench/corpus-check.mjs`)

- Row count: **368**
- Compile rate: 77.1% (269/349 scorable; 269 compiled, 81 refused, 0 crashed)
- 18 incomplete (no flow or no store), 1 known-unfixable (`fwod56`, reported but not scored)

## e. Corpus diff vs baseline (`results/verify-round63-5iu88l`, `bench/corpus-snapshots/r63-8212f830.json`)

Compared keyed by `runid`, field `status`.

- Baseline row count: 351
- New row count: 368
- **Status changes for runids present in both: 0**
- New runids (not in baseline): 17 — all from apps that grew their corpus since round 63, none regressed:

| runid | status |
| --- | --- |
| fwrd93 | compiled |
| fwrd94 | compiled |
| fwod89 | compiled |
| fwod90 | refused |
| fwgr76 | compiled |
| fwkb45 | refused |
| fwop18 | compiled |
| fwop19 | compiled |
| fwgt15 | compiled |
| fwgt16 | compiled |
| fwvk15 | compiled |
| fwec15 | compiled |
| fwec16 | compiled |
| fwsi15 | compiled |
| fwsi16 | refused |
| fwgh18 | compiled |
| fwgh19 | compiled |

- Runids in baseline but missing from the new run: 0

This confirms the relaxed re-pin guard (`learn.ts pinEndsElsewhere`) — which `corpus-check` does not exercise — produced no compile-status regressions or improvements in the corpus: every runid present in both snapshots kept the same status.

(Note: the corpus-check tool also emits its own "movement against the branch's own compile log" section — 5 fixed / 5 newly-refusing / 232 unchanged-ok / 76 no-record — which is a different, per-branch self-comparison baked into the tool and is not the baseline-snapshot diff this report is scored against.)

## Overall: **PASS**

a–c: 0 failures across all three check suites. d/e: 0 status changes for any runid present in both the new corpus and the round-63 baseline; only additive new runids, no regressions.
