# verify: fix/repin-whole

Commit: `d3b9a5b0` (a full replay the model drove past compiles the whole recording, and the re-pin falls back to it; leading counters in a named control are masked in expectations (fwop15-cv, fwod88-cv3))

Chromium: revision 1228, confirmed installed at `/opt/pw-browsers/chromium-1228` (`npx playwright install --with-deps chromium` reported it already satisfied); all browser and parity tests ran and passed against it.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  163 passed | 23 skipped (186)
      Tests  2671 passed | 432 skipped (3103)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  184 passed | 2 skipped (186)
      Tests  2898 passed | 205 skipped (3103)
```

0 failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
```

0 failures.

## d/e. Corpus check vs. baseline

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Current corpus (`bench/corpus-snapshots/rpw-d3b9a5b0.json`): 368 rows.
- Baseline (`results/verify-round63-5iu88l:bench/corpus-snapshots/r63-8212f830.json`): 351 rows.
- Rows with a status change (old -> new), keyed by `runid`: **0**.
- New runids (present in current, absent from baseline) — these are the newer `-cv`/results branches added since the baseline was taken, not status changes: **17**
  - fwrd93: compiled
  - fwrd94: compiled
  - fwod89: compiled
  - fwod90: refused
  - fwgr76: compiled
  - fwkb45: refused
  - fwop18: compiled
  - fwop19: compiled
  - fwgt15: compiled
  - fwgt16: compiled
  - fwvk15: compiled
  - fwec15: compiled
  - fwec16: compiled
  - fwsi15: compiled
  - fwsi16: refused
  - fwgh18: compiled
  - fwgh19: compiled
- Runids present in baseline but absent from current: 0.

(Note: `corpus-check.mjs`'s own log separately reports "movement against the branch's own compile log" — 5 fixed / 5 newly-refusing / 32 still-refusing / 232 unchanged-ok / 76 no-record — but that is the tool's internal comparison against each branch's own recorded compile-time log, not the runid/status diff against the round-63 baseline requested here. That diff, above, shows 0 status changes.)

## Overall: PASS

a-c: 0 failures across 163+184+1 = all passing test files. d/e: 0 runid status changes against the round-63 baseline (17 new runids from newer results branches, as expected and called out in the task note).
