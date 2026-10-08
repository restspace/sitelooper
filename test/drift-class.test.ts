import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyDrift, classifyDriftLine, describeDrift, firstBlockingStep, type DriftFlow } from '../src/spec/drift-class.js';

/**
 * fwgt35-luna-cv: converge said "round 2: the compiled spec passed", then
 * readiness run 1 refused the same artifact on these 5 fallbacks, every one a
 * read-back whose value only fed the final report, and build exited 4.
 */
const fixture = JSON.parse(fs.readFileSync(new URL('./fwgt35-luna-cv-drift.fixture.json', import.meta.url), 'utf8')) as { drift: string[]; flow: DriftFlow };
const { drift: FWGT35_DRIFT, flow: FWGT35 } = fixture;

/** The fwgt35 flow with one more step that consumes a value one of the drifting reads published. */
function withConsumer(ref: string): DriftFlow {
  return { steps: [...FWGT35.steps, { id: '08-check', params: { v1: ref }, segments: [{ id: 's_aaaaaa', steps: [{ tool: 'click', args: { target: '@e1' }, locators: {} }] }] }] };
}

describe('drift classification (readiness and converge share it)', () => {
  it('fwgt35-luna-cv: the 5 read-back fallbacks only feed the final report — warnings, none blocking', () => {
    expect(FWGT35_DRIFT).toHaveLength(5);
    const c = classifyDrift(FWGT35_DRIFT, FWGT35);
    expect(c.blocking).toEqual([]);
    expect(c.warnings.map((e) => `${e.step} ${e.site}`)).toEqual([
      '04-set s_6733ad/7', '04-set s_6733ad/8', '05-open s_76d091/10', '07-add s_2b3ae7/5', '07-add s_2b3ae7/7',
    ]);
    expect(c.warnings[0].why).toContain('"sidebar_labels_1"');
    expect(c.warnings[0].why).toContain('only feeds the final report');
  });

  it('a read whose label a later step references blocks', () => {
    const e = classifyDriftLine(FWGT35_DRIFT[2], withConsumer('{{05-open.assignee_displayed}}'));
    expect(e).toMatchObject({ blocking: true, step: '05-open', site: 's_76d091/10' });
    expect(e.why).toContain('08-check');
    // the same label under another step is not this read's value
    expect(classifyDriftLine(FWGT35_DRIFT[2], withConsumer('{{04-set.assignee_displayed}}')).blocking).toBe(false);
  });

  it('a read whose label an assertion uses blocks', () => {
    const flow: DriftFlow = { steps: [...FWGT35.steps, { id: '08-assert', kind: 'assert', params: { v1: '{{07-add.comment_count_bodies_1}}' }, segments: [{ id: 's_bbbbbb', assert: true, steps: [{ tool: 'wait_for', args: { text: '{{v1}}' }, locators: {}, assert: { message: 'shows {{v1}}' } }] }] }] };
    const e = classifyDriftLine(FWGT35_DRIFT[3], flow);
    expect(e.blocking).toBe(true);
    expect(e.why).toContain('an assertion');
  });

  it('a read a later action of its own step uses blocks', () => {
    const flow: DriftFlow = { steps: [{ id: '01-a', segments: [{ id: 's_cccccc', steps: [
      { tool: 'read', args: { target: '@e1', what: 'text' }, label: 'code', locators: {} },
      { tool: 'fill', args: { target: '@e2', value: '{{code}}' }, locators: {} },
    ] }] }] };
    expect(classifyDriftLine('[sitelooper drift] 01-a s_cccccc/1 target: primary x missed; used #2 y (#1 absent)', flow).blocking).toBe(true);
  });

  it('a fallback on a gesture blocks', () => {
    // fwgt35 04-set s_15ad96/2 is a click
    const e = classifyDriftLine("[sitelooper drift] 04-set s_15ad96/2 target: primary locator('#x') missed; used #2 locator('[data-sitelooper-point=\"1,2\"]') (#1 absent)", FWGT35);
    expect(e).toMatchObject({ blocking: true, step: '04-set', site: 's_15ad96/2' });
    expect(e.why).toContain('click');
    // a navigation click that arrived by its recorded destination is a gesture too
    expect(classifyDriftLine('[sitelooper drift] 05-open s_76d091/1: none of 3 recorded locators resolved; navigated to the destination', FWGT35).blocking).toBe(true);
  });

  it('fails closed on anything it cannot place', () => {
    for (const line of [
      '[sitelooper drift] something unparseable',
      '[sitelooper drift] 09-gone s_6733ad/7 target: x',
      '[sitelooper drift] 04-set s_ffffff/7 target: x',
      '[sitelooper drift] 04-set s_6733ad/99 target: x',
      '[sitelooper drift] 04-set s_6733ad: a segment-level line',
    ]) expect(classifyDriftLine(line, FWGT35).blocking, line).toBe(true);
    expect(classifyDrift(FWGT35_DRIFT, null).blocking).toHaveLength(5);
    expect(classifyDrift(FWGT35_DRIFT, { steps: FWGT35.steps.map((s) => ({ id: s.id })) }).blocking).toHaveLength(5);
  });

  it('names the first blocking step in flow order and describes the sites', () => {
    const c = classifyDrift(FWGT35_DRIFT, null);
    expect(firstBlockingStep(c.blocking, FWGT35.steps.map((s) => s.id))).toBe('04-set');
    expect(firstBlockingStep([...c.blocking].reverse(), FWGT35.steps.map((s) => s.id))).toBe('04-set');
    expect(describeDrift(c.blocking)).toBe('5 locator fallback events at 04-set s_6733ad/7, 04-set s_6733ad/8, 05-open s_76d091/10, 07-add s_2b3ae7/5, 07-add s_2b3ae7/7');
  });
});
