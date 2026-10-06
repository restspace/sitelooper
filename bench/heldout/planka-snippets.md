# planka (pk): snippets for the shared files

Held-out target (notes/HELDOUT2-PROTOCOL.md): Planka 2.2.1 kanban, port 8104, code `pk`.
Own files: `bench/thirdparty/planka/docker-compose.yml`, `bench/tasks/planka-card-flow.md`,
`bench/verify-planka.mjs`, `bench/oracle-planka.mjs`. No seed.sh: the image's start.sh
(`node db/init.js`) migrates and creates the admin from DEFAULT_ADMIN_* on every start, and
the reset completes the admin's first-sign-in terms acceptance through the API and builds
every user, project, board, list, label and card.

Prove the infrastructure on the first box (no tool involved):

    bash bench/heldout/bring-up.sh planka                                                 # or: compose up + reset
    node bench/oracle-planka.mjs pkoracle1 && node bench/verify-planka.mjs pkoracle1        # 7/7 PASS, exit 0
    node bench/reset-app.mjs --target planka                                                # reset deletes the oracle's card (and its comment)
    node bench/verify-planka.mjs pkuntouched1                                               # 2-6 FAIL, 1+7 UNVERIFIABLE (no result file), exit 1
    node bench/reset-app.mjs --target planka                                                # second reset: "no cards to delete", nothing created
    # browser check (once): sign in at http://127.0.0.1:8104/ as admin@example.com — no terms
    # dialog, Bench Project > Bench Board shows To Do (3 Seed: cards), In Progress, Done.

## (a) bench/app-reset.mjs

Insert this function just above `function resetAtelyr()` (it uses the file's own `log`):

```js
/**
 * Planka reset doubles as the SEED. Planka's env bootstrap makes only the
 * admin; the admin's first sign-in then meets a terms-acceptance step, which
 * this completes through the API (the terms signature from GET /api/terms), so
 * neither the reset nor the browser meets it again. Then, through the REST API:
 * users "Bench Tester" and the look-alike "Bench Tester Lead"; one shared
 * project "Bench Project" with one board "Bench Board" (kanban view, project
 * cards) whose members are exactly the admin and both testers (editors);
 * active lists "To Do", "In Progress", "Done"; labels "Hardware" plus the
 * look-alikes "Hardware Return" and "Hardware Spares", "Software" and
 * "Network"; three "Seed:" cards in To Do with only a one-line description.
 * Everything else is DELETED: every other card on the board (earlier runs'
 * "<runid> Bench Card"s, copies, cards in the archive and trash lists, and
 * with them their comments, labels, members and tasks), any other list, label
 * or board member, board-level custom fields, and any other project or board
 * (a run can create them). Kept records keep their ids, so a run's recorded
 * board url stays valid across resets; a card id is a fresh snowflake every
 * run, so a stored id can never pass by coincidence.
 *
 * Auth: the admin's password (POST /api/access-tokens) -> JWT bearer; the
 * session is signed out at the end.
 */
async function resetPlanka() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8104/').replace(/\/$/, '');
  const email = process.env.PLANKA_EMAIL || 'admin@example.com';
  const password = process.env.PLANKA_PASSWORD || 'bench-admin-pass';
  let bearer = null;
  const call = async (method, route, body) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
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
    if (!r.res.ok) throw new Error(`planka ${method} ${route}: HTTP ${r.res.status} ${r.text.slice(0, 300)}`);
    return r.json;
  };
  const byId = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
  const GAP = 65536;

  // ---- sign in (accepting the terms on the first sign-in) -------------------
  let login = await call('POST', '/api/access-tokens', { emailOrUsername: email, password });
  if (login.res.status === 403 && login.json?.step === 'accept-terms' && login.json.pendingToken) {
    const terms = await api('GET', '/api/terms');
    login = await call('POST', '/api/access-tokens/accept-terms', {
      pendingToken: login.json.pendingToken, signature: terms.item.signature, initialLanguage: 'en-US',
    });
    if (login.res.ok) log('planka: accepted the terms for the admin (first sign-in)');
  }
  if (!login.res.ok || typeof login.json?.item !== 'string') {
    throw new Error(`planka: ${email} cannot sign in: HTTP ${login.res.status} ${login.text.slice(0, 300)}`);
  }
  bearer = login.json.item;

  try {
    // ---- users ----------------------------------------------------------------
    const me = (await api('GET', '/api/users/me')).item;
    const USERS = [
      { name: 'Bench Tester', username: 'benchtester', email: 'tester@example.com' },
      { name: 'Bench Tester Lead', username: 'benchtesterlead', email: 'lead@example.com' },
    ];
    const users = (await api('GET', '/api/users')).items;
    const userIds = {};
    for (const u of USERS) {
      const found = users.filter((x) => String(x.email).toLowerCase() === u.email).sort(byId)[0];
      if (found) {
        if (found.name !== u.name) await api('PATCH', `/api/users/${found.id}`, { name: u.name });
        userIds[u.name] = found.id;
        continue;
      }
      userIds[u.name] = (await api('POST', '/api/users', {
        ...u, password: 'bench-tester-pass-2026', role: 'boardUser',
      })).item.id;
      log(`planka: created user "${u.name}"`);
    }

    // ---- project and board ------------------------------------------------------
    const PROJECT = 'Bench Project';
    const BOARD = 'Bench Board';
    let projectsRes = await api('GET', '/api/projects');
    let project = projectsRes.items.filter((p) => p.name === PROJECT && !p.ownerProjectManagerId).sort(byId)[0];
    // Any other project (a run can create one) goes, boards first.
    for (const p of projectsRes.items) {
      if (project && p.id === project.id) continue;
      for (const b of projectsRes.included.boards.filter((x) => x.projectId === p.id)) {
        await api('DELETE', `/api/boards/${b.id}`);
      }
      await api('DELETE', `/api/projects/${p.id}`);
      log(`planka: deleted project "${p.name}"`);
    }
    if (!project) {
      project = (await api('POST', '/api/projects', { type: 'shared', name: PROJECT })).item;
      log(`planka: created project "${PROJECT}"`);
      projectsRes = await api('GET', '/api/projects');
    }
    const boards = projectsRes.included.boards.filter((b) => b.projectId === project.id).sort(byId);
    let board = boards.find((b) => b.name === BOARD) ?? null;
    for (const b of boards) {
      if (board && b.id === board.id) continue;
      await api('DELETE', `/api/boards/${b.id}`);
      log(`planka: deleted board "${b.name}"`);
    }
    if (!board) {
      board = (await api('POST', `/api/projects/${project.id}/boards`, { position: GAP, name: BOARD })).item;
      log(`planka: created board "${BOARD}"`);
    }
    const BOARD_SETTINGS = {
      position: GAP, defaultView: 'kanban', defaultCardType: 'project', limitCardTypesToDefaultOne: false,
      alwaysDisplayCardCreator: false, displayCardAges: false, expandTaskListsByDefault: false,
    };
    const boardDrift = Object.fromEntries(Object.entries(BOARD_SETTINGS).filter(([k, v]) => board[k] !== undefined && board[k] !== v));
    if (Object.keys(boardDrift).length) {
      await api('PATCH', `/api/boards/${board.id}`, boardDrift);
      log(`planka: restored board settings ${Object.keys(boardDrift).join(', ')}`);
    }

    let { included: inc } = await api('GET', `/api/boards/${board.id}`);

    // ---- members: exactly the admin and both testers, editors -----------------
    const wantMembers = [me.id, userIds['Bench Tester'], userIds['Bench Tester Lead']];
    for (const m of inc.boardMemberships) {
      if (!wantMembers.includes(m.userId)) {
        await api('DELETE', `/api/board-memberships/${m.id}`);
        log(`planka: removed board member #${m.userId}`);
      } else if (m.role !== 'editor') {
        await api('PATCH', `/api/board-memberships/${m.id}`, { role: 'editor' });
      }
    }
    for (const userId of wantMembers) {
      if (inc.boardMemberships.some((m) => m.userId === userId)) continue;
      await api('POST', `/api/boards/${board.id}/board-memberships`, { userId, role: 'editor' });
      log(`planka: added board member #${userId}`);
    }

    // ---- cards: exactly the seed set, each as seeded -----------------------------
    const LISTS = ['To Do', 'In Progress', 'Done'];
    const kanban = inc.lists.filter((l) => l.type === 'active' || l.type === 'closed').sort(byId);
    const listIds = {};
    for (const l of kanban) if (l.type === 'active' && LISTS.includes(l.name) && !listIds[l.name]) listIds[l.name] = l.id;
    const SEED = [
      { name: 'Seed: Replace the office router', description: 'The office router drops connections every afternoon.' },
      { name: 'Seed: Order spare keyboards', description: 'Two keyboards in the meeting room have sticky keys.' },
      { name: 'Seed: Renew the domain name', description: 'The company domain expires at the end of next month.' },
    ];
    // Every card the board holds: the board view's (active and closed lists)
    // plus the archive and trash lists', which page by 50.
    const endless = inc.lists.filter((l) => l.type === 'archive' || l.type === 'trash');
    const listCards = async (listId) => {
      const out = [];
      let before = null;
      for (;;) {
        const q = before ? `?before[id]=${before.id}&before[listChangedAt]=${encodeURIComponent(before.listChangedAt)}` : '';
        const page = (await api('GET', `/api/lists/${listId}/cards${q}`)).items ?? [];
        const fresh = page.filter((c) => !out.some((o) => o.id === c.id));
        out.push(...fresh);
        if (page.length < 50 || !fresh.length) break;
        before = { id: page[page.length - 1].id, listChangedAt: page[page.length - 1].listChangedAt };
      }
      return out;
    };
    const cards = [...inc.cards];
    for (const l of endless) cards.push(...await listCards(l.id));
    cards.sort(byId);
    const has = (rows, cardId) => (rows ?? []).some((r) => r.cardId === cardId);
    const doomed = [];
    for (const c of cards) {
      const i = SEED.findIndex((s) => s.name === c.name);
      const s = SEED[i];
      let pristine = s && !s.kept && listIds['To Do'] && c.listId === listIds['To Do'] &&
        c.type === 'project' && c.description === s.description && !c.dueDate && !c.isDueCompleted &&
        !c.stopwatch && !c.coverAttachmentId && !c.isClosed && !c.commentsTotal &&
        !has(inc.cardLabels, c.id) && !has(inc.cardMemberships, c.id) && !has(inc.taskLists, c.id) &&
        !has(inc.attachments, c.id) && !has(inc.customFieldValues, c.id) &&
        !(inc.customFieldGroups ?? []).some((g) => g.cardId === c.id);
      if (pristine) {
        const comments = (await api('GET', `/api/cards/${c.id}/comments`)).items ?? [];
        pristine = comments.length === 0;
      }
      if (pristine) {
        s.kept = true;
        if (c.position !== GAP * (i + 1)) await api('PATCH', `/api/cards/${c.id}`, { position: GAP * (i + 1) });
        continue;
      }
      doomed.push(c);
    }
    for (const c of doomed) await api('DELETE', `/api/cards/${c.id}`);
    log(doomed.length ? `planka: deleted ${doomed.length} card(s) (earlier runs' and non-seed)` : 'planka: no cards to delete');

    // ---- lists: exactly To Do, In Progress, Done (after the cards: a deleted
    // list's cards would move to the trash list) ------------------------------
    for (const l of kanban) {
      if (Object.values(listIds).includes(l.id)) continue;
      await api('DELETE', `/api/lists/${l.id}`);
      log(`planka: deleted list "${l.name}"`);
    }
    for (const [i, name] of LISTS.entries()) {
      const l = kanban.find((x) => x.id === listIds[name]);
      if (!l) {
        listIds[name] = (await api('POST', `/api/boards/${board.id}/lists`, { type: 'active', position: GAP * (i + 1), name })).item.id;
        log(`planka: created list "${name}"`);
      } else if (l.position !== GAP * (i + 1) || l.color) {
        await api('PATCH', `/api/lists/${l.id}`, { position: GAP * (i + 1), color: null });
      }
    }

    // ---- labels: exactly the five, each with its colour --------------------------
    const LABELS = [
      { name: 'Hardware', color: 'lagoon-blue' },
      { name: 'Hardware Return', color: 'egg-yellow' },
      { name: 'Hardware Spares', color: 'desert-sand' },
      { name: 'Software', color: 'fresh-salad' },
      { name: 'Network', color: 'midnight-blue' },
    ];
    const labelIds = {};
    for (const l of [...inc.labels].sort(byId)) {
      const want = LABELS.findIndex((x) => x.name === l.name);
      if (want >= 0 && !labelIds[l.name]) {
        labelIds[l.name] = l.id;
        if (l.color !== LABELS[want].color || l.position !== GAP * (want + 1)) {
          await api('PATCH', `/api/labels/${l.id}`, { color: LABELS[want].color, position: GAP * (want + 1) });
        }
        continue;
      }
      await api('DELETE', `/api/labels/${l.id}`);
      log(`planka: deleted label "${l.name ?? '(unnamed)'}"`);
    }
    for (const [i, l] of LABELS.entries()) {
      if (labelIds[l.name]) continue;
      await api('POST', `/api/boards/${board.id}/labels`, { position: GAP * (i + 1), name: l.name, color: l.color });
      log(`planka: created label "${l.name}"`);
    }

    // Board-level custom field groups (a run can add them from the board menu).
    for (const g of (inc.customFieldGroups ?? []).filter((x) => x.boardId === board.id)) {
      await api('DELETE', `/api/custom-field-groups/${g.id}`);
      log(`planka: deleted custom field group "${g.name ?? g.id}"`);
    }

    for (const [i, s] of SEED.entries()) {
      if (s.kept) continue;
      await api('POST', `/api/lists/${listIds['To Do']}/cards`, {
        type: 'project', position: GAP * (i + 1), name: s.name, description: s.description,
      });
      log(`planka: seeded card "${s.name}"`);
    }
  } finally {
    await call('DELETE', '/api/access-tokens/me').catch(() => {});
  }
}
```

and add to `RESETS`, after `directus: resetDirectus,`:

```js
  planka: resetPlanka,
```

## (b) bench/app-defaults.mjs — APP_DEFAULTS entry (after `directus`)

```js
  // The image's db/init.js creates this admin from DEFAULT_ADMIN_* in the
  // compose file on every start; the reset accepts the first-sign-in terms
  // through the API, so a sign-in lands on the projects page. Planka signs in
  // by email or username (benchadmin).
  planka: {
    APP_URL: 'http://127.0.0.1:8104/',
    APP_EMAIL: 'admin@example.com',
    APP_PASSWORD: 'bench-admin-pass',
  },
```

## (c) bench/harness.mjs — TARGETS entry (after `directus`)

```js
  planka: {
    task: 'tasks/planka-card-flow.md',
    defaults: APP_DEFAULTS.planka,
    // Reset is also the idempotent seed (and accepts the admin's terms) — see resetPlanka.
    reset: () => resetTarget('planka'),
    notReadyHint: 'Start it with: docker compose -f bench/thirdparty/planka/docker-compose.yml up -d',
  },
```

## (d) bench/cloud-setup.sh — case block (after the `directus)` block, before `esac`)

```bash
    planka)
      # Node (Sails) + Postgres; start.sh runs db/init.js (migrations, the admin
      # from DEFAULT_ADMIN_*) before the server, ~15-40s warm after Postgres is
      # healthy; allow five minutes on a cold box. / serves the SPA's index (200)
      # unauthenticated once the server has lifted.
      for _ in $(seq 1 150); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8104/ || true)"
        [ "$code" = "200" ] && break; sleep 2
      done
      echo "    planka index: HTTP ${code:-unreachable}"
      [ "$code" = "200" ] || { docker compose -f bench/thirdparty/planka/docker-compose.yml logs --tail 40 || true; die "planka does not answer /"; }
      # No seed.sh: the reset accepts the admin's terms on first use and is the
      # idempotent seed for everything else, as for kanboard.
      node bench/reset-app.mjs --target planka
      ;;
```

## (e) bench/heldout/bring-up.sh — case line (with the other targets)

```bash
  planka)    url=http://127.0.0.1:8104/ ;;
```

(no seed step: the script's closing `node bench/reset-app.mjs --target "$t"` does it all;
also add `planka` to the usage strings.)

## (f) bench/thirdparty/README.md — table row (after Directus)

```markdown
| Planka 2.2 | 8104 | React + Redux SPA over Sails.js with a live socket, history routes; **card modal over the board**; label popover with search that can also create a label; board-member popover; due-date popover (date + time fields); markdown/WYSIWYG description; comments under the card; snowflake ids only in the url (/cards/&lt;id&gt;) | admin@example.com / bench-admin-pass |
```

## (g) bench/heldout/score.mjs (if heldout2 reuses it) — APPS entry

```js
pk: 'planka',
```

## UNVERIFIED (nothing here has run against a real Planka; the first box tests these with the oracle)

Checked against the Planka source at tag v2.2.1 (shallow clone: server controllers, policies,
helpers, models, db seed, start.sh, client routes) and the upstream docker-compose.yml, and
the reset/oracle/verifier were smoke-run against a hand-written in-memory mock of the routes
(first reset accepts terms and seeds; oracle 7/7 PASS; untouched 0/7 with 1+7 UNVERIFIABLE;
a deliberately dirty run — duplicate card, new look-alike label, wrong member, doubled
description, double comment, comment on and move of a seed, extra list — flagged every one,
and the next reset cleaned it all; a further reset is a no-op). Still unverified on a live
instance:

1. Image `ghcr.io/plankanban/planka:2.2.1` exists (seen in the ghcr tag list; release v2.2.1,
   2026-08-10). Not pulled. `postgres:16-alpine` as upstream's compose.
2. The named volume at `/app/data` is writable by the image's `node` user (upstream's compose
   uses the same named-volume layout). If uploads fail with EACCES, this is why (not needed
   by the task).
3. `OUTGOING_BLOCKED_HOSTS: ""` (set but empty) makes start.sh skip the internal Squid
   proxy (source: `start_outgoing_proxy_if_needed`). If compose drops an empty value the
   proxy starts with its defaults, which is harmless.
4. First sign-in: POST /api/access-tokens answers 403 `{step: "accept-terms", pendingToken}`
   for an admin who has not accepted; the reset reads `GET /api/terms` -> `item.signature`
   and posts `/api/access-tokens/accept-terms`, which also marks the instance initialized.
   The browser should then never show the terms dialog. Confirm with one browser sign-in.
5. JSON request bodies are accepted for every POST/PATCH (the swagger shows
   multipart/form-data for board create; Sails parses JSON too).
6. `GET /api/projects` as admin returns shared projects plus `included.boards`; `GET
   /api/boards/:id` returns `included.{lists, labels, cards, cardLabels, cardMemberships,
   boardMemberships, users, taskLists, attachments, customFieldGroups, customFieldValues}`;
   cards only from active/closed lists. Archive/trash cards come from `GET
   /api/lists/:id/cards` (50 per page; the `before[id]`/`before[listChangedAt]` bracket query
   form is assumed to reach the `before` json input — only matters past 50 cards).
7. `DELETE /api/cards/:id` hard-deletes (comments, labels, memberships with it). The UI's
   card "Delete" may instead move a card to the trash list; the verifier ignores trash-list
   cards for duplicates and strays, the reset deletes them.
8. Card `dueDate` comes back as an ISO timestamp. The UI's due-date popover defaults to 12:00
   local; the verifier accepts any instant that is 2026-12-31 somewhere in UTC-12..UTC+14.
9. The description is stored verbatim (markdown); the seed-pristine check compares it exactly.
   If Planka normalises it, every reset re-seeds the three cards (noisy, harmless).
10. Card ids are snowflake strings (e.g. "1357158568008091264"); the UI route is `/cards/<id>`.
    The verifier's obj 7 requires the id not embedded in a longer digit run.
11. `POST /api/users` password must score zxcvbn >= 2 (`bench-tester-pass-2026`). Users are
    never deleted by the reset (a run cannot reasonably create one); only board memberships
    are normalised.
12. The label popover's "Create new label" and the members popover are left at Planka
    defaults; the task's notes state both look-alikes neutrally.
13. The untouched-run check gives obj 1 and 7 UNVERIFIABLE rather than FAIL when no result
    file exists (same as verify-directus).
14. No IPv6 or `.local` hazards: no nginx in the image (Sails listens directly; Node falls
    back to IPv4 when IPv6 is off), emails are `@example.com`, no CLI exec needs HOME.
15. `BASE_URL` takes a comma list (first = canonical); 127.0.0.1 and localhost are both
    accepted origins for the socket/CORS checks. The harness's APP_URL uses 127.0.0.1.
