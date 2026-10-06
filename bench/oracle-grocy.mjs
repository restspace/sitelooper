/**
 * API oracle for the held-out grocy target (notes/HELDOUT2-PROTOCOL.md):
 * performs every objective of bench/tasks/grocy-product-flow.md through the
 * REST API exactly as a perfect run would, and writes the report a perfect run
 * would give to <BENCH_OUT>/<runid>-oracle-result.json ({ finalText }), so the
 * verifier can be proven before any tool runs:
 *
 *   node bench/reset-app.mjs --target grocy
 *   node bench/oracle-grocy.mjs gcoracle1 && node bench/verify-grocy.mjs gcoracle1   # all PASS
 *   node bench/reset-app.mjs --target grocy
 *   node bench/verify-grocy.mjs gcuntouched1                                         # all FAIL
 *
 * Never shown to the tools under test.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8106/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const KEY = process.env.GROCY_API_KEY || 'bench-grocy-api-key-0000000000000000000000000001'

const runid = process.argv[2]
if (!runid) {
  console.error('usage: node bench/oracle-grocy.mjs <runid>')
  process.exit(2)
}

async function api(method, route, body) {
  const res = await fetch(`${APP_URL}/api${route}`, {
    method,
    headers: {
      accept: 'application/json', 'GROCY-API-KEY': KEY,
      // Grocy compares the header to exactly "application/json" (no charset).
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`grocy ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
const one = async (entity, name) => {
  const row = (await api('GET', `/objects/${entity}`)).find((r) => r.name === name)
  if (!row) throw new Error(`no ${entity} "${name}" — reset the target first`)
  return row
}

// Objective 1: read the Seed: products' names.
const products = await api('GET', '/objects/products')
const seeds = products.filter((p) => /^Seed:/.test(p.name)).sort((a, b) => a.name.localeCompare(b.name))
if (!seeds.length) throw new Error('no Seed: products — reset the target first')

const name = `${runid} Bench Product`
if (products.some((p) => p.name === name)) throw new Error(`"${name}" already exists — reset the target first`)

// The existing choices, not their look-alikes.
const pantry = await one('locations', 'Pantry')
const snacks = await one('product_groups', 'Snacks')
const pack = await one('quantity_units', 'Pack')

// Objectives 2-5's product fields in one save, as the product form does
// (choosing the stock unit presets the purchase, consume and price units).
const created = await api('POST', '/objects/products', {
  name,
  description: `<p>Bench product created by run ${runid}.</p>`,
  active: 1,
  location_id: pantry.id,
  product_group_id: snacks.id,
  qu_id_stock: pack.id,
  qu_id_purchase: pack.id,
  qu_id_consume: pack.id,
  qu_id_price: pack.id,
  min_stock_amount: 4,
  default_best_before_days: 30,
})
const id = created.created_object_id

// Objective 5's barcode, from the product page's barcode form.
const barcode = `${runid}-0001`
await api('POST', '/objects/product_barcodes', { product_id: id, barcode, qu_id: pack.id, amount: 1 })

// Objective 6: one purchase of 3 Packs into Pantry, due 2026-12-31.
await api('POST', `/stock/products/${id}/add`, {
  amount: 3, best_before_date: '2026-12-31', transaction_type: 'purchase', location_id: pantry.id,
})

// Read back what the pages would show, for the report.
const saved = await api('GET', `/objects/products/${id}`)
const details = await api('GET', `/stock/products/${id}`)
const finalText = [
  `1. DONE — Seed products: ${seeds.map((s) => s.name).join('; ')}`,
  `2. DONE — product "${saved.name}" created, description: ${saved.description}`,
  `3. DONE — default location: ${pantry.name}, product group: ${snacks.name}`,
  `4. DONE — quantity unit stock: ${pack.name}, purchase: ${pack.name}, minimum stock amount: ${saved.min_stock_amount}`,
  `5. DONE — default due days: ${saved.default_best_before_days}, barcode: ${barcode}`,
  `6. DONE — purchased 3 ${pack.name_plural ?? pack.name} into ${pantry.name}, due 2026-12-31; in stock: ${details?.stock_amount}`,
  `7. DONE — ID: ${saved.id}`,
].join('\n')

fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `${runid}-oracle-result.json`)
fs.writeFileSync(file, JSON.stringify({ runid, target: 'grocy', oracle: true, finalText }, null, 2))
console.log(finalText)
console.log(`\noracle-grocy: wrote ${file}`)
