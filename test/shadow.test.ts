import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import type { JournalEvent } from '../src/daemon/journal-attribute.js';
import { compileSkills } from '../src/skills/compile.js';
import { shadowVerdicts, type ShadowRow } from '../src/skills/shadow.js';

/**
 * The shadow report over round 61's recordings, ANNOTATED: each fixture is the
 * published n1 instruction, verbatim, plus the journal events the recorder
 * would have filed (COUNTERFACTUAL — inferred from the recording's own diffs,
 * reads, evals, stage-0 timings and the replays' stops; see each case). The
 * shadow compares the fact each rule derives with what compile actually did.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (file: string): RecordedEntry[] =>
  fs
    .readFileSync(path.join(here, 'fixture', file), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

/**
 * Give every step a journal window (its seq) and the listed events. Each event
 * is placed `dt` ms after its step's recorded dispatch (stage-0 obs.at.d).
 */
function annotate(entries: RecordedEntry[], events: Record<number, { own?: (Omit<JournalEvent, 't'> & { dt: number })[]; gap?: (Omit<JournalEvent, 't'> & { dt: number })[] }>): RecordedEntry[] {
  return entries.map((e) => {
    if (e.k !== 'step' || e.seq === undefined) return e;
    const at = e.obs?.at.d ?? 0;
    const place = (list?: (Omit<JournalEvent, 't'> & { dt: number })[]) => list?.map(({ dt, ...rest }) => ({ t: at + dt, ...rest }) as JournalEvent);
    const spec = events[e.seq] ?? {};
    const own = place(spec.own);
    const gap = place(spec.gap);
    return { ...e, journal: { w: e.seq, ...(own ? { ev: own } : {}), ...(gap ? { gap: { ev: gap } } : {}) } } as RecordedStep;
  });
}

function compileOwn(entries: RecordedEntry[], session: string) {
  const head = entries[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = [...entries].reverse().find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
  const own = entries.slice(0, entries.indexOf(report));
  return {
    own,
    skills: compileSkills({
      entries: own,
      instruction: head.text,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
      session,
      knownValues: { 'var:runid': session },
    }),
  };
}

const rowsFor = (rows: ShadowRow[], rule: string) => rows.filter((r) => r.rule === rule);

describe('shadow: no journal, no rows', () => {
  it('an old store (no journal on any step) produces nothing', () => {
    const { own, skills } = compileOwn(load('fwgr73-n1-04-open.jsonl'), 'fwgr73-n1');
    expect(shadowVerdicts(own, skills)).toEqual([]);
  });
});

describe('shadow (b): an edit abandoned before a navigation (grafana fwgr73 04-open)', () => {
  // fwgr73-n1 04-open. #110's Save sent the dashboard (POST /api/dashboards/db,
  // carrying #105's tag "bench"; the recording shows `status "Dashboard saved"`).
  // #125 typed `"tags"` into the JSON model editor, which REPLACED the whole
  // model (#127 reads `"tags""tags""`), and #128's goto left without any save:
  // no request between them. Both replays and the artifact stopped at that
  // type ("the field holds the value it was given twice over"). Counterfactual:
  // the POST at #110 (high confidence: the drawer's Save is what persisted the
  // tag, #133-#141 read it back) and no request at all from #124 to #128.
  const annotated = annotate(load('fwgr73-n1-04-open.jsonl'), {
    110: { own: [{ dt: 150, k: 'req', m: 'POST', e: 'http://127.0.0.1:3000/api/dashboards/db', s: 200, carries: [105], c: ['in', 110, 'gesture'] }] },
    125: { own: [{ dt: 40, k: 'val', f: 'textbox "Editor content"', len: 14, c: ['in', 125, 'gesture'] }] },
  });

  it('says #125 was abandoned, and that compile kept it', () => {
    const { own, skills } = compileOwn(annotated, 'fwgr73-n1');
    const rows = rowsFor(shadowVerdicts(own, skills), 'abandonedEdit');
    const at = (seq: number) => rows.find((r) => r.seq === seq)!;
    expect(at(125).fact).toMatch(/^abandoned/);
    expect(at(125).heuristic).toBe('kept in the procedure');
    expect(at(125).agree).toBe(false);
    // The tag the Save carried was not abandoned, and compile kept it: agreement.
    expect(at(105).fact).toMatch(/^saved \(a request carried its value\)/);
    expect(at(105).agree).toBe(true);
    // The checkbox ticked before the same Save: saved by the write that followed.
    expect(at(109).fact).toMatch(/^saved/);
  });

  it('a request carrying the edit, before the goto, makes it saved', () => {
    const saved = annotate(load('fwgr73-n1-04-open.jsonl'), {
      125: { own: [{ dt: 400, k: 'req', m: 'POST', e: 'http://127.0.0.1:3000/api/dashboards/db', s: 200, carries: [125], c: ['in', 125, 'gesture'] }] },
    });
    const { own, skills } = compileOwn(saved, 'fwgr73-n1');
    const row = rowsFor(shadowVerdicts(own, skills), 'abandonedEdit').find((r) => r.seq === 125)!;
    expect(row.fact).toMatch(/^saved/);
    expect(row.agree).toBe(true);
  });
});
