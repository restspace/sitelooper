/**
 * External verification of a benchmark run against Mealie's REST API.
 * Same contract as the other verify scripts: success is judged from what the
 * app actually persisted, never from the agent's final report. The Mealie
 * bites: the recipe editor persists nothing until its Save button is pressed,
 * the category / tag / unit / food autocompletes CREATE a new entry from typed
 * text unless an existing one is chosen (decoys Bench Dinner Party, Bench
 * Quickfire and Bench Flour Blend sit next to the wanted ones), a new recipe
 * starts with a placeholder ingredient and step, and comments are posted on
 * their own, outside the editor's Save.
 *
 *   obj 1  (report-only: the Seed: recipes' names)                      checked against finalText
 *   obj 2  a recipe "<runid> Bench Recipe" exists whose description carries the runid, not saved doubled
 *   obj 3  its only category is the seeded Bench Dinner and its only tag the seeded Bench Quick
 *   obj 4  ingredients exactly [2 Bench Cup Bench Flour, 3 Bench Spoon Bench Butter], no notes;
 *          instructions exactly ["Whisk the flour and butter.", "Bake until golden (<runid>)."]
 *   obj 5  servings 4
 *   obj 6  exactly one comment on it, carrying the runid, not saved doubled
 *   obj 7  (report-only: its slug)                                      checked against finalText
 *
 * Report-only objectives are checked against the run's recorded finalText when
 * the result file is present, else a flow replay's flowrun summaries and
 * values, and reported UNVERIFIABLE when neither is.
 *
 * Auth: a bearer token from POST /api/auth/token (form-encoded) as the admin
 * bench/app-reset.mjs sets up (MEALIE_EMAIL / MEALIE_PASSWORD override).
 */
import fs from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8102/').replace(/\/$/, '')
const OUT = process.env.BENCH_OUT || 'bench/results'
const CATEGORY = 'Bench Dinner'
const TAG = 'Bench Quick'
// The seed set bench/app-reset.mjs (resetMealie) leaves behind; keep in step with it.
const SEED_CATEGORIES = ['Bench Dinner', 'Bench Dinner Party', 'Bench Lunch']
const SEED_TAGS = ['Bench Quick', 'Bench Quickfire', 'Bench Classic']
const SEED_FOODS = ['Bench Flour', 'Bench Flour Blend', 'Bench Butter']
const SEED_UNITS = ['Bench Cup', 'Bench Spoon']
const SEED_RECIPES = [
  { name: 'Seed: Bench Pancakes', description: 'Weekend pancakes for the bench.', ingredients: ['2 eggs', '1 cup milk'], steps: ['Whisk everything together.', 'Fry in a hot pan.'], servings: 2 },
  { name: 'Seed: Tomato Soup', description: 'A simple soup.', ingredients: ['6 tomatoes', '1 onion'], steps: ['Simmer the tomatoes and onion.', 'Blend until smooth.'], servings: 4 },
  { name: 'Seed: Garden Salad', description: 'Leaves and dressing.', ingredients: ['1 lettuce', '2 tbsp dressing'], steps: ['Wash the leaves.', 'Toss with the dressing.'], servings: 2 },
]
const SEED_RECIPE_CATEGORY = 'Bench Lunch'
const SEED_RECIPE_TAG = 'Bench Classic'

const runids = process.argv.slice(2)
if (!runids.length) {
  console.error('usage: node bench/verify-mealie.mjs <runid> [runid...]')
  process.exit(2)
}

let token = ''
async function api(route) {
  const res = await fetch(`${APP_URL}/api${route}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return await res.json()
}
/** Every item of a paginated list endpoint. */
async function all(route) {
  const items = []
  for (let page = 1; ; page++) {
    const r = await api(`${route}${route.includes('?') ? '&' : '?'}page=${page}&perPage=100`)
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
if (!login.ok) {
  console.error(`verify-mealie: sign-in failed: HTTP ${login.status} — was the target reset (which sets up the admin)?`)
  process.exit(2)
}
token = (await login.json()).access_token

// Ground truth, read once: every recipe (summary, then the full record of the
// ones judged), every organizer, food, unit and comment.
const summaries = await all('/recipes')
const categories = await all('/organizers/categories')
const tags = await all('/organizers/tags')
const tools = await all('/organizers/tools')
const foods = await all('/foods')
const units = await all('/units')
const comments = await all('/comments')
const full = new Map()
const getRecipe = async (slug) => {
  if (!full.has(slug)) full.set(slug, await api(`/recipes/${encodeURIComponent(slug)}`))
  return full.get(slug)
}
const commentsOf = (recipeId) => comments.filter((c) => c.recipeId === recipeId)

const seedSummaries = summaries.filter((r) => /^Seed:/.test(r.name ?? ''))
if (!seedSummaries.length) {
  console.error('verify-mealie: no Seed: recipes found — was the target reset?')
  process.exit(2)
}
const firstNamed = (list, name) => list.find((x) => x.name === name) ?? null
const seedCategory = firstNamed(categories, CATEGORY)
const seedTag = firstNamed(tags, TAG)
const food = (name) => firstNamed(foods, name)
const unit = (name) => firstNamed(units, name)

// An empty runid (a sweep that lost its id) matches nothing, rather than everything.
const count = (text, needle) => (needle ? String(text ?? '').split(needle).length - 1 : 0)
// Saved doubled = the same text twice over: a repeated paragraph, or one paragraph
// that is some text followed by itself (as verify-ghost.mjs).
const paras = (t) => String(t ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
const selfRepeat = (p) => {
  for (let i = 1; i < p.length; i++) {
    const a = p.slice(0, i).trim(), b = p.slice(i).trim()
    if (a.length >= 4 && a === b) return true
  }
  return false
}
const doubled = (t) => { const ps = paras(t); return new Set(ps).size < ps.length || ps.some(selfRepeat) }
const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
const ids = (list) => (list ?? []).map((x) => x.id)
const sameIds = (list, want) => JSON.stringify(ids(list)) === JSON.stringify(want)

// Seeds as the reset leaves them: judged once, the same for every runid.
const touchedSeeds = []
for (const s of SEED_RECIPES) {
  const found = summaries.filter((r) => r.name === s.name)
  if (!found.length) { touchedSeeds.push(`"${s.name}" (missing)`); continue }
  if (found.length > 1) touchedSeeds.push(`"${s.name}" (${found.length} copies)`)
  const r = await getRecipe(found[0].slug)
  const what = []
  if (norm(r.description) !== s.description) what.push('description')
  if (!sameIds(r.recipeCategory, [firstNamed(categories, SEED_RECIPE_CATEGORY)?.id])) what.push(`categories ${(r.recipeCategory ?? []).map((c) => c.name).join(',') || '(none)'}`)
  if (!sameIds(r.tags, [firstNamed(tags, SEED_RECIPE_TAG)?.id])) what.push(`tags ${(r.tags ?? []).map((t) => t.name).join(',') || '(none)'}`)
  if ((r.tools ?? []).length) what.push('tools')
  const ing = r.recipeIngredient ?? []
  if (ing.length !== s.ingredients.length || ing.some((i, k) => norm(i.note) !== s.ingredients[k] || i.food || i.unit || Number(i.quantity || 0) !== 0)) what.push('ingredients')
  const steps = r.recipeInstructions ?? []
  if (steps.length !== s.steps.length || steps.some((st, k) => norm(st.text) !== s.steps[k])) what.push('instructions')
  if (Number(r.recipeServings) !== s.servings) what.push(`servings ${r.recipeServings}`)
  if (commentsOf(r.id).length) what.push(`${commentsOf(r.id).length} comment(s)`)
  if (what.length) touchedSeeds.push(`"${s.name}" (${what.join(', ')})`)
}
for (const r of seedSummaries) {
  if (!SEED_RECIPES.some((s) => s.name === r.name)) touchedSeeds.push(`"${r.name}" (not a seed: created with a Seed: name)`)
}

// The reset leaves exactly the seed organizers, foods and units; any other one
// was created since — typically text typed into an autocomplete with no
// suggestion chosen.
const extras = (list, keep) => list.filter((x) => !keep.includes(x.name) || firstNamed(list, x.name) !== x)
const newCategories = extras(categories, SEED_CATEGORIES)
const newTags = extras(tags, SEED_TAGS)
const newTools = tools
const newFoods = extras(foods, SEED_FOODS)
const newUnits = extras(units, SEED_UNITS)

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
    const missing = seedSummaries.filter((s) => !finalText.includes(s.name))
    obj(1, missing.length === 0,
      missing.length ? `not in report: ${missing.map((s) => s.name).join(', ')}` : `all ${seedSummaries.length} seed names reported`)
  }

  const title = `${runid} Bench Recipe`
  const named = summaries.filter((r) => norm(r.name) === title)
  named.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
  const recipe = named.length ? await getRecipe(named[0].slug) : null

  // An extra created record FAILS, it does not warn (PLAN-provenance phase 5).
  const duplicateRecipes = Math.max(0, named.length - 1)
  if (duplicateRecipes > 0) {
    anyFailure = true
    console.log(`  *** DUPLICATE WORK *** ${named.length} recipes named "${title}" ` +
      `(${named.map((r) => r.slug).join(', ')}) — the run created it more than once, ` +
      'so objectives 2-7 cannot be attributed to any single recipe.')
  }

  const description = String(recipe?.description ?? '')
  const descDoubled = doubled(description)
  obj(2, Boolean(recipe) && count(description, runid) >= 1 && !descDoubled,
    !recipe ? 'recipe not found'
      : `${recipe.slug}, description=${JSON.stringify(description.slice(0, 200))}` +
        (descDoubled ? ' — saved doubled' : ''))

  const cats = recipe?.recipeCategory ?? []
  const rtags = recipe?.tags ?? []
  obj(3, Boolean(recipe && seedCategory && seedTag) && sameIds(cats, [seedCategory.id]) && sameIds(rtags, [seedTag.id]),
    !recipe ? 'no recipe'
      : `categories=${cats.map((c) => `${c.name} (${c.slug})`).join(', ') || '(none)'}; ` +
        `tags=${rtags.map((t) => `${t.name} (${t.slug})`).join(', ') || '(none)'}; ` +
        `want only the seeded ${CATEGORY} (${seedCategory?.slug ?? 'missing!'}) and ${TAG} (${seedTag?.slug ?? 'missing!'})`)

  const WANT_ING = [[2, 'Bench Cup', 'Bench Flour'], [3, 'Bench Spoon', 'Bench Butter']]
  const WANT_STEPS = ['Whisk the flour and butter.', `Bake until golden (${runid}).`]
  const ing = recipe?.recipeIngredient ?? []
  const steps = recipe?.recipeInstructions ?? []
  const ingOk = ing.length === WANT_ING.length && WANT_ING.every(([q, u, f], k) =>
    Number(ing[k].quantity) === q && Boolean(unit(u)) && ing[k].unit?.id === unit(u).id &&
    Boolean(food(f)) && ing[k].food?.id === food(f).id && !norm(ing[k].note) && !ing[k].referencedRecipe)
  const stepsOk = Boolean(runid) && steps.length === WANT_STEPS.length && WANT_STEPS.every((t, k) => norm(steps[k].text) === t)
  const showIng = (i) => `${i.quantity ?? ''} ${i.unit?.name ?? '-'} ${i.food?.name ?? '-'}${norm(i.note) ? ` note=${JSON.stringify(norm(i.note))}` : ''}`.trim()
  obj(4, Boolean(recipe) && ingOk && stepsOk,
    !recipe ? 'no recipe'
      : `ingredients=[${ing.map(showIng).join(' | ')}]${ingOk ? '' : ' (WRONG)'}; ` +
        `steps=${JSON.stringify(steps.map((s) => norm(s.text)))}${stepsOk ? '' : ' (WRONG)'}`)

  obj(5, Boolean(recipe) && Number(recipe.recipeServings) === 4,
    !recipe ? 'no recipe' : `servings=${recipe.recipeServings}, want 4`)

  const own = recipe ? commentsOf(recipe.id) : []
  obj(6, own.length === 1 && count(own[0].text, runid) >= 1 && !doubled(own[0].text),
    !recipe ? 'no recipe'
      : `${own.length} comment(s): ${own.map((c) => JSON.stringify(String(c.text).slice(0, 120))).join('; ') || '(none)'}` +
        (own.length === 1 && doubled(own[0].text) ? ' — saved doubled' : ''))

  // EXTRA MUTATIONs. Any other recipe carrying the runid (a copy, a second
  // try under another name), or any recipe no task names, is work not asked for.
  const strays = summaries.filter((r) => !named.includes(r) && !/^Seed:/.test(r.name ?? '') &&
    ((runid && (String(r.name).includes(runid) || String(r.description ?? '').includes(runid))) || !/ Bench Recipe$/.test(norm(r.name))))
  if (strays.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** other recipe(s) created: ${strays.map((r) => `"${r.name}" (${r.slug})`).join('; ')}`)
  }
  const strayComments = comments.filter((c) => runid && c.recipeId !== recipe?.id && String(c.text).includes(runid))
  if (strayComments.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** comment(s) carrying the runid on other recipes: ${strayComments.map((c) => JSON.stringify(String(c.text).slice(0, 80))).join('; ')}`)
  }
  for (const [kind, list] of [['categor(y/ies)', newCategories], ['tag(s)', newTags], ['tool(s)', newTools], ['food(s)', newFoods], ['unit(s)', newUnits]]) {
    if (!list.length) continue
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** ${kind} created: ${list.map((x) => `"${x.name}"`).join(', ')} ` +
      '— the task only picks existing entries, so an autocomplete made a new one from typed text.')
  }
  if (touchedSeeds.length) {
    anyFailure = true
    console.log(`  *** EXTRA MUTATION *** seed recipe(s) modified: ${touchedSeeds.join('; ')} ` +
      '— the task only reads them, so the run changed a record it was told to leave alone.')
  }

  if (finalText === null) {
    objectives.push({ n: 7, pass: 'UNVERIFIABLE', detail: 'no result file with finalText found' })
  } else {
    const slugRe = recipe ? new RegExp(`(?<![\\w-])${recipe.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`) : null
    obj(7, Boolean(recipe && slugRe.test(finalText)),
      recipe ? `slug ${recipe.slug} ${slugRe.test(finalText) ? 'reported' : 'NOT in finalText'}` : 'no recipe to report')
  }

  const passed = objectives.filter((o) => o.pass === true).length
  console.log(`\n${runid}: objectives passed ${passed}/${objectives.length}`)
  for (const o of objectives) console.log(`  obj ${o.n}: ${o.pass === true ? 'PASS' : o.pass === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL'} — ${o.detail}`)
  report.push({
    runid, slug: recipe?.slug ?? null, duplicateRecipes,
    strays: strays.map((r) => r.name), strayComments: strayComments.map((c) => c.text),
    newCategories: newCategories.map((x) => x.name), newTags: newTags.map((x) => x.name), newTools: newTools.map((x) => x.name),
    newFoods: newFoods.map((x) => x.name), newUnits: newUnits.map((x) => x.name),
    touchedSeeds, objectives, passed,
  })
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'verify-mealie.json'), JSON.stringify(report, null, 2))
process.exitCode = anyFailure ? 1 : 0
