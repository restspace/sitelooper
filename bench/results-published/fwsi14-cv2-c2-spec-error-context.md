# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwsi14-cv2.spec.ts >> fwsi14-cv2
- Location: fwsi14-cv2.spec.ts:9:1

# Error details

```
Error: after 03-open s_911eab/1 expected url http://127.0.0.1:8098/hardware/9/edit but browser is at http://127.0.0.1:8098/hardware/9#history
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - navigation [ref=e5]:
        - button " Toggle navigation" [ref=e6] [cursor=pointer]:
          - text: 
          - generic [ref=e7]: Toggle navigation
        - link "Bench Assets" [ref=e10] [cursor=pointer]:
          - /url: http://127.0.0.1:8098
        - list [ref=e12]:
          - text: 
          - listitem [ref=e13]:
            - link [ref=e14] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware
              - generic [ref=e15]: 
              - generic [ref=e16]: Assets
          - listitem [ref=e17]:
            - link [ref=e18] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/licenses
              - generic [ref=e19]: 
              - generic [ref=e20]: Licenses
          - listitem [ref=e21]:
            - link [ref=e22] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/accessories
              - generic [ref=e23]: 
              - generic [ref=e24]: Accessories
          - listitem [ref=e25]:
            - link [ref=e26] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/consumables
              - generic [ref=e27]: 
              - generic [ref=e28]: Consumables
          - listitem [ref=e29]:
            - link [ref=e30] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/components
              - generic [ref=e31]: 
              - generic [ref=e32]: Components
          - listitem [ref=e33]:
            - link [ref=e34] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/users
              - generic [ref=e35]: 
              - generic [ref=e36]: Users
          - listitem [ref=e37]:
            - search [ref=e38]:
              - generic [ref=e39]:
                - generic [ref=e40]: Lookup by Asset Tag
                - textbox "Lookup by Asset Tag" [active] [ref=e41]: BA-00009
                - button "Search" [ref=e43] [cursor=pointer]:
                  - generic [ref=e44]: 
                  - generic [ref=e45]: Search
          - listitem [ref=e46]:
            - link [ref=e47] [cursor=pointer]:
              - /url: "#"
              - text: Create New
              - strong [ref=e48]
            - text:      
          - listitem [ref=e49]:
            - link "Alerts" [ref=e50] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e51]: 
              - generic [ref=e52]: Alerts
          - listitem [ref=e53]:
            - link "Bench Admin" [ref=e54] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e55]:
                - text: Bench Admin
                - strong [ref=e56]
            - text:        
          - listitem [ref=e57]:
            - link "Admin Settings" [ref=e58] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/admin
              - generic [ref=e59]: 
              - generic [ref=e60]: Admin Settings
    - complementary [ref=e61]:
      - list [ref=e63]:
        - listitem [ref=e64]:
          - link [ref=e65] [cursor=pointer]:
            - /url: http://127.0.0.1:8098
            - generic [ref=e66]: 
        - listitem [ref=e67]:
          - link [ref=e68] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e69]: 
            - text: 
          - text:          
        - listitem [ref=e70]:
          - link [ref=e71] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e72]: 
            - text: 
          - text:  
        - listitem [ref=e73]:
          - link [ref=e74] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/licenses
            - generic [ref=e75]: 
        - listitem [ref=e76]:
          - link [ref=e77] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/accessories
            - generic [ref=e78]: 
        - listitem [ref=e79]:
          - link [ref=e80] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/consumables
            - generic [ref=e81]: 
        - listitem [ref=e82]:
          - link [ref=e83] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/components
            - generic [ref=e84]: 
        - listitem [ref=e85]:
          - link [ref=e86] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/kits
            - generic [ref=e87]: 
        - listitem [ref=e88]:
          - link [ref=e89] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e90]: 
            - text: 
          - text:      
        - listitem [ref=e91]:
          - link [ref=e92] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/import
            - generic [ref=e93]: 
        - listitem [ref=e94]:
          - link [ref=e95] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e96]: 
            - text: 
        - listitem [ref=e97]:
          - link [ref=e98] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e99]: 
            - text: 
        - listitem [ref=e100]:
          - link [ref=e101] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/account/requestable-assets
            - generic [ref=e102]: 
    - main [ref=e103]:
      - generic [ref=e106]:
        - 'heading "Assets fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model" [level=1] [ref=e107]':
          - list [ref=e108]:
            - listitem [ref=e109]:
              - link [ref=e110] [cursor=pointer]:
                - /url: http://127.0.0.1:8098
                - generic [ref=e111]: 
              - generic [ref=e112]: 
            - listitem [ref=e113]:
              - link "Assets" [ref=e114] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/hardware
              - generic [ref=e115]: 
            - listitem [ref=e116]: "fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model"
        - button "Show/Hide More Information" [ref=e118] [cursor=pointer]: 
      - generic [ref=e121]:
        - generic [ref=e123]:
          - tablist [ref=e124]:
            - link "Details" [ref=e125] [cursor=pointer]:
              - /url: "#details"
              - text: 
              - generic [ref=e127]: 
              - generic [ref=e128]: Details
            - link "Licenses" [ref=e129] [cursor=pointer]:
              - /url: "#licenses"
              - text: 
              - generic [ref=e131]: 
              - generic [ref=e132]: Licenses
            - link "Components" [ref=e133] [cursor=pointer]:
              - /url: "#components"
              - text: 
              - generic [ref=e135]: 
              - generic [ref=e136]: Components
            - link "Assets" [ref=e137] [cursor=pointer]:
              - /url: "#assets"
              - text: 
              - generic [ref=e139]: 
              - generic [ref=e140]: Assets
            - link "Accessories" [ref=e141] [cursor=pointer]:
              - /url: "#accessories"
              - text: 
              - generic [ref=e143]: 
              - generic [ref=e144]: Accessories
            - link "Maintenances" [ref=e145] [cursor=pointer]:
              - /url: "#maintenances"
              - text: 
              - generic [ref=e147]: 
              - generic [ref=e148]: Maintenances
            - link "Audits" [ref=e149] [cursor=pointer]:
              - /url: "#audits"
              - text: 
              - generic [ref=e151]: 
              - generic [ref=e152]: Audits
            - link "Notes" [ref=e153] [cursor=pointer]:
              - /url: "#notes"
              - text: 
              - generic [ref=e155]: 
              - generic [ref=e156]: Notes
            - link "Files" [ref=e157] [cursor=pointer]:
              - /url: "#files"
              - text: 
              - generic [ref=e159]: 
              - generic [ref=e160]: Files
            - link "Additional Files" [ref=e161] [cursor=pointer]:
              - /url: "#model-files"
              - text: 
              - generic [ref=e163]: 
              - generic [ref=e164]: Additional Files
            - link "History 2" [expanded] [ref=e165]:
              - /url: "#history"
              - text: 
              - generic [ref=e167]: 
              - generic [ref=e168]: History
              - generic [ref=e169]: "2"
            - link [ref=e170] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e171]: 
          - generic [ref=e172]:
            - text:                         +         +           +       +                                  
            - generic [ref=e175]:
              - heading "History" [level=3] [ref=e176]
              - generic [ref=e177]:
                - generic [ref=e178]:
                  - generic [ref=e179]:
                    - button "Columns" [ref=e181] [cursor=pointer]:
                      - generic [ref=e182]: 
                    - button "Refresh" [ref=e184] [cursor=pointer]:
                      - generic [ref=e185]: 
                    - button "Export data" [ref=e187] [cursor=pointer]:
                      - generic [ref=e188]: 
                    - button "Print" [ref=e190] [cursor=pointer]:
                      - generic [ref=e191]: 
                    - button "Fullscreen" [ref=e192] [cursor=pointer]:
                      - generic [ref=e193]: 
                  - generic [ref=e195]:
                    - searchbox "Search" [ref=e196]
                    - button "" [ref=e198] [cursor=pointer]:
                      - generic [ref=e199]: 
                - generic [ref=e201]: Showing 1 to 2 of 2 rows
                - table [ref=e206]:
                  - rowgroup [ref=e207]:
                    - row "Icon Created At Created By Action Item Target File Name Download Quantity Notes Changed" [ref=e208]:
                      - columnheader "Icon" [ref=e209]:
                        - generic [ref=e210] [cursor=pointer]: Icon
                      - columnheader "Created At" [ref=e211]:
                        - generic [ref=e212] [cursor=pointer]: Created At
                      - columnheader "Created By" [ref=e213]:
                        - generic [ref=e214] [cursor=pointer]: Created By
                      - columnheader "Action" [ref=e215]:
                        - generic [ref=e216] [cursor=pointer]: Action
                      - columnheader "Item" [ref=e217]:
                        - generic [ref=e218] [cursor=pointer]: Item
                      - columnheader "Target" [ref=e219]:
                        - generic [ref=e220] [cursor=pointer]: Target
                      - columnheader "File Name" [ref=e221]:
                        - generic [ref=e222] [cursor=pointer]: File Name
                      - columnheader "Download" [ref=e223]:
                        - generic [ref=e224] [cursor=pointer]: Download
                      - columnheader "Quantity" [ref=e225]:
                        - generic [ref=e226] [cursor=pointer]: Quantity
                      - columnheader "Notes" [ref=e227]:
                        - generic [ref=e228] [cursor=pointer]: Notes
                      - columnheader "Changed" [ref=e229]:
                        - generic [ref=e230]: Changed
                  - rowgroup [ref=e231]:
                    - 'row "+ 2026-09-25 04:51 PM Bench Admin create new  fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model 1" [ref=e232]':
                      - cell "+" [ref=e233]:
                        - generic [ref=e234]: +
                      - cell "2026-09-25 04:51 PM" [ref=e235]
                      - cell "Bench Admin" [ref=e236]:
                        - link "Bench Admin" [ref=e238] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/users/1
                      - cell "create new" [ref=e239]
                      - 'cell " fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model" [ref=e240]':
                        - 'link " fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model" [ref=e242] [cursor=pointer]':
                          - /url: http://127.0.0.1:8098/hardware/9
                          - generic [ref=e243]: 
                          - text: "fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model"
                      - cell [ref=e244]
                      - cell [ref=e245]
                      - cell [ref=e246]
                      - cell "1" [ref=e247]
                      - cell [ref=e248]
                      - cell [ref=e249]
                    - 'row " 2026-09-25 04:51 PM Bench Admin checkout  fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model  Bench Assignee 1 fwsi14-cv2-c2 Current Location: [id: 1] Bench Office" [ref=e250]':
                      - cell "" [ref=e251]:
                        - generic [ref=e252]: 
                      - cell "2026-09-25 04:51 PM" [ref=e253]
                      - cell "Bench Admin" [ref=e254]:
                        - link "Bench Admin" [ref=e256] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/users/1
                      - cell "checkout" [ref=e257]
                      - 'cell " fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model" [ref=e258]':
                        - 'link " fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model" [ref=e260] [cursor=pointer]':
                          - /url: http://127.0.0.1:8098/hardware/9
                          - generic [ref=e261]: 
                          - text: "fwsi14-cv2-c2 Bench Asset #BA-00009 - Bench Laptop Model"
                      - cell " Bench Assignee" [ref=e262]:
                        - link " Bench Assignee" [ref=e264] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/users/2
                          - generic [ref=e265]: 
                          - text: Bench Assignee
                      - cell [ref=e266]
                      - cell [ref=e267]
                      - cell "1" [ref=e268]
                      - cell "fwsi14-cv2-c2" [ref=e269]
                      - 'cell "Current Location: [id: 1] Bench Office" [ref=e270]':
                        - generic [ref=e271]:
                          - text: "Current Location:"
                          - deletion [ref=e272]: "[id: 1] Bench Office"
                          - generic [ref=e273]: 
                  - rowgroup [ref=e274]:
                    - row [ref=e275]:
                      - columnheader [ref=e276]
                      - columnheader [ref=e278]
                      - columnheader [ref=e280]
                      - columnheader [ref=e282]
                      - columnheader [ref=e284]
                      - columnheader [ref=e286]
                      - columnheader [ref=e288]
                      - columnheader [ref=e290]
                      - columnheader [ref=e292]
                      - columnheader [ref=e294]
                      - columnheader [ref=e296]
                - generic [ref=e299]: Showing 1 to 2 of 2 rows
        - generic [ref=e302]:
          - generic [ref=e304]:
            - link [ref=e305] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/9/checkin
              - generic [ref=e306]: 
            - link [ref=e307] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/9/edit
              - generic [ref=e308]: 
            - link [ref=e309] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/9/clone
              - generic [ref=e310]: 
            - link [ref=e311] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e312]: 
            - link [ref=e314] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/9/audit
              - generic [ref=e315]: 
            - button [ref=e317] [cursor=pointer]:
              - generic [ref=e318]: 
            - button [ref=e319] [cursor=pointer]:
              - generic [ref=e320]: 
          - list [ref=e322]:
            - listitem [ref=e323]:
              - generic [ref=e324]: 
              - generic [ref=e325]:
                - text: 
                - generic [ref=e326]: Copy to Clipboard
              - link "Bench Laptop Model" [ref=e328] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/models/1
            - listitem [ref=e329]:
              - generic [ref=e330]: "#"
              - text: Model No.
              - generic [ref=e331]:
                - text: 
                - generic [ref=e332]: Copy to Clipboard
            - listitem [ref=e333]:
              - generic [ref=e334]: 
              - generic [ref=e335]:
                - text: 
                - generic [ref=e336]: Copy to Clipboard
              - link "Bench Laptops" [ref=e338] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/categories/2
            - listitem [ref=e339]:
              - generic [ref=e340]: 
              - link "Bench Manufacturer" [ref=e341] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/manufacturers/1
              - generic [ref=e343]: +
            - listitem [ref=e344]:
              - generic [ref=e345]: 
              - text: Purchased 2026-03-15 - 6 months 1 week ago
            - listitem [ref=e346]:
              - generic [ref=e347]: 
              - text: BYOD
            - listitem [ref=e348]:
              - generic [ref=e349]: 
              - text: Requestable
            - listitem [ref=e350]:
              - generic [ref=e351]:
                - generic [ref=e352]: 
                - text: Created By
                - link "Bench Admin" [ref=e353] [cursor=pointer]:
                  - /url: http://127.0.0.1:8098/users/1
            - listitem [ref=e354]:
              - generic [ref=e355]:
                - generic [ref=e356]: 
                - text: Created 2026-09-25 04:51 PM
            - listitem [ref=e357]:
              - generic [ref=e358]:
                - generic [ref=e359]: 
                - text: Updated 2026-09-25 04:51 PM
    - contentinfo [ref=e360]:
      - generic [ref=e361]:
        - generic [ref=e362]:
          - link "Snipe-IT" [ref=e363] [cursor=pointer]:
            - /url: https://snipeitapp.com
          - text: is open source software, made with
          - generic [ref=e364]: 
          - generic [ref=e365]: love
          - text: by Grokability, Inc.
          - link "" [ref=e366] [cursor=pointer]:
            - /url: https://bsky.app/profile/snipeitapp.com
            - generic [ref=e367]: 
          - link "" [ref=e368] [cursor=pointer]:
            - /url: https://github.com/grokability/snipe-it/
            - generic [ref=e369]: 
          - link "" [ref=e370] [cursor=pointer]:
            - /url: https://hachyderm.io/@grokability
            - generic [ref=e371]: 
          - link "" [ref=e372] [cursor=pointer]:
            - /url: https://discord.gg/yZFtShAcKk
            - generic [ref=e373]: 
        - generic [ref=e374]:
          - text: Version v8.7.2 - build 24589 (master)
          - link "User's Manual" [ref=e375] [cursor=pointer]:
            - /url: https://snipe-it.readme.io/docs/overview
          - link "Report a bug" [ref=e376] [cursor=pointer]:
            - /url: https://snipeitapp.com/support/
```

# Test source

```ts
  12804 |   // Record the page's traffic from the first settle on, as the daemon records
  12805 |   // it from the moment its session adopts a page: an action begun on it later
  12806 |   // (beginAction, the shared src/execution/action.ts) has a baseline to read.
  12807 |   pageTraffic(page);
  12808 |   await settleDom(page);
  12809 | }
  12810 | 
  12811 | const ACTION_DEADLINE_MS = 25000;
  12812 | 
  12813 | /**
  12814 |  * A state-changing action that threw, rethrown with what its error proves
  12815 |  * about it (the shared outcomeOfError): `[outcome: not dispatched]` when
  12816 |  * nothing went out, `[outcome: unknown]` otherwise — the words replay puts
  12817 |  * after its own `click failed: …`.
  12818 |  */
  12819 | function actionFailed(err: unknown): never {
  12820 |   if (err instanceof Error && !err.message.includes('[outcome: ')) err.message += ` ${outcomeLabel(outcomeOfError(err))}`;
  12821 |   throw err;
  12822 | }
  12823 | 
  12824 | const URL_WAIT_MS = 5000;
  12825 | 
  12826 | /**
  12827 |  * tools.ts's `goto`: the load event, within 30s — and it has to be said out
  12828 |  * loud, because under `@playwright/test` `navigationTimeout` defaults to 0.
  12829 |  * The familiar 30s default belongs to playwright-core, NOT to the test
  12830 |  * runner, so a bare `page.goto(url)` in a spec file is unbounded IN FACT:
  12831 |  * an app that never finishes loading hangs the test until the runner (or,
  12832 |  * under a harness, a kill signal) stops it, with nothing logged about where
  12833 |  * it was. Every goto this file emits passes this, so the artifact fails the
  12834 |  * same way, at the same moment, as the daemon replaying the same step.
  12835 |  */
  12836 | const GOTO_TIMEOUT_MS = 30_000;
  12837 | 
  12838 | /**
  12839 |  * A soft finding, in the one grep-able shape replay reports its own warnings in.
  12840 |  *
  12841 |  * stdout, not stderr, like every `[sitelooper …]` line this file logs: the
  12842 |  * list reporter forwards a worker's stdout live and batches its stderr to the
  12843 |  * END of the run, so a run that is killed (a harness watchdog, a CI timeout)
  12844 |  * loses everything written to stderr. On stdout these interleave with the
  12845 |  * `[sitelooper step]` lines and survive the kill, which is the only record of
  12846 |  * where the run had got to.
  12847 |  */
  12848 | function logWarning(line: string): void {
  12849 |   console.log(`[sitelooper warn] ${line}`);
  12850 | }
  12851 | 
  12852 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  12853 | let lastReadHit: Locator | null = null;
  12854 | 
  12855 | /**
  12856 |  * A published read whose value is only what this segment itself typed,
  12857 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  12858 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  12859 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  12860 |  * the value is still published, as replay still carries it to later steps.
  12861 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  12862 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  12863 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  12864 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  12865 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  12866 |  */
  12867 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  12868 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  12869 |   if (!echo) return;
  12870 |   run.echoed.push(key);
  12871 |   logWarning(echo);
  12872 | }
  12873 | 
  12874 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  12875 | function errorPageGate(page: Page, where: string): void {
  12876 |   const stop = errorPageVerdict(page.url(), where);
  12877 |   if (stop) throw new Error(stop);
  12878 | }
  12879 | 
  12880 | /**
  12881 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  12882 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  12883 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  12884 |  * literal segments is treated as volatile (warned, continued), anything else
  12885 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  12886 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  12887 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  12888 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  12889 |  * step's click reported of the link it clicked (the shared beginAction): a
  12890 |  * click that went where its link points, recorded as staying on the page it
  12891 |  * left, is the shared linkLandingWarning and waits for nothing.
  12892 |  */
  12893 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  12894 |   if (!urlMatches(pattern, page.url(), p)) {
  12895 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  12896 |     if (landed) return logWarning(landed);
  12897 |   }
  12898 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  12899 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  12900 |   for (const line of verdict.warnings) logWarning(line);
  12901 |   // What this step watched vary is the segment's evidence from here on
  12902 |   // (navigationTarget), whether or not the step goes on to stop.
  12903 |   if (verdict.diffs) volatile.push(...verdict.diffs);
> 12904 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: after 03-open s_911eab/1 expected url http://127.0.0.1:8098/hardware/9/edit but browser is at http://127.0.0.1:8098/hardware/9#history
  12905 | }
  12906 | 
  12907 | /**
  12908 |  * Where a goto actually sends the browser — the shared retargetNavigation
  12909 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  12910 |  * the live url sits at a position THIS segment has already watched vary is a
  12911 |  * literal from the recording's run, and the live value is navigated to
  12912 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  12913 |  * one per replayed skill. The returned `stale` is handed to this step's
  12914 |  * alert gate, so an unrecorded alert on the landing names the cause.
  12915 |  */
  12916 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  12917 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  12918 |   if (verdict.warning) logWarning(verdict.warning);
  12919 |   return verdict;
  12920 | }
  12921 | 
  12922 | /**
  12923 |  * The alert observation a step is judged by, taken where the daemon takes
  12924 |  * its diff: after the action, once the DOM has settled (tools.ts
  12925 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  12926 |  * inside verify's url window is seen by both runners or by neither.
  12927 |  * Rendered in the step's line dialect, with whether every live region was
  12928 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  12929 |  */
  12930 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  12931 |   await settle(page);
  12932 |   return liveAlertsObserved(page, dialect);
  12933 | }
  12934 | 
  12935 | /**
  12936 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  12937 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  12938 |  * and stops a state-changing step only when its recorded page changes did
  12939 |  * not confirm it worked (a rejection toast that leaves the page superficially
  12940 |  * intact); a recorded-but-missing one only warns.
  12941 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  12942 |  * `after` in settle, right after the action has settled and BEFORE the url
  12943 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  12944 |  * during a 5s url wait must not be missed) — and a page that could not be
  12945 |  * read is handed over as unobserved, never as "no alert".
  12946 |  */
  12947 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  12948 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  12949 |   for (const line of verdict.warnings) logWarning(line);
  12950 |   if (verdict.stop) throw new Error(verdict.stop);
  12951 | }
  12952 | 
  12953 | /**
  12954 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  12955 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  12956 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  12957 |  * page structure agrees, anything else refuses before the first step acts.
  12958 |  * `similarity` is what replay's adapter passes: where the recording kept a
  12959 |  * page fingerprint, the call site measures the live page with the shared
  12960 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  12961 |  * could not be read, exactly as replay; null where the recording kept none
  12962 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  12963 |  * compiled before the vector travelled, which refuses a soft match it cannot
  12964 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  12965 |  * (arguments evaluate left to right), as replay reads startUrl before it
  12966 |  * fingerprints: both describe the page as the segment found it, not where a
  12967 |  * navigation in flight landed during the measurement. Async so the call site
  12968 |  * must await it: a gate that could be left un-awaited is one that can
  12969 |  * silently become a no-op.
  12970 |  */
  12971 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  12972 |   const verdict = preconditionVerdict(pattern, url, p, similarity, mints);
  12973 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  12974 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  12975 | }
  12976 | 
  12977 | /**
  12978 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  12979 |  * source of truth, so the vector is carried once. A segment the emitter
  12980 |  * asked this of always has one; its absence means FLOW was edited by hand,
  12981 |  * and the gate fails closed rather than soft-match on the url alone.
  12982 |  */
  12983 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  12984 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  12985 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  12986 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  12987 |   return recorded;
  12988 | }
  12989 | 
  12990 | /**
  12991 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  12992 |  *
  12993 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  12994 |  * action and, when the action changed it, awaits settleDom before binding
  12995 |  * the step's derived values — the value a spec needs is the one on the url
  12996 |  * the step navigated TO, and `page.url()` read in the same tick as the
  12997 |  * click still says where the page came FROM. Bound empty, every pattern
  12998 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  12999 |  *
  13000 |  * ALL of them together, not one at a time, because they are read into ONE
  13001 |  * pattern: an app is free to populate its state fragment key by key (odoo
  13002 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  13003 |  * that binds the instant IT is non-empty can be bound off a half-built url
  13004 |  * while its neighbour is still missing. The step is not where it was
```