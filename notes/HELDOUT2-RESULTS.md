# Held-out 2 results: before (main e34fd2d7) vs after (feat/spec-reliability 4e901145)

Protocol: notes/HELDOUT2-PROTOCOL.md (pre-registered 8feb0210). Scored with
`node bench/heldout/score2.mjs` over results/ha* and results/hb* (all 18 published 2026-10-06).

## Headline (pre-registered)

| | after | before |
|---|---|---|
| **clean compiled spec** (state objectives 2-6, no DUPLICATE/EXTRA) | **5/9** | **3/9** |
| spec verdict agrees with the app (honest) | 6/7 (1 silent pass) | 6/6 |
| compile refused | 2 (demoted-pin ×2) | 3 (demoted-pin ×2, no-procedure, unsourced-ref) |
| model-free replays (n2, n3) | 10/18 | 5/18 |
| clean normal runs (n1-n3) | 25/27 | 21/27 |
| report-only objectives scored on spec runs | 14 PASS | 0 (no outputs file) |
| `build --converge` turned a not-clean spec clean | 2/4 | — |
| spend | $0.43 | $0.79 |

Pre-registered decision: headline +2 (needed ≥ +2), normal runs not lower → **IMPROVEMENT**, at the
threshold exactly.

## Attribution: the gain is NOT shown to come from the new mechanisms

Each arm records its own n1, so the arms compile different recordings. Checked in the after arm's
published stores, flowruns and spec logs:

- item 1b (harmless-stop relaxation): fired **0** times (no `harmless-stop relaxation` in any store).
- item 1d (`unproven-pin`): **0** refusals; `pinStopped` was set on 7 replay steps.
- item 2b (number-only line match): fired **0** times in any run (the only hits are the runtime
  source embedded in each compiled flow file).
- item 2a (retired candidates in the artifact): present in **1** spec (hagc3, 2 candidates).
- item 3: the outputs file made report objectives scoreable (14 PASS); no probe or PARTIAL failure
  fired; the one silent pass (hakm2: its procedure never created the timesheet — n2, n3 and the spec
  all omit it) is a dropped step that none of the checks catch.
- item 4 (secondary): converge fixed hakm1 (wrong timesheet date) and hagc1 (demoted pin) to 7/7.

The before arm's spec failures were: Planka report objectives unscorable (state clean in all 3 — the
old code is clean on state there too, so Planka is a tie on the headline); grocy rep 2/3 an identity
gate (`{{v1}} is not confirmed on this page`); kimai rep 3 order number missing. The after arm's were
two demoted-pin refusals and two kimai timesheet failures. These differ by recording, not by a
mechanism either code version has and the other lacks. **With n=9 per arm and recording variance
this large, a +2 difference at the threshold is weak evidence; the attribution says it is mostly
recording luck.** The defensible gains are item 3's scoreable outputs and item 4's convergence.

## Per sweep
    app      rep | arm    | n1 n2 n3              | spec                               | converge
    planka   1   | after  | 7/7 7/7 7/7           | 7/7 pw:pass                        | —
    planka   1   | before | 7/7 7/7 7/7           | 5/7 pw:pass                        | —
    planka   2   | after  | 7/7 7/7 7/7           | 7/7 pw:pass                        | —
    planka   2   | before | 7/7 7/7 7/7           | 5/7 pw:pass                        | —
    planka   3   | after  | 7/7 7/7 7/7           | 7/7 pw:pass                        | —
    planka   3   | before | 7/7 7/7·m 7/7         | 5/7 pw:pass                        | —
    kimai    1   | after  | 7/7 7/7·m 7/7·m       | 6/7✗ pw:fail                       | 7/7
    kimai    1   | before | 7/7 6/7✗·m 6/7✗·m     | refused(demoted-pin)               | —
    kimai    2   | after  | 7/7 5/7✗·m 5/7✗       | 5/7✗ pw:pass SILENT                | 5/7✗
    kimai    2   | before | 7/7 1/7✗·m 1/7✗·m     | refused(demoted-pin,no-procedure)  | —
    kimai    3   | after  | 7/7 7/7·m 7/7·m       | refused(demoted-pin)               | 5/7✗
    kimai    3   | before | 7/7 6/7✗·m 6/7✗·m     | 4/7✗ pw:fail                       | —
    grocy    1   | after  | 7/7 7/7·m 7/7·m       | refused(demoted-pin)               | 7/7
    grocy    1   | before | 7/7 7/7·m 7/7·m       | refused(unsourced-ref)             | —
    grocy    2   | after  | 7/7 7/7 7/7           | 7/7 pw:pass                        | —
    grocy    2   | before | 7/7 7/7·m 7/7·m       | 1/7✗ pw:fail                       | —
    grocy    3   | after  | 7/7 7/7·m 7/7         | 7/7 pw:pass                        | —
    grocy    3   | before | 7/7 7/7·m 7/7·m       | 1/7✗ pw:fail                       | —
    
    ✗ = not clean; ·m = a replay that used the model; spec ✗ counts state objectives (2-6) only

## Follow-up: same recordings, both code versions (no model)

Added after the sweep result (protocol Log). bench/heldout/same-recording.mjs compiled each of the
18 published recordings with both code versions and ran every spec twice against a reset app
(results/srpk, srkm, srgc; 36 runs per version).

| | after code | before code |
|---|---|---|
| spec runs with every state objective PASS | **16/36** | **17/36** |
| compile refused | 10 | 10 |
| silent passes (Playwright pass, a state objective FAIL) | 2 | 2 |
| report objectives (1, 7) scored on compiled runs | all PASS (outputs file) | UNVERIFIABLE |

Per app: planka 12/12 vs 12/12; kimai 0/12 vs 1/12 (one before-code run of hakm1 passed, its
repeat did not — timing); grocy 4/12 vs 4/12. Refusals are identical recording by recording (the
same demoted pins and the same unsourced-ref), and so are the silent passes (hakm2's recording,
which omits the timesheet). On grocy's failing before-arm recordings the after code gets one or two
more objectives done before the same identity stop.

**Conclusion: on identical recordings the two code versions perform the same.** The sweep's +2
headline was recording variance. What items 1-4 demonstrably add on unseen apps: the spec's
findings are scoreable (item 3) and `build --converge` repairs half of the not-clean recordings
(item 4). Items 1-2 did not fire on these apps; their effect is unmeasured, not shown to be zero.
