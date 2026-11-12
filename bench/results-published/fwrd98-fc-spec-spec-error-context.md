# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwrd98-fc.spec.ts >> fwrd98-fc
- Location: fwrd98-fc.spec.ts:9:1

# Error details

```
Error: 07-remove needs {{02-create.ticket_reference}}, and this run never published it (it was published empty). No `[sitelooper skip]` line was logged for 02-create on this run, so no read of 02-create.ticket_reference was even attempted: check that 02-create is a step of this flow and that it is the step that publishes this value, rather than re-recording a read that may be working. Stopping here instead of passing an empty value into 07-remove: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 07-remove has run.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=e3]:
    - generic [ref=e4]:
      - link "Repair Desk" [ref=e5] [cursor=pointer]:
        - /url: "#/tickets"
        - generic [ref=e6]: RD
        - generic [ref=e7]: Repair Desk
      - navigation "Main" [ref=e8]:
        - link "Tickets" [ref=e9] [cursor=pointer]:
          - /url: "#/tickets"
      - generic [ref=e10]:
        - generic [ref=e11]: Bench User
        - button "Sign out" [ref=e12] [cursor=pointer]
  - main [ref=e13]:
    - generic [ref=e14]:
      - navigation "Breadcrumb" [ref=e15]:
        - link "Tickets" [ref=e16] [cursor=pointer]:
          - /url: "#/tickets"
        - generic [ref=e17]: /
        - generic [ref=e18]: RD-1018
      - generic [ref=e19]:
        - generic [ref=e20]:
          - paragraph [ref=e21]: RD-1018
          - heading "fwrd98-fc-spec RD Bench Ticket" [level=1] [ref=e22]
          - paragraph [ref=e23]: "Customer: Not recorded · Raised 2026-11-12"
          - paragraph [ref=e24]:
            - generic [ref=e25]: Status
            - generic [ref=e27]: Ready
        - generic [ref=e28]:
          - button "Mark Draft" [ref=e29] [cursor=pointer]
          - button "Mark Closed" [ref=e30] [cursor=pointer]
          - button "Archive ticket" [ref=e31] [cursor=pointer]
      - region "Parts" [ref=e32]:
        - generic [ref=e33]:
          - generic [ref=e34]:
            - heading "Parts" [level=2] [ref=e35]
            - paragraph [ref=e36]: Price is calculated from cost and markup when the part is saved.
          - button "Add part" [ref=e37] [cursor=pointer]
        - table [ref=e39]:
          - rowgroup [ref=e40]:
            - row "Name Cost Markup Qty Supplier Price Actions" [ref=e41]:
              - columnheader "Name" [ref=e42]
              - columnheader "Cost" [ref=e43]
              - columnheader "Markup" [ref=e44]
              - columnheader "Qty" [ref=e45]
              - columnheader "Supplier" [ref=e46]
              - columnheader "Price" [ref=e47]
              - columnheader "Actions" [ref=e48]
          - rowgroup [ref=e49]:
            - row "fwrd98-fc-spec RD Part A $150.00 25% 1 Bench Supplier $187.50 Edit Delete" [ref=e50]:
              - cell "fwrd98-fc-spec RD Part A" [ref=e51]
              - cell "$150.00" [ref=e52]
              - cell "25%" [ref=e53]
              - cell "1" [ref=e54]
              - cell "Bench Supplier" [ref=e55]
              - cell "$187.50" [ref=e56]
              - cell "Edit Delete" [ref=e57]:
                - button "Edit" [ref=e58] [cursor=pointer]
                - button "Delete" [ref=e59] [cursor=pointer]
            - row "fwrd98-fc-spec RD Part B $200.00 25% 1 Bench Supplier $250.00 Edit Delete" [ref=e60]:
              - cell "fwrd98-fc-spec RD Part B" [ref=e61]
              - cell "$200.00" [ref=e62]
              - cell "25%" [ref=e63]
              - cell "1" [ref=e64]
              - cell "Bench Supplier" [ref=e65]
              - cell "$250.00" [ref=e66]
              - cell "Edit Delete" [ref=e67]:
                - button "Edit" [ref=e68] [cursor=pointer]
                - button "Delete" [ref=e69] [cursor=pointer]
          - rowgroup [ref=e70]:
            - row "Total (price × quantity) $437.50" [ref=e71]:
              - rowheader "Total (price × quantity)" [ref=e72]
              - cell "$437.50" [ref=e73]
              - cell [ref=e74]
  - contentinfo [ref=e75]:
    - generic [ref=e76]:
      - paragraph [ref=e77]: Repair Desk — internal workshop tooling. Prices include the configured markup.
      - paragraph [ref=e78]: "Environment: local benchmark instance"
```

# Test source

```ts
  18736 |  * and none of the three recorded ways of naming it resolved inside the
  18737 |  * resolve window — one lost value, and the run reported as a broken procedure.
  18738 |  *
  18739 |  * So: the resolution and the read together, and on any failure one grep-able
  18740 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  18741 |  * are left exactly as they were — the emptiness is the honest report.
  18742 |  *
  18743 |  * The rules are not restated here. WHEN the resolution is asked (once, then
  18744 |  * after one sweep of the page once more with no wait) is the shared
  18745 |  * resolveForRead; taking the read, flattening it and turning its error into
  18746 |  * a skip is the shared takeRead (src/execution/observe.ts, embedded).
  18747 |  * Replay's runOneStep calls the same two; this adapter only says what it did.
  18748 |  */
  18749 | async function readOptional(
  18750 |   page: Page,
  18751 |   candidates: CandidateObservation[],
  18752 |   where: string,
  18753 |   policy: ResolvePolicy,
  18754 |   read: (loc: Locator) => Promise<unknown>,
  18755 |   opts: {
  18756 |     drift?: string[];
  18757 |     resolved?: { into: string[]; key: string; check?: () => void };
  18758 |     count?: { root: { locator(selector: string, options?: { hasText?: string | RegExp }): Locator }; scopes: CountScope[] | null };
  18759 |     kinds?: RecordedKind[];
  18760 |     label?: string;
  18761 |   } = {},
  18762 | ): Promise<string> {
  18763 |   lastReadHit = null;
  18764 |   const hit = await resolveForRead(page, (again) => resolveTarget(page, candidates, where, again ? { ...policy, waitMs: 0 } : policy, opts));
  18765 |   // A COUNT read (opts.count) that resolved nothing on a settled page with
  18766 |   // its scope on it observed "0", as replay publishes it (the shared
  18767 |   // countedNothing, fwrd88 05-change); anything else still skips.
  18768 |   if (!hit && opts.count && (await countedNothing(page, opts.count.root, candidates, opts.count.scopes))) return '0';
  18769 |   if (!hit) {
  18770 |     skippedReads.push(where);
  18771 |     console.log(`[sitelooper skip] ${where}: read target not found — value left empty`);
  18772 |     return '';
  18773 |   }
  18774 |   // A positional fallback standing in for a better candidate that missed reads
  18775 |   // what the recording read only if it is the kind of element it read (round 62,
  18776 |   // replay's same check; the artifact never heals, so a fallback is its only case).
  18777 |   if (hit.index > 0 && hit.structural && opts.kinds?.length && (await readsRecordedKind(hit.locator, opts.kinds)) === false) {
  18778 |     skippedReads.push(where);
  18779 |     console.log(`[sitelooper skip] ${where}: ${offRecordReadReason(opts.label ?? '', 'a positional fallback', opts.kinds)}`);
  18780 |     return '';
  18781 |   }
  18782 |   lastReadHit = hit.locator;
  18783 |   const taken = await takeRead(() => read(hit.locator));
  18784 |   if (taken.ok) return taken.value;
  18785 |   // A read proving what the step set did not land fails the step (scopedReadLanded, gitea fwgt12).
  18786 |   if (taken.lost) throw new Error(`${where}: ${taken.message}`);
  18787 |   skippedReads.push(where);
  18788 |   console.log(`[sitelooper skip] ${where}: read errored (${taken.message}) — value left empty`);
  18789 |   return '';
  18790 | }
  18791 | 
  18792 | /**
  18793 |  * A value an earlier step had to publish, taken at the moment the step
  18794 |  * that NEEDS it is handed its arguments.
  18795 |  *
  18796 |  * WHICH REPLAY RULE THIS MIRRORS. The flow runner resolves every {{ref}}
  18797 |  * in a step's instruction and params BEFORE the step runs
  18798 |  * (src/daemon/server.ts:1009-1024) and classifies what it could not fill:
  18799 |  * a reference bound into a slot the pinned procedure actually USES — one a
  18800 |  * recorded step types or locates by, or that names the record the
  18801 |  * procedure must find — is BLOCKING (`ignorableRefs`, src/skills/flow.ts:1083),
  18802 |  * so the zero-model replay is skipped and the step goes to recovery. Only a
  18803 |  * reference no recorded step can be affected by replays as pinned.
  18804 |  * `lookupRef` says it outright: a reference this run did not publish "goes
  18805 |  * to recovery, never to a recorded literal."
  18806 |  *
  18807 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  18808 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  18809 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  18810 |  * that is honest for an observation and fatal for an argument. Empty, a
  18811 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  18812 |  * `known` slot loses the identity it exists to carry, so the blank does not
  18813 |  * merely misreport the run: it does the work to the wrong record.
  18814 |  *
  18815 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  18816 |  * verdict, the browser is at rest, and nothing of the consuming step has
  18817 |  * run when this throws.
  18818 |  *
  18819 |  * What it says about the LOG is checked against the log (skippedReads): an
  18820 |  * unpublished reference whose producing step never skipped a read has a
  18821 |  * different cause and a different fix, and pointing at a line that was
  18822 |  * never printed costs a diagnosis (grafana fwgr47).
  18823 |  */
  18824 | function need(outputs: Outputs, ref: string, by: string): string {
  18825 |   const value = outputs[ref as keyof Outputs];
  18826 |   if (value === undefined || value === '') {
  18827 |     const dot = ref.indexOf('.');
  18828 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  18829 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  18830 |     const trail = skips.length
  18831 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  18832 |         ` (${skips[0]}), which is where this run diverged.`
  18833 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  18834 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  18835 |         ` this value, rather than re-recording a read that may be working.`;
> 18836 |     throw new Error(
        |           ^ Error: 07-remove needs {{02-create.ticket_reference}}, and this run never published it (it was published empty). No `[sitelooper skip]` line was logged for 02-create on this run, so no read of 02-create.ticket_reference was even attempted: check that 02-create is a step of this flow and that it is the step that publishes this value, rather than re-recording a read that may be working. Stopping here instead of passing an empty value into 07-remove: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 07-remove has run.
  18837 |       `${by} needs {{${ref}}}, and this run never published it` +
  18838 |         (value === '' ? ' (it was published empty)' : '') +
  18839 |         `. ${trail}` +
  18840 |         ` Stopping here instead of passing an empty value into ${by}:` +
  18841 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  18842 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  18843 |         ` earlier steps did stands; nothing of ${by} has run.`,
  18844 |     );
  18845 |   }
  18846 |   return value;
  18847 | }
  18848 | 
  18849 | /**
  18850 |  * Is this step's work already DONE on the record it names?
  18851 |  *
  18852 |  * WHICH REPLAY RULE THIS MIRRORS. `goalSatisfied` (src/skills/replay.ts),
  18853 |  * asked of the SAME observation in the same dialect: one capture of the
  18854 |  * page's snapshot lines (capturePageLines — role, name, state and the value
  18855 |  * after the colon, so a marker that is only an <input>'s VALUE on a form in
  18856 |  * edit mode is seen, where `getByText` never could: cloud run sp5odb died on
  18857 |  * exactly that), read by lineShows. Two halves, and both are load-bearing.
  18858 |  * The IDENTITY texts say the page is showing THIS record — the url and the
  18859 |  * page shape only ever say "a page of this template" — and take the bounded
  18860 |  * rule (`whole`: `fwgr25-n1` is not satisfied by `fwgr25-n10`); the GOAL
  18861 |  * texts say that record is already in the state this step exists to
  18862 |  * produce, and are a plain substring, exactly as goalSatisfied splits them.
  18863 |  * Identity alone would skip a step because the right record is open; a goal
  18864 |  * alone would skip it because some OTHER record happens to read "Cancelled".
  18865 |  *
  18866 |  * Both halves being on the PAGE is not enough, which is why the record-scope
  18867 |  * check follows (scopeCheckInPage, the daemon's own, run in the page): on a
  18868 |  * list, "Order A" and "Cancelled" are both present when it is order B that
  18869 |  * was cancelled. They have to hold of the same record.
  18870 |  *
  18871 |  * Conservative by construction: no goal, no identity, or a page that cannot
  18872 |  * be read — or a look that could not cover it (captureLines, dialect 2: a
  18873 |  * cap reached, a visible frame unread, a virtualised list) — is never
  18874 |  * satisfied. Being wrong the other way costs one re-run of a step that had
  18875 |  * already happened; being wrong THIS way skips work that never happened.
  18876 |  */
  18877 | async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {
  18878 |   if (!identity.length || !goal.length) return false;
  18879 |   const captured = await captureLines(page, 2);
  18880 |   if (!captured || !captured.complete) return false;
  18881 |   const lines = captured.lines;
  18882 |   for (const want of identity) {
  18883 |     if (!lineShows(lines, [want], { whole: true })) return false;
  18884 |   }
  18885 |   for (const want of goal) {
  18886 |     if (!lineShows(lines, [want])) return false;
  18887 |   }
  18888 |   try {
  18889 |     // The identity half goes in as regex SOURCE: scopeCheckInPage is
  18890 |     // serialised into the page, so it cannot call identityRe there.
  18891 |     return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });
  18892 |   } catch {
  18893 |     // A page that cannot be evaluated has proven nothing. Run the step.
  18894 |     return false;
  18895 |   }
  18896 | }
  18897 | 
  18898 | /**
  18899 |  * How long a recorded page change has to appear: Playwright's own expect
  18900 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  18901 |  */
  18902 | const EXPECT_WAIT_MS = 5_000;
  18903 | 
  18904 | /**
  18905 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  18906 |  *
  18907 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  18908 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  18909 |  * function, not a reading of it. The lines carrying this run's own values are
  18910 |  * HARD, the rest are a plain group; either is looked for first in the lines
  18911 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  18912 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  18913 |  * role, name, state, and the value after the colon. The AFTER capture is
  18914 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  18915 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  18916 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  18917 |  * as it settled, routed to the record and re-rendered the row, and the
  18918 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  18919 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  18920 |  * An earlier cut of this
  18921 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  18922 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  18923 |  * passed on any visible Project combobox whatever it showed. Polled for
  18924 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  18925 |  * once, so the artifact is the more patient of the two, never the looser.
  18926 |  *
  18927 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  18928 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  18929 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  18930 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  18931 |  * step body, which remembers it for the steps that were going to act inside.
  18932 |  */
  18933 | async function expectChanges(
  18934 |   page: Page,
  18935 |   recorded: string[],
  18936 |   p: Record<string, string>,
```