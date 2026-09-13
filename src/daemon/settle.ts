import type { Page } from 'playwright-core';
import { settleDom } from '../execution/browser.js';
export { settleDom } from '../execution/browser.js';

const REQUEST_RECENT_MS = 300;
const SETTLE_PAGE_MAX_MS = 2_000;

/**
 * Requests that never finish on purpose. A long-poll, an SSE stream or a
 * websocket upgrade is in flight for as long as the app is alive (Odoo's
 * /longpolling/poll is the canonical one — see waitForContent in refs.ts),
 * so waiting for it to finish is waiting for the deadline every single time.
 * Matched on the transport (resourceType) and on the path shape any app that
 * long-polls shares, never on an app's own route.
 */
const STREAMING_PATH = /(^|[/_-])(longpoll(ing)?|poll|stream|sse|subscribe|events?source|notifications?|watch)(\b|[/_-])/i;

function isStreaming(req: { resourceType(): string; url(): string }): boolean {
  const type = req.resourceType();
  if (type === 'websocket' || type === 'eventsource') return true;
  if (type !== 'fetch' && type !== 'xhr') return true; // images, fonts, media: not what an action is waiting on
  try {
    return STREAMING_PATH.test(new URL(req.url()).pathname);
  } catch {
    return false;
  }
}

interface RequestTracker {
  /** started-at per request still in flight, so a caller can ignore ones older than its own window */
  pending: Map<unknown, number>;
  /** woken whenever a request finishes, so the wait below is event-driven rather than a poll */
  wake: Set<() => void>;
}

const trackers = new WeakMap<Page, RequestTracker>();

/**
 * Count the page's own fetch/XHR traffic so `settlePage` can tell "the click
 * did nothing" from "the click asked the server". Installed once per page;
 * safe to call on every settle. Mirrors the session-level counter in
 * browser.ts, but keeps a start time per request and drops streaming
 * transports, both of which that counter cannot express.
 */
export function installRequestTracking(page: Page): void {
  if (trackers.has(page)) return;
  const tracker: RequestTracker = { pending: new Map(), wake: new Set() };
  trackers.set(page, tracker);
  const done = (req: unknown) => {
    if (!tracker.pending.delete(req)) return;
    for (const w of [...tracker.wake]) w();
  };
  page.on('request', (req) => {
    if (!isStreaming(req)) tracker.pending.set(req, Date.now());
  });
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  // A navigation abandons everything that was in flight; without this the
  // stale entries would hold the next settle to its deadline.
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    tracker.pending.clear();
    for (const w of [...tracker.wake]) w();
  });
}

/** How many non-streaming requests `page` has in flight (0 for a page never tracked). */
export function inFlightRequests(page: Page): number {
  return trackers.get(page)?.pending.size ?? 0;
}

/**
 * settleDom plus the page's own network: when the action started fetch/XHR
 * traffic in the moments around it, wait for that traffic to land rather than
 * snapshotting the pre-answer DOM. Bounded by `maxMs` in total — an app that
 * chatters forever costs the deadline once, never more — and it returns at
 * settleDom's speed (~60ms) on a page that asked for nothing.
 */
export async function settlePage(page: Page, opts: { maxMs?: number; recentMs?: number } = {}): Promise<void> {
  const maxMs = opts.maxMs ?? SETTLE_PAGE_MAX_MS;
  const recentMs = opts.recentMs ?? REQUEST_RECENT_MS;
  const deadline = Date.now() + maxMs;
  installRequestTracking(page);
  await settleDom(page);
  const tracker = trackers.get(page);
  if (!tracker) return;
  // Only traffic the action itself could have started: a request already in
  // flight when we arrived (a slow analytics beacon, a stream we failed to
  // classify) is not what this settle is about.
  const window = Date.now() - recentMs;
  const relevant = () => [...tracker.pending.values()].some((started) => started >= window);
  while (relevant() && Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      const wake = () => {
        tracker.wake.delete(wake);
        clearTimeout(timer);
        resolve();
      };
      // The timer is the ceiling, not the cadence: `wake` fires the instant a
      // request completes, so a fast answer costs its own latency and no more.
      const timer = setTimeout(wake, Math.max(0, deadline - Date.now()));
      tracker.wake.add(wake);
    });
  }
}
