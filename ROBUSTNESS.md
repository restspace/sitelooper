# Robustness and structural simplification review

Reviewed on 2026-09-13 against the current working tree, including the uncommitted shared-execution refactor.

This is a review and implementation handoff, not an implementation plan already authorized for execution. The user explicitly requested no code changes during the review. No source files were edited. The build, existing tests, and temporary diagnostic probes were run; this document records their results.

**Follow-up, same day:** every finding was re-checked against the source, and the false-success paths that could be closed locally were corrected. See [Verification and corrections](#verification-and-corrections) at the end. Findings 1, 2 and 3 are fixed; the query-parameter half of 3 followed on 2026-09-14. Findings 4 to 7 are confirmed and remain open; of 8, only the timing flake is fixed.

## Main assessment

The shared-execution refactor is a good foundation. The largest remaining opportunity is to make **target context, observation quality, action outcomes, and procedure semantics explicit**. Several current heuristics make unrelated application states look equivalent or turn uncertainty into success.

Sharing an implementation prevents daemon/spec divergence, but does not establish correctness: both runners can agree on the same wrong result. Improvements should therefore combine stronger shared contracts with independent behavioral tests.

## 1. Failed observations must not mean nothing was found

**Priority: high. Confirmed by a diagnostic probe.**

Location: [src/execution/loop.ts](src/execution/loop.ts), `runFoldedLoop`.

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

Location: [src/execution/browser.ts](src/execution/browser.ts), `CLICK_TIERS` and `robustClick`.

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

Locations: [src/execution/url.ts](src/execution/url.ts), `urlDiff`, `urlMatches`, and `softUrlMatch`; [src/execution/gates.ts](src/execution/gates.ts), `urlEffectVerdict`.

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

Locations: [src/daemon/refs.ts](src/daemon/refs.ts), agent accessibility snapshots; [src/execution/snapshot.ts](src/execution/snapshot.ts), `describeInPage`, `nameOf`, and `capturePage`.

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

Locations: [src/daemon/recorder.ts](src/daemon/recorder.ts), `LocatorCandidate` and `makeLocator`; [src/spec/emit.ts](src/spec/emit.ts), the `tabs` action branch.

Live refs support iframe elements, but persistent locator candidates have no frame path and reconstruction starts from `Page`. The persistent model cannot express the context needed to reconstruct an in-frame target. Compiled tab switching is explicitly unsupported.

Recommended change:

- Give a target a stable page reference, frame path, scope, and locator candidates.
- Describe navigation effects explicitly: current-page navigation, popup creation, context switching, or page closure.
- Use the same context model for recording, replay, observations, and emitted execution.

This provides a coherent basis for embedded editors, payment frames, OAuth popups, and workflows spanning tabs.

Acceptance evidence: record/replay/compile an iframe action and a popup workflow; distinguish identical controls in separate contexts; fail clearly when the recorded context cannot be recovered.

## 6. Consolidate waiting around action-specific evidence

**Priority: medium-high. Source-inspection finding.**

Locations: [src/execution/browser.ts](src/execution/browser.ts), `trackRequests` (formerly in `src/daemon/browser.ts`, which now re-exports it); [src/daemon/settle.ts](src/daemon/settle.ts), `STREAMING_PATH`, `installRequestTracking`, and `settlePage`; [src/execution/browser.ts](src/execution/browser.ts), `settleDom`.

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

Locations: [src/skills/compile.ts](src/skills/compile.ts), [src/skills/store.ts](src/skills/store.ts), [src/spec/ir.ts](src/spec/ir.ts), and [src/spec/lower.ts](src/spec/lower.ts).

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

Locations: [src/spec/runtime-source.ts](src/spec/runtime-source.ts), `parseExecutionSource`; [src/spec/emit.ts](src/spec/emit.ts), `neededHelpers`; [test/execution-parity.test.ts](test/execution-parity.test.ts).

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
