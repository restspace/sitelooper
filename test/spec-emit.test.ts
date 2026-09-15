import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Flow } from '../src/skills/flow.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import { seedRecipes, snapshotRecipes } from '../src/skills/components.js';
import { IDENTITY_EDGE } from '../src/shared/text.js';
import { RECORDING_VIEWPORT } from '../src/execution/browser.js';
import { budgetMs, emitFlowFile, emitSpecFile } from '../src/spec/emit.js';
import { flowToSpec, type SpecFlow, type SpecSegment, type SpecStep } from '../src/spec/ir.js';
import { liftFlowFile } from '../src/spec/lift.js';
import { FINGERPRINT_DIMS, normaliseFingerprint } from '../src/execution/fingerprint.js';
import { compileFlow } from '../src/spec/index.js';
import { parseSpecReport, verdictFor } from '../src/spec/check.js';
import { documentOf } from './fixture/observation.js';

const FWAT2 = path.resolve('bench/results-published/fwat2-skills');
const RDFLOW = path.resolve('bench/results-published/flows/rdflow.json');

/**
 * The emitted file must be real TypeScript, not text that looks like it: a
 * generated spec that does not parse is the one failure mode a reviewer
 * cannot work around. transpileModule reports syntax diagnostics only, which
 * is exactly the question here — the file is compiled by the user's own
 * project, with their own @playwright/test types.
 */
function syntaxErrors(source: string, fileName = 'flow.ts'): string[] {
  const out = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

/**
 * Every emitted statement, trimmed of indentation.
 *
 * A step's statements now sit inside the `prepare`/`act`/`settle`/`bind`/
 * `verify` callbacks of `runStepLifecycle`, so their COLUMN is an artifact of
 * how deeply the lifecycle nests them while their ORDER is the contract. These
 * two helpers assert order and exact statement text without pinning layout.
 */
const trimmedLines = (source: string): string[] => source.split('\n').map((l) => l.trim());

/** The index at which `lines` appear consecutively in `source`, or -1. */
function sequenceAt(source: string, lines: string[]): number {
  const all = trimmedLines(source);
  for (let i = 0; i + lines.length <= all.length; i++) {
    if (lines.every((line, k) => all[i + k] === line)) return i;
  }
  return -1;
}

/**
 * What a fake Locator answers, call by call.
 *
 * The artifact no longer carries a `pick` of its own: it embeds the SHARED
 * policy (src/execution/resolve.ts, `resolveCandidates`) and `pick` is the
 * adapter over it. So a fake has to answer everything that policy asks of a
 * candidate — count, text (identity), box (plausibility), evaluate (origin)
 * and nth (ambiguity) — which is exactly the stub test/execution-resolve.test.ts
 * drives the policy itself with, copied here so the ARTIFACT's copy is what runs.
 */
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

interface FakeLocator {
  calls: string[];
  toString: () => string;
  count: () => Promise<number>;
  first: () => FakeLocator;
  textContent: () => Promise<string>;
  boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  evaluate: () => Promise<boolean>;
  nth: (i: number) => FakeLocator;
}

function fakeLocator(script: Script, label = 'loc'): FakeLocator {
  const calls: string[] = [];
  let countCalls = 0;
  const self: FakeLocator = {
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
  return self;
}

type Observation = {
  locator: FakeLocator;
  index: number;
  structural: boolean;
  kind: string;
  carries: string;
  nth?: number;
  retired?: boolean;
};

/** One observation literal, in the shape the emitted call sites build. */
function obs(over: Partial<Observation> & { locator: FakeLocator; index: number }): Observation {
  return { structural: false, kind: 'role', carries: '', ...over };
}

/**
 * A Page stub for the emitted helpers. It only has to answer `url()`: the
 * policy's wait is a plain timer, and a page with no `evaluate` makes the
 * embedded `sweepPage` return false at once — which is what a read whose chain
 * resolved nothing wants.
 */
function pageStub(): { url: () => string } {
  return { url: () => 'http://app.test/x' };
}

/** The policy a case that resolves nothing must pass, or the shared wait sleeps RESOLVE_WAIT_MS. */
const NO_WAIT = { waitMs: 0 };

/** The FLOW constant as LIFT will read it back. */
function flowConstant(source: string): unknown {
  const body = /\/\/ @sitelooper-flow-begin\n([\s\S]*?)\n\/\/ @sitelooper-flow-end/.exec(source);
  if (!body) throw new Error('markers missing');
  return JSON.parse(body[1].replace(/^export const FLOW = /, '').replace(/;$/, ''));
}

function segment(steps: SkillStep[], over: Partial<SpecSegment> = {}): SpecSegment {
  return {
    id: 's_test1',
    template: 'do the thing with {{v1}}',
    params: { v1: { example: 'Widget A', usedIn: [1], known: true } },
    preconditions: { urlPattern: 'http://app.test/items' },
    steps,
    ...over,
  };
}

function specOf(steps: SkillStep[], over: Partial<SpecStep> = {}, flowOver: Partial<SpecFlow> = {}): SpecFlow {
  const step: SpecStep = {
    id: '01-do',
    instruction: 'do the thing',
    params: { v1: '{{name}}' },
    outputs: [],
    segments: [segment(steps)],
    ...over,
  };
  return { version: 1, name: 'demo', origin: 'http://app.test', startUrl: 'http://app.test/', vars: ['name'], steps: [step], ...flowOver };
}

const emit = (spec: SpecFlow) => emitFlowFile(spec, { tier: 'plain' }).source;

describe('emitFlowFile layout', () => {
  const source = emit(specOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Save' }] } }]));

  it('opens with the version marker and the do-not-edit header', () => {
    const head = source.split('\n');
    expect(head[0]).toBe('// @sitelooper-flow v1');
    expect(head[1]).toContain('Generated by sitelooper from flow "demo"');
    // the click helper takes a Locator, so a flow whose only step is a click imports the type
    expect(head[3]).toBe("import { expect, test, type Locator, type Page } from '@playwright/test';");
  });

  it('carries the spec verbatim between the lift markers', () => {
    const spec = specOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Save' }] } }]);
    expect(emit(spec)).toContain(`export const FLOW = ${JSON.stringify(spec, null, 2)};`);
    expect(flowConstant(emit(spec))).toEqual(JSON.parse(JSON.stringify(spec)));
  });

  it('declares Vars, Outputs, the steps object and runFlow', () => {
    expect(source).toContain('export type Vars = { name: string };');
    expect(source).toContain('export type Outputs = Partial<Record<OutputKey, string>>;');
    expect(source).toContain("  async '01-do'(page: Page, p: { v1: string }, outputs: Outputs, run: FlowRun = createFlowRun()): Promise<void> {");
    expect(source).toContain('export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {');
    expect(source).toContain("await page.goto(options.startUrl ?? 'http://app.test/');");
    // The recorded browser travels (a flow saved before profiles were stored
    // gets the default it was recorded at), and runFlow judges the page it is
    // handed against it before navigating — warning, never resizing.
    expect(source).toContain(`export const RECORDED_BROWSER: BrowserProfile = ${JSON.stringify({ viewport: RECORDING_VIEWPORT })};`);
    expect(source).toContain(`export const RECORDED_USE = ${JSON.stringify({ viewport: RECORDING_VIEWPORT })};`);
    expect(source).toContain('    const browserMismatch = profileMismatch(RECORDED_BROWSER, await readLiveBrowser(page));');
    expect(source).not.toContain('setViewportSize(options');
    expect(source).toContain('function profileMismatch(');
    expect(source).toContain("  await steps['01-do'](page, { v1: vars.name }, outputs, run);");
    expect(syntaxErrors(source)).toEqual([]);
  });

  // DRIFT is exported unconditionally, not only when `pick` is emitted: a
  // caller's `.spec.ts` imports it once, statically, and a flow that has no
  // multi-candidate step TODAY may gain one the moment `repair` widens a
  // chain — the import in the user's own, never-rewritten file must not have
  // to change to keep compiling. The array is simply empty until a `pick`
  // call actually falls through.
  // NEW CONTRACT: a single-candidate click resolves through the shared policy
  // too, so the flow with NO step that needs `pick` is now one that locates
  // nothing at all — a goto.
  it('exports DRIFT even when the flow has no step that needs pick', () => {
    const gotoOnly = emit(specOf([{ tool: 'goto', args: { url: 'http://app.test/x' }, locators: {} }]));
    expect(gotoOnly).not.toContain('async function pick');
    expect(gotoOnly).toContain('export const DRIFT: string[] = [];');
  });

  it('types p as an open record when the step has no slots', () => {
    const spec = specOf([{ tool: 'back', args: {}, locators: {} }], { params: {}, segments: [segment([{ tool: 'back', args: {}, locators: {} }], { params: {} })] });
    expect(emit(spec)).toContain("async '01-do'(page: Page, p: Record<string, string>, outputs: Outputs, run: FlowRun = createFlowRun())");
  });
});

describe('step bodies', () => {
  const one = (step: SkillStep, over?: Partial<SpecSegment>) =>
    emit(specOf([step], over ? { segments: [segment([step], over)] } : {}));

  /**
   * NEW CONTRACT. Every locator step resolves through the shared policy first
   * — a single candidate too — so the statement acts on `hit<N>.locator`, and
   * the recorded candidate reaches the policy as an OBSERVATION rather than a
   * bare Locator. The tool-by-tool statement is otherwise what it always was.
   */
  it('renders each tool with its Playwright statement', () => {
    const loc = { target: [{ kind: 'testid' as const, attr: 'data-testid', value: 'save' }] };
    const OBSERVED = `{ locator: page.getByTestId('save'), index: 0, structural: false, kind: 'testid', carries: JSON.stringify({ kind: 'testid', attr: 'data-testid', value: 'save' }) },`;
    const clicked = one({ tool: 'click', args: { target: '@e1' }, locators: loc });
    expect(clicked).toContain('const hit1 = await pick(page, [');
    expect(clicked).toContain(OBSERVED);
    expect(clicked).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    expect(one({ tool: 'dblclick', args: { target: '@e1' }, locators: loc })).toContain('await click(hit1.locator, { dbl: true, obs: obs1 }).catch(actionFailed);');
    expect(one({ tool: 'right_click', args: { target: '@e1' }, locators: loc })).toContain("await hit1.locator.click({ button: 'right' }).catch(actionFailed); // plain, as replay dispatches it — robustClick's tiers are for click/dblclick only");
    // through the inlined helper, never Playwright's own fill (which fires no `change`)
    expect(one({ tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: loc })).toContain(
      'await fill(hit1.locator, `${p.v1}`).catch(actionFailed);',
    );
    // through the inlined helper, never `pressSequentially` alone (the recipe ladder comes first, as in tools.ts)
    expect(one({ tool: 'type', args: { target: '@e1', text: 'abc', delay_ms: 50 }, locators: loc })).toContain("await type(hit1.locator, 'abc', { delay: 50 }).catch(actionFailed);");
    expect(one({ tool: 'type', args: { target: '@e1', text: 'abc' }, locators: loc })).toContain("await type(hit1.locator, 'abc').catch(actionFailed);");
    expect(one({ tool: 'press', args: { target: '@e1', key: 'Enter' }, locators: loc })).toContain("await hit1.locator.press('Enter').catch(actionFailed);");
    expect(one({ tool: 'select', args: { target: '@e1', option: 'Client One' }, locators: loc })).toContain(
      "await select(hit1.locator, 'Client One').catch(actionFailed);",
    );
    expect(one({ tool: 'check', args: { target: '@e1', checked: true }, locators: loc })).toContain('await hit1.locator.check().catch(actionFailed);');
    expect(one({ tool: 'check', args: { target: '@e1', checked: false }, locators: loc })).toContain('await hit1.locator.uncheck().catch(actionFailed);');
    expect(one({ tool: 'goto', args: { url: 'http://app.test/x' }, locators: {} })).toContain("await page.goto('http://app.test/x');");
  });

  it('presses a key on the page when the recording had no target', () => {
    expect(one({ tool: 'press', args: { key: 'Escape' }, locators: {} })).toContain("await page.keyboard.press('Escape').catch(actionFailed);");
  });

  it('arms a dialog handler before the click that raises it', () => {
    expect(one({ tool: 'dialog_expect', args: { action: 'accept' }, locators: {} })).toContain("page.once('dialog', (dialog) => dialog.accept());");
    expect(one({ tool: 'dialog_expect', args: { action: 'dismiss', count: 2 }, locators: {} })).toContain("page.on('dialog', (dialog) => dialog.dismiss());");
  });

  it('writes a labelled read into outputs, by kind', () => {
    const loc = { target: [{ kind: 'id' as const, selector: '#total' }] };
    // A read goes through readOptional even with ONE candidate: an observation
    // that cannot be re-captured must not fail the flow (see readLines).
    // The call is emitted inside the step lifecycle's `act` callback, so the
    // three lines are matched consecutively by text rather than by column.
    expect(
      sequenceAt(one({ tool: 'read', args: { target: '@e1', what: 'text' }, locators: loc, label: 'total' }), [
        "outputs['01-do.total'] = await readOptional(page, [",
        `{ locator: page.locator('#total'), index: 0, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#total' }) },`,
        "], '01-do s_test1/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift });",
      ]),
    ).toBeGreaterThan(-1);
    expect(one({ tool: 'read', args: { target: '@e1', what: 'value' }, locators: loc, label: 'name' })).toContain(
      "'01-do s_test1/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'value'), { drift: run.drift });",
    );
    expect(one({ tool: 'read', args: { what: 'url' }, locators: {}, label: 'here' })).toContain("outputs['01-do.here'] = page.url();");
    expect(one({ tool: 'read_all', args: { target: '@e1', what: 'text' }, locators: loc, label: 'rows' })).toContain("(loc: Locator) => readElements(loc, true, 'text')");
    // attribute and count reads take the same shared call the daemon's read tools do
    expect(one({ tool: 'read', args: { target: '@e1', what: 'attr', attr: 'href' }, locators: loc, label: 'link' })).toContain("(loc: Locator) => readElements(loc, false, 'attr', { attr: 'href' })");
    expect(one({ tool: 'read_all', args: { target: '@e1', what: 'count' }, locators: loc, label: 'rows' })).toContain("(loc: Locator) => readElements(loc, true, 'count')");
  });

  it('leaves an unlabelled read as an observation', () => {
    const out = one({ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#t' }] } });
    expect(out).toContain('// observed: read text (unlabelled');
    expect(out).not.toContain('outputs[');
  });

  it('resolves a multi-candidate action through pick, never through a .or() union', () => {
    const out = one({
      tool: 'fill',
      args: { target: '@e1', value: 'x' },
      locators: {
        target: [
          { kind: 'id', selector: '#login-email' },
          { kind: 'css', selector: '[data-testid="form-dialog"] input' },
        ],
      },
    });
    expect(out).toContain('const hit1 = await pick(page, [');
    expect(out).toContain(`{ locator: page.locator('#login-email'), index: 0, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#login-email' }) },`);
    expect(out).toContain("await fill(hit1.locator, 'x').catch(actionFailed);");
    // a union would be a strict-mode violation the moment a fallback matched two inputs
    expect(out).not.toContain('.or(page');
    // the helper is the adapter over the shared policy, and takes observations
    expect(out).toContain('async function pick(');
    expect(out).toContain('  candidates: CandidateObservation[],');
    expect(out).toContain('  const hit = await resolveTarget(page, candidates, where, policy, opts);');
    expect(out).toContain("import { type ElementHandle, expect, test, type Locator, type Page } from '@playwright/test';");
  });

  it('reports a fallthrough as one stable, grep-able drift line and pushes it into DRIFT', () => {
    const out = one({
      tool: 'fill',
      args: { target: '@e1', value: 'x' },
      locators: {
        target: [
          { kind: 'id', selector: '#login-email' },
          { kind: 'css', selector: '[data-testid="form-dialog"] input' },
        ],
      },
    });
    expect(out).toContain('const hit1 = await pick(page, [');
    expect(out).toContain(`{ locator: page.locator('#login-email'), index: 0, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#login-email' }) },`);
    expect(out).toContain(`{ locator: page.locator('[data-testid="form-dialog"] input'), index: 1, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '[data-testid="form-dialog"] input' }) },`);
    expect(out).toContain("], '01-do s_test1/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, { drift: run.drift });");
    // the line is reported off the RESOLUTION the shared policy handed back —
    // its winning index, and the reason every candidate ahead of it was passed over
    // — and only when a candidate tried ahead of the winner failed (the shared isDrift)
    expect(out).toContain('if (isDrift(hit)) {');
    expect(out).toContain('export function isDrift(hit: { index: number; missed: readonly unknown[] }): boolean {'.replace('export ', ''));
    expect(out).toContain("const missed = hit.missed.map((m) => `#${m.index + 1} ${m.reason}`).join(', ');");
    expect(out).toContain('const line = `[sitelooper drift] ${where}: ${head} #${hit.index + 1} ${String(hit.locator)} (${missed})`;');
    expect(out).toContain('console.warn(line);');
    expect(out).toContain('(opts.drift ?? DRIFT).push(line);');
    expect(syntaxErrors(out)).toEqual([]);
  });

  /**
   * fwrd42, `sitelooper repair` had promoted
   * `page.locator('tr', { hasText: '{{v5}}' }).locator('td:nth-of-type(1)')` to
   * primary off live replay evidence, yet the compiled spec logged it as missed
   * on ~40% of runs and took `getByText` (twice a purely structural fallback)
   * instead.
   *
   * NEW CONTRACT. The artifact-only "re-check the candidates ahead before you
   * demote the primary" rule is GONE BY DESIGN: the embedded policy walks the
   * WHOLE chain once per poll exactly as the daemon does (resolve.ts rule 6),
   * so a primary that is merely painting late wins on the next poll rather
   * than through a special case the daemon never had. What protects against
   * phantom drift is the lifecycle's `settle` in `prepare` (the daemon's own
   * settleDom) plus the policy's structural HOLD (rule 5). These cases pin the
   * REPLACEMENT behaviour, run off the artifact's own embedded copy.
   */
  describe('the shared policy decides which recorded candidate takes the step', () => {
    const scopedChain: SkillStep = {
      tool: 'wait_for',
      args: { target: '@e1', state: 'visible' },
      locators: {
        target: [
          { kind: 'scoped', container: 'tr', hasText: '{{v1}}', selector: 'td:nth-of-type(1)' },
          { kind: 'text', text: '{{v1}}' },
        ],
      },
    };
    /** The helpers of an artifact that really resolves a chain. */
    const helpers = () => runnableHelpers(one(scopedChain));

    it('emits the scoped primary ahead of the text fallback, both in stored order, identity-guarded', () => {
      const out = one(scopedChain);
      // Both observations, with their STORED index — no reordering (the policy
      // orders them at run time), no dedupe, and no `.filter({ hasText })`
      // guard bolted onto a fallback: identity is the policy's job now, and it
      // is handed the run's own value for the segment's known slot.
      expect(out).toContain(
        `{ locator: page.locator('tr', { hasText: \`\${p.v1}\` }).locator('td:nth-of-type(1)'), index: 0, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'tr', hasText: \`\${p.v1}\`, selector: 'td:nth-of-type(1)' }) },`,
      );
      expect(out).toContain(
        `{ locator: page.getByText(\`\${p.v1}\`, { exact: true }), index: 1, structural: false, kind: 'text', carries: JSON.stringify({ kind: 'text', text: \`\${p.v1}\` }) },`,
      );
      expect(out).toContain("requireIdentity: identityValues({ v1: p.v1 }, ['{{v1}}', '{{v1}}'])");
      expect(out).not.toContain('.filter({ hasText');
      expect(syntaxErrors(out)).toEqual([]);
    });

    it('falls through to the named fallback, with one drift line naming why the primary was passed over', async () => {
      const { pick } = helpers();
      const drift: string[] = [];
      const primary = fakeLocator({ counts: [0] }, 'primary');
      const fallback = fakeLocator({ counts: [1] }, 'fallback');
      const hit = await pick(
        pageStub(),
        [obs({ locator: primary, index: 0, kind: 'scoped' }), obs({ locator: fallback, index: 1, kind: 'text' })],
        '01-do s_test1/1 target',
        NO_WAIT,
        { drift },
      );
      expect(hit.locator).toBe(fallback);
      expect(hit.index).toBe(1);
      expect(drift).toEqual(['[sitelooper drift] 01-do s_test1/1 target: primary primary missed; used #2 fallback (#1 absent)']);
    });

    it('passes over an ambiguous primary for a unique fallback, and says it was ambiguous', async () => {
      const { pick } = helpers();
      const drift: string[] = [];
      // Two rows carry the text: replay skips a candidate that is not unique
      // and so must the artifact — an ambiguous primary is drift, never a
      // relaxation of what counts as resolved.
      const primary = fakeLocator({ counts: [2] }, 'primary');
      const fallback = fakeLocator({ counts: [1] }, 'fallback');
      const hit = await pick(
        pageStub(),
        [obs({ locator: primary, index: 0, kind: 'scoped' }), obs({ locator: fallback, index: 1, kind: 'text' })],
        '01-do s_test1/1 target',
        NO_WAIT,
        { drift },
      );
      expect(hit.index).toBe(1);
      expect(drift).toHaveLength(1);
      expect(drift[0]).toContain('(#1 ambiguous)');
      // and an ambiguous chain with nothing else in it resolves to nothing at all
      await expect(
        pick(pageStub(), [obs({ locator: fakeLocator({ counts: [2] }, 'only'), index: 0 })], 'w', NO_WAIT, { drift: [] }),
      ).rejects.toThrow(/none of 1 recorded locators resolved at w/);
    });

    it('HOLDS a structural fallback while a named candidate may still be painting', async () => {
      const { pick } = helpers();
      // The named primary is absent for the first two passes; the path hits at
      // once. The path is held for the window, and the name wins when it lands
      // — no drift, because the recorded primary is what took the step.
      const held: string[] = [];
      const name = fakeLocator({ counts: [0, 0, 1] }, 'name');
      const path = fakeLocator({ counts: [1] }, 'path');
      const chain = () => [
        obs({ locator: name, index: 0, kind: 'testid' }),
        obs({ locator: path, index: 1, kind: 'css', structural: true }),
      ];
      const hit = await pick(pageStub(), chain(), 'w', { waitMs: 40, pollMs: 5 }, { drift: held });
      expect(hit.index).toBe(0);
      expect(held).toEqual([]);
      // with no window the guess stands at once, and that IS drift
      const drift: string[] = [];
      const now = await pick(
        pageStub(),
        [obs({ locator: fakeLocator({ counts: [0] }, 'gone'), index: 0, kind: 'testid' }), obs({ locator: fakeLocator({ counts: [1] }, 'path'), index: 1, kind: 'css', structural: true })],
        'w',
        NO_WAIT,
        { drift },
      );
      expect(now.index).toBe(1);
      expect(now.structural).toBe(true);
      expect(drift[0]).toContain('(#1 absent)');
    });
  });

  it('places a @step location comment before each step\'s first statement, in order', () => {
    const stepA: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#a' }] } };
    const stepB: SkillStep = { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'id', selector: '#b' }] } };
    const out = emit(specOf([stepA, stepB]));
    const lines = out.split('\n');
    const stepLines = lines.map((l) => l.trim()).filter((l) => l.startsWith('// @step '));
    expect(stepLines).toEqual(['// @step 01-do s_test1/1', '// @step 01-do s_test1/2']);
    // The @step comment still opens its own step, but the step is now the
    // shared lifecycle: the url this step started from is captured, then
    // `prepare` does the settle replay does at the top of runOneStep (BEFORE
    // reading that url), and only then does `act` run the recorded action.
    // `prepare` also takes the alert baseline the verify-phase alertGate is
    // judged against (a state-changing step; a read takes none).
    const step = (n: number, selector: string) => [
      `// @step 01-do s_test1/${n}`,
      `let urlBefore${n} = '';`,
      `let alertsBefore${n}: string[] = [];`,
      `let alertsAfter${n}: ObservedAlerts | null = null;`,
      `let obs${n}: ActionObservation | null = null;`,
      'await runStepLifecycle({',
      'prepare: async () => {',
      'await settle(page);',
      `urlBefore${n} = page.url();`,
      `alertsBefore${n} = (await liveAlerts(page)) ?? [];`,
      '},',
      'act: async () => {',
      // the resolution is the first thing `act` does, and the action reads its locator
      `const hit${n} = await pick(page, [`,
      `{ locator: page.locator('${selector}'), index: 0, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '${selector}' }) },`,
      `], '01-do s_test1/${n} target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, { drift: run.drift });`,
      // the action's observation begins just before it dispatches (the shared beginAction)
      `obs${n} = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true });`,
      `await click(hit${n}.locator, { obs: obs${n} }).catch(actionFailed);`,
    ];
    const i1 = sequenceAt(out, step(1, '#a'));
    const i2 = sequenceAt(out, step(2, '#b'));
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    // and the comment is the first line of its step, not buried inside it
    expect(lines.findIndex((l) => l.trim() === '// @step 01-do s_test1/1')).toBe(i1);
  });

  /**
   * NEW CONTRACT. A candidate whose EXPRESSION duplicates an earlier one used
   * to be dropped at compile. It is kept now, with its stored index: the
   * daemon hands the shared policy the stored chain entire, and an artifact
   * that handed it a shortened one would report a different candidate index
   * in its drift lines than the daemon reports for the same recording.
   */
  it('keeps a duplicate candidate expression, with its own stored index', () => {
    const out = one({
      tool: 'click',
      args: { target: '@e1' },
      locators: { target: [{ kind: 'id', selector: '#go' }, { kind: 'css', selector: '#go' }] },
    });
    expect(out).toContain(`{ locator: page.locator('#go'), index: 0, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#go' }) },`);
    expect(out).toContain(`{ locator: page.locator('#go'), index: 1, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: '#go' }) },`);
    expect(out).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
  });

  // NEW CONTRACT: a single-candidate click needs `pick` too, so the flow that
  // needs neither helper is one with no locator step at all.
  it('inlines the pick helper only when a step needs it', () => {
    const out = one({ tool: 'goto', args: { url: 'http://app.test/x' }, locators: {} });
    expect(out).not.toContain('async function pick');
    expect(out).not.toContain('async function resolveTarget');
    // and nothing the resolution alone pulls in
    expect(out).not.toContain('const RESOLVE_WAIT_MS');
    expect(out).not.toContain('const PICK_WAIT_MS');
  });

  /**
   * NEW CONTRACT. Locator used to be imported only when an emitted ADAPTER
   * (click/fill/hover/select) took one. It is now imported by every artifact,
   * because every step settles and settling pulls in the shared browser
   * module WHOLE (src/execution/browser.ts, via executionSource) rather than
   * a hand-picked subset — and that module's click and input implementations
   * are typed in terms of Locator. The import is therefore not conditional;
   * what stays conditional is which ADAPTERS are emitted on top of it.
   */
  it('imports Locator because the shared browser module it embeds takes one', () => {
    const noHelper = one({ tool: 'read', args: { what: 'url' }, locators: {}, label: 'here' });
    expect(noHelper).toContain("import { expect, test, type Locator, type Page } from '@playwright/test';");
    // the import is earned, not speculative: the embedded module really uses it
    expect(noHelper).toContain('async function robustClick(loc: Locator, opts: ClickOpts): Promise<string> {');
    expect(noHelper).toContain('async function settleDom(page: Page, maxMs: number = SETTLE_MAX_MS): Promise<void> {');
    // and a flow that never clicks still emits no click ADAPTER of its own
    expect(noHelper).not.toContain('async function click(loc: Locator');
    const clicked = one({ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#b' }] } });
    expect(clicked).toContain("import { expect, test, type Locator, type Page } from '@playwright/test';");
    expect(clicked).toContain('async function click(loc: Locator');
  });

  it('lets a read_all match many, which is what it is for', () => {
    const out = one({
      tool: 'read_all',
      args: { target: '@e1', what: 'text' },
      locators: { target: [{ kind: 'id', selector: '#rows' }, { kind: 'css', selector: '.row' }] },
      label: 'rows',
    });
    // `allowMultiple: true` is what lets the policy hand back a candidate that
    // matched many; the read callback reads across them all.
    expect(out).toMatch(
      /], '[^']+', \{ allowMultiple: true, [^\n]*\}, \(loc: Locator\) => readElements\(loc, true, 'text'\), \{ drift: run\.drift \}\);/,
    );
    expect(out).not.toContain('any: true');
  });

  /**
   * NEW CONTRACT. A recorded position is no longer dropped. The shared policy
   * resolves a point by MARKING what sits under it (pointLocator/markPoint,
   * src/execution/point.ts) and refusing it when nothing of the recorded kind
   * is there — so Tier 2 loses nothing and there is no TODO to write.
   */
  it('resolves a point candidate rather than dropping it', () => {
    const out = one({
      tool: 'click',
      args: { target: '@e1' },
      locators: { target: [{ kind: 'role', role: 'button', name: 'Save' }, { kind: 'point', x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 }] },
    });
    expect(out).toContain(
      `{ locator: pointLocator(page, { x: 10, y: 20 }), index: 1, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 }), point: { x: 10, y: 20, w: 5, h: 5, role: 'button', tag: 'button', vw: 800, vh: 600 } },`,
    );
    expect(out).not.toContain('dropped the recorded position fallback');
    expect(out).not.toContain('// TODO:');
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('runs a step whose only candidate was where the element was, marking the point', () => {
    const spec = specOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'point', x: 1, y: 2, w: 3, h: 4, role: null, tag: 'div', vw: 800, vh: 600 }] } }]);
    const { source, warnings, diagnostics } = emitFlowFile(spec, { tier: 'plain' });
    expect(source).toContain(
      `{ locator: pointLocator(page, { x: 1, y: 2 }), index: 0, structural: true, kind: 'point', carries: JSON.stringify({ kind: 'point', x: 1, y: 2, w: 3, h: 4, role: null, tag: 'div', vw: 800, vh: 600 }), point: { x: 1, y: 2, w: 3, h: 4, role: null, tag: 'div', vw: 800, vh: 600 } },`,
    );
    expect(source).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    expect(source).not.toContain('// TODO: no locator this compiler can express for click');
    expect(warnings).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(syntaxErrors(source)).toEqual([]);
  });

  /**
   * What the unsupported-capability diagnostic is still FOR: a recorded chain
   * with no candidate at all. The TODO is the compilation blocker; the throw
   * is what stops a run of it; the diagnostic is what every surface prints. A
   * comment alone let this compile, run, and quietly do less than the recording.
   */
  it('refuses to run a step whose target was recorded with no candidate at all', () => {
    const spec = specOf([{ tool: 'click', args: { target: '@e1' }, locators: { target: [] } }]);
    const { source, warnings, diagnostics } = emitFlowFile(spec, { tier: 'plain' });
    expect(source).toContain('// TODO: no locator this compiler can express for click');
    expect(source).toContain("throw new Error('Unsupported recorded locator: click has no locator a standalone spec can express');");
    expect(warnings.some((w) => w.includes('has no locator a spec can express'))).toBe(true);
    expect(diagnostics.map((d) => d.code)).toEqual(['unsupported-capability']);
  });
});

describe('expectations', () => {
  const withExpect = (expectation: SkillStep['expect'], tool = 'click', args: Record<string, unknown> = { target: '@e1' }) =>
    emit(specOf([{ tool, args, locators: { target: [{ kind: 'id', selector: '#b' }] }, expect: expectation }]));
  /** The step bodies only — the embedded modules' own comments name what the bodies must not. */
  const bodiesOf = (source: string) => source.slice(source.indexOf('export const steps = {'));

  /**
   * NEW CONTRACT. No regex is built for a url any more: every recorded pattern,
   * whatever its shape, is handed as-is — markers intact — to the shared
   * urlEffectVerdict (src/execution/gates.ts, embedded), which is the daemon's
   * own expectedUrl rule: strict urlMatches passes, a same-shape url with 1–2
   * differing literal segments is treated as volatile (warned, continued),
   * anything else stops. The regex form disagreed with it in six places
   * (decoding, trailing slashes, an unbound `{{dN}}`, a live hash route, `:id`
   * inside a segment, and the soft match it had no notion of).
   */
  it('checks a recorded url through the shared urlEffect verdict, whatever the pattern shape', () => {
    const path = withExpect({ urlPattern: 'http://app.test/items/:id' });
    expect(path).toContain("await urlEffect(page, 'http://app.test/items/:id', p, '01-do s_test1/1');");
    expect(path).not.toContain('toHaveURL(');
    expect(path).not.toContain('new RegExp(`^http');
    expect(path).toContain('// Shared execution source: gates.ts. Regenerate to update.');
    expect(path).toContain('function urlEffectVerdict(');
    // the slot stays a marker in the emitted call; `p` fills it at run time, as replay does
    const slotted = withExpect({ urlPattern: 'http://app.test/items/{{v1}}' });
    expect(slotted).toContain("await urlEffect(page, 'http://app.test/items/{{v1}}', p, '01-do s_test1/1');");
    expect(slotted).toMatch(/async '01-do'\(page: Page, p: \{[^}]*\bv1: string/);
    // the adapter: a strict match is waited for on the navigation itself, then
    // the verdict is asked ONCE of wherever the browser is; a warning is logged,
    // a stop thrown
    const helper = /\nasync function urlEffect\(page: Page[\s\S]*?\n\}\n/.exec(path);
    expect(helper).not.toBeNull();
    expect(helper![0]).toContain('await page.waitForURL((url) => urlMatches(pattern, url.toString(), p), { timeout: URL_WAIT_MS }).catch(() => {});');
    expect(helper![0]).toContain('const verdict = urlEffectVerdict(pattern, page.url(), p, where);');
    expect(helper![0]).toContain('for (const line of verdict.warnings) logWarning(line);');
    expect(helper![0]).toContain('if (verdict.stop) throw new Error(verdict.stop);');
    expect(path).toContain('const URL_WAIT_MS = 5000;');
    expect(syntaxErrors(path)).toEqual([]);
  });

  it('judges the emitted url gate exactly as the daemon does: strict, soft-and-warn, stop', () => {
    const out = withExpect({ urlPattern: 'http://app.test/items/{{v1}}/edit' });
    const { urlEffectVerdict } = runnableHelpers(out);
    const p = { v1: '42' };
    expect(urlEffectVerdict('http://app.test/items/{{v1}}/edit', 'http://app.test/items/42/edit?tab=1', p, 'x')).toEqual({ warnings: [] });
    // one literal segment differs: volatile, warned, the generalisation handed back
    const soft = urlEffectVerdict('http://app.test/items/{{v1}}/r1', 'http://app.test/items/42/r2', p, 'x');
    expect(soft.stop).toBeUndefined();
    expect(soft.warnings).toEqual(['x: url segment(s) differ from recorded (r1→r2) — treated as volatile']);
    expect(soft.generalised).toBe('http://app.test/items/{{v1}}/:var');
    // a different page shape stops
    // a different WORD route is a different page, not a volatile value
    expect(urlEffectVerdict('http://app.test/items/{{v1}}/edit', 'http://app.test/items/42/view', p, 'x').stop).toBeDefined();
    expect(urlEffectVerdict('http://app.test/items/{{v1}}/edit', 'http://app.test/', p, 'x').stop).toBe(
      'after x expected url http://app.test/items/42/edit but browser is at http://app.test/',
    );
  });

  it('matches a query-shaped hash as unordered STATE, through the shared urlMatches itself (the odoo failure)', () => {
    const out = withExpect({ urlPattern: 'http://app.test/web#action=:id&cids=1&menu_id={{v1}}' });
    // The artifact calls the daemon's own urlMatches on the recorded pattern,
    // markers intact, and fills the slots from `p` exactly as replay fills them.
    expect(out).toContain("await urlEffect(page, 'http://app.test/web#action=:id&cids=1&menu_id={{v1}}', p, '01-do s_test1/1');");
    expect(out).toContain('// Shared execution source: url.ts. Regenerate to update.');
    expect(out).toContain('function urlMatches(pattern: string, url: string, params: Record<string, string> = {}): boolean {');
    // the slot the pattern names is one the step's `p` carries
    expect(out).toMatch(/async '01-do'\(page: Page, p: \{[^}]*\bv1: string/);
    // no second copy of the state comparison survives
    expect(out).not.toContain('hashMatch');
    expect(out).not.toContain('hashState(');
    // a hash ROUTE takes the very same form — there is no regex to fall back to
    const route = withExpect({ urlPattern: 'http://app.test/a#/detail/:id' });
    expect(route).toContain("await urlEffect(page, 'http://app.test/a#/detail/:id', p, '01-do s_test1/1');");
    expect(route).not.toContain('toHaveURL(');
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('accepts the recorded state in any order, with extra pairs, and refuses a wrong value', () => {
    const { urlMatches } = runnableHelpers(withExpect({ urlPattern: 'http://app.test/web#action=316&cids=1' }));
    const pattern = 'http://app.test/web#action=316&cids=1';
    // the SECOND cloud run's url, pair for pair, in another order
    expect(urlMatches(pattern, 'http://app.test/web#cids=1&model=sale.order&action=316', {})).toBe(true);
    expect(urlMatches(pattern, 'http://app.test/web#action=317&cids=1', {})).toBe(false);
    // a pair the pattern names with a LITERAL must be there
    expect(urlMatches(pattern, 'http://app.test/web#action=316', {})).toBe(false);
    // a :id/:var one is app-minted state: anything, or absent
    expect(urlMatches('http://app.test/web#action=316&cids=:id', 'http://app.test/web#action=316', {})).toBe(true);
    // a slot is filled from this run's own params, and left a wildcard when unbound
    expect(urlMatches('http://app.test/web#action=316&menu_id={{v1}}', 'http://app.test/web#action=316&menu_id=81', { v1: '81' })).toBe(true);
    expect(urlMatches('http://app.test/web#action=316&menu_id={{v1}}', 'http://app.test/web#action=316&menu_id=81', { v1: '82' })).toBe(false);
    expect(urlMatches('http://app.test/web#action=316&menu_id={{v1}}', 'http://app.test/web#action=316&menu_id=81', {})).toBe(true);
    // another page, or a route where state was recorded, is not this page
    expect(urlMatches(pattern, 'http://app.test/other#action=316&cids=1', {})).toBe(false);
    expect(urlMatches(pattern, 'http://app.test/web#/action/316', {})).toBe(false);
    // the daemon's rule, not the old regex's: the head is compared DECODED and
    // segment-wise, so a trailing slash or an encoded segment is the same page
    expect(urlMatches('http://app.test/a b/web#action=316', 'http://app.test/a%20b/web/#action=316', {})).toBe(true);
  });

  /**
   * NEW CONTRACT. A recorded page line is no longer rebuilt as a Playwright
   * locator and asserted visible; the step's `verify` phase hands the recorded
   * lines, as recorded, to the daemon's own effect gate (expectedChangesVerdict,
   * src/execution/expect.ts — embedded, not restated), which masks and fills
   * them from `p` at run time and matches WHOLE snapshot lines: role, name,
   * state and the value after the colon.
   */
  it('passes a masked line to the verdict as recorded; the shared lineShows reads the mask (the kanboard failure)', () => {
    const out = withExpect({ addedContains: ['- heading "Due {{*}}"'] });
    expect(out).toContain("await expectChanges(page, ['- heading \"Due {{*}}\"'], p, ");
    // no second implementation of the mask survives in the artifact
    expect(out).not.toContain('new RegExp(`Due ');
    expect(out).not.toContain('getByRole');
    expect(syntaxErrors(out)).toEqual([]);
    // the embedded matcher is the daemon's: a masked token matches another time
    const { lineShows } = runnableHelpers(out);
    expect(lineShows(['- heading "Due 09/03/2026 07:22"'], ['- heading "Due {{*}}"'])).toBe(true);
    expect(lineShows(['- heading "Due"'], ['- heading "Due {{*}}"'])).toBe(false);
  });

  it('checks a line that is nothing BUT wildcards too: the verdict reads it, where no locator could name it', () => {
    const out = withExpect({ addedContains: ['- textbox "{{*}} {{*}}": {{*}}'] });
    expect(out).toContain("await expectChanges(page, ['- textbox \"{{*}} {{*}}\": {{*}}'], p, ");
    expect(bodiesOf(out)).not.toContain('nothing nameable');
    expect(bodiesOf(out)).not.toContain('toBeVisible');
    const { lineShows } = runnableHelpers(out);
    expect(lineShows(['- textbox "09/03/2026 07:31": 2026-12-31'], ['- textbox "{{*}} {{*}}": {{*}}'])).toBe(true);
  });

  it('embeds the shared text and url modules once, ahead of the gates module that imports them', () => {
    // Every step runs the shared gates (errorPageGate at least), and gates.ts
    // imports text.ts and url.ts — so both are carried by every artifact, each
    // exactly once, and ahead of the module that reads them.
    const plain = withExpect(undefined);
    for (const name of ['text', 'url', 'gates']) {
      expect(plain.split(`// Shared execution source: ${name}.ts.`).length, name).toBe(2);
    }
    expect(plain).toContain('function escapeRe(s: string): string {');
    expect(plain.indexOf('// Shared execution source: text.ts.')).toBeLessThan(plain.indexOf('// Shared execution source: gates.ts.'));
    expect(plain.indexOf('// Shared execution source: url.ts.')).toBeLessThan(plain.indexOf('// Shared execution source: gates.ts.'));
    // and nothing imports them
    expect(plain).not.toMatch(/^import .*\.\/(?:text|url|gates|observe)\.js/m);
  });

  it('hands every recorded line to the shared verdict in verify, transient lines filtered as the daemon filters them', () => {
    const out = withExpect({
      addedContains: ['- heading "{{v1}} Widget"', '- status "Loading…"', '- generic "sidebar"', '- tab "New Project"'],
    });
    // ONE call, the recorded lines as recorded (markers intact — the verdict
    // fills them from `p` at run time exactly as replay does), the step's own
    // tag for the reason text, and the pre-action capture as the diff leg.
    expect(out).toContain(
      "await expectChanges(page, ['- heading \"{{v1}} Widget\"', '- generic \"sidebar\"', '- tab \"New Project\"'], p, " +
        "{ tag: '01-do s_test1/1', tool: 'click', positionalResolution: positional1 }, linesBefore1);",
    );
    // a transient line never reaches the gate (the FLOW constant still records it)
    expect(out).not.toContain("'- status \"Loading…\"'");
    // the observation is captured in prepare, after the settle and the url
    // read, in the dialect the gate judges by
    const lines = trimmedLines(out);
    const prepare = lines.indexOf('prepare: async () => {');
    const captured = lines.indexOf('linesBefore1 = await capturePageLines(page);');
    expect(prepare).toBeGreaterThan(-1);
    expect(captured).toBeGreaterThan(lines.indexOf('urlBefore1 = page.url();', prepare));
    expect(captured).toBeLessThan(lines.indexOf('act: async () => {', prepare));
    expect(out).toContain('let linesBefore1: string[] | null = null;');
    // the gate runs in verify, and it is the daemon's own — embedded, not restated
    expect(lines.indexOf("const changes1 = await expectChanges(page, ['- heading \"{{v1}} Widget\"', '- generic \"sidebar\"', '- tab \"New Project\"'], p, { tag: '01-do s_test1/1', tool: 'click', positionalResolution: positional1 }, linesBefore1);")).toBeGreaterThan(lines.indexOf('verify: async () => {'));
    expect(out).toContain('// Shared execution source: expect.ts. Regenerate to update.');
    expect(out).toContain('// Shared execution source: snapshot.ts. Regenerate to update.');
    expect(out).toContain('async function expectedChangesVerdict(');
    expect(out).toContain("function observeDocumentInPage(");
    // the slot the line names is one the step's `p` carries
    expect(out).toMatch(/async '01-do'\(page: Page, p: \{[^}]*\bv1: string/);
    // and nothing of the locator union survives, in the bodies or the helpers
    expect(bodiesOf(out)).not.toContain('toBeVisible');
    expect(out).not.toContain('looseText');
    expect(out).not.toContain('getByPlaceholder');
    expect(out).not.toContain('getByTitle');
    expect(out).not.toMatch(/getByRole\('(?:heading|generic|tab)'/);
    expect(syntaxErrors(out)).toEqual([]);
  });

  /**
   * THE FIX THIS CONTRACT EXISTS FOR. The locator union only ever found the
   * NAME of a recorded line: `- combobox "Project": {{v1}}` passed on any
   * visible Project combobox whatever it showed — a false success in the
   * highest-traffic gate, on exactly the shape a select/check/non-echo fill
   * records. The embedded verdict reads the whole line, value included, and
   * it is run here off the emitted source itself, not off the module it came
   * from, so the artifact is what is being tested.
   */
  it('checks the value after the colon, not only the control\'s name (the false-success shape)', async () => {
    const out = withExpect({ addedContains: ['- combobox "Project": {{v1}}'] }, 'select', { target: '@e1', option: '{{v1}}' });
    expect(out).toContain(
      "await expectChanges(page, ['- combobox \"Project\": {{v1}}'], p, { tag: '01-do s_test1/1', tool: 'select', positionalResolution: positional1 }, linesBefore1);",
    );
    const { expectedChangesVerdict } = runnableHelpers(out);
    const ctx = { tag: '01-do s_test1/1', tool: 'select', positionalResolution: false };
    const showing = (line: string) => ({ added: [] as string[], live: async () => ({ lines: [line], complete: true }) });
    // the control is on the page, visible, and named Project — and holds the wrong value
    const wrong = await expectedChangesVerdict(['- combobox "Project": {{v1}}'], { v1: 'Beta' }, ctx, showing('- combobox "Project": Alpha'));
    expect(wrong.stop).toMatch(/did not show "- combobox \\"Project\\": Beta"/);
    // the right value passes, in the diff or on the live page
    const right = await expectedChangesVerdict(['- combobox "Project": {{v1}}'], { v1: 'Beta' }, ctx, showing('- combobox "Project": Beta'));
    expect(right.stop).toBeUndefined();
    const inDiff = await expectedChangesVerdict(['- combobox "Project": {{v1}}'], { v1: 'Beta' }, ctx, { added: ['- combobox "Project": Beta'], live: async () => ({ lines: [], complete: true }) });
    expect(inDiff.stop).toBeUndefined();
    expect(inDiff.warnings).toEqual([]);
  });

  it('captures the lines before the action only for a step that has a page-change expectation', () => {
    const none = bodiesOf(withExpect({ urlPattern: 'http://app.test/items/:id' }));
    expect(none).not.toContain('linesBefore');
    expect(none).not.toContain('capturePageLines(page)');
    expect(none).not.toContain('expectChanges(');
    // a read carries no page-change gate in either runner's compiled output
    const read = bodiesOf(emit(specOf([{ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#b' }] }, label: 'x', expect: { addedContains: ['- heading "x"'] } }])));
    expect(read).not.toContain('linesBefore');
    expect(read).not.toContain('expectChanges(');
    // all-transient lines are no expectation at all
    const transient = bodiesOf(withExpect({ addedContains: ['- status "Saving…"', '- progressbar ""'] }));
    expect(transient).not.toContain('linesBefore');
    expect(transient).not.toContain('expectChanges(');
  });

  /**
   * NEW CONTRACT. Positional resolution is no longer a compile-time guess over
   * the chain: the chain is resolved by the shared policy at run time, and
   * what it RESOLVED TO is what the effect gate must sharpen on — replay's own
   * per-step flag. The step declares the flag, sets it from the resolution
   * right after its pick, and passes it to the verdict.
   */
  it("passes a fill's value to the verdict, and says whether the target may be positional", () => {
    const named = withExpect({ addedContains: ['- textbox "": {{v1}}', '- heading "{{v1}}"'] }, 'fill', { target: '@e1', value: '{{v1}}' });
    expect(named).toContain(
      "await expectChanges(page, ['- textbox \"\": {{v1}}', '- heading \"{{v1}}\"'], p, { tag: '01-do s_test1/1', tool: 'fill', value: `${p.v1}`, positionalResolution: positional1 }, linesBefore1);",
    );
    // the echo rule is the verdict's own, applied at run time and only to a
    // positional resolution — exactly as replay applies it; the compiler no
    // longer pre-filters the lines
    expect(named).toContain("'- textbox \"\": {{v1}}'");
    // the flag is declared with the step's other lifecycle state, and set from
    // the resolution — a structural candidate, or one the policy narrowed to
    // an index, is what makes the resolution positional
    expect(
      sequenceAt(named, [
        'let linesBefore1: string[] | null = null;',
        'let positional1 = false;',
      ]),
    ).toBeGreaterThan(-1);
    expect(
      sequenceAt(named, [
        "], '01-do s_test1/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, { drift: run.drift });",
        'positional1 = positional1 || hit1.structural || hit1.nth !== undefined;',
      ]),
    ).toBeGreaterThan(-1);
    // and the compile-time facts the policy judges positionality from are on
    // the observations themselves: a path is structural, an index carries nth
    const positional = emit(
      specOf([{ tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'css', selector: '#form > div > input' }] }, expect: { addedContains: ['- textbox "": {{v1}}', '- heading "{{v1}}"'] } }]),
    );
    expect(positional).toContain(`{ locator: page.locator('#form > div > input'), index: 0, structural: true, kind: 'css',`);
    expect(positional).toContain('positional1 = positional1 || hit1.structural || hit1.nth !== undefined;');
    const indexed = emit(
      specOf([{ tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Title', nth: 1 }] }, expect: { addedContains: ['- heading "{{v1}}"'] } }]),
    );
    expect(indexed).toContain(`{ locator: page.getByRole('textbox', { name: 'Title', exact: true }).nth(1), index: 0, structural: true, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'textbox', name: 'Title', nth: 1 }), nth: 1 },`);
    expect(indexed).toContain('positional1 = positional1 || hit1.structural || hit1.nth !== undefined;');
    // a step with recorded changes but NO locator still answers the gate
    const noTarget = emit(specOf([{ tool: 'goto', args: { url: 'http://app.test/x' }, locators: {}, expect: { addedContains: ['- heading "Items"'] } }]));
    expect(noTarget).toContain('positionalResolution: false }');
    expect(noTarget).not.toContain('let positional1 = false;');
  });

  it('applies the echo rule at run time, positional only, off the emitted source', async () => {
    const out = withExpect({ addedContains: ['- textbox "": {{v1}}', '- heading "{{v1}}"'] }, 'fill', { target: '@e1', value: '{{v1}}' });
    const { expectedChangesVerdict } = runnableHelpers(out);
    const lines = ['- textbox "": {{v1}}', '- heading "{{v1}}"'];
    const echoOnly = { added: ['- textbox "": My Title'], live: async () => ({ lines: ['- textbox "": My Title'], complete: true }) };
    // positional: the echo is what the wrong textbox produces too, so only the heading counts — and it is absent
    const positional = await expectedChangesVerdict(lines, { v1: 'My Title' }, { tag: '1', tool: 'fill', value: 'My Title', positionalResolution: true }, echoOnly);
    expect(positional.stop).toMatch(/did not show "- heading \\"My Title\\""/);
    // named: the echo is evidence enough, as replay has it
    const named = await expectedChangesVerdict(lines, { v1: 'My Title' }, { tag: '1', tool: 'fill', value: 'My Title', positionalResolution: false }, echoOnly);
    expect(named.stop).toBeUndefined();
    // positional with only the echo recorded: the old gate stands, and it says so
    const lone = await expectedChangesVerdict(['- textbox "": {{v1}}'], { v1: 'My Title' }, { tag: '1', tool: 'fill', value: 'My Title', positionalResolution: true }, echoOnly);
    expect(lone.stop).toBeUndefined();
    expect(lone.warnings.join(' ')).toContain("only recorded effect is the fill's own echo");
  });

  /**
   * A recorded dialog that did not open is conditional UI, not a failed
   * effect (replay: StepVerdict.absentDialog). The body remembers it, and
   * every later step asks the shared namesDialogControl before it resolves —
   * skipping as belonging to the dialog, or clearing the state and running as
   * its own step. A minting step is never skipped.
   */
  it('remembers a recorded dialog that did not open, and skips the steps that were going to act inside it', () => {
    const button = (name: string) => [{ kind: 'role' as const, role: 'button', name }];
    const source = emit(
      specOf([
        { tool: 'click', args: { target: '@e1' }, locators: { target: button('Exit') }, expect: { addedContains: ['- dialog "Discard changes?"', '- button "Discard"'] } },
        { tool: 'click', args: { target: '@e2' }, locators: { target: button('Discard') } },
        { tool: 'click', args: { target: '@e3' }, locators: { target: button('Confirm') }, mints: { at: 'p1' } },
        { tool: 'goto', args: { url: 'http://app.test/next' }, locators: {} },
        { tool: 'click', args: { target: '@e4' }, locators: { target: button('Mark') } },
      ]),
    );
    const lines = trimmedLines(source);
    // the state, declared once at the top of the body
    expect(source.match(/let absentDialog: \{ name: string; lines: string\[\] \} \| null = null;/g)).toHaveLength(1);
    expect(lines.indexOf('let absentDialog: { name: string; lines: string[] } | null = null;')).toBeLessThan(lines.indexOf('// @step 01-do s_test1/1'));
    // set by the verdict of the step that recorded the dialog
    expect(source).toContain(
      "const changes1 = await expectChanges(page, ['- dialog \"Discard changes?\"', '- button \"Discard\"'], p, { tag: '01-do s_test1/1', tool: 'click', positionalResolution: positional1 }, linesBefore1);",
    );
    expect(source).toContain('absentDialog = changes1.absentDialog ?? null;');
    // the step before it consults nothing (there is no dialog to be absent yet)
    const step1 = source.slice(source.indexOf('// @step 01-do s_test1/1'), source.indexOf('// @step 01-do s_test1/2'));
    expect(step1).not.toContain('absentDialogSkip');
    expect(step1).not.toContain('absentDialog = null;');
    // a later step that names one of the dialog's controls may be skipped — ahead of the pick and the click
    const step2 = source.slice(source.indexOf('// @step 01-do s_test1/2'), source.indexOf('// @step 01-do s_test1/3'));
    expect(
      sequenceAt(step2, [
        "if (absentDialog !== null && (await absentDialogSkip([page.getByRole('button', { name: 'Discard', exact: true })], {\"target\":[{\"kind\":\"role\",\"name\":\"Discard\"}]}, absentDialog, p, '01-do s_test1/2'))) {",
        "return { status: 'skipped' };",
        '}',
        'absentDialog = null;',
      ]),
    ).toBeGreaterThan(-1);
    expect(trimmedLines(step2).indexOf('absentDialog = null;')).toBeLessThan(trimmedLines(step2).indexOf('const hit2 = await pick(page, ['));
    expect(trimmedLines(step2).indexOf('absentDialog = null;')).toBeLessThan(trimmedLines(step2).indexOf('await click(hit2.locator, { obs: obs2 }).catch(actionFailed);'));
    // a minting step is never skipped: it only clears the state
    const step3 = source.slice(source.indexOf('// @step 01-do s_test1/3'), source.indexOf('// @step 01-do s_test1/4'));
    expect(step3).not.toContain('absentDialogSkip');
    expect(step3).toContain('absentDialog = null;');
    // a page-level step clears it too, as every resolved step does in replay
    const step4 = source.slice(source.indexOf('// @step 01-do s_test1/4'), source.indexOf('// @step 01-do s_test1/5'));
    expect(step4).not.toContain('absentDialogSkip');
    expect(step4).toContain('absentDialog = null;');
    // the skip rule is the shared one, embedded once
    expect(source).toContain('function namesDialogControl(');
    expect(source).toContain('async function absentDialogSkip(');
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('carries no dialog state in a body that recorded no dialog', () => {
    const out = withExpect({ addedContains: ['- heading "Saved"'] });
    expect(bodiesOf(out)).not.toContain('absentDialog');
    expect(out).not.toContain('async function absentDialogSkip(');
    // a dialog line carrying this run's own value is HARD, not conditional UI
    const hard = withExpect({ addedContains: ['- dialog "{{v1}}"'] });
    expect(bodiesOf(hard)).not.toContain('absentDialog');
  });

  /**
   * NEW CONTRACT. A repeated url pattern used to be elided: the second step
   * that recorded the same pattern asserted nothing, on the theory that the
   * first check already proved it. That is false whenever the step in between
   * navigates — the page can leave and come back, and the elided check was
   * exactly the one that would have caught it not coming back. Every step that
   * recorded a url now asserts it, in its own `verify` phase, after its own
   * settle. (test/execution-parity.test.ts covers the live case.)
   */
  it('asserts the recorded url on every step that has one, repeats included', () => {
    const at = (pattern: string): SkillStep => ({
      tool: 'click',
      args: { target: '@e1' },
      locators: { target: [{ kind: 'id', selector: '#b' }] },
      expect: { urlPattern: pattern },
    });
    const source = emit(specOf([at('http://app.test/a'), at('http://app.test/a'), at('http://app.test/b')]));
    const asserted = source.split('\n').filter((l) => l.includes('await urlEffect(page, '));
    expect(asserted.length).toBe(3);
    expect(asserted[0]).toContain("'http://app.test/a', p, '01-do s_test1/1'");
    expect(asserted[1]).toContain("'http://app.test/a', p, '01-do s_test1/2'");
    expect(asserted[2]).toContain("'http://app.test/b', p, '01-do s_test1/3'");
    // each check belongs to its own step, and runs in that step's verify phase
    const lines = trimmedLines(source);
    const steps = [1, 2, 3].map((n) => lines.indexOf(`// @step 01-do s_test1/${n}`));
    const checks = lines.flatMap((l, i) => (l.includes('await urlEffect(page, ') ? [i] : []));
    const verifies = lines.flatMap((l, i) => (l === 'verify: async () => {' ? [i] : []));
    for (const n of [0, 1, 2]) {
      expect(checks[n]).toBeGreaterThan(verifies[n]);
      expect(checks[n]).toBeGreaterThan(steps[n]);
      if (n < 2) expect(checks[n]).toBeLessThan(steps[n + 1]);
    }
  });

  /**
   * NEW CONTRACT. An alert used to be a comment. Now every state-changing step
   * observes the live-region alerts before and after it acts (liveAlerts,
   * src/execution/observe.ts — the daemon's own capture) and asks the shared
   * alertVerdict: an alert the recording never saw STOPS the step (the app
   * talking back — a rejection toast over an intact page, fwrd4l-n3), while a
   * recorded-but-missing one only warns, because toasts are volatile.
   */
  it('gates every state-changing step on its live-region alerts, through the shared alertVerdict', () => {
    const out = withExpect({ alertContains: 'Saved {{v1}} items' });
    expect(out).not.toContain('// expected alert containing');
    expect(out).toContain("alertGate(alertsBefore1, alertsAfter1, { where: '01-do s_test1/1', isRead: false, expectedContains: 'Saved {{v1}} items', params: p });");
    // the baseline is taken in prepare, before the action; the after-capture
    // in the lifecycle's SETTLE phase — right after the action has settled and
    // before verify's url wait, where the daemon takes its diff, so a toast that
    // auto-dismisses inside that wait is not missed; the verdict in verify
    const lines = trimmedLines(out);
    const prepare = lines.indexOf('prepare: async () => {');
    const act = lines.indexOf('act: async () => {');
    const settled = lines.indexOf('settle: async () => {');
    const verify = lines.indexOf('verify: async () => {');
    const before = lines.indexOf('alertsBefore1 = (await liveAlerts(page)) ?? [];');
    const after = lines.indexOf('alertsAfter1 = await settledAlerts(page);');
    const gate = lines.findIndex((l) => l.startsWith('alertGate(alertsBefore1, alertsAfter1,'));
    expect(before).toBeGreaterThan(prepare);
    expect(before).toBeLessThan(act);
    expect(after).toBeGreaterThan(settled);
    expect(after).toBeLessThan(verify);
    expect(gate).toBeGreaterThan(verify);
    expect(gate).toBeGreaterThan(lines.findIndex((l) => l.startsWith('await urlEffect(')));
    // the error-page gate is first, the url gate ahead of the alert gate, as replay orders STEP_GATES
    expect(lines.indexOf("errorPageGate(page, '01-do s_test1/1');")).toBe(verify + 1);
    expect(out).toContain('// Shared execution source: observe.ts. Regenerate to update.');
    expect(out).toContain('function alertVerdict(');
    expect(out).toContain('async function liveAlerts(page: Page, d: LineDialect = 1): Promise<string[] | null> {');
    // one selector, in the one capture both observations are views of
    expect(out).toContain("'[role=alert],[role=status]'");
    expect(out.split("'[role=alert],[role=status]'").length).toBe(2);
    // the observation settles first (the daemon captures its diff after settleDom), then looks once
    const helper = /\nasync function settledAlerts\(page: Page[\s\S]*?\n\}\n/.exec(out);
    expect(helper).not.toBeNull();
    expect(helper![0]).toContain('await settle(page);');
    expect(helper![0]).toContain('return liveAlertsObserved(page, dialect);');
    expect(helper![0].indexOf('await settle(page);')).toBeLessThan(helper![0].indexOf('liveAlertsObserved('));
    // and the gate judges what the lifecycle handed it: no capture of its own, no settle of its own
    const gateHelper = /\nfunction alertGate\(before: string\[\], after: ObservedAlerts \| null[\s\S]*?\n\}\n/.exec(out);
    expect(gateHelper).not.toBeNull();
    expect(gateHelper![0]).toContain('const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);');
    expect(gateHelper![0]).not.toContain('liveAlerts(');
    expect(gateHelper![0]).not.toContain('settle(');
    expect(gateHelper![0]).toContain('if (verdict.stop) throw new Error(verdict.stop);');
    // an UNRECORDED alert is checked on every state-changing step, recorded expectation or not
    const plain = withExpect(undefined);
    expect(plain).toContain("alertGate(alertsBefore1, alertsAfter1, { where: '01-do s_test1/1', isRead: false, params: p });");
    // and a read is exempt, exactly as replay's unrecordedAlert exempts it
    const read = withExpect(undefined, 'read', { target: '@e1', what: 'text' });
    expect(read).not.toContain('alertGate(');
    expect(read).not.toContain('liveAlerts(');
    expect(syntaxErrors(out)).toEqual([]);

    // the verdict itself, run from the artifact: unrecorded stops, expected-but-missing warns, unobserved is neither
    const { alertVerdict } = runnableHelpers(out);
    const ctx = { where: 'x', isRead: false, params: { v1: '3' } };
    expect(alertVerdict([], ['Ticket is not ready'], ctx)).toEqual({ warnings: [], stop: 'x raised an alert the recording never saw: Ticket is not ready' });
    expect(alertVerdict(['Ticket is not ready'], ['Ticket is not ready'], ctx)).toEqual({ warnings: [] });
    expect(alertVerdict([], ['Saved 3 items'], { ...ctx, expectedContains: 'Saved {{v1}} items' })).toEqual({ warnings: [] });
    expect(alertVerdict([], [], { ...ctx, expectedContains: 'Saved {{v1}} items' })).toEqual({ warnings: ['x: expected alert containing "Saved 3 items"'] });
    expect(alertVerdict([], null, ctx)).toEqual({ warnings: ['x: the page could not be captured after the action — whether it raised an alert is unknown, not clear'], unobserved: true });
  });
});

describe('preconditions, minting and loops', () => {
  it('checks a bound identity marker at segment entry and skips an unbound one', () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#b' }] } };
    const bound = emit(specOf([step], { segments: [segment([step], { preconditions: { urlPattern: 'http://app.test/x', requireText: ['{{v1}}'] } })] }));
    // The daemon's own question (checkIdentity → confirmPresence, the shared
    // snapshot module, embedded): a fresh dialect-2 observation, whose lines
    // carry a field's VALUE after the colon — which is what an odoo form in
    // edit mode shows and what sp5odb died on when the artifact asked getByText
    // instead — bounded (`whole`) so a neighbouring record's id cannot pass,
    // and answering 'unknown' (never 'absent') on a look that could not cover
    // the page. No dialect of the artifact's own.
    expect(bound).toContain(
      "await expect.poll(async () => (await confirmPresence(page, [`${p.v1}`], 2, { whole: true })).presence, { timeout: 5000, message: 'identity: {{v1}} is not confirmed on this page' }).toBe('present');",
    );
    expect(bound).toContain('async function confirmPresence(page: Page, lines: string[], d: LineDialect, opts: LineShowsOptions = {}): Promise<{ presence: Presence; why?: string }> {');
    expect(bound).not.toContain('async function present(');
    expect(bound).not.toContain('getByText(re ?? text)');
    expect(bound).not.toContain(".locator('input, textarea, select')");
    // C06. The identity half is BOUNDED, and by the daemon's own matcher — not
    // a second copy written out here, which would be free to drift away from
    // it the way a hand-copied VOLATILE_TOKEN_SHAPE would: the artifact embeds
    // src/execution/text.ts whole, identitySource and its boundary class with it.
    expect(bound).toContain('// Shared execution source: text.ts. Regenerate to update.');
    expect(bound).toContain('function identityRe(marker: string): RegExp {');
    expect(bound).toContain('function identitySource(marker: string): string {');
    expect(bound).not.toContain('const EDGE = ');
    const { identityRe, identitySource } = runnableHelpers(bound);
    expect(identitySource('x')).toContain(IDENTITY_EDGE);
    // `fwgr25-n1` must not be satisfied by a page showing `fwgr25-n10`
    expect(identityRe('fwgr25-n1').test('Ticket fwgr25-n1 open')).toBe(true);
    expect(identityRe('fwgr25-n1').test('Ticket fwgr25-n10 open')).toBe(false);
    expect(identityRe('RD-1015').test('(RD-1015)')).toBe(true);
    expect(identityRe('RD-1015').test('RD-10150')).toBe(false);
    // embedded once, and ahead of the module that reads it
    expect(bound.split('// Shared execution source: text.ts.').length).toBe(2);
    expect(bound.indexOf('// Shared execution source: text.ts.')).toBeLessThan(bound.indexOf('async function confirmPresence('));
    expect(syntaxErrors(bound)).toEqual([]);
    const unbound = emit(
      specOf([step], { segments: [segment([step], { params: {}, preconditions: { urlPattern: 'http://app.test/x', requireText: ['{{v9}}'] } })] }),
    );
    expect(unbound).toContain('is unbound here — nothing to check.');
    expect(unbound).not.toContain('(await confirmPresence(');
  });

  /**
   * C02, and fwrd53. The gate — url and identity — sits immediately before a
   * segment's first PAGE-DEPENDENT step (the shared segmentGate), as replay
   * places it. Ahead of a goto it would ask the page being left. A goto inside
   * the segment ahead of the gate is an older skill's shape: its url is not
   * asked, and its markers only of a page of the recorded template
   * (landedOnRecordedPage).
   */
  it('places the segment gate before its first page-dependent step', () => {
    const goto: SkillStep = { tool: 'goto', args: { url: 'http://app.test/items/42' }, locators: {} };
    const click: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#b' }] } };
    const pre = { urlPattern: 'http://app.test/items/:id', requireText: ['{{v1}}'] };
    const pollText = 'await expect.poll(async () => (await confirmPresence(page, [`${p.v1}`], 2, { whole: true })).presence';
    const source = emit(specOf([goto, click], { segments: [segment([goto, click], { preconditions: pre })] }));
    const poll = source.indexOf(pollText);
    expect(poll).toBeGreaterThan(-1);
    expect(poll).toBeGreaterThan(source.indexOf("await page.goto('http://app.test/items/42');"));
    expect(poll).toBeLessThan(source.indexOf("locator('#b')"));
    expect(source).toContain("if (landedOnRecordedPage('http://app.test/items/:id', page.url())) {");
    expect(source).toContain('function landedOnRecordedPage(');
    expect(source).not.toContain('await preconditionGate(');
    expect(syntaxErrors(source)).toEqual([]);

    // With nothing ahead of it, the gate is at segment entry, url first.
    const still = emit(specOf([click], { segments: [segment([click], { preconditions: pre })] }));
    expect(still.indexOf(pollText)).toBeLessThan(still.indexOf("locator('#b')"));
    expect(still.indexOf('await preconditionGate(')).toBeLessThan(still.indexOf(pollText));
    expect(still).not.toContain('if (landedOnRecordedPage(');

    // A wait for `body` looks at no page: the whole gate moves past it,
    // url included, and is still asked (no navigation ran ahead of it).
    const wait: SkillStep = { tool: 'wait_for', args: { target: 'body', state: 'visible' }, locators: {} };
    const waited = emit(specOf([wait, click], { segments: [segment([wait, click], { preconditions: pre })] }));
    expect(waited.indexOf('await preconditionGate(')).toBeGreaterThan(waited.indexOf('// @step 01-do s_test1/1'));
    expect(waited.indexOf('await preconditionGate(')).toBeLessThan(waited.indexOf('// @step 01-do s_test1/2'));
    expect(syntaxErrors(waited)).toEqual([]);

    // fwrd51 (wait_for → goto → click) from about:blank: no url gate, and the
    // markers after the goto.
    const looked = emit(specOf([wait, goto, click], { segments: [segment([wait, goto, click], { preconditions: pre })] }));
    const lookedPoll = looked.indexOf(pollText);
    expect(looked).not.toContain('await preconditionGate(');
    expect(lookedPoll).toBeGreaterThan(looked.indexOf("await page.goto('http://app.test/items/42');"));
    expect(lookedPoll).toBeLessThan(looked.indexOf("locator('#b')"));
    expect(syntaxErrors(looked)).toEqual([]);

    // A segment with no page-dependent step is never gated.
    const none = emit(specOf([wait, goto], { segments: [segment([wait, goto], { preconditions: pre })] }));
    expect(none).not.toContain('await preconditionGate(');
    expect(none).not.toContain(pollText);
  });

  it("re-reads a minted url part after the DOM settles, so a second redirect cannot strand it (the odoo signin failure)", () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#save' }] }, mints: { at: 'p1' } };
    const out = emit(specOf([step], { segments: [segment([step], { derived: { d1: { step: 1, at: 'q.action', example: '123' } } })] }));
    const helper = /\nasync function urlPartsWhen\(page: Page[\s\S]*?\n\}\n/.exec(out);
    expect(helper).not.toBeNull();
    // replay binds derived values only AFTER settleDom on a url change; without
    // that, odoo's second redirect left d1..d3 bound off an intermediate url and
    // the following toHaveURL waited for a url that never came back
    expect(helper![0]).toContain('await settle(page);');
    expect(helper![0].indexOf('await settle(page);')).toBeGreaterThan(helper![0].indexOf('values.every(Boolean)'));
    // and the transitive dependency is inlined
    expect(out).toContain('async function settle(page: Page): Promise<void> {');
    expect(syntaxErrors(out)).toEqual([]);
  });

  /**
   * NEW CONTRACT. The precondition url used to be a comment; the artifact ran
   * every step on whatever page it was given. It is now replay's own
   * start-of-segment rule, through the shared preconditionVerdict
   * (src/execution/gates.ts): strict match passes, a same-shape url with 1–2
   * differing segments proceeds with a warning, anything else refuses before
   * its first page-dependent step acts. A goto ahead of that step exempts the
   * url, as in replay.
   */
  it('gates the precondition url through the shared preconditionVerdict, unless the segment navigated ahead of the gate', async () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#b' }] } };
    const out = emit(specOf([step]));
    expect(out).toContain('// recorded on a page matching http://app.test/items');
    // AWAITED, and the helper is async: a gate whose call could be left
    // un-awaited is one that can silently become a no-op the day it grows a wait.
    expect(out).toContain("await preconditionGate('http://app.test/items', page.url(), p, '01-do s_test1', null);");
    expect(out).not.toMatch(/^\s*preconditionGate\(/m);
    expect(out).toContain("async function preconditionGate(pattern: string, url: string, p: Record<string, string>, where: string, similarity: number | null | 'unmeasured'): Promise<void> {");
    expect(out.indexOf("await preconditionGate('http://app.test/items', page.url()")).toBeLessThan(out.indexOf('// @step 01-do s_test1/1'));
    expect(out).toContain('function preconditionVerdict(');
    // the adapter passes what it knows about the fingerprint: null here (none recorded)
    expect(out).toContain('const verdict = preconditionVerdict(pattern, url, p, similarity);');
    expect(out).toContain('if (verdict.refuse) throw new Error(`${where}: ${verdict.refuse} — nothing of this segment has run`);');
    expect(syntaxErrors(out)).toEqual([]);
    // the verdict, run from the artifact
    const { preconditionVerdict, preconditionGate } = runnableHelpers(out);
    expect(preconditionVerdict('http://app.test/items/{{v1}}', 'http://app.test/items/7', { v1: '7' }, null)).toEqual({ warnings: [] });
    expect(preconditionVerdict('http://app.test/items/7', 'http://app.test/items/8', {}, null)).toMatchObject({
      warnings: ['start url differs from the recorded pattern in 1 segment(s) (7→8) — proceeding optimistically'],
      soft: { generalised: 'http://app.test/items/:var' },
    });
    expect(preconditionVerdict('http://app.test/items/7', 'http://app.test/', {}, null).refuse).toBe(
      'not on the page this procedure starts from (expects http://app.test/items/7, browser is at http://app.test/)',
    );
    // and the gate itself: a soft match proceeds with no fingerprint recorded, refuses when one was
    await expect(preconditionGate('http://app.test/items/7', 'http://app.test/items/8', {}, 'x', null)).resolves.toBeUndefined();
    await expect(preconditionGate('http://app.test/items/7', 'http://app.test/items/8', {}, 'x', 'unmeasured')).rejects.toThrow(
      /x: not on the page this procedure starts from .*cannot measure the live page against it.* — nothing of this segment has run/,
    );
    await expect(preconditionGate('http://app.test/items/7', 'http://app.test/items/7', {}, 'x', 'unmeasured')).resolves.toBeUndefined();

    // a segment whose first step is a goto puts the browser on the recorded page itself
    const goto: SkillStep = { tool: 'goto', args: { url: 'http://app.test/items' }, locators: {} };
    const self = emit(specOf([goto, step]));
    expect(self).not.toContain('preconditionGate(');

    // the guard sits ahead of the identity check, as replay orders them
    const identity = emit(specOf([step], { segments: [segment([step], { preconditions: { urlPattern: 'http://app.test/items', requireText: ['{{v1}}'] } })] }));
    expect(identity.indexOf('await preconditionGate(')).toBeLessThan(identity.indexOf('await expect.poll(async () => (await confirmPresence(page,'));
  });

  /**
   * Replay decides a soft url match at a fingerprinted segment by measuring
   * the live page against the recording's fingerprint. The spec carries the
   * vector, and the artifact's call site is replay's adapter verbatim:
   * `cosine(recorded, (await fingerprintPage(page)) ?? undefined)` over the
   * embedded shared module — so a page that cannot be read is null, as in
   * replay. Only a file compiled before the vector travelled still refuses.
   */
  describe('the page fingerprint at the segment precondition', () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#b' }] } };
    const recorded = normaliseFingerprint(Array.from({ length: FINGERPRINT_DIMS }, (_, i) => (i % 5 === 0 ? 1 : 0)));
    const fingerprinted = () => specOf([step], { segments: [segment([step], { preconditions: { urlPattern: 'http://app.test/items/7', fingerprint: recorded } })] });
    const MODULE = '// Shared execution source: fingerprint.ts.';

    /** The emitted call site, run with the emitted helpers (FLOW in scope) against a page stub. */
    function runGate(source: string, page: unknown): Promise<void> {
      const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source)!;
      const js = ts.transpileModule(block[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
      const names = [...block[1].matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
      expect(names).toEqual(expect.arrayContaining(['preconditionGate', 'recordedFingerprint', 'fingerprintPage', 'cosine']));
      const call = trimmedLines(source).find((l) => l.startsWith('await preconditionGate('))!;
      const run = new Function('DRIFT', 'console', 'FLOW', 'page', 'p', `${js}\nreturn (async () => { ${call} })();`);
      return run([], { warn: () => {} }, liftFlowFile(source).spec, page, {}) as Promise<void>;
    }
    const pageAt = (url: string, counts: number[] | 'throws') => ({
      url: () => url,
      evaluate: async () => {
        if (counts === 'throws') throw new Error('navigating');
        return counts;
      },
    });

    it('measures the live page with the embedded fingerprintPage and passes the cosine, and says nothing', () => {
      const { source, warnings, diagnostics } = emitFlowFile(fingerprinted(), { tier: 'plain' });
      expect(source).toContain(
        "await preconditionGate('http://app.test/items/7', page.url(), p, '01-do s_test1', cosine(recordedFingerprint('01-do', 's_test1'), (await fingerprintPage(page)) ?? undefined));",
      );
      expect(source).toContain('function recordedFingerprint(stepId: string, segmentId: string): number[] {');
      expect(source.split(MODULE).length).toBe(2);
      expect(source).toContain('async function fingerprintPage(page: Page): Promise<number[] | null> {');
      expect(source).toContain('function cosine(a: number[] | undefined, b: number[] | undefined): number | null {');
      expect(warnings).toEqual([]);
      expect(diagnostics.filter((d) => d.code === 'unmeasured-precondition')).toEqual([]);
      expect(syntaxErrors(source)).toEqual([]);
      // the vector travels once, on one line of FLOW, and lifts back to the same IR
      expect(source.split('\n').filter((l) => l.includes('"fingerprint": [')).length).toBe(1);
      expect(liftFlowFile(source).spec).toEqual(fingerprinted());
      expect(emitFlowFile(liftFlowFile(source).spec, { tier: 'plain' }).source).toBe(source);
    });

    it('proceeds on a soft url match when the page structure agrees, and refuses when it does not', async () => {
      const source = emit(fingerprinted());
      const same = recorded.map((x) => x * 3);
      await expect(runGate(source, pageAt('http://app.test/items/8', same))).resolves.toBeUndefined();
      const other = recorded.map((x, i) => (x ? 0 : i % 7 === 1 ? 1 : 0));
      await expect(runGate(source, pageAt('http://app.test/items/8', other))).rejects.toThrow(
        /01-do s_test1: not on the page this procedure starts from .*the url shape is close but the page structure is not — similarity 0\) — nothing of this segment has run/,
      );
      // a strict match passes whatever the structure
      await expect(runGate(source, pageAt('http://app.test/items/7', other))).resolves.toBeUndefined();
      // replay's rule on a page that cannot be read: null, so the url alone decides
      await expect(runGate(source, pageAt('http://app.test/items/8', 'throws'))).resolves.toBeUndefined();
    });

    /**
     * Replay reads startUrl, THEN fingerprints (src/skills/replay.ts), so the
     * url and the similarity both describe the page as the segment found it.
     * The artifact must read the url in the same order: as an argument ahead
     * of the measurement, never inside the helper after every argument (the
     * measurement included, up to 2s) has been evaluated.
     */
    it("reads the url before measuring, as replay reads startUrl before it fingerprints", async () => {
      const source = emit(fingerprinted());
      const call = trimmedLines(source).find((l) => l.startsWith('await preconditionGate('))!;
      expect(call.indexOf('page.url()')).toBeGreaterThan(-1);
      expect(call.indexOf('page.url()')).toBeLessThan(call.indexOf('fingerprintPage(page)'));
      expect(source).not.toMatch(/preconditionVerdict\(pattern, page\.url\(\)/);

      // a page whose url moves while it is being measured: the verdict is the pre-measurement url's
      const movingPage = (from: string, to: string, counts: number[] | 'throws') => {
        let url = from;
        return {
          url: () => url,
          evaluate: async () => {
            url = to;
            if (counts === 'throws') throw new Error('navigating');
            return counts;
          },
        };
      };
      const other = recorded.map((x, i) => (x ? 0 : i % 7 === 1 ? 1 : 0));
      // started off the page, landed strictly on it mid-measurement: replay refuses the old url, so must the artifact
      await expect(runGate(source, movingPage('http://app.test/', 'http://app.test/items/7', other))).rejects.toThrow(
        /01-do s_test1: not on the page this procedure starts from \(expects http:\/\/app\.test\/items\/7, browser is at http:\/\/app\.test\/\)/,
      );
      // started on a soft match, redirected elsewhere mid-measurement (null): replay proceeds on the soft match, so does the artifact
      await expect(runGate(source, movingPage('http://app.test/items/8', 'http://app.test/', 'throws'))).resolves.toBeUndefined();
    });

    it('keeps null, and embeds no fingerprint module, where the recording kept no fingerprint', () => {
      const source = emit(specOf([step]));
      expect(source).toContain("await preconditionGate('http://app.test/items', page.url(), p, '01-do s_test1', null);");
      expect(source).not.toContain(MODULE);
      expect(source).not.toContain('recordedFingerprint(');
      expect(emitFlowFile(specOf([step]), { tier: 'plain' }).warnings).toEqual([]);
    });

    it("keeps 'unmeasured' for a segment of an old file with only the flag, and says to recompile", () => {
      const spec = specOf([step], { segments: [segment([step], { preconditions: { urlPattern: 'http://app.test/items', fingerprinted: true } })] });
      const { source, warnings, diagnostics } = emitFlowFile(spec, { tier: 'plain' });
      const line = '01-do: segment s_test1 enforces its url precondition without the page-fingerprint soft-match (this file predates carried fingerprints and has no vector to measure against) — recompile it with `sitelooper compile`';
      expect(warnings).toEqual([line]);
      expect(diagnostics).toEqual([expect.objectContaining({ code: 'unmeasured-precondition', step: '01-do', severity: 'warning', line })]);
      expect(source).toContain('// NOTE: the recording fingerprinted this page, but this file predates carried fingerprints, so a soft url match is refused here (only a strict match passes) where replay would decide it by fingerprint. Recompile to carry the fingerprint.');
      expect(source).toContain("await preconditionGate('http://app.test/items', page.url(), p, '01-do s_test1', 'unmeasured');");
      expect(source).not.toContain(MODULE);
      // a self-navigating segment is never asked, so nothing is said
      const goto: SkillStep = { tool: 'goto', args: { url: 'http://app.test/items' }, locators: {} };
      const selfNav = specOf([goto], { segments: [segment([goto], { preconditions: { urlPattern: 'http://app.test/items', fingerprinted: true } })] });
      expect(emitFlowFile(selfNav, { tier: 'plain' }).warnings).toEqual([]);
    });
  });

  it('binds a derived value off the live url after the step that mints it', () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#save' }] }, mints: { at: 'p1' } };
    const source = emit(specOf([step], { segments: [segment([step], { derived: { d1: { step: 1, at: 'p1', example: '42' } } })] }));
    // The url the step started from is captured in `prepare`, before the
    // action; the part is bound in `bind`, after the action and after the
    // lifecycle's post-action settle.
    expect(
      sequenceAt(source, ['prepare: async () => {', 'await settle(page);', 'urlBefore1 = page.url();']),
    ).toBeGreaterThan(-1);
    expect(
      sequenceAt(source, [
        'bind: async () => {',
        "bindPart(p, 'd1', await urlPartWhen(page, 'p1', urlBefore1)); // recorded example: 42",
        "// This step creates a record; expose this run's identifier for teardown.",
        // the minted id names the same url part, and is published only when
        // THIS step changed it — a pre-existing id is not evidence of creation
        "const minted1 = changedCreation(urlPart(urlBefore1, 'p1'), p.d1);",
        'if (minted1) {',
        "outputs['01-do.minted'] = minted1;",
        'if (!run.created.includes(minted1)) run.created.push(minted1);',
      ]),
    ).toBeGreaterThan(-1);
    // urlPart is the daemon's own (src/execution/url.ts), embedded — not a re-implementation
    expect(source).toContain('// Shared execution source: url.ts. Regenerate to update.');
    expect(source).toContain('function urlPart(url: string, label: string): string | undefined {');
    // a minted slot is declared on p and starts empty: only the live run can fill it
    expect(source).toContain("await steps['01-do'](page, { v1: vars.name }, outputs, run);");
  });

  /**
   * A required expectation — a line carrying this run's own value — whose
   * lines named no element used to emit no assertion at all, leaving a step
   * that ran and checked nothing about its effect (marked UNCHECKED so the
   * readiness gate could refuse it). `describeInPage` renders an element whose
   * subtree text is empty or over-long as `role ""`, so this is an ordinary
   * recording. The shared verdict has no notion of "unnameable": it matches
   * the line as text, as the daemon always did, so the hole is closed rather
   * than marked.
   */
  it('checks a required expectation no locator could name, instead of marking it UNCHECKED', async () => {
    const step: SkillStep = {
      tool: 'click',
      args: { target: '@e1' },
      locators: { target: [{ kind: 'id', selector: '#save' }] },
      expect: { addedContains: ['- generic "" {{v1}}'] },
    };
    const { source, warnings } = emitFlowFile(specOf([step]), { tier: 'plain' });
    expect(source).not.toContain('UNCHECKED');
    expect(warnings.filter((w) => w.includes('does not check its effect'))).toEqual([]);
    expect(source).toContain("await expectChanges(page, ['- generic \"\" {{v1}}'], p, ");
    const { expectedChangesVerdict } = runnableHelpers(source);
    const ctx = { tag: '1', tool: 'click', positionalResolution: false };
    expect((await expectedChangesVerdict(['- generic "" {{v1}}'], { v1: 'Widget A' }, ctx, { added: [], live: async () => ({ lines: ['- generic "" Widget A'], complete: true }) })).stop).toBeUndefined();
    expect((await expectedChangesVerdict(['- generic "" {{v1}}'], { v1: 'Widget A' }, ctx, { added: [], live: async () => ({ lines: ['- generic "" Widget B'], complete: true }) })).stop).toMatch(/did not show/);
  });

  /**
   * C01. The emitted loop does not RESTATE replay's loop; it calls it. The
   * cursor, the shrink wait, the progress guard and the cap-as-a-budget live
   * in `runFoldedLoop` (src/execution/loop.ts), and what the artifact supplies
   * is the three observations that policy asks for: settle, resolve the guard,
   * run the body for one cursor.
   */
  it('runs a folded loop through the shared loop policy, cursor and cap included', () => {
    const body: SkillStep[] = [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Remove' }] } }];
    const loop: SkillStep = { tool: 'loop', args: {}, locators: {}, body, while: [{ kind: 'role', role: 'button', name: 'Remove' }], max: 7 };
    const source = emit(specOf([loop]));
    expect(source).toContain('const loop1 = await runFoldedLoop({');
    expect(source).toContain('  settle: () => settle(page),');
    // NEW CONTRACT: the guard is the same chain, resolved through the shared
    // policy with ambiguity allowed (replay's own guard call) — never a union,
    // and never a hand-rolled count loop of the artifact's own
    expect(
      sequenceAt(source, [
        'guard: async () => {',
        'const guard1 = await resolveCandidates(page, [',
        `{ locator: page.getByRole('button', { name: 'Remove', exact: true }), index: 0, structural: false, kind: 'role', carries: JSON.stringify({ kind: 'role', role: 'button', name: 'Remove' }) },`,
        '], { allowMultiple: true });',
        'return guard1 ? guard1.locator : null;',
      ]),
    ).toBeGreaterThan(-1);
    expect(source).not.toContain('const candidates1: Locator[] = [');
    expect(source).not.toContain('.or(page');
    // the body acts on the record at the cursor, not always the first match —
    // and the cursor is the POLICY's `ambiguousNth`, which narrows only a
    // candidate that really matched several, never an unconditional `.nth()`.
    // What it resolved TO is sunk for the progress guard (replay sinks every
    // body target too).
    expect(source).toContain('runBody: async (cursor1: number, pass1: LoopPass) => {');
    expect(source).toContain("], '01-do s_test1/1 target', { ambiguousNth: cursor1, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, { drift: run.drift, resolved: { into: pass1.entries, key: 'target', check: pass1.check } });");
    expect(source).toContain('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    expect(source).not.toContain('.nth(cursor1)');
    // the progress guard's evidence: what each target resolved to, as replay's
    // sink, checked before the target is acted on
    expect(source).toContain("return { status: 'ran' as const };");
    expect(source).not.toContain('guardHit1');
    // the cap, the scope and the shrink window are the policy's inputs — the
    // window is the shared module's own constant, embedded, not restated here
    expect(source).toContain("max: 7, scope: 'drain', shrinkWaitMs: LOOP_SHRINK_WAIT_MS");
    expect(source).toContain('const LOOP_SHRINK_WAIT_MS = 1_000;');
    expect(source.split('LOOP_SHRINK_WAIT_MS = ').length).toBe(2);
    // and a loop that did not finish its work throws rather than returning green
    expect(source).toContain('if (!loop1.ok) throw new Error(');
    expect(source).toContain('the recorded work is not finished');
    expect(syntaxErrors(source)).toEqual([]);
  });

  /**
   * The sink is the progress guard's only evidence, so what it SIGNS has to
   * distinguish one pass from the next exactly as replay's does: the element
   * the target resolved to, plus the index the policy narrowed to when — and
   * only when — the candidate really matched several.
   */
  it('signs the loop body sink with what the target resolved to, index included only when it narrowed', async () => {
    const body: SkillStep[] = [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Remove' }] } }];
    const loop: SkillStep = { tool: 'loop', args: {}, locators: {}, body, while: [{ kind: 'role', role: 'button', name: 'Remove' }], max: 7 };
    const { pick } = runnableHelpers(emit(specOf([loop])));
    // a unique candidate signs the same thing on every pass, whatever the cursor
    const unique: string[] = [];
    for (const cursor of [0, 1, 2]) {
      await pick(pageStub(), [obs({ locator: fakeLocator({ counts: [1] }, 'row'), index: 0 })], 'w', { ambiguousNth: cursor, waitMs: 0 }, {
        resolved: { into: unique, key: 'target' },
      });
    }
    expect(unique).toEqual(['target=row', 'target=row', 'target=row']);
    // an ambiguous one is narrowed to the cursor, and the sink says so
    const narrowed: string[] = [];
    await pick(pageStub(), [obs({ locator: fakeLocator({ counts: [3] }, 'rows'), index: 0 })], 'w', { ambiguousNth: 2, waitMs: 0 }, {
      resolved: { into: narrowed, key: 'target' },
    });
    expect(narrowed).toEqual(['target=rows.nth(2)']);
  });
});

describe('flow-level wiring', () => {
  it('threads vars, step outputs and env secrets into the call site', () => {
    const step: SkillStep = { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'id', selector: '#i' }] } };
    const spec = specOf([step], {
      params: { v1: '{{name}}', v2: '{{02-b.title}}', v3: 'literal-{{name}}', v4: '{{env:BENCH_PASSWORD}}' },
      segments: [
        segment([step], {
          params: {
            v1: { example: 'a', usedIn: [1] },
            v2: { example: 'b', usedIn: [1] },
            v3: { example: 'c', usedIn: [1] },
            v4: { example: 'd', usedIn: [1] },
          },
        }),
      ],
    });
    const source = emit(spec);
    expect(source).toContain("v1: vars.name");
    // v2 is bound to another step's output AND used by a recorded step, so the
    // call site takes it through `need` rather than defaulting it to ''.
    expect(source).toContain("v2: need(outputs, '02-b.title', '01-do')");
    expect(source).toContain('v3: `literal-${vars.name}`');
    expect(source).toContain("v4: process.env.BENCH_PASSWORD ?? ''");
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('publishes the end-url outputs a later step refers to (the grafana failure)', () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#save' }] } };
    const producer: SpecStep = { id: '02-create', instruction: 'create it', params: { v1: 'x' }, outputs: [], segments: [segment([step])] };
    const consumer: SpecStep = {
      id: '03-add',
      instruction: 'add to it',
      params: { v1: 'http://app.test/d/{{02-create.url.p1}}/notes' },
      outputs: [],
      segments: [segment([step])],
    };
    const out = emit({ version: 1, name: 'demo', origin: 'http://app.test', startUrl: 'http://app.test/', vars: [], steps: [producer, consumer] });
    // the producing step's body publishes it; the consuming call site reads it
    expect(out).toContain("outputs['02-create.url.p1'] = (await urlPartWhen(page, 'p1')) ?? '';");
    expect(out).toContain("v1: `http://app.test/d/${need(outputs, '02-create.url.p1', '03-add')}/notes`");
    // and only what something reads: an output nobody consumes is noise
    expect(out).not.toContain("outputs['03-add.url");
    expect(out).not.toContain("outputs['02-create.url']");
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('publishes the whole end url too when that is what a later step names', () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#save' }] } };
    const producer: SpecStep = { id: '02-create', instruction: 'create it', params: {}, outputs: [], segments: [segment([step])] };
    const consumer: SpecStep = { id: '03-add', instruction: 'add', params: { v1: '{{02-create.url}}' }, outputs: [], segments: [segment([step])] };
    const out = emit({ version: 1, name: 'demo', origin: 'http://app.test', startUrl: 'http://app.test/', vars: [], steps: [producer, consumer] });
    expect(out).toContain("outputs['02-create.url'] = page.url();");
    expect(out).toContain("v1: need(outputs, '02-create.url', '03-add')");
  });

  /**
   * G03. A read that matched nothing is left empty on purpose — that is honest
   * for an OBSERVATION and fatal for an ARGUMENT. Replay already draws the
   * line at consumption (server.ts:1009-1024 + ignorableRefs): a reference
   * bound into a slot the pinned procedure USES blocks the zero-model replay,
   * one bound into a slot nothing reads does not. The artifact drew no line at
   * all: `outputs[ref] ?? ''` turned a missed read into a blank that a
   * record-scoped locator matches EVERY record with.
   */
  describe('a bound reference a used slot needs is not allowed to arrive blank', () => {
    const fill: SkillStep = { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'id', selector: '#i' }] } };
    const spec = (usedIn: number[]) =>
      specOf([fill], {
        params: { v1: '{{02-b.title}}' },
        segments: [segment([fill], { params: { v1: { example: 'a', usedIn, known: true } } })],
      });

    it('takes a used slot through need(), naming the ref and the consuming step', () => {
      const source = emit(spec([1]));
      expect(source).toContain("v1: need(outputs, '02-b.title', '01-do')");
      expect(source).toContain('function need(outputs: Outputs, ref: string, by: string): string {');
      expect(syntaxErrors(source)).toEqual([]);
    });

    it('leaves an unused slot exactly as it was, and carries no helper for it', () => {
      const source = emit(spec([]));
      expect(source).toContain("v1: outputs['02-b.title'] ?? ''");
      expect(source).not.toContain('need(outputs, ');
      // The helper is emitted only where something calls it, like every other.
      expect(source).not.toContain('function need(');
    });

    /**
     * A slot no recorded step types or locates by can still be the one that
     * names the record — `ignorableRefs` reads requireText for exactly that,
     * and so must this.
     */
    it('checks a slot that only a requireText marker names', () => {
      const source = emit(
        specOf([fill], {
          params: { v1: '{{02-b.title}}' },
          segments: [
            segment([fill], {
              params: { v1: { example: 'a', usedIn: [], known: true } },
              preconditions: { urlPattern: 'http://app.test/items', requireText: ['Order {{v1}}'] },
            }),
          ],
        }),
      );
      expect(source).toContain("v1: need(outputs, '02-b.title', '01-do')");
    });

    it('never checks a var or an env secret: neither is a value this run produces', () => {
      const source = emit(
        specOf([fill], {
          params: { v1: '{{name}}', v2: '{{env:BENCH_PASSWORD}}' },
          segments: [segment([fill], { params: { v1: { example: 'a', usedIn: [1] }, v2: { example: 'b', usedIn: [1] } } })],
        }),
      );
      expect(source).toContain('v1: vars.name');
      expect(source).toContain("v2: process.env.BENCH_PASSWORD ?? ''");
      expect(source).not.toContain('need(outputs, ');
    });

    it('throws on a missing or empty value and passes a real one through', () => {
      const { need } = runnableHelpers(emit(spec([1])));
      expect(() => need({}, 'a.b', '03-add')).toThrow(/a\.b/);
      expect(() => need({}, 'a.b', '03-add')).toThrow(/03-add/);
      // Published-but-empty is the defect's own shape: readOptional's value.
      expect(() => need({ 'a.b': '' }, 'a.b', '03-add')).toThrow(/a\.b/);
      expect(() => need({ 'a.b': '' }, 'a.b', '03-add')).toThrow(/published empty/);
      // It points at the line the producing read logged, and says the run so far stands.
      expect(() => need({}, 'a.b', '03-add')).toThrow(/sitelooper skip/);
      expect(() => need({}, 'a.b', '03-add')).toThrow(/nothing of 03-add has run/);
      expect(need({ 'a.b': 'X' }, 'a.b', '03-add')).toBe('X');
    });
  });

  it('inlines a recorded value with a warning when the flow binds no slot', () => {
    const step: SkillStep = { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'id', selector: '#i' }] } };
    const { source, warnings } = emitFlowFile(specOf([step], { params: {} }), { tier: 'plain' });
    expect(source).toContain("v1: 'Widget A' /* recorded value; no flow binding */");
    expect(warnings).toContain('01-do: slot v1 has no flow binding — the recorded value is inlined');
  });

  it('throws in the body of a step with no converged procedure', () => {
    const spec = specOf([], { segments: [], instruction: 'archive the ticket' });
    const source = emit(spec);
    expect(source).toContain('// TODO: no converged procedure for "archive the ticket"');
    expect(source).toContain("throw new Error('step 01-do has no converged procedure");
    expect(syntaxErrors(source)).toEqual([]);
  });
});

describe('emitSpecFile', () => {
  it('is a thin user-owned scaffold that imports the generated half', () => {
    const source = emitSpecFile(specOf([{ tool: 'back', args: {}, locators: {} }]));
    expect(source).toContain("import { createFlowRun, runFlow, steps, BUDGET_MS, RECORDED_USE } from './demo.flow';");
    // The recorded browser is applied in the user's file, where a device preset can replace it.
    expect(source).toContain('\ntest.use(RECORDED_USE);\n');
    expect(source).toContain("const outputs = await runFlow(page, { name: process.env['NAME'] ?? '' }, {");
    expect(source).toContain('sitelooper never rewrites it');
    expect(source).toContain("run.drift.join");
    expect(syntaxErrors(source, 'demo.spec.ts')).toEqual([]);
  });

  /**
   * One test runs the whole flow. fwod34 (odoo) needed ~63s to reach its
   * 06-open and the runner's 60s default cut a click's retry short of the
   * force tier replay reaches, so the flow file exports a budget from its
   * recorded step count and the scaffold applies it.
   */
  it('budgets the single test by the recorded step count, never the 60s default', () => {
    const one = specOf([{ tool: 'back', args: {}, locators: {} }]);
    expect(budgetMs(one)).toBe(120_000);
    expect(emitFlowFile(one, { tier: 'plain' }).source).toContain('export const BUDGET_MS = 120000;');
    expect(emitSpecFile(one)).toContain('test.setTimeout(BUDGET_MS);');
    const many = specOf(Array.from({ length: 9 }, () => ({ tool: 'back' as const, args: {}, locators: {} })));
    expect(budgetMs(many)).toBe(270_000);
    expect(emitFlowFile(many, { tier: 'plain' }).source).toContain('export const BUDGET_MS = 270000;');
  });
});

describe('the fwat2 store, every skill as a one-step flow', () => {
  const store = new SkillStore(FWAT2);
  const skills = store.all();

  it('has the store the rest of this suite compiles', () => {
    expect(skills.length).toBe(18);
  });

  for (const skill of skills) {
    it(`compiles ${skill.id} to a parsable spec`, () => {
      const flow: Flow = {
        name: `one-${skill.id}`,
        origin: skill.origin,
        startUrl: skill.origin + '/',
        vars: [],
        steps: [{ id: '01-do', instruction: skill.template, skill: skill.id, outputs: [], recorded: {} }],
        provenance: { session: 'test', created: new Date(0).toISOString() },
      };
      const { spec, warnings } = flowToSpec(flow, store);
      expect(spec.steps[0].segments.length).toBeGreaterThan(0);
      if (skill.status === 'demoted') expect(warnings.join(' ')).toContain('demoted');
      const { source } = emitFlowFile(spec, { tier: 'plain' });
      expect(syntaxErrors(source, `${skill.id}.flow.ts`)).toEqual([]);
      expect(flowConstant(source)).toEqual(JSON.parse(JSON.stringify(spec)));
      expect(syntaxErrors(emitSpecFile(spec), `${skill.id}.spec.ts`)).toEqual([]);
    });
  }

  it('follows a seq chain into every segment of the procedure', () => {
    const chained = skills.find((s: Skill) => s.seq)!;
    // Bound, as a recorded flow binds its pins: a param-less step compiles
    // whatever replay would select from the instruction (replayBinding), and
    // replay never selects a chain member past its head.
    const params = Object.fromEntries(Object.entries(chained.params).map(([k, p]) => [k, String(p.example ?? '')]));
    const flow: Flow = {
      name: 'chained',
      origin: chained.origin,
      startUrl: chained.origin + '/',
      vars: [],
      steps: [{ id: '01-open', instruction: chained.template, skill: chained.id, params, outputs: [], recorded: {} }],
      provenance: { session: 'test', created: new Date(0).toISOString() },
    };
    const { spec } = flowToSpec(flow, store);
    expect(spec.steps[0].segments.map((s) => s.id)).toEqual(
      skills.filter((s: Skill) => s.seq?.chain === chained.seq!.chain).sort((a, b) => a.seq!.index - b.seq!.index).map((s) => s.id),
    );
  });

  it('emits the real statements for the delete-and-archive skill', () => {
    const skill = store.get('s_f2ee63')!;
    const flow: Flow = {
      name: 'delete-both',
      origin: skill.origin,
      startUrl: skill.origin + '/project-manager',
      vars: ['runid'],
      steps: [{ id: '01-do', instruction: skill.template, skill: skill.id, params: { v1: '{{runid}}' }, outputs: [], recorded: {} }],
      provenance: { session: 'test', created: new Date(0).toISOString() },
    };
    const { source } = emitFlowFile(flowToSpec(flow, store).spec, { tier: 'plain' });
    // the identity-scoped primary, the run's own value handed to the shared
    // policy as the identity guard (not a `.filter({ hasText })` bolted onto
    // every fallback — that was the artifact's own dialect), and the dialog arming
    expect(source).toContain(
      `{ locator: page.locator('div.data-list-row', { hasText: \`\${p.v2}\` }), index: 0, structural: false, kind: 'scoped', carries: JSON.stringify({ kind: 'scoped', container: 'div.data-list-row', hasText: \`\${p.v2}\` }) },`,
    );
    expect(source).toContain('requireIdentity: identityValues({ v2: p.v2 }, [');
    // no static guard bolted onto a candidate in the STEP BODIES (the embedded
    // recipes.ts filters a page-scoped option list by the payload, which is the
    // daemon's own step and not a locator guard)
    expect(source.slice(source.indexOf('export const steps = {'))).not.toContain('.filter({ hasText');
    expect(source).toContain("page.once('dialog', (dialog) => dialog.accept());");
    expect(source).toContain("await urlEffect(page, 'http://localhost:5173/project-manager");
    expect(source).toContain("v1: vars.runid");
  });
});

describe('flowToSpec over a published flow', () => {
  it('reports every step of a flow whose skills are not in the store', () => {
    const flow = JSON.parse(fs.readFileSync(RDFLOW, 'utf8')) as Flow;
    const { spec, warnings } = flowToSpec(flow, new SkillStore(FWAT2));
    expect(spec.steps.map((s) => s.id)).toEqual(flow.steps.map((s) => s.id));
    expect(warnings.filter((w) => w.includes('no converged procedure')).length).toBe(flow.steps.length);
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    expect(syntaxErrors(source, 'rdflow.flow.ts')).toEqual([]);
    expect((source.match(/has no converged procedure/g) ?? []).length).toBeGreaterThanOrEqual(flow.steps.length);
  });
});

describe('compileFlow', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-spec-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('writes both files, then never rewrites the user-owned one', () => {
    const out = path.join(dir, 'out');
    const first = compileFlow(RDFLOW, { store: new SkillStore(FWAT2), outDir: out });
    expect(first.flowFile).toBe(path.join(out, 'rdflow.flow.ts'));
    expect(first.specFile).toBe(path.join(out, 'rdflow.spec.ts'));
    expect(first.compilable).toBe(false);

    fs.appendFileSync(first.specFile!, '\n// mine\n');
    const again = compileFlow(RDFLOW, { store: new SkillStore(FWAT2), outDir: out });
    expect(again.specFile).toBeNull();
    expect(fs.readFileSync(path.join(out, 'rdflow.spec.ts'), 'utf8')).toContain('// mine');
    // the generated half is regenerated every time
    expect(fs.readFileSync(again.flowFile!, 'utf8')).toContain('// @sitelooper-flow v1');

    const overwritten = compileFlow(RDFLOW, { store: new SkillStore(FWAT2), outDir: out, overwriteSpec: true });
    expect(overwritten.specFile).not.toBeNull();
    expect(fs.readFileSync(path.join(out, 'rdflow.spec.ts'), 'utf8')).not.toContain('// mine');
  });

  it('refuses a flow it cannot find', () => {
    expect(() => compileFlow('no-such-flow', { outDir: dir })).toThrow(/no flow named/);
  });
});

/**
 * A wait for the target to be GONE is satisfied by its absence. `pick` throws
 * on a chain nothing resolves, so the emitter asks `resolveTarget` — the same
 * shared policy, no wait (`waitMs: 0`), a miss is the recorded outcome — and
 * asserts the hidden/count-0 condition only of a target that is still there.
 * fwrd42's 06-report waits for a deleted part's text and used to fail the
 * compiled spec and the replay alike. (The `.or()` union this replaced was a
 * strict-mode violation waiting to happen.)
 */
describe('wait_for on an absent target', () => {
  const one = (step: SkillStep) => emit(specOf([step]));
  const gone: SkillStep = {
    tool: 'wait_for',
    args: { target: 'text=x', state: 'hidden' },
    locators: { target: [{ kind: 'text', text: '{{v4}}' }, { kind: 'css', selector: 'td.name' }] },
  };
  const resolution = (assertion: string) => [
    'const hit1 = await resolveTarget(page, [',
    `{ locator: page.getByText(\`\${p.v4}\`, { exact: true }), index: 0, structural: false, kind: 'text', carries: JSON.stringify({ kind: 'text', text: \`\${p.v4}\` }) },`,
    `{ locator: page.locator('td.name'), index: 1, structural: false, kind: 'css', carries: JSON.stringify({ kind: 'css', selector: 'td.name' }) },`,
    // allowMultiple: several still-visible matches have not met the absence,
    // and resolve so they can be waited on (replay's own policy for the step)
    "], '01-do s_test1/1 target', { allowMultiple: true, stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: 0 }, { drift: run.drift });",
    assertion,
  ];
  it('resolves once with no wait, and asserts hidden only if the target is still there', () => {
    const out = one(gone);
    expect(out).not.toContain('await pick(');
    // on the first match, as replay's waitFor dispatches it (`loc.first().waitFor`)
    expect(sequenceAt(out, resolution('if (hit1) await expect(hit1.locator.first()).toBeHidden();'))).toBeGreaterThan(-1);
    expect(out).not.toContain('.or(page');
    expect(syntaxErrors(out)).toEqual([]);
  });
  it('does the same for a count of zero', () => {
    const out = one({ ...gone, args: { target: 'text=x', state: 'count', count: 0 } });
    expect(out).not.toContain('await pick(');
    expect(sequenceAt(out, resolution('if (hit1) await expect(hit1.locator).toHaveCount(0);'))).toBeGreaterThan(-1);
  });
});

/**
 * The inlined helpers, cut out of an emitted file WHOLE and made callable:
 * everything between the DRIFT export and the steps object IS the helper
 * block, and running it is the only way to test what it DOES rather than what
 * it says. Whole, never one function alone — `pick`, `resolveTarget` and
 * `readOptional` are adapters over the shared `resolveCandidates` that sits in
 * the same block, and a helper cut out of it in isolation fails closed, which
 * reads as a pass (see PARITY_GAPS.md).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runnableHelpers(source: string, con: unknown = { warn: () => {} }): Record<string, any> {
  const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source);
  if (!block) throw new Error('helper block not found in the emitted source');
  const js = ts.transpileModule(block[1], {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const names = [...block[1].matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = new Function('DRIFT', 'console', `${js}\nreturn { ${names.join(', ')} };`) as (d: string[], c: unknown) => Record<string, any>;
  return build([], con);
}

/** A Page stub whose url() answers from a script, one call at a time. */
function urlPageStub(urls: string[]) {
  let i = 0;
  const waits: number[] = [];
  return {
    page: {
      url: () => urls[Math.min(i++, urls.length - 1)],
      waitForTimeout: async (ms: number) => {
        waits.push(ms);
      },
    },
    waits,
  };
}

describe('a derived value is read after the navigation lands', () => {
  const minting: SkillStep = {
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: [{ kind: 'id', selector: '#login' }] },
  };
  const source = emit(
    specOf([minting], { segments: [segment([minting], { derived: { d1: { step: 1, at: 'q.action', example: '123' } } })] }),
  );

  it('captures the url before the action and binds the part afterwards', () => {
    const lines = trimmedLines(source);
    // The capture is a lifecycle phase now: declared ahead of the step, then
    // assigned inside `prepare` — after the settle, so the url read is the one
    // the step actually starts from and not one a pending render is about to
    // change.
    const declared = lines.indexOf("let urlBefore1 = '';");
    // search from the step itself: `settle` is also called inside the inlined
    // urlPartsWhen helper, which is emitted above the steps object
    const settled = lines.indexOf('await settle(page);', declared);
    const before = lines.indexOf('urlBefore1 = page.url();');
    const acted = lines.indexOf('await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    const bound = lines.findIndex((l) => l.startsWith("bindPart(p, 'd1', await urlPartWhen(page, 'q.action', urlBefore1));"));
    expect(declared).toBeGreaterThan(-1);
    expect(declared).toBeLessThan(settled);
    expect(settled).toBeLessThan(before);
    expect(before).toBeLessThan(acted);
    expect(acted).toBeLessThan(bound);
    // and the binding is in `bind`, which the lifecycle runs before `verify`
    expect(lines.lastIndexOf('bind: async () => {')).toBeLessThan(bound);
    expect(lines.lastIndexOf('verify: async () => {')).toBeGreaterThan(bound);
    // the recorded example survives as the comment it always was
    expect(lines[bound]).toContain('// recorded example: 123');
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('inlines urlPartWhen and the shared urlPart it depends on, and only when a step mints', () => {
    expect(source).toContain("async function urlPartWhen(page: Page, label: string, urlBefore = ''): Promise<string | undefined> {");
    expect(source).toContain("async function urlPartsWhen(page: Page, labels: string[], urlBefore = ''): Promise<(string | undefined)[]> {");
    // the parts are read by the shared module's urlPart (the daemon's own
    // labelling), embedded once and ahead of the adapter that calls it
    // (undefined where the url lacks the part: bindPart then leaves the slot unset, as replay does)
    expect(source).toContain('const read = (url: string) => labels.map((label) => urlPart(url, label));');
    expect(source).toContain('function urlPart(url: string, label: string): string | undefined {');
    expect(source.split('// Shared execution source: url.ts.').length).toBe(2);
    expect(source.indexOf('// Shared execution source: url.ts.')).toBeLessThan(source.indexOf('async function urlPartsWhen('));
    // NEW CONTRACT: PICK_WAIT_MS/PICK_POLL_MS are gone. The url wait polls on
    // the SHARED poll interval (RESOLVE_POLL_MS, from the embedded resolve.ts),
    // so there is one clock in the artifact rather than two that can drift apart.
    expect(source).toContain('const RESOLVE_POLL_MS = 100;');
    expect(source).not.toContain('const PICK_WAIT_MS');
    expect(source).not.toContain('PICK_POLL_MS');
    expect(source).toContain('for (let waited = 0; waited < URL_WAIT_MS; waited += RESOLVE_POLL_MS) {');
    expect(source).toContain('await page.waitForTimeout(RESOLVE_POLL_MS);');
    // and the module it comes from is embedded exactly once
    expect(source.split('// Shared execution source: resolve.ts.').length).toBe(2);
    const plain = emit(specOf([minting]));
    expect(plain).not.toContain('urlPartWhen');
    // (url.ts itself is still carried — the shared gates every step runs
    // import it — but nothing reads a part off it here)
    expect(plain).not.toContain('urlPart(page');
    expect(plain).not.toContain('urlPart(urlBefore');
  });

  it('reads the part straight off the url after a goto, which awaits its own navigation', () => {
    const step: SkillStep = { tool: 'goto', args: { url: 'http://app.test/x' }, locators: {} };
    const out = emit(specOf([step], { segments: [segment([step], { derived: { d1: { step: 1, at: 'p1', example: 'x' } } })] }));
    // a part the url does not carry binds as '' (the daemon's urlPart says undefined)
    expect(out).toContain("bindPart(p, 'd1', urlPart(page.url(), 'p1'));");
    // No wait-for-the-url-to-change helper is emitted OR inlined at all: a goto
    // has already awaited its navigation, so the part is there to be read.
    // (`urlBefore1` itself still exists — the lifecycle uses it to decide
    // whether to settle again after the action — but nothing derived reads it.)
    expect(out).not.toContain('urlPartWhen');
  });

  it('waits for the url to change before it believes a part (the odoo failure)', async () => {
    const { urlPartWhen } = runnableHelpers(source);
    // the click has fired but the SPA has not routed yet: two reads of the old
    // url, then the one the step navigated to
    const before = 'http://app.test/web';
    const { page, waits } = urlPageStub([before, before, 'http://app.test/web#action=123&cids=1']);
    expect(await urlPartWhen(page, 'q.action', before)).toBe('123');
    expect(waits).toEqual([100, 100]);
  });

  it('falls back to whatever is there at the deadline rather than hanging', async () => {
    const { urlPartWhen } = runnableHelpers(source);
    const before = 'http://app.test/web#action=7';
    const { page, waits } = urlPageStub([before]);
    expect(await urlPartWhen(page, 'q.action', before)).toBe('7');
    // replay's own allowance for a url: settleDom (2s) and then expectedUrl's
    // own 3s resolve window, not pick's 3s
    expect(waits.length).toBe(5000 / 100);
  });

  it('binds every part of a step in ONE wait, so none is read off a half-built url', async () => {
    const two = specOf([minting], {
      segments: [
        segment([minting], {
          derived: { d1: { step: 1, at: 'q.action', example: '123' }, d2: { step: 1, at: 'q.cids', example: '1' } },
        }),
      ],
    });
    const out = emit(two);
    expect(out).toContain("const bound1 = await urlPartsWhen(page, ['q.action', 'q.cids'], urlBefore1);");
    expect(out).toContain("bindPart(p, 'd1', bound1[0]); // recorded example: 123");
    expect(out).toContain("bindPart(p, 'd2', bound1[1]); // recorded example: 1");
    expect(syntaxErrors(out)).toEqual([]);

    const { urlPartsWhen } = runnableHelpers(out);
    // odoo's shape: cids lands first and action arrives a beat later. Bound
    // one at a time, action would have been read as '' off the middle url.
    const before = 'http://app.test/web';
    const { page, waits } = urlPageStub([before, 'http://app.test/web#cids=1', 'http://app.test/web#action=123&cids=1']);
    expect(await urlPartsWhen(page, ['q.action', 'q.cids'], before)).toEqual(['123', '1']);
    expect(waits).toEqual([100, 100]);
  });

  it('waits the window replay effectively allows a url, not the shorter one pick uses', () => {
    expect(source).toContain('const URL_WAIT_MS = 5000;');
  });

  it('publishes the minted id when nothing else reads the settled url', () => {
    const mints: SkillStep = { ...minting, mints: { at: 'p2' } };
    const out = emit(specOf([mints]));
    // Still read through urlPartWhen off the url the step started from, but
    // published only when this step CHANGED it: an id that was already in the
    // url is not evidence that this step created a record.
    expect(
      sequenceAt(out, [
        "// This step creates a record; expose this run's identifier for teardown.",
        "const minted1 = changedCreation(urlPart(urlBefore1, 'p2'), await urlPartWhen(page, 'p2', urlBefore1));",
        'if (minted1) {',
        "outputs['01-do.minted'] = minted1;",
        'if (!run.created.includes(minted1)) run.created.push(minted1);',
      ]),
    ).toBeGreaterThan(-1);
  });
});

describe('the diagnostics a cloud run has to read the failure from', () => {
  const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#a' }, { kind: 'css', selector: '.b' }] } };

  it('says where the step was and where the browser was when no locator resolved', () => {
    const out = emit(specOf([step]));
    expect(out).toContain('resolved at ${where} (page is at ${page.url()}): ');
  });

  it('logs a skipped opener click, so a bench log shows the click that never happened', () => {
    const opener: SkillStep = { ...step, expect: { addedContains: ['- dialog "Save dashboard"'] } };
    expect(emit(specOf([opener]))).toContain(
      "console.log('[sitelooper skip] 01-do s_test1/1: recorded popup already showing — click skipped');",
    );
  });
});

describe('a click that opens a popup is a toggle', () => {
  const opener: SkillStep = {
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: [{ kind: 'role', role: 'button', name: 'Edit the task' }] },
    expect: { addedContains: ['- dialog "Edit the task"', '- button "Save"'] },
  };
  const source = emit(specOf([opener]));

  it('guards the click with the recorded opener effect', () => {
    expect(source).toContain('// This click OPENS a popup, which makes it a toggle: replay skips it when the');
    expect(source).toContain('(already in effect)');
    // The same question replay asks (`presentOnPage(page, openerLines(...))`),
    // in the same snapshot dialect — whole lines, so it is as strict as
    // replay's own line-exact lineShows: a `button "6"` never matches a button
    // called "17.6". Only the popup line guards: the `button "Save"` the same
    // click recorded is not what a second click would toggle away (it may be
    // on the page for another reason entirely), so it must not decide the skip.
    expect(source).toContain("if (await presentOnPage(page, liveLines(['- dialog \"Edit the task\"'], p))) {");
    expect(source).not.toContain("liveLines(['- dialog \"Edit the task\"', '- button \"Save\"']");
    expect(source).not.toContain('isVisible()');
    expect(source).toContain('} else {');
    // the action itself moved inside the else branch, indented with it
    expect(source).toContain('        } else {\n          obs1 = beginAction(page, { deadlineMs: ACTION_DEADLINE_MS, navigating: true });\n          await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    // the guard reads the page through the shared capture, embedded once
    expect(source).toContain('async function presentOnPage(page: Page, lines: string[]');
    expect(source).toContain('function liveLines(');
    expect(syntaxErrors(source)).toEqual([]);
  });

  /**
   * Replay resolves the target FIRST (a miss is a stop, or the navigation
   * fallback) and asks "already in effect?" of a resolved control. The
   * artifact used to wrap the pick in the guard too, so a click whose popup
   * lines were showing was skipped — and reported green — when its target no
   * longer resolved at all, where the daemon stops. Same order on both sides.
   */
  it('resolves the target ahead of the guard, and wraps only the click', () => {
    const many: SkillStep = {
      ...opener,
      locators: {
        target: [
          { kind: 'role', role: 'button', name: 'Edit the task' },
          { kind: 'id', selector: '#edit' },
        ],
      },
    };
    const lines = emit(specOf([many])).split('\n');
    const guard = lines.findIndex((l) => l.trim().startsWith('if (await presentOnPage('));
    const picked = lines.findIndex((l) => l.includes('= await pick(page, ['));
    const clicked = lines.findIndex((l) => l.trim() === 'await click(hit1.locator, { obs: obs1 }).catch(actionFailed);');
    expect(guard).toBeGreaterThan(-1);
    expect(picked).toBeGreaterThan(-1);
    expect(picked).toBeLessThan(guard);
    expect(clicked).toBeGreaterThan(guard);
  });

  /**
   * `click` only, as replay's openerLines has it (gap 17 closed on replay's
   * side): a toggle is a single click's shape, and a dblclick that opens a
   * row's editor is not undone by another dblclick.
   */
  it('leaves a dblclick alone, as replay does', () => {
    const dbl: SkillStep = { ...opener, tool: 'dblclick' };
    const out = emit(specOf([dbl]));
    expect(out).toContain('await click(hit1.locator, { dbl: true, obs: obs1 }).catch(actionFailed);');
    expect(out).not.toContain('already in effect');
    expect(out).not.toContain('} else {');
  });

  it('leaves a click with no popup effect alone', () => {
    const plain: SkillStep = { ...opener, expect: { addedContains: ['- text: Saved', '- button "Save"'] } };
    const out = emit(specOf([plain]));
    expect(out).not.toContain('already in effect');
    expect(out).not.toContain('} else {');
  });

  it("ignores a popup line only this run's own value produced", () => {
    const parameterised: SkillStep = { ...opener, expect: { addedContains: ['- dialog "{{v1}}"'] } };
    expect(emit(specOf([parameterised]))).not.toContain('already in effect');
  });
});

type Attempt = { kind: 'click' | 'dblclick' | 'scroll' | 'evaluate'; force?: boolean };

/** A Locator stub for the inlined `click`, recording every tier it tried. */
function clickLocator(fail: (a: Attempt) => string | null) {
  const log: Attempt[] = [];
  const run = async (a: Attempt) => {
    log.push(a);
    const message = fail(a);
    if (message) throw new Error(message);
  };
  const loc = {
    click: (o: { force?: boolean } = {}) => run({ kind: 'click', force: o.force }),
    dblclick: (o: { force?: boolean } = {}) => run({ kind: 'dblclick', force: o.force }),
    scrollIntoViewIfNeeded: () => run({ kind: 'scroll' }),
    evaluate: () => run({ kind: 'evaluate' }),
    elementHandle: async () => null,
    isDisabled: async () => false,
  };
  return { loc, log };
}

describe('a click that an overlay intercepts', () => {
  const step: SkillStep = {
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: [{ kind: 'testid', attr: 'data-testid', value: 'toggle-viz-picker' }] },
  };
  const source = emit(specOf([step]));
  const clickHelper = () => runnableHelpers(source).click as (loc: unknown, opts?: { dbl?: boolean }) => Promise<void>;

  it('embeds the shared browser implementation from its maintained source', () => {
    const shared = fs.readFileSync(new URL('../src/execution/browser.ts', import.meta.url), 'utf8')
      .replace(/^import type .*;\r?\n/gm, '')
      .replace(/^export /gm, '')
      .replace(/\r\n/g, '\n')
      .trim();
    expect(source).toContain(shared);
    expect(source).toContain('await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });');
  });

  it('inlines the click helper only when a step clicks', () => {
    expect(source).toContain('async function click(loc: Locator, opts: { dbl?: boolean; obs?: ActionObservation | null } = {}): Promise<void> {');
    expect(source).toContain('const CLICK_TIER_MS = 5000;');
    const filled: SkillStep = { tool: 'fill', args: { target: '@e1', value: 'x' }, locators: { target: [{ kind: 'id', selector: '#i' }] } };
    expect(emit(specOf([filled]))).not.toContain('async function click');
  });

  it('delegates the fill adapter to the shared recipe ladder, whose native half is reactSafeFill', () => {
    // The odoo sp4od failure: `locator.fill` fires only `input`, so a form
    // that commits on `change` never sees the value and the recorded effect
    // ("20% £ 36.00") never appears. The daemon has always executed a
    // recorded `fill` through reactSafeFill; the artifact now calls the SAME
    // ladder the daemon's `case 'fill'` calls (fillWithRecipe, embedded from
    // src/execution/recipes.ts), whose native half is that reactSafeFill.
    const filled: SkillStep = { tool: 'fill', args: { target: '@e1', value: '3' }, locators: { target: [{ kind: 'id', selector: '#qty' }] } };
    const out = emit(specOf([filled]));
    expect(out).toContain("await fill(hit1.locator, '3').catch(actionFailed);");
    expect(out).toContain('async function fill(loc: Locator, value: string): Promise<void> {');
    expect(out).toContain('const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);');
    // recognition first, as the daemon's case 'fill': no visibility wait ahead of the ladder
    const fillBody = out.split('async function fill(loc: Locator, value: string): Promise<void> {')[1].split('\n}\n')[0];
    expect(fillBody).not.toContain('waitFor(');
    expect(fillBody).not.toContain('scrollIntoViewIfNeeded');
    expect(out).not.toContain('FILL_WAIT_MS');
    expect(out).toContain('await reactSafeFill(target, value);');
    // The shared implementation still delivers both events to controlled inputs.
    expect(out).toContain("const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;");
    expect(out).toContain("input.dispatchEvent(new Event('input', { bubbles: true }));");
    expect(out).toContain("input.dispatchEvent(new Event('change', { bubbles: true }));");
    // and the same fallback for a widget with no native value setter
    expect(out).toContain('    await locator.fill(value);');
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('drives fill, type and select through the shared recipe ladders over an embedded snapshot, as tools.ts does', () => {
    // The grafana `03-add s_e4d3e5/6` failure: the fill target was monaco's
    // input textarea, the native setter wrote into a box the editor never
    // reads, the step reported success and the saved panel kept grafana's
    // default markdown. The daemon never had this bug, because `case 'fill'`
    // asks the component recipe FIRST. The artifact used to carry its own
    // transcription of that ladder (`editorSetValue`, a hardcoded family table,
    // two `waitForTimeout`s) on `fill` only; it now embeds the daemon's runner
    // and calls the same three ladders, over a snapshot of what the store
    // would have chosen at compile time.
    const filled: SkillStep = { tool: 'fill', args: { target: '@e1', value: 'Notes' }, locators: { target: [{ kind: 'id', selector: '#ed' }] } };
    const out = emit(specOf([filled]));
    // the runner is embedded once, with its sibling ahead of it
    expect(out.split('// Shared execution source: recipes.ts.').length).toBe(2);
    expect(out.indexOf('// Shared execution source: browser.ts.')).toBeLessThan(out.indexOf('// Shared execution source: recipes.ts.'));
    // the snapshot is a JSON literal of the seed procedures (a storeless spec), typed by the embedded module
    const seeds = snapshotRecipes(seedRecipes()).recipes;
    expect(out).toContain(`const RECIPES: RecipeSnapshot = ${JSON.stringify(seeds)};`);
    expect(out).toContain('const recipeBook = snapshotBook(RECIPES);');
    expect(out.indexOf('// Shared execution source: recipes.ts.')).toBeLessThan(out.indexOf('const RECIPES: RecipeSnapshot ='));
    expect(out.indexOf('const recipeBook = snapshotBook(RECIPES);')).toBeLessThan(out.indexOf('async function fill('));
    // the family table and the step lists travel INSIDE the module, not restated by the emitter
    expect(out).toContain("{ id: 'monaco', root: '.monaco-editor', verifyRead: '.view-lines' },");
    expect(out.split("root: '.monaco-editor'").length).toBe(2);
    expect(out).not.toContain('const EDITORS');
    expect(out).not.toContain('editorSetValue(');
    expect(out).not.toContain('EDITOR_SETTLE_MS');
    expect(out).not.toContain('FILL_FOCUS_MS');
    // no timed sleep anywhere in the helper block: the recipe's `settle` is settleDom
    const helpers = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(out)![1];
    expect(helpers).not.toContain('waitForTimeout(EDITOR');
    expect(helpers.split('async function fill(')[1]).not.toContain('waitForTimeout');
    // verified-or-nothing, in the daemon's words, logged where the daemon returns it as its tool result
    expect(out).toContain('  if (attempt) logRecipe(attempt);');
    expect(out).toContain('  console.log(`[sitelooper recipe] ${describeRecipeAttempt(attempt)}`);');
    // the snapshot embedded in the flow IR is the one the artifact carries
    const learned = { id: 'r_learn1', family: 'monaco' as const, intent: 'set-value' as const, steps: [{ action: 'click' as const }, { action: 'insertText' as const, text: '{{value}}' }, { action: 'settle' as const, ms: 300 }], verifyRead: '.view-lines' };
    const withStore = emit(specOf([filled], {}, { recipes: { version: 1, recipes: [learned] } }));
    expect(withStore).toContain(`const RECIPES: RecipeSnapshot = ${JSON.stringify({ version: 1, recipes: [learned] })};`);
    expect(withStore).not.toContain(JSON.stringify(seeds));
    expect(flowConstant(withStore)).toEqual(JSON.parse(JSON.stringify(specOf([filled], {}, { recipes: { version: 1, recipes: [learned] } }))));
    expect(syntaxErrors(out)).toEqual([]);
    expect(syntaxErrors(withStore)).toEqual([]);
    // type and select climb their own ladders through the same book
    const typed: SkillStep = { tool: 'type', args: { target: '@e1', text: 'abc' }, locators: { target: [{ kind: 'id', selector: '#ed' }] } };
    const typedOut = emit(specOf([typed]));
    expect(typedOut).toContain("await type(hit1.locator, 'abc').catch(actionFailed);");
    expect(typedOut).toContain('async function type(loc: Locator, text: string, opts: { delay?: number } = {}): Promise<void> {');
    expect(typedOut).toContain('const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });');
    // tools.ts's own defaults, not Playwright's: 10s timeout, 20ms per key
    expect(typedOut).toContain('const TYPE_TIMEOUT_MS = 10000;');
    expect(typedOut).toContain('const TYPE_DELAY_MS = 20;');
    expect(typedOut).not.toContain('async function fill(');
    expect(typedOut).toContain('const recipeBook = snapshotBook(RECIPES);');
    expect(syntaxErrors(typedOut)).toEqual([]);
    // a flow that never fills, types or selects carries none of it — no ladder, no snapshot, no runner
    const clicked: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#go' }] } };
    const clickedOut = emit(specOf([clicked]));
    expect(clickedOut).not.toContain('async function fill');
    expect(clickedOut).not.toContain('async function type(');
    expect(clickedOut).not.toContain('async function select');
    expect(clickedOut).not.toContain('const RECIPES');
    expect(clickedOut).not.toContain('// Shared execution source: recipes.ts.');
  });

  it('delegates select to the shared recipe ladder, whose native half is reactSafeSelect with the recorded fallback', () => {
    // fwat3 03-add: the app keyed the option by a per-record id, so a spec
    // that selected by the RECORDED value could only ever miss. The daemon
    // tries the visible label first and keeps the recorded value as the last
    // resort (`optionValue`); the artifact calls the same ladder (selectWithRecipe),
    // whose native half is that reactSafeSelect — and whose recipe half is the
    // aria-combobox procedure the artifact never had.
    const selected: SkillStep = {
      tool: 'select',
      args: { target: '@e1', option: 'Client One', optionValue: '17' },
      locators: { target: [{ kind: 'id', selector: '#client' }] },
    };
    const out = emit(specOf([selected]));
    expect(out).toContain("await select(hit1.locator, 'Client One', '17').catch(actionFailed);");
    expect(out).toContain('async function select(loc: Locator, label: string, fallbackValue?: string): Promise<void> {');
    expect(out).toContain('const { attempt } = await selectWithRecipe(loc.page(), loc, label, recipeBook, fallbackValue);');
    // the same order as daemon/inputs.ts: look first, then the label wait, then value/index
    expect(out).toContain("if (opts.some((o) => o.label.trim() === v)) return 'label';");
    expect(out).toContain("if (opts.some((o) => o.value === v)) return 'value';");
    expect(out).toContain("if (f && opts.some((o) => o.value === f)) return 'fallback';");
    expect(out).toContain('return { attempt: null, selected: await reactSafeSelect(target, label, fallbackValue) };');
    // the select-option seed travels in the snapshot
    expect(out).toContain('"family":"aria-combobox","intent":"select-option"');
    expect(syntaxErrors(out)).toEqual([]);
    // no recorded fallback value, no third argument
    const bare: SkillStep = { tool: 'select', args: { target: '@e1', option: 'Client One' }, locators: { target: [{ kind: 'id', selector: '#client' }] } };
    expect(emit(specOf([bare]))).toContain("await select(hit1.locator, 'Client One').catch(actionFailed);");
    // a flow that never selects carries none of it
    const clicked: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#go' }] } };
    expect(emit(specOf([clicked]))).not.toContain('async function select');
  });

  it('delegates hover to shared syntheticHover', () => {
    // A listbox that opens on `mouseenter` never sees Playwright's own hover
    // when the pointer was already inside the element: the daemon dispatches
    // the events at the element too, and so does the spec.
    const hovered: SkillStep = { tool: 'hover', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#menu' }] } };
    const out = emit(specOf([hovered]));
    expect(out).toContain('await hover(hit1.locator);');
    expect(out).toContain('async function hover(loc: Locator): Promise<void> {');
    expect(out).toContain('await syntheticHover(loc);');
    expect(out).toContain("    for (const type of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) {");
    // mouseenter is the one that does not bubble
    expect(out).toContain("      el.dispatchEvent(new MouseEvent(type, { bubbles: type !== 'mouseenter' }));");
    expect(syntaxErrors(out)).toEqual([]);
    // a flow that never hovers carries none of it
    const clicked: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#go' }] } };
    expect(emit(specOf([clicked]))).not.toContain('async function hover');
  });

  it('passes the standalone click budget to the shared implementation', () => {
    expect(source).toContain('const CLICK_TIER_MS = 5000;');
    expect(source).toContain('await robustClick(loc, { timeout: CLICK_TIER_MS, dbl: opts.dbl, obs: opts.obs ?? undefined });');
  });

  it('takes tier 1 when a normal click lands', async () => {
    const { loc, log } = clickLocator(() => null);
    await clickHelper()(loc);
    expect(log).toEqual([{ kind: 'click', force: undefined }]);
  });

  it('forces past an overlay that intercepts pointer events (the grafana failure)', async () => {
    const { loc, log } = clickLocator((a) =>
      a.kind === 'click' && !a.force ? '<svg> from <div data-overlay-container> intercepts pointer events' : null,
    );
    await clickHelper()(loc);
    expect(log.map((a) => a.kind)).toEqual(['click', 'scroll', 'click']);
    expect(log[2]).toEqual({ kind: 'click', force: true });
  });

  it('dispatches a synthetic event when even a forced click cannot land', async () => {
    const { loc, log } = clickLocator((a) => (a.kind === 'evaluate' ? null : 'element is not visible'));
    await clickHelper()(loc);
    expect(log.map((a) => a.kind)).toEqual(['click', 'scroll', 'click', 'evaluate']);
  });

  it('reports missing attachment when every tier and the bounded re-render window lose', async () => {
    const { loc } = clickLocator(() => 'waiting for element to be visible, enabled and stable');
    // Exercise the embedded implementation with a short window; the adapter's
    // production budget is verified separately above.
    await expect(runnableHelpers(source).robustClick(loc, { timeout: 5 })).rejects.toThrow('target was never attached');
  });

  it('does not dispatch again when a forced click may already have taken effect', async () => {
    const { loc, log } = clickLocator((a) => {
      if (a.kind !== 'click') return null;
      return a.force ? 'Execution context was destroyed' : 'element is not visible';
    });
    await expect(clickHelper()(loc)).rejects.toThrow('outcome UNKNOWN');
    expect(log.map((a) => a.kind)).toEqual(['click', 'scroll', 'click']);
  });

  it('rethrows a strict-mode violation at once: no tier can fix two matches', async () => {
    const { loc, log } = clickLocator(() => 'strict mode violation: locator resolved to 3 elements');
    await expect(clickHelper()(loc)).rejects.toThrow('strict mode violation');
    expect(log.map((a) => a.kind)).toEqual(['click']);
  });

  it('doubles the click through the same tiers', async () => {
    const { loc, log } = clickLocator(() => null);
    await clickHelper()(loc, { dbl: true });
    expect(log).toEqual([{ kind: 'dblclick', force: undefined }]);
  });

  it('dispatches a right or modifier click plainly, as replay does', () => {
    const loc = { target: [{ kind: 'id' as const, selector: '#r' }] };
    const right = emit(specOf([{ tool: 'right_click', args: { target: '@e1' }, locators: loc }]));
    expect(right).toContain("await hit1.locator.click({ button: 'right' }).catch(actionFailed);");
    expect(right).not.toContain('async function click');
    const mod = emit(specOf([{ tool: 'modifier_click', args: { target: '@e1', modifiers: ['Shift'] }, locators: loc }]));
    expect(mod).toContain("await hit1.locator.click({ modifiers: ['Shift'] }).catch(actionFailed);");
  });
});

/**
 * A read is an OBSERVATION: replay skips one it cannot resolve and carries on
 * (runOneStep's isRead branch), because a value that could not be re-captured
 * says nothing about whether the procedure ran. The emitted spec has to make
 * the same distinction, or a grafana panel the verifier goes on to confirm
 * fails the whole flow.
 */
describe('a read never fails the flow', () => {
  const multi: SkillStep = {
    tool: 'read',
    args: { target: '@e1', what: 'text' },
    locators: { target: [{ kind: 'text', text: 'Notes for run sp3gra' }, { kind: 'css', selector: '.panel-content' }] },
    label: 'panel_content',
  };
  const source = emit(specOf([multi]));

  it('routes a multi-candidate read through readOptional, not a bare pick', () => {
    expect(source).toContain("outputs['01-do.panel_content'] = await readOptional(page, [");
    expect(source).toContain(
      "], '01-do s_test1/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift });",
    );
    // the resolution is INSIDE the helper, so nothing at the call site can throw
    expect(source).not.toContain('= await pick(page, [');
    expect(source).toContain('async function readOptional(');
    expect(source).toContain('async function resolveTarget(');
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('routes a single-candidate read the same way, so it cannot throw either', () => {
    const out = emit(
      specOf([{ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'id', selector: '#total' }] }, label: 'total' }]),
    );
    expect(
      sequenceAt(out, [
        "outputs['01-do.total'] = await readOptional(page, [",
        `{ locator: page.locator('#total'), index: 0, structural: false, kind: 'id', carries: JSON.stringify({ kind: 'id', selector: '#total' }) },`,
        "], '01-do s_test1/1 target', { stayOnOrigin: originOf(page.url()) ?? undefined, waitMs: RESOLVE_WAIT_MS }, (loc: Locator) => readElements(loc, false, 'text'), { drift: run.drift });",
      ]),
    ).toBeGreaterThan(-1);
    // never a bare read at the call site, which would throw where this cannot
    expect(out).not.toContain(".textContent()) ?? '';");
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('leaves the value empty and says so when no candidate resolves', async () => {
    const warned: string[] = [];
    const { readOptional } = runnableHelpers(source, { warn: (line: string) => warned.push(line) });
    const value = await readOptional(
      pageStub(),
      [obs({ locator: fakeLocator({ counts: [0] }), index: 0 }), obs({ locator: fakeLocator({ counts: [0] }), index: 1 })],
      '03-add s_e4d3e5/11 target',
      NO_WAIT,
      async () => 'never read',
    );
    expect(value).toBe('');
    expect(warned).toEqual(['[sitelooper skip] 03-add s_e4d3e5/11 target: read target not found — value left empty']);
  });

  it('swallows a failing read too, as replay does when the read itself errors', async () => {
    const warned: string[] = [];
    const { readOptional } = runnableHelpers(source, { warn: (line: string) => warned.push(line) });
    const value = await readOptional(pageStub(), [obs({ locator: fakeLocator({ counts: [1] }), index: 0 })], 'x y/1 target', NO_WAIT, async () => {
      throw new Error('element is not an <input>');
    });
    expect(value).toBe('');
    expect(warned).toHaveLength(1);
  });

  it('returns what the read read when the target is there', async () => {
    const { readOptional } = runnableHelpers(source);
    expect(
      await readOptional(pageStub(), [obs({ locator: fakeLocator({ counts: [1] }), index: 0 })], 'x y/1 target', NO_WAIT, async () => 'Notes for run sp3gra'),
    ).toBe('Notes for run sp3gra');
  });
});

/**
 * runOneStep settles the DOM BEFORE anything else it does — the
 * already-in-effect check included. Without it the odoo home-menu toggles ask
 * "is the popup showing?" of a menu that is still mid-close, skip the opening
 * click, and leave the `Sales` menuitem unreachable eight steps later.
 */
describe('every step settles first', () => {
  const click: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#a' }] } };
  const source = emit(specOf([click, { ...click, locators: { target: [{ kind: 'id', selector: '#b' }] } }]));

  it('inlines settle once, with replay’s own constants', () => {
    expect(source.match(/async function settle\(page: Page\)/g)).toHaveLength(1);
    expect(source).toContain('const SETTLE_QUIET_MS = 250;');
    // The constants are the maintained shared source verbatim, numeric
    // separators and all (executionSource embeds the module, it does not
    // reprint it); the runtime check below pins the VALUE at 2000.
    expect(source).toContain('const SETTLE_MAX_MS = 2_000;');
    expect(source).toContain('const SETTLE_PROBE_MS = 60;');
    expect(source).toContain('observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });');
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('calls it at the top of every step, and again only when the url moved', () => {
    // Two steps, two settles each: the unconditional one that opens `prepare`
    // (replay's own "settle before you look at anything"), and the guarded one
    // in the lifecycle's settle phase, which re-settles only when the action
    // navigated (for an observed action, only when it had no observation: its
    // own settle is what settles it). Nothing else in the step BODIES calls it (the alertGate
    // helper settles once before it looks, as the daemon captures its diff
    // after settleDom — that is a helper, not a step).
    const bodies = source.slice(source.indexOf('export const steps = {'));
    expect(bodies.match(/await settle\(page\);/g)).toHaveLength(4);
    const lines = trimmedLines(bodies);
    expect(lines.filter((l) => l === 'await settle(page);')).toHaveLength(2);
    expect(lines.filter((l) => /^else if \(page\.url\(\) !== urlBefore\d\) await settle\(page\);$/.test(l))).toHaveLength(2);
    for (const n of [1, 2]) {
      expect(
        sequenceAt(source, ['prepare: async () => {', 'await settle(page);', `urlBefore${n} = page.url();`]),
      ).toBeGreaterThan(-1);
      expect(
        sequenceAt(source, ['settle: async () => {', `if (obs${n}) await obs${n}.settle();`, `else if (page.url() !== urlBefore${n}) await settle(page);`]),
      ).toBeGreaterThan(-1);
    }
  });

  it('settles ahead of the already-in-effect guard, not after it', () => {
    const opener: SkillStep = { ...click, expect: { addedContains: ['- menu "Apps"'] } };
    const lines = emit(specOf([opener])).split('\n').map((l) => l.trim());
    const settled = lines.indexOf('await settle(page);');
    const guard = lines.findIndex((l) => l.startsWith('if (await presentOnPage('));
    expect(settled).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(settled).toBeLessThan(guard);
  });

  it('settles again after a goto, before the assertions that gate it', () => {
    const goto: SkillStep = { tool: 'goto', args: { url: 'http://app.test/x' }, locators: {}, expect: { addedContains: ['- heading "Items"'] } };
    const out = emit(specOf([goto]));
    const lines = trimmedLines(out);
    const nav = lines.indexOf("await page.goto('http://app.test/x');");
    // The re-settle is the lifecycle's settle phase, which runs after the
    // action and before verify — and it fires here because a goto changes the
    // url. The assertion it gates must come after it.
    const resettled = lines.indexOf('if (page.url() !== urlBefore1) await settle(page);');
    const asserted = lines.findIndex((l) => /^const changes\d+ = await expectChanges\(page, /.test(l));
    expect(nav).toBeGreaterThan(-1);
    expect(resettled).toBeGreaterThan(nav);
    expect(asserted).toBeGreaterThan(resettled);
    expect(lines.indexOf('verify: async () => {')).toBeGreaterThan(resettled);
  });

  it('resolves on a page that answers evaluate', async () => {
    const { settle } = runnableHelpers(source);
    let seen: unknown;
    await settle({
      evaluate: async (_fn: unknown, arg: unknown) => {
        seen = arg;
      },
    });
    expect(seen).toEqual({ probe: 60, quiet: 250, max: 2000 });
  });

  it('swallows the error a navigating or detached page throws', async () => {
    const { settle } = runnableHelpers(source);
    await expect(
      settle({
        evaluate: async () => {
          throw new Error('Execution context was destroyed');
        },
      }),
    ).resolves.toBeUndefined();
  });
});

/**
 * A step whose work has already landed.
 *
 * fwod34 is the case: 06-open asked for an order to be cancelled and its
 * recording did not land the cancel, so the orchestrator recorded 08-open
 * asking for the same cancel again. On replay 06-open works — and 08-open then
 * hunts for a Cancel button a cancelled order does not have. The compiled spec
 * asks the same question replay asks (goalSatisfied): is this the right record,
 * and is it already in the state this step produces?
 */
describe('emitFlowFile: the already-satisfied guard', () => {
  const CLICK: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Cancel' }] } };

  /** 08-open's shape: identity on the order ref and its status, goal "Cancelled". */
  const cancelStep = (over: Partial<SpecSegment> = {}): SpecFlow =>
    specOf([CLICK], {
      id: '08-open',
      instruction: "the sales order {{v1}} is currently in '{{v3}}' status and needs to be cancelled",
      params: { v1: '{{02-create.quotation_ref}}', v3: 'Sales Order' },
      outputs: ['order_status', 'order_reference'],
      segments: [
        segment([CLICK], {
          id: 's_c86522',
          params: {
            v1: { example: 'S00021', usedIn: [1], known: true },
            v3: { example: 'Sales Order', usedIn: [1], known: true },
          },
          preconditions: { urlPattern: 'http://app.test/odoo/sales/21', requireText: ['{{v1}}', '{{v3}}'] },
          goal: { requireText: ['Cancelled'] },
          report: { summary: 'cancelled {{v1}}', values: { order_status: 'Cancelled', order_reference: '{{v1}}' } },
          ...over,
        }),
      ],
    });

  it('opens the step body with the guard, its log line and the report values', () => {
    const source = emit(cancelStep());
    const body = source.slice(source.indexOf("async '08-open'"));
    const lines = body.split('\n').slice(1, 9).map((l) => l.trim());
    expect(lines).toEqual([
      '// goal: the page already showing "Cancelled" for this record means the step\'s work is done —',
      '// the same check replay makes before it acts (goalSatisfied, src/skills/replay.ts).',
      // Replay's goalSatisfied, term for term: every marker BOUND at run time
      // (markersBound — a slot bound to '' proves nothing, and compile cannot
      // see the value), the page template the goal was read on (the shared
      // urlMatches, unconditionally), then the page itself.
      "if (markersBound(['{{v1}}', '{{v3}}', 'Cancelled'], p) && urlMatches('http://app.test/odoo/sales/21', page.url(), p) && await satisfied(page, [`${p.v1}`, `${p.v3}`], ['Cancelled'])) {",
      "console.log('[sitelooper satisfied] 08-open — page shows \"Cancelled\"; nothing to do');",
      "outputs['08-open.order_status'] = 'Cancelled';",
      "outputs['08-open.order_reference'] = p.v1;",
      'return;',
      '}',
    ]);
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('inlines the satisfied helper, built on the shared snapshot dialect and nothing of its own', () => {
    const source = emit(cancelStep());
    expect(source).toContain('async function satisfied(page: Page, identity: string[], goal: string[]): Promise<boolean> {');
    // The observation and the matchers are the daemon's (goalSatisfied →
    // captureSignature + lineShows): the shared snapshot module, embedded.
    // The artifact used to answer from getByText and input values — a second
    // dialect, looser than the daemon's roled lines (a marker in a plain <div>
    // satisfied it and not the daemon). That dialect is gone, not bypassed.
    expect(source).toContain('const captured = await captureLines(page, 2);');
    expect(source).toContain('if (!captured || !captured.complete) return false;');
    expect(source).toContain('if (!lineShows(lines, [want], { whole: true })) return false;');
    expect(source).toContain('if (!lineShows(lines, [want])) return false;');
    expect(source).not.toContain('async function present(');
    expect(source).not.toContain('sharesScope');
    expect(source).not.toContain('getByText(re ?? text)');
    // …and the bounded identity matcher lineShows reaches for — the shared
    // text module, pulled in transitively.
    expect(source).toContain('function identityRe(marker: string): RegExp {');
    expect(source).toContain('// Shared execution source: text.ts. Regenerate to update.');
    expect(source).toContain('// Shared execution source: snapshot.ts. Regenerate to update.');
    // Helpers live between DRIFT and the steps object, like every other one.
    expect(source.indexOf('async function satisfied(')).toBeGreaterThan(source.indexOf('export const DRIFT'));
    expect(source.indexOf('async function satisfied(')).toBeLessThan(source.indexOf('export const steps = {'));
  });

  /**
   * The record-scope check landed in replay first and, for a while, only
   * there. That is the shape of bug the parity harness exists for: a compiled
   * spec would see "Order A" and "Cancelled" both on a list page and skip the
   * step, when it was order B that had been cancelled. It is now ONE page
   * function on both sides (scopeCheckInPage, src/execution/snapshot.ts) —
   * the hand-copy the artifact carried for a while is deleted.
   */
  it('carries the record-scope check into the artifact through the shared scopeCheckInPage, not a copy', () => {
    const source = emit(cancelStep());
    expect(source).toContain('function scopeCheckInPage(opts: { identity: string[]; goal: string[] }): boolean {');
    expect(source.split('function scopeCheckInPage(').length).toBe(2);
    // satisfied() must actually CALL it — inlining a helper nothing reaches is
    // the failure this test is really guarding against — and with the identity
    // half as regex source, as replay's sharesRecordScope hands it over.
    expect(source).toContain('return await page.evaluate(scopeCheckInPage, { identity: identity.map(identitySource), goal });');
    expect(source).not.toContain('async function sharesScope(');
  });

  it('emits nothing at all for a segment with no goal', () => {
    const source = emit(cancelStep({ goal: undefined, report: undefined }));
    expect(source).not.toContain('satisfied(');
    expect(source).not.toContain('sitelooper satisfied');
  });

  // An unbound marker proves nothing — replay skips it as identity, and a goal
  // that cannot be filled must not be guessed at. No guard is the safe answer:
  // the step simply runs, exactly as it does today.
  it('emits nothing when the goal or the identity cannot be filled from this run', () => {
    expect(emit(cancelStep({ goal: { requireText: ['{{v9}}'] } }))).not.toContain('satisfied(');
    expect(emit(cancelStep({ preconditions: { urlPattern: 'http://app.test/x' } }))).not.toContain('satisfied(');
  });

  it('skips a report value it cannot fill, and publishes the rest', () => {
    const source = emit(cancelStep({ report: { summary: 's', values: { order_status: 'Cancelled', stray: '{{v9}}' } } }));
    expect(source).toContain("outputs['08-open.order_status'] = 'Cancelled';");
    expect(source).not.toContain("outputs['08-open.stray'] =");
  });

  it('guards the step once, ahead of the first segment identity check', () => {
    const source = emit(cancelStep());
    expect((source.match(/await satisfied\(page,/g) ?? []).length).toBe(1);
    expect(source.indexOf('await satisfied(page,')).toBeLessThan(source.indexOf('identity: this must be the record'));
  });

  /**
   * The helper's own semantics, cut out and run: identity AND goal, and never
   * satisfied on an empty half. Being wrong the safe way costs a re-run; being
   * wrong the other way skips work that never happened.
   */
  it('is satisfied only when every identity and every goal text is present in the snapshot lines', async () => {
    const source = emit(cancelStep());
    // The whole helper block — the embedded shared modules included — so the
    // helper runs against the real lineShows/identitySource it is built on;
    // only the page capture and the in-page scope check are stubbed, through
    // the page they read. Scope is exercised on a real DOM by the parity harness.
    const { satisfied } = runnableHelpers(source);
    const onPage = (lines: string[], scoped = true, complete = true) => ({
      evaluate: async (fn: unknown) => (String(fn).includes('maxAlerts') ? documentOf(lines, [], { linesTruncated: !complete }) : scoped),
    });
    // a snapshot LINE, role and all — not a text node
    const shown = ['- heading "S00021"', '- textbox "Type": Sales Order', '- button "Cancelled"'];
    expect(await satisfied(onPage(shown), ['S00021', 'Sales Order'], ['Cancelled'])).toBe(true);
    // the right record, still in its old state
    expect(await satisfied(onPage(shown.slice(0, 2)), ['S00021', 'Sales Order'], ['Cancelled'])).toBe(false);
    // "Cancelled" somewhere on the page, but not this record's page
    expect(await satisfied(onPage(['- heading "S00099"', '- button "Cancelled"']), ['S00021'], ['Cancelled'])).toBe(false);
    // identity is BOUNDED: S00021 is not S000210
    expect(await satisfied(onPage(['- heading "S000210"', '- button "Cancelled"']), ['S00021'], ['Cancelled'])).toBe(false);
    // both present but of different records: the in-page scope check decides
    expect(await satisfied(onPage(shown, false), ['S00021', 'Sales Order'], ['Cancelled'])).toBe(false);
    // both showing, on a look that could not cover the page (a cap reached): not satisfied — run the step
    expect(await satisfied(onPage(shown, true, false), ['S00021', 'Sales Order'], ['Cancelled'])).toBe(false);
    expect(await satisfied(onPage(shown), ['S00021'], [])).toBe(false);
    expect(await satisfied(onPage(shown), [], ['Cancelled'])).toBe(false);
    // a page that cannot be read has proven nothing
    expect(await satisfied({ evaluate: async () => { throw new Error('gone'); } }, ['S00021'], ['Cancelled'])).toBe(false);
  });
});

/**
 * Where a goal is allowed to land. A goal is a claim about STATE, so a
 * read-only procedure cannot have one (fwrd14l-n2's lesson in a new place: a
 * read-only skill that "covers" a mutating step is the worst failure this
 * system has), and in a chain only the last segment finishes the work.
 */
describe('flowToSpec: goals reach the segment that can act on one', () => {
  let dir: string;
  const skill = (over: Partial<Skill>): Skill => ({
    id: 's_1',
    origin: 'http://app.test',
    template: 'cancel {{v1}}',
    params: { v1: { example: 'S00021', usedIn: [1], known: true } },
    preconditions: { urlPattern: 'http://app.test/o/1', requireText: ['{{v1}}'] },
    steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Cancel' }] } }],
    stats: { uses: 1, successes: 1, partial: 0, created: new Date(0).toISOString(), failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 'test', instruction: 'cancel it', created: new Date(0).toISOString() },
    goal: { requireText: ['Cancelled'] },
    reportTemplate: { summary: 'cancelled {{v1}}', values: { order_status: 'Cancelled' } },
    ...over,
  });
  const flowFor = (id: string): Flow => ({
    name: 'goals',
    origin: 'http://app.test',
    startUrl: 'http://app.test/',
    vars: [],
    steps: [{ id: '01-do', instruction: 'cancel S00021', skill: id, outputs: [], recorded: {} }],
    provenance: { session: 'test', created: new Date(0).toISOString() },
  });

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-goal-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('carries the goal and the report template a mutating skill declares', () => {
    const store = new SkillStore(dir);
    store.clear('http://app.test');
    store.put(skill({}));
    const seg = flowToSpec(flowFor('s_1'), store).spec.steps[0].segments[0];
    expect(seg.goal).toEqual({ requireText: ['Cancelled'] });
    expect(seg.report).toEqual({ summary: 'cancelled {{v1}}', values: { order_status: 'Cancelled' } });
  });

  it('drops a goal on a READ-ONLY procedure, however it got there', () => {
    const store = new SkillStore(dir);
    store.clear('http://app.test');
    store.put(skill({ steps: [{ tool: 'read', label: 'status', args: { what: 'text' }, locators: { target: [{ kind: 'text', text: 'Cancelled' }] } }] }));
    const seg = flowToSpec(flowFor('s_1'), store).spec.steps[0].segments[0];
    expect(seg.goal).toBeUndefined();
    expect(seg.report).toBeUndefined();
  });

  it('puts the goal on the LAST segment of a chain, never an earlier one', () => {
    const store = new SkillStore(dir);
    store.clear('http://app.test');
    store.put(skill({ id: 's_a', seq: { chain: 's_a', index: 0, of: 2 } }));
    store.put(skill({ id: 's_b', seq: { chain: 's_a', index: 1, of: 2 } }));
    const segs = flowToSpec(flowFor('s_a'), store).spec.steps[0].segments;
    expect(segs.map((s) => s.id)).toEqual(['s_a', 's_b']);
    expect(segs[0].goal).toBeUndefined();
    expect(segs[1].goal).toEqual({ requireText: ['Cancelled'] });
  });
});

/**
 * The other end of the guard: a spec check has to SAY when a step did nothing.
 *
 * A pass in which a step short-circuited is not the same pass as one that ran
 * every gesture — the procedure under test was never exercised for that step —
 * so the `[sitelooper satisfied]` lines are counted out of the run's stdout the
 * same way the drift lines are, and the verdict names them.
 */
describe('runSpecCheck: a run in which a step was already satisfied', () => {
  const report = (out: string) => ({
    stats: { duration: 9123 },
    suites: [
      {
        specs: [
          {
            tests: [
              {
                results: [{ status: 'passed', duration: 9123, stdout: [{ text: out }], stderr: [] }],
              },
            ],
          },
        ],
      },
    ],
  });

  it('collects the satisfied lines a test logged, beside its drift lines', () => {
    const parsed = parseSpecReport(
      report(
        '[sitelooper satisfied] 08-open — page shows "Cancelled"; nothing to do\n' +
          '[sitelooper drift] 03-open s_1/2 target: primary missed\n' +
          'some other output\n',
      ),
    );
    expect(parsed.satisfied).toEqual(['[sitelooper satisfied] 08-open — page shows "Cancelled"; nothing to do']);
    expect(parsed.drift).toEqual(['[sitelooper drift] 03-open s_1/2 target: primary missed']);
  });

  it('names them in the verdict of a passing run, and says nothing when there are none', () => {
    const base = {
      ran: true,
      skipped: null,
      passed: true,
      durationMs: 9123,
      exitCode: 0,
      timedOut: false,
      error: null,
      anchor: null,
      errorFile: null,
      errorLine: null,
      drift: [],
      driftCount: 0,
      workspace: null,
      specFile: null,
    };
    expect(verdictFor(base, true)).toBe('spec check: passed in 9 s, 0 drift');
    expect(verdictFor({ ...base, satisfied: ['[sitelooper satisfied] 08-open — page shows "Cancelled"; nothing to do'] }, true)).toBe(
      'spec check: passed in 9 s, 0 drift, 1 already satisfied',
    );
  });
});

