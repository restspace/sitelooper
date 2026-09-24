# One provenance model for published values and bindings (design, no code)

Base: `origin/fix/round60` @ cb5caf27. Every path below is relative to `src/` unless it says otherwise.
Prior art that this design builds on and does not replace: `notes/PLAN-provenance.md` (the RunLedger,
`Binding`) and `notes/PLAN-evidence-over-shape.md` (run 1 proposes, run 2 decides; `basis`). Both are
only partly implemented. `Binding` has no producer for `{from:'input'}` and no `readback` arm. The
ledger lives only in memory. The one persisted origin, `SkillParam.binding`, is itself assigned by
value equality.

---

## 0. The answer to the central question, up front

> What ensures there are no false positives when reading a value that the replay typed?

**Today, only partly, and there are four holes.** The code for each is quoted from round60.

1. **A typed slot is exempt from every check when it reaches the report through the template.**
   - `execution/report.ts unobservedGiven` does `if (!slot.startsWith('v') || typed.has(slot)) return false;`. Its comment says a typed slot is "the echo rules' to judge".
   - The echo rules (`execution/echo.ts echoAt`) only ever see **reads**. A report value `"{{v3}}"` whose `v3` a fill typed, and which no read re-reads, publishes the param with no page, element or commit check, in both runners.
   - `typedSlots` counts a fill as "typed" even when it was skipped, failed, or went into another field.
   - learn.ts ~985's fallback prose then lists it as "observed k=v".
2. **Short values are never echoes.** `MIN_ECHO_LEN = 5`. `echoVerdict` and `echoAt` return "not an echo" for anything under 5 characters, before the element rule runs.
   - Example: typed quantity `"3"`, cost `"150"` or `"1m"`, read back **from the very control that was typed into**. That read is published as observed.
   - The element rule (control/widget identity) would catch it, but it is never reached.
3. **The artifact's commit evidence does not depend on the click.**
   - `noteCommit` feeds `echoAt` rule (b) with the recorded `expect.addedContains` lines, filled with params.
   - The daemon notes a commit after the click ran (replay.ts ~1477).
   - The artifact emits `noteCommit` at the start of the step, before the action (emit.ts ~2480). A skipped optional click still "commits".
   - A url change also counts as a commit (`page.url() !== set.url`) whatever caused it. A debounced search box that writes `?q=` is one example.
4. **The artifact mixes reference-only values into its findings.**
   - For a consumed key, emit.ts ~3253 writes `referenceValue(...)` straight into `outputs[key]`. That value is a given param's raw fallback, or a value withheld for unshown text.
   - The daemon keeps those in `ReplayReport.references`, never in `report.values`.
   - Nothing in the artifact's `run` marks them the way `run.echoed` marks echoes. An artifact consumer that reads `outputs` as findings gets given values as observations.

Stage 1 of the migration plan (§7) closes all four. It gives every published value a runtime class (`observed | committed | echo | given | withheld`), decided by one shared function from evidence each runner collects the same way. This is the smallest change that answers the question. The structured origin tags (stages 2-4) fix theme B and make the policy's inputs trustworthy. They are not needed to close these four holes.

---

## 1. Today's rules

### 1A. What may be reported as observed

Everything in `execution/report.ts` and `execution/echo.ts` is embedded verbatim in the artifact (`spec/runtime-source.ts` `EXECUTION_MODULES`). So the core predicates are shared, and the parity risk sits in **which inputs each runner passes and where it writes the result**.

| Rule | Where | Decides | Inputs | Daemon | Artifact |
|---|---|---|---|---|---|
| `derivesFromParams` | execution/report.ts:41 | A value holding `{{vN}}`/`{{dN}}` is "this run's"; a pure literal never publishes | template text (regex) | learn.ts synthesize | emit.ts `reportTemplateLines` filter |
| `unshownLiterals` / `templateLiterals` (round 53, fixed 55) | report.ts:56/76 | Recorded text between slots must appear as a word run in one line of the settled page | template, `shownForReport` | via templateValue, and `stale` | via templateValue |
| `templateValue` | report.ts:101 | The publishable value or null (unbound, residual `{{`, empty, unshown literal, unobserved given) | template, params, shown, `{literal, given}` | learn.ts 860/869 (calls given check separately); server.ts 1799 satisfied guard | emit.ts 3253; `satisfiedGuard` |
| `unobservedGiven` / `withheldAsGiven` / `typedSlots` (round 60) | report.ts:153/175/187 | A param-only value publishes only if its slot's words are in one page line or a live read, **or the chain typed the slot** | template, params, shown, `{typed, live}` | learn.ts 853-866 | emit.ts 3233-3257 |
| `referenceValue` | report.ts:222 | Reference-only fallback: the whole value, else a one-slot template's raw param; **no given check** | as above | → `references` (separate from values) | → `outputs[key]` (same map as findings) |
| `templateSource` | report.ts:244 | Compile-time: "publishes on every run" = derivesFromParams, all markers bound, and no literals or exactly one slot | template, `bound()` | learn.ts `publishedOutputs` → export lint, `pruneUnsourcedOutputs`, `liveReadsFor` | emit.ts `unsourcedRef` → `unsourced-ref` refusal |
| `reportNeedsPage` / `shownForReport` | report.ts:257/272 | Whether to look, and what "the page" is: dialect-2 lines + innerText lines + url | | learn.ts (values **and summary**) | emit.ts (values only) |
| `observedSummary` + `fresh` (stale filter) | report.ts:307; learn.ts ~927 | Prose clause survives if every word is in the bag (instruction + params + kept values + page) and it names no stale string of ≥4 chars (`MIN_STALE_LEN`) | | learn.ts only | **none**: the artifact has no prose |
| Echo: `noteInteraction` / `markActed` / `noteCommit` / `echoVerdict` / `echoAt` (round 59) | execution/echo.ts | A read is an echo if the text key is in the ledger (≥5 chars) and, for some set of that text, the read element is the control/widget or nothing committed it | text ledger, element marks, recorded commit lines, url | replay.ts 966-1007, 1467-1478 | emit.ts 263-280, 1895, 2476-2483 |
| Echo handling | server.ts 2795-2803; emit.ts | Daemon: echoed keys are deleted from the confident values and `withhold`-ed from the template, but still `published` for references. Artifact: the value stays in `outputs`, and the key goes into `run.echoed` | | | |
| `partialReasons` | daemon/step-verdict.ts:77 | PARTIAL for an asked output that was skipped, or asked and given-only, or an unfinished recovery gesture | status, skippedReads, given, instruction | server.ts ~1993 | emit only `logWarning("PARTIAL …")` for given; no skipped-read partial; the test does not fail |
| `askedOutputs` / `unansweredAsks` / `literalOnlyAsks` / `unansweredForStep` | step-verdict.ts 156-270 | Word match of output names against the "report …" clauses; warning only | | export + step record | askedOutputs baked in at compile; the rest **absent** |
| Already-satisfied guard | server.ts ~1771; emit.ts `satisfiedGuard` | Nothing ran, so the template stands in with `literal:true` and empty evidence | | yes | yes, same shape |
| `publishedOutputs` | learn.ts ~1062 | Export's source set: any read label (including `unproven`) plus a `templateSource` template on **any** segment | | export | — |
| `unsourcedRef` | emit.ts ~3564 | Compile refusal: a consumed output needs a proven non-empty read or a `templateSource` template on any producer segment | | — | compile |
| Read-back cascade | agent/loop.ts 564-749; agent/readback.ts; recorder.ts `captureReadBack*` | At record time, turns a model-reported value into a labelled read by **finding its text on the page** (count 1, row-scoped, field label …) | | recorder | — |
| Composite split | agent/report.ts `flattenComposedValues` (JSON, **no pin**), `flattenProvenComposite`, `flattenContainedComposite` (every part pins) | Per-element reads for a composite | | recorder | — |
| `expandListReads` | compile.ts ~3098 | Splits a `read_all` into nth reads when each element equals a distinct reported value | | compile | — |
| Synthesized reads / unproven | flow.ts `liveReadsFor`, `liveReadsForRecovery`; server.ts `settleUnprovenReads` | `@synth` reads with `unproven:true`, proved later by output evidence **by name** | | export/runtime | counted as no source by `unsourcedRef` |
| Mint binding in templates | compile.ts ~1124-1155 `reportSub`; ledger.ts `slotKnownRunValues` | A report value is slotted by **text substitution** of slot values into the model's report text; a minted `{{dN}}` is substituted by value | | compile / export | — |

**Where 1A overlaps or disagrees.** These are the concrete ones; each is a bug or a latent one.

1. **Typed exemption, above.** `unobservedGiven` defers to the echo rules, which never see template values.
2. **The given value is withheld but the prose still states it.** `synthesize` pushes the given value into `stale`, but `fresh` ignores stale strings under 4 characters (`"bug"`). And `observedSummary` puts `Object.values(params)` in the observed bag, so the prose keeps "bug" while the value is withheld. The two checks also judge differently: one line vs one bag of words.
3. **Segment mismatch.** Compile counts a template source on **any** segment (`publishedOutputs` via `chain.flatMap`, and `unsourcedRef`). Runtime fills only the **last** segment's template (`replayReport(last)`, `reportTemplateLines(last)`). A mid-chain template value passes compile and never publishes.
4. **Three different "bound" sets.** `publishedOutputs` uses skill params plus chain-derived values. `unsourcedRef` uses segment params plus the producer's derived values. `reportTemplateLines` uses `markerBound(last)` or `last.params ∪ ctx.minted`.
5. **Two different "published" tests at compile.** `publishedOutputs` counts `unproven` reads; `unsourcedRef` does not. This is deliberate, but "compile counts sources by the same rule" holds only for the template half.
6. **An echo counts as answering an ask.** `unansweredAsks` treats an echo-read as answering an ask ("the value was observed"), while the report drops it as not observed.
7. **`literalOnlyAsks` misses one shape.** It flags only a template with no `{{` at all. A slot-plus-literal value (fwrd86's shape), which is routinely withheld, is not flagged.
8. **The verdicts differ between runners.** The daemon produces partial, unanswered and literal-only; the artifact has a log line and a passing test.
9. **Proof by name.** `settleUnprovenReads` proves an `unproven` read by **output name**, fed from confident, echo, reference and url outputs alike, so another source under the same name can prove a read that never resolved.
10. **JSON composites are split without pinning** (`flattenComposedValues`); their siblings require every part to pin.

### 1B. What binds to what

The persisted origin today is `SkillParam.binding`, spelled `var:NAME | input | url:iN:LABEL | output:iN:NAME[#path]`. In fwgt11 it holds things like `output:i3:issue_url` and `var:runid`. It is **assigned by value**: compile.ts ~1101 `originOfValue = new Map(Object.entries(knownValues).map(([k,v]) => [v.trim(), k]))`. Recovery compiles pass a map mixing three spellings (server.ts ~2086: `url:iN`, `02-create.url.p1`, `02-create.ticket_ref`), so the last spread wins. `{from:'input'}` has no producer. The RunLedger (`skills/ledger.ts`) is in memory, first-appearance-wins **by value**, and rebuilt from script.jsonl.

| # | Rule | Where | Decides | By origin or by text/shape |
|---|---|---|---|---|
| 1 | Instruction threading | flow.ts buildFlow ~428 | Instruction text → `{{var}}` / `{{step.out}}` | **Value**: `replaceToken` over `produced`, longest first |
| 2 | Param threading | buildFlow ~442-471 | Each flow param | `originRef` is by origin but handles **`url:` only**, and also demands value equality; everything else is `replaceToken` by value (fwsi3's gap for `output:`/`var:` origins) |
| 3 | `threadStepParams` / `alignSlots` / `splitRun` / `rethread` | skills/rethread.ts; used by export, daemon runFlow, spec/ir.ts | Literal param → the `{{ref}}` standing at its slot | **Text**: a lazy `(.+?)` template regex over the referenced instruction |
| 4 | `bindSkill` / `resolveAdjacentRun` / `deriveContained` | learn.ts ~637 | Instruction → slot values | **Text** (lazy regex; fwod85). Origin fallback `known[p.binding]`. The artifact's `ir.ts replayBinding` passes `known={}` |
| 5 | `originOf` / `lintUnboundParams` | flow.ts ~2640/2665 | Origin → ref for a still-empty slot | **Origin** |
| 6 | `remapParams` | flow.ts ~2994 | Re-pin slot rebinding | Origin first; fallback `text.split(b.value).join(b.template)` (raw substring) |
| 7 | url minting in buildFlow; `urlOutputs`; `referencablePart` | flow.ts ~519-595, ~2586 | Which url parts become `{{step.url.X}}` outputs, and which a replay publishes | **Shape** (`looksLikeId`, len ≥ 3, `idPositionPart`, `pathIdPart`) plus origin arms (`landedByAction`, `linkMintedParts`, `unseenGotoParts`) |
| 8 | Report outputs as producers | buildFlow ~612-676 | Which reported values later steps may reference | Time and text vetoes (`statedBeforeShown`, `baselineOf`); `jsonLeaves` by shape |
| 9 | Ledger `add` / `addUrlIds` / `kind` / `basis` | ledger.ts ~461/522 | identifier / name / text | `looksLikeId` **shape** for reported values; position/landing for url parts; variance is seeded at flow run |
| 10 | `stripLeakedCandidates` / `stripRunValueCandidates` / `stranded` | server.ts ~187; compile.ts ~2191 | Drop locator candidates naming a run value | Membership by ledger **kind** (shape); matching by token **text**; fwod84's victim |
| 11 | `discoverMinted` | compile.ts ~1547 | `{{dN}}` and `mints` | **Shape** (`looksLikeId`, a digit); `linkMintedParts` is origin |
| 12 | `discoverSlots` | compile.ts ~1832 | The slot set | **Text** (`occursAsToken`); a digit-in-locator **shape** rule; the url position arm by origin |
| 13 | `textMints` / `textMintSlots` | flow.ts ~891; compile.ts ~1634 | Text-minted record numbers (fwrd85) | Detection by origin (a mutating step added it with the url unchanged); the slot's binding **by value** |
| 14 | `slotKnownRunValues` | ledger.ts ~923 | Slot run values in goal/report | Chooses the param **by example equality**, not by `entry.binding === p.binding` |
| 15 | `taskConstants` / `offeredBeforeReported` / `statedBeforeShown` | flow.ts ~744-833 | App constants vs run values | Order of the recording (origin); the match is token text |
| 16 | `mintedShape` / `landsRecord` / `mintedRecordId` | url.ts ~325; lifecycle.ts ~118 | "Landed a record" | **Shape** |
| 17 | `mintedAhead` (rule G) | gates.ts ~644 | The start page is past its start | Origin (`mints.at/sole`); shared by both runners |
| 18 | `routeAt` / `visitedUrlPart` (round 60) | url.ts ~418/449 | A url part the step visited | Origin (a route recorded at export); shared |
| 19 | Credentials | shared/secrets.ts; tools.ts `markCredentialArgs`; spec/index.ts `withCredentialMarkers` | Literal → `{{env:NAME}}` | Env name, then value equality. Password field: daemon checks the **live DOM**, compile checks a **regex over locator JSON** |
| 20 | `runValueKeyRenames` | skills/relabel.ts ~72 | Strip run values from output keys | Chosen by provenance; stripped by token text |
| 21 | `tokenPattern` | skills/shape.ts ~261 | The boundary every value match uses | **Shape changes the match**: `looksLikeId(value) ? 'A-Za-z0-9' : 'A-Za-z0-9_-'` |
| 22 | `slotActs` (round 60) | execution/expect.ts ~95 | Whether a missing slot changes behaviour | Structural; shared and agreeing |

**Where 1B re-derives one fact, or disagrees.**

- **"Is this url part minted/referencable" has five answers:** ledger `addUrlIds`, `referencablePart`, `discoverMinted`, `mintedShape`, `urlVarianceValues`. Odoo `q.action=315` is excluded by the ledger (fwod29) but admitted by `referencablePart`.
- **"A goto is not a landing" has three implementations:** server.ts `noteMintedIds`, flow.ts `landedByAction`, `staleInstructionIds`.
- **The instruction index `iN` is counted three ways.**
  - `relabelCases` counts resume entries; the daemon and `groupByInstruction` do not.
  - At replay, `iN` counts only the steps actually run.
  - So an `output:i3:x` binding can name a different step. `ledgerSteps` repairs this for `remapParams` only.
- **Origin → value → reference round trip.** At export, `bindSkill` fills an origin-bound slot with `known[p.binding]`, which is a literal. buildFlow then re-finds a reference **by value**. If two steps reported the same string, the reference goes to whichever producer sorts first.
- **Two adjacent-slot splitters:** `resolveAdjacentRun` and `splitRun`, with duplicated `squash`/`escapeRe`.
- **Four run-value sets:** `stripLeakedCandidates`, compile `runValues`, `runIds` in `liveReadsFor`, `slotKnownRunValues`.
- **Daemon vs artifact.**
  - `replayBinding` passes `known = {}`, so the artifact refuses with `unbound-pin` where the daemon binds.
  - Password-field detection differs (live DOM vs locator regex).
  - Url outputs differ: the daemon publishes shape-passing parts plus consumed ones; the artifact only parts consumed by params.
- **Compile vs export mints.** `discoverMinted` needs a digit and a non-navigation; buildFlow admits goto landings and digit-free tokens. So a `{{step.url.X}}` can exist without a `{{dN}}`, and vice versa.

---

## 2. The provenance model

### 2.1 Two lifetimes

The brief lists tags as if they were one kind of fact. They are two, and treating them as one is the mistake to avoid.

- **`Source`: static, recorded once, stored.** It says where a value comes from on **any** run: given by the caller, minted by step X at url label h2, read by step Y as `name`, an app constant. It drives **binding** (theme B) and says what evidence a run *could* produce. It is set at record or export time and carried through the skill, flow, IR and artifact.
- **`Evidence`: dynamic, per run, never stored in the store.** It says what **this** run actually saw: the read resolved at an element that is not the control; the url carried it; a verified effect line showed it after a commit; nothing. It drives **publication** (theme A) and is collected by each runner.

The single policy is a pure function `(Source, Evidence) → Class`, embedded in the artifact. A stored tag can never answer "did this run observe it". A run's evidence can never answer "what should this slot bind to next time". PLAN-evidence-over-shape's cross-run **variance** (stable vs volatile) is a third, orthogonal axis. It stays a separate field (`basis`, `outputEvidence`), and this design does not fold it in.

### 2.2 Types (new module `execution/provenance.ts`, embedded like report.ts)

```ts
/** A step as a stable key: the flow step id once exported; before export, the
 *  instruction ordinal from ONE counter (instructionOrdinal(entries): resume
 *  entries merged), replacing the three iN counters. */
type StepRef = string;

/** STATIC: where a value comes from on any run. Stored. */
type Source =
  | { k: 'given'; from: 'instruction' | 'var'; name?: string }            // the caller supplied it
  | { k: 'env'; name: string; totp?: true }                                // credential marker; never published
  | { k: 'constant'; why: 'task' | 'offered' | 'app' }                     // stated before any report, or an offered option picked
  | { k: 'minted'; by: StepRef; via: 'url'; label: string; route?: string }// the run made it; this run's url re-derives it
  | { k: 'minted'; by: StepRef; via: 'text'; output?: string }             // record number shown after a save (fwrd85)
  | { k: 'output'; step: StepRef; name: string; path?: string }            // an earlier step READ it
  | { k: 'url'; step: StepRef; label: string }                             // a url part, not minted (route vocabulary)
  | { k: 'recorded' }                                                      // the recording's own text; no run re-derives it
  | { k: 'unknown' };                                                      // an old store; the policy is conservative

/** A report value's structure at compile, instead of one substituted string. */
interface ReportValueSpec {
  /** How the recording got it. Decides what a replay must do to observe it. */
  basis:
    | { k: 'read'; label: string }                      // a read in the chain carries this label: the replay re-reads it
    | { k: 'parts'; labels: string[]; joiner: string }  // a composite of per-element reads (round 56)
    | { k: 'url'; label: string }                       // this run's url
    | { k: 'title' }
    | { k: 'model' };                                   // the model wrote it; no element on record
  /** Its parts, each with a Source. Replaces the `{{vN}}`-substituted string for new stores. */
  parts: ({ lit: string } | { slot: string; source: Source })[];
}

/** DYNAMIC: what THIS run saw for one value. Collected by the runner. */
type Evidence =
  | { k: 'read'; step: string; atControl: boolean; commit: Commit | null }   // element-scoped read; commit only relevant if the value was typed
  | { k: 'effect-line'; step: string; line: string }                          // a HARD expectation line with the slot, verified in THIS run's diff
  | { k: 'url'; label: string }
  | { k: 'page-line' }                                                        // words in one line of the settled page (shownForReport)
  | { k: 'typed'; step: string; ran: boolean }                                // this run put it in a control
  | { k: 'none' };

type Commit = { by: 'navigation' | 'detached' | 'verified-effect'; step: string };

/** What a runner publishes, per key, in BOTH runners' results. */
type Class = 'observed' | 'committed' | 'echo' | 'given' | 'withheld';
interface Published { value: string | null; class: Class; how: Evidence['k']; source: Source['k']; why?: string }
```

**`ReportValueSpec` is the key change for theme A.** Today `compile.ts reportSub` builds a report value by substituting the text of slot values into the model's report text. That is how fwgt11 07-add's read of the labels sidebar (`"bug"`) became `"{{v7}}"`: an **observation** was converted into a **given parameter** because the strings were equal. With a basis, the compiler knows the value came from a read (`label`), and a replay must re-read it. A slot whose value happens to be equal is recorded as an *expected* value, never as a source.

### 2.3 Where each tag is set, carried and consumed

| Fact | Set where (the earliest point that knows it) | Carried | Consumed |
|---|---|---|---|
| `given.var` | the caller's vars (state) | SkillParam.source → FlowStep.paramSources → SpecSegment.params | binding: `{{name}}` |
| `given.instruction` | **attribution** at export (see below): the value occurs in this instruction's text and no earlier source claims it | same | binding: literal flow param; policy: never observed without evidence |
| `env` | the dispatch rewrite (tools.ts `markCredentialArgs`, the live DOM input type); the recorder also writes `inputType` on the fill step (new) | args `{{env:NAME}}` as today | never published; compile reads `inputType` instead of the locator-JSON regex |
| `constant.offered` / `.task` | attribution from diff order (`offeredBeforeReported`, `statedBeforeShown`) | SkillParam.source / ReportValueSpec part | strip/slot: never a run value (fwod84) |
| `minted.url` | attribution from `diff.url` plus the **new recorder `urlTrail`** per step (same-document navigations included); landing = non-goto action, or a goto to an unseen record (fwsi7) | Skill.derived + `mints` as today, plus `source` on the slot / flow param | binding `{{X.url.label}}`, X ≠ consumer (fwec1); publication `url` evidence |
| `minted.text` | attribution (`textMints`: a mutating step added the line, url unchanged) | same | binding to the capturing output, or a wildcard |
| `output` | a read in script.jsonl (tool `read` with `label`, or a read-back) whose result the value equals **and which precedes the use** | same | binding `{{Y.name}}` |
| `recorded` | a template literal / a model-only value | ReportValueSpec part `lit` | publication needs page-line evidence (round 53's rule) |
| typed (runtime) | the runner, at the fill/type/select it **actually dispatched**, with the slot names in its args and the resolved locator | runtime ledger (echo.ts, extended) | policy |
| read (runtime) | the runner's read, with `markActed`/`echoAt` element facts | runtime | policy |
| effect-line (runtime) | `expectedChangesVerdict` with `confirmed` (found in **this run's diff**), for a hard line carrying the slot | runtime | policy (commit proof) |

**Attribution is one pure function over script.jsonl.** It is `attribute(entries, vars) → Map<valueOccurrence, Source | {ambiguous: Source[]}>`, in a new `skills/attribute.ts`, run at export and at recovery compile.

Be honest about what this is: **for n1, most sources are an inference.** The model authored every typed string. The recorder sees `fill value:"bug"` and cannot know from the dispatch that "bug" came from the instruction. So attribution still matches values. What changes is that:

- matching happens **once**, over the whole recording, with **time order** (a read before the use, a landing before the use, an offer before the pick);
- ambiguity is **recorded** (`{ambiguous: [...]}`) instead of first-appearance-wins or longest-first;
- the result is **persisted**, and everything downstream consumes the tag and never the text.

This replaces `originOfValue`, buildFlow's `replaceToken` over params, `remapParams`' substring fallback, `slotKnownRunValues`' example equality, and the value-keyed `RunLedger.add`.

**Precedence for ambiguity.** For a slot used at step S, the candidates are:

1. `minted`/`output`/`url` from the **most recent producer before S** (never S itself);
2. `var`;
3. `given.instruction`;
4. `constant`.

An `offered` constant beats an `output` only when the offer precedes the report (fwod84's rule, which is now order, not shape). A tie that the order does not break stays `ambiguous`, and the export warns. That is where the value-matching risk now lives, visibly.

### 2.4 Storage format and back-compat

All fields are optional, so there is **no SKILL_CONTRACT bump**. This follows the store's own rule ("adding a new optional field is not a bump").

- **script.jsonl.** Two new recorder facts:
  - `RecordedStep.inputType` (the fill's `type`/`autocomplete`);
  - `RecordedStep.urlTrail` (main-frame navigations during the step, same-document ones included; today only `diff.url`, the end url, is recorded, and round 60 had to add `urlTrail` at runtime for fwgh14).

  Nothing else: attribution derives the rest from what is already recorded, which is what makes old recordings re-exportable.
- **Skill.** New fields:
  - `SkillParam.source?: Source`. `binding` is kept and still written, derived from `source` for older builds.
  - `Skill.reportSpec?: Record<key, ReportValueSpec>`, beside `reportTemplate`. `reportTemplate` is kept for older builds and for prose.
  - `SkillStep.typedSlots?: string[]` is **not** needed: the runtime ledger knows what it typed.
- **Flow.** New fields:
  - `FlowStep.paramSources?: Record<slot, Source>`: the source the param was written from, so replay/IR never re-thread a param that has a source.
  - `FlowStep.refs?`: an explicit list of `{marker, source}`. Today refs exist only as markers inside the instruction text.
- **Spec IR.** `SpecSegment.params` already carries `SkillParam` verbatim, so `source` rides along. `report` gains `spec` (the `ReportValueSpec` map). `SpecStep.paramSources` mirrors the flow.
- **Artifact result.**
  - `run.published[key] = Published` alongside `outputs`. `run.echoed` is kept as a derived list for existing consumers.
  - `outputs` stays the reference map, and **must not be read as findings**. The bench's report readers (verifiers checking `finalText`) move to `run.published` filtered to `observed|committed`.
- **Daemon result.**
  - `ReplayReport.published: Record<key, Published>`.
  - `Report.evidence.values` keeps observed/committed only. Today it also holds typed-slot template fills.
  - `references` gets echo and given values, as today.

**What old stores can recover.**

| Tag | From an old store **with** its script.jsonl (re-export via rebuild-flow) | From a published store only (corpus-check compiles as stored) |
|---|---|---|
| var, env | yes | yes (`binding: var:*`; `{{env:*}}` markers) |
| output / url / minted.url | yes (attribution) | from `binding` strings (`output:iN:*`, `url:iN:*`), with the iN caveat; `derived`/`mints` exist |
| minted.text | yes | partially (a slot exists if `slotKnownRunValues` already slotted it) |
| constant.offered/task | yes | no → `unknown` |
| given.instruction | yes | no → `unknown` |
| ReportValueSpec.basis | yes: a read with that label in the chain → `read`; composite labels → `parts`; else `model` | **derivable**: a read labelled with the key exists in the chain → `read`; else the template string's slots → parts with `unknown` source |
| inputType, urlTrail | **no** (never recorded) | no |

**`unknown` is conservative:**
- For publication, an `unknown` template slot is treated as `given`: it needs this run's evidence. This is round 60's rule, minus the typed exemption.
- For binding, an `unknown` slot keeps today's code path (value matching), with a lint count, and is never promoted to identity (`fatal`) on shape alone.
- For credentials, a missing `inputType` keeps today's locator regex.

---

## 3. The single policy

### 3.1 Publish: a decision table (`execution/provenance.ts classify`)

Evaluated per report key, in both runners, over the value's static spec and this run's evidence. The first matching row wins.

| # | Static (source / basis) | This run's evidence | Class | In report? | Reference? |
|---|---|---|---|---|---|
| 1 | any | the value fills empty, holds `{{`, or has an unbound marker | withheld | no | no |
| 2 | `env` | any | withheld (never a finding) | no | marker only |
| 3 | basis `read`/`parts` (a read this run ran) | read resolved; element **not** the control/widget of any set of this value, or no set of this value | observed | yes | yes |
| 4 | basis `read`, and the value equals a slot **this run typed/selected** (any length) | read at the control/widget, or no commit | echo | no | yes |
| 5 | same as 4 | read outside the widget **and** a commit: navigation/reload, the control detached, or an effect line verified **in this run's diff** after the set (not the recorded line; not an unrelated url change) | committed | yes (`how: read`) | yes |
| 6 | basis `read` | read skipped or not resolved (`unproven` included) | withheld; **partial if asked** | no | no |
| 7 | basis `url`/`title`, or a part with `minted.url`/`url` source | this run's url/title carried it | observed (`how: url`) | yes | yes |
| 8 | a part with source `typed-by-this-run` and no read of it | a hard effect line carrying the slot, verified in **this run's diff** after a commit gesture | committed (`how: effect-line`) | yes | yes |
| 9 | same as 8 | anything else | echo (**today this publishes**: hole 1) | no | yes |
| 10 | a part with source `given`/`unknown`, not typed | a read of this run returned it (non-echo), or its words are in one line of the settled page | observed (`how: page-line`) | yes | yes |
| 11 | same as 10 | none | given; **partial if asked** (round 60) | no | yes (one-slot fallback, `referenceValue`) |
| 12 | a part with source `minted.text` | the capturing read ran (row 3) | observed | yes | yes |
| 13 | `lit` parts (the recording's text) around any of the above | every literal's words in one line of the settled page (round 53/55) | the class of its slots | as per the slots | one-slot fallback |
| 14 | same as 13 | a literal not shown | withheld | no | one-slot fallback (fwod74) |
| 15 | basis `model`, no slots (a pure literal) | the satisfied guard only: its words in one line of the judged page | observed (`how: page-line`) | yes | yes |
| 16 | same as 15 | otherwise | withheld | no | no |

**Notes on the table.**
- **Prose (daemon only).** The summary's observed bag is: page lines ∪ values of class `observed|committed` ∪ the instruction's words **minus the words of every value classed `given|echo|withheld`**. Any-length word runs, not `MIN_STALE_LEN`. This fixes disagreement 2.
- **`unansweredAsks`** counts only `observed|committed` as answers. An echo is no longer an answer (disagreement 6).
- **`partialReasons`** takes the classes: an asked output in class `withheld`(row 6) or `given`(row 11) is partial, as today. **Echo stays a warning, not partial.** This is round 55's documented reason: green apps echo by design.
- **The artifact computes the same verdict** and fails the test on PARTIAL only behind a flag, off by default, to avoid a runner-verdict change in one stage. It must at least **emit** `run.partial`.

### 3.2 Compile-time promise (the same table, statically)

`promisedSource(spec, chainParams) → 'always' | 'if-observed' | 'never'`, from rows 3-16 with evidence unknown:

- `'always'`:
  - a proven, non-empty read (row 3);
  - url/title (row 7);
  - a one-slot value whose slot is bound, for references (row 11's fallback).
- `'if-observed'`: the rest.
- `'never'`:
  - a pure recorded literal;
  - an unbound marker;
  - a template on a **non-last segment**. This fixes disagreement 3 by making compile agree with the runtime; alternatively the runtime could fill every segment's template, but that is a bigger change.

`templateSource`, `publishedOutputs`' template half, `unsourcedRef`'s template half and `literalOnlyAsks` all become `promisedSource`. The bound set is **one** function, `boundMarkers(segment, chain)`, used by all three callers (disagreement 4). `publishedOutputs` and `unsourcedRef` keep their deliberate difference on `unproven` reads, stated as a parameter rather than by accident.

### 3.3 Bind: a decision table (`skills/attribute.ts bindParam`, used by buildFlow, remapParams, recovery compile, ir.ts)

| Slot source | Flow param / binding | Never |
|---|---|---|
| `given.var` | `{{name}}` | a literal |
| `env` | `{{env:NAME}}` | a literal (leak) |
| `minted.url` by X ≠ consumer | `{{X.url.label}}` (X's route stored in `urlRoutes`) | a literal id of any length (fwsi3, fwsi2); a self-reference (fwec1) |
| `minted.*` by the consumer itself | a derived `{{dN}}` inside the skill, not a param (`ownUrlMints`) | a param |
| `minted.text` by X | `{{X.<capturing output>}}`, or a wildcard in expectations | a literal |
| `output` by X | `{{X.name}}` where X is the recorded producer (not "first producer by sort") | a ref to a later step |
| `url` (vocabulary) | literal | a ref |
| `given.instruction` | the literal the recording used, **stored per slot**, no regex split at export (fwod85) | a ref by coincidence |
| `constant.*` | literal; locator candidates carrying it are **kept** (fwod84) | stripped as a run value |
| `ambiguous` | the precedence of §2.3; an export warning names both | silently the first |
| `unknown` (old store) | today's path, with a count | identity on shape alone |

Text matching legitimately remains in three places. The design names them and does not pretend otherwise.

1. **Binding a free-text instruction to a template** (`bindSkill` for an ad-hoc `do`, `selectCandidates`). There is no stored source for words the caller has just typed. For a **flow** replay, params come from `FlowStep.params` + `paramSources`, so the regex is not consulted for sourced slots. `threadStepParams` is skipped for a param with a source.
2. **Attribution in n1 and in a recovery**, as §2.3 says: once, time-ordered, ambiguity recorded.
3. **Page-line evidence** (rows 10/13/15). The word-run-in-one-line test is inherently textual. It is also the weakest evidence, so `how: 'page-line'` is carried and reported.

### 3.4 What is replaced, subsumed, deleted

**Deleted.**
- **The typed exemption** in `unobservedGiven` (`typed.has(slot)`), and `typedSlots` as a static scan. The runtime ledger knows what it dispatched.
- **`MIN_ECHO_LEN` as a gate before the element rule.** The text key stays as a cheap pre-filter; below 5 characters the element rule decides instead of "not an echo".
- **`fresh`'s `MIN_STALE_LEN`** for withheld values. They are subtracted by word run.
- **The artifact's pre-action `noteCommit`** (emit.ts ~2480). It moves after the action and becomes conditional on the verified diff, as in the daemon. The daemon's own `noteCommit` also requires `confirmed` for the line.
- **The url-change commit when the change came from a set on the same control** (a debounced query). The url must change as a consequence of a non-set gesture, or a navigation.
- **compile.ts `originOfValue`**, and the mixed-spelling `known` map of server.ts ~2086. Both are replaced by `attribute`.
- **buildFlow's `replaceToken` over params**, and `originRef`'s url-only special case. Every sourced param goes through `bindParam`. `replaceToken` over the **instruction text** stays, for display, fed from `refs`.
- **`remapParams`' substring fallback** for sourced slots.
- **`slotKnownRunValues`' `p.example.trim() === entry.value`.** It becomes a match on source.
- **The three `iN` counters.** They become one `instructionOrdinal`.

**Subsumed; kept as a thin wrapper, then removed.**
- `templateValue` / `unobservedGiven` / `withheldAsGiven` / `givenWarning` / `referenceValue` become `classify` + `Published.why`. Their literal and one-slot helpers (`templateLiterals`, `unshownLiterals`, `templateSlot`) survive as row 13/14 internals.
- `templateSource`, the template halves of `publishedOutputs`/`unsourcedRef`, and `literalOnlyAsks` become `promisedSource`.
- `derivesFromParams` (a regex over the template string) is replaced by `parts` with sources, for stores that have `reportSpec`. It is kept for legacy stores.
- The echo module keeps its element machinery (`markActed`, `echoAt`); `echoVerdict` becomes a row of `classify`.

**Kept, deliberately.**
- `observedSummary`'s clause cutter (a text problem by nature).
- `shownForReport`.
- `slotActs`.
- `routeAt` / `visitedUrlPart`.
- `mintedAhead`.
- The `basis`/variance machinery.
- Shape tests (`looksLikeId`, `idPositionPart`, `pathIdPart`) as **proposers inside `attribute` for mint detection**. Deciding that a url part is a record id still needs position or landing evidence, and for an `unknown` source, shape. What changes is that the verdict is made once and persisted, instead of in five places (§1B), and `referencablePart`, `addUrlIds`, `discoverMinted` and `mintedShape` read it.

**Where one model does not simplify.**
- Mint detection is still a heuristic over url diffs. The design removes the five-way disagreement, not the heuristic.
- The read-back cascade (agent/readback.ts) still finds the model's value on the page by text in n1. That is how an observation gets its element.
- Fused composites (fwgt8/fwsi8) and eval-sourced values (fwgt10) have no element to attribute. The best the model can do is say `basis: model` early, at export, as a named error, instead of at runtime.
- Evidence **collection** is still two implementations: replay.ts and the emitted runner. `classify` being shared does not make the inputs equal. Parity tests must cover collection: element marks, commit timing, diff confirmation.

---

## 4. Past failures: handled by construction?

"By construction" means the failure cannot be expressed once the tags exist. "Same rule" means the design keeps an existing fix under the policy without making it stronger. "No" means it is out of scope or still inference.

| Failure | Class | Verdict | Why |
|---|---|---|---|
| fwgt11 07-add ("bug" published beside live priority-high) | A | **Yes** | `reportSpec.basis = read(labels…)`: the value is never slotted as `{{v7}}`. If the model-only path applies, the source is `given` and needs evidence (row 11). The prose subtraction also removes "bug" (today it survives). |
| fwrd86 (literals around slots, "of 13", a date) | A | Same rule | Rows 13/14 are round 53/55's page-line check. Provenance cannot make a recorded literal observable; it can only label it `recorded`. |
| EspoCRM close_date withheld (round 53 over-withholding) | A | Same rule | Fixed in round 55 by words not punctuation. With `basis: read` the value would publish by row 3 without the literal test at all, which is **strictly better** when a read exists. |
| fwec8 record id frozen; orphan `{{v2}}` | A/B | **Yes** | `minted.url` by 02-create is a part source; an unbound marker is row 1 / `'never'` in `promisedSource` with one bound set. |
| fwec11 "Admin" vs typed "admin" | A | Mostly (already fixed in round 59) | Row 3/4. Different steps and element-scoped. The typed ledger knows its step exactly. It is still a value comparison at the core, which is inherent. |
| fwgt10 (titles taken by eval; literal withheld) | A | **No** (honest) | There is no element to attribute. The design turns it into `basis: model` → an export error "asked output has no observable source", which is `literalOnlyAsks` made total, including the slot+literal shape it misses (disagreement 7). The recorder must produce a read. |
| fwgt8 / fwsi8 fused "title (#1)" composites | A | No | Same: model formatting. `parts` covers the split case (round 56), not a fused one with no element. |
| fwop11 / fwkb40 (unproven read made partial) | A | **Yes** | Row 6 counts only reads with `unproven` cleared by **their own** resolution. It also fixes `settleUnprovenReads`' proof-by-name (disagreement 9) by proving the read, not the name. |
| fwrd88 (count read of nothing skipped, not "0") | A | No | Runner semantics (fixed in round 56). |
| fwkb39 ("Backlog " trailing space) | A | No | Normalization (fixed in round 55). |
| fwgh4 (template output only the daemon published) | A | **Yes** | One `promisedSource` used by both; row 11's fallback is the same in both runners (it already is). |
| fwod82 (ambiguous read-back; the instruction named it; referenced an unpublished output) | A/B | Partially | Source `given.instruction` for 04-change's use (the instruction named it), so no ref to an unpublished output: `bindParam` writes the literal given value. The missing read is still a recorder limit. |
| fwsi3 (flow param stayed literal "4" though the skill slot was `url:i3:p1`) | B | **Yes** | `paramSources[v5] = minted.url(03-create,p1)` → `{{03-create.url.p1}}`, independent of value or length. |
| fwsi2 (one-digit id below the path floor) | B | **Yes** once attributed | A sourced value has no floor. The floor survives only in `attribute`'s proposer for an unattributed part. |
| fwsi7 (goto to a record nothing showed; never banked) | B | Partially | Round 55's "unseen goto = landing" rule moves into `attribute` as a time-order fact, one implementation instead of three. The rule itself is unchanged, and still a judgement. |
| fwod84 (option code stripped by its shape) | B | **Yes** | `constant.offered`, by order; strip membership by source, not `kind`. |
| fwod85 (lazy regex split "Cabinet with Doors") | B | **Yes for flows**, no for ad-hoc `do` | Params are stored per slot with sources, and `threadStepParams` is skipped for sourced params. A free-text `do` still goes through `bindSkill`. |
| fwgh14 (url id visited mid-step, not an output) | B | **Yes** with the recorder `urlTrail` | `minted.url` by 02-create at h2 with its route; today it is reconstructed from `diff.url` plus the runtime trail. Old recordings lack the trail and keep the round-60 reconstruction. |
| fwec1 (self-reference: own minted url id as own param) | B | **Yes** | `bindParam`: X must precede the consumer; the consumer's own mint → `{{dN}}`. |
| fwrd85 (RD-1015 frozen in goal/report/key) | B | **Yes** once attributed | `minted.text` by 02-create; goal, expectations, keys and reports are slotted by source. Detection is still `textMints`' inference. |
| fwrd87 (04-add publishes Part A's name via a recorded row id) | A/B | Partially | The read's **scope anchor** needs a source (slot) to count as scoped. An unsourced frozen anchor → evidence `read` with `scoped: false`, which the policy can treat as not observed for a value whose part source is `given`/`minted`. This needs a locator-level source, a stage-4 item. |
| fwgh8 (seed titles as output keys) | B | Yes | Keys renamed by source (`runValueKeyRenames` over sources, not tokens). |
| fwkb41 ("4" shown as "#4", `task_id=4`) | B | Partially | `minted.url(q.task_id)` by origin (round 57); "#4" vs "4" is a read-core issue. |
| fwod78 (rule G: a post-login hash filling in taken as a mint) | B | **No** | Mint detection is inference; it is the same heuristic, in one place. |
| fwod79 / fwrd83 (literal password), fwrd85 PWD | B | Partially | `inputType` removes the daemon/compile disagreement for ambiguous values. The PWD rule is env-name logic, unchanged. |
| round 53 "named alternatives" (a Draft or Closed status) | B | Yes | `given.instruction` for 06-delete; never a ref by value coincidence. |
| round 55 fwrd48-51 `unbound-slot` | B | Same | `bindParam` gives the same diagnostic; nothing new. |
| fwec10 (silent wrong amount appended) | — | No | Runner typing semantics. A report of Amount read back from its own field **would** now be an echo (row 4, any length), instead of observed. |

In total, of the brief's twelve: eight **yes**, three **partially** (fwsi7, fwod85 for ad-hoc `do`, fwrd86 same rule), and one **no** (fwgt10). The honest summary is that the design removes the *binding* failures structurally and the *typed-value* publication holes entirely. It does not create observations the recorder never made.

---

## 5. Risks

1. **Over-withholding typed values (the largest behaviour change).**
   - Rows 8/9 stop publishing a typed slot as a finding unless a hard effect line verified in this run's diff shows it (or a read outside the widget after a commit).
   - Any sweep objective that scores `finalText` for a typed value (the "report the title you created" kind) could flip. fwec8's obj 7 checks a **minted** id, so it is unaffected.
   - **Mitigation.** Rows 5/8 promote to `committed` on real evidence, and the common create → row appears case has a hard slotted line (round 51 made those hard).
   - **Measure before shipping** (§6): the count of stored template values that are typed-only, and how many have a later hard line carrying the slot in the same chain. Those are safe; the remainder is the exposure.
2. **Over-withholding short echoes.** Dropping the `MIN_ECHO_LEN` gate means a short typed `"3"`, read afterwards from a **different** element before any commit, is now an echo (withheld). Today it is observed.
   - That is a false negative on coincidence, and the comment on `MIN_ECHO_LEN` names exactly this worry (the fwgr "1m" refresh).
   - Mitigation: below 5 characters, only the element rule (read **at** the control/widget) makes an echo; the "no commit" leg applies only to ≥5-character values. This keeps today's behaviour for unrelated elements and closes the same-control hole.
3. **Round-53-style over-withholding by page-line.** Rows 10/13/15 keep the word-run-in-one-line test, and the EspoCRM close_date case shows how it misfires on joinery. `basis: read` bypasses it whenever a read exists, which shrinks its reach. `how: 'page-line'` is reported so the bench can count it.
4. **Attribution is now load-bearing.** A wrong ambiguity resolution in `attribute` binds a slot to the wrong producer in every artifact downstream. Today the error is spread thin across five re-derivations. Mitigation:
   - ambiguity is persisted and warned;
   - rebuild-flow A/B on every n1 recording (§6);
   - `ambiguous` never resolves to identity.
5. **Migration churn.**
   - Optional fields, no contract bump, legacy derivation for `unknown`. Artifacts compiled before the change keep their embedded runtime, so no churn there.
   - Churn falls on the **bench readers** (`run.published` instead of `outputs`) and on **parity tests** asserting `outputs` contents. Budget one stage for it.
   - The flow file gains `paramSources`/`refs`; old flows lack them and keep today's `threadStepParams` path. That leaves two code paths for a while; §7 stage 4 removes the old one only after the corpus has re-exported.
6. **The runner-verdict change in the artifact.** Making the artifact fail on PARTIAL changes the spec's pass/fail, and so what the sweep calls green. Keep it behind a flag with only `run.partial` emitted until one confirmation round shows no new failures.
7. **Performance.**
   - `classify` is pure and trivial.
   - The runtime ledger adds nothing beyond today's `markActed`/`echoAt` calls, which already run per set and per read.
   - Commit proof from the verified diff reuses `expectedChangesVerdict`'s `confirmed`; no extra capture.
   - `shownForReport` is taken no more often than today (only rows 10/13/15 need it).
   - `attribute` is O(values × entries) at export: milliseconds on a script.jsonl. rebuild-flow already runs a superset.
   - Recorder `urlTrail` is a listener that already exists at runtime (browser.ts `urlTrail`).

---

## 6. Measurement on stored data, before any sweep

Everything here needs no browser and no model.

1. **Static class census (corpus-check lint `provenance-classes`).** For every published store, run `promisedSource` plus a static classifier over each report key:
   - basis read/url/model;
   - part sources typed/given/minted/recorded/unknown.

   Emit per app:
   - (a) **typed-only template values**, i.e. hole 1's exposure;
   - (b) of those, how many the same chain covers with a hard slotted expectation line after a click/press, i.e. the rows 5/8 safety margin;
   - (c) template values on non-last segments that compile counts today (disagreement 3);
   - (d) `unknown` counts.

   This runs in corpus-check's existing ~1-5 minutes. It directly sizes risk 1.
2. **rebuild-flow A/B for attribution (stages 2-3).** Re-export every `results/fw*` n1 script.jsonl with `attribute` + `bindParam` against the current export. Diff:
   - `crossStepRefs`;
   - literal params that became refs;
   - refs that changed producer;
   - `ambiguous` counts;
   - `unbound-slot` diagnostics.

   Expected: fwsi3 `v5 → {{03-create.url.p1}}`, fwod85 `v9/v10` bound, fwgh14 `v3 → {{02-create.url.h2}}`, fwec1 no self-ref. Any ref **lost** needs a named reason (round 53's 602 → 600 was audited this way). `REBUILD_STORE_DIR` + corpus-check then compiles the re-exported stores: status changes vs the r59c/r60 baseline must be zero or explained.
3. **Replay the round-60 report decisions offline.** For n2/n3 runs whose published results carry the step records (`values`, `echoed`, `given`, `warnings`), recompute each key's class from the stored spec plus the recorded evidence where it exists. Where the page was not stored, give the upper and lower bound.
   - This will show that fwgt11's "bug" is withheld, and how many values of **green** runs change class.
   - The expectation is that green runs change only from observed to echo on typed-only values. Each should be listed and read.
4. **Parity fixtures before code (stage 1, test-first).** New cases in `test/execution-parity.test.ts`, each failing on round60:
   - (i) a typed title reported via template with the save failing silently: both runners must not report it as observed;
   - (ii) a 3-character value read back from its own input: echo in both;
   - (iii) a skipped optional commit click: the artifact must not count a commit;
   - (iv) a consumed given key in the artifact: `run.published` class `given`, not a finding;
   - (v) a debounced search url change: not a commit.

   Controls: a save that adds the row, where the value is committed and reported in both runners.
5. **The existing gates stay green:** corpus-check against `bench/corpus-known.json`, `test:parity` targeted cases (per memory: the full parity suite is opt-in), and verify-artifacts.

---

## 7. Staged migration, smallest valuable first

Each stage is its own branch off main, cloud-verified (suite + browser + targeted parity + corpus) before merge, per the local-machine-light rule.

**Stage 0: census, no behaviour change (1 small branch).**
- `execution/provenance.ts` with the types, `classify` and `promisedSource`, **unused by the runtime**.
- The corpus-check `provenance-classes` lint (§6.1).
- Unit tests over fixtures from fwgt11, fwrd86, fwec8 and fwec11 stores.
- Output: the exposure numbers for risk 1. Go/no-go for stage 1's rows 8/9.

**Stage 1: runtime classes in both runners. This answers the false-positive question.**
- The runners record `Evidence` per key:
  - the typed ledger from the fills they **dispatched**, not a static scan;
  - element facts from the existing `markActed`/`echoAt`;
  - commit proof from `confirmed` diffs, after the action, in both runners;
  - url.
- Both publish through `classify`:
  - daemon: `ReplayReport.published`, with `report.evidence.values` = observed|committed;
  - artifact: `run.published`, `run.partial`; `outputs` unchanged as the reference map.
- Holes 1-4 of §0 close, and the prose subtraction lands.
- Tests: §6.4's parity cases, plus the existing report-given / report-provenance / execution-echo / execution-report suites updated. The `unanswered` answer set changes (echo is no answer).
- Bench: verifiers that read findings switch to `run.published`.
- **After this stage the claim holds, in both runners: a value the replay typed is reported as observed only when this run read it outside the control after a commit, or a hard line showed it in this run's diff after a commit gesture.**

**Stage 2: one attribution, sources on params and flows (theme B's core).**
- `skills/attribute.ts`, one `instructionOrdinal`.
- `SkillParam.source` written at compile (`originOfValue` deleted), `FlowStep.paramSources`/`refs` written by buildFlow via `bindParam`.
- Replay and ir.ts use sources when present and skip `threadStepParams` for them. `ir.ts replayBinding` resolves sourced slots from outputs instead of `known={}`, which closes the unbound-pin parity gap.
- Tests: rebuild-flow A/B (§6.2) as a checked-in fixture set (fwsi3, fwod85, fwgh14, fwec1, fwod84, fwrd85) with exact expected params; corpus 0 status changes, or each explained.

**Stage 3: report specs at compile.**
- `Skill.reportSpec` with `basis` and part sources; `reportSub`'s text substitution applies only to `basis: model` values.
- `promisedSource` replaces `templateSource`, the template halves of `publishedOutputs`/`unsourcedRef`, and `literalOnlyAsks`. One `boundMarkers`. Non-last-segment templates become `'never'`, or the runtime fills them; decide from §6.1(c)'s count.
- Tests: compile/runtime mismatch count over the corpus, which round 53 measured at 4 → 0 and must stay 0; fwgt11 fixture; unsourced-ref diagnostics unchanged or explained.

**Stage 4: delete the value-matching binders for sourced values.**
- buildFlow's `replaceToken` over params.
- `remapParams`' substring fallback.
- `slotKnownRunValues`' example match.
- `stripLeakedCandidates` membership by source (`constant.*` kept).
- `tokenPattern` no longer consulted for sourced values.
- Mint verdicts are read from `attribute` in `referencablePart`, `addUrlIds`, `discoverMinted` and `mintedShape`.
- Locator scope anchors carry a source (fwrd87).
- Old flows without `paramSources` still take the legacy path until a corpus re-export shows parity; then the legacy path is deleted.

**Stage 5: recorder facts.** `inputType` and `urlTrail` on `RecordedStep`. This is only needed for new recordings. It can land any time after stage 2, and earliest if a new credential or visited-url case shows up.

**Order rationale.** Stage 1 is independent of stages 2-4. Its inputs are runtime facts plus today's stored templates, and legacy templates are classified with `unknown` sources, which by row 10/11 is today's rule without the typed exemption. So the user's question is answered first and cheaply. Stages 2-4 are where "provenance decides, never the shape" becomes true for binding, and they need the census (stage 0) and the rebuild A/B (§6.2) to be safe.
