# verify compile-g1

Commit: `78958b88 compile: refuse a procedure cut short before state-changing work (cut-procedure)` (all marker greps + test/compile-g1-goto.test.ts present)
Chromium: playwright chromium v1228 (Chrome for Testing 149.0.7827.55) at /opt/pw-browsers/chromium-1228; 1194 not used.

## Overall: FAIL
One test fails in the browser run (and again on one retry): test/assert-e2e.browser.test.ts. Corpus has no compiled->refused change.

## c. Parity (BP_PARITY_TESTS=1, maxForks=1)
exit 0, wall 1893s
```
 Test Files  1 passed (1)
      Tests  210 passed (210)
```

## a. Suite (maxForks=4)
exit 0, wall 95s
```
 Test Files  211 passed | 28 skipped (239)
      Tests  3420 passed | 463 skipped (3883)
```

## b. Browser (BP_BROWSER_TESTS=1, maxForks=2)
exit 1
```
 Test Files  1 failed | 236 passed | 2 skipped (239)
      Tests  1 failed | 3671 passed | 211 skipped (3883)
```
Named files (result in the browser run): compile-g1-goto 15 pass; readscope 15 pass; ambiguous-evidence.browser 3 pass; substitute-candidate 2 pass; spec-locators 56 pass; replay 63 pass; execution-resolve 36 pass (execution-resolve-emit 21 pass); spec-repair 132 pass; build-converge 24 pass; spec-readiness 28 pass; drift-class 7 pass; app-minted-session 10 pass; id-fragments 13 pass; shape-gate 26 pass; spec-emit 167 pass; execution-browser 25 pass; cli-acceptance 11 pass; execution-parity 210 skipped here (BP_PARITY_TESTS unset) but 210/210 passed in check c; **assert-e2e.browser: 1 FAILED of 10**.

Retry (once, file alone, /tmp/v/browser-retry.log): same test failed again, 9 pass / 1 fail.

### Failing test
test/assert-e2e.browser.test.ts > sitelooper assert, end to end > re-issued directly, replays the stored assertion with no model call, and a miss is the answer
```
 FAIL  test/assert-e2e.browser.test.ts > sitelooper assert, end to end > re-issued directly, replays the stored assertion with no model call, and a miss is the answer
AssertionError: expected [ [ 'value_equals', false ] ] to deeply equal [ [ 'value_equals', true ], …(1) ]

- Expected
+ Received

  [
    [
      "value_equals",
-     true,
-   ],
-   [
-     "count",
      false,
    ],
  ]

 ❯ test/assert-e2e.browser.test.ts:573:96
    571|     expect(counted.report.status).toBe('failure');
    572|     expect(counted.assertFailed.kind).toBe('failed');
    573|     expect(counted.assertions.map((c: { state: string; held: boolean }…
       |                                                                                                ^
    574|     expect(two.model.calls()).toBe(0);
    575| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```
Reading: at line 573 the re-issued assertion list is [['value_equals', false]] but the test expects [['value_equals', true], ['count', false]] — the `count` assertion is missing from the replayed list (and value_equals reports false).

## d/e. Corpus (branch 78958b88 vs main bfeabd26)
Rows: 411 on both sides. Status changed: 0 (compiled->compiled 311, refused->refused 82, incomplete->incomplete 18). No compiled->refused, no refused->compiled. Per-row lint changes: none.
Lint totals, main and branch identical: gate-before-goto 6, frozen-literal 377, own-output-slot 68, demoted-pin 15, dead-read 114, frozen-locator-id 1651.
(The gate's comparison with bench/corpus-baseline.json is stale; informational only.)

## f. Rebuild survey
Last line of rs-diff.txt: `recordings: 298, changed: 35`
POINT-ONLY lines: + 0, - 0. Recordings changed: 35 of 298.
Full diff for the five requested recordings:
```
=== hakm1 (50 removed, 2 added)
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
  + [Create and save exactly one timesheet re].0 CUT sourcelessGoto click,click,click,click,click
  + [Create and save exactly one timesheet re].1 tools click,fill,press,fill,fill,select,select,fill,read,type,click,fill,press,read,read,read,read,click,read,read,read_all
=== fwsi14 (0 removed, 1 added)
  + [In Snipe-IT, create a new asset named 'f].0 CUT mintedFill press,click,click,click,type,click,fill,click,fill,press
=== fwsi26 (0 removed, 1 added)
  + [In Snipe-IT, create a new Asset (via Ass].0 CUT mintedFill click,fill,press,click,click,click,click,click
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
Full diff: bench/verify-reports/compile-g1-rebuild-diff.txt
