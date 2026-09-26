# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwod94.spec.ts >> fwod94
- Location: fwod94.spec.ts:9:1

# Error details

```
Error: none of 5 recorded locators resolved at 02-open s_2a1251/2 target (page is at http://127.0.0.1:8069/web#cids=1&menu_id=194&action=316&model=sale.order&view_type=form): locator('role=option[name="fwod94-spec Bench Customer"]') | getByRole('option', { name: /^[\s\p{Co}\p{So}\p{Cf}]*fwod94-spec\s+Bench\s+Customer[\s\p{Co}\p{So}\p{Cf}]*$/u }) | locator('#autocomplete_0_0')
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - navigation [ref=e3]:
      - button "" [ref=e5] [cursor=pointer]:
        - generic [ref=e6]: 
      - menuitem "Sales" [ref=e7] [cursor=pointer]
      - menu [ref=e8]:
        - button "Orders" [ref=e10] [cursor=pointer]:
          - generic [ref=e11]: Orders
        - button "To Invoice" [ref=e13] [cursor=pointer]:
          - generic [ref=e14]: To Invoice
        - button "Products" [ref=e16] [cursor=pointer]:
          - generic [ref=e17]: Products
        - button "Reporting" [ref=e19] [cursor=pointer]:
          - generic [ref=e20]: Reporting
        - button "Configuration" [ref=e22] [cursor=pointer]:
          - generic [ref=e23]: Configuration
      - menu [ref=e24]:
        - button "Messages 5" [ref=e26] [cursor=pointer]:
          - img "Messages" [ref=e27]: 
          - generic [ref=e28]: "5"
        - button "Activities 3" [ref=e30] [cursor=pointer]:
          - img "Activities" [ref=e31]: 
          - generic [ref=e32]: "3"
        - button "YourCompany" [ref=e34] [cursor=pointer]:
          - text: 
          - generic [ref=e35]: YourCompany
        - generic: 
        - button "User" [ref=e37] [cursor=pointer]:
          - img "User" [ref=e38]
          - text: 
  - generic [ref=e41]:
    - generic [ref=e44]:
      - button "New" [ref=e47] [cursor=pointer]
      - generic [ref=e48]:
        - list [ref=e49]:
          - listitem [ref=e50]:
            - link "Quotations" [ref=e51] [cursor=pointer]:
              - /url: "#"
        - generic [ref=e52]:
          - generic [ref=e54]: New
          - button "" [ref=e58] [cursor=pointer]:
            - generic [ref=e59]: 
      - generic [ref=e61]:
        - button "Save manually" [ref=e62] [cursor=pointer]:
          - generic [ref=e63]: 
        - button "Discard changes" [ref=e64] [cursor=pointer]:
          - generic [ref=e65]: 
    - generic [ref=e67]:
      - generic [ref=e68]:
        - generic [ref=e69]:
          - generic [ref=e70]:
            - button "Send by Email" [ref=e71] [cursor=pointer]
            - button "Confirm" [ref=e72] [cursor=pointer]
            - button "Preview" [ref=e73] [cursor=pointer]
          - radiogroup "Statusbar" [ref=e75]:
            - radio "Sales Order" [disabled]
            - radio "Quotation Sent" [disabled]
            - radio "Quotation" [checked] [disabled]
        - generic [ref=e76]:
          - heading "New" [level=1] [ref=e78]:
            - generic [ref=e79]: New
          - generic [ref=e80]:
            - generic [ref=e81]:
              - generic [ref=e82]:
                - generic [ref=e84]: Customer
                - generic [ref=e89]:
                  - combobox "Type to find a customer..." [expanded] [active] [ref=e90]: fwod94-n1 Bench
                  - menu [ref=e91]:
                    - listitem [ref=e92]:
                      - option "fwod94-n1 Bench" [selected] [ref=e93] [cursor=pointer]
                    - listitem [ref=e94]:
                      - option "Create \"fwod94-n1 Bench\"" [ref=e95] [cursor=pointer]
                    - listitem [ref=e96]:
                      - option "Search More..." [ref=e97] [cursor=pointer]
                    - listitem [ref=e98]:
                      - option "Create and edit..." [ref=e99] [cursor=pointer]
              - generic [ref=e100]:
                - generic [ref=e102]: Quotation Template
                - combobox "Quotation Template" [ref=e108]
            - generic [ref=e109]:
              - generic [ref=e110]:
                - generic [ref=e112]: Expiration
                - textbox "Expiration" [ref=e116] [cursor=pointer]: 10/26/2026
              - generic [ref=e117]:
                - generic [ref=e119]: Payment Terms
                - combobox "Payment Terms" [ref=e125]
          - generic [ref=e126]:
            - list [ref=e128]:
              - listitem [ref=e129] [cursor=pointer]:
                - tab "Order Lines" [ref=e130]
              - listitem [ref=e131] [cursor=pointer]:
                - tab "Optional Products" [ref=e132]
              - listitem [ref=e133] [cursor=pointer]:
                - tab "Other Info" [ref=e134]
            - generic [ref=e136]:
              - table [ref=e140]:
                - rowgroup [ref=e141]:
                  - row "Product Description  Quantity  Unit Price  Taxes Tax excl.  " [ref=e142]:
                    - columnheader [ref=e143] [cursor=pointer]
                    - columnheader "Product" [ref=e144]:
                      - generic [ref=e145]:
                        - generic [ref=e146]: Product
                        - text: 
                    - columnheader "Description " [ref=e148] [cursor=pointer]:
                      - generic [ref=e149]:
                        - generic [ref=e150]: Description
                        - generic [ref=e151]: 
                    - columnheader "Quantity " [ref=e153] [cursor=pointer]:
                      - generic [ref=e154]:
                        - generic [ref=e155]: Quantity
                        - generic [ref=e156]: 
                    - columnheader "Unit Price " [ref=e158] [cursor=pointer]:
                      - generic [ref=e159]:
                        - generic [ref=e160]: Unit Price
                        - generic [ref=e161]: 
                    - columnheader "Taxes" [ref=e163]:
                      - generic [ref=e164]:
                        - generic [ref=e165]: Taxes
                        - text: 
                    - columnheader "Tax excl. " [ref=e167] [cursor=pointer]:
                      - generic [ref=e168]:
                        - generic [ref=e169]: Tax excl.
                        - generic [ref=e170]: 
                    - columnheader "" [ref=e172]:
                      - button "" [ref=e174] [cursor=pointer]:
                        - generic [ref=e175]: 
                - rowgroup [ref=e176]:
                  - row "Add a productAdd a sectionAdd a note Catalog" [ref=e177]:
                    - cell [ref=e178]
                    - cell "Add a productAdd a sectionAdd a note Catalog" [ref=e179]:
                      - button "Add a product" [ref=e180] [cursor=pointer]
                      - button "Add a section" [ref=e181] [cursor=pointer]
                      - button "Add a note" [ref=e182] [cursor=pointer]
                      - button "Catalog" [ref=e183] [cursor=pointer]
                  - row [ref=e184]:
                    - cell [ref=e185]
                  - row [ref=e186]:
                    - cell [ref=e187]
                  - row [ref=e188]:
                    - cell [ref=e189]
                - rowgroup [ref=e190]:
                  - row [ref=e191]:
                    - cell [ref=e192]
                    - cell [ref=e193]
                    - cell [ref=e194]
                    - cell [ref=e195]
                    - cell [ref=e196]
                    - cell [ref=e197]
                    - cell [ref=e198]
                    - cell [ref=e199]
              - generic [ref=e200]:
                - paragraph [ref=e207]: Terms and conditions...
                - table [ref=e212]:
                  - rowgroup [ref=e213]:
                    - 'row "Total: £ 0.00" [ref=e214]':
                      - cell "Total:" [ref=e215]:
                        - generic [ref=e216]: "Total:"
                      - cell "£ 0.00" [ref=e217]
      - generic [ref=e219]:
        - generic [ref=e221]:
          - button "Send message" [ref=e222] [cursor=pointer]
          - button "Log note" [ref=e223] [cursor=pointer]
          - generic [ref=e224]:
            - button "Activities" [ref=e225] [cursor=pointer]
            - button "Search Messages" [ref=e227] [cursor=pointer]:
              - img [ref=e228]: 
            - generic [ref=e229]:
              - button "Attach files" [disabled]:
                - generic: 
            - generic [ref=e230]:
              - button "0" [disabled]:
                - img: 
                - superscript: "0"
            - button "Follow" [ref=e231] [cursor=pointer]:
              - generic [ref=e233]: Follow
        - generic [ref=e236]:
          - generic [ref=e237]:
            - separator [ref=e238]
            - generic [ref=e239]: Today
            - separator [ref=e240]
          - group "System notification" [ref=e241]:
            - generic [ref=e242]:
              - generic "Open card" [ref=e244] [cursor=pointer]:
                - img [ref=e245]
              - generic [ref=e246]:
                - generic [ref=e247]:
                  - generic "Open card" [ref=e248] [cursor=pointer]:
                    - strong [ref=e249]: Mitchell Admin
                  - generic "9/26/2026, 5:35:09 PM" [ref=e250]: "- now"
                - generic [ref=e255]: Creating a new record...
  - text:         
```

# Test source

```ts
  14630 |  * No visibility wait ahead of recognition, as in the daemon: a recognised
  14631 |  * widget's recipe clicks its root (an input sink inside it may be 0x0), and
  14632 |  * the native half waits for the field itself (reactSafeFill's own 10s).
  14633 |  */
  14634 | async function fill(loc: Locator, value: string): Promise<void> {
  14635 |   const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);
  14636 |   if (attempt) logRecipe(attempt);
  14637 | }
  14638 | 
  14639 | /**
  14640 |  * A recorded `type`, as tools.ts's `case 'type'`: the same set-value recipe
  14641 |  * ladder a fill climbs (an editor or an aria-combobox driven by typing in
  14642 |  * the recording is driven by its recipe here too), else pressSequentially
  14643 |  * on the same target with the daemon's timeout and per-key delay.
  14644 |  */
  14645 | const TYPE_TIMEOUT_MS = 10000;
  14646 | const TYPE_DELAY_MS = 20;
  14647 | async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {
  14648 |   const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });
  14649 |   if (attempt) logRecipe(attempt);
  14650 | }
  14651 | 
  14652 | /**
  14653 |  * One recorded chain resolved against the page — the artifact's adapter to
  14654 |  * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),
  14655 |  * which is replay's `resolveChain` policy itself: the class order, the
  14656 |  * point mark, the identity guard, plausibility, the origin guard, ambiguity
  14657 |  * and its loop-cursor narrowing, the structural hold and the whole-chain
  14658 |  * wait are decided THERE, in both runners. Nothing here reinterprets one.
  14659 |  *
  14660 |  * What this adds is presentation, exactly what replay adds around its own
  14661 |  * call:
  14662 |  *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in
  14663 |  *    at each call site) turns a silent fallthrough into telemetry. A win by
  14664 |  *    any candidate but the primary (stored index 0) IS drift — the recorded
  14665 |  *    locator missed and a later one covered for it — so it is one stable,
  14666 |  *    grep-able `[sitelooper drift]` line naming every candidate rejected
  14667 |  *    ahead of the winner and WHY, in the policy's own words (MissReason).
  14668 |  *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what
  14669 |  *    this target resolved TO, as `<key>=<winning locator>`, with the cursor
  14670 |  *    appended only when ambiguity was narrowed to it. The progress guard
  14671 |  *    compares one pass's entries with the last.
  14672 |  *
  14673 |  * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's
  14674 |  * evidence-based reordering of a candidate later runs showed volatile):
  14675 |  * that evidence lives in the skill store, and an artifact has none, so a
  14676 |  * compiled chain is ordered by class and recorded order alone. Everything
  14677 |  * else the policy decides is decided here from the same observations.
  14678 |  */
  14679 | async function resolveTarget(
  14680 |   page: Page,
  14681 |   candidates: CandidateObservation[],
  14682 |   where: string,
  14683 |   policy: ResolvePolicy,
  14684 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  14685 | ): Promise<Resolution | null> {
  14686 |   const hit = await resolveCandidates(page, candidates, policy);
  14687 |   if (!hit) return null;
  14688 |   const primary = candidates.find((c) => c.index === 0) ?? candidates[0];
  14689 |   // Drift is a better candidate that FAILED (the shared isDrift), never a stored
  14690 |   // index alone: a positional primary the policy ranked behind a name was not missed.
  14691 |   if (isDrift(hit)) {
  14692 |     const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');
  14693 |     const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : 'used';
  14694 |     const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;
  14695 |     console.log(line);
  14696 |     (opts.drift ?? DRIFT).push(line);
  14697 |   }
  14698 |   if (opts.resolved) {
  14699 |     const won = candidates.find((c) => c.index === hit.index) ?? primary;
  14700 |     opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);
  14701 |     // the loop progress guard, asked before anything acts on what just resolved
  14702 |     opts.resolved.check?.();
  14703 |   }
  14704 |   return hit;
  14705 | }
  14706 | 
  14707 | /**
  14708 |  * resolveTarget for an ACTION: a chain that resolves nothing is a stop.
  14709 |  *
  14710 |  * `note` is passed only at a FLAGGED step (compile found the step itself
  14711 |  * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the
  14712 |  * throw, it is what stops "none of 3 recorded locators resolved" from
  14713 |  * reading as app drift when the recording is what needs redoing.
  14714 |  */
  14715 | async function pick(
  14716 |   page: Page,
  14717 |   candidates: CandidateObservation[],
  14718 |   where: string,
  14719 |   policy: ResolvePolicy,
  14720 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  14721 |   note?: string,
  14722 | ): Promise<Resolution> {
  14723 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  14724 |   if (hit) return hit;
  14725 |   throw pickMiss(page, candidates, where, note);
  14726 | }
  14727 | 
  14728 | /** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */
  14729 | function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {
> 14730 |   return new Error(
        |          ^ Error: none of 5 recorded locators resolved at 02-open s_2a1251/2 target (page is at http://127.0.0.1:8069/web#cids=1&menu_id=194&action=316&model=sale.order&view_type=form): locator('role=option[name="fwod94-spec Bench Customer"]') | getByRole('option', { name: /^[\s\p{Co}\p{So}\p{Cf}]*fwod94-spec\s+Bench\s+Customer[\s\p{Co}\p{So}\p{Cf}]*$/u }) | locator('#autocomplete_0_0')
  14731 |     // The url and the recorded step are half the answer whenever a chain
  14732 |     // misses wholesale: a locator that named the control on the day it was
  14733 |     // recorded usually misses because the page is not the page the step
  14734 |     // expected, and the log otherwise says only that nothing resolved.
  14735 |     `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +
  14736 |       candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +
  14737 |       (note ? `\n  ${note}` : ''),
  14738 |   );
  14739 | }
  14740 | 
  14741 | /**
  14742 |  * `pick` for a navigation click with a recorded destination — replay's
  14743 |  * navigation fallback (runOneStep), through the shared
  14744 |  * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,
  14745 |  * embedded). When the chain resolves nothing and the browser is not already
  14746 |  * where the click was recorded to land, another visible link to that
  14747 |  * destination is clicked, else a fully concrete destination is navigated to
  14748 |  * directly. Arrival returns null — the step is done, logged as drift, and
  14749 |  * its gates are not asked, as replay returns before them. Otherwise the
  14750 |  * same stop `pick` throws. Never emitted in a loop body (replay's rule).
  14751 |  */
  14752 | async function pickOrNavigate(
  14753 |   page: Page,
  14754 |   candidates: CandidateObservation[],
  14755 |   where: string,
  14756 |   policy: ResolvePolicy,
  14757 |   destPattern: string,
  14758 |   p: Record<string, string>,
  14759 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  14760 |   note?: string,
  14761 | ): Promise<Resolution | null> {
  14762 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  14763 |   if (hit) return hit;
  14764 |   if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {
  14765 |     const arrived = await navigateToDestination(page, destPattern, p, {
  14766 |       click: async (loc) => {
  14767 |         await click(loc);
  14768 |       },
  14769 |       goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),
  14770 |     });
  14771 |     // The substitute link's click may have landed: a stop, never the direct navigation after it.
  14772 |     if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);
  14773 |     if (arrived) {
  14774 |       const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;
  14775 |       console.log(line);
  14776 |       (opts.drift ?? DRIFT).push(line);
  14777 |       return null;
  14778 |     }
  14779 |   }
  14780 |   throw pickMiss(page, candidates, where, note);
  14781 | }
  14782 | 
  14783 | /**
  14784 |  * Every `[sitelooper skip]` line this run logged, by the `where` that
  14785 |  * logged it (`<step id> <skill step>/<n> <role>`).
  14786 |  *
  14787 |  * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,
  14788 |  * to look above for the producing step's `[sitelooper skip] … read target
  14789 |  * not found` line. When the reference names something that is not a step of
  14790 |  * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,
  14791 |  * a ledger instruction id no step publishes) no such line was ever emitted —
  14792 |  * the only occurrence of that string in the entire log was inside the error
  14793 |  * itself, and it sent the diagnosis after a read that was working all along.
  14794 |  * So the claim is now made only when the log bears it out.
  14795 |  */
  14796 | const skippedReads: string[] = [];
  14797 | 
  14798 | /**
  14799 |  * A recorded READ, which never fails the flow.
  14800 |  *
  14801 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an
  14802 |  * OBSERVATION, not a state change: a read whose target cannot be resolved —
  14803 |  * or whose read itself errors — is skipped with a warning and the replay
  14804 |  * CONTINUES ("skipped read — no element matched any known locator"). Failing
  14805 |  * to re-capture a value says nothing about whether the procedure ran; the
  14806 |  * step after it is exactly as valid as it was. A spec that threw here turned
  14807 |  * a missing observation into a failed test: grafana's `panel_content` read is
  14808 |  * a freshly applied text panel whose body the verifier goes on to confirm,
  14809 |  * and none of the three recorded ways of naming it resolved inside the
  14810 |  * resolve window — one lost value, and the run reported as a broken procedure.
  14811 |  *
  14812 |  * So: the resolution and the read together, and on any failure one grep-able
  14813 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  14814 |  * are left exactly as they were — the emptiness is the honest report.
  14815 |  *
  14816 |  * The rules are not restated here. WHEN the resolution is asked (once, then
  14817 |  * after one sweep of the page once more with no wait) is the shared
  14818 |  * resolveForRead; taking the read, flattening it and turning its error into
  14819 |  * a skip is the shared takeRead (src/execution/observe.ts, embedded).
  14820 |  * Replay's runOneStep calls the same two; this adapter only says what it did.
  14821 |  */
  14822 | async function readOptional(
  14823 |   page: Page,
  14824 |   candidates: CandidateObservation[],
  14825 |   where: string,
  14826 |   policy: ResolvePolicy,
  14827 |   read: (loc: Locator) => Promise<unknown>,
  14828 |   opts: {
  14829 |     drift?: string[];
  14830 |     resolved?: { into: string[]; key: string; check?: () => void };
```