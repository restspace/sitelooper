import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyFacts, observeFact, renderings, type Observation, type SiteFacts } from '../src/execution/facts.js';
import { classifyReportValue } from '../src/execution/report.js';
import { SiteFactStore } from '../src/skills/facts.js';
import {
  affixOfFrame,
  classifyShadow,
  controlKey,
  counterObservations,
  frameObservation,
  identityShadow,
  noteFormatShadow,
  observeOnPage,
  observeTypedValue,
  readBackShadow,
  reportFormatKey,
  safeEv,
  setFormatSession,
  shadowClassify,
  shadowReadBack,
  sweptObservations,
  takeFormatShadowRows,
  titleAffix,
  titleKey,
  titleObservation,
  typedFormats,
  typedObservations,
  useFormatStore,
} from '../src/skills/facts-format.js';
import { formatVars, isVarValue, setFormatVars } from '../src/skills/facts-format.js';
import type { SkillStep } from '../src/skills/store.js';

const ORIGIN = 'http://app.test';
const URL_ = `${ORIGIN}/opportunities/42/edit`;
const ROUTE = `${ORIGIN}/opportunities/*/edit`;

function withFormat(sf: SiteFacts, key: string, kind: string, tpl?: string, hard = true): SiteFacts {
  const o: Observation = { k: 'format', key, v: tpl === undefined ? { kind: kind as never } : { kind: kind as never, tpl }, hard, session: 's1' };
  observeFact(sf, o);
  return sf;
}

function fakePage(url: string, title = ''): Page {
  return { url: () => url, title: async () => title, isClosed: () => false } as unknown as Page;
}

describe('format observers: the pure halves', () => {
  it('(a) reads a typed number back in the page spelling', () => {
    expect(typedFormats('12500', '12,500.00')).toEqual(['thousands', 'decimals']);
    expect(typedFormats('12500', '12,500')).toEqual(['thousands']);
    expect(typedFormats('12500', '12500.00')).toEqual(['decimals']);
    expect(typedFormats('  Backlog ', 'Backlog')).toEqual(['trim']);
    expect(typedFormats('bench', 'BENCH')).toEqual(['upper']);
    expect(typedFormats('bench', 'bench')).toEqual([]);
    expect(typedFormats('bench', 'Bench')).toEqual([]); // not all capitals: says nothing
    expect(typedFormats('12500', '99,000')).toEqual([]); // another number
  });

  it('(a) keys by route|role|name, hard, and never for a marker', () => {
    const obs = typedObservations(URL_, 'textbox', 'Amount', '12500', '12,500.00');
    expect(obs.map((o) => [o.key, o.v, o.hard])).toEqual([
      [`${ROUTE}|textbox|Amount`, { kind: 'thousands' }, true],
      [`${ROUTE}|textbox|Amount`, { kind: 'decimals' }, true],
    ]);
    expect(typedObservations(URL_, 'textbox', 'Password', '{{env:PASS}}', 'x')).toEqual([]);
    expect(controlKey(URL_, 'textbox', ' Amount  due ')).toBe(`${ROUTE}|textbox|Amount due`);
  });

  it('(b) a one-line, one-mark frame is an affix; hard only when proven', () => {
    expect(affixOfFrame('#{{=}}')).toBe('#{{=}}');
    expect(affixOfFrame('{{=}} Bench Task')).toBe('{{=}} Bench Task');
    expect(affixOfFrame('Folder\n{{=}}')).toBeNull();
    expect(affixOfFrame('{{=}} Issue #{{…}}')).toBeNull();
    expect(affixOfFrame('{{=}}')).toBeNull();
    expect(frameObservation(URL_, 'task_ref', '#{{=}}', true)).toMatchObject({ key: `${ROUTE}|task_ref`, v: { kind: 'affix', tpl: '#{{=}}' }, hard: true });
    expect(frameObservation(URL_, 'task_ref', '#{{=}}', false)?.hard).toBe(false);
    expect(reportFormatKey(URL_, 'k')).toBe(`${ROUTE}|k`);
  });

  it('(c) sweep formats: twice / upper, hard, deduped per key', () => {
    const obs = sweptObservations(`${ORIGIN}/board/3`, [
      { kind: 'twice', role: 'heading', name: '' },
      { kind: 'twice', role: 'heading', name: '' },
      { kind: 'upper', role: 'cell', name: 'Status' },
      { kind: 'upper', role: '', name: 'x' },
    ]);
    expect(obs.map((o) => [o.key, o.v, o.hard])).toEqual([
      [`${ORIGIN}/board/*|heading|`, { kind: 'twice' }, true],
      [`${ORIGIN}/board/*|cell|Status`, { kind: 'upper' }, true],
    ]);
  });

  it('(d) counters leading a named control, soft', () => {
    const obs = counterObservations(`${ORIGIN}/odoo/sales`, ['- menu "6 3 YourCompany"', '- cell "3"', '- button "Save"', '- menu "2 YourCompany"']);
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ key: `${ORIGIN}/odoo/sales|menu|YourCompany`, v: { kind: 'counter' }, hard: false });
  });

  it('(e) the title as value plus an affix', () => {
    expect(titleAffix('S00023 - Odoo', 'S00023')).toBe('{{=}} - Odoo');
    expect(titleAffix('Odoo | S00023', 'S00023')).toBe('Odoo | {{=}}');
    expect(titleAffix('S00023', 'S00023')).toBeNull();
    expect(titleAffix('S000234 - Odoo', 'S00023')).toBeNull(); // not at a boundary
    expect(titleAffix('Order S00023 draft', 'S00023')).toBeNull(); // not an affix
    expect(titleObservation(URL_, 'S00023 - Odoo', 'S00023')).toMatchObject({ key: titleKey(URL_), v: { kind: 'affix', tpl: '{{=}} - Odoo' }, hard: true });
  });

  it('drops an ev line naming a run', () => {
    expect(safeEv('typed into textbox "Name"', 'sess')).toBe('typed into textbox "Name"');
    expect(safeEv('typed into textbox "fwod88-n1 Bench"', 'sess')).toBeUndefined();
    expect(safeEv('in session sess', 'sess')).toBeUndefined();
  });
});

describe('format observers: writing through the store', () => {
  let dir: string;
  let store: SiteFactStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-facts-format-'));
    store = new SiteFactStore(dir);
    useFormatStore(store);
  });

  afterEach(() => {
    useFormatStore(null);
    setFormatSession(null);
    takeFormatShadowRows();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes nothing without a session', () => {
    setFormatSession(null);
    expect(observeOnPage(URL_, [titleObservation(URL_, 'S00023 - Odoo', 'S00023')])).toBe(0);
    expect(fs.existsSync(store.path(ORIGIN))).toBe(false);
  });

  it('writes a hard format fact that renderings then use', () => {
    setFormatSession('rec-1');
    expect(observeOnPage(URL_, [frameObservation(URL_, 'task_ref', '#{{=}}', true)])).toBe(1);
    const sf = store.read(ORIGIN);
    expect(sf.facts).toHaveLength(1);
    expect(sf.facts[0]).toMatchObject({ k: 'format', key: `${ROUTE}|task_ref`, sessions: ['rec-1'], hard: true });
    expect(renderings(sf, `${ROUTE}|task_ref`, '4')).toEqual(['#4']);
  });

  it('(a) observeTypedValue reads the control and records the format', async () => {
    const locator = { count: async () => 1, evaluate: async () => '12,500.00' } as unknown as Locator;
    const n = await observeTypedValue(fakePage(URL_), 'rec-1', { role: 'textbox', name: 'Amount', locator }, '12500', store);
    expect(n).toBe(2);
    expect(renderings(store.read(ORIGIN), `${ROUTE}|textbox|Amount`, '7000')).toEqual(['7,000.00']);
  });

  it('(a) a password control is never read into a fact', async () => {
    const locator = { count: async () => 1, evaluate: async () => null } as unknown as Locator;
    expect(await observeTypedValue(fakePage(URL_), 'rec-1', { role: 'textbox', name: 'Password', locator }, 'secret', store)).toBe(0);
    const ambiguous = { count: async () => 2, evaluate: async () => 'X' } as unknown as Locator;
    expect(await observeTypedValue(fakePage(URL_), 'rec-1', { role: 'textbox', name: 'Name', locator: ambiguous }, 'x', store)).toBe(0);
  });

  it('facts.readback: a known rendering would pin what the exact match missed', async () => {
    setFormatSession('rec-1');
    observeOnPage(URL_, [frameObservation(URL_, 'task_ref', '#{{=}}', true)]);
    const counts: Record<string, number> = { '4': 0, '#4': 1 };
    await shadowReadBack(fakePage(URL_), '4', 'task_ref', false, async (t) => counts[t] ?? 0);
    const rows = takeFormatShadowRows() as unknown as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      {
        rule: 'facts.readback',
        step: `read-back ${ROUTE}|task_ref`,
        fact: 'pin',
        heuristic: 'refused',
        agree: false,
        evidence: [JSON.stringify({ k: 'format', key: `${ROUTE}|task_ref`, v: { kind: 'affix', tpl: '#{{=}}' }, reliable: true })],
      },
    ]);
    // the exact match did not fail: no row
    await shadowReadBack(fakePage(URL_), '4', 'task_ref', true, async () => 1);
    // no fact under the key: no row
    await shadowReadBack(fakePage(URL_), '4', 'other', false, async () => 0);
    expect(takeFormatShadowRows()).toEqual([]);
  });

  it('facts.classify through the live wrapper', () => {
    setFormatSession('rec-1');
    const key = `${ROUTE}|textbox|Amount`;
    store.observe(ORIGIN, [
      { k: 'format', key, v: { kind: 'thousands' }, hard: true, session: 'rec-1' },
      { k: 'format', key, v: { kind: 'decimals' }, hard: true, session: 'rec-1' },
    ]);
    const steps = [{ tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Amount' }] } }] as unknown as SkillStep[];
    const params = { v1: '12500' };
    const evidence = { typed: ['v1'], live: ['Amount 12,500.00'] };
    const verdict = classifyReportValue('{{v1}}', params, null, evidence);
    expect(verdict.class).toBe('echo');
    shadowClassify({ origin: ORIGIN, steps }, undefined, '{{v1}}', params, null, evidence, verdict);
    const rows = takeFormatShadowRows() as unknown as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rule: 'facts.classify', fact: 'committed', heuristic: 'echo', agree: false, evidence: [expect.stringContaining(JSON.stringify({ k: 'format', key }).slice(0, -1))] });
  });
});

describe('format shadows: the pure decisions', () => {
  afterEach(() => {
    takeFormatShadowRows();
  });

  it('readBackShadow: none when only advisory facts exist', async () => {
    const key = `${ROUTE}|ref`;
    const sf = withFormat(emptyFacts(ORIGIN), key, 'affix', '#{{=}}', false);
    const row = await readBackShadow(sf, key, '4', false, async () => true);
    expect(row).toMatchObject({ fact: 'none', heuristic: 'refused', agree: true, evidence: { reliable: false } });
    expect(await readBackShadow(emptyFacts(ORIGIN), key, '4', false, async () => true)).toBeNull();
  });

  it('classifyShadow: stays echo when no rendering shows', () => {
    const key = `${ROUTE}|textbox|Amount`;
    const sf = withFormat(emptyFacts(ORIGIN), key, 'thousands');
    const steps = [{ tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Amount' }] } }] as unknown as SkillStep[];
    const evidence = { typed: ['v1'], live: ['nothing here'] };
    const verdict = classifyReportValue('{{v1}}', { v1: '12500' }, null, evidence);
    expect(classifyShadow(sf, steps, '{{v1}}', { v1: '12500' }, null, evidence, verdict)).toMatchObject({ fact: 'echo', agree: true });
    // not an echo: no row
    expect(classifyShadow(sf, steps, '{{v1}}', { v1: '12500' }, null, evidence, { value: 'x', class: 'committed', slots: [] })).toBeNull();
  });

  it('identityShadow: a rendering on the page, or the title affix', () => {
    const sf = withFormat(emptyFacts(ORIGIN), `${ROUTE}|ref`, 'affix', '#{{=}}');
    expect(identityShadow(sf, URL_, '4', false, ['- heading "Task #4"'], '')).toMatchObject({ rule: 'facts.identity', fact: 'pass', heuristic: 'refuse', agree: false });
    expect(identityShadow(sf, URL_, '4', false, ['- heading "Task #5"'], '')).toMatchObject({ fact: 'refuse', agree: true });
    const titled = withFormat(emptyFacts(ORIGIN), titleKey(URL_), 'affix', '{{=}} - Odoo');
    expect(identityShadow(titled, URL_, 'S00023', true, [], 'S00023 - Odoo')).toMatchObject({ fact: 'pass', heuristic: 'pass', agree: true });
    expect(identityShadow(emptyFacts(ORIGIN), URL_, '4', false, [], '')).toBeNull();
  });

  it('the buffer hands each row out once', () => {
    noteFormatShadow({ rule: 'facts.readback', fact: 'none', heuristic: 'refused', agree: true, evidence: { k: 'format', key: 'k', v: null, reliable: false } });
    expect(takeFormatShadowRows()).toHaveLength(1);
    expect(takeFormatShadowRows()).toHaveLength(0);
  });
});

// --- stage 2, Piece K: the observer tightening ---------------------------------

describe('stage 2: the affix observer refuses what round 67 over-generalised', () => {
  afterEach(() => {
    setFormatVars([]);
    takeFormatShadowRows();
  });

  it('refuses a frame cut out of a number (odoo fwod93 `£ 2,{{=}}`)', () => {
    expect(affixOfFrame('£ 2,{{=}}')).toBeNull();
    expect(frameObservation(URL_, 'subtotal', '£ 2,{{=}}', true)).toBeNull();
    expect(affixOfFrame('{{=}}.00 EUR')).toBeNull(); // separator then digit, right of the mark
    expect(affixOfFrame('Qty 2 {{=}}')).toBeNull(); // a digit past one space
    expect(affixOfFrame("CHF 1'{{=}}")).toBeNull();
    expect(affixOfFrame('{{=}}7 items')).toBeNull();
    // a separator NOT beside a digit is punctuation, not a number
    expect(affixOfFrame('Total: {{=}}')).toBe('Total: {{=}}');
    expect(affixOfFrame('{{=}}, Inc.')).toBe('{{=}}, Inc.');
  });

  it('refuses a frame whose remainder has no letter (punctuation says nothing)', () => {
    expect(affixOfFrame('({{=}})')).toBeNull();
    expect(affixOfFrame('"{{=}}"')).toBeNull();
    expect(affixOfFrame('{{=}} -')).toBeNull();
    expect(frameObservation(URL_, 'ref', '[{{=}}]', true)).toBeNull();
    // an identifier or unit sigil does speak
    expect(affixOfFrame('£{{=}}')).toBe('£{{=}}');
    expect(affixOfFrame('{{=}}%')).toBe('{{=}}%');
  });

  it('keeps the snipeit and gitea affixes', () => {
    expect(affixOfFrame('Asset {{=}}')).toBe('Asset {{=}}');
    expect(affixOfFrame('#{{=}}')).toBe('#{{=}}');
    expect(frameObservation(URL_, 'asset', 'Asset {{=}}', true)).toMatchObject({ v: { kind: 'affix', tpl: 'Asset {{=}}' } });
    expect(frameObservation(URL_, 'issue', '#{{=}}', true, '4', ['fwgt21-n1'])).toMatchObject({ v: { kind: 'affix', tpl: '#{{=}}' } });
  });

  it('(b) refuses a report value that IS a declared var (odoo fwod93 `{{=}} Bench Customer` for `ref`)', () => {
    expect(frameObservation(URL_, 'ref', '{{=}} Bench Customer', true, 'fwod93-n1', ['fwod93-n1'])).toBeNull();
    // the session's vars by default
    setFormatVars(['fwod93-n1', 3]);
    expect(isVarValue(' FWOD93-N1 ')).toBe(true);
    expect(formatVars()).toEqual(['fwod93-n1', '3']);
    expect(frameObservation(URL_, 'ref', '{{=}} Bench Customer', true, 'fwod93-n1')).toBeNull();
    // another value framed the same way is still observed
    expect(frameObservation(URL_, 'customer', '{{=}} Bench Customer', true, 'fwod93-n1 x')).toMatchObject({ v: { kind: 'affix', tpl: '{{=}} Bench Customer' } });
  });

  it('(a) and (e) never observe a declared var', () => {
    expect(typedObservations(URL_, 'textbox', 'Ref', ' fwod93-n1', 'fwod93-n1', ['fwod93-n1'])).toEqual([]);
    expect(typedObservations(URL_, 'textbox', 'Ref', ' fwod93-n1', 'fwod93-n1', [])).toHaveLength(1);
    expect(titleObservation(URL_, 'fwod93-n1 - Odoo', 'fwod93-n1', ['fwod93-n1'])).toBeNull();
    setFormatVars(['S00023']);
    expect(titleObservation(URL_, 'S00023 - Odoo', 'S00023')).toBeNull();
    setFormatSession(null); // a closed session forgets its vars
    expect(formatVars()).toEqual([]);
    expect(titleObservation(URL_, 'S00023 - Odoo', 'S00023')).toMatchObject({ v: { kind: 'affix', tpl: '{{=}} - Odoo' } });
  });
});

describe('stage 2: the read-back shadow row is stamped applied when the fact pinned', () => {
  let dir: string;
  let store: SiteFactStore;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-facts-format-k-'));
    store = new SiteFactStore(dir);
    useFormatStore(store);
    setFormatSession('rec-1');
  });
  afterEach(() => {
    useFormatStore(null);
    setFormatSession(null);
    takeFormatShadowRows();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applied under the key that decided, heuristic still today\'s refusal', async () => {
    const key = controlKey(URL_, 'cell', 'Ref');
    store.observe(ORIGIN, [{ k: 'format', key, v: { kind: 'affix', tpl: '#{{=}}' }, hard: true, session: 'rec-1' }]);
    const counts: Record<string, number> = { '4': 2, '#4': 1 };
    await shadowReadBack(fakePage(URL_), '4', undefined, false, async (t) => counts[t] ?? 0, { key });
    const rows = takeFormatShadowRows() as unknown as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rule: 'facts.readback', fact: 'pin', heuristic: 'refused', agree: false, applied: true });
    // not applied: no stamp
    await shadowReadBack(fakePage(URL_), '4', 'task_ref', false, async (t) => ({ '4': 0, '#4': 1 })[t] ?? 0);
    expect(takeFormatShadowRows()).toEqual([]); // no fact under the report key
  });
});
