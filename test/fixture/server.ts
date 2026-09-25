/**
 * Shared HTTP fixture server: a tiny "Items" list app with a Remove/Mark
 * affordance per row, backed by a mutation log that only the server can
 * write. execution-parity.test.ts uses this as the differential-harness
 * oracle (see notes/CORRECTNESS_PLAN.md §9.1: "both runners said ok" must never
 * stand in for "the right thing happened once").
 *
 * Per §9.1, the fixture also needs to expose CONTROLLABLE FAULTS so
 * correctness claims can be tested against adverse conditions, not just the
 * happy path. Every fault below is off by default, armed explicitly by a
 * test via `faults.*`, and fires a bounded number of times (`times`,
 * default 1) so an armed fault can never leak into an unrelated test or
 * test case. With nothing armed, the server behaves exactly as it always
 * has.
 */
import { createHmac } from 'node:crypto';
import http from 'node:http';

/** Which requests a fault applies to. Omitted fields match anything. */
export interface FaultMatch {
  method?: string;
  pathPrefix?: string;
}

interface DelayFault { kind: 'delay'; ms: number; remaining: number; match: FaultMatch }
interface DisconnectFault { kind: 'disconnect'; remaining: number; match: FaultMatch }
interface RejectFault { kind: 'reject'; status: number; remaining: number; match: FaultMatch }
interface StaleFault { kind: 'stale'; remaining: number; snapshot: string[] }
type Fault = DelayFault | DisconnectFault | RejectFault | StaleFault;

function requestMatches(req: http.IncomingMessage, m: FaultMatch): boolean {
  if (m.method && req.method !== m.method) return false;
  if (m.pathPrefix && !(req.url ?? '').startsWith(m.pathPrefix)) return false;
  return true;
}

/**
 * A list with two affordances per row: Remove, which deletes the record and
 * SHRINKS the collection, and Mark, which mutates it in place and leaves the
 * row where it is. The two are the shapes a folded loop comes in, and they
 * need opposite cursor behaviour. Both go through the server, which is the
 * only thing that records them, so a test can ask the application what
 * happened rather than believing a runner.
 */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Items</title></head><body>
<h1>Items</h1>
<p id="target">Item 2</p>
<ul id="items"></ul>
<script>
async function render() {
  const res = await fetch('/items');
  const names = await res.json();
  document.getElementById('items').innerHTML = names
    .map((n) => '<li class="item">' + n +
      ' <button class="del" type="button" data-id="' + n + '">Remove</button>' +
      ' <button class="mark" type="button" data-id="' + n + '">Mark</button></li>')
    .join('');
}
document.addEventListener('click', async (e) => {
  const del = e.target.closest('.del');
  if (del) {
    await fetch('/delete/' + encodeURIComponent(del.dataset.id), { method: 'POST' });
    del.closest('.item').remove();
    return;
  }
  // Mark mutates the record and leaves the row in place: the collection keeps
  // its size, so only a cursor gets the loop to the next record.
  const mark = e.target.closest('.mark');
  if (mark) {
    const res = await fetch('/mark/' + encodeURIComponent(mark.dataset.id), { method: 'POST' });
    // A rejected write is the app talking back: a live-region toast over a
    // page that otherwise looks untouched — the shape of fwrd4l-n3's failure,
    // and what the unrecorded-alert gate exists to catch.
    if (!res.ok) toast('Mark rejected: ' + mark.dataset.id);
  }
});
function toast(text) {
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.textContent = text;
  document.body.append(el);
}
render();
</script>
</body></html>`;

/**
 * A record page, the shape a procedure that navigates to its own subject
 * lands on: the record's own id is the only thing that tells it from every
 * other page of the template, and Mark is work done TO that record. The
 * server logs the visit itself, so a caller can ask whether a runner
 * navigated at all rather than believing its report.
 */
const RECORD = (id: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Record</title></head><body>
<h1>Record ${id}</h1>
<button class="mark" type="button" data-id="${id}">Mark</button>
<script>
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A ticket list whose figures are the app's STATE, not the procedure's: the
 * count is the item collection's size (reset(n)) and the created date is
 * `listing.date`. fwrd86 06-delete's report template recorded "Showing 1–10 of
 * 13" and "Created: 2026-09-23" around its slots; a replay on another day, or
 * after the list grew, must not publish them.
 */
const TICKETS = (total: number, date: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Tickets</title></head><body>
<h1>Tickets</h1>
<p id="summary">Showing 1–${Math.min(10, total)} of ${total} tickets, RD-1016 first</p>
<table><tbody id="rows"><tr><td><a id="ref" href="#">RD-1016</a></td><td>RD-1016 Bench Ticket created ${date}</td></tr></tbody></table>
</body></html>`;

/**
 * A Gitea issue page's sidebar (round 60, fwgt11 07-add): the labels the
 * issue carries are the app's STATE (`issue.labels`), and the label picker's
 * menu, hidden until opened, lists every label the repository has. fwgt11's
 * n2 issue carried priority-high alone while the flow's instruction still
 * named "bug".
 */
const GITEA_ISSUE = (labels: readonly string[]) => `<!doctype html><html><head><meta charset="utf-8"><title>Issue #5</title></head><body>
<h1 id="issue-title">fwgt11-n2 Bench Issue <span>#5</span></h1>
<div class="issue-content-right">
<div class="labels"><span>Labels</span>
${labels.map((l) => `<a class="item" href="/issues?labels=${encodeURIComponent(l)}">${l}</a>`).join('\n')}
</div>
<div class="menu" style="display:none">${['bug', 'priority-high', 'wontfix'].map((l) => `<div class="item" data-value="${l}">${l}</div>`).join('')}</div>
<div><span>Milestone</span> <a href="/milestone/1">Bench Milestone</a></div>
</div>
<p id="comment">Comment for run fwgt11-n2.</p>
</body></html>`;

/**
 * An issue list the way Gitea renders one (fwgt8): the title and the `#n`
 * number are separate elements, a pagination link shows a bare "1", and a
 * hidden row carries text no visitor sees.
 */
const ISSUE_LIST = `<!doctype html><html><head><meta charset="utf-8"><title>Issues</title></head><body>
<h1>Issues</h1>
<div class="counts"><a href="#">3 Open</a> <a href="#">0 Closed</a></div>
<div id="issue-list">
${[3, 2, 1].map((n) => {
  const title = { 3: 'Seed: ship repaired device', 2: 'Seed: order missing parts', 1: 'Seed: triage inbox' }[n];
  return `<div class="flex-item"><div class="flex-item-title"><a class="issue-title" href="/issues/${n}">${title}</a></div><div class="flex-item-body"><a class="index" href="/issues/${n}">#${n}</a> opened by <a href="#">admin</a></div></div>`;
}).join('\n')}
</div>
<div style="display:none">assigned to nobody</div>
<nav class="pagination"><a href="#">1</a></nav>
</body></html>`;

/** An assets table the way Snipe-IT renders one (fwsi8): headers, then tag and name cells. */
/**
 * A board the way Kanboard renders one (fwkb41): the column titles in the
 * header row, and AGAIN in each column's collapsed view in the tasks row —
 * not rendered (display:none) until a column is collapsed. The newest card
 * shows its id only as "#<n>" (`board.card`, reset to 4).
 */
const KANBOARD = (card: number) => `<!doctype html><html><head><meta charset="utf-8"><title>Board</title></head><body>
<h1>KB Bench Board</h1>
<table class="board-project"><tr class="board-swimlane-columns">
${['Backlog', 'Ready', 'Work in progress', 'Done'].map((c) => `<th class="board-column-header"><div class="board-column-title"><a href="#">${c}</a></div></th>`).join('')}
</tr><tr class="board-swimlane-tasks">
${['Backlog', 'Ready', 'Work in progress', 'Done'].map((c, i) => `<td class="board-column"><div class="board-column-collapsed" style="display:none"><div class="board-rotation">${c}</div></div>${i === 0 ? `<div class="task-board"><a class="task-id" href="#">#${card}</a> <a class="task-title" href="#">Bench Task</a></div>` : ''}</td>`).join('')}
</tr></table>
</body></html>`;

/**
 * A record detail view the way EspoCRM renders one (fwec10): labelled cells
 * with a `.field[data-name]` each, and a Stream entry narrating the save
 * that repeats the stage (`espo.stage`, reset to "Negotiation").
 */
/**
 * Round 59, EspoCRM fwec11 01-signin: a sign-in form whose Log in replaces it
 * with the app, whose user menu then shows the signed-in user's DISPLAY name —
 * "Admin" for the typed username "admin". Plus the controls an echo IS about:
 * a time picker whose opener shows the option chosen (grafana's picker), a
 * summary line repeating it elsewhere on the page, and an Excerpt textbox
 * (ghost fwgh13). The document title is the app's (`signin.title`).
 */
const SIGNIN = (title: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>
<div id="app"><form id="login" onsubmit="return false">
<label for="user">Username</label><input id="user">
<label for="pass">Password</label><input id="pass" type="password">
<button id="go" type="button">Log in</button></form></div>
<footer id="footer"><p>© 2026 <a href="#">EspoCRM, Inc.</a></p></footer>
<script>
document.getElementById('go').addEventListener('click', () => {
  const who = document.getElementById('user').value;
  document.getElementById('app').innerHTML =
    '<nav><a id="menu" href="#" role="button" aria-label="Menu"></a><ul id="user-menu" hidden><li><a href="#"><span class="name">' +
    who.charAt(0).toUpperCase() + who.slice(1) + '</span></a></li><li><a href="#">Log Out</a></li></ul></nav>' +
    '<div class="picker"><button id="range" type="button">Last 1 hour</button><ul id="ranges" hidden><li><button type="button" class="opt">Last 6 hours</button></li></ul></div>' +
    '<p>Range: <span id="summary">Last 1 hour</span></p>' +
    '<label for="excerpt">Excerpt</label><input id="excerpt">';
  document.getElementById('menu').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('user-menu').hidden = false; });
  document.getElementById('range').addEventListener('click', () => { document.getElementById('ranges').hidden = false; });
  document.querySelector('#ranges .opt').addEventListener('click', (e) => {
    document.getElementById('range').textContent = e.target.textContent;
    document.getElementById('summary').textContent = e.target.textContent;
    document.getElementById('ranges').hidden = true;
  });
});
</script>
</body></html>`;

/**
 * Round 59's echo cases side by side (echoAt): a field an app RE-RENDERS
 * (the same field, a new node); a combobox whose display span shows the
 * option chosen from its listbox; a live preview mirroring a textarea with no
 * save; and a part name that a Save commits into a table row.
 */
/**
 * EspoCRM fwec13 03-create, in miniature (round 61): an Amount input that
 * formats what it is given when it loses focus ("12500" → "12,500"), a Close
 * Date input whose picker button puts its own default in ("2018-01-16"), and a
 * Save that stores the amount (localStorage, so a reopen shows it) and adds a
 * row showing it.
 */
const ESPO_FORM = `<!doctype html><html><head><meta charset="utf-8"><title>Opportunity</title></head><body>
<div class="field" data-name="amount"><label>Amount <input data-name="amount"></label></div>
<div class="field" data-name="closeDate"><label>Close Date <input data-name="closeDate"></label> <button type="button" id="pick">Pick a date</button></div>
<button type="button" id="save">Save</button>
<table><tbody id="saved"></tbody></table>
<script>
const amount = document.querySelector('input[data-name="amount"]');
const fmt = (v) => { const n = Number(String(v).replace(/,/g, '')); return String(v).trim() !== '' && Number.isFinite(n) ? n.toLocaleString('en-US') : v; };
amount.addEventListener('blur', () => { amount.value = fmt(amount.value); });
const stored = localStorage.getItem('espo-amount');
if (stored) amount.value = fmt(stored);
document.getElementById('pick').addEventListener('click', () => { document.querySelector('input[data-name="closeDate"]').value = '2018-01-16'; });
document.getElementById('save').addEventListener('click', () => {
  localStorage.setItem('espo-amount', amount.value.replace(/,/g, ''));
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.textContent = fmt(amount.value);
  row.appendChild(cell);
  document.getElementById('saved').appendChild(row);
});
</script>
</body></html>`;

const ECHO_LAB = `<!doctype html><html><head><meta charset="utf-8"><title>Echo lab</title></head><body>
<div id="a"><label>Title <input id="title"></label> <button id="rerender" type="button">Re-render</button></div>
<div class="field"><input id="fruit2" role="combobox" aria-label="Fruit" aria-controls="fruit-list" autocomplete="off"><span id="chosen"></span></div>
<ul id="fruit-list" role="listbox" hidden><li role="option">banana split</li><li role="option">cherry pie</li></ul>
<textarea id="md" aria-label="Markdown"></textarea>
<div id="preview"></div>
<form id="parts" onsubmit="return false"><label>Part name <input id="part"></label> <button id="save" type="button">Save</button></form>
<table><tbody id="rows"></tbody></table>
<textarea id="note" aria-label="Note"></textarea> <h3 id="note-preview"></h3> <button id="note-save" type="button">Save note</button>
<div id="q"><input id="search" aria-label="Search"></div> <h4 id="mirror"></h4>
<script>
// Provenance stage 1 (phase B): a live heading mirrors the note, and its Save
// does nothing — the recording's Save showed the heading, this run's did not
// add it (it was already there). A search box whose debounced input rewrites
// the query string and mirrors the text: a url change nothing committed.
const note = document.getElementById('note');
note.addEventListener('input', () => { document.getElementById('note-preview').textContent = note.value; });
const search = document.getElementById('search');
search.addEventListener('input', () => {
  const v = search.value;
  setTimeout(() => {
    history.replaceState(null, '', '/echo-lab?q=' + encodeURIComponent(v));
    document.getElementById('mirror').textContent = v;
  }, 50);
});
document.getElementById('rerender').addEventListener('click', () => {
  const old = document.getElementById('title');
  const fresh = document.createElement('input');
  fresh.id = 'title';
  fresh.value = old.value;
  old.replaceWith(fresh);
});
const fruit = document.getElementById('fruit2');
const list = document.getElementById('fruit-list');
fruit.addEventListener('click', () => { list.hidden = false; });
for (const li of list.querySelectorAll('li')) li.addEventListener('click', () => {
  fruit.value = li.textContent;
  document.getElementById('chosen').textContent = li.textContent;
  list.hidden = true;
});
const md = document.getElementById('md');
md.addEventListener('input', () => { document.getElementById('preview').textContent = md.value; });
document.getElementById('save').addEventListener('click', () => {
  const part = document.getElementById('part');
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.textContent = part.value;
  row.appendChild(cell);
  document.getElementById('rows').appendChild(row);
  part.value = '';
});
</script>
</body></html>`;

const ESPO_DETAIL = (stage: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Opportunity</title></head><body>
<h3><span>Bench Opportunity</span></h3>
<div class="record"><div class="row">
<div class="cell" data-name="stage"><label class="control-label">Stage</label><div class="field" data-name="stage"><span>${stage}</span></div></div>
<div class="cell" data-name="amount"><label class="control-label">Amount</label><div class="field" data-name="amount"><span>$12,500.00</span></div></div>
</div></div>
<div class="panel stream"><h4>Stream</h4><ul><li class="list-group-item"><a href="#">Admin</a> created this opportunity <span>${stage}</span> <a href="#">07:20</a></li></ul></div>
</body></html>`;

const ASSET_TABLE = `<!doctype html><html><head><meta charset="utf-8"><title>Assets</title></head><body>
<h1>Assets</h1>
<table><thead><tr><th>Asset Tag</th><th>Name</th><th>Model</th></tr></thead><tbody>
${[
  ['SEED-0001', 'Seed: Reception Laptop'],
  ['SEED-0002', 'Seed: Training Laptop'],
  ['SEED-0003', 'Seed: Spare Laptop'],
].map(([tag, name]) => `<tr><td><a href="#">${tag}</a></td><td><a href="#">${name}</a></td><td>Bench Laptop Model</td></tr>`).join('\n')}
</tbody></table>
</body></html>`;

/**
 * The same record page, not yet ARRIVED: a placeholder first, then a moment
 * later the record's own name and a url the app normalises for itself. That is
 * what Grafana does to a bare dashboard address (fwgr47-n2 07-verify judged
 * identity during exactly this window and called the RIGHT dashboard "a
 * different record"), and it is the page an identity gate must wait for
 * instead of concluding at the first look.
 */
const BOOTING = (id: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Record</title></head><body>
<h1>Loading</h1>
<script>
const id = ${JSON.stringify(id)};
setTimeout(() => {
  document.querySelector('h1').textContent = 'Record ' + id;
  const b = document.createElement('button');
  b.className = 'mark';
  b.type = 'button';
  b.textContent = 'Mark';
  b.addEventListener('click', async () => {
    await fetch('/mark/' + encodeURIComponent(id), { method: 'POST' });
  });
  document.body.append(b);
  history.replaceState(null, '', '/booting/' + encodeURIComponent(id) + '?ready=1');
}, 700);
</script>
</body></html>`;

/**
 * BOOTING's sibling, for the other half of that window: the marker NEVER
 * renders, and the url only names the record after the wait. The page offers
 * its work from the start and keeps saying "Loading" forever, while a moment
 * later it rewrites its own address to carry the record id in a query key.
 *
 * That is fwgr47-n2's shape taken to its end: the escape hatch a missing
 * marker has — the url already naming this run's record (urlRecordParts) — was
 * unavailable at the FIRST look only because the app had not yet written the
 * pattern's bound query keys. A runner that polls for the marker and then
 * throws without asking the url again stops on a page whose url has, by then,
 * answered the very question the marker was asked.
 */
const SILENT = (id: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Record</title></head><body>
<h1>Loading</h1>
<button class="mark" type="button">Mark</button>
<script>
const id = ${JSON.stringify(id)};
document.querySelector('button.mark').addEventListener('click', async () => {
  await fetch('/mark/' + encodeURIComponent(id), { method: 'POST' });
});
setTimeout(() => {
  history.replaceState(null, '', '/silent/' + encodeURIComponent(id) + '?rec=' + encodeURIComponent(id) + '&ready=1');
}, 700);
</script>
</body></html>`;

/**
 * The page a navigation lands on when its record is gone: Odoo answers a url
 * for a deleted record with a toast ("Can't fetch record(s) 22") a moment after
 * the page renders, and a page that still offers work. fwod45-n3 replayed a
 * goto here at tier A and went on; the compiled script stopped.
 */
const GONE = `<!doctype html><html><head><meta charset="utf-8"><title>Gone</title></head><body>
<h1>Records</h1>
<button class="mark" type="button" data-id="gone">Mark</button>
<script>
setTimeout(() => {
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.textContent = "Can't fetch record(s) 22. They might have been deleted.";
  document.body.append(el);
}, 50);
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * An app that answers a url for a view it will not give with another view:
 * `/views#view_type=form&id=22` is rewritten to `#view_type=list` once the
 * page runs, the way Odoo lands a deleted record's form url on its list.
 * Nothing is raised — only where the browser ended up says it went wrong.
 */
const VIEWS = `<!doctype html><html><head><meta charset="utf-8"><title>Views</title></head><body>
<h1>Orders</h1>
<button class="mark" type="button" data-id="views">Mark</button>
<script>
if (/view_type=form/.test(location.hash)) history.replaceState(null, '', '/views#view_type=list');
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A form whose picker the app may REFUSE: `/project/open` keeps whatever is
 * chosen; `/project/locked` reverts every choice to Alpha in the change
 * handler, the way an app rejects a value it does not accept. Either way the
 * select action itself succeeds, so the only evidence that the choice landed
 * is the control's VALUE — the half of a snapshot line (`- combobox
 * "Project": Beta`) a locator built off the line's name never looked at. Save
 * posts the value the control holds, which the log records.
 */
const PROJECT = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Project</title></head><body>
<h1>Project</h1>
<select id="project" aria-label="Project">
  <option value="Alpha" selected>Alpha</option>
  <option value="Beta">Beta</option>
  <option value="Gamma">Gamma</option>
</select>
<button id="save" type="button">Save project</button>
<script>
const locked = ${JSON.stringify(mode === 'locked')};
const select = document.getElementById('project');
select.addEventListener('change', () => { if (locked) select.value = 'Alpha'; });
document.getElementById('save').addEventListener('click', async () => {
  await fetch('/save/' + encodeURIComponent(select.value), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * Conditional UI: Exit opens a "Discard changes?" dialog only when the page
 * is DIRTY (`/discard/dirty`); on a clean page (`/discard/clean`) it does
 * nothing, and that is the app working, not a failed step. The dialog's own
 * Discard button confirms through the server; Mark is a step of the page's
 * own, outside the dialog, and must run either way.
 */
const DISCARD = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Editor</title></head><body>
<h1>Editor</h1>
<button id="exit" type="button">Exit</button>
<button class="mark" type="button" data-id="editor">Mark</button>
<dialog id="confirm" aria-label="Discard changes?">
  <p>Discard changes?</p>
  <button id="discard" type="button">Discard</button>
</dialog>
<script>
const dirty = ${JSON.stringify(mode === 'dirty')};
document.getElementById('exit').addEventListener('click', () => {
  if (dirty) document.getElementById('confirm').showModal();
});
document.getElementById('discard').addEventListener('click', async () => {
  await fetch('/discard/confirm', { method: 'POST' });
  document.getElementById('confirm').close();
});
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A control INSIDE A LINK: `/away/foreign` wraps the Mark button in an anchor
 * to another origin, `/away/home` in one to this origin. The click handler
 * prevents the navigation either way, so the only evidence a runner acted is
 * the mark in the log — and the origin rule (resolve.ts, rule 3c) judges the
 * anchor's href, not whether it navigated. A resolver that takes a guessed
 * fallback sitting under a foreign link marks here; one that refuses does not.
 */
const AWAY = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Away</title></head><body>
<h1>Away</h1>
<a id="wrap" href="${mode === 'foreign' ? 'http://example.invalid/away' : '/record/home'}"><button class="mark" type="button" data-id="away">Mark</button></a>
<script>
document.querySelector('.mark').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A control that is DISABLED (`/gate/disabled`) or not (`/gate/enabled`).
 * Approve logs `mark:approve` when its handler runs. A browser suppresses
 * clicks on a disabled button, so a forced click there dispatches nothing the
 * app sees: a runner that reports it as clicked has claimed an action that
 * never happened (notes/ROBUSTNESS.md, finding 2). `/gate/late` starts disabled and
 * enables Approve 1.5s after load: disabled only while the page settles, the
 * timing a runner must wait out rather than refuse (fwgr39-n3).
 */
const GATE = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Gate</title></head><body>
<h1>Gate</h1>
<button id="approve" type="button"${mode === 'disabled' || mode === 'late' ? ' disabled' : ''}>Approve</button>
<script>
${mode === 'late' ? "setTimeout(() => { document.querySelector('#approve').disabled = false; }, 1500);" : ''}
document.querySelector('#approve').addEventListener('click', async () => {
  await fetch('/mark/approve', { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A page whose Mark lands AND, beside it, an unrelated panel fails to load:
 * the shape of fwgr34, where the Grafana home page a step arrived on rendered
 * "Error loading RSS feed" (an offline box, a feed it cannot reach). Mark logs
 * `mark:<id>` and shows "Marked <id>"; the feed panel's alert is raised at the
 * same moment and has nothing to do with whether Mark worked. A rejected Mark
 * (faults.rejectWrite) shows the feed alert too, and no "Marked" heading.
 */
const AMBIENT = `<!doctype html><html><head><meta charset="utf-8"><title>Ambient</title></head><body>
<h1>Ambient</h1>
<button class="mark" type="button" data-id="Item 1">Mark</button>
<div id="out"></div>
<script>
document.querySelector('.mark').addEventListener('click', async (e) => {
  const res = await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
  const feed = document.createElement('div');
  feed.setAttribute('role', 'alert');
  feed.textContent = 'Error loading feed';
  document.getElementById('out').replaceChildren(feed);
  if (res.ok) {
    const done = document.createElement('h2');
    done.textContent = 'Marked ' + e.target.dataset.id;
    document.getElementById('out').append(done);
  }
});
</script>
</body></html>`;

/**
 * Two routes that differ only by a WORD: `/checkout/<result>` has a Pay
 * button that lands on `/outcome/<result>`, and the outcome page has a Mark
 * button. `success` against `failure` is a different page, not a volatile
 * value, so a runner that recorded success must not mark on failure
 * (notes/ROBUSTNESS.md, finding 3). `/checkout-q/<result>` is the same flow with
 * the outcome in the QUERY, `/outcome?result=<result>`: the half of the
 * finding the url model used to drop.
 */
const CHECKOUT = (result: string, byQuery = false) => `<!doctype html><html><head><meta charset="utf-8"><title>Checkout</title></head><body>
<h1>Checkout</h1>
<a id="pay" href="${byQuery ? '/outcome?result=' : '/outcome/'}${encodeURIComponent(result)}" role="button">Pay</a>
</body></html>`;
const OUTCOME = (result: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Outcome</title></head><body>
<h1>Payment ${result === 'success' ? 'succeeded' : 'failed'}</h1>
<button class="mark" type="button" data-id="outcome">Mark</button>
<script>
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A navigation whose recorded link is GONE. The recording clicked a link
 * named "Open record r7"; this page no longer has it. `/nav/other` still
 * offers another visible link to the same destination (a sidebar entry named
 * differently); `/nav/none` has no link to it at all. The record page logs
 * the visit, so the log says whether a runner got there, and how is the
 * difference between the two pages.
 */
const NAV = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Nav</title></head><body>
<h1>Navigation</h1>
${mode === 'other' ? '<nav><a href="/record/r7">Record seven</a></nav>' : '<p>Nothing to open here.</p>'}
</body></html>`;

/**
 * A text condition shown in a DIFFERENT element than the one a wait resolves
 * first: `#status` is present and never shows it, while the tickets region shows
 * "Ticket T-9 created" (`/held/yes`) or nothing (`/held/no`). Mark proves
 * whether a runner went past the wait.
 */
const HELD = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Held</title></head><body>
<h1>Held</h1>
<p id="status">Working</p>
<section aria-label="Tickets"><span>${mode === 'yes' ? 'Ticket T-9 created' : 'No tickets'}</span></section>
<button class="mark" type="button" data-id="held">Mark</button>
<script>
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * The item list with an Open link per row, to its record page: the shape of a
 * loop whose body OPENS each record (the url gains the record's id, which a
 * record-creating step mints) and goes back to the list.
 */
const ROWS = `<!doctype html><html><head><meta charset="utf-8"><title>Rows</title></head><body>
<h1>Rows</h1>
<ul id="items"></ul>
<script>
fetch('/items').then((r) => r.json()).then((names) => {
  document.getElementById('items').innerHTML = names
    .map((n) => '<li class="item">' + n + ' <a class="open" href="/record/' + encodeURIComponent(n) + '">Open</a></li>')
    .join('');
});
</script>
</body></html>`;

/**
 * The widgets of test/fixture/components.html, served with a commit log. A
 * monaco-shaped editor (focus redirects to a hidden textarea; the MODEL is
 * updated only by real editing — an `input` event carrying an `inputType`, as
 * keyboard insertText fires and a synthetic `new Event('input')` from a
 * native value setter does not — and renders into `.view-lines` with NBSPs,
 * like the real thing); a plain contenteditable; a second contenteditable
 * whose text is what a recording located it by (so replacing its content
 * un-matches that target mid-recipe); a native select as the control. Each Save button posts what the APP holds, so the log says whether
 * a runner drove the widget the way the app reads it, not merely that the
 * runner reported success.
 */
const EDITOR = `<!doctype html><html><head><meta charset="utf-8"><title>Editor widgets</title></head><body>
<h1>Editor widgets</h1>
<div class="monaco-editor" id="mon" style="border:1px solid #888;width:400px;height:80px;position:relative">
  <textarea class="inputarea" aria-label="Editor input" style="position:absolute;opacity:0.01;width:1px;height:1px"></textarea>
  <div class="view-lines" style="font-family:monospace;padding:4px">initial&nbsp;model&nbsp;text</div>
</div>
<button id="save-editor" type="button">Save editor</button>
<div id="ce" contenteditable="true" aria-label="Note" style="border:1px solid #888;width:400px;min-height:40px;padding:4px">starting content</div>
<button id="save-note" type="button">Save note</button>
<div id="draft" contenteditable="true" aria-label="Draft" style="border:1px solid #888;width:400px;min-height:40px;padding:4px">draft body</div>
<button id="save-draft" type="button">Save draft</button>
<select id="sel" aria-label="Choice">
  <option value="Alpha" selected>Alpha</option>
  <option value="Beta">Beta</option>
  <option value="Gamma">Gamma</option>
</select>
<button id="save-choice" type="button">Save choice</button>
<script>
const mon = document.getElementById('mon');
const ta = mon.querySelector('textarea');
const lines = mon.querySelector('.view-lines');
let model = 'initial model text';
ta.value = model;
mon.addEventListener('mousedown', (e) => { if (e.target !== ta) { e.preventDefault(); ta.focus(); } });
ta.addEventListener('input', (e) => {
  if (typeof e.inputType !== 'string' || !e.inputType) return; // not an edit: the editor ignores it
  model = ta.value;
  lines.textContent = model.replace(/ /g, '\\u00a0');
});
const commit = (kind, value) => fetch('/commit/' + kind + '/' + encodeURIComponent(value), { method: 'POST' });
document.getElementById('save-editor').addEventListener('click', () => commit('editor', model));
document.getElementById('save-note').addEventListener('click', () => commit('note', document.getElementById('ce').innerText));
document.getElementById('save-draft').addEventListener('click', () => commit('draft', document.getElementById('draft').innerText));
document.getElementById('save-choice').addEventListener('click', () => commit('choice', document.getElementById('sel').value));
</script>
</body></html>`;

/**
 * A login form an app rebuilds while it is still starting up (fwvk1 n3
 * 01-open: Vikunja's service worker took control and reloaded /login after
 * both fills had passed their checks). Here: 150ms after both fields first
 * hold a value, the form is replaced by a fresh, empty one — same ids, same
 * labels, same url. Sign in posts what the fields hold AT THE CLICK
 * (`commit:login:<user>:<pass>`), and an empty field posts nothing and says
 * so — the fixture's log is the oracle, not either runner's report.
 */
/**
 * A second-factor page: one code field and Verify. The SERVER checks the code
 * (/totp/verify) against FIXTURE_TOTP_SEED with its own RFC 6238, and logs
 * only `totp:ok` / `totp:rejected` — the log is the oracle, and it never holds
 * a code. A good code goes on to /signed-in.
 */
export const FIXTURE_TOTP_SEED = 'JBSWY3DPEHPK3PXP';

function fixtureTotp(counter: number): string {
  const key = Buffer.alloc(10);
  // base32 decode of the fixed seed, done independently of src/execution/totp.ts
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (const ch of FIXTURE_TOTP_SEED) {
    acc = (acc << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key[n++] = (acc >>> bits) & 0xff;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key.subarray(0, n)).update(msg).digest();
  const at = mac[mac.length - 1] & 0x0f;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const TOTP_LOGIN = `<!doctype html><html><head><meta charset="utf-8"><title>Verify</title></head><body>
<h1>Two-factor authentication</h1>
<label for="code">Authentication code</label><input id="code" inputmode="numeric" autocomplete="one-time-code">
<button id="verify" type="button">Verify</button>
<p id="status"></p>
<script>
document.getElementById('verify').addEventListener('click', async () => {
  const res = await fetch('/totp/verify/' + encodeURIComponent(document.getElementById('code').value), { method: 'POST' });
  if (res.ok) location.href = '/signed-in';
  else document.getElementById('status').textContent = 'Invalid code';
});
</script>
</body></html>`;

const RELOGIN = `<!doctype html><html><head><meta charset="utf-8"><title>Sign in</title></head><body>
<h1>Sign in</h1>
<div id="host"></div>
<p id="status"></p>
<script>
const FORM = '<form id="loginform" onsubmit="return false"><label for="username">Username</label><input id="username" name="username">' +
  '<label for="password">Password</label><input id="password" name="password" type="password">' +
  '<button id="login" type="button">Sign in</button></form>';
const host = document.getElementById('host');
let rebuilt = false;
const mount = () => {
  host.innerHTML = FORM;
  const user = document.getElementById('username');
  const pass = document.getElementById('password');
  const armed = () => {
    if (rebuilt || !user.value || !pass.value) return;
    rebuilt = true;
    setTimeout(mount, 150);
  };
  user.addEventListener('input', armed);
  pass.addEventListener('input', armed);
  document.getElementById('login').addEventListener('click', () => {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    if (!u || !p) { document.getElementById('status').textContent = 'Username and password are required'; return; }
    fetch('/commit/login/' + encodeURIComponent(u + ':' + p), { method: 'POST' })
      .then(() => { document.getElementById('status').textContent = 'Signed in as ' + u; });
  });
};
mount();
</script>
</body></html>`;

/**
 * A formatted-number widget (fwec2 n1 03-create's Amount box, AutoNumeric-
 * style): it keeps its OWN copy of the value, updated only from key events,
 * and rebuilds the field from that copy when focus leaves it — so a value set
 * through the native setter shows until the blur and is then gone. A plain
 * Note input beside it is the control. Save posts what both fields show.
 */
const AMOUNT = `<!doctype html><html><head><meta charset="utf-8"><title>Opportunity</title></head><body>
<h1>Opportunity</h1>
<label for="amount">Amount</label><input id="amount" type="text" inputmode="decimal">
<label for="note">Note</label><input id="note" type="text">
<button id="save" type="button">Save</button>
<script>
const amount = document.getElementById('amount');
let own = '';
amount.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace') own = '';
  else if (/^[0-9]$/.test(e.key)) own += e.key;
  else if (e.key.length === 1 && e.key !== '.' && e.key !== ',') e.preventDefault();
});
amount.addEventListener('focus', () => { amount.value = own; });
amount.addEventListener('blur', () => { amount.value = own ? Number(own).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''; });
document.getElementById('save').addEventListener('click', () => {
  fetch('/commit/opportunity/' + encodeURIComponent(amount.value + '|' + document.getElementById('note').value), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A login page whose DOCUMENT is replaced at the same url (fwvk2 n2 01-open:
 * Vikunja's service worker reloaded /login). `/reload-login/fill`: 100ms after
 * both fields first hold a value, the page calls location.reload().
 * `/reload-login/submit`: the FIRST Sign in click reloads the page instead of
 * submitting (the reload landing between the click and its answer).
 * `/reload-login/echo` (round 56, fwvk8 01-open): 100ms after the USERNAME
 * first holds a value — before the fill's own check has looked — the page
 * reloads, so that check finds the field empty. `/reload-login/reject`: no
 * reload; the page empties the username 100ms after every input (a value that
 * did not take). Once per tab each (sessionStorage). Sign in posts what the fields hold at the click
 * and then goes to /signed-in; an empty field posts nothing.
 */
const RELOAD_LOGIN = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Sign in</title></head><body>
<h1>Sign in</h1>
<div id="host"></div>
<p id="status"></p>
<script>
const MODE = ${JSON.stringify(mode)};
const once = (key) => { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1'); return true; };
const build = () => {
  document.getElementById('host').innerHTML = '<label for="username">Username</label><input id="username">' +
    '<label for="password">Password</label><input id="password" type="password"><button id="login" type="button">Sign in</button>';
  const user = document.getElementById('username');
  const pass = document.getElementById('password');
  const armed = () => { if (MODE === 'fill' && user.value && pass.value && once('reloaded-fill')) setTimeout(() => location.reload(), 100); };
  user.addEventListener('input', () => {
    if (MODE === 'echo' && user.value && once('reloaded-echo')) setTimeout(() => location.reload(), 100);
    if (MODE === 'reject') setTimeout(() => { user.value = ''; }, 100);
  });
  user.addEventListener('input', armed);
  pass.addEventListener('input', armed);
  // Round 62, vikunja fwvk13: 'delay-<ms>' reloads the document <ms> after the
  // first value is typed; 'clear-<ms>' empties both fields then, with no
  // reload; 'blur' reloads the moment the password field loses focus, which
  // is the moment the pre-submit check looks at the form (a reload landing
  // inside that check). Once per tab each.
  const timed = /^(delay|clear)-([0-9]+)$/.exec(MODE);
  const first = () => {
    if (!timed || !once('timed-' + MODE)) return;
    setTimeout(() => {
      if (timed[1] === 'delay') { sessionStorage.setItem('reloaded-fill', '1'); location.reload(); }
      else { user.value = ''; pass.value = ''; }
    }, Number(timed[2]));
  };
  user.addEventListener('input', first);
  pass.addEventListener('input', first);
  pass.addEventListener('blur', () => {
    if (MODE === 'blur' && pass.value && once('reloaded-blur')) { sessionStorage.setItem('reloaded-fill', '1'); location.reload(); }
  });
  document.getElementById('login').addEventListener('click', async () => {
    if (MODE === 'submit' && once('reloaded-submit')) { location.reload(); return; }
    if (!user.value || !pass.value) { document.getElementById('status').textContent = 'Username and password are required'; return; }
    await fetch('/commit/login/' + encodeURIComponent(user.value + ':' + pass.value), { method: 'POST' });
    location.href = '/signed-in';
  });
};
// The reloaded document is an app starting up again: it builds its form late,
// so a look taken soon after the reload finds no field at all.
if (sessionStorage.getItem('reloaded-fill') || sessionStorage.getItem('reloaded-echo')) setTimeout(build, 800);
else build();
</script>
</body></html>`;

/**
 * A disclosure (fwsi1 05-change's "Show/Hide More Information"): one button
 * shows and hides a panel of links. `/disclosure/open` starts shown,
 * `/disclosure/closed` hidden. Every click posts the state it left the panel
 * in (`commit:panel:shown|hidden`), so the log says how many clicks landed.
 */
const DISCLOSURE = (state: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Asset</title></head><body>
<h1>Asset</h1>
<button id="expand" type="button" aria-label="Show/Hide More Information">i</button>
<div id="panel"${state === 'open' ? '' : ' hidden'}><a href="#m">Model One</a> <a href="#k">Maker One</a></div>
<script>
document.getElementById('expand').addEventListener('click', () => {
  const panel = document.getElementById('panel');
  panel.hidden = !panel.hidden;
  fetch('/commit/panel/' + (panel.hidden ? 'hidden' : 'shown'), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A state change whose only evidence is what the page renders after it:
 * Stamp posts `/stamp/doc` and, when the server accepts it, adds a "Revert"
 * button. A REJECTED stamp raises no toast — the page simply stays as it was
 * — so no alert gate can see it, and only the recorded effect line (`- button
 * "Revert"`) says the step did not land. Mark is the next mutation.
 */
const STAMP = `<!doctype html><html><head><meta charset="utf-8"><title>Stamp</title></head><body>
<h1>Stamp</h1>
<button id="stamp" type="button">Stamp</button>
<button class="mark" type="button" data-id="stamp">Mark</button>
<div id="after"></div>
<script>
document.getElementById('stamp').addEventListener('click', async () => {
  const res = await fetch('/stamp/doc', { method: 'POST' });
  if (res.ok) document.getElementById('after').innerHTML = '<button type="button">Revert</button>';
});
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * An app that keeps its routing STATE in a query-shaped fragment, the odoo
 * shape: "Open action" sets `#cids=1&action=9&menu_id=4` — keys in an order
 * no recording has to share, and one (`menu_id`) a recording may not have
 * named. The fragment never reaches the server, so Mark is what the log sees.
 */
const HASH = `<!doctype html><html><head><meta charset="utf-8"><title>Hash</title></head><body>
<h1>Hash state</h1>
<button id="open" type="button">Open action</button>
<button class="mark" type="button" data-id="hash">Mark</button>
<script>
document.getElementById('open').addEventListener('click', () => { location.hash = 'cids=1&action=9&menu_id=4'; });
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A menu button that is a TOGGLE: "Actions" posts `/toggle/actions` and flips
 * the "Row actions" menu open or shut. `/menu/closed` loads with the menu
 * shut; `/menu/open` loads with it already showing (the state a previous
 * step left); `/menu/gone` shows the open menu but no Actions button at all.
 * Archive, inside the menu, is the step that depends on it being open.
 */
const MENU = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Menu</title></head><body>
<h1>Menu</h1>
${mode === 'gone' ? '' : '<button id="actions" type="button">Actions</button>'}
<div id="menu" role="menu" aria-label="Row actions"${mode === 'closed' ? ' hidden' : ''}>
  <button role="menuitem" id="archive" type="button">Archive</button>
</div>
<script>
const actions = document.getElementById('actions');
if (actions) actions.addEventListener('click', async () => {
  await fetch('/toggle/actions', { method: 'POST' });
  const menu = document.getElementById('menu');
  menu.hidden = !menu.hidden;
});
document.getElementById('archive').addEventListener('click', async () => {
  await fetch('/archive/row', { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A record-creating form: Create posts `/create/r-new` and, when the server
 * accepts it, navigates to the new record's page. Refused, it stays on
 * `/create/form` with no toast — the url part a `mints` step reads is then
 * exactly what it was before the click.
 */
const CREATE = `<!doctype html><html><head><meta charset="utf-8"><title>Create</title></head><body>
<h1>New record</h1>
<button id="create" type="button">Create</button>
<script>
document.getElementById('create').addEventListener('click', async () => {
  const res = await fetch('/create/r-new', { method: 'POST' });
  if (res.ok) location.href = '/record/r-new';
});
</script>
</body></html>`;

/**
 * A url that exposes a part and then REDIRECTS once more: `/hop/start-<n>`
 * renders, and 300ms later replaces itself with `/hop/final-<n>` — the shape
 * of an app that routes to a placeholder id and then to the real one. Nothing
 * on the page changes in between, so no DOM activity announces the second
 * hop. `/hopper` links to a start url. The server logs every hop it serves.
 */
const HOP = (id: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Hop</title></head><body>
<h1>Hop ${id}</h1>
<script>
${id.startsWith('start-') ? `setTimeout(() => location.replace('/hop/final-' + ${JSON.stringify(id.slice('start-'.length))}), 300);` : ''}
</script>
</body></html>`;
const HOPPER = `<!doctype html><html><head><meta charset="utf-8"><title>Hopper</title></head><body>
<h1>Hopper</h1>
<a id="go" href="/hop/start-5">Go</a>
</body></html>`;

/**
 * Three native controls whose apps read them differently, each committed by
 * its own Save button through `/commit/<kind>/<value>`:
 *  - a <select> whose option VALUES are codes (`b-2`) and labels are words
 *    (`Beta`), so a recorded label the app has since renamed misses and only
 *    the recorded `optionValue` finds the option;
 *  - an <input type=number> whose app commits on `change` only (an `input`
 *    alone leaves the committed quantity at 1);
 *  - an ARIA combobox <input> whose options render into a portal outside its
 *    subtree once something is typed, and whose value is set only by clicking
 *    an option — no native `selectOption` can drive it.
 */
/**
 * An image-only link (fwgt5 01-signin: gitea's org avatar link). Its
 * accessible name comes from its title and the image's alt; it renders no
 * text, so innerText is "".
 */
const IMAGE_LINK = `<!doctype html><html><head><meta charset="utf-8"><title>Org</title></head><body>
<h1>Dashboard</h1>
<a id="org" href="/org" title="bench"><img alt="bench" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>
</body></html>`;

/**
 * A tab whose label is styled upper-case (round 55, openproject fwop10): the
 * DOM holds "Overview", innerText — what the recording's wait saw — is
 * "OVERVIEW". `#blank` is an element with no text, for a wait whose primary
 * candidate resolves somewhere that never shows it.
 */
const TRANSFORM = `<!doctype html><html><head><meta charset="utf-8"><title>Work package</title></head><body>
<h1>Work package</h1>
<nav><a id="tab" href="#overview" style="text-transform: uppercase">Overview</a> <span id="blank"></span></nav>
</body></html>`;

/**
 * A column link whose rendered text ends in a non-breaking space (round 55,
 * kanboard fwkb39: a read published "Backlog "), and a button that shows the
 * next column's link.
 */
const BOARD = `<!doctype html><html><head><meta charset="utf-8"><title>Board</title></head><body>
<h1>Board</h1>
<a id="col" href="#backlog">Backlog&nbsp;</a>
<button id="more" onclick="document.getElementById('cols').innerHTML = '<a href=&quot;#ready&quot;>Ready</a>'">Show more</button>
<div id="cols"></div>
</body></html>`;

/**
 * Two part rows of one ticket (round 55, repairdesk fwrd87 04-add): the
 * recording read Part A's row, whose test hook names its id; this run's part
 * is Part B.
 */
const PARTS = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title></head><body>
<h1>Ticket</h1>
<section><div><table><tbody>
<tr data-testid="part-row-p18"><td>run-2 RD Part A</td><td>$100.00</td></tr>
<tr data-testid="part-row-p19"><td>run-2 RD Part B</td><td>$200.00</td></tr>
</tbody></table></div></section>
</body></html>`;

/**
 * A picker driven by the KEYBOARD (round 62, gitea fwgt13): clicking "Labels"
 * opens the listbox; ArrowDown/ArrowUp move the highlight (none at first, as
 * Fomantic's menu starts); Enter clicks the highlighted item, which toggles
 * it; Escape shuts the picker and posts `commit:labels:<applied>`.
 * `?shifted=1` lists one more label first ("good first issue"), so the same
 * arrow presses land one item earlier — the page a fresh app shows where the
 * recording's did not.
 */
const KBD_PICKER = (shifted: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>New issue</title></head><body>
<h1>New issue</h1>
<div id="labels" role="combobox" aria-label="Labels" aria-expanded="false" tabindex="0">Labels</div>
<div id="menu" role="listbox" aria-label="Label choices" hidden>
  ${shifted ? '<a href="#" class="item">good first issue</a>' : ''}
  <a href="#" class="item">bug</a>
  <a href="#" class="item">documentation</a>
  <a href="#" class="item">enhancement</a>
  <a href="#" class="item">priority-high</a>
</div>
<script>
const menu = document.getElementById('menu');
const box = document.getElementById('labels');
const items = () => Array.from(menu.querySelectorAll('a.item'));
let active = -1;
const picked = new Set();
box.addEventListener('click', () => {
  menu.hidden = !menu.hidden;
  box.setAttribute('aria-expanded', String(!menu.hidden));
  active = -1;
});
menu.addEventListener('click', (e) => {
  const a = e.target.closest('a.item');
  if (!a) return;
  e.preventDefault();
  const name = a.textContent.trim();
  if (picked.has(name)) picked.delete(name); else picked.add(name);
});
document.addEventListener('keydown', (e) => {
  if (menu.hidden) return;
  const list = items();
  if (e.key === 'ArrowDown') { active = Math.min(active + 1, list.length - 1); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); e.preventDefault(); }
  else if (e.key === 'Enter' && active >= 0) { list[active].click(); e.preventDefault(); }
  else if (e.key === 'Escape') {
    menu.hidden = true;
    box.setAttribute('aria-expanded', 'false');
    fetch('/commit/labels/' + encodeURIComponent([...picked].sort().join(',')), { method: 'POST' });
  }
  list.forEach((a, i) => a.classList.toggle('active', i === active));
});
</script>
</body></html>`;

/**
 * A label picker that commits on CLOSE (round 60, gitea fwgt11 04-set):
 * clicking "Labels" opens or shuts the listbox; a click on an item toggles it
 * in the pending selection; shutting the picker (the Labels click again, or
 * Escape) posts `commit:labels:<applied, comma-joined>` when the selection
 * changed and lists the applied labels as links beside it, as Gitea's
 * sidebar does. What is applied survives a reload (sessionStorage); what is
 * pending does not. `?escape=0`: Escape does not shut it (Gitea's picker on
 * fwgt11's replays). `?stuck=1`: the Labels click does not shut it either.
 * `?furniture=1` (round 61): a `link "bug"` outside the picker from the start
 * (a nav link that merely shares the name), for the applied-pick control.
 *
 * Escape and focus: whether Escape shuts Gitea's picker depends on where focus
 * is, not on the picker. fwgt11's untargeted Escape (focus on the page) left
 * it open on the replays; fwgt12-n1 entry 64, an Escape pressed IN the filter
 * input, shut it (its obs removed the listbox). `escape=0` models the first
 * case only.
 */
const LABEL_PICKER = (mode: { escape: boolean; stuck: boolean; furniture: boolean }) => `<!doctype html><html><head><meta charset="utf-8"><title>Issue</title></head><body>
${mode.furniture ? '<nav><a href="/wiki/bug">bug</a></nav>' : ''}
<h1>Issue #4</h1>
<div id="labels" role="combobox" aria-label="Labels" aria-expanded="false" tabindex="0">Labels</div>
<div id="menu" role="listbox" aria-label="Label choices" hidden>
  <a href="#" class="item" data-value="1">bug</a>
  <a href="#" class="item" data-value="2">priority-high</a>
</div>
<div id="applied"></div>
<script>
const names = { 1: 'bug', 2: 'priority-high' };
let applied = JSON.parse(sessionStorage.getItem('applied') || '[]');
let pending = new Set();
const menu = document.getElementById('menu');
const box = document.getElementById('labels');
const render = () => { document.getElementById('applied').innerHTML = applied.map((v) => '<a href="/issues?labels=' + v + '">' + names[v] + '</a>').join(' '); };
render();
function shut() {
  if (menu.hidden) return;
  menu.hidden = true;
  box.setAttribute('aria-expanded', 'false');
  const next = [...pending].sort();
  if (next.join(',') === applied.join(',')) return;
  applied = next;
  sessionStorage.setItem('applied', JSON.stringify(applied));
  fetch('/commit/labels/' + encodeURIComponent(applied.map((v) => names[v]).join(',')), { method: 'POST' });
  render();
}
box.addEventListener('click', () => {
  if (!menu.hidden) { if (${mode.stuck ? 'false' : 'true'}) shut(); return; }
  pending = new Set(applied);
  menu.hidden = false;
  box.setAttribute('aria-expanded', 'true');
});
menu.addEventListener('click', (e) => {
  const a = e.target.closest('a.item');
  if (!a) return;
  e.preventDefault();
  const v = a.dataset.value;
  if (pending.has(v)) pending.delete(v); else pending.add(v);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ${mode.escape ? 'true' : 'false'}) shut(); });
</script>
</body></html>`;

/**
 * A status change that raised no alert (round 56, repairdesk fwrd88
 * 05-change: `read_all role=alert what:count` recorded "0"). `#list` is the
 * container a count of its rows scopes to; `?nolist=1` is the same page with
 * that container never rendered, where a count of its rows proves nothing.
 */
const COUNTS = (list: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title></head><body>
<h1>Ticket</h1>
<p id="status">Status Ready</p>
${list ? '<section id="panel"><ul id="list"></ul></section>' : ''}
</body></html>`;

/**
 * A panel whose menu button the app shows only once the panel is hovered
 * (round 57, grafana fwgr70 02-create s_2712e5/5): the button is
 * `visibility: hidden` until a mouseover reaches the panel, so a real hover
 * on the button itself never becomes actionable. Clicking the shown button
 * opens the menu and posts `commit:menu:open`.
 */
const HOVER_MENU = `<!doctype html><html><head><meta charset="utf-8"><title>Dashboard</title></head><body>
<h1>Dashboard</h1>
<div id="panel" style="padding: 24px; border: 1px solid #999; width: 300px"><span>CPU panel</span>
<button id="menu" type="button" aria-label="Menu for CPU panel" style="visibility: hidden">&#8942;</button></div>
<ul id="items" role="menu" hidden><li role="menuitem">Edit</li></ul>
<script>
const panel = document.getElementById('panel');
const menu = document.getElementById('menu');
panel.addEventListener('mouseover', () => { menu.style.visibility = 'visible'; });
menu.addEventListener('click', () => {
  document.getElementById('items').hidden = false;
  fetch('/commit/menu/open', { method: 'POST' });
});
</script>
</body></html>`;

/**
 * An opportunity form whose account field empties the amount (round 57,
 * espocrm fwec10): typing an account clears `#amount` without an input event,
 * as the app's own relation handler did. "Pick" is a click that does nothing
 * but go out (a submit, for the standing-fill check); Save posts
 * `commit:opportunity:<amount as the field holds it>`. `?sticky=1`: the amount
 * widget keeps its own copy of the last value it held and puts it back in
 * front of whatever is typed into the field afterwards — a field that ends up
 * holding its value twice however it was cleared.
 */
const TYPED_AMOUNT = (sticky: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Opportunity</title></head><body>
<h1>Create Opportunity</h1>
<label for="amount">Amount</label><input id="amount">
<label for="account">Account</label><input id="account">
<button id="pick" type="button">Pick</button>
<button id="save" type="button">Save</button>
<script>
const STICKY = ${sticky};
const amount = document.getElementById('amount');
let copy = '';
amount.addEventListener('input', () => {
  if (STICKY && copy && amount.value && !amount.value.startsWith(copy)) amount.value = copy + amount.value;
  if (amount.value) copy = amount.value;
});
document.getElementById('account').addEventListener('input', () => { amount.value = ''; });
document.getElementById('save').addEventListener('click', () => {
  fetch('/commit/opportunity/' + encodeURIComponent(amount.value), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * An editor that DOUBLES what is typed into it (round 61, grafana fwgr73
 * 04-open line 125): monaco's auto-closing turned a typed `"tags"` into
 * `"tags""tags""`, and the recording carried on from that. `/code-editor`:
 * the Code field, on an input that leaves it reading "tags", appends a second
 * "tags". Save posts `commit:code:<value>`.
 */
const CODE_EDITOR = `<!doctype html><html><head><meta charset="utf-8"><title>Code</title></head><body>
<h1>JSON model</h1>
<label for="code">Code</label><textarea id="code"></textarea>
<button id="save" type="button">Save</button>
<script>
const code = document.getElementById('code');
code.addEventListener('input', () => { if (code.value === 'tags') code.value = 'tagstags'; });
document.getElementById('save').addEventListener('click', () => {
  fetch('/commit/code/' + encodeURIComponent(code.value), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A toolbar whose EDIT MODE swaps its buttons (round 61, grafana fwgr73
 * 05-open step 3). `/edit-mode/view`: Edit (testid edit-btn) and Share;
 * clicking Edit enters edit mode. `/edit-mode/edit`: already in edit mode —
 * Exit edit sits where Edit sat, then Add, Settings, Save dashboard.
 * `/edit-mode/twin`: two buttons both named Edit and no testid; either
 * enters edit mode. Exit edit posts `commit:dashboard:exit` and leaves edit
 * mode; Save dashboard posts `commit:dashboard:saved`. A Title field is on
 * every mode.
 */
const EDIT_MODE = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Dashboard</title></head><body>
<h1>Dashboard</h1>
<label for="title">Title</label><input id="title">
<div id="bar"></div>
<script>
const bar = document.getElementById('bar');
const post = (what) => fetch('/commit/dashboard/' + what, { method: 'POST' });
function button(name, onClick, testid) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = name;
  if (testid) b.dataset.testid = testid;
  b.addEventListener('click', onClick);
  bar.appendChild(b);
}
function render(mode) {
  bar.innerHTML = '';
  if (mode === 'edit') {
    button('Exit edit', () => { post('exit'); render('view'); });
    button('Add', () => {});
    button('Settings', () => {});
    button('Save dashboard', () => post('saved'));
  } else if (mode === 'twin') {
    button('Edit', () => render('edit'));
    button('Edit', () => render('edit'));
  } else {
    button('Edit', () => render('edit'), 'edit-btn');
    button('Share', () => {});
  }
}
render(${JSON.stringify(mode)});
</script>
</body></html>`;

/**
 * A Save that adds the new record's row, whose accessible name then changes
 * (round 60, openproject fwop14 02-create s_459e98/3): OpenProject's list
 * showed `- row "<id> … TASK New - Normal"` as the save settled, and a moment
 * later the app routed to the record and re-rendered it. `/row-save/<ms>`: the
 * row reads "47 <subject> New", and <ms> later its last cell becomes "Open".
 * `/row-save/url-<ms>`: the same, and the app routes to `…/details/47` as it
 * renames the row. `/row-save/never`: Save posts but adds no row. Save posts
 * `commit:row:<subject>`.
 */
const ROW_SAVE = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Records</title></head><body>
<h1>Records</h1>
<label for="subject">Subject</label><input id="subject">
<button id="save" type="button">Save</button>
<table><tbody id="rows"></tbody></table>
<script>
const MODE = ${JSON.stringify(mode)};
document.getElementById('save').addEventListener('click', () => {
  const subject = document.getElementById('subject').value;
  fetch('/commit/row/' + encodeURIComponent(subject), { method: 'POST' });
  if (MODE === 'never') return;
  const tr = document.createElement('tr');
  tr.innerHTML = '<td>47</td><td></td><td>New</td>';
  tr.children[1].textContent = subject;
  document.getElementById('rows').appendChild(tr);
  // 'url-<ms>': <ms> later the app routes to the record's own view
  // (history.pushState to <this url>/details/47) and re-renders the row as it
  // does — the save's url is where the recording expected it to end.
  const routed = /^url-([0-9]+)$/.exec(MODE);
  const after = routed ? Number(routed[1]) : Number(MODE);
  setTimeout(() => {
    if (routed) history.pushState({}, '', location.pathname + '/details/47');
    tr.children[2].textContent = 'Open';
  }, after);
});
</script>
</body></html>`;

/**
 * A hash-routed editor (round 60, ghost fwgh14): "New post" mints a post and
 * routes to '#/editor/post/<id>' (Ghost's autosave does the same), "Posts"
 * routes back to the list, and a step that went back ends on '#/posts'.
 * "Board" routes to '#/board/view/5' (round 62, vikunja fwvk13): a page whose
 * url has a part at the post id's label (h2) on another route.
 * Opening '#/editor/post/<id>' directly shows "Post <id>" and a Publish that
 * posts commit:publish:<id>. Every create posts commit:create:<id>.
 */
const HASH_POSTS = `<!doctype html><html><head><meta charset="utf-8"><title>Posts</title></head><body>
<main id="view"></main>
<script>
const view = document.getElementById('view');
const render = () => {
  const at = '#/editor/post/';
  const m = location.hash.startsWith(at) ? [location.hash, location.hash.slice(at.length)] : null;
  if (m) {
    view.innerHTML = '<h1></h1><button id="publish" type="button">Publish</button> <a href="#/posts">Posts</a> <a href="#/board/view/5">Board</a>';
    view.querySelector('h1').textContent = 'Post ' + m[1];
    view.querySelector('#publish').onclick = () => fetch('/commit/publish/' + m[1], { method: 'POST' });
  } else {
    view.innerHTML = '<h1>Posts</h1><button id="new" type="button">New post</button>';
    view.querySelector('#new').onclick = () => {
      const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      fetch('/commit/create/' + id, { method: 'POST' });
      location.hash = '#/editor/post/' + id;
    };
  }
};
window.addEventListener('hashchange', render);
render();
</script>
</body></html>`;

/**
 * A part row and its cost field (round 51, repairdesk fwrd84 05-edit): Save
 * posts `/commit/cost/<value>` and redraws the row with the saved cost and
 * its price (cost × 1.25). `/price?stuck=1` is the same form whose Save
 * posts and redraws NOTHING: the save a replay must not report as done.
 */
const PRICE = (stuck: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Part</title></head><body>
<h1>Part</h1>
<table><tbody><tr id="row"><td>Part A</td><td id="cost">$100.00</td><td id="price">$125.00</td></tr></tbody></table>
<input id="f-cost" type="number" aria-label="Cost" value="100">
<button id="save" type="button">Save part</button>
<script>
document.getElementById('save').addEventListener('click', async () => {
  const v = document.getElementById('f-cost').value;
  ${stuck ? '' : "await fetch('/commit/cost/' + encodeURIComponent(v), { method: 'POST' });"}
  ${stuck ? '' : "document.getElementById('cost').textContent = '$' + Number(v).toFixed(2); document.getElementById('price').textContent = '$' + (Number(v) * 1.25).toFixed(2);"}
});
</script>
</body></html>`;

/**
 * A filter popup toggled by one button (round 56, vikunja fwvk8 02-create):
 * FILTERS opens and closes it, each click posting `/commit/filters/toggle`;
 * Add posts `/commit/add/task`. `/filters` starts with the popup shut,
 * `/filters?open=1` with it open, and `/filters?open=1&stuck=1` open with a
 * FILTERS button that no longer closes it.
 */
const FILTERS = (open: boolean, stuck: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Filters</title></head><body>
<h1>Bench Project</h1>
<button id="filters" type="button">Filters</button>
<div id="popup" ${open ? '' : 'hidden'}><input aria-label="Type a search or filter query…"><button type="button">Custom</button></div>
<button id="add" type="button">Add</button>
<script>
document.getElementById('filters').addEventListener('click', async () => {
  await fetch('/commit/filters/toggle', { method: 'POST' });
  ${stuck ? '' : "const p = document.getElementById('popup'); p.hidden = !p.hidden;"}
});
document.getElementById('add').addEventListener('click', () => fetch('/commit/add/task', { method: 'POST' }));
</script>
</body></html>`;

/**
 * A date field whose picker the entry opens (round 59, snipeit fwsi10
 * 03-create): a calendar table; clicking a day sets the field, posts
 * `/commit/day/<n>` and takes the calendar OUT of the document, as
 * bootstrap-datepicker detaches its picker; Next posts `/commit/next/go`.
 * `/picker` starts with no picker and the field already holding the date (a
 * replay whose picker closed after its fill); `/picker?open=1` with it open.
 */
/**
 * A form whose app pre-fills the next asset tag (round 62, snipeit fwsi13
 * 03-create): each load of `/prefilled-tag` pre-fills a NEW tag (BA-00100,
 * BA-00101, …). Save with the tag empty shows "This field is required" and
 * puts the focus back in the tag, with no request; otherwise it posts
 * `/commit/save/<tag>` and shows "Asset created".
 */
const PREFILLED_TAG = (tag: string) => `<!doctype html><html><head><meta charset="utf-8"><title>New asset</title></head><body>
<h1>New asset</h1>
<label for="tag">Asset Tag</label><input id="tag" value="${tag}">
<p id="err"></p>
<button id="save" type="button">Save</button>
<script>
const tag = document.getElementById('tag');
document.getElementById('save').addEventListener('click', async () => {
  const err = document.getElementById('err');
  if (!tag.value) { err.setAttribute('role', 'alert'); err.textContent = 'This field is required'; tag.focus(); return; }
  await fetch('/commit/save/' + encodeURIComponent(tag.value), { method: 'POST' });
  document.body.insertAdjacentHTML('beforeend', '<p role="status">Asset created</p>');
});
</script>
</body></html>`;

/**
 * A select2-like model picker (round 62, snipeit fwsi13 03-create): a
 * combobox "Select a Model"; typing into its search lists the matching option
 * only after a delay (the results request), highlighted; clicking the option
 * picks it — the combobox reads "×<name>" and posts `/commit/model/<name>`.
 * Clicking the combobox itself with the list open closes it and, like
 * select2's selectOnClose, picks whatever is highlighted AT THAT MOMENT —
 * nothing, when the results have not arrived yet.
 */
const SELECT_LATE = () => `<!doctype html><html><head><meta charset="utf-8"><title>Model</title></head><body>
<h1>New asset</h1>
<select id="sel" aria-hidden="true" style="width:5px;height:1px"><option value="">-</option></select><span role="combobox" aria-label="Select a Model" id="combo" tabindex="0">Select a Model</span>
<div id="drop" hidden><input type="search" id="q" aria-label=""><ul role="listbox" id="list"></ul></div>
<button id="save" type="button">Save</button>
<script>
const combo = document.getElementById('combo'), drop = document.getElementById('drop'), q = document.getElementById('q'), list = document.getElementById('list');
let highlighted = null, timer = null;
const pick = async (name) => { combo.textContent = '×' + name; combo.setAttribute('aria-label', '×' + name); drop.hidden = true; list.innerHTML = ''; highlighted = null; await fetch('/commit/model/' + encodeURIComponent(name), { method: 'POST' }); };
combo.addEventListener('click', () => {
  if (drop.hidden) { drop.hidden = false; q.focus(); return; }
  const h = highlighted; drop.hidden = true; list.innerHTML = ''; highlighted = null; clearTimeout(timer);
  if (h) pick(h);
});
q.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const name = 'Bench Laptops - Bench Manufacturer ' + q.value;
    list.innerHTML = '';
    const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = name; li.className = 'highlighted';
    li.addEventListener('click', () => pick(name));
    list.appendChild(li); highlighted = name;
  }, 200);
});
document.getElementById('save').addEventListener('click', () => fetch('/commit/save/asset', { method: 'POST' }));
</script>
</body></html>`;

const PICKER = (open: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Picker</title></head><body>
<h1>New asset</h1>
<label for="date">Purchase Date</label><input id="date" value="${open ? '' : '2026-03-15'}">
${open ? `<div id="cal"><table class="datepicker-days"><tbody>
<tr><th>March 2026</th></tr>
<tr><td>Select Month</td></tr>
<tr><td>Su</td><td>Mo</td></tr>
<tr><td class="day">15</td><td class="day">16</td></tr>
</tbody></table></div>` : ''}
<button id="next" type="button">Next</button>
<script>
document.querySelectorAll('td.day').forEach((td) => td.addEventListener('click', async () => {
  document.getElementById('date').value = '2026-03-' + td.textContent;
  document.getElementById('cal').remove();
  await fetch('/commit/day/' + td.textContent, { method: 'POST' });
}));
document.getElementById('next').addEventListener('click', () => fetch('/commit/next/go', { method: 'POST' }));
</script>
</body></html>`;

/**
 * A modal form (round 56): its Save posts `/commit/save/<title>` and closes
 * the form, recording nothing but the form going. The Save button stands
 * OUTSIDE the form container, so it resolves whether the form is open or
 * not. `/modal?open=1` starts with the form open; `/modal` with it shut.
 */
const MODAL = (open: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Modal</title></head><body>
<h1>Tasks</h1>
<div id="form" ${open ? '' : 'hidden'}><h2>Edit task</h2><input aria-label="Title"></div>
<button id="save" type="button">Save</button>
<script>
document.getElementById('save').addEventListener('click', async () => {
  const title = document.querySelector('#form input').value;
  await fetch('/commit/save/' + encodeURIComponent(title), { method: 'POST' });
  document.getElementById('form').hidden = true;
});
</script>
</body></html>`;

/**
 * A link the app IGNORES once (round 57, ghost fwgh12 after the publish
 * flow): the first press on "Published" does nothing; the next moves the
 * hash to `#/posts?type=published`, posts `/commit/list/published` and shows
 * the list's heading. `/ignored?dead=1` ignores every press.
 */
const IGNORED = (dead: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Posts</title></head><body>
<h1>Posts</h1>
<a id="published" href="#">Published</a>
<div id="list"></div>
<script>
let presses = 0;
document.getElementById('published').addEventListener('click', async (e) => {
  e.preventDefault();
  presses++;
  if (${dead ? 'true' : 'presses === 1'}) return;
  location.hash = '#/posts?type=published';
  await fetch('/commit/list/published', { method: 'POST' });
  document.getElementById('list').innerHTML = '<h2>Seed: Welcome to the bench</h2>';
});
</script>
</body></html>`;

const CONTROLS = `<!doctype html><html><head><meta charset="utf-8"><title>Controls</title></head><body>
<h1>Controls</h1>
<select id="code" aria-label="Code">
  <option value="a-1" selected>Alpha</option>
  <option value="b-2">Beta</option>
  <option value="c-3">Gamma</option>
</select>
<button id="save-code" type="button">Save code</button>
<input id="qty" type="number" aria-label="Quantity" value="1">
<button id="save-qty" type="button">Save quantity</button>
<input id="fruit" role="combobox" aria-label="Fruit" aria-expanded="false" autocomplete="off">
<div id="portal"></div>
<button id="save-fruit" type="button">Save fruit</button>
<script>
const commit = (kind, value) => fetch('/commit/' + kind + '/' + encodeURIComponent(value), { method: 'POST' });
let committedQty = '1';
const qty = document.getElementById('qty');
qty.addEventListener('change', () => { committedQty = qty.value; });
const fruit = document.getElementById('fruit');
const portal = document.getElementById('portal');
const FRUIT = ['apple', 'banana x2', 'cherry x3'];
fruit.addEventListener('input', () => {
  const q = fruit.value.toLowerCase();
  portal.innerHTML = '';
  const ul = document.createElement('ul');
  ul.setAttribute('role', 'listbox');
  for (const f of FRUIT.filter((f) => f.includes(q))) {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.textContent = f;
    li.addEventListener('click', () => { fruit.value = f; fruit.dataset.chosen = f; portal.innerHTML = ''; });
    ul.appendChild(li);
  }
  portal.appendChild(ul);
});
document.getElementById('save-code').addEventListener('click', () => commit('code', document.getElementById('code').value));
document.getElementById('save-qty').addEventListener('click', () => commit('qty', committedQty));
document.getElementById('save-fruit').addEventListener('click', () => commit('fruit', fruit.dataset.chosen || ''));
</script>
</body></html>`;

/**
 * The item list with a Tick per row and one page-level Note button. Tick
 * clears the confirmation area, posts `/tick/<id>`, and only on success shows
 * an "All good" button there — so a refused tick on the SECOND row leaves no
 * confirmation on the page, although the first row's tick had shown one. Note
 * posts `/note`. The shape of a loop body of more than one step whose first
 * step carries its own recorded effect.
 */
const TICK = `<!doctype html><html><head><meta charset="utf-8"><title>Tick</title></head><body>
<h1>Tick</h1>
<ul id="items"></ul>
<button id="note" type="button">Note</button>
<div id="done"></div>
<script>
fetch('/items').then((r) => r.json()).then((names) => {
  document.getElementById('items').innerHTML = names
    .map((n) => '<li class="item">' + n + ' <button class="tick" type="button" data-id="' + n + '">Tick</button></li>')
    .join('');
});
document.addEventListener('click', async (e) => {
  const tick = e.target.closest('.tick');
  if (tick) {
    const done = document.getElementById('done');
    done.innerHTML = '';
    const res = await fetch('/tick/' + encodeURIComponent(tick.dataset.id), { method: 'POST' });
    if (res.ok) done.innerHTML = '<button type="button">All good</button>';
    return;
  }
  if (e.target.closest('#note')) await fetch('/note', { method: 'POST' });
});
</script>
</body></html>`;

/**
 * Two Mark buttons far apart: one near the top of the page (`near`), one
 * 3000px down inside `#far` (`far`). A recorded point names the near one's
 * place; a structural fallback `#far > button:nth-of-type(1)` names the far
 * one. Which record the log shows is which element a runner took.
 */
const FAR = `<!doctype html><html><head><meta charset="utf-8"><title>Far</title></head><body>
<h1>Far</h1>
<button class="mark" id="near" type="button" data-id="near">Mark</button>
<div id="far" style="position:absolute;top:3000px;left:0"><button class="mark" type="button" data-id="far">Mark</button></div>
<script>
document.addEventListener('click', async (e) => {
  const mark = e.target.closest('.mark');
  if (mark) await fetch('/mark/' + encodeURIComponent(mark.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * A record page that cannot be FINGERPRINTED in time. With `?slow=1` the
 * page's own script wraps `document.querySelectorAll` so that the one query
 * the structural fingerprint walks (`body *`) takes three seconds — longer
 * than FINGERPRINT_CAPTURE_TIMEOUT_MS — while every other query (the snapshot
 * capture's `*`, Playwright's own injected script) is untouched. Without the
 * query string it is an ordinary record page. The query string is not part of
 * a url's shape, so both urls match the same pattern the same way.
 */
const STALL = (id: string, slow: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Stall</title></head><body>
<h1>Record ${id}</h1>
<button class="mark" type="button" data-id="${id}">Mark</button>
<script>
${slow ? `const qsa = Document.prototype.querySelectorAll;
document.querySelectorAll = function (sel) {
  if (sel === 'body *') { const end = Date.now() + 3000; while (Date.now() < end); }
  return qsa.call(this, sel);
};` : ''}
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * Everything the first snapshot dialect could not see (notes/ROBUSTNESS.md finding
 * 4), on one page: a `<label for>` input, a disabled button, a button in an
 * OPEN shadow root (with a status toast beside it), a same-origin iframe, a
 * frame from `cross` (another origin, when given), a `display:none` iframe,
 * and a grid that says it has 500 rows while rendering 20. `?pad=N` puts N
 * elements ahead of a trailing `Late` button, past the element cap;
 * `?many=N` renders N buttons, past the line cap.
 */
const OBSERVE = (q: URLSearchParams) => {
  const cross = q.get('cross');
  const pad = Number(q.get('pad') ?? 0);
  const many = Number(q.get('many') ?? 0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Observe</title></head><body>
<h1>Observe</h1>
<label for="email">Email</label><input id="email" type="text" value="a@b.test">
<label>Remember <input id="remember" type="checkbox" checked></label>
<button id="dis" type="button" disabled>Disabled save</button>
<div role="button" aria-disabled="true" aria-label="Soft disabled">x</div>
<x-panel id="panel"></x-panel>
<iframe id="same" src="/observe/frame/Frame%20button" style="width:200px;height:60px"></iframe>
${cross ? `<iframe id="cross" src="${cross}/observe/frame/Cross%20button" style="width:200px;height:60px"></iframe>` : ''}
<iframe id="hidden" src="/observe/frame/Hidden%20button" style="display:none"></iframe>
${q.get('grid') === '0' ? '' : `<div role="grid" aria-label="Orders" aria-rowcount="500">
${Array.from({ length: 20 }, (_, i) => `<div role="row"><span role="cell">Order ${i + 1}</span></div>`).join('\n')}
</div>`}
<div role="status">Saved</div>
${Array.from({ length: many }, (_, i) => `<button type="button">B${i}</button>`).join('')}
<div id="pad">${Array.from({ length: pad }, () => '<span></span>').join('')}</div>
<button type="button" id="late">Late</button>
<script>
const host = document.getElementById('panel');
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = '<button type="button">Shadow action</button><span id="lbl">Shadow field</span><input aria-labelledby="lbl"><div role="status">Shadow toast</div>';
</script>
</body></html>`;
};

const OBSERVE_FRAME = (label: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Frame</title></head><body>
<button type="button">${label}</button>
</body></html>`;

/**
 * An effect that lands INSIDE an iframe (notes/ROBUSTNESS.md finding 4): Open
 * payment puts a `Confirm payment` button into the same-origin payment frame
 * — in `ok` mode; in `broken` mode the click does nothing. Mark sits in the
 * page itself. A procedure recorded in dialect 2 expects the frame's button;
 * dialect 1 never saw frames at all. The Email input is named only by a
 * `<label for>`, which dialect 1 renders as `""`.
 */
const EMBED = (mode: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Embed</title></head><body>
<h1>Embed</h1>
<label for="email">Email</label><input id="email" type="text">
<button id="open" type="button">Open payment</button>
<iframe id="pay" src="/observe/frame/Card" style="width:300px;height:120px"></iframe>
<button class="mark" type="button" data-id="embed">Mark</button>
<script>
document.getElementById('open').addEventListener('click', () => {
  if (${JSON.stringify(mode)} !== 'ok') return;
  const doc = document.getElementById('pay').contentDocument;
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = 'Confirm payment';
  doc.body.appendChild(b);
});
document.querySelector('.mark').addEventListener('click', async (e) => {
  await fetch('/mark/' + encodeURIComponent(e.target.dataset.id), { method: 'POST' });
});
</script>
</body></html>`;

/**
 * Frame context (notes/ROBUSTNESS.md finding 5): `/frames` has a Save of its own
 * (POST /note) and a payment iframe, titled "Payment", whose document has an
 * IDENTICAL Save (POST /frame-save). A procedure recorded on the frame's Save
 * must press that one, never the page's. `/frames/renamed` is the same page
 * after the app retitled and moved the frame: nothing recorded names it any
 * more, and the right answer is to stop, not to press the page's Save.
 */
const FRAMES = (renamed: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Frames</title></head><body>
<h1>Checkout</h1>
<button type="button" id="save">Save</button>
<iframe ${renamed ? 'title="Checkout" src="/frames/moved"' : 'title="Payment" src="/frames/inner"'} style="width:300px;height:120px"></iframe>
<script>
document.getElementById('save').addEventListener('click', () => fetch('/note', { method: 'POST' }));
</script>
</body></html>`;

const FRAME_INNER = `<!doctype html><html><head><meta charset="utf-8"><title>Payment</title></head><body>
<button type="button" id="save">Save</button>
<script>
document.getElementById('save').addEventListener('click', () => fetch('/frame-save', { method: 'POST' }));
</script>
</body></html>`;

/**
 * Page context: `/opener` opens `/popup/child` in a new tab (target=_blank);
 * the child's Approve posts /approve and closes its own window, and the
 * procedure goes on to press After (POST /after) back on the opener.
 */
const OPENER = `<!doctype html><html><head><meta charset="utf-8"><title>Opener</title></head><body>
<h1>Orders</h1>
<a id="open" href="/popup/child" target="_blank">Open approval</a>
<button type="button" id="after">After</button>
<script>
document.getElementById('after').addEventListener('click', () => fetch('/after', { method: 'POST' }));
</script>
</body></html>`;

/**
 * The opener with a PLAIN link (round 57, snipe-it fwsi9 step 12): the
 * recording Ctrl+clicked it, and the tab that opened has no opener — no
 * `popup` event reaches the page, only the context's `page` event.
 */
const OPENER_PLAIN = `<!doctype html><html><head><meta charset="utf-8"><title>Opener</title></head><body>
<h1>Orders</h1>
<a id="open" href="/popup/child">Open approval</a>
</body></html>`;

/**
 * A project list and a project page (round 59, openproject fwop13 01-signin):
 * the project page carries the same link to itself (a breadcrumb), so a
 * second click on it from there goes nowhere. "Work packages" posts
 * `commit:wp:open`.
 */
const PROJ_LIST = `<!doctype html><html><head><meta charset="utf-8"><title>Projects</title></head><body>
<h1>Projects</h1>
<a id="bench" href="/proj/bench">Bench Project</a>
</body></html>`;
const PROJ_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Bench Project</title></head><body>
<nav><a href="/proj/bench">Bench Project</a></nav>
<h1>Overview</h1>
<button id="wp" type="button">Work packages</button>
<script>
document.getElementById('wp').addEventListener('click', () => fetch('/commit/wp/open', { method: 'POST' }));
</script>
</body></html>`;

/**
 * The fwop15 variant (round 61): the project page has NO link to itself, only
 * the project selector, a BUTTON of the same name (OpenProject's), so a
 * second click on the list's link from there finds nothing, and a heal that
 * picked the button would press a different control. Its "Work packages"
 * posts commit:wp:open; the selector posts commit:selector:open.
 */
const PROJ2_LIST = `<!doctype html><html><head><meta charset="utf-8"><title>Projects</title></head><body>
<h1>Projects</h1>
<a id="bench" href="/proj2/bench">Bench Project</a>
<span id="more" title="More">More</span><div id="menu" hidden><button type="button">Archive</button></div>
<script>
document.getElementById('more').addEventListener('mouseover', () => { document.getElementById('menu').hidden = false; });
</script>
</body></html>`;
const PROJ2_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Bench Project</title></head><body>
<button id="selector" type="button">Bench Project</button>
<h1>Overview</h1>
<button id="wp" type="button">Work packages</button>
<script>
document.getElementById('wp').addEventListener('click', () => fetch('/commit/wp/open', { method: 'POST' }));
document.getElementById('selector').addEventListener('click', () => fetch('/commit/selector/open', { method: 'POST' }));
</script>
</body></html>`;

const POPUP_CHILD = `<!doctype html><html><head><meta charset="utf-8"><title>Approval</title></head><body>
<h1>Approve order</h1>
<button type="button" id="approve">Approve</button>
<script>
document.getElementById('approve').addEventListener('click', () => {
  fetch('/approve', { method: 'POST' }).then(() => window.close());
});
</script>
</body></html>`;

/**
 * Waiting (notes/ROBUSTNESS.md finding 6). Each page's effect arrives through the
 * server, which logs it, so a test asserts what the APPLICATION saw:
 *  - `/debounce` (`?live=1`: with an event stream open from load): typing into Title saves 200ms after the last keystroke
 *    (POST /api/save/<value>, answered 300ms later), then shows "Saved: <value>".
 *  - `/live`: Refresh changes the page at once, posts /mark/live, and opens an
 *    event stream (/api/feed) that never closes.
 *  - `/notify`: Notify posts /api/notifications — an ordinary request on a path
 *    named like a stream — answered after 700ms, then shows a Dismiss button.
 *  - `/slowclick`: Start is covered by an overlay for 2.5s (forever with
 *    `?forever=1`); a click shows "started" and posts /api/slow, which is never
 *    answered.
 */
const DEBOUNCE = (live: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Debounce</title></head><body>
<h1>Draft</h1>
<input id="title" aria-label="Title">
<div id="saved"></div>
<script>
${live ? "fetch('/api/feed').then(async (res) => { const reader = res.body.getReader(); for (;;) { const { done } = await reader.read(); if (done) break; } });" : ''}
let timer;
document.getElementById('title').addEventListener('input', (e) => {
  clearTimeout(timer);
  const value = e.target.value;
  timer = setTimeout(async () => {
    await fetch('/api/save/' + encodeURIComponent(value), { method: 'POST' });
    document.getElementById('saved').innerHTML = '<h2>Saved: ' + value + '</h2>';
  }, 200);
});
</script>
</body></html>`;

const LIVE = `<!doctype html><html><head><meta charset="utf-8"><title>Live</title></head><body>
<h1>Live</h1>
<button id="refresh" type="button">Refresh</button>
<div id="out"></div>
<script>
document.getElementById('refresh').addEventListener('click', () => {
  document.getElementById('out').innerHTML = '<button type="button">Refreshed</button>';
  fetch('/mark/live', { method: 'POST' });
  fetch('/api/feed').then(async (res) => {
    const reader = res.body.getReader();
    for (;;) { const { done } = await reader.read(); if (done) break; }
  });
});
</script>
</body></html>`;

const NOTIFY = `<!doctype html><html><head><meta charset="utf-8"><title>Notify</title></head><body>
<h1>Inbox</h1>
<button id="notify" type="button">Notify</button>
<div id="out"></div>
<script>
document.getElementById('notify').addEventListener('click', async () => {
  await fetch('/api/notifications', { method: 'POST' });
  document.getElementById('out').innerHTML = '<button type="button">Dismiss notification</button>';
});
</script>
</body></html>`;

const SLOWCLICK = (forever: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Slow click</title></head><body>
<h1>Slow</h1>
<button id="start" type="button" style="position:absolute;top:100px;left:20px">Start</button>
<div id="cover" style="position:fixed;inset:0;background:rgba(0,0,0,0.1)"></div>
<div id="out"></div>
<script>
${forever ? '' : "setTimeout(() => document.getElementById('cover').remove(), 2500);"}
document.getElementById('start').addEventListener('click', () => {
  document.getElementById('out').innerHTML = '<button type="button">started</button>';
  fetch('/api/slow', { method: 'POST' });
});
</script>
</body></html>`;

export interface FixtureServer {
  server: http.Server;
  origin: string;
  /** Current mutation log, in commit order. Only the server appends to it. */
  readonly log: string[];
  /** Current item collection. */
  readonly items: string[];
  /** The ticket list's created date (/tickets); reset() restores the recording's, 2026-09-23. */
  listing: { date: string };
  /** The kanboard fixture's newest card id (/kanboard); reset() restores 4. */
  board: { card: number };
  /** The EspoCRM fixture's stage (/espo); reset() restores "Negotiation". */
  espo: { stage: string };
  /** The sign-in fixture's document title (/signin); reset() restores "EspoCRM". */
  signin: { title: string };
  /** The Gitea issue fixture's labels (/gitea-issue); reset() restores the recording's, bug and priority-high. */
  issue: { labels: string[] };
  /** Reset state for a new test/case: `n` fresh items, empty log, faults cleared. */
  reset(n: number): void;
  faults: {
    /** Hold the response for `ms` before doing anything else. */
    delay(ms: number, opts?: { times?: number } & FaultMatch): void;
    /**
     * Apply a write (mutation log + state) as normal, then drop the
     * connection without ever sending a response — the client can't tell
     * whether the write landed.
     */
    disconnectOnWrite(opts?: { times?: number } & FaultMatch): void;
    /** Refuse a write with `status` and do NOT apply it — not logged, not mutated. */
    rejectWrite(status: number, opts?: { times?: number } & FaultMatch): void;
    /** Serve a snapshot of current state instead of live state on the next GET /items. */
    staleUI(opts?: { times?: number }): void;
    /** Disarm every pending fault. */
    clear(): void;
  };
  close(): Promise<void>;
}

export async function createFixtureServer(initialCount = 10): Promise<FixtureServer> {
  let items: string[] = Array.from({ length: initialCount }, (_, i) => `Item ${i + 1}`);
  let log: string[] = [];
  const pending: Fault[] = [];
  const listing = { date: '2026-09-23' };
  const board = { card: 4 };
  const espo = { stage: 'Negotiation' };
  const signin = { title: 'EspoCRM' };
  const issue = { labels: ['bug', 'priority-high'] };
  const assetTag = { next: 100 };

  function take<K extends Fault['kind']>(kind: K, req?: http.IncomingMessage): Extract<Fault, { kind: K }> | undefined {
    for (const f of pending) {
      if (f.kind !== kind) continue;
      if (f.kind !== 'stale' && (!req || !requestMatches(req, f.match))) continue;
      return f as Extract<Fault, { kind: K }>;
    }
    return undefined;
  }
  function consume(f: Fault): void {
    f.remaining -= 1;
    if (f.remaining <= 0) {
      const i = pending.indexOf(f);
      if (i >= 0) pending.splice(i, 1);
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';

    const delay = take('delay', req);
    if (delay) {
      consume(delay);
      await new Promise<void>((r) => setTimeout(r, delay.ms));
    }

    if (url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
      return;
    }
    if (url === '/echo-lab' || url.startsWith('/echo-lab?')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(ECHO_LAB);
      return;
    }
    if (url === '/espo-form') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(ESPO_FORM);
      return;
    }
    if (url === '/signin') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(SIGNIN(signin.title));
      return;
    }
    if (url === '/espo') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(ESPO_DETAIL(espo.stage));
      return;
    }
    if (url === '/kanboard' || url.startsWith('/kanboard?')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(KANBOARD(board.card));
      return;
    }
    if (url === '/issue-list' || url === '/asset-table') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(url === '/issue-list' ? ISSUE_LIST : ASSET_TABLE);
      return;
    }
    if (url === '/gitea-issue') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(GITEA_ISSUE(issue.labels));
      return;
    }
    if (url === '/tickets') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(TICKETS(items.length, listing.date));
      return;
    }
    if (url.startsWith('/record/')) {
      const id = decodeURIComponent(url.slice('/record/'.length));
      log.push(`visit:${id}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(RECORD(id));
      return;
    }
    if (url.startsWith('/booting/')) {
      // The page normalises its own url to `?ready=1`, so the id is the path
      // part alone; the visit reads the same as the record page's.
      const id = decodeURIComponent(url.slice('/booting/'.length).split('?')[0]);
      log.push(`visit:${id}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(BOOTING(id));
      return;
    }
    if (url.startsWith('/silent/')) {
      // As /booting: the page rewrites its own url, so the id is the path part
      // alone and the visit reads the same as the record page's.
      const id = decodeURIComponent(url.slice('/silent/'.length).split('?')[0]);
      log.push(`visit:${id}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(SILENT(id));
      return;
    }
    if (url.startsWith('/project/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PROJECT(url.slice('/project/'.length)));
      return;
    }
    if (url.startsWith('/save/') && req.method === 'POST') {
      log.push(`save:${decodeURIComponent(url.slice('/save/'.length))}`);
      res.writeHead(200);
      res.end('ok');
      return;
    }
    if (url === '/discard/confirm' && req.method === 'POST') {
      log.push('discard:confirmed');
      res.writeHead(200);
      res.end('ok');
      return;
    }
    if (url.startsWith('/discard/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(DISCARD(url.slice('/discard/'.length)));
      return;
    }
    if (url.startsWith('/away/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(AWAY(url.slice('/away/'.length)));
      return;
    }
    if (url === '/views' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(VIEWS);
      return;
    }
    if (url === '/gone' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(GONE);
      return;
    }
    if (url === '/ambient' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(AMBIENT);
      return;
    }
    if (url.startsWith('/gate/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(GATE(url.slice('/gate/'.length)));
      return;
    }
    if (url.startsWith('/checkout/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(CHECKOUT(decodeURIComponent(url.slice('/checkout/'.length))));
      return;
    }
    if (url.startsWith('/checkout-q/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(CHECKOUT(decodeURIComponent(url.slice('/checkout-q/'.length)), true));
      return;
    }
    if (url.startsWith('/outcome?') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(OUTCOME(new URLSearchParams(url.slice('/outcome?'.length)).get('result') ?? ''));
      return;
    }
    if (url.startsWith('/outcome/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(OUTCOME(decodeURIComponent(url.slice('/outcome/'.length))));
      return;
    }
    if (url.startsWith('/nav/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(NAV(url.slice('/nav/'.length)));
      return;
    }
    if (url.startsWith('/held/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(HELD(url.slice('/held/'.length)));
      return;
    }
    if (url === '/rows' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(ROWS);
      return;
    }
    if (url === '/editor' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(EDITOR);
      return;
    }
    if (url === '/amount' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(AMOUNT);
      return;
    }
    if (url.startsWith('/reload-login/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(RELOAD_LOGIN(url.slice('/reload-login/'.length)));
      return;
    }
    if (url === '/signed-in' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><meta charset="utf-8"><title>Home</title></head><body><h1>Signed in</h1></body></html>');
      return;
    }
    if (url.startsWith('/disclosure/') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(DISCLOSURE(url.slice('/disclosure/'.length)));
      return;
    }
    if (url === '/totp-login' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(TOTP_LOGIN);
      return;
    }
    if (url.startsWith('/totp/verify/') && req.method === 'POST') {
      // Checked here, against the fixture's own RFC 6238 (node:crypto), never
      // the runners' code: the current window or the one before it.
      const code = decodeURIComponent(url.slice('/totp/verify/'.length));
      const step = Math.floor(Date.now() / 30_000);
      const ok = code === fixtureTotp(step) || code === fixtureTotp(step - 1);
      log.push(ok ? 'totp:ok' : 'totp:rejected');
      res.writeHead(ok ? 200 : 403);
      res.end(ok ? 'ok' : 'rejected');
      return;
    }
    if (url === '/relogin' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(RELOGIN);
      return;
    }
    if (url.startsWith('/commit/') && req.method === 'POST') {
      const [kind, value] = url.slice('/commit/'.length).split('/');
      log.push(`commit:${kind}:${decodeURIComponent(value ?? '')}`);
      res.writeHead(200);
      res.end('ok');
      return;
    }
    const html = (body: string) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(body);
    };
    // A logged write that honours an armed rejectWrite: refused, nothing is logged.
    const write = (entry: string) => {
      const reject = take('reject', req);
      if (reject) {
        consume(reject);
        res.writeHead(reject.status);
        res.end('rejected');
        return;
      }
      log.push(entry);
      res.writeHead(200);
      res.end('ok');
    };
    const tail = (prefix: string) => decodeURIComponent(url.slice(prefix.length));
    if (req.method === 'GET') {
      if (url === '/debounce' || url === '/debounce?live=1') return html(DEBOUNCE(url.endsWith('live=1')));
      if (url === '/live') return html(LIVE);
      if (url === '/notify') return html(NOTIFY);
      if (url === '/slowclick' || url === '/slowclick?forever=1') return html(SLOWCLICK(url.endsWith('forever=1')));
      if (url === '/api/feed') {
        log.push('feed:open');
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write('data: hello\n\n');
        const tick = setInterval(() => res.write('data: tick\n\n'), 200);
        res.on('close', () => clearInterval(tick));
        return;
      }
      if (url === '/stamp') return html(STAMP);
      if (url === '/hash') return html(HASH);
      if (url.startsWith('/menu/')) return html(MENU(tail('/menu/')));
      if (url === '/kbd-picker' || url.startsWith('/kbd-picker?')) return html(KBD_PICKER(url.includes('shifted=1')));
      if (url === '/labels-picker' || url.startsWith('/labels-picker?')) return html(LABEL_PICKER({ escape: !url.includes('escape=0'), stuck: url.includes('stuck=1'), furniture: url.includes('furniture=1') }));
      if (url === '/create/form') return html(CREATE);
      if (url === '/hopper') return html(HOPPER);
      if (url.startsWith('/hop/')) {
        log.push(`hop:${tail('/hop/')}`);
        return html(HOP(tail('/hop/')));
      }
      if (url === '/controls') return html(CONTROLS);
      if (url === '/ignored' || url === '/ignored?dead=1') return html(IGNORED(url.endsWith('dead=1')));
      if (url === '/modal' || url === '/modal?open=1') return html(MODAL(url.endsWith('open=1')));
      if (url === '/filters' || url.startsWith('/filters?')) return html(FILTERS(url.includes('open=1'), url.includes('stuck=1')));
      if (url === '/picker' || url.startsWith('/picker?')) return html(PICKER(url.includes('open=1')));
      if (url === '/select-late' || url.startsWith('/select-late?')) return html(SELECT_LATE());
      if (url === '/prefilled-tag') return html(PREFILLED_TAG(`BA-00${assetTag.next++}`));
      if (url === '/price' || url === '/price?stuck=1') return html(PRICE(url.endsWith('stuck=1')));
      if (url === '/imagelink') return html(IMAGE_LINK);
      if (url === '/hashposts') return html(HASH_POSTS);
      if (url.startsWith('/row-save/')) return html(ROW_SAVE(tail('/row-save/')));
      if (url === '/typed-amount' || url === '/typed-amount?sticky=1') return html(TYPED_AMOUNT(url.endsWith('sticky=1')));
      if (url === '/code-editor') return html(CODE_EDITOR);
      if (url.startsWith('/edit-mode/')) return html(EDIT_MODE(tail('/edit-mode/')));
      if (url === '/hover-menu') return html(HOVER_MENU);
      if (url === '/counts' || url === '/counts?nolist=1') return html(COUNTS(!url.endsWith('nolist=1')));
      if (url === '/transform') return html(TRANSFORM);
      if (url === '/board') return html(BOARD);
      if (url === '/parts') return html(PARTS);
      if (url === '/tick') return html(TICK);
      if (url === '/far') return html(FAR);
      if (url.startsWith('/observe/frame/')) return html(OBSERVE_FRAME(tail('/observe/frame/')));
      // A frame document that renders a button and then never answers again.
      if (url === '/observe/stuck') return html('<!doctype html><button>Stuck</button><script>setTimeout(() => { for (;;) {} }, 100)</script>');
      if (url === '/observe' || url.startsWith('/observe?')) return html(OBSERVE(new URLSearchParams(url.split('?')[1] ?? '')));
      if (url.startsWith('/embed/')) return html(EMBED(tail('/embed/')));
      if (url === '/frames') return html(FRAMES(false));
      // Also at `/frames?renamed=1`, the SAME page as far as a recorded
      // `/frames` pattern is concerned, so a replay reaches the frame lookup.
      if (url === '/frames/renamed' || url === '/frames?renamed=1') return html(FRAMES(true));
      if (url === '/frames/inner' || url === '/frames/moved') return html(FRAME_INNER);
      if (url === '/opener') return html(OPENER);
      if (url === '/proj-list') return html(PROJ_LIST);
      if (url === '/proj/bench') return html(PROJ_PAGE);
      if (url === '/proj2-list') return html(PROJ2_LIST);
      if (url === '/proj2/bench') return html(PROJ2_PAGE);
      if (url === '/opener-plain') return html(OPENER_PLAIN);
      if (url === '/popup/child') return html(POPUP_CHILD);
      if (url.startsWith('/stall/')) {
        const [pathPart, query = ''] = url.slice('/stall/'.length).split('?');
        return html(STALL(decodeURIComponent(pathPart), /(^|&)slow=1(&|$)/.test(query)));
      }
    }
    if (req.method === 'POST') {
      if (url.startsWith('/api/save/')) {
        log.push(`save:${tail('/api/save/')}`);
        setTimeout(() => res.writeHead(200).end('ok'), 300);
        return;
      }
      if (url === '/api/notifications') {
        log.push('notify');
        setTimeout(() => res.writeHead(200).end('ok'), 700);
        return;
      }
      // Never answered: the request stays open until the page or the server goes.
      if (url === '/api/slow') {
        log.push('slow:start');
        return;
      }
      if (url.startsWith('/stamp/')) return write(`stamp:${tail('/stamp/')}`);
      if (url.startsWith('/toggle/')) return write(`toggle:${tail('/toggle/')}`);
      if (url.startsWith('/archive/')) return write(`archive:${tail('/archive/')}`);
      if (url.startsWith('/create/')) return write(`create:${tail('/create/')}`);
      if (url.startsWith('/tick/')) return write(`tick:${tail('/tick/')}`);
      if (url === '/note') return write('note');
      if (url === '/frame-save') return write('frame-save');
      if (url === '/approve') return write('approve');
      if (url === '/after') return write('after');
    }
    if (url === '/items') {
      const stale = take('stale');
      if (stale) {
        consume(stale);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(stale.snapshot));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(items));
      return;
    }
    if (url.startsWith('/mark/') && req.method === 'POST') {
      const id = decodeURIComponent(url.slice('/mark/'.length));
      const reject = take('reject', req);
      if (reject) {
        consume(reject);
        res.writeHead(reject.status);
        res.end('rejected');
        return;
      }
      log.push(`mark:${id}`);
      const disconnect = take('disconnect', req);
      if (disconnect) {
        consume(disconnect);
        req.socket.destroy();
        return;
      }
      res.writeHead(200);
      res.end('ok');
      return;
    }
    if (url.startsWith('/delete/') && req.method === 'POST') {
      const id = decodeURIComponent(url.slice('/delete/'.length));
      const reject = take('reject', req);
      if (reject) {
        consume(reject);
        res.writeHead(reject.status);
        res.end('rejected');
        return;
      }
      log.push(`delete:${id}`);
      items = items.filter((n) => n !== id);
      const disconnect = take('disconnect', req);
      if (disconnect) {
        consume(disconnect);
        req.socket.destroy();
        return;
      }
      res.writeHead(200);
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  return {
    server,
    origin,
    get log() { return log; },
    get items() { return items; },
    listing,
    board,
    espo,
    signin,
    issue,
    reset(n: number) {
      items = Array.from({ length: n }, (_, i) => `Item ${i + 1}`);
      log = [];
      pending.length = 0;
      listing.date = '2026-09-23';
      board.card = 4;
      espo.stage = 'Negotiation';
      signin.title = 'EspoCRM';
      issue.labels = ['bug', 'priority-high'];
    },
    faults: {
      delay(ms, opts = {}) {
        pending.push({ kind: 'delay', ms, remaining: opts.times ?? 1, match: { method: opts.method, pathPrefix: opts.pathPrefix } });
      },
      disconnectOnWrite(opts = {}) {
        pending.push({ kind: 'disconnect', remaining: opts.times ?? 1, match: { method: opts.method, pathPrefix: opts.pathPrefix } });
      },
      rejectWrite(status, opts = {}) {
        pending.push({ kind: 'reject', status, remaining: opts.times ?? 1, match: { method: opts.method, pathPrefix: opts.pathPrefix } });
      },
      staleUI(opts = {}) {
        pending.push({ kind: 'stale', remaining: opts.times ?? 1, snapshot: [...items] });
      },
      clear() {
        pending.length = 0;
      },
    },
    async close() {
      // An event stream or an unanswered request never closes on its own.
      const closing = new Promise<void>((r) => server.close(() => r()));
      server.closeAllConnections();
      await closing;
    },
  };
}
