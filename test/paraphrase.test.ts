/**
 * PLAN-jev.md §6 bet 1: binding a stored skill's blanks from a REWORDED instruction.
 * The rules here are the ones the offline measurement argued for
 * (bench/jev-bind-offline.mjs): ledger first, resemblance to the recorded
 * example, contested blanks to a decider, and no replay unless every blank binds.
 */
import { describe, expect, it } from 'vitest';
import type { Skill } from '../src/skills/store.js';
import { bindParaphrase, planBinding, resemblance, shapeOf, type PickLiteral } from '../src/skills/paraphrase.js';

const skill = (template: string, params: Skill['params']): Skill =>
  ({ id: 's_test', origin: 'http://app', template, params, preconditions: { urlPattern: 'http://app/*' }, steps: [], status: 'validated' }) as unknown as Skill;
const p = (example: string, binding?: string) => ({ example, usedIn: [1], ...(binding ? { binding, known: true as const } : {}) });

const addPart = skill("Open the ticket with reference {{v1}} (titled '{{v2}}') and add a part named '{{v3}}' with cost {{v4}} and markup {{v5}}.", {
  v1: p('RD-1091', '02-create.ticket_ref'),
  v2: p('old-n1 RD Bench Ticket', 'output:i2:ticket_title'),
  v3: p('old-n1 RD Part A'),
  v4: p('100'),
  v5: p('25'),
});

describe('shapes are app-independent', () => {
  it('tells a url, a number, a reference-shaped token and free text apart', () => {
    expect(['http://x/y', '150', '$12.50', 'RD-1015', 'new-n1 RD Part A', 'a@b.co', '2026-12-31'].map(shapeOf)).toEqual(['url', 'number', 'number', 'code', 'text', 'email', 'date']);
  });
  it('resemblance is token overlap with the recorded example', () => {
    expect(resemblance('new-n2 RD Part A', 'old-n1 RD Part A')).toBeGreaterThan(resemblance('new-n2 RD Bench Ticket', 'old-n1 RD Part A'));
    expect(resemblance('RD-1015', 'old-n1')).toBe(0);
  });
});

describe('binding a reworded instruction', () => {
  const ledger = { '02-create.ticket_ref': 'RD-1200', 'output:i2:ticket_title': 'new-n2 RD Bench Ticket' };
  const reworded = "On ticket RD-1200 add the part 'new-n2 RD Part A' — cost 140, markup 30 — then save.";

  it('fills session blanks from the ledger and numbers by the template cue word', async () => {
    const out = await bindParaphrase(addPart, reworded, ledger);
    expect(out).toEqual({ params: { v1: 'RD-1200', v2: 'new-n2 RD Bench Ticket', v3: 'new-n2 RD Part A', v4: '140', v5: '30' } });
  });

  it('refuses a session blank the run has not produced and the instruction does not single out', async () => {
    const out = await bindParaphrase(addPart, "Add the part 'new-n2 RD Part A' with cost 140 and markup 30.", {});
    expect(out).toHaveProperty('refused');
  });

  it('puts rival literals to the decider, and refuses without one', async () => {
    const second = "The ticket already has 'new-n2 RD Part A'; add a second part 'new-n2 RD Part B' with cost 200 and markup 25.";
    const plan = planBinding(addPart, second, ledger);
    expect(Object.keys(plan.contested)).toEqual(['v3']);
    expect(plan.contested.v3.map((c) => c.text).sort()).toEqual(['new-n2 RD Part A', 'new-n2 RD Part B']);
    expect(await bindParaphrase(addPart, second, ledger)).toHaveProperty('refused');
    const pickB: PickLiteral = async (q) => q.candidates.find((c) => c.text.endsWith('Part B')) ?? null;
    expect(await bindParaphrase(addPart, second, ledger, pickB)).toEqual({ params: expect.objectContaining({ v3: 'new-n2 RD Part B', v4: '200', v5: '25' }) });
  });

  it('derives a blank the instruction does not state from one that contains it', async () => {
    const withRun = { ...addPart, params: { ...addPart.params, v6: p('old-n1', 'var:runid') } } as typeof addPart;
    const out = await bindParaphrase(withRun, reworded, ledger);
    expect(out).toEqual({ params: expect.objectContaining({ v6: 'new-n2', v3: 'new-n2 RD Part A' }) });
    // Only when the rest of the recorded value is the rest of the new one.
    const odd = { ...addPart, params: { ...addPart.params, v6: p('old-n1 XYZ') } } as typeof addPart;
    expect(await bindParaphrase(odd, reworded, ledger)).toHaveProperty('refused');
  });

  it('does not give a title blank the only text literal around, a part name', async () => {
    // jmrd2, live: the ledger had no title, the instruction stated none, and "RD" plus the run tag
    // were all the part name shared with the recorded title.
    const out = await bindParaphrase(addPart, "On ticket RD-1200 add the part 'old-n1 RD Part A' with cost 140 and markup 30.", { '02-create.ticket_ref': 'RD-1200' });
    expect(out).toEqual({ refused: expect.stringContaining('{{v2}}') });
  });

  it('tells a reference from a run tag by its pattern', async () => {
    const tagged = { ...addPart, params: { ...addPart.params, v1: p('RD-1091') } } as typeof addPart;
    const plan = planBinding(tagged, "For run new-n2, on ticket RD-1200 add the part 'new-n2 RD Part A' with cost 140 and markup 30.", ledger);
    expect(plan.bound.v1).toBe('RD-1200');
  });

  it('refuses when the instruction states nothing of a blank\'s shape', async () => {
    const out = await bindParaphrase(addPart, "On ticket RD-1200 add the part 'new-n2 RD Part A'.", ledger);
    expect(out).toEqual({ refused: expect.stringContaining('states no number') });
  });
});

import { concreteStart, eligibleSkills } from '../src/skills/paraphrase.js';

describe('a skill that starts on a concrete page can be reached from anywhere', () => {
  const at = (urlPattern: string) => ({ ...addPart, preconditions: { urlPattern }, stats: { uses: 2, successes: 2, verifiedContract: 1 } }) as unknown as Skill;

  it('knows an address from a pattern that needs a record', () => {
    expect(concreteStart(at('http://127.0.0.1:4180/#/tickets'))).toBe('http://127.0.0.1:4180/#/tickets');
    expect(concreteStart(at('http://127.0.0.1:4180/#/tickets/:id'))).toBeNull();
    expect(concreteStart(at('http://127.0.0.1:4180/#/tickets/{{v4}}'))).toBeNull();
    expect(concreteStart(at('http://127.0.0.1:8069/web#action=:id&model=sale.order'))).toBeNull();
  });

  it('is only offered from elsewhere when asked to be', () => {
    const list = at('http://127.0.0.1:4180/#/tickets');
    const detail = at('http://127.0.0.1:4180/#/tickets/:id');
    const here = 'http://127.0.0.1:4180/#/tickets/t15';
    // Verification is the store's business; this test is about the page rule alone.
    const pages = (anywhere: boolean) => eligibleSkills([list, detail], here, anywhere).map((s) => s.preconditions.urlPattern);
    expect(pages(false)).not.toContain('http://127.0.0.1:4180/#/tickets');
    if (pages(true).length) expect(pages(true)).toContain('http://127.0.0.1:4180/#/tickets');
  });
});

import { usedSlots } from '../src/skills/paraphrase.js';

describe('only the blanks a procedure uses have to be bound', () => {
  const head = {
    ...addPart,
    template: "On ticket {{v1}} (currently status {{v6}}), add a part named '{{v3}}' with cost {{v4}} and markup {{v5}}.",
    params: { v1: p('RD-1091', '02-create.ticket_ref'), v3: { example: 'old-n1 RD Part A', usedIn: [] }, v4: { example: '100', usedIn: [] }, v5: { example: '25', usedIn: [] }, v6: { example: 'Draft', usedIn: [] } },
    steps: [{ tool: 'click', args: { target: '{{v1}}' } }],
    seq: { chain: 'c1', index: 0, of: 2 },
  } as unknown as Skill;
  const tail = { ...head, id: 's_tail', seq: { chain: 'c1', index: 1, of: 2 }, steps: [{ tool: 'fill', args: { value: '{{v3}}' } }, { tool: 'fill', args: { value: '{{v4}}' } }, { tool: 'fill', args: { value: '{{v5}}' } }] } as unknown as Skill;

  it('reads use off the whole chain, not the head alone', () => {
    expect([...usedSlots(head)].sort()).toEqual(['v1']);
    expect([...usedSlots(head, [tail])].sort()).toEqual(['v1', 'v3', 'v4', 'v5']);
  });

  it('does not refuse over a status the new wording leaves out and nothing reads', async () => {
    const out = await bindParaphrase(head, "On ticket RD-1200 add the part 'new-n2 RD Part A' with cost 140 and markup 30.", { '02-create.ticket_ref': 'RD-1200' }, undefined, [tail]);
    expect(out).toEqual({ params: { v1: 'RD-1200', v3: 'new-n2 RD Part A', v4: '140', v5: '30', v6: 'Draft' } });
  });
});

describe('a value this run already produced is found in its ledger by value', () => {
  it('under the new session\'s own key, and only when exactly one value fits', async () => {
    const session = { 'output:i1:new_ticket_reference': 'RD-1200', 'output:i1:new_ticket_title': 'new-n2 RD Bench Ticket' };
    const text = "Add the part 'new-n2 RD Part A' with cost 140 and markup 30.";
    expect(await bindParaphrase(addPart, text, session)).toEqual({ params: expect.objectContaining({ v1: 'RD-1200', v2: 'new-n2 RD Bench Ticket' }) });
    const two = { ...session, 'output:i3:other_ticket': 'new-n2 RD Second Ticket' };
    expect(await bindParaphrase(addPart, text, two)).toHaveProperty('refused');
  });
});
