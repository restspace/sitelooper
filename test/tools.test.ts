import { describe, expect, it } from 'vitest';
import { evalMutation, urlHeldStill } from '../src/agent/tools.js';

// The eval tool is read-only: a mutation issued through it runs but can never
// be replayed (eval steps carry no locator and are dropped at compile), which
// is how fwgr19 shipped a skill whose dashboard save was silently missing.
describe('evalMutation', () => {
  it('refuses the eval-click that broke the grafana skill, naming what it does', () => {
    const expr = "let dlg = [...document.querySelectorAll('div[role=\"dialog\"]')][0]; let btn = [...dlg.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save'); btn ? btn.click() : 'not found'";
    expect(evalMutation(expr)).toBe('calls .click()');
  });

  it('refuses assignments, synthetic events, navigation and DOM edits', () => {
    expect(evalMutation("document.querySelector('#q').value = 'x'")).toBe('assigns .value');
    expect(evalMutation('el.checked=true')).toBe('assigns .checked');
    expect(evalMutation("el.dispatchEvent(new Event('input'))")).toBe('dispatches a synthetic event');
    expect(evalMutation("location.href = '/foo'")).toBe('assigns location.href');
    expect(evalMutation("history.pushState({}, '', '/x')")).toBe('navigates via history.pushState()');
    expect(evalMutation('form.requestSubmit()')).toBe('calls .requestSubmit()');
    expect(evalMutation("el.setAttribute('aria-hidden','true')")).toBe('edits the DOM with .setAttribute()');
    expect(evalMutation("localStorage.setItem('k','v')")).toBe('writes localStorage');
  });

  it('lets read expressions through — comparisons are not assignments', () => {
    expect(evalMutation('document.title')).toBeNull();
    expect(evalMutation("[...document.querySelectorAll('input')].filter(el => el.value === 'x').map(el => el.value)")).toBeNull();
    expect(evalMutation("[...document.querySelectorAll('button')].map(el => ({ text: el.textContent.trim(), aria: el.getAttribute('aria-label') }))")).toBeNull();
    expect(evalMutation('JSON.stringify({ url: location.href, checked: el.checked == true })')).toBeNull();
    expect(evalMutation("document.querySelector('[role=\"dialog\"]')?.textContent")).toBeNull();
  });
});

describe('urlHeldStill', () => {
  const fast = { lateNavMs: 600, stillMs: 100, graceMs: 40, pollMs: 10 };

  it('returns as soon as a non-navigating click has no request in flight', async () => {
    const t0 = Date.now();
    const seen = await urlHeldStill({ url: () => 'http://app/a' }, 'http://app/a', () => 0, fast);
    expect(seen).toBe('http://app/a');
    expect(Date.now() - t0).toBeLessThan(60);
  });

  it('keeps waiting while a request is in flight, and follows the navigation it brings', async () => {
    let url = 'http://app/a';
    let pending = 1;
    setTimeout(() => {
      url = 'http://app/b';
      pending = 0;
    }, 200);
    const t0 = Date.now();
    const seen = await urlHeldStill({ url: () => url }, 'http://app/a', () => pending, fast);
    expect(seen).toBe('http://app/b');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
  });

  it('gives up at the deadline when a request never settles', async () => {
    const t0 = Date.now();
    const seen = await urlHeldStill({ url: () => 'http://app/a' }, 'http://app/a', () => 1, fast);
    expect(seen).toBe('http://app/a');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
  });
});

