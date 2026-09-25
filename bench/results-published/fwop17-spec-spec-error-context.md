# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwop17.spec.ts >> fwop17
- Location: fwop17.spec.ts:9:1

# Error details

```
Error: 04-create s_9e1cdb/5: the recorded page change did not appear

04-create s_9e1cdb/5: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 04-create s_9e1cdb/5 the page did not show \"- row \\\"44 Work package leaf at level 0. fwop17-spec Bench Work Package {{*}} {{*}} - Normal\\\"\" as it did when recorded — the step ran but probably acted on the wrong element"

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
                      - generic [ref=e185]: "0"
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
                  - generic [ref=e220]:
                    - generic [ref=e222]: 
                    - text: "Add filter:"
                  - generic [ref=e223]: Add filter Open this filter with 'ALT' and arrow keys. To select an entry leave the focus for example by pressing enter. To leave without filter select the first (empty) entry.
                  - generic [ref=e225]:
                    - generic [ref=e227]:
                      - generic [ref=e228]: Please select
                      - combobox [ref=e230]
                    - status [ref=e232]
            - generic [ref=e233]:
              - generic [ref=e235]:
                - generic [ref=e237]:
                  - table "Table with rows of work package and columns of work package attributes.Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns." [ref=e239]:
                    - caption [ref=e249]:
                      - text: Table with rows of work package and columns of work package attributes.
                      - text: Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns.
                    - rowgroup [ref=e250]:
                      - row "ID Subject Type Status Assignee Priority" [ref=e251]:
                        - columnheader [ref=e252]
                        - columnheader "ID" [ref=e254]:
                          - generic [ref=e257]:
                            - link "ID" [ref=e258] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e260]: Open menu
                        - columnheader "Subject" [ref=e261]:
                          - generic [ref=e264]:
                            - generic [ref=e267] [cursor=pointer]: 
                            - link "Subject" [ref=e268] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e270]: Open menu
                        - columnheader "Type" [ref=e271]:
                          - generic [ref=e274]:
                            - link "Type" [ref=e275] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e277]: Open menu
                        - columnheader "Status" [ref=e278]:
                          - generic [ref=e281]:
                            - link "Status" [ref=e282] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e284]: Open menu
                        - columnheader "Assignee" [ref=e285]:
                          - generic [ref=e288]:
                            - link "Assignee" [ref=e289] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e291]: Open menu
                        - columnheader "Priority" [ref=e292]:
                          - generic [ref=e295]:
                            - link "Priority" [ref=e296] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e298]: Open menu
                        - columnheader [ref=e299]:
                          - button "Configure view" [ref=e302] [cursor=pointer]:
                            - generic [ref=e304]: 
                    - rowgroup [ref=e305]:
                      - 'row " id 38 Work package leaf at level 0. Subject Seed: triage inbox: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e306] [cursor=pointer]':
                        - cell "" [ref=e307]:
                          - generic [ref=e308]: 
                        - cell "id 38" [ref=e309]:
                          - generic "id 38" [ref=e311]:
                            - link "38" [ref=e312]:
                              - /url: /projects/bench-project/work_packages/38/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: triage inbox: Edit" [ref=e313]':
                          - generic [ref=e315]: Work package leaf at level 0.
                          - 'button "Subject Seed: triage inbox: Edit" [ref=e317]': "Seed: triage inbox"
                        - 'cell "Type Task: Edit" [ref=e318]':
                          - 'button "Type Task: Edit" [ref=e320]': Task
                        - 'cell "Status New: Edit" [ref=e321]':
                          - 'button "Status New: Edit" [ref=e323]': New
                        - 'cell "Assignee No value: Edit" [ref=e324]':
                          - 'button "Assignee No value: Edit" [ref=e326]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e327]':
                          - 'button "Priority Normal: Edit" [ref=e329]': Normal
                        - cell "Open details view Open context menu" [ref=e330]:
                          - generic [ref=e331]:
                            - link "Open details view" [ref=e332]:
                              - /url: /projects/bench-project/work_packages/details/38/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e333]: 
                            - link "Open context menu" [ref=e334]:
                              - /url: "#"
                              - generic [ref=e335]: 
                      - 'row " id 39 Work package leaf at level 0. Subject Seed: order missing parts: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e336] [cursor=pointer]':
                        - cell "" [ref=e337]:
                          - generic [ref=e338]: 
                        - cell "id 39" [ref=e339]:
                          - generic "id 39" [ref=e341]:
                            - link "39" [ref=e342]:
                              - /url: /projects/bench-project/work_packages/39/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: order missing parts: Edit" [ref=e343]':
                          - generic [ref=e345]: Work package leaf at level 0.
                          - 'button "Subject Seed: order missing parts: Edit" [ref=e347]': "Seed: order missing parts"
                        - 'cell "Type Task: Edit" [ref=e348]':
                          - 'button "Type Task: Edit" [ref=e350]': Task
                        - 'cell "Status New: Edit" [ref=e351]':
                          - 'button "Status New: Edit" [ref=e353]': New
                        - 'cell "Assignee No value: Edit" [ref=e354]':
                          - 'button "Assignee No value: Edit" [ref=e356]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e357]':
                          - 'button "Priority Normal: Edit" [ref=e359]': Normal
                        - cell "Open details view Open context menu" [ref=e360]:
                          - generic [ref=e361]:
                            - link "Open details view" [ref=e362]:
                              - /url: /projects/bench-project/work_packages/details/39/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e363]: 
                            - link "Open context menu" [ref=e364]:
                              - /url: "#"
                              - generic [ref=e365]: 
                      - 'row " id 40 Work package leaf at level 0. Subject Seed: ship repaired device: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e366] [cursor=pointer]':
                        - cell "" [ref=e367]:
                          - generic [ref=e368]: 
                        - cell "id 40" [ref=e369]:
                          - generic "id 40" [ref=e371]:
                            - link "40" [ref=e372]:
                              - /url: /projects/bench-project/work_packages/40/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: ship repaired device: Edit" [ref=e373]':
                          - generic [ref=e375]: Work package leaf at level 0.
                          - 'button "Subject Seed: ship repaired device: Edit" [ref=e377]': "Seed: ship repaired device"
                        - 'cell "Type Task: Edit" [ref=e378]':
                          - 'button "Type Task: Edit" [ref=e380]': Task
                        - 'cell "Status New: Edit" [ref=e381]':
                          - 'button "Status New: Edit" [ref=e383]': New
                        - 'cell "Assignee No value: Edit" [ref=e384]':
                          - 'button "Assignee No value: Edit" [ref=e386]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e387]':
                          - 'button "Priority Normal: Edit" [ref=e389]': Normal
                        - cell "Open details view Open context menu" [ref=e390]:
                          - generic [ref=e391]:
                            - link "Open details view" [ref=e392]:
                              - /url: /projects/bench-project/work_packages/details/40/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e393]: 
                            - link "Open context menu" [ref=e394]:
                              - /url: "#"
                              - generic [ref=e395]: 
                      - 'row " id 44 Work package leaf at level 0. Subject fwop17-spec Bench Work Package: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e396] [cursor=pointer]':
                        - cell "" [ref=e397]:
                          - generic [ref=e398]: 
                        - cell "id 44" [ref=e399]:
                          - generic "id 44" [ref=e401]:
                            - link "44" [ref=e402]:
                              - /url: /projects/bench-project/work_packages/44/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject fwop17-spec Bench Work Package: Edit" [ref=e403]':
                          - generic [ref=e405]: Work package leaf at level 0.
                          - 'button "Subject fwop17-spec Bench Work Package: Edit" [ref=e407]': fwop17-spec Bench Work Package
                        - 'cell "Type Task: Edit" [ref=e408]':
                          - 'button "Type Task: Edit" [ref=e410]': Task
                        - 'cell "Status New: Edit" [ref=e411]':
                          - 'button "Status New: Edit" [ref=e413]': New
                        - 'cell "Assignee No value: Edit" [ref=e414]':
                          - 'button "Assignee No value: Edit" [ref=e416]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e417]':
                          - 'button "Priority Normal: Edit" [ref=e419]': Normal
                        - cell "Open details view Open context menu" [ref=e420]:
                          - generic [ref=e421]:
                            - link "Open details view" [ref=e422]:
                              - /url: /projects/bench-project/work_packages/details/44/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e423]: 
                            - link "Open context menu" [ref=e424]:
                              - /url: "#"
                              - generic [ref=e425]: 
                    - rowgroup
                    - rowgroup [ref=e426]:
                      - row "Create new work package" [ref=e427]:
                        - cell "Create new work package" [ref=e428]:
                          - button "Create new work package" [ref=e429] [cursor=pointer]:
                            - img [ref=e430]
                            - generic [ref=e432]: Create new work package
                  - generic [ref=e433]: 
                - navigation "Pagination navigation" [ref=e437]:
                  - text: (1 - 4/4)
                  - generic [ref=e438]: You are on the only page.
              - generic [ref=e441]:
                - generic [ref=e444]:
                  - generic [ref=e445]:
                    - list [ref=e446]:
                      - listitem [ref=e447] [cursor=pointer]:
                        - tab "Overview" [selected] [ref=e448]
                      - listitem [ref=e449] [cursor=pointer]:
                        - tab "Activity" [ref=e450]
                      - listitem [ref=e451] [cursor=pointer]:
                        - tab "Files" [ref=e452]
                      - listitem [ref=e453] [cursor=pointer]:
                        - tab "Relations" [ref=e454]
                      - listitem [ref=e455] [cursor=pointer]:
                        - tab "Wikis" [ref=e456]
                      - listitem [ref=e457] [cursor=pointer]:
                        - tab "Meetings" [ref=e458]
                      - listitem [ref=e459] [cursor=pointer]:
                        - tab "Watchers (1)" [ref=e460]
                    - text: 
                    - button "" [ref=e461] [cursor=pointer]:
                      - generic [ref=e462]: 
                  - list [ref=e463]:
                    - listitem [ref=e464]:
                      - button "Show fullscreen view" [ref=e465] [cursor=pointer]:
                        - generic [ref=e467]: 
                    - listitem [ref=e468]:
                      - button "Close details view" [ref=e469] [cursor=pointer]:
                        - generic [ref=e471]: 
                - generic [ref=e472]:
                  - generic [ref=e473]: You are on the Overview tab for Task fwop17-spec Bench Work Package.
                  - generic [ref=e474]:
                    - generic [ref=e476]:
                      - list [ref=e479]:
                        - listitem [ref=e480]:
                          - button "Set parent" [ref=e482] [cursor=pointer]:
                            - generic [ref=e483]: Set parent
                            - generic [ref=e485]: 
                      - generic [ref=e487]:
                        - 'button "Type Task: Edit" [ref=e492]': Task
                        - 'button "Subject fwop17-spec Bench Work Package: Edit" [ref=e497]': fwop17-spec Bench Work Package
                    - generic [ref=e502]:
                      - generic [ref=e503]:
                        - button "Edit the status of the work package" [ref=e506] [cursor=pointer]:
                          - generic [ref=e507]: New
                          - generic [ref=e509]: 
                        - generic [ref=e510]:
                          - text: "#44: Created by"
                          - generic [ref=e511]: Bench Admin
                          - text: . Last updated on
                          - generic "09/25/2026 4:45 AM" [ref=e513]
                          - text: .
                      - 'button "Description Bench work package for run fwop17-spec: Edit" [ref=e519]':
                        - paragraph [ref=e521]: Bench work package for run fwop17-spec
                      - generic [ref=e522]:
                        - heading "People" [level=3] [ref=e525]
                        - generic [ref=e526]:
                          - generic [ref=e527]:
                            - button "Assignee" [ref=e530]
                            - 'button "Assignee No value: Edit" [ref=e536]': "-"
                          - generic [ref=e537]:
                            - button "Accountable" [ref=e540]
                            - 'button "Accountable No value: Edit" [ref=e546]': "-"
                      - generic [ref=e547]:
                        - heading "Estimates and progress" [level=3] [ref=e550]
                        - generic [ref=e551]:
                          - generic [ref=e552]:
                            - button "Work" [ref=e555]
                            - 'button "Work No value: Edit" [ref=e561]': "-"
                          - generic [ref=e562]:
                            - button "Remaining work" [ref=e565]
                            - 'button "Remaining work No value: Edit" [ref=e571]': "-"
                          - generic [ref=e572]:
                            - button "% Complete" [ref=e575]
                            - 'button "% Complete No value: Edit" [ref=e581]': "-"
                          - generic [ref=e582]:
                            - button "Spent time" [ref=e585]
                            - generic "Spent time 0h" [ref=e591]:
                              - link "0h" [ref=e592] [cursor=pointer]:
                                - /url: /projects/bench-project/cost_reports?fields[]=WorkPackageId&operators[WorkPackageId]=%3D_child_work_packages&values[WorkPackageId]=44&set_filter=1
                              - link "" [ref=e593] [cursor=pointer]:
                                - /url: ""
                          - generic [ref=e594]:
                            - button "Story Points" [ref=e597]
                            - 'button "Story Points No value: Edit" [ref=e603]': "-"
                      - generic [ref=e604]:
                        - heading "Details" [level=3] [ref=e607]
                        - generic [ref=e608]:
                          - generic [ref=e609]:
                            - button "Priority *" [ref=e612]
                            - 'button "Priority Normal: Edit" [ref=e618]': Normal
                          - generic [ref=e619]:
                            - button "Sprint" [ref=e622]
                            - 'button "Sprint No value: Edit" [ref=e628]': "-"
                          - generic [ref=e629]:
                            - button "Backlog bucket" [ref=e632]
                            - 'button "Backlog bucket No value: Edit" [ref=e638]': "-"
                          - generic [ref=e639]:
                            - button "Target versions" [ref=e642]
                            - 'button "Target versions No value: Edit" [ref=e648]': "-"
                          - generic [ref=e649]:
                            - button "Category" [ref=e652]
                            - 'button "Category No value: Edit" [ref=e658]': "-"
                          - generic [ref=e659]:
                            - button "Date" [ref=e662]
                            - 'button "Start date : Edit" [ref=e668]': no start date - no finish date
                      - generic [ref=e669]:
                        - heading "Other" [level=3] [ref=e672]
                        - generic [ref=e674]:
                          - button "Position" [ref=e677]
                          - generic "Position 4" [ref=e683]: "4"
                      - generic [ref=e684]:
                        - heading "Costs" [level=3] [ref=e687]
                        - generic [ref=e689]:
                          - button "Labor costs" [ref=e692]
                          - generic "Labor costs No value" [ref=e698]: "-"
                - generic [ref=e701]:
                  - button "Unwatch work package" [ref=e703] [cursor=pointer]:
                    - img [ref=e704]
                  - button "Share" [ref=e707] [cursor=pointer]:
                    - img [ref=e708]
                    - img [ref=e710]
                  - button "Set reminder" [ref=e713] [cursor=pointer]:
                    - img [ref=e714]
                  - button "More" [ref=e717] [cursor=pointer]:
                    - img [ref=e718]
                - generic [ref=e720]: 
```

# Test source

```ts
  13850 |  * page's snapshot lines (capturePageLines — role, name, state and the value
  13851 |  * after the colon, so a marker that is only an <input>'s VALUE on a form in
  13852 |  * edit mode is seen, where `getByText` never could: cloud run sp5odb died on
  13853 |  * exactly that), read by lineShows. Two halves, and both are load-bearing.
  13854 |  * The IDENTITY texts say the page is showing THIS record — the url and the
  13855 |  * page shape only ever say "a page of this template" — and take the bounded
  13856 |  * rule (`whole`: `fwgr25-n1` is not satisfied by `fwgr25-n10`); the GOAL
  13857 |  * texts say that record is already in the state this step exists to
  13858 |  * produce, and are a plain substring, exactly as goalSatisfied splits them.
  13859 |  * Identity alone would skip a step because the right record is open; a goal
  13860 |  * alone would skip it because some OTHER record happens to read "Cancelled".
  13861 |  *
  13862 |  * Both halves being on the PAGE is not enough, which is why the record-scope
  13863 |  * check follows (scopeCheckInPage, the daemon's own, run in the page): on a
  13864 |  * list, "Order A" and "Cancelled" are both present when it is order B that
  13865 |  * was cancelled. They have to hold of the same record.
  13866 |  *
  13867 |  * Conservative by construction: no goal, no identity, or a page that cannot
  13868 |  * be read — or a look that could not cover it (captureLines, dialect 2: a
  13869 |  * cap reached, a visible frame unread, a virtualised list) — is never
  13870 |  * satisfied. Being wrong the other way costs one re-run of a step that had
  13871 |  * already happened; being wrong THIS way skips work that never happened.
  13872 |  */
  13873 | async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {
  13874 |   if (!identity.length || !goal.length) return false;
  13875 |   const captured = await captureLines(page, 2);
  13876 |   if (!captured || !captured.complete) return false;
  13877 |   const lines = captured.lines;
  13878 |   for (const want of identity) {
  13879 |     if (!lineShows(lines, [want], { whole: true })) return false;
  13880 |   }
  13881 |   for (const want of goal) {
  13882 |     if (!lineShows(lines, [want])) return false;
  13883 |   }
  13884 |   try {
  13885 |     // The identity half goes in as regex SOURCE: scopeCheckInPage is
  13886 |     // serialised into the page, so it cannot call identityRe there.
  13887 |     return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });
  13888 |   } catch {
  13889 |     // A page that cannot be evaluated has proven nothing. Run the step.
  13890 |     return false;
  13891 |   }
  13892 | }
  13893 | 
  13894 | /**
  13895 |  * How long a recorded page change has to appear: Playwright's own expect
  13896 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  13897 |  */
  13898 | const EXPECT_WAIT_MS = 5_000;
  13899 | 
  13900 | /**
  13901 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  13902 |  *
  13903 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  13904 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  13905 |  * function, not a reading of it. The lines carrying this run's own values are
  13906 |  * HARD, the rest are a plain group; either is looked for first in the lines
  13907 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  13908 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  13909 |  * role, name, state, and the value after the colon. The AFTER capture is
  13910 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  13911 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  13912 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  13913 |  * as it settled, routed to the record and re-rendered the row, and the
  13914 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  13915 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  13916 |  * An earlier cut of this
  13917 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  13918 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  13919 |  * passed on any visible Project combobox whatever it showed. Polled for
  13920 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  13921 |  * once, so the artifact is the more patient of the two, never the looser.
  13922 |  *
  13923 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  13924 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  13925 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  13926 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  13927 |  * step body, which remembers it for the steps that were going to act inside.
  13928 |  */
  13929 | async function expectChanges(
  13930 |   page: Page,
  13931 |   recorded: string[],
  13932 |   p: Record<string, string>,
  13933 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  13934 |   linesBefore: string[] | null,
  13935 |   dialect: LineDialect = 1,
  13936 |   linesAfter: string[] | null = null,
  13937 | ): Promise<ChangeVerdict> {
  13938 |   let last: ChangeVerdict = { warnings: [] };
  13939 |   await expect
  13940 |     .poll(
  13941 |       async () => {
  13942 |         last = await expectedChangesVerdict(recorded, p, ctx, {
  13943 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  13944 |           live: () => captureLines(page, dialect),
  13945 |         });
  13946 |         return last.stop ?? null;
  13947 |       },
  13948 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  13949 |     )
> 13950 |     .toBeNull();
        |      ^ Error: 04-create s_9e1cdb/5: the recorded page change did not appear
  13951 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  13952 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  13953 |   return last;
  13954 | }
  13955 | 
  13956 | /**
  13957 |  * Is this step one that was going to act inside a dialog that did not open?
  13958 |  *
  13959 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, while a recorded dialog is
  13960 |  * absent (see ChangeVerdict.absentDialog): a step whose target cannot be
  13961 |  * found AND which names one of that dialog's own controls — namesDialogControl,
  13962 |  * the shared rule, proven against the dialog's recorded subtree — is skipped as
  13963 |  * belonging to it. A step that resolves its target, or misses without naming
  13964 |  * anything the dialog listed, is the procedure's own and runs (and fails) as
  13965 |  * such; the caller clears the remembered dialog either way. A minting step is
  13966 |  * never skipped, because skipping a mutation cannot be undone: the caller
  13967 |  * emits none of this for one. The one look at the candidates here is what
  13968 |  * replay's resolve window becomes on a page `settle` has already let go quiet.
  13969 |  */
  13970 | async function absentDialogSkip(
  13971 |   candidates: Locator[],
  13972 |   locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>,
  13973 |   dialog: { name: string; lines: string[] },
  13974 |   p: Record<string, string>,
  13975 |   where: string,
  13976 | ): Promise<boolean> {
  13977 |   const inside = namesDialogControl({ locators }, dialog.lines, p);
  13978 |   if (inside === null) return false;
  13979 |   for (const candidate of candidates) if ((await candidate.count().catch(() => 0)) > 0) return false;
  13980 |   console.log(`[sitelooper skip] ${where}: acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(dialog.name)}, which did not open — skipped`);
  13981 |   return true;
  13982 | }
  13983 | 
  13984 | /**
  13985 |  * Is this step a dismissal of a dialog that is not open — already in effect?
  13986 |  *
  13987 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, on a target that did not
  13988 |  * resolve in its window: a step recorded closing a dialog (and doing nothing
  13989 |  * else) whose dialog is not on the page is skipped — the shared
  13990 |  * dismissalAlreadyInEffect decides, over the same recorded removals and a
  13991 |  * look in the step's dialect. Replay asks after its resolve window, so this
  13992 |  * waits the same window for a VISIBLE target first (a modal library keeps a
  13993 |  * closed dialog, Close button and all, hidden in the DOM): a target that
  13994 |  * shows up is acted on by the pick below as usual, and a false return leaves
  13995 |  * that pick to report the miss exactly as it would have.
  13996 |  */
  13997 | async function dismissalSkip(
  13998 |   page: Page,
  13999 |   candidates: Locator[],
  14000 |   step: { locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>; expect: { removedContains: string[] } },
  14001 |   p: Record<string, string>,
  14002 |   where: string,
  14003 |   dialect: LineDialect = 1,
  14004 | ): Promise<boolean> {
  14005 |   for (let waited = 0; ; waited += RESOLVE_POLL_MS) {
  14006 |     for (const candidate of candidates) {
  14007 |       const n = await candidate.count().catch(() => 0);
  14008 |       for (let i = 0; i < Math.min(n, 5); i++) if (await candidate.nth(i).isVisible().catch(() => false)) return false;
  14009 |     }
  14010 |     if (waited >= RESOLVE_WAIT_MS) break;
  14011 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  14012 |   }
  14013 |   const done = dismissalAlreadyInEffect(step, await captureLines(page, dialect), p);
  14014 |   if (!done) return false;
  14015 |   console.log(`[sitelooper skip] ${where}: closes the dialog ${JSON.stringify(done.dialog)} with ${JSON.stringify(done.control)}, which is not open — already in effect`);
  14016 |   return true;
  14017 | }
  14018 | 
  14019 | /**
  14020 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  14021 |  * after its targets resolve: a click whose identifying rungs ALL missed
  14022 |  * (`hit` positional, or null when nothing resolved) is — the shared
  14023 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  14024 |  * every line it was recorded adding already shows (`lines`, the shared
  14025 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  14026 |  * stopped when a positional rung took it onto an element without the
  14027 |  * recorded accessible name. True means skipped; a stop throws.
  14028 |  */
  14029 | async function positionalClick(
  14030 |   page: Page,
  14031 |   hit: Resolution | null,
  14032 |   identifying: number[],
  14033 |   points: number[],
  14034 |   lines: string[],
  14035 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  14036 |   p: Record<string, string>,
  14037 |   where: string,
  14038 |   dialect: LineDialect = 1,
  14039 | ): Promise<boolean> {
  14040 |   const verdict = await positionalClickVerdict(
  14041 |     page,
  14042 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  14043 |     identifying,
  14044 |     lines,
  14045 |     want,
  14046 |     p,
  14047 |     dialect,
  14048 |   );
  14049 |   if (verdict && 'skip' in verdict) {
  14050 |     logWarning(`${where}: ${verdict.skip}`);
```