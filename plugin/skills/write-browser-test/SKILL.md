---
name: write-browser-test
description: Write an end-to-end browser test of a web app from a plain-English description of the user journey, and deliver it as a standalone Playwright spec that runs in CI with no model or API key. Use when the user asks for an e2e, browser, UI or Playwright test of a flow (sign in, create, edit, check a list) in an app they can run or reach. Uses the sitelooper CLI, which records each step with a small model in a real browser, compiles the recording and proves the spec with three clean runs.
---

# Write a browser test with sitelooper

sitelooper turns plain-English steps into a committed `@playwright/test` spec. A small model
works each step once in a real browser while sitelooper records durable locators, where each value
came from and what each step changed. `build` compiles that recording and runs the spec three times
against fresh state. The spec it leaves needs only Playwright: no sitelooper, no key, no model.

## 0. Check the setup first

Run these before anything else, and stop to tell the user what is missing:

1. `sitelooper --version`. If the command is not found or prints a version below 0.6.0, ask the
   user before installing: `npm install -g sitelooper@0.6.0` (Node 20 or later).
2. `sitelooper doctor`. It prints the provider, models and browser it will use and why. If it says
   no API key is set, ask the user to set one in their own shell (for example
   `export OPENROUTER_API_KEY=...`) and restart the session. **Never ask the user to paste a key
   into the conversation, and never write a key into a file, a command line or a config.**
3. In the project that will run the tests: `@playwright/test` installed, and a browser
   (`npx playwright install chromium`) unless Chrome or Edge is present.
4. The app must be running and reachable from this machine. Ask for its URL and a test account.
   This works only where you can run shell commands on the user's computer; in a chat without a
   shell, explain the steps instead of running them.

## 1. Plan the flow with the user

Split the journey into **one logical, verifiable outcome per step**, each ending in a check:

- "Sign in as {{env:TEST_USER}} using {{env:TEST_PASSWORD}} and verify the dashboard opens"
- "Create a ticket titled 'demo Bench'; verify it appears in the list and report its id"
- "Open ticket 'demo Bench', set its priority to High and verify the badge shows High"

Rules that decide whether the recording compiles well:

- **Credentials as markers, in single quotes.** Write `{{env:NAME}}` (or `{{totp:NAME}}` for a
  one-time code) exactly, inside SINGLE quotes in the shell, and have the user export the values.
  Never `$NAME`: the shell would expand it and the secret would reach the recording.
- **Values in the instruction text.** A name, amount or date written in the instruction becomes a
  parameter. Declare the value that must differ between runs with `var runid=demo`; every `demo` in
  later instructions becomes a `{{runid}}` slot, so each test run creates fresh records.
- **One outcome per `do`.** Don't pack unrelated checks into one instruction. Put navigation on
  `open`, which needs no model.
- **Assertions you want enforced** go in `assert` with the expected value written in the sentence:
  `assert "the ticket list shows 'demo Bench' with status Open"`. A recorded assert can't be skipped
  and has no recovery: it fails the test when it does not hold.

## 2. Record

```sh
sitelooper init        # once per project: writes sitelooper.config.json
sitelooper --session t1 --learn open http://localhost:3000
sitelooper --session t1 var runid=demo
sitelooper --session t1 do 'Sign in as {{env:TEST_USER}} using {{env:TEST_PASSWORD}} and verify the dashboard opens'
sitelooper --session t1 do "Create a ticket titled 'demo Bench'; verify it appears in the list and report its id"
sitelooper --session t1 assert "the ticket list shows 'demo Bench' with status Open"
sitelooper --session t1 stop --save-flow ticket
sitelooper flow export ticket --out .sitelooper/procedures.json
```

Check each `do` before the next: exit `0` succeeded, `1` failed or blocked, `2` setup error. Add
`--json` to get the report, and read its `summary`. If a step failed, don't move on. Read the report,
fix the instruction (usually by splitting it or naming the control), and run it again in the same
session. A step that changed the app but did not succeed is redone by `build`, but the flow is
cleaner if you get it right now.

## 3. Build and prove the spec

`build` needs fresh state before each run. Ask the user which applies:

- A command that resets the app's data: `--reset-cmd "npm run reset:e2e"`, or `resetCommand` in
  `sitelooper.config.json`. With it, `build` also converges: it re-records any step the compiler
  refuses or the spec fails on (up to 2 rounds; this calls the model for those steps only).
- Playwright fixtures that already create fresh data: `--fixture-isolation`.

```sh
sitelooper build ticket --var runid=test-{n} --reset-cmd "npm run reset:e2e"
npx playwright test tests/sitelooper/ticket.spec.ts
```

`{n}` becomes the run number, so the three readiness runs use distinct values. Readiness means
three clean, retry-free runs with every step executed, no skip and no locator fallback deciding
what a run acts on. Evidence goes to `<name>.readiness.json`.

- Exit `0`: ready. Exit `4`: the spec or readiness failed. Exit `3`: replay did not converge.
- A refusal prints a diagnostic with a code (for example `needs-rerecord`, `demoted-pin`,
  `omitted-work`, `cut-procedure`) and the exact command that fixes it. Run that command; don't
  hand-edit the generated `.flow.ts`.
- If there is no reset command and no fixtures, say plainly that readiness cannot be verified, and
  run `sitelooper compile ticket` for an unverified spec only if the user wants one.

If the test will be contributed to another project or reviewed by people, add `--style readable`
to `build` (or `"style": "readable"` in `sitelooper.config.json`). The `.flow.ts` is then plain
Playwright code a reviewer can read, with one locator per action and no run-time fallback, so an
app change fails the test at the step that broke. The default (`runtime`) file heals small locator
changes but is large and not meant to be read. A recompile keeps the file's style.

## 4. Hand over

Tell the user what was produced and what to commit:

- `tests/sitelooper/ticket.flow.ts`: generated. sitelooper refreshes it on every compile. A readable
  one is still generated: change it by re-recording, not by editing it.
- `tests/sitelooper/ticket.spec.ts`: theirs. Add business assertions and fixtures here; recompiling
  never overwrites it.
- `.sitelooper/procedures.json` and `sitelooper.config.json`: needed to recompile on another machine.
- In CI the spec runs under plain `npx playwright test`. The environment needs the variables the
  `{{env:...}}` markers name (the spec checks them), not an LLM key.

Report honestly: which steps were recorded, whether readiness passed, and any warning `build`
printed. A spec that compiled but was not verified is not a ready test.

When a compiled spec later fails in CI, use the `fix-browser-test` skill. For the rest of the CLI
(sessions, `peek`, `screenshot`, briefs, recording video), see the `sitelooper` skill.
