# Verify round56

Commit: `a08138d2` (bench: verify-round56 prompt (baseline r55)), branch `fix/round56`.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  1 failed | 120 passed | 13 skipped (134)
     Tests  1 failed | 2333 passed | 326 skipped (2660)
```

Failing test: `test/execution-gates.test.ts > alertVerdict > is asked over the same live-region capture the daemon takes`

```
FAIL  test/execution-gates.test.ts > alertVerdict > is asked over the same live-region capture the daemon takes
AssertionError: expected '/**\n * Observations both execution t…' not to contain 'role=alert'

- Expected
+ Received

- role=alert
+ /**
+  * Observations both execution targets take of a live page, so that a shared
+  * verdict (./gates.ts) is asked the same question in the same dialect by the
+  * daemon and by a compiled `.flow.ts` artifact. Self-contained: this module is
+  * embedded verbatim in the artifact (spec/runtime-source.ts), so nothing but
+  * a sibling shared module or a Playwright type may be imported.
+  */
+ import type { Locator, Page } from 'playwright-core';
+ import { alertsComplete, capturePage, sweepPage, type LineDialect } from './snapshot.js';
+ import { clip, extractFramed, hasTextMatcher, implicitRoles, markFrame } from './text.js';
+ import { settleDom } from './browser.js';
+
+ /** What a recorded read takes off its element. A page url read has no element and is not one of these. */
+ export type ReadWhat = 'text' | 'value' | 'attr' | 'count';
+
+ export function isElementRead(what: unknown): what is ReadWhat {
+   return what === 'text' || what === 'value' || what === 'attr' || what === 'count';
+ }
+
+ /** The part of a procedure step observedNothing looks at. */
+ export interface ObservingStep {
+   tool: string;
+   args?: Record<string, unknown>;
+   locators?: Record<string, readonly unknown[] | undefined>;

 ❯ test/execution-gates.test.ts:316:25
```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed | 132 passed | 1 skipped (134)
     Tests  1 failed | 2519 passed | 140 skipped (2660)
```

Same failing test, same error as in (a): `test/execution-gates.test.ts > alertVerdict > is asked over the same live-region capture the daemon takes` — `src/execution/observe...ts` still contains a literal `role=alert`, which the test asserts against.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  140 passed (140)
```

No failures.

## d/e. Corpus check (`bench/corpus-check.mjs`) vs `bench/corpus-snapshots/r55-42122950.json`

- Rows in r55 snapshot: 286. Rows in round56 corpus.json: 296.
- Compared by `runid`, field `status`: **0 changed**, **10 new** runids (present in round56, absent from the r55 snapshot — all newly added corpus branches, not regressions).

New runids and their status:

| runid | status |
| --- | --- |
| fwrd88 | compiled |
| fwod82 | refused |
| fwgr69 | refused |
| fwkb40 | compiled |
| fwop11 | compiled |
| fwgt8 | compiled |
| fwvk8 | compiled |
| fwec9 | compiled |
| fwsi8 | compiled |
| fwgh11 | compiled |

No runid present in both snapshots changed status (no compiled→refused/error transitions, no refused→compiled transitions either — the corpus-check tool's own "movement against the branch's own compile log" section lists 5 "fixed" and 5 "newly-refusing" entries, but those are all against each branch's own historical/embedded compile record, not the r55 snapshot; every one of those runids matches its r55-snapshot status exactly (all 5 "newly-refusing" are `refused` in both r55 and round56; all 5 "fixed" are `compiled` in both), so there is no discrepancy between the two comparisons).

## Overall: **FAIL**

Reason: (a) and (b) each have 1 failing test (the same test, `alertVerdict > is asked over the same live-region capture the daemon takes` in `test/execution-gates.test.ts`), so a-c do not have 0 failures. The corpus comparison (d/e) shows no regressions (0 changed statuses, no compiled→refused/error transitions).
