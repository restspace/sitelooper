import { describe, expect, it } from 'vitest';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import { type TransformNote, dropSupersededNavigation } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * openproject fwop6-n1 01-signin (s_4b8679): two clicks on the Bench Project
 * link that recorded no change, then `goto /projects/bench-project`. On replay
 * the first click did navigate, and the second was stranded on the project
 * page: "stopped at step 2 — expected url /projects but browser is at
 * /projects/bench-project".
 */
const LIST = 'http://127.0.0.1:8090/projects';
const link = (name: string): LocatorCandidate[] => [
  { kind: 'css', selector: 'main a[href="/projects/bench-project"]' },
  { kind: 'role', role: 'link', name },
  { kind: 'point', x: 446, y: 308, w: 87.2, h: 16, role: 'link', tag: 'a', vw: 1280, vh: 900 },
];
const click = (chain: LocatorCandidate[], expect: SkillStep['expect'] = { urlPattern: LIST, lineDialect: 2 }): SkillStep => ({ tool: 'click', args: { target: '@e702' }, locators: { target: chain }, expect });
const goto: SkillStep = { tool: 'goto', args: { url: 'http://127.0.0.1:8090/projects/bench-project' }, locators: {} };

describe('dropSupersededNavigation: a link click a goto replaced (FIX W)', () => {
  it('[link click (no change), link click (no change), goto X] compiles to [goto X]', () => {
    const notes: TransformNote[] = [];
    const out = dropSupersededNavigation([click(link('Bench Project')), click(link('Bench Project')), goto], notes);
    expect(out).toEqual([goto]);
    expect(notes.filter((n) => n.name === 'dropSupersededNavigation')).toHaveLength(2);
  });

  it('steps over an observation between the click and the goto', () => {
    const read: SkillStep = { tool: 'read', args: { what: 'url' }, locators: {}, label: 'current_url' };
    expect(dropSupersededNavigation([click(link('Bench Project')), read, goto])).toEqual([read, goto]);
  });

  it('keeps a button click that recorded no change', () => {
    const button = click([{ kind: 'role', role: 'button', name: 'Bench Project' }]);
    expect(dropSupersededNavigation([button, goto])).toEqual([button, goto]);
  });

  it('keeps a link click that added lines, navigated or raised an alert', () => {
    const added = click(link('Bench Project'), { urlPattern: LIST, addedContains: ['- heading "Bench Project"'] });
    expect(dropSupersededNavigation([added, goto])).toEqual([added, goto]);
    const moved = click(link('Bench Project'), { urlPattern: `${LIST}/bench-project` });
    const before: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Filter' }] }, expect: { urlPattern: LIST, addedContains: ['- row "x"'] } };
    expect(dropSupersededNavigation([before, moved, goto])).toEqual([before, moved, goto]);
    const alerted = click(link('Bench Project'), { urlPattern: LIST, alertContains: 'Saved' });
    expect(dropSupersededNavigation([alerted, goto])).toEqual([alerted, goto]);
  });

  it('keeps the click when another gesture comes before the goto', () => {
    const fill: SkillStep = { tool: 'fill', args: { target: '@e2', value: 'x' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Search' }] } };
    const c = click(link('Bench Project'));
    expect(dropSupersededNavigation([c, fill, goto])).toEqual([c, fill, goto]);
  });
});
