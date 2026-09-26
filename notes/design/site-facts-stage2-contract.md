# Site facts, stage 2: display format consumers — build contract

Design: notes/design/design-site-facts.md §3 (facts, consumers 1-5), §5 (stage 2 exit), §7. Stage 1 shipped
(main 287d586b, exit met on fwsi14-cv4). Stage 0's format observers and shadow rows live in
src/skills/facts-format.ts (observers (a)-(e); readBackShadow, classifyShadow, identityShadow; the reader
`renderings(sf, key, value)` in src/execution/facts.ts). Stage 2 SWITCHES the consumers on, behind
`reliable()`, with today's rule as the fallback, and first TIGHTENS the affix observer that round 67 showed
over-generalising (odoo: `£ 2,{{=}}` minted from a thousands-grouped subtotal; `{{=}} Bench Customer` minted
for the `ref` key from the customer's name).

Branch: feat/site-facts-2. Three pieces, parallel, from this contract. Every piece: `npx tsc -p tsconfig.json
--noEmit` clean, its tests green one vitest at a time (`--pool=forks --poolOptions.forks.maxForks=1`), no git
command that moves a ref or touches the index/stash. The lead commits.

## Principles (as stage 1)
- One decision, two runners: decision code in src/execution/ (embedded), taking `SiteFacts` (the artifact's
  `siteFactsAt(url)`, the daemon's live snapshot). test/execution-parity.test.ts stays green.
- Reliable or nothing; the shadow rows stay and gain `applied: true` when a fact decided.
- Fallback byte-identical; corpus 0 status changes.
- A rendering is only ever an ADDITIONAL spelling to accept, never a replacement for the exact one: every
  consumer tries the exact value first and the renderings after.

## Shared vocabulary (exact)
- `renderings(sf, key, value): string[]` (execution/facts.ts, unchanged): the reliable formats' spellings of
  `value` under `key`, framed first then core.
- **`src/execution/facts-display.ts`** (new, Piece J; add `'facts-display'` to EXECUTION_MODULES after
  `'facts-route'`; imports only ./facts.js, ./url.js, ./text.js, ./report.js, ./gates.js, ./expect.js):
  - `controlKey(url, role, name): string` = `${routeTemplateOf(url)}|${role}|${name folded}` (the same
    spelling facts-format.ts writes; move `controlKey`/`reportFormatKey`/`titleKey` here and re-export them
    from facts-format.ts).
  - `slotRenderings(sf, url, controls: Record<string, {role: string; name: string}[]>, params): Record<string, string[]>`:
    for each slot, the renderings of its param value under every reliable `format` fact of its controls
    (any route of the origin: a field's format does not change by page), exact value excluded.
  - `classifyReportValueWithFacts(sf, url, controls, template, params, shown, evidence, opts?): ReportVerdict & { applied?: true }`:
    `classifyReportValue` first; when its class is `echo`, retry once per slot rendering (and once with every
    open slot rendered) as classifyShadow does today; the first `committed` wins and carries `applied: true`;
    otherwise the original verdict.
  - `identityMarkerVerdictWithFacts(sf, pattern, url, params, marker, presence): Promise<verdict & { applied?: true }>`:
    `identityMarkerVerdict` first; when it refuses, and a reliable `format` fact on this route (any key, the
    `|title` key against `page.title()`) renders the bound value to a spelling `presence` (the same lines
    the verdict looked at) shows whole, pass with `applied: true` and a reason naming the fact.
  - `counterNames(sf, url): string[]`: the `role|name` controls with a reliable `counter` fact on this route;
    `maskCountersWithFacts(line, names)`: `maskCounters(line)` and, when the line's role and name are in
    `names`, its leading counter run masked the same way whatever the role.
- `applied` on the three format shadow rows (facts.readback, facts.classify, facts.identity), as stage 1
  did for the route rows.

## Piece J (opus): the two-runner consumers (1, 2, 5)
Files: src/execution/facts-display.ts (new), src/spec/runtime-source.ts (one entry), src/execution/report.ts
(no signature change; `classifyReportValue` stays the fallback), src/skills/facts-format.ts (import the moved
key helpers; `shadowClassify`/`shadowIdentity` become the switched calls: they return the fact-decided
verdict to their callers and stamp `applied`), src/skills/learn.ts (synthesize: the classification goes
through `classifyReportValueWithFacts` with the origin's snapshot and `slotControls`; nothing else),
src/skills/replay.ts (the identity gate calls `identityMarkerVerdictWithFacts` with `opts.facts?.snapshot(url)`;
the shadow row stays), src/spec/emit.ts (reportTemplateLines: the emitted `classifyReportValue(` call becomes
`classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), <controls literal per slot, computed at
emit time from the segment's steps: role candidates of the steps that type the slot>, …)`; identityChecks:
`identityMarkerVerdictWithFacts(siteFactsAt(page.url()), …)`; every emitted `maskCounters(` site that masks a
live or expected line goes through `maskCountersWithFacts(line, counterNames(siteFactsAt(page.url()), page.url()))`
— find them with grep, and if maskCounters is only reached through liveLines, give liveLines an optional
`counters: string[]` third argument both runners pass), test/facts-display.test.ts (the espo amount:
typed `12500`, shown `12,500.00` under a reliable thousands+decimals fact → committed with applied; the
vikunja identity: marker bound to `#4` shown as `Task #4 (#4)` → pass with applied; a counter fact masks a
`- link "3 Open"` name; fallback byte-identical with empty/advisory facts), plus test/execution-source,
spec-emit, execution-gates, report, identity, replay, and BP_PARITY_TESTS=1 execution-parity.

## Piece K (opus): the observer tightening and the daemon-only consumer (3)
Files: src/skills/facts-format.ts (observers only), src/daemon/recorder.ts (captureReadBack), src/agent/readback.ts
(displays), test/facts-format.test.ts, test/readback.test.ts.
- Affix (b) `frameObservation`/`affixOfFrame`: refuse a frame when the character on either side of `{{=}}`
  (ignoring one space) is a digit or a digit-group separator (`,` `.` `'` ` `) adjacent to a digit — the value
  was cut out of a number; refuse when the report value equals a declared var's value (`formatSession`
  gains the session's vars; the recorder has them) — a var is not a displayed field; refuse when the frame's
  remainder has fewer than one letter (pure punctuation frames say nothing). Existing snipeit `Asset {{=}}`
  and gitea `#{{=}}` cases stay.
- Typed (a): never observe when the typed value equals a var's value.
- Title (e): same var exclusion.
- Consumer 3, daemon only: `captureReadBack(page, value, label)` (recorder.ts ~1268): after the exact
  capture fails, before returning null, try each reliable rendering of `value` under `reportFormatKey(url,
  label)` and under every control key of this route whose facts render it (`renderings`); a rendering that
  matches exactly one element is captured as the read-back with `frame` set from the fact's template (so
  the read carries the affix the same way a model-found frame does) and the shadow row is `applied`.
  `displays` (readback.ts:147): the same renderings offered before the model is asked.
- Tests: the three refusals (number cut, var value, empty remainder) as unit cases on frameObservation; the
  read-back capture through a fact with a stub page (the existing readback test harness); readback.test.ts
  and recorder-evidence.test.ts green.

## Piece L (sonnet): fixtures, prompts, docs
- test/facts-stage2-corpus.test.ts: the survey rows of design §3 through the public functions: fwop10
  (innerText/textContent `twice`), fwkb39 (`Backlog ` trim), fwec13 and the espo amount (thousands+decimals
  classify), fwgt8/fwsi8 (`Seed: … (#1)` affix read-back), fwkb41 (`#4` twice/affix identity), fwvk15
  (identity), fwod85 (twice on one row), odoo's `£ 2,{{=}}` and `{{=}} Bench Customer` REFUSED by the
  observer. Poll for the pieces' exports; build SiteFacts by hand with observeFact over two sessions where soft.
- bench/sweep-prompts round 69: fwop23 fwsi20 fwgt21 fwod95 fwgr80 from the round-68 prompts (publish
  first, never idle, F4 applied rows + factRewrites), WHAT THIS IS naming stage 2 (display format facts now
  decide read-backs, report classification, identity checks and counter masking when reliable). Also
  fwod88-cv5 and fwec-cv (the design's stage-2 convergence re-runs: the odoo unsourced-ref case and an
  espo one — derive from bench/sweep-prompts/fwod88-cv4.md; for espo pick the latest fwec prompt and the
  converge form of fwod88-cv4, run id fwec16-cv).
- bench/facts-report.mjs: nothing new; notes/design/README.md status line; bench/README.md one sentence.

## Exit for stage 2 (the lead checks)
- Suites, browser, parity green; corpus 0 status changes (cloud verify).
- The espo amount and the vikunja identity fixture cases decide from facts (Piece J's tests).
- Round 69: every result matches or beats its round-68 row; every applied row read; no `£ 2,{{=}}`-class
  affix fact in any published store.
