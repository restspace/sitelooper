import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { observedSummary, templateSource, templateValue } from '../src/execution/report.js';
import { artefactKeys } from '../src/agent/report.js';
import { compileSkills } from '../src/skills/compile.js';
import { publishedOutputs, synthesizeReport } from '../src/skills/learn.js';
import type { Skill } from '../src/skills/store.js';

/**
 * Round 55, group "report": what a replay publishes, from the round-54
 * evidence (bench/SWEEPS.md "Round 54").
 */

const ORIGIN = 'http://127.0.0.1:8097';

function step(tool: string, args: Record<string, unknown>, chain: RecordedStep['locators']['target']['chain'] = [], extra: Partial<RecordedStep> = {}): RecordedStep {
  return { k: 'step', tool, args, locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain } } : {}, ...extra };
}

/**
 * fwec8 02-create: saving the opportunity lands on `#Opportunity/view/<id>`,
 * a url part the save MINTED (derived d1 on s_03d7ad), and the instruction
 * asks for "the record ID from the URL". The tail segment s_498742 stored
 * `record_id: "6ab3eab5991a42617"` — the recording's id, a literal every
 * replay drops — and the export pruned record_id as unpublishable.
 */
describe('item 7: a minted url part in the report template (fwec8 02-create)', () => {
  const ID = '6ab3eab5991a42617';
  const INSTR = "Create a new Opportunity named 'fwec8-n1 Bench Opportunity' and save it. Then report the record ID from the URL (#Opportunity/view/<id>).";
  const entries = (): RecordedEntry[] => [
    { k: 'instruction', text: INSTR, url: `${ORIGIN}/#Opportunity/create`, fingerprint: [1, 0, 0] },
    step('fill', { target: '@e1', value: 'fwec8-n1 Bench Opportunity' }, [{ kind: 'label', label: 'Name' }]),
    step('click', { target: '@e2' }, [{ kind: 'role', role: 'button', name: 'Save' }], {
      diff: { url: `${ORIGIN}/#Opportunity/view/${ID}`, alerts: ['Saved'], added: ['- heading "fwec8-n1 Bench Opportunity"'] },
    }),
    step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Follow' }], {
      diff: { url: `${ORIGIN}/#Opportunity/view/${ID}`, alerts: [], added: ['- button "Followed"'] },
    }),
  ];
  const report = {
    status: 'success' as const,
    summary: `Saved the opportunity; its record page is ${ORIGIN}/#Opportunity/view/${ID}, record ID ${ID}.`,
    evidence: { values: { record_id: ID, record_url: `${ORIGIN}/#Opportunity/view/${ID}` } },
  };
  const compiled = () => compileSkills({ entries: entries(), instruction: INSTR, report, session: 'fwec8-n1', knownValues: { 'var:runid': 'fwec8-n1' } });

  it('writes the derived marker, never the recording id, into the template', () => {
    const chain = compiled();
    const tail = chain[chain.length - 1];
    const name = chain.flatMap((s) => Object.keys(s.derived ?? {}))[0];
    expect(name).toMatch(/^d\d+$/);
    expect(tail.reportTemplate?.values.record_id).toBe(`{{${name}}}`);
    expect(tail.reportTemplate?.values.record_url).toBe(`${ORIGIN}/#Opportunity/view/{{${name}}}`);
    expect(JSON.stringify(tail.reportTemplate)).not.toContain(ID);
  });

  it('counts record_id as published by the chain, and fills it with this run’s id', () => {
    const chain = compiled();
    const tail = chain[chain.length - 1];
    const name = chain.flatMap((s) => Object.keys(s.derived ?? {}))[0];
    expect(chain.flatMap((s) => publishedOutputs(s, chain))).toContain('record_id');
    // The daemon's replay threads derived values across segments ({...match.params, ...derived}).
    const r = synthesizeReport(tail, { [name]: '7cd9aa0012b34e5f1' }, {}, [`${ORIGIN}/#Opportunity/view/7cd9aa0012b34e5f1`]);
    expect(r.evidence?.values).toMatchObject({ record_id: '7cd9aa0012b34e5f1', record_url: `${ORIGIN}/#Opportunity/view/7cd9aa0012b34e5f1` });
  });
});

/**
 * fwec8 03-verify: s_55d615 `values.record_id: "{{v2}}"`, but v2 is not a
 * param — v1 (the whole record url) swallowed its every instruction
 * occurrence and keptSlots dropped it — while templateSource still counted
 * the value, so compile promised an output no run could fill.
 */
describe('item 8: a marker in the template must be a param', () => {
  const s55 = (): Skill =>
    ({
      id: 's_55d615',
      params: { v1: { example: `${ORIGIN}/#Opportunity/view/6ab3eab5991a42617`, usedIn: [], known: true, binding: 'output:i2:record_url' }, v3: { example: 'fwec8-n1', usedIn: [5, 9], known: true, binding: 'var:runid' } },
      steps: [],
      reportTemplate: { summary: '', values: { record_id: '{{v2}}', benchmark_tag: '{{v3}}' } },
    }) as unknown as Skill;

  it('counts a template value only if every marker in it is bound', () => {
    expect(templateSource('{{v2}}', (n) => n === 'v1' || n === 'v3')).toBe(false);
    expect(templateSource('{{v3}}', (n) => n === 'v1' || n === 'v3')).toBe(true);
    expect(publishedOutputs(s55())).toEqual(['benchmark_tag']);
  });

  const ID = '6ab3eab5991a42617';
  const URL = `${ORIGIN}/#Opportunity/view/${ID}`;
  const INSTR = `On the opportunity record page ${URL}, post on the record's Stream a post whose text includes 'fwec8-n1'. Report the record id.`;
  const entries = (): RecordedEntry[] => [
    { k: 'instruction', text: INSTR, url: URL },
    step('fill', { target: '@e1', value: 'fwec8-n1 stream post' }, [{ kind: 'label', label: 'Post' }]),
    step('click', { target: '@e2' }, [{ kind: 'role', role: 'button', name: 'Post' }], { diff: { url: URL, alerts: [], added: ['- text: fwec8-n1 stream post'] } }),
  ];
  const report = { status: 'success' as const, summary: `Posted on ${ID}.`, evidence: { values: { record_id: ID } } };

  it('keeps the slot bound to its origin when the run banked one', () => {
    const [skill] = compileSkills({ entries: entries(), instruction: INSTR, report, session: 's', knownValues: { 'var:runid': 'fwec8-n1', 'output:i2:record_url': URL, 'output:i2:record_id': ID } });
    const tv = skill.reportTemplate!.values.record_id;
    const marker = /^\{\{(v\d+)\}\}$/.exec(tv)?.[1];
    expect(marker, tv).toBeDefined();
    expect(skill.params[marker!]?.binding).toBe('output:i2:record_id');
  });

  it('leaves no unbound marker in the template when no origin is known', () => {
    const [skill] = compileSkills({ entries: entries(), instruction: INSTR, report, session: 's', knownValues: { 'var:runid': 'fwec8-n1', 'output:i2:record_url': URL } });
    const markers = [...JSON.stringify(skill.reportTemplate).matchAll(/\{\{([vd]\d+)\}\}/g)].map((m) => m[1]);
    for (const m of markers) expect(Object.keys(skill.params), m).toContain(m);
  });
});

/** fwec8 02-create: close_date `"Dec 31 ({{v5}})"`; the page showed "Dec 31" and the value was withheld. */
describe('item 9: literals are compared by their words, not their punctuation', () => {
  it('publishes a value whose literal words the page shows', () => {
    expect(templateValue('Dec 31 ({{v5}})', { v5: '2026-12-31' }, ['- text: Close Date', 'Dec 31'])).toBe('Dec 31 (2026-12-31)');
    expect(templateValue('Dec 31 ({{v5}})', { v5: '2026-12-31' }, ['Jan 7'])).toBeNull();
    // Words in order, whole: "Dec 3" is not "Dec 31", "31 Dec" is not "Dec 31".
    expect(templateValue('Dec 31 ({{v5}})', { v5: '2026-12-31' }, ['Dec 311'])).toBeNull();
    expect(templateValue('Dec 31 ({{v5}})', { v5: '2026-12-31' }, ['31 Dec'])).toBeNull();
  });
});

/**
 * fwsi7 04-report: the recovery published `ref: "s_d5098a"` (the skill it ran),
 * `ref_3: "ba00005_view.png"` and `/tmp/ba00005_view.png` (its own screenshots)
 * as findings; fwsi7's flow then declared `screenshot` outputs on every step.
 */
describe('item 10: a sitelooper artefact is never a published value', () => {
  it('names the keys whose value is a skill id or a screenshot this run made', () => {
    const values = {
      asset_tag: 'BA-00005',
      screenshot_view: '/tmp/ba00005_view.png',
      screenshot_history: '/tmp/ba00005_history.png',
      ref: 's_d5098a',
      ref_3: 'ba00005_view.png',
      checked_out_to: 'Bench Assignee',
    };
    const keys = artefactKeys(values, { screenshots: ['/tmp/ba00005_view.png', '/tmp/ba00005_history.png'], skills: (id) => id === 's_d5098a' });
    expect(keys.sort()).toEqual(['ref', 'ref_3', 'screenshot_history', 'screenshot_view']);
  });

  it('leaves a value alone that only looks like one', () => {
    // Provenance, not shape: no screenshot or skill of this run is named.
    expect(artefactKeys({ file: 'invoice.png', code: 's_abc123' }, { screenshots: ['/tmp/other.png'], skills: () => false })).toEqual([]);
  });
});

/**
 * fwvk7 03-open, n2: "2026-12-31; (d); (e); (f) one comment …; (g) identifier
 * BENCH-5." — the clauses went, their enumeration labels stayed.
 */
describe('item 11: an enumeration label goes with its clause', () => {
  const summary =
    'Opened the task at http://127.0.0.1:8096/tasks/5 and read each requested value from the live task page: (a) title "fwvk7-n2 Bench Task"; (b) description "fwvk7-n2 description"; (c) due date "31 Dec 2026, 12:00:00", i.e. 2026-12-31; (d) priority combobox shows option "High" selected (raw value "3"); (e) label "Backend" attached as exactly one chip; (f) one comment "fwvk7-n2 comment on this bench task" by admin; (g) identifier BENCH-5.';
  const page = ['fwvk7-n2 Bench Task', 'fwvk7-n2 description', 'fwvk7-n2 comment on this bench task', 'admin', 'BENCH-5', 'title', 'description', 'identifier', 'one', 'comment', 'by', 'a', 'b', 'd', 'e', 'f', 'g'];

  it('keeps no label whose clause was dropped', () => {
    // The opening clause's words are the instruction's, so the sentence stands
    // and its parts are judged one by one.
    const r = observedSummary(summary, ['Opened the task at http://127.0.0.1:8096/tasks/5 and read each requested value from the live task page'], page);
    expect(r.text).toContain('(a) title "fwvk7-n2 Bench Task"');
    expect(r.text).toContain('(g) identifier BENCH-5');
    expect(r.text).not.toMatch(/\([a-z]\)\s*[;.]/);
    expect(r.text).not.toContain('(d)');
    expect(r.text).not.toContain('(e)');
    expect(r.text).not.toContain('2026-12-31;');
  });

  it('keeps a label whose clause stands', () => {
    const r = observedSummary('Checked: (a) title "X"; (b) priority High.', ['Checked the task'], ['title X', 'a']);
    expect(r.text).toBe('Checked: (a) title "X".');
  });
});
