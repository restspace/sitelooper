# sitelooper

**Author a browser test with an agent; verify and run the compiled test with plain Playwright.**

sitelooper is a Playwright CLI with an LLM agent inside it. You give it one instruction at a
time - "sign in as ops@example.com, create a ticket titled 'k7 Bench' and report its id" - and it
works the live browser for you, then hands back one structured, verified result. Nothing about
selectors, waits, dialogs or quoting reaches you or the outer agent that is calling it.

With `--learn`, every instruction that succeeds is compiled into a **stored procedure**, and a whole session can be exported as a **flow**. The next time the same job runs,
sitelooper replays the procedure deterministically — no model call, no tokens — and calls the
model only for a step the app has changed underneath. On the benchmark below, a converged flow
replays a seven-step ticket workflow in 17 seconds for $0.00, verified against what the app's own
database says happened.

> Package and command are both `sitelooper`. State lives under `~/.sitelooper/`, env vars are
> `SITELOOPER_*`. The project was previously called `sleep-walker`, and `browser-pilot` before
> that; the old env-var prefixes and home directories still work as aliases, but the old command names do not.

## Why agent-driven browser automation does not rerun, and what sitelooper does about it

Ask any browser agent to do a job and it will, mostly. Ask it to do the same job tomorrow and you'll
be paying the price again: the model re-reads every page, re-decides every click, and costs
$1–1.50 per run on a dense app. The obvious fix - have the agent write a script from what it did -
doesn't work. The reasons are structural, and can't be fixed with a better prompt:

- **The run's own values are baked in.** The record it created has an id, the url has a uid, the
  title carries a run marker. A script quotes them literally, so on the next run it opens
  yesterday's record — or, worse, works a *different* record to completion and reports success.
- **The page changes every time.** Ids in class names, positional selectors
  (`tr:nth-of-type(3)`), a textbox named after the current minute, a heading that renders only
  after a scroll. What the agent clicked was right once; the selector it left behind names a
  position, not a thing.
- **The agent's waits were implicit.** Every observation turn was a pause the app needed. A
  script has no turns, so it runs ahead of a list that refetches a second later.
- **Nobody checks the effect.** A click can "succeed" on the wrong element. A save can be refused
  by a dialog the script never saw. Codegen replays report green while the database is untouched;
  in this benchmark the strongest static script verified 14 of 48 objectives and confirmed an
  empty sales order.

sitelooper's answer is to treat the recording as evidence to compile, not text to replay:

- **Durable locators with fallbacks.** Each action stores a chain of candidates — role and name,
  label, test id, a structural path last — and records which ones actually resolved on each replay,
  so a volatile candidate is retired by measurement, not by guesswork. A click on a table row is
  retargeted to the record's own link, whose name is its identifier. Each chain ends with where
  the element was: its box and the viewport. That box is the yardstick a positional guess is
  measured against, and, when every name has failed, the element at that point is taken as a last
  candidate only if it is the same kind of control. A locator, never a blind click.
- **Parameters, not literals.** Values you typed become slots. Values you *declared* (`var
  runid=k7`) become `{{runid}}`. A value one step read back and a later step used becomes
  `{{step.output}}`, threaded live between steps. A record id that first appeared in a url after a
  save is recognised as minted by this run and re-read from the browser on replay. What cannot be
  threaded is left blank and sent to recovery — never guessed.
- **Effect gates.** Every step records what changed on the page when it ran. On replay a step that
  ran but did not produce its recorded effect — the new title never appeared as a heading, an alert
  the recording never saw — stops the replay before the next step acts on the wrong state. An
  identity guard refuses to run a procedure on a page showing a different record than the one it
  was asked for.
- **Built for single-page apps.** The agent's observation turns were implicit waits; a replay has
  none, so every step first lets the DOM go quiet, and a navigation is given time to hydrate before
  its effects are checked. A click recorded to open a popup is skipped when that popup is already
  showing, because on a React toggle the same click would close it. A click that changed nothing
  at all while the recording shows an effect is retried once after the page settles. A fallback
  locator that resolves to a link leaving the app's origin is never taken.
- **A ladder, not a cliff.** Per step: replay the pinned procedure with zero model calls; if it
  cannot, recover on a cheap model with the partial replay in hand; escalate to the strong model
  only if that reports blocked; halt with per-step state only if that fails too. A recovery that
  validates is compiled and **re-pinned into the flow**, so a flow heals itself over runs.
- **Honest reports.** A replayed step reports only values it read back live or that came from your
  parameters. A value the recording captured as a literal is struck, never echoed from memory.
- **Nothing app-specific in the tool.** No selectors, gestures or workflow assumptions for any app
  live in sitelooper. App knowledge goes in a per-session briefing you supply; every mechanism
  above is described in terms any web app satisfies. This is the design boundary that keeps a fix
  for one app from being a hack for it.

## Getting started

Requires Node 20+, a browser, and an API key for authoring. The compiled tests need only
`@playwright/test` and its browser installation; no Sitelooper daemon or model runs in CI.

```sh
npm install -g sitelooper
npm install -D @playwright/test
npx playwright install chromium
sitelooper config set provider openai
# Set OPENAI_API_KEY in your shell, then:
sitelooper doctor
sitelooper init
```

Record one logical outcome per instruction. App briefings are optional. Use `{{env:NAME}}` for
credentials, set before starting the session, and declare values that should vary between runs.

```sh
sitelooper --session ticket --learn open http://localhost:3000
sitelooper --session ticket var runid=demo
sitelooper --session ticket do "Sign in as {{env:TEST_USER}} using {{env:TEST_PASSWORD}} and verify the dashboard opens"
sitelooper --session ticket do "Create a ticket titled 'demo Test'; verify it appears and report its id"
sitelooper --session ticket stop --save-flow ticket
sitelooper flow export ticket --out .sitelooper/procedures.json
```

Configure fresh test data in your Playwright fixtures or supply a reset command. Then build the test:

```sh
sitelooper build ticket --var runid=test-{n} --reset-cmd "npm run reset:e2e"
# If your Playwright fixtures already prepare fresh data:
# sitelooper build ticket --var runid=test-{n} --fixture-isolation
npx playwright test tests/sitelooper/ticket.spec.ts
```

The generated `ticket.flow.ts` contains the procedures, typed input/output API, named Playwright
steps, and effect checks. `ticket.spec.ts` is yours to add business assertions and fixture imports to.
Compilation preserves it. Each run has its own drift state, which the scaffold attaches to the
Playwright report even when a step fails. Recompile an existing flow to update its generated half;
existing user scaffolds remain intact and can adopt the new API manually.

### Readiness means executing the emitted code

`build <flow-or-bundle>` compiles and runs the readiness gate. `check <name.flow.ts> --ready` runs
the same gate on an existing artifact. Plain `compile` remains an offline operation, and plain
`check` runs the spec once. Compilation alone never claims readiness.

The default gate requires three clean executions, with retries disabled. Every run starts from
state prepared by the reset command or the fixtures you explicitly declared. Parameterized flows
must use at least two distinct datasets (`{n}` becomes `1`, `2`, `3`). Every required flow step must
complete, with no skipped tests, already-satisfied shortcuts, unresolved actions, or locator drift.
The checker uses your actual Playwright config, project and relative fixture imports. Use `--config`
and `--project` to select them. `--isolated` is a separate compiler smoke test and cannot earn readiness.

Evidence is written to `<name>.readiness.json`, including the artifact hash, individual run verdicts,
and distinct dataset count. The states are `compiled` and `spec-verified`; failures distinguish
`blocked`, `unavailable`, and `failed`. A missing browser, dependency, or failed reset exits nonzero.
Three clean runs establish an execution gate, not a statistical guarantee against flakiness.

Failure detection is a separate label. Supply `--negative-spec tests/ticket-fault.spec.ts` for an
explicitly authored test that injects a known fault and asserts the intended outcome assertion fails.
That test must pass to report `failureDetection: verified`. Omitting it reports `not-configured`;
a configured negative test that fails reports `failed` and a nonzero exit while preserving the
independent `executionVerified` result from the normal runs.
See [project fixtures and negative checks](docs/testing-workflow.md).

### Portable project configuration

`sitelooper init` creates `sitelooper.config.json`. The nearest ancestor config supplies defaults;
relative paths resolve from its directory and CLI flags override them.

```json
{
  "targetUrl": "http://localhost:3000",
  "vars": { "runid": "test-{n}" },
  "requiredVars": ["runid"],
  "resetCommand": "npm run reset:e2e",
  "playwright": { "config": "playwright.config.ts", "project": "chromium" },
  "verificationRuns": 3,
  "outputDir": "tests/sitelooper",
  "snapshotFile": ".sitelooper/procedures.json"
}
```

`targetUrl` overrides the entry URL of new scaffolds through `SITELOOPER_TARGET_URL`. It may also be
a relative path resolved against Playwright's `baseURL`; recorded absolute navigations remain as
recorded. `fixtureIsolation: true` declares fixture-managed fresh data instead of a reset command.
`negativeSpec` can store the optional failure-detection spec path. Never put credentials in this file.

`flow export` bundles the flow and its pinned procedures so another machine can compile without
your user-level skill store. Commit the bundle, config and generated files when reproducible
compilation is needed. Browser profiles and credentials remain outside the bundle. A bundle path
can be passed directly to `compile` or `build`, or resolved by flow name from `snapshotFile`.

### Repair once, review, apply

When a compiled spec fails or reports locator drift, make a repair proposal:

```sh
sitelooper repair tests/sitelooper/ticket.flow.ts --propose ticket-repair.json \
  --var runid=repair-{n} --reset-cmd "npm run reset:e2e"
sitelooper repair apply ticket-repair.json
```

Proposal creation performs a live triage run, convergence runs (default one), then a plain Playwright
check of a staged candidate beside your original spec, preserving fixture imports. It saves the
candidate, change list, verification and execution count without replacing the original flow.
Review those artifacts before applying. Apply writes the exact checked source without rerunning the
browser, and refuses failed/drifted verification or a changed source, candidate or user spec.
The user-owned `.spec.ts` is never rewritten. Proposal verification is one compiled-spec execution;
run `check --ready` after applying when you need the full readiness evidence.

Direct `repair <file>` still writes its result and now checks the emitted spec by default. A failed
check leaves the diff available and exits nonzero. `--no-check-spec` explicitly opts out of checking.
`--dry-run` previews file changes but still executes against the app; it is not an offline preview.
If a diagnostic identifies a bad recording, use its `rerecord <flow> <step>` action instead.
Repair refuses dropped expectations.

`rerecord` accepts a flow JSON, a portable bundle, or a generated `.flow.ts`. Self-contained
artifacts are re-recorded in an isolated procedure store and updated only when the requested step
earns a clean replay. Failed attempts preserve the original bundle/compiled file and keep the
staged evidence for inspection. The sibling user spec remains untouched.

Compilation has two separate override flags: `--allow-demoted` permits a diagnosed demoted procedure;
`--overwrite-spec` replaces the user scaffold. Neither implies the other. The old combined `--force`
is rejected with migration guidance.

### Calling from another agent

Use `--json` for versioned authoring, compile, check and repair results. Existing result fields remain
available alongside `schemaVersion`, `stage`, `outcome` and `nextActions`. Next actions use a command
and argument array, avoiding shell-command parsing. Progress goes to stderr. For multiline instructions:

```sh
sitelooper --session ticket do --instruction-file tests/create-ticket.md --json
# Or pipe text into: sitelooper --session ticket do --stdin --json
```

Exit codes: `0` success, `1` agent/recording failure, `2` invalid input or validation unavailable,
`3` replay convergence failure, `4` compiled-spec/readiness failure. A green single `check` is a
passing execution; only a successful readiness gate is `spec-verified`.

Raw `--script` / `script` remains available for exploratory action exports. For committed tests,
use the learned-flow build workflow above. Run `sitelooper --help` for the full command reference.

## Current matrix

Two questions decide whether the tool earns its place. **First contact**: given a goal it has
never seen, how does sitelooper compare with the incumbents? **Every run after that**: once the
flow is known, what does repeating it cost, and does it stay correct? Success is always the
app-side verifier's count (mutation log, JSON-RPC or HTTP API state), never an arm's self-report.
All cells are cloud runs on identical hardware, one box per target; full detail in
[bench/MATRIX-SUMMARY.md](bench/MATRIX-SUMMARY.md).

**Matrix 1 — first contact.** sitelooper: set 26 (2026-09-03, build e048128; glm-5.3
orchestrator, deepseek-v4-flash inner with glm-5.3 escalation). agent-browser: set 17, same era,
glm-5.3.

| target | sitelooper | agent-browser |
|---|---|---|
| repairdesk (in-repo SPA) | 7/7 · $0.07 · 1212s (set 28; set 26: 7/7 · $0.09 · 819s) | 6/6 · $0.19 · 67s |
| kanboard (PHP, drag-and-drop) | 6/6 · $0.21 · 1078s (set 28; set 26: 6/6 · $0.04 · 385s) | **2/6 (turn-cap)** · $0.77 · 118s |
| grafana (React SPA) | 6/6 · $0.14 · 1381s (set 28; set 26: 6/6 · $0.48 · 2037s) | 6/6 · $1.05 · 448s |
| odoo (dense CRUD) | 6/6 · $0.38 · 1451s (set 28d; set 26: 6/6 · $0.59 · 1651s) | 6/6 · $1.51 · 302s |
| atelyr (private React app, local) | 2/2 checkable · $0.76 · 2557s (set 28e; set 28: 6 reported, 2/2 checkable · $1.43 · 3043s) | — |

On first contact sitelooper is the slowest arm on every target, by design: it drives a cheap
inner model and spends the extra time recording verified locators, value provenance and effect
expectations. What that buys is the lowest cost on every target (2–19× cheaper), a 25/25 objective
record including the board that turn-capped agent-browser at 2/6, and the recording that makes
Matrix 2 exist.

**Matrix 2 — every run after the first.** The same four flows repeated: sitelooper replays (set
24, two replays each) against re-running the agent, against a Playwright script the agent authored
from its own run, against literal codegen from the recording, and against **Tier 2 spec** — the
same recording compiled by `sitelooper compile` into a standalone `@playwright/test` spec with no
sitelooper runtime in the loop at all, then replayed under the real Playwright test runner
(`bench/spec-replay.mjs`).

| target | sitelooper replay (r1, r2) | agent re-run | authored script | codegen | Tier 2 spec |
|---|---|---|---|---|---|
| repairdesk | **7/7, 7/7** · $0.00, $0.00 · 25s, 25s (set 31, m4rd on d28346a; every step at tier A, zero model turns; set 30 on a7f0c6e: 55s, 55s before the late-navigation fix; set 28: 24s, 23s) | 6/6 · $0.19 · 67s every time | 1/6, 1/6 · $0 | 6/6, 6/6 · $0 | **6/6, 6/6** · $0.00 · 15s, 15s (set 31, m4rd; 0 drift; repair converged with 4 candidate promotions, spec check passed in 14s; repaired spec 6/6 in 14s) |
| kanboard | **4/4 checkable, same** · $0.00, $0.00 · 27s, 27s (set 31, m4kb on d28346a; all five steps at tier A, zero turns; two objectives are report-based and a zero-model replay writes no report; set 30: 45s, 45s; set 28: 23s, 23s) | 2/6 · $0.77 · 118s every time | 5/6, 5/6 · $0 | 4/4 (+2 n/a) · $0 | **4/4 checkable, same** · $0.00 · 15s, 14s (set 31, m4kb; 0 drift; repair converged with no change, spec check passed in 13s; repaired spec 4/4 in 14s) |
| grafana | **6/6, 6/6** · $0.00, $0.00 · 54s, 54s (set 31, m4gr on d28346a; every step at tier A, zero model turns; set 30: 79s, 79s; set 28: 47s, 47s) | 6/6 · $1.05 · 448s every time | 0/6, 0/6 · $0 | 0/6, 0/6 · $0 | **4/6, 4/6** · $0.00 · 33s, 33s (set 31, m4gr; 0 drift; objectives 1 and 6 unverifiable by design, the spec arm writes no finalText; repair converged with 6 changes: 3 promotions, 1 model-proposed heading locator, 2 never-hit point candidates retired; spec check passed in 33s; repaired spec 4/6 in 34s) |
| odoo | **6/6, 6/6** · $0.02, $0.01 · 787s, 556s (set 31, m4od2 on d28346a, flow fwod34r3; model-bound, so the click-wait fix barely shows: 06-open fell back to the model on both replays, 24 then 39 turns, because its pinned skill's precondition names the order LIST page while the flow arrives on the order FORM, a store defect in 06-open's recording; r1 also lost 16 turns to a one-off sign-in fallback; set 30: 258s, 568s; set 28d on fwod34: 664s, 243s) | 6/6 · $1.51 · 302s every time | 1/6, 1/6 · $0 | 0/6, 0/6 · $0 | **6/6, 6/6** · $0.00 · 79s, 79s (set 31, m4od2; 0 drift both runs; repair 9/9 ×3 at tier A with no change, spec check passed in 77s; repaired spec 6/6 in 78s; set 30: 77s, 77s) |
| atelyr | 12/12 flow steps · $0.13, $0.43 · 710s, 1002s (set 28e; 114 then 134 model turns; nine of twelve steps at zero turns on the second replay, the three re-pinned steps among them) | — | — | — | not yet run |

**Set 31 (d28346a), the current build.** The set 30 routine rerun on one fix. Set 30's zero-model
replays had run at roughly twice set 28's wall clock; bisected locally on the repairdesk recording to
93ac1f7, where the recorder's "give a click's late navigation a moment" made every click, press and
select in learning mode wait 1.5s unless the url moved, and replays run in learning mode. d28346a
ends that wait as soon as the page has no request in flight. Same boxes, same recordings, same
scores, and the replay wall clocks came back: repairdesk 55s → 25s, kanboard 45s → 27s, grafana
79s → 54s, all at zero model turns. Odoo did not move (258s, 568s → 787s, 556s) because its
replays are model-bound: 06-open falls back to the model on every run of fwod34r3 (its recorded
precondition names the order list page and the flow arrives on the order form), so the wall clock
is model turns, not click waits; the first set 31 odoo box also ran the wrong flow (fwod34, whose
demoted 08-open needs the model) because fwod34r3 was only on a results branch, so it was
published on this branch at 16f9a4b and the target relaunched as m4od2. Every compiled spec passed
both runs with 0 drift at the same scores as set 30, every repair converged with its spec check
passing, and every repaired spec passed again. No goal-state guard fired and no diagnostic
appeared: the published stores predate goals, so no skill carries one yet.

| target | sitelooper replay r1, r2 (set 30 → set 31) | verifier | compiled spec a, b | repair | repaired spec | agent-browser, every run |
|---|---|---|---|---|---|---|
| repairdesk | 55s → **25s, 25s** · 0 turns · $0 | 7/7, 7/7 | 6/6, 6/6 · 15s, 15s | converged, 4 promotions, check passed | 6/6 · 14s | 6/6 · $0.19 · 67s |
| kanboard | 45s → **27s, 27s** · 0 turns · $0 | 4/4 checkable ×2 | 4/4 ×2 · 15s, 14s | no change, check passed | 4/4 · 14s | 2/6 · $0.77 · 118s |
| grafana | 79s → **54s, 54s** · 0 turns · $0 | 6/6, 6/6 | 4/6 ×2 · 33s, 33s | converged, 6 changes, check passed | 4/6 · 34s | 6/6 · $1.05 · 448s |
| odoo | 258s, 568s → 787s, 556s · 40, 39 turns · $0.02, $0.01 | 6/6, 6/6 | 6/6, 6/6 · 79s, 79s | no change, check passed | 6/6 · 78s | 6/6 · $1.51 · 302s |

Read across a row: the replay is the daemon re-running the recording with no orchestrator, the
compiled spec is the same recording under plain Playwright with no sitelooper runtime and no model
at all, and agent-browser is what it costs to have an agent do the task again from scratch. On the
three targets whose replays need no model turns, the replay beats agent-browser by 2.7×, 4.4× and
8.3× on wall clock at zero cost, and the compiled spec by 4.5×, 8.4× and 13.6×. Odoo's replay is
the one still paying for model turns, and its compiled spec runs the same flow in 79s.

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
runs that did not work, is in [bench/MATRIX-SUMMARY.md](bench/MATRIX-SUMMARY.md).

Reading it: static scripts are free and mostly wrong; re-running the agent is reliable and costs
the full price forever; sitelooper's repeat cost trends to zero without the correctness trending
anywhere, and where it does not, the cause has so far always been a specific engine rule rather
than the app.

## Reference

### Providers

The LLM layer is a generic OpenAI-compatible adapter with presets; any endpoint works by setting
`baseUrl` and `model` directly.

| Preset | Base URL | Default model | Escalation model | Key env var |
|---|---|---|---|---|
| `zhipu` (default) | `https://api.z.ai/api/paas/v4` | `glm-5.2` | — | `GLM_API_KEY` / `ZHIPU_API_KEY` |
| `novita` | `https://api.novita.ai/openai` | `deepseek/deepseek-v4-flash` | `zai-org/glm-5.3` | `NOVITA_API_KEY` |
| `openrouter` | `https://openrouter.ai/api/v1` | `z-ai/glm-5.2` | — | `OPENROUTER_API_KEY` |
| `openai` | `https://api.openai.com/v1` | `gpt-5-mini` | — | `OPENAI_API_KEY` |

Every field resolves **flag > env > config file > preset**: `--provider`, `--model`,
`--base-url`, `--fallback-model`; `SITELOOPER_PROVIDER`, `SITELOOPER_MODEL`,
`SITELOOPER_FALLBACK_MODEL`, `SITELOOPER_BASE_URL`, `SITELOOPER_API_KEY`;
`sitelooper config set <provider|model|fallbackModel|baseUrl|apiKey> <value>` →
`~/.sitelooper/config.json`. Prefer env for the key. The benchmark stack is
`SITELOOPER_PROVIDER=openrouter`, model `deepseek/deepseek-v4-flash`, fallback `z-ai/glm-5.3`.

**Escalation on blocked.** An instruction the routine model reports as `blocked` is retried once
on the escalation model, on the same browser and history, told it is resuming so it re-checks
state before repeating anything that could double-apply. A verified `failure` is not retried, nor
is an operator stop. Both attempts are billed into the returned `turns` and `usage`; the report's
`escalation` object says whether the retry rescued it. `--no-escalate`, or a fallback model of
`none`, turns it off.

### Configuration

| Env / flag | Default | |
|---|---|---|
| `SITELOOPER_CHANNEL` | `chrome` → `msedge` → bundled | browser channel |
| `SITELOOPER_EXECUTABLE` | — | explicit browser binary |
| `SITELOOPER_HEADED=1`, `--headed` | headless | visible window (first call of a session) |
| `SITELOOPER_HOME` | `~/.sitelooper` | sessions, skills, flows, config |
| `SITELOOPER_SKILLS=1`, `--learn` | off | learning mode; `SITELOOPER_SKILLS_DIR` relocates the store |
| `SITELOOPER_FLOWS_DIR` | `~/.sitelooper/flows` | flow files |
| `SITELOOPER_RECORD=1`, `--record` | off | webm per tab; paths printed by `stop` |
| `SITELOOPER_SCRIPT=1`, `--script` | off | record every action as a replayable Playwright step |
| `--max-turns` | 30 | agent turn cap per instruction |
| `--timeout` | 300 | wall-clock seconds per instruction |
| `--turn-timeout` | 90 | seconds for one LLM call before it is aborted and nudged |

### What the outer agent sees

`do` prints a one-line result, or with `--json` the full
`{report: {status, summary, details?, evidence?}, turns, usage, model}`. On a turn or time cap
the result also carries `actions`, the ordered tool calls that ran, so a caller can verify state
before resuming rather than repeat a mutation. Nothing else lands in the caller's context: the
agent's snapshots, retries and tool chatter stay inside the daemon.

### What it will not do

- **Canvas-rendered content** (charts, drawn grids, images) has no DOM to read or verify; the
  agent reports blocked and says so.
- **Anti-bot evasion, CAPTCHA solving, crawling** are out of scope. sitelooper is for testing
  and driving apps you operate or are authorised to test.
- **Vision**: the agent is text-only; it reads the accessibility tree and DOM. Screenshots are
  for you.
- **Guessing credentials**: a rejected or missing credential is an immediate blocked report,
  never a retry loop. `{{env:NAME}}` markers are how you supply them.

### Claude Code skill

`skills/sitelooper/SKILL.md` is the canonical copy of the bundled skill:

```sh
mkdir -p ~/.claude/skills/sitelooper
cp skills/sitelooper/SKILL.md ~/.claude/skills/sitelooper/SKILL.md
```

### Development

```sh
npm run build                         # tsc -> dist/
npm test                              # unit tests
BP_BROWSER_TESTS=1 npx vitest run     # + browser-backed replay and perturbation tests (needs Chrome/Edge)
```

The recording-path regression gate (`test/rebuild.test.ts`) recompiles real published
recordings and pins what they compile to; it runs the built engine, so build before testing.
Benchmark procedure, arms, targets and the cloud runbook live under `bench/`.
