/**
 * When a flow step may call itself a SUCCESS (src/daemon/step-verdict.ts,
 * round 55 items 12 and 13), judged against round 54's own flow runs.
 *
 * test/fixture/round54-steps.json holds every step of the n2/n3 flow runs of
 * the nine round-54 runs — the five green apps (fwrd87, fwgr68, fwgt7, fwvk7,
 * fwgh10) and fwec8, fwkb39, fwop10, fwsi7 — with exactly what the verdict
 * reads: whether the model drove the step, the outputs it declares, the keys
 * it reported, and the labels of the reads its replay SKIPPED (recovered from
 * the published warnings and the skills' steps). fwop10-n2 02-create's failed
 * final click is restated from its own summary (the flow run predates
 * InstructionResult.unfinishedGesture).
 *
 * The browser case (BP_BROWSER_TESTS=1) checks the loop really reports a
 * failed last gesture, since the fixture can only restate it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage, Completion, Provider, ToolDef } from '../src/agent/llm.js';
import { partialReasons } from '../src/daemon/step-verdict.js';

interface Round54Step {
  run: string;
  replay: string;
  green: boolean;
  step: string;
  reportStatus: 'success' | 'failure' | 'blocked';
  recovered: boolean;
  declaredOutputs: string[];
  reported: string[];
  skippedReads: string[];
  unfinishedGesture?: { tool: string; args: string };
}

const STEPS = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'round54-steps.json'), 'utf8')) as Round54Step[];

const verdict = (s: Round54Step) =>
  partialReasons({
    reportStatus: s.reportStatus,
    recovered: s.recovered,
    unfinishedGesture: s.unfinishedGesture,
    skippedReads: s.skippedReads,
    declaredOutputs: s.declaredOutputs,
    values: Object.fromEntries(s.reported.map((k) => [k, 'x'])),
  });

describe('which round-54 steps are PARTIAL', () => {
  it('covers every step of the nine runs', () => {
    expect(STEPS.length).toBe(74);
  });

  it('flags exactly fwop10-n2 02-create and fwsi7 05-open (both replays)', () => {
    const flagged = STEPS.filter((s) => verdict(s).length).map((s) => `${s.run} ${s.replay} ${s.step}`);
    expect(flagged).toEqual(['fwop10 n2 02-create', 'fwsi7 n2 05-open', 'fwsi7 n3 05-open']);
  });

  it('flips no step of the five green apps', () => {
    const green = STEPS.filter((s) => s.green);
    expect(new Set(green.map((s) => s.run))).toEqual(new Set(['fwrd87', 'fwgr68', 'fwgt7', 'fwvk7', 'fwgh10']));
    expect(green.filter((s) => verdict(s).length)).toEqual([]);
  });
});

/**
 * Round 56: RepairDesk fwrd88, OpenProject fwop11 and Kanboard fwkb40 replayed every step at
 * tier A, verified every objective on n1-n3, and still ended "partial".
 * test/fixture/round56-steps.json holds their 26 n2/n3 steps, built like the
 * round-54 fixture — with an UNPROVEN read's skip left out, as replay now
 * reports it.
 */
const STEPS56 = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'round56-steps.json'), 'utf8')) as Round54Step[];

describe('round 56: fwop11, fwrd88 and fwkb40', () => {
  it('fwop11 02-create is clean: its only skip was a synthesized read no run has ever resolved (the vanished success toast)', () => {
    const create = STEPS56.filter((s) => s.run === 'fwop11' && s.step === '02-create');
    expect(create.map((s) => s.replay)).toEqual(['n2', 'n3']);
    for (const s of create) {
      expect(s.declaredOutputs).toContain('confirmation_alert');
      expect(s.skippedReads).toEqual([]);
      expect(verdict(s)).toEqual([]);
    }
  });

  it('fwrd88 05-change stays partial — deservedly: replay skipped a COUNT read that matched nothing instead of observing 0', () => {
    // s_4b0e31 step 11: read_all role=alert what:count, recorded "0". Nothing
    // matching IS the observation (count 0); the replay's resolve-miss branch
    // skips it instead, and the artifact does the same. The rule reports that
    // defect; it is fixed in the runners, not by excusing the skip here.
    const change = STEPS56.filter((s) => s.run === 'fwrd88' && s.step === '05-change');
    expect(change.map((s) => s.replay)).toEqual(['n2', 'n3']);
    for (const s of change) expect(verdict(s)).toEqual([
      "the procedure's read of alerts_present_after_success, an output this step reports, was skipped (nothing matched on the page), so alerts_present_after_success went unreported",
    ]);
  });

  it('fwkb40 04-add is clean: the same kind of skip — a synthesized sidebar-link read no run has ever resolved', () => {
    // s_a3f839 step 11: read sidebar_action_add_comment, target @synth,
    // unproven — a guess at the "Add a comment" link the recording's report
    // named, never an observation (and never asked for by the instruction).
    // fwkb40 ran on e48d1a1, before this exemption.
    const add = STEPS56.filter((s) => s.run === 'fwkb40' && s.step === '04-add');
    expect(add.map((s) => s.replay)).toEqual(['n2', 'n3']);
    for (const s of add) {
      expect(s.declaredOutputs).toContain('sidebar_action_add_comment');
      expect(s.skippedReads).toEqual([]);
      expect(verdict(s)).toEqual([]);
    }
  });

  it('nothing else in the three apps is partial', () => {
    expect(STEPS56.filter((s) => verdict(s).length).map((s) => `${s.run} ${s.replay} ${s.step}`)).toEqual(['fwrd88 n2 05-change', 'fwrd88 n3 05-change']);
  });

  it('round 54 is unchanged: exactly fwop10-n2 02-create and fwsi7 05-open', () => {
    expect(STEPS.filter((s) => verdict(s).length).map((s) => `${s.run} ${s.replay} ${s.step}`)).toEqual(['fwop10 n2 02-create', 'fwsi7 n2 05-open', 'fwsi7 n3 05-open']);
  });
});

/** Round 57, Snipe-IT fwsi9 (10 n2/n3 steps): no step is partial; the re-pin fixes of round 57 change no verdict. */
const STEPS57 = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'round57-steps.json'), 'utf8')) as Round54Step[];

describe('round 57: fwsi9', () => {
  it('flags no step', () => {
    expect(STEPS57.length).toBe(10);
    expect(STEPS57.filter((s) => verdict(s).length)).toEqual([]);
  });
});

describe('item 12: a recovery whose last gesture never went through (fwop10-n2 02-create)', () => {
  const step = () => STEPS.find((s) => s.run === 'fwop10' && s.replay === 'n2' && s.step === '02-create')!;

  it('is partial, and says which gesture', () => {
    const [why] = verdict(step());
    expect(why).toMatch(/last click \("Submit comment"\) did not go through/);
  });

  it('is decided by the executor, not by unreported outputs: without the failed gesture it is clean', () => {
    // Its eight "unreported" outputs are reported under the model's own names
    // (work_package_subject for subject, …): not a reason on their own.
    const s = { ...step(), unfinishedGesture: undefined };
    expect(s.declaredOutputs.filter((o) => !s.reported.includes(o)).length).toBe(8);
    expect(verdict(s)).toEqual([]);
  });

  it('only a recovery: a zero-model step answers for itself through its gates', () => {
    expect(partialReasons({ reportStatus: 'success', recovered: false, unfinishedGesture: { tool: 'click', args: '@e1' }, declaredOutputs: [], values: {} })).toEqual([]);
  });

  it('never re-judges a step that did not report success', () => {
    expect(partialReasons({ reportStatus: 'blocked', recovered: true, unfinishedGesture: { tool: 'click', args: '@e1' }, declaredOutputs: [], values: {} })).toEqual([]);
  });
});

describe('item 13: a zero-model step that skipped the read of an output it declares (fwsi7 05-open)', () => {
  it('is partial, naming the output', () => {
    const s = STEPS.find((x) => x.run === 'fwsi7' && x.replay === 'n2' && x.step === '05-open')!;
    expect(verdict(s)).toEqual([
      "the procedure's read of checked_out_to_user, an output this step reports, was skipped (nothing matched on the page), so checked_out_to_user went unreported",
    ]);
  });

  it('an ECHO-dropped read is not a skip (fwgr68 03-open, fwkb39, fwrd87 03-add, fwvk7 02-create)', () => {
    const s = STEPS.find((x) => x.run === 'fwgr68' && x.replay === 'n2' && x.step === '03-open')!;
    expect(s.declaredOutputs.filter((o) => !s.reported.includes(o))).toContain('new_panel_title');
    expect(s.skippedReads).toEqual([]);
    expect(verdict(s)).toEqual([]);
  });

  it('a skipped read whose value the step reported anyway is not a miss (fwrd87 04-add bench_run_tag)', () => {
    const s = STEPS.find((x) => x.run === 'fwrd87' && x.replay === 'n2' && x.step === '04-add')!;
    expect(s.skippedReads).toEqual(['bench_run_tag']);
    expect(s.reported).toContain('bench_run_tag');
    expect(verdict(s)).toEqual([]);
  });

  it('a skipped read of something the step does not declare is not a miss', () => {
    expect(partialReasons({ reportStatus: 'success', recovered: false, skippedReads: ['scratch_read'], declaredOutputs: ['title'], values: { title: 'x' } })).toEqual([]);
  });
});

/** Provider stub that plays back scripted tool calls. */
function scripted(script: Array<Array<{ name: string; args: Record<string, unknown> }>>): Provider {
  let i = 0;
  return {
    model: 'stub',
    async complete(_m: ChatMessage[], _t: ToolDef[]): Promise<Completion> {
      const calls = script[Math.min(i++, script.length - 1)].map((c, j) => ({ id: `c${i}-${j}`, name: c.name, args: c.args, rawArgs: JSON.stringify(c.args) }));
      return {
        text: null,
        toolCalls: calls,
        assistantMessage: { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.rawArgs } })) },
        usage: { promptTokens: 10, completionTokens: 1, cachedTokens: 0 },
        served: null,
      };
    },
  };
}

const browserEnabled = process.env.BP_BROWSER_TESTS === '1';
(browserEnabled ? describe : describe.skip)('the loop reports a success whose last gesture failed', () => {
  let home: string;
  let session: import('../src/daemon/browser.js').BrowserSession;
  const loopOpts = { maxTurns: 6, timeoutMs: 60_000, screenshotDir: os.tmpdir() };
  const report = { name: 'report', args: { status: 'success', summary: 'comment added' } };

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-honesty-'));
    process.env.SITELOOPER_HOME = home;
    const { BrowserSession } = await import('../src/daemon/browser.js');
    session = new BrowserSession({ session: 'honesty', persist: false });
    const page = await session.getPage();
    await page.setContent('<textarea id="comment"></textarea><button id="post">Post</button><button id="submit" disabled>Submit comment</button>');
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const run = async (script: Array<Array<{ name: string; args: Record<string, unknown> }>>) => {
    const { runInstruction } = await import('../src/agent/loop.js');
    const { SessionState } = await import('../src/daemon/state.js');
    return runInstruction(scripted(script), session, new SessionState(`honesty-${Math.random()}`), 'add a comment', loopOpts);
  };

  it('fwop10-n2: the final click was not dispatched, then success', async () => {
    const result = await run([[{ name: 'fill', args: { target: '#comment', value: 'hello' } }], [{ name: 'click', args: { target: '#nothing-here' } }], [report]]);
    expect(result.report.status).toBe('success');
    expect(result.unfinishedGesture).toEqual({ tool: 'click', args: expect.stringContaining('#nothing-here') });
  }, 60_000);

  it('a failed gesture a later one redid is not unfinished', async () => {
    const result = await run([[{ name: 'click', args: { target: '#nothing-here' } }], [{ name: 'click', args: { target: '#post' } }], [report]]);
    expect(result.unfinishedGesture).toBeUndefined();
  }, 60_000);

  it('a replay names the labelled reads it skipped (fwsi7 05-open), and not the ones it took', async () => {
    const { executeTool } = await import('../src/agent/tools.js');
    const { BrowserSession } = await import('../src/daemon/browser.js');
    const learning = new BrowserSession({ session: 'honesty-reads', persist: false, learn: true });
    try {
      const page = await learning.getPage();
      const file = path.join(home, 'asset.html');
      fs.writeFileSync(file, '<h1 id="title">Bench Asset</h1><table id="history"><tr><td>create</td></tr></table>');
      await page.goto(`file:///${file.replace(/\\/g, '/').replace(/^\//, '')}`);
      const url = page.url();
      learning.learn!.put({
        id: 's_reads',
        origin: new URL(url).origin,
        template: 'report the asset',
        params: {},
        preconditions: { urlPattern: url },
        steps: [
          { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'css', selector: '#title' }] }, label: 'asset_name' },
          { tool: 'read', args: { target: '@e2', what: 'text' }, locators: { target: [{ kind: 'css', selector: '#history tr:nth-of-type(3) a' }] }, label: 'checked_out_to_user' },
        ],
        stats: { uses: 2, successes: 2, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
        status: 'validated',
        provenance: { session: 'honesty', instruction: 'report the asset', created: 't' },
      } as never);
      const out = await executeTool(learning, 'run_skill', { id: 's_reads', params: {} }, os.tmpdir());
      expect(out.replay?.values.asset_name).toBe('Bench Asset');
      expect(out.replay?.skippedReads).toEqual(['checked_out_to_user']);
      // fwop11 02-create (round 56): a SYNTHESIZED read no run has ever
      // resolved (SkillStep.unproven — a guess at the success toast) is not
      // an observation the procedure was built on. Skipping it loses nothing,
      // so it is not a skipped read.
      learning.learn!.update('s_reads', (sk) => ({
        ...sk,
        steps: [
          ...sk.steps,
          { tool: 'read', args: { target: '@synth', what: 'text' }, locators: { target: [{ kind: 'role', role: 'alert', name: 'Successful creation.' }] }, label: 'confirmation_alert', unproven: true },
        ],
      }));
      const again = await executeTool(learning, 'run_skill', { id: 's_reads', params: {} }, os.tmpdir());
      expect(again.replay?.skippedReads).toEqual(['checked_out_to_user']);
    } finally {
      await learning.close();
    }
  }, 60_000);

  it('a batch whose last step failed is unfinished', async () => {
    const result = await run([
      [{ name: 'batch', args: { steps: [{ tool: 'fill', args: { target: '#comment', value: 'hi' } }, { tool: 'click', args: { target: '#nothing-here' } }] } }],
      [report],
    ]);
    expect(result.unfinishedGesture?.tool).toBe('click');
  }, 60_000);
});
