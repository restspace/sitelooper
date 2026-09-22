import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { type TransformNote, compileSkills, cutAtPublishedValue, unfreezeExpectations } from '../src/skills/compile.js';
import { taskConstants } from '../src/skills/flow.js';
import type { SkillStep } from '../src/skills/store.js';

function step(tool: string, args: Record<string, unknown>, chain: RecordedStep['locators']['target']['chain'] = [], extra: Partial<RecordedStep> = {}): RecordedStep {
  return { k: 'step', tool, args, locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain } } : {}, ...extra };
}

/**
 * A read-back whose only anchor is a scoped hasText, beside a positional path:
 * compile's lost-anchor rule empties the chain (and drops the label) once the
 * anchor is stranded, so the anchor surviving is what these tests measure.
 */
function anchoredRead(hasText: string, label: string, result: string): RecordedStep {
  return step(
    'read',
    { target: '(read-back)', what: 'text' },
    [
      { kind: 'scoped', container: '#history tr', hasText, selector: 'td:nth-of-type(6) > a' },
      { kind: 'css', selector: '#history > tbody > tr:nth-of-type(2) > td:nth-of-type(6) > a' },
    ],
    { result: JSON.stringify(result), label },
  );
}

describe('task constants do not strand read anchors (FIX O)', () => {
  // snipeit fwsi4: 04-set was TOLD to check out to 'Bench Assignee' (a seeded
  // user), reported `assignee = "Bench Assignee"`, and 05-open's read of the
  // assignee — anchored on the checkout note's row — was stored empty.
  const setInstr = "On the asset page, check the asset out to the user 'Bench Assignee' with note 'Checked out to Bench Assignee for run x7'.";
  const readInstr = 'Open the asset page for x7 and report who the asset is checked out to.';
  const readEntries: RecordedEntry[] = [
    { k: 'instruction', text: readInstr, url: 'http://x.test/hardware/4', fingerprint: [1, 0, 0] },
    anchoredRead('Checked out to Bench Assignee for run x7', 'checked_out_to', 'Bench Assignee'),
  ];
  const recording: RecordedEntry[] = [
    { k: 'instruction', text: setInstr, url: 'http://x.test/hardware/4', fingerprint: [1, 0, 0] },
    step('click', { target: '@e1' }),
    { k: 'report', status: 'success', summary: 'Checked out.', values: { assignee: 'Bench Assignee', checkout_note: 'Checked out to Bench Assignee for run x7' } },
    ...readEntries,
  ];
  const known = { 'var:runid': 'x7', 'output:i1:assignee': 'Bench Assignee', 'output:i1:checkout_note': 'Checked out to Bench Assignee for run x7' };
  const compileRead = (constants?: string[]) =>
    compileSkills({
      entries: readEntries,
      instruction: readInstr,
      report: { status: 'success', summary: 'ok', evidence: { values: { checked_out_to: 'Bench Assignee' } } },
      session: 's',
      knownValues: known,
      ...(constants ? { taskConstants: constants } : {}),
    })[0];

  it('a value the producing instruction stated before any report carried it is a task constant', () => {
    const c = taskConstants(recording, Object.values(known).slice(1), ['x7']);
    expect(c.has('Bench Assignee')).toBe(true);
    // Embeds the runid: the var is the run value, and it strands by itself.
    expect(c.has('Checked out to Bench Assignee for run x7')).toBe(false);
  });

  it('case aside: fwec3 was told to sign in as admin and reported "Admin"', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: "Sign in with username 'admin' and confirm the admin user is shown.", url: 'http://x.test/', fingerprint: [1, 0, 0] },
      { k: 'report', status: 'success', summary: 'Signed in.', values: { logged_in_user: 'Admin' } },
    ];
    expect(taskConstants(entries, ['Admin']).has('Admin')).toBe(true);
  });

  it('a scoped hasText naming a stated-then-banked value survives, with its label', () => {
    const skill = compileRead([...taskConstants(recording, Object.values(known), ['x7'])]);
    const chain = skill.steps[0].locators.target ?? [];
    expect(chain[0]).toMatchObject({ kind: 'scoped', hasText: expect.stringContaining('Bench Assignee') });
    expect(skill.steps[0].label).toBe('checked_out_to');
  });

  it('without the provenance, the same anchor is stranded and the read stored empty (the fwsi4 defect)', () => {
    const skill = compileRead();
    expect(skill.steps[0].locators.target).toEqual([]);
    expect(skill.steps[0].label).toBeUndefined();
  });

  it('counter-case: a value a report showed and only then an instruction stated is still stranded', () => {
    // fwrd12l/fwrd22l: the create reported the ticket ref, the next instruction
    // quoted it. The author learned it from the run, so it is the run's.
    const openInstr = 'Open ticket RD-1015 and report its assignee.';
    const openEntries: RecordedEntry[] = [
      { k: 'instruction', text: openInstr, url: 'http://x.test/#/tickets', fingerprint: [1, 0, 0] },
      anchoredRead('RD-1015 Printer jam', 'assignee', 'Bench Assignee'),
    ];
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create a ticket titled Printer jam and report its reference.', url: 'http://x.test/#/tickets', fingerprint: [1, 0, 0] },
      step('click', { target: '@e1' }),
      { k: 'report', status: 'success', summary: 'Created RD-1015.', values: { ref: 'RD-1015' } },
      ...openEntries,
    ];
    const constants = [...taskConstants(entries, ['RD-1015'])];
    expect(constants).toEqual([]);
    const [skill] = compileSkills({
      entries: openEntries,
      instruction: openInstr,
      report: { status: 'success', summary: 'ok', evidence: { values: { assignee: 'Bench Assignee' } } },
      session: 's',
      knownValues: { 'output:i1:ref': 'RD-1015' },
      taskConstants: constants,
    });
    expect(JSON.stringify(skill.steps)).not.toContain('RD-1015');
  });
});

describe('an alert expectation does not freeze a published value (FIX P)', () => {
  it('cuts the alert before the first value the reads published', () => {
    // snipeit fwsi4 03-create step 19.
    const steps: SkillStep[] = [
      { tool: 'click', args: { target: '@e1' }, locators: {}, expect: { alertContains: 'Success: × Asset with tag BA-00004 was created successfully. Click here to view.' } },
    ];
    const notes: TransformNote[] = [];
    unfreezeExpectations(steps, ['fwsi4-n1 Bench Asset', 'BA-00004'], notes);
    expect(steps[0].expect?.alertContains).toBe('Success: × Asset with tag');
    expect(notes.some((n) => n.name === 'unfreezeExpectations' && n.at === 1)).toBe(true);
  });

  it('drops an alert left with nothing, and keeps one a read published whole', () => {
    const steps: SkillStep[] = [
      { tool: 'click', args: { target: '@e1' }, locators: {}, expect: { alertContains: 'BA-00004 saved', lineDialect: 'aria' } as SkillStep['expect'] },
      { tool: 'click', args: { target: '@e2' }, locators: {}, expect: { alertContains: 'Success: You have successfully logged in.' } },
    ];
    unfreezeExpectations(steps, ['Success: You have successfully logged in.', 'BA-00004'], []);
    expect(steps[0].expect).toBeUndefined();
    expect(steps[1].expect?.alertContains).toBe('Success: You have successfully logged in.');
  });

  it('matches whole tokens only and ignores a one-character value', () => {
    expect(cutAtPublishedValue('Created BA-000041 and 4 more', ['BA-00004', '4'])).toBe('Created BA-000041 and 4 more');
  });
});
