# Verify: hygiene-s34

**Commit:** `12c5d094` — hygiene stages 3-4: the commentary pre-pass and the sourcing hold, behind SITELOOPER_SOURCING_HOLD

**Chromium:** revision 1228 (installed to `/opt/pw-browsers/chromium-1228`, matching the `playwright-core@1.61.1` expected revision; tests ran against this revision, no `SITELOOPER_EXECUTABLE` override needed).

## a. Main suite — `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  163 passed | 23 skipped (186)
     Tests  2664 passed | 431 skipped (3095)
```

0 failures.

## b. Browser suite — `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  184 passed | 2 skipped (186)
     Tests  2890 passed | 205 skipped (3095)
```

0 failures.

`test/sourcing-hold.browser.test.ts` — 5/5 passed:
- `the sourcing hold at the loop > holds once for an asked value the page does not show that an eval returned, and publishes the retry's labelled read` — **pass**
- `the sourcing hold at the loop > accepts a stubborn retry as it stands, and names a data-changing gesture after the hold` — **pass**
- `the sourcing hold at the loop > does not hold for a value the page shows, nor for one a read produced` — **pass**
- `the sourcing hold at the loop > holds nothing when the value is not asked for, or the flag is off` — **pass**
- `the sourcing hold at the loop > stage 3: a "head (commentary)" whose head the page shows publishes the head as a read-back, commentary in the summary` — **pass**

## c. Parity suite — `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

0 failures.

## d/e. Corpus check vs. baseline (r63-8212f830)

- Current corpus (`/tmp/v/corpus.json`, commit `12c5d094`): **361 rows**
- Baseline (`r63-8212f830.json`, commit `8212f830`): **351 rows**
- Status changes (keyed by `runid`, field `status`): **0**
- New runids (present in current, absent from baseline): **10** — `fwrd93`, `fwod89`, `fwgr76`, `fwkb45`, `fwop18`, `fwgt15`, `fwvk15`, `fwec15`, `fwsi15`, `fwgh18`
- Runids removed (present in baseline, absent from current): **0**

No runid present in both snapshots changed status; the 10 new runids account for the full row-count difference (361 − 351 = 10).

## Overall: **PASS**

a-c: 0 failures across 3095 + 3095 + 204 tests (accounting for skips). e: 0 status changes, only additive new runids. This branch changes record time only, and the corpus confirms 0 status changes as expected.
