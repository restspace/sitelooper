import type { Locator, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The refill itself is the shared native setter; observed here, not run.
vi.mock('../src/execution/browser.js', () => ({ reactSafeFill: vi.fn() }));

import { reactSafeFill } from '../src/execution/browser.js';
import {
  noteFill,
  rearmStandingFills,
  restoreStandingFills,
  standingFillRole,
  standingFills,
  standingFillsLost,
  type StandingFills,
} from '../src/execution/refill.js';

/** A field as a locator sees it: how many elements it names, the value it holds (null: not an input), and whether it is built yet. */
function field(name: string, value: string | null, count = 1) {
  const state = { value, count, attached: true };
  const loc = {
    toString: () => name,
    count: vi.fn(async () => (state.attached ? state.count : 0)),
    evaluate: vi.fn(async () => state.value),
    waitFor: vi.fn(async () => {
      if (!state.attached) throw new Error('timeout: not attached');
    }),
  };
  return { state, loc: loc as unknown as Locator };
}

const URL = 'http://app.test/login';
/** A page whose url and current document (performance.timeOrigin) a test moves. */
function fakePage(url = URL) {
  const state = { url, doc: 1000 };
  const page = { url: () => state.url, evaluate: vi.fn(async () => state.doc), waitForLoadState: vi.fn(async () => {}) } as unknown as Page;
  return { state, page };
}

beforeEach(() => {
  vi.mocked(reactSafeFill).mockReset();
});

async function ledgerOf(page: Page, ...fills: [Locator, string][]): Promise<StandingFills> {
  const ledger = standingFills();
  for (const [loc, value] of fills) await noteFill(ledger, loc, value, page);
  return ledger;
}

describe('standing fills (fwvk1 n3 01-open)', () => {
  it('refills an input the page emptied, before the click that submits it — once, and without saying the value', async () => {
    const { page } = fakePage();
    const user = field('#username', 'admin');
    const pass = field('#password', 'secret-x1');
    const ledger = await ledgerOf(page, [user.loc, 'admin'], [pass.loc, 'secret-x1']);
    user.state.value = '';
    pass.state.value = '';
    vi.mocked(reactSafeFill).mockImplementation(async (loc: Locator, value: string) => {
      (loc === user.loc ? user : pass).state.value = value;
    });
    const warnings = await restoreStandingFills(page, ledger, 'click', 'step 3');
    expect(vi.mocked(reactSafeFill).mock.calls).toEqual([
      [user.loc, 'admin'],
      [pass.loc, 'secret-x1'],
    ]);
    expect(warnings).toEqual(['step 3: 2 field(s) this procedure filled were empty again before this click (the page rebuilt its form, or dropped the value when the field lost focus, after the fills were checked) — refilled once']);
    expect(warnings.join(' ')).not.toContain('secret-x1');
    // the click consumed the ledger: a second click refills nothing
    user.state.value = '';
    expect(await restoreStandingFills(page, ledger, 'click', 'step 4')).toEqual([]);
    expect(reactSafeFill).toHaveBeenCalledTimes(2);
  });

  it('is a no-op while the inputs hold their values', async () => {
    const { page } = fakePage();
    const user = field('#username', 'admin');
    const ledger = await ledgerOf(page, [user.loc, 'admin']);
    expect(await restoreStandingFills(page, ledger, 'press', 'step 2')).toEqual([]);
    expect(reactSafeFill).not.toHaveBeenCalled();
  });

  it('never overwrites a value the app rewrote, a field on another url, a non-input, or a locator naming several', async () => {
    const { page } = fakePage();
    const phone = field('#phone', '+1 555 0100'); // filled "5550100", formatted by the app
    const other = field('#q', ''); // filled on another page
    const editor = field('.ProseMirror', null); // a recipe-driven editor: no value to compare
    const twice = field('.row input', '', 2);
    const ledger = await ledgerOf(page, [phone.loc, '5550100'], [editor.loc, 'body'], [twice.loc, 'x']);
    await noteFill(ledger, other.loc, 'query', fakePage('http://app.test/search').page);
    expect(await restoreStandingFills(page, ledger, 'click', 'step 5')).toEqual([]);
    expect(reactSafeFill).not.toHaveBeenCalled();
  });

  it('says so when a refill does not hold, and never throws', async () => {
    const { page } = fakePage();
    const user = field('#username', '');
    const ledger = await ledgerOf(page, [user.loc, 'admin']);
    vi.mocked(reactSafeFill).mockRejectedValueOnce(new Error('detached'));
    expect(await restoreStandingFills(page, ledger, 'dblclick', 'step 3')).toEqual([
      'step 3: 1 field(s) this procedure filled were empty again before this dblclick (the page rebuilt its form, or dropped the value when the field lost focus, after the fills were checked) — 0 refilled, 1 could not be',
    ]);
  });

  it('a select, a check or a navigation retires the ledger without refilling; a read or a type keeps it', async () => {
    const { page } = fakePage();
    const user = field('#username', '');
    const ledger = await ledgerOf(page, [user.loc, 'admin']);
    for (const tool of ['read', 'type', 'hover', 'wait_for', 'fill']) {
      expect(await restoreStandingFills(page, ledger, tool, 's')).toEqual([]);
      expect(ledger.fills).toHaveLength(1);
    }
    expect(await restoreStandingFills(page, ledger, 'select', 's')).toEqual([]);
    expect(ledger.fills).toHaveLength(0);
    expect(reactSafeFill).not.toHaveBeenCalled();
    expect(['click', 'dblclick', 'press'].map(standingFillRole)).toEqual(['submit', 'submit', 'submit']);
    expect(['select', 'check', 'goto', 'back', 'upload', 'drag'].map(standingFillRole).every((r) => r === 'retire')).toBe(true);
  });

  it('keeps one entry per field, the latest value, and nothing for an empty fill', async () => {
    const { page } = fakePage();
    const user = field('#username', '');
    const ledger = await ledgerOf(page, [user.loc, 'first'], [user.loc, 'second'], [field('#x', '').loc, '']);
    expect(ledger.fills.map((f) => f.value)).toEqual(['second']);
  });
});

describe('a replaced document (fwvk2 n2 01-open)', () => {
  it('waits for the fields of a document that replaced the fills’ own, then refills them', async () => {
    const { state, page } = fakePage();
    const user = field('#username', 'admin');
    const ledger = await ledgerOf(page, [user.loc, 'admin']);
    // the service worker reloaded /login: same url, a new document still building its form
    state.doc = 2000;
    user.state.value = '';
    user.state.attached = false;
    vi.mocked(user.loc.waitFor).mockImplementationOnce(async () => {
      user.state.attached = true;
    });
    vi.mocked(reactSafeFill).mockImplementation(async () => {
      user.state.value = 'admin';
    });
    const warnings = await restoreStandingFills(page, ledger, 'click', 'step 3');
    expect(user.loc.waitFor).toHaveBeenCalled();
    expect(reactSafeFill).toHaveBeenCalledWith(user.loc, 'admin');
    expect(warnings).toEqual(['step 3: 1 field(s) this procedure filled were empty again before this click (the page replaced its document after the fills ran) — refilled once']);
  });

  it('a field that is not built yet in the SAME document is left alone, as before', async () => {
    const { page } = fakePage();
    const user = field('#username', 'admin');
    const ledger = await ledgerOf(page, [user.loc, 'admin']);
    user.state.attached = false;
    expect(await restoreStandingFills(page, ledger, 'click', 'step 3')).toEqual([]);
    expect(user.loc.waitFor).not.toHaveBeenCalled();
  });

  it('a submit lost to a replaced document is found, rearmed once, and refilled by the repeated step', async () => {
    const { state, page } = fakePage();
    const user = field('#username', 'admin');
    const pass = field('#password', 'secret-x1');
    const ledger = await ledgerOf(page, [user.loc, 'admin'], [pass.loc, 'secret-x1']);
    expect(await restoreStandingFills(page, ledger, 'click', 'step 3')).toEqual([]);
    // nothing replaced yet: a failed submit is not a lost one
    expect(await standingFillsLost(page, ledger)).toBe(false);
    // the reload lands after the click: same url, new document, empty form
    state.doc = 2000;
    user.state.value = '';
    pass.state.value = '';
    expect(await standingFillsLost(page, ledger)).toBe(true);
    rearmStandingFills(ledger);
    expect(ledger.fills.map((f) => f.value)).toEqual(['admin', 'secret-x1']);
    expect(ledger.submitted).toBeUndefined();
    // ...and the repeated step's own check refills them
    vi.mocked(reactSafeFill).mockImplementation(async (loc: Locator, value: string) => {
      (loc === user.loc ? user : pass).state.value = value;
    });
    expect(await restoreStandingFills(page, ledger, 'click', 'step 3')).toHaveLength(1);
    expect(reactSafeFill).toHaveBeenCalledTimes(2);
  });

  it('a submit that went through is never taken for a lost one', async () => {
    for (const after of ['navigated', 'kept-a-value', 'same-document'] as const) {
      const { state, page } = fakePage();
      const user = field('#username', 'admin');
      const ledger = await ledgerOf(page, [user.loc, 'admin']);
      await restoreStandingFills(page, ledger, 'click', 'step 3');
      if (after !== 'same-document') state.doc = 2000;
      if (after === 'navigated') state.url = 'http://app.test/';
      user.state.value = after === 'kept-a-value' ? 'admin' : '';
      expect(await standingFillsLost(page, ledger), after).toBe(false);
    }
  });
});

describe('a value dropped at blur (fwec2 n1 03-create)', () => {
  it('takes the page’s own formatting of the value as the value, and an empty field as nothing', async () => {
    const { sameValue } = await import('../src/execution/refill.js');
    expect(sameValue('12,500.00', '12500')).toBe(true);
    expect(sameValue('12500', '12500')).toBe(true);
    expect(sameValue('+1 555 0100', '5550100')).toBe(true);
    expect(sameValue('Bench Account', 'bench account')).toBe(true);
    expect(sameValue('', '12500')).toBe(false);
  });
});
