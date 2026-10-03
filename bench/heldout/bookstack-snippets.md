# BookStack (bs, :8103) — snippets for the shared files

Held-out target (notes/HELDOUT-PROTOCOL.md). Own files: `bench/thirdparty/bookstack/docker-compose.yml`,
`bench/thirdparty/bookstack/seed.sh`, `bench/tasks/bookstack-page-flow.md`, `bench/verify-bookstack.mjs`,
`bench/oracle-bookstack.mjs`. The blocks below are spliced into the shared files by hand.

Validation order on the first box (before any tool run):

    bench/cloud-setup.sh --no-start --with-target bookstack     # up + seed.sh + reset
    node bench/oracle-bookstack.mjs bsor1 && node bench/verify-bookstack.mjs bsor1   # expect 7/7 PASS, no EXTRA/DUPLICATE, exit 0
    node bench/reset-app.mjs --target bookstack
    node bench/verify-bookstack.mjs bsnone1                     # expect obj 2-6 FAIL, 1 and 7 UNVERIFIABLE (no result file), no EXTRA, exit 1
    node bench/reset-app.mjs --target bookstack                 # twice in a row: the second logs nothing to delete

## (a) bench/app-reset.mjs — the reset, placed after `resetErpnext` (before `resetAtelyr`)

```js
/**
 * BookStack reset doubles as the SEED, as kanboard's does. It needs
 * bench/thirdparty/bookstack/seed.sh first (the bench admin and its FIXED API
 * token; refuses loudly without them). Then, every time, through /api with
 * "Authorization: Token <token_id>:<secret>":
 *
 * - no shelves.
 * - books "Bench Handbook" and its look-alike "Bench Handbooks", untagged.
 * - chapters "Release Notes" and "Release Notes Archive" in Bench Handbook,
 *   and a look-alike "Release Notes" in Bench Handbooks, untagged.
 * - three "Seed:" pages directly in Bench Handbook, each saved once with one
 *   tag (Review Status=Approved, Review Status=Draft, Review State=Approved;
 *   tags are free text, so these seed the suggestions the task's tag must
 *   match) and no comments.
 *
 * Any other book, chapter or page (earlier runs' "<runid> Bench Page"s, the
 * unsaved draft pages a page editor leaves when it is opened and abandoned —
 * the API lists them because the token is the same user who drafted them —
 * a copy, a renamed seed) is DELETED; a seed record a wayward run touched is
 * deleted and re-created rather than patched. Remaining comments are deleted,
 * and the recycle bin is emptied, so nothing deleted lingers in tag
 * suggestions or slug checks.
 */
async function resetBookstack() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8103/').replace(/\/$/, '');
  const token = process.env.BOOKSTACK_API_TOKEN || 'benchbookstacktokenid00000000001:benchbookstacktokensecret0000001';
  const api = async (method, route, body) => {
    const res = await fetch(`${base}/api${route}`, {
      method,
      headers: {
        authorization: `Token ${token}`, accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`bookstack ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  /** Every row of a listing endpoint (count is capped at 500 per request). */
  const all = async (route) => {
    const out = [];
    for (let offset = 0; ; offset += 500) {
      const page = await api('GET', `${route}?count=500&offset=${offset}&sort=+id`);
      out.push(...page.data);
      if (page.data.length < 500 || out.length >= page.total) return out;
    }
  };
  const text = (html) => String(html ?? '')
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .split(/\n+/).map((s) => s.trim()).filter(Boolean).join('\n');

  try {
    await api('GET', '/books?count=1');
  } catch (e) {
    throw new Error(`bookstack: the API token is refused (${e.message}) — run bash bench/thirdparty/bookstack/seed.sh first`);
  }

  for (const s of await all('/shelves')) {
    await api('DELETE', `/shelves/${s.id}`);
    log(`bookstack: deleted shelf "${s.name}"`);
  }

  // Books: exactly the seed set, untagged. Deleting a book takes its contents with it.
  const BOOKS = [
    { name: 'Bench Handbook', description: 'How the bench team works.' },
    { name: 'Bench Handbooks', description: 'An older copy of the handbook, kept for reference.' },
  ];
  const bookIds = {};
  for (const b of await all('/books')) {
    const keep = BOOKS.some((x) => x.name === b.name) && !bookIds[b.name] &&
      !((await api('GET', `/books/${b.id}`)).tags ?? []).length;
    if (keep) { bookIds[b.name] = b.id; continue; }
    await api('DELETE', `/books/${b.id}`);
    log(`bookstack: deleted book "${b.name}" (and its contents)`);
  }
  for (const b of BOOKS) {
    if (bookIds[b.name]) continue;
    bookIds[b.name] = (await api('POST', '/books', b)).id;
    log(`bookstack: seeded book "${b.name}"`);
  }

  // Chapters: exactly the seed set, untagged. Deleting a chapter takes its pages with it.
  const CHAPTERS = [
    ['Bench Handbook', 'Release Notes'],
    ['Bench Handbook', 'Release Notes Archive'],
    ['Bench Handbooks', 'Release Notes'],
  ];
  const keptChapters = new Set();
  for (const c of await all('/chapters')) {
    const key = CHAPTERS.find(([bn, cn]) => bookIds[bn] === c.book_id && cn === c.name);
    const keep = key && !keptChapters.has(key.join('/')) && !((await api('GET', `/chapters/${c.id}`)).tags ?? []).length;
    if (keep) { keptChapters.add(key.join('/')); continue; }
    await api('DELETE', `/chapters/${c.id}`);
    log(`bookstack: deleted chapter "${c.name}" (and its pages)`);
  }
  for (const [bn, cn] of CHAPTERS) {
    if (keptChapters.has(`${bn}/${cn}`)) continue;
    await api('POST', '/chapters', { book_id: bookIds[bn], name: cn });
    log(`bookstack: seeded chapter "${cn}" in "${bn}"`);
  }

  // Pages (drafts included): exactly the seed set, each as seeded.
  const SEED = [
    { name: 'Seed: Getting started', body: 'How a new member finds their way around.', tag: ['Review Status', 'Approved'] },
    { name: 'Seed: Release checklist', body: 'The steps every release goes through.', tag: ['Review Status', 'Draft'] },
    { name: 'Seed: House style', body: 'How we write here.', tag: ['Review State', 'Approved'] },
  ];
  let removed = 0;
  for (const row of await all('/pages')) {
    const s = SEED.find((x) => x.name === row.name && !x.kept);
    let pristine = false;
    if (s && !row.draft && row.book_id === bookIds['Bench Handbook'] && !row.chapter_id && !row.template) {
      const p = await api('GET', `/pages/${row.id}`);
      const comments = [...(p.comments?.active ?? []), ...(p.comments?.archived ?? [])];
      pristine = p.revision_count === 1 && text(p.html) === s.body && !comments.length &&
        (p.tags ?? []).map((t) => `${t.name}=${t.value}`).join(',') === s.tag.join('=');
    }
    if (pristine) { s.kept = true; continue; }
    try {
      await api('DELETE', `/pages/${row.id}`);
      removed++;
    } catch (e) {
      if (!row.draft) throw e;
      log(`bookstack: WARNING could not delete draft page ${row.id}: ${e.message}`);
    }
  }
  log(removed ? `bookstack: deleted ${removed} page(s) (earlier runs', drafts and non-seed)` : 'bookstack: no pages to delete');
  for (const s of SEED) {
    if (s.kept) continue;
    await api('POST', '/pages', {
      book_id: bookIds['Bench Handbook'], name: s.name, html: `<p>${s.body}</p>`,
      tags: [{ name: s.tag[0], value: s.tag[1] }],
    });
    log(`bookstack: seeded page "${s.name}"`);
  }

  // Comments: none anywhere (pages deleted above took theirs into the recycle bin).
  for (const c of await all('/comments')) {
    await api('DELETE', `/comments/${c.id}`);
    log(`bookstack: deleted comment #${c.id}`);
  }

  // Recycle bin: emptied, so a deleted page's tags stop being suggested and
  // nothing deleted can be restored into the next run.
  const deletions = await all('/recycle-bin');
  for (const d of deletions) await api('DELETE', `/recycle-bin/${d.id}`);
  if (deletions.length) log(`bookstack: emptied the recycle bin (${deletions.length} deletion(s))`);
}
```

And in `const RESETS = { ... }`, after `erpnext: resetErpnext,`:

```js
  bookstack: resetBookstack,
```

## (b) bench/app-defaults.mjs — in APP_DEFAULTS, after the `erpnext` entry

```js
  // bench/thirdparty/bookstack/seed.sh turns the install's default admin
  // (admin@admin.com / password) into this one. BookStack signs in by email.
  bookstack: {
    APP_URL: 'http://127.0.0.1:8103/',
    APP_EMAIL: 'admin@bench.local',
    APP_PASSWORD: 'bench-admin-pass',
  },
```

## (c) bench/harness.mjs — in TARGETS, after the `erpnext` entry

```js
  bookstack: {
    task: 'tasks/bookstack-page-flow.md',
    defaults: APP_DEFAULTS.bookstack,
    // Reset is also the idempotent seed (after seed.sh's admin and API token) — see resetBookstack.
    reset: () => resetTarget('bookstack'),
    notReadyHint:
      'Start it with: docker compose -f bench/thirdparty/bookstack/docker-compose.yml up -d (then seed.sh once)',
  },
```

## (d) bench/cloud-setup.sh — a case in the `case "$WITH_TARGET" in` block, after `erpnext)`

```bash
    bookstack)
      # nginx + php-fpm + MariaDB; the image migrates on start (~30-60s warm),
      # allow five minutes on a cold box. /login answers 200 once it serves.
      for _ in $(seq 1 150); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8103/login || true)"
        [ "$code" = "200" ] && break; sleep 2
      done
      echo "    bookstack login page: HTTP ${code:-unreachable}"
      [ "$code" = "200" ] || { docker compose -f bench/thirdparty/bookstack/docker-compose.yml logs --tail 40 app || true; die "bookstack /login is not 200"; }
      # seed.sh turns the default admin into admin@bench.local and installs the
      # fixed API token (skips both when done); the reset is the idempotent
      # seed for everything else, as for kanboard.
      bash bench/thirdparty/bookstack/seed.sh
      node bench/reset-app.mjs --target bookstack
      ;;
```

## (e) bench/thirdparty/README.md — a row in "The set" table, after ERPNext

```markdown
| BookStack 25.12 | 8103 | Laravel Blade; **TinyMCE WYSIWYG page editor with draft autosave (only Save Page publishes)**; free-text tag name/value inputs with suggestions; shelf/book/chapter/page hierarchy with a separate Move page; page comments; name-derived slugs (held out) | admin@bench.local / bench-admin-pass |
```

and add `bookstack` to the list in `bash bench/thirdparty/<name>/seed.sh      # odoo, openproject, gitea, snipeit and erpnext only`.

## Notes

- Image: `linuxserver/bookstack:v25.12.9-ls251` (BookStack v25.12.9, the last 25.x; the protocol names
  BookStack 25 and the comment API needs 25.11+). DB: `mariadb:11.4.13` (same pin as snipeit).
  Newer exists (`v26.09.1-ls287`); not used, to keep to the protocol's "BookStack 25".
- API token (fixed, installed by seed.sh, no token file): token_id `benchbookstacktokenid00000000001`,
  secret `benchbookstacktokensecret0000001`, header `Authorization: Token <id>:<secret>`.
  Override everywhere with `BOOKSTACK_API_TOKEN=<id>:<secret>`.
- The API token belongs to the SAME user the task signs in as. That is deliberate: BookStack shows a
  draft page only to its creator, so this is the only way the reset and the verifier can see the
  drafts a run abandoned.
- Oracle: every objective goes through the REST API; nothing needs tinker. The move is
  `PUT /api/pages/{id}` with `chapter_id` (the API runs PageRepo::move, the same as the Move page).
- The oracle's own run leaves its page and comment; verifying a DIFFERENT runid without a reset in
  between reports them as EXTRA MUTATIONs (correctly).

## UNVERIFIED (to be proven by the first box with the oracle)

1. The linuxserver tag `v25.12.9-ls251` pulls and serves BookStack 25.12.9 on port 80 with
   `/app/www/artisan`, and migrates the DB on start (docs: code at /app/www).
2. `docker exec -u abc` works in that image (abc is its app user, home /config) and `php` is on PATH;
   tinker writes its psysh config there. If not, drop `-u abc` (then check storage/ ownership).
3. Extra env vars (`API_REQUESTS_PER_MIN`, `APP_TIMEZONE`, `MAIL_DRIVER`) reach Laravel in the
   linuxserver image (php-fpm `clear_env`). Only the rate limit matters: at the default 180/min a
   reset + verify (~30-40 calls on a clean app) fits anyway.
4. seed.sh's tinker block: `BookStack\Users\Models\User`, `Role::getSystemRole("admin")`,
   `$u->attachRole`, `BookStack\Api\ApiToken` columns (token_id, secret, name, user_id, expires_at)
   as read from the v25.12.9/v26.09.1 sources; `email_confirmed` assignable; the User model does not
   double-hash a `Hash::make` value (Laravel's `hashed` cast skips already-hashed values).
5. The Admin role carries "Access System API" (access-api) on a fresh 25.12 install (seed.sh checks
   GET /api/books = 200 and exits 1 otherwise).
6. `GET /api/pages` lists the token user's own draft pages with `draft: true`
   (Page::scopeVisible → restrictDraftsOnPageQuery), and `DELETE /api/pages/{id}` deletes a draft.
   The reset only warns if the draft delete fails.
7. `POST /api/pages` sets `revision_count` to 1 (the verifier and the reset treat any other count on
   a seed page as modified). If a fresh API-created page reports 0, change both checks to `<= 1`.
8. Listing endpoints accept `count=500&offset=N&sort=+id` on books, chapters, pages, shelves,
   comments and recycle-bin, and return `{data, total}`; `/api/recycle-bin` is allowed for the Admin
   role; `DELETE /api/recycle-bin/{id}` destroys a deletion and the comments of a destroyed page.
9. `/api/comments` list rows carry `commentable_type: "page"` and `commentable_id` = the page id
   (26.x response examples; 25.12's examples show the same), and the page read's
   `comments.active/archived` tree is `{comment, depth, children}`.
10. The page `html` returned by the API keeps `<h2>`..`<h4>` for TinyMCE's heading formats and
    `<p>` paragraphs (with BookStack's `id="bkmrk-..."` attributes, which the text extraction ignores).
11. Slugs: `Str::slug("<runid> Bench Page")`, e.g. `bsor1-bench-page`; a ` -xyz` random suffix only
    on a clash in the same book (never after a reset, which empties the recycle bin).
12. Not reset (no API): per-user UI preferences (book list/grid view, editor choice, dark mode) and
    "update drafts" a run left on a seed page by opening its editor without saving. Neither changes
    any record the verifier reads; a leftover update draft would show a "you have a draft" notice
    when that seed page's editor is next opened.
