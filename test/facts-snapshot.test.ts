/**
 * Site facts, stage 0, piece C: the compile snapshot. A compiled flow carries
 * one SiteFacts per origin its segments start on (SpecFlow.facts), emitted as
 * the FACTS constant beside FLOW, read through `siteFactsAt`, validated by lift
 * and refreshed from the live store by repair/rerecord (carryFactSnapshot).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitFlowFile } from '../src/spec/emit.js';
import { carryFactSnapshot, flowToSpec, type SpecFlow } from '../src/spec/ir.js';
import { liftFlowFile } from '../src/spec/lift.js';
import { SiteFactStore } from '../src/skills/facts.js';
import { SkillStore, type Skill } from '../src/skills/store.js';
import type { Flow } from '../src/skills/flow.js';
import type { Observation } from '../src/execution/facts.js';

const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'fwsi9-skills');
const ORIGIN = 'http://127.0.0.1:8098';
const SKILL = 's_d005fc';
const load = (id: string): Skill => JSON.parse(fs.readFileSync(path.join(FIXTURE, `${id}.json`), 'utf8'));

const flow: Flow = {
  name: 'facts',
  origin: ORIGIN,
  startUrl: `${ORIGIN}/hardware/4#history`,
  vars: ['asset_url'],
  steps: [{ id: '01-report', instruction: 'report the asset history', skill: SKILL, params: { v1: '{{asset_url}}', v2: 'checkout' }, outputs: [], recorded: {} }],
  provenance: { session: 'test', created: new Date(0).toISOString() },
};

const OBSERVATIONS: Observation[] = [
  { k: 'route.fragment', key: '', v: 'anchor', hard: true, session: 's1', at: new Date(0).toISOString() },
  { k: 'route.query', key: `${ORIGIN}/hardware/*?sort`, v: 'state', hard: false, session: 's1', at: new Date(0).toISOString() },
];

let tmp: string;
const storeAt = (name: string, withFacts: boolean): SkillStore => {
  const dir = path.join(tmp, name);
  const store = new SkillStore(dir);
  store.put(load(SKILL));
  if (withFacts) new SiteFactStore(dir).observe(ORIGIN, OBSERVATIONS);
  return store;
};
/** flowToSpec with `store` as THE live store: `$SITELOOPER_SKILLS_DIR` names its directory. */
const compileLive = (store: SkillStore): SpecFlow => {
  const was = process.env.SITELOOPER_SKILLS_DIR;
  process.env.SITELOOPER_SKILLS_DIR = store.dir;
  try {
    return flowToSpec(flow, store).spec;
  } finally {
    if (was === undefined) delete process.env.SITELOOPER_SKILLS_DIR;
    else process.env.SITELOOPER_SKILLS_DIR = was;
  }
};
/** flowToSpec with an explicit facts store beside the procedures. */
const compileWith = (store: SkillStore): SpecFlow => flowToSpec(flow, store, { facts: new SiteFactStore(store.dir) }).spec;

beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-facts-snap-')); });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('compile snapshots the site facts of every origin the flow runs on', () => {
  it("carries the origin's facts from the live store's site-facts.json", () => {
    const spec = compileLive(storeAt('with', true));
    expect(spec.facts).toHaveLength(1);
    expect(spec.facts![0].origin).toBe(ORIGIN);
    expect(spec.facts![0].facts).toHaveLength(OBSERVATIONS.length);
  });

  it('carries an empty snapshot when the origin has no facts file', () => {
    const spec = compileLive(storeAt('without', false));
    expect(spec.facts).toEqual([{ version: 1, origin: ORIGIN, facts: [] }]);
  });

  it('takes no snapshot from a scratch store (repair/rerecord staging) unless a facts store is passed', () => {
    expect(flowToSpec(flow, storeAt('scratch', true)).spec.facts).toBeUndefined();
    expect(compileWith(storeAt('scratch-explicit', true)).facts![0].facts).toHaveLength(OBSERVATIONS.length);
  });

  it('emits FACTS and siteFactsAt, and lift round-trips the snapshot', () => {
    const spec = compileWith(storeAt('emit', true));
    const source = emitFlowFile(spec, { tier: 'plain' }).source;
    expect(source).toContain(`const FACTS: SiteFacts[] = ${JSON.stringify(spec.facts)};`);
    expect(source).toContain('const siteFactsAt = (url: string): SiteFacts =>');
    expect(source).toContain('void siteFactsAt;');
    expect(source).toMatch(/function emptyFacts\(/);
    const lifted = liftFlowFile(source).spec;
    expect(lifted.facts).toEqual(spec.facts);
  });

  it('emits an empty FACTS for a spec that carries none', () => {
    const spec = flowToSpec(flow, storeAt('none', false)).spec;
    expect(emitFlowFile(spec, { tier: 'plain' }).source).toContain('const FACTS: SiteFacts[] = [];');
  });

  it('lift refuses a malformed FLOW.facts, naming the field', () => {
    const spec = compileWith(storeAt('bad', true));
    const liftWith = (facts: unknown) => () => liftFlowFile(emitFlowFile({ ...spec, facts } as unknown as SpecFlow, { tier: 'plain' }).source);
    expect(liftWith({ version: 1 })).toThrow(/FLOW\.facts must be an array/);
    expect(liftWith([{ version: 2, origin: ORIGIN, facts: [] }])).toThrow(/FLOW\.facts\[0\]\.version must be 1/);
    expect(liftWith([{ version: 1, facts: [] }])).toThrow(/FLOW\.facts\[0\]: missing string "origin"/);
    expect(liftWith([{ version: 1, origin: ORIGIN, facts: {} }])).toThrow(/"facts" must be an array/);
    expect(liftWith([{ version: 1, origin: ORIGIN, facts: [{ key: '', v: 'anchor' }] }])).toThrow(/facts\[0\]: missing string "k"/);
  });
});

describe('carryFactSnapshot refreshes the facts from the live store', () => {
  it('leaves a file that predates facts alone when the live store has none', () => {
    const store = storeAt('carry-empty', false);
    const { spec } = flowToSpec(flow, store);
    expect(carryFactSnapshot(undefined, spec, new SiteFactStore(store.dir))).toEqual({ changed: 0 });
    expect(spec.facts).toBeUndefined();
  });

  it('adopts the live facts with a count, and keeps an identical prior verbatim', () => {
    const live = new SiteFactStore(storeAt('carry-live', true).dir);
    const { spec } = flowToSpec(flow, storeAt('carry-staged', false));
    expect(carryFactSnapshot(undefined, spec, live)).toEqual({ changed: 1 });
    expect(spec.facts![0].facts).toHaveLength(OBSERVATIONS.length);
    const refreshed = spec.facts;
    expect(carryFactSnapshot(refreshed, spec, live)).toEqual({ changed: 0 });
    expect(spec.facts![0]).toBe(refreshed![0]);
  });

  it('counts a prior snapshot whose facts the live store no longer holds', () => {
    const prior = compileWith(storeAt('carry-prior', true)).facts;
    const { spec } = flowToSpec(flow, storeAt('carry-gone', false));
    expect(carryFactSnapshot(prior, spec, new SiteFactStore(path.join(tmp, 'carry-gone')))).toEqual({ changed: 1 });
    expect(spec.facts).toEqual([{ version: 1, origin: ORIGIN, facts: [] }]);
  });
});

describe('the emitted flow with facts', () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.resolve('test/.facts-snapshot-')); });
  afterAll(() => {
    expect(path.basename(dir)).toMatch(/^\.facts-snapshot-/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('typechecks', () => {
    const spec = compileWith(storeAt('typecheck', true));
    const file = path.join(dir, 'facts.flow.ts');
    fs.writeFileSync(file, emitFlowFile(spec, { tier: 'plain' }).source);
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, skipLibCheck: true,
    });
    expect(ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
  }, 60_000);
});
