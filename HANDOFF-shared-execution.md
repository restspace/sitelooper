# Shared execution refactor — status

Updated: 2026-09-13. Branch `refactor/shared-execution`, **uncommitted**.

**Do not infer permission to commit, push, or publish from this document.** It
records what is in the working tree and what remains, so that work can resume
when the user asks for it. The user approved the implementation; no commit has
been approved, and none has been made.

## Request and branch

The user asked whether repeated fixes missing sibling implementations indicate
insufficient abstraction. A read-only review found substantial duplication in
daemon replay versus standalone Playwright emission. The user approved
implementing shared execution rules with appropriately strong subagents. We
verified a clean `main`, then created `refactor/shared-execution`. All current
implementation changes were made for this task.

## Architecture

Both execution targets consume the same ordinary, type-checked TypeScript. The
daemon imports it; compilation embeds that maintained source into standalone
`.flow.ts` artifacts, preserving the requirement that exported tests need
Playwright but no Sitelooper daemon, installed runtime, repository, or model.

Full description: **`docs/shared-execution.md`** — module-by-module inventory
with both call sites, how embedding works, the artifact contract, what remains
target-specific, how unsupported capabilities are diagnosed, and how to add a new
shared rule.

This branch establishes a large part of that architecture. **It is not full
execution parity.** Several policies are still independently implemented; see
"Remaining work" and the open half of `PARITY_GAPS.md`.

## What landed

### `src/execution/` — the shared modules

| Module | Contents |
|---|---|
| `text.ts` | identity/wildcard/masking text rules; `src/shared/text.ts` re-exports |
| `url.ts` | `urlShapeOf`, `urlDiff`, `urlMatches`, `softUrlMatch`, `urlPart(s)`, `fillParams(Deep)`; `skills/compile.ts` re-exports |
| `gates.ts` | `errorPageVerdict`, `urlEffectVerdict`, `alertVerdict`, `preconditionVerdict`, `markersBound` |
| `observe.ts` | `liveAlerts` — the alerts view of `snapshot.ts`'s single capture |
| `snapshot.ts` | `describeInPage`, `capturePage`, `capturePageLines`, `addedLines`, `lineShows`, `presentOnPage`, `scopeCheckInPage`, `sweepPage` |
| `expect.ts` | `expectedChangesVerdict`, `namesDialogControl`, `consequentialExpectations`, `TRANSIENT_LINE`, `maskMinted` |
| `browser.ts` | `robustClick`, `fireWhenAttached`, `reactSafeFill/Select`, `syntheticHover`, `settleDom` |
| `lifecycle.ts` | `runStepLifecycle`, `isReadAction`, `isMutatingAction`, `mutatesSteps`, `changedCreation` |
| `loop.ts` | `runFoldedLoop` |
| `point.ts` | `PointGeometry`, `POINT_MARK`, `pointToken`, `pointLocator`, `markPoint` — geometry as a locator kind |
| `resolve.ts` | `resolveCandidates`, `structuralCandidate`, `candidateRank`, `orderCandidates`, `identityFields`, `identityValues`, `RESOLVE_WAIT_MS`, `RESOLVE_POLL_MS` — the locator-resolution policy |
| `fingerprint.ts` | `fingerprintPage`, `cosine`, `normaliseFingerprint`, `fingerprintPathsInPage`, `FINGERPRINT_DIMS`, `FINGERPRINT_CAPTURE_TIMEOUT_MS` — the structural page fingerprint; `daemon/fingerprint.ts` re-exports |
| `recipes.ts` | `RECIPE_FAMILIES`, `SEED_RECIPES`, `recognizeComponent`, `executeRecipe`, `verifyRecipe`, `applyRecipe`, `describeRecipeAttempt`, `snapshotBook`, `fillWithRecipe`, `typeWithRecipe`, `selectWithRecipe` — the component recipe runner (C7); selection stays in `src/skills/components.ts` |

### Behaviour now single-source

- **Gates.** The emitted `verify` runs error page, url, content expectations,
  then alerts (an unrecorded alert only stops a step whose recorded changes did
  not confirm it) — replay's own order, through replay's own verdicts. The segment
  url precondition is enforced in artifacts (it was a comment), and
  `preconditionGate` is async and awaited. The artifact captures its alerts in
  the lifecycle's `settle` phase, at the moment the daemon's executor diffs.
- **Alerts, daemon side.** `captureFailed ? null : (diff?.alerts ?? [])`. A tool
  the executor never diffs by design (goto, back, wait_for, hover,
  scroll_into_view) is an *observed nothing*, not unobserved — reading it as
  unobserved marked every such step of every replay.
- **Identity.** The emitted `present` and `sharesScope` helpers are deleted. The
  artifact's identity gate calls the shared `presentOnPage`, and `satisfied` runs
  `capturePageLines` + `lineShows` + `page.evaluate(scopeCheckInPage, …)` — the
  daemon's own page function, not a copy of it.
- **Opener skip.** Both runners resolve the target first and guard afterwards,
  and both apply it to `click` only. A guard ahead of resolution would report
  skipped-and-green where the daemon reports a stop.
- **Content expectations.** The artifact judges the same snapshot lines the
  daemon does. The locator translation (`lineLocator`, `lineUnion`,
  `anyOfAssertion`, `looseText`, `INPUT_LIKE_ROLES`) is gone. This fixed a
  false-success nobody had listed: the value after the colon was never checked,
  so `- combobox "Project": {{v1}}` passed on any visible Project combobox.
- **Absent dialogs.** Shared skip rule, proven against the dialog's own recorded
  subtree, in both runners; neither skips a `mints` step, and neither concludes
  "the dialog did not open" from a capture that failed.
- **Loops.** Settle before every count, first-match guard (not a `.or()` union),
  cursor, progress guard, cap-as-budget — one policy, both runners. The
  artifact's progress signature is built from what its targets RESOLVED to (via
  `pick`'s `resolved` sink), so the guard can actually fire; a signature
  synthesised from compile-time text could never repeat.
- **Lifecycle.** Page-level actions (`goto`, `back`, …) return from action
  emission only; they no longer bypass bind and verify. Absence waits go through
  the lifecycle with an empty action rather than returning early.
- **Actions.** Uncertain dispatch and strict-locator ambiguity are checked at
  every click tier; no tier resolves ambiguity with a silent `.first()`; DOM
  settling clears its timers and disconnects its observer on every completion
  path.
- **Locator resolution (C6, both stages).** `resolveCandidates` is the one
  policy — class order, the point mark, the identity guard, plausibility, the
  origin guard, ambiguity and loop-cursor narrowing, the structural hold, the
  whole-chain wait, the miss reasons. The daemon's `resolveChain` and the
  artifact's `resolveTarget`/`pick`/`readOptional` are adapters that build
  observations and present the result. EVERY artifact locator step goes through
  it, single-candidate too. The artifact renders the daemon's policy inputs at
  compile time: `requireIdentity: identityValues({ v1: p.v1 }, [...fields])`
  over the segment's known slots (closes B8), `stayOnOrigin` from the recorded
  pattern's origin else `originOf(page.url())` (`originOf` moved to
  `src/execution/url.ts`; `store.ts` re-exports), `allowMultiple` for
  `read_all`, the loop cursor as `ambiguousNth` (a unique body target is acted
  on as itself, no unconditional `.nth(cursor)`), the shared wait constants.
  Deleted: the emitted `pick`'s own policy and poll loop, `PICK_WAIT_MS`/
  `PICK_POLL_MS`, the static `.filter({ hasText })` guards and the `specOf`
  pre-ordering and dedupe in `locators.ts`, the compile-time positional guess
  (the resolution reports `positionalResolution` at run time). A `point`
  candidate is emitted with its geometry through `pointLocator`, so a
  position-only chain is no longer an `unsupported-capability`.
- **Page fingerprint.** `fingerprintPage`/`cosine` moved to
  `src/execution/fingerprint.ts`; `SpecSegment.preconditions.fingerprint` carries
  the skill's 512-number vector verbatim (already three decimals at capture; no
  further rounding, so both runners compute the same cosine to the digit; at most
  ~3KB of JSON per segment, written on one line of `FLOW`). The emitted gate
  call is replay's adapter: `await preconditionGate(pattern, page.url(), p,
  where, cosine(recordedFingerprint(step, segment), (await
  fingerprintPage(page)) ?? undefined))` — the url argument is evaluated before
  the measurement, as replay reads `startUrl` before fingerprinting — null when
  the page cannot be read. `cosine` is null on a non-finite entry, matching
  `flowToSpec`, which copies only a 512-length finite vector (any other can
  never be compared by replay either); `lift` validates it; `lower` puts it back
  in the staged skill; `repair`/`rerecord` call `carryFingerprints` (match
  segments by id, by position only for an in-place replacement — see
  `matchPriorSegment`; keep the file's vector at the same start pattern unless
  the run's skill recorded a different one, with a `fingerprint: …` change
  line; keep a legacy flag at any pattern, and fall back to the flag with a
  change line when a vector is dropped for a widened pattern). The module is
  embedded only when some segment carries a vector.

### Diagnostics

- `recipe-snapshot` (typed diagnostic + warning, flow-level, never a blocker)
  for what the component store holds that the artifact's compile-time recipe
  snapshot cannot express: a demoted recipe (omitted), a family with none
  usable (native for good), a learned variant travelling as data.
- `unsupported-capability` (typed diagnostic + warning + `// TODO:` + `throw`)
  for `tabs`, `read what=attr|count`, a chain with no candidate at all,
  inexpressible waits and drags. (Position-only chains were listed until C6
  stage B; they now resolve.)
- `unmeasured-precondition` (warning) is NO LONGER raised at compile: a
  compiled segment carries its fingerprint vector and the artifact measures it
  as replay does (see "Page fingerprint" below). It is raised only for a segment
  of a file compiled BEFORE the vector travelled (legacy
  `preconditions.fingerprinted: true`, no vector) that does not navigate
  itself — by the emitter and by `carryFingerprints` on repair/rerecord — with
  a fix that says to recompile. Such a segment still passes `'unmeasured'`,
  which refuses a soft url match. `FingerprintSimilarity` stays
  `number | null | 'unmeasured'`.

### Packaging

- Artifacts import `@playwright/test` and nothing else, with
  `declare const process: { env: … }` so they typecheck without `@types/node`.
- `src/spec/runtime-source.ts` reads maintained `.ts` in a checkout, shipped
  assets in a package; strips Playwright type imports and export modifiers,
  strips-and-records sibling imports, rejects anything else, and orders the
  closure dependency-first.
- `scripts/copy-execution-source.mjs` copies the exact checked sources to
  `dist/execution/source/`; `npm run build` runs it after `tsc`.

### Tests

- `test/execution-browser.test.ts`, `execution-gates.test.ts`,
  `execution-expect.test.ts`, `execution-lifecycle.test.ts`,
  `execution-loop.test.ts` — unit coverage of the shared modules.
- `test/execution-source.test.ts` — strict semantic typecheck of a generated
  artifact, each module embedded exactly once, dependency ordering, sibling-import
  stripping and foreign-import rejection, and loading with no repository source
  tree.
- `test/execution-resolve.test.ts` — the resolution policy, one rule per case
  over fake locators; `test/execution-resolve-emit.test.ts` — the artifact's
  observations and compile-time policy inputs, and the emitted adapter run from
  the whole helper block (drift reasons, the loop sink, the throw, the read
  skip).
- `test/execution-recipes.test.ts` — the recipe runner, one rule per case over
  fake locators; `test/execution-recipes-emit.test.ts` — where the artifact's
  snapshot comes from (the store `flowToSpec` is given, learned variants
  included; `compileFlow` honours `SITELOOPER_COMPONENTS_FILE`), the
  `recipe-snapshot` diagnostics, the storeless seed default, and the emitted
  `fill`/`type`/`select` run from the whole helper block.
- `test/execution-fingerprint.test.ts` — the fingerprint module: the page
  function rebuilt from its own text over a fake DOM (closure-free), the vector
  shape and precision, `cosine`'s nulls and rounding, the capture's null on a
  throw or a timeout, and the carried copy giving the store's verdict.
- `test/execution-parity.test.ts` — now 34 differential cases (the two
  fingerprint cases in "gates" are not yet browser-run). C7 stage B
  appended an "editor recipes" section (a monaco-shaped `fill`, a
  contenteditable `type`, a native-select control, over the new `/editor`
  fixture route; these passed in a browser), and the C7 review fix added a
  `fill` into a `hasText`-located contenteditable whose target the recipe
  un-matches — NOT yet run in a browser. C6 stage B added
  a "locator resolution" section at the end: the identity guard from a known
  value in a role name (and its no-known-slot control), a fallback under a
  foreign link refused (and its same-origin control), and a loop-body target
  unique on the second pass (both act, both stop on the progress guard). These
  four have NOT yet been run in a browser — the orchestrator runs the
  browser suites serially afterwards. Earlier: the alert gate; the segment precondition refusing and soft-matching; a
  hard line whose slot is the control's VALUE (failing and passing); the
  absent-dialog skip and the dialog that does open; the loop guard's first-match
  rule; a `back` url gate; a repeated url expectation after intervening
  navigation; and both runners bounding an identity marker the same way, in text
  and in a field value, now that the artifact asks `presentOnPage` too. The
  harness cuts the WHOLE emitted helper block and rebuilds every function
  together, rather than cutting one function that would fail closed.

## Validation status

- **Final state (2026-09-13, after the page fingerprint in the IR and its
  review fixes).** `npm run build` passes. The full non-browser suite passes:
  61 files, 1287 passed, 156 skipped. The strict `types: []` typecheck of a
  generated artifact passes with a fingerprinted segment embedded.
- **Query identity (ROBUSTNESS.md finding 3, query half), 2026-09-14.** The
  query is part of `UrlShape` and recorded patterns; seams, routes and the
  sitemap stay query-free. Non-browser suite 62 files passed; parity **66 of
  66**; rest **66 files, 1431 tests, 0 failed**.
- **ROBUSTNESS.md corrections (findings 1, 2, 3 in part, 8 in part),
  2026-09-14.** Unreadable loop guard stops; progress guard before the action;
  disabled controls refused; url soft match only for minted-shaped values.
  Build passes; non-browser suite 62 files passed, 0 failed; parity **65 of 65**
  (~17 minutes); rest **66 files, 1430 tests, 0 failed**.
- **Unminted derived values left unset (gap 9 residual), 2026-09-13.** The
  artifact binds `p.dN` only when the url carries the part (`bindPart`), as
  replay does. Non-browser suite 1296 passed; parity **63 of 63** (~11
  minutes); rest **66 files, 1418 tests, 0 failed**. `PARITY_GAPS.md` now lists
  only by-design differences.
- **Recovery rungs (15a/15b), loop-body mints, every harness cell, 2026-09-13.**
  Shared `src/execution/recover.ts`; `FlowRun.created`; `urlHeldStill` and the
  request counter moved into `src/execution/browser.ts` after a new harness
  case caught the artifact binding a derived value before a second redirect.
  Build passes; non-browser suite 1296 passed; parity **61 of 61** (about 9
  minutes alone); rest **66 files, 1418 tests, 0 failed**.
- **Echo reads (gap 10) and the fragment-credential mask, 2026-09-13.** Shared
  `src/execution/echo.ts`; `FlowRun.echoed` in the artifact; `describeUrl`
  masks credential-named fragment keys. Build passes; non-browser suite 1295
  passed (store-concurrency flaked once, passes alone); browser-gated parity
  **35 of 35** (the new echo case included), then **66 files, 1418 tests, 0
  failed**.
- **Browser-gated suite on the fingerprint state passed**, run serially in two chunks
  (a single full run can be OS-killed for low memory on this machine): parity
  **34 of 34** (including both fingerprint cases), then every other file at
  **65 files, 1409 tests, 0 failed**.

  ```powershell
  $env:BP_BROWSER_TESTS='1'; $env:SITELOOPER_CHANNEL='chromium'
  npx vitest run test/execution-parity.test.ts
  npx vitest run --exclude test/execution-parity.test.ts
  ```
- Before the fingerprint review fixes: parity 34 of 34, 65 files / 1400 tests.
- Earlier: after C7 and its review fixes, parity 32 of 32 and 64 files / 1369
  tests.
- Superseded milestones: after C6, 63 files / 1339 tests with parity 28 of 28;
  non-browser 1189 after C6 and 1222 after C7 stage B.
- `test/store-concurrency.test.ts` is a multi-process timing test that can fail
  under concurrent CPU load; it passes in isolation.
- Earlier milestones: 1127/145 before C6; 1273 browser-gated tests before C6.
- Packed-package smoke test done on the final build: `npm pack`, then in an
  isolated directory with only the tarball, `@playwright/test` and `typescript`
  installed (no `@types/node`, no `src/`), a flow compiled through the installed
  `dist/spec/emit.js` produced an artifact embedding the shared modules,
  with no Sitelooper import or repository path, that passes
  `tsc --strict --noEmit`. The `executionSource` fallback to
  `dist/execution/source/` is what that install exercises.
- PowerShell reports redirected native stderr as `NativeCommandError` for
  ordinary test warnings; that wrapper message is not a test verdict.

## Remaining work

1. **C6 — locator resolution policy: DONE except retirement.** Both stages
   landed (shared `resolveCandidates`; daemon and artifact as adapters; the
   artifact's policy inputs rendered at compile time; gaps 14 and B8 closed in
   `PARITY_GAPS.md`). What remains daemon-only, by design: evidence-based
   retirement (`retired`, from the store's `seen` counts) — an artifact has no
   evidence store, so its chain is ordered by class and recorded order alone.
   The IR does carry `seen`, so a compile-time snapshot is possible but would
   be stale after the next replay; not rendered. Still to do: run the four new
   parity cases in a browser; add a browser-backed case for a `point` candidate
   resolved by both runners (harness cell 11).
2. **C7 — editor recipes: DONE except the browser run.** Stage A moved the
   runner to `src/execution/recipes.ts` and made `tools.ts` its first adapter.
   Stage B made the emitter the second: `SpecFlow.recipes?: RecipeSnapshot`
   (`src/spec/ir.ts`), populated by `flowToSpec` from the `ComponentStore`
   `compileFlow` hands it (the one the daemon reads; `components` option on
   both), with a flow-level `recipe-snapshot` diagnostic per `snapshotRecipes`
   finding; a storeless spec carries no field and the emitter embeds the
   seeds. The emitted `fill`/`type`/`select` are thin adapters over
   `fillWithRecipe`/`typeWithRecipe`/`selectWithRecipe` with
   `snapshotBook(RECIPES)`, `RECIPES` rendered per flow by `recipesHelper`
   between the shared modules and the fixed helpers; a verified attempt logs
   `[sitelooper recipe] …` in the daemon's words. Deleted: `editorSetValue`,
   `EDITORS`, the inline `squash`, `EDITOR_SETTLE_MS`/`EDITOR_BLUR_SETTLE_MS`,
   both `waitForTimeout`s, `FILL_FOCUS_MS`; the direct `pressSequentially`
   emission (`type` now has a recipe path, with tools.ts's 20ms/10s). `repair`
   and `rerecord` write the snapshot of the store their verification runs used
   (`carryRecipeSnapshot`, `src/spec/ir.ts`): identical → the file's own
   snapshot and FLOW bytes; different → adopted with a `recipes: …` change
   line and the store's findings; no snapshot at all → one is added with a
   `recipe-snapshot` warning that `type`/`select` now go through recipes.
   Review fixes (C7 review): the component root is pinned as an
   `ElementHandle` at recognition and disposed on every exit (was a lazy
   Locator re-derived from the target each step); a throwing `onAttempt` is
   caught and surfaced as `attempt.warning` (appended to the daemon's result
   string); the emitted `fill` has no visibility pre-wait (`FILL_WAIT_MS`
   gone); `flowToSpec` snapshots/diagnoses only flows with a
   `fill`/`type`/`select` (loop bodies included); `lift` validates
   `FLOW.recipes`; the parity harness isolates `SITELOOPER_COMPONENTS_FILE`.
   Round trips are
   unchanged: an absent `recipes` loads and re-emits as absent; the pinned
   rebuild flows (`bench/rebuild-flow.mjs`) compare `Flow`s, not `SpecFlow`s,
   and need no field. What remains daemon-only, by design: store learning,
   validation, demotion and stats at run time — the artifact's book has no
   `onAttempt`. Still to do: run the fourth "editor recipes" parity case (a
   `fill` into the `hasText`-located `#draft` contenteditable, end of
   `test/execution-parity.test.ts`, fixture `/editor` in
   `test/fixture/server.ts`) in a browser — the first three passed; `test/execution-source.test.ts`'s
   `missing` assertion is `[]` again.
3. **Fingerprint vector in the IR: DONE except the browser run.** Two cases
   appended to the "gates" section of `test/execution-parity.test.ts` (a
   one-segment mismatch on a structurally identical page proceeds in both with
   the warning; the same mismatch against the project form's fingerprint
   refuses in both with no mutation and the same similarity) have NOT yet been
   run in a browser. Unit/emit/lift/repair/rerecord coverage passes.
4. **A query-shaped hash still travels in a verdict message.** `describeUrl`
   (`src/execution/gates.ts`) drops the query string before a message reaches a
   recovery prompt or a persisted run record, but `serializeShape` re-serialises
   a state-shaped hash, so `#access_token=…` still prints. Cheap to close.
5. **Remaining open gaps.** Echo-read detection (gap 10), the two replay-only
   recovery paths, loop-body `mints` last-wins vs accumulate, and retirement
   evidence (daemon-only by design). All are in `PARITY_GAPS.md` with current
   line numbers.
6. **Harness hazard: retired.** The last single-function cut
   (`runnablePick` in `test/spec-emit.test.ts`) went with C6 stage B; every
   emitted-helper case now rebuilds the whole helper block.
7. **Harness cells.** Twelve uncovered cells are listed at the end of
   `PARITY_GAPS.md`, in the order the harness should grow. Each remaining piece
   of work above names the cell that would prove it.

Out of scope on this branch, and not touched: duplicate recorder chain
verification, and the opt-in contract-weakening guards at mutation call sites.

## Working-tree artifacts

Untracked task artifacts include `.test-unit.log`, `.test-parity.log` and
`test/.parity-*/` from browser runs. Inspect and clean up only confirmed
task-owned temporary paths before final delivery. On Windows, resolve and verify
any recursive-delete target lies inside its intended workspace directory before
deleting it.

## Suggested commands

Run from `C:\dev\sitelooper` in PowerShell:

```powershell
git status --short
npm run build
npx vitest run test/execution-browser.test.ts test/execution-gates.test.ts `
  test/execution-expect.test.ts test/execution-lifecycle.test.ts `
  test/execution-loop.test.ts test/execution-source.test.ts test/spec-emit.test.ts
npm test

# Browser suites. Serially — concurrent Chromium instances add timing noise.
$env:BP_BROWSER_TESTS = '1'
$env:SITELOOPER_CHANNEL = 'chromium'
npm test
# Parity (~9 min) is on its own switch, BP_PARITY_TESTS=1, and is not part of
# `npm test`. Run it from time to time and before trusting a change to
# src/execution:
npm run test:parity
Remove-Item Env:BP_BROWSER_TESTS
Remove-Item Env:SITELOOPER_CHANNEL
```

The parity cases check the application's own mutation log, not merely that both
runners reported success. Fix actual discrepancies; do not adjust expectations to
make divergent behaviour pass.
