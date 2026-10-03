#!/usr/bin/env node
/**
 * API oracle for the held-out Mealie target (notes/HELDOUT-PROTOCOL.md): performs
 * every objective of bench/tasks/mealie-recipe-flow.md through the REST API
 * exactly as a perfect run would, then writes bench/results/<runid>-oracle-result.json
 * with {"finalText": ...} carrying the report-only values (objectives 1 and 7).
 *
 *   node bench/reset-app.mjs --target mealie
 *   node bench/oracle-mealie.mjs <runid>
 *   node bench/verify-mealie.mjs <runid>          # must be all PASS
 *   node bench/verify-mealie.mjs <untouched-runid> # must be all FAIL
 *
 * It proves the verifier, not any tool, and is never shown to the tools.
 * It does the work the way the UI does: POST /api/recipes with the name (what
 * "create manually" posts), then one PUT of the whole recipe (what the
 * editor's Save sends), then POST /api/comments (the comment box's submit).
 */
import fs from 'node:fs'
import path from 'node:path'

const runid = process.argv[2]
if (!runid) {
  console.error('usage: node bench/oracle-mealie.mjs <runid>')
  process.exit(2)
}
const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8102/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'

let token = ''
async function call(method, route, body) {
  const res = await fetch(`${APP_URL}/api${route}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
async function all(route) {
  const items = []
  for (let page = 1; ; page++) {
    const r = await call('GET', `${route}${route.includes('?') ? '&' : '?'}page=${page}&perPage=100`)
    items.push(...(r.items ?? []))
    if (!r.items?.length || page >= (r.total_pages ?? 1)) return items
  }
}

const login = await fetch(`${APP_URL}/api/auth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({
    username: process.env.MEALIE_EMAIL || 'admin@bench.local',
    password: process.env.MEALIE_PASSWORD || 'bench-admin-pass',
  }),
})
if (!login.ok) throw new Error(`oracle-mealie: sign-in failed: HTTP ${login.status} — reset the target first`)
token = (await login.json()).access_token

const pick = (list, name, kind) => {
  const x = list.find((i) => i.name === name)
  if (!x) throw new Error(`oracle-mealie: seeded ${kind} "${name}" not found — reset the target first`)
  return x
}
const categories = await all('/organizers/categories')
const tags = await all('/organizers/tags')
const foods = await all('/foods')
const units = await all('/units')
const category = pick(categories, 'Bench Dinner', 'category')
const tag = pick(tags, 'Bench Quick', 'tag')

// Objective 1 (report-only): the Seed: recipes' names, read from the list.
const recipes = await all('/recipes')
const seedNames = recipes.filter((r) => /^Seed:/.test(r.name ?? '')).map((r) => r.name).sort()

// Objective 2: create the recipe by name. The response is the new slug (a JSON string).
const name = `${runid} Bench Recipe`
let slug = recipes.find((r) => r.name === name)?.slug
if (!slug) slug = await call('POST', '/recipes', { name })
const recipe = await call('GET', `/recipes/${encodeURIComponent(slug)}`)

// Objectives 2-5 in one save, the way the editor's Save sends the whole recipe.
const ingredient = (quantity, unitName, foodName) => ({
  quantity,
  unit: pick(units, unitName, 'unit'),
  food: pick(foods, foodName, 'food'),
  note: '',
  referencedRecipe: null,
  title: null,
  originalText: null,
  display: '',
})
const updated = {
  ...recipe,
  description: `Oracle recipe for run ${runid}.`,
  recipeCategory: [category],
  tags: [tag],
  recipeIngredient: [ingredient(2, 'Bench Cup', 'Bench Flour'), ingredient(3, 'Bench Spoon', 'Bench Butter')],
  recipeInstructions: [
    { title: '', summary: '', text: 'Whisk the flour and butter.', ingredientReferences: [] },
    { title: '', summary: '', text: `Bake until golden (${runid}).`, ingredientReferences: [] },
  ],
  recipeServings: 4,
}
delete updated.comments
await call('PUT', `/recipes/${encodeURIComponent(slug)}`, updated)

// Objective 6: one comment carrying the runid (skipped if one is already there).
const existing = await call('GET', `/recipes/${encodeURIComponent(slug)}/comments`)
if (!existing.some((c) => String(c.text).includes(runid))) {
  await call('POST', '/comments', { recipeId: recipe.id, text: `Oracle comment for ${runid}.` })
}

// Objective 7 (report-only): the slug as the recipe page's address shows it.
const after = await call('GET', `/recipes/${encodeURIComponent(slug)}`)
const groupSlug = (await call('GET', '/users/self')).groupSlug
const finalText = [
  `1 DONE seed recipes: ${seedNames.join('; ')}`,
  `2 DONE created "${after.name}", description: ${after.description}`,
  `3 DONE category ${after.recipeCategory.map((c) => c.name).join(', ')}; tag ${after.tags.map((t) => t.name).join(', ')}`,
  `4 DONE ingredients ${after.recipeIngredient.map((i) => `${i.quantity} ${i.unit?.name} ${i.food?.name}`).join('; ')}; steps ${after.recipeInstructions.map((s) => s.text).join(' / ')}`,
  `5 DONE servings ${after.recipeServings}`,
  `6 DONE comment posted`,
  `7 DONE slug ${after.slug} (${APP_URL}/g/${groupSlug}/r/${after.slug})`,
].join('\n')

fs.mkdirSync(OUT, { recursive: true })
const file = path.join(OUT, `${runid}-oracle-result.json`)
fs.writeFileSync(file, JSON.stringify({ runid, target: 'mealie', oracle: true, finalText }, null, 2))
console.log(finalText)
console.error(`[oracle-mealie] wrote ${file}`)
