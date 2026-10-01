/**
 * Round 84: the gaps the second ERPNext sweep (fwen2-luna) exposed, each
 * judged on slices of the published n1 recording (test/fixture/fwen2-luna-n1-*)
 * and the replays' own observations.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { buildFlow } from '../src/skills/flow.js';
import { canAdoptPin, mutates } from '../src/skills/learn.js';
import { expectedChangesVerdict, type ChangeObservation } from '../src/execution/expect.js';
import { safeDecode, urlDiff, urlMatches } from '../src/execution/url.js';
import type { Skill, SkillStore } from '../src/skills/store.js';

const EN = 'http://127.0.0.1:8100';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-r84-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fixture = (name: string): RecordedEntry[] => parseScript(fs.readFileSync(path.join(__dirname, 'fixture', name), 'utf8')).entries;

/**
 * 02-find s_c12ca0 stopped at step 1 on n2 and n3: "after step 1 expected url
 * …/app/sales-order?company=["like","%Bench Company%"]&status=[…] but browser
 * is at …" the very same text. The stored pattern keeps query values decoded,
 * and the '%' of a LIKE filter made the pattern's value undecodable as a whole.
 */
describe('a stored query value holding a "%" matches the live url it was recorded from', () => {
  const pattern = `${EN}/app/sales-order?company=["like","%Bench Company%"]&status=["in",["To Deliver","To Deliver and Bill"]]`;
  const live = `${EN}/app/sales-order?company=%5B%22like%22%2C%22%25Bench+Company%25%22%5D&status=%5B%22in%22%2C%5B%22To+Deliver%22%2C%22To+Deliver+and+Bill%22%5D%5D`;

  it('fwen2-luna 02-find: the url the browser was at matches', () => {
    expect(urlDiff(pattern, live)).toEqual([]);
    expect(urlMatches(pattern, live)).toBe(true);
  });

  it('still tells a different filter value apart', () => {
    const other = live.replace('Bench+Company', 'Other+Company');
    expect(urlMatches(pattern, other)).toBe(false);
  });

  it('decodes every escape it can and leaves a bare "%" as written', () => {
    expect(safeDecode('%22%Bench%20Company%%22')).toBe('"%Bench Company%"');
    expect(safeDecode('100%')).toBe('100%');
    expect(safeDecode('%E2%82%AC%zz')).toBe('€%zz');
    // whole-decodable text is untouched by the fallback
    expect(safeDecode('%5B%22like%22%5D')).toBe('["like"]');
  });
});

/**
 * 05-edit s_368740 replayed at tier A on n2 and n3 and turned the order into
 * "Bench Gadget x3; Bench Gadget x2". Its first step clicks row 1's qty cell;
 * in the recording the row editor that opened showed the identity marker
 * {{v2}} = Bench Widget, which the expectation stored as a wildcard.
 */
describe('fwen2-luna 05-edit: a grid-row edit stops when the row is not the one the procedure works on', () => {
  const entries = fixture('fwen2-luna-n1-05-edit.jsonl');
  const report = entries.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
  const instruction = (entries[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
  const compile = (): Skill[] =>
    compileSkills({
      entries: entries.filter((e) => e.k !== 'report'),
      instruction,
      report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
      session: 'fwen2-luna-n1',
      knownValues: { 'var:runid': 'fwen2-luna-n1', 'output:i4:visible_item': 'Bench Widget', 'url:i5:p2': 'SAL-ORD-2026-00004' },
    });
  const seen = (added: string[], live: string[]): ChangeObservation => ({ added, live: async () => ({ lines: live, complete: true }) });
  const params = { v1: 'SAL-ORD-2026-00004', v2: 'Bench Widget', v3: 'fwen2-luna-n2' };
  // n2's own step-1 diff (fwen2-luna-n2-script.jsonl #113), and n1's.
  const n2Added = ['- combobox "Item Code": Bench Gadget', '- textbox "Delivery Date": 2026-12-31', '- textbox "Quantity": 1.000', '- textbox "Rate (USD)": 125.00', '- textbox "Amount (USD)" [disabled]: 125.00'];
  const n1Added = ['- combobox "Item Code": Bench Widget', '- textbox "Delivery Date": 2026-12-31', '- textbox "Quantity": 1.000', '- textbox "Rate (USD)": 40.00', '- textbox "Amount (USD)" [disabled]: 40.00'];

  it('the identity marker the row editor showed stays in the step-1 expectation', () => {
    const [skill] = compile();
    expect(skill.preconditions.requireText).toEqual(['{{v1}}', '{{v2}}']);
    expect(skill.steps[0].expect?.addedContains?.[0]).toBe('- combobox "Item Code": {{v2}}');
    expect(skill.provenance.transforms?.some((t) => t.name === 'anchorMarkerValues' && t.at === 1)).toBe(true);
  });

  it("n2's replay — a Bench Gadget row opened — stops at step 1 instead of editing it", async () => {
    const [skill] = compile();
    const lines = skill.steps[0].expect!.addedContains!;
    const v = await expectedChangesVerdict(lines, params, { tag: '1', tool: 'click', positionalResolution: true }, seen(n2Added, [...n2Added, '- option "Bench Widget Bench Widget, Products"']));
    expect(v.stop).toMatch(/did not show "- combobox \\"Item Code\\": Bench Widget"/);
  });

  it('the recorded row — Bench Widget — passes', async () => {
    const [skill] = compile();
    const v = await expectedChangesVerdict(skill.steps[0].expect!.addedContains!, params, { tag: '1', tool: 'click', positionalResolution: true }, seen(n1Added, n1Added));
    expect(v.stop).toBeUndefined();
  });

  it('a value the step merely shows that is NOT an identity marker stays a wildcard (fwod49)', () => {
    const [skill] = compile();
    // step 5 picks Bench Gadget from the suggestions: its editor line is the app's echo of a literal, not a marker
    const pick = skill.steps.find((s) => s.tool === 'click' && JSON.stringify(s.locators).includes('Bench Gadget Bench Gadget, Products'));
    expect(pick?.expect?.addedContains).toContain('- combobox "Item Code": {{*}}');
  });
});

/**
 * 04-create (adopted) recovered cleanly on n2 and n3 and never graduated: the
 * chain its recovery compiled starts with a lone goto, and canAdoptPin judged
 * the whole procedure by that head — read-only, refused for a create.
 */
describe('a pin candidate is judged by its chain, not its head segment', () => {
  const sk = (id: string, tools: string[], seq?: { chain: string; index: number; of: number }): Skill =>
    ({
      id,
      origin: EN,
      template: id,
      params: {},
      preconditions: { urlPattern: `${EN}/` },
      steps: tools.map((tool) => ({ tool, args: {}, locators: {} })),
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'provisional',
      provenance: { created: '' },
      ...(seq ? { seq } : {}),
    }) as unknown as Skill;
  // s_2ee388 as fwen2-luna-n2 stored it: goto / fills, clicks, save / reads.
  const all = [
    sk('s_6b15c9', ['goto'], { chain: 's_2ee388', index: 0, of: 3 }),
    sk('s_aeba2b', ['type', 'click', 'fill', 'click'], { chain: 's_2ee388', index: 1, of: 3 }),
    sk('s_ba8b5d', ['read', 'read'], { chain: 's_2ee388', index: 2, of: 3 }),
    sk('s_reads', ['read'], { chain: 's_r', index: 0, of: 2 }),
    sk('s_reads2', ['read'], { chain: 's_r', index: 1, of: 2 }),
  ];
  const store = { get: (id: string) => all.find((s) => s.id === id) ?? null, list: () => all } as unknown as SkillStore;
  const steps = [{ id: '03-create', skill: 's_x' }, { id: '04-create' }, { id: '05-edit', skill: 's_368740' }];

  it('a chain whose later segment saves mutates', () => {
    expect(mutates(store, 's_6b15c9')).toBe(true);
    expect(mutates(store, 's_ba8b5d')).toBe(false);
    expect(mutates(store, 's_reads')).toBe(false);
  });

  it("the adopted create may adopt its recovery's chain", () => {
    expect(canAdoptPin(store, steps, '04-create', undefined, 's_6b15c9', 'mutating')).toBe(true);
    expect(canAdoptPin(store, steps, '04-create', undefined, 's_reads', 'mutating')).toBe(false);
  });
});

/**
 * The adopted 04-create merged its continuation ("Complete and save … select
 * Bench Widget from its dropdown if needed …") but kept only the first
 * instruction, so the model-first replays chose another item.
 */
describe('fwen2-luna 04-create: a merged continuation that chose a value the step records travels with the step', () => {
  const entries = fixture('fwen2-luna-n1-04-create.jsonl');

  it('the flow step is adopted, owns the saved order, and its instruction names the item the recording chose', () => {
    const flow = buildFlow(entries, { name: 'f', origin: EN, startUrl: `${EN}/app/customer/fwen2-luna-n1%20Bench%20Customer`, vars: { runid: 'fwen2-luna-n1' }, session: 's' })!;
    expect(flow.steps.length).toBe(1);
    const [step] = flow.steps;
    expect(step.adopted).toBe(true);
    expect(step.recorded.visible_item).toBe('Bench Widget');
    expect(step.instruction.startsWith('Create a new Sales Order for the existing customer')).toBe(true);
    expect(step.instruction).toContain('Then, to finish: Complete and save the current new Sales Order');
    expect(step.instruction).toContain('select Bench Widget from its dropdown');
    expect(step.instruction).not.toContain('fwen2-luna-n1');
  });
});
