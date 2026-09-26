# Sweep log

One row per cloud sweep, newest last. The raw results are on the `results/<runid>` branch
(sometimes with a random suffix, e.g. `results/fwop4-53c5ub`). Every sweep is k=3: n1 records,
n2 and n3 replay the learned flow with no orchestrator, and then the compiled Playwright
script replays it against a reset app.

**Green** means all of these hold:
- every run (n1–n3) verifies every objective, with no duplicate records and no extra
  mutations;
- every replay step on n2 and n3 is tier A with 0 turns;
- the compiled script compiles and passes, with at most report-only objectives
  UNVERIFIABLE.

Codes: rd repairdesk, od odoo, gr grafana, kb kanboard, op openproject, plus the
targets added from round 36 on (see bench/thirdparty/README.md).

| Round | Runid | Commit | App | Runs n1/n2/n3 | Replays tier A 0 turns | Compiled | Green | Notes |
|---|---|---|---|---|---|---|---|---|
| 33 | fwop2 | 054282a | op | pass | no | died | no | 01-signin re-pinned mid-chain; Turbo url captured early; 06-open stale wp id |
| 33 | fwrd78 | 054282a | rd | pass | — | refused | no | fresh browser at #/tickets, not #/login |
| 33 | fwod74 | 054282a | od | n2/n3 duplicate orders | no | — | no | export adopted a failed create its successor redid |
| 33 | fwgr63 | 054282a | gr | pass | — | refused | no | unsourced-ref (text substitution) |
| 33 | fwkb34 | 054282a | kb | pass | yes | pass | yes | |
| 34 | fwop3 | 263d50a | op | 7/7 | no | pass 5/7+2 n/a | no | double comment: stale snapshot ref |
| 34 | fwrd79 | 263d50a | rd | 6/6 | yes | fail | no | aria-hidden asterisk in a stored name → 80e04d8 |
| 34 | fwod75 | 263d50a | od | 6/6 | yes | 6/6 | yes | |
| 34 | fwgr64 | 263d50a | gr | 6/6 | — | unbound-pin | no | → b5241ef |
| 34 | fwkb35 | 263d50a | kb | 6/6 | — | unsourced-ref | no | seed title threaded → b5241ef |
| 35 | fwop4 | 12dd754 | op | 7/7 | no (08-open false pass n2, fell back n3) | refused (demoted) | no | url id at another path position → 1df3645 |
| 35 | fwrd80 | 12dd754 | rd | 6/6 | yes | 6/6 | yes | |
| 35 | fwod76 | 12dd754 | od | 6/6 | no (04-open fell back: recording never read product_name) | 6/6 | no | recording variance |
| 35 | fwgr65 | 12dd754 | gr | 6/6 | yes | pass 4/6+2 n/a | yes | |
| 35 | fwkb36 | 12dd754 | kb | 6/6 | yes | pass 4/6+2 n/a | yes | |
| 35b | fwop5 | 1df3645 | op | 7/7 | yes | pass 5/7+2 n/a | yes | first sweep to publish n1-script.jsonl |
| 36 | fwvk1 | 945b0bd | vk | 7/7 ×3 | no: n3 01-open fell back (4 turns; the sign-in fills were cleared by a re-render before the submit) | pass 5/7+2 n/a, drift 1 | no | replays saved the description twice (a learned editor recipe appends; the recipe check only tests "contains"); the verifier missed it |
| 36 | fwgt1 | 945b0bd | gt | n1 7/7, n2 5/7, n3 5/7 | no: 03-set model-first on both (12 and 8 turns) | refused (03-set: no converged procedure) | no | failed 03-set (all three pickers) was adopted; in replay it did the work, then 04/05's pins toggled the labels and assignee back off |
| 36 | fwec1 | a8dcfd7 | ec | n1 7/7, n2 7/7, n3 1/7 (halted) | no: 02-create adopted (n2 38 turns; n3 29 turns, then "unresolved reference(s): 02-create.url.h2") | compiled; ran 0/1 ("02-create needs {{02-create.url.h2}}") | no | a re-pin bound the step's own minted url id as its param (a self-reference); n1's create failed on an ISO date typed into a MM/DD/YYYY field (bench fix: ISO locale) |
| 36 | fwsi1 | a8dcfd7 | si | 7/7 ×3 | no: 02-find, 03-create and 05-change fell back on both replays (7-30 turns) | pass 5/7+2 n/a, drift 0 | no | a select2 type relied on focus left by a failed, unrecorded fill; a debounced list-search url was credited to the wrong fill; a show/hide toggle was recorded as two clicks |
| 36 | fwgh1 | 6775b7e (+a27a539 setup fix) | gh | 7/7 ×3 | no: n2 02-create model-first (18 turns, adopted); n3 all tier A 0 turns | pass 5/7+2 n/a, drift 0 | no | the recording reported FAILURE on work that succeeded, so it was adopted (model variance); the verify instruction was wrongly merged into the adopted create; the cloud box needed server__host 0.0.0.0 (no IPv6) |
| 37 | fwvk2 | ebfed7d | vk | 7/7 ×3 | no: n2 01-open recovered (12 turns; the login was submitted empty again) and 02-create tier B (10 turns, knock-on); n3 all tier A 0 turns | pass 5/7+2 n/a, drift 0 | no | doubled description FIXED on every arm; the refill check runs while a service-worker reload is still rebuilding the form, so it misses |
| 37 | fwgh2 | 4ffa584 | gh | 6/7 ×3 (verifier defect) | yes: 3/3 steps tier A 0 turns on n2 and n3 | pass 4/7+2 n/a, drift 0 | no (verifier) | obj 2 counted the runid, but the chosen body names it twice by design; the verifier now judges doubled text instead; sitelooper was clean |
| 37 | fwec2 | ebfed7d | ec | 7/7 ×3 | no: n2 03-create adopted, model-first 48 turns; n3 all tier A 0 turns | pass 5/7+2 n/a, drift 1 | no | n1's create hit its turn cap and reported "failure", which never escalates to the fallback model, so it was adopted; the fwec1 date and own-url-mint faults did not recur (the fix was exercised) |
| 37 | fwsi2 | ebfed7d | si | 7/7 ×3 | no: 04-create fell back on both replays (19-20 turns); n2 05-open refused (29 turns) | compiled; ran 0/1 (checked out the stale asset 4) | no | n1 minted a one-digit asset id (4), below the path-id floor, so `goto /hardware/4/checkout` stayed literal; a #history tab anchor was read as a hash route; the fwsi1 query and select2 fixes held |
| 37 | fwgt2 | ebfed7d | gt | 7/7 ×3 | yes: 8/8 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 2 | **yes** | first new app green; there was no failed instruction this time, so the round-36 flow fixes were not exercised; the goal markers still take before-state text (fail-safe) |
| 37b | fwgh3 | 25ef162 | gh | 7/7 ×3 | no: 01-signin fell back on both replays (4 and 6 turns); 02-create tier A 0 turns | compiled; ran 0/1 (01-signin's expected change never appeared) | no | 01-signin's expectation froze a relative timestamp ("1 minute ago") that had aged by the time of the replays; the volatile-token mask has no relative-time phrases |
| 38 | fwvk3 | 796eb5b | vk | 7/7 ×3 | yes: 6/6 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 1 | **yes** | the sign-in refill fix held; cosmetic: the identifier read carries the url id welded in (BENCH-{{d1}}) and falls back to a point locator; a runid read-back pinned by containment publishes the whole heading |
| 38 | fwsi3 | 796eb5b | si | 7/7 ×3 | no: 04-create tier B on n2 and n3 (24 and 21 turns): the pin "expects /hardware/4" | compiled; ran 0/1 (the same refusal) | no | the one-digit id is now minted, published and slotted in the skill (v5 bound to url:i3:p1), but the flow param stayed the literal "4": buildFlow matches params by value, not by their recorded origin |
| 38 | fwgh4 | 796eb5b | gh | 7/7 ×3 | no: n2 03-open recovered (12 turns); n3 all tier A 0 turns | refused: unsourced-ref (03-open v1 → {{02-create.post_title_element_text}}) | no | the fwgh3 relative-time fix held; Ember's #emberNNN counter ids were trusted as stable (a click hit "New post"); the artifact never publishes report-template values unless the step has a goal |
| 38 | fwec3 | 796eb5b | ec | 7/7 ×3 | yes: 7/7 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 0 | **yes** | the turn-cap escalation fired on n1's create (glm-5.3 rescued it); the masked Amount was retyped key by key on every replay; not blocking: a scoped read anchor was stranded because the signed-in user's name "Admin" is a known output |
| 39 | fwgh5 | af106d1 | gh | 7/7 ×3 | yes: 3/3 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 0 | **yes** | the emberNNN counter-id and template-output fixes held; cosmetic: a containment read-back publishes the whole heading (seen on vikunja too); one-digit #ember5 is still trusted as a second-choice locator |
| 39 | fwsi4 | af106d1 | si | 7/7 ×3 | yes: 5/5 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 0 | **yes** | 04-set carries {{03-create.url.p1}}, so each replay checked out its own asset; cosmetic: a read anchor stranded by a seeded name ("Bench Assignee"), and the alert expectation keeps the recording's minted tag (soft warning) |
| 40 | fwkb37 | af106d1 | kb | 6/6 ×3 | yes: 6/6 steps tier A 0 turns on n2 and n3 | pass 4/6+2 n/a, drift 0 | **yes** | confirmation |
| 40 | fwrd81 | af106d1 | rd | 6/6 ×3 | yes: 6/6 steps tier A 0 turns on n2 and n3 | pass 6/6, drift 0 | **yes** | confirmation |
| 40 | fwgh6 | af106d1 | gh | 7/7 ×3 | no: 04-set fell back on both replays (7 and 6 turns): "recorded on page 1 … procedure is on page 0" | compiled; ran 0/1 (the same page-index stop) | no | n1 clicked the published post's card, which opened a new tab the recorder never credited to the click (a late or no-opener popup) |
| 40 | fwvk4 | af106d1 | vk | 7/7 ×3 | no: 02-create fell back on both replays (9 and 2 turns): "Description Saved!" never appeared | compiled; ran 0/1 (same stop) | no | n1's first description attempt did not persist and was redone after a reload; compile kept the abandoned attempt and its effect |
| 40 | fwsi5 | af106d1 | si | 7/7 ×3 | yes: 4/4 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 0 | **yes** | confirmation |
| 40 | fwgt3 | af106d1 | gt | 7/7, 6/7, 6/7 | yes: 7/7 steps tier A 0 turns, but the labels were never applied | compiled; ran 1/1, verifier 4/7 (obj 3 FAIL) | no | a DeepSeek 400 ("content or tool_calls must be set") killed the labels instruction mid-picker; the empty assistant message stayed in history; the next procedure starts inside a menu nothing opens |
| 40 | fwec4 | af106d1 | ec | 7/7 ×3 | no: 02-create model on n2/n3 (26/29 turns); n3 03-verify model (28 turns) | compiled; ran 0/1 (03-verify precondition) | no | a redone set-value after an Escape/Cancel dialog (not a reload); a repin whose chain ends on the list page, not the view |
| 40 | fwgr66 | af106d1 | gr | 6/6 ×3 | yes: 6/6 steps tier A 0 turns on n2 and n3 | pass 4/6+2 n/a, drift 0 | **yes** | confirmation |
| 40 | fwod77 | af106d1 | od | 6/6 ×3 | yes: 7/7 steps tier A 0 turns on n2 and n3 | pass 6/6, drift 0 | **yes** | confirmation |
| 40 | fwop6 | af106d1 | op | 7/7 ×3 | no: 01-open fell back on both replays (10 and 19 turns) | pass (drift: the artifact navigated where the daemon refused, a parity gap) | no | n1 clicked a link twice with no visible effect, then did a goto; the replayed first click navigates and the repeat is stranded |
| 42 | fwgh7 | bf26abd | gh | 7/7 ×3 | yes: 5/5 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a | **yes** | the popup fix was not exercised; the link-click rule fired |
| 42 | fwvk5 | bf26abd | vk | 7/7 ×3 | yes: 7/7 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a | **yes** | framed read-backs held |
| 42 | fwgt4 | bf26abd | gt | 7/7 ×3 | yes: 4/4 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 4 | **yes** | a framed read carries the minted "#4", so it is skipped on replay (cosmetic) |
| 42 | fwec5 | bf26abd | ec | 7/7 ×3 | no: 03-create recovered on n2 and n3 (3 turns each) | pass 5/7+2 n/a | no | n1's first Save recorded no consequence and was retried; compile kept both Saves, and on replay the first one navigates |
| 42 | fwop7 | bf26abd | op | 7/7, 6/7, 6/7 | yes: 8/8 steps tier A 0 turns, but the seed subjects were never re-read | pass 5/7+2 n/a | no | obj 1: a read_all whose elements are each a reported value was dropped at compile, and export pruned the outputs |
| 44 | fwec6 | 4fa1125 | ec | 7/7 ×3 | yes: 4/4 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 1 | **yes** | the round-43 repeat-Save fix was not exercised (n1 saved once); 04-change step 4 resolves only by a point fallback (fragile) |
| 44 | fwop8 | 4fa1125 | op | 7/7 ×3 | yes: 5/5 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 0 | **yes** | the round-43 list-split fix was not exercised (the seeds were read per row) |
| 45 | fwkb38 | e8a9a47 | kb | 6/6 ×3 | yes: 7/7 steps tier A 0 turns on n2 and n3 | pass 4/6+2 n/a, drift 0 | **yes** | second confirmation |
| 45 | fwrd82 | e8a9a47 | rd | 6/6 ×3 | yes: 6/6 steps tier A 0 turns (12 inline heals each) | compiled; ran 0/1 (`[role=dialog] >> …` resolved nothing) | no | n1 typed a raw [role=dialog] selector; live resolution rewrites it for a native <dialog>, but the recorder stored it unrewritten with no fallbacks. The daemon healed it; the artifact cannot |
| 45 | fwvk6 | e8a9a47 | vk | 7/7 ×3 | yes: 7/7 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 1 | **yes** | expandListReads fired and held |
| 45 | fwec7 | e8a9a47 | ec | 7/7 ×3 | yes: 4/4 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 0 | **yes** | fills resolved by position; refill fired twice per replay |
| 45 | fwgh8 | e8a9a47 | gh | 7/7, 6/7, 6/7 | no: 04-open fell back on both replays (14 and 10 turns): "recorded opening a popup, and none opened" | compiled; ran 0/1 (same stop) | no | creditUncreditedPopups credited the Publish click with a tab a later `eval window.open` opened; obj 1: the report used the seed titles as output KEYS |
| 45 | fwgt5 | e8a9a47 | gt | 7/7 ×3 | no: 02-open tier B on n2 and n3 (7 and 5 turns): "missing params: v1" | refused (unsourced-ref 02-open v1 ← {{01-signin.org_link}}) | no | a synthesized text read of an image-only link returns ""; two empty results retired its locator |
| 45 | fwop9 | e8a9a47 | op | 7/7 ×3 | yes: 4/4 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 1 | **yes** | expandListReads fired and held |
| 45 | fwgr67 | e8a9a47 | gr | 6/6 ×3 | yes: 6/6 steps tier A 0 turns on n2 and n3 | pass 4/6+2 n/a, drift 0 | **yes** | second confirmation |
| 45 | fwsi6 | e8a9a47 | si | 7/7 ×3 | yes: 3/3 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a, drift 0 | **yes** | second confirmation |
| 45 | fwod78 | e8a9a47 | od | 6/6 ×3 | no: 01-open fell back on n2/n3 (10/14 turns); 07-open fell back (14/5 turns) | compiled; ran 0/1 (the 01-open gate) | no | rule G misfired: the post-login url hash filling in was taken as a minted record; 07-open's positional kanban-card click hit another anchor |
| 47 | fwrd83 | 30b6f4a | rd | 6/6 ×3 | no: 06-change fell back on n2 and n3 (7 and 5 turns): "raised an alert the recording never saw" | compiled; ran 0/1 (same stop) | no | the alert expectation was cut to nothing by a read of its own first line; the outer model wrote `$APP_PASSWORD` inside double quotes, so the literal password was stored (leak) |
| 47 | fwgh9 | 30b6f4a | gh | 7/7 ×3 | yes: 6/6 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a | **yes** | `{{env:APP_PASSWORD}}` end to end; the compiled script reads process.env |
| 47 | fwgt6 | 30b6f4a | gt | 7/7 ×3 | yes: 7/7 steps tier A 0 turns on n2 and n3 | pass 5/7+2 n/a | **yes** | the outer model first guessed admin/admin (wrong), then used the marker; a dead `fill 'admin'` is kept in the sign-in skill |
| 47 | fwod79 | 30b6f4a | od | 6/6 ×3 | yes: 8/8 steps tier A 0 turns on n2 and n3 | pass 6/6 | yes* | *the outer model typed the password literally (`admin`), so it is hard-coded in the flow, skills and compiled script; sole mints held |

## Round 48 (27c9c61, merged to main)

Fixes, all cloud-verified (verify-round48b: suites/browser/parity 0 failures; corpus 272 rows,
0 status changes against r47 with APP_PASSWORD set):

- **AH literal credentials.** A credential-named env var's value typed in the clear is rewritten
  to `{{env:NAME}}` at dispatch (daemon `do`, agent fills into a password field) and, at compile,
  anywhere it survives in a spec. The artifact reads `process.env['NAME']`; the warning names the
  variable, never the value. An ambiguous value (also held by a non-credential var, e.g. odoo's
  `admin`) is rewritten only into a password field. Old stores record no input type, so they get
  the warning and keep the literal until re-recorded — fwod79's leak needs a re-sweep, not a fix.
- **Alert lines (fwrd83).** A published value that is a whole recorded alert line no longer cuts
  the expectation to nothing.
- **Superseded sets (fwgt6).** A later fill of the same field supersedes an earlier
  no-consequence fill, so the dead `fill 'admin'` is dropped.
- **`compile --json` survived exit.** 400 KB of JSON was truncated on Linux when the process
  exited after `console.log`; stdout is now written synchronously. This is why round 48's first
  verify reported 15 refusals as a generic `refused` with no diagnostic code.
| 49 | fwrd84 | 7d81579 | rd | 6/6, 6/6, 5/6 | no: 02/03/04/07-add/edit fell back; 08-delete unresolved ref both replays | refused (demoted-pin 02-create s_f89999) | no | round 48's two target fixes HELD (06-set keeps its alert expectation, tier A 0 turns; zero literal-credential leakage, marker end to end). New: the exported procedure LOST a value-bearing fill — no Title fill in s_f89999 (02-create), no cost fill in s_20eebf (05-edit). 05-edit saves an unchanged form and still reports tier A 0 turns success (false pass; n3 obj 4 FAIL). 02-create is caught by the app's own "Title is required" and demoted, so compile refused. Also 08-delete references 02-create.url.h1, which export pruning removed |
| 49 | fwod80 | a3ce067 | od | 6/6 ×3 | yes: 7/7 steps tier A 0 turns, 0 repins, 0 drift on n2 and n3 | pass 6/6, exit 0, drift 0 | **yes** | round 48's password-field-scoped rewrite held on the hardest case: odoo's password IS its login, and the literal is stored ONLY as the username (v3) while every password fill carries {{env:APP_PASSWORD}} — flow, all six login skills, and the compiled spec (`process.env['APP_PASSWORD'] ?? ''`, requiredEnvNames ["APP_PASSWORD"]). dropSupersededSets did not bite here (every value-bearing fill present). Carry-forward, non-blocking: the recurring "07-verify read a value that contradicts 06-open" compile warning (06-open reads its statusbar BEFORE the cancel); 03-open's second-line read labels are shifted (quantity read as unit price) though the fill lands; odoo publishes no mutation log ([]), so replay persistence rests on the verifier alone |
| 50 | fwrd85 | 0f51e47 | rd | 6/6 ×3 | yes: 9/9 steps tier A 0 turns on n2 and n3 | pass 6/6, exit 0, drift 0 | **yes** | round 49's primary-control rule held: 02-create fills Title, 05-edit fills Cost = 150 (mutation log 100→150), no update with before == after anywhere. 06-change keeps its alert expectation (tier A 0 turns). Zero literal-password hits. NEW DEFECT, blocks 0.4.1: the credential scan counts the shell variable PWD as a secret (the PWD segment), so the cwd in screenshot paths became {{env:PWD}} and the artifact requires PWD — it would refuse to run where PWD is unset (Windows PowerShell). Also: the minted ticket number RD-1015 is frozen into 02-create's goal and 09-report's expectation, and 09-report PUBLISHES the recorded RD-1015 on n2/n3 (a wrong reported value); s_a0fc7c step 8 fills literal "fwrd85"; the 08-remove instruction reads "total /bin/sh.00" ($0 expanded by the outer model's shell) |

## Round 50 (986006d, merged to main)

Cloud-verified (verify-round50: 2195 main / 2374 browser / 122 parity, 0 failures; corpus 275 rows,
0 status changes against r49 with PWD and APP_PASSWORD set; fwrd85 compiles).

- **Credential scan false positive (fwrd85).** The shell's PWD matched the PWD segment, so the cwd
  inside screenshot paths became {{env:PWD}} and the artifact required PWD (it would refuse to run
  where PWD is unset, and the cwd was scrubbed from tool output). A credential variable now needs the
  credential word to END its name (PASSWORD_STORE_DIR, SSH_KEY_FILE do not count), PWD/PASS need a
  prefix (DB_PWD counts, the shell's PWD does not), and a path-shaped value is excluded only when it
  is the cwd or EXISTS on this filesystem — a non-existent `/Xy9!abc` is still a credential.

## Round 51 (a441a86, merged to main)

Cloud-verified on the second run (2209 main / 2388 browser / 123 parity, 0 failures; corpus 275
rows, 0 status changes against r50). The FIRST run on the same commit failed one parity test, "both
runners resolve an unpublished control label to its recorded value when the page shows it"
(resolveStepParams saw `01-read.x` missing: recordedValueShown did not find "Remove" on the start
page). It passes alone on either fix branch and on the merge, and passed in the full file on the
rerun: FLAKY, not caused by round 51. Worth hardening (the live page check has no settle wait).

- **Silent set (fwrd84 05-edit).** A step's expectation no longer masks a value the step itself
  set: "$150.00" compiles to `${{v3}}{{*}}`, a hard check in both runners, so a save that never
  took stops instead of passing tier A. A masked line that still matches the step's own recorded
  removals (the page as it was before) identifies nothing new and is dropped. Parity case on a
  fixture whose save does nothing: both runners stop; with the fix reverted, replay passes it.
- **Text mints (fwrd85 RD-1015).** Mint provenance only watched urls; a record number that appears
  as page text after a save (url unchanged) is now marked minted by provenance, and becomes a slot
  bound to the capturing output (or a wildcard) in goals, expectations and published reads.
  09-report now publishes the replay's own ticket, not the recording's. Not yet covered: the
  created DATE (a literal in 09-report's report), the run-id prefix typed as literal text, recovery
  compiles in flow runs, and skills compiled before the mint was first named.
| 52 | fwrd86 | a441a86 | rd | 6/6 ×3 | yes: 6/6 steps tier A 0 turns on n2 and n3 | pass 6/6, exit 0, drift 0 | **yes** | round 51 HELD live: 04-edit's Save expects `- cell "${{v4}}{{*}}"` (cost kept as a slot, not masked); no update with before == after; every published RD- value is the run's OWN ticket (n1 1015, n2 1016, n3 1017, spec 1018) and the ticket is bound to {{01-signin.ticket_reference}} downstream; no goal, expectation or report value holds n1's number. Password 0 hits; requiredEnvNames ["APP_PASSWORD"]. Remaining, none failing an objective: (1) n1's ticket frozen in an output KEY, `list_row_RD-1015`, on every replay and in the compiled typed outputs; (2) the created date is still frozen in two report templates (invisible here: every run was the same day); (3) report summaries and some values ("$437.50", "Showing 1–10 of 13") are replayed template text, not observations — correct only because every run's state is identical; (4) instruction wording "Draft or Closed" slotted to {{01-signin.ticket_status}} |

## Round 53 (c923af6, merged to main)

Cloud-verified (2227 main / 2408 browser / 127 parity, 0 failures; corpus 0 status changes against
r51; the first browser attempt hit a Chromium version mismatch on the box, reinstalled and reran clean).

- **Unobserved report values (fwrd86).** A replay published a template value whenever it carried a
  slot, never checking the recording's literal text around it: "Created: 2026-09-23" and "Showing
  1–10 of 13" went out as findings, and n2 reported "total 15" after archiving a second ticket. Now
  every literal with a letter or digit must be shown on this run's page (rendered text, a11y lines
  or the url), or the value is withheld, in both runners. A LATER step that consumes a withheld value
  gets its single slot's value; compile counts sources by the same rule (compile/runtime mismatch
  4 → 0 across 224 flows). Summary prose keeps only clauses whose words this run observed, else the
  plain replay sentence. Echoed values stay out of the confident report in both runners (parity gap
  closed).
- **Run values in output keys.** `list_row_RD-1015` → `list_row`, renamed through the recorded
  report, ledger, skills, flow and compiled typed outputs, at export.
- **Named alternatives.** "requiring a Draft or Closed status" is no longer threaded to
  {{01-signin.ticket_status}}; 602 → 600 refs across 54 rebuilt flows, both removals the wrong one.
- **Flaky parity test** was the test's own race (the fixture list renders after load); now made
  deterministic with a 1.5s delay and a wait for the list. Not a product bug.

## Round 54 (c923af6): ten-app confirmation — 5/10 green

| round | runid | commit | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|---|
| 54 | fwrd87 | c923af6 | rd | 6/6 ×3 | yes: 8/8 tier A 0 turns | pass 6/6, drift 2 | **yes** | DEFECT: 04-add (Part B) publishes Part A's name — unscoped reads fall back to recorded row id part-row-p18, and a read frame hard-codes "RD Part A" |
| 54 | fwgr68 | c923af6 | gr | 6/6 ×3 | yes: 6/6 | pass 4/6+2 n/a | **yes** | password = username; 63 hits are all the username |
| 54 | fwgt7 | c923af6 | gt | 7/7 ×3 | yes: 4/4 | pass 5/7+2 n/a | **yes** | |
| 54 | fwvk7 | c923af6 | vk | 7/7 ×3 | yes: 3/3 | pass 5/7+2 n/a | **yes** | cosmetic: 03-open summary keeps orphan "(d); (e);" after dropped clauses |
| 54 | fwgh10 | c923af6 | gh | 7/7 ×3 | yes: 2/2 | pass 5/7+2 n/a | **yes** | |
| 54 | fwod81 | c923af6 | od | 6/6 ×3 | no: n2 03-open 7 turns; n3 0 (repinned variant) | pass 6/6 | no | round 48/49's dropSupersededSets refill arm dropped a mistaken product fill (#79) whose OWN diff opened a menu; replay re-selects on an undisturbed row and its effect never appears |
| 54 | fwec8 | c923af6 | ec | 7/7, 6/7, 6/7 | yes: 0 turns | pass 5/7+2 n/a | no | obj 7 "record id NOT in finalText": the instruction asked for the record id; 02-create froze it as a literal (derived d1 never substituted into reportTemplate) and export pruned it; 03-verify's {{v2}} slot was dropped from params, and templateSource still counted it. Success reported with `unreported: ["record_id"]`. Also round 53's templateLiterals keeps punctuation ("Dec 31 (") and withholds an observed value |
| 54 | fwkb39 | c923af6 | kb | 6/6 ×3 | no: n2 04-open 6 turns; n3 0 (repinned) | FAIL: same | no | a read publishes "Backlog " (trailing space); a slotted expectation line `- link "{{v5}}"` becomes `- link "Backlog "`, which a trimmed snapshot name never matches. Latent since fwkb38. Also: the credential scrub rewrote "KB Dashboard for admin" (password = username) to the marker, weakening that check |
| 54 | fwop10 | c923af6 | op | 7/7, 6/7, 7/7 | no: 02-create 30 / 61 turns | FAIL | no | n1's model gave inputs ids of its own via eval (`inp.id='wp-new-…combinedDate'`, `ce.id='journal-editor-2'`) and filled them; compile drops evals, so the ids never exist. n2's recovery reported SUCCESS while saying the comment was "NOT confirmed as posted" and banked a no-submit comment procedure as 1/1. Compiled: innerText ("OVERVIEW", CSS upper-case) vs textContent ("Overview") in text_contains |
| 54 | fwsi7 | c923af6 | si | 7/7 ×3 | no: 45 / 50 turns | FAIL 1/7 | no | Snipe-IT. n1 reached the new asset by eval + `goto /hardware/4` (fwsi6 clicked the link): a goto isn't a landing, so id 4 was never banked and stayed literal; seenUrl then blocked 03-edit's landed mint. n3's re-pin copied the very goto that stopped it into the artifact. 05-open reported success with its reads skipped; 04-report published a skill id and a screenshot filename as values |

None of rounds 50–53 caused a failure. Round 48/49's superseded-fill rule caused Odoo's; round 53's
literal rule wrongly withheld one observed value (EspoCRM close_date) without failing an objective.

## Round 55 (4212295, merged to main)

Cloud-verified on the second run (2285 main / 2469 browser / 131 parity, 0 failures; corpus 0 status
changes against r53, the ten round-54 runs all compile). The first run failed 6 rebuild tests: two
bench scripts passed `publishedOutputs` to `flatMap` by reference, so its new `chain` parameter
received the array index. With that fixed, fwgr14's rebuild gained one cross-step ref (17 → 18):
07-report's dashboard uid is now kept bound to 02-create.url.p1 (the same output its url slot already
embeds) instead of being dropped; reverting the report group alone restores the baseline exactly.

Seventeen defects from round 54, in five parallel groups (contract: bench/sweep-prompts/round55-contract.md):
- **ids** — eval-assigned ids removed from locator chains; a recovery re-pin drops the step that
  stopped its own replay and refuses a chain holding a demoted skill's failed step; the superseded-fill
  rule keeps a fill whose own diff changed more than its value (fwod81).
- **landing** — a goto to a record nothing earlier showed is a landing (fires on exactly one of 414
  published gotos: fwsi7's); mint at first landing, not first sighting; a sourceless goto becomes a
  click on the recorded link, or the procedure ends before it.
- **report** — minted ids become live references in report templates (fwec8's record id); a template
  value counts as published only if every marker is bound; words, not punctuation, decide "observed";
  skill ids and screenshot paths are never published; enumeration labels go with their clause.
- **honesty** — a recovery whose last gesture failed, or a tier-A replay that skipped a declared read,
  is PARTIAL: not banked, no repin, flow status "partial". On all 74 round-54 replay steps it flags
  exactly fwop10 n2 02-create and fwsi7 n2/n3 05-open, and no step of the five green apps. A password
  equal to a username is scrubbed only in the password field.
- **runners** — text waits compare innerText in every tier (CSS text-transform); values trimmed before
  filling snapshot lines and when read; a read scoped by a record slot never publishes another record's value.

## Round 56 (e48d1a1): second ten-app confirmation — 2/10 green

Kanboard, Vikunja and EspoCRM first stalled on Docker Hub's anonymous pull limit (100/hour on the
shared egress IP, exhausted by ten concurrent setups); re-fired two hours later. Future confirmations
launch in two batches of five. **No failure below was caused by round 55**: each diagnosis rebuilt the
recording at c923af6 and e48d1a1 and got identical procedures (or compiled the store to the same
verdict at both), except the fwop11/fwkb40 partial verdicts, a false positive of round 55's own rule.

| round | runid | commit | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|---|
| 56 | fwgh11 | e48d1a1 | gh | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 56 | fwec9 | e48d1a1 | ec | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | round 55 item 7 held live: the record id the instruction asked for is published |
| 56 | fwrd88 | e48d1a1 | rd | 6/6 ×3 | yes, 0 turns | pass 6/6 | no (partial) | a `read_all role=alert` count read found no alerts and was SKIPPED instead of publishing "0" (both runners) |
| 56 | fwop11 | e48d1a1 | op | 7/7 ×3 | yes, 0 turns | pass 5/7+2 n/a | no (partial) | false positive of round 55's honesty rule: a synthesized, never-resolved read of a transient toast (fixed 3c60f6c: unproven reads don't count) |
| 56 | fwkb40 | e48d1a1 | kb | 6/6 ×3 | yes, 0 turns | pass 4/6+2 n/a | no (partial) | same false positive (unproven sidebar-link read) |
| 56 | fwgt8 | e48d1a1 | gt | 7/7, 6/7, 6/7 | yes, 0 turns | pass 5/7+2 n/a | no | n1 reported titles fused with numbers ("Seed: triage inbox (#1)"); no element shows that, so no read was captured and replays publish no titles (obj 1) |
| 56 | fwsi8 | e48d1a1 | si | 7/7, 6/7, 6/7 | yes, 0 turns (was 45/50) | pass 5/7+2 n/a | no | same class: "Asset Tag SEED-0001 / Name Seed: Reception Laptop" |
| 56 | fwod82 | e48d1a1 | od | 6/6 ×3 | no: 04-change 3 turns ×2 | refused (unsourced-ref) | no | the product name was read only in a row showing it twice (ambiguous read-back refused); 04-change's instruction named it, so it referenced an output nothing publishes. Export warned "will REFUSE"; the sweep ignored it |
| 56 | fwgr69 | e48d1a1 | gr | 6/6 ×3 | no: 132 / 58 turns | refused (demoted-pin) | no | a collapse/expand "Panel options" pair split by a query-string change; abandonedRepeatClick (round 43) judged the collapse consequence-free from the compiled expect and dropped it, keeping a plain expand that collapses the section on replay |
| 56 | fwvk8 | e48d1a1 | vk | 7/7 ×3 | no: 48 / 42 turns | FAIL | no | a FILTERS popup opened in 01-open and closed by the same click in 02-create; the hide-only click has no check, so on replay it OPENS the popup, passes silently, and the popup swallows Add. Also a login-page reload emptied a fill whose echo check has no refill |

Honesty finding: a rule making "the instruction asked to report X and nothing publishes X" a PARTIAL
verdict would flip steps of GREEN apps (Ghost tags/publish date, Grafana time range after reload,
Gitea labels, RepairDesk parts total). Those apps pass because verifiers read the app database, not
the report. Shipped as a per-step warning (4dc62d6), not a verdict; to be reported as a separate
benchmark measure, "asked facts published", beside green.

## Round 56 fixes (2aa57e8, merged to main)

Cloud verify of a08138d: 2333 main / 2519 browser / 140 parity; the ONLY failure (in both suites) was
test/execution-gates "alertVerdict … same live-region capture", a source guard that observe.ts holds no
alert selector: two comments in the new count-read code named `role=alert`. Reworded (2aa57e8); the
guard and execution-source pass locally. Merged on that basis; a full cloud re-verify of main runs
alongside round 57's first batch. Corpus: 0 status changes against r55.

- **ids** — a collapse/expand pair split by a query-string change is one toggle (consequence judged from
  the recording, not the compiled expect); a click whose whole effect was a removal checks it
  (`removedContains`), skipping when already in effect — but a click that submits this segment's work
  or closes what this segment opened is REQUIRED: never skipped, and it stops if there is nothing to close.
- **report** — a reported value made of page element texts plus the model's labels is split into one
  live read per element (all-or-nothing coverage); a step's own dropdown selection is a source (read
  back after the click); an ambiguous text match inside one row pins, scoped to that row.
- **honesty** — an unproven (never-resolved, synthesized) read never makes a step partial (fwop11,
  fwkb40); "the instruction asked to report X and nothing publishes it" is a per-step WARNING
  (`unanswered`) and an export warning, not a verdict.
- **runners** — a count read that matches nothing, with its scope on the page, publishes "0"; a fill whose
  document was replaced under its own check is refilled once.

Main re-verified (verify-round56d, 1a464d5, Chromium revision 1228 installed and used): 2334 main /
2520 browser / 140 parity, 0 failures; corpus 0 status changes. The round-56c run's one parity failure
("both runners bound a navigation that never completes") was chromium-1194 on the box, not the code.

## Round 57 (2aa57e8): third ten-app confirmation, two batches of five — 5/10 green

| round | runid | commit | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|---|
| 57 | fwrd89 | 2aa57e8 | rd | 6/6 ×3 | yes | pass 6/6 | **yes** | unanswered: 06-delete final_status |
| 57 | fwod83 | 2aa57e8 | od | 6/6 ×3 | yes | pass 6/6 | **yes** | first odoo green since round 49; the selection-as-source fix held (no unsourced-ref) |
| 57 | fwop12 | 2aa57e8 | op | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | no false partial |
| 57 | fwvk9 | 2aa57e8 | vk | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | round 56's hide-click and refill fixes held (was 48/42 turns) |
| 57 | fwgt9 | 2aa57e8 | gt | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | several unanswered asks the objectives don't score |
| 57 | fwgr70 | 2aa57e8 | gr | 6/6 ×3 | yes | FAIL 1/6 | no | the artifact's hover has no timeout: syntheticHover's bare `locator.hover()` gets the library's 30s default in the daemon but Playwright Test's unbounded actionTimeout in the artifact; hung on a never-actionable panel-menu button until the 300s budget. The retry then met the first attempt's untagged dashboard (reset fixed db11c08) |
| 57 | fwkb41 | 2aa57e8 | kb | 6/6, 5/6, 5/6 | yes | pass 4/6+2 n/a | no | obj 1 columns: captureReadBack counts NON-rendered matches and Kanboard renders each column title twice (header + hidden collapsed list), so the composite never pins — pruned in every kanboard flow since fwkb18. Also new_task_numeric_id "4" shown only as "#4" and as task_id=4 (idPositionPart admits only `id`) |
| 57 | fwec10 | 2aa57e8 | ec | 7/7, 6/7, 6/7 | yes | pass 4/7 | no | **SILENT WRONG DATA**: obj 4 "amount=1250012500" is the persisted record. Choosing the account emptied Amount, so n1 re-typed it; replay's restoreStandingFills refilled it, then the recorded `type` (pressSequentially, never clears) APPENDED. Both replays and the compiled run reported success, drift 0. Also: stage never read (captureReadBack refused a match duplicated in the Stream) |
| 57 | fwgh12 | 2aa57e8 | gh | 7/7 ×3 | no: 8 / 7 turns | FAIL | no | Ghost ignores the first click on "Published" after publishing; n1 clicked twice with only reads between, and abandonedRepeatClick (round 43) dropped the first as a failed attempt. Identical at e48d1a1 and 2aa57e8 |
| 57 | fwsi9 | 2aa57e8 | si | 7/7 ×3 | no: 67 / 42 turns | refused | no | n1 Ctrl+clicked a link into a new tab: the recorder credits an opener-less new page as the popup, but armPageEffect waits only for the `popup` event, so replay stopped at 01 and every later step (recorded on page 1) was stranded. The page-effect stop counted as harmless; pinEndsElsewhere treated a `#history` anchor as another route and refused a good re-pin, so compile hit a demoted pin |

## Round 57 fixes (7fe711b, merged to main)

Cloud verify of 4bd2d93 on Chromium 1228: 148/148 parity; 3 failures in the main and browser suites,
from two interactions of the merged groups: `pageEffectDemoted` read `skill.stats.failedAtStep` on a
skill with no stats (a real crash path through pinStatus), and a test mock of browser.js lacked the
new DEFAULT_ACTION_TIMEOUT_MS. Fixed in 7fe711b (optional chaining; the mock constant); the three tests
pass locally. Merged on that basis; main is re-verified in the cloud alongside round 58 batch 1.
Corpus 0 status changes against r56.

- **runners** — **EspoCRM's silent wrong amount**: a `type` clears a field already holding its value or
  filled earlier in the segment, and a field left holding its value twice stops the step (nothing is
  saved). The artifact's hover is bounded (3s probe) and the emitted runFlow sets the daemon's 30s
  defaults; 16 unbounded Locator calls got explicit timeouts, and a type-checked guard fails on new ones.
  An opener-less new tab (Ctrl+click) is the popup, as the recorder already judged.
- **ids** — a click the app ignored once, with only reads between it and its repeat, is kept once and
  marked `repeatIfNoEffect`: both runners press again only when the first press changed nothing.
- **report** — composite parts pin through the rendered-only code tier (hidden duplicate column titles);
  an id reported without its affix ("4" of "#4") is read at its core when unambiguous; an ambiguous match
  inside a field the key names wins (EspoCRM stage vs its Stream copy); a `[data-value]` option pick is
  read back from the saved field.
- **landing** — a query-string id (`task_id=4`) is minted when the step's own mutation added the element
  that reached it; odoo's menu_id stays out (0 of 1309).
- **honesty** — a stop at a page-effect step is a real strike (s_24e7fd now demoted); a bare fragment
  like `#history` is the same route unless the app routes by fragment; a re-pin refused only for where
  it ends is re-judged after the next step's re-pin.

## Round 58 (a6a3857): fourth ten-app confirmation, two batches of five — 4/10 green

Main at ebfa26a/a6a3857, cloud-verified as verify-round57b on Chromium 1228: 0 failures, 148/148
parity, corpus 0 changes. Batch 1's od/kb/op hit Docker Hub 429s and were re-fired; op and gt then
went idle mid-run (the routine ended its turn with the sweep in the background) and were re-fired.

| round | runid | commit | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|---|
| 58 | fwrd90 | a6a3857 | rd | 6/6 ×3 | yes | pass | **yes** | |
| 58 | fwkb42 | a6a3857 | kb | 6/6 ×3 | yes | pass 4/6+2 n/a | **yes** | round 57's hidden-duplicate column pin held |
| 58 | fwvk10 | a6a3857 | vk | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 58 | fwgh13 | a6a3857 | gh | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | round 57's repeatIfNoEffect held (was 8/7 turns) |
| 58 | fwod84 | a6a3857 | od | 6/6 ×3 | no: 7 / 0 turns | pass 6/6 | no | export's stripLeakedCandidates dropped the option `[FURN_7777] Office Chair`: the ledger filed the catalog code FURN_7777 (reported by 03-open) as a run-made identifier by its shape; only the render-counter `#autocomplete_0_2` was left |
| 58 | fwsi10 | a6a3857 | si | 7/7 ×3 | no: 23 / 29 turns | pass 5/7+2 n/a | no | n1 clicked the date picker's "15" after typing the date: a click whose only effect was closing the calendar the fill opened; on replay the calendar was not open. Positional css also led the chain (stableFirst by shape). n2's recovery was the first strike, so n3 repeated it |
| 58 | fwec11 | a6a3857 | ec | 7/7 ×3 | yes, but 01-signin partial | pass 5/7+2 n/a | no | the skipped read `page_title` (n1 pinned "EspoCRM" inside the footer's "EspoCRM, Inc.") made the step partial though no instruction asked for it; the echo rule matched the user menu "Admin" to the typed login "admin" by text alone |
| 58 | fwop13 | a6a3857 | op | 7/7 ×3 | no: 13 / 8 turns | FAIL | no | n1 clicked Bench Project twice (no effect), listed tabs, then goto'd; the bare `tabs {}` ended abandonedLinkClick's scan, so both clicks were kept and the second stranded every run, the artifact included. Not demoted: n3's stop recovered by navigation only (harmless, fwod49/51) |
| 58 | fwgt10 | a6a3857 | gt | 7/7, 6/7, 6/7 | yes | pass 5/7+2 n/a | no | obj 1: n1 took the seed issue titles by `eval` (its reads of `.issue-title` matched nothing on this build), so no compiled read produces them; the template literal was withheld (round 53) on the search page. The runtime `unanswered` missed it; a comma-list count read of nothing was skipped, not "0" |
| 58 | fwgr71 | a6a3857 | gr | 5/6 ×3 | yes | pass 3/6+2 n/a | no | not an engine defect: the recording model rewrote "auto-refresh 1m" as the Settings intervals list (timepicker.refresh_intervals) and never selected 1m; replays reproduce it faithfully. Task left as is |

## Round 59 fixes (fix/round59)

Five branches off a6a3857, merged: ids 58c3c48, landing 8169849, runners 42b07e5, report 19461e7,
honesty 143bd5b.

- **ids (fwod84)** — a value the recording saw OFFERED (an option/menu line a later click picked) before
  any report carried it is app data, a task constant, in compile and in export's strip alike; export's
  strip never removes the last named candidate for a shape-only value when only positional ones remain.
- **landing (fwsi10)** — a click whose only recorded effect removed the popup the preceding fill/type
  opened, with the typed value still in the field, is a hide whose removal is not required: both runners
  skip it (logged) when its target is gone with that popup. stableFirst discounts digits that come from a
  task constant or an entered slot value (a record id in the path still demotes).
- **runners (fwop13)** — one `observesOnly` definition (read, read_all, wait_for, a bare tab listing) for
  abandonedLinkClick and repeatOf; a bare `tabs` listing is dropped at compile like a screenshot.
- **report (fwec11)** — echo is element-scoped: a text-equal read is observed only if it is outside the
  acted-on control and its widget (found by locator, so a re-render is still the control) AND something
  committed the value in between (navigation, url change, the control detached, a click whose recorded
  effect shows the value). A skipped read is partial only for an asked output. A reported value equal to
  document.title is recorded as a title read.
- **honesty (fwgt10)** — a composite no read produces gets read-backs anchored at the step whose recorded
  diff shows its parts; export warns for an asked output held only by an unsupported template literal and
  the runtime `unanswered` includes it; a count of a comma selector list counts across the page.

## Round 59 (5a15753): fifth ten-app confirmation, two batches of five — 6/10 green

Main 5a15753 was cloud-verified as verify-round59c: 2399 main tests, 2591 browser, 155/155 parity, and the
corpus check showed 0 changes. EspoCRM's first recording died on OpenRouter credit (API 402), and it was
re-run after the top-up. Kanboard's session stalled idle and was re-fired.

| round | runid | commit | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|---|
| 59 | fwrd91 | 5a15753 | rd | 6/6 ×3 | yes | pass | **yes** | |
| 59 | fwgr72 | 5a15753 | gr | 6/6 ×3 | yes | pass | **yes** | |
| 59 | fwkb43 | 5a15753 | kb | 6/6 ×3 | yes | pass 4/6+2 n/a | **yes** | |
| 59 | fwvk11 | 5a15753 | vk | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 59 | fwsi11 | 5a15753 | si | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 59 | fwec12 | 5a15753 | ec | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | the rerun; the first died on credit |
| 59 | fwod85 | 5a15753 | od | 6/6 ×3 | no: 05-open fell back both | pass 6/6 | no | bindSkill's lazy regex split "Cabinet with Doors with Quantity"; v10 dropped at export |
| 59 | fwop14 | 5a15753 | op | 7/7 ×3 | yes | FAIL | no | the artifact diffed a capture taken after bind/url wait; the daemon diffs after settle (parity gap) |
| 59 | fwgh14 | 5a15753 | gh | 7/7 ×3 | no: 03-open 18/22 turns | FAIL | no | a post id minted mid-step was never an output, so it was frozen; a recovery dropped the stopped click |
| 59 | fwgt11 | 5a15753 | gt | 7/7, 6/7, 6/7 | yes | pass, obj 3 FAIL | no | the "bug" tick in a blocked attempt was not carried; 07-add published a param-only "bug" (false positive) |

## Round 60 fixes, the design pass and phases A/B (merged to main 0e778e9)

- **Round 60 fixes:** ids (bind slots against the referenced instruction; one slotActs), runners (the artifact
  judges the page the action settled on; failure evidence is published), ghost (a visited url part is the
  step's output; a recovery keeps a stopped step that worked; variant start gates), gitea (carry the first
  opening; closedBefore), report (a param-only value is published only if observed). verify-round60:
  one stale test string, fixed; 166/166 parity.
- **Design pass** (notes/design/): a review of rounds 50–59 found no convergence in green counts. The user
  ruled out per-recording rehearsal replays because of the cost to users.
- **Phase A:** recorder stage 0 (obs, seq/t, failed steps), eval hygiene (evalResult, the guard, the
  empty-read hint, `$0`).
- **Phase B:** one report classifier; a typed value needs commit evidence. verify-phaseAB: 0 failures,
  171/171 parity.

## Round 61 (0e778e9): sixth ten-app confirmation — 6/10 green

Every failure was recording variance: rebuilding each recording at 5a15753, c089d419 and 0e778e9 gave
identical procedures. Phase A's `obs` evidence decided or confirmed four of the diagnoses. Phase B changed
no objective. One element-scoped false positive was found (fwec13) and fixed.

| round | runid | commit | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|---|
| 61 | fwrd92 | 0e778e9 | rd | 6/6 ×3 | yes | pass 6/6 | **yes** | |
| 61 | fwkb44 | 0e778e9 | kb | 6/6 ×3 | yes | pass 4/6+2 n/a | **yes** | |
| 61 | fwod86 | 0e778e9 | od | 6/6 ×3 | yes | pass 6/6 | **yes** | round 60's ids fix held |
| 61 | fwec13 | 0e778e9 | ec | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | reformatted typed values read at the control published as observed ("12,500", a picker default "2018-01-16") → fixed |
| 61 | fwsi12 | 0e778e9 | si | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 61 | fwgh15 | 0e778e9 | gh | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 61 | fwop15 | 0e778e9 | op | 7/7 ×3 | no: 01-open 20/24 turns | refused (demoted pin) | no | three no-effect link clicks, then a goto to the href; obs decided it |
| 61 | fwgr73 | 0e778e9 | gr | 6/6 ×3 | no: 04/05-open ~58 turns | FAIL | no | Ctrl+F then typed into the JSON editor; the doubled-value guard stopped |
| 61 | fwgt12 | 0e778e9 | gt | 7/7 ×3 | no: n2 03-set 20 turns | pass, obj 3 FAIL | no | "bug" toggled four times; timing decides; scoped reads skipped, not failed |
| 61 | fwvk12 | 0e778e9 | vk | 7/7 ×3 | no: 02-create 20/29 turns | pass | no | an autosave's "Saved!" flash credited to a placeholder click |

## Round 61 fixes and phase C (merged to main f508e0d)

- op: abandoned link clicks decided by obs; rule D (no heal onto another role).
- gr: R1 (a value the recording itself saw doubled is let through); R2 (an already-in-effect skip; a
  positional hit must carry the recorded name; a recorded point is not positional).
- vk: dropFlashedLines (never on a submit step; never a popup line, which merging with gitea's fix showed).
- gt: an applied pick is skipped (provenance gate); a scoped read that finds another value fails the step.
- report: element-first echo; the echo ledger spans the flow step.
- Phase C (shadow only): network and in-page journals, page events, the gap diff, shadow.jsonl, and
  SITELOOPER_JOURNAL_FEEDBACK (off). Vision: SITELOOPER_VISION (off), for the MiMo A/B.
- verify-round61: 2 recorded-point parity failures (R2), fixed. verify-round61c: 1 failure (the journal
  drain had no bound on a never-committing navigation), fixed in 364708a2 and passing locally; main is
  re-verified alongside round 62.

## Round 62 (f508e0d): seventh confirmation, 8 apps (rd, kb stable) — 4/8 green (6/10 counting the stable pair)

| round | runid | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|
| 62 | fwod87 | od | 6/6 ×3 | yes | pass 6/6 | **yes** | three in a row |
| 62 | fwop16 | op | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | first since 57; round 61's link-click rule held |
| 62 | fwec14 | ec | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 62 | fwgh16 | gh | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 62 | fwgr74 | gr | 6/6 ×3 | no: 07-open 9/11 turns | refused (unsourced-ref) | no | a uid read off 01-open's url was threaded under its report key |
| 62 | fwvk13 | vk | 7/7 ×3 | no: 03-set 16/34 turns | FAIL 0/7 | no | round 60's visited-url rule let another route's p1 win; plus a login refill race in the shared pre-submit check |
| 62 | fwgt13 | gt | 7/7, 4/7, 4/7 | yes, 0 turns | pass 2/7 | no | **SILENT WRONG DATA**: coalesceControls (since 2026-08-23) folded ArrowDown ×3 into one press; keyboard picks landed on the wrong items |
| 62 | fwsi13 | si | 7/7, 0/7, 6/7 | no: n2 73 turns | pass | no | a select2 pick committed whatever was highlighted; a cleared pre-fill detour; a record list flattened to [object Object] |

Round 62 fixes (merged to main b6966d3; verify-round62 PASS: 2631 / 2852 / 199 parity): key presses never folded; journal-named
key picks and select2 highlight picks compile to picks by name; a reported url value binds to its url part; visited url parts
compare within their route; the pre-submit refill re-checks a replaced document; an off-record healed or positional read is not
published; a journal-proven restore detour is dropped (`was` recorded); report records flattened. Phase C shadow rules fixed and
keyPick added: abandonedEdit, flashCause, linkClick and pickerNetState agree on every observed case (phase D candidates).

## Round 63 (b6966d3): eighth confirmation, 7 apps (rd, kb, ec stable) — 3/7 green (6/10 counting the stable three)

| round | runid | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|
| 63 | fwgt14 | gt | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | the folded key presses fix held |
| 63 | fwgr75 | gr | 6/6 ×3 | yes | pass 4/6+2 n/a | **yes** | |
| 63 | fwvk14 | vk | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 63 | fwod88 | od | 6/6 ×3 | no: 10 / 48 turns | refused (unsourced-ref) | no | round 62's keyPick misread an Enter on a button (regression); a read's locator named its own minted value (S00021) |
| 63 | fwop17 | op | 7/7 ×3 | no: n2 8 turns | FAIL 1/7 | no | a row name pushed past the 80-char cap by the longer spec runid |
| 63 | fwsi14 | si | 7/7 ×3 | no: 44 / 34 turns | FAIL | no | an origin read the wrong of two banked values (the recording's asset opened); a lookup typed n1's minted tag |
| 63 | fwgh17 | gh | 7/7 ×3 | yes, but 04-open partial | pass 5/7+2 n/a | no | round 60's given rule judged a loaded url against the end page |

Round 63 fixes (merged to main 71d955d; verify-round63 PASS 2654 / 2875 / 204 parity): a key that activated a control picks nothing; an
export-time drop of a read locator naming its own referenced run value; a second full-name look past the name cap; a given url the chain
loaded is observed; origins read the step's end value; a navigation keeps its landing's alert; an app-minted value is never typed as a literal.

Vision A/B (MiMo, 18 runs, vision on vs off): clean (both replays model-free and compiled pass) 3/9 with vision vs 5/9 without. No
evidence that vision helps; within noise at n=3 per cell. Full metrics pending.

## Round 64 (71d955d): final ten-app confirmation — 6/10 green

| round | runid | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|
| 64 | fwrd93 | rd | 6/6 ×3 | yes | pass 6/6 | **yes** | |
| 64 | fwec15 | ec | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | |
| 64 | fwod89 | od | 6/6 ×3 | yes | pass 6/6 | **yes** | round 63's keyPick and self-naming fixes held |
| 64 | fwgh18 | gh | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | round 63's given-url fix held |
| 64 | fwsi15 | si | 7/7 ×3 | yes | pass 5/7+2 n/a | **yes** | round 63's origin and minted-fill fixes held |
| 64 | fwgr76 | gr | 6/6 ×3 | yes | pass 4/6+2 n/a | **yes** | first fire stopped at pre-flight (stale container main); re-fired |
| 64 | fwkb45 | kb | 6/6 ×3 | yes | refused (not compilable) | no | earlier outputs that were ordinary words ("text", "open") were slotted, including every read's `what` mode |
| 64 | fwvk15 | vk | 7/7 ×3 | no: 18 / 15 turns | FAIL at 02-open | no | a text read's link matched 4 elements with the same text (sidebar + task rows), so it was ambiguous, and a later reference was empty |
| 64 | fwop18 | op | 7/7, 6/7, 6/7 | yes | pass 5/7+2 n/a | no | replays reported success but omitted the "Seed:" subjects (not listed unanswered); the recording model wrote them from reads no rule links |
| 64 | fwgt15 | gt | 7/7, 6/7, 6/7 | no: n2 61 turns; n3 0 | FAIL at 04-add | no | the label click's recorded point missed; an inline heal clicked the dropdown instead of "bug", and n3 reported success with the label missing |

Round 64 fixes, pushed and NOT merged or verified (the run stopped after this round's results, as asked):
- fix/round64-kb 071a3deb: a mode arg is never slotted; a run output is slotted only where the flow could reference it. The unit suite passes; no change in the corpus.
- fix/round64-vk df20fe8f: a text read resolves when every match reads the same text. Replay and artifact were compared on a new fixture.
- fix/round64-op 23f15c95: a report clause's "those/these" and "how many" count as asks, so export warns and the replay lists them unanswered.
- Open: the fwgt15 inline heal onto the wrong element (no fix yet).

Vision A/B full metrics (bench/ab-metrics.mjs, 9 runs per arm). Vision on vs off:
- clean runs: 3/9 vs 5/9;
- replay model turns: 226 vs 210;
- replays failing an objective: 3 vs 0;
- recording inner cost: $2.43 vs $1.94;
- recording wall time: 156 vs 172 minutes.

Verdict: vision does not help; keep it off by default.

## Round 65 (62859f8a): the sourcing-hold confirmation batch (SITELOOPER_SOURCING_HOLD=on), batch 1 of 2 — 3/5 green

Main 62859f8a = round 64's main plus hygiene stages 3-4 (fix/hygiene-s34, verified verify-hygiene-s34: 2664 / 2890 / 204
parity, corpus 0 changes). The flag is ON in every run of this round. Batch 1: the five eval-heavy apps; batch 2 (rd, od
controls) waits for the held-values fix below.

| round | runid | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|
| 65 | fwop19 | op | 7/7 ×3 | yes | pass, drift 2 | **yes** | first op green since 62; the hold fired on 04-open (see below) and the retry LOST every value (values {}) |
| 65 | fwec16 | ec | 7/7 ×3 | yes | pass, drift 1 | **yes** | no hold fired (4 instructions) |
| 65 | fwgh19 | gh | 7/7 ×3 | yes | pass, drift 0 | **yes** | hold on 02-create url_slug: the model went `back`, clicked, and added 3 labelled reads (url_slug, excerpt, slug_preview) |
| 65 | fwsi16 | si | 7/7 ×3 | no: 02-create 45/44 turns, 04-open 27/47 (unresolved refs 01-signin.model/.status) | refused (unsourced-ref) | no | 01-signin REPORTED model="Bench Laptop Model", status="Ready to Deploy" (list columns nobody asked for); 02-create's literals were threaded to them; nothing reads them. The hold did not fire: the values were not ASKED (askedOutputs), by design |
| 65 | fwgt16 | gt | 7/7 ×3 | no: 03-set 66/54 turns | FAIL at 03-set (positional fallback #2 not the recorded name) | no | the round-64 fwgt15 class (label picker click missed), unchanged; two holds fired and both retries added reads (5 unlabelled; 2 labelled) |

Sourcing hold, batch 1 (RecordedReport.sourcingAsk): 4 holds over 25 instructions (16%; the design's bar was ≤10%).
- fwop19 04-open `description_text`: retry added 0 reads under that label (1 labelled read `wp41_description` after a
  tab click), then reported values {} — the naming hold's mergeReportValues protection did not cover the sourcing hold.
  Fixed on fix/sourcing-held-values 0009043e (held values kept; a labelled retry read answers the asked key), verify fired.
- fwgh19 02-create `url_slug`: 3 labelled reads added; gestures after the hold: `back`, `click` (navigation back to the
  editor to read the slug, allowed by the ask text).
- fwgt16 03-set `sidebar_labels`: 5 reads added, none labelled (the model renamed the values instead); 06-open
  `labels_displayed`, `milestone_displayed`: 2 labelled reads, clean.
- Not covered by design: fwsi16's refusal. The hold only asks about ASKED keys; the unsourced values were unasked
  list columns the model reported anyway, which flow-building then threaded a later step's literals to. Candidate rule
  (compile side): never thread a later step's literal to an unasked, unsourced reported value; keep it a task constant.
- No hold fired on a value the page showed; no hold burned a turn on a correct derivation (0 stubborn retries).
Steps per n1 instruction vs round 64 (different recordings, indicative only): op 132 vs 152, si 150 vs 68, gt 168 vs
262, ec 88 vs 147, gh 79 vs 90. No sign of hold-driven inflation; si's growth is in instructions where no hold fired.

Convergence experiment (bench/converge.mjs, main 26d22062; user decision 2026-09-25: the artifact stays model-free for
CI, so model work and retries go to record/compile time): compile → rerecord the earliest named step → recompile; a
failing artifact → repair --converge 1 → rerecord the step it names; ≤4 rounds. Fired: fwod88-cv, fwgr74-cv (compile
refusals), fwvk15-cv, fwgt15-cv, fwsi14-cv (artifact failures). Queued: fwop15-cv, fwop17-cv. fwkb45 excluded (a
compiler blocker with no rerecord action: the loop stops at once, checked locally).

Round 65 batch 2 (main 62546c80: batch 1's main plus the held-values fix; the controls, hold on) — 1/2 green; round 65 overall 4/7:

| round | runid | app | verified | replay model-free | compiled | green | notes |
|---|---|---|---|---|---|---|---|
| 65 | fwrd94 | rd | 6/6 ×3 | yes | pass, drift 0 | **yes** | one hold (07-set `errors_shown` = "none — the action succeeded…", a verdict in prose: a wasted turn); the retry added no read and, with the fix, kept every value |
| 65 | fwod90 | od | 6/6 ×3 | no: 08-open 9/12 turns (s_bcdf62 stopped at step 3: expected the contact form url, browser on the sales list) | refused (demoted-pin 08-open) | no | recording variance in the final verification step; no hold fired. Export: 03-open `untaxed_amount` asked and "nothing reads it" although n1 made a LABELLED read of it — promoteLabelledReads dropped it because line_subtotal held the same text (£ 885.00), so the hold never saw the key; 03/04-open `status` values are >80-char prose ("Draft - statusbar radio 'Quotation' …"), not data-shaped, so not held (by design; export warned) |

Sourcing hold, round 65 in total: 5 holds over 42 instructions (12%). Retries: 3 added reads (2 labelled), 2 added none; 1 wasted
turn on a verdict-in-prose value; values lost once (fwop19, fixed) and kept once after the fix (fwrd94). Data-changing gestures
after a hold: op 1 click (tab), gh back+click (navigation to re-read). No n1 objective was lost in any run (42/42 verified).
Follow-ups: (1) a verdict word heading a prose value ("none — …") is a verdict, not data; (2) a labelled read is promoted even
when another key already holds the same text (fwod90 untaxed_amount vs line_subtotal), else the asked key is never a candidate.

## Convergence experiment, results (main ec8691de; bench/converge.mjs)

Question (user, 2026-09-25): the artifact stays model-free for CI, so how far do the EXISTING retry commands (rerecord,
repair) take a recording that did not end in a passing artifact? Each run: compile → rerecord the earliest named step →
recompile; a failing artifact → repair --converge 1 → rerecord the step it names; ≤4 rounds. 11 runs in all; the first
6 stalled on gaps in the retry machinery itself, each fixed before the next run (rerecord: recorded values emptied and
never refilled; a re-record never re-threaded a url-part reference; the replaced chain stayed a candidate and was re-pinned;
driver: repair's step strings, the artifact's failing-step forms, the producer a `needs {{P.key}}` names, the outputs a
re-record must be told to read; repair's spec check needs the spec beside the flow file). Fair runs, on ec8691de:

| run | from | class | verdict | flow runs | model turns | what decided it |
|---|---|---|---|---|---|---|
| fwgr74-cv3 | gr, unsourced-ref (uid read off the url) | **CONVERGED** round 2 | 2 | 13 | one re-record of 01-open, told to read dashboard_uid_from_url; rethreadUrlRefs bound 07-open to {{01-open.url.p1}}; artifact 4/4 |
| fwop17-cv | op, artifact FAIL 1/7 (name cap) | **CONVERGED** round 1 | 0 | 0 | round 63's cap fix is on main: compiled and passed 5/5 without a retry (control) |
| fwod88-cv3 | od, unsourced-ref (quotation_reference) | exhausted | 11 | 74 | round 1's re-record of 03-create READ the reference and round 2 COMPILED (the original refusal is fixed); the artifact then failed 01-signin s_5fccd8/2 on `- menu "6 3 YourCompany"` (activity counters in a menu name; the daemon passes it, repair replayed 9/9 twice, the spec check failed): a runner PARITY gap, and the loop wasted rounds 2-4 re-recording 01-signin |
| fwvk15-cv3 | vk, artifact FAIL (visible_projects_2 published empty) | exhausted | 12 | 74 | round 1's re-record of 01-signin was told to read visible_projects_2 and pinned; round 2's artifact failed elsewhere ("02-open s_3f56c3: identity: {{v1}} is not confirmed"), the driver missed that step form and re-recorded 03-create, whose new procedure never replayed clean (the re-pin rule refused: "the model drove 3-9 gestures beyond its replay") |
| fwop15-cv | op, demoted-pin 01-open | exhausted | 8 | 150 | four re-records of 01-open (sign-in + open project), none accepted: every run 2 needed 3-8 model gestures beyond the new procedure's replay. The round-61 shape (no-effect link clicks, then a goto): a step whose recording cannot be made deterministic by re-recording alone |
| fwgt15-cv, fwsi14-cv | gt, si | not run | | | Docker Hub 429 at setup (8 boxes fired in one hour); to re-fire |

Reading: 2 of 5 fair runs converged; of the 3 that did not, one is a parity gap the loop now names and stops on
(stuck-parity), one was a driver parse miss (fixed) over a step that then would not re-pin, and one is a genuinely
non-deterministic step. Cost of a converged run: 2 flow runs, 13 model turns. Cost of an exhausted one: 8-12 flow
runs, 74-150 turns — the loop needs an earlier stop on a step that fails to re-pin twice.
Open engineering items from the experiment: (1) counters inside a menu/button name in an expectation are not masked
as volatile (odoo); (2) a re-record whose run 2 needs model gestures beyond its replay is refused every time — the
phase C "readings" (link-or-goto) are the designed answer for fwop15's shape; (3) the loop should stop after two
refused re-records of the same step.
| fwgt15-cv, fwsi14-cv (re-fired 15:27) | gt, si | INVALID | 12 / 10 | 4 / 0 | every re-record's recording run came back `agent [BLOCKED]` with 0 turns: the OpenRouter key's credit was exhausted at about 15:40 UTC (255 of 255 used); gitea's one earlier re-record (03-open, 4 turns) still ran. Both need a re-run after a top-up |

Credit note: the OpenRouter balance ran out at ~15:40 UTC on 2026-09-25 (255 USD used in total). Every model-driven run
after that point is invalid, verifies (no model) are not. fwop15-cv2 and fwod88-cv4 (prompts on fix/repin-whole) wait
for the top-up.


## Convergence experiment, batch 2 (main 3df960b2: a driven-past full replay compiles whole, counters masked, stuck-repin stop; credit restored 16:30)

| run | from | class | verdict | flow runs | model turns | what decided it |
|---|---|---|---|---|---|---|
| fwod88-cv4 | od, unsourced-ref (quotation_reference) | stuck-parity — a FALSE verdict (the budget) | 5 | 46 | one re-record of 03-create (46 turns) read the reference; round 2 COMPILED and the artifact PASSED under Playwright (259s). The verifier failed obj 3 only ("2 lines, 1 distinct products": the second order line's product pick lands on the first product, in both runners). Repair replayed 9/9 twice, then its spec check hit the emitted 300s budget at 08-open (`Test timeout of 300000ms exceeded`) and the driver read that as parity. The round-63 menu-counter failure (fwod88-cv3) is gone: counters are masked now |
| fwgt15-cv2 | gt, artifact FAIL at 04-add (label pick recorded as a point) | exhausted — INCONCLUSIVE | 16 | 59 | the spec failed at the same site every round: `none of 1 recorded locators resolved at 04-add s_e18531/3 target: locator('[data-sitelooper-point="988,595"]')` (the daemon heals it to a minted `_aria_dropdown_label_N` id each run, so repair never converges on it). The driver re-recorded 03-open (3 turns), 01-open (11), 03-open (3) first — a healed DRIFT line named 03-open and flow order won — and only round 4 re-recorded 04-add (42 turns, re-pinned s_eae00d, run 2 tier A 16/16); the loop then ended without ever compiling it |
| fwsi14-cv2 | si, artifact FAIL at 03-open (url expectation) | stuck-repin — INCONCLUSIVE | 9 | 207 | the spec failed at `after 03-open s_911eab/1 expected url …/hardware/N/edit but browser is at …/hardware/N#history` every round and repair named only 03-open; the driver re-recorded 02-create five times (a healed drift line named it, and it is earlier in flow order). Each new whole recording (the model drove 18-24 gestures past the old procedure: the checkout) was refused by the cross-step guard: "its procedure ends on /hardware, and the next step's procedure starts on /hardware/:id without navigating there". 03-open was never re-recorded |
| fwop15-cv2 (re-fired 20:35; the 16:31 box hit the Docker Hub pull limit) | op, demoted-pin 01-open | stuck-repin | 5 | 123 | the driven-past fix did its part: every run replayed the sign-in s_713d1c in full, the model drove 6-8 gestures past it, and the WHOLE recording was the candidate each time. All five were refused by the cross-step guard: the new 01-open ends on `…/work_packages` or `…/work_packages?query_props={…filters…}` and 02's pin starts on `…/work_packages?query_props=:var` "without navigating there". learn.ts routeOf kept the query string in the route and did not read `:var` as a marker, so the same list page with and without its view state was two routes, while the replay gate (urlDiff) lets a key one side lacks pass. Fixed on fix/repin-route-query (routesAgree: textual route, else urlDiff either way round; kanboard's two literal `?controller=` values stay two pages) |
| fwop15-cv3 | op, demoted-pin 01-open | **CONVERGED** round 2 | 2 | 32 | on the merged guard fix (3e7896c7): one re-record of 01-open (23 turns) re-pinned s_687e52 at once, round 2 compiled and the artifact passed 5/5 (2 n/a). The third attempt at this recording: cv needed the whole-recording re-pin, cv2 the route-agreement fix, and each was one line of the store's own rules |

Reading: none of the three is a verdict on the retry commands themselves. All three were decided by the DRIVER:
(1) a healed drift line named a step, and flow order put it ahead of the step the spec actually failed at — in both
gt and si the right step was named by the failure text and by repair from round 1; (2) a spec check that timed out was
read as parity — odoo's 9-step flow runs in 259s against the emitted spec's 300s cap (MAX_BUDGET_MS, src/spec/emit.ts),
a margin to raise together with the outer watchdog; (3) the last round's re-record was never compiled. All three fixed
in bench/converge.mjs (this commit): only the failure's producer or site names a step, never a drift line; a timed-out
spec check falls through to the step choice; one final compile + artifact after the last re-record. Real defects the
batch surfaced, not driver faults: the gitea label-picker click recorded as a point only (04-add, open since round 64)
and an odoo second-line product pick that lands on the first product in both runners — invisible to Playwright and to
repair, only the verifier sees it (so a step the artifact "passes" can still be wrong).

Tally, fair runs with a verdict (7): converged 2 (gr; op17 control) · compile fixed, artifact passes Playwright,
verifier 5/6 1 (od) · inconclusive on a driver choice 2 (gt, si) · non-deterministic step 1 (op15-cv; re-run pending) ·
driver parse miss over a step that would not re-pin 1 (vk). Cost of a converged run stays 2 flow runs / ≤46 turns; a
wrong step choice costs 9-16 flow runs and 59-207 turns, which is why the choice rule matters more than the round cap.
