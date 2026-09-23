# Round 55: fix contract

Round 54, a ten-app confirmation sweep on main c923af6, was 5/10 green. Every defect below was
diagnosed from published evidence and is logged in bench/SWEEPS.md under "Round 54". The results
are on remote branches `results/<runid>*`; fetch one with
`git fetch origin 'refs/heads/results/<runid>*:refs/remotes/origin/results/<runid>'` and read it
with `git show`. Never check a results branch out.

## Rules for every agent
- Work on your own branch `fix/round55-<group>`, off main at 091d2cf or later.
- Work in your OWN git worktree. Five agents run in parallel, so the main checkout at
  C:\dev\sitelooper is off limits to all of you.
  - If you don't already have a worktree, create one:
    `git worktree add C:/dev/sitelooper/.claude/worktrees/r55-<group> -b fix/round55-<group> origin/main`
  - Then run `npm ci && npm run build` inside it.
  - NEVER create a junction or symlink to the main repo's node_modules. `git worktree remove --force`
    once followed such a link and deleted the main repo's node_modules.
  - Don't remove your worktree.
- The machine is memory-constrained:
  - Run targeted vitest only: `npx vitest run test/<file> --pool=forks --poolOptions.forks.maxForks=2`.
  - Run parity cases one at a time, with `BP_PARITY_TESTS=1` and `-t "<name>"`.
  - Never run the full suite. No Docker, no app containers, no sweeps.
- Fix at the cause, generally, never per app. Provenance decides, never value shape; the
  shape-gate test enforces this.
- Daemon/artifact parity is mandatory. Anything under src/execution is embedded in the compiled
  artifact via spec/runtime-source.ts. If replay behaviour changes, add a parity case to
  test/execution-parity.test.ts.
- Write tests first, built from the recorded evidence where possible, and show they fail before the fix.
- Before committing, run
  `PWD="$(pwd)" APP_PASSWORD=bench-pass-1234 node bench/corpus-check.mjs --compile-only --apps <the apps you touch>`
  and compare with bench/corpus-snapshots/r53-c923af62.json. Report every status change with its reason.
- Match the surrounding style. Comments cite the sweep evidence ("fwsi7: …").
- Commit and push your branch. End commit messages exactly with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Rtih76ggWa1rbxLqp453RM
- Stay inside your group's files as far as you can. src/skills/compile.ts is shared by groups
  ids and landing: keep those edits small and local so the merge is easy.
- Report: the root cause as you confirmed it, the rule you chose, files/functions, tests
  (failing before), parity, corpus movement, sha, and anything you deliberately left.

## Groups

### ids: recorded state the replay cannot reproduce (compile.ts, recorder.ts)
1. **Eval-assigned ids are not locators (fwop10).** n1's model set ids via eval, e.g.
   `inp.id='wp-new-inline-edit--field-combinedDate'` and `ce.id='journal-editor-2'`, then filled
   `#wp-new-…` / `#journal-editor-2`. Compile drops evals, so those ids never exist on replay.
   - A candidate naming an identifier (id, name, data-*) that a recorded eval in the same recording
     assigned is removed from the chain. The attribute/role/label fallbacks lead instead.
   - If no candidate is left, compile refuses with a clear diagnostic.
2. **A re-pin must not keep the step that stopped it (fwsi7).** n3's recovery re-pinned 02-create
   with chain s_9a4939 → s_19095e → s_0aa6d6, where s_0aa6d6 = `goto /hardware/4` with
   `via: {skill: s_5dcb48, step: 1}`. s_5dcb48 had just stopped at step 1, and the artifact died on it.
   - A recovery compile drops the via-step that stopped this very replay.
   - A re-pin whose chain contains a demoted skill's failed step is refused.
   - Relevant code: compileSkills `kept`; server.ts recovery `learnFromInstruction`.
3. **Round 48/49's superseded-fill rule must not drop a fill with consequences (fwod81).**
   n1 #79 filled "2" into the product combobox. Its own diff opened a menu with options; #80
   re-filled "Cabinet". The refill arm in src/skills/toggles.ts dropSupersededSets dropped #79, so
   replay could not reproduce the page.
   - Drop an earlier fill only when its OWN recorded diff shows nothing beyond its field's value
     line: no menu/listbox/option, no "Loading…", no other changed line.
   - Keep the existing "nothing acting between" test.
   - fwgt6's dead password fill must still be dropped, and the fwrd84 test in
     test/superseded-sets.test.ts must still pass.

### landing: record ids reached by navigation (flow.ts, server.ts noteMintedIds, ledger.ts)
4. **A goto to a record never seen before is a landing (fwsi7).** n1 reached the new asset by an
   eval (result unrecorded) + `goto /hardware/4`; fwsi6 clicked the link. Three places exclude
   goto/back from landings: server.ts noteMintedIds (`landed: … e.tool !== 'goto'`), flow.ts
   landedByAction, flow.ts staleInstructionIds.
   - A goto whose record-position part appears nowhere earlier in the run (no earlier url, arg,
     diff line or instruction text) was read off the page, so treat it as landed.
5. **Mint at the first landing, not the first sighting (fwsi7).** flow.ts buildFlow `fresh` uses
   `seenUrl`, which already held "4" from 02-create's endUrl. So 03-edit's landed mint was refused,
   and 04-report's param stayed literal "4".
   - `fresh` should mean no earlier step MINTED the part.
6. **Never store a navigation with no source (fwsi7).** A kept goto whose target carries a value
   minted in the same instruction, with no kept source step (its eval was dropped), must not be a
   literal.
   - Prefer rewriting it as a click on the element the preceding diff shows carrying that href
     (`link "Click here to view"`).
   - Otherwise slot it from the landing, or end the segment before it.
   - The server.ts comment "Bank the ids … BEFORE compiling it" contradicts the code, which banks
     after. Fix the order or the comment, and say which.

### report: what a replay publishes (report.ts, learn.ts publishedOutputs, compile.ts reportTemplate)
7. **Minted ids in report templates (fwec8).** 02-create's final segment s_498742 has
   `record_id: "6ab3eab5991a42617"` as a literal, although chain s_03d7ad carries
   `derived: {d1: {at: "h2", example: "6ab3eab5991a42617"}}`. compile.ts builds reportTemplate with
   textSlots only (~803), so the value is never `{{d1}}`. Export then pruned it, wrongly noting
   that the recording showed no line to read.
   - Substitute url-part and text mints (derived markers) into reportTemplate values and summary,
     filled live on replay.
8. **A slot marker left in reportTemplate must stay a param (fwec8).** s_55d615 has
   `values.record_id: "{{v2}}"`, but keptSlots dropped v2, because v1's whole-URL param swallowed it.
   - Keep the slot with its origin binding, or derive it (deriveContained from v1), or drop it from
     the template.
   - `templateSource`/`publishedOutputs` must count a template value only if every {{vN}} in it is
     a declared or derived param. Compile, export and runtime must agree.
9. **templateLiterals punctuation (round 53; fwec8).** close_date `"Dec 31 ({{v5}})"` looked for
   the literal `"Dec 31 ("`. The page showed "Dec 31", so an observed value was withheld.
   - Compare the letter/digit word runs of each literal, not the joining punctuation.
10. **Non-page data is never a published value (fwsi7, fwod81).** Recovery reports published
    `ref: "s_d5098a"` (a skill id), `ref_3: "ba00005_view.png"` and /tmp screenshot paths.
    - A report value naming a sitelooper artefact (skill id, screenshot file or path) is never
      published or stored in a template.
11. **Orphan labels in summaries (round 53; fwvk7).** After clauses are dropped, "(d); (e); (f) …"
    remains. The summary rule must also drop an enumeration label whose clause was dropped.

### honesty: success means the step did what it was asked (server.ts recovery, flow runner, secrets.ts)
12. **A recovery that admits an unverified clause is not a success (fwop10).** n2's recovery said
    the comment was "NOT confirmed as posted", yet 02-create returned success, and variants
    s_a575e9/s_7b4c9e (a comment procedure with NO submit click) were banked as 1/1 and eligible to
    re-pin.
    - A recovered step whose own report states an unfinished or unverified part, or that leaves
      declared outputs unreported, is recorded as PARTIAL: not success, its variant not banked as a
      success, no repin.
    - Decide how "admits" is detected without keyword matching on the model's prose, if you can.
      The outcome field, the model's own status, or unreported outputs versus the instruction's
      explicit asks are all candidates. Justify the choice.
13. **A step that skipped the reads it was asked for is not a clean success (fwsi7 05-open, fwec8
    03-verify).**
    - 05-open reported success at tier A with its checked-out-user read skipped (no element matched)
      and no read for status or note.
    - fwec8 reported success while `record_id`, which the instruction explicitly asked for, was
      unreported.
    - A tier-A step that leaves an output unreported that its instruction explicitly asks to report
      must not be a clean success: mark it partial, with a warning naming the output, so the flow
      outcome says so.
    - Do NOT make routine echo-drops or optional reads fail steps. Show on the round-54 flowruns
      which steps your rule would flag, and make sure none of the five green apps' steps flip
      (fwrd87, fwgr68, fwgt7, fwvk7, fwgh10).
14. **The credential scrub must not rewrite page text (round 48; fwkb39).** Kanboard's password
    equals its username ("admin"). The recorder's scrub rewrote the post-login heading to
    `- heading "KB Dashboard for {{env:APP_PASSWORD}}"`, making that check a wildcard.
    - An ambiguous value (also held by a non-credential variable) is scrubbed only where it is the
      value of a password field, never in page text or other diff lines.

### runners: daemon and artifact see the same page (src/execution, emit.ts, replay.ts)
15. **Text comparisons use rendered text in every tier (fwop10).** The daemon's wait_for
    text_contains compares innerText, so CSS text-transform gives "OVERVIEW". The artifact's
    waitForLine emits toContainText, which uses textContent ("Overview"), and textHeldElsewhere
    (recover.ts) also uses textContent.
    - Make all tiers use one definition (useInnerText: true, or innerText throughout).
    - Parity case: a fixture element with text-transform: uppercase.
16. **Whitespace in slotted expectation lines (fwkb39).** A read publishes "Backlog " with a trailing
    space. Slotted line `- link "{{v5}}"` becomes `- link "Backlog "`, which a trimmed snapshot name
    never matches.
    - Normalise a param value (collapse and trim) before filling it into a snapshot line
      (expect.ts liveLines/fillParams).
    - Trim edge whitespace from text reads where they are banked (replay.ts read branch, and the
      artifact's equivalent).
    - Parity case.
17. **A read scoped to the wrong record publishes the wrong value (fwrd87).** 04-add adds Part B, but
    skill s_9e190d (recorded adding Part A) has reads at steps 7 and 12 with no locator scoped by
    `{{v4}}`. Their primary `… tbody > tr > td:nth-of-type(1)` becomes ambiguous with two rows and
    falls back to `[data-testid="part-row-p18"]` (Part A's recorded row id). Step 18's read frame
    hard-codes "{{=}} RD Part A". So n2/n3 publish Part A's name beside Part B's cost.
    - When a read's recorded value contains a slot's value, its locators and frame must be scoped
      by that slot.
    - A read whose only surviving locator is scoped to a DIFFERENT record than the slot says must
      not publish a confident value.
    - Decide by provenance: the recorded value and the slot's example.
