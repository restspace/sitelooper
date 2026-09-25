/**
 * Round 63 — snipeit fwsi14 (results/fwsi14-04yc6o) 02-create. test/fixture/fwsi14-n1-script.jsonl
 * is the published n1 recording.
 *
 * The app minted the new asset's tag: #26's create form came PRE-FILLED with
 * it (`- textbox "Asset Tag": BA-00004`) and #40's save alert repeated it
 * ("Asset with tag BA-00004 was created successfully"). #41 typed it into
 * "Lookup by Asset Tag" and #42 pressed Enter. Compiled, s_bc3a9e typed the
 * literal BA-00004 on every replay: n2's asset was BA-00005, so the lookup
 * missed — and one that hit would have opened, and the next segments checked
 * out, the RECORDING's asset.
 *
 * A fill or type of a value the app minted in this run is never replayed as a
 * literal: slotted where a published source binds it (a known value, a stated
 * one), otherwise the procedure ends before it (as sourcelessGoto does) and
 * replay recovers there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwsi14-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;

function split(): { before: RecordedEntry[]; create: RecordedEntry[] } {
  const e = load();
  const at = e.findIndex((x) => x.k === 'instruction' && x.text.startsWith('In Snipe-IT, create'));
  const end = e.findIndex((x, i) => i > at && x.k === 'report');
  return { before: e.slice(0, at), create: e.slice(at, end + 1) };
}

function compile02(opts: { instruction?: (t: string) => string; known?: Record<string, string> } = {}) {
  const { before, create } = split();
  const first = create[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const text = opts.instruction ? opts.instruction(first.text) : first.text;
  const own = [{ ...first, text }, ...create.slice(1, -1)];
  const report = create[create.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
  return compileSkills({
    entries: own,
    instruction: text,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
    session: 'fwsi14-n1',
    knownValues: { 'var:runid': 'fwsi14-n1', ...(opts.known ?? {}) },
    before,
  });
}

const steps = (skills: ReturnType<typeof compileSkills>) => skills.flatMap((s) => s.steps);
const noted = (skills: ReturnType<typeof compileSkills>) => skills.flatMap((s) => s.provenance.transforms ?? []).filter((t) => t.name === 'mintedFill');

describe('a fill of a value the app minted is never replayed as a literal (fwsi14 02-create #41)', () => {
  it('ends the procedure before the lookup: its last step is the save, and BA-00004 is typed nowhere', () => {
    const skills = compile02();
    const all = steps(skills);
    expect(all.some((s) => (s.tool === 'fill' || s.tool === 'type') && JSON.stringify(s.args).includes('BA-00004'))).toBe(false);
    const last = all.at(-1)!;
    expect([last.tool, last.args.target]).toEqual(['click', 'role=button[name="Save"] >> nth=0']);
    const notes = noted(skills);
    expect(notes.length).toBe(1);
    expect(notes[0].reason).toContain('BA-00004');
    // what the run typed itself still replays
    expect(all.some((s) => s.tool === 'fill' && s.args.value === '{{v2}}')).toBe(true);
  });

  it('control: stated in the task, it is the task\'s value and replays (slotted)', () => {
    const skills = compile02({ instruction: (t) => `${t} Then look the asset up by its tag BA-00004.` });
    expect(noted(skills)).toEqual([]);
    const fill = steps(skills).find((s) => s.tool === 'fill' && String(s.args.target) === '@e41')!;
    expect(fill).toBeTruthy();
    expect(String(fill.args.value)).toMatch(/^\{\{v\d+\}\}$/);
  });

  it('control: a value only a pre-filled field showed (an app default, fwgr71/fwgh6) is not called minted', () => {
    const { create } = split();
    const save = create.find((x) => x.k === 'step' && x.seq === 40) as Extract<RecordedEntry, { k: 'step' }>;
    const alerts = save.diff!.alerts;
    save.diff!.alerts = [];
    try {
      // compile02 re-reads the fixture, so rebuild the call here with the edited entries
      const { before } = split();
      const own = create.slice(0, -1);
      const report = create[create.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
      const skills = compileSkills({
        entries: own,
        instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
        report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
        session: 'fwsi14-n1',
        knownValues: { 'var:runid': 'fwsi14-n1' },
        before,
      });
      expect(noted(skills)).toEqual([]);
    } finally {
      save.diff!.alerts = alerts;
    }
  });

  it('control: a published source binds it (a known value), so it is slotted, not dropped', () => {
    const skills = compile02({ known: { 'output:i1:next_tag': 'BA-00004' } });
    expect(noted(skills).map((t) => t.reason)).toEqual([expect.stringContaining('slotted to its published source output:i1:next_tag')]);
    const fill = steps(skills).find((s) => s.tool === 'fill' && String(s.args.target) === '@e41')!;
    const slot = /^\{\{(v\d+)\}\}$/.exec(String(fill.args.value))?.[1];
    expect(slot).toBeTruthy();
    expect(skills[0].params[slot!]?.binding ?? skills.find((s) => s.params[slot!])?.params[slot!].binding).toBe('output:i1:next_tag');
  });
});
