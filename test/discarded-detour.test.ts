/**
 * gitea fwgt37-dg-n1 05-change (the orchestrator's retry of "assign
 * bench-assignee"), n1 script entries 98-134 verbatim. The sidebar Assignees
 * picker ticks an option in the page and saves only when it closes. The model
 * ticked the option by click (#113), reloaded the issue (#116), ticked it again
 * by keyboard (#118-#121), went to the issue list (#122) — neither tick ever
 * reached the server — and assigned through the list's bulk action (#126, a
 * POST). Compiled whole, s_db788c replayed both picker rounds, and the second
 * round's named pick stopped n2 and n3 (30 and 21 recovery turns).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { discardedDetours, dropDiscardedDetours } from '../src/skills/discarded-detour.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-discarded-detour-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const text = fs.readFileSync(path.join(__dirname, 'fixture', 'fwgt37-dg-n1-05-change.jsonl'), 'utf8');
const entries = (): RecordedEntry[] => parseScript(text).entries.filter((e) => !(e.k === 'step' && e.failed));
const steps = (): RecordedStep[] => entries().filter((e): e is RecordedStep => e.k === 'step');
const seqs = (list: readonly RecordedStep[]) => list.map((s) => s.seq);
const bySeq = (list: RecordedStep[], seq: number) => list.find((s) => s.seq === seq)!;
const PICKER = '.issue-sidebar-combo';

describe('gestures a page load threw away are not the procedure (fwgt37-dg 05-change)', () => {
  it('drops both picker rounds and keeps the reads, the loads and the bulk route', () => {
    const all = steps();
    const kept = dropDiscardedDetours(all);
    const gone = new Set(seqs(all).filter((s) => !seqs(kept).includes(s)));
    // The gestures of the two rounds (evals and screenshots go as well; compile drops them anyway).
    for (const s of [111, 113, 118, 119, 120, 121]) expect(gone.has(s)).toBe(true);
    // Reads stay (they publish), so do the loads and everything after the last one.
    for (const s of [99, 100, 102, 114, 116, 122, 123, 124, 126, 127]) expect(gone.has(s)).toBe(false);
    expect(kept.filter((s) => s.tool === 'read' || s.tool === 'read_all').length).toBe(all.filter((s) => s.tool === 'read' || s.tool === 'read_all').length);
    const detours = discardedDetours(all);
    expect(detours.map((d) => all[d.load].seq)).toEqual([116, 122]);
  });

  it('compiles the procedure without the sidebar picker', () => {
    const es = entries();
    const report = es[es.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    const instruction = (es[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
    const skills = compileSkills({
      entries: es,
      instruction,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values } },
      session: 'fwgt37-dg',
      knownValues: { runid: 'fwgt37-dg-n1', issue_title: 'fwgt37-dg-n1 Bench Issue', repository_owner: 'bench' },
    });
    const all = skills.flatMap((s) => s.steps);
    expect(JSON.stringify(all)).not.toContain(PICKER);
    expect(all.some((s) => s.tool === 'press')).toBe(false);
    // The first segment only walks to the list: issue, its url, the list.
    expect(skills[0].steps.map((s) => s.tool)).toEqual(['read', 'read', 'goto', 'read', 'goto']);
    expect(String(skills[0].steps.at(-1)!.args.url)).toMatch(/\/bench-repo\/issues$/);
    // The bulk route is the second: tick the issue, open Assignee, pick.
    expect(skills[1].steps.filter((s) => s.tool === 'click').length).toBe(3);
    expect(skills[0].provenance?.transforms?.some((t) => t.name === 'dropDiscardedDetours')).toBe(true);
  });
});

describe('a stretch before a page load stays when the evidence does not hold', () => {
  const clone = (): RecordedStep[] => JSON.parse(JSON.stringify(steps()));
  const kept = (all: RecordedStep[]) => seqs(dropDiscardedDetours(all));

  it('an option click whose window sent a request', () => {
    const all = clone();
    const click = bySeq(all, 113);
    click.journal!.ev.push({ t: 1793123651790, k: 'req', m: 'POST', e: 'http://127.0.0.1:8095/bench/bench-repo/issues/assignee', rt: 'fetch', s: 200, c: ['in', click.journal!.w, 'gesture'] });
    expect(kept(all)).toEqual(expect.arrayContaining([111, 113]));
    // The second round is judged on its own.
    expect(kept(all)).not.toContain(118);
  });

  it('a goto that loaded no document (an in-app hash move keeps the page)', () => {
    const all = clone();
    const load = bySeq(all, 116);
    load.journal!.ev = load.journal!.ev.filter((e) => !(e.k === 'req' && e.rt === 'document'));
    expect(kept(all)).toEqual(expect.arrayContaining([111, 113]));
  });

  it('a gesture with no journal', () => {
    const all = clone();
    delete bySeq(all, 111).journal;
    expect(kept(all)).toEqual(expect.arrayContaining([111, 113]));
  });

  it('no later write: the instruction may have been the client-side state itself', () => {
    const all = clone();
    const bulk = bySeq(all, 126);
    bulk.journal!.ev = bulk.journal!.ev.filter((e) => !(e.k === 'req' && e.m === 'POST'));
    expect(kept(all)).toEqual(seqs(all));
  });

  it('a stretch that moved the url', () => {
    const all = clone();
    bySeq(all, 113).diff!.url = 'http://127.0.0.1:8095/bench/bench-repo/issues?assignee=3';
    expect(kept(all)).toEqual(expect.arrayContaining([111, 113]));
  });

  it('a recording without a journal compiles as before', () => {
    const all = clone();
    for (const s of all) delete s.journal;
    expect(kept(all)).toEqual(seqs(all));
  });
});
