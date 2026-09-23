import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep, StepDiff } from '../src/daemon/recorder.js';
import { compileSkills, dropSupersededNavigation } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * grafana fwgr69-n1 02-create (round 56): n1 script entries 43 and 44 (0-based
 * lines) clicked heading "Panel options" twice. The first COLLAPSED the
 * section (added [], removed its four lines, url …&editPanel=1); the second
 * re-expanded it (added the same four lines, url …&editPanel=1&showCategory=
 * Panel%20options). Two older rules met on it:
 *  - collapseTogglePairs compared the two urls whole, and the view state the
 *    disclosure writes into the query broke the pair;
 *  - abandonedRepeatClick then judged the collapse "consequence-free" from the
 *    compiled expect (which keeps removals only for dialogs), dropped it, and
 *    kept the expand as a plain click. On replay the section was open, so the
 *    one click collapsed it: s_3af38e stopped at step 5, 132 and 58 turns.
 * The fixture is the instruction's n1 entries 34-72, verbatim.
 */
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', 'fwgr69-n1-02-create.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

const compileAll = () => {
  const es = entries();
  const head = es[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = es.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
  return compileSkills({
    entries: es.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
    session: 't',
    knownValues: { 'var:runid': 'fwgr69-n1' },
  });
};
const panelOptions = (steps: SkillStep[]) => steps.filter((s) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes('"name":"Panel options"'));

describe('a disclosure that writes view state into the query is still one toggle (fwgr69)', () => {
  it('compiles the collapse/expand pair to ONE toggle click', () => {
    const clicks = panelOptions(compileAll().flatMap((s) => s.steps));
    expect(clicks).toHaveLength(1);
    expect(clicks[0].toggle).toBe(true);
    // the kept click is the one that SHOWS the section
    expect(clicks[0].expect?.addedContains?.some((l) => l.includes('Panel links'))).toBe(true);
  });
});

describe('a query change without recorded removals is not a toggle (fwgr18-25)', () => {
  it('keeps the picker click and the choice that set `&refresh=1m`', async () => {
    // fwgr21-n1 entries 118-119: the auto-refresh picker opened (added [],
    // recorded before add-less removals were kept), then "1 minute" was
    // chosen (url gained &refresh=1m). The query change is the effect.
    const { collapseTogglePairs } = await import('../src/skills/toggles.js');
    const DASH = 'http://127.0.0.1:3000/d/ffx2k3asqla0wd/fwgr21-n1-bench-dashboard?from=now-6h&to=now&timezone=browser';
    const ambient = { kind: 'css' as const, selector: '[data-testid="data-testid dashboard controls"] button' };
    const open: RecordedStep = { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'testid', attr: 'data-testid', value: 'data-testid RefreshPicker interval button' }, ambient] } }, diff: { url: DASH, alerts: [], added: [], dialect: 2 } };
    const choose: RecordedStep = { k: 'step', tool: 'click', args: { target: '@e2' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'menuitemradio', name: '1 minute' }, ambient] } }, diff: { url: `${DASH}&refresh=1m`, alerts: [], added: ['- button "Choose refresh time interval with current interval 1 minute selected"'], dialect: 2 } };
    const out = collapseTogglePairs([open, choose]);
    expect(out).toEqual([open, choose]);
    expect(choose.toggle).toBeUndefined();
  });
});

describe('abandonedRepeatClick never drops one click of an undo pair', () => {
  const heading = [{ kind: 'role' as const, role: 'heading', name: 'Panel options' }];
  const LINES = ['- textbox "": Panel Title', '- textbox ""', '- heading "Panel links"', '- heading "Repeat options"'];
  const URL = 'http://127.0.0.1:3000/dashboard/new?editPanel=1';
  const click = (): SkillStep => ({ tool: 'click', args: { target: '@e1722' }, locators: { target: heading }, expect: { urlPattern: URL } });

  it('keeps both clicks when the second put back what the first took off (as recorded)', () => {
    const collapse = click();
    const expand: SkillStep = { ...click(), expect: { urlPattern: URL, addedContains: LINES } };
    const recorded = new Map<SkillStep, StepDiff>([
      [collapse, { url: URL, alerts: [], added: [], removed: LINES, dialect: 2 }],
      [expand, { url: URL, alerts: [], added: LINES, dialect: 2 }],
    ]);
    const out = dropSupersededNavigation([collapse, expand], [], (s) => recorded.get(s));
    expect(out).toEqual([collapse, expand]);
  });

  it('a click whose recorded diff added lines is consequential, whatever its compiled expect kept', () => {
    const first = click();
    const second: SkillStep = { ...click(), expect: { urlPattern: 'http://127.0.0.1:3000/d/x' } };
    const recorded = new Map<SkillStep, StepDiff>([[first, { url: URL, alerts: [], added: ['- dialog "Save dashboard"'], dialect: 2 }]]);
    expect(dropSupersededNavigation([first, second], [], (s) => recorded.get(s))).toEqual([first, second]);
  });

  it('fwec5 still drops the failed Save: the field it cleared was re-entered before the real Save', () => {
    // espocrm fwec5-n1 70-77: the first Save removed `- textbox "": 12500`
    // (the amount it cleared); the re-entry typed it back as "12,500"; the
    // second Save navigated and minted.
    const CREATE = 'http://127.0.0.1:8097/#Opportunity/create';
    const save = [{ kind: 'css' as const, selector: 'role=button[name="Save"]' }];
    const amount = [{ kind: 'css' as const, selector: '.cell[data-name="amount"] input.main-element' }];
    const firstSave: SkillStep = { tool: 'click', args: { target: '@s' }, locators: { target: save }, expect: { urlPattern: CREATE } };
    const refocus: SkillStep = { tool: 'click', args: { target: '@a' }, locators: { target: amount }, expect: { urlPattern: CREATE } };
    const retype: SkillStep = { tool: 'type', args: { target: '@a', text: '12500' }, locators: { target: amount }, expect: { urlPattern: CREATE, addedContains: ['- textbox "": 12,500'] } };
    const realSave: SkillStep = { tool: 'click', args: { target: '@s' }, locators: { target: save }, expect: { urlPattern: 'http://127.0.0.1:8097/#Opportunity/view/{{d1}}', addedContains: ['- button "Follow"'] }, mints: { at: 'h2' } };
    const recorded = new Map<SkillStep, StepDiff>([
      [firstSave, { url: CREATE, alerts: [], added: [], removed: ['- textbox "": 12500'], dialect: 2 }],
      [refocus, { url: CREATE, alerts: [], added: [], removed: [], dialect: 2 }],
      [retype, { url: CREATE, alerts: [], added: ['- textbox "": 12,500'], dialect: 2 }],
      [realSave, { url: 'http://127.0.0.1:8097/#Opportunity/view/6ab2560defe16781d', alerts: [], added: ['- button "Follow"'], dialect: 2 }],
    ]);
    expect(dropSupersededNavigation([firstSave, refocus, retype, realSave], [], (s) => recorded.get(s))).toEqual([refocus, retype, realSave]);
  });
});

/** The recorded evidence the fixture carries, checked so the test above cannot drift from it. */
describe('the fwgr69 fixture is the recording', () => {
  it('carries the collapse and the expand as recorded', () => {
    const steps = entries().filter((e): e is RecordedStep => e.k === 'step');
    const pair = steps.filter((s) => s.tool === 'click' && JSON.stringify(s.locators.target?.chain ?? []).includes('"name":"Panel options"'));
    expect(pair).toHaveLength(2);
    expect(pair[0].diff!.added).toEqual([]);
    expect(pair[0].diff!.removed).toEqual(pair[1].diff!.added);
    expect(pair[1].diff!.url).toContain('showCategory=Panel%20options');
    expect(pair[0].diff!.url).not.toContain('showCategory');
  });
});
