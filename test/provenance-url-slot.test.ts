import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, discoverSlots } from '../src/skills/compile.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-prov-slot-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * Round 75, gitea fwgt29-n1 05-open: the run reached issue #4 by CLICKING, so
 * no navigation url carried the one-digit id, discoverSlots gave it no slot,
 * and the live compile froze the heading as "fwgt29-n1 Bench Issue #4" (n2's
 * recovery navigated, and its re-pin slotted it). A banked url id below the
 * text floor is a slot by provenance alone; the positional writers decide
 * where it is written, and an unwritten slot is dropped.
 */
const O = 'http://127.0.0.1:3000';
const ISSUE = `${O}/bench/repo/issues/4`;
const heading = (name: string, url: string, added: string[] = []): RecordedStep => ({
  k: 'step',
  tool: 'click',
  args: { target: `role=heading[name="${name}"]` },
  locators: { target: { expr: `page.getByRole('heading', { name: '${name}' })`, verified: true, raw: name, chain: [{ kind: 'role', role: 'heading', name }] } },
  diff: { url, alerts: [], added, dialect: 2 },
});
const compile = (instruction: string, steps: RecordedStep[], knownValues: Record<string, string>) =>
  compileSkills({
    entries: [{ k: 'instruction', text: instruction, url: ISSUE } as RecordedEntry, ...steps],
    instruction,
    report: { status: 'success', summary: 'done', evidence: { values: {} } },
    session: 's',
    knownValues,
  });

describe('discoverSlots: a banked url id below the text floor is a slot by provenance', () => {
  it('admits it with no navigation step carrying it', () => {
    const slots = discoverSlots('Assign the issue to admin.', [heading('fwgt29-n1 Bench Issue #4', ISSUE)], { 'url:i4:p3': '4' });
    expect([...slots.values()]).toContain('4');
  });

  it('keeps the navigation gate for a value of two or more characters', () => {
    const slots = discoverSlots('Assign the issue to admin.', [heading('fwgt29-n1 Bench Issue #41', `${O}/bench/repo/issues/41`)], { 'url:i4:p3': '41' });
    expect([...slots.values()]).not.toContain('41');
  });

  it('admits only url origins, never a one-character value from another origin', () => {
    const slots = discoverSlots('Assign the issue to admin.', [heading('Issue #4', ISSUE)], { 'output:i4:count': '4' });
    expect([...slots.values()]).not.toContain('4');
  });
});

describe('compile writes the provenance slot into a heading name and binds it by origin (fwgt29 05-open)', () => {
  it('slots "#4" in the clicked heading with no navigation in the span', () => {
    const skills = compile(
      'Assign the issue to admin.',
      [heading('fwgt29-n1 Bench Issue #4', ISSUE, ['- heading "Assignees"'])],
      { 'url:i4:p3': '4' },
    );
    const all = JSON.stringify(skills.map((k) => k.steps));
    expect(all).not.toContain('Issue #4');
    const slot = Object.entries(skills[0].params).find(([, p]) => p.example === '4');
    expect(slot?.[1].binding).toBe('url:i4:p3');
    expect(all).toContain(`#{{${slot?.[0]}}}`);
    expect(skills[0].steps[0].args.target).toBe(`role=heading[name="fwgt29-n1 Bench Issue #{{${slot?.[0]}}}"]`);
  });

  it('drops the slot when no writer used it, leaving no param to bind', () => {
    const skills = compile('Open the labels page.', [heading('Labels', `${O}/bench/repo/labels`, ['- heading "Labels"'])], { 'url:i4:p3': '4' });
    expect(Object.values(skills[0].params).some((p) => p.example === '4')).toBe(false);
  });

  it('never writes the digit where it is not the record number', () => {
    const skills = compile('Open the list.', [heading('4 open issues', `${O}/bench/repo/issues`, ['- heading "4 open issues"'])], { 'url:i4:p3': '4' });
    expect(JSON.stringify(skills.map((k) => k.steps))).toContain('4 open issues');
    expect(Object.values(skills[0].params).some((p) => p.example === '4')).toBe(false);
  });
});
