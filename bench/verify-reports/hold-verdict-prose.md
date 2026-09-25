# Verify: hold-verdict-prose

Commit: `dced1309` — report: a labelled read is promoted even when another key holds the same text (fwod90 03-open untaxed_amount)

(A prior verification run on this branch's earlier head, `6e44dc7d`, is superseded by this one: `fix/hold-verdict-prose` gained one more commit — `dced1309`, a bench-log-only commit — after that run published its report. This report re-verifies the branch's current head.)

Chromium: revision **1228**, installed via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. `playwright-core`'s bundled `browsers.json` resolved `chromium.executablePath()` to `/opt/pw-browsers/chromium-1228/chrome-linux64/chrome` directly (verified before running tests); no `SITELOOPER_EXECUTABLE` override was needed. The box's pre-existing `/opt/pw-browsers/chromium-1194` (and the `chromium` symlink pointing at it) was left in place but not used.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  163 passed | 23 skipped (186)
     Tests  2665 passed | 432 skipped (3097)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  184 passed | 2 skipped (186)
     Tests  2892 passed | 205 skipped (3097)
```

0 failures.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

0 failures.

## d/e. Corpus check vs. baseline

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet` compiled every published `results/*` branch.

- Current corpus (`/tmp/v/corpus.json`): **368** rows.
- Baseline (`results/verify-round63-5iu88l`, `bench/corpus-snapshots/r63-8212f830.json`): **351** rows.
- Rows changed (by `runid`, field `status`, keyed against the baseline): **0**.
- New runids (present now, absent from baseline — newly published `results/*` branches since round 63, not status changes): **17**

| runid | status |
| --- | --- |
| fwrd93 | compiled |
| fwrd94 | compiled |
| fwod89 | compiled |
| fwod90 | refused |
| fwgr76 | compiled |
| fwkb45 | refused |
| fwop18 | compiled |
| fwop19 | compiled |
| fwgt15 | compiled |
| fwgt16 | compiled |
| fwvk15 | compiled |
| fwec15 | compiled |
| fwec16 | compiled |
| fwsi15 | compiled |
| fwsi16 | refused |
| fwgh18 | compiled |
| fwgh19 | compiled |

No runid present in both files changed status. This matches the expectation that this branch (which only touches `src/agent/sourcing.ts`'s `isDataShaped`, affecting record time) leaves compile-time status unaffected.

Full snapshot copied to `bench/corpus-snapshots/hvp-dced1309.json` (the prior run's `bench/corpus-snapshots/hvp-6e44dc7d.json` is left in place).

## Overall: PASS

a-c have 0 failures; no runid common to both corpus runs changed status.
