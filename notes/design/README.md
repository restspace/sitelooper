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
