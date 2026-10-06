/**
 * API oracle for the held-out planka target (notes/HELDOUT2-PROTOCOL.md):
 * performs every objective of bench/tasks/planka-card-flow.md through the
 * REST API exactly as a perfect run would, and writes the report a perfect run
 * would give to <BENCH_OUT>/<runid>-oracle-result.json ({ finalText }), so the
 * verifier can be proven before any tool runs:
 *
 *   node bench/reset-app.mjs --target planka
 *   node bench/oracle-planka.mjs pkoracle1 && node bench/verify-planka.mjs pkoracle1   # all PASS
 *   node bench/reset-app.mjs --target planka
 *   node bench/verify-planka.mjs pkuntouched1                                          # all FAIL
 *
 * Never shown to the tools under test.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8104/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const EMAIL = process.env.PLANKA_EMAIL || 'admin@example.com'
const PASSWORD = process.env.PLANKA_PASSWORD || 'bench-admin-pass'

const runid = process.argv[2]
if (!runid) {
  console.error('usage: node bench/oracle-planka.mjs <runid>')
  process.exit(2)
}

let token = null
async function api(method, route, body) {
  const res = await fetch(`${APP_URL}${route}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`planka ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
const byId = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)

token = (await api('POST', '/api/access-tokens', { emailOrUsername: EMAIL, password: PASSWORD })).item

const projects = await api('GET', '/api/projects')
const project = projects.items.filter((p) => p.name === 'Bench Project').sort(byId)[0]
if (!project) throw new Error('no project "Bench Project" — reset the target first')
const boardRow = projects.included.boards.filter((b) => b.projectId === project.id && b.name === 'Bench Board').sort(byId)[0]
if (!boardRow) throw new Error('no board "Bench Board" — reset the target first')
const { included: inc } = await api('GET', `/api/boards/${boardRow.id}`)

// Objective 1: read the Seed: cards' names.
const seeds = inc.cards.filter((c) => /^Seed:/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name))
if (!seeds.length) throw new Error('no Seed: cards — reset the target first')

const name = `${runid} Bench Card`
const existing = inc.cards.filter((c) => c.name === name)
if (existing.length) throw new Error(`"${name}" already exists (${existing.map((c) => c.id).join(', ')}) — reset the target first`)

const list = inc.lists.filter((l) => l.type === 'active' && l.name === 'In Progress').sort(byId)[0]
if (!list) throw new Error('no list "In Progress" — reset the target first')
// Objectives 3 and 4: the existing "Hardware" label and "Bench Tester" member, not look-alikes.
const label = inc.labels.filter((l) => l.name === 'Hardware').sort(byId)[0]
if (!label) throw new Error('no label "Hardware" — reset the target first')
const member = inc.users.filter((u) => u.name === 'Bench Tester').sort(byId)[0]
if (!member) throw new Error('no board member "Bench Tester" — reset the target first')

// Objectives 2 and 5: the card, at the bottom of the list, as the list's add-card composer does.
const inList = inc.cards.filter((c) => c.listId === list.id)
const position = Math.max(0, ...inList.map((c) => c.position ?? 0)) + 65536
const card = (await api('POST', `/api/lists/${list.id}/cards`, {
  type: 'project',
  position,
  name,
  description: `Bench card opened by run ${runid}.`,
  // The due-date popover's default time is 12:00 local; the box runs in UTC.
  dueDate: '2026-12-31T12:00:00.000Z',
})).item

// Objectives 3 and 4: the label and member popovers.
await api('POST', `/api/cards/${card.id}/card-labels`, { labelId: label.id })
await api('POST', `/api/cards/${card.id}/card-memberships`, { userId: member.id })

// Objective 6: a comment from the card's own view.
const comment = `Checked by run ${runid}.`
await api('POST', `/api/cards/${card.id}/comments`, { text: comment })

// Read back what the card modal would show, for the report.
const shown = await api('GET', `/api/cards/${card.id}`)
const saved = shown.item
const savedLabels = (shown.included.cardLabels ?? []).map((cl) => inc.labels.find((l) => l.id === cl.labelId)?.name)
const savedMembers = (shown.included.cardMemberships ?? []).map((cm) => inc.users.find((u) => u.id === cm.userId)?.name)
const finalText = [
  `1. DONE — Seed names: ${seeds.map((s) => s.name).join('; ')}`,
  `2. DONE — card "${saved.name}" created in ${list.name}, description: ${saved.description}`,
  `3. DONE — label: ${savedLabels.join(', ')}`,
  `4. DONE — member: ${savedMembers.join(', ')}`,
  `5. DONE — due date: ${saved.dueDate}`,
  `6. DONE — comment: ${comment}`,
  `7. DONE — ID: ${saved.id}`,
].join('\n')

await api('DELETE', '/api/access-tokens/me').catch(() => {})

fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `${runid}-oracle-result.json`)
fs.writeFileSync(file, JSON.stringify({ runid, target: 'planka', oracle: true, finalText }, null, 2))
console.log(finalText)
console.log(`\noracle-planka: wrote ${file}`)
