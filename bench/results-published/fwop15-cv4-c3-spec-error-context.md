# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwop15-cv4.spec.ts >> fwop15-cv4
- Location: fwop15-cv4.spec.ts:9:1

# Error details

```
Error: 02-create s_99ac70/18: the recorded page change did not appear

02-create s_99ac70/18: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 02-create s_99ac70/18 the page did not show \"- cell \\\"{{*}} package leaf at level 0. fwop15-cv4-c3 Bench Work Package\\\"\" as it did when recorded — the step ran but probably acted on the wrong element"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
        - button "Search" [ref=e18] [cursor=pointer]:
          - generic [ref=e20]: 
        - generic [ref=e23]:
          - generic [ref=e25]:
            - generic [ref=e26]: Search in OpenProject
            - combobox "Search in OpenProject" [ref=e28]
          - status [ref=e29]
      - generic [ref=e30]:
        - button "Add…" [ref=e32] [cursor=pointer]:
          - generic [ref=e33]:
            - generic:
              - img
            - img "Add…" [ref=e35]
        - link "Notifications" [ref=e38] [cursor=pointer]:
          - /url: /notifications
          - img
        - button "Help" [ref=e40] [cursor=pointer]:
          - img
        - button "User menu" [ref=e41] [cursor=pointer]:
          - img "User menu" [ref=e45]: BA
    - generic [ref=e46]:
      - navigation "Side Menu" [ref=e47]:
        - button "Collapse project menu" [expanded] [ref=e49] [cursor=pointer]:
          - img [ref=e51]
        - generic [ref=e53]:
          - generic [ref=e54]:
            - generic [ref=e55]:
              - button "Bench Project" [ref=e57] [cursor=pointer]:
                - generic [ref=e58]:
                  - generic [ref=e59]: Bench Project
                  - generic:
                    - img
              - button "Collapse project menu" [expanded] [ref=e61] [cursor=pointer]:
                - img
            - separator [ref=e62]
          - list [ref=e63]:
            - listitem [ref=e64]:
              - generic [ref=e65]:
                - link "Go back one menu level" [ref=e66] [cursor=pointer]:
                  - /url: "#"
                  - img [ref=e67]
                - link "Work packages" [ref=e69] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/projects/bench-project/work_packages
              - list [ref=e70]:
                - listitem [ref=e71]:
                  - generic [ref=e73]:
                    - generic [ref=e75]:
                      - generic [ref=e76]: Search
                      - generic [ref=e77]:
                        - generic:
                          - img
                        - textbox "Search" [ref=e78]:
                          - /placeholder: Search by name
                    - generic [ref=e80]:
                      - button "Default" [ref=e81] [cursor=pointer]:
                        - text: Default
                        - generic [ref=e82]: 
                      - list [ref=e83]:
                        - listitem [ref=e84]:
                          - link "All open" [ref=e85] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?work_package_default=true
                            - generic [ref=e86]: All open
                        - listitem [ref=e87]:
                          - link "Latest activity" [ref=e88] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=latest_activity&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22%2A%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e89]: Latest activity
                        - listitem [ref=e90]:
                          - link "Recently created" [ref=e91] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=recently_created&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22createdAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22createdAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e92]: Recently created
                        - listitem [ref=e93]:
                          - link "Overdue" [ref=e94] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=overdue&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22createdAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22type%22%2C%22subject%22%2C%22status%22%2C%22startDate%22%2C%22dueDate%22%2C%22duration%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22dueDate%22%2C%22o%22%3A%22%5Cu003ct-%22%2C%22v%22%3A%5B%221%22%5D%7D%2C%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e95]: Overdue
                        - listitem [ref=e96]:
                          - link "Summary" [ref=e97] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages/report?name=summary
                            - generic [ref=e98]: Summary
                        - listitem [ref=e99]:
                          - link "Created by me" [ref=e100] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=created_by_me&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%2Cid%3Aasc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22author%22%2C%22o%22%3A%22%3D%22%2C%22v%22%3A%5B%22me%22%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e101]: Created by me
                        - listitem [ref=e102]:
                          - link "Assigned to me" [ref=e103] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=assigned_to_me&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%2Cid%3Aasc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22author%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22assigneeOrGroup%22%2C%22o%22%3A%22%3D%22%2C%22v%22%3A%5B%22me%22%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e104]: Assigned to me
                        - listitem [ref=e105]:
                          - link "Shared with users Enterprise edition" [ref=e106] [cursor=pointer]:
                            - /url: /work_packages/share_upsell?name=shared_with_users
                            - generic [ref=e107]:
                              - text: Shared with users
                              - img "Enterprise edition" [ref=e108]
                        - listitem [ref=e110]:
                          - link "Shared with me Enterprise edition" [ref=e111] [cursor=pointer]:
                            - /url: /work_packages/share_upsell?name=shared_with_me
                            - generic [ref=e112]:
                              - text: Shared with me
                              - img "Enterprise edition" [ref=e113]
      - main [ref=e115]:
        - generic [ref=e116]:
          - heading "Content" [level=1] [ref=e117]
          - generic [ref=e126]:
            - navigation "Breadcrumb" [ref=e129]:
              - list [ref=e130]:
                - listitem [ref=e131]:
                  - link "Bench Project" [ref=e134] [cursor=pointer]:
                    - /url: /projects/bench-project
                - listitem [ref=e135]:
                  - link "Work packages" [ref=e138] [cursor=pointer]:
                    - /url: /projects/bench-project/work_packages
                - listitem [ref=e139]:
                  - 'link "Default: Work packages" [ref=e142] [cursor=pointer]':
                    - /url: "#"
            - generic [ref=e144]:
              - heading "Work packages" [level=2] [ref=e145]:
                - generic [ref=e147]:
                  - button "This view has unsaved changes. Click to save them." [ref=e148] [cursor=pointer]:
                    - generic [ref=e150]: 
                  - textbox "Click to edit title of this view. Press enter to save." [ref=e151]:
                    - /placeholder: Name of this view
                    - text: Work packages
              - list [ref=e152]:
                - listitem [ref=e153]:
                  - button "Create new work package" [ref=e156] [cursor=pointer]:
                    - img [ref=e157]
                    - generic [ref=e159]: Create
                    - img [ref=e160]
                - listitem [ref=e162]:
                  - generic [ref=e164]:
                    - button "Include projects 1" [ref=e165] [cursor=pointer]:
                      - text: Include projects
                      - generic [ref=e166]: "1"
                      - img [ref=e167]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e169]:
                  - generic [ref=e171]:
                    - button "Baseline" [ref=e172] [cursor=pointer]:
                      - img [ref=e173]
                      - generic [ref=e176]: Baseline
                      - img [ref=e177]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e179]:
                  - button "Deactivate Filter" [ref=e181] [cursor=pointer]:
                    - generic [ref=e183]: 
                    - generic [ref=e184]:
                      - text: Filter
                      - generic [ref=e185]: "2"
                    - img [ref=e186]
                - listitem [ref=e188]:
                  - button "Close details view" [ref=e190] [cursor=pointer]:
                    - generic [ref=e192]: 
                - listitem:
                  - generic:
                    - list
                - listitem [ref=e193]:
                  - button "Activate zen mode" [ref=e195] [cursor=pointer]:
                    - generic [ref=e197]: 
                - listitem [ref=e198]:
                  - button "More actions" [ref=e200] [cursor=pointer]:
                    - generic [ref=e202]: 
            - group "Selected filters" [ref=e208]:
              - generic [ref=e209]: Selected filters
              - button "Close form" [ref=e211] [cursor=pointer]:
                - img
              - list [ref=e212]:
                - listitem [ref=e213]:
                  - generic "Filter by text" [ref=e214]
                  - textbox "Filter by text" [ref=e217]:
                    - /placeholder: Subject, description, comments, ...
                - listitem [ref=e218]
                - listitem [ref=e219]:
                  - generic [ref=e220]: Status
                  - generic [ref=e221]:
                    - generic [ref=e222]: Status Open this filter with 'ALT' and arrow keys.
                    - combobox "Status Status Open this filter with 'ALT' and arrow keys." [ref=e223]:
                      - option "open"
                      - option "is (OR)"
                      - option "closed"
                      - option "is not"
                      - option "is not empty" [selected]
                  - button "Delete" [ref=e225] [cursor=pointer]:
                    - generic [ref=e227]: 
                - listitem [ref=e228]:
                  - generic [ref=e229]: Subject
                  - generic [ref=e230]:
                    - generic [ref=e231]: Subject Open this filter with 'ALT' and arrow keys.
                    - combobox "Subject Subject Open this filter with 'ALT' and arrow keys." [ref=e232]:
                      - option "contains" [selected]
                      - option "doesn't contain"
                  - generic [ref=e235]:
                    - textbox "Enter text" [ref=e236]: "Seed:"
                    - generic [ref=e237]: Enter text
                  - button "Delete" [ref=e239] [cursor=pointer]:
                    - generic [ref=e241]: 
                - listitem [ref=e242]:
                  - generic [ref=e243]:
                    - generic [ref=e245]: 
                    - text: "Add filter:"
                  - generic [ref=e246]: Add filter Open this filter with 'ALT' and arrow keys. To select an entry leave the focus for example by pressing enter. To leave without filter select the first (empty) entry.
                  - generic [ref=e248]:
                    - generic [ref=e250]:
                      - generic [ref=e251]: Please select
                      - combobox [ref=e253]
                    - status [ref=e255]
            - generic [ref=e256]:
              - generic [ref=e258]:
                - generic [ref=e260]:
                  - table "Table with rows of work package and columns of work package attributes.Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns." [ref=e262]:
                    - caption [ref=e272]:
                      - text: Table with rows of work package and columns of work package attributes.
                      - text: Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns.
                    - rowgroup [ref=e273]:
                      - row "ID Subject Type Status Assignee Priority" [ref=e274]:
                        - columnheader [ref=e275]
                        - columnheader "ID" [ref=e277]:
                          - generic [ref=e280]:
                            - link "ID" [ref=e281] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e283]: Open menu
                        - columnheader "Subject" [ref=e284]:
                          - generic [ref=e287]:
                            - generic [ref=e290] [cursor=pointer]: 
                            - link "Subject" [ref=e291] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e293]: Open menu
                        - columnheader "Type" [ref=e294]:
                          - generic [ref=e297]:
                            - link "Type" [ref=e298] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e300]: Open menu
                        - columnheader "Status" [ref=e301]:
                          - generic [ref=e304]:
                            - link "Status" [ref=e305] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e307]: Open menu
                        - columnheader "Assignee" [ref=e308]:
                          - generic [ref=e311]:
                            - link "Assignee" [ref=e312] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e314]: Open menu
                        - columnheader "Priority" [ref=e315]:
                          - generic [ref=e318]:
                            - link "Priority" [ref=e319] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e321]: Open menu
                        - columnheader [ref=e322]:
                          - button "Configure view" [ref=e325] [cursor=pointer]:
                            - generic [ref=e327]: 
                    - rowgroup [ref=e328]:
                      - 'row " id 38 Work package leaf at level 0. Subject Seed: triage inbox: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e329] [cursor=pointer]':
                        - cell "" [ref=e330]:
                          - generic [ref=e331]: 
                        - cell "id 38" [ref=e332]:
                          - generic "id 38" [ref=e334]:
                            - link "38" [ref=e335]:
                              - /url: /projects/bench-project/work_packages/38/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: triage inbox: Edit" [ref=e336]':
                          - generic [ref=e338]: Work package leaf at level 0.
                          - 'button "Subject Seed: triage inbox: Edit" [ref=e340]': "Seed: triage inbox"
                        - 'cell "Type Task: Edit" [ref=e341]':
                          - 'button "Type Task: Edit" [ref=e343]': Task
                        - 'cell "Status New: Edit" [ref=e344]':
                          - 'button "Status New: Edit" [ref=e346]': New
                        - 'cell "Assignee No value: Edit" [ref=e347]':
                          - 'button "Assignee No value: Edit" [ref=e349]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e350]':
                          - 'button "Priority Normal: Edit" [ref=e352]': Normal
                        - cell "Open details view Open context menu" [ref=e353]:
                          - generic [ref=e354]:
                            - link "Open details view" [ref=e355]:
                              - /url: /projects/bench-project/work_packages/details/38/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e356]: 
                            - link "Open context menu" [ref=e357]:
                              - /url: "#"
                              - generic [ref=e358]: 
                      - 'row " id 39 Work package leaf at level 0. Subject Seed: order missing parts: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e359] [cursor=pointer]':
                        - cell "" [ref=e360]:
                          - generic [ref=e361]: 
                        - cell "id 39" [ref=e362]:
                          - generic "id 39" [ref=e364]:
                            - link "39" [ref=e365]:
                              - /url: /projects/bench-project/work_packages/39/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: order missing parts: Edit" [ref=e366]':
                          - generic [ref=e368]: Work package leaf at level 0.
                          - 'button "Subject Seed: order missing parts: Edit" [ref=e370]': "Seed: order missing parts"
                        - 'cell "Type Task: Edit" [ref=e371]':
                          - 'button "Type Task: Edit" [ref=e373]': Task
                        - 'cell "Status New: Edit" [ref=e374]':
                          - 'button "Status New: Edit" [ref=e376]': New
                        - 'cell "Assignee No value: Edit" [ref=e377]':
                          - 'button "Assignee No value: Edit" [ref=e379]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e380]':
                          - 'button "Priority Normal: Edit" [ref=e382]': Normal
                        - cell "Open details view Open context menu" [ref=e383]:
                          - generic [ref=e384]:
                            - link "Open details view" [ref=e385]:
                              - /url: /projects/bench-project/work_packages/details/39/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e386]: 
                            - link "Open context menu" [ref=e387]:
                              - /url: "#"
                              - generic [ref=e388]: 
                      - 'row " id 40 Work package leaf at level 0. Subject Seed: ship repaired device: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e389] [cursor=pointer]':
                        - cell "" [ref=e390]:
                          - generic [ref=e391]: 
                        - cell "id 40" [ref=e392]:
                          - generic "id 40" [ref=e394]:
                            - link "40" [ref=e395]:
                              - /url: /projects/bench-project/work_packages/40/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: ship repaired device: Edit" [ref=e396]':
                          - generic [ref=e398]: Work package leaf at level 0.
                          - 'button "Subject Seed: ship repaired device: Edit" [ref=e400]': "Seed: ship repaired device"
                        - 'cell "Type Task: Edit" [ref=e401]':
                          - 'button "Type Task: Edit" [ref=e403]': Task
                        - 'cell "Status New: Edit" [ref=e404]':
                          - 'button "Status New: Edit" [ref=e406]': New
                        - 'cell "Assignee No value: Edit" [ref=e407]':
                          - 'button "Assignee No value: Edit" [ref=e409]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e410]':
                          - 'button "Priority Normal: Edit" [ref=e412]': Normal
                        - cell "Open details view Open context menu" [ref=e413]:
                          - generic [ref=e414]:
                            - link "Open details view" [ref=e415]:
                              - /url: /projects/bench-project/work_packages/details/40/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e416]: 
                            - link "Open context menu" [ref=e417]:
                              - /url: "#"
                              - generic [ref=e418]: 
                    - rowgroup
                    - rowgroup [ref=e419]:
                      - row "Create new work package" [ref=e420]:
                        - cell "Create new work package" [ref=e421]:
                          - button "Create new work package" [ref=e422] [cursor=pointer]:
                            - img [ref=e423]
                            - generic [ref=e425]: Create new work package
                  - generic [ref=e426]: 
                - navigation "Pagination navigation" [ref=e430]:
                  - text: (1 - 3/3)
                  - generic [ref=e431]: You are on the only page.
              - generic [ref=e434]:
                - generic [ref=e437]:
                  - generic [ref=e438]:
                    - list [ref=e439]:
                      - listitem [ref=e440] [cursor=pointer]:
                        - tab "Overview" [selected] [ref=e441]
                      - listitem [ref=e442] [cursor=pointer]:
                        - tab "Activity" [ref=e443]
                      - listitem [ref=e444] [cursor=pointer]:
                        - tab "Files" [ref=e445]
                      - listitem [ref=e446] [cursor=pointer]:
                        - tab "Relations" [ref=e447]
                      - listitem [ref=e448] [cursor=pointer]:
                        - tab "Wikis" [ref=e449]
                      - listitem [ref=e450] [cursor=pointer]:
                        - tab "Meetings" [ref=e451]
                      - listitem [ref=e452] [cursor=pointer]:
                        - tab "Watchers (1)" [ref=e453]
                    - text: 
                    - button "" [ref=e454] [cursor=pointer]:
                      - generic [ref=e455]: 
                  - list [ref=e456]:
                    - listitem [ref=e457]:
                      - button "Show fullscreen view" [ref=e458] [cursor=pointer]:
                        - generic [ref=e460]: 
                    - listitem [ref=e461]:
                      - button "Close details view" [ref=e462] [cursor=pointer]:
                        - generic [ref=e464]: 
                - generic [ref=e465]:
                  - generic [ref=e466]: You are on the Overview tab for Task fwop15-cv4-c3 Bench Work Package.
                  - generic [ref=e467]:
                    - generic [ref=e469]:
                      - list [ref=e472]:
                        - listitem [ref=e473]:
                          - button "Set parent" [ref=e475] [cursor=pointer]:
                            - generic [ref=e476]: Set parent
                            - generic [ref=e478]: 
                      - generic [ref=e480]:
                        - 'button "Type Task: Edit" [ref=e485]': Task
                        - 'button "Subject fwop15-cv4-c3 Bench Work Package: Edit" [ref=e490]': fwop15-cv4-c3 Bench Work Package
                    - generic [ref=e495]:
                      - generic [ref=e496]:
                        - button "Edit the status of the work package" [ref=e499] [cursor=pointer]:
                          - generic [ref=e500]: In progress
                          - generic [ref=e502]: 
                        - generic [ref=e503]:
                          - text: "#47: Created by"
                          - generic [ref=e504]: Bench Admin
                          - text: . Last updated on
                          - generic "09/26/2026 3:38 PM" [ref=e506]
                          - text: .
                      - 'button "Description Bench work package for run fwop15-cv4-c3: Edit" [ref=e512]':
                        - paragraph [ref=e514]: Bench work package for run fwop15-cv4-c3
                      - generic [ref=e515]:
                        - heading "People" [level=3] [ref=e518]
                        - generic [ref=e519]:
                          - generic [ref=e520]:
                            - button "Assignee" [ref=e523]
                            - 'button "Assignee Bench Assignee: Edit" [ref=e529]':
                              - generic [ref=e530]: BA
                              - generic "Bench Assignee" [ref=e531]
                          - generic [ref=e532]:
                            - button "Accountable" [ref=e535]
                            - 'button "Accountable No value: Edit" [ref=e541]': "-"
                      - generic [ref=e542]:
                        - heading "Estimates and progress" [level=3] [ref=e545]
                        - generic [ref=e546]:
                          - generic [ref=e547]:
                            - button "Work" [ref=e550]
                            - 'button "Work No value: Edit" [ref=e556]': "-"
                          - generic [ref=e557]:
                            - button "Remaining work" [ref=e560]
                            - 'button "Remaining work No value: Edit" [ref=e566]': "-"
                          - generic [ref=e567]:
                            - button "% Complete" [ref=e570]
                            - 'button "% Complete No value: Edit" [ref=e576]': "-"
                          - generic [ref=e577]:
                            - button "Spent time" [ref=e580]
                            - generic "Spent time 0h" [ref=e586]:
                              - link "0h" [ref=e587] [cursor=pointer]:
                                - /url: /projects/bench-project/cost_reports?fields[]=WorkPackageId&operators[WorkPackageId]=%3D_child_work_packages&values[WorkPackageId]=47&set_filter=1
                              - link "" [ref=e588] [cursor=pointer]:
                                - /url: ""
                          - generic [ref=e589]:
                            - button "Story Points" [ref=e592]
                            - 'button "Story Points No value: Edit" [ref=e598]': "-"
                      - generic [ref=e599]:
                        - heading "Details" [level=3] [ref=e602]
                        - generic [ref=e603]:
                          - generic [ref=e604]:
                            - button "Priority *" [ref=e607]
                            - 'button "Priority Normal: Edit" [ref=e613]': Normal
                          - generic [ref=e614]:
                            - button "Sprint" [ref=e617]
                            - 'button "Sprint No value: Edit" [ref=e623]': "-"
                          - generic [ref=e624]:
                            - button "Backlog bucket" [ref=e627]
                            - 'button "Backlog bucket No value: Edit" [ref=e633]': "-"
                          - generic [ref=e634]:
                            - button "Target versions" [ref=e637]
                            - 'button "Target versions No value: Edit" [ref=e643]': "-"
                          - generic [ref=e644]:
                            - button "Category" [ref=e647]
                            - 'button "Category No value: Edit" [ref=e653]': "-"
                          - generic [ref=e654]:
                            - button "Date" [ref=e657]
                            - 'button "Start date : Edit" [ref=e663]': no start date - 12/31/2026
                      - generic [ref=e664]:
                        - heading "Other" [level=3] [ref=e667]
                        - generic [ref=e669]:
                          - button "Position" [ref=e672]
                          - generic "Position 4" [ref=e678]: "4"
                      - generic [ref=e679]:
                        - heading "Costs" [level=3] [ref=e682]
                        - generic [ref=e684]:
                          - button "Labor costs" [ref=e687]
                          - generic "Labor costs No value" [ref=e693]: "-"
                - generic [ref=e696]:
                  - button "Unwatch work package" [ref=e698] [cursor=pointer]:
                    - img [ref=e699]
                  - button "Share" [ref=e702] [cursor=pointer]:
                    - img [ref=e703]
                    - img [ref=e705]
                  - button "Set reminder" [ref=e708] [cursor=pointer]:
                    - img [ref=e709]
                  - button "More" [ref=e712] [cursor=pointer]:
                    - img [ref=e713]
                - generic [ref=e715]: 
```

# Test source

```ts
  15833 |  * to recovery, never to a recorded literal."
  15834 |  *
  15835 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  15836 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  15837 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  15838 |  * that is honest for an observation and fatal for an argument. Empty, a
  15839 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  15840 |  * `known` slot loses the identity it exists to carry, so the blank does not
  15841 |  * merely misreport the run: it does the work to the wrong record.
  15842 |  *
  15843 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  15844 |  * verdict, the browser is at rest, and nothing of the consuming step has
  15845 |  * run when this throws.
  15846 |  *
  15847 |  * What it says about the LOG is checked against the log (skippedReads): an
  15848 |  * unpublished reference whose producing step never skipped a read has a
  15849 |  * different cause and a different fix, and pointing at a line that was
  15850 |  * never printed costs a diagnosis (grafana fwgr47).
  15851 |  */
  15852 | function need(outputs: Outputs, ref: string, by: string): string {
  15853 |   const value = outputs[ref as keyof Outputs];
  15854 |   if (value === undefined || value === '') {
  15855 |     const dot = ref.indexOf('.');
  15856 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  15857 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  15858 |     const trail = skips.length
  15859 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  15860 |         ` (${skips[0]}), which is where this run diverged.`
  15861 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  15862 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  15863 |         ` this value, rather than re-recording a read that may be working.`;
  15864 |     throw new Error(
  15865 |       `${by} needs {{${ref}}}, and this run never published it` +
  15866 |         (value === '' ? ' (it was published empty)' : '') +
  15867 |         `. ${trail}` +
  15868 |         ` Stopping here instead of passing an empty value into ${by}:` +
  15869 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  15870 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  15871 |         ` earlier steps did stands; nothing of ${by} has run.`,
  15872 |     );
  15873 |   }
  15874 |   return value;
  15875 | }
  15876 | 
  15877 | /**
  15878 |  * How long a recorded page change has to appear: Playwright's own expect
  15879 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  15880 |  */
  15881 | const EXPECT_WAIT_MS = 5_000;
  15882 | 
  15883 | /**
  15884 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  15885 |  *
  15886 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  15887 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  15888 |  * function, not a reading of it. The lines carrying this run's own values are
  15889 |  * HARD, the rest are a plain group; either is looked for first in the lines
  15890 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  15891 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  15892 |  * role, name, state, and the value after the colon. The AFTER capture is
  15893 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  15894 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  15895 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  15896 |  * as it settled, routed to the record and re-rendered the row, and the
  15897 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  15898 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  15899 |  * An earlier cut of this
  15900 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  15901 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  15902 |  * passed on any visible Project combobox whatever it showed. Polled for
  15903 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  15904 |  * once, so the artifact is the more patient of the two, never the looser.
  15905 |  *
  15906 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  15907 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  15908 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  15909 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  15910 |  * step body, which remembers it for the steps that were going to act inside.
  15911 |  */
  15912 | async function expectChanges(
  15913 |   page: Page,
  15914 |   recorded: string[],
  15915 |   p: Record<string, string>,
  15916 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  15917 |   linesBefore: string[] | null,
  15918 |   dialect: LineDialect = 1,
  15919 |   linesAfter: string[] | null = null,
  15920 | ): Promise<ChangeVerdict> {
  15921 |   let last: ChangeVerdict = { warnings: [] };
  15922 |   await expect
  15923 |     .poll(
  15924 |       async () => {
  15925 |         last = await expectedChangesVerdict(recorded, p, ctx, {
  15926 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  15927 |           live: (look) => captureLines(page, dialect, look),
  15928 |         });
  15929 |         return last.stop ?? null;
  15930 |       },
  15931 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  15932 |     )
> 15933 |     .toBeNull();
        |      ^ Error: 02-create s_99ac70/18: the recorded page change did not appear
  15934 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  15935 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  15936 |   return last;
  15937 | }
  15938 | 
  15939 | /**
  15940 |  * Is this step one that was going to act inside a dialog that did not open?
  15941 |  *
  15942 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, while a recorded dialog is
  15943 |  * absent (see ChangeVerdict.absentDialog): a step whose target cannot be
  15944 |  * found AND which names one of that dialog's own controls — namesDialogControl,
  15945 |  * the shared rule, proven against the dialog's recorded subtree — is skipped as
  15946 |  * belonging to it. A step that resolves its target, or misses without naming
  15947 |  * anything the dialog listed, is the procedure's own and runs (and fails) as
  15948 |  * such; the caller clears the remembered dialog either way. A minting step is
  15949 |  * never skipped, because skipping a mutation cannot be undone: the caller
  15950 |  * emits none of this for one. The one look at the candidates here is what
  15951 |  * replay's resolve window becomes on a page `settle` has already let go quiet.
  15952 |  */
  15953 | async function absentDialogSkip(
  15954 |   candidates: Locator[],
  15955 |   locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>,
  15956 |   dialog: { name: string; lines: string[] },
  15957 |   p: Record<string, string>,
  15958 |   where: string,
  15959 | ): Promise<boolean> {
  15960 |   const inside = namesDialogControl({ locators }, dialog.lines, p);
  15961 |   if (inside === null) return false;
  15962 |   for (const candidate of candidates) if ((await candidate.count().catch(() => 0)) > 0) return false;
  15963 |   console.log(`[sitelooper skip] ${where}: acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(dialog.name)}, which did not open — skipped`);
  15964 |   return true;
  15965 | }
  15966 | 
  15967 | /**
  15968 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  15969 |  * after its targets resolve: a click whose identifying rungs ALL missed
  15970 |  * (`hit` positional, or null when nothing resolved) is — the shared
  15971 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  15972 |  * every line it was recorded adding already shows (`lines`, the shared
  15973 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  15974 |  * stopped when a positional rung took it onto an element without the
  15975 |  * recorded accessible name. True means skipped; a stop throws.
  15976 |  */
  15977 | async function positionalClick(
  15978 |   page: Page,
  15979 |   hit: Resolution | null,
  15980 |   identifying: number[],
  15981 |   points: number[],
  15982 |   lines: string[],
  15983 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  15984 |   p: Record<string, string>,
  15985 |   where: string,
  15986 |   dialect: LineDialect = 1,
  15987 | ): Promise<boolean> {
  15988 |   const verdict = await positionalClickVerdict(
  15989 |     page,
  15990 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  15991 |     identifying,
  15992 |     lines,
  15993 |     want,
  15994 |     p,
  15995 |     dialect,
  15996 |   );
  15997 |   if (verdict && 'skip' in verdict) {
  15998 |     logWarning(`${where}: ${verdict.skip}`);
  15999 |     return true;
  16000 |   }
  16001 |   if (verdict && 'stop' in verdict) throw new Error(`${where}: ${verdict.stop}`);
  16002 |   return false;
  16003 | }
  16004 | 
  16005 | function validateInputs(vars: Vars): void {
  16006 |   const missing: string[] = [];
  16007 |   if (typeof vars['runid'] !== 'string' || !vars['runid'].trim()) missing.push('RUNID');
  16008 |   for (const name of requiredEnvNames) {
  16009 |     if (!process.env[name]?.trim()) missing.push(name);
  16010 |   }
  16011 |   if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${[...new Set(missing)].join(', ')}`);
  16012 | }
  16013 | 
  16014 | export const steps = {
  16015 |   /** Open http://127.0.0.1:8090/ and sign in with username admin and password {{env:APP_PASSWORD}} (type the password text exactly as given, it will be filled in automatically). Then navigate to the projec… */
  16016 |   async '01-open'(page: Page, p: { v1: string; v2: string; v3: string; v4: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {
  16017 |     const typedCommitted = new Set<string>();
  16018 | 
  16019 |     // What this step types, selects or names, across its segments (see echoRead).
  16020 |     const echoLedger = new Set<string>();
  16021 | 
  16022 |     // The urls this step loads, for its report values (a given url it loaded was observed).
  16023 |     const reportTrail = urlTrail(page);
  16024 | 
  16025 |     // s_2658f7: Open {{v1}} and sign in with username {{v2}} and password {{v3}} (type the password text exactly as given, it will be filled in automatically). Then navigate to the project named 'Bench Project' and l…
  16026 |     // recorded on a page matching http://127.0.0.1:8090/login
  16027 |     // What this segment filled, which must still stand when the action that submits it goes (see restoreStandingFills).
  16028 |     const filled1 = standingFills();
  16029 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  16030 |     const volatile1: UrlSegDiff[] = [];
  16031 | 
  16032 |     // @step 01-open s_2658f7/1
  16033 |     let urlBefore1 = '';
```