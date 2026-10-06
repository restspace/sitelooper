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
  20833 |             try { await urlEffect(page, 'http://127.0.0.1:8105/en/timesheet/', p, '05-create s_e7bb8f/27', volatile2, obs28?.link()); } catch (err) { urlFailed28 = true; throw err; }
  20834 |             // The step's recorded page changes, judged by the daemon's own effect gate (see expectChanges):
  20835 |             //   - row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"
  20836 |             //   - checkbox "Select all entries for batch update list"
  20837 |             //   - cell "DATE"
  20838 |             //   - cell "BEGIN"
  20839 |             //   - cell "END"
  20840 |             const changes28 = await expectChanges(page, ['- row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"', '- checkbox "Select all entries for batch update list"', '- cell "DATE"', '- cell "BEGIN"', '- cell "END"'], p, { tag: '05-create s_e7bb8f/27', tool: 'click', leftByLink: leftByLink('http://127.0.0.1:8105/en/timesheet/', page.url(), p, obs28?.link()), positionalResolution: positional28 }, linesBefore28, 2, linesAfter28);
  20841 |             noteCommit(echoLedger, liveLines(changes28.inDiff ?? [], p, counterNames(siteFactsAt(page.url()), page.url())), 's_e7bb8f/27');
  20842 |             for (const slot of committedSlots('click', changes28.inDiff)) typedCommitted.add(slot);
  20843 |             alertGate(alertsBefore28, alertsAfter28, { where: '05-create s_e7bb8f/27', isRead: false, params: p, effectConfirmed: changes28.confirmed === true });
  20844 |           },
  20845 |         });
  20846 |         break;
  20847 |       } catch (err) {
  20848 |         if (attempt > 0 || !urlFailed28 || !(await standingFillsLost(page, filled2))) throw err;
  20849 |         urlFailed28 = false;
  20850 |         rearmStandingFills(filled2);
  20851 |         logWarning('05-create s_e7bb8f/27: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  20852 |       }
  20853 |     }
  20854 | 
  20855 |     // @step 05-create s_e7bb8f/28
  20856 |     let urlBefore29 = '';
  20857 |     await runStepLifecycle({
  20858 |       prepare: async () => {
  20859 |         await settle(page);
  20860 |         urlBefore29 = page.url();
  20861 |       },
  20862 |       act: async () => {
  20863 |         absentDialog = null;
  20864 |         outputs['05-create.list_row'] = await readOptional(page, [
  20865 |           { locator: page.locator('table tbody tr'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'table tbody tr' }) },
  20866 |           { locator: page.locator('tr.modal-ajax-form', { hasText: `${p.v1}` }), index: 1, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'tr.modal-ajax-form', hasText: `${p.v1}` }) },
  20867 |           { locator: page.locator('div > div:nth-of-type(1) > div > table > tbody > tr'), index: 2, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'div > div:nth-of-type(1) > div > table > tbody > tr' }) },
  20868 |           { locator: pointLocator(page, { x: 760, y: 207 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 }), point: { x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 } },
  20869 |         ], '05-create s_e7bb8f/28 target', { allowMultiple: true, requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, true, 'text'), { drift: run.drift, kinds: [{"role":null,"tag":"tr"}], label: 'list_row' });
  20870 |         await echoRead(echoLedger, run, 'list_row', '05-create.list_row', outputs['05-create.list_row'], '05-create s_e7bb8f/28', page, lastReadHit);
  20871 |         return { status: 'completed', value: undefined };
  20872 |       },
  20873 |       settle: async () => {
  20874 |         if (page.url() !== urlBefore29) await settle(page);
  20875 |       },
  20876 |       bind: async () => {
  20877 |       },
  20878 |       verify: async () => {
  20879 |         errorPageGate(page, '05-create s_e7bb8f/28');
  20880 |       },
  20881 |     });
  20882 | 
  20883 |     // @step 05-create s_e7bb8f/29
  20884 |     let urlBefore30 = '';
  20885 |     let alertsBefore30: string[] = [];
  20886 |     let alertsAfter30: ObservedAlerts | null = null;
  20887 |     let nav30: NavigationTarget = { url: '' };
  20888 |     await runStepLifecycle({
  20889 |       prepare: async () => {
  20890 |         await settle(page);
  20891 |         for (const warning of await restoreStandingFills(page, filled2, 'goto', '05-create s_e7bb8f/29')) logWarning(warning);
  20892 |         urlBefore30 = page.url();
  20893 |         alertsBefore30 = (await liveAlerts(page)) ?? [];
  20894 |       },
  20895 |       act: async () => {
  20896 |         absentDialog = null;
  20897 |         nav30 = navigationTarget('http://127.0.0.1:8105/en/timesheet/10/edit', page, volatile2, '05-create s_e7bb8f/29');
  20898 |         await page.goto(nav30.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  20899 |         return { status: 'completed', value: undefined };
  20900 |       },
  20901 |       settle: async () => {
  20902 |         if (page.url() !== urlBefore30) await settle(page);
  20903 |         alertsAfter30 = await settledAlerts(page);
  20904 |       },
  20905 |       bind: async () => {
  20906 |       },
  20907 |       verify: async () => {
  20908 |         errorPageGate(page, '05-create s_e7bb8f/29');
  20909 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav30.url, landed, '05-create s_e7bb8f/29'); if (landing) throw new Error(landing); }
  20910 |         alertGate(alertsBefore30, alertsAfter30, { where: '05-create s_e7bb8f/29', isRead: false, params: p, navigatedToStale: nav30.stale });
  20911 |       },
  20912 |     });
  20913 | 
  20914 |     // s_92ddfe: Create and save exactly one timesheet entry on project '{{v1}}' for 2026-09-16 from 09:00 to 11:30, with a description including exact runid '{{v2}}'. Choose the existing activity exactly '{{v3}}' and…
  20915 |     // recorded on a page matching http://127.0.0.1:8105/en/timesheet/:id/edit
  20916 |     const readsBefore3 = skippedReads.length;
  20917 | 
  20918 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  20919 |     await preconditionGate('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, '05-create s_92ddfe', cosine(recordedFingerprint('05-create', 's_92ddfe'), (await fingerprintPage(page)) ?? undefined));
  20920 |     // identity: this must be the record the flow is working on, not another of the same shape.
  20921 |     {
  20922 |       let seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  20923 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  20924 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  20925 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  20926 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  20927 |           seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  20928 |         }
  20929 |       }
  20930 |       if (seen.presence !== 'present') {
  20931 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v1}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  20932 |         if (verdict.warning) logWarning('05-create s_92ddfe: ' + verdict.warning);
> 20933 |         if (!verdict.pass) throw new Error('05-create s_92ddfe: identity: {{v1}} is not confirmed on this page');
        |                                  ^ Error: 05-create s_92ddfe: identity: {{v1}} is not confirmed on this page
  20934 |       }
  20935 |     }
  20936 |     // identity: this must be the record the flow is working on, not another of the same shape.
  20937 |     {
  20938 |       let seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  20939 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  20940 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  20941 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  20942 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  20943 |           seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  20944 |         }
  20945 |       }
  20946 |       if (seen.presence !== 'present') {
  20947 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v2}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  20948 |         if (verdict.warning) logWarning('05-create s_92ddfe: ' + verdict.warning);
  20949 |         if (!verdict.pass) throw new Error('05-create s_92ddfe: identity: {{v2}} is not confirmed on this page');
  20950 |       }
  20951 |     }
  20952 | 
  20953 |     // @step 05-create s_92ddfe/1
  20954 |     let urlBefore31 = '';
  20955 |     await runStepLifecycle({
  20956 |       prepare: async () => {
  20957 |         await settle(page);
  20958 |         urlBefore31 = page.url();
  20959 |       },
  20960 |       act: async () => {
  20961 |         absentDialog = null;
  20962 |         outputs['05-create.saved_date'] = await readOptional(page, [
  20963 |           { locator: page.locator('#timesheet_edit_form_begin_date'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_date' }) },
  20964 |           { locator: page.getByLabel('From'), index: 1, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'From' }) },
  20965 |           { locator: pointLocator(page, { x: 660, y: 174 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  20966 |         ], '05-create s_92ddfe/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null}], label: 'saved_date' });
  20967 |         await echoRead(echoLedger, run, 'saved_date', '05-create.saved_date', outputs['05-create.saved_date'], '05-create s_92ddfe/1', page, lastReadHit);
  20968 |         return { status: 'completed', value: undefined };
  20969 |       },
  20970 |       settle: async () => {
  20971 |         if (page.url() !== urlBefore31) await settle(page);
  20972 |       },
  20973 |       bind: async () => {
  20974 |       },
  20975 |       verify: async () => {
  20976 |         errorPageGate(page, '05-create s_92ddfe/1');
  20977 |       },
  20978 |     });
  20979 | 
  20980 |     // @step 05-create s_92ddfe/2
  20981 |     let urlBefore32 = '';
  20982 |     await runStepLifecycle({
  20983 |       prepare: async () => {
  20984 |         await settle(page);
  20985 |         urlBefore32 = page.url();
  20986 |       },
  20987 |       act: async () => {
  20988 |         absentDialog = null;
  20989 |         outputs['05-create.saved_begin_time'] = await readOptional(page, [
  20990 |           { locator: page.locator('#timesheet_edit_form_begin_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_time' }) },
  20991 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(0), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 0 }), nth: 0 },
  20992 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  20993 |           { locator: pointLocator(page, { x: 1050, y: 174 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  20994 |         ], '05-create s_92ddfe/2 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_begin_time' });
  20995 |         await echoRead(echoLedger, run, 'saved_begin_time', '05-create.saved_begin_time', outputs['05-create.saved_begin_time'], '05-create s_92ddfe/2', page, lastReadHit);
  20996 |         return { status: 'completed', value: undefined };
  20997 |       },
  20998 |       settle: async () => {
  20999 |         if (page.url() !== urlBefore32) await settle(page);
  21000 |       },
  21001 |       bind: async () => {
  21002 |       },
  21003 |       verify: async () => {
  21004 |         errorPageGate(page, '05-create s_92ddfe/2');
  21005 |       },
  21006 |     });
  21007 | 
  21008 |     // @step 05-create s_92ddfe/3
  21009 |     let urlBefore33 = '';
  21010 |     await runStepLifecycle({
  21011 |       prepare: async () => {
  21012 |         await settle(page);
  21013 |         urlBefore33 = page.url();
  21014 |       },
  21015 |       act: async () => {
  21016 |         absentDialog = null;
  21017 |         outputs['05-create.saved_end_time'] = await readOptional(page, [
  21018 |           { locator: page.locator('#timesheet_edit_form_end_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_end_time' }) },
  21019 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(1), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 1 }), nth: 1 },
  21020 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  21021 |           { locator: pointLocator(page, { x: 1050, y: 230 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  21022 |         ], '05-create s_92ddfe/3 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_end_time' });
  21023 |         await echoRead(echoLedger, run, 'saved_end_time', '05-create.saved_end_time', outputs['05-create.saved_end_time'], '05-create s_92ddfe/3', page, lastReadHit);
  21024 |         return { status: 'completed', value: undefined };
  21025 |       },
  21026 |       settle: async () => {
  21027 |         if (page.url() !== urlBefore33) await settle(page);
  21028 |       },
  21029 |       bind: async () => {
  21030 |       },
  21031 |       verify: async () => {
  21032 |         errorPageGate(page, '05-create s_92ddfe/3');
  21033 |       },
```