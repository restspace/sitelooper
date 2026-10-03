/**
 * External verification of a benchmark run against BookStack's REST API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The BookStack
 * bites: the page body is a TinyMCE editor that autosaves a DRAFT page while
 * typing (a draft is not the page; only Save Page publishes it, and an
 * abandoned draft stays behind as its own record), tags are free-text
 * name/value pairs saved exactly as typed (there is no tag entity to pick, so
 * a near-miss name is simply a different tag), the page's place in the
 * hierarchy is set by the Move action or by where it was created, and the
 * same chapter name exists in a look-alike book.
 *
 *   obj 1  (report-only: the Seed: pages' names in Bench Handbook)       checked against finalText
 *   obj 2  a page "<runid> Bench Page" exists whose body carries the runid, not saved doubled
 *   obj 3  its only tag is Review Status = Approved (not Review State, not another value)
 *   obj 4  its body has a heading (h1-h6) "Overview"
 *   obj 5  it is in the chapter Release Notes of the book Bench Handbook
 *   obj 6  it has exactly one comment, which carries the runid, not saved doubled
 *   obj 7  (report-only: its URL slug)                                    checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: the fixed API token bench/thirdparty/bookstack/seed.sh installs for
 * the bench admin (BOOKSTACK_API_TOKEN=<token_id>:<secret> overrides). It is
 * the same user the task signs in as, so the API also lists that user's
 * unsaved draft pages, which is how abandoned drafts are seen.
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8103/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const TOKEN = process.env.BOOKSTACK_API_TOKEN || 'benchbookstacktokenid00000000001:benchbookstacktokensecret0000001'

// The seed bench/app-reset.mjs (resetBookstack) leaves; keep in step with it.
const BOOK = 'Bench Handbook'
const SEED_BOOKS = ['Bench Handbook', 'Bench Handbooks']
const SEED_CHAPTERS = [
  ['Bench Handbook', 'Release Notes'],
  ['Bench Handbook', 'Release Notes Archive'],
  ['Bench Handbooks', 'Release Notes'],
]
const CHAPTER = 'Release Notes'
const SEED_PAGES = [
  { name: 'Seed: Getting started', body: 'How a new member finds their way around.', tag: ['Review Status', 'Approved'] },
  { name: 'Seed: Release checklist', body: 'The steps every release goes through.', tag: ['Review Status', 'Draft'] },
  { name: 'Seed: House style', body: 'How we write here.', tag: ['Review State', 'Approved'] },
]
const TAG = ['Review Status', 'Approved']
const HEADING = 'Overview'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-bookstack.mjs <runid> [runid...]')
  process.exit(2)
}

async function api(route) {
  const res = await fetch(`${APP_URL}/api${route}`, {
    headers: { authorization: `Token ${TOKEN}`, accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return await res.json()
}
/** Every row of a listing endpoint (count is capped at 500 per request). */
async function all(route) {
  const out = []
  for (let offset = 0; ; offset += 500) {
    const page = await api(`${route}?count=500&offset=${offset}&sort=+id`)
    out.push(...page.data)
    if (page.data.length < 500 || out.length >= page.total) return out
  }
}

/** Visible text of stored HTML, one line per block. */
const text = (html) => String(html ?? '')
  .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/blockquote|\/pre|\/tr|\/td|\/th)\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
const headings = (html) => [...String(html ?? '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
  .map((m) => text(m[2]).replace(/\s+/g, ' ').trim())

// An empty runid (a sweep that lost its id) matches nothing, rather than everything.
const count = (t, needle) => (needle ? String(t ?? '').split(needle).length - 1 : 0)
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

// Ground truth, read once.
let books, chapters, pageRows, shelves, commentRows
try {
  books = await all('/books')
} catch (e) {
  console.error(`verify-bookstack: API refused: ${e.message} — was the target seeded (bench/thirdparty/bookstack/seed.sh)?`)
  process.exit(2)
}
chapters = await all('/chapters')
pageRows = await all('/pages')
shelves = await all('/shelves')
commentRows = await all('/comments')
// Full page records (html, tags, comment tree); the bench app holds a handful of pages.
const pages = []
for (const p of pageRows) pages.push(await api(`/pages/${p.id}`))
const bookTags = {}
for (const b of books) bookTags[b.id] = (await api(`/books/${b.id}`)).tags ?? []
const chapterTags = {}
for (const c of chapters) chapterTags[c.id] = (await api(`/chapters/${c.id}`)).tags ?? []

const bookByName = (name) => books.filter((b) => b.name === name).sort((a, b) => a.id - b.id)[0] ?? null
const handbook = bookByName(BOOK)
if (!handbook) {
  console.error(`verify-bookstack: no book "${BOOK}" — was the target reset?`)
  process.exit(2)
}
const bookName = (id) => books.find((b) => b.id === id)?.name ?? `book#${id}`
const chapterName = (id) => chapters.find((c) => c.id === id)?.name ?? `chapter#${id}`
const relChapter = chapters.filter((c) => c.book_id === handbook.id && c.name === CHAPTER).sort((a, b) => a.id - b.id)[0] ?? null
const seeds = pages.filter((p) => !p.draft && p.book_id === handbook.id && /^Seed:/.test(p.name))
if (!seeds.length) {
  console.error(`verify-bookstack: no Seed: pages in "${BOOK}" — was the target reset?`)
  process.exit(2)
}
/** Every comment in a page's tree (active and archived, replies included). */
const flatComments = (p) => {
  const out = []
  const walk = (nodes) => { for (const n of nodes ?? []) { out.push(n.comment); walk(n.children) } }
  walk(p?.comments?.active)
  walk(p?.comments?.archived)
  return out
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
    const missing = seeds.filter((s) => !finalText.includes(s.name))
    obj(1, missing.length === 0,
      missing.length ? `not in report: ${missing.map((s) => s.name).join(', ')}` : `all ${seeds.length} seed names reported`)
  }

  // Saved pages only: an unsaved draft is not the page (it is judged below as debris).
  const named = pages.filter((p) => !p.draft && p.name === `${runid} Bench Page`)
  const page = [...named].sort((a, b) => a.id - b.id)[0] ?? null

  // An extra created record FAILS, it does not warn: two pages with this name
  // means the run did its work twice, and every objective below would be
  // judged against one picked by accident.
  const duplicatePages = Math.max(0, named.length - 1)
  if (duplicatePages > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} pages named "${runid} Bench Page" ` +
      `(${named.map((p) => `${p.slug} in ${bookName(p.book_id)}`).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single page.')
  }

  const body = text(page?.html)
  const bodyDoubled = doubled(body)
  obj(2, Boolean(page) && count(body, runid) >= 1 && !bodyDoubled,
    !page ? 'page not found'
      : `${page.slug}, body includes runid=${count(body, runid) > 0}` +
        (bodyDoubled ? ` — the body was saved doubled: ${JSON.stringify(body.slice(0, 300))}` : ''))

  const tags = page?.tags ?? []
  obj(3, tags.length === 1 && tags[0].name === TAG[0] && tags[0].value === TAG[1],
    !page ? 'no page'
      : `tags=${tags.length ? tags.map((t) => `${JSON.stringify(t.name)}=${JSON.stringify(t.value)}`).join(', ') : '(none)'}, ` +
        `want only "${TAG[0]}"="${TAG[1]}"`)

  const hs = headings(page?.html)
  obj(4, hs.includes(HEADING),
    !page ? 'no page' : `headings=${hs.length ? hs.map((h) => JSON.stringify(h)).join(', ') : '(none)'}, want "${HEADING}"`)

  obj(5, Boolean(page && relChapter) && page.book_id === handbook.id && page.chapter_id === relChapter.id,
    !page ? 'no page'
      : `in book "${bookName(page.book_id)}" (id ${page.book_id}), chapter ${page.chapter_id ? `"${chapterName(page.chapter_id)}" (id ${page.chapter_id})` : '(none)'}; ` +
        `want "${CHAPTER}" (id ${relChapter?.id ?? 'missing!'}) of "${BOOK}" (id ${handbook.id})`)

  const comments = flatComments(page)
  const commentText = text(comments[0]?.html)
  obj(6, comments.length === 1 && count(commentText, runid) >= 1 && !doubled(commentText),
    !page ? 'no page'
      : `${comments.length} comment(s)` +
        (comments.length ? `: ${comments.map((c) => JSON.stringify(text(c.html).trim().slice(0, 150))).join(', ')}` : '') +
        (comments.length === 1 && doubled(commentText) ? ' — saved doubled' : ''))

  // EXTRA MUTATIONs. The reset leaves exactly the seed books, chapters and
  // pages, no shelves, no comments and no drafts.
  const extra = (what) => {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${what}`)
  }
  // Any other page (saved or an abandoned draft) is work the task did not ask for.
  const seedIds = new Set()
  for (const s of SEED_PAGES) {
    const p = pages.filter((x) => !x.draft && x.name === s.name && x.book_id === handbook.id).sort((a, b) => a.id - b.id)[0]
    if (p) seedIds.add(p.id)
  }
  const others = pages.filter((p) => !named.includes(p) && !seedIds.has(p.id))
  const strays = others.filter((p) => !p.draft)
  const drafts = others.filter((p) => p.draft)
  if (strays.length) {
    extra(`other page(s) saved: ${strays.map((p) => `"${p.name}" in ${bookName(p.book_id)}` +
      `${runid && (p.name.includes(runid) || text(p.html).includes(runid)) ? ' (carries the runid)' : ''}`).join('; ')}`)
  }
  if (drafts.length) {
    extra(`unsaved draft page(s) left behind: ${drafts.map((p) => `"${p.name}" (draft ${p.id} in ${bookName(p.book_id)})` +
      `${runid && (p.name.includes(runid) || text(p.html).includes(runid)) ? ' carrying the runid' : ''}`).join('; ')} ` +
      '— a page editor was opened for a new page that was never saved.')
  }
  // Books, chapters, shelves: exactly the seed set, untagged.
  const keptBooks = SEED_BOOKS.map(bookByName).filter(Boolean)
  const newBooks = books.filter((b) => !keptBooks.includes(b))
  if (newBooks.length) extra(`book(s) created: ${newBooks.map((b) => `"${b.name}"`).join(', ')}`)
  const missingBooks = SEED_BOOKS.filter((n) => !bookByName(n))
  if (missingBooks.length) extra(`seed book(s) gone (renamed or deleted): ${missingBooks.join(', ')}`)
  for (const b of keptBooks) if (bookTags[b.id].length) extra(`seed book "${b.name}" was tagged`)
  const keptChapters = []
  for (const [bn, cn] of SEED_CHAPTERS) {
    const b = bookByName(bn)
    const c = b && chapters.filter((x) => x.book_id === b.id && x.name === cn).sort((x, y) => x.id - y.id)[0]
    if (c) keptChapters.push(c)
    else extra(`seed chapter "${cn}" of "${bn}" gone (renamed, moved or deleted)`)
  }
  const newChapters = chapters.filter((c) => !keptChapters.includes(c))
  if (newChapters.length) extra(`chapter(s) created: ${newChapters.map((c) => `"${c.name}" in ${bookName(c.book_id)}`).join(', ')}`)
  for (const c of keptChapters) if (chapterTags[c.id].length) extra(`seed chapter "${c.name}" of ${bookName(c.book_id)} was tagged`)
  if (shelves.length) extra(`shelf/shelves created: ${shelves.map((s) => `"${s.name}"`).join(', ')}`)
  // Comments anywhere but the run's page.
  const strayComments = commentRows.filter((c) => !(page && c.commentable_type === 'page' && c.commentable_id === page.id))
  if (strayComments.length) {
    extra(`comment(s) on other records: ${strayComments.map((c) => {
      const on = pages.find((p) => p.id === c.commentable_id)
      return `#${c.id} on ${c.commentable_type} ${on ? `"${on.name}"` : c.commentable_id}`
    }).join(', ')}`)
  }
  // The seed pages are read-only for the task, and the reset leaves each one
  // saved once, directly in Bench Handbook, with its one tag, body and no comments.
  const touchedSeeds = []
  for (const s of SEED_PAGES) {
    const p = pages.find((x) => seedIds.has(x.id) && x.name === s.name)
    if (!p) { touchedSeeds.push(`"${s.name}" (gone: renamed, moved to another book or deleted)`); continue }
    const what = []
    if (p.chapter_id) what.push(`moved into chapter "${chapterName(p.chapter_id)}"`)
    if (p.revision_count !== 1) what.push(`revision_count ${p.revision_count}`)
    if (p.template) what.push('made a template')
    if ((p.tags ?? []).map((t) => `${t.name}=${t.value}`).join(',') !== `${s.tag[0]}=${s.tag[1]}`) {
      what.push(`tags ${(p.tags ?? []).map((t) => `${t.name}=${t.value}`).join(',') || '(none)'}`)
    }
    if (paras(text(p.html)).join('\n') !== s.body) what.push('body changed')
    if (flatComments(p).length) what.push(`${flatComments(p).length} comment(s)`)
    if (what.length) touchedSeeds.push(`"${s.name}" (${what.join(', ')})`)
  }
  if (touchedSeeds.length) {
    extra(`seed page(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const slugRe = page ? new RegExp(`(?<![\\w-])${page.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`) : null
    obj(7, Boolean(page && slugRe.test(finalText)),
      page ? `slug ${page.slug} ${slugRe.test(finalText) ? 'reported' : 'NOT in finalText'}` : 'no page to report')
  }

  objectives.sort((a, b) => a.n - b.n)
  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({
    runid, slug: page?.slug ?? null, duplicatePages,
    strays: strays.map((p) => p.name), drafts: drafts.map((p) => p.id),
    newBooks: newBooks.map((b) => b.name), newChapters: newChapters.map((c) => c.name),
    strayComments: strayComments.map((c) => c.id), touchedSeeds, objectives, passed,
  })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-bookstack.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
