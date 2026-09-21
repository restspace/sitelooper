/**
 * Disclosure toggle pairs (src/skills/toggles.ts). fwsi1 05-change clicked
 * "Show/Hide More Information" to hide a panel an earlier instruction had
 * opened, then clicked it again to show it; every replay (panel shut)
 * opened it, shut it, and stopped. The pair compiles to one click, flagged.
 */
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry, RecordedStep, StepDiff } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { collapseTogglePairs } from '../src/skills/toggles.js';

const URL = 'http://127.0.0.1:8098/hardware/4#details';
const PANEL = ['- link "Bench Laptop Model"', '- link "Bench Laptops"', '- link "Bench Manufacturer"'];

const chain = (...c: LocatorCandidate[]) => ({ target: { expr: 'x', verified: true, raw: '@e1', chain: c } });
const BY_ROLE = { kind: 'role', role: 'button', name: 'Show/Hide More Information' } as LocatorCandidate;
const BY_ID = { kind: 'css', selector: '#expand-info-panel-button' } as LocatorCandidate;
const POINT = { kind: 'point', x: 1254, y: 78, w: 22.8, h: 26, role: 'button', tag: 'button', vw: 1280, vh: 900 } as LocatorCandidate;

function click(diff: Partial<StepDiff>, ...c: LocatorCandidate[]): RecordedStep {
  return { k: 'step', tool: 'click', args: { target: '@e1' }, locators: chain(...(c.length ? c : [BY_ROLE, BY_ID, POINT])), diff: { url: URL, alerts: [], added: [], dialect: 2, ...diff } };
}
const evalStep = (): RecordedStep => ({ k: 'step', tool: 'eval', args: { expression: 'document.title' }, locators: {} });

describe('collapseTogglePairs', () => {
  it('collapses the fwsi1 shape: an add-less click (older recorder: no removals kept), observations, the same control showing the panel', () => {
    const first = click({}, BY_ROLE, BY_ID, POINT);
    const second = click({ added: PANEL }, BY_ID, BY_ROLE, POINT);
    const out = collapseTogglePairs([first, evalStep(), evalStep(), second]);
    expect(out).toHaveLength(3);
    expect(out).not.toContain(first);
    // identity kept (compile matches kept steps by identity), flagged in place
    expect(out[2]).toBe(second);
    expect(second.toggle).toBe(true);
  });

  it('collapses when what the first click took off is what the second put back', () => {
    const second = click({ added: [...PANEL, '- button ""'] });
    expect(collapseTogglePairs([click({ removed: PANEL }), second])).toEqual([second]);
  });

  it('keeps both clicks when the first did nothing visible (a counter’s "+"), or hid something else', () => {
    const plus = () => click({ removed: [] }, { kind: 'role', role: 'button', name: '+' } as LocatorCandidate);
    const twice = [plus(), { ...plus(), diff: { url: URL, alerts: [], added: ['- text "2"'], dialect: 2 as const } }];
    expect(collapseTogglePairs(twice)).toHaveLength(2);
    const other = [click({ removed: ['- link "Unrelated"', '- link "Other"'] }), click({ added: PANEL })];
    expect(collapseTogglePairs(other)).toHaveLength(2);
    expect(other[1].toggle).toBeUndefined();
  });

  it('keeps both clicks across anything that could change the page, on another control, or by position alone', () => {
    const fill: RecordedStep = { k: 'step', tool: 'fill', args: { target: '@e2', value: 'x' }, locators: {} };
    expect(collapseTogglePairs([click({}), fill, click({ added: PANEL })])).toHaveLength(3);
    const other = { kind: 'role', role: 'button', name: 'Show history' } as LocatorCandidate;
    expect(collapseTogglePairs([click({}), click({ added: PANEL }, other, POINT)])).toHaveLength(2);
    const nth = { kind: 'css', selector: 'div > button:nth-of-type(2)' } as LocatorCandidate;
    expect(collapseTogglePairs([click({}, nth, POINT), click({ added: PANEL }, nth, POINT)])).toHaveLength(2);
    // the second click navigated: not the same page
    expect(collapseTogglePairs([click({}), click({ added: PANEL, url: 'http://127.0.0.1:8098/hardware/5' })])).toHaveLength(2);
  });
});

describe('compile: a toggle pair becomes one flagged click', () => {
  it('compiles fwsi1 05-change’s two Show/Hide clicks to the second, with toggle and its recorded effect', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'report the asset details', url: URL },
      click({}, BY_ROLE, BY_ID, POINT),
      evalStep(),
      click({ added: PANEL }, BY_ID, BY_ROLE, POINT),
      { k: 'step', tool: 'click', args: { target: '@e9' }, locators: chain({ kind: 'role', role: 'link', name: 'History' } as LocatorCandidate), diff: { url: URL, alerts: [], added: ['- table "History"'], dialect: 2 } },
    ];
    const [skill] = compileSkills({ entries, instruction: 'report the asset details', report: { status: 'success', summary: 'done', evidence: { values: {} } }, session: 't', now: '2026-09-22T00:00:00.000Z' });
    expect(skill.steps.map((s) => s.tool)).toEqual(['click', 'click']);
    expect(skill.steps[0].toggle).toBe(true);
    expect(skill.steps[0].expect?.addedContains).toEqual(expect.arrayContaining(['- link "Bench Manufacturer"']));
    expect(skill.steps[1].toggle).toBeUndefined();
  });
});
