# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwod88-cv3.spec.ts >> fwod88-cv3
- Location: fwod88-cv3.spec.ts:9:1

# Error details

```
Error: 01-signin s_5fccd8/2: the recorded page change did not appear

01-signin s_5fccd8/2: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 01-signin s_5fccd8/2 none of the 1 recorded page change(s) appeared (e.g. \"- menu \\\"6 3 YourCompany\\\"\") — the step ran but did not have its recorded effect"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - navigation [ref=e3]:
      - button "" [ref=e5] [cursor=pointer]:
        - generic [ref=e6]: 
      - menuitem "Discuss" [ref=e7] [cursor=pointer]
      - menu [ref=e8]:
        - button "Messages 5" [ref=e10] [cursor=pointer]:
          - img "Messages" [ref=e11]: 
          - generic [ref=e12]: "5"
        - button "Activities 3" [ref=e14] [cursor=pointer]:
          - img "Activities" [ref=e15]: 
          - generic [ref=e16]: "3"
        - button "YourCompany" [ref=e18] [cursor=pointer]:
          - text: 
          - generic [ref=e19]: YourCompany
        - generic: 
        - button "User" [active] [ref=e21] [cursor=pointer]:
          - img "User" [ref=e22]
          - text: 
  - generic [ref=e24]:
    - generic [ref=e25]:
      - button "Start a meeting" [ref=e27] [cursor=pointer]
      - separator [ref=e28]
      - generic [ref=e29]:
        - button " Inbox" [ref=e30] [cursor=pointer]:
          - generic "Inbox" [ref=e32]: 
          - generic [ref=e33]: Inbox
        - button " Starred" [ref=e34] [cursor=pointer]:
          - generic "Favorites" [ref=e36]: 
          - generic [ref=e37]: Starred
        - button " History" [ref=e38] [cursor=pointer]:
          - generic "History" [ref=e40]: 
          - generic [ref=e41]: History
      - separator [ref=e42]
      - generic [ref=e43]:
        - generic [ref=e44] [cursor=pointer]:
          - generic [ref=e45]: 
          - generic [ref=e46]: Channels
        - generic [ref=e47]:
          - img "View or join channels" [ref=e48] [cursor=pointer]: 
          - img "Add or join a channel" [ref=e49] [cursor=pointer]: 
      - button "Thread Image general" [ref=e50] [cursor=pointer]:
        - img "Thread Image" [ref=e52]
        - generic [ref=e53]: general
        - text: 
      - generic [ref=e54]:
        - generic [ref=e55] [cursor=pointer]:
          - generic [ref=e56]: 
          - generic [ref=e57]: Direct messages
        - img "Start a conversation" [ref=e59] [cursor=pointer]: 
    - generic [ref=e60]:
      - generic [ref=e61]:
        - generic "Inbox" [ref=e63]: 
        - textbox "Inbox" [disabled] [ref=e65]:
          - /placeholder: ""
        - generic [ref=e66]:
          - button "Mark all read" [disabled]
          - button "" [ref=e67] [cursor=pointer]:
            - generic [ref=e68]: 
      - generic [ref=e72]:
        - heading "Congratulations, your inbox is empty" [level=4] [ref=e73]
        - text: New messages appear here.
```

# Test source

```ts
  16992 |  * page's snapshot lines (capturePageLines — role, name, state and the value
  16993 |  * after the colon, so a marker that is only an <input>'s VALUE on a form in
  16994 |  * edit mode is seen, where `getByText` never could: cloud run sp5odb died on
  16995 |  * exactly that), read by lineShows. Two halves, and both are load-bearing.
  16996 |  * The IDENTITY texts say the page is showing THIS record — the url and the
  16997 |  * page shape only ever say "a page of this template" — and take the bounded
  16998 |  * rule (`whole`: `fwgr25-n1` is not satisfied by `fwgr25-n10`); the GOAL
  16999 |  * texts say that record is already in the state this step exists to
  17000 |  * produce, and are a plain substring, exactly as goalSatisfied splits them.
  17001 |  * Identity alone would skip a step because the right record is open; a goal
  17002 |  * alone would skip it because some OTHER record happens to read "Cancelled".
  17003 |  *
  17004 |  * Both halves being on the PAGE is not enough, which is why the record-scope
  17005 |  * check follows (scopeCheckInPage, the daemon's own, run in the page): on a
  17006 |  * list, "Order A" and "Cancelled" are both present when it is order B that
  17007 |  * was cancelled. They have to hold of the same record.
  17008 |  *
  17009 |  * Conservative by construction: no goal, no identity, or a page that cannot
  17010 |  * be read — or a look that could not cover it (captureLines, dialect 2: a
  17011 |  * cap reached, a visible frame unread, a virtualised list) — is never
  17012 |  * satisfied. Being wrong the other way costs one re-run of a step that had
  17013 |  * already happened; being wrong THIS way skips work that never happened.
  17014 |  */
  17015 | async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {
  17016 |   if (!identity.length || !goal.length) return false;
  17017 |   const captured = await captureLines(page, 2);
  17018 |   if (!captured || !captured.complete) return false;
  17019 |   const lines = captured.lines;
  17020 |   for (const want of identity) {
  17021 |     if (!lineShows(lines, [want], { whole: true })) return false;
  17022 |   }
  17023 |   for (const want of goal) {
  17024 |     if (!lineShows(lines, [want])) return false;
  17025 |   }
  17026 |   try {
  17027 |     // The identity half goes in as regex SOURCE: scopeCheckInPage is
  17028 |     // serialised into the page, so it cannot call identityRe there.
  17029 |     return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });
  17030 |   } catch {
  17031 |     // A page that cannot be evaluated has proven nothing. Run the step.
  17032 |     return false;
  17033 |   }
  17034 | }
  17035 | 
  17036 | /**
  17037 |  * How long a recorded page change has to appear: Playwright's own expect
  17038 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  17039 |  */
  17040 | const EXPECT_WAIT_MS = 5_000;
  17041 | 
  17042 | /**
  17043 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  17044 |  *
  17045 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  17046 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  17047 |  * function, not a reading of it. The lines carrying this run's own values are
  17048 |  * HARD, the rest are a plain group; either is looked for first in the lines
  17049 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  17050 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  17051 |  * role, name, state, and the value after the colon. The AFTER capture is
  17052 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  17053 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  17054 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  17055 |  * as it settled, routed to the record and re-rendered the row, and the
  17056 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  17057 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  17058 |  * An earlier cut of this
  17059 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  17060 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  17061 |  * passed on any visible Project combobox whatever it showed. Polled for
  17062 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  17063 |  * once, so the artifact is the more patient of the two, never the looser.
  17064 |  *
  17065 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  17066 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  17067 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  17068 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  17069 |  * step body, which remembers it for the steps that were going to act inside.
  17070 |  */
  17071 | async function expectChanges(
  17072 |   page: Page,
  17073 |   recorded: string[],
  17074 |   p: Record<string, string>,
  17075 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  17076 |   linesBefore: string[] | null,
  17077 |   dialect: LineDialect = 1,
  17078 |   linesAfter: string[] | null = null,
  17079 | ): Promise<ChangeVerdict> {
  17080 |   let last: ChangeVerdict = { warnings: [] };
  17081 |   await expect
  17082 |     .poll(
  17083 |       async () => {
  17084 |         last = await expectedChangesVerdict(recorded, p, ctx, {
  17085 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  17086 |           live: (look) => captureLines(page, dialect, look),
  17087 |         });
  17088 |         return last.stop ?? null;
  17089 |       },
  17090 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  17091 |     )
> 17092 |     .toBeNull();
        |      ^ Error: 01-signin s_5fccd8/2: the recorded page change did not appear
  17093 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  17094 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  17095 |   return last;
  17096 | }
  17097 | 
  17098 | /**
  17099 |  * Is this step one that was going to act inside a dialog that did not open?
  17100 |  *
  17101 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, while a recorded dialog is
  17102 |  * absent (see ChangeVerdict.absentDialog): a step whose target cannot be
  17103 |  * found AND which names one of that dialog's own controls — namesDialogControl,
  17104 |  * the shared rule, proven against the dialog's recorded subtree — is skipped as
  17105 |  * belonging to it. A step that resolves its target, or misses without naming
  17106 |  * anything the dialog listed, is the procedure's own and runs (and fails) as
  17107 |  * such; the caller clears the remembered dialog either way. A minting step is
  17108 |  * never skipped, because skipping a mutation cannot be undone: the caller
  17109 |  * emits none of this for one. The one look at the candidates here is what
  17110 |  * replay's resolve window becomes on a page `settle` has already let go quiet.
  17111 |  */
  17112 | async function absentDialogSkip(
  17113 |   candidates: Locator[],
  17114 |   locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>,
  17115 |   dialog: { name: string; lines: string[] },
  17116 |   p: Record<string, string>,
  17117 |   where: string,
  17118 | ): Promise<boolean> {
  17119 |   const inside = namesDialogControl({ locators }, dialog.lines, p);
  17120 |   if (inside === null) return false;
  17121 |   for (const candidate of candidates) if ((await candidate.count().catch(() => 0)) > 0) return false;
  17122 |   console.log(`[sitelooper skip] ${where}: acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(dialog.name)}, which did not open — skipped`);
  17123 |   return true;
  17124 | }
  17125 | 
  17126 | /**
  17127 |  * Is this step a dismissal of a dialog that is not open — already in effect?
  17128 |  *
  17129 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, on a target that did not
  17130 |  * resolve in its window: a step recorded closing a dialog (and doing nothing
  17131 |  * else) whose dialog is not on the page is skipped — the shared
  17132 |  * dismissalAlreadyInEffect decides, over the same recorded removals and a
  17133 |  * look in the step's dialect. Replay asks after its resolve window, so this
  17134 |  * waits the same window for a VISIBLE target first (a modal library keeps a
  17135 |  * closed dialog, Close button and all, hidden in the DOM): a target that
  17136 |  * shows up is acted on by the pick below as usual, and a false return leaves
  17137 |  * that pick to report the miss exactly as it would have.
  17138 |  */
  17139 | async function dismissalSkip(
  17140 |   page: Page,
  17141 |   candidates: Locator[],
  17142 |   step: { locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>; expect: { removedContains: string[] } },
  17143 |   p: Record<string, string>,
  17144 |   where: string,
  17145 |   dialect: LineDialect = 1,
  17146 | ): Promise<boolean> {
  17147 |   for (let waited = 0; ; waited += RESOLVE_POLL_MS) {
  17148 |     for (const candidate of candidates) {
  17149 |       const n = await candidate.count().catch(() => 0);
  17150 |       for (let i = 0; i < Math.min(n, 5); i++) if (await candidate.nth(i).isVisible().catch(() => false)) return false;
  17151 |     }
  17152 |     if (waited >= RESOLVE_WAIT_MS) break;
  17153 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  17154 |   }
  17155 |   const done = dismissalAlreadyInEffect(step, await captureLines(page, dialect), p);
  17156 |   if (!done) return false;
  17157 |   console.log(`[sitelooper skip] ${where}: closes the dialog ${JSON.stringify(done.dialog)} with ${JSON.stringify(done.control)}, which is not open — already in effect`);
  17158 |   return true;
  17159 | }
  17160 | 
  17161 | /**
  17162 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  17163 |  * after its targets resolve: a click whose identifying rungs ALL missed
  17164 |  * (`hit` positional, or null when nothing resolved) is — the shared
  17165 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  17166 |  * every line it was recorded adding already shows (`lines`, the shared
  17167 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  17168 |  * stopped when a positional rung took it onto an element without the
  17169 |  * recorded accessible name. True means skipped; a stop throws.
  17170 |  */
  17171 | async function positionalClick(
  17172 |   page: Page,
  17173 |   hit: Resolution | null,
  17174 |   identifying: number[],
  17175 |   points: number[],
  17176 |   lines: string[],
  17177 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  17178 |   p: Record<string, string>,
  17179 |   where: string,
  17180 |   dialect: LineDialect = 1,
  17181 | ): Promise<boolean> {
  17182 |   const verdict = await positionalClickVerdict(
  17183 |     page,
  17184 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  17185 |     identifying,
  17186 |     lines,
  17187 |     want,
  17188 |     p,
  17189 |     dialect,
  17190 |   );
  17191 |   if (verdict && 'skip' in verdict) {
  17192 |     logWarning(`${where}: ${verdict.skip}`);
```