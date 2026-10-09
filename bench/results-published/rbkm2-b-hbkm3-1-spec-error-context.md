# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hbkm3.spec.ts >> hbkm3
- Location: hbkm3.spec.ts:9:1

# Error details

```
Error: 05-create s_13c99d: identity: {{v1}} is not confirmed on this page
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]: "404"
  - paragraph [ref=e6]: Page not found
  - paragraph [ref=e7]: We could not find the page you were looking for. Please return to your dashboard and start over.
  - link " Take me home" [ref=e9] [cursor=pointer]:
    - /url: /en/dashboard/
    - generic [ref=e10]: 
    - text: Take me home
```

# Test source

```ts
  19509 |             try { await urlEffect(page, 'http://127.0.0.1:8105/en/timesheet/', p, '05-create s_8cf305/27', volatile2, obs28?.link()); } catch (err) { urlFailed28 = true; throw err; }
  19510 |             // The step's recorded page changes, judged by the daemon's own effect gate (see expectChanges):
  19511 |             //   - row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"
  19512 |             //   - checkbox "Select all entries for batch update list"
  19513 |             //   - cell "DATE"
  19514 |             //   - cell "BEGIN"
  19515 |             //   - cell "END"
  19516 |             const changes28 = await expectChanges(page, ['- row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"', '- checkbox "Select all entries for batch update list"', '- cell "DATE"', '- cell "BEGIN"', '- cell "END"'], p, { tag: '05-create s_8cf305/27', tool: 'click', leftByLink: leftByLink('http://127.0.0.1:8105/en/timesheet/', page.url(), p, obs28?.link()), positionalResolution: positional28 }, linesBefore28, 2, linesAfter28);
  19517 |             noteCommit(echoLedger, liveLines(changes28.inDiff ?? [], p, counterNames(siteFactsAt(page.url()), page.url())), 's_8cf305/27');
  19518 |             for (const slot of committedSlots('click', changes28.inDiff)) typedCommitted.add(slot);
  19519 |             alertGate(alertsBefore28, alertsAfter28, { where: '05-create s_8cf305/27', isRead: false, params: p, effectConfirmed: changes28.confirmed === true });
  19520 |           },
  19521 |         });
  19522 |         break;
  19523 |       } catch (err) {
  19524 |         if (attempt > 0 || !urlFailed28 || !(await standingFillsLost(page, filled2))) throw err;
  19525 |         urlFailed28 = false;
  19526 |         rearmStandingFills(filled2);
  19527 |         logWarning('05-create s_8cf305/27: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  19528 |       }
  19529 |     }
  19530 | 
  19531 |     // @step 05-create s_8cf305/28
  19532 |     let urlBefore29 = '';
  19533 |     await runStepLifecycle({
  19534 |       prepare: async () => {
  19535 |         await settle(page);
  19536 |         urlBefore29 = page.url();
  19537 |       },
  19538 |       act: async () => {
  19539 |         absentDialog = null;
  19540 |         outputs['05-create.list_row'] = await readOptional(page, [
  19541 |           { locator: page.locator('table tbody tr'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'table tbody tr' }) },
  19542 |           { locator: page.locator('tr.modal-ajax-form', { hasText: `${p.v1}` }), index: 1, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'tr.modal-ajax-form', hasText: `${p.v1}` }) },
  19543 |           { locator: page.locator('div > div:nth-of-type(1) > div > table > tbody > tr'), index: 2, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'div > div:nth-of-type(1) > div > table > tbody > tr' }) },
  19544 |           { locator: pointLocator(page, { x: 760, y: 207 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 }), point: { x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 } },
  19545 |         ], '05-create s_8cf305/28 target', { allowMultiple: true, requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, true, 'text'), { drift: run.drift, kinds: [{"role":null,"tag":"tr"}], label: 'list_row' });
  19546 |         await echoRead(echoLedger, run, 'list_row', '05-create.list_row', outputs['05-create.list_row'], '05-create s_8cf305/28', page, lastReadHit);
  19547 |         return { status: 'completed', value: undefined };
  19548 |       },
  19549 |       settle: async () => {
  19550 |         if (page.url() !== urlBefore29) await settle(page);
  19551 |       },
  19552 |       bind: async () => {
  19553 |       },
  19554 |       verify: async () => {
  19555 |         errorPageGate(page, '05-create s_8cf305/28');
  19556 |       },
  19557 |     });
  19558 | 
  19559 |     // @step 05-create s_8cf305/29
  19560 |     let urlBefore30 = '';
  19561 |     let alertsBefore30: string[] = [];
  19562 |     let alertsAfter30: ObservedAlerts | null = null;
  19563 |     let nav30: NavigationTarget = { url: '' };
  19564 |     await runStepLifecycle({
  19565 |       prepare: async () => {
  19566 |         await settle(page);
  19567 |         for (const warning of await restoreStandingFills(page, filled2, 'goto', '05-create s_8cf305/29')) logWarning(warning);
  19568 |         urlBefore30 = page.url();
  19569 |         alertsBefore30 = (await liveAlerts(page)) ?? [];
  19570 |       },
  19571 |       act: async () => {
  19572 |         absentDialog = null;
  19573 |         nav30 = navigationTarget('http://127.0.0.1:8105/en/timesheet/10/edit', page, volatile2, '05-create s_8cf305/29');
  19574 |         await page.goto(nav30.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  19575 |         return { status: 'completed', value: undefined };
  19576 |       },
  19577 |       settle: async () => {
  19578 |         if (page.url() !== urlBefore30) await settle(page);
  19579 |         alertsAfter30 = await settledAlerts(page);
  19580 |       },
  19581 |       bind: async () => {
  19582 |       },
  19583 |       verify: async () => {
  19584 |         errorPageGate(page, '05-create s_8cf305/29');
  19585 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav30.url, landed, '05-create s_8cf305/29'); if (landing) throw new Error(landing); }
  19586 |         alertGate(alertsBefore30, alertsAfter30, { where: '05-create s_8cf305/29', isRead: false, params: p, navigatedToStale: nav30.stale });
  19587 |       },
  19588 |     });
  19589 | 
  19590 |     // s_13c99d: Create and save exactly one timesheet entry on project '{{v1}}' for 2026-09-16 from 09:00 to 11:30, with a description including exact runid '{{v2}}'. Choose the existing activity exactly '{{v3}}' and…
  19591 |     // recorded on a page matching http://127.0.0.1:8105/en/timesheet/:id/edit
  19592 |     const readsBefore3 = skippedReads.length;
  19593 | 
  19594 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  19595 |     await preconditionGate('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, '05-create s_13c99d', cosine(recordedFingerprint('05-create', 's_13c99d'), (await fingerprintPage(page)) ?? undefined));
  19596 |     // identity: this must be the record the flow is working on, not another of the same shape.
  19597 |     {
  19598 |       let seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  19599 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  19600 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  19601 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  19602 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  19603 |           seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  19604 |         }
  19605 |       }
  19606 |       if (seen.presence !== 'present') {
  19607 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v1}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  19608 |         if (verdict.warning) logWarning('05-create s_13c99d: ' + verdict.warning);
> 19609 |         if (!verdict.pass) throw new Error('05-create s_13c99d: identity: {{v1}} is not confirmed on this page');
        |                                  ^ Error: 05-create s_13c99d: identity: {{v1}} is not confirmed on this page
  19610 |       }
  19611 |     }
  19612 |     // identity: this must be the record the flow is working on, not another of the same shape.
  19613 |     {
  19614 |       let seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  19615 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  19616 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  19617 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  19618 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  19619 |           seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  19620 |         }
  19621 |       }
  19622 |       if (seen.presence !== 'present') {
  19623 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v2}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  19624 |         if (verdict.warning) logWarning('05-create s_13c99d: ' + verdict.warning);
  19625 |         if (!verdict.pass) throw new Error('05-create s_13c99d: identity: {{v2}} is not confirmed on this page');
  19626 |       }
  19627 |     }
  19628 | 
  19629 |     // @step 05-create s_13c99d/1
  19630 |     let urlBefore31 = '';
  19631 |     await runStepLifecycle({
  19632 |       prepare: async () => {
  19633 |         await settle(page);
  19634 |         urlBefore31 = page.url();
  19635 |       },
  19636 |       act: async () => {
  19637 |         absentDialog = null;
  19638 |         outputs['05-create.saved_date'] = await readOptional(page, [
  19639 |           { locator: page.locator('#timesheet_edit_form_begin_date'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_date' }) },
  19640 |           { locator: page.getByLabel('From'), index: 1, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'From' }) },
  19641 |           { locator: pointLocator(page, { x: 660, y: 174 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  19642 |         ], '05-create s_13c99d/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null}], label: 'saved_date' });
  19643 |         await echoRead(echoLedger, run, 'saved_date', '05-create.saved_date', outputs['05-create.saved_date'], '05-create s_13c99d/1', page, lastReadHit);
  19644 |         return { status: 'completed', value: undefined };
  19645 |       },
  19646 |       settle: async () => {
  19647 |         if (page.url() !== urlBefore31) await settle(page);
  19648 |       },
  19649 |       bind: async () => {
  19650 |       },
  19651 |       verify: async () => {
  19652 |         errorPageGate(page, '05-create s_13c99d/1');
  19653 |       },
  19654 |     });
  19655 | 
  19656 |     // @step 05-create s_13c99d/2
  19657 |     let urlBefore32 = '';
  19658 |     await runStepLifecycle({
  19659 |       prepare: async () => {
  19660 |         await settle(page);
  19661 |         urlBefore32 = page.url();
  19662 |       },
  19663 |       act: async () => {
  19664 |         absentDialog = null;
  19665 |         outputs['05-create.saved_begin_time'] = await readOptional(page, [
  19666 |           { locator: page.locator('#timesheet_edit_form_begin_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_time' }) },
  19667 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(0), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 0 }), nth: 0 },
  19668 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  19669 |           { locator: pointLocator(page, { x: 1050, y: 174 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  19670 |         ], '05-create s_13c99d/2 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_begin_time' });
  19671 |         await echoRead(echoLedger, run, 'saved_begin_time', '05-create.saved_begin_time', outputs['05-create.saved_begin_time'], '05-create s_13c99d/2', page, lastReadHit);
  19672 |         return { status: 'completed', value: undefined };
  19673 |       },
  19674 |       settle: async () => {
  19675 |         if (page.url() !== urlBefore32) await settle(page);
  19676 |       },
  19677 |       bind: async () => {
  19678 |       },
  19679 |       verify: async () => {
  19680 |         errorPageGate(page, '05-create s_13c99d/2');
  19681 |       },
  19682 |     });
  19683 | 
  19684 |     // @step 05-create s_13c99d/3
  19685 |     let urlBefore33 = '';
  19686 |     await runStepLifecycle({
  19687 |       prepare: async () => {
  19688 |         await settle(page);
  19689 |         urlBefore33 = page.url();
  19690 |       },
  19691 |       act: async () => {
  19692 |         absentDialog = null;
  19693 |         outputs['05-create.saved_end_time'] = await readOptional(page, [
  19694 |           { locator: page.locator('#timesheet_edit_form_end_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_end_time' }) },
  19695 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(1), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 1 }), nth: 1 },
  19696 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  19697 |           { locator: pointLocator(page, { x: 1050, y: 230 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  19698 |         ], '05-create s_13c99d/3 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_end_time' });
  19699 |         await echoRead(echoLedger, run, 'saved_end_time', '05-create.saved_end_time', outputs['05-create.saved_end_time'], '05-create s_13c99d/3', page, lastReadHit);
  19700 |         return { status: 'completed', value: undefined };
  19701 |       },
  19702 |       settle: async () => {
  19703 |         if (page.url() !== urlBefore33) await settle(page);
  19704 |       },
  19705 |       bind: async () => {
  19706 |       },
  19707 |       verify: async () => {
  19708 |         errorPageGate(page, '05-create s_13c99d/3');
  19709 |       },
```