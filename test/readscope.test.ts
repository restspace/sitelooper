import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { scopeReadBySlot } from '../src/skills/readscope.js';
import { markFrame } from '../src/execution/text.js';
import { scopedRead } from '../src/execution/observe.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * Round 55 item 17, repairdesk fwrd87 04-add. s_9e190d was recorded adding
 * "fwrd87-n1 RD Part A" and replayed for Part B. Its part_name reads (steps 7
 * and 12) recorded that very name but carried no candidate scoped by the
 * part-name slot {{v4}}: the positional primary matched both rows on replay,
 * the fallback was Part A's own test hook, and n2/n3 published Part A's name
 * beside Part B's cost. Step 18's frame hard-coded "{{=}} RD Part A".
 */
const RUNID = 'fwrd87-n1';
const PART = `${RUNID} RD Part A`;
const positional: LocatorCandidate = { kind: 'css', selector: 'section > div > table > tbody > tr > td:nth-of-type(1)' };
const bookmark: LocatorCandidate = { kind: 'css', selector: '[data-testid="part-row-p18"] td', nth: 0 };
const slots = new Map([
  ['v3', RUNID],
  ['v4', PART],
  ['v5', '100'],
]);

describe('scopeReadBySlot (fwrd87)', () => {
  it('scopes a read whose recorded value is a locating slot’s value, and lets the slot find it', () => {
    const args: Record<string, unknown> = { target: '(read-back)', what: 'text' };
    const locators = { target: [positional, bookmark] };
    scopeReadBySlot(JSON.stringify(PART), 'read', args, locators, slots, new Set(['v4']));
    expect(args.scopedBy).toBe('v4');
    expect(locators.target[0]).toEqual({ kind: 'text', text: '{{v4}}' });
    expect(locators.target.slice(1)).toEqual([positional, bookmark]);
  });

  it('scopes a read whose value merely contains the slot, adding no candidate it cannot vouch for', () => {
    const args: Record<string, unknown> = { target: '(read-back)', what: 'text' };
    const locators = { target: [positional] };
    scopeReadBySlot(JSON.stringify(`Part: ${PART}`), 'read', args, locators, slots, new Set(['v4']));
    expect(args.scopedBy).toBe('v4');
    expect(locators.target).toEqual([positional]);
  });

  it('leaves a read alone when the slot it carries is not one the procedure locates by', () => {
    // part_cost "$100.00" carries v5's "100", a value typed into a field and
    // never used to find anything: a coincidence, not a record.
    const args: Record<string, unknown> = { target: '(read-back)', what: 'text' };
    const locators = { target: [positional] };
    scopeReadBySlot(JSON.stringify('$100.00'), 'read', args, locators, slots, new Set(['v4']));
    expect(args.scopedBy).toBeUndefined();
    expect(locators.target).toEqual([positional]);
  });

  it('keeps a chain that already names the slot as it is', () => {
    const scoped: LocatorCandidate = { kind: 'scoped', container: 'tr', hasText: '{{v4}}', selector: 'td:nth-of-type(1)' };
    const args: Record<string, unknown> = { target: '(read-back)', what: 'text' };
    const locators = { target: [scoped, positional] };
    scopeReadBySlot(JSON.stringify(PART), 'read', args, locators, slots, new Set(['v4']));
    expect(args.scopedBy).toBe('v4');
    expect(locators.target).toEqual([scoped, positional]);
  });

  it('writes a frame whose line is a slot’s value in that slot, marked at the slot the value is', () => {
    const args: Record<string, unknown> = { target: '(read-back)', what: 'text', frame: '{{=}} RD Part A' };
    const locators = { target: [positional] };
    scopeReadBySlot(JSON.stringify(RUNID), 'read', args, locators, slots, new Set(['v4']));
    expect(args.frame).toBe('{{=}} RD Part A');
    expect(args.slotFrame).toBe('{{v4}}');
    expect(args.frameMark).toBe('v3');
  });

  it('never touches a plural read or one with no recorded value', () => {
    const args: Record<string, unknown> = { target: 'td', what: 'text' };
    const locators = { target: [positional] };
    scopeReadBySlot(JSON.stringify([PART]), 'read_all', args, locators, slots, new Set(['v4']));
    scopeReadBySlot(undefined, 'read', args, locators, slots, new Set(['v4']));
    expect(args).toEqual({ target: 'td', what: 'text' });
    expect(locators.target).toEqual([positional]);
  });
});

describe('the run-time half: markFrame and scopedRead', () => {
  it('marks this run’s line at this run’s value, once or not at all', () => {
    expect(markFrame('fwrd87-n2 RD Part B', 'fwrd87-n2')).toBe('{{=}} RD Part B');
    expect(markFrame('fwrd87-n2 and fwrd87-n2', 'fwrd87-n2')).toBeNull();
    expect(markFrame('fwrd87-n22 RD Part B', 'fwrd87-n2')).toBeNull();
    expect(markFrame('{{=}} RD Part B', 'fwrd87-n2')).toBeNull();
  });

  it('publishes the span this run’s frame marks, and refuses another record’s value', () => {
    expect(scopedRead('fwrd87-n2 RD Part B', { frame: '{{=}} RD Part A', slotFrame: 'fwrd87-n2 RD Part B', mark: 'fwrd87-n2' })).toBe('fwrd87-n2');
    // no mark value this run: the recorded frame, which Part B's row does not show
    expect(() => scopedRead('fwrd87-n2 RD Part B', { frame: '{{=}} RD Part A', slotFrame: 'fwrd87-n2 RD Part B' })).toThrow(/no longer shows/);
    expect(scopedRead('fwrd87-n2 RD Part B', { within: 'fwrd87-n2 RD Part B' })).toBe('fwrd87-n2 RD Part B');
    expect(() => scopedRead('fwrd87-n2 RD Part A', { within: 'fwrd87-n2 RD Part B' })).toThrow(/another record/);
    // a slot this run did not bind asks nothing
    expect(scopedRead('fwrd87-n2 RD Part A', { within: undefined })).toBe('fwrd87-n2 RD Part A');
  });
});

describe('compileSkills scopes the fwrd87 reads', () => {
  it('slots Part A’s name out of the part_name read and the bench_run_tag frame', () => {
    const url = 'http://x.test/#/tickets/t15';
    const chainOf = (chain: LocatorCandidate[]) => ({ target: { expr: 'x', verified: true, raw: '(read-back)', chain } });
    const read = (label: string, result: string, chain: LocatorCandidate[], extra: Record<string, unknown> = {}): RecordedStep => ({
      k: 'step',
      tool: 'read',
      args: { target: '(read-back)', what: 'text', ...extra },
      locators: chainOf(chain),
      result: JSON.stringify(result),
      label,
    });
    const scopedCell = (n: number): LocatorCandidate => ({ kind: 'scoped', container: 'tr', hasText: PART, selector: `td:nth-of-type(${n})` });
    const instruction = `On the ticket of run ${RUNID}, add a part named '${PART}' with cost 100. Report the part's name and cost.`;
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instruction, url },
      {
        k: 'step',
        tool: 'fill',
        args: { target: '#f-name', value: PART },
        locators: { target: { expr: 'x', verified: true, raw: '#f-name', chain: [{ kind: 'id', selector: '#f-name' }] } },
        diff: { url, alerts: [], added: [`- textbox "Part name": ${PART}`], dialect: 2 },
      },
      {
        k: 'step',
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Add part' }] } },
        diff: { url, alerts: [], added: [`- cell "${PART}"`], dialect: 2 },
      },
      read('part_name', PART, [bookmark, positional]),
      read('part_cost', '$100.00', [scopedCell(2), { kind: 'css', selector: 'section > div > table > tbody > tr > td:nth-of-type(2)' }]),
      read('bench_run_tag', RUNID, [scopedCell(1), { kind: 'text', text: PART }, bookmark, positional], { frame: '{{=}} RD Part A' }),
    ];
    const [skill] = compileSkills({
      entries,
      instruction,
      report: { status: 'success', summary: 'added', evidence: { values: { part_name: PART, part_cost: '$100.00', bench_run_tag: RUNID } } },
      session: 's',
      knownValues: { runid: RUNID },
    });
    const byLabel = (label: string) => skill.steps.find((s) => s.label === label)!;
    const v4 = Object.entries(skill.params).find(([, p]) => p.example === PART)?.[0];
    const v3 = Object.entries(skill.params).find(([, p]) => p.example === RUNID)?.[0];
    expect(v4, JSON.stringify(skill.params)).toBeDefined();
    expect(v3, JSON.stringify(skill.params)).toBeDefined();
    const name = byLabel('part_name');
    expect(name.args.scopedBy).toBe(v4);
    expect(name.locators.target[0]).toEqual({ kind: 'text', text: `{{${v4}}}` });
    // the cost is found by the row the slot names already, and carries no slot of its own
    expect(byLabel('part_cost').args.scopedBy).toBeUndefined();
    const tag = byLabel('bench_run_tag');
    expect(tag.args.slotFrame).toBe(`{{${v4}}}`);
    expect(tag.args.frameMark).toBe(v3);
  });
});

describe('the artifact carries the same rules (emit.ts)', () => {
  const flow = (steps: SkillStep[]): SpecFlow => ({
    version: 1,
    name: 'r55',
    origin: 'http://x.test',
    startUrl: 'http://x.test/',
    vars: [],
    steps: [
      {
        id: '01-add',
        instruction: 'add {{v1}}',
        params: { v1: PART, v2: RUNID },
        outputs: ['part_name', 'bench_run_tag'],
        segments: [
          {
            id: 's_r55',
            template: 'add {{v1}}',
            params: { v1: { example: PART, usedIn: [1, 2], known: true }, v2: { example: RUNID, usedIn: [], known: true } },
            preconditions: { urlPattern: 'http://x.test/' },
            steps,
          },
        ],
      },
    ],
  });

  it('reads a slot-scoped value through the embedded scopedRead, with this run’s slot values', () => {
    const { source } = emitFlowFile(
      flow([
        { tool: 'read', args: { target: '(read-back)', what: 'text', scopedBy: 'v1' }, label: 'part_name', locators: { target: [{ kind: 'text', text: '{{v1}}' }, positional] } },
        {
          tool: 'read',
          args: { target: '(read-back)', what: 'text', frame: '{{=}} RD Part A', slotFrame: '{{v1}}', frameMark: 'v2' },
          label: 'bench_run_tag',
          locators: { target: [{ kind: 'scoped', container: 'tr', hasText: '{{v1}}', selector: 'td:nth-of-type(1)' }] },
        },
      ]),
      { tier: 'plain' },
    );
    const lines = source
      .split('\n')
      .filter((l) => l.includes('scopedRead(await'))
      .join('\n');
    expect(lines).toContain("scopedRead(await readElements(loc, false, 'text'), { within: p['v1'] })");
    expect(lines).toContain("scopedRead(await readElements(loc, false, 'text'), { frame: '{{=}} RD Part A', slotFrame: `${p.v1}`, mark: p['v2'] })");
    expect(source).toMatch(/^function scopedRead\(/m);
    expect(source).toMatch(/^function markFrame\(/m);
  });

  it('asserts a text wait on rendered text (fwop10)', () => {
    const { source } = emitFlowFile(
      flow([{ tool: 'wait_for', args: { target: '@e1', state: 'text_contains', text: 'OVERVIEW' }, locators: { target: [{ kind: 'css', selector: '#tab' }] } }]),
      { tier: 'plain' },
    );
    expect(source).toContain(".toContainText('OVERVIEW', { useInnerText: true });");
  });
});
