// A tiny stateful app for tests that run a compiled spec in a child process
// (readiness spawns Playwright synchronously, so the app cannot live in the
// test's own event loop). Prints `listening <port>` once it is up.
//
//   GET  /         the ticket list, a create form and an "Archive all" button
//   POST /tickets  create a ticket (form field `title`), then back to /
//   POST /archive  archive every ticket, then back to /
//   GET  /state    { tickets: string[], archived: boolean, archiveCalls: number }
//   POST /reset    empty the app
import http from 'node:http';

let tickets = [];
let archived = false;
let archiveCalls = 0;

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = () => `<!doctype html><html><head><title>Tickets</title></head><body><main>
<h1>Tickets</h1>
<form method="post" action="/tickets"><label>Title <input name="title"></label><button>Save</button></form>
<form method="post" action="/archive"><button>Archive all</button></form>
<ul>${tickets.map((t, i) => `<li><a href="/tickets/${i + 1}">${escape(t)}</a></li>`).join('')}</ul>
</main></body></html>`;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/tickets') {
      tickets.push(new URLSearchParams(body).get('title') ?? '');
      res.writeHead(303, { location: '/' }).end();
    } else if (req.method === 'POST' && req.url === '/archive') {
      archived = true;
      archiveCalls++;
      res.writeHead(303, { location: '/' }).end();
    } else if (req.method === 'POST' && req.url === '/reset') {
      tickets = [];
      archived = false;
      archiveCalls = 0;
      res.writeHead(204).end();
    } else if (req.url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ tickets, archived, archiveCalls }));
    } else {
      res.writeHead(200, { 'content-type': 'text/html' }).end(page());
    }
  });
});
server.listen(0, '127.0.0.1', () => console.log(`listening ${server.address().port}`));
