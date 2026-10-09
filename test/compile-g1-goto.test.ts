/**
 * Compile reliability group 1, item 1 (notes/CONTRACT-compile-g1.md): a goto
 * never carries n1's record id, and a chain segment's gate refusal counts.
 *
 * Held-out evidence (bench/heldout2): kimai hakm1/hbkm3 and grocy hbgc2/hbgc3.
 * In each, n2 and n3 fell back at the same chain segment ("… does not show
 * {{v1}} … nothing was run") right after a goto to n1's own record —
 * `/timesheet/1/edit`, `/product/298407` — and the compiled spec failed there.
 *
 * Fixtures are the n1 recordings trimmed to one instruction:
 *  - hakm1-n1-04-create.jsonl  results/hakm1  hakm1-n1-script.jsonl lines 73-128
 *  - hbgc3-n1-04-edit.jsonl    results/hbgc3  hbgc3-n1-script.jsonl lines 52-80
 *  - hbgc2-n1-03-create.jsonl  results/hbgc2  hbgc2-n1-script.jsonl lines 23-44
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstructionResult, SkillRecord } from '../src/agent/loop.js';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { learnFromInstruction, reachedGateRefusal } from '../src/skills/learn.js';
import { unseenGotoParts } from '../src/skills/ledger.js';
import { SkillStore, type Skill } from '../src/skills/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', name), 'utf8').replace(/\r\n/g, '\n')).entries;

type Report = Extract<RecordedEntry, { k: 'report' }>;
const compileOne = (entries: RecordedEntry[], knownValues: Record<string, string>, before: RecordedEntry[] = []) => {
  const head = entries[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = entries.find((e): e is Report => e.k === 'report')!;
  return compileSkills({
    entries: entries.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
    session: 'g1',
    knownValues,
    before,
  });
};
const stepsOf = (skills: Skill[]) => skills.flatMap((s) => s.steps);
const gotos = (skills: Skill[]) => stepsOf(skills).filter((s) => s.tool === 'goto').map((s) => String(s.args.url));
const transforms = (skills: Skill[]) => skills.flatMap((s) => s.provenance.transforms ?? []);

describe('1b. a goto record id is sourced only by an address, an instruction or a typed value', () => {
  it('kimai hakm1-n1 #101: `1` is shown by a dropped read, a select value and 127.0.0.1 — none a source', () => {
    const e = load('hakm1-n1-04-create.jsonl');
    const at = e.findIndex((x) => x.k === 'step' && x.tool === 'goto');
    const url = String((e[at] as RecordedStep).args.url);
    expect(url).toBe('http://127.0.0.1:8105/en/timesheet/1/edit');
    // The ledger's net (server.ts landings) still calls it shown: the read_all of hrefs (#100) returned it.
    expect(unseenGotoParts(url, e.slice(0, at))).toEqual([]);
    // A source it has none of.
    expect(unseenGotoParts(url, e.slice(0, at), { sourced: true })).toEqual([{ label: 'p2', value: '1' }]);
  });

  it('never counts a number inside an address, a version, a clock or an index as a source', () => {
    const before: RecordedEntry[] = [
      { k: 'instruction', text: 'Sign in at http://127.0.0.1:8105/ (Kimai 2.1.0) before 11:30', url: 'http://127.0.0.1:8105/en/login' },
      { k: 'step', tool: 'click', args: { target: 'role=option[name="onsite"] >> nth=1' }, locators: {} } as RecordedStep,
    ];
    expect(unseenGotoParts('http://127.0.0.1:8105/en/timesheet/1/edit', before, { sourced: true })).toEqual([{ label: 'p2', value: '1' }]);
    expect(unseenGotoParts('http://127.0.0.1:8105/en/timesheet/30/edit', before, { sourced: true })).toEqual([{ label: 'p2', value: '30' }]);
    // …while a whole token still shows it.
    const typed: RecordedEntry[] = [...before, { k: 'step', tool: 'fill', args: { target: '@e1', value: '1' }, locators: {} } as RecordedStep];
    expect(unseenGotoParts('http://127.0.0.1:8105/en/timesheet/1/edit', typed, { sourced: true })).toEqual([]);
    const stated: RecordedEntry[] = [{ k: 'instruction', text: 'Open timesheet 1 and check it' }];
    expect(unseenGotoParts('http://127.0.0.1:8105/en/timesheet/1/edit', stated, { sourced: true })).toEqual([]);
  });

  it('hakm1-n1 04-create: the procedure ends before the goto instead of opening n1\'s timesheet', () => {
    const skills = compileOne(load('hakm1-n1-04-create.jsonl'), { 'var:runid': 'hakm1-n1', 'output:i3:project_name': 'hakm1-n1 Bench Project' });
    expect(skills.length).toBeGreaterThan(0);
    expect(gotos(skills)).toEqual([]);
    expect(JSON.stringify(stepsOf(skills).map((s) => s.args))).not.toContain('/timesheet/1/edit');
    expect(transforms(skills).find((t) => t.name === 'sourcelessGoto')?.reason).toContain('p2=1');
    // It still saves the timesheet: the last step is the list read after the save.
    expect(stepsOf(skills).some((s) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes('Save'))).toBe(true);
  });

  it('grocy hbgc3-n1 04-edit: `goto /product/298407` (known only as an output) becomes a click on the product row\'s link', () => {
    const skills = compileOne(load('hbgc3-n1-04-edit.jsonl'), {
      'var:runid': 'hbgc3-n1',
      'output:i3:product_name': 'hbgc3-n1 Bench Product',
      'output:i3:product_id': '298407',
    });
    // The head segment's goto (#60) is now a click on the scoped row link,
    // identified by the product-name slot; the edit form after it is gated on
    // the landing the click minted.
    const head = skills[0];
    expect(head.steps.map((s) => s.tool)).toEqual(['read', 'read', 'read', 'click']);
    const click = head.steps[3];
    expect(click.locators.target[0]).toEqual({ kind: 'scoped', container: '#products-table tr.even', hasText: '{{v1}}', selector: 'td:nth-of-type(1) > a:nth-of-type(1)' });
    expect(JSON.stringify(click.locators.target)).not.toContain('298407');
    expect(head.params.v1.example).toBe('hbgc3-n1 Bench Product');
    expect(skills[1].preconditions.urlPattern).toBe('http://127.0.0.1:8106/product/{{d1}}');
    // No goto carries n1's product literally (the later one was already slotted).
    expect(gotos(skills).filter((u) => u.includes('298407'))).toEqual([]);
  });

  it('grocy hbgc2-n1 03-create: the goto to the product the save just made becomes the row link click', () => {
    const skills = compileOne(load('hbgc2-n1-03-create.jsonl'), { 'var:runid': 'hbgc2-n1' });
    expect(gotos(skills).filter((u) => u.includes('95708'))).toEqual([]);
    const click = stepsOf(skills).find((s) => s.tool === 'click' && s.locators.target?.[0]?.kind === 'scoped')!;
    expect(click.locators.target[0]).toMatchObject({ kind: 'scoped', container: '#products-table tr.even', hasText: '{{v2}}' });
    expect(click.expect?.urlPattern).toBe('http://127.0.0.1:8106/product/{{d1}}');
  });

  it('grocy hbgc3-n1 05-edit: a later instruction\'s goto to the product 04-edit reached is slotted, bound to its origin', () => {
    // 04-edit (the instruction before) landed /product/298407 by its goto;
    // the ledger banks a value once, so 298407 is known only as 03-create's
    // reported product_id.
    const before = load('hbgc3-n1-04-edit.jsonl');
    const skills = compileOne(
      load('hbgc3-n1-05-edit.jsonl'),
      { 'var:runid': 'hbgc3-n1', 'output:i3:product_name': 'hbgc3-n1 Bench Product', 'output:i3:product_id': '298407' },
      before,
    );
    const urls = gotos(skills);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => u.includes('298407'))).toEqual([]);
    const slot = /\/product\/\{\{(v\d+)\}\}$/.exec(urls[0])?.[1];
    expect(slot).toBeDefined();
    const owner = skills.find((s) => s.params[slot!]?.binding)!;
    expect(owner.params[slot!]).toMatchObject({ example: '298407', binding: 'output:i3:product_id' });
  });

  it('…but not from the output alone, when no earlier url stood on that record', () => {
    const bare = load('hbgc3-n1-05-edit.jsonl');
    (bare[0] as { url?: string }).url = 'http://127.0.0.1:8106/stockoverview';
    const skills = compileOne(bare, { 'var:runid': 'hbgc3-n1', 'output:i3:product_id': '298407' }, []);
    expect(skills.length).toBeGreaterThan(0);
    expect(JSON.stringify(skills.map((s) => s.params))).not.toContain('output:i3:product_id');
  });

  it('negative: a goto to a seeded record the instruction names stays literal', () => {
    const e = load('hbgc3-n1-04-edit.jsonl');
    const head = e[0] as Extract<RecordedEntry, { k: 'instruction' }>;
    e[0] = { ...head, text: `${head.text} The product's edit page is http://127.0.0.1:8106/product/298407.` };
    const skills = compileOne(e, { 'var:runid': 'hbgc3-n1', 'output:i3:product_name': 'hbgc3-n1 Bench Product' });
    expect(transforms(skills).some((t) => t.name === 'sourcelessGoto')).toBe(false);
    // Kept as the instruction states it: the url itself became the instruction's slot.
    const [url] = gotos(skills);
    const slot = /^\{\{(v\d+)\}\}$/.exec(url)?.[1];
    expect(slot ? skills[0].params[slot].example : url).toBe('http://127.0.0.1:8106/product/298407');
    expect(stepsOf(skills).filter((s) => s.tool === 'click' && s.locators.target?.[0]?.kind === 'scoped' && JSON.stringify(s.locators.target[0]).includes('tr.even'))).toEqual([]);
  });

  it('negative: a scoped link whose text carries no slot is no identity — the procedure ends instead', () => {
    const e = load('hbgc3-n1-04-edit.jsonl');
    const goto = e.find((x): x is RecordedStep => x.k === 'step' && x.tool === 'goto')!;
    const scoped = goto.linkedFrom!.chain![0] as { hasText: string };
    scoped.hasText = 'Seed: Oat milk';
    const skills = compileOne(e, { 'var:runid': 'hbgc3-n1', 'output:i3:product_name': 'hbgc3-n1 Bench Product', 'output:i3:product_id': '298407' });
    expect(transforms(skills).find((t) => t.name === 'sourcelessGoto')?.reason).toContain('the procedure ends before it');
    expect(gotos(skills)).toEqual([]);
  });
});

describe('1a. a reached chain segment\'s gate refusal is banked as a stop at step 1', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-refusal-'));
    process.env.SITELOOPER_SKILLS_DIR = tmp;
  });
  afterAll(() => {
    delete process.env.SITELOOPER_SKILLS_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const ORIGIN = 'http://127.0.0.1:8106';
  const segment = (id: string, index: number): Skill => ({
    id,
    origin: ORIGIN,
    template: 'Edit {{v1}}',
    params: { v1: { example: 'hbgc3-n1 Bench Product', usedIn: [] } },
    preconditions: { urlPattern: `${ORIGIN}/product/:id`, requireText: ['{{v1}}'] },
    steps: [{ tool: 'select', args: { target: '#location_id', option: 'Pantry' }, locators: {} }],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional',
    seq: { chain: 's_2e8ab6', index, of: 4 },
    provenance: { session: 'hbgc3-n1', instruction: 'Edit', created: 't' },
  });
  const result = (skill: Partial<SkillRecord>): InstructionResult =>
    ({
      report: { status: 'success', summary: 'edited', evidence: { values: {} } },
      turns: 12,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      timing: {},
      screenshots: [],
      skill: { listed: [], stepsReplayed: 0, stepsTotal: 1, repaired: true, fallthroughs: 0, similarity: 0.4, deterministicActions: 0, totalActions: 0, ...skill },
    }) as unknown as InstructionResult;

  it('decides "reached" only for a judged gate refusal of a segment after the head', () => {
    const gate = { refused: true, gateRefused: true };
    expect(reachedGateRefusal(gate, 's_95b77d', 's_545c55')).toBe(true);
    // The head, or a sibling candidate tried in its place: selection, nothing ran.
    expect(reachedGateRefusal(gate, 's_545c55', 's_545c55')).toBe(false);
    // Past its start: the record exists, the pin may move (pinPast).
    expect(reachedGateRefusal({ ...gate, pastStart: true }, 's_95b77d', 's_545c55')).toBe(false);
    // A contract, a missing param, an unseeable capture: no gate judged the page.
    expect(reachedGateRefusal({ refused: true }, 's_95b77d', 's_545c55')).toBe(false);
    // Not a refusal at all.
    expect(reachedGateRefusal({ refused: false, gateRefused: true }, 's_95b77d', 's_545c55')).toBe(false);
  });

  it('banks failedAt 1 and the stop streak; the second such replay demotes it (hbgc3 s_95b77d)', () => {
    const store = new SkillStore(path.join(tmp, 'banked'));
    store.put(segment('s_95b77d', 1));
    const refusal = { invoked: 's_95b77d', refused: true, reachedRefusal: true, failReason: 'the page at http://127.0.0.1:8106/product/:id does not show "hbgc3-n2 Bench Product" … — nothing was run' };
    learnFromInstruction(store, { result: result(refusal), instruction: 'Edit it', entries: [], session: 'hbgc3-n2' });
    const once = store.get('s_95b77d')!;
    expect(once.stats.failedAtStep).toEqual({ '1': 1 });
    expect(once.stats.stopStreak).toBe(1);
    expect(once.stats.uses).toBe(2);
    expect(once.stats.recoveredStops).toBe(1);
    expect(once.status).toBe('provisional');
    learnFromInstruction(store, { result: result(refusal), instruction: 'Edit it', entries: [], session: 'hbgc3-n3' });
    const twice = store.get('s_95b77d')!;
    expect(twice.stats.failedAtStep).toEqual({ '1': 2 });
    expect(twice.stats.stopStreak).toBe(2);
    expect(twice.status).toBe('demoted');
  });

  it('banks nothing for a refusal that was not reached (a sibling candidate, the head)', () => {
    const store = new SkillStore(path.join(tmp, 'sibling'));
    store.put(segment('s_545c55', 0));
    learnFromInstruction(store, { result: result({ invoked: 's_545c55', refused: true }), instruction: 'Edit it', entries: [], session: 'hbgc3-n2' });
    const s = store.get('s_545c55')!;
    expect(s.stats).toMatchObject({ uses: 1, successes: 1, failedAtStep: {} });
    expect(s.stats.stopStreak).toBeUndefined();
  });
});
