Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: ghost   RUNID: fwgh21-fr   TASK: bench/tasks/ghost-post-flow.md

OVERRIDES
1. Code: use the branch `bench/fault-sweep` (feat/fault-readiness plus these prompts; source commit f0d05a6b):
   git fetch origin && git checkout -B bench/fault-sweep origin/bench/fault-sweep && npm run build
   (The box's local main can be an unrelated old history; never push main or bench/fault-sweep.) Record `git log --oneline -1`. Check: `git diff --stat f0d05a6b HEAD -- src test package.json` must print nothing, and `grep -q recordedAsNavigation src/execution/recover.ts && grep -q lineShownWhole src/execution/snapshot.ts && grep -q faultHere src/spec/emit.ts && test -f bench/verify-ghost.mjs` must succeed, else STOP and report rather than sweeping.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the five exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita. OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   export SITELOOPER_SOURCING_HOLD=on
   Do NOT set SITELOOPER_SHADOW (the warn-only checks must stay on) and do NOT set SITELOOPER_FAULT. Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup ALREADY RAN before this session: the cloud environment's setup script ran bench/cloud-setup.sh (--with-arm-b --with-target ghost) and logged to /tmp/setup.log. Do NOT run bench/cloud-setup.sh yourself. Check: `tail -5 /tmp/setup.log` must end with the line `EXIT 0`; if the file is missing or the exit is non-zero, paste `tail -40 /tmp/setup.log` verbatim and STOP. Then confirm the ghost stack is up: `docker ps --format "{{.Names}}"` must list a container whose name contains "ghost"; if not, paste that output, `tail -40 /tmp/session-start.log` and `grep -n -- "--with-target" /tmp/setup.log | head`, and STOP. Also confirm `test -d dist`.
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwgh21-fr --learn bench/results/fwgh21-fr-skills --flow fwgh21-fr --verify-cmd "node bench/verify-ghost.mjs" --arm sitelooper --target ghost --task bench/tasks/ghost-post-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --coarse --granularity objective --out bench/results 2>&1 | tee bench/results/fwgh21-fr-sweep.log
   This can take 30-90 minutes.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all, and do not chain `sleep`. Start every long command (sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 <logfile>`.
5. Compiled script (no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwgh21-fr.json --skills bench/results/fwgh21-fr-skills --tag fwgh21-fr-spec --target ghost --reset --out bench/results 2>&1 | tee bench/results/fwgh21-fr-spec-run.log
   node bench/verify-ghost.mjs fwgh21-fr-spec 2>&1 | tee bench/results/fwgh21-fr-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: keep bench/results/fwgh21-fr-spec-compile.log and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives may be UNVERIFIABLE for the compiled arm; that is expected. There is no convergence/build step and no --faults run in this sweep.
6. Publish (a results branch, never main). After steps 4-5, before any report item below, run this ONE command and nothing else until it returns:
   node bench/publish-results.mjs --base fwgh21-fr
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself.

WHAT THIS IS (2026-11-11): an eleven-app sweep of branch feat/fault-readiness, to see whether two tightened replay rules stop anything that used to pass. (a) A click whose target is gone is reached through its recorded url only when the recording shows the click as navigation and nothing else, and the page reached must show the recorded lines carrying the run's own values; before, any click with a recorded url qualified. A refusal reads as an ordinary "no element matched" stop; an arrival that fails reads "…recorded destination…, but after step …". (b) A recorded page change is matched as a whole line: an unchecked box is no longer shown by a checked one, an enabled control by a disabled one, an empty field by a filled one, or a value by a longer one continuing the same word or number. A step that passed only on such a match now stops with "none of the N recorded page change(s) appeared" or "did not show …". The branch also adds fault runs to readiness (`--faults`), which this sweep does not use. Same model setup as the latest Luna sweeps; no agent-browser arm. If setup, seed or reset fails, paste `tail -60 /tmp/setup.log` verbatim and STOP. If the verifier crashes or scores something obviously wrong, report its output verbatim, but do not change code.

REPORT, verbatim:
  1. git log --oneline -1, the branch pushed, and anything notable about setup.
  2. Every run's verifier summary (n1, n2, n3, spec) and every FAIL/DUPLICATE/EXTRA line verbatim.
  3. For each replay (n2, n3), every step: id, tier, turns, fellBack, satisfied (if present) and every `shadow` and `warnings` entry verbatim, from bench/results/fwgh21-fr-n2-flowrun.json and -n3-flowrun.json. Wall time and total_usd per run.
  4. Every line of fwgh21-fr-sweep.log, and every reason or warning in the two flowrun files, containing any of: "recorded page change", "did not show", "recorded destination", "no element matched", "found on the page instead". Say for each which step it belongs to.
  5. The compiled script: compiled or not (diagnostics verbatim if not), the last line of fwgh21-fr-spec-run.log, every `[sitelooper drift]`, `[sitelooper shadow]`, `[sitelooper warn]` and `[sitelooper skip]` line, stats, exitCode, every test error, and the full verifier output.
  6. Any step that PASSES while a verifier objective FAILS.
  7. Any model-side error (HTTP 4xx/5xx, empty turns, MODEL_PROVIDER_FAILED, STEP_TIMEOUT), and anything you had to install or change to make it run.
  8. The sign-in must appear in bench/results-published only as `{{env:APP_PASSWORD}}`: report `grep -rc '{{env:APP_PASSWORD}}' bench/results-published/fwgh21-fr*` (only AFTER the push).

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code, config, task or test. Clean up at the end: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep or the compiled replay is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
