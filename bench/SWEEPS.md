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
