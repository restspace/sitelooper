/**
 * External verification of a benchmark run against Gitea's API v1.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The Gitea
 * bite: the sidebar pickers are Fomantic-UI multi-select menus that apply
 * their choice only when the menu closes, so a label that LOOKED ticked in an
 * open menu may never have been saved — only the API can tell.
 *
 *   obj 1  (report-only: the open Seed: issues' titles)        checked against finalText
 *   obj 2  an issue "<runid> Bench Issue" exists in bench/bench-repo, body includes the runid
 *   obj 3  its labels are exactly bug + priority-high
 *   obj 4  it is assigned to bench-assignee
 *   obj 5  its milestone is Bench Milestone
 *   obj 6  a comment on it includes the runid
 *   obj 7  (report-only: its #number)                          checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8095/').replace(/\/$/, '')
const AUTH = 'Basic ' + Buffer.from(`${process.env.GITEA_USER || 'admin'}:${process.env.GITEA_PASSWORD || 'bench-admin-pass'}`).toString('base64')
const OUT = process.env.BENCH_OUT || 'bench/results'
const REPO = '/repos/bench/bench-repo'
const LABELS = ['bug', 'priority-high']

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-gitea.mjs <runid> [runid...]')
  process.exit(2)
}

async function api(route) {
  const res = await fetch(`${APP_URL}/api/v1${route}`, { headers: { authorization: AUTH } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
  return res.json()
}

if (!(await api(REPO))) {
  console.error('verify-gitea: repo "bench/bench-repo" not found — was the target seeded?')
  process.exit(2)
}
// Ground truth, read once: every issue in the repo, open or closed, so a
// wrongly-closed one is still judged.
const all = []
for (let page = 1; ; page++) {
  const batch = await api(`${REPO}/issues?state=all&type=issues&limit=50&page=${page}`)
  all.push(...batch)
  if (batch.length < 50) break
}
const seeds = all.filter((i) => i.title.startsWith('Seed:'))
const seedTitles = seeds.filter((i) => i.state === 'open').map((i) => i.title)
const commentsOf = async (n) => ((await api(`${REPO}/issues/${n}/comments`)) ?? []).map((c) => String(c.body ?? ''))

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
    const missing = seedTitles.filter((s) => !finalText.includes(s))
    obj(1, seedTitles.length > 0 && missing.length === 0,
      !seedTitles.length ? 'repo has no open Seed: issues — was the target reset?'
        : missing.length ? `title(s) not in report: ${missing.join(', ')}` : `all ${seedTitles.length} seed titles reported`)
  }

  const titled = all.filter((i) => i.title === `${runid} Bench Issue`)
  const issue = titled[0] ?? null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5):
  // two issues with this title means the run did its work twice, and every
  // objective below would be judged against one picked by accident.
  const duplicateIssues = Math.max(0, titled.length - 1)
  if (duplicateIssues > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${titled.length} issues titled "${runid} Bench Issue" ` +
      `(#${titled.map((i) => i.number).join(', #')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single issue.')
  }

  const body = String(issue?.body ?? '')
  obj(2, Boolean(issue && body.includes(runid)),
    !issue ? 'issue not found' : `#${issue.number}, state=${issue.state}, description includes runid=${body.includes(runid)}`)

  const labels = (issue?.labels ?? []).map((l) => l.name).sort()
  obj(3, Boolean(issue) && labels.join(',') === [...LABELS].sort().join(','),
    !issue ? 'no issue' : `labels=[${labels.join(', ')}], want [${LABELS.join(', ')}]`)

  const assignees = (issue?.assignees ?? []).map((u) => u.login)
  obj(4, assignees.includes('bench-assignee'), !issue ? 'no issue' : `assignees=[${assignees.join(', ')}]`)

  const milestone = issue?.milestone?.title ?? null
  obj(5, milestone === 'Bench Milestone', !issue ? 'no issue' : `milestone=${milestone ?? '(none)'}`)

  const comments = issue ? await commentsOf(issue.number) : []
  const runComments = comments.filter((c) => c.includes(runid))
  obj(6, runComments.length > 0, !issue ? 'no issue' : `${comments.length} comment(s), ${runComments.length} carrying the runid`)
  // An EXTRA MUTATION: one comment is asked for. A second is a retried step
  // whose first attempt did land — the same "ran twice" defect as a duplicate.
  const extraComments = Math.max(0, runComments.length - 1)
  if (extraComments > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${runComments.length} comments carry the runid ` +
      '— the run commented more than once, so a step ran twice with the first attempt landing.')
  }
  // The seed issues are read-only for the task, and the reset leaves them open
  // and bare. Anything set on one now was set by this run.
  const touchedSeeds = []
  for (const s of seeds) {
    const what = []
    if (s.state !== 'open') what.push('closed')
    if (s.labels?.length) what.push(`labels ${s.labels.map((l) => l.name).join('+')}`)
    if (s.assignees?.length) what.push('assignee')
    if (s.milestone) what.push('milestone')
    if ((await commentsOf(s.number)).some((c) => c.includes(runid))) what.push('runid comment')
    if (what.length) touchedSeeds.push(`#${s.number} (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed issue(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const numRe = issue ? new RegExp(`#${issue.number}\\b`) : null
    obj(7, Boolean(issue && numRe.test(finalText)),
      issue ? `issue #${issue.number} ${numRe.test(finalText) ? 'reported' : 'NOT in finalText'}` : 'no issue to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({ runid, issueNumber: issue?.number ?? null, duplicateIssues, extraComments, touchedSeeds, objectives, passed })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-gitea.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
