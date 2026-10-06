/**
 * External verification of a benchmark run against the Grocy REST API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. HELD OUT
 * (notes/HELDOUT2-PROTOCOL.md): written from Grocy's docs, OpenAPI spec and
 * source (v4.7.1) only.
 *
 *   obj 1  (report-only: the Seed: products' names)                          checked against finalText
 *   obj 2  a product "<runid> Bench Product" exists whose description carries the runid, not saved doubled
 *   obj 3  its default location is the seeded Pantry and its product group the seeded Snacks (not a look-alike)
 *   obj 4  its stock and purchase quantity units are the seeded Pack, and its minimum stock amount is 4
 *   obj 5  its default due days are 30 and it has the barcode "<runid>-0001"
 *   obj 6  it is in stock 3 (stock unit), every entry at Pantry and due 2026-12-31, from a purchase
 *   obj 7  (report-only: its id, the number in /product/<id>)                checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: the fixed API key bench/thirdparty/grocy/seed.sh installs
 * (GROCY_API_KEY overrides), header GROCY-API-KEY.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8106/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const KEY = process.env.GROCY_API_KEY || 'bench-grocy-api-key-0000000000000000000000000001'
const LOCATION = 'Pantry'
const GROUP = 'Snacks'
const UNIT = 'Pack'
const MIN_STOCK = 4
const DUE_DAYS = 30
const STOCK_AMOUNT = 3
const BEST_BEFORE = '2026-12-31'
const SEED_MASTERS = {
  locations: ['Fridge', 'Pantry', 'Pantry Shelf', 'Garage Pantry'],
  quantity_units: ['Piece', 'Pack', 'Package', 'Six-pack'],
  product_groups: ['Beverages', 'Snacks', 'Snacks & Sweets', 'Healthy Snacks'],
}

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-grocy.mjs <runid> [runid...]')
  process.exit(2)
}

async function api(route) {
  const res = await fetch(`${APP_URL}/api${route}`, { headers: { accept: 'application/json', 'GROCY-API-KEY': KEY } })
  if (res.status === 401 || res.status === 403) {
    console.error(`verify-grocy: GET ${route}: HTTP ${res.status} — was seed.sh run (it installs the API key)?`)
    process.exit(2)
  }
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// Ground truth, read once.
const byId = (a, b) => Number(a.id) - Number(b.id)
const products = (await api('/objects/products')).sort(byId)
const masters = {}
for (const entity of Object.keys(SEED_MASTERS)) masters[entity] = (await api(`/objects/${entity}`)).sort(byId)
const stock = await api('/objects/stock')
const stockLog = (await api('/objects/stock_log')).sort(byId)
const barcodes = (await api('/objects/product_barcodes')).sort(byId)
const shoppingList = await api('/objects/shopping_list')

const seeds = products.filter((p) => /^Seed:/.test(p.name ?? ''))
if (!seeds.length) {
  console.error('verify-grocy: no Seed: products found — was the target reset?')
  process.exit(2)
}
const masterId = (entity, name) => masters[entity].find((r) => r.name === name)?.id ?? null
const masterName = (entity, id) => (id === null || id === undefined || id === '' ? '(none)'
  : `${masters[entity].find((r) => String(r.id) === String(id))?.name ?? '(deleted)'} (#${id})`)
const sameId = (a, b) => a !== null && a !== undefined && a !== '' && b !== null && String(a) === String(b)
const pantryId = masterId('locations', LOCATION)
const fridgeId = masterId('locations', 'Fridge')
const snacksId = masterId('product_groups', GROUP)
const beveragesId = masterId('product_groups', 'Beverages')
const packId = masterId('quantity_units', UNIT)
const pieceId = masterId('quantity_units', 'Piece')

// An empty runid (a sweep that lost its id) matches nothing, rather than everything.
const count = (text, needle) => (needle ? String(text ?? '').split(needle).length - 1 : 0)
// The WYSIWYG description stores HTML; judge its text, one line per block.
const plain = (html) => String(html ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
// Saved doubled = the same text twice over: a repeated paragraph, or one paragraph
// that is some text followed by itself.
const paras = (t) => String(t ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
const selfRepeat = (p) => {
  for (let i = 1; i < p.length; i++) {
    const a = p.slice(0, i).trim(), b = p.slice(i).trim()
    if (a.length >= 4 && a === b) return true
  }
  return false
}
const doubled = (t) => { const ps = paras(t); return new Set(ps).size < ps.length || ps.some(selfRepeat) }
const of = (rows, product) => rows.filter((r) => product && String(r.product_id) === String(product.id))
const live = (rows) => rows.filter((r) => Number(r.undone ?? 0) === 0)

const report = []
let anyFailure = false

for (const runid of runids) {
  const objectives = []
  const obj = (n, pass, detail) => {
    objectives.push({ n, pass, detail })
    if (pass === false) anyFailure = true
  }

  // finalText from the run's result file, for the report-only objectives.
  let finalText = null
  for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.startsWith(`${runid}-`) && f.endsWith('-result.json')) : []) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))
      if (typeof r.finalText === 'string') finalText = r.finalText
    } catch {
      /* unreadable result file — treated as absent */
    }
  }
  // Flow replays have no harness result file; their reporting lives in the
  // flowrun's per-step summaries and read-back values.
  if (finalText === null) {
    try {
      const fr = JSON.parse(fs.readFileSync(path.join(OUT, `${runid}-flowrun.json`), 'utf8'))
      finalText = fr.steps
        .map((s) => `${s.summary ?? ''}\n${Object.values(s.values ?? {}).join('\n')}`)
        .join('\n')
    } catch {
      /* no flowrun either — stays UNVERIFIABLE */
    }
  }

  if (finalText === null) {
    objectives.push({ n: 1, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const missing = seeds.filter((s) => !finalText.includes(s.name))
    obj(1, missing.length === 0,
      missing.length ? `not in report: ${missing.map((s) => s.name).join(', ')}` : `all ${seeds.length} seed names reported`)
  }

  // Grocy product names are UNIQUE, so there is at most one; a second product
  // carrying the runid under another name is caught as a stray below.
  const name = `${runid} Bench Product`
  const product = runid ? products.find((p) => p.name === name) ?? null : null

  const body = plain(product?.description)
  const bodyDoubled = doubled(body)
  obj(2, Boolean(product) && count(body, runid) >= 1 && !bodyDoubled,
    !product ? 'product not found'
      : `#${product.id}, description includes runid=${count(body, runid) > 0}` +
        (bodyDoubled ? ` — the description was saved doubled: ${JSON.stringify(body.slice(0, 300))}` : ''))

  obj(3, Boolean(product) && sameId(product.location_id, pantryId) && sameId(product.product_group_id, snacksId),
    !product ? 'no product'
      : `location=${masterName('locations', product.location_id)}, product group=${masterName('product_groups', product.product_group_id)}; ` +
        `want the seeded ${LOCATION} (#${pantryId ?? 'missing!'}) and ${GROUP} (#${snacksId ?? 'missing!'})`)

  obj(4, Boolean(product) && sameId(product.qu_id_stock, packId) && sameId(product.qu_id_purchase, packId) &&
      Number(product.min_stock_amount) === MIN_STOCK,
    !product ? 'no product'
      : `stock unit=${masterName('quantity_units', product.qu_id_stock)}, purchase unit=${masterName('quantity_units', product.qu_id_purchase)}, ` +
        `min stock=${product.min_stock_amount}; want ${UNIT} (#${packId ?? 'missing!'}) twice and ${MIN_STOCK}`)

  const wantBarcode = `${runid}-0001`
  const ownBarcodes = of(barcodes, product)
  const hasBarcode = ownBarcodes.some((b) => String(b.barcode ?? '').trim() === wantBarcode)
  obj(5, Boolean(product) && Number(product.default_best_before_days) === DUE_DAYS && hasBarcode,
    !product ? 'no product'
      : `default due days=${product.default_best_before_days}, barcodes=${JSON.stringify(ownBarcodes.map((b) => b.barcode))}; ` +
        `want ${DUE_DAYS} and "${wantBarcode}"`)

  const entries = of(stock, product)
  const total = entries.reduce((s, e) => s + Number(e.amount), 0)
  const purchases = live(of(stockLog, product)).filter((r) => r.transaction_type === 'purchase')
  const entriesOk = entries.length > 0 && entries.every((e) => sameId(e.location_id, pantryId) && String(e.best_before_date ?? '').startsWith(BEST_BEFORE))
  obj(6, Boolean(product) && Math.abs(total - STOCK_AMOUNT) < 1e-9 && entriesOk && purchases.length >= 1,
    !product ? 'no product'
      : `in stock ${total} in ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} ` +
        `(${entries.map((e) => `${Number(e.amount)} at ${masterName('locations', e.location_id)} due ${e.best_before_date}`).join('; ') || 'none'}), ` +
        `${purchases.length} purchase booking(s); want ${STOCK_AMOUNT} at ${LOCATION} due ${BEST_BEFORE} from a purchase`)
  // One purchase is asked for. A second live purchase booking is a retried
  // step whose first attempt did land — the "ran twice" defect.
  if (purchases.length > 1) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${purchases.length} purchase bookings on the product ` +
      `(${purchases.map((r) => Number(r.amount)).join(' + ')}) — the run purchased more than once, so a step ran twice with the first attempt landing.`)
  }
  const runBarcodes = ownBarcodes.filter((b) => count(b.barcode, runid) > 0)
  if (runBarcodes.length > 1) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runBarcodes.length} barcodes on the product carry the runid ` +
      `(${runBarcodes.map((b) => b.barcode).join(', ')}) — the run added a barcode more than once.`)
  }

  // Any other product carrying the runid (a copy, one the purchase picker
  // created under the typed text) is work the task did not ask for.
  const strays = products.filter((p) => runid && p !== product &&
    (String(p.name ?? '').includes(runid) || String(p.description ?? '').includes(runid)))
  if (strays.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** other product(s) carrying the runid: ${strays.map((p) => `"${p.name}" (#${p.id})`).join('; ')}`)
  }
  // Barcodes carrying the runid on any other product.
  const strayBarcodes = barcodes.filter((b) => runid && !(product && String(b.product_id) === String(product.id)) && count(b.barcode, runid) > 0)
  if (strayBarcodes.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** barcode(s) carrying the runid on other product(s): ` +
      `${strayBarcodes.map((b) => `"${b.barcode}" on #${b.product_id}`).join(', ')}`)
  }
  // The reset leaves exactly the seeded locations, units and groups; any other
  // one was created by this run.
  const newMasters = []
  for (const [entity, names] of Object.entries(SEED_MASTERS)) {
    for (const r of masters[entity]) if (!names.includes(r.name)) newMasters.push(`${entity} "${r.name}" (#${r.id})`)
  }
  if (newMasters.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** master data created or renamed: ${newMasters.join(', ')} ` +
      '— the task only picks existing locations, units and groups.')
  }
  // Shopping list rows carrying the runid or naming the run's product: the task
  // asks for a purchase, not a shopping list entry.
  const listed = shoppingList.filter((r) => (product && String(r.product_id) === String(product.id)) || (runid && count(r.note, runid) > 0))
  if (listed.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${listed.length} shopping list item(s) for the run's product — the task did not ask for one.`)
  }
  // The seed products are read-only for the task, and the reset leaves them in
  // Fridge / Beverages / Piece, minimum stock 0, due days 0, no barcode, no stock history.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (!sameId(s.location_id, fridgeId)) what.push(`location ${masterName('locations', s.location_id)}`)
    if (!sameId(s.product_group_id, beveragesId)) what.push(`group ${masterName('product_groups', s.product_group_id)}`)
    if (!sameId(s.qu_id_stock, pieceId) || !sameId(s.qu_id_purchase, pieceId)) what.push('quantity units')
    if (Number(s.min_stock_amount) !== 0) what.push(`min stock ${s.min_stock_amount}`)
    if (Number(s.default_best_before_days) !== 0) what.push(`due days ${s.default_best_before_days}`)
    if (Number(s.active) !== 1) what.push('deactivated')
    if (runid && String(s.description ?? '').includes(runid)) what.push('runid in description')
    if (of(barcodes, s).length) what.push(`${of(barcodes, s).length} barcode(s)`)
    if (of(stockLog, s).length) what.push(`${of(stockLog, s).length} stock booking(s)`)
    if (what.length) touchedSeeds.push(`"${s.name}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed product(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    // The id is a plain number: it must stand alone, not inside a longer number.
    const reported = Boolean(product) && new RegExp(`(^|[^0-9])${product.id}([^0-9]|$)`).test(finalText)
    obj(7, reported, product ? `product id ${product.id} ${reported ? 'reported' : 'NOT in finalText'}` : 'no product to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({
    runid, productId: product?.id ?? null, location: product ? masterName('locations', product.location_id) : null,
    purchases: purchases.length, strays: strays.map((p) => p.name), newMasters, touchedSeeds, objectives, passed,
  })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-grocy.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
