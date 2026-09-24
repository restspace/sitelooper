# Verify round57

Commit: `4bd2d936` (bench: verify-round57 prompt (baseline r56, Chromium 1228 pinned)), branch `fix/round57`.

Chromium: revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. The box's pre-existing `/opt/pw-browsers/chromium-1194` was left in place but not used — `playwright-core`'s `browsers.json` (bundled with the installed `@playwright/test`) pins revision 1228, and no `SITELOOPER_EXECUTABLE` override was needed or set.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  2 failed | 123 passed | 14 skipped (139)
     Tests  3 failed | 2362 passed | 340 skipped (2705)
```

Failing tests:

1. `test/execution-recipes.test.ts > the ladders > type: a target that does not hold focus once focused is refused before any key is sent`

```
AssertionError: expected [Function] to throw error matching /cannot take keyboard focus/ but got '[vitest] No "DEFAULT_ACTION_TIMEOUT_M…'

- Expected:
/cannot take keyboard focus/

+ Received:
"[vitest] No \"DEFAULT_ACTION_TIMEOUT_MS\" export is defined on the \"../src/execution/browser.js\" mock. Did you forget to return it from \"vi.mock\"?
If you need to partially mock a module, you can use \"importOriginal\" helper inside:
"

 ❯ test/execution-recipes.test.ts:493:5
    491|     w.focusable = false;
    492|     const target = w.loc('target');
    493|     await expect(typeWithRecipe(w.page, target, 'Bench Laptop Model', …
       |     ^
    494|     expect(w.calls).toContain('focus target');
    495|     expect(w.calls.some((c) => c.startsWith('pressSequentially'))).toB…
```

2. `test/honesty.test.ts > pinStatus > is the chain's worst segment: a demoted third segment demotes the pinned head (fwod66-n3 09-open, s_591607)`

```
TypeError: Cannot read properties of undefined (reading 'failedAtStep')
 ❯ pageEffectDemoted src/skills/store.ts:1216:37
    1214| export function pageEffectDemoted(skill: Skill): boolean {
    1215|   if (skill.status === 'demoted') return true;
    1216|   return Object.entries(skill.stats.failedAtStep ?? {}).some(([at, n])…
       |                                     ^
    1217|     const step = skill.steps[Number(at) - 1];
    1218|     return n >= 2 && Boolean(step && stepEffect(step));
 ❯ src/skills/learn.ts:411:28
 ❯ pinStatus src/skills/learn.ts:411:16
 ❯ test/honesty.test.ts:134:12
```

3. `test/honesty.test.ts > pinStatus > reads an unchained pin as itself, and no pin as missing`

```
TypeError: Cannot read properties of undefined (reading 'failedAtStep')
 ❯ pageEffectDemoted src/skills/store.ts:1216:37
    1214| export function pageEffectDemoted(skill: Skill): boolean {
    1215|   if (skill.status === 'demoted') return true;
    1216|   return Object.entries(skill.stats.failedAtStep ?? {}).some(([at, n])…
       |                                     ^
    1217|     const step = skill.steps[Number(at) - 1];
    1218|     return n >= 2 && Boolean(step && stepEffect(step));
 ❯ pinStatus src/skills/learn.ts:409:27
 ❯ test/honesty.test.ts:139:12
```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  2 failed | 136 passed | 1 skipped (139)
     Tests  3 failed | 2554 passed | 148 skipped (2705)
```

Same three failing tests, same errors as in (a) — `test/execution-recipes.test.ts > the ladders > type: a target that does not hold focus once focused is refused before any key is sent` and both `test/honesty.test.ts > pinStatus` cases above. Not browser-version-related: the recipe failure is a mock-setup error (`DEFAULT_ACTION_TIMEOUT_MS` missing from a `vi.mock` of `../src/execution/browser.js`), and the honesty failures are a `TypeError` in `src/skills/store.ts:1216` (`skill.stats.failedAtStep` read on an undefined `stats`), reached via `pinStatus` / `pageEffectDemoted`.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  148 passed (148)
```

No failures on Chromium 1228 — 148/148 parity cases pass, including the case that failed on chromium-1194 in the round-56c run ("both runners bound a navigation that never completes"). This confirms that round-56c's failure was a browser-version issue, not a code regression: the code under test passes the full parity suite on the pinned Chromium revision.

## d/e. Corpus check (`bench/corpus-check.mjs`) vs `bench/corpus-snapshots/r56-a08138d2.json`

- Rows in r56 snapshot: 296. Rows in round57 corpus.json: 306.
- Compared by `runid`, field `status`: **0 changed**, **10 new** runids (present in round57, absent from the r56 snapshot).

New runids and their status:

| runid | status |
| --- | --- |
| fwrd89 | compiled |
| fwod83 | compiled |
| fwgr70 | compiled |
| fwkb41 | compiled |
| fwop12 | compiled |
| fwgt9 | compiled |
| fwvk9 | compiled |
| fwec10 | compiled |
| fwsi9 | refused (demoted-pin) |
| fwgh12 | compiled |

No runid present in both snapshots changed status (no compiled→refused/error transitions). The corpus-check tool's own "movement against the branch's own compile log" section separately lists 5 "newly-refusing" and 5 "fixed" entries (`fwrd50`, `fwod52`, `fwgr47`, `fwkb8`, `fwkb15` newly-refusing; `fwrd55`, `fwod48`, `fwod57`, `fwgr64`, `fwgh4` fixed) — these are computed against each branch's own historical/embedded compile record, not the r56 snapshot. Cross-checked against the r56 snapshot: all 5 "newly-refusing" runids are already `refused` in the r56 snapshot, and all 5 "fixed" runids are already `compiled` in the r56 snapshot — no discrepancy with the round57 result.

`/tmp/v/corpus.json` copied to `bench/corpus-snapshots/r56c-4bd2d936.json`.

## Overall: **FAIL**

Reason: (a) and (b) each have 3 failing tests (same three tests in both runs — one recipe-mock failure in `test/execution-recipes.test.ts` and two `TypeError`s in `test/honesty.test.ts` from `src/skills/store.ts:1216`), so a-c do not have 0 failures. These are real code failures unrelated to Chromium version: (c), the parity suite, passes 148/148 on the pinned Chromium 1228, and the corpus comparison (d/e) shows no regressions (0 changed statuses, no compiled→refused/error transitions).
