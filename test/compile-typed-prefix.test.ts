import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';

function step(tool: string, args: Record<string, unknown>, chain: RecordedStep['locators']['target']['chain'] = [], extra: Partial<RecordedStep> = {}): RecordedStep {
  return { k: 'step', tool, args, locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain } } : {}, ...extra };
}

/**
 * Piece Q (odoo fwod94): the model typed a PREFIX of the instruction's
 * customer name ("fwod94-n1 Bench") into the combobox and clicked the option
 * carrying the full name. The typed text is a token of the instruction, so it
 * got a slot of its own; the instruction substitution then let the longer
 * customer-name slot swallow it, the slot was dropped for having no template
 * marker, and its literal — run 1's runid — was re-inlined into the type step.
 * The runid's var slot, which binds on every run, never got a look at it.
 */
describe('a typed prefix swallowed by a longer slot is re-slotted with the survivors (Piece Q)', () => {
  const runid = 'fwod94-n1';
  const customer = `${runid} Bench Customer`;
  const instruction = `On the new quotation form, set the customer to '${customer}' and save.`;
  const url = 'http://127.0.0.1:8069/odoo/action-1/new';
  const entries: RecordedEntry[] = [
    { k: 'instruction', text: instruction, url, fingerprint: [1, 0, 0] },
    step('type', { target: '@e1', text: `${runid} Bench` }, [{ kind: 'role', role: 'combobox', name: 'Customer' }], {
      diff: { url, added: [`- option "${customer}"`, `- option "Create \\"${runid} Bench\\""`], removed: [], alerts: [] },
    }),
    step('click', { target: '@e2' }, [{ kind: 'role', role: 'option', name: customer }], {
      diff: { url, added: [], removed: [], alerts: [] },
    }),
  ];
  const compile = () =>
    compileSkills({
      entries,
      instruction,
      report: { status: 'success', summary: 'Customer set.', evidence: { values: {} } },
      session: 's',
      knownValues: { 'var:runid': runid, 'output:i1:contact_name': customer },
    });

  it('types "{{vN}} Bench" with the runid var slot, never run 1\'s literal', () => {
    const skills = compile();
    expect(skills).toHaveLength(1);
    const [skill] = skills;
    const runSlot = Object.entries(skill.params).find(([, p]) => p.binding === 'var:runid')?.[0];
    const nameSlot = Object.entries(skill.params).find(([, p]) => p.binding === 'output:i1:contact_name')?.[0];
    expect(runSlot).toBeDefined();
    expect(nameSlot).toBeDefined();
    expect(skill.steps[0].args.text).toBe(`{{${runSlot}}} Bench`);
    // The option click still names the whole customer.
    expect(skill.steps[1].locators.target?.[0]).toMatchObject({ kind: 'role', name: `{{${nameSlot}}}` });
    // The var slot is USED by the type step now, and no step carries the runid.
    expect(skill.params[runSlot as string].usedIn).toContain(1);
    expect(JSON.stringify(skill.steps)).not.toContain(runid);
    // The template binds as before: the customer slot, the runid swallowed.
    expect(skill.template).toBe(`On the new quotation form, set the customer to '{{${nameSlot}}}' and save.`);
    // Only the two bindable params: the prefix slot itself stays dropped.
    expect(Object.keys(skill.params).sort()).toEqual([nameSlot, runSlot].sort());
  });

  it('a dropped slot with no surviving slot inside it is still re-inlined as its literal', () => {
    // No runid var: "Acme Bench" is typed, swallowed by the output slot, and
    // no surviving value occurs in it — the recorded literal stands.
    const instr = "Set the customer to 'Acme Bench Customer' and save.";
    const [skill] = compileSkills({
      entries: [
        { k: 'instruction', text: instr, url, fingerprint: [1, 0, 0] },
        step('type', { target: '@e1', text: 'Acme Bench' }, [{ kind: 'role', role: 'combobox', name: 'Customer' }], { diff: { url, added: [], removed: [], alerts: [] } }),
        step('click', { target: '@e2' }, [{ kind: 'role', role: 'option', name: 'Acme Bench Customer' }], { diff: { url, added: [], removed: [], alerts: [] } }),
      ],
      instruction: instr,
      report: { status: 'success', summary: 'ok', evidence: { values: {} } },
      session: 's',
      knownValues: { 'output:i1:contact_name': 'Acme Bench Customer' },
    });
    expect(skill.steps[0].args.text).toBe('Acme Bench');
  });
});
