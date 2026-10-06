# Verify spec-reliability

Commit: `a51f5dbc bench: verify-spec-reliability prompt` (origin/feat/spec-reliability). All five required items present.
Chromium: playwright chromium v1228 (Chrome for Testing 149.0.7827.55) installed at /opt/pw-browsers/chromium-1228 via `playwright install --with-deps chromium`; 1194 also on the box but not used.

## Overall: FAIL (1 deterministic test failure in a and b; c, d, e clean)

## c. Parity (BP_PARITY_TESTS=1, maxForks=1)
exit 0, wall 1830s. See /tmp/v/parity.log.
     Test Files  1 passed (1)
          Tests  210 passed (210)

## a. Default suite (maxForks=4)
     Test Files  1 failed | 203 passed | 27 skipped (231)
          Tests  1 failed | 3336 passed | 460 skipped (3797)

## b. BP_BROWSER_TESTS=1 (maxForks=2)
     Test Files  1 failed | 228 passed | 2 skipped (231)
          Tests  1 failed | 3585 passed | 211 skipped (3797)

Named files (browser run): learn-recoveries 20 pass; cross-run-calibration 28 pass; no-silent-pass 21 pass; build-converge 17 pass; spec-repair 131 pass; spec-emit 167 pass; execution-expect 48 pass; execution-resolve-emit 21 pass; hide-toggle 8 pass; assert-spec 34 pass; assert-e2e.browser 10 pass; execution-browser 25 pass; cli-acceptance 11 pass; execution-parity: skipped in this run (no BP_PARITY_TESTS), run separately in c: pass.

### Failing test (same in a and b; re-run once alone, same failure; not fixed)
test/shape-gate.test.ts > no second copy under another name > fences every alphanumeric class outside shape.ts behind the allowlist

    AssertionError: A character class that reads alphanumerics appeared (or moved) outside shape.ts. If it asks "is this an id?" or "is this a whole token?", call digitDominant/looksLikeId/tokenPattern/skeleton instead. If it is honest syntax, add it to ALLOWLIST with the question it answers.: expected { …(16) } to deeply equal { …(15) }
    + Received:
    +   "src/spec/converge.ts": [ "[0-9a-f]{6" ],
    ❯ test/shape-gate.test.ts:320:7

Cause: new file src/spec/converge.ts has a `[0-9a-f]{6…}` class that is not in the test's ALLOWLIST.

## d/e. Corpus (bench/corpus-check.mjs, branch a51f5dbc vs main e34fd2d7)
- Rows: 411 on both sides. Changed status: 0. compiled->refused: none; refused->compiled: none.
- Status counts both sides: compiled 311, refused 82, incomplete 18.
- Kinds/lint totals identical on both sides: gate-before-goto 6, frozen-literal 377, own-output-slot 68, demoted-pin 15, dead-read 114, frozen-locator-id 1651.
- Gate's baseline comparison is stale (informational).
Snapshot: bench/corpus-snapshots/sr-a51f5dbc.json
