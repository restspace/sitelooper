# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgt23.spec.ts >> fwgt23
- Location: fwgt23.spec.ts:9:1

# Error details

```
Error: none of 1 recorded locators resolved at 02-create s_bdd094/7 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/7): getByRole('link', { name: /^[\s\p{Co}\p{So}\p{Cf}]*Clear\s+labels[\s\p{Co}\p{So}\p{Cf}]*$/u })
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
    - main "#7 - fwgt23-spec Bench Issue" [ref=e32]:
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
              - text: Code
            - link "Issues 4" [ref=e70] [cursor=pointer]:
              - /url: /bench/bench-repo/issues
              - img [ref=e71]
              - text: Issues
              - generic [ref=e74]: "4"
            - link "Pull Requests" [ref=e75] [cursor=pointer]:
              - /url: /bench/bench-repo/pulls
              - img [ref=e76]
              - text: Pull Requests
            - link "Actions" [ref=e78] [cursor=pointer]:
              - /url: /bench/bench-repo/actions
              - img [ref=e79]
              - text: Actions
            - link "Packages" [ref=e81] [cursor=pointer]:
              - /url: /bench/bench-repo/packages
              - img [ref=e82]
              - text: Packages
            - link "Projects" [ref=e84] [cursor=pointer]:
              - /url: /bench/bench-repo/projects
              - img [ref=e85]
              - text: Projects
            - link "Releases" [ref=e87] [cursor=pointer]:
              - /url: /bench/bench-repo/releases
              - img [ref=e88]
              - text: Releases
            - link "Wiki" [ref=e90] [cursor=pointer]:
              - /url: /bench/bench-repo/wiki
              - img [ref=e91]
              - text: Wiki
            - link "Activity" [ref=e93] [cursor=pointer]:
              - /url: /bench/bench-repo/activity
              - img [ref=e94]
              - text: Activity
            - link "Settings" [ref=e97] [cursor=pointer]:
              - /url: /bench/bench-repo/settings
              - img [ref=e98]
              - text: Settings
      - generic [ref=e101]:
        - generic [ref=e102]:
          - generic [ref=e103]:
            - 'heading "fwgt23-spec Bench Issue #7" [level=1] [ref=e104]'
            - generic [ref=e105]:
              - button "Edit" [ref=e106] [cursor=pointer]
              - button "New Issue" [ref=e107] [cursor=pointer]
          - generic [ref=e108]:
            - generic [ref=e109]:
              - img [ref=e110]
              - text: Open
            - generic [ref=e114]:
              - text: opened 2026-09-26 22:05:53 +00:00now by
              - link "admin" [ref=e115] [cursor=pointer]:
                - /url: /admin
              - text: · 0 comments
        - generic [ref=e116]:
          - generic [ref=e118]:
            - generic [ref=e119]:
              - link "admin" [ref=e120] [cursor=pointer]:
                - /url: /admin
                - img "admin" [ref=e121]
              - generic [ref=e122]:
                - heading "admin commented Sep 26, 2026, 10:05 PM This user is the owner of this repository." [level=3] [ref=e123]:
                  - generic [ref=e125]:
                    - link "admin" [ref=e126] [cursor=pointer]:
                      - /url: /admin
                    - text: commented
                    - link "Sep 26, 2026, 10:05 PM" [ref=e127] [cursor=pointer]:
                      - /url: "#issue-7"
                      - text: 2026-09-26 22:05:53 +00:00now
                  - generic [ref=e128]:
                    - generic "This user is the owner of this repository." [ref=e129]: Owner
                    - menu "Reactions" [ref=e130] [cursor=pointer]:
                      - img [ref=e132]
                    - menu [ref=e134] [cursor=pointer]:
                      - img [ref=e136]
                - article [ref=e138]:
                  - generic [ref=e139]:
                    - paragraph [ref=e140]: Description for fwgt23-spec bench issue.
                    - paragraph [ref=e141]: This issue mentions fwgt23-spec in the description body.
            - generic [ref=e142]:
              - link "admin" [ref=e143] [cursor=pointer]:
                - /url: /admin
                - img "admin" [ref=e144]
              - generic [ref=e147]:
                - generic [ref=e149]:
                  - generic [ref=e150]:
                    - generic [ref=e152] [cursor=pointer]: Write
                    - generic [ref=e154] [cursor=pointer]: Preview
                  - generic [ref=e155]:
                    - toolbar [ref=e156]:
                      - generic [ref=e157]:
                        - button "Add heading" [ref=e158] [cursor=pointer]:
                          - img [ref=e159]
                          - text: "1"
                        - button "Add heading" [ref=e161] [cursor=pointer]:
                          - img [ref=e162]
                          - text: "2"
                        - button "Add heading" [ref=e164] [cursor=pointer]:
                          - img [ref=e165]
                          - text: "3"
                      - generic [ref=e167]:
                        - button "Add bold text" [ref=e168] [cursor=pointer]:
                          - img [ref=e169]
                        - button "Add italic text" [ref=e171] [cursor=pointer]:
                          - img [ref=e172]
                        - button "Add strikethrough text" [ref=e174] [cursor=pointer]:
                          - img [ref=e175]
                      - generic [ref=e177]:
                        - button "Quote text" [ref=e178] [cursor=pointer]:
                          - img [ref=e179]
                        - button "Add code" [ref=e181] [cursor=pointer]:
                          - img [ref=e182]
                        - button "Add a link" [ref=e184] [cursor=pointer]:
                          - img [ref=e185]
                      - generic [ref=e187]:
                        - button "Add a bullet list" [ref=e188] [cursor=pointer]:
                          - img [ref=e189]
                        - button "Add a numbered list" [ref=e191] [cursor=pointer]:
                          - img [ref=e192]
                        - button "Add a list of tasks" [ref=e194] [cursor=pointer]:
                          - img [ref=e195]
                        - button "Add a table" [ref=e197] [cursor=pointer]:
                          - img [ref=e198]
                      - generic [ref=e200]:
                        - button "Mention a user or team" [ref=e201] [cursor=pointer]:
                          - img [ref=e202]
                        - button "Reference an issue or pull request" [ref=e204] [cursor=pointer]:
                          - img [ref=e205]
                      - generic [ref=e207]:
                        - button [ref=e208] [cursor=pointer]:
                          - img [ref=e209]
                        - button "Use the legacy editor instead" [ref=e211] [cursor=pointer]:
                          - img [ref=e212]
                    - textbox "Leave a comment" [ref=e215]
                - button "Drop files or click here to upload." [ref=e219] [cursor=pointer]
                - generic [ref=e221]:
                  - button "Close Issue" [ref=e222] [cursor=pointer]:
                    - img [ref=e224]
                    - generic [ref=e227]: Close Issue
                  - button "Comment" [disabled]
          - generic [ref=e228]:
            - combobox [ref=e229] [cursor=pointer]:
              - generic [ref=e230]:
                - generic [ref=e231]: No Branch/Tag Specified
                - img [ref=e232]
            - generic [ref=e235]:
              - combobox [expanded] [ref=e236] [cursor=pointer]:
                - generic [ref=e237]:
                  - strong [ref=e238]: Labels
                  - img [ref=e239]
                - listbox [ref=e241]:
                  - generic [ref=e242]:
                    - generic:
                      - img
                    - textbox "Filter Label" [active] [ref=e243]: bug
                  - link "bug" [ref=e245]:
                    - /url: /bench/bench-repo/issues?labels=1
                    - generic [ref=e247]: bug
              - generic [ref=e249]: No labels
            - generic [ref=e251]:
              - combobox [ref=e252] [cursor=pointer]:
                - generic [ref=e253]:
                  - strong [ref=e254]: Milestone
                  - img [ref=e255]
              - generic [ref=e258]: No Milestone
            - generic [ref=e260]:
              - menu [ref=e261] [cursor=pointer]:
                - generic [ref=e262]:
                  - strong [ref=e263]: Projects
                  - img [ref=e264]
              - generic [ref=e267]: No projects
            - generic [ref=e269]:
              - combobox [ref=e270] [cursor=pointer]:
                - generic [ref=e271]:
                  - strong [ref=e272]: Assignees
                  - img [ref=e273]
              - generic [ref=e276]: No Assignees
            - strong [ref=e279]: 1 Participants
            - link "admin" [ref=e281] [cursor=pointer]:
              - /url: /admin
              - img "admin" [ref=e282]
            - generic [ref=e284]:
              - strong [ref=e286]: Notifications
              - button "Unsubscribe" [ref=e288] [cursor=pointer]:
                - img [ref=e289]
                - text: Unsubscribe
            - generic [ref=e292]:
              - generic [ref=e293]:
                - strong [ref=e294]: Time Tracker
                - button "Set estimated time" [ref=e295] [cursor=pointer]:
                  - img [ref=e296]
              - generic [ref=e298]:
                - button "Start timer" [ref=e299] [cursor=pointer]:
                  - img [ref=e300]
                  - text: Start timer
                - button "Add Time" [ref=e302] [cursor=pointer]:
                  - img [ref=e303]
            - strong [ref=e307]: Due Date
            - generic [ref=e308]:
              - text: No due date set.
              - generic [ref=e309]:
                - textbox [ref=e310]:
                  - /placeholder: yyyy-mm-dd
                - button [ref=e311] [cursor=pointer]:
                  - img [ref=e312]
            - generic [ref=e315]:
              - strong [ref=e317]: Dependencies
              - paragraph [ref=e318]: No dependencies set.
              - generic [ref=e321]:
                - generic [ref=e322] [cursor=pointer]:
                  - img [ref=e323]
                  - combobox [ref=e325]
                  - generic [ref=e326]: Add dependency…
                - button [ref=e327] [cursor=pointer]:
                  - img [ref=e328]
            - generic "bench/bench-repo#7" [ref=e331]:
              - generic [ref=e332]: "Reference: bench/bench-repo#7"
              - button [ref=e333] [cursor=pointer]:
                - img [ref=e334]
            - button "Pin" [ref=e339] [cursor=pointer]:
              - img [ref=e340]
              - text: Pin
            - button "Lock conversation" [ref=e342] [cursor=pointer]:
              - img [ref=e343]
              - text: Lock conversation
            - button "Delete" [ref=e345] [cursor=pointer]:
              - img [ref=e346]
              - text: Delete
  - group "Footer" [ref=e348]:
    - contentinfo "About Software" [ref=e349]:
      - link "Powered by Gitea" [ref=e350] [cursor=pointer]:
        - /url: https://about.gitea.com
      - generic [ref=e351]:
        - text: "Version:"
        - link "1.27.3" [ref=e352] [cursor=pointer]:
          - /url: /-/admin/config
      - generic [ref=e353]:
        - text: "Page:"
        - strong [ref=e354]: 18ms
        - text: "Template:"
        - strong [ref=e355]: 4ms
    - group "Links" [ref=e356]:
      - menu [ref=e357] [cursor=pointer]:
        - generic [ref=e359]:
          - img [ref=e360]
          - text: Auto
      - menu [ref=e362] [cursor=pointer]:
        - generic [ref=e363]:
          - img [ref=e364]
          - text: English
      - link "Licenses" [ref=e366] [cursor=pointer]:
        - /url: /assets/licenses.txt
      - link "API" [ref=e367] [cursor=pointer]:
        - /url: /api/swagger
```

# Test source

```ts
  14727 |  * No visibility wait ahead of recognition, as in the daemon: a recognised
  14728 |  * widget's recipe clicks its root (an input sink inside it may be 0x0), and
  14729 |  * the native half waits for the field itself (reactSafeFill's own 10s).
  14730 |  */
  14731 | async function fill(loc: Locator, value: string): Promise<void> {
  14732 |   const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);
  14733 |   if (attempt) logRecipe(attempt);
  14734 | }
  14735 | 
  14736 | /**
  14737 |  * A recorded `type`, as tools.ts's `case 'type'`: the same set-value recipe
  14738 |  * ladder a fill climbs (an editor or an aria-combobox driven by typing in
  14739 |  * the recording is driven by its recipe here too), else pressSequentially
  14740 |  * on the same target with the daemon's timeout and per-key delay.
  14741 |  */
  14742 | const TYPE_TIMEOUT_MS = 10000;
  14743 | const TYPE_DELAY_MS = 20;
  14744 | async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {
  14745 |   const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });
  14746 |   if (attempt) logRecipe(attempt);
  14747 | }
  14748 | 
  14749 | /**
  14750 |  * One recorded chain resolved against the page — the artifact's adapter to
  14751 |  * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),
  14752 |  * which is replay's `resolveChain` policy itself: the class order, the
  14753 |  * point mark, the identity guard, plausibility, the origin guard, ambiguity
  14754 |  * and its loop-cursor narrowing, the structural hold and the whole-chain
  14755 |  * wait are decided THERE, in both runners. Nothing here reinterprets one.
  14756 |  *
  14757 |  * What this adds is presentation, exactly what replay adds around its own
  14758 |  * call:
  14759 |  *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in
  14760 |  *    at each call site) turns a silent fallthrough into telemetry. A win by
  14761 |  *    any candidate but the primary (stored index 0) IS drift — the recorded
  14762 |  *    locator missed and a later one covered for it — so it is one stable,
  14763 |  *    grep-able `[sitelooper drift]` line naming every candidate rejected
  14764 |  *    ahead of the winner and WHY, in the policy's own words (MissReason).
  14765 |  *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what
  14766 |  *    this target resolved TO, as `<key>=<winning locator>`, with the cursor
  14767 |  *    appended only when ambiguity was narrowed to it. The progress guard
  14768 |  *    compares one pass's entries with the last.
  14769 |  *
  14770 |  * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's
  14771 |  * evidence-based reordering of a candidate later runs showed volatile):
  14772 |  * that evidence lives in the skill store, and an artifact has none, so a
  14773 |  * compiled chain is ordered by class and recorded order alone. Everything
  14774 |  * else the policy decides is decided here from the same observations.
  14775 |  */
  14776 | async function resolveTarget(
  14777 |   page: Page,
  14778 |   candidates: CandidateObservation[],
  14779 |   where: string,
  14780 |   policy: ResolvePolicy,
  14781 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  14782 | ): Promise<Resolution | null> {
  14783 |   const hit = await resolveCandidates(page, candidates, policy);
  14784 |   if (!hit) return null;
  14785 |   const primary = candidates.find((c) => c.index === 0) ?? candidates[0];
  14786 |   // Drift is a better candidate that FAILED (the shared isDrift), never a stored
  14787 |   // index alone: a positional primary the policy ranked behind a name was not missed.
  14788 |   if (isDrift(hit)) {
  14789 |     const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');
  14790 |     const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : 'used';
  14791 |     const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;
  14792 |     console.log(line);
  14793 |     (opts.drift ?? DRIFT).push(line);
  14794 |   }
  14795 |   if (opts.resolved) {
  14796 |     const won = candidates.find((c) => c.index === hit.index) ?? primary;
  14797 |     opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);
  14798 |     // the loop progress guard, asked before anything acts on what just resolved
  14799 |     opts.resolved.check?.();
  14800 |   }
  14801 |   return hit;
  14802 | }
  14803 | 
  14804 | /**
  14805 |  * resolveTarget for an ACTION: a chain that resolves nothing is a stop.
  14806 |  *
  14807 |  * `note` is passed only at a FLAGGED step (compile found the step itself
  14808 |  * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the
  14809 |  * throw, it is what stops "none of 3 recorded locators resolved" from
  14810 |  * reading as app drift when the recording is what needs redoing.
  14811 |  */
  14812 | async function pick(
  14813 |   page: Page,
  14814 |   candidates: CandidateObservation[],
  14815 |   where: string,
  14816 |   policy: ResolvePolicy,
  14817 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  14818 |   note?: string,
  14819 | ): Promise<Resolution> {
  14820 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  14821 |   if (hit) return hit;
  14822 |   throw pickMiss(page, candidates, where, note);
  14823 | }
  14824 | 
  14825 | /** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */
  14826 | function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {
> 14827 |   return new Error(
        |          ^ Error: none of 1 recorded locators resolved at 02-create s_bdd094/7 target (page is at http://127.0.0.1:8095/bench/bench-repo/issues/7): getByRole('link', { name: /^[\s\p{Co}\p{So}\p{Cf}]*Clear\s+labels[\s\p{Co}\p{So}\p{Cf}]*$/u })
  14828 |     // The url and the recorded step are half the answer whenever a chain
  14829 |     // misses wholesale: a locator that named the control on the day it was
  14830 |     // recorded usually misses because the page is not the page the step
  14831 |     // expected, and the log otherwise says only that nothing resolved.
  14832 |     `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +
  14833 |       candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +
  14834 |       (note ? `\n  ${note}` : ''),
  14835 |   );
  14836 | }
  14837 | 
  14838 | /**
  14839 |  * `pick` for a navigation click with a recorded destination — replay's
  14840 |  * navigation fallback (runOneStep), through the shared
  14841 |  * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,
  14842 |  * embedded). When the chain resolves nothing and the browser is not already
  14843 |  * where the click was recorded to land, another visible link to that
  14844 |  * destination is clicked, else a fully concrete destination is navigated to
  14845 |  * directly. Arrival returns null — the step is done, logged as drift, and
  14846 |  * its gates are not asked, as replay returns before them. Otherwise the
  14847 |  * same stop `pick` throws. Never emitted in a loop body (replay's rule).
  14848 |  */
  14849 | async function pickOrNavigate(
  14850 |   page: Page,
  14851 |   candidates: CandidateObservation[],
  14852 |   where: string,
  14853 |   policy: ResolvePolicy,
  14854 |   destPattern: string,
  14855 |   p: Record<string, string>,
  14856 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  14857 |   note?: string,
  14858 | ): Promise<Resolution | null> {
  14859 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  14860 |   if (hit) return hit;
  14861 |   if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {
  14862 |     const arrived = await navigateToDestination(page, destPattern, p, {
  14863 |       click: async (loc) => {
  14864 |         await click(loc);
  14865 |       },
  14866 |       goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),
  14867 |     });
  14868 |     // The substitute link's click may have landed: a stop, never the direct navigation after it.
  14869 |     if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);
  14870 |     if (arrived) {
  14871 |       const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;
  14872 |       console.log(line);
  14873 |       (opts.drift ?? DRIFT).push(line);
  14874 |       return null;
  14875 |     }
  14876 |   }
  14877 |   throw pickMiss(page, candidates, where, note);
  14878 | }
  14879 | 
  14880 | /**
  14881 |  * Every `[sitelooper skip]` line this run logged, by the `where` that
  14882 |  * logged it (`<step id> <skill step>/<n> <role>`).
  14883 |  *
  14884 |  * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,
  14885 |  * to look above for the producing step's `[sitelooper skip] … read target
  14886 |  * not found` line. When the reference names something that is not a step of
  14887 |  * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,
  14888 |  * a ledger instruction id no step publishes) no such line was ever emitted —
  14889 |  * the only occurrence of that string in the entire log was inside the error
  14890 |  * itself, and it sent the diagnosis after a read that was working all along.
  14891 |  * So the claim is now made only when the log bears it out.
  14892 |  */
  14893 | const skippedReads: string[] = [];
  14894 | 
  14895 | /**
  14896 |  * A recorded READ, which never fails the flow.
  14897 |  *
  14898 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an
  14899 |  * OBSERVATION, not a state change: a read whose target cannot be resolved —
  14900 |  * or whose read itself errors — is skipped with a warning and the replay
  14901 |  * CONTINUES ("skipped read — no element matched any known locator"). Failing
  14902 |  * to re-capture a value says nothing about whether the procedure ran; the
  14903 |  * step after it is exactly as valid as it was. A spec that threw here turned
  14904 |  * a missing observation into a failed test: grafana's `panel_content` read is
  14905 |  * a freshly applied text panel whose body the verifier goes on to confirm,
  14906 |  * and none of the three recorded ways of naming it resolved inside the
  14907 |  * resolve window — one lost value, and the run reported as a broken procedure.
  14908 |  *
  14909 |  * So: the resolution and the read together, and on any failure one grep-able
  14910 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  14911 |  * are left exactly as they were — the emptiness is the honest report.
  14912 |  *
  14913 |  * The rules are not restated here. WHEN the resolution is asked (once, then
  14914 |  * after one sweep of the page once more with no wait) is the shared
  14915 |  * resolveForRead; taking the read, flattening it and turning its error into
  14916 |  * a skip is the shared takeRead (src/execution/observe.ts, embedded).
  14917 |  * Replay's runOneStep calls the same two; this adapter only says what it did.
  14918 |  */
  14919 | async function readOptional(
  14920 |   page: Page,
  14921 |   candidates: CandidateObservation[],
  14922 |   where: string,
  14923 |   policy: ResolvePolicy,
  14924 |   read: (loc: Locator) => Promise<unknown>,
  14925 |   opts: {
  14926 |     drift?: string[];
  14927 |     resolved?: { into: string[]; key: string; check?: () => void };
```