# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwsi18.spec.ts >> fwsi18
- Location: fwsi18.spec.ts:9:1

# Error details

```
Error: 06-open s_d5d63a/5 raised an alert the recording never saw: This asset has been deleted. You must restore it before you can assign it to someone.
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
        - 'heading "Assets fwsi18-n1 Bench Asset #BA-00004 - Bench Laptop Model" [level=1] [ref=e107]':
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
            - listitem [ref=e116]: "fwsi18-n1 Bench Asset #BA-00004 - Bench Laptop Model"
        - button "Show/Hide More Information" [ref=e118] [cursor=pointer]: 
      - generic [ref=e121]:
        - alert [ref=e123]:
          - generic [ref=e124]: 
          - text: This asset has been deleted. You must restore it before you can assign it to someone.
        - generic [ref=e126]:
          - tablist [ref=e127]:
            - link "Details" [ref=e128]:
              - /url: "#details"
              - text: 
              - generic [ref=e130]: 
              - generic [ref=e131]: Details
            - link "Licenses" [ref=e132] [cursor=pointer]:
              - /url: "#licenses"
              - text: 
              - generic [ref=e134]: 
              - generic [ref=e135]: Licenses
            - link "Components" [ref=e136] [cursor=pointer]:
              - /url: "#components"
              - text: 
              - generic [ref=e138]: 
              - generic [ref=e139]: Components
            - link "Assets" [ref=e140] [cursor=pointer]:
              - /url: "#assets"
              - text: 
              - generic [ref=e142]: 
              - generic [ref=e143]: Assets
            - link "Accessories" [ref=e144] [cursor=pointer]:
              - /url: "#accessories"
              - text: 
              - generic [ref=e146]: 
              - generic [ref=e147]: Accessories
            - link "Maintenances" [ref=e148] [cursor=pointer]:
              - /url: "#maintenances"
              - text: 
              - generic [ref=e150]: 
              - generic [ref=e151]: Maintenances
            - link "Audits" [ref=e152] [cursor=pointer]:
              - /url: "#audits"
              - text: 
              - generic [ref=e154]: 
              - generic [ref=e155]: Audits
            - link "Notes" [ref=e156] [cursor=pointer]:
              - /url: "#notes"
              - text: 
              - generic [ref=e158]: 
              - generic [ref=e159]: Notes
            - link "Files" [ref=e160] [cursor=pointer]:
              - /url: "#files"
              - text: 
              - generic [ref=e162]: 
              - generic [ref=e163]: Files
            - link "Additional Files" [ref=e164] [cursor=pointer]:
              - /url: "#model-files"
              - text: 
              - generic [ref=e166]: 
              - generic [ref=e167]: Additional Files
            - link "History 4" [ref=e168] [cursor=pointer]:
              - /url: "#history"
              - text: 
              - generic [ref=e170]: 
              - generic [ref=e171]: History
              - generic [ref=e172]: "4"
            - link [ref=e173] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e174]: 
          - generic [ref=e175]:
            - generic [ref=e178]:
              - generic [ref=e181]:
                - generic [ref=e182]: 
                - link "Ready to Deploy" [ref=e183] [cursor=pointer]:
                  - /url: http://127.0.0.1:8098/statuslabels/2
                - text: deployable
              - generic [ref=e185]:
                - generic [ref=e186]: 
                - strong [ref=e187]: Last Checkout
                - text: 2026-09-26 10 minutes 50 seconds ago
              - generic [ref=e189]:
                - generic [ref=e190]: 
                - strong [ref=e191]: Expected Checkin
                - text: N/A
              - generic [ref=e196]:
                - term [ref=e197]: Asset Tag
                - definition [ref=e198]:
                  - generic [ref=e199]:
                    - text: 
                    - generic [ref=e200]: Copy to Clipboard
                  - text: BA-00004
                - term [ref=e201]: Asset Name
                - definition [ref=e202]:
                  - generic [ref=e203]:
                    - text: 
                    - generic [ref=e204]: Copy to Clipboard
                  - text: fwsi18-n1 Bench Asset
                - term [ref=e205]: Current Value
                - definition [ref=e206]:
                  - emphasis [ref=e208]: No value
                - term [ref=e209]: Last Audit
                - definition [ref=e210]:
                  - emphasis [ref=e212]: No value
                - term [ref=e213]: Next Audit Date
                - definition [ref=e214]:
                  - emphasis [ref=e216]: No value
                - term [ref=e217]: Default Location
                - definition [ref=e218]:
                  - generic [ref=e219]:
                    - text: 
                    - generic [ref=e220]: Copy to Clipboard
                  - link "Bench Office" [ref=e222] [cursor=pointer]:
                    - /url: http://127.0.0.1:8098/locations/1
              - generic [ref=e223]:
                - generic [ref=e224]:
                  - generic:
                    - term [ref=e225]: Purchase Cost
                    - definition [ref=e226]:
                      - emphasis [ref=e228]: No value
                    - term [ref=e229]:
                      - generic [ref=e230]: 
                      - text: Maintenances
                    - definition [ref=e231]: "0.00"
                    - term [ref=e232]:
                      - generic [ref=e233]: 
                      - text: Accessories
                    - definition [ref=e234]: "0.00"
                    - term [ref=e235]:
                      - generic [ref=e236]: 
                      - text: Licenses
                    - definition [ref=e237]: "0.00"
                    - term [ref=e238]:
                      - generic [ref=e239]: 
                      - text: Components
                    - definition [ref=e240]: "0.00"
                    - term [ref=e241]:
                      - generic [ref=e242]: 
                      - text: Assets
                    - definition [ref=e243]: "0.00"
                    - term [ref=e244]: Total Cost
                    - definition [ref=e245]: "0.00"
                - generic [ref=e246]:
                  - generic:
                    - term [ref=e247]:
                      - generic [ref=e248]: 
                      - text: Active Maintenances
                    - definition [ref=e249]: "0"
                    - term [ref=e250]:
                      - generic [ref=e251]: 
                      - text: Checkouts
                    - definition [ref=e252]: "1"
                    - term [ref=e253]:
                      - generic [ref=e254]: 
                      - text: Checkins
                    - definition [ref=e255]: "1"
                    - term [ref=e256]:
                      - generic [ref=e257]: 
                      - text: Requests
                    - definition [ref=e258]: "0"
                - 'img "QR code for fwsi18-n1 Bench Asset #BA-00004 - Bench Laptop Model" [ref=e260]'
            - text:       +         +           +       +                                         +           
        - generic [ref=e261]: "     #       +       "
    - contentinfo [ref=e262]:
      - generic [ref=e263]:
        - generic [ref=e264]:
          - link "Snipe-IT" [ref=e265] [cursor=pointer]:
            - /url: https://snipeitapp.com
          - text: is open source software, made with
          - generic [ref=e266]: 
          - generic [ref=e267]: love
          - text: by Grokability, Inc.
          - link "" [ref=e268] [cursor=pointer]:
            - /url: https://bsky.app/profile/snipeitapp.com
            - generic [ref=e269]: 
          - link "" [ref=e270] [cursor=pointer]:
            - /url: https://github.com/grokability/snipe-it/
            - generic [ref=e271]: 
          - link "" [ref=e272] [cursor=pointer]:
            - /url: https://hachyderm.io/@grokability
            - generic [ref=e273]: 
          - link "" [ref=e274] [cursor=pointer]:
            - /url: https://discord.gg/yZFtShAcKk
            - generic [ref=e275]: 
        - generic [ref=e276]:
          - text: Version v8.7.2 - build 24589 (master)
          - link "User's Manual" [ref=e277] [cursor=pointer]:
            - /url: https://snipe-it.readme.io/docs/overview
          - link "Report a bug" [ref=e278] [cursor=pointer]:
            - /url: https://snipeitapp.com/support/
```

# Test source

```ts
  14436 | }
  14437 | 
  14438 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  14439 | let lastReadHit: Locator | null = null;
  14440 | 
  14441 | /**
  14442 |  * A published read whose value is only what this segment itself typed,
  14443 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  14444 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  14445 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  14446 |  * the value is still published, as replay still carries it to later steps.
  14447 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  14448 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  14449 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  14450 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  14451 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  14452 |  */
  14453 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  14454 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  14455 |   if (!echo) return;
  14456 |   run.echoed.push(key);
  14457 |   logWarning(echo);
  14458 | }
  14459 | 
  14460 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  14461 | function errorPageGate(page: Page, where: string): void {
  14462 |   const stop = errorPageVerdict(page.url(), where);
  14463 |   if (stop) throw new Error(stop);
  14464 | }
  14465 | 
  14466 | /**
  14467 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  14468 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  14469 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  14470 |  * literal segments is treated as volatile (warned, continued), anything else
  14471 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  14472 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  14473 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  14474 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  14475 |  * step's click reported of the link it clicked (the shared beginAction): a
  14476 |  * click that went where its link points, recorded as staying on the page it
  14477 |  * left, is the shared linkLandingWarning and waits for nothing.
  14478 |  */
  14479 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  14480 |   if (!urlMatches(pattern, page.url(), p)) {
  14481 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  14482 |     if (landed) return logWarning(landed);
  14483 |   }
  14484 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  14485 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  14486 |   for (const line of verdict.warnings) logWarning(line);
  14487 |   // What this step watched vary is the segment's evidence from here on
  14488 |   // (navigationTarget), whether or not the step goes on to stop.
  14489 |   if (verdict.diffs) volatile.push(...verdict.diffs);
  14490 |   if (verdict.stop) throw new Error(verdict.stop);
  14491 | }
  14492 | 
  14493 | /**
  14494 |  * Where a goto actually sends the browser — the shared retargetNavigation
  14495 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  14496 |  * the live url sits at a position THIS segment has already watched vary is a
  14497 |  * literal from the recording's run, and the live value is navigated to
  14498 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  14499 |  * one per replayed skill. The returned `stale` is handed to this step's
  14500 |  * alert gate, so an unrecorded alert on the landing names the cause.
  14501 |  */
  14502 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  14503 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  14504 |   if (verdict.warning) logWarning(verdict.warning);
  14505 |   return verdict;
  14506 | }
  14507 | 
  14508 | /**
  14509 |  * The alert observation a step is judged by, taken where the daemon takes
  14510 |  * its diff: after the action, once the DOM has settled (tools.ts
  14511 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  14512 |  * inside verify's url window is seen by both runners or by neither.
  14513 |  * Rendered in the step's line dialect, with whether every live region was
  14514 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  14515 |  */
  14516 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  14517 |   await settle(page);
  14518 |   return liveAlertsObserved(page, dialect);
  14519 | }
  14520 | 
  14521 | /**
  14522 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  14523 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  14524 |  * and stops a state-changing step only when its recorded page changes did
  14525 |  * not confirm it worked (a rejection toast that leaves the page superficially
  14526 |  * intact); a recorded-but-missing one only warns.
  14527 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  14528 |  * `after` in settle, right after the action has settled and BEFORE the url
  14529 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  14530 |  * during a 5s url wait must not be missed) — and a page that could not be
  14531 |  * read is handed over as unobserved, never as "no alert".
  14532 |  */
  14533 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  14534 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  14535 |   for (const line of verdict.warnings) logWarning(line);
> 14536 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: 06-open s_d5d63a/5 raised an alert the recording never saw: This asset has been deleted. You must restore it before you can assign it to someone.
  14537 | }
  14538 | 
  14539 | /**
  14540 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  14541 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  14542 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  14543 |  * page structure agrees, anything else refuses before the first step acts.
  14544 |  * `similarity` is what replay's adapter passes: where the recording kept a
  14545 |  * page fingerprint, the call site measures the live page with the shared
  14546 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  14547 |  * could not be read, exactly as replay; null where the recording kept none
  14548 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  14549 |  * compiled before the vector travelled, which refuses a soft match it cannot
  14550 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  14551 |  * (arguments evaluate left to right), as replay reads startUrl before it
  14552 |  * fingerprints: both describe the page as the segment found it, not where a
  14553 |  * navigation in flight landed during the measurement. Async so the call site
  14554 |  * must await it: a gate that could be left un-awaited is one that can
  14555 |  * silently become a no-op.
  14556 |  */
  14557 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  14558 |   const verdict = preconditionVerdict(pattern, url, p, similarity, mints);
  14559 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  14560 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  14561 | }
  14562 | 
  14563 | /**
  14564 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  14565 |  * source of truth, so the vector is carried once. A segment the emitter
  14566 |  * asked this of always has one; its absence means FLOW was edited by hand,
  14567 |  * and the gate fails closed rather than soft-match on the url alone.
  14568 |  */
  14569 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  14570 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  14571 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  14572 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  14573 |   return recorded;
  14574 | }
  14575 | 
  14576 | /**
  14577 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  14578 |  *
  14579 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  14580 |  * action and, when the action changed it, awaits settleDom before binding
  14581 |  * the step's derived values — the value a spec needs is the one on the url
  14582 |  * the step navigated TO, and `page.url()` read in the same tick as the
  14583 |  * click still says where the page came FROM. Bound empty, every pattern
  14584 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  14585 |  *
  14586 |  * ALL of them together, not one at a time, because they are read into ONE
  14587 |  * pattern: an app is free to populate its state fragment key by key (odoo
  14588 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  14589 |  * that binds the instant IT is non-empty can be bound off a half-built url
  14590 |  * while its neighbour is still missing. The step is not where it was
  14591 |  * recorded until every part is there.
  14592 |  *
  14593 |  * A spec has no settleDom, so it polls on the shared resolve cadence
  14594 |  * (RESOLVE_POLL_MS) within the window
  14595 |  * replay effectively allows a url (URL_WAIT_MS), and takes one last reading
  14596 |  * at the deadline: a step whose url genuinely does not change (the parts were
  14597 |  * already there) must still bind what is there rather than hang or throw.
  14598 |  *
  14599 |  * The parts themselves come from the shared `urlPart` (src/execution/url.ts),
  14600 |  * the daemon's own labelling; a part the url does not carry is undefined.
  14601 |  */
  14602 | async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {
  14603 |   const read = (url: string) => labels.map((label) => urlPart(url, label));
  14604 |   for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {
  14605 |     const url = page.url();
  14606 |     const values = read(url);
  14607 |     if (url !== urlBefore && values.every(Boolean)) {
  14608 |       // The parts are there — but an app is free to redirect AGAIN from
  14609 |       // the url that first carried them, and the value that matters is
  14610 |       // the one on the url the step SETTLES on. Replay never sees this,
  14611 |       // because it binds derived values only after settleDom absorbs the
  14612 |       // whole redirect chain. So: let the DOM go quiet, and if the url
  14613 |       // moved while it did, settle once more before reading.
  14614 |       for (let pass = 0; pass < 2; pass++) {
  14615 |         const before = page.url();
  14616 |         await settle(page);
  14617 |         if (page.url() === before) break;
  14618 |       }
  14619 |       return read(page.url());
  14620 |     }
  14621 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  14622 |   }
  14623 |   return read(page.url());
  14624 | }
  14625 | 
  14626 | /** One part, on the same terms. `urlBefore` is omitted where no action of this step
  14627 |   * moved the page: then the wait is simply for the part to be there at all, which is
  14628 |   * what the flow runner does before it publishes a step's url outputs (consumedUrlOutputs). */
  14629 | async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {
  14630 |   return (await urlPartsWhen(page, [label], urlBefore))[0];
  14631 | }
  14632 | 
  14633 | /**
  14634 |  * A derived value, bound as replay binds it: only when the url carries the
  14635 |  * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,
  14636 |  * which urlDiff reads as a wildcard and a locator as text no page shows.
```