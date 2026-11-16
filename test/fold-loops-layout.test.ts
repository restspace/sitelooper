import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, SkillStep } from '../src/skills/store.js';
import { foldLoops } from '../src/skills/compile.js';

const point = (y: number): LocatorCandidate => ({ kind: 'point', x: 98, y, w: 65, h: 36, role: 'button', tag: 'button', vw: 1280, vh: 900 });

/**
 * espocrm fwec23-fr 05-edit: Escape in a date field raised "Are you sure you
 * want to leave the form?", one Save click took the dialog away and a second
 * did the save. The two clicks' chains differed only in the button's point
 * (y 116, then 153), which was read as a per-record id and folded them into a
 * loop bounded to 2 that ran one pass on every replay and never saved.
 */
describe('foldLoops: a point is layout, not a record id', () => {
  const save = (y: number, expect: SkillStep['expect']): SkillStep => ({
    tool: 'click',
    args: { target: 'button[data-action="save"]' },
    locators: {
      target: [
        { kind: 'css', selector: 'button[data-action="save"]' },
        { kind: 'css', selector: '[id^="opportunity-detail-"] > div:nth-of-type(3) > div > div:nth-of-type(1) > button:nth-of-type(1)' },
        point(y),
      ],
    },
    expect,
  });
  const dialog = ['- dialog "Are you sure you want to leave the form? Cancel Yes"', '- button "Cancel"', '- button "Yes"'];
  const escape: SkillStep = {
    tool: 'press',
    args: { key: 'Escape', target: '.field[data-name="closeDate"] input' },
    locators: { target: [{ kind: 'css', selector: '.field[data-name="closeDate"] input' }] },
    expect: { addedContains: dialog },
  };

  it('keeps a dismissing click and the committing click on the same button as two steps with their own expectations', () => {
    const dismiss = save(116, { removedContains: dialog });
    const commit = save(153, { addedContains: ['- button "Follow"', '- button "Amount, Close Date"'] });
    const out = foldLoops([escape, dismiss, commit], 'edit the amount and close date, then save');
    expect(out.map((s) => s.tool)).toEqual(['press', 'click', 'click']);
    expect(out[1].expect).toEqual({ removedContains: dialog });
    expect(out[2].expect?.addedContains).toContain('- button "Amount, Close Date"');
  });

  it('still folds a per-record delete whose rows also sit at different points', () => {
    const del = (id: string, y: number): SkillStep => ({
      tool: 'click',
      args: { target: '@e1' },
      locators: { target: [{ kind: 'role', role: 'button', name: 'Delete' }, { kind: 'testid', attr: 'data-testid', value: `part-delete-${id}` }, point(y)] },
    });
    const confirm: SkillStep = { tool: 'click', args: {}, locators: { target: [{ kind: 'css', selector: 'button:has-text("Delete part")' }] } };
    const out = foldLoops([del('p18', 300), confirm, del('p19', 340), confirm], 'delete part p18 and part p19');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tool: 'loop', max: 2, scope: 'observed' });
  });
});
