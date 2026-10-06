# Goal: product flow (Grocy)

This is a GOAL, not a list of UI steps. Work out how to achieve it yourself.

The app is Grocy, a household stock manager, at {{APP_URL}}.
Sign in with username `{{APP_EMAIL}}` and password `{{env:APP_PASSWORD}}`.
Pass the password to the browser exactly as the text `{{env:APP_PASSWORD}}` (it is filled in when typed); never write `$APP_PASSWORD`, never guess or spell out a password.

## Objectives

1. Report the names of the products whose name starts with `Seed:`, exactly as shown.
2. A product named `<RUNID> Bench Product` exists whose description has a paragraph that
   includes the runid.
3. Its default location is the existing location `Pantry` and its product group is the
   existing group `Snacks`.
4. Its quantity unit for stock and its default quantity unit for purchase are both `Pack`, and
   its minimum stock amount is 4.
5. Its default due days are 30, and it has the barcode `<RUNID>-0001`.
6. 3 Packs of it have been purchased, in one purchase, into the location `Pantry` with the due
   date 2026-12-31, so that 3 are in stock.
7. Report the product's ID exactly as it appears in the address of its edit page (Grocy
   addresses a product as `/product/<id>`).

Substitute the runid you were given for `<RUNID>` everywhere above, exactly as provided.

## Notes on the environment

- Do not modify the seed products (names starting `Seed:`), and do not create, rename or
  delete locations, quantity units or product groups; objective 1 only reads the products.
- Other choices have similar names: locations `Pantry Shelf` and `Garage Pantry`, quantity
  units `Package` and `Six-pack`, product groups `Snacks & Sweets` and `Healthy Snacks`.
- The description is a rich-text editor: text only counts once it has been typed into the
  editor and the product saved, and the paragraph should appear once, not twice.
- Nothing on the product counts until it has been saved. A product has an ID only once it has
  been saved for the first time, and barcodes can be added to a product only after that.
- A purchase picks the product by name. The product field there can also start creating a new
  product or link an unknown barcode, which objective 6 does not want. A purchase suggests a
  due date from the product's default due days; objective 6 needs 2026-12-31.
- Every purchase is booked as it is saved; a second purchase adds to the stock rather than
  replacing the first.

## What to report

When you are done, stop calling tools and give a final plain-text report with one line per
objective above: the objective number, DONE or FAILED, and the concrete value(s) you observed
from the page (names, description, location, product group, quantity units, minimum stock
amount, default due days, barcode, stock amount and due date, ID). If an objective defeated
you, say so plainly — do not guess a value or claim success you did not verify.
