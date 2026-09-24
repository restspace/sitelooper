# Verify round60

Commit: `cb5caf27` (bench: verify-round60 prompt (baseline r59c-9454ff01)), branch `fix/round60`.

Chromium: revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. The box's pre-existing `/opt/pw-browsers/chromium-1194` was left in place but not used — no system Chrome/Edge was installed, `src/daemon/browser.ts` falls through its channel list (`chrome`, `msedge`, `chromium`) to the bundled `chromium` channel, and `playwright-core`'s `browsers.json` (bundled with the installed `@playwright/test` 1.61.1) pins revision 1228. Confirmed directly: `chromium.launch({channel:'chromium'})` resolved to `/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`, version 149.0.7827.55. No `SITELOOPER_EXECUTABLE` override was needed or set.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  1 failed | 136 passed | 14 skipped (151)
     Tests  1 failed | 2443 passed | 358 skipped (2802)
```

Failing test:

`test/execution-resolve-emit.test.ts > the policy the artifact derives at compile time > reports positional resolution from the resolution itself into the effect gate`

```
AssertionError: expected 'export const steps = {\n  /** do the …' to contain 'positionalResolution: positional1 }, …'

- Expected
+ Received

- positionalResolution: positional1 }, linesBefore1);
+ export const steps = {
+   /** do the thing */
+   async '01-do'(page: Page, p: { v1: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {
+     // s_1: do the thing with {{v1}}
+     // recorded on a page matching http://app.test/items
+     // What this segment filled, which must still stand when the action that submits it goes (see restoreStandingFills).
+     const filled1 = standingFills();
+     // What this segment types, selects or names: a read that returns only that is an echo (see echoRead).
+     const typed1 = new Set<string>();
+
+     await preconditionGate('http://app.test/items', page.url(), p, '01-do s_1', null);
+
+     // @step 01-do s_1/1
+     let urlBefore1 = '';
+     let alertsBefore1: string[] = [];
+     let alertsAfter1: ObservedAlerts | null = null;
+     let linesBefore1: string[] | null = null;
+     let linesAfter1: string[] | null = null;
+     let positional1 = false;
+     let docBefore1: number | null = null;
+     let obs1: ActionObservation | null = null;
+     let verifying1 = false;
+     for (let attempt = 0; ; attempt++) {
+       try {
```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed | 149 passed | 1 skipped (151)
     Tests  1 failed | 2635 passed | 166 skipped (2802)
```

Same single failing test, same error as (a) — `test/execution-resolve-emit.test.ts > the policy the artifact derives at compile time > reports positional resolution from the resolution itself into the effect gate`. This is an assertion mismatch on generated source text (an `expect(body).toContain(...)` checking emitted code), not browser-version-related — the assertion runs against a string built by the emitter, independent of Chromium.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  166 passed (166)
```

No failures on Chromium 1228 — 166/166 parity cases pass, including `both runners bound a navigation that never completes, and report it`, the case that failed on chromium-1194 in the round-56c run. This confirms that round-56c's failure was a browser-version issue, not a code regression: the code under test passes the full parity suite on the pinned Chromium revision.

## d/e. Corpus check (`bench/corpus-check.mjs`) vs `bench/corpus-snapshots/r59c-9454ff01.json`

- Rows in r59c baseline: 316. Rows in round60 corpus.json: 326.
- Compared by `runid`, field `status`: **0 changed**, **10 new** runids (present in round60, absent from the r59c baseline).

New runids and their status:

| runid | status |
| --- | --- |
| fwrd91 | compiled |
| fwod85 | compiled |
| fwgr72 | compiled |
| fwkb43 | compiled |
| fwop14 | compiled |
| fwgt11 | compiled |
| fwvk11 | compiled |
| fwec12 | compiled |
| fwsi11 | compiled |
| fwgh14 | compiled |

No runid present in both the baseline and this run changed status (no compiled→refused/error transitions).

`fwrd48`-`fwrd51` (round 60 ids fix): all four stay `refused` and, as expected, all four gained the `unbound-slot` kind alongside their pre-existing `unbound-pin` kind:

| runid | status (base → now) | kinds (base → now) |
| --- | --- | --- |
| fwrd48 | refused → refused | `["unbound-pin"]` → `["unbound-pin","unbound-slot"]` |
| fwrd49 | refused → refused | `["unbound-pin"]` → `["unbound-pin","unbound-slot"]` |
| fwrd50 | refused → refused | `["unbound-pin"]` → `["unbound-pin","unbound-slot"]` |
| fwrd51 | refused → refused | `["unbound-pin"]` → `["unbound-pin","unbound-slot"]` |

The corpus-check tool's own "movement against the branch's own compile log" section separately lists 5 "newly-refusing" (`fwrd50`, `fwod52`, `fwgr47`, `fwkb8`, `fwkb15`) and 5 "fixed" (`fwrd55`, `fwod48`, `fwod57`, `fwgr64`, `fwgh4`) entries — these are computed against each branch's own historical/embedded compile record, not the r59c baseline. Cross-checked against the r59c baseline: all 5 "newly-refusing" runids are already `refused` in r59c, and all 5 "fixed" runids are already `compiled` in r59c — no discrepancy with the round60 result.

`/tmp/v/corpus.json` copied to `bench/corpus-snapshots/r60-cb5caf27.json`.

## Overall: **FAIL**

Reason: (a) and (b) each have 1 failing test (the same test in both runs, `test/execution-resolve-emit.test.ts` — an emitted-source assertion mismatch), so a-c do not have 0 failures. This failure is unrelated to Chromium version: (c), the parity suite, passes 166/166 on the pinned Chromium 1228, including the case that failed on chromium-1194 in round-56c. The corpus comparison (d/e) shows no regressions (0 changed statuses, no compiled→refused/error transitions, and the expected `unbound-slot` kind gain on fwrd48-51).
