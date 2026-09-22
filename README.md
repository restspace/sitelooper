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
> `SITELOOPER_*`. The project was previously published on npm as `sleep-walker`, which this
> package supersedes. The env-var prefixes and home directories of its earlier names still work as
> aliases, but the old command names do not.

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

Requires Node 20+, a browser, and an [OpenRouter](https://openrouter.ai) API key for authoring.
The compiled tests need only `@playwright/test` and its browser installation; no Sitelooper
daemon or model runs in CI.

```sh
npm install -g sitelooper
npm install -D @playwright/test
npx playwright install chromium
export OPENROUTER_API_KEY=sk-or-...   # the only setting needed
sitelooper doctor                      # prints the provider and models it will use, and why
sitelooper init
```

With only `OPENROUTER_API_KEY` set, sitelooper uses the pairing the benchmarks below ran on:
`deepseek/deepseek-v4.1-flash` drives the agent loop, pinned to DeepSeek's own backend on
OpenRouter, and an instruction it reports blocked is retried on `z-ai/glm-5.3`. Other providers
work too: set `SITELOOPER_PROVIDER` (`openai`, `anthropic`, `zhipu`, `novita`) and that
provider's key, or point `SITELOOPER_BASE_URL` at any OpenAI-compatible endpoint (see
[Providers](#providers)).

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

**One-time codes.** For an account with two-factor sign-in, put the account's TOTP seed (the
base32 secret behind its QR code, or the whole `otpauth://` URI) in an environment variable and
write `{{totp:NAME}}` where the code goes:

```sh
export TEST_TOTP=JBSWY3DPEHPK3PXP   # the test user's seed, never a real person's
sitelooper --session ticket do "Enter the authentication code {{totp:TEST_TOTP}} and verify the dashboard opens"
```

The code is generated when the step types it (RFC 6238, SHA-1, 30 s and 6 digits unless the
`otpauth://` URI says otherwise). If the current window is about to expire, sitelooper waits for
the next one. Recordings, flows and the compiled `.flow.ts` keep the marker, never the seed or a
code, and generated codes are scrubbed from tool results. In CI, store the test user's seed as a
CI secret and export it like any other `{{env:NAME}}` credential. A compiled flow computes the
code at run time with Node's built-in WebCrypto, and a run without the variable is refused up
front by name.

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
and distinct dataset count. `--report <file.json>` writes it to a path you choose instead, creating
the directory, so a CI job can name the artifact it uploads before the run happens. The states are `compiled` and `spec-verified`; failures distinguish
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
and argument array, avoiding shell-command parsing. Progress goes to stderr. `check` and `build`
also accept `--report <file.json>`, which writes that same document to a fixed path — independently
of `--json`, so a caller can keep readable output and still collect the result. For multiline
instructions:

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
| `openrouter` (default) | `https://openrouter.ai/api/v1` | `deepseek/deepseek-v4.1-flash` (DeepSeek backend) | `z-ai/glm-5.3` | `OPENROUTER_API_KEY` |
| `zhipu` | `https://api.z.ai/api/paas/v4` | `glm-5.2` | — | `GLM_API_KEY` / `ZHIPU_API_KEY` |
| `novita` | `https://api.novita.ai/openai` | `deepseek/deepseek-v4-flash` | `zai-org/glm-5.3` | `NOVITA_API_KEY` |
| `openai` | `https://api.openai.com/v1` | `gpt-5-mini` | — | `OPENAI_API_KEY` |
| `anthropic` | `https://api.anthropic.com` (native Messages API) | `claude-sonnet-5` | — | `ANTHROPIC_API_KEY` |

Every field resolves **flag > env > config file > preset**: `--provider`, `--model`,
`--base-url`, `--fallback-model`; `SITELOOPER_PROVIDER`, `SITELOOPER_MODEL`,
`SITELOOPER_FALLBACK_MODEL`, `SITELOOPER_BASE_URL`, `SITELOOPER_API_KEY`;
`sitelooper config set <provider|model|fallbackModel|baseUrl|apiKey> <value>` →
`~/.sitelooper/config.json`. Prefer env for the key.

**Which provider, when none is named.** With no `--provider`, `SITELOOPER_PROVIDER` or config-file
`provider`, the keys decide: a Z.ai key (`GLM_API_KEY` / `ZHIPU_API_KEY`) keeps `zhipu`, the
default before 0.4.0; otherwise `OPENROUTER_API_KEY` selects `openrouter`; otherwise a generic
`SITELOOPER_API_KEY` or config-file `apiKey` still goes to `zhipu`; with no key at all the
default is `openrouter`. Another provider's own key (`OPENAI_API_KEY`, …) does not select that
provider by itself. `sitelooper doctor` prints the choice and the reason.

**Routing pin.** The `openrouter` preset sends `{"provider":{"only":["DeepSeek"]}}` with its
default model, the backend the benchmark prices assume. It is not sent with any other model or
base URL, nor with the escalation model. `SITELOOPER_EXTRA_BODY` (a JSON object) replaces it and
`SITELOOPER_EXTRA_BODY='{}'` turns it off; `SITELOOPER_FALLBACK_EXTRA_BODY` is the escalation
model's own. The benchmark sweeps run exactly these defaults (they also set them explicitly), with
`z-ai/glm-5.3` on OpenRouter as the outer agent that calls sitelooper.

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
  never a retry loop. `{{env:NAME}}` (and `{{totp:NAME}}` for one-time codes) markers are how you supply them.

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
