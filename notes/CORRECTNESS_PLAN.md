# Correctness and Generality Remediation Plan

Date: 2026-09-11  
Status: Proposed implementation plan; no engine changes implemented by this document.

## 1. Objective and scope

Make progressive compilation preserve the meaning of an automation procedure across recording, daemon replay, recovery, learning, export, standalone Playwright execution, repair, and re-recording.

A successful result must mean that the required work and its declared postconditions were verified for the intended records. Missing observations, exhausted loops, unsupported actions, and ambiguous identity must never become successful completion by default.

The generated test must remain standalone: Playwright and the emitted artifact are sufficient; no Sitelooper daemon, procedure store, or model is required at execution time. Preserve user-owned `.spec.ts` files and the existing propose/review/apply repair workflow.

This plan covers every issue raised in the accompanying review, including functionality gaps. Initial containment can reject unsupported cases; the plan is not complete until the explicitly scoped capabilities in sections 6.10–6.12 are implemented and tested.

## 2. Evidence and baseline

The review ran `npm run build` and the default test suite successfully: 965 tests passed and 113 were skipped. Browser-gated tests were not all exercised by that default run. Focused local-browser probes additionally established the following behavior. These probes were ad hoc and must become committed regression tests before fixes are accepted.

| Reproduction | Observed current behavior | Required behavior |
| --- | --- | --- |
| Compiled deletion loop: ten items, cap seven | Returns successfully with three items remaining | Reports incomplete work and remaining scope |
| Compiled update loop: two items, cap three | Updates first item three times, second item zero times | Processes each intended item once |
| Compiled procedure beginning with `goto` | Identity assertion appears before navigation | Checks destination identity after navigation, before mutation |
| Replay with required heading and missing action diff | Returns `ok: true` without warnings | Reobserves and verifies, or reports unavailable verification |
| Expected dialog absent, unrelated next action missing | Skips unrelated action and returns success | Does not infer branch membership from target absence |
| Click returns no visible effect | Controlled mutation executor called twice | Does not retry a possibly committed mutation without a retry contract |
| Order A pending, Order B cancelled on same page | Goal for Order A being cancelled is satisfied | Checks state within Order A's unique identity scope |
| Two expected effects, only one present | Effect group matches | Requires every mandatory predicate; alternatives are explicit |
| Two finite actions with different record IDs | Compiler creates a loop capped at seven | Preserves finite scope unless a collection contract authorizes iteration |
| Dialog Close action has URL expectation | Compiler removes opener and closer | Preserves semantically meaningful actions and expectations |
| HTTP and HTTPS origins with same host | Share a store filename | Remain isolated |

The retry and missing-diff probes used controlled action executors with a real browser page. They demonstrate executor/control-flow behavior, not a measured duplicate transaction on an external service. Add a local server mutation log to demonstrate the complete failure mode.

## 3. Non-negotiable execution invariants

1. **Unknown is not success.** Observations and predicates distinguish satisfied, unsatisfied, and unavailable. Required unavailable evidence prevents verified completion.
2. **Dispatch is not commit.** An action may be undispatched, dispatched with unknown outcome, or reconciled to a known outcome. Recovery must retain this distinction.
3. **Identity is relational.** Record identity and state must be proven in the same unique record scope, or through a declared relation. Independent page-wide text matches are insufficient.
4. **Compilation preserves contracts.** Every executable action, branch, collection, required output, precondition, and postcondition survives emission or produces a blocking diagnostic.
5. **Iteration has declared scope.** The engine may not expand two observed actions into authority to modify every matching record.
6. **Completion is explicit.** Executed, verified, already satisfied, intentionally not applicable, optional observation missing, failed, and incomplete are different outcomes.
7. **Learning cannot weaken correctness.** Locator improvements do not silently remove predicates, widen identity, broaden collection scope, or enable retries.
8. **Evidence is versioned.** Validation belongs to a particular procedure contract and engine semantics version. A migrated artifact does not inherit verified status automatically.
9. **Storage is isolated and atomic.** Concurrent writers cannot lose updates, cross origins, or treat malformed stores as empty valid stores.

## 4. Finding-to-work mapping

| ID | Review finding | Priority | Work package |
| --- | --- | --- | --- |
| C01 | Compiled loops truncate work and repeat first item | P1 | 6.1 |
| C02 | URL preconditions omitted; identity timing differs | P1 | 6.2 |
| C03 | Missing observations bypass effect gates | P1 | 6.3 |
| C04 | Missing dialogs swallow unrelated actions | P1 | 6.4 |
| C05 | Automatic click retry can duplicate mutations | P1 | 6.5 |
| C06 | Unscoped identity/goals and any-of effect checks | P1 | 6.6 |
| C07 | Loop folding and dialog elimination infer unsupported intent | P1 | 6.7 |
| C08 | Additional replay/emitter gate differences | P1 | 6.8 |
| C09 | Store origin collisions and lost concurrent updates | P2 | 6.9 |
| G01 | Missing frame and multi-page execution contexts | P2 | 6.10 |
| G02 | Missing general control flow and structured data bindings | P2 | 6.11 |
| G03 | Required outputs and business outcome verification incomplete | P1 | 6.12 |

## 5. Target architecture

### 5.1 One versioned procedure contract

Introduce a versioned execution contract shared by stored procedures and `SpecFlow`, replacing implicit semantics attached to loose `tool: string` values. Keep recording evidence separate from authoritatively required assertions. An observed page change is a candidate assertion, not automatically a business outcome specification.

The contract should contain:

- Stable node IDs and discriminated node types: action, assert, read, sequence, conditional, and collection iteration.
- Explicit execution context: named page plus frame path.
- Typed input and output bindings, with provenance and required/optional status.
- Unique identity scopes and predicates scoped to them.
- Preconditions with explicit phases, action-specific postconditions, and procedure-level completion predicates.
- Retry/reconciliation policy and action attempt state.
- Collection membership, termination, ordering, and maximum-work policies.
- Evidence origin: caller-authored, structurally observed, cross-run observed, or heuristic proposal.

Use the existing ledger as the provenance foundation. Avoid a second independent implementation of value identity. Introduce shared contract modules, for example under `src/execution/`; exact file names can follow repository conventions.

### 5.2 Shared semantics, standalone emitted implementation

Define pure semantic functions for predicate composition, completion classification, capability checks, iteration decisions, and retry decisions. Both execution paths must use the same definitions.

Move duplicated Playwright execution helpers into maintained source modules that the compiler can embed or bundle into the generated file. The generated file must not import the installed Sitelooper package at runtime. Retain readable named steps, source anchors, and embedded versioned IR for lift/repair.

Use an exhaustive action capability registry describing target cardinality, context requirements, dispatch behavior, applicable gates, outputs, and emission support. Unsupported nodes must fail compilation or execution explicitly; comments and TODOs are diagnostics, not implementations.

### 5.3 Structured execution evidence

Record per-node evidence with run ID, flow step ID, node ID, iteration/item key, context ID, attempt ID, dispatched status, predicate results, output availability, and final completion classification. Emit it as a Playwright attachment, including partial evidence on failure.

The checker must validate this schema and use it to establish completeness. Keep existing console markers for human compatibility, but do not treat a logged flow-step name as proof that all its required actions ran.

## 6. Work packages

### 6.1 C01: Correct collection execution

Primary files: `src/spec/emit.ts` (`emitLoop`), `src/skills/replay.ts` (`runLoop`), `src/skills/store.ts`, and `src/spec/ir.ts`.

Implementation:

1. Immediately make hitting a cap with remaining work a non-success outcome in emitted code. Verify the guard after settling and include remaining-count information where meaningful.
2. Until an explicit iteration contract exists, reject compiled loops that cannot be executed with proven membership and progress. Do not silently substitute repeated `.first()` calls for replay cursor semantics.
3. Implement distinct finite-item, collection-snapshot, and drain-until-empty contracts. Snapshot membership prevents newly appearing records from entering the task unexpectedly; drain mode requires explicit authorization.
4. Identify processed items using stable keys scoped to the collection. Do not use a remembered DOM position as identity when sorting, filtering, or virtualization can change it.
5. Re-resolve the current item by key after navigation or re-rendering. Track completed keys and duplicate dispatch attempts.
6. Specify whether order matters and how disappearing items are reconciled. A missing item is not automatically a successful deletion.
7. Require explicit termination and maximum-work policies. Record an empty initial collection distinctly; whether that is valid depends on the contract's minimum cardinality.
8. Keep budgets separate from successful termination. Time or iteration exhaustion always produces incomplete work.

Acceptance tests:

- Ten deletions with cap seven fail with three items remaining.
- Three edit-in-place items receive exactly one update each, including after row reorder.
- Zero, one, and many items behave according to declared minimum cardinality.
- Delayed removal, duplicate keys, disappearing items, new arrivals, and a stalled guard are handled explicitly.
- Virtualized/paginated collections cannot claim completeness from visible DOM count alone.
- Daemon and standalone execution have matching item-level evidence and final application state.

### 6.2 C02: Preserve preconditions and identity timing

Primary files: `src/spec/emit.ts` (`emitSegment`), `src/skills/replay.ts` (`replaySkill`), `src/skills/compile.ts`, `src/spec/ir.ts`, and `src/spec/lower.ts`.

Implementation:

1. Represent entry preconditions and post-navigation destination conditions separately. Explicit phases replace inferred ordering based only on the first tool name.
2. For a non-self-navigating procedure, verify context and URL before target resolution or mutation.
3. For a self-navigating procedure, permit navigation from the declared allowed entry states, then verify destination URL and identity before subsequent mutation.
4. Preserve exact versus parameterized URL requirements across lift/lower/emission. Make soft URL generalization a proposal; it cannot weaken an identity-sensitive route merely because one run succeeded.
5. An unresolved required identity binding is a preflight error, not a skipped check.
6. Define environment URL mapping explicitly for entry URLs, later navigations, and predicates. Do not globally replace origins in URLs, including intentional identity-provider redirects.
7. Treat structural fingerprints as advisory similarity evidence, never a replacement for record identity. Their omission from standalone artifacts must be explicit.

Acceptance tests:

- A shared Delete button on the wrong route is never invoked.
- A self-navigating procedure starting elsewhere reaches its destination before identity is asserted.
- A wrong destination record blocks the first mutation.
- Unbound identity, unexpected redirects, and unapproved route generalization block verified completion.
- Environment remapping behaves consistently for entry and subsequent same-app navigation.

### 6.3 C03: Fail closed on unavailable observations

Primary files: `src/daemon/diff.ts`, `src/agent/tools.ts`, `src/skills/replay.ts`, `src/daemon/settle.ts`, and shared execution helpers.

Implementation:

1. Replace ambiguous absent observation fields with a result describing availability, completeness, capture time, context, and failure reason.
2. Separate the bounded diagnostic diff from predicate evaluation. A truncated page summary must not be the sole authority for a required assertion.
3. If a required effect lacks usable diff evidence, evaluate its predicate directly against fresh state within a bounded verification deadline.
4. Return unavailable verification if the predicate cannot be observed. Return unsatisfied if it is observable and false. Neither permits promotion or a successful readiness result.
5. Distinguish state predicates from transition predicates: current presence may satisfy a state predicate, but does not prove that an action caused a new transition.
6. Retry observations independently from action dispatch. Observation failure must not implicitly authorize another mutation.

Acceptance tests:

- Missing diff with a false required predicate cannot return success.
- Missing diff with a subsequently observable true state predicate can verify through a recorded fresh observation.
- Capture timeout, navigation teardown, closed frame, and truncation produce explicit evidence states.
- A required element outside the snapshot budget can still be evaluated by its scoped predicate.
- Observation retries never increase the mutation log count.

### 6.4 C04: Model conditional UI with bounded branches

Primary files: `src/skills/replay.ts` (`absentDialog` handling), `src/daemon/recorder.ts`, `src/skills/compile.ts`, and `src/spec/emit.ts`.

Implementation:

1. Remove the rule that an unresolved target after an absent dialog belongs to that dialog.
2. Record dialog scope and action containment. Represent conditional UI as an explicit branch with a predicate, body, and join point.
3. Require an explicit absent branch or report an unmet expectation when a required dialog does not appear. A single recording of a dialog cannot prove absence is valid.
4. Evaluate branch conditions as satisfied/unsatisfied/unavailable. Unavailable must not select the absent branch.
5. Mark nodes not applicable only within the selected branch boundaries. Subsequent independent actions remain required.
6. Distinguish DOM dialogs, native JavaScript dialogs, menus, listboxes, and tooltips. Do not infer identical lifecycle behavior from all popup-like roles.

Acceptance tests:

- An absent optional dialog skips only its recorded branch.
- The unrelated missing deletion from the review fails.
- Required dialog absence and unavailable branch observations fail verification.
- Nested dialogs and multiple possible dialogs do not leak branch state.
- Branch outcomes are preserved in compiled artifacts and checked by readiness.

### 6.5 C05: Prevent unsafe retries and preserve uncertain commits

Primary files: `src/skills/replay.ts` (click retry), `src/agent/tools.ts` (robust click dispatch), `src/agent/loop.ts`, `src/skills/learn.ts`, and `src/skills/flow.ts`.

Implementation:

1. Remove no-visible-change as sufficient evidence for retrying a mutating action.
2. Audit all click escalation paths, including normal, forced, synthetic, recovery-model, and alternate-procedure dispatch. Distinguish pre-dispatch actionability failures from errors after a possible dispatch.
3. Assign an attempt ID before dispatch and retain a state of not-dispatched, dispatched-outcome-unknown, reconciled-success, or reconciled-failure.
4. Permit automatic retry only when dispatch was proven absent, an explicit idempotent operation contract allows it, or a reliable reconciliation predicate proves the effect did not occur.
5. Support caller-supplied idempotency/reconciliation hooks for operations that can use them. Do not infer that a browser click is idempotent from its button text.
6. When the outcome is unknown, stop further conflicting mutations and pass the attempt evidence to recovery. A prompt alone is not the enforcement mechanism: tool dispatch must enforce the unresolved-attempt constraint.
7. Recovery must reconcile before repeating a creation, charge, submission, or other non-idempotent operation. Reset commands are not a substitute for reconciliation on the live application state.

Acceptance tests:

- Local server commits a mutation but delays or loses the response: at most one mutation occurs.
- DOM remains unchanged after a successful request: no automatic second click.
- A true pre-dispatch failure can retry under the declared policy.
- Known idempotent retries work and retain attempt evidence.
- Model escalation and alternate-procedure selection cannot bypass an unresolved commit.
- Timeout or cancellation after dispatch preserves uncertain-outcome evidence.

### 6.6 C06: Scoped predicates and explicit completion conditions

Primary files: `src/skills/store.ts`, `src/skills/compile.ts` (`deriveGoal`, `identityOf`), `src/skills/replay.ts` (`goalSatisfied`, `expectedChanges`, `lineShows`), and `src/spec/emit.ts`.

Implementation:

1. Add predicates for exact text, value, attribute, checked/selected state, count, visibility, URL, output equality, and explicit all/any composition.
2. Bind record state predicates to a uniquely resolved record scope. Resolve identity exactly where possible; substring identity must not conflate IDs such as `12` and `312`.
3. Require an explicit relation for predicates spanning multiple scopes, rather than independent page-wide matches.
4. Treat all mandatory predicates as conjunctions. Alternatives must be represented as `anyOf` with a reason, not inferred from the list of observed changes.
5. Preserve heuristic page diffs as observational hints until a predicate's required status and scope are established. Do not convert every old diff line into a mandatory assertion blindly.
6. Derive already-satisfied behavior only from an explicit completion contract. Distinguish the target state from evidence that this particular action executed.
7. Handle negative predicates using complete, scoped observations. Missing capture data cannot prove absence.
8. Preserve numeric, boolean, and non-English state values; do not restrict semantic goals to alphabetic English text.

Acceptance tests:

- Order A pending plus Order B cancelled cannot satisfy cancellation of A.
- Multiple matching identity scopes produce ambiguity, not a first-match success.
- Every required field is checked; one successful effect cannot mask another failure.
- Historical text, hidden content, stale toast text, and a fill's own echo do not prove persistence.
- Already-satisfied and newly executed completion remain distinguishable in telemetry and readiness.

### 6.7 C07: Constrain compiler inference and optimization

Primary files: `src/skills/compile.ts` (`foldLoops`, `dropDismissedDialogs`, related transformations), `src/skills/shape.ts`, and `src/daemon/recorder.ts`.

Implementation:

1. Stop automatic loop folding without a declared collection/finite-item contract. Preserve the original sequence when generality cannot be established.
2. Make folding a semantics-preserving transformation over explicit item bindings. It must retain the exact intended membership and per-item values.
3. Disable dialog-pair elimination based only on dismissal names and missing added lines. Preserve any navigation, output, mutation, branch, or required predicate associated with either action.
4. Treat candidate elimination as a proposal requiring evidence of equivalence. Absence of visible change does not prove absence of side effects.
5. Audit adjacent navigation removal, coalesced controls, discarded reads/evals, and popup-toggle skips against the same rule. For example, intermediate navigation may establish authentication or session state.
6. Record each transformation with input node IDs, output node IDs, reason, and supporting evidence. Preserve the source recording for reanalysis.
7. Require contract-level checks after every transformation and across repair. Removing a required assertion or broadening a target set must block automatic acceptance.

Acceptance tests:

- Delete A and B preserves C even when all share an identical control shape.
- Explicit delete-all can generalize to a different collection size.
- Opening a result dialog after a committed mutation is not eliminated with Close.
- Close causing navigation, or returning an output, remains executable.
- Repeated actions using different values retain those values.
- Transformation provenance supports explaining and reversing an optimization.

### 6.8 C08: Close all replay/emitter semantic gaps

Primary files: `src/spec/emit.ts`, `src/skills/replay.ts`, `src/agent/tools.ts`, `src/daemon/dialogs.ts`, `src/spec/locators.ts`, and shared execution helpers.

Implementation:

1. Inventory every tool and node through the capability registry, including `goto`, `back`, untargeted `press`, viewport/offline changes, downloads, uploads, dialogs, reads, and eval.
2. Route actions through a common execution lifecycle: preflight, context resolution, preconditions, dispatch, settling/observation, postconditions, output extraction, completion classification.
3. Remove early-return paths that bypass applicable gates. Applicability must be explicit in the registry.
4. Implement equivalent unexpected-alert handling in standalone execution. Separate failure alerts, informational live regions, and expected notifications; an arbitrary toast is not necessarily an error.
5. Preserve navigation content expectations in addition to URL checks. Verify effects after back and keyboard actions where recorded contracts require them.
6. Audit locator identity requirements, ambiguity handling, fallback origin restrictions, waits, native-dialog listener lifetime/count, and derived-value extraction for parity.
7. Unsupported operations must produce typed blocking diagnostics before mutation when possible. Plain generated execution must throw if an unsupported node survives loading; do not depend only on readiness's TODO scan.

Acceptance tests:

- Paired runner tests cover every capability and its applicable failure gates.
- A new failure alert is handled identically by both runners.
- Correct URL with missing required destination content fails.
- Keyboard and back actions cannot bypass their postconditions.
- Native dialog expectations expire and honor finite counts identically.
- Standalone artifacts run with only Playwright installed.

### 6.9 C09: Isolate and serialize procedure storage

Primary files: `src/skills/store.ts`, `src/spec/bundle.ts`, store callers in `src/skills/learn.ts`, and migration tooling.

Implementation:

1. Canonicalize origins using parsed URL semantics, preserving scheme and effective non-default port. Use a full canonical-origin hash for filenames and retain readable origin metadata inside the file.
2. Validate each entry's origin on read and filter/query by exact canonical origin. Define the intended isolation policy for `file:` URLs explicitly.
3. Retain JSON storage initially, with a cross-process per-origin lock covering the complete read/modify/write transaction. Add a transaction/update API so outcome counters and promotions are computed from the locked current revision, not stale objects.
4. Add revision-aware compare-and-set behavior for whole-procedure replacement. Atomic rename alone is insufficient.
5. Specify lock ownership, bounded acquisition, crash recovery, and Windows behavior; test stale-lock handling rather than assuming process IDs cannot be reused.
6. Validate schemas and surface corruption distinctly from a missing store. Preserve damaged files for diagnosis; never overwrite them after silently returning an empty list.
7. Use collision-resistant procedure IDs for new records and reject ID collisions across distinct procedures. Preserve existing IDs during migration unless an actual collision requires explicit remapping of references.
8. Migrate legacy slug files under a migration lock, partitioning entries by their stored origin. Back up originals and refuse ambiguous or invalid records without deleting them.

Acceptance tests:

- HTTP/HTTPS, differing ports, and similar legacy slugs remain isolated.
- Multiple child processes concurrently add procedures and record outcomes without lost records or counter increments.
- Readers see complete valid revisions during writes.
- Process death while holding a lock is recoverable without losing committed data.
- Corrupt JSON is reported and preserved.
- Migration is repeatable and leaves flow pins and chains resolvable.

### 6.10 G01: Support frames and multiple pages explicitly

Primary files: `src/daemon/browser.ts`, `src/daemon/refs.ts`, `src/daemon/recorder.ts`, `src/agent/tools.ts`, `src/spec/locators.ts`, and the execution contract.

Implementation:

1. Add stable named page contexts and durable frame paths to recorded targets and predicates. Frame identity must not depend solely on ordinal index.
2. Record popup causality: the action that opened a page, its expected destination contract, and the relationship to its opener. Register event waits before dispatch.
3. Represent page acquisition, switching, and closing as real operations with explicit context bindings, rather than global active-page changes or TODO comments.
4. Resolve frame locators after reattachment/navigation; stale handles must not retarget actions silently.
5. Make origin transitions explicit per context. Permit declared cross-origin authentication and embedded-widget paths while retaining fallback restrictions elsewhere.
6. Extend snapshots, output capture, identity, and errors with page/frame context.

Acceptance tests:

- Nested frames and cross-origin iframe inputs can be recorded, replayed, and compiled.
- Frame reordering does not change the target; ambiguous frames fail.
- Popup authentication returns to the correct opener.
- An unrelated popup cannot hijack replay; an expected popup is usable.
- Popup closure, failed navigation, and multiple simultaneous candidates are diagnosed.
- Page/frame bindings survive bundle export and lift/lower round trips.

### 6.11 G02: Add structured data and general control flow

Primary files: `src/skills/store.ts`, `src/skills/flow.ts`, `src/skills/ledger.ts`, `src/spec/ir.ts`, `src/spec/rethread.ts`, `src/spec/lift.ts`, and `src/spec/lower.ts`.

Implementation:

1. Introduce typed scalar, object, and array inputs/outputs. Preserve the distinction between false, zero, empty string, null, and unavailable data.
2. Add finite `forEach` bindings and predicate-based conditionals using the iteration and branch semantics above. Support bounded composition and nesting.
3. Define a small serializable expression language for references, field access, formatting, typed comparisons, and declared deterministic transformations. Avoid implicit arbitrary JavaScript execution during metadata loading.
4. Validate dependency ordering, branch output availability, item-local variable scope, type compatibility, and unresolved references before execution.
5. Preserve provenance through expressions so data derived from one run cannot fall back to a recorded literal in another run.
6. Provide authoring/configuration syntax for declaring collection scope and branching intent. The model may propose a contract, but the compiler must not infer universal behavior from one observed path.
7. Emit typed APIs for structured inputs and outputs while keeping existing scalar CLI variables compatible. Add a JSON input-file path for complex datasets.

Acceptance tests:

- Per-item quantities and names remain attached to the correct records.
- A branch can publish an explicitly optional output; consuming it without handling absence is rejected.
- Cross-step transformations use current-run values after repair and rethreading.
- Structured datasets survive export, compile, lift, lower, and re-recording.
- Different initial states select declared branches without model recovery.
- Existing scalar-only workflows remain supported through explicit migration.

### 6.12 G03: Require outputs and verify business outcomes

Primary files: `src/spec/emit.ts` (`readLines`, `readOptional`), `src/skills/replay.ts`, `src/skills/flow.ts`, `src/spec/check.ts`, `src/spec/readiness.ts`, and `docs/testing-workflow.md`.

Implementation:

1. Declare whether each output is required, optional, or diagnostic. A promised report value is required unless the contract explicitly makes it optional.
2. Missing required reads prevent successful completion even when no later step consumes the output. Optional reads report unavailable status without substituting stale literals or ambiguous empty strings.
3. Separate input echoes from durable read-back evidence. A value entered into a field is not proof that the application persisted it.
4. Add procedure-level completion predicates distinct from intermediate UI effects. Support reload/reopen checks and caller-owned Playwright assertions for persistence and calculated state.
5. Define a portable verifier hook interface for application-side checks in the user's project. Hooks remain application-specific; the engine must not embed target-specific APIs or credentials.
6. Resolve hook configuration before mutation. If a required verifier is unavailable, the run cannot be outcome-verified. Preserve the existing user-owned scaffold rather than rewriting assertions during repair.
7. Report execution coverage, outcome verification, and failure-detection evidence separately. Preserve the honest distinction already present in readiness and make missing outcome contracts visible.
8. Require fault tests for claimed failure-detection coverage, tied to named outcome predicates. A passing unrelated negative spec must not count as evidence for every assertion.

Acceptance tests:

- A final required ID/status read disappearing fails even without downstream consumers.
- Optional diagnostic absence remains explicit and does not fabricate a value.
- A rejected save or lost database write is detected despite unchanged form values.
- A calculation returning the wrong amount fails an explicit numeric outcome predicate.
- Required verifier unavailability prevents outcome verification.
- Negative tests identify which predicate detected each injected fault.

## 7. Readiness, learning, and repair integration

Apply these changes across the entire lifecycle, not only the two execution engines.

- **Readiness:** consume validated per-node evidence; require completion of every applicable required node, output, and predicate. An intentionally untaken branch differs from a skipped test. Record branch/collection coverage so one successful path does not claim untested paths were exercised.
- **Datasets:** retain repeated clean executions and distinct datasets, but add scenario coverage for empty/nonempty collections, alternate branches, and changed initial state. Distinct strings alone do not establish semantic coverage.
- **Promotion:** require contract verification, not only successful agent reports. Unknown commits, required unavailable evidence, or incomplete loops cannot promote a procedure or a fallback locator.
- **Repair:** compare original and candidate contracts structurally. Reject removal or weakening of required predicates, widened identity or collection scope, optionalized required outputs, and expanded retry policy unless explicitly represented as a reviewed contract change. Ordinary locator repairs must preserve these contracts.
- **Re-recording:** preserve the distinction between replacing bad recording evidence and changing the user's objective. Re-recorded candidates must earn fresh verification.
- **Lowering:** remove the assumption that compilation implies validated convergence. Lowered procedures begin without runtime verification history and carry their actual contract provenance.
- **Evidence:** include contract and semantics versions in readiness and proposal evidence. Hash declared verifier/configuration dependencies as well as generated source where they affect the claimed verification. Clearly state dependency coverage rather than implying a hash captures the entire environment.

Primary integration points: `src/skills/learn.ts`, `src/spec/readiness.ts`, `src/spec/check.ts`, `src/spec/repair.ts`, `src/spec/proposal.ts`, `src/spec/rerecord.ts`, and `src/spec/lower.ts`.

## 8. Compatibility and migration

1. Add schema versions to persisted execution contracts and update the bundle/IR readers. Validate shapes rather than relying on TypeScript casts or shallow bundle checks.
2. Keep legacy artifacts readable for inspection and migration. Unknown newer versions must fail with an actionable diagnostic before execution.
3. Preserve old recordings as evidence. Do not invent branch boundaries, required predicate scopes, retry permissions, or collection authority during migration.
4. Migrate unambiguous actions and scalar bindings mechanically. Quarantine inferred loops and unscoped goal shortcuts until re-recorded or supplied with explicit contracts.
5. Disable unsafe legacy shortcuts in current execution. If equivalent safe behavior cannot be established, report a migration/re-recording requirement rather than returning green.
6. Do not relabel legacy validation as new-contract verification. Existing emitted files remain historical artifacts and require recompilation to receive fixes; document that installed runtime changes do not patch standalone files.
7. Preserve user-owned specs, relative fixture imports, flow step IDs, source recordings, and resolvable pins. Report any unavoidable ID changes with a mapping.
8. Make migrations repeatable, backed up, and reviewable. Preserve failed staging artifacts and never replace an original on migration failure.
9. Update JSON CLI results and diagnostics with stable machine-readable codes, keeping existing fields where feasible. Add codes for unavailable observation, uncertain commit, incomplete collection, ambiguous identity, missing required output, unsupported context, and migration-required contract.

## 9. Verification strategy

### 9.1 Differential browser harness

Create a committed harness, for example `test/execution-parity.test.ts`, that runs each contract through daemon replay and emitted Playwright execution against separately reset copies of the same local fixture application.

Compare application state, mutation log, scoped outputs, predicate results, item membership, branch selection, and completion classification. Do not compare only generated source strings or final `ok` flags. Accept documented differences in telemetry timing and locator drift only when identity and outcome remain equivalent.

Use actual compiled artifacts under the Playwright test runner for the standalone side. The local fixture server should expose a verifier-only mutation log and controllable faults: delayed response, committed-but-disconnected request, rejected write, stale UI, missing dialog, reordered rows, virtualized list, popup, and iframe replacement.

### 9.2 Test layers

| Layer | Purpose | Required coverage |
| --- | --- | --- |
| Pure unit tests | Contract semantics | Predicate truth tables, completion, retry decisions, dependency/type validation |
| Transformation tests | Compiler preserves meaning | Finite scope, assertions, branch boundaries, provenance, round trips |
| Differential browser tests | Runners agree | Every node/action capability and each C01–C08 failure fixture |
| Application fault tests | Agreement is actually correct | Independent mutation/persistence oracle, duplicate prevention, wrong-record protection |
| Process tests | Store correctness | Concurrent writers, crash recovery, corruption, origin migration |
| CLI acceptance tests | User workflow remains usable | Build/check/repair/rerecord, stable exit results, preserved user specs |
| Published recording checks | Compatibility and practical cost | Recompile known stores; classify migrations and intentional new failures |

Browser parity and fault tests must run in required CI jobs with installed browsers. A skipped browser suite is not sufficient evidence for these fixes. Keep the fast default unit job, but make its limited scope visible.

### 9.3 Generality checks

Run parameterized fixtures across collection sizes, orderings, duplicate labels, ID shapes, non-English labels, numeric states, frame nesting, delayed UI, and multiple starting states. Include deterministic seeds in failures. Compare against explicit invariants rather than requiring every perturbation to succeed: an ambiguous case that stops safely is correct.

## 10. Delivery sequence and dependencies

Each change set includes its own tests and diagnostics; do not postpone regression tests until the architecture work is complete.

| Phase | Deliverables | Dependencies | Exit criteria |
| --- | --- | --- | --- |
| A: Reproduce and contain | Commit review reproductions; stop unsafe retries; fail incomplete loops and missing required observations; remove broad absent-dialog skips; disable unsafe compiler eliminations | None | Reproduced false-success paths stop safely, with actionable diagnostics |
| B: Contract foundation | Versioned predicates, identity scopes, completion evidence, attempt state, capability registry, migration reader | A | Contract unit tests and serialization round trips pass; unsafe legacy semantics cannot execute silently |
| C: Semantic parity | Preconditions/timing, complete action lifecycle, alerts/effects, correct collection and branch execution, embedded shared helpers | B | C01–C08 differential fixtures and independent fault oracles pass |
| D: Storage integrity | Origin keys, transaction API, locking, revisions, corruption handling, migration | Can follow A independently of B/C | Multi-process and migration tests pass on Windows and CI platform |
| E: Functional generality | Page/frame contexts, structured data, explicit collections and conditionals | B/C | G01/G02 end-to-end fixtures work without model recovery for declared scenarios |
| F: Outcome assurance | Required outputs, completion predicates, project verifier hooks, readiness evidence, promotion/repair contract checks | B/C; integrate E coverage | Missing or false required evidence blocks verification and promotion |
| G: Release migration | Published recording reruns, documentation, CLI compatibility, migration tooling, benchmark comparison | C/D/E/F | Release criteria below met; known unsupported cases documented explicitly |

Suggested reviewable change sets:

1. Regression fixtures and immediate failure-state containment.
2. Action dispatch/uncertain-commit enforcement across replay and recovery.
3. Predicate and completion contract with legacy readers.
4. Preconditions and scoped identity parity.
5. Common action lifecycle and emitter helper extraction.
6. Explicit iteration and conditional execution plus conservative compiler transformations.
7. Transactional store and migration.
8. Named pages and frames.
9. Structured bindings and authoring syntax.
10. Required outputs and project outcome verifiers.
11. Structured readiness, promotion, repair checks, and release migrations.

The sequence is an implementation order, not a calendar estimate. Scope each change set after inspecting its call graph and current regression fixtures.

## 11. Risks and decisions to resolve during implementation

- **Stricter gates will expose old recordings that never proved their outcomes.** Report those as insufficient evidence, preserve them for re-recording, and distinguish this from a new engine regression.
- **UI-only automation cannot establish exactly-once server effects universally.** Use reconciliation or application support where available; otherwise preserve an uncertain outcome and stop safely.
- **One trace cannot determine universal intent.** Expose concise declarations for finite targets, collections, branches, and outcome predicates. Defaults must preserve the narrow observed scope.
- **Shared emitted helpers may increase artifact size.** Include only needed helpers and retain source anchors. Measure size and runtime after correctness fixtures pass.
- **Verifier portability needs a project contract.** Specify module/export resolution, fixture access, credentials handling, and dependency evidence before implementing hooks. Do not serialize credentials into bundles.
- **DOM identity can be unavailable.** Define when a canonical record URL, unique container, or caller-provided verifier establishes identity; refuse ambiguous page-wide substitutes.
- **Legacy store locking must work across Windows and other supported platforms.** If a reliable lock implementation proves disproportionate, evaluate a transactional database before shipping partial concurrency guarantees.
- **Performance is secondary to truthful results.** Track additional observation/verification latency separately from model cost. Optimize repeated capture only when predicate semantics remain unchanged.

## 12. Release acceptance checklist

- [ ] All C01–C09 findings have committed regression coverage and implemented remedies.
- [ ] G01–G03 capabilities described here work end to end, with explicit diagnostics for remaining unsupported cases.
- [ ] Daemon and standalone execution agree on every required contract fixture.
- [ ] Mutation-log tests demonstrate no automatic duplicate dispatch after an uncertain commit.
- [ ] No required action disappears because of an absent dialog, unsupported emitter branch, cap, or failed observation.
- [ ] Record-scoped outcome checks reject wrong-record and partial-effect fixtures.
- [ ] Required outputs and persistence predicates cannot fail silently.
- [ ] Learning and repair cannot promote or preserve a falsely verified contract.
- [ ] Concurrent store updates and origin isolation pass process-level tests.
- [ ] Bundle, IR, store, and standalone-artifact migration behavior is documented and tested.
- [ ] Browser parity/fault tests are required CI checks, not optional skipped coverage.
- [ ] Published recordings are rerun; changes in correctness, migration requirements, runtime, and model fallback are reported separately.
- [ ] Standalone tests run without the Sitelooper installation, and user-owned specs remain intact.
- [ ] README and testing documentation describe execution verification, outcome verification, coverage, and failure detection accurately.
