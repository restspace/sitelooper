# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hbkm3.spec.ts >> hbkm3
- Location: hbkm3.spec.ts:9:1

# Error details

```
Error: 05-create s_92ddfe: identity: {{v1}} is not confirmed on this page
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
  20824 |             try { await urlEffect(page, 'http://127.0.0.1:8105/en/timesheet/', p, '05-create s_e7bb8f/27', volatile2, obs28?.link()); } catch (err) { urlFailed28 = true; throw err; }
  20825 |             // The step's recorded page changes, judged by the daemon's own effect gate (see expectChanges):
  20826 |             //   - row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"
  20827 |             //   - checkbox "Select all entries for batch update list"
  20828 |             //   - cell "DATE"
  20829 |             //   - cell "BEGIN"
  20830 |             //   - cell "END"
  20831 |             const changes28 = await expectChanges(page, ['- row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"', '- checkbox "Select all entries for batch update list"', '- cell "DATE"', '- cell "BEGIN"', '- cell "END"'], p, { tag: '05-create s_e7bb8f/27', tool: 'click', leftByLink: leftByLink('http://127.0.0.1:8105/en/timesheet/', page.url(), p, obs28?.link()), positionalResolution: positional28 }, linesBefore28, 2, linesAfter28);
  20832 |             noteCommit(echoLedger, liveLines(changes28.inDiff ?? [], p, counterNames(siteFactsAt(page.url()), page.url())), 's_e7bb8f/27');
  20833 |             for (const slot of committedSlots('click', changes28.inDiff)) typedCommitted.add(slot);
  20834 |             alertGate(alertsBefore28, alertsAfter28, { where: '05-create s_e7bb8f/27', isRead: false, params: p, effectConfirmed: changes28.confirmed === true });
  20835 |           },
  20836 |         });
  20837 |         break;
  20838 |       } catch (err) {
  20839 |         if (attempt > 0 || !urlFailed28 || !(await standingFillsLost(page, filled2))) throw err;
  20840 |         urlFailed28 = false;
  20841 |         rearmStandingFills(filled2);
  20842 |         logWarning('05-create s_e7bb8f/27: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  20843 |       }
  20844 |     }
  20845 | 
  20846 |     // @step 05-create s_e7bb8f/28
  20847 |     let urlBefore29 = '';
  20848 |     await runStepLifecycle({
  20849 |       prepare: async () => {
  20850 |         await settle(page);
  20851 |         urlBefore29 = page.url();
  20852 |       },
  20853 |       act: async () => {
  20854 |         absentDialog = null;
  20855 |         outputs['05-create.list_row'] = await readOptional(page, [
  20856 |           { locator: page.locator('table tbody tr'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'table tbody tr' }) },
  20857 |           { locator: page.locator('tr.modal-ajax-form', { hasText: `${p.v1}` }), index: 1, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'tr.modal-ajax-form', hasText: `${p.v1}` }) },
  20858 |           { locator: page.locator('div > div:nth-of-type(1) > div > table > tbody > tr'), index: 2, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'div > div:nth-of-type(1) > div > table > tbody > tr' }) },
  20859 |           { locator: pointLocator(page, { x: 760, y: 207 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 }), point: { x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 } },
  20860 |         ], '05-create s_e7bb8f/28 target', { allowMultiple: true, requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, true, 'text'), { drift: run.drift, kinds: [{"role":null,"tag":"tr"}], label: 'list_row' });
  20861 |         await echoRead(echoLedger, run, 'list_row', '05-create.list_row', outputs['05-create.list_row'], '05-create s_e7bb8f/28', page, lastReadHit);
  20862 |         return { status: 'completed', value: undefined };
  20863 |       },
  20864 |       settle: async () => {
  20865 |         if (page.url() !== urlBefore29) await settle(page);
  20866 |       },
  20867 |       bind: async () => {
  20868 |       },
  20869 |       verify: async () => {
  20870 |         errorPageGate(page, '05-create s_e7bb8f/28');
  20871 |       },
  20872 |     });
  20873 | 
  20874 |     // @step 05-create s_e7bb8f/29
  20875 |     let urlBefore30 = '';
  20876 |     let alertsBefore30: string[] = [];
  20877 |     let alertsAfter30: ObservedAlerts | null = null;
  20878 |     let nav30: NavigationTarget = { url: '' };
  20879 |     await runStepLifecycle({
  20880 |       prepare: async () => {
  20881 |         await settle(page);
  20882 |         for (const warning of await restoreStandingFills(page, filled2, 'goto', '05-create s_e7bb8f/29')) logWarning(warning);
  20883 |         urlBefore30 = page.url();
  20884 |         alertsBefore30 = (await liveAlerts(page)) ?? [];
  20885 |       },
  20886 |       act: async () => {
  20887 |         absentDialog = null;
  20888 |         nav30 = navigationTarget('http://127.0.0.1:8105/en/timesheet/10/edit', page, volatile2, '05-create s_e7bb8f/29');
  20889 |         await page.goto(nav30.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  20890 |         return { status: 'completed', value: undefined };
  20891 |       },
  20892 |       settle: async () => {
  20893 |         if (page.url() !== urlBefore30) await settle(page);
  20894 |         alertsAfter30 = await settledAlerts(page);
  20895 |       },
  20896 |       bind: async () => {
  20897 |       },
  20898 |       verify: async () => {
  20899 |         errorPageGate(page, '05-create s_e7bb8f/29');
  20900 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav30.url, landed, '05-create s_e7bb8f/29'); if (landing) throw new Error(landing); }
  20901 |         alertGate(alertsBefore30, alertsAfter30, { where: '05-create s_e7bb8f/29', isRead: false, params: p, navigatedToStale: nav30.stale });
  20902 |       },
  20903 |     });
  20904 | 
  20905 |     // s_92ddfe: Create and save exactly one timesheet entry on project '{{v1}}' for 2026-09-16 from 09:00 to 11:30, with a description including exact runid '{{v2}}'. Choose the existing activity exactly '{{v3}}' and…
  20906 |     // recorded on a page matching http://127.0.0.1:8105/en/timesheet/:id/edit
  20907 |     const readsBefore3 = skippedReads.length;
  20908 | 
  20909 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  20910 |     await preconditionGate('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, '05-create s_92ddfe', cosine(recordedFingerprint('05-create', 's_92ddfe'), (await fingerprintPage(page)) ?? undefined));
  20911 |     // identity: this must be the record the flow is working on, not another of the same shape.
  20912 |     {
  20913 |       let seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  20914 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  20915 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  20916 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  20917 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  20918 |           seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  20919 |         }
  20920 |       }
  20921 |       if (seen.presence !== 'present') {
  20922 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v1}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  20923 |         if (verdict.warning) logWarning('05-create s_92ddfe: ' + verdict.warning);
> 20924 |         if (!verdict.pass) throw new Error('05-create s_92ddfe: identity: {{v1}} is not confirmed on this page');
        |                                  ^ Error: 05-create s_92ddfe: identity: {{v1}} is not confirmed on this page
  20925 |       }
  20926 |     }
  20927 |     // identity: this must be the record the flow is working on, not another of the same shape.
  20928 |     {
  20929 |       let seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  20930 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  20931 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  20932 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  20933 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  20934 |           seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  20935 |         }
  20936 |       }
  20937 |       if (seen.presence !== 'present') {
  20938 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v2}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  20939 |         if (verdict.warning) logWarning('05-create s_92ddfe: ' + verdict.warning);
  20940 |         if (!verdict.pass) throw new Error('05-create s_92ddfe: identity: {{v2}} is not confirmed on this page');
  20941 |       }
  20942 |     }
  20943 | 
  20944 |     // @step 05-create s_92ddfe/1
  20945 |     let urlBefore31 = '';
  20946 |     await runStepLifecycle({
  20947 |       prepare: async () => {
  20948 |         await settle(page);
  20949 |         urlBefore31 = page.url();
  20950 |       },
  20951 |       act: async () => {
  20952 |         absentDialog = null;
  20953 |         outputs['05-create.saved_date'] = await readOptional(page, [
  20954 |           { locator: page.locator('#timesheet_edit_form_begin_date'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_date' }) },
  20955 |           { locator: page.getByLabel('From'), index: 1, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'From' }) },
  20956 |           { locator: pointLocator(page, { x: 660, y: 174 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  20957 |         ], '05-create s_92ddfe/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null}], label: 'saved_date' });
  20958 |         await echoRead(echoLedger, run, 'saved_date', '05-create.saved_date', outputs['05-create.saved_date'], '05-create s_92ddfe/1', page, lastReadHit);
  20959 |         return { status: 'completed', value: undefined };
  20960 |       },
  20961 |       settle: async () => {
  20962 |         if (page.url() !== urlBefore31) await settle(page);
  20963 |       },
  20964 |       bind: async () => {
  20965 |       },
  20966 |       verify: async () => {
  20967 |         errorPageGate(page, '05-create s_92ddfe/1');
  20968 |       },
  20969 |     });
  20970 | 
  20971 |     // @step 05-create s_92ddfe/2
  20972 |     let urlBefore32 = '';
  20973 |     await runStepLifecycle({
  20974 |       prepare: async () => {
  20975 |         await settle(page);
  20976 |         urlBefore32 = page.url();
  20977 |       },
  20978 |       act: async () => {
  20979 |         absentDialog = null;
  20980 |         outputs['05-create.saved_begin_time'] = await readOptional(page, [
  20981 |           { locator: page.locator('#timesheet_edit_form_begin_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_time' }) },
  20982 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(0), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 0 }), nth: 0 },
  20983 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  20984 |           { locator: pointLocator(page, { x: 1050, y: 174 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  20985 |         ], '05-create s_92ddfe/2 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_begin_time' });
  20986 |         await echoRead(echoLedger, run, 'saved_begin_time', '05-create.saved_begin_time', outputs['05-create.saved_begin_time'], '05-create s_92ddfe/2', page, lastReadHit);
  20987 |         return { status: 'completed', value: undefined };
  20988 |       },
  20989 |       settle: async () => {
  20990 |         if (page.url() !== urlBefore32) await settle(page);
  20991 |       },
  20992 |       bind: async () => {
  20993 |       },
  20994 |       verify: async () => {
  20995 |         errorPageGate(page, '05-create s_92ddfe/2');
  20996 |       },
  20997 |     });
  20998 | 
  20999 |     // @step 05-create s_92ddfe/3
  21000 |     let urlBefore33 = '';
  21001 |     await runStepLifecycle({
  21002 |       prepare: async () => {
  21003 |         await settle(page);
  21004 |         urlBefore33 = page.url();
  21005 |       },
  21006 |       act: async () => {
  21007 |         absentDialog = null;
  21008 |         outputs['05-create.saved_end_time'] = await readOptional(page, [
  21009 |           { locator: page.locator('#timesheet_edit_form_end_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_end_time' }) },
  21010 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(1), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 1 }), nth: 1 },
  21011 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  21012 |           { locator: pointLocator(page, { x: 1050, y: 230 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  21013 |         ], '05-create s_92ddfe/3 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_end_time' });
  21014 |         await echoRead(echoLedger, run, 'saved_end_time', '05-create.saved_end_time', outputs['05-create.saved_end_time'], '05-create s_92ddfe/3', page, lastReadHit);
  21015 |         return { status: 'completed', value: undefined };
  21016 |       },
  21017 |       settle: async () => {
  21018 |         if (page.url() !== urlBefore33) await settle(page);
  21019 |       },
  21020 |       bind: async () => {
  21021 |       },
  21022 |       verify: async () => {
  21023 |         errorPageGate(page, '05-create s_92ddfe/3');
  21024 |       },
```