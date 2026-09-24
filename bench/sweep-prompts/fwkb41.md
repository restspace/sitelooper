Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: kanboard   RUNID: fwkb41   TASK: bench/tasks/kanboard-board-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1` (expect 2aa57e8 or later). If HEAD is older than 2aa57e8, STOP and report rather than sweeping. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh --with-target kanboard   (provisions only kanboard)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwkb41 --learn bench/results/fwkb41-skills --flow fwkb41 --verify-cmd "node bench/verify-kanboard.mjs" --arm sitelooper --target kanboard --task bench/tasks/kanboard-board-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwkb41-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwkb41.json --skills bench/results/fwkb41-skills --tag fwkb41-spec --target kanboard --reset --out bench/results 2>&1 | tee bench/results/fwkb41-spec-run.log
   node bench/verify-kanboard.mjs fwkb41-spec 2>&1 | tee bench/results/fwkb41-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwkb41-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwkb41-* bench/results-published/ && cp bench/results/flows/fwkb41.json bench/results-published/fwkb41.json && cp ~/.sitelooper/sessions/fwkb41-n1/script.jsonl bench/results-published/fwkb41-n1-script.jsonl
   git checkout -b results/fwkb41 && git add bench/results-published && git commit -m "Add raw results for fwkb41" && git push -u origin results/fwkb41

WHAT THIS IS (commit 2aa57e8, round 57: the third ten-app confirmation, after round 56's fixes).
New since round 56:
  - a collapse/expand click pair whose second click changed the url query is one toggle; a click whose
    whole effect was hiding something checks it, and a hide that submits this step's work or closes what
    this step opened is never skipped;
  - a reported value made of page texts plus labels ("Seed: triage inbox (#1)") becomes one live read per
    element; a step's own dropdown selection is a source; an ambiguous match inside one row pins;
  - a count read that matches nothing publishes "0"; a fill whose page reloaded under it is refilled once;
  - steps whose instruction asked for a fact that nothing publishes carry an `unanswered` warning.
Report on these specifically, verbatim:
  1. Any step whose status is "partial" (quote its `partial` reasons) and any step with an `unanswered`
     list (quote it).
  2. Any published value in n2/n3 outputs that does not match that run's own page (another run's record
     number, a recording's date/count, another record's name, a skill id or file path). Quote it.
  3. Any `[replay] withheld` line and whether a LATER step then lacked an input.
  4. Any objective that fails on n2/n3 but passed on n1: quote it and the evidence it was scored from.
  5. Any export warning containing "REFUSE", "re-record" or "asks to report" after run 1, verbatim.
  6. The password value must appear NOWHERE in bench/results-published except as a login that equals it;
     grep and report a COUNT and, per hit, login vs password fill. Never paste the value. Quote
     requiredEnvNames from the compiled spec.
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim. Quote every non-routine entry in the flowrun steps' warnings (skip only "value the skill itself set" notes).
  3. The compiled script: did it compile (quote the compile log verbatim if not, including any "demoted", "unsourced-ref", "unbound-pin" or "unfilled-slot"), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation (the verifier prints *** DUPLICATE WORK *** / *** EXTRA MUTATION *** just BEFORE the '<runid>: objectives passed' line of the run it belongs to); any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwkb41-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwkb41-n1`); the `orBackends` field of fwkb41-n1-sitelooper-result.json; for the compiled script, the last line of fwkb41-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwkb41-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.
