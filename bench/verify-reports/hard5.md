# verify hard5

Commit: `c4bd5107 id fragments: never point-only, never a url gate (rebuild survey of fix 5a)` (fix/hard5; all four fix markers present). Built with `npm ci && npm run build`.
Chromium: playwright chromium-1228 (Chrome Headless Shell 149.0.7827.55) installed in /opt/pw-browsers (alongside older 1194; PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers, 1228 used, no SITELOOPER_EXECUTABLE override).

## c. execution-parity (BP_PARITY_TESTS=1, maxForks=1)
- exit code 0, wall time 1929s (~32 min)
- Test Files  1 passed (1)
- Tests  210 passed (210)

## a. full suite (maxForks=4)
- exit 0
- Test Files  209 passed | 27 skipped (236)
- Tests  3397 passed | 460 skipped (3857)
- failing tests: none

## b. BP_BROWSER_TESTS=1 (maxForks=2)
- exit 0
- Test Files  234 passed | 2 skipped (236)
- Tests  3646 passed | 211 skipped (3857)
- failing tests: none
- named files: build-converge 24 pass; build-default 7 pass; spec-readiness 28 pass; drift-class 7 pass; app-minted-session 10 pass; id-fragments 13 pass; eval-assigned-ids 4 pass; offered-constants 8 pass; shape-gate 26 pass; spec-emit 167 pass; spec-repair 131 pass; assert-spec 34 pass; assert-e2e.browser 10 pass; execution-browser 25 pass; cli-acceptance 11 pass; execution-parity: 210 skipped in this run (needs BP_PARITY_TESTS=1), 210/210 passed in check c.

## d/e. corpus (branch c4bd5107 vs main f535c191, same box, same fetch)
- rows: 411 on both sides; statuses identical on both: compiled 311, refused 82, incomplete 18
- runids with status change: 0 (compiled->refused: 0; refused->compiled: 0)
- per-row lint differences: 0
- lint totals (identical both sides): gate-before-goto 6, frozen-literal 377, own-output-slot 68, demoted-pin 15, dead-read 114, frozen-locator-id 1651
- (gate's comparison with corpus-baseline.json is stale; informational only)

## f. rebuild survey (302 recordings, main f535c191 vs branch)
- last line of rs-diff.txt: `recordings: 296, changed: 184`
- `+ ... POINT-ONLY` lines: 0; `- ... POINT-ONLY` lines: 0
- fwen8-luna (14 removed, 13 added): the 14 removed are the raw session URL `/app/sales-order/new-sales-order-uxvwbpigvk` (start + 12 expects) and one `#awesomplete_list_34 > div:nth-of-type(1)` click target; the 13 added are the same steps with `/app/sales-order/:var`.
- fwgt35-luna (17 removed, 1 added): removed are minted-id targets (`#_combo_markdown_editor_76/52`, `#_aria_dropdown_menu_32/37`, `#_aria_dropdown_item_56/59`, plus `[id=...]` variants and one `#issue-4 > ...` read); added is `read target css #issue-{{v7}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p`.
- full diff: bench/verify-reports/hard5-rebuild-diff.txt

## Overall: PASS
(a-c 0 failures; no runid went compiled -> refused.)
