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
  21015 |             try { await urlEffect(page, 'http://127.0.0.1:8105/en/timesheet/', p, '05-create s_e7bb8f/27', volatile2, obs28?.link()); } catch (err) { urlFailed28 = true; throw err; }
  21016 |             // The step's recorded page changes, judged by the daemon's own effect gate (see expectChanges):
  21017 |             //   - row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"
  21018 |             //   - checkbox "Select all entries for batch update list"
  21019 |             //   - cell "DATE"
  21020 |             //   - cell "BEGIN"
  21021 |             //   - cell "END"
  21022 |             const changes28 = await expectChanges(page, ['- row "DATE BEGIN END DURATION CUSTOMER PROJECT ACTIVITY"', '- checkbox "Select all entries for batch update list"', '- cell "DATE"', '- cell "BEGIN"', '- cell "END"'], p, { tag: '05-create s_e7bb8f/27', tool: 'click', leftByLink: leftByLink('http://127.0.0.1:8105/en/timesheet/', page.url(), p, obs28?.link()), positionalResolution: positional28 }, linesBefore28, 2, linesAfter28);
  21023 |             noteCommit(echoLedger, liveLines(changes28.inDiff ?? [], p, counterNames(siteFactsAt(page.url()), page.url())), 's_e7bb8f/27');
  21024 |             for (const slot of committedSlots('click', changes28.inDiff)) typedCommitted.add(slot);
  21025 |             alertGate(alertsBefore28, alertsAfter28, { where: '05-create s_e7bb8f/27', isRead: false, params: p, effectConfirmed: changes28.confirmed === true });
  21026 |           },
  21027 |         });
  21028 |         break;
  21029 |       } catch (err) {
  21030 |         if (attempt > 0 || !urlFailed28 || !(await standingFillsLost(page, filled2))) throw err;
  21031 |         urlFailed28 = false;
  21032 |         rearmStandingFills(filled2);
  21033 |         logWarning('05-create s_e7bb8f/27: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  21034 |       }
  21035 |     }
  21036 | 
  21037 |     // @step 05-create s_e7bb8f/28
  21038 |     let urlBefore29 = '';
  21039 |     await runStepLifecycle({
  21040 |       prepare: async () => {
  21041 |         await settle(page);
  21042 |         urlBefore29 = page.url();
  21043 |       },
  21044 |       act: async () => {
  21045 |         absentDialog = null;
  21046 |         outputs['05-create.list_row'] = await readOptional(page, [
  21047 |           { locator: page.locator('table tbody tr'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'table tbody tr' }) },
  21048 |           { locator: page.locator('tr.modal-ajax-form', { hasText: `${p.v1}` }), index: 1, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'tr.modal-ajax-form', hasText: `${p.v1}` }) },
  21049 |           { locator: page.locator('div > div:nth-of-type(1) > div > table > tbody > tr'), index: 2, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'div > div:nth-of-type(1) > div > table > tbody > tr' }) },
  21050 |           { locator: pointLocator(page, { x: 760, y: 207 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 }), point: { x: 760, y: 207, w: 1006, h: 46.2, role: null, tag: 'tr', vw: 1280, vh: 900 } },
  21051 |         ], '05-create s_e7bb8f/28 target', { allowMultiple: true, requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, true, 'text'), { drift: run.drift, kinds: [{"role":null,"tag":"tr"}], label: 'list_row' });
  21052 |         await echoRead(echoLedger, run, 'list_row', '05-create.list_row', outputs['05-create.list_row'], '05-create s_e7bb8f/28', page, lastReadHit);
  21053 |         return { status: 'completed', value: undefined };
  21054 |       },
  21055 |       settle: async () => {
  21056 |         if (page.url() !== urlBefore29) await settle(page);
  21057 |       },
  21058 |       bind: async () => {
  21059 |       },
  21060 |       verify: async () => {
  21061 |         errorPageGate(page, '05-create s_e7bb8f/28');
  21062 |       },
  21063 |     });
  21064 | 
  21065 |     // @step 05-create s_e7bb8f/29
  21066 |     let urlBefore30 = '';
  21067 |     let alertsBefore30: string[] = [];
  21068 |     let alertsAfter30: ObservedAlerts | null = null;
  21069 |     let nav30: NavigationTarget = { url: '' };
  21070 |     await runStepLifecycle({
  21071 |       prepare: async () => {
  21072 |         await settle(page);
  21073 |         for (const warning of await restoreStandingFills(page, filled2, 'goto', '05-create s_e7bb8f/29')) logWarning(warning);
  21074 |         urlBefore30 = page.url();
  21075 |         alertsBefore30 = (await liveAlerts(page)) ?? [];
  21076 |       },
  21077 |       act: async () => {
  21078 |         absentDialog = null;
  21079 |         nav30 = navigationTarget('http://127.0.0.1:8105/en/timesheet/10/edit', page, volatile2, '05-create s_e7bb8f/29');
  21080 |         await page.goto(nav30.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  21081 |         return { status: 'completed', value: undefined };
  21082 |       },
  21083 |       settle: async () => {
  21084 |         if (page.url() !== urlBefore30) await settle(page);
  21085 |         alertsAfter30 = await settledAlerts(page);
  21086 |       },
  21087 |       bind: async () => {
  21088 |       },
  21089 |       verify: async () => {
  21090 |         errorPageGate(page, '05-create s_e7bb8f/29');
  21091 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav30.url, landed, '05-create s_e7bb8f/29'); if (landing) throw new Error(landing); }
  21092 |         alertGate(alertsBefore30, alertsAfter30, { where: '05-create s_e7bb8f/29', isRead: false, params: p, navigatedToStale: nav30.stale });
  21093 |       },
  21094 |     });
  21095 | 
  21096 |     // s_92ddfe: Create and save exactly one timesheet entry on project '{{v1}}' for 2026-09-16 from 09:00 to 11:30, with a description including exact runid '{{v2}}'. Choose the existing activity exactly '{{v3}}' and…
  21097 |     // recorded on a page matching http://127.0.0.1:8105/en/timesheet/:id/edit
  21098 |     const readsBefore3 = skippedReads.length;
  21099 | 
  21100 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  21101 |     await preconditionGate('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, '05-create s_92ddfe', cosine(recordedFingerprint('05-create', 's_92ddfe'), (await fingerprintPage(page)) ?? undefined));
  21102 |     // identity: this must be the record the flow is working on, not another of the same shape.
  21103 |     {
  21104 |       let seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  21105 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  21106 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  21107 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  21108 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  21109 |           seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  21110 |         }
  21111 |       }
  21112 |       if (seen.presence !== 'present') {
  21113 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v1}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  21114 |         if (verdict.warning) logWarning('05-create s_92ddfe: ' + verdict.warning);
> 21115 |         if (!verdict.pass) throw new Error('05-create s_92ddfe: identity: {{v1}} is not confirmed on this page');
        |                                  ^ Error: 05-create s_92ddfe: identity: {{v1}} is not confirmed on this page
  21116 |       }
  21117 |     }
  21118 |     // identity: this must be the record the flow is working on, not another of the same shape.
  21119 |     {
  21120 |       let seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  21121 |       if (!urlRecordParts('http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p)) {
  21122 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  21123 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  21124 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  21125 |           seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  21126 |         }
  21127 |       }
  21128 |       if (seen.presence !== 'present') {
  21129 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/timesheet/:id/edit', page.url(), p, `${p.v2}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  21130 |         if (verdict.warning) logWarning('05-create s_92ddfe: ' + verdict.warning);
  21131 |         if (!verdict.pass) throw new Error('05-create s_92ddfe: identity: {{v2}} is not confirmed on this page');
  21132 |       }
  21133 |     }
  21134 | 
  21135 |     // @step 05-create s_92ddfe/1
  21136 |     let urlBefore31 = '';
  21137 |     await runStepLifecycle({
  21138 |       prepare: async () => {
  21139 |         await settle(page);
  21140 |         urlBefore31 = page.url();
  21141 |       },
  21142 |       act: async () => {
  21143 |         absentDialog = null;
  21144 |         outputs['05-create.saved_date'] = await readOptional(page, [
  21145 |           { locator: page.locator('#timesheet_edit_form_begin_date'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_date' }) },
  21146 |           { locator: page.getByLabel('From'), index: 1, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'From' }) },
  21147 |           { locator: pointLocator(page, { x: 660, y: 174 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 660, y: 174, w: 347.9, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  21148 |         ], '05-create s_92ddfe/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null}], label: 'saved_date' });
  21149 |         await echoRead(echoLedger, run, 'saved_date', '05-create.saved_date', outputs['05-create.saved_date'], '05-create s_92ddfe/1', page, lastReadHit);
  21150 |         return { status: 'completed', value: undefined };
  21151 |       },
  21152 |       settle: async () => {
  21153 |         if (page.url() !== urlBefore31) await settle(page);
  21154 |       },
  21155 |       bind: async () => {
  21156 |       },
  21157 |       verify: async () => {
  21158 |         errorPageGate(page, '05-create s_92ddfe/1');
  21159 |       },
  21160 |     });
  21161 | 
  21162 |     // @step 05-create s_92ddfe/2
  21163 |     let urlBefore32 = '';
  21164 |     await runStepLifecycle({
  21165 |       prepare: async () => {
  21166 |         await settle(page);
  21167 |         urlBefore32 = page.url();
  21168 |       },
  21169 |       act: async () => {
  21170 |         absentDialog = null;
  21171 |         outputs['05-create.saved_begin_time'] = await readOptional(page, [
  21172 |           { locator: page.locator('#timesheet_edit_form_begin_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_begin_time' }) },
  21173 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(0), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 0 }), nth: 0 },
  21174 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  21175 |           { locator: pointLocator(page, { x: 1050, y: 174 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 174, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  21176 |         ], '05-create s_92ddfe/2 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_begin_time' });
  21177 |         await echoRead(echoLedger, run, 'saved_begin_time', '05-create.saved_begin_time', outputs['05-create.saved_begin_time'], '05-create s_92ddfe/2', page, lastReadHit);
  21178 |         return { status: 'completed', value: undefined };
  21179 |       },
  21180 |       settle: async () => {
  21181 |         if (page.url() !== urlBefore32) await settle(page);
  21182 |       },
  21183 |       bind: async () => {
  21184 |       },
  21185 |       verify: async () => {
  21186 |         errorPageGate(page, '05-create s_92ddfe/2');
  21187 |       },
  21188 |     });
  21189 | 
  21190 |     // @step 05-create s_92ddfe/3
  21191 |     let urlBefore33 = '';
  21192 |     await runStepLifecycle({
  21193 |       prepare: async () => {
  21194 |         await settle(page);
  21195 |         urlBefore33 = page.url();
  21196 |       },
  21197 |       act: async () => {
  21198 |         absentDialog = null;
  21199 |         outputs['05-create.saved_end_time'] = await readOptional(page, [
  21200 |           { locator: page.locator('#timesheet_edit_form_end_time'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#timesheet_edit_form_end_time' }) },
  21201 |           { locator: page.getByRole('textbox', { name: roleName('h:mm a'), exact: true }).nth(1), index: 1, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'h:mm a', nth: 1 }), nth: 1 },
  21202 |           { locator: page.getByPlaceholder('h:mm a'), index: 2, structural: false, kind: 'placeholder', carries: JSON.stringify({ kind: 'placeholder', placeholder: 'h:mm a' }) },
  21203 |           { locator: pointLocator(page, { x: 1050, y: 230 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 1050, y: 230, w: 307.2, h: 40, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  21204 |         ], '05-create s_92ddfe/3 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'saved_end_time' });
  21205 |         await echoRead(echoLedger, run, 'saved_end_time', '05-create.saved_end_time', outputs['05-create.saved_end_time'], '05-create s_92ddfe/3', page, lastReadHit);
  21206 |         return { status: 'completed', value: undefined };
  21207 |       },
  21208 |       settle: async () => {
  21209 |         if (page.url() !== urlBefore33) await settle(page);
  21210 |       },
  21211 |       bind: async () => {
  21212 |       },
  21213 |       verify: async () => {
  21214 |         errorPageGate(page, '05-create s_92ddfe/3');
  21215 |       },
```