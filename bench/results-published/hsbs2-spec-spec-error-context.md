# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hsbs2.spec.ts >> hsbs2
- Location: hsbs2.spec.ts:9:1

# Error details

```
Error: after step 04-set s_7db6d8/5 the page still shows "- textbox \"Tag Name\"", which the click was recorded removing — it did not have its recorded effect
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - alert [ref=e3] [cursor=pointer]
  - alert [ref=e5] [cursor=pointer]
  - alert [ref=e7] [cursor=pointer]
  - banner [ref=e9]:
    - link "Logo BookStack" [ref=e11] [cursor=pointer]:
      - /url: http://127.0.0.1:8103
      - img "Logo" [ref=e12]
      - generic [ref=e13]: BookStack
    - search [ref=e15]:
      - button "Search" [ref=e16] [cursor=pointer]
      - textbox "Search" [ref=e17]
    - navigation [ref=e18]:
      - generic [ref=e19]:
        - link "Shelves" [ref=e20] [cursor=pointer]:
          - /url: http://127.0.0.1:8103/shelves
          - text: Shelves
        - link "Books" [ref=e21] [cursor=pointer]:
          - /url: http://127.0.0.1:8103/books
          - text: Books
        - link "Settings" [ref=e22] [cursor=pointer]:
          - /url: http://127.0.0.1:8103/settings
          - text: Settings
      - button "Profile Menu" [ref=e24] [cursor=pointer]:
        - img "Bench Admin" [ref=e25]
        - generic [ref=e26]: Bench
  - generic [ref=e30]:
    - generic [ref=e31]:
      - link "Back" [ref=e34] [cursor=pointer]:
        - /url: http://127.0.0.1:8103/books/bench-handbook/page/hsbs2-spec-bench-page
        - generic [ref=e36]: Back
      - button "Editing Page" [ref=e40] [cursor=pointer]:
        - generic [ref=e42]: Editing Page
      - generic [ref=e43]:
        - button "Set Changelog" [ref=e45] [cursor=pointer]:
          - generic [ref=e47]: Set Changelog
        - button "Save Page" [ref=e49] [cursor=pointer]:
          - generic [ref=e51]: Save Page
    - generic [ref=e52]:
      - generic [ref=e53]:
        - textbox "Page Title" [ref=e56]: hsbs2-spec Bench Page
        - application [ref=e60]:
          - generic [ref=e61]:
            - group [ref=e63]:
              - group [ref=e64]:
                - toolbar [ref=e65]:
                  - button "Undo" [disabled] [ref=e66]:
                    - img [ref=e68]
                  - button "Redo" [disabled] [ref=e70]:
                    - img [ref=e72]
                - toolbar [ref=e74]:
                  - button "Format Paragraph" [ref=e75]:
                    - generic [ref=e76]: Paragraph
                    - img [ref=e78]
                - toolbar [ref=e80]:
                  - button "Bold" [ref=e81]:
                    - img [ref=e83]
                  - button "Italic" [ref=e85]:
                    - img [ref=e87]
                  - button "Underline" [ref=e89]:
                    - img [ref=e91]
                  - button "Text color" [ref=e93]:
                    - img [ref=e95]
                    - img [ref=e99]
                  - button "Background color" [ref=e101]:
                    - img [ref=e103]
                    - img [ref=e107]
                  - button "More" [ref=e109]:
                    - img [ref=e111]
                - toolbar [ref=e113]:
                  - button "Align left" [ref=e114]:
                    - img [ref=e116]
                  - button "Align center" [ref=e118]:
                    - img [ref=e120]
                  - button "Align right" [ref=e122]:
                    - img [ref=e124]
                  - button "Justify" [ref=e126]:
                    - img [ref=e128]
                - toolbar [ref=e130]:
                  - button "Bullet list" [ref=e131]:
                    - img [ref=e133]
                  - button "Numbered list" [ref=e135]:
                    - img [ref=e137]
                  - button "More" [ref=e139]:
                    - img [ref=e141]
                - toolbar [ref=e143]:
                  - button "Reveal or hide additional toolbar items" [ref=e144]:
                    - img [ref=e146]
            - iframe [ref=e150]:
              - generic "Rich Text Area. Press ALT-0 for help." [active] [ref=f2e1]:
                - paragraph [ref=f2e2]: hsbs2-spec
      - generic [ref=e152]:
        - generic [ref=e154]:
          - button "Toggle Sidebar" [expanded] [ref=e155] [cursor=pointer]
          - button "Page Tags" [ref=e156] [cursor=pointer]
          - button "Attachments" [ref=e157] [cursor=pointer]
          - button "Templates" [ref=e158] [cursor=pointer]
          - button "Comments" [ref=e159] [cursor=pointer]
        - generic [ref=e160]:
          - heading "Page Tags" [level=4] [ref=e161]
          - generic [ref=e163]:
            - paragraph [ref=e164]:
              - text: Add some tags to better categorise your content.
              - text: You can assign a value to a tag for more in-depth organisation.
              - link "View existing tags" [ref=e165] [cursor=pointer]:
                - /url: http://127.0.0.1:8103/tags
              - text: .
            - generic [ref=e167]:
              - textbox "Tag Name" [ref=e170]: Review Status
              - textbox "Tag Value (Optional)" [ref=e172]: Approved
              - button "Remove this tag" [ref=e173] [cursor=pointer]
            - button "Add another tag" [ref=e174] [cursor=pointer]
```

# Test source

```ts
  17661 |     // @step 04-set s_7db6d8/4
  17662 |     let urlBefore5 = '';
  17663 |     let alertsBefore5: string[] = [];
  17664 |     let alertsAfter5: ObservedAlerts | null = null;
  17665 |     let obs5: ActionObservation | null = null;
  17666 |     let urlFailed5 = false;
  17667 |     for (let attempt = 0; ; attempt++) {
  17668 |       try {
  17669 |         await runStepLifecycle({
  17670 |           prepare: async () => {
  17671 |             await settle(page);
  17672 |             for (const warning of await restoreStandingFills(page, filled2, 'click', '04-set s_7db6d8/4')) logWarning(warning);
  17673 |             urlBefore5 = page.url();
  17674 |             alertsBefore5 = (await liveAlerts(page, 2)) ?? [];
  17675 |           },
  17676 |           act: async () => {
  17677 |             const hit5 = await pickOrNavigate(page, [
  17678 |               { locator: page.locator('li', { hasText: `${p.v4}` }), index: 0, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'li', hasText: `${p.v4}` }) },
  17679 |               { locator: page.getByText(`${p.v4}`, { exact: true }), index: 1, structural: false, kind: 'text', carries: JSON.stringify({ kind: 'text', text: `${p.v4}` }) },
  17680 |               { locator: page.locator('div > div > div:nth-of-type(1) > div:nth-of-type(3) > ul > li:nth-of-type(1)'), index: 2, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'div > div > div:nth-of-type(1) > div:nth-of-type(3) > ul > li:nth-of-type(1)' }) },
  17681 |               { locator: pointLocator(page, { x: 1144, y: 346 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1144, y: 346, w: 180, h: 36.6, role: null, tag: 'li', vw: 1280, vh: 900 }), point: { x: 1144, y: 346, w: 180, h: 36.6, role: null, tag: 'li', vw: 1280, vh: 900 } },
  17682 |             ], '04-set s_7db6d8/4 target', { stayOnOrigin: 'http://127.0.0.1:8103', waitMs: RESOLVE_WAIT_MS }, 'http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page/edit', p, { drift: run.drift });
  17683 |             if (!hit5) return { status: 'skipped' };
  17684 |             if (await positionalClick(page, hit5, [0, 1], [3], [], {"by":"text","name":"{{v4}}"}, p, '04-set s_7db6d8/4', 2)) return { status: 'skipped' };
  17685 |             await markActed(page, hit5.locator, echoLedger, [], 's_7db6d8/4', 'click');
  17686 |             obs5 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true });
  17687 |             await click(hit5.locator, { obs: obs5 }).catch(actionFailed);
  17688 |             return { status: 'completed', value: undefined };
  17689 |           },
  17690 |           settle: async () => {
  17691 |             if (obs5) await obs5.settle();
  17692 |             else if (page.url() !== urlBefore5) await settle(page);
  17693 |             alertsAfter5 = await settledAlerts(page, 2);
  17694 |           },
  17695 |           bind: async () => {
  17696 |           },
  17697 |           verify: async () => {
  17698 |             errorPageGate(page, '04-set s_7db6d8/4');
  17699 |             try { await urlEffect(page, 'http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page/edit', p, '04-set s_7db6d8/4', volatile2, obs5?.link()); } catch (err) { urlFailed5 = true; throw err; }
  17700 |             alertGate(alertsBefore5, alertsAfter5, { where: '04-set s_7db6d8/4', isRead: false, params: p });
  17701 |           },
  17702 |         });
  17703 |         break;
  17704 |       } catch (err) {
  17705 |         if (attempt > 0 || !urlFailed5 || !(await standingFillsLost(page, filled2))) throw err;
  17706 |         urlFailed5 = false;
  17707 |         rearmStandingFills(filled2);
  17708 |         logWarning('04-set s_7db6d8/4: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  17709 |       }
  17710 |     }
  17711 | 
  17712 |     // @step 04-set s_7db6d8/5
  17713 |     let urlBefore6 = '';
  17714 |     let alertsBefore6: string[] = [];
  17715 |     let alertsAfter6: ObservedAlerts | null = null;
  17716 |     let obs6: ActionObservation | null = null;
  17717 |     let urlFailed6 = false;
  17718 |     for (let attempt = 0; ; attempt++) {
  17719 |       try {
  17720 |         await runStepLifecycle({
  17721 |           prepare: async () => {
  17722 |             await settle(page);
  17723 |             for (const warning of await restoreStandingFills(page, filled2, 'click', '04-set s_7db6d8/5')) logWarning(warning);
  17724 |             urlBefore6 = page.url();
  17725 |             alertsBefore6 = (await liveAlerts(page, 2)) ?? [];
  17726 |           },
  17727 |           act: async () => {
  17728 |             const hit6 = await pickOrNavigate(page, [
  17729 |               { locator: page.getByRole('button', { name: roleName('Remove this tag'), exact: true }).nth(1), index: 0, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'button', name: 'Remove this tag', nth: 1 }), nth: 1 },
  17730 |               { locator: page.locator('div:nth-of-type(2) > div > div > div > div:nth-of-type(2) > button'), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'div:nth-of-type(2) > div > div > div > div:nth-of-type(2) > button' }) },
  17731 |               { locator: pointLocator(page, { x: 1229, y: 378 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1229, y: 378, w: 28, h: 64, role: 'button', tag: 'button', vw: 1280, vh: 900 }), point: { x: 1229, y: 378, w: 28, h: 64, role: 'button', tag: 'button', vw: 1280, vh: 900 } },
  17732 |             ], '04-set s_7db6d8/5 target', { stayOnOrigin: 'http://127.0.0.1:8103', waitMs: RESOLVE_WAIT_MS }, 'http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page/edit', p, { drift: run.drift });
  17733 |             if (!hit6) return { status: 'skipped' };
  17734 |             noteInteraction(echoLedger, ['Remove this tag']);
  17735 |             await markActed(page, hit6.locator, echoLedger, ['Remove this tag'], 's_7db6d8/5', 'click');
  17736 |             // A hide: the recording's click took these lines off the page, and did nothing else.
  17737 |             // When none of them is on the page it is already in effect (as replay skips it):
  17738 |             //   - textbox "Tag Name"
  17739 |             //   - textbox "Tag Value (Optional)"
  17740 |             const hide6 = await hideBefore(page, ['- textbox "Tag Name"', '- textbox "Tag Value (Optional)"'], true, p, '04-set s_7db6d8/5', 2);
  17741 |             if (hide6.stop) throw new Error(hide6.stop);
  17742 |             if (hide6.skip) {
  17743 |               console.log('[sitelooper skip] 04-set s_7db6d8/5: what this click removes is not on the page — click skipped');
  17744 |               return { status: 'skipped' };
  17745 |             } else {
  17746 |               obs6 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true });
  17747 |               await click(hit6.locator, { obs: obs6 }).catch(actionFailed);
  17748 |             }
  17749 |             return { status: 'completed', value: undefined };
  17750 |           },
  17751 |           settle: async () => {
  17752 |             if (obs6) await obs6.settle();
  17753 |             else if (page.url() !== urlBefore6) await settle(page);
  17754 |             alertsAfter6 = await settledAlerts(page, 2);
  17755 |           },
  17756 |           bind: async () => {
  17757 |           },
  17758 |           verify: async () => {
  17759 |             errorPageGate(page, '04-set s_7db6d8/5');
  17760 |             try { await urlEffect(page, 'http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page/edit', p, '04-set s_7db6d8/5', volatile2, obs6?.link()); } catch (err) { urlFailed6 = true; throw err; }
> 17761 |             { const hidden = hideVerdict(['- textbox "Tag Name"', '- textbox "Tag Value (Optional)"'], p, await captureLines(page, 2), '04-set s_7db6d8/5'); for (const w of hidden.warnings) console.log(`[sitelooper warn] ${w}`); if (hidden.stop) throw new Error(hidden.stop); }
        |                                                                                                                                                                                                                                                             ^ Error: after step 04-set s_7db6d8/5 the page still shows "- textbox \"Tag Name\"", which the click was recorded removing — it did not have its recorded effect
  17762 |             alertGate(alertsBefore6, alertsAfter6, { where: '04-set s_7db6d8/5', isRead: false, params: p });
  17763 |           },
  17764 |         });
  17765 |         break;
  17766 |       } catch (err) {
  17767 |         if (attempt > 0 || !urlFailed6 || !(await standingFillsLost(page, filled2))) throw err;
  17768 |         urlFailed6 = false;
  17769 |         rearmStandingFills(filled2);
  17770 |         logWarning('04-set s_7db6d8/5: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  17771 |       }
  17772 |     }
  17773 | 
  17774 |     // @step 04-set s_7db6d8/6
  17775 |     let urlBefore7 = '';
  17776 |     let alertsBefore7: string[] = [];
  17777 |     let alertsAfter7: ObservedAlerts | null = null;
  17778 |     let linesBefore7: string[] | null = null;
  17779 |     let linesAfter7: string[] | null = null;
  17780 |     let positional7 = false;
  17781 |     let obs7: ActionObservation | null = null;
  17782 |     let urlFailed7 = false;
  17783 |     for (let attempt = 0; ; attempt++) {
  17784 |       try {
  17785 |         await runStepLifecycle({
  17786 |           prepare: async () => {
  17787 |             await settle(page);
  17788 |             for (const warning of await restoreStandingFills(page, filled2, 'click', '04-set s_7db6d8/6')) logWarning(warning);
  17789 |             urlBefore7 = page.url();
  17790 |             alertsBefore7 = (await liveAlerts(page, 2)) ?? [];
  17791 |             linesBefore7 = await capturePageLines(page, 2);
  17792 |           },
  17793 |           act: async () => {
  17794 |             const hit7 = await pickOrNavigate(page, [
  17795 |               { locator: page.getByRole('button', { name: roleName('Save Page'), exact: true }), index: 0, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'button', name: 'Save Page' }) },
  17796 |               { locator: page.locator('#save-button'), index: 1, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#save-button' }) },
  17797 |               { locator: page.locator('#save-button'), index: 2, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#save-button' }) },
  17798 |               { locator: pointLocator(page, { x: 1210, y: 98 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1210, y: 98, w: 140.6, h: 48.1, role: 'button', tag: 'button', vw: 1280, vh: 900 }), point: { x: 1210, y: 98, w: 140.6, h: 48.1, role: 'button', tag: 'button', vw: 1280, vh: 900 } },
  17799 |             ], '04-set s_7db6d8/6 target', { stayOnOrigin: 'http://127.0.0.1:8103', waitMs: RESOLVE_WAIT_MS }, 'http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page', p, { drift: run.drift });
  17800 |             if (!hit7) return { status: 'skipped' };
  17801 |             if (await positionalClick(page, hit7, [0, 1, 2], [3], [], {"by":"role","role":"button","name":"Save Page"}, p, '04-set s_7db6d8/6', 2)) return { status: 'skipped' };
  17802 |             positional7 = positional7 || hit7.structural || hit7.nth !== undefined;
  17803 |             noteInteraction(echoLedger, ['Save Page']);
  17804 |             await markActed(page, hit7.locator, echoLedger, ['Save Page'], 's_7db6d8/6', 'click');
  17805 |             obs7 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true });
  17806 |             await click(hit7.locator, { obs: obs7 }).catch(actionFailed);
  17807 |             return { status: 'completed', value: undefined };
  17808 |           },
  17809 |           settle: async () => {
  17810 |             if (obs7) await obs7.settle();
  17811 |             else if (page.url() !== urlBefore7) await settle(page);
  17812 |             linesAfter7 = await capturePageLines(page, 2);
  17813 |             alertsAfter7 = await settledAlerts(page, 2);
  17814 |           },
  17815 |           bind: async () => {
  17816 |           },
  17817 |           verify: async () => {
  17818 |             errorPageGate(page, '04-set s_7db6d8/6');
  17819 |             try { await urlEffect(page, 'http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page', p, '04-set s_7db6d8/6', volatile2, obs7?.link()); } catch (err) { urlFailed7 = true; throw err; }
  17820 |             // The step's recorded page changes, judged by the daemon's own effect gate (see expectChanges):
  17821 |             //   - heading "Details"
  17822 |             //   - link "Bench Admin"
  17823 |             //   - heading "Actions"
  17824 |             const changes7 = await expectChanges(page, ['- heading "Details"', '- link "Bench Admin"', '- heading "Actions"'], p, { tag: '04-set s_7db6d8/6', tool: 'click', leftByLink: leftByLink('http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page', page.url(), p, obs7?.link()), positionalResolution: positional7 }, linesBefore7, 2, linesAfter7);
  17825 |             noteCommit(echoLedger, liveLines(changes7.inDiff ?? [], p, counterNames(siteFactsAt(page.url()), page.url())), 's_7db6d8/6');
  17826 |             for (const slot of committedSlots('click', changes7.inDiff)) typedCommitted.add(slot);
  17827 |             alertGate(alertsBefore7, alertsAfter7, { where: '04-set s_7db6d8/6', isRead: false, params: p, effectConfirmed: changes7.confirmed === true });
  17828 |           },
  17829 |         });
  17830 |         break;
  17831 |       } catch (err) {
  17832 |         if (attempt > 0 || !urlFailed7 || !(await standingFillsLost(page, filled2))) throw err;
  17833 |         urlFailed7 = false;
  17834 |         rearmStandingFills(filled2);
  17835 |         logWarning('04-set s_7db6d8/6: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  17836 |       }
  17837 |     }
  17838 | 
  17839 |     // s_3e9fbe: On the saved page '{{v1}}', set its only tag to the existing tag name '{{v3}}' with value '{{v4}}'. Ensure there are no other tags, save the page, and verify the displayed tag name and value.
  17840 |     // recorded on a page matching http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page
  17841 |     const readsBefore3 = skippedReads.length;
  17842 | 
  17843 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  17844 |     await preconditionGate('http://127.0.0.1:8103/books/bench-handbook/page/{{v2}}-bench-page', page.url(), p, '04-set s_3e9fbe', cosine(recordedFingerprint('04-set', 's_3e9fbe'), (await fingerprintPage(page)) ?? undefined));
  17845 | 
  17846 |     // @step 04-set s_3e9fbe/1
  17847 |     let urlBefore8 = '';
  17848 |     await runStepLifecycle({
  17849 |       prepare: async () => {
  17850 |         await settle(page);
  17851 |         urlBefore8 = page.url();
  17852 |       },
  17853 |       act: async () => {
  17854 |         outputs['04-set.displayed_tags'] = await readOptional(page, [
  17855 |           { locator: page.locator('#sidebar > aside'), index: 0, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#sidebar > aside' }) },
  17856 |           { locator: pointLocator(page, { x: 166, y: 909 }), index: 1, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 166, y: 909, w: 294.5, h: 327.6, role: null, tag: 'aside', vw: 1280, vh: 900 }), point: { x: 166, y: 909, w: 294.5, h: 327.6, role: null, tag: 'aside', vw: 1280, vh: 900 } },
  17857 |         ], '04-set s_3e9fbe/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, async (loc: Locator) => scopedRead(await readElements(loc, false, 'text'), { within: p['v2'] }), { drift: run.drift, kinds: [{"role":null,"tag":"aside"}], label: 'displayed_tags' });
  17858 |         await echoRead(echoLedger, run, 'displayed_tags', '04-set.displayed_tags', outputs['04-set.displayed_tags'], '04-set s_3e9fbe/1', page, lastReadHit);
  17859 |         return { status: 'completed', value: undefined };
  17860 |       },
  17861 |       settle: async () => {
```