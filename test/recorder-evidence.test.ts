import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScriptRecorder, isFailedStep, parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { diffTotals, settleEvidence, stepFailure } from '../src/daemon/step-evidence.js';
import { actionFailure } from '../src/execution/browser.js';

/**
 * Stage 0 of the recorder-evidence design: persist what the recorder already
 * knew and threw away — a running seq and write time on every entry, the
 * action's timing, settle verdict, capture failure and uncapped diff on a
 * step, and a FAILED action as a `failed: true` step. Nothing downstream may
 * change: a failed step is on disk only, never a gesture any consumer sees.
 */

const root = path.resolve(__dirname, '..');
let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-evidence-'));
  process.env.SITELOOPER_HOME = home;
});

afterEach(() => {
  delete process.env.SITELOOPER_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

const click = (target: string): RecordedStep => ({ k: 'step', tool: 'click', args: { target }, locators: {} });
const read = (target: string): RecordedStep => ({ k: 'step', tool: 'read', args: { target }, locators: {} });
const onDisk = (session: string): RecordedEntry[] =>
  fs
    .readFileSync(path.join(home, 'sessions', session, 'script.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);
const failure = { outcome: 'not-dispatched' as const, reason: 'never-attached', message: 'click NOT dispatched' };

describe('stage 0: every entry is numbered and time-stamped', () => {
  it('stamps seq and t on instructions, steps and reports, and a later take continues the count', () => {
    const rec = new ScriptRecorder('seq');
    rec.beginInstruction('do it');
    rec.commit(click('#a'), 'clicked');
    rec.endInstruction({ status: 'success', summary: 'done', values: {} });
    expect(rec.entries.map((e) => e.seq)).toEqual([0, 1, 2]);
    for (const e of rec.entries) expect(typeof e.t).toBe('number');

    const again = new ScriptRecorder('seq');
    again.beginInstruction('next');
    expect(again.entries.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it('commits the step evidence it is given, verbatim', () => {
    const rec = new ScriptRecorder('obs');
    const obs = { at: { d: 1, s: 2, c: 3 }, totals: { added: 31, removed: 4 }, removed: ['- button "Old"'], captureFailed: true as const };
    rec.commit(click('#a'), 'clicked', { obs });
    expect((rec.entries[0] as RecordedStep).obs).toEqual(obs);
    expect((onDisk('obs')[0] as RecordedStep).obs).toEqual(obs);
  });
});

describe('stage 0: a failed action is evidence, never a gesture', () => {
  it('is written to script.jsonl and kept out of every read of the take', () => {
    const rec = new ScriptRecorder('fail');
    rec.beginInstruction('pick the label');
    const mark = rec.mark();
    rec.commit(read('#x'), '"seen"');
    rec.fail(click('#missing'), failure, { at: { d: 5 } });
    rec.commit(click('#a'), 'clicked');

    // On disk, in the order it happened, marked.
    const disk = onDisk('fail');
    expect(disk.map((e) => (e.k === 'step' ? `${e.tool} ${e.args.target}${e.failed ? ' FAILED' : ''}` : e.k))).toEqual([
      'instruction',
      'read #x',
      'click #missing FAILED',
      'click #a',
    ]);
    expect((disk[2] as RecordedStep).failure).toEqual(failure);

    // Out of everything a consumer reads.
    const targets = (es: readonly RecordedEntry[]) => es.filter((e): e is RecordedStep => e.k === 'step').map((e) => e.args.target);
    expect(targets(rec.entries)).toEqual(['#x', '#a']);
    expect(targets(rec.entriesThisTake())).toEqual(['#x', '#a']);
    expect(targets(rec.entriesSince(mark))).toEqual(['#x', '#a']);
    expect(rec.stepsThisInstruction().map((s) => s.args.target)).toEqual(['#x', '#a']);
    expect(rec.mark()).toBe(3);
    expect(rec.entries.some(isFailedStep)).toBe(false);
  });

  it('stays out of a reloaded take, and a rewrite puts it back where it was', () => {
    const rec = new ScriptRecorder('reload');
    rec.fail(click('#first'), failure);
    rec.beginInstruction('one');
    rec.commit(click('#a'), 'clicked');
    rec.fail(click('#missing'), failure);
    rec.commit(click('#b'), 'clicked');
    // insertStepAfter and pinSkill both rewrite the whole file.
    rec.insertStepAfter(rec.entries[1] as RecordedStep, read('(read-back)'));
    rec.endInstruction({ status: 'success', summary: 'ok', values: {} });
    rec.pinSkill('s_abc');

    const again = new ScriptRecorder('reload');
    expect(again.entries.some(isFailedStep)).toBe(false);
    expect(again.entries).toHaveLength(5);
    expect(again.priorEntries).toBe(5);
    again.persist();
    const order = onDisk('reload').map((e) => (e.k === 'step' ? `${e.args.target}${e.failed ? '!' : ''}` : e.k));
    // A failed step stays after the entry it followed; the synthetic read-back is spliced in after that.
    expect(order).toEqual(['#first!', 'instruction', '#a', '#missing!', '(read-back)', '#b', 'report']);
    expect(new Set(onDisk('reload').map((e) => e.seq)).size).toBe(7);
  });

  it('parseScript leaves failed steps out, and reads an older store exactly as before', () => {
    const old = '{"k":"instruction","text":"x"}\n{"k":"step","tool":"click","args":{},"locators":{}}\n';
    const parsed = parseScript(old);
    expect(parsed.entries).toEqual([{ k: 'instruction', text: 'x' }, { k: 'step', tool: 'click', args: {}, locators: {} }]);
    expect(parsed.torn).toBe(false);
    expect(parseScript(old + '{"k":"st').torn).toBe(true);
    const withFailed = old + JSON.stringify({ ...click('#gone'), failed: true, failure }) + '\n';
    expect(parseScript(withFailed).entries).toHaveLength(2);
    expect([...parseScript(withFailed).failedAfter.values()].flat()).toHaveLength(1);
  });

  it('a cleared recording forgets its failed steps too', () => {
    const rec = new ScriptRecorder('clear');
    rec.fail(click('#x'), failure);
    rec.clear();
    rec.beginInstruction('fresh');
    expect(onDisk('clear')).toHaveLength(1);
    expect(rec.entries[0].seq).toBe(0);
  });
});

describe('stage 0 evidence helpers', () => {
  it('diffTotals counts what the 20-line diff cuts', () => {
    const before = Array.from({ length: 5 }, (_, i) => `- row "${i}"`);
    const after = [...before.slice(2), ...Array.from({ length: 30 }, (_, i) => `- cell "${i}"`)];
    expect(diffTotals(before, after)).toEqual({ added: 30, removed: 2 });
  });

  it('stepFailure keeps the proven outcome and reason, and the first line only', () => {
    const f = stepFailure(actionFailure('not-dispatched', 'never-attached', 'click NOT dispatched\nmore detail'));
    expect(f).toEqual({ outcome: 'not-dispatched', reason: 'never-attached', message: 'click NOT dispatched' });
    expect(stepFailure(new Error('boom')).outcome).toBe('unknown');
  });

  it('settleEvidence keeps the verdict, not the ignored request urls', () => {
    const s = settleEvidence({
      outcome: 'dispatched',
      url: 'http://app/x',
      via: 'forced',
      link: { from: 'http://app/x', href: 'http://app/y' },
      waited: { domMs: 250.4, networkMs: 0, urlMs: 12, effectMs: 0 },
      ignored: [{ url: 'http://app/poll', why: 'known-long-poll' }],
      deadlineHit: false,
    });
    expect(s).toEqual({ outcome: 'dispatched', via: 'forced', link: { from: 'http://app/x', href: 'http://app/y' }, waited: { domMs: 250, networkMs: 0, urlMs: 12, effectMs: 0 }, ignored: 1 });
  });
});

/**
 * Downstream invariance on real published recordings: every entry gains the
 * stage 0 fields, and a FAILED copy of every click and fill is injected right
 * before the real one (the exact shape abandonedRepeatClick and
 * dropSupersededSets act on). The offline rebuild (compile, carryOpener, the
 * ledger, buildFlow, lintFlowRefs, unbanked counts) must still match the
 * pinned baseline. The control — the same copies NOT marked failed — must
 * move it, or this test proves nothing.
 */
describe('a recording with stage 0 evidence and failed steps rebuilds to the same flow', () => {
  const TAGS = ['fwod24', 'fwgr14', 'fwrd35'];
  const fixtures = path.join(root, 'bench', 'fixtures', 'recordings');

  const augment = (tag: string, markFailed: boolean): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bp-evidence-${tag}-`));
    for (const f of fs.readdirSync(fixtures).filter((x) => x.startsWith(`${tag}-`))) {
      const from = path.join(fixtures, f);
      if (fs.statSync(from).isDirectory()) {
        fs.cpSync(from, path.join(dir, f), { recursive: true });
        continue;
      }
      let seq = 0;
      const out: string[] = [];
      for (const line of fs.readFileSync(from, 'utf8').split(/\r?\n/).filter(Boolean)) {
        const e = JSON.parse(line) as RecordedEntry;
        if (e.k === 'step' && (e.tool === 'click' || e.tool === 'fill') && !e.via) {
          const ghost: RecordedStep = { ...e, seq: seq++, t: 1_000 + seq, ...(e.tool === 'fill' ? { args: { ...e.args, value: 'wrong' } } : {}) };
          delete ghost.diff;
          if (markFailed) Object.assign(ghost, { failed: true, failure: { outcome: 'unknown', message: 'timeout' } });
          out.push(JSON.stringify(ghost));
        }
        if (e.k === 'instruction') {
          // A failed fill of a field nothing else touches: as a real gesture,
          // no supersede or repeat rule would drop it (the control's teeth).
          const ghost = { k: 'step', tool: 'fill', args: { target: '#ghost-field', value: `${tag} ghost value` }, locators: { target: { expr: "page.locator('#ghost-field')", verified: true, raw: '#ghost-field', chain: [{ kind: 'css', selector: '#ghost-field' }] } } };
          if (markFailed) Object.assign(ghost, { failed: true, failure: { outcome: 'not-dispatched', reason: 'never-attached', message: 'fill NOT dispatched' } });
          out.push(JSON.stringify({ ...e, seq: seq++, t: 1_000 + seq }));
          out.push(JSON.stringify({ ...ghost, seq: seq++, t: 1_000 + seq }));
          continue;
        }
        const stamped = { ...e, seq: seq++, t: 1_000 + seq, ...(e.k === 'step' ? { obs: { at: { d: 1, s: 2, c: 3 }, totals: { added: 99, removed: 99 }, removed: ['- button "x"'] } } : {}) };
        out.push(JSON.stringify(stamped));
      }
      fs.writeFileSync(path.join(dir, f), out.join('\n') + '\n');
    }
    return dir;
  };

  /**
   * Every file under dir, as a sorted list of texts with build time-stamps and
   * skill ids masked: an id hashes its compile's `created` stamp (store.ts), so
   * it differs between two builds of the same recording.
   */
  const readTree = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(fs.readFileSync(p, 'utf8').replace(/"(created|updated|lastUsed)": ?"[^"]*"/g, '"$1":"<t>"').replace(/\bs_[0-9a-f]{6}\b/g, 's_<id>'));
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out.sort();
  };

  /** Rebuild a tag offline; the flows (REBUILD_DUMP) and recompiled skills (REBUILD_STORE_DIR) it built, whole, and its stdout. */
  const rebuild = (tag: string, dir: string, baseline = true): { stdout: string; flows: Record<string, string>; skills: string[] } => {
    const dump = fs.mkdtempSync(path.join(os.tmpdir(), `bp-evidence-dump-${tag}-`));
    const store = fs.mkdtempSync(path.join(os.tmpdir(), `bp-evidence-store-${tag}-`));
    try {
      const run = spawnSync(process.execPath, ['bench/rebuild-flow.mjs', '--tag', tag, '--dir', dir, ...(baseline ? ['--baseline', `bench/fixtures/${tag}.json`] : [])], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, REBUILD_DUMP: path.join(dump, '{runid}.json'), REBUILD_STORE_DIR: path.join(store, '{runid}') },
      });
      // The flow is stamped with the moment it was built; everything else must match.
      const flows = Object.fromEntries(fs.readdirSync(dump).map((x) => [x, fs.readFileSync(path.join(dump, x), "utf8").replace(/"created": "[^"]*"/g, "\"created\": \"<t>\"")]));
      return { stdout: run.stdout, flows, skills: readTree(store) };
    } finally {
      fs.rmSync(dump, { recursive: true, force: true });
      fs.rmSync(store, { recursive: true, force: true });
    }
  };

  for (const tag of TAGS) {
    it(`${tag}: failed steps and evidence fields change nothing, the whole flow included`, () => {
      const plain = rebuild(tag, fixtures, false);
      expect(Object.keys(plain.flows).length).toBeGreaterThan(0);
      const dir = augment(tag, true);
      try {
        const got = rebuild(tag, dir);
        expect(got.stdout).toContain('MATCHES baseline');
        expect(got.flows).toEqual(plain.flows);
        expect(plain.skills.length).toBeGreaterThan(0);
        expect(got.skills).toEqual(plain.skills);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }, 90_000);
  }

  it('control: the same injected steps, as real gestures, do change the flow', () => {
    const plain = rebuild('fwod24', fixtures, false);
    const dir = augment('fwod24', false);
    try {
      expect(rebuild('fwod24', dir, false).skills).not.toEqual(plain.skills);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
