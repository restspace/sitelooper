# Robustness and structural simplification review

Reviewed on 2026-09-13 against the current working tree, including the uncommitted shared-execution refactor.

This is a review and implementation handoff, not an implementation plan already authorized for execution. The user explicitly requested no code changes during the review. No source files were edited. The build, existing tests, and temporary diagnostic probes were run; this document records their results.

**Follow-up, same day:** every finding was re-checked against the source, and the false-success paths that could be closed locally were corrected. See [Verification and corrections](#verification-and-corrections) at the end. Findings 1, 2 and 3 are fixed; the query-parameter half of 3 followed on 2026-09-14. Findings 4 to 7 are confirmed and remain open; of 8, only the timing flake is fixed.

## Main assessment

The shared-execution refactor is a good foundation. The largest remaining opportunity is to make **target context, observation quality, action outcomes, and procedure semantics explicit**. Several current heuristics make unrelated application states look equivalent or turn uncertainty into success.

Sharing an implementation prevents daemon/spec divergence, but does not establish correctness: both runners can agree on the same wrong result. Improvements should therefore combine stronger shared contracts with independent behavioral tests.

## 1. Failed observations must not mean nothing was found

**Priority: high. Confirmed by a diagnostic probe.**

Location: [src/execution/loop.ts](../src/execution/loop.ts), `runFoldedLoop`.

Failed guard counts are converted to zero with `catch(() => 0)`. A probe whose guard count threw `Error('page closed')` returned:

```json
{"ok":true,"iterations":0}
```

This can report an unfinished collection as processed. The progress check also happens after executing the next body, so detecting a repeated target can happen after repeating its mutation. That ordering is visible in the source; a duplicate-mutation browser reproduction was not run.

Recommended change:

- Introduce a shared observation result distinguishing observed, absent, and unavailable.
- Make unavailable guard observations stop or trigger bounded re-observation, never establish completion.
- Resolve and compare iteration targets before executing mutations.
- Preserve the difference between a completed collection, a bounded partial traversal, and an interrupted traversal.

Acceptance evidence: a closed or navigating page cannot produce a successful drain; a repeated target is rejected before its mutation runs again; a genuinely empty, successfully observed collection still completes.

## 2. Dispatch and verified application effects need separate outcomes

**Priority: high. Confirmed with a real-browser probe.**

Location: [src/execution/browser.ts](../src/execution/browser.ts), `CLICK_TIERS` and `robustClick`.

Clicks automatically escalate from normal actionability checks to forced clicks and synthetic events. In a real-browser probe, a disabled HTML button returned:

```text
clicked (forced past actionability checks)
```

Its click handler ran zero times. This demonstrates a helper-level false success, not a reproduction of an entire flow passing: downstream effect gates may still reject the step.

Recommended change:

- Represent not dispatched, dispatched, effect verified, and outcome unknown explicitly.
- Preserve uncertainty through tool results and recovery instead of relying on error-message wording.
- Make forced or synthetic interaction an explicit policy or recognized component capability.
- Preserve disabled-state constraints and verify the intended effect.
- Permit another dispatch only when evidence establishes that repeating it is appropriate.

Acceptance evidence: disabled controls cannot be reported as effective actions; page teardown after dispatch preserves an unknown outcome without a second mutation; supported component recipes can still use alternative interactions with effect verification.

## 3. URL generalization needs semantic evidence

**Priority: high. Confirmed by direct calls to the built implementation.**

Locations: [src/execution/url.ts](../src/execution/url.ts), `urlDiff`, `urlMatches`, and `softUrlMatch`; [src/execution/gates.ts](../src/execution/gates.ts), `urlEffectVerdict`.

The URL model ignores ordinary query parameters and accepts limited path differences as volatility. The probes established:

- `https://app.test/edit?id=123` matches `https://app.test/edit?id=999`.
- Expected `https://app.test/orders/success`, actual `https://app.test/orders/failure` produces a warning and generalizes to `https://app.test/orders/:var` rather than returning a stop.

Other gates might catch these cases, but the URL gate itself cannot distinguish record identity or success from failure. A mismatch alone is not evidence that a value is volatile.

Recommended change:

- Distinguish literal route parts, bound identities, demonstrated volatile values, and deliberately ignored parameters.
- Include ordinary query parameters in the model, with explicit rules for which matter.
- Require independent evidence before generalizing a literal.
- Keep generalization proposals and validation evidence separate from the current execution verdict.

Acceptance evidence: different bound record IDs refuse a match; success and failure routes remain distinct; legitimate environment-minted values remain generalizable when supported by evidence.

## 4. Observation needs one structured model and explicit coverage

**Priority: high. Confirmed with a real-browser probe and source inspection.**

Locations: [src/daemon/refs.ts](../src/daemon/refs.ts), agent accessibility snapshots; [src/execution/snapshot.ts](../src/execution/snapshot.ts), `describeInPage`, `nameOf`, and `capturePage`.

The agent's accessibility snapshot and verification's DOM capture describe different views of the page. Verification implements its own accessible-name approximation and traverses only the current document.

The browser probe contained an ordinary `<label for>` input, a button in an open shadow root, a button in an iframe, and a disabled top-level button. Verification returned only an unnamed textbox and the top-level button. Playwright's role locator independently found the textbox by its label.

Captures also cap nodes and lines without returning completeness information. A successfully returned capture is therefore not necessarily sufficient evidence of absence.

Recommended change:

- Introduce structured observations with element identity, role, name, value, state, context, and coverage.
- Render model-facing text from that structure rather than making text lines the semantic storage format.
- Cover frames and open shadow roots consistently, and explicitly report inaccessible contexts.
- Distinguish complete searches from truncated, unavailable, and partially explored observations.
- Account explicitly for virtualized collections whose DOM contains only a subset of records.

Acceptance evidence: standard labels survive capture; embedded content can be observed and verified; truncation or partial collection coverage cannot establish global absence.

## 5. Page and frame context belong in persistent targets

**Priority: high for broader app support. Source-inspection finding.**

Locations: [src/daemon/recorder.ts](../src/daemon/recorder.ts), `LocatorCandidate` and `makeLocator`; [src/spec/emit.ts](../src/spec/emit.ts), the `tabs` action branch.

Live refs support iframe elements, but persistent locator candidates have no frame path and reconstruction starts from `Page`. The persistent model cannot express the context needed to reconstruct an in-frame target. Compiled tab switching is explicitly unsupported.

Recommended change:

- Give a target a stable page reference, frame path, scope, and locator candidates.
- Describe navigation effects explicitly: current-page navigation, popup creation, context switching, or page closure.
- Use the same context model for recording, replay, observations, and emitted execution.

This provides a coherent basis for embedded editors, payment frames, OAuth popups, and workflows spanning tabs.

Acceptance evidence: record/replay/compile an iframe action and a popup workflow; distinguish identical controls in separate contexts; fail clearly when the recorded context cannot be recovered.

## 6. Consolidate waiting around action-specific evidence

**Priority: medium-high. Source-inspection finding.**

Locations: [src/execution/browser.ts](../src/execution/browser.ts), `trackRequests` (formerly in `src/daemon/browser.ts`, which now re-exports it); [src/daemon/settle.ts](../src/daemon/settle.ts), `STREAMING_PATH`, `installRequestTracking`, and `settlePage`; [src/execution/browser.ts](../src/execution/browser.ts), `settleDom`.

Separate request trackers use different definitions of activity. Streaming detection guesses from route names such as `notifications`, `watch`, and `poll`. DOM settling uses a short quiet probe, which cannot establish that a debounced request has started or completed.

Recommended change:

- Establish one action observation context before dispatch.
- Give it a shared deadline, cancellation state, baseline observations, and expected effects.
- Use network and DOM activity as waiting evidence; use the expected state to determine completion.
- Consolidate request tracking and make long-lived traffic policy explicit.
- Apply the same completion contract to daemon and generated execution.

Acceptance evidence: delayed/debounced saves wait for their effect; long-lived streams do not stall unrelated actions; ordinary requests on paths named `notifications` or `watch` are not assumed irrelevant solely by name; deadlines bound the whole action lifecycle.

## 7. Use a canonical procedure model across subsystems

**Priority: medium. Structural recommendation supported by source inspection.**

Locations: [src/skills/compile.ts](../src/skills/compile.ts), [src/skills/store.ts](../src/skills/store.ts), [src/spec/ir.ts](../src/spec/ir.ts), and [src/spec/lower.ts](../src/spec/lower.ts).

Procedures pass through recording, skills, flow, spec IR, and generated source, then back through lift/lower for repair. Lowering reconstructs missing metadata and assigns `validated` with zero execution successes. That is an internal evidence-model concern; it does not demonstrate that the public readiness gate is bypassed.

The preservation machinery for fingerprints and recipe snapshots shows how expensive maintaining the translations is becoming. Simply splitting the largest files would leave that complexity intact.

Recommended change:

- Separate executable procedure data from learning history, validation evidence, and storage metadata.
- Make replay, compilation, and repair consume the same versioned procedure model.
- Treat recording as evidence from which a procedure is derived.
- Preserve evidence status through compilation rather than manufacturing it during lowering.
- Keep repair as explicit transformations with preconditions, contract changes, and resulting evidence.

Acceptance evidence: meaningful procedure semantics survive round trips without field-specific rescue logic; compiled-but-unexecuted procedures do not gain execution evidence; learning statistics can change without altering executable semantics.

## 8. Simplify generation and test correctness independently of parity

**Priority: medium. Structural recommendation supported by source inspection.**

Locations: [src/spec/runtime-source.ts](../src/spec/runtime-source.ts), `parseExecutionSource`; [src/spec/emit.ts](../src/spec/emit.ts), `neededHelpers`; [test/execution-parity.test.ts](../test/execution-parity.test.ts).

Runtime embedding strips imports and exports with regular expressions. Helper selection searches source text for tokens. This places hidden restrictions on ordinary TypeScript changes and creates another mechanism maintainers must understand.

Recommended change:

- Evaluate build-time bundling or AST-based generation while preserving standalone artifacts with no Sitelooper runtime dependency.
- Keep ordinary module boundaries and explicit dependencies.
- Retain parity tests, but supplement them with independent application-state assertions.
- Use small behavioral fixtures covering disabled controls, unavailable observations, query-based identity, frames, shadow DOM, delayed updates, and virtualized collections.
- Replace tight wall-clock assertions in unit tests with deterministic timing where appropriate; retain real-browser timing checks with realistic budgets.

Acceptance evidence: generated artifacts remain portable and typecheck outside the repository; normal module refactors do not require regex-specific formatting; shared incorrect behavior fails an independent correctness test even when parity holds.

## Suggested order of work

1. Close false-success paths in loop observations and action outcomes, and correct URL identity/generalization behavior.
2. Establish shared target-context and structured-observation contracts, including coverage.
3. Consolidate waiting around those contracts and add representative embedded/async application fixtures.
4. Simplify procedure representations, evidence ownership, and repair transformations.
5. Replace fragile source assembly once the execution and procedure boundaries are settled.

Avoid a wholesale rewrite. Preserve the existing shared execution modules and regression corpus while replacing one semantic boundary at a time.

## Validation performed during this review

- `npm run build`: passed.
- Default test suite: **1,295 passed, 183 skipped, 1 failed**; 61 test files passed, 5 skipped, 1 failed.
- The failure was `test/tools.test.ts`, `urlHeldStill > returns as soon as a non-navigating click has no request in flight`: elapsed time was 91 ms against a limit of 60 ms.
- Isolated rerun of `test/tools.test.ts`: all six tests passed. This is consistent with a load-sensitive timing assertion; it is not proof that the complete suite is clean.
- Focused diagnostic probes reproduced failed-loop-observation success, query identity equivalence, and success/failure route generalization.
- Focused Chromium probes reproduced incomplete verification captures and a disabled-button click report with no handler invocation.
- The full browser-gated suite was **not** run during this review.

The source references describe the working tree reviewed on the date above. Existing uncommitted changes belong to the prior work; they were not introduced by this review.

## Verification and corrections

Each finding was checked against the source before anything was changed. All eight hold. One location was stale: the request tracker cited in finding 6 had moved to `src/execution/browser.ts`, and that citation is corrected above. Nothing is committed.

### 1. Failed loop observations — confirmed, fixed

**Confirmed.** `runFoldedLoop` caught every guard count with `catch(() => 0)`, and replay's guard hook did the same. An unreadable page therefore produced the loop's normal exit.

The review said the duplicate mutation was not reproduced in a browser. The parity harness already reproduced it: "a loop body target that is unique on the second pass" pinned both runners marking `Item 2` **twice** before the progress guard fired.

**Changed** in `src/execution/loop.ts`, shared by both runners:

- **Unreadable counts (rule 6).** A count that throws is no longer read as zero. The same goes for an empty answer from a page that cannot be evaluated at all: `pageReadable`, a new required `readable` hook.
  - Such an observation is settled and taken once more, which covers a navigation in flight.
  - If it is still unreadable, the loop stops with "whether records remain is unknown, so the loop is not finished".
  - The rule covers the first count, the recount after each pass, and the final drain count.
  - A guard read successfully as empty still completes the loop.
- **Progress guard before the action (rule 4).**
  - `runBody` now receives a `LoopPass`, and runners append what each target resolved to into it.
  - Replay calls `pass.check()` once a step's targets are resolved and before dispatch.
  - The artifact calls it inside `resolveTarget`, before the target is acted on.
  - A repeat throws `LoopRepeated`, and the loop turns that into its stop. A body that never asks is still judged when it finishes.
- **Tests.**
  - Unit tests cover: a throwing count, a count that fails once and recovers, a failing recount, an unreadable page, a genuinely empty page, and a repeat stopped before its action.
  - The parity case now expects one `mark:Item 2` in both runners.

**Not done.** `LoopOutcome` still reports a bounded partial traversal as `ok: true`, with no separate "partial" state. That is the recommendation's fourth bullet; it changes the result contract for callers and is left for the observation-model work.

### 2. Dispatch versus effect — confirmed, the disabled-control false success fixed

**Confirmed.** `robustClick` escalated from Playwright's click to a forced click. The browser suppresses clicks on a disabled button, so the forced tier returned "clicked (forced past actionability checks)" for a click that did nothing.

**Changed** in `src/execution/browser.ts`, shared by both runners:

- Once Playwright's own click has failed, `robustClick` asks `isDisabled()`, with a 500 ms probe.
- A disabled control throws "click NOT dispatched: the control is disabled", and no forced or synthetic tier runs.
- An ordinary click never pays for the probe. A control whose state cannot be read goes on down the tiers as before.

**Tests.**
- Unit tests cover the refusal, both click kinds, and the case where the probe is never asked.
- A parity case (`/gate/disabled`) shows both runners stop with an empty mutation log. Its control, `/gate/enabled`, marks once in each.

**Not done.** The not-dispatched / dispatched / effect-verified / unknown result type is still expressed through error wording. Forced and synthetic tiers remain automatic for enabled controls rather than an explicit policy.

### 3. URL generalisation — confirmed and fixed

**Confirmed.** `softUrlMatch` generalised any one or two disagreeing literal segments. `/orders/success` against `/orders/failure` warned and continued. `urlShapeOf` drops the query string, and `compile.ts`'s `urlPattern` drops it when recording, so no stored pattern carries one.

A third case the review did not name was also generalised: a segment filled from a parameter. If the caller asked for record `{{v1}}=42` and the browser was on 43, that was "volatile", and `:var` replaced the marker.

**Changed** in `src/execution/url.ts`, used by both runners' URL effect and precondition gates. A disagreement is soft only when both hold:

1. **Both values look minted** (`mintedShape`): a token with a digit, or with no `-`/`_` either twelve or more characters or eight or more hex digits.
   - The rule is the generous arm of `shape.ts`'s `generatedToken`, restated because an embedded module may import nothing. It is allowlisted in `test/shape-gate.test.ts`.
   - `rec-1`→`rec-2`, Grafana uids and Odoo action ids stay soft. `edit`→`view` and `success`→`failure` stop.
2. **The recorded segment carries no parameter marker**, `{{vN}}` or a bound `{{dN}}`.

**Tests.**
- Existing unit pins that used word segments (`abc`→`xyz`, `a/b`→`x/y`, `edit`→`view`) now use minted values, and new cases assert that word routes and parameter-filled segments stop.
- A parity case (`/checkout/failure` → `/outcome/failure` against a recorded `/outcome/success`) shows both runners stop before Mark; the success control marks once in each.
- `test/spec-dx.test.ts` depended on the old behaviour: its second concurrent run started on a data URL whose page body differed. Its fixture now differs by a run id in the fragment.

**Query identity, fixed 2026-09-14.** The query is now part of `UrlShape` and of a recorded pattern.
- **Recording** (`compile.ts` `urlPattern`):
  - Query pairs are sorted and reduced by the same reducer as path segments and hash-state values: a slot becomes its marker, and a digit-dominant value becomes `:id`.
  - Tracking and cache-buster keys (`utm_*`, `fbclid`, `gclid`, `msclkid`, `_`, `_t`, `cb`) are dropped.
  - A credential-named key keeps its key and stores `:var`, never the value, because patterns are persisted and embedded in artifacts.
- **Matching** (`url.ts` `urlDiff`):
  - Pairs present in both URLs must agree. A disagreement is a segment diff and follows the minted-shape and marker rules above.
  - A key present on only one side is ignored, unless the pattern fills it from a bound value; then its absence means a different page.
  - The published recordings show why one-sided keys must be ignored: Grafana adds and drops `refresh=1m` on the same dashboard, and a stored pattern from before this change carries no query at all.
- **Template identity is unchanged.** Segment seams, the recorder's seam fingerprint, a flow step's `route` and the sitemap all pass `query: false`, so recordings split exactly as before.
- **Messages** (`gates.ts` `describeUrl`): a live URL shows only the query keys the judged pattern names, with credentials masked. Other query pairs still never appear.
- **Consequence:**
  - `edit?id={{v1}}` refuses `edit?id=999`, and `?status=success` refuses `?status=failure`.
  - Kanboard's `?controller=…&action=…` routes are now distinct pages instead of all reading as `/`.
  - A recorded `edit?id=123` with no caller value becomes `edit?id=:id` and still matches any id, exactly as `/edit/123` does. Identity comes from slots, not from the URL shape.
- **Not changed:** `urlParts` does not yet label query values, so a value minted in the query is not re-extracted as a derived value.
- **Tests:**
  - Unit cases in `test/execution-gates.test.ts` and `test/skills.test.ts`.
  - A parity case: `/checkout-q/failure` lands on `/outcome?result=failure` against a recorded `?result=success`. Both runners stop before Mark, and the success control marks once in each.

### 4 to 7 — confirmed by source inspection, not changed

- **4. Snapshot model.**
  - `describeInPage` names elements from `aria-labelledby`, `aria-label`, `alt`, `title`, `placeholder`, an enclosing `<label>`, and short inner text. It has no `<label for>`/`el.labels`.
  - It reads only `document.querySelectorAll('*')`, with no frames or shadow roots.
  - It truncates at `maxNodes`/`maxLines` without saying so, and records no disabled state.
  - It was not patched in place: recorded effects and signatures are lines in this dialect. A better name for a labelled input would make every stored recording of that input disagree with the live page, so it has to come with the structured model and a migration.
- **5. Frame and page context.** `LocatorCandidate` has no frame path, `makeLocator` starts from `Page`, and a tab switch is an `unsupported-capability` diagnostic in the emitter.
- **6. Waiting.**
  - Two trackers still count activity differently: `execution/browser.ts` `trackRequests` and `daemon/settle.ts` `installRequestTracking`.
  - `STREAMING_PATH` still excludes paths by name (`notifications`, `watch`, `poll`, …).
- **7. Procedure model.** `lower.ts` still assigns `status: 'validated'` with `successes: 0`, and says so in its header comment. As the review notes, this is about how evidence is recorded, not a bypass of the readiness gate.

### 8. Generation and independent tests — confirmed; the timing flake fixed

**Confirmed.**
- `runtime-source.ts` still strips `import`/`export` with regular expressions.
- `neededHelpers` still selects helpers by token.

**Changed.**
- The load-sensitive `urlHeldStill` test now counts polls, not milliseconds. It asserts one check with `graceMs: 0` instead of `< 60 ms`.
- The new parity cases assert the application's mutation log (nothing marked on the failure page, nothing approved), not only that the two runners agree. That is the independent-oracle pattern the finding asks for, applied to the fixed paths.

### Validation after the corrections

- `npm run build`: passed.
- Default suite: 62 files passed, 5 skipped, 0 failed.
- New parity cases, run on their own: 3 of 3 passed. These are the disabled control, the word route, and the progress guard before action.
- Full browser-gated suite, run serially: parity 65 of 65; every other file 66 files, 1430 tests, 0 failed.
- After the query-identity fix (2026-09-14): build passes; default suite 62 files passed, 0 failed; parity 66 of 66; every other browser file 66 files, 1431 tests, 0 failed.

### 4, and the partial loop left over from 1 — structured observation, changed (2026-09-14)

**Re-checked before changing anything.** Every source claim in finding 4 held: `describeInPage` had no `<label for>`, walked only `document.querySelectorAll('*')`, cut at `maxNodes`/`maxLines` silently, and kept no disabled state. The planning notes were right about where recorded lines persist (recording `StepDiff`, `RecordedInstruction.startText`, `StepExpectation.addedContains`/`alertContains`, the spec IR and the emitted `FLOW`) and about every absence consumer. Two corrections to them:
- Dialect-2 text is **not** a superset of dialect-1 text. An input inside its own `<label>` was named from the label's whole `textContent`, a select's options included; dialect 2 leaves the control's own subtree out. The options remain visible as their own `option` lines.
- `spec/repair.ts:310` folds locators, not expectations. The per-step tag is still the right place (a re-record replaces single steps), but not for the reason the notes gave.

**Changed.**
- **One structured observation** (`src/execution/snapshot.ts`, embedded in artifacts):
  - `observePage` walks the main document, its open shadow roots (own budget, `SHADOW_LIMITS`) and every rendered child frame (up to `MAX_FRAMES`, in what is left of the 2 s deadline, at least 500 ms). Cross-origin frames are evaluated too.
  - Each node carries role, both names, value, checked, disabled and context (frame path, shadow hosts).
  - Coverage records element/line/alert caps, shadow roots walked, frames observed/hidden/over cap/inaccessible with a reason, and collections that say they are only partly rendered (`aria-rowcount`, `aria-setsize`, `aria-busy`).
  - A hidden frame is not a gap. A closed shadow root cannot be seen and is not counted.
- **Line dialects.** Dialect 1 (`renderLines(o, 1)`) is the old capture byte for byte. Dialect 2 adds `<label>` names, ` [disabled]`, and shadow and frame content; context never appears in line text.
  - New recordings are dialect 2: `StepDiff.dialect: 2`, compiled onto `StepExpectation.lineDialect`, carried through the IR and `FLOW`. Absent means 1.
  - Replay renders the executor's in-memory before/after observations in the step's dialect. The artifact passes the dialect to `capturePageLines`/`captureLines`/`liveAlerts`/`presentOnPage`.
  - A dialect-1 step emits exactly what it did before. No `SKILL_CONTRACT` bump.
- **Three-way presence** (`presence`, `confirmPresence`): `absent` only on a complete look, otherwise `unknown`. At each absence consumer:
  - `expectedChangesVerdict`: a missing effect on an incomplete look still stops, marked unobserved, with the reason. A recorded dialog is treated as absent only on a complete look, otherwise it is an unobserved stop.
  - Identity (both runners): `unknown` sweeps once, then refuses as "could not confirm … (capture incomplete: …)". It is marked unobserved and is **not** `wrongRecord`.
  - Toggle skip: only a match skips.
  - `goalSatisfied` / `satisfied`: dialect 2, and an incomplete look is never satisfied.
  - `alertVerdict(before, after, ctx, afterComplete)`: with an incomplete after-look, "nothing raised" and "expected alert missing" are unobserved. An alert that was seen still stops.
  - `describeChange.nothingChanged` requires both looks complete. The text says "no visible change in what could be observed (capture incomplete: …)".
  - Compile derives no goal from a start text that was cut at 8,000 characters or incompletely captured (`RecordedInstruction.startTextComplete: false`).
- **Contract.** `expectationLoss` compares page lines only within one dialect. Across dialects, only a step that asserts no page change any more has lost something.
- **Partial loops (finding 1's fourth bullet).** `LoopOutcome` is `complete`, `partial` (`remaining`, `reason`) or `ok: false`.
  - A bounded loop that used its passes with records still matching is `partial` (`remaining: null` when the recount fails).
  - A drain that runs out of rendered matches while the new `coverage` hook reports a partly rendered collection is `partial`.
  - Replay writes `loop ×N (partial: …)` plus a warning. The artifact logs `[sitelooper partial] …`. Neither stops.

**Deviations from the plan, and why.**
- **Separate alert completeness.** `coverageComplete` does not include the alert cap, and `alertsComplete` is separate: a toast cap says nothing about whether a line is absent.
- **No `addedComplete`.** Every absence is decided by the live look, and a diff hit is positive evidence.
- **`noVisibleChange` for the reaction wait.** `tools.ts` waits on `noVisibleChange` (new), not `nothingChanged`. Otherwise incomplete pages would lose the first-mutation wait.
- **Scrubbed observations.** The executor's observations are scrubbed of secrets like the diff, because replay renders alert text from them into stop reasons.
- **Frame limits.** Frame visibility is checked for at most 30 frames; the rest count as over cap. A zero-area frame counts as hidden.
- **No `Frame` type.** Frames are typed `ReturnType<Page['mainFrame']>`: an artifact imports only `Page`/`Locator`.
- **Collection evidence scope.** It is read in documents and frames, not inside shadow roots.

**Not done.**
- The agent's accessibility snapshot (`daemon/refs.ts`) is still a separate view; it is not rendered from this model.
- The dialect-2 name is still not Playwright's accessible name.
- Closed shadow roots are invisible.
- `identityOf` still mints identity markers from an incomplete start text. A truncated start text can only produce FEWER markers (a weaker identity gate), which is pre-existing.
- `PARITY_GAPS.md` was not updated.
- Risk: pages that routinely hit the line cap or carry virtualised grids will show more unobserved warnings, and fewer steps will validate there. That is the intended direction, never a new pass.

**Tests.**
- **Unit:**
  - `test/execution-snapshot-render.test.ts`: rendering in both dialects, coverage, presence/confirmPresence, and the line regexes on dialect-2 lines.
  - Incomplete-look cases in `execution-expect`, `execution-gates` (alertVerdict, liveAlertsObserved), `execution-loop` (four partial cases), `compile-goal` (cut start text, dialect carried), `contract`, `diff`, `identity` (unconfirmed identity) and `replay-goal`.
  - Stubbed pages now answer with structured documents (`test/fixture/observation.ts`).
- **Browser:** `test/observation.browser.test.ts` with fixture routes `/observe`, `/observe/frame/*`, `/observe/stuck`, `/embed/*`.
  - Dialect 1 against the old `describeInPage` kept verbatim as an oracle, on 17 fixture pages (past both caps included) and after state changes.
  - Dialect 2 sees the label, disabled states, shadow button and labelledby, same- and cross-origin frame buttons, not the hidden frame, and the partial grid.
  - The element and line caps give `unknown`.
  - A visible frame that never answers is recorded as inaccessible.
- **Parity (new):**
  - An untagged step `- textbox "": {{v1}}` on a `<label for>` input passes in both runners and marks once. The same step written `"Email"` without a tag stops both with an empty log.
  - A dialect-2 effect inside an iframe marks once in both. When it does not appear, both stop with an empty log.

**Validation (2026-09-14).**
- `npm run build`: passed.
- Default suite: 64 files passed, 6 skipped; 1355 tests passed, 196 skipped, 0 failed.
- Browser-gated suite without parity, run serially in three chunks: 69 files, 1481 tests, 0 failed.
- Parity, targeted only:
  - The two new cases: 2 of 2 passed.
  - Existing cases that pin changed behaviour (loops, identity, goal, alert gate, content expectations and dialogs, toggles, plain effects, two-step bodies): 21 of 21 passed.
  - The whole parity file was not run.

### 5. Frame and page context — changed (2026-09-14)

**Re-checked before changing anything.** Every source claim in finding 5 held. The planning notes' locations had moved with phase 1, but their substance had not: refs.ts `resolveTarget` is now near `:229`, recorder.ts `verifiedChain` near `:1068`, and emit.ts's `tabs` branch near `:1640`.
- **Frames.** A live `@f1e2` ref reaches into the iframe, but `verifiedChain` verified every candidate with `makeLocator(page, …)`. An in-frame element never verified, so its chain fell to a frame-local css path and no frame was recorded.
- **Tabs.** `BrowserSession.adoptPage` made a new tab active and the recorder did not notice. Replay pinned its page (`withPinnedPage`), so steps after a popup ran against the opener.
- **Artifact.** It reported a tab switch as `unsupported-capability`.
- **Observation.** Phase 1's observation already walks frames, so recorded effects and identity markers inside a frame were visible. Nothing about observation was duplicated. What was missing was where an ACTION's target lives.

**The contract mechanism, checked first.**
- `isVerified` compares a procedure's own `contract` with its `stats.verifiedContract`, never with `SKILL_CONTRACT`.
- `contractVerdict` refuses a procedure whose contract is above `SKILL_CONTRACT`.
- So `SKILL_CONTRACT` is now 3, the highest this build reads. A procedure is stamped `contractFor(steps)`: 3 only when a step (loop bodies included) carries `contexts`, `page`, `effect` or `whileContext`, and 2 otherwise.
- Every stored procedure keeps its stamp and its verified status.
- A contract-2 build refuses a contract-3 procedure outright, instead of resolving its in-frame target on the main page.
- The same gate applies to compiled files. A spec carrying context is `version: 2`, and a build that lifts only version 1 refuses it rather than lowering it into procedures it would run page-rooted.
- Replay also refuses a procedure whose steps carry context under a lower stamp (a hand edit or a merge).
- A build older than the contract field is not protected. That was already true.

**Changed.**
- **Shared model** (`src/execution/context.ts`, embedded; imports `url.ts` only):
  - `FramePath` gives ranked selectors per hop.
  - `rootFor` polls the path and returns `{ error, missing }` on failure, never the main page.
  - `PageEffect` and `stepEffect` describe what a step does to its page.
  - `pageIndexVerdict` and `armPageEffect` take the popup listener and the opener BEFORE dispatch, then ask where the procedure continues.
- **Recording** (`recorder.ts`, `tools.ts`):
  - An element in a frame is described against its frame (`targetRoot`, `framePathOf`). Each hop keeps only selectors that match exactly that iframe.
  - A positional `nth` selector is kept only with the frame's url pattern. No point candidate is recorded in a frame.
  - A frame that cannot be named records no chain, so replay stops instead of guessing on the page.
  - `runStep` records `page` only when more than one page was open.
  - It records `effect`:
    - `popup`: listener attached before dispatch, backed by an opener check.
    - `close`: a page with an opener gets 500 ms to close.
    - `switch`: from `tabs`.
  - It also records `afterUrl` and a fingerprint of the page the procedure continues on.
  - A step that closed its page is not `captureFailed`.
- **Compile:**
  - `contexts[key] = { frame }`, `page` and `effect` are copied. A popup's url becomes `effect.urlPattern`.
  - A popup, close or switch is a segment seam, gated on the continuing page.
  - Steps in different frames or pages, or any step with an effect:
    - never fold into a loop (a framed guard gets `whileContext`);
    - never coalesce;
    - never merge as the same procedure (`sameProcedure`, and `samePageContexts` in the twin merge).
- **Replay:**
  - `page` follows effects through `ReplayOptions.follow` and `BrowserSession.repin`.
  - `withPinnedPage` leaves the page the pin ended on active, so a chain's next segment starts there. A step without an effect still keeps the pin (the stray-tab test still passes).
  - Targets resolve through `rootFor`, then `resolveChain(…, root)`.
  - A missing frame is a stop, with no navigation fallback and no absent-dialog skip.
  - An absence wait in a missing frame is met. A read there is skipped. The loop guard throws (unreadable).
- **Artifact:**
  - Chains in a frame resolve on `frameRoot` / `rootN` observations. `pageGate` checks the page.
  - `armPageEffect` is inserted after the pick and before the action. Then `landed` runs, and `page = run.page = movedN`.
  - Every step body starts from `run.page`. That text is emitted only in flows with an effect, so other generated files are byte-identical.
  - The `tabs` branch follows the switch, and its `unsupported-capability` diagnostic is gone.
- **Guards elsewhere:**
  - `contractWeakening` reports a dropped or changed frame, a dropped effect and a dropped page check.
  - `lift` validates `contexts`, `whileContext`, `page` and `effect`.
  - Spec repair refuses to fold a variant located in another frame.
  - `patchSegment` refuses an in-frame target, because its proposal would be asked of and verified on the page.

**Deviations from the plan, and why.**
- **`page` only in a multi-page context.** Writing it on every step would make every new recording contract 3. It would also add an index check that stops a replay in a session that happens to have another tab open.
- **Legacy `tabs` switches are followed by both runners** (`stepEffect`). A contract-2 procedure with a tab switch used to stay pinned in replay and be refused by the artifact. Following it is what the recording did.
- **`effect.urlPattern` is informational.** The next segment's url precondition is the gate.
- **Shared `armPageEffect` / `pageIndexVerdict`.** The plan wrote the popup, close and switch waits into each runner. They are one function, so the two runners cannot drift.
- **The renamed fixture.** `/frames/renamed` is also served at `/frames?renamed=1`, and its frame is retitled AND moved (`/frames/moved`).
  - A different path would be refused by the url precondition before the frame lookup.
  - A kept `src` would still name the frame through `iframe[src*=…]`.
- **Error wording.** A frame or effect stop says `recorded frame iframe[title="Payment"] not found (tried: …)` in both runners. The location prefix differs (`step N` against `<stepId> <segment>/<index>`), as it already did.

**Not done.**
- Point candidates inside frames.
- Slotting frame titles or urls. A frame retitled per record fails closed.
- Shadow-root scope as a context.
- Downloads.
- Read-back synthesis (`captureReadBack`) and raw css targets are still main-frame only.
- `patchSegment` cannot repair an in-frame target.
- The page index compares positions in `context.pages()`. A replay session that opened extra tabs before the procedure therefore stops on a multi-page step.
- `PARITY_GAPS.md` was not updated.

**Tests.**
- **Unit:**
  - `test/execution-context.test.ts`:
    - `rootFor`: selector order, hops, nth with url, polling, and the exact missing and ambiguous messages.
    - `describeFramePath` and `framesEqual`.
    - Effects: the listener armed before dispatch, a missing popup, close, switch, and the page index.
  - `test/compile-context.test.ts`:
    - A frame goes into contexts and makes the procedure contract 3.
    - A plain recording stays contract 2 and still verified.
    - No fold across frames and no merge of the page's Save with the frame's.
    - Popup and close are seams.
  - `contract`: frame, effect and page loss.
  - `spec-lift`: round trip, and six malformed shapes refused.
  - `spec-lower`: fields kept, contract 3, version 2 on the way back.
  - `execution-resolve-emit`: the frame root, the arm between pick and click, and the page gate.
  - `execution-source`: `context` embedded and typechecked, dependency `url`.
  - `execution-loop`: the tab switch is followed. Its compileFlow blocker case now uses an unsupported read.
- **Browser** (`test/replay.test.ts`; fixture routes `/frames`, `/frames/inner`, `/frames/renamed`, `/opener`, `/popup/child`):
  - The in-frame Save is recorded with `iframe[title="Payment"]` and no point. Replay logs `frame-save`, never `note`.
  - On the renamed page, replay stops naming the frame, with an empty log.
  - Popup, close, then After are recorded as three segments: `popup`; `page 1` + `close`; the opener. Replay logs `approve, after` and ends on the opener with one page open.
- **Parity (new):**
  - "both runners press the in-frame Save, not the identical main-page one". Both also stop with an empty log when the frame is gone.
  - "both runners follow a recorded popup and return to the opener".

**Validation (2026-09-14).**
- `npm run build`: passed.
- Default suite: 66 files passed, 6 skipped; 1389 tests passed, 201 skipped, 0 failed.
- Browser-gated suite without parity, run serially in three chunks: 70 files, 1511 tests, 0 failed.
- Parity, targeted only:
  - The two new cases: 2 of 2 passed.
  - Existing cases on changed paths (drain loop, progress guard, absence wait, text held elsewhere, absent dialog, navigation fallback, iframe effect): 7 of 7 passed.
  - The whole parity file was not run.

### 6, and the rest of 2 — one action observation, explicit outcomes, changed (2026-09-14)

**Re-checked before changing anything.**
- Finding 6 held:
  - `execution/browser.ts` `trackRequests` counted every request type from page adoption. The artifact installed it only in its first `settle`, after step 1 had already dispatched.
  - `daemon/settle.ts` kept a second, fetch/XHR-only tracker that dropped paths by name (`STREAMING_PATH`).
- The rest of finding 2 held too:
  - Outcomes existed only as wording ("NOT dispatched", "outcome UNKNOWN"), and nothing in `src` read them.
  - `navigateToDestination` fell through from a substitute-link click that threw to a direct `goto`.

**Changed.**
- **Outcome vocabulary** (`execution/browser.ts`):
  - `ActionOutcome`: `not-dispatched`, `dispatched`, `effect-verified` or `unknown`.
  - `actionFailure` tags an error with `actionOutcome` and `actionReason`.
  - `outcomeOfError` reads the tag; an untagged error is `unknown`. `outcomeLabel` renders it.
  - `robustClick` and `fireWhenAttached` tag every throw. Disabled, strict, never-attached, rerender and deadline are `not-dispatched`; teardown is `unknown`.
  - Message text is unchanged, except for the new deadline refusal.
- **Deadline clamping.**
  - Given an observation, each click tier's timeout is `min(timeout, remaining)`.
  - A deadline spent before a tier starts is `not-dispatched`/`deadline`.
  - The synthetic tier now passes its timeout to `locator.evaluate`.
- **One action observation** (`execution/action.ts`, a new embedded module that imports `browser.ts` only):
  - `pageTraffic` is installed once per page and replaces both trackers.
  - `classifyLongLived` decides by behaviour only. A request is long-lived when it has:
    - a stream transport;
    - a streaming content type;
    - a body still streaming more than 1s after its headers;
    - been open since more than 300ms before the action;
    - gone unanswered for more than 5s (fetch/XHR);
    - an endpoint already learned from one of these behaviours.
  - `beginAction` and `settle` share one deadline. `settle` waits, in order:
    1. for the DOM to go quiet;
    2. for ordinary requests, within one 2s budget;
    3. through a 250ms start grace after a mutation or finish (and after the dispatch, for inputs);
    4. for `urlHeldStill`, on navigating tools;
    5. for the expectation, polled up to 3s.
  - `inFlightRequests` is now the traffic's ordinary-request count.
- **Daemon.**
  - `adoptPage` installs `pageTraffic`.
  - `settle.ts` lost its tracker and `STREAMING_PATH`. `settlePage` is a 2s observation.
  - `tools.ts runStep` begins an observation before every state-changing tool, not only in learning mode:
    - it threads the observation to `robustClick`;
    - it captures the diff after `obs.settle()`, with no `settledSignature`/`urlHeldStill` of its own;
    - `stateDiff` does not settle again.
  - `ToolExecution.outcome` is new. A failed state-changing tool's result ends with `[outcome: …]`.
  - `executeTool` takes an optional `{ deadlineMs }`.
- **Replay.**
  - `StepExecutor` takes a fifth argument carrying `effectExpectation`: the step's `{{vN}}` lines (`expect.ts`).
  - New fields: `StepRunResult.outcome`/`settled` and `ReplayResult.outcome`.
  - When a mutating step's error proves `not-dispatched`, `acted` is restored to its value before the step. A first-step refusal therefore lets the next candidate run; `unknown` keeps `acted` set.
  - The reason ends with `[outcome: …]`.
  - The settle phase does nothing after a settled step.
- **Recovery.**
  - `navigateToDestination` returns `{ unknown: true, note }` when rung (a)'s click threw anything but a proven `not-dispatched`.
  - Replay then stops with `acted` kept, and the artifact's `pickOrNavigate` throws. Neither runs the `goto`.
- **Artifact.**
  - Every state-changing call becomes `obsN = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating?, graceFromDispatch?, expect? })`, then `await <call>.catch(actionFailed);`.
  - Clicks pass `{ obs: obsN }`.
  - The settle phase is `if (obsN) await obsN.settle(); else if (page.url() !== urlBeforeN) await settle(page);`.
  - `settleNavigation` is gone. `settle` installs `pageTraffic`, and `runFlow` installs it before the start url.
  - A stopped `StepActionResult` carries an optional `outcome`.

**Timing defaults changed.**
- **Whole-action deadline:**
  - daemon `ACTION_DEADLINE_MS` is 30s (a click could spend 3×10s + 10s ≈ 40s before);
  - artifact is 25s (before: 3×5s + 5s, plus unbounded settles).
- **Network wait:**
  - counts fetch, XHR, document and script. Before, the url wait counted all types and the diff counted fetch/XHR.
  - one 2s budget per action, the same as settlePage's 2s.
- **New 250ms start grace:**
  - after a mutation or a request finish (usually already spent inside the 250ms DOM quiet);
  - from the dispatch for fill, type, press, select and check. A fill in replay now costs about 250ms instead of about 60ms.
- **After a request lands with no DOM change,** up to 250ms more for a follow-up request.
- **Expected effect:** polled for up to 3s, only on steps with `{{vN}}` lines, and only while it does not yet hold.
- **Faster in two cases:**
  - `urlHeldStill` no longer waits the full 1.5s on pages with images or SSE in flight.
  - A click with a synchronous effect settles once instead of twice (runStep and stateDiff), about 60ms faster.
- **Slower in one:** a never-answered request the action started now costs the 2s cap once. Before, it was dropped at once when its path looked like `poll` or `notifications`.

**Deviations, and why.**
- **The vocabulary lives in `browser.ts`, not `action.ts`.** `action.ts` needs `browser.ts` (`domQuiet`, `urlHeldStill`), and embedded modules cannot import each other in a cycle.
- **`robustClick` still returns its string.** The tier is reported through `obs.dispatched(via)`, so no result text changed.
- **The expectation excludes the url.**
  - Both url gates already wait on the url.
  - A url they accept as volatile would never match strictly, so every such step would pay the full effect window.
- **The start grace runs from the dispatch only for inputs.** On every click it would add about 190ms per action.
- **The `[outcome: …]` label is appended, not prefixed, in both runners.** Reasons read as before and still match across runners.
- **The artifact's observation begins at the action site** (after the pick and the popup arm), not in `prepare`. This matches the daemon, where resolution happens before `runStep`.
- **`.catch(actionFailed)` on the call, not a `try` block.** Step bodies gain no nesting.
- **Policy details.** `TrafficPolicy` gained `recentMs`. Endpoints are learned only from streaming, streaming-body and open-too-long behaviour.

**Not done, and risks.**
- Forced and synthetic tiers are still automatic for enabled controls; there is no explicit policy.
- Non-click Playwright errors (fill, check and press timeouts) are untagged, so they read as `unknown`. That errs on the safe side.
- A save endpoint that once goes unanswered for more than 5s is learned as a long-poll for that page.
- Websockets have no request events after the upgrade.
- Counting scripts and documents may add up to 2s on chunk-loading SPAs.
- `PARITY_GAPS.md` was not updated.

**Tests.**
- **Unit:**
  - `test/execution-action.test.ts`: 26 tests on a discrete-event fake clock, page and DOM. Covers the classification table (including `/api/notifications`), traffic, grace, streams, baseline, the network cap, the deadline, expectation outcomes, `failed` and `cancel`.
  - `test/execution-browser.test.ts`: outcome tags and clamping.
  - `test/execution-recover.test.ts`: an unknown click never calls `goto`.
  - `execution-lifecycle`: first-step `acted`.
  - Emit, source and diagnostics pins updated. `action` is in `EXECUTION_MODULES`, with closure and token pins.
- **Browser:**
  - `test/action.browser.test.ts`, with fixture routes `/debounce`, `/live`, `/notify` and `/slowclick`. It asserts the server log and the rendered page.
  - `test/settle.test.ts` moved to `pageTraffic`.
- **Parity (new or changed):**
  - The disabled-control case now asserts `not-dispatched` in both runners.
  - New: "both runners wait for a debounced save beside an open event stream, and save once". Replay is `effect-verified`, and both logs read `feed:open, save:Draft B`.

**Validation (2026-09-14).**
- `npm run build`: passed.
- Default suite: 1422 passed, 208 skipped, 1 failed. The failure was `cli-acceptance` "compiles a portable bundle", which hit its 5s timeout under load; the file passed 8/8 on its own.
- Browser-gated suite without parity, run serially in six chunks: 73 files, 1551 tests, 0 failed (583s wall).
- Parity, targeted only:
  - The two cases: 2 of 2 passed.
  - Sampled existing cases: 12 of 12 passed. These were the back url gate, drain loop, alert gate, both navigation-fallback rungs, word route, popup, rejected create, both redirect bindings, number input and two-step body stop.
  - The whole parity file was not run.

### Unrecorded alerts are reported; the step's state evidence decides (2026-09-14)

**Found by** the grafana compiled check fwgr34 on 5ea79a0: all three runs stopped at `01-open s_93ccd2/3` ("Skip" on the change-password screen) with "raised an alert the recording never saw: Error loading RSS feed". The home page's News panel cannot reach its feed on an offline box. The recording's after-look came before the panel failed; the new waiting (finding 6) now waits for the page's own requests, so the alert was on screen when the gate looked. The step itself had worked.

**The rule before:** any alert the recording never saw stopped a state-changing step. An alert alone cannot say whether it is the app refusing the step or ambient page content, so the gate's outcome depended on timing.

**Changed** (`gates.ts` `alertVerdict`, `expect.ts` `ChangeVerdict.confirmed`, both runners):
- An unrecorded alert is always reported.
- It stops the step only when the step's recorded page changes did not confirm it worked. `confirmed` means every recorded group appeared in what the action added (the diff), not merely on the live page, and a positional fill proven only by its own echo confirms nothing.
- The alert gate now runs after the page-change gate in both runners (`STEP_GATES`, emitted `verify`).
- A step with nothing recorded to confirm it still stops on the alert: it is the only evidence (parity G01, the rejected Mark that would otherwise go on to Remove). A recorded alert (`alertContains`) is still what the step is expected to raise.

**Tests.** Unit: `alertVerdict` with `effectConfirmed`; `expectedChangesVerdict` confirms only on diff evidence. Parity G01b (`/ambient` fixture): an alert beside a confirmed "Marked Item 1" is warned and both runners mark again; the same step refused stops at the page-change gate with an empty log; with nothing recorded it stops on the alert.
