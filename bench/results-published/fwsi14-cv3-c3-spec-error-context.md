# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwsi14-cv3.spec.ts >> fwsi14-cv3
- Location: fwsi14-cv3.spec.ts:9:1

# Error details

```
Error: 03-open s_862d91: not on the page this procedure starts from (expects http://127.0.0.1:8098/hardware/14#history, browser is at http://127.0.0.1:8098/hardware/14) — nothing of this segment has run
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
      - generic [ref=e106]:
        - 'heading "Assets fwsi14-cv3-c3 Bench Asset #BA-00014 - Bench Laptop Model" [level=1] [ref=e107]':
          - list [ref=e108]:
            - listitem [ref=e109]:
              - link [ref=e110] [cursor=pointer]:
                - /url: http://127.0.0.1:8098
                - generic [ref=e111]: 
              - generic [ref=e112]: 
            - listitem [ref=e113]:
              - link "Assets" [ref=e114] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/hardware
              - generic [ref=e115]: 
            - listitem [ref=e116]: "fwsi14-cv3-c3 Bench Asset #BA-00014 - Bench Laptop Model"
        - button "Show/Hide More Information" [ref=e118] [cursor=pointer]: 
      - generic [ref=e121]:
        - generic [ref=e123]:
          - tablist [ref=e124]:
            - link "Details" [ref=e125]:
              - /url: "#details"
              - text: 
              - generic [ref=e127]: 
              - generic [ref=e128]: Details
            - link "Licenses" [ref=e129] [cursor=pointer]:
              - /url: "#licenses"
              - text: 
              - generic [ref=e131]: 
              - generic [ref=e132]: Licenses
            - link "Components" [ref=e133] [cursor=pointer]:
              - /url: "#components"
              - text: 
              - generic [ref=e135]: 
              - generic [ref=e136]: Components
            - link "Assets" [ref=e137] [cursor=pointer]:
              - /url: "#assets"
              - text: 
              - generic [ref=e139]: 
              - generic [ref=e140]: Assets
            - link "Accessories" [ref=e141] [cursor=pointer]:
              - /url: "#accessories"
              - text: 
              - generic [ref=e143]: 
              - generic [ref=e144]: Accessories
            - link "Maintenances" [ref=e145] [cursor=pointer]:
              - /url: "#maintenances"
              - text: 
              - generic [ref=e147]: 
              - generic [ref=e148]: Maintenances
            - link "Audits" [ref=e149] [cursor=pointer]:
              - /url: "#audits"
              - text: 
              - generic [ref=e151]: 
              - generic [ref=e152]: Audits
            - link "Notes" [ref=e153] [cursor=pointer]:
              - /url: "#notes"
              - text: 
              - generic [ref=e155]: 
              - generic [ref=e156]: Notes
            - link "Files" [ref=e157] [cursor=pointer]:
              - /url: "#files"
              - text: 
              - generic [ref=e159]: 
              - generic [ref=e160]: Files
            - link "Additional Files" [ref=e161] [cursor=pointer]:
              - /url: "#model-files"
              - text: 
              - generic [ref=e163]: 
              - generic [ref=e164]: Additional Files
            - link "History 2" [ref=e165] [cursor=pointer]:
              - /url: "#history"
              - text: 
              - generic [ref=e167]: 
              - generic [ref=e168]: History
              - generic [ref=e169]: "2"
            - link [ref=e170] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e171]: 
          - generic [ref=e172]:
            - generic [ref=e175]:
              - generic [ref=e178]:
                - generic [ref=e179]: 
                - text: Ready to Deploy Deployed
                - generic [ref=e180]: 
                - generic [ref=e181]: 
                - link "Bench Assignee" [ref=e182] [cursor=pointer]:
                  - /url: http://127.0.0.1:8098/users/2
              - generic [ref=e184]:
                - generic [ref=e185]: 
                - strong [ref=e186]: Last Checkout
                - text: 2026-09-26 8 seconds ago
              - generic [ref=e188]:
                - generic [ref=e189]: 
                - strong [ref=e190]: Expected Checkin
                - text: N/A
              - generic [ref=e195]:
                - term [ref=e196]: Asset Tag
                - definition [ref=e197]:
                  - generic [ref=e198]:
                    - text: 
                    - generic [ref=e199]: Copy to Clipboard
                  - text: BA-00014
                - term [ref=e200]: Asset Name
                - definition [ref=e201]:
                  - generic [ref=e202]:
                    - text: 
                    - generic [ref=e203]: Copy to Clipboard
                  - text: fwsi14-cv3-c3 Bench Asset
                - term [ref=e204]: Current Value
                - definition [ref=e205]:
                  - generic [ref=e206]:
                    - text: 
                    - generic [ref=e207]: Copy to Clipboard
                  - text: USD
                - term [ref=e208]: Last Audit
                - definition [ref=e209]:
                  - emphasis [ref=e211]: No value
                - term [ref=e212]: Next Audit Date
                - definition [ref=e213]:
                  - emphasis [ref=e215]: No value
                - term [ref=e216]: Default Location
                - definition [ref=e217]:
                  - generic [ref=e218]:
                    - text: 
                    - generic [ref=e219]: Copy to Clipboard
                  - link "Bench Office" [ref=e221] [cursor=pointer]:
                    - /url: http://127.0.0.1:8098/locations/1
              - generic [ref=e222]:
                - generic [ref=e223]:
                  - generic:
                    - term [ref=e224]: Purchase Cost
                    - definition [ref=e225]:
                      - emphasis [ref=e227]: No value
                    - term [ref=e228]:
                      - generic [ref=e229]: 
                      - text: Maintenances
                    - definition [ref=e230]: "0.00"
                    - term [ref=e231]:
                      - generic [ref=e232]: 
                      - text: Accessories
                    - definition [ref=e233]: "0.00"
                    - term [ref=e234]:
                      - generic [ref=e235]: 
                      - text: Licenses
                    - definition [ref=e236]: "0.00"
                    - term [ref=e237]:
                      - generic [ref=e238]: 
                      - text: Components
                    - definition [ref=e239]: "0.00"
                    - term [ref=e240]:
                      - generic [ref=e241]: 
                      - text: Assets
                    - definition [ref=e242]: "0.00"
                    - term [ref=e243]: Total Cost
                    - definition [ref=e244]: "0.00"
                - generic [ref=e245]:
                  - generic:
                    - term [ref=e246]:
                      - generic [ref=e247]: 
                      - text: Active Maintenances
                    - definition [ref=e248]: "0"
                    - term [ref=e249]:
                      - generic [ref=e250]: 
                      - text: Checkouts
                    - definition [ref=e251]: "1"
                    - term [ref=e252]:
                      - generic [ref=e253]: 
                      - text: Checkins
                    - definition [ref=e254]: "0"
                    - term [ref=e255]:
                      - generic [ref=e256]: 
                      - text: Requests
                    - definition [ref=e257]: "0"
                - 'img "QR code for fwsi14-cv3-c3 Bench Asset #BA-00014 - Bench Laptop Model" [ref=e259]'
            - text:       +         +           +       +                                         +     
        - generic [ref=e262]:
          - generic [ref=e264]:
            - link [ref=e265] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/14/checkin
              - generic [ref=e266]: 
            - link [ref=e267] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/14/edit
              - generic [ref=e268]: 
            - link [ref=e269] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/14/clone
              - generic [ref=e270]: 
            - link [ref=e271] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e272]: 
            - link [ref=e274] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/14/audit
              - generic [ref=e275]: 
            - button [ref=e277] [cursor=pointer]:
              - generic [ref=e278]: 
            - button [ref=e279] [cursor=pointer]:
              - generic [ref=e280]: 
          - list [ref=e282]:
            - listitem [ref=e283]:
              - generic [ref=e284]: 
              - generic [ref=e285]:
                - text: 
                - generic [ref=e286]: Copy to Clipboard
              - link "Bench Laptop Model" [ref=e288] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/models/1
            - listitem [ref=e289]:
              - generic [ref=e290]: "#"
              - text: Model No.
              - generic [ref=e291]:
                - text: 
                - generic [ref=e292]: Copy to Clipboard
            - listitem [ref=e293]:
              - generic [ref=e294]: 
              - generic [ref=e295]:
                - text: 
                - generic [ref=e296]: Copy to Clipboard
              - link "Bench Laptops" [ref=e298] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/categories/2
            - listitem [ref=e299]:
              - generic [ref=e300]: 
              - link "Bench Manufacturer" [ref=e301] [cursor=pointer]:
                - /url: http://127.0.0.1:8098/manufacturers/1
              - generic [ref=e303]: +
            - listitem [ref=e304]:
              - generic [ref=e305]: 
              - text: Purchased 2026-03-15 - 6 months 1 week ago
            - listitem [ref=e306]:
              - generic [ref=e307]: 
              - text: BYOD
            - listitem [ref=e308]:
              - generic [ref=e309]: 
              - text: Requestable
            - listitem [ref=e310]:
              - generic [ref=e311]:
                - generic [ref=e312]: 
                - text: Created By
                - link "Bench Admin" [ref=e313] [cursor=pointer]:
                  - /url: http://127.0.0.1:8098/users/1
            - listitem [ref=e314]:
              - generic [ref=e315]:
                - generic [ref=e316]: 
                - text: Created 2026-09-26 12:39 AM
            - listitem [ref=e317]:
              - generic [ref=e318]:
                - generic [ref=e319]: 
                - text: Updated 2026-09-26 12:39 AM
    - contentinfo [ref=e320]:
      - generic [ref=e321]:
        - generic [ref=e322]:
          - link "Snipe-IT" [ref=e323] [cursor=pointer]:
            - /url: https://snipeitapp.com
          - text: is open source software, made with
          - generic [ref=e324]: 
          - generic [ref=e325]: love
          - text: by Grokability, Inc.
          - link "" [ref=e326] [cursor=pointer]:
            - /url: https://bsky.app/profile/snipeitapp.com
            - generic [ref=e327]: 
          - link "" [ref=e328] [cursor=pointer]:
            - /url: https://github.com/grokability/snipe-it/
            - generic [ref=e329]: 
          - link "" [ref=e330] [cursor=pointer]:
            - /url: https://hachyderm.io/@grokability
            - generic [ref=e331]: 
          - link "" [ref=e332] [cursor=pointer]:
            - /url: https://discord.gg/yZFtShAcKk
            - generic [ref=e333]: 
        - generic [ref=e334]:
          - text: Version v8.7.2 - build 24589 (master)
          - link "User's Manual" [ref=e335] [cursor=pointer]:
            - /url: https://snipe-it.readme.io/docs/overview
          - link "Report a bug" [ref=e336] [cursor=pointer]:
            - /url: https://snipeitapp.com/support/
```

# Test source

```ts
  12559 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  12560 | function errorPageGate(page: Page, where: string): void {
  12561 |   const stop = errorPageVerdict(page.url(), where);
  12562 |   if (stop) throw new Error(stop);
  12563 | }
  12564 | 
  12565 | /**
  12566 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  12567 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  12568 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  12569 |  * literal segments is treated as volatile (warned, continued), anything else
  12570 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  12571 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  12572 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  12573 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  12574 |  * step's click reported of the link it clicked (the shared beginAction): a
  12575 |  * click that went where its link points, recorded as staying on the page it
  12576 |  * left, is the shared linkLandingWarning and waits for nothing.
  12577 |  */
  12578 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  12579 |   if (!urlMatches(pattern, page.url(), p)) {
  12580 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  12581 |     if (landed) return logWarning(landed);
  12582 |   }
  12583 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  12584 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  12585 |   for (const line of verdict.warnings) logWarning(line);
  12586 |   // What this step watched vary is the segment's evidence from here on
  12587 |   // (navigationTarget), whether or not the step goes on to stop.
  12588 |   if (verdict.diffs) volatile.push(...verdict.diffs);
  12589 |   if (verdict.stop) throw new Error(verdict.stop);
  12590 | }
  12591 | 
  12592 | /**
  12593 |  * Where a goto actually sends the browser — the shared retargetNavigation
  12594 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  12595 |  * the live url sits at a position THIS segment has already watched vary is a
  12596 |  * literal from the recording's run, and the live value is navigated to
  12597 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  12598 |  * one per replayed skill. The returned `stale` is handed to this step's
  12599 |  * alert gate, so an unrecorded alert on the landing names the cause.
  12600 |  */
  12601 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  12602 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  12603 |   if (verdict.warning) logWarning(verdict.warning);
  12604 |   return verdict;
  12605 | }
  12606 | 
  12607 | /**
  12608 |  * The alert observation a step is judged by, taken where the daemon takes
  12609 |  * its diff: after the action, once the DOM has settled (tools.ts
  12610 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  12611 |  * inside verify's url window is seen by both runners or by neither.
  12612 |  * Rendered in the step's line dialect, with whether every live region was
  12613 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  12614 |  */
  12615 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  12616 |   await settle(page);
  12617 |   return liveAlertsObserved(page, dialect);
  12618 | }
  12619 | 
  12620 | /**
  12621 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  12622 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  12623 |  * and stops a state-changing step only when its recorded page changes did
  12624 |  * not confirm it worked (a rejection toast that leaves the page superficially
  12625 |  * intact); a recorded-but-missing one only warns.
  12626 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  12627 |  * `after` in settle, right after the action has settled and BEFORE the url
  12628 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  12629 |  * during a 5s url wait must not be missed) — and a page that could not be
  12630 |  * read is handed over as unobserved, never as "no alert".
  12631 |  */
  12632 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  12633 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  12634 |   for (const line of verdict.warnings) logWarning(line);
  12635 |   if (verdict.stop) throw new Error(verdict.stop);
  12636 | }
  12637 | 
  12638 | /**
  12639 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  12640 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  12641 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  12642 |  * page structure agrees, anything else refuses before the first step acts.
  12643 |  * `similarity` is what replay's adapter passes: where the recording kept a
  12644 |  * page fingerprint, the call site measures the live page with the shared
  12645 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  12646 |  * could not be read, exactly as replay; null where the recording kept none
  12647 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  12648 |  * compiled before the vector travelled, which refuses a soft match it cannot
  12649 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  12650 |  * (arguments evaluate left to right), as replay reads startUrl before it
  12651 |  * fingerprints: both describe the page as the segment found it, not where a
  12652 |  * navigation in flight landed during the measurement. Async so the call site
  12653 |  * must await it: a gate that could be left un-awaited is one that can
  12654 |  * silently become a no-op.
  12655 |  */
  12656 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  12657 |   const verdict = preconditionVerdict(pattern, url, p, similarity, mints);
  12658 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
> 12659 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
        |                             ^ Error: 03-open s_862d91: not on the page this procedure starts from (expects http://127.0.0.1:8098/hardware/14#history, browser is at http://127.0.0.1:8098/hardware/14) — nothing of this segment has run
  12660 | }
  12661 | 
  12662 | /**
  12663 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  12664 |  * source of truth, so the vector is carried once. A segment the emitter
  12665 |  * asked this of always has one; its absence means FLOW was edited by hand,
  12666 |  * and the gate fails closed rather than soft-match on the url alone.
  12667 |  */
  12668 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  12669 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  12670 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  12671 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  12672 |   return recorded;
  12673 | }
  12674 | 
  12675 | /**
  12676 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  12677 |  *
  12678 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  12679 |  * action and, when the action changed it, awaits settleDom before binding
  12680 |  * the step's derived values — the value a spec needs is the one on the url
  12681 |  * the step navigated TO, and `page.url()` read in the same tick as the
  12682 |  * click still says where the page came FROM. Bound empty, every pattern
  12683 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  12684 |  *
  12685 |  * ALL of them together, not one at a time, because they are read into ONE
  12686 |  * pattern: an app is free to populate its state fragment key by key (odoo
  12687 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  12688 |  * that binds the instant IT is non-empty can be bound off a half-built url
  12689 |  * while its neighbour is still missing. The step is not where it was
  12690 |  * recorded until every part is there.
  12691 |  *
  12692 |  * A spec has no settleDom, so it polls on the shared resolve cadence
  12693 |  * (RESOLVE_POLL_MS) within the window
  12694 |  * replay effectively allows a url (URL_WAIT_MS), and takes one last reading
  12695 |  * at the deadline: a step whose url genuinely does not change (the parts were
  12696 |  * already there) must still bind what is there rather than hang or throw.
  12697 |  *
  12698 |  * The parts themselves come from the shared `urlPart` (src/execution/url.ts),
  12699 |  * the daemon's own labelling; a part the url does not carry is undefined.
  12700 |  */
  12701 | async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {
  12702 |   const read = (url: string) => labels.map((label) => urlPart(url, label));
  12703 |   for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {
  12704 |     const url = page.url();
  12705 |     const values = read(url);
  12706 |     if (url !== urlBefore && values.every(Boolean)) {
  12707 |       // The parts are there — but an app is free to redirect AGAIN from
  12708 |       // the url that first carried them, and the value that matters is
  12709 |       // the one on the url the step SETTLES on. Replay never sees this,
  12710 |       // because it binds derived values only after settleDom absorbs the
  12711 |       // whole redirect chain. So: let the DOM go quiet, and if the url
  12712 |       // moved while it did, settle once more before reading.
  12713 |       for (let pass = 0; pass < 2; pass++) {
  12714 |         const before = page.url();
  12715 |         await settle(page);
  12716 |         if (page.url() === before) break;
  12717 |       }
  12718 |       return read(page.url());
  12719 |     }
  12720 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  12721 |   }
  12722 |   return read(page.url());
  12723 | }
  12724 | 
  12725 | /** One part, on the same terms. `urlBefore` is omitted where no action of this step
  12726 |   * moved the page: then the wait is simply for the part to be there at all, which is
  12727 |   * what the flow runner does before it publishes a step's url outputs (consumedUrlOutputs). */
  12728 | async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {
  12729 |   return (await urlPartsWhen(page, [label], urlBefore))[0];
  12730 | }
  12731 | 
  12732 | /**
  12733 |  * A derived value, bound as replay binds it: only when the url carries the
  12734 |  * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,
  12735 |  * which urlDiff reads as a wildcard and a locator as text no page shows.
  12736 |  */
  12737 | function bindPart(p: Record<string, string>, name: string, value: string | undefined): void {
  12738 |   if (value !== undefined) p[name] = value;
  12739 | }
  12740 | 
  12741 | const CLICK_TIER_MS = 5000;
  12742 | async function click(loc: Locator, opts: { dbl?: boolean; obs?: ActionObservation | null } = {}): Promise<void> {
  12743 |   // The tiers are cut to what is left of the action's deadline, and report how the click went out.
  12744 |   await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });
  12745 | }
  12746 | 
  12747 | /** The words the daemon reports a verified recipe in (its tool result), as a grep-able line. */
  12748 | function logRecipe(attempt: RecipeAttempt): void {
  12749 |   console.log(`[sitelooper recipe] ${describeRecipeAttempt(attempt)}`);
  12750 | }
  12751 | 
  12752 | /**
  12753 |  * A recorded `fill`, executed as tools.ts's `case 'fill'` executes it: the
  12754 |  * shared ladder `fillWithRecipe` (src/execution/recipes.ts, embedded above)
  12755 |  * — the component recipe first, verified against the widget's own read,
  12756 |  * and the native reactSafeFill only when nothing was verified. Both halves
  12757 |  * matter. A keyboard-driven editor has no value property to set (monaco's
  12758 |  * `<textarea>` is an input sink and the text you see is a rendered
  12759 |  * `.view-lines` div), so a native setter writes into a box the editor never
```