# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rvkm-hbkm1-cv.spec.ts >> rvkm-hbkm1-cv
- Location: rvkm-hbkm1-cv.spec.ts:9:1

# Error details

```
Error: s_647d09: every read of this read-only procedure was skipped — the page is not the one it was recorded reading
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - complementary [ref=e3]:
    - generic [ref=e4]:
      - heading "Kimai 2.68.0" [level=1] [ref=e5]:
        - link "Kimai 2.68.0" [ref=e6] [cursor=pointer]:
          - /url: /en/dashboard/
          - img "Kimai 2.68.0" [ref=e7]
      - text:   
      - list [ref=e9]:
        - listitem [ref=e10]:
          - link " Dashboard" [ref=e11] [cursor=pointer]:
            - /url: /en/dashboard/
            - generic [ref=e13]: 
            - generic [ref=e14]: Dashboard
        - listitem [ref=e15]:
          - button " Time Tracking" [expanded] [ref=e16] [cursor=pointer]:
            - generic [ref=e18]: 
            - generic [ref=e19]: Time Tracking
          - generic [ref=e22]:
            - link " My times" [ref=e23] [cursor=pointer]:
              - /url: /en/timesheet/
              - generic [ref=e25]: 
              - text: My times
            - link " Weekly hours" [ref=e26] [cursor=pointer]:
              - /url: /en/quick_entry/
              - generic [ref=e28]: 
              - text: Weekly hours
            - link " Calendar" [ref=e29] [cursor=pointer]:
              - /url: /en/calendar/
              - generic [ref=e31]: 
              - text: Calendar
            - link " Export" [ref=e32] [cursor=pointer]:
              - /url: /en/export/
              - generic [ref=e34]: 
              - text: Export
            - link " All times" [ref=e35] [cursor=pointer]:
              - /url: /en/team/timesheet/
              - generic [ref=e37]: 
              - text: All times
        - listitem [ref=e38]:
          - button " Employment contract" [expanded] [ref=e39] [cursor=pointer]:
            - generic [ref=e41]: 
            - generic [ref=e42]: Employment contract
          - text: 
        - listitem [ref=e43]:
          - link " Reporting" [ref=e44] [cursor=pointer]:
            - /url: /en/reporting/
            - generic [ref=e46]: 
            - generic [ref=e47]: Reporting
        - listitem [ref=e48]:
          - button " Invoices" [expanded] [ref=e49] [cursor=pointer]:
            - generic [ref=e51]: 
            - generic [ref=e52]: Invoices
          - text:   
        - listitem [ref=e53]:
          - button " Administration" [expanded] [ref=e54] [cursor=pointer]:
            - generic [ref=e56]: 
            - generic [ref=e57]: Administration
          - generic [ref=e60]:
            - link " Customers" [ref=e61] [cursor=pointer]:
              - /url: /en/admin/customer/
              - generic [ref=e63]: 
              - text: Customers
            - link " Projects" [ref=e64] [cursor=pointer]:
              - /url: /en/admin/project/
              - generic [ref=e66]: 
              - text: Projects
            - link " Activities" [ref=e67] [cursor=pointer]:
              - /url: /en/admin/activity/
              - generic [ref=e69]: 
              - text: Activities
            - link " Tags" [ref=e70] [cursor=pointer]:
              - /url: /en/admin/tags/
              - generic [ref=e72]: 
              - text: Tags
        - listitem [ref=e73]:
          - button " System" [expanded] [ref=e74] [cursor=pointer]:
            - generic [ref=e76]: 
            - generic [ref=e77]: System
          - text:      
  - banner [ref=e78]:
    - generic [ref=e79]:
      - generic [ref=e80]:
        - generic [ref=e82]:
          - text: 
          - link " 0:00" [ref=e84] [cursor=pointer]:
            - /url: /en/timesheet/create
            - generic [ref=e85]: 
            - generic [ref=e86]: 0:00
        - link "" [ref=e88] [cursor=pointer]:
          - /url: /en/favorite/timesheet/
          - generic [ref=e89]: 
        - link "Open personal menu" [ref=e91] [cursor=pointer]:
          - /url: "#"
          - generic "admin" [ref=e93]: AD
          - generic [ref=e95]: admin
      - heading "Projects" [level=2] [ref=e97]
  - generic [ref=e98]:
    - generic [ref=e104]:
      - generic [ref=e105]:
        - link " Edit" [ref=e106] [cursor=pointer]:
          - /url: /en/admin/project/40018/edit
          - generic [ref=e107]: 
          - text: Edit
        - link " Permissions" [ref=e108] [cursor=pointer]:
          - /url: /en/admin/project/40018/permissions
          - generic [ref=e109]: 
          - text: Permissions
        - button " Filter data" [ref=e111] [cursor=pointer]:
          - generic [ref=e112]: 
          - text: Filter data
        - link " Create copy" [ref=e113] [cursor=pointer]:
          - /url: /api/projects/40018/duplicate
          - generic [ref=e114]: 
          - text: Create copy
        - link " Project details" [ref=e115] [cursor=pointer]:
          - /url: /en/reporting/project_details?project=40018
          - generic [ref=e116]: 
          - text: Project details
      - text: 
    - generic [ref=e118]:
      - generic [ref=e119]:
        - generic [ref=e120]:
          - generic [ref=e121]:
            - heading "rvkm-hbkm1-cv-spec Bench Project" [level=3] [ref=e122]:
              - generic [ref=e123]: rvkm-hbkm1-cv-spec Bench Project
            - link "Edit" [ref=e126] [cursor=pointer]:
              - /url: /en/admin/project/40018/edit
              - generic [ref=e127]: 
          - generic [ref=e128]:
            - paragraph [ref=e130]: Bench project created by automation for runid rvkm-hbkm1-cv-spec
            - table [ref=e131]:
              - rowgroup [ref=e132]:
                - row "Customer Bench Customer 0 Actions" [ref=e133] [cursor=pointer]:
                  - rowheader "Customer" [ref=e134]
                  - cell "Bench Customer" [ref=e135]:
                    - generic [ref=e136]: Bench Customer
                  - cell "0" [ref=e138]:
                    - generic [ref=e139]: "0"
                  - cell "Actions" [ref=e140]:
                    - link "Actions" [ref=e142]:
                      - /url: "#"
                      - generic [ref=e143]: 
                - row "Project number 0005" [ref=e144]:
                  - rowheader "Project number" [ref=e145]
                  - cell "0005" [ref=e146]
        - generic [ref=e147]:
          - generic [ref=e148]:
            - heading "Activities" [level=3] [ref=e149]
            - link "Create" [ref=e151] [cursor=pointer]:
              - /url: /en/admin/activity/create/40018
              - generic [ref=e152]: +
          - generic [ref=e154]: No entries were found based on your selected filters.
        - generic [ref=e155]:
          - generic [ref=e156]:
            - heading "Prices" [level=3] [ref=e157]
            - link "Create" [ref=e159] [cursor=pointer]:
              - /url: /en/admin/project/40018/rate
              - generic [ref=e160]: +
          - generic [ref=e162]: No prices have been configured.
        - generic [ref=e163]:
          - heading "Hourly quota" [level=3] [ref=e165]
          - generic [ref=e167]:
            - table [ref=e169]:
              - rowgroup [ref=e170]:
                - row "Hourly quota -" [ref=e171]:
                  - cell "Hourly quota" [ref=e172]
                  - cell "-" [ref=e173]
                - row "Working hours 0:00" [ref=e174]:
                  - cell "Working hours" [ref=e175]
                  - cell "0:00" [ref=e176]
                - row "Billable 0:00" [ref=e177]:
                  - cell "Billable" [ref=e178]
                  - cell "0:00" [ref=e179]
            - generic [ref=e182]:
              - generic [ref=e183]:
                - generic [ref=e184]: Billable – 0.00%
                - generic [ref=e185]: 0:00 / 0:00
              - generic [ref=e186]:
                - progressbar
        - generic [ref=e187]:
          - heading "Budget" [level=3] [ref=e189]
          - generic [ref=e191]:
            - table [ref=e193]:
              - rowgroup [ref=e194]:
                - row "Budget -" [ref=e195]:
                  - cell "Budget" [ref=e196]
                  - cell "-" [ref=e197]
                - row "Revenue $0.00" [ref=e198]:
                  - cell "Revenue" [ref=e199]
                  - cell "$0.00" [ref=e200]
                - row "Costs $0.00" [ref=e201]:
                  - cell "Costs" [ref=e202]
                  - cell "$0.00" [ref=e203]
            - generic [ref=e206]:
              - generic [ref=e207]:
                - generic [ref=e208]: Costs – 0.00%
                - generic [ref=e209]: $0.00 / $0.00
              - generic [ref=e210]:
                - progressbar
        - generic [ref=e211]:
          - generic [ref=e212]:
            - heading "Permissions" [level=3] [ref=e213]
            - generic [ref=e214]:
              - link "Create a new team to limit access" [ref=e215] [cursor=pointer]:
                - /url: /en/admin/project/40018/team-create
                - generic [ref=e216]: +
              - link "Edit" [ref=e217] [cursor=pointer]:
                - /url: /en/admin/project/40018/permissions
                - generic [ref=e218]: 
          - generic [ref=e220]: Visible to everyone, as no team was assigned yet.
        - generic [ref=e221]:
          - heading "Comment" [level=3] [ref=e223]
          - generic [ref=e224]: There were no comments posted yet.
          - generic [ref=e226]:
            - textbox "Type your message…" [ref=e227]
            - button " Comment" [ref=e228] [cursor=pointer]:
              - generic [ref=e229]: 
              - text: Comment
      - 'link "? Documentation: Projects" [ref=e230] [cursor=pointer]':
        - /url: https://www.kimai.org/documentation/project.html?utm_source=kimai&utm_medium=float-help
        - generic [ref=e231]: "?"
        - generic:
          - generic: "Documentation: Projects"
```

# Test source

```ts
  22184 |       },
  22185 |       act: async () => {
  22186 |         absentDialog = null;
  22187 |         outputs['03-create.projects_list_rows_1'] = await readOptional(page, [
  22188 |           { locator: page.getByRole('cell', { name: roleName('Seed: Annual audit'), exact: true }), index: 0, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'cell', name: 'Seed: Annual audit' }) },
  22189 |         ], '03-create s_647d09/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift, kinds: [{"role":"cell","tag":null}], label: 'projects_list_rows_1' });
  22190 |         await echoRead(echoLedger, run, 'projects_list_rows_1', '03-create.projects_list_rows_1', outputs['03-create.projects_list_rows_1'], '03-create s_647d09/1', page, lastReadHit);
  22191 |         return { status: 'completed', value: undefined };
  22192 |       },
  22193 |       settle: async () => {
  22194 |         if (page.url() !== urlBefore8) await settle(page);
  22195 |       },
  22196 |       bind: async () => {
  22197 |       },
  22198 |       verify: async () => {
  22199 |         errorPageGate(page, '03-create s_647d09/1');
  22200 |       },
  22201 |     });
  22202 | 
  22203 |     // @step 03-create s_647d09/2
  22204 |     let urlBefore9 = '';
  22205 |     await runStepLifecycle({
  22206 |       prepare: async () => {
  22207 |         await settle(page);
  22208 |         urlBefore9 = page.url();
  22209 |       },
  22210 |       act: async () => {
  22211 |         absentDialog = null;
  22212 |         outputs['03-create.projects_list_rows_2'] = await readOptional(page, [
  22213 |           { locator: page.getByRole('cell', { name: roleName('Seed: Office move'), exact: true }), index: 0, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'cell', name: 'Seed: Office move' }) },
  22214 |         ], '03-create s_647d09/2 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift, kinds: [{"role":"cell","tag":null}], label: 'projects_list_rows_2' });
  22215 |         await echoRead(echoLedger, run, 'projects_list_rows_2', '03-create.projects_list_rows_2', outputs['03-create.projects_list_rows_2'], '03-create s_647d09/2', page, lastReadHit);
  22216 |         return { status: 'completed', value: undefined };
  22217 |       },
  22218 |       settle: async () => {
  22219 |         if (page.url() !== urlBefore9) await settle(page);
  22220 |       },
  22221 |       bind: async () => {
  22222 |       },
  22223 |       verify: async () => {
  22224 |         errorPageGate(page, '03-create s_647d09/2');
  22225 |       },
  22226 |     });
  22227 | 
  22228 |     // @step 03-create s_647d09/3
  22229 |     let urlBefore10 = '';
  22230 |     await runStepLifecycle({
  22231 |       prepare: async () => {
  22232 |         await settle(page);
  22233 |         urlBefore10 = page.url();
  22234 |       },
  22235 |       act: async () => {
  22236 |         absentDialog = null;
  22237 |         outputs['03-create.projects_list_rows_3'] = await readOptional(page, [
  22238 |           { locator: page.getByRole('cell', { name: roleName('Seed: Website relaunch'), exact: true }), index: 0, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'cell', name: 'Seed: Website relaunch' }) },
  22239 |         ], '03-create s_647d09/3 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift, kinds: [{"role":"cell","tag":null}], label: 'projects_list_rows_3' });
  22240 |         await echoRead(echoLedger, run, 'projects_list_rows_3', '03-create.projects_list_rows_3', outputs['03-create.projects_list_rows_3'], '03-create s_647d09/3', page, lastReadHit);
  22241 |         return { status: 'completed', value: undefined };
  22242 |       },
  22243 |       settle: async () => {
  22244 |         if (page.url() !== urlBefore10) await settle(page);
  22245 |       },
  22246 |       bind: async () => {
  22247 |       },
  22248 |       verify: async () => {
  22249 |         errorPageGate(page, '03-create s_647d09/3');
  22250 |       },
  22251 |     });
  22252 | 
  22253 |     // @step 03-create s_647d09/4
  22254 |     let urlBefore11 = '';
  22255 |     let alertsBefore11: string[] = [];
  22256 |     let alertsAfter11: ObservedAlerts | null = null;
  22257 |     let nav11: NavigationTarget = { url: '' };
  22258 |     await runStepLifecycle({
  22259 |       prepare: async () => {
  22260 |         await settle(page);
  22261 |         urlBefore11 = page.url();
  22262 |         alertsBefore11 = (await liveAlerts(page)) ?? [];
  22263 |       },
  22264 |       act: async () => {
  22265 |         absentDialog = null;
  22266 |         nav11 = navigationTarget(`http://127.0.0.1:8105/en/admin/project/${p.d1 ?? '{{d1}}'}/details`, page, volatile3, '03-create s_647d09/4');
  22267 |         await page.goto(nav11.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  22268 |         return { status: 'completed', value: undefined };
  22269 |       },
  22270 |       settle: async () => {
  22271 |         if (page.url() !== urlBefore11) await settle(page);
  22272 |         alertsAfter11 = await settledAlerts(page);
  22273 |       },
  22274 |       bind: async () => {
  22275 |       },
  22276 |       verify: async () => {
  22277 |         errorPageGate(page, '03-create s_647d09/4');
  22278 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav11.url, landed, '03-create s_647d09/4'); if (landing) throw new Error(landing); }
  22279 |         alertGate(alertsBefore11, alertsAfter11, { where: '03-create s_647d09/4', isRead: false, params: p, navigatedToStale: nav11.stale });
  22280 |       },
  22281 |     });
  22282 | 
  22283 |     if (observedNothing([{"tool":"read","args":{"what":"text"},"locators":{"target":[0]},"label":"projects_list_rows_1"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0]},"label":"projects_list_rows_2"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0]},"label":"projects_list_rows_3"},{"tool":"goto","args":{"what":"text"},"locators":{"target":[]}}], skippedReads.length - readsBefore3)) {
> 22284 |       throw new Error('s_647d09: every read of this read-only procedure was skipped — the page is not the one it was recorded reading');
        |             ^ Error: s_647d09: every read of this read-only procedure was skipped — the page is not the one it was recorded reading
  22285 |     }
  22286 | 
  22287 |     // s_97630b: Create and save exactly one new project named '{{v2}}' with a description that includes the exact runid '{{v1}}'. Do not modify any seed project. If the form requires a customer to save, choose the ex…
  22288 |     // recorded on a page matching http://127.0.0.1:8105/en/admin/project/{{d1}}/details
  22289 |     const readsBefore4 = skippedReads.length;
  22290 | 
  22291 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  22292 |     await preconditionGate('http://127.0.0.1:8105/en/admin/project/{{d1}}/details', page.url(), p, '03-create s_97630b', cosine(recordedFingerprint('03-create', 's_97630b'), (await fingerprintPage(page)) ?? undefined));
  22293 |     // identity: this must be the record the flow is working on, not another of the same shape.
  22294 |     {
  22295 |       let seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  22296 |       if (!urlRecordParts('http://127.0.0.1:8105/en/admin/project/{{d1}}/details', page.url(), p)) {
  22297 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  22298 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  22299 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  22300 |           seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  22301 |         }
  22302 |       }
  22303 |       if (seen.presence !== 'present') {
  22304 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/admin/project/{{d1}}/details', page.url(), p, `${p.v1}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  22305 |         if (verdict.warning) logWarning('03-create s_97630b: ' + verdict.warning);
  22306 |         if (!verdict.pass) throw new Error('03-create s_97630b: identity: {{v1}} is not confirmed on this page');
  22307 |       }
  22308 |     }
  22309 |     // identity: this must be the record the flow is working on, not another of the same shape.
  22310 |     {
  22311 |       let seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  22312 |       if (!urlRecordParts('http://127.0.0.1:8105/en/admin/project/{{d1}}/details', page.url(), p)) {
  22313 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  22314 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  22315 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  22316 |           seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  22317 |         }
  22318 |       }
  22319 |       if (seen.presence !== 'present') {
  22320 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8105/en/admin/project/{{d1}}/details', page.url(), p, `${p.v2}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  22321 |         if (verdict.warning) logWarning('03-create s_97630b: ' + verdict.warning);
  22322 |         if (!verdict.pass) throw new Error('03-create s_97630b: identity: {{v2}} is not confirmed on this page');
  22323 |       }
  22324 |     }
  22325 | 
  22326 |     // @step 03-create s_97630b/1
  22327 |     let urlBefore12 = '';
  22328 |     await runStepLifecycle({
  22329 |       prepare: async () => {
  22330 |         await settle(page);
  22331 |         urlBefore12 = page.url();
  22332 |       },
  22333 |       act: async () => {
  22334 |         absentDialog = null;
  22335 |         outputs['03-create.project_description'] = await readOptional(page, [
  22336 |           { locator: page.getByText(`Bench project created by automation for runid ${p.v1}`, { exact: true }), index: 0, structural: false, kind: 'text', carries: JSON.stringify({ kind: 'text', text: `Bench project created by automation for runid ${p.v1}` }) },
  22337 |           { locator: page.locator('#project_details_box > div:nth-of-type(2) > div > p'), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#project_details_box > div:nth-of-type(2) > div > p' }) },
  22338 |           { locator: pointLocator(page, { x: 760, y: 228 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 760, y: 228, w: 974, h: 20, role: null, tag: 'p', vw: 1280, vh: 900 }), point: { x: 760, y: 228, w: 974, h: 20, role: null, tag: 'p', vw: 1280, vh: 900 } },
  22339 |         ], '03-create s_97630b/1 target', { requireIdentity: identityValues({ v1: p.v1 }, ['Bench project created by automation for runid {{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, async (loc: Locator) => scopedRead(await readElements(loc, false, 'text'), { within: p['v1'] }), { drift: run.drift, kinds: [{"role":null,"tag":"p"}], label: 'project_description' });
  22340 |         await echoRead(echoLedger, run, 'project_description', '03-create.project_description', outputs['03-create.project_description'], '03-create s_97630b/1', page, lastReadHit);
  22341 |         return { status: 'completed', value: undefined };
  22342 |       },
  22343 |       settle: async () => {
  22344 |         if (page.url() !== urlBefore12) await settle(page);
  22345 |       },
  22346 |       bind: async () => {
  22347 |       },
  22348 |       verify: async () => {
  22349 |         errorPageGate(page, '03-create s_97630b/1');
  22350 |       },
  22351 |     });
  22352 | 
  22353 |     // @step 03-create s_97630b/2
  22354 |     let urlBefore13 = '';
  22355 |     await runStepLifecycle({
  22356 |       prepare: async () => {
  22357 |         await settle(page);
  22358 |         urlBefore13 = page.url();
  22359 |       },
  22360 |       act: async () => {
  22361 |         absentDialog = null;
  22362 |         outputs['03-create.project_name'] = await readOptional(page, [
  22363 |           { locator: page.locator('#project_details_box > div:nth-of-type(1) > h3 > span'), index: 0, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#project_details_box > div:nth-of-type(1) > h3 > span' }) },
  22364 |           { locator: pointLocator(page, { x: 412, y: 173 }), index: 1, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 412, y: 173, w: 269.3, h: 20, role: null, tag: 'span', vw: 1280, vh: 900 }), point: { x: 412, y: 173, w: 269.3, h: 20, role: null, tag: 'span', vw: 1280, vh: 900 } },
  22365 |         ], '03-create s_97630b/2 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, async (loc: Locator) => scopedRead(await readElements(loc, false, 'text'), { within: p['v1'] }), { drift: run.drift, kinds: [{"role":null,"tag":"span"}], label: 'project_name' });
  22366 |         await echoRead(echoLedger, run, 'project_name', '03-create.project_name', outputs['03-create.project_name'], '03-create s_97630b/2', page, lastReadHit);
  22367 |         return { status: 'completed', value: undefined };
  22368 |       },
  22369 |       settle: async () => {
  22370 |         if (page.url() !== urlBefore13) await settle(page);
  22371 |       },
  22372 |       bind: async () => {
  22373 |       },
  22374 |       verify: async () => {
  22375 |         errorPageGate(page, '03-create s_97630b/2');
  22376 |       },
  22377 |     });
  22378 | 
  22379 |     // @step 03-create s_97630b/3
  22380 |     let urlBefore14 = '';
  22381 |     await runStepLifecycle({
  22382 |       prepare: async () => {
  22383 |         await settle(page);
  22384 |         urlBefore14 = page.url();
```