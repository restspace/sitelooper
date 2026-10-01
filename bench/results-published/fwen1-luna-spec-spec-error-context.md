# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwen1-luna.spec.ts >> fwen1-luna
- Location: fwen1-luna.spec.ts:9:1

# Error details

```
Error: 02-find s_548f8c/3: the recorded page change did not appear

02-find s_548f8c/3: the recorded page change did not appear

expect(received).toBeNull()

Received: "after step 02-find s_548f8c/3 none of the 1 recorded page change(s) appeared (e.g. \"- button \\\"{{*}} Filter Applied\\\"\"), and that could not be confirmed: capture incomplete (the element cap was reached (4000 walked)) — the step ran but its effect was not established"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation [ref=e4]:
      - generic [ref=e5]:
        - link "App Logo" [ref=e6] [cursor=pointer]:
          - /url: /app
          - img "App Logo" [ref=e7]
        - list [ref=e8]:
          - listitem [ref=e9]:
            - link "Selling" [ref=e10] [cursor=pointer]:
              - /url: /app/selling
          - listitem [ref=e11]:
            - link "Sales Order" [ref=e12] [cursor=pointer]:
              - /url: /app/sales-order
          - listitem [ref=e13]:
            - link "SAL-ORD-2026-00002":
              - /url: /app/sales-order/SAL-ORD-2026-00002
        - generic [ref=e14]:
          - search [ref=e15]:
            - generic [ref=e16]:
              - combobox "Search or type a command (Ctrl + G)" [ref=e18]
              - img [ref=e20]
          - list [ref=e22]:
            - listitem [ref=e23]:
              - button "No new notifications" [ref=e24] [cursor=pointer]:
                - generic [ref=e25]:
                  - generic [ref=e26]: No new notifications
                  - img [ref=e27]
            - listitem [ref=e29]
            - listitem [ref=e30]:
              - button "Help Dropdown" [ref=e31] [cursor=pointer]:
                - generic [ref=e32]:
                  - text: Help
                  - img [ref=e33]
            - listitem [ref=e35]:
              - button "User Menu" [ref=e36] [cursor=pointer]:
                - generic "Administrator" [ref=e37]:
                  - generic "Administrator" [ref=e38]: A
    - generic [ref=e40]:
      - generic [ref=e43]:
        - generic [ref=e44]:
          - button "Toggle Sidebar" [ref=e45] [cursor=pointer]:
            - img [ref=e46]
          - generic [ref=e50]:
            - 'heading "Seed: Beacon Supplies" [level=3] [ref=e51] [cursor=pointer]'
            - generic [ref=e53]: To Deliver and Bill
        - generic [ref=e54]:
          - generic [ref=e55]:
            - button "Update Items" [ref=e56] [cursor=pointer]
            - button "Status" [ref=e58] [cursor=pointer]:
              - text: Status
              - img [ref=e59]
            - button "Create" [ref=e62] [cursor=pointer]:
              - text: Create
              - img [ref=e63]
          - generic [ref=e65]:
            - generic [ref=e66]:
              - button [ref=e67] [cursor=pointer]:
                - img [ref=e68]
              - button [ref=e70] [cursor=pointer]:
                - img [ref=e71]
              - button [ref=e73] [cursor=pointer]:
                - img [ref=e74]
            - button "Menu" [ref=e77] [cursor=pointer]:
              - img [ref=e80]
            - button "Cancel" [ref=e81] [cursor=pointer]:
              - generic [ref=e82]: Cancel
      - generic [ref=e86]:
        - generic [ref=e88]:
          - list [ref=e89]:
            - listitem [ref=e90]:
              - generic [ref=e91]:
                - generic [ref=e92]:
                  - img [ref=e93]
                  - text: Assigned To
                - button [ref=e95] [cursor=pointer]:
                  - img [ref=e96]
          - list [ref=e98]:
            - listitem [ref=e99]:
              - generic [ref=e100]:
                - generic [ref=e101]:
                  - img [ref=e102]
                  - text: Attachments
                - button [ref=e104] [cursor=pointer]:
                  - img [ref=e105]
          - list [ref=e107]:
            - listitem [ref=e108]:
              - generic [ref=e109]:
                - generic [ref=e110]:
                  - img [ref=e111]
                  - text: Tags
                - button [ref=e113] [cursor=pointer]:
                  - img [ref=e114]
          - list [ref=e116]:
            - listitem [ref=e117]:
              - generic [ref=e118]:
                - generic [ref=e119]:
                  - img [ref=e120]
                  - text: Share
                - button [ref=e122] [cursor=pointer]:
                  - img [ref=e123]
          - list [ref=e125]:
            - generic:
              - listitem
            - listitem [ref=e126]
          - list [ref=e127]:
            - listitem [ref=e128]:
              - generic [ref=e129]:
                - generic [ref=e131]:
                  - img [ref=e132]
                  - generic [ref=e134]: "0"
                - generic [ref=e135]: ·
                - generic [ref=e136] [cursor=pointer]:
                  - img [ref=e137]
                  - generic [ref=e139]: "0"
              - generic [ref=e140] [cursor=pointer]: Follow
          - separator [ref=e141]
          - list [ref=e142]:
            - listitem
            - listitem [ref=e143]: You last edited this · 15 minutes ago
            - listitem [ref=e144]: You created this · 15 minutes ago
        - generic [ref=e145]:
          - generic [ref=e150]:
            - tablist [ref=e152]:
              - listitem [ref=e153]:
                - tab "Details" [selected] [ref=e154] [cursor=pointer]
              - listitem [ref=e155]:
                - tab "Address & Contact" [ref=e156] [cursor=pointer]
              - listitem [ref=e157]:
                - tab "Terms" [ref=e158] [cursor=pointer]
              - listitem [ref=e159]:
                - tab "More Info" [ref=e160] [cursor=pointer]
              - listitem [ref=e161]:
                - tab "Connections" [ref=e162] [cursor=pointer]
            - generic [ref=e163]:
              - tabpanel "Details" [ref=e164]:
                - generic [ref=e166]:
                  - generic [ref=e168]:
                    - text: "*"
                    - generic [ref=e169]:
                      - generic [ref=e170]:
                        - generic [ref=e172]: Customer *
                        - generic [ref=e173]:
                          - 'link "Seed: Beacon Supplies" [ref=e175] [cursor=pointer]':
                            - /url: /app/customer/Seed%3A%20Beacon%20Supplies
                          - paragraph
                      - generic: customer
                    - generic [ref=e176]:
                      - generic [ref=e177]:
                        - generic [ref=e179]: Order Type *
                        - generic [ref=e180]:
                          - generic [ref=e181]: Sales
                          - paragraph
                      - generic: order_type
                  - generic [ref=e183]:
                    - generic [ref=e184]:
                      - generic [ref=e185]:
                        - generic [ref=e187]: Date *
                        - generic [ref=e188]:
                          - generic [ref=e189]: 2026-10-01
                          - paragraph
                      - generic: transaction_date
                    - generic [ref=e190]:
                      - generic [ref=e191]:
                        - generic [ref=e193]: Delivery Date
                        - generic [ref=e194]:
                          - textbox [ref=e196]: 2026-12-31
                          - paragraph
                      - generic: delivery_date
                  - generic [ref=e198]:
                    - generic [ref=e199]:
                      - generic [ref=e200]:
                        - generic [ref=e202]: Customer's Purchase Order
                        - generic [ref=e203]:
                          - textbox [ref=e205]
                          - paragraph
                      - generic: po_no
                    - text: "*"
                - generic [ref=e206]:
                  - generic [ref=e207] [cursor=pointer]:
                    - text: Currency and Price List
                    - img [ref=e209]
                  - text: "* * * *"
                - generic [ref=e215]:
                  - generic: items
                  - generic [ref=e216]:
                    - generic [ref=e217]: Items
                    - generic [ref=e219]:
                      - generic [ref=e222]:
                        - generic [ref=e223]:
                          - checkbox [disabled]
                        - generic [ref=e224]: No.
                        - generic "Item Code" [ref=e225]:
                          - generic [ref=e226]: Item Code *
                        - generic "Delivery Date" [ref=e227]:
                          - generic [ref=e228]: Delivery Date *
                        - generic "Quantity" [ref=e229]:
                          - generic [ref=e230]: Quantity *
                        - generic "Rate (USD)" [ref=e231]:
                          - generic [ref=e232]: Rate (USD)
                        - generic "Amount (USD)" [ref=e233]:
                          - generic [ref=e234]: Amount (USD)
                        - img [ref=e237] [cursor=pointer]
                      - generic [ref=e242] [cursor=pointer]:
                        - generic [ref=e243]:
                          - checkbox [disabled]
                        - generic [ref=e244]: "1"
                        - link "Bench Gadget" [ref=e247]:
                          - /url: /app/item/Bench%20Gadget
                        - generic [ref=e249]: 2026-12-31
                        - generic [ref=e252]: "1"
                        - generic [ref=e255]: $ 125.00
                        - generic [ref=e258]: $ 125.00
                        - img [ref=e262]
                    - button "Download" [ref=e267] [cursor=pointer]
                - generic [ref=e269]:
                  - generic [ref=e272]:
                    - generic [ref=e273]:
                      - generic [ref=e275]: Total Quantity
                      - generic [ref=e276]:
                        - generic [ref=e277]: "1"
                        - paragraph
                    - generic: total_qty
                  - generic [ref=e281]:
                    - generic [ref=e282]:
                      - generic [ref=e284]: Total (USD)
                      - generic [ref=e285]:
                        - generic [ref=e286]: $ 125.00
                        - paragraph
                    - generic: total
                - generic [ref=e287]:
                  - generic [ref=e288]: Taxes
                  - generic [ref=e292]:
                    - generic [ref=e293]:
                      - generic [ref=e294]:
                        - generic [ref=e295]:
                          - checkbox "Is customer exempted from sales tax?" [disabled]
                        - generic [ref=e296]: Is customer exempted from sales tax?
                      - paragraph
                    - generic: exempt_from_sales_tax
                - text: "* *"
                - generic [ref=e304]:
                  - generic [ref=e305]:
                    - generic [ref=e307]: Total Taxes and Charges (USD)
                    - generic [ref=e308]:
                      - generic [ref=e309]: $ 0.00
                      - paragraph
                  - generic: total_taxes_and_charges
                - generic [ref=e310]:
                  - generic [ref=e311]: Totals
                  - generic [ref=e315]:
                    - generic [ref=e316]:
                      - generic [ref=e317]:
                        - generic [ref=e319]: Grand Total (USD)
                        - generic [ref=e320]:
                          - generic [ref=e321]: $ 125.00
                          - paragraph
                      - generic: grand_total
                    - generic [ref=e322]:
                      - generic [ref=e323]:
                        - generic [ref=e325]: Rounding Adjustment (USD)
                        - generic [ref=e326]:
                          - generic [ref=e327]: $ 0.00
                          - paragraph
                      - generic: rounding_adjustment
                    - generic [ref=e328]:
                      - generic [ref=e329]:
                        - generic [ref=e331]: Rounded Total (USD)
                        - generic [ref=e332]:
                          - generic [ref=e333]: $ 125.00
                          - paragraph
                      - generic: rounded_total
                    - generic [ref=e334]:
                      - generic [ref=e335]:
                        - generic [ref=e337]: In Words (USD)
                        - generic [ref=e338]:
                          - generic [ref=e339]: USD One Hundred And Twenty Five only.
                          - paragraph
                      - generic: in_words
                    - generic [ref=e340]:
                      - generic [ref=e341]:
                        - generic [ref=e343]: Advance Paid
                        - generic [ref=e344]:
                          - generic [ref=e345]: $ 0.00
                          - paragraph
                      - generic: advance_paid
                    - generic [ref=e346]:
                      - generic [ref=e347]:
                        - generic [ref=e348]:
                          - generic [ref=e349]:
                            - checkbox "Disable Rounded Total" [disabled]
                          - generic [ref=e350]: Disable Rounded Total
                        - paragraph
                      - generic: disable_rounded_total
                - generic [ref=e352] [cursor=pointer]:
                  - text: Additional Discount
                  - img [ref=e354]
              - text: "* * * *"
          - generic [ref=e357]:
            - generic [ref=e358]:
              - generic [ref=e360]:
                - generic [ref=e361]: Comments
                - generic [ref=e362]:
                  - generic "Administrator" [ref=e363]:
                    - generic "Administrator" [ref=e364]: A
                  - generic [ref=e365]:
                    - generic: comment
                    - generic [ref=e366]:
                      - generic [ref=e367]:
                        - text: Type a reply / comment
                        - paragraph [ref=e368]
                      - text: ×
              - generic [ref=e369]:
                - generic [ref=e370]:
                  - heading "Activity" [level=4] [ref=e371]
                  - button "New Email" [ref=e375] [cursor=pointer]:
                    - img [ref=e376]
                    - text: New Email
                - generic [ref=e378]:
                  - generic [ref=e381]:
                    - text: You created this
                    - generic [ref=e382]: · 15 minutes ago
                  - generic [ref=e385]:
                    - text: You last edited this
                    - generic [ref=e386]: · 15 minutes ago
            - button [ref=e387] [cursor=pointer]:
              - img [ref=e388]
    - contentinfo
  - generic:
    - generic [ref=e390]:
      - navigation [ref=e392]:
        - img [ref=e394] [cursor=pointer]
        - generic [ref=e396] [cursor=pointer]:
          - text: October,
          - generic [ref=e397]: "2026"
        - img [ref=e399] [cursor=pointer]
      - generic [ref=e402]:
        - generic [ref=e403]:
          - generic [ref=e404]: Su
          - generic [ref=e405]: Mo
          - generic [ref=e406]: Tu
          - generic [ref=e407]: We
          - generic [ref=e408]: Th
          - generic [ref=e409]: Fr
          - generic [ref=e410]: Sa
        - generic [ref=e411]:
          - generic [ref=e412] [cursor=pointer]: "27"
          - generic [ref=e413] [cursor=pointer]: "28"
          - generic [ref=e414] [cursor=pointer]: "29"
          - generic [ref=e415] [cursor=pointer]: "30"
          - generic [ref=e416] [cursor=pointer]: "1"
          - generic [ref=e417] [cursor=pointer]: "2"
          - generic [ref=e418] [cursor=pointer]: "3"
          - generic [ref=e419] [cursor=pointer]: "4"
          - generic [ref=e420] [cursor=pointer]: "5"
          - generic [ref=e421] [cursor=pointer]: "6"
          - generic [ref=e422] [cursor=pointer]: "7"
          - generic [ref=e423] [cursor=pointer]: "8"
          - generic [ref=e424] [cursor=pointer]: "9"
          - generic [ref=e425] [cursor=pointer]: "10"
          - generic [ref=e426] [cursor=pointer]: "11"
          - generic [ref=e427] [cursor=pointer]: "12"
          - generic [ref=e428] [cursor=pointer]: "13"
          - generic [ref=e429] [cursor=pointer]: "14"
          - generic [ref=e430] [cursor=pointer]: "15"
          - generic [ref=e431] [cursor=pointer]: "16"
          - generic [ref=e432] [cursor=pointer]: "17"
          - generic [ref=e433] [cursor=pointer]: "18"
          - generic [ref=e434] [cursor=pointer]: "19"
          - generic [ref=e435] [cursor=pointer]: "20"
          - generic [ref=e436] [cursor=pointer]: "21"
          - generic [ref=e437] [cursor=pointer]: "22"
          - generic [ref=e438] [cursor=pointer]: "23"
          - generic [ref=e439] [cursor=pointer]: "24"
          - generic [ref=e440] [cursor=pointer]: "25"
          - generic [ref=e441] [cursor=pointer]: "26"
          - generic [ref=e442] [cursor=pointer]: "27"
          - generic [ref=e443] [cursor=pointer]: "28"
          - generic [ref=e444] [cursor=pointer]: "29"
          - generic [ref=e445] [cursor=pointer]: "30"
          - generic [ref=e446] [cursor=pointer]: "31"
      - generic [ref=e448] [cursor=pointer]: Today
    - generic [ref=e449]:
      - navigation [ref=e451]:
        - img [ref=e453] [cursor=pointer]
        - generic [ref=e455] [cursor=pointer]:
          - text: December,
          - generic [ref=e456]: "2026"
        - img [ref=e458] [cursor=pointer]
      - generic [ref=e461]:
        - generic [ref=e462]:
          - generic [ref=e463]: Su
          - generic [ref=e464]: Mo
          - generic [ref=e465]: Tu
          - generic [ref=e466]: We
          - generic [ref=e467]: Th
          - generic [ref=e468]: Fr
          - generic [ref=e469]: Sa
        - generic [ref=e470]:
          - generic [ref=e471] [cursor=pointer]: "29"
          - generic [ref=e472] [cursor=pointer]: "30"
          - generic [ref=e473] [cursor=pointer]: "1"
          - generic [ref=e474] [cursor=pointer]: "2"
          - generic [ref=e475] [cursor=pointer]: "3"
          - generic [ref=e476] [cursor=pointer]: "4"
          - generic [ref=e477] [cursor=pointer]: "5"
          - generic [ref=e478] [cursor=pointer]: "6"
          - generic [ref=e479] [cursor=pointer]: "7"
          - generic [ref=e480] [cursor=pointer]: "8"
          - generic [ref=e481] [cursor=pointer]: "9"
          - generic [ref=e482] [cursor=pointer]: "10"
          - generic [ref=e483] [cursor=pointer]: "11"
          - generic [ref=e484] [cursor=pointer]: "12"
          - generic [ref=e485] [cursor=pointer]: "13"
          - generic [ref=e486] [cursor=pointer]: "14"
          - generic [ref=e487] [cursor=pointer]: "15"
          - generic [ref=e488] [cursor=pointer]: "16"
          - generic [ref=e489] [cursor=pointer]: "17"
          - generic [ref=e490] [cursor=pointer]: "18"
          - generic [ref=e491] [cursor=pointer]: "19"
          - generic [ref=e492] [cursor=pointer]: "20"
          - generic [ref=e493] [cursor=pointer]: "21"
          - generic [ref=e494] [cursor=pointer]: "22"
          - generic [ref=e495] [cursor=pointer]: "23"
          - generic [ref=e496] [cursor=pointer]: "24"
          - generic [ref=e497] [cursor=pointer]: "25"
          - generic [ref=e498] [cursor=pointer]: "26"
          - generic [ref=e499] [cursor=pointer]: "27"
          - generic [ref=e500] [cursor=pointer]: "28"
          - generic [ref=e501] [cursor=pointer]: "29"
          - generic [ref=e502] [cursor=pointer]: "30"
          - generic [ref=e503] [cursor=pointer]: "31"
          - generic [ref=e504] [cursor=pointer]: "1"
          - generic [ref=e505] [cursor=pointer]: "2"
      - generic [ref=e507] [cursor=pointer]: Today
    - generic [ref=e508]:
      - navigation [ref=e510]:
        - img [ref=e512] [cursor=pointer]
        - generic [ref=e514] [cursor=pointer]:
          - text: October,
          - generic [ref=e515]: "2026"
        - img [ref=e517] [cursor=pointer]
      - generic [ref=e520]:
        - generic [ref=e521]:
          - generic [ref=e522]: Su
          - generic [ref=e523]: Mo
          - generic [ref=e524]: Tu
          - generic [ref=e525]: We
          - generic [ref=e526]: Th
          - generic [ref=e527]: Fr
          - generic [ref=e528]: Sa
        - generic [ref=e529]:
          - generic [ref=e530] [cursor=pointer]: "27"
          - generic [ref=e531] [cursor=pointer]: "28"
          - generic [ref=e532] [cursor=pointer]: "29"
          - generic [ref=e533] [cursor=pointer]: "30"
          - generic [ref=e534] [cursor=pointer]: "1"
          - generic [ref=e535] [cursor=pointer]: "2"
          - generic [ref=e536] [cursor=pointer]: "3"
          - generic [ref=e537] [cursor=pointer]: "4"
          - generic [ref=e538] [cursor=pointer]: "5"
          - generic [ref=e539] [cursor=pointer]: "6"
          - generic [ref=e540] [cursor=pointer]: "7"
          - generic [ref=e541] [cursor=pointer]: "8"
          - generic [ref=e542] [cursor=pointer]: "9"
          - generic [ref=e543] [cursor=pointer]: "10"
          - generic [ref=e544] [cursor=pointer]: "11"
          - generic [ref=e545] [cursor=pointer]: "12"
          - generic [ref=e546] [cursor=pointer]: "13"
          - generic [ref=e547] [cursor=pointer]: "14"
          - generic [ref=e548] [cursor=pointer]: "15"
          - generic [ref=e549] [cursor=pointer]: "16"
          - generic [ref=e550] [cursor=pointer]: "17"
          - generic [ref=e551] [cursor=pointer]: "18"
          - generic [ref=e552] [cursor=pointer]: "19"
          - generic [ref=e553] [cursor=pointer]: "20"
          - generic [ref=e554] [cursor=pointer]: "21"
          - generic [ref=e555] [cursor=pointer]: "22"
          - generic [ref=e556] [cursor=pointer]: "23"
          - generic [ref=e557] [cursor=pointer]: "24"
          - generic [ref=e558] [cursor=pointer]: "25"
          - generic [ref=e559] [cursor=pointer]: "26"
          - generic [ref=e560] [cursor=pointer]: "27"
          - generic [ref=e561] [cursor=pointer]: "28"
          - generic [ref=e562] [cursor=pointer]: "29"
          - generic [ref=e563] [cursor=pointer]: "30"
          - generic [ref=e564] [cursor=pointer]: "31"
      - generic [ref=e566] [cursor=pointer]: Today
    - generic [ref=e567]:
      - navigation [ref=e569]:
        - img [ref=e571] [cursor=pointer]
        - generic [ref=e573] [cursor=pointer]:
          - text: October,
          - generic [ref=e574]: "2026"
        - img [ref=e576] [cursor=pointer]
      - generic [ref=e579]:
        - generic [ref=e580]:
          - generic [ref=e581]: Su
          - generic [ref=e582]: Mo
          - generic [ref=e583]: Tu
          - generic [ref=e584]: We
          - generic [ref=e585]: Th
          - generic [ref=e586]: Fr
          - generic [ref=e587]: Sa
        - generic [ref=e588]:
          - generic [ref=e589] [cursor=pointer]: "27"
          - generic [ref=e590] [cursor=pointer]: "28"
          - generic [ref=e591] [cursor=pointer]: "29"
          - generic [ref=e592] [cursor=pointer]: "30"
          - generic [ref=e593] [cursor=pointer]: "1"
          - generic [ref=e594] [cursor=pointer]: "2"
          - generic [ref=e595] [cursor=pointer]: "3"
          - generic [ref=e596] [cursor=pointer]: "4"
          - generic [ref=e597] [cursor=pointer]: "5"
          - generic [ref=e598] [cursor=pointer]: "6"
          - generic [ref=e599] [cursor=pointer]: "7"
          - generic [ref=e600] [cursor=pointer]: "8"
          - generic [ref=e601] [cursor=pointer]: "9"
          - generic [ref=e602] [cursor=pointer]: "10"
          - generic [ref=e603] [cursor=pointer]: "11"
          - generic [ref=e604] [cursor=pointer]: "12"
          - generic [ref=e605] [cursor=pointer]: "13"
          - generic [ref=e606] [cursor=pointer]: "14"
          - generic [ref=e607] [cursor=pointer]: "15"
          - generic [ref=e608] [cursor=pointer]: "16"
          - generic [ref=e609] [cursor=pointer]: "17"
          - generic [ref=e610] [cursor=pointer]: "18"
          - generic [ref=e611] [cursor=pointer]: "19"
          - generic [ref=e612] [cursor=pointer]: "20"
          - generic [ref=e613] [cursor=pointer]: "21"
          - generic [ref=e614] [cursor=pointer]: "22"
          - generic [ref=e615] [cursor=pointer]: "23"
          - generic [ref=e616] [cursor=pointer]: "24"
          - generic [ref=e617] [cursor=pointer]: "25"
          - generic [ref=e618] [cursor=pointer]: "26"
          - generic [ref=e619] [cursor=pointer]: "27"
          - generic [ref=e620] [cursor=pointer]: "28"
          - generic [ref=e621] [cursor=pointer]: "29"
          - generic [ref=e622] [cursor=pointer]: "30"
          - generic [ref=e623] [cursor=pointer]: "31"
      - generic [ref=e625] [cursor=pointer]: Today
    - generic [ref=e626]:
      - navigation [ref=e628]:
        - img [ref=e630] [cursor=pointer]
        - generic [ref=e632] [cursor=pointer]:
          - text: October,
          - generic [ref=e633]: "2026"
        - img [ref=e635] [cursor=pointer]
      - generic [ref=e638]:
        - generic [ref=e639]:
          - generic [ref=e640]: Su
          - generic [ref=e641]: Mo
          - generic [ref=e642]: Tu
          - generic [ref=e643]: We
          - generic [ref=e644]: Th
          - generic [ref=e645]: Fr
          - generic [ref=e646]: Sa
        - generic [ref=e647]:
          - generic [ref=e648] [cursor=pointer]: "27"
          - generic [ref=e649] [cursor=pointer]: "28"
          - generic [ref=e650] [cursor=pointer]: "29"
          - generic [ref=e651] [cursor=pointer]: "30"
          - generic [ref=e652] [cursor=pointer]: "1"
          - generic [ref=e653] [cursor=pointer]: "2"
          - generic [ref=e654] [cursor=pointer]: "3"
          - generic [ref=e655] [cursor=pointer]: "4"
          - generic [ref=e656] [cursor=pointer]: "5"
          - generic [ref=e657] [cursor=pointer]: "6"
          - generic [ref=e658] [cursor=pointer]: "7"
          - generic [ref=e659] [cursor=pointer]: "8"
          - generic [ref=e660] [cursor=pointer]: "9"
          - generic [ref=e661] [cursor=pointer]: "10"
          - generic [ref=e662] [cursor=pointer]: "11"
          - generic [ref=e663] [cursor=pointer]: "12"
          - generic [ref=e664] [cursor=pointer]: "13"
          - generic [ref=e665] [cursor=pointer]: "14"
          - generic [ref=e666] [cursor=pointer]: "15"
          - generic [ref=e667] [cursor=pointer]: "16"
          - generic [ref=e668] [cursor=pointer]: "17"
          - generic [ref=e669] [cursor=pointer]: "18"
          - generic [ref=e670] [cursor=pointer]: "19"
          - generic [ref=e671] [cursor=pointer]: "20"
          - generic [ref=e672] [cursor=pointer]: "21"
          - generic [ref=e673] [cursor=pointer]: "22"
          - generic [ref=e674] [cursor=pointer]: "23"
          - generic [ref=e675] [cursor=pointer]: "24"
          - generic [ref=e676] [cursor=pointer]: "25"
          - generic [ref=e677] [cursor=pointer]: "26"
          - generic [ref=e678] [cursor=pointer]: "27"
          - generic [ref=e679] [cursor=pointer]: "28"
          - generic [ref=e680] [cursor=pointer]: "29"
          - generic [ref=e681] [cursor=pointer]: "30"
          - generic [ref=e682] [cursor=pointer]: "31"
      - generic [ref=e684] [cursor=pointer]: Today
    - generic [ref=e685]:
      - navigation [ref=e687]:
        - img [ref=e689] [cursor=pointer]
        - generic [ref=e691] [cursor=pointer]:
          - text: October,
          - generic [ref=e692]: "2026"
        - img [ref=e694] [cursor=pointer]
      - generic [ref=e697]:
        - generic [ref=e698]:
          - generic [ref=e699]: Su
          - generic [ref=e700]: Mo
          - generic [ref=e701]: Tu
          - generic [ref=e702]: We
          - generic [ref=e703]: Th
          - generic [ref=e704]: Fr
          - generic [ref=e705]: Sa
        - generic [ref=e706]:
          - generic [ref=e707] [cursor=pointer]: "27"
          - generic [ref=e708] [cursor=pointer]: "28"
          - generic [ref=e709] [cursor=pointer]: "29"
          - generic [ref=e710] [cursor=pointer]: "30"
          - generic [ref=e711] [cursor=pointer]: "1"
          - generic [ref=e712] [cursor=pointer]: "2"
          - generic [ref=e713] [cursor=pointer]: "3"
          - generic [ref=e714] [cursor=pointer]: "4"
          - generic [ref=e715] [cursor=pointer]: "5"
          - generic [ref=e716] [cursor=pointer]: "6"
          - generic [ref=e717] [cursor=pointer]: "7"
          - generic [ref=e718] [cursor=pointer]: "8"
          - generic [ref=e719] [cursor=pointer]: "9"
          - generic [ref=e720] [cursor=pointer]: "10"
          - generic [ref=e721] [cursor=pointer]: "11"
          - generic [ref=e722] [cursor=pointer]: "12"
          - generic [ref=e723] [cursor=pointer]: "13"
          - generic [ref=e724] [cursor=pointer]: "14"
          - generic [ref=e725] [cursor=pointer]: "15"
          - generic [ref=e726] [cursor=pointer]: "16"
          - generic [ref=e727] [cursor=pointer]: "17"
          - generic [ref=e728] [cursor=pointer]: "18"
          - generic [ref=e729] [cursor=pointer]: "19"
          - generic [ref=e730] [cursor=pointer]: "20"
          - generic [ref=e731] [cursor=pointer]: "21"
          - generic [ref=e732] [cursor=pointer]: "22"
          - generic [ref=e733] [cursor=pointer]: "23"
          - generic [ref=e734] [cursor=pointer]: "24"
          - generic [ref=e735] [cursor=pointer]: "25"
          - generic [ref=e736] [cursor=pointer]: "26"
          - generic [ref=e737] [cursor=pointer]: "27"
          - generic [ref=e738] [cursor=pointer]: "28"
          - generic [ref=e739] [cursor=pointer]: "29"
          - generic [ref=e740] [cursor=pointer]: "30"
          - generic [ref=e741] [cursor=pointer]: "31"
    - generic [ref=e742]:
      - navigation [ref=e744]:
        - img [ref=e746] [cursor=pointer]
        - generic [ref=e748] [cursor=pointer]:
          - text: December,
          - generic [ref=e749]: "2026"
        - img [ref=e751] [cursor=pointer]
      - generic [ref=e754]:
        - generic [ref=e755]:
          - generic [ref=e756]: Su
          - generic [ref=e757]: Mo
          - generic [ref=e758]: Tu
          - generic [ref=e759]: We
          - generic [ref=e760]: Th
          - generic [ref=e761]: Fr
          - generic [ref=e762]: Sa
        - generic [ref=e763]:
          - generic [ref=e764] [cursor=pointer]: "29"
          - generic [ref=e765] [cursor=pointer]: "30"
          - generic [ref=e766] [cursor=pointer]: "1"
          - generic [ref=e767] [cursor=pointer]: "2"
          - generic [ref=e768] [cursor=pointer]: "3"
          - generic [ref=e769] [cursor=pointer]: "4"
          - generic [ref=e770] [cursor=pointer]: "5"
          - generic [ref=e771] [cursor=pointer]: "6"
          - generic [ref=e772] [cursor=pointer]: "7"
          - generic [ref=e773] [cursor=pointer]: "8"
          - generic [ref=e774] [cursor=pointer]: "9"
          - generic [ref=e775] [cursor=pointer]: "10"
          - generic [ref=e776] [cursor=pointer]: "11"
          - generic [ref=e777] [cursor=pointer]: "12"
          - generic [ref=e778] [cursor=pointer]: "13"
          - generic [ref=e779] [cursor=pointer]: "14"
          - generic [ref=e780] [cursor=pointer]: "15"
          - generic [ref=e781] [cursor=pointer]: "16"
          - generic [ref=e782] [cursor=pointer]: "17"
          - generic [ref=e783] [cursor=pointer]: "18"
          - generic [ref=e784] [cursor=pointer]: "19"
          - generic [ref=e785] [cursor=pointer]: "20"
          - generic [ref=e786] [cursor=pointer]: "21"
          - generic [ref=e787] [cursor=pointer]: "22"
          - generic [ref=e788] [cursor=pointer]: "23"
          - generic [ref=e789] [cursor=pointer]: "24"
          - generic [ref=e790] [cursor=pointer]: "25"
          - generic [ref=e791] [cursor=pointer]: "26"
          - generic [ref=e792] [cursor=pointer]: "27"
          - generic [ref=e793] [cursor=pointer]: "28"
          - generic [ref=e794] [cursor=pointer]: "29"
          - generic [ref=e795] [cursor=pointer]: "30"
          - generic [ref=e796] [cursor=pointer]: "31"
          - generic [ref=e797] [cursor=pointer]: "1"
          - generic [ref=e798] [cursor=pointer]: "2"
      - generic [ref=e800] [cursor=pointer]: Today
```

# Test source

```ts
  16315 |  * to recovery, never to a recorded literal."
  16316 |  *
  16317 |  * The artifact has no recovery, so blocking here is a stop. What it may NOT
  16318 |  * do is what the plain `outputs[ref] ?? ''` did: carry the empty string in.
  16319 |  * A read that matched nothing is left empty on purpose (see readOptional) —
  16320 |  * that is honest for an observation and fatal for an argument. Empty, a
  16321 |  * record-scoped locator (`li:has-text('')`) matches EVERY record and a
  16322 |  * `known` slot loses the identity it exists to carry, so the blank does not
  16323 |  * merely misreport the run: it does the work to the wrong record.
  16324 |  *
  16325 |  * Raised at CONSUMPTION, never at the read: the producing step keeps its
  16326 |  * verdict, the browser is at rest, and nothing of the consuming step has
  16327 |  * run when this throws.
  16328 |  *
  16329 |  * What it says about the LOG is checked against the log (skippedReads): an
  16330 |  * unpublished reference whose producing step never skipped a read has a
  16331 |  * different cause and a different fix, and pointing at a line that was
  16332 |  * never printed costs a diagnosis (grafana fwgr47).
  16333 |  */
  16334 | function need(outputs: Outputs, ref: string, by: string): string {
  16335 |   const value = outputs[ref as keyof Outputs];
  16336 |   if (value === undefined || value === '') {
  16337 |     const dot = ref.indexOf('.');
  16338 |     const sid = dot < 0 ? ref : ref.slice(0, dot);
  16339 |     const skips = skippedReads.filter((w) => w === sid || w.startsWith(`${sid} `));
  16340 |     const trail = skips.length
  16341 |       ? `The step that publishes ${ref} read nothing — look above for its \`[sitelooper skip]\` line` +
  16342 |         ` (${skips[0]}), which is where this run diverged.`
  16343 |       : `No \`[sitelooper skip]\` line was logged for ${sid} on this run, so no read of ${ref} was even` +
  16344 |         ` attempted: check that ${sid} is a step of this flow and that it is the step that publishes` +
  16345 |         ` this value, rather than re-recording a read that may be working.`;
  16346 |     throw new Error(
  16347 |       `${by} needs {{${ref}}}, and this run never published it` +
  16348 |         (value === '' ? ' (it was published empty)' : '') +
  16349 |         `. ${trail}` +
  16350 |         ` Stopping here instead of passing an empty value into ${by}:` +
  16351 |         ` blank, a record-scoped locator matches every record and a known slot loses` +
  16352 |         ` its identity, so the step would do its work to the wrong one. Everything` +
  16353 |         ` earlier steps did stands; nothing of ${by} has run.`,
  16354 |     );
  16355 |   }
  16356 |   return value;
  16357 | }
  16358 | 
  16359 | /**
  16360 |  * How long a recorded page change has to appear: Playwright's own expect
  16361 |  * timeout, the patience the `toBeVisible()` assertion this replaced had.
  16362 |  */
  16363 | const EXPECT_WAIT_MS = 5_000;
  16364 | 
  16365 | /**
  16366 |  * The step's recorded page changes, judged by the daemon's own effect gate.
  16367 |  *
  16368 |  * WHICH REPLAY RULE THIS MIRRORS. expectedChangesVerdict (src/execution/
  16369 |  * expect.ts, embedded below) IS replay's `expectedChanges` gate — the same
  16370 |  * function, not a reading of it. The lines carrying this run's own values are
  16371 |  * HARD, the rest are a plain group; either is looked for first in the lines
  16372 |  * this step ADDED (capturePageLines before and after, diffed as the recorder
  16373 |  * diffs its signatures) and then on the live page, as WHOLE snapshot lines:
  16374 |  * role, name, state, and the value after the colon. The AFTER capture is
  16375 |  * `linesAfter`, taken in the settle phase the moment the action settled —
  16376 |  * where tools.ts runStep takes the daemon's — not a fresh one here, after the
  16377 |  * url wait: openproject fwop14 02-create s_459e98/3 saved, showed the new row
  16378 |  * as it settled, routed to the record and re-rendered the row, and the
  16379 |  * artifact, looking only after its url wait, stopped on a line the daemon had
  16380 |  * seen (n2, n3 passed). With no settle capture each poll captures afresh.
  16381 |  * An earlier cut of this
  16382 |  * file rebuilt each recorded line as a Playwright locator and asserted it
  16383 |  * visible, which never looked past the name — `- combobox "Project": {{v1}}`
  16384 |  * passed on any visible Project combobox whatever it showed. Polled for
  16385 |  * EXPECT_WAIT_MS, the patience that assertion had; the daemon reads its diff
  16386 |  * once, so the artifact is the more patient of the two, never the looser.
  16387 |  *
  16388 |  * The verdict's warnings go to stdout as `[sitelooper warn]` lines, a missing
  16389 |  * diff leg or a look that could not cover the page as `[sitelooper unobserved]`.
  16390 |  * Every look is rendered in `dialect`, the one the step's lines were recorded
  16391 |  * in (StepExpectation.lineDialect), exactly as replay renders its own. An absent dialog comes back to the
  16392 |  * step body, which remembers it for the steps that were going to act inside.
  16393 |  */
  16394 | async function expectChanges(
  16395 |   page: Page,
  16396 |   recorded: string[],
  16397 |   p: Record<string, string>,
  16398 |   ctx: { tag: string; tool: string; value?: string; positionalResolution: boolean },
  16399 |   linesBefore: string[] | null,
  16400 |   dialect: LineDialect = 1,
  16401 |   linesAfter: string[] | null = null,
  16402 | ): Promise<ChangeVerdict> {
  16403 |   let last: ChangeVerdict = { warnings: [] };
  16404 |   await expect
  16405 |     .poll(
  16406 |       async () => {
  16407 |         last = await expectedChangesVerdict(recorded, p, { ...ctx, counters: counterNames(siteFactsAt(page.url()), page.url()) }, {
  16408 |           added: addedLines(linesBefore, linesAfter ?? (await capturePageLines(page, dialect))),
  16409 |           live: (look) => captureLines(page, dialect, look),
  16410 |         });
  16411 |         return last.stop ?? null;
  16412 |       },
  16413 |       { timeout: EXPECT_WAIT_MS, message: `${ctx.tag}: the recorded page change did not appear` },
  16414 |     )
> 16415 |     .toBeNull();
        |      ^ Error: 02-find s_548f8c/3: the recorded page change did not appear
  16416 |   for (const warning of last.warnings) console.log(`[sitelooper warn] ${warning}`);
  16417 |   if (last.unobserved) console.log(`[sitelooper unobserved] ${ctx.tag}: the page could not be captured, or observed in full, after the action`);
  16418 |   return last;
  16419 | }
  16420 | 
  16421 | /**
  16422 |  * RULE R2 (round 61, grafana fwgr73 05-open step 3), replay's runOneStep
  16423 |  * after its targets resolve: a click whose identifying rungs ALL missed
  16424 |  * (`hit` positional, or null when nothing resolved) is — the shared
  16425 |  * positionalClickVerdict decides — (a) skipped, its effect in place, when
  16426 |  * every line it was recorded adding already shows (`lines`, the shared
  16427 |  * alreadyAddedLines: never one that submits the segment's work), or (b)
  16428 |  * stopped when a positional rung took it onto an element without the
  16429 |  * recorded accessible name. True means skipped; a stop throws.
  16430 |  */
  16431 | async function positionalClick(
  16432 |   page: Page,
  16433 |   hit: Resolution | null,
  16434 |   identifying: number[],
  16435 |   points: number[],
  16436 |   lines: string[],
  16437 |   want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  16438 |   p: Record<string, string>,
  16439 |   where: string,
  16440 |   dialect: LineDialect = 1,
  16441 | ): Promise<boolean> {
  16442 |   const verdict = await positionalClickVerdict(
  16443 |     page,
  16444 |     hit ? { locator: hit.locator, index: hit.index, structural: hit.structural, point: points.includes(hit.index), missed: hit.missed.map((m) => m.index) } : null,
  16445 |     identifying,
  16446 |     lines,
  16447 |     want,
  16448 |     p,
  16449 |     dialect,
  16450 |   );
  16451 |   if (verdict && 'skip' in verdict) {
  16452 |     logWarning(`${where}: ${verdict.skip}`);
  16453 |     return true;
  16454 |   }
  16455 |   if (verdict && 'stop' in verdict) throw new Error(`${where}: ${verdict.stop}`);
  16456 |   return false;
  16457 | }
  16458 | 
  16459 | function validateInputs(vars: Vars): void {
  16460 |   const missing: string[] = [];
  16461 |   if (typeof vars['runid'] !== 'string' || !vars['runid'].trim()) missing.push('RUNID');
  16462 |   for (const name of requiredEnvNames) {
  16463 |     if (!process.env[name]?.trim()) missing.push(name);
  16464 |   }
  16465 |   if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${[...new Set(missing)].join(', ')}`);
  16466 | }
  16467 | 
  16468 | export const steps = {
  16469 |   /** Sign in to ERPNext at http://127.0.0.1:8100/ as Administrator using the password exactly as the text {{env:APP_PASSWORD}} (do not substitute or expose it). Verify that the signed-in ERPNext home page … */
  16470 |   async '01-signin'(page: Page, p: { v1: string; v2: string; v3: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {
  16471 |     const typedCommitted = new Set<string>();
  16472 | 
  16473 |     // What this step types, selects or names, across its segments (see echoRead).
  16474 |     const echoLedger = new Set<string>();
  16475 | 
  16476 |     // The urls this step loads, for its report values (a given url it loaded was observed).
  16477 |     const reportTrail = urlTrail(page);
  16478 | 
  16479 |     // s_ee89b4: Sign in to ERPNext at {{v1}} as {{v2}} using the password exactly as the text {{v3}} (do not substitute or expose it). Verify that the signed-in ERPNext home page is loaded.
  16480 |     // recorded on a page matching http://127.0.0.1:8100/
  16481 |     // Url positions this segment has watched vary, for a later navigation (see navigationTarget).
  16482 |     const volatile1: UrlSegDiff[] = [];
  16483 | 
  16484 |     // @step 01-signin s_ee89b4/1
  16485 |     let urlBefore1 = '';
  16486 |     let alertsBefore1: string[] = [];
  16487 |     let alertsAfter1: ObservedAlerts | null = null;
  16488 |     let nav1: NavigationTarget = { url: '' };
  16489 |     await runStepLifecycle({
  16490 |       prepare: async () => {
  16491 |         await settle(page);
  16492 |         urlBefore1 = page.url();
  16493 |         alertsBefore1 = (await liveAlerts(page)) ?? [];
  16494 |       },
  16495 |       act: async () => {
  16496 |         nav1 = navigationTarget(`${p.v1}`, page, volatile1, '01-signin s_ee89b4/1');
  16497 |         await page.goto(nav1.url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
  16498 |         return { status: 'completed', value: undefined };
  16499 |       },
  16500 |       settle: async () => {
  16501 |         if (page.url() !== urlBefore1) await settle(page);
  16502 |         alertsAfter1 = await settledAlerts(page);
  16503 |       },
  16504 |       bind: async () => {
  16505 |       },
  16506 |       verify: async () => {
  16507 |         errorPageGate(page, '01-signin s_ee89b4/1');
  16508 |         { const landed = page.url(); const landing = landingVerdictWithFacts(siteFactsAt(landed), nav1.url, landed, '01-signin s_ee89b4/1'); if (landing) throw new Error(landing); }
  16509 |         alertGate(alertsBefore1, alertsAfter1, { where: '01-signin s_ee89b4/1', isRead: false, params: p, navigatedToStale: nav1.stale });
  16510 |       },
  16511 |     });
  16512 | 
  16513 |     // s_2011f1: Sign in to ERPNext at {{v1}} as {{v2}} using the password exactly as the text {{v3}} (do not substitute or expose it). Verify that the signed-in ERPNext home page is loaded.
  16514 |     // recorded on a page matching http://127.0.0.1:8100/
  16515 |     // What this segment filled, which must still stand when the action that submits it goes (see restoreStandingFills).
```