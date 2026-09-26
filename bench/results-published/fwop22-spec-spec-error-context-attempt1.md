# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwop22.spec.ts >> fwop22
- Location: fwop22.spec.ts:9:1

# Error details

```
TimeoutError: locator.evaluate: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('combobox', { name: /^[\s\p{Co}\p{So}\p{Cf}]*Search\s+in\s+OpenProject[\s\p{Co}\p{So}\p{Cf}]*$/u })
 [outcome: unknown]
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e5]: Open link in a new tab
  - generic [ref=e6]:
    - banner [ref=e7]:
      - generic [ref=e8]:
        - link "Click here to skip over the menu and go to the content" [ref=e9] [cursor=pointer]:
          - /url: ""
          - text: Jump to content
        - navigation "Top Menu" [ref=e10]:
          - button "Global modules" [ref=e11] [cursor=pointer]:
            - img
          - link "Home" [ref=e13] [cursor=pointer]:
            - /url: http://127.0.0.1:8090/
      - search "Search in OpenProject" [ref=e17]:
        - text: 
        - button "Search" [ref=e18] [cursor=pointer]:
          - generic [ref=e20]: 
        - generic [ref=e23]:
          - generic [ref=e25]:
            - generic [ref=e26]: Search work packages by subject, project, type, status or ID
            - combobox "Search work packages by subject, project, type, status or ID" [expanded] [active] [ref=e28]
          - status [ref=e29]
          - listbox "Options List" [ref=e31]:
            - generic [ref=e33] [cursor=pointer]: Type to search
      - generic [ref=e34]:
        - button "Add…" [ref=e36] [cursor=pointer]:
          - generic [ref=e37]:
            - generic:
              - img
            - img "Add…" [ref=e39]
        - link "Notifications" [ref=e42] [cursor=pointer]:
          - /url: /notifications
          - img
        - button "Help" [ref=e44] [cursor=pointer]:
          - img
        - button "User menu" [ref=e45] [cursor=pointer]:
          - img "User menu" [ref=e49]: BA
    - generic [ref=e50]:
      - navigation "Side Menu" [ref=e51]:
        - button "Collapse project menu" [expanded] [ref=e53] [cursor=pointer]:
          - img [ref=e55]
        - generic [ref=e57]:
          - generic [ref=e58]:
            - generic [ref=e59]:
              - button "Bench Project" [ref=e61] [cursor=pointer]:
                - generic [ref=e62]:
                  - generic [ref=e63]: Bench Project
                  - generic:
                    - img
              - button "Collapse project menu" [expanded] [ref=e65] [cursor=pointer]:
                - img
            - separator [ref=e66]
          - list [ref=e67]:
            - listitem [ref=e68]:
              - generic [ref=e69]:
                - link "Go back one menu level" [ref=e70] [cursor=pointer]:
                  - /url: "#"
                  - img [ref=e71]
                - link "Work packages" [ref=e73] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/projects/bench-project/work_packages
              - list [ref=e74]:
                - listitem [ref=e75]:
                  - generic [ref=e77]:
                    - generic [ref=e79]:
                      - generic [ref=e80]: Search
                      - generic [ref=e81]:
                        - generic:
                          - img
                        - textbox "Search" [ref=e82]:
                          - /placeholder: Search by name
                    - generic [ref=e84]:
                      - button "Default" [ref=e85] [cursor=pointer]:
                        - text: Default
                        - generic [ref=e86]: 
                      - list [ref=e87]:
                        - listitem [ref=e88]:
                          - link "All open" [ref=e89] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?work_package_default=true
                            - generic [ref=e90]: All open
                        - listitem [ref=e91]:
                          - link "Latest activity" [ref=e92] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=latest_activity&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22%2A%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e93]: Latest activity
                        - listitem [ref=e94]:
                          - link "Recently created" [ref=e95] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=recently_created&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22createdAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22createdAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e96]: Recently created
                        - listitem [ref=e97]:
                          - link "Overdue" [ref=e98] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=overdue&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22createdAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22type%22%2C%22subject%22%2C%22status%22%2C%22startDate%22%2C%22dueDate%22%2C%22duration%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22dueDate%22%2C%22o%22%3A%22%5Cu003ct-%22%2C%22v%22%3A%5B%221%22%5D%7D%2C%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e99]: Overdue
                        - listitem [ref=e100]:
                          - link "Summary" [ref=e101] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages/report?name=summary
                            - generic [ref=e102]: Summary
                        - listitem [ref=e103]:
                          - link "Created by me" [ref=e104] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=created_by_me&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%2Cid%3Aasc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22author%22%2C%22o%22%3A%22%3D%22%2C%22v%22%3A%5B%22me%22%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e105]: Created by me
                        - listitem [ref=e106]:
                          - link "Assigned to me" [ref=e107] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=assigned_to_me&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%2Cid%3Aasc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22author%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22assigneeOrGroup%22%2C%22o%22%3A%22%3D%22%2C%22v%22%3A%5B%22me%22%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e108]: Assigned to me
                        - listitem [ref=e109]:
                          - link "Shared with users Enterprise edition" [ref=e110] [cursor=pointer]:
                            - /url: /work_packages/share_upsell?name=shared_with_users
                            - generic [ref=e111]:
                              - text: Shared with users
                              - img "Enterprise edition" [ref=e112]
                        - listitem [ref=e114]:
                          - link "Shared with me Enterprise edition" [ref=e115] [cursor=pointer]:
                            - /url: /work_packages/share_upsell?name=shared_with_me
                            - generic [ref=e116]:
                              - text: Shared with me
                              - img "Enterprise edition" [ref=e117]
      - main [ref=e119]:
        - generic [ref=e120]:
          - heading "Content" [level=1] [ref=e121]
          - generic [ref=e130]:
            - navigation "Breadcrumb" [ref=e133]:
              - list [ref=e134]:
                - listitem [ref=e135]:
                  - link "Bench Project" [ref=e138] [cursor=pointer]:
                    - /url: /projects/bench-project
                - listitem [ref=e139]:
                  - link "Work packages" [ref=e142] [cursor=pointer]:
                    - /url: /projects/bench-project/work_packages
                - listitem [ref=e143]:
                  - 'link "Default: All open" [ref=e146] [cursor=pointer]':
                    - /url: "#"
            - generic [ref=e148]:
              - heading "All open" [level=2] [ref=e149]:
                - textbox "Click to edit title of this view. Press enter to save." [ref=e152]:
                  - /placeholder: Name of this view
                  - text: All open
              - list [ref=e153]:
                - listitem [ref=e154]:
                  - button "Create new work package" [ref=e157] [cursor=pointer]:
                    - img [ref=e158]
                    - generic [ref=e160]: Create
                    - img [ref=e161]
                - listitem [ref=e163]:
                  - generic [ref=e165]:
                    - button "Include projects 1" [ref=e166] [cursor=pointer]:
                      - text: Include projects
                      - generic [ref=e167]: "1"
                      - img [ref=e168]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e170]:
                  - generic [ref=e172]:
                    - button "Baseline" [ref=e173] [cursor=pointer]:
                      - img [ref=e174]
                      - generic [ref=e177]: Baseline
                      - img [ref=e178]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e180]:
                  - button "Deactivate Filter" [ref=e182] [cursor=pointer]:
                    - generic [ref=e184]: 
                    - generic [ref=e185]:
                      - text: Filter
                      - generic [ref=e186]: "1"
                    - img [ref=e187]
                - listitem [ref=e189]:
                  - button "Open details view" [ref=e191] [cursor=pointer]:
                    - generic [ref=e193]: 
                - listitem:
                  - generic:
                    - list
                - listitem [ref=e194]:
                  - button "Activate zen mode" [ref=e196] [cursor=pointer]:
                    - generic [ref=e198]: 
                - listitem [ref=e199]:
                  - button "More actions" [ref=e201] [cursor=pointer]:
                    - generic [ref=e203]: 
            - group "Selected filters" [ref=e209]:
              - generic [ref=e210]: Selected filters
              - button "Close form" [ref=e212] [cursor=pointer]:
                - img
              - list [ref=e213]:
                - listitem [ref=e214]:
                  - generic "Filter by text" [ref=e215]
                  - textbox "Filter by text" [ref=e218]:
                    - /placeholder: Subject, description, comments, ...
                - listitem [ref=e219]
                - listitem [ref=e220]:
                  - generic [ref=e221]: Status
                  - generic [ref=e222]:
                    - generic [ref=e223]: Status Open this filter with 'ALT' and arrow keys.
                    - combobox "Status Status Open this filter with 'ALT' and arrow keys." [ref=e224]:
                      - option "open" [selected]
                      - option "is (OR)"
                      - option "closed"
                      - option "is not"
                      - option "is not empty"
                  - button "Delete" [ref=e226] [cursor=pointer]:
                    - generic [ref=e228]: 
                - listitem [ref=e229]:
                  - generic [ref=e230]:
                    - generic [ref=e232]: 
                    - text: "Add filter:"
                  - generic [ref=e233]: Add filter Open this filter with 'ALT' and arrow keys. To select an entry leave the focus for example by pressing enter. To leave without filter select the first (empty) entry.
                  - generic [ref=e235]:
                    - generic [ref=e237]:
                      - generic [ref=e238]: Please select
                      - combobox [ref=e240]
                    - status [ref=e242]
            - generic [ref=e245]:
              - generic [ref=e247]:
                - table "Table with rows of work package and columns of work package attributes.Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns." [ref=e249]:
                  - caption [ref=e259]:
                    - text: Table with rows of work package and columns of work package attributes.
                    - text: Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns.
                  - rowgroup [ref=e260]:
                    - row "ID Subject Type Status Assignee Priority" [ref=e261]:
                      - columnheader [ref=e262]
                      - columnheader "ID" [ref=e264]:
                        - generic [ref=e267]:
                          - link "ID" [ref=e268] [cursor=pointer]:
                            - /url: "#"
                          - generic [ref=e270]: Open menu
                      - columnheader "Subject" [ref=e271]:
                        - generic [ref=e274]:
                          - generic [ref=e277] [cursor=pointer]: 
                          - link "Subject" [ref=e278] [cursor=pointer]:
                            - /url: "#"
                          - generic [ref=e280]: Open menu
                      - columnheader "Type" [ref=e281]:
                        - generic [ref=e284]:
                          - link "Type" [ref=e285] [cursor=pointer]:
                            - /url: "#"
                          - generic [ref=e287]: Open menu
                      - columnheader "Status" [ref=e288]:
                        - generic [ref=e291]:
                          - link "Status" [ref=e292] [cursor=pointer]:
                            - /url: "#"
                          - generic [ref=e294]: Open menu
                      - columnheader "Assignee" [ref=e295]:
                        - generic [ref=e298]:
                          - link "Assignee" [ref=e299] [cursor=pointer]:
                            - /url: "#"
                          - generic [ref=e301]: Open menu
                      - columnheader "Priority" [ref=e302]:
                        - generic [ref=e305]:
                          - link "Priority" [ref=e306] [cursor=pointer]:
                            - /url: "#"
                          - generic [ref=e308]: Open menu
                      - columnheader [ref=e309]:
                        - button "Configure view" [ref=e312] [cursor=pointer]:
                          - generic [ref=e314]: 
                  - rowgroup [ref=e315]:
                    - 'row " id 38 Work package leaf at level 0. Subject Seed: triage inbox: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e316] [cursor=pointer]':
                      - cell "" [ref=e317]:
                        - generic [ref=e318]: 
                      - cell "id 38" [ref=e319]:
                        - generic "id 38" [ref=e321]:
                          - link "38" [ref=e322]:
                            - /url: /projects/bench-project/work_packages/38/activity
                      - 'cell "Work package leaf at level 0. Subject Seed: triage inbox: Edit" [ref=e323]':
                        - generic [ref=e325]: Work package leaf at level 0.
                        - 'button "Subject Seed: triage inbox: Edit" [ref=e327]': "Seed: triage inbox"
                      - 'cell "Type Task: Edit" [ref=e328]':
                        - 'button "Type Task: Edit" [ref=e330]': Task
                      - 'cell "Status New: Edit" [ref=e331]':
                        - 'button "Status New: Edit" [ref=e333]': New
                      - 'cell "Assignee No value: Edit" [ref=e334]':
                        - 'button "Assignee No value: Edit" [ref=e336]': "-"
                      - 'cell "Priority Normal: Edit" [ref=e337]':
                        - 'button "Priority Normal: Edit" [ref=e339]': Normal
                      - cell "Open details view Open context menu" [ref=e340]:
                        - generic [ref=e341]:
                          - link "Open details view" [ref=e342]:
                            - /url: /projects/bench-project/work_packages/details/38/overview
                            - generic [ref=e343]: 
                          - link "Open context menu" [ref=e344]:
                            - /url: "#"
                            - generic [ref=e345]: 
                    - 'row " id 39 Work package leaf at level 0. Subject Seed: order missing parts: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e346] [cursor=pointer]':
                      - cell "" [ref=e347]:
                        - generic [ref=e348]: 
                      - cell "id 39" [ref=e349]:
                        - generic "id 39" [ref=e351]:
                          - link "39" [ref=e352]:
                            - /url: /projects/bench-project/work_packages/39/activity
                      - 'cell "Work package leaf at level 0. Subject Seed: order missing parts: Edit" [ref=e353]':
                        - generic [ref=e355]: Work package leaf at level 0.
                        - 'button "Subject Seed: order missing parts: Edit" [ref=e357]': "Seed: order missing parts"
                      - 'cell "Type Task: Edit" [ref=e358]':
                        - 'button "Type Task: Edit" [ref=e360]': Task
                      - 'cell "Status New: Edit" [ref=e361]':
                        - 'button "Status New: Edit" [ref=e363]': New
                      - 'cell "Assignee No value: Edit" [ref=e364]':
                        - 'button "Assignee No value: Edit" [ref=e366]': "-"
                      - 'cell "Priority Normal: Edit" [ref=e367]':
                        - 'button "Priority Normal: Edit" [ref=e369]': Normal
                      - cell "Open details view Open context menu" [ref=e370]:
                        - generic [ref=e371]:
                          - link "Open details view" [ref=e372]:
                            - /url: /projects/bench-project/work_packages/details/39/overview
                            - generic [ref=e373]: 
                          - link "Open context menu" [ref=e374]:
                            - /url: "#"
                            - generic [ref=e375]: 
                    - 'row " id 40 Work package leaf at level 0. Subject Seed: ship repaired device: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e376] [cursor=pointer]':
                      - cell "" [ref=e377]:
                        - generic [ref=e378]: 
                      - cell "id 40" [ref=e379]:
                        - generic "id 40" [ref=e381]:
                          - link "40" [ref=e382]:
                            - /url: /projects/bench-project/work_packages/40/activity
                      - 'cell "Work package leaf at level 0. Subject Seed: ship repaired device: Edit" [ref=e383]':
                        - generic [ref=e385]: Work package leaf at level 0.
                        - 'button "Subject Seed: ship repaired device: Edit" [ref=e387]': "Seed: ship repaired device"
                      - 'cell "Type Task: Edit" [ref=e388]':
                        - 'button "Type Task: Edit" [ref=e390]': Task
                      - 'cell "Status New: Edit" [ref=e391]':
                        - 'button "Status New: Edit" [ref=e393]': New
                      - 'cell "Assignee No value: Edit" [ref=e394]':
                        - 'button "Assignee No value: Edit" [ref=e396]': "-"
                      - 'cell "Priority Normal: Edit" [ref=e397]':
                        - 'button "Priority Normal: Edit" [ref=e399]': Normal
                      - cell "Open details view Open context menu" [ref=e400]:
                        - generic [ref=e401]:
                          - link "Open details view" [ref=e402]:
                            - /url: /projects/bench-project/work_packages/details/40/overview
                            - generic [ref=e403]: 
                          - link "Open context menu" [ref=e404]:
                            - /url: "#"
                            - generic [ref=e405]: 
                  - rowgroup
                  - rowgroup [ref=e406]:
                    - row "Create new work package" [ref=e407]:
                      - cell "Create new work package" [ref=e408]:
                        - button "Create new work package" [ref=e409] [cursor=pointer]:
                          - img [ref=e410]
                          - generic [ref=e412]: Create new work package
                - generic [ref=e413]: 
              - navigation "Pagination navigation" [ref=e417]:
                - text: (1 - 3/3)
                - generic [ref=e418]: You are on the only page.
```

# Test source

```ts
  12893 | function snapshotBook(snapshot: RecipeSnapshot): RecipeBook {
  12894 |   return {
  12895 |     offers: (intent) => snapshot.recipes.some((r) => r.intent === intent),
  12896 |     choose: (family, intent) => snapshot.recipes.find((r) => r.family === family && r.intent === intent) ?? null,
  12897 |   };
  12898 | }
  12899 | 
  12900 | /**
  12901 |  * Attempt an intent through the book's recipe for whatever component the
  12902 |  * target sits inside. Returns null when nothing was attempted — no recipe for
  12903 |  * the intent, no recognized component, or none for its family — so the caller
  12904 |  * goes straight to the native primitive; otherwise the attempt, verified or
  12905 |  * not, after reporting it to the book. Execute, then verify, then report —
  12906 |  * the daemon's order; a thrown step is an unverified attempt with its reason.
  12907 |  */
  12908 | async function applyRecipe(page: Page, target: Locator, intent: RecipeIntent, payload: string, book: RecipeBook): Promise<RecipeAttempt | null> {
  12909 |   if (!book.offers(intent)) return null;
  12910 |   const rec = await recognizeComponent(page, target);
  12911 |   if (!rec) return null;
  12912 |   let recipe: RecipeProcedure | null;
  12913 |   try {
  12914 |     recipe = book.choose(rec.family.id, intent);
  12915 |   } catch (err) {
  12916 |     await rec.root.dispose().catch(() => {});
  12917 |     throw err;
  12918 |   }
  12919 |   if (!recipe) {
  12920 |     // nothing will be attempted: release the pinned root at once
  12921 |     await rec.root.dispose().catch(() => {});
  12922 |     return null;
  12923 |   }
  12924 |   let attempt: RecipeAttempt;
  12925 |   try {
  12926 |     await executeRecipe(page, rec.root, recipe, payload);
  12927 |     attempt = { family: rec.family.id, intent, recipe, ok: await verifyRecipe(rec.root, recipe, payload, intent) };
  12928 |   } catch (err) {
  12929 |     attempt = { family: rec.family.id, intent, recipe, ok: false, error: err instanceof Error ? err.message : String(err) };
  12930 |   } finally {
  12931 |     await rec.root.dispose().catch(() => {});
  12932 |   }
  12933 |   try {
  12934 |     book.onAttempt?.(attempt);
  12935 |   } catch (err) {
  12936 |     // Lifecycle bookkeeping (a store write the OS refused — EPERM/EBUSY on a
  12937 |     // rename another session holds) must never change the action's outcome:
  12938 |     // a verified recipe stays verified, and an unverified one still falls
  12939 |     // back to the native primitive. The failure travels as a warning.
  12940 |     attempt = { ...attempt, warning: `recipe outcome not recorded: ${err instanceof Error ? err.message : String(err)}` };
  12941 |   }
  12942 |   return attempt;
  12943 | }
  12944 | 
  12945 | /** The words both runners report a verified recipe in. */
  12946 | function describeRecipeAttempt(attempt: RecipeAttempt): string {
  12947 |   const verb = attempt.intent === 'select-option' ? 'selected' : 'filled';
  12948 |   const base = `${verb} via recipe ${attempt.family}/${attempt.intent} (${attempt.recipe.id}); value verified on the component`;
  12949 |   return attempt.warning ? `${base} (warning: ${attempt.warning})` : base;
  12950 | }
  12951 | 
  12952 | /**
  12953 |  * The ladders. Each is the daemon's tool case verbatim: the recipe half
  12954 |  * first, the native primitive only when nothing was verified. The verified
  12955 |  * attempt is returned so the caller can say so; null means the native
  12956 |  * primitive did the work.
  12957 |  */
  12958 | async function fillWithRecipe(page: Page, target: Locator, value: string, book: RecipeBook): Promise<RecipeAttempt | null> {
  12959 |   const attempt = await applyRecipe(page, target, 'set-value', value, book);
  12960 |   if (attempt?.ok) return attempt;
  12961 |   await reactSafeFill(target, value);
  12962 |   return null;
  12963 | }
  12964 | 
  12965 | async function typeWithRecipe(
  12966 |   page: Page,
  12967 |   target: Locator,
  12968 |   text: string,
  12969 |   book: RecipeBook,
  12970 |   opts: { timeout?: number; delay?: number } = {},
  12971 | ): Promise<RecipeAttempt | null> {
  12972 |   const attempt = await applyRecipe(page, target, 'set-value', text, book);
  12973 |   if (attempt?.ok) return attempt;
  12974 |   await focusOrRefuse(target, opts.timeout);
  12975 |   await target.pressSequentially(text, { ...opts, timeout: opts.timeout ?? DEFAULT_ACTION_TIMEOUT_MS });
  12976 |   return null;
  12977 | }
  12978 | 
  12979 | /**
  12980 |  * Keys go to whatever holds focus, so a `type` whose target cannot take focus
  12981 |  * types into some OTHER field. fwsi1 03-create step 4 typed into select2's
  12982 |  * rendered <span> (not focusable): the recording's keys reached the
  12983 |  * dropdown's search box, which an unrecorded failed fill had opened; every
  12984 |  * replay's reached the asset name field, which still had focus, and appended
  12985 |  * "Bench Laptop Model" to it before the step's own check stopped it. So the
  12986 |  * target is focused and must then hold focus itself — or contain what does
  12987 |  * (a wrapper whose inner input takes it, across open shadow roots), or be
  12988 |  * inside the label of what does — before a key is sent. Otherwise the step
  12989 |  * fails with nothing typed.
  12990 |  */
  12991 | async function focusOrRefuse(target: Locator, timeout?: number): Promise<void> {
  12992 |   await target.focus({ timeout: timeout ?? DEFAULT_ACTION_TIMEOUT_MS });
> 12993 |   const holds = await target.evaluate(
        |                              ^ TimeoutError: locator.evaluate: Timeout 10000ms exceeded.
  12994 |     (el) => {
  12995 |       let active: Element | null = document.activeElement;
  12996 |       const label = el.closest('label')?.control ?? null;
  12997 |       while (active) {
  12998 |         if (active === el || el.contains(active) || active === label) return true;
  12999 |         active = active.shadowRoot?.activeElement ?? null;
  13000 |       }
  13001 |       return false;
  13002 |     },
  13003 |     undefined,
  13004 |     { timeout: timeout ?? DEFAULT_ACTION_TIMEOUT_MS },
  13005 |   );
  13006 |   if (!holds) {
  13007 |     throw actionFailure(
  13008 |       'not-dispatched',
  13009 |       'not-an-input',
  13010 |       'type: target cannot take keyboard focus — click it or type into the field it opens (nothing was typed)',
  13011 |     );
  13012 |   }
  13013 | }
  13014 | 
  13015 | /** Select: the verified attempt, or the options the native select chose. */
  13016 | async function selectWithRecipe(
  13017 |   page: Page,
  13018 |   target: Locator,
  13019 |   label: string,
  13020 |   book: RecipeBook,
  13021 |   fallbackValue?: string,
  13022 | ): Promise<{ attempt: RecipeAttempt; selected: null } | { attempt: null; selected: string[] }> {
  13023 |   const attempt = await applyRecipe(page, target, 'select-option', label, book);
  13024 |   if (attempt?.ok) return { attempt, selected: null };
  13025 |   return { attempt: null, selected: await reactSafeSelect(target, label, fallbackValue) };
  13026 | }
  13027 | 
  13028 | // Shared execution source: fingerprint.ts. Regenerate to update.
  13029 | /**
  13030 |  * Structural page fingerprint: a fixed-size hashed bag of normalised DOM paths
  13031 |  * (tags, roles, stable classes — no text, ids, or generated hashes). Two pages
  13032 |  * built from the same template land close under cosine similarity; pages that
  13033 |  * need a different procedure land far apart.
  13034 |  *
  13035 |  * Shared by both execution targets. The daemon's recorder captures it
  13036 |  * (src/agent/loop.ts, src/agent/tools.ts), replay measures the live page
  13037 |  * against it before a segment's soft url match (src/skills/replay.ts); a
  13038 |  * compiled `.flow.ts` carries the recorded vector in its FLOW constant and
  13039 |  * embeds this exact source (src/spec/runtime-source.ts) to take the same
  13040 |  * measurement. Self-contained: a Playwright type is the only import, and the
  13041 |  * page function below is serialised into the page, so nothing at module level
  13042 |  * is in scope there.
  13043 |  *
  13044 |  * Shape: always FINGERPRINT_DIMS numbers, L2-normalised, each rounded to three
  13045 |  * decimals at capture. `cosine` rounds its result to three decimals too, so a
  13046 |  * vector carried verbatim (as the IR does) yields the very number the daemon
  13047 |  * computes from the store's copy.
  13048 |  */
  13049 | const FINGERPRINT_DIMS = 512;
  13050 | 
  13051 | /** A page that has not answered in this long is navigating or hung: null, never a wait. */
  13052 | const FINGERPRINT_CAPTURE_TIMEOUT_MS = 2_000;
  13053 | 
  13054 | /** L2-normalised vector of FINGERPRINT_DIMS, or null if the page could not be read in time. */
  13055 | async function fingerprintPage(page: Page): Promise<number[] | null> {
  13056 |   let timer: ReturnType<typeof setTimeout> | undefined;
  13057 |   try {
  13058 |     const counts = await Promise.race([
  13059 |       page.evaluate(fingerprintPathsInPage, { maxNodes: 3_000, dims: FINGERPRINT_DIMS }),
  13060 |       new Promise<null>((resolve) => {
  13061 |         timer = setTimeout(() => resolve(null), FINGERPRINT_CAPTURE_TIMEOUT_MS);
  13062 |       }),
  13063 |     ]);
  13064 |     if (!counts) return null;
  13065 |     return normaliseFingerprint(counts);
  13066 |   } catch {
  13067 |     return null;
  13068 |   } finally {
  13069 |     clearTimeout(timer);
  13070 |   }
  13071 | }
  13072 | 
  13073 | /**
  13074 |  * Cosine similarity of two normalised vectors, rounded to three decimals; null
  13075 |  * when either is missing, empty, the lengths disagree, or either holds an
  13076 |  * entry that is not a finite number (nothing comparable was measured). The
  13077 |  * last rule matches the IR, which omits such a stored vector, so a hand-edited
  13078 |  * store makes both runners pass null rather than only the daemon measuring.
  13079 |  */
  13080 | function cosine(a: number[] | undefined, b: number[] | undefined): number | null {
  13081 |   if (!a || !b || a.length !== b.length || !a.length) return null;
  13082 |   let dot = 0;
  13083 |   for (let i = 0; i < a.length; i++) {
  13084 |     const x = a[i];
  13085 |     const y = b[i];
  13086 |     if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  13087 |     dot += x * y;
  13088 |   }
  13089 |   return Math.round(dot * 1000) / 1000;
  13090 | }
  13091 | 
  13092 | /** Raw bucket counts to the stored form: L2-normalised, three decimals. */
  13093 | function normaliseFingerprint(counts: number[]): number[] {
```