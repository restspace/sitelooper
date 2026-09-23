import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, evalAssignedIdentifiers } from '../src/skills/compile.js';

/**
 * openproject fwop10-n1 03-create (round 54, n1 script entries 60, 65-66,
 * 94-95, verbatim but for trimmed urls and diffs): the model gave elements ids
 * by eval — `inp.id = inp.id || 'wp-new-inline-edit--field-combinedDate'`,
 * `ce.id='journal-editor-2'` — and then filled `#wp-new-…` and
 * `#journal-editor-2`. Compile drops evals, so on replay nothing ever assigns
 * those ids: the primary candidate of each fill names an element that does
 * not exist.
 */
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', 'fwop10-n1-eval-ids.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

const compile = (es: RecordedEntry[]) => {
  const head = es[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  return compileSkills({ entries: es, instruction: head.text, report: { status: 'success', summary: 'created', evidence: { values: {} } }, session: 't' });
};

describe('eval-assigned identifiers are not locators (fwop10)', () => {
  it('reads the identifiers a recorded eval assigned, from its own text', () => {
    const steps = entries().filter((e): e is RecordedStep => e.k === 'step');
    expect([...evalAssignedIdentifiers(steps)].sort()).toEqual(['journal-editor-2', 'wp-new-inline-edit--field-combinedDate']);
  });

  it('removes a candidate naming an eval-assigned id; the role and label fallbacks lead', () => {
    const fills = compile(entries())
      .flatMap((s) => s.steps)
      .filter((s) => s.tool === 'fill');
    expect(fills).toHaveLength(2);
    for (const f of fills) {
      const chain = f.locators.target ?? [];
      expect(JSON.stringify(chain)).not.toMatch(/wp-new-inline-edit|journal-editor/);
      expect(chain[0]).toMatchObject({ kind: 'role', role: 'textbox' });
    }
  });

  it('leaves a step no candidate when the eval-assigned id was all it had, and says why', () => {
    const es = entries().map((e) =>
      e.k === 'step' && e.tool === 'fill' && String(e.args.target) === '#journal-editor-2'
        ? { ...e, locators: { target: { ...e.locators.target!, chain: e.locators.target!.chain.filter((c) => c.kind === 'css') } } }
        : e,
    );
    const skills = compile(es);
    const comment = skills.flatMap((s) => s.steps).find((s) => s.tool === 'fill' && String(s.args.value).includes('comment'))!;
    expect(comment.locators.target).toEqual([]);
    const notes = skills.flatMap((s) => s.provenance.transforms ?? []);
    expect(notes.some((n) => n.name === 'dropEvalAssignedCandidates' && /journal-editor-2/.test(n.reason) && /eval/.test(n.reason))).toBe(true);
  });

  it('keeps an id the recording never assigned', () => {
    const es = entries().filter((e) => !(e.k === 'step' && e.tool === 'eval'));
    const fills = compile(es)
      .flatMap((s) => s.steps)
      .filter((s) => s.tool === 'fill');
    expect(fills.some((f) => JSON.stringify(f.locators.target).includes('#journal-editor-2'))).toBe(true);
  });
});
