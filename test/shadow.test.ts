import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { attribute, causeWindow, type JournalEvent, type JournalWindow } from '../src/daemon/journal-attribute.js';
import { windowKindOf } from '../src/daemon/journal.js';
import { carryOpener, compileSkills } from '../src/skills/compile.js';
import { shadowVerdicts, type ShadowRow } from '../src/skills/shadow.js';

/**
 * The shadow report over real recordings, ANNOTATED: each fixture is a
 * published n1 instruction, verbatim, plus the raw journal events the recorder
 * would have seen — COUNTERFACTUAL, inferred from the recording's own diffs,
 * reads, evals, stage-0 timings and the replays' stops (each case says what).
 * The events are placed at the recorded dispatch times and attributed by the
 * real rules (journal-attribute.ts) against windows built from those timings,
 * then filed on the steps the way the recorder files them. The shadow then
 * compares each rule's fact with what compile actually did.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (file: string): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', file), 'utf8').replace(/\r\n/g, '\n')).entries;

type Raw = Omit<JournalEvent, 't' | 'c'> & { dt: number; dt1?: number; sa?: number };
const INPUT = new Set(['fill', 'type', 'press', 'select', 'check']);

/**
 * Journal every step (window = its seq; recordings without seq/obs get
 * synthetic ones, 5 s apart) and file the raw events: each at `dt` ms after
 * its step's dispatch (`dt1`: a request's answer; `sa: n`: shown at step n's
 * dispatch + 40), attributed, then put on the step that caused it or in the
 * gap of the next step after it.
 */
function annotate(entries: RecordedEntry[], raw: Record<number, Raw[]>): RecordedEntry[] {
  const out = entries.map((e, i) => (e.k === 'step' ? ({ ...e, seq: e.seq ?? i, obs: e.obs ?? { at: { d: 1_000_000 + i * 5_000, s: 1_000_000 + i * 5_000 + 400 } } } as RecordedStep) : e));
  const steps = out.filter((e): e is RecordedStep => e.k === 'step');
  const at = (seq: number) => steps.find((s) => s.seq === seq)!.obs!.at.d;
  const windows: JournalWindow[] = steps.map((s) => ({
    w: s.seq!,
    kind: windowKindOf(s.tool),
    tool: s.tool,
    start: s.obs!.at.d,
    end: s.obs!.at.s ?? s.obs!.at.d + 50,
    ...(INPUT.has(s.tool) ? { input: true } : {}),
  }));
  const events: JournalEvent[] = [];
  for (const [seq, list] of Object.entries(raw)) {
    for (const { dt, dt1, sa, ...rest } of list) {
      const d = at(Number(seq));
      events.push({ ...rest, t: d + dt, ...(dt1 !== undefined ? { t1: d + dt1 } : {}), ...(sa !== undefined ? { sa: at(sa) + 40 } : {}) } as JournalEvent);
    }
  }
  const attributed = attribute(events, windows);
  for (const s of steps) s.journal = { w: s.seq! };
  for (const e of attributed) {
    const owner = steps.find((s) => s.seq === causeWindow(e.c));
    const home = owner ?? steps.find((s) => s.obs!.at.d >= e.t) ?? steps[steps.length - 1];
    const j = home.journal!;
    if (owner) j.ev = [...(j.ev ?? []), e];
    else j.gap = { ev: [...(j.gap?.ev ?? []), e] };
  }
  return out;
}

function report(entries: RecordedEntry[], from = 0): Extract<RecordedEntry, { k: 'report' }> {
  return entries.slice(from).find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
}

function compileSpan(entries: RecordedEntry[], session: string, before: RecordedEntry[] = []) {
  const head = entries[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const rep = report(entries);
  const own = carryOpener(before, entries.slice(0, entries.indexOf(rep)));
  const skills = compileSkills({
    entries: own,
    instruction: head.text,
    report: { status: 'success', summary: rep.summary, evidence: { values: rep.values ?? {} } },
    session,
    knownValues: { 'var:runid': session },
    ...(before.length ? { before } : {}),
  });
  return shadowVerdicts(own, skills, before);
}

const rowsFor = (rows: ShadowRow[], rule: string) => rows.filter((r) => r.rule === rule);
/** The verdicts, printed: the shadow's output on the round-61 cases is what this measures. */
const show = (name: string, rows: ShadowRow[]) => {
  if (process.env.SHADOW_PRINT) console.log(`\n${name}\n${rows.map((r) => `  [${r.agree ? 'agree' : 'DISAGREE'}] ${r.rule} ${r.seq ?? ''} ${r.step ?? ''}\n    fact: ${r.fact}\n    heuristic: ${r.heuristic}`).join('\n')}`);
  return rows;
};

describe('shadow: no journal, no rows', () => {
  it('an old store (no journal on any step) produces nothing', () => {
    const e = load('fwgr73-n1-04-open.jsonl');
    const rep = report(e);
    const own = e.slice(0, e.indexOf(rep));
    const skills = compileSkills({ entries: own, instruction: (e[0] as { text: string }).text, report: { status: 'success', summary: rep.summary, evidence: { values: rep.values ?? {} } }, session: 's' });
    expect(shadowVerdicts(own, skills)).toEqual([]);
  });
});

describe('shadow (b): an edit abandoned before a navigation (grafana fwgr73 04-open)', () => {
  // fwgr73-n1 04-open. #110's drawer Save sent the dashboard (POST
  // /api/dashboards/db carrying #105's tag "bench"; the recording shows
  // `status "Dashboard saved"`, and #133-#141 read the tag back). #125 typed
  // `"tags"` into the JSON model editor, which REPLACED the whole model (#127
  // reads `"tags""tags""`), and #128's goto left with no save: both replays and
  // the artifact stopped at that type ("the field holds the value it was given
  // twice over"). Counterfactual: the POST at #110 (high confidence) and no
  // request at all from #124 to #128 (the recording's networkMs, and the
  // replays' stops).
  const raw: Record<number, Raw[]> = {
    110: [{ dt: 50, dt1: 120, k: 'req', m: 'POST', e: 'http://127.0.0.1:3000/api/dashboards/db', s: 200, carries: [105] }],
    125: [{ dt: 40, k: 'val', f: 'textbox "Editor content"', len: 14 }],
  };

  it('says #125 was abandoned, and that compile kept it; #105 and #109 were saved', () => {
    const rows = show('fwgr73 04-open', rowsFor(compileSpan(annotate(load('fwgr73-n1-04-open.jsonl'), raw), 'fwgr73-n1'), 'abandonedEdit'));
    const at = (seq: number) => rows.find((r) => r.seq === seq)!;
    expect(at(125).fact).toMatch(/^abandoned/);
    expect(at(125).heuristic).toBe('kept in the procedure');
    expect(at(125).agree).toBe(false);
    expect(at(105).fact).toMatch(/^saved \(a request carried its value\)/);
    expect(at(105).agree).toBe(true);
    expect(at(109).fact).toMatch(/^saved/);
  });

  it('a request carrying the edit before the goto makes it saved', () => {
    const saved = { ...raw, 125: [{ dt: 400, dt1: 480, k: 'req' as const, m: 'POST', e: 'http://127.0.0.1:3000/api/dashboards/db', s: 200, carries: [125] }] };
    const row = rowsFor(compileSpan(annotate(load('fwgr73-n1-04-open.jsonl'), saved), 'fwgr73-n1'), 'abandonedEdit').find((r) => r.seq === 125)!;
    expect(row.fact).toMatch(/^saved/);
    expect(row.agree).toBe(true);
  });
});

describe('shadow (a): a picker\'s net option state (gitea fwgt12 03-set)', () => {
  // fwgt12-n1 03-set, two instructions: #33-#72 blocked at its turn cap, #73-#97
  // the escalation, successful. Counterfactual ticks, from the recording's own
  // evals of the items' classes (#45 "item muted", #54 "item muted checked",
  // #68 priority-high unchecked, #70 checked, #85 unchecked after #78's
  // reload, #90 checked) and the timeline's "added the bug label 21:36:13",
  // the dispatch of #55: Gitea commits when the picker CLOSES.
  //   #34 open; #35 bug on; #37 bug off; (#44 failed: strict mode); #46 bug on;
  //   #55 close + POST (commits {bug}); #59 open; #64 close, no request;
  //   #67 open; #69 priority-high on; #78 reload (drops it); #79 open;
  //   #87 priority-high on; #91 close + POST (commits {bug, priority-high}).
  const LABELS = 'listbox "Labels Clear labels bug documentation enhancement priority-high"';
  const POST = { k: 'req' as const, m: 'POST', e: 'http://127.0.0.1:8095/bench/bench-repo/issues/labels', s: 200 };
  const raw: Record<number, Raw[]> = {
    34: [{ dt: 40, k: 'show', d: LABELS, lm: 1 }],
    35: [{ dt: 30, k: 'state', d: 'option "bug"', a: 'class', on: true }],
    37: [{ dt: 30, k: 'state', d: 'option "bug"', a: 'class', on: false }],
    46: [{ dt: 30, k: 'state', d: 'option "bug"', a: 'class', on: true }],
    55: [{ dt: 30, k: 'hide', d: LABELS, lm: 1, sa: 34 }, { dt: 40, dt1: 90, ...POST }],
    59: [{ dt: 40, k: 'show', d: LABELS, lm: 2 }],
    64: [{ dt: 30, k: 'hide', d: LABELS, lm: 2, sa: 59 }],
    67: [{ dt: 40, k: 'show', d: LABELS, lm: 3 }],
    69: [{ dt: 30, k: 'state', d: 'option "priority-high"', a: 'class', on: true }],
    79: [{ dt: 40, k: 'show', d: LABELS, lm: 4 }],
    87: [{ dt: 30, k: 'state', d: 'option "priority-high"', a: 'class', on: true }],
    91: [{ dt: 30, k: 'hide', d: LABELS, lm: 4, sa: 79 }, { dt: 40, dt1: 90, ...POST }],
  };

  it('records bug + priority-high selected, committed at the two closes, and compares the procedure\'s kept ticks', () => {
    // #73 is the escalation's RESUME of #33 (recordAs resume): one instruction to
    // compile, up to the success report, as the daemon learns it.
    const all = annotate(load('fwgt12-n1-03-set.jsonl'), raw);
    const success = all.findIndex((e) => e.k === 'report' && e.status === 'success');
    const rows = show('fwgt12 03-set (the blocked attempt and its resume, one instruction)', compileSpan(all.filter((e, i) => i <= success && !(e.k === 'report' && e.status !== 'success')), 'fwgt12-n1'));
    const [net] = rowsFor(rows, 'pickerNetState');
    expect(net.fact).toMatch(/^net selected: \[bug, priority-high\]; commits: \{bug\} when it closed \(#55\) then \{bug, priority-high\} when it closed \(#91\)/);
    // The procedure's kept ticks (bug x3 net on; priority-high at #87, #69 dropped
    // as an abandoned link click) end in the same state: the net-state question
    // agrees here. fwgt12's replay stop was elsewhere (#59's re-open expectation).
    expect(net.heuristic).toBe("the procedure's kept ticks give [bug, priority-high]");
    expect(net.agree).toBe(true);
  });
});

describe('shadow (c): what caused a flash an expectation rests on (vikunja fwvk12 02-create)', () => {
  // fwvk12-n1 02-create. #23 clicked the empty description placeholder and its
  // diff added `heading "Description Saved!"` (networkMs 0 in its settle); the
  // replays never saw it after the same click ("none of the 1 recorded page
  // change(s) appeared") and s_329439 was demoted. #34 clicked the editor's
  // SAVE and saw the same flash. Counterfactual (medium-low confidence for
  // #23): Vikunja's delayed description autosave, a request the app sent on
  // its own (a timer armed when #22 opened the task), answered inside #23's
  // window with the flash right after; for #34, the SAVE's own POST carrying
  // #33's description, then the flash.
  const raw: Record<number, Raw[]> = {
    23: [
      { dt: -150, dt1: 100, k: 'req', m: 'POST', e: 'http://127.0.0.1:8096/api/v1/tasks/4', s: 200 },
      { dt: 5, k: 'hit', ty: 'pd', d: 'paragraph ""', on: 1, tr: 1 },
      { dt: 120, k: 'txt', d: 'heading', x: 'Description Saved!', was: 'Description' },
    ],
    34: [
      { dt: 30, dt1: 120, k: 'req', m: 'POST', e: 'http://127.0.0.1:8096/api/v1/tasks/4', s: 200, carries: [33] },
      { dt: 150, k: 'txt', d: 'heading', x: 'Description Saved!', was: 'Description' },
    ],
  };

  it('#23\'s flash is ambiguous (an answer the click did not ask for landed with it), and compile no longer expects it (round 61); #34\'s is its own', () => {
    const rows = show('fwvk12 02-create', rowsFor(compileSpan(annotate(load('fwvk12-n1-02-create.jsonl'), raw), 'fwvk12-n1'), 'flashCause'));
    const at = (seq: number) => rows.find((r) => r.seq === seq)!;
    expect(at(23).fact).toMatch(/ambiguous/);
    expect(at(23).fact).toContain("the app's own request");
    // Phase C's shadow first recorded this as a disagreement; round 61's
    // dropFlashedLines (compile.ts) removed the flash from #23's step, so the
    // heuristic and the recorded fact now agree.
    expect(at(23).heuristic).toBe('the compiled step does not expect it');
    expect(at(23).agree).toBe(true);
    expect(at(34).fact).toMatch(/was this step's own change/);
    expect(at(34).agree).toBe(true);
  });

  it('a flash from the app\'s own request, before the click went out, is foreign', () => {
    // Answered and shown after #22's capture but before #23's dispatch (the daemon's own window): not the click's.
    const late = { ...raw, 23: [{ dt: -300, dt1: -150, k: 'req' as const, m: 'POST', e: 'http://127.0.0.1:8096/api/v1/tasks/4', s: 200 }, { dt: -100, k: 'txt' as const, d: 'heading', x: 'Description Saved!' }] };
    const row = rowsFor(compileSpan(annotate(load('fwvk12-n1-02-create.jsonl'), late), 'fwvk12-n1'), 'flashCause').find((r) => r.seq === 23);
    expect(row?.fact ?? '').toMatch(/was not this step's \(app:req\)/);
  });
});

describe('shadow: a repeated click (ghost fwgh12 03-publish)', () => {
  // fwgh12-n1 03-publish #6 and #9: the same `link "Published"` twice, only
  // reads between; the first changed nothing, the second navigated. Replays
  // ignored the single kept press too, so the app ignores it. Counterfactual:
  // #6 landed on its target (hit on) and nothing followed; #9 navigated.
  const raw: Record<number, Raw[]> = {
    6: [{ dt: 5, k: 'hit', ty: 'pd', d: 'link "Published"', on: 1, tr: 1 }],
    9: [{ dt: 5, k: 'hit', ty: 'pd', d: 'link "Published"', on: 1, tr: 1 }, { dt: 120, k: 'nav', url: 'http://127.0.0.1:8099/ghost/#/posts?type=published' }],
  };

  it('the first press was ignored; compile keeps one press that presses again', () => {
    const rows = show('fwgh12 03-publish', rowsFor(compileSpan(annotate(load('fwgh12-n1-03-publish.jsonl'), raw), 'fwgh12-n1'), 'repeatClick'));
    expect(rows).toHaveLength(1);
    expect(rows[0].fact).toMatch(/app ignored it/);
    expect(rows[0].heuristic).toBe('one press dropped, the kept one presses again if nothing happens');
    expect(rows[0].agree).toBe(true);
  });

  it('had the first press landed on an overlay, dropping it would disagree', () => {
    const covered = { ...raw, 6: [{ dt: 5, k: 'hit' as const, ty: 'pd', d: 'dialog "Boom"', on: 0, cover: 'dialog "Boom"', tr: 1 }] };
    const [row] = rowsFor(compileSpan(annotate(load('fwgh12-n1-03-publish.jsonl'), covered), 'fwgh12-n1'), 'repeatClick');
    expect(row.fact).toMatch(/landed on dialog "Boom"/);
    expect(row.agree).toBe(false);
  });
});

describe('shadow: hides and superseded sets (synthetic)', () => {
  const chain = (sel: string) => ({ target: { expr: `page.locator('${sel}')`, verified: true, raw: sel, chain: [{ kind: 'css' as const, selector: sel }] } });
  const step = (tool: string, sel: string, args: Record<string, unknown> = {}): RecordedStep => ({ k: 'step', tool, args: { target: sel, ...args }, locators: chain(sel), diff: { url: 'http://app/form', alerts: [], added: [], dialect: 2 } });
  const base = (steps: RecordedStep[]): RecordedEntry[] => [{ k: 'instruction', text: 'set the date', url: 'http://app/form' }, ...steps, { k: 'report', status: 'success', summary: 'done', values: {} }];

  it('a click that closed only what the entry opened is not required (snipe-it fwsi10)', () => {
    const e = annotate(base([step('fill', '#date', { value: '2026-03-15' }), step('click', '.day-15')]), {
      1: [{ dt: 5, k: 'foc', dir: 'in', d: 'textbox "Date"' }, { dt: 30, k: 'show', d: 'grid "March 2026"', lm: 7 }, { dt: 35, k: 'val', f: 'textbox "Date"', len: 10 }],
      2: [{ dt: 20, k: 'hide', d: 'grid "March 2026"', lm: 7, sa: 1 }],
    });
    const [row] = rowsFor(compileSpan(e, 'syn'), 'hideRequired');
    expect(row.fact).toMatch(/only closed what the entry fill #date opened: not required/);
    expect(row.agree).toBe(true);
  });

  it('a click that closed what an opener click opened is required', () => {
    const e = annotate(base([step('click', '#open'), step('click', '#close')]), {
      1: [{ dt: 30, k: 'show', d: 'dialog "Edit"', lm: 3 }],
      2: [{ dt: 20, k: 'hide', d: 'dialog "Edit"', lm: 3, sa: 1 }],
    });
    const [row] = rowsFor(compileSpan(e, 'syn'), 'hideRequired');
    expect(row.fact).toMatch(/closed what click #open opened: required/);
  });

  it('a fill replaced before any request carried it is dead; one a request carried is live', () => {
    const e = annotate(base([step('fill', '#name', { value: 'wrong' }), step('fill', '#name', { value: 'right' }), step('click', '#save')]), {
      1: [{ dt: 20, k: 'val', f: 'textbox "Name"', len: 5 }],
      2: [{ dt: 20, k: 'val', f: 'textbox "Name"', len: 5 }],
      3: [{ dt: 20, dt1: 80, k: 'req', m: 'POST', e: 'http://app/api/save', s: 200, carries: [2] }],
    });
    const rows = rowsFor(compileSpan(e, 'syn'), 'supersededSet');
    expect(rows.find((r) => r.seq === 1)!.fact).toMatch(/replaced by fill #name before any request carried it/);
  });
});

describe('shadow: tabs, link clicks and toggle pairs (synthetic, stage 3)', () => {
  const chain = (sel: string, role?: { role: string; name: string }) => ({
    target: { expr: `page.locator('${sel}')`, verified: true, raw: sel, chain: [...(role ? [{ kind: 'role' as const, ...role }] : []), { kind: 'css' as const, selector: sel }] },
  });
  const step = (tool: string, sel: string, extra: Partial<RecordedStep> = {}, role?: { role: string; name: string }): RecordedStep => ({
    k: 'step',
    tool,
    args: { target: sel },
    locators: chain(sel, role),
    diff: { url: 'http://app/p', alerts: [], added: [], removed: [], dialect: 2 },
    ...extra,
  });
  const base = (steps: RecordedStep[]): RecordedEntry[] => [{ k: 'instruction', text: 'do it', url: 'http://app/p' }, ...steps, { k: 'report', status: 'success', summary: 'done', values: {} }];

  it('a late tab is credited by the journal to the click before it (ghost fwgh6); the recording credited none', () => {
    const e = annotate(base([step('click', '.card'), step('read', 'h1', { page: 1 }), step('click', 'a.back', { page: 1 })]), {
      1: [{ dt: 1_400, k: 'page+', pg: 1, op: 0, url: 'http://app/post' }],
    });
    const rows = rowsFor(compileSpan(e, 'syn'), 'popupCredit');
    expect(rows[0].fact).toMatch(/^click \.card opened the tab http:\/\/app\/post \(late:1:page\)/);
    // creditUncreditedPopups credits the same click here: agreement.
    expect(rows[0].heuristic).toBe('credited with a popup');
    expect(rows[0].agree).toBe(true);
  });

  it('a link click that navigated late is kept; one that was inert is dropped', () => {
    const link = { role: 'link', name: 'Bench Project' };
    const went = annotate(base([step('click', 'a.proj', {}, link), step('read', 'h1'), step('goto', '', { args: { url: 'http://app/proj' } })]), {
      // A Turbo visit: the click asked for the page in its window, and the url moved when the answer landed (openproject fwop2).
      1: [{ dt: 50, dt1: 850, k: 'req', m: 'GET', e: 'http://app/proj', rt: 'fetch', s: 200 }, { dt: 900, k: 'nav', url: 'http://app/proj' }],
    });
    const [row] = rowsFor(compileSpan(went, 'syn'), 'linkClick');
    expect(row.fact).toMatch(/^it navigated/);
    const inert = annotate(base([step('click', 'a.proj', {}, link), step('read', 'h1'), step('goto', '', { args: { url: 'http://app/proj' } })]), {
      1: [{ dt: 5, k: 'hit', ty: 'pd', d: 'link "Bench Project"', on: 1, tr: 1 }],
    });
    const [row2] = rowsFor(compileSpan(inert, 'syn'), 'linkClick');
    expect(row2.fact).toMatch(/^inert/);
    expect(row2.agree).toBe(row2.heuristic === 'dropped as an abandoned link click');
  });

  it('a collapse undone by the same control is a toggle pair (grafana fwgr69)', () => {
    const heading = { role: 'button', name: 'Panel options' };
    const e = annotate(base([step('click', 'h6.panel', {}, heading), step('click', 'h6.panel', {}, heading)]), {
      1: [{ dt: 20, k: 'state', d: 'button "Panel options"', a: 'aria-expanded', on: false }],
      2: [{ dt: 20, k: 'state', d: 'button "Panel options"', a: 'aria-expanded', on: true }],
    });
    const [row] = rowsFor(compileSpan(e, 'syn'), 'togglePair');
    expect(row.fact).toMatch(/aria-expanded false then true\): a toggle pair/);
  });
});

describe('shadow2: the live journal of gitea fwgt13-n1 02-create (round 62)', () => {
  // The published recording with the journal the recorder actually wrote. Its
  // replays and compiled script picked labels [bug, enhancement], assignee
  // admin and milestone Backlog, and reported success.
  const e = load('fwgt13-n1-02-create.jsonl');

  it('keyPick: every Enter is named from the journal, and since round 62 (fix/round62-gt) the procedure picks each by name', () => {
    const rows = rowsFor(show('fwgt13 02-create keyPick', compileSpan(e, 'fwgt13-n1')), 'keyPick');
    expect(rows.map((r) => [r.seq, r.fact])).toEqual([
      [36, 'Enter unpicked "bug"'],
      [49, 'Enter picked "enhancement"'],
      [55, 'Enter unpicked "enhancement"'],
      [59, 'Enter picked "bug"'],
      [65, 'Enter picked "priority-high"'],
      [77, 'Enter picked "Bench Milestone"'],
      [85, 'Enter picked "bench-assignee (Bench Assignee)"'],
    ]);
    // Round 62's namedKeyPicks compiles each named key pick to a click on the option by name, so the
    // heuristic now agrees with the journal: the fwgt13 disagreements that exposed the folded presses are closed.
    expect(rows.map((r) => [r.heuristic, r.agree])).toEqual(rows.map(() => [rows[0].heuristic, true]));
    expect(rows[0].heuristic).not.toBe('the procedure picks it by position');
  });

  it('pickerNetState: one row per picker, committed with the form, ticks by key flagged', () => {
    const rows = rowsFor(compileSpan(e, 'fwgt13-n1'), 'pickerNetState');
    expect(rows.map((r) => r.fact)).toEqual([
      'net selected: [bug, priority-high]; commits: {bug, priority-high} with the form (#294); 5 tick(s) made by a key press (positional in the procedure)',
      'net selected: [Bench Milestone]; commits: {Bench Milestone} with the form (#294); 1 tick(s) made by a key press (positional in the procedure)',
      'net selected: [bench-assignee (Bench Assignee)]; commits: {bench-assignee (Bench Assignee)} with the form (#294); 1 tick(s) made by a key press (positional in the procedure)',
    ]);
  });

  it('linkClick: an option link that ticked its option is not inert (fix 4)', () => {
    const rows = rowsFor(compileSpan(e, 'fwgt13-n1'), 'linkClick');
    expect(rows.find((r) => r.seq === 27)).toMatchObject({ fact: 'it did not navigate, but changed the page (state)', heuristic: 'kept', agree: true });
  });
});

describe('shadow2 fixes 1-3 (synthetic)', () => {
  const chain = (sel: string) => ({ target: { expr: `page.locator('${sel}')`, verified: true, raw: sel, chain: [{ kind: 'css' as const, selector: sel }] } });
  const step = (tool: string, sel: string, extra: Partial<RecordedStep> = {}): RecordedStep => ({
    k: 'step',
    tool,
    args: { target: sel },
    locators: chain(sel),
    diff: { url: 'http://app/p', alerts: [], added: [], removed: [], dialect: 2 },
    ...extra,
  });
  const base = (steps: RecordedStep[]): RecordedEntry[] => [{ k: 'instruction', text: 'do it', url: 'http://app/p' }, ...steps, { k: 'report', status: 'success', summary: 'done', values: {} }];

  it('fix 1: a click that added lines is not a hide, whatever it hid (grafana fwgr74 #41)', () => {
    const e = annotate(base([step('click', '#open'), step('click', '#viz', { diff: { url: 'http://app/p', alerts: [], added: ['- button "Stat"'], dialect: 2 } })]), {
      1: [{ dt: 30, k: 'show', d: 'dialog "Picker"', lm: 3 }],
      2: [{ dt: 20, k: 'hide', d: 'dialog "Picker"', lm: 3 }],
    });
    expect(rowsFor(compileSpan(e, 'syn'), 'hideRequired')).toEqual([]);
  });

  it('fix 1: a dialog a navigation showed has no opener (openproject fwop16 #7: the welcome dialog after sign-in)', () => {
    const e = annotate(base([step('click', '#login'), step('click', '#close')]), {
      1: [{ dt: 10, k: 'nav', url: 'http://app/home' }, { dt: 300, k: 'show', d: 'dialog "Welcome"', lm: 4 }],
      2: [{ dt: 20, k: 'hide', d: 'dialog "Welcome"', lm: 4 }],
    });
    expect(rowsFor(compileSpan(e, 'syn'), 'hideRequired')).toEqual([]);
  });

  it('fix 1: the latest show of the landmark is the opening that counts (gitea fwgt13 #39)', () => {
    const e = annotate(base([step('fill', '#name', { args: { target: '#name', value: 'x' } }), step('click', '#opener'), step('click', '#toggle')]), {
      1: [{ dt: 30, k: 'show', d: 'listbox "Labels"', lm: 5 }, { dt: 40, k: 'hide', d: 'listbox "Labels"', lm: 5 }],
      2: [{ dt: 30, k: 'show', d: 'listbox "Labels"', lm: 5 }],
      3: [{ dt: 20, k: 'hide', d: 'listbox "Labels"', lm: 5 }],
    });
    const [row] = rowsFor(compileSpan(e, 'syn'), 'hideRequired');
    expect(row.fact).toMatch(/closed what click #opener opened: required/);
  });

  it('fix 3: a flash the step caused is its own, even with an earlier one of unknown cause in the span (vikunja fwvk13 #31)', () => {
    const e = annotate(base([step('click', '#edit'), step('click', '#save', { diff: { url: 'http://app/p', alerts: [], added: ['- heading "Description Saved!"'], dialect: 2 } })]), {
      2: [
        { dt: -2_000, k: 'txt', d: 'heading', x: 'Description Saved!' },
        { dt: 30, dt1: 90, k: 'req', m: 'POST', e: 'http://app/api/tasks/4', s: 200 },
        { dt: 120, k: 'txt', d: 'heading', x: 'Description Saved!' },
      ],
    });
    const [row] = rowsFor(compileSpan(e, 'syn'), 'flashCause');
    expect(row.fact).toMatch(/was this step's own change/);
  });

  it('fix 2: a write just after a click saves the edit before it, not the app (vikunja fwvk13 #59/#64)', () => {
    const e = annotate(base([step('select', '#month', { args: { target: '#month', option: 'December' } }), step('click', '#confirm'), step('goto', '', { args: { url: 'http://app/tasks/4' } })]), {
      1: [{ dt: 20, k: 'val', f: 'combobox "Month"', len: 2 }],
      2: [{ dt: 539, dt1: 560, k: 'req', m: 'POST', e: 'http://app/api/v1/tasks/4', s: 200 }],
    });
    const [row] = rowsFor(compileSpan(e, 'syn'), 'abandonedEdit');
    expect(row.fact).toMatch(/^saved \(a write request followed\)/);
  });
});

describe('shadow2: an unnamed field is one field only at the same target (snipe-it fwsi13 #51/#55)', () => {
  const chain = (sel: string) => ({ target: { expr: `page.locator('${sel}')`, verified: true, raw: sel, chain: [{ kind: 'css' as const, selector: sel }] } });
  const type = (sel: string, text: string): RecordedStep => ({ k: 'step', tool: 'type', args: { target: sel, text }, locators: chain(sel), diff: { url: 'http://app/p', alerts: [], added: [], dialect: 2 } });
  it('a model typed into one select2 search box and a location into another are not a superseded set', () => {
    const e = annotate([{ k: 'instruction', text: 'create the asset', url: 'http://app/p' }, type('#model', 'Bench Laptop Model'), type('#location', 'Bench Office'), { k: 'report', status: 'success', summary: 'done', values: {} }], {
      1: [{ dt: 20, k: 'val', f: 'searchbox ""', len: 12 }],
      2: [{ dt: 20, k: 'val', f: 'searchbox ""', len: 6 }],
    });
    expect(rowsFor(compileSpan(e, 'syn'), 'supersededSet')).toEqual([]);
  });
});
