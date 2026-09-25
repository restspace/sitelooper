/**
 * Round 62 — snipeit fwsi13 (results/fwsi13-s5ox5m). test/fixture/fwsi13-n1-script.jsonl
 * is the published n1 recording.
 *
 * 1. 03-create picked the model with a select2 widget in two gestures: #52
 *    typed "Bench Laptop Model" into its search (the journal: the results
 *    request returned and the one option gained
 *    `+select2-results__option--highlighted`), and #53 clicked the widget's
 *    own combobox, which closed it — and select2's selectOnClose committed the
 *    HIGHLIGHTED option (#53's diff: `- combobox "×Bench Laptops - Bench
 *    Manufacturer Bench Laptop Model"`). Compiled, s_40b664 step 8 clicked
 *    `#model_select_id` (the hidden native select). On n2 the click came
 *    before the results were highlighted and picked nothing: "after step 8 the
 *    page did not show "- combobox "×{{*}} - {{*}} Bench Laptop Model"" …".
 *    The option's NAME is the fact; the highlight is timing. The step becomes
 *    a click on that option by name, as the status and location picks are.
 *
 * 2. 02-report's model reported `assets` as an array of {tag, name} objects;
 *    report coercion joined them with String() into "[object Object], …", so
 *    the seed names never reached a value and no replay reported them (n2, n3
 *    obj 1: "not in report: SEED-0003 Seed: Spare Laptop, …").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { validateReport } from '../src/agent/report.js';
import { compileSkills } from '../src/skills/compile.js';
import { highlightPicks } from '../src/skills/highlight-pick.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwsi13-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;
const OPTION = 'Bench Laptops - Bench Manufacturer Bench Laptop Model';

function create03(): RecordedEntry[] {
  const e = load();
  const start = e.findIndex((x) => x.k === 'instruction' && x.text.startsWith('Create a new asset'));
  const end = e.findIndex((x, i) => i > start && x.k === 'report');
  return e.slice(start, end + 1);
}

describe('a click that committed the highlighted option is a pick by that option’s name (fwsi13 #52-#53)', () => {
  it('names the option #53 picked', () => {
    const steps = create03().filter((x): x is RecordedStep => x.k === 'step');
    const picks = highlightPicks(steps);
    const at = steps.findIndex((s) => s.args.target === '@e158');
    expect(picks.get(at)).toBe(OPTION);
  });

  it('s_40b664 step 8 clicks the option by name, not the hidden select', () => {
    const own = create03();
    const report = own[own.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    const steps = compileSkills({
      entries: own.slice(0, -1),
      instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
      session: 'fwsi13-n1',
      knownValues: { 'var:runid': 'fwsi13-n1' },
    }).flatMap((s) => s.steps);
    const typed = steps.findIndex((s) => s.tool === 'type' && s.args.target === '@e161');
    const pick = steps[typed + 1];
    expect(pick.tool).toBe('click');
    expect(pick.locators.target[0]).toEqual({ kind: 'role', role: 'option', name: expect.stringMatching(/Bench Laptop Model|\{\{v\d+\}\}/) });
    expect(JSON.stringify(pick.locators.target)).not.toContain('#model_select_id');
    expect(pick.expect?.addedContains?.some((l) => l.startsWith('- combobox "×'))).toBe(true);
  });

  it('leaves a click on the option itself, and a click that picked nothing, alone', () => {
    const steps = create03().filter((x): x is RecordedStep => x.k === 'step');
    const picks = highlightPicks(steps);
    // #55 clicked role=option "Ready to Deploy" directly: already a named pick.
    const direct = steps.findIndex((s) => s.args.target === 'role=option[name="Ready to Deploy"]');
    expect(picks.has(direct)).toBe(false);
    // Without the committed value in its diff, #53 is not a pick.
    const bare = steps.map((s) => (s.args.target === '@e158' ? { ...s, diff: { ...s.diff!, added: [] } } : s));
    expect([...highlightPicks(bare).keys()]).toEqual([]);
  });
});

describe('an array of objects in a report value is flattened to named scalars, never "[object Object]" (fwsi13 02-report)', () => {
  it('keeps each element’s fields', () => {
    const r = validateReport({
      status: 'success',
      summary: 'three seed assets',
      evidence: {
        values: {
          assets: [
            { tag: 'SEED-0001', name: 'Seed: Reception Laptop' },
            { tag: 'SEED-0002', name: 'Seed: Training Laptop' },
          ],
        },
      },
    });
    expect(r.ok).toBe(true);
    const values = r.ok ? (r.report.evidence?.values ?? {}) : {};
    expect(JSON.stringify(values)).not.toContain('[object Object]');
    expect(values).toMatchObject({ assets_1_tag: 'SEED-0001', assets_1_name: 'Seed: Reception Laptop', assets_2_tag: 'SEED-0002', assets_2_name: 'Seed: Training Laptop' });
  });

  it('still joins an array of scalars into one value', () => {
    const r = validateReport({ status: 'success', summary: 'ids', evidence: { values: { ids: ['a1', 'b2'] } } });
    expect(r.ok && r.report.evidence?.values?.ids).toBe('a1, b2');
  });
});
