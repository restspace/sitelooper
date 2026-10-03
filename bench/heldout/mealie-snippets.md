# Mealie (ml) — snippets to splice into the shared bench files

Held-out target (notes/HELDOUT-PROTOCOL.md). Files owned by this target and already in place:

- `bench/thirdparty/mealie/docker-compose.yml` (image `ghcr.io/mealie-recipes/mealie:v3.28.0`, port 8102 → 9000; no seed.sh)
- `bench/tasks/mealie-recipe-flow.md`
- `bench/verify-mealie.mjs`
- `bench/oracle-mealie.mjs`

Infrastructure proof before any tool runs (on the first cloud box):

    node bench/reset-app.mjs --target mealie
    node bench/oracle-mealie.mjs mloracle1 && node bench/verify-mealie.mjs mloracle1   # all PASS, exit 0
    node bench/reset-app.mjs --target mealie
    node bench/verify-mealie.mjs mlblank1                                              # all FAIL (1 and 7 UNVERIFIABLE), exit 1
    node bench/reset-app.mjs --target mealie && node bench/reset-app.mjs --target mealie  # idempotent: second pass deletes/creates nothing

## (a) bench/app-reset.mjs — the reset function

Insert after `resetErpnext` (before `function resetAtelyr()`):

```js
/**
 * Mealie reset doubles as the SEED, as kanboard's does. On a fresh install the
 * image has made the default admin changeme@example.com / MyPassword (not
 * settable through env); the first reset signs in as that, changes the email,
 * username and name through PUT /api/users/{id} (what the /admin/setup wizard
 * sends — and a user with the default email is what makes that wizard show),
 * then the password through PUT /api/users/password, and signs in again as
 * admin@bench.local / bench-admin-pass. Then, every time:
 *
 * - categories "Bench Dinner", look-alike "Bench Dinner Party" and "Bench
 *   Lunch"; tags "Bench Quick", look-alike "Bench Quickfire" and "Bench
 *   Classic"; foods "Bench Flour", look-alike "Bench Flour Blend" and "Bench
 *   Butter"; units "Bench Cup" and "Bench Spoon". Every OTHER category, tag,
 *   tool, food and unit is DELETED (the autocompletes create one from typed
 *   text on Enter, so a run can leave "Bench Dinne" behind), as is a second
 *   entry of a seed name.
 * - exactly three "Seed: ..." recipes (category Bench Lunch, tag Bench
 *   Classic, note-only ingredients, two steps, set servings, no comments).
 *   Every other recipe (earlier runs' "<runid> Bench Recipe"s, a "New Recipe"
 *   left by an abandoned create) is DELETED with its comments; a seed recipe a
 *   wayward run touched is deleted and re-created rather than patched.
 * - household preference "disable comments on new recipes" off.
 *
 * Everything goes through /api with a bearer token from POST /api/auth/token.
 */
async function resetMealie() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8102/').replace(/\/$/, '');
  const email = process.env.MEALIE_EMAIL || 'admin@bench.local';
  const password = process.env.MEALIE_PASSWORD || 'bench-admin-pass';
  let token = '';
  const call = async (method, route, body) => {
    const res = await fetch(`${base}/api${route}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`mealie ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text && /json/.test(res.headers.get('content-type') ?? '') ? JSON.parse(text) : null;
  };
  const all = async (route) => {
    const items = [];
    for (let page = 1; ; page++) {
      const r = await call('GET', `${route}${route.includes('?') ? '&' : '?'}page=${page}&perPage=100`);
      items.push(...(r.items ?? []));
      if (!r.items?.length || page >= (r.total_pages ?? 1)) return items;
    }
  };
  const signIn = async (username, pass) => {
    const res = await fetch(`${base}/api/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ username, password: pass }),
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`mealie: sign-in as ${username} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).access_token;
  };

  // The admin. Try the bench account first, so a set-up box never sends the
  // default password (each wrong one counts towards the lockout).
  token = await signIn(email, password);
  if (!token) {
    token = await signIn('changeme@example.com', 'MyPassword');
    if (!token) throw new Error(`mealie: neither ${email} nor the default admin can sign in — is the stack up, or was the admin changed by hand?`);
    const self = await call('GET', '/users/self');
    await call('PUT', `/users/${self.id}`, { ...self, email, username: 'admin', fullName: 'Bench Admin' });
    await call('PUT', '/users/password', { currentPassword: 'MyPassword', newPassword: password });
    token = await signIn(email, password);
    if (!token) throw new Error(`mealie: changed the default admin to ${email} but cannot sign in with the new password`);
    log(`mealie: set up the admin "${email}" (was changeme@example.com)`);
  }
  // A run that mistyped the password must not leave the next one locked out.
  await call('POST', '/admin/users/unlock?force=true');

  // Comments must be on for new recipes (the household default; a run could change it).
  try {
    const prefs = await call('GET', '/households/preferences');
    if (prefs.recipeDisableComments) {
      await call('PUT', '/households/preferences', { ...prefs, recipeDisableComments: false });
      log('mealie: turned comments back on for new recipes');
    }
  } catch (e) {
    log(`mealie: WARNING could not check household preferences: ${e.message}`);
  }

  // Organizers, foods and units: keep the first entry of each seed name, create
  // the missing ones now (seed recipes below need their ids), delete the rest
  // AFTER the recipes that may still use them are gone.
  const POOLS = [
    { kind: 'category', route: '/organizers/categories', names: ['Bench Dinner', 'Bench Dinner Party', 'Bench Lunch'] },
    { kind: 'tag', route: '/organizers/tags', names: ['Bench Quick', 'Bench Quickfire', 'Bench Classic'] },
    { kind: 'tool', route: '/organizers/tools', names: [] },
    { kind: 'food', route: '/foods', names: ['Bench Flour', 'Bench Flour Blend', 'Bench Butter'] },
    { kind: 'unit', route: '/units', names: ['Bench Cup', 'Bench Spoon'] },
  ];
  const kept = {};
  for (const p of POOLS) {
    p.doomed = [];
    kept[p.kind] = {};
    for (const x of await all(p.route)) {
      if (p.names.includes(x.name) && !kept[p.kind][x.name]) kept[p.kind][x.name] = x;
      else p.doomed.push(x);
    }
    const missing = p.names.filter((name) => !kept[p.kind][name]);
    for (const name of missing) {
      await call('POST', p.route, { name });
      log(`mealie: seeded ${p.kind} "${name}"`);
    }
    // Read the created ones back from the list, so each kept entry has the
    // same shape (id, name, slug, ...) whatever the POST answered.
    if (missing.length) {
      const fresh = await all(p.route);
      for (const name of missing) {
        kept[p.kind][name] = fresh.find((x) => x.name === name);
        if (!kept[p.kind][name]) throw new Error(`mealie: seeded ${p.kind} "${name}" is not in ${p.route}`);
      }
    }
  }

  // Recipes: exactly the seed set, each as seeded.
  const SEED = [
    { name: 'Seed: Bench Pancakes', description: 'Weekend pancakes for the bench.', ingredients: ['2 eggs', '1 cup milk'], steps: ['Whisk everything together.', 'Fry in a hot pan.'], servings: 2 },
    { name: 'Seed: Tomato Soup', description: 'A simple soup.', ingredients: ['6 tomatoes', '1 onion'], steps: ['Simmer the tomatoes and onion.', 'Blend until smooth.'], servings: 4 },
    { name: 'Seed: Garden Salad', description: 'Leaves and dressing.', ingredients: ['1 lettuce', '2 tbsp dressing'], steps: ['Wash the leaves.', 'Toss with the dressing.'], servings: 2 },
  ];
  const seedCategory = kept.category['Bench Lunch'];
  const seedTag = kept.tag['Bench Classic'];
  const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const recipes = (await all('/recipes')).sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  let removed = 0;
  for (const summary of recipes) {
    const s = SEED.find((x) => x.name === summary.name && !x.kept);
    const comments = await call('GET', `/recipes/${encodeURIComponent(summary.slug)}/comments`);
    let pristine = false;
    if (s && !comments.length) {
      const r = await call('GET', `/recipes/${encodeURIComponent(summary.slug)}`);
      const ing = r.recipeIngredient ?? [];
      const steps = r.recipeInstructions ?? [];
      pristine = norm(r.description) === s.description && Number(r.recipeServings) === s.servings &&
        (r.recipeCategory ?? []).map((c) => c.id).join() === seedCategory.id &&
        (r.tags ?? []).map((t) => t.id).join() === seedTag.id && !(r.tools ?? []).length &&
        ing.length === s.ingredients.length &&
        ing.every((i, k) => norm(i.note) === s.ingredients[k] && !i.food && !i.unit && !Number(i.quantity || 0)) &&
        steps.length === s.steps.length && steps.every((st, k) => norm(st.text) === s.steps[k]);
    }
    if (pristine) { s.kept = true; continue; }
    for (const c of comments) await call('DELETE', `/comments/${c.id}`);
    await call('DELETE', `/recipes/${encodeURIComponent(summary.slug)}`);
    removed++;
  }
  log(removed ? `mealie: deleted ${removed} recipe(s) (earlier runs' and non-seed)` : 'mealie: no recipes to delete');

  for (const p of POOLS) {
    for (const x of p.doomed) {
      await call('DELETE', `${p.route}/${x.id}`);
      log(`mealie: deleted ${p.kind} "${x.name}"`);
    }
  }

  for (const s of SEED) {
    if (s.kept) continue;
    const slug = await call('POST', '/recipes', { name: s.name });
    const r = await call('GET', `/recipes/${encodeURIComponent(slug)}`);
    delete r.comments;
    await call('PUT', `/recipes/${encodeURIComponent(slug)}`, {
      ...r,
      description: s.description,
      recipeServings: s.servings,
      recipeCategory: [seedCategory],
      tags: [seedTag],
      tools: [],
      recipeIngredient: s.ingredients.map((note) => ({ quantity: 0, unit: null, food: null, note, display: '', referencedRecipe: null })),
      recipeInstructions: s.steps.map((text) => ({ title: '', summary: '', text, ingredientReferences: [] })),
    });
    log(`mealie: seeded recipe "${s.name}" (${slug})`);
  }
}
```

And the RESETS entry (after `erpnext: resetErpnext,`):

```js
  mealie: resetMealie,
```

## (b) bench/app-defaults.mjs — APP_DEFAULTS entry

After the `erpnext` entry:

```js
  // resetMealie changes the image's default admin (changeme@example.com /
  // MyPassword) to this one through the API, which also retires the first-login
  // setup wizard. Mealie signs in by email or username.
  mealie: {
    APP_URL: 'http://127.0.0.1:8102/',
    APP_EMAIL: 'admin@bench.local',
    APP_PASSWORD: 'bench-admin-pass',
  },
```

## (c) bench/harness.mjs — TARGETS entry

After the `erpnext` entry (~line 186):

```js
  mealie: {
    task: 'tasks/mealie-recipe-flow.md',
    defaults: APP_DEFAULTS.mealie,
    // Reset is also the idempotent seed (and the admin setup) — see resetMealie.
    reset: () => resetTarget('mealie'),
    notReadyHint: 'Start it with: docker compose -f bench/thirdparty/mealie/docker-compose.yml up -d',
  },
```

## (d) bench/cloud-setup.sh — case block

After the `erpnext)` case's `;;` (before `esac`):

```bash
    mealie)
      # One container (FastAPI + the built Nuxt frontend, SQLite); first boot
      # migrates in ~20-40s warm, allow five minutes on a cold box.
      # /api/app/about answers 200 unauthenticated once the API is up.
      for _ in $(seq 1 150); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8102/api/app/about || true)"
        [ "$code" = "200" ] && break; sleep 2
      done
      echo "    mealie api about: HTTP ${code:-unreachable}"
      [ "$code" = "200" ] || { docker compose -f bench/thirdparty/mealie/docker-compose.yml logs --tail 40 || true; die "mealie does not answer /api/app/about"; }
      # No seed.sh: the reset changes the default admin to admin@bench.local on
      # first use, and is the idempotent seed for everything else, as for kanboard.
      node bench/reset-app.mjs --target mealie
      # Readiness probe: the frontend's sign-in page.
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8102/login || true)"
      echo "    mealie login page: HTTP ${code:-unreachable}"
      ;;
```

## (e) bench/thirdparty/README.md — table row

After the ERPNext row:

```markdown
| Mealie 3.28 | 8102 | Nuxt 3 + Vuetify 3 SPA over FastAPI; **recipe editor that persists only on its Save button**; autocompletes for category, tag, unit and food that create a new entry from typed text on Enter; add/remove ingredient and step lists; comments posted outside the editor; name-derived slugs at /g/home/r/&lt;slug&gt; | admin@bench.local / bench-admin-pass |
```

(If `bench/fixed-instructions.mjs` REF_SHAPE needs an entry for minted ids, Mealie mints none the task reports — the slug is name-derived — so no entry is proposed.)

## UNVERIFIED (nothing could be run here; the first box's oracle run tests these)

1. `ghcr.io/mealie-recipes/mealie:v3.28.0` pulls (tag listed on the GitHub package page and as release v3.28.0, 2026-09-24); the frontend and API are both served on container port 9000 and data lives in `/app/data`.
2. The source and OpenAPI read were v3.28.0 source files plus the demo's `nightly` OpenAPI; endpoint shapes assumed identical in v3.28.0: `POST /api/auth/token` (form `username`/`password`, JSON `access_token`), `GET /api/users/self`, `PUT /api/users/{id}`, `PUT /api/users/password` (`currentPassword`/`newPassword`), `POST /api/admin/users/unlock?force=true`, `GET/PUT /api/households/preferences`, `/api/organizers/{categories,tags,tools}`, `/api/foods`, `/api/units`, `/api/recipes` (POST returns the slug as a JSON string), `GET /api/recipes/{slug}/comments`, `/api/comments`.
3. Paginated lists answer `{items, total_pages}` with `page`/`perPage` query params, and `perPage=100` is accepted.
4. Changing the default admin: PUT /api/users/{id} with the /users/self body plus a new email/username/fullName is allowed for an admin editing itself (permission fields unchanged), and the old token still works for the following PUT /api/users/password (the setup wizard does it in this order). A password change invalidating the session is assumed, hence the fresh sign-in.
5. The image runs with PRODUCTION=true, so no dev users (jason, bob, ...) exist; harmless if they do.
6. A full-object PUT /api/recipes/{slug} with organizer objects `{id, name, slug, ...}` and ingredient `unit`/`food` objects taken from the list endpoints links the existing entries (no new ones), and extra fields in the body (createdAt, updatedAt, householdsWithIngredientFood, ...) are ignored.
7. An ingredient sent with `quantity: 0, note: '...'` reads back with quantity 0 or null (the pristine check accepts both) and `food`/`unit` null.
8. Deleting a recipe after deleting its comments succeeds; deleting a category/tag/food/unit no longer used by any recipe succeeds (they are deleted only after the recipes).
9. New recipes get `disableComments` from the household preference (default false), so the comment box shows on the oracle's/runs' recipe; the oracle posts the comment through the API regardless.
10. Slug: `slugify("<runid> Bench Recipe")`, e.g. `mloracle1-bench-recipe`; the recipe page URL is `/g/home/r/<slug>` (group slug `home` from DEFAULT_GROUP=Home).
11. The UI placeholder on a new recipe is one ingredient (note "1 Cup Flour") and one step — stated generically in the task's notes.
12. `GET /api/recipes` lists every recipe of the group (one household), including ones created through the UI.
