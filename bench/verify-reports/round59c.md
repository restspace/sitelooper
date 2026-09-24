# Verify round59c

Commit: `9454ff01` (bench: verify-round59c prompt (echo fixes restored)), branch `fix/round59`

Browser: Chromium revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh into
`/opt/pw-browsers/chromium-1228` via `npx playwright install --with-deps chromium`. This matches the
revision pinned by `playwright-core@1.61.1`'s `browsers.json` (`"revision": "1228"`), so the default
`chromium`/`chrome` channel resolution used it without needing `SITELOOPER_EXECUTABLE`. The box also
had a stale `chromium-1194` under the same `PLAYWRIGHT_BROWSERS_PATH`, which was left in place and not
used.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  131 passed | 14 skipped (145)
     Tests  2399 passed | 347 skipped (2746)
```

0 failures.

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  144 passed | 1 skipped (145)
     Tests  2591 passed | 155 skipped (2746)
```

0 failures. Ran on Chromium 1228 (see above) — this is the check that failed once on chromium-1194
in round 56c; it is clean here on 1228.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  155 passed (155)
```

0 failures.

## d/e. Corpus check vs. baseline

Note on procedure: `bench/corpus-snapshots/r59-6cf84c15.json` does not exist on `fix/round59` (or on
any `results/verify-round59c*`/`results/verify-round59b*` branch reachable from it). It was located
at commit `5bd86b97` ("verify round59") on `origin/results/verify-round59-pk50z8` and read from there
via `git show 5bd86b97:bench/corpus-snapshots/r59-6cf84c15.json` for comparison purposes only — nothing
was merged or copied into `fix/round59`, and no source/test file was touched.

`PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`
ran clean (exit 0), fetching every `results/*` branch and compiling each published store with
`APP_PASSWORD=bench-admin-pass` set (old stores carrying that password in the clear were rewritten by
compile rather than refused, as expected).

- Row count: **316** (both baseline and this run)
- Rows changed: **0**
- New runids: **0**
- Removed runids: **0**

No `runid` changed `status` (old -> new) and none are new. In particular, the "newly-refusing" set
listed in `/tmp/v/corpus.log` (fwrd50, fwod52, fwgr47, fwkb8, fwkb15) and the "fixed" set (fwrd55,
fwod48, fwod57, fwgr64, fwgh4) are unchanged from the `r59-6cf84c15` baseline — this run reproduces the
same corpus state, it does not introduce new movement.

Full compile output saved at `/tmp/v/corpus.log`; raw rows at
`bench/corpus-snapshots/r59c-9454ff01.json` (copied from `/tmp/v/corpus.json`).

## Overall: PASS

a, b, and c have 0 failures; no runid in d/e went from compiled to refused/error (0 status changes
against the baseline).
