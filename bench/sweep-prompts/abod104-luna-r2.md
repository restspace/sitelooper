Run ONE agent-browser benchmark run on this cloud box and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: odoo   RUNID: abod104-luna-r2   ARM: agent-browser   MODEL: openai/gpt-6-luna   TASK: bench/tasks/odoo-sale-flow.md

WHY: the agent-browser comparison for the full GPT-6 Luna batch (sitelooper sweep fwod104-luna). The first agent-browser run on this app (abod104-luna) is INVALID: the task tells the model to type the password as the literal text `{{env:APP_PASSWORD}}`, which only sitelooper resolved, so agent-browser typed it verbatim and never signed in. main now has the harness resolve that reference in the commands it runs for non-sitelooper arms (bench/env-refs.mjs), keeping the reference in the logged command.

1. Code: git fetch origin && git checkout -B main origin/main   (the box's local main can be an unrelated old history; never push main). Record `git log --oneline -1`; `grep -q resolveEnvRefs bench/harness.mjs && test -f bench/env-refs.mjs` must succeed, else STOP and report.
2. Setup ALREADY RAN before this session: the cloud environment's setup script ran bench/cloud-setup.sh (--with-arm-b --with-target odoo) and logged to /tmp/setup.log. Do NOT run bench/cloud-setup.sh yourself. Check: `tail -5 /tmp/setup.log` must end with the line `EXIT 0`, `docker ps --format "{{.Names}}"` must list a container whose name contains "odoo", and `agent-browser --version` must print a version; if any check fails, paste the evidence verbatim and STOP.
   OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line. No SITELOOPER_* exports are needed for this arm. Do not edit shell startup files.
3. Run (start it with the Bash tool's run_in_background: true and wait for its completion notification; 5-40 minutes; do NOT use the Monitor tool and do not chain sleep):
   node bench/harness.mjs --arm agent-browser --target odoo --task bench/tasks/odoo-sale-flow.md --provider openrouter --model openai/gpt-6-luna --maxUsd 3.00 --runid abod104-luna-r2 --out bench/results --reset 2>&1 | tee bench/results/abod104-luna-r2-run.log
   Do not lower --maxTurns. A turn cap, spend cap or failed objective is a legitimate result.
4. node bench/verify-odoo.mjs abod104-luna-r2 2>&1 | tee bench/results/abod104-luna-r2-verify.log
   node bench/score.mjs abod104-luna-r2 2>&1 | tee bench/results/abod104-luna-r2-score.log
5. Publish (a results branch, never main), ONE command: node bench/publish-results.mjs --base abod104-luna-r2
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself.
6. Check the fix, verbatim: from bench/results/abod104-luna-r2-agent-browser-transcript.jsonl, every `cmd` entry whose command contains "fill" (they must show `{{env:APP_PASSWORD}}` or «redacted», never a readable password), and whether sign-in succeeded (the first page text after the sign-in click). Also `grep -c "{{env:APP_PASSWORD}}" bench/results/abod104-luna-r2-agent-browser-transcript.jsonl`.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the verifier output (every objective line); the score table; from bench/results/abod104-luna-r2-agent-browser-result.json: stop reason, turns, commands, total_usd, wall time, orBackends, contextTruncations; every model-side error (HTTP 4xx/5xx, empty turns, parse failures); every `refused` entry in the transcript; the item-6 check.

RULES: do not retry more than once, and report both attempts if you do. Do not change source code. Clean up: stop any browser or agent-browser session you started.
NEVER end your turn while the run is going: wait on the background job's completion notification.
