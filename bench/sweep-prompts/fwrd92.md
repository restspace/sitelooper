Run ONE sitelooper benchmark learning sweep on this cloud box, then replay the COMPILED Playwright script it produces, and publish the raw results. Follow bench/CLOUD-RUNBOOK.md for everything not overridden below. The overrides are mandatory.

TARGET: repairdesk   RUNID: fwrd92   TASK: bench/tasks/repairdesk-ticket-flow.md

OVERRIDES
1. Code: use `main`:
   git fetch origin && git checkout main && git pull --ff-only
   Record `git log --oneline -1` (expect 0e778e9 or later). If HEAD is older than 0e778e9, STOP and report rather than sweeping. Then `npm ci && npm run build` if cloud-setup.sh does not already build.
2. Environment: do NOT edit ~/.bashrc, ~/.profile or any other shell startup file (an earlier run stalled on a permission prompt doing that). Put the four exports below at the start of every command that needs them, or in a script file under /tmp that each command sources.
   Models: OpenRouter everywhere, never Novita (it has no balance). OPENROUTER_API_KEY is already in this environment. NEVER print it, write it to a file, or put it on a command line.
   export SITELOOPER_PROVIDER=openrouter
   export SITELOOPER_MODEL=deepseek/deepseek-v4.1-flash
   export SITELOOPER_FALLBACK_MODEL=z-ai/glm-5.3
   export SITELOOPER_EXTRA_BODY='{"provider":{"only":["DeepSeek"]}}'
   Inner agent loop on deepseek-v4.1-flash, escalating to glm-5.3 when an instruction comes back blocked; EXTRA_BODY pins OpenRouter to DeepSeek's own backend, the price bench/rates.json quotes. Harness orchestrator stays on glm-5.3 (--provider/--model below). Confirm before sweeping: `sitelooper config --session cfgcheck` should show model deepseek/deepseek-v4.1-flash, then `sitelooper stop --session cfgcheck`.
3. Setup: bench/cloud-setup.sh   (no --with-target: repairdesk ships in the repo)
4. Sweep (k=3: one recording, then two zero-orchestrator flow replays against a reset app):
   node bench/sweep.mjs --k 3 --base fwrd92 --learn bench/results/fwrd92-skills --flow fwrd92 --verify --arm sitelooper --target repairdesk --task bench/tasks/repairdesk-ticket-flow.md --provider openrouter --model z-ai/glm-5.3 --maxUsd 3.00 --coarse --out bench/results 2>&1 | tee bench/results/fwrd92-sweep.log
   This can take 30-90 minutes. Do NOT end your turn while it runs.
   WAITING — IMPORTANT: do NOT use the Monitor tool at all (it needs a permission approval nobody can give on this box; an earlier run sat blocked on a Monitor prompt for eight hours). `sleep N` followed by another command is also blocked. Instead start every long command (setup, sweep, spec replay) with the Bash tool's run_in_background: true, and wait for its completion notification; while waiting, check progress only with short, quick Bash calls such as `tail -20 <logfile>` or `ps aux | grep sweep`.
5. Compiled script (Tier 2 spec arm: no model, no sitelooper runtime at replay time). Run it after the sweep, against a reset app, whatever the sweep's result:
   node bench/spec-replay.mjs --flow bench/results/flows/fwrd92.json --skills bench/results/fwrd92-skills --tag fwrd92-spec --target repairdesk --reset --out bench/results 2>&1 | tee bench/results/fwrd92-spec-run.log
   node bench/verify-repairdesk.mjs fwrd92-spec 2>&1 | tee bench/results/fwrd92-spec-verify.log
   If the flow is not compilable (compile exit 2), that is a legitimate result: report the compile log verbatim (bench/results/fwrd92-spec-compile.log) and skip the verifier. Do not recompile with --allow-demoted or any other override. Report-only objectives (checked against a finalText) may be UNVERIFIABLE for the compiled arm; that is expected.
6. Publish (a results branch, never main; commit ONLY results):
   mkdir -p bench/results-published && cp -r bench/results/fwrd92-* bench/results-published/ && cp bench/results/flows/fwrd92.json bench/results-published/fwrd92.json && cp ~/.sitelooper/sessions/fwrd92-n1/script.jsonl bench/results-published/fwrd92-n1-script.jsonl
   git checkout -b results/fwrd92 && git add bench/results-published && git commit -m "Add raw results for fwrd92" && git push -u origin results/fwrd92

WHAT THIS IS (commit 0e778e9, round 61: the sixth ten-app confirmation, after round 60's fixes and the
phase A/B design work).
New since round 59:
  - round 60: a pinned skill's slots bind against the referenced instruction (a product name with "with"
    in it); the artifact judges the page its action settled on; a url part a step visited is its output
    (ghost post id); a recovery keeps a stopped step that did its work; a picker re-open the recording shows
    shut first is shut, checked and clicked (gitea labels); a value built only from params is published
    only if the page shows it;
  - phase A: the recorder stores timestamps, settle verdicts, full diff totals and FAILED actions
    (`failed: true` lines in script.jsonl, never used by compile); an eval's return is stored as
    `evalResult`; evals that change identity/visibility or open pages are REFUSED with a replayable target;
    an empty read tells the model to snapshot instead of eval; `$0`-expanded shell paths are refused;
  - phase B: ONE report classifier in both runners: a value this run TYPED is reported only with commit
    evidence (this run's own diff shows it outside its control, or a real read returned it), else it is an
    echo, withheld from the report but still passed to later steps; short values are echoes at their control;
    a commit is noted only after the action ran, and a url change commits only when the route changes.
Report on these specifically, verbatim:
  1. Any step whose status is "partial" (quote its `partial` reasons) and any step with an `unanswered`
     list (quote it).
  2. Any published value in n2/n3 outputs that does not match that run's own page (another run's record
     number, a recording's date/count, another record's name, a skill id or file path, or a value the run
     only TYPED). Quote it.
  3. Any warning containing "skipped", "echo", "unanswered", "literal", "given", "withheld" or "stripped",
     verbatim. For the compiled script, quote `referenceOnly` from its result/run record if present.
  4. Any objective that fails on n2/n3 but passed on n1: quote it and the evidence it was scored from.
     For every objective the verifier scores from the app's DATABASE, confirm the persisted values match
     what the task asked for (not merely that the step reported success).
  5. Any export warning containing "REFUSE", "re-record" or "asks to report" after run 1, verbatim.
  6. The password value must appear NOWHERE in bench/results-published except as a login that equals it;
     grep and report a COUNT and, per hit, login vs password fill. Never paste the value. Quote
     requiredEnvNames from the compiled spec.
  7. Recording hygiene, from bench/results-published/fwrd92-n1-script.jsonl: the count of eval steps, of
     steps with `failed: true` (quote each one's tool and failure.reason), of eval refusals in the n1 log
     (quote each refusal line), and the script.jsonl size in bytes.
What I care about most, in order:
  1. Every run's verifier summary (n1, n2, n3) and every FAIL line verbatim.
  2. For each replay (n2, n3), every step: tier, turns, fellBack, and the stored procedure id it replayed. For any step taking model turns, the reason verbatim. Quote every non-routine entry in the flowrun steps' warnings.
  3. The compiled script: did it compile (quote the compile log verbatim if not), its exit code, driftCount, every test error, and the verifier output. Report-only objectives may be UNVERIFIABLE for it; that is expected.
  4. Any step that PASSES while a verifier objective FAILS; any DUPLICATE record or EXTRA mutation; any step SKIPPED as "already in effect".
So: watch for steps REFUSING, stopping, or being SKIPPED, and quote the reason verbatim for the flow replays AND the compiled script. Quote verbatim every warning or [sitelooper skip]/[sitelooper warn] line containing "already in effect", "closes the dialog", "link", "href", "not on the page this procedure starts from", "starts elsewhere", "expected url", "raised an alert", "cannot be found", "adopted", "redid", "undid", "NOT in the flow", "unsourced-ref", "unbound-pin", "unfilled-slot", "never published", "no converged procedure", "demoted", "repinned", "recovered", "different record", "rerecord" - and say whether the page it names was actually the right one.

REPORT, verbatim: git log --oneline -1 and the branch pushed; the sweep's final table and every verifier summary line; for each replay (n2, n3) every step's id, tier, turns, fellBack AND the stored procedure id it replayed, from bench/results/fwrd92-n2-flowrun.json and -n3-flowrun.json, plus their warnings; the export warnings after run 1 (the lines after `stopped: fwrd92-n1`); the `orBackends` field of fwrd92-n1-sitelooper-result.json; for the compiled script, the last line of fwrd92-spec-run.log, every `[sitelooper warn]` and `[sitelooper skip]` line, the `stats`, `exitCode`, `driftCount` and every test's `error` from fwrd92-spec-result.json, and the full verifier output; any step that refused or stopped (replay or compiled), with its reason; anything you had to change to make setup work, with exact commands.

RULES: do not retry more than once, and report both attempts if you do. A failed objective, a turn cap, a non-compilable flow or a crash is a legitimate result: do not massage it or retry until it looks good. Do not change source code. Clean up: stop the target stack and any browser or sitelooper daemon you started.

NEVER end your turn while the sweep or the compiled replay is running, not even with a wakeup scheduled: a run whose session goes idle is lost (fwop13 and fwgt10 were, in round 58). Wait on the background job's completion notification.
