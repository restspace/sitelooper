Run ONE held-out comparison box: BOTH arms (sitelooper and e2e) on the same app, one after the other, and publish each arm's raw results. Read notes/HELDOUT-PROTOCOL.md first; this box is repetition 1 of app mealie. Follow bench/CLOUD-RUNBOOK.md only for what is not overridden below. The overrides are mandatory.

TARGET: mealie   SITELOOPER RUNID BASE: hsml1   E2E RUNID BASE: heml1   MODEL: openai/gpt-6-luna   TASK: bench/tasks/mealie-recipe-flow.md   ORDER: sitelooper first, then e2e

1. Code: git fetch origin && git checkout -B bench/heldout origin/bench/heldout && npm run build   (never push main or bench/heldout). Record `git log --oneline -1` and `git diff --stat e34fd2d7 HEAD -- src test package.json`, which MUST print nothing (sitelooper's code is frozen at main e34fd2d7); if it prints anything, STOP and report.
2. Setup ALREADY RAN (node, build, browser; see /tmp/setup.log), but the app stacks were started from the environment's cached files, which may predate fixes on this branch. Do NOT run cloud-setup.sh. Recreate THIS box's app from the checked-out files, on a fresh volume (1-5 minutes; it ends with `mealie: up, seeded and reset`):
   mkdir -p bench/results && bash bench/heldout/bring-up.sh mealie 2>&1 | tee bench/results/hsml1-bring-up.log
   If it exits non-zero, paste its output verbatim and STOP. Record `node --version`.
   OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line. Do not edit shell startup files.
3. Long commands: start each sweep with the Bash tool's run_in_background: true and wait for its completion notification. Do NOT use the Monitor tool and do not chain sleep. Check progress only with short calls such as `tail -5 <log>`.
4. SITELOOPER ARM (base hsml1). Exports (put them at the start of the command, or in a script under /tmp that the command sources; never in a shell startup file):
   export SITELOOPER_PROVIDER=openrouter SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash SITELOOPER_FALLBACK_MODEL=openai/gpt-6-luna SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}' SITELOOPER_SOURCING_HOLD=on
   Confirm first: `sitelooper config --session cfgcheck` names deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
   Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app; 30-120 minutes):
   node bench/sweep.mjs --k 3 --base hsml1 --learn bench/results/hsml1-skills --flow hsml1 --verify-cmd "node bench/verify-mealie.mjs" --arm sitelooper --target mealie --task bench/tasks/mealie-recipe-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --coarse --granularity objective --out bench/results 2>&1 | tee bench/results/hsml1-sweep.log
   Compiled script, after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/hsml1.json --skills bench/results/hsml1-skills --tag hsml1-spec --target mealie --reset --out bench/results 2>&1 | tee bench/results/hsml1-spec-run.log
   node bench/verify-mealie.mjs hsml1-spec 2>&1 | tee bench/results/hsml1-spec-verify.log
   If the flow is not compilable (compile exit 2) that is a legitimate result: keep bench/results/hsml1-spec-compile.log and skip the verifier. Never recompile with --allow-demoted or any override.
   Publish, ONE command on its own, before reading any result: node bench/publish-results.mjs --base hsml1
5. E2E ARM (base heml1). Install it once: (cd bench/e2e-arm && npm ci) — this installs exactly the packages pinned in bench/e2e-arm/package-lock.json, committed in this repository: e2e (the tool under test), its Playwright engine, the AI SDK with its OpenRouter provider, and zod; it talks only to the local app and OpenRouter. Record `E2E_TELEMETRY_DISABLED=1 node bench/e2e-arm/node_modules/e2e/dist/cli/bin.js --version` (expected 0.16.0).
   Sweep (record, two replays against a reset app, a strict-cache run; 15-90 minutes; under a node older than 22.12 run it as `npx -y node@22 bench/e2e-sweep.mjs …`):
   node bench/e2e-sweep.mjs --target mealie --base heml1 --out bench/results 2>&1 | tee bench/results/heml1-e2e-sweep.log
   If e2e's first run fails because its browser or a system library is missing, run `(cd bench/e2e-arm && npx playwright install --with-deps chromium)` once, then start this sweep again with base heml1b, and report it.
   Publish, ONE command on its own, before reading any result: node bench/publish-results.mjs --base heml1

A failed objective, a turn cap, a spend cap, a non-compilable flow, a REPLAY_STALE or a crash is a legitimate result for either arm: do not massage it, do not change any code, config, task or test, and do not retry a run unless the box itself failed (then once, with a new base suffixed b, and report both).

REPORT, verbatim, per arm:
- sitelooper: the sweep's final table and every verifier summary and FAIL/DUPLICATE/EXTRA line for n1, n2, n3 and the spec run; for n2 and n3 every step's id, tier, turns and fellBack from bench/results/hsml1-n2-flowrun.json and -n3-flowrun.json; the compiled script's exit code, driftCount, every test error, or the compile log if it refused; total_usd and wall time per run.
- e2e: the block after `=== e2e sweep summary ===`; every verifier summary and FAIL/DUPLICATE/EXTRA line for n1, n2, n3 and strict; the "AI" and "Cache" lines of each run log.
- both: git log --oneline -1, the branches pushed, any model-side error (HTTP 4xx/5xx, empty turns, MODEL_PROVIDER_FAILED, STEP_TIMEOUT), and anything you had to install or change to make it run.

Clean up at the end: stop any browser or sitelooper daemon you started.
NEVER end your turn while a sweep is running: wait on the background job's completion notification.
