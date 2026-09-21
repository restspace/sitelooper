/**
 * External verification of a benchmark run against Vikunja's API v1.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The Vikunja
 * bite: the task page saves fields in place (the heading on blur, the priority
 * on change, the due date only once its picker is confirmed or closed), and
 * the label picker CREATES a label from typed text unless a suggestion is
 * chosen, so a page that looks right may hold an unsaved date or a brand-new
 * "Backend" — only the API can tell.
 *
 *   obj 1  (report-only: the seed tasks' titles)                   checked against finalText
 *   obj 2  a task "<runid> Bench Task" exists in Bench Project, description includes the runid
 *   obj 3  its due date is 2026-12-31 (in the browser's timezone, see below)
 *   obj 4  its priority is High (3)
 *   obj 5  it carries the SEEDED label "Backend" (not one created by typing)
 *   obj 6  a comment on it includes the runid
 *   obj 7  (report-only: its identifier BENCH-<index>)              checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8096/').replace(/\/$/, '')
const USER = process.env.VIKUNJA_USER || 'admin'
const PASSWORD = process.env.VIKUNJA_PASSWORD || 'bench-admin-pass'
const OUT = process.env.BENCH_OUT || 'bench/results'
const DUE = '2026-12-31'
const PRIORITY_HIGH = 3
// Saved doubled = the same text twice over: a repeated paragraph, or one paragraph
// that is some text followed by itself (fwvk1: "…run fwvk1-n2Bench task…run fwvk1-n2").
// Counting the runid instead is wrong: a text may name it twice by design (fwgh2).
const paras = (t) => String(t ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
const selfRepeat = (p) => {
  for (let i = 1; i < p.length; i++) {
    const a = p.slice(0, i).trim(), b = p.slice(i).trim()
    if (a.length >= 4 && a === b) return true
  }
  return false
}
const doubled = (t) => { const ps = paras(t); return new Set(ps).size < ps.length || ps.some(selfRepeat) }

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-vikunja.mjs <runid> [runid...]')
  process.exit(2)
}

const login = await fetch(`${APP_URL}/api/v1/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: USER, password: PASSWORD }),
})
if (!login.ok) {
  console.error(`verify-vikunja: cannot sign in as "${USER}" (HTTP ${login.status}) — was the target seeded?`)
  process.exit(2)
}
const AUTH = `Bearer ${(await login.json()).token}`

async function api(route) {
  const res = await fetch(`${APP_URL}/api/v1${route}`, { headers: { authorization: AUTH } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
  return res.json()
}
/** Every page of a paginated list (the server caps a page at 50). */
async function all(route) {
  const out = []
  for (let page = 1; ; page++) {
    const sep = route.includes('?') ? '&' : '?'
    const res = await fetch(`${APP_URL}/api/v1${route}${sep}page=${page}&per_page=50`, { headers: { authorization: AUTH } })
    if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
    out.push(...((await res.json()) ?? []))
    if (page >= Number(res.headers.get('x-pagination-total-pages') || 1)) return out
  }
}

const project = (await all('/projects?is_archived=true')).find((p) => p.title === 'Bench Project')
if (!project) {
  console.error('verify-vikunja: project "Bench Project" not found — was the target seeded?')
  process.exit(2)
}
// Ground truth, read once: every task the user can see, done or not, in any
// project, so a task created in the wrong project is still found and judged.
const tasks = await all('/tasks/all')
const seedTitles = tasks.filter((t) => t.project_id === project.id && t.title.startsWith('Seed:')).map((t) => t.title)
const labels = (await all('/labels')).sort((a, b) => a.id - b.id)
const backends = labels.filter((l) => l.title.trim().toLowerCase() === 'backend')
const seededBackend = backends[0] ?? null

/**
 * The picker sets a local date-time in the BROWSER's timezone and the API
 * returns it as an instant, so "2026-12-31" is any instant that is on that day
 * in some real timezone (UTC-12 .. UTC+14), not only in UTC.
 */
function dueOn(value, day) {
  const t = Date.parse(value)
  if (!Number.isFinite(t) || String(value).startsWith('0001-')) return false
  const start = Date.parse(`${day}T00:00:00Z`)
  return t >= start - 14 * 3600e3 && t < start + 24 * 3600e3 + 12 * 3600e3
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
      !seedTitles.length ? 'project has no Seed: tasks — was the target reset?'
        : missing.length ? `title(s) not in report: ${missing.join(', ')}` : `all ${seedTitles.length} seed titles reported`)
  }

  const titled = tasks.filter((t) => t.title === `${runid} Bench Task`)
  const task = titled.find((t) => t.project_id === project.id) ?? titled[0] ?? null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5):
  // two tasks with this title means the run did its work twice, and every
  // objective below would be judged against one picked by accident.
  // Reported beside the objectives so the published denominator keeps its meaning.
  const duplicateTasks = Math.max(0, titled.length - 1)
  if (duplicateTasks > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${titled.length} tasks titled "${runid} Bench Task" ` +
      `(ids ${titled.map((t) => t.id).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single task.')
  }

  const description = String(task?.description ?? '')
  const inProject = task?.project_id === project.id
  // Not saved doubled: fwvk1's every replay saved "Bench task created for run
  // fwvk1-n2Bench task created for run fwvk1-n2" (a set-value recipe that
  // appended), which is wrong work, not a pass. Judged on the text (tags
  // stripped), not on how often the runid appears.
  const runidCount = runid ? description.split(runid).length - 1 : 0
  const descDoubled = doubled(description.replace(/<\/p>\s*<p>/g, '\n').replace(/<[^>]+>/g, ''))
  obj(2, Boolean(task && inProject && runidCount >= 1 && !descDoubled),
    !task ? 'task not found'
      : `project=${inProject ? 'Bench Project' : `#${task.project_id} (not Bench Project)`}, description includes runid=${runidCount > 0}` +
        (descDoubled ? ` — the description was saved doubled: ${JSON.stringify(description.slice(0, 300))}` : ''))

  obj(3, Boolean(task && dueOn(task.due_date, DUE)),
    !task ? 'no task' : `due date=${String(task.due_date).startsWith('0001-') ? '(not set)' : task.due_date}, want ${DUE}`)

  obj(4, task?.priority === PRIORITY_HIGH, !task ? 'no task' : `priority=${task.priority} (want ${PRIORITY_HIGH} = High)`)

  const taskLabels = task?.labels ?? []
  obj(5, Boolean(seededBackend && taskLabels.some((l) => l.id === seededBackend.id)),
    !task ? 'no task'
      : `labels=${taskLabels.map((l) => `${l.title}#${l.id}`).join(', ') || '(none)'}; seeded Backend is #${seededBackend?.id ?? '(missing)'}`)
  // An EXTRA MUTATION: the picker made a new label instead of choosing the
  // existing one (a second "Backend", or any label the reset did not seed).
  const extraLabels = Math.max(0, backends.length - 1)
  if (extraLabels > 0) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${backends.length} labels named "Backend" ` +
      `(ids ${backends.map((l) => l.id).join(', ')}) — the run created a label instead of choosing the existing one.`)
  }

  const comments = task ? ((await api(`/tasks/${task.id}/comments`)) ?? []).map((c) => String(c.comment ?? '')) : []
  const runComments = comments.filter((c) => c.includes(runid))
  obj(6, runComments.length > 0, !task ? 'no task' : `${comments.length} comment(s), ${runComments.length} carrying the runid`)
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
    const ident = task?.identifier ?? null
    const idRe = ident ? new RegExp(`(?<![\\w-])${ident.replace(/[#-]/g, '\\$&')}(?!\\d)`) : null
    obj(7, Boolean(idRe && idRe.test(finalText)),
      task ? `identifier ${ident} ${idRe.test(finalText) ? 'reported' : 'NOT in finalText'}` : 'no task to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({ runid, taskId: task?.id ?? null, identifier: task?.identifier ?? null, duplicateTasks, extraLabels, extraComments, objectives, passed })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-vikunja.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
