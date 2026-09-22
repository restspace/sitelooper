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
