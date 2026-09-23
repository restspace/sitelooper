/**
 * A set the recording did again (src/skills/toggles.ts dropSupersededSets).
 * fwvk4 n1 typed the task description, reloaded, read the editor back empty,
 * and did it again with a Save; compile kept both attempts, and every replay
 * stopped on the abandoned type's recorded autosave.
 */
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry, RecordedStep, StepDiff } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { dropSupersededSets } from '../src/skills/toggles.js';

const TASK = 'http://127.0.0.1:8096/tasks/4';
const LIST = 'http://127.0.0.1:8096/projects/2/5';
const TEXT = 'Bench task for run fwvk4-n1';

const chain = (raw: string, ...c: LocatorCandidate[]) => ({ target: { expr: 'x', verified: true, raw, chain: c } });
const diff = (d: Partial<StepDiff> = {}): StepDiff => ({ url: TASK, alerts: [], added: [], dialect: 2, ...d });

// n1 28-29: the first attempt, on the editor's <p>
const P = [
  { kind: 'css', selector: 'div:nth-of-type(2) > div > div > div:nth-of-type(2) > div > p' },
  { kind: 'point', x: 638, y: 351, w: 572, h: 24, role: null, tag: 'p', vw: 1280, vh: 900 },
] as LocatorCandidate[];
// n1 34-35: the second, on the contenteditable <div> around it
const DIV = [
  { kind: 'css', selector: 'main [contenteditable="true"] >> nth=1' },
  { kind: 'css', selector: 'div:nth-of-type(1) > div:nth-of-type(2) > div > div > div:nth-of-type(2) > div' },
  { kind: 'point', x: 638, y: 351, w: 588, h: 40, role: null, tag: 'div', vw: 1280, vh: 900 },
] as LocatorCandidate[];
const SAVE = [{ kind: 'role', role: 'button', name: 'Save' }] as LocatorCandidate[];

const step = (tool: string, args: Record<string, unknown>, locators: RecordedStep['locators'] = {}, d?: StepDiff): RecordedStep => ({
  k: 'step',
  tool,
  args,
  locators,
  ...(d ? { diff: d } : {}),
});

/** fwvk4 n1 steps 27-36, as recorded. */
function fwvk4(): RecordedStep[] {
  return [
    step('click', { target: 'role=link[name="fwvk4-n1 Bench Task"]' }, chain('@e1', { kind: 'role', role: 'link', name: 'fwvk4-n1 Bench Task' } as LocatorCandidate), diff({ url: TASK, added: ['- heading "Description"'] })),
    step('click', { target: '@e759' }, chain('@e759', ...P), diff({ removed: [] })),
    step('type', { target: '@e759', text: TEXT }, chain('@e759', ...P), diff({ added: ['- heading "Description Saved!"'] })),
    step('screenshot', { path: 'a.png' }),
    step('goto', { url: TASK }, {}, diff({ added: ['- button "SAVE" [disabled]'] })),
    step('read_all', { target: 'main [contenteditable="true"]', what: 'text' }, chain('x', { kind: 'css', selector: 'main [contenteditable="true"]' } as LocatorCandidate)),
    step('eval', { expression: 'document.title' }),
    step('click', { target: 'main [contenteditable="true"] >> nth=1' }, chain('y', ...DIV), diff({ removed: [] })),
    step('type', { target: 'main [contenteditable="true"] >> nth=1', text: TEXT, delay_ms: 30 }, chain('y', ...DIV), diff({ added: ['- button "SAVE"'] })),
    step('click', { target: 'role=button[name="Save"]' }, chain('z', ...SAVE), diff({ added: ['- heading "Description Saved!"', '- button "Edit"'] })),
  ];
}

describe('dropSupersededSets', () => {
  it('drops the abandoned click+type and the reload when the same value is set again on the same editor (fwvk4 n1 27-36)', () => {
    const steps = fwvk4();
    const out = dropSupersededSets(steps);
    expect(out).toEqual([steps[0], steps[3], steps[5], steps[6], steps[7], steps[8], steps[9]]);
    // identity kept: compile matches kept steps against the recording by object
    expect(out[4]).toBe(steps[7]);
  });

  it('keeps both attempts without a reload between them, or with an action between them', () => {
    const noReload = fwvk4().filter((s) => s.tool !== 'goto');
    expect(dropSupersededSets(noReload)).toHaveLength(noReload.length);
    const acted = fwvk4();
    acted.splice(4, 0, step('click', { target: 'x' }, chain('x', ...SAVE), diff({ added: ['- heading "Saved"'] })));
    expect(dropSupersededSets(acted)).toHaveLength(acted.length);
  });

  it('keeps both when the value differs, the url differs, or the target is elsewhere', () => {
    const other = fwvk4();
    other[8] = { ...other[8], args: { ...other[8].args, text: 'something else' } };
    expect(dropSupersededSets(other)).toHaveLength(other.length);
    const moved = fwvk4();
    moved[8] = { ...moved[8], diff: diff({ url: LIST }) };
    expect(dropSupersededSets(moved)).toHaveLength(moved.length);
    const elsewhere = fwvk4();
    const far = { kind: 'point', x: 638, y: 600, w: 588, h: 40, role: null, tag: 'div', vw: 1280, vh: 900 } as LocatorCandidate;
    elsewhere[8] = { ...elsewhere[8], locators: chain('y', DIV[0], far) };
    expect(dropSupersededSets(elsewhere)).toHaveLength(elsewhere.length);
  });

  it('keeps a password and its confirmation, and a form of several fills', () => {
    const pw = (name: string) => step('fill', { target: '@e', value: 'hunter22' }, chain('@e', { kind: 'role', role: 'textbox', name } as LocatorCandidate), diff());
    const pair = [pw('Password'), pw('Confirm password')];
    expect(dropSupersededSets(pair)).toHaveLength(2);
    // even across a reload: two fields are two targets
    const reloaded = [pw('Password'), step('goto', { url: TASK }, {}, diff()), pw('Confirm password')];
    expect(dropSupersededSets(reloaded)).toHaveLength(3);
    const form = [pw('Name'), step('fill', { target: '@e', value: 'x@y.z' }, chain('@e', { kind: 'role', role: 'textbox', name: 'Email' } as LocatorCandidate), diff()), pw('Password')];
    expect(dropSupersededSets(form)).toHaveLength(3);
  });

  it('supersedes a fill re-done on the same named field after a reload', () => {
    const name = { kind: 'role', role: 'textbox', name: 'Title' } as LocatorCandidate;
    const first = step('fill', { target: '@e', value: 'Bench' }, chain('@e', name), diff());
    const reload = step('goto', { url: TASK }, {}, diff());
    const again = step('fill', { target: '@f', value: 'Bench' }, chain('@f', name), diff());
    expect(dropSupersededSets([first, reload, again])).toEqual([again]);
  });
});

describe('compile: a set done again compiles once', () => {
  it('compiles fwvk4 n1 27-36 to the link, one click, one type and Save', () => {
    const entries: RecordedEntry[] = [{ k: 'instruction', text: `open the task and set its description to '${TEXT}'`, url: LIST }, ...fwvk4()];
    const [first, ...rest] = compileSkills({
      entries,
      instruction: `open the task and set its description to '${TEXT}'`,
      report: { status: 'success', summary: 'done', evidence: { values: {} } },
      session: 't',
      now: '2026-09-22T00:00:00.000Z',
    });
    const steps = [first, ...rest].flatMap((s) => s.steps);
    expect(steps.map((s) => s.tool)).toEqual(['click', 'click', 'type', 'click']);
    expect(steps[2].args.target).toBe('main [contenteditable="true"] >> nth=1');
    expect(steps.some((s) => s.tool === 'goto')).toBe(false);
    expect(steps.filter((s) => s.expect?.addedContains?.includes('- heading "Description Saved!"'))).toHaveLength(1);
  });
});

/**
 * gitea fwgt6-n1 01-signin (FIX AJ): filled #password with 'admin', clicked
 * Sign In (which recorded nothing), and filled #password again with the
 * {{env:APP_PASSWORD}} marker before a Sign In that worked. s_9c4b07 kept
 * both fills once the dead click was dropped.
 */
describe('dropSupersededSets: a refill of the same field', () => {
  const LOGIN = 'http://127.0.0.1:8095/user/login';
  const PASSWORD = [{ kind: 'role', role: 'textbox', name: 'Password' }, { kind: 'label', label: 'Password' }] as LocatorCandidate[];
  const USER = [{ kind: 'label', label: 'Username or Email Address' }, { kind: 'id', selector: '#user_name' }] as LocatorCandidate[];
  const SIGN_IN = [{ kind: 'role', role: 'button', name: 'Sign In' }] as LocatorCandidate[];
  const at = (d: Partial<StepDiff> = {}) => diff({ url: LOGIN, ...d });
  const fill = (loc: LocatorCandidate[], value: string, raw = '@e28') => step('fill', { target: raw, value }, chain(raw, ...loc), at({ added: [`- textbox "x": ${value}`] }));

  it('drops the earlier fill of the fwgt6 shape, whatever the two values', () => {
    const steps = [fill(USER, 'admin', '@e23'), fill(PASSWORD, 'admin'), step('click', { target: '@e34' }, chain('@e34', ...SIGN_IN), at({ removed: [] })), fill(PASSWORD, '{{env:APP_PASSWORD}}', '@e30'), step('click', { target: '@e36' }, chain('@e36', ...SIGN_IN), at({ url: 'http://127.0.0.1:8095/', added: ['- link "Dashboard"'] }))];
    expect(dropSupersededSets(steps)).toEqual([steps[0], steps[2], steps[3], steps[4]]);
  });

  it('keeps both when a step between recorded a consequence, when the fields differ, or when the sets are types', () => {
    const acted = [fill(PASSWORD, 'a'), step('click', { target: '@e34' }, chain('@e34', ...SIGN_IN), at({ added: ['- alert "Wrong password"'] })), fill(PASSWORD, 'b')];
    expect(dropSupersededSets(acted)).toEqual(acted);
    const confirm = [fill(PASSWORD, 'pw'), fill([{ kind: 'label', label: 'Confirm Password' }] as LocatorCandidate[], 'pw', '@e29')];
    expect(dropSupersededSets(confirm)).toEqual(confirm);
    const typed = [step('type', { target: '@e28', text: 'ab' }, chain('@e28', ...PASSWORD), at()), step('type', { target: '@e28', text: 'cd' }, chain('@e28', ...PASSWORD), at())];
    expect(dropSupersededSets(typed)).toEqual(typed);
  });
});

/**
 * repairdesk fwrd84-n1 (round 49): TWO DIFFERENT FIELDS of one form dialog,
 * not a refill. 05-edit filled Cost = 150 then Markup = 25 and saved; 02-create
 * filled Title then Customer and saved. Every field in that dialog carries the
 * recorder's ambient `[data-testid="form-dialog"] input` candidate — one
 * selector that matches all of them — so sameControl found a candidate in
 * common and the round-48 refill rule dropped the FIRST fill of each pair.
 * The exported 05-edit then saved an unchanged form and still reported tier A
 * (n3's verifier failed: no update setting p18 to cost 150), and 02-create hit
 * the app's own "Title is required".
 */
describe('dropSupersededSets: two fields of one dialog are not a refill (fwrd84)', () => {
  const TICKET = 'http://127.0.0.1:4180/#/tickets/t15';
  const AMBIENT = { kind: 'css', selector: '[data-testid="form-dialog"] input' } as LocatorCandidate;
  const field = (name: string, testid: string, id: string, y: number): LocatorCandidate[] => [
    { kind: 'css', selector: `role=dialog >> role=spinbutton[name="${name}"]` },
    { kind: 'testid', attr: 'data-testid', value: testid },
    { kind: 'role', role: 'spinbutton', name },
    { kind: 'label', label: name },
    { kind: 'id', selector: `#${id}` },
    AMBIENT,
    { kind: 'css', selector: `#${id}` },
    { kind: 'point', x: 640, y, w: 478, h: 39, role: 'spinbutton', tag: 'input', vw: 1280, vh: 900 },
  ] as LocatorCandidate[];
  const COST = field('Cost *', 'field-cost', 'f-cost', 354);
  const MARKUP = field('Markup % *', 'field-markup', 'f-markup', 456);
  const at = (d: Partial<StepDiff> = {}) => diff({ url: TICKET, ...d });

  /** fwrd84 n1 102-106, as recorded. */
  const fwrd84 = (): RecordedStep[] => [
    step('click', { target: '@e396' }, chain('@e396', { kind: 'scoped', container: 'tr', hasText: 'fwrd84-n1 RD Part A', selector: 'td:nth-of-type(7) > button:nth-of-type(1)' } as LocatorCandidate), at({ added: ['- dialog "Edit part"', '- spinbutton "Cost *": 100'] })),
    step('fill', { target: 'role=dialog >> role=spinbutton[name="Cost *"]', value: '150' }, chain('c', ...COST), at({ added: ['- spinbutton "Cost *": 150'] })),
    step('fill', { target: 'role=dialog >> role=spinbutton[name="Markup % *"]', value: '25' }, chain('m', ...MARKUP), at({ added: [], removed: [] })),
    step('screenshot', { path: 'a.png' }),
    step('click', { target: 'role=dialog >> role=button[name="Save part"]' }, chain('s', { kind: 'css', selector: 'role=dialog >> role=button[name="Save part"]' } as LocatorCandidate), at({ added: ['- row "fwrd84-n1 RD Part A $150.00 25% 1 No supplier $187.50 Edit Delete"'] })),
  ];

  it('keeps the cost fill: the two fills name different fields', () => {
    const steps = fwrd84();
    expect(dropSupersededSets(steps)).toEqual(steps);
  });

  it('compiles the recorded edit with both fills', () => {
    const instruction = "edit the part named 'fwrd84-n1 RD Part A', change its cost from 100 to 150, keep the markup at 25, and save";
    const entries: RecordedEntry[] = [{ k: 'instruction', text: instruction, url: TICKET }, ...fwrd84()];
    const skills = compileSkills({ entries, instruction, report: { status: 'success', summary: 'saved', evidence: { values: { part_A_cost_after: '$150.00' } } }, session: 't' });
    const [skill] = skills;
    const fills = skills.flatMap((s) => s.steps).filter((s) => s.tool === 'fill');
    // both fills survive; the instruction names both numbers, so each is a slot
    const example = (v: unknown) => (typeof v === 'string' && /^\{\{(\w+)\}\}$/.test(v) ? skill.params[v.slice(2, -2)]?.example : v);
    expect(fills.map((f) => example(f.args.value))).toEqual(['150', '25']);
  });
});

/**
 * odoo fwod81-n1 03-add (round 54, entries 76-81): the agent filled "2" into
 * the PRODUCT combobox by mistake — its own diff opened the autocomplete menu
 * with options — then filled "Cabinet" into the same field and picked the
 * option. The refill arm dropped the "2" fill as superseded, so the replay
 * could not reproduce the page the recording had reached. A fill whose own
 * recorded diff shows more than its field's value line had consequences.
 */
describe('dropSupersededSets: a refill does not drop a fill with consequences (fwod81)', () => {
  const FORM = 'http://127.0.0.1:8069/web#cids=1&menu_id=194&action=316&model=sale.order&view_type=form&id=21';
  const product = (css: string) => [
    { kind: 'css', selector: css },
    { kind: 'role', role: 'combobox', name: 'Type to find a product...' },
    { kind: 'placeholder', placeholder: '' },
    { kind: 'css', selector: 'td:nth-of-type(2) > div > div:nth-of-type(1) > div > div > input' },
  ] as LocatorCandidate[];
  const at = (d: Partial<StepDiff> = {}) => diff({ url: FORM, ...d });
  const two = step('fill', { target: '.o_list_renderer tbody tr:nth-child(2) input.o_input >> nth=0', value: '2' }, chain('a', ...product('.o_list_renderer tbody tr:nth-child(2) input.o_input >> nth=0')), at({ added: ['- combobox "Type to find a product...": 2', '- menu ""', '- option "Conference Chair"', '- option "[FURN_8220] Four Person Desk"', '- option "Create \\"2\\""'] }));
  const cabinet = step('fill', { target: '.o_list_renderer tbody tr:nth-child(2) td[name="product_template_id"] input', value: 'Cabinet' }, chain('b', ...product('.o_list_renderer tbody tr:nth-child(2) td[name="product_template_id"] input')), at({ added: ['- row "Loading... 20% £ 140.00"', '- cell "Loading..."', '- combobox "Type to find a product...": Cabinet', '- menu "Loading..."', '- option "Loading..."'] }));
  const pick = step('click', { target: 'role=option[name="[E-COM11] Cabinet with Doors"]' }, chain('c', { kind: 'css', selector: 'role=option[name="[E-COM11] Cabinet with Doors"]' } as LocatorCandidate), at({ added: ['- cell "[E-COM11] Cabinet with Doors"'] }));

  it('keeps the fill whose own diff opened a menu', () => {
    const steps = [two, step('eval', { expression: 'x' }), cabinet, pick];
    expect(dropSupersededSets(steps)).toEqual(steps);
  });

  it('still drops an earlier fill whose diff shows only its own value line', () => {
    const quiet = step('fill', { target: 'a', value: '2' }, chain('a', ...product('.o_list_renderer tbody tr:nth-child(2) input.o_input >> nth=0')), at({ added: ['- combobox "Type to find a product...": 2'] }));
    expect(dropSupersededSets([quiet, cabinet, pick])).toEqual([cabinet, pick]);
  });
});
