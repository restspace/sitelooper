# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwrd99-fm.spec.ts >> fwrd99-fm
- Location: fwrd99-fm.spec.ts:9:1

# Error details

```
Error: persistence: 03-open typed "fwrd99-fm-spec RD Part A", "100", "25", the record at http://127.0.0.1:4180/#/tickets/t15 does not show it after reload (missing - cell "25%")
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=e3]:
    - generic [ref=e4]:
      - link "Repair Desk" [ref=e5] [cursor=pointer]:
        - /url: "#/tickets"
        - generic [ref=e6]: RD
        - generic [ref=e7]: Repair Desk
      - navigation "Main" [ref=e8]:
        - link "Tickets" [ref=e9] [cursor=pointer]:
          - /url: "#/tickets"
      - generic [ref=e10]:
        - generic [ref=e11]: Bench User
        - button "Sign out" [ref=e12] [cursor=pointer]
  - main [ref=e13]:
    - generic [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]:
          - heading "Repair tickets" [level=1] [ref=e17]
          - paragraph [ref=e18]: Every job on the bench, newest first. Open a ticket to manage its parts.
        - button "New ticket" [ref=e20] [cursor=pointer]
      - region "Filter tickets" [ref=e21]:
        - heading "Filter tickets" [level=2] [ref=e22]
        - generic [ref=e23]:
          - generic [ref=e24]:
            - generic [ref=e25]: Status
            - combobox "Status" [ref=e26]:
              - option "All statuses" [selected]
              - option "Draft"
              - option "Ready"
              - option "Closed"
          - generic [ref=e27]:
            - generic [ref=e28]: Search
            - searchbox "Search" [ref=e29]: fwrd99-fm-spec
            - paragraph [ref=e30]: Matches the reference, the title and the customer name.
          - generic [ref=e31]:
            - checkbox "Show archived" [checked] [active] [ref=e32]
            - generic [ref=e33]: Show archived
      - region "Tickets" [ref=e34]:
        - generic [ref=e35]:
          - heading "Tickets" [level=2] [ref=e36]
          - paragraph [ref=e37]: Showing 1–1 of 1
        - table [ref=e39]:
          - rowgroup [ref=e40]:
            - row "Ref Title Customer Status Parts Created" [ref=e41]:
              - columnheader "Ref" [ref=e42]
              - columnheader "Title" [ref=e43]
              - columnheader "Customer" [ref=e44]
              - columnheader "Status" [ref=e45]
              - columnheader "Parts" [ref=e46]
              - columnheader "Created" [ref=e47]
          - rowgroup [ref=e48]:
            - row "RD-1018 fwrd99-fm-spec RD Bench Ticket Archived Not recorded Ready 0 2026-11-17" [ref=e49]:
              - cell "RD-1018" [ref=e50]:
                - link "RD-1018" [ref=e51] [cursor=pointer]:
                  - /url: "#/tickets/t15"
              - cell "fwrd99-fm-spec RD Bench Ticket Archived" [ref=e52]:
                - text: fwrd99-fm-spec RD Bench Ticket
                - generic [ref=e53]: Archived
              - cell "Not recorded" [ref=e54]
              - cell "Ready" [ref=e55]:
                - generic [ref=e56]: Ready
              - cell "0" [ref=e57]
              - cell "2026-11-17" [ref=e58]
        - generic [ref=e59]:
          - button "Previous" [disabled] [ref=e60]
          - generic [ref=e61]: Page 1 of 1
          - button "Next" [disabled] [ref=e62]
  - contentinfo [ref=e63]:
    - generic [ref=e64]:
      - paragraph [ref=e65]: Repair Desk — internal workshop tooling. Prices include the configured markup.
      - paragraph [ref=e66]: "Environment: local benchmark instance"
```

# Test source

```ts
  23388 |         await settle(page);
  23389 |         urlBefore10 = page.url();
  23390 |       },
  23391 |       act: async () => {
  23392 |         outputs['08-archive.ticket_title'] = await readOptional(page, [
  23393 |           { locator: page.locator('#ticket-rows tr', { hasText: `${p.v3} RD Bench Ticket Archived` }).locator('td:nth-of-type(2)'), index: 0, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: '#ticket-rows tr', hasText: `${p.v3} RD Bench Ticket Archived`, selector: 'td:nth-of-type(2)' }) },
  23394 |           { locator: page.getByText(`${p.v3} RD Bench Ticket Archived`, { exact: true }), index: 1, structural: false, kind: 'text', carries: JSON.stringify({ kind: 'text', text: `${p.v3} RD Bench Ticket Archived` }) },
  23395 |           { locator: page.locator('#ticket-rows > tr > td:nth-of-type(2)'), index: 2, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#ticket-rows > tr > td:nth-of-type(2)' }) },
  23396 |           { locator: pointLocator(page, { x: 433, y: 422 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 433, y: 422, w: 412.1, h: 45.7, role: null, tag: 'td', vw: 1280, vh: 900 }), point: { x: 433, y: 422, w: 412.1, h: 45.7, role: null, tag: 'td', vw: 1280, vh: 900 } },
  23397 |         ], '08-archive s_77d533/8 target', { requireIdentity: identityValues({ v3: p.v3 }, ['{{v3}} RD Bench Ticket Archived', '{{v3}} RD Bench Ticket Archived']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, async (loc: Locator) => scopedReadLanded(await readElements(loc, false, 'text'), { frame: '{{=}} Archived', within: p['v3'] }, loc, { set: true, what: 'text' }), { drift: run.drift, kinds: [{"role":null,"tag":"td"}], label: 'ticket_title' });
  23398 |         await echoRead(echoLedger, run, 'ticket_title', '08-archive.ticket_title', outputs['08-archive.ticket_title'], '08-archive s_77d533/8', page, lastReadHit);
  23399 |         return { status: 'completed', value: undefined };
  23400 |       },
  23401 |       settle: async () => {
  23402 |         if (page.url() !== urlBefore10) await settle(page);
  23403 |       },
  23404 |       bind: async () => {
  23405 |       },
  23406 |       verify: async () => {
  23407 |         errorPageGate(page, '08-archive s_77d533/8');
  23408 |       },
  23409 |     });
  23410 | 
  23411 |     // Shadow: this segment's reads against their recorded report templates (reported, never thrown).
  23412 |     if (shadowEnabled()) for (const line of readShadowLines({"test_run_id":6,"ticket_reference":7,"ticket_title":8}, {"test_run_id":"{{v3}}","ticket_reference":"{{v2}}","ticket_title":"{{v3}} RD Bench Ticket"}, p, { 'test_run_id': outputs['08-archive.test_run_id'] as string | undefined, 'ticket_reference': outputs['08-archive.ticket_reference'] as string | undefined, 'ticket_title': outputs['08-archive.ticket_title'] as string | undefined }, run.echoed.filter((k) => k.startsWith('08-archive.')).map((k) => k.slice(11)))) console.log('[sitelooper shadow] 08-archive s_77d533: ' + line);
  23413 | 
  23414 |     // The step's report values built from this run's own parameters, as the daemon reports them (synthesizeReport).
  23415 |     const reportShown = await shownForReport(page).catch(() => null);
  23416 |     const reportGiven = { typed: ["v3"], live: Object.entries(outputs).filter(([k, v]) => k.startsWith('08-archive.') && typeof v === 'string' && !run.echoed.includes(k)).map(([, v]) => v as string), committed: [...typedCommitted], visited: reportTrail.urls };
  23417 |     reportTrail.stop();
  23418 |     if (outputs['08-archive.ticket_reference'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v2}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('08-archive: report value ticket_reference is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('08-archive: report value ticket_reference is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['08-archive.ticket_reference'] = c.value; }
  23419 |     if (outputs['08-archive.ticket_title'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {"v3":[{"role":"searchbox","name":"Search"}]}, '{{v3}} RD Bench Ticket', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('08-archive: report value ticket_title is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('08-archive: report value ticket_title is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['08-archive.ticket_title'] = c.value; }
  23420 |     if (outputs['08-archive.detail_button_after_archive'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v1}} → replaced by "Unarchive ticket"', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('08-archive: report value detail_button_after_archive is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('08-archive: report value detail_button_after_archive is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['08-archive.detail_button_after_archive'] = c.value; }
  23421 |     if (outputs['08-archive.active_list_before_search'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, 'Showing 1–10 of 13, newest row RD-1014 ({{v2}} absent)', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('08-archive: report value active_list_before_search is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('08-archive: report value active_list_before_search is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['08-archive.active_list_before_search'] = c.value; }
  23422 |     if (outputs['08-archive.archived_list_row'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {"v3":[{"role":"searchbox","name":"Search"}]}, 'Ref {{v2}} | Title "{{v3}} RD Bench Ticket Archived" | Customer Not recorded | Status Ready | Parts 0 | Created 2026-11-17', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('08-archive: report value archived_list_row is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('08-archive: report value archived_list_row is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['08-archive.archived_list_row'] = c.value; }
  23423 |     if (outputs['08-archive.test_run_id'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {"v3":[{"role":"searchbox","name":"Search"}]}, '{{v3}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('08-archive: report value test_run_id is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('08-archive: report value test_run_id is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['08-archive.test_run_id'] = c.value; }
  23424 |   },
  23425 | };
  23426 | 
  23427 | /** Runs every step in order. Each call owns its output and drift state. */
  23428 | export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {
  23429 |   validateInputs(vars);
  23430 |   page.setDefaultTimeout(30000);
  23431 |   page.setDefaultNavigationTimeout(30000);
  23432 |   const run = options.run ?? createFlowRun();
  23433 |   run.outputs = {};
  23434 |   run.drift.length = 0;
  23435 |   run.echoed = [];
  23436 |   run.referenceOnly = [];
  23437 |   run.created = [];
  23438 |   run.warnings = [];
  23439 |   run.partial = [];
  23440 |   run.probes = [];
  23441 |   const outputs = run.outputs;
  23442 |   try {
  23443 |     const browserMismatch = profileMismatch(RECORDED_BROWSER, await readLiveBrowser(page));
  23444 |     if (browserMismatch) {
  23445 |       run.warnings.push(browserMismatch);
  23446 |       console.log(`[sitelooper warn] ${browserMismatch}`);
  23447 |     }
  23448 |     // Traffic is recorded from the start url on, as the daemon records it from adopting the page.
  23449 |     pageTraffic(page);
  23450 |     await page.goto(options.startUrl ?? 'http://127.0.0.1:4180/', { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  23451 |     await waitForContent(page).catch(() => {});
  23452 |     await startPageSettled(page).catch(() => {});
  23453 |     await test.step('01-signin: Sign in to the repair-desk app at http://127.0.0.1:4180/ using email bench@example.com and password exactly {{env:APP_PASSWORD}}. Verify the signed-in app page is visible.', async () => {
  23454 |       await steps['01-signin'](page, { v1: 'http://127.0.0.1:4180/', v2: 'bench@example.com', v3: process.env['APP_PASSWORD'] ?? '' }, outputs, run);
  23455 |       console.log('[sitelooper step] 01-signin');
  23456 |     });
  23457 |     await test.step('02-create: Create a repair ticket titled exactly {{runid}} RD Bench Ticket. Submit it, wait for the refreshed list/detail state, and report the ticket\'s visible reference and title to confirm it exists.', async () => {
  23458 |       await steps['02-create'](page, { v1: vars.runid, v2: `${vars.runid} RD Bench Ticket` }, outputs, run);
  23459 |       console.log('[sitelooper step] 02-create');
  23460 |     });
  23461 |     await test.step('03-open: Open ticket {{02-create.new_ticket_reference}}, add a part named exactly {{runid}} RD Part A with cost 100 and markup 25, save it, wait for the ticket detail to refresh, and report the app-computed part price as shown on the page.', async () => {
  23462 |       await steps['03-open'](page, { v1: need(outputs, '02-create.new_ticket_reference', '03-open'), v2: vars.runid, v3: `${vars.runid} RD Part A`, v4: '100', v5: '25' }, outputs, run);
  23463 |       console.log('[sitelooper step] 03-open');
  23464 |     });
  23465 |     await test.step('04-add: On ticket {{02-create.new_ticket_reference}}, add a second part named exactly {{runid}} RD Part B with cost 200 and markup 25, save it, wait for the detail to refresh, and report its app-computed price as shown.', async () => {
  23466 |       await steps['04-add'](page, { v1: outputs['02-create.new_ticket_reference'] ?? '', v2: vars.runid, v3: `${vars.runid} RD Part B`, v4: '200', v5: '25' }, outputs, run);
  23467 |       console.log('[sitelooper step] 04-add');
  23468 |     });
  23469 |     await test.step('05-edit: On ticket {{02-create.new_ticket_reference}}, edit the existing part {{runid}} RD Part A and change its cost from 100 to 150, keeping its markup at 25. Save, wait for the refreshed detail, and report Part A\'s new app-computed price from the visible page.', async () => {
  23470 |       await steps['05-edit'](page, { v1: outputs['02-create.new_ticket_reference'] ?? '', v2: `${vars.runid} RD Part A`, v3: vars.runid, v4: '150' }, outputs, run);
  23471 |       console.log('[sitelooper step] 05-edit');
  23472 |     });
  23473 |     await test.step('06-change: Make ticket {{02-create.new_ticket_reference}} reach status Ready. Discover any app-enforced preconditions by attempting the status change and reading the validation messages; satisfy all required conditions and retry. Verify the final visible status is Ready and report exactly every requirement the app imposed and what was done to satisfy it.', async () => {
  23474 |       await steps['06-change'](page, { v1: outputs['02-create.new_ticket_reference'] ?? '', v2: vars.runid }, outputs, run);
  23475 |       console.log('[sitelooper step] 06-change');
  23476 |     });
  23477 |     await test.step('07-remove: On ticket {{02-create.new_ticket_reference}}, remove both parts {{runid}} RD Part A and {{runid}} RD Part B. Wait after each mutation for the detail view to refresh and verify the Parts table has no rows and the parts total is zero; report the visible ticket status too.', async () => {
  23478 |       await steps['07-remove'](page, { v1: outputs['02-create.new_ticket_reference'] ?? '', v2: `${vars.runid} RD Part A`, v3: vars.runid, v4: `${vars.runid} RD Part B` }, outputs, run);
  23479 |       console.log('[sitelooper step] 07-remove');
  23480 |     });
  23481 |     await test.step('08-archive: Archive ticket {{02-create.new_ticket_reference}} after the two parts have been removed. Complete any confirmation the app requires, wait for the refreshed page, and verify the ticket is archived and no longer active in the tickets list. Report exact visible confirmation/status evidence.', async () => {
  23482 |       await steps['08-archive'](page, { v1: 'Archive ticket', v2: outputs['02-create.new_ticket_reference'] ?? '', v3: vars.runid }, outputs, run);
  23483 |       console.log('[sitelooper step] 08-archive');
  23484 |     });
  23485 |     const unpersisted = await test.step('persistence: re-read what the flow saved', async () => await runProbes(page, run));
  23486 |     const failures: string[] = [...unpersisted];
  23487 |     if (run.partial.length && process.env.SITELOOPER_ALLOW_PARTIAL !== '1') failures.push(`PARTIAL: ${run.partial.join('; ')}`);
> 23488 |     if (failures.length) throw new Error(failures.join('\n'));
        |                                ^ Error: persistence: 03-open typed "fwrd99-fm-spec RD Part A", "100", "25", the record at http://127.0.0.1:4180/#/tickets/t15 does not show it after reload (missing - cell "25%")
  23489 |     return outputs;
  23490 |   } finally {
  23491 |     DRIFT.splice(0, DRIFT.length, ...run.drift);
  23492 |     await publishOutputs(run);
  23493 |   }
  23494 | }
  23495 | 
```