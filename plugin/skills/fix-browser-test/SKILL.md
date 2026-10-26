---
name: fix-browser-test
description: Repair a sitelooper-compiled Playwright spec (a `<name>.flow.ts` beside a `<name>.spec.ts`) after it fails in CI or locally because the app changed, or re-record one step of it. Use when a generated sitelooper test is red, prints `[sitelooper drift]` lines, or a sitelooper diagnostic such as needs-rerecord, demoted-pin, noop-step or contradicted-step names a fix. Proposes a checked repair for review and never weakens an assertion.
---

# Fix a compiled sitelooper test

A compiled spec (`<name>.flow.ts` + `<name>.spec.ts`) runs under plain `@playwright/test` with no
model. When one goes red, don't patch the generated file by hand and don't fall back to driving
the browser with `do`. Use sitelooper's repair, which re-records only what broke and checks the
result under plain Playwright before anything is applied.

## Setup check

`sitelooper --version` (0.6.0 or later; ask before `npm install -g sitelooper@0.6.0`) and
`sitelooper doctor`. Repair calls the model, so it needs the user's provider key in their own
shell. Never ask for the key in the conversation or put it in a file or command line. The app must
be running, ideally with a reset command (`--reset-cmd` or `resetCommand` in
`sitelooper.config.json`) so each repair run starts from fresh state.

## Readable or runtime

Look at the top of the `.flow.ts`. A file with `// @sitelooper-readable` is the readable style
(compiled with `--style readable`, usually because it is contributed or reviewed): plain Playwright
code with no locator fallback, whose recording is in the bundle its `// @sitelooper-source` line
names. For one of those:

- There are no `[sitelooper drift]` lines; the test fails at the step that broke.
- `sitelooper repair <name.flow.ts>` runs it once, re-records the failing step and recompiles it
  readable, then checks it. `--propose`, `--dry-run` and `--out` are refused for readable files.
- To pick the step yourself, re-record it. That writes the bundle and recompiles the file readable;
  show the user the diff of the regenerated file. `compile <bundle> --style readable` regenerates
  it again at any time.

  ```sh
  sitelooper rerecord tests/sitelooper/ticket.flow.ts <step-id> --reset-cmd "npm run reset:e2e"
  ```

The rest of this skill is about the runtime style, which is the default.

## 1. Read the failure

In the Playwright report, look for:

- `[sitelooper drift] ...` lines: a locator's primary candidate missed and a recorded fallback
  covered. The test may still be green.
- On a failure, the `// @step <id> <segment>/<index>` anchor comment in the `.flow.ts` nearest the
  failing line. That names the step and candidate to focus on.
- `assertion failed: <sentence>`: a recorded `assert` did not hold. That is a real test failure for
  a human to look at, not drift. Report it; don't repair it away.

## 2. Propose a repair

```sh
sitelooper repair tests/sitelooper/ticket.flow.ts --propose ticket-repair.json \
  --var runid=fix-{n} --reset-cmd "npm run reset:e2e"
```

This does one live triage run, one convergence run (`--converge N` for more) and one plain
Playwright check of the candidate, staged beside the original. The original flow and the user's
spec are untouched. `{n}` becomes the run number so record-creating flows don't collide.

## 3. Review, then apply

Show the user the printed change list ("candidate promoted", "new locator", "chain reordered",
"step re-pinned to variant ..."), explain each line, and apply only with their agreement:

```sh
sitelooper repair apply ticket-repair.json
```

`apply` writes exactly the candidate that was checked. It refuses if the source, candidate or user
spec changed since the proposal, and it runs no browser.

## 4. When repair refuses

- **A dropped or weakened expectation**: `repair` exits 1 rather than writing. Treat that as final.
  An assertion that stopped holding is a real failure; don't work around it by editing the flow.
- **needs-rerecord / demoted-pin / noop-step / contradicted-step / omitted-work**: the diagnostic
  names its own fix command. It is usually:

  ```sh
  sitelooper rerecord tests/sitelooper/ticket.flow.ts <step-id> [--instruction "<text>"] \
    [--var k=v ...] [--runs n] [--reset-cmd "<cmd>"]
  ```

  It backs the flow up, unpins just that step (optionally with a new instruction, the fix when the
  recorded ask no longer makes sense), and replays the flow in learning mode. It succeeds only when
  the last run replays the step on the new recording; otherwise it prints why and exits 1. A
  `contradicted-step` fix points at the mutating step a later read disagreed with. Re-record that
  one, not the step you saw fail.

## 5. Confirm

```sh
sitelooper check tests/sitelooper/ticket.flow.ts --ready --var runid=check-{n} --reset-cmd "npm run reset:e2e"
```

A proposal check is one compiled run; `--ready` repeats the three-run readiness gate. For a repair
PR, include the `.flow.ts` diff and use the change list to explain it.

## Notes

- Never edit `<name>.spec.ts` for a repair. It is the user's file, and repair never rewrites it.
- A step that logs `already satisfied` or `[sitelooper satisfied] ...` found its goal already on the
  page and did nothing. That keeps retries safe, but it does not prove the action ran, and it
  disqualifies readiness: reset the app or use fresh `--var` values and check again.
- `repair <flow> --dry-run` previews without writing but still runs against the app. Direct
  `repair <flow>` (no `--propose`) writes after convergence and checks the spec. Prefer
  `--propose` when the user will review the result.
