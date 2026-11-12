// A stateful order page for the declared fix-up end-to-end test
// (test/fixup-e2e.browser.test.ts). It runs in its own process because the
// compiled-spec arm spawns Playwright synchronously.
//
//   GET  /          the order: one row per line item, each with a checkbox; Delete, Submit
//   POST /delete    { rows: number[] }  removes those rows (1-based positions)
//   POST /submit    marks the order submitted
//   POST /reset?dup=1|0   two Widget rows and a Gadget, or one of each
//   GET  /state     { rows, deleted, submitted }
import http from 'node:http';

let rows = [];
let deleted = [];
let submitted = false;
const reset = (dup) => {
  rows = dup ? ['Widget', 'Widget', 'Gadget'] : ['Widget', 'Gadget'];
  deleted = [];
  submitted = false;
};
reset(true);

const page = () => `<!doctype html><html><head><title>Order</title></head><body>
<main><h1>Sales order SO-0042</h1>
<table id="items"><tbody>
${rows.map((name, i) => `<tr><td><input type="checkbox" id="row${i + 1}" aria-label="Select row ${i + 1}"></td><td><a href="#${name}">${name}</a></td></tr>`).join('\n')}
</tbody></table>
<button type="button" id="delete">Delete</button>
<button type="button" id="submit">Submit</button>
<p id="status">${submitted ? 'Submitted' : 'Draft'}</p>
</main><script>
document.getElementById('delete').addEventListener('click', async () => {
  const picked = [...document.querySelectorAll('#items input:checked')];
  const positions = picked.map((box) => Number(box.id.slice(3)));
  await fetch('/delete', { method: 'POST', body: JSON.stringify({ rows: positions }) });
  for (const box of picked) box.closest('tr').remove();
});
document.getElementById('submit').addEventListener('click', async () => {
  await fetch('/submit', { method: 'POST' });
  document.getElementById('status').textContent = 'Submitted';
});
</script></body></html>`;

const body = (req) =>
  new Promise((resolve) => {
    let text = '';
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => resolve(text));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (value) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  if (req.method === 'POST' && url.pathname === '/reset') {
    reset(url.searchParams.get('dup') !== '0');
    return json({ ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/delete') {
    const asked = JSON.parse((await body(req)) || '{}').rows ?? [];
    for (const position of [...asked].sort((a, b) => b - a)) {
      if (position >= 1 && position <= rows.length) deleted.push(...rows.splice(position - 1, 1));
    }
    return json({ ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/submit') {
    submitted = true;
    return json({ ok: true });
  }
  if (url.pathname === '/state') return json({ rows, deleted, submitted });
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(page());
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(0, '127.0.0.1', () => console.log(`listening ${server.address().port}`));
