/**
 * The fault pass against a real app, under plain Playwright.
 *
 * A two-step flow on the ticket fixture (test/fixture/tickets-server.mjs):
 * `01-create` fills a title and clicks Save, recorded with the new ticket's
 * link appearing; `02-archive` clicks "Archive all", recorded with NO effect —
 * the kind of step three clean runs say nothing about. Readiness then runs the
 * compiled spec with each click withheld in turn:
 *  - without Save the ticket never appears, and the step's own effect gate
 *    stops the run: detected, at the action;
 *  - without "Archive all" the spec passes exactly as before, while the app
 *    was never asked to archive anything: undetected, and readiness says so.
 *
 * The app runs in its own process because readiness spawns Playwright
 * synchronously. Each run is a real browser launch, so this is browser-gated:
 *   BP_BROWSER_TESTS=1 npx vitest run test/fault-readiness.browser.test.ts --pool=forks --poolOptions.forks.maxForks=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emitFlowFile, emitSpecFile } from '../src/spec/emit.js';
import type { SpecFlow, SpecStep } from '../src/spec/ir.js';
import { runReadinessCheck } from '../src/spec/readiness.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

d('readiness fault runs against a real app', () => {
  let app: ChildProcess;
  let origin = '';
  let dir = '';

  beforeAll(async () => {
    app = spawn(process.execPath, [path.resolve('test/fixture/tickets-server.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    const port = await new Promise<number>((resolve, reject) => {
      app.stdout!.on('data', (chunk) => {
        const m = /listening (\d+)/.exec(String(chunk));
        if (m) resolve(Number(m[1]));
      });
      app.once('exit', (code) => reject(new Error(`ticket fixture exited ${code}`)));
    });
    origin = `http://127.0.0.1:${port}`;
  }, 30_000);
  afterAll(() => {
    app?.kill();
  });

  // The fixture is asked from a child process too: this one's event loop is
  // blocked for the whole of a readiness run.
  const ask = (pathname: string, method = 'GET'): string =>
    spawnSync(process.execPath, ['-e', `fetch(${JSON.stringify(origin + pathname)}, { method: ${JSON.stringify(method)} }).then((r) => r.text()).then((t) => process.stdout.write(t))`], { encoding: 'utf8' }).stdout;
  const state = (): { tickets: string[]; archived: boolean; archiveCalls: number } => JSON.parse(ask('/state'));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.resolve('test/.readiness-test-'));
    ask('/reset', 'POST');
  });
  afterEach(() => {
    expect(path.dirname(dir)).toBe(path.resolve('test'));
    expect(path.basename(dir)).toMatch(/^\.readiness-test-/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const create = (): SpecStep => ({
    id: '01-create', instruction: 'create a ticket', params: { v1: '{{name}}' }, outputs: [],
    segments: [{
      id: 's_aaaaaa', template: 'create a ticket titled {{v1}}',
      params: { v1: { example: 'Widget A', usedIn: [1], known: true } },
      preconditions: { urlPattern: `${origin}/` },
      steps: [
        { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Title' }] } },
        { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Save' }] }, expect: { addedContains: ['- link "{{v1}}"'] } },
      ],
    }],
  });
  const archive = (): SpecStep => ({
    id: '02-archive', instruction: 'archive every ticket', params: {}, outputs: [],
    segments: [{
      id: 's_bbbbbb', template: 'archive every ticket', params: {},
      preconditions: { urlPattern: `${origin}/` },
      // Recorded with no effect at all: nothing in the artifact checks this click.
      steps: [{ tool: 'click', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Archive all' }] } }],
    }],
  });
  const compile = (steps: SpecStep[]): string => {
    const flow: SpecFlow = { version: 1, name: 'tickets', origin, startUrl: `${origin}/`, vars: ['name'], steps };
    const flowFile = path.join(dir, 'tickets.flow.ts');
    fs.writeFileSync(flowFile, emitFlowFile(flow, { tier: 'plain' }).source);
    fs.writeFileSync(path.join(dir, 'tickets.spec.ts'), emitSpecFile(flow));
    return flowFile;
  };
  const ready = (flowFile: string) => runReadinessCheck({ flowFile, vars: { name: 'T-{n}' }, fixtureIsolation: true, runs: 2, faults: 'step' });

  it('a withheld Save is caught by the step that made it', () => {
    const report = ready(compile([create()]));
    expect(report.blockers).toEqual([]);
    expect(report.outcome).toBe('verified');
    expect(report.failureDetection).toBe('verified');
    expect(report.faults).toHaveLength(1);
    expect(report.faults![0]).toMatchObject({ site: '01-create s_aaaaaa/2', tool: 'click', outcome: 'detected', detectedAt: 'action', anchor: '01-create s_aaaaaa/2' });
    expect(report.faults![0].error).toContain('the recorded page change did not appear');
    // Ground truth: the two clean runs made their tickets, the fault run made none.
    expect(state().tickets).toEqual(['T-1', 'T-2']);
    // The expected failure left no workspace behind.
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('.sitelooper-check-'))).toEqual([]);
  }, 300_000);

  it('a withheld click nothing checks passes anyway, and readiness refuses the spec for it', () => {
    const report = ready(compile([create(), archive()]));
    expect(report.executionVerified).toBe(true);
    expect(report.outcome).toBe('failed');
    expect(report.failureDetection).toBe('failed');
    expect(report.faults!.map((f) => [f.site, f.outcome])).toEqual([
      ['01-create s_aaaaaa/2', 'detected'],
      ['02-archive s_bbbbbb/1', 'undetected'],
    ]);
    expect(report.blockers).toEqual(['Fault at 02-archive s_bbbbbb/1 (click) was not detected: the spec passed with that action withheld, so nothing in it checks what the action does']);
    // Ground truth: the app archived twice (the clean runs). The run that
    // withheld "Archive all" created its ticket, passed, and archived nothing;
    // the run that withheld Save stopped before it got there.
    expect(state()).toMatchObject({ tickets: ['T-1', 'T-2', 'T-4'], archiveCalls: 2 });
  }, 300_000);
});
