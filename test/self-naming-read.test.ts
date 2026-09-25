import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import { dropSelfNamingCandidates } from '../src/skills/compile.js';
import { selfNamingReadDrops, type Flow } from '../src/skills/flow.js';
import type { Skill } from '../src/skills/store.js';

/**
 * odoo fwod88 (round 63), 03-create. n1 line 62 read the quotation's title
 * by the title itself — `heading "S00021"` — ahead of a path to the h1 and a
 * point on it. The export kept that rung (the round-59 backstop rescues a
 * named candidate that shape alone condemned), every replay missed it, n2 read
 * S00022 through the path, and after n2 dropDeadReadLocators dropped the rung
 * and, with only positional ones left, EMPTIED the read: n3 published nothing,
 * and 04-open to 09-report all fell to the model on
 * `{{03-create.quotation_reference}}`. The fixture is the n1 export as built
 * (flow 03-create/04-open, and 03-create's chain before any strip).
 */
const fixture = (): { flow: Flow; chain: Skill[] } =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture', 'fwod88-03-create-export.json'), 'utf8')) as { flow: Flow; chain: Skill[] };
const readOf = (chain: Skill[]) => chain.flatMap((s) => s.steps).find((s) => s.label === 'quotation_reference')!;

describe('dropSelfNamingCandidates: a read located by the value it read', () => {
  const heading: LocatorCandidate = { kind: 'role', role: 'heading', name: 'S00021' };
  const path_: LocatorCandidate = { kind: 'css', selector: 'div:nth-of-type(2) > div > h1' };
  const point = (role: string | null, tag: string): LocatorCandidate => ({ kind: 'point', x: 490, y: 206, w: 898, h: 55, role, tag, vw: 1280, vh: 900 }) as LocatorCandidate;

  it('drops the self-naming rung when a point of the same role is left (fwod88 line 62)', () => {
    expect(dropSelfNamingCandidates([heading, path_, point('heading', 'h1')], 'S00021')).toEqual([path_, point('heading', 'h1')]);
  });

  it('keeps it when a handle is left, dropping only the self-naming rung', () => {
    const handle: LocatorCandidate = { kind: 'testid', attr: 'data-testid', value: 'order-name' };
    expect(dropSelfNamingCandidates([heading, handle], 'S00021')).toEqual([handle]);
  });

  it('list-row control: a position-only rest with no point of that role is untouched (fwrd16)', () => {
    const cell: LocatorCandidate = { kind: 'text', text: 'RD-1015' };
    const row: LocatorCandidate = { kind: 'css', selector: '#ticket-rows > tr:nth-of-type(1) > td' };
    const chain = [cell, row, point('cell', 'td')];
    expect(dropSelfNamingCandidates(chain, 'RD-1015')).toBe(chain);
    const roleCell: LocatorCandidate = { kind: 'role', role: 'cell', name: 'RD-1015' };
    expect(dropSelfNamingCandidates([roleCell, row], 'RD-1015')).toEqual([roleCell, row]);
  });

  it('never empties a chain, and leaves a chain that names something else alone', () => {
    expect(dropSelfNamingCandidates([heading], 'S00021')).toEqual([heading]);
    expect(dropSelfNamingCandidates([heading, path_], 'S00022')).toEqual([heading, path_]);
  });
});

describe('selfNamingReadDrops at export (fwod88 03-create)', () => {
  it('drops heading "S00021" from the read 04-open references', () => {
    const { flow, chain } = fixture();
    expect(readOf(chain).locators.target?.[0]).toMatchObject({ kind: 'role', role: 'heading', name: 'S00021' });
    const touched = selfNamingReadDrops(flow, (id) => (chain.some((s) => s.id === id) ? chain : null), () => false);
    expect(touched.map((t) => t.skill.id)).toEqual([chain.find((s) => s.steps.includes(readOf(chain)))!.id]);
    expect(readOf(chain).locators.target?.map((c) => c.kind)).toEqual(['css', 'point']);
  });

  it('constant-name control: a value the task holds constant keeps its rung', () => {
    const { flow, chain } = fixture();
    selfNamingReadDrops(flow, (id) => (chain.some((s) => s.id === id) ? chain : null), (v) => v === 'S00021');
    expect(readOf(chain).locators.target?.[0]).toMatchObject({ kind: 'role', name: 'S00021' });
  });

  it('an output no later step references is left alone', () => {
    const { flow, chain } = fixture();
    const unreferenced = { ...flow, steps: flow.steps.map((s) => (s.id === '04-open' ? { ...s, instruction: 'nothing here', params: {} } : s)) };
    expect(selfNamingReadDrops(unreferenced, (id) => (chain.some((s) => s.id === id) ? chain : null), () => false)).toEqual([]);
    expect(readOf(chain).locators.target?.[0]).toMatchObject({ kind: 'role', name: 'S00021' });
  });
});
