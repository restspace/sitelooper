# Landing page numbers

Every figure the landing copy can use, grouped by the claim it backs. Each has a paste-ready
line, the raw figure, and where it comes from. Anything marked **⚠** needs a decision or a
refresh before it goes on the page.

Sources: `bench/RESULTS.md` (RESULTS), `bench/SWEEPS.md` (SWEEPS), `README.md` (README),
`docs/demo/recording.log` (DEMO). Build ranges are given so a number can be re-checked.

---

## 1. Hero stats (pick three)

| stat | paste-ready | source |
|---|---|---|
| Replay cost | **$0.00** per replay: zero model calls once a flow is recorded | RESULTS "Against an agent", replay column, all four targets |
| Replay speed | **2×–6× faster** than an agent doing the job again | §2, latest green sweeps |
| Recording cost | **4×–16× cheaper** than an agent, even on the first run | §2, latest green sweeps |
| Apps | **10 real apps**, scored from each app's own database | RESULTS "The targets" |
| Honesty | **14 of 48**: what an agent's own Playwright script verified. sitelooper's compiled spec: **20 of 20** | RESULTS "Two Playwright scripts" |

---

## 2. "Agents are slow and expensive every run"

sitelooper figures come from the **latest green sweep** of each app, read from its
`results/<runid>` branch: n1 `spendUsd` and `wallMs` from `-n1-sitelooper-result.json`,
replays from `-n2/-n3-flowrun.json`, and the spec from `-spec-spec-result.json`. Model spend
is at list price, the same basis as the agent column.

The agent column (agent-browser, glm-5.3) is still **set 17**, the only agent-browser run
there is. Re-running it on today's boxes would make the comparison same-era.

| app | sweep | agent, every run | sitelooper, first run (recording) | sitelooper replay (n2, n3) | compiled Playwright spec |
|---|---|---|---|---|---|
| repair-desk | fwrd81 r40 | $0.19 · 67s | $0.049 · 171s | **$0 · 34s, 34s** | $0 · 39s |
| Kanboard | fwkb38 r45 | $0.77 · 118s (2/6, turn-capped) | $0.054 · 187s | **$0 · 20s, 19s** | $0 · 21s |
| Grafana | fwgr67 r45 | $1.05 · 448s | $0.095 · 475s | **$0 · 201s, 98s** | $0 · 97s |
| Odoo | fwod79 r47 | $1.51 · 302s | $0.097 · 432s | **$0 · 79s, 79s** | $0 · 64s |

Ratios against the agent (replay uses the mean of n2 and n3):

| app | first run cheaper | first run slower | replay faster | spec faster |
|---|---|---|---|---|
| repair-desk | 3.9× | 2.6× | 2.0× | 1.7× |
| Kanboard | 14× | 1.6× | 6.1× | 5.6× |
| Grafana | 11× | 1.06× | 3.0× | 4.6× |
| Odoo | 16× | 1.4× | 3.8× | 4.7× |

Paste-ready:

- "An agent costs up to **$1.51 a run** on a dense app like Odoo, every run."
- "sitelooper's replays and compiled specs cost **$0.00**. They make no model calls."
- "Replays are **2× to 6× faster** than asking an agent again. Compiled specs are
  **1.7× to 5.6× faster**."

⚠ Replays got slower than in rounds 29–32 on three apps: repair-desk 31s → 34s, Odoo
62s → 79s, and Grafana 76/77s → 201/98s. Odoo's flow grew from 7 to 8 steps, but Grafana's
201s replay (all steps tier A, zero turns) is worth a look before quoting it.

⚠ repair-desk's latest sweep, fwrd84 (r49), isn't green: its replays fell back to the model
(196s and 134s), so fwrd81 is used above. Its recording cost $0.062 · 223s.

Derived: 100 CI runs of the Odoo job (for a chart):

| | model spend | wall clock |
|---|---|---|
| agent every run | 100 × $1.51 = **$151** | 100 × 302s ≈ **8.4 h** |
| sitelooper: record once, replay 99× | **$0.10** | 432s + 99 × 79s ≈ **2.3 h** |
| sitelooper: record once, compiled spec 99× | **$0.10** | 432s + 99 × 64s ≈ **1.9 h** |

---

## 3. "The first run is slow but cheaper"

- "The first run costs **5 to 10 cents**, **4× to 16× less** than an agent run."
- "It's **up to 2.6× slower** than an agent (1.1× to 2.6×), because it records verified
  locators, where each value came from, and the effect each step should have."
  ✓ Same as the current copy. Keep the honesty; it builds trust. The gap has narrowed a
  lot since rounds 29–32 (1.6× to 6×).
- What OpenRouter actually billed, with cache discounts, was about half of list price:
  $0.027–$0.055. Only quote it with the basis stated, since the agent column is list price.

---

## 4. "Agents' scripts aren't reproducible" (the green-lie story)

Both arms end in a standalone `@playwright/test` file run against a reset app, scored by the
same database verifiers. Four original apps.

| | checkable objectives verified |
|---|---|
| script an agent wrote from its own run | **14 / 48** |
| codegen from the recording | **20 / 44** |
| sitelooper compiled spec | **20 / 20** |

Per-app detail for a visual:

| app | agent-written script | codegen | sitelooper spec |
|---|---|---|---|
| repair-desk | 1/6, 1/6 | 6/6, 6/6 | 6/6 |
| Kanboard | 5/6, 5/6 | 4/4 | 4/4 |
| Grafana | 0/6, 0/6 | 0/6, 0/6 | 4/4 |
| Odoo | 1/6, 1/6 | 0/6, 0/6 | 6/6 |

Paste-ready anecdote: "On Odoo, the script an agent wrote from its own run **confirmed a sales
order with zero lines**, left it active, and only then printed FAILED. The wrong record was
already in the database."

Cost of the agent-written script: $0.02–$0.04 per authoring call (so it's cheap, just wrong).

⚠ The spec arm ran once per app. The two script arms ran twice. "20/20" is one run each.

---

## 5. "Works on real apps"

The 10 targets and the front-end stack each one stresses (RESULTS "The targets"):

repair-desk (in-repo SPA), Odoo 17, Grafana 11 (React), Kanboard 1.2 (PHP/jQuery),
OpenProject 17 (Angular/Turbo), Gitea 1.27 (Go/Vue), Vikunja 0.24 (Vue 3), EspoCRM 10
(Backbone), Snipe-IT 8.7 (Laravel/select2), Ghost 6.64 (Ember/Lexical).

Paste-ready: "Benchmarked on ten real apps, from React and Vue to Angular, Ember and plain
PHP. Every run is scored by reading the app's own database or API. The tool's own report
of success is never counted."

The pass bar ("green") for each app requires all of these:
- the first run plus 2 replays all verify every objective;
- both replays run every step with zero model turns;
- the compiled Playwright spec passes.

⚠ **Status is live, not settled.** From the latest sweep per app in SWEEPS:

| app | latest sweep | green |
|---|---|---|
| Grafana | fwgr67 r45 | yes |
| Kanboard | fwkb38 r45 | yes |
| OpenProject | fwop9 r45 | yes |
| Vikunja | fwvk6 r45 | yes |
| EspoCRM | fwec7 r45 | yes |
| Snipe-IT | fwsi6 r45 | yes |
| Ghost | fwgh9 r47 | yes |
| Gitea | fwgt6 r47 | yes |
| Odoo | fwod79 r47 | yes* (password stored as a literal; fixed in r48, needs a re-sweep) |
| repair-desk | fwrd84 r49 | **no** (last green fwrd81, r40) |

Safe claims today:
- "Every one of the ten apps has passed the full bar."
- "**9 of 10** are green on their latest sweep."

Don't claim "10/10 green" until repair-desk is fixed and re-swept. Also,
RESULTS.md's status table is still at round 45 (6/10) and should be refreshed before the
page links to it.

---

## 6. "Record once, replay for free" (the demo GIF)

From DEMO, repair-desk:

| instruction | recorded, agent driving |
|---|---|
| Sign in and verify the ticket list | 24s |
| Create a ticket, report its id | 28s |
| Add a part, report the computed price | 42s |
| **App reset, whole flow replayed** | **16s, 0 model calls** |

Paste-ready: "Three instructions took 94s with the agent driving. After an app reset, the
same flow replayed in **16s with zero model calls**."

⚠ README line 13 says "a seven-step ticket workflow in **17 seconds**". That's an older
result (set 24, MATRIX-SUMMARY). The current benchmark replay is 8 steps in 31s.
Use either the GIF figure (16s, 3 steps) or the benchmark figure (31s), and fix the README
to match.

---

## 7. "Self-healing / robust to change"

This claim has the **weakest direct numbers**. The benchmark measures replay against a reset
app on the same build. It has not yet run a flow against a changed app over time. RESULTS says
so in "What this benchmark does not show". What exists:

- **Recovery ladder:** each step tries a replay with zero model calls, then the cheap model,
  then the strong model, then halts. A recovery that validates is re-pinned into the flow.
  (README, design; no aggregate stat)
- **Inline heals:** fwrd82 (r45) replays healed **12 locators each** and still ran every
  step at zero model turns. (SWEEPS)
- **Spec repair converged:** Kanboard in 0 tickets; Grafana in 2 rounds; Odoo 9/9 steps
  with nothing to change. (README "Tier 2 spec, status")
- **Before/after on an engine fix** (not an app change): Kanboard replays went from 22 and
  37 model turns to **0 and 0**, 272s/555s → 56s/56s. (README set 24 → 24b)

⚠ Recommendation: keep "self-healing" framed as mechanism (the ladder diagram), not as a
number. If you want a number, run a small "break the app" bench: rename a button, move a
field, add a confirm dialog on repair-desk. Record how many steps heal at tier A vs need a
model vs need a rerecord. That also produces the clip for the page.

---

## 8. Models and setup facts

- Default inner model: `deepseek/deepseek-v4.1-flash` (pinned to DeepSeek's backend on
  OpenRouter). A blocked instruction escalates to `z-ai/glm-5.3`. (README ~l.100, l.400)
- Presets: `openrouter` (default), `zhipu`, `novita`, so the page can say "model-agnostic,
  bring your own key".
- The benchmark ran exactly this stack: glm-5.3 as the outer agent, DeepSeek v4.1 Flash
  inside, glm-5.3 escalation. (README l.269)
- Credentials: since round 48, a credential typed in the clear becomes `{{env:NAME}}`. The
  compiled spec reads `process.env`, and warnings name the variable, never the value.
  (SWEEPS round 48)

⚠ The landing example "with password bench-pass-1234" contradicts the credentials point.
Change it to "…with password $APP_PASSWORD" or similar.

---

## 9. Caveats to keep (they increase trust)

From RESULTS "What this benchmark does not show", short enough for a footnote:

- Comparators were run by us, on a budget model; a vendor would tune them better.
- Record-then-replay competitors (workflow-use, Stagehand caching, commercial self-healing
  suites) aren't benchmarked yet.
- 3 clean runs is an execution gate, not a flakiness statistic.
- First-run cost and time are one sample each.
