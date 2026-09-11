# Evidence over shape: never decide what a value IS by reading its characters

Written 2026-08-30, after release sets 3 and 4 (fwrd33/fwgr12/fwod18,
fwrd34/fwgr13/fwod19). Successor to PLAN-provenance.md, which gave every
run-made value a home in the ledger. This plan removes the last thing the
ledger still guesses: **which values are record identities.**

## The policy

> A value's KIND — identity or description — is never decided by inspecting
> its characters. It is decided by what the run observed, or by what the next
> run demonstrates. A shape test may propose; only evidence may decide.

This is a rule about the product, not about the bench. It exists because the
alternative has a silent failure mode: a record id that does not *look* like
one gets left literal, the replay acts on the recording run's record, and
every check passes.

## The evidence this rests on

`buildFlow` was given a gate in c0ce906 so that a value a zero-model replay
cannot republish does not become a cross-step reference:

```ts
if (!publishes(g.report?.skill, output) && !identifierLike(value)) continue;
```

The first half is evidence: *did the producing step republish it?* The second
half is shape, and it decides the dangerous case. `identifierLike("Order
Alpha")` is false. So is `identifierLike("abcd")`. On an app whose references
look like either, that line leaves a record id literal in the instruction and
the replay operates on run 1's record while reporting success.

That is one new call site added to a family of about twenty. The family is
already documented as a problem in its own comments:

> Three separate thresholds asking one question, disagreeing three times.
> — `compile.ts:409`

It is four now.

### Why no record-time rule can work

Three candidate replacements were tried against the case that motivated this
(fwod18's `quotation_reference = "New (unsaved)"`, cited by seven later steps):

| candidate | fails because |
| --- | --- |
| freshness — did this string exist before the run made it? | `"New (unsaved)"` never appeared before either, so it reads as run-made and stays fragile. |
| appears in a url the run landed on | Odoo's urls carry `id=21`, never `S00021` — the value that matters is invisible. |
| was used as a locator anchor | `"Untaxed Amount"` anchors a label read exactly as `S00021` anchors an identity read. |

None work because the question is not answerable from the recording. *"Does
this name this run's record, or the app's furniture?"* is a question about how
the app behaves **across runs**, and run 1 sees one run.

## The mechanism: run 1 proposes, run 2 decides

This is not new machinery. It is `seen: {hit, miss}` / `retired()` for locator
candidates and url `generalisations` for preconditions — what the codebase
already calls *demonstrated volatility* — applied to values.

1. **Record.** Run 1 makes no kind judgement. Every reported value becomes a
   reference. That is the safe default: an unresolved reference sends its step
   to recovery, which is correct, merely not free.
2. **First replay.** After a step runs, compare **what it reported for each
   output** against what the recording run reported for the same output name.
   - **Same** → the app produced this again. Demonstrated **stable**; the
     recorded literal resolves from now on.
   - **Different** → this run has its own value there. Demonstrated
     **volatile**; the reference stays.
3. **Persist** the verdict on the flow step, the same way a retired candidate
   and a generalised url pattern are persisted today.

A first draft of this searched the PAGE for the recorded literal, and the
worked example below was written against that. It does not survive contact
with the case: `"New (unsaved)"` is prose the MODEL composed — Odoo's
breadcrumb says `"New"` — so a page search finds nothing and calls it volatile,
the wrong answer. Comparing the two runs' reports for the same output name
needs no page search, no string matching, and no view about how a value is
worded; it asks the app the question directly.

Against the two values that motivated the plan:

| value | what run 2's own report says | verdict | outcome |
| --- | --- | --- | --- |
| `"New (unsaved)"` | `"New (unsaved)"` — the same, for ITS unsaved record | stable | literal, step reaches tier A |
| `"S00021"` | `"S00023"` — this run's own order | volatile | reference kept, stays on its own record |

Both correct, neither derived from the characters in the string.

Two asymmetries fall out and both are deliberate. **Silence is not agreement**:
a tier-A replay that honestly drops a value it could not re-observe votes
neither way. And **one demonstration of difference is a permanent veto**: a
value that changed once names a record, and no amount of later agreement makes
it safe to inline — an app reset could make run 3 agree with run 1 by
coincidence.

The cost curve is the one this project already has — run 1 pays recovery, run 2
measures, run 3 is cheap; the same 8→4→0 convergence the flows already show —
and it fails safe at every stage, because the default before evidence arrives
is the expensive-but-correct option.

## The cleanup assumption

> A flow is expected to remove the records it creates, the way a test tears
> down its fixtures. Where it does not, the system falls back to model
> recovery rather than to a guess.

Adopted 2026-08-30. It is ordinary test hygiene, and it is also what makes
cross-run comparison mean anything: if run 1's records are gone, run 2 starts
where run 1 started, and anything still on the page is the app's rather than
the last run's.

It matters most for the second evidence source. Comparing the two runs'
reports only works when the replay reports something; when it does not, the
fallback is to ask the page whether the recorded literal is still there.
**That check is only safe under cleanup**, and fwgr13 shows why: its replays
edit run 1's dashboard rather than creating their own, so run 1's uid is
present on run 2's page. Page-presence alone would call a live record identity
"stable" and inline it — the one direction the policy forbids.

### Our own targets do not currently satisfy it

Worth stating plainly, because it makes the bench weaker evidence than it
looks:

| target | behaviour across runs |
| --- | --- |
| odoo | records accumulate: n1 creates S00021, n2 S00022, n3 S00023. The task *cancels* its order; cancelling is not removing. |
| grafana | one dashboard, renamed by each run. No run creates its own. |
| repairdesk | reset by the harness, so every run legitimately creates RD-1015. |

Only repairdesk starts clean, and it gets there by harness reset rather than
by the flow cleaning up after itself — which is a weaker guarantee, because it
is a property of our rig and not of the procedure under test.

Two consequences follow. Page-presence evidence must stay off until a flow is
known to clean up: on odoo today, `S00021` is still in the orders list when
run 2 needs it, so the check would inline a live record identity. And the
bench tasks should be rewritten to remove what they create — which is a change
to what the benchmark measures, so it is a decision to take deliberately
rather than a fix to slip in.

### Detecting compliance rather than assuming it

The assumption is checkable with what a run already produces: if a flow cleans
up, the identifiers an earlier run minted are gone by the time the next run
starts. A run that still finds one has demonstrated the flow does not clean
up, and page-presence evidence stays disabled for that flow — permanently, on
the same one-demonstration-is-a-veto rule as everything else here.

## Inventory: every site that reads characters to decide identity

Two populations, and they need different replacements. Being honest about the
split matters: the first is removable now, the second needs the second run.

### Population A — deciding about a VALUE the run produced (12 sites)

The ledger already holds provenance for these. Shape is unnecessary.

| site | what it decides | replacement |
| --- | --- | --- |
| `ledger.ts:134` | `kind` of a banked entry | binding origin: `url`/`var` → identity; `output` → undecided until run 2 |
| `ledger.ts:147` | which url parts to bank | position in a url IS the evidence; bank all, let freshness order them |
| `flow.ts:220` | which url parts become outputs | freshness (already half there) + run-2 confirmation |
| `flow.ts:246` | **new gate** — reference or literal | run-2 stability check (the mechanism above) |
| `flow.ts:326` | `coincidental` — may a value match inside a compound | producer republished it or not; else run 2 |
| `flow.ts:426` | `urlOutputs` | same as `ledger.ts:147` |
| ~~`flow.ts:533`~~ | ~~`freshUrlIds`~~ | **REMOVED 2026-09-10** — the export had no production caller at all, so the site cost nothing to delete |
| `flow.ts:559` | `jsonLeaves` — which leaves are threadable | publish all leaves; run 2 retires the stable ones |
| `compile.ts:419` | `discoverMinted` floor | freshness + `mints` confirmed by run 2's url diff |
| `learn.ts:287` | is a prose token an unbacked identity claim | compare against params and live values only |
| `report.ts:350` | `proseIdentifiers` — what to pin on the page | pin every prose token read-back can resolve; let pinning succeed or fail |
| `bench/verify-artifacts.mjs:87` | reconstructing the ledger | import the product's rule; never restate it |

### Population B — deciding about app-authored text (8 sites)

`bookmarked`, `urlPattern`'s `:id` normalisation, `stableFirst`'s `volatile`,
`locatorShape`, `stripIds`. These read a css selector or a url segment the run
did not produce, so the ledger genuinely has nothing to say about them.

They **cannot** be replaced by provenance — but they are already the natural
home of demonstrated volatility, because the question they ask is exactly *does
this token differ between run 1 and run 2?* The answer arrives free with the
second run:

- run 1 keeps the shape test **as a prior only**, marked provisional;
- run 2 compares the same selector/url and either confirms the token varied
  (it was an id) or that it did not (it was structure);
- the verdict persists through `seen`/`retired`, which already exists.

`isIdLike` then survives as a *first-run prior* with no authority, and every
one of its verdicts is falsifiable by the next run.

## The overfitting audit

Asked separately: where is the solution shaped to the three bench targets at
the expense of a fourth app? Ten findings, worst first.

1. **`isIdLike` encodes the three targets' id formats literally.**
   `^[A-Za-z]{1,4}[-_]?\d+$` is commented "t15, RD-1015" — repairdesk.
   `^[0-9a-f]{8,}$` is grafana's uid. `^\d+$` is odoo's record id. An app with
   `INV/2026/0042`, `Order-Alpha`, `AB`, or a base32 ULID is invisible to all
   five clauses. This is the most target-shaped function in the codebase.

2. **`proseIdentifiers` requires letters AND digits** (`report.ts:350`). That
   admits S00021, RD-1015 and digit-bearing uids — precisely the three
   targets. An app whose references are purely numeric (`Invoice 40321`) or
   purely alphabetic gets nothing pinned, so a reference the model left in
   prose strands every later step on the recording run's record. **Silent**,
   and the same class as fwod5.

3. **`identifierLike`'s two grafana clauses are now general policy.**
   `length >= 12` exists for `cfwcsdxqdjabkf`; the "a separator only counts
   with a digit" rule exists to reject `bench-service-health`. Both were
   derived from one app and now govern every app.

4. **`MIN_ID_LEN = 3`** is commented "repair-desk's record ids are t15".

5. **Four thresholds asking one question.** `MIN_ID_LEN` 3, `MIN_IDENTITY_LEN`
   4, `MIN_PROSE_ID_LEN` 4, `MIN_PROMOTED_LEN` 3, plus buildFlow's own `>= 2`.
   Each was moved to fit a target. `compile.ts:409` already documents three of
   them disagreeing.

6. **Two functions disagree about the same token by design.** `bookmarked` and
   `stableFirst` exclude bare 1–2 digit numbers so `row-2` survives; odoo's
   real record ids *are* two-digit, which `compile.ts:409` had to work around.
   Which one is right depends on the app, so neither is.

7. **`MAX_PROSE_IDS = 3`** caps pinned prose identifiers. Fine for a task that
   creates one record; an app flow creating four loses the rest silently.

8. **`flattenComposedValues`' `MAX_LEAVES = 8`** (added this session) comes
   from odoo's four-field order line. A ten-field record is not split.

9. **The self-containment check is overfitted to a MODEL, not an app.**
   `verify-artifacts.mjs` matches `^(you are|the browser is|assuming|
   currently) (on|at|in)`. A model that phrases a position-dependent
   instruction differently passes silently. Check what the step *does* — no
   navigation before its first assertion — not how it is worded.

10. **`verify-artifacts.mjs` restates the product's recognition rule** rather
    than importing it, so the checker can silently disagree with the thing it
    checks. It already imports `identifierLike`; it should import the whole
    decision.

Findings 1–8 are dispositions of the same defect and are fixed by the
mechanism above. Findings 9 and 10 are independent and cheap.

## Order of work

**Stage 1 — LANDED, MEASURED, INCOMPLETE.** fwod20 gathered no evidence at
all: the replays republished nothing to compare, because reads were stored
unlabelled (fixed in 29fc864 — a read-back now carries the evidence key it was
captured for). Reference-everything without evidence is a pure cost: fwod20's
replays cost $0.2342/$0.2025 against fwod18's $0.0267/$0.0888. The next odoo
run measures whether evidence now accumulates; if it does not, the
reference-everything default must be reverted until it does.

**Stage 1 (as built) — (5c9cfc1 + 4319acb).** `buildFlow` no longer judges: every
reported value becomes a reference. `noteOutputEvidence` records, per output,
how often a later run produced the same value there; `stableOutputs` exposes
the ones no run has ever contradicted; the resolvers substitute those literals
instead of sending the step to recovery. One demonstration of difference is a
permanent veto. `verify-artifacts` reports three states — stable, volatile
(a cost, not a defect), and not-yet-judged — instead of one.

**Stage 1 (original text) — make the policy enforceable.** Add the run-2 stability check and
persist its verdict. Change `flow.ts:246` to use it. This alone removes the
dangerous site and proves the mechanism on the case that motivated it.

**Stage 1.5 — the url population joins the mechanism (2026-09-10).** The
reported-value path referenced everything and let evidence demote; the URL
path did not, and could not, because nothing collected a variance signal for
it. `buildFlow` now writes each minted url part into the step's `recorded`
map, and the flow runner passes `stepOutputs` (values *and* url parts) to
`noteOutputEvidence` instead of `values` alone. So a url part a later run
reproduces is demoted to a literal, and one a later run contradicts is vetoed
permanently — the same rule already governing reported values.

The same conversion then landed for **JSON leaves** (2026-09-10). `recorded`
held a read-back's whole body under one name, so `noteOutputEvidence` compared
the entire JSON string and a single volatile field vetoed every leaf in it —
a response carrying both a minted uid and an etag could never demonstrate
anything about either. `buildFlow` now records each published leaf under the
`<output>#<path>` name it is referenced by, and the flow runner expands a
reported body into the same names before banking evidence. Verdicts are per
path: the slug the app re-derives goes stable, the uid beside it stays a live
reference.

**Superseded 2026-09-11: `stableOutputs` is deleted.** Agreement between runs is
not evidence that the app owns a value, because a harness that resets the app
reproduces a minted id exactly. Two reset runs both creating `t15` made that
output "stable". A third run on an app that wasn't reset, whose create step went
tier A and dropped the output, would then have resolved the reference to run
1's `t15` and edited the wrong ticket while reporting success. The literal
fallback sat exactly on the path where a live value is missing, so "consulted
only when a live lookup fails" was no mitigation. An unresolved reference now
always goes to recovery. `outputEvidence` stays, but only `differed` is ever
acted on (`varyingValues`, dead-read retirement). The per-leaf and per-url-part
recording below still earns its keep, because it lets a volatile value be
caught on its own evidence.

Both were additive when written. Neither removes its shape gate — a value shape refuses is still never
referenced and so still has no evidence — but both build the signal that
removal needs. Widening those gates is the next step and wants a bench sweep,
not a unit test, to price.

**Why `jsonLeaves`' gate must not simply be dropped.** Publishing every scalar
leaf is not the safe default that "reference everything" is for reported
values, and the existing fixture shows why: a body of
`{ status: 'success', uid: '…', slug: '…', version: 2 }` would publish
`version: 2`, and `buildFlow` referencizes any standalone matching token in a
later instruction. "Set the quantity to 2" compiles to
`{{03-save.body#version}}`, and a replay whose body says `version: 3` executes
"set the quantity to 3". That is a changed INSTRUCTION, not an unresolved
reference, so it escapes this plan's safety argument ("an unresolved reference
costs a recovery turn, never a wrong record"), and cross-run evidence does not
rescue it either: a volatile leaf stays a live reference — precisely the
corrupting case. A leaf population needs an admission rule narrower than "admit all"
before its gate can go.

**Stage 2 — population A.** Convert the remaining eleven sites to provenance
or to the stage-1 verdict. Collapse the five thresholds into one place. Delete
`identifierLike` from every site where it is a verdict; keep it, if at all, as
a named prior.

**Stage 3 — population B.** Mark `isIdLike`'s verdicts provisional and let run
2 confirm or retire each. Rewrite its clauses as *one* general prior — a token
is a candidate id when it varies across runs — rather than five app-shaped
patterns.

**Stage 4 — the checker.** Import the product's rule into
`verify-artifacts.mjs`. *(Half done 2026-09-10: it now imports `looksLikeId`
from `dist/skills/shape.js`, so there is one rule rather than a copy. The
self-containment wording match is untouched.)* Replace the self-containment wording match with a
behavioural one.

Stages 1 and 4 are independently valuable and can land first.

## How we will know it worked

- **Variance reaches the ledger. DONE 2026-09-11** (`varyingValues` +
  `FlowStep.route` in flow.ts, `RunLedger.seedVariance`, `basis: 'variance'`
  finally produced). A flow run seeds the ledger with the values earlier runs
  watched CHANGE; each is kinded `identifier` whatever its characters, which
  is the "Order Alpha" / "abcd" case no regex reaches, and `fatal()` already
  refused on `variance` while only warning on `shape`. Three things were
  learned the hard way and are worth keeping written down:

  1. **Evidence needs a route.** Comparing fwod20's n1/n2/n3 step by step made
     21 url parts look volatile; the ones shape had refused were
     `q.model = "sale.order" vs "res.partner"` and `q.view_type`, which varied
     because a recovery turn navigated elsewhere. Require the same url pattern
     and 4 remain, every one `q.id`. `noteOutputEvidence` now discards a
     comparison made from a different route — at the cost of 7 of fwod20's 11
     instructions contributing nothing.
  2. **Variance is ONE-DIRECTIONAL.** The first cut let agreement across runs
     demote a value to app furniture. That is wrong on a reset bench app,
     which reproduces a minted record id exactly — every repair-desk recording
     here creates ticket `t15` — so it would have stopped banking `t15` from
     run 2 on, and an unbanked record id is one no guard can see. `RunSpecific`
     is a boolean and the ledger holds a `Set`, so the unsafe direction has no
     legal spelling, the same device as `ShapePrior` having no `verdict`.
  3. **Widening `idPositionPart` by name is a dead end.** Swept every url in
     bench/results: `.*_id` would newly admit 23 values of `q.menu_id`, odoo
     routing constants — the fwod29 bill again — while the real record
     pointers in grafana and repair-desk sit in *unnamed* path positions
     (`p1`, `p2`) where there is no name to read. Position cannot grow; that
     population is what the variance arm is for.

  It also uncovered a live producer/consumer split: `buildFlow` minted a url
  part on `looksLikeId || idPositionPart` while `urlOutputs` published on
  `looksLikeId` alone, so odoo's `#id=44` was minted as
  `{{01-open.url.q.id}}` and never published by any replay — the exact dead
  reference `urlOutputs`' own comment warned about. Both now call
  `referencablePart`.
- **learn.ts's honesty gate: DELETED, not converted. 2026-09-11.** It scanned
  a tier-A summary for identifier-shaped tokens and dropped the prose when it
  found one — the last site failing toward silence, and unfixable by widening,
  since "Added a second order line to Order Alpha and saved" names a record no
  regex sees. The property that actually matters is whether the run can vouch
  for the sentence, and that is known exactly: a value it OBSERVED
  (`liveValues`) or SUPPLIED (a param that reached the prose). With neither,
  no narrative. Fails toward cost — a true-but-unverified sentence becomes a
  duller true one — and removes the judgement rather than improving it.
- **The circular read. DONE 2026-09-11** (`dropDeadReadLocators` in
  `compile.ts`, called from the daemon where `noteOutputEvidence` lands). A
  read located by the text it reported — `getByText('£ 133.33')` for the
  output `total` — cannot be judged by the recording, which saw the value
  once. A blanket ban was written, measured and thrown away: across the 33
  published recordings it hits 191 of 890 reads, 48 of those values have no
  digit and are page furniture a text locator is the RIGHT way to find, 86
  reads would be left findable only by position, and 9 chains would empty
  outright — a recovery turn on every replay, forever. It also buys less than
  it looks: replay takes the first candidate matching exactly one element, so
  a candidate whose value moved simply misses and falls through to the next —
  which is where deleting it would have sent it anyway. The only silent
  failure is the old value surviving elsewhere on the page as the only match.
  So evidence decides instead: a candidate goes only for an output
  `outputEvidence` has actually seen change, whole-token, and only once a
  second run exists to say so. Worst case, with every labelled read output
  assumed volatile, that is 30 chains across all 33 recordings rather than
  191 — and the list of what it would empty is mostly `"Column:"`,
  `"Due date:"`, `"Status"`, values no run will ever contradict. Fails toward
  cost: a read stripped to positional candidates is emptied, so replay skips
  it and the value comes back absent rather than confidently wrong (fwrd16-n3).
- **A grep gate. DONE 2026-09-10** (`src/skills/shape.ts`,
  `test/shape-gate.test.ts`). Both functions moved to one module and were
  renamed `looksLikeId` / `looksLikeIdSegment`; every caller must now pass a
  `ShapePrior` naming what it is using the answer AS. The type has four
  members — `first-run`, `ordering`, `proposal`, `diagnostic` — and
  deliberately no `verdict`, so a site that wants one has no legal spelling.
  The gate test pins the complete inventory file by file, with the direction
  each population fails in, and asserts that no id-shape clause is
  re-implemented anywhere else under any name. 18 call sites across four
  files, down from 32 references and two definitions. Lowering the count is
  free; raising it fails until someone writes the new site down, which is the
  moment to ask whether evidence could decide it.

  What the inventory then makes visible: `compile.ts` (10 sites) fails toward
  cost — proposals `softUrlMatch` corrects, and orderings. `ledger.ts`,
  `flow.ts` and `learn.ts` (8 sites) fail toward silence, and are the real
  remaining work. Of those, `learn.ts`'s gates prose rather than a record
  pointer; the other seven are the url population.

  **2026-09-11: 15 sites.** `learn.ts` is at zero (gate deleted, above), and
  `flow.ts`'s two url-part admissions became the one function they always
  claimed to be. The five that remain in the silence direction all now sit
  BEHIND the variance arm, so the characters decide only where no run has yet
  been in a position to judge — asserted structurally by the gate test, not
  by a comment, because that is what the previous three rounds of this had.

  **2026-09-11 (evening): one predicate, 9 predicate sites.** Every
  character-reading check now goes through shape.ts:

  - `digitDominant`: digits ≥ other characters, or any '-'/'_' piece that
    is. Measured quantities (one '.' with a digit on each side) and real
    dates/times (range-checked) are never numeric. `looksLikeIdSegment` is
    gone.
  - `looksLikeId` = `digitDominant` + generated tokens (a digit anywhere in
    one unbroken token; ≥12 chars or 8+ hex with no separator). This is one
    rule in two directions. Sites where an ID answer *generalises* (url
    `:id`, skeleton `*`, demotion, prose ref) take the narrow test, because
    there a false yes is silent. Sites where it *admits* (banking,
    references, the token boundary) take the generous one, because there a
    false no is silent. Grafana's `afw6yy5xx9` (3 digits in 10) and the runid
    `fr1` are why admission cannot use the narrow test.
  - `tokenPattern`: the one whole-token boundary. A word's '-'/'_' bind; an
    identifier's split. It replaced six copies, including report.ts `cites`.
    `coincidental` is deleted.
  - `skeleton`: the one id-blanking. It splits on every non-alphanumeric and
    never blanks a `{{marker}}` or a token after '(' or '='. It replaced
    `locatorShape`'s tokeniser, `stripIds`, and the `bookmarked`/`stableFirst`
    test, and the old exemption for 1–2 digit numbers is dropped.
  - Hex runs (decision 3C): three rules kept apart because they answer
    different questions. Each has one constant, and the page-side literals
    are held equal to those constants by the gate test.
  - The gate inventories by question and fences every other alphanumeric
    class in src/ behind an allowlist: 15 entries in 9 files, mostly syntax
    parsers.
- **A fourth target.** Every finding above is a prediction about an app we have
  not tried. The plan is not validated by the three targets passing — they
  passed while carrying all ten. It is validated by a new app with a
  differently-shaped reference (slashes, purely numeric, or purely alphabetic)
  reaching tier A without a code change. That target should be chosen for the
  shape of its identifiers, deliberately, and it is the real acceptance test
  for this plan.
- **The failure direction.** Where a judgement is still wrong, it must be wrong
  toward *cost* (an unnecessary reference, a recovery turn) and never toward
  *silence* (a literal acting on the wrong record). Every site converted should
  say which way it fails in a comment.
