# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgr78.spec.ts >> fwgr78
- Location: fwgr78.spec.ts:9:1

# Error details

```
Error: 02-create s_de34b1/9 raised an alert the recording never saw: Dashboard not found | Invalid dashboard UID in annotation request
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - link "Skip to main content" [ref=e5] [cursor=pointer]:
    - /url: "#pageContent"
    - generic [ref=e6]: Skip to main content
  - banner [ref=e7]:
    - generic [ref=e8]:
      - link "Grafana" [ref=e10] [cursor=pointer]:
        - /url: /
        - img "Grafana" [ref=e11]
      - generic [ref=e14]:
        - img [ref=e16]
        - button "Search or jump to..." [ref=e18] [cursor=pointer]
        - generic [ref=e19]:
          - img [ref=e20]
          - generic [ref=e22]: ctrl+k
      - generic [ref=e23]:
        - button "New" [ref=e24] [cursor=pointer]:
          - img [ref=e25]
          - img [ref=e27]
        - button "Help" [ref=e30] [cursor=pointer]:
          - img [ref=e31]
        - button "Profile" [ref=e33] [cursor=pointer]:
          - img "User avatar" [ref=e34]
    - generic [ref=e35]:
      - button "Open menu" [ref=e37] [cursor=pointer]:
        - img [ref=e38]
      - navigation "Breadcrumbs" [ref=e40]:
        - list [ref=e41]:
          - listitem [ref=e42]:
            - link "Home" [ref=e43] [cursor=pointer]:
              - /url: /
            - img [ref=e45]
          - listitem [ref=e47]:
            - link "Dashboards" [ref=e48] [cursor=pointer]:
              - /url: /dashboards
            - img [ref=e50]
          - listitem [ref=e52]:
            - generic "Not found" [ref=e53]
      - button "Toggle top search bar" [ref=e56] [cursor=pointer]:
        - img [ref=e58]
  - main [ref=e62]:
    - generic [ref=e64]:
      - alert "Dashboard not found" [ref=e65]:
        - generic [ref=e66]:
          - img [ref=e69]
          - generic [ref=e71]: Dashboard not found
          - button "Close alert" [ref=e73] [cursor=pointer]:
            - img [ref=e74]
      - alert "Invalid dashboard UID in annotation request" [ref=e76]:
        - generic [ref=e77]:
          - img [ref=e80]
          - generic [ref=e82]: Invalid dashboard UID in annotation request
          - button "Close alert" [ref=e84] [cursor=pointer]:
            - img [ref=e85]
    - generic [ref=e89]:
      - generic [ref=e92]:
        - generic [ref=e93]:
          - 'button "Time range selected: Last 6 hours" [ref=e94] [cursor=pointer]':
            - img [ref=e95]
            - generic [ref=e99]: Last 6 hours
            - img [ref=e100]
          - button "Zoom out time range" [ref=e102] [cursor=pointer]:
            - img [ref=e103]
        - generic [ref=e105]:
          - button "Refresh" [ref=e106] [cursor=pointer]:
            - img [ref=e107]
            - generic [ref=e109]: Refresh
          - button "Auto refresh turned off. Choose refresh time interval" [ref=e111] [cursor=pointer]:
            - img [ref=e112]
      - generic [ref=e117]:
        - img [ref=e118]
        - generic [ref=e167]:
          - generic [ref=e168]: Dashboard not found
          - generic [ref=e169]:
            - text: We're looking but can't seem to find this dashboard. Try returning
            - link "home" [ref=e170] [cursor=pointer]:
              - /url: /
            - text: or seeking help on the
            - link "community site." [ref=e171] [cursor=pointer]:
              - /url: https://community.grafana.com
              - text: community site.
              - img [ref=e172]
```

# Test source

```ts
  18659 | }
  18660 | 
  18661 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  18662 | let lastReadHit: Locator | null = null;
  18663 | 
  18664 | /**
  18665 |  * A published read whose value is only what this segment itself typed,
  18666 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  18667 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  18668 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  18669 |  * the value is still published, as replay still carries it to later steps.
  18670 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  18671 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  18672 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  18673 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  18674 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  18675 |  */
  18676 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  18677 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  18678 |   if (!echo) return;
  18679 |   run.echoed.push(key);
  18680 |   logWarning(echo);
  18681 | }
  18682 | 
  18683 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  18684 | function errorPageGate(page: Page, where: string): void {
  18685 |   const stop = errorPageVerdict(page.url(), where);
  18686 |   if (stop) throw new Error(stop);
  18687 | }
  18688 | 
  18689 | /**
  18690 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  18691 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  18692 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  18693 |  * literal segments is treated as volatile (warned, continued), anything else
  18694 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  18695 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  18696 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  18697 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  18698 |  * step's click reported of the link it clicked (the shared beginAction): a
  18699 |  * click that went where its link points, recorded as staying on the page it
  18700 |  * left, is the shared linkLandingWarning and waits for nothing.
  18701 |  */
  18702 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  18703 |   if (!urlMatches(pattern, page.url(), p)) {
  18704 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  18705 |     if (landed) return logWarning(landed);
  18706 |   }
  18707 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  18708 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  18709 |   for (const line of verdict.warnings) logWarning(line);
  18710 |   // What this step watched vary is the segment's evidence from here on
  18711 |   // (navigationTarget), whether or not the step goes on to stop.
  18712 |   if (verdict.diffs) volatile.push(...verdict.diffs);
  18713 |   if (verdict.stop) throw new Error(verdict.stop);
  18714 | }
  18715 | 
  18716 | /**
  18717 |  * Where a goto actually sends the browser — the shared retargetNavigation
  18718 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  18719 |  * the live url sits at a position THIS segment has already watched vary is a
  18720 |  * literal from the recording's run, and the live value is navigated to
  18721 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  18722 |  * one per replayed skill. The returned `stale` is handed to this step's
  18723 |  * alert gate, so an unrecorded alert on the landing names the cause.
  18724 |  */
  18725 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  18726 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  18727 |   if (verdict.warning) logWarning(verdict.warning);
  18728 |   return verdict;
  18729 | }
  18730 | 
  18731 | /**
  18732 |  * The alert observation a step is judged by, taken where the daemon takes
  18733 |  * its diff: after the action, once the DOM has settled (tools.ts
  18734 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  18735 |  * inside verify's url window is seen by both runners or by neither.
  18736 |  * Rendered in the step's line dialect, with whether every live region was
  18737 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  18738 |  */
  18739 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  18740 |   await settle(page);
  18741 |   return liveAlertsObserved(page, dialect);
  18742 | }
  18743 | 
  18744 | /**
  18745 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  18746 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  18747 |  * and stops a state-changing step only when its recorded page changes did
  18748 |  * not confirm it worked (a rejection toast that leaves the page superficially
  18749 |  * intact); a recorded-but-missing one only warns.
  18750 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  18751 |  * `after` in settle, right after the action has settled and BEFORE the url
  18752 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  18753 |  * during a 5s url wait must not be missed) — and a page that could not be
  18754 |  * read is handed over as unobserved, never as "no alert".
  18755 |  */
  18756 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  18757 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  18758 |   for (const line of verdict.warnings) logWarning(line);
> 18759 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: 02-create s_de34b1/9 raised an alert the recording never saw: Dashboard not found | Invalid dashboard UID in annotation request
  18760 | }
  18761 | 
  18762 | /**
  18763 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  18764 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  18765 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  18766 |  * page structure agrees, anything else refuses before the first step acts.
  18767 |  * `similarity` is what replay's adapter passes: where the recording kept a
  18768 |  * page fingerprint, the call site measures the live page with the shared
  18769 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  18770 |  * could not be read, exactly as replay; null where the recording kept none
  18771 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  18772 |  * compiled before the vector travelled, which refuses a soft match it cannot
  18773 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  18774 |  * (arguments evaluate left to right), as replay reads startUrl before it
  18775 |  * fingerprints: both describe the page as the segment found it, not where a
  18776 |  * navigation in flight landed during the measurement. Async so the call site
  18777 |  * must await it: a gate that could be left un-awaited is one that can
  18778 |  * silently become a no-op.
  18779 |  */
  18780 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  18781 |   const verdict = preconditionVerdict(pattern, url, p, similarity, mints);
  18782 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  18783 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  18784 | }
  18785 | 
  18786 | /**
  18787 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  18788 |  * source of truth, so the vector is carried once. A segment the emitter
  18789 |  * asked this of always has one; its absence means FLOW was edited by hand,
  18790 |  * and the gate fails closed rather than soft-match on the url alone.
  18791 |  */
  18792 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  18793 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  18794 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  18795 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  18796 |   return recorded;
  18797 | }
  18798 | 
  18799 | /**
  18800 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  18801 |  *
  18802 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  18803 |  * action and, when the action changed it, awaits settleDom before binding
  18804 |  * the step's derived values — the value a spec needs is the one on the url
  18805 |  * the step navigated TO, and `page.url()` read in the same tick as the
  18806 |  * click still says where the page came FROM. Bound empty, every pattern
  18807 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  18808 |  *
  18809 |  * ALL of them together, not one at a time, because they are read into ONE
  18810 |  * pattern: an app is free to populate its state fragment key by key (odoo
  18811 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  18812 |  * that binds the instant IT is non-empty can be bound off a half-built url
  18813 |  * while its neighbour is still missing. The step is not where it was
  18814 |  * recorded until every part is there.
  18815 |  *
  18816 |  * A spec has no settleDom, so it polls on the shared resolve cadence
  18817 |  * (RESOLVE_POLL_MS) within the window
  18818 |  * replay effectively allows a url (URL_WAIT_MS), and takes one last reading
  18819 |  * at the deadline: a step whose url genuinely does not change (the parts were
  18820 |  * already there) must still bind what is there rather than hang or throw.
  18821 |  *
  18822 |  * The parts themselves come from the shared `urlPart` (src/execution/url.ts),
  18823 |  * the daemon's own labelling; a part the url does not carry is undefined.
  18824 |  */
  18825 | async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {
  18826 |   const read = (url: string) => labels.map((label) => urlPart(url, label));
  18827 |   for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {
  18828 |     const url = page.url();
  18829 |     const values = read(url);
  18830 |     if (url !== urlBefore && values.every(Boolean)) {
  18831 |       // The parts are there — but an app is free to redirect AGAIN from
  18832 |       // the url that first carried them, and the value that matters is
  18833 |       // the one on the url the step SETTLES on. Replay never sees this,
  18834 |       // because it binds derived values only after settleDom absorbs the
  18835 |       // whole redirect chain. So: let the DOM go quiet, and if the url
  18836 |       // moved while it did, settle once more before reading.
  18837 |       for (let pass = 0; pass < 2; pass++) {
  18838 |         const before = page.url();
  18839 |         await settle(page);
  18840 |         if (page.url() === before) break;
  18841 |       }
  18842 |       return read(page.url());
  18843 |     }
  18844 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  18845 |   }
  18846 |   return read(page.url());
  18847 | }
  18848 | 
  18849 | /** One part, on the same terms. `urlBefore` is omitted where no action of this step
  18850 |   * moved the page: then the wait is simply for the part to be there at all, which is
  18851 |   * what the flow runner does before it publishes a step's url outputs (consumedUrlOutputs). */
  18852 | async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {
  18853 |   return (await urlPartsWhen(page, [label], urlBefore))[0];
  18854 | }
  18855 | 
  18856 | /**
  18857 |  * A derived value, bound as replay binds it: only when the url carries the
  18858 |  * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,
  18859 |  * which urlDiff reads as a wildcard and a locator as text no page shows.
```