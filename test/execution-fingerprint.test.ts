/**
 * The structural page fingerprint (src/execution/fingerprint.ts): the one
 * measurement both runners take before a soft url match. The daemon imports it
 * (through daemon/fingerprint.ts); a compiled artifact embeds its source and
 * carries the recorded vector in FLOW. Nothing here touches a browser — the
 * page function runs over a minimal fake DOM, and is rebuilt from its own
 * text first, as Playwright serialises it, to prove it needs no module scope.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as daemon from '../src/daemon/fingerprint.js';
import {
  FINGERPRINT_CAPTURE_TIMEOUT_MS,
  FINGERPRINT_DIMS,
  cosine,
  fingerprintPage,
  fingerprintPathsInPage,
  normaliseFingerprint,
} from '../src/execution/fingerprint.js';
import { SOFT_MATCH_MIN_SIMILARITY, preconditionVerdict } from '../src/execution/gates.js';

/** Just enough of an Element for the page function: tag, attributes, classes, parent. */
interface FakeElement {
  tagName: string;
  parentElement: FakeElement | null;
  classList: string[];
  getAttribute(name: string): string | null;
  closest(selector: string): FakeElement | null;
}

type Node = [tag: string, attrs?: Record<string, string>, children?: Node[]];

/** A fake `document` whose `querySelectorAll('body *')` walks `tree` in document order. */
function fakeDocument(tree: Node[]): { querySelectorAll(selector: string): FakeElement[] } {
  const all: FakeElement[] = [];
  const body: FakeElement = { tagName: 'BODY', parentElement: null, classList: [], getAttribute: () => null, closest: () => null };
  const build = (node: Node, parent: FakeElement) => {
    const [tag, attrs = {}, children = []] = node;
    const el: FakeElement = {
      tagName: tag.toUpperCase(),
      parentElement: parent,
      classList: (attrs.class ?? '').split(/\s+/).filter(Boolean),
      getAttribute: (name) => (name in attrs ? attrs[name] : null),
      closest: (selector) => {
        if (selector !== 'svg') return null;
        for (let e: FakeElement | null = el; e; e = e.parentElement) if (e.tagName === 'SVG') return e;
        return null;
      },
    };
    all.push(el);
    for (const child of children) build(child, el);
  };
  for (const node of tree) build(node, body);
  return {
    querySelectorAll: (selector) => {
      if (selector !== 'body *') throw new Error(`unexpected selector ${selector}`);
      return all;
    },
  };
}

/** The page function as Playwright runs it: from its own source text, with nothing of this module in scope. */
function serialised(): typeof fingerprintPathsInPage {
  return new Function(`return (${fingerprintPathsInPage.toString()});`)() as typeof fingerprintPathsInPage;
}

/** Run `fn` with `document` bound globally, as it is inside a page. */
function inPage<T>(doc: unknown, fn: () => T): T {
  const g = globalThis as { document?: unknown };
  const had = 'document' in g;
  const previous = g.document;
  g.document = doc;
  try {
    return fn();
  } finally {
    if (had) g.document = previous;
    else delete g.document;
  }
}

/** The record page of test/fixture/server.ts, structurally. */
const RECORD_PAGE: Node[] = [['h1'], ['button', { class: 'mark', type: 'button' }], ['script']];
/** Its project page, structurally — a different template. */
const PROJECT_PAGE: Node[] = [['h1'], ['select', { 'aria-label': 'Project' }, [['option'], ['option'], ['option']]], ['button', { id: 'save', type: 'button' }], ['script']];

/** A fake Page whose evaluate runs the page function against `tree`. */
function pageOf(tree: Node[]) {
  return {
    evaluate: async (fn: unknown, arg: unknown) => {
      // the adapter hands Playwright the page function itself; run it as Playwright would, from its text
      expect(fn).toBe(fingerprintPathsInPage);
      return inPage(fakeDocument(tree), () => serialised()(arg as never));
    },
  } as unknown as Parameters<typeof fingerprintPage>[0];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fingerprintPathsInPage', () => {
  it('is closure-free: rebuilt from its own text, it runs with only `document` in scope', () => {
    const counts = inPage(fakeDocument(RECORD_PAGE), () => serialised()({ maxNodes: 3_000, dims: FINGERPRINT_DIMS }));
    expect(counts).toHaveLength(FINGERPRINT_DIMS);
    // body/h1 and body/button.mark, each with its bare segment at half weight; the script is skipped
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('ignores text, ids and generated classes, and caps the nodes it walks', () => {
    const plain = inPage(fakeDocument([['div', { class: 'card' }]]), () => serialised()({ maxNodes: 10, dims: FINGERPRINT_DIMS }));
    const noisy = inPage(fakeDocument([['div', { class: 'card css-1a2b3c _hidden abc123def', id: 'x-99' }]]), () => serialised()({ maxNodes: 10, dims: FINGERPRINT_DIMS }));
    expect(noisy).toEqual(plain);
    const capped = inPage(fakeDocument([['p'], ['p'], ['p']]), () => serialised()({ maxNodes: 1, dims: FINGERPRINT_DIMS }));
    expect(capped.reduce((a, b) => a + b, 0)).toBe(1.5);
  });
});

describe('normaliseFingerprint', () => {
  it('L2-normalises and rounds to three decimals; an empty page stays all zeros', () => {
    const v = normaliseFingerprint([3, 4, ...new Array(FINGERPRINT_DIMS - 2).fill(0)]);
    expect(v.slice(0, 2)).toEqual([0.6, 0.8]);
    expect(v).toHaveLength(FINGERPRINT_DIMS);
    expect(normaliseFingerprint([1, 1, 1])).toEqual([0.577, 0.577, 0.577]);
    expect(normaliseFingerprint(new Array(4).fill(0))).toEqual([0, 0, 0, 0]);
  });
});

describe('cosine', () => {
  it('is null when nothing comparable was measured', () => {
    expect(cosine(undefined, [1])).toBeNull();
    expect(cosine([1], undefined)).toBeNull();
    expect(cosine([], [])).toBeNull();
    expect(cosine([1, 0], [1, 0, 0])).toBeNull();
  });

  it('is null when either vector holds a non-finite entry, as the IR omits such a vector', () => {
    // A NaN stored to JSON comes back as null; a hand-edited store can hold anything.
    const stored = [0.6, null, 0.8] as unknown as number[];
    expect(cosine(stored, [0.6, 0, 0.8])).toBeNull();
    expect(cosine([0.6, 0, 0.8], stored)).toBeNull();
    expect(cosine([NaN, 1], [1, 0])).toBeNull();
    expect(cosine([1, 0], [Infinity, 0])).toBeNull();
    expect(cosine([1, 0], [-Infinity, 0])).toBeNull();
    expect(cosine(['1', 0] as unknown as number[], [1, 0])).toBeNull();
    // The verdict with null is the verdict the artifact reaches with no carried vector.
    expect(preconditionVerdict('https://x.test/a/b', 'https://x.test/a/c', {}, cosine(stored, [0.6, 0, 0.8]))).toEqual(
      preconditionVerdict('https://x.test/a/b', 'https://x.test/a/c', {}, null),
    );
  });

  it('rounds to three decimals', () => {
    expect(cosine([0.6, 0.8], [0.6, 0.8])).toBe(1);
    expect(cosine([1, 0], [0.7071, 0.7071])).toBe(0.707);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
});

describe('fingerprintPage', () => {
  it('measures a page into a stable, normalised vector of FINGERPRINT_DIMS', async () => {
    const a = await fingerprintPage(pageOf(RECORD_PAGE));
    const b = await fingerprintPage(pageOf(RECORD_PAGE));
    expect(a).toHaveLength(FINGERPRINT_DIMS);
    expect(a).toEqual(b);
    // rounding at capture costs at most a thousandth; both runners pay it identically
    expect(cosine(a!, b!)!).toBeGreaterThanOrEqual(0.999);
    // every entry is already at the stored precision
    expect(a!.every((x) => Math.round(x * 1000) / 1000 === x)).toBe(true);
  });

  it('tells the fixture record page from the fixture project page', async () => {
    const record = await fingerprintPage(pageOf(RECORD_PAGE));
    const project = await fingerprintPage(pageOf(PROJECT_PAGE));
    expect(cosine(record!, project!)!).toBeLessThan(SOFT_MATCH_MIN_SIMILARITY);
  });

  it('is null, never a throw, when the page cannot be read', async () => {
    const throwing = { evaluate: async () => { throw new Error('navigating'); } } as unknown as Parameters<typeof fingerprintPage>[0];
    expect(await fingerprintPage(throwing)).toBeNull();
  });

  it('is null when the page does not answer in time, and clears its timer', async () => {
    vi.useFakeTimers();
    const hung = { evaluate: () => new Promise(() => {}) } as unknown as Parameters<typeof fingerprintPage>[0];
    const pending = fingerprintPage(hung);
    await vi.advanceTimersByTimeAsync(FINGERPRINT_CAPTURE_TIMEOUT_MS);
    expect(await pending).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is what the daemon imports', () => {
    expect(daemon.fingerprintPage).toBe(fingerprintPage);
    expect(daemon.cosine).toBe(cosine);
    expect(daemon.FINGERPRINT_DIMS).toBe(FINGERPRINT_DIMS);
  });
});

/**
 * The storage decision: the IR carries the stored vector VERBATIM, already at
 * three decimals, so the artifact's cosine is the daemon's cosine to the last
 * digit — no second rounding exists that could move a similarity across
 * SOFT_MATCH_MIN_SIMILARITY. The size a flow file pays per fingerprinted
 * segment is bounded: every entry is at most `0.xyz` (or `0`/`1`) plus a comma.
 */
describe('the carried vector', () => {
  it('gives the same verdict from the carried copy as from the store', async () => {
    const stored = await fingerprintPage(pageOf(RECORD_PAGE));
    const carried = JSON.parse(JSON.stringify(stored)) as number[];
    const live = await fingerprintPage(pageOf(RECORD_PAGE));
    expect(cosine(carried, live!)).toBe(cosine(stored!, live!));
    const verdict = (s: number | null) => preconditionVerdict('http://app.test/record/rec-1', 'http://app.test/record/rec-2', {}, s);
    expect(verdict(cosine(carried, live!))).toEqual(verdict(cosine(stored!, live!)));
    expect(verdict(cosine(carried, live!)).soft).toBeDefined();
  });

  it('costs at most about 3KB of JSON per segment', () => {
    const worst = new Array(FINGERPRINT_DIMS).fill(0.001 + 0.123);
    expect(JSON.stringify(normaliseFingerprint(worst)).length).toBeLessThanOrEqual(FINGERPRINT_DIMS * 6 + 1);
    expect(FINGERPRINT_DIMS * 6 + 1).toBe(3073);
  });
});
