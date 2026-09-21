/**
 * External verification of a benchmark run against Snipe-IT's API v1.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The Snipe-IT
 * bite: every relation (model, status, location, user) is a select2 AJAX
 * dropdown, and a typed search with no option chosen submits nothing — the
 * form then saves (or refuses) without the value, which only the API can tell.
 *
 *   obj 1  (report-only: the Seed: assets' tags and names)       checked against finalText
 *   obj 2  an asset "<runid> Bench Asset" exists, model Bench Laptop Model, status Ready to Deploy
 *   obj 3  its default location is Bench Office
 *   obj 4  its purchase date is 2026-03-15
 *   obj 5  it is checked out to the user Bench Assignee
 *   obj 6  a checkout of it carries a note that includes the runid
 *   obj 7  (report-only: its asset tag)                           checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: Bearer SNIPEIT_API_TOKEN, else the token bench/thirdparty/snipeit/seed.sh
 * minted into bench/thirdparty/snipeit/.api-token.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8098/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const MODEL = 'Bench Laptop Model'
const STATUS = 'Ready to Deploy'
const LOCATION = 'Bench Office'
const PURCHASE_DATE = '2026-03-15'
const ASSIGNEE = 'bench-assignee'
const SEED_LOCATION = 'Bench Warehouse'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-snipeit.mjs <runid> [runid...]')
  process.exit(2)
}

let TOKEN = process.env.SNIPEIT_API_TOKEN
if (!TOKEN) {
  try {
    TOKEN = fs.readFileSync(path.join(here, 'thirdparty', 'snipeit', '.api-token'), 'utf8').trim()
  } catch {
    console.error('verify-snipeit: no API token — run bash bench/thirdparty/snipeit/seed.sh first')
    process.exit(2)
  }
}

async function api(route) {
  const res = await fetch(`${APP_URL}/api/v1${route}`, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
  const json = await res.json()
  if (json?.status === 'error') return null
  return json
}
async function rows(route) {
  const out = []
  for (let offset = 0; ; offset += 500) {
    const page = await api(`${route}${route.includes('?') ? '&' : '?'}limit=500&offset=${offset}`)
    out.push(...(page?.rows ?? []))
    if ((page?.rows ?? []).length < 500) return out
  }
}

// Ground truth, read once: every (not deleted) asset.
const all = await rows('/hardware')
const seeds = all.filter((a) => /^SEED-\d+$/.test(a.asset_tag ?? ''))
if (!seeds.length) {
  console.error('verify-snipeit: no SEED-* assets found — was the target reset?')
  process.exit(2)
}
const historyOf = async (id) => await rows(`/hardware/${id}/history`)

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
    const missing = seeds.filter((s) => !finalText.includes(s.asset_tag) || !finalText.includes(s.name))
    obj(1, missing.length === 0,
      missing.length ? `not in report: ${missing.map((s) => `${s.asset_tag} ${s.name}`).join(', ')}` : `all ${seeds.length} seed tags and names reported`)
  }

  const named = all.filter((a) => a.name === `${runid} Bench Asset`)
  const asset = [...named].sort((a, b) => a.id - b.id)[0] ?? null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5):
  // two assets with this name means the run did its work twice, and every
  // objective below would be judged against one picked by accident.
  const duplicateAssets = Math.max(0, named.length - 1)
  if (duplicateAssets > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} assets named "${runid} Bench Asset" ` +
      `(${named.map((a) => a.asset_tag).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single asset.')
  }

  const model = asset?.model?.name ?? null
  const status = asset?.status_label?.name ?? null
  obj(2, Boolean(asset) && model === MODEL && status === STATUS,
    !asset ? 'asset not found' : `${asset.asset_tag}, model=${model ?? '(none)'}, status=${status ?? '(none)'}`)

  const rtd = asset?.rtd_location?.name ?? null
  obj(3, rtd === LOCATION, !asset ? 'no asset' : `default location=${rtd ?? '(none)'}`)

  const purchased = asset?.purchase_date?.date ?? null
  obj(4, purchased === PURCHASE_DATE, !asset ? 'no asset' : `purchase date=${purchased ?? '(none)'}`)

  const assigned = asset?.assigned_to ?? null
  obj(5, assigned?.type === 'user' && assigned?.username === ASSIGNEE,
    !asset ? 'no asset' : `assigned to=${assigned ? `${assigned.name} (${assigned.type} ${assigned.username ?? assigned.id})` : '(nobody)'}`)

  const history = asset ? await historyOf(asset.id) : []
  const checkouts = history.filter((h) => h.action_type === 'checkout')
  const runCheckouts = checkouts.filter((h) => String(h.note ?? '').includes(runid))
  obj(6, runCheckouts.length > 0,
    !asset ? 'no asset' : `${checkouts.length} checkout(s), ${runCheckouts.length} with a note carrying the runid`)
  // An EXTRA MUTATION: one checkout is asked for. A second is a retried step
  // whose first attempt did land (or a check-in and re-checkout) — the same
  // "ran twice" defect as a duplicate.
  const extraCheckouts = Math.max(0, checkouts.length - 1)
  if (extraCheckouts > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${checkouts.length} checkouts of ${asset.asset_tag} ` +
      '— the run checked it out more than once, so a step ran twice with the first attempt landing.')
  }
  // The seed assets are read-only for the task, and the reset leaves them
  // checked in, Ready to Deploy, at Bench Warehouse. Anything else now was
  // done by this run.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (!/^Seed:/.test(s.name ?? '')) what.push(`renamed "${s.name}"`)
    if (s.assigned_to) what.push(`checked out to ${s.assigned_to.name}`)
    if (s.status_label?.name !== STATUS) what.push(`status ${s.status_label?.name}`)
    if (s.rtd_location?.name !== SEED_LOCATION) what.push(`location ${s.rtd_location?.name ?? '(none)'}`)
    if (s.notes) what.push('notes')
    if ((await historyOf(s.id)).some((h) => String(h.note ?? '').includes(runid))) what.push('runid in history')
    if (what.length) touchedSeeds.push(`${s.asset_tag} (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed asset(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const tagRe = asset ? new RegExp(`(?<![\\w-])${asset.asset_tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`) : null
    obj(7, Boolean(asset && tagRe.test(finalText)),
      asset ? `asset tag ${asset.asset_tag} ${tagRe.test(finalText) ? 'reported' : 'NOT in finalText'}` : 'no asset to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({ runid, assetTag: asset?.asset_tag ?? null, duplicateAssets, extraCheckouts, touchedSeeds, objectives, passed })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-snipeit.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
