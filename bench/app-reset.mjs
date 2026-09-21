/**
 * Per-target app reset: put the app back to a state where the NEXT run starts
 * where the last one started.
 *
 * This exists because `bench/reset-app.mjs` was hardcoded to repairdesk — it
 * POSTed `/__reset` to whatever APP_URL happened to be. On a grafana or odoo
 * replay that 404s, and the sweep ignored the exit code, so **replay runs on
 * those targets got no reset at all**. The harness had a working grafana reset
 * the whole time; the sweep just never called it.
 *
 * The cost was not a slow run, it was wrong evidence:
 *
 *   fwgr13  all three runs reported dashboard uid dfwq7fnd2d81sa. The replays
 *           RENAMED run 1's dashboard instead of making their own, and the one
 *           objective needing a created artifact failed on both.
 *   fwod20  n1 created S00021, n2 S00022, n3 S00023, all still in the orders
 *           list together. A replay looking for "the" order could find three.
 *
 * It also blocks the cleanup assumption in PLAN-evidence-over-shape.md: if the
 * last run's records are still there, "the recorded value is still on the page"
 * stops meaning "the app puts it there every run" and starts meaning "the last
 * run left it behind" — which would inline a live record identity, the one
 * failure direction the plan forbids.
 *
 * Cleanup lives HERE, at the run boundary, rather than as a final step of each
 * task, because verification is app-side and runs after the task: a task that
 * deleted its own order would leave verify-odoo nothing to check. What each
 * reset removes is strictly EARLIER runs' debris, and every verifier matches
 * its own runid, so a reset can never erase the evidence for the run being
 * scored.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const log = (m) => console.error(`[reset] ${m}`);

/** Everything the bench creates is named for its run; nothing else matches. */
const BENCH_CUSTOMER = '% Bench Customer';

async function resetRepairdesk() {
  const url = new URL('/__reset', process.env.APP_URL || 'http://127.0.0.1:4180/');
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`repairdesk reset failed: ${res.status} ${res.statusText}`);
  log(`repairdesk: reloaded seed via ${url}`);
}

async function resetGrafana() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:3000/').replace(/\/$/, '');
  const auth =
    'Basic ' + Buffer.from(`${process.env.APP_EMAIL || 'admin'}:${process.env.APP_PASSWORD || 'admin'}`).toString('base64');
  // Everything the task creates carries the `bench` tag, and provisioned
  // dashboards refuse API deletion, so this can only remove benchmark debris.
  const res = await fetch(`${base}/api/search?tag=bench&type=dash-db`, { headers: { authorization: auth } });
  if (!res.ok) throw new Error(`grafana search failed: ${res.status}`);
  const hits = await res.json();
  for (const h of hits) {
    const del = await fetch(`${base}/api/dashboards/uid/${h.uid}`, { method: 'DELETE', headers: { authorization: auth } });
    log(`grafana: deleted leftover dashboard "${h.title}" (${del.status})`);
  }
  if (!hits.length) log('grafana: no leftover bench-tagged dashboards');
}

async function resetOdoo() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8069/').replace(/\/$/, '');
  const db = process.env.ODOO_DB || 'bench';
  const login = process.env.APP_EMAIL || 'admin';
  const password = process.env.APP_PASSWORD || 'admin';
  let rpcId = 0;
  const rpc = async (service, method, args) => {
    const res = await fetch(`${base}/jsonrpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'call', params: { service, method, args } }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.data?.message || body.error.message);
    return body.result;
  };
  const uid = await rpc('common', 'login', [db, login, password]);
  if (!uid) throw new Error('odoo: could not authenticate — check APP_EMAIL/APP_PASSWORD/ODOO_DB');
  const kw = (model, method, args, kwargs = {}) => rpc('object', 'execute_kw', [db, uid, password, model, method, args, kwargs]);

  const partners = await kw('res.partner', 'search', [[['name', 'like', BENCH_CUSTOMER]]]);
  if (!partners.length) {
    log('odoo: no leftover bench customers');
    return;
  }
  const orders = await kw('sale.order', 'search', [[['partner_id', 'in', partners]]]);
  if (orders.length) {
    // A CONFIRMED order refuses deletion, so cancel first and delete after.
    //
    // There is no archive fallback: `sale.order` has NO `active` field in Odoo
    // 17. Reaching for one cost set 6 both odoo replays —
    //   [reset-app] odoo reset FAILED: Invalid field 'active' on model 'sale.order'
    // — and the error the operator saw was the fallback's, not the reason the
    // delete was refused, which is the more useful fact. So: cancel, delete,
    // and if that still fails, say why and let it fail. A dirty baseline is
    // exactly what this reset exists to prevent, and guessing at a workaround
    // is how the real reason gets hidden.
    // `action_cancel` is NOT enough. On a SENT quotation Odoo 17 routes it
    // through a `sale.order.cancel` wizard rather than cancelling in place, so
    // the call returns an action dict, the order stays sent, and the unlink
    // below is refused:
    //
    //   [reset-app] odoo reset FAILED: You can not delete a sent quotation or a
    //   confirmed sales order. You must first cancel it.
    //
    // That cost fwod25 its third run. It only surfaced now because fwod24's
    // task cancelled the order itself; fwod25 halted before it got there, so
    // the reset met a state the previous sweep never left behind.
    //
    // Writing the state directly is what a wizard-free cancel amounts to, and
    // it applies to every state the button refuses. The error is no longer
    // swallowed: an empty catch here is what hid the reason last time.
    try {
      await kw('sale.order', 'action_cancel', [orders]);
    } catch (err) {
      log(`odoo: action_cancel refused (${err.message}) — cancelling by state instead`);
    }
    const stuck = await kw('sale.order', 'search', [[['id', 'in', orders], ['state', '!=', 'cancel']]]);
    if (stuck.length) {
      await kw('sale.order', 'write', [stuck, { state: 'cancel' }]);
      log(`odoo: force-cancelled ${stuck.length} order(s) the Cancel action left uncancelled`);
    }
    await kw('sale.order', 'unlink', [orders]);
    log(`odoo: deleted ${orders.length} leftover bench order(s)`);
  }
  // res.partner DOES have `active`, and a partner referenced by anything the
  // reset could not remove legitimately refuses deletion. Archiving takes it
  // out of every default view, which is what a later run needs.
  try {
    await kw('res.partner', 'unlink', [partners]);
    log(`odoo: deleted ${partners.length} leftover bench customer(s)`);
  } catch (err) {
    await kw('res.partner', 'write', [partners, { active: false }]);
    log(`odoo: archived ${partners.length} leftover bench customer(s) (delete refused: ${err.message})`);
  }
}

/**
 * Kanboard reset doubles as the SEED, because both are the same idempotent
 * statement of the baseline: project "Bench Board" exists with its three
 * seed tasks in Backlog, and no "<runid> Bench Task" from an earlier run
 * survives. The application API (Basic jsonrpc:<token>, token pinned in the
 * mounted config.php) reaches everything; nothing here touches the current
 * run's records, because at reset time every matching task is an earlier
 * run's by definition.
 */
async function resetKanboard() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8085/').replace(/\/$/, '');
  const token = process.env.KANBOARD_API_TOKEN || 'bench-api-token';
  const auth = 'Basic ' + Buffer.from(`jsonrpc:${token}`).toString('base64');
  let rpcId = 0;
  const rpc = async (method, params = {}) => {
    const res = await fetch(`${base}/jsonrpc.php`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    if (!res.ok) throw new Error(`kanboard rpc ${method}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`kanboard rpc ${method}: ${body.error.message}`);
    return body.result;
  };

  let project = await rpc('getProjectByName', { name: 'Bench Board' });
  if (!project) {
    const id = await rpc('createProject', { name: 'Bench Board' });
    if (!id) throw new Error('kanboard: could not create the Bench Board project');
    project = await rpc('getProjectById', { project_id: id });
    log('kanboard: created project "Bench Board"');
  }
  const projectId = Number(project.id);
  const columns = await rpc('getColumns', { project_id: projectId });
  const backlog = Number(columns[0].id);

  // Earlier runs' debris: every task named "<something> Bench Task", open or
  // closed. status_id 1 = open, 0 = closed.
  let removed = 0;
  for (const statusId of [1, 0]) {
    for (const t of (await rpc('getAllTasks', { project_id: projectId, status_id: statusId })) ?? []) {
      if (!/ Bench Task$/.test(t.title)) continue;
      await rpc('removeTask', { task_id: Number(t.id) });
      removed++;
    }
  }
  log(removed ? `kanboard: deleted ${removed} leftover bench task(s)` : 'kanboard: no leftover bench tasks');

  // The seed tasks the read-only objective reports. Recreate any that are
  // missing (or that a wayward run closed) so every run reads one baseline.
  const SEED = ['Seed: triage inbox', 'Seed: order missing parts', 'Seed: ship repaired device'];
  const open = (await rpc('getAllTasks', { project_id: projectId, status_id: 1 })) ?? [];
  for (const title of SEED) {
    if (open.some((t) => t.title === title)) continue;
    await rpc('createTask', { title, project_id: projectId, column_id: backlog });
    log(`kanboard: seeded task "${title}"`);
  }
}

/**
 * OpenProject reset doubles as the SEED, as kanboard's does: project "Bench
 * Project" exists with its three seed work packages, the user "Bench Assignee"
 * is a Member of it (the assignee autocomplete offers only members), and no
 * "<runid> Bench Work Package" from an earlier run survives. Everything goes
 * through /api/v3 with the fixed admin token bench/thirdparty/openproject/
 * seed.sh mints. Reference data (the role, the type) is looked up by NAME:
 * its ids are the demo seed's and are not ours to depend on.
 */
async function resetOpenproject() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8090/').replace(/\/$/, '');
  const token = process.env.OPENPROJECT_API_TOKEN || 'bench-api-token';
  const auth = 'Basic ' + Buffer.from(`apikey:${token}`).toString('base64');
  const api = async (method, route, body) => {
    const res = await fetch(`${base}/api/v3${route}`, {
      method,
      headers: { authorization: auth, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 404 && method === 'GET') return null;
    const text = await res.text();
    if (!res.ok) throw new Error(`openproject ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const q = (filters) => `filters=${encodeURIComponent(JSON.stringify(filters))}&pageSize=500`;
  const named = async (route, name) => {
    const hit = (await api('GET', route))._embedded.elements.find((e) => e.name === name);
    if (!hit) throw new Error(`openproject: no ${route.slice(1)} named "${name}" — was the instance seeded?`);
    return hit;
  };

  let project = await api('GET', '/projects/bench-project');
  if (!project) {
    project = await api('POST', '/projects', { name: 'Bench Project', identifier: 'bench-project' });
    log('openproject: created project "Bench Project"');
  }
  const projectHref = `/api/v3/projects/${project.id}`;

  const [assignee] = (await api('GET', `/users?${q([{ login: { operator: '=', values: ['bench-assignee'] } }])}`))._embedded.elements;
  let assigneeId = assignee?.id;
  if (!assigneeId) {
    assigneeId = (await api('POST', '/users', {
      login: 'bench-assignee', firstName: 'Bench', lastName: 'Assignee',
      email: 'bench-assignee@example.com', password: 'Bench-Assignee-1234%', status: 'active',
    })).id;
    log('openproject: created user "Bench Assignee"');
  }
  const memberships = (await api('GET', `/memberships?${q([
    { project: { operator: '=', values: [String(project.id)] } },
    { principal: { operator: '=', values: [String(assigneeId)] } },
  ])}`))._embedded.elements;
  if (!memberships.length) {
    const member = await named('/roles', 'Member');
    await api('POST', '/memberships', {
      _links: { project: { href: projectHref }, principal: { href: `/api/v3/users/${assigneeId}` }, roles: [{ href: `/api/v3/roles/${member.id}` }] },
    });
    log('openproject: made "Bench Assignee" a Member of Bench Project');
  }

  // Earlier runs' debris: every work package named "<something> Bench Work
  // Package", open or closed (status operator "*" is "any").
  const all = (await api('GET', `/projects/${project.id}/work_packages?${q([{ status: { operator: '*', values: [] } }])}`))._embedded.elements;
  let removed = 0;
  for (const wp of all) {
    if (!/ Bench Work Package$/.test(wp.subject)) continue;
    await api('DELETE', `/work_packages/${wp.id}`);
    removed++;
  }
  log(removed ? `openproject: deleted ${removed} leftover bench work package(s)` : 'openproject: no leftover bench work packages');

  // The seed work packages the read-only objective reports. Recreate any that
  // are missing so every run reads one baseline.
  const SEED = ['Seed: triage inbox', 'Seed: order missing parts', 'Seed: ship repaired device'];
  const task = await named('/types', 'Task');
  for (const subject of SEED) {
    if (all.some((wp) => wp.subject === subject)) continue;
    await api('POST', `/projects/${project.id}/work_packages`, { subject, _links: { type: { href: `/api/v3/types/${task.id}` } } });
    log(`openproject: seeded work package "${subject}"`);
  }
}

/**
 * Gitea reset doubles as the SEED, as kanboard's does: org "bench" with repo
 * "bench-repo", the user "bench-assignee" as a write collaborator (the assignee
 * picker offers only users who can write), the labels and milestones the task
 * picks from plus distractors, and three open "Seed:" issues with nothing set
 * on them. Earlier runs' "<runid> Bench Issue"s are DELETED (issue numbers keep
 * counting up; nothing depends on them). Everything goes through /api/v1 with
 * HTTP Basic as the admin bench/thirdparty/gitea/seed.sh creates.
 */
async function resetGitea() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8095/').replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${process.env.GITEA_USER || 'admin'}:${process.env.GITEA_PASSWORD || 'bench-admin-pass'}`).toString('base64');
  const api = async (method, route, body) => {
    const res = await fetch(`${base}/api/v1${route}`, {
      method,
      headers: { authorization: auth, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 404 && method === 'GET') return null;
    const text = await res.text();
    if (!res.ok) throw new Error(`gitea ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const R = '/repos/bench/bench-repo';

  if (!(await api('GET', '/orgs/bench'))) {
    await api('POST', '/orgs', { username: 'bench', full_name: 'Bench', visibility: 'public' });
    log('gitea: created org "bench"');
  }
  if (!(await api('GET', R))) {
    await api('POST', '/orgs/bench/repos', { name: 'bench-repo', description: 'Bench repository', auto_init: true, default_branch: 'main' });
    log('gitea: created repo "bench/bench-repo"');
  }
  if (!(await api('GET', '/users/bench-assignee'))) {
    await api('POST', '/admin/users', {
      username: 'bench-assignee', full_name: 'Bench Assignee', email: 'bench-assignee@example.com',
      password: 'Bench-Assignee-1234%', must_change_password: false,
    });
    log('gitea: created user "bench-assignee"');
  }
  await api('PUT', `${R}/collaborators/bench-assignee`, { permission: 'write' });

  const LABELS = { bug: 'ee0701', 'priority-high': 'e11d21', enhancement: '84b6eb', documentation: '0075ca' };
  const labels = await api('GET', `${R}/labels?limit=50`);
  for (const [name, color] of Object.entries(LABELS)) {
    if (labels.some((l) => l.name === name)) continue;
    await api('POST', `${R}/labels`, { name, color: `#${color}` });
    log(`gitea: created label "${name}"`);
  }
  const milestones = await api('GET', `${R}/milestones?state=all&limit=50`);
  for (const title of ['Bench Milestone', 'Backlog']) {
    const m = milestones.find((x) => x.title === title);
    if (!m) {
      await api('POST', `${R}/milestones`, { title });
      log(`gitea: created milestone "${title}"`);
    } else if (m.state !== 'open') {
      await api('PATCH', `${R}/milestones/${m.id}`, { state: 'open' });
    }
  }

  const all = [];
  for (let page = 1; ; page++) {
    const batch = await api('GET', `${R}/issues?state=all&type=issues&limit=50&page=${page}`);
    all.push(...batch);
    if (batch.length < 50) break;
  }
  let removed = 0;
  for (const issue of all) {
    if (!/ Bench Issue$/.test(issue.title)) continue;
    await api('DELETE', `${R}/issues/${issue.number}`);
    removed++;
  }
  log(removed ? `gitea: deleted ${removed} leftover bench issue(s)` : 'gitea: no leftover bench issues');

  // The seed issues the read-only objective reports: present, open, and bare,
  // so every run reads one baseline and the sidebar pickers start from nothing.
  const SEED = ['Seed: triage inbox', 'Seed: order missing parts', 'Seed: ship repaired device'];
  for (const title of SEED) {
    const issue = all.find((i) => i.title === title);
    if (!issue) {
      await api('POST', `${R}/issues`, { title, body: 'Seed issue for the bench. Do not modify.' });
      log(`gitea: seeded issue "${title}"`);
    } else if (issue.state !== 'open' || issue.labels?.length || issue.assignees?.length || issue.milestone) {
      await api('PATCH', `${R}/issues/${issue.number}`, { state: 'open', assignees: [], milestone: 0 });
      await api('PUT', `${R}/issues/${issue.number}/labels`, { labels: [] });
      log(`gitea: restored seed issue "${title}"`);
    }
  }
}

/**
 * Vikunja reset doubles as the SEED, as kanboard's does: the bench user
 * exists (Vikunja has no built-in admin, so it is REGISTERED through
 * /api/v1/register when sign-in fails), project "Bench Project" with the
 * identifier BENCH (tasks then display as BENCH-<index>), the labels the task
 * picks from plus distractors, and three open "Seed:" tasks with nothing set
 * on them. Earlier runs' "<runid> Bench Task"s are deleted wherever they
 * landed, and so is every label that is not a seed label — the label picker
 * creates a new label from whatever is typed when no option is chosen, so a
 * run can leave a second "Backend" behind that the next run would be offered.
 * Everything goes through /api/v1 with a JWT from /api/v1/login.
 */
async function resetVikunja() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8096/').replace(/\/$/, '');
  const username = process.env.VIKUNJA_USER || 'admin';
  const password = process.env.VIKUNJA_PASSWORD || 'bench-admin-pass';
  const call = async (method, route, body, token) => {
    const res = await fetch(`${base}/api/v1${route}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { res, body: text ? JSON.parse(text) : null };
  };
  let login = await call('POST', '/login', { username, password });
  // Only a refused sign-in means "no such user yet"; a 429 or 5xx is not a
  // reason to try registering.
  if (!login.res.ok && ![401, 403, 412].includes(login.res.status)) {
    throw new Error(`vikunja: login failed: HTTP ${login.res.status} ${JSON.stringify(login.body)}`);
  }
  if (!login.res.ok) {
    const reg = await call('POST', '/register', { username, email: `${username}@example.com`, password });
    if (!reg.res.ok) throw new Error(`vikunja: cannot sign in or register "${username}": HTTP ${reg.res.status} ${JSON.stringify(reg.body)}`);
    log(`vikunja: registered user "${username}"`);
    login = await call('POST', '/login', { username, password });
    if (!login.res.ok) throw new Error(`vikunja: login failed after registering: HTTP ${login.res.status}`);
  }
  const token = login.body.token;
  const api = async (method, route, body) => {
    const { res, body: out } = await call(method, route, body, token);
    if (!res.ok) throw new Error(`vikunja ${method} ${route}: HTTP ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
    return out;
  };
  /** Every page of a paginated list (the server caps a page at 50). */
  const all = async (route) => {
    const out = [];
    for (let page = 1; ; page++) {
      const sep = route.includes('?') ? '&' : '?';
      const { res, body } = await call('GET', `${route}${sep}page=${page}&per_page=50`, null, token);
      if (!res.ok) throw new Error(`vikunja GET ${route}: HTTP ${res.status}`);
      out.push(...(body ?? []));
      if (page >= Number(res.headers.get('x-pagination-total-pages') || 1)) return out;
    }
  };

  // English UI whatever the browser's locale, so run 1 and every replay read
  // the same labels.
  const me = await api('GET', '/user');
  if (me.settings?.language !== 'en') {
    await api('POST', '/user/settings/general', { ...me.settings, language: 'en' });
    log('vikunja: set the UI language to English');
  }

  let project = (await all('/projects?is_archived=true')).find((p) => p.title === 'Bench Project');
  if (!project) {
    project = await api('PUT', '/projects', { title: 'Bench Project', identifier: 'BENCH' });
    log('vikunja: created project "Bench Project"');
  } else if (project.is_archived || project.identifier !== 'BENCH') {
    project = await api('POST', `/projects/${project.id}`, { ...project, identifier: 'BENCH', is_archived: false });
    log('vikunja: restored Bench Project');
  }

  // Earlier runs' debris, in any project, done or not.
  const tasks = await all('/tasks/all');
  let removed = 0;
  for (const t of tasks) {
    if (!/ Bench Task$/.test(t.title)) continue;
    await api('DELETE', `/tasks/${t.id}`);
    removed++;
  }
  log(removed ? `vikunja: deleted ${removed} leftover bench task(s)` : 'vikunja: no leftover bench tasks');

  // Seed labels: the first of each title is kept; any other label (a
  // duplicate, or one a run created by typing) is removed.
  const SEED_LABELS = ['Backend', 'Frontend', 'Docs'];
  const labels = (await all('/labels')).sort((a, b) => a.id - b.id);
  const kept = new Set();
  for (const label of labels) {
    if (SEED_LABELS.includes(label.title) && !kept.has(label.title)) { kept.add(label.title); continue; }
    await api('DELETE', `/labels/${label.id}`);
    log(`vikunja: deleted label "${label.title}" (#${label.id})`);
  }
  for (const title of SEED_LABELS) {
    if (kept.has(title)) continue;
    await api('PUT', '/labels', { title });
    log(`vikunja: seeded label "${title}"`);
  }

  // The seed tasks the read-only objective reports: open, nothing set. One a
  // wayward run touched is replaced rather than patched field by field.
  const SEED = ['Seed: triage inbox', 'Seed: order missing parts', 'Seed: ship repaired device'];
  for (const title of SEED) {
    const found = tasks.filter((t) => t.title === title && t.project_id === project.id);
    const pristine = found.find((t) => !t.done && !t.priority && !t.labels?.length && t.due_date.startsWith('0001-'));
    for (const t of found) if (t !== pristine) await api('DELETE', `/tasks/${t.id}`);
    if (!pristine) {
      await api('PUT', `/projects/${project.id}/tasks`, { title });
      log(`vikunja: seeded task "${title}"`);
    }
  }

  // Keep the displayed identifiers CLIMBING. Vikunja numbers a new task one
  // past the project's highest surviving index, so deleting last run's
  // BENCH-4 would give this run BENCH-4 again, and a replay that inlined the
  // recorded identifier as a constant would pass objective 7 without reading
  // anything. Updates ignore `index` but creation honours it, so the last
  // seed task is re-created at the high-water mark whenever the deletions
  // above lowered it.
  const highWater = Math.max(0, ...tasks.filter((t) => t.project_id === project.id).map((t) => t.index));
  const now = (await all('/tasks/all')).filter((t) => t.project_id === project.id);
  if (Math.max(0, ...now.map((t) => t.index)) < highWater) {
    const keeper = now.find((t) => t.title === SEED[SEED.length - 1]);
    if (keeper) await api('DELETE', `/tasks/${keeper.id}`);
    await api('PUT', `/projects/${project.id}/tasks`, { title: SEED[SEED.length - 1], index: highWater });
    log(`vikunja: re-created "${SEED[SEED.length - 1]}" as BENCH-${highWater} so the next task is BENCH-${highWater + 1}`);
  }
}

function resetAtelyr() {
  log('atelyr: restoring datastore baseline');
  execFileSync(process.execPath, [path.join(here, 'reset.mjs'), '--restore'], { stdio: 'inherit' });
}

const RESETS = {
  atelyr: resetAtelyr,
  repairdesk: resetRepairdesk,
  odoo: resetOdoo,
  grafana: resetGrafana,
  kanboard: resetKanboard,
  openproject: resetOpenproject,
  gitea: resetGitea,
  vikunja: resetVikunja,
};

export const RESET_TARGETS = Object.keys(RESETS);

/** Reset one target. Throws if the target is unknown or the reset fails. */
export async function resetTarget(name) {
  const fn = RESETS[name];
  if (!fn) throw new Error(`unknown target "${name}" — expected one of: ${RESET_TARGETS.join(', ')}`);
  await fn();
}
