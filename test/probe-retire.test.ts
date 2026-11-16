/**
 * A persistence probe line that a LATER step of the same run took off the
 * record's page, or rewrote, is retired; a line nothing later touched is still
 * required (emit.ts watchProbes, runProbes). RepairDesk fwrd97-frb: 03-add's
 * part row was probed, 05-edit changed its cost and 07-remove deleted it, and
 * the probe failed a run the app verifier scored 6/6.
 *
 *   npx vitest run test/probe-retire.test.ts
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow, SpecSegment } from '../src/spec/ir.js';
import type { SkillStep } from '../src/skills/store.js';
import { lineShows } from '../src/execution/snapshot.js';
import { urlMatches } from '../src/execution/url.js';

const ORIGIN = 'http://127.0.0.1:9';
const RECORD = `${ORIGIN}/tickets/{{d1}}`;

const fill = (selector: string, value: string): SkillStep => ({ tool: 'fill', args: { target: '@e1', value }, locators: { target: [{ kind: 'id', selector }] } });
const click = (selector: string, expect?: SkillStep['expect']): SkillStep => ({ tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'id', selector }] }, ...(expect ? { expect } : {}) });

function seg(id: string, steps: SkillStep[]): SpecSegment {
  return { id, template: 'do it with {{v1}}', params: { v1: { example: 'Part A', usedIn: [1] } }, preconditions: { urlPattern: RECORD }, steps };
}

/** 01-add saves a part on a ticket's page (a probe); 02-edit then changes something on the same page. */
function flowOf(edit: SkillStep[], o: { probe?: boolean } = {}): SpecFlow {
  const save = click('#save', { urlPattern: RECORD, addedContains: o.probe === false ? [] : ['- cell "{{v1}}"'], lineDialect: 2 });
  return {
    version: 1,
    name: 'probe-retire',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/tickets/t1`,
    vars: ['name'],
    steps: [
      { id: '01-add', instruction: 'Add part {{name}}', params: { v1: '{{name}}' }, outputs: [], segments: [seg('s_add', [fill('#name', '{{v1}}'), save])] },
      { id: '02-edit', instruction: 'Edit part {{name}}', params: { v1: '{{name}}' }, outputs: [], segments: [seg('s_edit', edit)] },
    ],
  };
}

const editSave = click('#save-edit', { urlPattern: RECORD, addedContains: ['- cell "$150.00"'], lineDialect: 2 });

/** One helper's source, out of the emitted file. */
function helper(source: string, name: string): string {
  const m = new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n\\}`).exec(source);
  if (!m) throw new Error(`${name} not emitted`);
  return ts.transpileModule(m[0], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

describe('the emitted watch', () => {
  it('a step after a probing step hands its page-change captures to watchProbes; the probing step does not', () => {
    const { source } = emitFlowFile(flowOf([editSave]), { tier: 'plain' });
    expect(source).toContain('function watchProbes(');
    const body = source.slice(source.indexOf('export const steps = {'));
    const edit = body.slice(body.indexOf("'02-edit'"));
    expect(edit).toMatch(/watchProbes\(run, '02-edit s_edit\/1', urlBefore\d+, page\.url\(\), linesBefore\d+, linesAfter\d+, 2\);/);
    const add = body.slice(body.indexOf("'01-add'"), body.indexOf("'02-edit'"));
    expect(add).toContain('noteProbe(');
    expect(add).not.toContain('watchProbes(');
  });

  it('a flow with no probe carries no watch', () => {
    const { source } = emitFlowFile(flowOf([editSave], { probe: false }), { tier: 'plain' });
    expect(source).not.toContain('noteProbe(');
    expect(source).not.toContain('watchProbes(');
  });
});

type Probe = { step: string; url: string; pattern: string; params: Record<string, string>; lines: string[]; dialect: 1 | 2; values: string[]; retired?: Record<string, string> };

describe('watchProbes and runProbes, executed', () => {
  const { source } = emitFlowFile(flowOf([editSave]), { tier: 'plain' });
  const logged: string[] = [];
  const consoleStub = { log: (line: string) => logged.push(line) };
  const watch = new Function('urlMatches', 'lineShows', 'console', `${helper(source, 'watchProbes')}\nreturn watchProbes;`)(urlMatches, lineShows, consoleStub) as (
    run: { probes: Probe[] },
    where: string,
    urlBefore: string,
    urlAfter: string,
    before: string[] | null,
    after: string[] | null,
    dialect: 1 | 2,
  ) => void;

  /** runProbes over a reload that shows `reloaded`; returns its misses and how many reloads it took. */
  async function probe(run: { probes: Probe[] }, reloaded: string[]): Promise<{ misses: string[]; reloads: number }> {
    let reloads = 0;
    let at = '';
    const page = {
      context: () => ({
        newPage: async () => ({
          goto: async (url: string) => {
            reloads++;
            at = url;
          },
          url: () => at,
          waitForTimeout: async () => {},
          close: async () => {},
        }),
      }),
    };
    const js = helper(source, 'runProbes').replace(/PROBE_WAIT_MS/g, '0');
    const run$ = new Function('urlMatches', 'lineShows', 'console', 'process', 'GOTO_TIMEOUT_MS', 'waitForContent', 'captureLines', 'logWarning', `${js}\nreturn runProbes;`)(
      urlMatches,
      lineShows,
      consoleStub,
      { env: {} },
      1000,
      async () => {},
      async () => ({ lines: reloaded, complete: true }),
      (w: string) => logged.push(`warn ${w}`),
    ) as (page: unknown, run: { probes: Probe[] }) => Promise<string[]>;
    const misses = await run$(page, run);
    return { misses, reloads };
  }

  const URL = `${ORIGIN}/tickets/t1`;
  const probeOf = (lines: string[]): Probe => ({ step: '01-add', url: URL, pattern: RECORD, params: { d1: 't1' }, lines, dialect: 2, values: ['Part A'] });

  it('a line a later step removed is retired, and the run passes', async () => {
    const run = { probes: [probeOf(['- row "Part A $100{{*}} Edit Delete"', '- cell "Part A"'])] };
    watch(run, '07-remove s_rm/3', URL, URL, ['- heading "T1"', '- row "Part A $100.00 Edit Delete"', '- cell "Part A"'], ['- heading "T1"', '- row "No parts"'], 2);
    expect(run.probes[0].retired).toEqual({ '- row "Part A $100{{*}} Edit Delete"': '07-remove s_rm/3', '- cell "Part A"': '07-remove s_rm/3' });
    expect(logged.some((l) => l.startsWith('[sitelooper probe] 01-add: retired - cell "Part A" — 07-remove s_rm/3'))).toBe(true);
    const { misses, reloads } = await probe(run, ['- heading "T1"', '- row "No parts"']);
    expect(misses).toEqual([]);
    expect(reloads).toBe(0);
  });

  it('a line a later step rewrote is retired', async () => {
    const run = { probes: [probeOf(['- cell "$100{{*}}"'])] };
    watch(run, '05-edit s_ed/3', URL, URL, ['- cell "Part A"', '- cell "$100.00"'], ['- cell "Part A"', '- cell "$150.00"'], 2);
    expect(run.probes[0].retired).toEqual({ '- cell "$100{{*}}"': '05-edit s_ed/3' });
    expect((await probe(run, ['- cell "Part A"', '- cell "$150.00"'])).misses).toEqual([]);
  });

  it('an untouched line missing after reload still fails, beside a retired one', async () => {
    const run = { probes: [probeOf(['- heading "T1"', '- cell "$100{{*}}"'])] };
    watch(run, '05-edit s_ed/3', URL, URL, ['- heading "T1"', '- cell "$100.00"'], ['- heading "T1"', '- cell "$150.00"'], 2);
    const { misses, reloads } = await probe(run, ['- cell "$150.00"']);
    expect(reloads).toBe(1);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain('(missing - heading "T1")');
  });

  it('the fwrd96-dg shape: a heading probe that later steps on the same page never touch is still required', async () => {
    const run = { probes: [probeOf(['- heading "T1"'])] };
    // Opening a dialog, filling it, saving a part: the heading shows throughout.
    watch(run, '03-add s_pa/1', URL, URL, ['- heading "T1"'], ['- heading "T1"', '- dialog "Add part"'], 2);
    watch(run, '03-add s_pa/5', URL, URL, ['- heading "T1"', '- dialog "Add part"'], ['- heading "T1"', '- cell "Part A"'], 2);
    expect(run.probes[0].retired ?? {}).toEqual({});
    expect((await probe(run, ['- heading "T1"'])).misses).toEqual([]);
    expect((await probe(run, ['- heading "Something else"'])).misses).toHaveLength(1);
  });

  it('a line a dialog hid for one step and the next showed again is required again', async () => {
    const run = { probes: [probeOf(['- heading "T1"'])] };
    watch(run, '03-add s_pa/1', URL, URL, ['- heading "T1"'], ['- dialog "Add part"'], 2);
    expect(run.probes[0].retired).toEqual({ '- heading "T1"': '03-add s_pa/1' });
    watch(run, '03-add s_pa/5', URL, URL, ['- dialog "Add part"'], ['- heading "T1"'], 2);
    expect(run.probes[0].retired).toEqual({});
    expect((await probe(run, ['- heading "Other"'])).misses).toHaveLength(1);
  });

  it("judges nothing off the probe's record page or in another dialect", () => {
    const run = { probes: [probeOf(['- cell "Part A"'])] };
    // Navigated to the list: the record's lines are not on it, and that is no change to the record.
    watch(run, '07-remove s_rm/7', URL, `${ORIGIN}/tickets`, ['- cell "Part A"'], ['- heading "Tickets"'], 2);
    // Another ticket's page.
    watch(run, '08-other s_o/1', `${ORIGIN}/tickets/t2`, `${ORIGIN}/tickets/t2`, ['- cell "Part A"'], [], 2);
    // The probe's page, but a dialect-1 capture.
    watch(run, '08-other s_o/2', URL, URL, ['- cell "Part A"'], [], 1);
    expect(run.probes[0].retired ?? {}).toEqual({});
  });
});
