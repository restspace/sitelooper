# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hbgc3.spec.ts >> hbgc3
- Location: hbgc3.spec.ts:9:1

# Error details

```
Error: 04-edit s_7f6c08: identity: {{v1}} is not confirmed on this page
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - navigation [ref=e2]:
    - link [ref=e3] [cursor=pointer]:
      - /url: http://127.0.0.1:8106/
      - img [ref=e4]
    - generic [ref=e5]:
      - list [ref=e6]:
        - listitem [ref=e7]:
          - link "Stock overview" [ref=e8] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/stockoverview
            - text: Stock overview
        - listitem [ref=e10]:
          - link "Shopping list" [ref=e11] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/shoppinglist
            - text: Shopping list
        - listitem [ref=e14]:
          - link "Recipes" [ref=e15] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/recipes
            - text: Recipes
        - listitem [ref=e17]:
          - link "Meal plan" [ref=e18] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/mealplan
            - text: Meal plan
        - listitem [ref=e21]:
          - link "Chores overview" [ref=e22] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/choresoverview
            - text: Chores overview
        - listitem [ref=e24]:
          - link "Tasks" [ref=e25] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/tasks
            - text: Tasks
        - listitem [ref=e27]:
          - link "Batteries overview" [ref=e28] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/batteriesoverview
            - text: Batteries overview
        - listitem [ref=e30]:
          - link "Equipment" [ref=e31] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/equipment
            - text: Equipment
        - listitem [ref=e34]:
          - link "Calendar" [ref=e35] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/calendar
            - text: Calendar
        - listitem [ref=e38]:
          - link "Purchase" [ref=e39] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/purchase
            - text: Purchase
        - listitem [ref=e41]:
          - link "Consume" [ref=e42] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/consume
            - text: Consume
        - listitem [ref=e44]:
          - link "Transfer" [ref=e45] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/transfer
            - text: Transfer
        - listitem [ref=e47]:
          - link "Inventory" [ref=e48] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/inventory
            - text: Inventory
        - listitem [ref=e50]:
          - link "Chore tracking" [ref=e51] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/choretracking
            - text: Chore tracking
        - listitem [ref=e53]:
          - link "Battery tracking" [ref=e54] [cursor=pointer]:
            - /url: http://127.0.0.1:8106/batterytracking
            - text: Battery tracking
        - listitem [ref=e57]:
          - link "Manage master data " [ref=e58] [cursor=pointer]:
            - /url: "#sub-nav-manage-master-data"
            - text: Manage master data 
      - list [ref=e60]:
        - listitem [ref=e61]
      - list [ref=e64]:
        - listitem [ref=e65]:
          - link "admin " [ref=e66] [cursor=pointer]:
            - /url: "#"
            - text: admin 
        - listitem [ref=e68]:
          - link "" [ref=e69] [cursor=pointer]:
            - /url: "#"
            - text: 
        - listitem [ref=e71]:
          - link "" [ref=e72] [cursor=pointer]:
            - /url: "#"
            - text: 
  - generic [ref=e77]:
    - generic [ref=e80]:
      - heading "Edit product" [level=2] [ref=e81]
      - generic [ref=e82]:
        - link "Stock entries" [ref=e83] [cursor=pointer]:
          - /url: http://127.0.0.1:8106/stockentries?embedded&product=
        - link "Stock journal" [ref=e84] [cursor=pointer]:
          - /url: http://127.0.0.1:8106/stockjournal?embedded&product=
    - separator [ref=e85]
    - generic [ref=e86]:
      - generic [ref=e88]:
        - generic [ref=e89]:
          - generic [ref=e90]: Name
          - textbox "Name" [active] [ref=e91]
          - generic [ref=e92]: A name is required
        - generic [ref=e94]:
          - checkbox "Active" [ref=e95]
          - generic [ref=e96]: Active
        - generic [ref=e97]:
          - generic [ref=e98]: Parent product
          - textbox [ref=e102]
        - generic [ref=e108]:
          - generic [ref=e109]: Description
          - generic [ref=e110]:
            - toolbar [ref=e111]:
              - button "Font Size" [ref=e114] [cursor=pointer]: 13 
              - generic [ref=e115]:
                - button "Bold (CTRL+B)" [ref=e116] [cursor=pointer]:
                  - generic [ref=e117]: 
                - button "Underline (CTRL+U)" [ref=e118] [cursor=pointer]:
                  - generic [ref=e119]: 
                - button "Remove Font Style (CTRL+\\)" [ref=e120] [cursor=pointer]:
                  - generic [ref=e121]: 
              - generic [ref=e123]:
                - button "Recent Color" [ref=e124] [cursor=pointer]:
                  - generic [ref=e125]: 
                - button "More Color" [ref=e126] [cursor=pointer]: 
              - generic [ref=e127]:
                - button "Unordered list (CTRL+SHIFT+NUM7)" [ref=e128] [cursor=pointer]:
                  - generic [ref=e129]: 
                - button "Ordered list (CTRL+SHIFT+NUM8)" [ref=e130] [cursor=pointer]:
                  - generic [ref=e131]: 
                - generic [ref=e132]:
                  - button "Paragraph" [ref=e133] [cursor=pointer]:
                    - generic [ref=e134]: 
                    - text: 
                  - text:      
              - button "Table" [ref=e137] [cursor=pointer]:
                - generic [ref=e138]: 
                - text: 
              - generic [ref=e139]:
                - button "Link (CTRL+K)" [ref=e140] [cursor=pointer]:
                  - generic [ref=e141]: 
                - button "Picture" [ref=e142] [cursor=pointer]:
                  - generic [ref=e143]: 
                - button "Video" [ref=e144] [cursor=pointer]:
                  - generic [ref=e145]: 
              - generic [ref=e146]:
                - button "Code View" [ref=e147] [cursor=pointer]:
                  - generic [ref=e148]: 
                - button "Full Screen" [ref=e149] [cursor=pointer]:
                  - generic [ref=e150]: 
            - textbox [ref=e152]:
              - paragraph [ref=e153]
            - status
            - status [ref=e154]:
              - generic "Resize" [ref=e155]
            - text:              
        - generic [ref=e159]:
          - generic [ref=e160]: Default location
          - combobox "Default location Due date type" [ref=e161]:
            - option [selected]
            - option "Fridge"
            - option "Garage Pantry"
            - option "Pantry"
            - option "Pantry Shelf"
          - generic [ref=e162]: A location is required
        - generic [ref=e163]:
          - generic [ref=e164]: Default consume location
          - combobox "Default consume location" [ref=e166]:
            - option [selected]
            - option "Fridge"
            - option "Garage Pantry"
            - option "Pantry"
            - option "Pantry Shelf"
          - generic [ref=e167]:
            - checkbox "Move on open" [ref=e168]
            - generic [ref=e169]: Move on open
        - generic [ref=e171]:
          - generic [ref=e172]: Default store
          - textbox [ref=e175]
        - generic [ref=e179]:
          - generic [ref=e180]: Minimum stock amount
          - spinbutton "Minimum stock amount" [ref=e182]: "1"
        - generic [ref=e190]:
          - checkbox "Accumulate sub products min. stock amount" [ref=e191]
          - generic [ref=e192]: Accumulate sub products min. stock amount
        - generic [ref=e195]:
          - checkbox "Treat opened as out of stock" [ref=e196]
          - generic [ref=e197]: Treat opened as out of stock
        - generic [ref=e199]:
          - generic [ref=e200]: Due date type
          - generic [ref=e202]:
            - radio "Best before date" [checked] [ref=e203]
            - generic [ref=e204]: Best before date
          - generic [ref=e206]:
            - radio "Expiration date" [ref=e207]
            - generic [ref=e208]: Expiration date
        - generic [ref=e210]:
          - generic [ref=e211]: Default due days
          - spinbutton "Default due days" [ref=e214]: "1"
        - generic [ref=e221]:
          - generic [ref=e222]: Default due days after opened
          - spinbutton "Default due days after opened" [ref=e225]: "1"
        - generic [ref=e232]:
          - generic [ref=e233]: Default due days after freezing
          - spinbutton "Default due days after freezing" [ref=e236]: "1"
        - generic [ref=e243]:
          - generic [ref=e244]: Default due days after thawing
          - spinbutton "Default due days after thawing" [ref=e247]: "1"
        - generic [ref=e255]:
          - checkbox "Should not be frozen" [ref=e256]
          - generic [ref=e257]: Should not be frozen
        - generic [ref=e259]:
          - generic [ref=e260]: Product group
          - combobox "Product group" [ref=e261]:
            - option [selected]
            - option "Beverages"
            - option "Healthy Snacks"
            - option "Snacks"
            - option "Snacks & Sweets"
        - generic [ref=e262]:
          - generic [ref=e263]: Quantity unit stock
          - combobox "Quantity unit stock" [ref=e265]:
            - option [selected]
            - option "Pack"
            - option "Package"
            - option "Piece"
            - option "Six-pack"
          - generic [ref=e266]: A quantity unit is required
        - generic [ref=e267]:
          - generic [ref=e268]: Default quantity unit purchase
          - combobox "Default quantity unit purchase" [ref=e270]:
            - option [selected]
            - option "Pack"
            - option "Package"
            - option "Piece"
            - option "Six-pack"
          - generic [ref=e271]: A quantity unit is required
        - generic [ref=e272]:
          - generic [ref=e273]: Default quantity unit consume
          - combobox "Default quantity unit consume" [ref=e275]:
            - option [selected]
            - option "Pack"
            - option "Package"
            - option "Piece"
            - option "Six-pack"
          - generic [ref=e276]: A quantity unit is required
        - generic [ref=e277]:
          - generic [ref=e278]: Quantity unit for prices
          - combobox "Quantity unit for prices" [ref=e280]:
            - option [selected]
            - option "Pack"
            - option "Package"
            - option "Piece"
            - option "Six-pack"
          - generic [ref=e281]: A quantity unit is required
        - generic [ref=e283]:
          - checkbox "Enable tare weight handling" [ref=e284]
          - generic [ref=e285]: Enable tare weight handling
        - generic [ref=e287]:
          - generic [ref=e288]: Tare weight
          - spinbutton "Tare weight" [disabled] [ref=e290]: "1"
        - generic [ref=e298]:
          - checkbox "Disable stock fulfillment checking for this ingredient" [ref=e299]
          - generic [ref=e300]: Disable stock fulfillment checking for this ingredient
        - generic [ref=e302]:
          - generic [ref=e303]:
            - text: Energy
            - generic [ref=e305]: kcal /
          - spinbutton "Energy kcal /" [ref=e307]: "1"
        - generic [ref=e314]:
          - generic [ref=e315]: Quick consume amount
          - spinbutton "Quick consume amount" [ref=e318]: "1"
        - generic [ref=e325]:
          - generic [ref=e326]: Quick open amount
          - spinbutton "Quick open amount" [ref=e329]: "1"
        - generic [ref=e336]:
          - generic [ref=e337]: Default purchase price type
          - generic [ref=e339]:
            - radio "Unspecified" [checked] [ref=e340]
            - generic [ref=e341]: Unspecified
          - generic [ref=e342]:
            - radio "Unit price" [ref=e343]
            - generic [ref=e344]: Unit price
          - generic [ref=e345]:
            - radio "Total price" [ref=e346]
            - generic [ref=e347]: Total price
        - generic [ref=e349]:
          - checkbox "Can't be opened" [ref=e350]
          - generic [ref=e351]: Can't be opened
        - generic [ref=e353]:
          - checkbox "Never show on stock overview" [ref=e354]
          - generic [ref=e355]: Never show on stock overview
        - generic [ref=e358]:
          - checkbox "Disable own stock" [ref=e359]
          - generic [ref=e360]: Disable own stock
        - generic [ref=e363]:
          - button "Save & continue" [ref=e364] [cursor=pointer]
          - button "Save & return to products" [ref=e365] [cursor=pointer]
      - generic [ref=e366]:
        - generic [ref=e368]:
          - generic [ref=e369]:
            - heading "Barcodes" [level=4] [ref=e370]
            - link "Add" [ref=e372] [cursor=pointer]:
              - /url: http://127.0.0.1:8106/productbarcodes/new?embedded&product=
          - heading [level=5]
          - generic [ref=e376]:
            - table [ref=e379]:
              - rowgroup [ref=e380]:
                - 'row "Barcode: activate to sort column descending Store: activate to sort column ascending Quantity unit: activate to sort column ascending Amount: activate to sort column ascending" [ref=e381]':
                  - columnheader [ref=e382]:
                    - link [ref=e383] [cursor=pointer]:
                      - /url: "#"
                  - 'columnheader "Barcode: activate to sort column descending" [ref=e385] [cursor=pointer]': Barcode
                  - 'columnheader "Store: activate to sort column ascending" [ref=e386] [cursor=pointer]': Store
                  - 'columnheader "Quantity unit: activate to sort column ascending" [ref=e387] [cursor=pointer]': Quantity unit
                  - 'columnheader "Amount: activate to sort column ascending" [ref=e388] [cursor=pointer]': Amount
            - table [ref=e390]:
              - rowgroup:
                - 'row "Barcode: activate to sort column descending Store: activate to sort column ascending Quantity unit: activate to sort column ascending Amount: activate to sort column ascending"':
                  - columnheader:
                    - link [ref=e391] [cursor=pointer]:
                      - /url: "#"
                  - 'columnheader "Barcode: activate to sort column descending"':
                    - generic: Barcode
                  - 'columnheader "Store: activate to sort column ascending"':
                    - generic: Store
                  - 'columnheader "Quantity unit: activate to sort column ascending"':
                    - generic: Quantity unit
                  - 'columnheader "Amount: activate to sort column ascending"':
                    - generic: Amount
              - rowgroup [ref=e393]:
                - row "No data available in table" [ref=e394]:
                  - cell "No data available in table" [ref=e395]
        - generic [ref=e398]:
          - heading "Grocycode" [level=4] [ref=e399]: Grocycode
          - paragraph [ref=e401]:
            - img [ref=e402]
          - paragraph [ref=e403]:
            - link "Download" [ref=e404] [cursor=pointer]:
              - /url: http://127.0.0.1:8106/product//grocycode?download=true
        - generic [ref=e406]:
          - generic [ref=e407]:
            - heading "Product specific QU conversions" [level=4] [ref=e408]
            - generic [ref=e409]:
              - link "Add" [ref=e410] [cursor=pointer]:
                - /url: http://127.0.0.1:8106/quantityunitconversion/new?embedded&product=
              - link "Show resolved conversions" [ref=e411] [cursor=pointer]:
                - /url: http://127.0.0.1:8106/quantityunitconversionsresolved?embedded&product=
          - generic [ref=e415]:
            - table [ref=e418]:
              - rowgroup [ref=e419]:
                - 'row "Quantity unit from: activate to sort column descending Quantity unit to: activate to sort column ascending Factor: activate to sort column ascending : activate to sort column ascending" [ref=e420]':
                  - columnheader [ref=e421]:
                    - link [ref=e422] [cursor=pointer]:
                      - /url: "#"
                  - 'columnheader "Quantity unit from: activate to sort column descending" [ref=e424] [cursor=pointer]': Quantity unit from
                  - 'columnheader "Quantity unit to: activate to sort column ascending" [ref=e425] [cursor=pointer]': Quantity unit to
                  - 'columnheader "Factor: activate to sort column ascending" [ref=e426] [cursor=pointer]': Factor
                  - 'columnheader ": activate to sort column ascending" [ref=e427] [cursor=pointer]'
            - table [ref=e429]:
              - rowgroup:
                - 'row "Quantity unit from: activate to sort column descending Quantity unit to: activate to sort column ascending Factor: activate to sort column ascending : activate to sort column ascending"':
                  - columnheader:
                    - link [ref=e430] [cursor=pointer]:
                      - /url: "#"
                  - 'columnheader "Quantity unit from: activate to sort column descending"':
                    - generic: Quantity unit from
                  - 'columnheader "Quantity unit to: activate to sort column ascending"':
                    - generic: Quantity unit to
                  - 'columnheader "Factor: activate to sort column ascending"':
                    - generic: Factor
                  - 'columnheader ": activate to sort column ascending"'
              - rowgroup [ref=e432]:
                - row "No data available in table" [ref=e433]:
                  - cell "No data available in table" [ref=e434]
        - generic [ref=e436]:
          - generic [ref=e437]:
            - heading "Picture" [level=4] [ref=e438]
            - generic [ref=e441]:
              - button "Browse No file selected Browse" [ref=e442]
              - text: Browse
              - generic [ref=e443]: No file selected Browse
          - paragraph [ref=e447]: No picture available
```

# Test source

```ts
  18119 |         urlBefore2 = page.url();
  18120 |       },
  18121 |       act: async () => {
  18122 |         outputs['04-edit.products_row_overview_link_class'] = await readOptional(page, [
  18123 |           { locator: page.locator('#products-table tr.even', { hasText: `${p.v1}` }).locator('td:nth-of-type(1) > a:nth-of-type(1)'), index: 0, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: '#products-table tr.even', hasText: `${p.v1}`, selector: 'td:nth-of-type(1) > a:nth-of-type(1)' }) },
  18124 |           { locator: page.locator('#products-table > tbody > tr:nth-of-type(4) > td:nth-of-type(1) > a:nth-of-type(1)'), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#products-table > tbody > tr:nth-of-type(4) > td:nth-of-type(1) > a:nth-of-type(1)' }) },
  18125 |           { locator: pointLocator(page, { x: 282, y: 332 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 282, y: 332, w: 32, h: 31, role: 'link', tag: 'a', vw: 1280, vh: 900 }), point: { x: 282, y: 332, w: 32, h: 31, role: 'link', tag: 'a', vw: 1280, vh: 900 } },
  18126 |         ], '04-edit s_545c55/2 target', { requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'attr', { attr: 'class' }), { drift: run.drift, kinds: [{"role":"link","tag":null}], label: 'products_row_overview_link_class' });
  18127 |         await echoRead(echoLedger, run, 'products_row_overview_link_class', '04-edit.products_row_overview_link_class', outputs['04-edit.products_row_overview_link_class'], '04-edit s_545c55/2', page, lastReadHit);
  18128 |         return { status: 'completed', value: undefined };
  18129 |       },
  18130 |       settle: async () => {
  18131 |         if (page.url() !== urlBefore2) await settle(page);
  18132 |       },
  18133 |       bind: async () => {
  18134 |       },
  18135 |       verify: async () => {
  18136 |         errorPageGate(page, '04-edit s_545c55/2');
  18137 |       },
  18138 |     });
  18139 | 
  18140 |     // @step 04-edit s_545c55/3
  18141 |     let urlBefore3 = '';
  18142 |     await runStepLifecycle({
  18143 |       prepare: async () => {
  18144 |         await settle(page);
  18145 |         urlBefore3 = page.url();
  18146 |       },
  18147 |       act: async () => {
  18148 |         outputs['04-edit.products_row_delete_button_class'] = await readOptional(page, [
  18149 |           { locator: page.locator('#products-table tr.even', { hasText: `${p.v1}` }).locator('td:nth-of-type(1) > a:nth-of-type(2)'), index: 0, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: '#products-table tr.even', hasText: `${p.v1}`, selector: 'td:nth-of-type(1) > a:nth-of-type(2)' }) },
  18150 |           { locator: page.locator('#products-table > tbody > tr:nth-of-type(4) > td:nth-of-type(1) > a:nth-of-type(2)'), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#products-table > tbody > tr:nth-of-type(4) > td:nth-of-type(1) > a:nth-of-type(2)' }) },
  18151 |           { locator: pointLocator(page, { x: 316, y: 332 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 316, y: 332, w: 30.3, h: 31, role: 'link', tag: 'a', vw: 1280, vh: 900 }), point: { x: 316, y: 332, w: 30.3, h: 31, role: 'link', tag: 'a', vw: 1280, vh: 900 } },
  18152 |         ], '04-edit s_545c55/3 target', { requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'attr', { attr: 'class' }), { drift: run.drift, kinds: [{"role":"link","tag":null}], label: 'products_row_delete_button_class' });
  18153 |         await echoRead(echoLedger, run, 'products_row_delete_button_class', '04-edit.products_row_delete_button_class', outputs['04-edit.products_row_delete_button_class'], '04-edit s_545c55/3', page, lastReadHit);
  18154 |         return { status: 'completed', value: undefined };
  18155 |       },
  18156 |       settle: async () => {
  18157 |         if (page.url() !== urlBefore3) await settle(page);
  18158 |       },
  18159 |       bind: async () => {
  18160 |       },
  18161 |       verify: async () => {
  18162 |         errorPageGate(page, '04-edit s_545c55/3');
  18163 |       },
  18164 |     });
  18165 | 
  18166 |     // @step 04-edit s_545c55/4
  18167 |     let urlBefore4 = '';
  18168 |     let alertsBefore4: string[] = [];
  18169 |     let alertsAfter4: ObservedAlerts | null = null;
  18170 |     let nav4: NavigationTarget = { url: '' };
  18171 |     await runStepLifecycle({
  18172 |       prepare: async () => {
  18173 |         await settle(page);
  18174 |         urlBefore4 = page.url();
  18175 |         alertsBefore4 = (await liveAlerts(page)) ?? [];
  18176 |       },
  18177 |       act: async () => {
  18178 |         nav4 = navigationTarget('http://127.0.0.1:8106/product/298407', page, volatile1, '04-edit s_545c55/4');
  18179 |         await page.goto(nav4.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  18180 |         return { status: 'completed', value: undefined };
  18181 |       },
  18182 |       settle: async () => {
  18183 |         if (page.url() !== urlBefore4) await settle(page);
  18184 |         alertsAfter4 = await settledAlerts(page);
  18185 |       },
  18186 |       bind: async () => {
  18187 |       },
  18188 |       verify: async () => {
  18189 |         errorPageGate(page, '04-edit s_545c55/4');
  18190 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav4.url, landed, '04-edit s_545c55/4'); if (landing) throw new Error(landing); }
  18191 |         alertGate(alertsBefore4, alertsAfter4, { where: '04-edit s_545c55/4', isRead: false, params: p, navigatedToStale: nav4.stale });
  18192 |       },
  18193 |     });
  18194 | 
  18195 |     if (observedNothing([{"tool":"read","args":{"what":"url"},"locators":{"target":[]},"label":"current_url"},{"tool":"read","args":{"what":"attr"},"locators":{"target":[0,0,0]},"label":"products_row_overview_link_class"},{"tool":"read","args":{"what":"attr"},"locators":{"target":[0,0,0]},"label":"products_row_delete_button_class"},{"tool":"goto","args":{"what":"text"},"locators":{"target":[]}}], skippedReads.length - readsBefore1)) {
  18196 |       throw new Error('s_545c55: every read of this read-only procedure was skipped — the page is not the one it was recorded reading');
  18197 |     }
  18198 | 
  18199 |     // s_7f6c08: Edit '{{v1}}' and set its default location to the existing location exactly '{{v3}}' and its product group to the existing group exactly '{{v4}}'. Save and verify both values on the saved product.
  18200 |     // recorded on a page matching http://127.0.0.1:8106/product/:id
  18201 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  18202 |     const volatile2: UrlSegDiff[] = [];
  18203 | 
  18204 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  18205 |     await preconditionGate('http://127.0.0.1:8106/product/:id', page.url(), p, '04-edit s_7f6c08', cosine(recordedFingerprint('04-edit', 's_7f6c08'), (await fingerprintPage(page)) ?? undefined), [{"at":"p1","step":1}]);
  18206 |     // identity: this must be the record the flow is working on, not another of the same shape.
  18207 |     {
  18208 |       let seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  18209 |       if (!urlRecordParts('http://127.0.0.1:8106/product/:id', page.url(), p)) {
  18210 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  18211 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  18212 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  18213 |           seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  18214 |         }
  18215 |       }
  18216 |       if (seen.presence !== 'present') {
  18217 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8106/product/:id', page.url(), p, `${p.v1}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  18218 |         if (verdict.warning) logWarning('04-edit s_7f6c08: ' + verdict.warning);
> 18219 |         if (!verdict.pass) throw new Error('04-edit s_7f6c08: identity: {{v1}} is not confirmed on this page');
        |                                  ^ Error: 04-edit s_7f6c08: identity: {{v1}} is not confirmed on this page
  18220 |       }
  18221 |     }
  18222 |     // identity: this must be the record the flow is working on, not another of the same shape.
  18223 |     {
  18224 |       let seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  18225 |       if (!urlRecordParts('http://127.0.0.1:8106/product/:id', page.url(), p)) {
  18226 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  18227 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  18228 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  18229 |           seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  18230 |         }
  18231 |       }
  18232 |       if (seen.presence !== 'present') {
  18233 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8106/product/:id', page.url(), p, `${p.v2}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  18234 |         if (verdict.warning) logWarning('04-edit s_7f6c08: ' + verdict.warning);
  18235 |         if (!verdict.pass) throw new Error('04-edit s_7f6c08: identity: {{v2}} is not confirmed on this page');
  18236 |       }
  18237 |     }
  18238 | 
  18239 |     // @step 04-edit s_7f6c08/1
  18240 |     let urlBefore5 = '';
  18241 |     let alertsBefore5: string[] = [];
  18242 |     let alertsAfter5: ObservedAlerts | null = null;
  18243 |     let obs5: ActionObservation | null = null;
  18244 |     await runStepLifecycle({
  18245 |       prepare: async () => {
  18246 |         await settle(page);
  18247 |         urlBefore5 = page.url();
  18248 |         alertsBefore5 = (await liveAlerts(page, 2)) ?? [];
  18249 |       },
  18250 |       act: async () => {
  18251 |         const hit1 = await pick(page, [
  18252 |           { locator: page.locator('#location_id'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#location_id' }) },
  18253 |           { locator: page.getByLabel('Default location'), index: 1, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'Default location' }) },
  18254 |           { locator: pointLocator(page, { x: 507, y: 806 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 507, y: 806, w: 492.5, h: 38, role: 'combobox', tag: 'select', vw: 1280, vh: 900 }), point: { x: 507, y: 806, w: 492.5, h: 38, role: 'combobox', tag: 'select', vw: 1280, vh: 900 } },
  18255 |         ], '04-edit s_7f6c08/1 target', { stayOnOrigin: 'http://127.0.0.1:8106', waitMs: RESOLVE_WAIT_MS }, { drift: run.drift });
  18256 |         noteInteraction(echoLedger, ['Default location']);
  18257 |         await markActed(page, hit1.locator, echoLedger, ['Default location'], 's_7f6c08/1', 'select');
  18258 |         obs5 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true, graceFromDispatch: true });
  18259 |         await select(hit1.locator, `${p.v3}`).catch(actionFailed);
  18260 |         return { status: 'completed', value: undefined };
  18261 |       },
  18262 |       settle: async () => {
  18263 |         if (obs5) await obs5.settle();
  18264 |         else if (page.url() !== urlBefore5) await settle(page);
  18265 |         alertsAfter5 = await settledAlerts(page, 2);
  18266 |       },
  18267 |       bind: async () => {
  18268 |         bindPart(p, 'd1', await urlPartWhen(page, 'p1', urlBefore5)); // recorded example: 298407
  18269 |         // This step creates a record; expose this run's identifier for teardown.
  18270 |         const minted5 = changedCreation(urlPart(urlBefore5, 'p1'), p.d1);
  18271 |         if (minted5) {
  18272 |           outputs['04-edit.minted'] = minted5;
  18273 |           if (!run.created.includes(minted5)) run.created.push(minted5);
  18274 |         }
  18275 |       },
  18276 |       verify: async () => {
  18277 |         errorPageGate(page, '04-edit s_7f6c08/1');
  18278 |         await urlEffect(page, 'http://127.0.0.1:8106/product/{{d1}}', p, '04-edit s_7f6c08/1', volatile2);
  18279 |         alertGate(alertsBefore5, alertsAfter5, { where: '04-edit s_7f6c08/1', isRead: false, params: p });
  18280 |       },
  18281 |     });
  18282 | 
  18283 |     // @step 04-edit s_7f6c08/2
  18284 |     let urlBefore6 = '';
  18285 |     let alertsBefore6: string[] = [];
  18286 |     let alertsAfter6: ObservedAlerts | null = null;
  18287 |     let linesBefore6: string[] | null = null;
  18288 |     let linesAfter6: string[] | null = null;
  18289 |     let positional6 = false;
  18290 |     let obs6: ActionObservation | null = null;
  18291 |     await runStepLifecycle({
  18292 |       prepare: async () => {
  18293 |         await settle(page);
  18294 |         urlBefore6 = page.url();
  18295 |         alertsBefore6 = (await liveAlerts(page, 2)) ?? [];
  18296 |         linesBefore6 = await capturePageLines(page, 2);
  18297 |       },
  18298 |       act: async () => {
  18299 |         const hit2 = await pick(page, [
  18300 |           { locator: page.locator('#product_group_id'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#product_group_id' }) },
  18301 |           { locator: page.locator('#product-form div.form-group', { hasText: `Beverages Healthy ${p.v4} ${p.v4} ${p.v4} & Sweets` }).locator('select'), index: 1, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: '#product-form div.form-group', hasText: `Beverages Healthy ${p.v4} ${p.v4} ${p.v4} & Sweets`, selector: 'select' }) },
  18302 |           { locator: page.getByRole('combobox', { name: roleName('Product group'), exact: true }), index: 2, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'combobox', name: 'Product group' }) },
  18303 |           { locator: page.getByLabel('Product group'), index: 3, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'Product group' }) },
  18304 |           { locator: pointLocator(page, { x: 507, y: 1710 }), index: 4, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 507, y: 1710, w: 492.5, h: 38, role: 'combobox', tag: 'select', vw: 1280, vh: 900 }), point: { x: 507, y: 1710, w: 492.5, h: 38, role: 'combobox', tag: 'select', vw: 1280, vh: 900 } },
  18305 |         ], '04-edit s_7f6c08/2 target', { stayOnOrigin: 'http://127.0.0.1:8106', waitMs: RESOLVE_WAIT_MS }, { drift: run.drift });
  18306 |         positional6 = positional6 || hit2.structural || hit2.nth !== undefined;
  18307 |         noteInteraction(echoLedger, ['Product group', 'Product group']);
  18308 |         await markActed(page, hit2.locator, echoLedger, ['Product group', 'Product group'], 's_7f6c08/2', 'select');
  18309 |         obs6 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true, graceFromDispatch: true });
  18310 |         await select(hit2.locator, `${p.v4}`).catch(actionFailed);
  18311 |         return { status: 'completed', value: undefined };
  18312 |       },
  18313 |       settle: async () => {
  18314 |         if (obs6) await obs6.settle();
  18315 |         else if (page.url() !== urlBefore6) await settle(page);
  18316 |         linesAfter6 = await capturePageLines(page, 2);
  18317 |         alertsAfter6 = await settledAlerts(page, 2);
  18318 |       },
  18319 |       bind: async () => {
```