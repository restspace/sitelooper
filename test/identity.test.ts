/**
 * Record identity: the guards that stop a replay doing this run's work on a
 * DIFFERENT record of the same page template.
 *
 * fwrd8-n2/n3 (cloud, 2026-08-26) is the failure these cover: the primary
 * locator named the ticket by title, it did not resolve, replay fell through
 * to the recorded row position / recorded testid, and every later step —
 * preconditioned only on the url TEMPLATE `#/tickets/:id` — happily added
 * parts to, edited, and archived a seed ticket, reporting success.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { buildFlow, jsonLeaves, lookupOutput, noteOutputEvidence, varyingValues } from '../src/skills/flow.js';
import { addEvidenceValue, proseIdentifiers } from '../src/agent/report.js';
import { identityOfPrimary } from '../src/skills/replay.js';
import type { Skill } from '../src/skills/store.js';
import { documentOf, isObserveArg } from './fixture/observation.js';

// checkIdentity waits IDENTITY_WAIT_MS for a bound marker on a page that may
// still be arriving (fwgr47-n2 07-verify judged a grafana dashboard during its
// boot). A stub page here never changes, so every look it will ever give is
// the first one: waiting only spends the suite's timeout. The tests that
// exercise the wait itself set their own budget (`SITELOOPER_IDENTITY_WAIT_MS`).
process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-identity-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ORIGIN = 'http://127.0.0.1:4180';

function step(tool: string, args: Record<string, unknown>, chain: RecordedStep['locators']['target']['chain'] = [], extra: Partial<RecordedStep> = {}): RecordedStep {
  return {
    k: 'step',
    tool,
    args,
    locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain } } : {},
    ...extra,
  };
}

const ADD_PART = "On the ticket detail page for ticket 'r9-n2 RD Bench Ticket' (Ref RD-1015), add a part named exactly 'r9-n2 RD Part A' with cost 100.";

/** The add-part recording: starts ON the ticket's detail page, which showed the ticket. */
function addPartRecording(startText: string): RecordedEntry[] {
  return [
    { k: 'instruction', text: ADD_PART, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0], startText },
    step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Add part' }]),
    step('fill', { target: '@e10', value: 'r9-n2 RD Part A' }, [{ kind: 'label', label: 'Part name' }]),
    step('fill', { target: '@e11', value: '100' }, [{ kind: 'label', label: 'Cost' }]),
    step('click', { target: '@e13' }, [{ kind: 'role', role: 'button', name: 'Save' }], {
      diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: [], added: ['- row "r9-n2 RD Part A 100"'] },
    }),
  ];
}

const REPORT = { status: 'success' as const, summary: 'Added the part.', evidence: { values: {} } };

function compile(entries: RecordedEntry[], known?: Record<string, string>): Skill[] {
  return compileSkills({ entries, instruction: ADD_PART, report: REPORT, session: 's', now: '2026-08-27T00:00:00.000Z', ...(known ? { knownValues: known } : {}) });
}

describe('identity precondition (compile)', () => {
  it('requires the caller-vouched value the page already showed when the segment started', () => {
    const [skill] = compile(addPartRecording('- heading "r9-n2 RD Bench Ticket"\n- text "Ref RD-1015"'), { runid: 'r9-n2' });
    const marker = skill.preconditions.requireText?.[0];
    expect(marker).toBeTruthy();
    expect(skill.params[marker!.replace(/[{}]/g, '')].example).toBe('r9-n2');
    expect(skill.params[marker!.replace(/[{}]/g, '')].known).toBe(true);
  });

  it('does not require a value the run was about to TYPE but the page did not show', () => {
    // The part name carries the runid too, but this page showed neither the
    // ticket title nor the part — a create step must not refuse itself.
    const [skill] = compile(addPartRecording('- heading "Repair tickets"\n- button "New ticket"'), { runid: 'r9-n2' });
    expect(skill.preconditions.requireText).toBeUndefined();
  });

  it('never requires a value the compiler merely inferred (no known values → no identity)', () => {
    const [skill] = compile(addPartRecording('- heading "r9-n2 RD Bench Ticket"'));
    expect(skill.preconditions.requireText).toBeUndefined();
  });

  it('a later segment takes its identity from the seam step it navigated through', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: ADD_PART, url: `${ORIGIN}/#/tickets`, fingerprint: [1, 0, 0], startText: '- heading "Repair tickets"' },
      step('click', { target: '@e1' }, [{ kind: 'role', role: 'link', name: 'r9-n2 RD Bench Ticket' }], {
        diff: { url: `${ORIGIN}/#/tickets/t15`, alerts: [], added: ['- heading "r9-n2 RD Bench Ticket"', '- button "Add part"'] },
      }),
      step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Add part' }]),
      step('fill', { target: '@e10', value: 'r9-n2 RD Part A' }, [{ kind: 'label', label: 'Part name' }]),
    ];
    const skills = compile(entries, { runid: 'r9-n2' });
    expect(skills.length).toBe(2);
    expect(skills[0].preconditions.requireText).toBeUndefined(); // the list showed no ticket yet
    expect(skills[1].preconditions.requireText?.length).toBe(1);
  });

  /**
   * fwrd53 07-report: every change of page is a seam, a goto included. The
   * recording starts on a ticket's DETAIL page (its markers), then goes to the
   * list. The goto ends segment 1, and segment 2 is gated on the list the goto
   * landed on — never on the detail page's markers.
   */
  it('splits at a goto, gating the next segment on its landing, with no page-change expectation on the goto', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: ADD_PART, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0], startText: '- heading "r9-n2 RD Bench Ticket"' },
      step('goto', { url: `${ORIGIN}/#/tickets` }, [], {
        diff: { url: `${ORIGIN}/#/tickets`, alerts: [], added: ['- heading "Repair tickets"', '- row "r9-n2 RD Bench Ticket Open"'], dialect: 2 },
        fingerprintAfter: [0, 1, 0],
      }),
      step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Mark' }]),
    ];
    const skills = compile(entries, { runid: 'r9-n2' });
    expect(skills).toHaveLength(2);
    const [head, tail] = skills;
    expect(head.steps.map((s) => s.tool)).toEqual(['goto']);
    expect(head.preconditions.urlPattern).toBe(`${ORIGIN}/#/tickets/:id`);
    // the landing is not an effect to assert
    expect(head.steps[0].expect).toBeUndefined();
    expect(tail.steps.map((s) => s.tool)).toEqual(['click']);
    expect(tail.preconditions.urlPattern).toBe(`${ORIGIN}/#/tickets`);
    expect(tail.preconditions.fingerprint).toEqual([0, 1, 0]);
    // identity from the text that appeared on the list
    expect(tail.preconditions.requireText).toHaveLength(1);
    expect(tail.params[tail.preconditions.requireText![0].replace(/[{}]/g, '')].example).toBe('r9-n2');
    // a procedure that navigates is contract 4; one that does not stays 2
    expect(head.contract).toBe(4);
    expect(tail.contract).toBe(2);
  });

  /**
   * fwgr39 05-set: a marker must name the record, not describe its state. A
   * value the segment itself SETS — typed, filled, selected, or the option,
   * radio or checkbox a click or check picks — is the setting being changed,
   * and the same record shows another value the moment it differs.
   */
  describe('a value the segment writes is state, not identity', () => {
    const SET = "On ticket 'r9-n2 RD Bench Ticket', set the priority to 'Urgent Level'.";
    const START = '- heading "r9-n2 RD Bench Ticket"\n- combobox "Priority"\n- option "Urgent Level"\n- link "Urgent Level"\n- searchbox "Search"';
    const known = { runid: 'r9-n2', 'output:i1:priority': 'Urgent Level' };
    const markerValues = (steps: RecordedStep[]) => {
      const [skill] = compileSkills({
        entries: [{ k: 'instruction', text: SET, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0], startText: START }, ...steps],
        instruction: SET,
        report: REPORT,
        session: 's',
        now: '2026-08-27T00:00:00.000Z',
        knownValues: known,
      });
      return (skill.preconditions.requireText ?? []).map((m) => skill.params[m.replace(/[{}]/g, '')]?.example);
    };

    it('drops a value a click picks as an option (a menuitemradio, an option, a raw role selector)', () => {
      expect(markerValues([step('click', { target: '@e1' }, [{ kind: 'role', role: 'menuitemradio', name: 'Urgent Level' }])])).toEqual(['r9-n2']);
      expect(markerValues([step('click', { target: '@e1' }, [{ kind: 'role', role: 'option', name: 'Urgent Level' }])])).toEqual(['r9-n2']);
      expect(markerValues([step('click', { target: 'role=option[name="Urgent Level"]' }, [{ kind: 'css', selector: 'role=option[name="Urgent Level"]' }])])).toEqual(['r9-n2']);
    });

    it('drops a value filled, typed, selected or checked', () => {
      expect(markerValues([step('fill', { target: '@e1', value: 'Urgent Level' }, [{ kind: 'label', label: 'Priority' }])])).toEqual(['r9-n2']);
      expect(markerValues([step('type', { target: '@e1', text: 'Urgent Level' }, [{ kind: 'label', label: 'Priority' }])])).toEqual(['r9-n2']);
      expect(markerValues([step('select', { target: '@e1', option: 'Urgent Level' }, [{ kind: 'role', role: 'combobox', name: 'Priority' }])])).toEqual(['r9-n2']);
      expect(markerValues([step('check', { target: '@e1', checked: true }, [{ kind: 'label', label: 'Urgent Level' }])])).toEqual(['r9-n2']);
    });

    it('keeps a value the segment only navigates by, looks at, or searches with', () => {
      const click = step('click', { target: '@e1' }, [{ kind: 'role', role: 'link', name: 'Urgent Level' }]);
      expect(markerValues([click])).toEqual(['r9-n2', 'Urgent Level']);
      const search = step('fill', { target: '@e1', value: 'Urgent Level' }, [{ kind: 'role', role: 'searchbox', name: 'Search' }]);
      expect(markerValues([search])).toEqual(['r9-n2', 'Urgent Level']);
      const read = step('read', { target: '@e1', what: 'text' }, [{ kind: 'role', role: 'combobox', name: 'Priority' }], { result: '"Urgent Level"' });
      expect(markerValues([read])).toEqual(['r9-n2', 'Urgent Level']);
    });

    it('keeps the name inside a longer written value: the record is still named by it', () => {
      const fill = step('fill', { target: '@e1', value: 'Urgent Level for r9-n2' }, [{ kind: 'label', label: 'Note' }]);
      expect(markerValues([fill])).toContain('r9-n2');
    });
  });

  it('does not split at a goto the next step immediately replaces, so the superseded one is still dropped', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: ADD_PART, url: `${ORIGIN}/#/home` },
      step('goto', { url: `${ORIGIN}/#/search` }, [], { diff: { url: `${ORIGIN}/#/search`, alerts: [], added: [] } }),
      step('goto', { url: `${ORIGIN}/#/tickets` }, [], { diff: { url: `${ORIGIN}/#/tickets`, alerts: [], added: [] } }),
      step('click', { target: '@e3' }, [{ kind: 'role', role: 'button', name: 'Mark' }]),
    ];
    const skills = compile(entries);
    expect(skills.map((s) => s.steps.map((st) => st.tool))).toEqual([['goto'], ['click']]);
    expect(skills[0].steps[0].args.url).toBe(`${ORIGIN}/#/tickets`);
    expect(skills[1].preconditions.urlPattern).toBe(`${ORIGIN}/#/tickets`);
  });
});

describe('session-minted url ids (fwgr6: the uid in the skill template)', () => {
  const UID = 'afwfbbc2of6rkf';

  it("slots a minted uid the NEXT instruction names, so the template is not pinned to the recording's record", () => {
    const instruction = `In Grafana at http://127.0.0.1:3000/d/${UID}/r9-n2-bench-dashboard, add a text panel.`;
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instruction, url: `${ORIGIN}/#/x`, fingerprint: [1, 0, 0] },
      step('click', { target: '@e1' }, [{ kind: 'role', role: 'button', name: 'Add panel' }]),
    ];
    const rep = { status: 'success' as const, summary: 'Added.', evidence: { values: {} } };
    const bare = compileSkills({ entries, instruction, report: rep, session: 's', now: '2026-08-27T00:00:00.000Z' })[0];
    expect(bare.template).toContain(UID); // today's behaviour without the banked value

    const [skill] = compileSkills({
      entries,
      instruction,
      report: rep,
      session: 's',
      now: '2026-08-27T00:00:00.000Z',
      knownValues: { runid: 'r9-n2', 'mint.p1.0': UID },
    });
    expect(skill.template).not.toContain(UID);
    const name = Object.keys(skill.params).find((n) => skill.params[n].example === UID)!;
    expect(skill.params[name].known).toBe(true);
  });
});

describe('anchors must parameterise (compile)', () => {
  /** An anchor on the part's own row, the way the recorder now mints one. */
  const anchored = (hasText: string): RecordedEntry[] => [
    { k: 'instruction', text: ADD_PART, url: `${ORIGIN}/#/tickets/t15`, fingerprint: [1, 0, 0], startText: '- heading "r9-n2 RD Bench Ticket"' },
    step('click', { target: '@e20' }, [
      { kind: 'scoped', container: 'tr', hasText, selector: 'td:nth-of-type(7) > button' },
      { kind: 'css', selector: 'tbody > tr:nth-of-type(1) > td:nth-of-type(7) > button' },
    ]),
  ];

  it("slots the anchor's text, so it names the replay's record and not the recording's", () => {
    const [skill] = compile(anchored('r9-n2 RD Part A'), { runid: 'r9-n2' });
    const primary = skill.steps[0].locators.target[0] as { kind: string; hasText: string };
    expect(primary.kind).toBe('scoped');
    expect(primary.hasText).toContain('{{');
    // …and the slot is a known value, so replay holds fallbacks to it.
    const name = primary.hasText.match(/\{\{(v\d+)\}\}/)![1];
    expect(skill.params[name].known).toBe(true);
  });

  it('a READ that loses its anchor publishes nothing rather than reading by position', () => {
    // fwrd16-n3: the read fell back to `tbody > tr:nth-of-type(1) > td`,
    // resolved instantly on a list whose first row was a seed ticket, and
    // published ref RD-1014 at tier A with zero turns.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: ADD_PART, url: `${ORIGIN}/#/tickets`, fingerprint: [1, 0, 0] },
      step('read', { target: '@e9', what: 'text' }, [
        { kind: 'scoped', container: '#ticket-rows tr', hasText: 'r9-n1 RD Bench Ticket', selector: 'td:nth-of-type(1)' },
        { kind: 'css', selector: '#ticket-rows > tr:nth-of-type(1) > td:nth-of-type(1)' },
      ], { result: '"RD-1015"' }),
    ];
    const [skill] = compileSkills({
      entries,
      instruction: ADD_PART,
      report: { status: 'success', summary: 'Read the ref.', evidence: { values: { ref: 'RD-1015' } } },
      session: 's',
      now: '2026-08-27T00:00:00.000Z',
      knownValues: { runid: 'r9-n1' },
    });
    expect(skill.steps[0].locators.target).toEqual([]);
    expect(skill.steps[0].label).toBeUndefined(); // and it promises no output
  });

  it('keeps a read whose surviving fallback still NAMES the element', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: ADD_PART, url: `${ORIGIN}/#/tickets`, fingerprint: [1, 0, 0] },
      step('read', { target: '@e9', what: 'text' }, [
        { kind: 'scoped', container: '#ticket-rows tr', hasText: 'r9-n1 RD Bench Ticket', selector: 'td' },
        { kind: 'testid', attr: 'data-testid', value: 'list-summary' },
      ], { result: '"Showing 1-1 of 1"' }),
    ];
    const [skill] = compileSkills({
      entries,
      instruction: ADD_PART,
      report: { status: 'success', summary: 'Read it.', evidence: { values: { summary: 'Showing 1-1 of 1' } } },
      session: 's',
      now: '2026-08-27T00:00:00.000Z',
      knownValues: { runid: 'r9-n1' },
    });
    expect(skill.steps[0].locators.target.length).toBe(1);
    expect(skill.steps[0].locators.target[0].kind).toBe('testid');
  });

  it('drops an anchor stranded on the recorded run, rather than replaying it positionally', () => {
    // Nothing in THIS instruction types "r9-n1 RD Part Z" (it was created by an
    // earlier one), so no slot covers it: the anchor would miss every future
    // run, and carrying no marker it would also switch the identity guard off.
    const [skill] = compile(anchored('r9-n1 RD Part Z'), { runid: 'r9-n1' });
    const chain = skill.steps[0].locators.target;
    expect(chain.some((c) => c.kind === 'scoped')).toBe(false);
    expect(chain.length).toBe(1);
  });
});

describe('identity-guarded fallthrough (replay)', () => {
  const skill = (known: boolean): Skill =>
    ({ params: { v1: { example: 'r9-n2 RD Bench Ticket', usedIn: [1], ...(known ? { known: true as const } : {}) } } }) as unknown as Skill;

  it('reads the identity out of a text-bearing primary locator', () => {
    const primary = { kind: 'role', role: 'link', name: '{{v1}}' } as never;
    expect(identityOfPrimary([primary], skill(true), { v1: 'r9-n2 RD Bench Ticket' })).toEqual(['r9-n2 RD Bench Ticket']);
  });

  it('ignores a slot the compiler guessed — only caller-vouched values are identity', () => {
    const primary = { kind: 'role', role: 'link', name: '{{v1}}' } as never;
    expect(identityOfPrimary([primary], skill(false), { v1: 'r9-n2 RD Bench Ticket' })).toEqual([]);
  });

  it('ignores slots inside a selector: an address is not a name', () => {
    const primary = { kind: 'css', selector: '#row-{{v1}} > a' } as never;
    expect(identityOfPrimary([primary], skill(true), { v1: 'r9-n2 RD Bench Ticket' })).toEqual([]);
  });
});

describe('JSON-path provenance', () => {
  it('publishes identifier-like leaves of a read-back JSON body', () => {
    const body = JSON.stringify({ status: 'success', uid: 'dfwdzd27pk934b', slug: 'r9-n2-bench-dashboard', version: 2 });
    const paths = jsonLeaves(body).map((l) => l.path);
    expect(paths).toContain('uid');
    expect(paths).toContain('slug');
    expect(paths).not.toContain('status'); // a word, not an identifier
    expect(paths).not.toContain('version'); // too short to be a reference
  });

  it('resolves a {{step.output#path}} reference from the live run own read-back', () => {
    const outputs = { '03-step': { body: JSON.stringify({ dashboard: { uid: 'live-uid-99' } }) } };
    expect(lookupOutput(outputs, '03-step', 'body#dashboard.uid')).toBe('live-uid-99');
    expect(lookupOutput(outputs, '03-step', 'body#dashboard.missing')).toBeUndefined();
    expect(lookupOutput(outputs, '03-step', 'body')).toBe(outputs['03-step'].body);
  });

  it('threads a uid that never appeared in any url into the later step that uses it', () => {
    const body = JSON.stringify({ uid: 'dfwdzd27pk934b', url: '/d/dfwdzd27pk934b/x7-bench-dashboard' });
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Save the dashboard over the API and report the response body.', url: `${ORIGIN}/dashboard/new` },
      step('read', { target: '@e1', what: 'text' }, [], { result: JSON.stringify(body) }),
      { k: 'report', status: 'success', summary: 'saved', values: { body } } as RecordedEntry,
      { k: 'instruction', text: 'Open http://127.0.0.1:4180/d/dfwdzd27pk934b and confirm it renders.', url: `${ORIGIN}/dashboard/new` },
      step('goto', { url: `${ORIGIN}/d/dfwdzd27pk934b` }, []),
      { k: 'report', status: 'success', summary: 'rendered', values: {} } as RecordedEntry,
    ];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/dashboard/new`, vars: {}, session: 's', now: '2026-08-27T00:00:00.000Z' });
    expect(flow!.steps[1].instruction).toContain('#uid}}');
    expect(flow!.steps[1].instruction).not.toContain('dfwdzd27pk934b');
  });

  it('records each published leaf under its own name, so one volatile field cannot veto the rest', () => {
    // Before this, `recorded` held the whole body under `body`, so
    // noteOutputEvidence compared the entire JSON string: a response carrying
    // a minted uid AND anything per-run (a timestamp, an etag) differed every
    // run, and no leaf in it could ever be judged on its own.
    const body = JSON.stringify({ uid: 'dfwdzd27pk934b', slug: 'r9-n2-bench-dashboard', etag: 'w-8891' });
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Save the dashboard over the API and report the response body.', url: `${ORIGIN}/dashboard/new` },
      step('read', { target: '@e1', what: 'text' }, [], { result: body }),
      { k: 'report', status: 'success', summary: 'saved', values: { body } } as RecordedEntry,
    ];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/dashboard/new`, vars: {}, session: 's', now: '2026-08-27T00:00:00.000Z' })!;
    const save = flow.steps[0];
    expect(save.recorded['body#uid']).toBe('dfwdzd27pk934b');
    expect(save.recorded['body#slug']).toBe('r9-n2-bench-dashboard');

    // Run 2: the app re-derives the slug the same way and mints a new uid and
    // etag. The body as a whole differs, so the per-body comparison learns
    // nothing; per leaf, two verdicts are reachable.
    noteOutputEvidence(save, {
      body: JSON.stringify({ uid: 'kkq2m4vv91zzab', slug: 'r9-n2-bench-dashboard', etag: 'w-9042' }),
      'body#uid': 'kkq2m4vv91zzab',
      'body#slug': 'r9-n2-bench-dashboard',
      'body#etag': 'w-9042',
    });
    expect(save.outputEvidence).toMatchObject({
      body: { same: 0, differed: 1 },
      'body#uid': { same: 0, differed: 1 },
      'body#slug': { same: 1, differed: 0 },
    });

    // The minted uid is run-specific from now on, on its own evidence; the
    // slug that merely agreed is not condemned by its volatile sibling.
    const varying = varyingValues(flow);
    expect(varying.has('dfwdzd27pk934b')).toBe(true);
    expect(varying.has('r9-n2-bench-dashboard')).toBe(false);
  });

  it('does not referencize a route word out of a url (the {{01-open.url.h0}} = "tickets" bug)', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Open the app and sign in.', url: `${ORIGIN}/` },
      step('click', { target: '@e1' }, [], { diff: { url: `${ORIGIN}/#/tickets`, alerts: [], added: [] } }),
      { k: 'report', status: 'success', summary: 'in', values: {} } as RecordedEntry,
      { k: 'instruction', text: 'Verify no ticket from this run is left in the active tickets list.', url: `${ORIGIN}/#/tickets` },
      step('read', { target: '@e2', what: 'text' }, [], { result: '"none"' }),
      { k: 'report', status: 'success', summary: 'clean', values: {} } as RecordedEntry,
    ];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's', now: '2026-08-27T00:00:00.000Z' });
    expect(flow!.steps[1].instruction).toContain('active tickets list');
    expect(flow!.steps[1].instruction).not.toContain('url.h');
  });
});

describe('reference integrity', () => {
  it('never rewrites the inside of a reference an earlier pass placed', () => {
    // fwod5 (odoo): the url part "form" was provenance, and substituting it
    // everywhere corrupted an output NAME into
    // {{02-create.o_{{01-open.url.q.view_type}}_view_o_group_tabl}}.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Open the quotation form and report the totals table.', url: `${ORIGIN}/odoo/sales/new` },
      step('read', { target: '@e1', what: 'text' }, [], { result: '"x"' }),
      { k: 'report', status: 'success', summary: 'read', values: { o_form_view_group: '9,900' } } as RecordedEntry,
      { k: 'instruction', text: 'On the same quotation, confirm the total is still 9,900 and the view is a form.', url: `${ORIGIN}/odoo/sales/new` },
      step('read', { target: '@e2', what: 'text' }, [], { result: '"x"' }),
      { k: 'report', status: 'success', summary: 'ok', values: {} } as RecordedEntry,
    ];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/odoo/sales/new`, vars: { view: 'form' }, session: 's', now: '2026-08-27T00:00:00.000Z' });
    const instruction = flow!.steps[1].instruction;
    // The value is threaded under its (uncorrupted) output name, and the var
    // pass rewrote the standalone word only — never the middle of the name.
    expect(instruction).toContain('.o_form_view_group}}');
    expect(instruction).toContain('a {{view}}.');
    expect(instruction).not.toContain('o_{{view}}_view');
  });
});

describe('prose-cited record identifiers', () => {
  const report = (summary: string, values: Record<string, string> = {}) => ({ status: 'success' as const, summary, evidence: { values } });

  it('finds the app-minted reference a report left in prose', () => {
    expect(proseIdentifiers(report('Confirmed the quotation. The order reference is **S00021** and the total is 4,550.00.'))).toEqual(['S00021']);
  });

  it('ignores prices, counts and plain words', () => {
    expect(proseIdentifiers(report('Added 2 lines totalling 4,550.00 for the customer; the untaxed amount is 125.00.'))).toEqual([]);
  });

  it('skips a value evidence already carries', () => {
    expect(proseIdentifiers(report('Order S00021 confirmed.', { ref: 'S00021' }))).toEqual([]);
  });

  it('names the pinned value and puts it in evidence', () => {
    const r = report('Order S00021 confirmed.');
    const name = addEvidenceValue(r, 'o_statusbar span', 'S00021');
    expect(r.evidence.values[name]).toBe('S00021');
  });
});

describe('a self-navigating procedure is checked AFTER its goto', () => {
  it('refuses when the recorded url lands on another record', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    // fwod10: the goto carries the RECORDING run's record id, so "step 1
    // decides the page" decided it to be the wrong one. Steps 03-07 did this
    // run's work on n1's records at tier A and reported success; 1/6 verified.
    const skill = {
      id: 's_nav', origin: 'http://x.test', template: 't',
      params: { v1: { example: 'n1 Bench Customer', usedIn: [], known: true as const } },
      preconditions: { urlPattern: 'http://x.test/rec/:id', requireText: ['{{v1}}'] },
      steps: [
        { tool: 'goto', args: { url: 'http://x.test/rec/44' }, locators: {} },
        { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Edit' }] } },
      ],
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
    } as unknown as Skill;
    const ran: string[] = [];
    const page = {
      url: () => 'http://x.test/rec/44',
      async goto() {},
      // The landed page shows n1's record, never n2's.
      locator: () => ({ count: async () => 0, first: () => ({ textContent: async () => '' }) }),
      async content() { return '<html>n1 Bench Customer</html>'; },
      async evaluate(_fn: unknown, arg: unknown) { return isObserveArg(arg) ? documentOf(['- heading "n1 Bench Customer"']) : 'n1 Bench Customer'; },
      async waitForLoadState() {},
    } as unknown as import('playwright-core').Page;
    const out = await replaySkill(skill, { v1: 'n2 Bench Customer' }, {
      page,
      exec: async (tool) => { ran.push(tool); return { result: 'ok' }; },
    });
    // NOT refused: refused means "nothing ran, try another candidate", and the
    // goto has already moved the browser. It is a partial stop, so the caller
    // hands it to recovery instead of replaying a sibling from a page nobody
    // expects.
    expect(out.refused).toBe(false);
    // The gate sits before step 2, the first that acts on the page: that is the step it stopped.
    expect(out.failedAt).toBe(2);
    expect(out.wrongRecord).toMatch(/different record/);
    // The goto ran — that is how we learn where it lands. Nothing after it did.
    expect(ran).toEqual(['goto']);
    expect(out.stepsRun).toBe(1); // the goto ran and is not pretended away
  });

  /**
   * fwgr39-n3 05-set: the url carried this run's own record, and a second
   * marker ("Last 6 hours", a setting) was not rendered. The url has answered
   * which record this is, so the missing marker is stale: a warning, and the
   * work runs (identityMarkerVerdict).
   */
  it('runs with a stale-marker warning when the url names this run’s record', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const skill = {
      id: 's_stale', origin: 'http://x.test', template: 't',
      params: { v1: { example: '41', usedIn: [], known: true as const }, v2: { example: 'Last 6 hours', usedIn: [], known: true as const } },
      preconditions: { urlPattern: 'http://x.test/rec/{{v1}}', requireText: ['{{v2}}'] },
      steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Edit' }] } }],
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
    } as unknown as Skill;
    const pageAt = (url: string) => ({
      url: () => url,
      async goto() {},
      getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
      locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
      async evaluate(_fn: unknown, arg: unknown) { return isObserveArg(arg) ? documentOf(['- heading "Record 44"', '- button "Edit"']) : ''; },
      async waitForLoadState() {},
    }) as unknown as import('playwright-core').Page;

    const ran: string[] = [];
    const out = await replaySkill(skill, { v1: '44', v2: 'Last 6 hours' }, { page: pageAt('http://x.test/rec/44'), exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } });
    expect(out.refused, out.reason).toBeFalsy();
    expect(out.wrongRecord).toBeUndefined();
    expect(ran).toEqual(['click']);
    expect(out.warnings.some((w) => /"Last 6 hours" is not on the page, but the url names this run's record \(path\[1\]=44\) — the marker is stale/.test(w))).toBe(true);

    // The same missing marker where the url names no record still refuses.
    const wild = { ...skill, preconditions: { urlPattern: 'http://x.test/rec/:id', requireText: ['{{v2}}'] } } as Skill;
    const refused = await replaySkill(wild, { v1: '44', v2: 'Last 6 hours' }, { page: pageAt('http://x.test/rec/44'), exec: async () => ({ result: 'ok' }) });
    expect(refused.refused).toBe(true);
    expect(refused.wrongRecord).toMatch(/different record/);
  });

  /**
   * ROBUSTNESS.md finding 4: a look that could not cover the page (here the
   * element cap) has not shown the marker ABSENT. The step stops just the
   * same — nothing confirmed the record — but as an unconfirmed identity,
   * marked unobserved, not as a proven wrong record (which would send the flow
   * runner back to its start url on no evidence).
   */
  it('stops on an identity it could not confirm, without calling it a different record', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const skill = {
      id: 's_nav', origin: 'http://x.test', template: 't',
      params: { v1: { example: 'n1 Bench Customer', usedIn: [], known: true as const } },
      preconditions: { urlPattern: 'http://x.test/rec/:id', requireText: ['{{v1}}'] },
      steps: [
        { tool: 'goto', args: { url: 'http://x.test/rec/44' }, locators: {} },
        { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Edit' }] } },
      ],
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
    } as unknown as Skill;
    const ran: string[] = [];
    let looks = 0;
    const page = {
      url: () => 'http://x.test/rec/44',
      async goto() {},
      locator: () => ({ count: async () => 0, first: () => ({ textContent: async () => '' }) }),
      async evaluate(_fn: unknown, arg: unknown) {
        if (!isObserveArg(arg)) return undefined;
        looks++;
        return documentOf(['- heading "n1 Bench"'], [], { nodesTruncated: true });
      },
      async waitForLoadState() {},
    } as unknown as import('playwright-core').Page;
    const out = await replaySkill(skill, { v1: 'n2 Bench Customer' }, { page, exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } });
    expect(ran).toEqual(['goto']);
    expect(out.ok).toBe(false);
    expect(out.failedAt).toBe(2);
    expect(out.wrongRecord).toBeUndefined();
    expect(out.reason).toMatch(/^could not confirm that the page at .* shows "n2 Bench Customer" \(capture incomplete: the element cap was reached/);
    expect(out.unobserved).toContain('identity');
    // the goto's own alert looks (before and after it), then identity: asked,
    // the page swept, and asked again
    expect(looks).toBe(4);
  });

  /**
   * fwgr47-n2 07-verify: the skill's step 1 is a `goto` to a BARE dashboard
   * url, grafana renders the title and rewrites the address bar a moment
   * later, and replay judged identity during the boot — "does not show
   * 'fwgr47-n2 Bench Dashboard' … but is a different record" on the RIGHT
   * dashboard (that run's verifier: obj 6 PASS, uid bfyfuaptu20aoa). The
   * compiled artifact polls IDENTITY_WAIT_MS here and did not stop; replay
   * asked once. Both wait now.
   */
  it('waits for a marker on a page that has not finished arriving', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    process.env.SITELOOPER_IDENTITY_WAIT_MS = '800';
    try {
      const skill = {
        id: 's_37b2bd', origin: 'http://x.test', template: 't',
        params: { v2: { example: 'n1 Bench Dashboard', usedIn: [], known: true as const } },
        preconditions: { urlPattern: 'http://x.test/d/:id/{{v2}}?from={{v2}}', requireText: ['{{v2}}'] },
        steps: [
          { tool: 'goto', args: { url: 'http://x.test/d/bfyfuaptu20aoa' }, locators: {} },
          { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Edit' }] } },
        ],
        stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
        status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
      } as unknown as Skill;
      const ran: string[] = [];
      let identityLooks = 0;
      const page = {
        // The address bar stays the bare url the goto asked for: the wait is
        // for the PAGE, and nothing about the url rescues this one.
        url: () => 'http://x.test/d/bfyfuaptu20aoa',
        async goto() {},
        getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        async evaluate(_fn: unknown, arg: unknown) {
          if (!isObserveArg(arg)) return '';
          // The dashboard title only renders once the boot is done.
          return documentOf(identityLooks++ < 3 ? ['- heading "Loading"'] : ['- heading "fwgr47-n2 Bench Dashboard"', '- button "Edit"']);
        },
        async waitForLoadState() {},
      } as unknown as import('playwright-core').Page;
      const out = await replaySkill(skill, { v2: 'fwgr47-n2 Bench Dashboard' }, { page, exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } });
      expect(out.wrongRecord, out.reason ?? '').toBeUndefined();
      expect(out.reason ?? null).toBeNull();
      expect(ran).toEqual(['goto', 'click']);
    } finally {
      process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';
    }
  });

  /**
   * The other half of fwgr47: the url escape hatch was unavailable in the
   * instant replay looked, because the pattern's bound query keys were missing
   * from a url the app had not rewritten yet (urlDiff, and with it
   * urlRecordParts, says null). The verdict therefore asks the url AFTER the
   * wait, not at the first look.
   */
  it('asks the url again once the wait is spent, not only at the first look', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    process.env.SITELOOPER_IDENTITY_WAIT_MS = '800';
    try {
      const skill = {
        id: 's_late', origin: 'http://x.test', template: 't',
        params: {
          v1: { example: 'n1-bench-dashboard', usedIn: [], known: true as const },
          v2: { example: 'Last 6 hours', usedIn: [], known: true as const },
        },
        preconditions: { urlPattern: 'http://x.test/d/:id/{{v1}}?from={{v2}}', requireText: ['{{v2}}'] },
        // As fwgr47's 07-verify: a goto, then the page-dependent step the
        // segment gate sits before — so identity is asked of the landing.
        steps: [
          { tool: 'goto', args: { url: 'http://x.test/d/abc123/n1-bench-dashboard' }, locators: {} },
          { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Edit' }] } },
        ],
        stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
        status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
      } as unknown as Skill;
      // Bare at first — no `from`, so urlRecordParts cannot answer — then
      // normalised by the app, carrying this run's own slug.
      let looks = 0;
      const urlsSeen: string[] = [];
      const page = {
        url: () => {
          const u = looks < 3 ? 'http://x.test/d/abc123/fwgr47-n2-bench-dashboard' : 'http://x.test/d/abc123/fwgr47-n2-bench-dashboard?from=Last%206%20hours';
          if (looks >= 2) urlsSeen.push(u); // from the identity gate on; the goto's own looks come first
          return u;
        },
        async goto() {},
        getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        async evaluate(_fn: unknown, arg: unknown) {
          if (!isObserveArg(arg)) return '';
          looks++;
          // "Last 6 hours" is a SETTING this view never renders (fwgr39-n3).
          return documentOf(['- heading "fwgr47-n2 Bench Dashboard"', '- button "Edit"']);
        },
        async waitForLoadState() {},
      } as unknown as import('playwright-core').Page;
      const ran: string[] = [];
      const out = await replaySkill(skill, { v1: 'fwgr47-n2-bench-dashboard', v2: 'Last 6 hours' }, { page, exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } });
      expect(out.wrongRecord, out.reason ?? '').toBeUndefined();
      expect(ran).toEqual(['goto', 'click']);
      // The url the FIRST look saw could not answer: no `from`, so urlDiff —
      // and with it urlRecordParts — said null. The wait is what changed that.
      expect(urlsSeen[0]).not.toMatch(/from=/);
      expect(out.warnings.some((w) => /the url names this run's record \(path\[2\]=fwgr47-n2-bench-dashboard, from=Last 6 hours\) — the marker is stale/.test(w)), JSON.stringify(out.warnings)).toBe(true);
    } finally {
      process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';
    }
  });

  /**
   * MUST STILL CATCH. On odoo the url is `id=:id` throughout: no url part is
   * ever MARKED, so urlRecordParts names no record however often it is asked,
   * and the marker is the only identity there is. Waiting changes what is
   * asked, never what is decided — the wrong record still hard-stops, with the
   * same words and no stale-marker warning.
   */
  it('changes nothing where no url part is marked (odoo)', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    process.env.SITELOOPER_IDENTITY_WAIT_MS = '400';
    try {
      const skill = {
        id: 's_odoo', origin: 'http://x.test', template: 't',
        params: { v2: { example: 'S00021', usedIn: [], known: true as const } },
        preconditions: { urlPattern: 'http://x.test/web#id=:id&model=sale.order', requireText: ['Sales Order {{v2}}'] },
        steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Cancel' }] } }],
        stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
        status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
      } as unknown as Skill;
      const ran: string[] = [];
      const page = {
        // The run asked for S00024; the browser is on S00019's page, and the
        // url cannot tell the two apart — it never could.
        url: () => 'http://x.test/web#id=19&model=sale.order&cids=1',
        async goto() {},
        getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        async evaluate(_fn: unknown, arg: unknown) {
          return isObserveArg(arg) ? documentOf(['- heading "Sales Order S00019"', '- button "Cancel"']) : '';
        },
        async waitForLoadState() {},
      } as unknown as import('playwright-core').Page;
      const out = await replaySkill(skill, { v2: 'S00024' }, { page, exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } });
      expect(out.refused).toBe(true);
      expect(out.wrongRecord).toMatch(/does not show "Sales Order S00024" — it matches this procedure's page template but is a different record/);
      expect(out.warnings.some((w) => /the marker is stale/.test(w))).toBe(false);
      expect(ran).toEqual([]);
    } finally {
      process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';
    }
  });

  /**
   * MUST STILL CATCH. A goto retargeted to the RECORDING's record carries the
   * recording's values, so urlRecordParts' judge rejects it (the marked part
   * is not this run's value) and the marker goes on deciding: a url naming
   * record A with a marker saying record B stops, however long it is waited.
   */
  it('still stops when the url names another run’s record', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    process.env.SITELOOPER_IDENTITY_WAIT_MS = '400';
    try {
      const skill = {
        id: 's_other', origin: 'http://x.test', template: 't',
        params: { v1: { example: 'n1-bench-dashboard', usedIn: [], known: true as const } },
        preconditions: { urlPattern: 'http://x.test/d/:id/{{v1}}', requireText: ['{{v1}}'] },
        // The recorded goto carries the RECORDING's record, and nothing this
        // run watched vary retargets it (fwod10): the landing is n1's page.
        steps: [
          { tool: 'goto', args: { url: 'http://x.test/d/abc123/n1-bench-dashboard' }, locators: {} },
          { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Edit' }] } },
        ],
        stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
        status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
      } as unknown as Skill;
      const ran: string[] = [];
      const page = {
        url: () => 'http://x.test/d/abc123/n1-bench-dashboard',
        async goto() {},
        getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
        async evaluate(_fn: unknown, arg: unknown) {
          return isObserveArg(arg) ? documentOf(['- heading "n1 Bench Dashboard"', '- button "Edit"']) : '';
        },
        async waitForLoadState() {},
      } as unknown as import('playwright-core').Page;
      const out = await replaySkill(skill, { v1: 'fwgr47-n2-bench-dashboard' }, { page, exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } });
      // A partial stop, not a refusal: the goto has already moved the browser.
      expect(out.wrongRecord).toMatch(/different record/);
      expect(out.failedAt).toBe(2);
      expect(out.warnings.some((w) => /the marker is stale/.test(w))).toBe(false);
      expect(ran).toEqual(['goto']);
    } finally {
      process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';
    }
  });
});

describe('a step that MINTS a record is known as such', () => {
  it('compiles `mints` from the url that first carried the identifier', async () => {
    const { compileSkill } = await import('../src/skills/compile.js');
    const instr = 'Create a quotation for Bench Customer.';
    const skill = compileSkill({
      entries: [
        { k: 'instruction', text: instr, url: 'http://x.test/orders' },
        { k: 'step', tool: 'click', args: { target: '@e1' },
          locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'New' }] } } },
        { k: 'step', tool: 'click', args: { target: '@e2' },
          locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Save' }] } },
          // Only after Save does an order id exist.
          diff: { url: 'http://x.test/orders/S00021', alerts: [], added: [] } },
        { k: 'step', tool: 'click', args: { target: '@e3' },
          locators: { target: { expr: 'x', verified: true, raw: '@e3', chain: [{ kind: 'role', role: 'button', name: 'Confirm' }] } } },
      ],
      instruction: instr,
      report: { status: 'success', summary: 'made S00021', evidence: { values: { ref: 'S00021' } } },
      session: 's',
    })!;
    const minting = skill.steps.filter((s) => s.mints);
    expect(minting).toHaveLength(1);

    // The SAVE step, not the New click before it and not the Confirm after.
    expect(skill.steps.indexOf(minting[0])).toBe(1);
    expect(minting[0].mints!.at).toBeTruthy();
  });

  it('tells recovery what THIS run created, not what the recording did', async () => {
    const { renderReplay } = await import('../src/skills/replay.js');
    const skill = { id: 's_mint', steps: [{}, {}] } as unknown as Skill;
    // `created` is filled as each minting step runs, by reading the live url
    // through the `at` label compile stored — so it holds S00099, this run's
    // order, never the recorded S00021.
    const res = {
      ok: false, refused: false, stepsRun: 1, stepsTotal: 2, failedAt: 2,
      lines: ['1. click → ok'], warnings: [], values: {}, misses: [],
      derivedValues: {}, generalisations: [], candidateEvidence: [],
      created: ['S00099'], similarity: null, fallthroughs: 0,
    } as unknown as import('../src/skills/replay.js').ReplayResult;
    const prelude = renderReplay(skill, res);
    expect(prelude).toContain('ALREADY CREATED');
    expect(prelude).toContain('S00099');
    expect(prelude).not.toContain('S00021');
    expect(prelude).toMatch(/silent duplicate/);
  });

  it('falls back to the generic warning when nothing was minted', async () => {
    const { renderReplay } = await import('../src/skills/replay.js');
    const skill = { id: 's_plain', steps: [{}, {}] } as unknown as Skill;
    const res = {
      ok: false, refused: false, stepsRun: 1, stepsTotal: 2, failedAt: 2,
      lines: [], warnings: [], values: {}, misses: [], derivedValues: {},
      generalisations: [], candidateEvidence: [], created: [], similarity: null, fallthroughs: 0,
    } as unknown as import('../src/skills/replay.js').ReplayResult;
    const prelude = renderReplay(skill, res);
    expect(prelude).not.toContain('ALREADY CREATED');
    expect(prelude).toMatch(/may already exist/);
  });
});

describe('a replay that acted is never retried by a sibling', () => {
  it('marks `acted` when the action fired, even if the step did not complete', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const skill = {
      id: 's_act', origin: 'http://x.test', template: 't', params: {},
      preconditions: { urlPattern: 'http://x.test/orders' },
      steps: [
        // The click fires; the expectation then fails. stepsRun stays 0 —
        // which the caller used to read as "the page was not touched".
        { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Create' }] },
          expect: { urlPattern: 'http://x.test/nowhere/:id' } },
      ],
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
    } as unknown as Skill;
    const fired: string[] = [];
    const page = {
      url: () => 'http://x.test/orders',
      async goto() {}, async content() { return '<html></html>'; },
      async evaluate() { return ''; }, async waitForLoadState() {},
      getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
      locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
    } as unknown as import('playwright-core').Page;
    const out = await replaySkill(skill, {}, {
      page,
      exec: async (tool) => { fired.push(tool); return { result: 'ok' }; },
    });
    expect(fired).toEqual(['click']); // the action really did fire
    expect(out.stepsRun).toBe(0); // ...and the step still did not complete
    expect(out.acted).toBe(true); // which is exactly what `acted` records
    expect(out.ok).toBe(false);
  });

  it('does not mark `acted` for a read', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const skill = {
      id: 's_read', origin: 'http://x.test', template: 't', params: {},
      preconditions: { urlPattern: 'http://x.test/orders' },
      steps: [{ tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'role', role: 'link', name: 'Ref' }] }, label: 'ref' }],
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
    } as unknown as Skill;
    const page = {
      url: () => 'http://x.test/orders',
      async goto() {}, async content() { return '<html></html>'; },
      async evaluate() { return ''; }, async waitForLoadState() {},
      getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
      locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
    } as unknown as import('playwright-core').Page;
    const out = await replaySkill(skill, {}, { page, exec: async () => ({ result: '"S1"' }) });
    expect(out.acted).toBe(false); // observing is not acting
  });
});

describe('a two-digit record id still marks its minting step', () => {
  it('accepts a bare numeric url id, which is what odoo uses', async () => {
    const { compileSkill } = await import('../src/skills/compile.js');
    const instr = 'Create a contact named Bench Customer.';
    // fwod15 compiled ZERO minting steps because odoo's ids are two-digit
    // integers and the floor here was four characters — while the url-pattern
    // code has always treated a bare number in a url as an id. Position is
    // the evidence: "44" free in prose means nothing, "44" in a url part is
    // a record.
    const skill = compileSkill({
      entries: [
        { k: 'instruction', text: instr, url: 'http://x.test/web#model=res.partner' },
        { k: 'step', tool: 'click', args: { target: '@e1' },
          locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Save' }] } },
          diff: { url: 'http://x.test/web#id=44&model=res.partner', alerts: [], added: [] } },
        { k: 'step', tool: 'click', args: { target: '@e2' },
          locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Close' }] } } },
      ],
      instruction: instr,
      report: { status: 'success', summary: 'made it', evidence: { values: {} } },
      session: 's',
    })!;
    const minting = skill.steps.filter((s) => s.mints);
    expect(minting).toHaveLength(1);
    expect(skill.steps.indexOf(minting[0])).toBe(0); // the Save, not the Close
  });
});

/**
 * A slot the run could not fill, asked of a step that ACTS (Section F).
 *
 * "Asks for no particular value" is what every marker CHECK here reads an
 * unfilled `{{vN}}`/`{{dN}}` as — checkIdentity skips one, markersBound
 * refuses one, urlDiff treats one as a wildcard — and it is the wrong reading
 * for an action: `fillParams` leaves the marker standing, so a `type` puts
 * those five characters into a live field and a locator hunts the page for
 * them. The shared predicate (unfilledSlotVerdict, src/execution/gates.ts) is
 * asked of a step's filled args and its locator chains before it dispatches.
 *
 * A derived slot no run minted is the reachable shape of it in replay: a
 * `{{dN}}` is never declared in `skill.params`, so the "missing params"
 * refusal at the top of replaySkill — which does catch an undeclared caller
 * slot — never sees it.
 */
describe('a step never acts on a slot the run could not fill', () => {
  const skillWith = (steps: unknown[]): Skill =>
    ({
      id: 's_slot', origin: 'http://x.test', template: 't',
      params: {},
      // p3 is not a position this url has, so nothing ever binds d1.
      derived: { d1: { step: 1, at: 'p3', example: 'ORD-1' } },
      preconditions: { urlPattern: 'http://x.test/rec' },
      steps,
      stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated', provenance: { session: 's', instruction: 't', created: '' },
    }) as unknown as Skill;

  const pageOf = () =>
    ({
      url: () => 'http://x.test/rec',
      async goto() {},
      getByRole: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
      locator: () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) }),
      async evaluate(_fn: unknown, arg: unknown) { return isObserveArg(arg) ? documentOf(['- textbox "Name"']) : ''; },
      async waitForLoadState() {},
    }) as unknown as import('playwright-core').Page;

  const GOTO = { tool: 'goto', args: { url: 'http://x.test/rec' }, locators: {} };

  it('falls back rather than typing the literal marker', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const ran: string[] = [];
    const out = await replaySkill(
      skillWith([GOTO, { tool: 'type', args: { target: '@e1', text: '{{d1}}' }, locators: { target: [{ kind: 'role', role: 'textbox', name: 'Name' }] } }]),
      {},
      { page: pageOf(), exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } },
    );
    expect(out.ok).toBe(false);
    expect(out.failedAt).toBe(2);
    expect(out.reason).toMatch(/^step 2: \{\{d1\}\} was left unbound/);
    // A fallback, not a hard stop: the daemon hands the step to the model
    // (server.ts `fellBack`). Nothing was dispatched at step 2.
    expect(ran).toEqual(['goto']);
  });

  /**
   * A chain is a PREFERENCE ORDER, not a conjunction (fwod34 s_eee5b1 step 2:
   * two `#name_{{d2}}` rungs behind a role and a placeholder rung that resolve
   * perfectly well). A dead rung is dropped; only a chain with none left is a
   * step that cannot name what it acts on.
   */
  it('drops a dead locator rung and acts through the rung behind it', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const ran: string[] = [];
    const out = await replaySkill(
      skillWith([
        GOTO,
        { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#name_{{d1}}' }, { kind: 'role', role: 'button', name: 'Open' }] } },
      ]),
      {},
      { page: pageOf(), exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } },
    );
    expect(out.reason ?? '').not.toMatch(/left unbound|no way left/);
    expect(ran).toEqual(['goto', 'click']);
  });

  it('refuses only when every rung of the chain is dead', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const ran: string[] = [];
    const out = await replaySkill(
      skillWith([
        GOTO,
        { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#name_{{d1}}' }, { kind: 'css', selector: 'div#name_{{d1}} > a' }] } },
      ]),
      {},
      { page: pageOf(), exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } },
    );
    expect(out.reason).toMatch(/^step 2: every recorded locator for target names \{\{d1\}\}/);
    expect(ran).toEqual(['goto']);
  });

  it('leaves a read alone: a check that asks for nothing keeps asking for nothing', async () => {
    const { replaySkill } = await import('../src/skills/replay.js');
    const ran: string[] = [];
    const out = await replaySkill(
      skillWith([GOTO, { tool: 'read', args: { target: '@e1', label: 'name' }, locators: { target: [{ kind: 'role', role: 'textbox', name: '{{d1}}' }] } }]),
      {},
      { page: pageOf(), exec: async (tool) => { ran.push(tool); return { result: 'ok' }; } },
    );
    expect(out.reason ?? '').not.toMatch(/left unbound/);
    expect(ran).toContain('read');
  });
});
