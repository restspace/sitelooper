# Verify report: site-facts-1

**Branch:** `feat/site-facts-1`
**Commit:** `2aa5e726` — site facts stage 1: URL route facts decide, in both runners (re-pins, goto landings, precondition gates, ledger admissions), and reliable state/anchor facts rewrite stored url patterns

**Chromium revision used:** 1228 (`/opt/pw-browsers/chromium-1228`, Chrome for Testing 149.0.7827.55), installed via `npx playwright install --with-deps chromium`.

## Overall: PASS

a–c had 0 failures, and no runid in the corpus comparison (e) changed status.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  173 passed | 23 skipped (196)
     Tests  2846 passed | 432 skipped (3278)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  194 passed | 2 skipped (196)
     Tests  3073 passed | 205 skipped (3278)
```

No failures. Named tests, all passed:

- `test/facts-stage1-corpus.test.ts` — 17 tests passed
- `test/facts-route.test.ts` — 28 tests passed
- `test/facts-rewrite.test.ts` — 12 tests passed
- `test/facts-url.test.ts` — 15 tests passed
- `test/ledger.test.ts` — 51 tests passed
- `test/repin-round57.test.ts` — 9 tests passed
- `test/execution-gates.test.ts` — 85 tests passed
- `test/spec-emit.test.ts` — 165 tests passed
- `test/execution-parity.test.ts` — 204 tests skipped in this run (gated behind `BP_PARITY_TESTS`; see check c)

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failures.

## d/e. Corpus check vs. baseline

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` (compile rate 77.4%, 278/359 scorable, 0 crashed — expected, since this branch is stage 1 of site facts and no published store yet carries a `site-facts.json`, so every decision falls back to today's rule).

- Row count (current): **378**
- Row count (baseline `results/verify-commentary-report-2lq8aw:bench/corpus-snapshots/cr-36fa5f7c.json`): 377
- Number of runids with a changed `status`: **0**
- New runids (present in current, absent from baseline): **1**
  - `fwgt19` — status `compiled`
- Runids removed (present in baseline, absent from current): 0

No runid's `status` changed between baseline and this branch — matches the expectation that with no published store carrying `site-facts.json`, every decision falls back to today's rule and the corpus shows 0 status changes.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code 0. Matches expectation: a store with no `site-facts.json` reports 0 facts, 0 rows, 0 applied.

## Corpus snapshot

Copied to `bench/corpus-snapshots/sf1-2aa5e726.json`.
