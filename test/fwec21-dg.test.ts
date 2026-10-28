/**
 * espocrm fwec21-dg 04-find, two defects.
 *
 * 1. s_73f411 (n1) expected `- heading "Opportunitiesfwec21-dg-n1 Bench
 *    Opportunity"` after its first click: EspoCRM's breadcrumb joins the
 *    module name and the record name with nothing between them, so the
 *    whole-token rule slotted neither the record name nor the runid inside
 *    it, and n2 stopped on n1's record (18 recovery turns).
 * 2. n2's recovery compiled the variant chain s_0c5352 → s_e70fa5, keeping
 *    s_73f411's click (it did its work; only its gate stopped it). n3
 *    replayed that chain 12/12 with no model, yet the flow stayed pinned to
 *    demoted s_73f411 and the compile refused: pinCarriesFailedStep condemned
 *    the chain for carrying the very step compile had kept on purpose.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills, gluedIdentifiers, gluedPattern, substitute } from '../src/skills/compile.js';
import { decideRepin, pinCarriesFailedStep } from '../src/skills/learn.js';
import { SkillStore } from '../src/skills/store.js';

const HEADING = '- heading "Opportunitiesfwec21-dg-n1 Bench Opportunity"';
const NAME = 'fwec21-dg-n1 Bench Opportunity';
const IDS = ['fwec21-dg-n1'];

describe('a known value glued to the text beside it is still slotted in a page line', () => {
  const slots = new Map([
    ['v1', NAME],
    ['v2', 'fwec21-dg-n1'],
    ['v3', 'Opportunity'],
  ]);

  it("slots the record name inside EspoCRM's breadcrumb heading", () => {
    expect(substitute(HEADING, slots, { glue: IDS })).toBe('- heading "Opportunities{{v1}}"');
    // the whole-token rule alone (selectors, urls) is unchanged
    expect(substitute(HEADING, slots)).toBe('- heading "Opportunitiesfwec21-dg-n1 Bench {{v3}}"');
  });

  it('slots a bare runid glued on either side', () => {
    expect(substitute('- heading "Opportunitiesfwec21-dg-n1"', new Map([['v2', 'fwec21-dg-n1']]), { glue: IDS })).toBe('- heading "Opportunities{{v2}}"');
    expect(substitute('- cell "fwec21-dg-n1Bench"', new Map([['v2', 'fwec21-dg-n1']]), { glue: IDS })).toBe('- cell "{{v2}}Bench"');
  });

  it('never takes the head of a longer identifier, a longer word, or a coincidence', () => {
    const g = (line: string, value: string) => substitute(line, new Map([['v1', value]]), { glue: IDS });
    // digit against digit: n1 is not n10
    expect(g('- link "fwec21-dg-n10 Bench Opportunity"', NAME)).toBe('- link "fwec21-dg-n10 Bench Opportunity"');
    expect(g('- link "fwec21-dg-n10"', 'fwec21-dg-n1')).toBe('- link "fwec21-dg-n10"');
    // a word edge keeps the token boundary
    const ids = ['fwod28-n1'];
    expect(substitute('- link "Accountsfwod28-n1 Bench Customers"', new Map([['v1', 'fwod28-n1 Bench Customer']]), { glue: ids })).toBe('- link "Accountsfwod28-n1 Bench Customers"');
    expect(substitute('- link "Accountsfwod28-n1 Bench Customer"', new Map([['v1', 'fwod28-n1 Bench Customer']]), { glue: ids })).toBe('- link "Accounts{{v1}}"');
    // no run identifier at the value's edge: whole tokens only, as before
    expect(gluedPattern('Bench Opportunity', IDS)).toBeNull();
    expect(gluedPattern('Bench fwec21-dg-n1 Opportunity', IDS)).toBeNull();
    expect(g('- heading "Benchmark"', 'Bench')).toBe('- heading "Benchmark"');
  });

  it('the identifiers are the run’s declared vars, long and with a digit', () => {
    expect(gluedIdentifiers({ 'var:runid': 'fwec21-dg-n1', 'var:user': 'admin', 'var:short': 'r1', 'output:i3:opportunity_name': NAME, 'var:spaced': 'a 123456' })).toEqual([
      'fwec21-dg-n1',
    ]);
    // no identifiers, no glue: the whole-token rule
    expect(substitute(HEADING, new Map([['v1', NAME]]), { glue: [] })).toBe(HEADING);
  });

  it("compiles n1's recording with the heading slotted, not frozen", () => {
    const entries = fs
      .readFileSync(path.join(__dirname, 'fixture', 'fwec21-dg-n1-04-find.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RecordedEntry);
    const instruction = (entries[0] as { text: string }).text;
    const skills = compileSkills({
      entries,
      instruction,
      report: { status: 'success', summary: 'stage saved', evidence: { values: {} } },
      session: 'fwec21-dg-n1',
      knownValues: { 'output:i3:opportunity_name': NAME, 'var:runid': 'fwec21-dg-n1', 'output:i3:autocomplete_list_li_sug_2': 'Opportunity' },
    });
    const lines = skills.flatMap((s) => s.steps).flatMap((s) => s.expect?.addedContains ?? []);
    const heading = lines.find((l) => l.startsWith('- heading "Opportunities'));
    expect(heading).toBeDefined();
    expect(heading).not.toContain('fwec21-dg-n1');
    const slot = /\{\{(v\d+)\}\}/.exec(heading!)?.[1];
    expect(slot).toBeDefined();
    expect(skills[0].params[slot!]?.example).toBe(NAME);
  });
});

describe('a variant chain that carries a regated step and then replays clean takes the pin', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-fwec21-'));
    fs.cpSync(path.join(__dirname, 'fixture', 'fwec21-dg-skills'), dir, { recursive: true });
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const base = {
    step: { id: '04-find', skill: 's_73f411' },
    reportStatus: 'success' as const,
    incumbent: 'demoted' as const,
    stray: 0,
    adoptable: true,
  };

  it('the published store: the chain carries s_73f411 step 1 (no mark yet), so a fresh compile is still refused', () => {
    const store = new SkillStore(dir);
    const failedStep = pinCarriesFailedStep(store, 's_0c5352');
    expect(failedStep).toMatch(/s_0c5352 replays step 1 of s_73f411/);
    // n2: the recovery's compiled chain, never replayed yet
    expect(decideRepin({ ...base, outcome: { skill: 's_73f411', status: 'demoted', ok: false }, compiled: { skill: 's_0c5352', status: 'provisional' }, failedStep })).toEqual({
      refused: expect.stringMatching(/not re-pinning s_0c5352/),
    });
  });

  it('n3: the chain replayed in full with no model takes the pin from the demoted skill', () => {
    const store = new SkillStore(dir);
    const failedStep = pinCarriesFailedStep(store, 's_0c5352');
    expect(decideRepin({ ...base, outcome: { skill: 's_0c5352', status: 'validated', ok: true }, failedStep })).toEqual({ skill: 's_0c5352', graduated: false });
  });

  it('a step compile marked regated is not the failed step (so n2 can pin it already)', () => {
    const store = new SkillStore(dir);
    store.update('s_0c5352', (sk) => ({ ...sk, steps: sk.steps.map((s) => (s.via ? { ...s, via: { ...s.via, regated: true as const } } : s)) }));
    expect(pinCarriesFailedStep(store, 's_0c5352')).toBeNull();
    expect(decideRepin({ ...base, outcome: { skill: 's_73f411', status: 'demoted', ok: false }, compiled: { skill: 's_0c5352', status: 'provisional' }, failedStep: null })).toEqual({
      skill: 's_0c5352',
      graduated: false,
    });
  });
});
