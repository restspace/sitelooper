import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedReport } from '../src/daemon/recorder.js';
import { compileSkills, discoverSlots } from '../src/skills/compile.js';
import { taskWordOutputs } from '../src/skills/flow.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

/**
 * Round 64, kanboard fwkb45 06-change (s_31d4dd, published in
 * fixture/fwkb45-s_31d4dd.json). The read-only final check's recording read
 * the task page and the board and typed nothing. The ledger held earlier
 * OUTPUTS that are ordinary words — "text" (an earlier read of an input's
 * type, output:i5:form_date_due_form_date_) and "open" (output:i2:task_status)
 * — and discoverSlots slotted every known value "by policy" wherever it stood
 * as a token: the template became "Then {{v5}} task #4's page … the
 * description {{v6}}, the comment {{v6}}", and every read's MODE became
 * `what: "{{v6}}"`. The compile refused ("read what={{v6}} has no Tier 2
 * form" ×17); n2/n3 passed only because both bound v6 to "text".
 *
 * Two rules. A tool's MODE arguments (read `what`, wait_for `state`, …) are
 * never data: nothing is ever slotted into them. And an earlier step's OUTPUT
 * is slotted into this instruction only where the procedure USED it — typed,
 * chose or navigated it, or located an element by it — never by a bare word
 * match in the prose. Declared vars (the runid) and url-minted parts keep
 * today's policy.
 */
const FIX = path.join(__dirname, 'fixture');
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(FIX, 'fwkb45-n1-script.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);
const published = (): Skill => JSON.parse(fs.readFileSync(path.join(FIX, 'fwkb45-s_31d4dd.json'), 'utf8')) as Skill;

/** The ledger's values that the recording's compile was given, as s_31d4dd's params name their bindings. */
const KNOWN: Record<string, string> = {
  'output:i1:project_name': 'Bench Board',
  'output:i3:task_card_text': '#4 fwkb45-n1 Bench Task',
  'output:i2:task_title': 'fwkb45-n1 Bench Task',
  'var:runid': 'fwkb45-n1',
  'output:i2:task_status': 'open',
  'output:i5:form_date_due_form_date_': 'text',
  'output:i1:column_1': 'Backlog',
};

/** 06-change's entries, and the outputs the task stated first, as the daemon computes them over the script so far (server.ts taskWords). */
function sixth(): { own: RecordedEntry[]; constants: string[] } {
  const all = entries();
  const heads = all.map((e, i) => (e.k === 'instruction' && !e.resume ? i : -1)).filter((i) => i >= 0);
  const start = heads[5];
  const end = all.findIndex((e, i) => i > start && e.k === 'report');
  // The ledger's outputs, as s_31d4dd's params name them (`output:iN:name` → producer iN).
  const outputs = Object.entries(KNOWN).flatMap(([k, value]) => {
    const m = /^output:(i\d+):/.exec(k);
    return m ? [{ step: m[1], value }] : [];
  });
  return { own: all.slice(start, end + 1), constants: taskWordOutputs(all.slice(0, start), outputs) };
}

function compile(withConstants = true): Skill[] {
  const { own, constants } = sixth();
  const head = own[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const rep = own[own.length - 1] as RecordedReport;
  return compileSkills({
    entries: own.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: rep.summary, evidence: { values: rep.values } },
    session: 'fwkb45-n1',
    knownValues: KNOWN,
    ...(withConstants ? { taskWords: constants } : {}),
  });
}

const walk = (steps: readonly SkillStep[]): SkillStep[] => steps.flatMap((s) => [s, ...walk(s.body ?? [])]);

describe('the defect, as published (fwkb45 06-change s_31d4dd)', () => {
  it('every read carries what: "{{v6}}", and the prose slots the words "open" and "text"', () => {
    const s = published();
    expect(s.steps.filter((x) => x.tool === 'read' || x.tool === 'read_all').every((x) => x.args.what === '{{v6}}')).toBe(true);
    expect(s.template).toContain('Then {{v5}} task #4');
    expect(s.params.v6).toMatchObject({ example: 'text', binding: 'output:i5:form_date_due_form_date_' });
  });
});

describe('an output the task stated first is not slotted as a run value (round 64)', () => {
  it("the outputs the task stated first are \"open\" and \"text\" — not the run's card, title or column", () => {
    expect(sixth().constants.sort()).toEqual(expect.arrayContaining(['open', 'text']));
    expect(sixth().constants).not.toContain('#4 fwkb45-n1 Bench Task');
    expect(sixth().constants).not.toContain('Backlog');
  });

  it('recompiled from the n1 recording, no mode is a slot and "open"/"text" stay words', () => {
    const skills = compile();
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      for (const step of walk(s.steps)) {
        for (const key of ['what', 'state', 'action']) {
          const v = step.args?.[key];
          if (typeof v === 'string') expect(v, `${s.id} ${step.tool} ${key}`).not.toContain('{{');
        }
      }
      expect(Object.values(s.params).map((p) => p.example)).not.toContain('text');
      expect(Object.values(s.params).map((p) => p.example)).not.toContain('open');
    }
    const template = skills[0].template;
    expect(template).toContain("Then open task #4's page");
    expect(template).toContain('the description text, (e) the comment text');
    // Run values keep their slots: the task card the create reported, and the declared var the procedure carries.
    expect(template).toMatch(/the task card '\{\{v\d+\}\}'/);
    expect(Object.values(skills[0].params).some((p) => p.binding === 'var:runid')).toBe(true);
  });

  it('a read never has its mode slotted, even with no task words given (an older caller)', () => {
    for (const s of compile(false)) for (const step of walk(s.steps)) if (typeof step.args?.what === 'string') expect(step.args.what).not.toContain('{{');
  });

  it('discoverSlots: a task-constant output gets no policy; a run output named in prose keeps it; a var keeps it', () => {
    const instruction = 'On the detail page of ticket RD-1015, open the parts tab for run bench-1';
    const step = (tool: string, args: Record<string, unknown>) => ({ k: 'step', tool, args, locators: {} }) as never;
    const known = { 'output:i2:reference': 'RD-1015', 'output:i3:status': 'open', 'var:runid': 'bench-1' };
    const out = discoverSlots(instruction, [step('read', { target: 'h1', what: 'text' })], known, new Set(['open']));
    expect([...out.values()]).toEqual(['RD-1015', 'bench-1']);
    // Without the evidence, today's policy: every known value that stands in the prose.
    expect([...discoverSlots(instruction, [step('read', { target: 'h1', what: 'text' })], known).values()]).toEqual(['RD-1015', 'open', 'bench-1']);
  });
});
