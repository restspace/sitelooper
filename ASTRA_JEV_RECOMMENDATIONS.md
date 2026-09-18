# Jev recommendations for Sitelooper

Date: 2026-09-18

This document records the architectural recommendations discussed with James. It is a proposal, not a tested integration. Speed estimates are projections; Jev has not been benchmarked in Sitelooper.

## Recommendation

Prototype Jev as the routine decision layer between deterministic replay and conventional-model recovery:

```text
Deterministic replay
    → Jev for routine choices and local recovery
    → conventional model for unresolved work
```

Jev appears well suited to choosing among known browser actions, matching live controls to task intent, selecting procedures, and locating evidence. It is not a drop-in replacement for the current chat-completion provider: the current inner model also generates values, selectors, JavaScript, plans, and report text.

The opportunity is faster first-contact authoring and repair while preserving Sitelooper's recording, provenance, effect checks, and compilation to deterministic Playwright tests. Successful model-free replay already avoids inference and should remain model-free.

## Evidence and limits

TypeSafe describes Jev as a decision model taking state plus typed questions and returning choices, scores, or truth probabilities. The API is available at `POST https://api.typesafe.ai/v1/systemone`. Choice questions support up to 255 options. Questions in a request are evaluated independently against the same state; dependent decisions must be composed by code.

Sources consulted during the discussion:

- [Launch article](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [API reference](https://docs.typesafe.ai/api)
- [State](https://docs.typesafe.ai/concepts/state)
- [Choice](https://docs.typesafe.ai/primitives/choice)
- [Confidence](https://docs.typesafe.ai/confidence)

James supplied a limit of **32K tokens / 150K characters for the whole request, including state**. The public State and API pages checked during the discussion did not specify this limit. Treat both as constraints pending confirmation of exact counting rules, including serialized structure, instructions, and criteria.

TypeSafe's valid-output guarantee does not establish semantic correctness. Jev can select an existing but wrong button. Likewise, its `confidence` is derived from the distribution over answers; a confidence of 0.95 does not establish 95% correctness on Sitelooper tasks. Measure calibration and acceptance thresholds on our own workflows. Model confidence must not override failed identity or effect checks.

The vendor's headline speedups are not browser-task benchmarks. Its workflow evaluations include comparisons with reference-model probabilities. Evaluate independently using app-verified outcomes and executable recordings.

## Architecture

### Separate task interpretation from browser control

Give the decision layer an explicit task contract containing:

- Objective and any useful subgoals.
- Named input values, including unresolved secret references.
- Required output names and evidence requirements.
- Known constraints and completion conditions.

Prefer receiving this contract from the outer agent through an expanded instruction interface. Preserve the natural-language interface by using an initial conventional-model call when necessary. Arbitrary prose cannot always be converted into correct values and transformations deterministically.

Keep conventional-model support for novel text generation, complex replanning, and unsupported interactions. Existing execution restrictions still apply to fallback actions.

### Send bounded state per decision

Construct fresh state rather than forwarding an indefinitely growing chat transcript:

- Current page observation, including coverage gaps.
- Relevant changes since the previous action.
- Task contract and known values.
- Completed steps and unresolved objectives.
- Recent actions, their outcomes, and failed approaches.
- Candidate descriptions and decision questions.

The existing default accessibility snapshot budget is 8,000 characters; automatic snapshots in action results use 3,500 characters. These suggest ordinary observations can fit, but do not establish a bound on the complete Jev request. Candidate descriptions and history can dominate the budget.

Budget the entire serialized request. Preserve identity and coverage information when reducing context. Request additional observations when necessary; incomplete observation must not become an assertion of absence.

Useful existing integration points:

- `src/agent/loop.ts`: model decisions, tool execution, escalation, reporting.
- `src/agent/llm.ts`: current chat-oriented provider contract.
- `src/agent/tools.ts`: executable browser operations and batching.
- `src/daemon/refs.ts`: accessibility snapshots and element references.
- `src/execution/snapshot.ts`: structured observations and coverage.
- `src/skills/flow.ts`: recorded flows, parameters, and outputs.

Introduce a decision interface around explicit state and executable candidates instead of forcing Jev to imitate a chat transcript. Adapt selected candidates into existing execution and recording machinery.

## Deterministic candidate generation

Code discovers mechanically available actions; Jev decides which advance the task. Generate candidates from four sources:

| Source | Candidates |
| --- | --- |
| Live controls | Click buttons and links, toggle checkboxes, fill editable fields, select actual options |
| Task inputs and observed values | Bind known values to compatible controls |
| Generic interaction recipes | Open a combobox, type a query, choose a rendered suggestion, expand a section, dismiss a dialog |
| Controller operations | Observe a region, scroll a container, read a value, go back, escalate or request replanning |

Represent each candidate as an executable object with provenance:

```ts
{
  id: "a17",
  observationId: "obs42",
  operation: "fill",
  targetRef: "@e12",
  valueRef: "task.ticketTitle",
  description: 'Fill textbox "Title" in dialog "New ticket" with task.ticketTitle'
}
```

The executor resolves references and supplies exact strings. Jev selects an ID; it does not need to regenerate a title, identifier, or credential. Keep secret markers opaque and resolve them only during execution.

Include surrounding context in descriptions: parent dialog, row identity, label, current value, and enabled state. Two controls named "Delete" are not interchangeable.

Filter mechanically invalid combinations, such as unsuitable value types or unsupported operations. Avoid aggressively filtering by label similarity: that can remove the correct action before Jev sees it. Generate compatible action-and-argument bindings rather than independently choosing a verb, element, and value whose combination may be invalid.

Always provide explicit outcomes for "none suitable", "need more information", and escalation. Candidate coverage is a fundamental constraint: a model cannot select an action that was never offered.

For a form with two textboxes and two supplied text values, generating all four fill bindings is reasonable. Enumerating every action × element × value on a dense page is not. Use staged selection or page regions when the candidate set becomes large.

### Parallel selection beyond 255 options

Use map/reduce selection:

1. Generate candidates from one observation revision.
2. Partition into groups fitting both the option limit and whole-request limits, reserving options for abstention and observation.
3. Evaluate groups in parallel against the same objective and sufficient shared context.
4. Retain several contenders per group, for example using the returned probability ranking.
5. Run a fresh final Choice over contenders with their descriptions and relevant context. Add reduction levels if necessary.
6. Revalidate the selected target and preconditions, then execute and observe the result.

Do not select the global winner by comparing probabilities or confidence across groups: those distributions are conditional on different alternatives. A new comparison is needed. Shortlisting is still a heuristic and should be evaluated for missed actions and sensitivity to partitioning.

Parallel selection latency is approximately preparation time plus the slowest group request plus reduction and validation. More groups increase total work and exposure to rate limits and tail latency even when they do not increase the number of sequential stages.

Parallel judgments do not authorize parallel dependent browser actions. Opening a dialog and selecting a control inside it require successive observations. Independent bindings on a visible form may be decided together and executed using validated batching. Questions evaluated independently do not automatically produce a consistent joint plan.

## Preserve execution and evidence guarantees

- Keep browser readiness checks, identity guards, effect gates, cycle detection, and value provenance.
- Associate candidates with an observation revision and reject or refresh stale targets before execution.
- Preserve structural commit checks for autocomplete; displayed input text alone does not prove selection.
- Read reported values from the live page. Let Jev choose an evidence source and let code capture the exact value.
- Assemble routine reports from task output names and captured evidence. Use a conventional model only when prose adds necessary information.
- Resume fallback from the actual browser state and action log; do not repeat mutations blindly.
- Compile and re-pin repairs only through existing validation paths.

Fast inference removes accidental waiting previously supplied by slow model calls. Readiness and settling must therefore work without inference delays.

## Speedup estimate

Working estimate for first-contact authoring: **5–10×**, with approximately **3× conservative** and **10–15× optimistic** scenarios. A 20-minute authoring run could become roughly 2–4 minutes under the working estimate. These are conditional projections, not measured expectations with statistical confidence.

Published benchmark result files give the following breakdown, rounded to seconds:

| Run | Total runtime | Inside Sitelooper commands | Outside commands |
| --- | ---: | ---: | ---: |
| `fwrd42` | 1,212 | 1,168 | 44 |
| `fwkb5` | 1,078 | 1,054 | 25 |
| `fwgr27` | 1,381 | 1,353 | 29 |
| `fwod34` | 1,451 | 1,335 | 116 |

Source: `bench/results-published/<run>-n1-sleep-walker-result.json`, using `wallMs` and `commandMs`. Time inside commands includes browser execution, recording, verification, and model calls. It is not a measurement of model time alone. `bench/MATRIX-SUMMARY.md` identifies inner-model latency as the dominant recording cost, but more detailed instrumentation is needed to quantify its share.

TypeSafe reports 70–500 ms per request, generally measured near its US West Coast service. For planning, allow **0.5–2 seconds per effective Jev decision**, including preparation and possible selection/reduction stages. This allowance is unmeasured and may be exceeded with large requests, distant clients, throttling, or slow parallel branches.

For a fixed action path:

```text
new runtime / old runtime = (1 − p) + p × ((1 − q) + q / r)

p = fraction of current runtime spent in inner-model calls
q = fraction of that model time replaced by Jev
r = effective acceleration of the replaced work
```

| Scenario | Inner-model share p | Model time replaced q | Acceleration r | Overall speedup |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 90% | 80% | 20× | 3.2× |
| Strong integration | 95% | 95% | 20× | 7.0× |
| Optimistic | 97% | 98% | 40× | 13.7× |

All three scenario inputs are assumptions. The calculation holds other work constant and excludes extra failed actions, additional browser observations, and changes in planning quality. Coverage must be measured by model time removed, not merely call count: the remaining difficult calls may be the slowest.

The largest payoff is eliminating frequent conventional-model calls. Target one initial interpretation and occasional exceptional replanning, with routine decisions and reporting handled by Jev or code. A provisional engineering target is **7× faster authoring with unchanged verified outcomes and clean replay**.

Do not extrapolate this to deterministic CI execution or the full readiness workflow: model-free replays, application response time, resets, and verification runs remain.

## Rollout and evaluation

### 1. Establish timing and correctness baselines

Measure conventional-model time separately from browser actions, observation, recording, compilation, and outer-agent overhead. Include retries, tail latency, and fallback time. Record actual request sizes and action counts.

### 2. Prototype locator recovery

Start when deterministic replay cannot resolve a target. The intended operation and value are already known. Jev selects a matching live element or abstains; existing identity and effect checks validate execution.

This is a bounded experiment with less ambiguity than full autonomous navigation. Ensure a syntactically valid but wrong target cannot silently earn a repaired recording.

### 3. Extend to navigation and forms

Add selection from live controls, task-value bindings, generic recipes, and evidence-source selection. Start with ordinary CRUD workflows, then test dense pages, ambiguous controls, dialogs, autocomplete, and partial observations.

### 4. Broaden the routine inner loop

Add procedure selection, routine recovery, completion assessment backed by evidence, and deterministic report assembly. Retain conventional-model fallback until coverage and quality are demonstrated.

Evaluate both first-contact authoring and drift recovery using:

- App-verified task success and false-success rate.
- Correctness of reported values and their provenance.
- Successful compilation and clean deterministic replay.
- Total latency, model latency, and browser action count.
- Fallback frequency and time spent in fallback.
- Candidate coverage, abstention, and partitioning failures.
- Calibration on accepted decisions and confidently wrong selections.
- Total request cost and rate-limit behavior.

Compare at equivalent correctness. Fast incorrect decisions and recordings that fail on replay do not count as improvements.

## Product implications

For a small SaaS team, a custom Playwright helper that enumerates controls and asks Jev which to click could be relatively easy to build. A team's own app is more predictable than a general browser environment. Basic AI element selection is therefore weak differentiation.

Sitelooper's stronger proposition is **time to a trustworthy, maintainable Playwright test**: task interpretation, reliable execution, evidence capture, parameter binding, recovery, verified recording, and deterministic CI artifacts.

Jev could materially improve authoring and repair responsiveness. Adding Jev to an already deterministic Playwright test generally adds inference latency; it is useful there for flexibility or maintenance, not execution speed. Preserve the distinction between faster agent authoring and fast model-free test execution.

## Open questions before committing to the design

- Exact whole-request limits and counting rules, including how questions and criteria contribute.
- Latency at realistic state sizes and under parallel selection, including p95/p99 behavior.
- API access, concurrency limits, throughput, and throttling behavior.
- Fraction of current model time replaceable while preserving task success.
- Whether deterministic candidate generation covers unfamiliar interfaces adequately.
- Whether fast decisions expose readiness problems hidden by slow inference.
- How much conventional-model work remains in interpretation, recovery, evidence sourcing, and reporting.

Proceed with a focused prototype and measured expansion. The existing execution and compilation architecture makes the opportunity credible; the key uncertainties are decision quality, candidate coverage, and residual conventional-model time.
