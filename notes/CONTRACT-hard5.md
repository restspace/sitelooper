# Contract: hard-5 sweep fixes (2026-10-08)

Source: the five-app status sweep on main f535c191 (results/fwgt35-luna, fwop35-luna, fwod105-luna,
fwec20-luna, fwen8-luna; prompts on bench/hard5). Base for all work: branch `fix/hard5` (c127200f =
main + fix 1). Read published evidence with `git show origin/results/<id>:bench/results-published/<file>`.
Never check out a results branch, never push main, never `git stash`.

## Fix 1 — DONE (c127200f)
`messageAnchor()` in src/spec/check.ts: an error's own leading site (`05-add s_f44792:`) beats the
stack anchor, in runSpecCheck and in converge.ts `failingStep`.

## Fix 2 — app-minted url positions across instructions (agent A)
Evidence: fwen8-luna. n1 04-create did `goto /app/sales-order/new`, ERPNext landed on
`/app/sales-order/new-sales-order-uxvwbpigvk`, the Save failed (no items). 05-add then added rows on that
same unsaved form and saved. 04-create's skill (s_538e35) correctly got `/app/sales-order/:var`;
05-add's skill (s_f44792) kept `preconditions.urlPattern` and step `expect.urlPattern` =
`…/new-sales-order-uxvwbpigvk`, so n2, n3 and the compiled spec all refused at 05-add's start gate.
Cause: `appMintedPositions(startUrl, steps, known)` (src/skills/app-minted-url.ts, called at
src/skills/compile.ts ~907) only sees the instruction being compiled.
Required:
- Positions the app minted in an EARLIER instruction of the same recording session are applied when
  compiling a later instruction: every url pattern of the procedure (start precondition, step
  expectations, chain seams) carrying that minted value at that route+position becomes `:var`.
- Same evidence rule (see the file's header): only values the app put there unasked. Widen the
  window, not the rule. A value later renamed by a save (SAL-ORD-…) keeps its identity, as now.
- Find how compile gets its steps (live recorder at record time, flow export / re-pin / rebuild
  paths too) and feed the session's earlier recorded steps everywhere the skill is compiled, so a
  rebuild of a published recording gives the same answer as record time.
- Tests: a fixture from fwen8-luna-n1-script.jsonl (trim to what is needed) proving 05-add's
  start pattern becomes `:var`; a negative (a value the procedure typed or the page showed first
  stays literal).

## Fix 5(a) — CSS candidates that carry a run's record id (agent B)
Evidence: fwgt35-luna-cv-skills s_6733ad steps 6-7 (read-backs of the label links):
locators `[css "#issuecomment-11 > span:nth-of-type(2) > span > a:nth-of-type(1)", point]`;
s_2b3ae7/5 css `#issue-4 > div > div:nth-of-type(2) > div:nth-of-type(1) > p`. On a later run the
ids differ, so the primary misses and the spec falls back to the point locator (5 drift lines in the
converged spec; readiness refused). Also fwec20 converged spec has 1 drift line — check it.
Required:
- When compile writes a CSS candidate whose `#id` (or id attribute) contains a value that is the run's
  own minted value with evidence (e.g. the issue number the run created and showed), slot it
  (`#issue-{{dN}}`) through the existing slot machinery.
- An id fragment that the recording never showed anywhere (no page line, read, url, typed text —
  e.g. `issuecomment-11`, an internal DB id) is not evidence of anything: drop the id-anchored step of
  the selector and anchor on the nearest stable ancestor, or drop the candidate if nothing stable is
  left. Evidence over shape (notes/PLAN-evidence-over-shape.md): do not decide on how a value looks.
- Find where css candidates are generated for read-backs and actions (src/spec/locators.ts,
  src/skills/compile.ts, recorder) and fix at the earliest correct point.
- Tests from the gitea evidence.

## Fix 5(b) — readiness and convergence agree on "clean" (agent C)
Evidence: fwgt35-luna-cv-build.json: converge status `converged` ("round 2: the compiled spec passed"),
then readiness run 1 not clean ("5 locator fallback events", all on read-backs), `build` exit 4.
src/spec/readiness.ts:205 blocks on any driftCount.
Required (user decision: report-only read fallbacks are WARNINGS):
- Classify each `[sitelooper drift]` event by the step it names (`<step> s_xxxxxx/<n>`) using the
  compiled flow's metadata: a fallback on a gesture (click/fill/type/select/press…) blocks; a
  fallback on a read whose label is consumed later (a `{{<step>.<label>}}` reference in a later step,
  or an assert) blocks; a fallback on a read that only feeds the final report is a warning, listed in
  the readiness report (new field, e.g. `warnings`). Unclassifiable drift blocks (fail closed).
- Convergence uses the same classification: a passing check with blocking drift is not converged —
  the round names the drifting step (failingStep equivalent) and re-records it within the round
  budget; if the budget runs out, the status/why says "spec passes but N blocking locator fallbacks
  at <step>". `build` must never print `converged` and then exit 4 for the same reason.
- Share one classifier between readiness.ts and converge.ts.
- Tests: unit tests for the classifier and for readiness/converge using the fwgt35 drift lines.

## Rules for every agent
- Work only in your own worktree/branch; commit there; push `fix/hard5-<a|b|c>`; do not merge.
- Comments and naming like the surrounding code (evidence-cited, fwXX run ids).
- Run targeted tests for what you touch plus `npx tsc --noEmit`. Full suites: bounded forks
  (`npx vitest run --pool forks --poolOptions.forks.maxForks 2`), never kill browsers by name.
- Agents A and B: corpus-check against fix/hard5 c127200f (`node bench/corpus-check.mjs --at <sha>`)
  and report every store whose status or lints change, with why.
- No Docker, no app containers, no model calls. OPENROUTER_API_KEY must never be printed or written.
- Report: commit sha, files touched, tests run with counts, corpus diff, open questions.
