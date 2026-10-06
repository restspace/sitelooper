# kimai (km): snippets for the shared files

Held-out 2 target (notes/HELDOUT2-PROTOCOL.md): Kimai time tracking **2.68.0** (image
`kimai/kimai2:2.68.0`, the Apache variant; released 2026-10-05, the current `stable`), port
8105, code `km`. Own files:

- `bench/thirdparty/kimai/docker-compose.yml` (kimai + mariadb:11.4.13, 127.0.0.1:8105 -> 8001)
- `bench/thirdparty/kimai/seed.sh` (fixed API token, wizard seen, admin timezone UTC, project ids from 40001)
- `bench/tasks/kimai-timesheet-flow.md`
- `bench/verify-kimai.mjs`
- `bench/oracle-kimai.mjs`

Auth everywhere (reset, verifier, oracle): `Authorization: Bearer benchkimaiapitoken000000000000001`
(`KIMAI_API_TOKEN` overrides), a row seed.sh writes into `kimai2_access_token` (Kimai keeps API
tokens in plain text and has no console command to create one). The browser signs in as the same
user (`admin`, admin@example.com / bench-admin-pass).

Prove the infrastructure on the first box (no tool involved):

    docker compose -f bench/thirdparty/kimai/docker-compose.yml up -d
    bash bench/thirdparty/kimai/seed.sh                                              # "kimai API token authenticates"
    node bench/reset-app.mjs --target kimai
    node bench/oracle-kimai.mjs kmoracle1 && node bench/verify-kimai.mjs kmoracle1    # 7/7 PASS, exit 0
    node bench/reset-app.mjs --target kimai                                           # deletes the oracle's timesheet + project
    node bench/verify-kimai.mjs kmuntouched1                                          # 2-6 FAIL, 1+7 UNVERIFIABLE (no result file), exit 1
    node bench/reset-app.mjs --target kimai                                           # second reset: "no timesheets/projects to delete", nothing created
    curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8105/en/login           # 200

Then sign in once (agent-browser) as admin@example.com and confirm it lands on the dashboard, NOT
`/en/wizard/intro`, and that the oracle's timesheet shows 09:00-11:30 on 2026-09-16.

## (a) bench/app-reset.mjs

Insert this function just above `function resetAtelyr()` (it uses the file's own `log`):

```js
/**
 * Kimai reset doubles as the SEED, as kanboard's does. It needs
 * bench/thirdparty/kimai/seed.sh first (the admin's FIXED API token, the
 * first-login wizard marked seen, the admin's timezone pinned to UTC; refuses
 * loudly without the token). Then, every time, through /api with
 * "Authorization: Bearer <token>":
 *
 * - no timesheets at all (every user's; the bench seeds none, so any one is a
 *   run's — "<runid>" workshop records, a retried save, a running timer).
 * - customers "Bench Customer" plus the look-alikes "Bench Customer Ltd" and
 *   "Bench Customers Group" (US / USD / UTC, visible, no comment).
 * - three "Seed:" projects on Bench Customer Ltd, visible, with a fixed
 *   description, no order number, no order date, global activities allowed.
 * - global activities "Consulting" plus the look-alikes "Consulting Travel" and
 *   "Consultancy Review", visible.
 * - tags "onsite" plus the look-alikes "onsite-remote" and "offsite".
 *
 * Any other customer, project, activity or tag (earlier runs' "<runid> Bench
 * Project"s, a customer or tag a run created from a picker, a renamed or
 * edited seed record) is DELETED; a seed record a wayward run touched is
 * deleted and re-created rather than patched. Comments on the kept projects
 * and customers are deleted. Order matters: timesheets first (they point at
 * projects and activities), then customers (deleting one cascades to its
 * projects), projects, activities, tags.
 */
async function resetKimai() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8105/').replace(/\/$/, '');
  const token = process.env.KIMAI_API_TOKEN || 'benchkimaiapitoken000000000000001';
  const call = async (method, route, body) => {
    const res = await fetch(`${base}/api${route}`, {
      method,
      headers: {
        accept: 'application/json', authorization: `Bearer ${token}`,
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
    if (!r.res.ok) throw new Error(`kimai ${method} /api${route}: HTTP ${r.res.status} ${r.text.slice(0, 300)}`);
    return r.json;
  };
  const byId = (a, b) => a.id - b.id;
  const custOf = (p) => (p && typeof p.customer === 'object' && p.customer !== null ? p.customer.id : p?.customer);
  const projOf = (a) => (a && typeof a.project === 'object' && a.project !== null ? a.project.id : a?.project ?? null);

  const probe = await call('GET', '/version');
  if (!probe.res.ok) {
    throw new Error(`kimai: the API token is refused (GET /api/version: HTTP ${probe.res.status}) — run bash bench/thirdparty/kimai/seed.sh first`);
  }

  // ---- timesheets: none survive -------------------------------------------
  let removedSheets = 0;
  for (;;) {
    const r = await call('GET', '/timesheets?user=all&size=500&page=1&orderBy=id&order=ASC');
    if (r.res.status === 404) break;
    if (!r.res.ok) throw new Error(`kimai GET /api/timesheets: HTTP ${r.res.status} ${r.text.slice(0, 300)}`);
    const rows = r.json ?? [];
    if (!rows.length) break;
    for (const t of rows) {
      // A running timer must be stopped before Kimai lets it go.
      if (!t.end) await call('PATCH', `/timesheets/${t.id}/stop`);
      await api('DELETE', `/timesheets/${t.id}`);
      removedSheets++;
    }
    if (rows.length < 500) break;
  }
  log(removedSheets ? `kimai: deleted ${removedSheets} timesheet(s)` : 'kimai: no timesheets to delete');

  // ---- customers ------------------------------------------------------------
  const KEEP_CUSTOMERS = ['Bench Customer', 'Bench Customer Ltd', 'Bench Customers Group'];
  const customerIds = {};
  for (const c of (await api('GET', '/customers?visible=3')).sort(byId)) {
    const full = await api('GET', `/customers/${c.id}`);
    const pristine = KEEP_CUSTOMERS.includes(c.name) && !customerIds[c.name] && full.visible !== false && !full.comment;
    if (pristine) { customerIds[c.name] = c.id; continue; }
    await api('DELETE', `/customers/${c.id}`);
    log(`kimai: deleted customer "${c.name}" (#${c.id}) and its projects`);
  }
  for (const name of KEEP_CUSTOMERS) {
    if (customerIds[name]) continue;
    customerIds[name] = (await api('POST', '/customers', {
      name, country: 'US', currency: 'USD', timezone: 'UTC', visible: true, billable: true,
    })).id;
    log(`kimai: seeded customer "${name}"`);
  }

  // ---- projects ---------------------------------------------------------------
  const SEED_PROJECTS = [
    { name: 'Seed: Website relaunch', comment: 'Rebuild of the public website on the new design system.' },
    { name: 'Seed: Annual audit', comment: 'Preparation of the documents for the yearly financial audit.' },
    { name: 'Seed: Office move', comment: 'Planning the move to the new office floor.' },
  ];
  const seedsCustomer = customerIds['Bench Customer Ltd'];
  let removedProjects = 0;
  for (const p of (await api('GET', '/projects?visible=3&ignoreDates=1')).sort(byId)) {
    const s = SEED_PROJECTS.find((x) => x.name === p.name);
    const pristine = s && !s.kept && custOf(p) === seedsCustomer && p.visible !== false &&
      String(p.comment ?? '') === s.comment && !p.orderNumber && !p.orderDate && !p.start && !p.end &&
      p.globalActivities !== false;
    if (pristine) { s.kept = p.id; continue; }
    await api('DELETE', `/projects/${p.id}`);
    removedProjects++;
  }
  log(removedProjects ? `kimai: deleted ${removedProjects} project(s) (earlier runs' and non-seed)` : 'kimai: no projects to delete');
  for (const s of SEED_PROJECTS) {
    if (s.kept) continue;
    s.kept = (await api('POST', '/projects', {
      name: s.name, customer: seedsCustomer, comment: s.comment, visible: true, billable: true, globalActivities: true,
    })).id;
    log(`kimai: seeded project "${s.name}"`);
  }

  // ---- activities -------------------------------------------------------------
  const KEEP_ACTIVITIES = ['Consulting', 'Consulting Travel', 'Consultancy Review'];
  const activityIds = {};
  for (const a of (await api('GET', '/activities?visible=3')).sort(byId)) {
    const pristine = KEEP_ACTIVITIES.includes(a.name) && !activityIds[a.name] && projOf(a) === null &&
      a.visible !== false && !a.comment;
    if (pristine) { activityIds[a.name] = a.id; continue; }
    await api('DELETE', `/activities/${a.id}`);
    log(`kimai: deleted activity "${a.name}" (#${a.id})`);
  }
  for (const name of KEEP_ACTIVITIES) {
    if (activityIds[name]) continue;
    activityIds[name] = (await api('POST', '/activities', { name, project: null, visible: true, billable: true })).id;
    log(`kimai: seeded activity "${name}"`);
  }

  // ---- tags -------------------------------------------------------------------
  const KEEP_TAGS = ['onsite', 'onsite-remote', 'offsite'];
  const tagsFound = await call('GET', '/tags/find?name=%25');
  if (!tagsFound.res.ok) throw new Error(`kimai GET /api/tags/find: HTTP ${tagsFound.res.status} ${tagsFound.text.slice(0, 300)}`);
  const keptTags = new Set();
  for (const t of (tagsFound.json ?? []).sort(byId)) {
    if (KEEP_TAGS.includes(t.name) && !keptTags.has(t.name)) { keptTags.add(t.name); continue; }
    await api('DELETE', `/tags/${t.id}`);
    log(`kimai: deleted tag "${t.name}"`);
  }
  for (const name of KEEP_TAGS) {
    if (keptTags.has(name)) continue;
    await api('POST', '/tags', { name, visible: true });
    log(`kimai: seeded tag "${name}"`);
  }

  // ---- comments on the kept records ---------------------------------------------
  const comments = [
    ...SEED_PROJECTS.map((s) => ['projects', s.kept]),
    ...KEEP_CUSTOMERS.map((n) => ['customers', customerIds[n]]),
  ];
  for (const [kind, id] of comments) {
    for (const c of (await api('GET', `/${kind}/${id}/comments`)) ?? []) {
      await api('DELETE', `/${kind}/${id}/comments/${c.id}`);
      log(`kimai: deleted a comment on ${kind.slice(0, -1)} #${id}`);
    }
  }
}
```

and add to `RESETS`, after `directus: resetDirectus,`:

```js
  kimai: resetKimai,
```

## (b) bench/app-defaults.mjs — APP_DEFAULTS entry (after `bookstack`)

```js
  // The image's entrypoint creates this admin (username "admin") from ADMINMAIL /
  // ADMINPASS; seed.sh marks its first-login wizard seen. Kimai signs in by
  // username or email.
  kimai: {
    APP_URL: 'http://127.0.0.1:8105/',
    APP_EMAIL: 'admin@example.com',
    APP_PASSWORD: 'bench-admin-pass',
  },
```

## (c) bench/harness.mjs — TARGETS entry (after `bookstack`)

```js
  kimai: {
    task: 'tasks/kimai-timesheet-flow.md',
    defaults: APP_DEFAULTS.kimai,
    // Reset is also the idempotent seed (after seed.sh's API token) — see resetKimai.
    reset: () => resetTarget('kimai'),
    notReadyHint:
      'Start it with: docker compose -f bench/thirdparty/kimai/docker-compose.yml up -d (then seed.sh once)',
  },
```

## (d) bench/cloud-setup.sh — case block (after the `directus)` block, before `esac`)

```bash
    kimai)
      # Apache + PHP + MariaDB; the entrypoint waits for the database, runs
      # kimai:install (schema + migrations) and creates the admin before Apache
      # starts, ~30-60s warm; allow five minutes on a cold box. /en/login answers
      # 200 unauthenticated once it serves.
      for _ in $(seq 1 150); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8105/en/login || true)"
        [ "$code" = "200" ] && break; sleep 2
      done
      echo "    kimai login page: HTTP ${code:-unreachable}"
      [ "$code" = "200" ] || { docker compose -f bench/thirdparty/kimai/docker-compose.yml logs --tail 40 kimai || true; die "kimai /en/login is not 200"; }
      # seed.sh installs the fixed API token, marks the admin's first-login
      # wizard seen and pins its timezone (idempotent); the reset is the
      # idempotent seed for everything else, as for kanboard.
      bash bench/thirdparty/kimai/seed.sh
      node bench/reset-app.mjs --target kimai
      ;;
```

## (e) bench/heldout/bring-up.sh

In the `case "$t" in` health-url block add (and add `kimai` to the two usage strings):

```bash
  kimai)     url=http://127.0.0.1:8105/en/login ;;
```

and replace the bookstack-only seed line

```bash
[ "$t" = bookstack ] && bash bench/thirdparty/bookstack/seed.sh
```

with one that runs any target's seed.sh (directus and mealie have none):

```bash
if [ -f "bench/thirdparty/$t/seed.sh" ]; then bash "bench/thirdparty/$t/seed.sh"; fi
```

The box-start hook needs nothing: the compose project is `kimai`, so its containers' names
contain the target name it greps for.

## (f) bench/thirdparty/README.md — table row (after Directus)

```markdown
| Kimai 2.68 | 8105 | Symfony server-rendered forms (Tabler) opened as **modal dialogs over the list pages**; tom-select drop-downs with type-to-search for customer, project and activity (the timesheet form cascades customer -> project -> activity); a tag input that suggests after three characters and can create; litepicker date pickers and time inputs; integer ids only in the url (`/en/admin/project/<id>/details`) (held out) | admin@example.com / bench-admin-pass |
```

and add `kimai` to the targets with a seed.sh in the "Bring one up with" block.

## The seven objectives (bench/tasks/kimai-timesheet-flow.md)

1. (report) the names of the `Seed:` projects (`Seed: Website relaunch`, `Seed: Annual audit`, `Seed: Office move`).
2. A project `<RUNID> Bench Project` exists whose description includes the runid (not saved doubled).
3. Its customer is the existing `Bench Customer` (decoys `Bench Customer Ltd`, `Bench Customers Group`).
4. Its order number is `PO-4471` and its order date 2026-11-15 (date picker).
5. Secondary record: a timesheet on that project, 2026-09-16 09:00-11:30, description includes the runid.
6. That timesheet's activity is the existing global `Consulting` (decoys `Consulting Travel`,
   `Consultancy Review`) and its only tag is `onsite` (decoys `onsite-remote`, `offsite`; the tag
   input can create a tag, which counts as an EXTRA MUTATION).
7. (report) the project's id from `/en/admin/project/<id>/details` (5-digit, from 40001).

## UNVERIFIED (nothing here has run against a real Kimai; the first box checks these first)

Written from the docs and the Kimai source at tag 2.68.0 (shallow clone), and smoke-run against a
hand-written in-memory mock of the routes (oracle 7/7 PASS; untouched 0/7 with 1+7 UNVERIFIABLE; an
empty finalText 0/7 all FAIL; a stray customer, a typed tag "onsite " and a running timer on a seed
project each flagged EXTRA MUTATION and then cleaned by the reset; second reset idempotent).
Still unverified on a live instance, most likely failure first:

1. **seed.sh's SQL**: table/column names `kimai2_users(username,email,enabled)`,
   `kimai2_access_token(user_id,token,name,expires_at)`, `kimai2_user_preferences(user_id,name,value)`
   with a unique key on (user_id,name), from the entities and migration Version20240214061246.
   The db client inside mariadb:11.4 is `mariadb` (no `mysql` binary).
2. **The first-login wizard**: WizardSubscriber redirects every admin to /en/wizard/intro until the
   `__wizards__` preference holds `intro,profile` (User::hasSeenWizard). seed.sh writes it; if the
   browser still lands on the wizard, check the row and that `cache:pool:clear cache.app` ran.
3. **Console as www-data with HOME=/tmp** (`kimai:user:password`, `kimai:user:create`): the image runs
   Apache as www-data and chowns var/ to it; running the console as root would leave root-owned
   cache files. Same lesson as bookstack's tinker needing HOME.
4. **TRUSTED_HOSTS "127.0.0.1,localhost"**: Symfony host patterns, set because the docs' example
   sets one and an empty value's behaviour on this version is unchecked. If every page 400s with
   "Untrusted Host", widen it.
5. **DATABASE_URL serverVersion `11.4.13-MariaDB`** (Doctrine DBAL's MariaDB form) and the
   entrypoint's awk parse of the URL (port given explicitly, password free of `/ : @`).
6. **IPv6**: the image is Apache with `Listen 8001` (no `[::]` literal, unlike bookstack's nginx),
   which falls back to IPv4 on a box without IPv6. If it dies with "Address family not supported",
   mount an init that rewrites /etc/apache2/ports.conf to `Listen 0.0.0.0:8001`.
7. **Admin email** admin@example.com (not `.local`, which Directus rejected last time). The login
   form accepts username or email (UserRepository::loadUserByIdentifier).
8. **Login throttling**: Symfony login_throttling is 5 attempts / 5 minutes per username+IP. A run
   that fumbles the password five times locks itself out for five minutes.
9. **API reads**: `GET /api/projects?visible=3&ignoreDates=1` (without ignoreDates the listing is
   filtered to projects running "now"), `/api/customers?visible=3`, `/api/activities?visible=3`
   (expected to include project-scoped activities too), `/api/timesheets?user=all&size=500&page=N`
   (404 past the last page), `/api/tags/find?name=%25` (`%` inside its LIKE matches every visible
   tag; the verifier falls back to `/api/tags`, names only). A project's `customer` and a
   timesheet's `project`/`activity` are integer ids in these views (the scripts also accept objects).
   `orderDate` serializes as `Y-m-d`; a timesheet's `begin`/`end` as `2026-09-16T09:00:00+0000` in
   the API user's timezone (UTC via seed.sh), so the verifier compares the first 16 characters.
10. **API writes**: POST JSON is decoded by FOSRest's jsontoform decoder; POST /api/projects takes
    `orderDate` as `yyyy-MM-dd`; POST /api/timesheets takes begin/end as HTML5 local
    `YYYY-MM-DDTHH:mm:ss` and `tags` as a comma-separated string of EXISTING tag names (the API form
    does not create tags); POST /api/customers needs country, currency and timezone. DELETE on a
    customer cascades to its projects; a running timesheet is stopped (`PATCH /stop`) before DELETE.
11. **Timesheet on 2026-09-16** (in the past on purpose; future times are allowed by default anyway),
    and the default rounding (begin down / end up to the full minute) leaves 09:00/11:30 unchanged.
12. **Project ids from 40001**: `ALTER TABLE kimai2_projects AUTO_INCREMENT = 40001` in seed.sh;
    MariaDB InnoDB keeps the counter across restarts. The verifier matches the id with digit
    boundaries.
13. Not reset: datatable search state the admin saves as a bookmark, user favourites, and hidden
    tags (the tag listing returns visible tags only; a picker cannot create a hidden one).
