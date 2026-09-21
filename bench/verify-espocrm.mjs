/**
 * External verification of a benchmark run against EspoCRM's API v1.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The EspoCRM
 * bite: link fields (account, assigned user) accept typed text that never
 * becomes a link unless a record is chosen, and inline-edited fields only
 * persist when their pencil edit is saved — only the API can tell.
 *
 *   obj 1  (report-only: the Seed: opportunities' names)                   checked against finalText
 *   obj 2  an opportunity "<runid> Bench Opportunity" exists, account Bench Account, description includes the runid
 *   obj 3  its stage is Negotiation
 *   obj 4  its amount is 12500 and its close date 2026-12-31
 *   obj 5  it is assigned to bench-assignee
 *   obj 6  a Stream post on it includes the runid
 *   obj 7  (report-only: its 17-character record id)                       checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8097/').replace(/\/$/, '')
const AUTH = 'Basic ' + Buffer.from(`${process.env.ESPOCRM_USER || 'admin'}:${process.env.ESPOCRM_PASSWORD || 'bench-admin-pass'}`).toString('base64')
const OUT = process.env.BENCH_OUT || 'bench/results'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-espocrm.mjs <runid> [runid...]')
  process.exit(2)
}

async function api(route) {
  const res = await fetch(`${APP_URL}/api/v1/${route}`, { headers: { authorization: AUTH } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
  return res.json()
}
/** Every record of an entity type matching one where-clause. */
async function find(entity, where) {
  const out = []
  for (let offset = 0; ; offset += 200) {
    const q = new URLSearchParams({ maxSize: '200', offset: String(offset) })
    where.forEach((w, i) => {
      for (const [k, v] of Object.entries(w)) q.set(`where[${i}][${k}]`, String(v))
    })
    const page = await api(`${entity}?${q}`)
    out.push(...page.list)
    if (page.list.length < 200) return out
  }
}
/** The Post notes in a record's Stream (updates and other system notes excluded). */
async function postsOf(entity, id) {
  const res = await api(`${entity}/${id}/stream?maxSize=200`)
  return (res?.list ?? []).filter((n) => n.type === 'Post').map((n) => String(n.post ?? ''))
}

const benchAccount = (await find('Account', [{ type: 'equals', attribute: 'name', value: 'Bench Account' }]))[0]
const assignee = (await find('User', [{ type: 'equals', attribute: 'userName', value: 'bench-assignee' }]))[0]
if (!benchAccount || !assignee) {
  console.error('verify-espocrm: "Bench Account" or user "bench-assignee" not found — was the target seeded?')
  process.exit(2)
}
// The seed opportunities, as the reset leaves them: Prospecting, unassigned,
// on Bench Account. Read once; each is judged per runid below.
const seeds = await find('Opportunity', [{ type: 'startsWith', attribute: 'name', value: 'Seed:' }])
const seedNames = seeds.map((o) => o.name)

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
      !seedNames.length ? 'no Seed: opportunities — was the target reset?'
        : missing.length ? `name(s) not in report: ${missing.join(', ')}` : `all ${seedNames.length} seed names reported`)
  }

  const named = await find('Opportunity', [{ type: 'equals', attribute: 'name', value: `${runid} Bench Opportunity` }])
  // The list omits the description; read the full record.
  const opp = named[0] ? await api(`Opportunity/${named[0].id}`) : null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5).
  const duplicates = Math.max(0, named.length - 1)
  if (duplicates > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} opportunities named "${runid} Bench Opportunity" ` +
      `(${named.map((o) => o.id).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single opportunity.')
  }

  const desc = String(opp?.description ?? '')
  obj(2, Boolean(opp && opp.accountId === benchAccount.id && desc.includes(runid)),
    !opp ? 'opportunity not found'
      : `id=${opp.id}, account=${opp.accountName ?? '(none)'}, description includes runid=${desc.includes(runid)}`)

  obj(3, opp?.stage === 'Negotiation', !opp ? 'no opportunity' : `stage=${opp.stage}`)

  obj(4, Boolean(opp && Number(opp.amount) === 12500 && opp.closeDate === '2026-12-31'),
    !opp ? 'no opportunity' : `amount=${opp.amount} ${opp.amountCurrency ?? ''}, closeDate=${opp.closeDate ?? '(none)'}`)

  obj(5, opp?.assignedUserId === assignee.id, !opp ? 'no opportunity' : `assignedUser=${opp.assignedUserName ?? '(none)'}`)

  const posts = opp ? await postsOf('Opportunity', opp.id) : []
  const runPosts = posts.filter((p) => p.includes(runid))
  obj(6, runPosts.length > 0, !opp ? 'no opportunity' : `${posts.length} post(s), ${runPosts.length} carrying the runid`)
  // An EXTRA MUTATION: one post is asked for. A second is a retried step
  // whose first attempt did land — the same "ran twice" defect as a duplicate.
  const extraPosts = Math.max(0, runPosts.length - 1)
  if (extraPosts > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runPosts.length} Stream posts carry the runid ` +
      '— the run posted more than once, so a step ran twice with the first attempt landing.')
  }
  // The seed opportunities are read-only for the task, and the reset leaves
  // them Prospecting, unassigned, on Bench Account. Anything else was this run.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (s.stage !== 'Prospecting') what.push(`stage ${s.stage}`)
    if (s.assignedUserId) what.push(`assignee ${s.assignedUserName}`)
    if (s.accountId !== benchAccount.id) what.push(`account ${s.accountName ?? '(none)'}`)
    if ((await postsOf('Opportunity', s.id)).some((p) => p.includes(runid))) what.push('runid post')
    if (what.length) touchedSeeds.push(`"${s.name}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed opportunit(ies) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    obj(7, Boolean(opp && finalText.includes(opp.id)),
      opp ? `record id ${opp.id} ${finalText.includes(opp.id) ? 'reported' : 'NOT in finalText'}` : 'no opportunity to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({ runid, opportunityId: opp?.id ?? null, duplicates, extraPosts, touchedSeeds, objectives, passed })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-espocrm.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
