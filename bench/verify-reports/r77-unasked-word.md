# Verify: r77-unasked-word

Commit: `1b11205e` — flow export: an unasked word the run cannot have made is not a later step's output
Branch verified: `fix/r77-unasked-word`
Chromium revision used: 1228 (`/opt/pw-browsers/chromium-1228`, resolved by default via `chromium.executablePath()` — no `SITELOOPER_EXECUTABLE` override needed)

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
 Test Files  185 passed | 25 skipped (210)
      Tests  3045 passed | 437 skipped (3482)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  208 passed | 2 skipped (210)
      Tests  3277 passed | 205 skipped (3482)
```

No failures.

Named-test status (all passed; `test/execution-parity.test.ts` is skipped in this run, covered under check c):

- test/facts-stage4-corpus.test.ts — passed (23 tests)
- test/facts-stage3-corpus.test.ts — passed (18 tests)
- test/facts-stage2-corpus.test.ts — passed (21 tests)
- test/facts-stage1-corpus.test.ts — passed (17 tests)
- test/facts-value.test.ts — passed (47 tests)
- test/facts.test.ts — passed (33 tests)
- test/ledger.test.ts — passed (58 tests)
- test/sourcing.test.ts — passed (17 tests)
- test/quoted-literal.test.ts — passed (11 tests)
- test/commentary-report.test.ts — passed (6 tests)
- test/replay-heal-guard.test.ts — passed (9 tests)
- test/compile-typed-prefix.test.ts — passed (2 tests)
- test/credential-facts.test.ts — passed (4 tests)
- test/sourcing-hold.browser.test.ts — passed (7 tests)
- test/spec-emit.test.ts — passed (166 tests)
- test/hash-id-slot.test.ts — passed (4 tests)
- test/execution-refill.test.ts — passed (14 tests)
- test/press-focus.browser.test.ts — passed (2 tests)
- test/execution-browser.test.ts — passed (25 tests)
- test/slow-submit.browser.test.ts — passed (1 test)
- test/unasked-word.test.ts — passed (11 tests)
- test/flow.test.ts — passed (179 tests)
- test/facts-thread.test.ts — passed (6 tests)
- test/rebuild.test.ts — passed (9 tests)
- test/recorder-evidence.test.ts — passed (13 tests) (+ recorder-evidence.browser.test.ts — passed, 2 tests)
- test/execution-parity.test.ts — skipped here (204 tests skipped); run separately in check c

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
 Test Files  1 passed (1)
      Tests  204 passed (204)
```

No failures. (Log lines prefixed `[sitelooper drift]` are diagnostic output from the test, not failures.)

## d/e. Corpus check vs baseline

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` against all `results/*` branches (compile-only, no app/model):

- Row count: 411 branches (18 incomplete — no flow or no store; 1 known-unfixable, reported but not scored)
- Compile rate: 79.1% (310/392 scorable) — compiled 310, refused 83, crashed 0

Compared `/tmp/v/corpus.json` to the baseline `bench/corpus-snapshots/r76s-df1ec3ec.json` (from `results/verify-r76-slow-submit-933cbr`), keyed by `runid`, field `status`:

- Baseline rows: 411, current rows: 411
- **Runids with a changed status: 0**
- **New runids: 0**
- Runids present in baseline but missing now: 0

The corpus is unchanged from baseline, as expected (published flows are already exported; the flow export is a run-time change).

### Informational only: corpus-check's own movement against each branch's OLD compile log

(Per instructions, this never decides the verdict — only the snapshot comparison above does.)

| verdict | branches |
| --- | ---: |
| fixed | 5 |
| still-refusing | 34 |
| newly-refusing | 5 |
| unchanged-ok | 273 |
| no-record | 76 |

Newly-refusing (5): fwrd50 (unbound-pin, unbound-slot), fwod52 (unsourced-ref), fwgr47 (unsourced-ref), fwkb8 (unsourced-ref), fwkb15 (unsourced-ref)

Fixed (5): fwrd55 (was: refused), fwod48 (was: refused), fwod57 (was: unfilled-slot), fwgr64 (was: unbound-pin), fwgh4 (was: unsourced-ref)

Known-unfixable, not scored: fwod56 (refused) — compile correctly refuses a genuine unpublished dependency (`{{05-open.quotation_reference}}` is never read/published by 05-open's procedure); the recording, not the refusal, is wrong.

## f. `node bench/facts-report.mjs bench/results-published/fwod26-skills`

```
== bench/results-published/fwod26-skills ==
facts: 0 across 0 origin(s)
shadow (facts.*): 0 rows, 0 disagreement(s), 0 applied
```

Exit code: 0. Matches expectation (store with no site-facts.json → 0 facts, 0 rows, applied 0, exit 0).

## Overall verdict: **PASS**

Checks a-c: 0 failures. Check e (baseline snapshot comparison, the only signal that decides the verdict): 0 runids changed from compiled to refused (and 0 new runids), so no regression. Check f matches expectation exactly.
