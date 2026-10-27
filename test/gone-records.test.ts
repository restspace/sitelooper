import { describe, expect, it } from 'vitest';
import type { RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

/**
 * StepExpectation.goneContains (repairdesk fwrd63 s_1758ad): a gesture whose
 * recorded removals include a record carrying this run's own value keeps
 * those lines, so both runners wait for them to go before the next step reads
 * the page. The browser half is test/gone-records.browser.test.ts.
 */
const url = 'http://x.test/#/tickets/7';
const step = (tool: string, name: string, added: string[], removed?: string[], extra: Partial<RecordedStep> = {}): RecordedStep => ({
  k: 'step',
  tool,
  args: { target: '@e' },
  locators: { target: { expr: 'x', verified: true, raw: '@e', chain: [{ kind: 'role', role: 'button', name }] } },
  diff: { url, alerts: [], added, ...(removed ? { removed } : {}), dialect: 2 },
  ...extra,
});
const instruction = "delete the part 'Bench Part A' and report the parts table";
const compileAll = (steps: RecordedStep[]): SkillStep[] =>
  compileSkills({ entries: [{ k: 'instruction', text: instruction, url }, ...steps], instruction, report: { status: 'success', summary: 'ok' }, session: 't', knownValues: { 'var:part': 'Bench Part A' } }).flatMap((s) => s.steps);
const dialog = ['- dialog "Confirm"', '- heading "Confirm"', '- button "Cancel"', '- button "Delete part"'];
const read: RecordedStep = { k: 'step', tool: 'read', args: { target: 'tbody', what: 'text', label: 'parts' }, locators: { target: { expr: 'tbody', verified: true, raw: 'tbody', chain: [{ kind: 'css', selector: 'tbody' }] } }, result: 'No parts on this ticket yet.' };

describe('a confirm that took a record away waits for it to go', () => {
  it('keeps the removed row and cell naming the run value', () => {
    const steps = compileAll([
      step('click', 'Delete', dialog),
      step('click', 'Delete part', ['- cell "No parts on this ticket yet."'], [...dialog, '- row "Bench Part A $150.00 Edit Delete"', '- cell "Bench Part A"', '- cell "$150.00"']),
      read,
    ]);
    const confirm = steps.find((s) => s.tool === 'click' && JSON.stringify(s.locators).includes('Delete part'))!;
    expect(confirm.expect?.goneContains).toEqual(['- row "{{v1}} $150.00 Edit Delete"', '- cell "{{v1}}"']);
    // never a dismissal: the click is the procedure's work, not a step to skip
    expect(confirm.expect?.removedContains).toBeUndefined();
    expect(confirm.expect?.lineDialect).toBe(2);
  });

  it('a removal naming nothing of this run is not waited for', () => {
    const steps = compileAll([
      step('click', 'Delete', dialog),
      step('click', 'Delete part', [], [...dialog, '- row "Seed part $10.00"', '- cell "Seed part"']),
      read,
    ]);
    const confirm = steps.find((s) => s.tool === 'click' && JSON.stringify(s.locators).includes('Delete part'))!;
    expect(confirm.expect?.goneContains).toBeUndefined();
  });

  it('a gesture that moved to another page template keeps nothing', () => {
    const steps = compileAll([
      step('click', 'Delete', dialog),
      step('click', 'Delete part', [], [...dialog, '- cell "Bench Part A"'], { fingerprintAfter: [0.1, 0.2] }),
      read,
    ]);
    const confirm = steps.find((s) => s.tool === 'click' && JSON.stringify(s.locators).includes('Delete part'));
    expect(confirm?.expect?.goneContains).toBeUndefined();
  });
});

describe('the artifact waits for the same records', () => {
  it('passes the recorded removals to the shared effectExpectation', () => {
    const flow: SpecFlow = {
      version: 1,
      name: 'gone',
      origin: 'http://x.test',
      startUrl: 'http://x.test/',
      vars: ['part'],
      steps: [{
        id: '01-delete', instruction: 'delete {{part}}', params: { v1: '{{part}}' }, outputs: [],
        segments: [{
          id: 's_gone', template: 'delete {{v1}}',
          params: { v1: { example: 'Bench Part A', usedIn: [1], known: true } },
          preconditions: { urlPattern: 'http://x.test/' },
          steps: [
            { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role' as const, role: 'button', name: 'Delete part' }] }, expect: { goneContains: ['- cell "{{v1}}"'], lineDialect: 2 } },
          ],
        }],
      }],
    } as SpecFlow;
    const { source } = emitFlowFile(flow, { tier: 'plain' });
    expect(source).toMatch(/expect: effectExpectation\(page, \[\], p, 2, \['- cell "\{\{v1\}\}"'\]\)/);
  });
});
