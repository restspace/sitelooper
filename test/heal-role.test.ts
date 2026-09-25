/**
 * Round 61 rule D (ghost fwgh14 n3, openproject fwop15 n2/n3): an inline heal
 * that proposes a DIFFERENT ROLE than the recorded chain names, for a click
 * whose recording stayed on its url, is not dispatched. fwop15's s_bab182
 * step 5 recorded a click on link "Bench Project" that stayed on /projects;
 * on the project page the heal proposed button "Bench Project" (the project
 * selector), clicked it, and only then did the step's own url gate refuse it —
 * the collateral click had already landed (fwgh14 n3's heal clicked Ghost's
 * Settings nav the same way). Replay-only: the compiled artifact has no
 * inline heal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { healRoleRefused } from '../src/skills/replay.js';
import type { Skill } from '../src/skills/store.js';

const skill = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture', 'fwop15-s_bab182.json'), 'utf8')) as Skill;
const STEP5 = 4;

describe('healRoleRefused (rule D)', () => {
  it('refuses a button proposed for fwop15 s_bab182 step 5’s link, a click recorded staying on /projects', () => {
    const why = healRoleRefused(skill.steps, STEP5, skill.preconditions.urlPattern, skill.steps[STEP5].locators.target!, { kind: 'role', role: 'button', name: 'Bench Project' });
    expect(why).toMatch(/proposed a button .* recorded as a link/);
  });

  it('control: a heal of the same role still dispatches', () => {
    expect(healRoleRefused(skill.steps, STEP5, skill.preconditions.urlPattern, skill.steps[STEP5].locators.target!, { kind: 'role', role: 'link', name: 'Bench Project' })).toBeNull();
  });

  it('control: a click whose recording navigated is judged by its url gate as before', () => {
    const steps = structuredClone(skill.steps);
    steps[STEP5].expect = { ...steps[STEP5].expect, urlPattern: 'http://127.0.0.1:8090/projects/bench-project' };
    expect(healRoleRefused(steps, STEP5, skill.preconditions.urlPattern, steps[STEP5].locators.target!, { kind: 'role', role: 'button', name: 'Bench Project' })).toBeNull();
  });

  it('control: no recorded role, or a proposal with none, decides nothing', () => {
    const cssOnly = [{ kind: 'css' as const, selector: '#x' }];
    expect(healRoleRefused(skill.steps, STEP5, skill.preconditions.urlPattern, cssOnly, { kind: 'role', role: 'button', name: 'x' })).toBeNull();
    expect(healRoleRefused(skill.steps, STEP5, skill.preconditions.urlPattern, skill.steps[STEP5].locators.target!, { kind: 'css', selector: '#x' })).toBeNull();
  });
});
