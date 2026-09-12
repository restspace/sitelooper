import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillStore, type Skill } from '../src/skills/store.js';

/**
 * C09 / invariant 9: concurrent writers cannot lose updates.
 *
 * These run REAL child processes rather than two SkillStore objects in one
 * event loop, because the thing under test is a filesystem lock and an
 * in-process test cannot fail the way the bug does. Two daemons is the actual
 * deployment — a sweep with a background replay, two terminals, a repair pass
 * beside a run.
 *
 * The child writes through dist/, so this suite needs a build; it is skipped
 * rather than failed when there is none, exactly as the rebuild guard does.
 */
const dist = path.resolve('dist/skills/store.js');
const built = fs.existsSync(dist);
const d = built ? describe : describe.skip;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function temp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-conc-'));
  dirs.push(dir);
  return dir;
}

const ORIGIN = 'http://app.test';
const seed = (over: Partial<Skill> = {}): Skill => ({
  id: 's_conc',
  origin: ORIGIN,
  template: 'do the thing',
  params: {},
  preconditions: { urlPattern: `${ORIGIN}/` },
  steps: [{ tool: 'click', args: { target: '@e1' }, locators: {} }],
  stats: { uses: 0, successes: 0, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
  status: 'provisional',
  provenance: { session: 's', instruction: 'do the thing', created: 't' },
  ...over,
});

/**
 * Record `each` outcomes against one procedure from `workers` SEPARATE,
 * genuinely simultaneous processes.
 *
 * Concurrency here is the entire point, and it is easy to write a version of
 * this that has none: `spawnSync` in a loop runs the children one after
 * another, and the first draft of this test passed with the lock removed
 * because of exactly that. So the children are spawned asynchronously AND
 * given a common start time to busy-wait for, which puts them inside the
 * critical section together instead of merely near each other.
 */
async function race(dir: string, workers: number, each: number): Promise<{ code: number; err: string }[]> {
  const startAt = Date.now() + 600;
  const script = `
    const { SkillStore } = require(${JSON.stringify(dist.split(path.sep).join('/'))});
    // With  node -e <script> <args>  the extra arguments land at argv[1] on:
    // there is no script path to occupy the first slot.
    const store = new SkillStore(process.argv[1]);
    const startAt = Number(process.argv[2]);
    while (Date.now() < startAt) { /* line up on the barrier */ }
    for (let i = 0; i < ${each}; i++) {
      store.recordOutcome('s_conc', { ok: false, failedAt: 1 + (i % 3), instructionSucceeded: true });
    }
  `;
  const runs = Array.from({ length: workers }, () =>
    new Promise<{ code: number; err: string }>((resolve) => {
      const child = spawn(process.execPath, ['--input-type=commonjs', '-e', script, dir, String(startAt)], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let err = '';
      child.stderr.on('data', (chunk) => (err += String(chunk)));
      child.on('close', (code) => resolve({ code: code ?? -1, err }));
    }),
  );
  return Promise.all(runs);
}

d('SkillStore under concurrent writers', () => {
  /**
   * The bug this exists for: recordOutcome was get-then-mutate-then-write, so
   * two processes each read `uses: 4`, each wrote 5, and one run vanished.
   * Promotion and demotion are computed from those same counters, so a lost
   * increment is not only a wrong number — a procedure can reach validated on
   * fewer clean runs than the rule requires.
   */
  it('loses no increment when several processes record outcomes at once', async () => {
    const dir = temp();
    new SkillStore(dir).put(seed());

    const results = await race(dir, 4, 25);
    for (const r of results) expect(r.err, r.err).not.toMatch(/could not lock|Error/);
    for (const r of results) expect(r.code).toBe(0);

    const after = new SkillStore(dir).get('s_conc')!;
    // Every single one of the 100 outcomes is accounted for. This is the
    // assertion that fails without the lock, and it fails by a random amount.
    expect(after.stats.uses).toBe(100);
    expect(after.stats.partial).toBe(100);
    expect(Object.values(after.stats.failedAtStep).reduce((a, b) => a + b, 0)).toBe(100);
    expect(after.revision).toBeGreaterThanOrEqual(100);
  }, 60_000);

  it('leaves no lock or temp file behind', async () => {
    const dir = temp();
    new SkillStore(dir).put(seed());
    await race(dir, 3, 10);
    const litter = fs
      .readdirSync(path.join(dir, 'http_app.test'))
      .filter((f) => f.endsWith('.lock') || f.endsWith('.tmp'));
    expect(litter).toEqual([]);
  }, 60_000);

  /**
   * A process that dies holding a lock must not wedge the store forever.
   * Both tests matter and neither is sufficient alone: pids are reused, so a
   * dead holder's number can belong to something unrelated and the lock would
   * look held for good; and a live process doing slow work must not have its
   * lock stolen.
   */
  it('takes over a lock whose holder is gone, and says so when one is alive', () => {
    const dir = temp();
    const store = new SkillStore(dir);
    store.put(seed());
    const file = path.join(dir, 'http_app.test', 's_conc.json');

    // A pid that cannot be running: taken over immediately, no waiting.
    fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: 0x7ffffffe, at: Date.now() }));
    const began = Date.now();
    expect(store.recordOutcome('s_conc', { ok: true, instructionSucceeded: true })?.stats.uses).toBe(1);
    expect(Date.now() - began).toBeLessThan(2_000);
    expect(fs.existsSync(`${file}.lock`)).toBe(false);

    // This process is alive, so the lock is respected — and the refusal names
    // the holder and the file to remove, rather than blocking forever or
    // quietly writing anyway.
    fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.pid, at: Date.now() }));
    expect(() => store.recordOutcome('s_conc', { ok: true, instructionSucceeded: true })).toThrow(
      /could not lock s_conc\.json/,
    );
    fs.rmSync(`${file}.lock`);
  }, 30_000);

  it('starts a transaction from what is on disk, not from a caller\'s stale copy', () => {
    const dir = temp();
    const store = new SkillStore(dir);
    store.put(seed());
    const stale = store.get('s_conc')!;

    // Somebody else records two outcomes.
    const other = new SkillStore(dir);
    other.recordOutcome('s_conc', { ok: true, instructionSucceeded: true });
    other.recordOutcome('s_conc', { ok: true, instructionSucceeded: true });

    // The stale object still says 0 uses; the transaction must not.
    expect(stale.stats.uses).toBe(0);
    const seenByUpdate = store.update('s_conc', (s) => {
      expect(s.stats.uses).toBe(2);
      s.template = 'edited';
      return s;
    });
    expect(seenByUpdate?.stats.uses).toBe(2);
    expect(store.get('s_conc')?.template).toBe('edited');
  });

  it('abandons a transaction that returns null, writing nothing', () => {
    const dir = temp();
    const store = new SkillStore(dir);
    store.put(seed());
    const before = store.get('s_conc')!;
    expect(store.update('s_conc', () => null)).toBeNull();
    const after = store.get('s_conc')!;
    expect(after.revision).toBe(before.revision);
    expect(after.template).toBe('do the thing');
  });
});
