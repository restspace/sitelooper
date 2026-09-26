# Site facts, stage 1: URL route consumers — build contract

Design: notes/design/design-site-facts.md §2 (facts, consumers 1-5), §5 (stage 1 exit), §7 (decisions).
Stage 0 shipped (main de6c0cb5, exited on round 67): the store, the observers, the shadow rows, and the
fact-based decision functions in src/skills/facts-url.ts (`routesAgreeByFacts`, `landingByFacts`,
`preconditionByFacts`) that stage 0 computed only to compare. Stage 1 SWITCHES them on, behind `reliable()`,
with today's rule as the fallback everywhere a fact does not decide.

Branch: feat/site-facts-1. Four pieces, parallel, from this contract. Every piece: `npx tsc -p tsconfig.json
--noEmit` clean, its tests green one vitest at a time (`--pool=forks --poolOptions.forks.maxForks=1`), no git
command that moves a ref or touches the index/stash. The lead commits.

## Principles that bind every piece

- **One decision, two runners.** Whatever the daemon's replay decides from a fact, the compiled artifact
  decides identically from the snapshot it carries (`FLOW.facts`, read through `siteFactsAt(url)`). So the
  decision code lives in `src/execution/` (embedded via EXECUTION_MODULES) and takes a `SiteFacts` argument;
  src/skills/ only reads the store and hands the snapshot over. test/execution-parity.test.ts must stay green.
- **Reliable or nothing.** A consumer switches only on `reliable(f)` (0 contradictions and hard, or ≥2
  sessions). An advisory fact never changes a decision; it still writes its shadow row.
- **The shadow rows stay.** Every switched site keeps writing its `facts.*` row; add `applied: true` to the
  row when the fact decided. bench/ab-metrics.mjs / facts-report.mjs need no change (extra field).
- **Fallback is today's rule, byte-identical.** With no reliable fact the old code path runs unchanged; the
  corpus check must show 0 status changes (no published store carries a site-facts.json).
- **A wildcard is never wrong, only weaker.** A pattern rewrite widens; nothing ever narrows a stored pattern.

## Shared vocabulary (exact)

- `SiteFacts`, `Fact`, `reliable`, `fragmentFact`, `routeQueryFact(sf, url, key)`,
  `pathPositionFact(sf, url, index)`: src/execution/facts.ts, unchanged.
- **`routeTemplateOf(url, identityParts?: readonly string[])`** (src/execution/facts.ts, Piece F, first
  thing it does): a path or fragment-path segment whose `p<i>=<value>` / `h<i>=<value>` label is in
  `identityParts` is written `*` as a record segment is. Grafana's letters-only dashboard uid
  (`/d/afzexqoxkzoqod/…`, fwgr78 round 67) froze inside fact keys because `recordSeg` wants digits; the
  ledger had admitted it at p1. Every key builder passes the parts it has: the RouteObserver its
  `identityParts` (facts-url.ts noteUrl), the value observer the ledger's admitted parts (facts-value.ts
  urlFactKey / shapeKeyOf, Piece H), learn's routing observer nothing (patterns already carry `:id`).
- **`src/execution/facts-route.ts`** (new, Piece F; add `'facts-route'` to EXECUTION_MODULES after `'facts'`):
  the pure decision helpers moved out of src/skills/facts-url.ts — `disputedKeys`, `queryFacts`, `queryKind`,
  `literal`, `rewriteQuery`, `landingByFacts`, `preconditionByFacts`, `routesAgreeByFacts` — with the same
  signatures, plus:
  - `landingVerdictWithFacts(sf, target, landed, where): string | null` = `gotoLandingVerdict` unless a
    reliable `route.query` fact decides (then `landingByFacts(...).stop ? <the same message text
    gotoLandingVerdict would give, prefixed "by fact: "> : null`).
  - `preconditionVerdictWithFacts(sf, pattern, url, params, similarity, mints): PreconditionVerdict` =
    `preconditionVerdict` unless a reliable `route.query` or `route.fragment` fact decides (widen the pattern:
    reliable `state` keys → `:var`; a reliable `anchor` fragment → strip bare anchors from BOTH pattern and
    url before judging; then judge with `preconditionVerdict`; a reliable `routing` key one side carries
    alone refuses with a reason naming the fact).
  Its imports: `./facts.js`, `./url.js`, `./gates.js` only (no skills/, no daemon/).
- **`applied`**: `FactShadowRow` gains `applied?: boolean` (facts-url.ts factRow takes it; facts-format.ts and
  facts-value.ts rows stay as they are).

## Piece F (opus): parity — the gates decide from facts in both runners
Files: src/execution/facts.ts (routeTemplateOf overload only), src/execution/facts-route.ts (new),
src/spec/runtime-source.ts (one entry), src/skills/facts-url.ts (import the moved helpers from
execution/facts-route.js; `noteUrl` keys through `routeTemplateOf(url, identityParts)`; `replayFactsFor` gains
`snapshot(url): SiteFacts` reading the live store's origin), src/skills/replay.ts (the goto landing gate and
the precondition gate call the `…WithFacts` forms with `opts.facts?.snapshot(url) ?? emptyFacts(origin)`;
the shadow calls stay and get `applied`), src/spec/emit.ts (the two emitted call sites — the goto landing
check at the `gotoLandingVerdict(` template and runFlow's precondition at the `preconditionVerdict(` template
— become the `…WithFacts` forms with `siteFactsAt(url)`; `void siteFactsAt;` goes away; the runtime source
scan must see the new tokens), test/facts-route.test.ts, and the existing test/execution-gates.test.ts +
test/execution-parity.test.ts must pass. Also test/execution-source.test.ts (the embed test) for the new
module.
Cases to cover: fwop15's `?query_props` (state → the precondition passes with the key absent/different),
kanboard's `?controller=` (routing → one-sided refuses), snipeit's `#history` (anchor → stripped both sides),
grafana's `?refresh` (state), and "no reliable fact → byte-identical to the old verdict".

## Piece G (opus): learn-time consumers and the pattern rewrite
Files: src/skills/learn.ts (`pinEndsElsewhere`/`pinStartsElsewhere`: when `routesAgreeByFacts(...).decided`
with a reliable fact, its `agree` replaces today's; the shadow row gets `applied`), src/skills/facts-rewrite.ts
(new: consumer 5 — `rewriteStoredPatterns(store, origin, sf): {skill, field, from, to}[]`: for every reliable
`route.query` `state` fact, every skill on the origin whose `preconditions.urlPattern` or a step's
`expect.urlPattern` carries that key with a literal is rewritten to `key=:var` via `store.update` (revision
bumps; `factRewrites: [{k, key, at}]` appended on the skill — add the optional field to `Skill` in store.ts
beside `revision`); for a reliable `route.fragment` `anchor`, a bare-word fragment is stripped from those
patterns; idempotent; called from learn.ts right after `observeRouting` and from the flow-run outcome flush in
server.ts (D1's `flushSiteFacts` site: one call, additive), never from the artifact), src/spec/rerecord.ts
(`rethreadUrlRefs`: a recorded value equal to a url part whose position has a reliable `route.path identity`
fact threads as `url.<label>` even when `referencablePart` says no — pass `sf` in; the caller in cli.ts/
rerecord passes the store's snapshot), src/skills/flow.ts (`referencablePart(part, runSpecific, sf?)`: an
`identity` position fact admits the part; thread `sf` from buildFlow's opts — add `facts?: SiteFacts` to
its options, the daemon passes it at export), test/facts-rewrite.test.ts, test/repin-round57.test.ts extended
with a facts case (fwop15: a reliable `query_props = state` fact makes the two routes agree without
`routesAgree`'s own urlDiff path).
Do NOT edit src/execution/*, src/skills/facts-url.ts, src/skills/ledger.ts, src/daemon/server.ts beyond the
one rewrite call.

## Piece H (opus): the ledger consumer and identity-aware keys
Files: src/skills/ledger.ts (`addUrlIds` gains `facts?: SiteFacts`: a query key with a reliable `identity`
fact on this route is admitted on the first run without the `id`-only digit rule; a key with a reliable
`routing` fact is never admitted whatever its digits; a path position with a reliable `identity` fact is
admitted as vouched; otherwise unchanged), src/daemon/server.ts (`noteMintedIds` passes the origin's snapshot
from `this.valueFacts()`'s store to `addUrlIds`; the ValueFactObserver's `noteUrl` receives the admitted
parts as today), src/skills/facts-value.ts (`urlFactKey(url, label, identityParts)` and `shapeKeyOf(url,
label, identityParts)` route through `routeTemplateOf(url, identityParts)`; the observer passes the ledger's
admitted url parts of that url (`p<i>=<v>`, `h<i>=<v>` labels; query keys are not path parts)), bench/
rebuild-flow.mjs (mirror: `addUrlIds(..., facts)` with the rebuild store's snapshot — the rebuild's own
`storeFrom` has no facts; pass `undefined`, and say so in a comment), test/facts-value.test.ts extended
(grafana uid: two sessions' keys agree once p1 is an identity part), test/ledger.test.ts extended (the three
admission cases). Poll for Piece F's `routeTemplateOf` overload before using it (do not write it yourself).

## Piece I (sonnet): fixtures, bench, docs
- test/facts-stage1-corpus.test.ts: from the survey rows in design §2 ("Survey rows decided"), one case
  each, driven through the PUBLIC functions (`preconditionVerdictWithFacts`, `landingVerdictWithFacts`,
  `routesAgreeByFacts`, `rewriteStoredPatterns`, `addUrlIds` with facts): fwop15-cv2 (query_props),
  fwsi9/fwsi14-cv3 (#history anchor: the stored pattern `/hardware/:id#history` is rewritten to
  `/hardware/:id` and the gate passes on `/hardware/4`), fwsi7 (goto landing), fwvk13 (p1 identity on
  another route), fwkb41 (`task_id=4` admitted first run), fwgr74 (uid at p1 threads as url.p1), odoo
  `cids`/`menu_id` (state). Build each SiteFacts by hand with `observeFact` over two sessions where the
  fact is soft. Poll for the pieces' exports (wait, do not write them).
- bench/sweep-prompts/fwop15-cv4.md and fwsi14-cv4.md from the -cv3 prompts (code gate: `grep -q
  'function landingVerdictWithFacts' src/execution/facts-route.ts`), and a round-68 five-app batch
  (fwop22 fwsi19 fwgt20 fwod94 fwgr79) from the round-67 prompts with the publish-first wording and a
  "WHAT THIS IS (round 68: site facts stage 1 …)" paragraph; add F4: "every `applied: true` shadow row,
  verbatim".
- bench/facts-report.mjs: print `applied` on a row when present; notes/design/README.md status line;
  bench/README.md one sentence.

## Exit for stage 1 (the lead checks)
- Suites, browser, parity green; corpus 0 status changes (cloud verify).
- fwop15-cv4: 01-open re-pins on the reliable `query_props = state` fact (one recording + one replay);
  fwsi14-cv4: 03-open's stored pattern loses `#history` and the artifact gets past 03-open.
- Round 68: every result matches or beats its round-67 row; every `applied` row read.
