# Verify fix/compile-g1

Commit: `8cdfe30a Merge fix/compile-g1-a (item 1: reached gate refusals bank; goto record ids need a source)` (all three items + test/compile-g1-goto.test.ts present)
Chromium: playwright revision 1228 (Chrome for Testing 149.0.7827.55), installed to /opt/pw-browsers/chromium-1228; 1194 also present on box but the tests used the repo's expected 1228.
Build: npm ci, npm run build, playwright install: OK.

## Overall: PASS

## c. Parity (BP_PARITY_TESTS=1, maxForks=1)
Exit 0, wall 1993s (~33 min)
 Test Files  1 passed (1)
      Tests  210 passed (210)

## a. Default suite (maxForks=4)
Exit 0, 114s
 Test Files  211 passed | 28 skipped (239)
      Tests  3417 passed | 463 skipped (3880)

## b. BP_BROWSER_TESTS=1 (maxForks=2)
Exit 0, 934s
 Test Files  237 passed | 2 skipped (239)
      Tests  3669 passed | 211 skipped (3880)
Skipped: test/execution-parity.test.ts (210, needs BP_PARITY_TESTS; passed in c) and test/journal-overhead.browser.test.ts (1).
0 failures.

Named files:
- PASS test/compile-g1-goto.test.ts (12 tests) 232ms
- PASS test/readscope.test.ts (15 tests) 235ms
- PASS test/ambiguous-evidence.browser.test.ts (3 tests) 8119ms
- PASS test/substitute-candidate.test.ts (2 tests) 6ms
- PASS test/spec-locators.test.ts (56 tests) 1004ms
- PASS test/replay.test.ts (63 tests) 115845ms
- PASS test/execution-resolve.test.ts (36 tests) 140ms
- PASS test/spec-repair.test.ts (132 tests) 783ms
- PASS test/build-converge.test.ts (24 tests) 21ms
- PASS test/spec-readiness.test.ts (28 tests) 16004ms
- PASS test/drift-class.test.ts (7 tests) 15ms
- PASS test/app-minted-session.test.ts (10 tests) 139ms
- PASS test/id-fragments.test.ts (13 tests) 79ms
- PASS test/shape-gate.test.ts (26 tests) 547ms
- PASS test/spec-emit.test.ts (167 tests) 36442ms
- PASS test/assert-e2e.browser.test.ts (10 tests) 187693ms
- PASS test/execution-browser.test.ts (25 tests) 521ms
- PASS test/cli-acceptance.test.ts (11 tests) 5092ms
- execution-parity.test.ts: skipped in b (needs BP_PARITY_TESTS); PASS 210/210 in c

## d/e. Corpus (main bfeabd26 vs branch 8cdfe30a, same box)
Rows: 411 on each side. Status counts both sides: compiled 311, refused 82, incomplete 18.
Changed status (main -> branch): 0. compiled->refused: 0. refused->compiled: 0.
Lint totals identical on both sides (and per row, no differences):
gate-before-goto 6, frozen-literal 377, own-output-slot 68, demoted-pin 15, dead-read 114, frozen-locator-id 1651.
(Gate's comparison with bench/corpus-baseline.json is stale, informational only.)
Snapshot: bench/corpus-snapshots/g1-8cdfe30a.json

## f. Rebuild survey (informational)
Last line of rs-diff.txt: `recordings: 298, changed: 33`
POINT-ONLY: '+' lines 0, '-' lines 0.
Recordings changed: 33 of 298 (main survey 304 recordings listed by survey; compare covers 298).
Full diff: bench/verify-reports/compile-g1-rebuild-diff.txt

Diffs for requested recordings:

```
=== fwen9-luna (4 removed, 4 added)
  - [Create a Sales Order for the existing cu].2/16 read target first {"kind":"text","text":"{{v4}}"}
  - [Create a Sales Order for the existing cu].2/16 read target text#1/3 {"kind":"text","text":"{{v4}}"}
  - [Create a Sales Order for the existing cu].2/3 read target first {"kind":"text","text":"{{v4}}"}
  - [Create a Sales Order for the existing cu].2/3 read target text#1/2 {"kind":"text","text":"{{v4}}"}
  + [Create a Sales Order for the existing cu].2/16 read target first {"kind":"css","selector":"div:nth-of-type(1) > div:nth-of-type(1) > div > div:nth-of-type(3) > div:nth-of-type(2) > a"}
  + [Create a Sales Order for the existing cu].2/16 read target text#2/3 {"kind":"text","text":"{{v4}}"}
  + [Create a Sales Order for the existing cu].2/3 read target first {"kind":"css","selector":"[data-fieldname=\"items\"] .grid-body .grid-row .col[data-fieldname=\"item_code\"] .static-area","nth":0}
  + [Create a Sales Order for the existing cu].2/3 read target text#2/2 {"kind":"text","text":"{{v4}}"}
```

```
=== hakm1 (50 removed, 1 added)
  - [Create and save exactly one timesheet re].1 tools click,fill,press,fill,fill,select,select,fill,read,type,click,fill,press,read,read,read,read,click,read,read,read_all,goto
  - [Create and save exactly one timesheet re].1/22 goto http://127.0.0.1:8105/en/timesheet/1/edit
  - [Create and save exactly one timesheet re].2 start http://127.0.0.1:8105/en/timesheet/:id/edit
  - [Create and save exactly one timesheet re].2 tools read,click,click,click,click,click
  - [Create and save exactly one timesheet re].2/1 read target css #timesheet_edit_form_begin_date
  - [Create and save exactly one timesheet re].2/1 read target first {"kind":"css","selector":"#timesheet_edit_form_begin_date"}
  - [Create and save exactly one timesheet re].2/2 click expect http://127.0.0.1:8105/en/timesheet/{{d1}}/edit
  - [Create and save exactly one timesheet re].2/2 click target css a[data-format="M/D/YYYY"]
  - [Create and save exactly one timesheet re].2/2 click target css form > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div > a
  - [Create and save exactly one timesheet re].2/3 click expect http://127.0.0.1:8105/en/timesheet/{{d1}}/edit
  - [Create and save exactly one timesheet re].2/3 click target css #timesheet_edit_form_begin_date
  - [Create and save exactly one timesheet re].2/4 click expect http://127.0.0.1:8105/en/timesheet/{{d1}}/edit
  - [Create and save exactly one timesheet re].2/4 click target css .litepicker .button-previous-month
  - [Create and save exactly one timesheet re].2/4 click target css div:nth-of-type(10) > div > div > div > div:nth-of-type(1) > button:nth-of-type(1)
  - [Create and save exactly one timesheet re].2/5 click expect http://127.0.0.1:8105/en/timesheet/{{d1}}/edit
  - [Create and save exactly one timesheet re].2/5 click target css .litepicker .day-item[data-time="1789516800000"]
  - [Create and save exactly one timesheet re].2/5 click target css div:nth-of-type(10) > div > div > div > div:nth-of-type(3) > div:nth-of-type(17)
  - [Create and save exactly one timesheet re].2/6 click expect http://127.0.0.1:8105/en/timesheet/
  - [Create and save exactly one timesheet re].2/6 click target css div > section > div > form > div:nth-of-type(3) > input:nth-of-type(1)
  - [Create and save exactly one timesheet re].2/6 click target css input[type="submit"]
  - [Create and save exactly one timesheet re].2/6 click target css role=button[name="Save"]
  - [Create and save exactly one timesheet re].3 start http://127.0.0.1:8105/en/timesheet/
  - [Create and save exactly one timesheet re].3 tools read_all,goto
  - [Create and save exactly one timesheet re].3/1 read_all target css .table tbody tr
  - [Create and save exactly one timesheet re].3/1 read_all target css div > div:nth-of-type(1) > div > table > tbody > tr
  - [Create and save exactly one timesheet re].3/1 read_all target first {"kind":"css","selector":".table tbody tr"}
  - [Create and save exactly one timesheet re].3/1 read_all target text#3/5 {"kind":"text","text":"9/16/2026 9:00 AM 11:30 AM 2:30 Bench Customer {{v1}} Consulting"}
  - [Create and save exactly one timesheet re].3/1 read_all target walk scoped,css,text,css,point
  - [Create and save exactly one timesheet re].3/2 goto http://127.0.0.1:8105/en/timesheet/{{d1}}/edit
  - [Create and save exactly one timesheet re].4 start http://127.0.0.1:8105/en/timesheet/{{d1}}/edit
  - [Create and save exactly one timesheet re].4 tools read,read,read,read,read,read,read
  - [Create and save exactly one timesheet re].4/1 read target css div:nth-of-type(10) > div > div > div > div:nth-of-type(3) > div:nth-of-type(2)
  - [Create and save exactly one timesheet re].4/1 read target first {"kind":"css","selector":"div:nth-of-type(10) > div > div > div > div:nth-of-type(3) > div:nth-of-type(2)"}
  - [Create and save exactly one timesheet re].4/2 read target css #timesheet_edit_form_description
  - [Create and save exactly one timesheet re].4/2 read target first {"kind":"role","role":"textbox","name":"Description"}
  - [Create and save exactly one timesheet re].4/2 read target id #timesheet_edit_form_description
  - [Create and save exactly one timesheet re].4/3 read target css #timesheet_edit_form_tags > option:nth-of-type(3)
  - [Create and save exactly one timesheet re].4/3 read target first {"kind":"css","selector":"#timesheet_edit_form_tags > option:nth-of-type(3)"}
  - [Create and save exactly one timesheet re].4/4 read target css div:nth-of-type(2) > div:nth-of-type(4) > div > div > div > div
  - [Create and save exactly one timesheet re].4/4 read target first {"kind":"text","text":"{{v1}}"}
  - [Create and save exactly one timesheet re].4/4 read target text#1/3 {"kind":"text","text":"{{v1}}"}
  - [Create and save exactly one timesheet re].4/4 read target walk text,css,point
  - [Create and save exactly one timesheet re].4/5 read target css div:nth-of-type(2) > div:nth-of-type(3) > div > div > div > div
  - [Create and save exactly one timesheet re].4/5 read target first {"kind":"css","selector":"div:nth-of-type(2) > div:nth-of-type(3) > div > div > div > div"}
  - [Create and save exactly one timesheet re].4/6 read target css div:nth-of-type(2) > div:nth-of-type(4) > div > div > div > div
  - [Create and save exactly one timesheet re].4/6 read target first {"kind":"text","text":"{{v1}}","nth":1}
  - [Create and save exactly one timesheet re].4/6 read target text#1/3 {"kind":"text","text":"{{v1}}","nth":1}
  - [Create and save exactly one timesheet re].4/6 read target walk text,css,point
  - [Create and save exactly one timesheet re].4/7 read target css div:nth-of-type(2) > div:nth-of-type(5) > div > div > div > div
  - [Create and save exactly one timesheet re].4/7 read target first {"kind":"css","selector":"div:nth-of-type(2) > div:nth-of-type(5) > div > div > div > div"}
  + [Create and save exactly one timesheet re].1 tools click,fill,press,fill,fill,select,select,fill,read,type,click,fill,press,read,read,read,read,click,read,read,read_all
```

```
=== hbgc3 (26 removed, 27 added)
  - [Edit 'hbgc3-n1 Bench Product' and set De] start http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set De]/1 fill expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set De]/2 click expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set De]/3 click expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set De]/4 fill expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set De]/5 click expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set De]/6 goto http://127.0.0.1:8106/product/298407
  - [Edit 'hbgc3-n1 Bench Product' and set bo].0 start http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set bo].0/1 select expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set bo].0/2 select expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set bo].0/3 fill expect http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set bo].0/7 click expect http://127.0.0.1:8106/products?product=:id
  - [Edit 'hbgc3-n1 Bench Product' and set bo].1 start http://127.0.0.1:8106/products?product=:id
  - [Edit 'hbgc3-n1 Bench Product' and set bo].1/1 goto http://127.0.0.1:8106/product/298407
  - [Edit 'hbgc3-n1 Bench Product' and set bo].2 start http://127.0.0.1:8106/product/:id
  - [Edit 'hbgc3-n1 Bench Product' and set it].0 tools read,read,read,goto
  - [Edit 'hbgc3-n1 Bench Product' and set it].0/4 goto http://127.0.0.1:8106/product/298407
  - [Edit 'hbgc3-n1 Bench Product' and set it].1 start http://127.0.0.1:8106/product/:id
  - [Make one purchase of exactly 3 Packs of ].2/12 read target first {"kind":"text","text":"{{v1}}"}
  - [Make one purchase of exactly 3 Packs of ].2/12 read target text#1/3 {"kind":"text","text":"{{v1}}"}
  - [Make one purchase of exactly 3 Packs of ].2/18 read target first {"kind":"text","text":"{{v1}}"}
  - [Make one purchase of exactly 3 Packs of ].2/18 read target text#1/3 {"kind":"text","text":"{{v1}}"}
  - [Make one purchase of exactly 3 Packs of ].2/2 read target first {"kind":"text","text":"{{v1}}"}
  - [Make one purchase of exactly 3 Packs of ].2/2 read target text#1/2 {"kind":"text","text":"{{v1}}"}
  - [Open the edit page for 'hbgc3-n1 Bench P].0/5 goto http://127.0.0.1:8106/product/298407
  - [Open the edit page for 'hbgc3-n1 Bench P].1 start http://127.0.0.1:8106/product/:id
  + [Edit 'hbgc3-n1 Bench Product' and set De] start http://127.0.0.1:8106/product/{{v5}}
  + [Edit 'hbgc3-n1 Bench Product' and set De]/1 fill expect http://127.0.0.1:8106/product/{{v5}}
  + [Edit 'hbgc3-n1 Bench Product' and set De]/2 click expect http://127.0.0.1:8106/product/{{v5}}
  + [Edit 'hbgc3-n1 Bench Product' and set De]/3 click expect http://127.0.0.1:8106/product/{{v5}}
  + [Edit 'hbgc3-n1 Bench Product' and set De]/4 fill expect http://127.0.0.1:8106/product/{{v5}}
  + [Edit 'hbgc3-n1 Bench Product' and set De]/5 click expect http://127.0.0.1:8106/product/{{v5}}
  + [Edit 'hbgc3-n1 Bench Product' and set De]/6 goto http://127.0.0.1:8106/product/{{v5}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].0 start http://127.0.0.1:8106/product/{{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].0/1 select expect http://127.0.0.1:8106/product/{{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].0/2 select expect http://127.0.0.1:8106/product/{{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].0/3 fill expect http://127.0.0.1:8106/product/{{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].0/7 click expect http://127.0.0.1:8106/products?product={{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].1 start http://127.0.0.1:8106/products?product={{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].1/1 goto http://127.0.0.1:8106/product/{{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set bo].2 start http://127.0.0.1:8106/product/{{v4}}
  + [Edit 'hbgc3-n1 Bench Product' and set it].0 tools read,read,read,click
  + [Edit 'hbgc3-n1 Bench Product' and set it].0/4 click expect http://127.0.0.1:8106/product/{{d1}}
  + [Edit 'hbgc3-n1 Bench Product' and set it].0/4 click target css #products-table > tbody > tr:nth-of-type(4) > td:nth-of-type(1) > a:nth-of-type(1)
  + [Edit 'hbgc3-n1 Bench Product' and set it].1 start http://127.0.0.1:8106/product/{{d1}}
  + [Make one purchase of exactly 3 Packs of ].2/12 read target first {"kind":"css","selector":"#stock-5-row > td:nth-of-type(3)"}
  + [Make one purchase of exactly 3 Packs of ].2/12 read target text#2/3 {"kind":"text","text":"{{v1}}"}
  + [Make one purchase of exactly 3 Packs of ].2/18 read target first {"kind":"css","selector":"#stock-5-row > td:nth-of-type(3)"}
  + [Make one purchase of exactly 3 Packs of ].2/18 read target text#2/3 {"kind":"text","text":"{{v1}}"}
  + [Make one purchase of exactly 3 Packs of ].2/2 read target first {"kind":"css","selector":"table tbody tr td","nth":2}
  + [Make one purchase of exactly 3 Packs of ].2/2 read target text#2/2 {"kind":"text","text":"{{v1}}"}
  + [Open the edit page for 'hbgc3-n1 Bench P].0/5 goto http://127.0.0.1:8106/product/{{v3}}
  + [Open the edit page for 'hbgc3-n1 Bench P].1 start http://127.0.0.1:8106/product/{{v3}}
```
