# Sweep log

One row per cloud sweep, newest last. The raw results are on the `results/<runid>` branch
(sometimes with a random suffix, e.g. `results/fwop4-53c5ub`). Every sweep is k=3: n1 records,
n2 and n3 replay the learned flow with no orchestrator, and then the compiled Playwright
script replays it against a reset app.

**Green** means all of these hold:
- every run (n1–n3) verifies every objective, with no duplicate records and no extra
  mutations;
- every replay step on n2 and n3 is tier A with 0 turns;
- the compiled script compiles and passes, with at most report-only objectives
  UNVERIFIABLE.

Codes: rd repairdesk, od odoo, gr grafana, kb kanboard, op openproject, plus the
targets added from round 36 on (see bench/thirdparty/README.md).

| Round | Runid | Commit | App | Runs n1/n2/n3 | Replays tier A 0 turns | Compiled | Green | Notes |
|---|---|---|---|---|---|---|---|---|
| 33 | fwop2 | 054282a | op | pass | no | died | no | 01-signin re-pinned mid-chain; Turbo url captured early; 06-open stale wp id |
| 33 | fwrd78 | 054282a | rd | pass | — | refused | no | fresh browser at #/tickets, not #/login |
| 33 | fwod74 | 054282a | od | n2/n3 duplicate orders | no | — | no | export adopted a failed create its successor redid |
| 33 | fwgr63 | 054282a | gr | pass | — | refused | no | unsourced-ref (text substitution) |
| 33 | fwkb34 | 054282a | kb | pass | yes | pass | yes | |
| 34 | fwop3 | 263d50a | op | 7/7 | no | pass 5/7+2 n/a | no | double comment: stale snapshot ref |
| 34 | fwrd79 | 263d50a | rd | 6/6 | yes | fail | no | aria-hidden asterisk in a stored name → 80e04d8 |
| 34 | fwod75 | 263d50a | od | 6/6 | yes | 6/6 | yes | |
| 34 | fwgr64 | 263d50a | gr | 6/6 | — | unbound-pin | no | → b5241ef |
| 34 | fwkb35 | 263d50a | kb | 6/6 | — | unsourced-ref | no | seed title threaded → b5241ef |
| 35 | fwop4 | 12dd754 | op | 7/7 | no (08-open false pass n2, fell back n3) | refused (demoted) | no | url id at another path position → 1df3645 |
| 35 | fwrd80 | 12dd754 | rd | 6/6 | yes | 6/6 | yes | |
| 35 | fwod76 | 12dd754 | od | 6/6 | no (04-open fell back: recording never read product_name) | 6/6 | no | recording variance |
| 35 | fwgr65 | 12dd754 | gr | 6/6 | yes | pass 4/6+2 n/a | yes | |
| 35 | fwkb36 | 12dd754 | kb | 6/6 | yes | pass 4/6+2 n/a | yes | |
| 35b | fwop5 | 1df3645 | op | 7/7 | yes | pass 5/7+2 n/a | yes | first sweep to publish n1-script.jsonl |
