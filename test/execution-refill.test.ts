import type { Locator, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The refill itself is the shared native setter; observed here, not run.
vi.mock('../src/execution/browser.js', () => ({ reactSafeFill: vi.fn() }));

import { reactSafeFill } from '../src/execution/browser.js';
import { noteFill, restoreStandingFills, standingFillRole, type StandingFill } from '../src/execution/refill.js';

/** A field as a locator sees it: how many elements it names, and the value it holds (null: not an input). */
function field(name: string, value: string | null, count = 1) {
  const state = { value, count };
  const loc = {
    toString: () => name,
    count: vi.fn(async () => state.count),
    evaluate: vi.fn(async () => state.value),
  };
  return { state, loc: loc as unknown as Locator };
}

const URL = 'http://app.test/login';
const page = (url = URL) => ({ url: () => url }) as unknown as Page;

beforeEach(() => {
  vi.mocked(reactSafeFill).mockReset();
});

describe('standing fills (fwvk1 n3 01-open)', () => {
  it('refills an input the page emptied, before the click that submits it — once, and without saying the value', async () => {
    const user = field('#username', 'admin');
    const pass = field('#password', 'secret-x1');
    const ledger: StandingFill[] = [];
    noteFill(ledger, user.loc, 'admin', URL);
    noteFill(ledger, pass.loc, 'secret-x1', URL);
    // the form is rebuilt: both empty
    user.state.value = '';
    pass.state.value = '';
    vi.mocked(reactSafeFill).mockImplementation(async (loc: Locator, value: string) => {
      (loc === user.loc ? user : pass).state.value = value;
    });
    const warnings = await restoreStandingFills(page(), ledger, 'click', 'step 3');
    expect(vi.mocked(reactSafeFill).mock.calls).toEqual([
      [user.loc, 'admin'],
      [pass.loc, 'secret-x1'],
    ]);
    expect(warnings).toEqual(['step 3: 2 field(s) this procedure filled were empty again before this click (the page rebuilt its form after the fills were checked) — refilled once']);
    expect(warnings.join(' ')).not.toContain('secret-x1');
    // the click consumed the ledger: a second click refills nothing
    user.state.value = '';
    expect(await restoreStandingFills(page(), ledger, 'click', 'step 4')).toEqual([]);
    expect(reactSafeFill).toHaveBeenCalledTimes(2);
  });

  it('is a no-op while the inputs hold their values', async () => {
    const user = field('#username', 'admin');
    const ledger: StandingFill[] = [];
    noteFill(ledger, user.loc, 'admin', URL);
    expect(await restoreStandingFills(page(), ledger, 'press', 'step 2')).toEqual([]);
    expect(reactSafeFill).not.toHaveBeenCalled();
  });

  it('never overwrites a value the app rewrote, a field on another url, a non-input, or a locator naming several', async () => {
    const phone = field('#phone', '+1 555 0100'); // filled "5550100", formatted by the app
    const other = field('#q', ''); // filled on another page
    const editor = field('.ProseMirror', null); // a recipe-driven editor: no value to compare
    const twice = field('.row input', '', 2);
    const ledger: StandingFill[] = [];
    noteFill(ledger, phone.loc, '5550100', URL);
    noteFill(ledger, other.loc, 'query', 'http://app.test/search');
    noteFill(ledger, editor.loc, 'body', URL);
    noteFill(ledger, twice.loc, 'x', URL);
    expect(await restoreStandingFills(page(), ledger, 'click', 'step 5')).toEqual([]);
    expect(reactSafeFill).not.toHaveBeenCalled();
  });

  it('says so when a refill does not hold, and never throws', async () => {
    const user = field('#username', '');
    const ledger: StandingFill[] = [];
    noteFill(ledger, user.loc, 'admin', URL);
    vi.mocked(reactSafeFill).mockRejectedValueOnce(new Error('detached'));
    expect(await restoreStandingFills(page(), ledger, 'dblclick', 'step 3')).toEqual([
      'step 3: 1 field(s) this procedure filled were empty again before this dblclick (the page rebuilt its form after the fills were checked) — 0 refilled, 1 could not be',
    ]);
  });

  it('a select, a check or a navigation retires the ledger without refilling; a read or a type keeps it', async () => {
    const user = field('#username', '');
    const ledger: StandingFill[] = [];
    noteFill(ledger, user.loc, 'admin', URL);
    for (const tool of ['read', 'type', 'hover', 'wait_for', 'fill']) {
      expect(await restoreStandingFills(page(), ledger, tool, 's')).toEqual([]);
      expect(ledger).toHaveLength(1);
    }
    expect(await restoreStandingFills(page(), ledger, 'select', 's')).toEqual([]);
    expect(ledger).toHaveLength(0);
    expect(reactSafeFill).not.toHaveBeenCalled();
    expect(['click', 'dblclick', 'press'].map(standingFillRole)).toEqual(['submit', 'submit', 'submit']);
    expect(['select', 'check', 'goto', 'back', 'upload', 'drag'].map(standingFillRole).every((r) => r === 'retire')).toBe(true);
  });

  it('keeps one entry per field, the latest value, and nothing for an empty fill', () => {
    const user = field('#username', '');
    const ledger: StandingFill[] = [];
    noteFill(ledger, user.loc, 'first', URL);
    noteFill(ledger, user.loc, 'second', URL);
    noteFill(ledger, field('#x', '').loc, '', URL);
    expect(ledger.map((f) => f.value)).toEqual(['second']);
  });
});
