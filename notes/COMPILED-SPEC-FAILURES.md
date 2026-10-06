# Why compiled specs fail where flow replay succeeds — evidence review

Written 2026-10-06, read-only over `C:\dev\sitelooper` at main e34fd2d7, the `results/hs*` held-out
branches (bench/heldout 4b0b7e83, notes/HELDOUT-RESULTS.md on that branch), bench/SWEEPS.md (rounds
33 → fwen7), memory notes for rounds 21-32, notes/PARITY_GAPS.md, notes/PLAN-self-updating-spec.md and
`git log --all`. "[inf]" marks an inference not read directly from a log or the code.

---

## 0. The headline finding

**Most compiled-spec failures are not runner divergences. They are the SAME stop in both runners.
Flow replay survives it only by calling the model, and the flowrun still labels that step "tier A".**

Held-out (Directus/Mealie/BookStack, 9 sweeps; spec clean 3/9):

| sweep | spec outcome | the same step in flow replay (n2 / n3) | same failure text? |
|---|---|---|---|
| hsdx1 | FAIL 05-set s_2731b5/4 "page still shows `button "Oct 5 {{*}} PM Edited by Admin User"`, which the click was recorded removing" | n2 tier A **17 turns**, recovered; n3 tier A **7 turns**, recovered; `fellBack: "s_2731b5 stopped at step 4 — …"` | identical |
| hsdx3 | FAIL 04-open start gate "expects …/tickets/+, browser is at …/tickets/<uuid>" | n2 13 turns, n3 tier B 30 turns: "every candidate refused — s_121712: not on the page this procedure starts from (…/tickets/+ …)" | identical |
| hsbs2 | FAIL 04-set s_7db6d8/5 "page still shows `textbox "Tag Name"`" | n2 7 turns, n3 8 turns; `s_7db6d8 stopped at step 5 — … "Tag Name" …` | identical |
| hsml2 | REFUSED: 02-find pinned to demoted s_7d9fa0 | n2 4 turns ("expected url …?search=Seed: Tomato but browser is at …/g/home"); demoted | the refusal is the record of that stop |
| hsml1 | FAIL 02-find s_8c410d/4 "expected url …/g/home?search=Seed: but browser is at …/g/home" | n2, n3 tier A 0 turns, 8/8 | **spec only** this time, but the same mechanism stopped the daemon on hsml2-n2: a debounced search url credited to the Clear click (the skill's step 4 `expect.urlPattern` is `?search={{v1}}`); timing decides it |
| hsbs1 | Playwright PASS, verifier obj 5 FAIL (page not moved into chapter "Release Notes") | n2/n3 06-archive tier A 0 turns, breadcrumb shows Release Notes | **spec only**, silent: the move's two clicks on the result link (s_ca7686/2,/3) passed every gate and the move did not land [cause inf: timing of BookStack's entity-selector] |

So of the 6 not-clean specs, 4 failed at exactly the step whose replay needed the model (same
message), 1 at a nondeterministic mis-recorded expectation that also stops the daemon, and 1 was a
genuine spec-only silent miss. In the 4 held-out sweeps whose replays were model-free, the spec was
clean in 3 (dx2, ml3, bs3; ml1 is the exception above); in the 5 sweeps whose replays used the model,
the spec was clean in 0.

SWEEPS.md says the same at scale (my classification of the `compiled` and `replay model-free`
columns, rows round 33 → fwen7, 235 rows; approximate):

| | replays model-free on n2+n3 | replays used the model |
|---|---|---|
| compiled clean | 132 | 24 |
| compiled failed / refused / wrong | 12 | 63 |

92% of sweeps with model-free replays had a clean spec; 72% of sweeps whose replays needed the model
did not. The 12 "spec failed though replay was model-free" rows are the true runner gaps (and some
both-runner wrong-data cases): fwrd79, fwrd82, fwgr70, fwop14, fwkb45, fwec17-luna (runner/compile
gaps); fwgt3, fwec10, fwgt11, fwgt13, fwgt32-luna, fwgr71 (both runners wrong, verifier only).

**Why the flowrun hides this.** `tier: "A"` with `turns: 17, recovered: true` is how a pinned skill
that stopped and was finished by the model is reported (hsdx1-n2 05-set). The held-out "model-free
replays 9/18" metric counts turns, the per-step tier does not.

**Why compile does not refuse these skills.** Compile refuses only a *demoted* pin
(`src/spec/ir.ts:553` `pageEffectDemoted(member)` → `demoted-pin`, severity error). A stop that the
daemon judges "harmless" (`src/daemon/server.ts:2292`: recovered, instruction success, recovery
changed nothing observable) is banked as `harmlessStops`, never a strike (`src/skills/store.ts:1323`),
so the skill stays `provisional`. The published held-out stores show it:
- hsdx1 `s_2731b5`: `status: provisional`, `failedAtStep {"4": 2}`, `recoveredStops 2`, `harmlessStops 2`, successes 1 (the recording)
- hsbs2 `s_7db6d8`: `provisional`, `failedAtStep {"5": 2}`, `harmlessStops 2`, successes 1
- hsml2 `s_7d9fa0`: one stop that was not harmless → `demoted` → compile refused

Every replay of s_2731b5 and s_7db6d8 stopped at the same gate; the compile shipped them anyway, and
the spec throws at that gate because it has no recovery to make the stop "harmless". The harmless-stop
rule was added for fwod49 ("two stops at step 1 of a skill whose flow passed both times demoted it and
refused the compile", server.ts:2273) — it converted a compile refusal into a run-time spec failure
without changing the gate that stops.

---

## 1. Catalogue of compiled-spec failures and refusals

Categories: **(a)** compile REFUSED · **(b)** compiled, ran, a step skipped/dropped or its effect did
not land (incl. false pass) · **(c)** locator / frozen-value / drift failure at run time · **(d)**
report-only or read values · **(e)** daemon-vs-artifact parity gap. "R=model" = flow replay needed the
model at that sweep (so the spec failure is usually the same stop). Fix commits from `git log --all`
messages that cite the sweep.

### Rounds 21-32 (memory notes; SWEEPS.md starts at 33)
| sweep | cat | what / recorded cause | fix |
|---|---|---|---|
| fwgr54 (r21) | e | artifact failed a viz-picker toggle click the daemon passed (n2/n3 0 turns); cause never pinned (no error-context published) | none recorded |
| fwkb24, fwrd69 (r21) | a | demoted pin: report column names / a frozen locator id in rungs | r22 fixes A/B/C (1d7b126) |
| fwkb27 (r24) | e | artifact published an echoed read to later steps, daemon did not | 580d7931 |
| fwod64 (r25) | a | chain-segment demotion never re-pinned → demoted-pin | 5e0ee090 (rule H) |
| fwod66 (r26) | e | artifact bound an unpublished ref to '' and filled an expectation line with it; daemon drops such lines | rule J (5e0ee090/e8ab87a7) |
| fwrd75 (r27) | e | artifact judged 01-signin's start gate right after `load`, before the hash router redirected | 728f30cd (K: waitForContent) |
| fwod (r27) | e/a | artifact ran a stale pin the daemon had moved off; G refused it | c2652f42 (L/M) |
| fwod (r30) | a | recovery skill had no read for a referenced value → unresolved refs | f10415aa (O) |

### Rounds 33-65 (SWEEPS.md)
| sweep | cat | R | what / recorded cause | fix |
|---|---|---|---|---|
| fwop2 | c | model | Turbo url captured before navigation; stale wp id | 263d50a0 (linkLandingWarning) |
| fwrd78 | a | — | spec started at #/tickets not #/login | 263d50a0 |
| fwgr63 | a | — | unsourced-ref (text substitution) | 263d50a0 |
| fwrd79 | c/e | free | aria-hidden asterisk in stored name; role=[name] rendered raw in artifact | 80e04d8a |
| fwgr64 | a | — | unbound-pin | b5241ef3 |
| fwkb35 | a | — | unsourced-ref (seed title) / adopted failed step with no procedure | b5241ef3, 12dd754c |
| fwop4 | a | model | demoted: url id at another path position | 1df36459 |
| fwgt1 | a | model | 03-set "no converged procedure" (failed picker adopted) | ebfed7dc |
| fwec1 | c | model | re-pin bound the step's own minted url id as its param | ebfed7dc |
| fwsi2, fwsi3 | c | model | one-digit asset id (4) below the path-id floor stayed literal | round 38/39 fixes |
| fwgh3 | c | model | expectation froze "1 minute ago" | round 38 (volatile mask) |
| fwgh4 | a | model | unsourced-ref: report-template value | 4e653126 |
| fwgh6, fwgh8 | b | model | popup opened by the click never credited / credited to wrong click | bf26abd5, dc58c297 |
| fwvk4 | b | model | abandoned description attempt kept with its effect | round 41 |
| fwgt3 | b | free | recording killed mid-picker (DeepSeek 400); spec 1/1 Playwright, verifier 4/7 | recording-side |
| fwec4 | c | model | redone set-value after a cancelled dialog; repin chain ends on list page | round 41 |
| fwop6 | e | model | artifact navigated where daemon refused (repeat link click) | round 41/42 link-click rule |
| fwec5 | b | model | both Saves kept; first navigates on replay | 4fa1125c (later reversed a6667a68) |
| fwop7 | d | free | read_all of reported values dropped at compile | round 43 |
| fwrd82 | c/e | free | raw `[role=dialog] >> …` stored unrewritten; daemon healed it, artifact cannot | dc58c297 |
| fwgt5 | a | model | unsourced-ref: text read of an image-only link "" | dc58c297 |
| fwod78 | c | model | hash filling in after login read as a minted record (rule G) | dc58c297 (mints.sole) |
| fwrd83 | c | model | alert expectation cut by a read of its own first line | round 48 |
| fwrd84 | a | model | demoted: exported procedure lost a value-bearing fill | f5a65b93 |
| fwod81 | b | model | dropSupersededSets dropped a fill whose own diff opened a menu | round 55 |
| fwec8 | d | free | record id frozen as literal, pruned | round 55 |
| fwkb39 | c/e | model | read published "Backlog " (trailing space); trimmed name never matches | round 55 |
| fwop10 | b/e | model | eval-assigned ids dropped at compile; innerText vs textContent | 393ac947, 09599b4f |
| fwsi7 | c | model | eval + goto: id never banked, stayed literal | 0983cfb9 |
| fwrd88 | d | free | count read of nothing skipped instead of "0" | 978455d6 |
| fwod82 | a | model | unsourced-ref (ambiguous read-back) | d739a0d2 |
| fwgr69 | a | model | demoted: collapse/expand pair split, collapse dropped | c179dbee |
| fwvk8 | b | model | hide-only click opens popup on replay; refill missing | 727926fa, 2753b61c |
| fwgr70 | e | free | artifact hover had no timeout (Playwright Test actionTimeout unbounded) | ad8eeb71 |
| fwec10 | b | free | SILENT WRONG DATA both runners: refill then `type` appended (1250012500) | 7b1c6886 |
| fwgh12 | b | model | abandonedRepeatClick dropped Ghost's needed first click | a6667a68 |
| fwsi9 | a | model | Ctrl+click new tab not reproduced; #history read as route | 7dfd2619 |
| fwop13 | b | model | inert link clicks kept; second strands every run | 42b07e54 |
| fwod85 | e | model | spec rethreaded a slot spec-only and passed while the daemon refused (gap the other way) | 28ea5e89 |
| fwop14 | e | free | artifact diffed a capture taken after bind/url wait; daemon after settle | 3e0b9bbd |
| fwgh14 | c | model | post id minted mid-step frozen; recovery dropped a click | 2bacfb12 |
| fwgt11, fwgt12 | b | mixed | picker tick lost / re-pick un-ticked: **spec passed 1/1 with wrong labels** | e9647a68, 0a1fe214, 282c8336 |
| fwop15 | a | model | demoted: three no-effect link clicks then goto | 5d094c89; converged in fwop15-cv3 |
| fwgr73 | b | model | Ctrl+F then typing into JSON editor | fc6a40d5 |
| fwgr74 | a | model | unsourced-ref: uid read off url under a report key | 9eae99ef; converged fwgr74-cv3 |
| fwvk13 | b | model | compiled run clicked Login on an empty form (refill race) | 7b261247 |
| fwgt13 | b | free | SILENT WRONG DATA both runners: ArrowDown×3 coalesced | e44f9d07 |
| fwsi13 | b | model | clear/restore around a failed save compiled whole | 2a864723 |
| fwod88 | a | model | unsourced-ref: read located by its own minted value; later cv3: artifact failed on activity counters in a menu name the daemon passed (parity) | 05005852; counter mask |
| fwop17 | c/e | model | longer spec runid pushed a row name past the 80-char cap (spec-specific input) | 9e3b0d59 |
| fwsi14 | c | model | origin read the wrong banked value; lookup typed n1's minted tag; later #history anchor in start pattern | 144eaccb, 2ac844ef, facts route.fragment |
| fwkb45 | a | free | control args: read `what` slotted | 071a3deb |
| fwvk15 | d | model | ambiguous text read → empty reference | df20fe8f |
| fwgt15, fwgt16, fwgt17 | c/a | model | label picker click recorded as a point; heal clicks dropdown; reported (not read) picker state → unsourced-ref | open until carry-choice 944421c9 |
| fwsi16 | a | model | unsourced-ref: reported list columns threaded | 0e915b0e |
| fwod90 | a | model | demoted-pin 08-open (recording variance) | — |

### Rounds 66-76 and the Luna batch
| sweep | cat | R | what / recorded cause | fix |
|---|---|---|---|---|
| fwgt17 | a | model | unsourced-ref labels_picker_state (reported, never read) | 944421c9 (later) |
| fwgr78 | c | model | letters-only dashboard uid frozen into annotation request | facts stage 1 |
| fwsi18 | c | model | literal goto typed by the model, never threaded | r67/68 |
| fwop21 | c | model | in-place date edit timing ("type" effect never appeared) | — (timing class) |
| fwgt20 | b | model | recording created the issue twice; spec ran both (DUPLICATE) | — |
| fwop22 | c | model | search combobox never accepted typed text (evaluate timeout) | — |
| fwod94 | b/c | model | inline heal picked run 1's customer option — silent wrong record (both runners) | stage 3 |
| fwop24 | a | model | unsourced-ref: "Bench" threaded inside quoted literals | 94b82d0a |
| fwgt23 | c | model | adopted failed recording step; point locator | recording variance |
| fwod98 | b | model | opener guard skipped "Send and cancel" as already in effect (both runners) | 58115c43 |
| fwgt24 | b | model | recording set labels via fetch() evals; skill has no picker gesture | r72 evalMutation |
| fwop27 | c | model | 02-find timeout "with no model to recover" | — |
| fwgt27 | c | model | one-digit "#4" frozen in heading name | a635f240, 016e883d |
| fwsi26 | a/c | model | `04-set needs {{03-create.url.p1}}`: submit recorded as Enter in datepicker never minted the id | open |
| fwgr88-luna | a | model | demoted: "}" read broke `{{v1}}` markers | b8327e6b |
| fwec17-luna | a | free | `reads what={{v4}}` (control args slotted) | 57b71c4e / 19d133bd |
| fwec18-luna | a | model | demoted: retried submit compiled whole | 72f9a2ce / e9a43fff |
| fwgt32-luna | b | free | failed attempt's tick not carried | 75e3c7e6 |
| fwsi29-luna | b | model | mintedFill cut the procedure; edits never ran (1/7) | 34ed3cc8 |
| fwgt31-luna | b | model | whole task as one instruction never graduated | — |
| fwod102-luna | a | model | demoted 01-signin (sign-in folded with create) | — |
| fwop31-luna | a | model | unsourced-ref: ordinary noun threaded to a link text | 1b11205e |
| fwen1-luna | c | model | ERPNext new-doc slug frozen; element cap | 3121c441, 27c9964f |
| fwen2-luna | a | model | demoted 02-find (JSON filter url) + no converged 04-create | 30488082 |
| fwen3-luna | c | model | sign-in start gate (earlier take ignored); runid in JSON filter url | 4409dab3 |
| fwen4-luna | c | model | click-opened slug frozen; seed links absent (list race) | 21508b5c |
| fwen6-luna | a | model | demoted 02-find (filter "0 of 0") | 8e13d11e |

### Held-out (no fixes yet)
| sweep | cat | what |
|---|---|---|
| hsdx1 | b/c | 05-set hide gate (same as daemon, harmless-stop skill compiled); also `04-set s_6ce2c0/6 no locator recorded — value left empty` (read) |
| hsdx3 | c | 04-open start gate: n1's 03-create did not save, the procedure for 04-open was recorded on the unsaved form (same refusal in both runners) |
| hsml1 | c | debounced search url credited to Clear click; timing |
| hsml2 | a | demoted-pin 02-find (same url mechanism as hsml1) |
| hsbs1 | b | move into chapter silently did not land (spec only); also 01-signin s_ffda14/2 synthesized read skipped |
| hsbs2 | b/c | 04-set hide gate (same as daemon, harmless-stop skill compiled) |

---

## 2. Themes (by mechanism, my primary-cause classification of ~100 failing sweeps)

| # | mechanism | sweeps (approx.) | fixes so far | recurs after fixes? |
|---|---|---|---|---|
| T0 | **Spec has no recovery: the same stop both runners hit, which replay survives with model turns** (cross-cuts T1-T7) | ~63 of 79 SWEEPS failures + 4-5 of 6 held-out | none at the runtime level; each underlying cause patched instead | yes — it is the steady state |
| T1 | Run/app-minted value frozen into a url pattern, locator, expectation or goto (ids, slugs, uids, one-digit ids, #N, relative time, runid in JSON filter, anchors) | ~20: fwop2, fwop4, fwec1, fwsi2/3, fwgh3, fwod78, fwsi7, fwgh14, fwsi9, fwsi14, fwsi18, fwgr78, fwgt27, fwen1, fwen3, fwen4, fwop17, r21/r26 | ~20 commits; most phrased as general rules (mints.sole, provenance slots, route facts), several narrow (a635f240 then 016e883d, 3121c441 then 21508b5c for the same ERPNext slug) | **yes, every new app** (en1, en3, en4 in a row) |
| T2 | Abandoned / retried / redundant / no-effect gestures kept, or needed ones dropped, at compile | ~19: fwvk4, fwec4, fwec5, fwop6, fwgh12, fwgr69, fwvk8, fwod81, fwop13, fwop15, fwsi10, fwgt11/12, fwvk12, fwsi13, fwec18, fwgt32, fwgt20, fwod98 | heuristic per shape (abandonedRepeatClick added r43, reversed r57; dropSupersededSets; dropRetriedSubmits; undoneByNext; carry-choice) | **yes**; agent count ~12 commits, with reversals; 75e3c7e6 fires once in 2623 instructions |
| T3 | Reference / slot sourcing: a later step quotes a value no zero-model run publishes; control words slotted; unbound pins | ~19: fwgr63, fwgr64, fwkb35, fwgh4, fwgt5, fwec8, fwod82, fwgr74, fwod88, fwsi16, fwgt17, fwop24, fwop31, fwkb45, fwec17, fwvk15, fwsi26, fwsi29, r30 | ~12 commits (all general rules on threading); converge loop rerecords the producer | **yes** — new wordings each batch (Luna: fwop31, fwod102's `{{05-verify.new_actions_4}}`) |
| T4 | Demoted pin → refusal (a consequence: the replays failed twice) | ~14 | 70cf98fa (diagnostic + fix command), converge.mjs | yes (by design it reports T1-T3) |
| T5 | Timing / settle (incl. runner-specific waits) | ~10: fwgr70, fwop14, fwop21, fwop27, fwrd75, fwen6/en4 race, hsml1, hsbs1 [inf], fwgr54 [inf] | 12 commits (settle-before-step, urlHeldStill, holds movedAfterMs 8e13d11e, bounded waits ad8eeb71) | yes, but a smaller share |
| T6 | Locator identity / healing the artifact cannot do (raw selectors, point rungs, wrong heal, combobox type) | ~8: fwrd79, fwrd82, fwgt15/16/23, fwod94, fwop22, fwkb39 | general fixes (selector rewrite shared, role-name normalisation) | point-recorded picker recurred r64-r66 until carry-choice |
| T7 | Gestures compile cannot express (eval writes/ids, popups, tabs) | ~7: fwop10, fwgt10, fwgt24, fwsi7, fwgh6, fwgh8, fwsi9 | eval guard (393ac947, r72 evalMutation), popup crediting | reduced after phase A |
| T8 | Silent wrong data / false pass (both runners or spec only) | ~8: fwec10, fwgt13, fwgt12, fwod94, fwod98, fwen2, fwgt3, hsbs1 | each patched | yes; only the app verifier sees it |
| T9 | Recording/task decomposition (adopted failed step, one-instruction task, recording variance) | ~9: fwgt1, fwgt3, fwgt31, fwod90, fwod102, fwgr71, fwen7, fwgt23, hsdx3 | record-time guidance, holds | yes |
| E | True runner parity gaps (spec fails or passes where daemon does the opposite, with replay model-free) | sweep level ~15: fwgr54, fwkb27, fwod66, fwrd75, fwrd79, fwrd82, fwop6, fwgr70, fwop14, fwod85, fwop17, fwop10 (text), fwkb39, fwod88-cv3, fwgr77 (reverse), hsbs1 [inf] | git: ~30 parity commits, densest 09-04 → 09-18; shared core 4dae40cd (09-14); later gaps live in the emit layer (waits, settle moment, rethread) | **falling**: after 09-24 only fwop14/fwod85/fwod88-cv3/hsbs1 |

Reading: the fixes are almost all phrased as general rules, but each is triggered by one sweep and
several fire once in the corpus (agent's note: 75e3c7e6 "1 of 2623", 72f9a2ce "2 recordings",
a635f240) — in effect app-specific patches. T1-T3 recur on every new app because each new app brings
a new shape of the same thing (a new kind of minted id, a new kind of abandoned attempt, a new word
that collides with a read). T0 is the multiplier: any T1-T3 instance that the daemon can paper over
with the model is a hard failure (or refusal) for the spec.

---

## 3. Capability diff: flow replay vs compiled runtime

Since 4dae40cd (2026-09-14) the VERDICTS are one implementation: `src/spec/runtime-source.ts:15`
embeds all 26 `src/execution/*` modules verbatim; `emit.ts:1366-1388` includes those a flow uses.
Gates, resolver (`resolveCandidates`), positional verdicts, expectations (`expectedChangesVerdict`,
`hideVerdict`, `alertVerdict`), echo, refill, toggle, loops, holds (`holdForRecordedMove`), recipes and
site facts are shared. The emit layer still re-implements the ADAPTERS as strings (`emit.ts:182+`:
settle, urlEffect, click/fill/type/select/hover, resolveTarget/pick, readOptional, need, satisfied,
expectChanges) — that is where the post-09-14 parity gaps lived (fwop14 3e0b9bbd, fwgr70 ad8eeb71,
fwod85 28ea5e89).

| capability | daemon flow replay | compiled spec | verdict |
|---|---|---|---|
| model fallback when a pinned procedure stops | zero-model first, then cheap→strong model (`server.ts:2134-2221`, budgets doubled for adopted steps) | none: "The artifact has no recovery, so blocking here is a stop" (`emit.ts:1002`); every rung throws (e.g. `pickMiss` `emit.ts:726-744`) | **spec lacks — the dominant difference (T0)** |
| sibling skills / re-pin / wrong-record reset | up to 3 candidates (`server.ts:3035-3088`), re-pin (`server.ts:2420-2460`), goto startUrl on wrong record (`server.ts:2155-2163`) | one compiled chain; sibling substitution only at compile time (`ir.ts:492-505`) | spec lacks |
| inline heal of a dead locator chain | `tryHeal` (`replay.ts:889`) | none ("a compiled artifact has no inline heal", `replay.ts:276`) — fwrd82, fwgt15/16 | spec lacks |
| candidate retirement (reorder by seen counts) | yes (`repair.ts:531`, `replay.ts:987`) | no, by design (PARITY_GAPS "Retirement evidence") | spec lacks |
| learning written back (url generalisation, urlVariance, re-pins, stats) | yes (`replay.ts:2140`, `server.ts:2114-2121`) | per-run memory only (`emit.ts:323`) | spec lacks (by design; repair is the route back) |
| "harmless stop" accounting | a stop the model finished without changing anything is not a strike (`server.ts:2292`, `store.ts:1323`) | the same stop throws | **asymmetry that lets un-replayable pins compile** |
| navigation fallback, textHeldElsewhere, repeatIfNoEffect, restore/rearm standing fills, refill+resubmit, already-satisfied skip | shared (recover.ts, refill.ts, `satisfied()` `emit.ts:1092-1141`) | same | same |
| locator resolution | shared `resolveCandidates` | same (`emit.ts:647-702`) | same (minus heal/retirement) |
| timeouts | click tier 10s (`tools.ts:1589`), action 30s (`daemon/browser.ts:364`), no whole-flow cap | click tier 5s (`emit.ts:158`), action 25s (`emit.ts:166`), whole test `min(300s, max(120s, 30s×steps))` (`emit.ts:4696-4716`) — fwod88-cv4 ran 259s of 300s | spec stricter |
| settle before/after action, url wait | settleDom + 3s poll (`replay.ts:2119-2131`) | settle + one `waitForURL` 5s (`emit.ts:113,318`) | ~same |
| implicit pacing | in learn mode a full `observePage` signature before/after every state-changing step (`tools.ts:875-876`) | captures only when the step has recorded changes (`emit.ts:2575-2579`) | spec runs faster [inf: plausible cause of hsml1 / hsbs1 / fwgr54-type spec-only timing misses] |
| effect expectations | diff read once | same verdict, polled up to `EXPECT_WAIT_MS` 5s (`emit.ts:1151,1196-1207`) | spec more patient |
| skipped read of an ASKED output | step marked PARTIAL, fails the step count (`server.ts:2234-2250`) | `logWarning("PARTIAL …")`, test still passes (`emit.ts:3706-3721`) | **spec weaker (silent)** |
| report / typed outputs | finalText report scored by verifiers | no report → every report-only objective UNVERIFIABLE (RESULTS.md:126) | spec lacks |
| eval | refused by `evalRefusal` (`tools.ts:1728`) | `page.evaluate` unguarded (`emit.ts:2857`) — but compile drops evals (`compile.ts:834-846`) | spec weaker guard (minor) |
| compile-time refusal of shaky pins | — | only `demoted-pin` (`ir.ts:553`), `unsourced-ref`, `unfilled-slot`, `unbound-pin/slot`, `needs-rerecord`, TODO lines (`index.ts:143-155`); `no-procedure` is a warning but blocks | spec admits harmless-stop pins |
| self-test | — | `sitelooper check` runs the spec once (`check.ts`, `runSpecCheck` :450); `build` runs a 3-run readiness gate (`readiness.ts:82-87`); `repair --check-spec`. **The bench's spec arm calls `compile` only** (`bench/spec-replay.mjs:120`), and nothing re-records on a failed check outside bench/converge.mjs | exists, not in the loop |
| parity harness | `test/execution-parity.test.ts`, fixture app judged by its mutation log; `BP_PARITY_TESTS=1`, ~9 min, not in `npm test` | | opt-in only; blind to artifact-only hangs (ad8eeb71) |

---

## 4. Opportunities (ranked by expected impact against the evidence)

The evidence says the lever is T0: make the procedure the spec compiles one that has actually
replayed without the model, or make the stop not happen in either runner. Parity work is the
smallest remaining share.

### 1. Compile only proven procedures, and turn recoveries into procedures (highest impact)
- **Readiness per pin, from evidence the store already has.** Today compile refuses only `demoted`
  (`ir.ts:553`). Add an `unproven-pin` diagnostic for a pinned skill whose replays since its last
  change never finished model-free: `failedAtStep[n] == uses-1` at one step, or `recoveredStops`/
  `harmlessStops` ≥ 1 with `successes` only from the recording. hsdx1 `s_2731b5` (`failedAtStep
  {4:2}`, `harmlessStops 2`) and hsbs2 `s_7db6d8` (`{5:2}`, `harmlessStops 2`) would have been named at
  compile, with the existing `rerecord` fix line, instead of failing as drift. This alone does not
  make specs pass; it makes every T0 failure an honest, actionable refusal (the compile log says
  "a compiled spec would fail at a locator and read as drift" — exactly what happened).
- **Learn from a harmless stop instead of only forgiving it.** A harmless stop is the daemon's proof
  that a recorded GATE is wrong for this app (the recovery changed nothing, `server.ts:2264-2292`).
  Write that back into the skill the way url generalisation already is (`replay.ts:2140`): drop or
  soften the expectation line that stopped (hsdx1: a hide line naming a timestamp `Oct 5 {{*}} PM
  Edited by Admin User`; hsbs2: `textbox "Tag Name"`), so both runners pass next time. Would have
  fixed hsdx1, hsbs2 and the fwod49 class without a re-record.
- **When the recovery DID change something, compile what the recovery did.** The re-pin machinery
  exists but is refused in many logged cases (cross-step guard, "model drove 3-9 gestures beyond its
  replay": fwop15-cv, fwsi14-cv2, fwvk15-cv3), so the spec keeps the old pin while replays keep paying
  turns (hsdx3: 04-open fell back on n2 and n3 with the same start-gate refusal).
  Evidence: T0 covers ~63 of 79 SWEEPS failures and 4-5 of 6 held-out failures.

### 2. Close the loop in the product: compile → check → re-record the named step → recompile
`check` / `build` / `repair --check-spec` exist (`check.ts`, `readiness.ts:82-87`) but the sweep
compiles and stops (`bench/spec-replay.mjs:120`), and the only loop is bench/converge.mjs. Its
experiment converged 4 of 10 fair runs at ≤2 flow runs and ≤46 turns (fwgr74-cv3, fwop17-cv,
fwop15-cv3, fwgt15-cv3). The non-convergences were driver faults later fixed (bd3ceff1: drift lines
must not pick the step; timed-out check ≠ parity; compile the last re-record) or genuinely
non-deterministic steps. Productise it as `build --converge`, with its lessons: name the step from
the failure site only, stop after two refused re-records of one step, and raise the 300s budget cap
with the watchdog. Would address T3 refusals (unsourced-ref converged in fwgr74-cv3, fwod88-cv3 round
2) and T4 demoted pins directly.

### 3. A shared, model-free "already where the procedure was going" continuation
The daemon decides "harmless" only after a model looked. A deterministic analogue both runners can
ask: when a gate stops a mutating step, check the step's goal markers / the next segment's start
gate and identity (already shared: `preconditionVerdict`, `identityMarkerVerdict`, goal-state steps
a7f0c6e9). If the page is provably where the procedure ends, warn and continue; otherwise stop as
now. It raises model-free replays in the daemon too (turns → 0), which is the metric the held-out
protocol scores. Risk: false passes — keep it to gates over volatile-looking lines and require the
next segment's gate to pass strictly. [inf: impact estimated from hsdx1/hsbs2, where the recovery
changed nothing.]

### 4. No silent passes: every effect and every asked value is an assertion
- A spec that passes is only worth what it asserts. Silent misses on record: hsbs1-spec (move into
  chapter: s_ca7686/2,/3 clicks carry only a same-url expectation, no effect), fwgt12 (282c8336),
  fwec10, fwgt13, fwod98, fwod94, fwgt20. Flag at compile any state-changing gesture whose only check
  is "url unchanged" and that is followed by a commit (Save/Move) — require an effect line or a
  post-commit read, or emit the step's recorded outcome as a Playwright assertion. The `assert`
  command (4547d71f, proven live on fwen6/fwen7 incl. a negative run) is the vehicle: generate one
  assert per objective-bearing step at record time.
- Make the artifact fail (or at least exit non-zero in strict mode) on `PARTIAL` (`emit.ts:3706-3721`
  logs it and passes; the daemon fails the step, `server.ts:2234-2250`), and write a typed outputs
  file so report-only objectives stop being UNVERIFIABLE (every compiled row in SWEEPS shows "+2 n/a").

### 5. Replace per-shape compile heuristics for T1/T2 with cross-run evidence
T1 (frozen minted values, ~20) and T2 (abandoned/retried gestures, ~19) recur on every new app
(ERPNext slug: 3121c441 then 21508b5c; abandonedRepeatClick added in r43, reversed in r57), and some
fixes fire once in the corpus (75e3c7e6). n2 and n3 already observe which url positions and texts
vary and which gestures had no effect; site facts (stages 0-4) proved evidence beats shape. Feed the
replays' observed variance and no-effect gestures back into the compiled procedure before the spec
arm compiles (the spec is compiled AFTER n3, so the evidence exists at compile time).

### 6. Finish the shared core and enforce parity continuously (smaller, still worth it)
- Move the emit-string adapters (`emit.ts:182+`: settle, urlEffect, click tiers, pick, readOptional,
  need) into `src/execution` so the artifact and daemon run one adapter, and unify constants: click
  tier 5s vs 10s, action 25s vs 30s, no pacing vs per-step observePage. Gaps of this kind since the
  shared core: fwop14, fwgr70, fwod85, fwod88-cv3 counters, fwop17 runid length, hsbs1/hsml1 [inf].
- Run the parity harness on every change to `src/execution` or `src/spec/emit.ts` (it is opt-in,
  ~9 min, and missed the fwgr70 hang). Add a "spec-only timing" harness case: the fixture app with a
  debounce and an async picker, run both runners, compare the mutation logs.

### 7. Opt-in bounded fallback at run time (last resort)
PLAN-self-updating-spec deliberately keeps the model out of CI. An opt-in "assisted" mode (on a
stop, hand the page to the daemon's recovery with a turn cap, then file a drift ticket for
`repair`) would recover T0 at run time, at the cost of determinism. Rank it last: items 1-3 remove
the need, and the held-out score counts model use as not clean anyway.

### What each item would have prevented (from the catalogue)
| item | prevents |
|---|---|
| 1 | hsdx1, hsbs2, hsdx3 (as refusals or learned relaxations); T0 at large (~63 SWEEPS rows); fwod49 class |
| 2 | T3/T4 refusals that converge in one re-record: fwgr74, fwod88, fwop15, fwgt15, fwop17; hsml2 |
| 3 | hsdx1, hsbs2 (harmless gates) in both runners, raising model-free replays |
| 4 | hsbs1, fwgt12, fwec10, fwgt13, fwod98, fwgt20 caught as failures; report-only objectives verifiable |
| 5 | T1/T2 recurrences on new apps: fwen1/3/4, fwsi2/3, fwgt27, fwec5, fwgh12, fwop13, fwec18 |
| 6 | fwop14, fwgr70, fwod85, fwop17, fwod88-cv3, fwrd75, fwkb27, fwod66, (hsml1, hsbs1 [inf]) |
| 7 | anything left of T0 at run time |

## Appendix: git history in numbers
About 140 commits change compiled-spec behaviour (first emitter 3648dbdb, 2026-09-04). Primary
category: (a) refusals ~42 (demoted ~14, unsourced ~12, unbound ~7, control args 2, no procedure 3,
other ~8); (b) dropped/skipped/effect ~30; (c) locator/frozen value ~30; (d) reads/report ~14;
(e) runner parity ~30, densest 09-04 → 09-18, then mostly "in both runners"; (f) infrastructure ~18:
repair 4d47c456, parity harness 5b96e6f7, shared core 4dae40cd, corpus-check 770a9c10,
converge 26d22062, site facts 2aa5e726…ed236ec1, assert 4547d71f. False passes of the spec fixed:
f0f4a5e7 (record scope missing from emitted satisfied()), 282c8336, 28ea5e89.

## Caveats
- Category and theme counts are my classification of one-line SWEEPS notes; many sweeps have more
  than one cause. Treat counts as ±20%.
- hsbs1's and hsml1's root causes are inferred (no trace for the spec run beyond its log). hsml1's
  mechanism is confirmed by the skill (`s_8c410d` step 4 `expect.urlPattern …?search={{v1}}` on a
  Clear click) and by hsml2-n2 stopping on the same class.
- The git catalogue (~140 commits) was produced by a sub-agent from commit subjects and selected
  bodies; spot-checked here: 28ea5e89, 282c8336, dc58c297, ad8eeb71, 3e0b9bbd.
