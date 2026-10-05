# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hsdx3.spec.ts >> hsdx3
- Location: hsdx3.spec.ts:9:1

# Error details

```
Error: 04-open s_121712: not on the page this procedure starts from (expects http://127.0.0.1:8101/admin/content/tickets/+, browser is at http://127.0.0.1:8101/admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736) — nothing of this segment has run
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - list [ref=e5]:
    - link "Skip to Module Navigation" [ref=e6] [cursor=pointer]:
      - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#module-navigation
    - link "Skip to Main Content" [ref=e7] [cursor=pointer]:
      - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#main-content
    - link "Skip to Sidebar" [ref=e8] [cursor=pointer]:
      - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#sidebar
  - generic [ref=e9]:
    - generic [ref=e12]:
      - link [ref=e14] [cursor=pointer]:
        - /url: /admin/content
        - img [ref=e17]
      - link "people_alt" [ref=e20] [cursor=pointer]:
        - /url: /admin/users
        - generic [ref=e23]: people_alt
      - link "folder" [ref=e25] [cursor=pointer]:
        - /url: /admin/files
        - generic [ref=e28]: folder
      - link "insights" [ref=e30] [cursor=pointer]:
        - /url: /admin/insights
        - generic [ref=e33]: insights
      - link "help" [ref=e35] [cursor=pointer]:
        - /url: https://docs.directus.io
        - generic [ref=e38]: help
      - link "settings" [ref=e40] [cursor=pointer]:
        - /url: /admin/settings
        - generic [ref=e43]: settings
    - generic [ref=e44]:
      - button "notifications" [ref=e47] [cursor=pointer]:
        - generic [ref=e50]: notifications
      - generic [ref=e51]:
        - button [ref=e54] [cursor=pointer]:
          - img [ref=e57]
        - link "account_circle" [ref=e60] [cursor=pointer]:
          - /url: /admin/users/54b4789b-dbba-41f8-aaa8-0c69846d2927
          - generic [ref=e63]: account_circle
  - generic [ref=e64]:
    - generic [ref=e65]:
      - list [ref=e66]:
        - link "Skip to Navigation" [ref=e67] [cursor=pointer]:
          - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#navigation
        - link "Skip to Main Content" [ref=e68] [cursor=pointer]:
          - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#main-content
        - link "Skip to Sidebar" [ref=e69] [cursor=pointer]:
          - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#sidebar
      - navigation "Module Navigation" [ref=e70]:
        - generic [ref=e71]:
          - generic [ref=e73]: Bench Desk
          - button "left_panel_close" [ref=e74] [cursor=pointer]:
            - generic [ref=e75]: left_panel_close
        - list [ref=e78]:
          - link "business Customers" [ref=e79] [cursor=pointer]:
            - /url: /admin/content/customers
            - generic [ref=e82]: business
            - generic [ref=e84]: Customers
          - link "confirmation_number Tickets" [ref=e85] [cursor=pointer]:
            - /url: /admin/content/tickets
            - generic [ref=e88]: confirmation_number
            - generic [ref=e90]: Tickets
    - separator "Resize"
    - generic [ref=e92]:
      - list [ref=e93]:
        - link "Skip to Navigation" [ref=e94] [cursor=pointer]:
          - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#navigation
        - link "Skip to Module Navigation" [ref=e95] [cursor=pointer]:
          - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#module-navigation
        - link "Skip to Sidebar" [ref=e96] [cursor=pointer]:
          - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#sidebar
      - generic [ref=e98]:
        - generic [ref=e100]:
          - banner [ref=e101]:
            - generic [ref=e102]:
              - button "arrow_back" [ref=e105] [cursor=pointer]:
                - generic [ref=e108]: arrow_back
              - generic [ref=e109]:
                - link "Tickets" [ref=e114] [cursor=pointer]:
                  - /url: /admin/content/tickets
                - heading "hsdx3-spec Bench Ticket" [level=1] [ref=e116]:
                  - generic [ref=e118]: hsdx3-spec Bench Ticket
              - button "right_panel_close" [ref=e119] [cursor=pointer]:
                - generic [ref=e120]: right_panel_close
            - generic [ref=e121]:
              - button "delete" [ref=e124] [cursor=pointer]:
                - generic [ref=e127]: delete
              - button "check" [disabled] [ref=e129]:
                - generic [ref=e132]: check
          - main [ref=e133]:
            - generic [ref=e136]:
              - generic [ref=e137]:
                - button "Title star arrow_drop_down" [ref=e141] [cursor=pointer]:
                  - generic [ref=e142]:
                    - generic [ref=e143]: Title
                    - generic [ref=e145]: star
                  - generic [ref=e147]: arrow_drop_down
                - textbox [ref=e152]: hsdx3-spec Bench Ticket
              - generic [ref=e153]:
                - button "Status arrow_drop_down" [ref=e157] [cursor=pointer]:
                  - generic [ref=e159]: Status
                  - generic [ref=e161]: arrow_drop_down
                - generic [ref=e167] [cursor=pointer]:
                  - textbox "Select an item...": In progress
                  - generic [ref=e170]: expand_more
              - generic [ref=e171]:
                - button "Customer arrow_drop_down" [ref=e175] [cursor=pointer]:
                  - generic [ref=e177]: Customer
                  - generic [ref=e179]: arrow_drop_down
                - button "Bench Customer edit close" [ref=e183] [cursor=pointer]:
                  - generic [ref=e186]: Bench Customer
                  - generic [ref=e187]:
                    - button "edit" [ref=e188]:
                      - generic [ref=e189]: edit
                    - button "close" [ref=e190]:
                      - generic [ref=e191]: close
              - generic [ref=e192]:
                - button "Due Date arrow_drop_down" [ref=e196] [cursor=pointer]:
                  - generic [ref=e198]: Due Date
                  - generic [ref=e200]: arrow_drop_down
                - button "December 31st, 2026 close" [ref=e205] [cursor=pointer]:
                  - text: December 31st, 2026
                  - button "close" [ref=e207]:
                    - generic [ref=e208]: close
              - generic [ref=e209]:
                - button "Estimated Hours arrow_drop_down" [ref=e213] [cursor=pointer]:
                  - generic [ref=e215]: Estimated Hours
                  - generic [ref=e217]: arrow_drop_down
                - generic [ref=e221]:
                  - spinbutton [ref=e222]: "6"
                  - generic [ref=e223]:
                    - button "keyboard_arrow_up" [ref=e224] [cursor=pointer]:
                      - generic [ref=e225]: keyboard_arrow_up
                    - button "keyboard_arrow_down" [ref=e226] [cursor=pointer]:
                      - generic [ref=e227]: keyboard_arrow_down
              - generic [ref=e228]:
                - button "Tags arrow_drop_down" [ref=e232] [cursor=pointer]:
                  - generic [ref=e234]: Tags
                  - generic [ref=e236]: arrow_drop_down
                - generic [ref=e239]:
                  - generic [ref=e241]:
                    - textbox "Add a tag and press Enter..." [ref=e242]
                    - generic [ref=e245]: local_offer
                  - generic [ref=e247]:
                    - button "hardware" [pressed] [ref=e248] [cursor=pointer]:
                      - generic [ref=e249]: hardware
                    - button "hardware-return" [pressed] [ref=e250] [cursor=pointer]:
                      - generic [ref=e251]: hardware-return
                    - button "software" [pressed] [ref=e252] [cursor=pointer]:
                      - generic [ref=e253]: software
                    - button "network" [pressed] [ref=e254] [cursor=pointer]:
                      - generic [ref=e255]: network
                    - button "billing" [pressed] [ref=e256] [cursor=pointer]:
                      - generic [ref=e257]: billing
              - generic [ref=e258]:
                - button "Description arrow_drop_down" [ref=e262] [cursor=pointer]:
                  - generic [ref=e264]: Description
                  - generic [ref=e266]: arrow_drop_down
                - application [ref=e270]:
                  - generic [ref=e271]:
                    - group [ref=e273]:
                      - group [ref=e274]:
                        - toolbar [ref=e275]:
                          - button "Bold" [ref=e276]:
                            - generic [ref=e277]: format_bold
                          - button "Italic" [ref=e278]:
                            - generic [ref=e279]: format_italic
                          - button "Underline" [ref=e280]:
                            - generic [ref=e281]: format_underlined
                          - button "Heading 1" [ref=e282]:
                            - generic [ref=e283]: H1
                          - button "Heading 2" [ref=e284]:
                            - generic [ref=e285]: H2
                          - button "Heading 3" [ref=e286]:
                            - generic [ref=e287]: H3
                          - button "Numbered List" [ref=e288]:
                            - img [ref=e290]
                          - button "Bullet List" [ref=e292]:
                            - img [ref=e294]
                          - button "Remove Format" [ref=e296]:
                            - img [ref=e298]
                          - button "Blockquote" [ref=e300]:
                            - img [ref=e302]
                          - button "Add/Edit Link" [ref=e304]:
                            - generic [ref=e305]: insert_link
                          - button "Add/Edit Image" [ref=e306]:
                            - img [ref=e308]
                          - button "Add/Edit Media" [ref=e310]:
                            - img [ref=e312]
                          - button "Horizontal Rule" [ref=e314]:
                            - img [ref=e316]
                          - button "Edit Source Code" [ref=e318]:
                            - img [ref=e320]
                          - button "Full Screen" [ref=e323]:
                            - img [ref=e325]
                    - iframe [ref=e329]:
                      - generic "Rich Text Area. Press ALT-0 for help." [active] [ref=f2e1]:
                        - paragraph [ref=f2e2]: hsdx3-spec
        - separator "Resize"
        - generic [ref=e332]:
          - list [ref=e333]:
            - link "Skip to Navigation" [ref=e334] [cursor=pointer]:
              - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#navigation
            - link "Skip to Module Navigation" [ref=e335] [cursor=pointer]:
              - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#module-navigation
            - link "Skip to Main Content" [ref=e336] [cursor=pointer]:
              - /url: /admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736#main-content
          - contentinfo "Module Sidebar" [ref=e337]:
            - generic [ref=e338]:
              - heading "1 change_history Revisions chevron_left" [level=3] [ref=e340]:
                - button "1 change_history Revisions chevron_left" [ref=e341] [cursor=pointer]:
                  - generic [ref=e342]:
                    - generic:
                      - generic: "1"
                    - generic [ref=e344]: change_history
                  - generic [ref=e345]: Revisions
                  - generic [ref=e347]: chevron_left
              - heading "chat_bubble_outline Comments chevron_left" [level=3] [ref=e349]:
                - button "chat_bubble_outline Comments chevron_left" [ref=e350] [cursor=pointer]:
                  - generic [ref=e353]: chat_bubble_outline
                  - generic [ref=e354]: Comments
                  - generic [ref=e356]: chevron_left
              - heading "share Shares chevron_left" [level=3] [ref=e358]:
                - button "share Shares chevron_left" [ref=e359] [cursor=pointer]:
                  - generic [ref=e362]: share
                  - generic [ref=e363]: Shares
                  - generic [ref=e365]: chevron_left
            - button "AI Assistant chevron_left" [ref=e367] [cursor=pointer]:
              - generic [ref=e368]:
                - img [ref=e369]
                - generic [ref=e372]: AI Assistant
                - generic [ref=e374]: chevron_left
```

# Test source

```ts
  16390 |   if (stop) throw new Error(stop);
  16391 | }
  16392 | 
  16393 | /**
  16394 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  16395 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  16396 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  16397 |  * literal segments is treated as volatile (warned, continued), anything else
  16398 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  16399 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  16400 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  16401 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  16402 |  * step's click reported of the link it clicked (the shared beginAction): a
  16403 |  * click that went where its link points, recorded as staying on the page it
  16404 |  * left, is the shared linkLandingWarning and waits for nothing.
  16405 |  */
  16406 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  16407 |   if (!urlMatches(pattern, page.url(), p)) {
  16408 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  16409 |     if (landed) return logWarning(landed);
  16410 |   }
  16411 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  16412 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  16413 |   for (const line of verdict.warnings) logWarning(line);
  16414 |   // What this step watched vary is the segment's evidence from here on
  16415 |   // (navigationTarget), whether or not the step goes on to stop.
  16416 |   if (verdict.diffs) volatile.push(...verdict.diffs);
  16417 |   if (verdict.stop) throw new Error(verdict.stop);
  16418 | }
  16419 | 
  16420 | /**
  16421 |  * Where a goto actually sends the browser — the shared retargetNavigation
  16422 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  16423 |  * the live url sits at a position THIS segment has already watched vary is a
  16424 |  * literal from the recording's run, and the live value is navigated to
  16425 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  16426 |  * one per replayed skill. The returned `stale` is handed to this step's
  16427 |  * alert gate, so an unrecorded alert on the landing names the cause.
  16428 |  */
  16429 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  16430 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  16431 |   if (verdict.warning) logWarning(verdict.warning);
  16432 |   return verdict;
  16433 | }
  16434 | 
  16435 | /**
  16436 |  * The alert observation a step is judged by, taken where the daemon takes
  16437 |  * its diff: after the action, once the DOM has settled (tools.ts
  16438 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  16439 |  * inside verify's url window is seen by both runners or by neither.
  16440 |  * Rendered in the step's line dialect, with whether every live region was
  16441 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  16442 |  */
  16443 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  16444 |   await settle(page);
  16445 |   return liveAlertsObserved(page, dialect);
  16446 | }
  16447 | 
  16448 | /**
  16449 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  16450 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  16451 |  * and stops a state-changing step only when its recorded page changes did
  16452 |  * not confirm it worked (a rejection toast that leaves the page superficially
  16453 |  * intact); a recorded-but-missing one only warns.
  16454 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  16455 |  * `after` in settle, right after the action has settled and BEFORE the url
  16456 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  16457 |  * during a 5s url wait must not be missed) — and a page that could not be
  16458 |  * read is handed over as unobserved, never as "no alert".
  16459 |  */
  16460 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  16461 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  16462 |   for (const line of verdict.warnings) logWarning(line);
  16463 |   if (verdict.stop) throw new Error(verdict.stop);
  16464 | }
  16465 | 
  16466 | /**
  16467 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  16468 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  16469 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  16470 |  * page structure agrees, anything else refuses before the first step acts.
  16471 |  * `similarity` is what replay's adapter passes: where the recording kept a
  16472 |  * page fingerprint, the call site measures the live page with the shared
  16473 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  16474 |  * could not be read, exactly as replay; null where the recording kept none
  16475 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  16476 |  * compiled before the vector travelled, which refuses a soft match it cannot
  16477 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  16478 |  * (arguments evaluate left to right), as replay reads startUrl before it
  16479 |  * fingerprints: both describe the page as the segment found it, not where a
  16480 |  * navigation in flight landed during the measurement. Async so the call site
  16481 |  * must await it: a gate that could be left un-awaited is one that can
  16482 |  * silently become a no-op. Decided as replay decides it: through
  16483 |  * preconditionVerdictWithFacts (src/execution/facts-route.ts) over the facts
  16484 |  * snapshot this file carries for the url (siteFactsAt), which is the plain
  16485 |  * preconditionVerdict wherever no reliable site fact bears on the url.
  16486 |  */
  16487 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  16488 |   const verdict = preconditionVerdictWithFacts(siteFactsAt(url), pattern, url, p, similarity, mints);
  16489 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
> 16490 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
        |                             ^ Error: 04-open s_121712: not on the page this procedure starts from (expects http://127.0.0.1:8101/admin/content/tickets/+, browser is at http://127.0.0.1:8101/admin/content/tickets/36b99f27-cc0d-4e5e-b6c8-ab095511f736) — nothing of this segment has run
  16491 | }
  16492 | 
  16493 | /**
  16494 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  16495 |  * source of truth, so the vector is carried once. A segment the emitter
  16496 |  * asked this of always has one; its absence means FLOW was edited by hand,
  16497 |  * and the gate fails closed rather than soft-match on the url alone.
  16498 |  */
  16499 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  16500 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  16501 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  16502 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  16503 |   return recorded;
  16504 | }
  16505 | 
  16506 | /**
  16507 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  16508 |  *
  16509 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  16510 |  * action and, when the action changed it, awaits settleDom before binding
  16511 |  * the step's derived values — the value a spec needs is the one on the url
  16512 |  * the step navigated TO, and `page.url()` read in the same tick as the
  16513 |  * click still says where the page came FROM. Bound empty, every pattern
  16514 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  16515 |  *
  16516 |  * ALL of them together, not one at a time, because they are read into ONE
  16517 |  * pattern: an app is free to populate its state fragment key by key (odoo
  16518 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  16519 |  * that binds the instant IT is non-empty can be bound off a half-built url
  16520 |  * while its neighbour is still missing. The step is not where it was
  16521 |  * recorded until every part is there.
  16522 |  *
  16523 |  * A spec has no settleDom, so it polls on the shared resolve cadence
  16524 |  * (RESOLVE_POLL_MS) within the window
  16525 |  * replay effectively allows a url (URL_WAIT_MS), and takes one last reading
  16526 |  * at the deadline: a step whose url genuinely does not change (the parts were
  16527 |  * already there) must still bind what is there rather than hang or throw.
  16528 |  *
  16529 |  * The parts themselves come from the shared `urlPart` (src/execution/url.ts),
  16530 |  * the daemon's own labelling; a part the url does not carry is undefined.
  16531 |  */
  16532 | async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {
  16533 |   const read = (url: string) => labels.map((label) => urlPart(url, label));
  16534 |   for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {
  16535 |     const url = page.url();
  16536 |     const values = read(url);
  16537 |     if (url !== urlBefore && values.every(Boolean)) {
  16538 |       // The parts are there — but an app is free to redirect AGAIN from
  16539 |       // the url that first carried them, and the value that matters is
  16540 |       // the one on the url the step SETTLES on. Replay never sees this,
  16541 |       // because it binds derived values only after settleDom absorbs the
  16542 |       // whole redirect chain. So: let the DOM go quiet, and if the url
  16543 |       // moved while it did, settle once more before reading.
  16544 |       for (let pass = 0; pass < 2; pass++) {
  16545 |         const before = page.url();
  16546 |         await settle(page);
  16547 |         if (page.url() === before) break;
  16548 |       }
  16549 |       return read(page.url());
  16550 |     }
  16551 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  16552 |   }
  16553 |   return read(page.url());
  16554 | }
  16555 | 
  16556 | /** One part, on the same terms. `urlBefore` is omitted where no action of this step
  16557 |   * moved the page: then the wait is simply for the part to be there at all, which is
  16558 |   * what the flow runner does before it publishes a step's url outputs (consumedUrlOutputs). */
  16559 | async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {
  16560 |   return (await urlPartsWhen(page, [label], urlBefore))[0];
  16561 | }
  16562 | 
  16563 | /**
  16564 |  * A derived value, bound as replay binds it: only when the url carries the
  16565 |  * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,
  16566 |  * which urlDiff reads as a wildcard and a locator as text no page shows.
  16567 |  */
  16568 | function bindPart(p: Record<string, string>, name: string, value: string | undefined): void {
  16569 |   if (value !== undefined) p[name] = value;
  16570 | }
  16571 | 
  16572 | /**
  16573 |  * The recorded frame a step's target lives in — replay's own lookup, the
  16574 |  * shared rootFor (src/execution/context.ts, embedded): the ranked selectors
  16575 |  * each hop recorded, polled for `waitMs`. A frame that is not there is a
  16576 |  * stop, never a search of the main page: the page's own Save is not the
  16577 |  * frame's Save, whatever it is called.
  16578 |  */
  16579 | async function frameRoot(page: Page, frame: FramePath, where: string, waitMs: number = RESOLVE_WAIT_MS): Promise<Root> {
  16580 |   const found = await rootFor(page, frame, waitMs);
  16581 |   if ('error' in found) throw new Error(`${where}: ${found.error}, so the target recorded inside it was not looked for on the page`);
  16582 |   return found.root;
  16583 | }
  16584 | 
  16585 | const CLICK_TIER_MS = 5000;
  16586 | async function click(loc: Locator, opts: { dbl?: boolean; obs?: ActionObservation | null } = {}): Promise<void> {
  16587 |   // The tiers are cut to what is left of the action's deadline, and report how the click went out.
  16588 |   await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });
  16589 | }
  16590 | 
```