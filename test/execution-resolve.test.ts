/**
 * The shared locator-resolution policy, with fake observations.
 *
 * Every DECISION replay's `resolveChain` used to make lives in
 * `resolveCandidates` now (policy audit B8, gaps 14 and B8); replay is an
 * adapter that builds observations and reads the result. So these tests are
 * of the POLICY — each rule in isolation, over fake locators that answer
 * `count`, `textContent`, `boundingBox` and `evaluate` from a script — with
 * no browser. The browser-backed cases in test/replay.test.ts remain the
 * check that the daemon adapter changed nothing.
 */
import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import {
  RESOLVE_POLL_MS,
  candidateRank,
  identityFields,
  identityValues,
  orderCandidates,
  resolveCandidates,
  structuralCandidate,
  type CandidateObservation,
  type PointGeometry,
} from '../src/execution/resolve.js';
import { POINT_MARK, markPoint, pointLocator, pointToken } from '../src/execution/point.js';

// ---------------------------------------------------------------------------
// Fakes.
// ---------------------------------------------------------------------------

interface Script {
  /** What `count()` answers, per call (the last value repeats). */
  counts: number[];
  /** What `first().textContent()` answers. */
  text?: string;
  /** What `first().boundingBox()` answers (viewport coordinates). */
  box?: { x: number; y: number; width: number; height: number } | null;
  /** What `first().evaluate(leavesOrigin)` answers. */
  leaves?: boolean;
  /** `count()` throws. */
  throws?: boolean;
  /** Text per `nth(i)`, for the narrowed-ambiguity guard. */
  nthText?: Record<number, string>;
}

interface FakeLocator extends Locator {
  calls: string[];
}

function fakeLocator(script: Script, label = 'loc'): FakeLocator {
  const calls: string[] = [];
  let countCalls = 0;
  const self = {
    calls,
    toString: () => label,
    count: async () => {
      calls.push('count');
      if (script.throws) throw new Error('malformed selector');
      const n = script.counts[Math.min(countCalls, script.counts.length - 1)];
      countCalls++;
      return n;
    },
    first: () => self,
    textContent: async () => {
      calls.push('text');
      return script.text ?? '';
    },
    boundingBox: async () => {
      calls.push('box');
      return script.box === undefined ? { x: 0, y: 0, width: 10, height: 10 } : script.box;
    },
    evaluate: async () => {
      calls.push('evaluate');
      return script.leaves ?? false;
    },
    nth: (i: number) => {
      calls.push(`nth:${i}`);
      return fakeLocator({ counts: [1], text: script.nthText?.[i] ?? '' }, `${label}.nth(${i})`);
    },
  };
  return self as unknown as FakeLocator;
}

/** A page whose only jobs are the scroll offset (plausibility) and marking a point. */
function fakePage(o: { scroll?: { x: number; y: number }; marks?: Record<string, { role: string | null; tag: string } | null> } = {}): Page {
  return {
    evaluate: async (_fn: unknown, arg?: unknown) => {
      if (arg && typeof arg === 'object' && 'mark' in arg) {
        const { token } = arg as { token: string };
        return o.marks?.[token] ?? null;
      }
      return o.scroll ?? { x: 0, y: 0 };
    },
    locator: (selector: string) => fakeLocator({ counts: [1] }, `page.locator(${selector})`),
  } as unknown as Page;
}

function obs(over: Partial<CandidateObservation> & { locator: Locator; index: number }): CandidateObservation {
  return { structural: false, kind: 'role', carries: '', ...over };
}

const geometry: PointGeometry = { x: 100, y: 100, w: 20, h: 10, role: 'button', tag: 'button', vw: 900, vh: 600 };

// ---------------------------------------------------------------------------
// Classification and order (rule 1).
// ---------------------------------------------------------------------------

describe('structuralCandidate / candidateRank / orderCandidates', () => {
  it('reads position, not kind', () => {
    expect(structuralCandidate({ kind: 'css', selector: '#modal-save' })).toBe(false);
    expect(structuralCandidate({ kind: 'css', selector: '#view > div > button:nth-of-type(2)' })).toBe(true);
    expect(structuralCandidate({ kind: 'css', selector: 'ul li + li' })).toBe(true);
    expect(structuralCandidate({ kind: 'role', nth: 1 })).toBe(true);
    expect(structuralCandidate({ kind: 'point' })).toBe(true);
    expect(structuralCandidate({ kind: 'role' })).toBe(false);
  });

  it('ranks identity, handle, path, point', () => {
    expect(candidateRank({ kind: 'scoped', structural: false })).toBe(0);
    expect(candidateRank({ kind: 'role', structural: false })).toBe(1);
    expect(candidateRank({ kind: 'css', structural: true })).toBe(2);
    expect(candidateRank({ kind: 'point', structural: true })).toBe(3);
  });

  it('keeps recorded order within a class, retired last within a class, and never lets retirement cross a class', () => {
    const c = (kind: string, structural: boolean, retired?: boolean, tag = '') => ({ kind, structural, retired, tag: `${kind}${structural ? '/s' : ''}${retired ? '/r' : ''}${tag}` });
    const ordered = orderCandidates([
      c('css', true), // path
      c('role', false, true, '#1'), // retired handle
      c('point', true),
      c('role', false, false, '#2'), // live handle, recorded after the retired one
      c('scoped', false, true), // retired identity — still ahead of every handle
      c('testid', false, false, '#3'),
    ]);
    expect(ordered.map((o) => o.tag)).toEqual(['scoped/r', 'role#2', 'testid#3', 'role/r#1', 'css/s', 'point/s']);
  });
});

// ---------------------------------------------------------------------------
// The resolution rules, one at a time.
// ---------------------------------------------------------------------------

describe('resolveCandidates', () => {
  const page = fakePage();

  it('takes the primary when it is unique, with no misses', async () => {
    const primary = fakeLocator({ counts: [1] });
    const hit = await resolveCandidates(page, [obs({ locator: primary, index: 0 }), obs({ locator: fakeLocator({ counts: [1] }), index: 1 })]);
    expect(hit).toMatchObject({ locator: primary, index: 0, structural: false, missed: [] });
    expect(hit?.nth).toBeUndefined();
  });

  it('reports every candidate rejected ahead of the winner, with its reason, from the pass that resolved', async () => {
    const hit = await resolveCandidates(page, [
      obs({ locator: fakeLocator({ counts: [0] }), index: 0 }),
      obs({ locator: fakeLocator({ counts: [1], throws: true }), index: 1 }),
      obs({ locator: fakeLocator({ counts: [1] }), index: 2 }),
    ]);
    expect(hit?.index).toBe(2);
    expect(hit?.missed).toEqual([{ index: 0, reason: 'absent' }, { index: 1, reason: 'error' }]);
  });

  describe('identity (rule 3a)', () => {
    const identity = { requireIdentity: ['Part Two'] };

    it('exempts a non-structural primary, and guards every fallback by its text', async () => {
      // the primary is trusted whatever it shows
      const primary = fakeLocator({ counts: [1], text: 'Part One' });
      expect((await resolveCandidates(page, [obs({ locator: primary, index: 0 })], identity))?.index).toBe(0);
      expect(primary.calls).not.toContain('text');
      // a fallback showing another record is rejected...
      const wrong = fakeLocator({ counts: [1], text: 'Part One' });
      const right = fakeLocator({ counts: [1], text: 'Row: part two (open)' });
      const hit = await resolveCandidates(page, [
        obs({ locator: fakeLocator({ counts: [0] }), index: 0 }),
        obs({ locator: wrong, index: 1 }),
        obs({ locator: right, index: 2 }), // ...and one bearing it wins, case-insensitively
      ], identity);
      expect(hit?.index).toBe(2);
      expect(hit?.missed).toEqual([{ index: 0, reason: 'absent' }, { index: 1, reason: 'identity' }]);
    });

    it('does NOT exempt a structural primary — a positional head names no record', async () => {
      const head = fakeLocator({ counts: [1], text: 'Part One' });
      expect(await resolveCandidates(page, [obs({ locator: head, index: 0, structural: true, kind: 'css' })], identity)).toBeNull();
      expect(head.calls).toContain('text');
    });

    it('needs no guard for a value the candidate itself carries', async () => {
      const carries = fakeLocator({ counts: [1], text: '' });
      const hit = await resolveCandidates(page, [
        obs({ locator: fakeLocator({ counts: [0] }), index: 0 }),
        obs({ locator: carries, index: 1, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'tr', hasText: 'Part Two' }) }),
      ], identity);
      expect(hit?.index).toBe(1);
      expect(carries.calls).not.toContain('text');
    });

    it('rejects a fallback whose text cannot be read', async () => {
      const unreadable = fakeLocator({ counts: [1] });
      (unreadable as unknown as { textContent: () => Promise<string> }).textContent = async () => { throw new Error('detached'); };
      expect(await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: unreadable, index: 1 })], identity)).toBeNull();
    });
  });

  describe('plausibility (rule 3b)', () => {
    const point = (locator: Locator, index: number) => obs({ locator, index, kind: 'point', structural: true, point: geometry });

    it('rejects a guess far from the recorded box, and lets the point itself stand', async () => {
      const far = fakeLocator({ counts: [1], box: { x: 0, y: 3000, width: 10, height: 10 } });
      const marked = fakePage({ marks: { [pointToken(geometry)]: { role: 'button', tag: 'button' } } });
      const hit = await resolveCandidates(marked, [
        obs({ locator: fakeLocator({ counts: [0] }), index: 0, kind: 'testid' }),
        obs({ locator: far, index: 1, kind: 'css', structural: true }),
        point(fakeLocator({ counts: [1], box: { x: 0, y: 3000, width: 10, height: 10 } }), 2), // a point is never measured against itself
      ]);
      expect(hit?.index).toBe(2);
      expect(hit?.missed).toEqual([{ index: 0, reason: 'absent' }, { index: 1, reason: 'implausible' }]);
    });

    it('measures in document coordinates: a box near the point after scrolling is plausible', async () => {
      const scrolled = fakePage({ scroll: { x: 0, y: 90 } });
      const near = fakeLocator({ counts: [1], box: { x: 95, y: 5, width: 10, height: 10 } }); // centre (100, 100) once scroll is added
      const hit = await resolveCandidates(scrolled, [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: near, index: 1, structural: true, kind: 'css' }), point(fakeLocator({ counts: [0] }), 2)]);
      expect(hit?.index).toBe(1);
    });

    it('exempts a non-structural primary, has nothing to say without a recorded box, and lets an unmeasurable box through', async () => {
      const farPrimary = fakeLocator({ counts: [1], box: { x: 0, y: 3000, width: 10, height: 10 } });
      expect((await resolveCandidates(page, [obs({ locator: farPrimary, index: 0 }), point(fakeLocator({ counts: [0] }), 1)]))?.index).toBe(0);
      expect(farPrimary.calls).not.toContain('box');
      const farFallback = fakeLocator({ counts: [1], box: { x: 0, y: 3000, width: 10, height: 10 } });
      expect((await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: farFallback, index: 1, structural: true, kind: 'css' })]))?.index).toBe(1);
      const noBox = fakeLocator({ counts: [1], box: null });
      expect((await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: noBox, index: 1, structural: true, kind: 'css' }), point(fakeLocator({ counts: [0] }), 2)]))?.index).toBe(1);
    });
  });

  describe('origin (rule 3c)', () => {
    const origin = { stayOnOrigin: 'http://app.test' };

    it('rejects a guess inside a link leaving the recorded origin, and only a guess', async () => {
      const external = fakeLocator({ counts: [1], leaves: true });
      const chain = [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: external, index: 1, kind: 'css' })];
      expect(await resolveCandidates(page, chain, origin)).toBeNull();
      // without the recorded origin the old behaviour stands
      expect((await resolveCandidates(page, chain))?.index).toBe(1);
      expect((await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: fakeLocator({ counts: [1], leaves: false }), index: 1 })], origin))?.index).toBe(1);
    });

    it('trusts a recorded primary that is such a link — unless it is structural', async () => {
      const named = fakeLocator({ counts: [1], leaves: true });
      expect((await resolveCandidates(page, [obs({ locator: named, index: 0 })], origin))?.index).toBe(0);
      expect(named.calls).not.toContain('evaluate');
      const positional = fakeLocator({ counts: [1], leaves: true });
      expect(await resolveCandidates(page, [obs({ locator: positional, index: 0, structural: true, kind: 'css', nth: 0 })], origin)).toBeNull();
    });
  });

  describe('ambiguity (rule 4)', () => {
    it('treats an ambiguous primary as drift and keeps looking; an ambiguous fallback names nothing', async () => {
      const hit = await resolveCandidates(page, [
        obs({ locator: fakeLocator({ counts: [2] }), index: 0 }),
        obs({ locator: fakeLocator({ counts: [3] }), index: 1 }),
        obs({ locator: fakeLocator({ counts: [1] }), index: 2 }),
      ]);
      expect(hit?.index).toBe(2);
      expect(hit?.missed).toEqual([{ index: 0, reason: 'ambiguous' }, { index: 1, reason: 'ambiguous' }]);
      expect(await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [2] }), index: 0 })])).toBeNull();
    });

    it('allowMultiple takes the first candidate matching anything', async () => {
      const many = fakeLocator({ counts: [4] });
      const hit = await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: many, index: 1 })], { allowMultiple: true });
      expect(hit).toMatchObject({ locator: many, index: 1, missed: [{ index: 0, reason: 'absent' }] });
      expect(hit?.nth).toBeUndefined();
      expect(many.calls).not.toContain('nth:0');
    });

    it('ambiguousNth narrows to the cursor, identity-guarded, and reports the nth', async () => {
      const rows = fakeLocator({ counts: [3], nthText: { 0: 'Part One', 1: 'Part Two', 2: 'Part Three' } });
      const hit = await resolveCandidates(page, [obs({ locator: rows, index: 0 })], { ambiguousNth: 1 });
      expect(hit).toMatchObject({ index: 0, nth: 1, missed: [] });
      expect(String(hit?.locator)).toBe('loc.nth(1)');
      // the picked match must still bear the record's identity...
      const guarded = await resolveCandidates(page, [obs({ locator: rows, index: 0, structural: true, kind: 'css' })], { ambiguousNth: 0, requireIdentity: ['Part Two'] });
      expect(guarded).toBeNull();
      expect((await resolveCandidates(page, [obs({ locator: rows, index: 0, structural: true, kind: 'css' })], { ambiguousNth: 1, requireIdentity: ['Part Two'] }))?.nth).toBe(1);
      // ...a cursor past the count, or a candidate whose ambiguity was recorded (nth set), is not narrowed
      expect(await resolveCandidates(page, [obs({ locator: rows, index: 0 })], { ambiguousNth: 3 })).toBeNull();
      expect(await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [3] }), index: 0, nth: 0, structural: true })], { ambiguousNth: 1 })).toBeNull();
    });
  });

  describe('points (rule 2)', () => {
    it('marks the point before counting, and misses when nothing of the recorded kind is there', async () => {
      const marked = fakePage({ marks: { [pointToken(geometry)]: { role: 'button', tag: 'button' } } });
      const unmarked = fakePage({ marks: {} });
      const chain = [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: fakeLocator({ counts: [1] }), index: 1, kind: 'point', structural: true, point: geometry })];
      expect((await resolveCandidates(marked, chain))?.index).toBe(1);
      expect(await resolveCandidates(unmarked, chain)).toBeNull();
      // a point observation with no geometry cannot be marked at all
      expect(await resolveCandidates(marked, [obs({ locator: fakeLocator({ counts: [1] }), index: 0, kind: 'point', structural: true })])).toBeNull();
    });

    it('names what markPoint tagged through the shared marker attribute', async () => {
      const page = fakePage({ marks: { [pointToken(geometry)]: { role: 'button', tag: 'button' } } });
      expect(await markPoint(page, geometry)).toEqual({ role: 'button', tag: 'button' });
      expect(String(pointLocator(page, geometry))).toBe(`page.locator([${POINT_MARK}="100,100"])`);
      const broken = { evaluate: async () => { throw new Error('navigating'); } } as unknown as Page;
      expect(await markPoint(broken, geometry)).toBeNull();
    });
  });

  describe('the hold and the wait (rules 5 and 6)', () => {
    const fast = { waitMs: 40, pollMs: 5 };

    it('re-walks the whole chain on a poll until something resolves, and reports misses from the pass that resolved', async () => {
      const late = fakeLocator({ counts: [0, 0, 0, 1] });
      const hit = await resolveCandidates(page, [obs({ locator: late, index: 0 }), obs({ locator: fakeLocator({ counts: [0] }), index: 1 })], fast);
      expect(hit).toMatchObject({ index: 0, missed: [] });
      expect(late.calls.filter((c) => c === 'count')).toHaveLength(4);
      // and gives up after the window
      expect(await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0] }), index: 0 })], fast)).toBeNull();
    });

    it('holds a structural hit while the chain names the element, and takes the name once it lands', async () => {
      const name = fakeLocator({ counts: [0, 0, 1] });
      const path = fakeLocator({ counts: [1] });
      const held = await resolveCandidates(page, [obs({ locator: name, index: 0, kind: 'testid' }), obs({ locator: path, index: 1, kind: 'css', structural: true })], fast);
      expect(held).toMatchObject({ index: 0, structural: false, missed: [] });
      // the guess stands only when no name came within the window...
      const stood = await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0] }), index: 0, kind: 'testid' }), obs({ locator: fakeLocator({ counts: [1] }), index: 1, kind: 'css', structural: true })], fast);
      expect(stood).toMatchObject({ index: 1, structural: true, missed: [{ index: 0, reason: 'absent' }] });
      // ...and with no window it stands at once
      const bare = await resolveCandidates(page, [obs({ locator: fakeLocator({ counts: [0, 1] }), index: 0, kind: 'testid' }), obs({ locator: fakeLocator({ counts: [1] }), index: 1, kind: 'css', structural: true })], { waitMs: 0 });
      expect(bare?.index).toBe(1);
    });

    it('does not hold a structural hit when nothing in the chain names the element', async () => {
      const path = fakeLocator({ counts: [1] });
      const hit = await resolveCandidates(page, [obs({ locator: path, index: 0, kind: 'css', structural: true }), obs({ locator: fakeLocator({ counts: [1] }), index: 1, kind: 'css', structural: true })], fast);
      expect(hit?.index).toBe(0);
      expect(path.calls.filter((c) => c === 'count')).toHaveLength(1);
    });

    it('honours retirement: a retired handle is tried after a live one of the same class', async () => {
      const retiredLoc = fakeLocator({ counts: [1] });
      const live = fakeLocator({ counts: [1] });
      const hit = await resolveCandidates(page, [obs({ locator: retiredLoc, index: 0, retired: true }), obs({ locator: live, index: 1 })]);
      expect(hit).toMatchObject({ index: 1, missed: [] });
      expect(retiredLoc.calls).toEqual([]);
      // but a retired identity candidate still walks ahead of every handle
      const anchor = fakeLocator({ counts: [1] });
      const handle = fakeLocator({ counts: [1] });
      expect((await resolveCandidates(page, [obs({ locator: handle, index: 0 }), obs({ locator: anchor, index: 1, kind: 'scoped', retired: true })]))?.index).toBe(1);
      expect(handle.calls).toEqual([]);
    });

    it('polls at RESOLVE_POLL_MS unless told otherwise', () => {
      expect(RESOLVE_POLL_MS).toBe(100);
    });
  });
});

// ---------------------------------------------------------------------------
// identityValues — the identityOfPrimary rule as a pure function.
// ---------------------------------------------------------------------------

describe('identityValues', () => {
  const known = { v1: 'r9-n2 RD Bench Ticket', v2: 'ab', v3: 'Widget A' };

  it('collects the known values that name the target, deduplicated, and nothing else', () => {
    // a known slot in a text-bearing field
    expect(identityValues(known, ['{{v1}}'])).toEqual(['r9-n2 RD Bench Ticket']);
    // the same slot twice is one value
    expect(identityValues(known, ['Ticket {{v1}}', '{{v1}}'])).toEqual(['r9-n2 RD Bench Ticket']);
    // several slots, in first-seen order
    expect(identityValues(known, ['{{v3}} / {{v1}}'])).toEqual(['Widget A', 'r9-n2 RD Bench Ticket']);
    // a slot that is not known is not identity
    expect(identityValues({}, ['{{v1}}'])).toEqual([]);
    expect(identityValues({ v1: undefined }, ['{{v1}}'])).toEqual([]);
    // a value shorter than three characters pins nothing
    expect(identityValues(known, ['{{v2}}'])).toEqual([]);
    // a literal name carries no slot
    expect(identityValues(known, ['Save'])).toEqual([]);
    // no fields, no identity
    expect(identityValues(known, [])).toEqual([]);
  });

  it('identityFields reads only what a candidate NAMES — never a selector or a testid value', () => {
    expect(identityFields({ name: 'a', text: 'b', label: 'c', hasText: 'd' })).toEqual(['a', 'b', 'c', 'd']);
    expect(identityFields({ kind: 'css', selector: "//tr[contains(., '{{v5}}')]" } as { name?: string })).toEqual([]);
    expect(identityFields({ kind: 'testid', attr: 'data-testid', value: '{{v5}}' } as { name?: string })).toEqual([]);
    expect(identityFields({ kind: 'role', role: 'button' } as { name?: string })).toEqual([]);
  });
});
