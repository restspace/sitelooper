/**
 * Frame and page context through compile (ROBUSTNESS.md finding 5): a target
 * recorded inside an iframe keeps its frame path beside its chain, two
 * identical controls in different frames never fold into one loop or merge
 * into one procedure, a popup/close/tab switch is a segment seam gated on the
 * page the procedure continues on, and only a procedure that carries any of
 * it is stamped contract 3.
 */
import { describe, expect, it } from 'vitest';
import type { LocatorExpr, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, foldLoops, samePageContexts, sameProcedure } from '../src/skills/compile.js';
import { contractFor, isVerified, type SkillStep } from '../src/skills/store.js';
import type { FramePath } from '../src/execution/context.js';

const ORIGIN = 'http://127.0.0.1:4100';
const PAYMENT: FramePath = [{ selectors: ['iframe[title="Payment"]', 'iframe[src*="/frames/inner"]'], title: 'Payment' }];

function locator(name: string, frame?: FramePath): Record<string, LocatorExpr> {
  return { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name }], ...(frame ? { frame } : {}) } };
}

function click(name: string, extra: Partial<RecordedStep> = {}, frame?: FramePath): RecordedStep {
  return { k: 'step', tool: 'click', args: { target: '@e1' }, locators: locator(name, frame), ...extra };
}

const REPORT = { status: 'success' as const, summary: 'done', evidence: { values: {} } };

function compile(steps: RecordedStep[], url = `${ORIGIN}/frames`) {
  const entries: RecordedEntry[] = [{ k: 'instruction', text: 'save the payment', url }, ...steps];
  return compileSkills({ entries, instruction: 'save the payment', report: REPORT, session: 't', now: '2026-09-14T00:00:00.000Z' });
}

describe('compile: frame context', () => {
  it('carries a recorded frame path onto the step as contexts.target, and stamps the procedure contract 3', () => {
    const [skill] = compile([click('Save', {}, PAYMENT)]);
    expect(skill.steps[0].contexts).toEqual({ target: { frame: PAYMENT } });
    // nothing of the frame leaks into the chain the identity guard reads
    expect(JSON.stringify(skill.steps[0].locators)).not.toContain('Payment');
    expect(skill.contract).toBe(3);
    expect(skill.stats.verifiedContract).toBe(3);
  });

  it('leaves a main-frame recording exactly as it was: no contexts, contract 2', () => {
    const [skill] = compile([click('Save')]);
    expect(skill.steps[0].contexts).toBeUndefined();
    expect(skill.steps[0].page).toBeUndefined();
    expect(skill.contract).toBe(2);
    // a validated contract-2 procedure stays verified under this build
    expect(isVerified({ ...skill, status: 'validated' })).toBe(true);
  });

  it('never folds identical controls in different frames into one loop', () => {
    const inFrame = (id: string): SkillStep => ({
      tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'testid', attr: 'data-testid', value: `del-${id}` }] }, contexts: { target: { frame: PAYMENT } },
    });
    const onPage = (id: string): SkillStep => ({ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'testid', attr: 'data-testid', value: `del-${id}` }] } });
    expect(foldLoops([inFrame('1'), inFrame('2')])[0]).toMatchObject({ tool: 'loop', whileContext: { frame: PAYMENT } });
    expect(foldLoops([inFrame('1'), onPage('2')]).map((s) => s.tool)).toEqual(['click', 'click']);
  });

  it('does not call the same Save in the page and in the frame the same procedure', () => {
    const [framed] = compile([click('Save', {}, PAYMENT)]);
    const [plain] = compile([click('Save')]);
    expect(sameProcedure(framed, plain)).toBe(false);
    expect(samePageContexts(framed, plain)).toBe(false);
    expect(samePageContexts(framed, structuredClone(framed))).toBe(true);
  });
});

describe('compile: page effects', () => {
  it('splits a segment at a popup, and again at the close that returns to the opener', () => {
    const skills = compile(
      [
        click('Open approval', { effect: { kind: 'popup' }, afterUrl: `${ORIGIN}/popup/child` }),
        click('Approve', { page: 1, effect: { kind: 'close' }, afterUrl: `${ORIGIN}/opener` }),
        click('After'),
      ],
      `${ORIGIN}/opener`,
    );
    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.preconditions.urlPattern)).toEqual([`${ORIGIN}/opener`, `${ORIGIN}/popup/child`, `${ORIGIN}/opener`]);
    expect(skills[0].steps[0].effect).toEqual({ kind: 'popup', urlPattern: `${ORIGIN}/popup/child` });
    expect(skills[1].steps[0]).toMatchObject({ page: 1, effect: { kind: 'close' } });
    expect(skills[2].steps[0].page).toBeUndefined();
    expect(skills.map((s) => s.contract)).toEqual([3, 3, 2]);
    expect(new Set(skills.map((s) => s.seq?.chain)).size).toBe(1);
  });

  it('never folds or coalesces a step that moves the procedure to another page', () => {
    const tab = (to: number): SkillStep => ({ tool: 'tabs', args: { switch_to: to }, locators: {}, effect: { kind: 'switch', to } });
    expect(contractFor([tab(1)])).toBe(3);
    const popupClick = (id: string): SkillStep => ({ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'testid', attr: 'data-testid', value: `open-${id}` }] }, effect: { kind: 'popup' } });
    expect(foldLoops([popupClick('1'), popupClick('2')]).map((s) => s.tool)).toEqual(['click', 'click']);
  });
});
