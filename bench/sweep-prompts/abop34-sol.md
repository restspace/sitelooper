Run ONE agent-browser benchmark run on this cloud box and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: openproject   RUNID: abop34-sol   ARM: agent-browser   MODEL: openai/gpt-6.1-sol   TASK: bench/tasks/openproject-work-package-flow.md

WHY: completes the STRONG-MODEL column for the agent-browser comparison across all ten apps. With GPT-6 Luna, agent-browser scored 7/7 but commented twice on this app (abop34-luna-r2); sitelooper on Luna passed every objective. This run repeats the same agent-browser task with GPT-6.1 Sol (openai/gpt-6.1-sol). Same harness, same task, same verifier; only --model changes. Sol is rate-limited upstream: the harness retries those (k "retry" in the transcript); report how many retries the transcript logs.

1. Code: git fetch origin && git checkout -B main origin/main   (the box's local main can be an unrelated old history; never push main). Record `git log --oneline -1`; `grep -q resolveEnvRefs bench/harness.mjs && test -f bench/env-refs.mjs` must succeed, else STOP and report.
2. Setup ALREADY RAN before this session: the cloud environment's setup script ran bench/cloud-setup.sh (--with-arm-b --with-target openproject) and logged to /tmp/setup.log. Do NOT run bench/cloud-setup.sh yourself. Check: `tail -5 /tmp/setup.log` must end with the line `EXIT 0`, `docker ps --format "{{.Names}}"` must list a container whose name contains "openproject", and `agent-browser --version` must print a version; if any check fails, paste the evidence verbatim and STOP.
   OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line. No SITELOOPER_* exports are needed for this arm. Do not edit shell startup files.
3. Run (start it with the Bash tool's run_in_background: true and wait for its completion notification; 5-40 minutes; do NOT use the Monitor tool and do not chain sleep):
   node bench/harness.mjs --arm agent-browser --target openproject --task bench/tasks/openproject-work-package-flow.md --provider openrouter --model openai/gpt-6.1-sol --maxUsd 3.00 --runid abop34-sol --out bench/results --reset 2>&1 | tee bench/results/abop34-sol-run.log
   Do not lower --maxTurns. A turn cap, spend cap or failed objective is a legitimate result.
4. node bench/verify-openproject.mjs abop34-sol 2>&1 | tee bench/results/abop34-sol-verify.log
   node bench/score.mjs abop34-sol 2>&1 | tee bench/results/abop34-sol-score.log
5. Publish (a results branch, never main), ONE command: node bench/publish-results.mjs --base abop34-sol
   Its last line reads `[publish] on origin: …`. If it exits non-zero, paste its output verbatim and STOP; do not run any git command yourself.
6. Password handling, verbatim: from bench/results/abop34-sol-agent-browser-transcript.jsonl, every `cmd` entry whose command contains "fill" (they must show `{{env:APP_PASSWORD}}` or «redacted», never a readable password), and whether sign-in succeeded (the first page text after the sign-in click). Also `grep -c "{{env:APP_PASSWORD}}" bench/results/abop34-sol-agent-browser-transcript.jsonl`.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the verifier output (every objective line); the score table; from bench/results/abop34-sol-agent-browser-result.json: stop reason, turns, commands, total_usd, wall time, orBackends, contextTruncations; every model-side error (HTTP 4xx/5xx, empty turns, parse failures); every `refused` entry in the transcript; the item-6 check.

RULES: do not retry more than once, and report both attempts if you do. Do not change source code. Clean up: stop any browser or agent-browser session you started.
NEVER end your turn while the run is going: wait on the background job's completion notification.
