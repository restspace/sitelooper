# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwvk13.spec.ts >> fwvk13
- Location: fwvk13.spec.ts:9:1

# Error details

```
Error: after 01-signin s_38a508/5 expected url http://127.0.0.1:8096/ but browser is at http://127.0.0.1:8096/login
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - img [ref=e5]
  - generic [ref=e18]:
    - heading "Welcome Back!" [level=2] [ref=e20]
    - generic [ref=e22]:
      - heading "Login" [level=2] [ref=e23]
      - generic [ref=e25]:
        - text: Using Vikunja installation at 127.0.0.1:8096
        - button "change" [ref=e26] [cursor=pointer]
      - generic [ref=e28]:
        - generic [ref=e29]:
          - generic [ref=e30]: Username Or Email Address
          - textbox "Username Or Email Address" [ref=e32]:
            - /placeholder: e.g. frederick
          - paragraph [ref=e33]: Please provide a username.
        - generic [ref=e34]:
          - generic [ref=e35]:
            - generic [ref=e36]: Password
            - link "Forgot your password?" [ref=e37] [cursor=pointer]:
              - /url: /get-password-reset
          - generic [ref=e38]:
            - textbox "Password" [ref=e39]:
              - /placeholder: e.g. •••••••••••
            - button "Show the password" [ref=e40] [cursor=pointer]:
              - img [ref=e41]
          - paragraph [ref=e43]: Please provide a password.
        - generic [ref=e45]:
          - checkbox "Stay logged in" [ref=e46]
          - text: Stay logged in
        - button "Login" [active] [ref=e47] [cursor=pointer]
        - paragraph [ref=e48]:
          - text: Don't have an account yet?
          - link "Create account" [ref=e49] [cursor=pointer]:
            - /url: /register
```

# Test source

```ts
  12387 |   // Record the page's traffic from the first settle on, as the daemon records
  12388 |   // it from the moment its session adopts a page: an action begun on it later
  12389 |   // (beginAction, the shared src/execution/action.ts) has a baseline to read.
  12390 |   pageTraffic(page);
  12391 |   await settleDom(page);
  12392 | }
  12393 | 
  12394 | const ACTION_DEADLINE_MS = 25000;
  12395 | 
  12396 | /**
  12397 |  * A state-changing action that threw, rethrown with what its error proves
  12398 |  * about it (the shared outcomeOfError): `[outcome: not dispatched]` when
  12399 |  * nothing went out, `[outcome: unknown]` otherwise — the words replay puts
  12400 |  * after its own `click failed: …`.
  12401 |  */
  12402 | function actionFailed(err: unknown): never {
  12403 |   if (err instanceof Error && !err.message.includes('[outcome: ')) err.message += ` ${outcomeLabel(outcomeOfError(err))}`;
  12404 |   throw err;
  12405 | }
  12406 | 
  12407 | const URL_WAIT_MS = 5000;
  12408 | 
  12409 | /**
  12410 |  * tools.ts's `goto`: the load event, within 30s — and it has to be said out
  12411 |  * loud, because under `@playwright/test` `navigationTimeout` defaults to 0.
  12412 |  * The familiar 30s default belongs to playwright-core, NOT to the test
  12413 |  * runner, so a bare `page.goto(url)` in a spec file is unbounded IN FACT:
  12414 |  * an app that never finishes loading hangs the test until the runner (or,
  12415 |  * under a harness, a kill signal) stops it, with nothing logged about where
  12416 |  * it was. Every goto this file emits passes this, so the artifact fails the
  12417 |  * same way, at the same moment, as the daemon replaying the same step.
  12418 |  */
  12419 | const GOTO_TIMEOUT_MS = 30_000;
  12420 | 
  12421 | /**
  12422 |  * A soft finding, in the one grep-able shape replay reports its own warnings in.
  12423 |  *
  12424 |  * stdout, not stderr, like every `[sitelooper …]` line this file logs: the
  12425 |  * list reporter forwards a worker's stdout live and batches its stderr to the
  12426 |  * END of the run, so a run that is killed (a harness watchdog, a CI timeout)
  12427 |  * loses everything written to stderr. On stdout these interleave with the
  12428 |  * `[sitelooper step]` lines and survive the kill, which is the only record of
  12429 |  * where the run had got to.
  12430 |  */
  12431 | function logWarning(line: string): void {
  12432 |   console.log(`[sitelooper warn] ${line}`);
  12433 | }
  12434 | 
  12435 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  12436 | let lastReadHit: Locator | null = null;
  12437 | 
  12438 | /**
  12439 |  * A published read whose value is only what this segment itself typed,
  12440 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  12441 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  12442 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  12443 |  * the value is still published, as replay still carries it to later steps.
  12444 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  12445 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  12446 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  12447 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  12448 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  12449 |  */
  12450 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  12451 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  12452 |   if (!echo) return;
  12453 |   run.echoed.push(key);
  12454 |   logWarning(echo);
  12455 | }
  12456 | 
  12457 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  12458 | function errorPageGate(page: Page, where: string): void {
  12459 |   const stop = errorPageVerdict(page.url(), where);
  12460 |   if (stop) throw new Error(stop);
  12461 | }
  12462 | 
  12463 | /**
  12464 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  12465 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  12466 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  12467 |  * literal segments is treated as volatile (warned, continued), anything else
  12468 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  12469 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  12470 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  12471 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  12472 |  * step's click reported of the link it clicked (the shared beginAction): a
  12473 |  * click that went where its link points, recorded as staying on the page it
  12474 |  * left, is the shared linkLandingWarning and waits for nothing.
  12475 |  */
  12476 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  12477 |   if (!urlMatches(pattern, page.url(), p)) {
  12478 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  12479 |     if (landed) return logWarning(landed);
  12480 |   }
  12481 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  12482 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  12483 |   for (const line of verdict.warnings) logWarning(line);
  12484 |   // What this step watched vary is the segment's evidence from here on
  12485 |   // (navigationTarget), whether or not the step goes on to stop.
  12486 |   if (verdict.diffs) volatile.push(...verdict.diffs);
> 12487 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: after 01-signin s_38a508/5 expected url http://127.0.0.1:8096/ but browser is at http://127.0.0.1:8096/login
  12488 | }
  12489 | 
  12490 | /**
  12491 |  * Where a goto actually sends the browser — the shared retargetNavigation
  12492 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  12493 |  * the live url sits at a position THIS segment has already watched vary is a
  12494 |  * literal from the recording's run, and the live value is navigated to
  12495 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  12496 |  * one per replayed skill. The returned `stale` is handed to this step's
  12497 |  * alert gate, so an unrecorded alert on the landing names the cause.
  12498 |  */
  12499 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  12500 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  12501 |   if (verdict.warning) logWarning(verdict.warning);
  12502 |   return verdict;
  12503 | }
  12504 | 
  12505 | /**
  12506 |  * The alert observation a step is judged by, taken where the daemon takes
  12507 |  * its diff: after the action, once the DOM has settled (tools.ts
  12508 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  12509 |  * inside verify's url window is seen by both runners or by neither.
  12510 |  * Rendered in the step's line dialect, with whether every live region was
  12511 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  12512 |  */
  12513 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  12514 |   await settle(page);
  12515 |   return liveAlertsObserved(page, dialect);
  12516 | }
  12517 | 
  12518 | /**
  12519 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  12520 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  12521 |  * and stops a state-changing step only when its recorded page changes did
  12522 |  * not confirm it worked (a rejection toast that leaves the page superficially
  12523 |  * intact); a recorded-but-missing one only warns.
  12524 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  12525 |  * `after` in settle, right after the action has settled and BEFORE the url
  12526 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  12527 |  * during a 5s url wait must not be missed) — and a page that could not be
  12528 |  * read is handed over as unobserved, never as "no alert".
  12529 |  */
  12530 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  12531 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  12532 |   for (const line of verdict.warnings) logWarning(line);
  12533 |   if (verdict.stop) throw new Error(verdict.stop);
  12534 | }
  12535 | 
  12536 | /**
  12537 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  12538 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  12539 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  12540 |  * page structure agrees, anything else refuses before the first step acts.
  12541 |  * `similarity` is what replay's adapter passes: where the recording kept a
  12542 |  * page fingerprint, the call site measures the live page with the shared
  12543 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  12544 |  * could not be read, exactly as replay; null where the recording kept none
  12545 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  12546 |  * compiled before the vector travelled, which refuses a soft match it cannot
  12547 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  12548 |  * (arguments evaluate left to right), as replay reads startUrl before it
  12549 |  * fingerprints: both describe the page as the segment found it, not where a
  12550 |  * navigation in flight landed during the measurement. Async so the call site
  12551 |  * must await it: a gate that could be left un-awaited is one that can
  12552 |  * silently become a no-op.
  12553 |  */
  12554 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  12555 |   const verdict = preconditionVerdict(pattern, url, p, similarity, mints);
  12556 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  12557 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  12558 | }
  12559 | 
  12560 | /**
  12561 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  12562 |  * source of truth, so the vector is carried once. A segment the emitter
  12563 |  * asked this of always has one; its absence means FLOW was edited by hand,
  12564 |  * and the gate fails closed rather than soft-match on the url alone.
  12565 |  */
  12566 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  12567 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  12568 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  12569 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  12570 |   return recorded;
  12571 | }
  12572 | 
  12573 | /**
  12574 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  12575 |  *
  12576 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  12577 |  * action and, when the action changed it, awaits settleDom before binding
  12578 |  * the step's derived values — the value a spec needs is the one on the url
  12579 |  * the step navigated TO, and `page.url()` read in the same tick as the
  12580 |  * click still says where the page came FROM. Bound empty, every pattern
  12581 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  12582 |  *
  12583 |  * ALL of them together, not one at a time, because they are read into ONE
  12584 |  * pattern: an app is free to populate its state fragment key by key (odoo
  12585 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  12586 |  * that binds the instant IT is non-empty can be bound off a half-built url
  12587 |  * while its neighbour is still missing. The step is not where it was
```