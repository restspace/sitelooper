/**
 * External verification of a benchmark run against OpenProject's API v3.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The OpenProject
 * bite: its fields are edited in place and save on their own, so a field that
 * LOOKS set on the page may have been left in edit mode, reverted on blur, or
 * refused by the status workflow — only the API can tell.
 *
 *   obj 1  (report-only: the seed work packages' subjects)  checked against finalText
 *   obj 2  a Task "<runid> Bench Work Package" exists in Bench Project, description includes the runid
 *   obj 3  it is assigned to Bench Assignee
 *   obj 4  its status is In progress
 *   obj 5  its finish date (API: dueDate) is 2026-12-31
 *   obj 6  a comment on it includes the runid
 *   obj 7  (report-only: its numeric id)                     checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8090/').replace(/\/$/, '')
const TOKEN = process.env.OPENPROJECT_API_TOKEN || 'bench-api-token'
const AUTH = 'Basic ' + Buffer.from(`apikey:${TOKEN}`).toString('base64')
const OUT = process.env.BENCH_OUT || 'bench/results'
const DUE = '2026-12-31'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-openproject.mjs <runid> [runid...]')
  process.exit(2)
}

async function api(route) {
  const res = await fetch(`${APP_URL}/api/v3${route}`, { headers: { authorization: AUTH } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
  return res.json()
}

const project = await api('/projects/bench-project')
if (!project) {
  console.error('verify-openproject: project "Bench Project" not found — was the target seeded?')
  process.exit(2)
}
// Ground truth, read once: every work package in the project, open or closed
// (status operator "*" is "any"), so a wrongly-closed one is still judged.
const filters = encodeURIComponent(JSON.stringify([{ status: { operator: '*', values: [] } }]))
const all = (await api(`/projects/${project.id}/work_packages?filters=${filters}&pageSize=500`))._embedded.elements
const seedSubjects = all.map((wp) => wp.subject).filter((s) => s.startsWith('Seed:'))

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
    const missing = seedSubjects.filter((s) => !finalText.includes(s))
    obj(1, seedSubjects.length > 0 && missing.length === 0,
      !seedSubjects.length ? 'project has no Seed: work packages — was the target reset?'
        : missing.length ? `subject(s) not in report: ${missing.join(', ')}` : `all ${seedSubjects.length} seed subjects reported`)
  }

  const titled = all.filter((wp) => wp.subject === `${runid} Bench Work Package`)
  const wp = titled[0] ?? null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5):
  // two work packages with this subject means the run did its work twice, and
  // every objective below would be judged against one picked by accident.
  // Reported beside the objectives so the published denominator keeps its meaning.
  const duplicateWorkPackages = Math.max(0, titled.length - 1)
  if (duplicateWorkPackages > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${titled.length} work packages titled "${runid} Bench Work Package" ` +
      `(ids ${titled.map((w) => w.id).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single work package.')
  }

  const description = String(wp?.description?.raw ?? '')
  const type = wp?._links?.type?.title
  obj(2, Boolean(wp && type === 'Task' && description.includes(runid)),
    !wp ? 'work package not found' : `type=${type}, description includes runid=${description.includes(runid)}`)

  const assignee = wp?._links?.assignee?.title ?? null
  obj(3, assignee === 'Bench Assignee', !wp ? 'no work package' : `assignee=${assignee ?? '(none)'}`)

  const status = wp?._links?.status?.title ?? null
  obj(4, status === 'In progress', !wp ? 'no work package' : `status=${status}`)

  obj(5, wp?.dueDate === DUE, !wp ? 'no work package' : `finish date=${wp.dueDate ?? '(not set)'}, want ${DUE}`)

  const activities = wp ? ((await api(`/work_packages/${wp.id}/activities`))?._embedded?.elements ?? []) : []
  const comments = activities.map((a) => String(a.comment?.raw ?? '')).filter(Boolean)
  const runComments = comments.filter((c) => c.includes(runid))
  obj(6, runComments.length > 0, !wp ? 'no work package' : `${comments.length} comment(s), ${runComments.length} carrying the runid`)
  // An EXTRA MUTATION: one comment is asked for. A second is a retried step
  // whose first attempt did land — the same "ran twice" defect as a duplicate.
  const extraComments = Math.max(0, runComments.length - 1)
  if (extraComments > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runComments.length} comments carry the runid ` +
      '— the run commented more than once, so a step ran twice with the first attempt landing.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const idRe = wp ? new RegExp(`#?\\b${wp.id}\\b`) : null
    obj(7, Boolean(wp && idRe.test(finalText)),
      wp ? `work package id ${wp.id} ${idRe.test(finalText) ? 'reported' : 'NOT in finalText'}` : 'no work package to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({ runid, workPackageId: wp?.id ?? null, duplicateWorkPackages, extraComments, objectives, passed })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-openproject.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
