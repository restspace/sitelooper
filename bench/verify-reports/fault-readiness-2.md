# Verify fault-readiness (run 2)

**Overall: PASS**

- Commit: `755ec077 roleName: no quote character or `>` in the regex Playwright carries in its selector` (branch feat/fault-readiness). All 11 marker greps passed.
- Build: `npm ci`, `npm run build` and `npx playwright install --with-deps chromium` all succeeded.
- Chromium: the repo's playwright-core wants revision **1228** (Chrome for Testing 149.0.7827.55). It was installed to /opt/pw-browsers/chromium-1228 (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). SITELOOPER_EXECUTABLE was not set, so the tests ran on 1228; the older 1243 build in /opt/pw-browsers was not selected.

## c. Parity (run first, maxForks=1)
- Exit code 0, wall time 1881s (about 31 min).
- Test Files 1 passed (1); Tests 212 passed (212).

## a. Default suite (maxForks=4)
- Exit code 0.
- Test Files 235 passed | 35 skipped (270); Tests 3764 passed | 497 skipped (4261).
- Failures: none.

## b. Browser suite (BP_BROWSER_TESTS=1, maxForks=2)
- Exit code 0.
- Test Files 268 passed | 2 skipped (270); Tests 4048 passed | 213 skipped (4261).
- Failures: none, so no single-file re-runs were needed.

Named files in the browser run:

| file | result |
|---|---|
| kept-read | pass (4) |
| saved-after | pass (8) |
| fill-reload-effect | pass (6) |
| cover-click | pass (6) |
| hover-rename | pass (11) |
| probe-view | pass (8) |
| probe-retire | pass (8) |
| match-specific | pass (7) |
| no-silent-pass | pass (21) |
| spec-emit | pass (168) |
| execution-expect | pass (55) |
| execution-resolve-emit | pass (21) |
| r87-erpnext | pass (21) |
| fault-readiness.browser | pass (2) |
| fixup-e2e.browser | pass (6) |
| assert-e2e.browser | pass (10) |
| execution-browser | pass (25) |
| cli-acceptance | pass (11) |
| execution-parity | skipped in this run (BP_PARITY_TESTS is not set); passed 212/212 in check c |

## d/e. Corpus, branch 755ec077 vs main 402bbf3f
- Rows: 411 on the branch, 411 on main.
- Rows whose status changed: **0**. No compiled -> refused, no refused -> compiled.
- Rows with a differing lint total: **0**.
- Branch status counts: compiled 311, refused 82, incomplete 18.
- Lint totals, identical on both sides: gate-before-goto 6, frozen-literal 377, own-output-slot 68, demoted-pin 15, dead-read 114, frozen-locator-id 1651.
- The gate's comparison with the stale bench/corpus-baseline.json was not used.

Snapshot: bench/corpus-snapshots/fr-755ec077.json
