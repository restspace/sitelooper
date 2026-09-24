/**
 * Stage 0 recorder evidence through the real tool layer (tools.ts runStep):
 * a step carries its dispatch/settle/capture times, the settle verdict, the
 * uncapped diff counts and the removals the diff itself does not keep, and a
 * FAILED action is on disk as `failed: true` and nowhere a consumer reads.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/recorder-evidence.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

// "Grow" adds 25 buttons and takes "Old" away: the diff keeps 20 added lines
// and, because something was added, no removals at all.
const PAGE = `<!doctype html><html><head><title>Evidence</title></head><body>
<button id="old">Old</button>
<button id="grow" type="button" onclick="document.getElementById('old').remove(); for (let i = 0; i < 25; i++) { const b = document.createElement('button'); b.textContent = 'New ' + i; document.body.appendChild(b); }">Grow</button>
</body></html>`;

d('stage 0 recorder evidence at the tool layer', () => {
  let home: string;
  let session: BrowserSession;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const onDisk = (): RecordedEntry[] =>
    fs
      .readFileSync(path.join(home, 'sessions', 'stage0-evidence', 'script.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RecordedEntry);

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-stage0-'));
    process.env.SITELOOPER_HOME = home;
    session = new BrowserSession({ session: 'stage0-evidence', persist: false, learn: true });
    const page = await session.getPage();
    const file = path.join(home, 'evidence.html');
    fs.writeFileSync(file, PAGE);
    await page.goto(pathToFileURL(file).href);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('records timing, the settle verdict, uncapped totals and the removals the diff drops', async () => {
    const recorder = session.script!;
    recorder.beginInstruction('grow the page');
    await run('click', { target: '#grow' });
    const step = recorder.entries.at(-1) as RecordedStep;
    expect(step.tool).toBe('click');
    // The diff is exactly what it always was: 20 added lines, no removals.
    expect(step.diff?.added).toHaveLength(20);
    expect(step.diff?.removed).toBeUndefined();
    // The evidence says what the diff could not.
    const obs = step.obs!;
    expect(obs.totals!.added).toBeGreaterThanOrEqual(25);
    expect(obs.totals!.removed).toBeGreaterThanOrEqual(1);
    expect(obs.removed).toContain('- button "Old"');
    expect(obs.settle?.outcome).toBe('dispatched');
    expect(obs.captureFailed).toBeUndefined();
    expect(obs.at.d).toBeLessThanOrEqual(obs.at.s!);
    expect(obs.at.s).toBeLessThanOrEqual(obs.at.c!);
    expect(typeof step.seq).toBe('number');
  }, 60_000);

  it('records a failed click as evidence, never as a gesture', async () => {
    const recorder = session.script!;
    const before = recorder.entries.length;
    const result = await run('click', { target: '#nowhere', timeout: 1500 }).catch((e: unknown) => String(e));
    expect(String(typeof result === 'string' ? result : JSON.stringify(result))).toMatch(/nowhere|not|fail|error/i);
    expect(recorder.entries).toHaveLength(before);
    expect(recorder.stepsThisInstruction().some((s) => s.args.target === '#nowhere')).toBe(false);
    const failed = onDisk().filter((e): e is RecordedStep => e.k === 'step' && e.failed === true);
    expect(failed).toHaveLength(1);
    expect(failed[0].args.target).toBe('#nowhere');
    expect(failed[0].failure?.outcome).toMatch(/not-dispatched|unknown/);
    expect(typeof failed[0].obs?.at.d).toBe('number');
  }, 60_000);
});
