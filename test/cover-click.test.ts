/**
 * openproject fwop37-fc-n1 02-find, n1 script entries 22-49 verbatim. A
 * first-login tour overlay covered the page: clicks #23, #24 and #25 went out
 * by the forced tier (`obs.settle.via: 'forced'`), each journal hit landed on
 * the overlay (`on: 0`, `cover: 'div ""'`), and each left an empty diff; #26
 * ("Skip", hit on target) dismissed the tour. Compiled whole, the three
 * clicks acted on n2, which had no tour, and s_a8f156 stopped at step 5.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, coverOnlyClick, dropCoverOnlyClicks } from '../src/skills/compile.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cover-click-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const text = fs.readFileSync(path.join(__dirname, 'fixture', 'fwop37-fc-n1-02-find.jsonl'), 'utf8');
const entries = (): RecordedEntry[] => parseScript(text).entries.filter((e) => !(e.k === 'step' && e.failed));
const steps = (): RecordedStep[] => entries().filter((e): e is RecordedStep => e.k === 'step');
const bySeq = (list: RecordedStep[], seq: number) => list.find((s) => s.seq === seq)!;
const seqs = (list: readonly RecordedStep[]) => list.map((s) => s.seq);
const ACCOUNT = 'http://127.0.0.1:8090/my/account';

describe('clicks forced onto a cover that changed nothing are not the procedure (fwop37-fc 02-find)', () => {
  it('drops #23-#25 and keeps the Skip click and every empty-diff click that hit its target', () => {
    const all = steps();
    const notes: { name: string; at: number; reason: string }[] = [];
    const kept = seqs(dropCoverOnlyClicks(all, notes));
    for (const s of [23, 24, 25]) expect(kept).not.toContain(s);
    // #26 Skip (actionable, on target), #37 and #41 (empty diffs, actionable) stay.
    for (const s of [26, 29, 37, 41]) expect(kept).toContain(s);
    expect(notes.map((n) => n.name)).toEqual(['dropCoverOnlyClicks', 'dropCoverOnlyClicks', 'dropCoverOnlyClicks']);
  });

  it('compiles without the covered clicks, and says so in provenance', () => {
    const es = entries();
    const report = es[es.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
    const instruction = (es[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
    const skills = compileSkills({
      entries: es,
      instruction,
      report: { status: 'success', summary: report.summary, evidence: { values: report.values } },
      session: 'fwop37-fc',
      knownValues: { runid: 'fwop37-fc-n1' },
    });
    const all = skills.flatMap((s) => s.steps);
    const targets = all.filter((s) => s.tool === 'click').map((s) => JSON.stringify(s.locators));
    expect(targets.some((t) => t.includes('Global modules'))).toBe(false);
    expect(targets.some((t) => t.includes('Skip'))).toBe(true);
    expect(skills.some((s) => s.provenance?.transforms?.some((t) => t.name === 'dropCoverOnlyClicks'))).toBe(true);
  });
});

describe('a forced click stays when the evidence does not hold', () => {
  const clone = (): RecordedStep[] => JSON.parse(JSON.stringify(steps()));

  it('a forced click whose hit reached its target', () => {
    const s = bySeq(clone(), 23);
    for (const e of s.journal!.ev!) if (e.k === 'hit') { e.on = 1; delete e.cover; }
    expect(coverOnlyClick(s, ACCOUNT)).toBe(false);
  });

  it('a forced click with no hit recorded (the target was not marked)', () => {
    const s = bySeq(clone(), 23);
    for (const e of s.journal!.ev!) if (e.k === 'hit') delete e.on;
    expect(coverOnlyClick(s, ACCOUNT)).toBe(false);
    s.journal!.ev = [];
    expect(coverOnlyClick(s, ACCOUNT)).toBe(false);
  });

  it('a covered click that was not forced, changed the page, the url or sent a request', () => {
    const base = () => bySeq(clone(), 23);
    expect(coverOnlyClick(base(), ACCOUNT)).toBe(true);
    const actionable = base();
    actionable.obs!.settle!.via = 'actionable';
    expect(coverOnlyClick(actionable, ACCOUNT)).toBe(false);
    const added = base();
    added.diff!.added = ['- dialog "Projects"'];
    expect(coverOnlyClick(added, ACCOUNT)).toBe(false);
    expect(coverOnlyClick(base(), 'http://127.0.0.1:8090/')).toBe(false);
    const req = base();
    req.journal!.ev!.push({ t: req.journal!.ev![0].t + 5, k: 'req', m: 'GET', e: 'http://127.0.0.1:8090/api/v3/x', rt: 'xhr', s: 200, c: ['in', req.journal!.w, 'gesture'] });
    expect(coverOnlyClick(req, ACCOUNT)).toBe(false);
  });

  it('a covered click that is part of a fix-up or carries a label', () => {
    const guarded = bySeq(clone(), 23);
    guarded.guarded = 'f1';
    expect(coverOnlyClick(guarded, ACCOUNT)).toBe(false);
    const labelled = bySeq(clone(), 23);
    labelled.label = 'x';
    expect(coverOnlyClick(labelled, ACCOUNT)).toBe(false);
  });
});
