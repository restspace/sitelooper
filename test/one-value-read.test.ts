/**
 * Round 64 — vikunja fwvk15 (results/fwvk15-1gz5g3). test/fixture/fwvk15-n1-script.jsonl
 * is the published n1 recording.
 *
 * 01-signin's read-back of visible_projects_2 ("Bench Project") was recorded
 * with ONE rung, `role=link name="Bench Project"`. On the landing that names the
 * sidebar entry and every task row's project link (the artifact's failure
 * snapshot: four `link "Bench Project"`). The Inbox read just before it
 * resolved, so the page had rendered: this was not landing timing. It was
 * unique-or-nothing resolution, which skipped the read on both replays and in
 * the artifact ("no element matched any known locator"; "read target not
 * found"). visible_projects_2 was published empty, and 02-open, 03-create and
 * 08-open fell back on the unresolved reference.
 *
 * A text read whose matches all read the same is one answer (resolve.ts
 * oneValueRead). The runtime half is the parity case "a text read whose target
 * names several elements that all read the same"; this pins the recording's
 * shape and that both runners ask for it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { readsOneValue } from '../src/execution/lifecycle.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwvk15-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;

function signin() {
  const e = load();
  const at = e.findIndex((x) => x.k === 'instruction');
  const end = e.findIndex((x, i) => i > at && x.k === 'report');
  const own = e.slice(at, end);
  const report = e[end] as Extract<RecordedEntry, { k: 'report' }>;
  return compileSkills({
    entries: own,
    instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
    session: 'fwvk15-n1',
    knownValues: { 'var:runid': 'fwvk15-n1' },
  });
}

describe('fwvk15 01-signin: the project read-back is a text read by one name the landing repeats', () => {
  it('compiles to a one-rung `role=link "Bench Project"` text read, which both runners resolve as one value', () => {
    const skills = signin();
    const read = skills.flatMap((s) => s.steps).find((s) => s.tool === 'read' && s.label === 'visible_projects_2')!;
    expect(read).toBeTruthy();
    expect(read.locators.target).toEqual([{ kind: 'role', role: 'link', name: 'Bench Project' }]);
    expect(readsOneValue(read.tool, read.args)).toBe(true);
    // not a count, not a read_all
    expect(readsOneValue('read', { what: 'count' })).toBe(false);
    expect(readsOneValue('read_all', { what: 'text' })).toBe(false);
  });

  it('the artifact asks the shared resolver for it (oneValueRead), as replay does', () => {
    const skills = signin();
    const seg = skills.find((s) => s.steps.some((st) => st.label === 'visible_projects_2'))!;
    const origin = 'http://127.0.0.1:8096';
    const spec: SpecFlow = {
      version: 1,
      name: 'fwvk15',
      origin,
      startUrl: `${origin}/`,
      vars: [],
      steps: [{ id: '01-signin', instruction: seg.template, params: {}, outputs: ['visible_projects_2'], segments: [{ id: seg.id, template: seg.template, params: {}, preconditions: seg.preconditions, steps: seg.steps }] }],
    };
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    expect(source).toContain('oneValueRead: true');
  });
});
