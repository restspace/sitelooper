# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwvk15-cv2.spec.ts >> fwvk15-cv2
- Location: fwvk15-cv2.spec.ts:9:1

# Error details

```
Error: 02-open needs {{01-signin.visible_projects_2}}, and this run never published it (it was published empty). The step that publishes 01-signin.visible_projects_2 read nothing — look above for its `[sitelooper skip]` line (01-signin s_9e6344/2 target), which is where this run diverged. Stopping here instead of passing an empty value into 02-open: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 02-open has run.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner "main navigation" [ref=e3]:
    - link [ref=e4] [cursor=pointer]:
      - /url: /
      - img [ref=e6]
    - button "Hide the menu" [ref=e19] [cursor=pointer]
    - generic [ref=e20]:
      - button "Open the search/quick action bar" [ref=e21] [cursor=pointer]:
        - img [ref=e22]
      - button [ref=e25] [cursor=pointer]:
        - img [ref=e26]
      - button "admin" [ref=e29] [cursor=pointer]:
        - generic [ref=e30]: admin
        - img [ref=e32]
  - generic [ref=e35]:
    - complementary [ref=e37]:
      - navigation [ref=e38]:
        - list [ref=e39]:
          - listitem [ref=e40]:
            - link "Overview" [ref=e41] [cursor=pointer]:
              - /url: /
              - img [ref=e43]
              - text: Overview
          - listitem [ref=e45]:
            - link "Upcoming" [ref=e46] [cursor=pointer]:
              - /url: /tasks/by/upcoming
              - img [ref=e48]
              - text: Upcoming
          - listitem [ref=e50]:
            - link "Projects" [ref=e51] [cursor=pointer]:
              - /url: /projects
              - img [ref=e53]
              - text: Projects
          - listitem [ref=e55]:
            - link "Labels" [ref=e56] [cursor=pointer]:
              - /url: /labels
              - img [ref=e58]
              - text: Labels
          - listitem [ref=e60]:
            - link "Teams" [ref=e61] [cursor=pointer]:
              - /url: /teams
              - img [ref=e63]
              - text: Teams
      - navigation [ref=e65]:
        - list
      - navigation [ref=e66]:
        - list
      - navigation [ref=e67]:
        - list [ref=e68]:
          - listitem [ref=e69]:
            - generic [ref=e70]:
              - link "Inbox" [ref=e71] [cursor=pointer]:
                - /url: /projects/1
                - img [ref=e74]
                - generic [ref=e76]: Inbox
              - button [ref=e77] [cursor=pointer]:
                - img [ref=e78]
              - button [ref=e81] [cursor=pointer]:
                - img [ref=e82]
            - list
          - listitem [ref=e84]:
            - generic [ref=e85]:
              - link "Bench Project" [ref=e86] [cursor=pointer]:
                - /url: /projects/2
                - img [ref=e89]
                - generic [ref=e91]: Bench Project
              - button [ref=e92] [cursor=pointer]:
                - img [ref=e93]
              - button [ref=e96] [cursor=pointer]:
                - img [ref=e97]
            - list
      - link "Powered by Vikunja" [ref=e99] [cursor=pointer]:
        - /url: https://vikunja.io
    - main [ref=e100]:
      - generic [ref=e101]:
        - heading "Hi admin!" [level=2] [ref=e102]
        - generic [ref=e104]:
          - paragraph [ref=e105]:
            - textbox "Add a task…" [ref=e106]
            - generic:
              - img
            - button "Use magic prefixes to define due dates, assignees and other task properties." [ref=e107] [cursor=pointer]:
              - img [ref=e108]
          - paragraph [ref=e110]:
            - button "Add" [disabled] [ref=e111]:
              - img [ref=e113]
              - generic [ref=e115]: Add
        - generic [ref=e116]:
          - heading "Current Tasks" [level=3] [ref=e117]
          - generic [ref=e121]:
            - generic [ref=e123] [cursor=pointer]:
              - generic [ref=e125]:
                - checkbox [ref=e126]
                - img [ref=e127]
              - generic [ref=e131]:
                - link "Bench Project" [ref=e132]:
                  - /url: /projects/2
                - 'link "Seed: ship repaired device" [ref=e133]':
                  - /url: /tasks/27
              - button [ref=e134]:
                - img [ref=e135]
            - generic [ref=e138] [cursor=pointer]:
              - generic [ref=e140]:
                - checkbox [ref=e141]
                - img [ref=e142]
              - generic [ref=e146]:
                - link "Bench Project" [ref=e147]:
                  - /url: /projects/2
                - 'link "Seed: order missing parts" [ref=e148]':
                  - /url: /tasks/2
              - button [ref=e149]:
                - img [ref=e150]
            - generic [ref=e153] [cursor=pointer]:
              - generic [ref=e155]:
                - checkbox [ref=e156]
                - img [ref=e157]
              - generic [ref=e161]:
                - link "Bench Project" [ref=e162]:
                  - /url: /projects/2
                - 'link "Seed: triage inbox" [ref=e163]':
                  - /url: /tasks/1
              - button [ref=e164]:
                - img [ref=e165]
      - button [ref=e167] [cursor=pointer]:
        - img [ref=e168]
```

# Test source

```ts
  13697 |  * and none of the three recorded ways of naming it resolved inside the
  13698 |  * resolve window — one lost value, and the run reported as a broken procedure.
  13699 |  *
  13700 |  * So: the resolution and the read together, and on any failure one grep-able
  13701 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  13702 |  * are left exactly as they were — the emptiness is the honest report.
  13703 |  *
  13704 |  * The rules are not restated here. WHEN the resolution is asked (once, then
  13705 |  * after one sweep of the page once more with no wait) is the shared
  13706 |  * resolveForRead; taking the read, flattening it and turning its error into
  13707 |  * a skip is the shared takeRead (src/execution/observe.ts, embedded).
  13708 |  * Replay's runOneStep calls the same two; this adapter only says what it did.
  13709 |  */
  13710 | async function readOptional(
  13711 |   page: Page,
  13712 |   candidates: CandidateObservation[],
  13713 |   where: string,
  13714 |   policy: ResolvePolicy,
  13715 |   read: (loc: Locator) => Promise<unknown>,
  13716 |   opts: {
  13717 |     drift?: string[];
  13718 |     resolved?: { into: string[]; key: string; check?: () => void };
  13719 |     count?: { root: { locator(selector: string, options?: { hasText?: string | RegExp }): Locator }; scopes: CountScope[] | null };
  13720 |     kinds?: RecordedKind[];
  13721 |     label?: string;
  13722 |   } = {},
  13723 | ): Promise<string> {
  13724 |   lastReadHit = null;
  13725 |   const hit = await resolveForRead(page, (again) => resolveTarget(page, candidates, where, again ? { ...policy, waitMs: 0 } : policy, opts));
  13726 |   // A COUNT read (opts.count) that resolved nothing on a settled page with
  13727 |   // its scope on it observed "0", as replay publishes it (the shared
  13728 |   // countedNothing, fwrd88 05-change); anything else still skips.
  13729 |   if (!hit && opts.count && (await countedNothing(page, opts.count.root, candidates, opts.count.scopes))) return '0';
  13730 |   if (!hit) {
  13731 |     skippedReads.push(where);
  13732 |     console.log(`[sitelooper skip] ${where}: read target not found — value left empty`);
  13733 |     return '';
  13734 |   }
  13735 |   // A positional fallback standing in for a better candidate that missed reads
  13736 |   // what the recording read only if it is the kind of element it read (round 62,
  13737 |   // replay's same check; the artifact never heals, so a fallback is its only case).
  13738 |   if (hit.index > 0 && hit.structural && opts.kinds?.length && (await readsRecordedKind(hit.locator, opts.kinds)) === false) {
  13739 |     skippedReads.push(where);
  13740 |     console.log(`[sitelooper skip] ${where}: ${offRecordReadReason(opts.label ?? '', 'a positional fallback', opts.kinds)}`);
  13741 |     return '';
  13742 |   }
  13743 |   lastReadHit = hit.locator;
  13744 |   const taken = await takeRead(() => read(hit.locator));
  13745 |   if (taken.ok) return taken.value;
  13746 |   // A read proving what the step set did not land fails the step (scopedReadLanded, gitea fwgt12).
  13747 |   if (taken.lost) throw new Error(`${where}: ${taken.message}`);
  13748 |   skippedReads.push(where);
  13749 |   console.log(`[sitelooper skip] ${where}: read errored (${taken.message}) — value left empty`);
  13750 |   return '';
  13751 | }
  13752 | 
  13753 | /**
  13754 |  * A value an earlier step had to publish, taken at the moment the step
  13755 |  * that NEEDS it is handed its arguments.
  13756 |  *
  13757 |  * WHICH REPLAY RULE THIS MIRRORS. The flow runner resolves every {{ref}}
  13758 |  * in a step's instruction and params BEFORE the step runs
  13759 |  * (src/daemon/server.ts:1009-1024) and classifies what it could not fill:
  13760 |  * a reference bound into a slot the pinned procedure actually USES — one a
  13761 |  * recorded step types or locates by, or that names the record the
  13762 |  * procedure must find — is BLOCKING (`ignorableRefs`, src/skills/flow.ts:1083),
  13763 |  * so the zero-model replay is skipped and the step goes to recovery. Only a
  13764 |  * reference no recorded step can be affected by replays as pinned.
  13765 |  * `lookupRef` says it outright: a reference this run did not publish "goes
  13766 |  * to recovery, never to a recorded literal."
  13767 |  *
  13768 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  13769 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  13770 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  13771 |  * that is honest for an observation and fatal for an argument. Empty, a
  13772 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  13773 |  * `known` slot loses the identity it exists to carry, so the blank does not
  13774 |  * merely misreport the run: it does the work to the wrong record.
  13775 |  *
  13776 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  13777 |  * verdict, the browser is at rest, and nothing of the consuming step has
  13778 |  * run when this throws.
  13779 |  *
  13780 |  * What it says about the LOG is checked against the log (skippedReads): an
  13781 |  * unpublished reference whose producing step never skipped a read has a
  13782 |  * different cause and a different fix, and pointing at a line that was
  13783 |  * never printed costs a diagnosis (grafana fwgr47).
  13784 |  */
  13785 | function need(outputs: Outputs, ref: string, by: string): string {
  13786 |   const value = outputs[ref as keyof Outputs];
  13787 |   if (value === undefined || value === '') {
  13788 |     const dot = ref.indexOf('.');
  13789 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  13790 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  13791 |     const trail = skips.length
  13792 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  13793 |         ` (${skips[0]}), which is where this run diverged.`
  13794 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  13795 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  13796 |         ` this value, rather than re-recording a read that may be working.`;
> 13797 |     throw new Error(
        |           ^ Error: 02-open needs {{01-signin.visible_projects_2}}, and this run never published it (it was published empty). The step that publishes 01-signin.visible_projects_2 read nothing — look above for its `[sitelooper skip]` line (01-signin s_9e6344/2 target), which is where this run diverged. Stopping here instead of passing an empty value into 02-open: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 02-open has run.
  13798 |       `${by} needs {{${ref}}}, and this run never published it` +
  13799 |         (value === '' ? ' (it was published empty)' : '') +
  13800 |         `. ${trail}` +
  13801 |         ` Stopping here instead of passing an empty value into ${by}:` +
  13802 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  13803 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  13804 |         ` earlier steps did stands; nothing of ${by} has run.`,
  13805 |     );
  13806 |   }
  13807 |   return value;
  13808 | }
  13809 | 
  13810 | /**
  13811 |  * Is this step's work already DONE on the record it names?
  13812 |  *
  13813 |  * WHICH REPLAY RULE THIS MIRRORS. `goalSatisfied` (src/skills/replay.ts),
  13814 |  * asked of the SAME observation in the same dialect: one capture of the
  13815 |  * page's snapshot lines (capturePageLines — role, name, state and the value
  13816 |  * after the colon, so a marker that is only an <input>'s VALUE on a form in
  13817 |  * edit mode is seen, where `getByText` never could: cloud run sp5odb died on
  13818 |  * exactly that), read by lineShows. Two halves, and both are load-bearing.
  13819 |  * The IDENTITY texts say the page is showing THIS record — the url and the
  13820 |  * page shape only ever say "a page of this template" — and take the bounded
  13821 |  * rule (`whole`: `fwgr25-n1` is not satisfied by `fwgr25-n10`); the GOAL
  13822 |  * texts say that record is already in the state this step exists to
  13823 |  * produce, and are a plain substring, exactly as goalSatisfied splits them.
  13824 |  * Identity alone would skip a step because the right record is open; a goal
  13825 |  * alone would skip it because some OTHER record happens to read "Cancelled".
  13826 |  *
  13827 |  * Both halves being on the PAGE is not enough, which is why the record-scope
  13828 |  * check follows (scopeCheckInPage, the daemon's own, run in the page): on a
  13829 |  * list, "Order A" and "Cancelled" are both present when it is order B that
  13830 |  * was cancelled. They have to hold of the same record.
  13831 |  *
  13832 |  * Conservative by construction: no goal, no identity, or a page that cannot
  13833 |  * be read — or a look that could not cover it (captureLines, dialect 2: a
  13834 |  * cap reached, a visible frame unread, a virtualised list) — is never
  13835 |  * satisfied. Being wrong the other way costs one re-run of a step that had
  13836 |  * already happened; being wrong THIS way skips work that never happened.
  13837 |  */
  13838 | async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {
  13839 |   if (!identity.length || !goal.length) return false;
  13840 |   const captured = await captureLines(page, 2);
  13841 |   if (!captured || !captured.complete) return false;
  13842 |   const lines = captured.lines;
  13843 |   for (const want of identity) {
  13844 |     if (!lineShows(lines, [want], { whole: true })) return false;
  13845 |   }
  13846 |   for (const want of goal) {
  13847 |     if (!lineShows(lines, [want])) return false;
  13848 |   }
  13849 |   try {
  13850 |     // The identity half goes in as regex SOURCE: scopeCheckInPage is
  13851 |     // serialised into the page, so it cannot call identityRe there.
  13852 |     return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });
  13853 |   } catch {
  13854 |     // A page that cannot be evaluated has proven nothing. Run the step.
  13855 |     return false;
  13856 |   }
  13857 | }
  13858 | 
  13859 | /**
  13860 |  * How long a recorded page change has to appear: Playwright's own expect
  13861 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  13862 |  */
  13863 | const EXPECT_WAIT_MS = 5_000;
  13864 | 
  13865 | /**
  13866 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  13867 |  *
  13868 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  13869 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  13870 |  * function, not a reading of it. The lines carrying this run's own values are
  13871 |  * HARD, the rest are a plain group; either is looked for first in the lines
  13872 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  13873 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  13874 |  * role, name, state, and the value after the colon. The AFTER capture is
  13875 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  13876 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  13877 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  13878 |  * as it settled, routed to the record and re-rendered the row, and the
  13879 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  13880 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  13881 |  * An earlier cut of this
  13882 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  13883 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  13884 |  * passed on any visible Project combobox whatever it showed. Polled for
  13885 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  13886 |  * once, so the artifact is the more patient of the two, never the looser.
  13887 |  *
  13888 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  13889 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  13890 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  13891 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  13892 |  * step body, which remembers it for the steps that were going to act inside.
  13893 |  */
  13894 | async function expectChanges(
  13895 |   page: Page,
  13896 |   recorded: string[],
  13897 |   p: Record<string, string>,
```