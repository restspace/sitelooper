import { describe, expect, it } from 'vitest';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import { type TransformNote, dropSupersededNavigation } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * espocrm fwec5-n1 03-create (s_b45e41): the first Save recorded nothing (still
 * on /#Opportunity/create, no line, no alert); the agent re-entered the amount
 * and saved again, which navigated and minted. Replay's first Save worked, and
 * its recorded url stopped the step (FIX Y).
 */
const CREATE = 'http://127.0.0.1:8097/#Opportunity/create';
const save: LocatorCandidate[] = [
  { kind: 'css', selector: 'role=button[name="Save"]' },
  { kind: 'css', selector: '[id^="opportunity-edit-"] > div:nth-of-type(1) > div > div:nth-of-type(1) > button' },
];
const amount: LocatorCandidate[] = [{ kind: 'css', selector: '.cell[data-name="amount"] input.main-element' }];
const at = (tool: string, chain: LocatorCandidate[], expect: SkillStep['expect'] = { urlPattern: CREATE, lineDialect: 2 }, extra: Partial<SkillStep> = {}): SkillStep => ({
  tool,
  args: { target: '@e1' },
  locators: { target: chain },
  expect,
  ...extra,
});
const fill: SkillStep = at('fill', amount, { urlPattern: CREATE, addedContains: ['- textbox "": 12500'] });
const firstSave = at('click', save);
const reentry: SkillStep[] = [
  at('click', amount),
  { ...at('press', amount), args: { key: 'Control+a', target: '@e2' } },
  { ...at('type', amount, { urlPattern: CREATE, addedContains: ['- textbox "": 12500'] }), args: { target: '@e2', text: '12500' } },
  { tool: 'press', args: { key: 'Tab' }, locators: {}, expect: { urlPattern: CREATE } },
  { tool: 'read', args: { target: '@e2', what: 'value' }, locators: { target: amount } },
];
const realSave = at('click', save, { urlPattern: 'http://127.0.0.1:8097/#Opportunity/view/{{d1}}', addedContains: ['- button "Follow"'] }, { mints: { at: 'h2' } });

describe('dropSupersededNavigation: a click a later identical click did for real (FIX Y)', () => {
  it('drops the first Save of the fwec5 shape and keeps the field re-entry and the real Save', () => {
    const notes: TransformNote[] = [];
    const out = dropSupersededNavigation([fill, firstSave, ...reentry, realSave], notes);
    expect(out).toEqual([fill, ...reentry, realSave]);
    expect(notes.some((n) => /repeated with one at step 8/.test(n.reason))).toBe(true);
  });

  it('keeps both when the repeat also recorded nothing', () => {
    const idle = at('click', save);
    expect(dropSupersededNavigation([fill, firstSave, ...reentry, idle])).toEqual([fill, firstSave, ...reentry, idle]);
  });

  it('keeps a toggle', () => {
    const toggle = { ...firstSave, toggle: true as const };
    expect(dropSupersededNavigation([fill, toggle, ...reentry, realSave])).toEqual([fill, toggle, ...reentry, realSave]);
  });

  it('keeps a first click that added lines', () => {
    const did = at('click', save, { urlPattern: CREATE, addedContains: ['- alert "Amount is required"'] });
    expect(dropSupersededNavigation([fill, did, ...reentry, realSave])).toEqual([fill, did, ...reentry, realSave]);
  });

  it('keeps it when another gesture lies between', () => {
    const other = at('click', [{ kind: 'role', role: 'button', name: 'Cancel' }]);
    expect(dropSupersededNavigation([firstSave, other, realSave])).toEqual([firstSave, other, realSave]);
  });
});
