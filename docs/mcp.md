# MCP server

`sitelooper mcp` starts a stdio MCP server. Each tool runs the sitelooper CLI with `--json` and
returns a short summary plus the JSON result. Nothing else is in the server: sessions, flows,
recordings and specs are the same files the terminal commands use. You can start a recording in
your editor and carry on from a terminal with the same `--session` name.

Setup for each client is in the [README](../README.md#mcp-server). Use the pinned command
`npx -y sitelooper@0.7.0 mcp`.

The server reads the model key from its environment. It never accepts a key as a tool argument.
Put the key in your shell or use your client's prompted input. Avoid writing it into a JSON file.

## Tools

Every tool except `job_status` takes an optional `cwd` (an absolute directory, default the server's
working directory). The browser tools (`open` to `save_flow`, and `stop`) also take `session`
(default `"default"`). Unknown inputs are refused, not ignored.

| Tool | Inputs | Runs |
|---|---|---|
| `open` | `url`, `learn?`, `headed?` | `--session S [--learn] [--headed] open <url>` |
| `do` | `instruction`, `timeout_s?`, `max_turns?` | `--session S --progress do --stdin` |
| `assert` | `condition`, `timeout_s?` | `--session S --progress assert --stdin` |
| `set_var` | `name`, `value` | `--session S var name=value` |
| `peek` | `selector?`, `interactive?` | `--session S peek` |
| `screenshot` | `full_page?` | `--session S screenshot <tmpfile>`; returns the PNG as image content and the path |
| `save_flow` | `name`, `bundle?` (default `.sitelooper/procedures.json`) | `stop --save-flow <name>`, then `flow export <name> --out <bundle>` |
| `list_flows` | none | `flow list` |
| `build_start` | `flow`, `vars?`, `fixture_isolation?`, `converge?` | `build <flow>` as a job |
| `check` | `flow_file`, `ready?`, `runs?`, `fixture_isolation?`, `vars?` | `check <file.flow.ts>`. With `ready` it is a job; otherwise it returns directly |
| `repair_propose` | `flow_file`, `proposal_file`, `vars?` | `repair <file.flow.ts> --propose <proposal.json>` as a job |
| `repair_apply` | `proposal_file` | `repair apply <proposal.json>` |
| `rerecord` | `flow`, `step_id`, `instruction?`, `runs?`, `vars?` | `rerecord <flow> <step-id>` as a job |
| `job_status` | `job_id`, `wait_s?` (long-poll, up to 50 s) | reads the job table |
| `sessions` | none | `session list` |
| `stop` | `session?` | `--session S stop` |
| `doctor` | none | `doctor` |

`do` and `assert` send the instruction on stdin, so quotes and `$` in the text are not a problem.

A tool result has `isError: true` when the CLI exits 1, 2, 3 or 4. The text says what the code means:
`0` success, `1` agent or recording failure, `2` unavailable or invalid input, `3` replay did not
converge, `4` compiled spec or readiness failure.

## Jobs

`build_start`, `check` with `ready`, `repair_propose` and `rerecord` can take minutes. They return
`{ "job_id": "..." }` at once and keep running in the server. Call `job_status` with the id:

- While running it returns `status: "running"` and the last 40 or so progress lines.
- When finished it returns `status: "done"` or `"failed"` with the final JSON and exit code.
- `wait_s` makes the call wait up to 50 seconds for a change, so you can poll without a tight loop.

The job table is in the server's memory. If the client restarts the server, running jobs are lost.
Start them again; the files they wrote are still on disk.

## Progress

`do` and `assert` run in the foreground. While they run, the server forwards each progress line as an
MCP progress notification, if the client sent a progress token with the request. Cancelling the call
in the client stops waiting, but the session's daemon finishes the instruction it was given; call
`stop` for that session to abort it.

## Safety rules

- Credentials go in instructions only as markers: `{{env:NAME}}` and `{{totp:NAME}}`. Never put a
  secret value in an instruction. The user exports the values in the environment that starts the server.
- Tool arguments cannot set a reset command. `build_start`, `check`, `repair_propose` and `rerecord` use `resetCommand`
  from `sitelooper.config.json`. If you start the server with `SITELOOPER_MCP_ALLOW_RESET_CMD=1`,
  a `reset_cmd` input is accepted. Leave it off unless you trust the model driving the client.
- `cwd` must be an existing absolute directory.
- There is no `--force` and no `--allow-shell-path` in any tool.
- Stdout is the protocol channel. The server writes logs to stderr only.

## Recommended workflow

The same order as the `write-browser-test` skill in [plugin/skills/](../plugin/skills/):

1. `doctor`. If it reports no key, ask the user to set one in their own shell and restart the client.
2. Plan the flow with the user: one verifiable outcome per step, credentials as markers.
3. `open` with `learn: true`, then `set_var` for values that must differ between runs.
4. `do` for each step, reading the report before the next. `assert` for checks that must be enforced,
   with the expected value written in the sentence. If a step fails, fix the instruction and run it
   again in the same session.
5. `save_flow`, which stops the session and exports the bundle.
6. `build_start` with `vars` such as `{ "runid": "test-{n}" }`. Poll `job_status` until done. Exit `0`
   means three clean runs. A refusal names a command that fixes it; use `rerecord` for that, and do not
   hand-edit the generated `.flow.ts`.
7. When a compiled spec later fails: `repair_propose`, review the proposal with the user, then
   `repair_apply`.
8. `stop` any session you leave open.

## Troubleshooting

- **A tool call times out around 60 seconds.** Some clients cap a tool call. `do` and `assert` send
  progress notifications, but not every client lets progress extend the cap. Claude Code's
  per-server `timeout` (milliseconds, in `.mcp.json`) is a hard limit, and progress does not extend it.
  Raise it, or split the instruction into smaller steps. Long operations are jobs, so they are not affected.
- **Server does not start on native Windows.** Some clients cannot spawn `npx` directly because it is
  `npx.cmd`. Use `cmd /c`: `claude mcp add --transport stdio sitelooper -- cmd /c npx -y sitelooper@0.7.0 mcp`,
  or `"command": "cmd", "args": ["/c", "npx", "-y", "sitelooper@0.7.0", "mcp"]` in JSON.
- **"No API key".** The server inherits the environment of the client process. Set the variable
  before starting the client, or use a prompted input. `doctor` shows what the server sees.
- **Garbled protocol errors.** Something wrote to stdout. Run `npx -y sitelooper@0.7.0 mcp` in a terminal;
  it should print nothing until a client connects.
- **Claude Desktop logs.** `%APPDATA%\Claude\logs` on Windows, `~/Library/Logs/Claude` on macOS.
  `mcp-server-sitelooper.log` holds the server's stderr.
