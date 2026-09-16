import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import {
  ignorableRefs,
  leadingValue,
  pruneUnsourcedOutputs,
  consumedReportedOutputs, consumedUrlOutputs, buildFlow, lintFlowRefs, lintUnpublishedOutputs, liveReadsFor, looksLikeReportedData, noteOutputEvidence, recoveryRoute, resolveInstruction, resolveStepParams, softResolveInstruction, unbankedMutations, unreportedOutputs, urlOutputs, valueLineCandidates, varyingValues, type Flow, type FlowStep } from '../src/skills/flow.js';
import { bindSkill, publishedOutputs, synthesizeReport } from '../src/skills/learn.js';
import { SkillStore, type Skill, type SkillStep } from '../src/skills/store.js';
import { compileSkill, dropDeadReadLocators } from '../src/skills/compile.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-flow-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ORIGIN = 'http://127.0.0.1:4180';

/** A session recording: two instructions, each with a report entry, as the loop writes them. */
function recording(): RecordedEntry[] {
  return [
    { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} },
    { k: 'instruction', text: "Sign in and create a ticket titled 'fr1 RD Bench Ticket'; report its ref id.", url: `${ORIGIN}/` },
    { k: 'step', tool: 'fill', args: { target: '@e1', value: 'fr1 RD Bench Ticket' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'label', label: 'Title' }] } } },
    { k: 'report', status: 'success', summary: "Created ticket 'fr1 RD Bench Ticket', ref RD-1015.", values: { ref: 'RD-1015', title: 'fr1 RD Bench Ticket' }, skill: 's_create' },
    { k: 'instruction', text: "On ticket RD-1015, add a part named 'fr1 RD Part A' with cost 100 and markup 25; report the price.", url: `${ORIGIN}/#/tickets/t15` },
    { k: 'step', tool: 'fill', args: { target: '@e2', value: 'fr1 RD Part A' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'label', label: 'Name' }] } } },
    { k: 'report', status: 'success', summary: 'Added part; price 125.00.', values: { price: '125.00' }, skill: 's_addpart' },
  ];
}

describe('buildFlow', () => {
  it('turns declared vars and earlier outputs into references, and pins skills', () => {
    const flow = buildFlow(recording(), {
      name: 'ticketflow',
      origin: ORIGIN,
      startUrl: `${ORIGIN}/`,
      vars: { runid: 'fr1' },
      session: 's',
      now: '2026-08-23T00:00:00Z',
    });
    expect(flow).toBeTruthy();
    expect(flow!.vars).toEqual(['runid']);
    expect(flow!.steps).toHaveLength(2);
    const [s1, s2] = flow!.steps;
    // runid became {{runid}} everywhere
    expect(s1.instruction).toBe("Sign in and create a ticket titled '{{runid}} RD Bench Ticket'; report its ref id.");
    expect(s1.skill).toBe('s_create');
    expect(s1.outputs).toEqual(['ref', 'title']);
    // step 2 referenced RD-1015 (step 1's `ref` output) → becomes {{01-....ref}}, and runid → {{runid}}
    expect(s2.instruction).toMatch(/On ticket \{\{01-\w+\.ref\}\}, add a part named '\{\{runid\}\} RD Part A'/);
    expect(s2.skill).toBe('s_addpart');
  });

  it('captures each step skill param bindings, with references, via the bind callback', () => {
    // bind() returns the slot values the skill would have been given at record time.
    const bind = (id: string, instr: string): Record<string, string> | null => {
      if (id === 's_create') return { v1: /titled '([^']+)'/.exec(instr)![1] };
      if (id === 's_addpart') {
        const m = /named '([^']+)' with cost (\d+) and markup (\d+)/.exec(instr)!;
        return { v1: m[1], v2: m[2], v3: m[3] };
      }
      return null;
    };
    const flow = buildFlow(recording(), { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: { runid: 'fr1' }, session: 's', bind })!;
    // create: the title slot is the runid + a constant → the runid becomes a ref
    expect(flow.steps[0].params).toEqual({ v1: '{{runid}} RD Bench Ticket' });
    // add: name carries the runid ref; cost/markup are constants kept literal
    expect(flow.steps[1].params).toEqual({ v1: '{{runid}} RD Part A', v2: '100', v3: '25' });
  });

  it('falls back to the params the recording replayed a skill with when its template binds nothing (fwrd51 03-add)', () => {
    const entries = recording();
    // The agent replayed s_addpart itself, under wording the template does not match.
    (entries[6] as { skillParams?: Record<string, string> }).skillParams = { v1: 'fr1 RD Part A', v2: '100', v3: 'RD-1015' };
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: { runid: 'fr1' }, session: 's', bind: () => null })!;
    expect(flow.steps[0].params).toBeUndefined();
    expect(flow.steps[1].params).toEqual({ v1: '{{runid}} RD Part A', v2: '100', v3: `{{${flow.steps[0].id}.ref}}` });
  });

  it('drops instructions that did not end in success', () => {
    const entries = recording();
    (entries[3] as { status: string }).status = 'blocked';
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' });
    expect(flow!.steps).toHaveLength(1);
    expect(flow!.steps[0].skill).toBe('s_addpart');
  });
});

describe('resolveInstruction', () => {
  const step: FlowStep = {
    id: '02-add',
    instruction: "On ticket {{01-create.ref}}, add '{{runid}} RD Part A' cost {{cost}}",
    outputs: [],
    recorded: {},
  };
  it('fills vars and prior outputs, and reports what is missing', () => {
    const r = resolveInstruction(step, { runid: 'z9', cost: '100' }, { '01-create': { ref: 'RD-1099' } });
    expect(r.text).toBe("On ticket RD-1099, add 'z9 RD Part A' cost 100");
    expect(r.missing).toEqual([]);
  });
  it('halts on an unresolved reference rather than substituting nothing', () => {
    const r = resolveInstruction(step, { runid: 'z9' }, {});
    expect(r.missing).toContain('01-create.ref');
    expect(r.missing).toContain('cost');
    expect(r.text).toContain('{{01-create.ref}}'); // left intact, not blanked
  });

  it('softResolveInstruction keeps what resolves and blanks unthreaded refs', () => {
    const st: FlowStep = { id: '02', instruction: "open the ticket with reference {{01.ref}} (title '{{runid}} Bench')", outputs: [], recorded: {} };
    // ref unthreaded, runid known → the id clause blanks, the title survives
    expect(softResolveInstruction(st, { runid: 'z9' }, {})).toBe("open the ticket with reference (title 'z9 Bench')");
    // both known → fully resolved
    expect(softResolveInstruction(st, { runid: 'z9' }, { '01': { ref: 'RD-9' } })).toBe("open the ticket with reference RD-9 (title 'z9 Bench')");
  });

  it('resolveStepParams fills stored bindings from vars and prior outputs', () => {
    const withParams: FlowStep = { ...step, params: { v1: '{{runid}} RD Part A', v2: '{{01-create.ref}}' } };
    const ok = resolveStepParams(withParams, { runid: 'z9' }, { '01-create': { ref: 'RD-1099' } });
    expect(ok).toEqual({ params: { v1: 'z9 RD Part A', v2: 'RD-1099' }, missing: [] });
    const bad = resolveStepParams(withParams, {}, {});
    expect(bad!.missing).toEqual(expect.arrayContaining(['runid', '01-create.ref']));
    expect(resolveStepParams(step, {}, {})).toBeNull(); // no stored params
  });
});

describe('bindSkill', () => {
  it('binds a pinned skill by reading its template as a pattern, any status', () => {
    const skill = compileSkill({
      entries: [
        { k: 'instruction', text: "add a part named 'x7 RD Part A' with cost 100 and markup 25", url: `${ORIGIN}/#/tickets/t15` },
        { k: 'step', tool: 'fill', args: { target: '@e1', value: 'x7 RD Part A' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'label', label: 'Name' }] } } },
        { k: 'step', tool: 'fill', args: { target: '@e2', value: '100' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'label', label: 'Cost' }] } } },
        { k: 'step', tool: 'fill', args: { target: '@e3', value: '25' }, locators: { target: { expr: 'x', verified: true, raw: '@e3', chain: [{ kind: 'label', label: 'Markup' }] } } },
      ],
      instruction: "add a part named 'x7 RD Part A' with cost 100 and markup 25",
      report: { status: 'success', summary: 'ok', evidence: { values: {} } },
      session: 's',
    })!;
    expect(skill.status).toBe('provisional'); // bindSkill ignores status, unlike matchTemplate
    expect(bindSkill(skill, "add a part named 'q9 RD Part B' with cost 300 and markup 40")).toEqual({ v1: 'q9 RD Part B', v2: '300', v3: '40' });
    expect(bindSkill(skill, 'something completely different')).toBeNull();
  });
});

describe('synthesizeReport honesty', () => {
  const skill = compileSkill({
    entries: [
      { k: 'instruction', text: "add a part named 'x7 RD Part A' with cost 100", url: `${ORIGIN}/#/tickets/t15` },
      { k: 'step', tool: 'fill', args: { target: '@e1', value: 'x7 RD Part A' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'label', label: 'Name' }] } } },
    ],
    instruction: "add a part named 'x7 RD Part A' with cost 100",
    report: { status: 'success', summary: "Added 'x7 RD Part A' to ticket RD-1017; price 125.00.", evidence: { values: { part: 'x7 RD Part A', ticket: 'RD-1017', price: '125.00' } } },
    session: 's',
  })!;

  it('keeps parameter-derived and live values, drops stale recorded literals', () => {
    // no live reads: only the parameter-derived `part` survives; ticket/price were recorded literals → dropped
    const r = synthesizeReport(skill, { v1: 'q9 RD Part B' }, {});
    expect(r.evidence!.values).toEqual({ part: 'q9 RD Part B' });
    expect(r.summary).not.toContain('RD-1017');
    expect(r.summary).not.toContain('125.00');
    expect(r.details).toMatch(/omitted/);
  });

  it('a live read-back overrides and is reported verbatim', () => {
    const r = synthesizeReport(skill, { v1: 'q9 RD Part B' }, { price: '375.00', ticket: 'RD-1099' });
    expect(r.evidence!.values).toMatchObject({ part: 'q9 RD Part B', price: '375.00', ticket: 'RD-1099' });
  });

  it('compares loosely, so punctuation cannot smuggle a stale literal through', () => {
    // fwrd19l stored the app's validation message twice: the summary kept its
    // "-" bullets, the values copy had them collapsed. An exact substring test
    // missed by that one character and published the recording run's part
    // names as this run's observation.
    const bulleted = compileSkill({
      entries: [
        { k: 'instruction', text: "mark ticket ready", url: `${ORIGIN}/#/tickets/t15` },
        { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Mark Ready' }] } } },
      ],
      instruction: 'mark ticket ready',
      report: {
        status: 'success',
        summary: `Validation message: 'Ticket is not ready - Part "x7 RD Part A" has no supplier'. Then marked ready.`,
        evidence: { values: { message: 'Ticket is not ready Part "x7 RD Part A" has no supplier' } },
      },
      session: 's',
    })!;
    const r = synthesizeReport(bulleted, {}, {});
    expect(r.summary).not.toContain('x7 RD Part A');
    expect(r.summary).toMatch(/Replayed stored procedure/);
  });

  it('drops a summary still naming the RECORDING run, even when nothing else is stale', () => {
    // The param filled cleanly, so the old rule saw no stale value at all —
    // but the prose still carries the recorded example beside it.
    const r = synthesizeReport(
      { ...skill, reportTemplate: { summary: "Edited '{{v1}}', the sibling of 'x7 RD Part A'.", values: {} } },
      { v1: 'q9 RD Part B' },
      {},
    );
    expect(r.summary).not.toContain('x7 RD Part A');
  });
});

describe('flow url outputs (mechanism 1 at the flow level)', () => {
  function mintingSession(): RecordedEntry[] {
    return [
      { k: 'instruction', text: "Create a dashboard titled 'fr1 Bench Dashboard' and save it.", url: `${ORIGIN}/dashboards` },
      {
        k: 'step', tool: 'click', args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Save' }] } },
        diff: { url: `${ORIGIN}/d/afw6yy5xx9/fr1-bench-dashboard`, alerts: [], added: [] },
      },
      { k: 'report', status: 'success', summary: 'Saved.', values: {}, skill: 's_create' },
      { k: 'instruction', text: 'Open the dashboard at /d/afw6yy5xx9 and set its refresh to 1m.', url: `${ORIGIN}/d/afw6yy5xx9/fr1-bench-dashboard` },
      { k: 'report', status: 'success', summary: 'Done.', values: {}, skill: 's_refresh' },
    ];
  }
  it('minted end-url segments become outputs a later instruction references', () => {
    const flow = buildFlow(mintingSession(), { name: 'g', origin: ORIGIN, startUrl: `${ORIGIN}/dashboards`, vars: { runid: 'fr1' }, session: 's' })!;
    const [s1, s2] = flow.steps;
    // the uid the run minted is now a reference to step 1's end url, never a literal
    expect(s2.instruction).toContain(`{{${s1.id}.url.p1}}`);
    expect(s2.instruction).not.toContain('afw6yy5xx9');
    // digitless route words stay literal
    expect(s1.instruction).not.toContain('{{0');
  });
  it('resolveInstruction threads url.* outputs (refs split at the FIRST dot)', () => {
    const flowStep: FlowStep = { id: '02-open', instruction: 'Open /d/{{01-create.url.p1}} now', outputs: [], recorded: {} };
    const { text, missing } = resolveInstruction(flowStep, {}, { '01-create': { 'url.p1': 'zzz91' } });
    expect(missing).toEqual([]);
    expect(text).toBe('Open /d/zzz91 now');
    const soft = softResolveInstruction(flowStep, {}, {});
    expect(soft).toBe('Open /d/ now');
  });
  it('resolveStepParams threads url.* outputs too', () => {
    const flowStep: FlowStep = { id: '02-open', instruction: 'x', params: { v1: '{{01-create.url.p1}}' }, outputs: [], recorded: {} };
    const bound = resolveStepParams(flowStep, {}, { '01-create': { 'url.p1': 'zzz91' } })!;
    expect(bound.missing).toEqual([]);
    expect(bound.params).toEqual({ v1: 'zzz91' });
  });
});

describe('url-provenance refs beat report-value refs (fwgr-n2 regression)', () => {
  it('a report value that duplicates a minted url part is referencized as the url part', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: "Create a dashboard titled 'fr1 Bench Dashboard'; report its uid.", url: `${ORIGIN}/dashboards` },
      {
        k: 'step', tool: 'click', args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [] } },
        diff: { url: `${ORIGIN}/d/dfw8c6t9/fr1-bench-dashboard`, alerts: [], added: [] },
      },
      // The report ALSO carries the uid — the ref must still point at the url
      // part, because a tier-A replay's synthesized report drops values it
      // cannot re-observe while url parts are always published.
      { k: 'report', status: 'success', summary: 'Created.', values: { dashboard_uid: 'dfw8c6t9' }, skill: 's_create' },
      { k: 'instruction', text: 'Open the dashboard with uid dfw8c6t9 and set refresh to 1m.', url: `${ORIGIN}/d/dfw8c6t9/fr1-bench-dashboard` },
      { k: 'report', status: 'success', summary: 'Done.', values: {}, skill: 's_open' },
    ];
    const flow = buildFlow(entries, { name: 'g', origin: ORIGIN, startUrl: `${ORIGIN}/dashboards`, vars: { runid: 'fr1' }, session: 's' })!;
    const [s1, s2] = flow.steps;
    expect(s2.instruction).toContain(`{{${s1.id}.url.p1}}`);
    expect(s2.instruction).not.toContain('dashboard_uid');
    expect(s2.instruction).not.toContain('dfw8c6t9');
  });
});

describe('digitless minted ids (fwgr2 regression)', () => {
  it('a digitless uid is still referencized at the flow level', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create a dashboard and save it.', url: `${ORIGIN}/dashboards` },
      {
        k: 'step', tool: 'click', args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [] } },
        diff: { url: `${ORIGIN}/d/cfwcsdxqdjabkf/fr1-bench`, alerts: [], added: [] },
      },
      { k: 'report', status: 'success', summary: 'Saved.', values: {}, skill: 's_create' },
      { k: 'instruction', text: 'Open http://127.0.0.1:4180/d/cfwcsdxqdjabkf/fr1-bench fresh and verify.', url: `${ORIGIN}/d/cfwcsdxqdjabkf/fr1-bench` },
      { k: 'report', status: 'success', summary: 'Done.', values: {}, skill: 's_open' },
    ];
    const flow = buildFlow(entries, { name: 'h', origin: ORIGIN, startUrl: `${ORIGIN}/dashboards`, vars: { runid: 'fr1' }, session: 's' })!;
    expect(flow.steps[1].instruction).toContain(`{{${flow.steps[0].id}.url.p1}}`);
    expect(flow.steps[1].instruction).not.toContain('cfwcsdxqdjabkf');
  });
});

describe('recoveryRoute', () => {
  it('routes a step with no pinned skill to the cheap model first', () => {
    expect(recoveryRoute({}, false)).toEqual({ easy: true, cause: 'no-skill' });
  });

  it('routes an unthreaded reference to the cheap model first even with a skill', () => {
    expect(recoveryRoute({ skill: 's_abc' }, true)).toEqual({ easy: true, cause: 'unthreaded-ref' });
  });

  it('routes a replay failure cheap-first too — the strong model is the escalation, not the default', () => {
    expect(recoveryRoute({ skill: 's_abc' }, false)).toEqual({ easy: true, cause: 'replay-failed' });
  });
});

describe('resume-merge (escalation continuations)', () => {
  /** A blocked first attempt, its resume-marked continuation, then a second instruction. */
  const resumed = (): RecordedEntry[] => [
    { k: 'instruction', text: "Sign in and create a ticket titled 'fr1 RD Bench Ticket'; report its ref id.", url: `${ORIGIN}/` },
    { k: 'step', tool: 'fill', args: { target: '@e1', value: 'fr1 RD Bench Ticket' }, locators: {} },
    { k: 'report', status: 'blocked', summary: 'stuck on the title field', values: {} },
    { k: 'instruction', text: "Sign in and create a ticket titled 'fr1 RD Bench Ticket'; report its ref id.", url: `${ORIGIN}/#/half-done`, resume: true },
    { k: 'step', tool: 'fill', args: { target: '@e2', value: 'fr1 RD Bench Ticket' }, locators: {} },
    { k: 'report', status: 'success', summary: 'Created ticket, ref RD-1015.', values: { ref: 'RD-1015' }, skill: 's_create' },
    { k: 'instruction', text: 'On ticket RD-1015, report the price.', url: `${ORIGIN}/#/tickets/t15` },
    { k: 'step', tool: 'read', args: { target: '@e3', what: 'text' }, locators: {}, result: '"125.00"' },
    { k: 'report', status: 'success', summary: 'price 125.00', values: { price: '125.00' }, skill: 's_price' },
  ];

  it('merges a resume continuation into its failed predecessor: original text, resume report', () => {
    const flow = buildFlow(resumed(), { name: 'r', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: { runid: 'fr1' }, session: 's' })!;
    expect(flow.steps).toHaveLength(2);
    // the flow step carries the caller's wording (referencized), not the RESUMING scaffold
    expect(flow.steps[0].instruction).toBe("Sign in and create a ticket titled '{{runid}} RD Bench Ticket'; report its ref id.");
    // ...and the continuation's outcome: its skill pin and its outputs
    expect(flow.steps[0].skill).toBe('s_create');
    expect(flow.steps[0].outputs).toEqual(['ref']);
    // the merged step's output threads into the next instruction as usual
    expect(flow.steps[1].instruction).toMatch(/On ticket \{\{01-\w+\.ref\}\}/);
  });

  it('a resume whose predecessor is missing stands alone', () => {
    const entries = resumed().slice(3); // recording truncated before the original attempt
    const flow = buildFlow(entries, { name: 'r', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps[0].instruction).toBe("Sign in and create a ticket titled 'fr1 RD Bench Ticket'; report its ref id.");
    expect(flow.steps[0].skill).toBe('s_create');
  });

  it('a resume after a DIFFERENT instruction is not merged into it', () => {
    const entries = resumed();
    (entries[0] as { text: string }).text = 'Open the dashboard list.';
    const flow = buildFlow(entries, { name: 'r', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    // the unrelated blocked group is dropped; the resume group stands alone and succeeds
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps[0].skill).toBe('s_create');
  });
});

describe('lintUnpublishedOutputs / unreportedOutputs (fwgr36 01-open)', () => {
  const flow: Flow = {
    name: 'f',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: [],
    steps: [
      { id: '01-open', instruction: 'Open Service health; report its panel titles.', skill: 's_open', outputs: ['dashboard_name', 'panel_titles_in_order', 'url'], recorded: {} },
      { id: '02-note', instruction: 'Just look.', outputs: ['note'], recorded: {} },
    ],
    provenance: { session: 's', created: '2026-09-15T00:00:00Z' },
  };

  it('warns about a declared output the pinned skill cannot re-read, unreferenced or not', () => {
    const warnings = lintUnpublishedOutputs(flow, () => ['dashboard_name']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('01-open reports panel_titles_in_order, but s_open re-reads none of it');
    expect(warnings[0]).not.toContain('url');
  });

  it('is quiet when everything is re-published, or the skill is not in the store', () => {
    expect(lintUnpublishedOutputs(flow, () => ['dashboard_name', 'panel_titles_in_order'])).toEqual([]);
    expect(lintUnpublishedOutputs(flow, () => null)).toEqual([]);
  });

  it('holds a runner only to outputs that are data, not narration, file names or blanks (fwrd52)', () => {
    // data: short values, and lists of short parts
    expect(looksLikeReportedData('Draft')).toBe(true);
    expect(looksLikeReportedData('$125.00')).toBe(true);
    expect(looksLikeReportedData('Request rate, Error count, Latency by endpoint')).toBe(true);
    expect(looksLikeReportedData('Seed: triage inbox, Seed: order missing parts, Seed: ship repaired device')).toBe(true);
    expect(looksLikeReportedData(undefined)).toBe(true);
    // not data: narration, screenshots, nothing
    expect(looksLikeReportedData("Set Supplier = 'Bench Supplier Co' on both parts via per-row Edit")).toBe(false);
    expect(looksLikeReportedData("clicked row Delete -> in-page 'Confirm' dialog -> 'Delete part'; row disappeared")).toBe(false);
    expect(looksLikeReportedData('error state: shot-1789460741651.jpg; final Ready state: shot-1789460838656.jpg')).toBe(false);
    expect(looksLikeReportedData('quotation_S00021_draft.png')).toBe(false);
    expect(looksLikeReportedData('')).toBe(false);

    const narrated = { outputs: ['ticket_status', 'actions_taken', 'screenshots'], recorded: { ticket_status: 'Draft', actions_taken: "Set Supplier = 'Bench Supplier Co' on both parts via per-row Edit", screenshots: 'shot-1.jpg' } };
    expect(unreportedOutputs(narrated, {})).toEqual(['ticket_status']);
  });

  it('names what a run left out, ignoring url parts', () => {
    expect(unreportedOutputs(flow.steps[0], { dashboard_name: 'Service Health' })).toEqual(['panel_titles_in_order']);
    expect(unreportedOutputs(flow.steps[0], { dashboard_name: 'x', panel_titles_in_order: 'a, b' })).toEqual([]);
  });
});

describe('lintFlowRefs', () => {
  const flowWithRef = (skill?: string): Flow => ({
    name: 'f',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: ['runid'],
    steps: [
      { id: '01-create', instruction: 'Create a dashboard; report its uid.', ...(skill ? { skill } : {}), outputs: ['dashboard_uid'], recorded: { dashboard_uid: 'afw6yy5xx9' } },
      { id: '02-open', instruction: 'Open the dashboard with uid {{01-create.dashboard_uid}}.', outputs: [], recorded: {} },
    ],
    provenance: { session: 's', created: '2026-08-26T00:00:00Z' },
  });

  it('warns when the producing skill does not re-publish the referenced output', () => {
    const warnings = lintFlowRefs(flowWithRef('s_create'), () => []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('{{01-create.dashboard_uid}}');
    expect(warnings[0]).toContain('re-recording');
  });

  it('stays quiet when the skill re-publishes it (labelled read / param-derived)', () => {
    expect(lintFlowRefs(flowWithRef('s_create'), () => ['dashboard_uid'])).toEqual([]);
  });

  it('warns when the producing step has no skill at all', () => {
    const warnings = lintFlowRefs(flowWithRef(undefined), () => {
      throw new Error('must not be called — the step has no skill');
    });
    expect(warnings).toHaveLength(1);
  });

  it('exempts url.* provenance refs and skips skills missing from the store', () => {
    const flow = flowWithRef('s_create');
    flow.steps[1].instruction = 'Open {{01-create.url.p1}} and check {{01-create.dashboard_uid}}.';
    expect(lintFlowRefs(flow, () => null)).toEqual([]); // skill not in store: no verdict
    const warnings = lintFlowRefs(flow, () => []);
    expect(warnings).toHaveLength(1); // url.p1 exempt, dashboard_uid flagged once
  });
});

describe('publishedOutputs', () => {
  it('collects labelled reads (loop bodies included) and param-derived report values, not recorded literals', () => {
    const skill = {
      id: 's_x',
      origin: ORIGIN,
      template: "create '{{v1}}'",
      params: { v1: { example: 'fr1', usedIn: [1] } },
      preconditions: { urlPattern: `${ORIGIN}/` },
      steps: [
        { tool: 'fill', args: { target: 'x', value: '{{v1}}' }, locators: {} },
        { tool: 'read', args: { target: 'y' }, locators: {}, label: 'ref' },
        { tool: 'loop', args: {}, locators: {}, body: [{ tool: 'read', args: { target: 'z' }, locators: {}, label: 'row_total' }] },
      ],
      reportTemplate: { summary: 'done', values: { title: "{{v1}} Ticket", uid: 'afw6yy5xx9' } },
      stats: { uses: 1, successes: 1 },
      status: 'validated',
      provenance: { session: 's', instruction: 'i', created: '2026-08-26T00:00:00Z' },
    } as unknown as Skill;
    expect(publishedOutputs(skill).sort()).toEqual(['ref', 'row_total', 'title']);
  });
});

describe('the whole url is provenance, not a report name', () => {
  it('referencizes a param carrying the full end url', () => {
    // fwrd21l: the recording's report named it `url`, so the flow said
    // {{02-add.url}}. On replay 02-add went tier A and synthesizeReport
    // honestly dropped a recorded url it could not re-observe — so the ref
    // went unresolved and FOUR later steps skipped the zero-model path.
    const detail = `${ORIGIN}/#/tickets/t15`;
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create a ticket.', url: `${ORIGIN}/#/tickets` },
      {
        k: 'step', tool: 'click', args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Create' }] } },
        diff: { url: detail, alerts: [], added: [] },
      },
      // Deliberately publishes NO url value: provenance alone must supply it,
      // which is the whole point — a tier-A replay drops recorded values it
      // cannot re-observe, so a report name is not something to depend on.
      // The report publishes the url under ITS OWN name. Pre-fix that name
      // won the referencizing (longest value first), so the flow depended on
      // a tier-A replay re-publishing `detail_link` — which it will not.
      { k: 'report', status: 'success', summary: 'made it', values: { detail_link: detail }, skill: 's_a' },
      { k: 'instruction', text: `On the ticket at url ${detail}, add a part.`, url: detail },
      {
        k: 'step', tool: 'click', args: { target: '@e2' },
        locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Add part' }] } },
      },
      { k: 'report', status: 'success', summary: 'added', values: {}, skill: 's_b' },
    ];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/#/tickets`, vars: {}, session: 's' })!;
    // Provenance wins: the ref names the step's END URL, which every replay
    // re-binds from where its own browser landed.
    expect(flow.steps[1].instruction).toMatch(/\{\{01-\w+\.url\}\}/);
    expect(flow.steps[1].instruction).not.toContain('detail_link');
    expect(flow.steps[1].instruction).not.toContain(detail);
    // ...and the lint treats it as re-observable, like url.* parts.
    expect(lintFlowRefs({ ...flow, steps: [flow.steps[0], { ...flow.steps[1], instruction: 'go to {{01-a.url}}' }] }, () => [])).toEqual([]);
  });
});

describe('urlOutputs', () => {
  it('publishes a three-character record id, which is what buildFlow mints refs for', () => {
    // fwrd24l: buildFlow minted {{02-open.url.h1}} for the ticket id "t16"
    // (identifierLike accepts three characters — repair-desk's ids are "t15"),
    // while the daemon published parts at length >= 4. The ref could never
    // resolve, so four steps skipped the zero-model path on every replay.
    const out = urlOutputs('http://127.0.0.1:4180/#/tickets/t16');
    expect(out.url).toBe('http://127.0.0.1:4180/#/tickets/t16');
    expect(out['url.h1']).toBe('t16');
    // A route word is not a reference, so it is not published — the same
    // predicate buildFlow uses to decide what is worth minting.
    expect(out['url.h0']).toBeUndefined();
  });
});

describe('a refused export keeps the recording', () => {
  it('writes .rejected.json, and listFlows does not offer it', async () => {
    const { saveRejectedFlow, listFlows, flowsDir } = await import('../src/skills/flow.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-rej-'));
    process.env.SITELOOPER_FLOWS_DIR = dir;
    try {
      const flow = { name: 'rej', origin: ORIGIN, startUrl: ORIGIN, vars: [], steps: [], created: '', session: '' } as unknown as Flow;
      const file = saveRejectedFlow(flow, 'a run value reached a locator');
      expect(file.endsWith('.rejected.json')).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).rejected).toMatch(/reached a locator/);
      // `.rejected.json` ends in `.json`, so the listing has to exclude it
      // explicitly or a refused flow is offered for replay like any other.
      expect(listFlows().map((f) => f.name)).not.toContain('rej');
      expect(flowsDir()).toBe(dir);
    } finally {
      delete process.env.SITELOOPER_FLOWS_DIR;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('coincidental substring references', () => {
  it('does not referencize a common word matched inside a hyphenated compound', () => {
    // fwgr8: 04-open reported tags="bench" and the dashboard slug was
    // "fwgr8-n1-bench-dashboard", so FOUR later steps had their url rewritten
    // to {{runid}}-{{04-open.tags}}-dashboard. That "bench" is the dashboard's
    // NAME, not its tags; they agreed by coincidence on one run and would not
    // on any other. Every ref then failed to resolve and cost a zero-model step.
    const slug = 'http://g.test/d/abc123/fr1-bench-dashboard';
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Open the dashboard settings and read its tags.', url: 'http://g.test/d/abc123/fr1-bench-dashboard' },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Settings' }] } } },
      { k: 'report', status: 'success', summary: 'tags read', values: { tags: 'bench' }, skill: 's_a' },
      { k: 'instruction', text: `Go to ${slug} and set the refresh interval.`, url: slug },
      { k: 'step', tool: 'click', args: { target: '@e2' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Refresh' }] } } },
      { k: 'report', status: 'success', summary: 'set', values: {}, skill: 's_b' },
    ];
    const flow = buildFlow(entries, { name: 'f', origin: 'http://g.test', startUrl: 'http://g.test/', vars: {}, session: 's' })!;
    expect(flow.steps[1].instruction).toContain('fr1-bench-dashboard');
    expect(flow.steps[1].instruction).not.toContain('.tags}}');
  });

  it('still threads a minted identifier that sits inside a compound', () => {
    // The rule turns on WHAT the value is: a minted id matching inside a slug
    // is evidence, a common word is coincidence.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create it.', url: 'http://g.test/' },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Save' }] } } },
      { k: 'report', status: 'success', summary: 'made', values: { uid: 'afw8m1pqwk5c0a' }, skill: 's_a' },
      { k: 'instruction', text: 'Open http://g.test/d/afw8m1pqwk5c0a/my-dashboard and edit it.', url: 'http://g.test/d/afw8m1pqwk5c0a/my-dashboard' },
      { k: 'step', tool: 'click', args: { target: '@e2' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: 'Edit' }] } } },
      { k: 'report', status: 'success', summary: 'edited', values: {}, skill: 's_b' },
    ];
    const flow = buildFlow(entries, { name: 'f', origin: 'http://g.test', startUrl: 'http://g.test/', vars: {}, session: 's' })!;
    expect(flow.steps[1].instruction).not.toContain('afw8m1pqwk5c0a');
  });
});

describe('a replay that observed nothing cannot narrate', () => {
  const stepless = (summary: string, params: Record<string, { example: string; usedIn: number[]; known?: true }> = {}) =>
    ({ id: 's_q', steps: [{ tool: 'click', args: {}, locators: {} }], params, reportTemplate: { summary, values: {} } }) as unknown as Skill;

  it('drops recorded prose naming an identifier no parameter supplied', () => {
    // fwod12 steps 03-06: no labelled reads, no matching param example, so
    // both existing rules had nothing to compare against and the recording's
    // own narrative was republished as this run's finding — while the steps
    // published {} as their values. The run had created S00023.
    const r = synthesizeReport(stepless('Added a second order line to S00021 and saved.'), {}, {});
    expect(r.summary).not.toContain('S00021');
    expect(r.summary).toMatch(/Replayed stored procedure/);
  });

  it('keeps prose whose specifics all came from the run own parameters', () => {
    const skill = stepless("Renamed the record to '{{v1}}'.", { v1: { example: 'n1 Widget', usedIn: [1] } });
    const r = synthesizeReport(skill, { v1: 'n2 Widget' }, {});
    expect(r.summary).toBe("Renamed the record to 'n2 Widget'.");
  });

  it('drops even harmless prose when nothing in the run vouches for it', () => {
    // This used to be kept, on the strength of a regex finding no
    // identifier-shaped token in it. That regex was the last site in the
    // product where characters decided something that fails toward silence:
    // it also kept "Added a second order line to Order Alpha and saved",
    // which names a record it cannot possibly know this run touched.
    //
    // Telling those two apart needs to know which strings name records, which
    // is the question shape has never been able to answer. So the rule stopped
    // trying: a replay that observed nothing and filled nothing keeps no
    // narrative. This sentence is true and it is lost — the deliberate cost,
    // against a wrong record id in a report, which is not recoverable by
    // reading further.
    const r = synthesizeReport(stepless('Saved the form and closed the dialog.'), {}, {});
    expect(r.summary).toMatch(/Replayed stored procedure/);
  });

  it('keeps prose when the run SUPPLIED the specifics, even with no live read', () => {
    // The other half of the rule: a param that actually reached the prose is
    // this run's own value, so the sentence describes this run.
    const skill = stepless("Renamed the record to '{{v1}}'.", { v1: { example: 'n1 Widget', usedIn: [1] } });
    expect(synthesizeReport(skill, { v1: 'n2 Widget' }, {}).summary).toBe("Renamed the record to 'n2 Widget'.");
  });

  it('still narrates when the replay DID observe something', () => {
    const skill = stepless('The order total is £141.00.');
    const r = synthesizeReport(skill, {}, { total: '£207.00' });
    expect(r.summary).toContain('141.00'); // a live read was made; the older rules govern
  });
});

describe('run 1 proposes, run 2 decides', () => {
  /** fwod18's shape: a create step reports a placeholder and a real reference. */
  const entries = (): RecordedEntry[] => [
    { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} },
    { k: 'instruction', text: 'Create a quotation for the bench customer.', url: `${ORIGIN}/` },
    {
      k: 'report',
      status: 'success',
      summary: 'Created a quotation.',
      // Odoo shows "New" in the breadcrumb until the record is saved, so the
      // model named the reference BEFORE it existed. Nothing about either
      // string says which is which.
      values: { quotation_reference: 'New (unsaved)', order_ref: 'S00021' },
      skill: 's_create',
    },
    {
      k: 'instruction',
      text: 'On quotation New (unsaved) (order S00021), set the quantity to 5.',
      url: `${ORIGIN}/`,
    },
    { k: 'report', status: 'success', summary: 'Set quantity.', values: { qty: '5' }, skill: 's_edit' },
  ];

  const build = (): Flow =>
    buildFlow(entries(), { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;

  it('run 1 references EVERY reported value, judging none of them', () => {
    // The safe default. An unresolved reference costs a recovery turn; a
    // literal left where a reference was needed acts on run 1's record and
    // reports success.
    const text = build().steps[1].instruction;
    expect(text).toContain('{{01-create.quotation_reference}}');
    expect(text).toContain('{{01-create.order_ref}}');
  });

  it('run 2 settles both by producing its own values', () => {
    const flow = build();
    const create = flow.steps[0];
    // The replay's own report: Odoo says "New (unsaved)" again for ITS unsaved
    // record, and S00023 for the order it just made.
    noteOutputEvidence(create, { quotation_reference: 'New (unsaved)', order_ref: 'S00023' });
    expect(create.outputEvidence).toEqual({
      quotation_reference: { same: 1, differed: 0 },
      order_ref: { same: 0, differed: 1 },
    });
    // Only the contradiction is a verdict: S00021 is run-specific from now on.
    expect([...varyingValues(flow)]).toEqual(['S00021']);
  });

  it('agreement never fills a reference with the recorded literal', () => {
    // The hazard stableOutputs had. A harness that resets the app between runs
    // reproduces a minted id exactly, so run 2 AGREES with run 1 on the order
    // ref. Run 3 is on an app that was not reset, makes S00022, and its create
    // step goes tier A and drops the output. A recorded-literal fallback would
    // hand step 2 run 1's S00021 — editing the wrong order, reporting success.
    const flow = build();
    noteOutputEvidence(flow.steps[0], { quotation_reference: 'New (unsaved)', order_ref: 'S00021' });
    expect(flow.steps[0].outputEvidence!.order_ref).toEqual({ same: 1, differed: 0 });
    const { text, missing } = resolveInstruction(flow.steps[1], {}, {});
    expect(text).not.toContain('S00021');
    expect(missing).toEqual(['01-create.quotation_reference', '01-create.order_ref']);
    // Recovery gets a readable instruction with the unknowns blanked.
    expect(softResolveInstruction(flow.steps[1], {}, {})).not.toContain('S00021');
  });

  it('one demonstration of difference is permanent', () => {
    const flow = build();
    const create = flow.steps[0];
    noteOutputEvidence(create, { order_ref: 'S00023' }); // differed
    noteOutputEvidence(create, { order_ref: 'S00021' }); // agrees, by coincidence of a reset app
    expect(create.outputEvidence!.order_ref).toEqual({ same: 1, differed: 1 });
    // Still run-specific: a value that changed once names a record, and
    // being wrong that way is silent.
    expect(varyingValues(flow).has('S00021')).toBe(true);
  });

  it('a minted url part is a recorded value, so evidence can judge it too', () => {
    // The url population used to sit OUTSIDE this mechanism: buildFlow admitted
    // a part as a reference on `looksLikeId` — a first-run shape prior with no
    // evidence behind it (shape.ts) — and nothing ever revisited the call. A
    // route word that squeaked past it stayed a reference forever, and there
    // was no signal that could say so.
    const flow = buildFlow(
      [
        { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} },
        { k: 'instruction', text: 'Open the ticket.', url: `${ORIGIN}/` },
        {
          k: 'step',
          tool: 'click',
          args: {},
          locators: {},
          diff: { url: `${ORIGIN}/app-v2/tickets/t15` },
        },
        { k: 'report', status: 'success', summary: 'Opened.', values: {}, skill: 's_open' },
      ] as RecordedEntry[],
      { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' },
    )!;
    const open = flow.steps[0];
    // Both parts carry a digit and a separator or a route shape the prior
    // admits, so run 1 references both — it cannot tell an api version segment
    // from a record id, and says so by referencing each.
    expect(open.recorded['url.p0']).toBe('app-v2');
    expect(open.recorded['url.p2']).toBe('t15');

    // Run 2 lands on the same version segment and a different record.
    noteOutputEvidence(open, { 'url.p0': 'app-v2', 'url.p2': 't21' });
    expect(open.outputEvidence).toMatchObject({
      'url.p0': { same: 1, differed: 0 },
      'url.p2': { same: 0, differed: 1 },
    });

    // The record id is run-specific from now on, whatever it looks like; the
    // segment the app reproduced has only failed to vary, which decides
    // nothing. That verdict is behaviour across runs, which shape cannot see.
    const varying = varyingValues(flow);
    expect(varying.has('t15')).toBe(true);
    expect(varying.has('app-v2')).toBe(false);
  });

  it('a replay that recovered onto a different route votes neither way', () => {
    // The hazard the route gate exists for, measured on fwod20's n1/n2/n3:
    // comparing url parts step by step made `q.model = "sale.order" vs
    // "res.partner"` look volatile, because a recovery turn navigated to a
    // different menu. That is disagreement about WHERE the run is, not about
    // what the value is — and `differed` is permanent, so counting it would
    // give a route word a record-pointer verdict it can never lose.
    const step: FlowStep = {
      id: '01-open',
      instruction: 'x',
      outputs: [],
      recorded: { 'url.q.model': 'sale.order' },
      route: '/web#model=:var&view_type=:var',
    };
    expect(noteOutputEvidence(step, { 'url.q.model': 'res.partner' }, '/web#action=:id&menu_id=:id')).toEqual([]);
    expect(step.outputEvidence).toBeUndefined();
    // Same route: the comparison is between like and like, so it counts.
    noteOutputEvidence(step, { 'url.q.model': 'res.partner' }, '/web#model=:var&view_type=:var');
    expect(step.outputEvidence).toEqual({ 'url.q.model': { same: 0, differed: 1 } });
  });

  it('records the route it ended on, so a later run can tell like from like', () => {
    const flow = buildFlow(
      [
        { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} },
        { k: 'instruction', text: 'Open the ticket.', url: `${ORIGIN}/` },
        { k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: `${ORIGIN}/app-v2/tickets/t15` } },
        { k: 'report', status: 'success', summary: 'Opened.', values: {}, skill: 's_open' },
      ] as RecordedEntry[],
      { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' },
    )!;
    // The PATTERN, not the url: two runs opening different tickets are on the
    // same route and must be able to compare.
    expect(flow.steps[0].route).toBeTruthy();
    expect(flow.steps[0].route).not.toContain('t15');
  });

  it('hands the ledger the values it watched change, so the next run stops reading characters', () => {
    const flow = build();
    const create = flow.steps[0];
    noteOutputEvidence(create, { quotation_reference: 'New (unsaved)', order_ref: 'S00023' });
    // The app contradicted one and reproduced the other. Only the
    // contradiction is collected: see RunSpecific for why agreement is not
    // the converse.
    const varying = varyingValues(flow);
    expect([...varying]).toEqual(['S00021']);
    expect(varying.has('New (unsaved)')).toBe(false);
  });

  it('a value volatile anywhere is run-specific everywhere', () => {
    // Being wrong toward "the app owns it" is the silent direction, so the
    // step that saw it vary outvotes the one that saw it agree.
    const flow = build();
    const create = flow.steps[0];
    create.recorded = { ...create.recorded, echo: 'S00021' };
    create.outputEvidence = { order_ref: { same: 0, differed: 1 }, echo: { same: 3, differed: 0 } };
    expect(varyingValues(flow).has('S00021')).toBe(true);
  });

  it('silence is not agreement — a tier-A replay that drops a value votes neither way', () => {
    const flow = build();
    noteOutputEvidence(flow.steps[0], {}); // republished nothing
    expect(flow.steps[0].outputEvidence).toBeUndefined();
    expect(varyingValues(flow).size).toBe(0);
  });

  it('a param binding resolves from this run only, like the instruction', () => {
    const step: FlowStep = {
      id: '02-edit',
      instruction: 'x',
      outputs: [],
      recorded: {},
      params: { v1: '{{01-create.quotation_reference}}', v2: '{{01-create.order_ref}}' },
    };
    const bound = resolveStepParams(step, {}, { '01-create': { quotation_reference: 'New (unsaved)' } })!;
    expect(bound.params.v1).toBe('New (unsaved)');
    expect(bound.missing).toEqual(['01-create.order_ref']);
  });
});

describe('work the recording did that the flow does not contain', () => {
  it('names an instruction that mutated the app but did not report success', () => {
    // fwgr13 and fwgr14 both lost the same instruction: "create a NEW
    // dashboard. Add a Stat panel..." ran out of budget and reported blocked,
    // then failure. Both attempts HAD created the dashboard and the panel.
    // Neither became a step, so the exported flow opened with "The browser is
    // on an unsaved new Grafana dashboard..." and nothing to put it there —
    // and scored 1/6 on both replays once the app was reset properly.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create a NEW dashboard and add a Stat panel titled "x7 Availability".', url: `${ORIGIN}/` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {} },
      { k: 'step', tool: 'fill', args: { target: '@e2', value: 'x7 Availability' }, locators: {} },
      { k: 'report', status: 'blocked', summary: 'Turn cap (30) reached without a final report.', values: {} },
      { k: 'instruction', text: 'Read the panel titles.', url: `${ORIGIN}/d/abc` },
      { k: 'step', tool: 'read', args: { target: '@e3' }, locators: {}, result: 'x7 Availability' },
      { k: 'report', status: 'blocked', summary: 'timed out', values: {} },
    ];
    const warnings = unbankedMutations(entries);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Create a NEW dashboard');
    expect(warnings[0]).toContain('2 state-changing step(s)');
    // The read-only instruction is not reported: nothing was lost by dropping it.
    expect(warnings[0]).not.toContain('Read the panel titles');
  });

  it('says nothing about a successful instruction, or one that only looked', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create it.', url: `${ORIGIN}/` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {} },
      { k: 'report', status: 'success', summary: 'created', values: {} },
      { k: 'instruction', text: 'Look at it.', url: `${ORIGIN}/` },
      { k: 'step', tool: 'read', args: { target: '@e2' }, locators: {}, result: 'x' },
      { k: 'report', status: 'failure', summary: 'could not read', values: {} },
    ];
    expect(unbankedMutations(entries)).toEqual([]);
  });

  it('stays silent about blocked work the session continued from — it is adopted into the flow', () => {
    // fwgr14's real shape: the create blocked, and the very next (successful)
    // instruction was issued ON the page the create left behind and carried
    // straight on. resolveGroups adopts that group as a flow step, so its
    // work IS in the flow and the warning would be false.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create a NEW dashboard and add a Stat panel.', url: `${ORIGIN}/` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {}, diff: { url: `${ORIGIN}/dashboard/new?editPanel=1` } },
      { k: 'step', tool: 'fill', args: { target: '@e2', value: 'x' }, locators: {} },
      { k: 'report', status: 'blocked', summary: 'turn cap', values: {} },
      { k: 'instruction', text: 'The browser is on an unsaved new dashboard. Save it.', url: `${ORIGIN}/dashboard/new?editPanel=1` },
      { k: 'step', tool: 'click', args: { target: '@e3' }, locators: {}, diff: { url: `${ORIGIN}/d/abc/x` } },
      { k: 'report', status: 'success', summary: 'saved', values: {} },
    ];
    expect(unbankedMutations(entries)).toEqual([]);
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    expect(flow.steps.map((s) => Boolean(s.adopted))).toEqual([true, false]);
  });

  it('still drops (and warns about) an observe-only blocked group even when the session continued from its page', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Read the totals.', url: `${ORIGIN}/orders/7` },
      { k: 'step', tool: 'read', args: { target: '@e1' }, locators: {}, result: 'x', diff: { url: `${ORIGIN}/orders/7` } },
      { k: 'report', status: 'blocked', summary: 'turn cap', values: {} },
      { k: 'instruction', text: 'Confirm the order.', url: `${ORIGIN}/orders/7` },
      { k: 'step', tool: 'click', args: { target: '@e2' }, locators: {} },
      { k: 'report', status: 'success', summary: 'confirmed', values: {} },
    ];
    // Nothing mutating was lost, so there is no warning AND no adoption.
    expect(unbankedMutations(entries)).toEqual([]);
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    expect(flow.steps).toHaveLength(1);
    expect(flow.steps[0].adopted).toBeUndefined();
  });

  it('reports an instruction whose report never arrived at all', () => {
    // A truncated recording: the daemon died mid-instruction. The work is just
    // as absent from the flow as a blocked one's.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Archive the ticket.', url: `${ORIGIN}/` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {} },
    ];
    expect(unbankedMutations(entries)).toHaveLength(1);
    expect(unbankedMutations(entries)[0]).toContain('reported nothing');
  });
});

describe('instruction prose quoting a run-minted database id', () => {
  it('warns when a flow instruction carries an id no guard can otherwise see', async () => {
    const { staleInstructionIds } = await import('../src/skills/flow.js');
    // fwod27's shape with the WORKAROUND variant: the contact is created in a
    // BLOCKED instruction, the successor navigates away first (a `goto`), so
    // the blocked group is NOT adopted and no flow step produces the value —
    // yet a later instruction quotes its database id in prose. Every
    // locator/navigation guard passes; the replays would navigate to the
    // recording's deleted record.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create the contact.', url: `${ORIGIN}/` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {}, diff: { url: `${ORIGIN}/web#id=44&model=res.partner&view_type=form` } },
      { k: 'report', status: 'blocked', summary: 'timed out', values: {} },
      { k: 'instruction', text: "You are on an Odoo contact form for res.partner id 44. Verify the Name.", url: `${ORIGIN}/web#id=44&model=res.partner` },
      { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/web#id=44&model=res.partner` }, locators: {}, diff: { url: `${ORIGIN}/web#id=44&model=res.partner` } },
      { k: 'step', tool: 'read', args: { target: '@e2' }, locators: {}, result: '"x"' },
      { k: 'report', status: 'success', summary: 'verified', values: {} },
    ] as unknown as RecordedEntry[];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    const warnings = staleInstructionIds(entries, flow);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('record id 44');
    expect(warnings[0]).toContain("never by internal id");
  });

  it('threads the id instead when the blocked create is adopted (fwod27 fixed at the root)', async () => {
    const { staleInstructionIds } = await import('../src/skills/flow.js');
    // Same shape, but the successor picks up ON the page the blocked create
    // ended on (no goto): the create is adopted as a flow step, it mints the
    // id from its end url, and the prose literal becomes a reference — the
    // replay follows its OWN run's record.
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Create the contact.', url: `${ORIGIN}/` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {}, diff: { url: `${ORIGIN}/web#id=44&model=res.partner&view_type=form` } },
      { k: 'report', status: 'blocked', summary: 'timed out', values: {} },
      { k: 'instruction', text: "You are on an Odoo contact form for res.partner id 44. Verify the Name.", url: `${ORIGIN}/web#id=44&model=res.partner&view_type=form` },
      { k: 'step', tool: 'read', args: { target: '@e2' }, locators: {}, result: '"x"' },
      { k: 'report', status: 'success', summary: 'verified', values: {} },
    ] as unknown as RecordedEntry[];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps[0].adopted).toBe(true);
    expect(flow.steps[1].instruction).toContain(`id {{${flow.steps[0].id}.url.q.id}}`);
    expect(staleInstructionIds(entries, flow)).toEqual([]);
  });

  it('says nothing about a number that is not a minted id', async () => {
    const { staleInstructionIds } = await import('../src/skills/flow.js');
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Set the quantity to id 44.', url: `${ORIGIN}/` },
      { k: 'step', tool: 'fill', args: { target: '@e1', value: '44' }, locators: {} },
      { k: 'report', status: 'success', summary: 'done', values: {} },
    ] as unknown as RecordedEntry[];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    // no url ever carried id=44, so the 44 in prose is the task's own number
    expect(staleInstructionIds(entries, flow)).toEqual([]);
  });
});

describe('consumedUrlOutputs', () => {
  const step = (id: string, instruction: string, params?: Record<string, string>) =>
    ({ id, instruction, outputs: [], recorded: {}, ...(params ? { params } : {}) }) as never;

  it('collects only url.* refs consumed by OTHER steps, from instruction and params', () => {
    const wanted = consumedUrlOutputs([
      step('03-open', 'create the record'),
      step('06-open', 'open {{03-open.url.q.id}} and set {{03-open.order_ref}}', {
        target: 'http://x/#id={{03-open.url.q.id}}&m={{03-open.url.q.menu_id}}',
      }),
      step('07-open', 'self ref stays out: {{07-open.url.q.id}}'),
    ]);
    expect(wanted.get('03-open')).toEqual(new Set(['url.q.id', 'url.q.menu_id']));
    expect(wanted.has('07-open')).toBe(false);
  });

  it('ignores non-url outputs and strips json-path suffixes', () => {
    const wanted = consumedUrlOutputs([
      step('01-a', 'x'),
      step('02-b', 'use {{01-a.ticket_ref}} then {{01-a.url.h1#rows.0}}'),
    ]);
    expect(wanted.get('01-a')).toEqual(new Set(['url.h1']));
  });
});

describe('ignorableRefs (fwgr23 05-open)', () => {
  const skill = {
    params: {
      v1: { example: 'Bench Dashboard', usedIn: [2] },
      v3: { example: 'Last 6 hours', usedIn: [] },
      v4: { example: 'bench', usedIn: [] },
      v5: { example: 'Bench Board', usedIn: [] },
    },
    preconditions: { urlPattern: 'http://x/', requireText: ['{{v5}}'] },
  } as unknown as Skill;
  const step = {
    id: '05-open',
    instruction: "On '{{01.title}}' with tag {{04.tag}} and range {{04.range}}, on board {{02.board}}",
    skill: 's_1',
    params: { v1: '{{01.title}}', v3: '{{04.range}}', v4: '{{04.tag}}', v5: '{{02.board}}' },
  } as unknown as Parameters<typeof ignorableRefs>[1];
  it('a reference that reaches only unused params, or only the wording, is ignorable', () => {
    expect(ignorableRefs(['04.tag', '04.range', '09.note'], step, skill)).toEqual(['04.tag', '04.range', '09.note']);
  });
  it('a reference a step types by, or that names the record (requireText), is not', () => {
    expect(ignorableRefs(['01.title', '02.board', '04.tag'], step, skill)).toEqual(['04.tag']);
  });
  it('without a pinned skill nothing is ignorable', () => {
    expect(ignorableRefs(['04.tag'], step, null)).toEqual([]);
  });
});

describe('input echoes are not outputs (fwgr23 05-open)', () => {
  it("a later step quoting a value the earlier step's own instruction typed stays a constant, not a {{step.output}}", () => {
    const entries: RecordedEntry[] = [
      { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} },
      { k: 'instruction', text: "Open dashboard settings and add the tag 'bench'; report the tag and the time range shown.", url: `${ORIGIN}/d/x` },
      { k: 'step', tool: 'fill', args: { target: '@e1', value: 'bench' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'label', label: 'Tags' }] } } },
      { k: 'report', status: 'success', summary: 'Added tag bench; time range Last 6 hours.', values: { tag: 'bench', time_range: 'Last 6 hours' }, skill: 's_tag' },
      { k: 'instruction', text: "Confirm the dashboard carries the tag bench and the range Last 6 hours, then set refresh to 1m.", url: `${ORIGIN}/d/x` },
      { k: 'step', tool: 'click', args: { target: '@e2' }, locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'button', name: '1m' }] } } },
      { k: 'report', status: 'success', summary: 'Refresh set.', values: { refresh: '1m' }, skill: 's_refresh' },
    ];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 's' })!;
    expect(flow.steps[1].instruction).toContain('tag bench');
    expect(flow.steps[1].instruction).not.toContain('.tag}}');
    // an observed value (the time range was read, not typed) still threads
    expect(flow.steps[1].instruction).toContain(`{{${flow.steps[0].id}.time_range}}`);
  });
});

describe('remapParams', () => {
  // rpat1 re-pinned 04-add and kept the OLD skill's slot names; rpat2 then
  // guessed by value and wrote an earlier run's literal into a live run.
  // Bindings are re-derived by ORIGIN: the binding key each slot recorded.
  it("re-derives a re-pinned step's bindings from each slot's recorded origin", async () => {
    const { remapParams } = await import('../src/skills/flow.js');
    const skill = {
      params: {
        v1: { example: 'fwat2-n3', usedIn: [6], known: true, binding: 'runid' },
        v2: { example: 'fwat2-n3 MTP Bench Project', usedIn: [2], known: true }, // composite: templated on v1
        v3: { example: '200', usedIn: [4] },
        v4: { example: 'Project Manager', usedIn: [], known: true, binding: 'output:01-open:landed_page' },
        v5: { example: 'abx91', usedIn: [3], known: true, binding: 'url:02-create:p1' },
        v6: { example: 'Open', usedIn: [1], known: true, binding: 'var:mode' },
      },
    } as never;
    expect(remapParams(skill)).toEqual({
      params: {
        v1: '{{runid}}',
        v2: '{{runid}} MTP Bench Project',
        v3: '200',
        v4: '{{01-open.landed_page}}',
        v5: '{{02-create.url.p1}}',
        v6: '{{mode}}',
      },
      unbound: [],
    });
  });

  it('names a record-identifying slot that has no origin, so the re-pin can be refused', async () => {
    const { remapParams } = await import('../src/skills/flow.js');
    const skill = {
      params: {
        v1: { example: 'fwat2-n3 MTP Bench Project', usedIn: [2], known: true },
        v3: { example: '25', usedIn: [4] },
      },
    } as never;
    expect(remapParams(skill)).toEqual({ params: { v1: 'fwat2-n3 MTP Bench Project', v3: '25' }, unbound: ['v1'] });
  });

  // rr2od: 08-open was re-recorded and covered by 07-open's read-only status
  // check s_04d970, whose store entry predates slot origins (no `binding` on
  // any slot). The flow's 07-open step already bound those slots as {{ref}}
  // templates; a re-pin onto a skill a sibling step pins inherits them.
  it("inherits a sibling step's flow bindings for slots that recorded no origin", async () => {
    const { remapParams } = await import('../src/skills/flow.js');
    const skill = {
      params: {
        v1: { example: 'S00021', usedIn: [], known: true },
        v2: { example: '21', usedIn: [], known: true },
        v3: { example: 'Sales Order', usedIn: [], known: true },
        v4: { example: 'k9', usedIn: [1], known: true, binding: 'var:runid' },
      },
    } as never;
    const sibling = { v1: '{{02-create.quotation_ref}}', v2: '{{02-create.url.q.id}}', v3: 'Sales Order', v4: 'stale' };
    expect(remapParams(skill, sibling)).toEqual({
      params: { v1: '{{02-create.quotation_ref}}', v2: '{{02-create.url.q.id}}', v3: 'Sales Order', v4: '{{runid}}' },
      unbound: [],
    });
  });
});

/**
 * Record-time no-op detection, read off the recording that motivated it.
 *
 * fwod34's orchestrator wrote 08-open to cancel a sales order it had already
 * told 06-open to cancel. The recording says so: 08-open's seven
 * state-changing steps every one produced an empty diff (no signature line
 * added, no alert, no navigation), and the pre-state snapshot already carried
 * "Cancelled" before it ran. Its five genuinely mutating siblings do not look
 * like that, and neither do the two read-only checks that quote a mutating
 * verb ("Read-only check, do not change anything") — the whole point of the
 * guards is that 09-change, whose step id is a mutating verb, stays quiet.
 */
describe('record-time no-op steps (fwod34 08-open)', () => {
  const script = path.join(process.cwd(), 'bench/results-published/fwod34-n1-script.jsonl');

  function fwod34(): Flow {
    const entries = fs
      .readFileSync(script, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RecordedEntry);
    const flow = buildFlow(entries, {
      name: 'fwod34',
      origin: 'http://127.0.0.1:8069',
      startUrl: 'http://127.0.0.1:8069/',
      vars: { runid: 'fwod34-n1' },
      session: 'fwod34-n1',
      now: '2026-09-01T00:00:00Z',
    })!;
    return flow;
  }

  it('flags 08-open, and only 08-open, from the published recording', () => {
    const flow = fwod34();
    // The fixture is the real thing: the same nine steps the published flow has.
    expect(flow.steps.map((s) => s.id)).toEqual([
      '01-signin', '02-create', '03-open', '04-open', '05-open', '06-open', '07-open', '08-open', '09-change',
    ]);
    expect(flow.warnings).toHaveLength(1);
    expect(flow.warnings![0]).toBe(
      "noop-step: 08-open changed nothing: its instruction asks to cancel, the recording's 7 state-changing actions " +
        "left the page unchanged, and the page already showed 'Cancelled' before it ran. The step may be redundant.",
    );
  });

  it('stays silent on the steps that genuinely changed the app, and on the read-only checks', () => {
    const warned = (fwod34().warnings ?? []).join('\n');
    // The five mutating steps: each ran state-changing tools whose diffs
    // added lines, raised alerts or navigated.
    for (const id of ['02-create', '03-open', '04-open', '05-open', '06-open']) expect(warned).not.toContain(id);
    // 01-signin mutated too; 07-open and 09-change quote a mutating verb
    // ("change", "Cancelled") but declare themselves read-only.
    for (const id of ['01-signin', '07-open', '09-change']) expect(warned).not.toContain(id);
  });

  /** A minimal session: one instruction, its steps, its report. */
  function session(text: string, steps: RecordedEntry[], values: Record<string, string> = {}, startText?: string): RecordedEntry[] {
    return [
      { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/o/1` }, locators: {} },
      { k: 'instruction', text, url: `${ORIGIN}/o/1`, ...(startText ? { startText } : {}) },
      ...steps,
      { k: 'report', status: 'success', summary: 'done', values, skill: 's_x' },
    ];
  }

  function warnings(entries: RecordedEntry[]): string[] {
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/o/1`, vars: {}, session: 's', now: 'now' });
    return flow?.warnings ?? [];
  }

  const read: RecordedEntry = { k: 'step', tool: 'read', args: { target: '@e1', what: 'text' }, locators: {}, result: '"Cancelled"' };
  const inertClick: RecordedEntry = {
    k: 'step',
    tool: 'click',
    args: { target: '@e1' },
    locators: {},
    diff: { url: `${ORIGIN}/o/1`, alerts: [], added: [] },
  };
  const realClick: RecordedEntry = {
    k: 'step',
    tool: 'click',
    args: { target: '@e1' },
    locators: {},
    diff: { url: `${ORIGIN}/o/1`, alerts: [], added: ['- alert "Order cancelled"'] },
  };

  it('an instruction that changed the app is never flagged, however it is worded', () => {
    expect(warnings(session('Cancel order O-1 and report its status.', [realClick, read], { status: 'Cancelled' }))).toEqual([]);
  });

  it('a mutating instruction that ran no state-changing tool at all is flagged', () => {
    const w = warnings(session('Cancel order O-1 and report its status.', [read], { status: 'Cancelled' }));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('its instruction asks to cancel, the recording made no state-changing action.');
  });

  it('names the pre-state value only when the snapshot really showed it', () => {
    const shown = warnings(session('Cancel order O-1.', [read], { status: 'Cancelled' }, '- radio "Cancelled"\n- heading "O-1"'));
    expect(shown[0]).toContain("the page already showed 'Cancelled' before it ran.");
    const notShown = warnings(session('Cancel order O-1.', [read], { status: 'Cancelled' }, '- radio "Sales Order"'));
    expect(notShown[0]).toContain('made no state-changing action.');
    expect(notShown[0]).not.toContain('already showed');
  });

  it('a read-only check that quotes a mutating verb is not flagged (fwod34 09-change)', () => {
    expect(warnings(session('Read-only check, do not change anything: open order O-1 and report its status.', [read]))).toEqual([]);
    expect(warnings(session('Open order O-1 and report its status. Do not click any buttons or change anything — this is a read-only check.', [read]))).toEqual([]);
  });

  it('an observing instruction with no mutating verb is not flagged', () => {
    expect(warnings(session('Open order O-1 and report the status label shown on the form.', [read]))).toEqual([]);
  });

  it('a non-success report is left to the existing adoption reporting', () => {
    const entries = session('Cancel order O-1.', [inertClick]);
    (entries[entries.length - 1] as { status: string }).status = 'blocked';
    expect(warnings(entries)).toEqual([]);
  });

  it('a recording with no diffs at all cannot be read as a flow of no-ops', () => {
    const noDiff: RecordedEntry = { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {} };
    expect(warnings(session('Cancel order O-1.', [noDiff, read], { status: 'Cancelled' }))).toEqual([]);
  });
});

/**
 * Record-time contradiction detection: a read-only step right after a
 * mutating one reports a value that disagrees with it.
 *
 * fwod34's narrative motivates the shape (a step told to cancel an order
 * reports "Cancelled"; the very next read-only step reads the same order's
 * status back as "Sales Order", the value it carries whenever it is NOT
 * cancelled) even though the published fixture's own 06-open recorded no
 * values at all — its cancel never registered anything to contradict, which
 * is exactly why 07/08 below asserts silence on that shape too.
 */
describe('record-time contradiction between a mutating step and the read right after it', () => {
  /** Two instructions back to back: i mutates (or not), j reads. */
  function pair(
    iText: string,
    iValues: Record<string, string>,
    jText: string,
    jValues: Record<string, string>,
    iStatus: 'success' | 'blocked' = 'success',
  ): Flow {
    const entries: RecordedEntry[] = [
      { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/o/1` }, locators: {} },
      { k: 'instruction', text: iText, url: `${ORIGIN}/o/1` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {}, diff: { url: `${ORIGIN}/o/1`, alerts: [], added: ['- alert "done"'] } },
      { k: 'report', status: iStatus, summary: 'done', values: iValues, skill: 's_i' },
      { k: 'instruction', text: jText, url: `${ORIGIN}/o/1` },
      { k: 'step', tool: 'read', args: { target: '@e1', what: 'text' }, locators: {}, result: '"x"' },
      { k: 'report', status: 'success', summary: 'done', values: jValues, skill: 's_j' },
    ];
    return buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/o/1`, vars: {}, session: 's' })!;
  }

  it('flags the read-only step when it contradicts the mutating step right before it (06/07 shape)', () => {
    const flow = pair(
      'Cancel order O-1 and report its status.',
      { order_status: 'Cancelled' },
      'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.',
      { order_status: 'Sales Order' },
    );
    const [idI, idJ] = flow.steps.map((s) => s.id);
    expect(flow.warnings).toContain(
      `contradicted-step: ${idJ} read order_status "Sales Order" right after ${idI} reported "Cancelled"; ` +
        `${idI}'s change may not have landed and a later step may be retrying it. Re-record ${idI}.`,
    );
  });

  it('falls back to any status/state-named label when the two steps name the field differently', () => {
    const flow = pair(
      'Cancel order O-1 and report its status.',
      { order_status: 'Cancelled' },
      'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.',
      { current_state: 'Sales Order' },
    );
    const [idI, idJ] = flow.steps.map((s) => s.id);
    expect(flow.warnings).toContain(
      `contradicted-step: ${idJ} read current_state "Sales Order" right after ${idI} reported "Cancelled"; ` +
        `${idI}'s change may not have landed and a later step may be retrying it. Re-record ${idI}.`,
    );
  });

  it('does not check a step that is itself mutating (07/08 shape: the second step is not read-only)', () => {
    const entries: RecordedEntry[] = [
      { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/o/1` }, locators: {} },
      { k: 'instruction', text: 'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.', url: `${ORIGIN}/o/1` },
      { k: 'step', tool: 'read', args: { target: '@e1', what: 'text' }, locators: {}, result: '"x"' },
      { k: 'report', status: 'success', summary: 'done', values: { order_status: 'Sales Order' }, skill: 's_i' },
      { k: 'instruction', text: "The order O-1 is currently in 'Sales Order' status and needs to be cancelled; click Cancel and verify.", url: `${ORIGIN}/o/1` },
      { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {}, diff: { url: `${ORIGIN}/o/1`, alerts: [], added: ['- alert "done"'] } },
      { k: 'report', status: 'success', summary: 'done', values: { order_status: 'Cancelled' }, skill: 's_j' },
    ];
    const flow = buildFlow(entries, { name: 'f', origin: ORIGIN, startUrl: `${ORIGIN}/o/1`, vars: {}, session: 's' })!;
    expect(flow.warnings ?? []).toEqual([]);
  });

  it('stays silent on a legitimate change the next read confirms', () => {
    const flow = pair(
      'Confirm order O-1 and report its status.',
      { order_status: 'Confirmed' },
      'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.',
      { order_status: 'Confirmed' },
    );
    expect(flow.warnings ?? []).toEqual([]);
  });

  it('does not warn when the values agree by containment (a fuller status-bar line next to a single value)', () => {
    const flow = pair(
      'Cancel order O-1 and report its status.',
      { order_status: 'Cancelled' },
      'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.',
      { order_status: 'Cancelled\nSales Order\nQuotation Sent\nQuotation' },
    );
    expect(flow.warnings ?? []).toEqual([]);
  });

  it('compares the leading value, not the narration after it (fwod47 07-open/08-create)', () => {
    const agree = pair(
      'Cancel order O-1 and report its status.',
      { order_status: 'Cancelled (status bar radio "Cancelled" is the checked state; all other states disabled)' },
      'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.',
      { order_status: 'Cancelled (current checked state in the status bar; Sales Order, Quotation Sent and Quotation are unchecked and disabled)' },
    );
    expect(agree.warnings ?? []).toEqual([]);
    const disagree = pair(
      'Cancel order O-1 and report its status.',
      { order_status: 'Cancelled (status bar radio "Cancelled" is the checked state)' },
      'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.',
      { order_status: 'Sales Order — the status bar shows Cancelled unchecked' },
    );
    expect((disagree.warnings ?? []).some((w) => w.startsWith('contradicted-step:'))).toBe(true);
  });

  it('leadingValue cuts a parenthetical, a dash aside or a ; clause, never a label colon', () => {
    expect(leadingValue('Cancelled (checked)')).toBe('cancelled');
    expect(leadingValue('Sales  Order — confirmed')).toBe('sales order');
    expect(leadingValue('Done; saved')).toBe('done');
    expect(leadingValue('Status: Cancelled')).toBe('status: cancelled');
    expect(leadingValue('(none)')).toBe('(none)');
  });

  it('does not check a mutating step that did not report success', () => {
    const flow = pair(
      'Cancel order O-1 and report its status.',
      { order_status: 'Cancelled' },
      'Open order O-1 and report its status. Do not click anything or change it — this is a read-only check.',
      { order_status: 'Sales Order' },
      'blocked',
    );
    expect(flow.warnings ?? []).toEqual([]);
  });
});

describe('consumedReportedOutputs', () => {
  it('lists the reported outputs later steps ask for, by name, and never url parts', () => {
    // fwrd43-n3: a recovered 01-open reported `reference`, and every later
    // step asked for `ticket_reference` — so recovery must be told the names.
    const steps = [
      { id: '01-open', instruction: 'x', outputs: [], recorded: {} },
      { id: '02-add', instruction: 'On {{01-open.ticket_reference}} at {{01-open.url.h1}}', outputs: [], recorded: {} },
      { id: '03-save', instruction: 'x', outputs: [], recorded: {}, params: { v1: '{{01-open.body#uid}}' } },
      { id: '07-remove', instruction: 'until {{01-open.ticket_parts}}; see {{02-add.part}}', outputs: [], recorded: {} },
    ] as FlowStep[];
    expect(consumedReportedOutputs(steps, '01-open').sort()).toEqual(['body', 'ticket_parts', 'ticket_reference']);
    expect(consumedReportedOutputs(steps, '02-add')).toEqual(['part']);
    expect(consumedReportedOutputs(steps, '07-remove')).toEqual([]);
  });
});

describe('recovery text for an unpublished reference (fwkb8)', () => {
  // fwkb8's shape: 01-open reported the column names from a snapshot, its
  // skill read none of them, and 03-change's recovery was told to move the
  // task into the '' column — which the model refused, halting both replays.
  const flow: Pick<Flow, 'steps'> = {
    steps: [
      {
        id: '01-open',
        instruction: 'Open the board.',
        skill: 's_open',
        outputs: ['column_1_name', 'column_3_name', 'body'],
        recorded: { column_1_name: 'Backlog', column_3_name: 'Work in progress', 'url.q.project_id': '1', body: '{"task":{"id":"T-44"}}' },
      },
      {
        id: '03-change',
        instruction: "move the task into the '{{01-open.column_3_name}}' column, then verify it is in '{{01-open.column_3_name}}' (not {{01-open.column_1_name}}) for run {{runid}}",
        skill: 's_move',
        params: { v4: '{{01-open.column_3_name}}' },
        outputs: [],
        recorded: {},
      },
    ],
  };
  const step = flow.steps[1];
  const CAVEAT = " (recorded when this flow was made; this run's value may differ — check the page)";

  it('shows the recorded value, marked once per reference, and does not double the quotes around it', () => {
    expect(softResolveInstruction(step, { runid: 'z9' }, {}, flow)).toBe(
      `move the task into the 'Work in progress'${CAVEAT} column, then verify it is in 'Work in progress' (not 'Backlog'${CAVEAT}) for run z9`,
    );
  });

  it("prefers this run's value, and without the flow keeps the old blank", () => {
    expect(softResolveInstruction(step, { runid: 'z9' }, { '01-open': { column_3_name: 'Doing', column_1_name: 'Todo' } }, flow)).toBe(
      "move the task into the 'Doing' column, then verify it is in 'Doing' (not Todo) for run z9",
    );
    expect(softResolveInstruction(step, { runid: 'z9' }, {})).toBe("move the task into the '' column, then verify it is in '' (not ) for run z9");
  });

  it('resolves url parts and JSON leaves from what was recorded, quoting with a mark the value does not contain', () => {
    const st: FlowStep = { id: '02', instruction: 'open project {{01-open.url.q.project_id}} task "{{01-open.body#task.id}}"', outputs: [], recorded: {} };
    expect(softResolveInstruction(st, {}, {}, flow)).toBe(`open project '1'${CAVEAT} task 'T-44'${CAVEAT}`);
    const apostrophe: Pick<Flow, 'steps'> = { steps: [{ id: '01', instruction: 'x', outputs: ['n'], recorded: { n: "O'Brien" } }] };
    expect(softResolveInstruction({ id: '02', instruction: "call '{{01.n}}'", outputs: [], recorded: {} }, {}, {}, apostrophe)).toBe(`call "O'Brien"${CAVEAT}`);
  });

  it("keeps a value a later run watched change blank: it is the recording's record", () => {
    const watched: Pick<Flow, 'steps'> = { steps: [{ ...flow.steps[0], outputEvidence: { column_3_name: { same: 0, differed: 1 } } }, step] };
    expect(softResolveInstruction(step, { runid: 'z9' }, {}, watched)).toContain("into the '' column");
  });

  it('leaves the zero-model paths unresolved — only recovery text sees recorded values', () => {
    const bound = resolveStepParams(step, { runid: 'z9' }, {})!;
    expect(bound.missing).toEqual(['01-open.column_3_name']);
    expect(bound.params.v4).toBe('{{01-open.column_3_name}}');
    expect(resolveInstruction(step, { runid: 'z9' }, {}).text).not.toContain('Work in progress');
  });
});

describe('valueLineCandidates', () => {
  it('names each line whose accessible name IS the value, display roles first, never a longer name', () => {
    const lines = ['- link "Backlog"', '- cell "Backlog ( Total number of tasks 3)"', '- link "Work in progress"', '- cell "Work in progress"', '- button "Mark Work in progress"'];
    expect(valueLineCandidates(lines, 'Work in progress')).toEqual([
      { kind: 'role', role: 'cell', name: 'Work in progress' },
      { kind: 'role', role: 'link', name: 'Work in progress' },
    ]);
    expect(valueLineCandidates(lines, 'Backlog')).toEqual([{ kind: 'role', role: 'link', name: 'Backlog' }]);
  });

  it('skips a role+name shown more than once, and controls whose name is a label', () => {
    const lines = ['- link "Ready"', '- link "Ready"', '- textbox "Ready": x', '- combobox "Status": Ready'];
    expect(valueLineCandidates(lines, 'Ready')).toEqual([]);
    expect(valueLineCandidates(['- heading "Ready" [disabled]'], ' Ready ')).toEqual([{ kind: 'role', role: 'heading', name: 'Ready' }]);
  });
});

describe('liveReadsFor', () => {
  const board = `${ORIGIN}/board`;
  const entries = (): RecordedEntry[] => [
    { k: 'instruction', text: 'Open the board and report the column names.', url: `${ORIGIN}/` },
    { k: 'step', tool: 'click', args: { target: '@e1' }, locators: {}, diff: { url: board, alerts: [], added: ['- heading "Bench Board"'], dialect: 2 } },
    { k: 'report', status: 'success', summary: 'ok', values: { column_1_name: 'Backlog', column_3_name: 'Work in progress', task_id: '4' }, skill: 's_open' },
    {
      k: 'instruction',
      text: "Create a task in the 'Bench Board' project.",
      url: board,
      startText: ['- heading "Bench Board"', '- link "Backlog"', '- columnheader "Work in progress"', '- link "Work in progress"'].join('\n'),
      startDialect: 2,
    },
    { k: 'report', status: 'success', summary: 'ok', values: {}, skill: 's_create' },
    { k: 'instruction', text: "Move the task into the 'Work in progress' column, not 'Backlog'; task 4.", url: board },
    { k: 'report', status: 'success', summary: 'ok', values: {}, skill: 's_move' },
  ];
  const flow = (): Flow => buildFlow(entries(), { name: 'kb', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 'kb-n1' })!;

  it('reads the fwkb8 shape: a referenced column name the producing skill never reads', () => {
    const f = flow();
    expect(f.steps.map((s) => s.id)).toEqual(['01-open', '02-create', '03-step']);
    expect(f.steps[2].instruction).toContain("'{{01-open.column_3_name}}'");
    const reads = liveReadsFor(entries(), f, (id) => (id === 's_open' ? ['column_1_name'] : []));
    // column_1_name is already published; task_id is nowhere on the page as a name.
    expect(reads).toEqual([
      {
        stepId: '01-open',
        skill: 's_open',
        output: 'column_3_name',
        value: 'Work in progress',
        source: 'start',
        read: {
          tool: 'read',
          args: { target: '@synth', what: 'text' },
          locators: { target: [{ kind: 'role', role: 'columnheader', name: 'Work in progress' }, { kind: 'role', role: 'link', name: 'Work in progress' }] },
          label: 'column_3_name',
        },
      },
    ]);
  });

  it("falls back to the producing instruction's own diffs on its final page, and gives no verdict for a skill not in the store", () => {
    const f = flow();
    f.steps[2].instruction = 'Open {{01-open.board_title}}.';
    f.steps[0].recorded = { ...f.steps[0].recorded, board_title: 'Bench Board' };
    const noStart = entries().map((e) => (e.k === 'instruction' && e.startText ? { ...e, startText: '' } : e));
    const reads = liveReadsFor(noStart, f, () => []);
    expect(reads.map((r) => [r.output, r.source, r.read.locators.target])).toEqual([['board_title', 'diff', [{ kind: 'role', role: 'heading', name: 'Bench Board' }]]]);
    expect(liveReadsFor(entries(), flow(), () => null)).toEqual([]);
  });

  it('adds no read for a value the run is known to have made (fwkb3: task_id "#4" shown as link "#4")', () => {
    const f = flow();
    f.steps[2].instruction = 'Open task {{01-open.task_ref}} in {{01-open.column_3_name}}.';
    f.steps[0].recorded = { ...f.steps[0].recorded, task_ref: '#4' };
    const withRef = entries().map((e) => (e.k === 'instruction' && e.startText ? { ...e, startText: `${e.startText}\n- link "#4"` } : e));
    // column_1_name: unreferenced, but declared data with a line on the page.
    expect(liveReadsFor(withRef, f, () => []).map((r) => r.output)).toEqual(['task_ref', 'column_3_name', 'column_1_name']);
    expect(liveReadsFor(withRef, f, () => [], (v) => v === '#4').map((r) => r.output)).toEqual(['column_3_name', 'column_1_name']);
  });

  it('reads an unreferenced DATA output too, but not one of an adopted step, nor narration (fwod47 02-create untaxed_amount)', () => {
    const withTotal = entries().map((e) =>
      e.k === 'report' && e.skill === 's_open'
        ? { ...e, values: { ...e.values, untaxed_amount: '£ 885.00', how: 'clicked the board link then read every column header left to right' } }
        : e.k === 'instruction' && e.startText
          ? { ...e, startText: `${e.startText}\n- cell "£ 885.00"\n- cell "clicked the board link then read every column header left to right"` }
          : e,
    );
    const f = buildFlow(withTotal, { name: 'kb', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: {}, session: 'kb-n1' })!;
    const reads = liveReadsFor(withTotal, f, (id) => (id === 's_open' ? ['column_1_name'] : []));
    expect(reads.map((r) => r.output)).toEqual(['column_3_name', 'untaxed_amount']);
    f.steps[0].adopted = true;
    // Still read: column_3_name is referenced, and an adopted producer's reference is not this rule's to skip.
    expect(liveReadsFor(withTotal, f, (id) => (id === 's_open' ? ['column_1_name'] : [])).map((r) => r.output)).toEqual(['column_3_name']);
  });

  it('once appended to the producing skill, the lint sees the output as published and retirement can strip it', async () => {
    const f = flow();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-liveread-'));
    try {
      const store = new SkillStore(dir);
      const skill: Skill = {
        id: 's_open',
        origin: ORIGIN,
        template: 'open the board',
        params: {},
        preconditions: { urlPattern: `${ORIGIN}/` },
        steps: [{ tool: 'read_all', args: { target: 'table a', what: 'text' }, locators: { target: [{ kind: 'css', selector: 'table a' }] }, label: 'column_1_name' }],
        stats: { uses: 1, successes: 1, partial: 0, created: 'now', failedAtStep: {}, fallthroughs: 0 },
        status: 'provisional',
        provenance: { session: 'kb-n1', instruction: 'open the board', created: 'now' },
      };
      store.put(skill);
      for (const id of ['s_create', 's_move']) store.put({ ...skill, id, steps: [] });
      const publishes = (id: string): string[] | null => {
        const sk = store.get(id);
        return sk ? publishedOutputs(sk) : null;
      };
      expect(lintFlowRefs(f, publishes).some((w) => w.includes('{{01-open.column_3_name}}'))).toBe(true);
      // What the daemon's export does with each read (server.ts exportFlow).
      for (const live of liveReadsFor(entries(), f, publishes)) store.update(live.skill, (sk) => ({ ...sk, steps: [...sk.steps, live.read] }));
      expect(lintFlowRefs(f, publishes).some((w) => w.includes('column_3_name'))).toBe(false);
      // A later run that reports a different column retires the value-located candidates.
      const stored = store.get('s_open')!;
      expect(dropDeadReadLocators(stored.steps, { column_3_name: 'Work in progress' })).toBe(2);
      expect(stored.steps[1].locators.target).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('pruneUnsourcedOutputs (fwod47 tier-A unreported data)', () => {
  const step = (over: Partial<FlowStep>): FlowStep => ({
    id: '02-create',
    instruction: 'Create a quotation.',
    skill: 's_create',
    outputs: ['quotation_reference', 'untaxed_amount', 'total', 'actions_taken', 'url.q.id'],
    recorded: {
      quotation_reference: 'S00021',
      untaxed_amount: '£ 885.00',
      total: '£ 1,062.00',
      actions_taken: 'clicked New then typed the customer then picked the product and saved the form',
      'url.q.id': '21',
    },
    ...over,
  });
  const flowOf = (steps: FlowStep[]): Flow => ({ name: 'f', origin: ORIGIN, startUrl: ORIGIN, vars: [], steps, provenance: { session: 's', created: 'now' } });

  it('drops data a pinned skill does not publish and no step references; keeps published, referenced, narration and url parts', () => {
    const f = flowOf([step({}), { id: '03-open', instruction: 'Check the total is {{02-create.total}}.', skill: 's_open', outputs: [], recorded: {} }]);
    const out = pruneUnsourcedOutputs(f, (id) => (id === 's_create' ? ['quotation_reference'] : []));
    expect(out.dropped).toEqual([{ stepId: '02-create', outputs: ['untaxed_amount'] }]);
    expect(out.flow.steps[0].outputs).toEqual(['quotation_reference', 'total', 'actions_taken', 'url.q.id']);
    // Recorded values stay: cross-run evidence and recorded-ref fallbacks read them.
    expect(out.flow.steps[0].recorded.untaxed_amount).toBe('£ 885.00');
    expect(f.steps[0].outputs).toContain('untaxed_amount');
  });

  it('leaves adopted, unpinned and unknown-skill steps alone', () => {
    const publishes = (id: string): string[] | null => (id === 's_create' ? [] : null);
    expect(pruneUnsourcedOutputs(flowOf([step({ adopted: true })]), publishes).dropped).toEqual([]);
    expect(pruneUnsourcedOutputs(flowOf([step({ skill: undefined })]), publishes).dropped).toEqual([]);
    expect(pruneUnsourcedOutputs(flowOf([step({ skill: 's_gone' })]), publishes).dropped).toEqual([]);
  });
});

/**
 * fwrd54 07-edit: `{{06-change.mark_ready_button}}` ("Mark Ready") was never
 * re-read by 06's tier-A replay, so 07 fell to model recovery on n2 and n3.
 * recordedStandIn decides which recorded values may stand in when the page
 * shows them — on the evidence that the pinned procedure uses the slot only as
 * a control's name, never on the value's characters; recordedValueShown
 * refuses this run's values before looking.
 */
describe('recordedStandIn (fwrd54 07-edit)', async () => {
  const { recordedStandIn: standIn } = await import('../src/skills/flow.js');
  const { recordedValueShown } = await import('../src/execution/snapshot.js');
  type Seg = Parameters<typeof standIn>[2][number];
  const REF = '06-change.mark_ready_button';
  const params = { v3: '{{runid}}', v5: '{{06-change.mark_ready_button}}', v2: '{{runid}} RD Part A' };
  const fillA: SkillStep = { tool: 'fill', args: { target: '@e1', value: '{{v2}}' }, locators: { target: [{ kind: 'label', label: 'Name' }] } };
  // 07-edit's recorded step 6, as s_8f60bc stores it.
  const press = (role = 'button', tool = 'click'): SkillStep => ({
    tool,
    args: { target: 'role=' + role + '[name="{{v5}}"]' },
    locators: { target: [{ kind: 'css', selector: 'role=' + role + '[name="{{v5}}"]' }, { kind: 'role', role, name: '{{v5}}' }] },
  });
  const seg = (v5: string, steps: SkillStep[] = [fillA, press()], over: Partial<Seg> = {}): Seg => ({
    params: {
      v2: { example: 'fwrd54-n1 RD Part A', usedIn: [1], known: true },
      v3: { example: 'fwrd54-n1', usedIn: [], known: true, binding: 'var:runid' },
      v5: { example: v5, usedIn: [2], known: true, binding: 'output:i6:mark_ready_button' },
    },
    steps,
    ...over,
  });

  it("stands in a clicked button's recorded label when the producer recorded the same", () => {
    expect(standIn(REF, params, [seg('Mark Ready')], { recorded: 'Mark Ready' })).toBe('Mark Ready');
    expect(standIn(REF, params, [seg('Mark Ready')])).toBe('Mark Ready');
    // Inside a loop body too, and for the other control roles.
    const loop: SkillStep = { tool: 'loop', args: {}, locators: {}, body: [press('tab')] };
    expect(standIn(REF, params, [seg('Mark Ready', [loop])])).toBe('Mark Ready');
    expect(standIn(REF, params, [seg('Mark Ready', [press('checkbox', 'check')])])).toBe('Mark Ready');
  });

  it('refuses when the producer recorded something else, or a later run watched it change', () => {
    expect(standIn(REF, params, [seg('Mark Ready')], { recorded: 'Mark Draft' })).toBeUndefined();
    expect(standIn(REF, params, [seg('Mark Ready')], { recorded: 'Mark Ready', differed: true })).toBeUndefined();
  });

  /**
   * Evidence, not shape: an id-shaped value the procedure clicks AS A BUTTON'S
   * NAME is that button's label and stands in (the page check still has to
   * find it); the same value named by a link, typed, read, navigated by or
   * used as the identity marker is record data and is refused.
   */
  it('decides by how the procedure uses the slot, not by what the value looks like', () => {
    expect(standIn(REF, params, [seg('RD-1015')])).toBe('RD-1015');
    expect(standIn(REF, params, [seg('RD-1015', [press('link')])])).toBeUndefined();
    const typed: SkillStep = { tool: 'fill', args: { target: '@e1', value: '{{v5}}' }, locators: { target: [{ kind: 'label', label: 'Status' }] } };
    expect(standIn(REF, params, [seg('Mark Ready', [press(), typed])])).toBeUndefined();
    const read: SkillStep = { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target: [{ kind: 'text', text: '{{v5}}' }] } };
    expect(standIn(REF, params, [seg('Mark Ready', [read])])).toBeUndefined();
    const goto: SkillStep = { tool: 'goto', args: { url: 'http://app.test/{{v5}}' }, locators: {} };
    expect(standIn(REF, params, [seg('Mark Ready', [goto, press()])])).toBeUndefined();
    expect(standIn(REF, params, [seg('Mark Ready', [press()], { preconditions: { requireText: ['{{v5}}'] } })])).toBeUndefined();
    // A slot no step uses carries no evidence either way.
    expect(standIn(REF, params, [seg('Mark Ready', [fillA])])).toBeUndefined();
  });

  it('refuses a value holding a recorded var', () => {
    expect(standIn(REF, params, [seg('fwrd54-n1 RD Bench Ticket')])).toBeUndefined();
  });

  it('only for a param bound to exactly the reference, never a url part, a JSON path or a var', () => {
    expect(standIn('06-change.other', params, [seg('Mark Ready')])).toBeUndefined();
    expect(standIn('02-create.url.p1', { v5: '{{02-create.url.p1}}' }, [seg('Board')])).toBeUndefined();
    expect(standIn('02-create.body#a.b', { v5: '{{02-create.body#a.b}}' }, [seg('Board')])).toBeUndefined();
    expect(standIn('runid', params, [seg('Mark Ready')])).toBeUndefined();
    expect(standIn(REF, { v5: 'click {{06-change.mark_ready_button}}' }, [seg('Mark Ready')])).toBeUndefined();
  });

  it('refuses segments that recorded different examples, and prose-length values', () => {
    expect(standIn(REF, params, [seg('Mark Ready'), seg('Mark Done')])).toBeUndefined();
    expect(standIn(REF, params, [seg('x'.repeat(81))])).toBeUndefined();
  });

  it("recordedValueShown refuses a value holding this run's var without reading the page", async () => {
    const page = { evaluate: () => { throw new Error('the page must not be read'); } } as never;
    expect(await recordedValueShown(page, 'fwrd54-n2 RD Part A', ['fwrd54-n2'])).toBe(false);
    expect(await recordedValueShown(page, '   ', [])).toBe(false);
  });
});

/**
 * fwod49: the stand-in rescue used to run only over the references
 * `ignorableRefs` had NOT skipped, and the product name — recorded, standing
 * on the page, and used by a later segment of the pinned chain — was skipped
 * and never looked for. "Ignorable" answers one narrow question (can this
 * blank change what the pinned procedure DOES?) and a no there is not a claim
 * that the value is worthless: it is still the step's wording and still banked
 * for later steps. So runFlow offers the rescue to EVERY unresolved reference
 * and lets recordedStandIn (which refuses anything but page vocabulary) and
 * the live page decide.
 */
describe('the recorded stand-in reaches every unresolved reference (fwod49)', async () => {
  const { recordedStandIn: standIn } = await import('../src/skills/flow.js');
  type Seg = Parameters<typeof standIn>[2][number];
  const REF = '02-open.product_name';
  const stepParams = { v5: `{{${REF}}}` };
  // The pinned HEAD of the chain does not use the slot: it opens the list.
  const head = {
    params: { v5: { example: 'Ergonomic Chair', usedIn: [], known: true } },
    preconditions: { urlPattern: 'http://x/' },
    steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'button', name: 'New' }] } }],
  } as unknown as Seg & Skill;
  // The chain's next segment picks the product BY NAME — the evidence that the
  // recorded value is page vocabulary.
  const tail = {
    params: { v5: { example: 'Ergonomic Chair', usedIn: [1], known: true } },
    preconditions: { urlPattern: 'http://x/' },
    steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'role', role: 'option', name: '{{v5}}' }] } }],
  } as unknown as Seg;
  const step = { id: '03-open', instruction: 'add {{02-open.product_name}}', skill: 's_head', params: stepParams } as unknown as FlowStep;

  it('a reference the pinned head cannot act on is ignorable, and still has a stand-in', () => {
    // Ignorable — the head's own slot is used by no step of the head.
    expect(ignorableRefs([REF], step, head as unknown as Skill)).toEqual([REF]);
    // …and the chain nevertheless knows exactly what the page should be showing.
    expect(standIn(REF, stepParams, [head, tail], { recorded: 'Ergonomic Chair' })).toBe('Ergonomic Chair');
  });

  it('runFlow runs the rescue over every unresolved reference, not only the non-ignorable ones', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/daemon/server.ts'), 'utf8');
    const start = source.indexOf('const before = [...resolveInstruction(step, varsIn, outputs).missing');
    expect(start).toBeGreaterThan(0);
    const region = source.slice(start, source.indexOf('const { text, missing } = resolveInstruction(step, varsIn, outputs);', start));
    expect(region).toMatch(/for \(const ref of new Set\(before\)\)/);
    expect(region).not.toMatch(/ignorableRefs/); // the rescue no longer filters by it
  });
});
