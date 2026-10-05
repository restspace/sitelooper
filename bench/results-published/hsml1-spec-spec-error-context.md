# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hsml1.spec.ts >> hsml1
- Location: hsml1.spec.ts:9:1

# Error details

```
Error: after 02-find s_8c410d/4 expected url http://127.0.0.1:8102/g/home?search=Seed: but browser is at http://127.0.0.1:8102/g/home
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e6]:
        - button [ref=e7] [cursor=pointer]:
          - img [ref=e10]
        - link [ref=e12] [cursor=pointer]:
          - /url: /g/home
          - button [ref=e13]:
            - img [ref=e16]
        - generic [ref=e20] [cursor=pointer]: Mealie
        - generic [ref=e23]:
          - generic [ref=e25]:
            - img [ref=e28]
            - textbox "Press '/'" [ref=e31]
          - alert [ref=e32]
        - button "Logout" [ref=e34] [cursor=pointer]:
          - generic [ref=e35]:
            - img [ref=e37]
            - text: Logout
    - navigation [ref=e39]:
      - generic [ref=e40]:
        - link "cd144a82-5f0a-4c06-9c83-9f1ed4c3cae9 Bench Admin Favorite Recipes" [ref=e41] [cursor=pointer]:
          - /url: /user/profile
          - generic [ref=e43]:
            - img "cd144a82-5f0a-4c06-9c83-9f1ed4c3cae9" [ref=e45]:
              - img "cd144a82-5f0a-4c06-9c83-9f1ed4c3cae9" [ref=e46]
            - generic [ref=e47]:
              - generic [ref=e48]: Bench Admin
              - link "Favorite Recipes" [ref=e50]:
                - /url: /user/cd144a82-5f0a-4c06-9c83-9f1ed4c3cae9/favorites
                - generic [ref=e51]:
                  - img [ref=e53]
                  - text: Favorite Recipes
        - separator [ref=e55]
        - button "Create" [ref=e56] [cursor=pointer]:
          - generic [ref=e57]:
            - img [ref=e59]
            - text: Create
        - list [ref=e61]:
          - link "Recipes" [ref=e63] [cursor=pointer]:
            - /url: /g/home
            - img [ref=e66]
            - generic [ref=e69]: Recipes
          - link "Recipe Finder" [ref=e71] [cursor=pointer]:
            - /url: /g/home/recipes/finder
            - img [ref=e74]
            - generic [ref=e77]: Recipe Finder
          - link "Meal Planner" [ref=e79] [cursor=pointer]:
            - /url: /household/mealplan/planner/view
            - img [ref=e82]
            - generic [ref=e85]: Meal Planner
          - link "Shopping Lists" [ref=e87] [cursor=pointer]:
            - /url: /shopping-lists
            - img [ref=e90]
            - generic [ref=e93]: Shopping Lists
          - link "Timeline" [ref=e95] [cursor=pointer]:
            - /url: /g/home/recipes/timeline
            - img [ref=e98]
            - generic [ref=e101]: Timeline
          - link "Cookbooks" [ref=e103] [cursor=pointer]:
            - /url: /g/home/cookbooks
            - img [ref=e106]
            - generic [ref=e109]: Cookbooks
          - listitem [ref=e112] [cursor=pointer]:
            - img [ref=e115]
            - generic [ref=e118]: Organizers
            - img [ref=e121]
      - list [ref=e124]:
        - listitem [ref=e125] [cursor=pointer]:
          - generic [ref=e128]:
            - img [ref=e130]
            - status "Badge" [ref=e132]: "1"
          - generic [ref=e134]: Announcements
        - listitem [ref=e135] [cursor=pointer]:
          - img [ref=e138]
          - generic [ref=e141]: Settings
    - main [ref=e142]:
      - generic [ref=e145]:
        - generic [ref=e147]:
          - generic [ref=e151]:
            - img [ref=e154]
            - textbox "Search..." [active] [ref=e157]
          - generic [ref=e158]:
            - button "Categories" [ref=e162] [cursor=pointer]:
              - generic [ref=e163]:
                - img [ref=e165]
                - text: Categories
            - button "Tags" [ref=e170] [cursor=pointer]:
              - generic [ref=e171]:
                - img [ref=e173]
                - text: Tags
            - button "Tools" [ref=e178] [cursor=pointer]:
              - generic [ref=e179]:
                - img [ref=e181]
                - text: Tools
            - button "Foods" [ref=e186] [cursor=pointer]:
              - generic [ref=e187]:
                - img [ref=e189]
                - text: Foods
            - button "Created" [ref=e191] [cursor=pointer]:
              - generic [ref=e192]:
                - img [ref=e194]
                - text: Created
            - button [ref=e196] [cursor=pointer]:
              - img [ref=e199]
        - separator [ref=e201]
        - generic [ref=e203]:
          - generic [ref=e204]:
            - img [ref=e206]
            - generic [ref=e208]: Recipes
            - button "Random" [ref=e209] [cursor=pointer]:
              - generic [ref=e210]:
                - img [ref=e212]
                - text: Random
            - button [ref=e214] [cursor=pointer]:
              - img [ref=e217]
          - generic [ref=e221]:
            - 'link "Seed: Garden Salad Bench Classic ☆ ☆ ☆ ☆ ☆" [ref=e224] [cursor=pointer]':
              - /url: /g/home/r/seed-garden-salad
              - img [ref=e227]
              - generic [ref=e229]: "Seed: Garden Salad"
              - generic [ref=e230]:
                - generic [ref=e233]: Bench Classic
                - generic [ref=e234]:
                  - button [ref=e235]:
                    - img [ref=e238]
                  - generic [ref=e240]:
                    - generic [ref=e241]: ☆
                    - generic [ref=e242]: ☆
                    - generic [ref=e243]: ☆
                    - generic [ref=e244]: ☆
                    - generic [ref=e245]: ☆
                  - button [ref=e247]:
                    - img [ref=e250]
            - 'link "Seed: Tomato Soup Bench Classic ☆ ☆ ☆ ☆ ☆" [ref=e254] [cursor=pointer]':
              - /url: /g/home/r/seed-tomato-soup
              - img [ref=e257]
              - generic [ref=e259]: "Seed: Tomato Soup"
              - generic [ref=e260]:
                - generic [ref=e263]: Bench Classic
                - generic [ref=e264]:
                  - button [ref=e265]:
                    - img [ref=e268]
                  - generic [ref=e270]:
                    - generic [ref=e271]: ☆
                    - generic [ref=e272]: ☆
                    - generic [ref=e273]: ☆
                    - generic [ref=e274]: ☆
                    - generic [ref=e275]: ☆
                  - button [ref=e277]:
                    - img [ref=e280]
            - 'link "Seed: Bench Pancakes Bench Classic ☆ ☆ ☆ ☆ ☆" [ref=e284] [cursor=pointer]':
              - /url: /g/home/r/seed-bench-pancakes
              - img [ref=e287]
              - generic [ref=e289]: "Seed: Bench Pancakes"
              - generic [ref=e290]:
                - generic [ref=e293]: Bench Classic
                - generic [ref=e294]:
                  - button [ref=e295]:
                    - img [ref=e298]
                  - generic [ref=e300]:
                    - generic [ref=e301]: ☆
                    - generic [ref=e302]: ☆
                    - generic [ref=e303]: ☆
                    - generic [ref=e304]: ☆
                    - generic [ref=e305]: ☆
                  - button [ref=e307]:
                    - img [ref=e310]
  - generic:
    - tooltip
    - tooltip
    - tooltip
    - tooltip
```

# Test source

```ts
  14691 |   // Record the page's traffic from the first settle on, as the daemon records
  14692 |   // it from the moment its session adopts a page: an action begun on it later
  14693 |   // (beginAction, the shared src/execution/action.ts) has a baseline to read.
  14694 |   pageTraffic(page);
  14695 |   await settleDom(page);
  14696 | }
  14697 | 
  14698 | const ACTION_DEADLINE_MS = 25000;
  14699 | 
  14700 | /**
  14701 |  * A state-changing action that threw, rethrown with what its error proves
  14702 |  * about it (the shared outcomeOfError): `[outcome: not dispatched]` when
  14703 |  * nothing went out, `[outcome: unknown]` otherwise — the words replay puts
  14704 |  * after its own `click failed: …`.
  14705 |  */
  14706 | function actionFailed(err: unknown): never {
  14707 |   if (err instanceof Error && !err.message.includes('[outcome: ')) err.message += ` ${outcomeLabel(outcomeOfError(err))}`;
  14708 |   throw err;
  14709 | }
  14710 | 
  14711 | const URL_WAIT_MS = 5000;
  14712 | 
  14713 | /**
  14714 |  * tools.ts's `goto`: the load event, within 30s — and it has to be said out
  14715 |  * loud, because under `@playwright/test` `navigationTimeout` defaults to 0.
  14716 |  * The familiar 30s default belongs to playwright-core, NOT to the test
  14717 |  * runner, so a bare `page.goto(url)` in a spec file is unbounded IN FACT:
  14718 |  * an app that never finishes loading hangs the test until the runner (or,
  14719 |  * under a harness, a kill signal) stops it, with nothing logged about where
  14720 |  * it was. Every goto this file emits passes this, so the artifact fails the
  14721 |  * same way, at the same moment, as the daemon replaying the same step.
  14722 |  */
  14723 | const GOTO_TIMEOUT_MS = 30_000;
  14724 | 
  14725 | /**
  14726 |  * A soft finding, in the one grep-able shape replay reports its own warnings in.
  14727 |  *
  14728 |  * stdout, not stderr, like every `[sitelooper …]` line this file logs: the
  14729 |  * list reporter forwards a worker's stdout live and batches its stderr to the
  14730 |  * END of the run, so a run that is killed (a harness watchdog, a CI timeout)
  14731 |  * loses everything written to stderr. On stdout these interleave with the
  14732 |  * `[sitelooper step]` lines and survive the kill, which is the only record of
  14733 |  * where the run had got to.
  14734 |  */
  14735 | function logWarning(line: string): void {
  14736 |   console.log(`[sitelooper warn] ${line}`);
  14737 | }
  14738 | 
  14739 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  14740 | let lastReadHit: Locator | null = null;
  14741 | 
  14742 | /**
  14743 |  * A published read whose value is only what this segment itself typed,
  14744 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  14745 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  14746 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  14747 |  * the value is still published, as replay still carries it to later steps.
  14748 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  14749 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  14750 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  14751 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  14752 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  14753 |  */
  14754 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  14755 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  14756 |   if (!echo) return;
  14757 |   run.echoed.push(key);
  14758 |   logWarning(echo);
  14759 | }
  14760 | 
  14761 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  14762 | function errorPageGate(page: Page, where: string): void {
  14763 |   const stop = errorPageVerdict(page.url(), where);
  14764 |   if (stop) throw new Error(stop);
  14765 | }
  14766 | 
  14767 | /**
  14768 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  14769 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  14770 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  14771 |  * literal segments is treated as volatile (warned, continued), anything else
  14772 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  14773 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  14774 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  14775 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  14776 |  * step's click reported of the link it clicked (the shared beginAction): a
  14777 |  * click that went where its link points, recorded as staying on the page it
  14778 |  * left, is the shared linkLandingWarning and waits for nothing.
  14779 |  */
  14780 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  14781 |   if (!urlMatches(pattern, page.url(), p)) {
  14782 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  14783 |     if (landed) return logWarning(landed);
  14784 |   }
  14785 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  14786 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  14787 |   for (const line of verdict.warnings) logWarning(line);
  14788 |   // What this step watched vary is the segment's evidence from here on
  14789 |   // (navigationTarget), whether or not the step goes on to stop.
  14790 |   if (verdict.diffs) volatile.push(...verdict.diffs);
> 14791 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: after 02-find s_8c410d/4 expected url http://127.0.0.1:8102/g/home?search=Seed: but browser is at http://127.0.0.1:8102/g/home
  14792 | }
  14793 | 
  14794 | /**
  14795 |  * Where a goto actually sends the browser — the shared retargetNavigation
  14796 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  14797 |  * the live url sits at a position THIS segment has already watched vary is a
  14798 |  * literal from the recording's run, and the live value is navigated to
  14799 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  14800 |  * one per replayed skill. The returned `stale` is handed to this step's
  14801 |  * alert gate, so an unrecorded alert on the landing names the cause.
  14802 |  */
  14803 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  14804 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  14805 |   if (verdict.warning) logWarning(verdict.warning);
  14806 |   return verdict;
  14807 | }
  14808 | 
  14809 | /**
  14810 |  * The alert observation a step is judged by, taken where the daemon takes
  14811 |  * its diff: after the action, once the DOM has settled (tools.ts
  14812 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  14813 |  * inside verify's url window is seen by both runners or by neither.
  14814 |  * Rendered in the step's line dialect, with whether every live region was
  14815 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  14816 |  */
  14817 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  14818 |   await settle(page);
  14819 |   return liveAlertsObserved(page, dialect);
  14820 | }
  14821 | 
  14822 | /**
  14823 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  14824 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  14825 |  * and stops a state-changing step only when its recorded page changes did
  14826 |  * not confirm it worked (a rejection toast that leaves the page superficially
  14827 |  * intact); a recorded-but-missing one only warns.
  14828 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  14829 |  * `after` in settle, right after the action has settled and BEFORE the url
  14830 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  14831 |  * during a 5s url wait must not be missed) — and a page that could not be
  14832 |  * read is handed over as unobserved, never as "no alert".
  14833 |  */
  14834 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  14835 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  14836 |   for (const line of verdict.warnings) logWarning(line);
  14837 |   if (verdict.stop) throw new Error(verdict.stop);
  14838 | }
  14839 | 
  14840 | /**
  14841 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  14842 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  14843 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  14844 |  * page structure agrees, anything else refuses before the first step acts.
  14845 |  * `similarity` is what replay's adapter passes: where the recording kept a
  14846 |  * page fingerprint, the call site measures the live page with the shared
  14847 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  14848 |  * could not be read, exactly as replay; null where the recording kept none
  14849 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  14850 |  * compiled before the vector travelled, which refuses a soft match it cannot
  14851 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  14852 |  * (arguments evaluate left to right), as replay reads startUrl before it
  14853 |  * fingerprints: both describe the page as the segment found it, not where a
  14854 |  * navigation in flight landed during the measurement. Async so the call site
  14855 |  * must await it: a gate that could be left un-awaited is one that can
  14856 |  * silently become a no-op. Decided as replay decides it: through
  14857 |  * preconditionVerdictWithFacts (src/execution/facts-route.ts) over the facts
  14858 |  * snapshot this file carries for the url (siteFactsAt), which is the plain
  14859 |  * preconditionVerdict wherever no reliable site fact bears on the url.
  14860 |  */
  14861 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  14862 |   const verdict = preconditionVerdictWithFacts(siteFactsAt(url), pattern, url, p, similarity, mints);
  14863 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  14864 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  14865 | }
  14866 | 
  14867 | /**
  14868 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  14869 |  * source of truth, so the vector is carried once. A segment the emitter
  14870 |  * asked this of always has one; its absence means FLOW was edited by hand,
  14871 |  * and the gate fails closed rather than soft-match on the url alone.
  14872 |  */
  14873 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  14874 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  14875 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  14876 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  14877 |   return recorded;
  14878 | }
  14879 | 
  14880 | /**
  14881 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  14882 |  *
  14883 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  14884 |  * action and, when the action changed it, awaits settleDom before binding
  14885 |  * the step's derived values — the value a spec needs is the one on the url
  14886 |  * the step navigated TO, and `page.url()` read in the same tick as the
  14887 |  * click still says where the page came FROM. Bound empty, every pattern
  14888 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  14889 |  *
  14890 |  * ALL of them together, not one at a time, because they are read into ONE
  14891 |  * pattern: an app is free to populate its state fragment key by key (odoo
```