/**
 * External verification of a benchmark run against ERPNext's REST API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The ERPNext
 * bite: link fields (customer, item code) accept typed text that never
 * becomes a link unless a record is chosen from the dropdown, grid cells only
 * persist once the document is saved, and a saved Sales Order is still a
 * DRAFT until it is submitted and the submission confirmed — only the API can
 * tell.
 *
 *   obj 1  (report-only: the Seed: sales orders' customer names)             checked against finalText
 *   obj 2  a customer "<runid> Bench Customer" exists
 *   obj 3  a Sales Order for it exists with delivery date 2026-12-31
 *   obj 4  exactly two lines: Bench Widget qty 3 @ 40, Bench Gadget qty 2 @ 125
 *   obj 5  it is submitted (docstatus 1)
 *   obj 6  a timeline comment on it includes the runid
 *   obj 7  (report-only: its id, e.g. SAL-ORD-2026-00004)                    checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: a session cookie from POST /api/method/login as Administrator.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8100/').replace(/\/$/, '')
const USER = process.env.ERPNEXT_USER || 'Administrator'
const PASSWORD = process.env.ERPNEXT_PASSWORD || 'bench-admin-pass'
const OUT = process.env.BENCH_OUT || 'bench/results'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-erpnext.mjs <runid> [runid...]')
  process.exit(2)
}

const login = await fetch(`${APP_URL}/api/method/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ usr: USER, pwd: PASSWORD }),
})
if (!login.ok) {
  console.error(`verify-erpnext: login as ${USER} failed: HTTP ${login.status} — is the target up and seeded?`)
  process.exit(2)
}
const COOKIE = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')

async function api(route) {
  const res = await fetch(`${APP_URL}${route}`, { headers: { cookie: COOKIE, accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${decodeURIComponent(route)}: HTTP ${res.status}`)
  return (await res.json()).data
}
/** Every record of a doctype matching the filters, with the given fields. */
async function find(doctype, filters, fields = ['name']) {
  const q = new URLSearchParams({ filters: JSON.stringify(filters), fields: JSON.stringify(fields), limit_page_length: '0' })
  return api(`/api/resource/${encodeURIComponent(doctype)}?${q}`)
}
const getDoc = (doctype, name) => api(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)
/** The text of the user comments in a Sales Order's timeline (likes, info and other system rows excluded). */
async function commentsOf(name) {
  const rows = await find('Comment',
    [['reference_doctype', '=', 'Sales Order'], ['reference_name', '=', name], ['comment_type', '=', 'Comment']],
    ['content'])
  return rows.map((c) => String(c.content ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '))
}

if (!(await find('Company', [['name', '=', 'Bench Company']])).length ||
    !(await find('Item', [['name', 'in', ['Bench Widget', 'Bench Gadget']]])).length) {
  console.error('verify-erpnext: company "Bench Company" or the Bench items not found — was the target seeded?')
  process.exit(2)
}
// The seed orders, as the reset leaves them: submitted, one line, no comments.
// Read once; each is judged per runid below.
const seeds = await find('Sales Order', [['customer_name', 'like', 'Seed:%']], ['name', 'customer_name', 'docstatus'])
const seedNames = [...new Set(seeds.map((o) => o.customer_name))]
const EXPECTED_LINES = [['Bench Widget', 3, 40], ['Bench Gadget', 2, 125]]

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
  for (const f of fs.readdirSync(OUT).filter((f) => f.startsWith(`${runid}-`) && f.endsWith('-result.json'))) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))
      if (typeof r.finalText === 'string') finalText = r.finalText
    } catch {
      /* unreadable result file — treated as absent */
    }
  }
  // Flow replays have no harness result file; their reporting lives in the
  // flowrun's per-step summaries and read-back values (as verify-kanboard.mjs).
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
    const missing = seedNames.filter((s) => !finalText.includes(s))
    obj(1, seedNames.length > 0 && missing.length === 0,
      !seedNames.length ? 'no Seed: sales orders — was the target reset?'
        : missing.length ? `name(s) not in report: ${missing.join(', ')}` : `all ${seedNames.length} seed customer names reported`)
  }

  const customers = await find('Customer', [['customer_name', '=', `${runid} Bench Customer`]], ['name', 'customer_name'])
  const customer = customers[0] ?? null
  // Every non-cancelled order on any customer of that name. A cancelled order
  // is the app's own amend trail (cancel, then amend into -1), not a duplicate.
  const orders = customers.length
    ? await find('Sales Order', [['customer', 'in', customers.map((c) => c.name)], ['docstatus', '!=', 2]], ['name', 'docstatus'])
    : []
  orders.sort((a, b) => b.docstatus - a.docstatus)
  const so = orders[0] ? await getDoc('Sales Order', orders[0].name) : null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5).
  const duplicates = Math.max(0, customers.length - 1) + Math.max(0, orders.length - 1)
  if (customers.length > 1) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${customers.length} customers named "${runid} Bench Customer" ` +
      `(${customers.map((c) => c.name).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single customer.')
  }
  if (orders.length > 1) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${orders.length} live sales orders for "${runid} Bench Customer" ` +
      `(${orders.map((o) => `${o.name} docstatus ${o.docstatus}`).join(', ')}) — the run created it more than once, ` +
      'so objectives 3-7 cannot be attributed to any single order.')
  }

  obj(2, Boolean(customer), customer ? `customer=${customer.name}` : 'customer not found')

  obj(3, Boolean(so && so.delivery_date === '2026-12-31'),
    !so ? 'no sales order for the customer' : `id=${so.name}, delivery_date=${so.delivery_date ?? '(none)'}`)

  const lines = (so?.items ?? []).map((i) => [i.item_code, Number(i.qty), Number(i.rate)])
  const linesOk = lines.length === EXPECTED_LINES.length &&
    EXPECTED_LINES.every(([code, qty, rate]) => lines.some(([c, q, r]) => c === code && q === qty && r === rate))
  obj(4, Boolean(so && linesOk),
    !so ? 'no sales order' : `lines: ${lines.map(([c, q, r]) => `${c} x${q} @ ${r}`).join('; ') || '(none)'}`)

  obj(5, so?.docstatus === 1, !so ? 'no sales order' : `docstatus=${so.docstatus} status=${so.status}`)

  const comments = so ? await commentsOf(so.name) : []
  const runComments = comments.filter((c) => c.includes(runid))
  obj(6, runComments.length > 0, !so ? 'no sales order' : `${comments.length} comment(s), ${runComments.length} carrying the runid`)
  // An EXTRA MUTATION: one comment is asked for. A second is a retried step
  // whose first attempt did land — the same "ran twice" defect as a duplicate.
  const extraComments = Math.max(0, runComments.length - 1)
  if (extraComments > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runComments.length} timeline comments carry the runid ` +
      '— the run commented more than once, so a step ran twice with the first attempt landing.')
  }
  // The seed orders are read-only for the task, and the reset leaves them
  // submitted with no comments. Anything else was this run.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (s.docstatus !== 1) what.push(s.docstatus === 2 ? 'cancelled' : `docstatus ${s.docstatus}`)
    if ((await commentsOf(s.name)).some((c) => c.includes(runid))) what.push('runid comment')
    if (what.length) touchedSeeds.push(`${s.name} "${s.customer_name}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed sales order(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    obj(7, Boolean(so && finalText.includes(so.name)),
      so ? `sales order id ${so.name} ${finalText.includes(so.name) ? 'reported' : 'NOT in finalText'}` : 'no sales order to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({ runid, salesOrderId: so?.name ?? null, customer: customer?.name ?? null, duplicates, extraComments, touchedSeeds, objectives, passed })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-erpnext.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
