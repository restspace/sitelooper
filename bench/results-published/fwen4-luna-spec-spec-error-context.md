# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwen4-luna.spec.ts >> fwen4-luna
- Location: fwen4-luna.spec.ts:9:1

# Error details

```
Error: 02-find s_1e98e5/4: the recorded page change did not appear

02-find s_1e98e5/4: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 02-find s_1e98e5/4 the page did not show \"- link \\\"Seed: Cobalt Retail\\\"\" / \"- link \\\"Seed: Beacon Supplies\\\"\" / \"- link \\\"Seed: Alpha Traders\\\"\" as it did when recorded — the step ran but probably acted on the wrong element"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - navigation [ref=e4]:
      - generic [ref=e5]:
        - link "App Logo" [ref=e6] [cursor=pointer]:
          - /url: /app
          - img "App Logo" [ref=e7]
        - list [ref=e8]:
          - listitem [ref=e9]:
            - link "Selling" [ref=e10] [cursor=pointer]:
              - /url: /app/selling
          - listitem [ref=e11]:
            - link "Sales Order" [ref=e12] [cursor=pointer]:
              - /url: /app/sales-order
        - generic [ref=e13]:
          - search [ref=e14]:
            - generic [ref=e15]:
              - combobox "Search or type a command (Ctrl + G)" [ref=e17]
              - img [ref=e19]
          - list [ref=e21]:
            - listitem [ref=e22]:
              - button "No new notifications" [ref=e23] [cursor=pointer]:
                - generic [ref=e24]:
                  - generic [ref=e25]: No new notifications
                  - img [ref=e26]
            - listitem [ref=e28]
            - listitem [ref=e29]:
              - button "Help Dropdown" [ref=e30] [cursor=pointer]:
                - generic [ref=e31]:
                  - text: Help
                  - img [ref=e32]
            - listitem [ref=e34]:
              - button "User Menu" [ref=e35] [cursor=pointer]:
                - generic "Administrator" [ref=e36]:
                  - generic "Administrator" [ref=e37]: A
    - generic [ref=e39]:
      - generic [ref=e42]:
        - generic [ref=e43]:
          - button "Toggle Sidebar" [ref=e44] [cursor=pointer]:
            - img [ref=e45]
          - heading "Sales Order" [level=3] [ref=e50] [cursor=pointer]
        - generic [ref=e52]:
          - button "List View" [ref=e55] [cursor=pointer]:
            - generic [ref=e56]:
              - img [ref=e57]
              - generic [ref=e59]: List View
              - img [ref=e60]
          - generic [ref=e62]:
            - button [ref=e64] [cursor=pointer]:
              - img [ref=e65]
            - button "Menu" [ref=e68] [cursor=pointer]:
              - img [ref=e71]
            - button "Add Sales Order" [ref=e72] [cursor=pointer]:
              - img [ref=e73]
              - generic [ref=e76]: Add Sales Order
      - generic [ref=e80]:
        - list [ref=e83]:
          - generic [ref=e84]:
            - listitem [ref=e85]: Filter By
            - generic [ref=e86]:
              - generic [ref=e87]:
                - listitem [ref=e88]:
                  - link "Assigned To" [ref=e89] [cursor=pointer]:
                    - /url: "#"
                    - generic [ref=e90]: Assigned To
                    - img [ref=e92]
                - listitem [ref=e94]:
                  - link "Created By" [ref=e95] [cursor=pointer]:
                    - /url: "#"
                    - generic [ref=e96]: Created By
                    - img [ref=e98]
              - listitem [ref=e100]: Edit Filters
            - generic [ref=e101]:
              - listitem [ref=e102]:
                - link "Tags" [ref=e103] [cursor=pointer]:
                  - /url: "#"
                  - generic [ref=e104]: Tags
                  - img [ref=e106]
              - listitem [ref=e108]: Show Tags
          - generic [ref=e109]:
            - listitem [ref=e110]: Save Filter
            - listitem [ref=e111]:
              - listitem [ref=e112]:
                - generic [ref=e113]:
                  - generic [ref=e115]:
                    - textbox "Filter Name" [ref=e117]
                    - paragraph
                  - generic: undefined
              - listitem
        - generic [ref=e119]:
          - generic [ref=e120]:
            - generic [ref=e121]:
              - generic [ref=e122]:
                - textbox "ID" [ref=e123]
                - generic: name
              - generic [ref=e124]:
                - generic [ref=e126]:
                  - combobox "Customer" [ref=e127]
                  - status [ref=e128]: Begin typing for results.
                - generic: customer
              - generic [ref=e129]:
                - textbox "Customer Name" [ref=e130]: Seed
                - generic: customer_name
              - generic [ref=e131]:
                - textbox "Date" [ref=e132]
                - generic: transaction_date
              - generic [ref=e133]:
                - generic [ref=e135]:
                  - combobox "Company" [ref=e136]
                  - status [ref=e137]: Begin typing for results.
                - generic: company
              - generic [ref=e138]:
                - combobox [ref=e139]:
                  - option [selected]
                  - option "Not Delivered"
                  - option "Fully Delivered"
                  - option "Partly Delivered"
                  - option "Closed"
                  - option "Not Applicable"
                - generic: delivery_status
                - generic:
                  - img
                - generic: Delivery Status
              - generic [ref=e140]:
                - combobox [ref=e141]:
                  - option [selected]
                  - option "Not Billed"
                  - option "Fully Billed"
                  - option "Partly Billed"
                  - option "Closed"
                - generic: billing_status
                - generic:
                  - img
                - generic: Billing Status
            - generic [ref=e142]:
              - generic [ref=e144]:
                - button "Filter" [active] [ref=e145] [cursor=pointer]:
                  - img [ref=e147]
                  - text: Filter
                - button "Clear all filters" [ref=e149] [cursor=pointer]:
                  - img [ref=e151]
              - generic [ref=e154]:
                - button "descending" [ref=e155] [cursor=pointer]:
                  - img [ref=e157]
                - button "Last Updated On" [ref=e159] [cursor=pointer]
          - generic [ref=e160]:
            - generic [ref=e163]:
              - img "Generic Empty State" [ref=e165]
              - paragraph [ref=e166]: No Sales Order found with matching filters. Clear filters to see all Sales Order.
              - paragraph [ref=e167]:
                - button "Create a new Sales Order" [ref=e168] [cursor=pointer]
            - generic [ref=e171]:
              - button "20" [ref=e172] [cursor=pointer]
              - button "100" [ref=e173] [cursor=pointer]
              - button "500" [ref=e174] [cursor=pointer]
              - button "2500" [ref=e175] [cursor=pointer]
    - contentinfo
  - generic [ref=e176]:
    - navigation [ref=e178]:
      - img [ref=e180] [cursor=pointer]
      - generic [ref=e182] [cursor=pointer]:
        - text: October,
        - generic [ref=e183]: "2026"
      - img [ref=e185] [cursor=pointer]
    - generic [ref=e188]:
      - generic [ref=e189]:
        - generic [ref=e190]: Su
        - generic [ref=e191]: Mo
        - generic [ref=e192]: Tu
        - generic [ref=e193]: We
        - generic [ref=e194]: Th
        - generic [ref=e195]: Fr
        - generic [ref=e196]: Sa
      - generic [ref=e197]:
        - generic [ref=e198] [cursor=pointer]: "27"
        - generic [ref=e199] [cursor=pointer]: "28"
        - generic [ref=e200] [cursor=pointer]: "29"
        - generic [ref=e201] [cursor=pointer]: "30"
        - generic [ref=e202] [cursor=pointer]: "1"
        - generic [ref=e203] [cursor=pointer]: "2"
        - generic [ref=e204] [cursor=pointer]: "3"
        - generic [ref=e205] [cursor=pointer]: "4"
        - generic [ref=e206] [cursor=pointer]: "5"
        - generic [ref=e207] [cursor=pointer]: "6"
        - generic [ref=e208] [cursor=pointer]: "7"
        - generic [ref=e209] [cursor=pointer]: "8"
        - generic [ref=e210] [cursor=pointer]: "9"
        - generic [ref=e211] [cursor=pointer]: "10"
        - generic [ref=e212] [cursor=pointer]: "11"
        - generic [ref=e213] [cursor=pointer]: "12"
        - generic [ref=e214] [cursor=pointer]: "13"
        - generic [ref=e215] [cursor=pointer]: "14"
        - generic [ref=e216] [cursor=pointer]: "15"
        - generic [ref=e217] [cursor=pointer]: "16"
        - generic [ref=e218] [cursor=pointer]: "17"
        - generic [ref=e219] [cursor=pointer]: "18"
        - generic [ref=e220] [cursor=pointer]: "19"
        - generic [ref=e221] [cursor=pointer]: "20"
        - generic [ref=e222] [cursor=pointer]: "21"
        - generic [ref=e223] [cursor=pointer]: "22"
        - generic [ref=e224] [cursor=pointer]: "23"
        - generic [ref=e225] [cursor=pointer]: "24"
        - generic [ref=e226] [cursor=pointer]: "25"
        - generic [ref=e227] [cursor=pointer]: "26"
        - generic [ref=e228] [cursor=pointer]: "27"
        - generic [ref=e229] [cursor=pointer]: "28"
        - generic [ref=e230] [cursor=pointer]: "29"
        - generic [ref=e231] [cursor=pointer]: "30"
        - generic [ref=e232] [cursor=pointer]: "31"
    - generic [ref=e234] [cursor=pointer]: Today
  - generic [ref=e238]:
    - generic [ref=e241]:
      - generic [ref=e243]:
        - combobox [ref=e244]: ID
        - status [ref=e245]: Begin typing for results.
      - combobox [ref=e247]:
        - option "Equals" [selected]
        - option "Not Equals"
        - option "Like"
        - option "Not Like"
        - option "In"
        - option "Not In"
        - option "Is"
      - generic [ref=e250]:
        - generic [ref=e252]:
          - combobox [ref=e253]
          - status [ref=e254]: Begin typing for results.
        - generic: name
      - img [ref=e256] [cursor=pointer]
    - separator [ref=e258]
    - generic [ref=e259]:
      - button "+ Add a Filter" [ref=e260] [cursor=pointer]
      - generic [ref=e261]:
        - button "Clear Filters" [ref=e262] [cursor=pointer]
        - button "Apply Filters" [ref=e263] [cursor=pointer]
```

# Test source

```ts
  16740 |  * page's snapshot lines (capturePageLines — role, name, state and the value
  16741 |  * after the colon, so a marker that is only an <input>'s VALUE on a form in
  16742 |  * edit mode is seen, where `getByText` never could: cloud run sp5odb died on
  16743 |  * exactly that), read by lineShows. Two halves, and both are load-bearing.
  16744 |  * The IDENTITY texts say the page is showing THIS record — the url and the
  16745 |  * page shape only ever say "a page of this template" — and take the bounded
  16746 |  * rule (`whole`: `fwgr25-n1` is not satisfied by `fwgr25-n10`); the GOAL
  16747 |  * texts say that record is already in the state this step exists to
  16748 |  * produce, and are a plain substring, exactly as goalSatisfied splits them.
  16749 |  * Identity alone would skip a step because the right record is open; a goal
  16750 |  * alone would skip it because some OTHER record happens to read "Cancelled".
  16751 |  *
  16752 |  * Both halves being on the PAGE is not enough, which is why the record-scope
  16753 |  * check follows (scopeCheckInPage, the daemon's own, run in the page): on a
  16754 |  * list, "Order A" and "Cancelled" are both present when it is order B that
  16755 |  * was cancelled. They have to hold of the same record.
  16756 |  *
  16757 |  * Conservative by construction: no goal, no identity, or a page that cannot
  16758 |  * be read — or a look that could not cover it (captureLines, dialect 2: a
  16759 |  * cap reached, a visible frame unread, a virtualised list) — is never
  16760 |  * satisfied. Being wrong the other way costs one re-run of a step that had
  16761 |  * already happened; being wrong THIS way skips work that never happened.
  16762 |  */
  16763 | async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {
  16764 |   if (!identity.length || !goal.length) return false;
  16765 |   const captured = await captureLines(page, 2);
  16766 |   if (!captured || !captured.complete) return false;
  16767 |   const lines = captured.lines;
  16768 |   for (const want of identity) {
  16769 |     if (!lineShows(lines, [want], { whole: true })) return false;
  16770 |   }
  16771 |   for (const want of goal) {
  16772 |     if (!lineShows(lines, [want])) return false;
  16773 |   }
  16774 |   try {
  16775 |     // The identity half goes in as regex SOURCE: scopeCheckInPage is
  16776 |     // serialised into the page, so it cannot call identityRe there.
  16777 |     return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });
  16778 |   } catch {
  16779 |     // A page that cannot be evaluated has proven nothing. Run the step.
  16780 |     return false;
  16781 |   }
  16782 | }
  16783 | 
  16784 | /**
  16785 |  * How long a recorded page change has to appear: Playwright's own expect
  16786 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  16787 |  */
  16788 | const EXPECT_WAIT_MS = 5_000;
  16789 | 
  16790 | /**
  16791 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  16792 |  *
  16793 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  16794 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  16795 |  * function, not a reading of it. The lines carrying this run's own values are
  16796 |  * HARD, the rest are a plain group; either is looked for first in the lines
  16797 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  16798 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  16799 |  * role, name, state, and the value after the colon. The AFTER capture is
  16800 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  16801 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  16802 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  16803 |  * as it settled, routed to the record and re-rendered the row, and the
  16804 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  16805 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  16806 |  * An earlier cut of this
  16807 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  16808 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  16809 |  * passed on any visible Project combobox whatever it showed. Polled for
  16810 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  16811 |  * once, so the artifact is the more patient of the two, never the looser.
  16812 |  *
  16813 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  16814 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  16815 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  16816 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  16817 |  * step body, which remembers it for the steps that were going to act inside.
  16818 |  */
  16819 | async function expectChanges(
  16820 |   page: Page,
  16821 |   recorded: string[],
  16822 |   p: Record<string, string>,
  16823 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean; leftByLink?: boolean },
  16824 |   linesBefore: string[] | null,
  16825 |   dialect: LineDialect = 1,
  16826 |   linesAfter: string[] | null = null,
  16827 | ): Promise<ChangeVerdict> {
  16828 |   let last: ChangeVerdict = { warnings: [] };
  16829 |   await expect
  16830 |     .poll(
  16831 |       async () => {
  16832 |         last = await expectedChangesVerdict(recorded, p, { ...ctx, counters: counterNames(siteFactsAt(page.url()), page.url()) }, {
  16833 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  16834 |           live: (look) => captureLines(page, dialect, look),
  16835 |         });
  16836 |         return last.stop ?? null;
  16837 |       },
  16838 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  16839 |     )
> 16840 |     .toBeNull();
        |      ^ Error: 02-find s_1e98e5/4: the recorded page change did not appear
  16841 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  16842 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  16843 |   return last;
  16844 | }
  16845 | 
  16846 | /**
  16847 |  * Is this step one that was going to act inside a dialog that did not open?
  16848 |  *
  16849 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, while a recorded dialog is
  16850 |  * absent (see ChangeVerdict.absentDialog): a step whose target cannot be
  16851 |  * found AND which names one of that dialog's own controls — namesDialogControl,
  16852 |  * the shared rule, proven against the dialog's recorded subtree — is skipped as
  16853 |  * belonging to it. A step that resolves its target, or misses without naming
  16854 |  * anything the dialog listed, is the procedure's own and runs (and fails) as
  16855 |  * such; the caller clears the remembered dialog either way. A minting step is
  16856 |  * never skipped, because skipping a mutation cannot be undone: the caller
  16857 |  * emits none of this for one. The one look at the candidates here is what
  16858 |  * replay's resolve window becomes on a page `settle` has already let go quiet.
  16859 |  */
  16860 | async function absentDialogSkip(
  16861 |   candidates: Locator[],
  16862 |   locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>,
  16863 |   dialog: { name: string; lines: string[] },
  16864 |   p: Record<string, string>,
  16865 |   where: string,
  16866 | ): Promise<boolean> {
  16867 |   const inside = namesDialogControl({ locators }, dialog.lines, p);
  16868 |   if (inside === null) return false;
  16869 |   for (const candidate of candidates) if ((await candidate.count().catch(() => 0)) > 0) return false;
  16870 |   console.log(`[sitelooper skip] ${where}: acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(dialog.name)}, which did not open — skipped`);
  16871 |   return true;
  16872 | }
  16873 | 
  16874 | /**
  16875 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  16876 |  * after its targets resolve: a click whose identifying rungs ALL missed
  16877 |  * (`hit` positional, or null when nothing resolved) is — the shared
  16878 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  16879 |  * every line it was recorded adding already shows (`lines`, the shared
  16880 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  16881 |  * stopped when a positional rung took it onto an element without the
  16882 |  * recorded accessible name. True means skipped; a stop throws.
  16883 |  */
  16884 | async function positionalClick(
  16885 |   page: Page,
  16886 |   hit: Resolution | null,
  16887 |   identifying: number[],
  16888 |   points: number[],
  16889 |   lines: string[],
  16890 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  16891 |   p: Record<string, string>,
  16892 |   where: string,
  16893 |   dialect: LineDialect = 1,
  16894 | ): Promise<boolean> {
  16895 |   const verdict = await positionalClickVerdict(
  16896 |     page,
  16897 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  16898 |     identifying,
  16899 |     lines,
  16900 |     want,
  16901 |     p,
  16902 |     dialect,
  16903 |   );
  16904 |   if (verdict && 'skip' in verdict) {
  16905 |     logWarning(`${where}: ${verdict.skip}`);
  16906 |     return true;
  16907 |   }
  16908 |   if (verdict && 'stop' in verdict) throw new Error(`${where}: ${verdict.stop}`);
  16909 |   return false;
  16910 | }
  16911 | 
  16912 | function validateInputs(vars: Vars): void {
  16913 |   const missing: string[] = [];
  16914 |   if (typeof vars['runid'] !== 'string' || !vars['runid'].trim()) missing.push('RUNID');
  16915 |   for (const name of requiredEnvNames) {
  16916 |     if (!process.env[name]?.trim()) missing.push(name);
  16917 |   }
  16918 |   if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${[...new Set(missing)].join(', ')}`);
  16919 | }
  16920 | 
  16921 | export const steps = {
  16922 |   /** Sign in to ERPNext at http://127.0.0.1:8100/ as Administrator using the password exactly as the text {{env:APP_PASSWORD}}; confirm the authenticated app is open. */
  16923 |   async '01-signin'(page: Page, p: { v1: string; v2: string; v3: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {
  16924 |     const typedCommitted = new Set<string>();
  16925 | 
  16926 |     // What this step types, selects or names, across its segments (see echoRead).
  16927 |     const echoLedger = new Set<string>();
  16928 | 
  16929 |     // The urls this step loads, for its report values (a given url it loaded was observed).
  16930 |     const reportTrail = urlTrail(page);
  16931 | 
  16932 |     // s_9dfd89: Sign in to ERPNext at {{v1}} as {{v2}} using the password exactly as the text {{v3}}; confirm the authenticated app is open.
  16933 |     // recorded on a page matching http://127.0.0.1:8100/
  16934 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  16935 |     const volatile1: UrlSegDiff[] = [];
  16936 | 
  16937 |     // @step 01-signin s_9dfd89/1
  16938 |     let urlBefore1 = '';
  16939 |     let alertsBefore1: string[] = [];
  16940 |     let alertsAfter1: ObservedAlerts | null = null;
```