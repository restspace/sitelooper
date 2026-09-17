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
  dependsOnPage,
  describeUrl,
  IDENTITY_POLL_MS,
  IDENTITY_WAIT_MS,
  errorPageVerdict,
  gotoLandingVerdict,
  identityMarkerVerdict,
  isErrorPageUrl,
  landedOnRecordedPage,
  markersBound,
  preconditionVerdict,
  retargetNavigation,
  segmentGate,
  shownPattern,
  fillableChain,
  unfilledSlots,
  unfilledStepVerdict,
  unresolvedArgMarkers,
  urlEffectVerdict,
  urlRecordParts,
} from '../src/execution/gates.js';
import { liveAlerts, liveAlertsObserved } from '../src/execution/observe.js';
import { SHADOW_LIMITS, SNAPSHOT_LIMITS, observeDocumentInPage } from '../src/execution/snapshot.js';
import { documentOf } from './fixture/observation.js';
import { flowToSpec, unmeasuredPreconditionDiagnostic } from '../src/spec/ir.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
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

/**
 * fwod51 07-verify: the url gate correctly refused a click that had overshot
 * the contact form onto a sales-order list, and said "expected url
 * …&id={{d3}}&…" — the literal text of a marker no page ever shows. A correct
 * refusal read as a broken gate in the drift ticket, the flowrun and the
 * compile diagnostic. An unfilled marker IS a wildcard to the matcher, so the
 * verdict now says so, and says nothing else different.
 */
describe('a verdict shows what it actually compared (fwod51)', () => {
  it('fills what the run bound and renders what it did not as the wildcard the matcher treats it as', () => {
    expect(shownPattern('http://app.test/items/{{v1}}', { v1: '42' })).toBe('http://app.test/items/42');
    expect(shownPattern('http://app.test/items/{{v1}}', {})).toBe('http://app.test/items/:var');
    expect(shownPattern('http://app.test/web#id={{d3}}&cids=:id', {})).toBe('http://app.test/web#id=:id&cids=:id');
    // Display shows what fillParams did, empty included — what the MATCHER
    // makes of an empty value is urlDiff's business, not this function's.
    expect(shownPattern('http://app.test/items/{{d1}}', { d1: '' })).toBe('http://app.test/items/');
    expect(shownPattern('http://app.test/items/:id', {})).toBe('http://app.test/items/:id');
  });

  it('never prints a marker in a stop or a refusal, wherever the marker sits', () => {
    const pattern = 'http://app.test/web#action=156&cids=:id&id={{d3}}&menu_id=109&model=res.partner&view_type=form';
    const live = 'http://app.test/web#action=330&active_id=45&cids=1&menu_id=109&model=sale.order&view_type=list';
    const stop = urlEffectVerdict(pattern, live, {}, 'step 3').stop!;
    expect(stop).toContain('expected url http://app.test/web#action=156&cids=:id&id=:id&menu_id=109&model=res.partner&view_type=form');
    expect(stop).not.toContain('{{');
    const refused = preconditionVerdict(pattern, live, {}, 0.1).refuse!;
    expect(refused).toContain('expects http://app.test/web#action=156&cids=:id&id=:id&menu_id=109&model=res.partner&view_type=form');
    expect(refused).not.toContain('{{');
    // The live url is still described by the pattern it was judged against:
    // only the keys that pattern names, credentials masked.
    expect(urlEffectVerdict('http://app.test/done?status=success&id={{d1}}', 'http://app.test/done?status=failure&sid=abc', {}, 'step 3').stop).toBe(
      'after step 3 expected url http://app.test/done?status=success&id=:id but browser is at http://app.test/done?status=failure',
    );
  });

  it('changes no matching: an unfilled marker still matches the recorded shape, and only a different view stops', () => {
    const pattern = 'http://app.test/web#action=156&cids=:id&id={{d3}}&menu_id=109&model=res.partner&view_type=form';
    const sameShape = 'http://app.test/web#action=156&cids=1&id=45&menu_id=109&model=res.partner&view_type=form';
    expect(urlEffectVerdict(pattern, sameShape, {}, 'step 3')).toEqual({ warnings: [] });
    expect(preconditionVerdict(pattern, sameShape, {}, 1).refuse).toBeUndefined();
    // …while the same marker BOUND to another record's id still stops on this
    // url, and now says the id it compared — the caller named that record.
    expect(urlEffectVerdict(pattern, sameShape, { d3: '99' }, 'step 3').stop).toContain('id=99');
    expect(urlEffectVerdict(pattern, 'http://app.test/web#action=330&cids=1&id=45&menu_id=109&model=sale.order&view_type=list', {}, 'step 3').stop).toBeDefined();
  });

  // fwgr45: a slot that filled to '' asked for emptiness and stopped the
  // compiled arm on the RIGHT dashboard, while both replays ran 7/7 at 0
  // turns. '' in the artifact is `outputs[ref] ?? ''` — never published —
  // which is what boundQueryKeys, markersBound, urlRecordParts and need()
  // all already say. A key the run could not fill asks for no view.
  it('a slot that filled to nothing asks for no particular value, in query and in hash state', () => {
    const q = 'http://app.test/d/:var/board?from=:id&timezone={{v5}}&to=now';
    expect(urlEffectVerdict(q, 'http://app.test/d/abc/board?from=now-6h&timezone=browser&to=now', { v5: '' }, 'step 7')).toEqual({ warnings: [] });
    // …and a slot the run DID fill is still compared.
    expect(urlEffectVerdict(q, 'http://app.test/d/abc/board?from=now-6h&timezone=browser&to=now', { v5: 'utc' }, 'step 7').stop).toContain('timezone=utc');
    const h = 'http://app.test/web#model=res.partner&view={{v1}}';
    expect(urlEffectVerdict(h, 'http://app.test/web#model=res.partner&view=form', { v1: '' }, 'step 3')).toEqual({ warnings: [] });
    expect(urlEffectVerdict(h, 'http://app.test/web#model=res.partner&view=form', { v1: 'list' }, 'step 3').stop).toBeDefined();
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

describe('gotoLandingVerdict', () => {
  it('stops on a word value a key both urls carry disagrees on (fwod45: form → list)', () => {
    expect(
      gotoLandingVerdict('http://odoo/web#cids=1&action=316&model=sale.order&view_type=form&id=22', 'http://odoo/web#action=316&model=sale.order&view_type=list&cids=1', 'step 11'),
    ).toBe('step 11 navigated but landed on another view: view_type=list where it was sent to view_type=form — the page it asked for was not given');
  });
  it('lets redirects, one-sided keys and volatile ids through', () => {
    // a root routed to its login (repairdesk), a uid completed with a slug and query (grafana)
    expect(gotoLandingVerdict('http://app/', 'http://app/#/login', 'step 1')).toBeNull();
    expect(gotoLandingVerdict('http://graf/d/abc123/', 'http://graf/d/abc123/bench?from=now-6h&to=now', 'step 1')).toBeNull();
    // the id dropped, the menu id reissued
    expect(gotoLandingVerdict('http://odoo/web#menu_id=194&view_type=form&id=22', 'http://odoo/web#menu_id=201&view_type=form', 'step 1')).toBeNull();
    // an empty requested value asks for no view: the app's default fills it (fwod48)
    expect(gotoLandingVerdict('http://odoo/web#action=&model=&view_type=list&cids=1&menu_id=', 'http://odoo/web#action=123&model=res.partner&view_type=list&cids=1&menu_id=81', 'step 1')).toBeNull();
    // another origin is the error-page and origin gates' business
    expect(gotoLandingVerdict('http://app/x?view=a', 'http://other/x?view=b', 'step 1')).toBeNull();
  });
});

describe('retargetNavigation (fwgr41-n3 06-find: the goto to the recording\'s dashboard uid)', () => {
  // Exactly what the run showed: step 6's url expectation warned "url
  // segment(s) differ from recorded (afyd7g0300dfkc→cfyd8hqymgfeoe) — treated
  // as volatile", and step 7 then navigated to the recorded uid.
  const uid = { where: 'path', index: 1, expected: 'afyd7g0300dfkc', actual: 'cfyd8hqymgfeoe' } as const;
  const target = 'http://127.0.0.1:3000/d/afyd7g0300dfkc/fwgr41-spec-bench-dashboard?from=now-6h&to=now&timezone=browser&refresh=1m';
  const live = 'http://127.0.0.1:3000/d/cfyd8hqymgfeoe/fwgr41-spec-bench-dashboard?from=now-6h&to=now&timezone=browser&refresh=1m';

  it('navigates to the live value at a position this run has shown volatile', () => {
    const verdict = retargetNavigation(target, live, [uid], 'step 7');
    expect(verdict.url).toBe('http://127.0.0.1:3000/d/cfyd8hqymgfeoe/fwgr41-spec-bench-dashboard?from=now-6h&to=now&timezone=browser&refresh=1m');
    expect(verdict.warning).toBe(
      'step 7: the recorded target names path[1]=afyd7g0300dfkc, a position this run has already shown volatile — navigating to the live path[1]=cfyd8hqymgfeoe instead',
    );
    expect(verdict.stale).toBeUndefined();
  });

  it('keeps every other byte of the recorded target: order, keys, the values it asked for', () => {
    const verdict = retargetNavigation('http://graf/d/abc123/dash?to=now&from=now-6h&utm_source=x#/panel/7', 'http://graf/d/zzz999/dash?from=now-6h#/panel/7', [
      { where: 'path', index: 1, expected: 'abc123', actual: 'zzz999' },
    ]);
    // `to` keeps its place and its value (a key only the target carries, which
    // urlDiff never judged), the noise key rides along, the route survives.
    expect(verdict.url).toBe('http://graf/d/zzz999/dash?to=now&from=now-6h&utm_source=x#/panel/7');
  });

  it('retargets a query, a hash route and a hash-state position the same way', () => {
    expect(retargetNavigation('http://app/x?id=123', 'http://app/x?id=456', [{ where: 'query', key: 'id', expected: '123', actual: '456' }]).url).toBe('http://app/x?id=456');
    expect(retargetNavigation('http://app/#/order/123', 'http://app/#/order/456', [{ where: 'hashPath', index: 1, expected: '123', actual: '456' }]).url).toBe('http://app/#/order/456');
    expect(retargetNavigation('http://odoo/web#id=22&view_type=form', 'http://odoo/web#id=41&view_type=form', [{ where: 'hashState', key: 'id', expected: '22', actual: '41' }]).url).toBe(
      'http://odoo/web#id=41&view_type=form',
    );
  });

  it('leaves the recorded target alone with no evidence, and says nothing is stale', () => {
    const verdict = retargetNavigation(target, live, []);
    expect(verdict).toEqual({ url: target });
    // An observation about ANOTHER position, or another value at this one, is
    // not evidence about this target.
    expect(retargetNavigation(target, live, [{ where: 'query', key: 'refresh', expected: '5m', actual: '10m' }])).toEqual({ url: target });
    expect(retargetNavigation(target, live, [{ ...uid, expected: 'somethingelse' }])).toEqual({ url: target });
  });

  it('refuses a disagreement anywhere the run has not shown volatile', () => {
    // Same page shape, but the view — not a volatile id — differs too: the
    // recorded target stands, and it is reported stale.
    const verdict = retargetNavigation(`${target}&view=json`, `${live}&view=table`, [uid], 'step 7');
    expect(verdict.url).toBe(`${target}&view=json`);
    expect(verdict.stale).toBe('its url still names the recorded path[1]=afyd7g0300dfkc, which this run has already shown varies (cfyd8hqymgfeoe)');
  });

  it('never rewrites a word to a word, whatever was observed', () => {
    const verdict = retargetNavigation('http://app/orders/success', 'http://app/orders/failure', [{ where: 'path', index: 1, expected: 'success', actual: 'failure' }]);
    expect(verdict.url).toBe('http://app/orders/success');
    expect(verdict.stale).toBe('its url still names the recorded path[1]=success, which this run has already shown varies (failure)');
  });

  it('reports a stale target the live url cannot correct (another page shape, an unfilled marker)', () => {
    expect(retargetNavigation(target, 'http://127.0.0.1:3000/dashboards', [uid]).stale).toContain('path[1]=afyd7g0300dfkc');
    // Nothing concrete to compare: the step's markers were never filled.
    expect(retargetNavigation('http://graf/d/afyd7g0300dfkc/{{v2}}-bench', live, [uid])).toEqual({ url: 'http://graf/d/afyd7g0300dfkc/{{v2}}-bench' });
  });

  it('is silent when the browser is already on the target', () => {
    expect(retargetNavigation(target, target, [uid])).toEqual({ url: target });
  });
});

describe('alertVerdict names a stale navigation as the cause (fwgr41-n3 06-find step 7)', () => {
  const ctx = { where: '06-find s_e013d1/7', isRead: false, params: {} };
  const raised = ['Dashboard not found', 'Invalid dashboard UID in annotation request'];

  it('reports the page it navigated to rather than the generic unrecorded alert', () => {
    const stale = 'its url still names the recorded path[1]=afyd7g0300dfkc, which this run has already shown varies (cfyd8hqymgfeoe)';
    const verdict = alertVerdict([], raised, { ...ctx, navigatedToStale: stale });
    expect(verdict.stop).toBe(
      `06-find s_e013d1/7 navigated to a page that does not exist: ${stale} — the app answered with an alert the recording never saw: Dashboard not found | Invalid dashboard UID in annotation request`,
    );
  });

  it('keeps the generic wording when no navigation of this run was stale', () => {
    expect(alertVerdict([], raised, ctx).stop).toBe('06-find s_e013d1/7 raised an alert the recording never saw: Dashboard not found | Invalid dashboard UID in annotation request');
  });

  it('changes what the stop is CALLED, never whether there is one', () => {
    const stale = 'its url still names the recorded path[1]=x, which this run has already shown varies (y)';
    // The step's recorded changes appeared: reported, not stopped — cause and all.
    const soft = alertVerdict([], raised, { ...ctx, navigatedToStale: stale, effectConfirmed: true });
    expect(soft.stop).toBeUndefined();
    expect(soft.warnings[0]).toContain('navigated to a page that does not exist');
    expect(soft.warnings[0]).toContain("reported, not stopped: the step's recorded page changes appeared");
    // A read raises no alert of its own, and an alert the recording DID expect
    // is the step's own business: neither is a dead page.
    expect(alertVerdict([], raised, { ...ctx, isRead: true, navigatedToStale: stale }).stop).toBeUndefined();
    expect(alertVerdict([], raised, { ...ctx, navigatedToStale: stale, expectedContains: 'Dashboard not found' }).stop).toBeUndefined();
  });
});

describe('dependsOnPage', () => {
  const target = { target: '@e1' };
  const css = (selector: string) => ({ target: [{ kind: 'css', selector }] });
  it('is false for a step that looks at no page content', () => {
    for (const tool of ['goto', 'back', 'set_viewport', 'set_offline', 'dialog_expect', 'screenshot', 'snapshot', 'tabs']) {
      expect(dependsOnPage({ tool, args: {} }), tool).toBe(false);
    }
    expect(dependsOnPage({ tool: 'read', args: { what: 'url' }, locators: {} })).toBe(false);
    expect(dependsOnPage({ tool: 'press', args: { key: 'Escape' } })).toBe(false);
    // a page load, as the raw selector or as every recorded candidate
    expect(dependsOnPage({ tool: 'wait_for', args: { target: '@e0', state: 'visible' }, locators: css('body') })).toBe(false);
    expect(dependsOnPage({ tool: 'wait_for', args: { target: 'html' } })).toBe(false);
    // the root under its other spellings: one element, several selectors
    for (const selector of ['html > body', 'html>body', 'html body', ' BODY ']) {
      expect(dependsOnPage({ tool: 'wait_for', args: { target: '@e0' }, locators: css(selector) }), selector).toBe(false);
    }
    // fwrd68 s_bfc33c: an enriched chain — the root twice over, then the
    // coordinate, which cannot speak to identity and so is dropped, not
    // counted as a no.
    expect(
      dependsOnPage({
        tool: 'wait_for',
        args: { target: 'body', state: 'visible' },
        locators: { target: [{ kind: 'css', selector: 'body' }, { kind: 'css', selector: 'html > body' }, { kind: 'point', x: 640, y: 450, w: 1264, h: 884, role: null, tag: 'body', vw: 1280, vh: 900 }] },
      }),
    ).toBe(false);
  });
  it('is true for a step that resolves or reads something in the page', () => {
    for (const tool of ['click', 'dblclick', 'modifier_click', 'right_click', 'fill', 'type', 'select', 'check', 'hover', 'scroll_into_view', 'drag', 'upload', 'download', 'eval']) {
      expect(dependsOnPage({ tool, args: target }), tool).toBe(true);
    }
    expect(dependsOnPage({ tool: 'loop', args: {} })).toBe(true);
    expect(dependsOnPage({ tool: 'press', args: { ...target, key: 'Enter' } })).toBe(true);
    expect(dependsOnPage({ tool: 'read', args: { ...target, what: 'text' } })).toBe(true);
    expect(dependsOnPage({ tool: 'read_all', args: { ...target, what: 'text' } })).toBe(true);
    expect(dependsOnPage({ tool: 'wait_for', args: { ...target, state: 'visible' }, locators: css('#banner') })).toBe(true);
    // a condition on the body's TEXT is about the content
    expect(dependsOnPage({ tool: 'wait_for', args: { target: 'body', state: 'text_contains', text: 'Saved' } })).toBe(true);
    // A rung that NAMES a page element speaks, and says "not the root": body
    // beside it is not the document alone. Only a rung that cannot answer at
    // all (a point — a coordinate) is dropped from the question.
    expect(dependsOnPage({ tool: 'wait_for', args: target, locators: { target: [{ kind: 'css', selector: 'body' }, { kind: 'role', role: 'main' }] } })).toBe(true);
    expect(dependsOnPage({ tool: 'wait_for', args: target, locators: { target: [{ kind: 'css', selector: 'body' }, { kind: 'css', selector: 'body > div' }] } })).toBe(true);
    // the widened root spelling must not reach past html/body
    expect(dependsOnPage({ tool: 'wait_for', args: { target: 'body > div' } })).toBe(true);
    expect(dependsOnPage({ tool: 'wait_for', args: { target: 'body.app' } })).toBe(true);
    // a chain of nothing but coordinates says nothing about the root, and the
    // gate is kept rather than skipped on no evidence
    expect(dependsOnPage({ tool: 'wait_for', args: { target: 'body' }, locators: { target: [{ kind: 'point', x: 1, y: 1, w: 2, h: 2, role: null, tag: 'body', vw: 8, vh: 8 }] } })).toBe(true);
    expect(dependsOnPage({ tool: 'something_new', args: {} })).toBe(true);
  });
});

describe('segmentGate', () => {
  const steps = (...tools: string[]) => tools.map((tool) => ({ tool, args: tool === 'wait_for' ? { target: 'body' } : { target: '@e1' } }));
  it('goes before the first page-dependent step', () => {
    expect(segmentGate(steps('click', 'goto'))).toEqual({ at: 1, afterNavigation: false });
    expect(segmentGate(steps('wait_for', 'fill'))).toEqual({ at: 2, afterNavigation: false });
  });
  it('says when a navigation ran ahead of it (an older skill’s shape)', () => {
    expect(segmentGate(steps('goto', 'fill'))).toEqual({ at: 2, afterNavigation: true });
    // fwrd51 s_b1a0cd, recorded from about:blank
    expect(segmentGate([{ tool: 'wait_for', args: { target: 'body' } }, { tool: 'read', args: { what: 'url' } }, { tool: 'goto', args: {} }, { tool: 'fill', args: { target: '@e1' } }])).toEqual({ at: 4, afterNavigation: true });
  });
  it('is never asked of a segment with no page-dependent step', () => {
    expect(segmentGate(steps('wait_for', 'goto'))).toEqual({ at: 0, afterNavigation: false });
    // fwrd68 s_bfc33c, verbatim: the whole procedure looks at no page, and the
    // goto at step 3 is what CHOOSES the page. Gated at step 1 it asked the
    // root url of a browser sitting on the hash router's redirect target and
    // refused the flow.
    expect(
      segmentGate([
        {
          tool: 'wait_for',
          args: { target: 'body', state: 'visible' },
          locators: { target: [{ kind: 'css', selector: 'body' }, { kind: 'css', selector: 'html > body' }, { kind: 'point', x: 640, y: 450, w: 1264, h: 884, role: null, tag: 'body', vw: 1280, vh: 900 }] },
        },
        { tool: 'read', args: { what: 'url' }, locators: {} },
        { tool: 'goto', args: { url: 'http://127.0.0.1:4180/' }, locators: {} },
      ]),
    ).toEqual({ at: 0, afterNavigation: false });
    expect(segmentGate([])).toEqual({ at: 0, afterNavigation: false });
  });
});

describe('landedOnRecordedPage', () => {
  it('is the recorded template by a strict or a soft url match, and nothing else', () => {
    expect(landedOnRecordedPage('http://app/record/:id', 'http://app/record/rec-42')).toBe(true);
    // another RECORD of the template is the template: which record is the markers' question
    expect(landedOnRecordedPage('http://app/#/tickets/{{v1}}', 'http://app/#/tickets/t16')).toBe(true);
    // a minted literal that disagrees soft-matches
    expect(landedOnRecordedPage('http://app/d/abc123/bench', 'http://app/d/xyz789/bench')).toBe(true);
    // fwrd53: a detail page's gate, and the goto landed on the list
    expect(landedOnRecordedPage('http://app/#/tickets/{{v1}}', 'http://app/#/tickets')).toBe(false);
    expect(landedOnRecordedPage('http://app/#/tickets/:id', 'http://app/#/parts/7')).toBe(false);
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

  /**
   * fwgr49 03-open. One grafana dashboard, two runs: the uid at path[1] and
   * both halves of the `from`/`to` range disagree, `timezone` and the slug do
   * not. Three positions, so url.ts's default budget of two refused the
   * segment on the COUNT — while the same round's sibling skill, carrying the
   * uid in a derived slot, had two diffs, soft-matched and ran. The count is a
   * proxy for "is this a different page?"; this verdict holds the real
   * measurement, so the proxy yields to it and the fingerprint decides.
   */
  describe('the soft-match budget yields to the structural measurement (fwgr49)', () => {
    const PATTERN = 'http://app.test/d/afygoex55iarka/fwgr49-spec-bench-dashboard?from=2026-09-16T14:56:44.986Z&timezone=browser&to=2026-09-16T20:56:44.986Z';
    const LIVE = 'http://app.test/d/ffygq8lk6gwsge/fwgr49-spec-bench-dashboard?from=2026-09-16T15:19:52.873Z&timezone=browser&to=2026-09-16T21:19:52.873Z';
    const DIFFS = 'afygoex55iarka→ffygq8lk6gwsge, 2026-09-16T14:56:44.986Z→2026-09-16T15:19:52.873Z, 2026-09-16T20:56:44.986Z→2026-09-16T21:19:52.873Z';

    it('proceeds on three disagreeing positions when the page measures as the recorded one', () => {
      const out = preconditionVerdict(PATTERN, LIVE, {}, 0.994);
      expect(out.refuse).toBeUndefined();
      expect(out.warnings).toEqual([`start url differs from the recorded pattern in 3 segment(s) (${DIFFS}) — proceeding optimistically`]);
      expect(out.soft?.generalised).toBe('http://app.test/d/:var/fwgr49-spec-bench-dashboard?from=:var&timezone=browser&to=:var');
      expect(out.soft?.diffs).toHaveLength(3);
      // and with no fingerprint at all the url still decides alone (as at 1 and 2 diffs)
      expect(preconditionVerdict(PATTERN, LIVE, {}, null).refuse).toBeUndefined();
    });

    it('still refuses those same three positions when the structure is not the recorded page', () => {
      const out = preconditionVerdict(PATTERN, LIVE, {}, 0.41);
      expect(out.soft).toBeUndefined();
      expect(out.refuse).toBe(
        'not on the page this procedure starts from (expects http://app.test/d/afygoex55iarka/fwgr49-spec-bench-dashboard?from=2026-09-16T14:56:44.986Z&timezone=browser&to=2026-09-16T20:56:44.986Z, ' +
          'browser is at http://app.test/d/ffygq8lk6gwsge/fwgr49-spec-bench-dashboard?from=2026-09-16T15:19:52.873Z&timezone=browser&to=2026-09-16T21:19:52.873Z' +
          '; the url shape is close but the page structure is not — similarity 0.41)',
      );
    });

    /**
     * The per-diff guards are what make a softening safe, and they do not move
     * with the budget: a WORD position is a page the application chose, and a
     * position the pattern fills from a parameter is the record the CALLER
     * named. Either one refuses however close the page measures.
     */
    it('refuses a WORD position and a parameter-filled position at any budget', () => {
      const word = preconditionVerdict('http://app.test/orders/success?from=1000&to=2000', 'http://app.test/orders/failure?from=1100&to=2100', {}, 0.999);
      expect(word.soft).toBeUndefined();
      // no `because`: softUrlMatch refused it, the structure agreed
      expect(word.refuse).toBe(
        'not on the page this procedure starts from (expects http://app.test/orders/success?from=1000&to=2000, browser is at http://app.test/orders/failure?from=1100&to=2100)',
      );
      const named = preconditionVerdict('http://app.test/d/{{v1}}/board?from=1000&to=2000', 'http://app.test/d/xyz2/board?from=1100&to=2100', { v1: 'abc1' }, 0.999);
      expect(named.soft).toBeUndefined();
      expect(named.refuse).toMatch(/^not on the page this procedure starts from/);
    });

    it('spends three and no more: a fourth disagreeing position refuses', () => {
      const four = preconditionVerdict(
        'http://app.test/d/abc1/board?from=1000&to=2000&viewPanel=7',
        'http://app.test/d/xyz2/board?from=1100&to=2100&viewPanel=8',
        {},
        0.999,
      );
      expect(four.soft).toBeUndefined();
      expect(four.refuse).toMatch(/^not on the page this procedure starts from/);
      // the same url three positions apart passes, so it is the fourth that refused
      const three = preconditionVerdict(
        'http://app.test/d/abc1/board?from=1000&to=2000&viewPanel=7',
        'http://app.test/d/xyz2/board?from=1100&to=2100&viewPanel=7',
        {},
        0.999,
      );
      expect(three.refuse).toBeUndefined();
    });

    /**
     * `urlEffectVerdict` keeps url.ts's default. It warns and PROCEEDS with no
     * similarity check of its own, so it holds nothing the count could yield
     * to: three positions stop the step there, exactly as before.
     */
    it('leaves urlEffectVerdict on the default budget of two', () => {
      const out = urlEffectVerdict(PATTERN, LIVE, {}, 'step 3');
      expect(out.generalised).toBeUndefined();
      expect(out.stop).toMatch(/^after step 3 expected url http:\/\/app\.test\/d\/afygoex55iarka\//);
      // two of the same positions is what it does soften
      const two = urlEffectVerdict('http://app.test/d/abc1/board?from=1000&to=2000', 'http://app.test/d/abc1/board?from=1100&to=2100', {}, 'step 3');
      expect(two.stop).toBeUndefined();
      expect(two.generalised).toBe('http://app.test/d/abc1/board?from=:var&to=:var');
    });

    /** `landedOnRecordedPage` asks the url alone, so it too keeps the default. */
    it('leaves landedOnRecordedPage on the default budget of two', () => {
      expect(landedOnRecordedPage(PATTERN, LIVE)).toBe(false);
      expect(landedOnRecordedPage('http://app.test/d/abc1/board?from=1000&to=2000', 'http://app.test/d/xyz2/board?from=1100&to=2000')).toBe(true);
    });
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

describe('urlRecordParts / identityMarkerVerdict (fwgr39-n3 05-set: a stale marker on the right record)', () => {
  const GRAFANA = 'http://127.0.0.1:3000/d/:var/{{v2}}-bench-dashboard?from=:id&timezone=browser&to=now';
  const params = { v2: 'fwgr39-n3', v7: 'Last 6 hours' };

  it("names the record when every param-filled part equals this run's value", () => {
    const live = 'http://127.0.0.1:3000/d/efybx78tc7q4gb/fwgr39-n3-bench-dashboard?editview=settings&from=now-6h&timezone=browser&to=now';
    expect(urlRecordParts(GRAFANA, live, params)).toEqual(['path[2]=fwgr39-n3-bench-dashboard']);
    expect(urlRecordParts('http://x.test/edit?id={{d1}}', 'http://x.test/edit?id=17', { d1: '17' })).toEqual(['id=17']);
    expect(urlRecordParts('http://x.test/web#id={{d1}}&model=sale.order', 'http://x.test/web#id=17&model=sale.order&cids=1', { d1: '17' })).toEqual(['#id=17']);
  });

  it('names nothing where the url cannot tell records apart, or tells a different one', () => {
    // wildcards match every record
    expect(urlRecordParts('http://x.test/rec/:id', 'http://x.test/rec/44', {})).toBeNull();
    // another run's slug
    expect(urlRecordParts(GRAFANA, 'http://127.0.0.1:3000/d/abc123/fwgr39-n2-bench-dashboard?from=now-6h&timezone=browser&to=now', params)).toBeNull();
    // unbound, or bound to ''
    expect(urlRecordParts('http://x.test/rec/{{v1}}', 'http://x.test/rec/44', {})).toBeNull();
    expect(urlRecordParts('http://x.test/rec/{{d1}}', 'http://x.test/rec/', { d1: '' })).toBeNull();
    // a bound query key the live url lacks, and a different page shape
    expect(urlRecordParts('http://x.test/edit?id={{d1}}', 'http://x.test/edit', { d1: '17' })).toBeNull();
    expect(urlRecordParts('http://x.test/rec/{{v1}}', 'http://x.test/rec/44/edit', { v1: '44' })).toBeNull();
    // one record part right is not enough when another is wrong
    expect(urlRecordParts('http://x.test/{{v1}}/items/{{d1}}', 'http://x.test/acme/items/9', { v1: 'acme', d1: '8' })).toBeNull();
    expect(urlRecordParts(undefined, 'http://x.test/rec/44', {})).toBeNull();
  });

  it('masks a credential-named part in what it reports', () => {
    expect(urlRecordParts('http://x.test/cb?token={{v1}}', 'http://x.test/cb?token=abc', { v1: 'abc' })).toEqual(['token=***']);
  });

  it('warns instead of refusing when the url names the record, and refuses when it cannot', () => {
    const live = 'http://127.0.0.1:3000/d/efybx78tc7q4gb/fwgr39-n3-bench-dashboard?from=now-6h&timezone=browser&to=now';
    expect(identityMarkerVerdict(GRAFANA, live, params, 'Last 6 hours', 'present')).toEqual({ pass: true });
    const stale = identityMarkerVerdict(GRAFANA, live, params, 'Last 6 hours', 'absent');
    expect(stale.pass).toBe(true);
    expect(stale.warning).toMatch(/"Last 6 hours" is not on the page, but the url names this run's record \(path\[2\]=fwgr39-n3-bench-dashboard\) — the marker is stale/);
    expect(identityMarkerVerdict(GRAFANA, live, params, 'Last 6 hours', 'unknown').warning).toMatch(/could not be confirmed/);
    expect(identityMarkerVerdict('http://x.test/rec/:id', 'http://x.test/rec/44', {}, 'Record 45', 'absent')).toEqual({ pass: false });
    expect(identityMarkerVerdict('http://x.test/rec/:id', 'http://x.test/rec/44', {}, 'Record 45', 'unknown')).toEqual({ pass: false });
  });

  /**
   * fwgr47-n2 07-verify: the url escape hatch was unavailable in the instant
   * replay looked. `boundQueryKeys` of that pattern is {from, to}; step 1 had
   * just `goto`-ed a BARE dashboard url carrying neither, so urlDiff said null
   * and urlRecordParts had nothing to offer — on the RIGHT dashboard. The
   * reason EXPIRES: grafana normalises its own address bar a moment later.
   * So the verdict must be asked of the url AFTER the identity wait, and the
   * same url then answers.
   */
  it('answers once the app has finished writing the url it had not written yet', () => {
    // fwgr47's own pattern: its time range was RECORDED as values, so `from`
    // and `to` are bound query keys — the pair the bare url lacks.
    const BOOTING = 'http://127.0.0.1:3000/d/:var/{{v2}}-bench-dashboard?from={{d1}}&timezone=browser&to={{d2}}';
    const p = { v2: 'fwgr47-n2', d1: 'now-6h', d2: 'now' };
    const boot = 'http://127.0.0.1:3000/d/bfyfuaptu20aoa/fwgr47-n2-bench-dashboard';
    expect(urlRecordParts(BOOTING, boot, p)).toBeNull();
    expect(identityMarkerVerdict(BOOTING, boot, p, 'fwgr47-n2 Bench Dashboard', 'absent')).toEqual({ pass: false });
    const normalised = `${boot}?from=now-6h&timezone=browser&to=now`;
    expect(urlRecordParts(BOOTING, normalised, p)).toEqual(['path[2]=fwgr47-n2-bench-dashboard', 'from=now-6h', 'to=now']);
    expect(identityMarkerVerdict(BOOTING, normalised, p, 'fwgr47-n2 Bench Dashboard', 'absent').pass).toBe(true);
    // Waiting cannot rescue a url that names ANOTHER record: that is not a
    // reason that expires, so the marker goes on deciding.
    const other = 'http://127.0.0.1:3000/d/bfyfuaptu20aoa/fwgr47-n3-bench-dashboard?from=now-6h&timezone=browser&to=now';
    expect(identityMarkerVerdict(BOOTING, other, p, 'fwgr47-n2 Bench Dashboard', 'absent')).toEqual({ pass: false });
  });

  /**
   * MUST STILL CATCH (odoo). Its url is `id=:id` and `model=sale.order`
   * throughout: nothing in the pattern is MARKED, so no url, at any moment of
   * any wait, names the record — the marker is the only identity there is, and
   * asking the url again changes nothing whatsoever there.
   */
  it('names no record where no url part is marked, however often it is asked', () => {
    const ODOO = 'http://127.0.0.1:8069/odoo/sales/:id#id=:id&model=sale.order';
    const p = { v2: 'S00024' };
    for (const live of [
      'http://127.0.0.1:8069/odoo/sales/19',
      'http://127.0.0.1:8069/odoo/sales/19#id=19&model=sale.order',
      'http://127.0.0.1:8069/odoo/sales/19#id=19&model=sale.order&cids=1&menu_id=9',
    ]) {
      expect(urlRecordParts(ODOO, live, p)).toBeNull();
      expect(identityMarkerVerdict(ODOO, live, p, 'Sales Order S00024', 'absent')).toEqual({ pass: false });
      expect(identityMarkerVerdict(ODOO, live, p, 'Sales Order S00024', 'unknown')).toEqual({ pass: false });
    }
  });

  /**
   * One budget, stated once: the artifact polls it (spec/emit.ts
   * identityChecks) and daemon replay polls it (skills/replay.ts
   * checkIdentity). A budget that differed between them would be a rule only
   * one runner applies — the class the parity harness exists to catch.
   */
  it('states the identity wait both runners use', () => {
    expect(IDENTITY_WAIT_MS).toBe(5_000);
    expect(IDENTITY_POLL_MS).toBeGreaterThan(0);
    expect(IDENTITY_POLL_MS).toBeLessThan(IDENTITY_WAIT_MS);
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

/**
 * A slot the run could not fill: "asks for no particular value" is right for a
 * CHECK and wrong for an ACTION. The predicate itself only answers which slots
 * are missing; which steps may not act on one is the caller's question
 * (replay's runOneStep, emit's unfillableSlots).
 */
describe('unfilledSlots', () => {
  it('reports a marker whose slot is absent from params, anywhere inside the value', () => {
    expect(unfilledSlots('{{v2}}', {})).toEqual(['v2']);
    expect(unfilledSlots({ text: 'Order {{v2}}' }, { v1: 'a' })).toEqual(['v2']);
    expect(unfilledSlots([{ kind: 'text', selector: '{{d1}}' }], { v1: 'a' })).toEqual(['d1']);
    // Each slot once, in the order met.
    expect(unfilledSlots(['{{v3}} {{v2}}', { a: '{{v3}}' }], {})).toEqual(['v3', 'v2']);
  });

  it('keys on membership in params, never on what the text looks like', () => {
    // Bound to '' is BOUND — an unpublished reference, whose rule is url.ts's
    // `unfilled`, not this one. fillParams substitutes on `name in params`, and
    // so does this.
    expect(unfilledSlots('{{v2}}', { v2: '' })).toEqual([]);
    expect(unfilledSlots('{{v2}}', { v2: 'Order 7' })).toEqual([]);
    // Already-filled text answers the same as the raw template: the text the
    // value happens to carry decides nothing.
    expect(unfilledSlots('Order 7', {})).toEqual([]);
  });

  it('is scoped to the markers fillParams recognises and to nothing else', () => {
    expect(unfilledSlots('{{02-create.uid}}', {})).toEqual([]);
    expect(unfilledSlots('{{env:TOKEN}}', {})).toEqual([]);
    expect(unfilledSlots('a {{ v1 }} b', {})).toEqual([]);
    expect(unfilledSlots('function f() {{ return 1 }}', {})).toEqual([]);
    expect(unfilledSlots('{{vv1}}', {})).toEqual([]);
    expect(unfilledSlots(null, {})).toEqual([]);
    expect(unfilledSlots(42, {})).toEqual([]);
  });

  it('names the slot in a verdict when it is the value the step acts with', () => {
    expect(unfilledStepVerdict({ args: { text: 'Order 7' } }, { v1: '7' }, 'step 4')).toBeNull();
    expect(unfilledStepVerdict({ args: { text: '{{v2}}' } }, { v1: '7' }, 'step 4')).toMatch(/^step 4: \{\{v2\}\} was left unbound/);
    expect(unfilledStepVerdict({ args: { text: '{{v2}} {{v3}}' } }, {}, 'step 4')).toMatch(/\{\{v2\}\}, \{\{v3\}\} were left unbound/);
  });
});

/**
 * fwod56. `fillParams` is a SINGLE pass, so a param bound to the string
 * `{{03-create.product_name}}` puts that text into the args and nothing
 * re-scans it. The slot IS in `params`, so `unfilledSlots` — which asks
 * exactly what `fillParams` substitutes on — cannot see it, and the witness
 * (`s_4404a9` step 1, `type { text: "{{v4}}" }` with `v4` holding
 * `{{05-open.quotation_reference}}`) would have typed 31 characters of marker
 * text into odoo's search box. The args arm therefore takes expect.ts's
 * reading of the same question: an ACTION must not be laxer than an
 * ASSERTION about the same value.
 */
describe('unresolvedArgMarkers', () => {
  it('sees a slot bound to an unresolved reference, which membership in params cannot', () => {
    const args = { target: '@e5390', text: '{{v4}}', delay_ms: 40 };
    const params = { v4: '{{05-open.quotation_reference}}' };
    // The narrow predicate is blind to it, by construction — v4 IS bound.
    expect(unfilledSlots(args, params)).toEqual([]);
    expect(unresolvedArgMarkers(args, params)).toEqual(['{{05-open.quotation_reference}}']);
    expect(unfilledStepVerdict({ args, locators: {} }, params, 'step 1')).toMatch(
      /^step 1: \{\{05-open\.quotation_reference\}\} is still unresolved after this run's params were filled in/,
    );
  });

  it('answers the same for args already filled and args still raw', () => {
    const params = { v4: '{{05-open.quotation_reference}}' };
    // replay hands this verdict `fillParamsDeep(step.args, params)`; the
    // artifact's call sites need not have filled anything.
    expect(unresolvedArgMarkers({ text: '{{05-open.quotation_reference}}' }, params)).toEqual(['{{05-open.quotation_reference}}']);
    expect(unresolvedArgMarkers({ text: '{{v4}}' }, params)).toEqual(['{{05-open.quotation_reference}}']);
  });

  it('reports each marker once, anywhere inside the value, and nothing for a resolved one', () => {
    expect(unresolvedArgMarkers(['{{a.b}} {{a.b}}', { u: '{{c.d}}' }], {})).toEqual(['{{a.b}}', '{{c.d}}']);
    expect(unresolvedArgMarkers({ text: 'Order 7' }, {})).toEqual([]);
    expect(unresolvedArgMarkers({ text: '{{v1}}' }, { v1: 'Order 7' })).toEqual([]);
    expect(unresolvedArgMarkers(null, {})).toEqual([]);
    expect(unresolvedArgMarkers(42, {})).toEqual([]);
  });

  it('leaves the two rules the round before it settled exactly where they were', () => {
    // Bound to '' is BOUND — url.ts's `unfilled`. Filling leaves no marker at
    // all, so the broad reading never meets it.
    expect(unresolvedArgMarkers({ url: '/record/{{v1}}' }, { v1: '' })).toEqual([]);
    expect(unfilledStepVerdict({ args: { url: '/record/{{v1}}' } }, { v1: '' }, 'step 4')).toBeNull();
    // The wildcard is deliberate: lineShows matches it against anything.
    expect(unresolvedArgMarkers({ text: '{{*}}' }, {})).toEqual([]);
    // An unbound slot keeps its OWN wording — the repair differs (nobody bound
    // it, versus nobody published it).
    expect(unfilledStepVerdict({ args: { text: '{{v2}}' } }, {}, 'step 4')).toMatch(/was left unbound/);
  });

  it('judges the ARGS only: a locator chain keeps fillableChain', () => {
    const role = { kind: 'role', role: 'textbox', name: 'Search' };
    const ref = { kind: 'id', selector: '#row_{{05-open.quotation_reference}}' };
    // A rung that resolved to a placeholder is an exhausted preference, not a
    // failure: the role rung behind it takes the step exactly as recorded.
    expect(unfilledStepVerdict({ args: { target: '@e1', text: 'Beta' }, locators: { target: [ref, role] } }, {}, 'step 2')).toBeNull();
    // fillableChain answers on membership, unchanged: the reference-bearing
    // rung is not a slot this run failed to fill, so it is not even dropped.
    expect(fillableChain([ref, role], {})).toEqual([ref, role]);
  });
});

/**
 * A locator chain is a PREFERENCE ORDER, not a conjunction. odoo fwod34's
 * s_eee5b1 step 2 is the case: its `id` and `css` rungs are `#name_{{d2}}`,
 * where `d2` is a url-pattern wildcard and never a value, behind a `role` and
 * a `placeholder` rung that resolve perfectly well. Reading the dead rungs as
 * a defect refused the whole compile of a green bench flow.
 */
describe('fillableChain', () => {
  const role = { kind: 'role', role: 'textbox', name: 'e.g. Brandom Freeman' };
  const byId = { kind: 'id', selector: '#name_{{d2}}' };
  const css = { kind: 'css', selector: 'div#name_{{d2}} > input' };

  it('drops the rungs this run could not fill and keeps the order of the rest', () => {
    expect(fillableChain([byId, role, css], {})).toEqual([role]);
    expect(fillableChain([byId, role], { d2: '7' })).toEqual([byId, role]);
    expect(fillableChain([], {})).toEqual([]);
    expect(fillableChain(undefined, {})).toEqual([]);
  });

  it('is not fatal while one rung survives, and is fatal when none does', () => {
    const acts = (chain: unknown[]) => unfilledStepVerdict({ args: { target: '@e1' }, locators: { target: chain } }, {}, 'step 2');
    expect(acts([byId, role, css])).toBeNull();
    expect(acts([byId, css])).toMatch(/^step 2: every recorded locator for target names \{\{d2\}\}/);
    // An empty chain is a step with no recorded locator at all, which is the
    // resolver's own miss and not this verdict's business.
    expect(acts([])).toBeNull();
    // The args still decide first: a dead value is fatal whatever the chain.
    expect(unfilledStepVerdict({ args: { value: '{{v2}}' }, locators: { target: [role] } }, {}, 'step 2')).toMatch(/\{\{v2\}\} was left unbound/);
  });
});

/**
 * The other side of the same rule: the artifact has no model to fall back on,
 * so what daemon replay meets at run time the compiler refuses at compile
 * time, where there is still somebody to tell (emit.ts unfillableSlots).
 */
describe('a step that acts on a slot the artifact can never fill', () => {
  const flowOf = (steps: SkillStep[], derived?: Skill['derived']): SpecFlow => ({
    version: 1,
    name: 'f',
    origin: 'http://app.test',
    startUrl: 'http://app.test/',
    vars: ['name'],
    steps: [
      {
        id: '01-do',
        instruction: 'do it',
        params: { v1: '{{name}}' },
        outputs: [],
        segments: [
          {
            id: 's_x',
            template: 'do {{v1}}',
            params: { v1: { example: 'Beta', usedIn: [1], known: true } },
            preconditions: { urlPattern: 'http://app.test/' },
            ...(derived ? { derived } : {}),
            steps,
          },
        ],
      },
    ],
  });
  const codes = (spec: SpecFlow) => emitFlowFile(spec, { tier: 'plain' }).diagnostics.map((d) => d.code);

  it('refuses a type whose text names a slot nothing binds', () => {
    const typed: SkillStep = { tool: 'type', args: { target: '@e1', text: '{{v2}}' }, locators: { target: [{ kind: 'id', selector: '#f' }] } };
    const found = emitFlowFile(flowOf([typed]), { tier: 'plain' }).diagnostics.filter((d) => d.code === 'unfilled-slot');
    expect(found.map((d) => [d.code, d.severity, d.step])).toEqual([['unfilled-slot', 'error', '01-do']]);
    expect(found[0].what).toContain('{{v2}}');
    expect(found[0].fix).toMatch(/rerecord/);
    // And a goto's destination.
    expect(codes(flowOf([{ tool: 'goto', args: { url: 'http://app.test/o/{{v2}}' }, locators: {} }]))).toEqual(['unfilled-slot']);
  });

  it('drops a dead locator rung rather than refusing, and refuses only when none survives', () => {
    const dead = { kind: 'id', selector: '#name_{{v2}}' };
    const live = { kind: 'role', role: 'button', name: 'Open' };
    const clickWith = (target: unknown[]) => flowOf([{ tool: 'click', args: { target: '@e1' }, locators: { target } }]);
    // fwod34's shape: two dead rungs behind two live ones. Compiles, and the
    // dead rungs are not in the artifact at all.
    const ok = emitFlowFile(clickWith([dead, live]), { tier: 'plain' });
    expect(ok.diagnostics.map((d) => d.code)).toEqual([]);
    // Not in the executed chain — the embedded FLOW json still carries the
    // recording verbatim, as it must; what is gone is the rung that would run.
    expect(ok.source).not.toContain("page.locator('#name_");
    expect(ok.source).toContain("page.getByRole('button', { name: roleName('Open'), exact: true })");
    // Every rung dead: the step has no way left to name what it acts on.
    const none = emitFlowFile(clickWith([dead, { kind: 'css', selector: 'div#name_{{v2}} > a' }]), { tier: 'plain' });
    const said = none.diagnostics.filter((d) => d.code === 'unfilled-slot');
    expect(said.map((d) => [d.code, d.severity])).toEqual([['unfilled-slot', 'error']]);
    expect(said[0].what).toContain('no locator left for its target');
  });

  it('says nothing about a slot the caller supplies, or one an earlier step minted', () => {
    const typed = (text: string): SkillStep => ({ tool: 'type', args: { target: '@e1', text }, locators: { target: [{ kind: 'id', selector: '#f' }] } });
    expect(codes(flowOf([typed('{{v1}}')]))).toEqual([]);
    const goto: SkillStep = { tool: 'goto', args: { url: 'http://app.test/o/1' }, locators: {} };
    expect(codes(flowOf([goto, typed('{{d1}}')], { d1: { step: 1, at: 'p1', example: '1' } }))).toEqual([]);
    // Minted by the step that would act on it: bindPart runs after the action,
    // so at that moment there is still nothing to substitute.
    expect(codes(flowOf([goto, typed('{{d1}}')], { d1: { step: 2, at: 'p1', example: '1' } }))).toEqual(['unfilled-slot']);
  });

  it('leaves a read, a wait and a check with the "asks for nothing" reading', () => {
    const marked = [{ kind: 'role', role: 'button', name: '{{v2}}' }];
    expect(codes(flowOf([{ tool: 'read', args: { target: '@e1', label: 'x' }, locators: { target: marked } }]))).toEqual([]);
    expect(codes(flowOf([{ tool: 'wait_for', args: { target: '@e1', state: 'visible' }, locators: { target: marked } }]))).toEqual([]);
  });
});
