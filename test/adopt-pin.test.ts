import { describe, expect, it } from 'vitest';
import { canAdoptPin } from '../src/skills/learn.js';
import type { Skill, SkillStore } from '../src/skills/store.js';

/**
 * fwod34r's 08-open: "open the order and report its status" replayed 07-open's
 * validated read-only skill at tier B on five straight runs and never kept
 * it, because rule 1 ("a skill another step owns is that step's procedure")
 * refused to let two steps share ANY skill. A read-only procedure is a way of
 * looking at a page; two steps may look the same way. A mutating one stays
 * exclusive, and a step that asks to change something never settles for a
 * read.
 */
describe('canAdoptPin', () => {
  const skill = (id: string, tool: string): Skill =>
    ({ id, origin: 'http://x', template: id, params: {}, preconditions: { urlPattern: 'http://x/' }, steps: [{ tool, args: {}, locators: {} }], stats: { uses: 0, successes: 0, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 }, status: 'validated', provenance: { created: '' } }) as unknown as Skill;
  const store = { get: (id: string) => ({ s_read: skill('s_read', 'read'), s_write: skill('s_write', 'click') })[id] ?? null } as unknown as SkillStore;
  const steps = [{ id: '07-open', skill: 's_read' }, { id: '08-open' }, { id: '09-change', skill: 's_write' }];

  it('lets a second step share a read-only skill', () => {
    expect(canAdoptPin(store, steps, '08-open', undefined, 's_read', 'read-only')).toBe(true);
  });

  it('keeps a mutating skill exclusive to the step that owns it', () => {
    expect(canAdoptPin(store, steps, '08-open', undefined, 's_write', 'mutating')).toBe(false);
  });

  it('never lets a step that asks to change something adopt a read, pinned or not', () => {
    expect(canAdoptPin(store, steps, '08-open', undefined, 's_read', 'mutating')).toBe(false);
    expect(canAdoptPin(store, steps, '09-change', 's_write', 's_read', null)).toBe(false);
  });

  it('is unchanged for a plain re-pin onto an unowned mutating skill', () => {
    expect(canAdoptPin(store, steps, '08-open', undefined, 's_new', null)).toBe(true);
  });
});
