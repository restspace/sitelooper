import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstructionResult } from '../src/agent/loop.js';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { lineShows, specOf } from '../src/skills/replay.js';
import { maskVolatile, stranded } from '../src/skills/compile.js';
import { digitDominant } from '../src/skills/shape.js';
import { roleName, volatileMatcher } from '../src/shared/text.js';
import { recordCandidateEvidence, retired } from '../src/skills/repair.js';
import { SkillStore } from '../src/skills/store.js';
import { type TransformNote, coalesceControls, compileSkill, dropDeadReadLocators, dropDismissedDialogs, dropSupersededNavigation, compileSkills, discoverSlots, fillParams, fillParamsDeep, foldLoops, sameProcedure, softUrlMatch, stableFirst, substitute, substituteUrlId, substituteUrlParts, urlDiff, urlMatches, urlOriginPositions, urlParts, urlPattern } from '../src/skills/compile.js';
import { mintedShape } from '../src/execution/url.js';
import { identityMarkerVerdict, markersBound } from '../src/execution/gates.js';
import { observedChange } from '../src/execution/lifecycle.js';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import type { SkillStep } from '../src/skills/store.js';
import { bindSkill, canAdoptPin, learnFromInstruction, matchTemplate, publishedOutputs, sameChainProcedure, selectCandidates, synthesizeReport } from '../src/skills/learn.js';
import { candidatesFor, renderCandidates } from '../src/skills/replay.js';
import { SKILL_CONTRACT, SITEMAP_FILE, SkillStore, contractOf, isVerified, originOf, originSlug, type Skill } from '../src/skills/store.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-skills-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ORIGIN = 'http://127.0.0.1:4180';
const INSTRUCTION =
  "On the ticket detail page for ticket RD-1015 (url http://127.0.0.1:4180/#/tickets/t15), add a part named exactly 'x7 RD Part A' with cost 100 and markup 25. Report the price the app computes.";

function step(tool: string, args: Record<string, unknown>, chain: RecordedStep['locators']['target']['chain'] = [], extra: Partial<RecordedStep> = {}): RecordedStep {
  return {
    k: 'step',
    tool,
    args,
    locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain } } : {},
    ...extra,
  };
}

/** A recording of the add-part instruction as the agent would have produced it. */
describe('cross-instruction url record-id slotting (fwod29)', () => {
  it("slots a goto url's id= when an earlier instruction's url minted it, binding by origin", () => {
    // The armdoc forbids instructions naming database ids, so this value can
    // never anchor in prose. fwod29 compiled three skills with `...&id=21`
    // literal; every replay navigated to the recording run's deleted order.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Open the sales order S00021 and report its state.', url: `${ORIGIN}/web` } as RecordedEntry,
      step('goto', { url: `${ORIGIN}/web#cids=1&menu_id=181&action=315&model=sale.order&view_type=form&id=21` }, [], {
        diff: { url: `${ORIGIN}/web#cids=1&menu_id=181&action=315&model=sale.order&view_type=form&id=21`, alerts: [], added: ['- heading "S00021"'] },
      }),
      step('read', { target: '@e5', what: 'text' }, [{ kind: 'css', selector: 'h1' }], { result: '"S00021"' }),
    ];
    const [skill] = compileSkills({
      entries,
      instruction: 'Open the sales order S00021 and report its state.',
      report: { status: 'success', summary: 'opened', evidence: { values: { reference: 'S00021' } } },
      session: 's',
      knownValues: { 'var:runid': 'x7', 'url:i2:q.id': '21' },
    });
    expect(skill).toBeTruthy();
    const gotoStep = skill.steps.find((st) => st.tool === 'goto')!;
    const slotName = Object.entries(skill.params).find(([, p]) => p.binding === 'url:i2:q.id')?.[0];
    expect(slotName).toBeTruthy();
    expect(String(gotoStep.args.url)).toContain(`id={{${slotName}}}`);
    expect(String(gotoStep.args.url)).not.toContain('id=21');
    // Routing constants stay literal — they are the app's, not the run's.
    expect(String(gotoStep.args.url)).toContain('menu_id=181');
    expect(String(gotoStep.args.url)).toContain('action=315');
  });

  it('a coinciding non-id slot value never rewrites a url id=', () => {
    // A cost of "21" must not bind the navigation to the cost.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Set the cost to 21 on the open order.', url: `${ORIGIN}/web` } as RecordedEntry,
      step('fill', { target: '@e2', value: '21' }, [{ kind: 'label', label: 'Cost' }]),
      step('goto', { url: `${ORIGIN}/web#model=sale.order&id=21` }, [], {
        diff: { url: `${ORIGIN}/web#model=sale.order&id=21`, alerts: [], added: [] },
      }),
    ];
    const [skill] = compileSkills({
      entries,
      instruction: 'Set the cost to 21 on the open order.',
      report: { status: 'success', summary: 'set' },
      session: 's',
      knownValues: {},
    });
    expect(skill).toBeTruthy();
    const gotoStep = skill.steps.find((st) => st.tool === 'goto')!;
    expect(String(gotoStep.args.url)).toContain('id=21');
  });

  // fwgr41-n1 06-find (s_e013d1 step 7) and its n2 variant (s_0e342c step 7):
  // grafana's dashboard uid sits in an UNNAMED path segment, so the old
  // `q.id`-only rule left it literal and both skills navigated every later run
  // to the recording run's dead dashboard (both stored `failedAtStep: {"7": 1}`).
  // The flow had the value all along — steps 03/04/05 address the dashboard as
  // `{{02-create.url.p1}}` — it was banked at `p1` and nothing read that label.
  const GRAFANA_UID = 'afyd7g0300dfkc';
  const GRAFANA_INSTR = "Navigate to the dashboard 'x7 Bench Dashboard' in Grafana and report the page URL.";
  const grafanaEntries = (uidValue = GRAFANA_UID): RecordedEntry[] => {
    const url = `http://127.0.0.1:3000/d/${uidValue}/x7-bench-dashboard?from=now-6h&to=now&refresh=1m`;
    return [
      { k: 'instruction', text: GRAFANA_INSTR, url: 'http://127.0.0.1:3000/dashboards', fingerprint: [1, 0, 0] } as RecordedEntry,
      step('goto', { url }, [], { diff: { url, alerts: [], added: ['- heading "x7 Bench Dashboard"'] } }),
      step('read', { target: '@e1', what: 'url', label: 'current_dashboard_url' }, [{ kind: 'css', selector: 'body' }]),
    ];
  };

  it('slots a uid in an unnamed PATH segment the ledger banked at that position (fwgr41-n1 06-find)', () => {
    const [skill] = compileSkills({
      entries: grafanaEntries(),
      instruction: GRAFANA_INSTR,
      report: { status: 'success', summary: 'opened' },
      session: 's',
      knownValues: { 'var:runid': 'x7', 'url:i2:p1': GRAFANA_UID },
    });
    expect(skill).toBeTruthy();
    const gotoStep = skill.steps.find((st) => st.tool === 'goto')!;
    const slot = Object.entries(skill.params).find(([, p]) => p.binding === 'url:i2:p1');
    expect(slot, 'the uid binds by origin, so a later run resolves its own').toBeTruthy();
    expect(slot![1].example).toBe(GRAFANA_UID); // the recorded value is kept as the example
    expect(String(gotoStep.args.url)).toContain(`/d/{{${slot![0]}}}/`);
    expect(String(gotoStep.args.url)).not.toContain(GRAFANA_UID);
    // The slug beside it is the runid's slot, untouched by the positional write.
    expect(String(gotoStep.args.url)).toMatch(/\/\{\{v\d+\}\}-bench-dashboard/);
    // ...and a later run resolves its OWN uid from the same origin, which is
    // the whole point: the skill binds without the instruction naming the uid.
    const bound = bindSkill(skill, GRAFANA_INSTR.replaceAll('x7', 'k9'), { 'var:runid': 'k9', 'url:i2:p1': 'bfyd7wj0ceolcf' });
    expect(bound).toBeTruthy();
    expect(bound![slot![0]]).toBe('bfyd7wj0ceolcf');
    expect(fillParams(String(gotoStep.args.url), bound!)).toBe('http://127.0.0.1:3000/d/bfyd7wj0ceolcf/k9-bench-dashboard?from=now-6h&to=now&refresh=1m');
  });

  it('writes a banked identifier ONLY at the position it was banked at', () => {
    // The same characters in another segment are another thing. A free-text
    // rewrite would blank both; the rule replaces p1 and leaves p3 alone.
    const url = `http://127.0.0.1:3000/d/${GRAFANA_UID}/x7-bench-dashboard/${GRAFANA_UID}`;
    expect(substituteUrlId(url, [{ name: 'v9', value: GRAFANA_UID, at: 'p1' }])).toBe(
      `http://127.0.0.1:3000/d/{{v9}}/x7-bench-dashboard/${GRAFANA_UID}`,
    );
    // A position that does not hold the value is a no-op, never a corruption.
    expect(substituteUrlId(url, [{ name: 'v9', value: GRAFANA_UID, at: 'p2' }])).toBe(url);
    expect(substituteUrlId(url, [{ name: 'v9', value: GRAFANA_UID, at: 'p9' }])).toBe(url);
    // Hash routes and hash state are addressed the same way.
    expect(substituteUrlId('http://h:1/#/tickets/t15/edit', [{ name: 'v1', value: 't15', at: 'h1' }])).toBe('http://h:1/#/tickets/{{v1}}/edit');
    expect(substituteUrlId('http://h:1/web#model=sale.order&id=21', [{ name: 'v1', value: '21', at: 'q.id' }])).toBe(
      'http://h:1/web#model=sale.order&id={{v1}}',
    );
  });

  it('reads a url origin off the ledger spelling only, and by label', () => {
    expect(urlOriginPositions({ 'url:i2:p1': 'abc', 'url:03-open:q.id': '21' })).toEqual([
      { label: 'p1', value: 'abc' },
      { label: 'q.id', value: '21' },
    ]);
    // Not a url binding (a var, an output), and not a position label.
    expect(urlOriginPositions({ 'var:runid': 'x7', 'output:i1:ref': 'RD-1015', 'url:i2:ref': 'RD-1015' })).toEqual([]);
    // The flow runner's own url-output spelling is deliberately NOT admitted:
    // a param bound to it could not resolve at bind time, and an unbindable
    // param refuses the whole skill.
    expect(urlOriginPositions({ '02-create.url.p1': 'abc' })).toEqual([]);
  });

  it('leaves no earlier-instruction ledger identifier literal inside any args.url', () => {
    // The invariant, stated over the whole compile rather than one assertion
    // per app: whatever the label, a value the ledger banked from a url
    // position under an earlier instruction is a reference by the time it
    // reaches a navigation url.
    const known: Record<string, string> = {
      'var:runid': 'x7',
      'url:i2:p1': GRAFANA_UID,
      'url:i2:q.id': '21',
      'url:i3:h1': 't15',
    };
    const cases: { entries: RecordedEntry[]; instruction: string }[] = [
      { entries: grafanaEntries(), instruction: GRAFANA_INSTR },
      {
        instruction: 'Open the sales order and report its state.',
        entries: [
          { k: 'instruction', text: 'Open the sales order and report its state.', url: `${ORIGIN}/web` } as RecordedEntry,
          step('goto', { url: `${ORIGIN}/web#menu_id=181&action=315&model=sale.order&id=21` }, [], {
            diff: { url: `${ORIGIN}/web#menu_id=181&action=315&model=sale.order&id=21`, alerts: [], added: ['- heading "S00021"'] },
          }),
        ],
      },
      {
        instruction: 'Open the ticket and read its status.',
        entries: [
          { k: 'instruction', text: 'Open the ticket and read its status.', url: `${ORIGIN}/#/tickets` } as RecordedEntry,
          step('goto', { url: `${ORIGIN}/#/tickets/t15` }, [], {
            diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: [], added: ['- heading "Ticket"'] },
          }),
        ],
      },
    ];
    const bankedIds = Object.entries(known).filter(([k]) => k.startsWith('url:')).map(([, v]) => v);
    for (const c of cases) {
      const skills = compileSkills({ entries: c.entries, instruction: c.instruction, report: { status: 'success', summary: 'ok' }, session: 's', knownValues: known });
      expect(skills.length, c.instruction).toBeGreaterThan(0);
      const urls = skills.flatMap((s) => s.steps.map((st) => st.args.url)).filter((u): u is string => typeof u === 'string');
      expect(urls.length, c.instruction).toBeGreaterThan(0);
      for (const url of urls) for (const id of bankedIds) expect(url, `${c.instruction} → ${url}`).not.toContain(id);
    }
  });

  it('leaves an app constant the ledger never banked exactly as recorded (fwod19/fwod29)', () => {
    // The counter-example the position rule exists to protect: odoo's
    // `menu_id`/`action` are routing vocabulary every run shares. The ledger
    // refuses to bank them, so no label can claim them.
    const instr = 'Open the sales order list.';
    const url = `${ORIGIN}/web#menu_id=181&action=315&model=sale.order&view_type=list`;
    const [skill] = compileSkills({
      entries: [{ k: 'instruction', text: instr, url: `${ORIGIN}/web` } as RecordedEntry, step('goto', { url }, [], { diff: { url, alerts: [], added: ['- heading "Sales Orders"'] } })],
      instruction: instr,
      report: { status: 'success', summary: 'ok' },
      session: 's',
      knownValues: { 'var:runid': 'x7', 'url:i2:p1': GRAFANA_UID },
    });
    expect(String(skill.steps.find((st) => st.tool === 'goto')!.args.url)).toBe(url);
  });
});

function recording(): RecordedEntry[] {
  return [
    { k: 'instruction', text: INSTRUCTION, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0] },
    step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Add part' }], {
      diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: [], added: ['- dialog "New part"', '- textbox "Name"'] },
    }),
    step('fill', { target: '@e10', value: 'x7 RD Part A' }, [{ kind: 'label', label: 'Name' }, { kind: 'css', selector: 'form > input:nth-of-type(1)' }]),
    step('fill', { target: '@e11', value: '100' }, [{ kind: 'label', label: 'Cost' }]),
    step('fill', { target: '@e12', value: '25' }, [{ kind: 'label', label: 'Markup %' }]),
    step('click', { target: '@e13' }, [{ kind: 'role', role: 'button', name: 'Save' }], {
      diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: ['Part x7 RD Part A added'], added: ['- row "x7 RD Part A 100 25% 125.00"'] },
    }),
    step('wait_for', { target: 'table.parts', state: 'text_contains', text: 'x7 RD Part A' }, [{ kind: 'css', selector: 'table.parts' }]),
    step('read', { target: 'tr:has-text("x7 RD Part A") td.price', what: 'text' }, [{ kind: 'css', selector: 'tr:has-text("x7 RD Part A") td.price' }], {
      result: '"125.00"',
    }),
  ];
}

const report = {
  status: 'success' as const,
  summary: "Added part 'x7 RD Part A' (cost 100, markup 25); the app computed price 125.00.",
  evidence: { values: { partName: 'x7 RD Part A', partPrice: '125.00' } },
};

describe('volatile expectations and whitespace identity (fwkb3, fwod31)', () => {
  it('masks clock and calendar tokens the recording happened to see, keeping the slot', () => {
    expect(maskVolatile('- textbox "09/03/2026 07:22": {{v3}}')).toBe('- textbox "{{*}} {{*}}": {{v3}}');
    expect(maskVolatile('- cell "2026-12-31"')).toBe('- cell "{{*}}"');
    expect(maskVolatile('- row "Su Mo Tu We Th Fr Sa"')).toBe('- row "Su Mo Tu We Th Fr Sa"');
    expect(maskVolatile('- link "RD-1015"')).toBe('- link "RD-1015"');
  });
  it('volatileMatcher leaves a plain name alone and wildcards clock/date tokens in a recorded one', () => {
    expect(volatileMatcher('Save dashboard')).toBe('Save dashboard');
    const m = volatileMatcher('Due date: 12/31/2026 07:40');
    expect(m).toBeInstanceOf(RegExp);
    expect((m as RegExp).test('Due date: 12/31/2026 07:55')).toBe(true);
    expect((m as RegExp).test('Due date: 01/02/2027 18:00')).toBe(true);
    expect((m as RegExp).test('Start date: 12/31/2026 07:40')).toBe(false);
    expect((m as RegExp).test('Due date: 12/31/2026 07:40 (overdue)')).toBe(false);
  });
  // fwkb24: the accessible name Chromium computes for kanboard's column header
  // is "Ready " (an icon font's glyph via CSS content); the DOM walk had
  // recorded `link "Ready"`, and `exact: true` on that found nothing.
  it('roleName tolerates whitespace and icon glyphs around a recorded name, and nothing else', () => {
    const m = roleName('Ready');
    expect(m.test('Ready')).toBe(true);
    expect(m.test('Ready ')).toBe(true); // private-use glyph, icon font
    expect(m.test(' Ready')).toBe(true); // leading icon
    expect(m.test('  Ready\n ')).toBe(true);
    expect(m.test('Ready ✓')).toBe(true); // a check mark or an emoji is decoration, not a word
    expect(m.test('Ready?')).toBe(false); // punctuation is part of the name
    expect(m.test('Ready £')).toBe(false); // a currency or math sign can be the name's own
    expect(m.test('Ready 2')).toBe(false);
    expect(m.test('Not Ready')).toBe(false);
    expect(m.test('ready')).toBe(false); // case as recorded
    // whitespace runs inside a name match any run, as the snapshot collapsed them
    expect(roleName('Work in progress').test('Work  in progress ')).toBe(true);
    // the clock/calendar wildcard survives, so a date-named control matches another day's
    const dated = roleName('Due date: 12/31/2026 07:40');
    expect(dated.test('Due date: 01/02/2027 18:00 ')).toBe(true);
    expect(dated.test('Start date: 12/31/2026 07:40')).toBe(false);
  });
  it('lineShows matches a wildcard line and ignores whitespace on both sides', () => {
    const live = ['- textbox "09/03/2026 07:31": 2026-12-31', '- link "Backlog"  ', '- heading "Bench   Board"'];
    expect(lineShows(live, ['- textbox "{{*}} {{*}}": 2026-12-31'])).toBe(true);
    expect(lineShows(live, ['- textbox "{{*}} {{*}}": 2026-12-30'])).toBe(false);
    expect(lineShows(live, ['Backlog '])).toBe(true);
    expect(lineShows(live, ['Bench Board'])).toBe(true);
    expect(lineShows(live, ['Ready'])).toBe(false);
    // a wildcard never spans lines
    expect(lineShows(['- a "x"', '- b "y"'], ['- a "{{*}}b "y"'])).toBe(false);
  });
  /**
   * C06. An identity marker is the ONLY thing that can tell ticket t15 from
   * t14 — the url pattern and the fingerprint match every record of the
   * template, and the url gate hands the decision here precisely when the id
   * segment disagrees. Matched by substring it decides nothing: `fwgr25-n1` is
   * satisfied by `fwgr25-n10`, and a bare runid is the commonest marker shape
   * in the published stores. So `whole` bounds both edges at a letter/digit.
   */
  it('lineShows({whole}) matches an identity marker only at a letter/digit boundary', () => {
    const whole = { whole: true };
    expect(lineShows(['- cell "312"'], ['12'], whole)).toBe(false);
    expect(lineShows(['- cell "312"'], ['12'])).toBe(true); // the substring rule is unchanged for everyone else
    expect(lineShows(['- row "Order 12 Pending"'], ['Order 12'], whole)).toBe(true);
    expect(lineShows(['- link "INV-2024/170"'], ['INV-2024/17'], whole)).toBe(false);
    // punctuation is not a letter or a digit, so it never needs a separator
    expect(lineShows(['- link "(INV-2024/17)"'], ['INV-2024/17'], whole)).toBe(true);
    expect(lineShows(['- cell "part /17 of 20"'], ['/17'], whole)).toBe(true);
    expect(lineShows(['- cell "Smithers"'], ['Smith'], whole)).toBe(false);
    expect(lineShows(['- cell "Smith\'s"'], ['Smith'], whole)).toBe(true);
    // \p{L} with the u flag, or a non-ASCII letter would read as a boundary
    expect(lineShows(['- heading "Ångström"'], ['Ångström'], whole)).toBe(true);
    expect(lineShows(['- heading "Ångströms"'], ['Ångström'], whole)).toBe(false);
    expect(lineShows(['- cell "田中太郎"'], ['田中'], whole)).toBe(false);
    expect(lineShows(['- cell "田中 太郎"'], ['田中'], whole)).toBe(true);
    // the real shape: a neighbouring record whose id extends this run's
    expect(lineShows(['- row "fwgr25-n10 Bench Customer"'], ['fwgr25-n1'], whole)).toBe(false);
    expect(lineShows(['- row "fwgr25-n1 Bench Customer"'], ['fwgr25-n1'], whole)).toBe(true);
    // case-insensitive, and still whitespace-insensitive and wildcard-aware
    expect(lineShows(['- row "RD-1015"'], ['rd-1015'], whole)).toBe(true);
    expect(lineShows(['- heading "Bench   Board"'], ['Bench Board '], whole)).toBe(true);
    expect(lineShows(['- textbox "09/03/2026 07:31": 2026-12-31'], ['- textbox "{{*}} {{*}}": 2026-12-31'], whole)).toBe(true);
  });
  it('re-inlines a slot that survives only in an expectation: no orphan marker, no phantom param (fwgr23 05-open)', () => {
    // '125.00' is a run value the instruction only names inside '£125.00', so
    // its marker is swallowed in the template and it is typed nowhere; the
    // recording merely SAW it in a row. It must neither stay behind as an
    // unfillable {{vN}} in the expectation nor become a param bound by origin
    // that refuses the skill when that origin is not published.
    const text = "Add part 'x7 RD Part A' to ticket t15; the row should total £125.00.";
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0] },
      step('fill', { target: '@e10', value: 'x7 RD Part A' }, [{ kind: 'label', label: 'Name' }]),
      step('click', { target: '@e13' }, [{ kind: 'role', role: 'button', name: 'Save' }], {
        diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: [], added: ['- row "x7 RD Part A 125.00"'] },
      }),
    ];
    const s = compileSkill({ entries, instruction: text, report, session: 's', model: 'm', now: '2026-09-03T00:00:00Z', knownValues: { total: '£125.00', price: '125.00' } })!;
    expect(s).toBeTruthy();
    expect(Object.values(s.params).map((p) => p.example)).not.toContain('125.00');
    expect(s.steps[1].expect?.addedContains?.[0]).toMatch(/^- row "\{\{v\d+\}\} 125\.00"$/);
    const markers = new Set(Array.from(JSON.stringify(s.steps).matchAll(/\{\{(v\d+)\}\}/g), (m) => m[1]));
    for (const m of markers) expect(s.params).toHaveProperty(m);
  });
  it('slots a declared var the instruction never names but the expectations quote (fwrd45 06-change)', () => {
    // The instruction names the ticket only by reference; the recording then
    // saw the parts table, rows carrying the runid. Left literal, the replay's
    // row (fwrd45-n2 …) could never match and the step paid 15 recovery turns
    // on both replays.
    const text = 'On the detail page of ticket RD-1015, set its status to Ready.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0] },
      step('click', { target: '@e13' }, [{ kind: 'role', role: 'button', name: 'Save part' }], {
        diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: ['Part "fwrd45-n1 RD Part B" has no supplier'], added: ['- row "fwrd45-n1 RD Part B $200.00 Acme Parts Co"'] },
      }),
    ];
    const known = { 'var:runid': 'fwrd45-n1', 'output:i2:reference': 'RD-1015' };
    const s = compileSkill({ entries, instruction: text, report, session: 's', model: 'm', now: '2026-09-11T00:00:00Z', knownValues: known })!;
    const runidSlot = Object.entries(s.params).find(([, p]) => p.example === 'fwrd45-n1');
    expect(runidSlot, 'the runid gets a slot').toBeTruthy();
    const [name, param] = runidSlot!;
    expect(param.binding).toBe('var:runid');
    expect(s.steps[0].expect?.addedContains?.[0]).toBe(`- row "{{${name}}} RD Part B $200.00 Acme Parts Co"`);
    expect(s.steps[0].expect?.alertContains).toContain(`{{${name}}}`);
    expect(JSON.stringify(s)).not.toMatch(/"- row \\"fwrd45-n1/);
    // And it binds on the NEXT run from the var, though the instruction never names it.
    const bound = bindSkill(s, 'On the detail page of ticket RD-1016, set its status to Ready.', { 'var:runid': 'fwrd45-n2', 'output:i2:reference': 'RD-1016' });
    expect(bound?.[name]).toBe('fwrd45-n2');
  });

  it('slots a declared var that survives only in a url the step navigated to (fwgr28 02-create)', () => {
    // Grafana's slug carries the runid: six steps expected
    // `/d/<uid>/fwgr28-n1-bench-dashboard`, which no later run can reach.
    const text = 'Create the bench dashboard and save it.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/dashboard/new`, fingerprint: [1, 0, 0] },
      step('click', { target: '@e9' }, [{ kind: 'role', role: 'button', name: 'Save dashboard' }], {
        diff: { url: `${ORIGIN}/d/dfxzaeppeohdsc/fwgr28-n1-bench-dashboard`, alerts: [], added: ['- heading "Bench"'] },
      }),
    ];
    const s = compileSkill({ entries, instruction: text, report, session: 's', model: 'm', now: '2026-09-12T00:00:00Z', knownValues: { 'var:runid': 'fwgr28-n1' } })!;
    const slot = Object.entries(s.params).find(([, p]) => p.example === 'fwgr28-n1');
    expect(slot, 'the runid gets a slot').toBeTruthy();
    // The runid is what this test is about. The uid beside it is a digit-free
    // token no url-segment rule has ever generalised; provenance slots it (the
    // real fwgr28 pattern was `/d/{{v2}}/…`), which needs a minting step.
    expect(s.steps[0].expect?.urlPattern).toBe(`${ORIGIN}/d/dfxzaeppeohdsc/{{${slot![0]}}}-bench-dashboard`);
    expect(JSON.stringify(s.steps)).not.toContain('fwgr28-n1');
  });

  it('does not slot an earlier OUTPUT the expectations quote — it may not be published (f24bdf9)', () => {
    const text = 'On the detail page, set its status to Ready.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0] },
      step('click', { target: '@e13' }, [{ kind: 'role', role: 'button', name: 'Mark Ready' }], {
        diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: [], added: ['- row "RD-1015 Ready"'] },
      }),
    ];
    const s = compileSkill({ entries, instruction: text, report, session: 's', model: 'm', now: '2026-09-11T00:00:00Z', knownValues: { 'output:i2:reference': 'RD-1015' } })!;
    expect(Object.values(s.params).map((p) => p.example)).not.toContain('RD-1015');
  });

  it('labels a list read with the report value made from the whole list, not with one item (fwgr23 01-open)', () => {
    const text = 'Report the panel titles on the Service Health dashboard.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/d/health`, fingerprint: [1, 0, 0] },
      step('click', { target: '@e3' }, [{ kind: 'role', role: 'link', name: 'Service Health' }], {
        diff: { url: `${ORIGIN}/d/health`, alerts: [], added: ['- heading "Request rate"'] },
      }),
      step('read_all', { target: 'h2', what: 'text' }, [{ kind: 'css', selector: 'h2' }], { result: '["Request rate","Error count","Latency by endpoint"]' }),
    ];
    const listReport = {
      status: 'success' as const,
      summary: 'Three panels.',
      evidence: { values: { first_title: 'Request rate', panel_titles: 'Request rate, Error count, Latency by endpoint' } },
    };
    const s = compileSkill({ entries, instruction: text, report: listReport, session: 's', model: 'm', now: '2026-09-03T00:00:00Z' })!;
    expect(s.steps[1].label).toBe('panel_titles');
  });

  // …and ONLY the whole list. fwod53: a `read_all td` over an order row
  // matched the reported product_name on ONE element and took that label, so
  // every reference to it filled to the joined row and the step's
  // `- cell "{{v4}}"` could not match any cell — the work was done, the value
  // was garbage. Unlabelled, the output goes unpublished and liveReadsFor
  // synthesizes a real single-element read the unproven machinery can judge.
  it('leaves a list read UNLABELLED when only one element matches a report value (fwod53 02-create)', () => {
    const text = 'Create the quotation.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/orders`, fingerprint: [1, 0, 0] },
      step('read_all', { target: 'tr.o_data_row td', what: 'text' }, [{ kind: 'css', selector: 'tr.o_data_row td' }], {
        result: '["","[FURN_6666] Acoustic Bloc Screens","3.00","295.00","20%","£ 885.00",""]',
      }),
    ];
    const rowReport = {
      status: 'success' as const,
      summary: 'Added a line.',
      evidence: { values: { product_name: '[FURN_6666] Acoustic Bloc Screens' } },
    };
    const s = compileSkill({ entries, instruction: text, report: rowReport, session: 's', model: 'm', now: '2026-09-16T00:00:00Z' })!;
    expect(s.steps[0].label).toBeUndefined();
    expect(publishedOutputs(s)).not.toContain('product_name');
  });
  it('a transient status or progress line is never a recorded effect (fwgr25 sign-in)', () => {
    const text = 'Sign in and open the board.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/`, fingerprint: [1, 0, 0] },
      step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Sign in' }], {
        diff: { url: `${ORIGIN}/`, alerts: [], added: ['- status "Loading"'] },
      }),
      step('click', { target: '@e4' }, [{ kind: 'role', role: 'link', name: 'Board' }], {
        diff: { url: `${ORIGIN}/`, alerts: [], added: ['- progressbar', '- heading "Board"'] },
      }),
    ];
    const s = compileSkill({ entries, instruction: text, report, session: 's', model: 'm', now: '2026-09-03T00:00:00Z' })!;
    expect(s.steps[0].expect?.addedContains).toBeUndefined();
    expect(s.steps[1].expect?.addedContains).toEqual(['- heading "Board"']);
  });
  it('a line that identifies no element is never a recorded effect (fwod47-n3 04-open)', () => {
    const text = 'Open the second line for editing.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text, url: `${ORIGIN}/`, fingerprint: [1, 0, 0] },
      step('click', { target: '@e3' }, [{ kind: 'role', role: 'cell', name: 'Qty' }], {
        diff: { url: `${ORIGIN}/`, alerts: [], added: ['- textbox "": ', '- generic ""', '- textbox "": 13f9pv52yozr', '- checkbox "" [checked]', '- row "Corner Desk 2.00"', '- textbox "Quantity": 2.00'] },
      }),
      step('click', { target: '@e4' }, [{ kind: 'role', role: 'cell', name: 'Price' }], {
        diff: { url: `${ORIGIN}/`, alerts: [], added: ['- textbox ""', '- cell ""'] },
      }),
    ];
    const s = compileSkill({ entries, instruction: text, report, session: 's', model: 'm', now: '2026-09-15T00:00:00Z' })!;
    expect(s.steps[0].expect?.addedContains).toEqual(['- row "Corner Desk 2.00"', '- textbox "Quantity": {{*}}']);
    expect(s.steps[1].expect?.addedContains).toBeUndefined();
  });
  it('a minted url part is rewritten in a navigation url at its own position only (fwod32 sign-in)', () => {
    const minted = [
      { name: 'd2', value: '135', at: 'q.action' },
      { name: 'd3', value: '120', at: 'q.menu_id' },
    ];
    expect(substituteUrlParts('http://127.0.0.1:8069/web#action=135&menu_id=120', minted)).toBe('http://127.0.0.1:8069/web#action={{d2}}&menu_id={{d3}}');
    // the same digits at another key or elsewhere are not touched
    expect(substituteUrlParts('http://127.0.0.1:8069/web?page=135#action=1350&id=135', minted)).toBe('http://127.0.0.1:8069/web?page=135#action=1350&id=135');
  });
  it('a state key the pattern only knows as a wildcard may be absent from the live url; a literal one may not', () => {
    expect(urlDiff('http://x/web#action=:id&cids=:id&menu_id=:id', 'http://x/web#action=9&menu_id=8')).toEqual([]);
    expect(urlDiff('http://x/web#action=:id&cids={{d1}}&menu_id=:id', 'http://x/web#action=9&menu_id=8')).toEqual([]);
    expect(urlDiff('http://x/web#action=:id&cids=1&menu_id=:id', 'http://x/web#action=9&menu_id=8')).toBeNull();
  });
  it('a number inside a dotted address or version is never a slot', () => {
    const slots = new Map([['d1', '1']]);
    // (a number after `=` is substituteUrlId's business, not substitute()'s)
    expect(substitute('http://127.0.0.1:8069/web#action=5&cids=1 page 1', slots)).toBe('http://127.0.0.1:8069/web#action=5&cids=1 page {{d1}}');
    expect(substitute('version 1.2.3, qty 1', slots)).toBe('version 1.2.3, qty {{d1}}');
    // a sentence-final number still substitutes
    expect(substitute('qty 1.', slots)).toBe('qty {{d1}}.');
  });
  it('a number inside a clock time, a date or a thousands group is never a slot (fwod67 order id 21 in "21:05")', () => {
    const slots = new Map([['v4', '21']]);
    expect(substitute('- cell "09/17/2026 21:05"', slots)).toBe('- cell "09/17/2026 21:05"');
    expect(substitute('- cell "21/09/2026 10:21"', slots)).toBe('- cell "21/09/2026 10:21"');
    expect(substitute('total £ 1,21 and 21,000', slots)).toBe('total £ 1,21 and 21,000');
    // the same number standing on its own still substitutes, a comma after it included
    expect(substitute('order 21, cell "21" and S00021', slots)).toBe('order {{v4}}, cell "{{v4}}" and S00021');
  });
});

describe('url patterns', () => {
  it('keeps an opaque-origin url readable instead of printing "null/"', () => {
    expect(urlPattern('chrome-error://chromewebdata/')).toBe('chrome-error://chromewebdata/');
  });
  it('reduces id-like segments, keeping the query as pairs', () => {
    expect(urlPattern('http://h:1/app/tickets/t15?x=1#/tickets/RD-1015')).toBe('http://h:1/app/tickets/:id?x=:id#/tickets/:id');
    // pairs sorted, words kept, noise dropped, a credential stored as a wildcard, a slot as its marker
    expect(urlPattern('http://h:1/?task_id=4&controller=Task&utm_source=x&token=s3cret')).toBe('http://h:1/?controller=Task&task_id=:id&token=:var');
    expect(urlPattern('http://h:1/edit?id=x7', new Map([['v1', 'x7']]))).toBe('http://h:1/edit?id={{v1}}');
    // a page TEMPLATE, for seams and routes, ignores the query
    expect(urlPattern('http://h:1/d/abc?refresh=1m', new Map(), { query: false })).toBe('http://h:1/d/abc');
    expect(urlPattern('http://h:1/products/8f3a9c2e1b/details')).toBe('http://h:1/products/:id/details');
    expect(urlPattern('http://h:1/users/123e4567-e89b-12d3-a456-426614174000')).toBe('http://h:1/users/:id');
    expect(urlPattern('http://h:1/about')).toBe('http://h:1/about');
  });
  it('keeps ordinary words', () => {
    expect(digitDominant('tickets', 'proposal')).toBe(false);
    expect(digitDominant('new', 'proposal')).toBe(false);
    expect(digitDominant('t15', 'proposal')).toBe(true);
    expect(digitDominant('RD-1015', 'proposal')).toBe(true);
    // A long route word is not a uid in a url, however much it looks like one
    // to the admission test: `/settings/notifications` must stay a route.
    expect(urlPattern('http://h:1/settings/notifications')).toBe('http://h:1/settings/notifications');
    expect(urlPattern('http://h:1/reports/2026-09-01')).toBe('http://h:1/reports/2026-09-01');
  });
  it('turns slot values in the url into markers and matches them back', () => {
    const slots = new Map([['v1', 'acme']]);
    const p = urlPattern('http://h:1/orgs/acme/settings', slots);
    expect(p).toBe('http://h:1/orgs/{{v1}}/settings');
    expect(urlMatches(p, 'http://h:1/orgs/globex/settings', { v1: 'globex' })).toBe(true);
    expect(urlMatches(p, 'http://h:1/orgs/globex/billing', { v1: 'globex' })).toBe(false);
  });
  it('matches a live url with a different id', () => {
    expect(urlMatches('http://h:1/#/tickets/:id', 'http://h:1/#/tickets/t99')).toBe(true);
    expect(urlMatches('http://h:1/#/tickets/:id', 'http://h:1/#/tickets')).toBe(false);
  });
  it('reduces a query-shaped hash route, keys kept and order-independent', () => {
    // Odoo's shape: the fragment is the route AND volatile per-session state.
    expect(urlPattern('http://h:1/web#action=123&cids=1&menu_id=81')).toBe('http://h:1/web#action=:id&cids=:id&menu_id=:id');
    // Same page, different session ids and a different key order. Matching
    // consults the stored pattern's own :id markers (written once at compile
    // time), never a shape heuristic on the live value.
    expect(urlMatches(urlPattern('http://h:1/web#action=123&cids=1&menu_id=81'), 'http://h:1/web#menu_id=99&cids=2&action=456')).toBe(true);
    // Non-id values still distinguish one template from another.
    expect(urlPattern('http://h:1/web#action=315&model=sale.order&view_type=list')).toBe(
      'http://h:1/web#action=:id&model=sale.order&view_type=list',
    );
    expect(urlMatches('http://h:1/web#action=315&model=sale.order', 'http://h:1/web#action=9&model=res.partner')).toBe(false);
  });
  it('treats query-shaped hash state as a necessary, not exact, condition', () => {
    // State accumulates: recorded at "#cids=1", the page has grown an action
    // and a menu id by the time a later segment starts on it.
    expect(urlMatches('http://h:1/web#cids=1', 'http://h:1/web#action=133&cids=1&menu_id=91')).toBe(true);
    // Missing a required pair is still a mismatch...
    expect(urlMatches('http://h:1/web#model=sale.order', 'http://h:1/web#action=133&cids=2')).toBe(false);
    // ...as is a different path, however well the fragment lines up.
    expect(urlMatches('http://h:1/web#cids=1', 'http://h:1/other#action=1&cids=2')).toBe(false);
    // A path-shaped fragment is a route, so it keeps matching exactly.
    expect(urlMatches('http://h:1/#/tickets/:id', 'http://h:1/#/tickets/t9/edit')).toBe(false);
  });
});

describe('parameterisation', () => {
  it('finds the literals the agent typed that occur as whole tokens in the instruction', () => {
    const slots = discoverSlots(INSTRUCTION, recording().filter((e): e is RecordedStep => e.k === 'step'));
    expect([...slots.values()]).toEqual(['x7 RD Part A', '100', '25']);
  });
  it('parameterises a navigation locator that identifies a record', () => {
    const instr = "On ticket RD-1015, add a part named 'x7 Part A'";
    const steps = [
      // a click whose ONLY record reference is the link name RD-1015 (not in any arg)
      step('click', { target: '@e1' }, [{ kind: 'role', role: 'link', name: 'RD-1015' }, { kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' }]),
      step('fill', { target: '@e2', value: 'x7 Part A' }, [{ kind: 'label', label: 'Name' }]),
    ];
    const slots = discoverSlots(instr, steps);
    // RD-1015 (record id, digit) and 'x7 Part A' (typed value) both become slots
    expect([...slots.values()]).toContain('RD-1015');
    expect([...slots.values()]).toContain('x7 Part A');
  });

  it('does NOT parameterise a plain UI-label locator that happens to match a word', () => {
    const instr = 'Add a part and save it';
    const steps = [step('click', { target: '@e1' }, [{ kind: 'role', role: 'button', name: 'Add' }, { kind: 'role', role: 'button', name: 'save' }])];
    // "Add"/"save" are stable affordances (no digit, not id-like) → stay literal
    expect([...discoverSlots(instr, steps).values()]).toEqual([]);
  });

  it('substitutes on token boundaries only', () => {
    const slots = new Map([['v1', '25']]);
    expect(substitute('markup 25 in li:nth-of-type(25) and 250', slots)).toBe('markup {{v1}} in li:nth-of-type(25) and 250');
    expect(fillParams('markup {{v1}}', { v1: '30' })).toBe('markup 30');
  });
  it('ignores a literal that is not in the instruction', () => {
    const steps = [step('fill', { target: '@e1', value: 'Some Customer' })];
    expect(discoverSlots('create a ticket', steps).size).toBe(0);
  });

  it('refuses a slot for a literal that appears twice in different roles', () => {
    // Odoo's demo credentials are admin/admin. One slot cannot stand for two
    // roles: bindSkill emits a capture group per occurrence, so a shared name
    // binds to the LAST group and the password lands in the email field.
    const instr = 'sign in with email admin and password admin';
    const steps = [
      step('fill', { target: '@e1', value: 'admin' }, [{ kind: 'label', label: 'Email' }]),
      step('fill', { target: '@e2', value: 'admin' }, [{ kind: 'label', label: 'Password' }]),
    ];
    expect([...discoverSlots(instr, steps).values()]).toEqual([]);
  });

  it('still parameterises a value that appears once alongside a repeated one', () => {
    const instr = "sign in as admin with password admin then open project 'Apollo'";
    const steps = [
      step('fill', { target: '@e1', value: 'admin' }, [{ kind: 'label', label: 'User' }]),
      step('fill', { target: '@e2', value: 'admin' }, [{ kind: 'label', label: 'Password' }]),
      step('fill', { target: '@e3', value: 'Apollo' }, [{ kind: 'label', label: 'Project' }]),
    ];
    expect([...discoverSlots(instr, steps).values()]).toEqual(['Apollo']);
  });
});

describe('slot-by-policy known values', () => {
  // The fwrd3 delete-both-parts shape: the run identifier repeats throughout
  // (act on part A, verify part A gone), so the heuristic single-occurrence
  // guard de-slots EVERYTHING and the skill bakes in the runid.
  const DELETE_INSTR =
    "On the ticket 'x7 RD Bench Ticket' (ref RD-1015), delete BOTH parts ('x7 RD Part A' and 'x7 RD Part B'), then verify 'x7 RD Part A' and 'x7 RD Part B' are gone and 'x7 RD Bench Ticket' is archived.";
  const deleteSteps = (): RecordedStep[] => [
    step('click', { target: '@e1' }, [{ kind: 'role', role: 'link', name: 'x7 RD Bench Ticket' }]),
    step('click', { target: '@e2' }, [{ kind: 'role', role: 'button', name: 'Delete x7 RD Part A' }]),
    step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Delete x7 RD Part B' }]),
  ];

  it('without known values the repeated identifiers stay literal (heuristic guard intact)', () => {
    expect([...discoverSlots(DELETE_INSTR, deleteSteps()).values()]).not.toContain('x7');
  });

  it('a declared run value is slotted at every occurrence despite repetition', () => {
    const slots = discoverSlots(DELETE_INSTR, deleteSteps(), { runid: 'x7' });
    const name = [...slots.entries()].find(([, v]) => v === 'x7')?.[0];
    expect(name).toBeTruthy();
    const template = substitute(DELETE_INSTR, slots);
    expect(template).not.toContain('x7');
    expect((template.match(new RegExp(`\\{\\{${name}\\}\\}`, 'g')) ?? []).length).toBe(6);
  });

  it('the admin/admin guard still holds for values that are NOT declared', () => {
    const instr = 'sign in with email admin and password admin';
    const steps = [
      step('fill', { target: '@e1', value: 'admin' }, [{ kind: 'label', label: 'Email' }]),
      step('fill', { target: '@e2', value: 'admin' }, [{ kind: 'label', label: 'Password' }]),
    ];
    expect([...discoverSlots(instr, steps, { runid: 'x7' }).values()]).toEqual([]);
  });

  it('compiles a run-generic skill: no runid literal anywhere, binds a later run', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: DELETE_INSTR, url: `${ORIGIN}/#/tickets`, fingerprint: [1, 0, 0] },
      ...deleteSteps(),
    ];
    const rep = { status: 'success' as const, summary: 'Deleted both parts; ticket archived.' };
    const [skill] = compileSkills({ entries, instruction: DELETE_INSTR, report: rep, session: 's', knownValues: { runid: 'x7', '01-open.reference': 'RD-1015' } });
    expect(skill).toBeTruthy();
    expect(skill.template).not.toContain('x7');
    expect(skill.template).not.toContain('RD-1015');
    expect(JSON.stringify(skill.steps)).not.toContain('x7');
    const bound = bindSkill(skill, DELETE_INSTR.replaceAll('x7', 'fw-n2').replaceAll('RD-1015', 'RD-1044'));
    expect(bound).toBeTruthy();
    expect(Object.values(bound!)).toContain('fw-n2');
    expect(Object.values(bound!)).toContain('RD-1044');
  });

  it('a known value nested inside a discovered arg slot composes cleanly', () => {
    const slots = discoverSlots(INSTRUCTION, recording().filter((e): e is RecordedStep => e.k === 'step'), { runid: 'x7' });
    expect(substitute(INSTRUCTION, slots)).not.toContain('x7');
  });

  it('a known value wholly swallowed by a longer slot leaves no unbindable param', () => {
    // fwrd5l: the bare runid's every occurrence sat inside the ticket-title
    // slot, so {{v1}} appeared nowhere — yet v1 stayed a param, and bindSkill
    // refused the skill's own source instruction (step 01 never went tier A).
    const instr = "Open http://x.test/ and create a ticket titled exactly 'x7 RD Bench Ticket'. Confirm it exists.";
    const steps = [
      step('goto', { url: 'http://x.test/' }),
      step('fill', { target: '@e1', value: 'x7 RD Bench Ticket' }, [{ kind: 'label', label: 'Title' }]),
    ];
    const entries: RecordedEntry[] = [{ k: 'instruction', text: instr, url: 'http://x.test/', fingerprint: [1, 0, 0] }, ...steps];
    const [skill] = compileSkills({ entries, instruction: instr, report: { status: 'success', summary: 'ok' }, session: 's', knownValues: { runid: 'x7' } });
    expect(skill).toBeTruthy();
    expect(skill.template).not.toContain('x7');
    for (const name of Object.keys(skill.params)) expect(skill.template).toContain(`{{${name}}}`);
    expect(bindSkill(skill, instr.replaceAll('x7', 'k9'))).toBeTruthy();
  });

  it('drops an address welded out of a run value, not just an anchor', () => {
    // fwrd20l and fwrd21l both shipped `data-testid="ticket-link-t15"`: the
    // record's own id inside a test hook. The check only ever looked at
    // scoped anchors, so an address carrying the same value walked straight
    // through. stableFirst demotes it to the tail, so it is reached only when
    // everything better has missed — and then it resolves against whatever
    // wears that id NEXT run.
    const instr = 'Open the ticket list and read the first ticket reference.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instr, url: 'http://x.test/#/tickets', fingerprint: [1, 0, 0] },
      step('read', { target: '@e1', what: 'text' }, [
        { kind: 'scoped', container: 'tr', hasText: 'x7 RD Bench Ticket', selector: 'td > a' },
        { kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' },
      ]),
    ];
    const [skill] = compileSkills({
      entries, instruction: instr, report: { status: 'success', summary: 'ok' }, session: 's',
      knownValues: { 'var:runid': 'x7', 'url:i1:h1': 't15' },
    });
    expect(JSON.stringify(skill.steps)).not.toContain('ticket-link-t15');
  });

  it('drops a NAME that is really a record reference', () => {
    // fwrd22l shipped six: getByText('RD-1015') and getByRole('link', {name:
    // 'RD-1015'}), each pinned to the ticket the RECORDING run created. The
    // rule used to stop at anchors on the grounds that role/text locators are
    // ordinary UI text worth keeping as fallbacks — true, until the name IS
    // the record's reference.
    const instr = 'Open the ticket list and archive the ticket.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instr, url: 'http://x.test/#/tickets', fingerprint: [1, 0, 0] },
      step('click', { target: '@e1' }, [
        { kind: 'role', role: 'link', name: 'RD-1015' },
        { kind: 'text', text: 'RD-1015' },
        { kind: 'css', selector: '#ticket-rows > tr:nth-of-type(1) > td' },
      ]),
    ];
    const [skill] = compileSkills({
      entries, instruction: instr, report: { status: 'success', summary: 'ok' }, session: 's',
      knownValues: { 'output:i1:ref': 'RD-1015' },
    });
    expect(JSON.stringify(skill.steps)).not.toContain('RD-1015');
    // The structural path survives — dropping the whole chain would be worse.
    expect((skill.steps[0].locators.target ?? []).length).toBe(1);
  });

  it('DEMOTES a minted-id address it can only guess at, rather than deleting it', () => {
    // The instruction that MINTS t15 never visits a t15 url, so no ledger
    // entry exists while it compiles. Provenance cannot reach this one and
    // only the token's SHAPE suggests it — which is a weak signal: grafana's
    // ephemeral `_r8b_` matches none of our id patterns while odoo's stable
    // `o_form_view` hooks trip several. A wrong deletion costs a working
    // locator permanently; a wrong demotion costs one failed count(), and two
    // replays of evidence settle it either way. So it sorts last and the
    // running tally decides — see recordCandidateEvidence.
    const instr = 'Create a ticket and confirm it appears in the list.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instr, url: 'http://x.test/#/tickets', fingerprint: [1, 0, 0] },
      step('read', { target: '@e1', what: 'text' }, [
        { kind: 'scoped', container: 'tr', hasText: 'x7 RD Bench Ticket', selector: 'td > a' },
        { kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' },
      ]),
    ];
    const [skill] = compileSkills({ entries, instruction: instr, report: { status: 'success', summary: 'ok' }, session: 's', knownValues: {} });
    const chain = skill.steps[0].locators.target ?? [];
    expect(chain.some((c) => c.kind === 'testid')).toBe(true); // kept...
    expect(chain[chain.length - 1]).toMatchObject({ value: 'ticket-link-t15' }); // ...but last
  });

  it('leaves ordinary numbered hooks alone', () => {
    const instr = 'Remove the first row.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instr, url: 'http://x.test/#/tickets', fingerprint: [1, 0, 0] },
      step('click', { target: '@e1' }, [
        { kind: 'testid', attr: 'data-testid', value: 'del-1' },
        { kind: 'css', selector: '#dellist > div:nth-of-type(1)' },
      ]),
    ];
    const [skill] = compileSkills({ entries, instruction: instr, report: { status: 'success', summary: 'ok' }, session: 's', knownValues: {} });
    expect(JSON.stringify(skill.steps)).toContain('del-1');
  });

  it('keeps a chain that would otherwise be emptied entirely', () => {
    // Failing closed is right for ONE candidate, not for the whole step: with
    // nothing left the step cannot even be attempted.
    const instr = 'Open the ticket list and read the first ticket reference.';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instr, url: 'http://x.test/#/tickets', fingerprint: [1, 0, 0] },
      step('click', { target: '@e1' }, [{ kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' }]),
    ];
    const [skill] = compileSkills({
      entries, instruction: instr, report: { status: 'success', summary: 'ok' }, session: 's',
      knownValues: { 'url:i1:h1': 't15' },
    });
    expect((skill.steps[0].locators.target ?? []).length).toBe(1);
  });

  it('a known value this instruction never names binds to its ORIGIN, not a literal', () => {
    // fwrd19l 04-edit: the instruction edits Part A, but a step's identity
    // anchor names Part B — a value an EARLIER instruction supplied. The slot
    // was formed and substituted correctly, then the mirror-hazard rule
    // deleted the unbindable param and pasted the recording run's runid back
    // into the anchor, so every replay missed it and fell to a positional
    // fallback. Deterministically, on both replays of both sweeps.
    const instr = "Edit the part named 'x7 RD Part A' and change its cost to 150.";
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instr, url: 'http://x.test/#/t/1', fingerprint: [1, 0, 0] },
      // The step that TYPES Part A makes it a slot of its own, which swallows
      // the bare runid in the template — the exact shape of the real skill.
      step('fill', { target: '@e0', value: 'x7 RD Part A' }, [{ kind: 'label', label: 'Name' }]),
      step('fill', { target: '@e1', value: '150' }, [{ kind: 'label', label: 'Cost' }]),
      step('click', { target: '@e2' }, [
        { kind: 'scoped', container: 'tr', hasText: 'x7 RD Part B', selector: 'td:nth-of-type(6)' },
      ]),
    ];
    const known = { 'var:runid': 'x7' };
    const [skill] = compileSkills({ entries, instruction: instr, report: { status: 'success', summary: 'ok' }, session: 's', knownValues: known });
    expect(skill).toBeTruthy();
    // The anchor keeps its marker: no run value survives into the procedure.
    expect(JSON.stringify(skill.steps)).not.toContain('x7');
    const bound = Object.entries(skill.params).find(([, p]) => p.binding);
    expect(bound?.[1].binding).toBe('var:runid');
    // A later run resolves its own value from the same origin, even though
    // nothing in the instruction it is matching mentions it.
    const params = bindSkill(skill, instr.replaceAll('x7', 'k9'), { 'var:runid': 'k9' });
    expect(params).toBeTruthy();
    expect(fillParamsDeep(skill.steps, params!)).toContainEqual(
      expect.objectContaining({ locators: { target: [expect.objectContaining({ hasText: 'k9 RD Part B' })] } }),
    );
  });
});

describe('foldLoops', () => {
  const sstep = (tool: string, target?: LocatorCandidate[], args: Record<string, unknown> = {}): SkillStep => ({ tool, args, locators: target ? { target } : {} });
  // Two "delete the part / confirm" groups that differ only in a per-record testid.
  const deleteGroup = (id: string): SkillStep[] => [
    sstep('click', [
      { kind: 'role', role: 'button', name: 'Delete' },
      { kind: 'testid', attr: 'data-testid', value: `part-delete-${id}` },
    ]),
    sstep('click', [{ kind: 'css', selector: 'button:has-text("Delete part")' }]),
  ];

  it('folds a run of identical action groups that differ only in a per-record id', () => {
    const folded = foldLoops([...deleteGroup('p18'), ...deleteGroup('p19')]);
    expect(folded).toHaveLength(1);
    expect(folded[0].tool).toBe('loop');
    expect(folded[0].body).toHaveLength(2);
    expect(folded[0].while?.[0]).toMatchObject({ kind: 'role', name: 'Delete' });
  });

  /**
   * C07. Folding compresses a repetition; it does not confer authority over
   * records nobody looked at. Two deletions used to become a loop capped at
   * seven, so a list of ten came back with three rows left — and, before the
   * execution fixes, called that a success. Scope now comes from the caller's
   * own words, and the default is the work that was observed.
   */
  it('bounds a folded loop to the observed work unless the instruction quantifies', () => {
    const steps = [...deleteGroup('p18'), ...deleteGroup('p19')];

    const bounded = foldLoops(steps, 'delete part p18 and part p19');
    expect(bounded[0].scope).toBe('observed');
    expect(bounded[0].max).toBe(2); // two records seen, two records worked

    for (const instruction of ['delete all the parts', 'remove every part', 'delete each part', 'clear the entire parts list']) {
      const drained = foldLoops(steps, instruction);
      expect(drained[0].scope, instruction).toBe('drain');
      expect(drained[0].max, instruction).toBe(2 * 2 + 3);
    }

    // No instruction at all is not a licence either.
    expect(foldLoops(steps)[0].scope).toBe('observed');
  });

  /**
   * Rebuilding every published recording folded five loops, and the only one
   * this rule sent to `drain` was wrong: an Odoo instruction that says there
   * are exactly TWO stacked dialogs, numbers the steps, and then refers to
   * "the remaining modal". A definite article in front of a singular noun is
   * not a quantifier over a collection.
   */
  /**
   * Every transform here deletes or rewrites steps the recording actually
   * made, on evidence that is never conclusive. Until the reason was written
   * down, the only way to see what had fired was to recompile every published
   * recording under two builds and diff the stores — which is how the "the
   * remaining modal" misreading above was found, and it took 23 rebuilds.
   */
  it('says what it folded and which word authorised the scope', () => {
    const steps = [...deleteGroup('p18'), ...deleteGroup('p19')];

    const bounded: TransformNote[] = [];
    foldLoops(steps, 'delete part p18 and part p19', bounded);
    expect(bounded).toHaveLength(1);
    expect(bounded[0]).toMatchObject({ name: 'foldLoops', at: 1 });
    expect(bounded[0].reason).toMatch(/bounded to those 2, because the instruction quantifies nothing/);

    const drained: TransformNote[] = [];
    foldLoops(steps, 'remove every part from the list', drained);
    // The quantifier is NAMED, which is the whole point: "because the
    // instruction said \"every\"" is reviewable, "drain" is not.
    expect(drained[0].reason).toMatch(/DRAIN the collection, because the instruction said "every"/);

    // A fold that does not happen claims nothing.
    const none: TransformNote[] = [];
    foldLoops([deleteGroup('p18')[0]], 'delete every part', none);
    expect(none).toEqual([]);
  });

  it('reads "the remaining X" as one named thing, not as a quantifier', () => {
    const steps = [...deleteGroup('p18'), ...deleteGroup('p19')];
    expect(foldLoops(steps, 'close the topmost dialog, then the remaining modal')[0].scope).toBe('observed');
    // Without the article it still quantifies, and so does "any remaining".
    expect(foldLoops(steps, 'delete remaining rows')[0].scope).toBe('drain');
    expect(foldLoops(steps, 'delete any remaining rows')[0].scope).toBe('drain');
  });

  it('does NOT fold distinct form fields that merely share a role', () => {
    const steps = [
      sstep('fill', [{ kind: 'role', role: 'textbox', name: 'Title *' }], { value: 'A' }),
      sstep('fill', [{ kind: 'role', role: 'textbox', name: 'Customer' }], { value: 'B' }),
    ];
    expect(foldLoops(steps)).toHaveLength(2);
  });

  it('does NOT fold consecutive read-backs (observations never iterate)', () => {
    // Three synthetic read-backs whose locators differ only in a per-record id —
    // the same superficial shape as delete iteration, but reads must never fold.
    const reads = ['p18', 'p19', 'p20'].map((id) => sstep('read', [{ kind: 'testid', attr: 'data-testid', value: `part-price-${id}` }], { target: '(read-back)' }));
    expect(foldLoops(reads).every((s) => s.tool === 'read')).toBe(true);
  });

  it('does NOT fold a control that is simply hit twice identically (no per-record id)', () => {
    const twice = [sstep('click', [{ kind: 'role', role: 'button', name: 'Next' }]), sstep('click', [{ kind: 'role', role: 'button', name: 'Next' }])];
    expect(foldLoops(twice)).toHaveLength(2);
  });

  it('leaves surrounding steps in place and folds only the repeated middle', () => {
    const folded = foldLoops([sstep('goto', undefined, { url: '/x' }), ...deleteGroup('p18'), ...deleteGroup('p19'), sstep('read', undefined, { target: '(read-back)' })]);
    expect(folded.map((s) => s.tool)).toEqual(['goto', 'loop', 'read']);
  });

  it('coalesces redundant dialog_expect arming so an uneven delete run still folds', () => {
    const de = () => sstep('dialog_expect', undefined, { action: 'accept' });
    // The shape the recorder actually produced: one arm before the first delete,
    // two before the second — enough to misalign the groups on its own.
    const raw = [de(), ...deleteGroup('p18'), de(), de(), ...deleteGroup('p19'), de()];
    const folded = foldLoops(coalesceControls(raw));
    const loops = folded.filter((s) => s.tool === 'loop');
    expect(loops).toHaveLength(1);
    // The loop repeats the two delete clicks, guarded by the Delete button.
    expect(loops[0].body?.filter((b) => b.tool === 'click')).toHaveLength(2);
    expect(loops[0].while?.[0]).toMatchObject({ kind: 'role', name: 'Delete' });
  });
});

describe('dropDeadReadLocators', () => {
  const readStep = (label: string, chain: LocatorCandidate[]): SkillStep => ({
    tool: 'read',
    args: { what: 'text' },
    locators: { target: chain },
    label,
  });

  it('retires a read located by its own value, once a run has shown the value change', () => {
    const steps = [readStep('total', [
      { kind: 'text', text: '£ 133.33' },
      { kind: 'id', selector: '#invoice-total' },
    ])];
    expect(dropDeadReadLocators(steps, { total: '£ 133.33' })).toBe(1);
    expect(steps[0].locators.target).toEqual([{ kind: 'id', selector: '#invoice-total' }]);
  });

  it('leaves a read alone while nothing has contradicted its value', () => {
    // Run 1 has no evidence at all, and an output a later run AGREED with is
    // page furniture: `getByText('Recipients')` is the right way to find it.
    const chain: LocatorCandidate[] = [{ kind: 'text', text: 'Recipients' }, { kind: 'css', selector: 'h3' }];
    const steps = [readStep('heading', [...chain])];
    expect(dropDeadReadLocators(steps, {})).toBe(0);
    expect(steps[0].locators.target).toEqual(chain);
  });

  it('empties the chain rather than leave a read findable only by position', () => {
    // fwrd16-n3: the read fell to `tbody > tr:nth-of-type(1) > td`, resolved
    // instantly on a seed row and published a confidently wrong ref. Replay
    // skips a read with no locator, so the value comes back absent instead.
    const steps = [readStep('ref', [
      { kind: 'text', text: 'RD-1015' },
      { kind: 'css', selector: 'tbody > tr:nth-of-type(1) > td' },
    ])];
    expect(dropDeadReadLocators(steps, { ref: 'RD-1015' })).toBe(1);
    expect(steps[0].locators.target).toEqual([]);
  });

  it('matches whole tokens, so a changed quantity does not condemn a price', () => {
    const steps = [readStep('qty', [{ kind: 'text', text: '£ 425.00' }])];
    expect(dropDeadReadLocators(steps, { qty: '5.00' })).toBe(0);
    expect(steps[0].locators.target).toHaveLength(1);
  });

  it('ignores values too short to carry identity, and steps that are not reads', () => {
    const short = [readStep('dash', [{ kind: 'text', text: '-- pending' }])];
    expect(dropDeadReadLocators(short, { dash: '--' })).toBe(0);
    // A CLICK carrying a run value is `stranded`'s business at compile time,
    // where provenance says the run made it. This rule is about the circle
    // between a read and the value it reported, and nothing else.
    const click: SkillStep[] = [{ tool: 'click', args: {}, locators: { target: [{ kind: 'text', text: 'RD-1015' }] }, label: 'ref' }];
    expect(dropDeadReadLocators(click, { ref: 'RD-1015' })).toBe(0);
  });

  it('reaches reads inside a loop body', () => {
    const steps: SkillStep[] = [
      { tool: 'loop', args: {}, locators: {}, body: [readStep('ref', [{ kind: 'text', text: 'RD-1015' }, { kind: 'role', role: 'cell', name: 'Ticket' }])] },
    ];
    expect(dropDeadReadLocators(steps, { ref: 'RD-1015' })).toBe(1);
    expect(steps[0].body![0].locators.target).toEqual([{ kind: 'role', role: 'cell', name: 'Ticket' }]);
  });
});

describe('compileSkill', () => {
  it('puts id-bearing selectors behind the semantic candidates', () => {
    expect(
      stableFirst([
        { kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' },
        { kind: 'role', role: 'link', name: '{{v3}}' },
        { kind: 'css', selector: '#list > li:nth-of-type(3) > a' },
      ]),
    ).toEqual([
      { kind: 'role', role: 'link', name: '{{v3}}' },
      { kind: 'css', selector: '#list > li:nth-of-type(3) > a' },
      { kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' },
    ]);
    // nothing stable → order untouched
    expect(stableFirst([{ kind: 'id', selector: '#row-1042' }])).toEqual([{ kind: 'id', selector: '#row-1042' }]);
    // a link named by a record id goes behind a positional path; a parameterised name stays first
    expect(stableFirst([{ kind: 'role', role: 'link', name: 'RD-1017' }, { kind: 'css', selector: '#rows > tr:nth-of-type(1) > a' }])[0]).toEqual({
      kind: 'css',
      selector: '#rows > tr:nth-of-type(1) > a',
    });
    expect(stableFirst([{ kind: 'role', role: 'link', name: '{{v1}}' }, { kind: 'css', selector: 'a' }])[0].kind).toBe('role');
  });

  it('keeps the label on a target-less url read, so the flow can publish where a record lives', () => {
    const entries = [
      ...recording(),
      step('read', { what: 'url', label: 'ticket_url' }, [], { result: JSON.stringify(`${ORIGIN}/#/tickets/t15`) }),
    ];
    const urlReport = { ...report, evidence: { values: { ...report.evidence.values, ticket_url: `${ORIGIN}/#/tickets/t15` } } };
    const s = compileSkill({ entries, instruction: INSTRUCTION, report: urlReport, session: 's' })!;
    const last = s.steps.at(-1)!;
    expect(last.tool).toBe('read');
    expect(last.args.what).toBe('url');
    expect(last.locators).toEqual({});
    expect(last.label).toBe('ticket_url');
  });

  it('produces a parameterised, replayable skill from a recording', () => {
    const skill = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's', model: 'm', now: '2026-08-23T00:00:00Z' });
    expect(skill).toBeTruthy();
    const s = skill!;
    expect(s.origin).toBe(ORIGIN);
    expect(s.template).toContain("add a part named exactly '{{v1}}' with cost {{v2}} and markup {{v3}}");
    expect(s.preconditions.urlPattern).toBe(`${ORIGIN}/#/tickets/:id`);
    expect(s.preconditions.fingerprint).toEqual([1, 0, 0]);
    expect(Object.keys(s.params)).toEqual(['v1', 'v2', 'v3']);
    // step 5's alert expectation carries the slot too, but only args and
    // locators count as use (an expectation-only slot must not become a param)
    expect(s.params.v1).toEqual({ example: 'x7 RD Part A', usedIn: [2, 6, 7] });
    // args, locators and expectations all carry the slot
    expect(s.steps[1].args.value).toBe('{{v1}}');
    expect(s.steps[6].locators.target[0]).toEqual({ kind: 'css', selector: 'tr:has-text("{{v1}}") td.price' });
    expect(s.steps[4].expect?.alertContains).toBe('Part {{v1}} added');
    // ...and the price does NOT survive as a literal. 125.00 is the app's own
    // cost x markup, which step 6 reads and the report publishes as partPrice
    // — this recording's arithmetic, not a landmark. The suite says so itself
    // further down: the same skill run with v2=300/v3=40 publishes 375.00.
    // Frozen here it would assert the next run's total equals this one's (see
    // unfreezeExpectations / maskPublishedValues).
    expect(s.steps[4].expect?.addedContains).toEqual(['- row "{{v1}} {{v2}} {{v3}}% {{*}}"']);
    // a step that did not change the url still records where it left the browser
    expect(s.steps[0].expect?.urlPattern).toBe(`${ORIGIN}/#/tickets/:id`);
    // the read that supplied a report value is labelled with that key
    expect(s.steps[6].label).toBe('partPrice');
    expect(s.reportTemplate?.values).toEqual({ partName: '{{v1}}', partPrice: '125.00' });
    expect(s.status).toBe('provisional');
    expect(s.stats).toMatchObject({ uses: 1, successes: 1 });
  });
  it('strips inspection-only steps (eval, screenshot, unreported reads) but keeps actions and read-backs', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: INSTRUCTION, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0] },
      step('eval', { expression: 'document.querySelector("#f-title")' }),
      step('fill', { target: '@e10', value: 'x7 RD Part A' }, [{ kind: 'label', label: 'Name' }]),
      step('screenshot', { full_page: true }),
      step('read', { target: '#scratch', what: 'text' }, [{ kind: 'css', selector: '#scratch' }], { result: '"nobody reports this"' }),
      step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: '#price' }], { result: '"125.00"' }),
    ];
    const s = compileSkill({ entries, instruction: INSTRUCTION, report, session: 's' })!;
    const tools = s.steps.map((st) => st.tool);
    expect(tools).not.toContain('eval');
    expect(tools).not.toContain('screenshot');
    expect(tools).toEqual(['fill', 'read']); // the fill action + the read-back that supplies partPrice
    expect(s.steps[1].args.target).toBe('(read-back)');
  });
  it('drops slots no step uses, and returns null with nothing to replay', () => {
    const entries: RecordedEntry[] = [{ k: 'instruction', text: 'open the list', url: `${ORIGIN}/` }];
    expect(compileSkill({ entries, instruction: 'open the list', report, session: 's' })).toBeNull();
  });
});

describe('SkillStore', () => {
  const mk = (template: string, extra: Partial<Skill> = {}): Skill => ({
    id: 's_' + Math.random().toString(16).slice(2, 8),
    origin: ORIGIN,
    template,
    params: {},
    preconditions: { urlPattern: `${ORIGIN}/#/tickets/:id` },
    steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Go' }] } }],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional',
    provenance: { session: 's', instruction: template, created: 't' },
    ...extra,
  });

  it('persists per origin and round-trips', () => {
    const store = new SkillStore(path.join(tmp, 'a'));
    const s = mk('do a thing');
    store.put(s);
    expect(store.list(ORIGIN).map((x) => x.id)).toEqual([s.id]);
    expect(store.get(s.id)?.template).toBe('do a thing');
    expect(store.origins()).toEqual([ORIGIN]);
    expect(store.remove(s.id)).toBe(true);
    expect(store.all()).toEqual([]);
    expect(originOf('file:///C:/x.html')).toBe('file://');
  });

  /**
   * C03. Promotion is a claim that the procedure has been SEEN to work. A
   * replay whose effect evidence could not be captured is neither a success
   * nor a strike: its required expectations were still checked against the
   * live page, so it is not a failure, but nobody watched it do anything, so
   * it cannot be one of the two clean replays that promote.
   */
  it('does not promote on a replay whose evidence could not be observed', () => {
    const store = new SkillStore(path.join(tmp, 'unobserved'));
    const s = mk('prove me');
    store.put(s);

    const before = s.stats.successes; // one from the recording itself
    const blind = store.recordOutcome(s.id, { ok: true, instructionSucceeded: true, unobserved: 2 })!;
    expect(blind.status).toBe('provisional');
    expect(blind.stats.successes).toBe(before); // did not advance promotion
    expect(blind.stats.uses).toBe(2); // but it did happen, and is counted
    expect(blind.stats.unobserved).toBe(2);
    expect(blind.stats.partial).toBe(0); // and is not a strike: nothing failed

    // The next genuinely observed replay promotes, on its own merit.
    const promoted = store.recordOutcome(s.id, { ok: true, instructionSucceeded: true })!;
    expect(promoted.status).toBe('validated');
    expect(promoted.stats.successes).toBe(before + 1);
    expect(promoted.stats.unobserved).toBe(2);
  });

  /**
   * C09. The slug dropped the scheme, so http and https on the same host
   * shared one store file and each was offered the other's procedures.
   */
  it('keeps http and https on one host in separate stores', () => {
    expect(originSlug('http://127.0.0.1:4180')).toBe('http_127.0.0.1_4180');
    expect(originSlug('https://app.example.com')).toBe('https_app.example.com');
    expect(originSlug('http://app.example.com')).not.toBe(originSlug('https://app.example.com'));
    expect(originSlug('file://')).toBe('file');

    const store = new SkillStore(path.join(tmp, 'schemes'));
    const insecure = { ...mk('over http'), id: 's_http', origin: 'http://app.example.com' };
    const secure = { ...mk('over https'), id: 's_https', origin: 'https://app.example.com' };
    store.put(insecure);
    store.put(secure);
    expect(store.list('http://app.example.com').map((s) => s.id)).toEqual(['s_http']);
    expect(store.list('https://app.example.com').map((s) => s.id)).toEqual(['s_https']);
    expect(store.origins().sort()).toEqual(['http://app.example.com', 'https://app.example.com']);
  });

  /**
   * C09. Two writers adding different procedures to one origin used to race
   * through a whole-file array: each read the list before the other's write
   * and the later rename dropped the earlier record. A file per procedure
   * means the two writes never touch the same bytes.
   */
  it('does not lose a concurrent write of a different procedure', () => {
    const store = new SkillStore(path.join(tmp, 'concurrent'));
    const a = { ...mk('first'), id: 's_a' };
    const b = { ...mk('second'), id: 's_b' };
    // Both writers read the same (empty) state before either writes.
    const writerA = new SkillStore(store.dir);
    const writerB = new SkillStore(store.dir);
    expect(writerA.list(ORIGIN)).toEqual([]);
    expect(writerB.list(ORIGIN)).toEqual([]);
    writerA.put(a);
    writerB.put(b);
    expect(store.list(ORIGIN).map((s) => s.id).sort()).toEqual(['s_a', 's_b']);
  });

  /**
   * C09. A file that will not parse is not an empty store. Reporting it as
   * one let the next write replace the evidence with a valid empty list.
   */
  it('reports a corrupt procedure file instead of reading it as absent', () => {
    const dir = path.join(tmp, 'corrupt');
    const store = new SkillStore(dir);
    store.put(mk('good'));
    const bad = path.join(dir, originSlug(ORIGIN), 'broken.json');
    fs.writeFileSync(bad, '{ not json');
    const reader = new SkillStore(dir);
    expect(reader.list(ORIGIN).map((s) => s.template)).toEqual(['good']);
    expect(reader.corrupt).toEqual([bad]);
    expect(fs.readFileSync(bad, 'utf8')).toBe('{ not json');
  });

  /**
   * A sitemap lives in the origin directory, parses cleanly and carries an
   * origin but no id — so the shape gate filed it as corrupt on every read,
   * for every origin anyone had ever browsed. A permanent entry on a list
   * whose whole purpose is "this is a thing to look at".
   */
  it('does not mistake the sitemap beside the procedures for a corrupt one', () => {
    const dir = path.join(tmp, 'sibling');
    const store = new SkillStore(dir);
    store.put(mk('good'));
    fs.writeFileSync(path.join(dir, originSlug(ORIGIN), SITEMAP_FILE), JSON.stringify({ version: 1, origin: ORIGIN, pages: {} }));
    const reader = new SkillStore(dir);
    expect(reader.list(ORIGIN).map((s) => s.template)).toEqual(['good']);
    expect(reader.corrupt).toEqual([]);
  });

  /**
   * Invariant 8. A procedure from a build that reads further than this one
   * may use fields this engine has never heard of — or, worse because it is
   * silent, fields it knows by name and reads differently. It is intact and
   * it is not ours to run.
   */
  it('refuses a procedure written by a newer build, and says so rather than dropping it', () => {
    const dir = path.join(tmp, 'future');
    const store = new SkillStore(dir);
    store.put(mk('ours'));
    const theirs = { ...mk('theirs'), id: 's_future', contract: SKILL_CONTRACT + 1 };
    fs.writeFileSync(path.join(dir, originSlug(ORIGIN), 's_future.json'), JSON.stringify(theirs, null, 1));

    const reader = new SkillStore(dir);
    expect(reader.list(ORIGIN).map((s) => s.id)).toEqual([store.all()[0].id]);
    expect(reader.get('s_future')).toBeNull();
    // Not corrupt — it parsed perfectly. A separate channel, and one that
    // names the version, because "not found" would send someone looking for
    // a file that is sitting right there.
    expect(reader.corrupt).toEqual([]);
    expect(reader.unreadable).toHaveLength(1);
    expect(reader.unreadable[0]).toMatchObject({ id: 's_future', contract: SKILL_CONTRACT + 1 });
    expect(reader.unreadable[0].why).toMatch(new RegExp(`contract ${SKILL_CONTRACT + 1}`));
  });

  /**
   * The other half of invariant 8: a procedure promoted by an older engine
   * was promoted by rules this one no longer follows (it could retry a click,
   * skip a step whose dialog was absent, pass a gate it never observed). The
   * status stands in the file as a true record; it is simply not evidence
   * about this engine until re-earned.
   */
  it('does not treat a validated status from an older contract as verification', () => {
    const current: Skill = { ...mk('current'), contract: SKILL_CONTRACT, status: 'validated' };
    current.stats = { ...current.stats, verifiedContract: SKILL_CONTRACT };
    expect(isVerified(current)).toBe(true);

    // Legacy: no contract, no verifiedContract — reads as 1 and 1, so its own
    // validation is intact. Nothing retroactively distrusts old stores.
    const legacy: Skill = { ...mk('legacy'), status: 'validated' };
    expect(contractOf(legacy)).toBe(1);
    expect(isVerified(legacy)).toBe(true);

    // Promoted under 1, carried into a procedure now written at 2.
    const stale: Skill = { ...mk('stale'), contract: SKILL_CONTRACT, status: 'validated' };
    stale.stats = { ...stale.stats, verifiedContract: 1 };
    expect(isVerified(stale)).toBe(false);
    // ...and the file is untouched by that judgement.
    expect(stale.status).toBe('validated');
    expect(stale.stats.successes).toBe(1);
  });

  it('stamps the contract that earned a promotion', () => {
    const store = new SkillStore(path.join(tmp, 'earned'));
    const s = { ...mk('promote me'), contract: SKILL_CONTRACT };
    delete s.stats.verifiedContract;
    store.put(s);
    const after = store.recordOutcome(s.id, { ok: true, instructionSucceeded: true });
    expect(after?.status).toBe('validated');
    expect(after?.stats.verifiedContract).toBe(SKILL_CONTRACT);
    expect(isVerified(after!)).toBe(true);
  });

  /**
   * C09. A legacy whole-file store is still readable, split by the origin
   * each entry CARRIES — the old filename had dropped the scheme, so one
   * file can hold both. Reading never rewrites it: such a file may be a
   * committed artifact (an exported bench store, a pinned bundle).
   */
  it('reads a legacy per-origin file, splitting it by each entry\'s own origin', () => {
    const dir = path.join(tmp, 'legacy');
    fs.mkdirSync(dir, { recursive: true });
    const legacy = path.join(dir, 'app.example.com.json');
    const insecure = { ...mk('over http'), id: 's_http', origin: 'http://app.example.com' };
    const secure = { ...mk('over https'), id: 's_https', origin: 'https://app.example.com' };
    const before = JSON.stringify([insecure, secure], null, 1);
    fs.writeFileSync(legacy, before);

    const store = new SkillStore(dir);
    expect(store.list('http://app.example.com').map((s) => s.id)).toEqual(['s_http']);
    expect(store.list('https://app.example.com').map((s) => s.id)).toEqual(['s_https']);
    expect(store.origins().sort()).toEqual(['http://app.example.com', 'https://app.example.com']);
    expect(fs.readFileSync(legacy, 'utf8')).toBe(before);

    // A put migrates that one procedure; the per-procedure copy then wins.
    store.put({ ...secure, template: 'edited' });
    expect(store.list('https://app.example.com').map((s) => s.template)).toEqual(['edited']);
    expect(store.all()).toHaveLength(2);

    // Delete is the one operation that may edit the legacy file.
    expect(store.remove('s_http')).toBe(true);
    expect(store.list('http://app.example.com')).toEqual([]);
  });

  it('promotes on the second clean replay and demotes on two strikes at one step', () => {
    const store = new SkillStore(path.join(tmp, 'b'));
    const s = mk('promote me');
    store.put(s);
    expect(store.recordOutcome(s.id, { ok: true, instructionSucceeded: true })?.status).toBe('validated');
    // a success inside a failed instruction does not count as a success
    const t = mk('strict');
    store.put(t);
    expect(store.recordOutcome(t.id, { ok: true, instructionSucceeded: false })?.stats.successes).toBe(1);
    // same step failing twice in a row → demoted; a different step resets the strike
    const d = mk('demote me');
    store.put(d);
    store.recordOutcome(d.id, { ok: false, failedAt: 3, instructionSucceeded: true });
    expect(store.get(d.id)?.status).toBe('provisional');
    store.recordOutcome(d.id, { ok: false, failedAt: 2, instructionSucceeded: true });
    expect(store.get(d.id)?.status).toBe('provisional');
    store.recordOutcome(d.id, { ok: false, failedAt: 2, instructionSucceeded: false });
    expect(store.get(d.id)?.status).toBe('demoted');
    expect(store.get(d.id)?.stats.failedAtStep).toEqual({ '3': 1, '2': 2 });
  });

  /**
   * fwod49. A stop the step's own outcome proved harmless — the instruction
   * succeeded and nothing changed the page after the procedure stopped, so the
   * interrupted gesture was never redone — says nothing about the procedure.
   * s_32409f was demoted by two such stops over a flow that passed both runs,
   * and the demoted pin then refused the compile.
   */
  it('a stop the step proved harmless is inconclusive, not a strike', () => {
    const store = new SkillStore(path.join(tmp, 'harmless'));
    const h = mk('harmless stops');
    store.put(h);
    store.recordOutcome(h.id, { ok: false, failedAt: 1, instructionSucceeded: true, harmlessStop: true });
    store.recordOutcome(h.id, { ok: false, failedAt: 1, instructionSucceeded: true, harmlessStop: true });
    const after = store.get(h.id)!;
    expect(after.status).toBe('provisional'); // two of them: still not demoted
    // …and the write path stays honest: the stops happened and are counted.
    expect(after.stats.partial).toBe(2);
    expect(after.stats.failedAtStep).toEqual({ '1': 2 });
    expect(after.stats.harmlessStops).toBe(2);
    expect(after.stats.recoveredStops).toBe(2);
    expect(after.stats.successes).toBe(1); // unchanged by them (one from the recording)
    expect(after.stats.lastFailedAt).toBeUndefined();

    // A genuinely broken step still demotes on its second real strike.
    store.recordOutcome(h.id, { ok: false, failedAt: 1, instructionSucceeded: false });
    expect(store.get(h.id)?.status).toBe('provisional');
    store.recordOutcome(h.id, { ok: false, failedAt: 1, instructionSucceeded: false });
    expect(store.get(h.id)?.status).toBe('demoted');
  });

  it('a harmless stop neither demotes nor forgives an earlier strike', () => {
    const store = new SkillStore(path.join(tmp, 'harmless-streak'));
    const h = mk('streak');
    store.put(h);
    store.recordOutcome(h.id, { ok: false, failedAt: 2, instructionSucceeded: false });
    store.recordOutcome(h.id, { ok: false, failedAt: 2, instructionSucceeded: true, harmlessStop: true });
    expect(store.get(h.id)?.status).toBe('provisional');
    expect(store.get(h.id)?.stats.lastFailedAt).toBe(2); // the real strike still stands
    store.recordOutcome(h.id, { ok: false, failedAt: 2, instructionSucceeded: false });
    expect(store.get(h.id)?.status).toBe('demoted');
    // Only the strikes the instruction survived count as recovered.
    expect(store.get(h.id)?.stats.recoveredStops).toBe(1);
    expect(store.get(h.id)?.stats.harmlessStops).toBe(1);
  });

  it('counts a recovered stop even when it strikes, so the demoted-pin diagnostic can say so', () => {
    const store = new SkillStore(path.join(tmp, 'recovered'));
    const r = mk('recovered stops');
    store.put(r);
    store.recordOutcome(r.id, { ok: false, failedAt: 1, instructionSucceeded: true });
    store.recordOutcome(r.id, { ok: false, failedAt: 1, instructionSucceeded: true });
    const after = store.get(r.id)!;
    expect(after.status).toBe('demoted'); // the work WAS redone: a real strike, twice
    expect(after.stats.recoveredStops).toBe(2);
    expect(after.stats.harmlessStops).toBeUndefined();
  });

  it('lists candidates for a page: validated first, demoted never, wrong page never', () => {
    const v = mk('validated one', { status: 'validated', stats: { uses: 4, successes: 4, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 } });
    const p = mk('provisional one');
    const d = mk('demoted one', { status: 'demoted' });
    const elsewhere = mk('other page', { preconditions: { urlPattern: `${ORIGIN}/#/settings` } });
    const list = candidatesFor([p, d, elsewhere, v], `${ORIGIN}/#/tickets/t42`);
    expect(list.map((s) => s.template)).toEqual(['validated one', 'provisional one']);
    const text = renderCandidates(list);
    expect(text).toContain('[skills]');
    expect(text).toContain('validated 4/4');
    expect(text).toContain('unverified');
  });
});

describe('learnFromInstruction', () => {
  const result = (status: 'success' | 'failure', skill?: InstructionResult['skill']): InstructionResult => ({
    report: { ...report, status },
    turns: 3,
    usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
    screenshots: [],
    ...(skill ? { skill } : {}),
  });
  const noSkill = { listed: [], stepsReplayed: 0, stepsTotal: 0, repaired: false, refused: false, fallthroughs: 0, similarity: null, deterministicActions: 0, totalActions: 5 };

  it('compiles on success, merges the same template on the next run, never compiles a failure', () => {
    const store = new SkillStore(path.join(tmp, 'c'));
    const first = learnFromInstruction(store, { result: result('success', noSkill), instruction: INSTRUCTION, entries: recording(), session: 's', now: '2026-01-01T00:00:00Z' });
    expect(first?.compiled).toBeTruthy();
    expect(store.all()).toHaveLength(1);

    // a second run on a different runid: same template → merged and promoted
    const again = INSTRUCTION.replaceAll('x7', 'q2');
    const entries = JSON.parse(JSON.stringify(recording()).replaceAll('x7', 'q2')) as RecordedEntry[];
    const second = learnFromInstruction(store, { result: result('success', noSkill), instruction: again, entries, session: 's', now: '2026-01-02T00:00:00Z' });
    expect(second?.merged).toBe(first!.compiled);
    expect(store.all()).toHaveLength(1);
    expect(store.get(first!.compiled!)?.status).toBe('validated');

    expect(learnFromInstruction(store, { result: result('failure', noSkill), instruction: 'x', entries: recording(), session: 's' })).toBeNull();
    expect(store.all()).toHaveLength(1);
  });

  it('records a full replay as an outcome without compiling, and a repair as a variant', () => {
    const store = new SkillStore(path.join(tmp, 'd'));
    const base = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's', now: '2026-01-01T00:00:00Z' })!;
    store.put(base);

    const full = learnFromInstruction(store, {
      result: result('success', { ...noSkill, invoked: base.id, stepsReplayed: 7, stepsTotal: 7, deterministicActions: 7, totalActions: 7 }),
      instruction: INSTRUCTION,
      entries: recording(),
      session: 's',
    });
    expect(full).toEqual({ outcome: { skill: base.id, status: 'validated', ok: true } });
    expect(store.all()).toHaveLength(1);

    // replay stopped at step 5, agent finished: variant stored, original's failure counted
    const repaired = learnFromInstruction(store, {
      result: result('success', { ...noSkill, invoked: base.id, stepsReplayed: 4, stepsTotal: 7, repaired: true, deterministicActions: 4, totalActions: 7 }),
      instruction: INSTRUCTION,
      entries: recording(),
      session: 's',
      now: '2026-01-03T00:00:00Z',
    });
    expect(repaired?.compiled).toBeTruthy();
    expect(repaired?.variantOf).toBe(base.id);
    expect(store.get(base.id)?.stats.failedAtStep).toEqual({ '5': 1 });
    const variant = store.get(repaired!.compiled!)!;
    expect(variant.variantOf).toBe(base.id);

    // once the variant validates, it supersedes the original
    const promoted = learnFromInstruction(store, {
      result: result('success', { ...noSkill, invoked: variant.id, stepsReplayed: 7, stepsTotal: 7 }),
      instruction: INSTRUCTION,
      entries: recording(),
      session: 's',
    });
    expect(promoted?.superseded).toBe(base.id);
    expect(store.get(base.id)?.status).toBe('demoted');
    expect(store.get(variant.id)?.status).toBe('validated');
  });

  /**
   * fwod49: only the caller that watched the recovery can know a stop was
   * harmless, so it passes the fact in and learning hands it to the store
   * unchanged — the same repair that would otherwise have struck the skill
   * twice leaves it provisional, and the stop is still recorded.
   */
  it('passes a harmless stop through to the store, so it is not a strike', () => {
    const store = new SkillStore(path.join(tmp, 'harmless-learn'));
    const base = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's', now: '2026-01-01T00:00:00Z' })!;
    store.put(base);
    const stopped = { ...noSkill, invoked: base.id, stepsReplayed: 0, stepsTotal: 7, repaired: true, deterministicActions: 0, totalActions: 7 };
    for (const now of ['2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z']) {
      learnFromInstruction(store, { result: result('success', stopped), instruction: INSTRUCTION, entries: recording(), session: 's', now, harmlessStop: true });
    }
    expect(store.get(base.id)?.status).toBe('provisional');
    expect(store.get(base.id)?.stats.harmlessStops).toBe(2);
    expect(store.get(base.id)?.stats.failedAtStep).toEqual({ '1': 2 });

    // Without the flag the same two stops demote, as before.
    const other = { ...base, id: 's_other' };
    store.put(other);
    for (const now of ['2026-01-04T00:00:00Z', '2026-01-05T00:00:00Z']) {
      learnFromInstruction(store, { result: result('success', { ...stopped, invoked: other.id }), instruction: INSTRUCTION, entries: recording(), session: 's', now });
    }
    expect(store.get(other.id)?.status).toBe('demoted');
  });

  /**
   * fwkb21. A repair-born skill used to be stored WITHOUT asking whether the
   * store already held it, so its `uses`/`successes` stayed at 1 whatever it
   * did — and `successes >= 2` is the only promotion route open to it, the
   * replay route being shut by selectCandidates ranking validated first.
   * kanboard's three correct board-reading procedures each sat at 1/1 across
   * three runs for exactly that reason.
   */
  it('a second repair that re-finds an earlier variant of the same parent merges into it and promotes it (fwkb21)', () => {
    const store = new SkillStore(path.join(tmp, 'variant-twin'));
    const base = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's', now: '2026-01-01T00:00:00Z' })!;
    store.put(base);
    const stopped = { ...noSkill, invoked: base.id, stepsReplayed: 4, stepsTotal: 7, repaired: true, deterministicActions: 4, totalActions: 7 };
    const repair = (now: string) =>
      learnFromInstruction(store, { result: result('success', stopped), instruction: INSTRUCTION, entries: recording(), session: 's', now });

    const first = repair('2026-01-02T00:00:00Z');
    const variant = first!.compiled!;
    expect(store.get(variant)?.variantOf).toBe(base.id);
    expect(store.get(variant)?.status).toBe('provisional');

    // The same repair again: recognised, not re-minted.
    const second = repair('2026-01-03T00:00:00Z');
    expect(second?.compiled).toBeUndefined();
    expect(second?.merged).toBe(variant);
    expect(store.all().filter((s) => s.variantOf === base.id)).toHaveLength(1);
    // The second observation is what it was missing: it can now be trusted.
    expect(store.get(variant)?.stats.uses).toBe(2);
    expect(store.get(variant)?.stats.successes).toBe(2);
    expect(store.get(variant)?.status).toBe('validated');
  });

  /**
   * The scope of the search above, pinned: two repairs of DIFFERENT parents
   * are two different procedures' repairs however alike their steps read.
   * Their provenance says so and their shape does not get a vote.
   */
  it('a variant is never a twin of a variant of another parent', () => {
    const store = new SkillStore(path.join(tmp, 'variant-family'));
    const one = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's', now: '2026-01-01T00:00:00Z' })!;
    const two = { ...JSON.parse(JSON.stringify(one)) as Skill, id: 's_parent2' };
    store.put(one);
    store.put(two);
    const stopAt = (id: string) => ({ ...noSkill, invoked: id, stepsReplayed: 4, stepsTotal: 7, repaired: true, deterministicActions: 4, totalActions: 7 });

    const a = learnFromInstruction(store, { result: result('success', stopAt(one.id)), instruction: INSTRUCTION, entries: recording(), session: 's', now: '2026-01-02T00:00:00Z' });
    const b = learnFromInstruction(store, { result: result('success', stopAt(two.id)), instruction: INSTRUCTION, entries: recording(), session: 's', now: '2026-01-03T00:00:00Z' });
    expect(a?.compiled).toBeTruthy();
    expect(b?.merged).toBeUndefined();
    expect(b?.compiled).toBeTruthy();
    expect(b!.compiled).not.toBe(a!.compiled);
    expect(store.get(a!.compiled!)?.variantOf).toBe(one.id);
    expect(store.get(b!.compiled!)?.variantOf).toBe(two.id);
  });

  /**
   * fwkb21's latent hazard, which only bites once variants can reach
   * validated: a flow step's pin is a HINT, so one step's instruction can
   * select and repair ANOTHER step's procedure. kanboard's `02-open` stopped
   * `01-open`'s eleven-step sign-in chain at its second step (already signed
   * in) and compiled a board-reading variant of it. That variant retiring the
   * sign-in chain would leave `01-open` with no procedure and refuse the
   * whole flow's compile.
   */
  it('a validated variant answering a different instruction does not retire the parent it repaired (fwkb21)', () => {
    const store = new SkillStore(path.join(tmp, 'supersede-guard'));
    const base = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's', now: '2026-01-01T00:00:00Z' })!;
    store.put(base);
    const variantOf = (id: string, template: string): Skill => ({
      ...(JSON.parse(JSON.stringify(base)) as Skill),
      id,
      template,
      status: 'provisional',
      variantOf: base.id,
    });
    // Born repairing `base` under ANOTHER step's instruction.
    const elsewhere = variantOf('s_elsewhere', "Open the board of the project named 'Bench Board' and report its columns.");
    store.put(elsewhere);
    const clean = (id: string) =>
      learnFromInstruction(store, {
        result: result('success', { ...noSkill, invoked: id, stepsReplayed: 7, stepsTotal: 7, deterministicActions: 7, totalActions: 7 }),
        instruction: INSTRUCTION,
        entries: recording(),
        session: 's',
        now: '2026-01-04T00:00:00Z',
      });

    const promoted = clean(elsewhere.id);
    expect(promoted?.outcome).toEqual({ skill: elsewhere.id, status: 'validated', ok: true });
    expect(promoted?.superseded).toBeUndefined();
    expect(store.get(base.id)?.status).toBe('provisional'); // still selectable, still compilable

    // The case supersede exists for is untouched: same instruction, same work.
    const replacement = variantOf('s_replacement', base.template);
    store.put(replacement);
    expect(clean(replacement.id)?.superseded).toBe(base.id);
    expect(store.get(base.id)?.status).toBe('demoted');
  });
});

/**
 * The flow runner is the only place that can establish a harmless stop: it
 * holds the replay's resume point and the recording of everything the repair
 * did afterwards. Source level, because runFlow needs a live browser.
 */
describe('runFlow decides a harmless stop from the recovery it watched (fwod49)', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/daemon/server.ts'), 'utf8');

  it('marks the resume point before recovery and asks what the repair cost', () => {
    expect(source).toMatch(/const replayMark = this\.browser\.script\?\.mark\(\) \?\? mark;/);
    const region = source.slice(source.indexOf('const judgeFrom ='), source.indexOf('const learned = learnFromInstruction'));
    expect(region).toMatch(/result\.report\.status === 'success'/);
    // Judged from the resume point, over the entries of the whole step: a
    // gesture is judged against the url it STARTED on, which only the
    // replay's own entries before the stop can establish (fwod51).
    expect(region).toMatch(/replayMark - mark/);
    expect(region).toMatch(/recoveryEntries\.entries\(\)/);
    expect(region).toMatch(/urlWas = e\.diff\?\.url \?\? urlWas;/);
    // The cost is the shared predicate's question, never a vocabulary of
    // tool names: `isMutatingAction(e.tool)` here read fwod51's read-only
    // recovery as a mutation because it could only reach the record by
    // clicking.
    expect(region).toMatch(/observedChange\(e, urlWas\)/);
    expect(region).not.toMatch(/isMutatingAction\(e\.tool\)/);
    expect(region).toMatch(/&& !costlyRepair/); // …and it is the ABSENCE of a cost
  });

  it('hands the fact to learning, which is what records the outcome', () => {
    const call = source.slice(source.indexOf('const learned = learnFromInstruction'), source.indexOf('const outcome = learned?.outcome;'));
    expect(call).toMatch(/\bharmlessStop,/);
  });

  /**
   * The evidence half of "a read that has never resolved does not publish"
   * (fwkb14, fwod52). A synthesized read is marked where it is BUILT
   * (flow.ts liveReadsFor) and can only be unmarked where a run's outcome is
   * recorded — which is here, beside the retirement that already reads this
   * step's cross-run evidence. Source level for the same reason as above.
   */
  it('settles the synthesized reads on the chain from what the run just observed', () => {
    // Alongside the existing retirement, on the same success-only branch: a
    // blocked step's values say how far it got, not what the page shows.
    const after = source.slice(source.indexOf('this.retireDeadReadLocators(flow, step, opts.progress);'));
    expect(after.slice(0, 200)).toMatch(/this\.settleUnprovenReads\(flow, step, opts\.progress\);/);
    const region = source.slice(source.indexOf('private settleUnprovenReads('), source.indexOf('Everything of this run\'s that survived'));
    // Proven on the first value that comes back; retired only after a SECOND
    // absent run, the same run-1-proposes / run-2-decides shape as its sibling.
    expect(region).toMatch(/ev\.same \+ ev\.differed > 0/);
    expect(region).toMatch(/\(ev\.absent \?\? 0\) >= 2/);
    expect(region).toMatch(/markReadsProven\(copy\.steps, proven\)/);
    expect(region).toMatch(/dropAbsentReadLocators\(copy\.steps, absent\)/);
    // The whole chain: a synthesized read sits on its LAST segment.
    expect(region).toMatch(/s\.seq\?\.chain === pinned\.seq!\.chain/);
  });
});

/**
 * What a recovery gesture COST, which is what decides whether the stop before
 * it was a strike (src/execution/lifecycle.ts). fwod51: 07-verify is a
 * READ-ONLY instruction, the url gate correctly refused a click that had
 * overshot onto a sales-order list, recovery finished the step both times and
 * both mutation logs were empty — yet each stop struck, two strikes demoted
 * the skill and the compile refused the flow, because the question asked was
 * `isMutatingAction('click')`.
 */
describe('observedChange: a gesture costs something only when the run observed it (fwod51)', () => {
  const ODOO_LIST = 'http://app.test/web#action=330&active_id=45&cids=1&menu_id=109&model=sale.order&view_type=list';
  const ODOO_FORM = 'http://app.test/web#action=156&cids=1&id=45&menu_id=109&model=res.partner&view_type=form';
  const quiet = (url: string) => ({ url, alerts: [], added: [] });

  it('never counts a tool that cannot change anything, whatever it observed', () => {
    for (const tool of ['read', 'read_all', 'goto', 'back', 'wait_for', 'screenshot']) {
      expect(observedChange({ tool, diff: { url: ODOO_FORM, alerts: ['Saved'], added: ['+ Contact created'] } }, ODOO_LIST)).toBe(false);
    }
  });

  it('counts content left on a page the gesture stayed on, and nothing when the page did not react', () => {
    expect(observedChange({ tool: 'click', diff: { ...quiet(ODOO_FORM), added: ['- dialog "Discard"'] } }, ODOO_FORM)).toBe(true);
    expect(observedChange({ tool: 'fill', diff: { ...quiet(ODOO_FORM), alerts: ['Record saved'] } }, ODOO_FORM)).toBe(true);
    expect(observedChange({ tool: 'click', diff: quiet(ODOO_FORM) }, ODOO_FORM)).toBe(false);
  });

  /** The fwod51 gesture itself: a click that could only reach the record by moving to it. */
  it('never counts a move from one page to another, however many lines the landing brought', () => {
    const landing = { url: ODOO_FORM, alerts: [], added: ['+ Name fwod51-n2 Bench Customer', '+ City Benchville'] };
    expect(observedChange({ tool: 'click', diff: landing }, ODOO_LIST)).toBe(false);
    // …and back the other way, where the url LOSES the record it named.
    expect(observedChange({ tool: 'click', diff: quiet(ODOO_LIST) }, ODOO_FORM)).toBe(false);
    // A path that grew a segment is a different page shape, not a mint.
    expect(observedChange({ tool: 'click', diff: quiet('http://app.test/orders/42') }, 'http://app.test/orders')).toBe(false);
  });

  it('counts a record identifier minted into the url where the page stayed the same', () => {
    // The draft saved: the same view, one position that had no id and now has one.
    expect(observedChange({ tool: 'click', diff: quiet('http://app.test/orders/42') }, 'http://app.test/orders/new')).toBe(true);
    expect(observedChange({ tool: 'click', diff: quiet('http://app.test/web#action=316&cids=1&id=22&model=sale.order&view_type=form') }, 'http://app.test/web#action=316&cids=1&model=sale.order&view_type=form')).toBe(true);
    // One record swapped for another is the app routing, not a mint.
    expect(observedChange({ tool: 'click', diff: quiet('http://app.test/orders/43') }, 'http://app.test/orders/42')).toBe(false);
    // A word changing beside it says the same: this is another view.
    expect(observedChange({ tool: 'click', diff: quiet('http://app.test/orders/42/edit') }, 'http://app.test/orders/new/edit')).toBe(true);
    expect(observedChange({ tool: 'click', diff: quiet('http://app.test/orders/42/edit') }, 'http://app.test/orders/new/view')).toBe(false);
  });

  it('stays conservative where the run has no evidence', () => {
    expect(observedChange({ tool: 'click' }, ODOO_FORM)).toBe(true);
    expect(observedChange({ tool: 'click' }, undefined)).toBe(true);
    // An unknown starting url cannot say the page moved; content decides.
    expect(observedChange({ tool: 'click', diff: { ...quiet(ODOO_FORM), added: ['+ Contact created'] } }, undefined)).toBe(true);
    expect(observedChange({ tool: 'click', diff: quiet(ODOO_FORM) }, undefined)).toBe(false);
  });
});

describe('zero-model template match', () => {
  it('binds params from a word-for-word instruction and refuses near misses', () => {
    const skill = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
    skill.status = 'validated';
    const same = INSTRUCTION.replaceAll('x7 RD Part A', 'z9 RD Part B').replace('cost 100', 'cost 300').replace('markup 25', 'markup 40');
    const m = matchTemplate([skill], same, `${ORIGIN}/#/tickets/t77`);
    expect(m?.params).toEqual({ v1: 'z9 RD Part B', v2: '300', v3: '40' });
    // different wording → no match; provisional → no match; wrong page → no match
    expect(matchTemplate([skill], 'add a part named z9 with cost 300', `${ORIGIN}/#/tickets/t77`)).toBeNull();
    expect(matchTemplate([{ ...skill, status: 'provisional' }], same, `${ORIGIN}/#/tickets/t77`)).toBeNull();
    expect(matchTemplate([skill], same, `${ORIGIN}/#/settings`)).toBeNull();
  });
  it('synthesises a report from live read-backs, never from the stored value', () => {
    const skill = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
    const r = synthesizeReport(skill, { v1: 'z9 RD Part B', v2: '300', v3: '40' }, { partPrice: '375.00' });
    expect(r.status).toBe('success');
    expect(r.evidence?.values).toEqual({ partName: 'z9 RD Part B', partPrice: '375.00' });
    expect(r.summary).toContain('z9 RD Part B');
    expect(r.summary).toContain('375.00');
    expect(r.summary).not.toContain('125.00');
  });
  // fwod56 n2/n3: `07-change` published `line1_product: "{{03-create.product_name}}"`.
  // The param itself arrived still holding a flow reference the run never
  // resolved, and the residual test only looked for `{{vN}}`.
  it('never publishes a value or a sentence still holding an unresolved reference', () => {
    const skill = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
    const r = synthesizeReport(skill, { v1: '{{03-create.product_name}}', v2: '300', v3: '40' }, {});
    expect(JSON.stringify(r.evidence?.values ?? {})).not.toContain('{{');
    expect(r.evidence?.values?.partName).toBeUndefined();
    expect(r.summary).not.toContain('{{');
    expect(r.summary).toContain(skill.id);
    // a live read is still published alongside the dropped one
    const live = synthesizeReport(skill, { v1: '{{03-create.product_name}}', v2: '300', v3: '40' }, { partPrice: '375.00' });
    expect(live.evidence?.values).toEqual({ partPrice: '375.00' });
  });
  // fwgr56 07-report: every live value was the dashboard's whole JSON body,
  // which held every other recorded value; swapping them one after another
  // compounded the prose past the engine's string limit.
  it('rewrites the summary in one pass: a live value is never itself rewritten', () => {
    const base = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
    const skill = { ...base, reportTemplate: { summary: 'time now, tag bench, count 3', values: { t: 'now', g: 'bench', n: '3' } } };
    const r = synthesizeReport(skill, { v1: 'z9 RD Part B', v2: '300', v3: '40' }, { t: 'from now to bench', g: 'a bench of 3', n: '3 now' });
    expect(r.summary).toBe('time from now to bench, tag a bench of 3, count 3 now');

    const body = `{"time":{"from":"now","to":"now"},"tags":["bench"],"id":3,${'"pad":"x",'.repeat(200)}"n":3}`;
    const values = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i % 3 === 0 ? 'now' : i % 3 === 1 ? 'bench' : '3']));
    const live = Object.fromEntries(Object.keys(values).map((k) => [k, body]));
    const wide = synthesizeReport({ ...base, reportTemplate: { summary: 'time now, tag bench, count 3', values } }, {}, live);
    expect(wide.summary.length).toBeLessThan(4 * body.length);
  });

  it('sameProcedure compares tools and primary locators', () => {
    const a = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
    const b = compileSkill({ entries: recording(), instruction: 'totally different words x7 RD Part A 100 25', report, session: 's' })!;
    expect(sameProcedure(a, b)).toBe(true);
    expect(sameProcedure(a, { ...b, steps: b.steps.slice(1) })).toBe(false);
  });
});

describe('selectCandidates (lifecycle-gated adoption)', () => {
  const make = (status: Skill['status'], stats?: Partial<Skill['stats']>): Skill => {
    const s = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
    s.status = status;
    Object.assign(s.stats, stats);
    return { ...s, id: `s_${status}_${s.stats.uses}_${Math.abs(JSON.stringify(stats ?? {}).length)}` };
  };
  const same = INSTRUCTION.replaceAll('x7 RD Part A', 'z9 RD Part B').replace('cost 100', 'cost 300').replace('markup 25', 'markup 40');

  it('orders validated before provisional, excludes demoted, and never needs the hint', () => {
    const validated = make('validated', { uses: 4, successes: 4 });
    const provisional = make('provisional', { uses: 1, successes: 1 });
    const demoted = make('demoted', { uses: 5, successes: 5 });
    const out = selectCandidates([provisional, demoted, validated], undefined, same);
    expect(out.map((c) => c.skill.id)).toEqual([validated.id, provisional.id]);
    expect(out[0].params).toEqual({ v1: 'z9 RD Part B', v2: '300', v3: '40' });
  });

  it('a fragile pinned provisional does not outrank a proven validated sibling', () => {
    const original = make('validated', { uses: 4, successes: 4 });
    const pinnedVariant = make('provisional', { uses: 1, successes: 1 });
    const out = selectCandidates([pinnedVariant, original], pinnedVariant.id, same, { v1: 'z9 RD Part B', v2: '300', v3: '40' });
    expect(out[0].skill.id).toBe(original.id);
    expect(out[1].skill.id).toBe(pinnedVariant.id);
  });

  it('ranks by success rate within a status tier', () => {
    const shaky = make('validated', { uses: 4, successes: 2 });
    const solid = make('validated', { uses: 4, successes: 4 });
    const out = selectCandidates([shaky, solid], undefined, same);
    expect(out[0].skill.id).toBe(solid.id);
  });

  // kanboard fwkb21. One stored procedure served two flow steps and its stats
  // were one number for both: s_06c07b replayed 11/11 for `01-open` and
  // stopped at step 2 for `02-open` on every one of three runs (the browser is
  // already signed in, so the recorded Username field cannot appear). Pooled
  // that is `validated, 3/6`, and the validated-first tier put it ahead of
  // three provisional 1/1 procedures RECORDED answering 02-open's own
  // instruction — so 02-open re-picked a 0/3 procedure every round.
  //
  // The tier is an entitlement the pin cannot claim over a candidate whose own
  // recording reads over this instruction. The pin stays in the list; it just
  // competes on its record, which is the only evidence about this step.
  const verified = (s: Skill): Skill => {
    s.status = 'validated';
    s.stats.verifiedContract = contractOf(s);
    return s;
  };
  const pinOnly = (id: string, stats: Partial<Skill['stats']>): Skill => {
    // Recorded for a DIFFERENT instruction, so nothing of its own reads over
    // `same` — it is a candidate purely because the flow step pins it.
    const s = compileSkill({ entries: recording(), instruction: 'totally different words x7 RD Part A 100 25', report, session: 's' })!;
    Object.assign(s.stats, stats);
    return { ...verified(s), id };
  };
  const pinnedParams = { v1: 'z9 RD Part B', v2: '300', v3: '40' };

  it('a validated pin the instruction does not read over loses the tier to a candidate recorded for this instruction', () => {
    const pin = pinOnly('s_pooled', { uses: 6, successes: 3, partial: 3, failedAtStep: { '2': 3 }, lastFailedAt: 2, recoveredStops: 3 });
    const recorded = make('provisional', { uses: 1, successes: 1 });
    expect(isVerified(pin)).toBe(true);
    expect(bindSkill(pin, same, {})).toBeNull(); // the pin's own wording says nothing about this step
    expect(bindSkill(recorded, same, {})).not.toBeNull();
    const out = selectCandidates([pin, recorded], pin.id, same, pinnedParams);
    expect(out.map((c) => c.skill.id)).toEqual([recorded.id, pin.id]);
    // The pin is not excluded, and it still carries the flow's own bindings.
    expect(out[1].params).toEqual(pinnedParams);
  });

  it('still ranks the pin first on its record when it beats every candidate recorded for this instruction', () => {
    const pin = pinOnly('s_strong', { uses: 6, successes: 6 });
    const weak = make('provisional', { uses: 4, successes: 1 });
    expect(selectCandidates([pin, weak], pin.id, same, pinnedParams).map((c) => c.skill.id)).toEqual([pin.id, weak.id]);
  });

  // THE GUARD. A pin whose wording has drifted away from its step's
  // instruction is the ordinary case, not a fault: odoo fwod59 runs one on 6
  // steps of 6, repairdesk fwrd66 on 5 of 5, grafana fwgr51 on 1 of 3, and
  // kanboard's own `05-edit` on 1 of 5 — every one of them green. In all of
  // them the pin is the ONLY candidate, so there is nobody to hand the tier to
  // and the rule above must not fire. Demoting pin-only candidates as a class
  // would have regressed all four apps.
  it('leaves a lone pin the instruction does not read over exactly where it was', () => {
    const pin = pinOnly('s_lone', { uses: 3, successes: 3 });
    const unrelated = make('provisional', { uses: 9, successes: 9 });
    unrelated.template = 'nothing like this instruction {{v1}}';
    const out = selectCandidates([pin, unrelated], pin.id, same, pinnedParams);
    expect(out.map((c) => c.skill.id)).toEqual([pin.id]);
  });

  it('a sibling with the SAME wording inherits the pinned params', () => {
    const hint = make('provisional');
    const sibling = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
    sibling.status = 'validated';
    sibling.id = 's_sibling';
    const params = { v1: 'z9 RD Part B', v2: '300', v3: '40' };
    const out = selectCandidates([hint, sibling], hint.id, same, params);
    expect(out.map((c) => c.skill.id)).toEqual([sibling.id, hint.id]);
    expect(out[0].params).toEqual(params);
  });

  // fwrd48 07-create: a scratch-ticket skill and a bench-ticket skill were both
  // a single scoped click, so sameProcedure called them the same procedure. The
  // slots were inherited by NAME, so the scratch skill was handed the bench
  // ticket's title and reference, clicked the first row it found, and cost 28
  // model turns before a recorded expectation caught it. Unbound slots mean
  // whatever their own instruction cut them from: without the same wording
  // there is nothing that says they correspond, and guessing acts on the wrong
  // record. Refusing costs a model turn instead.
  it('a sameProcedure sibling with DIFFERENT wording does not inherit unbound slots', () => {
    const hint = make('provisional');
    const sibling = compileSkill({ entries: recording(), instruction: 'totally different words x7 RD Part A 100 25', report, session: 's' })!;
    sibling.status = 'validated';
    sibling.id = 's_other_wording';
    const params = { v1: 'z9 RD Part B', v2: '300', v3: '40' };
    const out = selectCandidates([hint, sibling], hint.id, same, params);
    expect(out.map((c) => c.skill.id)).toEqual([hint.id]);
  });

  it('a differently-worded sibling still inherits a slot that carries a binding, by that binding', () => {
    const hint = make('provisional');
    const sibling = compileSkill({ entries: recording(), instruction: 'totally different words x7 RD Part A 100 25', report, session: 's' })!;
    sibling.status = 'validated';
    sibling.id = 's_bound';
    // Both sides agree v1 IS the earlier step's part name, so the value crosses
    // on that agreement rather than on the shared label "v1".
    hint.params.v1 = { ...hint.params.v1, binding: 'output:i2:part_name' };
    sibling.params.v1 = { ...sibling.params.v1, binding: 'output:i2:part_name' };
    for (const p of ['v2', 'v3'] as const) {
      hint.params[p] = { ...hint.params[p], binding: `var:${p}` };
      sibling.params[p] = { ...sibling.params[p], binding: `var:${p}` };
    }
    const params = { v1: 'z9 RD Part B', v2: '300', v3: '40' };
    const out = selectCandidates([hint, sibling], hint.id, same, params);
    expect(out.map((c) => c.skill.id)).toEqual([sibling.id, hint.id]);
    expect(out[0].params).toEqual(params);
  });

  // fwod56: `10-verify`'s pin was the head of a five-segment chain; `02-create`'s
  // head was a four-segment chain that creates a contact. Both heads are the
  // same shape, so `sameProcedure` said yes, the create head was validated where
  // the verify head was provisional, it sorted first — and the daemon's chain
  // walk ran the rest of ITS chain and minted a second contact, while the flow
  // reported success 10/10. A head is not the procedure; the chain is.
  describe('a chain head is compared as its whole chain', () => {
    // A differently-worded sibling that can only reach the step through
    // inheritance, with every slot bound so inheritance would otherwise succeed.
    const pair = (): { hint: Skill; sibling: Skill } => {
      const hint = make('provisional');
      const sibling = compileSkill({ entries: recording(), instruction: 'totally different words x7 RD Part A 100 25', report, session: 's' })!;
      sibling.status = 'validated';
      sibling.id = 's_sibling_head';
      hint.params.v1 = { ...hint.params.v1, binding: 'output:i2:part_name' };
      sibling.params.v1 = { ...sibling.params.v1, binding: 'output:i2:part_name' };
      for (const p of ['v2', 'v3'] as const) {
        hint.params[p] = { ...hint.params[p], binding: `var:${p}` };
        sibling.params[p] = { ...sibling.params[p], binding: `var:${p}` };
      }
      return { hint, sibling };
    };
    const seg = (id: string, chain: string, index: number, of: number, steps?: SkillStep[]): Skill => {
      const s = compileSkill({ entries: recording(), instruction: INSTRUCTION, report, session: 's' })!;
      return { ...s, id, status: 'validated', seq: { chain, index, of }, ...(steps ? { steps } : {}) };
    };
    const params = { v1: 'z9 RD Part B', v2: '300', v3: '40' };
    const chain = (s: Skill, c: string, of: number): Skill => ({ ...s, seq: { chain: c, index: 0, of } });

    it('refuses a sibling whose chain is a different length (the fwod56 shape)', () => {
      const { hint, sibling } = pair();
      const h = chain(hint, 'c_verify', 5);
      const sib = chain(sibling, 'c_create', 4);
      const skills = [h, sib, seg('s_v1', 'c_verify', 1, 5), seg('s_c1', 'c_create', 1, 4)];
      expect(selectCandidates(skills, h.id, same, params).map((c) => c.skill.id)).toEqual([h.id]);
      expect(sameChainProcedure(sib, h, skills)).toBe(false);
    });

    it('refuses a sibling whose chain is the same length but whose segments differ', () => {
      const { hint, sibling } = pair();
      const h = chain(hint, 'c_h', 2);
      const sib = chain(sibling, 'c_s', 2);
      const tail = seg('s_h1', 'c_h', 1, 2);
      const skills = [h, sib, tail, seg('s_s1', 'c_s', 1, 2, tail.steps.slice(1))];
      expect(selectCandidates(skills, h.id, same, params).map((c) => c.skill.id)).toEqual([h.id]);
      expect(sameChainProcedure(sib, h, skills)).toBe(false);
    });

    it('refuses a sibling when a segment of either chain is missing from the store', () => {
      const { hint, sibling } = pair();
      const h = chain(hint, 'c_h', 2);
      const sib = chain(sibling, 'c_s', 2);
      const skills = [h, sib, seg('s_h1', 'c_h', 1, 2)];
      expect(selectCandidates(skills, h.id, same, params).map((c) => c.skill.id)).toEqual([h.id]);
      expect(sameChainProcedure(sib, h, skills)).toBe(false);
    });

    it('still accepts a sibling whose whole chain matches segment for segment', () => {
      const { hint, sibling } = pair();
      const h = chain(hint, 'c_h', 2);
      const sib = chain(sibling, 'c_s', 2);
      const skills = [h, sib, seg('s_h1', 'c_h', 1, 2), seg('s_s1', 'c_s', 1, 2)];
      const out = selectCandidates(skills, h.id, same, params);
      expect(out.map((c) => c.skill.id)).toEqual([sib.id, h.id]);
      expect(out[0].params).toEqual(params);
      expect(sameChainProcedure(sib, h, skills)).toBe(true);
    });

    it('refuses a chained sibling for an unchained hint, and the reverse', () => {
      const { hint, sibling } = pair();
      const sib = chain(sibling, 'c_s', 2);
      const skills = [hint, sib, seg('s_s1', 'c_s', 1, 2)];
      expect(selectCandidates(skills, hint.id, same, params).map((c) => c.skill.id)).toEqual([hint.id]);
      expect(sameChainProcedure(sib, hint, skills)).toBe(false);
      expect(sameChainProcedure(hint, sib, skills)).toBe(false);
    });

    it('leaves two unchained skills exactly as they were', () => {
      const { hint, sibling } = pair();
      const skills = [hint, sibling];
      expect(sameChainProcedure(sibling, hint, skills)).toBe(true);
      expect(selectCandidates(skills, hint.id, same, params).map((c) => c.skill.id)).toEqual([sibling.id, hint.id]);
    });
  });
});

describe('dropSupersededNavigation (fwod6: exploration recorded as procedure)', () => {
  const nav = (url: string): SkillStep => ({ tool: 'goto', args: { url }, locators: {} });
  const click = (): SkillStep => ({ tool: 'click', args: { target: '@e1' }, locators: {} });

  it('keeps only the last of a run of adjacent navigations', () => {
    // fwod6 step 01 recorded a hand-built "#action=&...&menu_id=" url followed
    // immediately by the url that actually landed.
    const out = dropSupersededNavigation([nav('/web'), nav('/web#action=&menu_id='), nav('/web?cids=1'), click()]);
    expect(out.map((s) => s.args.url ?? s.tool)).toEqual(['/web?cids=1', 'click']);
  });

  it('keeps a navigation that anything else follows — the page may be load-bearing', () => {
    const out = dropSupersededNavigation([nav('/login'), click(), nav('/home')]);
    expect(out.length).toBe(3);
  });
});

describe('canAdoptPin (a flow step may not adopt another step\'s procedure)', () => {
  const store = () => new SkillStore(path.join(tmp, `pin-${Math.random().toString(36).slice(2)}`));
  const put = (s: SkillStore, id: string, tools: string[]): string => {
    s.put({
      id, origin: ORIGIN, template: 't', params: {}, preconditions: { urlPattern: `${ORIGIN}/#/tickets/:id` },
      steps: tools.map((tool) => ({ tool, args: {}, locators: {} })),
      stats: { uses: 3, successes: 3, partial: 0, created: 'now', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: 'now' },
    });
    return id;
  };

  it('refuses a skill another step of the flow already owns', () => {
    const s = store();
    put(s, 's_read', ['read', 'read_all']);
    put(s, 's_create', ['click', 'fill', 'click']);
    const steps = [{ id: '07-open', skill: 's_read' }, { id: '08-create', skill: 's_create' }];
    // fwrd14l-n2: step 08's recovery invoked step 07's read-only skill, which
    // resolved cleanly on the same detail page and reported success.
    expect(canAdoptPin(s, steps, '08-create', 's_create', 's_read')).toBe(false);
  });

  it('refuses to trade a mutating procedure for a read-only one', () => {
    const s = store();
    put(s, 's_reads', ['read', 'read_all']);
    put(s, 's_deletes', ['click', 'click']);
    const steps = [{ id: '09-delete', skill: 's_deletes' }];
    expect(canAdoptPin(s, steps, '09-delete', 's_deletes', 's_reads')).toBe(false);
  });

  it('refuses a skill this run has ALREADY adopted for another step', () => {
    const s = store();
    put(s, 's_create', ['click', 'fill', 'click']);
    put(s, 's_other', ['click', 'fill']);
    // fwrd16-n3 re-pinned 02-create and 10-open onto one skill in a single
    // pass: the write-back happens after the loop, so the flow object alone
    // cannot see this run's own pending adoptions. The caller must fold them
    // in — as runFlow now does — and then the gate holds.
    const committed = [{ id: '02-create', skill: 's_old' }, { id: '10-open', skill: 's_other' }];
    expect(canAdoptPin(s, committed, '02-create', 's_old', 's_create')).toBe(true);
    const withPending = [{ id: '02-create', skill: 's_create' }, { id: '10-open', skill: 's_other' }];
    expect(canAdoptPin(s, withPending, '10-open', 's_other', 's_create')).toBe(false);
  });

  it('still adopts an honest repair of the same kind of work', () => {
    const s = store();
    put(s, 's_old', ['click', 'fill']);
    put(s, 's_new', ['click', 'fill', 'click']);
    const steps = [{ id: '02-create', skill: 's_old' }];
    expect(canAdoptPin(s, steps, '02-create', 's_old', 's_new')).toBe(true);
  });

  it('a read-only step may still repair to another read-only skill', () => {
    const s = store();
    put(s, 's_r1', ['read']);
    put(s, 's_r2', ['read', 'read_all']);
    expect(canAdoptPin(s, [{ id: '07-open', skill: 's_r1' }], '07-open', 's_r1', 's_r2')).toBe(true);
  });
});

describe('segmentation (one skill per page-template segment)', () => {
  const SIGNIN = `${ORIGIN}/#/signin`;
  const LIST = `${ORIGIN}/#/tickets`;
  const INSTR = "Sign in as bench@example.com with password hunter2, then create a ticket titled 'Seg Ticket' and report its reference.";
  const segReport = {
    status: 'success' as const,
    summary: "Signed in and created ticket 'Seg Ticket' (RD-1015).",
    evidence: { values: { ticket_ref: 'RD-1015', ticket_title: 'Seg Ticket' } },
  };
  function twoPageRecording(): RecordedEntry[] {
    return [
      { k: 'instruction', text: INSTR, url: SIGNIN, fingerprint: [1, 0, 0] },
      step('fill', { target: '@e1', value: 'bench@example.com' }, [{ kind: 'label', label: 'Email' }]),
      step('fill', { target: '@e2', value: 'hunter2' }, [{ kind: 'label', label: 'Password' }]),
      step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Sign in' }], {
        diff: { url: LIST, alerts: [], added: ['- heading "Tickets"'] },
        fingerprintAfter: [0, 1, 0],
      }),
      step('click', { target: '@e4' }, [{ kind: 'role', role: 'button', name: 'New ticket' }], {
        diff: { url: LIST, alerts: [], added: ['- dialog "New ticket"'] },
      }),
      step('fill', { target: '@e5', value: 'Seg Ticket' }, [{ kind: 'label', label: 'Title' }]),
      step('click', { target: '@e6' }, [{ kind: 'role', role: 'button', name: 'Create' }], {
        diff: { url: LIST, alerts: [], added: ['- row "RD-1015 Seg Ticket"'] },
      }),
    ];
  }

  it('splits at the url-pattern seam into a linked chain with per-segment preconditions', () => {
    const skills = compileSkills({ entries: twoPageRecording(), instruction: INSTR, report: segReport, session: 's' });
    expect(skills).toHaveLength(2);
    const [a, b] = skills;
    expect(a.seq).toEqual({ chain: a.seq!.chain, index: 0, of: 2 });
    expect(b.seq).toEqual({ chain: a.seq!.chain, index: 1, of: 2 });
    expect(a.template).toBe(b.template);
    expect(a.id).not.toBe(b.id);
    expect(a.preconditions.urlPattern).toContain('/#/signin');
    expect(a.preconditions.fingerprint).toEqual([1, 0, 0]);
    expect(b.preconditions.urlPattern).toContain('/#/tickets');
    expect(b.preconditions.fingerprint).toEqual([0, 1, 0]);
    expect(a.steps).toHaveLength(3);
    expect(b.steps).toHaveLength(3);
    // report vouching only from the last segment
    expect(a.reportTemplate).toBeUndefined();
    expect(b.reportTemplate).toBeDefined();
    // the shared slot set: every segment carries the union so one binding fits all
    expect(Object.keys(a.params)).toEqual(Object.keys(b.params));
    expect(Object.keys(a.params).length).toBeGreaterThan(0);
  });

  it('a same-template recording with no seam still compiles to one skill', () => {
    const skills = compileSkills({ entries: recording(), instruction: INSTRUCTION, report, session: 's' });
    expect(skills).toHaveLength(1);
    expect(skills[0].seq).toBeUndefined();
  });

  it('learnFromInstruction stores all segments and merges a repeat run into the same chain', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-seg-'));
    const store = new SkillStore(dir);
    const result = { report: segReport, turns: 3, usage: { promptTokens: 1, completionTokens: 1, cachedTokens: 0 }, screenshots: [] } as unknown as InstructionResult;
    const first = learnFromInstruction(store, { result, instruction: INSTR, entries: twoPageRecording(), session: 's1' });
    expect(first?.compiledAll).toHaveLength(2);
    const second = learnFromInstruction(store, { result, instruction: INSTR.replace('Seg Ticket', 'Seg Ticket'), entries: twoPageRecording(), session: 's2' });
    expect(second?.merged).toBe(first?.compiled);
    const all = store.all();
    expect(all).toHaveLength(2);
    // both segments were bumped and promoted together
    for (const s of all) {
      expect(s.stats.successes).toBe(2);
      expect(s.status).toBe('validated');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('matchTemplate and selectCandidates never start a chain mid-way', () => {
    const skills = compileSkills({ entries: twoPageRecording(), instruction: INSTR, report: segReport, session: 's' });
    for (const s of skills) s.status = 'validated';
    const [head, tail] = skills;
    // on the tail's page, the tail must not be offered as an entry point
    expect(matchTemplate([tail], INSTR, LIST)).toBeNull();
    expect(matchTemplate([head], INSTR, SIGNIN)?.skill.id).toBe(head.id);
    expect(selectCandidates([tail, head], undefined, INSTR).map((c) => c.skill.id)).toEqual([head.id]);
  });
});

describe('softUrlMatch (mechanism 2: observed variance)', () => {
  it('tolerates one disagreeing segment and generalises exactly that segment', () => {
    // The swg-n2 halt: run 1 baked its generated dashboard uid into the
    // expectation; the replay minted a different one.
    const soft = softUrlMatch('http://h:1/d/afw6yy5xxq4u8e/:id', 'http://h:1/d/afw711m2aifb4a/swg-n2-bench-dashboard');
    expect(soft).not.toBeNull();
    expect(soft!.generalised).toBe('http://h:1/d/:var/:id');
    // and the generalised pattern now hard-matches any future uid
    expect(urlMatches('http://h:1/d/:var/:id', 'http://h:1/d/zzz9x/other')).toBe(true);
  });
  it('rejects a different page shape outright', () => {
    expect(softUrlMatch('http://h:1/d/afw6yy5xxq4u8e/:id', 'http://h:1/dashboards')).toBeNull();
    expect(softUrlMatch('http://h:1/a/b', 'http://other:2/a/b')).toBeNull();
  });
  it('rejects when everything already matched (no diff to generalise)', () => {
    expect(softUrlMatch('http://h:1/d/:id/:id', 'http://h:1/d/x1/y2')).toBeNull();
  });
  it('generalises a query-shaped hash value the way Odoo needs', () => {
    const soft = softUrlMatch('http://h:1/web#action=133&model=sale.order', 'http://h:1/web#action=915&cids=1&model=sale.order');
    expect(soft).not.toBeNull();
    expect(soft!.generalised).toBe('http://h:1/web#action=:var&model=sale.order');
  });
  it('generalises only a value whose shape is minted, never a word route or a parameter-filled segment', () => {
    expect(softUrlMatch('http://h:1/orders/success', 'http://h:1/orders/failure')).toBeNull();
    expect(softUrlMatch('http://h:1/items/{{v1}}', 'http://h:1/items/43', { v1: '42' })).toBeNull();
    expect(mintedShape('afw6yy5xxq4u8e')).toBe(true);
    expect(mintedShape('rec-2')).toBe(true);
    expect(mintedShape('cfwcsdxqdjabkf')).toBe(true);
    expect(mintedShape('deadbeef')).toBe(true);
    expect(mintedShape('edit')).toBe(false);
    expect(mintedShape('order-history')).toBe(false);
    expect(mintedShape('')).toBe(false);
  });
  it('gives up past two disagreeing segments', () => {
    expect(softUrlMatch('http://h:1/a1/b2/c3', 'http://h:1/x1/y2/z3')).toBeNull();
  });
  it('an unfilled {{dN}} marker in a pattern matches any segment', () => {
    expect(urlMatches('http://h:1/d/{{d1}}/:id', 'http://h:1/d/afw711m2aifb4a/slug')).toBe(true);
    // and a filled one must match exactly
    expect(urlMatches('http://h:1/d/{{d1}}/:id', 'http://h:1/d/afw711m2aifb4a/slug', { d1: 'afw711m2aifb4a' })).toBe(true);
    expect(urlMatches('http://h:1/d/{{d1}}/:id', 'http://h:1/d/afw711m2aifb4a/slug', { d1: 'other9' })).toBe(false);
  });
});

describe('derived params (mechanism 1: provenance)', () => {
  const START = `${ORIGIN}/dashboard/new`;
  const CREATE_INSTR = "Create a dashboard named 'Bench Board' and verify it saved.";
  function mintingRecording(): RecordedEntry[] {
    return [
      { k: 'instruction', text: CREATE_INSTR, url: START, fingerprint: [1, 0, 0] },
      step('fill', { target: '@e1', value: 'Bench Board' }, [{ kind: 'label', label: 'Title' }]),
      // Saving navigates to the minted uid's url — the mint step.
      step('click', { target: '@e2' }, [{ kind: 'role', role: 'button', name: 'Save' }], {
        diff: { url: `${ORIGIN}/d/afw6yy5xx9/bench-board`, alerts: ['Dashboard saved'], added: [] },
      }),
      // A later navigation back to the same record bakes the uid again.
      step('goto', { url: `${ORIGIN}/d/afw6yy5xx9/bench-board` }, [], {
        diff: { url: `${ORIGIN}/d/afw6yy5xx9/bench-board`, alerts: [], added: ['- heading "Bench Board"'] },
      }),
    ];
  }
  it('turns a value minted in a post-nav url into a {{dN}} reference downstream', () => {
    // The mint navigation crosses a template seam, so this compiles to a
    // 2-segment chain: the MINTING segment carries the derived metadata, the
    // later segment consumes the marker.
    const skills = compileSkills({ entries: mintingRecording(), instruction: CREATE_INSTR, report: { status: 'success', summary: 'ok', evidence: { values: {} } }, session: 's' });
    expect(skills).toHaveLength(2);
    const [a, b] = skills;
    expect(a.derived).toBeDefined();
    const [name, meta] = Object.entries(a.derived!)[0];
    expect(meta.example).toBe('afw6yy5xx9');
    expect(meta.at).toBe('p1');
    // the minting step's own expectation references the value it produced
    expect(JSON.stringify(a.steps[meta.step - 1].expect)).toContain(`{{${name}}}`);
    // the later segment's precondition and goto use the reference, not the literal
    expect(b.preconditions.urlPattern).toContain(`{{${name}}}`);
    const goto = b.steps.find((st) => st.tool === 'goto')!;
    expect(String(goto.args.url)).toContain(`{{${name}}}`);
    expect(String(goto.args.url)).not.toContain('afw6yy5xx9');
  });
  it('leaves stable digitless route words alone', () => {
    const skills = compileSkills({ entries: recording(), instruction: INSTRUCTION, report, session: 's' });
    expect(JSON.stringify(skills)).not.toContain('{{d');
  });
});

describe('urlParts', () => {
  it('labels path, hash-route and hash-state parts stably', () => {
    expect(urlParts('http://h:1/d/uid9/slug#x')).toEqual([
      { label: 'p0', value: 'd' },
      { label: 'p1', value: 'uid9' },
      { label: 'p2', value: 'slug' },
      { label: 'h0', value: 'x' },
    ]);
    expect(urlParts('http://h:1/web#action=915&cids=1')).toEqual([
      { label: 'p0', value: 'web' },
      { label: 'q.action', value: '915' },
      { label: 'q.cids', value: '1' },
    ]);
  });
});

describe('ElementSpec view', () => {
  it('separates naming a record, naming an element, and saying where it sits', () => {
    const chain: LocatorCandidate[] = [
      { kind: 'css', selector: '#view > div > button:nth-of-type(2)' },
      { kind: 'scoped', container: 'tr', hasText: '{{v1}} Two' },
      { kind: 'testid', attr: 'data-testid', value: 'modal-save' },
      { kind: 'css', selector: '#modal-save' },
      { kind: 'role', role: 'button', name: 'Save', nth: 2 },
    ];
    const spec = specOf(chain);
    expect(spec.identity.map((c) => c.kind)).toEqual(['scoped']);
    // An agent-chosen `#modal-save` NAMES a control; it is not a route to
    // wherever that shape currently sits, so it stays a handle.
    expect(spec.handles.map((c) => (c as { value?: string; selector?: string }).value ?? (c as { selector?: string }).selector)).toEqual(['modal-save', '#modal-save']);
    // A structural path, and a role pinned to a match index, are both routes.
    expect(spec.path.length).toBe(2);
  });
});

describe('evidence, not shape, decides whether an id is real', () => {
  const chainOf = (): LocatorCandidate[] => [
    { kind: 'id', selector: '[id="_r8b_"]' },      // grafana: React-minted, changes every load
    { kind: 'role', role: 'button', name: 'Save' }, // stable
  ];
  const skillWith = (chain: LocatorCandidate[]): Skill =>
    ({
      id: 's_ev', origin: ORIGIN, template: 't', params: {},
      preconditions: { urlPattern: ORIGIN },
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: chain } }],
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
    }) as unknown as Skill;

  it('retires a candidate only after it misses TWICE with the element present', () => {
    const store = new SkillStore();
    const skill = skillWith(chainOf());
    store.put(skill);
    // `_r8b_` matches no id-shaped pattern we have, so no heuristic would
    // catch it. One replay: it missed, the role candidate resolved.
    recordCandidateEvidence(store, 's_ev', [{ step: '1', key: 'target', hit: 1, missed: [0] }]);
    let chain = store.get('s_ev')!.steps[0].locators.target!;
    expect(chain[0].seen).toEqual({ hit: 0, miss: 1 });
    // One miss is not evidence — a slow paint or a modal can do that.
    expect(retired(chain[0])).toBe(false);
    recordCandidateEvidence(store, 's_ev', [{ step: '1', key: 'target', hit: 1, missed: [0] }]);
    chain = store.get('s_ev')!.steps[0].locators.target!;
    expect(retired(chain[0])).toBe(true);
    // The one that worked is not retired, and nothing was deleted: if the app
    // changes back it can still win a later pass.
    expect(retired(chain[1])).toBe(false);
    expect(chain).toHaveLength(2);
  });

  it('a candidate that ever resolves is never retired, however odd it looks', () => {
    const store = new SkillStore();
    store.put(skillWith(chainOf()));
    // Odoo's `o_data_row_7` trips every id-shaped rule we have — and works.
    recordCandidateEvidence(store, 's_ev', [{ step: '1', key: 'target', hit: 0, missed: [] }]);
    recordCandidateEvidence(store, 's_ev', [{ step: '1', key: 'target', hit: 1, missed: [0] }]);
    recordCandidateEvidence(store, 's_ev', [{ step: '1', key: 'target', hit: 1, missed: [0] }]);
    const chain = store.get('s_ev')!.steps[0].locators.target!;
    expect(chain[0].seen).toEqual({ hit: 1, miss: 2 });
    expect(retired(chain[0])).toBe(false);
  });
});

describe('provenance that arrives late', () => {
  it('strips a candidate the ledger only learns about after the step compiled', () => {
    // fwrd25l refused its own export over `ticket-link-t15`. The instruction
    // that MINTS t15 never visits a t15 url, so while it compiled nothing had
    // banked the value and `stranded` could not see it; the ledger only learns
    // it when a LATER instruction lands on that url. Export knows, so the same
    // provenance rule is applied there with the knowledge that arrived late.
    const chain: LocatorCandidate[] = [
      { kind: 'scoped', container: 'tr', hasText: '{{v1}} RD Bench Ticket', selector: 'td > a' },
      { kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' },
    ];
    expect(stranded(chain[0], ['t15'])).toBe(false); // a slot marker is not a value
    expect(stranded(chain[1], ['t15'])).toBe(true);
    // ...and with nothing banked, compile could not have known.
    expect(stranded(chain[1], [])).toBe(false);
  });
});

describe('stranded matches whole tokens, as the leak scanner does', () => {
  it('no longer lets a quantity condemn a price that merely contains its characters', () => {
    // fwod28: "5.00" deleted text("£ 425.00") and text("£ 1,015.00").
    expect(stranded({ kind: 'text', text: '£ 425.00' }, ['5.00'])).toBe(false);
    expect(stranded({ kind: 'text', text: '£ 1,015.00' }, ['5.00'])).toBe(false);
    expect(stranded({ kind: 'text', text: '£ 113.00' }, ['3.00'])).toBe(false);
  });

  it('still catches every genuine run value, including ones inside test hooks', () => {
    expect(stranded({ kind: 'testid', attr: 'data-testid', value: 'ticket-link-t15' }, ['t15'])).toBe(true);
    expect(stranded({ kind: 'css', selector: '[data-testid="ticket-row-t15"] a' }, ['t15'])).toBe(true);
    expect(stranded({ kind: 'role', role: 'link', name: 'RD-1015' }, ['RD-1015'])).toBe(true);
    expect(stranded({ kind: 'text', text: '£ 425.00' }, ['£ 425.00'])).toBe(true);
  });
});

describe('a read-back carries the name it was captured for', () => {
  const readBack = (label?: string): RecordedEntry[] => [
    { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/#/tickets/t15` }, locators: {} },
    {
      k: 'step',
      tool: 'read',
      args: { target: '(read-back)', what: 'text' },
      locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'label', label: 'Unit Price' }] } },
      result: '750.00',
      ...(label ? { label } : {}),
    },
  ];

  it('labels from the evidence key, not by matching the result text', () => {
    // fwod20's 02-verify recorded eight values and republished NONE on either
    // replay: readLabel recovered the name by comparing the read's result
    // against every reported value for an EXACT hit, and "£750.00" in the
    // report does not equal "750.00" off the page. The read was stored
    // unlabelled, an unlabelled read publishes nothing, and every later step
    // referencing that output fell to recovery for ever.
    const report = { status: 'success' as const, summary: 'read it', evidence: { values: { unit_price: '£750.00' } } };
    const s = compileSkill({ entries: readBack('unit_price'), instruction: 'Read the unit price', report, session: 's' })!;
    const read = s.steps.find((st) => st.tool === 'read');
    expect(read?.label).toBe('unit_price');
    expect(publishedOutputs(s)).toContain('unit_price');
  });

  it('still recovers the name by matching when none was carried', () => {
    // Note the value: "750.00" would NOT recover, because the fallback parses
    // the read result as JSON and 750 !== "750.00". That is the fragility the
    // carried label removes, demonstrated by its own test.
    const entries = readBack().map((e) => (e.k === 'step' && e.tool === 'read' ? { ...e, result: 'Sales Order' } : e));
    const report = { status: 'success' as const, summary: 'read it', evidence: { values: { order_status: 'Sales Order' } } };
    const s = compileSkill({ entries, instruction: 'Read the status', report, session: 's' })!;
    expect(s.steps.find((st) => st.tool === 'read')?.label).toBe('order_status');
  });

  it('ignores a carried label the report does not name', () => {
    const report = { status: 'success' as const, summary: 'read it', evidence: { values: { total: '999.00' } } };
    const s = compileSkill({ entries: readBack('unit_price'), instruction: 'Read the unit price', report, session: 's' })!;
    expect(s.steps.find((st) => st.tool === 'read')?.label).toBeUndefined();
  });
});

describe('dropDismissedDialogs (fwgr25: a dialog opened and cancelled is a no-op pair)', () => {
  const click = (name: string, added?: string[]): SkillStep => ({
    tool: 'click',
    args: { target: `@${name}` },
    locators: { target: [{ kind: 'role', role: 'button', name }] },
    ...(added ? { expect: { urlPattern: 'http://x/d/:id/:id', addedContains: added } } : { expect: { urlPattern: 'http://x/d/:id/:id' } }),
  });
  const DIALOG = ['- dialog "Discard changes to dashboard?"', '- heading "Discard changes to dashboard?"', '- button "Close"', '- button "Cancel"', '- button "Discard"'];
  it('drops the opener and its Cancel, keeps everything else in order', () => {
    const steps = [click('Back to dashboard', ['- button "Exit edit"']), click('Exit edit', DIALOG), click('Cancel'), click('Save dashboard', ['- dialog "Drawer title Save dashboard"'])];
    expect(dropDismissedDialogs(steps).map((s) => s.args.target)).toEqual(['@Back to dashboard', '@Save dashboard']);
  });
  /**
   * C07. The pair is dropped on evidence that the dismissal did nothing, and
   * an empty added-lines list is not that evidence on its own: a Close that
   * navigated, published a value, raised an alert, or minted a record had a
   * consequence the line list cannot show.
   */
  it('keeps a dismissal that had any other recorded consequence', () => {
    const opener = click('Exit edit', DIALOG);
    const navigated = { ...click('Cancel'), expect: { urlPattern: 'http://x/list' } };
    expect(dropDismissedDialogs([opener, navigated]).length).toBe(2);
    const reads = { ...click('Cancel'), label: 'order_status' };
    expect(dropDismissedDialogs([opener, reads]).length).toBe(2);
    const mints = { ...click('Cancel'), mints: { at: 'p1' } };
    expect(dropDismissedDialogs([opener, mints]).length).toBe(2);
    const alerted = { ...click('Cancel'), expect: { urlPattern: 'http://x/d/:id/:id', alertContains: 'Not saved' } };
    expect(dropDismissedDialogs([opener, alerted]).length).toBe(2);
  });

  it('keeps a confirm click, and a dismissal the dialog did not list', () => {
    expect(dropDismissedDialogs([click('Exit edit', DIALOG), click('Discard')]).length).toBe(2);
    expect(dropDismissedDialogs([click('Exit edit', DIALOG), click('Not now')]).length).toBe(2);
  });
  it('keeps a Cancel that recorded its own page change', () => {
    expect(dropDismissedDialogs([click('Exit edit', DIALOG), click('Cancel', ['- heading "Something appeared"'])]).length).toBe(2);
  });
});

describe('maskMinted', () => {
  // Provenance, not shape: a control value the procedure did not put there
  // (no slot) is the app's, whatever it looks like — an id, a default, a
  // computed figure. No rule here tries to recognise an identifier.
  it("wildcards a control value the procedure did not fill (atelyr's project picker showed the recording's own project id)", async () => {
    const { maskMinted, WILDCARD } = await import('../src/skills/compile.js');
    expect(maskMinted('- combobox "Fixture Project One {{v2}} MTP Bench Project": 13f9pv52yozr')).toBe(`- combobox "Fixture Project One {{v2}} MTP Bench Project": ${WILDCARD}`);
    expect(maskMinted('- textbox "Reference": RD-1017')).toBe(`- textbox "Reference": ${WILDCARD}`);
    expect(maskMinted('- spinbutton "Qty": 42')).toBe(`- spinbutton "Qty": ${WILDCARD}`);
    expect(maskMinted('- combobox "Status": Specified')).toBe(`- combobox "Status": ${WILDCARD}`);
    expect(maskMinted('- textbox "Due" [checked]: 12/31/2026')).toBe(`- textbox "Due" [checked]: ${WILDCARD}`);
  });
  it('keeps a value the procedure filled (a slot) and lines with no value', async () => {
    const { maskMinted } = await import('../src/skills/compile.js');
    expect(maskMinted('- textbox "Name": {{v1}}')).toBe('- textbox "Name": {{v1}}');
    expect(maskMinted('- textbox "Ref": {{d1}}')).toBe('- textbox "Ref": {{d1}}');
    expect(maskMinted('- heading "Panel Title"')).toBe('- heading "Panel Title"');
    // a colon inside the name is not a value colon
    expect(maskMinted('- heading "Panel: Title"')).toBe('- heading "Panel: Title"');
    expect(maskMinted('- link "Support"')).toBe('- link "Support"');
  });
});

/**
 * Provenance at compile time: what a step's own args put on the page, and what
 * the application merely happened to be showing. fwod49-n2 compiled both
 * halves wrong — 04-open's dblclick, which types nothing, stored
 * `- combobox "Type to find a product...": {{v4}}` (v4 is another
 * instruction's output), and 02-open's one-character `type` stored the
 * autocomplete's whole option list, `- option "{{v4}}"` among it. Both were
 * HARD, so every replay stopped and both skills were demoted.
 */
describe("a step's expectation is only what the step itself put there (fwod49)", () => {
  const compileOne = (recorded: RecordedStep[], instruction: string) =>
    compileSkills({
      entries: [{ k: 'instruction', text: instruction, url: `${ORIGIN}/orders/1` } as RecordedEntry, ...recorded],
      instruction,
      report: { status: 'success', summary: 'ok' },
      session: 's',
    })[0];

  it("wildcards a control's value the step did not type, and keeps the one it did", () => {
    const instruction = "On order 1, open the 'Acoustic Bloc Screens' line and set its note to 'Rush delivery'.";
    const skill = compileOne(
      [
        step('dblclick', { target: 'td.qty' }, [{ kind: 'css', selector: 'td.qty' }], {
          diff: {
            url: `${ORIGIN}/orders/1`,
            alerts: [],
            added: ['- combobox "Type to find a product...": Acoustic Bloc Screens', '- textbox "": Acoustic Bloc Screens', '- link "Delete"'],
          },
        }),
        step('fill', { target: 'td.note input', value: 'Rush delivery' }, [{ kind: 'css', selector: 'td.note input' }], {
          diff: { url: `${ORIGIN}/orders/1`, alerts: [], added: ['- textbox "Note": Rush delivery', '- row "Untaxed Amount 1,475.00"'] },
        }),
      ],
      instruction,
    );
    // the dblclick typed nothing: the product name in the row is the app's,
    // whoever's run made that row — the line survives on role and name alone,
    // and the unnamed one identifies nothing at all once the value is gone
    expect(skill.steps[0].expect?.addedContains).toEqual(['- combobox "Type to find a product...": {{*}}', '- link "Delete"']);
    // the fill's own value — a slot, because the instruction names it — is
    // evidence: it is what the fill put there
    expect(skill.steps[1].expect?.addedContains?.[0]).toMatch(/^- textbox "Note": \{\{v\d+\}\}$/);
  });

  it("never parameterises an item inside an open popup, and keeps the popup's own line", () => {
    const instruction = "On order 1, add a line for 'Cabinet with Doors'.";
    const skill = compileOne(
      [
        step('type', { target: 'td.product input', text: 'a' }, [{ kind: 'css', selector: 'td.product input' }], {
          diff: {
            url: `${ORIGIN}/orders/1`,
            alerts: [],
            added: ['- menu ""', '- option "Cabinet with Doors"', '- option "Chair floor protection"'],
          },
        }),
      ],
      instruction,
    );
    const added = skill.steps[0].expect?.addedContains ?? [];
    // the option the instruction names would have been slotted; it is not
    expect(added.some((l) => /^- option .*\{\{v\d+\}\}/.test(l))).toBe(false);
    // the popup's opening is still the evidence
    expect(added).toContain('- menu ""');
  });
});

describe('a recorded expectation may not freeze a value only that run could produce (fwod60, fwrd65)', () => {
  const compileOne = (
    entries: RecordedStep[],
    instruction: string,
    report: Parameters<typeof compileSkills>[0]['report'],
    url = `${ORIGIN}/orders/1`,
    knownValues: Record<string, string> = {},
  ) =>
    compileSkills({
      entries: [{ k: 'instruction', text: instruction, url, fingerprint: [1, 0, 0] }, ...entries],
      instruction,
      report,
      session: 's',
      knownValues,
    })[0];

  it("unfreezes a total the recording watched change at the same slotted row (fwod60 s_292da2 steps[2])", () => {
    // VERBATIM from origin/results/fwod60-c29wza,
    // bench/results-published/fwod60-skills/http_127.0.0.1_8069/s_292da2.json.
    // £267.00 is 255 + 12, computed by odoo from the product the recording
    // happened to pick. n2 picked a £70 product, so the total was £222 and
    // never £267 — and as the step's only slotted line, `- row "{{v9}} £
    // 267.00"` was the whole HARD half of the expectation. n2 and n3 both
    // stopped there ("after step 3 the page did not show `- row \"Untaxed
    // Amount: £ 210.00 £ 267.00\"`"), s_292da2 demoted to 1/3 and
    // demoted-pin refused the compile.
    //
    // 267.00 is not in the report and no read published it, so nothing but
    // the recording's own two looks can see it: the same role carrying the
    // same run-scoped slot showed two different names one step apart.
    const instruction =
      'On quotation S00021 (line one: Corner Desk qty 3.00) add a second line for any other product, set its quantity to 2, and report the new Untaxed Amount.';
    const report = {
      status: 'success' as const,
      summary: 'Added a second line.',
      // Deliberately does NOT mention 267.00: it is a value the procedure
      // passed through, never one it published.
      evidence: { values: { untaxed_amount_label: 'Untaxed Amount', untaxed_amount: '£ 279.00' } },
    };
    const skill = compileOne(
      [
        step('click', { target: 'role=option[name="Chair floor protection"]' }, [{ kind: 'role', role: 'option', name: 'Chair floor protection' }], {
          diff: { url: `${ORIGIN}/orders/1`, alerts: [], added: ['- row "20% £ 12.00"', '- link "Delete"', '- cell "£ 12.00"', '- row "Untaxed Amount £ 267.00"'] },
        }),
        step('fill', { target: 'tr.o_selected_row input >> nth=1', value: '2' }, [{ kind: 'css', selector: 'tr.o_selected_row input >> nth=1' }], {
          diff: { url: `${ORIGIN}/orders/1`, alerts: [], added: ['- row "20% £ 24.00"', '- row "Untaxed Amount £ 279.00"'] },
        }),
        step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: 'td.label' }], { result: '"Untaxed Amount"', label: 'untaxed_amount_label' }),
        step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: 'td.amount' }], { result: '"£ 279.00"', label: 'untaxed_amount' }),
      ],
      instruction,
      report,
      `${ORIGIN}/orders/1`,
      // v9's own provenance, as the sweep recorded it: the label came from an
      // earlier instruction's report, so it is a slot and the amount beside it
      // is not.
      { 'output:i3:untaxed_amount_label': 'Untaxed Amount' },
    );
    const slot = Object.entries(skill.params).find(([, p]) => p.example === 'Untaxed Amount')![0];
    const added = skill.steps[0].expect!.addedContains!;
    // the row is still evidence — the label the run bound, and that a row
    // appeared beside it — but the arithmetic is gone
    expect(added).toContain(`- row "{{${slot}}} {{*}}"`);
    expect(added.join('\n')).not.toContain('267');
    // ...and the run's own slot is untouched, so the line is still HARD
    expect(skill.steps[1].expect!.addedContains).toContain(`- row "{{${slot}}} {{*}}"`);
    // the landmark beside it is not collateral: `- link "Delete"` never changed
    expect(added).toContain('- link "Delete"');
  });

  it('unfreezes the amounts the recording read back and published (fwod60 s_292da2 steps[3])', () => {
    // The step AFTER the one above recorded five lines and every one of them
    // was an amount — `- row "20% £ 24.00"`, `- cell "£ 24.00"`, `- row
    // "{{v9}} £ 279.00"`, `- cell "£ 279.00"`, `- row "TAX 20% £ 55.80"` —
    // so there was no stable line in the plain group to carry it. Fixing
    // only the slotted line above would have moved the stop one step, not
    // removed it. These the reads name: the procedure asked the page for
    // them and the report publishes them as this run's answer.
    const instruction = "Set the second line's quantity to 2 and report the totals.";
    const report = {
      status: 'success' as const,
      summary: 'Set the quantity.',
      evidence: { values: { second_line_tax_excl: '£ 24.00', untaxed_amount: '£ 279.00', tax_20_amount: '£ 55.80' } },
    };
    const skill = compileOne(
      [
        step('fill', { target: 'tr.o_selected_row input >> nth=1', value: '2' }, [{ kind: 'css', selector: 'tr.o_selected_row input >> nth=1' }], {
          diff: {
            url: `${ORIGIN}/orders/1`,
            alerts: [],
            added: ['- row "20% £ 24.00"', '- cell "£ 24.00"', '- cell "£ 279.00"', '- row "TAX 20% £ 55.80"'],
          },
        }),
        step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: 'td.sub' }], { result: '"£ 24.00"', label: 'second_line_tax_excl' }),
        step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: 'td.untaxed' }], { result: '"£ 279.00"', label: 'untaxed_amount' }),
        step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: 'td.tax' }], { result: '"£ 55.80"', label: 'tax_20_amount' }),
      ],
      instruction,
      report,
    );
    const added = skill.steps[0].expect!.addedContains!;
    // what the step DID is still asserted: a 20% tax line and a TAX 20% row
    // appeared. What that run's arithmetic made of them is not.
    expect(added).toEqual(['- row "20% {{*}}"', '- row "TAX 20% {{*}}"']);
    // the two lines whose whole name was an amount identify nothing once it
    // is gone, and are dropped by the rule that drops `- cell ""`
    expect(added.join('\n')).not.toContain('279');
  });

  it('unfreezes a record reference the run minted, in a cell with no slot near it (fwrd65 s_ca1263, observation B)', () => {
    // The other half of the class, different app and different value kind:
    // RD-1016 is the reference repair-desk minted for the probe ticket THIS
    // run created. `- cell "RD-1016"` and `- link "RD-1016"` are the whole
    // plain group of step 3, both frozen, so the group could not be
    // satisfied and the step stopped — twice, demoting s_ca1263 to 1/3.
    // No slot sits anywhere near those two lines, so the watched-name rule
    // cannot reach them; the recording's own read of that reference can.
    const instruction = 'Open the tickets list, search for the probe ticket and report its reference.';
    const report = {
      status: 'success' as const,
      summary: 'Read the probe ticket back.',
      evidence: { values: { list_row_reference_rd1016: 'RD-1016' } },
    };
    const skill = compileOne(
      [
        step('fill', { target: '@e922', value: 'zz-probe' }, [{ kind: 'css', selector: '#search' }], {
          diff: {
            url: `${ORIGIN}/#/tickets`,
            alerts: [],
            added: ['- searchbox "Reference, title or customer": zz-probe', '- cell "RD-1016"', '- link "RD-1016"', '- cell "Probe Co"'],
          },
        }),
        step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: 'td.ref' }], { result: '"RD-1016"', label: 'list_row_reference_rd1016' }),
      ],
      instruction,
      report,
      `${ORIGIN}/#/tickets`,
    );
    const added = skill.steps[0].expect!.addedContains!;
    expect(added.join('\n')).not.toContain('RD-1016');
    // the search the fill itself performed, and a landmark the run did not
    // mint, still carry the step
    expect(added).toContain('- cell "Probe Co"');
    expect(added.some((l) => l.startsWith('- searchbox "Reference, title or customer"'))).toBe(true);
  });

  it('leaves a name the recording only ever saw once exactly as recorded', () => {
    // The counter-example the watched-name rule exists to stay inside: one
    // look is not variance, so a row that merely CONTAINS a slot keeps every
    // literal beside it. fwrd65 s_ca1263's `- row "{{v4}} {{v2}} {{v5}}
    // Marlow Bakery Ready 0"` is the shape at risk — blanking a slotted
    // name's residue on sight would throw away the ticket's status.
    const instruction = "Clear the search box on the tickets list for ticket 'x7 Bench Ticket'.";
    const report = { status: 'success' as const, summary: 'Cleared it.', evidence: { values: {} } };
    const skill = compileOne(
      [
        step('fill', { target: '@e922', value: '' }, [{ kind: 'css', selector: '#search' }], {
          diff: { url: `${ORIGIN}/#/tickets`, alerts: [], added: ['- row "x7 Bench Ticket Marlow Bakery Ready 0"'] },
        }),
      ],
      instruction,
      report,
      `${ORIGIN}/#/tickets`,
      { 'output:i1:title': 'x7 Bench Ticket' },
    );
    const slot = Object.entries(skill.params).find(([, p]) => p.example === 'x7 Bench Ticket')![0];
    expect(skill.steps[0].expect!.addedContains).toEqual([`- row "{{${slot}}} Marlow Bakery Ready 0"`]);
  });

  it('never masks the role a read happened to publish', () => {
    // A read whose value is "row" or "Delete" must narrow what a line SAYS,
    // never rewrite what said it.
    const instruction = 'Click Save on order 1 and report the control that appeared.';
    const report = { status: 'success' as const, summary: 'Saved.', evidence: { values: { appeared: 'row' } } };
    const skill = compileOne(
      [
        step('click', { target: '@e1' }, [{ kind: 'role', role: 'button', name: 'Save' }], {
          diff: { url: `${ORIGIN}/orders/1`, alerts: [], added: ['- row "Widget 1"', '- link "Delete"'] },
        }),
        step('read', { target: '(read-back)', what: 'text' }, [{ kind: 'css', selector: 'td.k' }], { result: '"row"', label: 'appeared' }),
      ],
      instruction,
      report,
    );
    const added = skill.steps[0].expect!.addedContains!;
    expect(added.every((l) => l.startsWith('- row "') || l.startsWith('- link "'))).toBe(true);
    expect(added).toContain('- link "Delete"');
  });
});

describe('adjacent slots are not split on a guess (fwod55)', () => {
  // bindSkill reads only these two fields, so the fixtures say only what the
  // defect is about: the template's shape and what the recording observed.
  const skillOf = (template: string, params: Record<string, { example: string; binding?: string }>): Skill =>
    ({ template, params: Object.fromEntries(Object.entries(params).map(([n, p]) => [n, { usedIn: [1], ...p }])) }) as unknown as Skill;

  const TEMPLATE = 'Open the confirmed {{v1}} {{v2}} and cancel it.';
  const INSTR = 'Open the confirmed Sales Order S00024 and cancel it.';

  it('places the boundary where the recorded example does, not where the regex stops', () => {
    // The whole defect: the non-greedy split gave v1="Sales", v2="Order S00024",
    // no page ever showed "Order S00024", and all three arms hard-stopped on the
    // RIGHT record leaving the order uncancelled.
    const skill = skillOf(TEMPLATE, {
      v1: { example: 'Sales Order' },
      v2: { example: 'S00021', binding: 'output:03-create:quotation_reference' },
    });
    expect(bindSkill(skill, INSTR)).toEqual({ v1: 'Sales Order', v2: 'S00024' });
  });

  it('a value this run published outranks the minimal split even with no usable example', () => {
    const skill = skillOf(TEMPLATE, {
      v1: { example: 'was something else entirely' },
      v2: { example: 'S00021', binding: 'output:03-create:quotation_reference' },
    });
    const bound = bindSkill(skill, INSTR, { 'output:03-create:quotation_reference': 'S00024' });
    expect(bound).toEqual({ v1: 'Sales Order', v2: 'S00024' });
  });

  it('refuses a split nothing vouches for, leaving those slots unbound rather than guessing', () => {
    const skill = skillOf(TEMPLATE, { v1: { example: 'no' }, v2: { example: 'match' } });
    const bound = bindSkill(skill, INSTR);
    // The skill still binds — the step costs a model turn instead of stopping
    // the flow on the right record — but the ambiguous slots carry no value, so
    // every marker over them is unbound and proves nothing.
    expect(bound).toEqual({});
    expect(fillParams('{{v2}}', bound!)).toBe('{{v2}}');
    expect(markersBound(['{{v2}}'], bound!)).toBe(false);
  });

  it('does not touch slots the template separates by real text', () => {
    const skill = skillOf('Open the confirmed {{v1}} named {{v2}} and cancel it.', {
      v1: { example: 'no' },
      v2: { example: 'match' },
    });
    expect(bindSkill(skill, 'Open the confirmed Sales Order named S00024 and cancel it.')).toEqual({
      v1: 'Sales Order',
      v2: 'S00024',
    });
  });

  it('an unambiguous one-token-per-slot split needs no evidence', () => {
    const skill = skillOf('Open {{v1}} {{v2}}.', { v1: { example: 'a' }, v2: { example: 'b' } });
    expect(bindSkill(skill, 'Open x y.')).toEqual({ v1: 'x', v2: 'y' });
  });

  it('still hard-stops on a genuinely wrong record', () => {
    // On odoo the url is `id=:id` throughout, so urlRecordParts returns null and
    // the marker is the only identity there is. With v2 correctly bound to
    // S00024 (the fix above), landing on S00019 must still stop the step.
    const skill = skillOf(TEMPLATE, {
      v1: { example: 'Sales Order' },
      v2: { example: 'S00021', binding: 'output:03-create:quotation_reference' },
    });
    const params = bindSkill(skill, INSTR)!;
    const marker = '{{v2}}';
    expect(markersBound([marker], params)).toBe(true); // bound, so it is asked
    const want = fillParams(marker, params);
    expect(want).toBe('S00024');
    // The page shows S00019: the marker is absent, and the url cannot excuse it.
    const pattern = `${ORIGIN}/web#cids=1&model=sale.order&view_type=form&id=:id`;
    const verdict = identityMarkerVerdict(pattern, `${ORIGIN}/web#cids=1&model=sale.order&view_type=form&id=19`, params, want, 'absent');
    expect(verdict.pass).toBe(false);
  });
});
