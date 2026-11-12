# fault-readiness verification

Commit: `39647391 Six fixes from the fw*-fc confirmation sweep` (branch feat/fault-readiness; marker greps all passed)
Chromium: tests ran playwright's default for this repo's @playwright/test: revision 1228 (installed to /opt/pw-browsers/chromium-1228 by `playwright install`; 1243 also present on box, not used). SITELOOPER_EXECUTABLE not set.

## Overall: FAIL
Checks a (plain suite) passed; check c (parity) and check b (browser) have failures, and every failing file in b also failed when re-run alone, so none is "contention". Corpus (d/e): no regressions.

## c. Parity (BP_PARITY_TESTS=1, test/execution-parity.test.ts, maxForks=1)
Exit code 1, wall 1039s (under the 45 min limit; not a hang).
Test Files  1 failed (1)
Tests  124 failed | 88 passed (212)

## a. Plain suite (maxForks=4)
Exit 0, wall 100s
Test Files  235 passed | 35 skipped (270)
Tests  3762 passed | 497 skipped (4259)

## b. Browser suite (BP_BROWSER_TESTS=1, maxForks=2)
Exit 1, wall 898s
Test Files  7 failed | 261 passed | 2 skipped (270)
Tests  31 failed | 4015 passed | 213 skipped (4259)

Named files:
- test/kept-read.test.ts: ✓ test/kept-read.test.ts (4 tests) 438ms
- test/saved-after.test.ts: ✓ test/saved-after.test.ts (8 tests) 135ms
- test/fill-reload-effect.test.ts: ✓ test/fill-reload-effect.test.ts (6 tests) 59ms
- test/cover-click.test.ts: ✓ test/cover-click.test.ts (6 tests) 54ms
- test/hover-rename.test.ts: ✓ test/hover-rename.test.ts (9 tests) 21ms
- test/probe-view.test.ts: ✓ test/probe-view.test.ts (8 tests) 10ms
- test/probe-retire.test.ts: ✓ test/probe-retire.test.ts (8 tests) 279ms
- test/match-specific.test.ts: ✓ test/match-specific.test.ts (7 tests) 35ms
- test/no-silent-pass.test.ts: ✓ test/no-silent-pass.test.ts (21 tests) 25122ms
- test/spec-emit.test.ts: ✓ test/spec-emit.test.ts (168 tests) 32002ms
- test/execution-expect.test.ts: ✓ test/execution-expect.test.ts (55 tests) 341ms
- test/execution-resolve-emit.test.ts: ✓ test/execution-resolve-emit.test.ts (21 tests) 4105ms
- test/r87-erpnext.test.ts: ✓ test/r87-erpnext.test.ts (21 tests) 1526ms
- test/fault-readiness.browser.test.ts: ❯ test/fault-readiness.browser.test.ts (2 tests | 2 failed) 6935ms
- test/fixup-e2e.browser.test.ts: ❯ test/fixup-e2e.browser.test.ts (6 tests | 3 failed) 14801ms
- test/assert-e2e.browser.test.ts: ❯ test/assert-e2e.browser.test.ts (10 tests | 2 failed) 159452ms
- test/execution-browser.test.ts: ✓ test/execution-browser.test.ts (25 tests) 512ms
- test/cli-acceptance.test.ts: ✓ test/cli-acceptance.test.ts (11 tests) 4210ms
- test/execution-parity.test.ts: in the parity run: 124 failed | 88 passed; in the full browser run (b) it did not run (BP_PARITY_TESTS unset, file skipped)

### Single-file re-runs (maxForks=1) of the 7 failing files
- test/assert-e2e.browser.test.ts: Test Files  1 failed (1); Tests  2 failed | 8 passed (10) -> failure (fails both times)
- test/fault-readiness.browser.test.ts: Test Files  1 failed (1); Tests  2 failed (2) -> failure (fails both times)
- test/fixup-e2e.browser.test.ts: Test Files  1 failed (1); Tests  3 failed | 3 passed (6) -> failure (fails both times)
- test/gone-records.browser.test.ts: Test Files  1 failed (1); Tests  2 failed (2) -> failure (fails both times)
- test/replay-false-pass.browser.test.ts: Test Files  1 failed (1); Tests  4 failed | 7 passed (11) -> failure (fails both times)
- test/replay.test.ts: Test Files  1 failed (1); Tests  17 failed | 47 passed (64) -> failure (fails both times)
- test/spec-locators.test.ts: Test Files  1 failed (1); Tests  1 failed | 55 passed (56) -> failure (fails both times)

## d/e. Corpus
Branch rows: 411; main 402bbf3f rows: 411. Rows whose status changed (main -> branch): 0. Rows whose lint lists differ: 0.
No compiled -> refused changes. Status counts branch: {"compiled":311,"refused":82,"incomplete":18}; main: {"compiled":311,"refused":82,"incomplete":18}.
Lint totals (entries) branch: {"gate-before-goto":6,"frozen-literal":377,"own-output-slot":68,"demoted-pin":15,"dead-read":114,"frozen-locator-id":1651}
Lint totals (entries) main:   {"gate-before-goto":6,"frozen-literal":377,"own-output-slot":68,"demoted-pin":15,"dead-read":114,"frozen-locator-id":1651}
(The gate's comparison with bench/corpus-baseline.json is stale; informational only.)

## Failing tests (first 30 lines of each error)

### Browser run (b)
- FAIL test/assert-e2e.browser.test.ts > sitelooper assert, end to end > passes on a recorded fallback locator when the primary is gone, filing drift a repair needs no model for
```
AssertionError: expected [ { flow: 'assert-e2e', …(11) }, …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ test/assert-e2e.browser.test.ts:393:33
    391|     expect(result.status).toBe('success');
    392|     expect(result.steps.map((s) => [s.id, s.status, s.turns])).toEqual…
    393|     expect(result.driftTickets).toHaveLength(1);
       |                                 ^
    394|     expect(result.driftTickets![0]).toMatchObject({ step: '02-assert',…
    395|     expect(result.driftTickets![0].missedLocator).toContain('data-test…

```

- FAIL test/assert-e2e.browser.test.ts > sitelooper assert, end to end > compiles to an artifact whose assert steps pass on the good page and throw the assertion failure on the others
```
AssertionError: expected [ …(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ test/assert-e2e.browser.test.ts:424:27
    422|     const renamed = await runOn('renamed', 'z3');
    423|     expect(renamed.error).toBeNull();
    424|     expect(renamed.drift).toHaveLength(1);
       |                           ^
    425|     expect(renamed.drift[0]).toContain('02-assert');
    426| 

```

- FAIL test/fault-readiness.browser.test.ts > readiness fault runs against a real app > a withheld Save is caught by the step that made it
```
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "Run 1: Error: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]",
+   "Run 1: Required steps did not complete: 01-create",
+ ]

 ❯ test/fault-readiness.browser.test.ts:97:29
     95|   it('a withheld Save is caught by the step that made it', () => {
     96|     const report = ready(compile([create()]));
     97|     expect(report.blockers).toEqual([]);
       |                             ^
     98|     expect(report.outcome).toBe('verified');
     99|     expect(report.failureDetection).toBe('verified');

```

- FAIL test/fault-readiness.browser.test.ts > readiness fault runs against a real app > a withheld click nothing checks passes anyway, and readiness refuses the spec for it
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/fault-readiness.browser.test.ts:111:38
    109|   it('a withheld click nothing checks passes anyway, and readiness ref…
    110|     const report = ready(compile([create(), archive()]));
    111|     expect(report.executionVerified).toBe(true);
       |                                      ^
    112|     expect(report.outcome).toBe('failed');
    113|     expect(report.failureDetection).toBe('failed');

```

- FAIL test/fixup-e2e.browser.test.ts > a declared fix-up, recorded, compiled and run by both runners > the daemon > runs the repair where the duplicate is there
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/fixup-e2e.browser.test.ts:148:40
    146|     it('runs the repair where the duplicate is there', async () => {
    147|       const result = await replay(skill, true);
    148|       expect(result.ok, result.reason).toBe(true);
       |                                        ^
    149|       expect(result.lines.join('\n')).toContain('fix-up applies');
    150|       expect(await state()).toEqual({ rows: ['Widget', 'Gadget'], dele…

```

- FAIL test/fixup-e2e.browser.test.ts > a declared fix-up, recorded, compiled and run by both runners > the daemon > the same steps without the declaration delete a real row there (what the fix-up stops)
```
AssertionError: expected [] to deeply equal [ 'Gadget' ]

- Expected
+ Received

- [
-   "Gadget",
- ]
+ []

 ❯ test/fixup-e2e.browser.test.ts:169:29
    167|       await replay(undeclared, false);
    168|       const after = await state();
    169|       expect(after.deleted).toEqual(['Gadget']);
       |                             ^
    170|       expect(after.rows).toEqual(['Widget']);
    171|     }, 60_000);

```

- FAIL test/fixup-e2e.browser.test.ts > a declared fix-up, recorded, compiled and run by both runners > the compiled spec > runs the repair where the duplicate is there
```
AssertionError: Error: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/fixup-e2e.browser.test.ts:201:43
    199|       await reset(true);
    200|       const run = runSpecCheck({ flowFile, isolated: true });
    201|       expect(run.passed, run.error ?? '').toBe(true);
       |                                           ^
    202|       expect(await state()).toEqual({ rows: ['Widget', 'Gadget'], dele…
    203|     }, 300_000);

```

- FAIL test/gone-records.browser.test.ts > a record the gesture took away is waited out > the read after the second delete sees the table repainted
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/gone-records.browser.test.ts:119:38
    117|   it('the read after the second delete sees the table repainted', asyn…
    118|     const replay = await run(deleteSkill('s_gone', true));
    119|     expect(replay.ok, replay.reason).toBe(true);
       |                                      ^
    120|     expect(replay.values.parts_after).toContain('No parts on this tick…
    121|     expect(replay.values.parts_after).not.toContain('Bench Part');

```

- FAIL test/gone-records.browser.test.ts > a record the gesture took away is waited out > without the recorded removal the same replay reads the stale table (the bug)
```
AssertionError: expected '' to contain 'Bench Part'

- Expected
+ Received

- Bench Part

 ❯ test/gone-records.browser.test.ts:126:45
    124|   it('without the recorded removal the same replay reads the stale tab…
    125|     const replay = await run(deleteSkill('s_stale', false));
    126|     expect(replay.values.parts_after ?? '').toContain('Bench Part');
       |                                             ^
    127|   }, 60_000);
    128| });

```

- FAIL test/replay-false-pass.browser.test.ts > a replay that reports work the app did not do > (a) a renamed Delete button, with another link to the page the delete landed on > control: with the button as recorded, the replay deletes the ticket and says so
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay-false-pass.browser.test.ts:167:40
    165|       deleteLabel = 'Delete';
    166|       const replay = await run('/tickets/15', deleteSkill('s_navfb0'),…
    167|       expect(replay.ok, replay.reason).toBe(true);
       |                                        ^
    168|       expect(deleteRequests).toBe(1);
    169|       expect(page.url()).toBe(`${ORIGIN}/tickets`);

```

- FAIL test/replay-false-pass.browser.test.ts > a replay that reports work the app did not do > (b) an effect line that is a prefix of what the page shows > control: the recorded value, shown exactly, passes; a different value stops
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay-false-pass.browser.test.ts:256:36
    254|       total = '125';
    255|       const same = await run('/order', recalcSkill('s_sub0'), { v1: '1…
    256|       expect(same.ok, same.reason).toBe(true);
       |                                    ^
    257|       total = '990';
    258|       const other = await run('/order', recalcSkill('s_sub1'), { v1: '…

```

- FAIL test/replay-false-pass.browser.test.ts > a replay that reports work the app did not do > (b) an effect line that is a prefix of what the page shows > ground truth: the app shows 12500 where 125 was recorded
```
AssertionError: expected '0' to be '12500' // Object.is equality

Expected: "12500"
Received: "0"

 ❯ test/replay-false-pass.browser.test.ts:272:57
    270|     it('ground truth: the app shows 12500 where 125 was recorded', asy…
    271|       await replayLonger();
    272|       expect(await page.locator('#total').inputValue()).toBe('12500');
       |                                                         ^
    273|     }, 60_000);
    274| 

```

- FAIL test/replay-false-pass.browser.test.ts > a replay that reports work the app did not do > (b) an effect line that is a prefix of what the page shows > control: an uncheck that works passes
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay-false-pass.browser.test.ts:290:40
    288|       uncheckWorks = true;
    289|       const replay = await run('/order', uncheckSkill('s_sub4'));
    290|       expect(replay.ok, replay.reason).toBe(true);
       |                                        ^
    291|       expect(await page.locator('#notify').isChecked()).toBe(false);
    292|     }, 60_000);

```

- FAIL test/replay.test.ts > skill replay (fixture page) > replays end to end on a fresh page with new parameters, reading back live values
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:134:28
    132|     const out = await run('run_skill', { id: skill.id, params: { v1: '…
    133|     expect(out.isError).toBe(false);
    134|     expect(out.replay?.ok).toBe(true);
       |                            ^
    135|     expect(out.replay?.stepsRun).toBe(5);
    136|     expect(out.replay?.fallthroughs).toBe(0);

```

- FAIL test/replay.test.ts > skill replay (fixture page) > skips a toggle click whose recorded popup is already open
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:240:28
    238|     const out = await run('run_skill', { id: skill.id, params: {} });
    239|     session.learn!.remove(skill.id);
    240|     expect(out.replay?.ok).toBe(true);
       |                            ^
    241|     expect(out.replay?.warnings.some((w) => /already in effect/.test(w…
    242|     // The delta shadow rule: this replay's first click opened the men…

```

- FAIL test/replay.test.ts > skill replay (fixture page) > reports, never refuses, an opener skip whose popup was open as the segment started
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:284:28


```

- FAIL test/replay.test.ts > skill replay (fixture page) > a dismissal of a dialog nothing in the procedure opened > skips the Close when the dialog is not there, and runs the rest
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:350:30
    348|       const page = await setUp(false);
    349|       const out = await replay(skillOf('s_welcome_absent', { name: 'Cl…
    350|       expect(out.replay?.ok).toBe(true);
       |                              ^
    351|       expect(out.replay?.warnings.some((w) => /closes the dialog "Welc…
    352|       // The delta shadow rule: the dialog was absent when the segment…

```

- FAIL test/replay.test.ts > skill replay (fixture page) > a dismissal of a dialog nothing in the procedure opened > clicks the Close when the dialog is there
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:360:30
    358|       const page = await setUp(true);
    359|       const out = await replay(skillOf('s_welcome_present', { name: 'C…
    360|       expect(out.replay?.ok).toBe(true);
       |                              ^
    361|       expect(out.replay?.warnings.some((w) => /already in effect/.test…
    362|       expect(await page.locator('[role=dialog]').count()).toBe(0);

```

- FAIL test/replay.test.ts > skill replay (fixture page) > skips only the absent dialog's own controls, and fails an unrelated missing step
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:461:89
    459| 
    460|     // Cancel belongs to the dialog: skipped. Archive does not: the re…
    461|     expect(out.replay?.warnings.some((w) => /"Cancel".*control of the …
       |                                                                                         ^
    462|     expect(out.replay?.ok).toBe(false);
    463|     expect(out.replay?.failedAt).toBe(3);

```

- FAIL test/replay.test.ts > skill replay (fixture page) > does not re-dispatch a click whose effect it could not see
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /did not have its recorded effect/

- Expected: 
/did not have its recorded effect/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/replay.test.ts:493:32
    491|     session.learn!.remove(skill.id);
    492|     expect(out.replay?.ok).toBe(false);
    493|     expect(out.replay?.reason).toMatch(/did not have its recorded effe…
       |                                ^
    494|     expect(out.replay?.acted).toBe(true);
    495|     expect(out.replay?.warnings.some((w) => /retried once/.test(w))).t…

```

- FAIL test/replay.test.ts > skill replay (fixture page) > a replay keeps its page when a replayed click opens a tab
```
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ test/replay.test.ts:522:34
    520|     const out = await run('run_skill', { id: skill.id, params: {} });
    521|     session.learn!.remove(skill.id);
    522|     expect(out.replay?.stepsRun).toBe(1);
       |                                  ^
    523|     expect((await session.getPage()).url()).toBe(page.url());
    524|     for (const p of await session.listPages()) if (p !== page) await p…

```

- FAIL test/replay.test.ts > skill replay (fixture page) > gives a recorded url that is still on its way the resolve window
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:567:28
    565|     const out = await run('run_skill', { id: skill.id, params: {} });
    566|     session.learn!.remove(skill.id);
    567|     expect(out.replay?.ok).toBe(true);
       |                            ^
    568|     expect(page.url()).toBe(`${fixtureUrl}#landed`);
    569|   }, 30_000);

```

- FAIL test/replay.test.ts > skill replay (fixture page) > a goto-first procedure navigates itself: no start-page refusal
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:580:28
    578|     const out = await run('run_skill', { id: nav.id, params: { v1: 'Na…
    579|     expect(out.replay?.refused).toBeFalsy();
    580|     expect(out.replay?.ok).toBe(true);
       |                            ^
    581|     expect(out.replay?.values.banner).toBe('Saved Nav Ada!');
    582|     session.learn!.remove(nav.id);

```

- FAIL test/replay.test.ts > skill replay (fixture page) > perturbation: an inserted confirm() on submit stops the replay at the expectation
```
AssertionError: expected 3 to be 4 // Object.is equality

- Expected
+ Received

- 4
+ 3

 ❯ test/replay.test.ts:679:34
    677|     const out = await run('run_skill', { id: skill.id, params: { v1: '…
    678|     expect(out.replay?.ok).toBe(false);
    679|     expect(out.replay?.failedAt).toBe(4); // wait_for on the banner
       |                                  ^
    680|     expect(out.result).toMatch(/native dialogs: confirm\("Submit\?"\) …
    681|   }, 30_000);

```

- FAIL test/replay.test.ts > flow record and run (fixture page) > records a session into a replayable flow and runs it zero-model with new params
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:830:31
    828|     expect(params.v1).toBe('Grace Hopper');
    829|     const replay = await run('run_skill', { id: step.skill!, params });
    830|     expect(replay.replay?.ok).toBe(true);
       |                               ^
    831|     expect(await page.inputValue('#name')).toBe('Grace Hopper');
    832|     expect(await page.inputValue('#qty')).toBe('42');

```

- FAIL test/replay.test.ts > delete-loop replay (fixture page) > replays the loop to clear a list LONGER than the one recorded (2 → 3 rows)
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:1148:28
    1146|     const out = await run('run_skill', { id: skill.id, params: {} });
    1147|     expect(out.isError).toBe(false);
    1148|     expect(out.replay?.ok).toBe(true);
       |                            ^
    1149|     // the loop kept going until the list was empty — past the two it …
    1150|     expect(await page.locator('#dellist > .prow').count()).toBe(0);

```

- FAIL test/replay.test.ts > segment chains (two fixture pages) > segment 2 refuses on the wrong page; the chain replays cleanly in order
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:1225:30
    1223|     // composition: head then tail, each on its own page
    1224|     const first = await run('run_skill', { id: a.id, params });
    1225|     expect(first.replay?.ok).toBe(true);
       |                              ^
    1226|     expect(page.url()).toContain('detail.html');
    1227|     const second = await run('run_skill', { id: b.id, params });

```

- FAIL test/replay.test.ts > identity-scoped locators (fixture page) > records the match index of an AMBIGUOUS candidate, including index 0
```
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ test/replay.test.ts:1833:30
    1831|     expect(out.ok).toBe(true);
    1832|     expect(clicked).toEqual(['1']);
    1833|     expect(out.fallthroughs).toBe(0);
       |                              ^
    1834|   }, 30_000);
    1835| 

```

- FAIL test/replay.test.ts > frame and page context: record, compile, replay (fixture server) > records the in-frame Save with its frame path, and replay presses that Save — never the page's own
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:2059:54
    2057|     fx.reset(0);
    2058|     const replay = await run('run_skill', { id: frameSkill.id, params:…
    2059|     expect(replay.replay?.ok, replay.replay?.reason).toBe(true);
       |                                                      ^
    2060|     expect(await logIs(['frame-save'])).toEqual(['frame-save']);
    2061|     expect(fx.log).not.toContain('note');

```

- FAIL test/replay.test.ts > frame and page context: record, compile, replay (fixture server) > records a popup, its close and the return to the opener, and replay follows all three
```
AssertionError: s_7164ed: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/replay.test.ts:2111:76
    2109|     for (const segment of chain) {
    2110|       const replay = await run('run_skill', { id: segment.id, params: …
    2111|       expect(replay.replay?.ok, `${segment.id}: ${replay.replay?.reaso…
       |                                                                            ^
    2112|     }
    2113|     expect(await logIs(['approve', 'after'])).toEqual(['approve', 'aft…

```

- FAIL test/spec-locators.test.ts > emitted source resolves what makeLocator resolves (fixture page) > matches makeLocator for role
```
Error: locator.evaluate: InvalidSelectorError: Error while parsing selector `button[name=/^[\s\p{Co}\p{So}\p{Cf}]*Submit(?:(?:\s+|(?=[⌘⇧⌥⌃⏎↵]))(?:(?:[⌘⇧⌥⌃⏎↵]\s*\+?\s*|(?:[Cc][Tt][Rr][Ll]|[Cc][Oo][Nn][Tt][Rr][Oo][Ll]|[Aa][Ll][Tt]|[Oo][Pp][Tt][Ii][Oo][Nn]|[Ss][Hh][Ii][Ff][Tt]|[Cc][Mm][Dd]|[Cc][Oo][Mm][Mm][Aa][Nn][Dd]|[Mm][Ee][Tt][Aa]|[Ww][Ii][Nn]|[Ss][Uu][Pp][Ee][Rr])(?![\p{L}\p{N}])(?:\s*\+\s*|\s+))+(?:[\p{L}\p{N}]|[Ff](?:2[0-4]|1\d|[1-9])|[Ee][Nn][Tt][Ee][Rr]|[Rr][Ee][Tt][Uu][Rr][Nn]|[Ee][Ss][Cc][Aa][Pp][Ee]|[Ee][Ss][Cc]|[Tt][Aa][Bb]|[Ss][Pp][Aa][Cc][Ee]|[Bb][Aa][Cc][Kk][Ss][Pp][Aa][Cc][Ee]|[Dd][Ee][Ll][Ee][Tt][Ee]|[Dd][Ee][Ll]|[,./;'\[\]\\=`-])(?![\p{L}\p{N}])|[⌘⇧⌥⌃⏎↵](?:\s*\+?\s*[⌘⇧⌥⌃⏎↵])*))?[\s\p{Co}\p{So}\p{Cf}]*$/u] >> nth=0` - unexpected symbol ">" at position 654
    at syntaxError (<anonymous>:1756:11)
    at parseAttributeSelector (<anonymous>:1905:5)
    at Object.queryAll (<anonymous>:5158:22)
    at InjectedScript._queryEngineAll (<anonymous>:6804:49)
    at InjectedScript.querySelectorAll (<anonymous>:6791:30)
    at eval (eval at evaluate (:303:30), <anonymous>:4:39)
    at UtilityScript.evaluate (<anonymous>:305:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
Call log:
  - waiting for internal:role=button[name=/^[\s\p{Co}\p{So}\p{Cf}]*Submit(?:(?:\s+|(?=[⌘⇧⌥⌃⏎↵]))(?:(?:[⌘⇧⌥⌃⏎↵]\s*\+?\s*|(?:[Cc][Tt][Rr][Ll]|[Cc][Oo][Nn][Tt][Rr][Oo][Ll]|[Aa][Ll][Tt]|[Oo][Pp][Tt][Ii][Oo][Nn]|[Ss][Hh][Ii][Ff][Tt]|[Cc][Mm][Dd]|[Cc][Oo][Mm][Mm][Aa][Nn][Dd]|[Mm][Ee][Tt][Aa]|[Ww][Ii][Nn]|[Ss][Uu][Pp][Ee][Rr])(?![\p{L}\p{N}])(?:\s*\+\s*|\s+))+(?:[\p{L}\p{N}]|[Ff](?:2[0-4]|1\d|[1-9])|[Ee][Nn][Tt][Ee][Rr]|[Rr][Ee][Tt][Uu][Rr][Nn]|[Ee][Ss][Cc][Aa][Pp][Ee]|[Ee][Ss][Cc]|[Tt][Aa][Bb]|[Ss][Pp][Aa][Cc][Ee]|[Bb][Aa][Cc][Kk][Ss][Pp][Aa][Cc][Ee]|[Dd][Ee][Ll][Ee][Tt][Ee]|[Dd][Ee][Ll]|[,./;'\[\]\\=`-])(?![\p{L}\p{N}])|[⌘⇧⌥⌃⏎↵](?:\s*\+?\s*[⌘⇧⌥⌃⏎↵])*))?[\s\p{Co}\p{So}\p{Cf}]*$/u] >> nth=0

 ❯ same test/spec-locators.test.ts:401:33
    399|     expect(n).toBeGreaterThan(0);
    400|     for (let i = 0; i < n; i++) {
    401|       expect(await other.nth(i).evaluate((el) => el.outerHTML)).toBe(a…
       |                                 ^
    402|     }
    403|   };
 ❯ test/spec-locators.test.ts:420:7

```

### Parity run (c)
- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners proceed when the producing read did capture the value
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:553:44
    551| 
    552|     expect([...new Set(blocking)]).toEqual([]);
    553|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    554|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    555|     expect(replayLog).toEqual(['visit:Item 2', 'mark:Item 2']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners resolve an unpublished control label to its recorded value when the page shows it
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:621:44
    619|     const emittedLog = [...fx.log];
    620| 
    621|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    622|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    623|     expect(replayLog).toEqual(['delete:Item 1']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners publish a minted id the chain derived, in the tail’s report, with the live value
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:693:62
    691|         const out = await executeTool(session, 'run_skill', { id: skil…
    692|         last = out.replay as ReplayResult;
    693|         expect(last?.ok, last?.reason ?? String(out.result)).toBe(true…
       |                                                              ^
    694|         Object.assign(threaded, last.derivedValues ?? {});
    695|       }

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners derive and publish a minted id from a query-string position
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:754:62
    752|         const out = await executeTool(session, 'run_skill', { id: skil…
    753|         last = out.replay as ReplayResult;
    754|         expect(last?.ok, last?.reason ?? String(out.result)).toBe(true…
       |                                                              ^
    755|         Object.assign(threaded, last.derivedValues ?? {});
    756|       }

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners wait for the records a confirm took away before reading the table (fwrd63)
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1353:40
    1351|     const emitted = await emittedOf(spec, params, onPage);
    1352|     for (const [run, read] of [[replay, replay.outputs.parts_after], […
    1353|       expect(run.ok, run.reason ?? '').toBe(true);
       |                                        ^
    1354|       expect(read).toContain('No parts on this ticket yet.');
    1355|       expect(read).not.toContain('Bench Part');

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners render an unfilled marker as the wildcard they matched it as
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1419:50
    1417|     const ok = await both(passing, 1);
    1418|     // Matching is unchanged: the marker stood for any record, so the …
    1419|     expect(ok.replay.ok, ok.replay.reason ?? '').toBe(true);
       |                                                  ^
    1420|     expect(ok.emitted.ok, ok.emitted.reason ?? '').toBe(true);
    1421|     expect(ok.replayLog.filter((e) => e.startsWith('mark:'))).toEqual(…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners bind a goto result before its own URL gate and later actions
- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners bind a back result before its own URL gate and later actions
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1460:44
    1458|     const { replay, emitted, replayLog, emittedLog } = await bothOf(sk…
    1459| 
    1460|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    1461|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    1462|     // Reading the recorded example, the page before Back, or an unbou…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > neither runner calls a capped loop finished with items left
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /not finished|still matching/

- Expected: 
/not finished|still matching/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:1479:27
    1477|     expect(replay.ok).toBe(false);
    1478|     expect(emitted.ok).toBe(false);
    1479|     expect(replay.reason).toMatch(/not finished|still matching/);
       |                           ^
    1480|     expect(emitted.reason).toMatch(/not finished|still matching/);
    1481| 

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners drain a list within the cap, deleting each item once
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1498:23
    1496|     const { replay, emitted, replayLog, emittedLog } = await both(dele…
    1497| 
    1498|     expect(replay.ok).toBe(true);
       |                       ^
    1499|     expect(emitted.ok).toBe(true);
    1500|     expect(replayLog.sort()).toEqual(emittedLog.sort());

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners do exactly the observed work for a bounded loop, and leave the rest
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1516:23
    1514|     const { replay, emitted, replayLog, emittedLog } = await both(dele…
    1515| 
    1516|     expect(replay.ok).toBe(true);
       |                       ^
    1517|     expect(emitted.ok).toBe(true);
    1518|     expect(replayLog).toHaveLength(2);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners visit each record once when the collection does not shrink
```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1539:23
    1537|     const { replay, emitted, replayLog, emittedLog } = await both(mark…
    1538| 
    1539|     expect(replay.ok).toBe(true);
       |                       ^
    1540|     expect(emitted.ok).toBe(true);
    1541|     // Three records, marked once each — not one record marked three t…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners proceed when the goto lands on this run's own record
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1589:44
    1587|     const { replay, emitted, replayLog, emittedLog } = await bothOf(re…
    1588| 
    1589|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    1590|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    1591|     expect(replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners send a later goto to the live value at a position this run has shown volatile
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1707:44
    1705|     const { replay, emitted, replayLog, emittedLog } = await bothOf(sk…
    1706| 
    1707|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    1708|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    1709|     // The server is the oracle: neither runner ever asked for the rec…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners treat a procedure that looks before its goto as navigating itself
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1733:44
    1731|     const { replay, emitted, replayLog, emittedLog } = await bothOf(sk…
    1732| 
    1733|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    1734|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    1735|     expect(replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners run a procedure whose look-before-the-goto names the root through an enriched chain
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1775:44
    1773|     const { replay, emitted, replayLog, emittedLog } = await bothOf(sk…
    1774| 
    1775|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    1776|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    1777|     // The server is the oracle: the goto ran, and the work happened o…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners run a detail-page skill whose goto lands on a list that does not show the record
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1809:44
    1807|     const emittedLog = [...fx.log];
    1808| 
    1809|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    1810|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    1811|     expect(replayLog).toEqual(['mark:Item 1']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners gate a segment after a goto seam on its landing, and stop on the wrong record before acting
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1889:48
    1887|     const emittedOk = await emittedOf(seamFlow(slotted), { v1: 'rec-77…
    1888|     const emittedOkLog = [...fx.log];
    1889|     expect(replayOk.ok, replayOk.reason ?? '').toBe(true);
       |                                                ^
    1890|     expect(emittedOk.ok, emittedOk.reason ?? '').toBe(true);
    1891|     expect(replayOkLog).toEqual(['visit:rec-77', 'mark:rec-77']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners warn on a stale marker where the url names the record, and refuse where it cannot
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:1969:50
    1967|     const named = staleOf(`${origin}/record/{{v1}}`);
    1968|     const ok = await bothOf(named.skill, named.spec, live);
    1969|     expect(ok.replay.ok, ok.replay.reason ?? '').toBe(true);
       |                                                  ^
    1970|     expect(ok.emitted.ok, ok.emitted.reason ?? '').toBe(true);
    1971|     expect(ok.replayLog).toEqual(['visit:rec-77', 'mark:rec-77']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners wait for a page that has not finished arriving before judging its record
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2013:44
    2011| 
    2012|     const { replay, emitted, replayLog, emittedLog } = await bothOf(sk…
    2013|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    2014|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    2015|     // The work happened once, on this run's record, on both sides.

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners ask the url again once the identity wait is spent
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2049:44
    2047| 
    2048|     const { replay, emitted, replayLog, emittedLog } = await bothOf(sk…
    2049|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    2050|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    2051|     // Not silently: both say the marker is stale and the url answered…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > gates > both runners stop on an alert the recording never saw, before the next mutation
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /raised an alert the recording never s…/

- Expected: 
/raised an alert the recording never saw: Mark rejected: Item 1/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:2478:29
    2476|       expect(replay.ok).toBe(false);
    2477|       expect(emitted.ok).toBe(false);
    2478|       expect(replay.reason).toMatch(/raised an alert the recording nev…
       |                             ^
    2479|       expect(emitted.reason).toMatch(/raised an alert the recording ne…
    2480| 

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > gates > both runners expect a recorded refusal whose first line the reads published
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2536:46
    2534|       const emitted = await emittedOf(specOf(steps));
    2535|       const emittedLog = [...fx.log];
    2536|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    2537|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    2538|       expect(replayLog).toEqual(['delete:Item 1']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > gates > both runners skip a dismissal whose dialog is not open, click it when it is, and never skip a confirm
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2561:60
    2559| 
    2560|       const absent = await both([CLOSE, MARK], 1);
    2561|       expect(absent.replay.ok, absent.replay.reason ?? '').toBe(true);
       |                                                            ^
    2562|       expect(absent.emitted.ok, absent.emitted.reason ?? '').toBe(true…
    2563|       expect(absent.replayLog).toEqual(['mark:Item 1']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > gates > both runners report an unrecorded alert and go on when the step's recorded change confirmed it, and stop when nothing does
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2659:66
    2657| 
    2658|       const confirmed = await both([goto, markAmbient(true), markAmbie…
    2659|       expect(confirmed.replay.ok, confirmed.replay.reason ?? '').toBe(…
       |                                                                  ^
    2660|       expect(confirmed.emitted.ok, confirmed.emitted.reason ?? '').toB…
    2661|       expect(confirmed.replayLog).toEqual(['mark:Item 1', 'mark:Item 1…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > gates > both runners continue past a one-segment url mismatch, with a warning, and act on the live record
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2736:46
    2734|       const emittedLog = [...fx.log];
    2735| 
    2736|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    2737|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    2738|       expect(replayLog).toEqual(['visit:rec-2', 'mark:rec-2']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > gates > both runners continue past a one-segment url mismatch on a structurally identical page, measured against the recorded fingerprint
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2764:46
    2762|       const emittedLog = [...fx.log];
    2763| 
    2764|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    2765|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    2766|       expect(replayLog).toEqual(['visit:rec-2', 'mark:rec-2']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > gates > both runners continue past a three-position url mismatch on a structurally identical page, measured against the recorded fingerprint
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2866:46
    2864|       const emittedLog = [...fx.log];
    2865| 
    2866|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    2867|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    2868|       expect(replayLog).toEqual([`visit:${liveId}`, `mark:${liveId}`]);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > content expectations > both runners proceed when the value after the colon matches, and save this run's own value
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:2983:46
    2981|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    2982| 
    2983|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    2984|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    2985|       expect(replayLog.filter((l) => l.startsWith('save:'))).toEqual([…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > content expectations > both runners ignore a recorded line that identifies no element, and still judge the named one
```
AssertionError: expected [] to deeply equal [ 'save:Beta' ]

- Expected
+ Received

- [
-   "save:Beta",
- ]
+ []

 ❯ test/execution-parity.test.ts:3002:62
    3000|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    3001| 
    3002|       expect(replayLog.filter((l) => l.startsWith('save:'))).toEqual([…
       |                                                              ^
    3003|       expect(emittedLog.filter((l) => l.startsWith('save:'))).toEqual(…
    3004|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > content expectations > neither runner judges a step on a slot this run could not fill
```
AssertionError: replay stopped on a line it could not fill: expected [] to deeply equal [ 'save:Beta' ]

- Expected
+ Received

- [
-   "save:Beta",
- ]
+ []

 ❯ test/execution-parity.test.ts:3085:108
    3083|       expect(blocking).toEqual([]);
    3084|       // the oracle: both ran the procedure and saved THIS run's value
    3085|       expect(replayLog.filter((l) => l.startsWith('save:')), 'replay s…
       |                                                                                                            ^
    3086|       expect(emittedLog.filter((l) => l.startsWith('save:')), 'the art…
    3087|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > content expectations > both runners run a procedure whose expectation-only slot the flow never bound, and say the line went unchecked
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:3141:46
    3139|       const emittedLog = [...fx.log];
    3140| 
    3141|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    3142|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    3143|       expect(replayLog.filter((l) => l.startsWith('save:'))).toEqual([…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > content expectations > both runners continue past a plain dialog line that did not open, skip its own control, and still run the next step
```
AssertionError: replay must skip the dialog's control and still mark: expected [] to deeply equal [ 'mark:editor' ]

- Expected
+ Received

- [
-   "mark:editor",
- ]
+ []

 ❯ test/execution-parity.test.ts:3199:82
    3197|       // The oracle: Mark ran on both sides, and nothing confirmed a d…
    3198|       // that was never offered.
    3199|       expect(replayLog, 'replay must skip the dialog\'s control and st…
       |                                                                                  ^
    3200|       expect(emittedLog, 'the artifact must skip the dialog\'s control…
    3201|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > content expectations > both runners act inside the dialog when it does open
```
AssertionError: expected [] to deeply equal [ 'discard:confirmed', 'mark:editor' ]

- Expected
+ Received

- [
-   "discard:confirmed",
-   "mark:editor",
- ]
+ []

 ❯ test/execution-parity.test.ts:3215:25
    3213|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    3214| 
    3215|       expect(replayLog).toEqual(['discard:confirmed', 'mark:editor']);
       |                         ^
    3216|       expect(emittedLog).toEqual(['discard:confirmed', 'mark:editor']);
    3217|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > locator resolution > neither runner takes a fallback whose only match sits under a link to another origin
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /no element matched any known locator/

- Expected: 
/no element matched any known locator/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:3338:29
    3336|       expect(replay.ok).toBe(false);
    3337|       expect(emitted.ok).toBe(false);
    3338|       expect(replay.reason).toMatch(/no element matched any known loca…
       |                             ^
    3339|       expect(emitted.reason).toMatch(/none of 2 recorded locators reso…
    3340| 

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > locator resolution > both runners refuse an absence wait whose chain still matches two visible elements, and neither reaches the next mutation
```
AssertionError: expected 'wait_for failed: locator.waitFor: Inv…' to match /^wait_for failed: .*Timeout 1000ms ex…/

- Expected: 
/^wait_for failed: .*Timeout 1000ms exceeded/

+ Received: 
"wait_for failed: locator.waitFor: InvalidSelectorError: Error while parsing selector `button[name=/^[\\s\\p{Co}\\p{So}\\p{Cf}]*Mark(?:(?:\\s+|(?=[⌘⇧⌥⌃⏎↵]))(?:(?:[⌘⇧⌥⌃⏎↵]\\s*\\+?\\s*|(?:[Cc][Tt][Rr][Ll]|[Cc][Oo][Nn][Tt][Rr][Oo][Ll]|[Aa][Ll][Tt]|[Oo][Pp][Tt][Ii][Oo][Nn]|[Ss][Hh][Ii][Ff][Tt]|[Cc][Mm][Dd]|[Cc][Oo][Mm][Mm][Aa][N…"

 ❯ test/execution-parity.test.ts:3415:35
    3413|       // `expect(locator.first()).toBeHidden()` — both time out, neith…
    3414|       // reports "nothing matched"
    3415|       expect(still.replay.reason).toMatch(/^wait_for failed: .*Timeout…
       |                                   ^
    3416|       // Playwright has worded this two ways across versions: "Timed o…
    3417|       // waiting for expect(locator).toBeHidden()" and, more recently,

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > locator resolution > both runners meet a singular wait whose chain matches several, and both reach the next mutation
```
AssertionError: replay must meet a visible wait that two elements satisfy: expected [] to deeply equal [ 'mark:Item 1' ]

- Expected
+ Received

- [
-   "mark:Item 1",
- ]
+ []

 ❯ test/execution-parity.test.ts:3457:94
    3455|       const several = await both(presenceSteps(ambiguous), 2);
    3456| 
    3457|       expect(several.replayLog, 'replay must meet a visible wait that …
       |                                                                                              ^
    3458|       expect(several.emittedLog, 'the artifact must meet a visible wai…
    3459|       expect(several.replay.ok, several.replay.reason ?? '').toBe(true…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > editor recipes > both runners set a monaco-shaped editor through the recipe, and the app commits the value
```
AssertionError: replay must commit the text the recipe set, not the initial model: expected [] to deeply equal [ 'commit:editor:notes for run x77' ]

- Expected
+ Received

- [
-   "commit:editor:notes for run x77",
- ]
+ []

 ❯ test/execution-parity.test.ts:3524:94
    3522|       const { replay, emitted, replayLog, emittedLog } = await both(ed…
    3523| 
    3524|       expect(replayLog, 'replay must commit the text the recipe set, n…
       |                                                                                              ^
    3525|       expect(emittedLog, 'the artifact must commit the text the recipe…
    3526|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > editor recipes > both runners type into a contenteditable through the recipe, replacing its content
```
AssertionError: replay must commit the typed text and nothing of the starting content: expected [] to deeply equal [ 'commit:note:typed body x88' ]

- Expected
+ Received

- [
-   "commit:note:typed body x88",
- ]
+ []

 ❯ test/execution-parity.test.ts:3541:98
    3539|       const { replay, emitted, replayLog, emittedLog } = await both(ed…
    3540| 
    3541|       expect(replayLog, 'replay must commit the typed text and nothing…
       |                                                                                                  ^
    3542|       expect(emittedLog, 'the artifact must commit the typed text and …
    3543|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > editor recipes > both runners commit a contenteditable whose text-located target stops matching once the recipe replaces it
```
AssertionError: replay must commit the new draft text: expected [] to deeply equal [ 'commit:draft:rewritten draft x99' ]

- Expected
+ Received

- [
-   "commit:draft:rewritten draft x99",
- ]
+ []

 ❯ test/execution-parity.test.ts:3566:66
    3564|       const { replay, emitted, replayLog, emittedLog } = await both(ed…
    3565| 
    3566|       expect(replayLog, 'replay must commit the new draft text').toEqu…
       |                                                                  ^
    3567|       expect(emittedLog, 'the artifact must commit the new draft text'…
    3568|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > editor recipes > both runners select on a native select natively, and the app commits the choice
```
AssertionError: expected [] to deeply equal [ 'commit:choice:Beta' ]

- Expected
+ Received

- [
-   "commit:choice:Beta",
- ]
+ []

 ❯ test/execution-parity.test.ts:3583:25
    3581|       const { replay, emitted, replayLog, emittedLog } = await both(ed…
    3582| 
    3583|       expect(replayLog).toEqual(['commit:choice:Beta']);
       |                         ^
    3584|       expect(emittedLog).toEqual(['commit:choice:Beta']);
    3585|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > env secrets > both runners sign in with a slot bound to {{env:NAME}}, replay at tier A
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:3643:48
    3641|         const emitted = await emittedFlowOf(signInFlow());
    3642|         const emittedLog = [...fx.log];
    3643|         expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                                ^
    3644|         expect(emitted.ok, emitted.reason ?? '').toBe(true);
    3645|         expect(replayLog).toEqual([`commit:login:admin:${SECRET}`]);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > env secrets > both runners refill a rebuilt form with the secret, never with its marker
```
AssertionError: replay must refill with the value: expected [] to deeply equal [ 'commit:login:admin:pw-env-x44' ]

- Expected
+ Received

- [
-   "commit:login:admin:pw-env-x44",
- ]
+ []

 ❯ test/execution-parity.test.ts:3663:64
    3661|         );
    3662|         const { replay, emitted, replayLog, emittedLog } = await both(…
    3663|         expect(replayLog, 'replay must refill with the value').toEqual…
       |                                                                ^
    3664|         expect(emittedLog, 'the artifact must refill with the value').…
    3665|         expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > totp codes > both runners pass a server-checked code from the marker in the recorded args
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:3738:48
    3736|       try {
    3737|         const { replay, emitted, replayLog, emittedLog } = await both(…
    3738|         expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                                ^
    3739|         expect(emitted.ok, emitted.reason ?? '').toBe(true);
    3740|         expect(replayLog).toEqual(['totp:ok']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > totp codes > both runners pass it through a slot the flow step binds to {{totp:NAME}}, replay at tier A
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:3762:48
    3760|         const emitted = await emittedFlowOf(totpFlow());
    3761|         const emittedLog = [...fx.log];
    3762|         expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                                ^
    3763|         expect(emitted.ok, emitted.reason ?? '').toBe(true);
    3764|         expect(replayLog).toEqual(['totp:ok']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > totp codes > both runners refill a rebuilt form with a code made at the refill, never the marker
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:3784:48
    3782|         ];
    3783|         const { replay, emitted, replayLog, emittedLog } = await both(…
    3784|         expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                                ^
    3785|         expect(emitted.ok, emitted.reason ?? '').toBe(true);
    3786|         const valid = await codesAroundNow();

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > standing fills > both runners refill a form the page emptied after its fills were checked, before the click that submits it
```
AssertionError: replay must submit the refilled form: expected [] to deeply equal [ 'commit:login:admin:pass-x42' ]

- Expected
+ Received

- [
-   "commit:login:admin:pass-x42",
- ]
+ []

 ❯ test/execution-parity.test.ts:3838:65
    3836|       const { replay, emitted, replayLog, emittedLog } = await both(st…
    3837| 
    3838|       expect(replayLog, 'replay must submit the refilled form').toEqua…
       |                                                                 ^
    3839|       expect(emittedLog, 'the artifact must submit the refilled form')…
    3840|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > standing fills > both runners refill a form whose page reloaded itself after the fills, before the click that submits it
```
AssertionError: replay must submit the refilled form: expected [] to deeply equal [ 'commit:login:admin:pass-x43' ]

- Expected
+ Received

- [
-   "commit:login:admin:pass-x43",
- ]
+ []

 ❯ test/execution-parity.test.ts:3865:65
    3863|     it('both runners refill a form whose page reloaded itself after th…
    3864|       const { replay, emitted, replayLog, emittedLog } = await both(re…
    3865|       expect(replayLog, 'replay must submit the refilled form').toEqua…
       |                                                                 ^
    3866|       expect(emittedLog, 'the artifact must submit the refilled form')…
    3867|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > standing fills > both runners save a value a key-driven widget dropped at blur, typed key by key (amount-first)
- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > standing fills > both runners save a value a key-driven widget dropped at blur, typed key by key (amount-last)
```
AssertionError: expected [] to deeply equal [ Array(1) ]

- Expected
+ Received

- [
-   "commit:opportunity:12,500.00|note x61",
- ]
+ []

 ❯ test/execution-parity.test.ts:3893:27
    3891|       it(`both runners save a value a key-driven widget dropped at blu…
    3892|         const { replay, emitted, replayLog, emittedLog } = await both(…
    3893|         expect(replayLog).toEqual(['commit:opportunity:12,500.00|note …
       |                           ^
    3894|         expect(emittedLog).toEqual(['commit:opportunity:12,500.00|note…
    3895|         expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > standing fills > both runners repeat a submit the page reloaded away, once, after refilling its form
```
AssertionError: replay must sign in once: expected [] to deeply equal [ 'commit:login:admin:pass-x43' ]

- Expected
+ Received

- [
-   "commit:login:admin:pass-x43",
- ]
+ []

 ❯ test/execution-parity.test.ts:3906:53
    3904|     it('both runners repeat a submit the page reloaded away, once, aft…
    3905|       const { replay, emitted, replayLog, emittedLog } = await both(re…
    3906|       expect(replayLog, 'replay must sign in once').toEqual(['commit:l…
       |                                                     ^
    3907|       expect(emittedLog, 'the artifact must sign in once').toEqual(['c…
    3908|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > disclosure toggles > both runners click a toggle whose panel is hidden, once
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:3945:46
    3943|     it('both runners click a toggle whose panel is hidden, once', asyn…
    3944|       const { replay, emitted, replayLog, emittedLog } = await both(to…
    3945|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    3946|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    3947|       expect(replayLog).toEqual(['commit:panel:shown']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > disclosure toggles > without the flag, both runners click a shown panel shut and stop on its missing effect
```
AssertionError: expected [] to deeply equal [ 'commit:panel:hidden' ]

- Expected
+ Received

- [
-   "commit:panel:hidden",
- ]
+ []

 ❯ test/execution-parity.test.ts:3955:25
    3953|       expect(replay.ok).toBe(false);
    3954|       expect(emitted.ok).toBe(false);
    3955|       expect(replayLog).toEqual(['commit:panel:hidden']);
       |                         ^
    3956|       expect(emittedLog).toEqual(['commit:panel:hidden']);
    3957|     }, 120_000);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a minted key that arrived with others is no creation (fwod78 01-open) > both runners start a procedure whose q.action mint was not sole on a page already carrying action
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4062:46
    4060|     it('both runners start a procedure whose q.action mint was not sol…
    4061|       const { replay, emitted, replayLog, emittedLog } = await run({ a…
    4062|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    4063|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    4064|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a set value the save never showed (round 51, fwrd84 05-edit) > both runners stop a save that never showed the cost the procedure set, and pass one that did
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /Part A \$150/

- Expected: 
/Part A \$150/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:4143:33
    4141|       expect(bad.replay.ok, 'replay passed a save that never showed th…
    4142|       expect(bad.emitted.ok, 'the artifact passed a save that never sh…
    4143|       expect(bad.replay.reason).toMatch(/Part A \$150/);
       |                                 ^
    4144| 
    4145|       const good = procedure(false);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a pick recorded as committing the highlight replays as a pick by name (round 62, fwsi13 03-create) > both runners pick the named option (the recorded target, a hidden native select, picks nothing)
```
AssertionError: http://127.0.0.1:38607/select-late: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4209:69
    4207|         const at = steps.map((st) => (st.tool === 'goto' ? { ...st, ar…
    4208|         const run = await both(at, 0);
    4209|         expect(run.replay.ok, `${url}: ${run.replay.reason ?? ''}`).to…
       |                                                                     ^
    4210|         expect(run.emitted.ok, `${url}: ${run.emitted.reason ?? ''}`).…
    4211|         await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a picker click whose target went with the picker its entry opened (round 59, fwsi10 03-create) > both runners click the day when the picker shows, and skip it when the picker is shut
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4365:56
    4363| 
    4364|       const open = await both(at(`${origin}/picker?open=1`), 0);
    4365|       expect(open.replay.ok, open.replay.reason ?? '').toBe(true);
       |                                                        ^
    4366|       expect(open.emitted.ok, open.emitted.reason ?? '').toBe(true);
    4367|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a click whose whole recorded effect was a removal (round 56, fwvk8 02-create) > both runners skip the hide when it is in effect, click it when not, and stop when the click leaves the lines
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4417:56
    4415| 
    4416|       const shut = await both(at(`${origin}/filters`), 0);
    4417|       expect(shut.replay.ok, shut.replay.reason ?? '').toBe(true);
       |                                                        ^
    4418|       expect(shut.emitted.ok, shut.emitted.reason ?? '').toBe(true);
    4419|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a click whose whole recorded effect was a removal (round 56, fwvk8 02-create) > a Save whose only recorded effect was its form closing is a write: clicked when open, a stop when the form is not there
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4469:56
    4467| 
    4468|       const open = await both(compiled, 0);
    4469|       expect(open.replay.ok, open.replay.reason ?? '').toBe(true);
       |                                                        ^
    4470|       expect(open.emitted.ok, open.emitted.reason ?? '').toBe(true);
    4471|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a click the app ignored once (round 57, fwgh12 03-publish) > both runners press again after a press that changed nothing, and stop when that does nothing either
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4517:52
    4515| 
    4516|       const ok = await both(compiled, 0);
    4517|       expect(ok.replay.ok, ok.replay.reason ?? '').toBe(true);
       |                                                    ^
    4518|       expect(ok.emitted.ok, ok.emitted.reason ?? '').toBe(true);
    4519|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a gesture the recording saw the page move after holds the next step (fwen6-luna) > held as recorded, both runners open the popover after the second refresh and read the rows
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4590:46
    4588|     it('held as recorded, both runners open the popover after the seco…
    4589|       const { replay, emitted } = await both(steps(1025), 0);
    4590|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    4591|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    4592|       expect(replay.outputs.matching_count).toBe('3 of 3');

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a gesture the recording saw the page move after holds the next step (fwen6-luna) > with no recorded move, both go on at once and meet the list the app emptied, as n2 did
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4600:46
    4598|     it('with no recorded move, both go on at once and meet the list th…
    4599|       const { replay, emitted } = await both(steps(), 0);
    4600|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    4601|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    4602|       expect(replay.outputs.matching_count).toBe('0 of 0');

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > echo is what an acted-on control still shows; the title is read as the title (fwec11) > both runners publish the display name as observed, and keep the picker, its live summary and the textbox as echoes
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4646:46
    4644|     it('both runners publish the display name as observed, and keep th…
    4645|       const { replay, emitted } = await both(steps(), 0);
    4646|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    4647|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    4648|       const want = { signed_in_user: 'Admin', time_range: 'Last 6 hour…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > echo is what an acted-on control still shows; the title is read as the title (fwec11) > both runners keep a re-rendered field, a combobox display and a live preview as echoes, and observe a saved row
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:4680:46
    4678|       ];
    4679|       const { replay, emitted } = await both(lab, 0);
    4680|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    4681|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    4682|       const want = { title_value: 'Bench title text', chosen: 'banana …

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > echo is what an acted-on control still shows; the title is read as the title (fwec11) > both runners read the live document title, not the recording’s
```
AssertionError: expected undefined to be 'EspoCRM Home' // Object.is equality

- Expected: 
"EspoCRM Home"

+ Received: 
undefined

 ❯ test/execution-parity.test.ts:4698:41
    4696|       fx.signin.title = 'EspoCRM Home';
    4697|       const emitted = await emittedOf(specOf(steps()));
    4698|       expect(replay.outputs.page_title).toBe('EspoCRM Home');
       |                                         ^
    4699|       expect(emitted.outputs['01-clear.page_title']).toBe('EspoCRM Hom…
    4700|     }, 120_000);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a read off its recorded element (round 62, fwgt13 02-create) > replay skips an inline heal onto the 'Add a link' button, as the artifact (which never heals) reads nothing there
```
AssertionError: expected 'Add a link' to be undefined

- Expected: 
undefined

+ Received: 
"Add a link"

 ❯ test/execution-parity.test.ts:5055:49
    5053|         const emitted = await emittedOf(specOf(steps('?button=1', fals…
    5054|         expect(replay.ok, replay.reason ?? '').toBe(true);
    5055|         expect(replay.outputs.assignee_applied).toBeUndefined();
       |                                                 ^
    5056|         expect(replay.warnings?.some((w) => /assignee_applied' resolve…
    5057|         expect(emitted.ok, emitted.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > recovery rungs > both runners reach a gone link’s recorded destination through another link to it, and go on
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5272:46
    5270|     it('both runners reach a gone link’s recorded destination through …
    5271|       const { replay, emitted, replayLog, emittedLog } = await both(op…
    5272|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5273|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5274|       expect(replayLog).toEqual(['visit:r7', 'mark:r7']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > recovery rungs > both runners navigate straight to a concrete recorded destination when no link to it is left
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5280:46
    5278|     it('both runners navigate straight to a concrete recorded destinat…
    5279|       const { replay, emitted, replayLog, emittedLog } = await both(op…
    5280|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5281|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5282|       expect(replayLog).toEqual(['visit:r7', 'mark:r7']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > recovery rungs > both runners pass a text wait whose text another recorded candidate already shows, and go on
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5306:46
    5304|     it('both runners pass a text wait whose text another recorded cand…
    5305|       const { replay, emitted, replayLog, emittedLog } = await both(he…
    5306|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5307|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5308|       expect(replayLog).toEqual(['mark:held']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a derived value the url never carried > both runners treat the unminted marker as a wildcard in a later url expectation, and go on
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5346:46
    5344|       const { skill, spec } = procedure(`${origin}/record/abc`);
    5345|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5346|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5347|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5348|       expect(replayLog).toEqual(['visit:abc', 'mark:abc']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners keep every record a loop body minted, in order
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5383:44
    5381|     ];
    5382|     const { replay, emitted, replayLog, emittedLog } = await both(step…
    5383|     expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                            ^
    5384|     expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5385|     expect(replayLog).toEqual(['visit:Item 1', 'visit:Item 2', 'visit:…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > false successes (notes/ROBUSTNESS.md) > neither runner reports a click on a disabled control as done
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /NOT dispatched: the control is disabl…/

- Expected: 
/NOT dispatched: the control is disabled/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:5426:29
    5424|       expect(replay.ok).toBe(false);
    5425|       expect(emitted.ok).toBe(false);
    5426|       expect(replay.reason).toMatch(/NOT dispatched: the control is di…
       |                             ^
    5427|       expect(emitted.reason).toMatch(/NOT dispatched: the control is d…
    5428|       // ...and both say so as an OUTCOME, carried on the error, not o…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > false successes (notes/ROBUSTNESS.md) > both runners click a button that is enabled shortly after load, once
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5444:46
    5442|     it('both runners click a button that is enabled shortly after load…
    5443|       const { replay, emitted, replayLog, emittedLog } = await both(ga…
    5444|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5445|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5446|       expect(replayLog).toEqual(['mark:approve']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > false successes (notes/ROBUSTNESS.md) > neither runner treats a different WORD route as a volatile url segment
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /expected url \S+\/outcome\/su…/outcome\

- Expected: 
/expected url \S+\/outcome\/success but browser is at \S+\/outcome\/failure/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:5504:29
    5502|       expect(emitted.ok).toBe(false);
    5503|       const said = /expected url \S+\/outcome\/success but browser is …
    5504|       expect(replay.reason).toMatch(said);
       |                             ^
    5505|       expect(emitted.reason).toMatch(said);
    5506| 

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > false successes (notes/ROBUSTNESS.md) > neither runner treats a different QUERY value as the same page
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /…/outcome\?result=success but browser is at \S+\

- Expected: 
/expected url \S+\/outcome\?result=success but browser is at \S+\/outcome\?result=failure/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:5520:29
    5518|       expect(emittedLog, 'the artifact must not mark on the failure pa…
    5519|       const said = /expected url \S+\/outcome\?result=success but brow…
    5520|       expect(replay.reason).toMatch(said);
       |                             ^
    5521|       expect(emitted.reason).toMatch(said);
    5522| 

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > observation dialects (notes/ROBUSTNESS.md finding 4) > both runners judge an untagged (dialect 1) step in dialect 1, and only in dialect 1
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5565:46
    5563|       const v1 = dialectProcedure('s_dialect1', [{ tool: 'goto', args:…
    5564|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5565|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5566|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5567|       expect(replayLog).toEqual(['mark:embed']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > observation dialects (notes/ROBUSTNESS.md finding 4) > both runners see a dialect-2 effect inside an iframe, and stop when it does not appear
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5598:46
    5596|       const ok = dialectProcedure('s_frame', steps('ok'));
    5597|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5598|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5599|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5600|       expect(replayLog).toEqual(['mark:embed']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > frame and page context (notes/ROBUSTNESS.md finding 5) > both runners press the in-frame Save, not the identical main-page one
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5648:46
    5646|       const ok = contextProcedure('s_frame_save', save('/frames'));
    5647|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5648|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5649|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5650|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > frame and page context (notes/ROBUSTNESS.md finding 5) > both runners follow a recorded popup and return to the opener
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5678:46
    5676|       const flow = contextProcedure('s_popup_flow', steps);
    5677|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5678|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5679|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5680|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > frame and page context (notes/ROBUSTNESS.md finding 5) > both runners follow the tab a Ctrl+click opened, which has no opener
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5701:46
    5699|       const flow = contextProcedure('s_ctrl_popup', steps);
    5700|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5701|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5702|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5703|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > frame and page context (notes/ROBUSTNESS.md finding 5) > both runners follow a popup compile credited from the page index alone
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5733:46
    5731|       const flow = contextProcedure('s_popup_credited', [{ tool: 'goto…
    5732|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5733|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5734|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5735|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw do nothing, replaced by a goto (round 59, fwop13) > both runners replay the goto, not the stranded second click
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5785:46
    5783|       };
    5784|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    5785|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5786|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5787|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners stop on a plain recorded change that neither the diff nor the page shows, before the next mutation
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /none of the 1 recorded page change\(s…/

- Expected: 
/none of the 1 recorded page change\(s\) appeared \(e\.g\. "- button \\"Revert\\""\)/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:5827:29
    5825|       expect(replay.ok).toBe(false);
    5826|       expect(emitted.ok).toBe(false);
    5827|       expect(replay.reason).toMatch(/none of the 1 recorded page chang…
       |                             ^
    5828|       expect(emitted.reason).toMatch(/the recorded page change did not…
    5829| 

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners pass a click whose query-shaped hash holds the recorded state in another order, with extra keys
- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners pass a goto whose query-shaped hash holds the recorded state in another order, with extra keys
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5863:46
    5861|       const { replay, emitted, replayLog, emittedLog } = await both(ha…
    5862| 
    5863|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    5864|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    5865|       expect(replayLog).toEqual(['mark:hash']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners stop a click whose query-shaped hash disagrees past the soft tolerance, before the next mutation
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /…/hash#action=7&cids=3&menu_id=8 but browser is at \S+\

- Expected: 
/expected url \S+\/hash#action=7&cids=3&menu_id=8 but browser is at \S+\/hash#action=9&cids=1&menu_id=4/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:5878:29
    5876|       // One verdict, one message: the live state is described sorted,…
    5877|       const said = /expected url \S+\/hash#action=7&cids=3&menu_id=8 b…
    5878|       expect(replay.reason).toMatch(said);
       |                             ^
    5879|       expect(emitted.reason).toMatch(said);
    5880|     }, 120_000);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners skip a toggle whose recorded popup is already showing, and still act inside it
```
AssertionError: replay must not toggle an open menu shut: expected [] to deeply equal [ 'archive:row' ]

- Expected
+ Received

- [
-   "archive:row",
- ]
+ []

 ❯ test/execution-parity.test.ts:5905:74
    5903|     it('both runners skip a toggle whose recorded popup is already sho…
    5904|       const open = await both(menuSteps('open'), 0);
    5905|       expect(open.replayLog, 'replay must not toggle an open menu shut…
       |                                                                          ^
    5906|       expect(open.emittedLog, 'the artifact must not toggle an open me…
    5907|       expect(open.replay.ok, open.replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners shut a picker the recording shut before re-opening it, and commit the carried tick (fwgt11)
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5969:58
    5967|       const fixed = await labelsRun(`${origin}/labels-picker`, { tookE…
    5968|       expect(fixed.skill.steps.filter((s) => s.closedBefore)).toHaveLe…
    5969|       expect(fixed.replay.ok, fixed.replay.reason ?? '').toBe(true);
       |                                                          ^
    5970|       expect(fixed.emitted.ok, fixed.emitted.reason ?? '').toBe(true);
    5971|       expect(fixed.replayLog, 'replay must commit the carried tick bef…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners commit bug,priority-high where Escape does not shut the picker and a reload follows, as on fwgt11's replays
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:5991:54
    5989|       // carried re-open kept "bug" pending until that reload dropped …
    5990|       const run = await labelsRun(`${origin}/labels-picker?escape=0`, …
    5991|       expect(run.replay.ok, run.replay.reason ?? '').toBe(true);
       |                                                      ^
    5992|       expect(run.emitted.ok, run.emitted.reason ?? '').toBe(true);
    5993|       expect(run.replayLog).toEqual(['commit:labels:bug', 'commit:labe…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners stop, never skip, when the closing click does not shut the picker
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /still showing after a closing click/

- Expected: 
/still showing after a closing click/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:6004:33
    6002|       expect(run.emitted.ok).toBe(false);
    6003|       const said = /still showing after a closing click/;
    6004|       expect(run.replay.reason).toMatch(said);
       |                                 ^
    6005|       expect(run.emitted.reason).toMatch(said);
    6006|     }, 180_000);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners skip a pick this run already applied, and commit bug,priority-high (fwgt12, rule A)
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6055:54
    6053|     it('both runners skip a pick this run already applied, and commit …
    6054|       const run = await pickRun(`${origin}/labels-picker`, { secondPic…
    6055|       expect(run.replay.ok, run.replay.reason ?? '').toBe(true);
       |                                                      ^
    6056|       expect(run.emitted.ok, run.emitted.reason ?? '').toBe(true);
    6057|       expect(run.replayLog).toEqual(['commit:labels:bug', 'commit:labe…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > control (i): a link of that name on the page from the start is not this run's pick — clicked as today, and the scoped read fails the step
```
AssertionError: replay must click the pick, not skip it: expected [ 'commit:labels:bug' ] to deeply equal [ 'commit:labels:bug', …(1) ]

- Expected
+ Received

  [
    "commit:labels:bug",
-   "commit:labels:priority-high",
  ]

 ❯ test/execution-parity.test.ts:6063:72
    6061|     it('control (i): a link of that name on the page from the start is…
    6062|       const run = await pickRun(`${origin}/labels-picker?furniture=1`,…
    6063|       expect(run.replayLog, 'replay must click the pick, not skip it')…
       |                                                                        ^
    6064|       expect(run.emittedLog, 'the artifact must click the pick, not sk…
    6065|       expect(run.replay.ok).toBe(false);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > control (ii): an item this run has not applied (unique at replay) is clicked
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6076:54
    6074|       // the second pick finds `link "bug"` in the picker alone and ti…
    6075|       const run = await pickRun(`${origin}/labels-picker`, { secondPic…
    6076|       expect(run.replay.ok, run.replay.reason ?? '').toBe(true);
       |                                                      ^
    6077|       expect(run.emitted.ok, run.emitted.reason ?? '').toBe(true);
    6078|       expect(run.replayLog).toEqual(['commit:labels:bug,priority-high'…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners fail, not skip, a read scoped to a value the procedure set that no match shows (fwgt12, rule B)
```
AssertionError: expected [] to deeply equal [ 'commit:labels:bug', …(1) ]

- Expected
+ Received

- [
-   "commit:labels:bug",
-   "commit:labels:priority-high",
- ]
+ []

 ❯ test/execution-parity.test.ts:6087:29
    6085|       // the applied labels finds "priority-high" alone.
    6086|       const run = await pickRun(`${origin}/labels-picker`, { secondPic…
    6087|       expect(run.replayLog).toEqual(['commit:labels:bug', 'commit:labe…
       |                             ^
    6088|       expect(run.emittedLog).toEqual(['commit:labels:bug', 'commit:lab…
    6089|       expect(run.replay.ok).toBe(false);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > both runners pick the recorded item by name, on the recorded list and on a shifted one (fwgt13)
```
AssertionError: kbd-picker: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6143:70
    6141|         const run = await kbdRun(`${origin}/${page}`, 'link "enhanceme…
    6142|         expect(run.skill.steps.map((s) => (s.tool === 'press' ? String…
    6143|         expect(run.replay.ok, `${page}: ${run.replay.reason ?? ''}`).t…
       |                                                                      ^
    6144|         expect(run.emitted.ok, `${page}: ${run.emitted.reason ?? ''}`)…
    6145|         expect(run.replayLog, page).toEqual(['commit:labels:enhancemen…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > step effects > neither runner publishes a record for a rejected create whose url part did not change
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6340:46
    6338|       expect(replayLog).toEqual([]);
    6339|       expect(emittedLog).toEqual([]);
    6340|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    6341|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    6342|       expect(replay.created, 'replay must not name /create/form\'s "fo…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > derived values across a second redirect > both runners bind the same value off a goto whose destination redirects once more
```
AssertionError: replay log: hop:start-5, hop:final-5, visit:final-5: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ test/execution-parity.test.ts:6392:66
    6390|       const replayMarks = entries(replayLog, 'mark');
    6391|       const emittedMarks = entries(emittedLog, 'mark');
    6392|       expect(replayMarks, `replay log: ${replayLog.join(', ')}`).toHav…
       |                                                                  ^
    6393|       expect(emittedMarks, `the artifact log: ${emittedLog.join(', ')}…
    6394|       expect(entries(emittedLog, 'visit')).toEqual(entries(replayLog, …

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > derived values across a second redirect > both runners bind the same value off a click whose destination redirects once more
```
AssertionError: replay log: : expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ test/execution-parity.test.ts:6392:66
    6390|       const replayMarks = entries(replayLog, 'mark');
    6391|       const emittedMarks = entries(emittedLog, 'mark');
    6392|       expect(replayMarks, `replay log: ${replayLog.join(', ')}`).toHav…
       |                                                                  ^
    6393|       expect(emittedMarks, `the artifact log: ${emittedLog.join(', ')}…
    6394|       expect(entries(emittedLog, 'visit')).toEqual(entries(replayLog, …

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > native controls and the portal combobox > both runners fall back to the recorded option value when the label misses
```
AssertionError: expected [] to deeply equal [ 'commit:code:b-2' ]

- Expected
+ Received

- [
-   "commit:code:b-2",
- ]
+ []

 ❯ test/execution-parity.test.ts:6440:25
    6438|       const { replay, emitted, replayLog, emittedLog } = await both(co…
    6439| 
    6440|       expect(replayLog).toEqual(['commit:code:b-2']);
       |                         ^
    6441|       expect(emittedLog).toEqual(['commit:code:b-2']);
    6442|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > native controls and the portal combobox > both runners deliver change to a number input, and the app commits the filled quantity
```
AssertionError: replay must commit 7, not the quantity the app last saw a change for: expected [] to deeply equal [ 'commit:qty:7' ]

- Expected
+ Received

- [
-   "commit:qty:7",
- ]
+ []

 ❯ test/execution-parity.test.ts:6450:97
    6448|       const { replay, emitted, replayLog, emittedLog } = await both(co…
    6449| 
    6450|       expect(replayLog, 'replay must commit 7, not the quantity the ap…
       |                                                                                                 ^
    6451|       expect(emittedLog, 'the artifact must commit 7, not the quantity…
    6452|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > native controls and the portal combobox > both runners re-read the option a step selected from the control it filled, as an echo that still publishes
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6490:46
    6488|       const { replay, emitted, replayLog, emittedLog } = await both(st…
    6489| 
    6490|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    6491|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    6492|       expect(replayLog).toEqual(['commit:fruit:banana x2']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > native controls and the portal combobox > both runners select on a portal-rendered ARIA combobox through the recipe, and the app commits the option
```
AssertionError: replay must choose the option the app sets on click: expected [] to deeply equal [ 'commit:fruit:banana x2' ]

- Expected
+ Received

- [
-   "commit:fruit:banana x2",
- ]
+ []

 ❯ test/execution-parity.test.ts:6504:80
    6502|       const { replay, emitted, replayLog, emittedLog } = await both(co…
    6503| 
    6504|       expect(replayLog, 'replay must choose the option the app sets on…
       |                                                                                ^
    6505|       expect(emittedLog, 'the artifact must choose the option the app …
    6506|       expect(replay.ok, replay.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > loops with a longer body > both runners run every step of a two-step body on every pass, judging the body step's own expectation
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6543:46
    6541|       const { replay, emitted, replayLog, emittedLog } = await both(ti…
    6542|       const all = ['tick:Item 1', 'note', 'tick:Item 2', 'note', 'tick…
    6543|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    6544|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    6545|       expect(replayLog).toEqual(all);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > loops with a longer body > both runners stop a two-step body on the pass whose own expectation fails
```
AssertionError: replay must stop at the refused tick, before its Note and the next record: expected [] to deeply equal [ 'tick:Item 1', 'note' ]

- Expected
+ Received

- [
-   "tick:Item 1",
-   "note",
- ]
+ []

 ❯ test/execution-parity.test.ts:6559:102
    6557|       const emittedLog = [...fx.log];
    6558| 
    6559|       expect(replayLog, 'replay must stop at the refused tick, before …
       |                                                                                                      ^
    6560|       expect(emittedLog, 'the artifact must stop at the refused tick, …
    6561|       expect(replay.ok).toBe(false);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > an unmeasurable fingerprint > both runners fall back to the url alone when the page cannot be fingerprinted in time, and refuse once it can
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6682:46
    6680| 
    6681|       expect(replay.similarity, 'replay must have failed to measure th…
    6682|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    6683|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    6684|       expect(replayLog).toEqual(['mark:rec-2']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > round 55: one page, one reading > both runners trim a text read, and fill a slotted line with the value normalised (fwkb39)
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6762:46
    6760|       const { skill, spec } = withParams(steps, { v1: { example: 'Read…
    6761|       const { replay, emitted } = await bothOf(skill, spec, { v1: 'Rea…
    6762|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    6763|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    6764|       expect(replay.outputs.column).toBe('Backlog');

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a fill whose document was replaced under its own check (round 56, fwvk8) > both runners refill a fill once when the page replaced its document before the fill was checked
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:6934:46
    6932|     it('both runners refill a fill once when the page replaced its doc…
    6933|       const { replay, emitted, replayLog, emittedLog } = await run('ec…
    6934|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    6935|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    6936|       expect(replayLog, 'replay must sign in once').toEqual(['commit:l…

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a value typed onto its own restored copy (round 57, fwec10) > both runners save the value once, clearing the restored copy before typing it
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7041:46
    7039|     it('both runners save the value once, clearing the restored copy b…
    7040|       const { replay, emitted, replayLog, emittedLog } = await run('');
    7041|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    7042|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7043|       expect(replayLog).toEqual(['commit:opportunity:12500']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a value typed onto its own restored copy (round 57, fwec10) > both runners stop, and save nothing, when the field ends up holding its value twice
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /holds the value it was given twice ov…/

- Expected: 
/holds the value it was given twice over \("1250012500" for "12500"\)/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:7054:29
    7052|       expect(replay.ok).toBe(false);
    7053|       expect(emitted.ok).toBe(false);
    7054|       expect(replay.reason).toMatch(/holds the value it was given twic…
       |                             ^
    7055|       expect(emitted.reason).toMatch(/holds the value it was given twi…
    7056|       expect(replayLog).toEqual([]);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a field the recording itself left holding its value twice (round 61, fwgr73) > both runners go on past the doubled field when the recording saw it doubled, and warn
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7079:46
    7077|     it('both runners go on past the doubled field when the recording s…
    7078|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    7079|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    7080|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7081|       expect(replayLog).toEqual(['commit:code:tagstags']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a click whose identifying rungs all miss (round 61, fwgr73 05-open) > (a) both runners skip the click as already in effect when everything it adds is showing, and save
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7129:46
    7127|     it('(a) both runners skip the click as already in effect when ever…
    7128|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    7129|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    7130|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7131|       expect(replayLog).toEqual(['commit:dashboard:saved']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a click whose identifying rungs all miss (round 61, fwgr73 05-open) > (b) both runners take a positional fallback whose element carries the recorded name
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7150:46
    7148|     it('(b) both runners take a positional fallback whose element carr…
    7149|       const { replay, emitted, replayLog, emittedLog } = await bothOf(…
    7150|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    7151|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7152|       expect(replayLog).toEqual(['commit:dashboard:saved']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a recorded change the action showed as it settled (round 60, fwop14) > both runners accept the row the Save showed as it settled, although it was renamed a moment later
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7192:46
    7190|     it('both runners accept the row the Save showed as it settled, alt…
    7191|       const { replay, emitted, replayLog, emittedLog } = await run('ur…
    7192|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    7193|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7194|       expect(replayLog).toEqual(['commit:row:rec-2 Bench Record']);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a recorded change the action showed as it settled (round 60, fwop14) > both runners still stop when the row never appears
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /did not show "- row \\"47 rec-2 Bench…/

- Expected: 
/did not show "- row \\"47 rec-2 Bench Record New\\"" as it did when recorded/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:7203:29
    7201|       expect(emitted.ok).toBe(false);
    7202|       const said = /did not show "- row \\"47 rec-2 Bench Record New\\…
    7203|       expect(replay.reason).toMatch(said);
       |                             ^
    7204|       expect(emitted.reason ?? '').toMatch(/the recorded page change d…
    7205|     }, 120_000);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a recorded row whose name this run’s value takes past the name cap (round 63, fwop17) > both runners find the row whose full name is past the cap
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7243:46
    7241|       expect(`47 ${LONG} New`.length).toBeGreaterThan(80);
    7242|       const { replay, emitted, replayLog, emittedLog } = await run('60…
    7243|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    7244|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7245|       expect(replayLog).toEqual([`commit:row:${LONG}`]);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a recorded row whose name this run’s value takes past the name cap (round 63, fwop17) > both runners still stop when no such row appears, however long the value
```
AssertionError: expected 'click failed: click NOT dispatched: n…' to match /did not show "- row .* as it did when…/

- Expected: 
/did not show "- row .* as it did when recorded/

+ Received: 
"click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]"

 ❯ test/execution-parity.test.ts:7253:29
    7251|       expect(replay.ok).toBe(false);
    7252|       expect(emitted.ok).toBe(false);
    7253|       expect(replay.reason).toMatch(/did not show "- row .* as it did …
       |                             ^
    7254|       expect(emitted.reason ?? '').toMatch(/the recorded page change d…
    7255|     }, 120_000);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a url part the producing step visited but did not end on (round 60, fwgh14) > both runners publish the id the producer visited, and the consumer acts on it
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7317:44
    7315|     it('both runners publish the id the producer visited, and the cons…
    7316|       const { first, second, published, replayLog, emitted, emittedLog…
    7317|       expect(first.ok, first.reason ?? '').toBe(true);
       |                                            ^
    7318|       expect(second.ok, second.reason ?? '').toBe(true);
    7319|       expect(emitted.ok, emitted.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a url part the producing step visited but did not end on (round 60, fwgh14) > both runners publish the visited id when the producer ends on another route with a part at that label (round 62, fwvk13)
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7355:44
    7353|       const emitted = await emittedFlowOf(spec);
    7354|       const emittedLog = [...fx.log];
    7355|       expect(first.ok, first.reason ?? '').toBe(true);
       |                                            ^
    7356|       expect(second.ok, second.reason ?? '').toBe(true);
    7357|       expect(emitted.ok, emitted.reason ?? '').toBe(true);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a url part the producing step visited but did not end on (round 60, fwgh14) > a record the producer backed out of for another is not the one published (control)
```
AssertionError: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7366:48
    7364|     it('a record the producer backed out of for another is not the one…
    7365|       const { published, replayLog, emitted, emittedLog } = await run(…
    7366|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
       |                                                ^
    7367|       const made = ids(replayLog, 'create');
    7368|       expect(made).toHaveLength(2);

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > both runners replay the goto to the link’s href, with no click that went nowhere and nothing that prepared one
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7435:46
    7433|       expect(steps.some((s) => s.tool === 'scroll_into_view' || s.tool…
    7434|       const { replay, emitted, replayLog, emittedLog } = await run(ste…
    7435|       expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                              ^
    7436|       expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7437|       await new Promise((r) => setTimeout(r, 300));

```

- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (delay-500)
- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (blur)
- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (clear-500)
- FAIL test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (submit)
```
AssertionError: click failed: click NOT dispatched: no element matched the target within 3s, so nothing was clicked. The page has moved on since this reference was taken (a re-render, a closed dialog, a control the app shows only in some state): take a fresh snapshot and click what is there now. [outcome: not dispatched]: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/execution-parity.test.ts:7489:48
    7487|       it(`both runners sign in once (${mode})`, async () => {
    7488|         const { replay, emitted, replayLog, emittedLog } = await both(…
    7489|         expect(replay.ok, replay.reason ?? '').toBe(true);
       |                                                ^
    7490|         expect(emitted.ok, emitted.reason ?? '').toBe(true);
    7491|         expect(replayLog).toEqual(['commit:login:admin:pass-x62']);

```
