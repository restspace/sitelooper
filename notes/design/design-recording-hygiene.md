# Recording hygiene: eval and report-time sourcing (design, no code)

Base: origin/fix/round60 (cb5caf27). Evidence: every `*-n1-script.jsonl` under
`bench/results-published/` and `bench/fixtures/recordings/` on all 777 `origin/results/*` branches,
deduplicated by file name: **146 n1 recordings**. The "recent era" is the 101 of them that are
rounds 36-60 in bench/SWEEPS.md (plus fwgt11/fwgh14/fwkb43/fwec12/fwop14/fwsi11/fwgr72/fwod85/fwrd91).
The analysis scripts are in the scratchpad (`evalscan2.mjs`, `holdsim.mjs`, `emptyread.mjs`,
`gotoctx.mjs`, `guardsim.mjs`). Stage 0 turns them into a bench script.

A caveat that applies to every number below: **the recorder does not store what an eval returned**.
`ScriptRecorder.commit` (recorder.ts:722) attaches `result` only for `RESULT_TOOLS = {read, read_all}`.
So "what the eval was for" is judged from the expression text, and "a value came from an eval"
can only be inferred. Stage 0 fixes that for future recordings.

---

## 0. What the code does today

| Where | What |
|---|---|
| `src/agent/tools.ts` `TOOL_DEFS` (l.267) | `eval`: "Escape hatch: run a JavaScript expression… Prefer the dedicated tools." Offered in every session, recording or not. |
| `tools.ts` `executeTool` → `dispatch` case `'eval'` (l.1452) | Refuses when `evalMutation(expression)` matches, else `page.evaluate((0, eval)(expr))`. |
| `tools.ts` `evalMutation` (l.1564, since 80a07acd, 2026-09-02) | Regexes: `.click/.submit/.requestSubmit(`, `dispatchEvent`, `.value/.checked/.selectedIndex =`, `.innerHTML/.outerHTML/.textContent/.innerText =`, `location.href/hash =`, `location.assign/replace/reload(`, `history.*(`, DOM `remove/append/insert/replace*(`, `set/removeAttribute(`, storage writes. **Not covered: `.id =`, `.name =`, `dataset.x =`, `classList.*`, `window.open(`, bare `location =`, `.style.x =`, `fetch(`.** |
| `src/agent/prompt.ts` `OPERATING_RULES` | Rule 7 "eval is a last resort"; rule 8z "drive the interface, never go around it" (no API calls). Nothing says eval is not recorded. |
| `src/daemon/recorder.ts` `RECORDABLE` (l.394) | eval IS recorded (expression only, no result). |
| `src/skills/compile.ts` l.686 | Every eval dropped from the procedure (`step.tool === 'eval'`), after three recording-level passes that exist only because of evals: `creditUncreditedPopups` (l.395, fwgh8: stops at an eval, drops steps on a page only an eval opened), `evalAssignedIdentifiers`/`dropEvalAssignedCandidates` (l.456, fwop10: strips eval-assigned ids from locator chains), `sourcelessGoto` (l.1682, fwsi7: a goto to a never-shown record becomes a click on `linkedFrom` or ends the procedure). |
| `src/daemon/codegen.ts` l.95 | Raw script export still emits `page.evaluate(expr)`; the skill compile drops it. |
| `src/agent/loop.ts` `holds` (l.401) | Two report holds, `contradiction` and `naming`: each at most once per instruction, never on the last turn, sync `check(report)`, and the retry is accepted whatever it says. |
| `loop.ts` `finish` (l.505-790) | AFTER the report is accepted: `positionDatumKeys`, `flattenComposedValues`, `promoteLabelledReads`, `backfillReadValues`, `publishProseIdentifiers`, then per value `captureReadBack` → `titleReadBack` → `selectionReadBack` → `savedSelectionReadBack` → `flattenProvenComposite` → `flattenContainedComposite` (r56) → `shownReadBack` (r59) → `coreReadBack` (r57) → `sourceReadBacks` (code, then Jev, then a model call `sourceStragglers`). By then the model has gone: anything unsourced is published as a template literal and withheld on replay (round 53 `unobservedGiven`/`withheldAsGiven`, round 60), then flagged by `unansweredForStep`/`literalOnlyAsks` (step-verdict.ts) as a warning. |
| `src/shared/secrets.ts` + `tools.ts` `markCredentialArgs` (l.698) | Fix AH (r48): a credential env var's value typed in the clear becomes `{{env:NAME}}` before the recorder sees it. |
| `src/cli.ts` l.519 | `do --stdin` / `--instruction-file` already exist (no shell quoting). |

---

## 1. How often eval appears, and what for

**All 146 recordings:** 2,579 evals in 17,007 recorded steps (15.2%); 461 of 911 instructions (51%) have one.
**Recent era (101 recordings):** 1,646 of 11,525 steps (14.3%); 322 of 575 instructions (56%).

Per app, recent era (evals / steps): op 28.6%, si 24.3%, gt 20.9%, ec 18.5%, gr 15.4%, kb 14.3%,
gh 10.1%, vk 8.3%, od 6.9%, **rd 0.2%** (3 evals in 11 recordings). RepairDesk, the bench app with test
ids and plain forms, almost never needs one. So eval use tracks how badly snapshot/read describe the
app's DOM (custom elements, hidden inputs, stacked modals, contenteditable, canvas-like editors), not
the model's habits.

Categories in the recent era. A heuristic classifier takes the first match, so treat the boundaries as ±10%:

| Category | Evals | Recordings | Typical expression |
|---|---:|---:|---|
| Probe structure: classes, ids, attributes, outerHTML, visibility, rects, to build a selector | 1,051 (64%) | 83 | `document.querySelector('[data-name="account"]').outerHTML.slice(0,900)` |
| Read a list of texts/values | 292 (18%) | 75 | `Array.from(document.querySelectorAll('a[href*="/issues/"]')).filter(…).map(…)` (fwgt10) |
| Read one value | 124 (8%) | 48 | `document.querySelector('.field[data-name="closeDate"] input').value` |
| Dump page text | 112 (7%) | 50 | `document.body.innerText.includes('2026')` |
| Network (fetch an API record, a JS bundle, a public URL) | 12 (+7 fetch monkeypatches) | 5 (+3) | fwec12 `fetch('/api/v1/Opportunity/…')`, fwgt8/9 read the Gitea JS bundle to debug the label picker, fwgh11 status of the public post |
| App internals (Espo view registry, monaco models, jQuery data, `window.__log`) | 22 | 8 | fwec3 walking `window.Espo` |
| Scroll a container | 10 | 7 | Grafana/monaco `scrollTop = scrollHeight` |
| Clock/timezone | 7 | 7 | `new Date().toString()` (Ghost publish time) |
| document.title | 2 | 2 | |
| **Mutating, not caught by `evalMutation`** | **14** | **6** | identity: fwop10 ×3 (`ce.id='journal-editor-2'`), fwod82 ×3 (`b.id='edit_discard_btn'`); `window.open` fwgh8 ×1; fetch monkeypatch fwgt8/9/11 ×7 |
| Mutating kinds the current guard covers | 0 | 0 | Before the guard (≤ 2026-09-02): 71 click/event evals in 17 recordings (fwgr13-19, fwod19-30, fwkb1), and fwod20/fwod23 `location.href =` |

So **the existing guard works**. Everything in the recent era that it lets through is identity
assignment, window.open, and page instrumentation.

What the evals led to (the part that matters):
- **Eval as fallback for an empty read.** 237 of 1,707 real reads (14%) returned `[]`/`""`/`0`. In 60
  cases (25%) the next step is an eval, and 136 evals (8%) directly follow an empty read. The model
  guessed a class name (`.issue-title`, `.stream-post .post-text`, `h3.gh-content-entry-title`), got a
  bare `[]` with no hint, and switched to eval. fwgt10 is exactly this.
- **Eval-sourced addresses.** A goto to a record address (path digit run / `id=`) is not in the
  instruction, and nothing earlier in the recording shows its record part except (presumably) an eval
  in the 3 steps before it: **8 gotos in 8 of 101 recordings**. They are fwkb41, fwkb42, fwop13, fwsi1,
  fwsi2, fwsi5, fwsi7 and fwsi9. Recorded failures among them: fwsi2 (compiled checked out stale asset 4),
  fwsi7 (45/50 turns, FAIL 1/7), and fwkb41's `task_id=4` (fixed r57).
- **Eval-sourced reported values.** Of 935 success-report values the instruction asked for
  (`askedOutputs`), 164 are contained in no recorded read, read-back, diff line or the instruction.
  They sit in 109 of 541 success instructions, 79 of those with an eval. Most are the model's
  annotations around a page value ("Ready to Deploy (badge: Deployed)", "Dec 31 (year not displayed)").
  Some are values only an eval or an API call produced: fwec12 `account_id=6ab55a52…` from `fetch`,
  fwgt10 `open_issue_titles`, fwop7 `seed_1=… — id 38 — status New`.

## 2. Each category: the replayable alternative, and whether a tool already offers it

| Category | Replayable alternative | Offered? |
|---|---|---|
| Probe structure | None needed: it is orientation, compile drops it, and no later step depends on the eval (a selector built from a real attribute is replayable). An `inspect` tool (attributes + suggested locator) would save turns, not replays. | Partly: snapshot (a11y only), `fetch_source contains` (server HTML, not live). No attribute view. Not a hygiene problem, so not proposed here. |
| Read list / read one / page text, value **not** reported | Nothing to replay. | n/a |
| Read, value **reported** | `read`/`read_all` with `label`, or `read_all` by role/text (`role=link[name=/^Seed:/]`, `a:has-text("Seed:")`). | **Yes.** The gap is that an empty `read_all` returns a bare `[]` and says nothing (tools.ts `read_all` case). |
| Read an address, then `goto` | `click` the link that carries it. | **Yes**, and the recorder already finds it: `ScriptRecorder.prepare` sets `linkedFrom` when exactly one visible link has that href (recorder.ts:682). Compile's `sourcelessGoto` uses it after the fact. |
| Assign an id / name / class, then act by it | The selector the eval used to find the element (`#work-package-journal-form-element [contenteditable="true"]`), a scoped chain (`.modal:has-text("Cancel Sales Order") >> role=button[name="Send and cancel"]`), or an `@ref`. | **Yes**: every target accepts CSS/role/text/`>>`. The model had the selector in its own expression in all 6 cases. |
| `window.open(url)` | `click` the link that opens the tab (the popup is credited to it), or `goto` in this tab then `back`. | **Yes.** |
| Scroll a container | `scroll_into_view` on the target, or nothing (actions auto-scroll). | **Yes**. Harmless anyway: no replay depends on it. |
| Network (API read) | The UI (rule 8z). `fetch_source` for a GET the task really needs. | **Yes** (`fetch_source`). |
| Network for debugging (bundle source, fetch monkeypatch) | None. It is investigation. | No, and none is needed. |
| Clock | None needed. The value feeds the model's reasoning about relative times (Ghost). | n/a |

## 3. Policy per category, and what the model sees

Principle: **block only what changes state a replay will not reproduce; everything read-only stays
allowed.** Only the *uses* of read-only results get policed: a reported value, or a goto address.
Blocking or converting read-only evals wholesale is rejected. 64% are probes, and the model reaches
for them exactly when the tools failed it (fwgt10, fwod82's stacked modals, fwop10's
contenteditable, fwgt9's picker debugging, which was a GREEN round-57 recording). Converting an
eval into a `read_all` is also rejected. The expressions filter, map and regex (fwgt10 filters hrefs
by `/\/issues\/\d+$/`), so the same CSS would publish different values. The finish cascade already
converts at the right grain, the value, through captureReadBack.

| Category | Policy | Model sees |
|---|---|---|
| Identity assignment (`.id/.name/.className =`, `.dataset.x =`, `classList.add/remove/toggle/replace(`) | **Block** (extend `evalMutation`) | `eval is read-only: the expression assigns .id. An id you give an element exists only in this browser: a replay never runs this eval, so a step that targets it can never find it. Target the element the way this expression found it — e.g. \`#work-package-journal-form-element [contenteditable="true"]\` — or scope a role target (\`.modal:has-text("…") >> role=button[name="…"]\`), or use a snapshot @ref.` The quoted selector is the last string literal passed to `querySelector`/`getElementById`/`closest` in the expression (only when it exists). |
| `window.open(`, bare `location =` / `document.location =` | **Block** | `eval is read-only: the expression opens a page (window.open). A replay never runs this eval, so it can never open that tab. Click the link or button that opens it, or goto the url in this tab (tabs lists and switches pages).` |
| `.style.x =`, `.style.setProperty(`, `.hidden =`, `.disabled =` | **Block** (0 hits so far, but it is the same hazard: the replay's element stays hidden or disabled) | `…the expression changes .style. A replay acts on the page as the app renders it; act only on what a user could reach.` |
| Everything the current guard blocks | Unchanged | Unchanged |
| Network `fetch(`/XHR | **Allow**, no block. On record: the eval result is marked "not a source" (Stage 0 field), and a value it produced is caught by the report hold (below). | A one-line note appended to the result: `(eval results are never replayed; a value you report must be read from the page — see rule 8z)` |
| Read-only evals (probe/read/page text/clock/scroll/app internals) | **Allow.** Append the same one-line note, only to the first eval result of each instruction. It costs about 30 tokens, no turns. | Same note. |
| An eval-read address used by `goto` (recording only) | **Convert, else refuse once**. See §3a. | See §3a. |
| An eval-read value put in a report | **Report-time hold** (§4) | See §4. |
| Empty `read`/`read_all` (the trigger for 8% of evals) | **Hint**, no block | `[] — 0 elements match ".issue-title". Class names are guesses; do not probe with eval. Take a snapshot (full:true for static text) and target what it shows, or target by role/text: role=link[name=/^Seed:/], a:has-text("Seed:").` Only in the model-facing string. The recorded `result` stays `[]`, because compile and `readResultsThisInstruction` parse it. |

Tool text (`TOOL_DEFS` eval description, and rule 7 of `OPERATING_RULES`) gains one sentence:
"Nothing an eval does or returns is recorded or replayed: never act through it, never give elements
ids, and never report or navigate by a value only an eval returned. Read it with read/read_all, or
click its link." OPERATING_RULES is shared by recording and plain `do` sessions. The sentence is true
in both, and it keeps the prompt prefix byte-stable.

Where the check lives: `evalMutation` is mode-agnostic today, and the new rules stay that way. They
describe edits that make a session's own later steps unreproducible, whether or not it is recording.
The goto rule and the hold need the recorder, so they fire only when `session.script` is set.

### 3a. The eval-sourced goto (recording only)

In `executeTool` for `goto`, after `recorder.prepare` has computed `linkedFrom`:
- Condition: the url has a record part (`ledger.ts` `pathDigitPart`/`idPositionPart`); the part is
  `unseenGotoParts(url, entries-before)`; and it occurs in an eval result of this instruction (Stage 0 keeps them).
- If `linkedFrom` resolved (exactly one visible link carries that href, and its `target` is not
  `_blank`), **click that link instead**. The recorded step is a click with the link's chain. The
  model is told: `goto converted: /hardware/4 is the href of link "Click here to view" on this page;
  clicked it instead, so a replay opens its own record.` The browser arrives at the same url.
- Otherwise **refuse once** per url per instruction: `goto refused: /hardware/4 came from an eval and
  nothing this recording showed produces it, so a replay would open this run's record, not its own.
  Reach it through the UI (the row or link that shows it), or goto a url the instruction gives. Send
  the same goto again to proceed anyway.` A repeat is allowed and recorded as today. Compile's
  `sourcelessGoto` then ends the procedure before it, which is the r55 behaviour.

This is small in value: compile's `sourcelessGoto` already converts the `linkedFrom` case after the
fact. It adds the "no link" case, where the model can still find the UI route and compile cannot.
It is Stage 3, and optional.

## 4. Report-time sourcing validation

**Where:** a third `ReportHold`, `sourcing`, after `contradiction` and `naming` in loop.ts `holds`.
`ReportHold.check` becomes async (`firstHold` awaits); the only call site is l.1154.

**What it checks.** It runs the finish cascade's **deterministic** tiers as a dry run. Nothing is
filed, and neither Jev nor the model is called. The tiers: `positionDatumKeys`, `flattenComposedValues`,
`promoteLabelledReads`, `backfillReadValues` (in memory only), then per value `captureReadBack`,
`titleReadBack`, `selectionReadBack`, `savedSelectionReadBack`, `flattenProvenComposite`,
`flattenContainedComposite`, `shownReadBack`, `coreReadBack` and `sightValues`. A value is
**unsourced** only when every tier fails AND the sweep proves it `absent` (complete sweep, zero
candidates). Ambiguous values (several candidates) are not held. They go on to Jev/model locate in
`finish` as today; that is v2 if round data shows asked values lost to ambiguity (fwod82 04-change was that).

**When it fires**, all of these at once:
1. `report.status === 'success'`, the hold has not been asked in this instruction, `turn < maxTurns`,
   at least 20 s to the deadline, and `naming` did not fire in this instruction (at most one extra
   turn in total; if both apply, the naming message gets one sourcing sentence added).
2. The key is asked: `askedOutputs(instruction, keys)` (step-verdict.ts, the same word match behind
   `unanswered`), so the record-time ask and the replay-time warning agree.
3. The value is data-shaped: 1-80 folded chars, not a verdict (`yes/no/true/false/none/n/a/not set/0`),
   not an artefact (`artefactKeys`).
4. The value is unsourced as above, and it is not in a recorded dialog/alert text of this instruction
   (the model saw it; an alert that has since gone cannot be re-read, and holding for it only burns a
   turn: fwrd81-88's `precondition_required`).
5. **Pre-pass first (deterministic, no hold):** when the value is `head + commentary` (a trailing
   `( … )`, ` — …` or `; …`) and `head` is sourced, the published value becomes `head` and the
   commentary moves into the summary. In the simulation this alone takes asked-unsourced values
   from 164 to 100. Examples: "Ready to Deploy (badge: Deployed)", "Dec 31 (year not displayed)",
   "BA Bench Assignee (Bench Assignee)". It runs after `flattenContainedComposite`, which keeps
   data-bearing parentheses such as "Seed: triage inbox (#1)" as parts.

**What the model sees:**
```
report held — these values are not shown by any element on the current page, nor anywhere this
instruction read or displayed them, so a replay could never read them again:
  open_issue_titles = "#1 Seed: triage inbox, #2 …"  (it matches what your eval returned; evals are never replayed)
For each one: if the page shows it, read it where it is shown — read or read_all with label=<key>,
navigating back if you must, but do not click or fill anything that changes data — and report
exactly the text the page shows. If it is your own conclusion or paraphrase, keep it and say so in
the summary. Then call report again.
```
The retry is accepted whatever it says (the holds contract), so this **never refuses** a report. The
false-refusal risk becomes a wasted-turn risk plus a behaviour risk (below).

**Cost.** No hold: the dry run is the same captureReadBack/sweep work `finish` already does, tens to a
few hundred ms, and its results are **cached** keyed by (key, value, page url, the number of steps
recorded). `finish` reuses them when the accepted report and the page are unchanged, so the net cost
is ~0. With a hold: one model turn, plus the read(s) it triggers. Simulated firing rate (upper bound,
see §6): **69 of 541 success instructions (12.8%)**, 50 of them with an eval. Rounds 56/59/60 tiers
the old scripts lack, and captureReadBack on the live page, will source part of the remainder. Expect
5-10% of instructions.

**Interaction with the existing capture and honesty rules.**
- `captureReadBack`/`coreReadBack`/`shownReadBack` are unchanged and remain the only way a value
  becomes a read-back. The hold only makes a value they can source more likely: it gets the model to
  add a real labelled `read`, which `promoteLabelledReads` publishes and compile keeps (`readLabel`).
- **Round 53** (a template literal not shown on this run's page is withheld) and **round 60**
  (`unobservedGiven`/`withheldAsGiven`, a params-only value published only where observed): these
  decide what a *replay* may publish. The hold reduces how many literal-only values reach them, and
  never relaxes them.
- **Round 56/59** `unanswered` / `literalOnlyAsks`: the hold is their record-time twin (same
  `askedOutputs`). A hold that the model answers with the same literal still ends as a
  `literalOnlyAsks` export warning, so the honesty signal is kept.
- **Round 55 PARTIAL rule** (a recovery whose last gesture failed): unaffected, because the hold forbids data-changing gestures in its text.
  `lastGesture` would still flag a gesture that fails.
- **Rule 12 / honesty.** The message explicitly allows "keep it and say it is a conclusion", so the
  model is not pushed to invent a source. It must not say "the value is wrong".

**False-hold risks, honestly:**
- Values the page shows in a form `captureReadBack` cannot pin (split across elements, CSS
  text-transform "TASK" vs "Task", hidden duplicates as in fwkb41 columns): the model re-reads with
  `read_all`, which IS a replayable source. That is a gain, not a loss.
- Values that are correct derivations (a count the model computed, a date it normalised from
  "01 Sep 2026" to "2026-09-01"): one wasted turn. The model keeps the value and the report is accepted.
- The model navigates back to re-read and then reports from a different page. Harmless: the value is
  now a real read wherever it happened.
- The model reacts by re-doing work (clicks Save again). This is the real risk, and the message
  forbids it. Measure it in the sweep: any state-changing gesture after a `sourcing` hold.

## 5. Which past failures each measure would have prevented

Several of these already have after-the-fact compile/runtime fixes. For those cases a record-time
measure is a second line of defence, not a new fix.

| Measure | Would have prevented | Already mitigated by | Could have turned a success into a failure |
|---|---|---|---|
| M1 extend `evalMutation` (identity, open, location=, style) | **fwop10** n1's fills by eval ids (likely: the selector was in the model's own expression). **fwgh8** `window.open`, so the popup is not miscredited to Publish and the steps are no longer dropped (likely: the model clicks "View post" or goes to the url). | r55 `dropEvalAssignedCandidates`, r45 `creditUncreditedPopups` | fwod82 n1 (verified 6/6) used ids to escape stacked Odoo modals; blocked, it must find `.modal:has-text() >> role=button`. It might not. That is 2 recordings in 101 with any exposure. |
| M2 empty-read hint | Some of the 60 empty-read→eval transitions, **fwgt10**'s among them (the next read_all could target `role=link[name=/^Seed:/]`). Unproven: it is a nudge. | r59 `shownReadBack` for fwgt10's shape | None (text only). |
| M3 eval note + tool text | Unknown; probably small. Nobody measured prompt-only hygiene. | — | None. |
| M4 eval-sourced goto → click / refuse once | **fwsi7** (`goto /hardware/4`: a click on "Click here to view" instead); **fwsi2/fwsi5** (`/hardware/4/checkout`, the one-digit id that stayed literal) if the Checkout link was unique on the page; fwsi1, fwsi9 likewise. fwkb41/42 already convert at compile (`linkedFrom` = yes). | r55 `sourcelessGoto` (the linkedFrom case only) | A click where goto was fine: the click's own effect (a JS handler that does more than navigate). The refuse-once path costs one turn. |
| M5 sourcing hold (+ commentary pre-pass) | **fwgt10** open_issue_titles (if r59 had not sourced it). **fwgt8/fwsi8** fused titles (backstop to r56). **fwkb41** obj 1 columns (captureReadBack refused the hidden duplicates: the model's `read_all` would have been a real source). fwec12's API-fetched ids (the model would have to read them in the UI or admit they are not shown). | r56 contained composite, r57 hidden-duplicate pin, r59 shownReadBack | A green app paying turns: rd's alert-text preconditions (excluded by rule 4), ghost's publish times, grafana's "ticked before Save". Estimate one turn in 5-13% of instructions. A hold near the budget is gated off by the 20 s / last-turn rule. |
| M6 `$0` guard in cli.ts | **fwrd85** "total /bin/sh.00". | — | An instruction that legitimately contains `/bin/sh` passed on argv: refused with exit 2, re-issue with `--stdin`. |
| Literal password (fwod79, fwrd83) | Nothing new. Fix AH (r48) rewrites a known credential's value at dispatch, and fwod80/85/86 show zero leaks. The remaining gap is a password typed when no credential env var is set; sitelooper cannot know it is one. Keep compile's warning, and do not refuse (the user may not have an env var). | AH | — |
| fwgr71 (the outer model rewrote "auto-refresh 1m") | **Nothing here.** Sitelooper never sees the task file. The instruction it got was internally consistent, and replays reproduced it faithfully. Only an objective verifier catches it. | — | — |

Being blunt: of the eight named failures, the new record-time measures would clearly have prevented
fwop10, fwgh8 and fwsi7, probably fwrd85 and fwgt10, and backstop fwgt8/fwsi8. All but fwrd85 already
have a compile/runtime mitigation. The value of this work is **fewer recordings that depend on
those mitigations holding** (they are heuristics with their own failure modes: `sourcelessGoto`
ends the procedure when no link was seen, and `dropEvalAssignedCandidates` leaves positional
candidates). It will not flip a currently-red app to green by itself.

## 6. Measurement

**Without sweeps:**
1. *Guard coverage and false positives (M1).* Run the extended `evalMutation` over every recorded eval
   expression: 2,579 in total, 1,646 recent (`guardsim.mjs`). Today it adds exactly 7 blocks in the
   recent era (identity 6, `window.open` 1) and 0 of the 1,646 read-only expressions. Freeze those
   expressions as a test fixture: the 7 must block, and a 300-expression sample of read-only probes
   must pass. `fetch` and monkeypatches stay unblocked by design (18 hits, fwgt9 among them, and it
   was green).
2. *Hold firing rate (M5).* A `bench/hold-sim.mjs` that imports the real pure tiers through tsx
   (`positionDatumKeys`, `flattenComposedValues`, `promoteLabelledReads`, `backfillReadValues`,
   `selectionReadBack`, `coreReadBack`, `shownReadBack` over recorded diffs, `askedOutputs`, the
   commentary pre-pass). It stands in for `captureReadBack` with "a read/read-back/diff line of this
   instruction contains it", and runs over the 146 published n1 scripts. The crude version gives 109
   → 69 of 541 success instructions (12.8%). The acceptance bar: ≤10% overall and ≤1 hold per
   recording on rd/od/vk.
3. *Goto provenance (M4).* `gotoctx.mjs`: the 8 eval-adjacent unseen record gotos, and whether
   `linkedFrom` was captured. Only r55+ recordings carry it: fwkb41/42 do, the Snipe-IT ones predate it.
4. *Corpus check* (`bench/corpus-check.mjs`, ~90 s). M1-M5 are record-time, so old stores must show
   **0 status changes**. Stage 0's new `evalResult` field must not change any compile.
5. *Stage 0 data from the next routine sweep, whatever it is testing:* with eval results recorded, compute the real
   "reported value ∈ an eval result and ∉ any read" rate, and the real "goto part ∈ an eval result".
   That replaces the inferences above.

**What a sweep must show** (one confirmation batch: op, si, gt, ec, gh have the most evals; rd and od
are the no-regression controls):
- n1 success unchanged: verified objectives per app equal the r59c/r60 baseline, and n1 instruction
  turns within +5% (holds add turns; the goto/eval blocks may add one each).
- Zero identity/`window.open` evals recorded. Count block messages: each one should be followed by a
  successful dedicated-tool action within 2 turns.
- Holds logged (`[turn N] holding success report for sourcing: k1, k2`): at most 10% of instructions,
  and for each one, whether the retry added a labelled real read. **No state-changing gesture after a
  sourcing hold.**
- The round-56 "asked facts published" measure goes up; replay `unanswered` and export
  `literalOnlyAsks` warnings go down.
- n2/n3 model-free and compiled status no worse on the controls.

## 7. Staged plan, smallest first

**Stage 0: provenance and measurement (no behaviour change).**
- `ScriptRecorder.commit`: an eval step keeps `evalResult` (scrubbed through `scrubSecrets`, capped
  at 2 KB). **Not `result`**: `ledger.ts` `shownIn` reads `e.result` for every step, so an eval result
  there would make fwsi7's `goto /hardware/4` "seen" and undo the r55 landing rule. `readResultsThisInstruction`,
  `readsThisInstruction`, compile and flow never read `evalResult`.
- Keep this instruction's eval results in memory for M4/M5 (`stepsThisInstruction()` already gives them).
- `bench/eval-audit.mjs` (categories, empty-read→eval, eval-adjacent unseen gotos, eval-sourced
  report values once `evalResult` exists) and `bench/hold-sim.mjs`.
- Tests: recorder unit test that eval steps carry `evalResult` and not `result`; `unseenGotoParts`
  ignores `evalResult` (fwsi7 shape); a compile of a recording with `evalResult` equals one without it.

**Stage 1: eval guard and wording (zero turns, zero model calls).**
- `evalMutation` gains the identity, `window.open`/`open(`, bare `location =` and `.style/.hidden/.disabled =`
  patterns. `dispatch` case `'eval'` builds the targeted message (it quotes the expression's own
  selector literal when there is one).
- The eval `TOOL_DEFS` description and one sentence in OPERATING_RULES rule 7. A first-eval-per-instruction note on the result.
- Empty `read`/`read_all` hint in the model-facing string only.
- Tests (tools.test.ts): the 7 historical expressions block with the expected reason; the
  read-only sample passes (comparisons `==`/`===`, `{id: e.id}`, `e.name`, `getAttribute('id')`,
  `window.open` inside a string literal); the empty-read hint appears and the recorded result is `[]`.

**Stage 2: `$0` guard (cli.ts, argv instructions only).**
- Refuse (exit 2) an instruction from argv that contains a shell's `$0` expansion
  (`/bin/sh`, `/bin/bash`, `/usr/bin/bash`, `-bash`, `/bin/zsh`) next to a digit, `.`, or quote.
  Point at `--stdin`/`--instruction-file`. `--stdin` input is never checked.
- Tests: fwrd85's "total /bin/sh.00" refused; the same text via stdin accepted; "/bin/shared" not refused.

**Stage 3: commentary pre-pass (deterministic, no hold, in `finish`).**
- After `flattenContainedComposite` and before `shownReadBack`: `head + commentary`, with head
  pinned by `captureReadBack`, publishes head; the commentary goes into the summary.
- Tests: "Ready to Deploy (badge: Deployed)" publishes "Ready to Deploy"; "Seed: triage inbox (#1)"
  still splits via contained-composite; "2026-12-31 (page displays Dec 31)" with the head absent is unchanged.

**Stage 4: sourcing hold.**
- Async `ReportHold.check`; the dry cascade shared with `finish` through a cache; the firing criteria
  of §4; merged with `naming` when both apply; the 20 s / last-turn gate.
- Tests (loop.test.ts, fake provider and fake page, as the naming-ask tests do):
  (a) an asked value absent from the page with an eval result holding it → held once, and the
  retry's labelled read is published;
  (b) the same value shown on an earlier page's diff → no hold (`shownReadBack` sources it);
  (c) a verdict value / non-asked key / alert text / last turn / <20 s → no hold;
  (d) the retry repeats the same report → accepted, and finish behaves exactly as today;
  (e) naming and sourcing both apply → one merged hold.
  A browser test on a fixture page (list page → search page, the fwgt10 shape).

**Stage 5: eval-sourced goto (optional; recording only).**
- In the `goto` path of `executeTool`: convert to a click on `linkedFrom` when the part is unseen and
  in an eval result; otherwise refuse once per url.
- Tests (browser): a fixture page with a "Click here to view" link and an eval reading its href →
  the goto records as a click and lands on the same url; with no link → refused once, then allowed on
  repeat; a goto to a url the instruction states → untouched.

Stages 0-2 can ship together with only the corpus check and the unit/browser suites. Stages 3-4 need
the one confirmation batch above before merge, because only a live recording shows the hold's effect
on turns and on the model's behaviour. Stage 5 waits until Stage 0 data shows eval-sourced gotos
still appear in recordings made after r55.
