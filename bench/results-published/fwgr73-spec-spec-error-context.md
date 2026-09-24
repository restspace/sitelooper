# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwgr73.spec.ts >> fwgr73
- Location: fwgr73.spec.ts:9:1

# Error details

```
Error: the field holds the value it was given twice over ("\"tags\"\"tags\"\"" for "\"tags\"") — it was typed onto a copy already there, and is not saved [outcome: unknown]
```

# Page snapshot

```yaml
- generic [ref=e1]:
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
              - link "fwgr73-spec Bench Dashboard" [ref=e53] [cursor=pointer]:
                - /url: /d/dfz9aegl76m0wd/fwgr73-spec-bench-dashboard?from=now-6h&to=now&timezone=browser
              - img [ref=e55]
            - listitem [ref=e57]:
              - link "Settings" [ref=e58] [cursor=pointer]:
                - /url: /d/dfz9aegl76m0wd/fwgr73-spec-bench-dashboard?from=now-6h&to=now&timezone=browser&editview=settings
              - img [ref=e60]
            - listitem [ref=e62]:
              - generic "JSON Model" [ref=e63]
        - generic [ref=e64]:
          - generic [ref=e66]:
            - button "Back to dashboard" [ref=e68] [cursor=pointer]:
              - img [ref=e69]
              - generic [ref=e71]: Back to dashboard
            - generic [ref=e75]:
              - button "Save dashboard" [ref=e76] [cursor=pointer]:
                - generic [ref=e77]: Save dashboard
              - button "More save options" [ref=e78] [cursor=pointer]:
                - img [ref=e79]
          - button "Toggle top search bar" [ref=e82] [cursor=pointer]:
            - img [ref=e84]
    - main [ref=e88]:
      - generic [ref=e91]:
        - heading "Settings" [level=1] [ref=e96]
        - tablist [ref=e99]:
          - tab "General" [ref=e101] [cursor=pointer]
          - tab "Annotations" [ref=e103] [cursor=pointer]
          - tab "Variables" [ref=e105] [cursor=pointer]
          - tab "Links" [ref=e107] [cursor=pointer]
          - tab "Versions" [ref=e109] [cursor=pointer]
          - tab "Permissions" [ref=e111] [cursor=pointer]
          - tab "JSON Model" [selected] [ref=e113] [cursor=pointer]
        - generic [ref=e115]:
          - text: The JSON model below is the data structure that defines the dashboard. This includes dashboard settings, panel settings, layout, queries, and so on.
          - code [ref=e119]:
            - generic [ref=e120]:
              - generic [ref=e123]:
                - generic [ref=e125] [cursor=pointer]: 
                - generic [ref=e126]: "1"
              - generic [ref=e132]: "\"tags\"\"tags\"\""
              - textbox "Editor content;Press Alt+F1 for Accessibility Options." [active] [ref=e138]: "\"tags\"\"tags\"\""
              - generic:
                - generic [ref=e139]:
                  - button "Toggle Replace" [ref=e140] [cursor=pointer]: 
                  - generic [ref=e141]:
                    - generic [ref=e142]:
                      - textbox "Find" [ref=e145]
                      - generic [ref=e146]:
                        - checkbox "Match Case (Alt+C)" [ref=e147] [cursor=pointer]: 
                        - checkbox "Match Whole Word (Alt+W)" [ref=e148] [cursor=pointer]: 
                        - checkbox "Use Regular Expression (Alt+R)" [ref=e149] [cursor=pointer]: 
                    - generic [ref=e150]:
                      - generic [ref=e151]: No results
                      - button "Previous Match (Shift+Enter)" [disabled] [ref=e152]: 
                      - button "Next Match (Enter)" [disabled] [ref=e153]: 
                      - checkbox "Find in Selection (Alt+L)" [disabled] [ref=e154] [cursor=pointer]: 
                      - button "Close (Escape)" [ref=e155] [cursor=pointer]: 
                  - text:   
                - text:   
          - button "Save changes" [ref=e162] [cursor=pointer]:
            - generic [ref=e163]: Save changes
  - generic [ref=e164]:
    - alert [ref=e165]: No results found
    - alert
    - complementary
    - complementary
```

# Test source

```ts
  14719 | }
  14720 | 
  14721 | /**
  14722 |  * After a submitting action whose step failed: was the submit lost to a
  14723 |  * replaced document? True only when the document it went out from is gone,
  14724 |  * the page is on the url the fills ran on, and every field they filled is
  14725 |  * there again (waited for) and empty. The runner then rearms the ledger and
  14726 |  * runs the step once more.
  14727 |  */
  14728 | async function standingFillsLost(page: Page, ledger: StandingFills): Promise<boolean> {
  14729 |   const sent = ledger.submitted;
  14730 |   if (!sent?.fills.length || sent.doc === null) return false;
  14731 |   if (page.url() !== sent.url) return false;
  14732 |   const doc = await documentOf(page);
  14733 |   if (doc === null || doc === sent.doc) return false;
  14734 |   if (page.url() !== sent.url) return false;
  14735 |   const deadline = Date.now() + STANDING_FILL_ATTACH_MS;
  14736 |   for (const fill of sent.fills) {
  14737 |     if (fill.url !== sent.url) return false;
  14738 |     if ((await inputValueOnceBuilt(fill.locator, deadline)) !== '') return false;
  14739 |   }
  14740 |   return true;
  14741 | }
  14742 | 
  14743 | /** Put the lost submit's fills back as standing, so the repeated step's own check refills them. Once: the record of the submit is consumed. */
  14744 | function rearmStandingFills(ledger: StandingFills): void {
  14745 |   if (!ledger.submitted) return;
  14746 |   ledger.fills = ledger.submitted.fills;
  14747 |   ledger.submitted = undefined;
  14748 | }
  14749 | 
  14750 | /**
  14751 |  * A FILL LOST TO A REPLACED DOCUMENT (round 56, vikunja fwvk8 01-open). The
  14752 |  * ledger above protects a submit; a fill's own check is asked earlier. On
  14753 |  * fwvk8's login the page replaced its document after the username fill
  14754 |  * dispatched and before that fill's echo check looked, so the check found
  14755 |  * the rebuilt field empty ("did not show textbox …: admin") and the step
  14756 |  * stopped, one step before the submit's refill would have put it back.
  14757 |  *
  14758 |  * After a fill whose own verification failed: true only when the document
  14759 |  * it ran in (`before`, read ahead of the dispatch) is gone and the page is
  14760 |  * still on the url it ran on — a reload, not a navigation. The runner then
  14761 |  * runs the fill once more, whose resolution waits for the field to be built
  14762 |  * again and whose check judges it anew. A fill whose value simply did not
  14763 |  * take on an unchanged document is never repeated: its check's stop stands.
  14764 |  */
  14765 | async function fillLost(page: Page, before: number | null, url: string): Promise<boolean> {
  14766 |   if (before === null || page.url() !== url) return false;
  14767 |   const doc = await documentOf(page);
  14768 |   return doc !== null && doc !== before && page.url() === url;
  14769 | }
  14770 | 
  14771 | /**
  14772 |  * A VALUE TYPED ONTO ITS OWN RESTORED COPY (round 57, espocrm fwec10). n1
  14773 |  * filled Amount "12500", choosing the account then emptied the field, and the
  14774 |  * model typed the amount again — so s_7d6b2f fills it at step 2 AND types it
  14775 |  * at step 18. On replay the standing-fill check refilled the emptied field
  14776 |  * before the next click, and step 18's `type` (keys, which never clear)
  14777 |  * APPENDED: the app saved 1,250,012,500, both replays and the compiled run
  14778 |  * reported success, and only the external verifier saw it.
  14779 |  *
  14780 |  * guardedTyping wraps a recorded `type` or `fill`, the same in both runners:
  14781 |  *  - ahead of a `type`, the field is cleared when it already holds the value
  14782 |  *    about to be typed (sameValue: keys typed onto their own value can only
  14783 |  *    double it), or when this segment filled that very element (the ledger,
  14784 |  *    standing or taken by the last submit — the recording typed the whole
  14785 |  *    value into what the app had left empty);
  14786 |  *  - after either, the field's resulting value is judged (valueDoubled): a
  14787 |  *    field holding the given value twice over is stopped, never saved.
  14788 |  * Only a plain input or textarea is asked, and a value carrying a `{{…}}`
  14789 |  * marker (a secret, a one-time code) is never compared: the runners hold it
  14790 |  * in different forms. `warn` is told when a field was cleared.
  14791 |  */
  14792 | async function guardedTyping<T>(
  14793 |   ledger: StandingFills | null,
  14794 |   locator: Locator,
  14795 |   value: string,
  14796 |   tool: string,
  14797 |   warn: (warning: string) => void,
  14798 |   dispatch: () => Promise<T>,
  14799 | ): Promise<T> {
  14800 |   const comparable = value !== '' && !value.includes('{{');
  14801 |   if (tool === 'type' && comparable) {
  14802 |     const held = await inputValueNow(locator);
  14803 |     if (held) {
  14804 |       const own = sameValue(held, value);
  14805 |       const filledHere = !own && ledger !== null && (await filledBy(ledger, locator));
  14806 |       if (own || filledHere) {
  14807 |         await locator.fill('', { timeout: DEFAULT_ACTION_TIMEOUT_MS });
  14808 |         warn(
  14809 |           own
  14810 |             ? 'the field already held the value this type enters (restored after the recording saw it emptied), so it was cleared first rather than typed onto'
  14811 |             : 'this procedure filled the field earlier, so it was cleared before typing, as the recording typed into it empty',
  14812 |         );
  14813 |       }
  14814 |     }
  14815 |   }
  14816 |   const result = await dispatch();
  14817 |   if (comparable && (tool === 'type' || tool === 'fill')) {
  14818 |     const doubled = await valueDoubled(locator, value);
> 14819 |     if (doubled) throw new Error(doubled);
        |                        ^ Error: the field holds the value it was given twice over ("\"tags\"\"tags\"\"" for "\"tags\"") — it was typed onto a copy already there, and is not saved [outcome: unknown]
  14820 |   }
  14821 |   return result;
  14822 | }
  14823 | 
  14824 | /** Whether a fill this segment made (standing, or taken by the last submit) was of this very element. */
  14825 | async function filledBy(ledger: StandingFills, locator: Locator): Promise<boolean> {
  14826 |   const fills = [...ledger.fills, ...(ledger.submitted?.fills ?? [])];
  14827 |   for (const fill of fills) {
  14828 |     try {
  14829 |       if ((await fill.locator.count()) !== 1) continue;
  14830 |       const other = await fill.locator.elementHandle({ timeout: STANDING_FILL_PROBE_MS });
  14831 |       if (!other) continue;
  14832 |       const same = await locator.evaluate((el, o) => el === o, other, { timeout: STANDING_FILL_PROBE_MS });
  14833 |       await other.dispose();
  14834 |       if (same) return true;
  14835 |     } catch {
  14836 |       // a fill whose field is gone is no evidence either way
  14837 |     }
  14838 |   }
  14839 |   return false;
  14840 | }
  14841 | 
  14842 | /**
  14843 |  * The stop for a field that holds the value it was given TWICE over: the
  14844 |  * value's letters and digits occur twice in what the field shows, where the
  14845 |  * value itself holds them once ("1,250,012,500" for "12500"). Null when the
  14846 |  * field is not a plain input or textarea, is a password field, or holds the
  14847 |  * value once, in whatever formatting the page gives it.
  14848 |  */
  14849 | async function valueDoubled(locator: Locator, value: string): Promise<string | null> {
  14850 |   const alnum = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  14851 |   const want = alnum(value);
  14852 |   if (!want) return null;
  14853 |   let held: string | null;
  14854 |   try {
  14855 |     if ((await locator.count()) !== 1) return null;
  14856 |     held = await locator.evaluate(
  14857 |       (el) => (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'password') ? (el as HTMLInputElement).value : null),
  14858 |       undefined,
  14859 |       { timeout: STANDING_FILL_PROBE_MS },
  14860 |     );
  14861 |   } catch {
  14862 |     return null;
  14863 |   }
  14864 |   if (!held) return null;
  14865 |   const count = (text: string) => {
  14866 |     let n = 0;
  14867 |     for (let at = text.indexOf(want); at >= 0; at = text.indexOf(want, at + want.length)) n++;
  14868 |     return n;
  14869 |   };
  14870 |   if (count(alnum(held)) < 2) return null;
  14871 |   const show = (t: string) => (t.length > 40 ? `${t.slice(0, 40)}…` : t);
  14872 |   return `the field holds the value it was given twice over (${JSON.stringify(show(held))} for ${JSON.stringify(show(value))}) — it was typed onto a copy already there, and is not saved`;
  14873 | }
  14874 | 
  14875 | // Shared execution source: report.ts. Regenerate to update.
  14876 | /**
  14877 |  * REPORT-TEMPLATE VALUES, the rule both execution targets share. A zero-model
  14878 |  * run reports what it read live, and — standing in for the recording's report
  14879 |  * — every value of the skill's report template built from the caller's own
  14880 |  * `{{vN}}` parameters, filled for this run. A recorded literal (run 1's record
  14881 |  * id) is stale on any later run and is never published.
  14882 |  *
  14883 |  * The daemon applies it in synthesizeReport (src/skills/learn.ts) to the last
  14884 |  * segment of the chain it replayed; a compiled artifact applies it after the
  14885 |  * last segment of the step, for every value no live read of the step has
  14886 |  * already published. fwgh4's artifact refused to compile over a value only the
  14887 |  * daemon published: 03-open consumed `{{02-create.post_title_element_text}}`,
  14888 |  * the template's `"{{v2}}"`, and the artifact carried the template only for a
  14889 |  * goal guard.
  14890 |  *
  14891 |  * A PARAM DOES NOT VOUCH FOR THE TEXT AROUND IT. fwrd86's 06-delete template
  14892 |  * held `list_row_RD-1015: "{{v1}} | {{v4}} RD Bench Ticket [Archived] | … |
  14893 |  * Created: 2026-09-23"` and `list_default_count: "Showing 1–10 of 13 ({{v1}}
  14894 |  * hidden …)"`. Each carries a slot, so each was "built from the caller's
  14895 |  * params", and both replays published the recording's date and the
  14896 |  * recording's counts as their own findings — n2 archived a second ticket and
  14897 |  * still reported "of 15". The slot is this run's; the text between the slots
  14898 |  * is the recording's. So every literal of a template value must stand on THIS
  14899 |  * run's page before the value is published (unshownLiterals), and a value
  14900 |  * whose literal the page does not show is withheld, in both runners, rather
  14901 |  * than reported from memory.
  14902 |  *
  14903 |  * Self-contained: sibling shared modules and Playwright types only.
  14904 |  */
  14905 | 
  14906 | /**
  14907 |  * Whether a template value is built from this run's parameters at all (a
  14908 |  * recorded literal is not): a caller's slot `{{vN}}`, or a value the run
  14909 |  * minted and bound from its own url `{{dN}}` (fwec8 02-create's record id).
  14910 |  */
  14911 | function derivesFromParams(template: string): boolean {
  14912 |   return /\{\{[vd]\d+\}\}/.test(template);
  14913 | }
  14914 | 
  14915 | /** The `{{vN}}`/`{{dN}}` markers a template value names. */
  14916 | function templateMarkers(template: string): string[] {
  14917 |   return [...new Set(Array.from(template.matchAll(/\{\{([vd]\d+)\}\}/g), (m) => m[1]))];
  14918 | }
  14919 | 
```