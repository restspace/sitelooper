# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hakm3.spec.ts >> hakm3
- Location: hakm3.spec.ts:9:1

# Error details

```
Error: after 03-create s_11f319/4 expected url http://127.0.0.1:8105/en/admin/project/:id/details but browser is at http://127.0.0.1:8105/en/admin/project
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - dialog [ref=e2]:
    - document:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - heading "Create project" [level=5] [ref=e6]
          - button "Close" [ref=e7] [cursor=pointer]
        - generic [ref=e8]:
          - generic [ref=e9]:
            - generic [ref=e11]:
              - generic [ref=e12]: Name*
              - textbox "Name*" [ref=e13]: rbkm2-b-hakm3-1 Bench Project
            - generic [ref=e15]:
              - generic [ref=e16]: Color
              - combobox [ref=e17]:
                - option [selected]
                - option "Silver"
                - option "Gray"
                - option "Black"
                - option "Maroon"
                - option "Brown"
                - option "Red"
                - option "Orange"
                - option "Gold"
                - option "Yellow"
                - option "Peach"
                - option "Khaki"
                - option "Olive"
                - option "Lime"
                - option "Jelly"
                - option "Green"
                - option "Teal"
                - option "Aqua"
                - option "LightBlue"
                - option "DeepSky"
                - option "Dodger"
                - option "Blue"
                - option "Navy"
                - option "Purple"
                - option "Fuchsia"
                - option "Violet"
                - option "Rose"
                - option "Lavender"
              - combobox "Color" [ref=e19] [cursor=pointer]
          - generic [ref=e20]:
            - generic [ref=e21]: Description
            - textbox "Description" [ref=e22]: "Bench project created by automated run rbkm2-b-hakm3-1. runid: rbkm2-b-hakm3-1"
          - generic [ref=e23]:
            - generic [ref=e25]:
              - generic [ref=e26]: Customer*
              - combobox [active] [ref=e27]:
                - option [selected]
                - option "Bench Customer"
                - option "Bench Customer Ltd"
                - option "Bench Customers Group"
              - combobox "Customer*" [ref=e30] [cursor=pointer]
            - generic [ref=e32]:
              - generic [ref=e33]: Project number
              - textbox "Project number" [ref=e34]: "0005"
          - generic [ref=e35]:
            - generic [ref=e37]:
              - generic [ref=e38]: Project start
              - generic [ref=e39]:
                - link "" [ref=e40] [cursor=pointer]:
                  - /url: "#"
                  - generic [ref=e41]: 
                - textbox "Project start" [ref=e42]:
                  - /placeholder: M/D/YYYY
                - link "" [ref=e43] [cursor=pointer]:
                  - /url: "javascript: void(0)"
                  - generic [ref=e44]: 
              - generic [ref=e45]: Times before this date cannot be recorded.
            - generic [ref=e47]:
              - generic [ref=e48]: Project end
              - generic [ref=e49]:
                - link "" [ref=e50] [cursor=pointer]:
                  - /url: "#"
                  - generic [ref=e51]: 
                - textbox "Project end" [ref=e52]:
                  - /placeholder: M/D/YYYY
                - link "" [ref=e53] [cursor=pointer]:
                  - /url: "javascript: void(0)"
                  - generic [ref=e54]: 
              - generic [ref=e55]: Times after this date cannot be recorded.
            - generic [ref=e57]:
              - generic [ref=e58]: Times locked until
              - generic [ref=e59]:
                - link "" [ref=e60] [cursor=pointer]:
                  - /url: "#"
                  - generic [ref=e61]: 
                - textbox "Times locked until" [ref=e62]:
                  - /placeholder: M/D/YYYY
                - link "" [ref=e63] [cursor=pointer]:
                  - /url: "javascript: void(0)"
                  - generic [ref=e64]: 
              - generic [ref=e65]: Times up to and including this date can neither be created nor changed.
          - generic [ref=e66]:
            - generic [ref=e68]:
              - generic [ref=e69]: Budget
              - textbox "Budget" [ref=e70]: "0.00"
            - generic [ref=e72]:
              - generic [ref=e73]: Hourly quota
              - generic [ref=e75]:
                - generic [ref=e77]: 
                - textbox "Hourly quota" [ref=e78]: 0:00
            - generic [ref=e80]:
              - generic [ref=e81]: Budget-Type
              - combobox [ref=e82]:
                - option [selected]
                - option "Monthly"
              - combobox "Budget-Type" [ref=e84] [cursor=pointer]
          - generic [ref=e87]:
            - generic [ref=e88]: Team
            - listbox [ref=e89]
            - combobox "Team" [ref=e92]
            - generic [ref=e93]: Restricts visibility to the selected teams.
          - generic [ref=e97]:
            - button "Invoices" [ref=e99] [cursor=pointer]:
              - text: Invoices
              - img [ref=e101]
            - text:  
          - generic [ref=e103]:
            - generic [ref=e105]:
              - generic [ref=e106]:
                - checkbox "Visible" [checked] [ref=e107]
                - generic [ref=e108]: Visible
              - generic [ref=e109]: If the setting is off, the object is not displayed in dropdown-boxes and list-views.
            - generic [ref=e111]:
              - generic [ref=e112]:
                - checkbox "Billable" [checked] [ref=e113]
                - generic [ref=e114]: Billable
              - generic [ref=e115]: If the setting is off, all time entries recorded in the future will be marked as "not billable".
            - generic [ref=e117]:
              - generic [ref=e118]:
                - checkbox "Allow global activities" [checked] [ref=e119]
                - generic [ref=e120]: Allow global activities
              - generic [ref=e121]: If the setting is off, times can only be recorded with project-specific activities.
        - generic [ref=e122]:
          - button "Save" [ref=e123] [cursor=pointer]
          - button "Close" [ref=e124] [cursor=pointer]
  - generic [ref=e125]:
    - complementary [ref=e126]:
      - generic [ref=e127]:
        - heading "Kimai 2.68.0" [level=1] [ref=e128]:
          - link "Kimai 2.68.0" [ref=e129] [cursor=pointer]:
            - /url: /en/dashboard/
            - img "Kimai 2.68.0" [ref=e130]
        - text:   
        - list [ref=e132]:
          - listitem [ref=e133]:
            - link " Dashboard" [ref=e134] [cursor=pointer]:
              - /url: /en/dashboard/
              - generic [ref=e136]: 
              - generic [ref=e137]: Dashboard
          - listitem [ref=e138]:
            - button " Time Tracking" [expanded] [ref=e139] [cursor=pointer]:
              - generic [ref=e141]: 
              - generic [ref=e142]: Time Tracking
            - generic [ref=e145]:
              - link " My times" [ref=e146] [cursor=pointer]:
                - /url: /en/timesheet/
                - generic [ref=e148]: 
                - text: My times
              - link " Weekly hours" [ref=e149] [cursor=pointer]:
                - /url: /en/quick_entry/
                - generic [ref=e151]: 
                - text: Weekly hours
              - link " Calendar" [ref=e152] [cursor=pointer]:
                - /url: /en/calendar/
                - generic [ref=e154]: 
                - text: Calendar
              - link " Export" [ref=e155] [cursor=pointer]:
                - /url: /en/export/
                - generic [ref=e157]: 
                - text: Export
              - link " All times" [ref=e158] [cursor=pointer]:
                - /url: /en/team/timesheet/
                - generic [ref=e160]: 
                - text: All times
          - listitem [ref=e161]:
            - button " Employment contract" [expanded] [ref=e162] [cursor=pointer]:
              - generic [ref=e164]: 
              - generic [ref=e165]: Employment contract
            - text: 
          - listitem [ref=e166]:
            - link " Reporting" [ref=e167] [cursor=pointer]:
              - /url: /en/reporting/
              - generic [ref=e169]: 
              - generic [ref=e170]: Reporting
          - listitem [ref=e171]:
            - button " Invoices" [expanded] [ref=e172] [cursor=pointer]:
              - generic [ref=e174]: 
              - generic [ref=e175]: Invoices
            - text:   
          - listitem [ref=e176]:
            - button " Administration" [expanded] [ref=e177] [cursor=pointer]:
              - generic [ref=e179]: 
              - generic [ref=e180]: Administration
            - generic [ref=e183]:
              - link " Customers" [ref=e184] [cursor=pointer]:
                - /url: /en/admin/customer/
                - generic [ref=e186]: 
                - text: Customers
              - link " Projects" [ref=e187] [cursor=pointer]:
                - /url: /en/admin/project/
                - generic [ref=e189]: 
                - text: Projects
              - link " Activities" [ref=e190] [cursor=pointer]:
                - /url: /en/admin/activity/
                - generic [ref=e192]: 
                - text: Activities
              - link " Tags" [ref=e193] [cursor=pointer]:
                - /url: /en/admin/tags/
                - generic [ref=e195]: 
                - text: Tags
          - listitem [ref=e196]:
            - button " System" [expanded] [ref=e197] [cursor=pointer]:
              - generic [ref=e199]: 
              - generic [ref=e200]: System
            - text:      
    - banner [ref=e201]:
      - generic [ref=e202]:
        - generic [ref=e203]:
          - generic [ref=e205]:
            - text: 
            - link " 0:00" [ref=e207] [cursor=pointer]:
              - /url: /en/timesheet/create
              - generic [ref=e208]: 
              - generic [ref=e209]: 0:00
          - link "" [ref=e211] [cursor=pointer]:
            - /url: /en/favorite/timesheet/
            - generic [ref=e212]: 
          - link "Open personal menu" [ref=e214] [cursor=pointer]:
            - /url: "#"
            - generic "admin" [ref=e216]: AD
            - generic [ref=e218]: admin
        - generic [ref=e219]:
          - heading "Projects" [level=2] [ref=e220]
          - generic [ref=e222]: "3"
    - generic [ref=e223]:
      - generic [ref=e226]:
        - generic [ref=e228]:
          - link "Customize display" [ref=e229] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e230]: 
          - generic [ref=e232]:
            - button "" [ref=e233] [cursor=pointer]:
              - generic [ref=e234]: 
            - text: "* * *"
            - textbox "Search" [ref=e235]
            - button "Search" [ref=e237] [cursor=pointer]:
              - generic [ref=e238]: 
        - generic [ref=e240]:
          - generic [ref=e241]:
            - link "+ Create" [ref=e242] [cursor=pointer]:
              - /url: /en/admin/project/create
              - generic [ref=e243]: +
              - text: Create
            - link " Export" [ref=e244] [cursor=pointer]:
              - /url: /en/admin/project/export
              - generic [ref=e245]: 
              - text: Export
          - text: 
      - generic [ref=e247]:
        - generic [ref=e249]:
          - grid [ref=e252]:
            - rowgroup [ref=e253]:
              - row "Name  Team" [ref=e254]:
                - columnheader "Name " [ref=e255] [cursor=pointer]
                - text:          
                - columnheader "Team" [ref=e256]
                - text: 
                - columnheader [ref=e257]
            - rowgroup [ref=e258]:
              - 'row "Seed: Annual audit 0 Actions" [ref=e259] [cursor=pointer]':
                - 'gridcell "Seed: Annual audit" [ref=e260]':
                  - generic [ref=e261]: "Seed: Annual audit"
                - gridcell "0" [ref=e263]:
                  - generic [ref=e264]: "0"
                - gridcell "Actions" [ref=e265]:
                  - link "Actions" [ref=e267]:
                    - /url: "#"
                    - generic [ref=e268]: 
              - 'row "Seed: Office move 0 Actions" [ref=e269] [cursor=pointer]':
                - 'gridcell "Seed: Office move" [ref=e270]':
                  - generic [ref=e271]: "Seed: Office move"
                - gridcell "0" [ref=e273]:
                  - generic [ref=e274]: "0"
                - gridcell "Actions" [ref=e275]:
                  - link "Actions" [ref=e277]:
                    - /url: "#"
                    - generic [ref=e278]: 
              - 'row "Seed: Website relaunch 0 Actions" [ref=e279] [cursor=pointer]':
                - 'gridcell "Seed: Website relaunch" [ref=e280]':
                  - generic [ref=e281]: "Seed: Website relaunch"
                - gridcell "0" [ref=e283]:
                  - generic [ref=e284]: "0"
                - gridcell "Actions" [ref=e285]:
                  - link "Actions" [ref=e287]:
                    - /url: "#"
                    - generic [ref=e288]: 
          - generic [ref=e289]:
            - paragraph [ref=e290]: Show entries 1 to 3 from 3.
            - list [ref=e291]:
              - listitem [ref=e292]:
                - generic:
                  - generic: 
              - listitem [ref=e293]:
                - link "1" [ref=e294] [cursor=pointer]:
                  - /url: /en/admin/project/page/1
              - listitem [ref=e295]:
                - generic:
                  - generic: 
        - 'link "? Documentation: Projects" [ref=e296] [cursor=pointer]':
          - /url: https://www.kimai.org/documentation/project.html?utm_source=kimai&utm_medium=float-help
          - generic [ref=e297]: "?"
          - generic:
            - generic: "Documentation: Projects"
  - text:        
```

# Test source

```ts
  16037 |  * it was. Every goto this file emits passes this, so the artifact fails the
  16038 |  * same way, at the same moment, as the daemon replaying the same step.
  16039 |  */
  16040 | const GOTO_TIMEOUT_MS = 30_000;
  16041 | 
  16042 | /**
  16043 |  * A soft finding, in the one grep-able shape replay reports its own warnings in.
  16044 |  *
  16045 |  * stdout, not stderr, like every `[sitelooper …]` line this file logs: the
  16046 |  * list reporter forwards a worker's stdout live and batches its stderr to the
  16047 |  * END of the run, so a run that is killed (a harness watchdog, a CI timeout)
  16048 |  * loses everything written to stderr. On stdout these interleave with the
  16049 |  * `[sitelooper step]` lines and survive the kill, which is the only record of
  16050 |  * where the run had got to.
  16051 |  */
  16052 | function logWarning(line: string): void {
  16053 |   console.log(`[sitelooper warn] ${line}`);
  16054 | }
  16055 | 
  16056 | /** Where the Node module that writes the outputs file lives, as a value: this file type-checks without @types/node. */
  16057 | const NODE_FS: string = 'node:fs';
  16058 | /**
  16059 |  * The run's findings — every published output except the references a later
  16060 |  * step only borrowed (run.referenceOnly) — as JSON: attached to the test as
  16061 |  * `outputs`, and written to $SITELOOPER_SPEC_OUTPUTS when it is set. A compiled
  16062 |  * run's report-only objectives were UNVERIFIABLE on every bench sweep ("+2
  16063 |  * n/a" on each compiled row): what the flow found was only ever in a log.
  16064 |  * Never fails the run: a finding that cannot be written is said and dropped.
  16065 |  */
  16066 | async function publishOutputs(run: FlowRun): Promise<void> {
  16067 |   const findings = Object.fromEntries(Object.entries(run.outputs).filter(([k, v]) => typeof v === 'string' && !run.referenceOnly.includes(k)));
  16068 |   const body = JSON.stringify(findings, null, 2);
  16069 |   const file = process.env.SITELOOPER_SPEC_OUTPUTS;
  16070 |   if (file) {
  16071 |     try {
  16072 |       const fs = (await import(NODE_FS)) as { writeFileSync(path: string, data: string): void };
  16073 |       fs.writeFileSync(file, body);
  16074 |     } catch (err) {
  16075 |       logWarning(`could not write the outputs file ${file}: ${err instanceof Error ? err.message : String(err)}`);
  16076 |     }
  16077 |   }
  16078 |   try {
  16079 |     await test.info().attach('outputs', { body, contentType: 'application/json' });
  16080 |   } catch {
  16081 |     // Not inside a Playwright test (a caller driving runFlow itself): the file, if asked for, is the record.
  16082 |   }
  16083 | }
  16084 | 
  16085 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  16086 | let lastReadHit: Locator | null = null;
  16087 | 
  16088 | /**
  16089 |  * A published read whose value is only what this segment itself typed,
  16090 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  16091 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  16092 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  16093 |  * the value is still published, as replay still carries it to later steps.
  16094 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  16095 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  16096 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  16097 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  16098 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  16099 |  */
  16100 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  16101 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  16102 |   if (!echo) return;
  16103 |   run.echoed.push(key);
  16104 |   logWarning(echo);
  16105 | }
  16106 | 
  16107 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  16108 | function errorPageGate(page: Page, where: string): void {
  16109 |   const stop = errorPageVerdict(page.url(), where);
  16110 |   if (stop) throw new Error(stop);
  16111 | }
  16112 | 
  16113 | /**
  16114 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  16115 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  16116 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  16117 |  * literal segments is treated as volatile (warned, continued), anything else
  16118 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  16119 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  16120 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  16121 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  16122 |  * step's click reported of the link it clicked (the shared beginAction): a
  16123 |  * click that went where its link points, recorded as staying on the page it
  16124 |  * left, is the shared linkLandingWarning and waits for nothing.
  16125 |  */
  16126 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  16127 |   if (!urlMatches(pattern, page.url(), p)) {
  16128 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  16129 |     if (landed) return logWarning(landed);
  16130 |   }
  16131 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  16132 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  16133 |   for (const line of verdict.warnings) logWarning(line);
  16134 |   // What this step watched vary is the segment's evidence from here on
  16135 |   // (navigationTarget), whether or not the step goes on to stop.
  16136 |   if (verdict.diffs) volatile.push(...verdict.diffs);
> 16137 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: after 03-create s_11f319/4 expected url http://127.0.0.1:8105/en/admin/project/:id/details but browser is at http://127.0.0.1:8105/en/admin/project
  16138 | }
  16139 | 
  16140 | /**
  16141 |  * Where a goto actually sends the browser — the shared retargetNavigation
  16142 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  16143 |  * the live url sits at a position THIS segment has already watched vary is a
  16144 |  * literal from the recording's run, and the live value is navigated to
  16145 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  16146 |  * one per replayed skill. The returned `stale` is handed to this step's
  16147 |  * alert gate, so an unrecorded alert on the landing names the cause.
  16148 |  */
  16149 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  16150 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  16151 |   if (verdict.warning) logWarning(verdict.warning);
  16152 |   return verdict;
  16153 | }
  16154 | 
  16155 | /**
  16156 |  * The alert observation a step is judged by, taken where the daemon takes
  16157 |  * its diff: after the action, once the DOM has settled (tools.ts
  16158 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  16159 |  * inside verify's url window is seen by both runners or by neither.
  16160 |  * Rendered in the step's line dialect, with whether every live region was
  16161 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  16162 |  */
  16163 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  16164 |   await settle(page);
  16165 |   return liveAlertsObserved(page, dialect);
  16166 | }
  16167 | 
  16168 | /**
  16169 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  16170 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  16171 |  * and stops a state-changing step only when its recorded page changes did
  16172 |  * not confirm it worked (a rejection toast that leaves the page superficially
  16173 |  * intact); a recorded-but-missing one only warns.
  16174 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  16175 |  * `after` in settle, right after the action has settled and BEFORE the url
  16176 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  16177 |  * during a 5s url wait must not be missed) — and a page that could not be
  16178 |  * read is handed over as unobserved, never as "no alert".
  16179 |  */
  16180 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  16181 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  16182 |   for (const line of verdict.warnings) logWarning(line);
  16183 |   if (verdict.stop) throw new Error(verdict.stop);
  16184 | }
  16185 | 
  16186 | /**
  16187 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  16188 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  16189 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  16190 |  * page structure agrees, anything else refuses before the first step acts.
  16191 |  * `similarity` is what replay's adapter passes: where the recording kept a
  16192 |  * page fingerprint, the call site measures the live page with the shared
  16193 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  16194 |  * could not be read, exactly as replay; null where the recording kept none
  16195 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  16196 |  * compiled before the vector travelled, which refuses a soft match it cannot
  16197 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  16198 |  * (arguments evaluate left to right), as replay reads startUrl before it
  16199 |  * fingerprints: both describe the page as the segment found it, not where a
  16200 |  * navigation in flight landed during the measurement. Async so the call site
  16201 |  * must await it: a gate that could be left un-awaited is one that can
  16202 |  * silently become a no-op. Decided as replay decides it: through
  16203 |  * preconditionVerdictWithFacts (src/execution/facts-route.ts) over the facts
  16204 |  * snapshot this file carries for the url (siteFactsAt), which is the plain
  16205 |  * preconditionVerdict wherever no reliable site fact bears on the url.
  16206 |  */
  16207 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  16208 |   const verdict = preconditionVerdictWithFacts(siteFactsAt(url), pattern, url, p, similarity, mints);
  16209 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  16210 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  16211 | }
  16212 | 
  16213 | /**
  16214 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  16215 |  * source of truth, so the vector is carried once. A segment the emitter
  16216 |  * asked this of always has one; its absence means FLOW was edited by hand,
  16217 |  * and the gate fails closed rather than soft-match on the url alone.
  16218 |  */
  16219 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  16220 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  16221 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  16222 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  16223 |   return recorded;
  16224 | }
  16225 | 
  16226 | /**
  16227 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  16228 |  *
  16229 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  16230 |  * action and, when the action changed it, awaits settleDom before binding
  16231 |  * the step's derived values — the value a spec needs is the one on the url
  16232 |  * the step navigated TO, and `page.url()` read in the same tick as the
  16233 |  * click still says where the page came FROM. Bound empty, every pattern
  16234 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  16235 |  *
  16236 |  * ALL of them together, not one at a time, because they are read into ONE
  16237 |  * pattern: an app is free to populate its state fragment key by key (odoo
```