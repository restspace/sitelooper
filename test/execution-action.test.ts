/**
 * The action observation (src/execution/action.ts, ROBUSTNESS.md finding 6),
 * with every port faked: a simulated clock that only moves when the code
 * under test sleeps or a scripted event is due, a page that emits scripted
 * request events, and a DOM that reports scripted mutations. No assertion
 * here depends on the wall clock — every time is the simulation's.
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import {
  DEFAULT_TRAFFIC_POLICY,
  beginAction,
  classifyLongLived,
  inFlightRequests,
  pageTraffic,
  type ActionClock,
  type ActionOptions,
  type DomPort,
  type RequestRecord,
} from '../src/execution/action.js';
import { actionFailure } from '../src/execution/browser.js';

/** A discrete-event clock: time jumps to the next due timer or scripted event, never on its own. */
function simulation() {
  let t = 0;
  let seq = 0;
  const due: { at: number; seq: number; fire: () => void }[] = [];
  const clock: ActionClock = {
    now: () => t,
    sleep: (ms) => new Promise<void>((resolve) => due.push({ at: t + Math.max(0, ms), seq: seq++, fire: resolve })),
  };
  const at = (when: number, fire: () => void) => due.push({ at: when, seq: seq++, fire });
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  async function drive<T>(promise: Promise<T>): Promise<T> {
    let settled = false;
    promise.then(() => (settled = true), () => (settled = true));
    for (let i = 0; i < 10_000; i++) {
      for (let k = 0; k < 5; k++) await flush();
      if (settled) return promise;
      due.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = due.shift();
      if (!next) throw new Error(`stalled at t=${t}`);
      t = Math.max(t, next.at);
      next.fire();
    }
    throw new Error('did not settle');
  }
  return { clock, at, drive, now: () => t };
}

/** A page that emits what a test scripts. */
function fakePage(url = 'http://app.test/') {
  const listeners = new Map<string, Set<(arg: unknown) => void>>();
  const frame = {};
  const page = {
    on: (event: string, fn: (arg: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off: (event: string, fn: (arg: unknown) => void) => listeners.get(event)?.delete(fn),
    url: () => url,
    mainFrame: () => frame,
  };
  const emit = (event: string, arg: unknown) => {
    for (const fn of [...(listeners.get(event) ?? [])]) fn(arg);
  };
  const request = (path: string, type = 'fetch', method = 'GET') => ({ resourceType: () => type, method: () => method, url: () => `http://app.test${path}` });
  type Req = ReturnType<typeof request>;
  return {
    page,
    asPage: page as unknown as Page,
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    request,
    start: (req: Req) => emit('request', req),
    respond: (req: Req, contentType = 'application/json') => emit('response', { request: () => req, headers: () => ({ 'content-type': contentType }) }),
    finish: (req: Req) => emit('requestfinished', req),
    navigate: () => emit('framenavigated', frame),
  };
}

/** A DOM that is always quiet, except for the mutations a test scripts (reported once seen). */
function fakeDom(sim: ReturnType<typeof simulation>, mutations: number[] = []): DomPort & { looks: number } {
  let seen = -Infinity;
  const dom = {
    looks: 0,
    quiet: async () => {
      dom.looks++;
      const now = sim.now();
      const last = mutations.filter((m) => m <= now && m > seen).pop();
      if (last === undefined) return { mutated: false };
      seen = last;
      return { mutated: true, lastMutationAt: last };
    },
  };
  return dom;
}

const record = (over: Partial<RequestRecord>): RequestRecord => ({ type: 'fetch', method: 'GET', endpoint: 'http://app.test/api/x', url: 'http://app.test/api/x', startedAt: 0, ...over });

describe('classifyLongLived', () => {
  const policy = DEFAULT_TRAFFIC_POLICY;
  it.each([
    ['an event source', record({ type: 'eventsource' }), 'transport'],
    ['a websocket', record({ type: 'websocket' }), 'transport'],
    ['a response that says it streams', record({ responseAt: 10, contentType: 'text/event-stream; charset=utf-8' }), 'event-stream'],
    ['a multipart stream', record({ responseAt: 10, contentType: 'multipart/x-mixed-replace; boundary=x' }), 'event-stream'],
    ['a body still open well after its headers', record({ responseAt: 100, startedAt: 50 }), 'streaming-body'],
    ['a request open before the action began', record({ startedAt: -1_000 }), 'open-at-baseline'],
    ['a fetch unanswered past the long-open window', record({ startedAt: -100 }), 'open-too-long'],
  ] as const)('%s is long-lived (%s)', (_what, r, why) => {
    // `now` is far enough on for the time-based rules; baseline is 0 except where the
    // rule is about the baseline itself.
    const now = why === 'open-too-long' ? 5_000 : 1_200;
    const baseline = why === 'open-too-long' ? -300 : 0;
    expect(classifyLongLived(r, now, baseline, policy)).toBe(why);
  });

  it('an ordinary request is not long-lived, whatever its path is called', () => {
    for (const path of ['/api/notifications', '/watch/list', '/longpolling/poll', '/stream/items', '/events']) {
      const r = record({ endpoint: `http://app.test${path}`, url: `http://app.test${path}`, startedAt: 0 });
      expect(classifyLongLived(r, 700, 0, policy), path).toBeNull();
      expect(classifyLongLived({ ...r, responseAt: 650 }, 700, 0, policy), path).toBeNull();
    }
  });

  it('a request started just before the action is still the action’s', () => {
    expect(classifyLongLived(record({ startedAt: -200 }), 100, 0, policy)).toBeNull();
    expect(classifyLongLived(record({ startedAt: -400 }), 100, 0, policy)).toBe('open-at-baseline');
  });

  it('only a fetch or XHR is judged by how long it stays open or by a learned endpoint', () => {
    const known = new Set(['GET http://app.test/api/x']);
    expect(classifyLongLived(record({}), 100, 0, policy, known)).toBe('known-long-poll');
    expect(classifyLongLived(record({ type: 'document' }), 100, 0, policy, known)).toBeNull();
    expect(classifyLongLived(record({ type: 'document', startedAt: 0 }), 9_000, 0, policy)).toBeNull();
    expect(classifyLongLived(record({ type: 'script', responseAt: 10 }), 9_000, 0, policy)).toBeNull();
  });
});

describe('pageTraffic', () => {
  it('records requests once per page and reads a page it never tracked as idle', () => {
    const sim = simulation();
    const fx = fakePage();
    expect(inFlightRequests(fx.page)).toBe(0);
    const traffic = pageTraffic(fx.page, { clock: sim.clock });
    expect(pageTraffic(fx.page)).toBe(traffic);
    expect(fx.listenerCount()).toBe(5);
    const save = fx.request('/api/save', 'fetch', 'POST');
    fx.start(save);
    fx.start(fx.request('/logo.png', 'image'));
    expect(inFlightRequests(fx.page)).toBe(1); // the image is recorded, never counted
    fx.respond(save);
    fx.finish(save);
    expect(inFlightRequests(fx.page)).toBe(0);
    expect(traffic.pending().map((r) => r.type)).toEqual(['image']);
    // a stub page with no events is idle and does not throw
    expect(inFlightRequests(pageTraffic({ url: () => '' } as never))).toBe(0);
  });

  it('a main-frame navigation abandons everything but documents', () => {
    const sim = simulation();
    const fx = fakePage();
    const traffic = pageTraffic(fx.page, { clock: sim.clock });
    fx.start(fx.request('/api/a'));
    fx.start(fx.request('/next', 'document'));
    fx.navigate();
    expect(traffic.pending().map((r) => r.type)).toEqual(['document']);
  });

  it('learns a long-poll endpoint from what it did, and counts its next poll as long-lived at once', async () => {
    const sim = simulation();
    const fx = fakePage();
    const traffic = pageTraffic(fx.page, { clock: sim.clock });
    const poll = fx.request('/bus/poll');
    fx.start(poll);
    await sim.drive(sim.clock.sleep(6_000));
    fx.respond(poll);
    fx.finish(poll);
    expect([...traffic.knownLongPoll]).toEqual(['GET http://app.test/bus/poll']);
    fx.start(fx.request('/bus/poll'));
    expect(inFlightRequests(fx.page)).toBe(0);
    // ...and an endpoint that merely answered is not learned
    const save = fx.request('/api/notifications', 'fetch', 'POST');
    fx.start(save);
    fx.respond(save);
    fx.finish(save);
    expect(traffic.knownLongPoll.has('POST http://app.test/api/notifications')).toBe(false);
  });
});

describe('beginAction / settle', () => {
  const setup = (opts: Partial<ActionOptions> = {}, mutations: number[] = []) => {
    const sim = simulation();
    const fx = fakePage();
    pageTraffic(fx.page, { clock: sim.clock });
    const dom = fakeDom(sim, mutations);
    const obs = beginAction(fx.asPage, { deadlineMs: 30_000, clock: sim.clock, dom, ...opts });
    return { sim, fx, dom, obs };
  };

  it('an action that asked for nothing settles at once, dispatched', async () => {
    const { sim, obs } = setup();
    obs.dispatched('actionable');
    const verdict = await sim.drive(obs.settle());
    expect(sim.now()).toBe(0);
    expect(verdict).toMatchObject({ outcome: 'dispatched', via: 'actionable', deadlineHit: false, ignored: [], url: 'http://app.test/' });
    // the same observation settles once
    expect(obs.settle()).toBe(obs.settle());
  });

  it('waits for a request the action started, and returns when it lands', async () => {
    const { sim, fx, obs } = setup();
    const save = fx.request('/api/save', 'fetch', 'POST');
    fx.start(save);
    sim.at(600, () => {
      fx.respond(save);
      fx.finish(save);
    });
    const verdict = await sim.drive(obs.settle());
    // the answer at 600, then the start grace after it for a follow-up request
    // (a save that refetches its list); a real answer that renders spends that
    // grace in its own DOM quiet window instead
    expect(sim.now()).toBe(850);
    expect(verdict.outcome).toBe('dispatched');
    expect(verdict.waited.networkMs).toBe(850);
  });

  it('waits for an ordinary request on a path named like a stream', async () => {
    const { sim, fx, obs } = setup();
    const notifications = fx.request('/api/notifications');
    fx.start(notifications);
    sim.at(700, () => {
      fx.respond(notifications);
      fx.finish(notifications);
    });
    const verdict = await sim.drive(obs.settle());
    expect(sim.now()).toBe(950); // its answer at 700, then the start grace after it
    expect(verdict.ignored).toEqual([]);
  }, 10_000);

  it('after a mutation, gives a request its start grace, and does not wait for one outside it', async () => {
    const inGrace = setup({}, [0]);
    const debounced = inGrace.fx.request('/api/save', 'fetch', 'POST');
    inGrace.sim.at(150, () => inGrace.fx.start(debounced));
    inGrace.sim.at(450, () => {
      inGrace.fx.respond(debounced);
      inGrace.fx.finish(debounced);
    });
    await inGrace.sim.drive(inGrace.obs.settle());
    expect(inGrace.sim.now()).toBeGreaterThanOrEqual(450);

    const late = setup({}, [0]);
    const tooLate = late.fx.request('/api/save', 'fetch', 'POST');
    late.sim.at(400, () => late.fx.start(tooLate));
    await late.sim.drive(late.obs.settle());
    expect(late.sim.now()).toBe(250); // the grace, and not a moment of waiting for what came after it
  });

  it('an input gives a debounced save its grace from the dispatch, with no mutation to announce it', async () => {
    for (const graceFromDispatch of [true, false]) {
      const { sim, fx, obs } = setup({ graceFromDispatch });
      const save = fx.request('/api/save', 'fetch', 'POST');
      sim.at(200, () => fx.start(save));
      sim.at(500, () => {
        fx.respond(save);
        fx.finish(save);
      });
      const verdict = await sim.drive(obs.settle());
      if (graceFromDispatch) {
        expect(sim.now()).toBeGreaterThanOrEqual(500);
        expect(verdict.waited.networkMs).toBeGreaterThanOrEqual(500);
      } else {
        expect(sim.now()).toBe(0);
      }
    }
  });

  it('never waits on an event stream, and says why it was ignored', async () => {
    const { sim, fx, obs } = setup();
    const feed = fx.request('/api/save');
    fx.start(feed);
    sim.at(20, () => fx.respond(feed, 'text/event-stream'));
    const verdict = await sim.drive(obs.settle());
    expect(sim.now()).toBe(20);
    expect(verdict.ignored).toEqual([{ url: 'http://app.test/api/save', why: 'event-stream' }]);
  });

  it('never waits on a request that was already open before the action', async () => {
    const sim = simulation();
    const fx = fakePage();
    pageTraffic(fx.page, { clock: sim.clock });
    fx.start(fx.request('/longpolling/poll'));
    await sim.drive(sim.clock.sleep(1_000));
    const obs = beginAction(fx.asPage, { deadlineMs: 30_000, clock: sim.clock, dom: fakeDom(sim) });
    const verdict = await sim.drive(obs.settle());
    expect(sim.now()).toBe(1_000);
    expect(verdict.ignored.map((i) => i.why)).toEqual(['open-at-baseline']);
  });

  it('an unanswered request costs the network cap once, then a long-open one is let go', async () => {
    const capped = setup();
    capped.fx.start(capped.fx.request('/stuck'));
    const verdict = await capped.sim.drive(capped.obs.settle());
    expect(capped.sim.now()).toBe(2_000);
    expect(verdict.deadlineHit).toBe(false);

    const uncapped = setup({ networkCapMs: 60_000 });
    uncapped.fx.start(uncapped.fx.request('/bus/poll'));
    const released = await uncapped.sim.drive(uncapped.obs.settle());
    expect(uncapped.sim.now()).toBe(5_001);
    expect(released.ignored.map((i) => i.why)).toEqual(['open-too-long']);
  });

  it('the deadline bounds the whole action and says it was hit', async () => {
    const { sim, fx, obs } = setup({ deadlineMs: 1_000 });
    fx.start(fx.request('/slow', 'fetch', 'POST'));
    expect(obs.remaining()).toBe(1_000);
    const verdict = await sim.drive(obs.settle());
    expect(sim.now()).toBe(1_000);
    expect(obs.remaining()).toBe(0);
    expect(verdict.deadlineHit).toBe(true);
  });

  it('an expectation that comes to hold is effect-verified; quiet alone never is', async () => {
    const verified = setup({ expect: undefined });
    let shown = false;
    const holding = setup({ expect: { holds: async () => shown } });
    holding.sim.at(300, () => (shown = true));
    const yes = await holding.sim.drive(holding.obs.settle());
    expect(yes.outcome).toBe('effect-verified');
    expect(holding.sim.now()).toBe(300);
    expect((await verified.sim.drive(verified.obs.settle())).outcome).toBe('dispatched');
  });

  it('an expectation that never holds is dispatched after its window; one never observed is unknown', async () => {
    const never = setup({ expect: { holds: async () => false } });
    const no = await never.sim.drive(never.obs.settle());
    expect(no.outcome).toBe('dispatched');
    expect(never.sim.now()).toBe(3_000);
    expect(no.waited.effectMs).toBe(3_000);

    const blind = setup({ expect: { holds: async () => null } });
    expect((await blind.sim.drive(blind.obs.settle())).outcome).toBe('unknown');

    const throwing = setup({ expect: { holds: async () => { throw new Error('page gone'); } } });
    expect((await throwing.sim.drive(throwing.obs.settle())).outcome).toBe('unknown');

    const clamped = setup({ deadlineMs: 500, expect: { holds: async () => false } });
    const cut = await clamped.sim.drive(clamped.obs.settle());
    expect(clamped.sim.now()).toBe(500);
    expect(cut.deadlineHit).toBe(true);
  });

  it('a failure records what its error proves and rethrows it', async () => {
    const refused = setup();
    const disabled = actionFailure('not-dispatched', 'disabled', 'click NOT dispatched: the control is disabled');
    expect(() => refused.obs.failed(disabled)).toThrow(disabled);
    expect((await refused.sim.drive(refused.obs.settle())).outcome).toBe('not-dispatched');

    const torn = setup();
    expect(() => torn.obs.failed(new Error('Target closed'))).toThrow('Target closed');
    expect((await torn.sim.drive(torn.obs.settle())).outcome).toBe('unknown');
  });

  it('cancel ends every wait and leaves nothing subscribed', async () => {
    const sim = simulation();
    const fx = fakePage();
    const traffic = pageTraffic(fx.page, { clock: sim.clock });
    let active = 0;
    const subscribe = traffic.subscribe.bind(traffic);
    traffic.subscribe = (listener) => {
      active++;
      const off = subscribe(listener);
      return () => {
        active--;
        return off();
      };
    };
    const obs = beginAction(fx.asPage, { deadlineMs: 30_000, clock: sim.clock, dom: fakeDom(sim) });
    fx.start(fx.request('/api/save', 'fetch', 'POST'));
    const settling = obs.settle();
    sim.at(100, () => {
      expect(active).toBe(1);
      obs.cancel();
    });
    await sim.drive(settling);
    expect(sim.now()).toBe(100);
    expect(active).toBe(0);
    expect(fx.listenerCount()).toBe(5); // an observation adds no page listener of its own
  });
});
