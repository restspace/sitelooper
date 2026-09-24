import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep, StepDiff } from '../src/daemon/recorder.js';
import { pressHadNoEffect } from '../src/execution/toggle.js';
import { compileSkills, dropSupersededNavigation } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * ghost fwgh12-n1 03-publish (round 57; n1 lines 57-88 verbatim): after the
 * publish flow Ghost IGNORES the first click on link "Published" — step 63
 * recorded `{url: …#/posts?type=draft, added: [], removed: []}`, a read at 64
 * returned [] — and only the identical click at 66 navigated to
 * ?type=published. Only a read and a screenshot lie between them.
 * abandonedRepeatClick (round 43, fwec5) dropped step 63 as a failed attempt,
 * every replay clicked once and stopped (s_cd37ed demoted), and the compiled
 * run failed.
 */
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', 'fwgh12-n1-03-publish.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

function compiled(es: RecordedEntry[] = entries(), stoppedAt?: { skill: string; step: number }): SkillStep[] {
  const head = es[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = es.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report');
  return compileSkills({
    entries: es.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: report?.summary ?? '', evidence: { values: report?.values ?? {} } },
    session: 't',
    knownValues: { 'var:runid': 'fwgh12-n1' },
    ...(stoppedAt ? { stoppedAt } : {}),
  }).flatMap((s) => s.steps);
}
const published = (steps: SkillStep[]) => steps.filter((s) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes('"name":"Published"'));

describe('a click the app ignored once, with only observations before its repeat (fwgh12)', () => {
  it('compiles to ONE click marked repeatIfNoEffect', () => {
    const clicks = published(compiled());
    expect(clicks).toHaveLength(1);
    expect(clicks[0].repeatIfNoEffect).toBe(true);
    // the kept click is the one whose press had the effect
    expect(clicks[0].expect?.addedContains?.some((l) => l.includes('Seed'))).toBe(true);
  });

  it('the fwec5 shape, field work between the two, is still dropped without a mark', () => {
    const CREATE = 'http://127.0.0.1:8097/#Opportunity/create';
    const save = [{ kind: 'css' as const, selector: 'role=button[name="Save"]' }];
    const amount = [{ kind: 'css' as const, selector: '.cell[data-name="amount"] input.main-element' }];
    const firstSave: SkillStep = { tool: 'click', args: { target: '@s' }, locators: { target: save }, expect: { urlPattern: CREATE } };
    const retype: SkillStep = { tool: 'type', args: { target: '@a', text: '12500' }, locators: { target: amount }, expect: { urlPattern: CREATE, addedContains: ['- textbox "": 12,500'] } };
    const realSave: SkillStep = { tool: 'click', args: { target: '@s' }, locators: { target: save }, expect: { urlPattern: 'http://127.0.0.1:8097/#Opportunity/view/{{d1}}', addedContains: ['- button "Follow"'] }, mints: { at: 'h2' } };
    const recorded = new Map<SkillStep, StepDiff>([
      [firstSave, { url: CREATE, alerts: [], added: [], removed: ['- textbox "": 12500'], dialect: 2 }],
      [retype, { url: CREATE, alerts: [], added: ['- textbox "": 12,500'], dialect: 2 }],
    ]);
    const out = dropSupersededNavigation([firstSave, retype, realSave], [], (s) => recorded.get(s));
    expect(out).toEqual([retype, realSave]);
    expect(realSave.repeatIfNoEffect).toBeUndefined();
  });
});

describe('pressHadNoEffect: the recorded no-effect condition, and nothing looser', () => {
  const base = { urlBefore: 'http://x/#/posts?type=draft', urlAfter: 'http://x/#/posts?type=draft', added: [] as string[], removed: [] as string[], alerts: [] as string[] };
  it('holds only when the url held and nothing was added, removed or raised', () => {
    expect(pressHadNoEffect(base)).toBe(true);
    expect(pressHadNoEffect({ ...base, urlAfter: 'http://x/#/posts?type=published' })).toBe(false);
    expect(pressHadNoEffect({ ...base, added: ['- heading "Seed"'] })).toBe(false);
    expect(pressHadNoEffect({ ...base, removed: ['- button "Publish"'] })).toBe(false);
    expect(pressHadNoEffect({ ...base, alerts: ['Saved'] })).toBe(false);
    // a capture that failed is no evidence of "nothing happened"
    expect(pressHadNoEffect({ ...base, added: null })).toBe(false);
  });
});

describe('recovery splice: the replayed click that had no effect joins the recovery’s effective click', () => {
  it('keeps one click, marked, instead of losing the first press (s_e46ad2 → s_414d80)', () => {
    const es = entries();
    // The replay's click, recorded via the pinned skill, stopped as "did not
    // have its recorded effect"; the recovery's first action is the same
    // click, which navigated. Rebuilt from 63/66: 63 carried as the replay's.
    const firstIdx = es.findIndex((e) => e.k === 'step' && e.tool === 'click' && JSON.stringify(e.locators?.target?.chain ?? []).includes('"name":"Published"') && e.diff?.added?.length === 0);
    const replayed = { ...(es[firstIdx] as RecordedStep), via: { skill: 's_cd37ed', step: 1 } };
    const spliced = es.map((e, i) => (i === firstIdx ? replayed : e));
    const clicks = published(compiled(spliced, { skill: 's_cd37ed', step: 1 }));
    expect(clicks).toHaveLength(1);
    expect(clicks[0].repeatIfNoEffect).toBe(true);
  });
});
