import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { keyPicks, pickedByKey } from '../src/skills/key-pick.js';

/**
 * odoo fwod88-n1 08-open (round 63), n1 script lines 199-247 verbatim. At
 * line 230 (seq 230) the model pressed Enter ON the cancel wizard's own
 * button (`.o_dialog button[name="action_cancel"]`): the journal's own window
 * shows the click the key made — `hit c button "Cancel"` — and then, as the
 * order became Cancelled, the status bar's radio "Sales Order" losing
 * aria-checked. keyPicks (round 62, gitea fwgt13) read that as a keyboard
 * PICK of radio "Sales Order", and compile replaced the press with
 * `click role=radio[name="Sales Order"]`: on n2 that radio was disabled, the
 * click was refused, 08-open fell to the model.
 */
let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-key-activation-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const text = fs.readFileSync(path.join(__dirname, 'fixture', 'fwod88-n1-08-open.jsonl'), 'utf8');
const entries = (): RecordedEntry[] => parseScript(text).entries;
const steps = (): RecordedStep[] => entries().filter((e): e is RecordedStep => e.k === 'step');
const enter = (): RecordedStep => steps().find((s) => s.tool === 'press' && s.args.key === 'Enter')!;

describe('a key that ACTIVATED a control is not a pick (fwod88 08-open seq 230)', () => {
  it('the Enter on the wizard button names no option', () => {
    expect(enter().args.target).toBe('.o_dialog button[name="action_cancel"]');
    expect(pickedByKey(enter())).toBeNull();
  });

  it('keyPicks finds no pick in the instruction', () => {
    expect([...keyPicks(steps()).values()]).toEqual([]);
  });

  it('compile keeps the press on the button, and never clicks the status-bar radio', () => {
    const es = entries().filter((e) => !(e.k === 'step' && e.failed));
    const report = es[es.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    const instruction = (es[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
    const compiled = compileSkills({ entries: es, instruction, report: { status: 'success', summary: report.summary, evidence: { values: report.values } }, session: 'fwod88', knownValues: {} }).flatMap((s) => s.steps);
    expect(compiled.some((s) => s.tool === 'click' && JSON.stringify(s.locators?.target ?? []).includes('"name":"Sales Order"'))).toBe(false);
    const press = compiled.find((s) => s.tool === 'press' && s.args.key === 'Enter');
    expect(press?.args.target).toBe('.o_dialog button[name="action_cancel"]');
    expect(press?.picks).toBeUndefined();
  });
});
