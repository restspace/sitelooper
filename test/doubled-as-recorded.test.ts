import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { recordedDoubled } from '../src/execution/refill.js';
import { alreadyAddedLines } from '../src/execution/positional.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * grafana fwgr73-n1 04-open (round 61), n1 script lines 103-152 verbatim. At
 * line 125 the recording model pressed Ctrl+F on monaco's `textarea.inputarea`
 * and then typed `"tags"` into that same textarea — the JSON-model editor, not
 * the Find box — and the recorded diff shows what the field then held:
 * `- textbox "Editor content;…": "tags""tags""`. The shared valueDoubled then
 * stopped every replay there (n2, n3, and the compiled run) on a state the
 * recording itself produced and carried on from.
 */
const entries = (file: string): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', file), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

const compiled = (file: string): SkillStep[] => {
  const es = entries(file);
  const head = es[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const known = { 'var:runid': 'fwgr73-n1' };
  return compileSkills({ entries: es.filter((e) => e.k !== 'report'), instruction: head.text, report: { status: 'success', summary: 'ok' }, session: 't', knownValues: known }).flatMap((s) => s.steps);
};

describe('recordedDoubled: the recording\'s own field already held the value twice (fwgr73 04-open line 125)', () => {
  it('flags the type into the monaco editor', () => {
    const steps = compiled('fwgr73-n1-04-open.jsonl');
    const typed = steps.filter((s) => s.tool === 'type' && JSON.stringify(s.args).includes('tags'));
    expect(typed).toHaveLength(1);
    expect(typed[0].doubledAsRecorded).toBe(true);
  });

  it('flags no other type or fill in the same recording', () => {
    const steps = compiled('fwgr73-n1-04-open.jsonl');
    const others = steps.filter((s) => (s.tool === 'type' || s.tool === 'fill') && !JSON.stringify(s.args).includes('tags'));
    expect(others.length).toBeGreaterThan(0); // the tag fill "bench"
    expect(others.every((s) => !s.doubledAsRecorded)).toBe(true);
  });

  it('reads the named field only, by the same role and name or label', () => {
    const chain = [{ kind: 'role', role: 'textbox', name: 'Editor content' }];
    expect(recordedDoubled(['- textbox "Editor content": "tags""tags""'], chain, '"tags"')).toBe(true);
    // fwec10's control: the recording saw the value once, so no flag
    expect(recordedDoubled(['- textbox "Amount": 12500'], [{ kind: 'label', label: 'Amount' }], '12500')).toBe(false);
    // doubled, but in ANOTHER field: not this step's evidence
    expect(recordedDoubled(['- textbox "Notes": 1250012500'], [{ kind: 'label', label: 'Amount' }], '12500')).toBe(false);
    // a marker value is never compared
    expect(recordedDoubled(['- textbox "Amount": {{v1}}{{v1}}'], [{ kind: 'label', label: 'Amount' }], '{{v1}}')).toBe(false);
  });
});

describe('alreadyAddedLines: the lines an adding-only click may be skipped on (fwgr73 05-open step 3)', () => {
  const steps = compiled('fwgr73-n1-05-open.jsonl');
  const edit = steps.findIndex((s) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes('Edit dashboard button'));

  it("the Edit click's recorded additions are its skip lines", () => {
    expect(edit).toBeGreaterThan(0);
    expect(alreadyAddedLines(steps, edit)).toEqual(['- button "Add"', '- button "Settings"', '- button "Exit edit"', '- button "Save dashboard"', '- button "More save options"']);
  });

  it('never a click that submits the segment\'s work: an earlier fill, type or select', () => {
    const withFill: SkillStep[] = [{ tool: 'fill', args: { target: '@e1', value: 'x' }, locators: {} }, ...steps];
    expect(alreadyAddedLines(withFill, edit + 1)).toEqual([]);
  });

  it('never one that closes what it opened, alerts, mints, or has a required removal', () => {
    const at = (patch: Partial<SkillStep>) => {
      const s = [...steps];
      s[edit] = { ...s[edit], ...patch, expect: { ...s[edit].expect, ...(patch.expect ?? {}) } };
      return alreadyAddedLines(s, edit);
    };
    expect(at({ expect: { removedContains: ['- dialog "Save dashboard"'] } })).toEqual([]);
    expect(at({ expect: { alertContains: 'Dashboard saved' } })).toEqual([]);
    expect(at({ mints: { at: 'p1' } as SkillStep['mints'] })).toEqual([]);
    expect(at({ expect: { removalRequired: true } })).toEqual([]);
  });

  it('never a popup opener (the opener guard owns those) or a non-click', () => {
    const s = [...steps];
    s[edit] = { ...s[edit], expect: { ...s[edit].expect, addedContains: ['- menu "Off Auto 5s"'] } };
    expect(alreadyAddedLines(s, edit)).toEqual([]);
    const t = [...steps];
    t[edit] = { ...t[edit], tool: 'press' };
    expect(alreadyAddedLines(t, edit)).toEqual([]);
  });
});
