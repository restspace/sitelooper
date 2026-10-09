# Contract: compile reliability, group 1 (2026-10-09)

Source: the 2026-10-09 survey of compiled-spec failures and refusals on main bfeabd26 (memory note
compile-reliability-survey). Base for all work: branch `fix/compile-g1` (main bfeabd26 + this note).
Read published evidence with `git show origin/results/<id>:bench/results-published/<file>`; fetch with
`git fetch origin 'refs/heads/results/*:refs/remotes/origin/results/*'`. Never check out a results
branch, never push main, never `git stash`.

## Item 1 — gate refusals count, and a goto never carries n1's record id (agent A)
Evidence (held-out, bench/heldout2): hakm1, hbkm3 (kimai), hbgc2, hbgc3 (grocy). In each, n2 and n3
both fell back at the same chain segment ("… does not show …, structure not the recorded page's …
nothing was run", identity `{{v1}} is not confirmed`), 8-47 model turns, and the compiled spec failed
there. The segment's stats still read `uses:1, successes:1, failedAtStep:{}`
(s_e93247, s_92ddfe, s_d57f06, s_95b77d), so `unproven-pin` never fired.
Causes:
- (a) the gate sets `res.refused` (src/skills/replay.ts ~815-869) and src/skills/learn.ts:140 skips
  `recordOutcome` for a refused invocation, so neither a strike nor `stopStreak` is banked.
- (b) the step before the refused segment is a goto to n1's own record: kimai
  `/timesheet/1/edit`, `/timesheet/10/edit`; grocy `/product/95708`, `/product/298407` — still literal
  after rebuilding the n1 recordings on main (bench/rebuild-flow.mjs). Guards that miss it:
  `sourcelessGoto` (src/skills/compile.ts ~2151) only fires on parts `unseenGotoParts`
  (src/skills/ledger.ts ~216-245) calls unseen, and `shownIn` matches whole tokens, so "1" counts as
  shown via `127.0.0.1`, and 298407 via a `read url` of the record's own page; `discoverMinted`
  (compile.ts ~2035) skips navigation; `linkClick` (compile.ts ~2315-2332) wants a role-with-name
  candidate and rejects hbgc's `scoped {container:'#products-table tr.even', hasText:'<v1>', selector:'td… > a'}`.
  In hakm1 a later segment of the same chain is already slotted (`/timesheet/{{d1}}/edit`); in hbgc3
  s_58e0bb has `/product/{{d1}}` — the minted value IS known to the session.
Required:
- (a) A gate refusal of a chain segment the walk actually reached (not head/candidate selection among
  siblings, not `pastStart`, not a harness error) is banked against that segment as a stop at step 1
  (failedAt 1, stopStreak+1), so two such replays make compile refuse it (`unproven-pin` /
  demoted) and `build --converge` re-records it. Find where the refusal is reported for chain
  segments (src/daemon/server.ts chain walk ~3080-3250, learn.ts) and bank it there. Must not change
  what a replay does at run time.
- (b) A goto's record-position path part (an id the app minted — the same notion app-minted-url.ts and
  the `{{dN}}` / mints machinery already use) is sourced only by a slot, a `{{dN}}`, a read-mint or a
  known value with provenance; "the text appeared somewhere in the session" is not a source. At
  minimum `shownIn` must not count a numeric token found inside a dotted/colon run (an IP, a
  version, a clock) — the guards `substitute()` already applies (compile.ts ~3160). When the
  session minted the value earlier (any instruction), slot it as the later segment already is.
  When nothing sources it, the existing sourceless-goto handling applies (link click / refusal).
- (c) `linkClick` may accept a `scoped` candidate whose `hasText` carries a slot as the identity of
  the clicked record.
- Evidence over shape (notes/PLAN-evidence-over-shape.md): no decisions on how a value looks.
- Tests: fixtures trimmed from the held-out n1 recordings (hakm1 and hbgc3 at least) proving the goto
  is slotted or replaced; a negative (a goto to a seeded record named in the instruction stays
  literal); a learn/server unit test that a reached-segment gate refusal is banked and a sibling
  candidate refusal is not.

## Item 2 — a synthesized text primary that matches more than once (agent B)
Evidence (~20 runs): fwen9-luna s_1c570b steps 3 and 16 (reads `item_1`, scopedBy v4): primary
`text "{{v4}}"` ("Bench Widget") is ambiguous on n2, n3, the spec and all 3 readiness runs; a positional
css wins (readiness warnings). Same class: fwen5/7, fwec16, fwec20 (blocked readiness), fwgh11/12/13/20,
fwod100/101/105, fwrd95, fwvk16, hagc1/2/3 (hagc1-cv blocked: fell to a point), hakm1-cv, hbgc3,
hsbs1/3.
Causes:
- src/skills/readscope.ts ~66-68 unshifts `{kind:'text', text:'{{vN}}'}` whenever the read's value equals
  the slot's example, with no uniqueness evidence. In fwen9 item_1 belongs to a `read_all` that
  returned ["Bench Widget","Bench Gadget"], and an earlier read showed "Bench Widget" several times.
- src/skills/replay.ts ~1274-1283 banks candidate evidence only when a non-structural candidate wins,
  so an ambiguous primary above a positional winner is never retired (`retired()` in repair.ts).
Required:
- Do not lead the chain with the synthesized text candidate when the recording gives evidence the value
  shows more than once on that page (the read's own result or page lines/reads of that page with the
  value more than once, or the read is one element of a list read). Then place it AFTER the recorded
  css/identity candidates (keep it as a candidate) or scope it inside the recorded container. Keep
  today's behaviour when the value is shown once.
- When a structural candidate wins, still bank a miss for a NAMED candidate above it that missed as
  AMBIGUOUS (not absent) — used only to retire that candidate; never bank a hit for the structural
  winner (the fwrd26l rule stays). Check the shared resolver reports why a candidate missed
  (src/execution/resolve.ts).
- Both runners must agree (the artifact embeds src/execution; `retired` candidates are already emitted).
- Tests from the fwen9 evidence (s_1c570b, the n1 read_all), a negative where the value shows once.

## Item 5 — slot substitution must not rewrite a candidate's structure (lead)
Evidence: hakm3-cv s_06578c step 13 `{"kind":"{{v3}}","text":"onsite","nth":0}` (v3 example "text")
→ emitted `undefined.nth(0)`, deterministic TypeError; the same marker in hbkm3-cv and fwgr53 stores.
Cause: compile.ts ~1106 `substituteDeep` over the whole candidate. Fix: substitute value fields only;
a stored candidate with an unknown kind is never emitted or resolved as a locator.

## Rules for every agent
- Work only in your own worktree/branch, created from `origin/fix/compile-g1`; commit there; push
  `fix/compile-g1-<a|b>`; do not merge. Own `npm ci` in the worktree; no junctions to the main
  checkout's node_modules (memory: worktree junction hazard).
- Comments and naming like the surrounding code (evidence-cited, run ids).
- Run targeted tests for what you touch plus `npx tsc --noEmit`. Full suites: bounded forks
  (`npx vitest run --pool forks --poolOptions.forks.maxForks 2`), never kill browsers by name.
- Measure: `node bench/rebuild-survey.mjs` (recompiles every published n1 recording offline) at
  fix/compile-g1 vs your branch (`--code <dir>`, `--compare a b`) and `node bench/corpus-check.mjs
  --no-fetch --jobs 2` vs the base. Report every changed store with why. A change that turns a
  working compiled chain POINT-ONLY, or widens far beyond the evidence (the first fix 5a touched 1,886
  candidates), must be narrowed before reporting. If the survey does not show what you changed
  (e.g. goto args), extend bench/rebuild-survey.mjs output in your branch.
- No Docker, no app containers, no model calls. OPENROUTER_API_KEY must never be printed or written.
- Report: commit sha, files touched, tests run with counts, survey/corpus diff, open questions.
