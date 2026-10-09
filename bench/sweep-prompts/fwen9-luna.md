Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, then the product's own `sitelooper build` (convergence and the readiness gate), and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: erpnext   RUNID: fwen9-luna   TASK: bench/tasks/erpnext-sales-order-flow.md

OVERRIDES
1. Code: use the branch `bench/hard5b` (main bfeabd26 plus this prompt and bench/heldout/converge-build.mjs; no source changes):
   git fetch origin && git checkout -B bench/hard5b origin/bench/hard5b && npm run build
   (The box's local main can be an unrelated old history; never push main or bench/hard5b.) Record `git log --oneline -1`. Check: `git diff --stat bfeabd26 HEAD -- src test package.json` must print nothing, and `grep -q 'export function messageAnchor' src/spec/check.ts && grep -q sessionAppMintedPositions src/skills/app-minted-url.ts && test -f src/skills/id-fragments.ts && test -f src/spec/drift-class.ts && test -f bench/heldout/converge-build.mjs && test -f bench/verify-erpnext.mjs` must succeed, else STOP and report rather than sweeping.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file. Put the five exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita. OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   export SITELOOPER_SOURCING_HOLD=on
   Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup ALREADY RAN before this session: the cloud environment's setup script ran bench/cloud-setup.sh (--with-arm-b --with-target erpnext) and logged to /tmp/setup.log. Do NOT run bench/cloud-setup.sh yourself. Check: `tail -5 /tmp/setup.log` must end with the line `EXIT 0`; if the file is missing or the exit is non-zero, paste `tail -40 /tmp/setup.log` verbatim and STOP. Then confirm the erpnext stack is up: `docker ps --format "{{.Names}}"` must list a container whose name contains "erpnext"; if not, paste that output, `tail -40 /tmp/session-start.log` and `grep -n -- "--with-target" /tmp/setup.log | head`, and STOP. Also confirm `test -d dist`.
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwen9-luna --learn bench/results/fwen9-luna-skills --flow fwen9-luna --verify-cmd "node bench/verify-erpnext.mjs" --arm sitelooper --target erpnext --task bench/tasks/erpnext-sales-order-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --coarse --granularity objective --out bench/results 2>&1 | tee bench/results/fwen9-luna-sweep.log
   This can take 30-90 minutes.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all, and do not chain `sleep`. Start every long command (sweep, spec replay, converge) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short Bash calls such as `tail -20 <logfile>`.
5. Compiled script (no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwen9-luna.json --skills bench/results/fwen9-luna-skills --tag fwen9-luna-spec --target erpnext --reset --out bench/results 2>&1 | tee bench/results/fwen9-luna-spec-run.log
   node bench/verify-erpnext.mjs fwen9-luna-spec 2>&1 | tee bench/results/fwen9-luna-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: keep bench/results/fwen9-luna-spec-compile.log and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives may be UNVERIFIABLE for the compiled arm; that is expected and does not count as a failure.
6. The product's own `sitelooper build` (compile, check the spec, converge when needed, then the 3-run readiness gate) on a copy of this recording, WHATEVER step 5's result (it calls the model only if a round re-records; 10-60 minutes):
   node bench/heldout/converge-build.mjs --from fwen9-luna --target erpnext --rounds 2 2>&1 | tee bench/results/fwen9-luna-cv-wrapper.log
7. Publish (a results branch, never main). After steps 4-6, before any report item below, run this ONE command and nothing else until it returns:
   node bench/publish-results.mjs --base fwen9-luna
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself.

WHAT THIS IS (2026-10-09): a re-sweep of gitea and erpnext on main bfeabd26, after the fixes from the 2026-10-08 sweep (fwgt35-luna, fwen8-luna): (1) convergence re-records the step an error names at its start, not the stack anchor's step (fwen8 re-recorded 04-create when 05-add's start gate refused); (2) an address the app minted in an earlier instruction becomes `:var` in later instructions too (fwen8 05-add froze new-sales-order-uxvwbpigvk); (5a) a css candidate's record id is slotted when it is the run's own value, and an id the recording never showed is dropped when another non-point candidate remains; (5b) readiness and convergence share one drift classifier: a fallback on a report-only read is a readiness WARNING, a fallback on a gesture or on a read a later step uses blocks (fwgt35's converged spec passed but build exited 4 on five read-back fallbacks). Same model setup as the latest Luna sweeps; no agent-browser arm. If setup, seed or reset fails, paste `tail -60 /tmp/setup.log` verbatim and STOP. If the verifier crashes or scores something obviously wrong, report its output verbatim and say what the app actually holds (query the app read-only), but do not change code.

REPORT, verbatim:
  1. git log --oneline -1, the branch pushed, and anything notable about setup.
  2. Every run's verifier summary (n1, n2, n3) and every FAIL/DUPLICATE/EXTRA line verbatim; for DB-scored objectives confirm the persisted values match the task.
  3. The number of instructions the orchestrator wrote and the first 120 characters of each; n1 turn count per instruction (from fwen9-luna-n1-timing.jsonl), n1 wall time and total_usd.
  4. For each replay (n2, n3), every step: id, tier, turns, fellBack, pinStopped (if present) and the stored procedure id it replayed, from bench/results/fwen9-luna-n2-flowrun.json and -n3-flowrun.json, plus every warning verbatim. For any step taking model turns, the reason verbatim. Wall time and total_usd per run.
  5. The export warnings after run 1 (the lines after `stopped: fwen9-luna-n1`), especially any containing "adopted", "omitted", "NOT in the flow", "REFUSE" or "re-record".
  6. The compiled script: did it compile (quote fwen9-luna-spec-compile.log diagnostics verbatim if not, and every warning such as omitted-work, unchecked-commit, unproven-pin even if it compiled), the last line of fwen9-luna-spec-run.log, every `[sitelooper warn]`/`[sitelooper skip]` line, stats, exitCode, driftCount, every test error (including any `persistence:` or `PARTIAL:` message), and the full verifier output.
  7. Step 6: build's exit code; the last 25 lines of bench/results/fwen9-luna-cv-build.log; from fwen9-luna-cv-build.json the converge status, why, modelTurns and each round (compile outcome and codes; check passed, step and drift; rerecord step and turns), and the readiness object's outcome, executionVerified, blockers, warnings, and each run's clean, blockers, warnings and driftCount; then the full verifier output of fwen9-luna-cv-spec.
  8. Any step that PASSES while a verifier objective FAILS; any duplicate record or extra mutation; any step skipped as "already in effect"; any value published on n2/n3 that belongs to another run.
  9. Any model-side error (HTTP 4xx/5xx, empty turns, MODEL_PROVIDER_FAILED, STEP_TIMEOUT), and anything you had to install or change to make it run.
  10. The sign-in must appear in bench/results-published only as `{{env:APP_PASSWORD}}`: report `grep -rc '{{env:APP_PASSWORD}}' bench/results-published/fwen9-luna*` (only AFTER the push).

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code, config, task or test. Clean up at the end: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep, the compiled replay or the convergence run is running, not even with a wakeup scheduled: a run whose session goes idle is lost. Wait on the background job's completion notification.
