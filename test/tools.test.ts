import { describe, expect, it } from 'vitest';
import { evalMutation, urlHeldStill } from '../src/agent/tools.js';
import { startPageSettled } from '../src/execution/action.js';

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
    // Counted in polls, not milliseconds: a 60ms wall-clock bound failed at
    // 91ms under full-suite load while the function did exactly one check.
    let asked = 0;
    const seen = await urlHeldStill({ url: () => 'http://app/a' }, 'http://app/a', () => (asked++, 0), { ...fast, graceMs: 0 });
    expect(seen).toBe('http://app/a');
    expect(asked).toBe(1);
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

  // The flow's start page (both runners, after waitForContent). fwrd78: a
  // bare entry url routed to `#/tickets`, the app asked the server who was
  // signed in, and only the 401 moved the fresh browser to `#/login` — the
  // artifact read the url in between and refused the sign-in segment.
  it('startPageSettled follows a signed-out redirect the app makes after it painted', async () => {
    let url = 'http://app/#/tickets';
    let pending = 1; // GET /api/me, still out
    setTimeout(() => {
      pending = 0;
      url = 'http://app/#/login';
    }, 150);
    const seen = await startPageSettled({ url: () => url }, () => pending, { stillMs: 100, pollMs: 10 });
    expect(seen).toBe('http://app/#/login');
  });

  it('startPageSettled costs one look on a page with nothing in flight', async () => {
    let asked = 0;
    const seen = await startPageSettled({ url: () => 'http://app/login' }, () => (asked++, 0), { pollMs: 10 });
    expect(seen).toBe('http://app/login');
    expect(asked).toBe(1);
  });

  it('gives up at the deadline when a request never settles', async () => {
    const t0 = Date.now();
    const seen = await urlHeldStill({ url: () => 'http://app/a' }, 'http://app/a', () => 1, fast);
    expect(seen).toBe('http://app/a');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
  });
});

