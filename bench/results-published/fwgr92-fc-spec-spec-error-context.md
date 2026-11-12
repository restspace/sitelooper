# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgr92-fc.spec.ts >> fwgr92-fc
- Location: fwgr92-fc.spec.ts:9:1

# Error details

```
Error: persistence: 05-set typed "bench", the record at http://127.0.0.1:3000/d/dg42ieytciiv4c/fwgr92-fc-spec-bench-dashboard?from=now-6h&to=now&timezone=browser does not show it after reload (missing - button "Remove \"bench\" tag")
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - link "Skip to main content" [ref=e5] [cursor=pointer]:
    - /url: "#pageContent"
    - generic [ref=e6]: Skip to main content
  - banner [ref=e7]:
    - generic [ref=e8]:
      - link "Grafana" [ref=e10] [cursor=pointer]:
        - /url: /
        - img "Grafana" [ref=e11]
      - generic [ref=e14]:
        - img [ref=e16]
        - button "Search or jump to..." [ref=e18] [cursor=pointer]
        - generic [ref=e19]:
          - img [ref=e20]
          - generic [ref=e22]: ctrl+k
      - generic [ref=e23]:
        - button "New" [ref=e24] [cursor=pointer]:
          - img [ref=e25]
          - img [ref=e27]
        - button "Help" [ref=e30] [cursor=pointer]:
          - img [ref=e31]
        - button "Profile" [ref=e33] [cursor=pointer]:
          - img "User avatar" [ref=e34]
    - generic [ref=e35]:
      - button "Open menu" [ref=e37] [cursor=pointer]:
        - img [ref=e38]
      - navigation "Breadcrumbs" [ref=e40]:
        - list [ref=e41]:
          - listitem [ref=e42]:
            - link "Home" [ref=e43] [cursor=pointer]:
              - /url: /
            - img [ref=e45]
          - listitem [ref=e47]:
            - link "Dashboards" [ref=e48] [cursor=pointer]:
              - /url: /dashboards
            - img [ref=e50]
          - listitem [ref=e52]:
            - generic "fwgr92-fc-spec Bench Dashboard" [ref=e53]
      - generic [ref=e54]:
        - generic [ref=e56]:
          - button "Mark as favorite" [ref=e58] [cursor=pointer]:
            - img [ref=e59]
          - button "Share" [ref=e64] [cursor=pointer]:
            - generic [ref=e65]: Share
          - button "Edit" [ref=e67] [cursor=pointer]:
            - generic [ref=e68]: Edit
        - button "Toggle top search bar" [ref=e70] [cursor=pointer]:
          - img [ref=e72]
  - main [ref=e76]:
    - generic [ref=e79]:
      - generic [ref=e82]:
        - generic [ref=e83]:
          - 'button "Time range selected: Last 6 hours" [ref=e84] [cursor=pointer]':
            - img [ref=e85]
            - generic [ref=e89]: Last 6 hours
            - img [ref=e90]
          - button "Zoom out time range" [ref=e92] [cursor=pointer]:
            - img [ref=e93]
        - generic [ref=e95]:
          - button "Refresh" [ref=e96] [cursor=pointer]:
            - img [ref=e97]
            - generic [ref=e99]: Refresh
          - button "Choose refresh time interval with current interval 1 minute selected" [ref=e101] [cursor=pointer]:
            - generic [ref=e102]: 1m
            - img [ref=e103]
      - generic [ref=e109]:
        - region "fwgr92-fc-spec Notes" [ref=e113]:
          - heading "fwgr92-fc-spec Notes" [level=2] [ref=e116]
          - generic [ref=e120]:
            - paragraph [ref=e121]: fwgr92-fc-spec Notes
            - paragraph [ref=e122]: "Run ID: fwgr92-fc-spec — bench notes panel."
        - region "fwgr92-fc-spec Availability" [ref=e126]:
          - heading "fwgr92-fc-spec Availability" [level=2] [ref=e129]
          - generic "A-series" [ref=e132]:
            - generic [ref=e135]: "91.2"
```

# Test source

```ts
  25184 |         urlBefore8 = page.url();
  25185 |       },
  25186 |       act: async () => {
  25187 |         outputs['07-report.availability_stat_value'] = await readOptional(page, [
  25188 |           { locator: page.locator('[data-testid="data-testid panel content"] span'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '[data-testid="data-testid panel content"] span' }) },
  25189 |           { locator: page.locator('div > div > div:nth-of-type(1) > div > div > span').nth(1), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'div > div > div:nth-of-type(1) > div > div > span', nth: 1 }), nth: 1 },
  25190 |           { locator: pointLocator(page, { x: 326, y: 616 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 326, y: 616, w: 310.6, h: 174, role: null, tag: 'span', vw: 1280, vh: 900 }), point: { x: 326, y: 616, w: 310.6, h: 174, role: null, tag: 'span', vw: 1280, vh: 900 } },
  25191 |         ], '07-report s_21d373/8 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift, kinds: [{"role":null,"tag":"span"}], label: 'availability_stat_value' });
  25192 |         await echoRead(echoLedger, run, 'availability_stat_value', '07-report.availability_stat_value', outputs['07-report.availability_stat_value'], '07-report s_21d373/8', page, lastReadHit);
  25193 |         return { status: 'completed', value: undefined };
  25194 |       },
  25195 |       settle: async () => {
  25196 |         if (page.url() !== urlBefore8) await settle(page);
  25197 |       },
  25198 |       bind: async () => {
  25199 |       },
  25200 |       verify: async () => {
  25201 |         errorPageGate(page, '07-report s_21d373/8');
  25202 |       },
  25203 |     });
  25204 | 
  25205 |     if (observedNothing([{"tool":"read","args":{"what":"url"},"locators":{"target":[]},"label":"dashboard_page_url"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0,0]},"label":"auto_refresh_visible"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0,0,0,0]},"label":"saved_title_breadcrumb"},{"tool":"read","args":{"what":"title"},"locators":{"target":[]},"label":"browser_tab_title"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0]},"label":"time_range"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0]},"label":"panels_visible_1"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0]},"label":"panels_visible_2"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0]},"label":"availability_stat_value"}], skippedReads.length - readsBefore1)) {
  25206 |       throw new Error('s_21d373: every read of this read-only procedure was skipped — the page is not the one it was recorded reading');
  25207 |     }
  25208 | 
  25209 |     // Shadow: this segment's reads against their recorded report templates (reported, never thrown).
  25210 |     if (shadowEnabled()) for (const line of readShadowLines({"dashboard_page_url":1,"auto_refresh_visible":2,"saved_title_breadcrumb":3,"browser_tab_title":4,"time_range":5,"panels_visible_1":6,"panels_visible_2":7,"availability_stat_value":8}, {"dashboard_page_url":"http://127.0.0.1:3000/d/bg42gt535vc3kc/{{v2}}-bench-dashboard?from=now-6h&to=now&timezone=browser&refresh=1m","auto_refresh_visible":"1m","saved_title_breadcrumb":"{{v1}}","browser_tab_title":"{{v1}} - Dashboards - Grafana","time_range":"Last 6 hours","panels_visible_1":"{{v2}} Notes","panels_visible_2":"{{v2}} Availability","availability_stat_value":"84.3"}, p, { 'dashboard_page_url': outputs['07-report.dashboard_page_url'] as string | undefined, 'auto_refresh_visible': outputs['07-report.auto_refresh_visible'] as string | undefined, 'saved_title_breadcrumb': outputs['07-report.saved_title_breadcrumb'] as string | undefined, 'browser_tab_title': outputs['07-report.browser_tab_title'] as string | undefined, 'time_range': outputs['07-report.time_range'] as string | undefined, 'panels_visible_1': outputs['07-report.panels_visible_1'] as string | undefined, 'panels_visible_2': outputs['07-report.panels_visible_2'] as string | undefined, 'availability_stat_value': outputs['07-report.availability_stat_value'] as string | undefined }, run.echoed.filter((k) => k.startsWith('07-report.')).map((k) => k.slice(10)))) console.log('[sitelooper shadow] 07-report s_21d373: ' + line);
  25211 | 
  25212 |     // The step's report values built from this run's own parameters, as the daemon reports them (synthesizeReport).
  25213 |     const reportShown = await shownForReport(page).catch(() => null);
  25214 |     const reportGiven = { typed: [], live: Object.entries(outputs).filter(([k, v]) => k.startsWith('07-report.') && typeof v === 'string' && !run.echoed.includes(k)).map(([, v]) => v as string), committed: [], visited: reportTrail.urls };
  25215 |     reportTrail.stop();
  25216 |     if (outputs['07-report.dashboard_page_url'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, 'http://127.0.0.1:3000/d/bg42gt535vc3kc/{{v2}}-bench-dashboard?from=now-6h&to=now&timezone=browser&refresh=1m', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value dashboard_page_url is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value dashboard_page_url is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.dashboard_page_url'] = c.value; }
  25217 |     if (outputs['07-report.dashboard_slug'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v2}}-bench-dashboard', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value dashboard_slug is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value dashboard_slug is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.dashboard_slug'] = c.value; }
  25218 |     if (outputs['07-report.saved_title_breadcrumb'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v1}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value saved_title_breadcrumb is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value saved_title_breadcrumb is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.saved_title_breadcrumb'] = c.value; }
  25219 |     if (outputs['07-report.browser_tab_title'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v1}} - Dashboards - Grafana', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value browser_tab_title is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value browser_tab_title is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.browser_tab_title'] = c.value; }
  25220 |     if (outputs['07-report.saved_title'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v1}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value saved_title is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value saved_title is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.saved_title'] = c.value; }
  25221 |     if (outputs['07-report.run_id'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v2}}', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value run_id is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value run_id is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.run_id'] = c.value; }
  25222 |     if (outputs['07-report.panels_visible_1'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v2}} Notes', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value panels_visible_1 is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value panels_visible_1 is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.panels_visible_1'] = c.value; }
  25223 |     if (outputs['07-report.panels_visible_2'] === undefined) { const c = classifyReportValueWithFacts(siteFactsAt(page.url()), page.url(), {}, '{{v2}} Availability', p, reportShown, reportGiven); if (c.class === 'given') { logWarning('07-report: report value panels_visible_2 is given, not observed: it is built only from the step\'s own parameters, and neither this run\'s page nor any of its reads shows it — withheld'); } if (c.class === 'echo') { logWarning('07-report: report value panels_visible_2 is only what this run typed: no click\'s own diff showed it outside its control and no read returned it — withheld from the report (still given to a later step)'); } if (c.value !== null) outputs['07-report.panels_visible_2'] = c.value; }
  25224 |   },
  25225 | };
  25226 | 
  25227 | /** Runs every step in order. Each call owns its output and drift state. */
  25228 | export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {
  25229 |   validateInputs(vars);
  25230 |   page.setDefaultTimeout(30000);
  25231 |   page.setDefaultNavigationTimeout(30000);
  25232 |   const run = options.run ?? createFlowRun();
  25233 |   run.outputs = {};
  25234 |   run.drift.length = 0;
  25235 |   run.echoed = [];
  25236 |   run.referenceOnly = [];
  25237 |   run.created = [];
  25238 |   run.warnings = [];
  25239 |   run.partial = [];
  25240 |   run.probes = [];
  25241 |   const outputs = run.outputs;
  25242 |   try {
  25243 |     const browserMismatch = profileMismatch(RECORDED_BROWSER, await readLiveBrowser(page));
  25244 |     if (browserMismatch) {
  25245 |       run.warnings.push(browserMismatch);
  25246 |       console.log(`[sitelooper warn] ${browserMismatch}`);
  25247 |     }
  25248 |     // Traffic is recorded from the start url on, as the daemon records it from adopting the page.
  25249 |     pageTraffic(page);
  25250 |     await page.goto(options.startUrl ?? 'http://127.0.0.1:3000/', { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  25251 |     await waitForContent(page).catch(() => {});
  25252 |     await startPageSettled(page).catch(() => {});
  25253 |     await test.step('01-signin: Sign in to Grafana at http://127.0.0.1:3000/ using username admin and password exactly {{env:APP_PASSWORD}}. Verify that the signed-in Grafana page is reached.', async () => {
  25254 |       await steps['01-signin'](page, { v1: 'http://127.0.0.1:3000/', v2: 'admin', v3: process.env['APP_PASSWORD'] ?? '' }, outputs, run);
  25255 |       console.log('[sitelooper step] 01-signin');
  25256 |     });
  25257 |     await test.step('02-find: Find and open the provisioned dashboard named Service health, then report the titles of all its panels exactly as displayed on the dashboard.', async () => {
  25258 |       await steps['02-find'](page, {  }, outputs, run);
  25259 |       console.log('[sitelooper step] 02-find');
  25260 |     });
  25261 |     await test.step('03-create: Create a NEW Grafana dashboard titled {{runid}} Bench Dashboard. Add a Stat panel titled {{runid}} Availability whose query uses the TestData data source, then apply the panel and explicitly save the dashboard. Verify the saved dashboard title, panel title/type, selected query data source, and report the dashboard page URL read from the browser.', async () => {
  25262 |       await steps['03-create'](page, { v1: vars.runid, v2: 'Bench', v3: `${vars.runid} Bench Dashboard`, v4: 'Stat', v5: `${vars.runid} Availability` }, outputs, run);
  25263 |       console.log('[sitelooper step] 03-create');
  25264 |     });
  25265 |     await test.step('04-add: On the existing saved dashboard {{runid}} Bench Dashboard, add a Text visualization panel titled {{runid}} Notes with content that includes the exact runid {{runid}}. Apply it and explicitly save the dashboard. Verify the saved panel title and that its rendered content includes the runid.', async () => {
  25266 |       await steps['04-add'](page, { v1: `${vars.runid} Bench Dashboard`, v2: vars.runid, v4: 'Text', v5: `${vars.runid} Notes` }, outputs, run);
  25267 |       console.log('[sitelooper step] 04-add');
  25268 |     });
  25269 |     await test.step('05-set: Update the saved dashboard {{runid}} Bench Dashboard to have the tag bench and a default time range of last 6 hours. Ensure the time picker is set to Last 6 hours, then explicitly save and tick the save dialog\'s \'Update default time range\' option so the range persists. Verify the tag and persistence choice from the saved dashboard/save confirmation.', async () => {
  25270 |       await steps['05-set'](page, { v1: `${vars.runid} Bench Dashboard`, v2: vars.runid, v4: 'bench', v5: need(outputs, '03-create.url.p1', '05-set'), v6: outputs['03-create.url.p2'] ?? '' }, outputs, run);
  25271 |       console.log('[sitelooper step] 05-set');
  25272 |     });
  25273 |     await test.step('06-set: Set the saved dashboard {{runid}} Bench Dashboard auto-refresh interval to 1m and explicitly save the dashboard. Verify the auto-refresh control shows 1m after saving.', async () => {
  25274 |       await steps['06-set'](page, { v1: `${vars.runid} Bench Dashboard`, v2: vars.runid, v4: need(outputs, '03-create.url.p1', '06-set'), v5: outputs['03-create.url.p2'] ?? '' }, outputs, run);
  25275 |       console.log('[sitelooper step] 06-set');
  25276 |     });
  25277 |     await test.step('07-report: On the saved dashboard {{runid}} Bench Dashboard, read the current browser page URL directly from the address bar after loading the dashboard, and report its exact URL or UID. Also confirm the saved title and the visible 1m auto-refresh state.', async () => {
  25278 |       await steps['07-report'](page, { v1: `${vars.runid} Bench Dashboard`, v2: vars.runid }, outputs, run);
  25279 |       console.log('[sitelooper step] 07-report');
  25280 |     });
  25281 |     const unpersisted = await test.step('persistence: re-read what the flow saved', async () => await runProbes(page, run));
  25282 |     const failures: string[] = [...unpersisted];
  25283 |     if (run.partial.length && process.env.SITELOOPER_ALLOW_PARTIAL !== '1') failures.push(`PARTIAL: ${run.partial.join('; ')}`);
> 25284 |     if (failures.length) throw new Error(failures.join('\n'));
        |                                ^ Error: persistence: 05-set typed "bench", the record at http://127.0.0.1:3000/d/dg42ieytciiv4c/fwgr92-fc-spec-bench-dashboard?from=now-6h&to=now&timezone=browser does not show it after reload (missing - button "Remove \"bench\" tag")
  25285 |     return outputs;
  25286 |   } finally {
  25287 |     DRIFT.splice(0, DRIFT.length, ...run.drift);
  25288 |     await publishOutputs(run);
  25289 |   }
  25290 | }
  25291 | 
```