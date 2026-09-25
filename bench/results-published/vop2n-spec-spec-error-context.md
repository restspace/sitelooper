# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vop2n.spec.ts >> vop2n
- Location: vop2n.spec.ts:9:1

# Error details

```
Error: after 04-open s_8a1366/1 expected url http://127.0.0.1:8090/projects/bench-project/work_packages/details/44/overview but browser is at http://127.0.0.1:8090/projects/bench-project/work_packages/details/38/overview
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
                  - 'link "Default: All open" [ref=e142] [cursor=pointer]':
                    - /url: "#"
            - generic [ref=e144]:
              - heading "All open" [level=2] [ref=e145]:
                - textbox "Click to edit title of this view. Press enter to save." [ref=e148]:
                  - /placeholder: Name of this view
                  - text: All open
              - list [ref=e149]:
                - listitem [ref=e150]:
                  - button "Create new work package" [ref=e153] [cursor=pointer]:
                    - img [ref=e154]
                    - generic [ref=e156]: Create
                    - img [ref=e157]
                - listitem [ref=e159]:
                  - generic [ref=e161]:
                    - button "Include projects 1" [ref=e162] [cursor=pointer]:
                      - text: Include projects
                      - generic [ref=e163]: "1"
                      - img [ref=e164]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e166]:
                  - generic [ref=e168]:
                    - button "Baseline" [ref=e169] [cursor=pointer]:
                      - img [ref=e170]
                      - generic [ref=e173]: Baseline
                      - img [ref=e174]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e176]:
                  - button "Activate Filter" [ref=e178] [cursor=pointer]:
                    - generic [ref=e180]: 
                    - generic [ref=e181]:
                      - text: Filter
                      - generic [ref=e182]: "1"
                    - img [ref=e183]
                - listitem [ref=e185]:
                  - button "Close details view" [ref=e187] [cursor=pointer]:
                    - generic [ref=e189]: 
                - listitem:
                  - generic:
                    - list
                - listitem [ref=e190]:
                  - button "Activate zen mode" [ref=e192] [cursor=pointer]:
                    - generic [ref=e194]: 
                - listitem [ref=e195]:
                  - button "More actions" [ref=e197] [cursor=pointer]:
                    - generic [ref=e199]: 
            - generic [ref=e200]:
              - generic [ref=e202]:
                - generic [ref=e204]:
                  - table "Table with rows of work package and columns of work package attributes.Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns." [ref=e206]:
                    - caption [ref=e216]:
                      - text: Table with rows of work package and columns of work package attributes.
                      - text: Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns.
                    - rowgroup [ref=e217]:
                      - row "ID Subject Type Status Assignee Priority" [ref=e218]:
                        - columnheader [ref=e219]
                        - columnheader "ID" [ref=e221]:
                          - generic [ref=e224]:
                            - link "ID" [ref=e225] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e227]: Open menu
                        - columnheader "Subject" [ref=e228]:
                          - generic [ref=e231]:
                            - generic [ref=e234] [cursor=pointer]: 
                            - link "Subject" [ref=e235] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e237]: Open menu
                        - columnheader "Type" [ref=e238]:
                          - generic [ref=e241]:
                            - link "Type" [ref=e242] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e244]: Open menu
                        - columnheader "Status" [ref=e245]:
                          - generic [ref=e248]:
                            - link "Status" [ref=e249] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e251]: Open menu
                        - columnheader "Assignee" [ref=e252]:
                          - generic [ref=e255]:
                            - link "Assignee" [ref=e256] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e258]: Open menu
                        - columnheader "Priority" [ref=e259]:
                          - generic [ref=e262]:
                            - link "Priority" [ref=e263] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e265]: Open menu
                        - columnheader [ref=e266]:
                          - button "Configure view" [ref=e269] [cursor=pointer]:
                            - generic [ref=e271]: 
                    - rowgroup [ref=e272]:
                      - 'row " id 38 Work package leaf at level 0. Subject Seed: triage inbox: Edit Type Task: Edit Status New: Edit Priority Normal: Edit Open details view Open context menu" [ref=e273] [cursor=pointer]':
                        - cell "" [ref=e274]:
                          - generic [ref=e275]: 
                        - cell "id 38" [ref=e276]:
                          - generic "id 38" [ref=e278]:
                            - link "38" [ref=e279]:
                              - /url: /projects/bench-project/work_packages/38/activity
                        - 'cell "Work package leaf at level 0. Subject Seed: triage inbox: Edit" [ref=e280]':
                          - generic [ref=e282]: Work package leaf at level 0.
                          - 'button "Subject Seed: triage inbox: Edit" [ref=e284]': "Seed: triage inbox"
                        - 'cell "Type Task: Edit" [ref=e285]':
                          - 'button "Type Task: Edit" [ref=e287]': Task
                        - 'cell "Status New: Edit" [ref=e288]':
                          - 'button "Status New: Edit" [ref=e290]': New
                        - cell [ref=e291]:
                          - form [ref=e295]:
                            - generic [ref=e296]: Assignee
                            - generic [ref=e300]:
                              - generic [ref=e301]:
                                - generic [ref=e302]:
                                  - generic [ref=e303]: Bench Assignee
                                  - combobox "Search" [expanded] [active] [ref=e305]
                                - button "Clear all" [ref=e306]:
                                  - generic: ×
                              - status [ref=e308]
                        - 'cell "Priority Normal: Edit" [ref=e309]':
                          - 'button "Priority Normal: Edit" [ref=e311]': Normal
                        - cell "Open details view Open context menu" [ref=e312]:
                          - generic [ref=e313]:
                            - link "Open details view" [ref=e314]:
                              - /url: /projects/bench-project/work_packages/details/38/overview
                              - generic [ref=e315]: 
                            - link "Open context menu" [ref=e316]:
                              - /url: "#"
                              - generic [ref=e317]: 
                      - 'row " id 39 Work package leaf at level 0. Subject Seed: order missing parts: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e318] [cursor=pointer]':
                        - cell "" [ref=e319]:
                          - generic [ref=e320]: 
                        - cell "id 39" [ref=e321]:
                          - generic "id 39" [ref=e323]:
                            - link "39" [ref=e324]:
                              - /url: /projects/bench-project/work_packages/39/activity
                        - 'cell "Work package leaf at level 0. Subject Seed: order missing parts: Edit" [ref=e325]':
                          - generic [ref=e327]: Work package leaf at level 0.
                          - 'button "Subject Seed: order missing parts: Edit" [ref=e329]': "Seed: order missing parts"
                        - 'cell "Type Task: Edit" [ref=e330]':
                          - 'button "Type Task: Edit" [ref=e332]': Task
                        - 'cell "Status New: Edit" [ref=e333]':
                          - 'button "Status New: Edit" [ref=e335]': New
                        - 'cell "Assignee No value: Edit" [ref=e336]':
                          - 'button "Assignee No value: Edit" [ref=e338]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e339]':
                          - 'button "Priority Normal: Edit" [ref=e341]': Normal
                        - cell "Open details view Open context menu" [ref=e342]:
                          - generic [ref=e343]:
                            - link "Open details view" [ref=e344]:
                              - /url: /projects/bench-project/work_packages/details/39/overview
                              - generic [ref=e345]: 
                            - link "Open context menu" [ref=e346]:
                              - /url: "#"
                              - generic [ref=e347]: 
                      - 'row " id 40 Work package leaf at level 0. Subject Seed: ship repaired device: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e348] [cursor=pointer]':
                        - cell "" [ref=e349]:
                          - generic [ref=e350]: 
                        - cell "id 40" [ref=e351]:
                          - generic "id 40" [ref=e353]:
                            - link "40" [ref=e354]:
                              - /url: /projects/bench-project/work_packages/40/activity
                        - 'cell "Work package leaf at level 0. Subject Seed: ship repaired device: Edit" [ref=e355]':
                          - generic [ref=e357]: Work package leaf at level 0.
                          - 'button "Subject Seed: ship repaired device: Edit" [ref=e359]': "Seed: ship repaired device"
                        - 'cell "Type Task: Edit" [ref=e360]':
                          - 'button "Type Task: Edit" [ref=e362]': Task
                        - 'cell "Status New: Edit" [ref=e363]':
                          - 'button "Status New: Edit" [ref=e365]': New
                        - 'cell "Assignee No value: Edit" [ref=e366]':
                          - 'button "Assignee No value: Edit" [ref=e368]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e369]':
                          - 'button "Priority Normal: Edit" [ref=e371]': Normal
                        - cell "Open details view Open context menu" [ref=e372]:
                          - generic [ref=e373]:
                            - link "Open details view" [ref=e374]:
                              - /url: /projects/bench-project/work_packages/details/40/overview
                              - generic [ref=e375]: 
                            - link "Open context menu" [ref=e376]:
                              - /url: "#"
                              - generic [ref=e377]: 
                      - 'row " id 44 Work package leaf at level 0. Subject vop2n-spec Bench Work Package: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e378] [cursor=pointer]':
                        - cell "" [ref=e379]:
                          - generic [ref=e380]: 
                        - cell "id 44" [ref=e381]:
                          - generic "id 44" [ref=e383]:
                            - link "44" [ref=e384]:
                              - /url: /projects/bench-project/work_packages/44/activity
                        - 'cell "Work package leaf at level 0. Subject vop2n-spec Bench Work Package: Edit" [ref=e385]':
                          - generic [ref=e387]: Work package leaf at level 0.
                          - 'button "Subject vop2n-spec Bench Work Package: Edit" [ref=e389]': vop2n-spec Bench Work Package
                        - 'cell "Type Task: Edit" [ref=e390]':
                          - 'button "Type Task: Edit" [ref=e392]': Task
                        - 'cell "Status New: Edit" [ref=e393]':
                          - 'button "Status New: Edit" [ref=e395]': New
                        - 'cell "Assignee No value: Edit" [ref=e396]':
                          - 'button "Assignee No value: Edit" [ref=e398]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e399]':
                          - 'button "Priority Normal: Edit" [ref=e401]': Normal
                        - cell "Open details view Open context menu" [ref=e402]:
                          - generic [ref=e403]:
                            - link "Open details view" [ref=e404]:
                              - /url: /projects/bench-project/work_packages/details/44/overview
                              - generic [ref=e405]: 
                            - link "Open context menu" [ref=e406]:
                              - /url: "#"
                              - generic [ref=e407]: 
                    - rowgroup
                    - rowgroup [ref=e408]:
                      - row "Create new work package" [ref=e409]:
                        - cell "Create new work package" [ref=e410]:
                          - button "Create new work package" [ref=e411] [cursor=pointer]:
                            - img [ref=e412]
                            - generic [ref=e414]: Create new work package
                  - generic [ref=e415]: 
                - navigation "Pagination navigation" [ref=e419]:
                  - text: (1 - 4/4)
                  - generic [ref=e420]: You are on the only page.
              - generic [ref=e423]:
                - generic [ref=e426]:
                  - generic [ref=e427]:
                    - list [ref=e428]:
                      - listitem [ref=e429] [cursor=pointer]:
                        - tab "Overview" [selected] [ref=e430]
                      - listitem [ref=e431] [cursor=pointer]:
                        - tab "Activity" [ref=e432]
                      - listitem [ref=e433] [cursor=pointer]:
                        - tab "Files" [ref=e434]
                      - listitem [ref=e435] [cursor=pointer]:
                        - tab "Relations" [ref=e436]
                      - listitem [ref=e437] [cursor=pointer]:
                        - tab "Wikis" [ref=e438]
                      - listitem [ref=e439] [cursor=pointer]:
                        - tab "Meetings" [ref=e440]
                      - listitem [ref=e441] [cursor=pointer]:
                        - tab "Watchers (1)" [ref=e442]
                    - text: 
                    - button "" [ref=e443] [cursor=pointer]:
                      - generic [ref=e444]: 
                  - list [ref=e445]:
                    - listitem [ref=e446]:
                      - button "Show fullscreen view" [ref=e447] [cursor=pointer]:
                        - generic [ref=e449]: 
                    - listitem [ref=e450]:
                      - button "Close details view" [ref=e451] [cursor=pointer]:
                        - generic [ref=e453]: 
                - generic [ref=e454]:
                  - generic [ref=e455]: "You are on the Overview tab for Task Seed: triage inbox."
                  - generic [ref=e456]:
                    - generic [ref=e458]:
                      - list [ref=e461]:
                        - listitem [ref=e462]:
                          - button "Set parent" [ref=e464] [cursor=pointer]:
                            - generic [ref=e465]: Set parent
                            - generic [ref=e467]: 
                      - generic [ref=e469]:
                        - 'button "Type Task: Edit" [ref=e474]': Task
                        - 'button "Subject Seed: triage inbox: Edit" [ref=e479]': "Seed: triage inbox"
                    - generic [ref=e484]:
                      - generic [ref=e485]:
                        - button "Edit the status of the work package" [ref=e488] [cursor=pointer]:
                          - generic [ref=e489]: New
                          - generic [ref=e491]: 
                        - generic [ref=e492]:
                          - text: "#38: Created by"
                          - generic [ref=e493]: Bench Admin
                          - text: . Last updated on
                          - generic "09/25/2026 4:55 AM" [ref=e495]
                          - text: .
                      - 'button "Description No value: Edit" [ref=e501]':
                        - generic [ref=e502]: "Description: Click to edit..."
                      - generic [ref=e503]:
                        - heading "People" [level=3] [ref=e506]
                        - generic [ref=e507]:
                          - generic [ref=e508]:
                            - button "Assignee" [ref=e511]
                            - 'button "Assignee Bench Assignee: Edit" [ref=e517]':
                              - generic [ref=e518]: BA
                              - generic "Bench Assignee" [ref=e519]
                          - generic [ref=e520]:
                            - button "Accountable" [ref=e523]
                            - 'button "Accountable No value: Edit" [ref=e529]': "-"
                      - generic [ref=e530]:
                        - heading "Estimates and progress" [level=3] [ref=e533]
                        - generic [ref=e534]:
                          - generic [ref=e535]:
                            - button "Work" [ref=e538]
                            - 'button "Work No value: Edit" [ref=e544]': "-"
                          - generic [ref=e545]:
                            - button "Remaining work" [ref=e548]
                            - 'button "Remaining work No value: Edit" [ref=e554]': "-"
                          - generic [ref=e555]:
                            - button "% Complete" [ref=e558]
                            - 'button "% Complete No value: Edit" [ref=e564]': "-"
                          - generic [ref=e565]:
                            - button "Spent time" [ref=e568]
                            - generic "Spent time 0h" [ref=e574]:
                              - link "0h" [ref=e575] [cursor=pointer]:
                                - /url: /projects/bench-project/cost_reports?fields[]=WorkPackageId&operators[WorkPackageId]=%3D_child_work_packages&values[WorkPackageId]=38&set_filter=1
                              - link "" [ref=e576] [cursor=pointer]:
                                - /url: ""
                          - generic [ref=e577]:
                            - button "Story Points" [ref=e580]
                            - 'button "Story Points No value: Edit" [ref=e586]': "-"
                      - generic [ref=e587]:
                        - heading "Details" [level=3] [ref=e590]
                        - generic [ref=e591]:
                          - generic [ref=e592]:
                            - button "Priority *" [ref=e595]
                            - 'button "Priority Normal: Edit" [ref=e601]': Normal
                          - generic [ref=e602]:
                            - button "Sprint" [ref=e605]
                            - 'button "Sprint No value: Edit" [ref=e611]': "-"
                          - generic [ref=e612]:
                            - button "Backlog bucket" [ref=e615]
                            - 'button "Backlog bucket No value: Edit" [ref=e621]': "-"
                          - generic [ref=e622]:
                            - button "Target versions" [ref=e625]
                            - 'button "Target versions No value: Edit" [ref=e631]': "-"
                          - generic [ref=e632]:
                            - button "Category" [ref=e635]
                            - 'button "Category No value: Edit" [ref=e641]': "-"
                          - generic [ref=e642]:
                            - button "Date" [ref=e645]
                            - 'button "Start date : Edit" [ref=e651]': no start date - no finish date
                      - generic [ref=e652]:
                        - heading "Other" [level=3] [ref=e655]
                        - generic [ref=e657]:
                          - button "Position" [ref=e660]
                          - generic "Position 1" [ref=e666]: "1"
                      - generic [ref=e667]:
                        - heading "Costs" [level=3] [ref=e670]
                        - generic [ref=e672]:
                          - button "Labor costs" [ref=e675]
                          - generic "Labor costs No value" [ref=e681]: "-"
                - generic [ref=e684]:
                  - button "Unwatch work package" [ref=e686] [cursor=pointer]:
                    - img [ref=e687]
                  - button "Share" [ref=e690] [cursor=pointer]:
                    - img [ref=e691]
                    - img [ref=e693]
                  - button "Set reminder" [ref=e696] [cursor=pointer]:
                    - img [ref=e697]
                  - button "More" [ref=e700] [cursor=pointer]:
                    - img [ref=e701]
                - generic [ref=e703]: 
  - generic [ref=e704]:
    - listbox "Options List" [ref=e705]:
      - option "Bench Assignee Bench Assignee bench-assignee@example.com" [selected] [ref=e708] [cursor=pointer]:
        - img "Bench Assignee" [ref=e710]: BA
        - text: Bench Assignee bench-assignee@example.com
    - button "Invite" [ref=e713] [cursor=pointer]:
      - generic [ref=e714]:
        - generic [ref=e716]: 
        - text: Invite
```

# Test source

```ts
  11760 |   // Record the page's traffic from the first settle on, as the daemon records
  11761 |   // it from the moment its session adopts a page: an action begun on it later
  11762 |   // (beginAction, the shared src/execution/action.ts) has a baseline to read.
  11763 |   pageTraffic(page);
  11764 |   await settleDom(page);
  11765 | }
  11766 | 
  11767 | const ACTION_DEADLINE_MS = 25000;
  11768 | 
  11769 | /**
  11770 |  * A state-changing action that threw, rethrown with what its error proves
  11771 |  * about it (the shared outcomeOfError): `[outcome: not dispatched]` when
  11772 |  * nothing went out, `[outcome: unknown]` otherwise — the words replay puts
  11773 |  * after its own `click failed: …`.
  11774 |  */
  11775 | function actionFailed(err: unknown): never {
  11776 |   if (err instanceof Error && !err.message.includes('[outcome: ')) err.message += ` ${outcomeLabel(outcomeOfError(err))}`;
  11777 |   throw err;
  11778 | }
  11779 | 
  11780 | const URL_WAIT_MS = 5000;
  11781 | 
  11782 | /**
  11783 |  * tools.ts's `goto`: the load event, within 30s — and it has to be said out
  11784 |  * loud, because under `@playwright/test` `navigationTimeout` defaults to 0.
  11785 |  * The familiar 30s default belongs to playwright-core, NOT to the test
  11786 |  * runner, so a bare `page.goto(url)` in a spec file is unbounded IN FACT:
  11787 |  * an app that never finishes loading hangs the test until the runner (or,
  11788 |  * under a harness, a kill signal) stops it, with nothing logged about where
  11789 |  * it was. Every goto this file emits passes this, so the artifact fails the
  11790 |  * same way, at the same moment, as the daemon replaying the same step.
  11791 |  */
  11792 | const GOTO_TIMEOUT_MS = 30_000;
  11793 | 
  11794 | /**
  11795 |  * A soft finding, in the one grep-able shape replay reports its own warnings in.
  11796 |  *
  11797 |  * stdout, not stderr, like every `[sitelooper …]` line this file logs: the
  11798 |  * list reporter forwards a worker's stdout live and batches its stderr to the
  11799 |  * END of the run, so a run that is killed (a harness watchdog, a CI timeout)
  11800 |  * loses everything written to stderr. On stdout these interleave with the
  11801 |  * `[sitelooper step]` lines and survive the kill, which is the only record of
  11802 |  * where the run had got to.
  11803 |  */
  11804 | function logWarning(line: string): void {
  11805 |   console.log(`[sitelooper warn] ${line}`);
  11806 | }
  11807 | 
  11808 | /** The element the latest labelled read resolved to (readOptional), for echoRead: an echo is judged by the element (echoAt). */
  11809 | let lastReadHit: Locator | null = null;
  11810 | 
  11811 | /**
  11812 |  * A published read whose value is only what this segment itself typed,
  11813 |  * selected or named — replay's echoedValues, through the shared echoVerdict
  11814 |  * (src/execution/echo.ts, embedded). It confirms the control, not that the
  11815 |  * app persisted anything, so the label is listed in `run.echoed` and warned;
  11816 |  * the value is still published, as replay still carries it to later steps.
  11817 |  * Judged by the element, not only the text (the shared echoAt, round 59:
  11818 |  * fwec11's display name "Admin" after the sign-in form was submitted), and
  11819 |  * the element FIRST (the shared judgeEcho, round 61: EspoCRM fwec13 read
  11820 |  * "12,500" back from the Amount input typed with 12500). The ledger is the
  11821 |  * flow step's, across its segments, as the daemon's flow runner keeps it.
  11822 |  */
  11823 | async function echoRead(ledger: Set<string>, run: FlowRun, label: string, key: string, value: string | undefined, where: string, page: Page, at: Locator | null): Promise<void> {
  11824 |   const echo = await judgeEcho(page, ledger, label, value ?? '', at, where);
  11825 |   if (!echo) return;
  11826 |   run.echoed.push(key);
  11827 |   logWarning(echo);
  11828 | }
  11829 | 
  11830 | /** First gate after every step, as replay orders it: nothing recorded can hold on a browser error page. */
  11831 | function errorPageGate(page: Page, where: string): void {
  11832 |   const stop = errorPageVerdict(page.url(), where);
  11833 |   if (stop) throw new Error(stop);
  11834 | }
  11835 | 
  11836 | /**
  11837 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  11838 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  11839 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  11840 |  * literal segments is treated as volatile (warned, continued), anything else
  11841 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  11842 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  11843 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  11844 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  11845 |  * step's click reported of the link it clicked (the shared beginAction): a
  11846 |  * click that went where its link points, recorded as staying on the page it
  11847 |  * left, is the shared linkLandingWarning and waits for nothing.
  11848 |  */
  11849 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  11850 |   if (!urlMatches(pattern, page.url(), p)) {
  11851 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  11852 |     if (landed) return logWarning(landed);
  11853 |   }
  11854 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  11855 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  11856 |   for (const line of verdict.warnings) logWarning(line);
  11857 |   // What this step watched vary is the segment's evidence from here on
  11858 |   // (navigationTarget), whether or not the step goes on to stop.
  11859 |   if (verdict.diffs) volatile.push(...verdict.diffs);
> 11860 |   if (verdict.stop) throw new Error(verdict.stop);
        |                           ^ Error: after 04-open s_8a1366/1 expected url http://127.0.0.1:8090/projects/bench-project/work_packages/details/44/overview but browser is at http://127.0.0.1:8090/projects/bench-project/work_packages/details/38/overview
  11861 | }
  11862 | 
  11863 | /**
  11864 |  * Where a goto actually sends the browser — the shared retargetNavigation
  11865 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  11866 |  * the live url sits at a position THIS segment has already watched vary is a
  11867 |  * literal from the recording's run, and the live value is navigated to
  11868 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  11869 |  * one per replayed skill. The returned `stale` is handed to this step's
  11870 |  * alert gate, so an unrecorded alert on the landing names the cause.
  11871 |  */
  11872 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  11873 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  11874 |   if (verdict.warning) logWarning(verdict.warning);
  11875 |   return verdict;
  11876 | }
  11877 | 
  11878 | /**
  11879 |  * The alert observation a step is judged by, taken where the daemon takes
  11880 |  * its diff: after the action, once the DOM has settled (tools.ts
  11881 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  11882 |  * inside verify's url window is seen by both runners or by neither.
  11883 |  * Rendered in the step's line dialect, with whether every live region was
  11884 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  11885 |  */
  11886 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  11887 |   await settle(page);
  11888 |   return liveAlertsObserved(page, dialect);
  11889 | }
  11890 | 
  11891 | /**
  11892 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  11893 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  11894 |  * and stops a state-changing step only when its recorded page changes did
  11895 |  * not confirm it worked (a rejection toast that leaves the page superficially
  11896 |  * intact); a recorded-but-missing one only warns.
  11897 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  11898 |  * `after` in settle, right after the action has settled and BEFORE the url
  11899 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  11900 |  * during a 5s url wait must not be missed) — and a page that could not be
  11901 |  * read is handed over as unobserved, never as "no alert".
  11902 |  */
  11903 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  11904 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  11905 |   for (const line of verdict.warnings) logWarning(line);
  11906 |   if (verdict.stop) throw new Error(verdict.stop);
  11907 | }
  11908 | 
  11909 | /**
  11910 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  11911 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  11912 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  11913 |  * page structure agrees, anything else refuses before the first step acts.
  11914 |  * `similarity` is what replay's adapter passes: where the recording kept a
  11915 |  * page fingerprint, the call site measures the live page with the shared
  11916 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  11917 |  * could not be read, exactly as replay; null where the recording kept none
  11918 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  11919 |  * compiled before the vector travelled, which refuses a soft match it cannot
  11920 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  11921 |  * (arguments evaluate left to right), as replay reads startUrl before it
  11922 |  * fingerprints: both describe the page as the segment found it, not where a
  11923 |  * navigation in flight landed during the measurement. Async so the call site
  11924 |  * must await it: a gate that could be left un-awaited is one that can
  11925 |  * silently become a no-op.
  11926 |  */
  11927 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  11928 |   const verdict = preconditionVerdict(pattern, url, p, similarity, mints);
  11929 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
  11930 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
  11931 | }
  11932 | 
  11933 | /**
  11934 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  11935 |  * source of truth, so the vector is carried once. A segment the emitter
  11936 |  * asked this of always has one; its absence means FLOW was edited by hand,
  11937 |  * and the gate fails closed rather than soft-match on the url alone.
  11938 |  */
  11939 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  11940 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  11941 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  11942 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  11943 |   return recorded;
  11944 | }
  11945 | 
  11946 | /**
  11947 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  11948 |  *
  11949 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  11950 |  * action and, when the action changed it, awaits settleDom before binding
  11951 |  * the step's derived values — the value a spec needs is the one on the url
  11952 |  * the step navigated TO, and `page.url()` read in the same tick as the
  11953 |  * click still says where the page came FROM. Bound empty, every pattern
  11954 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  11955 |  *
  11956 |  * ALL of them together, not one at a time, because they are read into ONE
  11957 |  * pattern: an app is free to populate its state fragment key by key (odoo
  11958 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  11959 |  * that binds the instant IT is non-empty can be bound off a half-built url
  11960 |  * while its neighbour is still missing. The step is not where it was
```