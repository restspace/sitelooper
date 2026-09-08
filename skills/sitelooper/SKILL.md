---
name: sitelooper
description: Delegate a whole natural-language browser step — one with judgment or multiple assertions baked in — to an internal LLM agent loop that drives Playwright itself, instead of you clicking/filling/asserting element-by-element. Best for executing E2E test plans, multi-step flows, and app-specific verification with an optional app briefing. Uses the `sitelooper` CLI. For low-level, deterministic single-action DOM poking (one click, one fill, one read), prefer the `browser-testing` skill / `agent-browser` CLI instead — cheaper and no LLM tokens spent per action.
---

# sitelooper: agent-in-the-loop browser automation

`sitelooper` takes one natural-language instruction and returns one concise
structured result — `{status, summary, details?, evidence?}` — instead of you
issuing several selector-aware, wait-aware calls per logical step. A configured
LLM provider translates the instruction into Playwright tool calls against a
persistent browser, verifies the result, and reports back. Use `sitelooper
doctor` to check the local browser and provider setup, and supply provider
credentials through environment variables or `sitelooper config`.

## Core loop

```sh
# deterministic verbs — no agent tokens spent
sitelooper open http://localhost:5173
sitelooper brief docs/AUTOMATION_GUIDE.md   # load app-specific conventions/selectors into the session
sitelooper note "runid is k7x2"             # record run state the agent must know
sitelooper peek [--selector css] [--interactive]
sitelooper screenshot [path]

# the core verb — anything requiring judgment or multi-part assertions
sitelooper do "log in as {{env:TEST_USER}} using {{env:TEST_PASSWORD}}"
sitelooper do "create a supplier organisation named 'k7x2 MTP Supplies Ltd' and confirm it appears in the Organisations list with the count incremented" --json

# housekeeping — answered immediately, even while a `do` is running
sitelooper session list
sitelooper stop [--all]                     # prints video paths if the session was recorded
sitelooper config
```

- Exit codes: `0` succeeded · `1` failed/blocked · `2` infra error (no key, no browser, LLM unreachable).
- `--json` gives `{schemaVersion, stage, outcome, nextActions, report, turns, usage, model}`; on any bail-out it also carries `actions` (the
  ordered tool calls that ran — check before blindly repeating a mutation), `transcriptTail`, and
  `finalState` (where the browser was left).
- `--verbose` / `--progress` stream the internal agent's turn-by-turn activity to stderr.

| Flag | Default | |
|---|---|---|
| `--max-turns` | 30 | agent turn cap per instruction |
| `--timeout` | 300 | wall-clock seconds for the whole instruction |
| `--turn-timeout` | 90 | wall-clock seconds for one LLM call — see below |

## Authoring a Playwright test

Use the learned-flow path when the deliverable is a committed test. It records one procedure per
logical outcome, snapshots everything needed to compile
on another machine, and runs the emitted code under plain Playwright.

```sh
sitelooper init
sitelooper --session login --learn open http://localhost:5173
sitelooper --session login do "log in as {{env:TEST_USER}} using {{env:TEST_PASSWORD}} and verify the dashboard opens"
sitelooper --session login stop --save-flow login
sitelooper flow export login --out .sitelooper/procedures.json
sitelooper build login --fixture-isolation
```

`build` compiles the flow, then runs the readiness gate against the generated `.spec.ts`. Readiness
means three clean, retry-free executions by default, with fresh state and distinct parameter values;
all required flow steps must execute, and no skip, already-satisfied shortcut, or locator drift may
hide the behavior being tested. Use `--reset-cmd "<command>"` when a command prepares clean data, or
`--fixture-isolation` when the selected Playwright project's fixtures do it. A setup failure or an
unavailable Playwright installation is **not verified** and exits nonzero.

Project defaults live in the nearest `sitelooper.config.json`. Paths are relative to that file:

```json
{
  "targetUrl": "http://localhost:5173",
  "requiredVars": ["runid"],
  "vars": { "runid": "test-{n}" },
  "resetCommand": "npm run reset:e2e",
  "playwright": { "config": "playwright.config.ts", "project": "chromium" },
  "outputDir": "tests/sitelooper",
  "snapshotFile": ".sitelooper/procedures.json",
  "verificationRuns": 3
}
```

Keep passwords, tokens, and other secrets out of this file. Put `{{env:NAME}}` references in
instructions and set those variables in the environment that authors and CI use. `requiredVars`
names flow inputs, while generated specs validate their required environment references separately.

`flow export` writes the flow, every pinned procedure segment, and compiler provenance to one
portable snapshot. Commit it when another developer or CI must be able to reproduce compilation
without `~/.sitelooper/skills`. The generated `<name>.flow.ts` is tool-owned and refreshed on compile;
the `<name>.spec.ts` scaffold is user-owned and is created only once. Use `--overwrite-spec` only when
you intentionally want a new scaffold. `--allow-demoted` only permits a diagnosed demoted procedure;
it never overwrites the scaffold.

Use `sitelooper check <name.flow.ts> --ready` to repeat the readiness gate for an existing artifact.
Use plain `compile` only when you intentionally want an offline compiler pass without live readiness
evidence. Raw `--script` recording remains useful for exploration, but it captures the agent's exact
path, including detours, and is not the recommended test-authoring artifact.

## Repairing a compiled spec after a red CI run

A compiled spec (`<name>.flow.ts` + `<name>.spec.ts`, from `compile` above) runs under plain
`@playwright/test` with no model in the loop — so when you land on a red run of one, don't reach
for `do`. Work the failure like this:

1. Read the Playwright report. Look for `[sitelooper drift] ...` lines (a locator's primary
   candidate missed but a recorded fallback covered — the test may still be green) and, on an
   actual failure, the `// @step <id> <segment>/<index>` anchor comment in the `.flow.ts` nearest
   the failing line — that's the step and candidate to focus on, not the whole flow.
2. Stage a repair proposal: `sitelooper repair <name.flow.ts> --var k=v --var runid=fix-{n}
   --converge 1 --propose repair.json`. This performs the live triage and convergence runs once,
   verifies the compiled candidate, and saves its exact source, source hash, change list, and
   verification result. `{n}` becomes the run number, so record-creating flows do not collide.
3. Review `repair.json` and its printed change list, then apply that exact candidate with
   `sitelooper repair apply repair.json`. Apply refuses a changed source file or an unverified
   proposal; it does not repeat browser work.
4. Review the printed change list line by line ("candidate promoted", "new locator", "chain
   reordered", "step re-pinned to variant ..."). This is the diff a human would otherwise have to
   reconstruct from the `.flow.ts` diff by hand.
5. Refuse anything that weakens an expectation. `repair` already refuses this on its own — a
   dropped assertion exits 1 rather than writing — but treat that refusal as final, not something
   to work around by editing the flow yourself; an assertion that stopped holding is a real test
   failure for a human to look at, not drift.
6. If `repair` (or `compile`) prints a **needs-rerecord** / **demoted-pin** / **noop-step** /
   **contradicted-step** diagnostic rather than proposing a fix, don't try to hand-patch the
   `.flow.ts` — it's regenerated in full on every `compile`/`repair` and hand edits are detected
   and refused on the next repair anyway. Every such diagnostic names its own fix command:
   `sitelooper rerecord <flow> <step-id> [--instruction "<text>"] [--var k=v ...] [--runs n]
   [--reset-cmd "<cmd>"]`. It backs the flow file up, unpins just that step (optionally swapping in
   a new instruction — the fix when the recorded ask no longer makes sense, e.g. "cancel an order a
   previous step already cancelled"), and replays the flow `--runs` times (default 2) in learning
   mode; it succeeds only when the last run replays the step at tier A on the newly recorded pin,
   otherwise it prints why and exits 1. A `contradicted-step` diagnostic's `fix` points at the
   *mutating* step (the one whose report a later read-only step disagreed with), not the step that
   eventually failed because of it — re-record that one, not the one you saw fail.
7. Once `repair apply` has written the file, commit only the `.flow.ts` diff and open it as a PR,
   with the printed
   change list as the PR description — that list is already the reviewer-facing summary of what
   changed and why.

Never touch the `.spec.ts` for this: it's the user's file and `repair` never rewrites it.

A step whose printed line says `already satisfied` (a `run`) or whose emitted guard logs
`[sitelooper satisfied] ...` (a compiled spec) is not a bug: a mutating step derives a `goal` at
compile time — the visible text its own recording read back that was not there when it started —
and the engine checks the live page for both identity and that goal before acting. When both
already hold, the step succeeds having done nothing rather than repeating work (or failing to find
a control that a prior step's retry already removed). Nothing to fix here; it is the retry-safety
half of the same mechanism `contradicted-step` and `noop-step` flag the *unsafe* version of.
`repair` itself never touches anything outside a throwaway temp store until `repair apply` writes
the reviewed candidate. Its triage and convergence executions against the live app are real: one
triage plus `--converge n` additional runs. A legacy `--dry-run` also performs real browser work;
prefer a proposal when you may apply the result.

## Learning mode — repeated work gets cheaper

Start a test-authoring session with `--learn`. Every `do` that succeeds is compiled
into a stored, parameterised procedure; on later `do`s that start on the same page the internal agent
is offered those procedures, replays one deterministically, and only reasons about steps that no longer
work. A run that took 14 internal turns the first time typically takes 2–3 the next, with the same
report shape and every value still read back from the live page.

```sh
sitelooper --session t1 --learn open http://localhost:5173
sitelooper --session t1 do "sign in as {{env:TEST_USER}} using {{env:TEST_PASSWORD}} and create a project named 'k7 Demo'"
sitelooper skills list                    # what has been learned for each site
sitelooper skills show <id>               # the steps, their fallbacks, what is a parameter
```

Two habits make it work well: keep the *values* in the instruction text (a name, a cost, a url) — that
is how they become parameters rather than hard-coded literals — and keep instruction boundaries stable
across runs (one `do` = one whole outcome, as above), so the procedure learned last time matches the
outcome asked for this time. The store lives per site under `~/.sitelooper/skills/`; `skills rm`
removes anything you do not want replayed.

## When a `do` misbehaves

Control commands do **not** queue behind the running instruction, so you can always look and
intervene:

```sh
sitelooper session list             # is the daemon alive? answers in ms, mid-instruction
sitelooper screenshot               # what is the browser actually looking at right now
sitelooper stop --session <name>    # aborts the in-flight instruction, then exits
```

`stop` preempts rather than waits. The `do` you interrupted returns a `blocked` report with its
actions log — it does not hang, so a stuck run is always recoverable. If a control command *does*
hang, the daemon is genuinely wedged (kill the pid from `session list`); that is a bug worth
reporting, not the normal busy state.

A model that reasons without ever issuing a tool call is caught by a per-turn watchdog: the turn is
aborted at `--turn-timeout`, retried once with a nudge, and after three such turns the instruction
ends as `blocked` with the reasoning in `transcriptTail`. So a stall costs seconds, not the full
`--timeout`. If you see that report, the instruction was almost certainly too broad — split it.

## Writing good instructions

Scope each `do` to **one logical, verifiable step** — don't pack many independent assertions into
one instruction; that's what burns the turn budget and what makes the agent stall on planning.
Instructions asking for two unrelated artifacts at once ("report the console output *and* the
innerHTML of #root") are the classic failure case: ask for one, then the other. Put deterministic
sub-actions (navigation, screenshots, spot-checks) on `open`/`peek`/`screenshot` instead — free, no
agent tokens.

**Server response vs live DOM.** Every observation tool the agent has shows the live,
post-JavaScript DOM. It also has `fetch_source`, which returns the raw HTTP response body with no
JS executed, and it is instructed to call that before claiming anything about server-rendered
output — so an SSR bug (element absent from the source) is distinguished from a hydration bug
(present in the source, missing live). Reports name their source: "the live DOM contains…" vs "the
server response contains…". If a distinction matters to you, ask for it explicitly, and treat any
unattributed claim in a summary as an inference rather than an observation.

## Sessions

`--session <name>` (default `default`) owns a detached daemon with a persistent Chrome profile
under `~/.sitelooper/sessions/<name>/` — logins and conversation history survive daemon
restarts. `brief` and `note` content survives history trimming. `stop` kills the daemon; the
profile stays.

## Recording a session

`--record` on the first call of a session (the one that launches the browser) records the whole
session to webm, one file per tab, under `~/.sitelooper/sessions/<name>/video/`:

```sh
sitelooper open http://localhost:5173 --session run1 --record
sitelooper do "..." --session run1
sitelooper stop --session run1              # prints:  video: .../video/page@<hash>.webm
```

Playwright only writes the video out when the browser context closes, so: it cannot be started or
stopped mid-session, nothing is readable until `stop`, and killing the daemon any other way loses
the recording entirely. `sitelooper config` reports `recording` so you can check which mode a
running session is actually in — passing `--record` to an already-running session does nothing.

Use it when you need to show a human what happened, or to debug a flow that fails intermittently.
For a single moment, `screenshot` is cheaper and readable immediately.

## Design boundary — this tool is app-agnostic

`sitelooper` itself has no knowledge of any specific app under test. All app-specific knowledge
(selectors, class names, gestures, URLs, workflow assumptions) belongs in the `brief` you load or
the instruction text you write — never assume the tool "knows" an app's UI. See the project README
(`C:\dev\sitelooper\README.md`) for the full design rationale and the complete tool/provider
reference if you need more than this skill covers.
