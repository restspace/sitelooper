/**
 * Generated failure detection (`check --ready --faults`, `build --faults`).
 *
 * Three clean runs show a compiled spec passes when the app does the work.
 * They do not show it would FAIL if the app did not. The fault pass asks that
 * directly: the artifact carries a guard on every gesture (emit.ts
 * observeAction, the emitted faultHere), readiness runs it once per chosen
 * gesture with SITELOOPER_FAULT naming that site, and a run that still passes
 * names an action whose effect nothing in the spec checks.
 *
 * Here: the emitted guard and its `faultSites` export, the plan and the
 * classification (pure), and the readiness pass through its check seam. The
 * same pass against a real app under Playwright is
 * test/fault-readiness.browser.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSpecReport, type SpecCheckResult } from '../src/spec/check.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import { classifyFault, planFaults, runReadinessCheck, type FaultSite } from '../src/spec/readiness.js';
import type { SkillStep } from '../src/skills/store.js';

const button = (name: string) => ({ target: [{ kind: 'role' as const, role: 'button', name }] });
const click = (name: string, expect?: SkillStep['expect'], extra: Partial<SkillStep> = {}): SkillStep => ({
  tool: 'click', args: { target: '@e1' }, locators: button(name), ...(expect ? { expect } : {}), ...extra,
});

function flowOf(steps: Record<string, SkillStep[]>): SpecFlow {
  return {
    version: 1, name: 'faults', origin: 'http://app.test', startUrl: 'http://app.test/', vars: ['name'],
    steps: Object.entries(steps).map(([id, recorded], i) => ({
      id, instruction: id, params: { v1: '{{name}}' }, outputs: [],
      segments: [{
        id: `s_00000${i + 1}`, template: `${id} {{v1}}`, params: { v1: { example: 'Widget A', usedIn: [1], known: true } },
        preconditions: { urlPattern: 'http://app.test/' }, steps: recorded,
      }],
    })),
  };
}
const emit = (flow: SpecFlow) => emitFlowFile(flow, { tier: 'plain' }).source;
const exported = (source: string): string[] => JSON.parse(/export const faultSites = (\[.*?\]) as const;/.exec(source)![1]);

describe('the emitted fault guard', () => {
  const textbox = { target: [{ kind: 'role' as const, role: 'textbox', name: 'Title' }] };
  const flow = flowOf({
    '01-create': [
      { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: textbox },
      { tool: 'type', args: { target: '@e1', text: 'abc' }, locators: textbox },
      click('Save', { addedContains: ['- link "{{v1}}"'] }),
      { tool: 'press', args: { key: 'Enter' }, locators: {} },
      { tool: 'select', args: { target: '@e1', option: 'Open' }, locators: { target: [{ kind: 'role', role: 'combobox', name: 'Status' }] } },
      { tool: 'check', args: { target: '@e1', checked: true }, locators: { target: [{ kind: 'role', role: 'checkbox', name: 'Urgent' }] } },
      { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'css', selector: '#status' }] }, label: 'status' },
      {
        tool: 'loop', args: {}, locators: {}, max: 3, scope: 'drain',
        while: [{ kind: 'css', selector: '.row .del' }],
        body: [click('Remove')],
      },
    ],
  });
  const source = emit(flow);

  it('guards each gesture at its own site, and lists exactly those sites', () => {
    expect(source).toContain("if (!faultHere('01-create s_000001/3')) await click(hit");
    expect(source).toContain("if (!faultHere('01-create s_000001/4')) await page.keyboard.press('Enter').catch(actionFailed);");
    expect(source).toContain("if (!faultHere('01-create s_000001/5')) await select(hit");
    expect(source).toContain("if (!faultHere('01-create s_000001/6')) await hit");
    expect(exported(source)).toEqual(['01-create s_000001/3 click', '01-create s_000001/4 press', '01-create s_000001/5 select', '01-create s_000001/6 check']);
    // one guard per listed site, and no other
    expect(source.match(/if \(!faultHere\('/g)).toHaveLength(4);
  });

  it('guards no typing: a fill that did not land is put back before the next submit', () => {
    expect(source).not.toMatch(/faultHere\('01-create s_000001\/[12]'\)/);
    expect(source).toMatch(/await guardedTyping\(.*async \(\) => await fill\(/);
    expect(source).not.toMatch(/faultHere\([^)]*\)\) await guardedTyping/);
  });

  it('guards nothing inside a loop body, which shares its loop site', () => {
    expect(exported(source).some((entry) => entry.startsWith('01-create s_000001/8'))).toBe(false);
  });

  it('a flow with no gesture exports an empty list and carries no helper', () => {
    const quiet = emit(flowOf({ '01-read': [{ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'css', selector: '#status' }] }, label: 'status' }] }));
    expect(exported(quiet)).toEqual([]);
    expect(quiet).not.toContain('function faultHere(');
  });

  it('the helper withholds only the site SITELOOPER_FAULT names, every time, and says so', () => {
    const helper = /function faultHere\(site: string\): boolean \{[\s\S]*?\n\}/.exec(source);
    expect(helper).not.toBeNull();
    const js = ts.transpileModule(helper![0], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const logged: string[] = [];
    const build = (env: Record<string, string | undefined>) =>
      new Function('process', 'console', `${js}\nreturn faultHere;`)({ env }, { log: (line: string) => logged.push(line) }) as (site: string) => boolean;
    const idle = build({});
    expect(idle('01-create s_000001/3')).toBe(false);
    const armed = build({ SITELOOPER_FAULT: '01-create s_000001/3' });
    expect(armed('01-create s_000001/4')).toBe(false);
    expect(armed('01-create s_000001/3')).toBe(true);
    expect(armed('01-create s_000001/3')).toBe(true);
    expect(logged).toEqual(Array(2).fill('[sitelooper fault] 01-create s_000001/3: dispatch withheld'));
  });
});

describe('a spec check reports the dispatches a fault withheld', () => {
  it('collects the fault lines a test logged', () => {
    const report = {
      suites: [{ specs: [{ tests: [{ results: [{ status: 'passed', duration: 5, stdout: [{ text: '[sitelooper fault] 01-create s_000001/3: dispatch withheld\n[sitelooper step] 01-create\n' }], stderr: [] }] }] }] }],
    };
    expect(parseSpecReport(report).faulted).toEqual(['[sitelooper fault] 01-create s_000001/3: dispatch withheld']);
  });
});

describe('planFaults', () => {
  const flow = flowOf({
    // opens the form, saves (this run's value appears), then walks back to the list
    '01-create': [click('New'), click('Save', { addedContains: ['- link "{{v1}}"'] }), click('Back to list', { addedContains: ['- heading "Tickets"'] })],
    // nothing recorded about either click
    '02-archive': [click('Select all'), click('Archive')],
    // a delete: the record goes
    '03-delete': [click('Delete', { goneContains: ['- link "{{v1}}"'] }), click('Close')],
  });
  const entries = exported(emit(flow));

  it("'all' is every guarded gesture, in order", () => {
    expect(planFaults(entries, flow, 'all').map((f) => `${f.site} ${f.tool}`)).toEqual(entries);
    expect(entries).toHaveLength(7);
  });

  it("'step' takes one gesture per flow step: the last with the strongest recorded effect", () => {
    expect(planFaults(entries, flow, 'step').map((f) => f.site)).toEqual([
      '01-create s_000001/2', // the save, not the walk back
      '02-archive s_000002/2', // no evidence either way: the last gesture
      '03-delete s_000003/1', // the delete, not the close
    ]);
  });

  it('without the recording it falls back to the last gesture of each step', () => {
    expect(planFaults(entries, null, 'step').map((f) => f.site)).toEqual(['01-create s_000001/3', '02-archive s_000002/2', '03-delete s_000003/2']);
  });

  it('ignores an entry it cannot read', () => {
    expect(planFaults(['nonsense', '01-create s_000001/2 click'], null, 'all')).toEqual([
      { site: '01-create s_000001/2', step: '01-create', segment: 's_000001', index: 2, tool: 'click' },
    ]);
  });
});

function result(extra: Partial<SpecCheckResult> = {}): SpecCheckResult {
  return {
    outcome: 'passed', ran: true, passed: true, skipped: null, durationMs: 10, exitCode: 0, timedOut: false, error: null,
    anchor: null, errorFile: null, errorLine: null, drift: [], driftCount: 0, satisfied: [], faulted: [], executedSteps: ['save'],
    skippedCount: 0, verdict: 'passed', workspace: null, specFile: null, ...extra,
  };
}
const failed = (extra: Partial<SpecCheckResult> = {}) => result({ outcome: 'failed', passed: false, exitCode: 1, error: 'the recorded page change did not appear', ...extra });
const withheld = (site: string) => [`[sitelooper fault] ${site}: dispatch withheld`];

describe('classifyFault', () => {
  const fault: FaultSite = { site: 'save s_abc123/2', step: 'save', segment: 's_abc123', index: 2, tool: 'click' };

  it('detected at the action, later in the step, or later in the flow', () => {
    expect(classifyFault(fault, failed({ faulted: withheld(fault.site), anchor: 'save s_abc123/2' }))).toMatchObject({ outcome: 'detected', detectedAt: 'action' });
    expect(classifyFault(fault, failed({ faulted: withheld(fault.site), anchor: 'save s_abc123/4' }))).toMatchObject({ outcome: 'detected', detectedAt: 'step' });
    expect(classifyFault(fault, failed({ faulted: withheld(fault.site), anchor: 'verify s_def456/1' }))).toMatchObject({ outcome: 'detected', detectedAt: 'later' });
    expect(classifyFault(fault, failed({ faulted: withheld(fault.site), anchor: null }))).toMatchObject({ outcome: 'detected', detectedAt: 'later' });
  });

  it('undetected when the fault fired and the spec still passed', () => {
    expect(classifyFault(fault, result({ faulted: withheld(fault.site) }))).toMatchObject({ outcome: 'undetected', error: null });
  });

  it('not reached when the spec passed without arriving at the action', () => {
    expect(classifyFault(fault, result())).toMatchObject({ outcome: 'not-reached' });
    // another site's line is not this fault firing
    expect(classifyFault(fault, result({ faulted: withheld('save s_abc123/20') }))).toMatchObject({ outcome: 'not-reached' });
  });

  it('inconclusive when the run failed before the fault fired, or could not run', () => {
    expect(classifyFault(fault, failed())).toMatchObject({ outcome: 'inconclusive' });
    expect(classifyFault(fault, result({ ran: false, passed: false, outcome: 'unavailable', skipped: 'no browser' }))).toMatchObject({ outcome: 'inconclusive', error: 'no browser' });
  });
});

describe('readiness: the fault pass', () => {
  let dir: string;
  let flowFile: string;
  const SITES = ['save s_abc123/2 click', 'archive s_def456/1 click'];
  const artifact = (sites: string[] | null) =>
    'export const flowStepIds = ["save", "archive"] as const;\nexport const requiredInputNames = ["name"] as const;\n' +
    (sites ? `export const faultSites = ${JSON.stringify(sites)} as const;\n` : '');
  beforeEach(() => {
    dir = fs.mkdtempSync(path.resolve('test/.readiness-test-'));
    flowFile = path.join(dir, 'sample.flow.ts');
    fs.writeFileSync(flowFile, artifact(SITES));
    fs.writeFileSync(path.join(dir, 'sample.spec.ts'), '// generated scaffold');
  });
  afterEach(() => {
    expect(path.dirname(dir)).toBe(path.resolve('test'));
    expect(path.basename(dir)).toMatch(/^\.readiness-test-/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const clean = () => result({ executedSteps: ['save', 'archive'] });
  const options = (extra: object = {}) => ({ flowFile, vars: { name: 'customer-{n}' }, fixtureIsolation: true, ...extra });

  it('is not run unless asked for', () => {
    const faults: (string | undefined)[] = [];
    const report = runReadinessCheck(options(), (o) => { faults.push(o.env?.SITELOOPER_FAULT); return clean(); });
    expect(faults).toEqual([undefined, undefined, undefined]);
    expect(report.outcome).toBe('verified');
    expect(report.failureDetection).toBe('not-configured');
    expect(report.faults).toBeUndefined();
  });

  it('runs once per fault after the clean runs, each with its site and a fresh dataset', () => {
    const calls: { fault?: string; name: string }[] = [];
    const report = runReadinessCheck(options({ faults: 'step' }), (o) => {
      const fault = o.env?.SITELOOPER_FAULT;
      calls.push({ fault, name: o.vars!.name });
      return fault ? failed({ faulted: withheld(fault), anchor: fault }) : clean();
    });
    expect(calls).toEqual([
      { fault: undefined, name: 'customer-1' },
      { fault: undefined, name: 'customer-2' },
      { fault: undefined, name: 'customer-3' },
      { fault: 'save s_abc123/2', name: 'customer-4' },
      { fault: 'archive s_def456/1', name: 'customer-5' },
    ]);
    expect(report.outcome).toBe('verified');
    expect(report.failureDetection).toBe('verified');
    expect(report.faults!.map((f) => [f.site, f.tool, f.outcome, f.detectedAt])).toEqual([
      ['save s_abc123/2', 'click', 'detected', 'action'],
      ['archive s_def456/1', 'click', 'detected', 'action'],
    ]);
    expect(JSON.parse(fs.readFileSync(report.evidenceFile, 'utf8')).faults).toHaveLength(2);
  });

  it('an undetected fault fails readiness and names the action, after every fault has run', () => {
    const report = runReadinessCheck(options({ faults: 'step' }), (o) => {
      const fault = o.env?.SITELOOPER_FAULT;
      if (!fault) return clean();
      return fault.startsWith('save') ? result({ faulted: withheld(fault), executedSteps: ['save', 'archive'] }) : failed({ faulted: withheld(fault), anchor: fault });
    });
    expect(report.outcome).toBe('failed');
    expect(report.failureDetection).toBe('failed');
    // the clean runs stand: execution was verified, detection was not
    expect(report.executionVerified).toBe(true);
    expect(report.faults!.map((f) => f.outcome)).toEqual(['undetected', 'detected']);
    expect(report.blockers).toEqual(['Fault at save s_abc123/2 (click) was not detected: the spec passed with that action withheld, so nothing in it checks what the action does']);
  });

  it('a fault the run never reached is a warning, and verifies nothing', () => {
    const report = runReadinessCheck(options({ faults: 'step' }), () => clean());
    expect(report.outcome).toBe('verified');
    expect(report.failureDetection).toBe('not-configured');
    expect(report.faults!.map((f) => f.outcome)).toEqual(['not-reached', 'not-reached']);
    expect(report.warnings.join('\n')).toContain('Fault at save s_abc123/2 (click): the run passed without reaching that action');
  });

  it('a fault run that failed before the fault fired is inconclusive, never a detection', () => {
    const report = runReadinessCheck(options({ faults: 'step' }), (o) => (o.env?.SITELOOPER_FAULT ? failed({ error: 'page.goto: net::ERR_CONNECTION_REFUSED' }) : clean()));
    expect(report.outcome).toBe('unavailable');
    expect(report.failureDetection).toBe('failed');
    expect(report.blockers.join('\n')).toContain('was inconclusive: page.goto: net::ERR_CONNECTION_REFUSED');
  });

  it("'all' withholds every listed gesture", () => {
    fs.writeFileSync(flowFile, artifact(['save s_abc123/1 click', ...SITES]));
    const faults: string[] = [];
    runReadinessCheck(options({ faults: 'all' }), (o) => {
      const fault = o.env?.SITELOOPER_FAULT;
      if (fault) faults.push(fault);
      return fault ? failed({ faulted: withheld(fault), anchor: fault }) : clean();
    });
    expect(faults).toEqual(['save s_abc123/1', 'save s_abc123/2', 'archive s_def456/1']);
  });

  it('refuses, before any run, an artifact that carries no guards', () => {
    fs.writeFileSync(flowFile, artifact(null));
    const old = runReadinessCheck(options({ faults: 'step' }), () => { throw new Error('must not run'); });
    expect(old.outcome).toBe('blocked');
    expect(old.blockers.join('\n')).toContain('without fault guards; regenerate it');

    fs.writeFileSync(flowFile, `// @sitelooper-readable v1\n${artifact(null)}`);
    const readable = runReadinessCheck(options({ faults: 'step' }), () => { throw new Error('must not run'); });
    expect(readable.outcome).toBe('blocked');
    expect(readable.blockers.join('\n')).toContain('Fault checks need a runtime-style flow file');
  });

  it('a flow with no gesture is told so, and stays unverified for detection', () => {
    fs.writeFileSync(flowFile, artifact([]));
    const report = runReadinessCheck(options({ faults: 'step' }), () => clean());
    expect(report.outcome).toBe('verified');
    expect(report.failureDetection).toBe('not-configured');
    expect(report.faults).toEqual([]);
    expect(report.warnings.join('\n')).toContain('no gesture to withhold');
  });

  it('removes the workspace of a detected fault, and keeps one that went wrong another way', () => {
    const made: string[] = [];
    const workspace = () => {
      const work = fs.mkdtempSync(path.join(dir, '.sitelooper-check-'));
      made.push(work);
      return work;
    };
    runReadinessCheck(options({ faults: 'step' }), (o) => {
      const fault = o.env?.SITELOOPER_FAULT;
      if (!fault) return clean();
      return fault.startsWith('save') ? failed({ faulted: withheld(fault), anchor: fault, workspace: workspace() }) : failed({ workspace: workspace() });
    });
    expect(made).toHaveLength(2);
    expect(fs.existsSync(made[0])).toBe(false);
    expect(fs.existsSync(made[1])).toBe(true);
  });
});
