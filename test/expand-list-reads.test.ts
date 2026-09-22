import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, expandListReads } from '../src/skills/compile.js';

/**
 * openproject fwop7-n1 02-open (FIX Z): the seed subjects were read only
 * through a read_all whose every element was one reported value; the list read
 * was dropped, the values pruned, and no replay reported them. Parity (both
 * runners publish the split reads) is test/execution-parity.test.ts "list
 * reads split per element".
 */
const SEL = 'span.wp-table--cell-td.subject, td.subject, .subject .wp-table--cell-span';
const listRead = (result: string[], selector = SEL, extraChain: RecordedStep['locators']['target']['chain'] = []): RecordedStep => ({
  k: 'step',
  tool: 'read_all',
  args: { target: selector, what: 'text' },
  locators: { target: { expr: 'x', verified: true, raw: selector, chain: [{ kind: 'css', selector }, ...extraChain] } },
  result: JSON.stringify(result),
});
const subjects = ['Work package leaf at level 0.\nSeed: triage inbox', 'Work package leaf at level 0.\nSeed: order missing parts', 'Work package leaf at level 0.\nSeed: ship repaired device'];
const reported = {
  total_work_packages_in_project: '3',
  seed_subject_1: 'Seed: triage inbox',
  seed_subject_1_full_cell_text: subjects[0],
  seed_subject_2_full_cell_text: subjects[1],
  seed_subject_3_full_cell_text: subjects[2],
};

describe('expandListReads (FIX Z)', () => {
  it('splits the fwop7 read_all into one labelled nth read per element', () => {
    const out = expandListReads([listRead(subjects, SEL, [{ kind: 'point', x: 1, y: 1, w: 1, h: 1, role: null, tag: 'span', vw: 1280, vh: 900 }])], reported);
    expect(out.map((s) => [s.tool, s.label, s.locators.target.chain])).toEqual(
      [0, 1, 2].map((i) => ['read', `seed_subject_${i + 1}_full_cell_text`, [{ kind: 'css', selector: SEL, nth: i }]]),
    );
    expect(JSON.parse(out[1].result!)).toBe(subjects[1]);
  });

  it('compiles them as published reads', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'List the seed subjects', url: 'http://127.0.0.1:8090/projects/bench-project/work_packages' },
      listRead(subjects),
    ];
    const [skill] = compileSkills({ entries, instruction: 'List the seed subjects', report: { status: 'success', summary: 'ok', evidence: { values: reported } }, session: 's' });
    expect(skill.steps.map((s) => s.label)).toEqual(['seed_subject_1_full_cell_text', 'seed_subject_2_full_cell_text', 'seed_subject_3_full_cell_text']);
  });

  it('fwod53 negative: one cell of a row matched and the rest is junk, so the list read is left alone (and dropped)', () => {
    const row = listRead(['', '[FURN_7777] Office Chair', '3.00', '295.00', '20%', '£ 885.00'], 'td');
    expect(expandListReads([row], { product_name: '[FURN_7777] Office Chair' })).toEqual([row]);
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Read the order line', url: 'http://x.test/order' },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Lines' }] } } },
      row,
    ];
    const [skill] = compileSkills({ entries, instruction: 'Read the order line', report: { status: 'success', summary: 'ok', evidence: { values: { product_name: '[FURN_7777] Office Chair' } } }, session: 's' });
    expect(skill.steps.some((s) => s.tool === 'read' || s.tool === 'read_all')).toBe(false);
  });

  it('needs distinct values: two elements matching one value are not two sources', () => {
    const dup = listRead(['Seed: triage inbox', 'Seed: triage inbox']);
    expect(expandListReads([dup], { seed_subject_1: 'Seed: triage inbox' })).toEqual([dup]);
  });

  it('leaves a list read whose joined text is itself a reported value to its list label', () => {
    const joined = listRead(['a1', 'b2']);
    expect(expandListReads([joined], { both: 'a1, b2', first: 'a1', second: 'b2' })).toEqual([joined]);
  });
});
