# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwsi26.spec.ts >> fwsi26
- Location: fwsi26.spec.ts:9:1

# Error details

```
Error: 04-set needs {{03-create.url.p1}}, and this run never published it (it was published empty). No `[sitelooper skip]` line was logged for 03-create on this run, so no read of 03-create.url.p1 was even attempted: check that 03-create is a step of this flow and that it is the step that publishes this value, rather than re-recording a read that may be working. Stopping here instead of passing an empty value into 04-set: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 04-set has run.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - navigation [ref=e5]:
        - button " Toggle navigation" [ref=e6] [cursor=pointer]:
          - text: 
          - generic [ref=e7]: Toggle navigation
        - link "Bench Assets" [ref=e10] [cursor=pointer]:
          - /url: http://127.0.0.1:8098
        - list [ref=e12]:
          - text: 
          - listitem [ref=e13]:
            - link [ref=e14] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware
              - generic [ref=e15]: 
              - generic [ref=e16]: Assets
          - listitem [ref=e17]:
            - link [ref=e18] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/licenses
              - generic [ref=e19]: 
              - generic [ref=e20]: Licenses
          - listitem [ref=e21]:
            - link [ref=e22] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/accessories
              - generic [ref=e23]: 
              - generic [ref=e24]: Accessories
          - listitem [ref=e25]:
            - link [ref=e26] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/consumables
              - generic [ref=e27]: 
              - generic [ref=e28]: Consumables
          - listitem [ref=e29]:
            - link [ref=e30] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/components
              - generic [ref=e31]: 
              - generic [ref=e32]: Components
          - listitem [ref=e33]:
            - link [ref=e34] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/users
              - generic [ref=e35]: 
              - generic [ref=e36]: Users
          - listitem [ref=e37]:
            - search [ref=e38]:
              - generic [ref=e39]:
                - generic [ref=e40]: Lookup by Asset Tag
                - textbox "Lookup by Asset Tag" [ref=e41]
                - button "Search" [ref=e43] [cursor=pointer]:
                  - generic [ref=e44]: 
                  - generic [ref=e45]: Search
          - listitem [ref=e46]:
            - link [ref=e47] [cursor=pointer]:
              - /url: "#"
              - text: Create New
              - strong [ref=e48]
            - text:      
          - listitem [ref=e49]:
            - link "Alerts" [ref=e50] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e51]: 
              - generic [ref=e52]: Alerts
          - listitem [ref=e53]:
            - link "Bench Admin" [ref=e54] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e55]:
                - text: Bench Admin
                - strong [ref=e56]
            - text:        
          - listitem [ref=e57]:
            - link "Admin Settings" [ref=e58] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/admin
              - generic [ref=e59]: 
              - generic [ref=e60]: Admin Settings
    - complementary [ref=e61]:
      - list [ref=e63]:
        - listitem [ref=e64]:
          - link [ref=e65] [cursor=pointer]:
            - /url: http://127.0.0.1:8098
            - generic [ref=e66]: 
        - listitem [ref=e67]:
          - link [ref=e68] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e69]: 
            - text: 
          - text:          
        - listitem [ref=e70]:
          - link [ref=e71] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e72]: 
            - text: 
          - text:  
        - listitem [ref=e73]:
          - link [ref=e74] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/licenses
            - generic [ref=e75]: 
        - listitem [ref=e76]:
          - link [ref=e77] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/accessories
            - generic [ref=e78]: 
        - listitem [ref=e79]:
          - link [ref=e80] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/consumables
            - generic [ref=e81]: 
        - listitem [ref=e82]:
          - link [ref=e83] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/components
            - generic [ref=e84]: 
        - listitem [ref=e85]:
          - link [ref=e86] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/kits
            - generic [ref=e87]: 
        - listitem [ref=e88]:
          - link [ref=e89] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e90]: 
            - text: 
          - text:      
        - listitem [ref=e91]:
          - link [ref=e92] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/import
            - generic [ref=e93]: 
        - listitem [ref=e94]:
          - link [ref=e95] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e96]: 
            - text: 
        - listitem [ref=e97]:
          - link [ref=e98] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e99]: 
            - text: 
        - listitem [ref=e100]:
          - link [ref=e101] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/account/requestable-assets
            - generic [ref=e102]: 
    - main [ref=e103]:
      - heading "Assets" [level=1] [ref=e107]:
        - list [ref=e108]:
          - listitem [ref=e109]:
            - link [ref=e110] [cursor=pointer]:
              - /url: http://127.0.0.1:8098
              - generic [ref=e111]: 
            - generic [ref=e112]: 
          - listitem [ref=e113]: Assets
      - generic [ref=e117]:
        - generic [ref=e119]:
          - heading "Assets" [level=3] [ref=e120]
          - generic [ref=e123]:
            - generic [ref=e124]: Bulk Actions
            - combobox [ref=e125]
            - combobox "Select rows to see available actions" [ref=e128] [cursor=pointer]:
              - textbox [ref=e129]
            - button "Go" [disabled] [ref=e130]
          - generic [ref=e131]:
            - generic [ref=e132]:
              - generic [ref=e133]:
                - button "Columns" [ref=e135] [cursor=pointer]:
                  - generic [ref=e136]: 
                - button "+" [ref=e138] [cursor=pointer]:
                  - generic [ref=e139]: +
                - button "" [ref=e140] [cursor=pointer]:
                  - generic [ref=e141]: 
                - button "Refresh" [ref=e142] [cursor=pointer]:
                  - generic [ref=e143]: 
                - button "" [ref=e144] [cursor=pointer]:
                  - generic [ref=e145]: 
                - button "Export data" [ref=e147] [cursor=pointer]:
                  - generic [ref=e148]: 
                - button "Print" [ref=e150] [cursor=pointer]:
                  - generic [ref=e151]: 
                - button "Fullscreen" [ref=e152] [cursor=pointer]:
                  - generic [ref=e153]: 
                - button "Advanced search" [ref=e154] [cursor=pointer]:
                  - generic [ref=e155]: 
                - button "" [ref=e156] [cursor=pointer]:
                  - generic [ref=e157]: 
              - generic [ref=e159]:
                - searchbox "Search" [active] [ref=e160]: fwsi26-spec
                - button "" [ref=e162] [cursor=pointer]:
                  - generic [ref=e163]: 
            - generic [ref=e165]: Showing 1 to 1 of 1 rows
            - table [ref=e170]:
              - rowgroup [ref=e171]:
                - row "Asset Tag Name Image Serial Model Category Status Checked Out To Location Purchase Cost Current Value Checkin/Checkout Actions" [ref=e172]:
                  - columnheader [ref=e173]:
                    - checkbox [ref=e176]
                  - columnheader "Asset Tag" [ref=e177]:
                    - generic [ref=e178] [cursor=pointer]: Asset Tag
                  - columnheader "Name" [ref=e179]:
                    - generic [ref=e180] [cursor=pointer]: Name
                  - columnheader "Image" [ref=e181]:
                    - generic [ref=e182] [cursor=pointer]: Image
                  - columnheader "Serial" [ref=e183]:
                    - generic [ref=e184] [cursor=pointer]: Serial
                  - columnheader "Model" [ref=e185]:
                    - generic [ref=e186] [cursor=pointer]: Model
                  - columnheader "Category" [ref=e187]:
                    - generic [ref=e188] [cursor=pointer]: Category
                  - columnheader "Status" [ref=e189]:
                    - generic [ref=e190] [cursor=pointer]: Status
                  - columnheader "Checked Out To" [ref=e191]:
                    - generic [ref=e192] [cursor=pointer]: Checked Out To
                  - columnheader "Location" [ref=e193]:
                    - generic [ref=e194] [cursor=pointer]: Location
                  - columnheader "Purchase Cost" [ref=e195]:
                    - generic [ref=e196] [cursor=pointer]: Purchase Cost
                  - columnheader "Current Value" [ref=e197]:
                    - generic [ref=e198]: Current Value
                  - columnheader "Checkin/Checkout" [ref=e199]:
                    - generic [ref=e200]: Checkin/Checkout
                  - columnheader "Actions" [ref=e201]:
                    - generic [ref=e202]: Actions
              - rowgroup [ref=e203]:
                - row "BA-00007 fwsi26-spec Bench Asset Bench Laptop Model Bench Laptops  Ready to Deploy Bench Office Checkout Clone Item Audit Update Delete" [ref=e204]:
                  - cell [ref=e205]:
                    - checkbox [ref=e207]
                  - cell "BA-00007" [ref=e208]:
                    - link "BA-00007" [ref=e210] [cursor=pointer]:
                      - /url: http://127.0.0.1:8098/hardware/7
                  - cell "fwsi26-spec Bench Asset" [ref=e211]:
                    - link "fwsi26-spec Bench Asset" [ref=e213] [cursor=pointer]:
                      - /url: http://127.0.0.1:8098/hardware/7
                      - mark [ref=e214]: fwsi26-spec
                      - text: Bench Asset
                  - cell [ref=e215]
                  - cell [ref=e216]
                  - cell "Bench Laptop Model" [ref=e217]:
                    - link "Bench Laptop Model" [ref=e219] [cursor=pointer]:
                      - /url: http://127.0.0.1:8098/models/1
                  - cell "Bench Laptops" [ref=e220]:
                    - link "Bench Laptops" [ref=e222] [cursor=pointer]:
                      - /url: http://127.0.0.1:8098/categories/2
                  - cell " Ready to Deploy" [ref=e223]:
                    - link " Ready to Deploy" [ref=e225] [cursor=pointer]:
                      - /url: http://127.0.0.1:8098/statuslabels/2
                      - generic [ref=e226]: 
                      - text: Ready to Deploy
                  - cell [ref=e227]
                  - cell "Bench Office" [ref=e228]:
                    - link "Bench Office" [ref=e230] [cursor=pointer]:
                      - /url: http://127.0.0.1:8098/locations/1
                  - cell [ref=e231]
                  - cell [ref=e232]
                  - cell "Checkout" [ref=e233]:
                    - link "Checkout" [ref=e234] [cursor=pointer]:
                      - /url: http://127.0.0.1:8098/hardware/7/checkout
                  - cell "Clone Item Audit Update Delete" [ref=e235]:
                    - generic [ref=e236]:
                      - link "Clone Item" [ref=e237] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/7/clone
                        - generic [ref=e238]: 
                        - generic [ref=e239]: Clone Item
                      - link "Audit" [ref=e240] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/7/audit
                        - generic [ref=e241]: 
                        - generic [ref=e242]: Audit
                      - link "Update" [ref=e243] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/7/edit
                        - generic [ref=e244]: 
                        - generic [ref=e245]: Update
                      - link "Delete" [ref=e246] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/7
                        - generic [ref=e247]: 
                        - generic [ref=e248]: Delete
              - rowgroup [ref=e249]:
                - row "0.00 0.00" [ref=e250]:
                  - columnheader [ref=e251]
                  - columnheader [ref=e253]
                  - columnheader [ref=e255]
                  - columnheader [ref=e257]
                  - columnheader [ref=e259]
                  - columnheader [ref=e261]
                  - columnheader [ref=e263]
                  - columnheader [ref=e265]
                  - columnheader [ref=e267]
                  - columnheader [ref=e269]
                  - columnheader "0.00" [ref=e271]:
                    - generic [ref=e272]: "0.00"
                  - columnheader "0.00" [ref=e273]:
                    - generic [ref=e274]: "0.00"
                  - columnheader [ref=e275]
                  - columnheader [ref=e277]
            - generic [ref=e280]: Showing 1 to 1 of 1 rows
        - paragraph [ref=e281]:
          - generic [ref=e282]: 
          - text: Click on a checkbox and hold
          - code [ref=e283]: shift
          - text: and click another checkbox in the table to select/de-select a range.
    - contentinfo [ref=e284]:
      - generic [ref=e285]:
        - generic [ref=e286]:
          - link "Snipe-IT" [ref=e287] [cursor=pointer]:
            - /url: https://snipeitapp.com
          - text: is open source software, made with
          - generic [ref=e288]: 
          - generic [ref=e289]: love
          - text: by Grokability, Inc.
          - link "" [ref=e290] [cursor=pointer]:
            - /url: https://bsky.app/profile/snipeitapp.com
            - generic [ref=e291]: 
          - link "" [ref=e292] [cursor=pointer]:
            - /url: https://github.com/grokability/snipe-it/
            - generic [ref=e293]: 
          - link "" [ref=e294] [cursor=pointer]:
            - /url: https://hachyderm.io/@grokability
            - generic [ref=e295]: 
          - link "" [ref=e296] [cursor=pointer]:
            - /url: https://discord.gg/yZFtShAcKk
            - generic [ref=e297]: 
        - generic [ref=e298]:
          - text: Version v8.7.2 - build 24589 (master)
          - link "User's Manual" [ref=e299] [cursor=pointer]:
            - /url: https://snipe-it.readme.io/docs/overview
          - link "Report a bug" [ref=e300] [cursor=pointer]:
            - /url: https://snipeitapp.com/support/
```

# Test source

```ts
  17721 |  * and none of the three recorded ways of naming it resolved inside the
  17722 |  * resolve window — one lost value, and the run reported as a broken procedure.
  17723 |  *
  17724 |  * So: the resolution and the read together, and on any failure one grep-able
  17725 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  17726 |  * are left exactly as they were — the emptiness is the honest report.
  17727 |  *
  17728 |  * The rules are not restated here. WHEN the resolution is asked (once, then
  17729 |  * after one sweep of the page once more with no wait) is the shared
  17730 |  * resolveForRead; taking the read, flattening it and turning its error into
  17731 |  * a skip is the shared takeRead (src/execution/observe.ts, embedded).
  17732 |  * Replay's runOneStep calls the same two; this adapter only says what it did.
  17733 |  */
  17734 | async function readOptional(
  17735 |   page: Page,
  17736 |   candidates: CandidateObservation[],
  17737 |   where: string,
  17738 |   policy: ResolvePolicy,
  17739 |   read: (loc: Locator) => Promise<unknown>,
  17740 |   opts: {
  17741 |     drift?: string[];
  17742 |     resolved?: { into: string[]; key: string; check?: () => void };
  17743 |     count?: { root: { locator(selector: string, options?: { hasText?: string | RegExp }): Locator }; scopes: CountScope[] | null };
  17744 |     kinds?: RecordedKind[];
  17745 |     label?: string;
  17746 |   } = {},
  17747 | ): Promise<string> {
  17748 |   lastReadHit = null;
  17749 |   const hit = await resolveForRead(page, (again) => resolveTarget(page, candidates, where, again ? { ...policy, waitMs: 0 } : policy, opts));
  17750 |   // A COUNT read (opts.count) that resolved nothing on a settled page with
  17751 |   // its scope on it observed "0", as replay publishes it (the shared
  17752 |   // countedNothing, fwrd88 05-change); anything else still skips.
  17753 |   if (!hit && opts.count && (await countedNothing(page, opts.count.root, candidates, opts.count.scopes))) return '0';
  17754 |   if (!hit) {
  17755 |     skippedReads.push(where);
  17756 |     console.log(`[sitelooper skip] ${where}: read target not found — value left empty`);
  17757 |     return '';
  17758 |   }
  17759 |   // A positional fallback standing in for a better candidate that missed reads
  17760 |   // what the recording read only if it is the kind of element it read (round 62,
  17761 |   // replay's same check; the artifact never heals, so a fallback is its only case).
  17762 |   if (hit.index > 0 && hit.structural && opts.kinds?.length && (await readsRecordedKind(hit.locator, opts.kinds)) === false) {
  17763 |     skippedReads.push(where);
  17764 |     console.log(`[sitelooper skip] ${where}: ${offRecordReadReason(opts.label ?? '', 'a positional fallback', opts.kinds)}`);
  17765 |     return '';
  17766 |   }
  17767 |   lastReadHit = hit.locator;
  17768 |   const taken = await takeRead(() => read(hit.locator));
  17769 |   if (taken.ok) return taken.value;
  17770 |   // A read proving what the step set did not land fails the step (scopedReadLanded, gitea fwgt12).
  17771 |   if (taken.lost) throw new Error(`${where}: ${taken.message}`);
  17772 |   skippedReads.push(where);
  17773 |   console.log(`[sitelooper skip] ${where}: read errored (${taken.message}) — value left empty`);
  17774 |   return '';
  17775 | }
  17776 | 
  17777 | /**
  17778 |  * A value an earlier step had to publish, taken at the moment the step
  17779 |  * that NEEDS it is handed its arguments.
  17780 |  *
  17781 |  * WHICH REPLAY RULE THIS MIRRORS. The flow runner resolves every {{ref}}
  17782 |  * in a step's instruction and params BEFORE the step runs
  17783 |  * (src/daemon/server.ts:1009-1024) and classifies what it could not fill:
  17784 |  * a reference bound into a slot the pinned procedure actually USES — one a
  17785 |  * recorded step types or locates by, or that names the record the
  17786 |  * procedure must find — is BLOCKING (`ignorableRefs`, src/skills/flow.ts:1083),
  17787 |  * so the zero-model replay is skipped and the step goes to recovery. Only a
  17788 |  * reference no recorded step can be affected by replays as pinned.
  17789 |  * `lookupRef` says it outright: a reference this run did not publish "goes
  17790 |  * to recovery, never to a recorded literal."
  17791 |  *
  17792 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  17793 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  17794 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  17795 |  * that is honest for an observation and fatal for an argument. Empty, a
  17796 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  17797 |  * `known` slot loses the identity it exists to carry, so the blank does not
  17798 |  * merely misreport the run: it does the work to the wrong record.
  17799 |  *
  17800 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  17801 |  * verdict, the browser is at rest, and nothing of the consuming step has
  17802 |  * run when this throws.
  17803 |  *
  17804 |  * What it says about the LOG is checked against the log (skippedReads): an
  17805 |  * unpublished reference whose producing step never skipped a read has a
  17806 |  * different cause and a different fix, and pointing at a line that was
  17807 |  * never printed costs a diagnosis (grafana fwgr47).
  17808 |  */
  17809 | function need(outputs: Outputs, ref: string, by: string): string {
  17810 |   const value = outputs[ref as keyof Outputs];
  17811 |   if (value === undefined || value === '') {
  17812 |     const dot = ref.indexOf('.');
  17813 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  17814 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  17815 |     const trail = skips.length
  17816 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  17817 |         ` (${skips[0]}), which is where this run diverged.`
  17818 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  17819 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  17820 |         ` this value, rather than re-recording a read that may be working.`;
> 17821 |     throw new Error(
        |           ^ Error: 04-set needs {{03-create.url.p1}}, and this run never published it (it was published empty). No `[sitelooper skip]` line was logged for 03-create on this run, so no read of 03-create.url.p1 was even attempted: check that 03-create is a step of this flow and that it is the step that publishes this value, rather than re-recording a read that may be working. Stopping here instead of passing an empty value into 04-set: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 04-set has run.
  17822 |       `${by} needs {{${ref}}}, and this run never published it` +
  17823 |         (value === '' ? ' (it was published empty)' : '') +
  17824 |         `. ${trail}` +
  17825 |         ` Stopping here instead of passing an empty value into ${by}:` +
  17826 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  17827 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  17828 |         ` earlier steps did stands; nothing of ${by} has run.`,
  17829 |     );
  17830 |   }
  17831 |   return value;
  17832 | }
  17833 | 
  17834 | /**
  17835 |  * How long a recorded page change has to appear: Playwright's own expect
  17836 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  17837 |  */
  17838 | const EXPECT_WAIT_MS = 5_000;
  17839 | 
  17840 | /**
  17841 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  17842 |  *
  17843 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  17844 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  17845 |  * function, not a reading of it. The lines carrying this run's own values are
  17846 |  * HARD, the rest are a plain group; either is looked for first in the lines
  17847 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  17848 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  17849 |  * role, name, state, and the value after the colon. The AFTER capture is
  17850 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  17851 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  17852 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  17853 |  * as it settled, routed to the record and re-rendered the row, and the
  17854 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  17855 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  17856 |  * An earlier cut of this
  17857 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  17858 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  17859 |  * passed on any visible Project combobox whatever it showed. Polled for
  17860 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  17861 |  * once, so the artifact is the more patient of the two, never the looser.
  17862 |  *
  17863 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  17864 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  17865 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  17866 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  17867 |  * step body, which remembers it for the steps that were going to act inside.
  17868 |  */
  17869 | async function expectChanges(
  17870 |   page: Page,
  17871 |   recorded: string[],
  17872 |   p: Record<string, string>,
  17873 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  17874 |   linesBefore: string[] | null,
  17875 |   dialect: LineDialect = 1,
  17876 |   linesAfter: string[] | null = null,
  17877 | ): Promise<ChangeVerdict> {
  17878 |   let last: ChangeVerdict = { warnings: [] };
  17879 |   await expect
  17880 |     .poll(
  17881 |       async () => {
  17882 |         last = await expectedChangesVerdict(recorded, p, { ...ctx, counters: counterNames(siteFactsAt(page.url()), page.url()) }, {
  17883 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  17884 |           live: (look) => captureLines(page, dialect, look),
  17885 |         });
  17886 |         return last.stop ?? null;
  17887 |       },
  17888 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  17889 |     )
  17890 |     .toBeNull();
  17891 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  17892 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  17893 |   return last;
  17894 | }
  17895 | 
  17896 | /**
  17897 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  17898 |  * after its targets resolve: a click whose identifying rungs ALL missed
  17899 |  * (`hit` positional, or null when nothing resolved) is — the shared
  17900 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  17901 |  * every line it was recorded adding already shows (`lines`, the shared
  17902 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  17903 |  * stopped when a positional rung took it onto an element without the
  17904 |  * recorded accessible name. True means skipped; a stop throws.
  17905 |  */
  17906 | async function positionalClick(
  17907 |   page: Page,
  17908 |   hit: Resolution | null,
  17909 |   identifying: number[],
  17910 |   points: number[],
  17911 |   lines: string[],
  17912 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  17913 |   p: Record<string, string>,
  17914 |   where: string,
  17915 |   dialect: LineDialect = 1,
  17916 | ): Promise<boolean> {
  17917 |   const verdict = await positionalClickVerdict(
  17918 |     page,
  17919 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  17920 |     identifying,
  17921 |     lines,
```