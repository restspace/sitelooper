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
