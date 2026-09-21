/**
 * A click on a link waits for the navigation the link itself promises, and a
 * url gate accepts a replay that went where the link points when the
 * recording captured the page the link left.
 *
 * fwop2 (OpenProject, round 33): s_f4e3b6's click on "Bench Project" was
 * recorded as landing on /projects — the list it was clicked on — because a
 * cold server's Turbo Drive visit (fetch, then history.pushState) outlasted
 * the settle. Both replays went to /projects/bench-project and were refused.
 *
 * The clock and the page are simulated as in execution-action.test.ts: time
 * moves only when the code under test sleeps or a scripted event is due.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { LINK_COMMIT_GRACE_MS, LINK_NAV_WAIT_MS, beginAction, pageTraffic, type ActionClock, type DomPort } from '../src/execution/action.js';
import { linkHrefOf, robustClick } from '../src/execution/browser.js';
import { linkLandingWarning, urlEffectVerdict } from '../src/execution/gates.js';

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

const ORIGIN = 'http://127.0.0.1:8090';
const LIST = `${ORIGIN}/projects`;
const PROJECT = `${ORIGIN}/projects/bench-project`;

interface FakeRequest {
  resourceType(): string;
  method(): string;
  url(): string;
  redirectedFrom(): FakeRequest | null;
}

/** A page whose url a test moves, emitting the request events it scripts. */
function fakePage(url: string) {
  const listeners = new Map<string, Set<(arg: unknown) => void>>();
  const frame = {};
  let current = url;
  const page = {
    on: (event: string, fn: (arg: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off: (event: string, fn: (arg: unknown) => void) => listeners.get(event)?.delete(fn),
    url: () => current,
    mainFrame: () => frame,
  };
  const emit = (event: string, arg: unknown) => {
    for (const fn of [...(listeners.get(event) ?? [])]) fn(arg);
  };
  const request = (href: string, type = 'fetch', from: FakeRequest | null = null): FakeRequest => ({ resourceType: () => type, method: () => 'GET', url: () => href, redirectedFrom: () => from });
  return {
    page,
    asPage: page as unknown as Page,
    request,
    start: (req: FakeRequest) => emit('request', req),
    answer: (req: FakeRequest) => {
      emit('response', { request: () => req, headers: () => ({ 'content-type': 'text/html' }) });
      emit('requestfinished', req);
    },
    /** history.pushState: the url moves, the document stays. */
    push: (to: string) => {
      current = to;
      emit('framenavigated', frame);
    },
  };
}

const quietDom = (): DomPort => ({ quiet: async () => ({ mutated: false }) });

function clickOnLink(href = PROJECT) {
  const sim = simulation();
  const fx = fakePage(LIST);
  pageTraffic(fx.asPage, { clock: sim.clock });
  const obs = beginAction(fx.asPage, { deadlineMs: 30_000, clock: sim.clock, dom: quietDom() });
  obs.linkTarget(href);
  obs.dispatched('actionable');
  return { sim, fx, obs };
}

describe('a click on a link waits for the navigation its href promises', () => {
  it('holds past the network cap and the long-open cutoff until the visit pushes its url (fwop2 s_f4e3b6)', async () => {
    const { sim, fx, obs } = clickOnLink();
    // Turbo Drive: fetch the page, and only once it answers, push the url.
    const visit = fx.request(PROJECT);
    fx.start(visit);
    sim.at(8_000, () => {
      fx.answer(visit);
      fx.push(PROJECT);
    });
    const verdict = await sim.drive(obs.settle());
    expect(verdict.url).toBe(PROJECT);
    expect(verdict.link).toEqual({ from: LIST, href: PROJECT });
    expect(sim.now()).toBeGreaterThanOrEqual(8_000);
    expect(sim.now()).toBeLessThan(8_000 + 1_000);
    expect(verdict.deadlineHit).toBe(false);
  });

  it('follows a redirect the link request began', async () => {
    const { sim, fx, obs } = clickOnLink();
    const first = fx.request(PROJECT);
    fx.start(first);
    const hop = fx.request(`${ORIGIN}/projects/bench-project/overview`, 'fetch', first);
    sim.at(1_000, () => {
      fx.answer(first);
      fx.start(hop);
    });
    sim.at(7_000, () => {
      fx.answer(hop);
      fx.push(`${ORIGIN}/projects/bench-project/overview`);
    });
    const verdict = await sim.drive(obs.settle());
    expect(verdict.url).toBe(`${ORIGIN}/projects/bench-project/overview`);
    expect(sim.now()).toBeGreaterThanOrEqual(7_000);
  });

  it('a link its page handles without asking for the href costs nothing', async () => {
    const { sim, fx, obs } = clickOnLink();
    fx.start(fx.request(`${ORIGIN}/api/v3/modal`));
    sim.at(300, () => undefined);
    const verdict = await sim.drive(obs.settle());
    expect(verdict.url).toBe(LIST);
    // only the ordinary network budget, never the link's
    expect(sim.now()).toBeLessThanOrEqual(2_000);
  });

  it('an answered link request whose url never moves is let go after the commit grace', async () => {
    const { sim, fx, obs } = clickOnLink();
    const frameLoad = fx.request(PROJECT);
    fx.start(frameLoad);
    sim.at(3_000, () => fx.answer(frameLoad));
    const verdict = await sim.drive(obs.settle());
    expect(verdict.url).toBe(LIST);
    expect(sim.now()).toBe(3_000 + LINK_COMMIT_GRACE_MS);
  });

  it('a link request that never answers is bounded by LINK_NAV_WAIT_MS', async () => {
    const { sim, fx, obs } = clickOnLink();
    fx.start(fx.request(PROJECT));
    const verdict = await sim.drive(obs.settle());
    expect(verdict.url).toBe(LIST);
    expect(verdict.link).toEqual({ from: LIST, href: PROJECT });
    expect(sim.now()).toBeLessThanOrEqual(2_000 + LINK_NAV_WAIT_MS);
    expect(sim.now()).toBeGreaterThanOrEqual(LINK_NAV_WAIT_MS);
  });

  it('without a reported link, the same slow visit is not waited for past the network cap', async () => {
    const sim = simulation();
    const fx = fakePage(LIST);
    pageTraffic(fx.asPage, { clock: sim.clock });
    const obs = beginAction(fx.asPage, { deadlineMs: 30_000, clock: sim.clock, dom: quietDom() });
    const visit = fx.request(PROJECT);
    fx.start(visit);
    sim.at(8_000, () => {
      fx.answer(visit);
      fx.push(PROJECT);
    });
    const verdict = await sim.drive(obs.settle());
    expect(verdict.url).toBe(LIST);
    expect(verdict.link).toBeUndefined();
    expect(obs.link()).toBeUndefined();
  });
});

describe('robustClick reports the link it is about to click', () => {
  it('asks the target before the click goes out', async () => {
    const order: string[] = [];
    const loc = {
      waitFor: async () => undefined,
      first() {
        return this;
      },
      evaluate: async () => {
        order.push('asked');
        return PROJECT;
      },
      click: async () => {
        order.push('clicked');
      },
    } as unknown as Locator;
    const reported: string[] = [];
    await robustClick(loc, {
      timeout: 1_000,
      obs: { remaining: () => 10_000, dispatched: () => order.push('dispatched'), linkTarget: (href) => reported.push(href) },
    });
    expect(reported).toEqual([PROJECT]);
    expect(order).toEqual(['asked', 'clicked', 'dispatched']);
  });

  it('a target that cannot be asked, or is no link, still clicks and reports nothing', async () => {
    for (const evaluate of [async () => null, async () => { throw new Error('detached'); }]) {
      let clicked = false;
      const loc = { waitFor: async () => undefined, first() { return this; }, evaluate, click: async () => { clicked = true; } } as unknown as Locator;
      const reported: string[] = [];
      await robustClick(loc, { timeout: 1_000, obs: { remaining: () => 10_000, linkTarget: (href) => reported.push(href) } });
      expect(clicked).toBe(true);
      expect(reported).toEqual([]);
    }
  });
});

describe('linkHrefOf', () => {
  const saved = (globalThis as { document?: unknown }).document;
  afterEach(() => {
    (globalThis as { document?: unknown }).document = saved;
  });

  /** An element inside an anchor with these attributes, on a document at `here`. */
  const inside = (attrs: Record<string, string> | null, here = LIST) => {
    (globalThis as { document?: unknown }).document = { baseURI: here, location: { href: here } };
    const anchor = attrs
      ? {
          href: new URL(attrs.href, here).href,
          hasAttribute: (name: string) => name in attrs,
          getAttribute: (name: string) => attrs[name] ?? null,
        }
      : null;
    return { closest: () => anchor } as unknown as Element;
  };

  it('is the absolute href of a link that leaves the document in this tab', () => {
    expect(linkHrefOf(inside({ href: '/projects/bench-project' }))).toBe(PROJECT);
    expect(linkHrefOf(inside({ href: '/projects/bench-project', target: '_self' }))).toBe(PROJECT);
  });

  it('is null for what does not navigate this tab to another document', () => {
    expect(linkHrefOf(inside(null))).toBeNull();
    expect(linkHrefOf(inside({ href: '#section' }))).toBeNull();
    expect(linkHrefOf(inside({ href: '/projects#/board' }))).toBeNull();
    expect(linkHrefOf(inside({ href: 'javascript:void(0)' }))).toBeNull();
    expect(linkHrefOf(inside({ href: '/export.csv', download: '' }))).toBeNull();
    expect(linkHrefOf(inside({ href: '/projects/bench-project', target: '_blank' }))).toBeNull();
  });
});

describe('the url gate on a link click recorded before its navigation committed', () => {
  const link = { from: LIST, href: PROJECT };

  it('accepts a replay that went where the link points (fwop2 s_f4e3b6 step 1)', () => {
    const verdict = urlEffectVerdict(LIST, PROJECT, {}, 'step 1', link);
    expect(verdict.stop).toBeUndefined();
    expect(verdict.warnings).toHaveLength(1);
    expect(verdict.warnings[0]).toMatch(/page the clicked link left/);
    // Without the link, the same replay is refused exactly as round 33 saw it.
    expect(urlEffectVerdict(LIST, PROJECT, {}, 'step 1').stop).toBe(`after step 1 expected url ${LIST} but browser is at ${PROJECT}`);
  });

  it('is narrow: the recorded url must be where the click began, and the live url the link\'s href', () => {
    // the replay went somewhere the link does not point
    expect(linkLandingWarning(LIST, `${ORIGIN}/login`, {}, 'step 1', link)).toBeNull();
    // the recording expected a page other than the one the click began on
    expect(linkLandingWarning(`${ORIGIN}/my/page`, PROJECT, {}, 'step 1', link)).toBeNull();
    // a link to the page it is on
    expect(linkLandingWarning(LIST, LIST, {}, 'step 1', { from: LIST, href: LIST })).toBeNull();
    // no link reported
    expect(linkLandingWarning(LIST, PROJECT, {}, 'step 1', undefined)).toBeNull();
    expect(urlEffectVerdict(LIST, `${ORIGIN}/login`, {}, 'step 1', link).stop).toMatch(/expected url/);
  });

  it('reads the recorded url through the step\'s params', () => {
    const from = `${ORIGIN}/projects/alpha`;
    const w = linkLandingWarning(`${ORIGIN}/projects/{{v1}}`, `${ORIGIN}/projects/alpha/work_packages`, { v1: 'alpha' }, 'step 2', { from, href: `${ORIGIN}/projects/alpha/work_packages` });
    expect(w).toMatch(/^step 2: recorded url/);
  });
});
