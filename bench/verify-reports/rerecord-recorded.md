# verify: fix/rerecord-recorded

Commit: `b5e7f28d` — rerecord: the re-recorded step keeps the values its run reported; converge.mjs parses the artifact's failing step and repairs in place

Chromium revision run: **1228** (Chrome for Testing 149.0.7827.55), installed fresh under `/opt/pw-browsers/chromium-1228` via `npx playwright install --with-deps chromium` (the box previously only had chromium-1194).

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  163 passed | 23 skipped (186)
     Tests  2665 passed | 431 skipped (3096)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  184 passed | 2 skipped (186)
     Tests  2891 passed | 205 skipped (3096)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failures.

## d. `node bench/corpus-check.mjs`

Row count: **366** (vs. 351 in the round63 baseline). 21 incomplete (no flow or no store), 1 known-unfixable, 344 scorable, 267 compiled / 78 refused / 0 crashed (compile rate 77.6%).

## e. Comparison against baseline `results/verify-round63-5iu88l:bench/corpus-snapshots/r63-8212f830.json`

Compared by `runid`, field `status`.

**2 status changes:**

| runid | old status | new status |
| --- | --- | --- |
| fwod88 | refused | incomplete (reason: "no flow") |
| fwgr74 | refused | incomplete (reason: "no flow") |

Both are not compile-outcome regressions from this branch's rerecord/converge changes: the branch the corpus-check script now resolves for each runid changed underneath it — `results/fwod88` → `results/fwod88-cv`, and `results/fwgr74-9uxyfn` → `results/fwgr74-9uxyfn`/`results/fwgr74-cv` — and the newer `-cv` branch it now picks up has no flow published on it, so the branch is scored `incomplete` instead of being compiled/refused. This reflects other results branches published into the repo since round63 (the convergence-experiment branches from `bench/converge.mjs`), not a code change in this rerecord PR.

**15 new runids** (not present in the baseline, all newly appeared results branches, no prior status to compare): fwrd93, fwod89, fwgr76, fwkb45, fwop18, fwop19, fwgt15, fwgt16, fwvk15, fwec15, fwec16, fwsi15, fwsi16, fwgh18, fwgh19.

**0 runids removed** (every baseline runid is still present in the current corpus).

## Overall: FAIL

a–c have 0 failures, but e shows 2 runids (fwod88, fwgr74) whose `status` changed between the baseline and this run, which fails the stated pass condition ("no runid in e changed status"). Per the rules given, this is reported as-is; no retry or fix was attempted beyond the one corpus-check run already performed.
