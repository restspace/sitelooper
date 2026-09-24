import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { buildFlow, lintUnboundParams, type FlowStep } from '../src/skills/flow.js';
import { bindSkill } from '../src/skills/learn.js';
import { alignSlots, rethreadParams, threadStepParams } from '../src/skills/rethread.js';
import type { Skill } from '../src/skills/store.js';
import { slotActs } from '../src/execution/expect.js';

/**
 * odoo fwod85 (round 59), 05-open, pinned to s_6a1629. The n1 instruction said
 * "line 2 is [E-COM11] Cabinet with Doors with Quantity 2.00": the product name
 * carries the template's own separator word. bindSkill reads each slot as a
 * lazy `(.+?)`, so v9 stopped at the first " with " ("[E-COM11] Cabinet"), the
 * adjacent run `{{v6}} {{v10}}` got "Doors with Quantity 2.00", no split agreed
 * with v6 = "Quantity", and v10 was refused and DELETED. The export wrote v9
 * as a wrong literal and no v10 at all; both replays refused the pin with
 * "missing params: v10 (e.g. "2.00")" and fell back to the model, while the
 * compiled spec rethreaded v9 and inlined the recorded "2.00" and passed.
 */
const FIX = path.join(__dirname, 'fixture');
const skill = (): Skill => JSON.parse(fs.readFileSync(path.join(FIX, 'fwod85-skills', 's_6a1629.json'), 'utf8')) as Skill;
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(FIX, 'fwod85-n1-script.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

/** fwod85.json 05-open, as the sweep published it. */
const PUBLISHED_INSTRUCTION =
  "In Odoo, open the existing quotation with reference {{03-create.quotation_reference}} (Sales > Orders > Quotations, customer '{{runid}} Bench Customer'). It has two order lines: line 1 is {{03-create.product_name_printed_on_line}} with Quantity {{03-create.quantity}} and unit price {{03-create.unit_price_filled_by_app}}, line 2 is {{04-open.line2_new_product_name}} with Quantity {{04-open.line2_quantity}} and unit price {{04-open.line2_unit_price_filled_by_app}}. Current Untaxed Amount is £1,630.00. Change ONLY the first line's Quantity from 3 to 5 (edit the quantity cell of the Desk Combination line, set it to 5, press Enter or click away so it registers). Leave the second line unchanged. Save the quotation. Then report: (a) the new Untaxed Amount the app computes and displays in the totals section, (b) the new Total, and (c) confirm the first line's quantity now shows 5.00 and its subtotal. Do not wait for network idle - the app long-polls; wait for concrete page state.";
const PUBLISHED_PARAMS: Record<string, string> = {
  v1: '{{03-create.quotation_reference}}',
  v2: '{{runid}} Bench Customer',
  v4: '{{03-create.product_name_printed_on_line}}',
  v8: '{{03-create.unit_price_filled_by_app}}',
  v9: '[E-COM11] Cabinet',
  v11: '{{04-open.line2_unit_price_filled_by_app}}',
  v6: 'Quantity',
  v7: '{{03-create.quantity}}',
  v3: '{{runid}}',
  v12: '{{03-create.url.q.id}}',
};

describe('the defect, as recorded (fwod85 n1 05-open)', () => {
  it('bindSkill over the raw instruction truncates v9 and refuses v10', () => {
    const n1 = entries().find((e) => e.k === 'instruction' && /line 2 is/.test(e.text)) as Extract<RecordedEntry, { k: 'instruction' }>;
    const bound = bindSkill(skill(), n1.text, {})!;
    expect(bound.v9).toBe('[E-COM11] Cabinet');
    expect(bound.v10).toBeUndefined();
  });
});

describe('alignSlots splits an adjacent run on a slot another occurrence already placed', () => {
  it('v6 is "Quantity" where it stands alone, so the rest of `{{v6}} {{v10}}` is v10', () => {
    const seen = alignSlots(skill().template, PUBLISHED_INSTRUCTION)!;
    expect(seen.get('v6')).toBe('Quantity');
    expect(seen.get('v9')).toBe('{{04-open.line2_new_product_name}}');
    expect(seen.get('v10')).toBe('{{04-open.line2_quantity}}');
    expect(seen.get('v7')).toBe('{{03-create.quantity}}');
  });

  it('a run with no slot placed elsewhere is still refused', () => {
    const seen = alignSlots('order {{v1}} {{v2}} now', 'order {{a.b}} {{runid}} now')!;
    expect(seen.get('v1')).toBeNull();
    expect(seen.get('v2')).toBeNull();
  });

  it('a run whose placed slot does not lead or trail the text is refused', () => {
    // v1 stands alone as "red"; the run reads "blue {{a.b}}" — v1 is not in it.
    const seen = alignSlots('paint {{v1}}, then {{v1}} {{v2}} now', 'paint red, then blue {{a.b}} now')!;
    expect(seen.get('v2')).toBeNull();
  });
});

describe('rethreadParams fills a declared slot the params left out', () => {
  it('the published 05-open params get v9 and v10 from the references at their slots', () => {
    const out = rethreadParams('05-open', PUBLISHED_INSTRUCTION, skill().template, PUBLISHED_PARAMS, [], Object.keys(skill().params));
    expect(out.params.v9).toBe('{{04-open.line2_new_product_name}}');
    expect(out.params.v10).toBe('{{04-open.line2_quantity}}');
    // everything that was already right is left alone
    for (const k of Object.keys(PUBLISHED_PARAMS).filter((k) => k !== 'v9')) expect(out.params[k]).toBe(PUBLISHED_PARAMS[k]);
    expect(out.warnings.join('\n')).toMatch(/v10 .*unbound.*\{\{04-open\.line2_quantity\}\}/);
  });

  it('a declared slot sitting on plain text is not invented', () => {
    const out = rethreadParams('x', 'open {{a.b}} with Quantity 2.00', 'open {{v1}} with {{v2}}', { v1: '{{a.b}}' }, [], ['v1', 'v2']);
    expect(out.params.v2).toBeUndefined();
  });

  it('threadStepParams is the one entry both runners and the export use', () => {
    const step: FlowStep = { id: '05-open', instruction: PUBLISHED_INSTRUCTION, skill: 's_6a1629', params: PUBLISHED_PARAMS, outputs: [], recorded: {} };
    const out = threadStepParams(step, skill());
    expect(out.params?.v10).toBe('{{04-open.line2_quantity}}');
    expect(out.params?.v9).toBe('{{04-open.line2_new_product_name}}');
  });
});

describe('export binds 05-open against its referenced instruction (fwod85 n1)', () => {
  const pinned = skill();
  // `refuse` stands in for bindSkill refusing a slot it cannot split (the
  // adjacent-run refusal that dropped v10): the slot is simply absent.
  const flowOf = (sk: Skill, refuse: string[] = []) =>
    buildFlow(entries(), {
      name: 'fwod85',
      origin: 'http://127.0.0.1:8069',
      startUrl: 'http://127.0.0.1:8069/web/login',
      vars: { runid: 'fwod85-n1' },
      session: 's',
      bind: (id, instr) => {
        if (id !== sk.id) return null;
        const bound = bindSkill(pinned, instr, {});
        return bound ? Object.fromEntries(Object.entries(bound).filter(([k]) => !refuse.includes(k))) : null;
      },
      origins: (id) => (id === sk.id ? Object.fromEntries(Object.entries(sk.params).flatMap(([k, p]) => (p.binding ? [[k, p.binding]] : []))) : null),
      pinned: (id) => (id === sk.id ? sk : null),
    })!;

  it('v9 and v10 are the references the instruction carries', () => {
    const flow = flowOf(pinned);
    const step = flow.steps.find((s) => s.skill === 's_6a1629')!;
    const producer = flow.steps.find((s) => s.recorded.line2_quantity === '2.00')!;
    expect(step.params?.v9).toBe(`{{${producer.id}.line2_new_product_name}}`);
    expect(step.params?.v10).toBe(`{{${producer.id}.line2_quantity}}`);
    expect(step.params?.v6).toBe('Quantity');
    expect(Object.keys(step.params ?? {}).sort()).toEqual(Object.keys(pinned.params).sort());
  });

  it('B: a declared slot no template position states is exported by its origin', () => {
    // The same skill, with v10 gone from its template: nothing in the
    // instruction places it, but its recorded origin names 04-open's output.
    const sk = { ...pinned, template: pinned.template.replace('{{v6}} {{v10}}', '{{v6}} 2.00') };
    const flow = flowOf(sk, ['v10']);
    const step = flow.steps.find((s) => s.skill === 's_6a1629')!;
    const producer = flow.steps.find((s) => s.recorded.line2_quantity === '2.00')!;
    expect(step.params?.v10).toBe(`{{${producer.id}.line2_quantity}}`);
    expect(lintUnboundParams(flow, (id) => (id === sk.id ? sk : null))).toEqual([]);
  });

  it('B: a declared slot with no nameable origin fails loudly as a lint', () => {
    const sk: Skill = {
      ...pinned,
      template: pinned.template.replace('{{v6}} {{v10}}', '{{v6}} 2.00'),
      params: { ...pinned.params, v10: { ...pinned.params.v10, binding: 'output:i4:never_reported' } },
    };
    const flow = flowOf(sk, ['v10']);
    const step = flow.steps.find((s) => s.skill === 's_6a1629')!;
    expect(step.params?.v10).toBeUndefined();
    const lint = lintUnboundParams(flow, (id) => (id === sk.id ? sk : null));
    expect(lint).toHaveLength(1);
    expect(lint[0]).toMatch(/05-open.*s_6a1629.*v10/);
  });
});

describe('slotActs: the one reading of "a missing value here changes what the step does"', () => {
  const seg = (params: Record<string, { usedIn: number[] }>, requireText?: string[]) => ({ params, preconditions: requireText ? { requireText } : {} });
  it('a slot a step types or locates by acts', () => {
    expect(slotActs([seg({ v7: { usedIn: [1] } })], 'v7')).toBe(true);
  });
  it('a slot naming the record the procedure must find acts', () => {
    expect(slotActs([seg({ v1: { usedIn: [] } }, ['{{v1}}'])], 'v1')).toBe(true);
  });
  it('a later segment that types it makes it act for the whole chain', () => {
    expect(slotActs([seg({ v4: { usedIn: [] } }), seg({ v4: { usedIn: [2] } })], 'v4')).toBe(true);
  });
  it('s_6a1629 v10, named only by an expectation, does not act', () => {
    expect(slotActs([skill()], 'v10')).toBe(false);
    expect(slotActs([skill()], 'v7')).toBe(true);
  });
});
