import { describe, expect, it } from 'vitest';
import { derivesFromParams, templateValue } from '../src/execution/report.js';
import { synthesizeReport } from '../src/skills/learn.js';
import type { Skill } from '../src/skills/store.js';

/**
 * The report-template rule both runners share (src/execution/report.ts):
 * the daemon's synthesizeReport and the artifact's publication after a step's
 * last segment (fwgh4 03-open) fill the same template the same way.
 */
describe('templateValue', () => {
  it('publishes a value built from the caller’s params, filled for this run', () => {
    expect(templateValue('{{v2}}', { v2: 'fwgh4-n2 Bench Post' })).toBe('fwgh4-n2 Bench Post');
    expect(templateValue('{{v2}}-bench-post', { v2: 'fwgh4-n2' })).toBe('fwgh4-n2-bench-post');
  });

  it('publishes nothing for a recorded literal, an unbound slot, a residual reference, or an empty fill (rule J)', () => {
    expect(derivesFromParams('fwgh4-n1 Bench Post')).toBe(false);
    expect(templateValue('fwgh4-n1 Bench Post', {})).toBeNull();
    expect(templateValue('{{v2}}', {})).toBeNull();
    expect(templateValue('{{v2}}', { v2: '{{03-create.product_name}}' })).toBeNull();
    expect(templateValue('{{v2}}', { v2: '' })).toBeNull();
  });

  it('is exactly what the daemon’s zero-model report keeps', () => {
    const skill = { id: 's_t', params: {}, steps: [], reportTemplate: { summary: 'created {{v2}}', values: { title: '{{v2}}', literal: 'RD-1017', empty: '{{v3}}', read: '{{v2}}' } } } as unknown as Skill;
    const params = { v2: 'fwgh4-n2 Bench Post', v3: '' };
    const report = synthesizeReport(skill, params, { read: 'live value' });
    expect(report.evidence?.values).toEqual({ title: 'fwgh4-n2 Bench Post', read: 'live value' });
    for (const [k, v] of Object.entries(skill.reportTemplate!.values)) {
      if (k === 'read') continue;
      expect(report.evidence?.values?.[k] ?? null).toBe(templateValue(v, params));
    }
  });
});
