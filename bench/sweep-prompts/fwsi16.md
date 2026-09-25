Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: snipeit   RUNID: fwsi16   TASK: bench/tasks/snipeit-asset-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout -B main origin/main
   (The box's local main can be an unrelated old history; never push main.) Record `git log --oneline -1`. It must contain src/agent/sourcing.ts (`test -f src/agent/sourcing.ts`), else STOP and report rather than sweeping.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the five exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   export SITELOOPER_SOURCING_HOLD=on
   (SITELOOPER_SOURCING_HOLD=on is THE point of this batch: it must be in the environment of the sweep command. Confirm it is read: `node -e "import('./dist/agent/sourcing.js').then(m=>console.log(m.sourcingHoldOn()))"` must print true with the export in place.)
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh --with-target snipeit   (provisions only snipeit; allow ~15 minutes on a cold box)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwsi16 --learn bench/results/fwsi16-skills --flow fwsi16 --verify-cmd "node bench/verify-snipeit.mjs" --arm sitelooper --target snipeit --task bench/tasks/snipeit-asset-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwsi16-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwsi16.json --skills bench/results/fwsi16-skills --tag fwsi16-spec --target snipeit --reset --out bench/results 2>&1 | tee bench/results/fwsi16-spec-run.log
   node bench/verify-snipeit.mjs fwsi16-spec 2>&1 | tee bench/results/fwsi16-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwsi16-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwsi16-* bench/results-published/ && cp bench/results/flows/fwsi16.json bench/results-published/fwsi16.json && for f in script timing trace; do cp ~/.sitelooper/sessions/fwsi16-n1/$f.jsonl bench/results-published/fwsi16-n1-$f.jsonl; done
   git checkout -b results/fwsi16 && git add bench/results-published && git commit -m "Add raw results for fwsi16" && git push -u origin results/fwsi16

WHAT THIS IS (round 65: the sourcing-hold confirmation batch, hygiene design stages 3-4, notes/design/design-recording-hygiene.md §4). The code is main with src/agent/sourcing.ts; the flag SITELOOPER_SOURCING_HOLD=on turns on, at record time only:
  - stage 3: a reported value "head (commentary)" whose HEAD the page shows is published as the head (read-back), the commentary goes into the summary;
  - stage 4: when the recording model reports SUCCESS with a value the instruction ASKED for that no element on the page shows, that nothing this instruction read or displayed, and that a complete page sweep proves absent, the report is held ONCE and the model is asked to read the value where it is shown (read/read_all with label=<key>) or keep it and say it is its own conclusion. The retry is accepted whatever it says. At most one extra turn per instruction; never on top of a naming hold; never within 20s of the deadline.
  Replays (n2, n3) and the compiled script are unaffected by the flag except through what n1 recorded.
  This batch measures the hold's effect on a live recording. Report on it specifically, verbatim:
  H1. From bench/results-published/fwsi16-n1-script.jsonl: every `report` entry with a `sourcingAsk` field, verbatim (asked, readsAdded, labelled, gesturesAfter), and the instruction text it belongs to. Then the counts: instructions, holds, holds whose retry added a labelled read, holds followed by a data-changing gesture (gesturesAfter non-empty).
  H2. From the n1 sweep log: every line containing "holding success report for sourcing", "sourcing retry", "state-changing gesture after the sourcing hold" or "plus commentary", verbatim.
  H3. From bench/results-published/fwsi16-n1-timing.jsonl: the turn count per instruction (the number of entries in `turns`), as a list, and the total.
  H4. For each held instruction: did the value the hold asked for end up published by a read (check the n2/n3 flowrun outputs for that key, and the skill's steps for a read labelled with it)? Quote the value on n1, n2 and n3.
  H5. Any export warning after run 1 containing "asks to report", "literal", "unanswered" or "REFUSE", verbatim (these are what the hold exists to reduce).
  H6. node bench/ab-metrics.mjs --dir bench/results-published --base fwsi16   — paste its output line verbatim (it has rec_sourcing_holds, rec_sourcing_labelled and rec_sourcing_gestures_after).
Also report, verbatim:
  1. Any step whose status is "partial" (quote its `partial` reasons) and any step with an `unanswered`
     list (quote it).
  2. Any published value in n2/n3 outputs that does not match that run's own page (another run's record
     number, a recording's date/count, another record's name, a skill id or file path, or a value the run
     only TYPED). Quote it.
  3. Any warning containing "skipped", "echo", "unanswered", "literal", "given", "withheld", "applied",
     "positional", "doubled", "flash", "picked", "named", "off-record" or "stripped", verbatim.
  4. Any objective that fails on n2/n3 but passed on n1: quote it and the evidence it was scored from.
     For every objective the verifier scores from the app's DATABASE, confirm the persisted values match
     what the task asked for (not merely that the step reported success).
  5. Any export warning containing "REFUSE", "re-record" or "asks to report" after run 1, verbatim.
  6. The password value must appear NOWHERE in bench/results-published except as a login that equals it;
     grep and report a COUNT and, per hit, login vs password fill. Never paste the value. Quote
     requiredEnvNames from the compiled spec.
  7. Recording hygiene, from bench/results-published/fwsi16-n1-script.jsonl: the count of eval steps, of
     steps with `failed: true`, of eval refusals in the n1 log, and the script.jsonl size in bytes.
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim. Quote every non-routine entry in the flowrun steps' warnings (skip only "value the skill itself set" notes).
  3. The compiled script: did it compile (quote the compile log verbatim if not, including any "demoted", "unsourced-ref", "unbound-pin" or "unfilled-slot"), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation (the verifier prints *** DUPLICATE WORK *** / *** EXTRA MUTATION *** just BEFORE the '<runid>: objectives passed' line of the run it belongs to); any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwsi16-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwsi16-n1`); the `orBackends` field of fwsi16-n1-sitelooper-result.json; for the compiled script, the last line of fwsi16-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwsi16-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep or the compiled replay is running, not even with a wakeup scheduled: a run whose session goes idle is lost (fwop13 and fwgt10 were, in round 58). Wait on the background job's completion notification.
