# Benchmark history: rounds 24–32

Moved out of the top-level README. These are the four original targets (repair-desk, Kanboard,
Grafana, Odoo) through the convergence rounds 24–32. For where all ten targets stand now, see
[RESULTS.md](RESULTS.md); one row per sweep is in [SWEEPS.md](SWEEPS.md).

Two questions decide whether the tool earns its place. **First contact**: given a goal it has
never seen, how does sitelooper compare with the incumbents? **Every run after that**: once the
flow is known, what does repeating it cost, and does it stay correct? Success is always the
app-side verifier's count (mutation log, JSON-RPC or HTTP API state), never an arm's self-report.
All cells are cloud runs on identical hardware, one box per target. The one-page summary across
all ten targets is [RESULTS.md](RESULTS.md); full detail in
[MATRIX-SUMMARY.md](MATRIX-SUMMARY.md).

**Matrix 1 — first contact.** sitelooper: the latest green sweep of each target (rounds 29–32,
2026-09-18, builds c2652f4 → ab5de17; glm-5.3 orchestrator, deepseek-v4.1-flash inner pinned to
DeepSeek's backend with glm-5.3 escalation), with the set 28 cell it replaced in parentheses.
agent-browser: set 17, glm-5.3.

| target | sitelooper | agent-browser |
|---|---|---|
| repairdesk (in-repo SPA) | **6/6** · $0.08 · 396s (fwrd77 on c2652f4; set 28: 7/7 on the older 7-objective task · $0.07 · 1212s) | 6/6 · $0.19 · 67s |
| kanboard (PHP, drag-and-drop) | **6/6** · $0.07 · 320s (fwkb33 on f10415a; set 28: 6/6 · $0.21 · 1078s) | **2/6 (turn-cap)** · $0.77 · 118s |
| grafana (React SPA) | **6/6** · $0.10 · 801s (fwgr62 on c2652f4; set 28: 6/6 · $0.14 · 1381s) | 6/6 · $1.05 · 448s |
| odoo (dense CRUD) | **6/6** · $0.11 · 482s (fwod73 on ab5de17; set 28d: 6/6 · $0.38 · 1451s) | 6/6 · $1.51 · 302s |
| atelyr (private React app, local) | 2/2 checkable · $0.76 · 2557s (set 28e; set 28: 6 reported, 2/2 checkable · $1.43 · 3043s) | — |

On first contact sitelooper is still the slowest arm on every target, by design: it drives a
cheap inner model and spends the extra time recording verified locators, value provenance and
effect expectations. The gap has narrowed since set 28 (recordings now take 1.6–6× agent-browser's
wall clock, down from 3–18×) and the cost lead has widened: 2–14× cheaper on every target, a 24/24
objective record including the board that turn-capped agent-browser at 2/6, and the recording
that makes Matrix 2 exist.

**Matrix 2 — every run after the first.** The same four flows repeated: sitelooper replays (the
two zero-orchestrator replays of each Matrix 1 recording, against a reset app) against re-running
the agent, against a Playwright script the agent authored from its own run, against literal
codegen from the recording, and against **Tier 2 spec** — the same recording compiled by
`sitelooper compile` into a standalone `@playwright/test` spec with no sitelooper runtime in the
loop at all, then replayed under the real Playwright test runner (`bench/spec-replay.mjs`).

| target | sitelooper replay (r1, r2) | agent re-run | authored script | codegen | Tier 2 spec |
|---|---|---|---|---|---|
| repairdesk | **6/6, 6/6** · $0.00, $0.00 · 31s, 31s (fwrd77 on c2652f4; all eight steps at tier A, zero model turns, no re-pins; set 31 on the older 6-step recording: 25s, 25s) | 6/6 · $0.19 · 67s every time | 1/6, 1/6 · $0 | 6/6, 6/6 · $0 | **6/6** · $0.00 · 35s (fwrd77; 1/1 passed, 0 drift; set 31: 15s, 15s) |
| kanboard | **6/6, 6/6** · $0.00, $0.00 · 28s, 28s (fwkb33 on f10415a; all six steps at tier A, zero turns, no re-pins; the replay now writes the report the two report-based objectives need; set 31: 4/4 checkable · 27s, 27s) | 2/6 · $0.77 · 118s every time | 5/6, 5/6 · $0 | 4/4 (+2 n/a) · $0 | **4/6** · $0.00 · 25s (fwkb33; 1/1 passed, 0 drift; objectives 1 and 6 unverifiable by design, the spec arm writes no finalText; set 31: 15s, 14s) |
| grafana | **6/6, 6/6** · $0.00, $0.00 · 76s, 77s (fwgr62 on c2652f4; all six steps at tier A, zero turns, no re-pins; set 31: 54s, 54s) | 6/6 · $1.05 · 448s every time | 0/6, 0/6 · $0 | 0/6, 0/6 · $0 | **4/6** · $0.00 · 77s (fwgr62; 1/1 passed, 0 drift; objectives 1 and 6 unverifiable by design; set 31: 33s, 33s) |
| odoo | **6/6, 6/6** · $0.00, $0.00 · 62s, 62s (fwod73 on ab5de17; all seven steps at tier A, **zero model turns**, no re-pins; set 31 on fwod34r3 was model-bound at 787s, 556s and 40, 39 turns) | 6/6 · $1.51 · 302s every time | 1/6, 1/6 · $0 | 0/6, 0/6 · $0 | **6/6** · $0.00 · 55s (fwod73; 1/1 passed, 0 drift; set 31: 79s, 79s) |
| atelyr | 12/12 flow steps · $0.13, $0.43 · 710s, 1002s (set 28e; 114 then 134 model turns; nine of twelve steps at zero turns on the second replay, the three re-pinned steps among them) | — | — | — | not yet run |

**Rounds 29–32 (c2652f4 → ab5de17), the current build.** These cells come from the convergence
sweeps, which differ from set 31 in one important way: set 31 replayed the same old recordings
on every build, while a round records the flow fresh (Matrix 1), replays it twice with no
orchestrator (Matrix 2) and compiles it once, all on one box from one sweep. A target counts as
green when every verifier objective passes on the recording and both replays, every replayed step
runs at tier A with zero model turns, and the compiled spec compiles and passes with the same
verifier (report-only objectives are unverifiable for the spec arm). Repairdesk and grafana were
green in rounds 28 and 29, kanboard in 28, 29 and 30, and odoo in 31 and 32, after which the sweep
loop stopped. Odoo is the row that moved: its replays no longer fall back to the model at all,
so they run in 62s instead of 556–787s. Repairdesk's and grafana's clocks are higher than set 31
because the recorded flows are longer (repairdesk now signs in and reports, eight steps against
six), not because any step waited on a model. Rules A–Q in `src/daemon/server.ts`,
`src/skills/flow.ts` and `src/execution/browser.ts` are the fixes those rounds added; four of
them (a recovery's skill gets reads for referenced values, a pin past its start mid-chain is
moved, a blocked create and its save merge into one adopted step, and a click on an absent target
is refused in 3s) were committed after the last round whose recording met odoo's product
configurator modal, so they are unit-tested but not yet exercised by a cloud run.

| target | recording (first contact) | sitelooper replay r1, r2 | verifier | compiled spec | agent-browser, every run |
|---|---|---|---|---|---|
| repairdesk | 6/6 · $0.08 · 396s | **31s, 31s** · 0 turns · $0 | 6/6, 6/6 | 6/6 · 35s · 0 drift | 6/6 · $0.19 · 67s |
| kanboard | 6/6 · $0.07 · 320s | **28s, 28s** · 0 turns · $0 | 6/6, 6/6 | 4/6 (+2 report-only) · 25s · 0 drift | 2/6 · $0.77 · 118s |
| grafana | 6/6 · $0.10 · 801s | **76s, 77s** · 0 turns · $0 | 6/6, 6/6 | 4/6 (+2 report-only) · 77s · 0 drift | 6/6 · $1.05 · 448s |
| odoo | 6/6 · $0.11 · 482s | **62s, 62s** · 0 turns · $0 | 6/6, 6/6 | 6/6 · 55s · 0 drift | 6/6 · $1.51 · 302s |

Read across a row: the recording is the first-contact run that produced the flow, the replay is
the daemon re-running it with no orchestrator, the compiled spec is the same recording under
plain Playwright with no sitelooper runtime and no model at all, and agent-browser is what it
costs to have an agent do the task again from scratch. Every replay on every target now runs at
zero model turns and zero cost, beating agent-browser on wall clock by 2.2× (repairdesk), 4.2×
(kanboard), 5.9× (grafana) and 4.9× (odoo); the compiled specs beat it by 1.9×, 4.7×, 5.8× and
5.5×. Raw files for these cells are on the `results/fwrd77-o4ivwd`, `results/fwkb33-8ryhlw`,
`results/fwgr62-e3so3m` and `results/fwod73-h60311` branches (sweep table, both flowruns, the
compiled spec, its Playwright report and every verifier log).

**Tier 2 spec, status.** `bench/spec-replay.mjs` compiles a published flow + skill store
(`sitelooper compile <flow> --out <tmp>` with `SITELOOPER_SKILLS_DIR` pointing at the store) and
runs the emitted `<name>.spec.ts` under `npx playwright test`, scored by the same app-side
verifiers as every other arm (`<tag>-spec-result.json`, `arm: "spec"`). Repairdesk ran locally
(`fwrd42` store/flowrun, verified 6/6 with the clean-run mutation log); kanboard, grafana, and
odoo ran on the bench's cloud environment across sets 1-8, with results published to
`origin/results/sp<N><target>` branches (`sp3kb`, `sp7gr`, `sp8od`, `sp11od`). Kanboard's compiled
spec passed 4/4 checkable objectives on both runs and repair converged with 0 tickets. Grafana's
compiled spec ran 1/1 with 0 drift on both runs (verifier 4/6, the other two objectives
unverifiable by design since the spec arm writes no report) and repair converged in two rounds
to a spec that still passes and still scores 4/6. Odoo's compiled spec passes end to end on the
cloud (`sp11od`, f838bec): 1/1 with 0 drift and 6/6 on both runs in 78s each, repair 9/9 at tier
A on all three runs with nothing to change and its spec check passing, and the repaired spec
1/1 and 6/6 again. That took eight sets of emitter fixes (`sp8od` verified 6/6 but the test
halted at 08-open) and then one `sitelooper rerecord` of 08-open, whose recording asked to cancel
an order 06-open had already cancelled: the step is now pinned to 07-open's validated read-only
status check, which the store lets two steps share.

Set 24 also caught two engine regressions of its own (kanboard's replays at 22 and 37 turns
where set 15 needed none; grafana's replays losing objective 1 and recovering one step at 19 and
44 turns). Every cause was a testable engine rule — a clock-stamped textbox name in an
expectation, a trailing space in an identity marker, an expectation-only value promoted to a
required parameter, a heading that renders only on scroll — and all are fixed on build f727c89.
The clean A/B is to replay the same set-24 flows and stores on the fixed build (set 24b):

| target | set 24 replays (b9ccbca) | set 24b replays (f727c89) |
|---|---|---|
| kanboard | 22 and 37 turns · 272s, 555s | **0 and 0 turns · 56s, 56s** · 4/4 app-state objectives both |
| grafana | 4/6, 5/6 · 19 and 44 turns | **6/6, 6/6** · 29 and 44 turns · 151s, 272s on 08cf104, with the same recording's flow re-exported by the fixed engine (one export rule needed that) and paired with its replay-refined store |
| odoo (set 26 recording) | 6/6, 6/6 · 91 and 35 turns | **6/6 · 31 turns · 213s** on 6ad5cde with the same pairing; the rest is the app's own url state varying between runs |

The grafana row shows the shape of most of this work: the set-24 grafana
cell as recorded was 4/6 and 5/6, and each miss was a rule in the engine
(a read discounted as an echo of a recorded scroll; a flow that referenced
a typed value as another step's output). Fixing the rules and re-exporting
the same recording gives 6/6 on both replays. Fresh recordings since then
(fwgr24, fwgr25, fwgr26) each added a rule of the same kind — an accidental
"Discard changes?" dialog, a dialog opened and cancelled, transient status
and alert lines — until fwgr26 compiled clean and instead lost every replay to an
error page. Five runs were spent finding out why: the sign-in skill carried
a recorded stray click on a `target=_blank` link to grafana.com, the box has
no network, the new tab landed on a browser error page, and the daemon
adopted that tab as the page to work on. The replay now keeps its page
whatever tabs open, a tab that lands on an error page is closed, and a
fallback that resolves to a link leaving the recorded origin is never
taken. Full detail, including the
runs that did not work, is in [MATRIX-SUMMARY.md](MATRIX-SUMMARY.md).

Reading it: static scripts are free and mostly wrong; re-running the agent is reliable and costs
the full price forever; sitelooper's repeat cost trends to zero without the correctness trending
anywhere, and where it does not, the cause has so far always been a specific engine rule rather
than the app.
