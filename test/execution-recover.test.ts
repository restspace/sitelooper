/**
 * The navigation fallback's two rungs (src/execution/recover.ts) against a
 * stubbed page: a substitute link's click whose outcome is unknown must never
 * be followed by the direct navigation — that would be a second commit of
 * whatever the link does (notes/ROBUSTNESS.md finding 2).
 */
import type { Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { actionFailure } from '../src/execution/browser.js';
import { recordedAsNavigation, navigateToDestination, type RecordedStepEvidence } from '../src/execution/recover.js';

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

describe('recordedAsNavigation', () => {
  const LIST = 'http://app.test/tickets';
  const TICKET = 'http://app.test/tickets/15';
  const click = (expect: RecordedStepEvidence['expect'], more: Partial<RecordedStepEvidence> = {}): RecordedStepEvidence => ({ tool: 'click', args: { target: '@e1' }, expect, ...more });

  it('a click the recording shows only moving is navigation', () => {
    expect(recordedAsNavigation([click({ urlPattern: LIST })], 0, TICKET)).toBe(true);
    // what a landing ADDED is not asked here: a link's landing adds lines too
    expect(recordedAsNavigation([click({ urlPattern: LIST, addedContains: ['- heading "Tickets"'] })], 0, TICKET)).toBe(true);
  });

  it('a click that stayed where it was recorded starting is not', () => {
    // Every diffed click carries a url: the one it was on afterwards, moved or not.
    expect(recordedAsNavigation([click({ urlPattern: LIST })], 0, LIST)).toBe(false);
    expect(recordedAsNavigation([click({ urlPattern: LIST }), click({ urlPattern: LIST })], 1, TICKET)).toBe(false);
    expect(recordedAsNavigation([{ tool: 'goto', args: { url: LIST } }, click({ urlPattern: LIST })], 1, TICKET)).toBe(false);
  });

  it('where the step started is read from the nearest earlier step that says', () => {
    const fill: RecordedStepEvidence = { tool: 'fill', args: { target: '@e1', value: 'x' } };
    expect(recordedAsNavigation([click({ urlPattern: TICKET }), fill, click({ urlPattern: LIST })], 2, LIST)).toBe(true);
    expect(recordedAsNavigation([{ tool: 'goto', args: { url: TICKET } }, click({ urlPattern: LIST })], 1, LIST)).toBe(true);
    // a back's landing is on no step: unknown is not "moved"
    expect(recordedAsNavigation([{ tool: 'back', args: {} }, click({ urlPattern: LIST })], 1, TICKET)).toBe(false);
    expect(recordedAsNavigation([click({ urlPattern: LIST })], 0, undefined)).toBe(false);
  });

  it('a click the recording saw do more than move is not', () => {
    const moved = { urlPattern: LIST };
    expect(recordedAsNavigation([click({ ...moved, goneContains: ['- link "{{v1}}"'] })], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click({ ...moved, removedContains: ['- dialog "Delete?"'] })], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click({ ...moved, removalRequired: true })], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click({ ...moved, alertContains: 'Ticket deleted' })], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click(moved, { mints: { at: 'p1' } as never })], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click(moved, { mints: { at: 'q.id', sole: true } as never })], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click(moved, { effect: { kind: 'popup' } })], 0, TICKET)).toBe(false);
  });

  it('a fill or type is looked past: its recorded url keeps only the path', () => {
    // kanboard fwkb47-fr s_7a7c7c: open the comment form, fill it, Save — all on one task page.
    const TASK = 'http://app.test/?controller=TaskViewController&action=show&task_id=:id';
    const open = click({ urlPattern: TASK });
    const fill: RecordedStepEvidence = { tool: 'fill', args: { target: '@e1', value: 'x' }, expect: { urlPattern: 'http://app.test/' } };
    const type: RecordedStepEvidence = { tool: 'type', args: { target: '@e1', text: 'x' }, expect: { urlPattern: 'http://app.test/' } };
    expect(recordedAsNavigation([open, fill, click({ urlPattern: TASK })], 2, LIST)).toBe(false);
    expect(recordedAsNavigation([open, fill, type, click({ urlPattern: TASK })], 3, LIST)).toBe(false);
    // ...back to where the segment starts when nothing else came before
    expect(recordedAsNavigation([fill, click({ urlPattern: TASK })], 1, TASK)).toBe(false);
    expect(recordedAsNavigation([fill, click({ urlPattern: TASK })], 1, LIST)).toBe(true);
  });

  it('a click after a goto is judged against the url the goto was sent to, as a pattern', () => {
    // grafana fwgr91-fr: the goto's literal url and the click's recorded pattern are one page.
    const sent = 'http://app.test/d/abc/board?from=now-6h&to=now&timezone=browser';
    const stayed = 'http://app.test/d/abc/board?from=:id&timezone=browser&to=now';
    const goto: RecordedStepEvidence = { tool: 'goto', args: { url: sent } };
    expect(recordedAsNavigation([goto, click({ urlPattern: stayed })], 1, LIST)).toBe(false);
    expect(recordedAsNavigation([goto, click({ urlPattern: 'http://app.test/d/abc/board/settings' })], 1, LIST)).toBe(true);
    // a record id the pattern reduced is the same page too
    expect(recordedAsNavigation([{ tool: 'goto', args: { url: 'http://app.test/tickets/15' } }, click({ urlPattern: 'http://app.test/tickets/:id' })], 1, LIST)).toBe(false);
  });

  it('a mint that is not sole is url state a navigation filled in, not a record', () => {
    // odoo fwod107-fr s_d3678a/2, menuitem "Contacts": mints { at: 'q.action', sole: false }
    expect(recordedAsNavigation([click({ urlPattern: LIST }, { mints: { at: 'q.action', sole: false } as never })], 0, TICKET)).toBe(true);
    // ...and still nothing else a navigation cannot do
    expect(recordedAsNavigation([click({ urlPattern: LIST, alertContains: 'Saved' }, { mints: { at: 'q.action', sole: false } as never })], 0, TICKET)).toBe(false);
  });

  it('a step with no recorded url, or none at that index, is not', () => {
    expect(recordedAsNavigation([click({})], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click(undefined)], 0, TICKET)).toBe(false);
    expect(recordedAsNavigation([click({ urlPattern: LIST })], -1, TICKET)).toBe(false);
  });
});
