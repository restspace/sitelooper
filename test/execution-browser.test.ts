import type { Locator, Page } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireWhenAttached, robustClick, settleDom } from '../src/execution/browser.js';

function clickTarget() {
  const target = {
    click: vi.fn().mockResolvedValue(undefined),
    dblclick: vi.fn().mockResolvedValue(undefined),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    elementHandle: vi.fn().mockResolvedValue(null),
    isDisabled: vi.fn().mockResolvedValue(false),
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
