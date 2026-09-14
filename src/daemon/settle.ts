import type { Page } from 'playwright-core';
import { beginAction } from '../execution/action.js';
export { settleDom } from '../execution/browser.js';
export { inFlightRequests, pageTraffic } from '../execution/action.js';

/** The whole budget of a settle with no action behind it (the old settlePage deadline). */
const SETTLE_PAGE_MAX_MS = 2_000;

/**
 * Settle a page when there is no action observation to ask: the DOM goes
 * quiet, and traffic started in the moments before the call is given its
 * (bounded) chance to land. The same observation an action uses
 * (src/execution/action.ts), begun now — so "the moments before" are the
 * traffic policy's `recentMs`, and long-lived requests are recognised by what
 * they do, not by a path that looks like a stream. Its own request tracker
 * and its STREAMING_PATH name list are gone: a route called `notifications`
 * or `watch` is waited for like any other.
 *
 * Returns at settleDom's speed (~60ms) on a page that asked for nothing, and
 * never after `maxMs`.
 */
export async function settlePage(page: Page, opts: { maxMs?: number } = {}): Promise<void> {
  await beginAction(page, { deadlineMs: opts.maxMs ?? SETTLE_PAGE_MAX_MS }).settle();
}
