/**
 * The shared gate verdicts (src/execution/gates.ts): one implementation both
 * runners call, so each rule is pinned here once, as a pure function of the
 * observations a runner supplies. The adapters — how the daemon and the
 * emitted artifact WAIT and OBSERVE before asking — are covered by
 * test/execution-lifecycle.test.ts, test/spec-emit.test.ts and the browser
 * parity harness; nothing here touches a page.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SOFT_MATCH_MIN_SIMILARITY,
  alertVerdict,
  describeUrl,
  errorPageVerdict,
  isErrorPageUrl,
  markersBound,
  preconditionVerdict,
  selfNavigationStep,
  urlEffectVerdict,
} from '../src/execution/gates.js';
import { liveAlerts, liveAlertsObserved } from '../src/execution/observe.js';
import { SHADOW_LIMITS, SNAPSHOT_LIMITS, observeDocumentInPage } from '../src/execution/snapshot.js';
import { documentOf } from './fixture/observation.js';
import { flowToSpec, unmeasuredPreconditionDiagnostic } from '../src/spec/ir.js';
import { FINGERPRINT_DIMS, cosine } from '../src/execution/fingerprint.js';
import type { Flow } from '../src/skills/flow.js';
import { SkillStore, type Skill } from '../src/skills/store.js';

describe('errorPageVerdict', () => {
  it('stops on a browser error page and names it', () => {
    expect(errorPageVerdict('chrome-error://chromewebdata/', 'step 3')).toBe(
      'after step 3 the browser is on an error page (chrome-error://chromewebdata/) — the tab crashed or a navigation failed',
    );
    expect(errorPageVerdict('about:neterror?e=dnsNotFound', 'step 3')).toMatch(/^after step 3 the browser is on an error page/);
  });

  it('passes an ordinary page, about:blank included', () => {
    expect(errorPageVerdict('http://app.test/items', 'step 3')).toBeNull();
    expect(errorPageVerdict('about:blank', 'step 3')).toBeNull();
    expect(isErrorPageUrl('http://app.test/chrome-error:')).toBe(false);
  });
});

describe('urlEffectVerdict', () => {
  const p = { v1: '42' };

  it('passes a strict match, with no pattern, and with the query ignored', () => {
    expect(urlEffectVerdict(undefined, 'http://app.test/anything', p, 'step 1')).toEqual({ warnings: [] });
    expect(urlEffectVerdict('http://app.test/items/{{v1}}', 'http://app.test/items/42?tab=1', p, 'step 1')).toEqual({ warnings: [] });
    expect(urlEffectVerdict('http://app.test/items/:id', 'http://app.test/items/other/', p, 'step 1')).toEqual({ warnings: [] });
  });

  it('treats one or two differing literal segments as volatile: warns, continues, hands back the generalisation', () => {
    const one = urlEffectVerdict('http://app.test/d/abc123/home', 'http://app.test/d/xyz789/home', p, 'step 2');
    expect(one.stop).toBeUndefined();
    expect(one.warnings).toEqual(['step 2: url segment(s) differ from recorded (abc123→xyz789) — treated as volatile']);
    expect(one.generalised).toBe('http://app.test/d/:var/home');
    expect(one.diffs).toEqual([{ where: 'path', index: 1, expected: 'abc123', actual: 'xyz789' }]);
    const two = urlEffectVerdict('http://app.test/d/a1/b1', 'http://app.test/d/x2/y2', p, 'step 2');
    expect(two.stop).toBeUndefined();
    expect(two.generalised).toBe('http://app.test/d/:var/:var');
    // the slot is filled before comparing, and stays a marker in the generalisation
    const slotted = urlEffectVerdict('http://app.test/items/{{v1}}/r1', 'http://app.test/items/42/r2', p, 'step 2');
    expect(slotted.generalised).toBe('http://app.test/items/{{v1}}/:var');
  });

  /**
   * ROBUSTNESS.md finding 3: a disagreement alone is not evidence that a value
   * is volatile. A word route is a page the app chose, and a slot the caller
   * filled names a record — neither may be generalised to `:var`.
   */
  it('never treats a differing WORD route, or a differing parameter-filled segment, as volatile', () => {
    const outcome = urlEffectVerdict('http://app.test/orders/success', 'http://app.test/orders/failure', p, 'step 2');
    expect(outcome).toEqual({ warnings: [], stop: 'after step 2 expected url http://app.test/orders/success but browser is at http://app.test/orders/failure' });
    expect(urlEffectVerdict('http://app.test/items/{{v1}}/edit', 'http://app.test/items/42/view', p, 'step 2').stop).toBeDefined();
    // one minted side is not enough: both values must have the shape
    expect(urlEffectVerdict('http://app.test/d/abc123/home', 'http://app.test/d/settings/home', p, 'step 2').stop).toBeDefined();
    // the caller asked for record 42 and the browser is on record 43
    expect(urlEffectVerdict('http://app.test/items/{{v1}}', 'http://app.test/items/43', p, 'step 2').stop).toBe(
      'after step 2 expected url http://app.test/items/42 but browser is at http://app.test/items/43',
    );
    expect(urlEffectVerdict('http://app.test/web#id={{v1}}&model=x', 'http://app.test/web#id=43&model=x', p, 'step 2').stop).toBeDefined();
    // a bound derived value is a record this run already named
    expect(urlEffectVerdict('http://app.test/items/{{d1}}', 'http://app.test/items/43', { d1: '42' }, 'step 2').stop).toBeDefined();
    // and the precondition gate reads the same rule
    expect(preconditionVerdict('http://app.test/orders/success', 'http://app.test/orders/failure', {}, null).refuse).toBeDefined();
  });

  /** ROBUSTNESS.md finding 3, the query half: the query is part of which page it is. */
  it('judges the query on the keys both urls carry, and requires a key filled from a bound value', () => {
    // the finding's own probe: a caller-named record in the query
    expect(urlEffectVerdict('https://app.test/edit?id={{v1}}', 'https://app.test/edit?id=999', { v1: '123' }, 'step 2').stop).toBe(
      'after step 2 expected url https://app.test/edit?id=123 but browser is at https://app.test/edit?id=999',
    );
    expect(urlEffectVerdict('https://app.test/edit?id={{v1}}', 'https://app.test/edit?id=123', { v1: '123' }, 'step 2')).toEqual({ warnings: [] });
    // a bound key missing from the live url is not that record
    expect(urlEffectVerdict('https://app.test/edit?id={{v1}}', 'https://app.test/edit', { v1: '123' }, 'step 2').stop).toBeDefined();
    // word values are routes (kanboard's controller/action), minted ones stay soft
    expect(urlEffectVerdict('http://app.test/?action=show&controller=Task', 'http://app.test/?action=edit&controller=Task', p, 'step 2').stop).toBeDefined();
    expect(preconditionVerdict('http://app.test/done?status=success', 'http://app.test/done?status=failure', {}, null).refuse).toBeDefined();
    const minted = urlEffectVerdict('http://app.test/d?uid=afw6yy5xx9', 'http://app.test/d?uid=bfx5j0ewyy', p, 'step 2');
    expect(minted.stop).toBeUndefined();
    expect(minted.generalised).toBe('http://app.test/d?uid=:var');
    // a literal key only one side carries is not a different page: grafana adds
    // and drops `refresh=1m` on one dashboard, and a stored pattern from before
    // the query was modelled carries none at all
    expect(urlEffectVerdict('http://app.test/d/:id?from=now-6h&refresh=1m', 'http://app.test/d/x1?from=now-6h&timezone=browser', p, 'step 2')).toEqual({ warnings: [] });
    expect(urlEffectVerdict('http://app.test/edit', 'http://app.test/edit?id=999', p, 'step 2')).toEqual({ warnings: [] });
    // wildcards and noise keys
    expect(urlEffectVerdict('http://app.test/list?page=:id', 'http://app.test/list?page=7&utm_source=mail', p, 'step 2')).toEqual({ warnings: [] });
  });

  it('stops on a different page shape, or on three differing segments', () => {
    expect(urlEffectVerdict('http://app.test/items/{{v1}}', 'http://app.test/', p, 'step 3')).toEqual({
      warnings: [],
      stop: 'after step 3 expected url http://app.test/items/42 but browser is at http://app.test/',
    });
    // The live url is described by its SHAPE: the message travels into a
    // recovery prompt and onto the persisted run record, and a query string or
    // free-form fragment is where a session token lives.
    expect(urlEffectVerdict('http://app.test/items/{{v1}}', 'http://app.test/login?token=s3cret&next=%2Fitems#', p, 'step 3').stop).toBe(
      'after step 3 expected url http://app.test/items/42 but browser is at http://app.test/login',
    );
    // Only the query keys the pattern names are shown, a credential masked.
    expect(urlEffectVerdict('http://app.test/done?status=success&token=:var', 'http://app.test/done?status=failure&token=s3cret&sid=abc', p, 'step 3').stop).toBe(
      'after step 3 expected url http://app.test/done?status=success&token=:var but browser is at http://app.test/done?status=failure&token=***',
    );
    expect(urlEffectVerdict('http://app.test/a/b/c', 'http://app.test/x/y/z', p, 'step 3').stop).toMatch(/^after step 3 expected url/);
    // a hash ROUTE the pattern does not name is a different page
    expect(urlEffectVerdict('http://app.test/items', 'http://app.test/items#/detail', p, 'step 3').stop).toBeDefined();
  });

  it('compares a query-shaped hash as unordered state, extra live pairs allowed', () => {
    const pattern = 'http://app.test/web#action=:id&cids=1&menu_id={{v1}}';
    expect(urlEffectVerdict(pattern, 'http://app.test/web#menu_id=42&model=x&action=9&cids=1', p, 's')).toEqual({ warnings: [] });
    expect(urlEffectVerdict(pattern, 'http://app.test/web#action=9&cids=2&menu_id=42', p, 's')).toMatchObject({ generalised: 'http://app.test/web#action=:id&cids=:var&menu_id={{v1}}' });
  });
});

describe('alertVerdict', () => {
  const ctx = { where: 'step 4', isRead: false, params: { v1: '3' } };

  it('stops a state-changing step on an alert the recording never saw', () => {
    expect(alertVerdict([], ['Ticket is not ready to be closed'], ctx)).toEqual({
      warnings: [],
      stop: 'step 4 raised an alert the recording never saw: Ticket is not ready to be closed',
    });
    // several, joined; only the NEW ones count
    const out = alertVerdict(['Welcome back'], ['Welcome back', 'Rejected', 'Try again'], ctx);
    expect(out.stop).toBe('step 4 raised an alert the recording never saw: Rejected | Try again');
    // an explicit false is no confirmation either
    expect(alertVerdict([], ['Rejected'], { ...ctx, effectConfirmed: false }).stop).toBe('step 4 raised an alert the recording never saw: Rejected');
  });

  it('reports, and does not stop on, an unrecorded alert when the step\'s recorded page changes confirmed it worked', () => {
    // fwgr34: the home page a Skip landed on rendered "Error loading RSS feed"
    // after the recording's own after-look; the step's recorded links appeared.
    expect(alertVerdict([], ['Error loading RSS feed'], { ...ctx, effectConfirmed: true })).toEqual({
      warnings: ["step 4 raised an alert the recording never saw: Error loading RSS feed — reported, not stopped: the step's recorded page changes appeared"],
    });
    // an incomplete after-look changes nothing about an alert that WAS seen
    expect(alertVerdict([], ['Error loading RSS feed'], { ...ctx, effectConfirmed: true }, false).stop).toBeUndefined();
  });

  it('passes when nothing new appeared, and never stops a read', () => {
    expect(alertVerdict([], [], ctx)).toEqual({ warnings: [] });
    expect(alertVerdict(['Saved'], ['Saved'], ctx)).toEqual({ warnings: [] });
    expect(alertVerdict([], ['Rejected'], { ...ctx, isRead: true })).toEqual({ warnings: [] });
  });

  it('checks a recorded alert softly: present passes, missing only warns, and it never stops', () => {
    const want = { ...ctx, expectedContains: 'Saved {{v1}} items' };
    expect(alertVerdict([], ['Saved 3 items successfully'], want)).toEqual({ warnings: [] });
    expect(alertVerdict([], [], want)).toEqual({ warnings: ['step 4: expected alert containing "Saved 3 items"'] });
    // a different alert than the one recorded is NOT an unrecorded one: the
    // recording expected an alert here, so the app talking is expected too
    const other = alertVerdict([], ['Something else'], want);
    expect(other.stop).toBeUndefined();
    expect(other.warnings).toEqual(['step 4: expected alert containing "Saved 3 items"']);
  });

  it('reports an unobservable page as unobserved, not as clear', () => {
    expect(alertVerdict([], null, ctx)).toEqual({
      warnings: ['step 4: the page could not be captured after the action — whether it raised an alert is unknown, not clear'],
      unobserved: true,
    });
    expect(alertVerdict([], null, { ...ctx, expectedContains: 'Saved' })).toEqual({
      warnings: [
        'step 4: the page could not be captured after the action — whether it raised an alert is unknown, not clear',
        'step 4: expected alert containing "Saved" could not be observed',
      ],
      unobserved: true,
    });
    // a read with nothing expected has nothing to observe
    expect(alertVerdict([], null, { ...ctx, isRead: true })).toEqual({ warnings: [] });
    expect(alertVerdict([], null, { ...ctx, isRead: true, expectedContains: 'Saved' })).toEqual({
      warnings: ['step 4: expected alert containing "Saved" could not be observed'],
      unobserved: true,
    });
  });

  it('is asked over the same live-region capture the daemon takes', async () => {
    // The observation IS the daemon's own capture (observeDocumentInPage under
    // SNAPSHOT_LIMITS, the shared snapshot module the daemon's diff is built
    // on): liveAlerts is its alerts half, not a second selector and second set
    // of caps kept in step by a test. One page function, one limits object.
    const observe = fs.readFileSync(path.resolve('src/execution/observe.ts'), 'utf8');
    expect(observe).not.toContain('role=alert');
    expect(observe).not.toMatch(/MAX_ALERT|ALERT_SELECTOR/);
    const asked: unknown[] = [];
    const page = {
      evaluate: async (fn: unknown, arg: unknown) => {
        asked.push(fn, arg);
        return documentOf(['- button "Save"'], ['Saved 3 items']);
      },
    } as unknown as import('playwright-core').Page;
    expect(await liveAlerts(page)).toEqual(['Saved 3 items']);
    expect(asked).toEqual([observeDocumentInPage, { ...SNAPSHOT_LIMITS, ...SHADOW_LIMITS, legacy: true }]);
    // and a page that cannot be read is unobserved, never "no alert"
    const gone = { evaluate: async () => { throw new Error('Execution context was destroyed'); } } as unknown as import('playwright-core').Page;
    expect(await liveAlerts(gone)).toBeNull();
    const odd = { evaluate: async () => 'not a capture' } as unknown as import('playwright-core').Page;
    expect(await liveAlerts(odd)).toBeNull();
    // with its coverage: a look past the alert cap did not see every live region
    const capped = { evaluate: async () => documentOf([], ['A', 'B', 'C', 'D', 'E'], { alertsTruncated: true }) } as unknown as import('playwright-core').Page;
    expect(await liveAlertsObserved(capped)).toEqual({ alerts: ['A', 'B', 'C', 'D', 'E'], complete: false });
    expect(await liveAlertsObserved(page)).toEqual({ alerts: ['Saved 3 items'], complete: true });
    expect(await liveAlertsObserved(gone)).toBeNull();
  });

  /**
   * An after-look that did not see every live region (the cap, an unread
   * frame) cannot say "nothing new was raised" or "the recorded alert is
   * missing". An alert it DID see is still evidence and still stops.
   */
  it('reads an incomplete after-look as unobserved, and still stops on an alert it saw', () => {
    expect(alertVerdict([], [], ctx, false)).toEqual({
      warnings: ["step 4: the page's alerts could not be observed in full after the action — whether it raised an alert is unknown, not clear"],
      unobserved: true,
    });
    expect(alertVerdict([], ['Rejected'], ctx, false).stop).toBe('step 4 raised an alert the recording never saw: Rejected');
    const want = { ...ctx, expectedContains: 'Saved' };
    expect(alertVerdict([], ['Saved it'], want, false)).toEqual({ warnings: [] });
    expect(alertVerdict([], ['Other'], want, false)).toEqual({
      warnings: ['step 4: expected alert containing "Saved" could not be observed in full'],
      unobserved: true,
    });
    // a read expecting nothing has nothing to miss
    expect(alertVerdict([], [], { ...ctx, isRead: true }, false)).toEqual({ warnings: [] });
    // and a complete look is today's verdict, unchanged
    expect(alertVerdict([], [], ctx, true)).toEqual({ warnings: [] });
  });
});

describe('describeUrl', () => {
  it('keeps the origin, path and hash route, and drops the query and a free-form fragment', () => {
    expect(describeUrl('http://app.test/items/42?tab=1&token=s3cret')).toBe('http://app.test/items/42');
    expect(describeUrl('http://app.test/#/orders/7?x=1')).toBe('http://app.test/#/orders/7');
    expect(describeUrl('http://app.test/login#error')).toBe('http://app.test/login#error');
    // A query-shaped hash is an SPA's route STATE (odoo's `#action=9&id=44`)
    // and is part of the shape, so it stays — the same choice urlShapeOf makes
    // for matching. The query string and everything after it never travel.
    expect(describeUrl('http://app.test/web?debug=1#action=9&cids=1')).toBe('http://app.test/web#action=9&cids=1');
    expect(describeUrl('not a url')).toBe('not a url');
    // Judged against a pattern, the query keys it names stay, a credential masked.
    expect(describeUrl('http://app.test/items/42?tab=1&token=s3cret&x=2', 'http://app.test/items/:id?tab=1&token=:var')).toBe('http://app.test/items/42?tab=1&token=***');
  });

  it('keeps a state fragment’s routing keys but masks the value of a credential key', () => {
    // An OAuth implicit-flow callback lands with the token in the fragment.
    const described = describeUrl('http://app.test/callback#access_token=eyJhbGci.s3cret&token_type=bearer&expires_in=3600&state=xyz');
    expect(described).not.toContain('eyJhbGci');
    expect(described).toBe('http://app.test/callback#access_token=***&expires_in=3600&state=xyz&token_type=***');
    expect(describeUrl('http://app.test/#id_token=abc.def&code=4/0Aa&session_state=q1')).toBe('http://app.test/#code=***&id_token=***&session_state=***');
    // Routing state is untouched.
    expect(describeUrl('http://app.test/web#action=9&menu_id=3&cids=1')).toBe('http://app.test/web#action=9&cids=1&menu_id=3');
  });
});

describe('selfNavigationStep', () => {
  const steps = (...tools: string[]) => tools.map((tool) => ({ tool }));
  it('finds the goto a segment opens with, past steps that only look', () => {
    expect(selfNavigationStep(steps('goto', 'fill'))).toBe(1);
    // fwrd51 s_b1a0cd, recorded from about:blank
    expect(selfNavigationStep(steps('wait_for', 'read', 'goto', 'fill'))).toBe(3);
  });
  it('is 0 when anything that acts comes before the goto, or there is none', () => {
    expect(selfNavigationStep(steps('click', 'goto'))).toBe(0);
    expect(selfNavigationStep(steps('wait_for', 'fill', 'goto'))).toBe(0);
    expect(selfNavigationStep(steps('read', 'click'))).toBe(0);
    expect(selfNavigationStep([])).toBe(0);
  });
});

describe('preconditionVerdict', () => {
  it('passes a strict match, slots filled', () => {
    expect(preconditionVerdict('http://app.test/items/{{v1}}', 'http://app.test/items/7', { v1: '7' }, null)).toEqual({ warnings: [] });
    expect(preconditionVerdict('http://app.test/items/{{v1}}', 'http://app.test/items/7', { v1: '7' }, 0.1)).toEqual({ warnings: [] });
  });

  it('proceeds optimistically on a soft match with no fingerprint, warning and generalising', () => {
    const out = preconditionVerdict('http://app.test/d/abc1/home', 'http://app.test/d/xyz2/home', {}, null);
    expect(out.refuse).toBeUndefined();
    expect(out.warnings).toEqual(['start url differs from the recorded pattern in 1 segment(s) (abc1→xyz2) — proceeding optimistically']);
    expect(out.soft).toEqual({ generalised: 'http://app.test/d/:var/home', diffs: [{ where: 'path', index: 1, expected: 'abc1', actual: 'xyz2' }] });
  });

  it('lets the fingerprint decide a soft match: close proceeds, far refuses with the similarity named', () => {
    const close = preconditionVerdict('http://app.test/d/abc1/home', 'http://app.test/d/xyz2/home', {}, SOFT_MATCH_MIN_SIMILARITY);
    expect(close.refuse).toBeUndefined();
    expect(close.soft?.generalised).toBe('http://app.test/d/:var/home');
    const far = preconditionVerdict('http://app.test/d/abc1/home', 'http://app.test/d/xyz2/home', {}, 0.57);
    expect(far.soft).toBeUndefined();
    expect(far.warnings).toEqual([]);
    expect(far.refuse).toBe(
      'not on the page this procedure starts from (expects http://app.test/d/abc1/home, browser is at http://app.test/d/xyz2/home; the url shape is close but the page structure is not — similarity 0.57)',
    );
  });

  it('checks a query key a strict match took on trust against the fingerprint (fwgr36 04-open)', () => {
    const pattern = 'http://app.test/d/{{v3}}/board?editview=json-model&from=:id&to=now';
    const live = 'http://app.test/d/cfy9/board?from=now-6h&to=now';
    // the recorded JSON editor against the plain dashboard: another view
    const far = preconditionVerdict(pattern, live, { v3: 'cfy9' }, 0.252);
    expect(far.refuse).toBe(
      'not on the page this procedure starts from (expects http://app.test/d/cfy9/board?editview=json-model&from=:id&to=now, browser is at http://app.test/d/cfy9/board?from=now-6h&to=now; the urls differ only in query key(s) editview, and the page structure is not the recorded one — similarity 0.252, so this is another view of the page)',
    );
    // the same page drifting a key (grafana's refresh=1m) measures close and passes
    expect(preconditionVerdict('http://app.test/d/cfy9/board?to=now', 'http://app.test/d/cfy9/board?refresh=1m&to=now', {}, 0.97)).toEqual({ warnings: [] });
    // nothing measured, or nothing taken on trust: the strict match stands
    expect(preconditionVerdict(pattern, live, { v3: 'cfy9' }, null)).toEqual({ warnings: [] });
    expect(preconditionVerdict(pattern, live, { v3: 'cfy9' }, 'unmeasured')).toEqual({ warnings: [] });
    expect(preconditionVerdict('http://app.test/d/cfy9/board?to=now', 'http://app.test/d/cfy9/board?to=now', {}, 0.1)).toEqual({ warnings: [] });
  });

  it('refuses a different page shape however close the fingerprint', () => {
    const out = preconditionVerdict('http://app.test/items/{{v1}}', 'http://app.test/', { v1: '7' }, 1);
    expect(out).toEqual({
      warnings: [],
      refuse: 'not on the page this procedure starts from (expects http://app.test/items/7, browser is at http://app.test/)',
    });
    // the live url is described by its shape: no query, no session token
    expect(preconditionVerdict('http://app.test/items/{{v1}}', 'http://app.test/?token=s3cret', { v1: '7' }, null).refuse).toBe(
      'not on the page this procedure starts from (expects http://app.test/items/7, browser is at http://app.test/)',
    );
  });

  /**
   * The three things a caller can know about the fingerprint, and what each
   * does to a SOFT match (a strict match passes under all three):
   *  - measured: the similarity decides (above);
   *  - null, no fingerprint recorded: the url alone decides, and a soft match
   *    proceeds — the daemon's behaviour for a skill that never kept one;
   *  - 'unmeasured', a fingerprint recorded that this runner cannot measure:
   *    refuse. The daemon would consult it here; a runner that cannot must
   *    not proceed on less evidence than the daemon requires. This is the
   *    compiled artifact's case, and the direction matters: the artifact is
   *    stricter, never looser, than the daemon at a segment start.
   */
  it("refuses a soft match it cannot measure, where a recorded fingerprint would have decided ('unmeasured')", () => {
    const pattern = 'http://app.test/d/abc1/home';
    const soft = 'http://app.test/d/xyz2/home';
    expect(preconditionVerdict(pattern, pattern, {}, 'unmeasured')).toEqual({ warnings: [] });
    expect(preconditionVerdict(pattern, soft, {}, null).refuse).toBeUndefined();
    const out = preconditionVerdict(pattern, soft, {}, 'unmeasured');
    expect(out.soft).toBeUndefined();
    expect(out.warnings).toEqual([]);
    expect(out.refuse).toBe(
      'not on the page this procedure starts from (expects http://app.test/d/abc1/home, browser is at http://app.test/d/xyz2/home; ' +
        'the url shape is close, but the recording fingerprinted this page and this runner cannot measure the live page against it — only a strict url match can pass here)',
    );
    // a different page shape reads the same under every state
    for (const similarity of [null, 'unmeasured', 1] as const) {
      expect(preconditionVerdict(pattern, 'http://app.test/', {}, similarity).refuse).toBe(
        'not on the page this procedure starts from (expects http://app.test/d/abc1/home, browser is at http://app.test/)',
      );
    }
  });
});

describe('markersBound', () => {
  it('is bound when every slot has a nonempty value and something is left to match', () => {
    expect(markersBound(['{{v1}}', 'Order {{d1}}', 'Cancelled'], { v1: 'S00021', d1: '17' })).toBe(true);
    expect(markersBound([], {})).toBe(true);
  });

  it('refuses a marker still reading as a slot', () => {
    expect(markersBound(['{{v1}}', '{{v3}}'], { v1: 'S00021' })).toBe(false);
  });

  it("refuses a slot bound to '' — `Order {{d1}}` rendered as `Order ` is every order", () => {
    expect(markersBound(['Order {{d1}}'], { d1: '' })).toBe(false);
    expect(markersBound(['{{v1}}'], { v1: '' })).toBe(false);
  });

  it('refuses an empty or whitespace marker', () => {
    expect(markersBound([''], {})).toBe(false);
    expect(markersBound(['  '], {})).toBe(false);
  });
});

describe('the page fingerprint at compile, and the unmeasured-precondition diagnostic', () => {
  const skillOf = (id: string, over: Partial<Skill> = {}): Skill => ({
    id,
    origin: 'http://app.test',
    template: 'do the thing',
    params: {},
    preconditions: { urlPattern: 'http://app.test/items' },
    steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#b' }] } }],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 't', instruction: 'do the thing', created: 't' },
    ...over,
  });
  const flowOf = (skill: string): Flow => ({
    name: 'fp',
    origin: 'http://app.test',
    startUrl: 'http://app.test/',
    vars: [],
    steps: [{ id: '01-do', instruction: 'do the thing', skill, params: {}, outputs: [], recorded: {} }],
    provenance: { session: 't', created: 't' },
  });

  const vector = (seed: number): number[] => Array.from({ length: FINGERPRINT_DIMS }, (_, i) => ((i * seed) % 7 === 0 ? 0.125 : 0));

  it('is no longer raised at compile: the segment carries the vector, and the artifact measures it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-gates-'));
    try {
      const store = new SkillStore(dir);
      const recorded = vector(3);
      store.put(skillOf('s_fp', { preconditions: { urlPattern: 'http://app.test/items', fingerprint: recorded } }));
      store.put(skillOf('s_plain'));
      // A vector replay can never compare (cosine of unequal lengths is null,
      // so its url alone decides): not carried, and the artifact's null agrees.
      store.put(skillOf('s_short', { preconditions: { urlPattern: 'http://app.test/items', fingerprint: [1, 2, 3] } }));

      const fp = flowToSpec(flowOf('s_fp'), store, { flowFile: 'fp.json' });
      expect(fp.diagnostics.filter((d) => d.code === 'unmeasured-precondition')).toEqual([]);
      expect(fp.warnings.filter((w) => w.includes('soft-match'))).toEqual([]);
      // the IR carries the vector, verbatim — never rounded again
      expect(fp.spec.steps[0].segments[0].preconditions).toEqual({ urlPattern: 'http://app.test/items', fingerprint: recorded });
      expect(fp.spec.steps[0].segments[0].preconditions.fingerprinted).toBeUndefined();

      const plain = flowToSpec(flowOf('s_plain'), store, { flowFile: 'fp.json' });
      expect(plain.spec.steps[0].segments[0].preconditions).toEqual({ urlPattern: 'http://app.test/items' });

      const short = flowToSpec(flowOf('s_short'), store, { flowFile: 'fp.json' });
      expect(short.spec.steps[0].segments[0].preconditions).toEqual({ urlPattern: 'http://app.test/items' });
      expect(cosine([1, 2, 3], recorded)).toBeNull();
      expect(short.diagnostics.filter((d) => d.code === 'unmeasured-precondition')).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is said for a segment of an old file that carries only the flag, and says to recompile', () => {
    expect(unmeasuredPreconditionDiagnostic('01-do', 's_fp')).toEqual(
      expect.objectContaining({
        code: 'unmeasured-precondition',
        step: '01-do',
        severity: 'warning',
        what: 'segment s_fp enforces its url precondition without the page-fingerprint soft-match replay applies',
        line: '01-do: segment s_fp enforces its url precondition without the page-fingerprint soft-match (this file predates carried fingerprints and has no vector to measure against) — recompile it with `sitelooper compile`',
      }),
    );
    expect(unmeasuredPreconditionDiagnostic('01-do', 's_fp').fix).toMatch(/recompile/);
  });
});
