/**
 * The artifact as the SECOND adapter of the shared locator-resolution policy
 * (C6 stage B). What these cases pin is the emitter's half of parity: the
 * observations it renders per candidate and the policy inputs it derives at
 * compile time — the same inputs replay's runOneStep builds live — and, run
 * from the emitted helper block against fake locators, that the adapter
 * presents the shared verdict (drift, the loop sink, the throw) without
 * reinterpreting it. The policy's own rules are tested in
 * test/execution-resolve.test.ts; the browser-backed agreement of the two
 * runners is test/execution-parity.test.ts.
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { Locator } from 'playwright-core';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow, SpecSegment } from '../src/spec/ir.js';
import type { SkillParam, SkillStep } from '../src/skills/store.js';

const known: SkillParam = { example: 'Widget A', usedIn: [1], known: true };
const unknown: SkillParam = { example: 'Widget A', usedIn: [1] };

function flowOf(steps: SkillStep[], params: Record<string, SkillParam> = { v1: known }, over: Partial<SpecSegment> = {}): SpecFlow {
  return {
    version: 1,
    name: 'resolve-emit',
    origin: 'http://app.test',
    startUrl: 'http://app.test/',
    vars: ['name'],
    steps: [{
      id: '01-do',
      instruction: 'do the thing',
      params: { v1: '{{name}}' },
      outputs: [],
      segments: [{ id: 's_1', template: 'do the thing with {{v1}}', params, preconditions: { urlPattern: 'http://app.test/items' }, steps, ...over }],
    }],
  };
}

const emit = (flow: SpecFlow) => emitFlowFile(flow, { tier: 'plain' });
const bodyOf = (source: string) => source.slice(source.indexOf('export const steps = {'));

/** The policy argument of the first `pick(`/`readOptional(`/`resolveTarget(` call in the body. */
function policyOf(source: string): string {
  const m = /\], '01-do s_1\/\d+ (?:target|source)', (\{[^\n]*?\}), (?:(?:async )?\(loc: Locator\)[^\n]*?, |'[^'\n]*', p, )?\{ drift: run\.drift/.exec(bodyOf(source));
  if (!m) throw new Error('no resolution call in the emitted body');
  return m[1];
}

const click = (chain: SkillStep['locators']['target'], expectation?: SkillStep['expect']): SkillStep => ({
  tool: 'click',
  args: { target: '@e1' },
  locators: { target: chain },
  ...(expectation ? { expect: expectation } : {}),
});

// ---------------------------------------------------------------------------
// Fakes, for running the emitted helper block. The shapes resolveCandidates
// touches: count, first, textContent, boundingBox, evaluate, nth, toString.
// ---------------------------------------------------------------------------

interface Script {
  counts: number[];
  text?: string;
  leaves?: boolean;
}

function fakeLocator(script: Script, label = 'loc'): Locator {
  let calls = 0;
  const self = {
    toString: () => label,
    count: async () => script.counts[Math.min(calls++, script.counts.length - 1)],
    first: () => self,
    textContent: async () => script.text ?? '',
    boundingBox: async () => ({ x: 0, y: 0, width: 10, height: 10 }),
    evaluate: async () => script.leaves ?? false,
    nth: (i: number) => fakeLocator({ counts: [1], text: script.text }, `${label}.nth(${i})`),
  };
  return self as unknown as Locator;
}

const fakePage = () => ({ url: () => 'http://app.test/items', evaluate: async () => ({ x: 0, y: 0 }) });

/** The whole helper block of an emitted file, made callable — never one function alone. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function helpersOf(source: string, warn: (line: string) => void = () => {}): Record<string, any> {
  const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source);
  if (!block) throw new Error('helper block not found in the emitted source');
  const js = ts.transpileModule(block[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const names = [...block[1].matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = new Function('DRIFT', 'console', `${js}\nreturn { ${names.join(', ')} };`) as (d: string[], c: unknown) => Record<string, any>;
  // The artifact logs its `[sitelooper …]` lines on STDOUT (see logWarning in
  // src/spec/emit.ts), so `warn` here is what console.log delivers.
  return build([], { warn: () => {}, log: warn });
}

const obs = (locator: Locator, index: number, over: Partial<{ structural: boolean; kind: string; carries: string; nth: number }> = {}) => ({
  locator,
  index,
  structural: false,
  kind: 'role',
  carries: '',
  ...over,
});

// ---------------------------------------------------------------------------
// Observations.
// ---------------------------------------------------------------------------

describe('the observations the artifact renders per candidate', () => {
  it('passes the stored chain in stored order with stored indices, no guard, no reorder, no dedupe', () => {
    const { source } = emit(flowOf([click([
      { kind: 'css', selector: '#list > li:nth-of-type(1) > button' },
      { kind: 'role', role: 'button', name: 'Edit' },
      { kind: 'scoped', container: 'li', hasText: '{{v1}}', selector: 'button' },
      { kind: 'role', role: 'button', name: 'Edit' },
    ])]));
    const body = bodyOf(source);
    // the structural path stays FIRST, as recorded: the policy orders it behind the names itself
    expect(body).toContain("{ locator: page.locator('#list > li:nth-of-type(1) > button'), index: 0, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#list > li:nth-of-type(1) > button' }) },");
    expect(body).toContain("{ locator: page.getByRole('button', { name: roleName('Edit'), exact: true }), index: 1, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'button', name: 'Edit' }) },");
    expect(body).toContain("{ locator: page.locator('li', { hasText: `${p.v1}` }).locator('button'), index: 2, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'li', hasText: `${p.v1}`, selector: 'button' }) },");
    expect(body).toContain("{ locator: page.getByRole('button', { name: roleName('Edit'), exact: true }), index: 3, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'button', name: 'Edit' }) },");
    expect(body).not.toContain('.filter({ hasText');
    expect(body).not.toContain('.first()');
    expect(body).not.toContain('.or(');
  });

  it('renders a point candidate with its geometry, through pointLocator, and keeps a point-only chain runnable', () => {
    const point = { kind: 'point' as const, x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 };
    const { source, warnings, diagnostics } = emit(flowOf([click([{ kind: 'role', role: 'button', name: 'Save' }, point])]));
    const body = bodyOf(source);
    expect(body).toContain(
      "{ locator: pointLocator(page, { x: 10, y: 20 }), index: 1, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 }), point: { x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 } },",
    );
    // the marker the point resolves through is embedded, once
    expect(source).toContain('async function markPoint(page: Page, c: PointGeometry)');
    expect(source.split('// Shared execution source: point.ts.').length).toBe(2);
    expect(body).not.toContain('dropped the recorded position');
    expect(warnings).toEqual([]);
    expect(diagnostics).toEqual([]);

    // A chain that is NOTHING but the point is no longer refused: it resolves
    // by marking what is under the recorded point, of the recorded kind.
    const only = emit(flowOf([click([{ ...point, role: null, tag: 'div' }])]));
    expect(bodyOf(only.source)).toContain("point: { x: 10, y: 20, w: 5, h: 5, role: null, tag: 'div', vw: 800, vh: 600 }");
    expect(only.source).not.toContain('// TODO:');
    expect(only.diagnostics).toEqual([]);
    expect(only.warnings).toEqual([]);
  });

  it('puts a recorded nth on the locator AND the observation, as the daemon passes both', () => {
    const { source } = emit(flowOf([click([{ kind: 'css', selector: 'button.dup', nth: 1 }])]));
    expect(bodyOf(source)).toContain("{ locator: page.locator('button.dup').nth(1), index: 0, structural: true, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'button.dup', nth: 1 }), nth: 1 },");
  });

  it('still refuses a step whose recording kept no candidate at all', () => {
    const { source, diagnostics } = emit(flowOf([click([])]));
    expect(diagnostics.map((d) => d.code)).toEqual(['unsupported-capability']);
    expect(source).toContain('// TODO: no locator this compiler can express for click');
  });
});

// ---------------------------------------------------------------------------
// Policy inputs.
// ---------------------------------------------------------------------------

describe('the policy the artifact derives at compile time', () => {
  it('renders requireIdentity as identityValues over the run\'s KNOWN params, from every text-bearing field of the whole chain', () => {
    const chain: SkillStep['locators']['target'] = [
      { kind: 'css', selector: '//tr[contains(., "{{v1}}")]' }, // an address, not a name: excluded by identityFields
      { kind: 'role', role: 'button', name: 'Edit {{v1}}' },
      { kind: 'scoped', container: 'tr', hasText: '{{v1}} {{v2}}', selector: 'button' },
      { kind: 'label', label: 'Owner {{v3}}' },
    ];
    const { source } = emit(flowOf([click(chain)], { v1: known, v2: known, v3: unknown }));
    // v3 is not known, so its field is not listed and it is not in the map; v1 appears once
    expect(policyOf(source)).toBe("{ requireIdentity: identityValues({ v1: p.v1, v2: p.v2 }, ['Edit {{v1}}', '{{v1}} {{v2}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }");
    // the slots the guard reads are the step's own params
    expect(source).toContain("async '01-do'(page: Page, p: { v1: string; v2: string; v3: string }");
  });

  it('omits requireIdentity when no known slot names the target, so an unvouched value never guards', () => {
    const chain: SkillStep['locators']['target'] = [{ kind: 'role', role: 'button', name: 'Edit {{v1}}' }, { kind: 'css', selector: '#edit' }];
    expect(policyOf(emit(flowOf([click(chain)], { v1: unknown })).source)).toBe('{ stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
    // ...and a known slot that sits only in a css selector or a testid is an address, not identity
    const addressed: SkillStep['locators']['target'] = [{ kind: 'css', selector: '[data-id="{{v1}}"]' }, { kind: 'testid', attr: 'data-testid', value: '{{v1}}' }];
    expect(policyOf(emit(flowOf([click(addressed)], { v1: known })).source)).toBe('{ stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
  });

  it('takes stayOnOrigin from a concrete recorded url pattern, else from the live page', () => {
    const chain: SkillStep['locators']['target'] = [{ kind: 'id', selector: '#go' }];
    expect(policyOf(emit(flowOf([click(chain, { urlPattern: 'http://app.test/items/{{d1}}' })])).source)).toBe("{ stayOnOrigin: 'http://app.test', waitMs: RESOLVE_WAIT_MS }");
    expect(policyOf(emit(flowOf([click(chain, { urlPattern: 'https://other.test:8443/x' })])).source)).toBe("{ stayOnOrigin: 'https://other.test:8443', waitMs: RESOLVE_WAIT_MS }");
    // a pattern whose ORIGIN is not concrete, or no pattern at all: the page decides at run time
    expect(policyOf(emit(flowOf([click(chain, { urlPattern: '{{v1}}/items' })])).source)).toBe('{ stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
    expect(policyOf(emit(flowOf([click(chain)])).source)).toBe('{ stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
    // the origin rule is the shared one, embedded with the url module
    expect(emit(flowOf([click(chain)])).source).toContain('function originOf(url: string): string | null {');
  });

  it('allows multiple matches for read_all, never for a singular read', () => {
    const chain: SkillStep['locators']['target'] = [{ kind: 'css', selector: '.row' }];
    const all = emit(flowOf([{ tool: 'read_all', args: { target: '@e1', what: 'text' }, locators: { target: chain }, label: 'rows' }])).source;
    expect(policyOf(all)).toBe('{ allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
    expect(bodyOf(all)).toContain("(loc: Locator) => readElements(loc, true, 'text'), { drift: run.drift });");
    // a value read_all reads every match too, never inputValue's single element (fwod41)
    const values = emit(flowOf([{ tool: 'read_all', args: { target: '@e1', what: 'value' }, locators: { target: chain }, label: 'inputs' }])).source;
    expect(bodyOf(values)).toContain("(loc: Locator) => readElements(loc, true, 'value'), { drift: run.drift });");
    expect(values).toContain('async function readElements(\n  loc: Locator,');
    const one = emit(flowOf([{ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: chain }, label: 'row' }])).source;
    expect(policyOf(one)).toBe('{ stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
  });

  it('passes the loop cursor as ambiguousNth and never an unconditional .nth()', () => {
    const target: SkillStep['locators']['target'] = [{ kind: 'role', role: 'button', name: 'Mark' }];
    const loop: SkillStep = { tool: 'loop', args: {}, locators: {}, while: target, max: 3, body: [click(target)] };
    const { source } = emit(flowOf([loop]));
    const body = bodyOf(source);
    expect(body).toContain("], '01-do s_1/1 target', { ambiguousNth: cursor1, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, { drift: run.drift, resolved: { into: pass1.entries, key: 'target', check: pass1.check } });");
    expect(body).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    expect(body).not.toContain('.nth(cursor1)');
    // the guard: the same chain through the same policy, ambiguity allowed, no wait
    expect(body).toContain('const guard1 = await resolveCandidates(page, [');
    expect(body).toContain('], { allowMultiple: true });');
    expect(body).toContain('return guard1 ? guard1.locator : null;');
  });

  it('waits nothing for an absence wait, whose condition is that nothing resolves, and allows several matches so they are waited on to go', () => {
    const chain: SkillStep['locators']['target'] = [{ kind: 'text', text: '{{v1}}' }, { kind: 'css', selector: 'td.name' }];
    const { source } = emit(flowOf([{ tool: 'wait_for', args: { target: 'text=x', state: 'hidden' }, locators: { target: chain } }]));
    const body = bodyOf(source);
    // allowMultiple: a chain that still matches two visible elements has NOT
    // met "hidden"; an 'ambiguous' miss read as "nothing matched" was a false
    // success (replay's runOneStep passes the same for waitsForAbsence).
    expect(body).toContain("], '01-do s_1/1 target', { allowMultiple: true, requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}']), stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: 0 }, { drift: run.drift });");
    expect(body).toContain('const hit1 = await resolveTarget(page, [');
    // on the first match, as replay's waitFor dispatches it — strict expect
    // would refuse the several matches instead of waiting for them
    expect(body).toContain('if (hit1) await expect(hit1.locator.first()).toBeHidden();');
    expect(body).not.toContain('.or(');
    // a presence wait resolves WITH the wait, as an action does — and with
    // ambiguity allowed and on the first match, because that is what it
    // dispatches. `hidden` was never the special case; the dispatch is
    // (dispatchesFirstMatch). grafana fwgr43's `wait_for h2 state:visible`
    // was held to exactly one element with three panel headings on the page:
    // both replays stopped and the compiled arm failed 0/6.
    const visible = emit(flowOf([{ tool: 'wait_for', args: { target: 'text=x', state: 'visible' }, locators: { target: [{ kind: 'css', selector: 'td.name' }] } }])).source;
    expect(policyOf(visible)).toBe('{ allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
    expect(bodyOf(visible)).toContain('await expect(hit1.locator.first()).toBeVisible();');
    // a COUNT wait keeps the whole locator: the question is how many, and
    // `.first()` would always answer one (spansEveryMatch).
    const counted = emit(flowOf([{ tool: 'wait_for', args: { target: '.row', state: 'count', count: 3 }, locators: { target: [{ kind: 'css', selector: '.row' }] } }])).source;
    expect(policyOf(counted)).toBe('{ allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }');
    expect(bodyOf(counted)).toContain('await expect(hit1.locator).toHaveCount(3);');
  });

  /**
   * The compile diagnostic for the fwgr43 shape: the artifact would run, and
   * nothing in it says the locator was never proved to name one element.
   */
  it('warns where a step that acts on one element has only an unindexed primary to find it by', () => {
    const bare: SkillStep['locators']['target'] = [{ kind: 'css', selector: 'h2' }];
    const { warnings } = emit(flowOf([{ tool: 'wait_for', args: { target: 'h2', state: 'visible' }, locators: { target: bare } }]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("page.locator('h2')");
    expect(warnings[0]).toContain('never proved to identify one element');
    // and it names the way out
    expect(warnings[0]).toContain('sitelooper rerecord');

    // the same selector with the index the dispatch used is proved: it names
    // match 0, which is what the wait acts on (the recorder stores it now)
    const indexed = emit(flowOf([{ tool: 'wait_for', args: { target: 'h2', state: 'visible' }, locators: { target: [{ kind: 'css', selector: 'h2', nth: 0 }] } }]));
    expect(indexed.warnings).toEqual([]);
    // a chain with alternates was derived from the element itself
    const derived = emit(flowOf([{ tool: 'wait_for', args: { target: 'h2', state: 'visible' }, locators: { target: [{ kind: 'css', selector: 'h2' }, { kind: 'role', role: 'heading', name: 'Panel' }] } }]));
    expect(derived.warnings).toEqual([]);
    // a count wait claims nothing about one element, and a click's ambiguity
    // is not silent — Playwright's strict mode says so out loud
    const plural = emit(flowOf([{ tool: 'wait_for', args: { target: 'h2', state: 'count', count: 3 }, locators: { target: bare } }]));
    expect(plural.warnings).toEqual([]);
    expect(emit(flowOf([click(bare)])).warnings).toEqual([]);
  });

  it('reports positional resolution from the resolution itself into the effect gate', () => {
    const chain: SkillStep['locators']['target'] = [{ kind: 'role', role: 'textbox', name: 'Qty' }, { kind: 'css', selector: 'form > div:nth-of-type(2) > input' }];
    const { source } = emit(flowOf([{ tool: 'fill', args: { target: '@e1', value: '3' }, locators: { target: chain }, expect: { addedContains: ['- cell "36.00"'] } }]));
    const body = bodyOf(source);
    expect(body).toContain('let positional1 = false;');
    expect(body).toContain('positional1 = positional1 || hit1.structural || hit1.nth !== undefined;');
    expect(body).toContain("positionalResolution: positional1 }, linesBefore1, 1, linesAfter1);");
    // a step with changes but no locator has nothing to report
    const goto = emit(flowOf([{ tool: 'goto', args: { url: 'http://app.test/x' }, locators: {}, expect: { addedContains: ['- heading "X"'] } }]));
    expect(bodyOf(goto.source)).toContain('positionalResolution: false }, linesBefore1, 1, linesAfter1);');
    expect(bodyOf(goto.source)).not.toContain('positional1');
  });
});

// ---------------------------------------------------------------------------
// The adapter, run.
// ---------------------------------------------------------------------------

describe('the emitted adapter over the shared policy', () => {
  const source = emit(flowOf([
    click([{ kind: 'role', role: 'button', name: 'Save' }, { kind: 'css', selector: '#save' }]),
    { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#t' }] }, label: 'x' },
  ])).source;

  it('is a thin call: the policy decides, the adapter presents', () => {
    expect(source).toContain('const hit = await resolveCandidates(page, candidates, policy);');
    // no wait loop, no re-check, no first() of its own
    const helper = /async function resolveTarget\([\s\S]*?\n\}\n/.exec(source)![0];
    expect(helper).not.toContain('waitForTimeout');
    expect(helper).not.toContain('count()');
    expect(helper).not.toContain('.first()');
    expect(helper).not.toMatch(/\.nth\([a-zA-Z0-9]/); // the sink TEXT names the cursor; nothing here narrows
  });

  it('narrows to the cursor only when the candidate was ambiguous, and signs the sink accordingly', async () => {
    const { pick } = helpersOf(source);
    const unique = fakeLocator({ counts: [1] }, "locator('.row[data-id=\"7\"] .del')");
    const generic = fakeLocator({ counts: [3] }, "getByRole('button', { name: roleName('Remove'), exact: true })");
    const page = fakePage();

    const sink1: string[] = [];
    const hit1 = await pick(page, [obs(unique, 0), obs(generic, 1)], 'w', { ambiguousNth: 1, waitMs: 0 }, { drift: [], resolved: { into: sink1, key: 'target' } });
    expect(String(hit1.locator)).toBe("locator('.row[data-id=\"7\"] .del')"); // unique: acted on as itself, whatever the cursor
    expect(hit1.nth).toBeUndefined();
    expect(sink1).toEqual(["target=locator('.row[data-id=\"7\"] .del')"]);

    const sink2: string[] = [];
    const gone = fakeLocator({ counts: [0] }, 'gone');
    const hit2 = await pick(page, [obs(gone, 0), obs(generic, 1)], 'w', { ambiguousNth: 2, waitMs: 0 }, { drift: [], resolved: { into: sink2, key: 'target' } });
    expect(String(hit2.locator)).toBe("getByRole('button', { name: roleName('Remove'), exact: true }).nth(2)");
    expect(hit2.nth).toBe(2);
    expect(sink2).toEqual(["target=getByRole('button', { name: roleName('Remove'), exact: true }).nth(2)"]);
  });

  it('reports drift in the shared MissReason words, into the run it was given', async () => {
    const warned: string[] = [];
    const { pick } = helpersOf(source, (line) => warned.push(line));
    const drift: string[] = [];
    const primary = fakeLocator({ counts: [2] }, 'primary');
    const pinned = fakeLocator({ counts: [1], text: 'Mark' }, 'pinned');
    const carrying = fakeLocator({ counts: [1], text: 'Mark Item 3' }, 'carrying');
    const hit = await pick(fakePage(), [obs(primary, 0), obs(pinned, 1), obs(carrying, 2, { carries: 'Item 3' })], '01-do s_1/1 target', { requireIdentity: ['Item 3'], waitMs: 0 }, { drift });
    expect(String(hit.locator)).toBe('carrying');
    expect(drift).toEqual(['[sitelooper drift] 01-do s_1/1 target: primary primary missed; used #3 carrying (#1 ambiguous, #2 identity)']);
    expect(warned).toEqual(drift);
  });

  it('throws the step\'s own message, with the compile note, when nothing resolves', async () => {
    const { pick } = helpersOf(source);
    const gone = fakeLocator({ counts: [0] }, 'gone');
    await expect(pick(fakePage(), [obs(gone, 0)], '01-do s_1/1 target', { waitMs: 0 }, {}, 'the recording is demoted')).rejects.toThrow(
      'none of 1 recorded locators resolved at 01-do s_1/1 target (page is at http://app.test/items): gone\n  the recording is demoted',
    );
  });

  it('leaves a read empty, with one skip line, when its chain resolves nothing', async () => {
    const warned: string[] = [];
    const { readOptional } = helpersOf(source, (line) => warned.push(line));
    const gone = fakeLocator({ counts: [0] }, 'gone');
    // a page with no evaluate: sweepPage fails closed (false), so the second resolution is not asked
    const value = await readOptional({ url: () => 'http://app.test/items' }, [obs(gone, 0)], '01-do s_1/2 target', { waitMs: 0 }, async () => 'never', {});
    expect(value).toBe('');
    expect(warned).toEqual(['[sitelooper skip] 01-do s_1/2 target: read target not found — value left empty']);
    // and reads what is there when the chain resolves
    const there = fakeLocator({ counts: [1] }, 'there');
    expect(await readOptional(fakePage(), [obs(there, 0)], 'w', { waitMs: 0 }, async (loc: Locator) => `read ${String(loc)}`, {})).toBe('read there');
    // every match of a plural read, flattened as replay flattens it
    expect(await readOptional(fakePage(), [obs(there, 0)], 'w', { waitMs: 0 }, async () => ['a', null, 'c'], {})).toBe('a | null | c');
  });

  it('skips a read that resolves but errors, naming the error rather than a missing target', async () => {
    const warned: string[] = [];
    const { readOptional } = helpersOf(source, (line) => warned.push(line));
    const there = fakeLocator({ counts: [1] }, 'there');
    const value = await readOptional(fakePage(), [obs(there, 0)], '01-do s_1/2 target', { waitMs: 0 }, async () => {
      throw new Error('strict mode violation: resolved to 3 elements\nCall log:\n  - waiting');
    }, {});
    expect(value).toBe('');
    expect(warned).toEqual(['[sitelooper skip] 01-do s_1/2 target: read errored (strict mode violation: resolved to 3 elements) — value left empty']);
  });
});

// ---------------------------------------------------------------------------
// Frame and page context (notes/ROBUSTNESS.md finding 5): the chain resolves inside
// the recorded frame, a recorded popup is armed before the action and
// followed, and a step without either emits exactly what it did before.
// ---------------------------------------------------------------------------

describe('frame and page context in the emitted body', () => {
  const frame = [{ selectors: ['iframe[title="Payment"]', 'iframe[src*="/frames/inner"]'], title: 'Payment' }];
  const save = [{ kind: 'role' as const, role: 'button', name: 'Save' }];

  it('resolves an in-frame chain against the recorded frame, and a plain one against the page', () => {
    const framed = bodyOf(emit(flowOf([{ ...click(save), contexts: { target: { frame } } }], {})).source);
    expect(framed).toContain(`const root1 = await frameRoot(page, ${JSON.stringify(frame)}, '01-do s_1/1 target');`);
    expect(framed).toContain("{ locator: root1.getByRole('button', { name: roleName('Save'), exact: true }), index: 0");
    expect(framed).not.toContain("locator: page.getByRole('button', { name: 'Save'");
    const plain = bodyOf(emit(flowOf([click(save)], {})).source);
    expect(plain).not.toContain('frameRoot(');
    expect(plain).toContain("{ locator: page.getByRole('button', { name: roleName('Save'), exact: true }), index: 0");
    expect(plain).not.toContain('armPageEffect(');
    expect(plain).not.toContain('run.page');
  });

  it('arms a recorded popup after the target resolves and before the click, and continues on it', () => {
    const body = bodyOf(emit(flowOf([{ ...click(save), effect: { kind: 'popup', urlPattern: 'http://app.test/popup/child' } }, click(save)], {})).source);
    const pick = body.indexOf('const hit1 = await pick(page, [');
    const arm = body.indexOf(`landing1 = await armPageEffect(page, {"kind":"popup","urlPattern":"http://app.test/popup/child"}, '01-do s_1/1');`);
    const act = body.indexOf('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    expect(pick).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(pick);
    expect(act).toBeGreaterThan(arm);
    expect(body.indexOf('moved1 = await landed(landing1);')).toBeGreaterThan(act);
    expect(body).toContain('if (moved1) page = run.page = moved1;');
    // every flow step picks up where an earlier one left the procedure
    expect(body).toContain('if (run.page && !run.page.isClosed()) page = run.page;');
  });

  it('gates a step recorded on another page of the browser before anything resolves', () => {
    const body = bodyOf(emit(flowOf([{ ...click(save), page: 1, effect: { kind: 'close' } }], {})).source);
    expect(body.indexOf("pageGate(page, 1, '01-do s_1/1');")).toBeLessThan(body.indexOf('const hit1 = await pick(page, ['));
    expect(body).toContain(`landing1 = await armPageEffect(page, {"kind":"close"}, '01-do s_1/1');`);
  });
});
