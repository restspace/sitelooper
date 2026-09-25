# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgt15-cv2.spec.ts >> fwgt15-cv2
- Location: fwgt15-cv2.spec.ts:9:1

# Error details

```
Error: none of 1 recorded locators resolved at 04-add s_e18531/3 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/14): locator('[data-sitelooper-point="988,595"]')
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
    - main "#14 - fwgt15-cv2-c3 Bench Issue" [ref=e32]:
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
            - 'heading "fwgt15-cv2-c3 Bench Issue #14" [level=1] [ref=e114]'
            - generic [ref=e115]:
              - button "Edit" [ref=e116] [cursor=pointer]
              - button "New Issue" [ref=e117] [cursor=pointer]
          - generic [ref=e118]:
            - generic [ref=e119]:
              - img [ref=e120]
              - text: Open
            - generic [ref=e124]:
              - text: opened 2026-09-25 17:53:02 +00:00now by
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
                - heading "admin commented Sep 25, 2026, 5:53 PM This user is the owner of this repository." [level=3] [ref=e133]:
                  - generic [ref=e135]:
                    - link "admin" [ref=e136] [cursor=pointer]:
                      - /url: /admin
                    - text: commented
                    - link "Sep 25, 2026, 5:53 PM" [ref=e137] [cursor=pointer]:
                      - /url: "#issue-14"
                      - text: 2026-09-25 17:53:02 +00:00now
                  - generic [ref=e138]:
                    - generic "This user is the owner of this repository." [ref=e139]: Owner
                    - menu "Reactions" [ref=e140] [cursor=pointer]:
                      - img [ref=e142]
                    - menu [ref=e144] [cursor=pointer]:
                      - img [ref=e146]
                - article [ref=e148]:
                  - generic [ref=e149]:
                    - paragraph [ref=e150]: This issue was created for the fwgt15-cv2-c3 benchmark check.
                    - paragraph [ref=e151]: It mentions fwgt15-cv2-c3 in the body text.
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
            - generic "bench/bench-repo#14" [ref=e352]:
              - generic [ref=e353]: "Reference: bench/bench-repo#14"
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
        - strong [ref=e375]: 22ms
        - text: "Template:"
        - strong [ref=e376]: 7ms
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
  13033 |  * No visibility wait ahead of recognition, as in the daemon: a recognised
  13034 |  * widget's recipe clicks its root (an input sink inside it may be 0x0), and
  13035 |  * the native half waits for the field itself (reactSafeFill's own 10s).
  13036 |  */
  13037 | async function fill(loc: Locator, value: string): Promise<void> {
  13038 |   const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);
  13039 |   if (attempt) logRecipe(attempt);
  13040 | }
  13041 | 
  13042 | /**
  13043 |  * A recorded `type`, as tools.ts's `case 'type'`: the same set-value recipe
  13044 |  * ladder a fill climbs (an editor or an aria-combobox driven by typing in
  13045 |  * the recording is driven by its recipe here too), else pressSequentially
  13046 |  * on the same target with the daemon's timeout and per-key delay.
  13047 |  */
  13048 | const TYPE_TIMEOUT_MS = 10000;
  13049 | const TYPE_DELAY_MS = 20;
  13050 | async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {
  13051 |   const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });
  13052 |   if (attempt) logRecipe(attempt);
  13053 | }
  13054 | 
  13055 | /**
  13056 |  * One recorded chain resolved against the page — the artifact's adapter to
  13057 |  * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),
  13058 |  * which is replay's `resolveChain` policy itself: the class order, the
  13059 |  * point mark, the identity guard, plausibility, the origin guard, ambiguity
  13060 |  * and its loop-cursor narrowing, the structural hold and the whole-chain
  13061 |  * wait are decided THERE, in both runners. Nothing here reinterprets one.
  13062 |  *
  13063 |  * What this adds is presentation, exactly what replay adds around its own
  13064 |  * call:
  13065 |  *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in
  13066 |  *    at each call site) turns a silent fallthrough into telemetry. A win by
  13067 |  *    any candidate but the primary (stored index 0) IS drift — the recorded
  13068 |  *    locator missed and a later one covered for it — so it is one stable,
  13069 |  *    grep-able `[sitelooper drift]` line naming every candidate rejected
  13070 |  *    ahead of the winner and WHY, in the policy's own words (MissReason).
  13071 |  *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what
  13072 |  *    this target resolved TO, as `<key>=<winning locator>`, with the cursor
  13073 |  *    appended only when ambiguity was narrowed to it. The progress guard
  13074 |  *    compares one pass's entries with the last.
  13075 |  *
  13076 |  * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's
  13077 |  * evidence-based reordering of a candidate later runs showed volatile):
  13078 |  * that evidence lives in the skill store, and an artifact has none, so a
  13079 |  * compiled chain is ordered by class and recorded order alone. Everything
  13080 |  * else the policy decides is decided here from the same observations.
  13081 |  */
  13082 | async function resolveTarget(
  13083 |   page: Page,
  13084 |   candidates: CandidateObservation[],
  13085 |   where: string,
  13086 |   policy: ResolvePolicy,
  13087 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13088 | ): Promise<Resolution | null> {
  13089 |   const hit = await resolveCandidates(page, candidates, policy);
  13090 |   if (!hit) return null;
  13091 |   const primary = candidates.find((c) => c.index === 0) ?? candidates[0];
  13092 |   // Drift is a better candidate that FAILED (the shared isDrift), never a stored
  13093 |   // index alone: a positional primary the policy ranked behind a name was not missed.
  13094 |   if (isDrift(hit)) {
  13095 |     const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');
  13096 |     const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : 'used';
  13097 |     const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;
  13098 |     console.log(line);
  13099 |     (opts.drift ?? DRIFT).push(line);
  13100 |   }
  13101 |   if (opts.resolved) {
  13102 |     const won = candidates.find((c) => c.index === hit.index) ?? primary;
  13103 |     opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);
  13104 |     // the loop progress guard, asked before anything acts on what just resolved
  13105 |     opts.resolved.check?.();
  13106 |   }
  13107 |   return hit;
  13108 | }
  13109 | 
  13110 | /**
  13111 |  * resolveTarget for an ACTION: a chain that resolves nothing is a stop.
  13112 |  *
  13113 |  * `note` is passed only at a FLAGGED step (compile found the step itself
  13114 |  * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the
  13115 |  * throw, it is what stops "none of 3 recorded locators resolved" from
  13116 |  * reading as app drift when the recording is what needs redoing.
  13117 |  */
  13118 | async function pick(
  13119 |   page: Page,
  13120 |   candidates: CandidateObservation[],
  13121 |   where: string,
  13122 |   policy: ResolvePolicy,
  13123 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13124 |   note?: string,
  13125 | ): Promise<Resolution> {
  13126 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  13127 |   if (hit) return hit;
  13128 |   throw pickMiss(page, candidates, where, note);
  13129 | }
  13130 | 
  13131 | /** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */
  13132 | function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {
> 13133 |   return new Error(
        |          ^ Error: none of 1 recorded locators resolved at 04-add s_e18531/3 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/14): locator('[data-sitelooper-point="988,595"]')
  13134 |     // The url and the recorded step are half the answer whenever a chain
  13135 |     // misses wholesale: a locator that named the control on the day it was
  13136 |     // recorded usually misses because the page is not the page the step
  13137 |     // expected, and the log otherwise says only that nothing resolved.
  13138 |     `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +
  13139 |       candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +
  13140 |       (note ? `\n  ${note}` : ''),
  13141 |   );
  13142 | }
  13143 | 
  13144 | /**
  13145 |  * `pick` for a navigation click with a recorded destination — replay's
  13146 |  * navigation fallback (runOneStep), through the shared
  13147 |  * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,
  13148 |  * embedded). When the chain resolves nothing and the browser is not already
  13149 |  * where the click was recorded to land, another visible link to that
  13150 |  * destination is clicked, else a fully concrete destination is navigated to
  13151 |  * directly. Arrival returns null — the step is done, logged as drift, and
  13152 |  * its gates are not asked, as replay returns before them. Otherwise the
  13153 |  * same stop `pick` throws. Never emitted in a loop body (replay's rule).
  13154 |  */
  13155 | async function pickOrNavigate(
  13156 |   page: Page,
  13157 |   candidates: CandidateObservation[],
  13158 |   where: string,
  13159 |   policy: ResolvePolicy,
  13160 |   destPattern: string,
  13161 |   p: Record<string, string>,
  13162 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  13163 |   note?: string,
  13164 | ): Promise<Resolution | null> {
  13165 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  13166 |   if (hit) return hit;
  13167 |   if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {
  13168 |     const arrived = await navigateToDestination(page, destPattern, p, {
  13169 |       click: async (loc) => {
  13170 |         await click(loc);
  13171 |       },
  13172 |       goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),
  13173 |     });
  13174 |     // The substitute link's click may have landed: a stop, never the direct navigation after it.
  13175 |     if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);
  13176 |     if (arrived) {
  13177 |       const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;
  13178 |       console.log(line);
  13179 |       (opts.drift ?? DRIFT).push(line);
  13180 |       return null;
  13181 |     }
  13182 |   }
  13183 |   throw pickMiss(page, candidates, where, note);
  13184 | }
  13185 | 
  13186 | /**
  13187 |  * A text wait that failed on the target it resolved — replay's
  13188 |  * textHeldElsewhere rung (the shared src/execution/recover.ts, embedded):
  13189 |  * when another recorded candidate for the same target already shows the
  13190 |  * text, the condition held, and the step goes on to its own gates with a
  13191 |  * drift line naming the candidate. Otherwise the wait's own error stands.
  13192 |  */
  13193 | async function textHeldOrThrow(err: unknown, candidates: CandidateObservation[], state: string, text: string, where: string, drift: string[]): Promise<void> {
  13194 |   const held = await textHeldElsewhere(candidates, state, text);
  13195 |   if (!held) throw err;
  13196 |   const message = (err instanceof Error ? err.message : String(err)).split('\n')[0];
  13197 |   const line = `[sitelooper drift] ${where}: ${message}; the text was already showing in fallback #${held.index + 1} ${String(held.locator)}`;
  13198 |   console.log(line);
  13199 |   drift.push(line);
  13200 | }
  13201 | 
  13202 | /**
  13203 |  * Every `[sitelooper skip]` line this run logged, by the `where` that
  13204 |  * logged it (`<step id> <skill step>/<n> <role>`).
  13205 |  *
  13206 |  * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,
  13207 |  * to look above for the producing step's `[sitelooper skip] … read target
  13208 |  * not found` line. When the reference names something that is not a step of
  13209 |  * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,
  13210 |  * a ledger instruction id no step publishes) no such line was ever emitted —
  13211 |  * the only occurrence of that string in the entire log was inside the error
  13212 |  * itself, and it sent the diagnosis after a read that was working all along.
  13213 |  * So the claim is now made only when the log bears it out.
  13214 |  */
  13215 | const skippedReads: string[] = [];
  13216 | 
  13217 | /**
  13218 |  * A recorded READ, which never fails the flow.
  13219 |  *
  13220 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an
  13221 |  * OBSERVATION, not a state change: a read whose target cannot be resolved —
  13222 |  * or whose read itself errors — is skipped with a warning and the replay
  13223 |  * CONTINUES ("skipped read — no element matched any known locator"). Failing
  13224 |  * to re-capture a value says nothing about whether the procedure ran; the
  13225 |  * step after it is exactly as valid as it was. A spec that threw here turned
  13226 |  * a missing observation into a failed test: grafana's `panel_content` read is
  13227 |  * a freshly applied text panel whose body the verifier goes on to confirm,
  13228 |  * and none of the three recorded ways of naming it resolved inside the
  13229 |  * resolve window — one lost value, and the run reported as a broken procedure.
  13230 |  *
  13231 |  * So: the resolution and the read together, and on any failure one grep-able
  13232 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  13233 |  * are left exactly as they were — the emptiness is the honest report.
```