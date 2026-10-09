/**
 * Recovering omitted work (src/skills/flow.ts supersededLater and the placed
 * Flow.omitted; src/spec/ir.ts `recover` action; src/spec/rerecord.ts
 * insertOmittedStep, dropRecoveredOmission; the loop is in build-converge.test.ts).
 *
 * Kimai hbkm3-n1 (test/fixture/hbkm3-n1-script.jsonl, the published recording,
 * whole): "Update and save the order number and order date…" set PO-4471 and
 * the date, reported blocked (the date was not shown), and its re-issue
 * failed. The timesheet instruction succeeded, then a NEW instruction fixed
 * the date only. The flow kept neither of the first two, so nothing in it
 * ever entered the order number, and the compiled spec passed without it
 * (results/rbkm2: obj 4 FAIL, orderNumber=(none)).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry } from '../src/daemon/recorder.js';
import { buildFlow, omittedStepId, omittedWork, type Flow } from '../src/skills/flow.js';
import { SkillStore } from '../src/skills/store.js';
import { omittedToRecover } from '../src/spec/converge.js';
import { flowToSpec } from '../src/spec/ir.js';
import { RerecordError, dropRecoveredOmission, insertOmittedStep } from '../src/spec/rerecord.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-omitted-'));
  process.env.SITELOOPER_SKILLS_DIR = path.join(tmp, 'skills');
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const KM = 'http://127.0.0.1:8105';

describe('kimai hbkm3-n1: the order number lived only in two dropped instructions', () => {
  const entries = parseScript(fs.readFileSync(path.join(__dirname, 'fixture', 'hbkm3-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;
  const flow = buildFlow(entries, { name: 'hbkm3', origin: KM, startUrl: `${KM}/en/login`, vars: { runid: 'hbkm3-n1' }, session: 's' })!;

  it('the flow leaves the instruction out, once, and says where it belongs', () => {
    expect(flow.steps.map((s) => s.id)).toEqual(['01-signin', '02-find', '03-create', '04-verify', '05-create', '06-verify']);
    expect(flow.omitted).toHaveLength(1);
    const w = flow.omitted![0];
    expect(w).toMatchObject({ status: 'failure', after: '04-verify', step: '04b-verify' });
    // Referenced as a step's instruction is: the run's name is a var, the task's values are not.
    expect(w.text).toContain("'{{runid}} Bench Project'");
    expect(w.text).toContain("'PO-4471'");
    expect(w.instruction).toContain("'hbkm3-n1 Bench Project'");
  });

  it('compile hands build the step to put back', () => {
    const d = flowToSpec(flow, new SkillStore(path.join(tmp, 'skills')), {}).diagnostics.filter((x) => x.code === 'omitted-work');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('warning');
    expect(d[0].action).toEqual({ command: 'recover', args: ['04-verify', flow.omitted![0].text], step: '04b-verify' });
    expect(omittedToRecover(d)).toEqual({ step: '04b-verify', after: '04-verify', instruction: flow.omitted![0].text });
  });

  it('the step goes in after 04-verify, unrecorded, and no other id moves', () => {
    const put = insertOmittedStep(flow, '04b-verify', '04-verify', flow.omitted![0].text!);
    expect(put.steps.map((s) => s.id)).toEqual(['01-signin', '02-find', '03-create', '04-verify', '04b-verify', '05-create', '06-verify']);
    expect(put.steps[4]).toEqual({ id: '04b-verify', instruction: flow.omitted![0].text, outputs: [], recorded: {}, adopted: true });
    // Still named as missing until it is pinned, and a second attempt adds nothing.
    expect(put.omitted).toEqual(flow.omitted);
    expect(insertOmittedStep(put, '04b-verify', '04-verify', 'x')).toBe(put);
    expect(() => insertOmittedStep(flow, '09b-set', '09-open', 'x')).toThrow(RerecordError);
  });

  it('once the step is pinned the omission is gone, and compile asks for nothing', () => {
    const put = insertOmittedStep(flow, '04b-verify', '04-verify', flow.omitted![0].text!);
    const done = dropRecoveredOmission(put, '04b-verify');
    expect(done.omitted).toBeUndefined();
    expect(dropRecoveredOmission(done, '04b-verify')).toBe(done);
    // A pinned step of that id whose omission is still listed asks for no second step.
    const pinned: Flow = { ...put, steps: put.steps.map((s) => (s.id === '04b-verify' ? { ...s, skill: 's_abc123' } : s)) };
    const d = flowToSpec(pinned, new SkillStore(path.join(tmp, 'skills')), {}).diagnostics.filter((x) => x.code === 'omitted-work');
    expect(d).toHaveLength(1);
    expect(d[0].action).toBeUndefined();
  });
});

describe('omitted work a later step already carries is not put back', () => {
  const ORIGIN = 'http://127.0.0.1:9000';
  const form = `${ORIGIN}/projects/7/edit`;
  const fill = (id: string, value: string, url = form): RecordedEntry =>
    ({ k: 'step', tool: 'fill', args: { target: `#${id}`, value }, locators: { target: { chain: [{ kind: 'id', selector: `#${id}` }] } }, diff: { url, alerts: [], added: ['x'] } }) as unknown as RecordedEntry;
  const pick = (name: string, url = form): RecordedEntry =>
    ({ k: 'step', tool: 'click', args: { target: name }, locators: { target: { chain: [{ kind: 'role', role: 'option', name }] } }, diff: { url, alerts: [], added: [] } }) as unknown as RecordedEntry;
  const instr = (text: string, url = form): RecordedEntry => ({ k: 'instruction', text, url }) as RecordedEntry;
  const report = (status: string): RecordedEntry => ({ k: 'report', status, summary: status, values: {} }) as RecordedEntry;
  const signin: RecordedEntry[] = [instr('Sign in', `${ORIGIN}/login`), fill('user', 'admin', `${ORIGIN}/login`), report('success')];
  /** [superseded, undone] of the one omitted instruction. */
  const verdict = (blocked: RecordedEntry[], later: RecordedEntry[]) => {
    const w = omittedWork([...signin, instr('Set the fields'), ...blocked, report('blocked'), instr('Open the list', `${ORIGIN}/projects`), fill('q', 'zz', `${ORIGIN}/projects`), report('success'), instr('Finish'), ...later, report('success')], ['run-9']);
    expect(w).toHaveLength(1);
    return w[0].superseded;
  };

  it('a value no later step entered is work the flow lost', () => {
    expect(verdict([fill('number', 'PO-4471'), fill('date', '11/15/2026')], [fill('date', '11/15/2026')])).toBe(false);
    // …typed rather than filled is the same entry.
    const typed = { ...(fill('date', '11/15/2026') as unknown as Record<string, unknown>), tool: 'type', args: { target: '#date', text: '11/15/2026' } } as unknown as RecordedEntry;
    expect(verdict([fill('number', 'PO-4471'), fill('date', '11/15/2026')], [typed])).toBe(false);
  });

  it('every value entered again later: superseded', () => {
    expect(verdict([fill('number', 'PO-4471'), fill('date', '11/15/2026')], [fill('number', 'PO-4471'), fill('date', '11/15/2026')])).toBe(true);
  });

  it("a value entered again that carries the run's own name: the later step made that record itself", () => {
    expect(verdict([fill('name', 'run-9 Bench Project'), fill('budget', '500')], [fill('name', 'run-9 Bench Project')])).toBe(true);
  });

  it('an in-place pick made again on the same page would toggle back', () => {
    expect(verdict([pick('bug'), fill('title', 'T')], [pick('bug')])).toBe(true);
    // …but the same control name on another page is another control.
    // (a step is on the page the one before it left the browser on)
    const other = `${ORIGIN}/timesheets/new`;
    expect(verdict([pick('Save'), fill('title', 'T')], [fill('hours', '2', other), pick('Save', other)])).toBe(false);
  });

  it('picks and openers alone are never put back', () => {
    expect(verdict([pick('bug')], [fill('other', 'v')])).toBe(true);
  });

  it('names the step after the one it followed, lettered', () => {
    expect(omittedStepId('04-verify', 'Update and save the order number; verify it')).toBe('04b-verify');
    expect(omittedStepId('12-open', 'Set the status', 1)).toBe('12c-set');
    expect(omittedStepId(null, 'Create a project')).toBe('00b-create');
  });
});
