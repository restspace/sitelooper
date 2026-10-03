/**
 * External verification of a benchmark run against the Directus REST API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. HELD OUT
 * (notes/HELDOUT-PROTOCOL.md): written from the Directus docs and API only.
 *
 *   obj 1  (report-only: the Seed: tickets' titles)                       checked against finalText
 *   obj 2  a ticket "<runid> Bench Ticket" exists whose description carries the runid, not saved doubled
 *   obj 3  its customer is the seeded Bench Customer (not a look-alike, not a new customer)
 *   obj 4  its status is in_progress and its tags are exactly ["hardware"]
 *   obj 5  its due date is 2026-12-31 and its estimated hours are 6
 *   obj 6  a comment on it includes the runid
 *   obj 7  (report-only: its id, the uuid in /admin/content/tickets/<id>) checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: the admin's static token (ADMIN_TOKEN in bench/thirdparty/directus/
 * docker-compose.yml; DIRECTUS_TOKEN overrides).
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8101/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const TOKEN = process.env.DIRECTUS_TOKEN || 'bench-admin-token'
const CUSTOMER = 'Bench Customer'
const SEED_CUSTOMERS = ['Bench Customer', 'Bench Customer Ltd', 'Bench Customers Group']
const SEED_CUSTOMER_OF_SEEDS = 'Bench Customer Ltd'
const STATUS = 'in_progress'
const TAGS = ['hardware']
const DUE_DATE = '2026-12-31'
const HOURS = 6

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-directus.mjs <runid> [runid...]')
  process.exit(2)
}

async function api(route) {
  const res = await fetch(`${APP_URL}${route}`, { headers: { accept: 'application/json', authorization: `Bearer ${TOKEN}` } })
  if (res.status === 401 || res.status === 403) {
    console.error(`verify-directus: GET ${route}: HTTP ${res.status} — was the target reset (which builds the data model and restores the token)?`)
    process.exit(2)
  }
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).data
}

// Ground truth, read once: every ticket, every customer, every ticket comment.
const tickets = (await api('/items/tickets?limit=-1&fields=*'))
  .sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)))
const customers = (await api('/items/customers?limit=-1&fields=id,name')).sort((a, b) => a.id - b.id)
const comments = await api(`/comments?limit=-1&fields=id,item,comment,date_created&filter=${encodeURIComponent(JSON.stringify({ collection: { _eq: 'tickets' } }))}`)
const seeds = tickets.filter((t) => /^Seed:/.test(t.title ?? ''))
if (!seeds.length) {
  console.error('verify-directus: no Seed: tickets found — was the target reset?')
  process.exit(2)
}
const seedCustomer = customers.find((c) => c.name === CUSTOMER) ?? null
const seedsCustomer = customers.find((c) => c.name === SEED_CUSTOMER_OF_SEEDS) ?? null
const commentsOn = (id) => comments.filter((c) => String(c.item) === String(id)).map((c) => String(c.comment ?? ''))

// An empty runid (a sweep that lost its id) matches nothing, rather than everything.
const count = (text, needle) => (needle ? String(text ?? '').split(needle).length - 1 : 0)
// The WYSIWYG field stores HTML; judge its text, one line per block.
const plain = (html) => String(html ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
// Saved doubled = the same text twice over: a repeated paragraph, or one paragraph
// that is some text followed by itself. Counting the runid instead is wrong: a
// text may name it twice by design.
const paras = (t) => String(t ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
const selfRepeat = (p) => {
  for (let i = 1; i < p.length; i++) {
    const a = p.slice(0, i).trim(), b = p.slice(i).trim()
    if (a.length >= 4 && a === b) return true
  }
  return false
}
const doubled = (t) => { const ps = paras(t); return new Set(ps).size < ps.length || ps.some(selfRepeat) }
const tagList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? (() => { try { return JSON.parse(v) } catch { return v.split(',') } })() : [])

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
    const missing = seeds.filter((s) => !finalText.includes(s.title))
    obj(1, missing.length === 0,
      missing.length ? `not in report: ${missing.map((s) => s.title).join(', ')}` : `all ${seeds.length} seed titles reported`)
  }

  const named = tickets.filter((t) => t.title === `${runid} Bench Ticket`)
  const ticket = named[0] ?? null

  // An extra created record FAILS, it does not warn: two tickets with this
  // title means the run did its work twice, and every objective below would be
  // judged against one picked by accident.
  const duplicates = Math.max(0, named.length - 1)
  if (duplicates > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} tickets titled "${runid} Bench Ticket" ` +
      `(${named.map((t) => t.id).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single ticket.')
  }

  const body = plain(ticket?.description)
  const bodyDoubled = doubled(body)
  obj(2, Boolean(ticket) && count(body, runid) >= 1 && !bodyDoubled,
    !ticket ? 'ticket not found'
      : `${ticket.id}, description includes runid=${count(body, runid) > 0}` +
        (bodyDoubled ? ` — the description was saved doubled: ${JSON.stringify(body.slice(0, 300))}` : ''))

  const linked = ticket ? customers.find((c) => c.id === ticket.customer) : null
  obj(3, Boolean(ticket && seedCustomer) && ticket.customer === seedCustomer.id,
    !ticket ? 'no ticket'
      : `customer=${ticket.customer === null || ticket.customer === undefined ? '(none)' : `${linked?.name ?? '(deleted)'} (#${ticket.customer})`}, ` +
        `want the seeded ${CUSTOMER} (#${seedCustomer?.id ?? 'missing!'})`)

  const tags = tagList(ticket?.tags)
  obj(4, ticket?.status === STATUS && tags.length === TAGS.length && TAGS.every((t, i) => tags[i] === t),
    !ticket ? 'no ticket' : `status=${ticket.status ?? '(none)'}, tags=${JSON.stringify(tags)}; want ${STATUS} and ${JSON.stringify(TAGS)}`)

  const due = ticket?.due_date ?? null
  const hours = ticket?.estimated_hours ?? null
  obj(5, Boolean(due) && String(due).startsWith(DUE_DATE) && hours !== null && Number(hours) === HOURS,
    !ticket ? 'no ticket' : `due_date=${due ?? '(none)'}, estimated_hours=${hours ?? '(none)'}; want ${DUE_DATE} and ${HOURS}`)

  const own = ticket ? commentsOn(ticket.id) : []
  const runComments = own.filter((c) => count(c, runid) > 0)
  obj(6, runComments.length > 0, !ticket ? 'no ticket' : `${own.length} comment(s), ${runComments.length} carrying the runid`)
  // One comment is asked for. A second is a retried step whose first attempt
  // did land — the same "ran twice" defect as a duplicate.
  const extraComments = Math.max(0, runComments.length - 1)
  if (extraComments > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runComments.length} comments on the ticket carry the runid ` +
      '— the run commented more than once, so a step ran twice with the first attempt landing.')
  }

  // Any other ticket carrying the runid (a copy, a draft under another title)
  // is work the task did not ask for.
  const strays = tickets.filter((t) => runid && !named.includes(t) &&
    (String(t.title ?? '').includes(runid) || String(t.description ?? '').includes(runid)))
  if (strays.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** other ticket(s) carrying the runid: ${strays.map((t) => `"${t.title}" (${t.id})`).join('; ')}`)
  }
  // Comments carrying the runid anywhere but the run's own ticket.
  const ownIds = new Set(named.map((t) => String(t.id)))
  const strayComments = comments.filter((c) => runid && !ownIds.has(String(c.item)) && count(c.comment, runid) > 0)
  if (strayComments.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${strayComments.length} comment(s) carrying the runid on other item(s): ` +
      `${strayComments.map((c) => c.item).join(', ')}`)
  }
  // The reset leaves exactly the three seed customers; any other one was
  // created by this run — typically from the relational picker's create option.
  const keptIds = new Set(SEED_CUSTOMERS.map((n) => customers.find((c) => c.name === n)?.id).filter((x) => x !== undefined))
  const newCustomers = customers.filter((c) => !keptIds.has(c.id))
  if (newCustomers.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** customer(s) created: ${newCustomers.map((c) => `"${c.name}" (#${c.id})`).join(', ')} ` +
      '— the task only picks an existing customer.')
  }
  // The seed tickets are read-only for the task, and the reset leaves them
  // open, on Bench Customer Ltd, with nothing else set and no comments.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (s.status !== 'open') what.push(`status ${s.status}`)
    if (!seedsCustomer || s.customer !== seedsCustomer.id) what.push(`customer #${s.customer ?? '(none)'}`)
    if (s.due_date) what.push(`due date ${s.due_date}`)
    if (s.estimated_hours !== null && s.estimated_hours !== undefined) what.push(`estimated hours ${s.estimated_hours}`)
    if (tagList(s.tags).length) what.push(`tags ${JSON.stringify(tagList(s.tags))}`)
    if (runid && String(s.description ?? '').includes(runid)) what.push('runid in description')
    if (commentsOn(s.id).length) what.push(`${commentsOn(s.id).length} comment(s)`)
    if (what.length) touchedSeeds.push(`"${s.title}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed ticket(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const reported = Boolean(ticket) && finalText.toLowerCase().includes(String(ticket.id).toLowerCase())
    obj(7, reported, ticket ? `ticket id ${ticket.id} ${reported ? 'reported' : 'NOT in finalText'}` : 'no ticket to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({
    runid, ticketId: ticket?.id ?? null, customer: linked?.name ?? null, duplicates, extraComments,
    strays: strays.map((t) => t.title), newCustomers: newCustomers.map((c) => c.name), touchedSeeds, objectives, passed,
  })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-directus.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
