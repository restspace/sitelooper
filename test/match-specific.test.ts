/**
 * The zero-model template match takes the most specific stored procedure, not
 * the first one the store lists; a flow step's candidates put a looser reading
 * of the instruction last.
 *
 * A slot reads as "any text", so a template that ends in a slot also matches
 * every longer sentence that starts the same way. test/assert-e2e.browser
 * .test.ts stores `the owner is admin` and a four-part sentence that begins
 * with the same words; re-issued, the long sentence was answered by the short
 * procedure whenever the store listed it first, with its slot bound to the
 * rest of the sentence — and a skill's id hashes its creation time, so the
 * order changed from run to run.
 */
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { bindSkill, matchTemplate, selectCandidates } from '../src/skills/learn.js';
import type { Skill } from '../src/skills/store.js';

const APP = 'http://app.test';
const PAGE = `${APP}/items`;
const SHORT = 'the owner is admin';
const LONG = 'the owner is admin, the list has 1 item and the url contains /items';

const OWNER: LocatorCandidate[] = [
  { kind: 'role', role: 'textbox', name: 'Owner' },
  { kind: 'css', selector: '#owner' },
];
const ITEMS: LocatorCandidate[] = [{ kind: 'testid', attr: 'data-testid', value: 'item' }];

const step = (args: Record<string, unknown>, chain?: LocatorCandidate[]): RecordedStep => ({
  k: 'step',
  tool: 'wait_for',
  args,
  locators: chain ? { target: { expr: 'page.locator()', verified: true, raw: String(args.target ?? ''), chain } } : {},
});

function compiled(text: string, steps: RecordedStep[], now: string): Skill {
  const entries: RecordedEntry[] = [{ k: 'instruction', text, url: PAGE, assert: true, startText: '- textbox "Owner": admin' }, ...steps];
  const [skill] = compileSkills({ entries, instruction: text, report: { status: 'success', summary: 'holds', evidence: { values: {} } }, session: 'match', now });
  skill.status = 'validated';
  return skill;
}

const short = (now = '2026-11-12T00:00:01.000Z'): Skill => compiled(SHORT, [step({ target: '#owner', state: 'value_equals', text: 'admin' }, OWNER)], now);
const long = (now = '2026-11-12T00:00:00.000Z'): Skill =>
  compiled(
    LONG,
    [
      step({ target: '#owner', state: 'value_equals', text: 'admin' }, OWNER),
      step({ target: '[data-testid="item"]', state: 'count', count: 1 }, ITEMS),
      step({ state: 'url_contains', text: '/items' }),
    ],
    now,
  );

describe('zero-model template match: the most specific procedure answers', () => {
  it('the short template does read over the long sentence, its slot taking the rest of it', () => {
    const s = short();
    expect(s.template).toBe('the owner is {{v1}}');
    expect(bindSkill(s, LONG)).toEqual({ v1: 'admin, the list has 1 item and the url contains /items' });
  });

  it('answers the long sentence with the long procedure, whichever the store lists first', () => {
    const s = short();
    const l = long();
    expect(s.id).not.toBe(l.id);
    for (const skills of [[s, l], [l, s]]) {
      const m = matchTemplate(skills, LONG, PAGE, {}, { assert: true });
      expect(m?.skill.id).toBe(l.id);
      expect(m?.skill.steps).toHaveLength(3);
      // …and the owner check is asked about `admin`, not about the rest of the sentence.
      expect(Object.values(m!.params)).not.toContain('admin, the list has 1 item and the url contains /items');
    }
  });

  it('still answers the short sentence with the short procedure', () => {
    const s = short();
    const l = long();
    for (const skills of [[s, l], [l, s]]) {
      const m = matchTemplate(skills, SHORT, PAGE, {}, { assert: true });
      expect(m?.skill.id).toBe(s.id);
      expect(m?.params).toEqual({ v1: 'admin' });
    }
  });

  it('with no better procedure stored, the short one still matches the long sentence (not closed by this rule)', () => {
    expect(matchTemplate([short()], LONG, PAGE, {}, { assert: true })?.skill.steps).toHaveLength(1);
  });

  it('a flow step pinned to the long procedure tries it first, however good the short one\'s record', () => {
    const s: Skill = { ...short(), stats: { ...short().stats, uses: 5, successes: 5 } };
    const l: Skill = { ...long(), stats: { ...long().stats, uses: 2, successes: 2 } };
    for (const skills of [[s, l], [l, s]]) {
      for (const pinned of [undefined, { v1: 'admin', v2: '/items' }]) {
        const order = selectCandidates(skills, l.id, LONG, pinned, {}).map((c) => c.skill.id);
        expect(order).toEqual([l.id, s.id]);
      }
    }
    // The short step's own candidates are untouched: the long template does not read over the short sentence.
    expect(selectCandidates([s, l], s.id, SHORT, { v1: 'admin' }, {}).map((c) => c.skill.id)).toEqual([s.id]);
  });

  it('a looser reading is still offered when it is the only one', () => {
    // (An assertion is a candidate only for a step pinned to one, so the step is pinned to it here.)
    const s = short();
    expect(selectCandidates([s], s.id, LONG, undefined, {}).map((c) => c.skill.id)).toEqual([s.id]);
  });

  it('between two procedures with the same template, takes the better record, then the older, in either store order', () => {
    const older = short('2026-11-12T00:00:01.000Z');
    const newer = short('2026-11-12T00:00:02.000Z');
    expect(older.id).not.toBe(newer.id);
    for (const skills of [[older, newer], [newer, older]]) {
      expect(matchTemplate(skills, SHORT, PAGE, {}, { assert: true })?.skill.id).toBe(older.id);
    }
    const proven: Skill = { ...newer, stats: { ...newer.stats, uses: 4, successes: 4 } };
    const shaky: Skill = { ...older, stats: { ...older.stats, uses: 4, successes: 2 } };
    for (const skills of [[shaky, proven], [proven, shaky]]) {
      expect(matchTemplate(skills, SHORT, PAGE, {}, { assert: true })?.skill.id).toBe(proven.id);
    }
  });
});
