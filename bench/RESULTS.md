# Ten real apps, one browser agent, and what the database said

sitelooper is asked to do a job in a web app it has never seen, once, with a model in the loop. It records what it did as a procedure. Then the app is reset and the same job is run twice more with **no model at all**, and once more as a compiled `@playwright/test` file with no sitelooper runtime either. Every run is scored by reading the app's own database or API after the fact. The tool's own report of success is never counted.

The finding that started this benchmark: the strongest static script an agent wrote from its own run verified **14 of 48** objectives across the first four apps, and on Odoo it **confirmed a sales order with zero lines**, left it active, printed FAILED and exited 1. The wrong record was already in the database. Codegen replays report green while the app is untouched, or mutate the wrong thing and regret it afterwards. Those two failure shapes, not model quality, are why agent-driven automation does not rerun. Detail: [MATRIX-v0.2.md](MATRIX-v0.2.md), "static incumbents".

![record once, replay for free](../docs/demo/record-once-replay-free.gif)*Three instructions recorded against the in-repo repair-desk app in 24s, 28s and 42s with the agent driving; the app reset; the same flow replayed in 16s at zero model calls, then the app's state endpoint queried. Source: [docs/demo](../docs/demo).*

## The targets

Nine self-hosted third-party applications plus the repair-desk SPA that ships in this repo.
They were chosen by client technology, not by task, because every defect the benchmark has
found came from a DOM idiom not seen before. Full list, versions and what each one stresses:
[thirdparty/README.md](thirdparty/README.md).

| code | app | what it stresses |
|---|---|---|
| rd | repair-desk (in-repo) | SPA; list that refetches a beat after each mutation |
| od | Odoo 17 | dense server-rendered CRUD, hash routes, many2one autocompletes, a configurator modal |
| gr | Grafana 11 | React SPA, deep unnamed DOM, drawers and option panes |
| kb | Kanboard 1.2 | PHP and jQuery, full-page reloads, drag-and-drop |
| op | OpenProject 17 | Angular in Rails and Turbo, click-to-edit fields, ng-select |
| gt | Gitea 1.27 | Go templates and Vue islands, pickers that apply on menu close |
| vk | Vikunja 0.24 | Vue 3, contenteditable heading saving on blur, flatpickr, create-on-type labels |
| ec | EspoCRM 10 | Backbone hash routes, inline and full edit forms, select modals |
| si | Snipe-IT 8.7 | Laravel Blade, select2 AJAX dropdowns for every relation, a checkout form |
| gh | Ghost 6.64 | Ember admin, Lexical contenteditable body, multi-stage publish modal |

## The protocol

Each sweep is k=3 on one cloud box per target: run 1 records with the orchestrator on, runs 2
and 3 replay the learned flow against a reset app with no orchestrator, then the compiled
Playwright script replays it once more. A target is **green** only when all three hold:

- every run verifies every objective, with no duplicate records and no stray mutations;
- every replayed step on runs 2 and 3 runs at tier A, meaning zero model turns;
- the compiled script compiles and passes, with at most report-only objectives unverifiable.

That is a strict bar. A replay that falls back to the model and still passes every verifier is
not green. One row per sweep, with the cause of every miss, is in [SWEEPS.md](SWEEPS.md).

## Where the ten targets stand

Every target has reached green. Round 40 was a confirmation pass on a frozen build and came in
5/10; the misses were new recording routes, each fixed at its cause in rounds 41 to 43. Round
45 on e8a9a47 was the second confirmation and came in 6/10:

| target | latest sweep | run 1 verified | replays at 0 model turns | compiled script | green | raw files |
|---|---|---|---|---|---|---|
| repair-desk | fwrd82, r45 | 6/6 ×3 | yes, 6/6 steps | ran 0/1: a raw `[role=dialog]` selector the recorder stored unrewritten | no | `results/fwrd82-c17xzp` |
| Odoo | fwod78, r45 | 6/6 ×3 | no: two steps fell back | ran 0/1 | no | `results/fwod78-gtej59` |
| Grafana | fwgr67, r45 | 6/6 ×3 | yes, 6/6 steps | pass, 0 drift | **yes** | `results/fwgr67-k47023` |
| Kanboard | fwkb38, r45 | 6/6 ×3 | yes, 7/7 steps | pass, 0 drift | **yes** | `results/fwkb38` |
| OpenProject | fwop9, r45 | 7/7 ×3 | yes, 4/4 steps | pass, 1 drift | **yes** | `results/fwop9-q84iki` |
| Gitea | fwgt5, r45 | 7/7 ×3 | no: one step at tier B | refused: an image-only link read back as "" | no | `results/fwgt5-3xem2s` |
| Vikunja | fwvk6, r45 | 7/7 ×3 | yes, 7/7 steps | pass, 1 drift | **yes** | `results/fwvk6-7ft8os` |
| EspoCRM | fwec7, r45 | 7/7 ×3 | yes, 4/4 steps | pass, 0 drift | **yes** | `results/fwec7` |
| Snipe-IT | fwsi6, r45 | 7/7 ×3 | yes, 3/3 steps | pass, 0 drift | **yes** | `results/fwsi6` |
| Ghost | fwgh8, r45 | 7/7, 6/7, 6/7 | no: a popup credited to the wrong click | ran 0/1 | no | `results/fwgh8` |

Read the "run 1 verified" column first: the agent did the job on every app, every time, with
one objective missed on two Ghost replays. The misses are in the two stricter columns, and each
one is a named engine defect with a fix path in the sweep log. The last green sweep for the
four non-green rows: repair-desk fwrd81 (r40), Odoo fwod77 (r40), Gitea fwgt4 (r42), Ghost
fwgh7 (r42).

Raw files for every row live on the `results/<runid>` branch of this repository: the sweep
table, both flow runs, the compiled spec, its Playwright report and every verifier log.

## Against an agent that runs every time

The only comparator with a full row is agent-browser, run on the same boxes with the same
model, glm-5.3. It has no replay mode, so repeating a job costs the first-run price again.
These are the four original targets on the last converged build of rounds 29 to 32
(c2652f4 to ab5de17); cost is model spend at list price.

| target | sitelooper recording | sitelooper replay ×2 | compiled script | agent-browser, every run |
|---|---|---|---|---|
| repair-desk | 6/6 · $0.08 · 396s | **6/6, 6/6 · $0 · 31s, 31s** | 6/6 · 35s | 6/6 · $0.19 · 67s |
| Kanboard | 6/6 · $0.07 · 320s | **6/6, 6/6 · $0 · 28s, 28s** | 4/6 + 2 report-only · 25s | 2/6, turn-capped · $0.77 · 118s |
| Grafana | 6/6 · $0.10 · 801s | **6/6, 6/6 · $0 · 76s, 77s** | 4/6 + 2 report-only · 77s | 6/6 · $1.05 · 448s |
| Odoo | 6/6 · $0.11 · 482s | **6/6, 6/6 · $0 · 62s, 62s** | 6/6 · 55s | 6/6 · $1.51 · 302s |

On first contact sitelooper is the slowest arm on every target, by 1.6× to 6×. That is the
price of recording verified locators, value provenance and effect expectations while it works,
and it is also 2× to 14× cheaper. Every run after the first costs nothing and beats the agent
on wall clock by 2.2× to 5.9×.

## Two Playwright scripts: the agent writes one, sitelooper compiles one

The most direct comparison in the benchmark. Both arms end in a standalone `@playwright/test`
file with no model and no sitelooper runtime, run under the real Playwright test runner against
a reset app and scored by the same verifiers.

- **Agent-authored script:** agent-browser does the job, then the same model writes a Playwright
  script from its own command log. One authoring call, about $0.02 to $0.04. Set 17.
- **Codegen:** the recording emitted as literal Playwright code, no judgement. Set 16.
- **sitelooper compiled spec:** `sitelooper compile` turns the recording into a spec whose
  locators are measured candidate chains, whose values are slots bound to declared inputs or
  to earlier steps' read-backs, and whose steps carry effect checks. Rounds 29 to 32.

| target | agent-authored script (r1, r2) | codegen (r1, r2) | sitelooper compiled spec |
|---|---|---|---|
| repair-desk | 1/6, 1/6 · 31s | 6/6, 6/6 · 36s | **6/6** · 35s · 0 drift |
| Kanboard | 5/6, 5/6 · 32s | 4/4 + 2 report-only · 62s | **4/4** + 2 report-only · 25s · 0 drift |
| Grafana | 0/6, 0/6 · 17s | 0/6, 0/6 · 35s | **4/4** + 2 report-only · 77s · 0 drift |
| Odoo | 1/6, 1/6 · 77s | 0/6, 0/6 · 8s | **6/6** · 55s · 0 drift |
| **total, checkable** | **14/48** | **20/44** | **20/20** (one run per target) |

Report-only objectives ask the run to state a value in its final report; a script writes no
report, so they are unverifiable for every script arm and are excluded from the checkable
totals.

How each one loses:

- **The agent's script keeps the intent and loses what happened.** On Grafana it dodged both
  predicted traps, created the dashboard through the HTTP API and re-found it by name, then died
  at step one on a `waitForURL` pattern the real post-login redirect never matches. On Odoo it
  reached the order with a remembered selector, confirmed it with zero lines and left it
  active, then printed FAILED. Its one strong cell, Kanboard at 5/6, came from finishing work
  from memory that its own live run had never done.
- **Codegen keeps what happened and loses the intent.** It beat the authored script on
  repair-desk because the recording preserved a click the author forgot. On Grafana and Odoo it
  hit a minted id or an animation-gated control in the first third and stopped, both runs,
  deterministically.
- **The compiled spec keeps both**, the observed gesture with its measured locators and the
  checked effect that says what the gesture was for. Its failure mode is different in kind: it
  refuses at compile time when a value has no source, rather than running and guessing. The
  round-45 Gitea row is that refusal.

Across the ten targets at round 45, the compiled spec passed on six, refused to compile on one,
and ran but stopped at a gate on three; each stop is named in the table above and in
[SWEEPS.md](SWEEPS.md). No agent-authored script has been run on the six newer targets yet.

## What this benchmark does not show

- **Every comparator was run by us**, from its own documentation, on a budget model. A vendor
  would tune it better. The numbers show shapes, not ceilings.
- **The closest competitors are missing.** Record-then-replay tools with model-on-drift, such as
  browser-use's workflow-use, Stagehand's action caching or the commercial self-healing
  suites, have no row yet. Adding workflow-use on repair-desk and Odoo is the next bench task.
- **Three clean runs is an execution gate, not a flakiness statistic.** A green sweep says the
  flow replayed model-free three times on one build against a reset app. It does not say how it
  survives a month of deploys; the drift and repair columns in the sweep log are where that
  evidence accumulates.
- **First-contact recordings vary run to run.** They are model-driven, and a sweep is not a
  distribution. Recording cost and wall clock should be read as one sample each.

## Reproducing a row

```sh
docker compose -f bench/thirdparty/<name>/docker-compose.yml up -d
bash bench/thirdparty/<name>/seed.sh          # odoo, openproject, gitea, snipeit
node bench/sweep.mjs --k 3 --arm sitelooper --target <name> \
  --task bench/tasks/<name>-*.md --provider openrouter --verify --out bench/results
```

The repair-desk row needs no container: `node bench/app/server.mjs`, then the same sweep with
`--target repairdesk`. Verifiers are `bench/verify-<name>.mjs`; each reads the app's mutation
log, JSON-RPC or HTTP API and scores every objective without trusting the run's report.
