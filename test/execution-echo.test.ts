import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { MIN_ECHO_LEN, candidateNames, echoAt, echoKey, echoVerdict, judgeEcho, markActed, noteInteraction, noteNavigation, routeOf, setsSomething } from '../src/execution/echo.js';
import type { SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

/**
 * Gap 10: the echo rule (src/execution/echo.ts), which daemon replay calls and
 * the compiled artifact embeds. Pinned here: the rule itself, where the
 * emitter feeds and consults the ledger, and the emitted `echoRead` helper run
 * from the whole helper block (a helper cut alone fails closed).
 */

describe('the shared echo rule', () => {
  it('keys loosely, so case and punctuation do not hide an echo', () => {
    expect(echoKey('Last 6 hours.')).toBe(echoKey('last  6 HOURS'));
    expect(echoKey('notes for run')).toBe('notes for run');
  });

  /**
   * Phase B provenance, stage 1: every string is remembered, short ones too.
   * Below MIN_ECHO_LEN the TEXT alone never makes an echo (a "1m" refresh
   * elsewhere on the page is a coincidence); echoAt asks the element instead —
   * "150" read back from the input it was typed into is an echo.
   */
  it('remembers every string it set, short ones too; the floor now only decides which rule judges', () => {
    const ledger = new Set<string>();
    noteInteraction(ledger, ['1m', 'abcd', 'abcde', undefined, 42, null, '', ' - ']);
    expect([...ledger]).toEqual(['1m', 'abcd', 'abcde']);
    expect(MIN_ECHO_LEN).toBe(5);
    expect(echoVerdict(ledger, 'refresh', '1m', 'step 2')).toContain("read 'refresh' returned a value the skill itself set");
  });

  it('a route is origin, path and hash path: a rewritten query string is no commit', () => {
    expect(routeOf('http://a.test/echo-lab?q=Bench')).toBe(routeOf('http://a.test/echo-lab'));
    expect(routeOf('http://a.test/#/search?q=x')).toBe(routeOf('http://a.test/#/search?q=y'));
    expect(routeOf('http://a.test/#/editor/post')).not.toBe(routeOf('http://a.test/#/editor/post/6ab5'));
    expect(routeOf('http://a.test/tickets')).not.toBe(routeOf('http://a.test/tickets/7'));
  });

  it('names a candidate by its name, else its label', () => {
    expect(candidateNames([{ name: 'Last 6 hours' }, { label: 'Time range' }, { name: 'Both', label: 'ignored' }, {}])).toEqual(['Last 6 hours', 'Time range', 'Both', undefined]);
  });

  it('an echo is a read whose value the ledger holds; a short or foreign value is not', () => {
    const ledger = new Set<string>();
    noteInteraction(ledger, ['Last 6 hours']);
    expect(echoVerdict(ledger, 'range', 'last 6 hours', 'step 4')).toBe(
      "step 4: read 'range' returned a value the skill itself set/selected ('last 6 hours') — confirms the control, not persistence; dropped from the report's confident values",
    );
    expect(echoVerdict(ledger, 'range', 'Last 7 days', 'step 4')).toBeNull();
    expect(echoVerdict(ledger, 'range', '', 'step 4')).toBeNull();
    noteInteraction(ledger, ['abcde']);
    expect(echoVerdict(ledger, 'x', 'abcd', 'step 4')).toBeNull();
  });

  it('only a step that sets or selects feeds the ledger: never a read, a scroll, a wait or a hover', () => {
    for (const tool of ['fill', 'type', 'select', 'click', 'dblclick', 'press', 'check']) expect(setsSomething(tool), tool).toBe(true);
    for (const tool of ['read', 'read_all', 'scroll_into_view', 'wait_for', 'hover', 'screenshot']) expect(setsSomething(tool), tool).toBe(false);
  });
});

const ORIGIN = 'http://app.test';
const specOf = (steps: SkillStep[]): SpecFlow => ({
  version: 1,
  name: 'echo',
  origin: ORIGIN,
  startUrl: `${ORIGIN}/`,
  vars: [],
  steps: [
    {
      id: '01-set',
      instruction: 'set the range',
      params: { v1: 'Echoville' },
      outputs: ['shown'],
      segments: [
        {
          id: 's_echo',
          template: 'set the range',
          params: { v1: { example: 'Echoville', usedIn: [1] } },
          preconditions: { urlPattern: `${ORIGIN}/` },
          steps,
        },
      ],
    },
  ],
});

/**
 * Round 59's element rule (markActed / echoAt) never fails a step and never
 * turns a failure into an observation: an element that cannot be marked — a
 * locator double with no evaluate, a detached element, a closed page — leaves
 * that source on the text rule, which calls a matching read an echo.
 */
describe('the element rule falls back to the text rule', () => {
  const throwing = { first: () => ({ evaluate: () => { throw new TypeError('evaluate is not a function'); }, elementHandle: async () => null }) };
  const missing = { first: () => ({}) };
  const page = { url: () => 'http://x.test/', frames: () => [] };
  const readHere = { first: () => ({ elementHandle: async () => ({ evaluate: async () => ({ replaced: false, detached: true, isControl: false }), dispose: async () => {} }) }) };

  it('markActed never throws, whatever the locator or page does', async () => {
    const ledger = new Set<string>();
    await expect(markActed(page as never, throwing as never, ledger, ['Echoville'], '1')).resolves.toBeUndefined();
    await expect(markActed(page as never, missing as never, ledger, ['Echoville'], '2')).resolves.toBeUndefined();
    await expect(markActed({ url: () => { throw new Error('closed'); } } as never, missing as never, ledger, ['Echoville'], '3')).resolves.toBeUndefined();
  });

  it('a read whose only source could not be marked is still an echo — even where the page would say "detached"', async () => {
    const ledger = new Set<string>();
    noteInteraction(ledger, ['Echoville']);
    await markActed(page as never, missing as never, ledger, ['Echoville'], '1');
    // `readHere` answers "not the control, detached" — what would make it
    // observed for a MARKED source; unmarked, the text rule stands.
    expect(await echoAt(page as never, ledger, 'echoville', readHere as never)).toBe(true);
  });

  /**
   * Round 61: the element rule runs FIRST, whatever the text — and only ever
   * withholds on positive evidence. A set that could not be marked, or a page
   * that cannot answer, leaves the read to the text rule: a reformatted value
   * ("12,500" for the 12500 typed) is then observed, as before; a matching one
   * is still an echo.
   */
  it('judgeEcho asks the element first and falls back to the text rule where the page cannot answer', async () => {
    const ledger = new Set<string>();
    noteInteraction(ledger, ['12500']);
    await markActed(page as never, missing as never, ledger, ['12500'], '1', 'fill');
    expect(await judgeEcho(page as never, ledger, 'amount', '12,500', readHere as never, 'step 3')).toBeNull();
    expect(await judgeEcho(page as never, ledger, 'amount', '12500', readHere as never, 'step 3')).toContain("read 'amount' returned a value the skill itself set");
    expect(await judgeEcho(page as never, ledger, 'amount', '', readHere as never, 'step 3')).toBeNull();
  });

  /**
   * erpnext fwen10-fr 02-find: a click on a list row's link "Seed: Alpha
   * Traders" opened that order; the flow came back to the list, and every
   * later read of the name (the link's own text, so the very element the click
   * marked) was withheld as an echo. A click whose route changed selected
   * nothing (noteNavigation); a pick that stayed on its route still did.
   */
  describe('a click that navigated selected nothing', () => {
    const LIST = 'http://en.test/app/sales-order?customer_name=Seed';
    const ORDER = 'http://en.test/app/sales-order/SAL-ORD-1';
    const at = (url: { now: string }) => ({ url: () => url.now, frames: () => [] });
    const marked = (option = false) => ({ first: () => ({ evaluate: async () => ({ index: 0, option }), elementHandle: async () => null }) });
    // The read's element IS the marked one (the link, or the picker's control).
    const readTheControl = { first: () => ({ elementHandle: async () => ({ evaluate: async () => ({ replaced: false, detached: false, isControl: true }), dispose: async () => {} }) }) };
    const NAME = 'Seed: Alpha Traders';

    it('the fwen10 sequence: note the link, navigate, come back, read the name — confident', async () => {
      const url = { now: LIST };
      const page = at(url);
      const ledger = new Set<string>();
      noteInteraction(ledger, [NAME]);
      await markActed(page as never, marked() as never, ledger, [NAME], '9', 'click');
      noteInteraction(ledger, [undefined, undefined]);
      // Before the fix, the read back on the list was an echo.
      expect(await judgeEcho(page as never, ledger, 'so_customer_name', NAME, readTheControl as never, 'step 3')).toContain('the skill itself set');
      url.now = ORDER;
      expect(noteNavigation(ledger, '9', LIST, url.now)).toBe(true);
      url.now = LIST;
      expect(ledger.has(echoKey(NAME))).toBe(false);
      expect(await judgeEcho(page as never, ledger, 'so_customer_name', NAME, readTheControl as never, 'step 3')).toBeNull();
    });

    it('an option pick that stayed on its route (a rewritten query string included) is still an echo', async () => {
      const page = at({ now: 'http://gr.test/d/abc?from=now-6h' });
      const ledger = new Set<string>();
      noteInteraction(ledger, ['Last 6 hours']);
      await markActed(page as never, marked(true) as never, ledger, ['Last 6 hours'], '4', 'click');
      expect(noteNavigation(ledger, '4', 'http://gr.test/d/abc?from=now-1h', 'http://gr.test/d/abc?from=now-6h')).toBe(false);
      expect(await judgeEcho(page as never, ledger, 'range', 'Last 6 hours', readTheControl as never, 'step 5')).toContain('the skill itself set');
    });

    it('a typed value of the same text stays an echo after the link of that name navigated', async () => {
      const url = { now: LIST };
      const page = at(url);
      const ledger = new Set<string>();
      noteInteraction(ledger, [NAME]);
      await markActed(page as never, marked() as never, ledger, [NAME], '1', 'fill');
      noteInteraction(ledger, [NAME]);
      await markActed(page as never, marked() as never, ledger, [NAME], '2', 'click');
      expect(noteNavigation(ledger, '2', LIST, ORDER)).toBe(true);
      url.now = LIST;
      expect(ledger.has(echoKey(NAME))).toBe(true);
      expect(await judgeEcho(page as never, ledger, 'search', NAME, readTheControl as never, 'step 4')).toContain('the skill itself set');
    });

    it('a typed value with no target is never taken back, and only the acting step is settled', async () => {
      const ledger = new Set<string>();
      noteInteraction(ledger, ['typed text']);
      expect(noteNavigation(ledger, '1', LIST, ORDER)).toBe(false);
      expect(ledger.has('typed text')).toBe(true);
      // A set another step left pending (it stopped before landing) is not this step's.
      const page = at({ now: LIST });
      noteInteraction(ledger, ['Other row']);
      await markActed(page as never, marked() as never, ledger, ['Other row'], '5', 'click');
      noteInteraction(ledger, [NAME]);
      await markActed(page as never, marked() as never, ledger, [NAME], '6', 'click');
      expect(noteNavigation(ledger, '6', LIST, ORDER)).toBe(true);
      expect(ledger.has(echoKey('Other row'))).toBe(true);
      expect(ledger.has(echoKey(NAME))).toBe(false);
      // An empty url decides nothing.
      noteInteraction(ledger, ['Third row']);
      await markActed(page as never, marked() as never, ledger, ['Third row'], '7', 'click');
      expect(noteNavigation(ledger, '7', '', ORDER)).toBe(false);
      expect(ledger.has(echoKey('Third row'))).toBe(true);
    });
  });

  it('a page that throws while judging is an echo too, and a value the ledger never held is never one', async () => {
    const ledger = new Set<string>();
    noteInteraction(ledger, ['Echoville']);
    expect(await echoAt(page as never, ledger, 'Echoville', { first: () => { throw new Error('closed'); } } as never)).toBe(true);
    expect(await echoAt(page as never, ledger, 'Somewhere else', readHere as never)).toBe(false);
  });
});

describe('the emitted ledger', () => {
  const steps: SkillStep[] = [
    { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'label', label: 'City' }] } },
    { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'option', name: 'Last 6 hours' }] } },
    { tool: 'scroll_into_view', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'heading', name: 'Latency by endpoint' }] } },
    { tool: 'read', args: { target: '@e4', what: 'value', label: 'shown' }, label: 'shown', locators: { target: [{ kind: 'label', label: 'City' }] } },
  ];
  const { source } = emitFlowFile(specOf(steps), { tier: 'plain' });

  it('declares one ledger per flow step (its segments share it, round 61), feeds it from what a step sets and what a resolved target is named, and asks it at the read', () => {
    expect(source).toContain('const echoLedger = new Set<string>();');
    // the filled value, with its slot filled at run time
    expect(source).toContain('noteInteraction(echoLedger, [`${p.v1}`]);');
    // the clicked option's name, once its chain resolved
    expect(source).toMatch(/const hit\d+ = await pick\([^;]*?'Last 6 hours'[\s\S]*?\);\n\s*noteInteraction\(echoLedger, \['Last 6 hours'\]\);/);
    // a scroll sets nothing: its heading never enters the ledger
    expect(source).not.toContain("noteInteraction(echoLedger, ['Latency by endpoint'])");
    // Round 59: echoRead is async and judges by the element too (echoAt), so it
    // is awaited and handed the page and the element the read resolved to.
    expect(source).toContain("await echoRead(echoLedger, run, 'shown', '01-set.shown', outputs['01-set.shown'], '01-set s_echo/4', page, lastReadHit);");
    // the embedded rule rides along
    expect(source).toContain('function echoVerdict(');
    expect(source).toContain('echoed: string[];');
    expect(source).toContain('run.echoed = [];');
  });

  it('a flow that neither sets nor reads carries no ledger and no echo helper', () => {
    const plain = emitFlowFile(specOf([{ tool: 'goto', args: { url: `${ORIGIN}/x` }, locators: {} }]), { tier: 'plain' }).source;
    expect(plain).not.toContain('new Set<string>();');
    expect(plain).not.toContain('function echoRead(');
    expect(plain).not.toContain('function echoVerdict(');
  });

  it('echoRead, run from the whole helper block, lists the key and warns once for an echo, and nothing otherwise', async () => {
    const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source);
    if (!block) throw new Error('helper block not found in the emitted source');
    const js = ts.transpileModule(block[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const names = [...block[1].matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
    const log: string[] = [];
    const helpers = new Function('DRIFT', 'console', `${js}\nreturn { ${names.join(', ')} };`)([], { warn: () => {}, log: (l: string) => log.push(l) }) as Record<string, (...a: unknown[]) => unknown>;

    const ledger = new Set<string>();
    helpers.noteInteraction(ledger, ['Echoville']);
    const run = { outputs: {}, drift: [], echoed: [] as string[] };
    // No element evidence here (no page, no marked control): the text rule
    // decides, exactly as before round 59 — the verdict did not change, only
    // the signature (async, the page and the read's element passed in).
    await helpers.echoRead(ledger, run, 'shown', '01-set.shown', 'echoville', '01-set s_echo/4', null, null);
    await helpers.echoRead(ledger, run, 'other', '01-set.other', 'Somewhere else', '01-set s_echo/5', null, null);
    await helpers.echoRead(ledger, run, 'none', '01-set.none', undefined, '01-set s_echo/6', null, null);
    expect(run.echoed).toEqual(['01-set.shown']);
    expect(log).toEqual([
      "[sitelooper warn] 01-set s_echo/4: read 'shown' returned a value the skill itself set/selected ('echoville') — confirms the control, not persistence; dropped from the report's confident values",
    ]);
  });
});
