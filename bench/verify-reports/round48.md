# Verify round48

Commit: `b2a038fe` (round 48 (pending cloud verification): literal credentials become markers; alert lines), branch `fix/round48`.

## a. Main suite — `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  106 passed | 12 skipped (118)
     Tests  2181 passed | 301 skipped (2482)
```

0 failures.

## b. Browser suite — `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  117 passed | 1 skipped (118)
     Tests  2360 passed | 122 skipped (2482)
```

0 failures.

## c. Parity suite — `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  122 passed (122)
```

0 failures.

## d/e. Corpus check vs. `bench/corpus-snapshots/r43-4fa1125c.json`

`node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` against commit `b2a038fe`:

- new corpus: 272 rows (commit `b2a038fe`)
- old snapshot: 256 rows (commit `4fa1125c`)
- compared by `runid`, field `status`

**Changed (12), all `compiled` → `refused`:**

| runid | old status | new status |
| --- | --- | --- |
| fwod62 | compiled | refused |
| fwod68 | compiled | refused |
| fwgr55 | compiled | refused |
| fwgr58 | compiled | refused |
| fwgr61 | compiled | refused |
| fwkb24 | compiled | refused |
| fwop2 | compiled | refused |
| fwop7 | compiled | refused |
| fwgt2 | compiled | refused |
| fwgt3 | compiled | refused |
| fwec2 | compiled | refused |
| fwsi1 | compiled | refused |

**New runids (16)**, all first appear as either `compiled` or (one, `fwgt5`) `refused` — not a regression since they have no prior status in the r43 snapshot:

fwrd82 (compiled), fwrd83 (compiled), fwod78 (compiled), fwod79 (compiled), fwgr67 (compiled), fwkb38 (compiled), fwop8 (compiled), fwop9 (compiled), fwgt5 (refused), fwgt6 (compiled), fwvk6 (compiled), fwec6 (compiled), fwec7 (compiled), fwsi6 (compiled), fwgh8 (compiled), fwgh9 (compiled)

No runid present in both snapshots was removed (0 removed).

Note: `bench/corpus-check.mjs`'s own "movement against the branch's own compile log" section additionally reports 17 "newly-refusing" and 5 "fixed" branches — that comparison is against each branch's own historical compile log, not the r43 snapshot, and is included here only for context; the count driving the PASS/FAIL verdict below is the 12 above, from the required r43-snapshot diff.

Full corpus.json copied to `bench/corpus-snapshots/r48-b2a038fe.json`.

## Overall: FAIL

a-c have 0 failures, but 12 runids in the r43-snapshot comparison went from `compiled` to `refused`: fwod62, fwod68, fwgr55, fwgr58, fwgr61, fwkb24, fwop2, fwop7, fwgt2, fwgt3, fwec2, fwsi1.
