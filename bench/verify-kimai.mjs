/**
 * External verification of a benchmark run against the Kimai REST API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. HELD OUT
 * (notes/HELDOUT2-PROTOCOL.md): written from the Kimai docs, API and source only.
 *
 *   obj 1  (report-only: the Seed: projects' names)                           checked against finalText
 *   obj 2  a project "<runid> Bench Project" exists whose description carries the runid, not saved doubled
 *   obj 3  its customer is the seeded Bench Customer (not a look-alike, not a new customer)
 *   obj 4  its order number is PO-4471 and its order date 2026-11-15
 *   obj 5  a timesheet on it, 2026-09-16 09:00-11:30, whose description carries the runid
 *   obj 6  that timesheet's activity is the seeded global "Consulting" and its tags are exactly ["onsite"]
 *   obj 7  (report-only: the project id, from /en/admin/project/<id>/details) checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Times: the API gives a timesheet's begin/end in the API user's timezone with
 * its offset ("2026-09-16T09:00:00+0000"). The browser signs in as the same
 * user (seed.sh pins that user's timezone to UTC), so the wall-clock part is
 * what the run typed.
 *
 * Auth: the admin's fixed API token (installed by bench/thirdparty/kimai/seed.sh;
 * KIMAI_API_TOKEN overrides).
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8105/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const TOKEN = process.env.KIMAI_API_TOKEN || 'benchkimaiapitoken000000000000001'
const CUSTOMER = 'Bench Customer'
const SEED_CUSTOMERS = ['Bench Customer', 'Bench Customer Ltd', 'Bench Customers Group']
const SEED_CUSTOMER_OF_SEEDS = 'Bench Customer Ltd'
const SEED_ACTIVITIES = ['Consulting', 'Consulting Travel', 'Consultancy Review']
const ACTIVITY = 'Consulting'
const SEED_TAGS = ['onsite', 'onsite-remote', 'offsite']
const TAGS = ['onsite']
const ORDER_NUMBER = 'PO-4471'
const ORDER_DATE = '2026-11-15'
const BEGIN = '2026-09-16T09:00'
const END = '2026-09-16T11:30'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-kimai.mjs <runid> [runid...]')
  process.exit(2)
}

async function get(route) {
  const res = await fetch(`${APP_URL}/api${route}`, { headers: { accept: 'application/json', authorization: `Bearer ${TOKEN}` } })
  if (res.status === 401 || res.status === 403) {
    console.error(`verify-kimai: GET /api${route}: HTTP ${res.status} — was bench/thirdparty/kimai/seed.sh run (it installs the API token)?`)
    process.exit(2)
  }
  return res
}
async function api(route) {
  const res = await get(route)
  if (!res.ok) throw new Error(`GET /api${route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
/** Every timesheet of every user; the listing is paged (max 500) and 404s past the last page. */
async function allTimesheets() {
  const out = []
  for (let page = 1; ; page++) {
    const res = await get(`/timesheets?user=all&size=500&page=${page}&orderBy=id&order=ASC`)
    if (res.status === 404 && page > 1) return out
    if (!res.ok) throw new Error(`GET /api/timesheets page ${page}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < 500) return out
  }
}
async function allTags() {
  const res = await get('/tags/find?name=%25')
  if (res.ok) {
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length) return rows.map((t) => ({ id: t.id, name: t.name }))
  }
  // the names-only listing, if /tags/find refuses the match-all filter ("%" inside its LIKE)
  return (await api('/tags')).map((name) => ({ id: null, name }))
}

// Ground truth, read once.
const customers = (await api('/customers?visible=3')).sort((a, b) => a.id - b.id)
const projects = (await api('/projects?visible=3&ignoreDates=1')).sort((a, b) => a.id - b.id)
const activities = (await api('/activities?visible=3')).sort((a, b) => a.id - b.id)
const timesheets = await allTimesheets()
const tagsInApp = await allTags()
const seeds = projects.filter((p) => /^Seed:/.test(p.name ?? ''))
if (!seeds.length) {
  console.error('verify-kimai: no Seed: projects found — was the target reset?')
  process.exit(2)
}
const custId = (p) => (p && typeof p.customer === 'object' && p.customer !== null ? p.customer.id : p?.customer)
const projId = (t) => (t && typeof t.project === 'object' && t.project !== null ? t.project.id : t?.project)
const actId = (t) => (t && typeof t.activity === 'object' && t.activity !== null ? t.activity.id : t?.activity)
const seedCustomer = customers.find((c) => c.name === CUSTOMER) ?? null
const seedsCustomer = customers.find((c) => c.name === SEED_CUSTOMER_OF_SEEDS) ?? null
const activityId = (name) => activities.find((a) => a.name === name && (a.project === null || a.project === undefined))?.id
const consulting = activityId(ACTIVITY) ?? null

// An empty runid (a sweep that lost its id) matches nothing, rather than everything.
const count = (text, needle) => (needle ? String(text ?? '').split(needle).length - 1 : 0)
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
const tagList = (v) => (Array.isArray(v) ? v.map((t) => (typeof t === 'object' && t ? t.name : String(t))) : typeof v === 'string' && v ? v.split(',').map((s) => s.trim()) : [])
const wall = (dt) => String(dt ?? '').slice(0, 16)
const timesOk = (t) => wall(t.begin) === BEGIN && wall(t.end) === END

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

  const named = projects.filter((p) => p.name === `${runid} Bench Project`)
  const project = named[0] ?? null

  // An extra created record FAILS, it does not warn: two projects with this
  // name means the run did its work twice, and every objective below would be
  // judged against one picked by accident.
  const duplicates = Math.max(0, named.length - 1)
  if (duplicates > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} projects named "${runid} Bench Project" ` +
      `(${named.map((p) => p.id).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single project.')
  }

  const desc = String(project?.comment ?? '')
  const descDoubled = doubled(desc)
  obj(2, Boolean(project) && count(desc, runid) >= 1 && !descDoubled,
    !project ? 'project not found'
      : `#${project.id}, description includes runid=${count(desc, runid) > 0}` +
        (descDoubled ? ` — the description was saved doubled: ${JSON.stringify(desc.slice(0, 300))}` : ''))

  const linked = project ? customers.find((c) => c.id === custId(project)) : null
  obj(3, Boolean(project && seedCustomer) && custId(project) === seedCustomer.id,
    !project ? 'no project'
      : `customer=${linked?.name ?? '(unknown)'} (#${custId(project) ?? 'none'}), want the seeded ${CUSTOMER} (#${seedCustomer?.id ?? 'missing!'})`)

  const orderNumber = project?.orderNumber ?? null
  const orderDate = project?.orderDate ?? null
  obj(4, String(orderNumber ?? '').trim() === ORDER_NUMBER && Boolean(orderDate) && String(orderDate).startsWith(ORDER_DATE),
    !project ? 'no project' : `orderNumber=${orderNumber ?? '(none)'}, orderDate=${orderDate ?? '(none)'}; want ${ORDER_NUMBER} and ${ORDER_DATE}`)

  // The run's timesheets: on its own project, description carrying the runid.
  const ownIds = new Set(named.map((p) => p.id))
  const runSheets = timesheets.filter((t) => project && projId(t) === project.id && count(t.description, runid) > 0)
  const sheet = runSheets.find(timesOk) ?? runSheets[0] ?? null
  const onProject = project ? timesheets.filter((t) => projId(t) === project.id) : []
  obj(5, Boolean(sheet) && timesOk(sheet),
    !project ? 'no project'
      : !sheet ? `no timesheet on the project carries the runid (${onProject.length} timesheet(s) on it)`
        : `timesheet #${sheet.id} begin=${sheet.begin} end=${sheet.end ?? '(running)'}; want ${BEGIN} to ${END}`)

  const sheetTags = tagList(sheet?.tags)
  const sheetActivity = sheet ? activities.find((a) => a.id === actId(sheet)) : null
  obj(6, Boolean(sheet) && consulting !== null && actId(sheet) === consulting &&
      sheetTags.length === TAGS.length && TAGS.every((t, i) => sheetTags[i] === t),
    !sheet ? 'no timesheet'
      : `activity=${sheetActivity?.name ?? '(unknown)'} (#${actId(sheet) ?? 'none'}), tags=${JSON.stringify(sheetTags)}; ` +
        `want the seeded ${ACTIVITY} (#${consulting ?? 'missing!'}) and ${JSON.stringify(TAGS)}`)

  // One timesheet is asked for. A second carrying the runid is a retried step
  // whose first attempt did land — the same "ran twice" defect as a duplicate.
  const extraSheets = Math.max(0, runSheets.length - 1)
  if (extraSheets > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runSheets.length} timesheets on the project carry the runid ` +
      `(${runSheets.map((t) => `#${t.id}`).join(', ')}) — the run recorded time more than once.`)
  }
  // Any other project carrying the runid (a copy, a draft under another name).
  const strays = projects.filter((p) => runid && !named.includes(p) &&
    (String(p.name ?? '').includes(runid) || String(p.comment ?? '').includes(runid)))
  if (strays.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** other project(s) carrying the runid: ${strays.map((p) => `"${p.name}" (#${p.id})`).join('; ')}`)
  }
  // Timesheets carrying the runid anywhere but the run's own project.
  const straySheets = timesheets.filter((t) => runid && !ownIds.has(projId(t)) && count(t.description, runid) > 0)
  if (straySheets.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${straySheets.length} timesheet(s) carrying the runid on other project(s): ` +
      `${straySheets.map((t) => `#${t.id} (project #${projId(t)})`).join(', ')}`)
  }
  // The reset leaves exactly the seeded customers, activities and tags; any
  // other one was created by this run (the project form's customer picker
  // cannot create, but the customer/activity admin pages and the tag input can).
  const keptCustomers = new Set(SEED_CUSTOMERS.map((n) => customers.find((c) => c.name === n)?.id).filter((x) => x !== undefined))
  const newCustomers = customers.filter((c) => !keptCustomers.has(c.id))
  if (newCustomers.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** customer(s) created: ${newCustomers.map((c) => `"${c.name}" (#${c.id})`).join(', ')} ` +
      '— the task only picks an existing customer.')
  }
  const keptActivities = new Set(SEED_ACTIVITIES.map(activityId).filter((x) => x !== undefined))
  const newActivities = activities.filter((a) => !keptActivities.has(a.id))
  if (newActivities.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** activit(y/ies) created: ${newActivities.map((a) => `"${a.name}" (#${a.id})`).join(', ')} ` +
      '— the task only picks an existing activity.')
  }
  const newTags = tagsInApp.filter((t) => !SEED_TAGS.includes(t.name))
  if (newTags.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** tag(s) created: ${newTags.map((t) => `"${t.name}"`).join(', ')} ` +
      '— the task only picks the existing tag.')
  }
  // The seed projects are read-only for the task, and the reset leaves them
  // on Bench Customer Ltd, visible, with no order number, no order date and no
  // timesheets.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (!seedsCustomer || custId(s) !== seedsCustomer.id) what.push(`customer #${custId(s) ?? '(none)'}`)
    if (s.visible === false) what.push('hidden')
    if (s.orderNumber) what.push(`order number ${s.orderNumber}`)
    if (s.orderDate) what.push(`order date ${s.orderDate}`)
    if (runid && String(s.comment ?? '').includes(runid)) what.push('runid in description')
    const on = timesheets.filter((t) => projId(t) === s.id).length
    if (on) what.push(`${on} timesheet(s)`)
    if (what.length) touchedSeeds.push(`"${s.name}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed project(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    // Ids are integers (seed.sh starts them at 40001): match the whole number,
    // never a digit run inside a longer one.
    const reported = Boolean(project) && new RegExp(`(?<![0-9])${project.id}(?![0-9])`).test(finalText)
    obj(7, reported, project ? `project id ${project.id} ${reported ? 'reported' : 'NOT in finalText'}` : 'no project to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({
    runid, projectId: project?.id ?? null, timesheetId: sheet?.id ?? null, customer: linked?.name ?? null, duplicates, extraSheets,
    strays: strays.map((p) => p.name), straySheets: straySheets.map((t) => t.id), newCustomers: newCustomers.map((c) => c.name),
    newActivities: newActivities.map((a) => a.name), newTags: newTags.map((t) => t.name), touchedSeeds, objectives, passed,
  })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-kimai.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
