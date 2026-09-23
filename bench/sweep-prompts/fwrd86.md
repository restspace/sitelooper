Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: repairdesk   RUNID: fwrd86   TASK: bench/tasks/repairdesk-ticket-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1` (expect a441a86 or later). If HEAD is older than a441a86, STOP and report rather than sweeping. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh   (no --with-target: repairdesk ships in the repo)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwrd86 --learn bench/results/fwrd86-skills --flow fwrd86 --verify --arm sitelooper --target repairdesk --task bench/tasks/repairdesk-ticket-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwrd86-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwrd86.json --skills bench/results/fwrd86-skills --tag fwrd86-spec --target repairdesk --reset --out bench/results 2>&1 | tee bench/results/fwrd86-spec-run.log
   node bench/verify-repairdesk.mjs fwrd86-spec 2>&1 | tee bench/results/fwrd86-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwrd86-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwrd86-* bench/results-published/ && cp bench/results/flows/fwrd86.json bench/results-published/fwrd86.json && cp ~/.sitelooper/sessions/fwrd86-n1/script.jsonl bench/results-published/fwrd86-n1-script.jsonl
   git checkout -b results/fwrd86 && git add bench/results-published && git commit -m "Add raw results for fwrd86" && git push -u origin results/fwrd86

WHAT THIS IS (commit a441a86, round 51, cloud-verified). fwrd85 was green, but exposed two gaps, both
fixed generally in round 51:
  - SILENT SET: a step's expectation masked the very value the step typed (05-edit's cost), so a save
    that never took could still pass tier A. The expectation now keeps a value the step itself set.
  - TEXT MINTS: the ticket number the app mints as page text (RD-10xx) was frozen as a literal in
    02-create's goal and 09-report's expectation, and 09-report PUBLISHED the recording's number on
    every replay. It is now a slot bound to the output that captured it.
Confirm, verbatim:
  1. 05-edit's Save expectation: quote its expectation lines and say whether the cost value is kept
     (as {{vN}} or literal 150) rather than wildcarded.
  2. The minted ticket numbers of n1, n2, n3 and the compiled run. For EVERY published value in
     n2/n3 flowrun outputs and in the compiled run that contains a ticket number (RD-...), say whether
     it is THAT run's own ticket or another run's. Any published value carrying another run's ticket
     is a failure: quote it.
  3. grep the flow and every skill for n1's ticket number and report a COUNT and each hit's context
     (a goal, expectation or report template holding it is a failure).
  4. Any `update` with before == after in n2/n3 mutation logs, and the step that produced it.
Credentials: the password value must appear NOWHERE in bench/results-published; grep and report a
COUNT, never the value.
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim. Quote every non-routine entry in the flowrun steps' warnings.
  3. The compiled script: did it compile (quote the compile log verbatim if not), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation; any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwrd86-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwrd86-n1`); the `orBackends` field of fwrd86-n1-sitelooper-result.json; for the compiled script, the last line of fwrd86-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwrd86-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.
