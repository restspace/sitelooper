# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fwen8-luna-cv.spec.ts >> fwen8-luna-cv
- Location: fwen8-luna-cv.spec.ts:9:1

# Error details

```
Error: 05-add s_f44792: not on the page this procedure starts from (expects http://127.0.0.1:8100/app/sales-order/new-sales-order-uxvwbpigvk, browser is at http://127.0.0.1:8100/app/sales-order/new-sales-order-fvwhlnzdcv) — nothing of this segment has run
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
              - /url: /app/sales-order/new-sales-order-fvwhlnzdcv
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
                        - combobox [ref=e110]: fwen8-luna-cv-spec Bench Customer  
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
                    - generic [ref=e213] [cursor=pointer]:
                      - checkbox [ref=e215]
                      - generic [ref=e216]: "1"
                      - generic [ref=e219]: 2026-12-31
                      - generic [ref=e222]: "0"
                      - generic [ref=e225]: $ 0.00
                      - generic [ref=e228]: $ 0.00
                      - img [ref=e232]
                  - generic [ref=e235]:
                    - generic [ref=e236]:
                      - button "Add Row" [ref=e237] [cursor=pointer]
                      - button "Add Multiple" [ref=e238] [cursor=pointer]
                    - generic [ref=e239]:
                      - button "Download" [ref=e240] [cursor=pointer]
                      - button "Upload" [ref=e241] [cursor=pointer]
              - generic [ref=e243]:
                - generic [ref=e246]:
                  - generic [ref=e247]:
                    - generic [ref=e249]: Total Quantity
                    - generic [ref=e250]:
                      - generic [ref=e251]: "0"
                      - paragraph
                  - generic: total_qty
                - generic [ref=e255]:
                  - generic [ref=e256]:
                    - generic [ref=e258]: Total (USD)
                    - generic [ref=e259]:
                      - generic [ref=e260]: $ 0.00
                      - paragraph
                  - generic: total
              - generic [ref=e261]:
                - generic [ref=e262]: Taxes
                - generic [ref=e263]:
                  - generic [ref=e265]:
                    - generic [ref=e266]:
                      - generic [ref=e267]:
                        - generic [ref=e269]: Tax Category
                        - generic [ref=e270]:
                          - generic [ref=e273]:
                            - combobox [ref=e274]
                            - status [ref=e275]: Begin typing for results.
                          - paragraph
                      - generic: tax_category
                    - generic [ref=e276]:
                      - generic [ref=e277]:
                        - generic [ref=e279]: Sales Taxes and Charges Template
                        - generic [ref=e280]:
                          - generic [ref=e283]:
                            - combobox [ref=e284]: US ST 6%
                            - status [ref=e285]: Begin typing for results.
                          - paragraph
                      - generic: taxes_and_charges
                    - generic [ref=e286]:
                      - generic [ref=e287]:
                        - generic [ref=e288]:
                          - checkbox "Is customer exempted from sales tax?" [ref=e290]
                          - generic [ref=e291]: Is customer exempted from sales tax?
                        - paragraph
                      - generic: exempt_from_sales_tax
                  - generic [ref=e294]:
                    - generic [ref=e295]:
                      - generic [ref=e297]: Shipping Rule
                      - generic [ref=e298]:
                        - generic [ref=e301]:
                          - combobox [ref=e302]
                          - status [ref=e303]: Begin typing for results.
                        - paragraph
                    - generic: shipping_rule
                  - generic [ref=e306]:
                    - generic [ref=e307]:
                      - generic [ref=e309]: Incoterm
                      - generic [ref=e310]:
                        - generic [ref=e313]:
                          - combobox [ref=e314]
                          - status [ref=e315]: Begin typing for results.
                        - paragraph
                    - generic: incoterm
              - generic [ref=e320]:
                - generic: taxes
                - generic [ref=e321]:
                  - generic [ref=e322]: Sales Taxes and Charges
                  - generic [ref=e324]:
                    - generic [ref=e327]:
                      - checkbox [ref=e329]
                      - generic [ref=e330]: No.
                      - generic "Type" [ref=e331]:
                        - generic [ref=e332]: Type *
                      - generic "Account Head" [ref=e333]:
                        - generic [ref=e334]: Account Head *
                      - generic "Tax Rate" [ref=e335]:
                        - generic [ref=e336]: Tax Rate
                      - generic "Amount (USD)" [ref=e337]:
                        - generic [ref=e338]: Amount (USD)
                      - generic "Total (USD)" [ref=e339]:
                        - generic [ref=e340]: Total (USD)
                      - img [ref=e343] [cursor=pointer]
                    - generic [ref=e348] [cursor=pointer]:
                      - checkbox [ref=e350]
                      - generic [ref=e351]: "1"
                      - generic [ref=e353]: On Net Total
                      - link "ST 6% - BC" [ref=e356]:
                        - /url: /app/account/ST%206%25%20-%20BC
                      - generic [ref=e359]: "6"
                      - generic [ref=e362]: $ 0.00
                      - generic [ref=e365]: $ 0.00
                      - img [ref=e369]
                  - button "Add Row" [ref=e374] [cursor=pointer]
              - generic [ref=e380]:
                - generic [ref=e381]:
                  - generic [ref=e383]: Total Taxes and Charges (USD)
                  - generic [ref=e384]:
                    - generic [ref=e385]: $ 0.00
                    - paragraph
                - generic: total_taxes_and_charges
              - generic [ref=e386]:
                - generic [ref=e387]: Totals
                - generic [ref=e391]:
                  - generic [ref=e392]:
                    - generic [ref=e393]:
                      - generic [ref=e395]: Grand Total (USD)
                      - generic [ref=e396]:
                        - generic [ref=e397]: $ 0.00
                        - paragraph
                    - generic: grand_total
                  - generic [ref=e398]:
                    - generic [ref=e399]:
                      - generic [ref=e401]: Rounding Adjustment (USD)
                      - generic [ref=e402]:
                        - generic [ref=e403]: $ 0.00
                        - paragraph
                    - generic: rounding_adjustment
                  - generic [ref=e404]:
                    - generic [ref=e405]:
                      - generic [ref=e407]: Rounded Total (USD)
                      - generic [ref=e408]:
                        - generic [ref=e409]: $ 0.00
                        - paragraph
                    - generic: rounded_total
                  - generic [ref=e410]:
                    - generic [ref=e411]:
                      - generic [ref=e413]: Advance Paid
                      - generic [ref=e414]:
                        - generic [ref=e415]: $ 0.00
                        - paragraph
                    - generic: advance_paid
              - generic [ref=e417] [cursor=pointer]:
                - text: Additional Discount
                - img [ref=e419]
            - text: "* * Normal Heading 1 Heading 2 Heading 3 Heading 4 Heading 5 Heading 6 Normal --- --- 8px 9px 10px 11px 12px 13px 14px 15px 16px 18px 20px 22px 24px 32px 36px 40px 48px 54px 64px 96px 128px Table Insert Table Insert Row Above Insert Row Below Insert Column Right Insert Column Left Delete Row Delete Column Delete Table Visit URL: EditRemove * *"
        - text: Type a reply / comment ×
    - contentinfo
  - generic:
    - generic [ref=e421]:
      - navigation [ref=e423]:
        - img [ref=e425] [cursor=pointer]
        - generic [ref=e427] [cursor=pointer]:
          - text: October,
          - generic [ref=e428]: "2026"
        - img [ref=e430] [cursor=pointer]
      - generic [ref=e433]:
        - generic [ref=e434]:
          - generic [ref=e435]: Su
          - generic [ref=e436]: Mo
          - generic [ref=e437]: Tu
          - generic [ref=e438]: We
          - generic [ref=e439]: Th
          - generic [ref=e440]: Fr
          - generic [ref=e441]: Sa
        - generic [ref=e442]:
          - generic [ref=e443] [cursor=pointer]: "27"
          - generic [ref=e444] [cursor=pointer]: "28"
          - generic [ref=e445] [cursor=pointer]: "29"
          - generic [ref=e446] [cursor=pointer]: "30"
          - generic [ref=e447] [cursor=pointer]: "1"
          - generic [ref=e448] [cursor=pointer]: "2"
          - generic [ref=e449] [cursor=pointer]: "3"
          - generic [ref=e450] [cursor=pointer]: "4"
          - generic [ref=e451] [cursor=pointer]: "5"
          - generic [ref=e452] [cursor=pointer]: "6"
          - generic [ref=e453] [cursor=pointer]: "7"
          - generic [ref=e454] [cursor=pointer]: "8"
          - generic [ref=e455] [cursor=pointer]: "9"
          - generic [ref=e456] [cursor=pointer]: "10"
          - generic [ref=e457] [cursor=pointer]: "11"
          - generic [ref=e458] [cursor=pointer]: "12"
          - generic [ref=e459] [cursor=pointer]: "13"
          - generic [ref=e460] [cursor=pointer]: "14"
          - generic [ref=e461] [cursor=pointer]: "15"
          - generic [ref=e462] [cursor=pointer]: "16"
          - generic [ref=e463] [cursor=pointer]: "17"
          - generic [ref=e464] [cursor=pointer]: "18"
          - generic [ref=e465] [cursor=pointer]: "19"
          - generic [ref=e466] [cursor=pointer]: "20"
          - generic [ref=e467] [cursor=pointer]: "21"
          - generic [ref=e468] [cursor=pointer]: "22"
          - generic [ref=e469] [cursor=pointer]: "23"
          - generic [ref=e470] [cursor=pointer]: "24"
          - generic [ref=e471] [cursor=pointer]: "25"
          - generic [ref=e472] [cursor=pointer]: "26"
          - generic [ref=e473] [cursor=pointer]: "27"
          - generic [ref=e474] [cursor=pointer]: "28"
          - generic [ref=e475] [cursor=pointer]: "29"
          - generic [ref=e476] [cursor=pointer]: "30"
          - generic [ref=e477] [cursor=pointer]: "31"
      - generic [ref=e479] [cursor=pointer]: Today
    - generic [ref=e480]:
      - navigation [ref=e482]:
        - img [ref=e484] [cursor=pointer]
        - generic [ref=e486] [cursor=pointer]:
          - text: December,
          - generic [ref=e487]: "2026"
        - img [ref=e489] [cursor=pointer]
      - generic [ref=e492]:
        - generic [ref=e493]:
          - generic [ref=e494]: Su
          - generic [ref=e495]: Mo
          - generic [ref=e496]: Tu
          - generic [ref=e497]: We
          - generic [ref=e498]: Th
          - generic [ref=e499]: Fr
          - generic [ref=e500]: Sa
        - generic [ref=e501]:
          - generic [ref=e502] [cursor=pointer]: "29"
          - generic [ref=e503] [cursor=pointer]: "30"
          - generic [ref=e504] [cursor=pointer]: "1"
          - generic [ref=e505] [cursor=pointer]: "2"
          - generic [ref=e506] [cursor=pointer]: "3"
          - generic [ref=e507] [cursor=pointer]: "4"
          - generic [ref=e508] [cursor=pointer]: "5"
          - generic [ref=e509] [cursor=pointer]: "6"
          - generic [ref=e510] [cursor=pointer]: "7"
          - generic [ref=e511] [cursor=pointer]: "8"
          - generic [ref=e512] [cursor=pointer]: "9"
          - generic [ref=e513] [cursor=pointer]: "10"
          - generic [ref=e514] [cursor=pointer]: "11"
          - generic [ref=e515] [cursor=pointer]: "12"
          - generic [ref=e516] [cursor=pointer]: "13"
          - generic [ref=e517] [cursor=pointer]: "14"
          - generic [ref=e518] [cursor=pointer]: "15"
          - generic [ref=e519] [cursor=pointer]: "16"
          - generic [ref=e520] [cursor=pointer]: "17"
          - generic [ref=e521] [cursor=pointer]: "18"
          - generic [ref=e522] [cursor=pointer]: "19"
          - generic [ref=e523] [cursor=pointer]: "20"
          - generic [ref=e524] [cursor=pointer]: "21"
          - generic [ref=e525] [cursor=pointer]: "22"
          - generic [ref=e526] [cursor=pointer]: "23"
          - generic [ref=e527] [cursor=pointer]: "24"
          - generic [ref=e528] [cursor=pointer]: "25"
          - generic [ref=e529] [cursor=pointer]: "26"
          - generic [ref=e530] [cursor=pointer]: "27"
          - generic [ref=e531] [cursor=pointer]: "28"
          - generic [ref=e532] [cursor=pointer]: "29"
          - generic [ref=e533] [cursor=pointer]: "30"
          - generic [ref=e534] [cursor=pointer]: "31"
          - generic [ref=e535] [cursor=pointer]: "1"
          - generic [ref=e536] [cursor=pointer]: "2"
      - generic [ref=e538] [cursor=pointer]: Today
    - generic [ref=e539]:
      - navigation [ref=e541]:
        - img [ref=e543] [cursor=pointer]
        - generic [ref=e545] [cursor=pointer]:
          - text: October,
          - generic [ref=e546]: "2026"
        - img [ref=e548] [cursor=pointer]
      - generic [ref=e551]:
        - generic [ref=e552]:
          - generic [ref=e553]: Su
          - generic [ref=e554]: Mo
          - generic [ref=e555]: Tu
          - generic [ref=e556]: We
          - generic [ref=e557]: Th
          - generic [ref=e558]: Fr
          - generic [ref=e559]: Sa
        - generic [ref=e560]:
          - generic [ref=e561] [cursor=pointer]: "27"
          - generic [ref=e562] [cursor=pointer]: "28"
          - generic [ref=e563] [cursor=pointer]: "29"
          - generic [ref=e564] [cursor=pointer]: "30"
          - generic [ref=e565] [cursor=pointer]: "1"
          - generic [ref=e566] [cursor=pointer]: "2"
          - generic [ref=e567] [cursor=pointer]: "3"
          - generic [ref=e568] [cursor=pointer]: "4"
          - generic [ref=e569] [cursor=pointer]: "5"
          - generic [ref=e570] [cursor=pointer]: "6"
          - generic [ref=e571] [cursor=pointer]: "7"
          - generic [ref=e572] [cursor=pointer]: "8"
          - generic [ref=e573] [cursor=pointer]: "9"
          - generic [ref=e574] [cursor=pointer]: "10"
          - generic [ref=e575] [cursor=pointer]: "11"
          - generic [ref=e576] [cursor=pointer]: "12"
          - generic [ref=e577] [cursor=pointer]: "13"
          - generic [ref=e578] [cursor=pointer]: "14"
          - generic [ref=e579] [cursor=pointer]: "15"
          - generic [ref=e580] [cursor=pointer]: "16"
          - generic [ref=e581] [cursor=pointer]: "17"
          - generic [ref=e582] [cursor=pointer]: "18"
          - generic [ref=e583] [cursor=pointer]: "19"
          - generic [ref=e584] [cursor=pointer]: "20"
          - generic [ref=e585] [cursor=pointer]: "21"
          - generic [ref=e586] [cursor=pointer]: "22"
          - generic [ref=e587] [cursor=pointer]: "23"
          - generic [ref=e588] [cursor=pointer]: "24"
          - generic [ref=e589] [cursor=pointer]: "25"
          - generic [ref=e590] [cursor=pointer]: "26"
          - generic [ref=e591] [cursor=pointer]: "27"
          - generic [ref=e592] [cursor=pointer]: "28"
          - generic [ref=e593] [cursor=pointer]: "29"
          - generic [ref=e594] [cursor=pointer]: "30"
          - generic [ref=e595] [cursor=pointer]: "31"
      - generic [ref=e597] [cursor=pointer]: Today
    - generic [ref=e598]:
      - navigation [ref=e600]:
        - img [ref=e602] [cursor=pointer]
        - generic [ref=e604] [cursor=pointer]:
          - text: October,
          - generic [ref=e605]: "2026"
        - img [ref=e607] [cursor=pointer]
      - generic [ref=e610]:
        - generic [ref=e611]:
          - generic [ref=e612]: Su
          - generic [ref=e613]: Mo
          - generic [ref=e614]: Tu
          - generic [ref=e615]: We
          - generic [ref=e616]: Th
          - generic [ref=e617]: Fr
          - generic [ref=e618]: Sa
        - generic [ref=e619]:
          - generic [ref=e620] [cursor=pointer]: "27"
          - generic [ref=e621] [cursor=pointer]: "28"
          - generic [ref=e622] [cursor=pointer]: "29"
          - generic [ref=e623] [cursor=pointer]: "30"
          - generic [ref=e624] [cursor=pointer]: "1"
          - generic [ref=e625] [cursor=pointer]: "2"
          - generic [ref=e626] [cursor=pointer]: "3"
          - generic [ref=e627] [cursor=pointer]: "4"
          - generic [ref=e628] [cursor=pointer]: "5"
          - generic [ref=e629] [cursor=pointer]: "6"
          - generic [ref=e630] [cursor=pointer]: "7"
          - generic [ref=e631] [cursor=pointer]: "8"
          - generic [ref=e632] [cursor=pointer]: "9"
          - generic [ref=e633] [cursor=pointer]: "10"
          - generic [ref=e634] [cursor=pointer]: "11"
          - generic [ref=e635] [cursor=pointer]: "12"
          - generic [ref=e636] [cursor=pointer]: "13"
          - generic [ref=e637] [cursor=pointer]: "14"
          - generic [ref=e638] [cursor=pointer]: "15"
          - generic [ref=e639] [cursor=pointer]: "16"
          - generic [ref=e640] [cursor=pointer]: "17"
          - generic [ref=e641] [cursor=pointer]: "18"
          - generic [ref=e642] [cursor=pointer]: "19"
          - generic [ref=e643] [cursor=pointer]: "20"
          - generic [ref=e644] [cursor=pointer]: "21"
          - generic [ref=e645] [cursor=pointer]: "22"
          - generic [ref=e646] [cursor=pointer]: "23"
          - generic [ref=e647] [cursor=pointer]: "24"
          - generic [ref=e648] [cursor=pointer]: "25"
          - generic [ref=e649] [cursor=pointer]: "26"
          - generic [ref=e650] [cursor=pointer]: "27"
          - generic [ref=e651] [cursor=pointer]: "28"
          - generic [ref=e652] [cursor=pointer]: "29"
          - generic [ref=e653] [cursor=pointer]: "30"
          - generic [ref=e654] [cursor=pointer]: "31"
      - generic [ref=e656] [cursor=pointer]: Today
    - generic [ref=e657]:
      - navigation [ref=e659]:
        - img [ref=e661] [cursor=pointer]
        - generic [ref=e663] [cursor=pointer]:
          - text: October,
          - generic [ref=e664]: "2026"
        - img [ref=e666] [cursor=pointer]
      - generic [ref=e669]:
        - generic [ref=e670]:
          - generic [ref=e671]: Su
          - generic [ref=e672]: Mo
          - generic [ref=e673]: Tu
          - generic [ref=e674]: We
          - generic [ref=e675]: Th
          - generic [ref=e676]: Fr
          - generic [ref=e677]: Sa
        - generic [ref=e678]:
          - generic [ref=e679] [cursor=pointer]: "27"
          - generic [ref=e680] [cursor=pointer]: "28"
          - generic [ref=e681] [cursor=pointer]: "29"
          - generic [ref=e682] [cursor=pointer]: "30"
          - generic [ref=e683] [cursor=pointer]: "1"
          - generic [ref=e684] [cursor=pointer]: "2"
          - generic [ref=e685] [cursor=pointer]: "3"
          - generic [ref=e686] [cursor=pointer]: "4"
          - generic [ref=e687] [cursor=pointer]: "5"
          - generic [ref=e688] [cursor=pointer]: "6"
          - generic [ref=e689] [cursor=pointer]: "7"
          - generic [ref=e690] [cursor=pointer]: "8"
          - generic [ref=e691] [cursor=pointer]: "9"
          - generic [ref=e692] [cursor=pointer]: "10"
          - generic [ref=e693] [cursor=pointer]: "11"
          - generic [ref=e694] [cursor=pointer]: "12"
          - generic [ref=e695] [cursor=pointer]: "13"
          - generic [ref=e696] [cursor=pointer]: "14"
          - generic [ref=e697] [cursor=pointer]: "15"
          - generic [ref=e698] [cursor=pointer]: "16"
          - generic [ref=e699] [cursor=pointer]: "17"
          - generic [ref=e700] [cursor=pointer]: "18"
          - generic [ref=e701] [cursor=pointer]: "19"
          - generic [ref=e702] [cursor=pointer]: "20"
          - generic [ref=e703] [cursor=pointer]: "21"
          - generic [ref=e704] [cursor=pointer]: "22"
          - generic [ref=e705] [cursor=pointer]: "23"
          - generic [ref=e706] [cursor=pointer]: "24"
          - generic [ref=e707] [cursor=pointer]: "25"
          - generic [ref=e708] [cursor=pointer]: "26"
          - generic [ref=e709] [cursor=pointer]: "27"
          - generic [ref=e710] [cursor=pointer]: "28"
          - generic [ref=e711] [cursor=pointer]: "29"
          - generic [ref=e712] [cursor=pointer]: "30"
          - generic [ref=e713] [cursor=pointer]: "31"
      - generic [ref=e715] [cursor=pointer]: Today
```

# Test source

```ts
  16284 |   if (stop) throw new Error(stop);
  16285 | }
  16286 | 
  16287 | /**
  16288 |  * Where the step was supposed to leave the browser — replay's expectedUrl
  16289 |  * gate. The VERDICT is the shared urlEffectVerdict (src/execution/gates.ts,
  16290 |  * embedded): a strict urlMatches passes, a same-shape url with 1–2 differing
  16291 |  * literal segments is treated as volatile (warned, continued), anything else
  16292 |  * stops. Only the WAIT is this file's own: the recorded url may still be on
  16293 |  * its way (an SPA sign-in answers the click, then routes a moment later), so
  16294 |  * a strict match is given URL_WAIT_MS on the navigation itself before the
  16295 |  * verdict is asked once, of wherever the browser then is. `link` is what the
  16296 |  * step's click reported of the link it clicked (the shared beginAction): a
  16297 |  * click that went where its link points, recorded as staying on the page it
  16298 |  * left, is the shared linkLandingWarning and waits for nothing.
  16299 |  */
  16300 | async function urlEffect(page: Page, pattern: string, p: Record<string, string>, where: string, volatile: UrlSegDiff[], link?: LinkNavigation): Promise<void> {
  16301 |   if (!urlMatches(pattern, page.url(), p)) {
  16302 |     const landed = linkLandingWarning(pattern, page.url(), p, where, link);
  16303 |     if (landed) return logWarning(landed);
  16304 |   }
  16305 |   await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});
  16306 |   const verdict = urlEffectVerdict(pattern, page.url(), p, where, link);
  16307 |   for (const line of verdict.warnings) logWarning(line);
  16308 |   // What this step watched vary is the segment's evidence from here on
  16309 |   // (navigationTarget), whether or not the step goes on to stop.
  16310 |   if (verdict.diffs) volatile.push(...verdict.diffs);
  16311 |   if (verdict.stop) throw new Error(verdict.stop);
  16312 | }
  16313 | 
  16314 | /**
  16315 |  * Where a goto actually sends the browser — the shared retargetNavigation
  16316 |  * (src/execution/gates.ts): a recorded target whose only disagreement with
  16317 |  * the live url sits at a position THIS segment has already watched vary is a
  16318 |  * literal from the recording's run, and the live value is navigated to
  16319 |  * instead. `volatile` is the segment ledger urlEffect fills, as replay keeps
  16320 |  * one per replayed skill. The returned `stale` is handed to this step's
  16321 |  * alert gate, so an unrecorded alert on the landing names the cause.
  16322 |  */
  16323 | function navigationTarget(target: string, page: Page, volatile: UrlSegDiff[], where: string): NavigationTarget {
  16324 |   const verdict = retargetNavigation(target, page.url(), volatile, where);
  16325 |   if (verdict.warning) logWarning(verdict.warning);
  16326 |   return verdict;
  16327 | }
  16328 | 
  16329 | /**
  16330 |  * The alert observation a step is judged by, taken where the daemon takes
  16331 |  * its diff: after the action, once the DOM has settled (tools.ts
  16332 |  * settledSignature), and before any url wait — a toast that auto-dismisses
  16333 |  * inside verify's url window is seen by both runners or by neither.
  16334 |  * Rendered in the step's line dialect, with whether every live region was
  16335 |  * seen (the alert cap, an unread frame): "none raised" needs a full look.
  16336 |  */
  16337 | async function settledAlerts(page: Page, dialect: LineDialect = 1): Promise<ObservedAlerts | null> {
  16338 |   await settle(page);
  16339 |   return liveAlertsObserved(page, dialect);
  16340 | }
  16341 | 
  16342 | /**
  16343 |  * The live-region alerts a step raised, judged by the shared alertVerdict
  16344 |  * (src/execution/gates.ts): an alert the recording never saw is reported,
  16345 |  * and stops a state-changing step only when its recorded page changes did
  16346 |  * not confirm it worked (a rejection toast that leaves the page superficially
  16347 |  * intact); a recorded-but-missing one only warns.
  16348 |  * Both observations are taken by the step lifecycle — `before` in prepare,
  16349 |  * `after` in settle, right after the action has settled and BEFORE the url
  16350 |  * wait in verify, where the daemon takes its diff (a toast that auto-dismisses
  16351 |  * during a 5s url wait must not be missed) — and a page that could not be
  16352 |  * read is handed over as unobserved, never as "no alert".
  16353 |  */
  16354 | function alertGate(before: string[], after: ObservedAlerts | null, ctx: { where: string; isRead: boolean; expectedContains?: string; params: Record<string, string>; effectConfirmed?: boolean; navigatedToStale?: string }): void {
  16355 |   const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);
  16356 |   for (const line of verdict.warnings) logWarning(line);
  16357 |   if (verdict.stop) throw new Error(verdict.stop);
  16358 | }
  16359 | 
  16360 | /**
  16361 |  * Where a segment starts — replay's start-of-segment rule, through the shared
  16362 |  * preconditionVerdict (src/execution/gates.ts): a strict url match passes, a
  16363 |  * same-shape url with 1–2 differing segments proceeds with a warning when the
  16364 |  * page structure agrees, anything else refuses before the first step acts.
  16365 |  * `similarity` is what replay's adapter passes: where the recording kept a
  16366 |  * page fingerprint, the call site measures the live page with the shared
  16367 |  * fingerprintPage and hands over the cosine of recorded and live — null when the page
  16368 |  * could not be read, exactly as replay; null where the recording kept none
  16369 |  * (the url alone decides); 'unmeasured' only for a segment of a file
  16370 |  * compiled before the vector travelled, which refuses a soft match it cannot
  16371 |  * measure. `url` is read at the call site BEFORE `similarity` is measured
  16372 |  * (arguments evaluate left to right), as replay reads startUrl before it
  16373 |  * fingerprints: both describe the page as the segment found it, not where a
  16374 |  * navigation in flight landed during the measurement. Async so the call site
  16375 |  * must await it: a gate that could be left un-awaited is one that can
  16376 |  * silently become a no-op. Decided as replay decides it: through
  16377 |  * preconditionVerdictWithFacts (src/execution/facts-route.ts) over the facts
  16378 |  * snapshot this file carries for the url (siteFactsAt), which is the plain
  16379 |  * preconditionVerdict wherever no reliable site fact bears on the url.
  16380 |  */
  16381 | async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured', mints: { at: string; step: number }[] = []): Promise<void> {
  16382 |   const verdict = preconditionVerdictWithFacts(siteFactsAt(url), pattern, url, p, similarity, mints);
  16383 |   for (const line of verdict.warnings) logWarning(`${where}: ${line}`);
> 16384 |   if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);
        |                             ^ Error: 05-add s_f44792: not on the page this procedure starts from (expects http://127.0.0.1:8100/app/sales-order/new-sales-order-uxvwbpigvk, browser is at http://127.0.0.1:8100/app/sales-order/new-sales-order-fvwhlnzdcv) — nothing of this segment has run
  16385 | }
  16386 | 
  16387 | /**
  16388 |  * The structural page fingerprint a segment recorded, read from FLOW — the
  16389 |  * source of truth, so the vector is carried once. A segment the emitter
  16390 |  * asked this of always has one; its absence means FLOW was edited by hand,
  16391 |  * and the gate fails closed rather than soft-match on the url alone.
  16392 |  */
  16393 | function recordedFingerprint(stepId: string, segmentId: string): number[] {
  16394 |   const steps = FLOW.steps as unknown as readonly { id: string; segments: readonly { id: string; preconditions: { fingerprint?: number[] } }[] }[];
  16395 |   const recorded = steps.find((s) => s.id === stepId)?.segments.find((g) => g.id === segmentId)?.preconditions.fingerprint;
  16396 |   if (!recorded) throw new Error(`${stepId} ${segmentId}: FLOW carries no recorded page fingerprint for this segment (the file was edited) — recompile it with sitelooper`);
  16397 |   return recorded;
  16398 | }
  16399 | 
  16400 | /**
  16401 |  * The url parts a step mints, read AFTER the navigation it started has landed.
  16402 |  *
  16403 |  * WHICH REPLAY RULE THIS MIRRORS. runOneStep captures the url before the
  16404 |  * action and, when the action changed it, awaits settleDom before binding
  16405 |  * the step's derived values — the value a spec needs is the one on the url
  16406 |  * the step navigated TO, and `page.url()` read in the same tick as the
  16407 |  * click still says where the page came FROM. Bound empty, every pattern
  16408 |  * built from these parts (`toHaveURL`, an identity marker) can only fail.
  16409 |  *
  16410 |  * ALL of them together, not one at a time, because they are read into ONE
  16411 |  * pattern: an app is free to populate its state fragment key by key (odoo
  16412 |  * lands on `#cids=1&menu_id=81` and adds `action=` a beat later), so a part
  16413 |  * that binds the instant IT is non-empty can be bound off a half-built url
  16414 |  * while its neighbour is still missing. The step is not where it was
  16415 |  * recorded until every part is there.
  16416 |  *
  16417 |  * A spec has no settleDom, so it polls on the shared resolve cadence
  16418 |  * (RESOLVE_POLL_MS) within the window
  16419 |  * replay effectively allows a url (URL_WAIT_MS), and takes one last reading
  16420 |  * at the deadline: a step whose url genuinely does not change (the parts were
  16421 |  * already there) must still bind what is there rather than hang or throw.
  16422 |  *
  16423 |  * The parts themselves come from the shared `urlPart` (src/execution/url.ts),
  16424 |  * the daemon's own labelling; a part the url does not carry is undefined.
  16425 |  */
  16426 | async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {
  16427 |   const read = (url: string) => labels.map((label) => urlPart(url, label));
  16428 |   for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {
  16429 |     const url = page.url();
  16430 |     const values = read(url);
  16431 |     if (url !== urlBefore && values.every(Boolean)) {
  16432 |       // The parts are there — but an app is free to redirect AGAIN from
  16433 |       // the url that first carried them, and the value that matters is
  16434 |       // the one on the url the step SETTLES on. Replay never sees this,
  16435 |       // because it binds derived values only after settleDom absorbs the
  16436 |       // whole redirect chain. So: let the DOM go quiet, and if the url
  16437 |       // moved while it did, settle once more before reading.
  16438 |       for (let pass = 0; pass < 2; pass++) {
  16439 |         const before = page.url();
  16440 |         await settle(page);
  16441 |         if (page.url() === before) break;
  16442 |       }
  16443 |       return read(page.url());
  16444 |     }
  16445 |     await page.waitForTimeout(RESOLVE_POLL_MS);
  16446 |   }
  16447 |   return read(page.url());
  16448 | }
  16449 | 
  16450 | /** One part, on the same terms. `urlBefore` is omitted where no action of this step
  16451 |   * moved the page: then the wait is simply for the part to be there at all, which is
  16452 |   * what the flow runner does before it publishes a step's url outputs (consumedUrlOutputs). */
  16453 | async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {
  16454 |   return (await urlPartsWhen(page, [label], urlBefore))[0];
  16455 | }
  16456 | 
  16457 | /**
  16458 |  * A derived value, bound as replay binds it: only when the url carries the
  16459 |  * part. Left unset, the `{{dN}}` marker stays literal wherever it is filled,
  16460 |  * which urlDiff reads as a wildcard and a locator as text no page shows.
  16461 |  */
  16462 | function bindPart(p: Record<string, string>, name: string, value: string | undefined): void {
  16463 |   if (value !== undefined) p[name] = value;
  16464 | }
  16465 | 
  16466 | const CLICK_TIER_MS = 5000;
  16467 | async function click(loc: Locator, opts: { dbl?: boolean; obs?: ActionObservation | null } = {}): Promise<void> {
  16468 |   // The tiers are cut to what is left of the action's deadline, and report how the click went out.
  16469 |   await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });
  16470 | }
  16471 | 
  16472 | /** The words the daemon reports a verified recipe in (its tool result), as a grep-able line. */
  16473 | function logRecipe(attempt: RecipeAttempt): void {
  16474 |   console.log(`[sitelooper recipe] ${describeRecipeAttempt(attempt)}`);
  16475 | }
  16476 | 
  16477 | /**
  16478 |  * A recorded `fill`, executed as tools.ts's `case 'fill'` executes it: the
  16479 |  * shared ladder `fillWithRecipe` (src/execution/recipes.ts, embedded above)
  16480 |  * — the component recipe first, verified against the widget's own read,
  16481 |  * and the native reactSafeFill only when nothing was verified. Both halves
  16482 |  * matter. A keyboard-driven editor has no value property to set (monaco's
  16483 |  * `<textarea>` is an input sink and the text you see is a rendered
  16484 |  * `.view-lines` div), so a native setter writes into a box the editor never
```