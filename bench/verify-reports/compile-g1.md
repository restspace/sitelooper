# verify compile-g1 (run c)

Commit: `555e313a build: converge redoes work the recording did and the flow left out` (fix/compile-g1; all marker greps passed)
Chromium: playwright revision 1228 (Chrome for Testing 149.0.7827.55), installed at /opt/pw-browsers/chromium-1228; the older 1194 was not used.

## Overall: FAIL
One browser test failed (a-c must have 0 failures). Corpus d/e is clean.

## c. parity (BP_PARITY_TESTS=1, maxForks=1)
exit 0, wall 2033 s (~34 min)
 Test Files  1 passed (1)
      Tests  210 passed (210)

## a. default suite (maxForks=4)
 Test Files  212 passed | 28 skipped (240)
      Tests  3436 passed | 463 skipped (3899)

## b. BP_BROWSER_TESTS=1 (maxForks=2)
 Test Files  1 failed | 237 passed | 2 skipped (240)
      Tests  1 failed | 3687 passed | 211 skipped (3899)
(The first attempt was killed by my own tool timeout, not a test result; this is the one re-run allowed. Not retried again after the failure.)

FAILING: test/assert-e2e.browser.test.ts > sitelooper assert, end to end > re-issued directly, replays the stored assertion with no model call, and a miss is the answer
```
AssertionError: expected [ [ 'value_equals', false ] ] to deeply equal [ [ 'value_equals', true ], …(1) ]
- Expected: [ ["value_equals", true], ["count", false] ]
+ Received: [ ["value_equals", false] ]
 ❯ test/assert-e2e.browser.test.ts:573:96
    571| expect(counted.report.status).toBe('failure');
    572| expect(counted.assertFailed.kind).toBe('failed');
    573| expect(counted.assertions.map((c) => [c.state, c.held])) ...
```
(count assertion absent from the replayed list; value_equals reported not held rather than held)

Named files (browser run; execution-parity is skipped there without BP_PARITY_TESTS and is covered by c):
compile-g1-goto 15 pass; omitted-recovery 10; tail-adoption 10; readscope 15; ambiguous-evidence.browser 3; substitute-candidate 2; spec-locators 56; replay 63; execution-resolve 36; spec-repair 132; build-converge 30; spec-readiness 28; drift-class 7; app-minted-session 10; id-fragments 13; shape-gate 26; spec-emit 167; assert-e2e.browser 9 pass / 1 FAIL; execution-browser 25; cli-acceptance 11; execution-parity 210 pass (run c).

## d/e. corpus (branch 555e313a vs main bfeabd26)
411 rows each. Status counts identical on both sides: compiled 311, refused 82, incomplete 18.
Changed runids: 0 (no compiled->refused, no refused->compiled).
Lint totals, branch = main: gate-before-goto 6, frozen-literal 377, own-output-slot 68, demoted-pin 15, dead-read 114, frozen-locator-id 1651. No per-row lint differences.

## f. rebuild survey
Last line: `recordings: 298, changed: 35`
POINT-ONLY lines: `+` 0, `-` 0.
Full diffs for hakm1, fwsi14, fwsi26, hbgc3, fwen9-luna below (whole diff in compile-g1-rebuild-diff.txt).

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
