/**
 * Round 55, group "landing" — snipeit fwsi7 (round 54, 7/7 x3 but FAIL 1/7
 * compiled). test/fixture/fwsi7-n1-script.jsonl is the recording as published
 * on results/fwsi7-hpt1qa.
 *
 * n1 saved the new asset (the list page, #35), ran an `eval` for the "Click
 * here to view" link's href (#36, result not recorded) and went
 * `goto /hardware/4` (#37). fwsi6 had clicked the link. Three defects followed:
 *  4. a goto was never a landing, so 4 was never banked or minted;
 *  5. buildFlow's `fresh` held 4 as SEEN from 02-create's end url, so 03-edit's
 *     real landing (its Update click, /hardware/4/edit) was refused too, and
 *     04-report's param stayed the literal "4";
 *  6. compile stored 02-create's segment s_5dcb48 as `goto /hardware/4`, which
 *     n2/n3 stopped on and n3's re-pin carried into the artifact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { buildFlow, staleInstructionIds } from '../src/skills/flow.js';
import { RunLedger, unseenGotoParts } from '../src/skills/ledger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(here, 'fixture', 'fwsi7-n1-script.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

/** 1-based script line numbers, as the published file and the SWEEPS notes cite them. */
const line = (entries: RecordedEntry[], n: number) => entries[n - 1];
const ORIGIN = 'http://127.0.0.1:8098';

describe('4. a goto to a record the run never showed is a landing (fwsi7 #37)', () => {
  it('finds 4 unseen at #37, and nothing unseen at the start goto or 03-edit\'s return (#56)', () => {
    const e = load();
    const at = (n: number) => unseenGotoParts(String((line(e, n) as RecordedStep).args.url), e.slice(0, n - 1));
    expect(at(37)).toEqual([{ label: 'p1', value: '4' }]);
    expect(at(1)).toEqual([]);
    expect(at(56)).toEqual([]);
  });

  it('never makes a route word a landing — position only', () => {
    expect(unseenGotoParts(`${ORIGIN}/admin/settings`, [])).toEqual([]);
    expect(unseenGotoParts(`${ORIGIN}/hardware?page=2&size=20`, [])).toEqual([]);
  });

  it('banks the goto-landed 4 as 02-create\'s record id', () => {
    const ledger = new RunLedger();
    ledger.addUrlIds(`${ORIGIN}/hardware/4`, 'i2', [{ label: 'p1', value: '4' }], { landedLabels: ['p1'] });
    expect(ledger.all().map((x) => [x.value, x.binding])).toEqual([['4', { from: 'url', step: 'i2', label: 'p1' }]]);
  });

  it('mints it at 02-create, and 04-report binds to it', () => {
    const e = load();
    const flow = buildFlow(e, {
      name: 'fwsi7',
      origin: ORIGIN,
      startUrl: `${ORIGIN}/`,
      vars: { runid: 'fwsi7-n1' },
      session: 'fwsi7-n1',
      bind: (id) => (id === 's_d5098a' ? { v3: 'BA-00004', v4: '4' } : null),
      // What the ledger banks with the goto a landing: url:i2:p1.
      origins: (id) => (id === 's_d5098a' ? { v4: 'url:i2:p1' } : null),
    })!;
    const create = flow.steps.find((s) => s.id === '02-create')!;
    expect(create.recorded['url.p1']).toBe('4');
    expect(flow.steps.find((s) => s.id === '04-report')!.params?.v4).toBe('{{02-create.url.p1}}');
  });

  it('says a later instruction quoting /hardware/4 names the recording\'s record', () => {
    // Only 02-create reached the asset (by the goto); 03-edit's click, which
    // also lands /hardware/4/edit, is cut away.
    const e: RecordedEntry[] = [
      ...load().slice(0, 44),
      { k: 'instruction', text: 'Open the asset at /hardware/4 and report its location.', url: `${ORIGIN}/hardware/4` },
      { k: 'report', status: 'success', summary: 'ok', values: { location: 'Bench Office' } },
    ];
    const flow = buildFlow(e, { name: 'fwsi7', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: { runid: 'fwsi7-n1' }, session: 'fwsi7-n1' })!;
    // buildFlow threads the path to 02-create's landed mint…
    expect(flow.steps[2].instruction).toContain('/hardware/{{02-create.url.p1}}');
    // …and where a quote survives (an edited flow), the lint names it.
    flow.steps[2] = { ...flow.steps[2], instruction: 'Open the asset at /hardware/4 and report its location.' };
    expect(staleInstructionIds(e, flow).join('\n')).toContain('/hardware/4');
  });
});

describe('5. mint at the first landing, not the first sighting (fwsi7 03-edit)', () => {
  it('mints 03-edit\'s landed 4 when 02-create only SAW it', () => {
    const e = load();
    // Make 02-create's goto a navigation to a record the page had shown (so no
    // landing): the save's diff lists a link to it.
    const save = line(e, 35) as RecordedStep;
    save.diff = { ...save.diff!, added: [...save.diff!.added, '- link "/hardware/4"'] };
    const flow = buildFlow(e, {
      name: 'fwsi7',
      origin: ORIGIN,
      startUrl: `${ORIGIN}/`,
      vars: { runid: 'fwsi7-n1' },
      session: 'fwsi7-n1',
      bind: (id) => (id === 's_d5098a' ? { v3: 'BA-00004', v4: '4' } : null),
      // The binding the published store carries (s_d5098a v4).
      origins: (id) => (id === 's_d5098a' ? { v4: 'url:i3:p1' } : null),
    })!;
    expect(flow.steps.find((s) => s.id === '02-create')!.recorded['url.p1']).toBeUndefined();
    expect(flow.steps.find((s) => s.id === '03-edit')!.recorded['url.p1']).toBe('4');
    expect(flow.steps.find((s) => s.id === '04-report')!.params?.v4).toBe('{{03-edit.url.p1}}');
  });
});

describe('6. a sourceless goto is never stored as a literal (fwsi7 s_5dcb48)', () => {
  const compile02 = (mutate?: (goto: RecordedStep) => void) => {
    const e = load();
    if (mutate) mutate(line(e, 37) as RecordedStep);
    const own = e.slice(20, 43);
    const report = line(e, 44) as Extract<RecordedEntry, { k: 'report' }>;
    return compileSkills({
      entries: own,
      instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
      session: 'fwsi7-n1',
      knownValues: { 'var:runid': 'fwsi7-n1' },
      before: e.slice(0, 20),
    });
  };
  const gotos = (skills: ReturnType<typeof compileSkills>) => skills.flatMap((s) => s.steps).filter((s) => s.tool === 'goto').map((s) => s.args.url);

  it('ends the procedure before a goto nothing supplies', () => {
    const skills = compile02();
    expect(gotos(skills)).toEqual([]);
    expect(JSON.stringify(skills.map((s) => s.steps))).not.toContain('/hardware/4');
    expect(skills.flatMap((s) => s.provenance.transforms ?? []).some((t) => t.name === 'sourcelessGoto')).toBe(true);
    // Its last step is the save.
    const last = skills[skills.length - 1].steps.at(-1)!;
    expect([last.tool, last.args.target]).toEqual(['click', '@e127']);
  });

  it('replays it as a click on the link the recorder saw carrying the href', () => {
    const skills = compile02((goto) => {
      goto.linkedFrom = {
        expr: "page.getByRole('link', { name: 'Click here to view' })",
        verified: true,
        raw: '',
        chain: [
          { kind: 'role', role: 'link', name: 'Click here to view' },
          { kind: 'css', selector: 'a[href="http://127.0.0.1:8098/hardware/4"]' },
          { kind: 'css', selector: '.alert-success a' },
        ],
      };
    });
    expect(gotos(skills)).toEqual([]);
    const click = skills.flatMap((s) => s.steps).find((s) => s.args.target === 'role=link[name="Click here to view"]')!;
    expect(click.tool).toBe('click');
    expect(JSON.stringify(click.locators)).not.toContain('/hardware/4');
    expect(click.locators.target.map((c) => c.kind)).toEqual(['role', 'css']);
  });

  it('leaves a goto to a record the run already showed alone (03-edit #56)', () => {
    const e = load();
    const own = e.slice(44, 62);
    const report = line(e, 63) as Extract<RecordedEntry, { k: 'report' }>;
    const skills = compileSkills({
      entries: own,
      instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
      session: 'fwsi7-n1',
      knownValues: { 'var:runid': 'fwsi7-n1', 'url:i2:p1': '4' },
      before: e.slice(0, 44),
    });
    expect(skills.flatMap((s) => s.provenance.transforms ?? []).some((t) => t.name === 'sourcelessGoto')).toBe(false);
    expect(gotos(skills).length).toBe(1);
  });
});
