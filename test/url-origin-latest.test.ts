/**
 * Round 63 — snipeit fwsi14 (results/fwsi14-04yc6o). test/fixture/fwsi14-n1-script.jsonl
 * is the published n1 recording.
 *
 * 1. 02-create landed its new asset (#42's Enter: `/hardware/4`), clicked
 *    through to `/hardware/bulkcheckout` (#45), went back to `/hardware/4` and
 *    ended there (#60). The ledger banked both `4` and `bulkcheckout` under
 *    the same origin, `url:i2:p1`, and the run's values keyed by origin
 *    (server.ts knownValues) kept whichever was banked LAST — `bulkcheckout`.
 *    03-open's `goto /hardware/4/edit` then had no origin for its 4 and stayed
 *    the recording's asset: n2 and n3 opened n1's asset, and the artifact's
 *    03-open ran a segment a recovery on that wrong page had re-pinned. An
 *    origin's value is the one its url showed at its LATEST sighting — the one
 *    the flow publishes as `{{02-create.url.p1}}` (the step's end url).
 *
 * 2. #95 `goto /hardware/4/edit` landed on the edit form, whose status help
 *    reads "This asset can be checked out." (a live region). Compile keeps no
 *    expectation for a navigation, so both replays stopped: "step 1 raised an
 *    alert the recording never saw". The recording saw it at that landing; a
 *    navigation keeps the alert its landing raised as its expected alert.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { RunLedger } from '../src/skills/ledger.js';
import { urlParts } from '../src/execution/url.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwsi14-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;

/** The instructions, each with its entries through its report. */
function instructions(): RecordedEntry[][] {
  const out: RecordedEntry[][] = [];
  for (const e of load()) {
    if (e.k === 'instruction') out.push([e]);
    else out.at(-1)?.push(e);
  }
  return out;
}

/** server.ts noteMintedIds, as bench/rebuild-flow.mjs mirrors it: url ids, then the report's values. */
function bank(ledger: RunLedger, group: RecordedEntry[], step: string): void {
  for (const e of group) {
    const url = e.k === 'step' ? e.diff?.url : e.k === 'instruction' ? e.url : undefined;
    if (url) ledger.addUrlIds(url, step, urlParts(url), { landed: e.k === 'step' && e.tool !== 'goto' && e.tool !== 'back' });
    if (e.k === 'report') for (const [name, value] of Object.entries(e.values ?? {})) ledger.add(String(value), { from: 'output', step, name });
  }
}

describe('a url origin names the value its url showed LAST (fwsi14 02-create: /hardware/4 → bulkcheckout → /hardware/4)', () => {
  it('the ledger by origin gives url:i2:p1 = 4, where the instruction ended', () => {
    const [signin, create] = instructions();
    const ledger = new RunLedger();
    ledger.beginInstruction(1);
    bank(ledger, signin, 'i1');
    ledger.beginInstruction(2);
    bank(ledger, create, 'i2');
    // both are banked; the origin's value is the latest sighting
    expect(ledger.all().filter((e) => e.binding.from === 'url' && e.binding.step === 'i2' && e.binding.label === 'p1').map((e) => e.value)).toEqual(['4', 'bulkcheckout']);
    expect(ledger.byOrigin()['url:i2:p1']).toBe('4');
  });

  it('control: a url that moved on and never came back keeps the later value', () => {
    const O = 'http://127.0.0.1:8098';
    const ledger = new RunLedger();
    ledger.beginInstruction(2);
    ledger.addUrlIds(`${O}/hardware/4`, 'i2', urlParts(`${O}/hardware/4`), { landed: true });
    ledger.addUrlIds(`${O}/hardware/17`, 'i2', urlParts(`${O}/hardware/17`), { landed: true });
    expect(ledger.byOrigin()['url:i2:p1']).toBe('17');
    // a re-sighting under ANOTHER origin does not move this one
    ledger.beginInstruction(3);
    ledger.addUrlIds(`${O}/hardware/4`, 'i3', urlParts(`${O}/hardware/4`), { landed: true });
    expect(ledger.byOrigin()['url:i2:p1']).toBe('17');
  });

  it('03-open\'s goto to the edit form is slotted by that origin, not the recording\'s asset', () => {
    const [signin, create, open] = instructions();
    const ledger = new RunLedger();
    ledger.beginInstruction(1);
    bank(ledger, signin, 'i1');
    ledger.beginInstruction(2);
    bank(ledger, create, 'i2');
    const report = open[open.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    const skills = compileSkills({
      entries: open.slice(0, -1),
      instruction: (open[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
      session: 'fwsi14-n1',
      knownValues: { 'var:runid': 'fwsi14-n1', ...ledger.byOrigin() },
    });
    const gotos = skills.flatMap((s) => s.steps.filter((st) => st.tool === 'goto').map((st) => ({ url: String(st.args.url), params: s.params })));
    expect(gotos.length).toBeGreaterThan(0);
    for (const g of gotos) {
      expect(g.url, g.url).not.toMatch(/\/hardware\/4(\/|$)/);
      const slot = /\/hardware\/\{\{(v\d+)\}\}/.exec(g.url)?.[1];
      expect(slot, g.url).toBeTruthy();
      expect(g.params[slot!].binding).toBe('url:i2:p1');
    }
  });
});

describe('a navigation keeps the alert its landing raised as the alert it expects (fwsi14 03-open #95)', () => {
  it('goto /hardware/4/edit expects "This asset can be checked out." and nothing else', () => {
    const open = instructions()[2];
    const report = open[open.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    const steps = compileSkills({
      entries: open.slice(0, -1),
      instruction: (open[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
      session: 'fwsi14-n1',
      knownValues: { 'var:runid': 'fwsi14-n1' },
    }).flatMap((s) => s.steps);
    const edit = steps.find((s) => s.tool === 'goto' && String(s.args.url).endsWith('/edit'))!;
    expect(edit).toBeTruthy();
    expect(edit.expect).toEqual({ alertContains: 'This asset can be checked out.' });
    // a landing that raised no alert still expects nothing
    const view = steps.find((s) => s.tool === 'goto' && !String(s.args.url).endsWith('/edit'));
    if (view) expect(view.expect).toBeUndefined();
  });
});
