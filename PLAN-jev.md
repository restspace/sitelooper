# PLAN — Jev as an optional System One tier

Branch `jev`. Enabled only when a TypeSafe API token is present; with no token the
tool behaves exactly as it does today.

## 1. What Jev is, and what that rules out

Docs: https://docs.typesafe.ai (index at `/llms.txt`). Facts the plan rests on:

| | |
|---|---|
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY` |
| Request | `{ model: "jev-latest", state: string \| object \| array, questions: { key: question } }` |
| Primitives | **choice** (one of options YOU supply → choice + probabilities + confidence), **score** (ordered rubric), **noul** (yes/no probability). Nothing else. |
| Output | **No text generation at all.** No tool calls, no JSON, no names, no selectors. |
| Input | Text only. 64k tokens per request; 32k for `state` + the longest question. |
| Price | $0.042 / M input tokens; output free. (deepseek-flash tier is ~10× that on input, strong tier far more.) |
| Limits | 250k tok/s, 1,200 req/min. |
| Batching | Many questions against one `state` in one request are evaluated in parallel; extra questions add ~no latency ("speculative fan-out"). |
| Known weak spots (Jev 1.13) | literal reading; no counting/arithmetic; dates/hex as text; **accuracy drops with large irrelevant state**; not injection-resistant; thresholds don't transfer between primitives. |

Consequence: **Jev cannot be a `Provider`.** `Provider.complete()` (`src/agent/llm.ts:89`)
returns tool calls and text; Jev returns neither. It can't drive the inner agent loop
(`src/agent/loop.ts:642`), can't write a `report`, can't emit a `batch`. Adding a
preset to `PROVIDER_PRESETS` is the wrong shape.

What it *can* be is a fourth tier **below** the routine model:

```
deterministic code  →  Jev (pick among enumerated candidates)  →  routine model  →  strong model
   free, exact          ~free, ~100s of ms, calibrated            $, seconds/turn     $$, escalation
```

## 2. The one design rule

> **Code enumerates, Jev picks, code verifies.**

Every Jev decision sits between a deterministic *candidate generator* and a
deterministic *verifier* the repo already has (kind checks, `expectedChangesVerdict`,
precondition/identity gates, `recordCandidateEvidence`). Jev never widens what can
happen — it only orders options the code already considers legal. That is how the
"output limitation" is absorbed: every generative answer we currently ask a model for
is restated as *choose from a closed set that code built*, and where no closed set can
be built, the site keeps its LLM.

Corollaries:

- Every choice carries a `none of these` option; `none` or low confidence ⇒ the
  existing LLM path runs unchanged. Jev failing (timeout, 429, 5xx, no key) is
  indistinguishable from Jev absent.
- Confidence gates are **per site and per consequence** (read-only lower, clicks that
  mutate higher), calibrated from the corpus, never shared between choice and noul.
- State is filtered in code first (same-kind elements only, the step's own template,
  not the whole snapshot) — Jev's accuracy depends on it, and it keeps us far under 32k.
- Compiled artifacts stay zero-model. Jev lives only in the daemon, at positions where
  a model would otherwise have been called, so the daemon/artifact parity contract is
  untouched.

## 2a. Map/reduce is the native shape, not an optimisation

Two facts pull the same way: Jev's accuracy **falls with large irrelevant state**, and
calls are near-free and parallel. So the right unit of work is never "one big question
about the whole page" — it is *many small questions about small states, reduced in code*.
Sharding fixes the model's main weakness and its 32k limit at once, and wall-clock stays
≈ one call.

Two axes, used together:

- **Fan the questions** — many questions on one state in one request (free latency).
  Use for speculative questions and for asking the same thing several ways.
- **Shard the state** — many requests, each with a small slice (one element + its
  neighbours, one page region, one flow step, one value occurrence). Use whenever the
  whole thing is big or mostly irrelevant.

Reducers are plain code, and there are only a few worth having:

| Reducer | Use |
|---|---|
| **top-k** over per-item scores | relevance filtering, ranking |
| **tournament** — choice per shard of ~10, then choice among winners | picking one element from hundreds |
| **beam descent** — score regions, descend into the best few | huge pages (Odoo forms, Grafana panels) |
| **agreement** — same question over k phrasings / k option orders; disagree ⇒ defer | turning cheap calls into reliability; defeats position bias |
| **min-confidence** | any decision composed of several answers |
| **any / all** over nouls | gates ("is any error shown", "are all slots stated") |

`src/agent/system-one.ts` therefore ships a `mapReduce` helper from day one:
token-budgeted sharding, a concurrency limiter under 1,200 req/min and 250k tok/s,
**one deadline for the whole fan-out** (a fan-out is as slow as its slowest shard, so
stragglers are cut, not awaited), and a partial-failure rule — a missing shard makes
the reduce *defer to the LLM path*, never guess.

## 3. Phase 0 — client, config, accounting (no behaviour change)

New `src/agent/system-one.ts`, raw `fetch` like `llm.ts` (repo has no SDK deps;
`@typesafe-ai/sdk` also wants Node 20+):

```ts
export interface SystemOne {
  readonly model: string;
  ask<Q extends Questions>(state: JsonValue, questions: Q, opts?: { signal?: AbortSignal }): Promise<Answers<Q>>;
}
export const choice = (instructions, options) => …   // options: Record<key, description|null>
export const noul   = (instructions, criteria?) => …
export const score  = (instructions, levels) => …
```

- **Resolution** in `resolveProviderConfig` (`llm.ts:242`), same precedence as every
  other field: flag `--no-jev` > env `SITELOOPER_JEV` (`auto|off`) / `SITELOOPER_JEV_API_KEY`
  / `TYPESAFE_API_KEY` > `~/.sitelooper/config.json` (`jevApiKey`, `jev`) > off.
  `auto` = on iff a key resolves. Model overridable via `SITELOOPER_JEV_MODEL`
  (default `jev-latest`). Add the new suffixes to `RENAMED_ENV_SUFFIXES`
  (`src/shared/paths.ts`) and to the cleared `ENV_VARS` list in `test/llm.test.ts:14`.
- **Budget**: hard 3s `AbortSignal.timeout` per ask, at most one retry, reuse
  `retryDelayMs` for 429/529. A slow Jev must never cost more than it could save.
- **Wiring**: `SessionServer.systemOne(): SystemOne | null` beside `provider()` /
  `fallbackProvider()` / `recoveryProvider()` (`src/daemon/server.ts:310-346`).
- **Accounting**: fold usage into `usageByModel['jev-latest']` (`state.ts:99`); add the
  rate to `bench/rates.json`; `config` command prints whether Jev is active.
- **Decision log**: every ask appends `{site, options, chosen, confidence, acted|deferred, verifierOutcome}`
  to the session log. This is the calibration dataset for every threshold below.
- **Tests**: a `scriptedSystemOne()` fake alongside `scriptedProvider()` in
  `test/loop.test.ts`. CI has no keys, so everything is default-off there.
- **First task inside phase 0**: `bench/jev-probe.mjs` — one live call per primitive to
  pin the exact response field names (the docs pages summarise them; verify against
  `typesafe-sdk-js/src/types.ts`) and to **measure real latency** — the docs give no number.

### Step 0 status — DONE 2026-09-18 (uncommitted)

Landed: `src/agent/system-one.ts` (client, `mapReduce`, `shardByTokens`, reducers),
config keys `jev` / `jevApiKey` / `jevModel` + env `SITELOOPER_JEV`, `SITELOOPER_JEV_API_KEY`
/ `TYPESAFE_API_KEY`, `SITELOOPER_JEV_MODEL`; `SessionServer.systemOne()`; `config`
reports a `systemOne` block; `SessionState.recordSystemOneUsage` /
`recordSystemOneDecision` → `system-one.jsonl`; `bench/rates.json` `typesafe` table,
`priceRun` prices `inner.systemOne`; `test/system-one.test.ts` (15 tests);
`bench/jev-probe.mjs`.

Three deviations from the text above, all deliberate:
- Jev usage is **not** in `usageByModel`. That map is priced under the inner provider's
  rate table and an unknown model there nulls the run's cost — disabling the spend
  ceiling. It has its own `state.systemOne` bucket, keyed by *served* model.
- The new env vars are **not** in `RENAMED_ENV_SUFFIXES`: that list aliases legacy
  prefixes, and these names never existed under them.
- `--no-jev` is resolvable (`resolveSystemOneConfig({ off: true })`) but not yet a CLI
  flag: it gets plumbed with the first call site, per command, like `--fallback-model`.

**Probe results** (`jev-1.13.0`, from this machine, ~$0.006 for 371 requests):

| | measured |
|---|---|
| Wire shape | matches the SDK types; strict `parseAnswers` accepts live replies |
| Single request | p50 ~290ms, p90 ~570ms (first call ~900ms cold) |
| Questions per request | **free, confirmed**: 1 → 286ms, 10 → 318ms, 40 → 276ms p50 |
| Fan-out, 200 shards | 2.4s @ 32 concurrent, **1.2s @ 64**, 1.1s @ 128 — default set to 64 |
| Fan-out, 50 / 100 shards | ~1.2s each — the floor is ~1s regardless of N |

What that means for the sites: inline healing (B) at ~300ms is an easy win over a
minutes-long recovery. A per-action observer (G) at ~300ms is affordable *only off the
critical path*, as planned. Sharded fan-out costs **~1.2s, not ~0.3s** — fine for
record-time and `stop` work (I, J, K), marginal for anything per-turn (H): prefer many
questions on ONE modest state over many shards when latency matters.

Judgement smoke test, 4/5 — small, but two results worth carrying forward:
- **MISS — fwgr8** (`bench` inside `fwgr8-n1-bench-dashboard` vs the reported tag
  `bench`): noul 0.72 that it IS the tag. The literal-reading weakness, exactly: the
  string does equal the tag. Site I needs more in state than the value and the line —
  at least where the value was *read from* and what the URL segment *names* — and this
  case goes in the regression zoo as a known-hard one. The clock-time case (round 26)
  passed at 0.36, which is the right side but not a confident one.
- **Isolated shards lose context**: scoring elements one per shard for "Save the
  quotation" ranked `button "Confirm"` (1.78) above `button "Save record"` (1.55).
  With all elements in one state, `choice` picked Save record at 0.98. So for H and A,
  shard by *region with neighbours*, not by single element, and keep tournament
  finals as one `choice` over the shortlisted set.

### Step 1 status — DONE 2026-09-18

`src/agent/decide.ts` (`cascade` / `jevDecider` / `shadow`, the `GATES` table, and a
test that only the daemon and the CLI may ask whether System One exists), then site A:
`src/skills/repair-jev.ts`, wired as `cascadeProposer(systemOne, llmProposer)` in
`server.ts` (`patch`) and `cli.ts` (`skills repair --drift`). With no key it returns
the `llmProposer` object itself. Gate `repair.propose` = 0.85.

Learned, and binding on later sites:
- **min-confidence cannot span primitives.** Folding the `gone` noul into the min made
  the site dead code (a correct 0.95/0.83 pick sat beside a noul of 0.47 → 0.06). A
  noul beside a choice is a **veto with its own threshold** (`GONE_VETO` 0.8), never a
  term in the min. Applies to D and K, which both said "min over all answers".
- Synthetic probe (15 cases × 3, dead chains from published sidecars, ~$0.002):
  39/45; correct picks 0.78–0.99 (median 0.99); the only misses are **N identically
  named rows** (picks the first, ≤0.77) — which `patchSegment`'s resolves-to-one check
  already refuses. 52-row tournament: correct at 0.99 in ~0.9s.
- Locators are built in the recorder's real order (testid → role+name → label →
  placeholder → id → text), not the order §4A lists.
- **M is dropped**: `triage()` is fully determined by ticket evidence, its one threshold
  is a float (not Jev's job), and there is no page at triage time. The
  renamed/moved/gone question is only well-posed on the live page, where A's `gone`
  noul already asks it.
- **No offline corpus exists for A** (§5.1 assumed one): drift sidecars don't persist
  the page's element list. Cheap fix worth doing before B: store `interactiveRows`
  output on the ticket when patch-segment runs, so every repair becomes a labelled case.

### Step 2 status — DONE 2026-09-18 (advisory; changes no behaviour)

`src/skills/triage.ts` (pure enumerators: every (value, occurrence) pair and every
expectation line the rules ruled on, with `ruleSaid` obtained by CALLING
`substitute`/`replaceToken`/the mask chain), `src/skills/triage-jev.ts` (sites
`triage.occurrence`, `triage.expectation`, `triageSession`), `bench/jev-zoo.mjs` +
`bench/fixtures/jev-zoo.json` (48 + 40 labelled cases). Wired as
`SessionServer.shadowTriage`, started at the top of `exportFlow` and drained (≤6s) by
`stop` after the browser closes — the daemon exits after `stop`, so a fire-and-forget
pass would have logged nothing. Rows land in `system-one.jsonl` with `agrees`.
Compile, replay, corpus-check and artifacts never read them.

Zoo, live, four runs (real run-to-run variance — set gates from repeated runs):

| site | Jev | shape rules | Jev right / rule wrong | rule right / Jev wrong |
|---|---|---|---|---|
| occurrence | 89.6–93.8% | 85.4% | 4–5 | 1–2 |
| expectation | 92.3–94.9% | 71.8% | 11 | 2–3 |

Jev sides with the eventual fix on every NAMED case (fwgr8 `bench`, fwod5 `form`, the
round-26 clock time, `127.0.0.1`, `425.00`, round-29's minted heading, fwod60's
arithmetic row, fwod49's popup option, fwgr25's spinner). Every miss is under 0.3
confidence; ≥0.4 was 100% on every run. Gates set to 0.6 for both.
**Caveat:** the zoo's truth labels and the questions were written by the same hand and
the questions were tuned against it — it is a regression set, not a held-out one. The
corpus numbers below are the unbiased half.

Corpus noise (8 published recordings, 1,237 pairs / 2,144 lines, ~$0.06), disagreement
with the rules at confidence ≥0.6: **occurrence 1.1%** — passes "quiet on the corpus".
**expectation 18.8%**, grafana ~1.5% but odoo 18–28%, almost all *computed money
figures and counts the rules keep as hard expectations* (`row "Total £ 2,784.00"`,
`button "0 Meetings"`). That is the fwod60 class at scale and probably a real finding
about the rules, not noise. Next move for J is to hand-adjudicate that class and decide
between promoting J (drop-only) and a deterministic fix — extending
`unfreezeWatchedNames` to any figure the recording watched change — which would be free.

**Question shape dominates state size** — binding on G, H, L, D:
- **Jev cannot do counterfactuals.** "Would a later run show this line?" scored 19/40,
  barely above answering one way every time. Restated as composition — "ignoring any
  {{vN}} marker, is every remaining word part of the app's fixed vocabulary?" + literal
  vetoes (a moment? a toast? a minted reference?) — 36–37/40. Every "would X happen"
  in this plan (G's "did the action take effect", L's "is the page past this
  procedure") must be restated as "what is in front of you" before it is benchmarked.
- Identity questions fail; **derivation + structure combined in code** works: `derived`
  ("did this get here BECAUSE of the value?") and `piece` ("is it only part of a longer
  number/date/word?"), with a fragment needing `derived ≥ 0.8`. Step 0's framing: 32/48.
- An instruction that matters must be in the QUESTION, not only in state ("ignore the
  markers" in a state note did nothing; in the question it cut corpus noise 23→19%).
- A disjunction reduces by **max**, a conjunction by **min**.
- Shard by what shares state (one request per VALUE, 10 lines per procedure): 1,237
  pairs cost ~180 requests.

Open: `triageSession` builds its own decision rows because `jevDecider` is one ask per
decision; a batch-shaped `JevBatchSite` + `shadowAll` in decide.ts would absorb it. Do
it when a second batch site (K) arrives, not before.

### First live sweep — repairdesk `fwrdj2`, 2026-09-18 (local Windows box, not comparable to cloud rounds)

| run | Jev | verified | replayed | model turns | USD | wall |
|---|---|---|---|---|---|---|
| n1 record | on | 6/6 | — | 11 orch, 9 `do` | 0.077 | 351s |
| n2, n3 replay | on | 6/6, 6/6 | 9/9, 9/9 | 0 | 0 | 43s, 40s |
| n2, n3 replay (same recording) | **off** | 6/6, 6/6 | 9/9, 9/9 | 0 | 0 | 40s, 40s |

No effect on accuracy, replay time or model cost — as expected: nothing drifted, so
`repair.propose` never ran, and replays never construct a Jev client. The only Jev
activity was the advisory pass at `stop --save-flow`: 306 occurrence pairs + 202
expectation lines.

- **Occurrence (I): 58 disagreements, ZERO at ≥0.6.** Quiet on live data, as on the corpus.
- **Expectation (J): 64 disagreements, 43 at ≥0.6 (21% of lines) — and the replays say
  the RULES were right on all of them**: four replays passed 9/9 with those lines kept
  as hard expectations. Jev calls `cell "$250.00"`, `row "Total … $437.50"`,
  `cell "RD-1013"`, `cell "Blue Fox Cafe"` this-run. They are computed from inputs the
  flow fixes, or seed rows a reset restores — stable on every run of THIS flow. Jev
  cannot know that from the line; only replay evidence can. This cuts against step 2's
  reading of the odoo money figures as "probably a real finding": **J is not
  promotable on line text alone**, and if it ever gets a say it must sit below replay
  evidence (a line that has survived N replays is settled, whatever Jev thinks).
- Gaps found: the harness reads `config` BEFORE `stop`, so the advisory pass's Jev
  tokens never reach the result file (est. ~$0.01 from the corpus rate); and the
  pass's duration is only on the daemon's stderr, which goes nowhere. Both want a
  summary row in `system-one.jsonl` (requests, tokens, ms).

### Step 3 result — measured p, repairdesk `fwrdj3-n1`, 2026-09-18 (local box, deepseek-v4.1-flash)

6/6 verified, $0.079, 425s wall; 381s inside 9 instructions, 98 model calls:
**model 182s (48%), tools 195s (51%)**. So locally **p ~ 0.48, not 0.9+** — the
record-vs-replay proxy overstated it, because recording does far more browser work
than replay. Mean model turn 1.4-1.9s => r ~ 5x against a 0.3s Jev request.
With p=0.48, r=5: even q=1 gives **1.6x**; q=0.7 gives 1.4x. The 5-8x figure needs
the cloud baseline's p to be much higher — **measure p on a cloud run before
believing it** (the instrumentation now ships in every result as `inner.timing`).

Where the time actually went:
| first tool of turn | turns | model s | tool s | note |
|---|---|---|---|---|
| batch | 25 | 43 | 55 | three batches of exactly 13.1s = a step timing out inside |
| locate (read-back stragglers) | 9 | 33 | 0 | 3.7s each, full-history prompt — **site C is worth ~9% of recording** |
| (no tool call) | 12 | 31 | 0 | prose-only / unproductive turns: 8% of the run |
| snapshot | 17 | 24 | **120** | four snapshots of exactly 30.0s |
| click | 15 | 21 | 9 | |
| screenshot | 11 | 16 | 1 | verification looks — what G targets |

**The biggest single cost was a bug, not the model:** a scoped `snapshot` whose
selector matches nothing fails fast in `mode:'ai'` (31ms) and then the catch retried
with the plain aria snapshot, which waits Playwright's full 30s default. 120s of a
381s recording. Fixed in `src/daemon/refs.ts` (2s grace, then an explicit "nothing
matches"). Timeouts overall (4x30s + 3x13s + 1x10s) were ~169s = 44% of the run.
**Lesson for this plan: instrument before optimising — the cheapest 1.4x here was
free and had nothing to do with Jev.** Re-measure p after the fix: removing 120s of
tool time raises p to ~0.70, which is what makes the actor worth more (q=0.8, r=5 =>
~1.8x on top).

### Steps 4-5 results — 2026-09-18 (repairdesk, local box)

**Snapshot fix confirmed** (`fwrdj4-n1` vs `fwrdj3-n1`): instruction time 381s -> 269s
(1.4x), tool time 195s -> 81s, model time unchanged (184s), 6/6 both. p is now **68%**.
Still unexplained: four batches of 10-13s each (a step timing out inside a batch).

**Shadow actor, 87 live turns (~$0.012 of Jev):** coverage 95% of decidable turns —
candidate generation is NOT the problem. Agreement is: 44% at confidence >=0.5, 60% at
>=0.85 (n=5), 67% at >=0.95 (n=3). Clicks 64%, fills 50%, report 30%, snapshot 27%,
read_all 10%. Report/snapshot/screenshot/read turns are ~60% of model time and are
exactly where Jev cannot tell that it is time to look, read or finish — the
counterfactual weakness from step 2, not a wording problem. Measured p=0.68, r=5.0,
**q=11% at gate 0.5 => 1.06x**; 1.01-1.02x at stricter gates.
=> **Step 7 (the actor acts) is NOT justified on this evidence.** Caveats: agreement
with the model is not correctness; one run; one formulation; the cloud baseline's p is
still unmeasured (results now carry `inner.timing`). The ASTRA doc's 5-10x needed
q~0.95; measured q is ~0.1. What is worth doing for recording speed is not Jev:
the batch timeouts, the 9 read-back `locate` calls (33s/recording — site C, code-first),
and the 12 no-tool-call turns (31s).

**Inline healing A/B** (`bench/jev-heal-demo.mjs`, drift `add-part-moved`, flow fwrdj2;
two dead chains: 03-open and 04-add; all arms 9/9 replayed, 6/6 verified):
| arm | healed | model turns | wall |
|---|---|---|---|
| Jev off | — | 16 | 101s |
| Jev on, gate 0.9 | 0 of 2 | 23 | 132s |
| Jev on, gate 0.6 | 1 of 2 | 10 | 88s |
Jev picked the right control (`button testid=part-attach "Attach part"`) in both
option orders on all four asks, at 0.83 / 0.65 / 0.86 / 0.59 — a real drift scores
lower than the synthetic probe's 0.99s, so 0.9 healed nothing and only added latency.
At 0.6, 03-open healed in 0.66s, its own expectations verified it, and it cost **0 model
turns instead of 10-11**; 04-add missed the gate by 0.01 and recovered by model as
before. Gate set to 0.6 (n=4, all correct — thin; the four code guards are what make it
safe). `SITELOOPER_JEV_GATES` overrides a gate for calibration runs.
Two traps recorded in the demo: a store is keyed by ORIGIN, so a recording made on
:4180 replays only on :4180 (on :4191 every step went to model recovery in both arms
and the A/B measured nothing, ~$0.15 wasted); and Node's fetch refuses port 4190.

**Where this leaves the plan:** Jev earns its place where code can check its answer
(A repair, B healing, I occurrence triage). It does not as a first-contact actor.
Next: recalibrate B on odoo/grafana drift (where fallbacks actually happen); site C in
code; chase the batch timeouts; measure p on a cloud run.

### Recording speed, the non-Jev fixes — 2026-09-18 (repairdesk, local, all 6/6 verified)

| run | what changed | time inside instructions | model | tools |
|---|---|---|---|---|
| fwrdj3 | baseline with timing | 381s (9 instr.) | 182s | 195s |
| fwrdj4 | scoped-snapshot fail-fast | 269s (9) | 184s | 81s |
| fwrdj5 | + per-step batch timing (diagnostic) | 199s (9) | 104s | 94s |
| fwrdj6 | + missing-target fail-fast + site C | 150s (6) | 101s | 43s |

Not a controlled series — the orchestrator chose 6 instructions in fwrdj6 and 9 before,
and model time swings run to run — but the tool-time column is the fixes: 195s -> 43s,
and nothing over 6s remains. The three ~13s batches were ONE failed step each: a `fill`
or `read` opening the batch on a stale @ref / guessed selector, waiting out the action's
10s actionability timeout (now 3s for a selector, 1s for an @ref, `not-dispatched`).
Site C: the `locate` model turn went from 9 calls / 33s to 4 calls / 8.8s (2 values
pinned by code, 1 by Jev, the rest proven unpinnable and not asked).
What is left is model time (~2/3 of the run) and **8 no-tool-call turns = 20s** —
the next thing worth looking at, and not a Jev problem either.

### Healing calibration — store-side drift, repairdesk (`bench/jev-drift-store.mjs`, tag `rdcal`), 2026-09-18

We cannot rename controls inside Odoo/Grafana, so the harness drifts a COPY of the
STORE: one healable step's chain is rewritten into a plausible old description
(synonym / affix / punctuation / stale-id families, one rename event per step) so every
rung misses the unchanged app; the original chain is the ground truth. One case per
replay, gate 0 so every confidence is observed, `--no-model` (no provider key) so a
deferred heal costs $0. ~230 cases are available across the Odoo/Grafana/Kanboard
published stores once Docker is up (commands in the script header).

39 dead chains, 31 asked, **27 correct, 2 wrong, 2 undecidable**, 8 never asked.
- **Confidence does not separate right from wrong**: the two wrong picks sat at 0.81 and
  0.94, inside the correct picks' range (median 0.96). No gate is clean: 0.6 -> 0.9
  costs 13% of heals and still accepts one wrong click. **The gate is not what makes
  site B safe — the code guards and the step's own expectations are** (both wrong
  picks were refused by the step's recorded expectations, run halted, no damage).
  `replay.heal` stays 0.6.
- Both wrong picks were one shape: the step pressed the confirm DIALOG's "Delete part";
  Jev chose the part row's own "Delete" on the page BEHIND the dialog. **Fixed in code,
  not by the gate**: while a modal dialog is open (`dialog:modal` / `aria-modal`) only
  its controls are on the ballot (`SnapshotRow.modal`, `candidateRows`). Re-run of those
  two cases: 2/2 correct (0.77, 0.94). => 29/29 decided cases correct with the guard.
- Reads never get a ballot (8 of 11): `interactiveRows` lists controls, and a read's
  element is a td/p. Site B is click/fill-only today; a dead read is skipped, not healed.
- Store-drift is EASIER than app-drift (the synthetic twin of `add-part-moved` scored
  0.99; the real one 0.59-0.86): treat gates read off this harness as optimistic.
- `replay.heal` rows now carry skill/step/key + the dead chain, so every production
  heal is a labelled case on its own.
- Caveat: a local agent-browser run collided with this calibration on port 4180 (my
  scheduling error, $1.83 wasted, that run invalid). The calibration's per-case resets
  make contamination of ITS cases unlikely but not excluded.

### Healing calibration on cloud boxes — Odoo / Grafana / Kanboard, 2026-09-18

Run as three routines (one box per app, `jev` @ daa8151, no model spend; results on
`results/jvod1-yfyf4l`, `results/jvgr1-590poq`, `results/jvkb1-bhgek4`). A local attempt
to run all three in one script was killed by memory pressure half way — one app per
box is the way to run this.

| app (store) | cases | put to Jev | correct | **wrong** | abstained / undecidable | never reached |
|---|---|---|---|---|---|---|
| repairdesk (fwrdj2, local) | 39 | 31 | 29 (with the modal guard) | 0 (2 before the guard) | 2 | 8 reads, no ballot |
| odoo (fwod34) | 61 | 19 | 8 (0.72-0.97) | **0** | 11 | 28 (06-open onward) + 14 chain-not-dead |
| grafana (fwgr25) | 69 | 4 | 4 | **0** | 0 | 65 (flow halts at sign-in) |
| kanboard (fwkb3) | 58 | 46 | 13 (0.55-1.00) | **0** | 33 | 12 unattributable (old harness) |

- **No wrong pick on any third-party app**, and therefore no wrong pick that passed its
  step's checks — the hole this run was looking for did not appear. With RepairDesk:
  54 decided picks, 54 correct once the modal guard is in.
- **Jev abstains when the dead chain describes nothing.** 26 of Kanboard's 33
  undecidables and most of Odoo's 11 are a chain that is only a bare CSS path
  (`header > div:nth-of-type(3) > … > a`, `page.locator('a')`): nothing to go on, and
  Jev answered `none` or scored 0.00-0.42. That is the right behaviour — and it bounds
  what site B can ever heal: **a step recorded with a name/label/testid is healable; a
  step recorded only by structure is not.** Worth surfacing at record time.
- Reads DO get a ballot where the read's element is interactive (Kanboard links: 27 of
  34 reads were asked); RepairDesk's were td/p and were not.
- **The calibration is only as wide as what a model-free replay reaches.** fwgr25 needs
  a recovery at sign-in on today's code and fwod34 at 06-open, so 65 + 28 cases never
  touched their drifted chain — and the harness first reported them as "no-ballot".
  Fixed: one undrifted baseline replay names the reachable steps, the rest are scored
  `not-reachable` unrun (93ff919). Published stores were recorded on other commits and
  boxes; **a calibration should record its own flow on the box first** (~$0.10-0.50),
  then drift that store. Not yet run.
- Scorer bugs found by the runs and fixed: a test id that is a sentence (Grafana) read as
  its first word, scoring a correct 0.98 pick WRONG-and-verified; heals unattributable
  when a replay has dead chains of its own (Kanboard) — rows now carry skill/step/key.
- Gate: nothing here argues for moving `replay.heal` off 0.6. Correct picks span
  0.55-1.00; the wrong ones we have ever seen (0.81, 0.94) were a structural shape code
  now excludes. The guards carry the safety, the gate only trims abstentions.

## 4. Sites, in order of value ÷ risk

### A. Locator repair proposer — `src/skills/repair.ts:576` (`llmProposer`)
Today: strong model, free-text JSON reply parsed with fence-stripping, picks one
element from a flat list. It is *already* a choice problem wearing a generation costume.

- `interactiveSnapshot` gains a structured twin (rows as `{role,name,label,placeholder,testid,id,text}`),
  pre-filtered in code to `recordedKind`.
- `jevProposer`: state = `{template, step, deadLocators, elements[]}`; one request with
  `choice("which element serves the purpose the dead locators described", {e0…eN, none})`
  **plus** fanned-out `noul("the control is gone from this page entirely")`.
- The locator object is then **built by code** from the chosen row (role+name → label →
  placeholder → testid → id, the existing candidate ranking) — no selector is ever
  generated by a model.
- Existing after-the-fact kind rejection and patch verification stay. `none` / low
  confidence / choice-vs-noul disagreement ⇒ `llmProposer` as today.
- Compose as `cascadeProposer(jev, llm)`; `DrainOptions.propose` doesn't change.

Lowest risk (post-run, already verified), removes a strong-model call, and its
decision log calibrates B.

### B. Inline replay healing — `src/execution/resolve.ts:298`, recovery in `server.ts:1410`
**The main speed win.** Today a locator chain that misses entirely fails the replay and
routes the step to an agent recovery: tens of turns at 10k–100k prompt tokens each,
minutes of wall-clock. Most such misses are a renamed/moved control — exactly A.

- On an all-miss in daemon replay, when `systemOne()` exists: run A's chooser against
  the live page inline, and if confidence clears the *action-grade* threshold and the
  kind matches, continue the replay with that locator.
- The step's recorded expectations (`expectedChangesVerdict`, url-effect, identity
  gates) verify it exactly as they verify any replayed step. Verifier fails ⇒ the step
  falls to model recovery as it does today, with the Jev attempt in the recovery prompt
  as a known-wrong candidate.
- A healed step files its drift ticket **with the proposal attached**; the chain is
  only patched after the run succeeds past the step — the same rule
  `recordCandidateEvidence` already enforces.
- Threshold is higher for steps whose effect is not read-only; start with read/
  navigate/fill steps only and widen on evidence.
- Not in compiled artifacts.

### C. `sourceStragglers` — `src/agent/loop.ts:973`
Today: one extra call carrying the **entire session history** to get back a tiny
`{value, selector}` list. Replace with: code finds every element whose text contains the
value; 0 ⇒ unpinnable, 1 ⇒ done with no model, >1 ⇒ one Jev `choice` per straggler
(all in one request) with state = the instruction + the candidates' surrounding lines.
Falls back to the existing `locate` call. Saves a full-history prompt per affected instruction.

### D. Paraphrase matching — `src/skills/learn.ts:214` (`matchTemplate`), `server.ts:1943`
Today the zero-model path needs the instruction to match a template exactly (modulo
case/whitespace/quotes). A reworded instruction pays for a full agent run even though a
verified skill exists. With Jev, only when exact binding fails:

1. Candidates = verified chain-head skills whose `urlPattern` matches (code).
2. `choice("which stored procedure is this instruction asking for", {…templates, none})`.
3. Slot binding via the *pre-parsed value extraction* pattern: code cuts candidate spans
   from the instruction (quoted strings, numbers, known values); one `choice` per slot
   over those spans, fanned out in the same request as (2) for the top candidates.
4. Guard `noul`: "the instruction asks for exactly <filled template> and nothing more" —
   the literal-reading weakness is precisely an instruction with an extra clause.
5. Confidence = **min** over all answers (cookbook's rule: one wrong argument spoils the call).

High threshold; below it the match is still useful as the `[skills]` hint the inner
agent already receives. This is the largest possible saving (whole agent run → one
~free call) and the highest semantic risk, so it ships after A–C have produced
calibration data. `isVerified` remains a precondition — Jev widens *wording*, not *trust*.

### E. Relabel — `src/skills/relabel.ts:169`
Names are generation, so Jev can't invent them; but most good names are already on the
page. Code proposes candidates per value (associated label, column header, field
`name`, the instruction's own noun — cf. `bench/label-probe.mjs`, `naming-probe.mjs`),
normalised to snake_case; Jev `choice`s among them + `keep`. All values × all
instructions in one request. Values with no candidate or low confidence go to the
strong model in a *smaller* `rename_values` call — which also relieves the one
unbounded-output risk in the codebase and the 100s box inside `stop`.

## 4b. Sites that only exist because fan-out is free

A–E swap a model call for a cheaper one. These add judgement where the tool today has
**none** — places that are pure shape heuristics because a model call per item was
unthinkable. They run *beside* the existing agent and deterministic engine, never
instead of them.

### G. Sidecar observer for the inner agent — `src/agent/loop.ts` tool-result path
The inner loop's cost is turns × a huge prompt. Many turns are the agent *looking*:
re-snapshotting to see whether a click worked, whether a modal opened, whether it is
done. After every mutating tool call — while the result is being assembled, off the
critical path — fan ~10 questions over the `addedLines` diff (`snapshot.ts:649`) and the
alerts:

`error shown?` · `validation message on a field?` · `dialog opened / closed?` ·
`still loading / skeleton?` · `did the action visibly take effect?` ·
`is the instruction's goal now visibly achieved?` · `is a confirmation being asked for?`

Reduce to one line appended to the tool result — `[observer] saved: yes (0.97) · goal
reached: likely (0.91) · no errors` — only for answers above threshold; silence
otherwise. The agent stays in charge; it just stops paying 50k-token turns for facts a
~free call already established. Target metric: **turns per instruction**. The same
answers feed the watchdog (a confident "still loading" extends a wait instead of
burning a nudge) and the round-27 class of bug (judged before the SPA redirected).

### H. Focused snapshot — map over elements, top-k reduce (`src/agent/tools.ts` snapshot path)
Replaces the "pruning" experiment with a safer shape. Shard the page's interactive
elements (each with its neighbouring lines as state), `score` each against the
instruction, reduce top-k. **Nothing is removed**: the snapshot is *re-ordered* with a
`[likely relevant]` block first, and truncation at `TOOL_RESULT_BUDGET` (4000/12200
chars) then cuts the tail that Jev ranked lowest rather than whatever happened to be
last in DOM order. Today's truncation is blind; this makes it informed. On huge pages
use beam descent over regions first. Wrong ranking degrades to today's behaviour, not
below it.

### I. Record-time value & occurrence triage — feeds `src/skills/flow.ts` threading, `shape.ts`
Rounds 23–28 are mostly one bug wearing different clothes: *is this occurrence of this
string the same thing as that value, or a coincidence?* — an order id inside a clock
time, `bench` inside `fwgr8-n1-bench-dashboard`, `form` inside `o_form_view_group`,
React's `_r8b_` id. Each was fixed with another shape rule (`tokenPattern`,
`looksLikeId`, `digitDominant`, the numeric slot guard). That is a map problem: for every
(value, occurrence) pair — hundreds per session — one tiny shard:

`noul("In this URL/line, is '<span>' the <value's label> reported earlier, rather than an unrelated substring?")`

plus per-value fan-out: `minted by the app this run?` · `typed by the user?` ·
`a timestamp/clock?` · `a stable name?`.

Crucially this runs **at record time in the daemon and is stored as evidence on the
skill**, so `compile.ts`, `corpus-check` and artifacts stay deterministic and
model-free: they read a stored verdict, they never call Jev. Ship it **advisory
first**: log every case where Jev and the shape rule disagree. The repo already has
the perfect eval — a regression zoo of the named cases above; if Jev sides with the
eventual fix on those and stays quiet on the corpus, promote it to a veto on
threading (it can only *refuse* a substitution, which costs a model turn, never
invent one). Consistent with evidence-over-shape: replay evidence still outranks it.

### J. Expectation triage at record time — `src/execution/expect.ts`
Same pattern for recorded expectation lines: `TRANSIENT_LINE`, `popupItem`,
`maskMinted`, `maskForeignValue` are shape guesses at "will this line be here on every
run?". Map one noul per recorded line (`specific to this run — toast, timestamp, minted
id, another record's value — or a consequence of the procedure?`), store the verdict,
advisory first. Payoff: fewer replays refused over a line that was never load-bearing,
fewer skills that pass while asserting nothing.

### K. Whole-flow map at `stop --save-flow` — `server.ts:779`
`stop` already pays a 100s relabel box. Replace it with one fan-out over every step in
parallel: E's naming, I's and J's verdicts, `read-only or mutating?` per step (which
sets B's per-step confidence threshold), and a plausibility noul on every
`{{step.output}}` reference the export lint (`flow.ts:969`) flags. A 40-step session
is 40 shards and the wall-clock of one.

### L. Live-page ranking of candidate skills — `src/skills/learn.ts` candidate ordering
Candidates are ordered by track record only. Add a parallel `score` per candidate —
"does the live page look like where this procedure starts / is past?" — as a
tie-breaker *within* a tier, never across the validated-first rule. Directly aimed at
the round-27/28 shape (a sibling should take the pin because the page is past the
pinned one). Also gives `goalSatisfied` (`server.ts:1245`) a soft second opinion when
`requireText` is absent and today's answer is simply "unknown".

### M. Drift-ticket triage in parallel — `src/skills/repair.ts` drain
Map every ticket at once: `renamed / moved / gone / page redesigned` → routes
promote-fallback vs patch-segment (A) vs re-record without serial strong-model calls.

## 4c. The System One actor — where the multi-x authoring speedup is

Adopted 2026-09-18 from `ASTRA_JEV_RECOMMENDATIONS.md`, which is right that sites A-M
cannot move the headline number: they replace model calls that are rare (repair,
relabel) or add judgement beside the agent. Recording time is ~all inner-model turns —
fwrd42 recorded in 1,212s and replays in 24s; locally fwrdj2 351s vs 40s — so only
replacing ROUTINE TURNS gives more than tens of percent. This was site F's first
bullet, parked as "a second actor to keep correct"; it is now the main line, reached
by measurement rather than by building it and hoping.

Shape (the doc's, constrained by what steps 0-2 measured):
- Per turn, code builds EXECUTABLE candidates from one observation revision: live
  controls x compatible task values, generic recipes (open combobox, dismiss dialog),
  controller ops (observe region, read value, done, escalate). A candidate is
  `{id, observationId, operation, targetRef, valueRef, description}`; Jev picks an id,
  code resolves refs. Nothing is generated: values come from a **task contract**
  (objective, named inputs incl. opaque secret refs, required outputs) — from the outer
  agent where it can supply one, else from ONE conventional-model interpretation call.
- Fresh bounded state per decision (observation + diff, contract, done/unresolved,
  recent actions and failures) — never the growing transcript.
- It is a `Decider<TurnState, Action>` in a cascade with the existing model turn behind
  it (decide.ts). "none suitable" / "need more information" / "escalate" are options.
- Reports assembled by code from output names + captured evidence.
- >255 options or >~40 rows: the repair tournament (DOM-adjacent shards, fresh final
  choice; never compare probabilities across groups).

Constraints the doc does not have, from our measurements:
- **First contact has no verifier.** Repair/healing check Jev against recorded
  expectations; a first recording has none, and per-decision accuracy compounds
  (0.95^12 = 54%). An acting site needs its own definition of "verified" (the action's
  observable effect matches what the candidate said it would do) before it may act.
- **Progress/completion questions must be "what is on the page"**, not counterfactual
  (19/40 vs 36/40 in step 2). Some — "has the instruction's intent been met?" — may
  not restate; those stay with the model.
- One request ~0.3s; any sharded fan-out ~1.2s. The doc's 0.5-2s/decision holds only
  if most decisions fit one request.
- Expected speedup from the doc's own formula with our numbers: p ~95% cloud / ~75-85%
  local (proxy: record vs replay), r ~10-30x cloud / ~5-10x local => **~5-8x vs the
  published cloud baseline, ~3x vs today's local deepseek-flash run**. q (share of
  model time Jev can take) is unknown and is the whole bet — so measure it first:

**The shadow actor** (step 5 below): on every turn of real recordings, build the
candidates, ask Jev, and log (a) was the model's actual action AMONG the candidates —
coverage — and (b) did Jev pick it — agreement — by turn type and confidence. Zero
risk, cents. Coverage x agreement, weighted by model ms per turn type, IS q. It decides
between ~1.7x (q~50%) and ~7x (q~95%) before any execution path is built.

### F. Still experimental, bench-decided
- **Hard snapshot pruning** (actually dropping what H ranks low) to cut prompt tokens.
  A wrongly pruned control is an invisible failure; only after H's ranking has a
  measured recall on the corpus.

Explicitly **not** planned: routing `recoveryRoute` easy/hard (measured flat already,
`flow.ts:949`), judging reports, anything involving counting, dates or arithmetic.

## 5. Measurement before wiring

1. **Offline agreement probe** (`bench/jev-probe.mjs`): replay stored drift tickets,
   straggler cases and relabel sessions from published stores through the Jev
   formulations; compare to what the LLM answered / what was eventually verified;
   output agreement + a confidence reliability curve per site. Thresholds come from
   here, not from the docs' generic 0.5/0.9.
2. **Matrix arm**: Jev on/off across rd/od/gr/kb. Metrics: replay fallbacks, recovery
   turns, wall-clock per step, inner $ (`bench/pricing.mjs`), and — the one that
   matters — **no new red cells**. `corpus-check` is unaffected (never calls a model).
3. Self-consistency (ask twice with reworded instructions, require agreement) is the
   cheap lever if a site's curve is poor; at this price it costs nothing.

## 6. Order of work

| Step | Deliverable | Gate to proceed |
|---|---|---|
| 0 | client + `mapReduce`, config, accounting, decision log, live probe | field names, latency **and fan-out latency at 50–200 shards** confirmed |
| 1 | A `jevProposer` (tournament reduce) + cascade; M ticket triage | offline agreement ≥ LLM proposer on stored tickets |
| 2 | I + J **advisory only** (log disagreements, change nothing) | regression zoo: sides with the eventual fix on the named round 23–28 cases; quiet on corpus |
| 3 | **Per-turn timing**: model ms vs tool ms per turn, per instruction, in results | p is a number, not a proxy |
| 4 | **B inline healing** (read-only/fill first); store `interactiveRows` on drift tickets | drift-injection A/B on repairdesk; matrix: fewer fallbacks, zero new reds |
| 5 | **Shadow actor** (4c): candidates + Jev pick logged beside every real model turn | coverage and agreement by turn type => measured q |
| 6 | **Task contract** on `do` (named inputs / required outputs); code-assembled reports | no report regressions; typed-vs-read provenance improves |
| 7 | Actor ACTS on the turn types step 5 shows safe (fills, navigation first), model behind it | equal verified outcomes + clean replay; authoring wall-clock |
| 8 | G observer; C stragglers | fewer turns/instruction, zero new reds |
| 9 | K whole-flow map (absorbs E); I to veto if its log stays quiet; J only below replay evidence | naming-probe parity; step 2's log |
| 10 | D paraphrase match; L candidate ranking | calibration from earlier steps |
| — | H focused snapshot: parked (fan-out ~1.2s is too slow per turn) | |

Steps 0-2 are done. 3 is small and first because every later claim about speed needs
it. 4 and 5 are independent. 7 is gated on 5's numbers, not on the calendar.

## 7. Risks / open questions

- **Third-party data flow**: page content goes to TypeSafe when enabled. Opt-in by key
  only; document in README §Providers; never send filled secrets (reuse existing masking).
- **Injection**: Jev isn't resistant and its state is page text. Bounded by design — it
  can only pick an option code already deemed legal, and verifiers run after.
- **Latency is unmeasured** — "very high speed" is the premise of B and D; probe first.
- **English-optimised**: non-English apps may calibrate worse; thresholds are per-site
  in the decision log, consider per-origin.
- `jev-latest` is a moving alias; record the served model version in the decision log so
  a calibration shift is attributable.

## The actor acts — first A/B (3a1989a, RepairDesk, one run per arm)

Re-scoring the shadow log (fwrdj4-n1) showed agreement was the wrong yardstick: of 49
disagreements, 22 were Jev picking the action the model took 1-3 turns later (after a
snapshot or screenshot). Agreed-or-early was 62% of answered turns, ~71% at >=0.5.
So the tier was built behind `SITELOOPER_JEV_ACTOR=act` (src/agent/actor-act.ts): element
actions only, gate 0.75, one-visible-element check, model fallback, actions written into
the conversation. Scored by the bench verifiers, not by agreement.

| arm | verified | instructions | instruction time | model calls | model s | tool s | Jev s | cost |
|---|---|---|---|---|---|---|---|---|
| fwrdj7 model only | 6/6 | 6 | 198.6s | 79 | 130.0 | 63.2 | 0 | $0.044 |
| fwrdj8 Jev first | 6/6 | 5 | 183.9s | 56 | 104.1 | 58.9 | 18.1 | $0.052 |

Jev was asked 78 times and acted 7 (all 7 tool calls succeeded, 0.75-0.90); 52 deferrals
were below the gate and 12 were the two option orders disagreeing. No wrong action, task
still verified 6/6. But the 78 serial asks cost 18s, which ate most of the 26s of model
time saved. One run per arm and the orchestrator split the task differently, so the
7% is inside the noise. **Next: ask Jev concurrently with the model and cancel the model
when Jev clears the gate — a deferral then costs nothing.** `bench/jev-act-report.mjs`.

### Second A/B — the actor asked beside the model (5a10cfe)

| arm | verified | instructions | instruction time | model calls | model s | tool s | Jev acts | cost | wall |
|---|---|---|---|---|---|---|---|---|---|
| fwrdj9 model only | 6/6 | 5 | 188.2s | 74 | 128.5 | 54.4 | - | $0.041 | 216s |
| fwrdj10 Jev beside | 6/6 | 4 | 120.8s | 51 | 81.4 | 34.8 | 3 of 51 asks, all ok | $0.038 | 156s |

The deferral cost is gone (the 15.8s of Jev time now overlaps model time). But 3 actions
cannot explain 67s: the orchestrator again split the task differently (4 vs 5 instructions)
and that, not Jev, is most of the gap. Across both A/Bs: 10 actions, 10 succeeded, 12/12
objectives verified, no harm — and Jev acts on only 4-9% of turns. Of fwrdj8's 52
below-gate asks, 30 were observe/read/wait (correct deferrals); element actions are about
a third of all asks. Ceiling on this task is therefore <10% of model calls.
=> Safe, cheap, small. The larger lever is the model's look turns (44 of 87 in fwrdj4),
which is a code change (return the page diff with every action), not a Jev one.

### CORRECTION to both actor A/Bs — the acting arms were broken (found 2026-09-18)

The actor wrote its action into the conversation as a synthetic assistant tool call.
DeepSeek in thinking mode rejects the next request with HTTP 400 ("reasoning_content in
the thinking mode must be passed back"). fwrdj8 lost 4 instructions to it (and two
conversation resets), fwrdj10 lost 1. The orchestrator retried each, finding Jev's actions
already applied, and a crashed instruction files no timing row — so the acting arms'
instruction time and model-call counts are UNDERSTATED and the 121s vs 188s figure is
void. What stands: 10 Jev actions, all 10 tool calls succeeded, objectives verified.
Fixed: the action is now told to the model as a `[actor]` user message. Needs a re-run.
The same fault voided fwrdj12 (opening snapshot as a synthetic call; $0.22, 13
instructions of orchestrator flailing, and it edited the global config, since restored).

## Cutting the look turns (no Jev involved) — trace.jsonl, four fixes, fixed-instruction pairs

The guess ("return the page diff with every action") was already implemented. What the
model was holding when it looked (new `trace.jsonl`, one row per inner call) showed four
causes instead, all of them the tool refusing what it had itself told the model:

1. **The diff named a field the resolver refused.** `+ textbox "Part name *"` is the label's
   text; the accessible name is "Part name" (the `*` is aria-hidden). Rule 4b says target
   the diff's name, so every such fill failed (3s) and cost a snapshot turn — 3 of 6
   instructions in fwrdj11. Fix: a field is also found by role + exact label text
   (`resolveTarget`), including as the last link of a `>>` chain. (4dca04c, df38a5e)
2. **Every instruction after the first opened with a bare snapshot** (carried-over
   snapshots are stubbed). Fix: the page rides in the instruction's own message, stubbed
   when superseded; `SITELOOPER_OPENING_SNAPSHOT=off` disables. (c330a6f)
3. **`[role=dialog] >> …` matched nothing on a native `<dialog>`.** Five failed batches in
   one recording. Fix: a bare `[role=x]` segment is read as `role=x`. (cefaf2d)
4. **A screenshot inside a batch refused the whole batch** — 15 times in five recordings;
   rule 9a asks for exactly that batch. Fix: screenshot is batchable. (cc16383)

Never write an assistant turn the model did not write: DeepSeek (thinking) 400s on it.
That voided fwrdj12 and BOTH actor A/Bs (see the correction above).

`bench/fixed-instructions.mjs` replays fwrdj11's six instructions verbatim, no
orchestrator, empty store. All runs 6/6 verified. off/on = opening snapshot.

| pair (fixes in both arms) | arm | instr. time | model calls | snapshot turns | failed calls |
|---|---|---|---|---|---|
| 1: label | off | 203s | 82 | 8 | 9 |
| 1: label | on | 264s | 104 | 12 | 14 |
| 2: + role scope | off | 181s | 79 | 9 | 7 |
| 2: + role scope | on | 143s | 70 | 3 | 8 |
| 3: + batch screenshot | off | 197s | 67 | 6 | 2 |
| 3: + batch screenshot | on | 198s | 67 | 1 | 1 |

Failed calls fell from 9-14 to 1-2 per recording and model calls from ~80-100 to 67.
Wall time did not follow in pair 3 (one 93s instruction in the off arm; model seconds per
call rose from ~1.7 to ~2.2 — provider latency), so time is too noisy at n=1 to claim; calls
and failures are the evidence. Opening snapshot: snapshot turns 12 -> 3 -> 1 in the on arm,
calls equal or lower in 2 of 3 pairs; kept on. Left: ~17 of 67 calls are report, its
naming retry and read-back `locate` calls (2-3 per instruction).

## The actor acts — VALID A/B on fixed instructions (a3f05f9 + look-turn fixes)

Same six instructions both arms (`bench/fixed-instructions.mjs`), empty store, no
orchestrator, actor told as a user message. No provider errors; every instruction OK;
all four runs 6/6 verified.

| pair | arm | instr. time | model calls | model s | Jev acts (all succeeded) |
|---|---|---|---|---|---|
| 1 | model only | 197s | 71 | 125 | - |
| 1 | Jev beside | 154s | 52 | 117 | 16 of 63 asks |
| 2 | model only | 218s | 64 | 174 | - |
| 2 | Jev beside | 156s | 49 | 106 | 12 of 55 asks |

=> -22% and -29% instruction time, -27% and -23% model calls. 28 actions, 28 succeeded,
0 wrong, task verified. Jev takes the mechanical run: login fill, open form, three fills,
save, confirm. The form instructions run in 10-18s against 16-31s. The earlier "q=11%,
1.06x" was wrong twice over: agreement was the wrong yardstick, and the first acting runs
crashed after Jev's first action so it never got to take a whole form.
Still n=2 on one app with data-testid controls. Next: Odoo/Kanboard (no test ids — the
selector falls to role+name), and a wrong-action audit over more runs before default-on.

## §5 Plan — more of the inner model's work to Jev (2026-09-19)

**Where the model's time goes now** (fixed six RepairDesk instructions, two runs per arm,
turns classed by the tools they issued; calls / model seconds):

| turn kind | model only (fxmod1, fxmod2) | with the actor (fxjev1, fxjev2) |
|---|---|---|
| act — click/fill/batch/dialog_expect/goto | 41/64s, 39/68s | 24/36s, 30/65s |
| report — no-tool turns: the report, its naming retry, prose | 10/23s, 15/84s | 7/19s, 7/18s |
| look — snapshot/read/read_all | 12/17s, 3/5s | 15/49s, 6/11s |
| locate — read-back of reported values | 5/14s, 6/17s | 4/10s, 5/10s |
| screenshot / wait | 3/7s, 1/2s | 2/3s, 1/2s |

So after the actor, what is left is roughly: act 27 calls, report 7-15, look 6-15, locate 5.
Each block below names the block it attacks. Rules carried over from what went wrong:
score by the app-side verifiers on `bench/fixed-instructions.mjs` pairs (never by agreement
with the model); one env switch per site until it has >=3 clean pairs on two apps; never
put a turn the model did not write into the conversation as an assistant message; the model
stays the fallback for every deferral and every failure; Jev returns ids, code holds
elements and strings.

### 5.1 Widen the actor (attacks: act, ~27 calls left)
- **A form is one decision, not N.** Today Jev is asked once per field (63 asks for 16
  acts). Extra questions on one state are free (step 0: 1 -> 40 questions, same 280ms), so
  ask `field_i -> which value` for every empty field plus `which control submits` in ONE
  request and run the result as one batch. Falls back per field below the gate.
- **Per-operation gates.** A fill is checked in code (read the value back), a click is not.
  `actor.act.fill` 0.6, `actor.act.click` 0.75. fwrdj8's below-gate element picks were
  17 clicks and 5 fills/checks, six of them at 0.60-0.74.
- **goto to an address the instruction states** (deferred twice at 0.97), and
  **dialog_expect armed by code** before a click whose name the instruction's verb matches
  (delete/remove/archive) — the model spends a whole turn on each today.
- **No-test-id apps.** `selectorsFor` falls to role+name; when that is not unique, scope by
  the candidate's own context (its dialog / row text, already in `ControlContext`) instead
  of deferring. Sized by the Kanboard run (jakb1) — do this first if deferrals there are
  mostly "does not resolve to exactly one".
- **Secrets.** A `{{env:NAME}}` marker in the instruction is a task value like any other;
  code passes the marker through, so Jev never sees the secret. (Login password fills are
  the model's today.)

### 5.2 The report without the model (attacks: report, 7-15 calls, up to a third of model time)
Jev writes no text, so the report is COMPILED: code already holds the action log, every
labelled read, the diffs and the screenshots.
- `report.status` — nouls, one per clause of the instruction (code splits on "then/and/."):
  "the page shows this was done", max over evidence lines, min over clauses; veto noul
  "an error or rejection is on screen". Below gate -> the model writes the report as now.
- `report.values` — for each thing the instruction asks to be reported (code extracts
  "report X, Y and Z"), a choice over the labelled reads and diff lines: which one is X.
  This is site C's ballot turned around, and it also removes the **naming hold** retry
  (the second no-tool turn): the label is chosen from code-generated candidates (field
  label, column header, the instruction's own noun) rather than asked of the model.
- Summary text is a template over the above ("Did: …; Observed: name=value …"). The
  orchestrator only needs facts and status; verify that claim by orchestrator turn count
  and verifier pass rate in a full sweep before default-on.
- **Shadow first** (cheap, zero risk): log Jev's status and value picks beside the model's
  accepted report for every instruction; promote when status agrees with the VERIFIER
  (not the model) on >=95% and no value pick is wrong.

### 5.3 Evidence reads in code (attacks: look 6-15, locate 5)
- After a mutating batch, code reads the rows/regions that contain the instruction's own
  literals (the run-tagged names it just typed) and appends them to the action result, so
  the model's verification read_all/wait_for turn has nothing left to fetch. Where several
  regions carry the literal, Jev picks (`evidence.region`), as site C does for values.
- Site C today leaves ~5 locate calls per recording to the model: log why each one fell
  through (prose value, computed value, several displayers below gate) and widen the code
  tier or the gate accordingly. No new site; a calibration pass.

### 5.4 Failed targets healed before the model sees them (attacks: 1-9 failed calls per recording)
A model-written target that matches nothing is the same problem as a drifted locator, and
`repair.propose` already solves it at 54/54: build the ballot, ask Jev which control the
dead target meant, act if it resolves to one element of the right kind, and tell the model
what was substituted. Each save is a 3s wait plus a recovery turn.

### 5.5 Later, and only if 5.1-5.3 hold up: the model plans, Jev executes
One model call turns the instruction into an ordered list of intents ("open Add part",
"name = …", "save", "confirm the row shows price"). Jev grounds each intent on the live
page, code verifies each against its expectation, and the model is re-asked only on a
deviation. This is the ASTRA shape, and it is where the large multiple lives — but it
replaces the loop rather than riding beside it, so it waits for evidence that grounding
(5.1) and completion judgement (5.2) each work alone.

### Order, cost, expected effect
| step | what | measure | est. model time left (RepairDesk, 6 instr., ~150s today) |
|---|---|---|---|
| 0 | read jakb1 (Kanboard pairs) | - | decides how much of 5.1 is selector work |
| 1 | 5.1 form-as-one-decision + per-op gates + goto/dialog_expect | 3 pairs x 2 apps, ~$0.40 | ~100s |
| 2 | 5.2 as a shadow, then acting | shadow rides on step 1's runs; then 3 pairs | ~65s |
| 3 | 5.4 failed-target heal | same pairs | ~60s |
| 4 | 5.3 evidence reads | same pairs | ~50s |
| 5 | full four-app sweep with everything on; decide default | cloud, ~$3 | - |
| 6 | 5.5 plan/execute prototype | separate branch | unknown |

Estimates, not measurements: ~3x less model time and ~2x less instruction time (tool time
is a ~45s floor) if every step lands. What would falsify it early: Kanboard acting on <10%
of asks (then selectors, not Jev, are the limit), or the report shadow disagreeing with the
verifier on status more than 1 time in 20.
