# Verify commentary-report

Commit: `5e94c2b4` (bench: fwgt19 prompt (gitea on the commentary-report fix), fired after the merge), branch `fix/commentary-report`. `test/commentary-report.test.ts` present.

Chromium: revision **1228** (Chrome for Testing 149.0.7827.55), installed fresh via `npx playwright install --with-deps chromium` into `/opt/pw-browsers/chromium-1228`. The box's pre-existing `/opt/pw-browsers/chromium-1194` was left in place but not used — `playwright-core`'s bundled `browsers.json` pins revision 1228, and no `SITELOOPER_EXECUTABLE` override was needed or set; both suites a/b ran clean against 1228.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  3 failed | 167 passed | 23 skipped (193)
     Tests  7 failed | 2772 passed | 432 skipped (3211)
```

Failing tests:

1. `test/rebuild.test.ts > recorded-flow rebuild > fwod24 still compiles to its pinned flow`

```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwod24 --dir bench/fixtures/recordings --baseline bench/fixtures/fwod24.json
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

2. `test/rebuild.test.ts > recorded-flow rebuild > fwod26 still compiles to its pinned flow`

```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwod26 --dir bench/fixtures/recordings --baseline bench/fixtures/fwod26.json
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

3. `test/rebuild.test.ts > recorded-flow rebuild > fwod27 still compiles to its pinned flow`

```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwod27 --dir bench/fixtures/recordings --baseline bench/fixtures/fwod27.json
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

4. `test/rebuild.test.ts > recorded-flow rebuild > fwgr14 still compiles to its pinned flow`

```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwgr14 --dir bench/fixtures/recordings --baseline bench/fixtures/fwgr14.json
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

5. `test/recorder-evidence.test.ts > a recording with stage 0 evidence and failed steps rebuilds to the same flow > fwod24: failed steps and evidence fields change nothing, the whole flow included`

```
AssertionError: expected '\n=== fwod24-n1 ===\n   1 blocked rea…' to contain 'MATCHES baseline'
 ...
[rebuild] DIFFERS from baseline:
  fwod24-n2.crossStepRefs: 5 -> 3
  fwod24-n2.markers LOST: 43e5bd:{{v1}} = "fwod24-n2 Bench Customer"
  fwod24-n2.markers LOST: 43e5bd:{{v2}} = "fwod24-n2"
  fwod24-n2.markers GAINED: c72126:{{v1}} = "fwod24-n2 Bench Customer"
  fwod24-n2.markers GAINED: c72126:{{v2}} = "fwod24-n2"

 ❯ test/recorder-evidence.test.ts:256:28
    254|       try {
    255|         const got = rebuild(tag, dir);
    256|         expect(got.stdout).toContain('MATCHES baseline');
       |                            ^
    257|         expect(got.flows).toEqual(plain.flows);
    258|         expect(plain.skills.length).toBeGreaterThan(0);
```

6. `test/recorder-evidence.test.ts > a recording with stage 0 evidence and failed steps rebuilds to the same flow > fwgr14: failed steps and evidence fields change nothing, the whole flow included`

```
AssertionError: expected '\n=== fwgr14-n1 ===\n   1 success rea…' to contain 'MATCHES baseline'
 ...
[rebuild] DIFFERS from baseline:
  fwgr14-n1.markers LOST: bae811:{{v2}} = "fwgr14-n1 Availability"
  fwgr14-n1.markers LOST: bae811:{{v3}} = "fwgr14-n1"
  fwgr14-n1.markers GAINED: 651d8c:{{v2}} = "fwgr14-n1"

 ❯ test/recorder-evidence.test.ts:256:28
    254|       try {
    255|         const got = rebuild(tag, dir);
    256|         expect(got.stdout).toContain('MATCHES baseline');
       |                            ^
    257|         expect(got.flows).toEqual(plain.flows);
    258|         expect(plain.skills.length).toBeGreaterThan(0);
```

7. `test/shape-gate.test.ts > the shape inventory is pinned > src/skills/flow.ts looksLikeId: 2 site(s) — "is this url part / json leaf a reference?", fails toward silence`

```
AssertionError: src/skills/flow.ts now has 3 looksLikeId call site(s), inventoried at 2.
Before raising the number, ask what evidence could decide this instead — position (idPositionPart), provenance (RunLedger), or cross-run variance (noteOutputEvidence). See src/skills/shape.ts and notes/PLAN-evidence-over-shape.md.
This site's population: referencablePart (shared by buildFlow minting and urlOutputs) and jsonLeaves. Both consult runSpecific first. The reported-VALUE path beside them references everything and lets evidence demote.: expected 3 to be 2 // Object.is equality

 ❯ test/shape-gate.test.ts:334:9
    332|           `(noteOutputEvidence). See ${HOME} and notes/PLAN-evidence-o…
    333|           `This site's population: ${entry.note}`,
    334|       ).toBe(entry.calls);
       |         ^
    335|     });
    336|   }
```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  3 failed | 188 passed | 2 skipped (193)
     Tests  7 failed | 2999 passed | 205 skipped (3211)
```

Same 3 files / 7 tests as in (a) above (`test/rebuild.test.ts` ×4, `test/recorder-evidence.test.ts` ×2, `test/shape-gate.test.ts` ×1) — identical failures, not reproduced twice here.

Named tests (all passed):

| test | result |
| --- | --- |
| `test/commentary-report.test.ts` | ✓ 6 tests |
| `test/flow.test.ts` | ✓ 179 tests |
| `test/task-constants.test.ts` | ✓ 8 tests |
| `test/ledger.test.ts` | ✓ 46 tests |
| `test/facts-value.test.ts` | ✓ 22 tests |
| `test/spec-repair.test.ts` | ✓ 131 tests |
| `test/rerecord.test.ts` | ✓ 33 tests |
| `test/sourcing-hold.browser.test.ts` | ✓ 6 tests |

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  204 passed (204)
```

No failures.

## d/e. Corpus check vs. baseline (`results/verify-site-facts-0` / `sf0-41b794a7.json`)

`bench/corpus-check.mjs` compiled every published `results/*` branch: **375 rows** written to `bench/corpus-snapshots/cr-5e94c2b4.json`. Baseline (`sf0-41b794a7.json`) has 373 rows.

Comparing by `runid`, field `status`:

- **Changed status: 0.** No runid present in both files changed `status`.
- **New runids (in current corpus, not in baseline): 2** — `fwop21`, `fwsi18` (branches published after the baseline snapshot was taken; not a regression).

(`corpus-check.mjs`'s own report also lists 5 "newly-refusing" and 5 "fixed" branches under "movement against the branch's own compile log" — that metric compares each branch's row against its own previously-recorded compile status, a different axis from the runid/status diff against the baseline snapshot required by step e, and is included here only for completeness, not as part of the PASS/FAIL gate.)

## f. Offline rebuild of `results/fwgt17-cf64fa` (gitea)

```
=== fwgt17-n1 ===
   1 success reads= 1  model-named=[issues_url,open_issue_count,closed_issue_count,issue_3_title,issue_2_title,issue_1_title,open_seed_issue_titles_1,open_seed_issue_titles_2,open_seed_issue_titles_3,issue_numbers_1,issue_numbers_2,issue_numbers_3]  would-ask=[]  backfilled=[]
      recorded ask: asked=[http://127.0.0.1:8095/bench/bench-repo/issues] named=true
   2 success reads= 1  model-named=[issue_number,issue_title,issue_description,issue_page_heading,run_id]  would-ask=[]  backfilled=[]
   3 blocked reads= 5  model-named=[issue_number,issue_title,labels_confirmed_applied,labels_intended,labels_not_applied_or_not_removed,hidden_label_ids_values]  would-ask=[]  backfilled=[issue_content_right_ui_l,issue_content_right_ui_l_2,issue_content_right_ui_l_3]
   4 success reads= 6  model-named=[issue_number,issue_url,labels_shown_on_issue,labels_displayed_text,labels_picker_state,sidebar_label_bug,sidebar_label_priority_high,run_id,timeline_event_bug_label_added,server_timeline_events_2]  would-ask=[]  backfilled=[]
      recorded ask: asked=[http://127.0.0.1:8095/bench/bench-repo/issues/4] named=true
   5 success reads= 3  model-named=[issue_number,assignee_shown_on_issue,assignee_displayed_with_full_name,assignee_user_id,assignees_picker_state,server_timeline_event,issue_label_state_unchanged,sidebar_assignees_section_text_1,sidebar_assignee_username,sidebar_assignee_full_name,sidebar_assignee_option_username,issue_sidebar_combo_a_it_2_2]  would-ask=[]  backfilled=[issue_sidebar_combo_a_it,issue_sidebar_combo_a_it_2,issue_sidebar_combo_a_hr]
   6 success reads= 6  model-named=[issue_number,milestone_shown_on_issue,labels_shown_on_issue,assignee_shown_on_issue,milestone_id,milestone_picker_state,milestone_update_request,server_timeline_event,labels_shown_on_issue_2,sidebar_label_bug,sidebar_label_priority_high]  would-ask=[]  backfilled=[]
   7 success reads= 4  model-named=[issue_number,comment_dom_id,comment_text,issue_title,labels_shown_on_issue,assignee_shown_on_issue,milestone_shown_on_issue,server_response_contains_comment,labels_shown_on_issue_2,run_id]  would-ask=[]  backfilled=[]
   8 success reads= 7  model-named=[issue_page_url,issue_title_and_number,issue_description,assignee,milestone,issues_list_open_count,issues_list_closed_count,labels_shown_on_issue,assignee_shown_on_issue,milestone_shown_on_issue,breadcrumb_repo_owner,breadcrumb_repo_name,run_id,labels_1,labels_2,seed_open_issue_titles_1,seed_open_issue_titles_2,seed_open_issue_titles_3]  would-ask=[]  backfilled=[]
   9 success reads= 2  model-named=[issue_title_and_number,issue_state,comment_count,close_issue_button_text,comment_button_text,run_id]  would-ask=[]  backfilled=[comment_body,comment_body_2]
  flow: 8 step(s), 18 cross-step reference(s)
  refs: {"{{runid}}":13,"{{02-create.url}}":11,"{{02-create.issue_number}}":4,"{{01-open.url}}":3,"{{env:APP_PASSWORD}}":2}
    01-open publishes [issues_url,open_issue_count,closed_issue_count,issue_3_title,issue_2_title,issue_1_title,open_seed_issue_titles_1,open_seed_issue_titles_2,open_seed_issue_titles_3,issue_numbers_1,issue_numbers_2,issue_numbers_3]
    02-create publishes [issue_number,issue_title,issue_description,issue_page_heading,run_id]
    03-open publishes [issue_number,issue_url,labels_shown_on_issue,labels_displayed_text,labels_picker_state,sidebar_label_bug,sidebar_label_priority_high,run_id,timeline_event_bug_label_added,server_timeline_events_2]
    04-open publishes [issue_number,assignee_shown_on_issue,assignee_displayed_with_full_name,assignee_user_id,assignees_picker_state,server_timeline_event,issue_label_state_unchanged,issue_sidebar_combo_a_it,sidebar_assignees_section_text_1,sidebar_assignee_username,sidebar_assignee_full_name,sidebar_assignee_option_username,issue_sidebar_combo_a_it_2_2]
    05-open publishes [issue_number,milestone_shown_on_issue,labels_shown_on_issue,assignee_shown_on_issue,milestone_id,milestone_picker_state,milestone_update_request,server_timeline_event,labels_shown_on_issue_2,sidebar_label_bug,sidebar_label_priority_high]
    06-add publishes [issue_number,comment_dom_id,comment_text,issue_title,labels_shown_on_issue,assignee_shown_on_issue,milestone_shown_on_issue,server_response_contains_comment,labels_shown_on_issue_2,run_id]
    07-report publishes [issue_page_url,issue_title_and_number,issue_description,assignee,milestone,issues_list_open_count,issues_list_closed_count,labels_shown_on_issue,assignee_shown_on_issue,milestone_shown_on_issue,breadcrumb_repo_owner,breadcrumb_repo_name,run_id,labels_1,labels_2,seed_open_issue_titles_1,seed_open_issue_titles_2,seed_open_issue_titles_3]
    08-report publishes [issue_title_and_number,issue_state,comment_body_1,comment_body_2,comment_count,close_issue_button_text,comment_button_text,run_id]

{
  "tag": "fwgt17",
  "runs": [
    {
      "runid": "fwgt17-n1",
      "instructions": 9,
      "withModelNames": 9,
      "wouldAsk": 0,
      "crossStepRefs": 18,
      "stepsPublishing": 8,
      "flowSteps": 8,
      "adoptedSteps": 0,
      "markers": [
        "3232b1:{{v1}} = \"fwgt17-n1\"",
        "3232b1:{{v2}} = \"fwgt17-n1 Bench Issue\"",
        "063288:{{v2}} = \"fwgt17-n1\"",
        "c178f6:{{v4}} = \"priority-high\"",
        "c178f6:{{v5}} = \"bench-assignee\"",
        "ce29f2:{{v3}} = \"fwgt17-n1\"",
        "ce29f2:{{v4}} = \"fwgt17-n1 Bench Issue\"",
        "b3cc1d:{{v3}} = \"fwgt17-n1\"",
        "b3cc1d:{{v3}} = \"fwgt17-n1\"",
        "6113b8:{{v5}} = \"fwgt17-n1\"",
        "6113b8:{{v5}} = \"fwgt17-n1\""
      ]
    }
  ]
}
```

`08-report` instruction and params (from `rebuilt-fwgt17-n1.json`):

```
Do a fresh full page load of {{02-create.url}} and report the full text of every comment shown on the issue page (the comment body text), plus confirm the issue is open (not closed). Do not change anything.
{"v1":"{{02-create.url}}","v5":"{{runid}}"}
```

**Match against expectation:** partial.
- The 08-report instruction reads "(not closed)" literally — **matches**.
- `params` carry no `labels_picker_state` — **matches**.
- `crossStepRefs` — expected 20, actual **18** — **does not match**.

## Overall: FAIL

a-c are not clean (7 failing tests, in `test/rebuild.test.ts`, `test/recorder-evidence.test.ts`, `test/shape-gate.test.ts`, reproduced identically in both a and b). d/e show 0 status changes against the baseline (pass condition met on that axis), but the overall gate requires 0 failures in a-c, which is not the case. f additionally shows the offline gitea rebuild's `crossStepRefs` (18) does not match the expected value (20), though the "(not closed)" wording and the absence of `labels_picker_state` in params both check out.
