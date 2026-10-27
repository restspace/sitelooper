Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: grafana   RUNID: fwgr90-dg   TASK: bench/tasks/grafana-dashboard-flow.md

OVERRIDES
1. Code: use the branch `bench/delta-sweep` (feat/delta-gates plus these prompts; source commit da74e75b):
   git fetch origin && git checkout -B bench/delta-sweep origin/bench/delta-sweep && npm run build
   (The box's local main can be an unrelated old history; never push main or bench/delta-sweep.) Record `git log --oneline -1`. Check: `git diff --stat da74e75b HEAD -- src test package.json` must print nothing, and `test -f src/execution/shadow.ts && test -f src/execution/delta.ts && grep -q goalNamesRunValue src/daemon/server.ts && test -f bench/verify-grafana.mjs` must succeed, else STOP and report rather than sweeping.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the five exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita. OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   export SITELOOPER_SOURCING_HOLD=on
   Do NOT set SITELOOPER_SHADOW (the warn-only checks must stay on). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup ALREADY RAN before this session: the cloud environment's setup script ran bench/cloud-setup.sh (--with-arm-b --with-target grafana) and logged to /tmp/setup.log. Do NOT run bench/cloud-setup.sh yourself. Check: `tail -5 /tmp/setup.log` must end with the line `EXIT 0`; if the file is missing or the exit is non-zero, paste `tail -40 /tmp/setup.log` verbatim and STOP. Then confirm the grafana stack is up: `docker ps --format "{{.Names}}"` must list a container whose name contains "grafana"; if not, paste that output, `tail -40 /tmp/session-start.log` and `grep -n -- "--with-target" /tmp/setup.log | head`, and STOP. Also confirm `test -d dist`.
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwgr90-dg --learn bench/results/fwgr90-dg-skills --flow fwgr90-dg --verify-cmd "node bench/verify-grafana.mjs" --arm sitelooper --target grafana --task bench/tasks/grafana-dashboard-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --coarse --granularity objective --out bench/results 2>&1 | tee bench/results/fwgr90-dg-sweep.log
   This can take 30-90 minutes.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all, and do not chain `sleep`. Start every long command (sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 <logfile>`.
5. Compiled script (no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwgr90-dg.json --skills bench/results/fwgr90-dg-skills --tag fwgr90-dg-spec --target grafana --reset --out bench/results 2>&1 | tee bench/results/fwgr90-dg-spec-run.log
   node bench/verify-grafana.mjs fwgr90-dg-spec 2>&1 | tee bench/results/fwgr90-dg-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: keep bench/results/fwgr90-dg-spec-compile.log and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives may be UNVERIFIABLE for the compiled arm; that is expected. There is no convergence/build step in this sweep.
6. Publish (a results branch, never main). After steps 4-5, before any report item below, run this ONE command and nothing else until it returns:
   node bench/publish-results.mjs --base fwgr90-dg
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself.

WHAT THIS IS (2026-10-27): a five-app sweep (repairdesk, odoo, grafana, gitea, espocrm) of branch feat/delta-gates. New since main 0.7.0: (a) an "already satisfied" skip now requires the step's goal text to name a value of this run, else the step replays (every such skip on record was a false pass); (b) warn-only "shadow" checks that print `[shadow:delta] …` / `[shadow:read] …` findings on replay step results (flowrun.json `shadow` fields) and `[sitelooper shadow] …` lines in the compiled run, and change no verdict; (c) two RepairDesk read fixes (a part-name read pinned to the first table row; a read taken before a deleted row had gone). The point is to measure what the shadow checks flag on real runs against the DB verifier. Same model setup as the latest Luna sweeps; no agent-browser arm. If setup, seed or reset fails, paste `tail -60 /tmp/setup.log` verbatim and STOP. If the verifier crashes or scores something obviously wrong, report its output verbatim, but do not change code.

REPORT, verbatim:
  1. git log --oneline -1, the branch pushed, and anything notable about setup.
  2. Every run's verifier summary (n1, n2, n3, spec) and every FAIL/DUPLICATE/EXTRA line verbatim.
  3. For each replay (n2, n3), every step: id, tier, turns, fellBack, satisfied (if present) and every `shadow` and `warnings` entry verbatim, from bench/results/fwgr90-dg-n2-flowrun.json and -n3-flowrun.json. Also every line of fwgr90-dg-sweep.log containing "replaying rather than skipping" or "already satisfied". Wall time and total_usd per run.
  4. The compiled script: compiled or not (diagnostics verbatim if not), the last line of fwgr90-dg-spec-run.log, every `[sitelooper shadow]`, `[sitelooper satisfied]`, `[sitelooper warn]` and `[sitelooper skip]` line, stats, exitCode, every test error, and the full verifier output.
  5. Any step that PASSES while a verifier objective FAILS, and whether a shadow finding named that step.
  6. Any model-side error (HTTP 4xx/5xx, empty turns, MODEL_PROVIDER_FAILED, STEP_TIMEOUT), and anything you had to install or change to make it run.
  7. The sign-in must appear in bench/results-published only as `{{env:APP_PASSWORD}}`: report `grep -rc '{{env:APP_PASSWORD}}' bench/results-published/fwgr90-dg*` (only AFTER the push).

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code, config, task or test. Clean up at the end: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep or the compiled replay is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
