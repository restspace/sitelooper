# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vgt3v.spec.ts >> vgt3v
- Location: vgt3v.spec.ts:9:1

# Error details

```
Error: 04-set s_6a736e/11: the recorded page change did not appear

04-set s_6a736e/11: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 04-set s_6a736e/11 none of the 4 recorded page change(s) appeared (e.g. \"- combobox \\\"Assignees bench-assignee (Bench Assignee)\\\"\") — the step ran but did not have its recorded effect"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
    - main "#7 - vgt3v-spec Bench Issue" [ref=e32]:
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
            - 'heading "vgt3v-spec Bench Issue #7" [level=1] [ref=e114]'
            - generic [ref=e115]:
              - button "Edit" [ref=e116] [cursor=pointer]
              - button "New Issue" [ref=e117] [cursor=pointer]
          - generic [ref=e118]:
            - generic [ref=e119]:
              - img [ref=e120]
              - text: Open
            - generic [ref=e124]:
              - text: opened 2026-09-25 05:47:03 +00:00now by
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
                - heading "admin commented Sep 25, 2026, 5:47 AM This user is the owner of this repository." [level=3] [ref=e133]:
                  - generic [ref=e135]:
                    - link "admin" [ref=e136] [cursor=pointer]:
                      - /url: /admin
                    - text: commented
                    - link "Sep 25, 2026, 5:47 AM" [ref=e137] [cursor=pointer]:
                      - /url: "#issue-7"
                      - text: 2026-09-25 05:47:03 +00:00now
                  - generic [ref=e138]:
                    - generic "This user is the owner of this repository." [ref=e139]: Owner
                    - menu "Reactions" [ref=e140] [cursor=pointer]:
                      - img [ref=e142]
                    - menu [ref=e144] [cursor=pointer]:
                      - img [ref=e146]
                - article [ref=e148]:
                  - paragraph [ref=e150]: Bench issue created for run vgt3v-spec
            - generic [ref=e151]:
              - img [ref=e153]
              - link "admin" [ref=e155] [cursor=pointer]:
                - /url: /admin
                - img "admin" [ref=e156]
              - generic [ref=e157]:
                - link "admin" [ref=e158] [cursor=pointer]:
                  - /url: /admin
                - text: added the
                - generic [ref=e159]:
                  - link "bug" [ref=e160] [cursor=pointer]:
                    - /url: /bench/bench-repo/issues?labels=1
                    - generic [ref=e162]: bug
                  - link "priority-high" [ref=e163] [cursor=pointer]:
                    - /url: /bench/bench-repo/issues?labels=2
                    - generic [ref=e165]: priority-high
                - text: labels 2026-09-25 05:47:10 +00:00now
            - generic [ref=e166]:
              - link "admin" [ref=e167] [cursor=pointer]:
                - /url: /admin
                - img "admin" [ref=e168]
              - generic [ref=e171]:
                - generic [ref=e173]:
                  - generic [ref=e174]:
                    - generic [ref=e176] [cursor=pointer]: Write
                    - generic [ref=e178] [cursor=pointer]: Preview
                  - generic [ref=e179]:
                    - toolbar [ref=e180]:
                      - generic [ref=e181]:
                        - button "Add heading" [ref=e182] [cursor=pointer]:
                          - img [ref=e183]
                          - text: "1"
                        - button "Add heading" [ref=e185] [cursor=pointer]:
                          - img [ref=e186]
                          - text: "2"
                        - button "Add heading" [ref=e188] [cursor=pointer]:
                          - img [ref=e189]
                          - text: "3"
                      - generic [ref=e191]:
                        - button "Add bold text" [ref=e192] [cursor=pointer]:
                          - img [ref=e193]
                        - button "Add italic text" [ref=e195] [cursor=pointer]:
                          - img [ref=e196]
                        - button "Add strikethrough text" [ref=e198] [cursor=pointer]:
                          - img [ref=e199]
                      - generic [ref=e201]:
                        - button "Quote text" [ref=e202] [cursor=pointer]:
                          - img [ref=e203]
                        - button "Add code" [ref=e205] [cursor=pointer]:
                          - img [ref=e206]
                        - button "Add a link" [ref=e208] [cursor=pointer]:
                          - img [ref=e209]
                      - generic [ref=e211]:
                        - button "Add a bullet list" [ref=e212] [cursor=pointer]:
                          - img [ref=e213]
                        - button "Add a numbered list" [ref=e215] [cursor=pointer]:
                          - img [ref=e216]
                        - button "Add a list of tasks" [ref=e218] [cursor=pointer]:
                          - img [ref=e219]
                        - button "Add a table" [ref=e221] [cursor=pointer]:
                          - img [ref=e222]
                      - generic [ref=e224]:
                        - button "Mention a user or team" [ref=e225] [cursor=pointer]:
                          - img [ref=e226]
                        - button "Reference an issue or pull request" [ref=e228] [cursor=pointer]:
                          - img [ref=e229]
                      - generic [ref=e231]:
                        - button [ref=e232] [cursor=pointer]:
                          - img [ref=e233]
                        - button "Use the legacy editor instead" [ref=e235] [cursor=pointer]:
                          - img [ref=e236]
                    - textbox "Leave a comment" [ref=e239]
                - button "Drop files or click here to upload." [ref=e243] [cursor=pointer]
                - generic [ref=e245]:
                  - button "Close Issue" [ref=e246] [cursor=pointer]:
                    - img [ref=e248]
                    - generic [ref=e251]: Close Issue
                  - button "Comment" [disabled]
          - generic [ref=e252]:
            - combobox [ref=e253] [cursor=pointer]:
              - generic [ref=e254]:
                - generic [ref=e255]: No Branch/Tag Specified
                - img [ref=e256]
            - generic [ref=e259]:
              - combobox [ref=e260] [cursor=pointer]:
                - generic [ref=e261]:
                  - strong [ref=e262]: Labels
                  - img [ref=e263]
              - generic [ref=e265]:
                - link "bug" [ref=e266] [cursor=pointer]:
                  - /url: /bench/bench-repo/issues?labels=1
                  - generic [ref=e268]: bug
                - link "priority-high" [ref=e269] [cursor=pointer]:
                  - /url: /bench/bench-repo/issues?labels=2
                  - generic [ref=e271]: priority-high
            - generic [ref=e273]:
              - combobox [ref=e274] [cursor=pointer]:
                - generic [ref=e275]:
                  - strong [ref=e276]: Milestone
                  - img [ref=e277]
              - generic [ref=e280]: No Milestone
            - generic [ref=e282]:
              - menu [ref=e283] [cursor=pointer]:
                - generic [ref=e284]:
                  - strong [ref=e285]: Projects
                  - img [ref=e286]
              - generic [ref=e289]: No projects
            - generic [ref=e291]:
              - combobox [active] [ref=e292] [cursor=pointer]:
                - generic [ref=e293]:
                  - strong [ref=e294]: Assignees
                  - img [ref=e295]
              - generic [ref=e298]: No Assignees
            - strong [ref=e301]: 1 Participants
            - link "admin" [ref=e303] [cursor=pointer]:
              - /url: /admin
              - img "admin" [ref=e304]
            - generic [ref=e306]:
              - strong [ref=e308]: Notifications
              - button "Unsubscribe" [ref=e310] [cursor=pointer]:
                - img [ref=e311]
                - text: Unsubscribe
            - generic [ref=e314]:
              - generic [ref=e315]:
                - strong [ref=e316]: Time Tracker
                - button "Set estimated time" [ref=e317] [cursor=pointer]:
                  - img [ref=e318]
              - generic [ref=e320]:
                - button "Start timer" [ref=e321] [cursor=pointer]:
                  - img [ref=e322]
                  - text: Start timer
                - button "Add Time" [ref=e324] [cursor=pointer]:
                  - img [ref=e325]
            - strong [ref=e329]: Due Date
            - generic [ref=e330]:
              - text: No due date set.
              - generic [ref=e331]:
                - textbox [ref=e332]:
                  - /placeholder: yyyy-mm-dd
                - button [ref=e333] [cursor=pointer]:
                  - img [ref=e334]
            - generic [ref=e337]:
              - strong [ref=e339]: Dependencies
              - paragraph [ref=e340]: No dependencies set.
              - generic [ref=e343]:
                - generic [ref=e344] [cursor=pointer]:
                  - img [ref=e345]
                  - combobox [ref=e347]
                  - generic [ref=e348]: Add dependency…
                - button [ref=e349] [cursor=pointer]:
                  - img [ref=e350]
            - generic "bench/bench-repo#7" [ref=e353]:
              - generic [ref=e354]: "Reference: bench/bench-repo#7"
              - button [ref=e355] [cursor=pointer]:
                - img [ref=e356]
            - button "Pin" [ref=e361] [cursor=pointer]:
              - img [ref=e362]
              - text: Pin
            - button "Lock conversation" [ref=e364] [cursor=pointer]:
              - img [ref=e365]
              - text: Lock conversation
            - button "Delete" [ref=e367] [cursor=pointer]:
              - img [ref=e368]
              - text: Delete
  - group "Footer" [ref=e370]:
    - contentinfo "About Software" [ref=e371]:
      - link "Powered by Gitea" [ref=e372] [cursor=pointer]:
        - /url: https://about.gitea.com
      - generic [ref=e373]:
        - text: "Version:"
        - link "1.27.3" [ref=e374] [cursor=pointer]:
          - /url: /-/admin/config
      - generic [ref=e375]:
        - text: "Page:"
        - strong [ref=e376]: 30ms
        - text: "Template:"
        - strong [ref=e377]: 8ms
    - group "Links" [ref=e378]:
      - menu [ref=e379] [cursor=pointer]:
        - generic [ref=e381]:
          - img [ref=e382]
          - text: Auto
      - menu [ref=e384] [cursor=pointer]:
        - generic [ref=e385]:
          - img [ref=e386]
          - text: English
      - link "Licenses" [ref=e388] [cursor=pointer]:
        - /url: /assets/licenses.txt
      - link "API" [ref=e389] [cursor=pointer]:
        - /url: /api/swagger
```

# Test source

```ts
  12338 |  * to recovery, never to a recorded literal."
  12339 |  *
  12340 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  12341 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  12342 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  12343 |  * that is honest for an observation and fatal for an argument. Empty, a
  12344 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  12345 |  * `known` slot loses the identity it exists to carry, so the blank does not
  12346 |  * merely misreport the run: it does the work to the wrong record.
  12347 |  *
  12348 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  12349 |  * verdict, the browser is at rest, and nothing of the consuming step has
  12350 |  * run when this throws.
  12351 |  *
  12352 |  * What it says about the LOG is checked against the log (skippedReads): an
  12353 |  * unpublished reference whose producing step never skipped a read has a
  12354 |  * different cause and a different fix, and pointing at a line that was
  12355 |  * never printed costs a diagnosis (grafana fwgr47).
  12356 |  */
  12357 | function need(outputs: Outputs, ref: string, by: string): string {
  12358 |   const value = outputs[ref as keyof Outputs];
  12359 |   if (value === undefined || value === '') {
  12360 |     const dot = ref.indexOf('.');
  12361 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  12362 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  12363 |     const trail = skips.length
  12364 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  12365 |         ` (${skips[0]}), which is where this run diverged.`
  12366 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  12367 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  12368 |         ` this value, rather than re-recording a read that may be working.`;
  12369 |     throw new Error(
  12370 |       `${by} needs {{${ref}}}, and this run never published it` +
  12371 |         (value === '' ? ' (it was published empty)' : '') +
  12372 |         `. ${trail}` +
  12373 |         ` Stopping here instead of passing an empty value into ${by}:` +
  12374 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  12375 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  12376 |         ` earlier steps did stands; nothing of ${by} has run.`,
  12377 |     );
  12378 |   }
  12379 |   return value;
  12380 | }
  12381 | 
  12382 | /**
  12383 |  * How long a recorded page change has to appear: Playwright's own expect
  12384 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  12385 |  */
  12386 | const EXPECT_WAIT_MS = 5_000;
  12387 | 
  12388 | /**
  12389 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  12390 |  *
  12391 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  12392 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  12393 |  * function, not a reading of it. The lines carrying this run's own values are
  12394 |  * HARD, the rest are a plain group; either is looked for first in the lines
  12395 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  12396 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  12397 |  * role, name, state, and the value after the colon. The AFTER capture is
  12398 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  12399 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  12400 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  12401 |  * as it settled, routed to the record and re-rendered the row, and the
  12402 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  12403 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  12404 |  * An earlier cut of this
  12405 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  12406 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  12407 |  * passed on any visible Project combobox whatever it showed. Polled for
  12408 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  12409 |  * once, so the artifact is the more patient of the two, never the looser.
  12410 |  *
  12411 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  12412 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  12413 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  12414 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  12415 |  * step body, which remembers it for the steps that were going to act inside.
  12416 |  */
  12417 | async function expectChanges(
  12418 |   page: Page,
  12419 |   recorded: string[],
  12420 |   p: Record<string, string>,
  12421 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  12422 |   linesBefore: string[] | null,
  12423 |   dialect: LineDialect = 1,
  12424 |   linesAfter: string[] | null = null,
  12425 | ): Promise<ChangeVerdict> {
  12426 |   let last: ChangeVerdict = { warnings: [] };
  12427 |   await expect
  12428 |     .poll(
  12429 |       async () => {
  12430 |         last = await expectedChangesVerdict(recorded, p, ctx, {
  12431 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  12432 |           live: () => captureLines(page, dialect),
  12433 |         });
  12434 |         return last.stop ?? null;
  12435 |       },
  12436 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  12437 |     )
> 12438 |     .toBeNull();
        |      ^ Error: 04-set s_6a736e/11: the recorded page change did not appear
  12439 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  12440 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  12441 |   return last;
  12442 | }
  12443 | 
  12444 | /**
  12445 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  12446 |  * after its targets resolve: a click whose identifying rungs ALL missed
  12447 |  * (`hit` positional, or null when nothing resolved) is — the shared
  12448 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  12449 |  * every line it was recorded adding already shows (`lines`, the shared
  12450 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  12451 |  * stopped when a positional rung took it onto an element without the
  12452 |  * recorded accessible name. True means skipped; a stop throws.
  12453 |  */
  12454 | async function positionalClick(
  12455 |   page: Page,
  12456 |   hit: Resolution | null,
  12457 |   identifying: number[],
  12458 |   points: number[],
  12459 |   lines: string[],
  12460 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  12461 |   p: Record<string, string>,
  12462 |   where: string,
  12463 |   dialect: LineDialect = 1,
  12464 | ): Promise<boolean> {
  12465 |   const verdict = await positionalClickVerdict(
  12466 |     page,
  12467 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  12468 |     identifying,
  12469 |     lines,
  12470 |     want,
  12471 |     p,
  12472 |     dialect,
  12473 |   );
  12474 |   if (verdict && 'skip' in verdict) {
  12475 |     logWarning(`${where}: ${verdict.skip}`);
  12476 |     return true;
  12477 |   }
  12478 |   if (verdict && 'stop' in verdict) throw new Error(`${where}: ${verdict.stop}`);
  12479 |   return false;
  12480 | }
  12481 | 
  12482 | function validateInputs(vars: Vars): void {
  12483 |   const missing: string[] = [];
  12484 |   if (typeof vars['runid'] !== 'string' || !vars['runid'].trim()) missing.push('RUNID');
  12485 |   for (const name of requiredEnvNames) {
  12486 |     if (!process.env[name]?.trim()) missing.push(name);
  12487 |   }
  12488 |   if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${[...new Set(missing)].join(', ')}`);
  12489 | }
  12490 | 
  12491 | export const steps = {
  12492 |   /** Open http://127.0.0.1:8095/ in the browser. If you are not already signed in, sign in with username admin and password {{env:APP_PASSWORD}} — type that password text exactly as given into the password… */
  12493 |   async '01-open'(page: Page, p: { v1: string; v2: string; v3: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {
  12494 |     const typedCommitted = new Set<string>();
  12495 | 
  12496 |     // What this step types, selects or names, across its segments (see echoRead).
  12497 |     const echoLedger = new Set<string>();
  12498 | 
  12499 |     // s_1e16d6: Open {{v1}} in the browser. If you are not already signed in, sign in with username {{v2}} and password {{v3}} — type that password text exactly as given into the password field (the environment fills…
  12500 |     // recorded on a page matching http://127.0.0.1:8095/
  12501 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  12502 |     const volatile1: UrlSegDiff[] = [];
  12503 | 
  12504 |     // @step 01-open s_1e16d6/1
  12505 |     let urlBefore1 = '';
  12506 |     let alertsBefore1: string[] = [];
  12507 |     let alertsAfter1: ObservedAlerts | null = null;
  12508 |     let nav1: NavigationTarget = { url: '' };
  12509 |     await runStepLifecycle({
  12510 |       prepare: async () => {
  12511 |         await settle(page);
  12512 |         urlBefore1 = page.url();
  12513 |         alertsBefore1 = (await liveAlerts(page)) ?? [];
  12514 |       },
  12515 |       act: async () => {
  12516 |         nav1 = navigationTarget(`${p.v1}`, page, volatile1, '01-open s_1e16d6/1');
  12517 |         await page.goto(nav1.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  12518 |         return { status: 'completed', value: undefined };
  12519 |       },
  12520 |       settle: async () => {
  12521 |         if (page.url() !== urlBefore1) await settle(page);
  12522 |         alertsAfter1 = await settledAlerts(page);
  12523 |       },
  12524 |       bind: async () => {
  12525 |       },
  12526 |       verify: async () => {
  12527 |         errorPageGate(page, '01-open s_1e16d6/1');
  12528 |         { const landing = gotoLandingVerdict(nav1.url, page.url(), '01-open s_1e16d6/1'); if (landing) throw new Error(landing); }
  12529 |         alertGate(alertsBefore1, alertsAfter1, { where: '01-open s_1e16d6/1', isRead: false, params: p, navigatedToStale: nav1.stale });
  12530 |       },
  12531 |     });
  12532 | 
  12533 | 
  12534 |     // @step 01-open s_1e16d6/2
  12535 |     let urlBefore2 = '';
  12536 |     let alertsBefore2: string[] = [];
  12537 |     let alertsAfter2: ObservedAlerts | null = null;
  12538 |     let linesBefore2: string[] | null = null;
```