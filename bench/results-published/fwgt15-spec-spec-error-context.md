# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgt15.spec.ts >> fwgt15
- Location: fwgt15.spec.ts:9:1

# Error details

```
Error: none of 1 recorded locators resolved at 04-add s_e18531/3 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/7): locator('[data-sitelooper-point="988,595"]')
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
    - main "#7 - fwgt15-spec Bench Issue" [ref=e32]:
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
            - 'heading "fwgt15-spec Bench Issue #7" [level=1] [ref=e114]'
            - generic [ref=e115]:
              - button "Edit" [ref=e116] [cursor=pointer]
              - button "New Issue" [ref=e117] [cursor=pointer]
          - generic [ref=e118]:
            - generic [ref=e119]:
              - img [ref=e120]
              - text: Open
            - generic [ref=e124]:
              - text: opened 2026-09-25 08:48:22 +00:00now by
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
                - heading "admin commented Sep 25, 2026, 8:48 AM This user is the owner of this repository." [level=3] [ref=e133]:
                  - generic [ref=e135]:
                    - link "admin" [ref=e136] [cursor=pointer]:
                      - /url: /admin
                    - text: commented
                    - link "Sep 25, 2026, 8:48 AM" [ref=e137] [cursor=pointer]:
                      - /url: "#issue-7"
                      - text: 2026-09-25 08:48:22 +00:00now
                  - generic [ref=e138]:
                    - generic "This user is the owner of this repository." [ref=e139]: Owner
                    - menu "Reactions" [ref=e140] [cursor=pointer]:
                      - img [ref=e142]
                    - menu [ref=e144] [cursor=pointer]:
                      - img [ref=e146]
                - article [ref=e148]:
                  - generic [ref=e149]:
                    - paragraph [ref=e150]: This issue was created for the fwgt15-spec benchmark check.
                    - paragraph [ref=e151]: It mentions fwgt15-spec in the body text.
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
            - generic "bench/bench-repo#7" [ref=e352]:
              - generic [ref=e353]: "Reference: bench/bench-repo#7"
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
        - strong [ref=e375]: 14ms
        - text: "Template:"
        - strong [ref=e376]: 4ms
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
  12919 |  * No visibility wait ahead of recognition, as in the daemon: a recognised
  12920 |  * widget's recipe clicks its root (an input sink inside it may be 0x0), and
  12921 |  * the native half waits for the field itself (reactSafeFill's own 10s).
  12922 |  */
  12923 | async function fill(loc: Locator, value: string): Promise<void> {
  12924 |   const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);
  12925 |   if (attempt) logRecipe(attempt);
  12926 | }
  12927 | 
  12928 | /**
  12929 |  * A recorded `type`, as tools.ts's `case 'type'`: the same set-value recipe
  12930 |  * ladder a fill climbs (an editor or an aria-combobox driven by typing in
  12931 |  * the recording is driven by its recipe here too), else pressSequentially
  12932 |  * on the same target with the daemon's timeout and per-key delay.
  12933 |  */
  12934 | const TYPE_TIMEOUT_MS = 10000;
  12935 | const TYPE_DELAY_MS = 20;
  12936 | async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {
  12937 |   const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });
  12938 |   if (attempt) logRecipe(attempt);
  12939 | }
  12940 | 
  12941 | /**
  12942 |  * One recorded chain resolved against the page — the artifact's adapter to
  12943 |  * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),
  12944 |  * which is replay's `resolveChain` policy itself: the class order, the
  12945 |  * point mark, the identity guard, plausibility, the origin guard, ambiguity
  12946 |  * and its loop-cursor narrowing, the structural hold and the whole-chain
  12947 |  * wait are decided THERE, in both runners. Nothing here reinterprets one.
  12948 |  *
  12949 |  * What this adds is presentation, exactly what replay adds around its own
  12950 |  * call:
  12951 |  *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in
  12952 |  *    at each call site) turns a silent fallthrough into telemetry. A win by
  12953 |  *    any candidate but the primary (stored index 0) IS drift — the recorded
  12954 |  *    locator missed and a later one covered for it — so it is one stable,
  12955 |  *    grep-able `[sitelooper drift]` line naming every candidate rejected
  12956 |  *    ahead of the winner and WHY, in the policy's own words (MissReason).
  12957 |  *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what
  12958 |  *    this target resolved TO, as `<key>=<winning locator>`, with the cursor
  12959 |  *    appended only when ambiguity was narrowed to it. The progress guard
  12960 |  *    compares one pass's entries with the last.
  12961 |  *
  12962 |  * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's
  12963 |  * evidence-based reordering of a candidate later runs showed volatile):
  12964 |  * that evidence lives in the skill store, and an artifact has none, so a
  12965 |  * compiled chain is ordered by class and recorded order alone. Everything
  12966 |  * else the policy decides is decided here from the same observations.
  12967 |  */
  12968 | async function resolveTarget(
  12969 |   page: Page,
  12970 |   candidates: CandidateObservation[],
  12971 |   where: string,
  12972 |   policy: ResolvePolicy,
  12973 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  12974 | ): Promise<Resolution | null> {
  12975 |   const hit = await resolveCandidates(page, candidates, policy);
  12976 |   if (!hit) return null;
  12977 |   const primary = candidates.find((c) => c.index === 0) ?? candidates[0];
  12978 |   // Drift is a better candidate that FAILED (the shared isDrift), never a stored
  12979 |   // index alone: a positional primary the policy ranked behind a name was not missed.
  12980 |   if (isDrift(hit)) {
  12981 |     const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');
  12982 |     const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : 'used';
  12983 |     const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;
  12984 |     console.log(line);
  12985 |     (opts.drift ?? DRIFT).push(line);
  12986 |   }
  12987 |   if (opts.resolved) {
  12988 |     const won = candidates.find((c) => c.index === hit.index) ?? primary;
  12989 |     opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);
  12990 |     // the loop progress guard, asked before anything acts on what just resolved
  12991 |     opts.resolved.check?.();
  12992 |   }
  12993 |   return hit;
  12994 | }
  12995 | 
  12996 | /**
  12997 |  * resolveTarget for an ACTION: a chain that resolves nothing is a stop.
  12998 |  *
  12999 |  * `note` is passed only at a FLAGGED step (compile found the step itself
  13000 |  * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the
  13001 |  * throw, it is what stops "none of 3 recorded locators resolved" from
  13002 |  * reading as app drift when the recording is what needs redoing.
  13003 |  */
  13004 | async function pick(
  13005 |   page: Page,
  13006 |   candidates: CandidateObservation[],
  13007 |   where: string,
  13008 |   policy: ResolvePolicy,
  13009 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13010 |   note?: string,
  13011 | ): Promise<Resolution> {
  13012 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  13013 |   if (hit) return hit;
  13014 |   throw pickMiss(page, candidates, where, note);
  13015 | }
  13016 | 
  13017 | /** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */
  13018 | function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {
> 13019 |   return new Error(
        |          ^ Error: none of 1 recorded locators resolved at 04-add s_e18531/3 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/7): locator('[data-sitelooper-point="988,595"]')
  13020 |     // The url and the recorded step are half the answer whenever a chain
  13021 |     // misses wholesale: a locator that named the control on the day it was
  13022 |     // recorded usually misses because the page is not the page the step
  13023 |     // expected, and the log otherwise says only that nothing resolved.
  13024 |     `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +
  13025 |       candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +
  13026 |       (note ? `\n  ${note}` : ''),
  13027 |   );
  13028 | }
  13029 | 
  13030 | /**
  13031 |  * `pick` for a navigation click with a recorded destination — replay's
  13032 |  * navigation fallback (runOneStep), through the shared
  13033 |  * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,
  13034 |  * embedded). When the chain resolves nothing and the browser is not already
  13035 |  * where the click was recorded to land, another visible link to that
  13036 |  * destination is clicked, else a fully concrete destination is navigated to
  13037 |  * directly. Arrival returns null — the step is done, logged as drift, and
  13038 |  * its gates are not asked, as replay returns before them. Otherwise the
  13039 |  * same stop `pick` throws. Never emitted in a loop body (replay's rule).
  13040 |  */
  13041 | async function pickOrNavigate(
  13042 |   page: Page,
  13043 |   candidates: CandidateObservation[],
  13044 |   where: string,
  13045 |   policy: ResolvePolicy,
  13046 |   destPattern: string,
  13047 |   p: Record<string, string>,
  13048 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13049 |   note?: string,
  13050 | ): Promise<Resolution | null> {
  13051 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  13052 |   if (hit) return hit;
  13053 |   if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {
  13054 |     const arrived = await navigateToDestination(page, destPattern, p, {
  13055 |       click: async (loc) => {
  13056 |         await click(loc);
  13057 |       },
  13058 |       goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),
  13059 |     });
  13060 |     // The substitute link's click may have landed: a stop, never the direct navigation after it.
  13061 |     if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);
  13062 |     if (arrived) {
  13063 |       const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;
  13064 |       console.log(line);
  13065 |       (opts.drift ?? DRIFT).push(line);
  13066 |       return null;
  13067 |     }
  13068 |   }
  13069 |   throw pickMiss(page, candidates, where, note);
  13070 | }
  13071 | 
  13072 | /**
  13073 |  * A text wait that failed on the target it resolved — replay's
  13074 |  * textHeldElsewhere rung (the shared src/execution/recover.ts, embedded):
  13075 |  * when another recorded candidate for the same target already shows the
  13076 |  * text, the condition held, and the step goes on to its own gates with a
  13077 |  * drift line naming the candidate. Otherwise the wait's own error stands.
  13078 |  */
  13079 | async function textHeldOrThrow(err: unknown, candidates: CandidateObservation[], state: string, text: string, where: string, drift: string[]): Promise<void> {
  13080 |   const held = await textHeldElsewhere(candidates, state, text);
  13081 |   if (!held) throw err;
  13082 |   const message = (err instanceof Error ? err.message : String(err)).split('\n')[0];
  13083 |   const line = `[sitelooper drift] ${where}: ${message}; the text was already showing in fallback #${held.index + 1} ${String(held.locator)}`;
  13084 |   console.log(line);
  13085 |   drift.push(line);
  13086 | }
  13087 | 
  13088 | /**
  13089 |  * Every `[sitelooper skip]` line this run logged, by the `where` that
  13090 |  * logged it (`<step id> <skill step>/<n> <role>`).
  13091 |  *
  13092 |  * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,
  13093 |  * to look above for the producing step's `[sitelooper skip] … read target
  13094 |  * not found` line. When the reference names something that is not a step of
  13095 |  * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,
  13096 |  * a ledger instruction id no step publishes) no such line was ever emitted —
  13097 |  * the only occurrence of that string in the entire log was inside the error
  13098 |  * itself, and it sent the diagnosis after a read that was working all along.
  13099 |  * So the claim is now made only when the log bears it out.
  13100 |  */
  13101 | const skippedReads: string[] = [];
  13102 | 
  13103 | /**
  13104 |  * A recorded READ, which never fails the flow.
  13105 |  *
  13106 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an
  13107 |  * OBSERVATION, not a state change: a read whose target cannot be resolved —
  13108 |  * or whose read itself errors — is skipped with a warning and the replay
  13109 |  * CONTINUES ("skipped read — no element matched any known locator"). Failing
  13110 |  * to re-capture a value says nothing about whether the procedure ran; the
  13111 |  * step after it is exactly as valid as it was. A spec that threw here turned
  13112 |  * a missing observation into a failed test: grafana's `panel_content` read is
  13113 |  * a freshly applied text panel whose body the verifier goes on to confirm,
  13114 |  * and none of the three recorded ways of naming it resolved inside the
  13115 |  * resolve window — one lost value, and the run reported as a broken procedure.
  13116 |  *
  13117 |  * So: the resolution and the read together, and on any failure one grep-able
  13118 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  13119 |  * are left exactly as they were — the emptiness is the honest report.
```