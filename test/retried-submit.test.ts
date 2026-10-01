import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { dropRetriedSubmits } from '../src/skills/retried-submit.js';

/**
 * espocrm fwec18-luna-n1 03-create (round 81), n1 script lines 73-102
 * verbatim. Save (#81) was refused in the browser four times — no request,
 * the url held, Amount emptied — and the model refilled Amount and saved
 * again each time, then clicked into it, typed the amount (#90) and saved
 * (#92: a POST carrying #90, answered 200, on the new record). Compiled
 * whole, the first Save expected the create form; on n2 and n3 it took at
 * once, the url gate stopped on the record, and the model finished the step.
 */
let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-retried-submit-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const text = fs.readFileSync(path.join(__dirname, 'fixture', 'fwec18-n1-03-create.jsonl'), 'utf8');
const entries = (): RecordedEntry[] => parseScript(text).entries.filter((e) => !(e.k === 'step' && e.failed));
const steps = (): RecordedStep[] => entries().filter((e): e is RecordedStep => e.k === 'step');
const SAVE = (s: RecordedStep) => s.tool === 'click' && JSON.stringify(s.locators.target?.chain?.[0] ?? '').includes('opportunity-edit-');
const AMOUNT = (s: RecordedStep) => JSON.stringify(s.locators.target?.chain?.[0] ?? '').includes('data-name=\\"amount\\"');

describe('a submit the recording had to retry compiles to the attempt that took (fwec18 03-create)', () => {
  it('drops the refused Saves and the refills a later refill supersedes, and keeps the remedy', () => {
    const all = steps();
    expect(all.filter(SAVE).length).toBe(5);
    const kept = dropRetriedSubmits(all);
    expect(kept.filter(SAVE).length).toBe(1);
    expect(kept.filter(SAVE)[0]).toBe(all.filter(SAVE).at(-1));
    // Amount: the first fill, the last fill before the first Save, and the typed remedy.
    expect(kept.filter((s) => AMOUNT(s) && (s.tool === 'fill' || s.tool === 'type')).map((s) => s.tool)).toEqual(['fill', 'fill', 'type']);
    // Reads and the focus click stay.
    expect(kept.filter((s) => s.tool === 'read' && AMOUNT(s)).length).toBe(all.filter((s) => s.tool === 'read' && AMOUNT(s)).length);
    expect(kept.some((s) => s.tool === 'click' && AMOUNT(s))).toBe(true);
  });

  it('compiles one Save, which mints the record and expects its page', () => {
    const es = entries();
    const report = es[es.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    const instruction = (es[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
    const [create] = compileSkills({ entries: es, instruction, report: { status: 'success', summary: report.summary, evidence: { values: report.values } }, session: 'fwec18', knownValues: { runid: 'fwec18-luna-n1' } });
    const saves = create.steps.filter((s) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes('opportunity-edit-'));
    expect(saves.length).toBe(1);
    const last = create.steps.at(-1)!;
    expect(last).toBe(saves[0]);
    expect(last.mints).toBeDefined();
    expect(last.expect?.urlPattern).toMatch(/#Opportunity\/view\/\{\{d1\}\}$/);
    expect(create.steps.every((s) => s === last || !s.expect?.urlPattern || s.expect.urlPattern.endsWith('#Opportunity/create'))).toBe(true);
  });
});

describe('a retried submit is left as recorded when the evidence does not hold', () => {
  const clone = (): RecordedStep[] => JSON.parse(JSON.stringify(steps()));
  const firstAttempt = (all: RecordedStep[]) => all.indexOf(all.filter(SAVE)[0]);

  // The typed remedy is in every stretch the rule could take, so changing it refuses them all.
  it('a remedy with another value', () => {
    const all = clone();
    all.findLast((s) => s.tool === 'type' && AMOUNT(s))!.args.text = '12600';
    expect(dropRetriedSubmits(all).filter(SAVE).length).toBe(5);
  });

  it('a remedy on a field first set inside the stretch', () => {
    const all = clone();
    all.findLast((s) => s.tool === 'type' && AMOUNT(s))!.locators.target!.chain = [{ kind: 'css', selector: 'input[data-name="probability"]' }];
    expect(dropRetriedSubmits(all).filter(SAVE).length).toBe(5);
  });

  // A refill that changes the value starts a new stretch after it: only the attempts past it are dropped.
  it('a changed refill keeps the attempts before it', () => {
    const all = clone();
    const k = all.findIndex((s, i) => i > firstAttempt(all) && s.tool === 'fill' && AMOUNT(s));
    all[k].args.value = '12600';
    const kept = dropRetriedSubmits(all);
    expect(kept.filter(SAVE).length).toBe(3);
    expect(kept).toContain(all[k]);
  });

  it('a final write that did not carry the last refill', () => {
    const all = clone();
    const typed = all.findLast((s) => s.tool === 'type' && AMOUNT(s))!;
    typed.journal!.w = 999_999;
    expect(dropRetriedSubmits(all).filter(SAVE).length).toBe(5);
  });

  it('a final write the app refused', () => {
    const all = clone();
    for (const s of all) for (const e of [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])]) if (e.k === 'req' && e.m === 'POST') e.s = 422;
    expect(dropRetriedSubmits(all).filter(SAVE).length).toBe(5);
  });

  // gitea fwgt32-luna #125/#128: one picker item clicked twice with only reads between — a toggle, not a retry.
  it('nothing re-entered after the last refused attempt', () => {
    const all = clone();
    const lastAttempt = all.indexOf(all.filter(SAVE).at(-2)!);
    const kept = all.filter((s, i) => i <= lastAttempt || SAVE(s) || s.tool === 'read' || s.tool === 'screenshot');
    expect(dropRetriedSubmits(kept).filter(SAVE).length).toBe(5);
  });

  it('a recording with no journal', () => {
    const all = clone().map((s) => ({ ...s, journal: undefined }));
    expect(dropRetriedSubmits(all).length).toBe(all.length);
  });
});
