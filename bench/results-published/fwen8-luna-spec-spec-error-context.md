# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwen8-luna.spec.ts >> fwen8-luna
- Location: fwen8-luna.spec.ts:9:1

# Error details

```
Error: 05-add s_f44792: not on the page this procedure starts from (expects http://127.0.0.1:8100/app/sales-order/new-sales-order-uxvwbpigvk, browser is at http://127.0.0.1:8100/app/sales-order/new-sales-order-mdlpkyruxc) — nothing of this segment has run
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
            - link "New Sales Order":
              - /url: /app/sales-order/new-sales-order-mdlpkyruxc
        - generic [ref=e14]:
          - search [ref=e15]:
            - generic [ref=e16]:
              - generic [ref=e17]:
                - combobox "Search or type a command (Ctrl + G)" [ref=e18]
                - status [ref=e19]: Begin typing for results.
              - img [ref=e21]
          - list [ref=e23]:
            - listitem [ref=e24]:
              - button "No new notifications" [ref=e25] [cursor=pointer]:
                - generic [ref=e26]:
                  - generic [ref=e27]: No new notifications
                  - img [ref=e28]
            - listitem [ref=e30]
            - listitem [ref=e31]:
              - button "Help Dropdown" [ref=e32] [cursor=pointer]:
                - generic [ref=e33]:
                  - text: Help
                  - img [ref=e34]
            - listitem [ref=e36]:
              - button "User Menu" [ref=e37] [cursor=pointer]:
                - generic "Administrator" [ref=e38]:
                  - generic "Administrator" [ref=e39]: A
    - generic [ref=e41]:
      - generic [ref=e44]:
        - generic [ref=e45]:
          - button "Toggle Sidebar" [ref=e46] [cursor=pointer]:
            - img [ref=e47]
          - generic [ref=e51]:
            - heading "New Sales Order" [level=3] [ref=e52] [cursor=pointer]
            - generic [ref=e54]: Not Saved
        - generic [ref=e55]:
          - button "Get Items From" [ref=e58] [cursor=pointer]:
            - text: Get Items From
            - img [ref=e59]
          - generic [ref=e61]:
            - button "Menu" [ref=e63] [cursor=pointer]:
              - img [ref=e66]
            - button "Save" [ref=e67] [cursor=pointer]:
              - generic [ref=e68]: Save
      - generic [ref=e73]:
        - generic [ref=e78]:
          - tablist [ref=e80]:
            - listitem [ref=e81]:
              - tab "Details" [selected] [ref=e82] [cursor=pointer]
            - listitem [ref=e83]:
              - tab "Address & Contact" [ref=e84] [cursor=pointer]
            - listitem [ref=e85]:
              - tab "Terms" [ref=e86] [cursor=pointer]
            - listitem [ref=e87]:
              - tab "More Info" [ref=e88] [cursor=pointer]
          - generic [ref=e89]:
            - tabpanel "Details" [ref=e90]:
              - generic [ref=e92]:
                - generic [ref=e94]:
                  - generic [ref=e95]:
                    - generic [ref=e96]:
                      - generic [ref=e98]: Series *
                      - generic [ref=e99]:
                        - generic [ref=e100]:
                          - combobox [ref=e101]:
                            - option "SAL-ORD-.YYYY.-" [selected]
                          - generic:
                            - img
                        - paragraph
                    - generic: naming_series
                  - generic [ref=e102]:
                    - generic [ref=e103]:
                      - generic [ref=e105]: Customer *
                      - generic [ref=e106]:
                        - combobox [ref=e110]: fwen8-luna-spec Bench Customer  
                        - paragraph
                    - generic: customer
                  - generic [ref=e111]:
                    - generic [ref=e112]:
                      - generic [ref=e114]: Order Type *
                      - generic [ref=e115]:
                        - generic [ref=e116]:
                          - combobox [ref=e117]:
                            - option
                            - option "Sales" [selected]
                            - option "Maintenance"
                            - option "Shopping Cart"
                          - generic:
                            - img
                        - paragraph
                    - generic: order_type
                - generic [ref=e119]:
                  - generic [ref=e120]:
                    - generic [ref=e121]:
                      - generic [ref=e123]: Date *
                      - generic [ref=e124]:
                        - textbox [ref=e126]: 2026-10-08
                        - paragraph
                    - generic: transaction_date
                  - generic [ref=e127]:
                    - generic [ref=e128]:
                      - generic [ref=e130]: Delivery Date
                      - generic [ref=e131]:
                        - textbox [ref=e133]: 2026-12-31
                        - paragraph
                    - generic: delivery_date
                - generic [ref=e135]:
                  - generic [ref=e136]:
                    - generic [ref=e137]:
                      - generic [ref=e139]: Customer's Purchase Order
                      - generic [ref=e140]:
                        - textbox [ref=e142]
                        - paragraph
                    - generic: po_no
                  - text: "*"
              - generic [ref=e144] [cursor=pointer]:
                - text: Accounting Dimensions
                - img [ref=e146]
              - generic [ref=e148]:
                - generic [ref=e149] [cursor=pointer]:
                  - text: Currency and Price List
                  - img [ref=e151]
                - text: "* * * *"
              - generic [ref=e153]:
                - generic [ref=e154]: Items
                - generic [ref=e155]:
                  - generic [ref=e158]:
                    - generic [ref=e159]:
                      - generic [ref=e161]: Scan Barcode
                      - generic [ref=e162]:
                        - generic [ref=e163]:
                          - textbox [ref=e164]
                          - generic "Scan" [ref=e166] [cursor=pointer]:
                            - img [ref=e167]
                        - paragraph
                    - generic: scan_barcode
                  - generic [ref=e171]:
                    - generic [ref=e172]:
                      - generic [ref=e174]: Set Source Warehouse
                      - generic [ref=e175]:
                        - generic [ref=e178]:
                          - combobox [ref=e179]
                          - status [ref=e180]: Begin typing for results.
                        - paragraph
                    - generic: set_warehouse
              - generic [ref=e185]:
                - generic: items
                - generic [ref=e186]:
                  - generic [ref=e187]: Items
                  - generic [ref=e189]:
                    - generic [ref=e192]:
                      - checkbox [ref=e194]
                      - generic [ref=e195]: No.
                      - generic "Item Code" [ref=e196]:
                        - generic [ref=e197]: Item Code *
                      - generic "Delivery Date" [ref=e198]:
                        - generic [ref=e199]: Delivery Date *
                      - generic "Quantity" [ref=e200]:
                        - generic [ref=e201]: Quantity *
                      - generic "Rate (USD)" [ref=e202]:
                        - generic [ref=e203]: Rate (USD)
                      - generic "Amount (USD)" [ref=e204]:
                        - generic [ref=e205]: Amount (USD)
                      - img [ref=e208] [cursor=pointer]
                    - generic [ref=e211]:
                      - img "Grid Empty State" [ref=e212]
                      - text: No Data
                  - generic [ref=e214]:
                    - generic [ref=e215]:
                      - button "Add Row" [ref=e216] [cursor=pointer]
                      - button "Add Multiple" [ref=e217] [cursor=pointer]
                    - generic [ref=e218]:
                      - button "Download" [ref=e219] [cursor=pointer]
                      - button "Upload" [ref=e220] [cursor=pointer]
              - generic [ref=e222]:
                - generic [ref=e225]:
                  - generic [ref=e226]:
                    - generic [ref=e228]: Total Quantity
                    - generic [ref=e229]:
                      - generic [ref=e230]: "0"
                      - paragraph
                  - generic: total_qty
                - generic [ref=e234]:
                  - generic [ref=e235]:
                    - generic [ref=e237]: Total (USD)
                    - generic [ref=e238]:
                      - generic [ref=e239]: $ 0.00
                      - paragraph
                  - generic: total
              - generic [ref=e240]:
                - generic [ref=e241]: Taxes
                - generic [ref=e242]:
                  - generic [ref=e244]:
                    - generic [ref=e245]:
                      - generic [ref=e246]:
                        - generic [ref=e248]: Tax Category
                        - generic [ref=e249]:
                          - generic [ref=e252]:
                            - combobox [ref=e253]
                            - status [ref=e254]: Begin typing for results.
                          - paragraph
                      - generic: tax_category
                    - generic [ref=e255]:
                      - generic [ref=e256]:
                        - generic [ref=e258]: Sales Taxes and Charges Template
                        - generic [ref=e259]:
                          - generic [ref=e262]:
                            - combobox [ref=e263]: US ST 6%
                            - status [ref=e264]: Begin typing for results.
                          - paragraph
                      - generic: taxes_and_charges
                    - generic [ref=e265]:
                      - generic [ref=e266]:
                        - generic [ref=e267]:
                          - checkbox "Is customer exempted from sales tax?" [ref=e269]
                          - generic [ref=e270]: Is customer exempted from sales tax?
                        - paragraph
                      - generic: exempt_from_sales_tax
                  - generic [ref=e273]:
                    - generic [ref=e274]:
                      - generic [ref=e276]: Shipping Rule
                      - generic [ref=e277]:
                        - generic [ref=e280]:
                          - combobox [ref=e281]
                          - status [ref=e282]: Begin typing for results.
                        - paragraph
                    - generic: shipping_rule
                  - generic [ref=e285]:
                    - generic [ref=e286]:
                      - generic [ref=e288]: Incoterm
                      - generic [ref=e289]:
                        - generic [ref=e292]:
                          - combobox [ref=e293]
                          - status [ref=e294]: Begin typing for results.
                        - paragraph
                    - generic: incoterm
              - generic [ref=e299]:
                - generic: taxes
                - generic [ref=e300]:
                  - generic [ref=e301]: Sales Taxes and Charges
                  - generic [ref=e303]:
                    - generic [ref=e306]:
                      - checkbox [ref=e308]
                      - generic [ref=e309]: No.
                      - generic "Type" [ref=e310]:
                        - generic [ref=e311]: Type *
                      - generic "Account Head" [ref=e312]:
                        - generic [ref=e313]: Account Head *
                      - generic "Tax Rate" [ref=e314]:
                        - generic [ref=e315]: Tax Rate
                      - generic "Amount (USD)" [ref=e316]:
                        - generic [ref=e317]: Amount (USD)
                      - generic "Total (USD)" [ref=e318]:
                        - generic [ref=e319]: Total (USD)
                      - img [ref=e322] [cursor=pointer]
                    - generic [ref=e327] [cursor=pointer]:
                      - checkbox [ref=e329]
                      - generic [ref=e330]: "1"
                      - generic [ref=e332]: On Net Total
                      - link "ST 6% - BC" [ref=e335]:
                        - /url: /app/account/ST%206%25%20-%20BC
                      - generic [ref=e338]: "6"
                      - generic [ref=e341]: $ 0.00
                      - generic [ref=e344]: $ 0.00
                      - img [ref=e348]
                  - button "Add Row" [ref=e353] [cursor=pointer]
              - generic [ref=e359]:
                - generic [ref=e360]:
                  - generic [ref=e362]: Total Taxes and Charges (USD)
                  - generic [ref=e363]:
                    - generic [ref=e364]: $ 0.00
                    - paragraph
                - generic: total_taxes_and_charges
              - generic [ref=e365]:
                - generic [ref=e366]: Totals
                - generic [ref=e370]:
                  - generic [ref=e371]:
                    - generic [ref=e372]:
                      - generic [ref=e374]: Grand Total (USD)
                      - generic [ref=e375]:
                        - generic [ref=e376]: $ 0.00
                        - paragraph
                    - generic: grand_total
                  - generic [ref=e377]:
                    - generic [ref=e378]:
                      - generic [ref=e380]: Rounding Adjustment (USD)
                      - generic [ref=e381]:
                        - generic [ref=e382]: $ 0.00
                        - paragraph
                    - generic: rounding_adjustment
                  - generic [ref=e383]:
                    - generic [ref=e384]:
                      - generic [ref=e386]: Rounded Total (USD)
                      - generic [ref=e387]:
                        - generic [ref=e388]: $ 0.00
                        - paragraph
                    - generic: rounded_total
                  - generic [ref=e389]:
                    - generic [ref=e390]:
                      - generic [ref=e392]: Advance Paid
                      - generic [ref=e393]:
                        - generic [ref=e394]: $ 0.00
                        - paragraph
                    - generic: advance_paid
              - generic [ref=e396] [cursor=pointer]:
                - text: Additional Discount
                - img [ref=e398]
            - text: "* * Normal Heading 1 Heading 2 Heading 3 Heading 4 Heading 5 Heading 6 Normal --- --- 8px 9px 10px 11px 12px 13px 14px 15px 16px 18px 20px 22px 24px 32px 36px 40px 48px 54px 64px 96px 128px Table Insert Table Insert Row Above Insert Row Below Insert Column Right Insert Column Left Delete Row Delete Column Delete Table Visit URL: EditRemove * *"
        - text: Type a reply / comment ×
    - contentinfo
  - generic:
    - generic [ref=e400]:
      - navigation [ref=e402]:
        - img [ref=e404] [cursor=pointer]
        - generic [ref=e406] [cursor=pointer]:
          - text: October,
          - generic [ref=e407]: "2026"
        - img [ref=e409] [cursor=pointer]
      - generic [ref=e412]:
        - generic [ref=e413]:
          - generic [ref=e414]: Su
          - generic [ref=e415]: Mo
          - generic [ref=e416]: Tu
          - generic [ref=e417]: We
          - generic [ref=e418]: Th
          - generic [ref=e419]: Fr
          - generic [ref=e420]: Sa
        - generic [ref=e421]:
          - generic [ref=e422] [cursor=pointer]: "27"
          - generic [ref=e423] [cursor=pointer]: "28"
          - generic [ref=e424] [cursor=pointer]: "29"
          - generic [ref=e425] [cursor=pointer]: "30"
          - generic [ref=e426] [cursor=pointer]: "1"
          - generic [ref=e427] [cursor=pointer]: "2"
          - generic [ref=e428] [cursor=pointer]: "3"
          - generic [ref=e429] [cursor=pointer]: "4"
          - generic [ref=e430] [cursor=pointer]: "5"
          - generic [ref=e431] [cursor=pointer]: "6"
          - generic [ref=e432] [cursor=pointer]: "7"
          - generic [ref=e433] [cursor=pointer]: "8"
          - generic [ref=e434] [cursor=pointer]: "9"
          - generic [ref=e435] [cursor=pointer]: "10"
          - generic [ref=e436] [cursor=pointer]: "11"
          - generic [ref=e437] [cursor=pointer]: "12"
          - generic [ref=e438] [cursor=pointer]: "13"
          - generic [ref=e439] [cursor=pointer]: "14"
          - generic [ref=e440] [cursor=pointer]: "15"
          - generic [ref=e441] [cursor=pointer]: "16"
          - generic [ref=e442] [cursor=pointer]: "17"
          - generic [ref=e443] [cursor=pointer]: "18"
          - generic [ref=e444] [cursor=pointer]: "19"
          - generic [ref=e445] [cursor=pointer]: "20"
          - generic [ref=e446] [cursor=pointer]: "21"
          - generic [ref=e447] [cursor=pointer]: "22"
          - generic [ref=e448] [cursor=pointer]: "23"
          - generic [ref=e449] [cursor=pointer]: "24"
          - generic [ref=e450] [cursor=pointer]: "25"
          - generic [ref=e451] [cursor=pointer]: "26"
          - generic [ref=e452] [cursor=pointer]: "27"
          - generic [ref=e453] [cursor=pointer]: "28"
          - generic [ref=e454] [cursor=pointer]: "29"
          - generic [ref=e455] [cursor=pointer]: "30"
          - generic [ref=e456] [cursor=pointer]: "31"
      - generic [ref=e458] [cursor=pointer]: Today
    - generic [ref=e459]:
      - navigation [ref=e461]:
        - img [ref=e463] [cursor=pointer]
        - generic [ref=e465] [cursor=pointer]:
          - text: December,
          - generic [ref=e466]: "2026"
        - img [ref=e468] [cursor=pointer]
      - generic [ref=e471]:
        - generic [ref=e472]:
          - generic [ref=e473]: Su
          - generic [ref=e474]: Mo
          - generic [ref=e475]: Tu
          - generic [ref=e476]: We
          - generic [ref=e477]: Th
          - generic [ref=e478]: Fr
          - generic [ref=e479]: Sa
        - generic [ref=e480]:
          - generic [ref=e481] [cursor=pointer]: "29"
          - generic [ref=e482] [cursor=pointer]: "30"
          - generic [ref=e483] [cursor=pointer]: "1"
          - generic [ref=e484] [cursor=pointer]: "2"
          - generic [ref=e485] [cursor=pointer]: "3"
          - generic [ref=e486] [cursor=pointer]: "4"
          - generic [ref=e487] [cursor=pointer]: "5"
          - generic [ref=e488] [cursor=pointer]: "6"
          - generic [ref=e489] [cursor=pointer]: "7"
          - generic [ref=e490] [cursor=pointer]: "8"
          - generic [ref=e491] [cursor=pointer]: "9"
          - generic [ref=e492] [cursor=pointer]: "10"
          - generic [ref=e493] [cursor=pointer]: "11"
          - generic [ref=e494] [cursor=pointer]: "12"
          - generic [ref=e495] [cursor=pointer]: "13"
          - generic [ref=e496] [cursor=pointer]: "14"
          - generic [ref=e497] [cursor=pointer]: "15"
          - generic [ref=e498] [cursor=pointer]: "16"
          - generic [ref=e499] [cursor=pointer]: "17"
          - generic [ref=e500] [cursor=pointer]: "18"
          - generic [ref=e501] [cursor=pointer]: "19"
          - generic [ref=e502] [cursor=pointer]: "20"
          - generic [ref=e503] [cursor=pointer]: "21"
          - generic [ref=e504] [cursor=pointer]: "22"
          - generic [ref=e505] [cursor=pointer]: "23"
          - generic [ref=e506] [cursor=pointer]: "24"
          - generic [ref=e507] [cursor=pointer]: "25"
          - generic [ref=e508] [cursor=pointer]: "26"
          - generic [ref=e509] [cursor=pointer]: "27"
          - generic [ref=e510] [cursor=pointer]: "28"
          - generic [ref=e511] [cursor=pointer]: "29"
          - generic [ref=e512] [cursor=pointer]: "30"
          - generic [ref=e513] [cursor=pointer]: "31"
          - generic [ref=e514] [cursor=pointer]: "1"
          - generic [ref=e515] [cursor=pointer]: "2"
      - generic [ref=e517] [cursor=pointer]: Today
    - generic [ref=e518]:
      - navigation [ref=e520]:
        - img [ref=e522] [cursor=pointer]
        - generic [ref=e524] [cursor=pointer]:
          - text: October,
          - generic [ref=e525]: "2026"
        - img [ref=e527] [cursor=pointer]
      - generic [ref=e530]:
        - generic [ref=e531]:
          - generic [ref=e532]: Su
          - generic [ref=e533]: Mo
          - generic [ref=e534]: Tu
          - generic [ref=e535]: We
          - generic [ref=e536]: Th
          - generic [ref=e537]: Fr
          - generic [ref=e538]: Sa
        - generic [ref=e539]:
          - generic [ref=e540] [cursor=pointer]: "27"
          - generic [ref=e541] [cursor=pointer]: "28"
          - generic [ref=e542] [cursor=pointer]: "29"
          - generic [ref=e543] [cursor=pointer]: "30"
          - generic [ref=e544] [cursor=pointer]: "1"
          - generic [ref=e545] [cursor=pointer]: "2"
          - generic [ref=e546] [cursor=pointer]: "3"
          - generic [ref=e547] [cursor=pointer]: "4"
          - generic [ref=e548] [cursor=pointer]: "5"
          - generic [ref=e549] [cursor=pointer]: "6"
          - generic [ref=e550] [cursor=pointer]: "7"
          - generic [ref=e551] [cursor=pointer]: "8"
          - generic [ref=e552] [cursor=pointer]: "9"
          - generic [ref=e553] [cursor=pointer]: "10"
          - generic [ref=e554] [cursor=pointer]: "11"
          - generic [ref=e555] [cursor=pointer]: "12"
          - generic [ref=e556] [cursor=pointer]: "13"
          - generic [ref=e557] [cursor=pointer]: "14"
          - generic [ref=e558] [cursor=pointer]: "15"
          - generic [ref=e559] [cursor=pointer]: "16"
          - generic [ref=e560] [cursor=pointer]: "17"
          - generic [ref=e561] [cursor=pointer]: "18"
          - generic [ref=e562] [cursor=pointer]: "19"
          - generic [ref=e563] [cursor=pointer]: "20"
          - generic [ref=e564] [cursor=pointer]: "21"
          - generic [ref=e565] [cursor=pointer]: "22"
          - generic [ref=e566] [cursor=pointer]: "23"
          - generic [ref=e567] [cursor=pointer]: "24"
          - generic [ref=e568] [cursor=pointer]: "25"
          - generic [ref=e569] [cursor=pointer]: "26"
          - generic [ref=e570] [cursor=pointer]: "27"
          - generic [ref=e571] [cursor=pointer]: "28"
          - generic [ref=e572] [cursor=pointer]: "29"
          - generic [ref=e573] [cursor=pointer]: "30"
          - generic [ref=e574] [cursor=pointer]: "31"
      - generic [ref=e576] [cursor=pointer]: Today
    - generic [ref=e577]:
      - navigation [ref=e579]:
        - img [ref=e581] [cursor=pointer]
        - generic [ref=e583] [cursor=pointer]:
          - text: October,
          - generic [ref=e584]: "2026"
        - img [ref=e586] [cursor=pointer]
      - generic [ref=e589]:
        - generic [ref=e590]:
          - generic [ref=e591]: Su
          - generic [ref=e592]: Mo
          - generic [ref=e593]: Tu
          - generic [ref=e594]: We
          - generic [ref=e595]: Th
          - generic [ref=e596]: Fr
          - generic [ref=e597]: Sa
        - generic [ref=e598]:
          - generic [ref=e599] [cursor=pointer]: "27"
          - generic [ref=e600] [cursor=pointer]: "28"
          - generic [ref=e601] [cursor=pointer]: "29"
          - generic [ref=e602] [cursor=pointer]: "30"
          - generic [ref=e603] [cursor=pointer]: "1"
          - generic [ref=e604] [cursor=pointer]: "2"
          - generic [ref=e605] [cursor=pointer]: "3"
          - generic [ref=e606] [cursor=pointer]: "4"
          - generic [ref=e607] [cursor=pointer]: "5"
          - generic [ref=e608] [cursor=pointer]: "6"
          - generic [ref=e609] [cursor=pointer]: "7"
          - generic [ref=e610] [cursor=pointer]: "8"
          - generic [ref=e611] [cursor=pointer]: "9"
          - generic [ref=e612] [cursor=pointer]: "10"
          - generic [ref=e613] [cursor=pointer]: "11"
          - generic [ref=e614] [cursor=pointer]: "12"
          - generic [ref=e615] [cursor=pointer]: "13"
          - generic [ref=e616] [cursor=pointer]: "14"
          - generic [ref=e617] [cursor=pointer]: "15"
          - generic [ref=e618] [cursor=pointer]: "16"
          - generic [ref=e619] [cursor=pointer]: "17"
          - generic [ref=e620] [cursor=pointer]: "18"
          - generic [ref=e621] [cursor=pointer]: "19"
          - generic [ref=e622] [cursor=pointer]: "20"
          - generic [ref=e623] [cursor=pointer]: "21"
          - generic [ref=e624] [cursor=pointer]: "22"
          - generic [ref=e625] [cursor=pointer]: "23"
          - generic [ref=e626] [cursor=pointer]: "24"
          - generic [ref=e627] [cursor=pointer]: "25"
          - generic [ref=e628] [cursor=pointer]: "26"
          - generic [ref=e629] [cursor=pointer]: "27"
          - generic [ref=e630] [cursor=pointer]: "28"
          - generic [ref=e631] [cursor=pointer]: "29"
          - generic [ref=e632] [cursor=pointer]: "30"
          - generic [ref=e633] [cursor=pointer]: "31"
      - generic [ref=e635] [cursor=pointer]: Today
    - generic [ref=e636]:
      - navigation [ref=e638]:
        - img [ref=e640] [cursor=pointer]
        - generic [ref=e642] [cursor=pointer]:
          - text: October,
          - generic [ref=e643]: "2026"
        - img [ref=e645] [cursor=pointer]
      - generic [ref=e648]:
        - generic [ref=e649]:
          - generic [ref=e650]: Su
          - generic [ref=e651]: Mo
          - generic [ref=e652]: Tu
          - generic [ref=e653]: We
          - generic [ref=e654]: Th
          - generic [ref=e655]: Fr
          - generic [ref=e656]: Sa
        - generic [ref=e657]:
          - generic [ref=e658] [cursor=pointer]: "27"
          - generic [ref=e659] [cursor=pointer]: "28"
          - generic [ref=e660] [cursor=pointer]: "29"
          - generic [ref=e661] [cursor=pointer]: "30"
          - generic [ref=e662] [cursor=pointer]: "1"
          - generic [ref=e663] [cursor=pointer]: "2"
          - generic [ref=e664] [cursor=pointer]: "3"
          - generic [ref=e665] [cursor=pointer]: "4"
          - generic [ref=e666] [cursor=pointer]: "5"
          - generic [ref=e667] [cursor=pointer]: "6"
          - generic [ref=e668] [cursor=pointer]: "7"
          - generic [ref=e669] [cursor=pointer]: "8"
          - generic [ref=e670] [cursor=pointer]: "9"
          - generic [ref=e671] [cursor=pointer]: "10"
          - generic [ref=e672] [cursor=pointer]: "11"
          - generic [ref=e673] [cursor=pointer]: "12"
          - generic [ref=e674] [cursor=pointer]: "13"
          - generic [ref=e675] [cursor=pointer]: "14"
          - generic [ref=e676] [cursor=pointer]: "15"
          - generic [ref=e677] [cursor=pointer]: "16"
          - generic [ref=e678] [cursor=pointer]: "17"
          - generic [ref=e679] [cursor=pointer]: "18"
          - generic [ref=e680] [cursor=pointer]: "19"
          - generic [ref=e681] [cursor=pointer]: "20"
          - generic [ref=e682] [cursor=pointer]: "21"
          - generic [ref=e683] [cursor=pointer]: "22"
          - generic [ref=e684] [cursor=pointer]: "23"
          - generic [ref=e685] [cursor=pointer]: "24"
          - generic [ref=e686] [cursor=pointer]: "25"
          - generic [ref=e687] [cursor=pointer]: "26"
          - generic [ref=e688] [cursor=pointer]: "27"
          - generic [ref=e689] [cursor=pointer]: "28"
          - generic [ref=e690] [cursor=pointer]: "29"
          - generic [ref=e691] [cursor=pointer]: "30"
          - generic [ref=e692] [cursor=pointer]: "31"
      - generic [ref=e694] [cursor=pointer]: Today
```

# Test source

```ts
  15823 |   if (stop) throw new Error(stop);
  15824 | }
  15825 | 
  15826 | /**
  15827 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  15828 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  15829 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  15830 |  * literal segments is treated as volatile (warned, continued), anything else
  15831 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  15832 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  15833 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  15834 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  15835 |  * step's click reported of the link it clicked (the shared beginAction): a
  15836 |  * click that went where its link points, recorded as staying on the page it
  15837 |  * left, is the shared linkLandingWarning and waits for nothing.
  15838 |  */
  15839 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  15840 |   if (!urlMatches(pattern, page.url(), p)) {
  15841 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  15842 |     if (landed) return logWarning(landed);
  15843 |   }
  15844 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  15845 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  15846 |   for (const line of verdict.warnings) logWarning(line);
  15847 |   // What this step watched vary is the segment's evidence from here on
  15848 |   // (navigationTarget), whether or not the step goes on to stop.
  15849 |   if (verdict.diffs) volatile.push(...verdict.diffs);
  15850 |   if (verdict.stop) throw new Error(verdict.stop);
  15851 | }
  15852 | 
  15853 | /**
  15854 |  * Where a goto actually sends the browser — the shared retargetNavigation
  15855 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  15856 |  * the live url sits at a position THIS segment has already watched vary is a
  15857 |  * literal from the recording's run, and the live value is navigated to
  15858 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  15859 |  * one per replayed skill. The returned `stale` is handed to this step's
  15860 |  * alert gate, so an unrecorded alert on the landing names the cause.
  15861 |  */
  15862 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  15863 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  15864 |   if (verdict.warning) logWarning(verdict.warning);
  15865 |   return verdict;
  15866 | }
  15867 | 
  15868 | /**
  15869 |  * The alert observation a step is judged by, taken where the daemon takes
  15870 |  * its diff: after the action, once the DOM has settled (tools.ts
  15871 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  15872 |  * inside verify's url window is seen by both runners or by neither.
  15873 |  * Rendered in the step's line dialect, with whether every live region was
  15874 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  15875 |  */
  15876 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  15877 |   await settle(page);
  15878 |   return liveAlertsObserved(page, dialect);
  15879 | }
  15880 | 
  15881 | /**
  15882 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  15883 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  15884 |  * and stops a state-changing step only when its recorded page changes did
  15885 |  * not confirm it worked (a rejection toast that leaves the page superficially
  15886 |  * intact); a recorded-but-missing one only warns.
  15887 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  15888 |  * `after` in settle, right after the action has settled and BEFORE the url
  15889 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  15890 |  * during a 5s url wait must not be missed) — and a page that could not be
  15891 |  * read is handed over as unobserved, never as "no alert".
  15892 |  */
  15893 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  15894 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  15895 |   for (const line of verdict.warnings) logWarning(line);
  15896 |   if (verdict.stop) throw new Error(verdict.stop);
  15897 | }
  15898 | 
  15899 | /**
  15900 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  15901 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  15902 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  15903 |  * page structure agrees, anything else refuses before the first step acts.
  15904 |  * `similarity` is what replay's adapter passes: where the recording kept a
  15905 |  * page fingerprint, the call site measures the live page with the shared
  15906 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  15907 |  * could not be read, exactly as replay; null where the recording kept none
  15908 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  15909 |  * compiled before the vector travelled, which refuses a soft match it cannot
  15910 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  15911 |  * (arguments evaluate left to right), as replay reads startUrl before it
  15912 |  * fingerprints: both describe the page as the segment found it, not where a
  15913 |  * navigation in flight landed during the measurement. Async so the call site
  15914 |  * must await it: a gate that could be left un-awaited is one that can
  15915 |  * silently become a no-op. Decided as replay decides it: through
  15916 |  * preconditionVerdictWithFacts (src/execution/facts-route.ts) over the facts
  15917 |  * snapshot this file carries for the url (siteFactsAt), which is the plain
  15918 |  * preconditionVerdict wherever no reliable site fact bears on the url.
  15919 |  */
  15920 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  15921 |   const verdict = preconditionVerdictWithFacts(siteFactsAt(url), pattern, url, p, similarity, mints);
  15922 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
> 15923 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
        |                             ^ Error: 05-add s_f44792: not on the page this procedure starts from (expects http://127.0.0.1:8100/app/sales-order/new-sales-order-uxvwbpigvk, browser is at http://127.0.0.1:8100/app/sales-order/new-sales-order-mdlpkyruxc) — nothing of this segment has run
  15924 | }
  15925 | 
  15926 | /**
  15927 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  15928 |  * source of truth, so the vector is carried once. A segment the emitter
  15929 |  * asked this of always has one; its absence means FLOW was edited by hand,
  15930 |  * and the gate fails closed rather than soft-match on the url alone.
  15931 |  */
  15932 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  15933 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  15934 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  15935 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  15936 |   return recorded;
  15937 | }
  15938 | 
  15939 | /**
  15940 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  15941 |  *
  15942 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  15943 |  * action and, when the action changed it, awaits settleDom before binding
  15944 |  * the step's derived values — the value a spec needs is the one on the url
  15945 |  * the step navigated TO, and `page.url()` read in the same tick as the
  15946 |  * click still says where the page came FROM. Bound empty, every pattern
  15947 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  15948 |  *
  15949 |  * ALL of them together, not one at a time, because they are read into ONE
  15950 |  * pattern: an app is free to populate its state fragment key by key (odoo
  15951 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  15952 |  * that binds the instant IT is non-empty can be bound off a half-built url
  15953 |  * while its neighbour is still missing. The step is not where it was
  15954 |  * recorded until every part is there.
  15955 |  *
  15956 |  * A spec has no settleDom, so it polls on the shared resolve cadence
  15957 |  * (RESOLVE_POLL_MS) within the window
  15958 |  * replay effectively allows a url (URL_WAIT_MS), and takes one last reading
  15959 |  * at the deadline: a step whose url genuinely does not change (the parts were
  15960 |  * already there) must still bind what is there rather than hang or throw.
  15961 |  *
  15962 |  * The parts themselves come from the shared `urlPart` (src/execution/url.ts),
  15963 |  * the daemon's own labelling; a part the url does not carry is undefined.
  15964 |  */
  15965 | async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {
  15966 |   const read = (url: string) => labels.map((label) => urlPart(url, label));
  15967 |   for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {
  15968 |     const url = page.url();
  15969 |     const values = read(url);
  15970 |     if (url !== urlBefore && values.every(Boolean)) {
  15971 |       // The parts are there — but an app is free to redirect AGAIN from
  15972 |       // the url that first carried them, and the value that matters is
  15973 |       // the one on the url the step SETTLES on. Replay never sees this,
  15974 |       // because it binds derived values only after settleDom absorbs the
  15975 |       // whole redirect chain. So: let the DOM go quiet, and if the url
  15976 |       // moved while it did, settle once more before reading.
  15977 |       for (let pass = 0; pass < 2; pass++) {
  15978 |         const before = page.url();
  15979 |         await settle(page);
  15980 |         if (page.url() === before) break;
  15981 |       }
  15982 |       return read(page.url());
  15983 |     }
  15984 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  15985 |   }
  15986 |   return read(page.url());
  15987 | }
  15988 | 
  15989 | /** One part, on the same terms. `urlBefore` is omitted where no action of this step
  15990 |   * moved the page: then the wait is simply for the part to be there at all, which is
  15991 |   * what the flow runner does before it publishes a step's url outputs (consumedUrlOutputs). */
  15992 | async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {
  15993 |   return (await urlPartsWhen(page, [label], urlBefore))[0];
  15994 | }
  15995 | 
  15996 | /**
  15997 |  * A derived value, bound as replay binds it: only when the url carries the
  15998 |  * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,
  15999 |  * which urlDiff reads as a wildcard and a locator as text no page shows.
  16000 |  */
  16001 | function bindPart(p: Record<string, string>, name: string, value: string | undefined): void {
  16002 |   if (value !== undefined) p[name] = value;
  16003 | }
  16004 | 
  16005 | const CLICK_TIER_MS = 5000;
  16006 | async function click(loc: Locator, opts: { dbl?: boolean; obs?: ActionObservation | null } = {}): Promise<void> {
  16007 |   // The tiers are cut to what is left of the action's deadline, and report how the click went out.
  16008 |   await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });
  16009 | }
  16010 | 
  16011 | /** The words the daemon reports a verified recipe in (its tool result), as a grep-able line. */
  16012 | function logRecipe(attempt: RecipeAttempt): void {
  16013 |   console.log(`[sitelooper recipe] ${describeRecipeAttempt(attempt)}`);
  16014 | }
  16015 | 
  16016 | /**
  16017 |  * A recorded `fill`, executed as tools.ts's `case 'fill'` executes it: the
  16018 |  * shared ladder `fillWithRecipe` (src/execution/recipes.ts, embedded above)
  16019 |  * — the component recipe first, verified against the widget's own read,
  16020 |  * and the native reactSafeFill only when nothing was verified. Both halves
  16021 |  * matter. A keyboard-driven editor has no value property to set (monaco's
  16022 |  * `<textarea>` is an input sink and the text you see is a rendered
  16023 |  * `.view-lines` div), so a native setter writes into a box the editor never
```