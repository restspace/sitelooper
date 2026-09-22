Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: snipeit   RUNID: fwsi6   TASK: bench/tasks/snipeit-asset-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1` (expect e8a9a47 or later). If HEAD is older than e8a9a47, STOP and report rather than sweeping. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh --with-target snipeit   (provisions only snipeit; allow ~15 minutes on a cold box)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwsi6 --learn bench/results/fwsi6-skills --flow fwsi6 --verify-cmd "node bench/verify-snipeit.mjs" --arm sitelooper --target snipeit --task bench/tasks/snipeit-asset-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwsi6-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwsi6.json --skills bench/results/fwsi6-skills --tag fwsi6-spec --target snipeit --reset --out bench/results 2>&1 | tee bench/results/fwsi6-spec-run.log
   node bench/verify-snipeit.mjs fwsi6-spec 2>&1 | tee bench/results/fwsi6-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwsi6-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwsi6-* bench/results-published/ && cp bench/results/flows/fwsi6.json bench/results-published/fwsi6.json && cp ~/.sitelooper/sessions/fwsi6-n1/script.jsonl bench/results-published/fwsi6-n1-script.jsonl
   git checkout -b results/fwsi6 && git add bench/results-published && git commit -m "Add raw results for fwsi6" && git push -u origin results/fwsi6

WHAT THIS IS (commit e8a9a47, round 45). This is a SECOND CONFIRMATION round across all ten targets on the current main. Every target was green on its latest sweep (rounds 40-44), but greens have flipped before when the recording took a different route (5 of 10 did in round 40). Fixes since round 40 (all cloud-verified): uncredited popups credited; a value set again after a reload supersedes the earlier attempt; an empty assistant message never enters history; a dead instruction's open menu is carried; a dialog closer that cleared a field is kept; a repin ending on the wrong page is refused; no-op link clicks before a goto are dropped; a Save that recorded nothing before a Save that worked is dropped; a list read whose elements are each reported values is split per element; framed containment read-backs; task constants; alert cuts. Any step off tier A, any fallback, and any regression is the finding.
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim. Quote every non-routine entry in the flowrun steps' warnings (skip only "value the skill itself set" notes).
  3. The compiled script: did it compile (quote the compile log verbatim if not, including any "demoted", "unsourced-ref", "unbound-pin" or "unfilled-slot"), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation (the verifier prints *** DUPLICATE WORK *** / *** EXTRA MUTATION *** just BEFORE the '<runid>: objectives passed' line of the run it belongs to); any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwsi6-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwsi6-n1`); the `orBackends` field of fwsi6-n1-sitelooper-result.json; for the compiled script, the last line of fwsi6-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwsi6-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.
