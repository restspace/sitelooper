/**
 * External verification of a benchmark run against Ghost's Admin API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The Ghost
 * bites: the post body is a Lexical contenteditable (text that was set on the
 * DOM but never reached the editor's model is not saved, and text typed twice
 * is saved twice), the tag input CREATES a new tag from whatever is typed
 * unless a suggestion is chosen, and publishing is a multi-stage modal whose
 * last button is the only one that publishes.
 *
 *   obj 1  (report-only: the published Seed: posts' titles)            checked against finalText
 *   obj 2  a post "<runid> Bench Post" exists whose body carries the runid exactly once
 *   obj 3  its only tag is the seeded Bench News (not a new tag, not Bench Newsletter)
 *   obj 4  its custom excerpt carries the runid exactly once
 *   obj 5  it is published, public
 *   obj 6  its publish date is 2026-09-01 (site timezone UTC)
 *   obj 7  (report-only: its URL slug)                                 checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: a staff session cookie from POST /ghost/api/admin/session as the owner
 * bench/app-reset.mjs sets up (GHOST_EMAIL / GHOST_PASSWORD override).
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8099/').replace(/\/$/, '')
const ORIGIN = new URL(APP_URL).origin
const OUT = process.env.BENCH_OUT || 'bench/results'
const TAG = 'Bench News'
const SEED_TAGS = ['Bench News', 'Bench Guides', 'Bench Newsletter']
const PUBLISH_DATE = '2026-09-01'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-ghost.mjs <runid> [runid...]')
  process.exit(2)
}

let cookie = ''
async function call(method, route, body) {
  return await fetch(`${APP_URL}/ghost/api/admin${route}`, {
    method,
    headers: {
      origin: ORIGIN, accept: 'application/json', 'accept-version': 'v6.0',
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
async function api(route) {
  const res = await call('GET', route)
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return await res.json()
}

const login = await call('POST', '/session/', {
  username: process.env.GHOST_EMAIL || 'admin@bench.local',
  password: process.env.GHOST_PASSWORD || 'bench-admin-pass',
})
if (!login.ok) {
  console.error(`verify-ghost: sign-in failed: HTTP ${login.status} — was the target reset (which sets up the owner)?`)
  process.exit(2)
}
cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')

// Ground truth, read once: every post (any status) and every tag.
const posts = (await api('/posts/?limit=all&include=tags&formats=plaintext')).posts
const tags = (await api('/tags/?limit=all')).tags
const seeds = posts.filter((p) => /^Seed:/.test(p.title) && p.status === 'published')
if (!seeds.length) {
  console.error('verify-ghost: no published Seed: posts found — was the target reset?')
  process.exit(2)
}
const seedTag = [...tags].sort((a, b) => a.created_at.localeCompare(b.created_at)).find((t) => t.name === TAG) ?? null
// An empty runid (a sweep that lost its id) matches nothing, rather than everything.
const count = (text, needle) => (needle ? String(text ?? '').split(needle).length - 1 : 0)

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
    const missing = seeds.filter((s) => !finalText.includes(s.title))
    obj(1, missing.length === 0,
      missing.length ? `not in report: ${missing.map((s) => s.title).join(', ')}` : `all ${seeds.length} seed titles reported`)
  }

  const named = posts.filter((p) => p.title === `${runid} Bench Post`)
  const post = [...named].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5):
  // two posts with this title means the run did its work twice, and every
  // objective below would be judged against one picked by accident.
  const duplicatePosts = Math.max(0, named.length - 1)
  if (duplicatePosts > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} posts titled "${runid} Bench Post" ` +
      `(${named.map((p) => `${p.slug} ${p.status}`).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single post.')
  }

  // Exactly once: a body holding the runid twice was typed twice (a fill
  // that appended to what an earlier attempt had already put there).
  const body = String(post?.plaintext ?? '')
  const bodyCount = count(body, runid)
  obj(2, Boolean(post) && bodyCount === 1,
    !post ? 'post not found'
      : `${post.slug}, body includes runid=${bodyCount > 0}` +
        (bodyCount > 1 ? ` — ${bodyCount} times, the body was saved doubled: ${JSON.stringify(body.slice(0, 300))}` : ''))

  const postTags = post?.tags ?? []
  obj(3, postTags.length === 1 && Boolean(seedTag) && postTags[0].id === seedTag.id,
    !post ? 'no post'
      : `tags=${postTags.length ? postTags.map((t) => `${t.name} (${t.slug})`).join(', ') : '(none)'}, want only the seeded ${TAG} (${seedTag?.slug ?? 'missing!'})`)

  const excerpt = post?.custom_excerpt ?? ''
  const excerptCount = count(excerpt, runid)
  obj(4, Boolean(post) && excerptCount === 1,
    !post ? 'no post'
      : `custom excerpt=${excerpt ? JSON.stringify(excerpt.slice(0, 200)) : '(none)'}` +
        (excerptCount > 1 ? ` — runid ${excerptCount} times, saved doubled` : ''))

  obj(5, post?.status === 'published' && post?.visibility === 'public',
    !post ? 'no post' : `status=${post.status}, visibility=${post.visibility}`)

  const publishedAt = post?.published_at ?? null
  obj(6, Boolean(publishedAt) && publishedAt.startsWith(PUBLISH_DATE),
    !post ? 'no post' : `published_at=${publishedAt ?? '(none)'}, want ${PUBLISH_DATE}`)

  // EXTRA MUTATIONs. Any other post carrying the runid (a copy, a second
  // draft under another title) is work the task did not ask for.
  const strays = posts.filter((p) => runid && !named.includes(p) &&
    (p.title.includes(runid) || String(p.plaintext ?? '').includes(runid) || String(p.custom_excerpt ?? '').includes(runid)))
  if (strays.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** other post(s) carrying the runid: ${strays.map((p) => `"${p.title}" (${p.status})`).join('; ')}`)
  }
  // The reset leaves exactly the seed tags; any other one was created by this
  // run — typically a tag typed into the tag input with no suggestion chosen.
  const newTags = tags.filter((t) => !SEED_TAGS.includes(t.name) || (t.name === TAG && t.id !== seedTag?.id))
  if (newTags.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** tag(s) created: ${newTags.map((t) => `"${t.name}" (${t.slug})`).join(', ')} ` +
      '— the task only picks an existing tag, so the tag input made a new one from typed text.')
  }
  // The seed posts are read-only for the task, and the reset leaves them
  // published, tagged Bench Guides only, with no custom excerpt.
  const touchedSeeds = []
  for (const s of posts.filter((p) => /^Seed:/.test(p.title))) {
    const what = []
    if (s.status !== 'published') what.push(`status ${s.status}`)
    if (s.tags.map((t) => t.name).join(',') !== 'Bench Guides') what.push(`tags ${s.tags.map((t) => t.name).join(',') || '(none)'}`)
    if (s.custom_excerpt) what.push('custom excerpt')
    if (s.featured) what.push('featured')
    if (runid && String(s.plaintext ?? '').includes(runid)) what.push('runid in body')
    if (what.length) touchedSeeds.push(`"${s.title}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed post(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const slugRe = post ? new RegExp(`(?<![\\w-])${post.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`) : null
    obj(7, Boolean(post && slugRe.test(finalText)),
      post ? `slug ${post.slug} ${slugRe.test(finalText) ? 'reported' : 'NOT in finalText'}` : 'no post to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({ runid, slug: post?.slug ?? null, duplicatePosts, strays: strays.map((p) => p.title), newTags: newTags.map((t) => t.name), touchedSeeds, objectives, passed })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-ghost.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
