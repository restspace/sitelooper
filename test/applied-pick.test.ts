/**
 * Round 61, gitea fwgt12 03-set (test/fixture/fwgt12/s_f54a5a.json, the
 * published procedure: n2's recovery, re-pinned and replayed by n3 and the
 * artifact).
 *
 * Steps 1-3 click "bug" in the Labels picker, 7 shuts it (Gitea commits), 8
 * opens it again and 9 clicks "bug" once more, recorded with `link "bug"`
 * unique. Whether 1-7 leave "bug" applied is timing: on the artifact's run
 * they did, step 9 found `link "bug"` twice (#1 ambiguous), fell to its point
 * and un-ticked it; the reads scoped to "bug" (14 and 16) then found
 * "priority-high" and were skipped, and the spec passed 1/1 while the issue
 * lost the label.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scopeSetBy } from '../src/execution/observe.js';
import { appliedPickCandidates } from '../src/execution/toggle.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import type { Skill } from '../src/skills/store.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'fwgt12');
const skill: Skill = JSON.parse(fs.readFileSync(path.join(DIR, 's_f54a5a.json'), 'utf8'));

describe('the applied-pick candidates (fwgt12 s_f54a5a)', () => {
  it('names step 9 only: a unique role pick after an earlier pick of it and a re-open', () => {
    expect([...appliedPickCandidates(skill.steps)]).toEqual([[9, { role: 'link', name: '{{v4}}' }]]);
  });

  it('names nothing without a re-open between the picks, or for a pick recorded by position', () => {
    const noReopen = skill.steps.filter((_, i) => i !== 8);
    expect(appliedPickCandidates(noReopen).size).toBe(0);
    const positional = skill.steps.map((s, i) => (i === 9 ? { ...s, locators: { target: [...(s.locators.target ?? [])].slice(1) } } : s));
    expect(appliedPickCandidates(positional).size).toBe(0);
  });
});

describe('scopeSetBy (fwgt12 s_f54a5a)', () => {
  it('says the procedure set {{v4}} ("bug"): it filled and picked it', () => {
    expect(scopeSetBy(skill.steps, 'v4')).toBe(true);
  });

  it('does not count a click on an element whose name merely contains the slot', () => {
    // step 13 clicks the heading `{{v2}} #5`: it names the record, it sets nothing
    expect(scopeSetBy(skill.steps, 'v2')).toBe(false);
    expect(scopeSetBy(skill.steps, 'v9')).toBe(false);
  });
});

describe('the artifact asks both rules (emit.ts)', () => {
  const flow: SpecFlow = {
    version: 1,
    name: 'fwgt12',
    origin: 'http://127.0.0.1:8095',
    startUrl: 'http://127.0.0.1:8095/',
    vars: [],
    steps: [{ id: '03-set', instruction: 'set the labels', params: {}, outputs: [], segments: [{ id: skill.id, template: skill.template, params: skill.params, preconditions: skill.preconditions, steps: skill.steps }] }],
  };
  const { source } = emitFlowFile(flow, { tier: 'plain' });

  it('takes the segment\'s starting page and guards step 9 (1-based 10) with pickAlreadyApplied', () => {
    expect(source).toMatch(/let pickStart\d+: string\[\] \| null = null;/);
    expect(source).toMatch(/pickStart\d+ = await pickBaseline\(page\);/);
    const guards = source.split('\n').filter((l) => l.includes('await pickAlreadyApplied(page, '));
    expect(guards).toHaveLength(1);
    expect(source).toContain('03-set s_f54a5a/10: link already applied by this run');
  });

  it('reads the scoped labels through scopedReadLanded, with set: true', () => {
    const landed = source.split('\n').filter((l) => l.includes('scopedReadLanded(await '));
    expect(landed.length).toBeGreaterThanOrEqual(2);
    for (const l of landed) expect(l).toContain("set: true, what: 'text'");
  });
});
