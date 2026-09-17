# corpus-check — a convergence metric that does not depend on luck

## Why

A fresh cloud sweep re-records, so every round samples a new flow shape from an LLM recorder and
exposes a different latent defect. With a per-app clean rate near 50%, four apps all green is ~6%
by luck, and the number cannot tell a fix from noise. Seven rounds of fresh sweeps did not converge
for exactly this reason.

The published `results/fw*` branches (341 at the time of writing) are a **fixed corpus**: every flow
shape the recorder has ever produced, each with the store it was recorded against and the compile
log produced at the time. Compiling all of them at one commit is a measurement with no sampling in
it. A fix either moves the number or it does not.

This is a **compiler metric**. It never opens a browser, never calls a model, never runs a spec.
`compiled` means the compiler was willing to ship an artifact — not that the artifact passes. The
static lints cover the runtime defect classes we *know* have a signature in the store; they cannot
see classes we have not met yet. Periodic fresh sweeps remain the way new shapes enter the corpus.

## Usage

```
node bench/corpus-check.mjs [--apps rd,od,gr,kb] [--limit N] [--since fwrd50]
                            [--jobs 2] [--baseline <file>] [--out <file>]
                            [--at <commit>] [--no-fetch] [--compile-only] [--quiet]
```

| flag | meaning |
| --- | --- |
| `--apps` | restrict to these apps (`rd` repairdesk, `od` odoo, `gr` grafana, `kb` kanboard) |
| `--limit N` | first N branches in ref order (use for smoke runs) |
| `--since <runid>` | only runids numerically ≥ this |
| `--jobs N` | concurrent compiles; default 2 — this is memory-bound, do not raise it on a small box |
| `--baseline <file>` | diff against a prior `--out`; **exit 1 on regression** (see *The gate*) |
| `--out <file>` | write the full per-branch JSON report |
| `--at <commit>` | build that commit in a temporary `git worktree` and measure there; lints unavailable at that commit report `n/a` |
| `--no-fetch` | use the `origin/results/fw*` refs already local; otherwise fetches first |
| `--compile-only` | skip the lint pass |

Read-only against the repo and origin. Results branches are never checked out; each branch's flow
and store are read with `git archive` into a temp dir that is removed when the branch is done.

Before a run after touching `src/`: `npm run build` — the lints import from `dist/`.

## Reading the report

**Header** — `N branch(es); I incomplete; K known-unfixable`. *Incomplete* = no flow or no store on
the branch (very early runs). *Known* = listed in `bench/corpus-known.json`; reported, not scored.

**compile rate** = compiled ÷ scorable, where scorable = branches − incomplete − known. This is the
headline number.

**refusal kinds** — parsed from the compiler's own diagnostics: `demoted-pin`, `unsourced-ref`,
`unproven-source`, `unbound-pin`, `no-procedure`, and so on. A branch can carry more than one.

**movement against the branch's own compile log** — each branch is compared with the compile log
that was published *at the time it was recorded*:

| verdict | meaning |
| --- | --- |
| `fixed` | refused then, compiles now — a fix reached this shape |
| `still-refusing` | refused then, refuses now |
| `newly-refusing` | **compiled then, refuses now — a regression** |
| `unchanged-ok` | compiled then, compiles now |
| `no-record` | the branch carries no compile log (older runs) |

Kinds may have been renamed between commits, so movement is judged on refused-vs-compiled only,
which is exact.

**lints** — pure functions from `dist/` run over every skill in every store. Each is the static
signature of a runtime defect found on the bench, with the branches that first showed it:

| lint | signature of | known positives |
| --- | --- | --- |
| `gate-before-goto` | `segmentGate` lands before a later `goto` — the page gate asks the page being left | fwrd51 s_b1a0cd, fwrd65 s_615743, fwrd68 s_bfc33c |
| `frozen-literal` | an `addedContains` line `unfreezeExpectations` would rewrite, given the `published` list compile actually builds. Rebuilt from the store as: the labels of every read step across the skill's chain, looked up in the chain's `reportTemplate.values`, literal values only. (Not the flow's `recorded` block, and not the chain's whole `reportTemplate.values` — both are supersets that masked lines the real rule never touched and made a fix that held read as one that had not.) Detected by diffing the lines, not by notes: arm 1 rewrites before the note loop looks. | fwod60 s_292da2, fwrd65 s_ca1263; **0** on fwkb23, fwrd68, fwgr53, fwod61, fwrd69 (recorded after b5f548e) |
| `own-output-slot` | a `known` slot bound `output:i<N>` / `url:i<N>` where N is the skill's **own** instruction index — the fwod61 shape the ledger filter removes. Judged on the binding directly, not via `remapParams` (which also reports every legitimate `i<earlier>` binding as unbound). The index comes from the pinning step for a pinned chain, and for an unpinned skill from `provenance.instruction` matched against the flow steps' instructions with `{{…}}` rendered. (fwod60 s_efdd23 was once listed as a positive: its `output:i2` is an earlier step's value, and it was recorded against 03-create — that defect is selection offering a step-3 recording to step 2, not this one.) | fwod61 s_94a113; **0** on fwrd69 (recorded after 6d37ab0) |
| `demoted-pin` | a flow step whose compiled chain contains a demoted member | any `demoted-pin` refusal |
| `dead-read` | a read with `unproven: true` and an empty locator chain — publishes nothing | fwkb20 s_38957a |
| `frozen-locator-id` | a `css`/`testid`/`id` rung embedding an identifier the recording provably minted, not slotted. *of which primary* = rung 0, which is fatal; the rest are latent | fwrd69 s_5d8ea4, s_4eb9e5 |

`frozen-locator-id provenance` says where "provably minted" came from: the branch's mutation log
where present, else the fallback named. Every lint is keyed on provenance, never on what a string
looks like.

**newly-refusing / fixed** — the two lists at the bottom name the branches, so a regression is
never a bare count.

## The gate

```
node bench/corpus-check.mjs --no-fetch --baseline bench/corpus-baseline.json
```

Exit 1 if any branch is `newly-refusing` relative to the baseline, or any lint total rose. Exit 0
prints `PASS — nothing newly refusing, no lint total rose.` Run it before every commit that touches
`src/skills/`, `src/spec/` or `src/execution/`.

When a fix legitimately changes the numbers (a lint total *falls*, branches move to `fixed`),
refresh the baseline with `--out bench/corpus-baseline.json` in the same commit.

## Retrospective

`--at <commit>` measures a past commit in a worktree. Running it across a series of commits shows
whether a stretch of fixes actually moved the compile rate — which is the question fresh sweeps
could not answer.

First run, rounds 15–21 (compile-only, 150 scorable branches):

| commit | round | compiled | demoted-pin | unsourced-ref | unbound-pin | no-procedure | unfilled-slot |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 53fe40d | 15 | 76 (50.7%) | 35 | 23 | 10 | 1 | 19 |
| 0890084 | 16 | 76 | 35 | 23 | 10 | 1 | 19 |
| 1babf90 | 17 | **86 (57.3%)** | 35 | 23 | 10 | 3 | **0** |
| 44063ed | 18 | 86 | 35 | 23 | 10 | 3 | 0 |
| 2ed914a | 19 | 86 | 35 | 23 | 10 | 3 | 0 |
| b5f548e | 20 | 86 | 35 | 23 | 10 | 3 | 0 |
| 6d37ab0 | 21 | 86 | 35 | 23 | 10 | 3 | 0 |

**How to read a flat line.** The compile rate sees only compile-time changes. Round 17's
`unfillableStep` fix was a compile-time gate and is the only commit that moved it. The other six
rounds changed what gets *recorded* (learn-time) or what the artifact *does* (run-time), and an old
store carries the pre-fix shape by construction — `demoted-pin` and `unsourced-ref` are facts about
the published store's contents that no compiler change can alter. So:

- the compile rate is the **regression gate**: a compile-time change that breaks a shape shows here
  immediately;
- **progress on learn-time fixes shows only on branches recorded at or after the fix** — score
  them with the lints and `--since`;
- **progress on run-time fixes shows in the lints across the whole corpus** where the defect has a
  static signature — `gate-before-goto` went 3 → 0 at 6d37ab0 while the compile rate did not move.

A fix that changes none of the three is a fix the corpus cannot see, and needs a fresh recording to
show it did anything.

The worktree reuses the checkout's `node_modules` through a junction, and builds with the
checkout's own `tsc` by absolute path (never via PATH). **Cleanup unlinks that junction with
`rmdirSync` and asserts the real `node_modules` is unchanged before git is allowed to remove the
worktree** — on Windows `git worktree remove --force` follows a junction into its target, and an
earlier version of this tool emptied the checkout's `node_modules` that way. If cleanup refuses,
it says so and leaves the worktree; `git worktree list` / `git worktree prune` after removing the
link by hand.

## Growing the corpus

Sweeps publish `results/<runid>[-suffix]` branches. Pull them in with

```
git fetch origin 'refs/heads/results/fw*:refs/remotes/origin/results/fw*'
```

and the next run picks them up. A sweep that fails is a new corpus entry; the fix for it is then
verified against every other entry at once.

## Caveats

- **Learn-time rules are invisible to the compile pass.** `unfreezeExpectations` and the ledger's
  own-output filter run when a skill is compiled *from a recording*, not when a flow is compiled to
  a spec. Every store in the corpus was recorded before those rules existed, so it carries the
  pre-fix shape, and the `frozen-literal` / `own-output-slot` totals measure **how much of the corpus
  had the defect**, not whether the fix works. Only a new recording can show a learn-time fix; its
  branch should then arrive with a lint total of zero. Read those two lints with `--since`.
- **`gate-before-goto` is deliberately narrow.** It flags only a gated `wait_for` ahead of the first
  navigation — an *interaction* ahead of a later `goto` is the normal procedure and the gate belongs
  on it. Calibrated: at 53fe40d it lights exactly fwrd51 `s_b1a0cd`, fwrd65 `s_615743` and fwrd68
  `s_bfc33c` and nothing else; at 6d37ab0, after the chain-quantifier fix, it lights nothing. A
  non-zero total at HEAD is a `wait_for` shape that fix did not reach.
- **Schema floor.** The lints read `flow.steps[].skill` and current store fields. Branches recorded
  before those fields existed show zero lint hits even where the compiler refuses; for those the
  compile pass is authoritative. Prefer `--since` to a recent runid when reading lint totals.
- **Compile success is not artifact success.** A compiled artifact can still fail at runtime against
  a live app. The lints catch the runtime classes we know; they cannot catch ones we have not met.
- **Four apps.** Broad in shape, narrow in application.
- **Some refusals are the compiler being right.** fwod56 refuses because a step depends on a value
  no recording ever read. Annotate such branches in `bench/corpus-known.json` with the reason so
  they stop reading as permanent failures.
