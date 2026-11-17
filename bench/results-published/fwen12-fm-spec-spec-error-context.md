# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwen12-fm.spec.ts >> fwen12-fm
- Location: fwen12-fm.spec.ts:9:1

# Error details

```
Error: 03-create s_526e7e: not on the page this procedure starts from (expects http://127.0.0.1:8100/app/customer/new-customer-cmwklbdrch, browser is at http://127.0.0.1:8100/app/customer/new-customer-jwpoffaqzf) — nothing of this segment has run
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
            - link "Customer" [ref=e12] [cursor=pointer]:
              - /url: /app/customer
          - listitem [ref=e13]:
            - link "New Customer":
              - /url: /app/customer/new-customer-jwpoffaqzf
        - generic [ref=e14]:
          - search [ref=e15]:
            - generic [ref=e16]:
              - combobox "Search or type a command (Ctrl + G)" [ref=e18]
              - img [ref=e20]
          - list [ref=e22]:
            - listitem [ref=e23]:
              - button "No new notifications" [ref=e24] [cursor=pointer]:
                - generic [ref=e25]:
                  - generic [ref=e26]: No new notifications
                  - img [ref=e27]
            - listitem [ref=e29]
            - listitem [ref=e30]:
              - button "Help Dropdown" [ref=e31] [cursor=pointer]:
                - generic [ref=e32]:
                  - text: Help
                  - img [ref=e33]
            - listitem [ref=e35]:
              - button "User Menu" [ref=e36] [cursor=pointer]:
                - generic "Administrator" [ref=e37]:
                  - generic "Administrator" [ref=e38]: A
    - generic [ref=e40]:
      - generic [ref=e43]:
        - generic [ref=e44]:
          - button "Toggle Sidebar" [ref=e45] [cursor=pointer]:
            - img [ref=e46]
          - generic [ref=e50]:
            - heading "New Customer" [level=3] [ref=e51] [cursor=pointer]
            - generic [ref=e53]: Not Saved
        - button "Save" [ref=e56] [cursor=pointer]:
          - generic [ref=e57]: Save
      - generic [ref=e62]:
        - generic [ref=e67]:
          - tablist [ref=e69]:
            - listitem [ref=e70]:
              - tab "Details" [active] [selected] [ref=e71] [cursor=pointer]
            - listitem [ref=e72]:
              - tab "Address & Contact" [ref=e73] [cursor=pointer]
            - listitem [ref=e74]:
              - tab "Tax" [ref=e75] [cursor=pointer]
            - listitem [ref=e76]:
              - tab "Accounting" [ref=e77] [cursor=pointer]
            - listitem [ref=e78]:
              - tab "Sales Team" [ref=e79] [cursor=pointer]
            - listitem [ref=e80]:
              - tab "Settings" [ref=e81] [cursor=pointer]
            - listitem [ref=e82]:
              - tab "Portal Users" [ref=e83] [cursor=pointer]
          - generic [ref=e84]:
            - tabpanel "Details" [ref=e85]:
              - generic [ref=e87]:
                - generic [ref=e89]:
                  - generic [ref=e90]:
                    - generic [ref=e91]:
                      - generic [ref=e93]: Customer Name *
                      - generic [ref=e94]:
                        - textbox [ref=e96]: fwen12-fm-spec Bench Customer
                        - paragraph
                    - generic: customer_name
                  - generic [ref=e97]:
                    - generic [ref=e98]:
                      - generic [ref=e100]: Customer Type *
                      - generic [ref=e101]:
                        - generic [ref=e102]:
                          - combobox [ref=e103]:
                            - option "Company" [selected]
                            - option "Individual"
                            - option "Partnership"
                          - generic:
                            - img
                        - paragraph
                    - generic: customer_type
                  - generic [ref=e104]:
                    - generic [ref=e105]:
                      - generic [ref=e107]: Customer Group
                      - generic [ref=e108]:
                        - generic [ref=e111]:
                          - combobox [ref=e112]: Commercial
                          - status [ref=e113]: Begin typing for results.
                        - paragraph
                    - generic: customer_group
                - generic [ref=e115]:
                  - generic [ref=e116]:
                    - generic [ref=e117]:
                      - generic [ref=e119]: Territory
                      - generic [ref=e120]:
                        - generic [ref=e123]:
                          - combobox [ref=e124]: United States
                          - status [ref=e125]: Begin typing for results.
                        - paragraph
                    - generic: territory
                  - generic [ref=e126]:
                    - generic [ref=e127]:
                      - generic [ref=e129]: From Lead
                      - generic [ref=e130]:
                        - generic [ref=e133]:
                          - combobox [ref=e134]
                          - status [ref=e135]: Begin typing for results.
                        - paragraph
                    - generic: lead_name
                  - generic [ref=e136]:
                    - generic [ref=e137]:
                      - generic [ref=e139]: From Opportunity
                      - generic [ref=e140]:
                        - generic [ref=e143]:
                          - combobox [ref=e144]
                          - status [ref=e145]: Begin typing for results.
                        - paragraph
                    - generic: opportunity_name
                  - generic [ref=e146]:
                    - generic [ref=e147]:
                      - generic [ref=e149]: From Prospect
                      - generic [ref=e150]:
                        - generic [ref=e153]:
                          - combobox [ref=e154]
                          - status [ref=e155]: Begin typing for results.
                        - paragraph
                    - generic: prospect_name
                  - generic [ref=e156]:
                    - generic [ref=e157]:
                      - generic [ref=e159]: Account Manager
                      - generic [ref=e160]:
                        - generic [ref=e163]:
                          - combobox [ref=e164]
                          - status [ref=e165]: Begin typing for results.
                        - paragraph
                    - generic: account_manager
              - generic [ref=e166]:
                - generic [ref=e167]: Defaults
                - generic [ref=e168]:
                  - generic [ref=e170]:
                    - generic [ref=e171]:
                      - generic [ref=e172]:
                        - generic [ref=e174]: Billing Currency
                        - generic [ref=e175]:
                          - generic [ref=e178]:
                            - combobox [ref=e179]
                            - status [ref=e180]: Begin typing for results.
                          - paragraph
                      - generic: default_currency
                    - generic [ref=e181]:
                      - generic [ref=e182]:
                        - generic [ref=e184]: Default Company Bank Account
                        - generic [ref=e185]:
                          - generic [ref=e188]:
                            - combobox [ref=e189]
                            - status [ref=e190]: Begin typing for results.
                          - paragraph
                      - generic: default_bank_account
                  - generic [ref=e193]:
                    - generic [ref=e194]:
                      - generic [ref=e196]: Default Price List
                      - generic [ref=e197]:
                        - generic [ref=e200]:
                          - combobox [ref=e201]
                          - status [ref=e202]: Begin typing for results.
                        - paragraph
                    - generic: default_price_list
              - generic [ref=e204] [cursor=pointer]:
                - text: Internal Customer
                - img [ref=e206]
              - generic [ref=e209] [cursor=pointer]:
                - text: More Information
                - img [ref=e211]
            - text: "* * *"
        - text: Type a reply / comment ×
    - contentinfo
  - generic [ref=e213]:
    - navigation [ref=e215]:
      - img [ref=e217] [cursor=pointer]
      - generic [ref=e219] [cursor=pointer]:
        - text: November,
        - generic [ref=e220]: "2026"
      - img [ref=e222] [cursor=pointer]
    - generic [ref=e225]:
      - generic [ref=e226]:
        - generic [ref=e227]: Su
        - generic [ref=e228]: Mo
        - generic [ref=e229]: Tu
        - generic [ref=e230]: We
        - generic [ref=e231]: Th
        - generic [ref=e232]: Fr
        - generic [ref=e233]: Sa
      - generic [ref=e234]:
        - generic [ref=e235] [cursor=pointer]: "1"
        - generic [ref=e236] [cursor=pointer]: "2"
        - generic [ref=e237] [cursor=pointer]: "3"
        - generic [ref=e238] [cursor=pointer]: "4"
        - generic [ref=e239] [cursor=pointer]: "5"
        - generic [ref=e240] [cursor=pointer]: "6"
        - generic [ref=e241] [cursor=pointer]: "7"
        - generic [ref=e242] [cursor=pointer]: "8"
        - generic [ref=e243] [cursor=pointer]: "9"
        - generic [ref=e244] [cursor=pointer]: "10"
        - generic [ref=e245] [cursor=pointer]: "11"
        - generic [ref=e246] [cursor=pointer]: "12"
        - generic [ref=e247] [cursor=pointer]: "13"
        - generic [ref=e248] [cursor=pointer]: "14"
        - generic [ref=e249] [cursor=pointer]: "15"
        - generic [ref=e250] [cursor=pointer]: "16"
        - generic [ref=e251] [cursor=pointer]: "17"
        - generic [ref=e252] [cursor=pointer]: "18"
        - generic [ref=e253] [cursor=pointer]: "19"
        - generic [ref=e254] [cursor=pointer]: "20"
        - generic [ref=e255] [cursor=pointer]: "21"
        - generic [ref=e256] [cursor=pointer]: "22"
        - generic [ref=e257] [cursor=pointer]: "23"
        - generic [ref=e258] [cursor=pointer]: "24"
        - generic [ref=e259] [cursor=pointer]: "25"
        - generic [ref=e260] [cursor=pointer]: "26"
        - generic [ref=e261] [cursor=pointer]: "27"
        - generic [ref=e262] [cursor=pointer]: "28"
        - generic [ref=e263] [cursor=pointer]: "29"
        - generic [ref=e264] [cursor=pointer]: "30"
        - generic [ref=e265] [cursor=pointer]: "1"
        - generic [ref=e266] [cursor=pointer]: "2"
        - generic [ref=e267] [cursor=pointer]: "3"
        - generic [ref=e268] [cursor=pointer]: "4"
        - generic [ref=e269] [cursor=pointer]: "5"
    - generic [ref=e271] [cursor=pointer]: Today
  - text: "* *"
```

# Test source

```ts
  16664 |   if (stop) throw new Error(stop);
  16665 | }
  16666 | 
  16667 | /**
  16668 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  16669 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  16670 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  16671 |  * literal segments is treated as volatile (warned, continued), anything else
  16672 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  16673 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  16674 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  16675 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  16676 |  * step's click reported of the link it clicked (the shared beginAction): a
  16677 |  * click that went where its link points, recorded as staying on the page it
  16678 |  * left, is the shared linkLandingWarning and waits for nothing.
  16679 |  */
  16680 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  16681 |   if (!urlMatches(pattern, page.url(), p)) {
  16682 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  16683 |     if (landed) return logWarning(landed);
  16684 |   }
  16685 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  16686 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  16687 |   for (const line of verdict.warnings) logWarning(line);
  16688 |   // What this step watched vary is the segment's evidence from here on
  16689 |   // (navigationTarget), whether or not the step goes on to stop.
  16690 |   if (verdict.diffs) volatile.push(...verdict.diffs);
  16691 |   if (verdict.stop) throw new Error(verdict.stop);
  16692 | }
  16693 | 
  16694 | /**
  16695 |  * Where a goto actually sends the browser — the shared retargetNavigation
  16696 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  16697 |  * the live url sits at a position THIS segment has already watched vary is a
  16698 |  * literal from the recording's run, and the live value is navigated to
  16699 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  16700 |  * one per replayed skill. The returned `stale` is handed to this step's
  16701 |  * alert gate, so an unrecorded alert on the landing names the cause.
  16702 |  */
  16703 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  16704 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  16705 |   if (verdict.warning) logWarning(verdict.warning);
  16706 |   return verdict;
  16707 | }
  16708 | 
  16709 | /**
  16710 |  * The alert observation a step is judged by, taken where the daemon takes
  16711 |  * its diff: after the action, once the DOM has settled (tools.ts
  16712 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  16713 |  * inside verify's url window is seen by both runners or by neither.
  16714 |  * Rendered in the step's line dialect, with whether every live region was
  16715 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  16716 |  */
  16717 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  16718 |   await settle(page);
  16719 |   return liveAlertsObserved(page, dialect);
  16720 | }
  16721 | 
  16722 | /**
  16723 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  16724 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  16725 |  * and stops a state-changing step only when its recorded page changes did
  16726 |  * not confirm it worked (a rejection toast that leaves the page superficially
  16727 |  * intact); a recorded-but-missing one only warns.
  16728 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  16729 |  * `after` in settle, right after the action has settled and BEFORE the url
  16730 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  16731 |  * during a 5s url wait must not be missed) — and a page that could not be
  16732 |  * read is handed over as unobserved, never as "no alert".
  16733 |  */
  16734 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  16735 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  16736 |   for (const line of verdict.warnings) logWarning(line);
  16737 |   if (verdict.stop) throw new Error(verdict.stop);
  16738 | }
  16739 | 
  16740 | /**
  16741 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  16742 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  16743 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  16744 |  * page structure agrees, anything else refuses before the first step acts.
  16745 |  * `similarity` is what replay's adapter passes: where the recording kept a
  16746 |  * page fingerprint, the call site measures the live page with the shared
  16747 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  16748 |  * could not be read, exactly as replay; null where the recording kept none
  16749 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  16750 |  * compiled before the vector travelled, which refuses a soft match it cannot
  16751 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  16752 |  * (arguments evaluate left to right), as replay reads startUrl before it
  16753 |  * fingerprints: both describe the page as the segment found it, not where a
  16754 |  * navigation in flight landed during the measurement. Async so the call site
  16755 |  * must await it: a gate that could be left un-awaited is one that can
  16756 |  * silently become a no-op. Decided as replay decides it: through
  16757 |  * preconditionVerdictWithFacts (src/execution/facts-route.ts) over the facts
  16758 |  * snapshot this file carries for the url (siteFactsAt), which is the plain
  16759 |  * preconditionVerdict wherever no reliable site fact bears on the url.
  16760 |  */
  16761 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  16762 |   const verdict = preconditionVerdictWithFacts(siteFactsAt(url), pattern, url, p, similarity, mints);
  16763 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
> 16764 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
        |                             ^ Error: 03-create s_526e7e: not on the page this procedure starts from (expects http://127.0.0.1:8100/app/customer/new-customer-cmwklbdrch, browser is at http://127.0.0.1:8100/app/customer/new-customer-jwpoffaqzf) — nothing of this segment has run
  16765 | }
  16766 | 
  16767 | /**
  16768 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  16769 |  * source of truth, so the vector is carried once. A segment the emitter
  16770 |  * asked this of always has one; its absence means FLOW was edited by hand,
  16771 |  * and the gate fails closed rather than soft-match on the url alone.
  16772 |  */
  16773 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  16774 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  16775 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  16776 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  16777 |   return recorded;
  16778 | }
  16779 | 
  16780 | /**
  16781 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  16782 |  *
  16783 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  16784 |  * action and, when the action changed it, awaits settleDom before binding
  16785 |  * the step's derived values — the value a spec needs is the one on the url
  16786 |  * the step navigated TO, and `page.url()` read in the same tick as the
  16787 |  * click still says where the page came FROM. Bound empty, every pattern
  16788 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  16789 |  *
  16790 |  * ALL of them together, not one at a time, because they are read into ONE
  16791 |  * pattern: an app is free to populate its state fragment key by key (odoo
  16792 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  16793 |  * that binds the instant IT is non-empty can be bound off a half-built url
  16794 |  * while its neighbour is still missing. The step is not where it was
  16795 |  * recorded until every part is there.
  16796 |  *
  16797 |  * A spec has no settleDom, so it polls on the shared resolve cadence
  16798 |  * (RESOLVE_POLL_MS) within the window
  16799 |  * replay effectively allows a url (URL_WAIT_MS), and takes one last reading
  16800 |  * at the deadline: a step whose url genuinely does not change (the parts were
  16801 |  * already there) must still bind what is there rather than hang or throw.
  16802 |  *
  16803 |  * The parts themselves come from the shared `urlPart` (src/execution/url.ts),
  16804 |  * the daemon's own labelling; a part the url does not carry is undefined.
  16805 |  */
  16806 | async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {
  16807 |   const read = (url: string) => labels.map((label) => urlPart(url, label));
  16808 |   for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {
  16809 |     const url = page.url();
  16810 |     const values = read(url);
  16811 |     if (url !== urlBefore && values.every(Boolean)) {
  16812 |       // The parts are there — but an app is free to redirect AGAIN from
  16813 |       // the url that first carried them, and the value that matters is
  16814 |       // the one on the url the step SETTLES on. Replay never sees this,
  16815 |       // because it binds derived values only after settleDom absorbs the
  16816 |       // whole redirect chain. So: let the DOM go quiet, and if the url
  16817 |       // moved while it did, settle once more before reading.
  16818 |       for (let pass = 0; pass < 2; pass++) {
  16819 |         const before = page.url();
  16820 |         await settle(page);
  16821 |         if (page.url() === before) break;
  16822 |       }
  16823 |       return read(page.url());
  16824 |     }
  16825 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  16826 |   }
  16827 |   return read(page.url());
  16828 | }
  16829 | 
  16830 | /** One part, on the same terms. `urlBefore` is omitted where no action of this step
  16831 |   * moved the page: then the wait is simply for the part to be there at all, which is
  16832 |   * what the flow runner does before it publishes a step's url outputs (consumedUrlOutputs). */
  16833 | async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {
  16834 |   return (await urlPartsWhen(page, [label], urlBefore))[0];
  16835 | }
  16836 | 
  16837 | /**
  16838 |  * A derived value, bound as replay binds it: only when the url carries the
  16839 |  * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,
  16840 |  * which urlDiff reads as a wildcard and a locator as text no page shows.
  16841 |  */
  16842 | function bindPart(p: Record<string, string>, name: string, value: string | undefined): void {
  16843 |   if (value !== undefined) p[name] = value;
  16844 | }
  16845 | 
  16846 | const CLICK_TIER_MS = 5000;
  16847 | async function click(loc: Locator, opts: { dbl?: boolean; obs?: ActionObservation | null } = {}): Promise<void> {
  16848 |   // The tiers are cut to what is left of the action's deadline, and report how the click went out.
  16849 |   await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });
  16850 | }
  16851 | 
  16852 | /** The words the daemon reports a verified recipe in (its tool result), as a grep-able line. */
  16853 | function logRecipe(attempt: RecipeAttempt): void {
  16854 |   console.log(`[sitelooper recipe] ${describeRecipeAttempt(attempt)}`);
  16855 | }
  16856 | 
  16857 | /**
  16858 |  * A recorded `fill`, executed as tools.ts's `case 'fill'` executes it: the
  16859 |  * shared ladder `fillWithRecipe` (src/execution/recipes.ts, embedded above)
  16860 |  * — the component recipe first, verified against the widget's own read,
  16861 |  * and the native reactSafeFill only when nothing was verified. Both halves
  16862 |  * matter. A keyboard-driven editor has no value property to set (monaco's
  16863 |  * `<textarea>` is an input sink and the text you see is a rendered
  16864 |  * `.view-lines` div), so a native setter writes into a box the editor never
```