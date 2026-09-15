import type { Locator, Page } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireWhenAttached, outcomeLabel, outcomeOfError, robustClick, settleDom } from '../src/execution/browser.js';

function clickTarget() {
  const target = {
    click: vi.fn().mockResolvedValue(undefined),
    dblclick: vi.fn().mockResolvedValue(undefined),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    elementHandle: vi.fn().mockResolvedValue(null),
    isDisabled: vi.fn().mockResolvedValue(false),
    isEnabled: vi.fn().mockResolvedValue(false),
  };
  return { target, loc: target as unknown as Locator };
}

describe('shared click dispatch safety', () => {
  it.each([false, true])('never repeats an uncertain action at any tier (double click: %s)', async (dbl) => {
    for (const failedTier of [0, 1, 2]) {
      const { target, loc } = clickTarget();
      const action = dbl ? target.dblclick : target.click;
      const uncertain = new Error('Target page, context or browser has been closed');
      if (failedTier === 0) action.mockRejectedValueOnce(uncertain);
      else {
        action.mockRejectedValueOnce(new Error('Timeout waiting for element to be visible'));
        if (failedTier === 1) action.mockRejectedValueOnce(uncertain);
        else {
          action.mockRejectedValueOnce(new Error('Element is outside of the viewport'));
          target.evaluate.mockRejectedValueOnce(uncertain);
        }
      }
      await expect(robustClick(loc, { timeout: 100, dbl })).rejects.toThrow('outcome UNKNOWN');
      expect(action).toHaveBeenCalledTimes(Math.min(failedTier + 1, 2));
      expect(target.evaluate).toHaveBeenCalledTimes(failedTier === 2 ? 1 : 0);
      expect(target.elementHandle).not.toHaveBeenCalled();
    }
  });

  it.each([0, 1, 2])('does not choose an arbitrary target when ambiguity appears at tier %s', async (failedTier) => {
    const { target, loc } = clickTarget();
    const ambiguity = new Error('strict mode violation: locator resolved to 2 elements');
    if (failedTier === 0) target.click.mockRejectedValueOnce(ambiguity);
    else {
      target.click.mockRejectedValueOnce(new Error('Timeout waiting for visible'));
      if (failedTier === 1) target.click.mockRejectedValueOnce(ambiguity);
      else {
        target.click.mockRejectedValueOnce(new Error('outside of the viewport'));
        target.evaluate.mockRejectedValueOnce(ambiguity);
      }
    }
    await expect(robustClick(loc, { timeout: 100 })).rejects.toBe(ambiguity);
    expect(target.click).toHaveBeenCalledTimes(Math.min(failedTier + 1, 2));
    expect(target.evaluate).toHaveBeenCalledTimes(failedTier === 2 ? 1 : 0);
    expect(target.elementHandle).not.toHaveBeenCalled();
  });

  it('still permits a forced click after an actionability failure', async () => {
    const { target, loc } = clickTarget();
    target.click.mockRejectedValueOnce(new Error('Timeout waiting for element to be visible'));
    await expect(robustClick(loc, { timeout: 100 })).resolves.toContain('forced past actionability');
    expect(target.click).toHaveBeenNthCalledWith(2, { timeout: 100, force: true });
    expect(target.evaluate).not.toHaveBeenCalled();
  });

  /**
   * ROBUSTNESS.md finding 2. A forced click on a disabled button dispatches
   * nothing the app handles, and used to come back "clicked (forced past
   * actionability checks)". A disabled control is now refused before any tier
   * below Playwright's own click, and the message says nothing was dispatched.
   */
  it.each([false, true])('refuses to force or synthesise a click on a disabled control (double click: %s)', async (dbl) => {
    const { target, loc } = clickTarget();
    const action = dbl ? target.dblclick : target.click;
    action.mockRejectedValueOnce(new Error('Timeout 100ms exceeded. waiting for element to be visible, enabled and stable - element is not enabled'));
    target.isDisabled.mockResolvedValue(true);
    await expect(robustClick(loc, { timeout: 100, dbl })).rejects.toThrow(/NOT dispatched: the control is disabled/);
    expect(action).toHaveBeenCalledTimes(1);
    expect(target.evaluate).not.toHaveBeenCalled();
    expect(target.elementHandle).not.toHaveBeenCalled();
  });

  // fwgr39-n3: a control disabled only while the page settles is timing, not a wrong procedure.
  it('waits a bounded time for a disabled control to become enabled, then clicks it the ordinary way', async () => {
    const { target, loc } = clickTarget();
    target.click.mockRejectedValueOnce(new Error('Timeout 100ms exceeded. waiting for element to be visible, enabled and stable - element is not enabled'));
    target.isDisabled.mockResolvedValue(true);
    target.isEnabled.mockResolvedValueOnce(false).mockResolvedValue(true);
    const dispatched = vi.fn();
    await expect(robustClick(loc, { timeout: 1_000, obs: { remaining: () => 1_000, dispatched } })).resolves.toBe('clicked');
    expect(target.click).toHaveBeenCalledTimes(2);
    expect(target.click).toHaveBeenNthCalledWith(2, { timeout: 1_000 });
    expect(dispatched).toHaveBeenCalledWith('actionable');
    expect(target.evaluate).not.toHaveBeenCalled();
  });

  it('refuses a control that stays disabled through the wait, waiting only once', async () => {
    const { target, loc } = clickTarget();
    target.click.mockRejectedValue(new Error('Timeout exceeded - element is not enabled'));
    target.isDisabled.mockResolvedValue(true);
    target.isEnabled.mockResolvedValueOnce(true).mockResolvedValue(false);
    const refused = await robustClick(loc, { timeout: 200 }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ actionOutcome: 'not-dispatched', actionReason: 'disabled' });
    // enabled for a moment, retried once, disabled again: refused without a second wait
    expect(target.click).toHaveBeenCalledTimes(2);
    expect(target.isEnabled).toHaveBeenCalledTimes(1);
  });

  it('the wait for enabled never outlasts the action deadline', async () => {
    const { target, loc } = clickTarget();
    target.click.mockRejectedValueOnce(new Error('Timeout exceeded - element is not enabled'));
    target.isDisabled.mockResolvedValue(true);
    const left = [50, 0];
    const refused = await robustClick(loc, { timeout: 10_000, obs: { remaining: () => left.shift() ?? 0 } }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ actionOutcome: 'not-dispatched', actionReason: 'disabled' });
    expect(target.isEnabled).not.toHaveBeenCalled();
    expect(target.click).toHaveBeenCalledTimes(1);
  });

  it('an ordinary click never asks whether the control is disabled', async () => {
    const { target, loc } = clickTarget();
    await expect(robustClick(loc, { timeout: 100 })).resolves.toBe('clicked');
    expect(target.isDisabled).not.toHaveBeenCalled();
  });

  it('a control whose state cannot be read goes on down the tiers as before', async () => {
    const { target, loc } = clickTarget();
    target.click.mockRejectedValueOnce(new Error('Timeout waiting for element to be visible'));
    target.isDisabled.mockRejectedValue(new Error('Timeout 500ms exceeded'));
    await expect(robustClick(loc, { timeout: 100 })).resolves.toContain('forced past actionability');
  });

  it('stops polling after uncertain dispatch and disposes the handle', async () => {
    const { target, loc } = clickTarget();
    const handle = {
      evaluate: vi.fn().mockRejectedValue(new Error('Execution context was destroyed')),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    target.elementHandle.mockResolvedValue(handle);
    await expect(fireWhenAttached(loc, { timeout: 100 })).rejects.toThrow('outcome UNKNOWN');
    expect(target.elementHandle).toHaveBeenCalledTimes(1);
    expect(handle.evaluate).toHaveBeenCalledTimes(1);
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it('refuses ambiguous handles in the re-render window', async () => {
    const { target, loc } = clickTarget();
    target.elementHandle.mockRejectedValue(new Error('strict mode violation'));
    await expect(fireWhenAttached(loc, { timeout: 100 })).rejects.toThrow('strict mode violation');
    expect(target.elementHandle).toHaveBeenCalledTimes(1);
  });
});

/**
 * ROBUSTNESS.md finding 2: what a click's failure proves travels on the error
 * (`actionOutcome`), with the model-facing words unchanged; and the action's
 * deadline cuts every tier.
 */
describe('click outcomes and the action deadline', () => {
  it('tags each failure with what it proves, keeping its words', async () => {
    const disabled = clickTarget();
    disabled.target.click.mockRejectedValueOnce(new Error('Timeout waiting for element to be enabled'));
    disabled.target.isDisabled.mockResolvedValue(true);
    const refused = await robustClick(disabled.loc, { timeout: 100 }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ actionOutcome: 'not-dispatched', actionReason: 'disabled' });
    expect(outcomeOfError(refused)).toBe('not-dispatched');

    const torn = clickTarget();
    torn.target.click.mockRejectedValueOnce(new Error('Target page, context or browser has been closed'));
    const unknown = await robustClick(torn.loc, { timeout: 100 }).catch((e: unknown) => e);
    expect(unknown).toMatchObject({ actionOutcome: 'unknown', actionReason: 'teardown' });
    expect((unknown as Error).message).toMatch(/^click outcome UNKNOWN: the page was torn down/);

    const ambiguous = clickTarget();
    const strict = new Error('strict mode violation: locator resolved to 2 elements');
    ambiguous.target.click.mockRejectedValueOnce(strict);
    await expect(robustClick(ambiguous.loc, { timeout: 100 })).rejects.toBe(strict);
    expect(strict).toMatchObject({ actionOutcome: 'not-dispatched', actionReason: 'strict' });

    // an error nobody tagged proves nothing: unknown, never "safe to repeat"
    expect(outcomeOfError(new Error('boom'))).toBe('unknown');
    expect(outcomeOfError('boom')).toBe('unknown');
    expect(outcomeLabel('not-dispatched')).toBe('[outcome: not dispatched]');
  });

  it('a window tier that never finds the element proves nothing went out', async () => {
    const { loc } = clickTarget();
    const failure = await fireWhenAttached(loc, { timeout: 60 }).catch((e: unknown) => e);
    expect(failure).toMatchObject({ actionOutcome: 'not-dispatched', actionReason: 'never-attached' });
    expect((failure as Error).message).toMatch(/^target was never attached during 0s of polling/);
  });

  it('cuts every tier to what is left of the deadline, and reports how the click went out', async () => {
    const { target, loc } = clickTarget();
    target.click.mockRejectedValueOnce(new Error('Timeout waiting for element to be visible'));
    const dispatched = vi.fn();
    const left = [40, 25];
    const obs = { remaining: () => left.shift() ?? 0, dispatched };
    await expect(robustClick(loc, { timeout: 10_000, obs })).resolves.toContain('forced past actionability');
    expect(target.click).toHaveBeenNthCalledWith(1, { timeout: 40 });
    expect(target.click).toHaveBeenNthCalledWith(2, { timeout: 25, force: true });
    expect(dispatched).toHaveBeenCalledWith('forced');
  });

  it('a deadline spent before a tier starts is a click never dispatched, and no tier runs', async () => {
    const { target, loc } = clickTarget();
    const spent = await robustClick(loc, { timeout: 10_000, obs: { remaining: () => 0 } }).catch((e: unknown) => e);
    expect(spent).toMatchObject({ actionOutcome: 'not-dispatched', actionReason: 'deadline' });
    expect((spent as Error).message).toMatch(/^click NOT dispatched: the action's deadline ran out/);
    expect(target.click).not.toHaveBeenCalled();

    // after a tier that proved nothing went out, the same
    const late = clickTarget();
    late.target.click.mockRejectedValueOnce(new Error('Timeout 30ms exceeded'));
    const left = [30, 0];
    const after = await robustClick(late.loc, { timeout: 10_000, obs: { remaining: () => left.shift() ?? 0 } }).catch((e: unknown) => e);
    expect(after).toMatchObject({ actionOutcome: 'not-dispatched', actionReason: 'deadline' });
    expect(late.target.click).toHaveBeenCalledTimes(1);
    expect(late.target.evaluate).not.toHaveBeenCalled();
  });
});

describe('shared DOM settling resource lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([false, true])('releases observers and timers when quiet (mutated: %s)', async (mutated) => {
    vi.useFakeTimers();
    let mutation: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('document', {});
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: () => void) { mutation = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const page = {
      evaluate: (callback: (arg: unknown) => Promise<void>, arg: unknown) => callback(arg),
    } as unknown as Page;
    const settling = settleDom(page);
    if (mutated) mutation();
    await vi.advanceTimersByTimeAsync(mutated ? 250 : 60);
    await settling;
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
