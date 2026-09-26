# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwop15-cv4.spec.ts >> fwop15-cv4
- Location: fwop15-cv4.spec.ts:9:1

# Error details

```
Error: none of 2 recorded locators resolved at 02-create s_46e661/6 target (page is at http://127.0.0.1:8090/projects/bench-project/work_packages/create_new?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D&type=1): locator('div > div:nth-of-type(1) > op-editable-attribute-field > div > div:nth-of-type(2) > span') | locator('[data-sitelooper-point="897,189"]')
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
                  - generic [ref=e155]:
                    - button "Create new work package" [disabled]:
                      - img
                      - generic: Create
                      - img
                - listitem [ref=e156]:
                  - generic [ref=e158]:
                    - button "Include projects 1" [ref=e159] [cursor=pointer]:
                      - text: Include projects
                      - generic [ref=e160]: "1"
                      - img [ref=e161]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e163]:
                  - generic [ref=e165]:
                    - button "Baseline" [ref=e166] [cursor=pointer]:
                      - img [ref=e167]
                      - generic [ref=e170]: Baseline
                      - img [ref=e171]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e173]:
                  - button "Deactivate Filter" [ref=e175] [cursor=pointer]:
                    - generic [ref=e177]: 
                    - generic [ref=e178]:
                      - text: Filter
                      - generic [ref=e179]: "2"
                    - img [ref=e180]
                - listitem [ref=e182]:
                  - button "Open details view" [ref=e184] [cursor=pointer]:
                    - generic [ref=e186]: 
                - listitem:
                  - generic:
                    - list
                - listitem [ref=e187]:
                  - button "Activate zen mode" [ref=e189] [cursor=pointer]:
                    - generic [ref=e191]: 
                - listitem [ref=e192]:
                  - button "More actions" [ref=e194] [cursor=pointer]:
                    - generic [ref=e196]: 
            - group "Selected filters" [ref=e202]:
              - generic [ref=e203]: Selected filters
              - button "Close form" [ref=e205] [cursor=pointer]:
                - img
              - list [ref=e206]:
                - listitem [ref=e207]:
                  - generic "Filter by text" [ref=e208]
                  - textbox "Filter by text" [ref=e211]:
                    - /placeholder: Subject, description, comments, ...
                - listitem [ref=e212]
                - listitem [ref=e213]:
                  - generic [ref=e214]: Status
                  - generic [ref=e215]:
                    - generic [ref=e216]: Status Open this filter with 'ALT' and arrow keys.
                    - combobox "Status Status Open this filter with 'ALT' and arrow keys." [ref=e217]:
                      - option "open"
                      - option "is (OR)"
                      - option "closed"
                      - option "is not"
                      - option "is not empty" [selected]
                  - button "Delete" [ref=e219] [cursor=pointer]:
                    - generic [ref=e221]: 
                - listitem [ref=e222]:
                  - generic [ref=e223]: Subject
                  - generic [ref=e224]:
                    - generic [ref=e225]: Subject Open this filter with 'ALT' and arrow keys.
                    - combobox "Subject Subject Open this filter with 'ALT' and arrow keys." [ref=e226]:
                      - option "contains" [selected]
                      - option "doesn't contain"
                  - generic [ref=e229]:
                    - textbox "Enter text" [ref=e230]: "Seed:"
                    - generic [ref=e231]: Enter text
                  - button "Delete" [ref=e233] [cursor=pointer]:
                    - generic [ref=e235]: 
                - listitem [ref=e236]:
                  - generic [ref=e237]:
                    - generic [ref=e239]: 
                    - text: "Add filter:"
                  - generic [ref=e240]: Add filter Open this filter with 'ALT' and arrow keys. To select an entry leave the focus for example by pressing enter. To leave without filter select the first (empty) entry.
                  - generic [ref=e242]:
                    - generic [ref=e244]:
                      - generic [ref=e245]: Please select
                      - combobox [ref=e247]
                    - status [ref=e249]
            - generic [ref=e250]:
              - generic [ref=e252]:
                - generic [ref=e254]:
                  - table "Table with rows of work package and columns of work package attributes.Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns." [ref=e256]:
                    - caption [ref=e266]:
                      - text: Table with rows of work package and columns of work package attributes.
                      - text: Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns.
                    - rowgroup [ref=e267]:
                      - row "ID Subject Type Status Assignee Priority" [ref=e268]:
                        - columnheader [ref=e269]
                        - columnheader "ID" [ref=e271]:
                          - generic [ref=e274]:
                            - link "ID" [ref=e275] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e277]: Open menu
                        - columnheader "Subject" [ref=e278]:
                          - generic [ref=e281]:
                            - generic [ref=e284] [cursor=pointer]: 
                            - link "Subject" [ref=e285] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e287]: Open menu
                        - columnheader "Type" [ref=e288]:
                          - generic [ref=e291]:
                            - link "Type" [ref=e292] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e294]: Open menu
                        - columnheader "Status" [ref=e295]:
                          - generic [ref=e298]:
                            - link "Status" [ref=e299] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e301]: Open menu
                        - columnheader "Assignee" [ref=e302]:
                          - generic [ref=e305]:
                            - link "Assignee" [ref=e306] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e308]: Open menu
                        - columnheader "Priority" [ref=e309]:
                          - generic [ref=e312]:
                            - link "Priority" [ref=e313] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e315]: Open menu
                        - columnheader [ref=e316]:
                          - button "Configure view" [ref=e319] [cursor=pointer]:
                            - generic [ref=e321]: 
                    - rowgroup [ref=e322]:
                      - 'row " id 38 Work package leaf at level 0. Subject Seed: triage inbox: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e323] [cursor=pointer]':
                        - cell "" [ref=e324]:
                          - generic [ref=e325]: 
                        - cell "id 38" [ref=e326]:
                          - generic "id 38" [ref=e328]:
                            - link "38" [ref=e329]:
                              - /url: /projects/bench-project/work_packages/38/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: triage inbox: Edit" [ref=e330]':
                          - generic [ref=e332]: Work package leaf at level 0.
                          - 'button "Subject Seed: triage inbox: Edit" [ref=e334]': "Seed: triage inbox"
                        - 'cell "Type Task: Edit" [ref=e335]':
                          - 'button "Type Task: Edit" [ref=e337]': Task
                        - 'cell "Status New: Edit" [ref=e338]':
                          - 'button "Status New: Edit" [ref=e340]': New
                        - 'cell "Assignee No value: Edit" [ref=e341]':
                          - 'button "Assignee No value: Edit" [ref=e343]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e344]':
                          - 'button "Priority Normal: Edit" [ref=e346]': Normal
                        - cell "Open details view Open context menu" [ref=e347]:
                          - generic [ref=e348]:
                            - link "Open details view" [ref=e349]:
                              - /url: /projects/bench-project/work_packages/details/38/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e350]: 
                            - link "Open context menu" [ref=e351]:
                              - /url: "#"
                              - generic [ref=e352]: 
                      - 'row " id 39 Work package leaf at level 0. Subject Seed: order missing parts: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e353] [cursor=pointer]':
                        - cell "" [ref=e354]:
                          - generic [ref=e355]: 
                        - cell "id 39" [ref=e356]:
                          - generic "id 39" [ref=e358]:
                            - link "39" [ref=e359]:
                              - /url: /projects/bench-project/work_packages/39/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: order missing parts: Edit" [ref=e360]':
                          - generic [ref=e362]: Work package leaf at level 0.
                          - 'button "Subject Seed: order missing parts: Edit" [ref=e364]': "Seed: order missing parts"
                        - 'cell "Type Task: Edit" [ref=e365]':
                          - 'button "Type Task: Edit" [ref=e367]': Task
                        - 'cell "Status New: Edit" [ref=e368]':
                          - 'button "Status New: Edit" [ref=e370]': New
                        - 'cell "Assignee No value: Edit" [ref=e371]':
                          - 'button "Assignee No value: Edit" [ref=e373]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e374]':
                          - 'button "Priority Normal: Edit" [ref=e376]': Normal
                        - cell "Open details view Open context menu" [ref=e377]:
                          - generic [ref=e378]:
                            - link "Open details view" [ref=e379]:
                              - /url: /projects/bench-project/work_packages/details/39/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e380]: 
                            - link "Open context menu" [ref=e381]:
                              - /url: "#"
                              - generic [ref=e382]: 
                      - 'row " id 40 Work package leaf at level 0. Subject Seed: ship repaired device: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e383] [cursor=pointer]':
                        - cell "" [ref=e384]:
                          - generic [ref=e385]: 
                        - cell "id 40" [ref=e386]:
                          - generic "id 40" [ref=e388]:
                            - link "40" [ref=e389]:
                              - /url: /projects/bench-project/work_packages/40/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: ship repaired device: Edit" [ref=e390]':
                          - generic [ref=e392]: Work package leaf at level 0.
                          - 'button "Subject Seed: ship repaired device: Edit" [ref=e394]': "Seed: ship repaired device"
                        - 'cell "Type Task: Edit" [ref=e395]':
                          - 'button "Type Task: Edit" [ref=e397]': Task
                        - 'cell "Status New: Edit" [ref=e398]':
                          - 'button "Status New: Edit" [ref=e400]': New
                        - 'cell "Assignee No value: Edit" [ref=e401]':
                          - 'button "Assignee No value: Edit" [ref=e403]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e404]':
                          - 'button "Priority Normal: Edit" [ref=e406]': Normal
                        - cell "Open details view Open context menu" [ref=e407]:
                          - generic [ref=e408]:
                            - link "Open details view" [ref=e409]:
                              - /url: /projects/bench-project/work_packages/details/40/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e410]: 
                            - link "Open context menu" [ref=e411]:
                              - /url: "#"
                              - generic [ref=e412]: 
                    - rowgroup
                    - rowgroup [ref=e413]:
                      - row "Create new work package" [ref=e414]:
                        - cell "Create new work package" [ref=e415]:
                          - button "Create new work package" [ref=e416] [cursor=pointer]:
                            - img [ref=e417]
                            - generic [ref=e419]: Create new work package
                  - generic [ref=e420]: 
                - navigation "Pagination navigation" [ref=e424]:
                  - text: (1 - 3/3)
                  - generic [ref=e425]: You are on the only page.
              - generic [ref=e428]:
                - generic:
                  - generic [ref=e429]:
                    - generic [ref=e432]:
                      - 'button "Status New: Edit" [ref=e437]': New
                      - 'button "Type Task: Edit" [ref=e442]': Task
                    - generic [ref=e443]:
                      - generic [ref=e444]:
                        - form [ref=e451]:
                          - generic [ref=e452]: Subject
                          - textbox "Subject" [ref=e454]: fwop15-cv4-c4 Bench Work Package
                        - form [ref=e463]:
                          - generic [ref=e464]: Description
                          - generic [ref=e469]:
                            - toolbar "Editor toolbar" [ref=e471]:
                              - generic [ref=e472]:
                                - button "Paragraph, Heading" [ref=e474]:
                                  - generic [ref=e475]: Paragraph
                                  - img
                                - button "Bold" [ref=e477]:
                                  - img [ref=e478]
                                - button "Italic" [ref=e480]:
                                  - img [ref=e481]
                                - button "Strikethrough" [ref=e483]:
                                  - img [ref=e484]
                                - button "Code" [ref=e487]:
                                  - img [ref=e488]
                                - button "Insert code snippet" [ref=e490]:
                                  - img [ref=e491]
                                - button "Link" [ref=e497]:
                                  - img [ref=e498]
                              - button "Show more items" [ref=e502]:
                                - img [ref=e503]
                            - 'textbox "Rich Text Editor. Editing area: main. Press Alt+0 for help." [ref=e508]':
                              - paragraph [ref=e509]: Bench work package for run fwop15-cv4-c4
                        - generic [ref=e510]:
                          - heading "People" [level=3] [ref=e513]
                          - generic [ref=e514]:
                            - generic [ref=e515]:
                              - button "Assignee" [ref=e518]
                              - form [ref=e526]:
                                - generic [ref=e527]: Assignee
                                - generic [ref=e531]:
                                  - generic [ref=e532]:
                                    - generic [ref=e533]:
                                      - generic [ref=e534]: Bench Assignee
                                      - combobox "Search" [active] [ref=e536]
                                    - button "Clear all" [ref=e537] [cursor=pointer]:
                                      - generic: ×
                                  - status [ref=e539]
                            - generic [ref=e540]:
                              - button "Accountable" [ref=e543]
                              - form [ref=e551]:
                                - generic [ref=e552]: Accountable
                                - generic [ref=e556]:
                                  - generic [ref=e558]:
                                    - generic [ref=e559]: Type to search
                                    - combobox "Search" [ref=e561]
                                  - status [ref=e563]
                        - generic [ref=e564]:
                          - heading "Estimates and progress" [level=3] [ref=e567]
                          - generic [ref=e568]:
                            - generic [ref=e569]:
                              - button "Work" [ref=e572]
                              - form [ref=e580]:
                                - generic [ref=e581]: Work
                                - generic [ref=e583]:
                                  - textbox "Work" [ref=e584]: "-"
                                  - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                            - generic [ref=e585]:
                              - button "Remaining work" [ref=e588]
                              - form [ref=e596]:
                                - generic [ref=e597]: Remaining work
                                - generic [ref=e599]:
                                  - textbox "Remaining work" [ref=e600]: "-"
                                  - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                            - generic [ref=e601]:
                              - button "% Complete" [ref=e604]
                              - form [ref=e612]:
                                - generic [ref=e613]: "% Complete"
                                - generic [ref=e615]:
                                  - textbox "% Complete" [ref=e616]: "-"
                                  - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                            - generic [ref=e617]:
                              - button "Story Points" [ref=e620]
                              - form [ref=e628]:
                                - generic [ref=e629]: Story Points
                                - spinbutton "Story Points" [ref=e631]
                        - generic [ref=e632]:
                          - heading "Details" [level=3] [ref=e635]
                          - generic [ref=e636]:
                            - generic [ref=e637]:
                              - button "Priority *" [ref=e640]
                              - form [ref=e648]:
                                - generic [ref=e649]: Priority
                                - generic [ref=e652]:
                                  - generic [ref=e654]:
                                    - generic [ref=e655]: Normal
                                    - combobox [ref=e657]
                                  - status [ref=e659]
                            - generic [ref=e660]:
                              - button "Sprint" [ref=e663]
                              - form [ref=e671]:
                                - generic [ref=e672]: Sprint
                                - generic [ref=e675]:
                                  - generic [ref=e676]:
                                    - combobox [ref=e679]
                                    - button "Clear all" [ref=e680] [cursor=pointer]:
                                      - generic: ×
                                  - status [ref=e682]
                            - generic [ref=e683]:
                              - button "Backlog bucket" [ref=e686]
                              - form [ref=e694]:
                                - generic [ref=e695]: Backlog bucket
                                - generic [ref=e698]:
                                  - generic [ref=e699]:
                                    - combobox [ref=e702]
                                    - button "Clear all" [ref=e703] [cursor=pointer]:
                                      - generic: ×
                                  - status [ref=e705]
                            - generic [ref=e706]:
                              - button "Target versions" [ref=e709]
                              - form [ref=e717]:
                                - generic [ref=e718]: Target versions
                                - generic [ref=e720]:
                                  - combobox [ref=e725]
                                  - status [ref=e727]
                            - generic [ref=e728]:
                              - button "Category" [ref=e731]
                              - form [ref=e739]:
                                - generic [ref=e740]: Category
                                - generic [ref=e743]:
                                  - generic [ref=e744]:
                                    - combobox [ref=e747]
                                    - button "Clear all" [ref=e748] [cursor=pointer]:
                                      - generic: ×
                                  - status [ref=e750]
                            - generic [ref=e751]:
                              - button "Date" [ref=e754]
                              - form [ref=e762]:
                                - generic [ref=e763]: Start date
                                - textbox [ref=e765]: no start date - no finish date
                        - heading "Other" [level=3] [ref=e769]
                        - heading "Costs" [level=3] [ref=e773]
                      - generic [ref=e775]:
                        - generic [ref=e777]: Attachments
                        - generic [ref=e778]:
                          - button "Attach files" [ref=e779] [cursor=pointer]:
                            - img [ref=e780]
                            - generic [ref=e783]: Drop files here or click to attach files.
                          - button "Attach files" [ref=e785] [cursor=pointer]:
                            - img [ref=e786]
                            - generic [ref=e789]: Attach files
                  - generic [ref=e792]:
                    - button "Save" [ref=e793] [cursor=pointer]:
                      - generic [ref=e795]: 
                      - text: Save
                    - button "Cancel" [ref=e796] [cursor=pointer]:
                      - generic [ref=e798]: 
                      - text: Cancel
                  - generic [ref=e799]: 
  - generic:
    - application:
      - generic:
        - generic:
          - list
        - generic:
          - list
```

# Test source

```ts
  15417 |  * ladder a fill climbs (an editor or an aria-combobox driven by typing in
  15418 |  * the recording is driven by its recipe here too), else pressSequentially
  15419 |  * on the same target with the daemon's timeout and per-key delay.
  15420 |  */
  15421 | const TYPE_TIMEOUT_MS = 10000;
  15422 | const TYPE_DELAY_MS = 20;
  15423 | async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {
  15424 |   const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });
  15425 |   if (attempt) logRecipe(attempt);
  15426 | }
  15427 | 
  15428 | /**
  15429 |  * A recorded `select`, as tools.ts's `case 'select'`: the select-option
  15430 |  * recipe for a recognized widget (a portal-rendered aria-combobox), else the
  15431 |  * native reactSafeSelect by label, with the recorded `optionValue` as the
  15432 |  * last resort replay itself keeps.
  15433 |  */
  15434 | async function select(loc: Locator, label: string, fallbackValue?: string): Promise<void> {
  15435 |   const { attempt } = await selectWithRecipe(loc.page(), loc, label, recipeBook, fallbackValue);
  15436 |   if (attempt) logRecipe(attempt);
  15437 | }
  15438 | 
  15439 | /**
  15440 |  * One recorded chain resolved against the page — the artifact's adapter to
  15441 |  * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),
  15442 |  * which is replay's `resolveChain` policy itself: the class order, the
  15443 |  * point mark, the identity guard, plausibility, the origin guard, ambiguity
  15444 |  * and its loop-cursor narrowing, the structural hold and the whole-chain
  15445 |  * wait are decided THERE, in both runners. Nothing here reinterprets one.
  15446 |  *
  15447 |  * What this adds is presentation, exactly what replay adds around its own
  15448 |  * call:
  15449 |  *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in
  15450 |  *    at each call site) turns a silent fallthrough into telemetry. A win by
  15451 |  *    any candidate but the primary (stored index 0) IS drift — the recorded
  15452 |  *    locator missed and a later one covered for it — so it is one stable,
  15453 |  *    grep-able `[sitelooper drift]` line naming every candidate rejected
  15454 |  *    ahead of the winner and WHY, in the policy's own words (MissReason).
  15455 |  *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what
  15456 |  *    this target resolved TO, as `<key>=<winning locator>`, with the cursor
  15457 |  *    appended only when ambiguity was narrowed to it. The progress guard
  15458 |  *    compares one pass's entries with the last.
  15459 |  *
  15460 |  * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's
  15461 |  * evidence-based reordering of a candidate later runs showed volatile):
  15462 |  * that evidence lives in the skill store, and an artifact has none, so a
  15463 |  * compiled chain is ordered by class and recorded order alone. Everything
  15464 |  * else the policy decides is decided here from the same observations.
  15465 |  */
  15466 | async function resolveTarget(
  15467 |   page: Page,
  15468 |   candidates: CandidateObservation[],
  15469 |   where: string,
  15470 |   policy: ResolvePolicy,
  15471 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  15472 | ): Promise<Resolution | null> {
  15473 |   const hit = await resolveCandidates(page, candidates, policy);
  15474 |   if (!hit) return null;
  15475 |   const primary = candidates.find((c) => c.index === 0) ?? candidates[0];
  15476 |   // Drift is a better candidate that FAILED (the shared isDrift), never a stored
  15477 |   // index alone: a positional primary the policy ranked behind a name was not missed.
  15478 |   if (isDrift(hit)) {
  15479 |     const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');
  15480 |     const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : 'used';
  15481 |     const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;
  15482 |     console.log(line);
  15483 |     (opts.drift ?? DRIFT).push(line);
  15484 |   }
  15485 |   if (opts.resolved) {
  15486 |     const won = candidates.find((c) => c.index === hit.index) ?? primary;
  15487 |     opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);
  15488 |     // the loop progress guard, asked before anything acts on what just resolved
  15489 |     opts.resolved.check?.();
  15490 |   }
  15491 |   return hit;
  15492 | }
  15493 | 
  15494 | /**
  15495 |  * resolveTarget for an ACTION: a chain that resolves nothing is a stop.
  15496 |  *
  15497 |  * `note` is passed only at a FLAGGED step (compile found the step itself
  15498 |  * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the
  15499 |  * throw, it is what stops "none of 3 recorded locators resolved" from
  15500 |  * reading as app drift when the recording is what needs redoing.
  15501 |  */
  15502 | async function pick(
  15503 |   page: Page,
  15504 |   candidates: CandidateObservation[],
  15505 |   where: string,
  15506 |   policy: ResolvePolicy,
  15507 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  15508 |   note?: string,
  15509 | ): Promise<Resolution> {
  15510 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  15511 |   if (hit) return hit;
  15512 |   throw pickMiss(page, candidates, where, note);
  15513 | }
  15514 | 
  15515 | /** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */
  15516 | function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {
> 15517 |   return new Error(
        |          ^ Error: none of 2 recorded locators resolved at 02-create s_46e661/6 target (page is at http://127.0.0.1:8090/projects/bench-project/work_packages/create_new?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22*%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22subject%22%2C%22o%22%3A%22~%22%2C%22v%22%3A%5B%22Seed%3A%22%5D%7D%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D&type=1): locator('div > div:nth-of-type(1) > op-editable-attribute-field > div > div:nth-of-type(2) > span') | locator('[data-sitelooper-point="897,189"]')
  15518 |     // The url and the recorded step are half the answer whenever a chain
  15519 |     // misses wholesale: a locator that named the control on the day it was
  15520 |     // recorded usually misses because the page is not the page the step
  15521 |     // expected, and the log otherwise says only that nothing resolved.
  15522 |     `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +
  15523 |       candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +
  15524 |       (note ? `\n  ${note}` : ''),
  15525 |   );
  15526 | }
  15527 | 
  15528 | /**
  15529 |  * `pick` for a navigation click with a recorded destination — replay's
  15530 |  * navigation fallback (runOneStep), through the shared
  15531 |  * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,
  15532 |  * embedded). When the chain resolves nothing and the browser is not already
  15533 |  * where the click was recorded to land, another visible link to that
  15534 |  * destination is clicked, else a fully concrete destination is navigated to
  15535 |  * directly. Arrival returns null — the step is done, logged as drift, and
  15536 |  * its gates are not asked, as replay returns before them. Otherwise the
  15537 |  * same stop `pick` throws. Never emitted in a loop body (replay's rule).
  15538 |  */
  15539 | async function pickOrNavigate(
  15540 |   page: Page,
  15541 |   candidates: CandidateObservation[],
  15542 |   where: string,
  15543 |   policy: ResolvePolicy,
  15544 |   destPattern: string,
  15545 |   p: Record<string, string>,
  15546 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  15547 |   note?: string,
  15548 | ): Promise<Resolution | null> {
  15549 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  15550 |   if (hit) return hit;
  15551 |   if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {
  15552 |     const arrived = await navigateToDestination(page, destPattern, p, {
  15553 |       click: async (loc) => {
  15554 |         await click(loc);
  15555 |       },
  15556 |       goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),
  15557 |     });
  15558 |     // The substitute link's click may have landed: a stop, never the direct navigation after it.
  15559 |     if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);
  15560 |     if (arrived) {
  15561 |       const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;
  15562 |       console.log(line);
  15563 |       (opts.drift ?? DRIFT).push(line);
  15564 |       return null;
  15565 |     }
  15566 |   }
  15567 |   throw pickMiss(page, candidates, where, note);
  15568 | }
  15569 | 
  15570 | /**
  15571 |  * Every `[sitelooper skip]` line this run logged, by the `where` that
  15572 |  * logged it (`<step id> <skill step>/<n> <role>`).
  15573 |  *
  15574 |  * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,
  15575 |  * to look above for the producing step's `[sitelooper skip] … read target
  15576 |  * not found` line. When the reference names something that is not a step of
  15577 |  * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,
  15578 |  * a ledger instruction id no step publishes) no such line was ever emitted —
  15579 |  * the only occurrence of that string in the entire log was inside the error
  15580 |  * itself, and it sent the diagnosis after a read that was working all along.
  15581 |  * So the claim is now made only when the log bears it out.
  15582 |  */
  15583 | const skippedReads: string[] = [];
  15584 | 
  15585 | /**
  15586 |  * A recorded READ, which never fails the flow.
  15587 |  *
  15588 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an
  15589 |  * OBSERVATION, not a state change: a read whose target cannot be resolved —
  15590 |  * or whose read itself errors — is skipped with a warning and the replay
  15591 |  * CONTINUES ("skipped read — no element matched any known locator"). Failing
  15592 |  * to re-capture a value says nothing about whether the procedure ran; the
  15593 |  * step after it is exactly as valid as it was. A spec that threw here turned
  15594 |  * a missing observation into a failed test: grafana's `panel_content` read is
  15595 |  * a freshly applied text panel whose body the verifier goes on to confirm,
  15596 |  * and none of the three recorded ways of naming it resolved inside the
  15597 |  * resolve window — one lost value, and the run reported as a broken procedure.
  15598 |  *
  15599 |  * So: the resolution and the read together, and on any failure one grep-able
  15600 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  15601 |  * are left exactly as they were — the emptiness is the honest report.
  15602 |  *
  15603 |  * The rules are not restated here. WHEN the resolution is asked (once, then
  15604 |  * after one sweep of the page once more with no wait) is the shared
  15605 |  * resolveForRead; taking the read, flattening it and turning its error into
  15606 |  * a skip is the shared takeRead (src/execution/observe.ts, embedded).
  15607 |  * Replay's runOneStep calls the same two; this adapter only says what it did.
  15608 |  */
  15609 | async function readOptional(
  15610 |   page: Page,
  15611 |   candidates: CandidateObservation[],
  15612 |   where: string,
  15613 |   policy: ResolvePolicy,
  15614 |   read: (loc: Locator) => Promise<unknown>,
  15615 |   opts: {
  15616 |     drift?: string[];
  15617 |     resolved?: { into: string[]; key: string; check?: () => void };
```