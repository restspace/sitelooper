# Verify: sourcing-held-values

**Branch:** `fix/sourcing-held-values`
**Commit:** `0009043ebd18c6f5ea8d59323a5177c63c52c13b` (`0009043e`) — "sourcing hold: the retry keeps every held value, and a labelled read answers the asked key (fwop19 04-open)"
**Chromium revision used:** 1228 (Chrome for Testing 149.0.7827.55), installed at `/opt/pw-browsers/chromium-1228` via `npx playwright install --with-deps chromium`. The box's pre-existing `chromium-1194` under `/opt/pw-browsers` was left in place and not used.

## Overall: **FAIL**

Checks a–c (unit, browser, parity) all passed with 0 failures. Check e found 2 runids whose corpus status changed between the baseline (round 63) and this branch, which fails the "0 status changes" pass criterion.

## a. Full unit suite (`npx vitest run --pool=forks --poolOptions.forks.maxForks=4`)

```
Test Files  163 passed | 23 skipped (186)
     Tests  2664 passed | 432 skipped (3096)
```

No failing tests.

## b. Browser suite (`BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  184 passed | 2 skipped (186)
     Tests  2891 passed | 205 skipped (3096)
```

No failing tests.

`test/sourcing-hold.browser.test.ts` — all 6 cases passed:
1. ✓ holds once for an asked value the page does not show that an eval returned, and publishes the retry's labelled read
2. ✓ keeps every value the held report named when the retry drops its evidence block (fwop19 04-open)
3. ✓ accepts a stubborn retry as it stands, and names a data-changing gesture after the hold
4. ✓ does not hold for a value the page shows, nor for one a read produced
5. ✓ holds nothing when the value is not asked for, or the flag is off
6. ✓ stage 3: a "head (commentary)" whose head the page shows publishes the head as a read-back, commentary in the summary

(The default reporter only printed names for cases 1 and 3 in the log; the file-level summary line confirms 6/6 passed and the source file `test/sourcing-hold.browser.test.ts` lists exactly these 6 `it(...)` cases.)

## c. Execution parity (`BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failing tests.

## d. Corpus check (`bench/corpus-check.mjs`)

- Row count: **366**
- Compiled with `commit: "0009043e"`, `wallMs: 63634` (~64s)

## e. Corpus comparison vs. baseline

Baseline: `origin/results/verify-round63-5iu88l:bench/corpus-snapshots/r63-8212f830.json` (351 rows).

- **Rows compared:** 351 baseline runids matched against 366 current runids.
- **Status changes:** **2**
  - `fwod88`: `refused` → `incomplete` (reason: "no flow"). Base branch was `results/fwod88`; current corpus fetched `results/fwod88-cv` for this runid, which has no compiled flow.
  - `fwgr74`: `refused` → `incomplete` (reason: "no flow"). Base branch was `results/fwgr74-9uxyfn`; current corpus fetched `results/fwgr74-cv` for this runid, which has no compiled flow.
- **New runids (in current, absent from baseline):** 15 — `fwrd93`, `fwod89`, `fwgr76`, `fwkb45`, `fwop18`, `fwop19`, `fwgt15`, `fwgt16`, `fwvk15`, `fwec15`, `fwec16`, `fwsi15`, `fwsi16`, `fwgh18`, `fwgh19`. All compiled or refused normally (no anomalies).
- **Removed runids (in baseline, absent from current):** 0.

Both status changes stem from a different `results/*` branch now being the latest for the same runid (a `-cv` suffixed branch superseding the base's branch), and that branch has no flow to compile at all ("no flow"), rather than a compile-outcome regression on the same recording. This branch's diff (`src/agent/sourcing.ts`) only touches sourcing/hold-retry logic and record timing per the task description, so these two changes are very unlikely to be caused by the code under test — but per the pass rule in the task ("PASS only if a-c have 0 failures and no runid in e changed status"), any status change fails the overall verdict, so this is reported as **FAIL**.

## Snapshot

Current corpus JSON copied to `bench/corpus-snapshots/hsv-0009043e.json`.
