# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwrd97-fr.spec.ts >> fwrd97-fr
- Location: fwrd97-fr.spec.ts:9:1

# Error details

```
Error: persistence: 03-add typed "fwrd97-frb-spec RD Part A", "100", "25", the record at http://127.0.0.1:4180/#/tickets/t15 does not show it after reload (missing - row "fwrd97-frb-spec RD Part A $100{{*}} 25% {{*}} {{*}} {{*}} Edit Delete" | - cell "fwrd97-frb-spec RD Part A" | - cell "$100{{*}}" | - cell "25%")
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
            - searchbox "Search" [ref=e29]
            - paragraph [ref=e30]: Matches the reference, the title and the customer name.
          - generic [ref=e31]:
            - checkbox "Show archived" [checked] [active] [ref=e32]
            - generic [ref=e33]: Show archived
      - region "Tickets" [ref=e34]:
        - generic [ref=e35]:
          - heading "Tickets" [level=2] [ref=e36]
          - paragraph [ref=e37]: Showing 1–10 of 15
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
            - row "RD-1015 fwrd97-frb-spec RD Bench Ticket Archived Marlow Bakery Ready 0 2026-11-11" [ref=e49]:
              - cell "RD-1015" [ref=e50]:
                - link "RD-1015" [ref=e51] [cursor=pointer]:
                  - /url: "#/tickets/t15"
              - cell "fwrd97-frb-spec RD Bench Ticket Archived" [ref=e52]:
                - text: fwrd97-frb-spec RD Bench Ticket
                - generic [ref=e53]: Archived
              - cell "Marlow Bakery" [ref=e54]
              - cell "Ready" [ref=e55]:
                - generic [ref=e56]: Ready
              - cell "0" [ref=e57]
              - cell "2026-11-11" [ref=e58]
            - row "RD-1014 Under-counter fridge door misaligned Marlow Bakery Draft 1 2026-01-23" [ref=e59]:
              - cell "RD-1014" [ref=e60]:
                - link "RD-1014" [ref=e61] [cursor=pointer]:
                  - /url: "#/tickets/t14"
              - cell "Under-counter fridge door misaligned" [ref=e62]
              - cell "Marlow Bakery" [ref=e63]
              - cell "Draft" [ref=e64]:
                - generic [ref=e65]: Draft
              - cell "1" [ref=e66]
              - cell "2026-01-23" [ref=e67]
            - row "RD-1013 Bain-marie thermostat drifting Archived Blue Fox Cafe Closed 1 2026-01-22" [ref=e68]:
              - cell "RD-1013" [ref=e69]:
                - link "RD-1013" [ref=e70] [cursor=pointer]:
                  - /url: "#/tickets/t13"
              - cell "Bain-marie thermostat drifting Archived" [ref=e71]:
                - text: Bain-marie thermostat drifting
                - generic [ref=e72]: Archived
              - cell "Blue Fox Cafe" [ref=e73]
              - cell "Closed" [ref=e74]:
                - generic [ref=e75]: Closed
              - cell "1" [ref=e76]
              - cell "2026-01-22" [ref=e77]
            - row "RD-1012 Ice machine producing hollow cubes The Anchor Inn Draft 2 2026-01-21" [ref=e78]:
              - cell "RD-1012" [ref=e79]:
                - link "RD-1012" [ref=e80] [cursor=pointer]:
                  - /url: "#/tickets/t12"
              - cell "Ice machine producing hollow cubes" [ref=e81]
              - cell "The Anchor Inn" [ref=e82]
              - cell "Draft" [ref=e83]:
                - generic [ref=e84]: Draft
              - cell "2" [ref=e85]
              - cell "2026-01-21" [ref=e86]
            - row "RD-1011 Card terminal will not pair Pinehurst Grocers Draft 0 2026-01-20" [ref=e87]:
              - cell "RD-1011" [ref=e88]:
                - link "RD-1011" [ref=e89] [cursor=pointer]:
                  - /url: "#/tickets/t11"
              - cell "Card terminal will not pair" [ref=e90]
              - cell "Pinehurst Grocers" [ref=e91]
              - cell "Draft" [ref=e92]:
                - generic [ref=e93]: Draft
              - cell "0" [ref=e94]
              - cell "2026-01-20" [ref=e95]
            - row "RD-1010 Proving cabinet humidity too low Marlow Bakery Draft 1 2026-01-19" [ref=e96]:
              - cell "RD-1010" [ref=e97]:
                - link "RD-1010" [ref=e98] [cursor=pointer]:
                  - /url: "#/tickets/t10"
              - cell "Proving cabinet humidity too low" [ref=e99]
              - cell "Marlow Bakery" [ref=e100]
              - cell "Draft" [ref=e101]:
                - generic [ref=e102]: Draft
              - cell "1" [ref=e103]
              - cell "2026-01-19" [ref=e104]
            - row "RD-1009 Coffee grinder inconsistent grind Blue Fox Cafe Draft 1 2026-01-16" [ref=e105]:
              - cell "RD-1009" [ref=e106]:
                - link "RD-1009" [ref=e107] [cursor=pointer]:
                  - /url: "#/tickets/t9"
              - cell "Coffee grinder inconsistent grind" [ref=e108]
              - cell "Blue Fox Cafe" [ref=e109]
              - cell "Draft" [ref=e110]:
                - generic [ref=e111]: Draft
              - cell "1" [ref=e112]
              - cell "2026-01-16" [ref=e113]
            - row "RD-1008 Glass washer leaves residue The Anchor Inn Ready 1 2026-01-15" [ref=e114]:
              - cell "RD-1008" [ref=e115]:
                - link "RD-1008" [ref=e116] [cursor=pointer]:
                  - /url: "#/tickets/t8"
              - cell "Glass washer leaves residue" [ref=e117]
              - cell "The Anchor Inn" [ref=e118]
              - cell "Ready" [ref=e119]:
                - generic [ref=e120]: Ready
              - cell "1" [ref=e121]
              - cell "2026-01-15" [ref=e122]
            - row "RD-1007 Extractor fan noisy at full speed Marlow Bakery Draft 1 2026-01-14" [ref=e123]:
              - cell "RD-1007" [ref=e124]:
                - link "RD-1007" [ref=e125] [cursor=pointer]:
                  - /url: "#/tickets/t7"
              - cell "Extractor fan noisy at full speed" [ref=e126]
              - cell "Marlow Bakery" [ref=e127]
              - cell "Draft" [ref=e128]:
                - generic [ref=e129]: Draft
              - cell "1" [ref=e130]
              - cell "2026-01-14" [ref=e131]
            - row "RD-1006 Walk-in fridge alarm keeps sounding Pinehurst Grocers Draft 1 2026-01-13" [ref=e132]:
              - cell "RD-1006" [ref=e133]:
                - link "RD-1006" [ref=e134] [cursor=pointer]:
                  - /url: "#/tickets/t6"
              - cell "Walk-in fridge alarm keeps sounding" [ref=e135]
              - cell "Pinehurst Grocers" [ref=e136]
              - cell "Draft" [ref=e137]:
                - generic [ref=e138]: Draft
              - cell "1" [ref=e139]
              - cell "2026-01-13" [ref=e140]
        - generic [ref=e141]:
          - button "Previous" [disabled] [ref=e142]
          - generic [ref=e143]: Page 1 of 2
          - button "Next" [ref=e144] [cursor=pointer]
  - contentinfo [ref=e145]:
    - generic [ref=e146]:
      - paragraph [ref=e147]: Repair Desk — internal workshop tooling. Prices include the configured markup.
      - paragraph [ref=e148]: "Environment: local benchmark instance"
```

# Test source

```ts
  24769 |     // @step 07-remove s_fdf56b/7
  24770 |     let urlBefore14 = '';
  24771 |     await runStepLifecycle({
  24772 |       prepare: async () => {
  24773 |         await settle(page);
  24774 |         urlBefore14 = page.url();
  24775 |       },
  24776 |       act: async () => {
  24777 |         absentDialog = null;
  24778 |         outputs['07-remove.ticket_title_prefix'] = await readOptional(page, [
  24779 |           { locator: page.locator('#ticket-rows tr', { hasText: `${p.v2} Archived` }).locator('td:nth-of-type(2)'), index: 0, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: '#ticket-rows tr', hasText: `${p.v2} Archived`, selector: 'td:nth-of-type(2)' }) },
  24780 |           { locator: page.getByText(`${p.v2} Archived`, { exact: true }), index: 1, structural: false, kind: 'text', carries: JSON.stringify({ kind: 'text', text: `${p.v2} Archived` }) },
  24781 |           { locator: page.locator('#ticket-rows > tr:nth-of-type(1) > td:nth-of-type(2)'), index: 2, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#ticket-rows > tr:nth-of-type(1) > td:nth-of-type(2)' }) },
  24782 |           { locator: pointLocator(page, { x: 415, y: 423 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 415, y: 423, w: 387.5, h: 46.2, role: null, tag: 'td', vw: 1280, vh: 900 }), point: { x: 415, y: 423, w: 387.5, h: 46.2, role: null, tag: 'td', vw: 1280, vh: 900 } },
  24783 |         ], '07-remove s_fdf56b/7 target', { requireIdentity: identityValues({ v2: p.v2 }, ['{{v2}} Archived', '{{v2}} Archived']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, async (loc: Locator) => scopedRead(await readElements(loc, false, 'text'), { frame: '{{=}} RD Bench Ticket Archived', slotFrame: `${p.v2} Archived`, mark: p['v3'] }), { drift: run.drift, kinds: [{"role":null,"tag":"td"}], label: 'ticket_title_prefix' });
  24784 |         await echoRead(echoLedger, run, 'ticket_title_prefix', '07-remove.ticket_title_prefix', outputs['07-remove.ticket_title_prefix'], '07-remove s_fdf56b/7', page, lastReadHit);
  24785 |         return { status: 'completed', value: undefined };
  24786 |       },
  24787 |       settle: async () => {
  24788 |         if (page.url() !== urlBefore14) await settle(page);
  24789 |       },
  24790 |       bind: async () => {
  24791 |       },
  24792 |       verify: async () => {
  24793 |         errorPageGate(page, '07-remove s_fdf56b/7');
  24794 |       },
  24795 |     });
  24796 | 
  24797 |     // Shadow: this segment's reads against their recorded report templates (reported, never thrown).
  24798 |     if (shadowEnabled()) for (const line of readShadowLines({"parts_count_after":2,"ticket_reference":3,"archived_list_total":4,"archived_row":5,"ticket_title":6,"ticket_title_prefix":7}, {"parts_count_after":"0","ticket_reference":"{{v1}}","archived_list_total":"Showing 1–10 of 15","archived_row":"{{v1}}\t{{v2}}\tArchived\tMarlow Bakery\tReady\t0\t2026-11-11","ticket_title":"{{v2}}","ticket_title_prefix":"{{v3}}"}, p, { 'parts_count_after': outputs['07-remove.parts_count_after'] as string | undefined, 'ticket_reference': outputs['07-remove.ticket_reference'] as string | undefined, 'archived_list_total': outputs['07-remove.archived_list_total'] as string | undefined, 'archived_row': outputs['07-remove.archived_row'] as string | undefined, 'ticket_title': outputs['07-remove.ticket_title'] as string | undefined, 'ticket_title_prefix': outputs['07-remove.ticket_title_prefix'] as string | undefined }, run.echoed.filter((k) => k.startsWith('07-remove.')).map((k) => k.slice(10)))) console.log('[sitelooper shadow] 07-remove s_fdf56b: ' + line);
  24799 | 
  24800 |     // The step's report values built from this run's own parameters, as the daemon reports them (synthesizeReport).
  24801 |     const reportShown = await shownForReport(page).catch(() => null);
  24802 |     const reportGiven = { typed: [], live: Object.entries(outputs).filter(([k, v]) => k.startsWith('07-remove.') && typeof v === 'string' && !run.echoed.includes(k)).map(([, v]) => v as string), committed: [...typedCommitted], visited: reportTrail.urls };
  24803 |     reportTrail.stop();
  24804 |     if (outputs['07-remove.archived_row'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v1}}	{{v2}}	Archived	Marlow Bakery	Ready	0	2026-11-11', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-remove: report value archived_row is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-remove: report value archived_row is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-remove.archived_row'] = c.value; }
  24805 |     if (outputs['07-remove.ticket_reference'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v1}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-remove: report value ticket_reference is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-remove: report value ticket_reference is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-remove.ticket_reference'] = c.value; }
  24806 |     if (outputs['07-remove.ticket_title'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v2}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-remove: report value ticket_title is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-remove: report value ticket_title is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-remove.ticket_title'] = c.value; }
  24807 |     if (outputs['07-remove.tickets_list_active_count'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, 'Showing 1–10 of 13 (was 14); {{v1}} absent from active list', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-remove: report value tickets_list_active_count is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-remove: report value tickets_list_active_count is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-remove.tickets_list_active_count'] = c.value; }
  24808 |     if (outputs['07-remove.ticket_title_prefix'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v3}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-remove: report value ticket_title_prefix is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-remove: report value ticket_title_prefix is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-remove.ticket_title_prefix'] = c.value; }
  24809 |   },
  24810 | };
  24811 | 
  24812 | /** Runs every step in order. Each call owns its output and drift state. */
  24813 | export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {
  24814 |   validateInputs(vars);
  24815 |   page.setDefaultTimeout(30000);
  24816 |   page.setDefaultNavigationTimeout(30000);
  24817 |   const run = options.run ?? createFlowRun();
  24818 |   run.outputs = {};
  24819 |   run.drift.length = 0;
  24820 |   run.echoed = [];
  24821 |   run.referenceOnly = [];
  24822 |   run.created = [];
  24823 |   run.warnings = [];
  24824 |   run.partial = [];
  24825 |   run.probes = [];
  24826 |   const outputs = run.outputs;
  24827 |   try {
  24828 |     const browserMismatch = profileMismatch(RECORDED_BROWSER, await readLiveBrowser(page));
  24829 |     if (browserMismatch) {
  24830 |       run.warnings.push(browserMismatch);
  24831 |       console.log(`[sitelooper warn] ${browserMismatch}`);
  24832 |     }
  24833 |     // Traffic is recorded from the start url on, as the daemon records it from adopting the page.
  24834 |     pageTraffic(page);
  24835 |     await page.goto(options.startUrl ?? 'http://127.0.0.1:4180/', { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  24836 |     await waitForContent(page).catch(() => {});
  24837 |     await startPageSettled(page).catch(() => {});
  24838 |     await test.step('01-signin: Sign in to the repair-desk app at http://127.0.0.1:4180/ using email bench@example.com and password exactly {{env:APP_PASSWORD}}. Verify that the signed-in app is visible and report the resulting page.', async () => {
  24839 |       await steps['01-signin'](page, { v1: 'http://127.0.0.1:4180/', v2: 'bench@example.com', v3: process.env['APP_PASSWORD'] ?? '' }, outputs, run);
  24840 |       console.log('[sitelooper step] 01-signin');
  24841 |     });
  24842 |     await test.step('02-create: Create a repair ticket titled {{runid}} RD Bench Ticket. Fill any required fields with valid values, submit it, wait for the post-mutation list/detail refresh, and verify the exact ticket title exists; report its visible reference and status.', async () => {
  24843 |       await steps['02-create'](page, { v1: vars.runid, v2: `${vars.runid} RD Bench Ticket` }, outputs, run);
  24844 |       console.log('[sitelooper step] 02-create');
  24845 |     });
  24846 |     await test.step('03-add: On ticket {{02-create.ticket_reference}} titled {{runid}} RD Bench Ticket, add a part named {{runid}} RD Part A with cost 100 and markup 25. Submit/save it, wait for the refreshed ticket state, and report the computed price displayed for that part.', async () => {
  24847 |       await steps['03-add'](page, { v1: need(outputs, '02-create.ticket_reference', '03-add'), v2: `${vars.runid} RD Bench Ticket`, v3: vars.runid, v4: `${vars.runid} RD Part A`, v5: '100', v6: '25' }, outputs, run);
  24848 |       console.log('[sitelooper step] 03-add');
  24849 |     });
  24850 |     await test.step('04-add: On ticket {{02-create.ticket_reference}} titled {{runid}} RD Bench Ticket, add a second part named {{runid}} RD Part B with cost 200 and markup 25. Save it, wait for the refreshed ticket state, and verify/report the computed price for Part B.', async () => {
  24851 |       await steps['04-add'](page, { v1: outputs['02-create.ticket_reference'] ?? '', v2: `${vars.runid} RD Bench Ticket`, v3: vars.runid, v4: `${vars.runid} RD Part B`, v5: '200', v6: '25' }, outputs, run);
  24852 |       console.log('[sitelooper step] 04-add');
  24853 |     });
  24854 |     await test.step('05-edit: On ticket {{02-create.ticket_reference}}, edit {{runid}} RD Part A and change its cost from 100 to 150 while keeping markup at 25 and other values unchanged. Save, wait for the refreshed parts table, and report Part A\'s new computed price.', async () => {
  24855 |       await steps['05-edit'](page, { v1: outputs['02-create.ticket_reference'] ?? '', v2: `${vars.runid} RD Part A`, v3: vars.runid, v4: '150' }, outputs, run);
  24856 |       console.log('[sitelooper step] 05-edit');
  24857 |     });
  24858 |     await test.step('06-change: On ticket {{02-create.ticket_reference}} titled {{runid}} RD Bench Ticket, move the ticket to status Ready. Discover any enforced preconditions from the app, satisfy them as needed, retry the status change, and verify Ready. Report exactly each requirement encountered, what was done to satisfy it, and the final visible status.', async () => {
  24859 |       await steps['06-change'](page, { v1: outputs['02-create.ticket_reference'] ?? '', v2: `${vars.runid} RD Bench Ticket`, v3: vars.runid }, outputs, run);
  24860 |       console.log('[sitelooper step] 06-change');
  24861 |     });
  24862 |     await test.step('07-remove: On ticket {{02-create.ticket_reference}} titled {{runid}} RD Bench Ticket, remove both parts {{runid}} RD Part A and {{runid}} RD Part B, verifying the refreshed parts table is empty. Then archive the ticket using the app\'s available action, wait for refresh, and verify confirmation/archive status and that the ticket is no longer active in the tickets list. Report the concrete confirmations and final state.', async () => {
  24863 |       await steps['07-remove'](page, { v1: outputs['02-create.ticket_reference'] ?? '', v2: `${vars.runid} RD Bench Ticket`, v3: vars.runid, v4: `${vars.runid} RD Part A`, v5: `${vars.runid} RD Part B` }, outputs, run);
  24864 |       console.log('[sitelooper step] 07-remove');
  24865 |     });
  24866 |     const unpersisted = await test.step('persistence: re-read what the flow saved', async () => await runProbes(page, run));
  24867 |     const failures: string[] = [...unpersisted];
  24868 |     if (run.partial.length && process.env.SITELOOPER_ALLOW_PARTIAL !== '1') failures.push(`PARTIAL: ${run.partial.join('; ')}`);
> 24869 |     if (failures.length) throw new Error(failures.join('\n'));
        |                                ^ Error: persistence: 03-add typed "fwrd97-frb-spec RD Part A", "100", "25", the record at http://127.0.0.1:4180/#/tickets/t15 does not show it after reload (missing - row "fwrd97-frb-spec RD Part A $100{{*}} 25% {{*}} {{*}} {{*}} Edit Delete" | - cell "fwrd97-frb-spec RD Part A" | - cell "$100{{*}}" | - cell "25%")
  24870 |     return outputs;
  24871 |   } finally {
  24872 |     DRIFT.splice(0, DRIFT.length, ...run.drift);
  24873 |     await publishOutputs(run);
  24874 |   }
  24875 | }
  24876 | 
```