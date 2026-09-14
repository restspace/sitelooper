/**
 * The navigation fallback's two rungs (src/execution/recover.ts) against a
 * stubbed page: a substitute link's click whose outcome is unknown must never
 * be followed by the direct navigation — that would be a second commit of
 * whatever the link does (ROBUSTNESS.md finding 2).
 */
import type { Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { actionFailure } from '../src/execution/browser.js';
import { navigateToDestination } from '../src/execution/recover.js';

function stubPage() {
  let url = 'http://app.test/nav';
  const page = {
    url: () => url,
    // linkToDestination's anchor list (and settleDom's evaluate, whose answer is ignored)
    evaluate: async () => [{ attr: '/record/r7', abs: 'http://app.test/record/r7' }],
    locator: () => ({ first: () => ({}) }),
  } as unknown as Page;
  return { page, go: (to: string) => (url = to) };
}

describe('navigateToDestination', () => {
  const dest = 'http://app.test/record/r7';

  it('an unknown click on the substitute link stops: the direct navigation is never tried', async () => {
    const { page } = stubPage();
    const goto = vi.fn();
    const out = await navigateToDestination(page, dest, {}, {
      click: async () => {
        throw new Error('Execution context was destroyed');
      },
      goto,
    });
    expect(goto).not.toHaveBeenCalled();
    expect(out).toMatchObject({ unknown: true });
    expect((out as { note: string }).note).toMatch(/whether that click took effect is unknown .* \[outcome: unknown\]$/);
  });

  it('a click proven not dispatched falls through to the direct navigation', async () => {
    const { page, go } = stubPage();
    const goto = vi.fn(async (to: string) => go(to));
    const out = await navigateToDestination(page, dest, {}, {
      click: async () => {
        throw actionFailure('not-dispatched', 'disabled', 'click NOT dispatched: the control is disabled');
      },
      goto,
    });
    expect(goto).toHaveBeenCalledWith(dest);
    expect(out).toEqual({ used: `goto ${dest}`, note: `navigated to the step's recorded destination instead (${dest})` });
  });

  it('a click that lands is the answer', async () => {
    const { page, go } = stubPage();
    const goto = vi.fn();
    const out = await navigateToDestination(page, dest, {}, { click: async () => go(dest), goto });
    expect(goto).not.toHaveBeenCalled();
    expect(out).toMatchObject({ used: 'click a[href="/record/r7"]' });
  });
});
