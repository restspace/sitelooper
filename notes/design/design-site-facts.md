# Site facts: one store of observed facts about an app, per origin (design, no code)

Written 2026-09-26 after the round 54-65 survey (bench/SWEEPS.md) and the convergence experiment. Base: main
at bd3ceff1 plus fix/repin-route-query. Paths are relative to `src/` unless they say otherwise.

## 0. The idea, and what the survey said

Of the ~45 non-green rows in rounds 54-65 and the convergence runs, about two thirds were decided by a
judgment about the APP that the tool made from a fixed heuristic while it already held the evidence to make
it from observation: is this query key view state or a record; does this app render 12500 as "12,500"; is
FURN_7777 a catalogue code or something this run minted. Each fix so far was one more heuristic
(routesByFragment, offeredBeforeReported, maskCounters, idPositionPart's `id`-only rule). None of them is
stored: every one is recomputed from one recording, or one session, and thrown away.

The proposal: one per-origin store of facts observed by the runner, with counts and provenance, read by
compile and by both runners from the same snapshot, so a judgment is made once from evidence and then relied
on. The three cheapest classes first, ordered by how much of the survey each decides and how much of its
evidence is already collected:

| class | survey rows | evidence already in hand | today's one-off rule |
|---|---|---|---|
| URL route | ~8 | every skill's `preconditions.urlPattern` and `expect.urlPattern`; the ledger's url admissions | routesByFragment (learn.ts:1424), idPositionPart (ledger.ts:107), linkMintedParts, `:var` generalisation written back per skill (agent/tools.ts:625) |
| display format | ~9 | the read-back cascade's `frame` (recorder.ts `captureReadBackAt`), `sweepFrame`'s `extra`, refill.ts `sameValue` | maskCounters, coreReadBack's edge affixes, foldValue |
| value class | ~9 | the run ledger (kind/basis), taskConstants/offeredBeforeReported (flow.ts:880), textMints, the credential scrub | "seen offered is app data" (round 59), stripLeakedCandidates, shape.ts looksLikeId |

Control behaviour (the largest class, ~14 rows) is phase D's subject and is out of scope here: its observers
are the phase C journals, and it needs a per-control key that this design only prepares for. Step timing is
noted in §6 as a one-line add.

Principles, in the order they matter:
1. **Observed, never asserted.** A fact is written by the runner from page evidence. The model never writes
   one (the same reason the model does not record its intent: an observation can be checked, a claim cannot).
2. **Counted before relied on, unless proven.** A fact carries `n` (observations), `sessions` (distinct
   recording or replay sessions), `contra` (contradicting observations) and `hard`. A HARD fact is one whose
   observation is a structural proof by the runner (the app rendered this typed value as that text at this
   control; this fragment carries a path; this query value was minted by the link the run just added): it is
   relied on from its first observation. A SOFT fact is statistical (a position that never varied, a shape
   two values share, a key two procedures differ on) and is relied on only at `sessions >= 2`. In both cases
   `contra` must be 0: a contradiction drops the fact to ADVISORY (logged beside today's heuristic, never
   deciding) and is logged; two contradictions in different sessions retire it. Which observations are hard is
   fixed per kind in §2-4 (user decision 2026-09-26: prefer one-session hard facts wherever the runner can be
   sure).
3. **One snapshot, both runners.** Compile freezes the origin's facts into the artifact (`FLOW.facts`, the
   recipes pattern), and the decision functions live in a shared execution module, so the daemon and the
   compiled spec decide alike. No parity gap can come from the store.
4. **Shadow first.** Stage 0 writes facts and logs whether each fact AGREES with the heuristic it will
   replace, on every run, before any consumer switches (the phase C pattern: shadow.jsonl, then keyPick).
5. **Nothing secret.** Facts pass `scrubSecretsDeep` at the write; credential-ambiguous values are recorded
   as a hash, never as text; no request bodies, no page text longer than a rendered value.

## 1. The store

**File.** `<skills root>/<originSlug>/site-facts.json`, beside the origin's procedures and `sitemap.json`.
It must be added to `NOT_A_PROCEDURE` (skills/store.ts:599) or `readDir` lists it as corrupt. Never a
root-level `*.json` (the legacy whole-file store shape). Absent means empty; a read never throws (the
`SiteModel.read` contract, skills/sitemap.ts:167). Writes are tmp-plus-rename under the origin lock.
Legacy stores (root-level `<host>_<port>.json` arrays) have no origin directory: the writer creates it, the
reader treats a missing one as empty. bench/corpus-check.mjs extracts the whole `<runid>-skills/` tree, so
a published store carries its facts and old stores compile with none.

**Shape** (`execution/facts.ts`, self-contained so runtime-source.ts can embed it):

```ts
interface SiteFacts { version: 1; origin: string; facts: Fact[] }
interface Fact {
  k: 'route.fragment' | 'route.query' | 'route.path' | 'format' | 'value.class';
  key: string;            // per kind, §2-4 (a route template, a field key, a value hash)
  v: string | number | boolean | Record<string, string>;  // the fact's value
  n: number;              // observations
  sessions: string[];     // distinct session ids, capped at 8 (the count is what matters)
  contra: number;         // contradicting observations
  hard: boolean;          // a structural proof (relied on from n=1) vs statistical (sessions >= 2)
  first: string; last: string;   // ISO times
  ev?: string;            // one short line of evidence for the last observation (scrubbed, <= 120 chars)
}
```

`reliable(f)` = `f.contra === 0 && (f.hard || f.sessions.length >= 2)`. `advisory(f)` = everything else present.
`observe(store, fact)` merges by `(k, key)`: same `v` bumps `n` and adds the session; a different `v` bumps
`contra` on the stored fact and records the new one as advisory. Facts of one origin are capped (2000) with
least-recently-observed eviction, so a busy app cannot grow the file without bound.

**Two APIs.**
- `skills/facts.ts` `SiteFactStore(root)` owns the files: `read(origin)`, `observe(origin, facts[], session)`,
  `snapshot(origin)`; used by the daemon (recorder, replay) and by compile.
- `execution/facts.ts` holds the types and the pure decision functions (`factFor(facts, k, key)`,
  `reliable`, and the per-class readers of §2-4). It is added to `EXECUTION_MODULES`
  (spec/runtime-source.ts:15) and imported by url.ts/gates.ts/report.ts/text.ts as a sibling.

**Compile and the artifact.** `SpecFlow.facts?: SiteFacts` (spec/ir.ts, next to `recipes` :43-54), taken in
`flowToSpec` from the store for the flow's origin(s) (a flow may cross origins: one snapshot per origin,
keyed by origin). Emitted by a `factsHelper(spec)` like `recipesHelper` (spec/emit.ts:1345):
`const FACTS: SiteFacts[] = <json>;`, ordered before the helpers that read it (`neededHelpers` :1284). It
rides in `FLOW`, so spec/lift.ts (:279) validates it and rerecord/repair carry it forward like
`carryRecipeSnapshot` (ir.ts:582), refreshed from the live store at each compile. `sitelooper compile --json`
reports `facts: {origin, relied: n, advisory: n}` and a diagnostic when a fact the flow relies on is
advisory (the fix line names the run that would confirm it).

**The shadow log.** Each consumer that will read a fact writes a row to `<root>/shadow.jsonl` (the phase C
writer, skills/shadow.ts:707) with `rule: 'facts.<consumer>'`, `fact`, `heuristic`, `agree`, on every
decision, in every stage. bench/ab-metrics.mjs gains `facts_written`, `facts_relied`, `facts_agree`,
`facts_disagree` rows; a disagreement is a row to read, in either direction.

## 2. URL route facts

**Keys.** A route template is `urlPattern(url, {query:false})` (compile.ts:2592) with every `:id`/`:var`
and slot marker written `*`: the same key sitemap.ts uses for a page.

| fact | key | value | observed when | by whom |
|---|---|---|---|---|
| `route.fragment` | origin | `'path' \| 'state' \| 'anchor'` | any url on the origin carries a fragment: `/`-shaped, `=`-shaped, or a bare word (urlShapeOf's own split, url.ts:126-130). HARD | recorder at every step diff; replay at every url expectation |
| `route.query` | `<route>?<key>` | `'state' \| 'identity' \| 'routing'` | `state`: the same route with the same identity parts seen with the key absent and present, or with two values, within one session and no record change between (fwop15's `query_props`; grafana's `refresh`): HARD. `identity`: the ledger admitted the key's value as a record by provenance (linkMintedParts, a landed mint: ledger.ts:530-615): HARD; by variance across runs: SOFT. `routing`: two stored procedures on the same path whose preconditions differ only in this key's literal and whose fingerprints differ (kanboard's `controller`): SOFT | recorder (diffs), ledger at `addUrlIds`, compile at `variantStart` |
| `route.path` | `<route>#<index>` | `'identity' \| 'constant'` | identity when `discoverMinted` (compile.ts:1582) or the ledger's landed path admission banks the position: HARD; constant when the position held the same literal across `sessions >= 2` while other positions varied: SOFT | compile, ledger |

**Consumers, in the order they switch (stage 1).**
1. `routesAgree` (learn.ts:1406): a `route.query` fact of `state` makes the key irrelevant to the route; of
   `routing` makes a differing literal a different page; `route.fragment` replaces `routesByFragment`.
2. `gotoLandingVerdict` (gates.ts:456) and `urlDiff`'s one-sided-key rule (url.ts:220-227): a reliable
   `routing` key that is one-sided is a different page (today it is taken on trust); a reliable `state`
   key never separates pages even with two literals.
3. `addUrlIds` admission (ledger.ts:530): a query key known `identity` on this origin is admitted on the
   FIRST run without the `id`-only rule (kanboard's `task_id`, vikunja's ids); a key known `routing` is
   never admitted, whatever its digits.
4. `rethreadUrlRefs` (spec/rerecord.ts:225) and `referencablePart` (flow.ts:204): a reported value equal
   to an `identity` position threads as `url.<label>` on the first run.
5. **Stored procedures are rewritten** (user decision 2026-09-26): when a `route.query` fact of `state`
   becomes reliable, every stored procedure on that origin whose `preconditions.urlPattern` or a step's
   `expect.urlPattern` carries the key with a literal is rewritten to `key=:var` through `store.update`
   (revision bumped, `factRewrites: [{k, key, at}]` noted on the skill); a `route.fragment` of `anchor`
   strips the bare anchor from those patterns. Only patterns are rewritten, never steps or locators, and a
   later contradiction does not un-rewrite (a wildcard is never wrong, only weaker).

Fallback everywhere: no reliable fact means today's rule, unchanged. Survey rows decided: fwop15-cv2,
fwsi9 (#history), fwsi7's goto landing, fwvk13 (another route's p1), fwkb41 (`task_id=4`), fwgr74 (uid
off the url), fwop5 (id at another path position), odoo's `cids`/`menu_id`.

## 3. Display format facts

**Key.** A field is `<route>|<role>|<name>` from the control the value was typed into or read from
(roleName, text.ts:219), else `<route>|<report key>` for a value the read-back cascade pinned by frame.

| fact | value | observed when |
|---|---|---|
| `format` | `{ kind: 'thousands' \| 'decimals' \| 'affix' \| 'upper' \| 'date' \| 'trim' \| 'twice' \| 'counter', tpl?: <pattern with {{=}} for the value> }` | (a) a typed slot's value later found at its own control or in a diff line in another spelling: refill.ts `sameValue` already computes digit equality for typing safety (`12500` vs `12,500.00`); record what it saw: HARD (the runner watched the app transform its own input). (b) the read-back cascade pins by containment or core: `frame` (`#{{=}}`, `{{=}} Bench Task`) IS the affix fact; record it under the key: HARD when the value is a proven mint or unique on the page, SOFT otherwise. (c) `sweepFrame` (agent/readback.ts:338-344) counts a textContent/innerText mismatch as `extra`: a hidden duplicate or a text-transform; record `twice`/`upper` for that role and name: HARD. (d) `maskCounters` matches: record `counter` for the control name: SOFT (a regex match is not a proof). (e) `page.title()` vs a reported value differing only by a suffix (" - Odoo"): `affix` on the title: HARD |

Only the transformation is stored (`from`→`to` as a pattern with the value cut out, `{{=}}`), never the
value: `{kind:'thousands', tpl:'#,###'}`, `{kind:'affix', tpl:'#{{=}}'}`, `{kind:'upper'}`.

**Consumers (stage 2).**
1. `classifyReportValue` / `committedSlots` (execution/report.ts:200, expect.ts:405): a typed value whose
   reliable format rendering appears in the commit diff is `committed`, not `echo` (espo "12,500").
2. `identityChecks` (spec/emit.ts:3427) and the daemon's identity gate (replay.ts:637): accept the
   formatted rendering of a bound marker (fwvk15's "identity not confirmed").
3. `captureReadBack` (recorder.ts:1188) and `displays` (readback.ts:147): try the field's known renderings
   before falling to the model (the "Seed: … (#1)" titles of fwgt8/fwsi8; "#4" of fwkb41).
4. `liveLines` (expect.ts:235): fill a slot in its rendered form for that control (kanboard "Backlog ").
5. `maskCounters`: per-origin `counter` facts extend the fixed regex to any role.

Survey rows decided: fwop10 (innerText/textContent), fwkb39, fwec13, fwgt8/fwsi8, fwkb41 (twice), fwec11,
fwod-cv3 counters, fwvk15, fwod85 (the lazy regex split is a `twice` on one row).

## 4. Value class facts

**Key.** `sha1(foldValue(v))` cut to 12 hex, so the file never holds the text of a value that might be a
secret or a name; `ev` carries at most the value's shape (`S\d{5}`), never the value. Mint shapes are keyed
by `<route>|<label>` (the url part or report key that carries them).

| fact | value | observed when |
|---|---|---|
| `value.class` (by hash) | `'constant' \| 'mint' \| 'credential'` | `constant`: offeredBeforeReported (flow.ts:917) decided it, or it was an option/menuitem/column text in a diff before any report: HARD; stated by an instruction (taskConstants' other arm): SOFT. `mint`: the ledger banked it with basis position or landed: HARD; by variance: SOFT. `credential`: the scrub filed it ambiguous (shared/secrets.ts:50): HARD |
| `value.shape` (by `<route>\|<label>`) | `{ re: <regex source>, n }` | two DISTINCT minted values under one label share a shape: `S0002[0-9]`, `BA-0000[0-9]` → `^S\d{5}$`, `^BA-\d{5}$` (shape.ts's own tokeniser, generalising digits to `\d` runs and keeping letter runs and punctuation): HARD once two distinct values agree, in one session or two |

**Consumers (stage 3).**
1. Ledger `add` prior (ledger.ts:468): a reliable `constant` is never an identifier whatever its shape
   (FURN_7777); a value matching a reliable `value.shape` is an identifier at first sighting, even under
   `MIN_ID_LEN` ("4" of `#4` when `^#?\d+$` is the shape under `task_id`).
2. `stripLeakedCandidates` (daemon/server.ts:187) reads the same prior.
3. The sourcing hold (agent/sourcing.ts `isDataShaped`): a reported value matching a reliable mint shape
   and not yet read is held for a read even when unasked (the fwsi16 refusal: unasked list columns threaded
   to later literals). Compile side: never thread a later step's literal to a value whose class is `mint`
   and whose step never read it.
4. The credential scrub: a value known `credential` on this origin is scrubbed in a snapshot line outside
   the password field too (fwgr68/fwkb39 password = username), since the fact says the app shows it.

Survey rows decided: fwod84, fwkb41 (core), fwec8, fwgh14, fwsi14 (wrong of two banked, the minted tag),
fwod88 (a read locator naming its own mint), fwgr68/fwkb39, fwvk15, fwsi16.

## 5. Stages, verification and what each stage must show

Every stage: a fix branch, the cloud verify (suite, browser, parity, corpus 0 status changes), merge, then
the two convergence re-runs that exercise it (fwop15-cv3 and fwsi14-cv3 for routes; fwod88/fwec for
formats; fwod84-class and fwsi16 for classes) and a five-app batch (bench/sweep-prompts, ≤5 boxes/hour).

- **Stage 0, the manager and the observers, shadow only.** `execution/facts.ts`, `skills/facts.ts`, the
  file, `NOT_A_PROCEDURE`, the compile snapshot into `FLOW.facts` with lift and carry-forward, the shadow
  rows, the ab-metrics rows, `compile --json` `facts`. Observers for all three classes write facts; no
  consumer switches. Exit: corpus 0 changes; on the batch, every fact written is listed with its `n` and the
  shadow agreement per consumer is ≥ 95% or the disagreements are explained one by one.
- **Stage 1, URL route consumers** (§2, consumers 1-4). Exit: fwop15-cv3 re-pins 01-open on the
  `route.query` fact once it is reliable (two sessions: the recording and one replay), fwsi14-cv3 gets
  past 03-open, corpus 0 changes.
- **Stage 2, display format consumers** (§3). Exit: the espo amount and the vikunja identity cases from
  the fixture corpus (test/fixture) decide from facts; corpus 0 changes.
- **Stage 3, value class consumers** (§4). Exit: fwod84's FURN_7777 and fwsi16's unasked columns decide
  from facts on a fresh recording; corpus 0 changes.

Sizes, from the maps: stage 0 is the largest (store, snapshot, lift, carry, shadow, observers: about 600
lines plus tests); stages 1-3 are each a handful of call sites behind `reliable()` with the old rule as the
fallback (100-200 lines each plus fixture tests).

## 6. Out of scope, and one cheap add

- Control behaviour facts (phase D): the key would be `<route>|<role>|<name>` from §3, the observers the
  phase C journals; this design leaves the key shape ready and adds nothing else.
- Step timing: timing.jsonl has per-instruction totals only (state.ts:140), so a per-step budget fact
  needs a `stepMs` per recorded step first. Worth one line in the recorder and one in `budgetMs`
  (spec/emit.ts:4343): a flow's budget is max(cap, 2 × observed) rather than a fixed 300 s (odoo ran 259 s
  against it). Not part of stages 0-3 unless asked.
- A user-editable facts file (declaring "query_props is state" by hand): deliberately not now. Every fact
  here is observed; a declared fact would need its own provenance kind and its own trust rule.

## 7. Decisions (user, 2026-09-26)

1. The unit is the ORIGIN, never merged: one facts file per origin directory. A cross-origin app holds a
   fact once per origin it was observed on.
2. A reliable fact MAY rewrite a stored procedure's url pattern (§2 consumer 5); patterns only, never steps.
3. Reliability: hard facts from one observation, soft facts from two sessions, zero contradictions in both
   cases (§0 principle 2). The stage 0 shadow numbers will say whether any kind is misfiled hard or soft.
4. No cap on the cloud runs of the sequence in §5; the five-boxes-per-hour rule stands.
