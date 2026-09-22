/**
 * Locator source tests. Two halves: the exact text emitted for every
 * candidate kind (the emitter pastes it verbatim, so escaping is the whole
 * job), and - under BP_BROWSER_TESTS=1 - proof that the emitted expression
 * resolves the SAME element as makeLocator on the fixture page.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/spec-locators.test.ts
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Locator } from 'playwright-core';
import { BrowserSession } from '../src/daemon/browser.js';
import { pointLocator } from '../src/execution/point.js';
import { resolveCandidates, type CandidateObservation } from '../src/execution/resolve.js';
import { makeLocator, type LocatorCandidate } from '../src/daemon/recorder.js';
import { VOLATILE_TOKEN_SHAPE, fieldByName, roleName, volatileMatcher } from '../src/shared/text.js';
import { candidateSource, chainSource, matcherSource, observationSource, observationSources, stringSource } from '../src/spec/locators.js';

/** What the generated file inlines; the regex tests need it in scope. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Evaluate emitted source the way the generated spec would run it. */
const evaluate = (src: string, p: Record<string, string> = {}): unknown =>
  new Function('page', 'p', 'escapeRe', `return ${src}`)(null, p, escapeRe);

describe('stringSource', () => {
  it('single-quotes plain text', () => {
    expect(stringSource('Save')).toBe("'Save'");
  });

  it('escapes quotes, backslashes and newlines', () => {
    expect(stringSource("O'Brien")).toBe("'O\\'Brien'");
    expect(stringSource('C:\\dev\\x')).toBe("'C:\\\\dev\\\\x'");
    expect(stringSource('a\nb\tc')).toBe("'a\\nb\\tc'");
    expect(evaluate(stringSource("a'b\\c\nd"))).toBe("a'b\\c\nd");
  });

  it('renders slots as interpolations in a template literal', () => {
    expect(stringSource('Ticket {{v1}} / {{d2}}')).toBe('`Ticket ${p.v1} / ${p.d2}`');
    expect(evaluate(stringSource('Ticket {{v1}}'), { v1: 'RD-9' })).toBe('Ticket RD-9');
  });

  it('escapes backticks and ${ around a slot, so the literal cannot be broken out of', () => {
    const src = stringSource('a `b` ${c} \\ {{v1}}');
    expect(src).toBe('`a \\`b\\` \\${c} \\\\ ${p.v1}`');
    expect(evaluate(src, { v1: 'x' })).toBe('a `b` ${c} \\ x');
  });

  it('honours a caller slot renderer', () => {
    expect(stringSource('id {{v1}}', { slot: (s) => '${vars.' + s + '}' })).toBe('`id ${vars.v1}`');
  });
});

describe('matcherSource', () => {
  const VOLATILE = 'Due date: 12/31/2026 07:40';

  it('is stringSource when volatileMatcher would return the string', () => {
    expect(volatileMatcher('Submit')).toBe('Submit');
    expect(matcherSource('Submit')).toBe("'Submit'");
    expect(matcherSource('Ticket {{v1}}')).toBe('`Ticket ${p.v1}`');
  });

  it('emits a RegExp literal that behaves like volatileMatcher', () => {
    const src = matcherSource(VOLATILE);
    expect(src.startsWith('/^Due date: ')).toBe(true);
    const re = evaluate(src) as RegExp;
    const ref = volatileMatcher(VOLATILE) as RegExp;
    for (const sample of [VOLATILE, 'Due date: 01/02/2027 23:59', 'Due date: nope 07:40', 'xDue date: 12/31/2026 07:40']) {
      expect(re.test(sample)).toBe(ref.test(sample));
    }
  });

  it('leans on RegExp.source for the slashes, so the literal is never double-escaped', () => {
    // Inside a character class a slash needs no escape and gets none; a bare
    // one would end the literal, and source has already escaped it.
    expect(matcherSource(VOLATILE)).toContain('[/.-]');
    const src = matcherSource('at 07:40 in a/b');
    expect(src).toContain('a\\/b');
    const re = evaluate(src) as RegExp;
    expect(re).toBeInstanceOf(RegExp);
    expect(re.test('at 09:15 in a/b')).toBe(true);
    expect(re.test('at 09:15 in a\\/b')).toBe(false);
  });

  it('routes a slot through escapeRe inside new RegExp, so a parameter stays data', () => {
    const src = matcherSource('Ticket {{v1}} due 12/31/2026');
    // the volatile shape itself is text.ts's (VOLATILE_TOKEN_SHAPE), spliced in whole
    expect(src).toBe('new RegExp(`^Ticket ${escapeRe(p.v1)} due ' + VOLATILE_TOKEN_SHAPE.replace(/\\/g, '\\\\') + '$`)');
    const re = evaluate(src, { v1: 'a+b' }) as RegExp;
    expect(re.test('Ticket a+b due 01/02/2027')).toBe(true);
    expect(re.test('Ticket aab due 01/02/2027')).toBe(false);
  });

  it('never lets recorded text escape the regex it is spliced into', () => {
    const re = evaluate(matcherSource('a) or (b at 07:40')) as RegExp;
    expect(re.test('a) or (b at 09:15')).toBe(true);
    expect(re.test('b at 09:15')).toBe(false);
  });
});

describe('candidateSource', () => {
  const cases: Array<[string, LocatorCandidate, string | null]> = [
    ['testid', { kind: 'testid', attr: 'data-testid', value: 'del-1' }, "page.getByTestId('del-1')"],
    ['testid (other attr, quoted value)', { kind: 'testid', attr: 'data-qa', value: 'a"b' }, 'page.locator(\'[data-qa="a\\\\"b"]\')'],
    ['role', { kind: 'role', role: 'button', name: 'Edit' }, "page.getByRole('button', { name: roleName('Edit'), exact: true })"],
    ['label', { kind: 'label', label: 'Name' }, "page.getByLabel('Name')"],
    ['placeholder', { kind: 'placeholder', placeholder: 'Search' }, "page.getByPlaceholder('Search')"],
    ['text', { kind: 'text', text: 'Row Alpha' }, "page.getByText('Row Alpha', { exact: true })"],
    ['id', { kind: 'id', selector: '#name' }, "page.locator('#name')"],
    ['css', { kind: 'css', selector: 'div[title="a b"] > button' }, 'page.locator(\'div[title="a b"] > button\')'],
    [
      'scoped',
      { kind: 'scoped', container: '#editlist .erow', hasText: 'Item One', selector: 'button' },
      "page.locator('#editlist .erow', { hasText: 'Item One' }).locator('button')",
    ],
    [
      'scoped without a selector',
      { kind: 'scoped', container: 'tr', hasText: "O'Brien" },
      "page.locator('tr', { hasText: 'O\\'Brien' })",
    ],
    ['point', { kind: 'point', x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 1280, vh: 720 }, null],
  ];
  for (const [name, candidate, expected] of cases) {
    it(`emits ${name}`, () => {
      expect(candidateSource(candidate)).toBe(expected);
    });
  }

  it('appends the recorded match index, as makeLocator does', () => {
    expect(candidateSource({ kind: 'role', role: 'button', name: 'Edit', nth: 1 })).toBe(
      "page.getByRole('button', { name: roleName('Edit'), exact: true }).nth(1)",
    );
  });

  it('slots the value of every kind that carries one', () => {
    expect(candidateSource({ kind: 'testid', attr: 'data-testid', value: 'row-{{v1}}' })).toBe('page.getByTestId(`row-${p.v1}`)');
    expect(candidateSource({ kind: 'scoped', container: 'tr', hasText: '{{v2}}', selector: 'button' })).toBe(
      "page.locator('tr', { hasText: `${p.v2}` }).locator('button')",
    );
  });

  it('takes the page expression from the options', () => {
    expect(candidateSource({ kind: 'id', selector: '#name' }, { page: 'frame' })).toBe("frame.locator('#name')");
  });
});

describe('chainSource', () => {
  const identity: LocatorCandidate = { kind: 'scoped', container: '#editlist .erow', hasText: 'Item One', selector: 'button' };
  const role: LocatorCandidate = { kind: 'role', role: 'button', name: 'Edit' };
  const positional: LocatorCandidate = { kind: 'css', selector: '#editlist > div:nth-of-type(1) > button' };
  const point: LocatorCandidate = { kind: 'point', x: 1, y: 2, w: 3, h: 4, role: 'button', tag: 'button', vw: 1280, vh: 720 };

  it('keeps STORED order, guards nothing, and drops the point', () => {
    const { source, dropped } = chainSource([positional, role, identity, point]);
    expect(source).toBe(
      "page.locator('#editlist > div:nth-of-type(1) > button')\n" +
        "  .or(page.getByRole('button', { name: roleName('Edit'), exact: true }))\n" +
        "  .or(page.locator('#editlist .erow', { hasText: 'Item One' }).locator('button'))",
    );
    expect(dropped).toEqual([point]);
    // Identity is the runtime policy's rule now, not a compile-time filter.
    expect(source).not.toContain('.filter({ hasText');
    expect(Object.keys(chainSource([positional, role, identity, point]))).toEqual(['source', 'dropped']);
  });

  it('leaves a chain without identity unguarded', () => {
    const { source } = chainSource([role, positional]);
    expect(source).toContain(".or(page.locator('#editlist > div:nth-of-type(1) > button'))");
    expect(source).not.toContain('filter');
  });

  it('does not guard a candidate that already names the record', () => {
    const { source } = chainSource([identity, { kind: 'text', text: 'Item One' }]);
    expect(source).toContain(".or(page.getByText('Item One', { exact: true }))");
  });

  it('indents continuation lines with the caller indent', () => {
    const { source } = chainSource([role, positional], { indent: '      ' });
    expect(source.split('\n')[1].startsWith('      .or(')).toBe(true);
  });

  it('is empty when nothing in the chain can be expressed', () => {
    expect(chainSource([point])).toEqual({ source: '', dropped: [point] });
  });

  it('keeps duplicates: a union is stored order, not a set', () => {
    const { source } = chainSource([role, role]);
    expect(source).toBe(
      "page.getByRole('button', { name: roleName('Edit'), exact: true })\n" +
        "  .or(page.getByRole('button', { name: roleName('Edit'), exact: true }))",
    );
  });
});

/**
 * The observation literal each candidate becomes for the shared policy
 * (`CandidateObservation`, src/execution/resolve.ts). What the daemon builds
 * live, the artifact renders here: same locator, same stored index, the same
 * `structuralCandidate` verdict, and the candidate's own JSON as `carries`.
 */
describe('observationSource / observationSources', () => {
  const identity: LocatorCandidate = { kind: 'scoped', container: '#editlist .erow', hasText: 'Item One', selector: 'button' };
  const role: LocatorCandidate = { kind: 'role', role: 'button', name: 'Edit' };
  const positional: LocatorCandidate = { kind: 'css', selector: '#editlist > div:nth-of-type(1) > button' };
  const point: LocatorCandidate = { kind: 'point', x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 };

  it('renders the live locator, the stored index, the shared structural verdict, the kind and what it carries', () => {
    expect(observationSource(role, 0)).toBe(
      "{ locator: page.getByRole('button', { name: roleName('Edit'), exact: true }), index: 0, structural: false, kind: 'role', " +
        "carries: JSON.stringify({ kind: 'role', role: 'button', name: 'Edit' }) }",
    );
    // structuralCandidate's own rule, not a restatement of it: a css path.
    expect(observationSource(positional, 1)).toBe(
      "{ locator: page.locator('#editlist > div:nth-of-type(1) > button'), index: 1, structural: true, kind: 'css', " +
        "carries: JSON.stringify({ kind: 'css', selector: '#editlist > div:nth-of-type(1) > button' }) }",
    );
    expect(observationSource({ kind: 'css', selector: '.plain' }, 2)).toContain('structural: false');
  });

  // The shared snapshotRefCandidate, rendered as replay's resolveChain passes
  // it — only when true — so the artifact never tries a stored `aria-ref=e423`.
  it('marks a snapshot ref ephemeral, and nothing else', () => {
    expect(observationSource({ kind: 'css', selector: 'aria-ref=e423' }, 0)).toContain('ephemeral: true');
    expect(observationSource({ kind: 'css', selector: '.plain' }, 0)).not.toContain('ephemeral');
    expect(observationSource(role, 0)).not.toContain('ephemeral');
  });

  it('carries the slots as a template literal, so a parameter is filled at run time', () => {
    const src = observationSource({ kind: 'role', role: 'button', name: 'Save {{v1}}' }, 0);
    expect(src).toContain("carries: JSON.stringify({ kind: 'role', role: 'button', name: `Save ${p.v1}` })");
    expect(src).toContain("name: `Save ${p.v1}`");
  });

  it('leaves replay evidence out of carries: `seen` is not text the candidate names', () => {
    const src = observationSource({ kind: 'text', text: 'Row Alpha', seen: { hit: 3, miss: 1 } }, 0);
    expect(src).toContain("carries: JSON.stringify({ kind: 'text', text: 'Row Alpha' })");
    expect(src).not.toContain('seen');
  });

  /**
   * Review C6, F3. The daemon's `carries` is `JSON.stringify` of the FILLED
   * candidate, so a value holding a `"` or `\` appears escaped and the
   * identity guard runs for it. Interpolating the value raw into JSON text
   * put the bare `"` there instead, `includes(value)` held, and the guard was
   * skipped — the artifact acting where the daemon guards. Encoding at run
   * time, after the fill, is the daemon's own order.
   */
  it('encodes carries at run time, after the fill, so a value with a quote is guarded as the daemon guards it', async () => {
    const value = 'Row "A" \\ B';
    const src = observationSource({ kind: 'role', role: 'button', name: 'Open {{v1}}' }, 1);
    expect(src).toContain("carries: JSON.stringify({ kind: 'role', role: 'button', name: `Open ${p.v1}` })");

    const locatorOf = (text: string) => {
      const self = {
        count: async () => 1,
        first: () => self,
        textContent: async () => text,
        boundingBox: async () => null,
        evaluate: async () => false,
      };
      return self as unknown as Locator;
    };
    const pageWith = (text: string) => ({ url: () => 'http://x.test/', getByRole: () => locatorOf(text), evaluate: async () => ({ x: 0, y: 0 }) });
    // roleName is in scope in the artifact (the embedded shared text module); here it is passed in.
    const observe = (page: unknown) => new Function('page', 'p', 'roleName', `return ${src}`)(page, { v1: value }, roleName) as CandidateObservation;

    // the same text the daemon builds: JSON of the filled candidate
    expect(observe(pageWith('')).carries).toBe(JSON.stringify({ kind: 'role', role: 'button', name: `Open ${value}` }));
    expect(observe(pageWith('')).carries).not.toContain(value);

    // ...so the shared policy guards the fallback by its text, in both runners:
    // an element bearing nothing of the value is refused, one bearing it is taken
    const bare = pageWith('');
    expect(await resolveCandidates(bare as never, [observe(bare)], { requireIdentity: [value], waitMs: 0 })).toBeNull();
    const bearing = pageWith(`Open ${value}`);
    expect((await resolveCandidates(bearing as never, [observe(bearing)], { requireIdentity: [value], waitMs: 0 }))?.index).toBe(1);
  });

  it('adds the label fallback to a stored role=…[name] field, and to nothing else', () => {
    expect(candidateSource({ kind: 'css', selector: 'role=textbox[name="Part name *"]' })).toBe(
      "page.locator('role=textbox[name=\"Part name *\"]').or(page.getByRole(\"textbox\").and(page.getByLabel('Part name *', { exact: true })))",
    );
    expect(candidateSource({ kind: 'css', selector: 'dialog >> role=spinbutton[name="Cost *"]' })).toContain(
      ".or(page.locator('dialog').getByRole(\"spinbutton\").and(page.locator('dialog').getByLabel('Cost *', { exact: true })))",
    );
    // a role the label does not name, and any other selector, stay as they were
    expect(candidateSource({ kind: 'css', selector: 'role=button[name="Save"]' })).toBe("page.locator('role=button[name=\"Save\"]')");
    expect(candidateSource({ kind: 'css', selector: '#name' })).toBe("page.locator('#name')");
    expect(fieldByName('role=textbox[name="A \\"q\\""]')).toEqual({ scope: null, role: 'textbox', name: 'A "q"' });
  });

  it('puts the recorded match index on BOTH the locator and the observation', () => {
    const src = observationSource({ kind: 'css', selector: 'button.dup', nth: 1 }, 0);
    expect(src).toContain("locator: page.locator('button.dup').nth(1)");
    expect(src).toContain('nth: 1');
    // A recorded match index is a position, so it is structural whatever the kind.
    expect(src).toContain('structural: true');
  });

  it('renders a point as pointLocator with its recorded geometry', () => {
    expect(observationSource(point, 2)).toBe(
      '{ locator: pointLocator(page, { x: 10, y: 20 }), index: 2, structural: true, ' +
        "kind: 'point', carries: JSON.stringify({ kind: 'point', x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 })" +
        ", point: { x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 } }",
    );
  });

  it('renders a point with no recorded role as role: null, never as the string', () => {
    const src = observationSource({ ...point, role: null }, 0);
    expect(src).toContain('role: null');
    expect(src).not.toContain("role: 'null'");
  });

  it('takes the page expression from the options, for a point too', () => {
    expect(observationSource(point, 0, { page: 'frame' })).toContain('locator: pointLocator(frame, { x: 10, y: 20 })');
    expect(observationSource(role, 0, { page: 'frame' })).toContain("locator: frame.getByRole('button'");
  });

  it('renders the whole chain in stored order with stored indices, nothing dropped or deduped', () => {
    const sources = observationSources([positional, role, identity, point, role]);
    expect(sources).toHaveLength(5);
    expect(sources.map((s) => /index: (\d+)/.exec(s)![1])).toEqual(['0', '1', '2', '3', '4']);
    expect(sources.map((s) => /kind: '([a-z]+)'/.exec(s)![1])).toEqual(['css', 'role', 'scoped', 'point', 'role']);
    // No compile-time identity guard survives anywhere in the chain.
    expect(sources.join('\n')).not.toContain('.filter({ hasText');
  });
});

/**
 * The claim the unit tests above cannot make: that the emitted text builds
 * the SAME Locator makeLocator does. Resolved side by side on the fixture and
 * compared by match count and outerHTML.
 */
const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;
const fixtureUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture', 'page.html')).href;

d('emitted source resolves what makeLocator resolves (fixture page)', () => {
  let session: BrowserSession;

  beforeAll(async () => {
    session = new BrowserSession({ session: 'spec-locators', persist: false });
    const page = await session.getPage();
    await page.goto(fixtureUrl);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
  });

  const same = async (loc: Locator, other: Locator) => {
    const [n, m] = [await loc.count(), await other.count()];
    expect(m).toBe(n);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      expect(await other.nth(i).evaluate((el) => el.outerHTML)).toBe(await loc.nth(i).evaluate((el) => el.outerHTML));
    }
  };

  const candidates: Array<[string, LocatorCandidate]> = [
    ['id', { kind: 'id', selector: '#name' }],
    ['role', { kind: 'role', role: 'button', name: 'Submit' }],
    ['label', { kind: 'label', label: 'Qty' }],
    ['text', { kind: 'text', text: 'Row Alpha' }],
    ['testid', { kind: 'testid', attr: 'data-testid', value: 'del-1' }],
    ['testid (other attr)', { kind: 'testid', attr: 'data-name', value: 'beta' }],
    ['css with nth', { kind: 'css', selector: 'button.dup', nth: 1 }],
    ['scoped', { kind: 'scoped', container: '#editlist .erow', hasText: 'Item Two', selector: 'button' }],
  ];
  for (const [name, c] of candidates) {
    it(`matches makeLocator for ${name}`, async () => {
      const page = await session.getPage();
      const src = candidateSource(c)!;
      // roleName is in scope in the artifact (the embedded shared text module); here it is passed in.
      await same(makeLocator(page, c), new Function('page', 'p', 'roleName', `return ${src}`)(page, {}, roleName) as Locator);
    }, 30_000);
  }

  // fwrd79 03-open: a stored `role=textbox[name="Part name *"]` whose asterisk
  // is aria-hidden names nothing to the role engine. Both runners now also
  // find the field by its label's exact text, and find the SAME field.
  it('a stored role=…[name] field is found by its label text, the same in both runners', async () => {
    const page = await session.getPage();
    await page.evaluate(() => {
      const label = document.createElement('label');
      label.innerHTML = 'Part name <span aria-hidden="true">*</span> <input id="pn" type="text" />';
      document.body.append(label);
    });
    const c: LocatorCandidate = { kind: 'css', selector: 'role=textbox[name="Part name *"]' };
    expect(await page.locator(c.selector).count()).toBe(0);
    const live = makeLocator(page, c);
    expect(await live.evaluate((el) => el.id)).toBe('pn');
    await same(live, new Function('page', 'p', 'roleName', `return ${candidateSource(c)!}`)(page, {}, roleName) as Locator);
  }, 30_000);

  it('the emitted observations resolve to the identity row, never to the other one', async () => {
    const page = await session.getPage();
    const scoped: LocatorCandidate = { kind: 'scoped', container: '#editlist .erow', hasText: 'Item Two', selector: 'button' };
    const chain: LocatorCandidate[] = [
      { kind: 'css', selector: '#editlist > div:nth-of-type(1) > button' },
      { kind: 'role', role: 'button', name: 'Edit' },
      scoped,
    ];
    // The observations the artifact emits, run through the SHARED policy that
    // the artifact embeds: identity is the policy's rule now, not a filter
    // baked into the expression. Row 1's Edit button is a perfect match for
    // both of the earlier candidates and has none of "Item Two" about it.
    const observations = observationSources(chain).map(
      (src) => new Function('page', 'p', 'pointLocator', 'roleName', `return ${src}`)(page, {}, pointLocator, roleName) as CandidateObservation,
    );
    const hit = await resolveCandidates(page, observations, { requireIdentity: ['Item Two'], waitMs: 0 });
    expect(hit).not.toBeNull();
    await same(makeLocator(page, scoped), hit!.locator);
    expect(await hit!.locator.evaluate((el) => el.closest('.erow')!.getAttribute('data-row'))).toBe('2');
  }, 30_000);
});
