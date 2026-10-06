# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hbgc2.spec.ts >> hbgc2
- Location: hbgc2.spec.ts:9:1

# Error details

```
Error: 03-create s_d57f06: identity: {{v1}} is not confirmed on this page
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
  17505 |           act: async () => {
  17506 |             const hit10 = await pickOrNavigate(page, [
  17507 |               { locator: page.getByRole('button', { name: roleName('Save & return to products'), exact: true }), index: 0, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'button', name: 'Save & return to products' }) },
  17508 |               { locator: page.locator('#product-form > div:nth-of-type(33) > button:nth-of-type(2)'), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#product-form > div:nth-of-type(33) > button:nth-of-type(2)' }) },
  17509 |               { locator: pointLocator(page, { x: 507, y: 873 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 507, y: 873, w: 205.4, h: 38, role: 'button', tag: 'button', vw: 1280, vh: 900 }), point: { x: 507, y: 873, w: 205.4, h: 38, role: 'button', tag: 'button', vw: 1280, vh: 900 } },
  17510 |             ], '03-create s_d7af92/9 target', { stayOnOrigin: 'http://127.0.0.1:8106', waitMs: RESOLVE_WAIT_MS }, 'http://127.0.0.1:8106/products?product=:id', p, { drift: run.drift });
  17511 |             if (!hit10) return { status: 'skipped' };
  17512 |             if (await positionalClick(page, hit10, [0], [2], [], {"by":"role","role":"button","name":"Save & return to products"}, p, '03-create s_d7af92/9', 2)) return { status: 'skipped' };
  17513 |             positional10 = positional10 || hit10.structural || hit10.nth !== undefined;
  17514 |             noteInteraction(echoLedger, ['Save & return to products']);
  17515 |             await markActed(page, hit10.locator, echoLedger, ['Save & return to products'], 's_d7af92/9', 'click');
  17516 |             obs10 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true });
  17517 |             await click(hit10.locator, { obs: obs10 }).catch(actionFailed);
  17518 |             return { status: 'completed', value: undefined };
  17519 |           },
  17520 |           settle: async () => {
  17521 |             if (obs10) await obs10.settle();
  17522 |             else if (page.url() !== urlBefore10) await settle(page);
  17523 |             linesAfter10 = await capturePageLines(page, 2);
  17524 |             alertsAfter10 = await settledAlerts(page, 2);
  17525 |           },
  17526 |           bind: async () => {
  17527 |           },
  17528 |           verify: async () => {
  17529 |             errorPageGate(page, '03-create s_d7af92/9');
  17530 |             try { await urlEffect(page, 'http://127.0.0.1:8106/products?product=:id', p, '03-create s_d7af92/9', volatile2, obs10?.link()); } catch (err) { urlFailed10 = true; throw err; }
  17531 |             // The step's recorded page changes, judged by the daemon's own effect gate (see expectChanges):
  17532 |             //   - link "Products"
  17533 |             //   - link "Locations"
  17534 |             //   - link "Stores"
  17535 |             //   - link "Quantity units"
  17536 |             //   - link "Product groups"
  17537 |             const changes10 = await expectChanges(page, ['- link "Products"', '- link "Locations"', '- link "Stores"', '- link "Quantity units"', '- link "Product groups"'], p, { tag: '03-create s_d7af92/9', tool: 'click', leftByLink: leftByLink('http://127.0.0.1:8106/products?product=:id', page.url(), p, obs10?.link()), positionalResolution: positional10 }, linesBefore10, 2, linesAfter10);
  17538 |             noteCommit(echoLedger, liveLines(changes10.inDiff ?? [], p, counterNames(siteFactsAt(page.url()), page.url())), 's_d7af92/9');
  17539 |             for (const slot of committedSlots('click', changes10.inDiff)) typedCommitted.add(slot);
  17540 |             alertGate(alertsBefore10, alertsAfter10, { where: '03-create s_d7af92/9', isRead: false, params: p, effectConfirmed: changes10.confirmed === true });
  17541 |           },
  17542 |         });
  17543 |         break;
  17544 |       } catch (err) {
  17545 |         if (attempt > 0 || !urlFailed10 || !(await standingFillsLost(page, filled2))) throw err;
  17546 |         urlFailed10 = false;
  17547 |         rearmStandingFills(filled2);
  17548 |         logWarning('03-create s_d7af92/9: ' + (err instanceof Error ? err.message : String(err)) + ' — the page replaced its document under this click and its form is empty again, so it is repeated once after a refill');
  17549 |       }
  17550 |     }
  17551 | 
  17552 |     // s_9ac237: Create and save a product named exactly '{{v2}}'. Its rich-text description must contain exactly one paragraph including the text '{{v1}}'. Verify the saved product and report its displayed name and d…
  17553 |     // recorded on a page matching http://127.0.0.1:8106/products?product=:id
  17554 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  17555 |     const volatile3: UrlSegDiff[] = [];
  17556 | 
  17557 |     // @step 03-create s_9ac237/1
  17558 |     let urlBefore11 = '';
  17559 |     let alertsBefore11: string[] = [];
  17560 |     let alertsAfter11: ObservedAlerts | null = null;
  17561 |     let nav11: NavigationTarget = { url: '' };
  17562 |     await runStepLifecycle({
  17563 |       prepare: async () => {
  17564 |         await settle(page);
  17565 |         urlBefore11 = page.url();
  17566 |         alertsBefore11 = (await liveAlerts(page)) ?? [];
  17567 |       },
  17568 |       act: async () => {
  17569 |         nav11 = navigationTarget('http://127.0.0.1:8106/product/95708', page, volatile3, '03-create s_9ac237/1');
  17570 |         await page.goto(nav11.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  17571 |         return { status: 'completed', value: undefined };
  17572 |       },
  17573 |       settle: async () => {
  17574 |         if (page.url() !== urlBefore11) await settle(page);
  17575 |         alertsAfter11 = await settledAlerts(page);
  17576 |       },
  17577 |       bind: async () => {
  17578 |       },
  17579 |       verify: async () => {
  17580 |         errorPageGate(page, '03-create s_9ac237/1');
  17581 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav11.url, landed, '03-create s_9ac237/1'); if (landing) throw new Error(landing); }
  17582 |         alertGate(alertsBefore11, alertsAfter11, { where: '03-create s_9ac237/1', isRead: false, params: p, navigatedToStale: nav11.stale });
  17583 |       },
  17584 |     });
  17585 | 
  17586 |     // s_d57f06: Create and save a product named exactly '{{v2}}'. Its rich-text description must contain exactly one paragraph including the text '{{v1}}'. Verify the saved product and report its displayed name and d…
  17587 |     // recorded on a page matching http://127.0.0.1:8106/product/:id
  17588 |     const readsBefore4 = skippedReads.length;
  17589 | 
  17590 |     // the recording's page fingerprint decides a soft url match here, measured as replay measures it
  17591 |     await preconditionGate('http://127.0.0.1:8106/product/:id', page.url(), p, '03-create s_d57f06', cosine(recordedFingerprint('03-create', 's_d57f06'), (await fingerprintPage(page)) ?? undefined));
  17592 |     // identity: this must be the record the flow is working on, not another of the same shape.
  17593 |     {
  17594 |       let seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  17595 |       if (!urlRecordParts('http://127.0.0.1:8106/product/:id', page.url(), p)) {
  17596 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  17597 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  17598 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  17599 |           seen = await confirmPresence(page, [`${p.v1}`], 2, { whole: true });
  17600 |         }
  17601 |       }
  17602 |       if (seen.presence !== 'present') {
  17603 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8106/product/:id', page.url(), p, `${p.v1}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  17604 |         if (verdict.warning) logWarning('03-create s_d57f06: ' + verdict.warning);
> 17605 |         if (!verdict.pass) throw new Error('03-create s_d57f06: identity: {{v1}} is not confirmed on this page');
        |                                  ^ Error: 03-create s_d57f06: identity: {{v1}} is not confirmed on this page
  17606 |       }
  17607 |     }
  17608 |     // identity: this must be the record the flow is working on, not another of the same shape.
  17609 |     {
  17610 |       let seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  17611 |       if (!urlRecordParts('http://127.0.0.1:8106/product/:id', page.url(), p)) {
  17612 |         const deadline = Date.now() + IDENTITY_WAIT_MS;
  17613 |         while (seen.presence !== 'present' && Date.now() < deadline) {
  17614 |           await new Promise((r) => setTimeout(r, Math.max(1, Math.min(IDENTITY_POLL_MS, deadline - Date.now()))));
  17615 |           seen = await confirmPresence(page, [`${p.v2}`], 2, { whole: true });
  17616 |         }
  17617 |       }
  17618 |       if (seen.presence !== 'present') {
  17619 |         const verdict = await identityMarkerVerdictWithFacts(siteFactsAt(page.url()), 'http://127.0.0.1:8106/product/:id', page.url(), p, `${p.v2}`, { presence: seen.presence, lines: async () => (await captureLines(page, 2).catch(() => null))?.lines ?? null, title: () => page.title() });
  17620 |         if (verdict.warning) logWarning('03-create s_d57f06: ' + verdict.warning);
  17621 |         if (!verdict.pass) throw new Error('03-create s_d57f06: identity: {{v2}} is not confirmed on this page');
  17622 |       }
  17623 |     }
  17624 | 
  17625 |     // @step 03-create s_d57f06/1
  17626 |     let urlBefore12 = '';
  17627 |     await runStepLifecycle({
  17628 |       prepare: async () => {
  17629 |         await settle(page);
  17630 |         urlBefore12 = page.url();
  17631 |       },
  17632 |       act: async () => {
  17633 |         outputs['03-create.description_text'] = await readOptional(page, [
  17634 |           { locator: page.locator('.note-editable'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '.note-editable' }) },
  17635 |           { locator: page.locator('#product-form > div:nth-of-type(4) > div > div:nth-of-type(3) > div:nth-of-type(2)'), index: 1, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#product-form > div:nth-of-type(4) > div > div:nth-of-type(3) > div:nth-of-type(2)' }) },
  17636 |           { locator: pointLocator(page, { x: 507, y: 582 }), index: 2, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 507, y: 582, w: 490.5, h: 300, role: 'textbox', tag: 'div', vw: 1280, vh: 900 }), point: { x: 507, y: 582, w: 490.5, h: 300, role: 'textbox', tag: 'div', vw: 1280, vh: 900 } },
  17637 |         ], '03-create s_d57f06/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift, kinds: [{"role":"textbox","tag":null}], label: 'description_text' });
  17638 |         await echoRead(echoLedger, run, 'description_text', '03-create.description_text', outputs['03-create.description_text'], '03-create s_d57f06/1', page, lastReadHit);
  17639 |         return { status: 'completed', value: undefined };
  17640 |       },
  17641 |       settle: async () => {
  17642 |         if (page.url() !== urlBefore12) await settle(page);
  17643 |       },
  17644 |       bind: async () => {
  17645 |       },
  17646 |       verify: async () => {
  17647 |         errorPageGate(page, '03-create s_d57f06/1');
  17648 |       },
  17649 |     });
  17650 | 
  17651 |     // @step 03-create s_d57f06/2
  17652 |     let urlBefore13 = '';
  17653 |     await runStepLifecycle({
  17654 |       prepare: async () => {
  17655 |         await settle(page);
  17656 |         urlBefore13 = page.url();
  17657 |       },
  17658 |       act: async () => {
  17659 |         outputs['03-create.product_name'] = await readOptional(page, [
  17660 |           { locator: page.locator('#name'), index: 0, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#name' }) },
  17661 |           { locator: page.getByRole('textbox', { name: roleName('Name'), exact: true }), index: 1, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'Name' }) },
  17662 |           { locator: page.getByLabel('Name'), index: 2, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'Name' }) },
  17663 |           { locator: pointLocator(page, { x: 507, y: 157 }), index: 3, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 507, y: 157, w: 492.5, h: 38, role: 'textbox', tag: 'input', vw: 1280, vh: 900 }), point: { x: 507, y: 157, w: 492.5, h: 38, role: 'textbox', tag: 'input', vw: 1280, vh: 900 } },
  17664 |         ], '03-create s_d57f06/2 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift, kinds: [{"role":"textbox","tag":null},{"role":"textbox","tag":null}], label: 'product_name' });
  17665 |         await echoRead(echoLedger, run, 'product_name', '03-create.product_name', outputs['03-create.product_name'], '03-create s_d57f06/2', page, lastReadHit);
  17666 |         return { status: 'completed', value: undefined };
  17667 |       },
  17668 |       settle: async () => {
  17669 |         if (page.url() !== urlBefore13) await settle(page);
  17670 |       },
  17671 |       bind: async () => {
  17672 |       },
  17673 |       verify: async () => {
  17674 |         errorPageGate(page, '03-create s_d57f06/2');
  17675 |       },
  17676 |     });
  17677 | 
  17678 |     // @step 03-create s_d57f06/3
  17679 |     let urlBefore14 = '';
  17680 |     await runStepLifecycle({
  17681 |       prepare: async () => {
  17682 |         await settle(page);
  17683 |         urlBefore14 = page.url();
  17684 |       },
  17685 |       act: async () => {
  17686 |         outputs['03-create.description_html'] = await readOptional(page, [
  17687 |           { locator: page.getByLabel('Description'), index: 0, structural: false, kind: 'label', carries: JSON.stringify({ kind: 'label', label: 'Description' }) },
  17688 |           { locator: page.locator('#description'), index: 1, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#description' }) },
  17689 |           { locator: page.locator('#description'), index: 2, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#description' }) },
  17690 |         ], '03-create s_d57f06/3 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift });
  17691 |         await echoRead(echoLedger, run, 'description_html', '03-create.description_html', outputs['03-create.description_html'], '03-create s_d57f06/3', page, lastReadHit);
  17692 |         return { status: 'completed', value: undefined };
  17693 |       },
  17694 |       settle: async () => {
  17695 |         if (page.url() !== urlBefore14) await settle(page);
  17696 |       },
  17697 |       bind: async () => {
  17698 |       },
  17699 |       verify: async () => {
  17700 |         errorPageGate(page, '03-create s_d57f06/3');
  17701 |       },
  17702 |     });
  17703 | 
  17704 |     if (observedNothing([{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0]},"label":"description_text"},{"tool":"read","args":{"what":"value"},"locators":{"target":[0,0,0,0]},"label":"product_name"},{"tool":"read","args":{"what":"text"},"locators":{"target":[0,0,0]},"label":"description_html"}], skippedReads.length - readsBefore4)) {
  17705 |       throw new Error('s_d57f06: every read of this read-only procedure was skipped — the page is not the one it was recorded reading');
```