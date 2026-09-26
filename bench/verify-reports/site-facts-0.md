# Verify: site-facts-0

**Commit:** `41b794a7ba84a69d118e5c9f9a4de846eef1e100` (`41b794a7`)
> bench: round 66 control batch complete: 2/5 green (op, od), si and gr compiled and passed with daemon-replay fallbacks, gt refused on the label picker (unsourced-ref)

`test/facts-url.test.ts` present: confirmed (`test -f` succeeded before build).

**Chromium revision used:** 1228 (Chrome for Testing 149.0.7827.55). The box shipped `chromium-1194` under `/opt/pw-browsers` with the generic `chromium` symlink pointing at it; `npx playwright install --with-deps chromium` installed `chromium-1228` and `chromium_headless_shell-1228` alongside it. Browser test run (b) was launched with `SITELOOPER_EXECUTABLE=/opt/pw-browsers/chromium-1228/chrome-linux64/chrome` set explicitly to guarantee 1228 (never 1194); process inspection during the run confirmed `chrome-linux64/chrome` binaries under `chromium-1228` were the ones launched.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  169 passed | 23 skipped (192)
      Tests  2773 passed | 432 skipped (3205)
   Start at  08:36:08
   Duration  71.66s (transform 8.61s, setup 0ms, collect 74.55s, tests 141.63s, environment 41ms, prepare 18.78s)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  190 passed | 2 skipped (192)
      Tests  3000 passed | 205 skipped (3205)
   Start at  08:37:27
   Duration  551.40s (transform 4.63s, setup 0ms, collect 47.43s, tests 455.98s, environment 36ms, prepare 11.77s)
```

0 failures. The 8 named tests, by name and result (all passed):

| test file | tests | result |
| --- | ---: | --- |
| `test/facts-url.test.ts` | 15 | ✓ passed |
| `test/facts-format.test.ts` | 17 | ✓ passed |
| `test/facts-value.test.ts` | 22 | ✓ passed |
| `test/facts-snapshot.test.ts` | 10 | ✓ passed |
| `test/readback.test.ts` | 29 | ✓ passed |
| `test/repin-round57.test.ts` | 8 | ✓ passed |
| `test/recorder-evidence.browser.test.ts` | 2 | ✓ passed |
| `test/sourcing-hold.browser.test.ts` | 6 | ✓ passed |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
   Start at  08:46:52
   Duration  1770.81s (transform 23.62s, setup 0ms, collect 2.85s, tests 1767.01s, environment 0ms, prepare 62ms)
```

0 failures.

## d/e. Corpus check vs baseline (`results/verify-repin-route-query` / `rrq-67e35381.json`)

`bench/corpus-check.mjs` output (`/tmp/v/corpus.json`, copied to `bench/corpus-snapshots/sf0-41b794a7.json`):

- 373 branches; 18 incomplete (no flow or no store); 1 known-unfixable (reported, not scored).
- Compile rate 77.1% (273/354 scorable) — compiled 273, refused 82, crashed 0.
- Movement against each branch's own compile log: fixed 5, still-refusing 33, newly-refusing 5, unchanged-ok 236, no-record 76.

**Row count:** current 373 rows vs baseline 368 rows.

**Number of runids with a changed `status` (keyed by runid, field `status`):** **0**.

**New runids** (present in current corpus, absent from the baseline snapshot) — 5:

| runid | status |
| --- | --- |
| fwod91 | compiled |
| fwgr77 | compiled |
| fwop20 | compiled |
| fwgt17 | refused |
| fwsi17 | compiled |

No runid present in both snapshots changed `status`. No runid present in the baseline is missing from the current corpus.

This branch is stage 0 of site facts (observers and shadow rows only, no decision changes), consistent with the corpus showing 0 status changes.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s)
```

Exit code: 0. Matches expectation: a store with no `site-facts.json` prints 0 facts, 0 rows, exit 0.

## g. `grep -c 'siteFactsAt' src/execution/facts.ts dist/spec/execution-source.js`; `grep -n "'facts'" src/spec/runtime-source.ts`

```
src/execution/facts.ts:0
```

(`dist/spec/execution-source.js` does not exist in this build — the build's `copy-execution-source.mjs` step copies raw `.ts` sources into `dist/execution/source/*.ts`, not a bundled `dist/spec/execution-source.js`; grep's stderr for the missing path was suppressed by `2>/dev/null` as instructed, so only one count line was produced. `siteFactsAt` itself is emitted by `src/spec/emit.ts`, not read from `src/execution/facts.ts` or the missing dist path.)

```
15:export const EXECUTION_MODULES = ['text', 'url', 'facts', 'gates', 'observe', 'browser', 'action', 'lifecycle', 'loop', 'snapshot', 'expect', 'point', 'resolve', 'recipes', 'fingerprint', 'echo', 'recover', 'context', 'refill', 'toggle', 'positional', 'report', 'totp'] as const;
```

`'facts'` is listed among `EXECUTION_MODULES` in `src/spec/runtime-source.ts:15`, confirming the facts module is registered as one of the embedded runtime modules.

## Overall: PASS

a–c: 0 failures across 2773 + 3000 (browser run superset) + 204 tests. d/e: corpus recompiled cleanly with 0 runid status changes against the baseline (5 new runids only, all consistent with stage-0 observer/shadow behavior). f/g outputs as expected/reported verbatim.
