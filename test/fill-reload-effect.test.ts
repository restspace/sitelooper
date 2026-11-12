/**
 * vikunja fwvk18-fc-n1 01-signin, n1 script entries 0-25 verbatim. The app
 * reloaded /login inside the password fill's diff window (its journal: a
 * `document` request for /login and a `{ k: 'nav', doc: 1 }` event, both in
 * the fill's gesture window), which wiped the username step 1 typed, so the
 * fill's only recorded page change was the username box gone empty. Both
 * replays — whose reload came after the check — stopped on that line under
 * whole-line matching, although the recorded re-fill and submit sign in.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, documentLoadedDuring } from '../src/skills/compile.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-fill-reload-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const text = fs.readFileSync(path.join(__dirname, 'fixture', 'fwvk18-fc-n1-01-signin.jsonl'), 'utf8');
const entries = (): RecordedEntry[] => parseScript(text).entries.filter((e) => !(e.k === 'step' && e.failed));
const bySeq = (es: RecordedEntry[], seq: number) => es.find((e): e is RecordedStep => e.k === 'step' && e.seq === seq)!;

const compile = (es: RecordedEntry[]) => {
  const report = es[es.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
  const instruction = (es[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
  return compileSkills({
    entries: es,
    instruction,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values } },
    session: 'fwvk18-fc',
    knownValues: { runid: 'fwvk18-fc-n1' },
  });
};
const fills = (es: RecordedEntry[]) => compile(es).flatMap((s) => s.steps).filter((s) => s.tool === 'fill');

describe('a fill whose own window loaded a document keeps none of the load\'s lines (fwvk18-fc)', () => {
  it('reads the document load from the fill\'s own journal, and only there', () => {
    const es = entries();
    expect(documentLoadedDuring(bySeq(es, 3))).toBe(true);
    // The other fills (and the goto, which is no value entry) are not reloads.
    for (const seq of [1, 2, 7, 8]) expect(documentLoadedDuring(bySeq(es, seq))).toBe(false);
  });

  it('compiles the password fill with no added lines; the clean fills keep theirs', () => {
    const fs4 = fills(entries());
    expect(fs4.length).toBe(4);
    expect(fs4[1].expect?.addedContains).toBeUndefined();
    expect(JSON.stringify(fs4[1].expect ?? {})).not.toContain('e.g. frederick');
    // The fill's own line of its typed value stays where there was no reload.
    expect(fs4[0].expect?.addedContains?.[0]).toMatch(/^- textbox "e\.g\. frederick": \{\{v\d+\}\}$/);
    expect(fs4[3].expect?.addedContains?.[0]).toMatch(/: \{\{v\d+\}\}$/);
  });

  it('keeps the line that shows the typed value in the filled control, drops the rest', () => {
    const es = entries();
    const pw = bySeq(es, 3);
    pw.diff!.added = ['- textbox "e.g. frederick"', '- textbox "e.g. •••••••••••": {{env:APP_PASSWORD}}'];
    const added = fills(es)[1].expect?.addedContains ?? [];
    expect(added.length).toBe(1);
    expect(added[0]).toMatch(/^- textbox "e\.g\. •+": /);
  });

  it('without the load event the recorded line is kept as before', () => {
    const es = entries();
    const pw = bySeq(es, 3);
    pw.journal!.ev = pw.journal!.ev!.filter((e) => !(e.k === 'nav' && e.doc === 1));
    expect(documentLoadedDuring(pw)).toBe(false);
    expect(fills(es)[1].expect?.addedContains).toEqual(['- textbox "e.g. frederick"']);
  });

  it('a load another window caused, or one after the capture, is not this fill\'s', () => {
    const es = entries();
    const pw = bySeq(es, 3);
    const load = pw.journal!.ev!.find((e) => e.k === 'nav' && e.doc === 1)!;
    load.c = ['in', pw.journal!.w - 1, 'gesture'];
    expect(documentLoadedDuring(pw)).toBe(false);
    load.c = ['in', pw.journal!.w, 'gesture'];
    load.t = pw.obs!.at.c! + 1;
    expect(documentLoadedDuring(pw)).toBe(false);
  });

  it('a press or a click is never asked, nor a type whose text carries a line break', () => {
    const es = entries();
    const pw = bySeq(es, 3);
    expect(documentLoadedDuring({ ...pw, tool: 'press', args: { key: 'Enter', target: '@e38' } })).toBe(false);
    expect(documentLoadedDuring({ ...pw, tool: 'click', args: { target: '@e38' } })).toBe(false);
    expect(documentLoadedDuring({ ...pw, tool: 'type', args: { target: '@e38', text: 'x\n' } })).toBe(false);
    expect(documentLoadedDuring({ ...pw, tool: 'type', args: { target: '@e38', text: 'x' } })).toBe(true);
  });
});
