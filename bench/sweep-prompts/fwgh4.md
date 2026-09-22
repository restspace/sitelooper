Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: ghost   RUNID: fwgh4   TASK: bench/tasks/ghost-post-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1` (expect 796eb5b or later). If HEAD is older than 796eb5b, STOP and report rather than sweeping. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh --with-target ghost   (provisions only ghost; allow ~15 minutes on a cold box)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwgh4 --learn bench/results/fwgh4-skills --flow fwgh4 --verify-cmd "node bench/verify-ghost.mjs" --arm sitelooper --target ghost --task bench/tasks/ghost-post-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwgh4-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwgh4.json --skills bench/results/fwgh4-skills --tag fwgh4-spec --target ghost --reset --out bench/results 2>&1 | tee bench/results/fwgh4-spec-run.log
   node bench/verify-ghost.mjs fwgh4-spec 2>&1 | tee bench/results/fwgh4-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwgh4-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwgh4-* bench/results-published/ && cp bench/results/flows/fwgh4.json bench/results-published/fwgh4.json && cp ~/.sitelooper/sessions/fwgh4-n1/script.jsonl bench/results-published/fwgh4-n1-script.jsonl
   git checkout -b results/fwgh4 && git add bench/results-published && git commit -m "Add raw results for fwgh4" && git push -u origin results/fwgh4

WHAT CHANGED (commit 796eb5b, verified in the cloud: suite, browser, parity and corpus-check all pass). This target's previous sweep (fwgh3) was not green: 01-signin's expectation froze the relative timestamp '1 minute ago', so both replays fell back and the compiled script failed. Round 38's general fixes:
  - fills record which document they ran in; a replaced document is waited on and refilled; a submit swallowed by a reload is retried once;
  - a value dropped when its field loses focus (a formatted number widget) is retyped key by key before the submit;
  - a failure reported after the turn-cap warning escalates to the fallback model;
  - render-counter ids are not css roots;
  - a record id that a step's own action landed at a url path position is a reference at any length, so one-digit ids count;
  - an in-page #anchor is not a hash route;
  - goal markers come only from added lines and alerts;
  - relative-time phrases ("1 minute ago", "just now") are volatile text.
Per-step replay warnings now appear in the flowrun step records: quote any containing "refill", "reload", "retyped", "escalat" or "turn-cap".
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim.
  3. The compiled script: did it compile (quote the compile log verbatim if not, including any "demoted", "unsourced-ref", "unbound-pin" or "unfilled-slot"), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation (the verifier prints *** DUPLICATE WORK *** / *** EXTRA MUTATION *** just BEFORE the '<runid>: objectives passed' line of the run it belongs to); any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwgh4-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwgh4-n1`); the `orBackends` field of fwgh4-n1-sitelooper-result.json; for the compiled script, the last line of fwgh4-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwgh4-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.
