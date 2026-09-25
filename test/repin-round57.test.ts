/**
 * Round 57, Snipe-IT fwsi9: two ways the re-pin machinery kept a flow on
 * procedures that could not run. Built from the published store
 * (test/fixture/fwsi9-skills, copied from results/fwsi9-frfk67).
 *
 * 1. s_24e7fd (01-open, chain s_bbbcab) stopped twice at step 3, a
 *    modifier_click recorded opening a popup — "none opened within 5000ms".
 *    Each stop was counted HARMLESS (the recovery finished the step), so it
 *    stayed provisional with harmlessStops 2. But every later step's
 *    procedure was recorded on that popup (page 1), and every one refused.
 *    A stop at a step that carries a page effect is a strike.
 * 2. In n3, s_a90093 (04-report, demoted) had a validated variant chain
 *    s_9df3b0 (head s_4e6f28) that replayed 14/14, and the pin never moved:
 *    pinEndsElsewhere read its end, …/hardware/:id#history, against 05-open's
 *    pin s_72aa4e starting on …/hardware/:id — a tab anchor on the same page —
 *    and 05-open was re-pinned later that run to s_d005fc anyway.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pageEffectDemoted, pinEndsElsewhere, pinStatus } from '../src/skills/learn.js';
import { SkillStore, type Skill } from '../src/skills/store.js';
import { flowToSpec } from '../src/spec/ir.js';

const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture', 'fwsi9-skills');
const load = (id: string): Skill => JSON.parse(fs.readFileSync(path.join(FIXTURE, `${id}.json`), 'utf8'));
const ALL = fs.readdirSync(FIXTURE).map((f) => load(f.replace(/\.json$/, '')));

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-r57-'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const storeOf = (name: string, skills: Skill[]): SkillStore => {
  const store = new SkillStore(path.join(tmp, name));
  for (const s of skills) store.put(structuredClone(s));
  return store;
};

describe('1. a stop at a step that carries a page effect is a strike (fwsi9 s_24e7fd)', () => {
  it('two stops at the popup step demote the skill, although the step recovered both times', () => {
    const fresh = load('s_24e7fd');
    fresh.stats = { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 };
    fresh.status = 'provisional';
    const store = storeOf('strike', [fresh]);
    expect(fresh.steps[2].effect?.kind).toBe('popup');
    store.recordOutcome('s_24e7fd', { ok: false, failedAt: 3, instructionSucceeded: true, harmlessStop: true });
    expect(store.get('s_24e7fd')?.status).toBe('provisional');
    store.recordOutcome('s_24e7fd', { ok: false, failedAt: 3, instructionSucceeded: true, harmlessStop: true });
    expect(store.get('s_24e7fd')?.status).toBe('demoted');
    expect(store.get('s_24e7fd')?.stats.harmlessStops).toBeUndefined();
  });

  it('a stop at a step with no page effect stays harmless, as before', () => {
    const fresh = load('s_24e7fd');
    fresh.stats = { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 };
    const store = storeOf('harmless', [fresh]);
    store.recordOutcome('s_24e7fd', { ok: false, failedAt: 2, instructionSucceeded: true, harmlessStop: true });
    store.recordOutcome('s_24e7fd', { ok: false, failedAt: 2, instructionSucceeded: true, harmlessStop: true });
    expect(store.get('s_24e7fd')?.status).toBe('provisional');
    expect(store.get('s_24e7fd')?.stats.harmlessStops).toBe(2);
  });

  it('a store banked BEFORE the rule (the published s_24e7fd: failedAtStep {3: 2}, harmlessStops 2) reads as demoted', () => {
    const published = load('s_24e7fd');
    expect(published.status).toBe('provisional');
    expect(published.stats.failedAtStep).toEqual({ '3': 2 });
    expect(pageEffectDemoted(published)).toBe(true);
    const chain = ALL.filter((s) => s.seq?.chain === 's_bbbcab');
    expect(pinStatus(chain, chain.find((s) => s.seq?.index === 0))).toBe('demoted');
    // …and a skill whose stops were not at a page effect does not
    expect(pageEffectDemoted(load('s_72aa4e'))).toBe(false);
  });

  it("compile's demoted-pin check sees it", () => {
    const store = storeOf('compile', ALL);
    const flow = {
      name: 'fwsi9',
      origin: 'http://127.0.0.1:8098',
      startUrl: 'http://127.0.0.1:8098/',
      vars: [],
      provenance: { session: 's', created: 't' },
      steps: [{ id: '01-open', instruction: 'open', skill: 's_046de4', outputs: [], recorded: {} }],
    };
    const { diagnostics } = flowToSpec(flow as never, store);
    const demoted = diagnostics.filter((d) => d.code === 'demoted-pin');
    expect(demoted.map((d) => d.what).join(' ')).toContain('s_24e7fd');
    expect(demoted.every((d) => d.severity === 'error')).toBe(true);
  });
});

describe('2. pinEndsElsewhere (fwsi9 n3 04-report: s_9df3b0 replayed 14/14, the pin never moved)', () => {
  it('(b) a tab anchor is the same page on an app that does not route by fragment: #history vs no fragment', () => {
    const store = storeOf('anchor', ALL);
    // the published verdict: "ends on …/hardware/:id#history … s_72aa4e starts on …/hardware/:id"
    expect(pinEndsElsewhere(store, 's_4e6f28', 's_72aa4e')).toBeNull();
    // …and against the pin 05-open had by the end of the run
    expect(pinEndsElsewhere(store, 's_4e6f28', 's_d005fc')).toBeNull();
  });

  it('(b) a fragment is still a route on an app whose stored urls route by fragment (fwec4)', () => {
    const EC = 'http://127.0.0.1:8097';
    const mk = (id: string, urlPattern: string, steps: Skill['steps']): Skill => ({
      id, origin: EC, template: 't', params: {}, preconditions: { urlPattern }, steps,
      stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
      status: 'provisional', provenance: { session: 's', instruction: 't', created: 't' },
    });
    const read = { tool: 'read', args: { target: '(read-back)', what: 'text' }, locators: {} };
    const store = storeOf('espo', [
      mk('s_list', `${EC}/#Opportunity`, [read]),
      mk('s_view', `${EC}/#Opportunity/view/{{v3}}`, [read]),
    ]);
    expect(pinEndsElsewhere(store, 's_list', 's_view')).toMatch(/ends on .*#Opportunity .*starts on .*#Opportunity\/view/);
  });

  it('(c) the query string is view state, not a route, unless both sides carry a key with different literals (fwop15-cv2)', () => {
    const OP = 'http://127.0.0.1:8090';
    const mk = (id: string, urlPattern: string, endPattern: string): Skill => ({
      id, origin: OP, template: 't', params: {}, preconditions: { urlPattern },
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: {}, expect: { urlPattern: endPattern } }],
      stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
      status: 'provisional', provenance: { session: 's', instruction: 't', created: 't' },
    });
    const WP = `${OP}/projects/bench-project/work_packages`;
    const store = storeOf('openproject', [
      // 02-open's pin: starts on the work-package list with its view state in the query
      mk('s_next', `${WP}?query_props=:var`, `${WP}/create_new?query_props=:var&type=:id`),
      // the five refused 01-open recordings ended here…
      mk('s_bare', WP, WP),
      mk('s_json', WP, `${WP}?query_props={"c":["id","subject"],"f":[{"n":"status","o":"*","v":[]}],"pp":20,"pa":1}`),
      // …and one on the project overview, which IS another page
      mk('s_project', `${OP}/projects/bench-project`, `${OP}/projects/bench-project`),
      // an app that routes by query (kanboard): two literal controllers are two pages
      mk('s_board', `${OP}/`, `${OP}/?controller=BoardViewController&action=show&project_id=:id`),
      mk('s_task', `${OP}/?controller=TaskViewController&action=show&task_id=:id`, `${OP}/?controller=TaskViewController&action=show&task_id=:id`),
    ]);
    expect(pinEndsElsewhere(store, 's_bare', 's_next')).toBeNull();
    expect(pinEndsElsewhere(store, 's_json', 's_next')).toBeNull();
    expect(pinEndsElsewhere(store, 's_project', 's_next')).toMatch(/ends on \S+\/projects\/bench-project \(s_project\)/);
    expect(pinEndsElsewhere(store, 's_board', 's_task')).toMatch(/ends on .*BoardViewController/);
  });

  it('(a) a next pin that is itself demoted is not judged against', () => {
    // a candidate that really does end elsewhere — back on the asset list
    const listEnd: Skill = {
      ...load('s_72aa4e'),
      id: 's_listend',
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: {}, expect: { urlPattern: 'http://127.0.0.1:8098/hardware' } }],
    };
    const live = storeOf('live-next', [...ALL, listEnd]);
    expect(pinEndsElsewhere(live, 's_listend', 's_72aa4e')).toMatch(/ends on http:\/\/127\.0\.0\.1:8098\/hardware \(s_listend\)/);
    const next = { ...load('s_72aa4e'), status: 'demoted' as const };
    const store = storeOf('demoted-next', [...ALL.filter((s) => s.id !== 's_72aa4e'), next, listEnd]);
    expect(pinEndsElsewhere(store, 's_listend', 's_72aa4e')).toBeNull();
  });
});
