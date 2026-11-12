import { describe, expect, it } from 'vitest';
import type { Locator } from 'playwright-core';
import { roleName, sameAccessibleName, withoutShortcutHint } from '../src/execution/text.js';
import { positionalHitNamed } from '../src/execution/positional.js';
import { HOVER_PROBE_MS, syntheticHover } from '../src/execution/browser.js';

// fwgh22-fc 04-set: hovering a button made the app append its shortcut hint to
// the button's accessible name ("Publish" -> "Publish ⌘ ⇧ P").

describe('keyboard-shortcut hint is not part of a name', () => {
  it('agrees across a trailing hint, in either direction', () => {
    expect(sameAccessibleName('Publish', 'Publish ⌘ ⇧ P')).toBe(true);
    expect(sameAccessibleName('Publish ⌘ ⇧ P', 'Publish')).toBe(true);
    expect(sameAccessibleName('Save', 'Save Ctrl+S')).toBe(true);
    expect(sameAccessibleName('Save', 'Save Ctrl + Shift + S')).toBe(true);
    expect(sameAccessibleName('Find', 'Find ⌘F')).toBe(true);
    expect(sameAccessibleName('Send', 'Send ⏎')).toBe(true);
    expect(sameAccessibleName('Help', 'Help Cmd+/')).toBe(true);
  });

  it('never forgives another word or a bare key', () => {
    expect(sameAccessibleName('Save', 'Save As')).toBe(false);
    expect(sameAccessibleName('Delete', 'Delete P')).toBe(false);
    expect(sameAccessibleName('Night', 'Night Shift')).toBe(false);
    expect(sameAccessibleName('Find', 'Find F3')).toBe(false);
    expect(sameAccessibleName('Publish', 'Unpublish ⌘ ⇧ P')).toBe(false);
    expect(sameAccessibleName('Edit', 'Exit edit')).toBe(false);
  });

  it('keeps a name that is nothing but a hint', () => {
    expect(withoutShortcutHint('Ctrl+S')).toBe('Ctrl+S');
    expect(withoutShortcutHint('⌘ K')).toBe('⌘ K');
    expect(withoutShortcutHint('Publish ⌘ ⇧ P')).toBe('Publish');
  });

  it('roleName matches the name with and without a hint, and nothing wider', () => {
    for (const recorded of ['Publish', 'Publish ⌘ ⇧ P']) {
      const re = roleName(recorded);
      expect(re.test('Publish')).toBe(true);
      expect(re.test('Publish ⌘ ⇧ P')).toBe(true);
      expect(re.test('Publish ')).toBe(true);
      expect(re.test('Publish P')).toBe(false);
      expect(re.test('Publish now')).toBe(false);
      expect(re.test('Unpublish')).toBe(false);
    }
    expect(roleName('Save').test('Save As')).toBe(false);
    expect(roleName('Delete').test('Delete P')).toBe(false);
  });
});

/** A Locator stand-in whose aria snapshot head is `head`. */
function named(head: string): Locator {
  const self = {
    first: () => self,
    ariaSnapshot: async () => head,
    innerText: async () => '',
  };
  return self as unknown as Locator;
}

describe('positional fallback name check', () => {
  it('accepts the recorded button without its hovered hint (s_addeae step 8)', async () => {
    expect(await positionalHitNamed(named('- button "Publish"'), { by: 'role', role: 'button', name: 'Publish ⌘ ⇧ P' })).toBe(true);
  });
  it('still refuses another name', async () => {
    expect(await positionalHitNamed(named('- button "Delete P"'), { by: 'role', role: 'button', name: 'Delete' })).toBe(false);
    expect(await positionalHitNamed(named('- button "Save As"'), { by: 'role', role: 'button', name: 'Save' })).toBe(false);
  });
});

/** A Locator stand-in: the real hover succeeds or not; evaluate fails after recording the timeout it was given. */
function hoverable(realHover: boolean, evaluateFails: boolean): { loc: Locator; timeouts: number[] } {
  const timeouts: number[] = [];
  const loc = {
    hover: async () => {
      if (!realHover) throw new Error('hover: not actionable');
    },
    evaluate: async (_fn: unknown, _arg: unknown, opts: { timeout: number }) => {
      timeouts.push(opts.timeout);
      if (evaluateFails) throw new Error('locator.evaluate: Timeout exceeded.');
    },
  };
  return { loc: loc as unknown as Locator, timeouts };
}

describe('syntheticHover', () => {
  it('a real hover that landed is not failed by its synthetic supplement, which is bounded by the probe (s_947181 step 8)', async () => {
    const { loc, timeouts } = hoverable(true, true);
    await expect(syntheticHover(loc)).resolves.toBeUndefined();
    expect(timeouts).toEqual([HOVER_PROBE_MS]);
  });
  it('when the real hover did not land, the synthetic events are the hover and still fail the step', async () => {
    const { loc, timeouts } = hoverable(false, true);
    await expect(syntheticHover(loc)).rejects.toThrow(/Timeout/);
    expect(timeouts[0]).toBeGreaterThan(HOVER_PROBE_MS);
  });
  it('when the real hover did not land, the synthetic events alone succeed', async () => {
    const { loc } = hoverable(false, false);
    await expect(syntheticHover(loc)).resolves.toBeUndefined();
  });
});
