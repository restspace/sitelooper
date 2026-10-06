/**
 * API oracle for the held-out kimai target (notes/HELDOUT2-PROTOCOL.md):
 * performs every objective of bench/tasks/kimai-timesheet-flow.md through the
 * REST API exactly as a perfect run would, and writes the report a perfect run
 * would give to <BENCH_OUT>/<runid>-oracle-result.json ({ finalText }), so the
 * verifier can be proven before any tool runs:
 *
 *   node bench/reset-app.mjs --target kimai
 *   node bench/oracle-kimai.mjs kmoracle1 && node bench/verify-kimai.mjs kmoracle1   # all PASS
 *   node bench/reset-app.mjs --target kimai
 *   node bench/verify-kimai.mjs kmuntouched1                                        # all FAIL
 *
 * Never shown to the tools under test.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8105/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const TOKEN = process.env.KIMAI_API_TOKEN || 'benchkimaiapitoken000000000000001'

const runid = process.argv[2]
if (!runid) {
  console.error('usage: node bench/oracle-kimai.mjs <runid>')
  process.exit(2)
}

async function api(method, route, body) {
  const res = await fetch(`${APP_URL}/api${route}`, {
    method,
    headers: {
      accept: 'application/json', authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`kimai ${method} /api${route}: HTTP ${res.status} ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

// Objective 1: read the Seed: projects' names.
const projects = await api('GET', '/projects?visible=3&ignoreDates=1')
const seeds = projects.filter((p) => /^Seed:/.test(p.name)).sort((a, b) => a.name.localeCompare(b.name))
if (!seeds.length) throw new Error('no Seed: projects — reset the target first')

const name = `${runid} Bench Project`
const existing = projects.filter((p) => p.name === name)
if (existing.length) throw new Error(`"${name}" already exists (#${existing.map((p) => p.id).join(', #')}) — reset the target first`)

// Objective 3's customer and objective 6's activity: the seeded records, not look-alikes.
const customer = (await api('GET', '/customers?visible=3')).filter((c) => c.name === 'Bench Customer').sort((a, b) => a.id - b.id)[0]
if (!customer) throw new Error('no customer "Bench Customer" — reset the target first')
const activity = (await api('GET', '/activities?visible=3'))
  .filter((a) => a.name === 'Consulting' && (a.project === null || a.project === undefined)).sort((a, b) => a.id - b.id)[0]
if (!activity) throw new Error('no global activity "Consulting" — reset the target first')

// Objectives 2-4 in one save, as the project form does.
const project = await api('POST', '/projects', {
  name,
  customer: customer.id,
  comment: `Bench project opened by run ${runid}.`,
  orderNumber: 'PO-4471',
  orderDate: '2026-11-15',
  visible: true,
  billable: true,
  globalActivities: true,
})

// Objectives 5-6: the timesheet, in the API user's own timezone (HTML5 local format).
const sheet = await api('POST', '/timesheets', {
  project: project.id,
  activity: activity.id,
  begin: '2026-09-16T09:00:00',
  end: '2026-09-16T11:30:00',
  description: `Workshop logged by run ${runid}.`,
  tags: 'onsite',
  billable: true,
})

// Read back what the app would show, for the report.
const saved = await api('GET', `/projects/${project.id}`)
const savedSheet = await api('GET', `/timesheets/${sheet.id}`)
const hm = (dt) => String(dt ?? '').slice(11, 16)
const finalText = [
  `1. DONE — Seed project names: ${seeds.map((s) => s.name).join('; ')}`,
  `2. DONE — project "${saved.name}" created, description: ${saved.comment}`,
  `3. DONE — customer: ${customer.name}`,
  `4. DONE — order number: ${saved.orderNumber}, order date: ${saved.orderDate}`,
  `5. DONE — timesheet on ${String(savedSheet.begin).slice(0, 10)} from ${hm(savedSheet.begin)} to ${hm(savedSheet.end)}, description: ${savedSheet.description}`,
  `6. DONE — activity: ${activity.name}, tags: ${(savedSheet.tags ?? []).join(', ')}`,
  `7. DONE — ID: ${saved.id} (/en/admin/project/${saved.id}/details)`,
].join('\n')

fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `${runid}-oracle-result.json`)
fs.writeFileSync(file, JSON.stringify({ runid, target: 'kimai', oracle: true, finalText }, null, 2))
console.log(finalText)
console.log(`\noracle-kimai: wrote ${file}`)
