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
  if (mark) await fetch('/mark/' + encodeURIComponent(mark.dataset.id), { method: 'POST' });
});
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
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
