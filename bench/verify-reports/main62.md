# verify-main62

Commit: `8a699bfa` — "bench: verify-main62 prompt (main after the round61c merge; baseline r61c-b27a74cf)"

Chromium revision: **1228** (confirmed installed at `/opt/pw-browsers/chromium-1228`, downloaded fresh during this run; the box's pre-existing default was chromium-1194). `execution-parity.test.ts` ran against 1228 and passed in full (see check c), so the round-56c failure ("both runners bound a navigation that never completes") does not reproduce here.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

Test Files  151 passed | 22 skipped (173)
Tests  2583 passed | 404 skipped (2987)

No failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

Test Files  1 failed | 170 passed | 2 skipped (173)
Tests  1 failed | 2799 passed | 187 skipped (2987)

**Failing test:** `test/journal-feedback.browser.test.ts > journal feedback in tool results (stage 4) > on: the picker click says the listbox opened and no request was sent; the tick says the option is selected; the Save says its request`

```
AssertionError: expected 'clicked\njournal: focus is now in lis…' to match /\njournal: .*listbox "Labels" opened/

- Expected:
/\njournal: .*listbox "Labels" opened/

+ Received:
"clicked
journal: focus is now in listbox \"Labels\", not button \"Labels\"; no request was sent
[state: + - listbox \"Labels\"; + - option \"bug\"; + - option \"docs\"; + - option \"priority-high\"]"

 ❯ test/journal-feedback.browser.test.ts:66:18
     64|       ['click', { target: 'a[data-id="3"]' }],
     65|     ]);
     66|     expect(open).toMatch(/\njournal: .*listbox "Labels" opened/);
       |                  ^
     67|     expect(open).toMatch(/no request was sent/);
     68|     expect(tick).toMatch(/'priority-high' is now selected/);
```

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Test Files  1 passed (1)
Tests  186 passed (186)

No failures.

## d. `bench/corpus-check.mjs`

Rows: **341** (compiled every published `results/*` store; run against chromium-1228)

## e. Corpus diff vs baseline (`origin/results/verify-round61c-qfscdz:bench/corpus-snapshots/r61c-b27a74cf.json`, 336 rows), keyed by `runid`, field `status`

- Changed: **0**
- New (present in this run, absent from baseline): **5**
  - `fwod87`: compiled
  - `fwgr74`: refused
  - `fwop16`: compiled
  - `fwgt13`: compiled
  - `fwvk13`: compiled
- Removed (present in baseline, absent from this run): 0

No existing runid changed status; the 5 new ones are from `results/*` branches published since the baseline snapshot was taken.

## Overall: **FAIL**

Checks a and c pass clean, and the corpus (d/e) shows no runid regressing from compiled to refused/error. But check b has one real failing test (`journal-feedback.browser.test.ts`, stage-4 journal-feedback assertion on a listbox-open message) on chromium-1228, so the a-c "0 failures" bar for PASS is not met. Not retried past the one run per the rules; not investigated or fixed.
