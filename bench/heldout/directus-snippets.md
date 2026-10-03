# directus (dx): snippets for the shared files

Held-out target (notes/HELDOUT-PROTOCOL.md): Directus 11 Data Studio, port 8101, code `dx`.
Own files: `bench/thirdparty/directus/docker-compose.yml`, `bench/tasks/directus-ticket-flow.md`,
`bench/verify-directus.mjs`, `bench/oracle-directus.mjs`. No seed.sh: bootstrap creates the
admin and its static token from env, and the reset builds the data model and every record.

Prove the infrastructure on the first box (no tool involved):

    node bench/reset-app.mjs --target directus
    node bench/oracle-directus.mjs dxoracle1 && node bench/verify-directus.mjs dxoracle1      # 7/7 PASS, exit 0
    node bench/reset-app.mjs --target directus                                                # reset deletes the oracle's ticket + comment
    node bench/verify-directus.mjs dxuntouched1                                               # 2-6 FAIL, 1+7 UNVERIFIABLE (no result file), exit 1
    node bench/reset-app.mjs --target directus                                                # second reset: "no tickets to delete", nothing created

## (a) bench/app-reset.mjs

Insert this function just above `function resetAtelyr()` (it uses the file's own `log`):

```js
/**
 * Directus reset doubles as the SEED, and as the DATA MODEL: Directus ships
 * with no collections, so the first reset builds them through the REST API —
 * "customers" (name) and "tickets" (uuid id, title, status dropdown, customer
 * many-to-one with the drawer picker, due date, estimated hours, preset tags,
 * WYSIWYG description, hidden date_created) — and every later reset finds them
 * and adds only what is missing. Then: customers "Bench Customer" plus the
 * look-alikes "Bench Customer Ltd" and "Bench Customers Group"; three "Seed:"
 * tickets, open, on Bench Customer Ltd, nothing else set, no comments. Every
 * other ticket (earlier runs' "<runid> Bench Ticket"s, a copy a run made) and
 * every other customer (the m2o drawer can CREATE one) is DELETED, and so is
 * every comment on either collection (comments are keyed by collection + item,
 * so a deleted ticket's comments outlive it). Ticket ids are random uuids, so a
 * stored id can never pass by coincidence. The admin's remembered list views
 * (directus_presets: search, filters, sort persist per user) and last visited
 * page (where the Studio lands after sign-in) are cleared, so every run opens
 * on the same Studio.
 *
 * Auth: the admin's static token (ADMIN_TOKEN in the compose file, set at
 * bootstrap). If it is refused — a volume bootstrapped without it — sign in
 * with the password once and put the token back on the admin.
 */
async function resetDirectus() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8101/').replace(/\/$/, '');
  const email = process.env.DIRECTUS_EMAIL || 'admin@bench.local';
  const password = process.env.DIRECTUS_PASSWORD || 'bench-admin-pass';
  const staticToken = process.env.DIRECTUS_TOKEN || 'bench-admin-token';
  let bearer = staticToken;
  const call = async (method, route, body) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: {
        accept: 'application/json', authorization: `Bearer ${bearer}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { res, text, json };
  };
  const api = async (method, route, body) => {
    const r = await call(method, route, body);
    if (!r.res.ok) throw new Error(`directus ${method} ${route}: HTTP ${r.res.status} ${r.text.slice(0, 300)}`);
    return r.json?.data ?? null;
  };

  // Sign in: the static token, else the password (and restore the token).
  let me = await call('GET', '/users/me?fields=id,email,token');
  if (me.res.status === 401 || me.res.status === 403) {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const body = await login.json().catch(() => null);
    if (!login.ok || !body?.data?.access_token) {
      throw new Error(`directus: neither the static token nor ${email}'s password signs in: HTTP ${login.status} ${JSON.stringify(body).slice(0, 200)}`);
    }
    bearer = body.data.access_token;
    await api('PATCH', '/users/me', { token: staticToken });
    log('directus: the static token was refused; restored it on the admin');
    bearer = staticToken;
    me = await call('GET', '/users/me?fields=id,email,token');
  }
  if (!me.res.ok) throw new Error(`directus GET /users/me: HTTP ${me.res.status} ${me.text.slice(0, 300)}`);

  // The licence-owner dialog an admin meets while no project owner is set.
  const settings = await api('GET', '/settings?fields=project_owner');
  if (!settings?.project_owner) {
    await api('POST', '/settings/owner', { project_owner: email, project_usage: 'personal', org_name: null, product_updates: false });
    log('directus: set the project owner');
  }

  // ---- data model -------------------------------------------------------
  const STATUS_CHOICES = [
    { text: 'Open', value: 'open' },
    { text: 'In progress', value: 'in_progress' },
    { text: 'Waiting on customer', value: 'waiting' },
    { text: 'Resolved', value: 'resolved' },
  ];
  const TAG_PRESETS = ['hardware', 'hardware-return', 'software', 'network', 'billing'];
  const MODEL = {
    customers: {
      meta: { icon: 'business', display_template: '{{name}}', sort_field: null, archive_field: null, singleton: false },
      fields: [
        { field: 'id', type: 'integer', meta: { hidden: true, interface: 'input', readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        { field: 'name', type: 'string', meta: { interface: 'input', required: true, width: 'full', sort: 1 }, schema: {} },
      ],
    },
    tickets: {
      meta: { icon: 'confirmation_number', display_template: '{{title}}', sort_field: null, archive_field: null, singleton: false },
      fields: [
        { field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
        { field: 'title', type: 'string', meta: { interface: 'input', required: true, width: 'full', sort: 1 }, schema: {} },
        {
          field: 'status', type: 'string',
          meta: { interface: 'select-dropdown', options: { choices: STATUS_CHOICES }, display: 'labels', display_options: { choices: STATUS_CHOICES }, width: 'half', sort: 2 },
          schema: { default_value: 'open', is_nullable: false },
        },
        {
          field: 'customer', type: 'integer',
          meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, display: 'related-values', display_options: { template: '{{name}}' }, width: 'half', sort: 3 },
          schema: {},
        },
        { field: 'due_date', type: 'date', meta: { interface: 'datetime', display: 'datetime', width: 'half', sort: 4 }, schema: {} },
        { field: 'estimated_hours', type: 'integer', meta: { interface: 'input', options: { min: 0 }, width: 'half', sort: 5 }, schema: {} },
        {
          field: 'tags', type: 'json',
          meta: { interface: 'tags', special: ['cast-json'], options: { presets: TAG_PRESETS, allowCustom: true }, display: 'labels', width: 'full', sort: 6 },
          schema: {},
        },
        { field: 'description', type: 'text', meta: { interface: 'input-rich-text-html', display: 'formatted-value', width: 'full', sort: 7 }, schema: {} },
        {
          field: 'date_created', type: 'timestamp',
          meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half', display: 'datetime', display_options: { relative: true } },
          schema: {},
        },
      ],
    },
  };
  const collections = (await api('GET', '/collections')).map((c) => c.collection);
  for (const [collection, def] of Object.entries(MODEL)) {
    if (!collections.includes(collection)) {
      await api('POST', '/collections', { collection, meta: def.meta, schema: {}, fields: def.fields });
      log(`directus: created collection "${collection}"`);
      continue;
    }
    const have = (await api('GET', `/fields/${collection}`)).map((f) => f.field);
    for (const f of def.fields) {
      if (have.includes(f.field)) continue;
      await api('POST', `/fields/${collection}`, f);
      log(`directus: created field ${collection}.${f.field}`);
    }
  }
  const relations = await api('GET', '/relations/tickets');
  if (!relations.some((r) => r.field === 'customer')) {
    await api('POST', '/relations', {
      collection: 'tickets', field: 'customer', related_collection: 'customers',
      meta: { sort_field: null }, schema: { on_delete: 'SET NULL' },
    });
    log('directus: created relation tickets.customer -> customers');
  }

  // ---- records ------------------------------------------------------------
  const inBoth = `filter=${encodeURIComponent(JSON.stringify({ collection: { _in: ['tickets', 'customers'] } }))}`;
  const all = (collection, fields = '*') => api('GET', `/items/${collection}?limit=-1&fields=${encodeURIComponent(fields)}`);

  // Comments first: they are keyed by collection + item and outlive the item.
  const comments = await api('GET', `/comments?limit=-1&fields=id&${inBoth}`);
  if (comments.length) {
    await api('DELETE', '/comments', comments.map((c) => c.id));
    log(`directus: deleted ${comments.length} comment(s)`);
  }

  // Customers: the first of each kept name stays.
  const KEEP_CUSTOMERS = ['Bench Customer', 'Bench Customer Ltd', 'Bench Customers Group'];
  const customers = (await all('customers', 'id,name')).sort((a, b) => a.id - b.id);
  const customerIds = {};
  const extraCustomers = [];
  for (const c of customers) {
    if (KEEP_CUSTOMERS.includes(c.name) && !customerIds[c.name]) customerIds[c.name] = c.id;
    else extraCustomers.push(c);
  }
  for (const name of KEEP_CUSTOMERS) {
    if (customerIds[name]) continue;
    customerIds[name] = (await api('POST', '/items/customers', { name })).id;
    log(`directus: seeded customer "${name}"`);
  }

  // Tickets: exactly the seed set, each as seeded.
  const SEED = [
    { title: 'Seed: Printer jams on tray 2', body: 'The office printer jams whenever tray 2 is used.' },
    { title: 'Seed: VPN drops every hour', body: 'Remote staff lose the VPN connection about once an hour.' },
    { title: 'Seed: Laptop battery swelling', body: 'A laptop battery has started to swell; the laptop is out of use.' },
  ];
  const tickets = (await all('tickets')).sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
  const doomed = [];
  for (const t of tickets) {
    const s = SEED.find((x) => x.title === t.title);
    const pristine = s && !s.kept && t.status === 'open' && t.customer === customerIds['Bench Customer Ltd'] &&
      !t.due_date && t.estimated_hours === null && !(Array.isArray(t.tags) && t.tags.length) &&
      t.description === `<p>${s.body}</p>`;
    if (pristine) { s.kept = true; continue; }
    doomed.push(t.id);
  }
  if (doomed.length) {
    await api('DELETE', '/items/tickets', doomed);
    log(`directus: deleted ${doomed.length} ticket(s) (earlier runs' and non-seed)`);
  } else {
    log('directus: no tickets to delete');
  }
  for (const s of SEED) {
    if (s.kept) continue;
    await api('POST', '/items/tickets', {
      title: s.title, status: 'open', customer: customerIds['Bench Customer Ltd'],
      due_date: null, estimated_hours: null, tags: null, description: `<p>${s.body}</p>`,
    });
    log(`directus: seeded ticket "${s.title}"`);
  }
  // Customers a run created (after the tickets, which may have pointed at them).
  if (extraCustomers.length) {
    await api('DELETE', '/items/customers', extraCustomers.map((c) => c.id));
    log(`directus: deleted customer(s) ${extraCustomers.map((c) => `"${c.name}"`).join(', ')}`);
  }

  // The admin's remembered list state and landing page.
  const presets = await api('GET', `/presets?limit=-1&fields=id&${inBoth}`);
  if (presets.length) {
    await api('DELETE', '/presets', presets.map((p) => p.id));
    log(`directus: deleted ${presets.length} saved list view(s)`);
  }
  await api('PATCH', '/users/me/track/page', { last_page: '/content' });
}
```

and add to `RESETS`, after `erpnext: resetErpnext,`:

```js
  directus: resetDirectus,
```

## (b) bench/app-defaults.mjs — APP_DEFAULTS entry (after `erpnext`)

```js
  // Bootstrap creates this admin from ADMIN_EMAIL / ADMIN_PASSWORD in the
  // compose file (PROJECT_OWNER set, so no licence-owner dialog). The Data
  // Studio signs in by email.
  directus: {
    APP_URL: 'http://127.0.0.1:8101/',
    APP_EMAIL: 'admin@bench.local',
    APP_PASSWORD: 'bench-admin-pass',
  },
```

## (c) bench/harness.mjs — TARGETS entry (after `erpnext`)

```js
  directus: {
    task: 'tasks/directus-ticket-flow.md',
    defaults: APP_DEFAULTS.directus,
    // Reset is also the idempotent seed (and builds the data model) — see resetDirectus.
    reset: () => resetTarget('directus'),
    notReadyHint: 'Start it with: docker compose -f bench/thirdparty/directus/docker-compose.yml up -d',
  },
```

## (d) bench/cloud-setup.sh — case block (after the `erpnext)` block, before `esac`)

```bash
    directus)
      # Node + SQLite; the image's CMD runs `cli.js bootstrap` (system tables,
      # migrations, the admin with its static token) before the server, ~10-30s
      # warm; allow five minutes on a cold box. /server/ping answers "pong"
      # unauthenticated once the API is up.
      for _ in $(seq 1 150); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8101/server/ping || true)"
        [ "$code" = "200" ] && break; sleep 2
      done
      echo "    directus server ping: HTTP ${code:-unreachable}"
      [ "$code" = "200" ] || { docker compose -f bench/thirdparty/directus/docker-compose.yml logs --tail 40 || true; die "directus does not answer /server/ping"; }
      # No seed.sh: the reset builds the data model (tickets, customers) on
      # first use and is the idempotent seed for everything else, as for kanboard.
      node bench/reset-app.mjs --target directus
      ;;
```

## (e) bench/thirdparty/README.md — table row (after ERPNext)

```markdown
| Directus 11 | 8101 | Vue 3 Data Studio on its own component library, history routes; **many-to-one picker in a side drawer that can also create**; TinyMCE WYSIWYG field; date picker; select dropdown; preset tags input that accepts typed text; item sidebar comments; uuid ids only in the url | admin@bench.local / bench-admin-pass |
```

## UNVERIFIED (nothing here has run against a real Directus; the first box tests these with the oracle)

Checked against the Directus source at tag v11.17.4 (sparse clone) and docs, and the
reset/oracle/verifier were smoke-run against a hand-written in-memory mock of the routes
(oracle 7/7 PASS, untouched 0/7 with 1+7 UNVERIFIABLE, second reset idempotent). Still
unverified on a live instance:

1. Image tag `directus/directus:11.17.4` exists on Docker Hub (seen in the tag list, the
   newest 11.x; 12.x is out but the protocol says Directus 11). It has not been pulled.
2. The named volume at `/directus/database` is writable by the image's `node` user (the
   Dockerfile creates `database/` in the node-owned dist; a fresh named volume copies that
   ownership). If bootstrap fails with SQLITE_CANTOPEN, this is why.
3. `ADMIN_TOKEN` is stored on the admin at first bootstrap only (source: utils/create-admin.ts);
   the reset's password fallback + `PATCH /users/me {token}` covers a volume made without it.
4. `PROJECT_OWNER` at bootstrap suppresses the licence-owner dialog (source:
   bootstrap/index.ts + private-view.vue); the reset also calls `POST /settings/owner` when
   `project_owner` is empty. Bootstrap's telemetry report fails offline; source shows it is caught.
5. `POST /collections` with the full `fields` array (uuid PK with `special: ['uuid']`, json
   `tags` with `cast-json`, `date`, `timestamp` date-created) creates the SQLite table as the
   Studio's own new-collection form does (payload shapes copied from new-collection.vue);
   then `POST /relations` adds the FK to `customers` on SQLite (knex table rebuild).
6. Field values as read back over REST: `due_date` (type `date`) comes back as `2026-12-31`
   (the verifier uses startsWith, so a datetime suffix still passes); `tags` comes back as a
   JSON array (the verifier also accepts a JSON string or CSV); `customer` with `fields=*` is
   the bare integer id; a fresh ticket's unset `estimated_hours` is `null`.
7. The seed-pristine check compares `description` to exactly `<p>…</p>` as posted. If
   Directus or SQLite alters the stored HTML, every reset will delete and re-seed the seed
   tickets (harmless but noisy: "deleted 3 ticket(s)" on every reset).
8. `GET /comments` / `GET /presets` accept a JSON `filter` query param; `DELETE /comments`,
   `/presets` and `/items/<collection>` accept a JSON array of keys (source: controllers).
   `comments.item` is stored as a string (the verifier compares as strings).
9. A static-token request has `accountability.user` set, so the comments service's
   create/delete (which require a user) and `PATCH /users/me/track/page` work with it.
10. The Studio lands on the user's `last_page` after sign-in (source: login-form.vue); the
    reset sets it to `/content`. Directus persists list search/filter/sort per user in
    `directus_presets`; the reset deletes those for tickets and customers.
11. The Studio's ticket URL is `/admin/content/tickets/<uuid>` (lowercase uuid); the
    verifier's obj 7 match is case-insensitive.
12. The m2o drawer's "create new" (enableCreate defaults true) and the tags field's typed
    custom value (allowCustom true) are left at Directus defaults; the task's notes state both
    facts neutrally. Field labels in the Studio are Directus's auto-formatted names
    ("Estimated Hours", "Due Date", "Tags", "Customer", "Description").
13. The untouched-run check gives obj 1 and 7 UNVERIFIABLE rather than FAIL when no result file
    exists (same as verify-ghost); write an empty `{"finalText": ""}` result to see them FAIL.
