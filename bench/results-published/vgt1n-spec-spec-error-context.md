# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vgt1n.spec.ts >> vgt1n
- Location: vgt1n.spec.ts:9:1

# Error details

```
Error: after 01-signin s_9172ea/1 expected url http://127.0.0.1:8095/bench/bench-repo/issues?state=open&type=all but browser is at http://127.0.0.1:8095/bench/bench-repo/issues?state=all&type=all
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation "Navigation Bar" [ref=e3]:
      - generic [ref=e4]:
        - link "Dashboard" [ref=e5] [cursor=pointer]:
          - /url: /
          - img [ref=e6]
        - link "Issues" [ref=e7] [cursor=pointer]:
          - /url: /issues
        - link "Pull Requests" [ref=e8] [cursor=pointer]:
          - /url: /pulls
        - link "Milestones" [ref=e9] [cursor=pointer]:
          - /url: /milestones
        - link "Explore" [ref=e10] [cursor=pointer]:
          - /url: /explore/repos
      - generic [ref=e11]:
        - link "Notifications" [ref=e12] [cursor=pointer]:
          - /url: /notifications
          - img [ref=e14]
        - menu "Create…" [ref=e16] [cursor=pointer]:
          - generic [ref=e17]:
            - img [ref=e18]
            - img [ref=e21]
        - menu "Profile and Settings…" [ref=e23] [cursor=pointer]:
          - generic [ref=e24]:
            - generic [ref=e25]:
              - img "admin" [ref=e26]
              - img [ref=e27]
            - img [ref=e30]
    - main "Issues" [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e35]:
          - generic [ref=e36]:
            - img [ref=e37]
            - generic [ref=e39]:
              - link "bench" [ref=e40] [cursor=pointer]:
                - /url: /bench
              - text: /
              - link "bench-repo" [ref=e41] [cursor=pointer]:
                - /url: /bench/bench-repo
          - generic [ref=e42]:
            - link "RSS Feed" [ref=e43] [cursor=pointer]:
              - /url: /bench/bench-repo.rss
              - img [ref=e44]
            - generic [ref=e46] [cursor=pointer]:
              - button "Unwatch" [ref=e47]:
                - img [ref=e48]
                - generic [ref=e50]: Unwatch
              - link "1" [ref=e51]:
                - /url: /bench/bench-repo/watchers
            - generic [ref=e52] [cursor=pointer]:
              - button "Star" [ref=e53]:
                - img [ref=e54]
                - generic [ref=e56]: Star
              - link "0" [ref=e57]:
                - /url: /bench/bench-repo/stars
            - generic [ref=e58] [cursor=pointer]:
              - button "Fork" [ref=e59]:
                - img [ref=e60]
                - generic [ref=e62]: Fork
              - link "0" [ref=e63]:
                - /url: /bench/bench-repo/forks
        - navigation [ref=e65]:
          - generic [ref=e66]:
            - link "Code" [ref=e67] [cursor=pointer]:
              - /url: /bench/bench-repo/src/
              - img [ref=e68]
              - generic [ref=e70]: Code
            - link "Issues 3" [ref=e71] [cursor=pointer]:
              - /url: /bench/bench-repo/issues
              - img [ref=e72]
              - generic [ref=e75]: Issues
              - generic [ref=e76]: "3"
            - link "Pull Requests" [ref=e77] [cursor=pointer]:
              - /url: /bench/bench-repo/pulls
              - img [ref=e78]
              - generic [ref=e80]: Pull Requests
            - link "Actions" [ref=e81] [cursor=pointer]:
              - /url: /bench/bench-repo/actions
              - img [ref=e82]
              - generic [ref=e84]: Actions
            - link "Packages" [ref=e85] [cursor=pointer]:
              - /url: /bench/bench-repo/packages
              - img [ref=e86]
              - generic [ref=e88]: Packages
            - link "Projects" [ref=e89] [cursor=pointer]:
              - /url: /bench/bench-repo/projects
              - img [ref=e90]
              - generic [ref=e92]: Projects
            - link "Releases" [ref=e93] [cursor=pointer]:
              - /url: /bench/bench-repo/releases
              - img [ref=e94]
              - generic [ref=e96]: Releases
            - link "Wiki" [ref=e97] [cursor=pointer]:
              - /url: /bench/bench-repo/wiki
              - img [ref=e98]
              - generic [ref=e100]: Wiki
            - link "Activity" [ref=e101] [cursor=pointer]:
              - /url: /bench/bench-repo/activity
              - img [ref=e102]
              - generic [ref=e104]: Activity
            - link "Settings" [ref=e106] [cursor=pointer]:
              - /url: /bench/bench-repo/settings
              - img [ref=e107]
              - generic [ref=e109]: Settings
      - generic [ref=e111]:
        - generic [ref=e112]:
          - generic [ref=e114]:
            - searchbox "Search…" [ref=e115]
            - button "Search…" [ref=e116] [cursor=pointer]:
              - img [ref=e117]
          - link "Labels" [ref=e119] [cursor=pointer]:
            - /url: /bench/bench-repo/labels
          - link "Milestones" [ref=e120] [cursor=pointer]:
            - /url: /bench/bench-repo/milestones
          - link "New Issue" [ref=e121] [cursor=pointer]:
            - /url: /bench/bench-repo/issues/new
        - generic [ref=e122]:
          - generic [ref=e123]:
            - checkbox "Check/Uncheck all items" [ref=e124]
            - generic [ref=e125]:
              - link "3 Open" [ref=e126] [cursor=pointer]:
                - /url: "?type=all&state=open"
                - img [ref=e127]
                - text: 3 Open
              - link "0 Closed" [ref=e130] [cursor=pointer]:
                - /url: "?type=all&state=closed"
                - img [ref=e131]
                - text: 0 Closed
          - generic [ref=e135]:
            - combobox [ref=e136] [cursor=pointer]:
              - generic [ref=e137]: Label
              - img [ref=e138]
            - combobox [ref=e140] [cursor=pointer]:
              - generic [ref=e141]: Milestone
              - img [ref=e142]
            - combobox:
              - generic: Project
              - img
            - combobox "Shows a maximum of 30 users" [ref=e144] [cursor=pointer]:
              - text: Author
              - img [ref=e145]
            - combobox [ref=e147] [cursor=pointer]:
              - text: Assignee
              - img [ref=e148]
            - menu [ref=e150] [cursor=pointer]:
              - generic [ref=e151]: Type
              - img [ref=e152]
            - menu [ref=e154] [cursor=pointer]:
              - generic [ref=e155]: Sort
              - img [ref=e156]
        - generic [ref=e158]:
          - generic [ref=e159]:
            - generic [ref=e161]:
              - 'checkbox "Check/Uncheck: Seed: ship repaired device" [ref=e162]'
              - img [ref=e163]
            - generic [ref=e166]:
              - 'link "Seed: ship repaired device" [ref=e169] [cursor=pointer]':
                - /url: /bench/bench-repo/issues/3
              - generic [ref=e170]:
                - link "#3" [ref=e171] [cursor=pointer]:
                  - /url: /bench/bench-repo/issues/3
                - generic [ref=e172]:
                  - text: opened
                  - generic "Sep 25, 2026, 2:00 AM" [ref=e173]: 2026-09-25 02:00:30 +00:0041 minutes ago
                  - text: by
                  - link "admin" [ref=e174] [cursor=pointer]:
                    - /url: /admin
          - generic [ref=e175]:
            - generic [ref=e177]:
              - 'checkbox "Check/Uncheck: Seed: order missing parts" [ref=e178]'
              - img [ref=e179]
            - generic [ref=e182]:
              - 'link "Seed: order missing parts" [ref=e185] [cursor=pointer]':
                - /url: /bench/bench-repo/issues/2
              - generic [ref=e186]:
                - link "#2" [ref=e187] [cursor=pointer]:
                  - /url: /bench/bench-repo/issues/2
                - generic [ref=e188]:
                  - text: opened
                  - generic "Sep 25, 2026, 2:00 AM" [ref=e189]: 2026-09-25 02:00:30 +00:0041 minutes ago
                  - text: by
                  - link "admin" [ref=e190] [cursor=pointer]:
                    - /url: /admin
          - generic [ref=e191]:
            - generic [ref=e193]:
              - 'checkbox "Check/Uncheck: Seed: triage inbox" [ref=e194]'
              - img [ref=e195]
            - generic [ref=e198]:
              - 'link "Seed: triage inbox" [ref=e201] [cursor=pointer]':
                - /url: /bench/bench-repo/issues/1
              - generic [ref=e202]:
                - link "#1" [ref=e203] [cursor=pointer]:
                  - /url: /bench/bench-repo/issues/1
                - generic [ref=e204]:
                  - text: opened
                  - generic "Sep 25, 2026, 2:00 AM" [ref=e205]: 2026-09-25 02:00:30 +00:0041 minutes ago
                  - text: by
                  - link "admin" [ref=e206] [cursor=pointer]:
                    - /url: /admin
  - group "Footer" [ref=e207]:
    - contentinfo "About Software" [ref=e208]:
      - link "Powered by Gitea" [ref=e209] [cursor=pointer]:
        - /url: https://about.gitea.com
      - generic [ref=e210]:
        - text: "Version:"
        - link "1.27.3" [ref=e211] [cursor=pointer]:
          - /url: /-/admin/config
      - generic [ref=e212]:
        - text: "Page:"
        - strong [ref=e213]: 18ms
        - text: "Template:"
        - strong [ref=e214]: 5ms
    - group "Links" [ref=e215]:
      - menu [ref=e216] [cursor=pointer]:
        - generic [ref=e218]:
          - img [ref=e219]
          - text: Auto
      - menu [ref=e221] [cursor=pointer]:
        - generic [ref=e222]:
          - img [ref=e223]
          - text: English
      - link "Licenses" [ref=e225] [cursor=pointer]:
        - /url: /assets/licenses.txt
      - link "API" [ref=e226] [cursor=pointer]:
        - /url: /api/swagger
```

# Test source

```ts
  12418 |   // Record the page's traffic from the first settle on, as the daemon records
  12419 |   // it from the moment its session adopts a page: an action begun on it later
  12420 |   // (beginAction, the shared src/execution/action.ts) has a baseline to read.
  12421 |   pageTraffic(page);
  12422 |   await settleDom(page);
  12423 | }
  12424 | 
  12425 | const ACTION_DEADLINE_MS = 25000;
  12426 | 
  12427 | /**
  12428 |  * A state-changing action that threw, rethrown with what its error proves
  12429 |  * about it (the shared outcomeOfError): `[outcome: not dispatched]` when
  12430 |  * nothing went out, `[outcome: unknown]` otherwise — the words replay puts
  12431 |  * after its own `click failed: …`.
  12432 |  */
  12433 | function actionFailed(err: unknown): never {
  12434 |   if (err instanceof Error && !err.message.includes('[outcome: ')) err.message += ` ${outcomeLabel(outcomeOfError(err))}`;
  12435 |   throw err;
  12436 | }
  12437 | 
  12438 | const URL_WAIT_MS = 5000;
  12439 | 
  12440 | /**
  12441 |  * tools.ts's `goto`: the load event, within 30s — and it has to be said out
  12442 |  * loud, because under `@playwright/test` `navigationTimeout` defaults to 0.
  12443 |  * The familiar 30s default belongs to playwright-core, NOT to the test
  12444 |  * runner, so a bare `page.goto(url)` in a spec file is unbounded IN FACT:
  12445 |  * an app that never finishes loading hangs the test until the runner (or,
  12446 |  * under a harness, a kill signal) stops it, with nothing logged about where
  12447 |  * it was. Every goto this file emits passes this, so the artifact fails the
  12448 |  * same way, at the same moment, as the daemon replaying the same step.
  12449 |  */
  12450 | const GOTO_TIMEOUT_MS = 30_000;
  12451 | 
  12452 | /**
  12453 |  * A soft finding, in the one grep-able shape replay reports its own warnings in.
  12454 |  *
  12455 |  * stdout, not stderr, like every `[sitelooper …]` line this file logs: the
  12456 |  * list reporter forwards a worker's stdout live and batches its stderr to the
  12457 |  * END of the run, so a run that is killed (a harness watchdog, a CI timeout)
  12458 |  * loses everything written to stderr. On stdout these interleave with the
  12459 |  * `[sitelooper step]` lines and survive the kill, which is the only record of
  12460 |  * where the run had got to.
  12461 |  */
  12462 | function logWarning(line: string): void {
  12463 |   console.log(`[sitelooper warn] ${line}`);
  12464 | }
  12465 | 
  12466 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  12467 | let lastReadHit: Locator | null = null;
  12468 | 
  12469 | /**
  12470 |  * A published read whose value is only what this segment itself typed,
  12471 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  12472 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  12473 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  12474 |  * the value is still published, as replay still carries it to later steps.
  12475 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  12476 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  12477 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  12478 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  12479 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  12480 |  */
  12481 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  12482 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  12483 |   if (!echo) return;
  12484 |   run.echoed.push(key);
  12485 |   logWarning(echo);
  12486 | }
  12487 | 
  12488 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  12489 | function errorPageGate(page: Page, where: string): void {
  12490 |   const stop = errorPageVerdict(page.url(), where);
  12491 |   if (stop) throw new Error(stop);
  12492 | }
  12493 | 
  12494 | /**
  12495 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  12496 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  12497 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  12498 |  * literal segments is treated as volatile (warned, continued), anything else
  12499 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  12500 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  12501 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  12502 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  12503 |  * step's click reported of the link it clicked (the shared beginAction): a
  12504 |  * click that went where its link points, recorded as staying on the page it
  12505 |  * left, is the shared linkLandingWarning and waits for nothing.
  12506 |  */
  12507 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  12508 |   if (!urlMatches(pattern, page.url(), p)) {
  12509 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  12510 |     if (landed) return logWarning(landed);
  12511 |   }
  12512 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  12513 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  12514 |   for (const line of verdict.warnings) logWarning(line);
  12515 |   // What this step watched vary is the segment's evidence from here on
  12516 |   // (navigationTarget), whether or not the step goes on to stop.
  12517 |   if (verdict.diffs) volatile.push(...verdict.diffs);
> 12518 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: after 01-signin s_9172ea/1 expected url http://127.0.0.1:8095/bench/bench-repo/issues?state=open&type=all but browser is at http://127.0.0.1:8095/bench/bench-repo/issues?state=all&type=all
  12519 | }
  12520 | 
  12521 | /**
  12522 |  * Where a goto actually sends the browser — the shared retargetNavigation
  12523 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  12524 |  * the live url sits at a position THIS segment has already watched vary is a
  12525 |  * literal from the recording's run, and the live value is navigated to
  12526 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  12527 |  * one per replayed skill. The returned `stale` is handed to this step's
  12528 |  * alert gate, so an unrecorded alert on the landing names the cause.
  12529 |  */
  12530 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  12531 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  12532 |   if (verdict.warning) logWarning(verdict.warning);
  12533 |   return verdict;
  12534 | }
  12535 | 
  12536 | /**
  12537 |  * The alert observation a step is judged by, taken where the daemon takes
  12538 |  * its diff: after the action, once the DOM has settled (tools.ts
  12539 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  12540 |  * inside verify's url window is seen by both runners or by neither.
  12541 |  * Rendered in the step's line dialect, with whether every live region was
  12542 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  12543 |  */
  12544 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  12545 |   await settle(page);
  12546 |   return liveAlertsObserved(page, dialect);
  12547 | }
  12548 | 
  12549 | /**
  12550 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  12551 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  12552 |  * and stops a state-changing step only when its recorded page changes did
  12553 |  * not confirm it worked (a rejection toast that leaves the page superficially
  12554 |  * intact); a recorded-but-missing one only warns.
  12555 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  12556 |  * `after` in settle, right after the action has settled and BEFORE the url
  12557 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  12558 |  * during a 5s url wait must not be missed) — and a page that could not be
  12559 |  * read is handed over as unobserved, never as "no alert".
  12560 |  */
  12561 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  12562 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  12563 |   for (const line of verdict.warnings) logWarning(line);
  12564 |   if (verdict.stop) throw new Error(verdict.stop);
  12565 | }
  12566 | 
  12567 | /**
  12568 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  12569 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  12570 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  12571 |  * page structure agrees, anything else refuses before the first step acts.
  12572 |  * `similarity` is what replay's adapter passes: where the recording kept a
  12573 |  * page fingerprint, the call site measures the live page with the shared
  12574 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  12575 |  * could not be read, exactly as replay; null where the recording kept none
  12576 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  12577 |  * compiled before the vector travelled, which refuses a soft match it cannot
  12578 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  12579 |  * (arguments evaluate left to right), as replay reads startUrl before it
  12580 |  * fingerprints: both describe the page as the segment found it, not where a
  12581 |  * navigation in flight landed during the measurement. Async so the call site
  12582 |  * must await it: a gate that could be left un-awaited is one that can
  12583 |  * silently become a no-op.
  12584 |  */
  12585 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  12586 |   const verdict = preconditionVerdict(pattern, url, p, similarity, mints);
  12587 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  12588 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  12589 | }
  12590 | 
  12591 | /**
  12592 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  12593 |  * source of truth, so the vector is carried once. A segment the emitter
  12594 |  * asked this of always has one; its absence means FLOW was edited by hand,
  12595 |  * and the gate fails closed rather than soft-match on the url alone.
  12596 |  */
  12597 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  12598 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  12599 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  12600 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  12601 |   return recorded;
  12602 | }
  12603 | 
  12604 | /**
  12605 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  12606 |  *
  12607 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  12608 |  * action and, when the action changed it, awaits settleDom before binding
  12609 |  * the step's derived values — the value a spec needs is the one on the url
  12610 |  * the step navigated TO, and `page.url()` read in the same tick as the
  12611 |  * click still says where the page came FROM. Bound empty, every pattern
  12612 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  12613 |  *
  12614 |  * ALL of them together, not one at a time, because they are read into ONE
  12615 |  * pattern: an app is free to populate its state fragment key by key (odoo
  12616 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  12617 |  * that binds the instant IT is non-empty can be bound off a half-built url
  12618 |  * while its neighbour is still missing. The step is not where it was
```