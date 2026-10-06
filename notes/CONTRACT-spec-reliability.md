# Contract: compiled-spec reliability, items 1-4

Branch `feat/spec-reliability` (from main e34fd2d7). Evidence: `notes/COMPILED-SPEC-FAILURES.md`
on `bench/heldout` (`git show origin/bench/heldout:notes/COMPILED-SPEC-FAILURES.md`). Headline:
compiled specs fail where flow replays needed the model (spec clean 132/144 sweeps when replays
were model-free, 24/87 when they were not). The replay survives a wrong gate by calling the model,
labels the step tier A, writes nothing back, and compile ships the procedure anyway.

Ground rules for every module:
- General mechanisms decided by recorded evidence, never per-app shapes or app names.
- Old stores keep today's behaviour: a field that is absent means "no evidence", never a refusal.
- Both runners (daemon replay, compiled artifact) must decide the same way where a verdict is
  shared; shared verdicts live in `src/execution/*` (embedded verbatim into the spec by
  `src/spec/runtime-source.ts`).
- Local testing: targeted vitest files only (`npx vitest run test/<file>`), fixtures only, no app
  containers, no Docker. Browser tests (`BP_BROWSER_TESTS=1`) for a single file are fine. Do not
  run the full suite or the parity suite. `npm run build` is shared; a sibling module may be
  mid-edit, so ignore type errors in files you do not own and re-run.
- Never `git stash`, never `git checkout` other branches, never commit — the lead commits.
- Comments match the codebase: say why, cite the sweep evidence (hsdx1, hsbs2, …).

The two new diagnostic codes are already in `src/spec/diagnostics.ts`: `unproven-pin`,
`unchecked-commit`.

---

## Item 1 — learn from recoveries (owner: agent A)

Files: `src/skills/replay.ts` (stop-gate plumbing only), `src/execution/toggle.ts` +
`src/execution/gates.ts` (only if a verdict must return its line/pattern), `src/skills/store.ts`,
`src/daemon/server.ts` (flow runner, around the `harmlessStop` block ~2240-2300, and the place
`result.skill` is built ~3100-3230), `src/agent/loop.ts` (the skill-result type, ~325-345),
`src/spec/ir.ts` (the chain-member loop next to `demoted-pin`, ~553), tests
`test/learn-recoveries.test.ts` (new).

1a. **Which gate stopped.** `ReplayResult.stopGate?: StopGate` and the same on the instruction's
skill result (`InstructionResult.skill.stopGate`), set only when an EXPECTATION gate stopped the
replay after a step ran:
```ts
export interface StopGate {
  skill: string;          // the segment (skill id) whose step stopped — chained replays name the member
  step: number;           // 1-based top-level step index in that skill
  kind: 'hide' | 'url' | 'added';
  line?: string;          // hide/added: the recorded line (as stored, markers unfilled) that failed
  pattern?: string;       // url: the stored urlPattern
}
```
Refusals (start gate, identity), locator misses and assertion misses carry no `stopGate`.

1b. **Relax a gate a harmless stop proved wrong.** New `SkillStore.relaxExpectation(id, gate,
now)`: in one `update` transaction remove the failing line from that step's `expect.removedContains`
(hide) or `expect.addedContains` (added), or delete `expect.urlPattern` (url). Refuse (return null,
change nothing) when: the step is an assertion (`step.assert` or `skill.assert`), the expectation
has `removalRequired`, the line/pattern carries a slot marker `{{v`/`{{d` (a HARD identity line),
the step carries a page effect (`stepEffect`), or the line is no longer there. On change: append
`provenance.contractChanges` `{ at, by: 'harmless-stop relaxation', gave: [<human sentence naming
the line>] }`, delete `stats.verifiedContract`, set `stats.stopStreak = 0`, increment
`stats.relaxations`. The daemon flow runner calls it when `harmlessStop` is true and
`result.skill.stopGate` is present (learn mode only), and prints a progress line
`[flow X] 05-set: relaxed s_2731b5 step 4 — <kind> "<line>" stopped a replay the recovery proved
harmless`. Target cases: hsdx1 `s_2731b5` step 4 (hide line with a timestamp), hsbs2 `s_7db6d8`
step 5 (hide `textbox "Tag Name"`), hsml1/hsml2 (url `?search={{v1}}` credited to a Clear click).

1c. **Stop streak.** `SkillStats.stopStreak?: number` — consecutive replays ending in a stop of
any kind (strike, harmless, recovered) since the last clean full replay or the last relaxation.
`recordOutcome`: `ok` (observed or not) → 0; `!ok` → +1 (whether or not it strikes). Absent on
old stores and on a fresh recording.

1d. **`unproven-pin` at compile.** In `flowToSpec` (ir.ts), for every chain member with
`stats.stopStreak >= 1` and not already reported `demoted-pin`: severity `error`, `fix`/`action`
the existing `rerecordFix`/`rerecordAction`, `what`: "its pinned procedure <id> stopped at step N
on its latest replay and has not replayed clean since — a compiled spec would stop there",
`why` from the stats (failedAtStep, harmlessStops, recoveredStops, stopStreak). The existing
`allowDemoted` override also admits these (same flag, documented). Severity error makes
`compileFlow` refuse, which is what items 4 and the bench need.

1e. Flowrun honesty: a step whose pinned replay stopped and the model finished keeps `tier: 'A'`
for compatibility but gets `pinStopped: { skill, step, why }` in its step result, so reports can
count it as model-assisted. (Find the FlowStepResult type; add the optional field.)

## Item 2 — calibrate checks with cross-run evidence (owner: agent B)

Files: `src/execution/expect.ts` (line matching / `expectedChangesVerdict`), `src/execution/text.ts`
(if a mask helper is needed), `src/skills/replay.ts` (the `expectedChanges` gate ~2190+ and the
`generalisations` type — coordinate: agent A edits other regions of this file),
`src/agent/tools.ts` (~735, where confirmed generalisations are persisted), `src/spec/locators.ts`
+ `src/spec/emit.ts` (only `observationSource` / the retired-candidate emission), tests
`test/cross-run-calibration.test.ts` (new).

2a. **Bake candidate retirement into the artifact.** The daemon reorders a chain by `seen`
evidence (`retired()` in `src/skills/repair.ts:683`; replay's resolve policy). The compiler has the
same evidence in the store at compile time, so emit it: an observation whose candidate is
`retired()` carries `retired: true` exactly as replay passes it to the shared `resolveCandidates`,
so both runners order the chain identically. Update the emit.ts/locators.ts comments that say the
artifact "cannot mirror" retirement. Check the shared policy reads the field the same way.

2b. **Text generalisation for expectation lines** (mechanism 2, applied to page lines the way
url generalisation applies to url segments). In the shared verdict: when a recorded ADDED line is
missing and a live line differs from it only in tokens that (i) each contain a digit, (ii) are not
a filled slot value or substring of one, and (iii) leave at least one alphabetic word of the line
unchanged and the role prefix identical, treat the line as matched WITH a warning and return the
generalised line (differing tokens → `{{*}}`, via the existing wildcard `WILDCARD` in text.ts).
Never for a line carrying a slot marker (HARD lines stay hard). Daemon: stage it as
`{ kind: 'line', step, from, to }` in `generalisations`; persist in tools.ts only once the replay
got past that step (same rule as `expect` generalisations), with a `contractChanges` entry
`by: 'replay line generalisation'`. Artifact: warns and continues (no persistence). Cases:
relative times, counters in a name ("Inbox 3"), one-digit "#4", minted numbers in a heading
("S00022"); see T1 in the survey.

## Item 3 — no silent passes (owner: agent C)

Files: `src/spec/emit.ts` (the PARTIAL emission ~3700-3721, the test epilogue, outputs), `src/spec/ir.ts`
(new `unchecked-commit` lint — a separate function called once from `flowToSpec`; agent A edits
the chain-member loop, so add yours AFTER the steps loop), `bench/spec-replay.mjs`, tests
`test/no-silent-pass.test.ts` (new).

3a. **PARTIAL fails the spec.** Where the artifact logs `PARTIAL — …` for an asked output, also
push onto a run-level list; at the end of the test throw
`Error('PARTIAL: <step>: <reason>; …')` so Playwright fails. Parity: the daemon already fails the
step (`server.ts` partialReasons). Opt-out env `SITELOOPER_ALLOW_PARTIAL=1` for users who want the
old behaviour.

3b. **Typed outputs file.** The artifact writes its findings (`outputs` minus `run.referenceOnly`)
as JSON to `process.env.SITELOOPER_SPEC_OUTPUTS` when set, and always attaches them to the test
(`test.info().attach('outputs', …)`). `bench/spec-replay.mjs` sets the env var to
`<out>/<tag>-spec-outputs.json` and, so the verifiers can score report objectives instead of n/a,
writes them into the spec arm's result file in the shape the verifiers already parse (read
`bench/verify-*.mjs` / their shared helper to find it — a `finalText` with `key: value` lines or
`report.evidence.values`; prefer what the verifiers read today).

3c. **`unchecked-commit` warning.** At compile, a mutating step's last segment whose COMMIT
gesture (the last click/press in a segment that also fills/types/selects) has no expectation at
all — no `urlPattern`, `addedContains`, `removedContains`, or `alertContains` — and no later
step in that segment reads anything: severity `warning`, naming the step and gesture, `fix`:
"add an assertion with `sitelooper assert` or re-record". (Example: hsbs1 move into chapter.)

3d. **Persistence probe** (artifact only, opt-out `SITELOOPER_NO_PROBES=1`). For each step whose
commit carries a HARD added line (a line with a slot marker — the recording saw the typed value
displayed after the save) AND whose end url carries a record identity (the step mints, or its
expectation url carries a `{{d…}}`/`{{v…}}` id), record `{ step, url: <the live url after the
step>, lines: <those hard lines filled> }` during the run. After the last step, for each probe
`goto` its url, wait for content (the same settle the artifact uses after navigation), and require
every line to show (`lineShows` over a fresh capture, the step's dialect). A miss throws
`Error('persistence: <step> typed <value>, the record at <url> does not show it after reload')`.
Run probes after all steps so they cannot disturb the flow.

## Item 4 — compile → check → re-record as one command (owner: agent D)

Files: `src/spec/converge.ts` (new), `src/cli.ts` (`build` only: a `--converge [N]` flag;
`rerecordFlowCommand` may be refactored into a callable function in place, keeping the CLI
behaviour), `docs/` or README usage line for `build --converge`, tests `test/build-converge.test.ts`
(new, with the check/rerecord runners injected as seams — no browser, no app).

`sitelooper build <flow.json> --converge [N=3] --reset-cmd "<cmd>"`:
1. compile (honouring `--allow-demoted` only if given). Refused with `rerecord` actions → re-record
   the EARLIEST named step (`rerecord <flow> <step> --runs 2` semantics), recompile.
2. Compiled → run the spec once with `runSpecCheck` after `--reset-cmd`. Pass → readiness as
   `build` does today, done.
3. Spec failed → name the step from the FAILURE SITE only (`errorSite` / `findStepAnchor` in
   check.ts); never from a `[sitelooper drift]` line; a check that only timed out is not a step
   failure (report and stop). Re-record that step, recompile, go to 2.
4. Stop after N rounds, or after two refused re-records of the same step. Every round's verdicts
   in `--json` (`rounds: [{ compile, check?, rerecord? }]`) and a one-line text summary per round.
Port the lessons from `bench/converge.mjs` (read its header and `bd3ceff1`), but no repair drain:
re-record is the only model-using action. Without `--converge`, `build` is unchanged.

---

## Lead's verification plan
- Each agent: targeted unit tests for its module, green.
- Lead: `npm run build`, the new tests plus the existing files touching changed code, corpus-check
  (`node bench/corpus-check.mjs --no-fetch --baseline bench/corpus-baseline.json`) — expect
  `unproven-pin` to appear only on stores that carry `stopStreak` (none of the published ones), so
  the rate must not move.
- Cloud: verify routine (suite, browser, parity, corpus), then a held-out-style sweep on NEW apps to
  measure (the three held-out apps are spent as evidence for the design).
