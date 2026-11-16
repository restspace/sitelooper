/**
 * A declared fix-up from end to end: recorded through the real `fixup` tool,
 * compiled, and run by both runners against a real app, with the mistake it
 * repairs present and absent.
 *
 * The app (test/fixture/order-server.mjs) is erpnext fwen10-fr in miniature:
 * an order whose Widget line was saved twice. The recording declares the
 * repair ("Widget appears twice"), ticks row 2, deletes it, and submits.
 *  - Replayed where the duplicate is there, the repair runs: one Widget goes.
 *  - Replayed where it is not, the repair is skipped: nothing is deleted, the
 *    order is still submitted, and the run says the fix-up was not needed.
 *  - The same steps WITHOUT the declaration, where there is no duplicate,
 *    delete the Gadget — the false pass this exists to stop.
 * The daemon replays the compiled skill; the artifact is the same skill
 * emitted as a `.flow.ts` and run under plain Playwright.
 *
 * Each part was built and tested against hand-written inputs (fixup-record,
 * compile-fixup, fixup-replay); this is the one place the recorder's real
 * output goes through compile into both runners.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/fixup-e2e.browser.test.ts --pool=forks --poolOptions.forks.maxForks=1
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { wellFormedFixup } from '../src/execution/fixup.js';
import { compileSkills } from '../src/skills/compile.js';
import type { ReplayResult } from '../src/skills/replay.js';
import type { Skill, SkillStep } from '../src/skills/store.js';
import { runSpecCheck } from '../src/spec/check.js';
import { emitFlowFile, emitSpecFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

interface OrderState {
  rows: string[];
  deleted: string[];
  submitted: boolean;
}

d('a declared fix-up, recorded, compiled and run by both runners', () => {
  let app: ChildProcess;
  let origin = '';
  let home = '';
  let session: BrowserSession;
  let page: Page;
  let skill: Skill;
  let specDir = '';

  // One connection per request, and one retry: a compiled-spec run blocks this
  // process's event loop for seconds (spawnSync), and a kept-alive socket the
  // fixture closed meanwhile is reset on the next request.
  const ask = async (pathname: string, method = 'GET'): Promise<string> => {
    const once = async () => (await fetch(`${origin}${pathname}`, { method, headers: { connection: 'close' } })).text();
    try {
      return await once();
    } catch {
      return once();
    }
  };
  const reset = async (dup: boolean) => {
    await ask(`/reset?dup=${dup ? 1 : 0}`, 'POST');
  };
  const state = async (): Promise<OrderState> => JSON.parse(await ask('/state')) as OrderState;
  const tool = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const replay = async (procedure: Skill, dup: boolean): Promise<ReplayResult> => {
    await reset(dup);
    await page.goto(`${origin}/`);
    session.learn!.put(procedure);
    return (await tool('run_skill', { id: procedure.id, params: {} })).replay as ReplayResult;
  };

  beforeAll(async () => {
    app = spawn(process.execPath, [path.resolve('test/fixture/order-server.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    const port = await new Promise<number>((resolve, reject) => {
      app.stdout!.on('data', (chunk) => {
        const m = /listening (\d+)/.exec(String(chunk));
        if (m) resolve(Number(m[1]));
      });
      app.once('exit', (code) => reject(new Error(`order fixture exited ${code}`)));
    });
    origin = `http://127.0.0.1:${port}`;
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-fixup-e2e-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    process.env.SITELOOPER_COMPONENTS_FILE = path.join(home, 'components.json');
    session = new BrowserSession({ session: `fixup-e2e-${Date.now()}`, persist: false, learn: true });
    page = await session.getPage();
    specDir = fs.mkdtempSync(path.resolve('test/.fixup-e2e-'));
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    app?.kill();
    delete process.env.SITELOOPER_HOME;
    delete process.env.SITELOOPER_SKILLS_DIR;
    delete process.env.SITELOOPER_COMPONENTS_FILE;
    if (home) fs.rmSync(home, { recursive: true, force: true });
    if (specDir) {
      expect(path.dirname(specDir)).toBe(path.resolve('test'));
      expect(path.basename(specDir)).toMatch(/^\.fixup-e2e-/);
      fs.rmSync(specDir, { recursive: true, force: true });
    }
  });

  it('records the repair through the fixup tool and compiles it into one skill, whole', async () => {
    await reset(true);
    await page.goto(`${origin}/`);
    const instruction = 'submit the order';
    session.script!.beginInstruction(instruction, { url: page.url() });
    const declared = await tool('fixup', { reason: 'the order has the Widget row twice; delete the second', target: 'a:has-text("Widget")', state: 'count', count: 2 });
    expect(declared.isError, declared.result).toBe(false);
    expect((await tool('click', { target: '#row2' })).isError).toBe(false);
    const removed = await tool('click', { target: '#delete' });
    expect(removed.result).toContain('fix-up g1 complete');
    expect((await tool('click', { target: '#submit' })).isError).toBe(false);
    // The recording did what the task asked.
    expect(await state()).toEqual({ rows: ['Widget', 'Gadget'], deleted: ['Widget'], submitted: true });

    const entries: RecordedEntry[] = [{ k: 'instruction', text: instruction, url: `${origin}/` }, ...session.script!.stepsThisInstruction()];
    const skills = compileSkills({ entries, instruction, report: { status: 'success', summary: 'submitted', evidence: { values: {} } }, session: 'fixup-e2e', now: '2026-11-11T00:00:00.000Z' });
    expect(skills).toHaveLength(1);
    skill = skills[0];
    const shape = skill.steps.map((s: SkillStep) => [s.tool, s.guard?.id ?? null, s.guarded ?? null, s.guardEnd ?? null]);
    expect(shape).toEqual([
      ['wait_for', 'g1', null, null],
      ['click', null, 'g1', null],
      ['click', null, 'g1', true],
      ['click', null, null, null],
    ]);
    expect(wellFormedFixup(skill.steps, 0)).toBe(true);
    expect(skill.steps[0].guard!.reason).toBe('the order has the Widget row twice; delete the second');
    // Compile carried it: nothing dissolved (other passes may leave notes of their own).
    expect((skill.provenance.transforms ?? []).map((t) => t.name)).not.toContain('dissolveFixup');
  }, 120_000);

  describe('the daemon', () => {
    it('runs the repair where the duplicate is there', async () => {
      const result = await replay(skill, true);
      expect(result.ok, result.reason).toBe(true);
      expect(result.lines.join('\n')).toContain('fix-up applies');
      expect(await state()).toEqual({ rows: ['Widget', 'Gadget'], deleted: ['Widget'], submitted: true });
    }, 60_000);

    it('skips the repair where there is nothing to repair, deletes nothing, and still submits', async () => {
      const result = await replay(skill, false);
      expect(result.ok, result.reason).toBe(true);
      expect(result.fallthroughs).toBe(0);
      expect(result.warnings.join('\n')).toContain('fix-up not needed, 2 step(s) skipped');
      expect(await state()).toEqual({ rows: ['Widget', 'Gadget'], deleted: [], submitted: true });
    }, 60_000);

    it('the same steps without the declaration delete a real row there (what the fix-up stops)', async () => {
      const undeclared: Skill = {
        ...skill,
        id: 's_undecl',
        steps: skill.steps.filter((s) => !s.guard).map(({ guarded: _guarded, guardEnd: _guardEnd, ...rest }) => rest as SkillStep),
      };
      await replay(undeclared, false);
      const after = await state();
      expect(after.deleted).toEqual(['Gadget']);
      expect(after.rows).toEqual(['Widget']);
    }, 60_000);
  });

  describe('the compiled spec', () => {
    const compile = (): string => {
      const flow: SpecFlow = {
        version: 1,
        name: 'order',
        origin,
        startUrl: `${origin}/`,
        vars: [],
        steps: [
          {
            id: '01-submit',
            instruction: 'submit the order',
            params: {},
            outputs: [],
            segments: [{ id: skill.id, template: skill.template, params: skill.params, preconditions: { urlPattern: skill.preconditions.urlPattern }, steps: skill.steps }],
          },
        ],
      };
      const flowFile = path.join(specDir, 'order.flow.ts');
      fs.writeFileSync(flowFile, emitFlowFile(flow, { tier: 'plain' }).source);
      fs.writeFileSync(path.join(specDir, 'order.spec.ts'), emitSpecFile(flow));
      return flowFile;
    };
    it('runs the repair where the duplicate is there', async () => {
      const flowFile = compile();
      await reset(true);
      const run = runSpecCheck({ flowFile, isolated: true });
      expect(run.passed, run.error ?? '').toBe(true);
      expect(await state()).toEqual({ rows: ['Widget', 'Gadget'], deleted: ['Widget'], submitted: true });
    }, 300_000);

    it('skips the repair where there is nothing to repair, deletes nothing, and still submits', async () => {
      const flowFile = compile();
      await reset(false);
      const run = runSpecCheck({ flowFile, isolated: true });
      expect(run.passed, run.error ?? '').toBe(true);
      expect(await state()).toEqual({ rows: ['Widget', 'Gadget'], deleted: [], submitted: true });
      // The file carries the line both runners log for a skipped fix-up.
      expect(fs.readFileSync(flowFile, 'utf8')).toContain('[sitelooper skip] ${fixupSkipped(');
    }, 300_000);
  });
});
