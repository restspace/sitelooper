/**
 * `sitelooper assert` through its whole life, in a real browser (notes/
 * CONTRACT-assert.md): recorded by a learn-mode daemon, exported as a flow
 * step of kind 'assert', replayed by `run` with another var value, failed by
 * an app that shows the wrong thing, compiled to the `.flow.ts` artifact, and
 * re-issued directly against the stored assertion.
 *
 * The seam is the daemon's own command handling (Daemon.execute, the method
 * every request frame reaches): `var`, `open`, `do`, `assert`, `stop
 * --save-flow` and `run` are issued as the CLI issues them. Two things stand
 * in: the model (a scripted provider put where the daemon builds its own; no
 * network, and a call nothing scripted throws) and the socket (the frames
 * are not encoded). The compiled artifact is the real compileFlow output,
 * driven as execution-parity drives one (`test.step` shimmed).
 *
 * The page is a list with an Add form, a sync banner and an owner field.
 * Everything the server's mode changes (the banner's text, its test id, no
 * banner at all, an error alert, another owner) is on the page from load, so
 * it changes nothing the recorded `do` steps check: only an assertion can
 * notice.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/assert-e2e.browser.test.ts
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import type { ChatMessage, Completion, Provider, ToolDef } from '../src/agent/llm.js';
import type { RecordedInstruction, RecordedStep } from '../src/daemon/recorder.js';
import { assertFailureKind } from '../src/execution/assert.js';
import type { Flow } from '../src/skills/flow.js';
import type { FlowRunResult } from '../src/shared/protocol.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

/** What the app shows: as recorded, the banner saying something else, no banner, the banner under another test id, an error alert, another owner. */
type Mode = 'good' | 'wrong' | 'absent' | 'renamed' | 'error' | 'guest';

/** `ref`: the reference this load of the page gives the item it adds (the /refs page only). */
const pageFor = (mode: Mode, ref?: string) => `<!doctype html><html><head><title>Items</title></head><body>
<h1>Items</h1>
${ref ? '<p data-testid="latest" role="note" aria-label="Latest reference">Latest: none</p><p>Reference of the last item: <output data-testid="last-ref" aria-label="Last reference"></output></p>' : ''}
${mode === 'absent' ? '' : `<p data-testid="${mode === 'renamed' ? 'sync-state' : 'sync'}" role="status" aria-label="Sync status">${mode === 'wrong' ? 'Sync failed' : 'Synced'}</p>`}
${mode === 'error' ? '<div id="error" role="alert">Sync error</div>' : ''}
<input id="owner" aria-label="Owner" readonly value="${mode === 'guest' ? 'guest' : 'admin'}">
<form id="add"><input id="name" aria-label="Item name"><button id="add-button">Add</button></form>
<ul id="items" aria-label="Items"></ul>
<script>
document.getElementById('add').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('name');
  const li = document.createElement('li');
  li.setAttribute('data-testid', 'item');
  li.textContent = name.value;
  document.getElementById('items').appendChild(li);
  name.value = '';
  ${ref ? `document.querySelector('[data-testid="last-ref"]').textContent = '${ref}'; document.querySelector('[data-testid="latest"]').textContent = 'Latest: ${ref}';` : ''}
});
</script>
</body></html>`;

type Call = { name: string; args: Record<string, unknown> };
/** One model turn: its tool calls, or how to make them when the turn comes (a value only the page knows by then). */
type Turn = Call[] | (() => Promise<Call[]>);

/** A model that plays back queued turns, counts every call, and throws when asked with nothing queued. */
function scripted() {
  const queue: Turn[] = [];
  const box = { calls: 0 };
  const provider: Provider = {
    model: 'stub',
    async complete(_m: ChatMessage[], _t: ToolDef[]): Promise<Completion> {
      box.calls++;
      const next = queue.shift();
      if (!next) throw new Error('the scripted model was called with nothing scripted');
      const turn = typeof next === 'function' ? await next() : next;
      const calls = turn.map((c, j) => ({ id: `c${box.calls}-${j}`, name: c.name, args: c.args, rawArgs: JSON.stringify(c.args) }));
      return {
        text: null,
        toolCalls: calls,
        assistantMessage: { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.rawArgs } })) },
        usage: { promptTokens: 10, completionTokens: 1, cachedTokens: 0 },
        served: null,
      };
    },
  };
  return { provider, script: (...turns: Turn[]) => void queue.push(...turns), calls: () => box.calls, unplayed: () => queue.length };
}

const report = (status: string, summary: string): Call[] => [{ name: 'report', args: { status, summary } }];
const waitFor = (args: Record<string, unknown>): Call[] => [{ name: 'wait_for', args }];

const ITEM = '[data-testid="item"]';
const SYNC = '[data-testid="sync"]';
const FLOW = 'assert-e2e';
const addFor = (runid: string, what = 'Widget') => `Add an item named '${runid} ${what}' to the list.`;
/** The assertion whose expected text is the run's own value: two text checks. */
const shownFor = (runid: string) => `the list shows '${runid} Widget' and the sync status is Synced`;
/** The other four states in one assertion: a field's value, a count, an absence, the url. */
const STATE = 'the owner is admin, the list has 1 item, no error is showing and the url contains /items';

d('sitelooper assert, end to end', () => {
  let home: string;
  let emitDir: string;
  let server: http.Server;
  let origin: string;
  let mode: Mode = 'good';
  const previous: Record<string, string | undefined> = {};
  const open: Array<{ send: (command: string, args?: Record<string, unknown>) => Promise<any> }> = [];

  /** A learn-mode daemon on its own session, its model replaced by a scripted one; commands go through Daemon.execute. */
  const daemonFor = async (session: string) => {
    const { Daemon } = await import('../src/daemon/server.js');
    const daemon = new Daemon({ session, learn: true }) as any;
    const model = scripted();
    daemon.provider = () => model.provider;
    daemon.fallbackProvider = () => null;
    daemon.recoveryProvider = () => model.provider;
    daemon.systemOne = () => null;
    const progress: string[] = [];
    let id = 0;
    const send = (command: string, args: Record<string, unknown> = {}): Promise<any> => daemon.execute({ id: ++id, command, args }, (m: string) => progress.push(m));
    const handle = { daemon, model, progress, send, page: (): Promise<Page> => daemon.browser.getPage() };
    open.push(handle);
    return handle;
  };

  /** A fresh session (runid declared, as the caller's is) on the start page with `names` added to the list by hand: the state an assertion is asked about. */
  const sessionWithItems = async (session: string, ...names: string[]) => {
    const s = await daemonFor(session);
    await s.send('var', { name: 'runid', value: 'q9' });
    await s.send('open', { url: `${origin}/items` });
    const page = await s.page();
    for (const name of names) {
      await page.fill('#name', name);
      await page.click('#add-button');
    }
    return s;
  };

  /** `run` the exported flow in a fresh session. Nothing is scripted, so a model call throws and is counted. */
  const runFlowIn = async (session: string, pageMode: Mode, runid: string) => {
    mode = pageMode;
    const s = await daemonFor(session);
    const result = (await s.send('run', { name: FLOW, vars: { runid }, escalate: false })) as FlowRunResult;
    return { ...s, result };
  };

  type FlowModule = {
    flowStepIds: readonly string[];
    createFlowRun(): { drift: string[] };
    runFlow(page: unknown, vars: Record<string, string>, options?: { run?: { drift: string[] } }): Promise<unknown>;
  };

  /** The flow compiled as `sitelooper compile` compiles it (no diagnostics waived), its `.flow.ts` loaded as execution-parity loads one. */
  const artifactOf = async (flowName: string): Promise<FlowModule> => {
    const { compileFlow } = await import('../src/spec/index.js');
    const { SkillStore } = await import('../src/skills/store.js');
    const compiled = compileFlow(flowName, { store: new SkillStore(), outDir: path.join(home, 'generated') });
    expect(compiled.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
    expect(compiled.refused).toBe(false);
    expect(compiled.compileBlockers).toEqual([]);
    const source = fs.readFileSync(compiled.flowFile!, 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace("from '@playwright/test'", "from './pw-shim.mjs'");
    const file = path.join(emitDir, `${flowName}.flow.mjs`);
    fs.writeFileSync(file, js);
    return (await import(`file://${file.split(path.sep).join('/')}`)) as FlowModule;
  };

  /** The artifact's own runFlow in a fresh browser, on the page as `pageMode` serves it: the Error it threw (or null) and the drift it filed. */
  const runArtifact = async (mod: FlowModule, pageMode: Mode, runid: string): Promise<{ error: Error | null; drift: string[] }> => {
    const { BrowserSession } = await import('../src/daemon/browser.js');
    mode = pageMode;
    const session = new BrowserSession({ session: `assert-e2e-artifact-${pageMode}`, persist: false });
    const run = mod.createFlowRun();
    try {
      await mod.runFlow(await session.getPage(), { runid }, { run });
      return { error: null, drift: run.drift };
    } catch (err) {
      return { error: err as Error, drift: run.drift };
    } finally {
      await session.close();
    }
  };

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-assert-e2e-'));
    for (const k of ['SITELOOPER_HOME', 'SITELOOPER_SKILLS_DIR', 'SITELOOPER_FLOWS_DIR', 'SITELOOPER_COMPONENTS_FILE']) previous[k] = process.env[k];
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    process.env.SITELOOPER_FLOWS_DIR = path.join(home, 'flows');
    process.env.SITELOOPER_COMPONENTS_FILE = path.join(home, 'components.json');
    let refs = 1000;
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      // /refs: the app gives each load's item its own reference, as an app mints a record number.
      res.end(req.url === '/refs' ? pageFor(mode, `IT-${++refs}`) : pageFor(mode));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // The emitted module imports '@playwright/test', so it loads from inside the repo (execution-parity's moduleOf).
    emitDir = fs.mkdtempSync(path.resolve('test/.assert-e2e-'));
    fs.writeFileSync(path.join(emitDir, 'pw-shim.mjs'), "export { expect } from '@playwright/test';\nexport const test = { step: async (_name, fn) => await fn() };\n");
  }, 60_000);

  afterAll(async () => {
    for (const s of open) await s.send('stop').catch(() => {});
    await new Promise((resolve) => server?.close(resolve));
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* a browser profile the OS still holds: a temp dir, left to it */
    }
    expect(path.basename(emitDir)).toMatch(/^\.assert-e2e-/);
    fs.rmSync(emitDir, { recursive: true, force: true });
  }, 60_000);

  it('records passing asserts as assertion skills and flow steps of kind assert; refuses the tautology and the click', async () => {
    mode = 'good';
    const rec = await daemonFor('assert-e2e-rec');
    await rec.send('var', { name: 'runid', value: 'k7' });
    await rec.send('open', { url: `${origin}/items` });

    rec.model.script(
      [{ name: 'fill', args: { target: '#name', value: 'k7 Widget' } }],
      [{ name: 'click', args: { target: '#add-button' } }],
      report('success', 'Added the item to the list.'),
    );
    const added = await rec.send('do', { instruction: addFor('k7'), escalate: false });
    expect(added.report.status).toBe('success');

    // The tautology and the click, in an assertion that never states its expected text.
    const before = rec.model.calls();
    rec.model.script(
      waitFor({ target: SYNC, state: 'text_equals', text: 'Synced' }),
      [{ name: 'click', args: { target: '#add-button' } }],
      report('failure', 'the assertion does not say what the sync status should be'),
    );
    const vague = await rec.send('assert', { instruction: 'the sync status is right', escalate: false });
    expect(vague.report.status).toBe('failure');
    expect(vague.assertions).toEqual([]);
    expect(vague.learned?.compiled).toBeUndefined();
    expect(rec.model.calls() - before).toBe(3);
    const said = JSON.stringify(rec.daemon.state.messages);
    expect(said).toMatch(/\\"Synced\\" is not written in the assertion/);
    expect(said).toMatch(/click is not available: this instruction is an assertion/);
    // The refused click never reached the page: one row, as the `do` left it.
    expect(await (await rec.page()).locator(ITEM).count()).toBe(1);

    rec.model.script(
      waitFor({ target: ITEM, state: 'text_equals', text: 'k7 Widget' }),
      waitFor({ target: SYNC, state: 'text_equals', text: 'Synced' }),
      report('success', 'The list shows k7 Widget and the sync status is Synced.'),
    );
    const shown = await rec.send('assert', { instruction: shownFor('k7'), escalate: false });
    expect(shown.report.status).toBe('success');
    expect(shown.assertions).toEqual([
      { state: 'text_equals', target: ITEM, text: 'k7 Widget', held: true },
      { state: 'text_equals', target: SYNC, text: 'Synced', held: true },
    ]);

    // An assertion that does not hold while recording: one check held, one missed. Not a skill, not a step.
    const offline = "the list shows 'k7 Widget' and the sync status is Offline";
    rec.model.script(
      waitFor({ target: ITEM, state: 'text_equals', text: 'k7 Widget' }),
      waitFor({ target: SYNC, state: 'text_equals', text: 'Offline', timeout_ms: 300 }),
      report('failure', 'the sync status is Synced, not Offline'),
    );
    const missed = await rec.send('assert', { instruction: offline, escalate: false });
    expect(missed.report.status).toBe('failure');
    expect(missed.assertions.map((c: { held: boolean }) => c.held)).toEqual([true, false]);
    expect(missed.learned?.compiled).toBeUndefined();

    rec.model.script(
      waitFor({ target: '#owner', state: 'value_equals', text: 'admin', timeout_ms: 1500 }),
      waitFor({ target: ITEM, state: 'count', count: 1, timeout_ms: 1500 }),
      waitFor({ target: '#error', state: 'hidden', timeout_ms: 1500 }),
      waitFor({ state: 'url_contains', text: '/items', timeout_ms: 1500 }),
      report('success', 'The owner is admin, one item is listed, no error shows and the url is /items.'),
    );
    const state = await rec.send('assert', { instruction: STATE, escalate: false });
    expect(state.report.status).toBe('success');
    expect(state.assertions.map((c: { state: string; held: boolean }) => [c.state, c.held])).toEqual([['value_equals', true], ['count', true], ['hidden', true], ['url_contains', true]]);

    // Work goes on after the assertions: an ordinary step, its own, with nothing of theirs in it.
    rec.model.script(
      [{ name: 'fill', args: { target: '#name', value: 'k7 Gadget' } }],
      [{ name: 'click', args: { target: '#add-button' } }],
      report('success', 'Added the item to the list.'),
    );
    const second = await rec.send('do', { instruction: addFor('k7', 'Gadget'), escalate: false });
    expect(second.report.status).toBe('success');
    expect(rec.model.unplayed()).toBe(0);

    const entries = rec.daemon.browser.script.entries as Array<RecordedInstruction | RecordedStep>;
    expect(entries.filter((e): e is RecordedInstruction => e.k === 'instruction').map((i) => [i.text, i.assert])).toEqual([
      [addFor('k7'), undefined],
      ['the sync status is right', true],
      [shownFor('k7'), true],
      [offline, true],
      [STATE, true],
      [addFor('k7', 'Gadget'), undefined],
    ]);

    const store = rec.daemon.browser.learn;
    const shownSkill = store.get(shown.learned.compiled);
    expect(shownSkill.assert).toBe(true);
    expect(shownSkill.steps.map((st: { tool: string }) => st.tool)).toEqual(['wait_for', 'wait_for']);
    // Every check carries the caller's sentence as the skill's template, the run's value slotted.
    for (const st of shownSkill.steps) expect(st.assert).toEqual({ message: shownSkill.template });
    expect(shownSkill.template).not.toContain('k7');
    const stateSkill = store.get(state.learned.compiled);
    expect(stateSkill.assert).toBe(true);
    expect(stateSkill.steps.map((st: { args: { state: string } }) => st.args.state)).toEqual(['value_equals', 'count', 'hidden', 'url_contains']);
    expect(store.list(origin).filter((sk: { assert?: boolean }) => sk.assert)).toHaveLength(2);

    const stopped = await rec.send('stop', { saveFlow: FLOW });
    expect(stopped.flow.error).toBeUndefined();
    const flow = JSON.parse(fs.readFileSync(stopped.flow.path, 'utf8')) as Flow;
    expect(flow.vars).toEqual(['runid']);
    expect(flow.steps.map((s) => [s.id, s.kind, s.skill])).toEqual([
      ['01-add', undefined, added.learned.compiled],
      ['02-assert', 'assert', shown.learned.compiled],
      ['03-assert', 'assert', state.learned.compiled],
      ['04-add', undefined, second.learned.compiled ?? second.learned.merged],
    ]);
    for (const acting of [flow.steps[0], flow.steps[3]]) expect(store.get(acting.skill).assert).toBeUndefined();
    expect(flow.steps[1].instruction).toBe("the list shows '{{runid}} Widget' and the sync status is Synced");
    for (const step of flow.steps.slice(1, 3)) {
      expect(step.outputs).toEqual([]);
      expect(step.adopted).toBeUndefined();
    }
  }, 120_000);

  it('replays the flow with another var value: both assert steps pass with no model turn, and a flow exported from the run keeps their kind', async () => {
    const { result, model, send } = await runFlowIn('assert-e2e-pass', 'good', 'q9');
    expect(result.status).toBe('success');
    expect(result.steps.map((s) => [s.id, s.status, s.turns, s.tier])).toEqual([
      ['01-add', 'success', 0, 'A'],
      ['02-assert', 'success', 0, 'A'],
      ['03-assert', 'success', 0, 'A'],
      ['04-add', 'success', 0, 'A'],
    ]);
    expect(result.steps[1].summary).toBe(`assertion holds: ${shownFor('q9')}`);
    expect(model.calls()).toBe(0);
    const stopped = await send('stop', { saveFlow: 'assert-e2e-replayed' });
    const again = JSON.parse(fs.readFileSync(stopped.flow.path, 'utf8')) as Flow;
    expect(again.steps.map((s) => s.kind)).toEqual([undefined, 'assert', 'assert', undefined]);
    expect(model.calls()).toBe(0);
  }, 120_000);

  it('fails the assert step when the app shows the wrong text: assert-failed, kind failed, no model, flow halted', async () => {
    const { result, model } = await runFlowIn('assert-e2e-wrong', 'wrong', 'q9');
    expect(result.status).toBe('halted');
    expect(result.passed).toBe(1);
    // Halted AT the assertion: the step after it never ran.
    expect(result.steps.map((s) => [s.id, s.status, s.turns])).toEqual([['01-add', 'success', 0], ['02-assert', 'assert-failed', 0]]);
    const step = result.steps[1];
    expect(step.assert?.kind).toBe('failed');
    expect(step.assert?.message.startsWith(`assertion failed: ${shownFor('q9')} — `)).toBe(true);
    expect(step.assert?.message).toContain('Sync failed');
    expect(step.recovered).toBe(false);
    expect(result.driftTickets ?? []).toEqual([]);
    expect(model.calls()).toBe(0);
  }, 120_000);

  it('fails the assert step as unlocatable when the element is not on the page at all', async () => {
    const { result, model } = await runFlowIn('assert-e2e-absent', 'absent', 'q9');
    expect(result.status).toBe('halted');
    expect(result.steps.map((s) => [s.id, s.status, s.turns])).toEqual([['01-add', 'success', 0], ['02-assert', 'assert-failed', 0]]);
    const step = result.steps[1];
    expect(step.assert?.kind).toBe('unlocatable');
    expect(step.assert?.message.startsWith(`assertion could not be checked: ${shownFor('q9')} — `)).toBe(true);
    // Filed as drift nobody may re-locate: no locator to patch, the miss in `reason`.
    expect(result.driftTickets).toHaveLength(1);
    expect(result.driftTickets![0]).toMatchObject({ step: '02-assert', missedLocator: null, fallbackUsed: null, recovered: false });
    expect(model.calls()).toBe(0);
  }, 120_000);

  it('passes on a recorded fallback locator when the primary is gone, filing drift a repair needs no model for', async () => {
    const { result, model } = await runFlowIn('assert-e2e-renamed', 'renamed', 'q9');
    expect(result.status).toBe('success');
    expect(result.steps.map((s) => [s.id, s.status, s.turns])).toEqual([['01-add', 'success', 0], ['02-assert', 'success', 0], ['03-assert', 'success', 0], ['04-add', 'success', 0]]);
    expect(result.driftTickets).toHaveLength(1);
    expect(result.driftTickets![0]).toMatchObject({ step: '02-assert', key: 'target', recovered: false });
    expect(result.driftTickets![0].missedLocator).toContain('data-testid');
    expect(result.driftTickets![0].fallbackUsed).toContain('Sync status');
    expect(model.calls()).toBe(0);
  }, 120_000);

  it('fails an absence check when the thing is showing, and a field-value check on another value', async () => {
    const error = await runFlowIn('assert-e2e-error', 'error', 'q9');
    expect(error.result.status).toBe('halted');
    expect(error.result.steps.map((s) => [s.id, s.status, s.turns])).toEqual([['01-add', 'success', 0], ['02-assert', 'success', 0], ['03-assert', 'assert-failed', 0]]);
    expect(error.result.steps[2].assert?.kind).toBe('failed');
    expect(error.result.steps[2].assert?.message.startsWith(`assertion failed: ${STATE} — `)).toBe(true);
    expect(error.model.calls()).toBe(0);

    const guest = await runFlowIn('assert-e2e-guest', 'guest', 'q9');
    expect(guest.result.status).toBe('halted');
    expect(guest.result.steps[2]).toMatchObject({ id: '03-assert', status: 'assert-failed', turns: 0, assert: { kind: 'failed' } });
    expect(guest.result.steps[2].assert?.message).toContain('guest');
    expect(guest.model.calls()).toBe(0);
  }, 120_000);

  it('compiles to an artifact whose assert steps pass on the good page and throw the assertion failure on the others', async () => {
    const mod = await artifactOf(FLOW);
    expect(mod.flowStepIds).toEqual(['01-add', '02-assert', '03-assert', '04-add']);
    const runOn = (pageMode: Mode, runid: string) => runArtifact(mod, pageMode, runid);

    expect(await runOn('good', 'z3')).toMatchObject({ error: null });
    // The banner under another test id: found by the recorded role candidate, as the daemon finds it, and said as drift.
    const renamed = await runOn('renamed', 'z3');
    expect(renamed.error).toBeNull();
    expect(renamed.drift).toHaveLength(1);
    expect(renamed.drift[0]).toContain('02-assert');

    const wrong = (await runOn('wrong', 'z3')).error;
    expect(wrong).toBeInstanceOf(Error);
    expect(wrong!.message.startsWith(`assertion failed: ${shownFor('z3')} — `)).toBe(true);
    expect(wrong!.message).toContain('Sync failed');
    expect(assertFailureKind(wrong!.message)).toBe('failed');

    const absent = (await runOn('absent', 'z3')).error;
    expect(absent).toBeInstanceOf(Error);
    expect(absent!.message.startsWith(`assertion could not be checked: ${shownFor('z3')} — `)).toBe(true);
    expect(assertFailureKind(absent!.message)).toBe('unlocatable');

    for (const pageMode of ['error', 'guest'] as const) {
      const err = (await runOn(pageMode, 'z3')).error;
      expect(err).toBeInstanceOf(Error);
      expect(err!.message.startsWith(`assertion failed: ${STATE} — `)).toBe(true);
    }
  }, 240_000);

  it('threads an expected value an earlier step reported: the replay checks this run\'s value, not the recording\'s', async () => {
    mode = 'good';
    const REF_FLOW = 'assert-e2e-ref';
    const LAST = '[data-testid="last-ref"]';
    const rec = await daemonFor('assert-e2e-ref-rec');
    await rec.send('var', { name: 'runid', value: 'k7' });
    await rec.send('open', { url: `${origin}/refs` });
    rec.model.script(
      [{ name: 'fill', args: { target: '#name', value: 'k7 Widget' } }],
      [{ name: 'click', args: { target: '#add-button' } }],
      [{ name: 'read', args: { target: LAST, what: 'text', label: 'item_ref' } }],
      async () => [{ name: 'report', args: { status: 'success', summary: 'Added the item.', evidence: { values: { item_ref: await (await rec.page()).locator(LAST).innerText() } } } }],
    );
    const added = await rec.send('do', { instruction: "Add an item named 'k7 Widget' to the list and report its reference as item_ref.", escalate: false });
    expect(added.report.status).toBe('success');
    const recorded = String(added.report.evidence.values.item_ref);
    expect(recorded).toMatch(/^IT-/);

    rec.model.script(
      waitFor({ target: '[data-testid="latest"]', state: 'text_contains', text: recorded }),
      report('success', `The latest reference is ${recorded}.`),
    );
    const held = await rec.send('assert', { instruction: `the latest reference is ${recorded}`, escalate: false });
    expect(held.report.status).toBe('success');
    const stopped = await rec.send('stop', { saveFlow: REF_FLOW });
    const flow = JSON.parse(fs.readFileSync(stopped.flow.path, 'utf8')) as Flow;
    expect(flow.steps.map((s) => [s.id, s.kind])).toEqual([['01-add', undefined], ['02-assert', 'assert']]);
    // The expected text is the earlier step's output, by reference: nothing of the recording's value is left in the step.
    expect(flow.steps[1].instruction).toBe('the latest reference is {{01-add.item_ref}}');
    expect(JSON.stringify(flow.steps[1])).not.toContain(recorded);

    const run = await daemonFor('assert-e2e-ref-run');
    const result = (await run.send('run', { name: REF_FLOW, vars: { runid: 'q9' }, escalate: false })) as FlowRunResult;
    expect(result.status).toBe('success');
    expect(result.steps.map((s) => [s.id, s.status, s.turns])).toEqual([['01-add', 'success', 0], ['02-assert', 'success', 0]]);
    const minted = String(result.steps[0].values?.item_ref);
    expect(minted).toMatch(/^IT-/);
    expect(minted).not.toBe(recorded);
    expect(await (await run.page()).locator(LAST).innerText()).toBe(minted);
    expect(result.steps[1].summary).toBe(`assertion holds: the latest reference is ${minted}`);
    expect(run.model.calls()).toBe(0);

    // …and the artifact, on a load that mints yet another reference.
    expect(await runArtifact(await artifactOf(REF_FLOW), 'good', 'z3')).toMatchObject({ error: null });
  }, 180_000);

  it('a session of nothing but assertions exports and replays: one sentence issued twice is two steps on one procedure', async () => {
    mode = 'good';
    const ONLY_FLOW = 'assert-e2e-only';
    const sentence = 'the owner is admin';
    const rec = await daemonFor('assert-e2e-only-rec');
    await rec.send('open', { url: `${origin}/items` });
    const check = [waitFor({ target: '#owner', state: 'value_equals', text: 'admin', timeout_ms: 1500 }), report('success', 'The owner field holds admin.')];
    rec.model.script(...check);
    const first = await rec.send('assert', { instruction: sentence, escalate: false });
    expect(first.report.status).toBe('success');
    // Stored once and not yet verified, so the second issue is the model's again; it merges into the first.
    rec.model.script(...check);
    const second = await rec.send('assert', { instruction: sentence, escalate: false });
    expect(second.report.status).toBe('success');
    expect(second.learned.merged ?? second.learned.compiled).toBe(first.learned.compiled);
    expect(rec.daemon.browser.learn.get(first.learned.compiled).assert).toBe(true);
    // Verified by the second success: the third issue is replayed, and the model is not asked.
    const third = await rec.send('assert', { instruction: sentence, escalate: false });
    expect(third.report.status).toBe('success');
    expect(third.turns).toBe(0);
    expect(rec.model.calls()).toBe(4);

    const stopped = await rec.send('stop', { saveFlow: ONLY_FLOW });
    expect(stopped.flow.error).toBeUndefined();
    const flow = JSON.parse(fs.readFileSync(stopped.flow.path, 'utf8')) as Flow;
    expect(flow.steps.map((s) => [s.kind, s.skill, s.instruction])).toEqual([1, 2, 3].map(() => ['assert', first.learned.compiled, sentence]));

    const good = await daemonFor('assert-e2e-only-run');
    const passed = (await good.send('run', { name: ONLY_FLOW, vars: {}, escalate: false })) as FlowRunResult;
    expect(passed.status).toBe('success');
    expect(passed.steps.map((s) => [s.status, s.turns])).toEqual([['success', 0], ['success', 0], ['success', 0]]);
    expect(good.model.calls()).toBe(0);

    mode = 'guest';
    const guest = await daemonFor('assert-e2e-only-guest');
    const failed = (await guest.send('run', { name: ONLY_FLOW, vars: {}, escalate: false })) as FlowRunResult;
    expect(failed.status).toBe('halted');
    expect(failed.steps.map((s) => [s.status, s.turns, s.assert?.kind])).toEqual([['assert-failed', 0, 'failed']]);
    expect(guest.model.calls()).toBe(0);
    // Two failing runs of a broken app are not strikes against the check: it is still verified, and still answers.
    const again = await daemonFor('assert-e2e-only-guest-2');
    expect(((await again.send('run', { name: ONLY_FLOW, vars: {}, escalate: false })) as FlowRunResult).steps[0].status).toBe('assert-failed');
    mode = 'good';
    const after = await daemonFor('assert-e2e-only-after');
    expect(((await after.send('run', { name: ONLY_FLOW, vars: {}, escalate: false })) as FlowRunResult).status).toBe('success');
    expect(after.model.calls()).toBe(0);

    const mod = await artifactOf(ONLY_FLOW);
    expect(await runArtifact(mod, 'good', '')).toMatchObject({ error: null });
    const err = (await runArtifact(mod, 'guest', '')).error;
    expect(err?.message.startsWith(`assertion failed: ${sentence} — `)).toBe(true);
  }, 240_000);

  it('re-issued directly, replays the stored assertion with no model call, and a miss is the answer', async () => {
    mode = 'good';
    const good = await sessionWithItems('assert-e2e-again', 'q9 Widget');
    const held = await good.send('assert', { instruction: shownFor('q9'), escalate: false });
    expect(held.report.status).toBe('success');
    expect(held.turns).toBe(0);
    expect(held.skill.tier).toBe('A');
    expect(held.assertions.map((c: { state: string; text: string; held: boolean }) => [c.state, c.text, c.held])).toEqual([['text_equals', 'q9 Widget', true], ['text_equals', 'Synced', true]]);

    // The caller's value is not the one the list shows: the first check misses, and that is the answer.
    const other = await good.send('assert', { instruction: shownFor('zz'), escalate: false });
    expect(other.report.status).toBe('failure');
    expect(other.report.summary.startsWith(`assertion failed: ${shownFor('zz')} — `)).toBe(true);
    expect(other.turns).toBe(0);
    expect(other.assertFailed.kind).toBe('failed');
    expect(other.assertions.map((c: { held: boolean }) => c.held)).toEqual([false]);
    expect(good.model.calls()).toBe(0);
    // A miss is not a strike against the procedure: it still answers.
    const still = await good.send('assert', { instruction: shownFor('q9'), escalate: false });
    expect(still.report.status).toBe('success');
    expect(good.model.calls()).toBe(0);

    // Two items where the assertion says one. The session's FIRST instruction, and its sentence never states the
    // runid the count check's fallback locator carries: the slot binds from the declared var (server.ts `var`),
    // which is what lets the stored assertion answer instead of the model.
    const two =await sessionWithItems('assert-e2e-again-two', 'q9 Widget', 'r2 Widget');
    const counted = await two.send('assert', { instruction: STATE, escalate: false });
    expect(counted.report.status).toBe('failure');
    expect(counted.assertFailed.kind).toBe('failed');
    expect(counted.assertions.map((c: { state: string; held: boolean }) => [c.state, c.held])).toEqual([['value_equals', true], ['count', false]]);
    expect(two.model.calls()).toBe(0);

    mode = 'wrong';
    const wrong = await sessionWithItems('assert-e2e-again-wrong', 'q9 Widget');
    const missed = await wrong.send('assert', { instruction: shownFor('q9'), escalate: false });
    expect(missed.report.status).toBe('failure');
    expect(missed.report.summary.startsWith(`assertion failed: ${shownFor('q9')} — `)).toBe(true);
    expect(missed.turns).toBe(0);
    expect(missed.assertFailed.kind).toBe('failed');
    expect(missed.assertions.map((c: { held: boolean }) => c.held)).toEqual([true, false]);
    expect(wrong.progress.join('\n')).toMatch(/did not hold at step 2 — returned as the answer, without the model/);
    expect(wrong.model.calls()).toBe(0);

    mode = 'absent';
    const absent = await sessionWithItems('assert-e2e-again-absent', 'q9 Widget');
    const unlocatable = await absent.send('assert', { instruction: shownFor('q9'), escalate: false });
    expect(unlocatable.report.status).toBe('failure');
    expect(unlocatable.assertFailed.kind).toBe('unlocatable');
    expect(absent.model.calls()).toBe(0);
  }, 240_000);
});
