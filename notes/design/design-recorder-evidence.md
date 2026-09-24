# Recorder evidence: turning compile's guesses into recorded facts

Design pass only. No code was changed. Code references are to `origin/fix/round60` (cb5caf27).
Evidence comes from `origin/results/<runid>*`, `bench/results-published/<runid>-n1-script.jsonl`
and bench/SWEEPS.md. Script line numbers below are 0-based except where marked (1-based).

## 0. Summary

The pitch is "observe the page continuously and attribute every change". It is right for about
half of the named failures and wrong for the rest. The evidence splits three ways.

- **Missing facts: continuous, attributed observation decides these.**
  - fwgh6, fwgh8 and fwsi9 (a tab, when it arrived, and from what).
  - fwgt11 (the picker shut between gestures, and the commit request that followed).
  - fwsi1 (a debounced url credited to the wrong fill; a type that went to a focus a failed action left).
  - fwec4 and fwec10 (who emptied Amount, and when).
  - fwod81 (a net-zero mistake-and-repair span).
  - fwec5 (the first Save sent no request).
  - the fwvk8 login (the document was replaced under the fills).
  - fwgh14's mint provenance.
- **Present facts, wrong rule: the new evidence does not help.**
  - fwgr69: the collapse and expand were exact inverses in the recorded diffs; compile read the compiled expect instead.
  - fwvk8's FILTERS popup: the diffs plus the next instruction's startText already showed it open across the boundary.
- **Not a recording problem at all.**
  - **fwop14.** The recording was stable: the Save's row is still in the next instruction's startText at 1-based line 44. The artifact judged the page at a different moment from the daemon (3e0b9bbd). It was a runner parity defect, not "a late re-render after the step's capture".
  - **fwsi10's replay divergence.** On replay the calendar was simply not open. The recording can prove that "15" was a pure dismissal, but only the runtime can learn that the popup is absent.
  - **fwvk1 and fwvk2.** The re-render happened only on replay.
- **Genuine ambiguity that no recording fact removes.** An app ignored a gesture that did reach its target, with no request, no route change and no mutation (fwgh12; fwop6 and fwop13 if no request was issued). Whether the replay app will ignore it too is not in the recording. That is the place for "carry both readings", and the round-57 `repeatIfNoEffect` is already a one-off instance of it.

The cheapest high-value step is not a MutationObserver. The recorder already computes, then throws
away, most of what compile lacks:
- per-step timing and the settle verdict (`SettleVerdict.waited/link/via/outcome`);
- the "before" signature of every state-changing step;
- `captureFailed`;
- failed actions;
- the uncapped diff.

Stage 0 and stage 1 below persist these and add a "gap diff" (after(N) against before(N+1)) and
page events with timestamps. That costs no extra page captures and no waits. Stage 1 alone would
have decided fwgh6, fwgh8, fwsi9, fwgt11's close, fwec4, fwec10 and the fwsi1 url.

## 1. Current state: what the recorder captures, and where the gaps are

### 1.1 The capture path

`src/agent/tools.ts runStep` (about lines 687-872) wraps every tool call.

**1. `ScriptRecorder.prepare`** (`src/daemon/recorder.ts` about 637) runs BEFORE the action.
- It describes `target`/`source` into a verified locator chain (`describeTarget`/`describeLocator`), with the frame path.
- It adds a component tag (`tagComponent`).
- For a `goto`, it records `linkedFrom`, the link on the page whose href is the goto's target.
- It records identity hints from the typed values.

**2. The `before` signature.** `captureSignature` (`src/daemon/diff.ts`) runs over `observePage` (`src/execution/snapshot.ts`), capped at 4000 nodes, 400 lines and `CAPTURE_TIMEOUT_MS` = 2 s.
- It is taken only for `STATE_CHANGING` tools (click, dblclick, modifier_click, right_click, fill, type, press, select, check, drag, upload) and `NAVIGATED` tools (goto, back).
- **Reads, read_all, wait_for, eval, tabs, hover and screenshot get no signature and no diff.**

**3. Page listeners.** `popup` on the page (`POPUP_TOOLS` only: click, dblclick, modifier_click, press, select, check) and `page` on the context are attached for the step's duration.

**4. The action observation.** `beginAction(...)` (`src/execution/action.ts` 514) runs, then `dispatch`, then `obs.settle()`.
- The settle loop is bounded: DOM quiet 250 ms (at most 2 s), network (cap 2 s), a start grace for debounced requests of 250 ms, announcement hold, `LINK_NAV_WAIT_MS` for a link, and `urlHeldStill` for a navigating tool.
- It returns a `SettleVerdict {outcome, url, link, via, waited{domMs,networkMs,urlMs,effectMs}, ignored[], deadlineHit}`.
- **None of this is recorded.** Only `result += note…` for an uncommitted link reaches the model.

**5. The `after` signature, and the diff built from it.** `diff = {url, alerts(new), added, removed?, dialect}` with:
- `addedLines` and `removedLines` capped at `MAX_ADDED_LINES = 20` (`snapshot.ts` 642);
- `removed` kept ONLY when a dialog line went, or when nothing was added (then up to `MAX_KEPT_REMOVALS = 60`, though the 20 cap applies first).
- An `after` capture that loses its race sets `captureFailed`, which is returned to the loop and **not recorded**. So "no diff" in the store means either "unknown" or "not a diffed tool".

**6. `fingerprintAfter`** is taken when the url pattern changed, or when a popup, close or switch happened.

**7. `pageContextOf`** (`tools.ts` 899) decides `page` and `effect`.
- It checks the opener. If the click was visibly quiet it waits `LATE_POPUP_GRACE_MS` = 1 s.
- Otherwise it takes "exactly one fresh page since the step began", and gives `CLOSE_GRACE_MS` = 500 ms on an opened page.
- Anything later is lost.

**8. `recorder.commit`** runs only on success. The comment reads: "Commit a prepared step once the action succeeded. Failed actions are dropped." A thrown `dispatch` (`not-dispatched` or `unknown`) leaves no entry, even when it moved focus, opened a widget or typed characters (fwsi1).

### 1.2 What else is stored

**Instructions.** `RecordedInstruction` stores `url`, `fingerprint`, `startText` (a capped visible-text signature, with `startTextComplete`) and `resume`.
- This is the only page capture between two gestures, and it happens only at an instruction boundary.

**Reports.** `RecordedReport` stores status, values, skill and relabel.

**Synthetic read-backs.** These are inserted with `insertStepAfter`, which rewrites the file.

### 1.3 The gaps, in order of how often they caused a guess

| # | Gap | Where | Cases it forced into a heuristic |
|---|---|---|---|
| G1 | **Nothing between gestures.** Changes after the settle and before the next capture are either invisible or credited to the next gesture's diff | runStep captures only around its own action | fwgt11 (picker shut between 95 and 98), fwsi1 (debounced url landed in fill 18's diff), fwgh14 (title-blur autosave id landed in the body click's diff), fwgh6 (tab arrived after 63's capture), fwec4/fwec10 (Amount emptied, unattributed) |
| G2 | **No timestamps** anywhere: the script, the published outer transcript (whole `do` commands only) and the result JSON. The inner model's turns are not published | recorder, harness | every "was it late?" question |
| G3 | **The settle verdict is discarded** (a link request seen or not, `via` forced or synthetic, waits, ignored long-lived requests, `outcome`) | tools.ts after `obs.settle()` | fwop6/fwop13 ("a +0 -0 link click": was a request issued?), fwgh12 |
| G4 | **Failed actions are dropped**, side effects included | recorder.commit | fwsi1 (select2 focus) |
| G5 | **Observations and evals are not diffed or page-watched.** Eval results are not stored | STATE_CHANGING, POPUP_TOOLS | fwgh8 (eval `window.open` credited to Publish), fwop10 (eval-assigned ids), fwgt10 (values taken by eval) |
| G6 | **State off the a11y line model is invisible**: class ticks, aria-selected, contenteditable text, CSS collapse, field values that the line does not carry | observePage lines | fwgt11 (every tick `+0 -0`), fwvk4, fwsi1 (show/hide) |
| G7 | **Diff truncation.** 20-line cap; `removed` dropped whenever something was added; `captureFailed` unrecorded | tools.ts, snapshot.ts | fwec10 (27's removal truncated), fwgh12 (62's +20 hides the Boom modal), fwod81 (no removals at all), fwsi10 (`entryPopup` reasons around the cap) |
| G8 | **No network facts.** Which requests a gesture started, and whether they carried the typed value | nowhere | fwec5 (the Save sent no POST), fwgt11 (the label POST on close), fwvk4 (which save persisted), fwgh14 (the mint response) |

## 2. The proposed evidence model

### 2.1 Principles

1. **No new waits.** The journal observes during waits that already exist: the settle, the model's think time (seconds) and the report. Late effects are caught because the observer is still running when they happen, not because the recorder waits for them. `LATE_POPUP_GRACE_MS` and `CLOSE_GRACE_MS` can then be removed from recording.
2. **Recorder-only, and the store stays declarative.** Compile reads the facts and bakes its decisions into the SkillStep fields that already exist (`effect`, `toggle`, `repeatIfNoEffect`, `closedBefore`, `removalRequired`, `expect`) plus one new field (`readings`, §3.10). The artifact never sees the journal, so parity is about decisions, not evidence (§6).
3. **Attribution may say "unknown".** An event that cannot be attributed is stored as `cause: {k:'unknown'}`. Compile must treat "unknown" exactly as it treats a missing fact today, which means falling back to the current heuristic. A wrong attribution is worse than none.
4. **Summarise in the page, drain at step boundaries.** The page holds a bounded ring buffer. The daemon drains it with one `evaluate` at the moment runStep already talks to the page, which is the `before` capture of the next step.

### 2.2 Event sources

**Node side** (Playwright events, cheap, no page code). Attach once per page in `BrowserSession`, and for every page the context gains:

| Event | Fields | Source |
|---|---|---|
| `nav` | t, frame (main or path), url, sameDocument | `framenavigated` (already used by `urlTrail`, execution/browser.ts 26) |
| `doc` | t, url, `timeOrigin` | `domcontentloaded`, plus `performance.timeOrigin` from the drain. A changed timeOrigin at the same url is a document replacement (fwvk8 login) |
| `page+` | t, index, opener index or null, url, `foreground`(page.bringToFront not called; `visibilityState` from the first drain) | context `page` event, and `opener()` |
| `page-` | t, index | `close` |
| `dialog` | t, type (alert/confirm/beforeunload), message clipped | `dialog` (dialogs.ts already handles these) |
| `req` | t0, t1, method, resourceType, endpoint (`endpointOf`, action.ts 182), status, frame, `carries` (a list of step ids whose typed value occurs in the request url or post body, computed in node; the body is never stored), `mintIds` (id-shaped values in a JSON response to POST/PUT, capped at 3, response ≤ 64 KB) | `request`, `requestfinished`, `requestfailed`, reusing the `pageTraffic` classifier (action.ts 202) for long-lived and polling |

**Page side.** One `context.addInitScript`, in every frame, which survives navigations. Nothing in src uses addInitScript today. The script:
- **MutationObserver** on `document` (childList, subtree, attributes with an `attributeFilter`, characterData) that summarises into records rather than storing raw mutations:
  - `add` / `rm` of a **landmark subtree**: an element whose role (explicit, or implicit from the tag) is dialog, alertdialog, listbox, menu, tooltip, grid, tabpanel, combobox popup, `[popover]`, or `position:fixed/absolute` with a z-index above 0 when it has more than 3 descendants. Each record holds a short descriptor (role, accessible name clipped to 60 characters, and the first line of its ariaSnapshot-like rendering from the shared snapshot page function) and a **lineage id**. A WeakMap tags every added node with the cause active when it was added (§2.3), so a later removal can name who added it.
  - `attr`: aria-expanded, aria-selected, aria-checked, aria-pressed, aria-hidden, hidden, open, disabled. Also `class` on elements with an option/menuitem/tab/treeitem role or inside a listbox or menu (Gitea's tick is a class). A record holds (lineage or descriptor, attribute, old→new).
  - `text`: characterData or childList inside a contenteditable or `[role=textbox]`, reduced to a length and a hash per element per gesture window (fwvk4).
  - `churn`: a counter per landmark for mutations that fit none of the above. It feeds noise detection and never stores content.
- **Value journal.** `input`/`change` listeners (capture phase) on inputs, textareas and selects, plus a value check at each drain for fields the recording has touched (values set by script fire no event). A record holds (field descriptor, old value hash and length, new value hash and length, and whether the new value equals a typed step value, the check done in node against the value hashes). Password-type fields record only "changed/emptied".
- **Focus journal.** `focusin`/`focusout` (capture phase): target descriptor and `relatedTarget` descriptor.
- **Input events at dispatch.** For trusted `pointerdown`/`click`/`keydown`, record the event's actual target descriptor, whether it is the locator's element or inside it (the recorder posts the expected element via a data attribute set in `prepare`, then removes it), `defaultPrevented` after dispatch (checked in a bubbling listener on window, registered last), and the `elementFromPoint` hit at the pointer coordinates. This is the only fact that separates "the app ignored a delivered click" from "the click hit an overlay" (fwgh12, and fwgr69 39/40).
- `performance.now()` per record, converted to the daemon's clock at the drain (timeOrigin + now).

**Gesture windows** come from the daemon (`tools.ts`), which knows them exactly. Each window has an id (a step `seq`), a tool, a start at dispatch, an end at `settle` return, and a kind:
- a gesture: STATE_CHANGING or NAVIGATED;
- an eval;
- an observation: read, wait_for or tabs;
- a daemon internal: the model's `snapshot`, `hover`, dialog drain, or a synthetic read-back;
- a failed attempt.

The window is also written into the page (`window.__sl_w = seq`) at dispatch, so in-page records stamp themselves. The node side confirms by time.

### 2.3 Attribution rules

Each event gets exactly one `cause`. The rules are evaluated in order and the first match wins:

1. **Inside a window** (t within [dispatch − 20 ms, settle end]) → `{k:'in', w:seq}`. The window's kind carries through: an event inside an eval window is the eval's (fwgh8's `window.open`), and one inside a daemon-internal window is `daemon`.
2. **Request lineage.** The event follows, within `LINEAGE_MS` = 300 ms, the finish of a request whose own cause is window W (a request started in W, or a redirect chain of one), and no window has opened since that request started, or the event's frame url or endpoint ties it to W's request → `{k:'late', w:W, via:'req'}`. Examples: fwgh14's hash rewrite after the autosave POST; OpenProject's late row rename.
3. **Timer after input.** A request started, or a url changed, within `DEBOUNCE_MS` = 1500 ms of W's last input event, with no window opened in between except observation windows → `{k:'late', w:W, via:'debounce'}`. Example: fwsi1's `search=Seed%3A`, which belongs to fill 13, not fill 18.
4. **Lineage undo.** The removal of a subtree added by window A (lineage tag), with no window open → `{k:'undo', of:A, trigger}`. `trigger` is the nearest preceding focus event within 300 ms (`focusout` from inside the subtree = `blur`), else a request finish within 300 ms (`req`), else `timer`. Examples: fwgt11's listbox shutting; a toast expiring.
5. **Page lineage.** A `page+` whose opener is page P, while the last closed window on P was W and no other window ran since → `{k:'late', w:W, via:'page'}`. With opener null (Ctrl+click, noopener) the same holds only if W's tool is `POPUP_TOOLS` or eval and it is the only window since. Examples: fwgh6, fwsi9.
6. **App background.**
   - An endpoint the traffic classifier has seen as polling or long-lived, or one repeating at least 3 times with a stable period, is `{k:'app', why:'poll'}`, and so are the mutations within `LINEAGE_MS` of its responses.
   - A landmark whose `churn` or text changes at least 3 times with no window, or text differing only in digit and time tokens (reusing `text.ts`'s volatile-token masks, which already cover relative times since fwgh3), is `{k:'app', why:'periodic'}`.
7. **Otherwise** `{k:'unknown'}`.

**Overlaps.** An event after window N+1 dispatched, but in N's request lineage, is recorded with `cause:{k:'late', w:N, via:'req'}` and `also: N+1`. Compile treats any event carrying `also` as ambiguous for every rule that would move a gesture.

### 2.4 Storage in script.jsonl

The file stays append-only. The one existing rewrite path, `insertStepAfter`/`pinSkill`/`persist`, is unchanged. Evidence rides on entries that already exist, so old readers ignore it.

- **Every entry gains `seq`** (monotonic per take). References use `seq`, not array indices, because `insertStepAfter` shifts indices.
- **RecordedStep gains optional fields:**
  - `t: {d, s, c}`: dispatch, settle end and after-capture, in ms since the take's start (a new `k:'instruction'` field `t0` holds the epoch).
  - `settle: {outcome, via?, link?, waited, deadlineHit?, ignored: n}`, the verdict that already exists.
  - `captureFailed: true`.
  - `diffTotals: {added, removed}`, the uncapped counts. `removed` is now always kept (capped at 20). This needs a check that each rule reading `removed === undefined` as "not recorded" still holds: `collapseTogglePairs` does ("d.removed === undefined || d.removed.length > 0").
  - `ev: Event[]`: the events whose cause is this step (in or late), summarised, at most 40, plus `evDropped: n`.
  - `gap: {since: seq, url?, added[], removed[], ev: Event[]}`, on the NEXT state-changing step: the diff of the previous step's after-signature against this step's before-signature (zero extra captures), and the events with causes `undo`, `app`, `unknown`, or `late` for a step that has already been written. Late events are stored here because the causing step has already been appended. Compile moves them back by `w`, so the file is never rewritten for a late event.
  - `hit: {target: 'self'|'inside'|'other', other?: descriptor, prevented?: true}`, for clicks.
- **A new entry kind `{k:'attempt', seq, tool, args, locators, outcome:'not-dispatched'|'unknown', reason, t, ev, diff?}`** for failed actions. This is the one new `k`. It is written only when the new recorder is on, and every reader must skip it. There are places to audit that switch on `e.k` with an else branch: store.ts, flow.ts, server.ts, and bench/rebuild-flow.mjs and corpus-check. A grep for `k === 'report'`/`'instruction'` finds them. If the audit is too wide, carry attempts as a `RecordedStep` with `failed: true`, filtered out in `compileSkills` by the same step that drops screenshots. That is safer, and my recommendation.
- **Eval and observation steps** gain `ev` and, for eval only, a diff (a before/after signature for an eval that ran with the page open; evals are rare, so the cost is small).

**Event encoding** is compact:

```
{t, k, c}
```
- `k` is one of `add|rm|attr|val|foc|txt|nav|doc|page+|page-|req|dlg`.
- `c` is the cause, e.g. `["late",88,"req"]` or `["undo",89,"blur"]`.
- Plus kind-specific fields:
  - `rm`: `{d:'listbox "Clear labels bug …"', lin:89}`
  - `req`: `{m:'POST', e:'/bench/bench-repo/issues/labels', s:200, carries:[90]}`
  - `val`: `{f:'textbox Amount', from:'L5#a1', to:'L0'}`, where `L` is the length and `#` a hash prefix; the actual value only when it equals a typed task value or a value the page already shows as a line.

**Size.** In the published recordings a step averages about 900 bytes (fwop14: 125 KB for about 140 entries). The budget is ≤ 40 events × ~70 bytes ≈ 2.8 KB worst case per step, and in practice under 1 KB because most steps produce 0-10 events. Expected growth is 1.5-2.5×, about 150-300 KB per recording. The skills store and the flow are unaffected, because compile consumes the evidence.

**Secrets.** Events are scrubbed by `scrubSecretsDeep` at the drain, like diffs. Request bodies are never stored, only `carries` step ids. Values in password fields are never stored.

### 2.5 Backward compatibility

- Every field is optional. A step without `ev`/`gap`/`t` is an **old step**, and compile applies today's heuristic to it unchanged.
- The decision is per rule and per step pair: a fact-based rule fires only when both steps it compares carry `ev` (a `evidence: 1` version marker on the instruction entry makes this explicit).
- This is what keeps corpus-check at "0 status changes" on the ~170 results branches, and it is the stage-0 acceptance test.
- Skills compiled before the change keep their fields; nothing in the runtime reads the journal.

## 3. Heuristic by heuristic

For each rule: the question it really answers, whether the facts settle it, what replaces it, and
what ambiguity remains. The "Old stores" line is the fallback: the current rule, kept verbatim.

### 3.1 abandonedRepeatClick / repeatOf (compile.ts about 3415-3510)

**The question.** "Did press 1 have any effect, and was the identical later press the one that worked?"

**Facts:** press 1's `ev` (in and late), `hit`, `settle.link`, and any `req` it caused. Decide as follows:
- **(a) Press 1 caused anything:** a `req` that is not app-background, a `nav`, a state `attr` on its target or a landmark, or a late add or rm. Then it was **not** abandoned. Keep it.
  - If the repeat's effect undoes press 1's (inverse `attr` or add/rm on the same lineage), it is a toggle pair. See §3.9.
  - This makes the fwgr69 failure impossible by construction. The first click's `attr aria-expanded true→false` (or its rm lines) is a recorded effect, whatever the compiled expect says. Honestly, fwgr69's raw diff already had it; the rule read the wrong layer.
- **(b) Press 1 caused nothing, `hit.target` = self, not prevented, no request:** the app ignored a delivered click. Keep ONE press and mark `repeatIfNoEffect`, whatever lies between the presses. This is fwgh12's case, now decided by fact instead of "only observesOnly between". Whether replay ignores it too is a genuine ambiguity, and the runtime reading decides it (§3.10).
- **(c) Press 1 caused nothing, and field work lies between with a `val` record showing the field was repaired** (value emptied or reformatted by the app before press 1, then re-entered): press 1 failed because of the state before the repair. Drop press 1 and keep the repeat. This is fwec5. The facts: no POST for Save 1, and a `val` for Amount showing app-emptied → 12,500.
- **(d) Press 1's `hit.target` = other** (an overlay or backdrop took it): press 1 is a dismissal of that overlay. Keep it as a hide with `removedContains` of the overlay's rm, and skip it at runtime if the overlay is not there (the existing `hideBefore`).

**What remains:** case (b)'s replay behaviour, and case (c) when no `val` record exists (a validation-only failure that changed no value). The latter falls back to the current `fieldWork` proxy.

**Old stores:** today's rule.

### 3.2 repeatIfNoEffect (toggle.ts `pressHadNoEffect`, replay.ts about 1270, emit.ts about 2767)

This is already the "carry both readings" pattern (§3.10). The facts make it safer in two ways.

**At compile:** it is set only on a fact-proven no-effect press (§3.1 b), never on a press whose recording showed a late effect.

**At runtime:** `pressHadNoEffect` today reads only lines, url and alerts after the settle. An app that answers late would get a second press, and on a toggle that is a double flip.
- Add the traffic fact, which is already shared: "no request started since the dispatch" (`traffic.startedSince(baseline)` in action.ts).
- Add a wait bounded by the recording's own latency: if press 2 in the recording came X ms after press 1 with nothing happening, the runtime waits up to min(X, 2 s) before pressing again.
- Both of these belong in the shared `pressHadNoEffect` signature, so both runners judge alike.

### 3.3 dropSupersededSets: reload arm, refill arm, quietFill (toggles.ts 169)

**The questions.** "Was fill 1 overwritten before anything consumed it?" and "Was attempt 1 abandoned and redone?"

**Facts:** `val` records (field value per window), the `req.carries` of each typed value, lineage on anything fill 1 added.

**Refill arm.** Fill 1 is dead iff all three hold:
1. its value was replaced in the same field before any request carried it (`carries` does not include fill 1);
2. every subtree fill 1 added (lineage) was removed before any gesture targeted inside it;
3. no other field's `val` changed in fill 1's window.

Then drop it. Otherwise keep it.

**The fwod81 generalisation: a net-zero span.** Take the gestures from a mistaken fill up to the point where the field returns to its prior value hash, with everything they added removed. That is a mistake-and-repair: drop the whole span, not only its head.
- The facts: line 80 wrote "2" into the product field (val `[E-COM11]…` → `2`); 81 and 82 restored it.
- Round 54 dropped only 80 and left a re-select on an undisturbed row.

**Reload arm (fwvk4).**
- Attempt 1 is abandoned iff the value the reload shows (a `read` or `val` after the `doc` replacement) is not the typed value AND no request carried the typed value.
- With `carries` we would also know which "Saved!" corresponds to which save. My earlier assumption that bodies are needed is answered without storing them.
- If a request did carry the value and the reload still shows it missing, the app rejected or overwrote it. Keep today's drop, and record the reason.

**What remains:** a side effect of the dead fill that the page consumed invisibly, for example a server-side draft created by an autocomplete request that was not app-background. `carries` covers the value, not a side effect. In that case keep the fill.

### 3.4 observesOnly / abandonedLinkClick (compile.ts about 3390, 3544)

**The question.** "Did this link click start the navigation, late, or was it inert?"

**Facts:** `settle.link` (whether a request for the href was seen, which the settle already knows), `req` with endpoint equal to the href, a late `nav`, a `page+`.
- **The click started a request or a nav:**
  - If the navigation committed after the capture (late `nav`), the click did navigate. The repeat and the goto are redundant: drop them, keep the first click with `expect.urlPattern` set from the late nav.
  - If the model's goto pre-empted it (request aborted by a later window), keep the click and drop the goto only when the goto's url equals the href. Otherwise keep both.
- **No request, no nav, hit = self:** inert. This is the genuine ambiguity: fwop6's replay did navigate on the first click. Use the reading pair "click; if no request and no url change, goto `linkedFrom`'s href" (§3.10).
  - It is safe because a link GET is not a commit, and the goto is the model's own fallback.
- `observesOnly` becomes unnecessary as a scan terminator. The rule no longer needs to reason about what lies between, only about each click's own facts.

**Old stores:** unchanged. fwop13's `tabs {}` fix stays.

### 3.5 entryPopupHides and the hide family (compile.ts about 2575-2612, 3300-3378; toggle.ts)

**The questions.** "Was this click's whole purpose to close something the entry opened?" and "Is a removal required?"

**Facts:**
- the popup's lineage (added in fill N's window, after `foc` focusin on the field, before or without the value `val`);
- the click's `ev` (an `rm` of that lineage only);
- no `val` change on the field in the click's window;
- the click's `hit` is inside the popup.

Then it is a pure dismissal (fwsi10's "15": the value was already 2026-03-15, the click changed none). Such a click is `removalRequired: false` and skippable when absent. That is today's round-59 behaviour, decided by fact rather than by the `: <typed value>` line and cap allowance.

`markRequiredRemovals` "opened": a removal is required only when the removed subtree's lineage is a gesture in this segment that the procedure needs (a modal the segment opened with a click). A popup that focus opened (`foc` lineage) is never required. This is exactly the fwsi10 regression the "opened" arm caused.

**What remains:** whether replay's fill opens the popup at all. That is a runtime fact, already handled by "skip when its target is gone".

**Does not help:** fwvk8's FILTERS popup. Its diffs already showed the facts.

### 3.6 carryOpener / carriedSteps / earlierOpening / closedReopens / closedBefore (compile.ts 166-330; toggle.ts `closeBeforeReopen`)

**The questions.** "Which of a dead instruction's gestures took effect?", "Was the popup open at the instruction boundary, and who opened it?" and "Was it closed, and so committed, between openings?"

**Facts:** the `attr` ticks inside the picker, the `rm` of the listbox with cause `undo of 89` + trigger, and the `req` after it that carries the tick.
- For fwgt11, the chain would be:
  - `attr class +checked` on `link "bug"` in window 90;
  - `rm listbox (lin 89)` with cause `undo/blur|timer|unknown` at some t between 95 and 98;
  - `req POST /issues/labels … s:200` within 300 ms.
- Compile then knows directly that the dead attempt's picker session 89→90→close committed "bug".
- It emits:
  - a **closed segment**: carry 89 and 90, plus an explicit close. The close is the recorded trigger: `blur` → press Escape or click the opener, whichever the recording later shows working. fwgt11 turn 7 found that Escape did NOT close it and an outside click did. That is a fact the model discovered and the journal would have seen (whether the `rm` followed Escape's window or a click's).
  - The re-open (98) is a plain opener; no `closedBefore` inference is needed.
- `earlierOpening`'s condition ("a line the opening offered and the re-open did not") is replaced by the `attr` and `req` facts.
- `closedReopens`' condition ("98 re-added a line 89 added") is replaced by the recorded `rm`.

**What remains:**
1. The trigger of the close can be `unknown`. In fwgt11 nothing visible touched the page between 95 and 98; evals ran and escalation does not touch the browser (runEscalatingInstruction). Compile then still needs a policy close ("click the opener to shut it", today's `closeBeforeReopen`).
2. Whether a dead instruction's work belongs in the procedure is policy, not evidence: carriedSteps' `endedInFailure` stays.

### 3.7 The recovery rule that drops the stopped via-step (compile.ts about 703-743; 2bacfb12 rule B)

**The question.** "Did the replayed step that stopped do its work, and was only its gate wrong?"

The evidence helps partly. Recovery runs in the daemon, which records with the same journal. Rule B's "had an effect (url moved or lines added)" becomes "caused an effect": an `in`/`late` `nav`, a `req`, or an add under its own window.
- In fwgh14 the effect was genuinely the click's (it opened the post).
- In the fwgh14 recording's 02-create, though, the url change was the title-blur autosave landing in the body click's window. Attribution would have said `late via req` (the autosave POST started in the fill's window). That also gives buildFlow the mint's provenance, the POST response id, instead of rule A's "last url of the trail on the recorded route".

**What remains:** whether the gate that refused was right (a frozen id against a real mismatch). That is a binding question, not recorder evidence.

### 3.8 creditUncreditedPopups (compile.ts 395)

**The question.** "Which gesture opened this tab?"

The facts settle it completely. `page+` with t, opener and cause (rule 5, §2.3) credits directly:
- fwgh6: the card click, a late `page+` with opener page 0;
- fwgh8: the eval window, where the eval's steps are dropped as today, but now by fact;
- fwsi9: `modifier_click` with opener null and a background tab. The recorded `foreground:false` also explains the model's explicit `tabs switch_to 1`.

The backward walk and the eval stop go away, and `LATE_POPUP_GRACE_MS` leaves the recording path. Two pages from two causes are each credited; today they are ambiguous and neither is credited.

**What remains:** only two `page+` arriving with no window and opener null. That is `unknown`, and falls back to today's rule.

### 3.9 collapseTogglePairs (toggles.ts 39; toggle.ts)

**The question.** "Was the panel open before click 1?"

The facts already largely existed. Adding `attr aria-expanded` in each window and the kept `removed` makes the pair exact: the state before click 1 was expanded (gap and before signature), click 1 expanded→collapsed, click 2 collapsed→expanded. That is a net no-op pair whose intended end state is "expanded". Today's decision (keep click 2 as `toggle`, idempotent) stands.

The fwsi1 CSS collapse becomes visible only if the app sets aria-expanded or a class on a landmark. If it does neither, the pair stays invisible and nothing is decided (not worse than today).

### 3.10 "Carry both readings": when a recording cannot decide

The shape is a SkillStep field `readings: [primary, alternate]`, a closed set of shapes, each a small shared function in a new `src/execution/readings.ts`:

| Shape | Primary | Alternate | Run the alternate only when | Safe because |
|---|---|---|---|---|
| `press-again` (= repeatIfNoEffect) | press once | press again | no line, url or alert change AND no request started since dispatch, after min(recorded gap, 2 s) | nothing happened, so nothing was committed |
| `link-or-goto` | click the link | goto the recorded href (`linkedFrom`) | no request to the href, no url change, after `LINK_NAV_WAIT` | a GET navigation commits nothing |
| `dismiss-if-open` (existing hideBefore) | click to close | skip | the popup's lines are absent | a skip does nothing |
| `close-then-reopen` (existing closeBeforeReopen) | click the opener | close first, then click | the popup's lines are present | proven absence before continuing |

**Banking.**
- The daemon replay records which reading ran (a step-record field `reading: 1|2`). Two consecutive replays agreeing on reading 2 swap the order in the store (`decideRepin`'s channel, no model).
- The artifact cannot bank. It runs the shared function, which tries the current primary first, and logs the winner. After a store swap, the next export emits the swapped order. The daemon and the artifact therefore always run the same function over the same order: parity holds.

**Safety condition (hard).**
- A reading pair is allowed only when the primary's failure is **proven before any commit**. The proof is "no counted request started since dispatch" (the action's own traffic baseline in `beginAction`) plus an unchanged url and lines.
- A primary that can commit on success (Save, submit, delete, a toggle whose second press undoes it) is allowed only as `press-again`, and only when the recording proved the first press produced no request.
- fwec5's order (Save, then repair, then Save) must never be a reading pair. On a replay whose entry worked, the first Save commits. That case is decided by fact (§3.1 c), not by trying.
- No reading ever re-runs a fill or type. That is the fwec10 class, where a retry appended.

## 4. Would this design have prevented each failure?

"Prevented" means the fact-based rule decides correctly with no heuristic. Evidence for each case is from the n1 scripts.

| Run | Would it prevent? | Why |
|---|---|---|
| **fwgt11** (r59) | **Yes, probably**, if the close's `rm` and the label POST are captured | 90's tick is `+0 -0` today (a class change). The picker is open at 95 (the model's evals query `.ui.dropdown.active.visible`) and shut by 98's before-capture, which already contains the applied `link "bug"`. The journal records the listbox `rm` (lineage 89), the POST `/issues/labels?issue_ids=4` (which the model itself saw in turn 6: "captured live via page instrumentation") and the tick `attr`. The cause of the close may stay `unknown`, and then the replay close is policy (today's closeBeforeReopen). A second silent close (114→117) would be recorded too. |
| **fwgh12** (r57) | **Partly** | The journal records click 63 as delivered (`hit`), with no request and no url change. That settles "the app ignored it" as a fact, so rule 3.1 b keeps it with press-again. Round 57's fix reached the same decision by a proxy. It does not remove the ambiguity: both replays ignored the kept single click, so press-again is still the mechanism. Also, 62's +20 cap hid the Boom modal; `diffTotals` plus the landmark `add` would show whether the modal was up at 63. |
| **fwgh6** (r40) | **Yes** | Late `page+` with opener page 0, after 63's capture, no window since. It is credited to 63 directly. |
| **fwgh8** (r45) | **Yes** | `page+` inside eval 58's window. Crediting Publish (56) is impossible. |
| **fwsi9** (r57) | **Yes, for the recording.** The replay half was a runner fix | The recorder already credited the tab correctly (`fresh.length === 1`). The failure was replay's `armPageEffect` listening only for `popup`, fixed in 7b1c6886. The design's only addition is `opener:null, foreground:false` on the effect, so both runners know to listen on the context and that a switch follows. |
| **fwsi10** (r58) | **Recording half yes; the failure no** | Facts: the calendar was added in the fill's window after `focusin`; "15" removed only that lineage; no `val` change. So it is a pure dismissal, never required. That would have prevented the round-56 "opened" arm from making it required. But the replays' calendar was simply not open, and only the runtime skip (round 59) handles that. The design removes the regression source, not the need for the runtime rule. |
| **fwvk8** (r56) | **Login: yes. FILTERS: no** | Login: a `doc` replacement (same url, new timeOrigin) after fills 3-4 with no window; the `val` of both fields emptied (`undo`/`app`); Login 6 sent no auth request. Lines 3-6 are voided by fact. The runtime refill is still needed, because the race recurs on replay. FILTERS: the facts were already recorded (line 30's −20 and line 28's startText); the rule was missing. |
| **fwop14** (r59) | **No** | The recording was stable (the row is still in startText at 1-based line 44). The defect was the artifact judging a different moment (3e0b9bbd). No recorder change touches it. |
| **fwod81** (r54) | **Yes** | The `val` journal shows the product field go `[E-COM11] Cabinet with Doors` → `2` → restored at 82, and 80's menu removed by 81/82. That is a net-zero span, dropped whole. Today no `removed` is stored on any of those lines. |
| **fwgr69** (r56) | **No new evidence needed** | The raw diffs were exact inverses (44: −4, 45: +4). Rule 3.1 a would read `ev`/diff and not the compiled expect, but that fix (c179dbee) has already been made. |
| **fwec5** (r42) | **Yes** | Save 71 sent no POST (78 did), and a `val` shows Amount app-reset between the saves. Rule 3.1 c drops Save 1 by fact. |
| **fwec4** (r40) | **Mostly** | `val` shows Amount emptied at blur during 39's window (a cause of `in:39` with focusout from Amount). The Escape at 43 opened the leave-form dialog, and Cancel 44 cleared the date: the `val` credits 44. That lets compile drop 38 and keep 45. The second failure (a repin chain ending on the list page) is unrelated. |
| **fwec10** (r57) | **Yes, as diagnosis. The failure itself was a runner bug** | The journal would say when Amount emptied. The logged diagnosis ("choosing the account emptied Amount") is unverified: 27's removal is capped at 20, and fwec4's pattern suggests it emptied at 21. The silent wrong amount was `type` appending after `restoreStandingFills`, a runner fault already fixed. |
| **fwsi1** (r36) | **Yes for (a) and (b); maybe for (c)** | (a) The url `search=Seed%3A` changed during reads 14-17, within the debounce window after fill 13, so it is credited to 13, not 18. (b) The failed action becomes an `attempt` whose `foc` shows the select2 search field focused. Type 37's `keydown` target is that field, not the span. (c) The show/hide collapse is decided only if the app sets aria-expanded or a class. |
| **fwvk4** (r40) | **Probably** | `carries` would show which request carried the description text, and the `doc` replacement at the reload. If no request carried it, attempt 1 is abandoned by fact. The overwrite hypothesis stays unverified until a recording has the journal. |
| **fwop6 / fwop13** (r40, r58) | **Partly** | `settle.link` and `req` show whether each click asked for the href. A late Turbo nav means click 1 navigated and is kept. No request means genuinely inert, handled by the `link-or-goto` reading. |
| **fwgh14** (r59) | **Yes for provenance** | The autosave POST started in fill 26's window (title blur); the hash change is `late via req`, and the response id is `mintIds`. 02-create's mint is known without rule A's trail rule. Rule B/C's recovery shapes are only partly recorder issues (§3.7). |
| **fwod78** (r45) | **Yes** | The post-login hash filling in is a `nav` with cause `late via req` of the login (or `app`), with no mint in any response. It is not a record the step minted. |
| **fwop10 / fwgt10** (r54, r58) | **Partly** | `attr id` changes inside an eval window flag eval-authored ids directly, so compile never trusts them. Values taken only by eval stay unreplayable; the fix is to record eval results and synthesise reads, which is outside this design. |
| **fwvk1 / fwvk2** (r36, r37) | **No** | The recording was clean; the re-render happened on replay. |

**Tally.**
- Out of the six the brief names, plus the ones found, 11 are decided or mostly decided by the facts: fwgh6, fwgh8, fwsi9, fwod81, fwec5, fwsi1, fwvk8 login, fwgh14 provenance, fwod78, fwgt11 (mostly), fwec4 (mostly).
- Five are only partly helped: fwgh12, fwop6, fwop13, fwvk4, and the fwsi10 recording half.
- Five are not helped: fwop14, fwgr69, fwvk8 FILTERS, fwvk1, fwvk2.

## 5. Cost and risk

**Time.**
- Node-side listeners cost effectively nothing.
- The in-page MutationObserver costs about 1-3% CPU on heavy SPAs (Odoo and Grafana re-render a lot). Callbacks only push small records and bump counters; summarisation is lazy at the drain.
- The drain is one `evaluate` per recorded step, about 5-20 ms, merged into the existing `before` capture (the same round-trip if `observePage` returns the buffer, which is shared snapshot code).
- No wait is added to any step. Removing `LATE_POPUP_GRACE_MS` (1 s per quiet click) and `CLOSE_GRACE_MS` from recording is a small net saving.
- Recording is dominated by model turns (fwgt11's 04-set: 327 s), so overhead is under 1%.

**Size.** 1.5-2.5× on script.jsonl (§2.4). Stores and artifacts are unchanged.

**Wrong attribution, the real risk.**
1. **Concurrency.** The model's next gesture can fire before a late effect of the previous one lands. The `also` flag and "ambiguous → heuristic fallback" contain it, at the price of coverage.
2. **Timers the journal cannot see.** setTimeout chains that are neither debounce-after-input nor periodic (a toast auto-hide after 4 s, fwgt11's close). The lineage rule (`undo`) says WHAT went, not WHY. The design never turns `trigger: timer|unknown` into a gesture credit.
3. **Daemon-internal activity.** A model `snapshot` or `hover` can move focus or trigger hover menus. These must be windows (`daemon`), or they will read as app activity.
4. **Observer perturbation.** addInitScript runs before app code and could be detected by the app, for example a CSP-sensitive app or one that wraps MutationObserver. I propose no history wrapping (use `framenavigated`) and no prototype patching, to keep the footprint to one observer and event listeners.
5. **The value journal reads values by drain-time checks.** A value set and reset by script inside one drain interval is invisible. It is best-effort, and absence of a `val` is never used as proof.

**Noise.**
- Polling UIs: Odoo's longpoll (`/websocket`, `/longpolling`), Grafana's refresh and Kanboard's board refresh are classified by the existing `pageTraffic` long-lived and polling logic, and marked `app`.
- Clocks and relative times use the volatile-token masks.
- CSS animations produce class churn on non-landmark elements, which is only counted.
- Spinners and "Loading..." add/rm pairs within one window are coalesced (an add and rm of the same lineage inside one window produce no record).
- The 40-event cap per step, with `evDropped`, bounds pathological pages. **A step that overflows is treated as old (heuristic fallback).**

## 6. Parity: what must live in src/execution

The journal and the attribution are recording tools. They live in `src/daemon` (a new `journal.ts`, with the page script as a string constant beside `snapshot.ts`'s page function). They are never in the artifact. Parity is kept by these rules:

1. **Compile turns facts into SkillStep decisions.** The existing fields (`effect`, `toggle`, `repeatIfNoEffect`, `closedBefore`, `removalRequired`, `expect`) and the new `readings` are what both runners read. Neither runner reads `ev`.
2. **Every runtime judgement the new decisions need lives in `src/execution`:**
   - `readings.ts`: the reading functions (§3.10), one implementation called by `replay.ts` and embedded by `emit.ts`.
   - `pressHadNoEffect` (toggle.ts), extended with a "no request started since dispatch" argument that each runner obtains from `beginAction`'s traffic. The artifact already embeds `beginAction`.
   - `armPageEffect` (context.ts), honouring `opener:null` (it already listens on the context since round 57).
   - The "no-effect proof" constant set (latency bound, `LINK_NAV_WAIT_MS`) belongs in action.ts.
3. **Known non-shared code to fix before stage 4:** emit.ts about 2033 mirrors replay's `openerLines` guard by copy ("Mirrors replay's openerLines"). Any reading built on the opener guard must first move that guard into toggle.ts.
4. **Banking** writes only the daemon's store. The artifact runs whatever order the export compiled, through the same function.
5. **A parity test per reading shape**, in the existing harness (both runners, fixture app, primary wins; alternate wins; alternate not allowed because a request started).

## 7. Measurement without fresh sweeps

1. **Backward compatibility (stage 0 gate).** `bench/corpus-check.mjs` over the published results branches: 0 status changes. Old stores have no evidence, so every rule must take its fallback. This proves nothing about the new rules, only that they are inert without evidence.
2. **Counterfactual annotations.** For the 11 cases in §4 marked yes or mostly, write fixture recordings: the published n1 script plus hand-written `ev`/`gap`/`attempt` fields that state exactly what §4 claims the journal would have seen. `test/fixture/fwgh14-n1-script.jsonl` is the precedent. Assert that compile's fact rule reaches the right SkillSteps. Where the heuristic was the fix, assert that the fact rule agrees with it. Where the heuristic regressed (fwod81, fwgh12's r43 form, the fwsi10 "opened" arm), assert that the fact rule does not.
   - This tests the rules, not the recorder. Label these as counterfactual; they depend on §4's claims about what the journal would see.
3. **Recorder truth on fixtures.** Browser-suite fixture pages, run locally with no Docker, one per attribution rule:
   - a late `target=_blank`;
   - a Ctrl+click with noopener;
   - an eval `window.open`;
   - a picker that commits via fetch on blur (the round-60 `/labels-picker` fixture already exists);
   - a debounced search that pushes the url;
   - an autosave that rewrites the hash with a POST id (`/hashposts` exists);
   - a click ignored for 500 ms after a transition;
   - a document replaced by a service-worker reload;
   - a polling endpoint and a ticking clock (noise must be `app`);
   - two overlapping gestures (must be `also`, i.e. ambiguous).

   Drive them through `runStep` with scripted tool calls (no model) and assert the `cause` of every event. This is the real test of attribution, and the only one that can measure wrong attribution.
4. **Shadow mode on the stored corpus.** Once real recordings carry evidence, compile runs both the fact rule and the heuristic and writes their disagreements to the compile log (`evidence-vs-heuristic`). corpus-check reports the count. Each disagreement is read by hand before a rule switches from shadow to deciding.
5. **Transcript-free re-recording (optional, cloud).** Replay an old n1's recorded steps verbatim, abandoned ones included, against the reset app with the new recorder, no model. This yields real journals for real apps without model spend. It cannot reproduce failed actions, evals' focus effects, or think-time timing (the gaps would be milliseconds instead of seconds, so timer-caused events will differ). Treat it as a coverage and noise probe, not as proof.

**What a sweep must then show:**
- Evidence coverage: the share of steps with `ev` and without `evDropped` overflow.
- The share of events `unknown` and `also`: under 10% of non-app events on each app.
- Recording wall time and script size against the same app's previous round.
- Every shadow disagreement explained.
- No regression on the apps green in round 58/59.
- On the first sweep where a relevant shape recurs, the fact rule firing and holding. The recurrence is luck-dependent, which is why items 2-4 come first.

## 8. Staged plan (smallest valuable first)

**Stage 0: persist what is already computed.** Recorder only. No new observation, no compile change.
- Changes:
  - Add `seq`, `t{d,s,c}`, `settle` (the SettleVerdict minus urls of ignored requests) and `captureFailed` to RecordedStep.
  - Add `diffTotals`, and always keep `removed` (capped at 20).
  - Record failed actions as a `RecordedStep` with `failed: true` + outcome + reason (filtered out at the head of compileSkills, like screenshots).
  - Add a `t0` epoch on the instruction entry.
- Tests:
  - A recorder unit test that `commit` writes the fields.
  - `failed` steps never reach a SkillStep (compile unit).
  - Every rule that reads `removed === undefined` keeps its meaning (a toggles.ts test with removal now always present).
  - corpus-check shows 0 changes.
  - A secrets test: settle verdict urls are scrubbed.
- Value: fwop6/fwop13 get `settle.link`; fwgh12 gets `via` (forced or synthetic); `captureFailed` is no longer confused with "no effect".

**Stage 1: gap diff and page events.**
- Changes:
  - Keep the last after-signature per page in the session; store `gap` (diff of that against this step's before-signature) on the next diffed step.
  - Diff evals.
  - Attach context `page`/`close`/`dialog` and `framenavigated` listeners with timestamps for the whole session (not per step), with attribution rules 1, 2 (nav only, no network yet) and 5.
  - Compile: creditUncreditedPopups uses `page+` causes when present.
- Tests:
  - Browser fixtures: late tab, noopener, eval window.open, a picker closing between gestures (a gap `rm`).
  - Counterfactual fixtures: fwgh6, fwgh8, fwsi9, fwgt11 (gap `rm` only).
  - Parity: `opener:null` popups in both runners (exists since r57; extend with a foreground flag).
  - corpus-check shows 0 changes.
- Value: retires the popup family's guessing. Gives fwgt11 and fwec4/fwec10 a recorded "when".

**Stage 2: network journal and attribution rules 2-3 and 6.**
- Changes:
  - Session-wide request log with `carries` and `mintIds`, reusing `pageTraffic`'s classifier.
  - Debounce and lineage attribution.
  - Compile consumers in shadow mode: fwsi1 url credit, fwgh14 mint provenance, fwec5 "Save sent nothing", link clicks (§3.4), refill and reload arms' `carries`.
- Tests:
  - Fixtures: a debounced search, an autosave mint, a polling endpoint (must be `app`), a login that sends nothing on an empty submit.
  - Counterfactuals: fwsi1, fwgh14, fwec5, fwop13, fwvk4.
  - The shadow-disagreement report in corpus-check.
- Then switch per rule after the shadow read.

**Stage 3: the in-page journal.**
- Changes:
  - addInitScript: the MutationObserver summary with lineage, state attributes, `val`, `foc`, `hit`, and the drain merged into `observePage`'s round-trip.
  - Compile consumers: carriedSteps and closedBefore (§3.6), entryPopupHides and markRequiredRemovals (§3.5), the refill-arm net-zero span (§3.3), abandonedRepeatClick cases a-d (§3.1), toggle pairs (§3.9). All start in shadow mode.
- Tests:
  - Fixtures: a class-tick picker, a date picker opened by focus, contenteditable text, an overlay intercepting a click (`hit.other`), an ignored click, a CSS-only collapse (must produce no false fact).
  - A performance test: observer overhead on a 4000-node churn fixture under a budget, and the drain under 20 ms.
  - Counterfactuals: fwgt11 (full), fwod81, fwsi10, fwec4, fwec10.

**Stage 4: readings.**
- Changes:
  - `src/execution/readings.ts`: `press-again` (moving repeatIfNoEffect onto it, with the traffic proof and the latency bound), `link-or-goto`. The existing hide and close rules re-expressed as readings.
  - Banking through decideRepin.
  - First move emit's openerLines copy into toggle.ts.
- Tests:
  - A parity case per shape: primary wins, alternate wins, alternate refused because a request started.
  - The fwgh12 fixture: the first press ignored on replay, then not ignored.
  - The fwop6 fixture: the link navigates on replay and is inert in the recording.

**Stage 5: retire the heuristics.** Only after a sweep round shows shadow agreement or explained disagreements. Each heuristic stays as the fallback for evidence-less or overflowed steps. Delete nothing that old stores need.

## 9. Where this does not help (skeptical notes)

- **fwop14, fwvk1, fwvk2 and fwsi10's divergence are runtime facts.** No recording evidence reaches them.
- **fwgr69 and fwvk8's FILTERS were rule bugs over complete evidence.** More evidence adds more ways to misread, not fewer, unless the rules read the raw facts.
- **"Why the app ignored a click" is not observable.** The recording can prove that the click was delivered and that nothing followed. It cannot predict the replay app, so the readings mechanism stays.
- **Model intent is still unrecorded.** The inner model's turns are not published (the transcript is the outer orchestrator only). A mistaken-but-effective gesture (fwod81's "2") is detectable only because it was repaired. A mistake the model never repaired looks like intent.
- **Some timer causes will stay `unknown`.** fwgt11's own close may be one of them. The design then records what happened and when, which is still better than inferring it from the next diff, but the replay action for it is policy.
- **The journal makes recordings less stable to diff and larger.** Rules must never key on journal content that is volatile (hash prefixes, timings) except through the attribution result.
