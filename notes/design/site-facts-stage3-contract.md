# Site facts, stage 3: value class consumers — build contract

Design: notes/design/design-site-facts.md §4 (facts, consumers 1-4), §5 (stage 3 exit), §7. Stages 0-2 are on
feat/site-facts-2 (stage 2 in cloud verification as this is written; this branch is cut from it and merges
after it). Stage 0's value observers and shadow rows live in src/skills/facts-value.ts (`factKind`,
`ledgerRow`, `stripRow`, `sourcingRow`, `ValueFactObserver`); the readers in src/execution/facts.ts
(`valueClassFact(sf, value)`, `shapeFact`, `matchesShape`, `valueHash`). Stage 3 SWITCHES the consumers on,
behind `reliable()`, with today's rule as the fallback. Every consumer here is DAEMON-SIDE (the ledger, the
export's strip, the recording's sourcing hold, the recording's scrub, the daemon replay's heal): the artifact
carries no ledger and never heals, so there is no two-runner parity to keep beyond the existing gates.

Branch: feat/site-facts-3 (from feat/site-facts-2). Four pieces, parallel, from this contract. Every piece:
`npx tsc -p tsconfig.json --noEmit` clean, its tests green one vitest at a time (`--pool=forks
--poolOptions.forks.maxForks=1`), no git command that moves a ref or touches the index/stash. The lead commits.

## Principles (as stages 1-2)
- Reliable or nothing; advisory facts write their shadow row and decide nothing.
- The shadow rows stay and gain `applied: true` when a fact decided (facts.ledger, facts.strip, facts.sourcing).
- Fallback byte-identical; corpus 0 status changes.
- The dangerous direction is a LITERAL that acts on run 1's record. A fact may make a value MORE of an
  identifier (mint, shape) or LESS of one (constant, credential); where the two would disagree for one
  value, mint wins (a wrongly literal id costs a record; a wrongly slotted constant costs a recovery turn).

## Shared vocabulary (exact)
- `factKind(sf, value, shapeKey)` (facts-value.ts, unchanged): 'identifier' | 'not-identifier' | 'none'.
- **`valueVerdict(sf, value, shapeKey?): { kind: 'identifier' | 'not-identifier'; by: Fact } | null`**
  (facts-value.ts, Piece M): `factKind` restricted to RELIABLE facts, with the deciding fact; null when no
  reliable fact speaks. Every consumer below asks this one function.
- `applied` on the three value shadow rows.

## Piece M (opus): the ledger prior, the export's strip, the credential scrub (consumers 1, 2, 4)
Files: src/skills/facts-value.ts (`valueVerdict`; `ledgerRow`/`stripRow` take an `applied` flag),
src/skills/ledger.ts (`add(value, binding, opts, facts?: SiteFacts)`: a reliable `not-identifier` verdict
makes `kind: 'text'` whatever the shape and never vouches; a reliable `identifier` verdict makes `kind:
'identifier'`, `basis: 'shape'`, vouched, `positional` below MIN_ID_LEN — the length floor is passed the way
`vouched` passes it; `addUrlIds` already takes facts), src/daemon/server.ts (`noteMintedIds`: the report
`add` passes the origin's snapshot with `shapeKey` = facts-value's `shapeKeyOf(url, name)`;
`stripLeakedCandidates`: `runValues` gains every ledger entry a reliable `identifier` verdict names even
when its kind is text or its length is under 3, and loses every entry a reliable `not-identifier` verdict
names; the `facts.strip` rows get `applied`), src/shared/secrets.ts + src/agent/tools.ts (consumer 4: the
recorder's line scrub — where `scrubSecretsDeep` runs on the step diff — also scrubs a value whose hash has
a reliable `credential` fact on this origin, in any line, not only a password field's own; the hash set comes
from the ValueFactObserver's store: expose `credentialHashes(url): Set<string>` on it and hand it to the
scrub through a setter in secrets.ts, `setKnownCredentialHashes(hashes)`, called by server.ts when the
observer's session begins and after every observe), bench/rebuild-flow.mjs (mirror `add(..., undefined)`
with a comment), test/ledger.test.ts (+ constant never identifier: FURN_7777; shape admits "4" under
task_id; credential never identifier; no reliable fact byte-identical), test/facts-value.test.ts
(valueVerdict), test/credential-literals.test.ts or a new test/credential-facts.test.ts (a line outside the
password field carrying the credential is scrubbed once the fact is reliable, and not before).

## Piece N (opus): the sourcing hold and the export's constants (consumer 3)
Files: src/agent/sourcing.ts (`decideSourcingHold` gains `facts?: { verdict(value, key): ... }` — a reported
value that is NOT asked is still held when a reliable `value.shape` fact under `shapeKeyOf(url, key)`
matches it and it was not read (`alreadyRead`); the `facts.sourcing` row becomes `applied`; everything else
unchanged), src/agent/loop.ts (the one call site passes the daemon's snapshot through the existing hooks:
find how `state.vars`/`setIdentityHints` reach the loop and add a `facts` getter the same way — the loop
must not import skills/facts.ts directly if it does not already; go through an injected function),
src/skills/flow.ts (`taskConstants(entries, values, vars, runSpecific, facts?: SiteFacts)`: a value with a
reliable `constant` verdict is a constant; a value with a reliable `mint`/shape verdict is never one, even
if stated before shown; `taskConstantArms` reports `'fact'` as a third arm), src/daemon/server.ts
(`taskConstants()` passes the snapshot), bench/rebuild-flow.mjs (mirror; `undefined`), test/task-constants.test.ts
(+ the fact arms), test/sourcing-hold.test.ts or the existing sourcing tests (+ the unasked mint-shaped hold).
Do NOT edit ledger.ts, secrets.ts, tools.ts, replay.ts.

## Piece O (opus): the heal guard (round 68, odoo fwod94)
Not a facts consumer, the failure the batch surfaced: on n2, 02-open's recorded option locator
`role=option[name="{{v1}}"]` (v1 = "fwod94-n2 Bench Customer") missed, an inline heal proposed Odoo's
`getByRole('option', { name: 'Create "fwod94-n1 Bench"' })` off the live page, the click filed the
quotation under run 1's customer, and every step reported success. Rule: **a healed candidate must carry
what the recorded one carried.** In src/skills/replay.ts, where an inline heal's proposal is accepted
(`setInlineHealer`'s consumer, `healRoleRefused` and the blast-radius rules around it): when the recorded
target chain's role/label/text candidate names a bound slot value (the filled `{{vN}}`), refuse a proposal
whose accessible name does not contain that filled value (folded, whole-token), with a reason in the style
of `healRoleRefused` ("an inline heal proposed … named 'Create "fwod94-n1 Bench"', for a control recorded as
naming this run's 'fwod94-n2 Bench Customer' — another record, not dispatched"); the step then stops as a
miss, which sends it to recovery instead of to the wrong record. Also refuse a proposal whose name contains
a value the ledger holds as another run's (any declared var value that is not this run's: the recorder
knows the run's vars; a name carrying `<runid-shaped token>` that is not the run's runid). Add the
equivalent guard to the artifact ONLY if the artifact has an inline heal (check src/spec/emit.ts and
src/execution for `heal`; if none, say so). test/replay-heal-guard.test.ts with the fwod94 shape (stub page:
recorded option `{{v1}}`, live page offering only `Create "fwod94-n1 Bench"` and `fwod94-n2 Bench Customer`
absent → refused; live page offering `fwod94-n2 Bench Customer` under a healed role → accepted).

## Piece P (sonnet): fixtures, prompts, docs
- test/facts-stage3-corpus.test.ts: the survey rows of design §4 through the public functions: fwod84
  (FURN_7777 constant → ledger kind text, strip keeps the candidate), fwkb41 ("4" under task_id's shape →
  identifier, positional), fwec8 (a uid minted from a JSON body: mint hard → identifier), fwgh14, fwsi14
  (the minted tag BA-00006 shape → identifier; the wrong of two banked: the fact's value wins),
  fwod88 (a read locator naming its own mint: strip removes it once the mint fact is reliable),
  fwgr68/fwkb39 (password = username: the credential fact scrubs the username line), fwvk15, fwsi16 (unasked
  list columns: constants by offered fact → task constants, not threaded; an unasked mint-shaped value →
  held). Poll for the pieces' exports; build SiteFacts by hand with observeFact, two sessions where soft.
- bench/sweep-prompts round 70: fwop24 fwsi21 fwgt22 fwod96 fwgr81 from the round-69 prompts
  (`git show feat/site-facts-2:bench/sweep-prompts/<fwop23|fwsi20|fwgt21|fwod95|fwgr80>.md`; keep publish-first,
  never-idle, F4, F5; bump ids; WHAT THIS IS names stage 3: value class facts now decide the ledger's kind,
  the export's strip, the sourcing hold and the task constants; add F6: every `facts.ledger`/`facts.strip`/
  `facts.sourcing` row with `applied: true`, verbatim, and any n2/n3 published value that names another run
  — expected none). Also fwsi16-cv (the design's stage-3 convergence re-run: the converge form of
  fwod88-cv5 for snipeit FROM results/fwsi16-vacbqw, run id fwsi16-cv, code gate
  `grep -q 'function valueVerdict' src/skills/facts-value.ts`).
- notes/design/README.md status line; bench/README.md one sentence; bench/facts-report.mjs nothing new.

## Exit for stage 3 (the lead checks)
- Suites, browser, parity green; corpus 0 status changes (cloud verify).
- fwod84's FURN_7777 and fwsi16's unasked columns decide from facts (Piece P's tests); the fwod94 heal
  shape is refused (Piece O's test).
- Round 70: every result matches or beats its round-69 row; every applied row read; no n2/n3 value naming
  another run.
