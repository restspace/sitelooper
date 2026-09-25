# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vop3n.spec.ts >> vop3n
- Location: vop3n.spec.ts:9:1

# Error details

```
Error: none of 3 recorded locators resolved at 01-signin s_746e7c/1 target (page is at http://127.0.0.1:8090/): getByRole('button', { name: /^[\s\p{Co}\p{So}\p{Cf}]*Close[\s\p{Co}\p{So}\p{Cf}]*$/u }) | locator('#user-form > div:nth-of-type(4) > div > button:nth-of-type(1)') | locator('[data-sitelooper-point="828,547"]')
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
                        - paragraph [ref=e257]: "09/28/2026 03:38 PM, 1 hr, Project: Demo project"
                    - listitem [ref=e258]:
                      - generic [ref=e259]:
                        - link "Weekly" [ref=e262] [cursor=pointer]:
                          - /url: /projects/demo-project/meetings/2
                        - paragraph [ref=e263]: "09/28/2026 03:38 PM, 1 hr, Project: Demo project"
                    - listitem [ref=e264]:
                      - generic [ref=e265]:
                        - link "Weekly" [ref=e268] [cursor=pointer]:
                          - /url: /projects/demo-project/meetings/3
                        - paragraph [ref=e269]: "10/05/2026 03:38 PM, 1 hr, Project: Demo project"
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
                        - text: on 09/25/2026 05:38 AM
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
                        - text: on 09/25/2026 05:38 AM
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
  12082 |  * No visibility wait ahead of recognition, as in the daemon: a recognised
  12083 |  * widget's recipe clicks its root (an input sink inside it may be 0x0), and
  12084 |  * the native half waits for the field itself (reactSafeFill's own 10s).
  12085 |  */
  12086 | async function fill(loc: Locator, value: string): Promise<void> {
  12087 |   const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);
  12088 |   if (attempt) logRecipe(attempt);
  12089 | }
  12090 | 
  12091 | /**
  12092 |  * A recorded `type`, as tools.ts's `case 'type'`: the same set-value recipe
  12093 |  * ladder a fill climbs (an editor or an aria-combobox driven by typing in
  12094 |  * the recording is driven by its recipe here too), else pressSequentially
  12095 |  * on the same target with the daemon's timeout and per-key delay.
  12096 |  */
  12097 | const TYPE_TIMEOUT_MS = 10000;
  12098 | const TYPE_DELAY_MS = 20;
  12099 | async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {
  12100 |   const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });
  12101 |   if (attempt) logRecipe(attempt);
  12102 | }
  12103 | 
  12104 | /**
  12105 |  * One recorded chain resolved against the page — the artifact's adapter to
  12106 |  * the shared `resolveCandidates` (src/execution/resolve.ts, embedded above),
  12107 |  * which is replay's `resolveChain` policy itself: the class order, the
  12108 |  * point mark, the identity guard, plausibility, the origin guard, ambiguity
  12109 |  * and its loop-cursor narrowing, the structural hold and the whole-chain
  12110 |  * wait are decided THERE, in both runners. Nothing here reinterprets one.
  12111 |  *
  12112 |  * What this adds is presentation, exactly what replay adds around its own
  12113 |  * call:
  12114 |  *  - `where` (`"<stepId> <segmentId>/<stepIndex> target|source"`, baked in
  12115 |  *    at each call site) turns a silent fallthrough into telemetry. A win by
  12116 |  *    any candidate but the primary (stored index 0) IS drift — the recorded
  12117 |  *    locator missed and a later one covered for it — so it is one stable,
  12118 |  *    grep-able `[sitelooper drift]` line naming every candidate rejected
  12119 |  *    ahead of the winner and WHY, in the policy's own words (MissReason).
  12120 |  *  - `resolved` is the loop-body sink (replay's runOneStep `sink`): what
  12121 |  *    this target resolved TO, as `<key>=<winning locator>`, with the cursor
  12122 |  *    appended only when ambiguity was narrowed to it. The progress guard
  12123 |  *    compares one pass's entries with the last.
  12124 |  *
  12125 |  * WHAT THE ARTIFACT STILL CANNOT MIRROR. Retirement (`retired`, replay's
  12126 |  * evidence-based reordering of a candidate later runs showed volatile):
  12127 |  * that evidence lives in the skill store, and an artifact has none, so a
  12128 |  * compiled chain is ordered by class and recorded order alone. Everything
  12129 |  * else the policy decides is decided here from the same observations.
  12130 |  */
  12131 | async function resolveTarget(
  12132 |   page: Page,
  12133 |   candidates: CandidateObservation[],
  12134 |   where: string,
  12135 |   policy: ResolvePolicy,
  12136 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  12137 | ): Promise<Resolution | null> {
  12138 |   const hit = await resolveCandidates(page, candidates, policy);
  12139 |   if (!hit) return null;
  12140 |   const primary = candidates.find((c) => c.index === 0) ?? candidates[0];
  12141 |   // Drift is a better candidate that FAILED (the shared isDrift), never a stored
  12142 |   // index alone: a positional primary the policy ranked behind a name was not missed.
  12143 |   if (isDrift(hit)) {
  12144 |     const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');
  12145 |     const head = hit.missed.some((m) => m.index === 0) ? `primary ${String(primary.locator)} missed; used` : 'used';
  12146 |     const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;
  12147 |     console.log(line);
  12148 |     (opts.drift ?? DRIFT).push(line);
  12149 |   }
  12150 |   if (opts.resolved) {
  12151 |     const won = candidates.find((c) => c.index === hit.index) ?? primary;
  12152 |     opts.resolved.into.push(`${opts.resolved.key}=${String(won.locator)}${hit.nth !== undefined ? `.nth(${hit.nth})` : ''}`);
  12153 |     // the loop progress guard, asked before anything acts on what just resolved
  12154 |     opts.resolved.check?.();
  12155 |   }
  12156 |   return hit;
  12157 | }
  12158 | 
  12159 | /**
  12160 |  * resolveTarget for an ACTION: a chain that resolves nothing is a stop.
  12161 |  *
  12162 |  * `note` is passed only at a FLAGGED step (compile found the step itself
  12163 |  * wrong — a demoted pin, say — see spec/diagnostics.ts). Appended to the
  12164 |  * throw, it is what stops "none of 3 recorded locators resolved" from
  12165 |  * reading as app drift when the recording is what needs redoing.
  12166 |  */
  12167 | async function pick(
  12168 |   page: Page,
  12169 |   candidates: CandidateObservation[],
  12170 |   where: string,
  12171 |   policy: ResolvePolicy,
  12172 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  12173 |   note?: string,
  12174 | ): Promise<Resolution> {
  12175 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  12176 |   if (hit) return hit;
  12177 |   throw pickMiss(page, candidates, where, note);
  12178 | }
  12179 | 
  12180 | /** The stop for a chain that resolved nothing, shared by `pick` and `pickOrNavigate`. */
  12181 | function pickMiss(page: Page, candidates: CandidateObservation[], where: string, note?: string): Error {
> 12182 |   return new Error(
        |          ^ Error: none of 3 recorded locators resolved at 01-signin s_746e7c/1 target (page is at http://127.0.0.1:8090/): getByRole('button', { name: /^[\s\p{Co}\p{So}\p{Cf}]*Close[\s\p{Co}\p{So}\p{Cf}]*$/u }) | locator('#user-form > div:nth-of-type(4) > div > button:nth-of-type(1)') | locator('[data-sitelooper-point="828,547"]')
  12183 |     // The url and the recorded step are half the answer whenever a chain
  12184 |     // misses wholesale: a locator that named the control on the day it was
  12185 |     // recorded usually misses because the page is not the page the step
  12186 |     // expected, and the log otherwise says only that nothing resolved.
  12187 |     `none of ${candidates.length} recorded locators resolved at ${where} (page is at ${page.url()}): ` +
  12188 |       candidates.slice(0, 3).map((c) => String(c.locator)).join(' | ') +
  12189 |       (note ? `\n  ${note}` : ''),
  12190 |   );
  12191 | }
  12192 | 
  12193 | /**
  12194 |  * `pick` for a navigation click with a recorded destination — replay's
  12195 |  * navigation fallback (runOneStep), through the shared
  12196 |  * mayNavigateToDestination/navigateToDestination (src/execution/recover.ts,
  12197 |  * embedded). When the chain resolves nothing and the browser is not already
  12198 |  * where the click was recorded to land, another visible link to that
  12199 |  * destination is clicked, else a fully concrete destination is navigated to
  12200 |  * directly. Arrival returns null — the step is done, logged as drift, and
  12201 |  * its gates are not asked, as replay returns before them. Otherwise the
  12202 |  * same stop `pick` throws. Never emitted in a loop body (replay's rule).
  12203 |  */
  12204 | async function pickOrNavigate(
  12205 |   page: Page,
  12206 |   candidates: CandidateObservation[],
  12207 |   where: string,
  12208 |   policy: ResolvePolicy,
  12209 |   destPattern: string,
  12210 |   p: Record<string, string>,
  12211 |   opts: { drift?: string[]; resolved?: { into: string[]; key: string; check?: () => void } } = {},
  12212 |   note?: string,
  12213 | ): Promise<Resolution | null> {
  12214 |   const hit = await resolveTarget(page, candidates, where, policy, opts);
  12215 |   if (hit) return hit;
  12216 |   if (mayNavigateToDestination('click', destPattern, page.url(), p, false)) {
  12217 |     const arrived = await navigateToDestination(page, destPattern, p, {
  12218 |       click: async (loc) => {
  12219 |         await click(loc);
  12220 |       },
  12221 |       goto: (url) => page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }),
  12222 |     });
  12223 |     // The substitute link's click may have landed: a stop, never the direct navigation after it.
  12224 |     if (arrived && 'unknown' in arrived) throw new Error(`${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`);
  12225 |     if (arrived) {
  12226 |       const line = `[sitelooper drift] ${where}: none of ${candidates.length} recorded locators resolved; ${arrived.note}`;
  12227 |       console.log(line);
  12228 |       (opts.drift ?? DRIFT).push(line);
  12229 |       return null;
  12230 |     }
  12231 |   }
  12232 |   throw pickMiss(page, candidates, where, note);
  12233 | }
  12234 | 
  12235 | /**
  12236 |  * A text wait that failed on the target it resolved — replay's
  12237 |  * textHeldElsewhere rung (the shared src/execution/recover.ts, embedded):
  12238 |  * when another recorded candidate for the same target already shows the
  12239 |  * text, the condition held, and the step goes on to its own gates with a
  12240 |  * drift line naming the candidate. Otherwise the wait's own error stands.
  12241 |  */
  12242 | async function textHeldOrThrow(err: unknown, candidates: CandidateObservation[], state: string, text: string, where: string, drift: string[]): Promise<void> {
  12243 |   const held = await textHeldElsewhere(candidates, state, text);
  12244 |   if (!held) throw err;
  12245 |   const message = (err instanceof Error ? err.message : String(err)).split('\n')[0];
  12246 |   const line = `[sitelooper drift] ${where}: ${message}; the text was already showing in fallback #${held.index + 1} ${String(held.locator)}`;
  12247 |   console.log(line);
  12248 |   drift.push(line);
  12249 | }
  12250 | 
  12251 | /**
  12252 |  * Every `[sitelooper skip]` line this run logged, by the `where` that
  12253 |  * logged it (`<step id> <skill step>/<n> <role>`).
  12254 |  *
  12255 |  * WHY THIS EXISTS. `need`'s error used to tell the reader, unconditionally,
  12256 |  * to look above for the producing step's `[sitelooper skip] … read target
  12257 |  * not found` line. When the reference names something that is not a step of
  12258 |  * the flow (grafana fwgr47: `07-verify needs {{i2.dashboard_title_saved}}`,
  12259 |  * a ledger instruction id no step publishes) no such line was ever emitted —
  12260 |  * the only occurrence of that string in the entire log was inside the error
  12261 |  * itself, and it sent the diagnosis after a read that was working all along.
  12262 |  * So the claim is now made only when the log bears it out.
  12263 |  */
  12264 | const skippedReads: string[] = [];
  12265 | 
  12266 | /**
  12267 |  * A recorded READ, which never fails the flow.
  12268 |  *
  12269 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep treats `read`/`read_all` as an
  12270 |  * OBSERVATION, not a state change: a read whose target cannot be resolved —
  12271 |  * or whose read itself errors — is skipped with a warning and the replay
  12272 |  * CONTINUES ("skipped read — no element matched any known locator"). Failing
  12273 |  * to re-capture a value says nothing about whether the procedure ran; the
  12274 |  * step after it is exactly as valid as it was. A spec that threw here turned
  12275 |  * a missing observation into a failed test: grafana's `panel_content` read is
  12276 |  * a freshly applied text panel whose body the verifier goes on to confirm,
  12277 |  * and none of the three recorded ways of naming it resolved inside the
  12278 |  * resolve window — one lost value, and the run reported as a broken procedure.
  12279 |  *
  12280 |  * So: the resolution and the read together, and on any failure one grep-able
  12281 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  12282 |  * are left exactly as they were — the emptiness is the honest report.
```