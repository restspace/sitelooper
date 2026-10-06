Run ONE held-out-2 box: BOTH arms (after = feat/spec-reliability, before = main e34fd2d7) on the same app, one after the other, and publish each arm's raw results. Read notes/HELDOUT2-PROTOCOL.md first; this box is repetition 3 of app grocy. Follow bench/CLOUD-RUNBOOK.md only for what is not overridden below. The overrides are mandatory.

TARGET: grocy   AFTER RUNID BASE: hagc3   BEFORE RUNID BASE: hbgc3   MODEL: openai/gpt-6-luna   TASK: bench/tasks/grocy-product-flow.md   ORDER: after first, then before

1. Code: cd /home/user/sitelooper && git fetch origin && git checkout -B bench/heldout2 origin/bench/heldout2 && npm run build   (never push main, bench/heldout2 or feat/spec-reliability). Record `git log --oneline -1` and `git diff --stat 4e901145 HEAD -- src test package.json`, which MUST print nothing (the after arm's code is feat/spec-reliability 4e901145); if it prints anything, STOP and report.
2. Setup ALREADY RAN (node, build, browser; see /tmp/setup.log), and the environment may also have started other held-out apps; ignore them. Do NOT run cloud-setup.sh. Bring THIS box's app up from the checked-out files, on a fresh volume (1-5 minutes; it ends with `grocy: up, seeded and reset`):
   mkdir -p bench/results && bash bench/heldout/bring-up.sh grocy 2>&1 | tee bench/results/hagc3-bring-up.log
   If it exits non-zero, paste its output verbatim and STOP. Record `node --version`.
   OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line. Do not edit shell startup files.
3. Long commands: start each sweep with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool and do not chain sleep. Check progress only with short calls such as `tail -5 <log>`.
4. AFTER ARM (base hagc3; code = this checkout, /home/user/sitelooper, feat/spec-reliability). Exports (put them at the start of the command, or in a script under /tmp that the command sources; never in a shell startup file):
   export SITELOOPER_PROVIDER=openrouter SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}' SITELOOPER_SOURCING_HOLD=on
   Confirm first, in /home/user/sitelooper: `command -v sitelooper` is NOT /tmp/before-bin/sitelooper, `sitelooper config --session cfgcheck` names deepseek/deepseek-v4.1-flash, then `sitelooper stop --all`.
   cd /home/user/sitelooper
   Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app; 30-120 minutes):
   node bench/sweep.mjs --k 3 --base hagc3 --learn bench/results/hagc3-skills --flow hagc3 --verify-cmd "node bench/verify-grocy.mjs" --arm sitelooper --target grocy --task bench/tasks/grocy-product-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --coarse --granularity objective --out bench/results 2>&1 | tee bench/results/hagc3-sweep.log
   Compiled script, after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/hagc3.json --skills bench/results/hagc3-skills --tag hagc3-spec --target grocy --reset --out bench/results 2>&1 | tee bench/results/hagc3-spec-run.log
   node bench/verify-grocy.mjs hagc3-spec 2>&1 | tee bench/results/hagc3-spec-verify.log
   If the flow is not compilable (compile exit 2) that is a legitimate result: keep bench/results/hagc3-spec-compile.log and skip the verifier. Never recompile with --allow-demoted or any override.
   Then, ONLY if the spec run's verifier did not print all state objectives PASS (or the flow was not compilable): the product's own convergence loop on a copy of this recording (model-using; 10-60 minutes):
   node bench/heldout/converge-build.mjs --from hagc3 --target grocy --rounds 2 2>&1 | tee bench/results/hagc3-cv-wrapper.log
   Then `sitelooper stop --all`.
   Publish, ONE command on its own, before reading any result: node bench/publish-results.mjs --base hagc3
5. BEFORE ARM (base hbgc3; code = main e34fd2d7 in /tmp/before). Prepare it once, from /home/user/sitelooper:
   git worktree add -f /tmp/before HEAD && cd /tmp/before && git restore --source=e34fd2d7 --staged --worktree -- src test package.json package-lock.json && npm ci && npm run build
   mkdir -p /tmp/before-bin && printf '#!/bin/sh\nexec node /tmp/before/bin/sitelooper.js "$@"\n' > /tmp/before-bin/sitelooper && chmod +x /tmp/before-bin/sitelooper
   Check: `cd /tmp/before && git diff --stat e34fd2d7 -- src test package.json` prints nothing and `test ! -f src/spec/converge.ts`; else STOP and report.
   Every command of this arm runs with `export PATH=/tmp/before-bin:$PATH` and the same exports as the after arm:
   export SITELOOPER_PROVIDER=openrouter SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}' SITELOOPER_SOURCING_HOLD=on
   Confirm first: `command -v sitelooper` prints /tmp/before-bin/sitelooper, `sitelooper config --session cfgcheck` names deepseek/deepseek-v4.1-flash, then `sitelooper stop --all`.
   cd /tmp/before
   Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app; 30-120 minutes):
   node bench/sweep.mjs --k 3 --base hbgc3 --learn bench/results/hbgc3-skills --flow hbgc3 --verify-cmd "node bench/verify-grocy.mjs" --arm sitelooper --target grocy --task bench/tasks/grocy-product-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --coarse --granularity objective --out bench/results 2>&1 | tee bench/results/hbgc3-sweep.log
   Compiled script, after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/hbgc3.json --skills bench/results/hbgc3-skills --tag hbgc3-spec --target grocy --reset --out bench/results 2>&1 | tee bench/results/hbgc3-spec-run.log
   node bench/verify-grocy.mjs hbgc3-spec 2>&1 | tee bench/results/hbgc3-spec-verify.log
   If the flow is not compilable (compile exit 2) that is a legitimate result: keep bench/results/hbgc3-spec-compile.log and skip the verifier. Never recompile with --allow-demoted or any override.
   Then `sitelooper stop --all` (with the before PATH).
   Publish, ONE command on its own, from /tmp/before, before reading any result: node bench/publish-results.mjs --base hbgc3

A failed objective, a turn cap, a spend cap, a non-compilable flow, a refused compile or a crash is a legitimate result for either arm: do not massage it, do not change any code, config, task or test, and do not retry a run unless the box itself failed (then once, with a new base suffixed b, and report both).

REPORT, verbatim, per arm:
- the sweep's final table and every verifier summary and FAIL/DUPLICATE/EXTRA line for n1, n2, n3 and the spec run; for n2 and n3 every step's id, tier, turns, fellBack (and pinStopped, if present) from bench/results/<base>-n2-flowrun.json and -n3-flowrun.json; the compiled script's exit code, driftCount, every test error, or the compile log's diagnostics if it refused; total_usd and wall time per run.
- after arm only: if converge-build ran, the last 15 lines of bench/results/hagc3-cv-build.log and the verifier summary of hagc3-cv-spec.
- both: git log --oneline -1, the branches pushed, any model-side error (HTTP 4xx/5xx, empty turns, MODEL_PROVIDER_FAILED, STEP_TIMEOUT), and anything you had to install or change to make it run.

Clean up at the end: stop any browser or sitelooper daemon you started (`sitelooper stop --all` with each arm's PATH).
NEVER end your turn while a sweep is running: wait on the background job's completion notification.
