/**
 * API oracle for the held-out directus target (notes/HELDOUT-PROTOCOL.md):
 * performs every objective of bench/tasks/directus-ticket-flow.md through the
 * REST API exactly as a perfect run would, and writes the report a perfect run
 * would give to <BENCH_OUT>/<runid>-oracle-result.json ({ finalText }), so the
 * verifier can be proven before any tool runs:
 *
 *   node bench/reset-app.mjs --target directus
 *   node bench/oracle-directus.mjs dxoracle1 && node bench/verify-directus.mjs dxoracle1   # all PASS
 *   node bench/reset-app.mjs --target directus
 *   node bench/verify-directus.mjs dxuntouched1                                            # all FAIL
 *
 * Never shown to the tools under test.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8101/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const TOKEN = process.env.DIRECTUS_TOKEN || 'bench-admin-token'

const runid = process.argv[2]
if (!runid) {
  console.error('usage: node bench/oracle-directus.mjs <runid>')
  process.exit(2)
}

async function api(method, route, body) {
  const res = await fetch(`${APP_URL}${route}`, {
    method,
    headers: {
      accept: 'application/json', authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`directus ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text).data : null
}
const filter = (f) => `filter=${encodeURIComponent(JSON.stringify(f))}`

// Objective 1: read the Seed: tickets' titles.
const seeds = await api('GET', `/items/tickets?limit=-1&fields=title&sort=title&${filter({ title: { _starts_with: 'Seed:' } })}`)
if (!seeds.length) throw new Error('no Seed: tickets — reset the target first')

const title = `${runid} Bench Ticket`
const existing = await api('GET', `/items/tickets?limit=-1&fields=id&${filter({ title: { _eq: title } })}`)
if (existing.length) throw new Error(`"${title}" already exists (${existing.map((t) => t.id).join(', ')}) — reset the target first`)

// Objective 3's customer: the existing "Bench Customer", not a look-alike.
const [customer] = await api('GET', `/items/customers?limit=-1&fields=id,name&sort=id&${filter({ name: { _eq: 'Bench Customer' } })}`)
if (!customer) throw new Error('no customer "Bench Customer" — reset the target first')

// Objectives 2-5 in one save, as the item form does.
const ticket = await api('POST', '/items/tickets', {
  title,
  description: `<p>Bench ticket opened by run ${runid}.</p>`,
  customer: customer.id,
  status: 'in_progress',
  tags: ['hardware'],
  due_date: '2026-12-31',
  estimated_hours: 6,
})

// Objective 6: a comment from the item's sidebar.
const comment = `Checked by run ${runid}.`
await api('POST', '/comments', { collection: 'tickets', item: ticket.id, comment })

// Read back what the Studio would show, for the report.
const saved = await api('GET', `/items/tickets/${ticket.id}?fields=*,customer.name`)
const finalText = [
  `1. DONE — Seed titles: ${seeds.map((s) => s.title).join('; ')}`,
  `2. DONE — ticket "${saved.title}" created, description: ${saved.description}`,
  `3. DONE — customer: ${saved.customer?.name}`,
  `4. DONE — status: In progress, tags: ${(saved.tags ?? []).join(', ')}`,
  `5. DONE — due date: ${saved.due_date}, estimated hours: ${saved.estimated_hours}`,
  `6. DONE — comment: ${comment}`,
  `7. DONE — ID: ${saved.id}`,
].join('\n')

fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `${runid}-oracle-result.json`)
fs.writeFileSync(file, JSON.stringify({ runid, target: 'directus', oracle: true, finalText }, null, 2))
console.log(finalText)
console.log(`\noracle-directus: wrote ${file}`)
