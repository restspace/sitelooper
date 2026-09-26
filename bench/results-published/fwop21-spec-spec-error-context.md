# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwop21.spec.ts >> fwop21
- Location: fwop21.spec.ts:9:1

# Error details

```
Error: 06-open s_9c9088/3: the recorded page change did not appear

06-open s_9c9088/3: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 06-open s_9c9088/3 none of the 1 recorded page change(s) appeared (e.g. \"- textbox \\\"Finish date\\\": {{*}}\") — the step ran but did not have its recorded effect"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - dialog [ref=e3]:
    - generic [ref=e6]:
      - generic [ref=e8]: "Date picker updated. Scheduling mode: Manual, working days only"
      - generic [ref=e9]:
        - generic [ref=e11]:
          - generic "Datepicker tabs" [ref=e12]:
            - tablist "Datepicker tabs" [ref=e13]:
              - tab "Dates" [selected] [ref=e14] [cursor=pointer]:
                - generic [ref=e15]: Dates
              - tab "Predecessors 0" [ref=e16] [cursor=pointer]:
                - generic [ref=e17]: Predecessors
                - generic "0" [ref=e18]
              - tab "Successors 0" [ref=e19] [cursor=pointer]:
                - generic [ref=e20]: Successors
                - generic "0" [ref=e21]
              - tab "Children 0" [ref=e22] [cursor=pointer]:
                - generic [ref=e23]: Children
                - generic "0" [ref=e24]
          - tabpanel "Dates" [ref=e25]:
            - generic [ref=e27]:
              - generic [ref=e29]:
                - generic [ref=e31]:
                  - generic [ref=e32]: Scheduling mode
                  - list "Scheduling mode" [ref=e34]:
                    - listitem [ref=e35]:
                      - link "Manual" [ref=e36] [cursor=pointer]:
                        - /url: /work_packages/44/date_picker/preview?date_mode=single&field=work_package%5Bdue_date%5D&schedule_manually=true&triggering_field=combined_date&work_package%5Bdue_date%5D=&work_package%5Bdue_date_touched%5D=true&work_package%5Bduration%5D=&work_package%5Bduration_touched%5D=false&work_package%5Bignore_non_working_days%5D=0&work_package%5Bignore_non_working_days_touched%5D=false&work_package%5Binitial%5D%5Bdue_date%5D=&work_package%5Binitial%5D%5Bduration%5D=&work_package%5Binitial%5D%5Bignore_non_working_days%5D=false&work_package%5Binitial%5D%5Bschedule_manually%5D=true&work_package%5Binitial%5D%5Bstart_date%5D=&work_package%5Bschedule_manually%5D=true&work_package%5Bschedule_manually_touched%5D=false&work_package%5Bstart_date%5D=&work_package%5Bstart_date_touched%5D=false&work_package_id=44
                        - generic [ref=e37]:
                          - generic:
                            - img
                          - generic [ref=e38]: Manual
                    - listitem [ref=e39]:
                      - link "Automatic" [ref=e40] [cursor=pointer]:
                        - /url: /work_packages/44/date_picker/preview?date_mode=single&field=work_package%5Bdue_date%5D&schedule_manually=false&triggering_field=combined_date&work_package%5Bdue_date%5D=&work_package%5Bdue_date_touched%5D=true&work_package%5Bduration%5D=&work_package%5Bduration_touched%5D=false&work_package%5Bignore_non_working_days%5D=0&work_package%5Bignore_non_working_days_touched%5D=false&work_package%5Binitial%5D%5Bdue_date%5D=&work_package%5Binitial%5D%5Bduration%5D=&work_package%5Binitial%5D%5Bignore_non_working_days%5D=false&work_package%5Binitial%5D%5Bschedule_manually%5D=true&work_package%5Binitial%5D%5Bstart_date%5D=&work_package%5Bschedule_manually%5D=true&work_package%5Bschedule_manually_touched%5D=false&work_package%5Bstart_date%5D=&work_package%5Bstart_date_touched%5D=false&work_package_id=44
                        - generic [ref=e41]:
                          - generic:
                            - img
                          - generic [ref=e42]: Automatic
                - generic [ref=e44]:
                  - checkbox "Working days only" [checked] [ref=e45] [cursor=pointer]
                  - generic [ref=e47] [cursor=pointer]: Working days only
              - generic [ref=e49]:
                - link "Start date" [ref=e53] [cursor=pointer]:
                  - /url: /work_packages/44/date_picker/preview?action=preview&controller=work_packages%2Fdate_picker&date_mode=range&field=work_package%5Bdue_date%5D&focused_field=start_date&triggering_field=combined_date&work_package%5Bdue_date%5D=&work_package%5Bdue_date_touched%5D=true&work_package%5Bduration%5D=&work_package%5Bduration_touched%5D=false&work_package%5Bignore_non_working_days%5D=0&work_package%5Bignore_non_working_days_touched%5D=false&work_package%5Binitial%5D%5Bdue_date%5D=&work_package%5Binitial%5D%5Bduration%5D=&work_package%5Binitial%5D%5Bignore_non_working_days%5D=false&work_package%5Binitial%5D%5Bschedule_manually%5D=true&work_package%5Binitial%5D%5Bstart_date%5D=&work_package%5Bschedule_manually%5D=true&work_package%5Bschedule_manually_touched%5D=false&work_package%5Bstart_date%5D=&work_package%5Bstart_date_touched%5D=false&work_package_id=44
                  - generic [ref=e54]:
                    - generic:
                      - img
                    - generic [ref=e55]: Start date
                - generic [ref=e57]:
                  - generic [ref=e59]:
                    - generic [ref=e60]: Finish date
                    - generic [ref=e61]:
                      - textbox "Finish date" [active] [ref=e62]
                      - button "Clear" [ref=e63] [cursor=pointer]:
                        - img [ref=e64]
                  - link "Select today as finish date." [ref=e67] [cursor=pointer]:
                    - /url: ""
                    - text: Today
                - generic [ref=e69]:
                  - generic [ref=e70]: Duration
                  - generic [ref=e71]:
                    - spinbutton "Duration" [ref=e72]
                    - generic:
                      - generic:
                        - generic: days
              - generic [ref=e75]:
                - generic [ref=e76]:
                  - img [ref=e78] [cursor=pointer]
                  - generic [ref=e81]:
                    - generic [ref=e82]: December
                    - spinbutton [ref=e84]: "2026"
                  - generic [ref=e88]:
                    - generic [ref=e89]: January
                    - spinbutton [ref=e91]: "2027"
                  - img [ref=e95] [cursor=pointer]
                - generic [ref=e98]:
                  - generic [ref=e99]:
                    - generic [ref=e100]:
                      - generic [ref=e101]: Sun
                      - generic [ref=e102]: Mon
                      - generic [ref=e103]: Tue
                      - generic [ref=e104]: Wed
                      - generic [ref=e105]: Thu
                      - generic [ref=e106]: Fri
                      - generic [ref=e107]: Sat
                    - generic [ref=e108]:
                      - generic [ref=e109]: Sun
                      - generic [ref=e110]: Mon
                      - generic [ref=e111]: Tue
                      - generic [ref=e112]: Wed
                      - generic [ref=e113]: Thu
                      - generic [ref=e114]: Fri
                      - generic [ref=e115]: Sat
                  - generic [ref=e116]:
                    - generic [ref=e117]:
                      - generic [ref=e118] [cursor=pointer]: "1"
                      - generic [ref=e119] [cursor=pointer]: "2"
                      - generic [ref=e120] [cursor=pointer]: "3"
                      - generic [ref=e121] [cursor=pointer]: "4"
                      - generic: "5"
                      - generic: "6"
                      - generic [ref=e122] [cursor=pointer]: "7"
                      - generic [ref=e123] [cursor=pointer]: "8"
                      - generic [ref=e124] [cursor=pointer]: "9"
                      - generic [ref=e125] [cursor=pointer]: "10"
                      - generic [ref=e126] [cursor=pointer]: "11"
                      - generic: "12"
                      - generic: "13"
                      - generic [ref=e127] [cursor=pointer]: "14"
                      - generic [ref=e128] [cursor=pointer]: "15"
                      - generic [ref=e129] [cursor=pointer]: "16"
                      - generic [ref=e130] [cursor=pointer]: "17"
                      - generic [ref=e131] [cursor=pointer]: "18"
                      - generic: "19"
                      - generic: "20"
                      - generic [ref=e132] [cursor=pointer]: "21"
                      - generic [ref=e133] [cursor=pointer]: "22"
                      - generic [ref=e134] [cursor=pointer]: "23"
                      - generic [ref=e135] [cursor=pointer]: "24"
                      - generic [ref=e136] [cursor=pointer]: "25"
                      - generic: "26"
                      - generic: "27"
                      - generic [ref=e137] [cursor=pointer]: "28"
                      - generic [ref=e138] [cursor=pointer]: "29"
                      - generic [ref=e139] [cursor=pointer]: "30"
                      - generic [ref=e140] [cursor=pointer]: "31"
                    - generic [ref=e141]:
                      - generic [ref=e142] [cursor=pointer]: "1"
                      - generic: "2"
                      - generic: "3"
                      - generic [ref=e143] [cursor=pointer]: "4"
                      - generic [ref=e144] [cursor=pointer]: "5"
                      - generic [ref=e145] [cursor=pointer]: "6"
                      - generic [ref=e146] [cursor=pointer]: "7"
                      - generic [ref=e147] [cursor=pointer]: "8"
                      - generic: "9"
                      - generic: "10"
                      - generic [ref=e148] [cursor=pointer]: "11"
                      - generic [ref=e149] [cursor=pointer]: "12"
                      - generic [ref=e150] [cursor=pointer]: "13"
                      - generic [ref=e151] [cursor=pointer]: "14"
                      - generic [ref=e152] [cursor=pointer]: "15"
                      - generic: "16"
                      - generic: "17"
                      - generic [ref=e153] [cursor=pointer]: "18"
                      - generic [ref=e154] [cursor=pointer]: "19"
                      - generic [ref=e155] [cursor=pointer]: "20"
                      - generic [ref=e156] [cursor=pointer]: "21"
                      - generic [ref=e157] [cursor=pointer]: "22"
                      - generic: "23"
                      - generic: "24"
                      - generic [ref=e158] [cursor=pointer]: "25"
                      - generic [ref=e159] [cursor=pointer]: "26"
                      - generic [ref=e160] [cursor=pointer]: "27"
                      - generic [ref=e161] [cursor=pointer]: "28"
                      - generic [ref=e162] [cursor=pointer]: "29"
                      - generic: "30"
                      - generic: "31"
        - generic [ref=e163]:
          - button "Cancel" [ref=e164] [cursor=pointer]:
            - generic [ref=e166]: Cancel
          - button "Save" [ref=e167] [cursor=pointer]:
            - generic [ref=e169]: Save
  - generic [ref=e172]: Open link in a new tab
  - generic [ref=e173]:
    - banner [ref=e174]:
      - generic [ref=e175]:
        - link "Click here to skip over the menu and go to the content" [ref=e176] [cursor=pointer]:
          - /url: ""
          - text: Jump to content
        - navigation "Top Menu" [ref=e177]:
          - button "Global modules" [ref=e178] [cursor=pointer]:
            - img
          - link "Home" [ref=e180] [cursor=pointer]:
            - /url: http://127.0.0.1:8090/
      - search "Search in OpenProject" [ref=e184]:
        - button "Search" [ref=e185] [cursor=pointer]:
          - generic [ref=e187]: 
        - generic [ref=e190]:
          - generic [ref=e192]:
            - generic [ref=e193]: Search in OpenProject
            - combobox "Search in OpenProject" [ref=e195]
          - status [ref=e196]
      - generic [ref=e197]:
        - button "Add…" [ref=e199] [cursor=pointer]:
          - generic [ref=e200]:
            - generic:
              - img
            - img "Add…" [ref=e202]
        - link "Notifications" [ref=e205] [cursor=pointer]:
          - /url: /notifications
          - img
        - button "Help" [ref=e207] [cursor=pointer]:
          - img
        - button "User menu" [ref=e208] [cursor=pointer]:
          - img "User menu" [ref=e212]: BA
    - generic [ref=e213]:
      - navigation "Side Menu" [ref=e214]:
        - button "Collapse project menu" [expanded] [ref=e216] [cursor=pointer]:
          - img [ref=e218]
        - generic [ref=e220]:
          - generic [ref=e221]:
            - generic [ref=e222]:
              - button "Bench Project" [ref=e224] [cursor=pointer]:
                - generic [ref=e225]:
                  - generic [ref=e226]: Bench Project
                  - generic:
                    - img
              - button "Collapse project menu" [expanded] [ref=e228] [cursor=pointer]:
                - img
            - separator [ref=e229]
          - list [ref=e230]:
            - listitem [ref=e231]:
              - generic [ref=e232]:
                - link "Go back one menu level" [ref=e233] [cursor=pointer]:
                  - /url: "#"
                  - img [ref=e234]
                - link "Work packages" [ref=e236] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/projects/bench-project/work_packages
              - list [ref=e237]:
                - listitem [ref=e238]:
                  - generic [ref=e240]:
                    - generic [ref=e242]:
                      - generic [ref=e243]: Search
                      - generic [ref=e244]:
                        - generic:
                          - img
                        - textbox "Search" [ref=e245]:
                          - /placeholder: Search by name
                    - generic [ref=e247]:
                      - button "Default" [ref=e248] [cursor=pointer]:
                        - text: Default
                        - generic [ref=e249]: 
                      - list [ref=e250]:
                        - listitem [ref=e251]:
                          - link "All open" [ref=e252] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?work_package_default=true
                            - generic [ref=e253]: All open
                        - listitem [ref=e254]:
                          - link "Latest activity" [ref=e255] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=latest_activity&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22%2A%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e256]: Latest activity
                        - listitem [ref=e257]:
                          - link "Recently created" [ref=e258] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=recently_created&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22createdAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22createdAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e259]: Recently created
                        - listitem [ref=e260]:
                          - link "Overdue" [ref=e261] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=overdue&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22createdAt%3Adesc%22%2C%22c%22%3A%5B%22id%22%2C%22type%22%2C%22subject%22%2C%22status%22%2C%22startDate%22%2C%22dueDate%22%2C%22duration%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22dueDate%22%2C%22o%22%3A%22%5Cu003ct-%22%2C%22v%22%3A%5B%221%22%5D%7D%2C%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e262]: Overdue
                        - listitem [ref=e263]:
                          - link "Summary" [ref=e264] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages/report?name=summary
                            - generic [ref=e265]: Summary
                        - listitem [ref=e266]:
                          - link "Created by me" [ref=e267] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=created_by_me&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%2Cid%3Aasc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22author%22%2C%22o%22%3A%22%3D%22%2C%22v%22%3A%5B%22me%22%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e268]: Created by me
                        - listitem [ref=e269]:
                          - link "Assigned to me" [ref=e270] [cursor=pointer]:
                            - /url: /projects/bench-project/work_packages?name=assigned_to_me&query_props=%7B%22g%22%3A%22%22%2C%22hi%22%3Afalse%2C%22t%22%3A%22updatedAt%3Adesc%2Cid%3Aasc%22%2C%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22author%22%2C%22updatedAt%22%5D%2C%22f%22%3A%5B%7B%22n%22%3A%22status%22%2C%22o%22%3A%22o%22%2C%22v%22%3A%5B%5D%7D%2C%7B%22n%22%3A%22assigneeOrGroup%22%2C%22o%22%3A%22%3D%22%2C%22v%22%3A%5B%22me%22%5D%7D%5D%7D&show_enterprise_icon=false
                            - generic [ref=e271]: Assigned to me
                        - listitem [ref=e272]:
                          - link "Shared with users Enterprise edition" [ref=e273] [cursor=pointer]:
                            - /url: /work_packages/share_upsell?name=shared_with_users
                            - generic [ref=e274]:
                              - text: Shared with users
                              - img "Enterprise edition" [ref=e275]
                        - listitem [ref=e277]:
                          - link "Shared with me Enterprise edition" [ref=e278] [cursor=pointer]:
                            - /url: /work_packages/share_upsell?name=shared_with_me
                            - generic [ref=e279]:
                              - text: Shared with me
                              - img "Enterprise edition" [ref=e280]
      - main [ref=e282]:
        - generic [ref=e283]:
          - heading "Content" [level=1] [ref=e284]
          - generic [ref=e293]:
            - navigation "Breadcrumb" [ref=e296]:
              - list [ref=e297]:
                - listitem [ref=e298]:
                  - link "Bench Project" [ref=e301] [cursor=pointer]:
                    - /url: /projects/bench-project
                - listitem [ref=e302]:
                  - link "Work packages" [ref=e305] [cursor=pointer]:
                    - /url: /projects/bench-project/work_packages
                - listitem [ref=e306]:
                  - 'link "Default: Work packages" [ref=e309] [cursor=pointer]':
                    - /url: "#"
            - generic [ref=e311]:
              - heading "Work packages" [level=2] [ref=e312]:
                - generic [ref=e314]:
                  - button "This view has unsaved changes. Click to save them." [ref=e315] [cursor=pointer]:
                    - generic [ref=e317]: 
                  - textbox "Click to edit title of this view. Press enter to save." [ref=e318]:
                    - /placeholder: Name of this view
                    - text: Work packages
              - list [ref=e319]:
                - listitem [ref=e320]:
                  - button "Create new work package" [ref=e323] [cursor=pointer]:
                    - img [ref=e324]
                    - generic [ref=e326]: Create
                    - img [ref=e327]
                - listitem [ref=e329]:
                  - generic [ref=e331]:
                    - button "Include projects 1" [ref=e332] [cursor=pointer]:
                      - text: Include projects
                      - generic [ref=e333]: "1"
                      - img [ref=e334]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e336]:
                  - generic [ref=e338]:
                    - button "Baseline" [ref=e339] [cursor=pointer]:
                      - img [ref=e340]
                      - generic [ref=e343]: Baseline
                      - img [ref=e344]
                    - note "This is a focus anchor for modals. Press shift+tab to go back to the modal trigger element."
                - listitem [ref=e346]:
                  - button "Deactivate Filter" [ref=e348] [cursor=pointer]:
                    - generic [ref=e350]: 
                    - generic [ref=e351]:
                      - text: Filter
                      - generic [ref=e352]: "0"
                    - img [ref=e353]
                - listitem [ref=e355]:
                  - button "Close details view" [ref=e357] [cursor=pointer]:
                    - generic [ref=e359]: 
                - listitem:
                  - generic:
                    - list
                - listitem [ref=e360]:
                  - button "Activate zen mode" [ref=e362] [cursor=pointer]:
                    - generic [ref=e364]: 
                - listitem [ref=e365]:
                  - button "More actions" [ref=e367] [cursor=pointer]:
                    - generic [ref=e369]: 
            - group "Selected filters" [ref=e375]:
              - generic [ref=e376]: Selected filters
              - button "Close form" [ref=e378] [cursor=pointer]:
                - img
              - list [ref=e379]:
                - listitem [ref=e380]:
                  - generic "Filter by text" [ref=e381]
                  - textbox "Filter by text" [ref=e384]:
                    - /placeholder: Subject, description, comments, ...
                - listitem [ref=e385]
                - listitem [ref=e386]:
                  - generic [ref=e387]:
                    - generic [ref=e389]: 
                    - text: "Add filter:"
                  - generic [ref=e390]: Add filter Open this filter with 'ALT' and arrow keys. To select an entry leave the focus for example by pressing enter. To leave without filter select the first (empty) entry.
                  - generic [ref=e392]:
                    - generic [ref=e394]:
                      - generic [ref=e395]: Please select
                      - combobox [ref=e397]
                    - status [ref=e399]
            - generic [ref=e400]:
              - generic [ref=e402]:
                - generic [ref=e404]:
                  - table "Table with rows of work package and columns of work package attributes.Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns." [ref=e406]:
                    - caption [ref=e416]:
                      - text: Table with rows of work package and columns of work package attributes.
                      - text: Most cells of this table are buttons that activate inline-editing functionality of that attribute. Select boxes should be opened with 'ALT' and arrow keys. With the links in the table headers you can sort, group, reorder, remove and add table columns.
                    - rowgroup [ref=e417]:
                      - row "ID Subject Type Status Assignee Priority" [ref=e418]:
                        - columnheader [ref=e419]
                        - columnheader "ID" [ref=e421]:
                          - generic [ref=e424]:
                            - link "ID" [ref=e425] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e427]: Open menu
                        - columnheader "Subject" [ref=e428]:
                          - generic [ref=e431]:
                            - generic [ref=e434] [cursor=pointer]: 
                            - link "Subject" [ref=e435] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e437]: Open menu
                        - columnheader "Type" [ref=e438]:
                          - generic [ref=e441]:
                            - link "Type" [ref=e442] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e444]: Open menu
                        - columnheader "Status" [ref=e445]:
                          - generic [ref=e448]:
                            - link "Status" [ref=e449] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e451]: Open menu
                        - columnheader "Assignee" [ref=e452]:
                          - generic [ref=e455]:
                            - link "Assignee" [ref=e456] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e458]: Open menu
                        - columnheader "Priority" [ref=e459]:
                          - generic [ref=e462]:
                            - link "Priority" [ref=e463] [cursor=pointer]:
                              - /url: "#"
                            - generic [ref=e465]: Open menu
                        - columnheader [ref=e466]:
                          - button "Configure view" [ref=e469] [cursor=pointer]:
                            - generic [ref=e471]: 
                    - rowgroup [ref=e472]:
                      - 'row " id 38 Work package leaf at level 0. Subject Seed: triage inbox: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e473] [cursor=pointer]':
                        - cell "" [ref=e474]:
                          - generic [ref=e475]: 
                        - cell "id 38" [ref=e476]:
                          - generic "id 38" [ref=e478]:
                            - link "38" [ref=e479]:
                              - /url: /projects/bench-project/work_packages/38/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: triage inbox: Edit" [ref=e480]':
                          - generic [ref=e482]: Work package leaf at level 0.
                          - 'button "Subject Seed: triage inbox: Edit" [ref=e484]': "Seed: triage inbox"
                        - 'cell "Type Task: Edit" [ref=e485]':
                          - 'button "Type Task: Edit" [ref=e487]': Task
                        - 'cell "Status New: Edit" [ref=e488]':
                          - 'button "Status New: Edit" [ref=e490]': New
                        - 'cell "Assignee No value: Edit" [ref=e491]':
                          - 'button "Assignee No value: Edit" [ref=e493]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e494]':
                          - 'button "Priority Normal: Edit" [ref=e496]': Normal
                        - cell "Open details view Open context menu" [ref=e497]:
                          - generic [ref=e498]:
                            - link "Open details view" [ref=e499]:
                              - /url: /projects/bench-project/work_packages/details/38/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e500]: 
                            - link "Open context menu" [ref=e501]:
                              - /url: "#"
                              - generic [ref=e502]: 
                      - 'row " id 39 Work package leaf at level 0. Subject Seed: order missing parts: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e503] [cursor=pointer]':
                        - cell "" [ref=e504]:
                          - generic [ref=e505]: 
                        - cell "id 39" [ref=e506]:
                          - generic "id 39" [ref=e508]:
                            - link "39" [ref=e509]:
                              - /url: /projects/bench-project/work_packages/39/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: order missing parts: Edit" [ref=e510]':
                          - generic [ref=e512]: Work package leaf at level 0.
                          - 'button "Subject Seed: order missing parts: Edit" [ref=e514]': "Seed: order missing parts"
                        - 'cell "Type Task: Edit" [ref=e515]':
                          - 'button "Type Task: Edit" [ref=e517]': Task
                        - 'cell "Status New: Edit" [ref=e518]':
                          - 'button "Status New: Edit" [ref=e520]': New
                        - 'cell "Assignee No value: Edit" [ref=e521]':
                          - 'button "Assignee No value: Edit" [ref=e523]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e524]':
                          - 'button "Priority Normal: Edit" [ref=e526]': Normal
                        - cell "Open details view Open context menu" [ref=e527]:
                          - generic [ref=e528]:
                            - link "Open details view" [ref=e529]:
                              - /url: /projects/bench-project/work_packages/details/39/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e530]: 
                            - link "Open context menu" [ref=e531]:
                              - /url: "#"
                              - generic [ref=e532]: 
                      - 'row " id 40 Work package leaf at level 0. Subject Seed: ship repaired device: Edit Type Task: Edit Status New: Edit Assignee No value: Edit Priority Normal: Edit Open details view Open context menu" [ref=e533] [cursor=pointer]':
                        - cell "" [ref=e534]:
                          - generic [ref=e535]: 
                        - cell "id 40" [ref=e536]:
                          - generic "id 40" [ref=e538]:
                            - link "40" [ref=e539]:
                              - /url: /projects/bench-project/work_packages/40/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject Seed: ship repaired device: Edit" [ref=e540]':
                          - generic [ref=e542]: Work package leaf at level 0.
                          - 'button "Subject Seed: ship repaired device: Edit" [ref=e544]': "Seed: ship repaired device"
                        - 'cell "Type Task: Edit" [ref=e545]':
                          - 'button "Type Task: Edit" [ref=e547]': Task
                        - 'cell "Status New: Edit" [ref=e548]':
                          - 'button "Status New: Edit" [ref=e550]': New
                        - 'cell "Assignee No value: Edit" [ref=e551]':
                          - 'button "Assignee No value: Edit" [ref=e553]': "-"
                        - 'cell "Priority Normal: Edit" [ref=e554]':
                          - 'button "Priority Normal: Edit" [ref=e556]': Normal
                        - cell "Open details view Open context menu" [ref=e557]:
                          - generic [ref=e558]:
                            - link "Open details view" [ref=e559]:
                              - /url: /projects/bench-project/work_packages/details/40/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e560]: 
                            - link "Open context menu" [ref=e561]:
                              - /url: "#"
                              - generic [ref=e562]: 
                      - 'row " id 44 Work package leaf at level 0. Subject fwop21-spec Bench Work Package: Edit Type Task: Edit Status In progress: Edit Assignee Bench Assignee: Edit Priority Normal: Edit Open details view Open context menu" [ref=e563] [cursor=pointer]':
                        - cell "" [ref=e564]:
                          - generic [ref=e565]: 
                        - cell "id 44" [ref=e566]:
                          - generic "id 44" [ref=e568]:
                            - link "44" [ref=e569]:
                              - /url: /projects/bench-project/work_packages/44/activity?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                        - 'cell "Work package leaf at level 0. Subject fwop21-spec Bench Work Package: Edit" [ref=e570]':
                          - generic [ref=e572]: Work package leaf at level 0.
                          - 'button "Subject fwop21-spec Bench Work Package: Edit" [ref=e574]': fwop21-spec Bench Work Package
                        - 'cell "Type Task: Edit" [ref=e575]':
                          - 'button "Type Task: Edit" [ref=e577]': Task
                        - 'cell "Status In progress: Edit" [ref=e578]':
                          - 'button "Status In progress: Edit" [ref=e580]': In progress
                        - 'cell "Assignee Bench Assignee: Edit" [ref=e581]':
                          - 'button "Assignee Bench Assignee: Edit" [ref=e583]':
                            - generic [ref=e584]: BA
                            - text: Bench Assignee
                        - 'cell "Priority Normal: Edit" [ref=e585]':
                          - 'button "Priority Normal: Edit" [ref=e587]': Normal
                        - cell "Open details view Open context menu" [ref=e588]:
                          - generic [ref=e589]:
                            - link "Open details view" [ref=e590]:
                              - /url: /projects/bench-project/work_packages/details/44/overview?query_props=%7B%22c%22%3A%5B%22id%22%2C%22subject%22%2C%22type%22%2C%22status%22%2C%22assignee%22%2C%22priority%22%5D%2C%22hi%22%3Atrue%2C%22g%22%3A%22%22%2C%22is%22%3Atrue%2C%22tv%22%3Afalse%2C%22hla%22%3A%5B%22status%22%2C%22priority%22%2C%22dueDate%22%5D%2C%22t%22%3A%22id%3Aasc%22%2C%22f%22%3A%5B%5D%2C%22ts%22%3A%22PT0S%22%2C%22pp%22%3A20%2C%22pa%22%3A1%7D
                              - generic [ref=e591]: 
                            - link "Open context menu" [ref=e592]:
                              - /url: "#"
                              - generic [ref=e593]: 
                    - rowgroup
                    - rowgroup [ref=e594]:
                      - row "Create new work package" [ref=e595]:
                        - cell "Create new work package" [ref=e596]:
                          - button "Create new work package" [ref=e597] [cursor=pointer]:
                            - img [ref=e598]
                            - generic [ref=e600]: Create new work package
                  - generic [ref=e601]: 
                - navigation "Pagination navigation" [ref=e605]:
                  - text: (1 - 4/4)
                  - generic [ref=e606]: You are on the only page.
              - generic [ref=e609]:
                - generic [ref=e612]:
                  - generic [ref=e613]:
                    - list [ref=e614]:
                      - listitem [ref=e615] [cursor=pointer]:
                        - tab "Overview" [selected] [ref=e616]
                      - listitem [ref=e617] [cursor=pointer]:
                        - tab "Activity" [ref=e618]
                      - listitem [ref=e619] [cursor=pointer]:
                        - tab "Files" [ref=e620]
                      - listitem [ref=e621] [cursor=pointer]:
                        - tab "Relations" [ref=e622]
                      - listitem [ref=e623] [cursor=pointer]:
                        - tab "Wikis" [ref=e624]
                      - listitem [ref=e625] [cursor=pointer]:
                        - tab "Meetings" [ref=e626]
                      - listitem [ref=e627] [cursor=pointer]:
                        - tab "Watchers (1)" [ref=e628]
                    - text: 
                    - button "" [ref=e629] [cursor=pointer]:
                      - generic [ref=e630]: 
                  - list [ref=e631]:
                    - listitem [ref=e632]:
                      - button "Show fullscreen view" [ref=e633] [cursor=pointer]:
                        - generic [ref=e635]: 
                    - listitem [ref=e636]:
                      - button "Close details view" [ref=e637] [cursor=pointer]:
                        - generic [ref=e639]: 
                - generic [ref=e640]:
                  - generic [ref=e641]: You are on the Overview tab for Task fwop21-spec Bench Work Package.
                  - generic [ref=e642]:
                    - generic [ref=e644]:
                      - list [ref=e647]:
                        - listitem [ref=e648]:
                          - button "Set parent" [ref=e650] [cursor=pointer]:
                            - generic [ref=e651]: Set parent
                            - generic [ref=e653]: 
                      - generic [ref=e655]:
                        - 'button "Type Task: Edit" [ref=e660]': Task
                        - 'button "Subject fwop21-spec Bench Work Package: Edit" [ref=e665]': fwop21-spec Bench Work Package
                    - generic [ref=e670]:
                      - generic [ref=e671]:
                        - button "Edit the status of the work package" [ref=e674] [cursor=pointer]:
                          - generic [ref=e675]: In progress
                          - generic [ref=e677]: 
                        - generic [ref=e678]:
                          - text: "#44: Created by"
                          - generic [ref=e679]: Bench Admin
                          - text: . Last updated on
                          - generic "09/26/2026 9:43 AM" [ref=e681]
                          - text: .
                      - 'button "Description Bench work package for run fwop21-spec: Edit" [ref=e687]':
                        - paragraph [ref=e689]: Bench work package for run fwop21-spec
                      - generic [ref=e690]:
                        - heading "People" [level=3] [ref=e693]
                        - generic [ref=e694]:
                          - generic [ref=e695]:
                            - button "Assignee" [ref=e698]
                            - 'button "Assignee Bench Assignee: Edit" [ref=e704]':
                              - generic [ref=e705]: BA
                              - generic "Bench Assignee" [ref=e706]
                          - generic [ref=e707]:
                            - button "Accountable" [ref=e710]
                            - 'button "Accountable No value: Edit" [ref=e716]': "-"
                      - generic [ref=e717]:
                        - heading "Estimates and progress" [level=3] [ref=e720]
                        - generic [ref=e721]:
                          - generic [ref=e722]:
                            - button "Work" [ref=e725]
                            - 'button "Work No value: Edit" [ref=e731]': "-"
                          - generic [ref=e732]:
                            - button "Remaining work" [ref=e735]
                            - 'button "Remaining work No value: Edit" [ref=e741]': "-"
                          - generic [ref=e742]:
                            - button "% Complete" [ref=e745]
                            - 'button "% Complete No value: Edit" [ref=e751]': "-"
                          - generic [ref=e752]:
                            - button "Spent time" [ref=e755]
                            - generic "Spent time 0h" [ref=e761]:
                              - link "0h" [ref=e762] [cursor=pointer]:
                                - /url: /projects/bench-project/cost_reports?fields[]=WorkPackageId&operators[WorkPackageId]=%3D_child_work_packages&values[WorkPackageId]=44&set_filter=1
                              - link "" [ref=e763] [cursor=pointer]:
                                - /url: ""
                          - generic [ref=e764]:
                            - button "Story Points" [ref=e767]
                            - 'button "Story Points No value: Edit" [ref=e773]': "-"
                      - generic [ref=e774]:
                        - heading "Details" [level=3] [ref=e777]
                        - generic [ref=e778]:
                          - generic [ref=e779]:
                            - button "Priority *" [ref=e782]
                            - 'button "Priority Normal: Edit" [ref=e788]': Normal
                          - generic [ref=e789]:
                            - button "Sprint" [ref=e792]
                            - 'button "Sprint No value: Edit" [ref=e798]': "-"
                          - generic [ref=e799]:
                            - button "Backlog bucket" [ref=e802]
                            - 'button "Backlog bucket No value: Edit" [ref=e808]': "-"
                          - generic [ref=e809]:
                            - button "Target versions" [ref=e812]
                            - 'button "Target versions No value: Edit" [ref=e818]': "-"
                          - generic [ref=e819]:
                            - button "Category" [ref=e822]
                            - 'button "Category No value: Edit" [ref=e828]': "-"
                          - generic [ref=e829]:
                            - button "Date" [ref=e832]
                            - form [ref=e840]:
                              - generic [ref=e841]: Start date
                              - textbox [ref=e843]: no start date - no finish date
                      - generic [ref=e844]:
                        - heading "Other" [level=3] [ref=e847]
                        - generic [ref=e849]:
                          - button "Position" [ref=e852]
                          - generic "Position 4" [ref=e858]: "4"
                      - generic [ref=e859]:
                        - heading "Costs" [level=3] [ref=e862]
                        - generic [ref=e864]:
                          - button "Labor costs" [ref=e867]
                          - generic "Labor costs No value" [ref=e873]: "-"
                - generic [ref=e876]:
                  - button "Unwatch work package" [ref=e878] [cursor=pointer]:
                    - img [ref=e879]
                  - button "Share" [ref=e882] [cursor=pointer]:
                    - img [ref=e883]
                    - img [ref=e885]
                  - button "Set reminder" [ref=e888] [cursor=pointer]:
                    - img [ref=e889]
                  - button "More" [ref=e892] [cursor=pointer]:
                    - img [ref=e893]
                - generic [ref=e895]: 
```

# Test source

```ts
  16537 |  * page's snapshot lines (capturePageLines — role, name, state and the value
  16538 |  * after the colon, so a marker that is only an <input>'s VALUE on a form in
  16539 |  * edit mode is seen, where `getByText` never could: cloud run sp5odb died on
  16540 |  * exactly that), read by lineShows. Two halves, and both are load-bearing.
  16541 |  * The IDENTITY texts say the page is showing THIS record — the url and the
  16542 |  * page shape only ever say "a page of this template" — and take the bounded
  16543 |  * rule (`whole`: `fwgr25-n1` is not satisfied by `fwgr25-n10`); the GOAL
  16544 |  * texts say that record is already in the state this step exists to
  16545 |  * produce, and are a plain substring, exactly as goalSatisfied splits them.
  16546 |  * Identity alone would skip a step because the right record is open; a goal
  16547 |  * alone would skip it because some OTHER record happens to read "Cancelled".
  16548 |  *
  16549 |  * Both halves being on the PAGE is not enough, which is why the record-scope
  16550 |  * check follows (scopeCheckInPage, the daemon's own, run in the page): on a
  16551 |  * list, "Order A" and "Cancelled" are both present when it is order B that
  16552 |  * was cancelled. They have to hold of the same record.
  16553 |  *
  16554 |  * Conservative by construction: no goal, no identity, or a page that cannot
  16555 |  * be read — or a look that could not cover it (captureLines, dialect 2: a
  16556 |  * cap reached, a visible frame unread, a virtualised list) — is never
  16557 |  * satisfied. Being wrong the other way costs one re-run of a step that had
  16558 |  * already happened; being wrong THIS way skips work that never happened.
  16559 |  */
  16560 | async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {
  16561 |   if (!identity.length || !goal.length) return false;
  16562 |   const captured = await captureLines(page, 2);
  16563 |   if (!captured || !captured.complete) return false;
  16564 |   const lines = captured.lines;
  16565 |   for (const want of identity) {
  16566 |     if (!lineShows(lines, [want], { whole: true })) return false;
  16567 |   }
  16568 |   for (const want of goal) {
  16569 |     if (!lineShows(lines, [want])) return false;
  16570 |   }
  16571 |   try {
  16572 |     // The identity half goes in as regex SOURCE: scopeCheckInPage is
  16573 |     // serialised into the page, so it cannot call identityRe there.
  16574 |     return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });
  16575 |   } catch {
  16576 |     // A page that cannot be evaluated has proven nothing. Run the step.
  16577 |     return false;
  16578 |   }
  16579 | }
  16580 | 
  16581 | /**
  16582 |  * How long a recorded page change has to appear: Playwright's own expect
  16583 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  16584 |  */
  16585 | const EXPECT_WAIT_MS = 5_000;
  16586 | 
  16587 | /**
  16588 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  16589 |  *
  16590 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  16591 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  16592 |  * function, not a reading of it. The lines carrying this run's own values are
  16593 |  * HARD, the rest are a plain group; either is looked for first in the lines
  16594 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  16595 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  16596 |  * role, name, state, and the value after the colon. The AFTER capture is
  16597 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  16598 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  16599 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  16600 |  * as it settled, routed to the record and re-rendered the row, and the
  16601 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  16602 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  16603 |  * An earlier cut of this
  16604 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  16605 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  16606 |  * passed on any visible Project combobox whatever it showed. Polled for
  16607 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  16608 |  * once, so the artifact is the more patient of the two, never the looser.
  16609 |  *
  16610 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  16611 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  16612 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  16613 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  16614 |  * step body, which remembers it for the steps that were going to act inside.
  16615 |  */
  16616 | async function expectChanges(
  16617 |   page: Page,
  16618 |   recorded: string[],
  16619 |   p: Record<string, string>,
  16620 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  16621 |   linesBefore: string[] | null,
  16622 |   dialect: LineDialect = 1,
  16623 |   linesAfter: string[] | null = null,
  16624 | ): Promise<ChangeVerdict> {
  16625 |   let last: ChangeVerdict = { warnings: [] };
  16626 |   await expect
  16627 |     .poll(
  16628 |       async () => {
  16629 |         last = await expectedChangesVerdict(recorded, p, ctx, {
  16630 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  16631 |           live: (look) => captureLines(page, dialect, look),
  16632 |         });
  16633 |         return last.stop ?? null;
  16634 |       },
  16635 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  16636 |     )
> 16637 |     .toBeNull();
        |      ^ Error: 06-open s_9c9088/3: the recorded page change did not appear
  16638 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  16639 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  16640 |   return last;
  16641 | }
  16642 | 
  16643 | /**
  16644 |  * Is this step one that was going to act inside a dialog that did not open?
  16645 |  *
  16646 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, while a recorded dialog is
  16647 |  * absent (see ChangeVerdict.absentDialog): a step whose target cannot be
  16648 |  * found AND which names one of that dialog's own controls — namesDialogControl,
  16649 |  * the shared rule, proven against the dialog's recorded subtree — is skipped as
  16650 |  * belonging to it. A step that resolves its target, or misses without naming
  16651 |  * anything the dialog listed, is the procedure's own and runs (and fails) as
  16652 |  * such; the caller clears the remembered dialog either way. A minting step is
  16653 |  * never skipped, because skipping a mutation cannot be undone: the caller
  16654 |  * emits none of this for one. The one look at the candidates here is what
  16655 |  * replay's resolve window becomes on a page `settle` has already let go quiet.
  16656 |  */
  16657 | async function absentDialogSkip(
  16658 |   candidates: Locator[],
  16659 |   locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>,
  16660 |   dialog: { name: string; lines: string[] },
  16661 |   p: Record<string, string>,
  16662 |   where: string,
  16663 | ): Promise<boolean> {
  16664 |   const inside = namesDialogControl({ locators }, dialog.lines, p);
  16665 |   if (inside === null) return false;
  16666 |   for (const candidate of candidates) if ((await candidate.count().catch(() => 0)) > 0) return false;
  16667 |   console.log(`[sitelooper skip] ${where}: acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(dialog.name)}, which did not open — skipped`);
  16668 |   return true;
  16669 | }
  16670 | 
  16671 | /**
  16672 |  * Is this step a dismissal of a dialog that is not open — already in effect?
  16673 |  *
  16674 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, on a target that did not
  16675 |  * resolve in its window: a step recorded closing a dialog (and doing nothing
  16676 |  * else) whose dialog is not on the page is skipped — the shared
  16677 |  * dismissalAlreadyInEffect decides, over the same recorded removals and a
  16678 |  * look in the step's dialect. Replay asks after its resolve window, so this
  16679 |  * waits the same window for a VISIBLE target first (a modal library keeps a
  16680 |  * closed dialog, Close button and all, hidden in the DOM): a target that
  16681 |  * shows up is acted on by the pick below as usual, and a false return leaves
  16682 |  * that pick to report the miss exactly as it would have.
  16683 |  */
  16684 | async function dismissalSkip(
  16685 |   page: Page,
  16686 |   candidates: Locator[],
  16687 |   step: { locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>; expect: { removedContains: string[] } },
  16688 |   p: Record<string, string>,
  16689 |   where: string,
  16690 |   dialect: LineDialect = 1,
  16691 | ): Promise<boolean> {
  16692 |   for (let waited = 0; ; waited += RESOLVE_POLL_MS) {
  16693 |     for (const candidate of candidates) {
  16694 |       const n = await candidate.count().catch(() => 0);
  16695 |       for (let i = 0; i < Math.min(n, 5); i++) if (await candidate.nth(i).isVisible().catch(() => false)) return false;
  16696 |     }
  16697 |     if (waited >= RESOLVE_WAIT_MS) break;
  16698 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  16699 |   }
  16700 |   const done = dismissalAlreadyInEffect(step, await captureLines(page, dialect), p);
  16701 |   if (!done) return false;
  16702 |   console.log(`[sitelooper skip] ${where}: closes the dialog ${JSON.stringify(done.dialog)} with ${JSON.stringify(done.control)}, which is not open — already in effect`);
  16703 |   return true;
  16704 | }
  16705 | 
  16706 | /**
  16707 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  16708 |  * after its targets resolve: a click whose identifying rungs ALL missed
  16709 |  * (`hit` positional, or null when nothing resolved) is — the shared
  16710 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  16711 |  * every line it was recorded adding already shows (`lines`, the shared
  16712 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  16713 |  * stopped when a positional rung took it onto an element without the
  16714 |  * recorded accessible name. True means skipped; a stop throws.
  16715 |  */
  16716 | async function positionalClick(
  16717 |   page: Page,
  16718 |   hit: Resolution | null,
  16719 |   identifying: number[],
  16720 |   points: number[],
  16721 |   lines: string[],
  16722 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  16723 |   p: Record<string, string>,
  16724 |   where: string,
  16725 |   dialect: LineDialect = 1,
  16726 | ): Promise<boolean> {
  16727 |   const verdict = await positionalClickVerdict(
  16728 |     page,
  16729 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  16730 |     identifying,
  16731 |     lines,
  16732 |     want,
  16733 |     p,
  16734 |     dialect,
  16735 |   );
  16736 |   if (verdict && 'skip' in verdict) {
  16737 |     logWarning(`${where}: ${verdict.skip}`);
```