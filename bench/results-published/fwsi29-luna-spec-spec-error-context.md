# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwsi29-luna.spec.ts >> fwsi29-luna
- Location: fwsi29-luna.spec.ts:9:1

# Error details

```
Error: 04-edit needs {{03-create.url.p1}}, and this run never published it (it was published empty). No `[sitelooper skip]` line was logged for 03-create on this run, so no read of 03-create.url.p1 was even attempted: check that 03-create is a step of this flow and that it is the step that publishes this value, rather than re-recording a read that may be working. Stopping here instead of passing an empty value into 04-edit: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 04-edit has run.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - navigation [ref=e5]:
        - button " Toggle navigation" [ref=e6] [cursor=pointer]:
          - text: 
          - generic [ref=e7]: Toggle navigation
        - link "Bench Assets" [ref=e10] [cursor=pointer]:
          - /url: http://127.0.0.1:8098
        - list [ref=e12]:
          - text: 
          - listitem [ref=e13]:
            - link [ref=e14] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware
              - generic [ref=e15]: 
              - generic [ref=e16]: Assets
          - listitem [ref=e17]:
            - link [ref=e18] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/licenses
              - generic [ref=e19]: 
              - generic [ref=e20]: Licenses
          - listitem [ref=e21]:
            - link [ref=e22] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/accessories
              - generic [ref=e23]: 
              - generic [ref=e24]: Accessories
          - listitem [ref=e25]:
            - link [ref=e26] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/consumables
              - generic [ref=e27]: 
              - generic [ref=e28]: Consumables
          - listitem [ref=e29]:
            - link [ref=e30] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/components
              - generic [ref=e31]: 
              - generic [ref=e32]: Components
          - listitem [ref=e33]:
            - link [ref=e34] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/users
              - generic [ref=e35]: 
              - generic [ref=e36]: Users
          - listitem [ref=e37]:
            - search [ref=e38]:
              - generic [ref=e39]:
                - generic [ref=e40]: Lookup by Asset Tag
                - textbox "Lookup by Asset Tag" [ref=e41]
                - button "Search" [ref=e43] [cursor=pointer]:
                  - generic [ref=e44]: 
                  - generic [ref=e45]: Search
          - listitem [ref=e46]:
            - link [ref=e47] [cursor=pointer]:
              - /url: "#"
              - text: Create New
              - strong [ref=e48]
            - text:      
          - listitem [ref=e49]:
            - link "Alerts" [ref=e50] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e51]: 
              - generic [ref=e52]: Alerts
          - listitem [ref=e53]:
            - link "Bench Admin" [ref=e54] [cursor=pointer]:
              - /url: "#"
              - generic [ref=e55]:
                - text: Bench Admin
                - strong [ref=e56]
            - text:        
          - listitem [ref=e57]:
            - link "Admin Settings" [ref=e58] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/admin
              - generic [ref=e59]: 
              - generic [ref=e60]: Admin Settings
    - complementary [ref=e61]:
      - list [ref=e63]:
        - listitem [ref=e64]:
          - link [ref=e65] [cursor=pointer]:
            - /url: http://127.0.0.1:8098
            - generic [ref=e66]: 
        - listitem [ref=e67]:
          - link [ref=e68] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e69]: 
            - text: 
          - text:          
        - listitem [ref=e70]:
          - link [ref=e71] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e72]: 
            - text: 
          - text:  
        - listitem [ref=e73]:
          - link [ref=e74] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/licenses
            - generic [ref=e75]: 
        - listitem [ref=e76]:
          - link [ref=e77] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/accessories
            - generic [ref=e78]: 
        - listitem [ref=e79]:
          - link [ref=e80] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/consumables
            - generic [ref=e81]: 
        - listitem [ref=e82]:
          - link [ref=e83] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/components
            - generic [ref=e84]: 
        - listitem [ref=e85]:
          - link [ref=e86] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/kits
            - generic [ref=e87]: 
        - listitem [ref=e88]:
          - link [ref=e89] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e90]: 
            - text: 
          - text:      
        - listitem [ref=e91]:
          - link [ref=e92] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/import
            - generic [ref=e93]: 
        - listitem [ref=e94]:
          - link [ref=e95] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e96]: 
            - text: 
        - listitem [ref=e97]:
          - link [ref=e98] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e99]: 
            - text: 
        - listitem [ref=e100]:
          - link [ref=e101] [cursor=pointer]:
            - /url: http://127.0.0.1:8098/account/requestable-assets
            - generic [ref=e102]: 
    - main [ref=e103]:
      - heading "Assets" [level=1] [ref=e107]:
        - list [ref=e108]:
          - listitem [ref=e109]:
            - link [ref=e110] [cursor=pointer]:
              - /url: http://127.0.0.1:8098
              - generic [ref=e111]: 
            - generic [ref=e112]: 
          - listitem [ref=e113]: Assets
      - generic [ref=e114]:
        - status [ref=e117]:
          - generic [ref=e118]: 
          - strong [ref=e119]: "Success:"
          - button "Close" [ref=e120] [cursor=pointer]: ×
          - text: Asset with tag BA-00007 was created successfully.
          - strong [ref=e121]:
            - link "Click here to view" [ref=e122] [cursor=pointer]:
              - /url: http://127.0.0.1:8098/hardware/7
          - text: .
        - generic [ref=e125]:
          - generic [ref=e127]:
            - heading "Assets" [level=3] [ref=e128]
            - generic [ref=e131]:
              - generic [ref=e132]: Bulk Actions
              - combobox [ref=e133]
              - combobox "Select rows to see available actions" [ref=e136] [cursor=pointer]:
                - textbox [ref=e137]
              - button "Go" [disabled] [ref=e138]
            - generic [ref=e139]:
              - generic [ref=e140]:
                - generic [ref=e141]:
                  - button "Columns" [ref=e143] [cursor=pointer]:
                    - generic [ref=e144]: 
                  - button "+" [ref=e146] [cursor=pointer]:
                    - generic [ref=e147]: +
                  - button "" [ref=e148] [cursor=pointer]:
                    - generic [ref=e149]: 
                  - button "Refresh" [ref=e150] [cursor=pointer]:
                    - generic [ref=e151]: 
                  - button "" [ref=e152] [cursor=pointer]:
                    - generic [ref=e153]: 
                  - button "Export data" [ref=e155] [cursor=pointer]:
                    - generic [ref=e156]: 
                  - button "Print" [ref=e158] [cursor=pointer]:
                    - generic [ref=e159]: 
                  - button "Fullscreen" [ref=e160] [cursor=pointer]:
                    - generic [ref=e161]: 
                  - button "Advanced search" [ref=e162] [cursor=pointer]:
                    - generic [ref=e163]: 
                  - button "" [ref=e164] [cursor=pointer]:
                    - generic [ref=e165]: 
                - generic [ref=e167]:
                  - searchbox "Search" [ref=e168]
                  - button "" [ref=e170] [cursor=pointer]:
                    - generic [ref=e171]: 
              - generic [ref=e173]: Showing 1 to 4 of 4 rows
              - table [ref=e178]:
                - rowgroup [ref=e179]:
                  - row "Asset Tag Name Image Serial Model Category Status Checked Out To Location Purchase Cost Current Value Checkin/Checkout Actions" [ref=e180]:
                    - columnheader [ref=e181]:
                      - checkbox [ref=e184]
                    - columnheader "Asset Tag" [ref=e185]:
                      - generic [ref=e186] [cursor=pointer]: Asset Tag
                    - columnheader "Name" [ref=e187]:
                      - generic [ref=e188] [cursor=pointer]: Name
                    - columnheader "Image" [ref=e189]:
                      - generic [ref=e190] [cursor=pointer]: Image
                    - columnheader "Serial" [ref=e191]:
                      - generic [ref=e192] [cursor=pointer]: Serial
                    - columnheader "Model" [ref=e193]:
                      - generic [ref=e194] [cursor=pointer]: Model
                    - columnheader "Category" [ref=e195]:
                      - generic [ref=e196] [cursor=pointer]: Category
                    - columnheader "Status" [ref=e197]:
                      - generic [ref=e198] [cursor=pointer]: Status
                    - columnheader "Checked Out To" [ref=e199]:
                      - generic [ref=e200] [cursor=pointer]: Checked Out To
                    - columnheader "Location" [ref=e201]:
                      - generic [ref=e202] [cursor=pointer]: Location
                    - columnheader "Purchase Cost" [ref=e203]:
                      - generic [ref=e204] [cursor=pointer]: Purchase Cost
                    - columnheader "Current Value" [ref=e205]:
                      - generic [ref=e206]: Current Value
                    - columnheader "Checkin/Checkout" [ref=e207]:
                      - generic [ref=e208]: Checkin/Checkout
                    - columnheader "Actions" [ref=e209]:
                      - generic [ref=e210]: Actions
                - rowgroup [ref=e211]:
                  - 'row "SEED-0001 Seed: Reception Laptop Bench Laptop Model Bench Laptops  Ready to Deploy Bench Warehouse Checkout Clone Item Audit Update Delete" [ref=e212]':
                    - cell [ref=e213]:
                      - checkbox [ref=e215]
                    - cell "SEED-0001" [ref=e216]:
                      - link "SEED-0001" [ref=e218] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/1
                    - 'cell "Seed: Reception Laptop" [ref=e219]':
                      - 'link "Seed: Reception Laptop" [ref=e221] [cursor=pointer]':
                        - /url: http://127.0.0.1:8098/hardware/1
                    - cell [ref=e222]
                    - cell [ref=e223]
                    - cell "Bench Laptop Model" [ref=e224]:
                      - link "Bench Laptop Model" [ref=e226] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/models/1
                    - cell "Bench Laptops" [ref=e227]:
                      - link "Bench Laptops" [ref=e229] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/categories/2
                    - cell " Ready to Deploy" [ref=e230]:
                      - link " Ready to Deploy" [ref=e232] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/statuslabels/2
                        - generic [ref=e233]: 
                        - text: Ready to Deploy
                    - cell [ref=e234]
                    - cell "Bench Warehouse" [ref=e235]:
                      - link "Bench Warehouse" [ref=e236] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/locations/2
                    - cell [ref=e237]
                    - cell [ref=e238]
                    - cell "Checkout" [ref=e239]:
                      - link "Checkout" [ref=e240] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/1/checkout
                    - cell "Clone Item Audit Update Delete" [ref=e241]:
                      - generic [ref=e242]:
                        - link "Clone Item" [ref=e243] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/1/clone
                          - generic [ref=e244]: 
                          - generic [ref=e245]: Clone Item
                        - link "Audit" [ref=e246] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/1/audit
                          - generic [ref=e247]: 
                          - generic [ref=e248]: Audit
                        - link "Update" [ref=e249] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/1/edit
                          - generic [ref=e250]: 
                          - generic [ref=e251]: Update
                        - link "Delete" [ref=e252] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/1
                          - generic [ref=e253]: 
                          - generic [ref=e254]: Delete
                  - 'row "SEED-0002 Seed: Training Laptop Bench Laptop Model Bench Laptops  Ready to Deploy Bench Warehouse Checkout Clone Item Audit Update Delete" [ref=e255]':
                    - cell [ref=e256]:
                      - checkbox [ref=e258]
                    - cell "SEED-0002" [ref=e259]:
                      - link "SEED-0002" [ref=e261] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/2
                    - 'cell "Seed: Training Laptop" [ref=e262]':
                      - 'link "Seed: Training Laptop" [ref=e264] [cursor=pointer]':
                        - /url: http://127.0.0.1:8098/hardware/2
                    - cell [ref=e265]
                    - cell [ref=e266]
                    - cell "Bench Laptop Model" [ref=e267]:
                      - link "Bench Laptop Model" [ref=e269] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/models/1
                    - cell "Bench Laptops" [ref=e270]:
                      - link "Bench Laptops" [ref=e272] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/categories/2
                    - cell " Ready to Deploy" [ref=e273]:
                      - link " Ready to Deploy" [ref=e275] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/statuslabels/2
                        - generic [ref=e276]: 
                        - text: Ready to Deploy
                    - cell [ref=e277]
                    - cell "Bench Warehouse" [ref=e278]:
                      - link "Bench Warehouse" [ref=e279] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/locations/2
                    - cell [ref=e280]
                    - cell [ref=e281]
                    - cell "Checkout" [ref=e282]:
                      - link "Checkout" [ref=e283] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/2/checkout
                    - cell "Clone Item Audit Update Delete" [ref=e284]:
                      - generic [ref=e285]:
                        - link "Clone Item" [ref=e286] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/2/clone
                          - generic [ref=e287]: 
                          - generic [ref=e288]: Clone Item
                        - link "Audit" [ref=e289] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/2/audit
                          - generic [ref=e290]: 
                          - generic [ref=e291]: Audit
                        - link "Update" [ref=e292] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/2/edit
                          - generic [ref=e293]: 
                          - generic [ref=e294]: Update
                        - link "Delete" [ref=e295] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/2
                          - generic [ref=e296]: 
                          - generic [ref=e297]: Delete
                  - 'row "SEED-0003 Seed: Spare Laptop Bench Laptop Model Bench Laptops  Ready to Deploy Bench Warehouse Checkout Clone Item Audit Update Delete" [ref=e298]':
                    - cell [ref=e299]:
                      - checkbox [ref=e301]
                    - cell "SEED-0003" [ref=e302]:
                      - link "SEED-0003" [ref=e304] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/3
                    - 'cell "Seed: Spare Laptop" [ref=e305]':
                      - 'link "Seed: Spare Laptop" [ref=e307] [cursor=pointer]':
                        - /url: http://127.0.0.1:8098/hardware/3
                    - cell [ref=e308]
                    - cell [ref=e309]
                    - cell "Bench Laptop Model" [ref=e310]:
                      - link "Bench Laptop Model" [ref=e312] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/models/1
                    - cell "Bench Laptops" [ref=e313]:
                      - link "Bench Laptops" [ref=e315] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/categories/2
                    - cell " Ready to Deploy" [ref=e316]:
                      - link " Ready to Deploy" [ref=e318] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/statuslabels/2
                        - generic [ref=e319]: 
                        - text: Ready to Deploy
                    - cell [ref=e320]
                    - cell "Bench Warehouse" [ref=e321]:
                      - link "Bench Warehouse" [ref=e322] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/locations/2
                    - cell [ref=e323]
                    - cell [ref=e324]
                    - cell "Checkout" [ref=e325]:
                      - link "Checkout" [ref=e326] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/3/checkout
                    - cell "Clone Item Audit Update Delete" [ref=e327]:
                      - generic [ref=e328]:
                        - link "Clone Item" [ref=e329] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/3/clone
                          - generic [ref=e330]: 
                          - generic [ref=e331]: Clone Item
                        - link "Audit" [ref=e332] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/3/audit
                          - generic [ref=e333]: 
                          - generic [ref=e334]: Audit
                        - link "Update" [ref=e335] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/3/edit
                          - generic [ref=e336]: 
                          - generic [ref=e337]: Update
                        - link "Delete" [ref=e338] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/3
                          - generic [ref=e339]: 
                          - generic [ref=e340]: Delete
                  - row "BA-00007 fwsi29-luna-spec Bench Asset Bench Laptop Model Bench Laptops  Ready to Deploy Checkout Clone Item Audit Update Delete" [ref=e341]:
                    - cell [ref=e342]:
                      - checkbox [ref=e344]
                    - cell "BA-00007" [ref=e345]:
                      - link "BA-00007" [ref=e347] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/7
                    - cell "fwsi29-luna-spec Bench Asset" [ref=e348]:
                      - link "fwsi29-luna-spec Bench Asset" [ref=e350] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/7
                    - cell [ref=e351]
                    - cell [ref=e352]
                    - cell "Bench Laptop Model" [ref=e353]:
                      - link "Bench Laptop Model" [ref=e355] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/models/1
                    - cell "Bench Laptops" [ref=e356]:
                      - link "Bench Laptops" [ref=e358] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/categories/2
                    - cell " Ready to Deploy" [ref=e359]:
                      - link " Ready to Deploy" [ref=e361] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/statuslabels/2
                        - generic [ref=e362]: 
                        - text: Ready to Deploy
                    - cell [ref=e363]
                    - cell [ref=e364]
                    - cell [ref=e365]
                    - cell [ref=e366]
                    - cell "Checkout" [ref=e367]:
                      - link "Checkout" [ref=e368] [cursor=pointer]:
                        - /url: http://127.0.0.1:8098/hardware/7/checkout
                    - cell "Clone Item Audit Update Delete" [ref=e369]:
                      - generic [ref=e370]:
                        - link "Clone Item" [ref=e371] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/7/clone
                          - generic [ref=e372]: 
                          - generic [ref=e373]: Clone Item
                        - link "Audit" [ref=e374] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/7/audit
                          - generic [ref=e375]: 
                          - generic [ref=e376]: Audit
                        - link "Update" [ref=e377] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/7/edit
                          - generic [ref=e378]: 
                          - generic [ref=e379]: Update
                        - link "Delete" [ref=e380] [cursor=pointer]:
                          - /url: http://127.0.0.1:8098/hardware/7
                          - generic [ref=e381]: 
                          - generic [ref=e382]: Delete
                - rowgroup [ref=e383]:
                  - row "0.00 0.00" [ref=e384]:
                    - columnheader [ref=e385]
                    - columnheader [ref=e387]
                    - columnheader [ref=e389]
                    - columnheader [ref=e391]
                    - columnheader [ref=e393]
                    - columnheader [ref=e395]
                    - columnheader [ref=e397]
                    - columnheader [ref=e399]
                    - columnheader [ref=e401]
                    - columnheader [ref=e403]
                    - columnheader "0.00" [ref=e405]:
                      - generic [ref=e406]: "0.00"
                    - columnheader "0.00" [ref=e407]:
                      - generic [ref=e408]: "0.00"
                    - columnheader [ref=e409]
                    - columnheader [ref=e411]
              - generic [ref=e414]: Showing 1 to 4 of 4 rows
          - paragraph [ref=e415]:
            - generic [ref=e416]: 
            - text: Click on a checkbox and hold
            - code [ref=e417]: shift
            - text: and click another checkbox in the table to select/de-select a range.
    - contentinfo [ref=e418]:
      - generic [ref=e419]:
        - generic [ref=e420]:
          - link "Snipe-IT" [ref=e421] [cursor=pointer]:
            - /url: https://snipeitapp.com
          - text: is open source software, made with
          - generic [ref=e422]: 
          - generic [ref=e423]: love
          - text: by Grokability, Inc.
          - link "" [ref=e424] [cursor=pointer]:
            - /url: https://bsky.app/profile/snipeitapp.com
            - generic [ref=e425]: 
          - link "" [ref=e426] [cursor=pointer]:
            - /url: https://github.com/grokability/snipe-it/
            - generic [ref=e427]: 
          - link "" [ref=e428] [cursor=pointer]:
            - /url: https://hachyderm.io/@grokability
            - generic [ref=e429]: 
          - link "" [ref=e430] [cursor=pointer]:
            - /url: https://discord.gg/yZFtShAcKk
            - generic [ref=e431]: 
        - generic [ref=e432]:
          - text: Version v8.7.2 - build 24589 (master)
          - link "User's Manual" [ref=e433] [cursor=pointer]:
            - /url: https://snipe-it.readme.io/docs/overview
          - link "Report a bug" [ref=e434] [cursor=pointer]:
            - /url: https://snipeitapp.com/support/
```

# Test source

```ts
  17066 |  * and none of the three recorded ways of naming it resolved inside the
  17067 |  * resolve window — one lost value, and the run reported as a broken procedure.
  17068 |  *
  17069 |  * So: the resolution and the read together, and on any failure one grep-able
  17070 |  * line and an EMPTY value. Assertions and outputs built from an empty read
  17071 |  * are left exactly as they were — the emptiness is the honest report.
  17072 |  *
  17073 |  * The rules are not restated here. WHEN the resolution is asked (once, then
  17074 |  * after one sweep of the page once more with no wait) is the shared
  17075 |  * resolveForRead; taking the read, flattening it and turning its error into
  17076 |  * a skip is the shared takeRead (src/execution/observe.ts, embedded).
  17077 |  * Replay's runOneStep calls the same two; this adapter only says what it did.
  17078 |  */
  17079 | async function readOptional(
  17080 |   page: Page,
  17081 |   candidates: CandidateObservation[],
  17082 |   where: string,
  17083 |   policy: ResolvePolicy,
  17084 |   read: (loc: Locator) => Promise<unknown>,
  17085 |   opts: {
  17086 |     drift?: string[];
  17087 |     resolved?: { into: string[]; key: string; check?: () => void };
  17088 |     count?: { root: { locator(selector: string, options?: { hasText?: string | RegExp }): Locator }; scopes: CountScope[] | null };
  17089 |     kinds?: RecordedKind[];
  17090 |     label?: string;
  17091 |   } = {},
  17092 | ): Promise<string> {
  17093 |   lastReadHit = null;
  17094 |   const hit = await resolveForRead(page, (again) => resolveTarget(page, candidates, where, again ? { ...policy, waitMs: 0 } : policy, opts));
  17095 |   // A COUNT read (opts.count) that resolved nothing on a settled page with
  17096 |   // its scope on it observed "0", as replay publishes it (the shared
  17097 |   // countedNothing, fwrd88 05-change); anything else still skips.
  17098 |   if (!hit && opts.count && (await countedNothing(page, opts.count.root, candidates, opts.count.scopes))) return '0';
  17099 |   if (!hit) {
  17100 |     skippedReads.push(where);
  17101 |     console.log(`[sitelooper skip] ${where}: read target not found — value left empty`);
  17102 |     return '';
  17103 |   }
  17104 |   // A positional fallback standing in for a better candidate that missed reads
  17105 |   // what the recording read only if it is the kind of element it read (round 62,
  17106 |   // replay's same check; the artifact never heals, so a fallback is its only case).
  17107 |   if (hit.index > 0 && hit.structural && opts.kinds?.length && (await readsRecordedKind(hit.locator, opts.kinds)) === false) {
  17108 |     skippedReads.push(where);
  17109 |     console.log(`[sitelooper skip] ${where}: ${offRecordReadReason(opts.label ?? '', 'a positional fallback', opts.kinds)}`);
  17110 |     return '';
  17111 |   }
  17112 |   lastReadHit = hit.locator;
  17113 |   const taken = await takeRead(() => read(hit.locator));
  17114 |   if (taken.ok) return taken.value;
  17115 |   // A read proving what the step set did not land fails the step (scopedReadLanded, gitea fwgt12).
  17116 |   if (taken.lost) throw new Error(`${where}: ${taken.message}`);
  17117 |   skippedReads.push(where);
  17118 |   console.log(`[sitelooper skip] ${where}: read errored (${taken.message}) — value left empty`);
  17119 |   return '';
  17120 | }
  17121 | 
  17122 | /**
  17123 |  * A value an earlier step had to publish, taken at the moment the step
  17124 |  * that NEEDS it is handed its arguments.
  17125 |  *
  17126 |  * WHICH REPLAY RULE THIS MIRRORS. The flow runner resolves every {{ref}}
  17127 |  * in a step's instruction and params BEFORE the step runs
  17128 |  * (src/daemon/server.ts:1009-1024) and classifies what it could not fill:
  17129 |  * a reference bound into a slot the pinned procedure actually USES — one a
  17130 |  * recorded step types or locates by, or that names the record the
  17131 |  * procedure must find — is BLOCKING (`ignorableRefs`, src/skills/flow.ts:1083),
  17132 |  * so the zero-model replay is skipped and the step goes to recovery. Only a
  17133 |  * reference no recorded step can be affected by replays as pinned.
  17134 |  * `lookupRef` says it outright: a reference this run did not publish "goes
  17135 |  * to recovery, never to a recorded literal."
  17136 |  *
  17137 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  17138 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  17139 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  17140 |  * that is honest for an observation and fatal for an argument. Empty, a
  17141 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  17142 |  * `known` slot loses the identity it exists to carry, so the blank does not
  17143 |  * merely misreport the run: it does the work to the wrong record.
  17144 |  *
  17145 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  17146 |  * verdict, the browser is at rest, and nothing of the consuming step has
  17147 |  * run when this throws.
  17148 |  *
  17149 |  * What it says about the LOG is checked against the log (skippedReads): an
  17150 |  * unpublished reference whose producing step never skipped a read has a
  17151 |  * different cause and a different fix, and pointing at a line that was
  17152 |  * never printed costs a diagnosis (grafana fwgr47).
  17153 |  */
  17154 | function need(outputs: Outputs, ref: string, by: string): string {
  17155 |   const value = outputs[ref as keyof Outputs];
  17156 |   if (value === undefined || value === '') {
  17157 |     const dot = ref.indexOf('.');
  17158 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  17159 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  17160 |     const trail = skips.length
  17161 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  17162 |         ` (${skips[0]}), which is where this run diverged.`
  17163 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  17164 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  17165 |         ` this value, rather than re-recording a read that may be working.`;
> 17166 |     throw new Error(
        |           ^ Error: 04-edit needs {{03-create.url.p1}}, and this run never published it (it was published empty). No `[sitelooper skip]` line was logged for 03-create on this run, so no read of 03-create.url.p1 was even attempted: check that 03-create is a step of this flow and that it is the step that publishes this value, rather than re-recording a read that may be working. Stopping here instead of passing an empty value into 04-edit: blank, a record-scoped locator matches every record and a known slot loses its identity, so the step would do its work to the wrong one. Everything earlier steps did stands; nothing of 04-edit has run.
  17167 |       `${by} needs {{${ref}}}, and this run never published it` +
  17168 |         (value === '' ? ' (it was published empty)' : '') +
  17169 |         `. ${trail}` +
  17170 |         ` Stopping here instead of passing an empty value into ${by}:` +
  17171 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  17172 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  17173 |         ` earlier steps did stands; nothing of ${by} has run.`,
  17174 |     );
  17175 |   }
  17176 |   return value;
  17177 | }
  17178 | 
  17179 | /**
  17180 |  * How long a recorded page change has to appear: Playwright's own expect
  17181 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  17182 |  */
  17183 | const EXPECT_WAIT_MS = 5_000;
  17184 | 
  17185 | /**
  17186 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  17187 |  *
  17188 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  17189 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  17190 |  * function, not a reading of it. The lines carrying this run's own values are
  17191 |  * HARD, the rest are a plain group; either is looked for first in the lines
  17192 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  17193 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  17194 |  * role, name, state, and the value after the colon. The AFTER capture is
  17195 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  17196 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  17197 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  17198 |  * as it settled, routed to the record and re-rendered the row, and the
  17199 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  17200 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  17201 |  * An earlier cut of this
  17202 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  17203 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  17204 |  * passed on any visible Project combobox whatever it showed. Polled for
  17205 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  17206 |  * once, so the artifact is the more patient of the two, never the looser.
  17207 |  *
  17208 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  17209 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  17210 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  17211 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  17212 |  * step body, which remembers it for the steps that were going to act inside.
  17213 |  */
  17214 | async function expectChanges(
  17215 |   page: Page,
  17216 |   recorded: string[],
  17217 |   p: Record<string, string>,
  17218 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  17219 |   linesBefore: string[] | null,
  17220 |   dialect: LineDialect = 1,
  17221 |   linesAfter: string[] | null = null,
  17222 | ): Promise<ChangeVerdict> {
  17223 |   let last: ChangeVerdict = { warnings: [] };
  17224 |   await expect
  17225 |     .poll(
  17226 |       async () => {
  17227 |         last = await expectedChangesVerdict(recorded, p, { ...ctx, counters: counterNames(siteFactsAt(page.url()), page.url()) }, {
  17228 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  17229 |           live: (look) => captureLines(page, dialect, look),
  17230 |         });
  17231 |         return last.stop ?? null;
  17232 |       },
  17233 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  17234 |     )
  17235 |     .toBeNull();
  17236 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  17237 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  17238 |   return last;
  17239 | }
  17240 | 
  17241 | /**
  17242 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  17243 |  * after its targets resolve: a click whose identifying rungs ALL missed
  17244 |  * (`hit` positional, or null when nothing resolved) is — the shared
  17245 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  17246 |  * every line it was recorded adding already shows (`lines`, the shared
  17247 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  17248 |  * stopped when a positional rung took it onto an element without the
  17249 |  * recorded accessible name. True means skipped; a stop throws.
  17250 |  */
  17251 | async function positionalClick(
  17252 |   page: Page,
  17253 |   hit: Resolution | null,
  17254 |   identifying: number[],
  17255 |   points: number[],
  17256 |   lines: string[],
  17257 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  17258 |   p: Record<string, string>,
  17259 |   where: string,
  17260 |   dialect: LineDialect = 1,
  17261 | ): Promise<boolean> {
  17262 |   const verdict = await positionalClickVerdict(
  17263 |     page,
  17264 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  17265 |     identifying,
  17266 |     lines,
```