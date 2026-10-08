Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, then (only if that script was not clean) the product's own convergence loop, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: openproject   RUNID: fwop35-luna   TASK: bench/tasks/openproject-work-package-flow.md

OVERRIDES
1. Code: use the branch `bench/hard5` (main f535c191 plus this prompt and bench/heldout/converge-build.mjs; no source changes):
   git fetch origin && git checkout -B bench/hard5 origin/bench/hard5 && npm run build
   (The box's local main can be an unrelated old history; never push main or bench/hard5.) Record `git log --oneline -1`. Check: `git diff --stat f535c191 HEAD -- src test package.json` must print nothing, and `test -f src/spec/converge.ts && grep -q 'omittedDiagnostics' src/spec/ir.ts && grep -q 'decideBuildConvergence' src/cli.ts && test -f bench/heldout/converge-build.mjs && test -f bench/verify-openproject.mjs` must succeed, else STOP and report rather than sweeping.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the five exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita. OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   export SITELOOPER_SOURCING_HOLD=on
   Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup ALREADY RAN before this session: the cloud environment's setup script ran bench/cloud-setup.sh (--with-arm-b --with-target openproject) and logged to /tmp/setup.log. Do NOT run bench/cloud-setup.sh yourself. Check: `tail -5 /tmp/setup.log` must end with the line `EXIT 0`; if the file is missing or the exit is non-zero, paste `tail -40 /tmp/setup.log` verbatim and STOP. Then confirm the openproject stack is up: `docker ps --format "{{.Names}}"` must list a container whose name contains "openproject"; if not, paste that output, `tail -40 /tmp/session-start.log` and `grep -n -- "--with-target" /tmp/setup.log | head`, and STOP. Also confirm `test -d dist`.
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwop35-luna --learn bench/results/fwop35-luna-skills --flow fwop35-luna --verify-cmd "node bench/verify-openproject.mjs" --arm sitelooper --target openproject --task bench/tasks/openproject-work-package-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --coarse --granularity objective --out bench/results 2>&1 | tee bench/results/fwop35-luna-sweep.log
   This can take 30-90 minutes.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all, and do not chain `sleep`. Start every long command (sweep, spec replay, converge) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 <logfile>`.
5. Compiled script (no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwop35-luna.json --skills bench/results/fwop35-luna-skills --tag fwop35-luna-spec --target openproject --reset --out bench/results 2>&1 | tee bench/results/fwop35-luna-spec-run.log
   node bench/verify-openproject.mjs fwop35-luna-spec 2>&1 | tee bench/results/fwop35-luna-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: keep bench/results/fwop35-luna-spec-compile.log and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives may be UNVERIFIABLE for the compiled arm; that is expected and does not count as a failure.
6. Convergence (the product's default `sitelooper build` behaviour since main f535c191; model-using, 10-60 minutes). ONLY if step 5's verifier printed any FAIL (or the flow was not compilable), run it on a copy of this recording:
   node bench/heldout/converge-build.mjs --from fwop35-luna --target openproject --rounds 2 2>&1 | tee bench/results/fwop35-luna-cv-wrapper.log
   If step 5 was clean, skip this step and say so.
7. Publish (a results branch, never main). After steps 4-6, before any report item below, run this ONE command and nothing else until it returns:
   node bench/publish-results.mjs --base fwop35-luna
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself.

WHAT THIS IS (2026-10-08): a five-app status sweep of the hardest targets (gitea, openproject, odoo, espocrm, erpnext) on main f535c191, the first sweep since the spec-reliability work (learn from recoveries, cross-run calibration, no silent passes: PARTIAL fails the compiled spec and persistence probes run after its last step, and build converges by default) and the follow-ups (a recording's last failed mutating work is adopted as a flow step; work still left out is named by an `omitted-work` compile warning). Same model setup as the latest Luna sweeps; no agent-browser arm. If setup, seed or reset fails, paste `tail -60 /tmp/setup.log` verbatim and STOP. If the verifier crashes or scores something obviously wrong, report its output verbatim and say what the app actually holds (query the app read-only), but do not change code.

REPORT, verbatim:
  1. git log --oneline -1, the branch pushed, and anything notable about setup.
  2. Every run's verifier summary (n1, n2, n3) and every FAIL/DUPLICATE/EXTRA line verbatim; for DB-scored objectives confirm the persisted values match the task.
  3. The number of instructions the orchestrator wrote and the first 120 characters of each; n1 turn count per instruction (from fwop35-luna-n1-timing.jsonl), n1 wall time and total_usd.
  4. For each replay (n2, n3), every step: id, tier, turns, fellBack, pinStopped (if present) and the stored procedure id it replayed, from bench/results/fwop35-luna-n2-flowrun.json and -n3-flowrun.json, plus every warning verbatim. For any step taking model turns, the reason verbatim. Wall time and total_usd per run.
  5. The export warnings after run 1 (the lines after `stopped: fwop35-luna-n1`), especially any containing "adopted", "omitted", "NOT in the flow", "REFUSE" or "re-record".
  6. The compiled script: did it compile (quote fwop35-luna-spec-compile.log diagnostics verbatim if not, and every warning such as omitted-work, unchecked-commit, unproven-pin even if it compiled), the last line of fwop35-luna-spec-run.log, every `[sitelooper warn]`/`[sitelooper skip]` line, stats, exitCode, driftCount, every test error (including any `persistence:` or `PARTIAL:` message), and the full verifier output.
  7. If step 6 ran: the last 20 lines of bench/results/fwop35-luna-cv-build.log, the converge status/rounds/model turns from fwop35-luna-cv-build.json, and the full verifier output of fwop35-luna-cv-spec.
  8. Any step that PASSES while a verifier objective FAILS; any duplicate record or extra mutation; any step skipped as "already in effect"; any value published on n2/n3 that belongs to another run.
  9. Any model-side error (HTTP 4xx/5xx, empty turns, MODEL_PROVIDER_FAILED, STEP_TIMEOUT), and anything you had to install or change to make it run.
  10. The sign-in must appear in bench/results-published only as `{{env:APP_PASSWORD}}`: report `grep -rc '{{env:APP_PASSWORD}}' bench/results-published/fwop35-luna*` (only AFTER the push).

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code, config, task or test. Clean up at the end: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep, the compiled replay or the convergence run is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
