import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseScript, type RecordedStep } from '../src/daemon/recorder.js';
import { keyPicks, pickedByKey } from '../src/skills/key-pick.js';

/**
 * Which option a key press picked, from the recorder journal (round 62, gitea
 * fwgt13-n1 02-create, the published recording with its live journal): every
 * label, the milestone and the assignee were picked by ArrowDown ×k + Enter,
 * and replayed by position they picked enhancement, Backlog and admin.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const steps = parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwgt13-n1-02-create.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries.filter(
  (e): e is RecordedStep => e.k === 'step',
);
const bySeq = (seq: number) => steps.find((s) => s.seq === seq)!;

describe('pickedByKey / keyPicks (gitea fwgt13 02-create)', () => {
  it('an Enter that ticked an option names it, with the direction', () => {
    expect(pickedByKey(bySeq(65))).toMatchObject({ key: 'Enter', option: 'priority-high', kind: 'toggle', on: true });
    expect(pickedByKey(bySeq(49))).toMatchObject({ option: 'enhancement', kind: 'toggle', on: true });
    expect(pickedByKey(bySeq(55))).toMatchObject({ option: 'enhancement', kind: 'toggle', on: false });
    expect(pickedByKey(bySeq(59))).toMatchObject({ option: 'bug', kind: 'toggle', on: true });
    expect(pickedByKey(bySeq(77))).toMatchObject({ option: 'Bench Milestone', kind: 'toggle', on: true });
    expect(pickedByKey(bySeq(85))).toMatchObject({ option: 'bench-assignee (Bench Assignee)', kind: 'toggle', on: true });
  });

  it('an arrow key names the option it highlighted', () => {
    expect(pickedByKey(bySeq(74))).toMatchObject({ key: 'ArrowDown', option: 'Bench Milestone', kind: 'highlight' });
    expect(pickedByKey(bySeq(63))).toMatchObject({ option: 'priority-high', kind: 'highlight' });
  });

  it('not a key press, or nothing journaled: null', () => {
    expect(pickedByKey(bySeq(26))).toBeNull(); // a click
    expect(pickedByKey({ k: 'step', tool: 'press', args: { key: 'Enter' }, locators: {} })).toBeNull();
  });

  it('keyPicks: every pick key of the instruction, by step index', () => {
    const picks = [...keyPicks(steps)].map(([i, p]) => [steps[i].seq, p.option, p.on]);
    expect(picks).toEqual([
      [36, 'bug', false],
      [49, 'enhancement', true],
      [55, 'enhancement', false],
      [59, 'bug', true],
      [65, 'priority-high', true],
      [77, 'Bench Milestone', true],
      [85, 'bench-assignee (Bench Assignee)', true],
    ]);
  });

  it('a pick key with no toggle of its own takes the highlight the moves before it left', () => {
    const syn = (seq: number, key: string, ev: object[]): RecordedStep => ({ k: 'step', seq, tool: 'press', args: { key }, locators: {}, journal: { w: seq, ev: ev.map((e) => ({ t: seq, c: ['in', seq, 'gesture'], ...e })) as never } });
    const run = [syn(1, 'ArrowDown', [{ k: 'state', d: 'option "Office Chair"', a: 'class', x: '+active' }]), syn(2, 'Enter', [])];
    expect([...keyPicks(run)].map(([i, p]) => [i, p.option, p.kind])).toEqual([[1, 'Office Chair', 'highlight']]);
  });
});
