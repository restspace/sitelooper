# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgt31-luna.spec.ts >> fwgt31-luna
- Location: fwgt31-luna.spec.ts:9:1

# Error details

```
Error: 01-signin s_e6dfc9/11: the recorded page change did not appear

01-signin s_e6dfc9/11: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 01-signin s_e6dfc9/11 the page did not show \"- link \\\"bug\\\"\" as it did when recorded — the step ran but probably acted on the wrong element"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
    - main "New Issue" [ref=e32]:
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
            - link "Issues 3" [ref=e71] [cursor=pointer]:
              - /url: /bench/bench-repo/issues
              - img [ref=e72]
              - generic [ref=e75]: Issues
              - generic [ref=e76]: "3"
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
      - generic [ref=e112]:
        - generic [ref=e115]:
          - img "admin" [ref=e117]
          - generic [ref=e118]:
            - textbox "Title" [ref=e120]: fwgt31-luna-spec Bench Issue
            - generic [ref=e122]:
              - generic [ref=e123]:
                - generic [ref=e125] [cursor=pointer]: Write
                - generic [ref=e127] [cursor=pointer]: Preview
              - generic [ref=e128]:
                - toolbar [ref=e129]:
                  - generic [ref=e130]:
                    - button "Add heading" [ref=e131] [cursor=pointer]:
                      - img [ref=e132]
                      - text: "1"
                    - button "Add heading" [ref=e134] [cursor=pointer]:
                      - img [ref=e135]
                      - text: "2"
                    - button "Add heading" [ref=e137] [cursor=pointer]:
                      - img [ref=e138]
                      - text: "3"
                  - generic [ref=e140]:
                    - button "Add bold text" [ref=e141] [cursor=pointer]:
                      - img [ref=e142]
                    - button "Add italic text" [ref=e144] [cursor=pointer]:
                      - img [ref=e145]
                    - button "Add strikethrough text" [ref=e147] [cursor=pointer]:
                      - img [ref=e148]
                  - generic [ref=e150]:
                    - button "Quote text" [ref=e151] [cursor=pointer]:
                      - img [ref=e152]
                    - button "Add code" [ref=e154] [cursor=pointer]:
                      - img [ref=e155]
                    - button "Add a link" [ref=e157] [cursor=pointer]:
                      - img [ref=e158]
                  - generic [ref=e160]:
                    - button "Add a bullet list" [ref=e161] [cursor=pointer]:
                      - img [ref=e162]
                    - button "Add a numbered list" [ref=e164] [cursor=pointer]:
                      - img [ref=e165]
                    - button "Add a list of tasks" [ref=e167] [cursor=pointer]:
                      - img [ref=e168]
                    - button "Add a table" [ref=e170] [cursor=pointer]:
                      - img [ref=e171]
                  - generic [ref=e173]:
                    - button "Mention a user or team" [ref=e174] [cursor=pointer]:
                      - img [ref=e175]
                    - button "Reference an issue or pull request" [ref=e177] [cursor=pointer]:
                      - img [ref=e178]
                  - generic [ref=e180]:
                    - button [ref=e181] [cursor=pointer]:
                      - img [ref=e182]
                    - button "Use the legacy editor instead" [ref=e184] [cursor=pointer]:
                      - img [ref=e185]
                - textbox "Leave a comment" [ref=e188]: fwgt31-luna-spec
            - button "Drop files or click here to upload." [ref=e192] [cursor=pointer]
            - button "Create Issue" [ref=e194] [cursor=pointer]
        - generic [ref=e195]:
          - combobox [ref=e196] [cursor=pointer]:
            - generic [ref=e197]:
              - generic [ref=e198]: No Branch/Tag Specified
              - img [ref=e199]
          - generic [ref=e202]:
            - combobox [expanded] [ref=e203] [cursor=pointer]:
              - generic [ref=e204]:
                - strong [ref=e205]: Labels
                - img [ref=e206]
              - listbox [ref=e208]:
                - generic [ref=e209]:
                  - generic:
                    - img
                  - textbox "Filter Label" [ref=e210]: priority-high
                - link "priority-high" [ref=e212]:
                  - /url: /bench/bench-repo/issues?labels=2
                  - img [ref=e214]
                  - generic [ref=e217]: priority-high
            - generic [ref=e219]: No labels
          - generic [ref=e221]:
            - combobox [ref=e222] [cursor=pointer]:
              - generic [ref=e223]:
                - strong [ref=e224]: Milestone
                - img [ref=e225]
            - generic [ref=e228]: No Milestone
          - generic [ref=e230]:
            - menu [ref=e231] [cursor=pointer]:
              - generic [ref=e232]:
                - strong [ref=e233]: Projects
                - img [ref=e234]
            - generic [ref=e237]: No projects
          - generic [ref=e239]:
            - combobox [ref=e240] [cursor=pointer]:
              - generic [ref=e241]:
                - strong [ref=e242]: Assignees
                - img [ref=e243]
            - generic [ref=e246]: No Assignees
  - group "Footer" [ref=e247]:
    - contentinfo "About Software" [ref=e248]:
      - link "Powered by Gitea" [ref=e249] [cursor=pointer]:
        - /url: https://about.gitea.com
      - generic [ref=e250]:
        - text: "Version:"
        - link "1.27.3" [ref=e251] [cursor=pointer]:
          - /url: /-/admin/config
      - generic [ref=e252]:
        - text: "Page:"
        - strong [ref=e253]: 12ms
        - text: "Template:"
        - strong [ref=e254]: 3ms
    - group "Links" [ref=e255]:
      - menu [ref=e256] [cursor=pointer]:
        - generic [ref=e258]:
          - img [ref=e259]
          - text: Auto
      - menu [ref=e261] [cursor=pointer]:
        - generic [ref=e262]:
          - img [ref=e263]
          - text: English
      - link "Licenses" [ref=e265] [cursor=pointer]:
        - /url: /assets/licenses.txt
      - link "API" [ref=e266] [cursor=pointer]:
        - /url: /api/swagger
```

# Test source

```ts
  14951 |  */
  14952 | async function readOptional(
  14953 |   page: Page,
  14954 |   candidates: CandidateObservation[],
  14955 |   where: string,
  14956 |   policy: ResolvePolicy,
  14957 |   read: (loc: Locator) => Promise<unknown>,
  14958 |   opts: {
  14959 |     drift?: string[];
  14960 |     resolved?: { into: string[]; key: string; check?: () => void };
  14961 |     count?: { root: { locator(selector: string, options?: { hasText?: string | RegExp }): Locator }; scopes: CountScope[] | null };
  14962 |     kinds?: RecordedKind[];
  14963 |     label?: string;
  14964 |   } = {},
  14965 | ): Promise<string> {
  14966 |   lastReadHit = null;
  14967 |   const hit = await resolveForRead(page, (again) => resolveTarget(page, candidates, where, again ? { ...policy, waitMs: 0 } : policy, opts));
  14968 |   // A COUNT read (opts.count) that resolved nothing on a settled page with
  14969 |   // its scope on it observed "0", as replay publishes it (the shared
  14970 |   // countedNothing, fwrd88 05-change); anything else still skips.
  14971 |   if (!hit && opts.count && (await countedNothing(page, opts.count.root, candidates, opts.count.scopes))) return '0';
  14972 |   if (!hit) {
  14973 |     skippedReads.push(where);
  14974 |     console.log(`[sitelooper skip] ${where}: read target not found — value left empty`);
  14975 |     return '';
  14976 |   }
  14977 |   // A positional fallback standing in for a better candidate that missed reads
  14978 |   // what the recording read only if it is the kind of element it read (round 62,
  14979 |   // replay's same check; the artifact never heals, so a fallback is its only case).
  14980 |   if (hit.index > 0 && hit.structural && opts.kinds?.length && (await readsRecordedKind(hit.locator, opts.kinds)) === false) {
  14981 |     skippedReads.push(where);
  14982 |     console.log(`[sitelooper skip] ${where}: ${offRecordReadReason(opts.label ?? '', 'a positional fallback', opts.kinds)}`);
  14983 |     return '';
  14984 |   }
  14985 |   lastReadHit = hit.locator;
  14986 |   const taken = await takeRead(() => read(hit.locator));
  14987 |   if (taken.ok) return taken.value;
  14988 |   // A read proving what the step set did not land fails the step (scopedReadLanded, gitea fwgt12).
  14989 |   if (taken.lost) throw new Error(`${where}: ${taken.message}`);
  14990 |   skippedReads.push(where);
  14991 |   console.log(`[sitelooper skip] ${where}: read errored (${taken.message}) — value left empty`);
  14992 |   return '';
  14993 | }
  14994 | 
  14995 | /**
  14996 |  * How long a recorded page change has to appear: Playwright's own expect
  14997 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  14998 |  */
  14999 | const EXPECT_WAIT_MS = 5_000;
  15000 | 
  15001 | /**
  15002 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  15003 |  *
  15004 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  15005 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  15006 |  * function, not a reading of it. The lines carrying this run's own values are
  15007 |  * HARD, the rest are a plain group; either is looked for first in the lines
  15008 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  15009 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  15010 |  * role, name, state, and the value after the colon. The AFTER capture is
  15011 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  15012 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  15013 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  15014 |  * as it settled, routed to the record and re-rendered the row, and the
  15015 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  15016 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  15017 |  * An earlier cut of this
  15018 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  15019 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  15020 |  * passed on any visible Project combobox whatever it showed. Polled for
  15021 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  15022 |  * once, so the artifact is the more patient of the two, never the looser.
  15023 |  *
  15024 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  15025 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  15026 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  15027 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  15028 |  * step body, which remembers it for the steps that were going to act inside.
  15029 |  */
  15030 | async function expectChanges(
  15031 |   page: Page,
  15032 |   recorded: string[],
  15033 |   p: Record<string, string>,
  15034 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  15035 |   linesBefore: string[] | null,
  15036 |   dialect: LineDialect = 1,
  15037 |   linesAfter: string[] | null = null,
  15038 | ): Promise<ChangeVerdict> {
  15039 |   let last: ChangeVerdict = { warnings: [] };
  15040 |   await expect
  15041 |     .poll(
  15042 |       async () => {
  15043 |         last = await expectedChangesVerdict(recorded, p, { ...ctx, counters: counterNames(siteFactsAt(page.url()), page.url()) }, {
  15044 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  15045 |           live: (look) => captureLines(page, dialect, look),
  15046 |         });
  15047 |         return last.stop ?? null;
  15048 |       },
  15049 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  15050 |     )
> 15051 |     .toBeNull();
        |      ^ Error: 01-signin s_e6dfc9/11: the recorded page change did not appear
  15052 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  15053 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  15054 |   return last;
  15055 | }
  15056 | 
  15057 | /**
  15058 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  15059 |  * after its targets resolve: a click whose identifying rungs ALL missed
  15060 |  * (`hit` positional, or null when nothing resolved) is — the shared
  15061 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  15062 |  * every line it was recorded adding already shows (`lines`, the shared
  15063 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  15064 |  * stopped when a positional rung took it onto an element without the
  15065 |  * recorded accessible name. True means skipped; a stop throws.
  15066 |  */
  15067 | async function positionalClick(
  15068 |   page: Page,
  15069 |   hit: Resolution | null,
  15070 |   identifying: number[],
  15071 |   points: number[],
  15072 |   lines: string[],
  15073 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  15074 |   p: Record<string, string>,
  15075 |   where: string,
  15076 |   dialect: LineDialect = 1,
  15077 | ): Promise<boolean> {
  15078 |   const verdict = await positionalClickVerdict(
  15079 |     page,
  15080 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  15081 |     identifying,
  15082 |     lines,
  15083 |     want,
  15084 |     p,
  15085 |     dialect,
  15086 |   );
  15087 |   if (verdict && 'skip' in verdict) {
  15088 |     logWarning(`${where}: ${verdict.skip}`);
  15089 |     return true;
  15090 |   }
  15091 |   if (verdict && 'stop' in verdict) throw new Error(`${where}: ${verdict.stop}`);
  15092 |   return false;
  15093 | }
  15094 | 
  15095 | function validateInputs(vars: Vars): void {
  15096 |   const missing: string[] = [];
  15097 |   if (typeof vars['runid'] !== 'string' || !vars['runid'].trim()) missing.push('RUNID');
  15098 |   for (const name of requiredEnvNames) {
  15099 |     if (!process.env[name]?.trim()) missing.push(name);
  15100 |   }
  15101 |   if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${[...new Set(missing)].join(', ')}`);
  15102 | }
  15103 | 
  15104 | export const steps = {
  15105 |   /** In Gitea at http://127.0.0.1:8095/, sign in as admin using the password text exactly {{env:APP_PASSWORD}}. In repository bench/bench-repo, read and report the exact titles of open issues beginning See… */
  15106 |   async '01-signin'(page: Page, p: { v1: string; v2: string; v3: string; v4: string; v5: string; v6: string; [slot: string]: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {
  15107 |     const typedCommitted = new Set<string>();
  15108 | 
  15109 |     // What this step types, selects or names, across its segments (see echoRead).
  15110 |     const echoLedger = new Set<string>();
  15111 | 
  15112 |     // The urls this step loads, for its report values (a given url it loaded was observed).
  15113 |     const reportTrail = urlTrail(page);
  15114 | 
  15115 |     // s_e9324c: In Gitea at http://127.0.0.1:8095/, sign in as {{v2}} using the password text exactly {{v3}}. In repository bench/bench-repo, read and report the exact titles of open issues beginning Seed: without mo…
  15116 |     // recorded on a page matching http://127.0.0.1:8095/
  15117 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  15118 |     const volatile1: UrlSegDiff[] = [];
  15119 | 
  15120 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  15121 |     await preconditionGate('http://127.0.0.1:8095/', page.url(), p, '01-signin s_e9324c', cosine(recordedFingerprint('01-signin', 's_e9324c'), (await fingerprintPage(page)) ?? undefined));
  15122 | 
  15123 |     // @step 01-signin s_e9324c/1
  15124 |     let urlBefore1 = '';
  15125 |     let alertsBefore1: string[] = [];
  15126 |     let alertsAfter1: ObservedAlerts | null = null;
  15127 |     let linesBefore1: string[] | null = null;
  15128 |     let linesAfter1: string[] | null = null;
  15129 |     let positional1 = false;
  15130 |     let obs1: ActionObservation | null = null;
  15131 |     await runStepLifecycle({
  15132 |       prepare: async () => {
  15133 |         await settle(page);
  15134 |         urlBefore1 = page.url();
  15135 |         alertsBefore1 = (await liveAlerts(page, 2)) ?? [];
  15136 |         linesBefore1 = await capturePageLines(page, 2);
  15137 |       },
  15138 |       act: async () => {
  15139 |         const hit1 = await pickOrNavigate(page, [
  15140 |           { locator: page.getByRole('link', { name: roleName('Sign In'), exact: true }), index: 0, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'link', name: 'Sign In' }) },
  15141 |           { locator: page.locator('#navbar > div:nth-of-type(2) > a'), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#navbar > div:nth-of-type(2) > a' }) },
  15142 |           { locator: pointLocator(page, { x: 1223, y: 25 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1223, y: 25, w: 93.5, h: 36, role: 'link', tag: 'a', vw: 1280, vh: 900 }), point: { x: 1223, y: 25, w: 93.5, h: 36, role: 'link', tag: 'a', vw: 1280, vh: 900 } },
  15143 |         ], '01-signin s_e9324c/1 target', { stayOnOrigin: 'http://127.0.0.1:8095', waitMs: RESOLVE_WAIT_MS }, 'http://127.0.0.1:8095/user/login', p, { drift: run.drift }).catch(async (error: unknown) => { if (await positionalClick(page, null, [0], [2], ['- heading "Sign In"', '- textbox "Username or Email Address"', '- link "Forgot password?"', '- textbox "Password"', '- checkbox "Remember This Device"'], {"by":"role","role":"link","name":"Sign In"}, p, '01-signin s_e9324c/1', 2)) return null; throw error; });
  15144 |         if (!hit1) return { status: 'skipped' };
  15145 |         if (await positionalClick(page, hit1, [0], [2], ['- heading "Sign In"', '- textbox "Username or Email Address"', '- link "Forgot password?"', '- textbox "Password"', '- checkbox "Remember This Device"'], {"by":"role","role":"link","name":"Sign In"}, p, '01-signin s_e9324c/1', 2)) return { status: 'skipped' };
  15146 |         positional1 = positional1 || hit1.structural || hit1.nth !== undefined;
  15147 |         noteInteraction(echoLedger, ['Sign In']);
  15148 |         await markActed(page, hit1.locator, echoLedger, ['Sign In'], 's_e9324c/1', 'click');
  15149 |         obs1 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true });
  15150 |         await click(hit1.locator, { obs: obs1 }).catch(actionFailed);
  15151 |         return { status: 'completed', value: undefined };
```