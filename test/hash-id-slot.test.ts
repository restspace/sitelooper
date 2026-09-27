import { describe, expect, it } from 'vitest';
import type { LocatorCandidate } from '../src/skills/store.js';
import { substituteHashIds, substituteHashIdsIn } from '../src/skills/compile.js';

/**
 * Round 73, gitea fwgt27 05-open: the assignee picker's procedure clicked the
 * issue heading `"fwgt27-n1 Bench Issue #4"`. The title became `{{v6}}`, but
 * `4` is a one-digit url id (`/issues/4`, banked at p3), which the text floor
 * keeps out of every token substitution — so `#4` stayed literal, and n2
 * (`#5`), n3 (`#6`) and the artifact missed every identifying locator there.
 * Prefixed with the app's own `#` and bounded, the digit is that record.
 */
describe('substituteHashIds', () => {
  const slots = [{ name: 'v3', value: '4', at: 'p3' }];

  it('writes a position-only url id where a name prints it as the record number', () => {
    expect(substituteHashIds('fwgt27-n1 Bench Issue #4', slots)).toBe('fwgt27-n1 Bench Issue #{{v3}}');
    expect(substituteHashIds('#4', slots)).toBe('#{{v3}}');
    expect(substituteHashIds('#4 - Bench Issue', slots)).toBe('#{{v3}} - Bench Issue');
  });

  it('leaves the digit alone anywhere else', () => {
    expect(substituteHashIds('4 open issues', slots)).toBe('4 open issues');
    expect(substituteHashIds('Bench Issue #40', slots)).toBe('Bench Issue #40');
    expect(substituteHashIds('Bench Issue #14', slots)).toBe('Bench Issue #14');
    expect(substituteHashIds('#4a', slots)).toBe('#4a');
    expect(substituteHashIds('##4', slots)).toBe('##4');
    expect(substituteHashIds('div:nth-of-type(4)', slots)).toBe('div:nth-of-type(4)');
  });

  it('never rewrites a marker already written, and only path or hash-route positions', () => {
    expect(substituteHashIds('#{{v3}}', slots)).toBe('#{{v3}}');
    expect(substituteHashIds('Order #21', [{ name: 'v2', value: '21', at: 'q.id' }])).toBe('Order #21');
    expect(substituteHashIds('Task #7', [{ name: 'v2', value: '7', at: 'h1' }])).toBe('Task #{{v2}}');
    expect(substituteHashIds('Task #7', [{ name: 'v2', value: '', at: 'p1' }])).toBe('Task #7');
  });

  it('writes into a candidate\'s name fields and nothing else', () => {
    const role: LocatorCandidate = { kind: 'role', role: 'heading', name: 'fwgt27-n1 Bench Issue #4' };
    expect(substituteHashIdsIn(role, slots)).toEqual({ kind: 'role', role: 'heading', name: 'fwgt27-n1 Bench Issue #{{v3}}' });
    expect(substituteHashIdsIn({ kind: 'text', text: 'Issue #4' }, slots)).toEqual({ kind: 'text', text: 'Issue #{{v3}}' });
    expect(substituteHashIdsIn({ kind: 'label', label: 'Issue #4' }, slots)).toEqual({ kind: 'label', label: 'Issue #{{v3}}' });
    const css: LocatorCandidate = { kind: 'css', selector: '#issue-4-title' };
    expect(substituteHashIdsIn(css, slots)).toBe(css);
    const point: LocatorCandidate = { kind: 'point', x: 1, y: 2, w: 3, h: 4, role: 'heading', tag: 'h1', vw: 1280, vh: 900 };
    expect(substituteHashIdsIn(point, slots)).toBe(point);
  });
});
