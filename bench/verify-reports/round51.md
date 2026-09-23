# Verify round51

Commit: `a441a86e` (bench: verify-round51 prompt (baseline r50)) on branch `fix/round51`

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  108 passed | 12 skipped (120)
     Tests  2209 passed | 302 skipped (2511)
```

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  119 passed | 1 skipped (120)
     Tests  2388 passed | 123 skipped (2511)
```

No failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed (1)
     Tests  1 failed | 122 passed (123)
```

1 failure:

**`test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > both runners resolve an unpublished control label to its recorded value when the page shows it`**

```
AssertionError: expected [ '01-read.x', '01-read.x' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "01-read.x",
+   "01-read.x",
+ ]

 ❯ test/execution-parity.test.ts:578:24
    576|     const bound = resolveStepParams(pressStep, {}, outputs);
    577|     const allMissing = [...resolveInstruction(pressStep, {}, outputs).…
    578|     expect(allMissing).toEqual([]);
       |                        ^
    579|     const replay = await replayOf(pressSkill(), bound?.params ?? {});
    580|     const replayLog = [...fx.log];
```

## d. `bench/corpus-check.mjs`

- Row count: 275 (`rows.length` in `/tmp/v/corpus.json`)
- 275 branch(es) total; 18 incomplete (no flow or no store); 1 known-unfixable, reported but not scored
- Compile rate 72.3% (185/256 scorable) — compiled 185, refused 72, crashed 0
- Saved to `bench/corpus-snapshots/r50-a441a86e.json`

## e. Comparison of `/tmp/v/corpus.json` vs `bench/corpus-snapshots/r50-5ded1631.json` (keyed by `runid`, field `status`)

- Row count: current 275, baseline 275
- Number of runids with a changed status: **0**
- New runids (present now, absent from baseline): **0**

No runid changed status between the two snapshots (in particular, none went from `compiled` to `refused`/`error`).

Note: the corpus-check script's own "movement against the branch's own compile log" section (a different, per-branch-embedded baseline, not `r50-5ded1631.json`) separately reports 5 "newly-refusing" and 5 "fixed" branches, matching the same movement already recorded inside `r50-5ded1631.json` itself (i.e. no change happened between r50 and r51). That section is unrelated to the d/e comparison this report is scored on, which uses only `r50-5ded1631.json` and shows zero status changes.

## Overall: FAIL

a and b have 0 failures, and no runid in the e) comparison went from `compiled` to `refused`/`error`, but c) has 1 failing test (`execution-parity.test.ts`, listed above), so the round does not pass verification.
