/**
 * Declared fix-ups through the real tool layer (tools.ts executeFixup and
 * runStep, recorder.commit) on a real page: erpnext fwen10-fr's shape, an
 * order that has one row twice, corrected by ticking the second and deleting
 * it. The guard is recorded as a wait_for with locators like any other, the
 * correction's steps are marked, and the first step after which the check no
 * longer holds closes it.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/fixup-record.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { wellFormedFixup } from '../src/execution/fixup.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><head><title>Order</title></head><body>
<h1>Sales order SO-0042</h1>
<table id="items"><tbody>
<tr><td><input type="checkbox" id="row1" aria-label="Select row 1"></td><td><a href="#w">Widget</a></td><td>2</td></tr>
<tr><td><input type="checkbox" id="row2" aria-label="Select row 2"></td><td><a href="#w">Widget</a></td><td>2</td></tr>
<tr><td><input type="checkbox" id="row3" aria-label="Select row 3"></td><td><a href="#g">Gadget</a></td><td>1</td></tr>
</tbody></table>
<button type="button" id="delete" onclick="document.querySelectorAll('#items input:checked').forEach((c) => c.closest('tr').remove()); document.getElementById('msg').textContent = 'You removed 1 row from Items';">Delete</button>
<button type="button" id="save" onclick="document.getElementById('msg').textContent = 'Saved';">Save</button>
<p id="draft">Draft</p>
<p id="msg"></p>
</body></html>`;

d('declared fix-ups at the tool layer', () => {
  let home: string;
  let session: BrowserSession;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const onDisk = (): RecordedEntry[] =>
    fs
      .readFileSync(path.join(home, 'sessions', 'fixup-record', 'script.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RecordedEntry);
  const live = (): RecordedStep[] => session.script!.stepsThisInstruction();

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-fixup-rec-'));
    process.env.SITELOOPER_HOME = home;
    session = new BrowserSession({ session: 'fixup-record', persist: false, learn: true });
    const page = await session.getPage();
    const file = path.join(home, 'order.html');
    fs.writeFileSync(file, PAGE);
    await page.goto(pathToFileURL(file).href);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('refuses a check that does not hold now and records nothing', async () => {
    session.script!.beginInstruction('submit the order');
    const out = await run('fixup', { reason: 'the order has the Widget row three times', target: 'a:has-text("Widget")', state: 'count', count: 3 });
    expect(out.isError).toBe(true);
    expect(out.result).toMatch(/its check does not hold now .*count=2/);
    expect(live()).toHaveLength(0);
    expect(onDisk().filter((e) => e.k === 'step')).toHaveLength(0);
  }, 30_000);

  it('records the guard with locators, marks the correction, and closes it when the duplicate is gone', async () => {
    const declared = await run('fixup', { reason: 'the order has the Widget row twice; delete the second', target: 'a:has-text("Widget")', state: 'count', count: 2 });
    expect(declared.isError).toBe(false);
    expect(declared.result).toMatch(/^fix-up g1 declared \(condition met: count=2\)/);
    const nested = await run('fixup', { reason: 'a draft is left', target: '#draft', state: 'visible' });
    expect(nested.result).toMatch(/fix-up g1 is still open/);

    const ticked = await run('check', { target: '#row2' });
    expect(ticked.result).not.toMatch(/fix-up g1 complete/);
    const deleted = await run('click', { target: '#delete' });
    expect(deleted.result).toMatch(/\[fix-up g1 complete: after that click its check no longer holds/);
    await run('click', { target: '#save' });

    const steps = live();
    expect(steps.map((s) => [s.tool, s.guard?.id, s.guarded, s.guardEnd])).toEqual([
      ['wait_for', 'g1', undefined, undefined],
      ['check', undefined, 'g1', undefined],
      ['click', undefined, 'g1', true],
      ['click', undefined, undefined, undefined],
    ]);
    const guard = steps[0];
    expect(guard.args).toEqual({ target: 'a:has-text("Widget")', state: 'count', count: 2 });
    expect(guard.guard).toEqual({ id: 'g1', reason: 'the order has the Widget row twice; delete the second' });
    expect(guard.locators.target?.expr).toBeTruthy();
    expect(guard.locators.target?.raw).toBe('a:has-text("Widget")');
    expect(wellFormedFixup(steps, 0)).toBe(true);
    // As written to script.jsonl, which is what compile reads.
    const disk = onDisk().filter((e): e is RecordedStep => e.k === 'step');
    expect(disk.map((s) => [s.guard?.id, s.guarded, s.guardEnd])).toEqual(steps.map((s) => [s.guard?.id, s.guarded, s.guardEnd]));
    const out = process.env.FIXUP_SAMPLE_OUT;
    if (out) fs.writeFileSync(out, JSON.stringify({ guard: disk[0], guarded: disk[1], guardEnd: disk[2] }, null, 2));
  }, 60_000);

  it('leaves a fix-up the instruction reports inside of without guardEnd', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    session.script!.endInstruction({ status: 'success', summary: 'submitted', values: {} });
    session.script!.beginInstruction('tidy the order');
    const declared = await run('fixup', { reason: 'a draft note is left on the order', target: '#draft', state: 'visible' });
    expect(declared.isError).toBe(false);
    expect(declared.result).toMatch(/^fix-up g2 declared/);
    await run('click', { target: '#save' }); // the draft is still there
    session.script!.endInstruction({ status: 'success', summary: 'tidied', values: {} });
    expect(err.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/fix-up g2 left open/)]);
    err.mockRestore();
    const disk = onDisk().filter((e): e is RecordedStep => e.k === 'step');
    const last = disk.slice(-2);
    expect(last.map((s) => [s.guard?.id, s.guarded, s.guardEnd])).toEqual([
      ['g2', undefined, undefined],
      [undefined, 'g2', undefined],
    ]);
    expect(session.script!.openFixup).toBeNull();
  }, 60_000);
});
