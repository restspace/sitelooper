/**
 * Shared HTTP fixture server: a tiny "Items" list app with a Remove/Mark
 * affordance per row, backed by a mutation log that only the server can
 * write. execution-parity.test.ts uses this as the differential-harness
 * oracle (see CORRECTNESS_PLAN.md §9.1: "both runners said ok" must never
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
 * never happened (ROBUSTNESS.md, finding 2). `/gate/late` starts disabled and
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
 * (ROBUSTNESS.md, finding 3). `/checkout-q/<result>` is the same flow with
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
 * submitting (the reload landing between the click and its answer). Once per
 * tab each (sessionStorage). Sign in posts what the fields hold at the click
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
  user.addEventListener('input', armed);
  pass.addEventListener('input', armed);
  document.getElementById('login').addEventListener('click', async () => {
    if (MODE === 'submit' && once('reloaded-submit')) { location.reload(); return; }
    if (!user.value || !pass.value) { document.getElementById('status').textContent = 'Username and password are required'; return; }
    await fetch('/commit/login/' + encodeURIComponent(user.value + ':' + pass.value), { method: 'POST' });
    location.href = '/signed-in';
  });
};
// The reloaded document is an app starting up again: it builds its form late,
// so a look taken soon after the reload finds no field at all.
if (sessionStorage.getItem('reloaded-fill')) setTimeout(build, 800);
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
 * Everything the first snapshot dialect could not see (ROBUSTNESS.md finding
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
 * An effect that lands INSIDE an iframe (ROBUSTNESS.md finding 4): Open
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
 * Frame context (ROBUSTNESS.md finding 5): `/frames` has a Save of its own
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
 * Waiting (ROBUSTNESS.md finding 6). Each page's effect arrives through the
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
      if (url === '/create/form') return html(CREATE);
      if (url === '/hopper') return html(HOPPER);
      if (url.startsWith('/hop/')) {
        log.push(`hop:${tail('/hop/')}`);
        return html(HOP(tail('/hop/')));
      }
      if (url === '/controls') return html(CONTROLS);
      if (url === '/imagelink') return html(IMAGE_LINK);
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
    reset(n: number) {
      items = Array.from({ length: n }, (_, i) => `Item ${i + 1}`);
      log = [];
      pending.length = 0;
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
