import { describe, expect, it } from 'vitest';
import {
  DEBOUNCE_MS,
  LINEAGE_MS,
  POLL_COUNT,
  attribute,
  capEvents,
  newAttributionState,
  valueHash,
  type JournalEvent,
  type JournalWindow,
} from '../src/daemon/journal-attribute.js';
import { endpointOf, mintedIds, splitForStep, windowKindOf } from '../src/daemon/journal.js';

/**
 * The journal's attribution rules (design-recorder-evidence §2.3), one case
 * per rule, on hand-built windows and events: which gesture, timer or
 * background source each change is filed under.
 */

const win = (w: number, kind: JournalWindow['kind'], start: number, end?: number, input = false): JournalWindow => ({
  w,
  kind,
  tool: kind === 'gesture' ? (input ? 'fill' : 'click') : kind,
  start,
  ...(end !== undefined ? { end } : {}),
  ...(input ? { input: true } : {}),
});
const req = (t: number, t1: number, extra: Record<string, unknown> = {}): JournalEvent => ({ t, t1, k: 'req', m: 'POST', e: 'http://app/api/save', ...extra });
const ev = (t: number, k: JournalEvent['k'], extra: Record<string, unknown> = {}): JournalEvent => ({ t, k, ...extra });

describe('journal attribution', () => {
  it('rule 1: a change inside a gesture window is that gesture\'s', () => {
    const [e] = attribute([ev(1_050, 'show', { d: 'dialog "Edit"' })], [win(1, 'gesture', 1_000, 1_200)]);
    expect(e.c).toEqual(['in', 1, 'gesture']);
  });

  it('rule 1: an eval window owns what happens in it (ghost fwgh8: window.open by eval)', () => {
    const out = attribute([ev(2_050, 'page+', { pg: 1 })], [win(1, 'gesture', 1_000, 1_200), win(2, 'eval', 2_000, 2_100)]);
    expect(out[0].c).toEqual(['in', 2, 'eval']);
  });

  it('rule 2: a hide of what a gesture showed is its undo, with the trigger (gitea fwgt11: the picker shut on blur)', () => {
    const windows = [win(1, 'gesture', 1_000, 1_200), win(2, 'observe', 3_000, 3_100)];
    const blur = attribute([ev(5_000, 'foc', { dir: 'out', d: 'textbox "Filter"' }), ev(5_100, 'hide', { d: 'listbox "Labels"', sa: 1_100 })], windows);
    expect(blur.find((e) => e.k === 'hide')!.c).toEqual(['undo', 1, 'blur']);
    const timer = attribute([ev(8_000, 'hide', { d: 'status "Saved!"', sa: 1_150 })], windows);
    expect(timer[0].c).toEqual(['undo', 1, 'timer']);
  });

  it('rule 3: what lands just after a request a gesture started is that gesture\'s, late (openproject fwop14: the row after the Save)', () => {
    const windows = [win(1, 'gesture', 1_000, 1_300)];
    const out = attribute([req(1_100, 2_000), ev(2_100, 'state', { d: 'row "41 Task"' })], windows);
    expect(out.find((e) => e.k === 'state')!.c).toEqual(['late', 1, 'req']);
    // Past the lineage window, it is nobody's.
    const far = attribute([req(1_100, 2_000), ev(2_000 + LINEAGE_MS + 1, 'state', { d: 'row' })], windows);
    expect(far.find((e) => e.k === 'state')!.c).toEqual(['unknown']);
  });

  it('rule 3: a request chained on a gesture\'s answer is the gesture\'s (gitea fwgt11: POST labels, then GET the issue)', () => {
    const out = attribute([req(1_100, 1_500), req(1_600, 1_700, { m: 'GET', e: 'http://app/issues/4' })], [win(1, 'gesture', 1_000, 1_300)]);
    expect(out[1].c).toEqual(['late', 1, 'req']);
  });

  it('rule 4: a request soon after an input window is its debounced save (snipe-it fwsi1: the search url belongs to fill 13)', () => {
    const windows = [win(13, 'gesture', 1_000, 1_100, true), win(14, 'observe', 1_200, 1_300)];
    const out = attribute([req(1_600, 1_700, { m: 'GET', e: 'http://app/hardware' }), ev(1_650, 'nav', { url: 'http://app/hardware?search=Seed' })], windows);
    expect(out[0].c).toEqual(['late', 13, 'debounce']);
    // The url push lands with the search's answer: the same input's, by lineage.
    expect([out[1].c?.[0], out[1].c?.[1]]).toEqual(['late', 13]);
    // Another gesture in between breaks the debounce.
    const broken = attribute([req(1_600, 1_700)], [...windows, win(15, 'gesture', 1_400, 1_450)]);
    expect(broken[0].c).not.toEqual(['late', 13, 'debounce']);
    // Too late to be the input's.
    const late = attribute([req(1_100 + DEBOUNCE_MS + 1, 1_100 + DEBOUNCE_MS + 50)], [win(13, 'gesture', 1_000, 1_100, true)]);
    expect(late[0].c).toEqual(['app', 'timer']);
  });

  it('rule 5: a page that appears after the last gesture is that gesture\'s popup (ghost fwgh6: the late tab)', () => {
    const out = attribute([ev(2_500, 'page+', { pg: 1, op: 0 })], [win(63, 'gesture', 1_000, 1_200), win(64, 'daemon', 1_300, 1_400)]);
    expect(out[0].c).toEqual(['late', 63, 'page']);
  });

  it('rule 6: an endpoint the app keeps asking outside any gesture is polling, and what it answers is the app\'s (noise)', () => {
    const state = newAttributionState();
    const polls = Array.from({ length: POLL_COUNT + 1 }, (_, i) => req(10_000 + i * 1_000, 10_050 + i * 1_000, { m: 'GET', e: 'http://app/api/poll' }));
    const out = attribute([...polls, ev(13_100, 'state', { d: 'status "3 new"' })], [], state);
    expect(out.filter((e) => e.k === 'req').slice(POLL_COUNT - 1).every((e) => e.c?.[0] === 'app')).toBe(true);
    expect(out.find((e) => e.k === 'state')!.c).toEqual(['app', 'poll']);
    // Once known, a poll that fires inside a click's window is still the app's, not the click's.
    const [inside] = attribute([req(20_050, 20_080, { m: 'GET', e: 'http://app/api/poll' })], [win(1, 'gesture', 20_000, 20_300)], state);
    expect(inside.c).toEqual(['app', 'poll']);
  });

  it('rule 7: the daemon\'s own window owns what nothing else explains; an observation\'s too', () => {
    const out = attribute([ev(1_050, 'foc', { dir: 'in' }), ev(2_050, 'state', { d: 'x' })], [win(9, 'daemon', 1_000, 1_100), win(10, 'observe', 2_000, 2_100)]);
    expect(out[0].c).toEqual(['daemon', 9]);
    expect(out[1].c).toEqual(['in', 10, 'observe']);
  });

  it("a request outside every window, chained on nothing, is the app's own; what its answer changes is too (vikunja fwvk12: the autosave flash)", () => {
    const out = attribute([req(5_000, 5_050, { e: 'http://app/api/autosave' }), ev(5_040, 'txt', { d: 'heading', x: 'Description Saved!' })], [win(1, 'gesture', 1_000, 1_200)]);
    expect(out[0].c).toEqual(['app', 'timer']);
    expect(out[1].c).toEqual(['app', 'req']);
  });

  it('rule 8: otherwise unknown', () => {
    expect(attribute([ev(5_000, 'hide', { d: 'x' })], [])[0].c).toEqual(['unknown']);
  });

  it('overlapping gestures: an answer to gesture 1 landing inside gesture 2 is marked ambiguous (also)', () => {
    const windows = [win(1, 'gesture', 1_000, 1_100), win(2, 'gesture', 1_500, 1_800)];
    const out = attribute([req(1_050, 1_600), ev(1_650, 'show', { d: 'status "Saved"' })], windows);
    const show = out.find((e) => e.k === 'show')!;
    expect(show.c).toEqual(['in', 2, 'gesture']);
    expect(show.also).toBe(1);
  });

  it('keeps lineage across collects (a request filed earlier still explains a later change)', () => {
    const state = newAttributionState();
    const windows = [win(1, 'gesture', 1_000, 1_300)];
    attribute([req(1_100, 2_000)], windows, state);
    const [late] = attribute([ev(2_050, 'hide', { d: 'x' })], windows, state);
    expect(late.c).toEqual(['late', 1, 'req']);
  });

  it('caps a step\'s events by importance: requests and state before focus and hit-tests', () => {
    const events = [ev(1, 'foc'), ev(2, 'req'), ev(3, 'hit'), ev(4, 'state'), ev(5, 'foc')];
    const { kept, dropped } = capEvents(events, 2);
    expect(kept.map((e) => e.k)).toEqual(['req', 'state']);
    expect(dropped).toBe(3);
  });

  it('splits collected events into the step\'s own and its gap', () => {
    const own = { ...ev(1, 'req'), c: ['in', 5, 'gesture'] } as JournalEvent;
    const late = { ...ev(2, 'show'), c: ['late', 4, 'req'] } as JournalEvent;
    const app = { ...ev(3, 'req'), c: ['app', 'poll'] } as JournalEvent;
    expect(splitForStep(5, [own, late, app])).toEqual({ w: 5, ev: [own], gap: { ev: [late, app] } });
    expect(splitForStep(6, [])).toEqual({ w: 6 });
  });

  it('hashes values the way the page does (FNV-1a)', () => {
    expect(valueHash('')).toBe('811c9dc5');
    expect(valueHash('a')).toBe('e40c292c');
  });

  it('endpoints keep origin and path only; minted ids come from a create\'s answer', () => {
    expect(endpointOf('http://app/api/save?token=abc#x')).toBe('http://app/api/save');
    expect(mintedIds({ posts: [{ id: '6ab5', title: 'x' }] })).toEqual([{ p: 'posts.0.id', v: '6ab5' }]);
    expect(mintedIds({ id: 41, name: 'x', project_id: 3 })).toEqual([{ p: 'id', v: '41' }, { p: 'project_id', v: '3' }]);
    expect(mintedIds('ok')).toEqual([]);
  });

  it('windows by tool: gestures, evals, observations, the daemon', () => {
    expect(windowKindOf('click')).toBe('gesture');
    expect(windowKindOf('hover')).toBe('gesture');
    expect(windowKindOf('eval')).toBe('eval');
    expect(windowKindOf('read')).toBe('observe');
    expect(windowKindOf('snapshot')).toBe('daemon');
  });
});

describe('within: the journal\'s hard bound on a round trip', () => {
  it('gives the value when it comes in time, the fallback when it does not, and swallows a rejection', async () => {
    const { within } = await import('../src/daemon/journal.js');
    expect(await within(Promise.resolve(1), 50, 0)).toBe(1);
    expect(await within(new Promise<number>(() => {}), 20, 0)).toBe(0);
    expect(await within(Promise.reject(new Error('detached')), 50, 7)).toBe(7);
  });
});

describe('overlap: only an answer that lands while the window is open makes a change ambiguous (verify-main62)', () => {
  // journal-feedback.browser.test.ts:66 on the verify box: a goto, then at once a
  // click that opens the picker. The goto's document answer (heard 100 ms
  // before the click went out) fell inside LINEAGE_MS of the listbox showing,
  // so the show was marked `also` and the feedback left "listbox opened" out.
  it('an answer heard before the click went out does not make the click\'s popup ambiguous', () => {
    const windows = [win(1, 'gesture', 1_000, 1_400), win(2, 'gesture', 1_500, 1_800)];
    const out = attribute([req(1_010, 1_400, { m: 'GET', e: 'http://app/picker', rt: 'document' }), ev(1_520, 'show', { d: 'listbox "Labels"' })], windows);
    const show = out.find((e) => e.k === 'show')!;
    expect(show.c).toEqual(['in', 2, 'gesture']);
    expect(show.also).toBeUndefined();
  });

  it('an answer heard after it went out still does (the overlap rule stands)', () => {
    const windows = [win(1, 'gesture', 1_000, 1_100), win(2, 'gesture', 1_500, 1_800)];
    const out = attribute([req(1_050, 1_600), ev(1_650, 'show', { d: 'status "Saved"' })], windows);
    expect(out.find((e) => e.k === 'show')!.also).toBe(1);
  });
});

describe('a write soon after any gesture is that gesture\'s (shadow2 fix 2)', () => {
  // vikunja fwvk13 #64: Confirm, then 139 ms after its window closed the POST
  // that saved the task. A GET that soon after a click is not claimed.
  it('a POST 139 ms after a click is the click\'s, late by debounce; a GET is not', () => {
    const windows = [win(64, 'gesture', 1_000, 1_140)];
    const [post] = attribute([req(1_279, 1_300, { m: 'POST', e: 'http://app/api/v1/tasks/4' })], windows);
    expect(post.c).toEqual(['late', 64, 'debounce']);
    const [get] = attribute([req(1_279, 1_300, { m: 'GET', e: 'http://app/api/v1/notifications' })], windows);
    expect(get.c).toEqual(['app', 'timer']);
  });
});

describe('a write soon after a navigation is not the navigation\'s', () => {
  it('an autosave 600 ms after a goto stays the app\'s', () => {
    const windows: JournalWindow[] = [{ w: 3, kind: 'gesture', tool: 'goto', start: 1_000, end: 1_200 }];
    const [post] = attribute([req(1_800, 1_850, { m: 'POST', e: 'http://app/api/autosave' })], windows);
    expect(post.c).toEqual(['app', 'timer']);
  });
});
