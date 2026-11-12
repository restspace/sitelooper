/**
 * The persistence probe is sited only where the save showed its line (fwgr92-fc
 * 05-set). The step's last click after the fill switched to the dashboard's
 * settings view, the only view that shows the tag chip; a goto then opened the
 * plain dashboard, the probe reloaded that view and failed a run the verifier
 * scored 6/6. Two guards: probeSite counts a later goto/back/tab switch as a
 * move, and noteProbe arms no probe on a live url that lacks a literal query
 * key of the pattern (another view), saying so instead.
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { emitFlowFile, probeSite } from '../src/spec/emit.js';
import type { SpecFlow, SpecSegment, SpecStep } from '../src/spec/ir.js';
import type { SkillStep } from '../src/skills/store.js';
import { boundToNothing, identifiesNothing, liveLines, unfilledSlot } from '../src/execution/expect.js';
import { fillParams, oneSidedQueryKeys, urlMatches, urlShapeOf } from '../src/execution/url.js';

const ORIGIN = 'http://127.0.0.1:9';
const VIEW = `${ORIGIN}/d/{{v5}}/{{v6}}?editview=settings&from=:id&to=now`;
const PLAIN = `${ORIGIN}/d/{{v5}}/{{v6}}?from=:id&to=now`;

const fill = (value: string): SkillStep => ({ tool: 'fill', args: { target: '@e1', value }, locators: { target: [{ kind: 'id', selector: '#tag' }] } });
const click = (selector: string, expect?: SkillStep['expect']): SkillStep => ({ tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'id', selector }] }, ...(expect ? { expect } : {}) });
const goto = (url: string): SkillStep => ({ tool: 'goto', args: { url }, locators: {} });
const read = (label: string): SkillStep => ({ tool: 'read', args: { label, what: 'url' }, label, locators: {} });
const chip = (over: SkillStep['expect'] = {}) => click('#settings', { urlPattern: VIEW, addedContains: ['- button "Remove \\"{{v4}}\\" tag"'], lineDialect: 2, ...over });

function seg(steps: SkillStep[], over: Partial<SpecSegment> = {}): SpecSegment {
  return { id: 's_set', template: 'Tag {{v5}} with {{v4}}', params: { v4: { example: 'bench', usedIn: [1] }, v5: { example: 'abc', usedIn: [] }, v6: { example: 'x', usedIn: [] } }, preconditions: { urlPattern: PLAIN }, steps, ...over };
}
function stepOf(segments: SpecSegment[]): SpecStep {
  return { id: '05-set', instruction: 'Tag the dashboard {{tag}}', params: { v4: '{{tag}}' }, outputs: [], segments };
}

describe('probeSite: a navigation after the commit ends the probe page', () => {
  it('sites the probe when the step ends where the line showed (a read after it moves nothing)', () => {
    expect(probeSite(stepOf([seg([fill('{{v4}}'), chip(), read('url')])]))).toEqual({ pattern: VIEW, lines: ['- button "Remove \\"{{v4}}\\" tag"'], dialect: 2 });
  });

  it('the fwgr92-fc shape: a goto with no recorded url after the commit drops the probe', () => {
    expect(probeSite(stepOf([seg([fill('{{v4}}'), chip(), goto(`${ORIGIN}/d/{{v5}}/{{v6}}`), read('url')])]))).toBeNull();
  });

  it('a back or a tab switch after the commit, or a goto in a later segment, drops it too', () => {
    const back: SkillStep = { tool: 'back', args: {}, locators: {} };
    const tabs: SkillStep = { tool: 'tabs', args: { to: 0 }, locators: {} };
    expect(probeSite(stepOf([seg([fill('{{v4}}'), chip(), back])]))).toBeNull();
    expect(probeSite(stepOf([seg([fill('{{v4}}'), chip(), tabs])]))).toBeNull();
    const later = seg([goto(`${ORIGIN}/d/{{v5}}/{{v6}}`)], { id: 's_tail', preconditions: { urlPattern: VIEW } });
    expect(probeSite(stepOf([seg([fill('{{v4}}'), chip()]), later]))).toBeNull();
  });

  it('a goto whose recorded url is the probe page still keeps the probe', () => {
    const back: SkillStep = { ...goto(`${ORIGIN}/d/{{v5}}/{{v6}}?editview=settings`), expect: { urlPattern: VIEW } };
    expect(probeSite(stepOf([seg([fill('{{v4}}'), chip(), back])]))?.pattern).toBe(VIEW);
  });
});

type Run = { probes?: { step: string; url: string; pattern: string; lines: string[] }[] };

describe('noteProbe, executed: a live url lacking a literal query key arms no probe', () => {
  const flow: SpecFlow = { version: 1, name: 'probe-view', origin: ORIGIN, startUrl: `${ORIGIN}/d/abc/x`, vars: ['tag'], steps: [stepOf([seg([fill('{{v4}}'), chip()])])] };
  const { source } = emitFlowFile(flow, { tier: 'plain' });
  const m = /function noteProbe\([\s\S]*?\n\}/.exec(source);
  if (!m) throw new Error('noteProbe not emitted');
  const js = ts.transpileModule(m[0], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const logged: string[] = [];
  const note = new Function(
    'urlMatches', 'urlShapeOf', 'oneSidedQueryKeys', 'fillParams', 'boundToNothing', 'liveLines', 'unfilledSlot', 'identifiesNothing', 'logWarning', 'console',
    `${js}\nreturn noteProbe;`,
  )(urlMatches, urlShapeOf, oneSidedQueryKeys, fillParams, boundToNothing, liveLines, unfilledSlot, identifiesNothing, (w: string) => logged.push(`warn ${w}`), { log: (l: string) => logged.push(l) }) as (
    run: Run, step: string, page: { url(): string }, p: Record<string, string>, pattern: string, recorded: string[], dialect: 1 | 2,
  ) => void;
  const p = { v4: 'bench', v5: 'abc', v6: 'x' };
  const lines = ['- button "Remove \\"{{v4}}\\" tag"'];
  const at = (url: string) => ({ url: () => url });

  it('the step emits the noteProbe call', () => {
    expect(source).toContain(`noteProbe(run, '05-set', page, p, '${VIEW}'`);
  });

  it('the fwgr92-fc shape: the plain dashboard (no editview) is another view — dropped and said', () => {
    const run: Run = {};
    logged.length = 0;
    note(run, '05-set', at(`${ORIGIN}/d/abc/x?from=now-6h&to=now`), p, VIEW, lines, 2);
    expect(run.probes).toBeUndefined();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^\[sitelooper probe\] 05-set: ended on .* lacks the query key\(s\) editview .* no persistence probe$/);
  });

  it('the view the pattern names arms the probe, and an extra live key does not stop it', () => {
    const run: Run = {};
    note(run, '05-set', at(`${ORIGIN}/d/abc/x?editview=settings&from=now-6h&to=now`), p, VIEW, lines, 2);
    note(run, '05-set', at(`${ORIGIN}/d/abc/x?editview=settings&from=now-6h&to=now&refresh=1m`), p, VIEW, lines, 2);
    expect(run.probes).toHaveLength(2);
    expect(run.probes![0].lines).toEqual(['- button "Remove \\"bench\\" tag"']);
  });

  it('a wildcard query key the live url lacks is app state and still arms the probe', () => {
    const run: Run = {};
    note(run, '05-set', at(`${ORIGIN}/d/abc/x?editview=settings&to=now`), p, VIEW, lines, 2);
    expect(run.probes).toHaveLength(1);
  });
});
