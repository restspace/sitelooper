# Plan: `sitelooper assert`

Status: proposal, 2026-10-02. Nothing implemented.

## What it is for

Today a test condition is either hand-written in the user's `.spec.ts` after `runFlow`, or left to
the recording agent, which may or may not turn "verify it appears" into a `wait_for`. There is no
way to say at record time "this must hold on every run" and have it compiled as a check that
cannot be skipped, recovered around, or satisfied by the model.

```sh
sitelooper --session ticket assert "the ticket list shows 'demo Test' with status Open"
sitelooper --session ticket assert "the order total is 370.00"
sitelooper --session ticket assert "no error banner is showing"
```

Exit 0 when the condition holds now, 1 when it does not, 2 for infrastructure. In a `--learn`
session a passing assert is recorded and becomes a step of the saved flow.

## Design

### 1. The command is natural language; the recorded thing is structured

The user writes a sentence. A model call locates the element and picks a matcher, once, at record
time. What is stored is a structured assertion step with a locator chain, so replay and the
compiled spec need no model.

Matchers in the first cut are the five `wait_for` already has (`visible`, `hidden`, `text_equals`,
`text_contains`, `count`) plus `value_equals` (form fields) and `url_contains`. Numeric
comparisons, attributes and checked state can follow.

### 2. Build on `wait_for`, with a strict failure policy

An assertion is a recorded `wait_for`-shaped step carrying `assert: { message }`. That reuses what
already works in both runners: locator chains, slotting of values into `{{vN}}`, the first-match
dispatch rule, auto-waiting, and the Playwright `expect` lines in `src/spec/emit.ts`
(`waitForLine`). The flag changes only what happens when it does not hold:

| | ordinary step | assert step |
|---|---|---|
| condition false | recovery ladder (cheap model, then stronger) | run stops, `assert-failed`; no model |
| target not found | recovery ladder | run stops, `assert-unlocatable`; drift ticket; no model |
| "already in effect" / satisfied shortcut | may skip | never skipped |
| read that misses | skipped with a warning (as fwen4 02-find) | failure |
| step adoption, re-pin by recovery | allowed | never |

Fallback candidates in the same locator chain stay allowed (the same element found another way)
and file drift as they do now. The model never decides a verdict on replay.

### 3. The expected value must come from the caller, not the page

The failure to design out is the tautology: "verify the total is correct" becoming "the total
equals whatever the page shows". Rule: an assertion's expected text must be stated in the
instruction (a literal, a `{{var}}`, or a `{{step.output}}` reference). An expected value the agent
only read off the page in the same instruction is refused, and the command exits 1 saying which
value has no stated source. This is a check on evidence (where the value came from), in line with
the no-shape-tests rule. `visible`/`hidden`/`count` need no expected text.

Stated values are threaded exactly as instruction values are today, so `'demo Test'` compiles to
`{{runid}} Test` and an id an earlier step reported compiles to a live reference.

### 4. It is its own flow step

`FlowStep` gains `kind?: 'assert'`. Its own step (rather than attaching to the previous one) keeps
the per-step report honest (`[FAIL] 05-assert`), gives the compiled module a named
`steps.assert…` function, and lets the flow runner apply the strict policy by step kind.

### 5. One verdict function, shared by both runners

New `src/execution/assert.ts`: given the observation (text, value, count, visibility, url), the
matcher and the expected value, return pass or fail with a message. The daemon replay and the
compiled artifact both call it (it is embedded through `src/spec/runtime-source.ts` like the rest
of `src/execution`), and a parity case covers it.

## Work items

1. **Agent tool and loop** (`src/agent/tools.ts`, `loop.ts`, `prompt.ts`): an `assert` tool
   (target, matcher, expected, message); an assert-mode instruction run limited to non-mutating
   tools; the stated-source rule from section 3.
2. **CLI and protocol** (`src/cli.ts`, `src/shared/protocol.ts`, `src/daemon/server.ts`): the
   `assert` command, `--timeout`, `--json`, exit codes, help text.
3. **Recording and compile** (`src/daemon/recorder.ts`, `src/skills/store.ts`, `compile.ts`,
   `learn.ts`, `flow.ts`): the `assert` field on `SkillStep`, `kind` on `FlowStep`, an assert
   instruction compiles to a read-only skill, export keeps it as a step.
4. **Replay policy** (`src/skills/replay.ts`, `src/daemon/step-verdict.ts`, `server.ts` `runFlow`):
   the strict column of the table above; new step statuses; drift ticket kind.
5. **Shared verdict** (`src/execution/assert.ts`, runtime-source embedding, parity case).
6. **Compiled spec** (`src/spec/emit.ts`, `ir.ts`, `lower.ts`): `expect(locator, message)` lines
   for the two new matchers; no soft "held elsewhere" catch that turns a failure into a warning;
   compile diagnostics for an assert with no expressible locator.
7. **Readiness** (`src/spec/readiness.ts`, `check.ts`): report how many assertions the flow
   carries; optionally count a flow with none as `failureDetection: not-configured` (unchanged
   default).
8. **Tests**: unit tests per item; a browser test that an assert fails tier A with zero model
   turns when the expected value is wrong; a shape-gate check that nothing new matches on string
   shape.
9. **Bench**: add one assert to two existing task files (one green app, ERPNext), and a negative
   replay run with a deliberately wrong `--var` that must fail at the assert step with 0 turns.
10. **Docs**: README quick start, `docs/testing-workflow.md`, `docs/shared-execution.md`.

Order: 5 → 1/2 → 3 → 4 → 6 → 8, then 7, 9, 10. Items 1-6 are one fix branch verified on a cloud
box (suite, browser, parity, corpus) before merge; the corpus check should show 0 changes, since
no existing recording contains an assert.

## Later, not in the first cut

- `--soft`: record the failure, keep running, fail at the end (`expect.soft`).
- Numeric and comparison matchers ("total is at least 100").
- Read-only model re-location of a drifted assert target, offered as a repair proposal the user
  applies; never automatic.
- Authoring asserts directly in a flow file without a recording session.

## Open decisions

1. Natural-language command (recommended) or structured flags (`--target … --text-equals …`)?
   Flags are deterministic but make the user write selectors.
2. Own flow step (recommended) or attached to the preceding step?
3. On a missing target: fail outright (recommended for the first cut) or let a model re-locate it
   read-only?

## Not yet verified

This plan was written from `cli.ts`, `server.ts` (`do`, `var`), `protocol.ts`, `flow.ts` types,
the `wait_for` paths in `replay.ts` and `emit.ts`, and the tool list. I have not read `runFlow`'s
recovery code (`server.ts` ~1642) or checked whether the agent loop can already restrict its tool
set; items 1 and 4 may be larger than they look.
