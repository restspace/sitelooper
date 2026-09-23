Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: odoo   RUNID: fwod81   TASK: bench/tasks/odoo-sale-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1` (expect c923af6 or later). If HEAD is older than c923af6, STOP and report rather than sweeping. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh --with-target odoo   (provisions only odoo)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwod81 --learn bench/results/fwod81-skills --flow fwod81 --verify-cmd "node bench/verify-odoo.mjs" --arm sitelooper --target odoo --task bench/tasks/odoo-sale-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwod81-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwod81.json --skills bench/results/fwod81-skills --tag fwod81-spec --target odoo --reset --out bench/results 2>&1 | tee bench/results/fwod81-spec-run.log
   node bench/verify-odoo.mjs fwod81-spec 2>&1 | tee bench/results/fwod81-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwod81-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwod81-* bench/results-published/ && cp bench/results/flows/fwod81.json bench/results-published/fwod81.json && cp ~/.sitelooper/sessions/fwod81-n1/script.jsonl bench/results-published/fwod81-n1-script.jsonl
   git checkout -b results/fwod81 && git add bench/results-published && git commit -m "Add raw results for fwod81" && git push -u origin results/fwod81

WHAT THIS IS (commit c923af6, round 54: a confirmation sweep of all ten apps after rounds 48-53, each
cloud-verified). New since the last sweep of most apps:
  - a credential typed in the clear becomes {{env:NAME}}; the compiled script reads process.env;
  - a step's expectation keeps a value the step itself set, so a save that never took cannot pass;
  - a record number the app mints as page text is referenced, never frozen, and never part of an output KEY;
  - a PUBLISHED value's recorded text is published only if THIS run's page shows it; unobserved
    report prose is dropped (expect many replay summaries to be the plain "Replayed stored procedure"
    sentence — that is intended);
  - a word inside "X or Y" in an instruction is not threaded to another step's output.
Report on these specifically, verbatim:
  1. Any published value in n2/n3 flowrun outputs that does not match what that run's page showed
     (another run's record number, the recording's date or count). Quote it.
  2. Any `[replay] withheld N report value(s)` line: quote each, and say whether a LATER step then
     lacked an input it needed (a missing param, an unresolved reference, a fallback).
  3. Any report-only objective that FAILS on n2/n3 where it passed on n1: quote the objective and the
     report text it was scored against. (It may be the new rule correctly declining recorded text,
     or a real loss — say which from the evidence.)
  4. The password value must appear NOWHERE in bench/results-published: grep and report a COUNT,
     never the value. Quote requiredEnvNames from the compiled spec.
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim. Quote every non-routine entry in the flowrun steps' warnings.
  3. The compiled script: did it compile (quote the compile log verbatim if not), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation; any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

NOTE on instruction budget for this heavy app: earlier sweeps lost steps to `do` calls cut off at the 300s default --timeout mid-work. Pass `--timeout 600 --max-turns 40` on create/edit instructions. The cap is 3.00; if it still caps, that is a legitimate result and I want to see it.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwod81-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwod81-n1`); the `orBackends` field of fwod81-n1-sitelooper-result.json; for the compiled script, the last line of fwod81-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwod81-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.
