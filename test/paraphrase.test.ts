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

  it('refuses when the instruction states nothing of a blank\'s shape', async () => {
    const out = await bindParaphrase(addPart, "On ticket RD-1200 add the part 'new-n2 RD Part A'.", ledger);
    expect(out).toEqual({ refused: expect.stringContaining('states no number') });
  });
});
