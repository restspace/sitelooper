import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteFactStore } from '../src/skills/facts.js';
import type { SkillStep } from '../src/skills/store.js';
import { emptyFacts, observeFact, type SiteFacts } from '../src/execution/facts.js';
import {
  classifyReportValueWithFacts,
  controlKey,
  counterNames,
  identityMarkerVerdictWithFacts,
  maskCountersWithFacts,
  reportFormatKey,
  slotRenderings,
  titleKey,
  typedControls,
} from '../src/execution/facts-display.js';
import { classifyReportValue } from '../src/execution/report.js';
import { identityMarkerVerdict } from '../src/execution/gates.js';
import { maskCounters } from '../src/execution/text.js';
import { liveLines } from '../src/execution/expect.js';
import * as facade from '../src/skills/facts-format.js';

const ESPO = 'http://espo.test';
const ESPO_URL = `${ESPO}/#Opportunity/edit/66f1a2b3c4d5e6f70`;
const VK = 'http://vikunja.test';
const VK_URL = `${VK}/tasks/4`;

function withFormat(sf: SiteFacts, key: string, kind: string, tpl?: string, hard = true, session = 's1'): SiteFacts {
  observeFact(sf, { k: 'format', key, v: tpl === undefined ? { kind: kind as never } : { kind: kind as never, tpl }, hard, session });
  return sf;
}

function look(presence: 'present' | 'absent' | 'unknown', lines: string[] | null, title = '') {
  return { presence, lines: vi.fn(async () => lines), title: vi.fn(async () => title) };
}

describe('facts-display: keys', () => {
  it('the key helpers are the ones facts-format re-exports', () => {
    expect(facade.controlKey).toBe(controlKey);
    expect(facade.reportFormatKey).toBe(reportFormatKey);
    expect(facade.titleKey).toBe(titleKey);
    expect(controlKey(VK_URL, 'textbox', ' Amount  due ')).toBe(`${VK}/tasks/*|textbox|Amount due`);
  });

  it('typedControls: the role candidate of every step that types a slot, loop bodies included', () => {
    const steps = [
      { args: { value: '{{v1}}' }, locators: { target: [{ kind: 'css', value: '#amount' }, { kind: 'role', role: 'textbox', name: 'Amount' }] } },
      { args: { text: 'x {{v2}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Name' }] } },
      { args: {}, body: [{ args: { value: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'spinbutton', name: 'Amount' }] } }] },
      { args: { value: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Amount' }] } },
    ];
    expect(typedControls(steps)).toEqual({
      v1: [
        { role: 'textbox', name: 'Amount' },
        { role: 'spinbutton', name: 'Amount' },
      ],
      v2: [{ role: 'textbox', name: 'Name' }],
    });
  });
});

describe('facts-display: consumer 1, the report classification', () => {
  const amountKey = controlKey(ESPO_URL, 'textbox', 'Amount');
  const espoFacts = () => withFormat(withFormat(emptyFacts(ESPO), amountKey, 'thousands'), amountKey, 'decimals');
  const controls = { v1: [{ role: 'textbox', name: 'Amount' }] };
  const params = { v1: '12500' };
  const evidence = { typed: ['v1'], live: ['12,500.00'] };

  it('the espo amount: typed 12500, read back 12,500.00 under a reliable thousands+decimals fact → committed, applied', () => {
    expect(classifyReportValue('{{v1}}', params, null, evidence).class).toBe('echo');
    expect(slotRenderings(espoFacts(), ESPO_URL, controls, params)).toEqual({ v1: ['12,500.00'] });
    // the published value is the EXACT fill: a rendering is only a spelling to accept
    expect(classifyReportValueWithFacts(espoFacts(), ESPO_URL, controls, '{{v1}}', params, null, evidence)).toEqual({ value: '12500', class: 'committed', slots: [], applied: true });
  });

  it('the format holds on any route of the origin', () => {
    const other = `${ESPO}/#Opportunity/view/66f1a2b3c4d5e6f70`;
    expect(classifyReportValueWithFacts(espoFacts(), other, controls, '{{v1}}', params, null, evidence)).toMatchObject({ class: 'committed', applied: true });
  });

  it('two open slots: each rendered alone, then both', () => {
    const sf = espoFacts();
    withFormat(sf, controlKey(ESPO_URL, 'textbox', 'Budget'), 'thousands');
    const both = { v1: [{ role: 'textbox', name: 'Amount' }], v2: [{ role: 'textbox', name: 'Budget' }] };
    const p = { v1: '12500', v2: '30000' };
    const ev = { typed: ['v1', 'v2'], live: ['12,500.00 of 30,000'] };
    const shown = ['Amount 12,500.00 of 30,000'];
    expect(classifyReportValue('{{v1}} of {{v2}}', p, shown, ev).class).toBe('echo');
    // one slot rendered alone leaves the other an echo; both rendered commit
    expect(classifyReportValueWithFacts(sf, ESPO_URL, both, '{{v1}} of {{v2}}', p, shown, ev)).toEqual({ value: '12500 of 30000', class: 'committed', slots: [], applied: true });
  });

  it('fallback byte-identical: empty facts, advisory facts, no controls, no rendering read back', () => {
    const today = classifyReportValue('{{v1}}', params, null, evidence);
    const empty = classifyReportValueWithFacts(emptyFacts(ESPO), ESPO_URL, controls, '{{v1}}', params, null, evidence);
    expect(empty).toStrictEqual(today);
    const advisory = withFormat(emptyFacts(ESPO), amountKey, 'thousands', undefined, false);
    expect(classifyReportValueWithFacts(advisory, ESPO_URL, controls, '{{v1}}', params, null, evidence)).toStrictEqual(today);
    expect(classifyReportValueWithFacts(espoFacts(), ESPO_URL, {}, '{{v1}}', params, null, evidence)).toStrictEqual(today);
    const unread = { typed: ['v1'], live: ['99,000.00'] };
    expect(classifyReportValueWithFacts(espoFacts(), ESPO_URL, controls, '{{v1}}', params, null, unread)).toStrictEqual(classifyReportValue('{{v1}}', params, null, unread));
    // not an echo: untouched
    const committed = { typed: ['v1'], live: [], committed: ['v1'] };
    expect(classifyReportValueWithFacts(espoFacts(), ESPO_URL, controls, '{{v1}}', params, null, committed)).toStrictEqual(classifyReportValue('{{v1}}', params, null, committed));
  });
});

describe('facts-display: consumer 2, the identity gate', () => {
  it('the vikunja identity: a marker bound to #4, the page titled "Task #4 (#4)" → pass, applied', async () => {
    const sf = withFormat(emptyFacts(VK), titleKey(VK_URL), 'affix', 'Task {{=}} ({{=}})');
    const l = look('absent', ['- heading "Tasks"'], 'Task #4 (#4)');
    const v = await identityMarkerVerdictWithFacts(sf, `${VK}/tasks/:id`, VK_URL, { v1: '#4' }, '#4', l);
    expect(v).toMatchObject({ pass: true, applied: true });
    expect(v.reason).toContain('by fact: format affix on');
    expect(l.lines).not.toHaveBeenCalled();
  });

  it('a rendering the page lines show whole passes; one they do not show refuses', async () => {
    const key = reportFormatKey(VK_URL, 'task_ref');
    const sf = withFormat(emptyFacts(VK), key, 'affix', 'Task {{=}}');
    const shown = await identityMarkerVerdictWithFacts(sf, undefined, VK_URL, {}, '#4', look('absent', ['- heading "Task #4 (#4)"']));
    expect(shown).toMatchObject({ pass: true, applied: true });
    const other = await identityMarkerVerdictWithFacts(sf, undefined, VK_URL, {}, '#4', look('absent', ['- heading "Task #41"']));
    expect(other).toStrictEqual({ pass: false });
    // the page could not be read: nothing shows
    expect(await identityMarkerVerdictWithFacts(sf, undefined, VK_URL, {}, '#4', look('unknown', null))).toStrictEqual({ pass: false });
  });

  it('fallback byte-identical, and the page is not looked at again without a reliable rendering', async () => {
    const pattern = `${VK}/tasks/{{v2}}`;
    for (const sf of [emptyFacts(VK), withFormat(emptyFacts(VK), titleKey(VK_URL), 'affix', 'Task {{=}}', false)]) {
      for (const presence of ['present', 'absent', 'unknown'] as const) {
        for (const params of [{ v2: '4' }, { v2: '5' }]) {
          const l = look(presence, ['- heading "Task #4"'], 'Task #4');
          expect(await identityMarkerVerdictWithFacts(sf, pattern, VK_URL, params, '#4', l)).toStrictEqual(identityMarkerVerdict(pattern, VK_URL, params, '#4', presence));
          expect(l.lines).not.toHaveBeenCalled();
          expect(l.title).not.toHaveBeenCalled();
        }
      }
    }
  });

  it('a pass today is not re-decided', async () => {
    const sf = withFormat(emptyFacts(VK), titleKey(VK_URL), 'affix', 'Task {{=}} ({{=}})');
    const l = look('absent', [], 'Task #4 (#4)');
    const v = await identityMarkerVerdictWithFacts(sf, `${VK}/tasks/{{v2}}`, VK_URL, { v2: '4' }, '#4', l);
    expect(v.applied).toBeUndefined();
    expect(v.pass).toBe(true);
    expect(l.title).not.toHaveBeenCalled();
  });
});

describe('facts-display: consumer 5, counters', () => {
  it('a reliable counter fact masks a "- link "3 Open"" name, and any role', () => {
    const sf = withFormat(emptyFacts(VK), controlKey(VK_URL, 'link', 'Open'), 'counter', undefined, false, 's1');
    expect(counterNames(sf, VK_URL)).toEqual([]); // soft, one session: advisory
    withFormat(sf, controlKey(VK_URL, 'link', 'Open'), 'counter', undefined, false, 's2');
    withFormat(sf, controlKey(VK_URL, 'heading', 'Open issues'), 'counter');
    expect(counterNames(sf, VK_URL)).toEqual(['link|Open', 'heading|Open issues']);
    expect(counterNames(sf, `${VK}/projects/2`)).toEqual([]);
    const names = counterNames(sf, VK_URL);
    expect(maskCountersWithFacts('- link "3 Open"', names)).toBe('- link "{{*}} Open"');
    expect(maskCountersWithFacts('- heading "12 Open issues"', names)).toBe('- heading "{{*}} Open issues"');
    expect(maskCountersWithFacts('- heading "12 Closed issues"', names)).toBe('- heading "12 Closed issues"');
    expect(liveLines(['- heading "12 Open issues"'], {}, names)).toEqual(['- heading "{{*}} Open issues"']);
  });

  it('fallback byte-identical: no names is maskCounters', () => {
    for (const line of ['- link "3 Open"', '- heading "12 Open issues"', '- menu "6 3 YourCompany"', '- cell "3"', 'text']) {
      expect(maskCountersWithFacts(line, [])).toBe(maskCounters(line));
      expect(liveLines([line], {}, [])).toEqual(liveLines([line], {}));
    }
    expect(counterNames(emptyFacts(VK), VK_URL)).toEqual([]);
  });
});

describe('facts-format: the switched shadows return the fact-decided verdict and stamp applied', () => {
  let dir: string;
  let store: SiteFactStore;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-facts-display-'));
    store = new SiteFactStore(dir);
    facade.useFormatStore(store);
    facade.takeFormatShadowRows();
  });
  afterEach(() => {
    facade.useFormatStore(null);
    facade.takeFormatShadowRows();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('shadowClassify: committed by fact, the facts.classify row applied', () => {
    const key = controlKey(ESPO_URL, 'textbox', 'Amount');
    store.observe(ESPO, [
      { k: 'format', key, v: { kind: 'thousands' }, hard: true, session: 'rec-1' },
      { k: 'format', key, v: { kind: 'decimals' }, hard: true, session: 'rec-1' },
    ]);
    const steps = [{ tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Amount' }] } }] as unknown as SkillStep[];
    const params = { v1: '12500' };
    const evidence = { typed: ['v1'], live: ['12,500.00'] };
    const today = classifyReportValue('{{v1}}', params, null, evidence);
    expect(facade.shadowClassify({ origin: ESPO, steps }, undefined, '{{v1}}', params, null, evidence, today, ESPO_URL)).toEqual({ value: '12500', class: 'committed', slots: [], applied: true });
    const rows = facade.takeFormatShadowRows() as unknown as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rule: 'facts.classify', fact: 'committed', heuristic: 'echo', agree: false, applied: true });
    // no facts on the origin: today's verdict, the same object, no row
    expect(facade.shadowClassify({ origin: 'http://other.test', steps }, undefined, '{{v1}}', params, null, evidence, today)).toBe(today);
    expect(facade.takeFormatShadowRows()).toEqual([]);
  });

  it('shadowIdentity: passes by the snapshot title fact, the facts.identity row applied; no snapshot decides from nothing', async () => {
    const sf = withFormat(emptyFacts(VK), titleKey(VK_URL), 'affix', 'Task {{=}} ({{=}})');
    const page = { url: () => VK_URL, title: async () => 'Task #4 (#4)', isClosed: () => false, evaluate: async () => null } as unknown as Page;
    const v = await facade.shadowIdentity(page, sf, undefined, {}, '#4', 'absent');
    expect(v).toMatchObject({ pass: true, applied: true });
    const rows = facade.takeFormatShadowRows() as unknown as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rule: 'facts.identity', fact: 'pass', heuristic: 'refuse', applied: true });
    // the live store holds nothing and no snapshot was given: today's refusal
    expect(await facade.shadowIdentity(page, undefined, undefined, {}, '#4', 'absent')).toStrictEqual({ pass: false });
  });
});
