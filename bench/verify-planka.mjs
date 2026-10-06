/**
 * External verification of a benchmark run against the Planka REST API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. HELD OUT
 * (notes/HELDOUT2-PROTOCOL.md): written from the Planka 2.2.1 source and API only.
 *
 *   obj 1  (report-only: the Seed: cards' names)                           checked against finalText
 *   obj 2  a card "<runid> Bench Card" on Bench Board, in list In Progress, whose description carries the runid, not saved doubled
 *   obj 3  its labels are exactly the seeded "Hardware" (not a look-alike, not a new label)
 *   obj 4  its members are exactly the seeded user "Bench Tester" (not "Bench Tester Lead")
 *   obj 5  its due date is 2026-12-31 (any time of day in any timezone UTC-12..UTC+14)
 *   obj 6  a comment on it includes the runid
 *   obj 7  (report-only: its id, the number in /cards/<id>)                 checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: signs in as the admin with its password (POST /api/access-tokens) and
 * uses the returned JWT as a Bearer token, then signs that session out.
 * PLANKA_EMAIL / PLANKA_PASSWORD override.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8104/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const EMAIL = process.env.PLANKA_EMAIL || 'admin@example.com'
const PASSWORD = process.env.PLANKA_PASSWORD || 'bench-admin-pass'
const PROJECT = 'Bench Project'
const BOARD = 'Bench Board'
const SEED_LIST = 'To Do'
const LIST = 'In Progress'
const LABEL = 'Hardware'
const SEED_LABELS = ['Hardware', 'Hardware Return', 'Hardware Spares', 'Software', 'Network']
const MEMBER = 'Bench Tester'
const DUE_DATE = '2026-12-31'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-planka.mjs <runid> [runid...]')
  process.exit(2)
}

// ---- sign in ---------------------------------------------------------------
const login = await fetch(`${APP_URL}/api/access-tokens`, {
  method: 'POST',
  headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ emailOrUsername: EMAIL, password: PASSWORD }),
}).catch((e) => ({ ok: false, status: `unreachable (${e.message})`, json: async () => null }))
const loginBody = await login.json().catch(() => null)
if (!login.ok || typeof loginBody?.item !== 'string') {
  console.error(`verify-planka: sign-in as ${EMAIL} failed: HTTP ${login.status} ${JSON.stringify(loginBody).slice(0, 200)} ` +
    '— was the target reset (which accepts the terms for the admin)?')
  process.exit(2)
}
const TOKEN = loginBody.item

async function api(route) {
  const res = await fetch(`${APP_URL}${route}`, { headers: { accept: 'application/json', authorization: `Bearer ${TOKEN}` } })
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
const byId = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)

// Every card of a list, archive and trash lists included (the board view
// returns only the active and closed lists' cards; the rest page by 50).
async function listCards(listId) {
  const out = []
  let before = null
  for (;;) {
    const q = before ? `?before[id]=${before.id}&before[listChangedAt]=${encodeURIComponent(before.listChangedAt)}` : ''
    const page = (await api(`/api/lists/${listId}/cards${q}`)).items ?? []
    const fresh = page.filter((c) => !out.some((o) => o.id === c.id))
    out.push(...fresh)
    if (page.length < 50 || !fresh.length) break
    const last = page[page.length - 1]
    before = { id: last.id, listChangedAt: last.listChangedAt }
  }
  return out
}
async function cardComments(cardId) {
  const out = []
  let beforeId = null
  for (;;) {
    const page = (await api(`/api/cards/${cardId}/comments${beforeId ? `?beforeId=${beforeId}` : ''}`)).items ?? []
    const fresh = page.filter((c) => !out.some((o) => o.id === c.id))
    out.push(...fresh)
    if (page.length < 50 || !fresh.length) break
    beforeId = page[page.length - 1].id
  }
  return out
}

// ---- ground truth, read once -----------------------------------------------
// Every board the admin can see (a copy of the card on another board is still
// work the run did), with every card, label, membership and comment on it.
const projectsRes = await api('/api/projects')
const projects = projectsRes.items ?? []
const allBoards = projectsRes.included?.boards ?? []
const project = projects.filter((p) => p.name === PROJECT).sort(byId)[0] ?? null
const boardRow = project ? allBoards.filter((b) => b.projectId === project.id && b.name === BOARD).sort(byId)[0] : null
if (!boardRow) {
  console.error(`verify-planka: no board "${BOARD}" in project "${PROJECT}" — was the target reset?`)
  process.exit(2)
}

const cards = [] // every card on every board, with .board, .list, .labels, .members, .trashed
const users = new Map()
let benchBoard = null
for (const b of allBoards) {
  const { included: inc } = await api(`/api/boards/${b.id}`)
  for (const u of inc.users ?? []) users.set(u.id, u)
  const lists = new Map((inc.lists ?? []).map((l) => [l.id, l]))
  const labels = new Map((inc.labels ?? []).map((l) => [l.id, l]))
  if (b.id === boardRow.id) benchBoard = { board: b, lists: inc.lists ?? [], labels: inc.labels ?? [], memberships: inc.boardMemberships ?? [] }
  const boardCards = [...(inc.cards ?? [])]
  for (const l of inc.lists ?? []) {
    if (l.type !== 'archive' && l.type !== 'trash') continue
    boardCards.push(...await listCards(l.id))
  }
  const cardLabels = inc.cardLabels ?? []
  const cardMemberships = inc.cardMemberships ?? []
  // The archive/trash cards' labels and members are not in the board view;
  // they matter only for strays, which are judged by name and description.
  for (const c of boardCards) {
    const list = lists.get(c.listId) ?? null
    cards.push({
      ...c,
      boardName: b.name,
      boardIsBench: b.id === boardRow.id,
      listName: list?.name ?? null,
      listType: list?.type ?? null,
      trashed: list?.type === 'trash',
      labels: cardLabels.filter((x) => x.cardId === c.id).map((x) => labels.get(x.labelId) ?? { id: x.labelId, name: '(unknown)' }),
      memberIds: cardMemberships.filter((x) => x.cardId === c.id).map((x) => x.userId),
    })
  }
}
cards.sort(byId)
// GET /api/users (admin) for names of users not on any board.
try { for (const u of (await api('/api/users')).items ?? []) if (!users.has(u.id)) users.set(u.id, u) } catch { /* names only */ }
const userName = (id) => users.get(id)?.name ?? `#${id}`

const seeds = cards.filter((c) => c.boardIsBench && !c.trashed && /^Seed:/.test(c.name ?? ''))
if (!seeds.length) {
  console.error('verify-planka: no Seed: cards on the board — was the target reset?')
  process.exit(2)
}
const seedLabel = benchBoard.labels.filter((l) => l.name === LABEL).sort(byId)[0] ?? null
const seedMember = [...users.values()].filter((u) => u.name === MEMBER).sort(byId)[0] ?? null

const commentCache = new Map()
const commentsOn = async (id) => {
  if (!commentCache.has(id)) commentCache.set(id, await cardComments(id))
  return commentCache.get(id).map((c) => String(c.text ?? ''))
}

// An empty runid (a sweep that lost its id) matches nothing, rather than everything.
const count = (text, needle) => (needle ? String(text ?? '').split(needle).length - 1 : 0)
// The description is markdown; judge its text, one line per block.
const plain = (md) => String(md ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, '')
  .replace(/[*_`~]+/g, '')
  .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
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
// The due date is an instant; the browser stores the local day's chosen time.
// It is 2026-12-31 somewhere between UTC-12 and UTC+14 exactly when it falls in
// [2026-12-30T10:00Z, 2027-01-01T12:00Z).
const dueOk = (v) => {
  const t = Date.parse(v ?? '')
  return Number.isFinite(t) && t >= Date.parse(`${DUE_DATE}T00:00:00Z`) - 14 * 3600e3 && t < Date.parse(`${DUE_DATE}T00:00:00Z`) + 36 * 3600e3
}

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

  // A card in a trash list was deleted from the board's point of view; every
  // other card with the name (any board, archived included) counts.
  const named = cards.filter((c) => c.name === `${runid} Bench Card` && !c.trashed)
  // Prefer the one on Bench Board, so a stray copy elsewhere does not hide it.
  const card = named.find((c) => c.boardIsBench && c.listType !== 'archive') ?? named[0] ?? null

  // An extra created record FAILS, it does not warn: two cards with this name
  // means the run did its work twice, and every objective below would be
  // judged against one picked by accident.
  const duplicates = Math.max(0, named.length - 1)
  if (duplicates > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} cards named "${runid} Bench Card" ` +
      `(${named.map((c) => `${c.id} on ${c.boardName}/${c.listName}`).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single card.')
  }

  const body = plain(card?.description)
  const bodyDoubled = doubled(body)
  const where = card ? `${card.boardName} / ${card.listName ?? '(unknown list)'}${card.listType && card.listType !== 'active' ? ` (${card.listType})` : ''}` : ''
  obj(2, Boolean(card) && card.boardIsBench && card.listName === LIST && card.listType === 'active' &&
    count(body, runid) >= 1 && !bodyDoubled,
    !card ? 'card not found'
      : `${card.id} in ${where} (want ${BOARD} / ${LIST}), description includes runid=${count(body, runid) > 0}` +
        (bodyDoubled ? ` — the description was saved doubled: ${JSON.stringify(body.slice(0, 300))}` : ''))

  const labelNames = card ? card.labels.map((l) => l.name) : []
  obj(3, Boolean(card && seedLabel) && card.labels.length === 1 && card.labels[0].id === seedLabel.id,
    !card ? 'no card'
      : `labels=${JSON.stringify(card.labels.map((l) => `${l.name ?? '(unnamed)'} (#${l.id})`))}, ` +
        `want only the seeded ${LABEL} (#${seedLabel?.id ?? 'missing!'})`)

  obj(4, Boolean(card && seedMember) && card.memberIds.length === 1 && card.memberIds[0] === seedMember.id,
    !card ? 'no card'
      : `members=${JSON.stringify(card.memberIds.map((id) => `${userName(id)} (#${id})`))}, ` +
        `want only ${MEMBER} (#${seedMember?.id ?? 'missing!'})`)

  obj(5, Boolean(card) && dueOk(card.dueDate),
    !card ? 'no card' : `dueDate=${card.dueDate ?? '(none)'}; want ${DUE_DATE} (any time of day)`)

  const own = card ? await commentsOn(card.id) : []
  const runComments = own.filter((c) => count(c, runid) > 0)
  obj(6, runComments.length > 0, !card ? 'no card' : `${own.length} comment(s), ${runComments.length} carrying the runid`)
  // One comment is asked for. A second is a retried step whose first attempt
  // did land — the same "ran twice" defect as a duplicate.
  const extraComments = Math.max(0, runComments.length - 1)
  if (extraComments > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runComments.length} comments on the card carry the runid ` +
      '— the run commented more than once, so a step ran twice with the first attempt landing.')
  }

  // Any other card carrying the runid (a copy, a draft under another name)
  // is work the task did not ask for. Trashed cards were undone by the run.
  const strays = cards.filter((c) => runid && !c.trashed && !named.includes(c) &&
    (String(c.name ?? '').includes(runid) || String(c.description ?? '').includes(runid)))
  if (strays.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** other card(s) carrying the runid: ${strays.map((c) => `"${c.name}" (${c.id} on ${c.boardName}/${c.listName})`).join('; ')}`)
  }
  // Comments carrying the runid on any other card. Only the board's live
  // cards are read: that is where a misplaced comment lands.
  const ownIds = new Set(named.map((c) => c.id))
  const strayComments = []
  for (const c of cards) {
    if (!runid || ownIds.has(c.id) || c.trashed || !c.commentsTotal) continue
    if ((await commentsOn(c.id)).some((t) => count(t, runid) > 0)) strayComments.push(c)
  }
  if (strayComments.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** comment(s) carrying the runid on other card(s): ` +
      `${strayComments.map((c) => `"${c.name}" (${c.id})`).join(', ')}`)
  }
  // The reset leaves exactly the five seed labels on the board; any other one
  // was created by this run — typically from the label picker's create option.
  const newLabels = benchBoard.labels.filter((l) => !SEED_LABELS.includes(l.name) ||
    benchBoard.labels.filter((x) => x.name === l.name).sort(byId)[0].id !== l.id)
  if (newLabels.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** label(s) created: ${newLabels.map((l) => `"${l.name ?? '(unnamed)'}" (#${l.id})`).join(', ')} ` +
      '— the task only picks an existing label.')
  }
  // The seed cards are read-only for the task, and the reset leaves them in
  // To Do with no label, member, due date or comment.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (s.listName !== SEED_LIST) what.push(`list ${s.listName}`)
    if (s.dueDate) what.push(`due date ${s.dueDate}`)
    if (s.labels.length) what.push(`labels ${JSON.stringify(s.labels.map((l) => l.name))}`)
    if (s.memberIds.length) what.push(`members ${JSON.stringify(s.memberIds.map(userName))}`)
    if (runid && String(s.description ?? '').includes(runid)) what.push('runid in description')
    const sc = await commentsOn(s.id)
    if (sc.length) what.push(`${sc.length} comment(s)`)
    if (what.length) touchedSeeds.push(`"${s.name}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed card(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    // Ids are long numbers; require the id not to be part of a longer number.
    const reported = Boolean(card) && new RegExp(`(^|\\D)${card.id}(\\D|$)`).test(finalText)
    obj(7, reported, card ? `card id ${card.id} ${reported ? 'reported' : 'NOT in finalText'}` : 'no card to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({
    runid, cardId: card?.id ?? null, list: card?.listName ?? null, labels: labelNames,
    members: card ? card.memberIds.map(userName) : [], duplicates, extraComments,
    strays: strays.map((c) => c.name), newLabels: newLabels.map((l) => l.name), touchedSeeds, objectives, passed,
  })
}

// Sign this session out (best effort): the verifier should not pile up sessions.
await fetch(`${APP_URL}/api/access-tokens/me`, { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } }).catch(() => {})

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-planka.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
