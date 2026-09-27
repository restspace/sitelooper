# Site facts, stage 4: value MEANING facts (seed names and value roles) — build contract

Design: notes/design/design-site-facts.md §4 (value facts) and §4b (added by this stage, Piece T). Stages 0-3
are on main (65f435b0, a6d791d0). The value observers and shadow rows live in src/skills/facts-value.ts
(`ValueFactObserver`, `valueVerdict`, `shapeKeyOf`, `ledgerRow`, `stripRow`, `sourcingRow`); the readers in
src/execution/facts.ts (`valueClassFact`, `shapeFact`, `matchesShape`, `valueHash`, `foldValue`); the export's
threading and its exclusions in src/skills/flow.ts (`buildFlow`, `commentaryReport`, `statedBeforeShown`,
`baselineOf`, `threadOutsideQuotes`, `threadIntoLiteral`, `threadsAnywhere`); the daemon's banking in
src/daemon/server.ts (`noteMintedIds`).

**The gap this stage closes (round 70, openproject fwop24).** 01-signin reported `admin_first_name = "Bench"`
(the seed admin's display name "Bench Admin" is in the user menu); buildFlow threaded the word into the task's
own quoted names ('Bench Project', '{{runid}} Bench Work Package'); nothing reads a first name, so compile
refused the flow and every replay step went to recovery. The quoted-literal guard (a6d791d0) closed it by
PUNCTUATION: a word inside the author's quotes is left alone. This stage closes it by MEANING: the store
learns which displayed names are the app's SEED data (shown before any run changed anything, in two
sessions), and a reported value that is a fragment of a seed name is neither threaded nor banked, wherever it
stands. Likewise a reported value whose label is known to carry a picker STATE ("closed") or a COUNT ("3") is
never threaded, banked as an identifier, or made an identity marker — the gitea fwgt17 class, today caught
only when no page line shows the word.

Branch: feat/site-facts-4 (from main). Three pieces, parallel, from this contract. Every piece: `npx tsc -p
tsconfig.json --noEmit` clean, its tests green one vitest at a time (`npx vitest run <file> --pool=forks
--poolOptions.forks.maxForks=1`), no git command that moves a ref or touches the index/stash (no checkout,
commit, stash, reset, pull). The lead commits. Never print the OpenRouter key. Do not touch notes/BLOG_POST.md.

## Principles (as stages 1-3)
- Reliable or nothing; advisory facts write their shadow row and decide nothing. `reliable(f)`: contra 0 and
  (hard or sessions >= 2). Every fact in this stage is SOFT (two sessions) — none is a structural proof.
- Fallback byte-identical: with no reliable fact, every rule is today's. Corpus 0 status changes.
- Shadow rows for every decision, `applied: true` when a fact decided against (or ahead of) the heuristic.
- The dangerous direction is a LITERAL that acts on run 1's record. These facts only ever make a value LESS
  of a run value (seed, state, count); where a reliable `mint` or `value.shape` fact says identifier for the
  same value, MINT WINS (stage 3's rule) — a seed or role fact never overrides a mint.
- The store never holds a name in the clear: a seed fact is keyed by `valueHash(foldValue(name))` and carries
  NO `ev`. A role fact's key is `<route>|<label>` (a label, never a value) and its `v` is the role word.
- No new predicate call sites for `looksLikeId` (test/shape-gate.test.ts pins the total at 9): use "contains a
  letter" / "digits only" tests instead, and do not import looksLikeId anywhere new.

## Shared vocabulary (exact — every piece codes against these signatures; Piece R implements them)
In src/execution/facts.ts (embedded module: pure, no node builtins, sibling url module only):
- `export type FactKind = 'route.fragment' | 'route.query' | 'route.path' | 'format' | 'value.class' | 'value.shape' | 'value.role';`
- `export type ValueRole = 'state' | 'count' | 'name';`
- `valueClassFact(sf, value): 'constant' | 'mint' | 'credential' | 'seed' | null` (the reliable class fact of
  `valueHash(value)`; unchanged semantics, one more value).
- `export function seedNameFact(sf: SiteFacts, name: string): boolean` — a RELIABLE `value.class` fact of
  `valueHash(name)` with `v === 'seed'` exists AND no reliable `mint` fact of the same hash (mint wins).
- `export function valueRoleFact(sf: SiteFacts, key: string): ValueRole | null` — the reliable `value.role`
  fact under `key` (`factFor` semantics: the one fact of that kind and key, else null).
- `sameFactValue`, `observeFact`, `summarise` accept the new kind/value without change of behaviour (a string
  `v`); `summarise` needs nothing new.

In src/skills/facts-value.ts:
- `export const STATE_WORDS: ReadonlySet<string>` = open, opened, closed, close, expanded, collapsed, checked,
  unchecked, selected, unselected, enabled, disabled, visible, hidden, shown, not shown, present, absent,
  empty, none, true, false, yes, no, on, off, active, inactive, pending, done (folded; compare with `foldValue`).
- `export function elementNameOf(line: string): string | null` — the quoted accessible NAME of an a11y line
  (the parse baselineOf uses: `/^- ([\w-]+) ("(?:[^"\\]|\\.)*")/` on the trimmed line, JSON-parsed), folded
  with `foldValue`; null when the line has none. Move baselineOf's inline parse to call this (flow.ts imports
  it; behaviour unchanged).
- `export function seedFragmentOf(sf: SiteFacts | undefined, value: string, lines: Iterable<string>): string | null`
  — the folded element name (from `lines`, via `elementNameOf`) that (a) has a reliable seed fact
  (`seedNameFact`), and (b) contains `foldValue(value)` as a WHOLE TOKEN and is longer than it (a proper
  fragment: "bench" inside "bench admin"; NOT "bench admin" itself — the whole-name case is `seedNameFact` on
  the value). Whole-token = the same boundary `replaceToken` (skills/text.ts or wherever flow.ts imports it)
  uses: letter/digit on the value's edge needs a non-letter/digit neighbour. Returns the first such name, else
  null. `undefined` facts → null. A value shorter than 2 characters → null.
- `export function roleVerdict(sf: SiteFacts | undefined, key: string | undefined): { role: 'state' | 'count'; by: Fact } | null`
  — the reliable role fact under `key` when it is `state` or `count` (a `name` role never decides: it is
  observed for the survey only).
- `valueVerdict(sf, value, shapeKey?)` (existing) gains two arms, AFTER the existing mint/shape arms (mint
  wins): a reliable `seed` class of the value → `{ kind: 'not-identifier', by }`; a reliable role `state` |
  `count` under `shapeKey` → `{ kind: 'not-identifier', by }`.
- Shadow rules: `'facts.role'` (per reported value at noteReport/endInstruction: `fact` = the role fact's
  word or 'none', `heuristic` = the ledger kind it got, `agree` = role∈{state,count} ⇔ kind text) and
  `'facts.seed'` (per produced value the export weighed: `fact` = 'seed-fragment' | 'seed' | 'none',
  `heuristic` = 'threaded' | the exclusion that stopped it ('quoted' | 'commentary' | 'stated' | 'baseline' |
  'alternative'), `agree` = fact says seed ⇔ heuristic did not thread; `applied: true` when the fact decided).
  Both through `writeShadow` (skills/shadow.ts), rows deduped as `writeRows` does.

## Piece R (opus): kinds, readers, observers, the ledger arm, the daemon wiring
Files: src/execution/facts.ts (the kind, `ValueRole`, `seedNameFact`, `valueRoleFact`, 'seed' in
`valueClassFact`; keep it embeddable — run `npm run build` once and confirm scripts/copy-execution-source.mjs
still copies it; the parity test does not change), src/skills/facts-value.ts (`STATE_WORDS`, `elementNameOf`,
`seedFragmentOf`, `roleVerdict`, the `valueVerdict` arms, the observers below, the `facts.role` rows),
src/daemon/server.ts (`noteMintedIds`: before `this.ledger.add` of a report value, if
`seedFragmentOf(reportFacts, value, linesOf(entries))` is non-null, do not bank it — same `continue` shape as
the commentaryReport skip, with a comment naming fwop24; `linesOf` = every instruction startText line and
every step diff.added line in `entries`; the `facts.ledger` row for it says `fact: 'seed-fragment'`,
`applied: true`), src/skills/ledger.ts (nothing, if `valueVerdict` already carries the arms through
`add(..., facts)` — verify with a test; else the smallest change), bench/rebuild-flow.mjs (mirror the
seed-fragment skip with `undefined` facts and a comment, as the commentary skip is mirrored).

Observers (in `ValueFactObserver`):
1. **Seed names** (`value.class` = 'seed', soft, no ev). At `endInstruction`, when the instruction just ended
   is the FIRST one whose text `mutatingIntent` (flow.ts; export it if it is not) is non-null — or at session
   end if none is — file one observation per distinct folded element name seen in the baseline window:
   the start pages (`startText`) of every instruction up to and including that one, and the `diff.added`
   lines of every step BEFORE it (baselineOf's window exactly; reuse the same walk over `end.script`).
   Exclusions: a name shorter than 3 characters; a name with no letter; a name containing any declared var
   (`end.vars`, length ≥ 2, whole-token or substring — either disqualifies); a name the ledger holds as an
   identifier; a name equal (folded) to any value the ledger holds at all. Filed once per session per hash
   (`this.filed`). Cap: at most 400 seed observations per session (the largest start pages are ~300 lines).
2. **Roles** (`value.role`, soft) at `noteReport(url, name, value, entry, vars)`, key `shapeKeyOf(url, name)`:
   - `state` when `foldValue(value)` ∈ STATE_WORDS;
   - `count` when `/^\d{1,6}$/` matches the trimmed value AND some captured line of this instruction (the
     observer must be handed the lines: extend `noteReport` with an optional `lines: readonly string[]`
     argument the daemon passes — `linesOf(entries)` as above) contains the value followed by a space and a
     letter inside a quoted name (`"3 Open"`, `"12 items"`), i.e. `new RegExp('"' + value + ' \\p{L}', 'u')`
     or the value preceded by a letter word and a space inside quotes (`"Open 3"` is NOT a count);
   - `name` when the trimmed value equals (folded) the element name of some captured line whose role is one of
     link, button, heading, cell, option, menuitem, tab, treeitem, row, listitem, and the value contains a letter
     and no declared var.
   Only one role per report value (state, then count, then name). Filed once per session per (key, role).
   Contradiction handling is `observeFact`'s: a label seen as state in one session and count in another
   drops to advisory by itself.
3. The `facts.role` row per report value (see vocabulary), written at `endInstruction` with the other rows;
   `applied: true` when `valueVerdict` decided the entry by a role or seed fact (the same `applied` plumbing
   the ledger row has: noteReport already computes it).

Tests: test/facts-value.test.ts (+ `seedFragmentOf` whole-token and proper-fragment cases: "bench" in "bench
admin" → the name; "bench admin" itself → null; "enc" in "bench" → null; a name with a var → never seed;
`roleVerdict` state/count decide, name does not; `valueVerdict` mint beats seed), test/facts.test.ts (+ the
kind round-trips through observeFact/reliable; `seedNameFact` false while one session, true at two, false when
a reliable mint of the same hash exists), test/ledger.test.ts (+ a reliable state role under the shapeKey → kind
text; a seed value → text), and a small daemon-level test if one exists for noteMintedIds (else state in the
report that the skip is covered by Piece T's corpus test).

## Piece S (opus): the export's threading, the identity markers, the sourcing hold (consumers)
Files: src/skills/flow.ts, src/skills/compile.ts, src/agent/sourcing.ts, src/agent/loop.ts (only if the hold
needs new plumbing), src/daemon/server.ts (the flow-flush call site only: pass the row writer), bench/rebuild-flow.mjs.
Do NOT edit facts.ts, facts-value.ts (poll for Piece R's exports; until they land, code against the
signatures above and stub nothing into those files), ledger.ts, replay.ts.

1. **Threading** (buildFlow, the produced-values loop around `commentaryReport` / `statedBeforeShown` /
   `baselineOf`, AND the two threading sites `threadOutsideQuotes` / `threadIntoLiteral`): with
   `opts.facts` (the origin snapshot buildFlow already receives for taskConstants and referencablePart):
   - a produced value with `seedFragmentOf(opts.facts, value, linesOfGroup(g))` non-null, or with
     `seedNameFact(opts.facts, value)`, is not added to `produced` (so it threads nowhere: instruction text,
     params, url parts); `linesOfGroup(g)` = the group's instruction startText lines, its steps' diff.added
     lines, and the NEXT group's instruction startText (the same evidence window commentaryReport takes);
   - a produced value whose `roleVerdict(opts.facts, shapeKeyOf(g.endUrl ?? instruction.url, output))` is
     state or count is not added to `produced` either;
   - both go AFTER the runSpecific check and the commentary check, i.e. a value earlier runs watched change
     (`opts.runSpecific`) still threads (mint wins), and the shadow row records which rule spoke first.
   - Emit a `facts.seed` row for EVERY produced candidate the loop weighs (see vocabulary; `heuristic` names
     the exclusion that would have stopped it today, or 'threaded'), through a new optional
     `opts.onFactRow?: (row: ShadowRow) => void`; server.ts's flow-flush call passes a writer that batches
     them into `writeShadow(storeDir, { session, instruction: '' }, rows)` once; rebuild-flow.mjs passes
     nothing. `applied: true` when the fact stopped a value today's rules would have threaded.
   - The quoted-literal guard stays exactly as it is (fallback). With no facts: byte-identical output
     (test/quoted-literal.test.ts, test/commentary-report.test.ts and every fixture baseline of
     bench/rebuild-flow.mjs must not change: run `node bench/rebuild-flow.mjs` for fwod24, fwod26, fwod27,
     fwgr14 and confirm MATCH).
2. **Identity markers** (compile.ts `identityOf` and its caller at ~1259): a slot whose ORIGIN is a report
   output (the `origins` map the compile keeps per slot: `output:iN:<label>`) with a reliable role `state` |
   `count` under `shapeKeyOf(<the segment's start url>, label)` is never a `requireText` marker. Compile
   already has the origin's facts at hand (the FLOW.facts snapshot / the store; find how stage 2's
   `identityMarkerVerdictWithFacts` reaches them and use the same path). If the slot→origin label is NOT
   available at that call site, do not restructure compile: write the `facts.seed`-style shadow row only
   (rule `'facts.identity'`, existing) and say so in your report.
3. **Sourcing hold** (agent/sourcing.ts `decideSourcingHold`, the `facts` hook stage 3 added): an ASKED value
   whose label has a reliable role `state` is NOT held (the page never shows a state as text; the model owns
   it) — the `facts.sourcing` row says `fact: 'state'`, `applied: true`. A `count` role changes nothing (a
   count is readable). Everything else unchanged.
4. `taskConstants`: nothing (a seed name that is stated is already a constant; do not add an arm).

Tests: test/quoted-literal.test.ts (+ a case where the seed word stands OUTSIDE quotes — "created by Bench in
the project" — today threads; with a reliable seed fact for "Bench Admin" (two sessions via `observeFact`) it
does not, and the `facts.seed` row is `applied`; with the fact in ONE session only it still threads and the
row is not applied), test/commentary-report.test.ts or a new test/facts-thread.test.ts (a state-role label
value that a page line DOES show — "closed" with "0 Closed" on the next page — is not threaded once the role
is reliable; today it is), test/sourcing-hold.test.ts or the existing sourcing tests (+ the state arm),
test/compile-identity.test.ts or the nearest existing compile test (+ a state-role slot is not a marker).

## Piece T (sonnet): corpus test, report script, prompts, docs
- test/facts-stage4-corpus.test.ts: the survey rows through the public functions, building SiteFacts by hand
  with `observeFact` (two sessions where soft): fwop24 (the recording shape in test/quoted-literal.test.ts:
  with the seed fact reliable, `admin_first_name` is threaded nowhere even when the punctuation rule is not
  what stops it; with the fact advisory — a contradiction — it is the punctuation rule again); fwgt17 (a
  `labels_picker_state` label with a reliable state role: not banked by the ledger `add(..., facts)`, not a
  marker); fwkb35 (the seed task title "Seed: triage inbox" as a whole seed name: `seedNameFact` true at two
  sessions, the ledger files it text); a count under `open_issues_count` = "3" with a line `"3 Open"` (role
  count → text, never an identifier even with a `^\d+$` shape fact under another label); mint wins (a value
  with a reliable mint AND a reliable seed fact is an identifier). Poll for Pieces R and S's exports; where a
  function is not there yet, write the test against the contract signature and mark it `it.todo` until it
  lands, then un-todo before you finish.
- bench/facts-report.mjs: print `value.role` facts as `<key> v=<role>` like the others, and for
  `value.class` = seed print the COUNT of seed facts per origin (never a hash list longer than 5, never a
  value: the store holds hashes only), plus the `facts.role` / `facts.seed` shadow tallies (rows,
  disagreements, applied) alongside the existing rules.
- bench/sweep-prompts round 72: fwop27 fwsi23 fwgt26 fwod98 fwgr84 from the round-71 prompts (fwop25, fwsi22,
  fwgt23, fwod97, fwgr82 on main; bump ids; keep the publish step as it is; WHAT THIS IS names stage 4:
  seed-name and value-role facts now decide the export's threading, the ledger's kind, the identity markers
  and the sourcing hold when reliable; add F7: every `facts.seed` / `facts.role` row with `applied: true`,
  verbatim, the count of seed facts per origin, and every `value.role` fact; expected: the openproject
  first-name word not threaded by the fact once two sessions have seen the admin's name — note that on a
  FRESH store the recording is session one and the replays session two, so the fact decides from n2's export
  onward, not n1's). Also verify-site-facts-4.md from verify-site-facts-3.md (branch feat/site-facts-4, file
  gate `test -f test/facts-stage4-corpus.test.ts`, baseline snapshot: the newest sf3-*.json on
  results/verify-site-facts-3* — find its exact branch name with `git ls-remote --heads origin
  'results/verify-site-facts-3*'` and the file name with `git ls-tree`; snapshot name sf4-<sha>).
- notes/design/design-site-facts.md: a new §4b "Value meaning facts (stage 4)" with the two fact rows (seed,
  role: key, value, observed when, strength) and the four consumers, in the table style of §4; §5 gains the
  stage 4 line with its exit; notes/design/README.md status line; bench/README.md one sentence.

## Exit for stage 4 (the lead checks)
- Suites, browser, parity green; corpus 0 status changes (cloud verify on feat/site-facts-4).
- Piece T's corpus test: fwop24 decides from the seed fact; fwgt17's state label decides from the role fact.
- Round 72 (five apps): seed and role facts written on every app; `facts.seed`/`facts.role` shadow agreement
  ≥ 95% or every disagreement explained; openproject green with the first name unthreaded by the fact on n2/n3;
  every other app matches or beats its round-71 row; no n2/n3 value naming another run.
