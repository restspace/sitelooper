# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwop15-cv4.spec.ts >> fwop15-cv4
- Location: fwop15-cv4.spec.ts:9:1

# Error details

```
Error: 01-open s_fbd2c0/4: the recorded page change did not appear

01-open s_fbd2c0/4: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 01-open s_fbd2c0/4 the page did not show \"- dialog \\\"Welcome to OpenProject, Bench Admin\\\"\" as it did when recorded — the step ran but probably acted on the wrong element"

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
              - button "All projects" [ref=e57] [cursor=pointer]:
                - generic [ref=e58]:
                  - generic [ref=e59]: All projects
                  - generic:
                    - img
              - button "Collapse project menu" [expanded] [ref=e61] [cursor=pointer]:
                - img
            - separator [ref=e62]
          - list [ref=e63]:
            - listitem [ref=e64]:
              - link "Home" [ref=e65] [cursor=pointer]:
                - /url: http://127.0.0.1:8090/
                - img [ref=e66]
                - generic [ref=e69]: Home
            - listitem [ref=e70]:
              - link "My page" [ref=e71] [cursor=pointer]:
                - /url: http://127.0.0.1:8090/my/page
                - img [ref=e72]
                - generic [ref=e75]: My page
            - listitem [ref=e76]:
              - link "My time tracking" [ref=e77] [cursor=pointer]:
                - /url: http://127.0.0.1:8090/my/time-tracking/today
                - img [ref=e78]
                - generic [ref=e81]: My time tracking
            - listitem [ref=e82]:
              - link "Portfolios" [ref=e83] [cursor=pointer]:
                - /url: http://127.0.0.1:8090/portfolios
                - img [ref=e84]
                - generic [ref=e86]:
                  - generic [ref=e87]: Portfolios
                  - img [ref=e88]
            - listitem [ref=e90]:
              - generic [ref=e91]:
                - link "Projects" [ref=e92] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/projects
                  - img [ref=e93]
                  - generic [ref=e96]: Projects
                - button "Open Projects sub-menu" [ref=e97] [cursor=pointer]:
                  - img [ref=e98]
            - listitem [ref=e100]:
              - generic [ref=e101]:
                - link "Work packages" [ref=e102] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/work_packages
                  - img [ref=e103]
                  - generic [ref=e107]: Work packages
                - button "Open Work packages sub-menu" [ref=e108] [cursor=pointer]:
                  - img [ref=e109]
            - listitem [ref=e111]:
              - generic [ref=e112]:
                - link "Gantt charts" [ref=e113] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/gantt
                  - img [ref=e114]
                  - generic [ref=e118]: Gantt charts
                - button "Open Gantt charts sub-menu" [ref=e119] [cursor=pointer]:
                  - img [ref=e120]
            - listitem [ref=e122]:
              - link "Team planners" [ref=e123] [cursor=pointer]:
                - /url: http://127.0.0.1:8090/team_planners
                - img [ref=e124]
                - generic [ref=e126]:
                  - generic [ref=e127]: Team planners
                  - img [ref=e128]
            - listitem [ref=e130]:
              - link "Boards" [ref=e131] [cursor=pointer]:
                - /url: http://127.0.0.1:8090/boards
                - img [ref=e132]
                - generic [ref=e135]: Boards
            - listitem [ref=e136]:
              - generic [ref=e137]:
                - link "Meetings" [ref=e138] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/meetings
                  - img [ref=e139]
                  - generic [ref=e142]: Meetings
                - button "Open Meetings sub-menu" [ref=e143] [cursor=pointer]:
                  - img [ref=e144]
            - listitem [ref=e146]:
              - link "News" [ref=e147] [cursor=pointer]:
                - /url: http://127.0.0.1:8090/news
                - img [ref=e148]
                - generic [ref=e153]: News
            - listitem [ref=e154]:
              - generic [ref=e155]:
                - link "Time and costs" [ref=e156] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/cost_reports
                  - img [ref=e157]
                  - generic [ref=e161]: Time and costs
                - button "Open Time and costs sub-menu" [ref=e162] [cursor=pointer]:
                  - img [ref=e163]
            - listitem [ref=e165]:
              - generic [ref=e166]:
                - link "Wiki" [ref=e167] [cursor=pointer]:
                  - /url: http://127.0.0.1:8090/wiki_pages
                  - img [ref=e168]
                  - generic [ref=e171]: Wiki
                - button "Open Wiki sub-menu" [ref=e172] [cursor=pointer]:
                  - img [ref=e173]
      - main [ref=e175]:
        - generic [ref=e176]:
          - heading "Content" [level=1] [ref=e177]
          - generic [ref=e178]:
            - heading "OpenProject" [level=2] [ref=e181]
            - generic [ref=e182]:
              - generic [ref=e183]:
                - heading "Welcome to OpenProject!" [level=3] [ref=e186]
                - generic [ref=e189]:
                  - paragraph [ref=e190]: OpenProject is the leading open source project management software. It supports classic, agile as well as hybrid project management and gives you full control over your data.
                  - paragraph [ref=e191]: "Core features and use cases:"
                  - list [ref=e192]:
                    - listitem [ref=e193]:
                      - link "Project Portfolio Management" [ref=e194] [cursor=pointer]:
                        - /url: https://www.openproject.org/collaboration-software-features/project-portfolio-management/
                    - listitem [ref=e195]:
                      - link "Project Planning and Scheduling" [ref=e196] [cursor=pointer]:
                        - /url: https://www.openproject.org/collaboration-software-features/project-planning-scheduling/
                    - listitem [ref=e197]:
                      - link "Task Management and Issue Tracking" [ref=e198] [cursor=pointer]:
                        - /url: https://www.openproject.org/collaboration-software-features/task-management/
                    - listitem [ref=e199]:
                      - link "Agile Boards (Scrum and Kanban)" [ref=e200] [cursor=pointer]:
                        - /url: https://www.openproject.org/collaboration-software-features/agile-project-management/
                    - listitem [ref=e201]:
                      - link "Requirements Management and Release Planning" [ref=e202] [cursor=pointer]:
                        - /url: https://www.openproject.org/collaboration-software-features/product-development/
                    - listitem [ref=e203]:
                      - link "Time and Cost Tracking, Budgets" [ref=e204] [cursor=pointer]:
                        - /url: https://www.openproject.org/collaboration-software-features/time-tracking/
                    - listitem [ref=e205]:
                      - link "Team Collaboration and Documentation" [ref=e206] [cursor=pointer]:
                        - /url: https://www.openproject.org/collaboration-software-features/team-collaboration/
                  - paragraph [ref=e207]: Welcome to the future of project management.
                  - paragraph [ref=e208]:
                    - text: "For Admins: You can change this welcome text"
                    - link "here" [ref=e209] [cursor=pointer]:
                      - /url: http://127.0.0.1:8090/admin/settings/general
                    - text: .
              - generic [ref=e210]:
                - heading "Favorite projects" [level=3] [ref=e213]
                - generic [ref=e217]:
                  - img [ref=e218]
                  - heading "You have no favorite projects" [level=3] [ref=e221]
                  - paragraph [ref=e222]: Add one or multiple projects as favorite through their overview or in a project list.
              - generic [ref=e223]:
                - heading "New features" [level=3] [ref=e226]
                - generic [ref=e229]:
                  - paragraph [ref=e230]: Read about new features and product updates.
                  - generic [ref=e232]:
                    - paragraph [ref=e233]: "The release contains various new features and improvements, such as:"
                    - list [ref=e234]:
                      - listitem [ref=e235]:  AI-assisted actions on work packages, comments, and relations with the MCP Server (Professional plan).
                      - listitem [ref=e236]:  Multiple target versions for work packages.
                      - listitem [ref=e237]:  Global limits and restrictions for time entries (Professional plan).
                      - listitem [ref=e238]:  Agile improvements for bulk editing and dragging Backlogs cards to external applications.
                      - listitem [ref=e239]:  Wiki macros available in more text editors.
                      - listitem [ref=e240]:  Improved search for work package identifiers.
                      - listitem [ref=e241]: " Released to Community: Display relations in work package tables."
                  - link "Learn more about all new features" [ref=e242] [cursor=pointer]:
                    - /url: https://www.openproject.org/docs/release-notes/17-8-0?go_to_locale=en
                    - generic [ref=e243]:
                      - text: Learn more about all new features
                      - img [ref=e244]
              - generic [ref=e246]:
                - heading "My meetings" [level=3] [ref=e249]
                - generic [ref=e250]:
                  - list "My meetings" [ref=e251]:
                    - listitem [ref=e252]:
                      - generic [ref=e253]:
                        - link "Weekly" [ref=e256] [cursor=pointer]:
                          - /url: /projects/demo-project/meetings/1
                        - paragraph [ref=e257]: "09/29/2026 01:09 AM, 1 hr, Project: Demo project"
                    - listitem [ref=e258]:
                      - generic [ref=e259]:
                        - link "Weekly" [ref=e262] [cursor=pointer]:
                          - /url: /projects/demo-project/meetings/2
                        - paragraph [ref=e263]: "09/29/2026 01:09 AM, 1 hr, Project: Demo project"
                    - listitem [ref=e264]:
                      - generic [ref=e265]:
                        - link "Weekly" [ref=e268] [cursor=pointer]:
                          - /url: /projects/demo-project/meetings/3
                        - paragraph [ref=e269]: "10/06/2026 01:09 AM, 1 hr, Project: Demo project"
                  - link "View all meetings" [ref=e271] [cursor=pointer]:
                    - /url: /meetings
              - generic [ref=e272]:
                - heading "Account settings" [level=3] [ref=e275]
                - list [ref=e278]:
                  - listitem [ref=e279]:
                    - text: 
                    - link "Profile" [ref=e280] [cursor=pointer]:
                      - /url: /my/account
                  - listitem [ref=e281]:
                    - text: 
                    - link "My page" [ref=e282] [cursor=pointer]:
                      - /url: /my/page
                  - listitem [ref=e283]:
                    - text: 
                    - link "Change password" [ref=e284] [cursor=pointer]:
                      - /url: /my/security
              - generic [ref=e285]:
                - heading "News" [level=3] [ref=e288]
                - list "News" [ref=e290]:
                  - listitem [ref=e291]:
                    - generic [ref=e292]:
                      - generic [ref=e293]:
                        - link "Scrum project:" [ref=e295] [cursor=pointer]:
                          - /url: /projects/your-scrum-project
                        - link "Welcome to your Scrum demo project" [ref=e297] [cursor=pointer]:
                          - /url: /projects/your-scrum-project/news/2-welcome-to-your-scrum-demo-project
                      - paragraph [ref=e298]:
                        - text: Added by
                        - link "Bench Admin" [ref=e299] [cursor=pointer]:
                          - /url: /users/4
                        - text: on 09/26/2026 03:09 PM
                      - text: We are glad you joined. In this module you can communicate project news to your team members.
                  - listitem [ref=e300]:
                    - generic [ref=e301]:
                      - generic [ref=e302]:
                        - link "Demo project:" [ref=e304] [cursor=pointer]:
                          - /url: /projects/demo-project
                        - link "Welcome to your demo project" [ref=e306] [cursor=pointer]:
                          - /url: /projects/demo-project/news/1-welcome-to-your-demo-project
                      - paragraph [ref=e307]:
                        - text: Added by
                        - link "Bench Admin" [ref=e308] [cursor=pointer]:
                          - /url: /users/4
                        - text: on 09/26/2026 03:09 PM
                      - text: We are glad you joined. In this module you can communicate project news to your team members.
              - generic [ref=e309]:
                - heading "OpenProject community" [level=3] [ref=e312]
                - list [ref=e315]:
                  - listitem [ref=e316]:
                    - text: 
                    - link "User guides" [ref=e317] [cursor=pointer]:
                      - /url: https://www.openproject.org/docs/user-guide/?go_to_locale=en
                      - generic [ref=e318]:
                        - text: User guides
                        - img [ref=e319]
                  - listitem [ref=e321]:
                    - text: 
                    - link "Shortcuts" [ref=e322] [cursor=pointer]:
                      - /url: https://www.openproject.org/docs/user-guide/keyboard-shortcuts-access-keys/?go_to_locale=en
                      - generic [ref=e323]:
                        - text: Shortcuts
                        - img [ref=e324]
                  - listitem [ref=e326]:
                    - text: 
                    - link "Community forum" [ref=e327] [cursor=pointer]:
                      - /url: https://community.openproject.org/projects/openproject/forums
                      - generic [ref=e328]:
                        - text: Community forum
                        - img [ref=e329]
                  - listitem [ref=e331]:
                    - text: 
                    - link "Enterprise support" [ref=e332] [cursor=pointer]:
                      - /url: https://www.openproject.org/pricing/?go_to_locale=en#support
                      - generic [ref=e333]:
                        - text: Enterprise support
                        - img [ref=e334]
                  - listitem [ref=e336]:
                    - text: 
                    - link "OpenProject website" [ref=e337] [cursor=pointer]:
                      - /url: https://www.openproject.org?go_to_locale=en&utm_campaign=website-home-screen&utm_medium=op-instance&utm_source=unknown
                      - generic [ref=e338]:
                        - text: OpenProject website
                        - img [ref=e339]
                  - listitem [ref=e341]:
                    - text: 
                    - link "Security alerts" [ref=e342] [cursor=pointer]:
                      - /url: https://www.openproject.org/security-and-privacy/?go_to_locale=en&utm_campaign=security-alerts-home-screen&utm_medium=op-instance&utm_source=unknown#mailing-list
                      - generic [ref=e343]:
                        - text: Security alerts
                        - img [ref=e344]
                  - listitem [ref=e346]:
                    - text: 
                    - link "Newsletter" [ref=e347] [cursor=pointer]:
                      - /url: https://www.openproject.org/newsletter?go_to_locale=en&utm_campaign=newsletter-home-screen&utm_medium=op-instance&utm_source=unknown
                      - generic [ref=e348]:
                        - text: Newsletter
                        - img [ref=e349]
                  - listitem [ref=e351]:
                    - text: 
                    - link "OpenProject blog" [ref=e352] [cursor=pointer]:
                      - /url: https://www.openproject.org/blog?go_to_locale=en
                      - generic [ref=e353]:
                        - text: OpenProject blog
                        - img [ref=e354]
                  - listitem [ref=e356]:
                    - text: 
                    - link "Release notes" [ref=e357] [cursor=pointer]:
                      - /url: https://www.openproject.org/docs/release-notes/?go_to_locale=en
                      - generic [ref=e358]:
                        - text: Release notes
                        - img [ref=e359]
                  - listitem [ref=e361]:
                    - text: 
                    - link "Report a bug" [ref=e362] [cursor=pointer]:
                      - /url: https://www.openproject.org/docs/development/report-a-bug/?go_to_locale=en
                      - generic [ref=e363]:
                        - text: Report a bug
                        - img [ref=e364]
                  - listitem [ref=e366]:
                    - text: 
                    - link "Development roadmap" [ref=e367] [cursor=pointer]:
                      - /url: https://www.openproject.org/roadmap/?go_to_locale=en
                      - generic [ref=e368]:
                        - text: Development roadmap
                        - img [ref=e369]
                  - listitem [ref=e371]:
                    - text: 
                    - link "Add and edit translations" [ref=e372] [cursor=pointer]:
                      - /url: https://www.openproject.org/docs/contributions-guide/translate-openproject/?go_to_locale=en
                      - generic [ref=e373]:
                        - text: Add and edit translations
                        - img [ref=e374]
                  - listitem [ref=e376]:
                    - text: 
                    - link "API documentation" [ref=e377] [cursor=pointer]:
                      - /url: https://www.openproject.org/docs/api/?go_to_locale=en
                      - generic [ref=e378]:
                        - text: API documentation
                        - img [ref=e379]
              - generic [ref=e381]:
                - heading "Administration" [level=3] [ref=e384]
                - generic [ref=e386]:
                  - list [ref=e387]:
                    - listitem [ref=e388]:
                      - text: 
                      - link "Projects" [ref=e389] [cursor=pointer]:
                        - /url: /projects
                    - listitem [ref=e390]:
                      - text: 
                      - link "Users" [ref=e391] [cursor=pointer]:
                        - /url: /users
                    - listitem [ref=e392]:
                      - text: 
                      - link "Groups" [ref=e393] [cursor=pointer]:
                        - /url: /admin/groups
                    - listitem [ref=e394]:
                      - text: 
                      - link "Roles and permissions" [ref=e395] [cursor=pointer]:
                        - /url: /admin/roles
                    - listitem [ref=e396]:
                      - text: 
                      - link "Work package types" [ref=e397] [cursor=pointer]:
                        - /url: /types
                    - listitem [ref=e398]:
                      - text: 
                      - link "Work package status" [ref=e399] [cursor=pointer]:
                        - /url: /statuses
                    - listitem [ref=e400]:
                      - text: 
                      - link "Custom fields" [ref=e401] [cursor=pointer]:
                        - /url: /custom_fields
                    - listitem [ref=e402]:
                      - text: 
                      - link "System settings" [ref=e403] [cursor=pointer]:
                        - /url: /admin/settings/general
                    - listitem [ref=e404]:
                      - text: 
                      - link "Design" [ref=e405] [cursor=pointer]:
                        - /url: /admin/design
                  - link "" [ref=e407] [cursor=pointer]:
                    - /url: https://www.openproject.org/docs/system-admin-guide/information/?go_to_locale=en#security-badge
              - generic [ref=e412]:
                - generic [ref=e413]:
                  - img [ref=e415]
                  - heading "Enterprise plans" [level=2] [ref=e418]
                - generic [ref=e419]:
                  - paragraph [ref=e420]:
                    - text: Enterprise plans extend the Community edition of OpenProject with additional
                    - link "Enterprise add-ons" [ref=e421] [cursor=pointer]:
                      - /url: https://www.openproject.org/pricing/?go_to_locale=en#features
                      - generic [ref=e422]:
                        - text: Enterprise add-ons
                        - img [ref=e423]
                    - text: and professional support, ideal for organizations running OpenProject in a mission-critical environment.
                  - paragraph [ref=e425]: By upgrading, you will also be supporting an open source project.
                - generic [ref=e426]:
                  - link "Start free trial" [ref=e428] [cursor=pointer]:
                    - /url: /admin/enterprise_trial/trial_dialog
                    - generic [ref=e430]: Start free trial
                  - link "More information" [ref=e432] [cursor=pointer]:
                    - /url: https://www.openproject.org/enterprise-edition?go_to_locale=en
                    - generic [ref=e433]:
                      - text: More information
                      - img [ref=e434]
            - generic [ref=e437]:
              - link "User guides" [ref=e438] [cursor=pointer]:
                - /url: https://www.openproject.org/docs/user-guide/?go_to_locale=en
                - img [ref=e439]
                - text: User guides
              - link "Glossary" [ref=e441] [cursor=pointer]:
                - /url: https://www.openproject.org/docs/glossary/?go_to_locale=en
                - img [ref=e442]
                - text: Glossary
              - link "Shortcuts" [ref=e446] [cursor=pointer]:
                - /url: https://www.openproject.org/docs/user-guide/keyboard-shortcuts-access-keys/?go_to_locale=en
                - img [ref=e447]
                - text: Shortcuts
              - link "Community forum" [ref=e450] [cursor=pointer]:
                - /url: https://community.openproject.org/projects/openproject/forums
                - img [ref=e451]
                - text: Community forum
```

# Test source

```ts
  15682 |  * to recovery, never to a recorded literal."
  15683 |  *
  15684 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  15685 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  15686 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  15687 |  * that is honest for an observation and fatal for an argument. Empty, a
  15688 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  15689 |  * `known` slot loses the identity it exists to carry, so the blank does not
  15690 |  * merely misreport the run: it does the work to the wrong record.
  15691 |  *
  15692 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  15693 |  * verdict, the browser is at rest, and nothing of the consuming step has
  15694 |  * run when this throws.
  15695 |  *
  15696 |  * What it says about the LOG is checked against the log (skippedReads): an
  15697 |  * unpublished reference whose producing step never skipped a read has a
  15698 |  * different cause and a different fix, and pointing at a line that was
  15699 |  * never printed costs a diagnosis (grafana fwgr47).
  15700 |  */
  15701 | function need(outputs: Outputs, ref: string, by: string): string {
  15702 |   const value = outputs[ref as keyof Outputs];
  15703 |   if (value === undefined || value === '') {
  15704 |     const dot = ref.indexOf('.');
  15705 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  15706 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  15707 |     const trail = skips.length
  15708 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  15709 |         ` (${skips[0]}), which is where this run diverged.`
  15710 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  15711 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  15712 |         ` this value, rather than re-recording a read that may be working.`;
  15713 |     throw new Error(
  15714 |       `${by} needs {{${ref}}}, and this run never published it` +
  15715 |         (value === '' ? ' (it was published empty)' : '') +
  15716 |         `. ${trail}` +
  15717 |         ` Stopping here instead of passing an empty value into ${by}:` +
  15718 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  15719 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  15720 |         ` earlier steps did stands; nothing of ${by} has run.`,
  15721 |     );
  15722 |   }
  15723 |   return value;
  15724 | }
  15725 | 
  15726 | /**
  15727 |  * How long a recorded page change has to appear: Playwright's own expect
  15728 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  15729 |  */
  15730 | const EXPECT_WAIT_MS = 5_000;
  15731 | 
  15732 | /**
  15733 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  15734 |  *
  15735 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  15736 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  15737 |  * function, not a reading of it. The lines carrying this run's own values are
  15738 |  * HARD, the rest are a plain group; either is looked for first in the lines
  15739 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  15740 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  15741 |  * role, name, state, and the value after the colon. The AFTER capture is
  15742 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  15743 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  15744 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  15745 |  * as it settled, routed to the record and re-rendered the row, and the
  15746 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  15747 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  15748 |  * An earlier cut of this
  15749 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  15750 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  15751 |  * passed on any visible Project combobox whatever it showed. Polled for
  15752 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  15753 |  * once, so the artifact is the more patient of the two, never the looser.
  15754 |  *
  15755 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  15756 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  15757 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  15758 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  15759 |  * step body, which remembers it for the steps that were going to act inside.
  15760 |  */
  15761 | async function expectChanges(
  15762 |   page: Page,
  15763 |   recorded: string[],
  15764 |   p: Record<string, string>,
  15765 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  15766 |   linesBefore: string[] | null,
  15767 |   dialect: LineDialect = 1,
  15768 |   linesAfter: string[] | null = null,
  15769 | ): Promise<ChangeVerdict> {
  15770 |   let last: ChangeVerdict = { warnings: [] };
  15771 |   await expect
  15772 |     .poll(
  15773 |       async () => {
  15774 |         last = await expectedChangesVerdict(recorded, p, ctx, {
  15775 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  15776 |           live: (look) => captureLines(page, dialect, look),
  15777 |         });
  15778 |         return last.stop ?? null;
  15779 |       },
  15780 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  15781 |     )
> 15782 |     .toBeNull();
        |      ^ Error: 01-open s_fbd2c0/4: the recorded page change did not appear
  15783 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  15784 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  15785 |   return last;
  15786 | }
  15787 | 
  15788 | /**
  15789 |  * Is this step one that was going to act inside a dialog that did not open?
  15790 |  *
  15791 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep, while a recorded dialog is
  15792 |  * absent (see ChangeVerdict.absentDialog): a step whose target cannot be
  15793 |  * found AND which names one of that dialog's own controls — namesDialogControl,
  15794 |  * the shared rule, proven against the dialog's recorded subtree — is skipped as
  15795 |  * belonging to it. A step that resolves its target, or misses without naming
  15796 |  * anything the dialog listed, is the procedure's own and runs (and fails) as
  15797 |  * such; the caller clears the remembered dialog either way. A minting step is
  15798 |  * never skipped, because skipping a mutation cannot be undone: the caller
  15799 |  * emits none of this for one. The one look at the candidates here is what
  15800 |  * replay's resolve window becomes on a page `settle` has already let go quiet.
  15801 |  */
  15802 | async function absentDialogSkip(
  15803 |   candidates: Locator[],
  15804 |   locators: Record<string, { kind: string; name?: string; text?: string; label?: string; hasText?: string }[]>,
  15805 |   dialog: { name: string; lines: string[] },
  15806 |   p: Record<string, string>,
  15807 |   where: string,
  15808 | ): Promise<boolean> {
  15809 |   const inside = namesDialogControl({ locators }, dialog.lines, p);
  15810 |   if (inside === null) return false;
  15811 |   for (const candidate of candidates) if ((await candidate.count().catch(() => 0)) > 0) return false;
  15812 |   console.log(`[sitelooper skip] ${where}: acts on ${JSON.stringify(inside)}, a control of the dialog ${JSON.stringify(dialog.name)}, which did not open — skipped`);
  15813 |   return true;
  15814 | }
  15815 | 
  15816 | /**
  15817 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  15818 |  * after its targets resolve: a click whose identifying rungs ALL missed
  15819 |  * (`hit` positional, or null when nothing resolved) is — the shared
  15820 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  15821 |  * every line it was recorded adding already shows (`lines`, the shared
  15822 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  15823 |  * stopped when a positional rung took it onto an element without the
  15824 |  * recorded accessible name. True means skipped; a stop throws.
  15825 |  */
  15826 | async function positionalClick(
  15827 |   page: Page,
  15828 |   hit: Resolution | null,
  15829 |   identifying: number[],
  15830 |   points: number[],
  15831 |   lines: string[],
  15832 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  15833 |   p: Record<string, string>,
  15834 |   where: string,
  15835 |   dialect: LineDialect = 1,
  15836 | ): Promise<boolean> {
  15837 |   const verdict = await positionalClickVerdict(
  15838 |     page,
  15839 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  15840 |     identifying,
  15841 |     lines,
  15842 |     want,
  15843 |     p,
  15844 |     dialect,
  15845 |   );
  15846 |   if (verdict && 'skip' in verdict) {
  15847 |     logWarning(`${where}: ${verdict.skip}`);
  15848 |     return true;
  15849 |   }
  15850 |   if (verdict && 'stop' in verdict) throw new Error(`${where}: ${verdict.stop}`);
  15851 |   return false;
  15852 | }
  15853 | 
  15854 | function validateInputs(vars: Vars): void {
  15855 |   const missing: string[] = [];
  15856 |   if (typeof vars['runid'] !== 'string' || !vars['runid'].trim()) missing.push('RUNID');
  15857 |   for (const name of requiredEnvNames) {
  15858 |     if (!process.env[name]?.trim()) missing.push(name);
  15859 |   }
  15860 |   if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${[...new Set(missing)].join(', ')}`);
  15861 | }
  15862 | 
  15863 | export const steps = {
  15864 |   /** Open http://127.0.0.1:8090/ and sign in with username admin and password {{env:APP_PASSWORD}} (type the password text exactly as given, it will be filled in automatically). Then navigate to the projec… */
  15865 |   async '01-open'(page: Page, p: { v1: string; v2: string; v3: string; v4: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {
  15866 |     const typedCommitted = new Set<string>();
  15867 | 
  15868 |     // What this step types, selects or names, across its segments (see echoRead).
  15869 |     const echoLedger = new Set<string>();
  15870 | 
  15871 |     // The urls this step loads, for its report values (a given url it loaded was observed).
  15872 |     const reportTrail = urlTrail(page);
  15873 | 
  15874 |     // s_fbd2c0: Open {{v1}} and sign in with username {{v2}} and password {{v3}} (type the password text exactly as given, it will be filled in automatically). Then navigate to the project named '{{v4}} Project' and …
  15875 |     // recorded on a page matching http://127.0.0.1:8090/login
  15876 |     // What this segment filled, which must still stand when the action that submits it goes (see restoreStandingFills).
  15877 |     const filled1 = standingFills();
  15878 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  15879 |     const volatile1: UrlSegDiff[] = [];
  15880 | 
  15881 |     // @step 01-open s_fbd2c0/1
  15882 |     let urlBefore1 = '';
```