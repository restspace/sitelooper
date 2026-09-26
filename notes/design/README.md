# Design pass after round 60 (2026-09-24)

Three designs, written after reviewing rounds 50-60 (bench/SWEEPS.md), and the order the user approved.

- design-provenance.md: where a value's truth comes from (Source, static and stored) and what this run saw
  (Evidence, per run), with one publish/bind policy in src/execution.
- design-recorder-evidence.md: record what happened between gestures and credit each change to its cause,
  so compile decides from facts, not heuristics.
- design-recording-hygiene.md: page scripts (eval) during recording, the empty-read hint, `$0`.

Approved order:
- Phase A: provenance stage 0 (census), recorder stage 0 (persist facts already computed), hygiene stages 0-2.
- Phase B: provenance stage 1 (one shared classify; closes the four typed-value false-positive holes).
- Then a ten-app confirmation sweep.
- Phases C/D (shadow-mode journals, provenance tags at export, retiring heuristics, readings) await that sweep.

No rehearsal replays: the user ruled out a cost per recording.

Status (2026-09-25):
- Phases A and B shipped (0e778e9). Phase C shipped in shadow mode (f508e0d, b6966d3); keyPick and the
  restored-field detour decide from the journal already (round 62). Phase D not started as a phase.
- Hygiene stages 3-4 (the commentary pre-pass and the sourcing hold, design-recording-hygiene.md §4) are
  built on fix/hygiene-s34 in src/agent/sourcing.ts, behind SITELOOPER_SOURCING_HOLD=on (default off:
  byte-identical loop). The hold leaves a durable trace on the report entry (RecordedReport.sourcingAsk),
  counted by bench/ab-metrics.mjs. Confirmation batch: bench/sweep-prompts/fwop19, fwsi16, fwgt16, fwec16,
  fwgh19 (the eval-heavy apps) and fwrd94, fwod90 (controls), all with the flag on.
- design-site-facts.md (2026-09-26): one per-origin store of OBSERVED facts (URL route, display format, value
  class), counted before relied on, snapshotted into the artifact; stage 0 shadow, then one consumer class per
  stage. Written after the round 54-65 survey. Stage 0 wave 1 (the store, the compile snapshot) shipped
  34dc36cc; wave 2 (observers, shadow rows, and the bench reporting: `bench/ab-metrics.mjs`'s `facts_*` rows,
  `bench/facts-report.mjs`) shipped, stage 0 exited round 67 (8608aafa). Stage 1 (site-facts-stage1-contract.md,
  §2 URL route consumers: `landingVerdictWithFacts`/`preconditionVerdictWithFacts`/`routesAgreeByFacts` in
  src/execution/facts-route.ts, the learn-time pattern rewrite in src/skills/facts-rewrite.ts, and the ledger's
  identity-aware admissions in src/skills/ledger.ts) shipped, merged to main (287d586b); fwgt19 green, cv4 and
  round 68 confirmed it. Stage 2 (site-facts-stage2-contract.md, §3 display format consumers: report
  classification, identity checks, read-back capture and counter masking behind `reliable()` in the new
  src/execution/facts-display.ts, plus a tightened affix observer in src/skills/facts-format.ts) is in build on
  feat/site-facts-2, three pieces in parallel.
