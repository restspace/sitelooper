import { describe, expect, it } from 'vitest';
import { contractWeakening, expectationLoss } from '../src/skills/contract.js';
import { SKILL_CONTRACT, type Skill, type SkillStep } from '../src/skills/store.js';

/**
 * Invariant 7: learning cannot weaken correctness.
 *
 * Locator repair, pattern generalisation and fallback promotion all rewrite a
 * stored procedure in place, and all of them exist to keep a procedure working
 * as a page moves. None of that is licence to assert less than the recording
 * proved. A weakening is not automatically wrong — generalising a url segment
 * that demonstrated volatility is a real improvement — but it may not happen
 * silently, and it may not carry over a validated status won under the
 * stronger promise.
 */
const step = (over: Partial<SkillStep> = {}): SkillStep => ({
  tool: 'click',
  args: { target: '@e1' },
  locators: { target: [{ kind: 'role', role: 'button', name: 'Delete' }] },
  expect: { urlPattern: 'http://app.test/x', alertContains: 'Sure?', addedContains: ['- text "Deleted"'] },
  ...over,
});

const skill = (over: Partial<Skill> = {}): Skill => ({
  id: 's_1',
  origin: 'http://app.test',
  template: 'delete {{v1}}',
  params: {},
  preconditions: { urlPattern: 'http://app.test/records/1', requireText: ['{{v1}}'] },
  goal: { requireText: ['Deleted'] },
  steps: [step()],
  stats: { uses: 2, successes: 2, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0, verifiedContract: SKILL_CONTRACT },
  status: 'validated',
  contract: SKILL_CONTRACT,
  provenance: { session: 's', instruction: 'delete it', created: 't' },
  ...over,
});

describe('contractWeakening', () => {
  it('passes an edit that changes only how a control is found', () => {
    const before = skill();
    const after = skill({
      steps: [step({ locators: { target: [{ kind: 'css', selector: '#del' }, { kind: 'role', role: 'button', name: 'Delete' }] } })],
    });
    // A promoted fallback is the same promises, found a different way.
    expect(contractWeakening(before, after)).toEqual([]);
  });

  it('does not call a STRONGER contract a weakening', () => {
    const before = skill();
    const after = skill({
      preconditions: { urlPattern: 'http://app.test/records/1', requireText: ['{{v1}}', '{{v2}}'] },
      steps: [step({ expect: { ...step().expect, addedContains: ['- text "Deleted"', '- text "Gone"'] } })],
    });
    expect(contractWeakening(before, after)).toEqual([]);
  });

  it('catches an assertion the step no longer makes', () => {
    expect(contractWeakening(skill(), skill({ steps: [step({ expect: undefined })] }))).toEqual([
      'step 1: the step no longer asserts anything about the page it produced',
    ]);
    const partial = skill({ steps: [step({ expect: { urlPattern: 'http://app.test/x' } })] });
    expect(contractWeakening(skill(), partial).join(' ')).toMatch(/no longer asserts alert "Sure\?", page text/);
  });

  it('catches an identity the procedure will no longer require', () => {
    const loosened = skill({ preconditions: { urlPattern: 'http://app.test/records/1', requireText: [] } });
    expect(contractWeakening(skill(), loosened)).toEqual([
      'no longer requires the page to show "{{v1}}" before it runs',
    ]);
  });

  /**
   * The generalisation `run_skill` performs after a replay. It is a real
   * improvement and it is also, precisely, a promise made weaker: the
   * procedure will now start on pages it would previously have refused.
   */
  it('catches a widened start pattern', () => {
    const wider = skill({ preconditions: { urlPattern: 'http://app.test/records/{{*}}', requireText: ['{{v1}}'] } });
    expect(contractWeakening(skill(), wider)).toEqual([
      'widened the page it will start on from http://app.test/records/1 to http://app.test/records/{{*}}',
    ]);
    // ...and narrowing it back is not a weakening.
    expect(contractWeakening(wider, skill())).toEqual([]);
  });

  it('catches a loop handed authority it was not given', () => {
    const loop = (over: Partial<SkillStep>) =>
      skill({ steps: [{ tool: 'loop', args: {}, locators: {}, while: [{ kind: 'css', selector: '.row' }], max: 2, scope: 'observed', body: [step()], ...over }] });
    expect(contractWeakening(loop({}), loop({ scope: 'drain' }))).toEqual([
      'step 1: widened its loop from the work that was observed to draining every match',
    ]);
    expect(contractWeakening(loop({}), loop({ max: 7 }))).toEqual(['step 1: raised its loop cap from 2 to 7']);
    // A weakening inside the loop BODY is still a weakening.
    expect(contractWeakening(loop({}), loop({ body: [step({ expect: undefined })] })).join(' ')).toMatch(
      /loop step 1: the step no longer asserts anything/,
    );
  });

  /**
   * `mints` is how recovery knows a record already exists. Losing it is how a
   * recovered run creates a second one.
   */
  it('catches a step that stops declaring it creates a record', () => {
    const before = skill({ steps: [step({ mints: { at: 'id' } })] });
    expect(contractWeakening(before, skill({ steps: [step()] }))).toEqual([
      'step 1: no longer records that it creates a record',
    ]);
  });

  it('catches a dropped step and a dropped goal', () => {
    expect(contractWeakening(skill(), skill({ steps: [] }))).toEqual(['step 1 was dropped']);
    // Two losses, and they are genuinely different: the specific state text
    // is gone, and so is the procedure's ability to be found already done.
    expect(contractWeakening(skill(), skill({ goal: undefined }))).toEqual([
      'no longer treats "Deleted" as the state this procedure produces',
      'no longer says what state it produces, so it can never be found already done',
    ]);
  });

  it('reports expectation loss on its own, for the spec-repair path that shares it', () => {
    expect(expectationLoss(undefined, undefined)).toBeNull();
    expect(expectationLoss({ urlPattern: 'u' }, { urlPattern: 'u' })).toBeNull();
    expect(expectationLoss({ urlPattern: 'u' }, undefined)).toMatch(/no longer asserts anything/);
  });

  /**
   * A step re-recorded in dialect 2 names a `<label for>` input where dialect
   * 1 named it `""`. That is the same promise in the new spelling: comparing
   * the two spellings line by line would call every such re-record a loss and
   * strip the procedure's validation for it.
   */
  it('compares page lines only within one dialect, and still catches a step that asserts none any more', () => {
    const v1 = { addedContains: ['- textbox "": {{v1}}'] };
    const v2 = { addedContains: ['- textbox "Email": {{v1}}'], lineDialect: 2 as const };
    expect(expectationLoss(v1, v2)).toBeNull();
    expect(expectationLoss(v1, { lineDialect: 2, urlPattern: 'u' })).toBe('no longer asserts page text "- textbox \\"\\": {{v1}}"');
    // within one dialect, a dropped line is still a dropped line
    expect(expectationLoss(v2, { addedContains: ['- button "Save"'], lineDialect: 2 })).toBe('no longer asserts page text "- textbox \\"Email\\": {{v1}}"');
    expect(expectationLoss(v1, { addedContains: [] })).toMatch(/page text/);
  });
  /**
   * notes/ROBUSTNESS.md finding 5: where a target lives is part of what a step
   * promises. The same chain resolved from the page instead of the recorded
   * frame can press the page's own identical Save, and a step that no longer
   * follows the popup it opened runs its successors on the opener.
   */
  it('catches a dropped or changed frame, a dropped page effect, and a dropped page check', () => {
    const frame = [{ selectors: ['iframe[title="Payment"]'], title: 'Payment' }];
    const framed = step({ contexts: { target: { frame } }, page: 1, effect: { kind: 'popup' } });
    expect(contractWeakening(skill({ steps: [framed] }), skill({ steps: [framed] }))).toEqual([]);
    expect(contractWeakening(skill({ steps: [framed] }), skill({ steps: [step()] }))).toEqual([
      'step 1: no longer looks for its target inside the recorded frame iframe[title="Payment"]',
      'step 1: no longer follows the popup it recorded',
      'step 1: no longer checks that it runs on page 1 of the browser',
    ]);
    const moved = step({ contexts: { target: { frame: [{ selectors: ['iframe[title="Checkout"]'], title: 'Checkout' }] } }, page: 1, effect: { kind: 'popup' } });
    expect(contractWeakening(skill({ steps: [framed] }), skill({ steps: [moved] }))).toEqual([
      'step 1: looks for its target in iframe[title="Checkout"] instead of the recorded frame iframe[title="Payment"]',
    ]);
    // gaining a frame is not a weakening
    expect(contractWeakening(skill({ steps: [step()] }), skill({ steps: [framed] }))).toEqual([]);
  });
});
