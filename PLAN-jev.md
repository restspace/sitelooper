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

### F. Experimental, flag-gated, bench-decided
- **System One actor** for skill-less single-action instructions (function-calling
  cookbook): `choice` over tool ∈ {click, fill, select, check, read, *not-single-action*},
  `choice` over same-kind elements, value from instruction spans; min-confidence gate;
  success is recorded and compiled like any other step. Could remove the agent loop
  from the easy majority of first-run steps, but it's a second actor to keep correct.
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
| 3 | G sidecar observer | matrix: fewer turns/instruction, zero new reds |
| 4 | C stragglers; H focused snapshot | no report regressions; H recall measured |
| 5 | B inline healing (read-only/fill first); L candidate ranking | matrix: fewer fallbacks, zero new reds |
| 6 | K whole-flow map (absorbs E), promote I/J to veto | naming-probe parity; step 2's log |
| 7 | D paraphrase match | calibration from 1–6; min-confidence curve |
| 8 | F experiments | bench only |

After step 0 the contract is fixed and steps 1–4 are independent (parallelisable).
Step 2 is deliberately early: it changes no behaviour, costs cents, and its log is the
best evidence we'll get on whether Jev's judgement is worth trusting anywhere else.

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
