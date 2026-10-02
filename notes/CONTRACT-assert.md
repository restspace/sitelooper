# Contract: `sitelooper assert` (branch feat/assert-command)

Read `notes/PLAN-assert-command.md` first for the why. This file fixes the shapes and who owns
which files. The types and `src/execution/assert.ts` below are already committed; do not change
their shapes without saying so in your final report.

## Behaviour

`sitelooper --session S assert "<condition sentence>"`: exit 0 if the condition holds now, 1 if
not, 2 for infrastructure. In a `--learn` session a passing assert is recorded, compiles to a
skill, and becomes a flow step of `kind: 'assert'`.

Decisions already made by the user:
1. Natural-language command. A model locates the element at record time; replay and the compiled
   spec use no model.
2. An assert is its own flow step.
3. A target that cannot be found is a failure (`unlocatable`). No model re-location.

## Already in place (commit "assert: contract")

- `src/execution/assert.ts`: `AssertState`, `ASSERT_STATES`, `ASSERT_ONLY_STATES`,
  `ASSERT_TEXT_STATES`, `AssertFailureKind`, `assertFailure(kind, message, detail)`,
  `assertFailureKind(errorMessage)`, `valueHolds`, `urlHolds`, `statedIn(instruction, expected)`.
  Self-contained (imports only `./text.js`) because the compiled artifact embeds it.
- `Skill.assert?: true`, `SkillStep.assert?: { message: string }` (`src/skills/store.ts`).
- `FlowStep.kind?: 'assert'` (`src/skills/flow.ts`).
- `RecordedInstruction.assert?: true` (`src/daemon/recorder.ts`).
- `LoopOptions.assert?: true` (`src/agent/loop.ts`).
- `CommandName` includes `'assert'`; `FlowStepResult.assert?: { kind, message }`
  (`src/shared/protocol.ts`).

## How an assertion is represented

An assertion is one or more recorded **`wait_for` steps**. No new recorded tool.

- Record time: the `assert` command runs the instruction through the agent loop with
  `LoopOptions.assert`. In that mode the model is offered only observing tools (snapshot, read,
  read_all, wait_for, and whatever else is strictly non-mutating and already exists, plus
  `report`); any other tool call is refused by name. `wait_for`'s `state` enum gains
  `value_equals` (the field's current value equals `text`) and `url_contains` (the page url
  contains `text`; no target) in assert mode only. An ordinary `do` must never be offered them.
- The stated-source rule: in assert mode a `wait_for` whose state is in `ASSERT_TEXT_STATES` and
  whose `text` is not `statedIn(instruction, text)` is refused with an error telling the model the
  expected text must be written in the assertion. No shape tests anywhere (see
  `test/shape-gate.test.ts`): decisions rest on where a value came from.
- The instruction is recorded with `RecordedInstruction.assert = true`. A successful report
  requires at least one `wait_for` that held in this instruction; otherwise the result is a
  failure ("no checkable condition was recorded").
- Compile: an instruction group marked `assert` compiles to a `Skill` with `assert: true`
  containing only its `wait_for` steps (reads, snapshots and anything else are dropped), each with
  `assert: { message }` where `message` is the skill's template (the caller's sentence, slotted).
  Expected text is slotted like any other instruction value.
- Flow export: the step gets `kind: 'assert'`, no outputs. Never adopted (a failed assert
  instruction is not part of the flow), never a continuation of a neighbouring step.

## Failure policy (both runners)

For a step with `assert`:
- resolution through the recorded locator chain, including fallback candidates, is unchanged and
  files drift as today;
- no candidate resolves → `assertFailure('unlocatable', message, detail)`;
- the wait times out / condition false → `assertFailure('failed', message, detail)`;
- never skipped (not "already in effect", not "satisfied", not a skipped read, not a detour);
- never recovered: no model turn, no repair, no adoption, no re-pin.

`message` is `SkillStep.assert.message` with this run's params filled in. `detail` is the
underlying wait's own error text. Use `assertFailureKind` to classify a thrown Error.

Daemon flow run: the step's `FlowStepResult.status` is `'assert-failed'`, `assert` is set,
`turns` is 0, and the flow halts with a non-success status. A direct `sitelooper assert` that
matches a stored assert skill replays it with no model; on a miss it exits 1 without falling to
the agent.

Compiled spec: the step's generated code throws `new Error(assertFailure(...))`; Playwright
reports it as the test failure. The scaffold `.spec.ts` is unchanged.

## Ownership

Three agents work concurrently in `C:\dev\sitelooper-assert`. Sibling changes may be missing or
half-written while you work; `npx tsc --noEmit` errors in files you do not own are not yours to
fix (report them).

| Agent | Owns | Tests |
|---|---|---|
| A record | `src/agent/tools.ts`, `src/agent/loop.ts`, `src/agent/prompt.ts`, `src/cli.ts`, `src/daemon/server.ts` (everything except `runFlow` and its helpers), `src/daemon/recorder.ts` | `test/assert-record.test.ts` |
| B compile + replay | `src/skills/compile.ts`, `src/skills/learn.ts`, `src/skills/flow.ts`, `src/skills/replay.ts`, `src/daemon/step-verdict.ts`, `src/daemon/server.ts` (`runFlow` and its helpers only) | `test/assert-replay.test.ts` |
| C spec | `src/spec/*`, the parity test | `test/assert-spec.test.ts`, a case in `test/execution-parity.test.ts` |

`src/daemon/server.ts` is shared by A and B in disjoint regions: re-read before each edit.
`waitFor` in `src/agent/tools.ts` (A) is the daemon's dispatch for recording AND replay, so A
implements `value_equals` and `url_contains` there; B makes replay resolve and gate them (a
`url_contains` step has no target); C emits them.

## Rules for every agent

- No `git stash`, no `git commit`, no branch switching: leave your changes in the working tree.
- No Docker, no app containers, no full test suite. Run only targeted vitest files
  (`npx vitest run test/<file>`), and `npx tsc --noEmit -p .`.
- `node_modules` is a junction: never delete or move it.
- Match the surrounding code's comment style: comments explain why, with the evidence.
- No decision may rest on the shape of a string (regex on what a value looks like). Add no entry
  to the shape-gate allowlist.
- Final report: what you changed (files, functions), what you ran and its result, and anything in
  the contract you could not honour or had to interpret.
