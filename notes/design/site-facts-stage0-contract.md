# Site facts, stage 0: the build contract

Companion to design-site-facts.md (read it first; §7 has the user's decisions). Stage 0 ships the manager,
the compile snapshot, the observers for all three classes, and SHADOW rows for every consumer that will
switch in stages 1-3. No consumer decides from a fact in stage 0. Branch: `feat/site-facts-0` off main.
Every piece below names its files; a piece edits ONLY its files. No piece runs `git stash`, `git checkout`
or any command that moves refs; the lead commits. Tests run with `npx vitest run <file> --pool=forks
--poolOptions.forks.maxForks=2`; `npm run build` must pass (tsc strict) before a piece reports done.

## Shared vocabulary (exact)

```ts
// src/execution/facts.ts — self-contained: the ONLY import allowed is `./url.js` (sibling), no node builtins.
export type FactKind = 'route.fragment' | 'route.query' | 'route.path' | 'format' | 'value.class' | 'value.shape';
export type FactValue = string | { kind: FormatKind; tpl?: string } | { re: string; n: number };
export type FormatKind = 'thousands' | 'decimals' | 'affix' | 'upper' | 'date' | 'trim' | 'twice' | 'counter';
export interface Fact {
  k: FactKind; key: string; v: FactValue;
  n: number; sessions: string[]; contra: number; hard: boolean;
  first: string; last: string; ev?: string;
}
export interface SiteFacts { version: 1; origin: string; facts: Fact[] }
export interface Observation { k: FactKind; key: string; v: FactValue; hard: boolean; session: string; at?: string; ev?: string }
export type ObserveOutcome = 'new' | 'confirmed' | 'contradicted' | 'retired';
export const SITE_FACTS_VERSION = 1, MAX_FACTS = 2000, MAX_SESSIONS = 8, MAX_EV = 120;
```

Keys, exact:
- `route.fragment`: key = `''` (one per origin); v = `'path' | 'state' | 'anchor'`.
- `route.query`: key = `${route}?${queryKey}`; v = `'state' | 'identity' | 'routing'`.
- `route.path`: key = `${route}#${index}`; v = `'identity' | 'constant'`.
- `format`: key = `${route}|${role}|${name}` for a control, `${route}|${reportKey}` for a report value,
  `${route}|title` for the document title; v = `{kind, tpl?}` where tpl uses `{{=}}` for the value
  (`'#{{=}}'`, `'{{=}} - Odoo'`); `thousands` and `decimals` carry no tpl (`decimals` means a `.00` tail).
- `value.class`: key = `valueHash(value)`; v = `'constant' | 'mint' | 'credential'`; ev never holds the value.
- `value.shape`: key = `${route}|${label}` (label = a url part label `p1`/`q.id` or a report key);
  v = `{re, n}` with `re` from `shapeOf`.
- `route` everywhere = `routeTemplateOf(url)`: origin + path with every segment that `isWildcardSeg` or is
  digit-dominant (2+ digits, any letters) written `*`; no query, no fragment, except a `/`-shaped fragment
  path which is appended as `#/a/*`. (This is `urlPattern(url,{query:false})` with markers normalised; it
  is reimplemented in facts.ts from `urlShapeOf` because compile.ts is not embedded.)

## Piece A (opus): `src/execution/facts.ts` + `test/facts.test.ts`

Pure functions over `SiteFacts`:
- `emptyFacts(origin)`, `routeTemplateOf(url)`, `foldValue(s)` (collapse whitespace, trim, lowercase — the
  flow.ts:2240 rule, copied so the module stays self-contained), `valueHash(s)` = 64-bit FNV-1a of
  `foldValue(s)` as 16 hex chars (no crypto import), `shapeOf(s)` = a regex source: letter runs and
  punctuation escaped literally, every digit run → `\d+`, anchored `^…$`; `shapeAgrees(a, b)` = same source.
- `observeFact(sf, o): {fact, outcome}`: match by `(k, key)` AND `sameFactValue(v)`: bump `n`, add
  session (dedupe, cap MAX_SESSIONS), `last = at`, `hard ||= o.hard`, `ev = o.ev` clipped → `confirmed`;
  no such fact but another value under `(k, key)`: that other fact's `contra++` (each of them), the new one
  is added → `contradicted`; a fact reaching `contra >= 2` with the contradictions in two sessions is
  removed → `retired` reported for it; nothing under the key → `new`. Then `evict(sf)` to MAX_FACTS by
  oldest `last`.
- `reliable(f) = f.contra === 0 && (f.hard || f.sessions.length >= 2)`; `advisory(f) = !reliable(f)`.
- `factsFor(sf, k, key): Fact[]`; `factFor(sf, k, key): Fact | null` = the single reliable fact, or null
  when none or more than one is reliable (two reliable facts under one key is a contradiction the observer
  missed: return null, never guess).
- Readers (reliable only): `fragmentFact(sf)`, `routeQueryFact(sf, url, key)`, `pathPositionFact(sf, url,
  index)`, `formatFacts(sf, key): {kind, tpl?}[]`, `renderings(sf, key, value): string[]` (applies each
  reliable format: affix tpl, upper, trim, thousands as `#,###` grouping of the integer part, decimals as
  `.00`; `date`/`twice`/`counter` add nothing), `valueClassFact(sf, value)`, `shapeFact(sf, key): {re} |
  null`, `matchesShape(sf, key, value)`.
- `summarise(sf): {origin, relied, advisory, hard, soft}` for `compile --json`.
- `MAX_EV` clipping and the rule that `ev` is dropped when it contains a session's runid-shaped token is the
  caller's job, not this module's, but `observeFact` clips length.
Tests: every function; observe/confirm/contradict/retire sequences; two-reliable → null; renderings of
`12500` with thousands+decimals → `12,500.00`; `shapeOf('S00023') === shapeOf('S00041')`; `routeTemplateOf`
on the fwop15 (`?query_props=…`), snipeit (`/hardware/4#history`), espo (`#Opportunity/view/abc`) and
kanboard (`/?controller=X&action=show&task_id=4`) urls.
Also: add `'facts'` to `EXECUTION_MODULES` in `src/spec/runtime-source.ts:15` (placed after `'url'`) and
confirm `npx vitest run test/runtime-source*.test.ts test/execution-source*.test.ts` (whatever exists that
checks the embed) still passes.

## Piece B (sonnet): `src/skills/facts.ts` + `src/skills/store.ts` (one line) + `test/facts-store.test.ts`

- `export const SITE_FACTS_FILE = 'site-facts.json'`; add it to `NOT_A_PROCEDURE` (store.ts:599).
- `export class SiteFactStore { constructor(root = skillsDir()); path(origin); read(origin): SiteFacts;
  observe(origin, obs: Observation[]): {written: number; outcomes: ObserveOutcome[]}; snapshot(origin):
  SiteFacts }`. `read` never throws: missing file, missing directory, bad JSON or wrong version → `emptyFacts`
  (log once per origin at debug). `observe` = read, `observeFact` each, `scrubSecretsDeep` (shared/secrets.js)
  on the whole document, write tmp + rename, under the same per-file lock helper store.ts uses (export it if
  private). `snapshot` = a structuredClone with facts sorted by `(k, key)`. `originOf` from execution/url.js.
- `export function siteFactStore(): SiteFactStore` singleton on `skillsDir()`.
Tests: absent → empty; corrupt → empty; observe writes the file and `SkillStore.readDir` does not list it as
corrupt; a credential-looking value in `ev` is scrubbed; two stores on the same root see each other's writes.

## Piece C (opus): compile snapshot — `src/spec/ir.ts`, `src/spec/emit.ts`, `src/spec/lift.ts`, `src/spec/rerecord-input.ts`, `src/cli.ts` (repair carry + `compile --json`), `test/facts-snapshot.test.ts`

- `SpecFlow.facts?: SiteFacts[]` (ir.ts beside `recipes`, :43-54): one entry per origin any segment's
  `preconditions.urlPattern` names, from `siteFactStore().snapshot(origin)`, in `flowToSpec` (:360-532).
  Empty snapshots (no facts) are still included so the artifact knows the origin was consulted.
- `carryFactSnapshot(prev, next)` beside `carryRecipeSnapshot` (ir.ts:582): facts are always refreshed from
  the live store; returns `{changed: number}` for the report. Wire it where `carryRecipeSnapshot` is called
  (cli.ts:1867, rerecord-input.ts:157).
- emit.ts: `factsHelper(spec)` like `recipesHelper` (:1345): token `FACTS`, source
  `const FACTS: SiteFacts[] = <JSON>;` and `const siteFactsAt = (url: string): SiteFacts => FACTS.find((f) =>
  f.origin === originOf(url)) ?? emptyFacts(originOf(url) ?? '');`. Pass it in `neededHelpers` (:4109).
  Reference `siteFactsAt` from one fixed helper so the token is always needed (a no-op line in `runFlow`'s
  preamble: `void siteFactsAt;` is acceptable for stage 0).
- lift.ts (:279): validate `FLOW.facts` as an optional array of `{version:1, origin, facts:[]}`.
- `compile --json`: add `facts: summarise(sf)[]` to the JSON and one line per origin in the human output
  (`facts http://…: 3 relied (2 hard), 1 advisory`).
Tests: compile a fixture flow (any existing fixture store, e.g. test/fixture/fwsi9-skills, copied to a tmp
dir) with a `site-facts.json` written into its origin directory → `FLOW.facts[0].facts.length` matches;
without the file → `FLOW.facts[0].facts` is `[]`; lift round-trips; the emitted flow file type-checks
(reuse the existing "generated public API typechecks" harness).

## Wave 2 (after A-C build): observers and shadow rows

Common: every observer takes `(store: SiteFactStore, origin, session)` and writes through `observe`;
`session` is the daemon session name (the recorder's) or the replay run id; observers are called from the
daemon only (the artifact never writes facts). Every shadow row is `writeShadow`'s `ShadowRow`
(skills/shadow.ts:23) with `rule: 'facts.<consumer>'`, `fact: <the fact-based decision or 'none'>`,
`heuristic: <today's decision>`, `agree: boolean`, `evidence: {k, key, v, reliable}`; rows are written via
the existing `writeShadow` at learn.ts:193 (recording) and a new call at the end of a replay run
(daemon/server.ts, where the run's outcome is recorded) — collect rows in memory per session and flush there.

### Piece D1 (opus): URL route observers + route shadow rows — `src/skills/facts-url.ts` (new), `src/agent/tools.ts` (the commit hook), `src/skills/learn.ts` (routing fact + shadow for routesAgree), `src/skills/replay.ts` (url expectation hook + shadow for the goto/identity gates), `test/facts-url.test.ts`
- `RouteObserver` (per session): `noteUrl(url, identityParts: string[], mintedSinceLast: boolean)` at every
  recorder commit (tools.ts:958-966, the page url after the step) and at every replay url expectation
  (replay.ts:1875-1908). Emits `route.fragment` (hard) on any fragment; `route.query` `state` (hard) when
  the same route with equal identity parts was seen with a key absent and present, or with two values, and
  no mint happened between; `flush()` returns the observations.
- `routing` (soft): in learn.ts after compileSkills: two skills on the same route whose preconditions differ
  only in one query key's literal and whose fingerprints differ → `route.query` `routing`.
- Shadow: `routesAgree` (learn.ts:1406): compute the decision with facts (state key ignored, routing key
  literal-compared, fragment fact instead of routesByFragment) beside today's → row `facts.routesAgree`.
  `gotoLandingVerdict` and the precondition gate (replay.ts:691, :2026): row `facts.landing` when a
  `route.query` fact exists for a one-sided key.

### Piece D2 (opus): display format observers + shadow — `src/skills/facts-format.ts` (new), `src/daemon/recorder.ts` (captureReadBackAt frame, titleReadBack, commit of fill/type), `src/agent/readback.ts` (sweepFrame extra), `test/facts-format.test.ts`
- (a) after a fill/type commit: the control's `value` or `innerText` (the recorder has the resolved handle in
  `prepare`; read it after settle) vs the typed text: equal after fold → nothing; digits equal
  (refill.ts `sameValue`) with grouping → `thousands` (+`decimals` for a `.dd` tail), hard; equal after trim →
  `trim`, hard; equal after lowercase only → `upper`, hard. Key `${route}|${role}|${name}`.
- (b) `captureReadBackAt` containment: `frame` → `affix` with tpl = the frame, key `${route}|${reportKey}`,
  hard when `recordIdsOf` names the value or the text is unique on the page, else soft.
- (c) `sweepFrame` extra → `twice` (hidden duplicate) or `upper` (case-only mismatch), hard, key by
  role|name of the element.
- (d) `maskCounters` match on a diff added line → `counter`, soft, key by role|name.
- (e) `titleReadBack`: title = value + suffix → `affix` on `${route}|title`, hard.
- Shadow: `captureReadBack` (recorder.ts:1188): when the exact match fails, would a reliable rendering
  have matched? row `facts.readback`. `classifyReportValue` call in learn.ts synthesize: would a rendering
  make a typed slot `committed` instead of `echo`? row `facts.classify`. Identity gate (replay.ts:637):
  row `facts.identity`.

### Piece D3 (opus): value class observers + shadow — `src/skills/facts-value.ts` (new), `src/daemon/server.ts` (the ledger hook at noteMintedIds/addUrlIds :123-151 and stripLeakedCandidates :187), `src/skills/flow.ts` (taskConstants/offeredBeforeReported), `src/shared/secrets.ts` (ambiguous credential), `test/facts-value.test.ts`
- Ledger admissions (server.ts:138 → ledger.ts:530-615 result): basis `position`/`landed`/link-minted →
  `value.class` `mint` hard AND the url fact `route.query identity` / `route.path identity` hard (D3 owns
  every ledger-derived fact, D1 does not touch the ledger); basis `variance` → the same facts soft.
- `offeredBeforeReported` true → `constant` hard; the stated-by-instruction arm → `constant` soft.
- secrets.ts ambiguous → `credential` hard (key = hash; `ev` empty).
- `value.shape`: at instruction end, for each label with ≥ 2 distinct minted values (ledger + existing
  facts' `ev`-free count: keep the last two shapes per label in the observer's session memory) whose
  `shapeOf` agree → hard.
- Shadow: ledger `add` prior (row `facts.ledger`: would a constant/shape fact change `kind`?),
  `stripLeakedCandidates` (row `facts.strip`), sourcing `isDataShaped` (row `facts.sourcing`, only when the
  hold flag is on).

### Piece E (sonnet): `bench/ab-metrics.mjs`, `bench/README` or SWEEPS note, `bench/corpus-check.mjs` (no change expected; confirm), `notes/design/README.md`
- ab-metrics rows: `facts_written`, `facts_hard`, `facts_soft`, `facts_relied`, `facts_shadow_rows`,
  `facts_agree`, `facts_disagree`, per run, read from the published store's `*/site-facts.json` and
  `shadow.jsonl` rows whose rule starts with `facts.`.
- A `bench/facts-report.mjs` that prints every fact of a published store with n/sessions/contra/hard and
  every `facts.*` shadow disagreement with its evidence (the stage 0 exit review reads this).

## Exit for stage 0 (the lead checks)
- `npm run build`, unit suite, browser suite, parity suite green; corpus check 0 status changes (cloud verify).
- On the five-app batch: facts written on every app; per consumer, agree ≥ 95% or every disagreement read
  and explained in bench/SWEEPS.md.
