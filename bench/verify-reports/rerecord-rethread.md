# Verify: fix/rerecord-rethread

Commit: `a92b81ce` — "rerecord retires the chain it replaces; the driver tells a re-record which outputs to read (fwod88-cv2)"

Chromium revision actually run: **1228** (installed fresh via `npx playwright install --with-deps chromium`; box previously shipped 1194 under `/opt/pw-browsers`, left in place alongside 1228).

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

**Test Files** 163 passed | 23 skipped (186)
**Tests** 2668 passed | 432 skipped (3100)

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

**Test Files** 184 passed | 2 skipped (186)
**Tests** 2895 passed | 205 skipped (3100)

No failures. (Note: fwod88/fwgr74 did **not** show as "no flow" — the box has the corpus commit the prompt was worried about, and both compiled/ran as normal "refused" rows in the corpus check below, not as missing-flow gaps.)

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

**Test Files** 1 passed (1)
**Tests** 204 passed (204)

No failures.

## d/e. Corpus check vs. baseline (r63)

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Rows in this run's corpus.json: **368** (368 branches; 18 incomplete — no flow or no store; 1 known-unfixable, reported but not scored)
- Compile rate: 77.1% (269/349 scorable)

Baseline: `origin/results/verify-round63-5iu88l:bench/corpus-snapshots/r63-8212f830.json` — **351** rows.

Comparison keyed by `runid`, field `status`:

- **Status changes: 0.** Every runid present in both the baseline and this run's corpus has the identical `status`.
- **New runids: 17** (published since the r63 baseline snapshot was taken — not part of this branch's diff):

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

- Runids removed (present in baseline, absent from this run): 0

Corpus snapshot copied to `bench/corpus-snapshots/rrt-a92b81ce.json`.

## Overall: PASS

a-c: 0 failures across 3067 executed tests (2668 + 2895 + 204, minus overlap not applicable — each suite run independently), 0 skipped-that-should-run. d/e: 0 runid status changes against the r63 baseline; the 17 new runids are additions from branches published after that baseline, not regressions from this branch's change.
