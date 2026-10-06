/**
 * No silent passes (notes/CONTRACT-spec-reliability.md item 3).
 *
 * The held-out survey's honesty count: sitelooper reported success on 10 of
 * the 14 runs the app's own verifier failed (notes/HELDOUT-RESULTS.md on
 * bench/heldout; T8 in COMPILED-SPEC-FAILURES.md: fwec10, fwgt12, fwgt13,
 * fwod98, hsbs1). Four mechanisms, each tested here:
 *
 *  3a  an asked output withheld (PARTIAL) fails the compiled spec at its end,
 *      as the daemon fails the step; SITELOOPER_ALLOW_PARTIAL=1 keeps the old
 *      warning-only behaviour.
 *  3b  the artifact publishes its findings: attached to the test, and written
 *      to $SITELOOPER_SPEC_OUTPUTS for bench/spec-replay.mjs's verifiers.
 *  3c  compile warns `unchecked-commit` on a commit gesture nothing checks.
 *  3d  the persistence probe re-reads a saved record after the last step.
 *
 * The browser half (BP_BROWSER_TESTS=1) runs the emitted runFlow against a
 * fixture app whose save either persists or only renders what was typed.
 *
 *   npx vitest run test/no-silent-pass.test.ts
 *   BP_BROWSER_TESTS=1 npx vitest run test/no-silent-pass.test.ts
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import ts from 'typescript';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emitFlowFile } from '../src/spec/emit.js';
import { probeSite } from '../src/spec/emit.js';
import { commitIndex, flowToSpec, uncheckedCommits, type SpecFlow, type SpecSegment, type SpecStep } from '../src/spec/ir.js';
import { givenPartialReason } from '../src/execution/report.js';
import type { SkillStep } from '../src/skills/store.js';
import type { Flow } from '../src/skills/flow.js';
import { SkillStore } from '../src/skills/store.js';

const ORIGIN = 'http://127.0.0.1:9';

const fill = (selector: string, value: string): SkillStep => ({ tool: 'fill', args: { target: '@e1', value }, locators: { target: [{ kind: 'id', selector }] } });
const click = (selector: string, expect?: SkillStep['expect']): SkillStep => ({ tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'id', selector }] }, ...(expect ? { expect } : {}) });
const read = (selector: string, label: string): SkillStep => ({ tool: 'read', args: { target: '@e3', what: 'text' }, label, locators: { target: [{ kind: 'id', selector }] } });

function seg(steps: SkillStep[], over: Partial<SpecSegment> = {}): SpecSegment {
  return { id: 's_create', template: 'Create an item named {{v1}}', params: { v1: { example: 'Old', usedIn: [1] } }, preconditions: { urlPattern: `${ORIGIN}/new` }, steps, ...over };
}
function stepOf(segments: SpecSegment[], over: Partial<SpecStep> = {}): SpecStep {
  return { id: '01-create', instruction: 'Create an item named {{name}}', params: { v1: '{{name}}' }, outputs: [], segments, ...over };
}

describe('3c: unchecked-commit', () => {
  it('names the commit: the last click or press after a fill, never a click before every fill', () => {
    expect(commitIndex([click('#open'), fill('#name', '{{v1}}'), click('#save')])).toBe(2);
    expect(commitIndex([click('#open'), fill('#name', '{{v1}}')])).toBe(-1);
    expect(commitIndex([click('#open'), read('#h', 'x')])).toBe(-1);
  });

  it('warns on a commit with no recorded effect and nothing read after it', () => {
    const found = uncheckedCommits([stepOf([seg([fill('#name', '{{v1}}'), click('#save')])])]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'unchecked-commit', step: '01-create', severity: 'warning', fix: 'add an assertion with `sitelooper assert` or re-record' });
    expect(found[0].what).toContain('click, s_create step 2');
  });

  // hsbs1 s_ca7686: every click of the move carried only the url it started on.
  it('reads a urlPattern equal to the url the commit started on as no effect (hsbs1)', () => {
    const same = click('#save', { urlPattern: `${ORIGIN}/new`, lineDialect: 2 });
    expect(uncheckedCommits([stepOf([seg([fill('#name', '{{v1}}'), same])])])).toHaveLength(1);
    const moved = click('#save', { urlPattern: `${ORIGIN}/items/{{v1}}` });
    expect(uncheckedCommits([stepOf([seg([fill('#name', '{{v1}}'), moved])])])).toEqual([]);
  });

  it('says nothing when the commit recorded a line, a removal or an alert', () => {
    for (const expect_ of [{ addedContains: ['- row "{{v1}}"'] }, { removedContains: ['- dialog "New"'] }, { alertContains: 'Saved' }]) {
      expect(uncheckedCommits([stepOf([seg([fill('#name', '{{v1}}'), click('#save', expect_)])])])).toEqual([]);
    }
  });

  it('says nothing when a read follows the commit, in its segment or a later one', () => {
    expect(uncheckedCommits([stepOf([seg([fill('#name', '{{v1}}'), click('#save'), read('#h', 'title')])])])).toEqual([]);
    const tail = seg([read('#h', 'title')], { id: 's_tail' });
    expect(uncheckedCommits([stepOf([seg([fill('#name', '{{v1}}'), click('#save')]), tail])])).toEqual([]);
  });

  it('never flags an assertion, or a step that types nothing', () => {
    expect(uncheckedCommits([stepOf([seg([fill('#name', '{{v1}}'), click('#save')])], { kind: 'assert' })])).toEqual([]);
    expect(uncheckedCommits([stepOf([seg([click('#open'), click('#save')])])])).toEqual([]);
  });

  it('is reported by flowToSpec as a warning, so compile still ships the artifact', () => {
    const dir = fs.mkdtempSync(path.resolve('test/.no-silent-store-'));
    try {
      const store = new SkillStore(dir);
      const now = new Date().toISOString();
      store.put({
        id: 's_create',
        origin: ORIGIN,
        template: 'Create an item named {{v1}}',
        params: { v1: { example: 'Old', usedIn: [1] } },
        preconditions: { urlPattern: `${ORIGIN}/new` },
        steps: [fill('#name', '{{v1}}'), click('#save')],
        status: 'validated',
        stats: { uses: 2, successes: 2, partial: 0, created: now, failedAtStep: {}, fallthroughs: 0 },
        provenance: { model: 'test', created: now },
      } as never);
      const flow = { name: 'unchecked', origin: ORIGIN, startUrl: `${ORIGIN}/new`, vars: ['name'], steps: [{ id: '01-create', instruction: 'Create an item named {{name}}', skill: 's_create', params: { v1: '{{name}}' }, outputs: [] }] } as unknown as Flow;
      const { diagnostics } = flowToSpec(flow, store);
      const d = diagnostics.find((x) => x.code === 'unchecked-commit');
      expect(d?.severity).toBe('warning');
      expect(d?.step).toBe('01-create');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('3d: which steps get a persistence probe', () => {
  const saved = (over: SkillStep['expect'] = {}) => click('#save', { urlPattern: `${ORIGIN}/items/{{v1}}`, addedContains: ['- heading "{{v1}}"'], lineDialect: 2, ...over });

  it('a commit that showed a typed value on a record url', () => {
    expect(probeSite(stepOf([seg([fill('#name', '{{v1}}'), saved()])]))).toEqual({ pattern: `${ORIGIN}/items/{{v1}}`, lines: ['- heading "{{v1}}"'], dialect: 2 });
  });

  it('a minting step counts as a record page whatever its url says', () => {
    const minted: SkillStep = { ...saved({ urlPattern: `${ORIGIN}/items/latest` }), mints: { at: 'p2' } };
    expect(probeSite(stepOf([seg([fill('#name', '{{v1}}'), minted])]))?.pattern).toBe(`${ORIGIN}/items/latest`);
  });

  it('not on a page that names no record, nor after the step moved on', () => {
    expect(probeSite(stepOf([seg([fill('#name', '{{v1}}'), saved({ urlPattern: `${ORIGIN}/items` })])]))).toBeNull();
    const away: SkillStep = { tool: 'goto', args: { url: `${ORIGIN}/list` }, locators: {}, expect: { urlPattern: `${ORIGIN}/list` } };
    expect(probeSite(stepOf([seg([fill('#name', '{{v1}}'), saved(), away])]))).toBeNull();
  });

  it('only HARD lines the chain typed: not a toast, a popup item, an untyped slot or a plain line', () => {
    const lines = ['- alert "Saved {{v1}}"', '- option "{{v1}}"', '- dialog "{{v1}}"', '- heading "Items"', '- link "{{v2}} Admin"', '- heading "{{v1}}"'];
    const s = seg([fill('#name', '{{v1}}'), saved({ addedContains: lines })], { params: { v1: { example: 'Old', usedIn: [1] }, v2: { example: 'Bo', usedIn: [] } } });
    expect(probeSite(stepOf([s]))?.lines).toEqual(['- heading "{{v1}}"']);
    expect(probeSite(stepOf([seg([fill('#name', '{{v1}}'), saved({ addedContains: ['- heading "Items"'] })])]))).toBeNull();
  });

  it('never for an assertion', () => {
    expect(probeSite(stepOf([seg([fill('#name', '{{v1}}'), saved()])], { kind: 'assert' }))).toBeNull();
  });
});

/** A flow on the fixture app: 01-create fills a name and saves; `report` adds an asked-for owner nothing shows. */
function flowAt(origin: string, o: { report?: boolean } = {}): SpecFlow {
  const save = click('#save', { urlPattern: `${origin}/items/{{v1}}`, addedContains: ['- heading "{{v1}}"'], lineDialect: 2 });
  const steps: SkillStep[] = [fill('#name', '{{v1}}'), save, read('#title', 'title')];
  const params: SpecSegment['params'] = { v1: { example: 'old', usedIn: [1] }, ...(o.report ? { v2: { example: 'Zed', usedIn: [] } } : {}) };
  return {
    version: 1,
    name: 'no-silent-pass',
    origin,
    startUrl: `${origin}/new`,
    vars: ['name'],
    steps: [
      {
        id: '01-create',
        instruction: o.report ? 'Create an item named {{name}} and report its owner' : 'Create an item named {{name}}',
        params: { v1: '{{name}}', ...(o.report ? { v2: 'Zed' } : {}) },
        outputs: o.report ? ['title', 'owner'] : ['title'],
        segments: [
          {
            id: 's_create',
            template: 'Create an item named {{v1}}',
            params,
            preconditions: { urlPattern: `${origin}/new` },
            steps,
            ...(o.report ? { report: { summary: '', values: { owner: '{{v2}}' } } } : {}),
          },
        ],
      },
    ],
  };
}

describe('the emitted artifact', () => {
  it('pushes a withheld asked output onto run.partial and fails at the end unless SITELOOPER_ALLOW_PARTIAL=1', () => {
    const { source } = emitFlowFile(flowAt(ORIGIN, { report: true }), { tier: 'plain' });
    // q() escapes the reason's apostrophe ("the step's own parameter").
    expect(source).toContain(`(run.partial ??= []).push('01-create: ${givenPartialReason('owner').replace(/'/g, "\\'")}');`);
    expect(source).toContain('PARTIAL — ');
    expect(source).toContain("if (run.partial.length && process.env.SITELOOPER_ALLOW_PARTIAL !== '1') failures.push(`PARTIAL: ${run.partial.join('; ')}`);");
  });

  it('notes a probe on the saving step and runs the probes after the last step', () => {
    const { source } = emitFlowFile(flowAt(ORIGIN), { tier: 'plain' });
    expect(source).toContain(`noteProbe(run, '01-create', page, p, '${ORIGIN}/items/{{v1}}', ['- heading "{{v1}}"'], 2);`);
    expect(source).toContain('async function runProbes(');
    expect(source).toContain("process.env.SITELOOPER_NO_PROBES === '1'");
    const probesAt = source.indexOf('await runProbes(page, run)');
    expect(probesAt).toBeGreaterThan(source.lastIndexOf("console.log('[sitelooper step] 01-create')"));
  });

  it('carries no probe machinery for a flow with nothing to probe, but always publishes its outputs', () => {
    const flow = flowAt(ORIGIN);
    flow.steps[0].segments[0].steps[1] = click('#save');
    const { source } = emitFlowFile(flow, { tier: 'plain' });
    expect(source).not.toContain('noteProbe(');
    expect(source).not.toContain('runProbes(');
    expect(source).toContain('await publishOutputs(run);');
    expect(source).toContain("test.info().attach('outputs'");
    expect(source).toContain('process.env.SITELOOPER_SPEC_OUTPUTS');
  });

  describe('type-checks under strict TypeScript', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.resolve('test/.no-silent-'));
    });
    afterEach(() => {
      expect(path.basename(dir)).toMatch(/^\.no-silent-/);
      fs.rmSync(dir, { recursive: true, force: true });
    });
    it('with a probe and a PARTIAL site', () => {
      const flow = path.join(dir, 'no-silent-pass.flow.ts');
      fs.writeFileSync(flow, emitFlowFile(flowAt(ORIGIN, { report: true }), { tier: 'plain' }).source);
      const program = ts.createProgram([flow], {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      });
      expect(ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
    }, 60_000);
  });
});

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

/**
 * The fixture app. `/new` has a name field and Save; Save posts the name and
 * then, client-side, shows the item page — the typed name as its heading — at
 * `/items/<name>`, as an SPA does. The server renders `/items/<name>` from what
 * it STORED. `lossy` is a server that accepts the post and keeps nothing: the
 * save looks right, and only a reload can tell.
 */
function fixtureApp() {
  const state = { lossy: false, items: new Set<string>() };
  const shell = (body: string) => `<!doctype html><html><head><title>Items</title></head><body>${body}</body></html>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'POST' && url.pathname === '/api/items') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (!state.lossy) state.items.add(raw);
        res.writeHead(204).end();
      });
      return;
    }
    res.setHeader('content-type', 'text/html');
    if (url.pathname === '/new') {
      res.end(
        shell(`<main><h2>New item</h2><label>Name <input id="name"></label><button id="save">Save</button></main>
<script>
document.getElementById('save').addEventListener('click', async () => {
  const name = document.getElementById('name').value;
  await fetch('/api/items', { method: 'POST', body: name });
  history.pushState({}, '', '/items/' + encodeURIComponent(name));
  document.querySelector('main').innerHTML = '<h1 id="title">' + name + '</h1>';
});
</script>`),
      );
      return;
    }
    const m = /^\/items\/(.+)$/.exec(url.pathname);
    if (m) {
      const name = decodeURIComponent(m[1]);
      res.end(shell(`<main>${state.items.has(name) ? `<h1 id="title">${name}</h1>` : '<h1 id="title">Not found</h1>'}</main>`));
      return;
    }
    res.writeHead(404).end(shell('<h1>Missing</h1>'));
  });
  return { server, state };
}

d('the emitted runFlow against a fixture app (browser)', () => {
  let dir: string;
  let origin: string;
  const app = fixtureApp();
  const env: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    dir = fs.mkdtempSync(path.resolve('test/.no-silent-run-'));
    // test.step inline, test.info absent: what a caller outside a Playwright test sees.
    fs.writeFileSync(path.join(dir, 'pw-shim.mjs'), "export { expect } from '@playwright/test';\nexport const test = { step: async (_name, fn) => await fn() };\n");
    for (const k of ['SITELOOPER_ALLOW_PARTIAL', 'SITELOOPER_NO_PROBES', 'SITELOOPER_SPEC_OUTPUTS']) env[k] = process.env[k];
  }, 60_000);
  afterAll(async () => {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    expect(path.basename(dir)).toMatch(/^\.no-silent-run-/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    for (const k of Object.keys(env)) delete process.env[k];
  });

  type FlowModule = { runFlow(page: unknown, vars: Record<string, string>, o?: { run?: unknown }): Promise<Record<string, string>> };
  async function moduleOf(spec: SpecFlow): Promise<FlowModule> {
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    const js = ts
      .transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
      .outputText.replace("from '@playwright/test'", "from './pw-shim.mjs'");
    const file = path.join(dir, `flow-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(file, js);
    return (await import(`file://${file.split(path.sep).join('/')}`)) as FlowModule;
  }

  /** runFlow in a fresh browser: the error it threw (or null), and what it returned. */
  async function run(spec: SpecFlow, name: string): Promise<{ error: string | null; outputs: Record<string, string> | null }> {
    const { BrowserSession } = await import('../src/daemon/browser.js');
    const mod = await moduleOf(spec);
    const session = new BrowserSession({ session: `no-silent-${Date.now()}`, persist: false });
    try {
      const outputs = await mod.runFlow(await session.getPage(), { name });
      return { error: null, outputs };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), outputs: null };
    } finally {
      await session.close();
    }
  }

  it('passes a save the app kept, and writes the findings file', async () => {
    app.state.lossy = false;
    const file = path.join(dir, 'kept-outputs.json');
    process.env.SITELOOPER_SPEC_OUTPUTS = file;
    const r = await run(flowAt(origin), 'kept1');
    expect(r.error).toBeNull();
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ '01-create.title': 'kept1' });
  }, 120_000);

  it('fails a save the app did not keep, naming the step, the value and the record', async () => {
    app.state.lossy = true;
    const r = await run(flowAt(origin), 'lost1');
    expect(r.error).toMatch(/^persistence: 01-create typed "lost1", the record at http:\/\/127\.0\.0\.1:\d+\/items\/lost1 does not show it after reload/);
  }, 120_000);

  it('SITELOOPER_NO_PROBES=1 turns the probe off', async () => {
    app.state.lossy = true;
    process.env.SITELOOPER_NO_PROBES = '1';
    const r = await run(flowAt(origin), 'lost2');
    expect(r.error).toBeNull();
  }, 120_000);

  it('fails a run that left an asked output unreported (PARTIAL), still publishing what it found', async () => {
    app.state.lossy = false;
    const file = path.join(dir, 'partial-outputs.json');
    process.env.SITELOOPER_SPEC_OUTPUTS = file;
    const r = await run(flowAt(origin, { report: true }), 'part1');
    expect(r.error).toBe(`PARTIAL: 01-create: ${givenPartialReason('owner')}`);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ '01-create.title': 'part1' });
  }, 120_000);

  it('SITELOOPER_ALLOW_PARTIAL=1 keeps the old warning-only behaviour', async () => {
    app.state.lossy = false;
    process.env.SITELOOPER_ALLOW_PARTIAL = '1';
    const r = await run(flowAt(origin, { report: true }), 'part2');
    expect(r.error).toBeNull();
    expect(r.outputs?.['01-create.title']).toBe('part2');
    expect(r.outputs?.['01-create.owner']).toBeUndefined();
  }, 120_000);
});
