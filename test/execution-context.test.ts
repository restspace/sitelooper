/**
 * The shared frame and page context (src/execution/context.ts, notes/ROBUSTNESS.md
 * finding 5), with fake roots: how a recorded frame path is found again, what
 * it refuses, and how a recorded page effect is followed. The browser half is
 * in test/replay.test.ts (record -> compile -> replay on /frames and /opener).
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import {
  armPageEffect,
  contextsEqual,
  describeFramePath,
  framesEqual,
  pageIndexVerdict,
  rootFor,
  stepEffect,
  type FramePath,
} from '../src/execution/context.js';

/** A fake document: selector -> how many elements it matches now, and (for nth) the frame url behind it. */
interface FakeDoc {
  counts: Record<string, number | (() => number)>;
  urls?: Record<string, string>;
  /** What each selector's frame contains. */
  frames?: Record<string, FakeDoc>;
  asked?: string[];
}

function fakeRoot(doc: FakeDoc): Page {
  const root = {
    locator: (selector: string) => ({
      count: async () => {
        doc.asked?.push(selector);
        const c = doc.counts[selector];
        return typeof c === 'function' ? c() : (c ?? 0);
      },
      elementHandle: async () => ({
        contentFrame: async () => ({ url: () => doc.urls?.[selector] ?? '' }),
        dispose: async () => {},
      }),
      contentFrame: () => ({ ...fakeRoot(doc.frames?.[selector] ?? { counts: {} }), __frame: selector }),
    }),
  };
  return root as unknown as Page;
}

const payment: FramePath = [{ selectors: ['iframe[title="Payment"]', 'iframe[src*="/frames/inner"]'], title: 'Payment' }];

describe('rootFor', () => {
  it('is the page itself for an absent or empty path', async () => {
    const page = fakeRoot({ counts: {} });
    expect(await rootFor(page, undefined, 0)).toEqual({ root: page });
    expect(await rootFor(page, [], 0)).toEqual({ root: page });
  });

  it('takes the first selector that matches exactly one iframe, in recorded order', async () => {
    const asked: string[] = [];
    const page = fakeRoot({ counts: { 'iframe[title="Payment"]': 0, 'iframe[src*="/frames/inner"]': 1 }, asked });
    const found = await rootFor(page, payment, 0);
    expect('root' in found && (found.root as unknown as { __frame: string }).__frame).toBe('iframe[src*="/frames/inner"]');
    expect(asked).toEqual(['iframe[title="Payment"]', 'iframe[src*="/frames/inner"]']);
  });

  it('walks every hop top-down, each inside the frame the one above it found', async () => {
    const inner: FakeDoc = { counts: { 'iframe[name="card"]': 1 } };
    const page = fakeRoot({ counts: { 'iframe[title="Payment"]': 1 }, frames: { 'iframe[title="Payment"]': inner } });
    const path: FramePath = [...payment, { selectors: ['iframe[name="card"]'], name: 'card' }];
    const found = await rootFor(page, path, 0);
    expect('root' in found && (found.root as unknown as { __frame: string }).__frame).toBe('iframe[name="card"]');
    // the second hop is not found on the page itself
    const flat = fakeRoot({ counts: { 'iframe[title="Payment"]': 1, 'iframe[name="card"]': 1 } });
    const miss = await rootFor(flat, path, 0);
    expect(miss).toEqual({ error: 'recorded frame iframe[name="card"] not found (tried: iframe[name="card"])', missing: true });
  });

  it('accepts a positional selector only when the frame behind it has the recorded url', async () => {
    const hop: FramePath = [{ selectors: ['iframe >> nth=1'], urlPattern: 'http://app.test/frames/inner' }];
    const right = fakeRoot({ counts: { 'iframe >> nth=1': 1 }, urls: { 'iframe >> nth=1': 'http://app.test/frames/inner' } });
    expect('root' in (await rootFor(right, hop, 0))).toBe(true);
    const wrong = fakeRoot({ counts: { 'iframe >> nth=1': 1 }, urls: { 'iframe >> nth=1': 'http://app.test/ads' } });
    expect(await rootFor(wrong, hop, 0)).toMatchObject({ missing: true });
    // with no url recorded, a position names nothing at all
    const bare = fakeRoot({ counts: { 'iframe >> nth=1': 1 }, urls: { 'iframe >> nth=1': 'http://app.test/frames/inner' } });
    expect(await rootFor(bare, [{ selectors: ['iframe >> nth=1'] }], 0)).toMatchObject({ missing: true });
  });

  it('says exactly which recorded frame is missing, and never answers with the page', async () => {
    const page = fakeRoot({ counts: {} });
    const found = await rootFor(page, payment, 0);
    expect(found).toEqual({
      error: 'recorded frame iframe[title="Payment"] not found (tried: iframe[title="Payment"], iframe[src*="/frames/inner"])',
      missing: true,
    });
  });

  it('calls a frame several selectors match ambiguous, not missing', async () => {
    const page = fakeRoot({ counts: { 'iframe[title="Payment"]': 2, 'iframe[src*="/frames/inner"]': 3 } });
    expect(await rootFor(page, payment, 0)).toEqual({ error: 'recorded frame iframe[title="Payment"] is ambiguous (2 matches for iframe[title="Payment"])', missing: false });
  });

  it('polls the path within its wait, for a frame injected a beat late', async () => {
    let asks = 0;
    const page = fakeRoot({ counts: { 'iframe[title="Payment"]': () => (++asks >= 3 ? 1 : 0) } });
    const found = await rootFor(page, [{ selectors: ['iframe[title="Payment"]'], title: 'Payment' }], 1_000, 5);
    expect('root' in found).toBe(true);
    expect(asks).toBe(3);
    // ...and gives up when the wait is spent
    const never = fakeRoot({ counts: {} });
    const started = Date.now();
    expect(await rootFor(never, payment, 40, 10)).toMatchObject({ missing: true });
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });
});

describe('describing and comparing frame paths', () => {
  it('names a frame by its title, its name, else its first selector', () => {
    expect(describeFramePath(payment)).toBe('iframe[title="Payment"]');
    expect(describeFramePath([{ selectors: ['iframe#pay'], name: 'pay' }, { selectors: ['iframe >> nth=0'] }])).toBe('iframe[name="pay"] > iframe >> nth=0');
  });

  it('treats absent and empty as the main frame, and any hop difference as another frame', () => {
    expect(framesEqual(undefined, [])).toBe(true);
    expect(framesEqual(payment, structuredClone(payment))).toBe(true);
    expect(framesEqual(payment, undefined)).toBe(false);
    expect(framesEqual(payment, [{ ...payment[0], title: 'Checkout' }])).toBe(false);
    expect(contextsEqual({ target: { frame: payment } }, { target: { frame: payment }, source: {} })).toBe(true);
    expect(contextsEqual({ target: { frame: payment } }, {})).toBe(false);
  });
});

describe('page effects', () => {
  it('reads a legacy tabs switch as a switch effect, and a recorded effect as itself', () => {
    expect(stepEffect({ tool: 'tabs', args: { switch_to: 1 } })).toEqual({ kind: 'switch', to: 1 });
    expect(stepEffect({ tool: 'tabs', args: {} })).toBeUndefined();
    expect(stepEffect({ tool: 'click', args: {}, effect: { kind: 'close' } })).toEqual({ kind: 'close' });
    expect(stepEffect({ tool: 'click', args: {} })).toBeUndefined();
  });

  /** A fake page whose context holds `pages`, with a popup/close event source. */
  function fakePage(o: { pages?: Page[]; events?: Record<string, () => unknown>; opener?: Page | null; closed?: () => boolean } = {}): Page & { armed: string[] } {
    const armed: string[] = [];
    const page = {
      armed,
      isClosed: o.closed ?? (() => false),
      opener: async () => o.opener ?? null,
      context: () => ({ pages: () => o.pages ?? [page] }),
      bringToFront: async () => {},
      waitForLoadState: async () => {},
      waitForEvent: (name: string) => {
        armed.push(name);
        const fire = o.events?.[name];
        return fire ? Promise.resolve(fire()) : Promise.reject(new Error(`timeout waiting for ${name}`));
      },
    };
    return page as unknown as Page & { armed: string[] };
  }

  /**
   * A page on a context that gains `appear` when its `page` event fires — the
   * recorder's rule (tools.ts pageContextOf): the popup is the one page that
   * appeared, opener or not (snipe-it fwsi9's Ctrl+click tab has none).
   */
  function onContext(appear: Page[]): Page & { armed: string[] } {
    const armed: string[] = [];
    const pages: Page[] = [];
    const page = {
      armed,
      isClosed: () => false,
      opener: async () => null,
      context: () => ({
        pages: () => pages,
        waitForEvent: (name: string) => {
          armed.push(name);
          if (!appear.length) return Promise.reject(new Error(`timeout waiting for ${name}`));
          pages.push(...appear);
          return Promise.resolve(appear[0]);
        },
      }),
    } as unknown as Page & { armed: string[] };
    pages.push(page);
    return page;
  }

  it('attaches the listener when armed — before the action — and continues on the one page that appeared, opener or not', async () => {
    const popup = fakePage();
    const page = onContext([popup]);
    const landing = await armPageEffect(page, { kind: 'popup' }, 'step 1');
    expect(page.armed).toEqual(['page']);
    expect(await landing()).toEqual({ page: popup });
  });

  it('of several new pages, continues only on the one this page opened', async () => {
    const stray = fakePage();
    let page: Page & { armed: string[] };
    const mine = { ...fakePage(), opener: async () => page } as unknown as Page;
    page = onContext([stray, mine]);
    expect(await (await armPageEffect(page, { kind: 'popup' }, 'step 1'))()).toEqual({ page: mine });
    const neither = onContext([fakePage(), fakePage()]);
    expect(await (await armPageEffect(neither, { kind: 'popup' }, 'step 1'))()).toEqual({ error: 'step 1 was recorded opening a popup, and 2 pages opened, none of them by this page' });
  });

  it('stops when a recorded popup does not open', async () => {
    const page = onContext([]);
    const landing = await armPageEffect(page, { kind: 'popup' }, 'step 1', 10);
    expect(await landing()).toEqual({ error: 'step 1 was recorded opening a popup, and none opened within 10ms' });
  });

  it('continues on the opener once a recorded close has happened, and stops when the page stays open', async () => {
    const opener = fakePage();
    let closed = false;
    const popup = fakePage({ opener, closed: () => closed, events: { close: () => (closed = true) } });
    expect(await (await armPageEffect(popup, { kind: 'close' }, 'step 2'))()).toEqual({ page: opener });
    const stays = fakePage({ opener });
    expect(await (await armPageEffect(stays, { kind: 'close' }, 'step 2', 10))()).toEqual({ error: 'step 2 was recorded closing its page, and the page is still open after 10ms' });
  });

  it('switches to the recorded tab index among the open pages', async () => {
    const second = fakePage();
    const pages: Page[] = [];
    const first = fakePage({ pages });
    pages.push(first, second);
    expect(await (await armPageEffect(first, { kind: 'switch', to: 1 }, 'step 3'))()).toEqual({ page: second });
    expect(await (await armPageEffect(first, { kind: 'switch', to: 4 }, 'step 3'))()).toEqual({ error: 'step 3 was recorded switching to tab 4, but only 2 tab(s) are open' });
  });

  it('follows nothing for a step with no effect', async () => {
    const page = fakePage();
    expect(await (await armPageEffect(page, undefined, 'step 1'))()).toBeNull();
    expect(page.armed).toEqual([]);
  });

  it('stops a step recorded on another page of the browser', () => {
    const pages: Page[] = [];
    const opener = fakePage({ pages });
    const popup = fakePage({ pages });
    pages.push(opener, popup);
    expect(pageIndexVerdict(popup, 1, 'step 2')).toBeNull();
    expect(pageIndexVerdict(opener, undefined, 'step 2')).toBeNull();
    expect(pageIndexVerdict(opener, 1, 'step 2')).toBe(
      'step 2 was recorded on page 1 of the browser, but the procedure is on page 0 of 2 — the page it expects (a popup or tab opened earlier) is not open here',
    );
  });
});
