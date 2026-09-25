# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgt15-cv.spec.ts >> fwgt15-cv
- Location: fwgt15-cv.spec.ts:9:1

# Error details

```
Error: none of 1 recorded locators resolved at 04-add s_e18531/3 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/4): locator('[data-sitelooper-point="988,595"]')
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - navigation "Navigation Bar" [ref=e3]:
      - generic [ref=e4]:
        - link "Dashboard" [ref=e5] [cursor=pointer]:
          - /url: /
          - img [ref=e6]
        - link "Issues" [ref=e7] [cursor=pointer]:
          - /url: /issues
        - link "Pull Requests" [ref=e8] [cursor=pointer]:
          - /url: /pulls
        - link "Milestones" [ref=e9] [cursor=pointer]:
          - /url: /milestones
        - link "Explore" [ref=e10] [cursor=pointer]:
          - /url: /explore/repos
      - generic [ref=e11]:
        - link "Notifications" [ref=e12] [cursor=pointer]:
          - /url: /notifications
          - img [ref=e14]
        - menu "Create…" [ref=e16] [cursor=pointer]:
          - generic [ref=e17]:
            - img [ref=e18]
            - img [ref=e21]
        - menu "Profile and Settings…" [ref=e23] [cursor=pointer]:
          - generic [ref=e24]:
            - generic [ref=e25]:
              - img "admin" [ref=e26]
              - img [ref=e27]
            - img [ref=e30]
    - main "#4 - fwgt15-cv-c1 Bench Issue" [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e35]:
          - generic [ref=e36]:
            - img [ref=e37]
            - generic [ref=e39]:
              - link "bench" [ref=e40] [cursor=pointer]:
                - /url: /bench
              - text: /
              - link "bench-repo" [ref=e41] [cursor=pointer]:
                - /url: /bench/bench-repo
          - generic [ref=e42]:
            - link "RSS Feed" [ref=e43] [cursor=pointer]:
              - /url: /bench/bench-repo.rss
              - img [ref=e44]
            - generic [ref=e46] [cursor=pointer]:
              - button "Unwatch" [ref=e47]:
                - img [ref=e48]
                - generic [ref=e50]: Unwatch
              - link "1" [ref=e51]:
                - /url: /bench/bench-repo/watchers
            - generic [ref=e52] [cursor=pointer]:
              - button "Star" [ref=e53]:
                - img [ref=e54]
                - generic [ref=e56]: Star
              - link "0" [ref=e57]:
                - /url: /bench/bench-repo/stars
            - generic [ref=e58] [cursor=pointer]:
              - button "Fork" [ref=e59]:
                - img [ref=e60]
                - generic [ref=e62]: Fork
              - link "0" [ref=e63]:
                - /url: /bench/bench-repo/forks
        - navigation [ref=e65]:
          - generic [ref=e66]:
            - link "Code" [ref=e67] [cursor=pointer]:
              - /url: /bench/bench-repo/src/
              - img [ref=e68]
              - generic [ref=e70]: Code
            - link "Issues 4" [ref=e71] [cursor=pointer]:
              - /url: /bench/bench-repo/issues
              - img [ref=e72]
              - generic [ref=e75]: Issues
              - generic [ref=e76]: "4"
            - link "Pull Requests" [ref=e77] [cursor=pointer]:
              - /url: /bench/bench-repo/pulls
              - img [ref=e78]
              - generic [ref=e80]: Pull Requests
            - link "Actions" [ref=e81] [cursor=pointer]:
              - /url: /bench/bench-repo/actions
              - img [ref=e82]
              - generic [ref=e84]: Actions
            - link "Packages" [ref=e85] [cursor=pointer]:
              - /url: /bench/bench-repo/packages
              - img [ref=e86]
              - generic [ref=e88]: Packages
            - link "Projects" [ref=e89] [cursor=pointer]:
              - /url: /bench/bench-repo/projects
              - img [ref=e90]
              - generic [ref=e92]: Projects
            - link "Releases" [ref=e93] [cursor=pointer]:
              - /url: /bench/bench-repo/releases
              - img [ref=e94]
              - generic [ref=e96]: Releases
            - link "Wiki" [ref=e97] [cursor=pointer]:
              - /url: /bench/bench-repo/wiki
              - img [ref=e98]
              - generic [ref=e100]: Wiki
            - link "Activity" [ref=e101] [cursor=pointer]:
              - /url: /bench/bench-repo/activity
              - img [ref=e102]
              - generic [ref=e104]: Activity
            - link "Settings" [ref=e106] [cursor=pointer]:
              - /url: /bench/bench-repo/settings
              - img [ref=e107]
              - generic [ref=e109]: Settings
      - generic [ref=e111]:
        - generic [ref=e112]:
          - generic [ref=e113]:
            - 'heading "fwgt15-cv-c1 Bench Issue #4" [level=1] [ref=e114]'
            - generic [ref=e115]:
              - button "Edit" [ref=e116] [cursor=pointer]
              - button "New Issue" [ref=e117] [cursor=pointer]
          - generic [ref=e118]:
            - generic [ref=e119]:
              - img [ref=e120]
              - text: Open
            - generic [ref=e124]:
              - text: opened 2026-09-25 15:28:10 +00:00now by
              - link "admin" [ref=e125] [cursor=pointer]:
                - /url: /admin
              - text: · 0 comments
        - generic [ref=e126]:
          - generic [ref=e128]:
            - generic [ref=e129]:
              - link "admin" [ref=e130] [cursor=pointer]:
                - /url: /admin
                - img "admin" [ref=e131]
              - generic [ref=e132]:
                - heading "admin commented Sep 25, 2026, 3:28 PM This user is the owner of this repository." [level=3] [ref=e133]:
                  - generic [ref=e135]:
                    - link "admin" [ref=e136] [cursor=pointer]:
                      - /url: /admin
                    - text: commented
                    - link "Sep 25, 2026, 3:28 PM" [ref=e137] [cursor=pointer]:
                      - /url: "#issue-4"
                      - text: 2026-09-25 15:28:10 +00:00now
                  - generic [ref=e138]:
                    - generic "This user is the owner of this repository." [ref=e139]: Owner
                    - menu "Reactions" [ref=e140] [cursor=pointer]:
                      - img [ref=e142]
                    - menu [ref=e144] [cursor=pointer]:
                      - img [ref=e146]
                - article [ref=e148]:
                  - generic [ref=e149]:
                    - paragraph [ref=e150]: This issue was created for the fwgt15-cv-c1 benchmark check.
                    - paragraph [ref=e151]: It mentions fwgt15-cv-c1 in the body text.
            - generic [ref=e152]:
              - link "admin" [ref=e153] [cursor=pointer]:
                - /url: /admin
                - img "admin" [ref=e154]
              - generic [ref=e157]:
                - generic [ref=e159]:
                  - generic [ref=e160]:
                    - generic [ref=e162] [cursor=pointer]: Write
                    - generic [ref=e164] [cursor=pointer]: Preview
                  - generic [ref=e165]:
                    - toolbar [ref=e166]:
                      - generic [ref=e167]:
                        - button "Add heading" [ref=e168] [cursor=pointer]:
                          - img [ref=e169]
                          - text: "1"
                        - button "Add heading" [ref=e171] [cursor=pointer]:
                          - img [ref=e172]
                          - text: "2"
                        - button "Add heading" [ref=e174] [cursor=pointer]:
                          - img [ref=e175]
                          - text: "3"
                      - generic [ref=e177]:
                        - button "Add bold text" [ref=e178] [cursor=pointer]:
                          - img [ref=e179]
                        - button "Add italic text" [ref=e181] [cursor=pointer]:
                          - img [ref=e182]
                        - button "Add strikethrough text" [ref=e184] [cursor=pointer]:
                          - img [ref=e185]
                      - generic [ref=e187]:
                        - button "Quote text" [ref=e188] [cursor=pointer]:
                          - img [ref=e189]
                        - button "Add code" [ref=e191] [cursor=pointer]:
                          - img [ref=e192]
                        - button "Add a link" [ref=e194] [cursor=pointer]:
                          - img [ref=e195]
                      - generic [ref=e197]:
                        - button "Add a bullet list" [ref=e198] [cursor=pointer]:
                          - img [ref=e199]
                        - button "Add a numbered list" [ref=e201] [cursor=pointer]:
                          - img [ref=e202]
                        - button "Add a list of tasks" [ref=e204] [cursor=pointer]:
                          - img [ref=e205]
                        - button "Add a table" [ref=e207] [cursor=pointer]:
                          - img [ref=e208]
                      - generic [ref=e210]:
                        - button "Mention a user or team" [ref=e211] [cursor=pointer]:
                          - img [ref=e212]
                        - button "Reference an issue or pull request" [ref=e214] [cursor=pointer]:
                          - img [ref=e215]
                      - generic [ref=e217]:
                        - button [ref=e218] [cursor=pointer]:
                          - img [ref=e219]
                        - button "Use the legacy editor instead" [ref=e221] [cursor=pointer]:
                          - img [ref=e222]
                    - textbox "Leave a comment" [ref=e225]
                - button "Drop files or click here to upload." [ref=e229] [cursor=pointer]
                - generic [ref=e231]:
                  - button "Close Issue" [ref=e232] [cursor=pointer]:
                    - img [ref=e234]
                    - generic [ref=e237]: Close Issue
                  - button "Comment" [disabled]
          - generic [ref=e238]:
            - combobox [ref=e239] [cursor=pointer]:
              - generic [ref=e240]:
                - generic [ref=e241]: No Branch/Tag Specified
                - img [ref=e242]
            - generic [ref=e245]:
              - combobox [expanded] [ref=e246] [cursor=pointer]:
                - generic [ref=e247]:
                  - strong [ref=e248]: Labels
                  - img [ref=e249]
                - listbox [ref=e251]:
                  - generic [ref=e252]:
                    - generic:
                      - img
                    - textbox "Filter Label" [active] [ref=e253]
                  - generic [ref=e254]:
                    - link "Clear labels" [ref=e255]:
                      - /url: "#"
                    - link "bug" [ref=e257]:
                      - /url: /bench/bench-repo/issues?labels=1
                      - generic [ref=e259]: bug
                    - link "documentation" [ref=e260]:
                      - /url: /bench/bench-repo/issues?labels=4
                      - generic [ref=e262]: documentation
                    - link "enhancement" [ref=e263]:
                      - /url: /bench/bench-repo/issues?labels=3
                      - generic [ref=e265]: enhancement
                    - link "priority-high" [ref=e266]:
                      - /url: /bench/bench-repo/issues?labels=2
                      - generic [ref=e268]: priority-high
              - generic [ref=e270]: No labels
            - generic [ref=e272]:
              - combobox [ref=e273] [cursor=pointer]:
                - generic [ref=e274]:
                  - strong [ref=e275]: Milestone
                  - img [ref=e276]
              - generic [ref=e279]: No Milestone
            - generic [ref=e281]:
              - menu [ref=e282] [cursor=pointer]:
                - generic [ref=e283]:
                  - strong [ref=e284]: Projects
                  - img [ref=e285]
              - generic [ref=e288]: No projects
            - generic [ref=e290]:
              - combobox [ref=e291] [cursor=pointer]:
                - generic [ref=e292]:
                  - strong [ref=e293]: Assignees
                  - img [ref=e294]
              - generic [ref=e297]: No Assignees
            - strong [ref=e300]: 1 Participants
            - link "admin" [ref=e302] [cursor=pointer]:
              - /url: /admin
              - img "admin" [ref=e303]
            - generic [ref=e305]:
              - strong [ref=e307]: Notifications
              - button "Unsubscribe" [ref=e309] [cursor=pointer]:
                - img [ref=e310]
                - text: Unsubscribe
            - generic [ref=e313]:
              - generic [ref=e314]:
                - strong [ref=e315]: Time Tracker
                - button "Set estimated time" [ref=e316] [cursor=pointer]:
                  - img [ref=e317]
              - generic [ref=e319]:
                - button "Start timer" [ref=e320] [cursor=pointer]:
                  - img [ref=e321]
                  - text: Start timer
                - button "Add Time" [ref=e323] [cursor=pointer]:
                  - img [ref=e324]
            - strong [ref=e328]: Due Date
            - generic [ref=e329]:
              - text: No due date set.
              - generic [ref=e330]:
                - textbox [ref=e331]:
                  - /placeholder: yyyy-mm-dd
                - button [ref=e332] [cursor=pointer]:
                  - img [ref=e333]
            - generic [ref=e336]:
              - strong [ref=e338]: Dependencies
              - paragraph [ref=e339]: No dependencies set.
              - generic [ref=e342]:
                - generic [ref=e343] [cursor=pointer]:
                  - img [ref=e344]
                  - combobox [ref=e346]
                  - generic [ref=e347]: Add dependency…
                - button [ref=e348] [cursor=pointer]:
                  - img [ref=e349]
            - generic "bench/bench-repo#4" [ref=e352]:
              - generic [ref=e353]: "Reference: bench/bench-repo#4"
              - button [ref=e354] [cursor=pointer]:
                - img [ref=e355]
            - button "Pin" [ref=e360] [cursor=pointer]:
              - img [ref=e361]
              - text: Pin
            - button "Lock conversation" [ref=e363] [cursor=pointer]:
              - img [ref=e364]
              - text: Lock conversation
            - button "Delete" [ref=e366] [cursor=pointer]:
              - img [ref=e367]
              - text: Delete
  - group "Footer" [ref=e369]:
    - contentinfo "About Software" [ref=e370]:
      - link "Powered by Gitea" [ref=e371] [cursor=pointer]:
        - /url: https://about.gitea.com
      - generic [ref=e372]:
        - text: "Version:"
        - link "1.27.3" [ref=e373] [cursor=pointer]:
          - /url: /-/admin/config
      - generic [ref=e374]:
        - text: "Page:"
        - strong [ref=e375]: 16ms
        - text: "Template:"
        - strong [ref=e376]: 5ms
    - group "Links" [ref=e377]:
      - menu [ref=e378] [cursor=pointer]:
        - generic [ref=e380]:
          - img [ref=e381]
          - text: Auto
      - menu [ref=e383] [cursor=pointer]:
        - generic [ref=e384]:
          - img [ref=e385]
          - text: English
      - link "Licenses" [ref=e387] [cursor=pointer]:
        - /url: /assets/licenses.txt
      - link "API" [ref=e388] [cursor=pointer]:
        - /url: /api/swagger
```

# Test source

```ts
  12950 |  * No visibility wait ahead of recognition, as in the daemon: a recognised
  12951 |  * widget's recipe clicks its root (an input sink inside it may be 0x0), and
  12952 |  * the native half waits for the field itself (reactSafeFill's own 10s).
  12953 |  */
  12954 | async function fill(loc: Locator, value: string): Promise<void> {
  12955 |   const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);
  12956 |   if (attempt) logRecipe(attempt);
  12957 | }
  12958 | 
  12959 | /**
  12960 |  * A recorded `type`, as tools.ts's `case 'type'`: the same set-value recipe
  12961 |  * ladder a fill climbs (an editor or an aria-combobox driven by typing in
  12962 |  * the recording is driven by its recipe here too), else pressSequentially
  12963 |  * on the same target with the daemon's timeout and per-key delay.
  12964 |  */
  12965 | const TYPE_TIMEOUT_MS = 10000;
  12966 | const TYPE_DELAY_MS = 20;
  12967 | async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {
  12968 |   const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });
  12969 |   if (attempt) logRecipe(attempt);
  12970 | }
  12971 | 
  12972 | /**
  12973 |  * One recorded chain resolved against the page — the artifact's adapter to
  12974 |  * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),
  12975 |  * which is replay's `resolveChain` policy itself: the class order, the
  12976 |  * point mark, the identity guard, plausibility, the origin guard, ambiguity
  12977 |  * and its loop-cursor narrowing, the structural hold and the whole-chain
  12978 |  * wait are decided THERE, in both runners. Nothing here reinterprets one.
  12979 |  *
  12980 |  * What this adds is presentation, exactly what replay adds around its own
  12981 |  * call:
  12982 |  *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in
  12983 |  *    at each call site) turns a silent fallthrough into telemetry. A win by
  12984 |  *    any candidate but the primary (stored index 0) IS drift — the recorded
  12985 |  *    locator missed and a later one covered for it — so it is one stable,
  12986 |  *    grep-able `[sitelooper drift]` line naming every candidate rejected
  12987 |  *    ahead of the winner and WHY, in the policy's own words (MissReason).
  12988 |  *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what
  12989 |  *    this target resolved TO, as `<key>=<winning locator>`, with the cursor
  12990 |  *    appended only when ambiguity was narrowed to it. The progress guard
  12991 |  *    compares one pass's entries with the last.
  12992 |  *
  12993 |  * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's
  12994 |  * evidence-based reordering of a candidate later runs showed volatile):
  12995 |  * that evidence lives in the skill store, and an artifact has none, so a
  12996 |  * compiled chain is ordered by class and recorded order alone. Everything
  12997 |  * else the policy decides is decided here from the same observations.
  12998 |  */
  12999 | async function resolveTarget(
  13000 |   page: Page,
  13001 |   candidates: CandidateObservation[],
  13002 |   where: string,
  13003 |   policy: ResolvePolicy,
  13004 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13005 | ): Promise<Resolution | null> {
  13006 |   const hit = await resolveCandidates(page, candidates, policy);
  13007 |   if (!hit) return null;
  13008 |   const primary = candidates.find((c) => c.index === 0) ?? candidates[0];
  13009 |   // Drift is a better candidate that FAILED (the shared isDrift), never a stored
  13010 |   // index alone: a positional primary the policy ranked behind a name was not missed.
  13011 |   if (isDrift(hit)) {
  13012 |     const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');
  13013 |     const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : 'used';
  13014 |     const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;
  13015 |     console.log(line);
  13016 |     (opts.drift ?? DRIFT).push(line);
  13017 |   }
  13018 |   if (opts.resolved) {
  13019 |     const won = candidates.find((c) => c.index === hit.index) ?? primary;
  13020 |     opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);
  13021 |     // the loop progress guard, asked before anything acts on what just resolved
  13022 |     opts.resolved.check?.();
  13023 |   }
  13024 |   return hit;
  13025 | }
  13026 | 
  13027 | /**
  13028 |  * resolveTarget for an ACTION: a chain that resolves nothing is a stop.
  13029 |  *
  13030 |  * `note` is passed only at a FLAGGED step (compile found the step itself
  13031 |  * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the
  13032 |  * throw, it is what stops "none of 3 recorded locators resolved" from
  13033 |  * reading as app drift when the recording is what needs redoing.
  13034 |  */
  13035 | async function pick(
  13036 |   page: Page,
  13037 |   candidates: CandidateObservation[],
  13038 |   where: string,
  13039 |   policy: ResolvePolicy,
  13040 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13041 |   note?: string,
  13042 | ): Promise<Resolution> {
  13043 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  13044 |   if (hit) return hit;
  13045 |   throw pickMiss(page, candidates, where, note);
  13046 | }
  13047 | 
  13048 | /** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */
  13049 | function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {
> 13050 |   return new Error(
        |          ^ Error: none of 1 recorded locators resolved at 04-add s_e18531/3 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/4): locator('[data-sitelooper-point="988,595"]')
  13051 |     // The url and the recorded step are half the answer whenever a chain
  13052 |     // misses wholesale: a locator that named the control on the day it was
  13053 |     // recorded usually misses because the page is not the page the step
  13054 |     // expected, and the log otherwise says only that nothing resolved.
  13055 |     `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +
  13056 |       candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +
  13057 |       (note ? `\n  ${note}` : ''),
  13058 |   );
  13059 | }
  13060 | 
  13061 | /**
  13062 |  * `pick` for a navigation click with a recorded destination — replay's
  13063 |  * navigation fallback (runOneStep), through the shared
  13064 |  * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,
  13065 |  * embedded). When the chain resolves nothing and the browser is not already
  13066 |  * where the click was recorded to land, another visible link to that
  13067 |  * destination is clicked, else a fully concrete destination is navigated to
  13068 |  * directly. Arrival returns null — the step is done, logged as drift, and
  13069 |  * its gates are not asked, as replay returns before them. Otherwise the
  13070 |  * same stop `pick` throws. Never emitted in a loop body (replay's rule).
  13071 |  */
  13072 | async function pickOrNavigate(
  13073 |   page: Page,
  13074 |   candidates: CandidateObservation[],
  13075 |   where: string,
  13076 |   policy: ResolvePolicy,
  13077 |   destPattern: string,
  13078 |   p: Record<string, string>,
  13079 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13080 |   note?: string,
  13081 | ): Promise<Resolution | null> {
  13082 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  13083 |   if (hit) return hit;
  13084 |   if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {
  13085 |     const arrived = await navigateToDestination(page, destPattern, p, {
  13086 |       click: async (loc) => {
  13087 |         await click(loc);
  13088 |       },
  13089 |       goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),
  13090 |     });
  13091 |     // The substitute link's click may have landed: a stop, never the direct navigation after it.
  13092 |     if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);
  13093 |     if (arrived) {
  13094 |       const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;
  13095 |       console.log(line);
  13096 |       (opts.drift ?? DRIFT).push(line);
  13097 |       return null;
  13098 |     }
  13099 |   }
  13100 |   throw pickMiss(page, candidates, where, note);
  13101 | }
  13102 | 
  13103 | /**
  13104 |  * A text wait that failed on the target it resolved — replay's
  13105 |  * textHeldElsewhere rung (the shared src/execution/recover.ts, embedded):
  13106 |  * when another recorded candidate for the same target already shows the
  13107 |  * text, the condition held, and the step goes on to its own gates with a
  13108 |  * drift line naming the candidate. Otherwise the wait's own error stands.
  13109 |  */
  13110 | async function textHeldOrThrow(err: unknown, candidates: CandidateObservation[], state: string, text: string, where: string, drift: string[]): Promise<void> {
  13111 |   const held = await textHeldElsewhere(candidates, state, text);
  13112 |   if (!held) throw err;
  13113 |   const message = (err instanceof Error ? err.message : String(err)).split('\n')[0];
  13114 |   const line = `[sitelooper drift] ${where}: ${message}; the text was already showing in fallback #${held.index + 1} ${String(held.locator)}`;
  13115 |   console.log(line);
  13116 |   drift.push(line);
  13117 | }
  13118 | 
  13119 | /**
  13120 |  * Every `[sitelooper skip]` line this run logged, by the `where` that
  13121 |  * logged it (`<step id> <skill step>/<n> <role>`).
  13122 |  *
  13123 |  * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,
  13124 |  * to look above for the producing step's `[sitelooper skip] … read target
  13125 |  * not found` line. When the reference names something that is not a step of
  13126 |  * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,
  13127 |  * a ledger instruction id no step publishes) no such line was ever emitted —
  13128 |  * the only occurrence of that string in the entire log was inside the error
  13129 |  * itself, and it sent the diagnosis after a read that was working all along.
  13130 |  * So the claim is now made only when the log bears it out.
  13131 |  */
  13132 | const skippedReads: string[] = [];
  13133 | 
  13134 | /**
  13135 |  * A recorded READ, which never fails the flow.
  13136 |  *
  13137 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an
  13138 |  * OBSERVATION, not a state change: a read whose target cannot be resolved —
  13139 |  * or whose read itself errors — is skipped with a warning and the replay
  13140 |  * CONTINUES ("skipped read — no element matched any known locator"). Failing
  13141 |  * to re-capture a value says nothing about whether the procedure ran; the
  13142 |  * step after it is exactly as valid as it was. A spec that threw here turned
  13143 |  * a missing observation into a failed test: grafana's `panel_content` read is
  13144 |  * a freshly applied text panel whose body the verifier goes on to confirm,
  13145 |  * and none of the three recorded ways of naming it resolved inside the
  13146 |  * resolve window — one lost value, and the run reported as a broken procedure.
  13147 |  *
  13148 |  * So: the resolution and the read together, and on any failure one grep-able
  13149 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  13150 |  * are left exactly as they were — the emptiness is the honest report.
```