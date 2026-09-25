/**
 * A small app for the recorder-journal browser tests: one page per attribution
 * rule, served over HTTP (the journal listens to real requests).
 *
 *  /                  a form: Save POSTs the title and answers a minted id;
 *                     Nothing does nothing; Slow asks a 2.5 s endpoint
 *  /?poll=1           the same, polling /api/poll every 150 ms, with a ticking clock
 *  /search            a search box that fetches (and pushes the url) 400 ms after typing stops
 *  /picker            a listbox that opens on click, ticks options with a CSS class on
 *                     a check icon, and commits (POST) when it closes on blur
 *  /flash             a heading that flashes "Saved!" from an autosave timer 600 ms
 *                     after load, and a Save button that flashes it on click
 *  /overlay           a button covered by a transparent overlay
 *  /popup             a link that opens a tab late (setTimeout 700 ms, noopener)
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const FORM = (poll: boolean) => `<!doctype html><html><head><title>Journal form</title></head><body>
<h1 id="clock">00:00:00</h1>
<label for="title">Title</label><input id="title">
<button id="save" type="button">Save</button>
<button id="noop" type="button">Nothing</button>
<button id="slow" type="button">Slow</button>
<p role="status" id="status"></p>
<script>
document.getElementById('save').onclick = async () => {
  const r = await fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: document.getElementById('title').value }) });
  const j = await r.json();
  document.getElementById('status').textContent = 'Saved ' + j.id;
};
document.getElementById('slow').onclick = () => fetch('/api/slow').then(() => { document.getElementById('status').textContent = 'Slow done'; });
${poll ? "setInterval(() => fetch('/api/poll'), 150); setInterval(() => { document.getElementById('clock').textContent = new Date().toISOString().slice(11, 19) + '.' + Date.now() % 1000; }, 100);" : ''}
</script></body></html>`;

const SEARCH = `<!doctype html><html><head><title>Search</title></head><body>
<input id="q" aria-label="Search"><ul id="results"></ul>
<script>
let t; document.getElementById('q').addEventListener('input', (e) => {
  clearTimeout(t);
  t = setTimeout(async () => {
    history.replaceState(null, '', '/search?q=' + encodeURIComponent(e.target.value));
    const r = await fetch('/api/search?q=' + encodeURIComponent(e.target.value));
    document.getElementById('results').innerHTML = (await r.json()).map((x) => '<li>' + x + '</li>').join('');
  }, 400);
});
</script></body></html>`;

const PICKER = `<!doctype html><html><head><title>Picker</title>
<style>.menu{display:none;border:1px solid #999;padding:4px}.menu.visible{display:block}.check.invisible{visibility:hidden}</style></head><body>
<div id="labels"><button id="open" type="button" aria-haspopup="listbox">Labels</button>
<div class="menu" role="listbox" aria-label="Labels" tabindex="-1" id="menu">
  <a class="item" role="option" href="#" data-id="1"><span class="check invisible">✓</span>bug</a>
  <a class="item" role="option" href="#" data-id="2"><span class="check invisible">✓</span>docs</a>
  <a class="item" role="option" href="#" data-id="3"><span class="check invisible">✓</span>priority-high</a>
</div></div>
<p id="applied">No labels</p><button id="elsewhere" type="button">Elsewhere</button>
<script>
const menu = document.getElementById('menu');
document.getElementById('open').onclick = () => { menu.classList.add('visible'); menu.focus(); };
for (const a of menu.querySelectorAll('.item')) a.onclick = (e) => { e.preventDefault(); a.querySelector('.check').classList.toggle('invisible'); menu.focus(); };
menu.addEventListener('focusout', () => setTimeout(async () => {
  if (menu.contains(document.activeElement)) return;
  if (!menu.classList.contains('visible')) return;
  menu.classList.remove('visible');
  const ids = [...menu.querySelectorAll('.item')].filter((a) => !a.querySelector('.check').classList.contains('invisible')).map((a) => a.dataset.id);
  await fetch('/api/labels', { method: 'POST', body: ids.join(',') });
  document.getElementById('applied').textContent = ids.length ? ids.join(',') : 'No labels';
}, 50));
</script></body></html>`;

const FLASH = `<!doctype html><html><head><title>Flash</title></head><body>
<h2 id="h">Description</h2><button id="save" type="button">Save</button><p id="desc" contenteditable="true">Enter a description</p>
<script>
const flash = () => { document.getElementById('h').textContent = 'Description Saved!'; setTimeout(() => { document.getElementById('h').textContent = 'Description'; }, 300); };
setTimeout(async () => { await fetch('/api/autosave', { method: 'POST', body: 'x' }); flash(); }, 600);
document.getElementById('save').onclick = async () => { await fetch('/api/describe', { method: 'POST', body: document.getElementById('desc').textContent }); flash(); };
</script></body></html>`;

const OVERLAY = `<!doctype html><html><head><title>Overlay</title>
<style>#cover{position:fixed;inset:0;background:rgba(0,0,0,0.01);z-index:10}</style></head><body>
<button id="under" type="button" onclick="document.body.dataset.hit='under'">Under</button>
<div id="cover" role="presentation" aria-label="Cover" onclick="this.remove()"></div>
</body></html>`;

const MULTIPART = `<!doctype html><html><head><meta charset="utf-8"><title>Multipart</title></head><body>
<form id="native" method="post" action="/api/native" enctype="multipart/form-data"><label for="t1">Native title</label><input id="t1" name="title"><button id="submit-native">Create</button></form>
<label for="t2">Fetch title</label><input id="t2"><button id="submit-fetch" type="button">Create by fetch</button><button id="submit-blob" type="button">Create with a file</button>
<script>document.getElementById('submit-fetch').onclick = async () => { const fd = new FormData(); fd.append('title', document.getElementById('t2').value); fd.append('_csrf', 'x'.repeat(40)); await fetch('/api/multipart', { method: 'POST', body: fd }); };
document.getElementById('submit-blob').onclick = async () => { const fd = new FormData(); fd.append('title', document.getElementById('t2').value); fd.append('files', new Blob(['%PDF-1.4 binary \u0000 bytes'], { type: 'application/octet-stream' }), 'a.bin'); await fetch('/api/withfile', { method: 'POST', body: fd }); };</script>
</body></html>`;

const POPUP = `<!doctype html><html><head><title>Popup</title></head><body>
<a id="later" href="#" onclick="event.preventDefault(); setTimeout(() => window.open('/search', '_blank', 'noopener'), 700)">Open later</a>
</body></html>`;

export async function startJournalApp(): Promise<{ url: string; close: () => Promise<void> }> {
  let n = 4710;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const send = (type: string, body: string, delay = 0) =>
      setTimeout(() => {
        res.writeHead(200, { 'content-type': type });
        res.end(body);
      }, delay);
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (u.pathname === '/') return send('text/html; charset=utf-8', FORM(u.searchParams.get('poll') === '1'));
      if (u.pathname === '/search') return send('text/html', SEARCH);
      if (u.pathname === '/picker') return send('text/html; charset=utf-8', PICKER);
      if (u.pathname === '/flash') return send('text/html', FLASH);
      if (u.pathname === '/overlay') return send('text/html', OVERLAY);
      if (u.pathname === '/popup') return send('text/html', POPUP);
      if (u.pathname === '/multipart') return send('text/html; charset=utf-8', MULTIPART);
      if (u.pathname === '/api/native') return send('text/html; charset=utf-8', '<!doctype html><title>Created</title><h1>Created</h1>');
      if (u.pathname === '/api/save') return send('application/json', JSON.stringify({ id: `rec-${++n}`, ok: true }));
      if (u.pathname === '/api/slow') return send('application/json', '{"ok":true}', 2_500);
      if (u.pathname === '/api/search') return send('application/json', JSON.stringify([`${u.searchParams.get('q')} one`, `${u.searchParams.get('q')} two`]));
      if (u.pathname.startsWith('/api/')) return send('application/json', '{"ok":true}');
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}
