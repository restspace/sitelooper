#!/usr/bin/env node
/**
 * API oracle for the held-out BookStack target (notes/HELDOUT-PROTOCOL.md):
 * performs every objective of bench/tasks/bookstack-page-flow.md through
 * BookStack's REST API exactly as a perfect run would, then writes
 * bench/results/<runid>-oracle-result.json with a finalText carrying the
 * report-only values. It proves the verifier: on a reset app
 *
 *   node bench/oracle-bookstack.mjs <runid> && node bench/verify-bookstack.mjs <runid>   → all PASS
 *   node bench/verify-bookstack.mjs <another runid>                                       → all FAIL
 *
 * (the second only on a freshly reset app: the oracle's page is, correctly,
 * an extra page for any other runid). Never shown to the tools under test.
 *
 * Every objective goes through the REST API (BookStack 25.11+ has comment
 * endpoints): POST /api/pages creates the page in Bench Handbook with its
 * body and tag, PUT /api/pages/{id} with chapter_id MOVES it into Release
 * Notes (the API's move, which runs the same PageRepo::move as the Move
 * action), POST /api/comments adds the comment.
 *
 * Auth: the fixed token from bench/thirdparty/bookstack/seed.sh
 * (BOOKSTACK_API_TOKEN=<token_id>:<secret> overrides).
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8103/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const TOKEN = process.env.BOOKSTACK_API_TOKEN || 'benchbookstacktokenid00000000001:benchbookstacktokensecret0000001'

const runid = process.argv[2]
if (!runid) {
  console.error('usage: node bench/oracle-bookstack.mjs <runid>')
  process.exit(2)
}

async function api(method, route, body) {
  const res = await fetch(`${APP_URL}/api${route}`, {
    method,
    headers: {
      authorization: `Token ${TOKEN}`, accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
async function all(route) {
  const out = []
  for (let offset = 0; ; offset += 500) {
    const page = await api('GET', `${route}?count=500&offset=${offset}&sort=+id`)
    out.push(...page.data)
    if (page.data.length < 500 || out.length >= page.total) return out
  }
}

const books = await all('/books')
const handbook = books.filter((b) => b.name === 'Bench Handbook').sort((a, b) => a.id - b.id)[0]
if (!handbook) throw new Error('no book "Bench Handbook" — reset the target first')
const chapter = (await all('/chapters'))
  .filter((c) => c.book_id === handbook.id && c.name === 'Release Notes').sort((a, b) => a.id - b.id)[0]
if (!chapter) throw new Error('no chapter "Release Notes" in "Bench Handbook" — reset the target first')

// Objective 1: read the Seed: pages' names.
const seedNames = (await all('/pages'))
  .filter((p) => !p.draft && p.book_id === handbook.id && /^Seed:/.test(p.name))
  .map((p) => p.name)

// Objectives 2-4: the page, created in the book with its heading, paragraph and tag.
const tags = [{ name: 'Review Status', value: 'Approved' }]
const created = await api('POST', '/pages', {
  book_id: handbook.id,
  name: `${runid} Bench Page`,
  html: `<h2>Overview</h2><p>Bench page written for run ${runid}.</p>`,
  tags,
})
console.log(`created page ${created.id} "${created.name}" in ${handbook.name}`)

// Objective 5: move it into Release Notes (tags resent so an update can never drop them).
await api('PUT', `/pages/${created.id}`, { chapter_id: chapter.id, tags })
console.log(`moved page ${created.id} into chapter ${chapter.id} "${chapter.name}"`)

// Objective 6: one comment carrying the runid.
const comment = await api('POST', '/comments', { page_id: created.id, html: `<p>Reviewed in run ${runid}.</p>` })
console.log(`commented #${comment.id}`)

// Objective 7: the slug as stored now (a move can re-slug on a clash).
const page = await api('GET', `/pages/${created.id}`)

const finalText = [
  `1 DONE: ${seedNames.join(', ')}`,
  `2 DONE: page "${page.name}" with a paragraph carrying ${runid}`,
  `3 DONE: tag ${tags[0].name} = ${tags[0].value}`,
  '4 DONE: heading Overview',
  `5 DONE: chapter ${chapter.name} of ${handbook.name}`,
  `6 DONE: one comment "Reviewed in run ${runid}."`,
  `7 DONE: slug ${page.slug}`,
].join('\n')
fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `${runid}-oracle-result.json`)
fs.writeFileSync(file, JSON.stringify({ runid, target: 'bookstack', arm: 'oracle', finalText }, null, 2))
console.log(`wrote ${file}\n${finalText}`)
