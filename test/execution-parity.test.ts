/**
 * Differential harness: one procedure, two runners.
 *
 * Nearly every correctness finding in CORRECTNESS_PLAN.md is a place where
 * daemon replay and the emitted Playwright artifact disagree — replay
 * advances a cursor where the spec calls `.first()`; replay has a progress
 * guard the spec had nothing like; a gate applies on one side and not the
 * other. Reviewing for those one at a time finds the ones somebody thought
 * to look for. Running the same contract through both against the same
 * application, and comparing what the APPLICATION says happened, finds them
 * mechanically.
 *
 * The oracle is deliberately not either runner's own report: the fixture
 * server keeps a mutation log that only it can write, so "both runners said
 * ok" can never stand in for "the right thing happened once".
 *
 * Opt-in like the other browser suites: BP_BROWSER_TESTS=1.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import type { ReplayResult } from '../src/skills/replay.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

/** What the emitted module exposes that the harness drives directly. */
interface FlowModule {
  FLOW: SpecFlow;
  flowStepIds: readonly string[];
  createFlowRun(): { outputs: Record<string, string | undefined>; drift: string[] };
  steps: Record<
    string,
    (page: unknown, p: Record<string, string>, outputs: Record<string, string | undefined>, run: { outputs: Record<string, string | undefined>; drift: string[] }) => Promise<void>
  >;
}

/** One run's verdict, in the shape both sides can be compared in. */
interface Outcome {
  ok: boolean;
  reason: string | null;
  outputs: Record<string, string>;
}

d('execution parity (daemon replay vs emitted artifact)', () => {
  let server: http.Server;
  let origin: string;
  let items: string[] = [];
  let log: string[] = [];
  let home: string;
  let emitDir: string;

  /**
   * A list with two affordances per row: Remove, which deletes the record and
   * SHRINKS the collection, and Mark, which mutates it in place and leaves the
   * row where it is. The two are the shapes a folded loop comes in, and they
   * need opposite cursor behaviour. Both go through the server, which is the
   * only thing that records them, so a test can ask the application what
   * happened rather than believing a runner.
   */
  const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Items</title></head><body>
<h1>Items</h1>
<ul id="items"></ul>
<script>
async function render() {
  const res = await fetch('/items');
  const names = await res.json();
  document.getElementById('items').innerHTML = names
    .map((n) => '<li class="item">' + n +
      ' <button class="del" type="button" data-id="' + n + '">Remove</button>' +
      ' <button class="mark" type="button" data-id="' + n + '">Mark</button></li>')
    .join('');
}
document.addEventListener('click', async (e) => {
  const del = e.target.closest('.del');
  if (del) {
    await fetch('/delete/' + encodeURIComponent(del.dataset.id), { method: 'POST' });
    del.closest('.item').remove();
    return;
  }
  // Mark mutates the record and leaves the row in place: the collection keeps
  // its size, so only a cursor gets the loop to the next record.
  const mark = e.target.closest('.mark');
  if (mark) await fetch('/mark/' + encodeURIComponent(mark.dataset.id), { method: 'POST' });
});
render();
</script>
</body></html>`;

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-parity-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    // The emitted module imports '@playwright/test', so it has to load from
    // somewhere node resolves the repo's node_modules.
    emitDir = fs.mkdtempSync(path.resolve('test/.parity-'));

    server = http.createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/' ) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(PAGE);
        return;
      }
      if (url === '/items') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(items));
        return;
      }
      if (url.startsWith('/mark/') && req.method === 'POST') {
        log.push(`mark:${decodeURIComponent(url.slice('/mark/'.length))}`);
        res.writeHead(200);
        res.end('ok');
        return;
      }
      if (url.startsWith('/delete/') && req.method === 'POST') {
        const id = decodeURIComponent(url.slice('/delete/'.length));
        log.push(`delete:${id}`);
        items = items.filter((n) => n !== id);
        res.writeHead(200);
        res.end('ok');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server?.close(() => r()));
    delete process.env.SITELOOPER_HOME;
    delete process.env.SITELOOPER_SKILLS_DIR;
    fs.rmSync(home, { recursive: true, force: true });
    expect(path.basename(emitDir)).toMatch(/^\.parity-/);
    fs.rmSync(emitDir, { recursive: true, force: true });
  });

  const reset = (n: number) => {
    items = Array.from({ length: n }, (_, i) => `Item ${i + 1}`);
    log = [];
  };
  beforeEach(() => reset(10));

  /** The one contract both runners execute. */
  const deleteLoop = (max: number, scope: 'observed' | 'drain' = 'drain'): SkillStep[] => {
    const target = [{ kind: 'role' as const, role: 'button', name: 'Remove' }];
    return [{ tool: 'loop', args: {}, locators: {}, body: [{ tool: 'click', args: { target: '@e1' }, locators: { target } }], while: target, max, scope }];
  };

  const skillOf = (steps: SkillStep[]): Skill => ({
    id: 's_parity',
    origin,
    template: 'clear the list',
    params: {},
    preconditions: { urlPattern: `${origin}/` },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 'parity', instruction: 'clear the list', created: 't' },
  });

  const specOf = (steps: SkillStep[]): SpecFlow => ({
    version: 1,
    name: 'parity',
    origin,
    startUrl: `${origin}/`,
    vars: [],
    steps: [
      {
        id: '01-clear',
        instruction: 'clear the list',
        params: {},
        outputs: [],
        segments: [{ id: 's_parity', template: 'clear the list', params: {}, preconditions: { urlPattern: `${origin}/` }, steps }],
      },
    ],
  });

  /** Run the contract through daemon replay, in its own browser session. */
  async function viaReplay(steps: SkillStep[]): Promise<Outcome> {
    const session = new BrowserSession({ session: `parity-replay-${Date.now()}`, persist: false, learn: true });
    try {
      const page = await session.getPage();
      await page.goto(`${origin}/`);
      const skill = skillOf(steps);
      session.learn!.put(skill);
      const out = await executeTool(session, 'run_skill', { id: skill.id, params: {} }, os.tmpdir());
      const replay = out.replay as ReplayResult | undefined;
      // No replay at all means the tool refused before running: surface that
      // rather than letting it read as an ordinary failure.
      if (!replay) return { ok: false, reason: `run_skill returned no replay: ${out.result}`, outputs: {} };
      return { ok: replay.ok, reason: replay.reason ?? null, outputs: replay.values };
    } finally {
      await session.close();
    }
  }

  /**
   * Run the same contract through the artifact the compiler emits. Not
   * `runFlow`, which wraps each step in `test.step` and so needs a Playwright
   * worker: the harness drives `steps[id]` itself, which is the same emitted
   * body and keeps the comparison to one process.
   */
  async function viaEmitted(steps: SkillStep[]): Promise<Outcome> {
    const spec = specOf(steps);
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const file = path.join(emitDir, `flow-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(file, js);
    const mod = (await import(`file://${file.split(path.sep).join('/')}`)) as FlowModule;

    const session = new BrowserSession({ session: `parity-spec-${Date.now()}`, persist: false });
    try {
      const page = await session.getPage();
      await page.goto(mod.FLOW.startUrl);
      const run = mod.createFlowRun();
      for (const id of mod.flowStepIds) {
        await mod.steps[id](page, {}, run.outputs, run);
      }
      return { ok: true, reason: null, outputs: run.outputs as Record<string, string> };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), outputs: {} };
    } finally {
      await session.close();
    }
  }

  /** Run one contract through both runners against separately reset state. */
  async function both(steps: SkillStep[], startWith = 10) {
    reset(startWith);
    const replay = await viaReplay(steps);
    const replayLog = [...log];
    reset(startWith);
    const emitted = await viaEmitted(steps);
    const emittedLog = [...log];
    return { replay, emitted, replayLog, emittedLog };
  }

  /**
   * C01. Ten items, a loop the compiler capped at seven. Neither runner may
   * report success: the list is not cleared. What made this worth a harness
   * is that both used to return ok — for different reasons, from different
   * code — and no single-runner test could see the agreement was wrong.
   */
  it('neither runner calls a capped loop finished with items left', async () => {
    const { replay, emitted, replayLog, emittedLog } = await both(deleteLoop(7), 10);

    expect(replay.ok).toBe(false);
    expect(emitted.ok).toBe(false);
    expect(replay.reason).toMatch(/not finished|still matching/);
    expect(emitted.reason).toMatch(/not finished|still matching/);

    // And they did the same amount of real work, by the server's count.
    expect(replayLog).toHaveLength(7);
    expect(emittedLog).toHaveLength(7);
    expect(new Set(replayLog).size).toBe(7); // seven DIFFERENT items, not one item seven times
    expect(new Set(emittedLog).size).toBe(7);
    expect(items).toHaveLength(3);
  }, 120_000);

  /**
   * The same contract over a list it can finish. Both runners drain it, and
   * each item is deleted exactly once — the property a mutation log can
   * establish and a green tick cannot.
   */
  it('both runners drain a list within the cap, deleting each item once', async () => {
    const { replay, emitted, replayLog, emittedLog } = await both(deleteLoop(10), 5);

    expect(replay.ok).toBe(true);
    expect(emitted.ok).toBe(true);
    expect(replayLog.sort()).toEqual(emittedLog.sort());
    expect(replayLog).toHaveLength(5);
    expect(new Set(replayLog).size).toBe(5);
    expect(items).toHaveLength(0);
  }, 120_000);

  /**
   * C07. A loop bounded to the work that was observed — what the compiler now
   * produces unless the instruction says "all" — deletes exactly that many
   * records and leaves the rest. Records it was never given authority over
   * are not unfinished work, so both runners report success with items left.
   * The contrast with the drain case above is the whole point of the scope.
   */
  it('both runners do exactly the observed work for a bounded loop, and leave the rest', async () => {
    const { replay, emitted, replayLog, emittedLog } = await both(deleteLoop(2, 'observed'), 6);

    expect(replay.ok).toBe(true);
    expect(emitted.ok).toBe(true);
    expect(replayLog).toHaveLength(2);
    expect(emittedLog).toHaveLength(2);
    expect(new Set(replayLog).size).toBe(2);
    expect(new Set(emittedLog).size).toBe(2);
    expect(items).toHaveLength(4);
  }, 120_000);

  /**
   * C01, the other half. An EDIT-IN-PLACE loop: each pass marks a record and
   * the collection does not shrink, so "act on the first match" works record
   * one over and over — three passes, three mutations, all on Item 1, and a
   * green result. The cursor is what makes the body visit each record once,
   * and both runners must now agree on that by the server's own count.
   */
  it('both runners visit each record once when the collection does not shrink', async () => {
    const target = [{ kind: 'role' as const, role: 'button', name: 'Mark' }];
    const markLoop: SkillStep[] = [
      { tool: 'loop', args: {}, locators: {}, while: target, max: 6, body: [{ tool: 'click', args: { target: '@e1' }, locators: { target } }] },
    ];
    const { replay, emitted, replayLog, emittedLog } = await both(markLoop, 3);

    expect(replay.ok).toBe(true);
    expect(emitted.ok).toBe(true);
    // Three records, marked once each — not one record marked three times.
    expect(replayLog.sort()).toEqual(['mark:Item 1', 'mark:Item 2', 'mark:Item 3']);
    expect(emittedLog.sort()).toEqual(['mark:Item 1', 'mark:Item 2', 'mark:Item 3']);
  }, 120_000);
});
