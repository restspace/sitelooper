# r81 parity verification

**Verdict: PASS** — step 2 printed a summary with 0 failures; main comparison (step 3) not needed.

- Commit: 57b71c4e compile: a read's kind, a wait's state and other control args are never slotted (restoreControlArgs present in src/skills/store.ts)
- Chromium: Playwright 1.61.1, revision 1228 (/opt/pw-browsers/chromium-1228, installed via playwright install)
- Command: BP_PARITY_TESTS=1 timeout 2700 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=1 --reporter=verbose
- Exit code: 0
- Summary: Test Files 1 passed (1); Tests 204 passed (204)
- Wall time: ~2042 s (vitest Duration 2038.65s)
- free -m (used MB): start 473 (fresh box); at ~9 min 3526; ~18 min 6098; ~27 min 8208 (of 16094 total); after run 575. Memory grew steadily through the run and was released at exit (no hang).
- Last test started without finishing: none
- Failing tests: none
- Note: run took ~34 min, so the earlier 25/30-minute attempts were likely killed just before completion rather than hung.

## Last 40 lines of parity-branch.log
```
[sitelooper step] 01-create

stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a url part the producing step visited but did not end on (round 60, fwgh14) > a record the producer backed out of for another is not the one published (control)
[sitelooper step] 02-open

 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a url part the producing step visited but did not end on (round 60, fwgh14) > a record the producer backed out of for another is not the one published (control) 12354ms
 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > both runners replay the goto to the link’s href, with no click that went nowhere and nothing that prepared one 11207ms
stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > control: a goto somewhere other than the link’s href keeps the clicks, and both runners stop alike
[sitelooper warn] 01-clear s_parity/2: recorded url http://127.0.0.1:46471/proj2-list is the page the clicked link left (captured before its navigation committed); the click went where the link points, http://127.0.0.1:46471/proj2/bench — accepted

stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > control: a goto somewhere other than the link’s href keeps the clicks, and both runners stop alike
[sitelooper drift] 01-clear s_parity/3 target: none of 2 recorded locators resolved; navigated to the step's recorded destination instead (http://127.0.0.1:46471/proj2-list)

 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > control: a goto somewhere other than the link’s href keeps the clicks, and both runners stop alike 15361ms
stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > control: a hover whose menu the procedure then used is kept, with the clicks, and both runners agree
[sitelooper warn] 01-clear s_parity/2: recorded url http://127.0.0.1:46471/proj2-list is the page the clicked link left (captured before its navigation committed); the click went where the link points, http://127.0.0.1:46471/proj2/bench — accepted

stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > control: a hover whose menu the procedure then used is kept, with the clicks, and both runners agree
[sitelooper drift] 01-clear s_parity/3 target: none of 2 recorded locators resolved; navigated to the step's recorded destination instead (http://127.0.0.1:46471/proj2-list)

stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > control: a hover whose menu the procedure then used is kept, with the clicks, and both runners agree
[sitelooper warn] step 01-clear s_parity/6: the recorded dialog "Archive" did not open — conditional UI, treated as absent; steps that name one of its controls will be skipped

 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > link clicks the recording saw go nowhere, by its evidence (round 61, fwop15) > control: a hover whose menu the procedure then used is kept, with the clicks, and both runners agree 21805ms
 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (delay-500) 11124ms
 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (blur) 10899ms
 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (clear-500) 9244ms
stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (submit)
[sitelooper warn] 01-clear s_parity/6: after 01-clear s_parity/6 expected url http://127.0.0.1:46471/signed-in but browser is at http://127.0.0.1:46471/reload-login/submit — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill

stdout | test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (submit)
[sitelooper warn] 01-clear s_parity/6: 2 field(s) this procedure filled were empty again before this click (the page replaced its document after the fills ran) — refilled once

 ✓ test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > a sign-in whose page reloads or clears around the submit (round 62, fwvk13) > both runners sign in once (submit) 18904ms

 Test Files  1 passed (1)
      Tests  204 passed (204)
   Start at  15:15:18
   Duration  2038.65s (transform 39.81s, setup 0ms, collect 4.96s, tests 2032.36s, environment 0ms, prepare 108ms)
```
