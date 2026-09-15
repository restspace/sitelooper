import { describe, expect, it } from 'vitest';
import { alignSlots, rethreadParams, statedPlainly } from '../src/spec/rethread.js';

// The exact strings from the published odoo flow fwod34, step 06-open: the
// pin was adopted during a replay, so its params froze that run's concrete
// values while the instruction stayed threaded.
const OD_INSTRUCTION =
  "Open the confirmed sales order {{02-create.quotation_ref}} for customer '{{runid}} Bench Customer' in the Odoo Sales app and cancel it (use the Cancel action, confirming any dialog that appears, so the order is no longer active). Then report the status the app shows for the order after cancelling (e.g. 'Cancelled'). Do not wait for network idle; wait on concrete page state instead.";
const OD_TEMPLATE =
  "Open the confirmed sales order {{v1}} for customer '{{v2}} Bench Customer' in the Odoo Sales app and cancel it (use the Cancel action, confirming any dialog that appears, so the order is no longer active). Then report the status the app shows for the order after cancelling (e.g. 'Cancelled'). Do not wait for network idle; wait on concrete page state instead.";

describe('alignSlots', () => {
  it('puts each template slot on the instruction text that fills it', () => {
    const seen = alignSlots(OD_TEMPLATE, OD_INSTRUCTION)!;
    expect(seen.get('v1')).toBe('{{02-create.quotation_ref}}');
    // The slot covers only part of the quoted phrase.
    expect(seen.get('v2')).toBe('{{runid}}');
  });

  it('is null when the template does not read as a pattern over the instruction', () => {
    expect(alignSlots('Open the invoice {{v1}}.', OD_INSTRUCTION)).toBeNull();
  });

  it('nulls a slot whose two occurrences disagree', () => {
    const seen = alignSlots('open {{v1}} then close {{v1}} now', 'open {{a.b}} then close {{c.d}} now')!;
    expect(seen.get('v1')).toBeNull();
  });

  it('nulls adjacent slots with nothing between them', () => {
    const seen = alignSlots('order {{v1}}{{v2}} now', 'order {{a.b}}{{runid}} now')!;
    expect(seen.get('v1')).toBeNull();
    expect(seen.get('v2')).toBeNull();
  });
});

describe('rethreadParams', () => {
  it('rebinds the fwod34 06-open literals to the references at their slots', () => {
    const out = rethreadParams('06-open', OD_INSTRUCTION, OD_TEMPLATE, { v1: 'S00022', v2: 'fwod34-n2' });
    expect(out.params).toEqual({ v1: '{{02-create.quotation_ref}}', v2: '{{runid}}' });
    expect(out.rebound).toEqual({ v1: '{{02-create.quotation_ref}}', v2: '{{runid}}' });
    expect(out.warnings).toEqual([
      'step 06-open param v1 was bound to the literal "S00022"; rethreaded to {{02-create.quotation_ref}} from the instruction',
      'step 06-open param v2 was bound to the literal "fwod34-n2"; rethreaded to {{runid}} from the instruction',
    ]);
  });

  it('rebinds a slot that covers a reference plus literal text', () => {
    const out = rethreadParams(
      '02-create',
      "create a quotation for customer '{{runid}} Bench Customer' now",
      "create a quotation for customer '{{v1}}' now",
      { v1: 'fwod34-n2 Bench Customer' },
    );
    expect(out.params.v1).toBe('{{runid}} Bench Customer');
  });

  it('leaves a param that already carries a reference alone, silently', () => {
    const out = rethreadParams('05-open', OD_INSTRUCTION, OD_TEMPLATE, {
      v1: '{{02-create.quotation_ref}}',
      v2: '{{runid}}',
    });
    expect(out.params).toEqual({ v1: '{{02-create.quotation_ref}}', v2: '{{runid}}' });
    expect(out.warnings).toEqual([]);
    expect(out.rebound).toEqual({});
  });

  it('leaves a literal that sits on matching plain text alone, silently', () => {
    const out = rethreadParams(
      '07-open',
      "open {{02-create.quotation_ref}} and report the status (e.g. 'Sales Order')",
      "open {{v1}} and report the status (e.g. '{{v3}}')",
      { v3: 'Sales Order' },
    );
    expect(out.params).toEqual({ v3: 'Sales Order' });
    expect(out.warnings).toEqual([]);
  });

  it('warns without rebinding when the literal sits on different plain text', () => {
    const out = rethreadParams(
      '07-open',
      "open {{02-create.quotation_ref}} and report the status (e.g. 'Sales Order')",
      "open {{v1}} and report the status (e.g. '{{v3}}')",
      { v3: 'Cancelled' },
    );
    expect(out.params).toEqual({ v3: 'Cancelled' });
    expect(out.warnings).toEqual([
      'step 07-open param v3 is bound to the literal "Cancelled" but the instruction has plain text "Sales Order" there; it could not be rethreaded — the step will run against the recording\'s record',
    ]);
  });

  it('warns without rebinding when the alignment is ambiguous', () => {
    const out = rethreadParams('06-open', 'order {{a.b}}{{runid}} now', 'order {{v1}}{{v2}} now', {
      v1: 'S00022',
      v2: 'fwod34-n2',
    });
    expect(out.params).toEqual({ v1: 'S00022', v2: 'fwod34-n2' });
    expect(out.warnings).toEqual([
      'step 06-open param v1 is bound to the literal "S00022"; the alignment is ambiguous so it could not be rethreaded — the step will run against the recording\'s record',
      'step 06-open param v2 is bound to the literal "fwod34-n2"; the alignment is ambiguous so it could not be rethreaded — the step will run against the recording\'s record',
    ]);
  });

  it('warns when the template will not align at all', () => {
    const out = rethreadParams('06-open', OD_INSTRUCTION, 'Open the invoice {{v1}}.', { v1: 'S00022' });
    expect(out.params).toEqual({ v1: 'S00022' });
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain('could not be rethreaded');
  });

  it('says nothing about a literal step whose instruction threads nothing', () => {
    const out = rethreadParams('01-signin', "create a customer named 'Acme'", "create a customer named '{{v1}}'", {
      v1: 'Acme',
    });
    expect(out.warnings).toEqual([]);
    expect(out.params).toEqual({ v1: 'Acme' });
  });

  // fwkb9 03-verify: the template was reworded, so alignSlots fails, but the
  // literal is the instruction's own plain words — nothing to rethread it to.
  it('says nothing about a literal the instruction states outside its references, even unaligned', () => {
    const out = rethreadParams(
      '03-verify',
      "In the Kanboard project 'Bench Board', move the task titled '{{runid}} Bench Task' (task {{02-create.task_id_display}}) to done.",
      "In project '{{v1}}', move task '{{v2}}' somewhere.",
      { v1: 'Bench Board', v2: '{{runid}} Bench Task' },
    );
    expect(out.warnings).toEqual([]);
    expect(out.params.v1).toBe('Bench Board');
  });

  it('still warns for a literal found only by straddling a reference, or holding a run var value', () => {
    const instruction = "open board {{02-create.id}} Board and the project 'fwkb9-n1 Bench Board'";
    const out = rethreadParams('04-open', instruction, 'unaligned {{v1}}', { v1: 'Board and' }, []);
    expect(out.warnings).toEqual([]); // "Board and" is plain text between refs
    const straddle = rethreadParams('04-open', instruction, 'unaligned {{v1}}', { v1: 'board 7 Board' });
    expect(straddle.warnings).toHaveLength(1);
    const runVar = rethreadParams('04-open', instruction, 'unaligned {{v1}}', { v1: 'fwkb9-n1 Bench Board' }, ['fwkb9-n1']);
    expect(runVar.warnings).toHaveLength(1);
  });
});

describe('statedPlainly', () => {
  it('matches on word boundaries only, ignoring case and quote style', () => {
    expect(statedPlainly('in project "Bench Board" now', 'bench board')).toBe(true);
    expect(statedPlainly('in project Bench Boards now', 'Bench Board')).toBe(false);
    expect(statedPlainly('in {{a.b}} now', 'a.b')).toBe(false);
  });
});
