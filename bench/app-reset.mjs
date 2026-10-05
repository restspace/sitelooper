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
 * It also blocks the cleanup assumption in notes/PLAN-evidence-over-shape.md: if the
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
  // Everything the task finishes creating carries the `bench` tag, and
  // provisioned dashboards refuse API deletion, so this can only remove
  // benchmark debris. A run that dies after the save but before the tag is
  // added leaves an UNTAGGED `<RUNID> Bench Dashboard`: fwgr70's first spec
  // attempt did, and its retry (same runid) then found Save disabled on the
  // duplicate title. So also match the task's own title shape.
  const search = async (q) => {
    const r = await fetch(`${base}/api/search?${q}&type=dash-db`, { headers: { authorization: auth } });
    if (!r.ok) throw new Error(`grafana search failed: ${r.status}`);
    return r.json();
  };
  const tagged = await search('tag=bench');
  const titled = (await search(`query=${encodeURIComponent('Bench Dashboard')}`)).filter((h) => / Bench Dashboard$/.test(h.title ?? ''));
  const hits = [...new Map([...tagged, ...titled].map((h) => [h.uid, h])).values()];
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

/**
 * EspoCRM reset doubles as the SEED, as kanboard's does: account "Bench
 * Account" plus a look-alike distractor, user "bench-assignee" (Bench
 * Assignee) plus a look-alike distractor, and three "Seed:" opportunities on
 * Bench Account at stage Prospecting, unassigned. Earlier runs' "<runid> Bench
 * Opportunity"s are DELETED (ids are random hex, so nothing is reused). A seed
 * opportunity a wayward run touched is deleted and re-created rather than
 * patched field by field. Everything goes through /api/v1 with HTTP Basic as
 * the admin the image installs from ESPOCRM_ADMIN_USERNAME/PASSWORD.
 */
async function resetEspocrm() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8097/').replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${process.env.ESPOCRM_USER || 'admin'}:${process.env.ESPOCRM_PASSWORD || 'bench-admin-pass'}`).toString('base64');
  const api = async (method, route, body) => {
    const res = await fetch(`${base}/api/v1/${route}`, {
      method,
      headers: { authorization: auth, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`espocrm ${method} ${route}: HTTP ${res.status} ${res.headers.get('x-status-reason') ?? ''} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  /** Every record of an entity type matching one where-clause. */
  const find = async (entity, where) => {
    const out = [];
    for (let offset = 0; ; offset += 200) {
      const q = new URLSearchParams({ maxSize: '200', offset: String(offset) });
      where.forEach((w, i) => {
        for (const [k, v] of Object.entries(w)) q.set(`where[${i}][${k}]`, String(v));
      });
      const page = await api('GET', `${entity}?${q}`);
      out.push(...page.list);
      if (page.list.length < 200) return out;
    }
  };

  // The task states its date as 2026-12-31. The image's env applies only at install time,
  // so the format is enforced on every reset (fwec1: an ISO date typed into a MM/DD/YYYY
  // field was read as 10/12/2031, and the failed create was adopted).
  await api('PUT', 'Settings', { dateFormat: 'YYYY-MM-DD' });

  // Accounts: the one the task links, and a look-alike the autocomplete also offers.
  const accountIds = {};
  for (const name of ['Bench Account', 'Bench Accounting Services']) {
    const found = await find('Account', [{ type: 'equals', attribute: 'name', value: name }]);
    accountIds[name] = found[0]?.id ?? (await api('POST', 'Account', { name })).id;
    if (!found.length) log(`espocrm: created account "${name}"`);
  }

  // Users: the assignee, and a look-alike.
  const USERS = [
    { userName: 'bench-assignee', firstName: 'Bench', lastName: 'Assignee' },
    { userName: 'bench-assistant', firstName: 'Bench', lastName: 'Assistant' },
  ];
  for (const u of USERS) {
    const found = await find('User', [{ type: 'equals', attribute: 'userName', value: u.userName }]);
    if (found.length) {
      if (!found[0].isActive) await api('PUT', `User/${found[0].id}`, { isActive: true });
      continue;
    }
    await api('POST', 'User', {
      ...u, type: 'regular', isActive: true,
      emailAddress: `${u.userName}@example.com`,
      password: 'Bench-Assignee-1234%', passwordConfirm: 'Bench-Assignee-1234%',
    });
    log(`espocrm: created user "${u.userName}"`);
  }

  // Earlier runs' debris.
  const leftovers = await find('Opportunity', [{ type: 'endsWith', attribute: 'name', value: ' Bench Opportunity' }]);
  for (const o of leftovers) await api('DELETE', `Opportunity/${o.id}`);
  log(leftovers.length ? `espocrm: deleted ${leftovers.length} leftover bench opportunit(ies)` : 'espocrm: no leftover bench opportunities');

  // The seed opportunities the read-only objective reports, each exactly as seeded.
  const SEED = [
    { name: 'Seed: annual support renewal', amount: 4800, closeDate: '2026-10-15' },
    { name: 'Seed: pilot expansion', amount: 9000, closeDate: '2026-11-30' },
    { name: 'Seed: training package', amount: 2500, closeDate: '2027-01-31' },
  ];
  const seeds = await find('Opportunity', [{ type: 'startsWith', attribute: 'name', value: 'Seed:' }]);
  for (const s of SEED) {
    const found = seeds.filter((o) => o.name === s.name);
    const pristine = found.find((o) =>
      o.stage === 'Prospecting' && !o.assignedUserId && o.accountId === accountIds['Bench Account'] &&
      Number(o.amount) === s.amount && o.closeDate === s.closeDate);
    for (const o of found) if (o !== pristine) await api('DELETE', `Opportunity/${o.id}`);
    if (!pristine) {
      await api('POST', 'Opportunity', {
        ...s, amountCurrency: 'USD', stage: 'Prospecting', probability: 10,
        accountId: accountIds['Bench Account'], assignedUserId: null,
      });
      log(`espocrm: seeded opportunity "${s.name}"`);
    }
  }
  // Anything else named Seed: (a copy a run made) goes too.
  for (const o of seeds) if (!SEED.some((s) => s.name === o.name)) await api('DELETE', `Opportunity/${o.id}`);
}

/**
 * Snipe-IT reset doubles as the SEED, as kanboard's does: category "Bench
 * Laptops", manufacturer "Bench Manufacturer", the model "Bench Laptop Model"
 * plus a look-alike, the status label "Ready to Deploy" (the install ships it),
 * locations "Bench Office" plus a look-alike, the user "Bench Assignee"
 * (bench-assignee) plus a look-alike, and three "Seed:" assets that are
 * checked in, Ready to Deploy, at Bench Warehouse. Earlier runs' "<runid>
 * Bench Asset"s are checked in and DELETED (Snipe-IT soft-deletes; asset tags
 * keep counting up, BA-00001, BA-00002, ..., so a stored tag can never pass by
 * coincidence). Everything goes through /api/v1 with the Bearer token
 * bench/thirdparty/snipeit/seed.sh mints into .api-token (or SNIPEIT_API_TOKEN).
 */
async function resetSnipeit() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8098/').replace(/\/$/, '');
  const { readFileSync } = await import('node:fs');
  let token = process.env.SNIPEIT_API_TOKEN;
  if (!token) {
    try {
      token = readFileSync(path.join(here, 'thirdparty', 'snipeit', '.api-token'), 'utf8').trim();
    } catch {
      throw new Error('snipeit: no API token — run bash bench/thirdparty/snipeit/seed.sh first');
    }
  }
  const api = async (method, route, body) => {
    const res = await fetch(`${base}/api/v1${route}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`, accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`snipeit ${method} ${route}: HTTP ${res.status} ${text.slice(0, 300)}`);
    const json = text ? JSON.parse(text) : null;
    // Snipe-IT answers a refused write with HTTP 200 and status "error".
    if (json?.status === 'error') throw new Error(`snipeit ${method} ${route}: ${JSON.stringify(json.messages).slice(0, 300)}`);
    return json;
  };
  const rows = async (route, search) => {
    const out = [];
    for (let offset = 0; ; offset += 500) {
      const q = new URLSearchParams({ limit: '500', offset: String(offset), ...(search ? { search } : {}) });
      const page = await api('GET', `${route}?${q}`);
      out.push(...page.rows);
      if (page.rows.length < 500) return out;
    }
  };
  /** The id of the record named `name`, created from `body` when absent. */
  const ensure = async (route, name, body, key = 'name') => {
    const found = (await rows(route, name)).find((r) => r[key] === name);
    if (found) return found.id;
    const made = await api('POST', route, body);
    log(`snipeit: created ${route.slice(1)} "${name}"`);
    return made.payload.id;
  };

  const category = await ensure('/categories', 'Bench Laptops', { name: 'Bench Laptops', category_type: 'asset' });
  const manufacturer = await ensure('/manufacturers', 'Bench Manufacturer', { name: 'Bench Manufacturer' });
  const model = await ensure('/models', 'Bench Laptop Model', { name: 'Bench Laptop Model', category_id: category, manufacturer_id: manufacturer });
  await ensure('/models', 'Bench Desktop Model', { name: 'Bench Desktop Model', category_id: category, manufacturer_id: manufacturer });
  const ready = await ensure('/statuslabels', 'Ready to Deploy', { name: 'Ready to Deploy', type: 'deployable' });
  await ensure('/statuslabels', 'Pending', { name: 'Pending', type: 'pending' });
  await ensure('/locations', 'Bench Office', { name: 'Bench Office' });
  const warehouse = await ensure('/locations', 'Bench Warehouse', { name: 'Bench Warehouse' });
  for (const [username, last] of [['bench-assignee', 'Assignee'], ['bench-assistant', 'Assistant']]) {
    await ensure('/users', username, {
      first_name: 'Bench', last_name: last, username, email: `${username}@example.com`,
      password: 'Bench-User-Pass-1234', password_confirmation: 'Bench-User-Pass-1234', activated: true,
    }, 'username');
  }

  const assets = await rows('/hardware');
  const leftovers = assets.filter((a) => / Bench Asset$/.test(a.name ?? ''));
  for (const a of leftovers) {
    if (a.assigned_to) await api('POST', `/hardware/${a.id}/checkin`, { note: 'bench reset' });
    await api('DELETE', `/hardware/${a.id}`);
  }
  log(leftovers.length ? `snipeit: deleted ${leftovers.length} leftover bench asset(s)` : 'snipeit: no leftover bench assets');

  // The seed assets objective 1 reads: present, checked in, and as seeded.
  const SEED = [
    ['Seed: Reception Laptop', 'SEED-0001'],
    ['Seed: Training Laptop', 'SEED-0002'],
    ['Seed: Spare Laptop', 'SEED-0003'],
  ];
  for (const [name, tag] of SEED) {
    const a = assets.find((x) => x.asset_tag === tag);
    const want = { name, model_id: model, status_id: ready, rtd_location_id: warehouse, notes: null };
    if (!a) {
      await api('POST', '/hardware', { asset_tag: tag, ...want });
      log(`snipeit: seeded asset "${name}" (${tag})`);
      continue;
    }
    if (a.assigned_to) await api('POST', `/hardware/${a.id}/checkin`, { note: 'bench reset' });
    if (a.assigned_to || a.name !== name || a.model?.id !== model || a.status_label?.id !== ready ||
        a.rtd_location?.id !== warehouse || a.notes) {
      await api('PATCH', `/hardware/${a.id}`, want);
      log(`snipeit: restored seed asset "${name}" (${tag})`);
    }
  }
  // Anything else named Seed: (a copy a run made) goes too.
  for (const a of assets) {
    if (!/^Seed:/.test(a.name ?? '') || SEED.some(([, tag]) => tag === a.asset_tag)) continue;
    if (a.assigned_to) await api('POST', `/hardware/${a.id}/checkin`, { note: 'bench reset' });
    await api('DELETE', `/hardware/${a.id}`);
  }
}

/**
 * Ghost reset doubles as the SEED, as kanboard's does. On a fresh install it
 * first creates the owner through /ghost/api/admin/authentication/setup/ (the
 * endpoint the /ghost/#/setup wizard posts to), so the wizard is never left
 * open. Then: the tags "Bench News" and "Bench Guides" plus a look-alike
 * "Bench Newsletter", and three published "Seed:" posts tagged Bench Guides.
 * Every other post (earlier runs' "<runid> Bench Post"s and the install's own
 * sample posts) and every other tag (the tag input CREATES a tag from whatever
 * is typed unless a suggestion is chosen, so a run can leave "Bench New"
 * behind) is DELETED. A seed post a wayward run touched is deleted and
 * re-created rather than patched field by field. Everything goes through the
 * Admin API with a staff session cookie (POST /ghost/api/admin/session).
 */
async function resetGhost() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8099/').replace(/\/$/, '');
  const origin = new URL(base).origin;
  const email = process.env.GHOST_EMAIL || 'admin@bench.local';
  const password = process.env.GHOST_PASSWORD || 'bench-admin-pass';
  let cookie = '';
  const call = async (method, route, body) => {
    const res = await fetch(`${base}/ghost/api/admin${route}`, {
      method,
      headers: {
        origin, accept: 'application/json', 'accept-version': 'v6.0',
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { res, text, body: text && /json/.test(res.headers.get('content-type') ?? '') ? JSON.parse(text) : null };
  };
  const api = async (method, route, body) => {
    const r = await call(method, route, body);
    if (!r.res.ok) throw new Error(`ghost ${method} ${route}: HTTP ${r.res.status} ${r.text.slice(0, 300)}`);
    return r.body;
  };

  const setup = await api('GET', '/authentication/setup/');
  if (!setup.setup?.[0]?.status) {
    await api('POST', '/authentication/setup/', {
      setup: [{ name: 'Bench Admin', email, password, blogTitle: 'Bench Blog' }],
    });
    log(`ghost: created the owner "${email}"`);
  }
  const session = await call('POST', '/session/', { username: email, password });
  if (!session.res.ok) throw new Error(`ghost: sign-in failed: HTTP ${session.res.status} ${session.text.slice(0, 300)}`);
  cookie = session.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const me = await api('GET', '/users/me/');
  if (me.users?.[0]?.status !== 'active') {
    throw new Error(`ghost: the session is not usable (device verification on?): ${JSON.stringify(me).slice(0, 200)}`);
  }
  // The verifier judges the publish date in UTC, so a run that changed the site timezone
  // must not carry into the next one.
  await api('PUT', '/settings/', { settings: [{ key: 'timezone', value: 'Etc/UTC' }] });

  // Tags: exactly the seed set.
  const SEED_TAGS = ['Bench News', 'Bench Guides', 'Bench Newsletter'];
  const tags = (await api('GET', '/tags/?limit=all')).tags.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const tagIds = {};
  for (const t of tags) {
    if (SEED_TAGS.includes(t.name) && !tagIds[t.name]) { tagIds[t.name] = t.id; continue; }
    await api('DELETE', `/tags/${t.id}/`);
    log(`ghost: deleted tag "${t.name}"`);
  }
  for (const name of SEED_TAGS) {
    if (tagIds[name]) continue;
    tagIds[name] = (await api('POST', '/tags/', { tags: [{ name }] })).tags[0].id;
    log(`ghost: seeded tag "${name}"`);
  }

  // Posts: exactly the seed set, each as seeded.
  const SEED = [
    { title: 'Seed: Welcome to the bench', body: 'The bench blog opens.' },
    { title: 'Seed: Release notes for September', body: 'What changed this month.' },
    { title: 'Seed: House style guide', body: 'How we write here.' },
  ];
  const posts = (await api('GET', '/posts/?limit=all&include=tags&formats=plaintext')).posts;
  let removed = 0;
  for (const p of posts) {
    const s = SEED.find((x) => x.title === p.title);
    const pristine = s && p.status === 'published' && !p.custom_excerpt && !p.featured &&
      String(p.plaintext ?? '').trim() === s.body &&
      p.tags.length === 1 && p.tags[0].id === tagIds['Bench Guides'] &&
      !posts.some((q) => q !== p && q.title === p.title && q.created_at < p.created_at);
    if (pristine) { s.kept = true; continue; }
    await api('DELETE', `/posts/${p.id}/`);
    removed++;
  }
  log(removed ? `ghost: deleted ${removed} post(s) (earlier runs' and non-seed)` : 'ghost: no posts to delete');
  for (const s of SEED) {
    if (s.kept) continue;
    await api('POST', '/posts/?source=html', {
      posts: [{ title: s.title, html: `<p>${s.body}</p>`, status: 'published', tags: [{ id: tagIds['Bench Guides'] }] }],
    });
    log(`ghost: seeded post "${s.title}"`);
  }
  // The install's sample pages are left alone: the task never looks at pages.
}

/**
 * ERPNext reset doubles as the SEED, as kanboard's does. It needs the Setup
 * Wizard completed first (bench/thirdparty/erpnext/seed.sh: company Bench
 * Company, USD, fiscal year 2026) and refuses loudly without it. Then, every
 * time:
 *
 * - System Settings: dates as yyyy-mm-dd (the task states 2026-12-31 in ISO;
 *   the wizard's United States default is mm-dd-yyyy, the espocrm fwec1 trap),
 *   onboarding and update/change-log popups off. Selling Settings: customers
 *   named by Customer Name, default price list Standard Selling.
 * - a fiscal year covering today and 2026, so a Sales Order dated today saves.
 * - customers "Bench Customer" plus look-alikes "Bench Customer Ltd" and
 *   "Bench Customers Group", and the three "Seed: ..." customers.
 * - non-stock items "Bench Widget" (40), "Bench Gadget" (125) and a look-alike
 *   "Bench Widget Pro" (55), each with a Standard Selling Item Price.
 * - exactly three Sales Orders: one SUBMITTED order per Seed: customer, one
 *   line each, no comments. EVERY other Sales Order (earlier runs' orders for
 *   "<runid> Bench Customer", drafts, amendments, an order a wayward run put
 *   on a look-alike customer, a seed order a run cancelled or commented on)
 *   is cancelled if submitted, has its comments deleted, and is DELETED; a
 *   missing seed order is re-created. Naming-series ids keep counting up
 *   (SAL-ORD-2026-00004, -00005, ...), so a stored id never passes by
 *   coincidence.
 * - every customer outside the kept set, and every item with "Bench" in its
 *   code outside the kept set, is deleted (a failure there is a warning: an
 *   earlier runid's leftover cannot collide with this run's names).
 *
 * Everything goes through /api/resource and /api/method with a session
 * cookie from POST /api/method/login as Administrator. A session that never
 * loaded /app has no CSRF token, and Frappe skips the CSRF check for it.
 */
async function resetErpnext() {
  const base = (process.env.APP_URL || 'http://127.0.0.1:8100/').replace(/\/$/, '');
  const usr = process.env.ERPNEXT_USER || 'Administrator';
  const pwd = process.env.ERPNEXT_PASSWORD || 'bench-admin-pass';
  let cookie = '';
  /** The server's own message out of a Frappe error body, for the thrown error. */
  const why = (text) => {
    try {
      const j = JSON.parse(text);
      const msgs = j._server_messages ? JSON.parse(j._server_messages).map((m) => { try { return JSON.parse(m).message; } catch { return m; } }) : [];
      return [j.exc_type, ...msgs, j.exception].filter(Boolean).join(' | ').replace(/<[^>]+>/g, '').slice(0, 400);
    } catch {
      return text.slice(0, 300);
    }
  };
  const call = async (method, route, body) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: { accept: 'application/json', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`erpnext ${method} ${decodeURIComponent(route)}: HTTP ${res.status} ${why(text)}`);
    return { res, body: text ? JSON.parse(text) : null };
  };
  const R = (doctype, name) => `/api/resource/${encodeURIComponent(doctype)}${name === undefined ? '' : `/${encodeURIComponent(name)}`}`;
  const list = async (doctype, filters = [], fields = ['name']) => {
    const q = new URLSearchParams({ filters: JSON.stringify(filters), fields: JSON.stringify(fields), limit_page_length: '0' });
    return (await call('GET', `${R(doctype)}?${q}`)).body.data;
  };
  const get = async (doctype, name) => (await call('GET', R(doctype, name))).body.data;
  const insert = async (doctype, doc) => (await call('POST', R(doctype), doc)).body.data;
  const update = async (doctype, name, patch) => (await call('PUT', R(doctype, name), patch)).body.data;
  const remove = (doctype, name) => call('DELETE', R(doctype, name));
  const method = async (m, args) => (await call('POST', `/api/method/${m}`, args)).body?.message;

  // Sign in. A refused login is the stack not being up or the password not
  // being the one create-site was given; say which call failed.
  const login = await call('POST', '/api/method/login', { usr, pwd });
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!/\bsid=/.test(cookie) || /\bsid=Guest\b/.test(cookie)) throw new Error(`erpnext: login as ${usr} gave no session cookie (${cookie || 'none'})`);

  // Per-user list view state (filters, sort, page length, group-by sidebar,
  // List/Report/Kanban view, last_view) lives in __UserSettings, cached in redis
  // ("_user_settings" hash, read before the table). A replay on a reset app must
  // not open on the previous run's filtered list. user_settings.save is
  // whitelisted but MERGES top-level keys (an empty object is a no-op), so read
  // the current keys and overwrite each with an empty value. The cache is what
  // get() reads, and save() writes the cache, so this takes effect at once.
  // Only the signed-in user's rows are reachable (the session user is the key).
  for (const doctype of ['Sales Order', 'Customer', 'Item', 'Sales Invoice', 'Quotation', 'Delivery Note']) {
    let current = (await call('POST', '/api/method/frappe.model.utils.user_settings.get', { doctype })).body?.message;
    if (typeof current === 'string') current = JSON.parse(current || '{}');
    if (!current || typeof current !== 'object') current = {};
    const blank = {};
    for (const k of Object.keys(current)) blank[k] = k === 'last_view' ? null : {};
    for (const k of ['List', 'Report', 'Kanban', 'Calendar', 'Gantt', 'Image', 'Inbox', 'Dashboard']) blank[k] = {};
    blank.last_view = null;
    await call('POST', '/api/method/frappe.model.utils.user_settings.save', { doctype, user_settings: JSON.stringify(blank) });
    if (Object.keys(current).length) log(`erpnext: cleared saved list settings for ${doctype} (${Object.keys(current).join(', ')})`);
  }

  // The Setup Wizard must be done: that is what made the company and its accounts.
  const company = (await list('Company', [['name', '=', 'Bench Company']]))[0];
  if (!company) throw new Error('erpnext: company "Bench Company" not found — the setup wizard is not complete; run bash bench/thirdparty/erpnext/seed.sh first');

  await update('System Settings', 'System Settings', {
    date_format: 'yyyy-mm-dd', enable_onboarding: 0, disable_system_update_notification: 1, disable_change_log_notification: 1,
  });

  // Fiscal years: 2026 (the task's delivery date) and today's (a Sales Order is dated today).
  const today = new Date().toISOString().slice(0, 10);
  const years = await list('Fiscal Year', [], ['name', 'year_start_date', 'year_end_date']);
  for (const y of [...new Set([2026, Number(today.slice(0, 4))])]) {
    const day = `${y}-06-30`;
    if (years.some((f) => f.year_start_date <= day && day <= f.year_end_date)) continue;
    await insert('Fiscal Year', { year: String(y), year_start_date: `${y}-01-01`, year_end_date: `${y}-12-31` });
    log(`erpnext: created fiscal year ${y}`);
  }

  // Leaf groups for the records seeded below (a group node is refused).
  const leaf = async (doctype, preferred) => {
    const leaves = (await list(doctype, [['is_group', '=', 0]])).map((r) => r.name);
    const pick = leaves.includes(preferred) ? preferred : leaves[0];
    if (!pick) throw new Error(`erpnext: no non-group ${doctype} exists — did the setup wizard's fixtures install?`);
    return pick;
  };
  const customerGroup = await leaf('Customer Group', 'Commercial');
  const territory = await leaf('Territory', 'United States');
  const itemGroup = await leaf('Item Group', 'Products');

  await update('Selling Settings', 'Selling Settings', {
    cust_master_name: 'Customer Name', selling_price_list: 'Standard Selling', customer_group: customerGroup, territory,
  });

  // Customers: the one the task links, its look-alikes, and the seed orders' customers.
  const SEED = [
    { customer: 'Seed: Alpha Traders', item: 'Bench Widget', qty: 5 },
    { customer: 'Seed: Beacon Supplies', item: 'Bench Gadget', qty: 1 },
    { customer: 'Seed: Cobalt Retail', item: 'Bench Widget', qty: 12 },
  ];
  const KEEP_CUSTOMERS = ['Bench Customer', 'Bench Customer Ltd', 'Bench Customers Group', ...SEED.map((s) => s.customer)];
  const customers = await list('Customer', [], ['name', 'customer_name', 'disabled']);
  for (const name of KEEP_CUSTOMERS) {
    const found = customers.find((c) => c.name === name);
    if (found) {
      if (found.disabled) await update('Customer', name, { disabled: 0 });
      continue;
    }
    await insert('Customer', { customer_name: name, customer_type: 'Company', customer_group: customerGroup, territory });
    log(`erpnext: created customer "${name}"`);
  }

  // Items and their selling prices.
  const ITEMS = [['Bench Widget', 40], ['Bench Gadget', 125], ['Bench Widget Pro', 55]];
  const items = await list('Item', [['item_code', 'like', '%Bench%']], ['name', 'disabled']);
  for (const [code, rate] of ITEMS) {
    const found = items.find((i) => i.name === code);
    if (!found) {
      await insert('Item', {
        item_code: code, item_name: code, item_group: itemGroup, stock_uom: 'Nos',
        is_stock_item: 0, include_item_in_manufacturing: 0, is_sales_item: 1,
      });
      log(`erpnext: created item "${code}"`);
    } else if (found.disabled) {
      await update('Item', code, { disabled: 0 });
    }
    const prices = await list('Item Price', [['item_code', '=', code], ['price_list', '=', 'Standard Selling']], ['name', 'price_list_rate']);
    if (!prices.length) {
      await insert('Item Price', { item_code: code, price_list: 'Standard Selling', price_list_rate: rate });
    } else {
      for (const p of prices) if (Number(p.price_list_rate) !== rate) await update('Item Price', p.name, { price_list_rate: rate });
    }
  }

  // Sales Orders: exactly the seed set, each as seeded.
  const seedDelivery = `${today.slice(0, 4)}-12-31`;
  const commentsOn = (name) =>
    list('Comment', [['reference_doctype', '=', 'Sales Order'], ['reference_name', '=', name]], ['name', 'comment_type']);
  const orders = await list('Sales Order', [], ['name', 'customer', 'docstatus', 'delivery_date', 'creation']);
  orders.sort((a, b) => String(a.creation).localeCompare(String(b.creation)));
  const doomed = [];
  for (const o of orders) {
    const s = SEED.find((x) => x.customer === o.customer);
    let pristine = false;
    if (s && !s.kept && o.docstatus === 1 && o.delivery_date === seedDelivery) {
      const doc = await get('Sales Order', o.name);
      pristine = doc.items.length === 1 && doc.items[0].item_code === s.item && Number(doc.items[0].qty) === s.qty &&
        !(await commentsOn(o.name)).some((c) => c.comment_type === 'Comment');
    }
    if (pristine) s.kept = true;
    else doomed.push(o);
  }
  // Newest first: an amendment (SAL-ORD-...-00004-1) links its cancelled
  // original through amended_from, and would block the original's deletion.
  let removed = 0;
  for (const o of doomed.reverse()) {
    if (o.docstatus === 1) await method('frappe.client.cancel', { doctype: 'Sales Order', name: o.name });
    for (const c of await commentsOn(o.name)) await remove('Comment', c.name);
    await remove('Sales Order', o.name);
    removed++;
  }
  log(removed ? `erpnext: deleted ${removed} sales order(s) (earlier runs' and non-seed)` : 'erpnext: no sales orders to delete');
  for (const s of SEED) {
    if (s.kept) continue;
    const rate = ITEMS.find(([code]) => code === s.item)[1];
    const so = await insert('Sales Order', {
      customer: s.customer, company: company.name, transaction_date: today, delivery_date: seedDelivery,
      order_type: 'Sales', currency: 'USD', conversion_rate: 1,
      selling_price_list: 'Standard Selling', price_list_currency: 'USD', plc_conversion_rate: 1,
      items: [{ item_code: s.item, qty: s.qty, rate, uom: 'Nos', conversion_factor: 1, delivery_date: seedDelivery }],
      docstatus: 1,
    });
    // An insert with docstatus 1 submits in one call; if this version saved a
    // draft instead, submit it the way the form's Submit button does.
    if (so.docstatus === 0) await method('frappe.client.submit', { doc: await get('Sales Order', so.name) });
    const now = await get('Sales Order', so.name);
    if (now.docstatus !== 1) throw new Error(`erpnext: seed sales order ${so.name} for "${s.customer}" is docstatus ${now.docstatus}, not submitted`);
    log(`erpnext: seeded sales order ${so.name} for "${s.customer}"`);
  }

  // Customers and Bench items a run made (or a look-alike it created by typing).
  for (const c of customers) {
    if (KEEP_CUSTOMERS.includes(c.name)) continue;
    try {
      await remove('Customer', c.name);
      log(`erpnext: deleted customer "${c.name}"`);
    } catch (e) {
      log(`erpnext: WARNING could not delete customer "${c.name}": ${e.message}`);
    }
  }
  for (const i of items) {
    if (ITEMS.some(([code]) => code === i.name)) continue;
    try {
      await remove('Item', i.name);
      log(`erpnext: deleted item "${i.name}"`);
    } catch (e) {
      log(`erpnext: WARNING could not delete item "${i.name}": ${e.message}`);
    }
  }
}

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
  const email = process.env.DIRECTUS_EMAIL || 'admin@example.com';
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
  espocrm: resetEspocrm,
  snipeit: resetSnipeit,
  ghost: resetGhost,
  erpnext: resetErpnext,
  bookstack: resetBookstack,
  mealie: resetMealie,
  directus: resetDirectus,
};

export const RESET_TARGETS = Object.keys(RESETS);

/** Reset one target. Throws if the target is unknown or the reset fails. */
export async function resetTarget(name) {
  const fn = RESETS[name];
  if (!fn) throw new Error(`unknown target "${name}" — expected one of: ${RESET_TARGETS.join(', ')}`);
  await fn();
}
