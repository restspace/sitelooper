/**
 * Round 62 — snipeit fwsi13 (results/fwsi13-s5ox5m) 03-create, Q2: a field the
 * app pre-filled, cleared, and restored after a failed save.
 *
 * n1 #47 filled Asset Tag with "" — the app had pre-filled it with the next
 * tag, BA-00004 (#47's obs removed `textbox "Asset Tag": BA-00004`). #59 Save
 * failed ("This field is required"; no write request; the browser's
 * validation put the focus back in Asset Tag), #61-#73 fiddled with the field
 * and a "new!" row (#65 added, #66 deleted it), #74 filled "BA-00004" back and
 * #76 saved: a POST carrying #74's value, answered 302. Compiled whole,
 * s_40b664 cleared the tag at step 4, and n2's recovery, taking the empty tag
 * as meant, spent 73 turns on "This field is required".
 *
 * Dropped ONLY on the in-page journal's proof: (a) the value the clear
 * replaced (its val event's `was` hash) is the value the restoring fill left
 * (its `h`); (b) every failed submit between made no write, or one answered
 * 4xx; (c) a later submit's write carried the restored value and succeeded.
 * The published n1 journal predates `was`, so as published it compiles as
 * today; the tests give #47 the `was` a recording now carries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { valueHash } from '../src/daemon/journal-attribute.js';
import type { JournalEvent } from '../src/daemon/journal-attribute.js';
import { compileSkills } from '../src/skills/compile.js';
import { dropRestoredDetours } from '../src/skills/restored-field.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwsi13-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;

function create03(): RecordedEntry[] {
  const e = load();
  const start = e.findIndex((x) => x.k === 'instruction' && x.text.startsWith('Create a new asset'));
  const end = e.findIndex((x, i) => i > start && x.k === 'report');
  return e.slice(start, end + 1);
}

const isStep = (x: RecordedEntry): x is RecordedStep => x.k === 'step';
const bySeq = (entries: RecordedEntry[], seq: number) => entries.filter(isStep).find((s) => s.seq === seq)!;
const valOf = (s: RecordedStep) => (s.journal!.ev ?? []).find((e) => e.k === 'val')!;

/** The n1 03-create with #47's val event carrying the hash the clear replaced (as the journal now records it). */
function withWas(was = valueHash('BA-00004')): RecordedEntry[] {
  const own = create03();
  valOf(bySeq(own, 47)).was = was;
  return own;
}

function compiled(own: RecordedEntry[]) {
  const report = own[own.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
  return compileSkills({
    entries: own.slice(0, -1),
    instruction: (own[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
    session: 'fwsi13-n1',
    knownValues: { 'var:runid': 'fwsi13-n1' },
  }).flatMap((s) => s.steps);
}

const seqsKept = (own: RecordedEntry[]) => new Set(dropRestoredDetours(own.filter(isStep)).map((s) => s.seq));
const DETOUR = [59, 61, 62, 63, 65, 66, 73, 74];

describe('a pre-filled field cleared and restored around a failed save is dropped on the journal\'s proof (fwsi13 #47-#76)', () => {
  it('drops the clear, the failed save, the fiddling and the restoring fill; keeps the save that succeeded and the rest of the form', () => {
    const kept = seqsKept(withWas());
    for (const seq of [47, ...DETOUR]) expect(kept.has(seq), `#${seq}`).toBe(false);
    for (const seq of [46, 48, 51, 52, 53, 54, 55, 56, 76]) expect(kept.has(seq), `#${seq}`).toBe(true);
    // reads may publish values: kept
    expect(kept.has(64)).toBe(true);
    expect(kept.has(71)).toBe(true);
  });

  it('the compiled procedure neither clears the tag nor fills the literal BA-00004, and saves once', () => {
    const steps = compiled(withWas());
    const text = JSON.stringify(steps.map((s) => s.args));
    expect(text).not.toContain('BA-00004');
    expect(steps.some((s) => s.tool === 'fill' && s.args.value === '')).toBe(false);
    expect(steps.filter((s) => s.tool === 'click' && /Save|submit/.test(JSON.stringify(s.locators.target))).length).toBe(1);
    expect(steps.some((s) => s.tool === 'press' && s.args.target === '@e144')).toBe(false);
  });

  it('without the journal proof (the store as published, no `was`), the procedure is as today', () => {
    const own = create03();
    expect(seqsKept(own).size).toBe(own.filter(isStep).length);
    const steps = compiled(own);
    expect(steps.some((s) => s.tool === 'fill' && s.args.value === '')).toBe(true);
    expect(JSON.stringify(steps.map((s) => s.args))).toContain('BA-00004');
  });

  it('(a) control: the restored value is not the value the clear replaced', () => {
    const own = withWas(valueHash('BA-00003'));
    expect(seqsKept(own).size).toBe(own.filter(isStep).length);
  });

  it('(b) control: the failed save sent a write that was not a validation answer', () => {
    for (const s of [200, 302]) {
      const own = withWas();
      const save = bySeq(own, 59);
      const req: JournalEvent = { t: save.journal!.ev![0].t + 5, k: 'req', m: 'POST', e: 'http://127.0.0.1:8098/hardware', rt: 'document', s, c: ['in', save.journal!.w, 'gesture'] };
      save.journal!.ev!.push(req);
      expect(seqsKept(own).size, `answered ${s}`).toBe(own.filter(isStep).length);
    }
    // answered as a validation failure: still dropped
    const own = withWas();
    const save = bySeq(own, 59);
    save.journal!.ev!.push({ t: save.journal!.ev![0].t + 5, k: 'req', m: 'POST', e: 'http://127.0.0.1:8098/hardware', rt: 'fetch', s: 422, c: ['in', save.journal!.w, 'gesture'] });
    expect(seqsKept(own).has(47)).toBe(false);
  });

  it('(c) control: no later save succeeded with the restored value', () => {
    const failed = withWas();
    const post = bySeq(failed, 76).journal!.ev!.find((e) => e.k === 'req' && e.m === 'POST')!;
    post.s = 422;
    expect(seqsKept(failed).size).toBe(failed.filter(isStep).length);

    const uncarried = withWas();
    const post2 = bySeq(uncarried, 76).journal!.ev!.find((e) => e.k === 'req' && e.m === 'POST')!;
    post2.carries = (post2.carries as number[]).filter((w) => w !== bySeq(uncarried, 74).journal!.w);
    expect(seqsKept(uncarried).size).toBe(uncarried.filter(isStep).length);
  });

  it('control: a detour that set another field, or left a change on the page, is kept', () => {
    const other = withWas();
    const fiddle = bySeq(other, 63);
    fiddle.journal!.ev = [{ t: 1790301823700, k: 'val', f: 'textbox "Serial"', len: 3, h: valueHash('abc'), c: ['in', fiddle.journal!.w, 'gesture'] }];
    expect(seqsKept(other).size).toBe(other.filter(isStep).length);

    const left = withWas();
    const del = bySeq(left, 66);
    del.diff = { ...del.diff!, removed: [] };
    expect(seqsKept(left).size).toBe(left.filter(isStep).length);
  });
});

describe('the journal records the value a change replaced (`was`), never a credential\'s', () => {
  it('scrubs a `was` hash that is a credential\'s, as it scrubs `h`', async () => {
    const { Journal } = await import('../src/daemon/journal.js');
    const saved = process.env.APP_PASSWORD;
    process.env.APP_PASSWORD = 'Hunter2-secret-77';
    try {
      const j = new Journal();
      const t = Date.now();
      j.pageDrain = async () => [
        { t, k: 'val', f: 'textbox "Pass"', len: 0, h: valueHash(''), was: valueHash('Hunter2-secret-77') },
        { t: t + 1, k: 'val', f: 'textbox "Tag"', len: 0, h: valueHash(''), was: valueHash('BA-00004') },
      ];
      const out = await j.collect({} as never);
      const pass = out.find((e) => e.f === 'textbox "Pass"')!;
      const tag = out.find((e) => e.f === 'textbox "Tag"')!;
      expect(pass).toBeTruthy();
      expect(pass.was).toBeUndefined();
      expect(tag.was).toBe(valueHash('BA-00004'));
    } finally {
      if (saved === undefined) delete process.env.APP_PASSWORD;
      else process.env.APP_PASSWORD = saved;
    }
  });
});
