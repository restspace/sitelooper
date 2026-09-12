/**
 * Proves the FIXTURE's fault injection actually does what it claims, per
 * CORRECTNESS_PLAN.md §9.1 ("the local fixture server should expose ... a
 * verifier-only mutation log and controllable faults"). This file tests the
 * fixture server itself — not sitelooper's behaviour under these faults,
 * which is separate work.
 *
 * Opt-in like the other browser suites: BP_BROWSER_TESTS=1
 *   npx vitest run test/fixture/faults.browser.test.ts
 */
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixtureServer, type FixtureServer } from './server.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

function get(origin: string, path: string): Promise<{ status: number; body: string; ms: number }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    http.get(origin + path, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, ms: Date.now() - started }));
    }).on('error', reject);
  });
}

function post(origin: string, path: string): Promise<{ status: number | null; body: string; error: Error | null }> {
  return new Promise((resolve) => {
    const req = http.request(origin + path, { method: 'POST' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, error: null }));
    });
    req.on('error', (err) => resolve({ status: null, body: '', error: err }));
    req.end();
  });
}

d('fixture server fault injection', () => {
  let fx: FixtureServer;

  beforeEach(async () => {
    fx = await createFixtureServer(5);
  });

  afterEach(async () => {
    await fx.close();
  });

  it('with nothing armed, behaves exactly as the plain fixture always has', async () => {
    const page = await get(fx.origin, '/');
    expect(page.status).toBe(200);
    expect(page.body).toContain('<h1>Items</h1>');

    const items = await get(fx.origin, '/items');
    expect(JSON.parse(items.body)).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']);

    const del = await post(fx.origin, '/delete/' + encodeURIComponent('Item 1'));
    expect(del.status).toBe(200);
    expect(del.body).toBe('ok');
    expect(fx.log).toEqual(['delete:Item 1']);
    expect(fx.items).toEqual(['Item 2', 'Item 3', 'Item 4', 'Item 5']);
  });

  it('delayed response: the hold is actually observed on the wire, once, then reverts', async () => {
    fx.faults.delay(300, { pathPrefix: '/items' });
    const slow = await get(fx.origin, '/items');
    expect(slow.status).toBe(200);
    expect(slow.ms).toBeGreaterThanOrEqual(280);

    // bounded: the next call is not delayed
    const fast = await get(fx.origin, '/items');
    expect(fast.ms).toBeLessThan(280);
  });

  it('committed-but-disconnected: the write IS in the mutation log despite no response ever arriving', async () => {
    fx.faults.disconnectOnWrite({ pathPrefix: '/delete/' });
    const res = await post(fx.origin, '/delete/' + encodeURIComponent('Item 3'));
    // the client gets nothing to hang a verdict on
    expect(res.status).toBeNull();
    expect(res.error).not.toBeNull();
    // but the server-side oracle shows the write actually landed
    expect(fx.log).toEqual(['delete:Item 3']);
    expect(fx.items).toEqual(['Item 1', 'Item 2', 'Item 4', 'Item 5']);

    // bounded: arming again is required for a second occurrence
    const ok = await post(fx.origin, '/delete/' + encodeURIComponent('Item 4'));
    expect(ok.status).toBe(200);
    expect(fx.log).toEqual(['delete:Item 3', 'delete:Item 4']);
  });

  it('rejected write: the error status is returned and the mutation is NOT applied or logged', async () => {
    fx.faults.rejectWrite(500, { pathPrefix: '/delete/' });
    const res = await post(fx.origin, '/delete/' + encodeURIComponent('Item 2'));
    expect(res.status).toBe(500);
    expect(fx.log).toEqual([]);
    expect(fx.items).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']);

    // bounded: the very next attempt on the same path succeeds normally
    const ok = await post(fx.origin, '/delete/' + encodeURIComponent('Item 2'));
    expect(ok.status).toBe(200);
    expect(fx.log).toEqual(['delete:Item 2']);
    expect(fx.items).toEqual(['Item 1', 'Item 3', 'Item 4', 'Item 5']);
  });

  it('stale UI: a read right after a mutation still shows the pre-mutation snapshot', async () => {
    fx.faults.staleUI();
    const del = await post(fx.origin, '/delete/' + encodeURIComponent('Item 1'));
    expect(del.status).toBe(200);
    // the mutation genuinely happened...
    expect(fx.log).toEqual(['delete:Item 1']);
    expect(fx.items).toEqual(['Item 2', 'Item 3', 'Item 4', 'Item 5']);
    // ...but the next read of /items still reports the OLD state
    const stale = await get(fx.origin, '/items');
    expect(JSON.parse(stale.body)).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']);

    // bounded: the read right after that is fresh again
    const fresh = await get(fx.origin, '/items');
    expect(JSON.parse(fresh.body)).toEqual(['Item 2', 'Item 3', 'Item 4', 'Item 5']);
  });

  it('a fault armed with times:2 fires exactly twice, not once and not forever', async () => {
    fx.faults.rejectWrite(503, { pathPrefix: '/mark/', times: 2 });
    const first = await post(fx.origin, '/mark/' + encodeURIComponent('Item 1'));
    const second = await post(fx.origin, '/mark/' + encodeURIComponent('Item 1'));
    const third = await post(fx.origin, '/mark/' + encodeURIComponent('Item 1'));
    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(third.status).toBe(200);
    expect(fx.log).toEqual(['mark:Item 1']);
  });

  it('reset clears armed faults so they cannot leak into the next test case', async () => {
    fx.faults.rejectWrite(500, { pathPrefix: '/delete/' });
    fx.reset(3);
    const res = await post(fx.origin, '/delete/' + encodeURIComponent('Item 1'));
    expect(res.status).toBe(200);
    expect(fx.log).toEqual(['delete:Item 1']);
  });
});
