# grocy (gc, :8106): snippets for the shared files

Held-out 2 target (notes/HELDOUT2-PROTOCOL.md): Grocy 4.7.1 (linuxserver image
`linuxserver/grocy:v4.7.1-ls343`), port 8106, code `gc`. Own files:
`bench/thirdparty/grocy/docker-compose.yml`, `bench/thirdparty/grocy/seed.sh`,
`bench/thirdparty/grocy/no-ipv6.sh`, `bench/tasks/grocy-product-flow.md`, `bench/verify-grocy.mjs`,
`bench/oracle-grocy.mjs`. The blocks below are spliced into the shared files by hand.

**Grocy signs in by USERNAME, not email**: `APP_EMAIL` is the username `admin` (the task says
"Sign in with username `{{APP_EMAIL}}`"), as erpnext's is `Administrator`.

Before committing: `seed.sh` and `no-ipv6.sh` must be executable in git
(`git add --chmod=+x bench/thirdparty/grocy/seed.sh bench/thirdparty/grocy/no-ipv6.sh`);
no-ipv6.sh is mounted into the container's `/custom-cont-init.d`, as BookStack's is.

Prove the infrastructure on the first box (no tool involved):

    bash bench/heldout/bring-up.sh grocy                                                 # fresh volume, seed.sh, reset
    node bench/oracle-grocy.mjs gcoracle1 && node bench/verify-grocy.mjs gcoracle1        # 7/7 PASS, no EXTRA/DUPLICATE, exit 0
    node bench/reset-app.mjs --target grocy                                              # "deleted 1 product(s)"
    node bench/verify-grocy.mjs gcuntouched1                                             # 2-6 FAIL, 1+7 UNVERIFIABLE (no result file), exit 1
    node bench/reset-app.mjs --target grocy                                              # second reset: "no products to delete", nothing seeded
    bash bench/thirdparty/grocy/seed.sh                                                  # second seed: "already set" / "already installed"

The reset, oracle and verifier were smoke-run against an in-memory mock of the API routes they
use (oracle 7/7 PASS; untouched 0/7 with 1+7 UNVERIFIABLE; an empty report 0/7 FAIL; a
deliberately wrong run flagged the decoy location, a doubled description, a double purchase, a
stray product, a new location and a touched seed; second reset idempotent). Nothing has run
against a real Grocy.

## (a) bench/app-reset.mjs

Insert this function just above `function resetAtelyr()` (it uses the file's own `log`):

```js
/**
 * Grocy reset doubles as the SEED, as kanboard's does. It needs
 * bench/thirdparty/grocy/seed.sh first (the migrated database, the bench
 * password and the FIXED API key; refuses loudly without them). Then, every
 * time, through /api with the header "GROCY-API-KEY: <key>":
 *
 * - locations Fridge, Pantry and the look-alikes "Pantry Shelf" and "Garage
 *   Pantry"; quantity units Piece, Pack and the look-alikes "Package" and
 *   "Six-pack"; product groups Beverages, Snacks and the look-alikes
 *   "Snacks & Sweets" and "Healthy Snacks" — each active, as seeded; any other
 *   location, unit or group (a run may create one in master data) is DELETED.
 * - three "Seed:" products in Fridge / Beverages / Piece, minimum stock 0,
 *   default due days 0, a one-paragraph description, no barcodes and no stock
 *   history. Any other product (earlier runs' "<runid> Bench Product"s, one a
 *   purchase picker created, a renamed seed) is DELETED, and so is a seed a
 *   wayward run touched (then re-created). Deleting a product cascades in
 *   Grocy's own trigger (cascade_product_removal: stock, stock_log,
 *   product_barcodes, unit conversions, shopping list rows).
 * - no shopping list items, only the "Default" shopping list, no stores, no
 *   global unit conversions.
 * - the product id counter is pushed forward by a random 10000-99999 (a
 *   throwaway product with an explicit id, deleted at once; products.id is
 *   AUTOINCREMENT, so sqlite_sequence keeps the jump). The run's product id
 *   is what objective 7 reports: a small sequential id could appear in a
 *   report by coincidence (a step number, "2026") or be frozen from an
 *   earlier run; a jump of 5+ digits cannot.
 * - the admin's remembered table layouts and new-product presets
 *   (user settings datatables_state_*, product_presets_*, stock_default_*,
 *   shopping_list_*) are deleted, so they fall back to the config defaults.
 *
 * Grocy turns empty values into '' (the UI sends '' for an empty select, and
 * the API purifies null to ''), so "unset" below is null OR ''.
 */
async function resetGrocy() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8106/').replace(/\/$/, '');
  const key = process.env.GROCY_API_KEY || 'bench-grocy-api-key-0000000000000000000000000001';
  const api = async (method, route, body) => {
    const res = await fetch(`${base}/api${route}`, {
      method,
      headers: {
        'GROCY-API-KEY': key, accept: 'application/json',
        // Grocy compares the header to exactly "application/json" (no charset).
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`grocy ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  };
  const all = (entity) => api('GET', `/objects/${entity}`);
  const unset = (v) => v === null || v === undefined || v === '';
  const same = (a, b) => (unset(a) && unset(b)) || String(a) === String(b);
  const plain = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  try {
    await api('GET', '/system/info');
  } catch (e) {
    throw new Error(`grocy: the API key is refused (${e.message}) — run bash bench/thirdparty/grocy/seed.sh first`);
  }

  // ---- master data: exactly the kept names, each as seeded -----------------
  const MASTERS = {
    locations: [
      { name: 'Fridge', description: 'The kitchen fridge.', is_freezer: 0 },
      { name: 'Pantry', description: 'The kitchen pantry.', is_freezer: 0 },
      { name: 'Pantry Shelf', description: 'The open shelf next to the pantry.', is_freezer: 0 },
      { name: 'Garage Pantry', description: 'Overflow storage in the garage.', is_freezer: 0 },
    ],
    quantity_units: [
      { name: 'Piece', name_plural: 'Pieces' },
      { name: 'Pack', name_plural: 'Packs' },
      { name: 'Package', name_plural: 'Packages' },
      { name: 'Six-pack', name_plural: 'Six-packs' },
    ],
    product_groups: [
      { name: 'Beverages', description: 'Drinks.' },
      { name: 'Snacks', description: 'Things to eat between meals.' },
      { name: 'Snacks & Sweets', description: 'Sweet things.' },
      { name: 'Healthy Snacks', description: 'Fruit, nuts and the like.' },
    ],
  };
  const ids = {}; // ids.locations.Pantry = 2
  const extras = {};
  for (const [entity, wanted] of Object.entries(MASTERS)) {
    ids[entity] = {};
    extras[entity] = [];
    for (const row of (await all(entity)).sort((a, b) => a.id - b.id)) {
      const w = wanted.find((x) => x.name === row.name);
      if (!w || ids[entity][w.name]) { extras[entity].push(row); continue; }
      ids[entity][w.name] = row.id;
      const want = { ...w, active: 1 };
      if (Object.entries(want).some(([k, v]) => !same(row[k], v))) {
        await api('PUT', `/objects/${entity}/${row.id}`, want);
        log(`grocy: restored ${entity} "${w.name}"`);
      }
    }
    for (const w of wanted) {
      if (ids[entity][w.name]) continue;
      ids[entity][w.name] = (await api('POST', `/objects/${entity}`, { ...w, active: 1 })).created_object_id;
      log(`grocy: seeded ${entity} "${w.name}"`);
    }
  }
  const L = ids.locations, Q = ids.quantity_units, G = ids.product_groups;

  // ---- products: exactly the seed set, each as seeded --------------------------
  const SEED = [
    { name: 'Seed: Sparkling water', body: 'Bottled sparkling water for the office fridge.' },
    { name: 'Seed: Orange juice', body: 'Fresh orange juice, one litre.' },
    { name: 'Seed: Oat milk', body: 'Oat drink for coffee.' },
  ];
  const seedRow = (s) => ({
    name: s.name, description: `<p>${s.body}</p>`, active: 1,
    location_id: L.Fridge, product_group_id: G.Beverages,
    qu_id_stock: Q.Piece, qu_id_purchase: Q.Piece, qu_id_consume: Q.Piece, qu_id_price: Q.Piece,
    min_stock_amount: 0, default_best_before_days: 0,
  });
  const stockLog = await all('stock_log');
  const barcodes = await all('product_barcodes');
  let removed = 0;
  for (const p of (await all('products')).sort((a, b) => a.id - b.id)) {
    const s = SEED.find((x) => x.name === p.name);
    const want = s && seedRow(s);
    const pristine = s && !s.kept &&
      ['active', 'location_id', 'product_group_id', 'qu_id_stock', 'qu_id_purchase', 'min_stock_amount', 'default_best_before_days']
        .every((k) => Number(p[k]) === Number(want[k])) &&
      unset(p.parent_product_id) && plain(p.description) === s.body &&
      !stockLog.some((r) => String(r.product_id) === String(p.id)) &&
      !barcodes.some((b) => String(b.product_id) === String(p.id));
    if (pristine) { s.kept = true; continue; }
    await api('DELETE', `/objects/products/${p.id}`);
    removed++;
  }
  log(removed ? `grocy: deleted ${removed} product(s) (earlier runs' and non-seed, with their stock and barcodes)` : 'grocy: no products to delete');
  for (const s of SEED) {
    if (s.kept) continue;
    await api('POST', '/objects/products', seedRow(s));
    log(`grocy: seeded product "${s.name}"`);
  }

  // ---- everything else a run can leave behind ---------------------------------
  for (const r of await all('shopping_list')) await api('DELETE', `/objects/shopping_list/${r.id}`);
  for (const r of await all('shopping_lists')) {
    if (String(r.id) === '1') {
      if (r.name !== 'Default') await api('PUT', '/objects/shopping_lists/1', { name: 'Default' });
      continue;
    }
    await api('DELETE', `/objects/shopping_lists/${r.id}`);
    log(`grocy: deleted shopping list "${r.name}"`);
  }
  for (const r of await all('shopping_locations')) {
    await api('DELETE', `/objects/shopping_locations/${r.id}`);
    log(`grocy: deleted store "${r.name}"`);
  }
  for (const r of await all('quantity_unit_conversions')) {
    if (!unset(r.product_id)) continue;
    await api('DELETE', `/objects/quantity_unit_conversions/${r.id}`);
    log(`grocy: deleted a global unit conversion (#${r.id})`);
  }
  // Masters a run created, now that no product points at them.
  for (const [entity, rows] of Object.entries(extras)) {
    for (const r of rows) {
      await api('DELETE', `/objects/${entity}/${r.id}`);
      log(`grocy: deleted ${entity} "${r.name}"`);
    }
  }

  // ---- push the product id counter forward ------------------------------------
  // A probe without an id reads the counter (sqlite_sequence + 1), then a
  // throwaway with an explicit id further on moves the counter there.
  const throwaway = async (id) => {
    const created = await api('POST', '/objects/products', {
      ...(id ? { id } : {}), name: `bench id bump ${id || 'probe'}`, active: 0, location_id: L.Fridge,
      qu_id_stock: Q.Piece, qu_id_purchase: Q.Piece, qu_id_consume: Q.Piece, qu_id_price: Q.Piece,
    });
    await api('DELETE', `/objects/products/${created.created_object_id}`);
    return Number(created.created_object_id);
  };
  const probe = await throwaway(null);
  const bumped = await throwaway(probe + 10000 + Math.floor(Math.random() * 90000));
  log(`grocy: product ids continue after ${bumped}`);

  // ---- the admin's remembered UI state ----------------------------------------
  const settings = await api('GET', '/user/settings');
  const stale = Object.keys(settings ?? {}).filter((k) => /^(datatables_state_|product_presets_|stock_default_|shopping_list_)/.test(k));
  for (const k of stale) await api('DELETE', `/user/settings/${encodeURIComponent(k)}`);
}
```

and add to `RESETS`, after the held-out entries (after `bookstack: resetBookstack,` or the last one):

```js
  grocy: resetGrocy,
```

## (b) bench/app-defaults.mjs: APP_DEFAULTS entry (after `bookstack`)

```js
  // bench/thirdparty/grocy/seed.sh sets the install's only user (admin / admin)
  // to this password. Grocy signs in by USERNAME, so APP_EMAIL is the username.
  grocy: {
    APP_URL: 'http://127.0.0.1:8106/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'bench-admin-pass',
  },
```

## (c) bench/harness.mjs: TARGETS entry (after `bookstack`)

```js
  grocy: {
    task: 'tasks/grocy-product-flow.md',
    defaults: APP_DEFAULTS.grocy,
    // Reset is also the idempotent seed (after seed.sh's migrations, password and API key) — see resetGrocy.
    reset: () => resetTarget('grocy'),
    notReadyHint:
      'Start it with: docker compose -f bench/thirdparty/grocy/docker-compose.yml up -d (then seed.sh once)',
  },
```

## (d) bench/cloud-setup.sh: case block (after the `directus)` block, before `esac`)

```bash
    grocy)
      # nginx + php-fpm, SQLite. Grocy builds its database on the first request
      # to "/" (about 250 migrations, seconds), and /login answers 500 until it
      # has, so seed.sh does the waiting: it polls "/" for the 302 that follows
      # the migrations (up to five minutes), then sets the admin password and
      # installs the fixed API key (skips both when done). The reset is the
      # idempotent seed for everything else, as for kanboard.
      bash bench/thirdparty/grocy/seed.sh || { docker compose -f bench/thirdparty/grocy/docker-compose.yml logs --tail 40 || true; die "grocy seed.sh failed"; }
      node bench/reset-app.mjs --target grocy
      # Readiness probe: the sign-in page.
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8106/login || true)"
      echo "    grocy login page: HTTP ${code:-unreachable}"
      [ "$code" = "200" ] || die "grocy /login is not 200"
      ;;
```

## (e) bench/heldout/bring-up.sh

The health loop wants a 200, and Grocy has no unauthenticated page that answers 200 before its
first migration (`/` answers 302, `/login` 500), so the probe is a static file nginx serves
from Grocy's public/ (it proves nginx is up after the no-ipv6 init); seed.sh then waits for
php and the migrations itself. Case line (with the others):

```bash
  grocy)     url=http://127.0.0.1:8106/robots.txt ;;
```

and after the `[ "$t" = bookstack ] && bash bench/thirdparty/bookstack/seed.sh` line:

```bash
[ "$t" = grocy ] && bash bench/thirdparty/grocy/seed.sh
```

(Also widen the usage strings `<directus|mealie|bookstack>` to name the new targets.)

## (f) bench/thirdparty/README.md: table row (after Directus)

```markdown
| Grocy 4.7 | 8106 | PHP Slim + Blade, jQuery/Bootstrap 4; **native selects for location, product group and four quantity units (choosing the stock unit presets the others)**; +/- number pickers; Summernote WYSIWYG description; purchase page with a typeahead product combobox that can start creating a product; date picker with shorthand input; barcode form in a modal after the first save; sequential numeric ids in `/product/<id>`, pushed forward at random by the reset (held out) | admin / bench-admin-pass |
```

and in the `seed.sh` line below the table, add grocy to the targets that have one.

## (g) optional: held-out scoring maps

`bench/heldout/score.mjs` and `bench/heldout/honesty.mjs` map codes to targets for held-out 1
(`{ dx: 'directus', ml: 'mealie', bs: 'bookstack' }`); held-out 2 scoring needs `gc: 'grocy'`
in whichever map it uses.

## UNVERIFIED (checked against the Grocy source at tag v4.7.1 and the linuxserver/docker-grocy repo; the first box tests these)

1. The tag `linuxserver/grocy:v4.7.1-ls343` exists on Docker Hub (seen in the tag list,
   pushed 2026-10-04, the newest; Grocy 4.7.1 was released 2026-09-04). Not pulled.
2. nginx in the image is the baseimage-alpine-nginx default site at
   `/config/nginx/site-confs/default.conf` with `listen [::]:80` / `[::]:443` lines, which
   no-ipv6.sh deletes from `/custom-cont-init.d` (as for BookStack, which the 2026-10-05 box
   proved). If nginx still dies, check that the script has the exec bit in git.
3. The database is `/config/data/grocy.db` (the image symlinks /app/www/data to /config/data).
   It does not exist until the first GET `/` (SystemController::Root migrates; `/` is a public
   route answering 302). seed.sh waits for that 302 with a 120s per-request timeout, then
   checks `/login` answers 200.
4. `docker exec -u abc` works (abc owns /config) and `php` (or `php85`) is on PATH with
   pdo_sqlite; seed.sh feeds the script on stdin with HOME=/tmp. If `-u abc` fails, drop it
   and `chown abc:abc /config/data/grocy.db*` afterwards.
5. API keys are plain text in `api_keys` (api_key, user_id, expires, key_type='default',
   description), checked by ApiKeyService::IsValidApiKey; the header is `GROCY-API-KEY`
   (app.php). The admin user has every permission (DEFAULT_PERMISSIONS ADMIN).
6. Grocy rejects a request body unless Content-Type is exactly `application/json` (no charset;
   BaseApiController::GetParsedAndFilteredRequestBody). Every string value goes through
   HTMLPurifier, and null becomes '' (the verifier and reset treat null and '' alike).
7. `POST /api/objects/products` with an explicit `id` inserts that id (LessQL createRow) and
   `created_object_id` returns it; products.id is AUTOINCREMENT, so the reset's throwaway
   moves sqlite_sequence on by 10000-99999 and the run's product id follows it (5+ digits,
   different every run). If Grocy refuses the explicit id, the reset throws at
   "bench id bump"; then drop the bump and make obj 7 require the `/product/<id>` form.
8. Deleting a product through `/api/objects/products/{id}` fires Grocy's
   `cascade_product_removal` trigger (migration 0207: stock, stock_log, product_barcodes,
   quantity_unit_conversions, recipes_pos, meal_plan, shopping_list rows).
9. API values come back as PHP 8.5 PDO SQLite native types; the verifier compares with
   Number()/String(), so numeric strings work too. `stock`, `stock_log` and
   `product_barcodes` are listable through `/api/objects/` (only api_keys and sessions are not).
10. `POST /api/stock/products/{id}/add` with `transaction_type: purchase` books one `stock`
    row and one `stock_log` row (`transaction_type 'purchase'`, `undone 0`) with
    `best_before_date` as given. The purchase page's amount is in the product's purchase unit
    (Pack), the same as its stock unit here, so 3 Packs = stock amount 3.
11. A fresh database has no locations, units, groups or products (migration 0021 removed the
    early defaults), one shopping list "Default" (id 1) and the user admin / admin.
12. `GROCY_STOCK_BARCODE_LOOKUP_PLUGIN=DemoBarcodeLookupPlugin` keeps unknown-barcode lookups
    off the network (the default plugin calls Open Food Facts); the image's init copies the
    plugin to /config/data/plugins. Grocy reads `GROCY_<SETTING>` env vars
    (helpers/extensions.php Setting()), and the image passes env to php-fpm (clear_env = no).
13. Locations, units and groups render as native `<select>`s on the product form (not
    bootstrap-select); the product picker on the purchase page is a typeahead combobox.
14. Not reset (no API): the admin's sessions (one per sign-in) and the other user settings
    (night mode, locale and so on), which no run is asked to change.
