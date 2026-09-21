/**
 * The recorder keeps what an add-less click took off the page (fwsi1
 * 05-change: a disclosure that collapsed recorded `added: []` and nothing
 * else), which is how compile tells a hide-then-show toggle pair from two
 * clicks (src/skills/toggles.ts); and the recording of such a pair compiles
 * to one flagged click.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/toggle-record.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><body><h1>Asset</h1>
<button id="expand" type="button" aria-label="Show/Hide More Information">i</button>
<div id="panel"><a href="#m">Model One</a> <a href="#k">Maker One</a></div>
<script>document.getElementById('expand').addEventListener('click', () => { const p = document.getElementById('panel'); p.hidden = !p.hidden; });</script>
</body></html>`;

d('recording a disclosure toggle', () => {
  let home: string;
  let session: BrowserSession;
  const previous = process.env.SITELOOPER_HOME;

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-toggle-'));
    process.env.SITELOOPER_HOME = home;
    session = new BrowserSession({ session: `toggle-${Date.now()}`, persist: false, learn: true });
    const page = await session.getPage();
    // a real origin, so compile has one to key the procedure on
    await page.route('http://app.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
    await page.goto('http://app.test/asset');
  }, 60_000);
  afterAll(async () => {
    await session?.close();
    if (previous === undefined) delete process.env.SITELOOPER_HOME;
    else process.env.SITELOOPER_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('keeps the removals of a click that added nothing, and compiles the hide-then-show pair to one toggle click', async () => {
    const script = session.script!;
    const url = (await session.getPage()).url();
    script.beginInstruction('show the more-information panel', { url });
    const target = 'role=button[name="Show/Hide More Information"]';
    expect((await executeTool(session, 'click', { target }, home)).isError).toBe(false);
    expect((await executeTool(session, 'click', { target }, home)).isError).toBe(false);
    const steps = script.entriesThisTake().filter((e): e is RecordedStep => e.k === 'step');
    expect(steps).toHaveLength(2);
    expect(steps[0].diff?.added).toEqual([]);
    expect(steps[0].diff?.removed).toEqual(expect.arrayContaining(['- link "Model One"', '- link "Maker One"']));
    expect(steps[1].diff?.added).toEqual(expect.arrayContaining(['- link "Model One"']));
    // a click that added something keeps no removals (store weight nothing reads)
    expect(steps[1].diff?.removed).toBeUndefined();

    const [skill] = compileSkills({
      entries: [{ k: 'instruction', text: 'show the more-information panel', url }, ...steps],
      instruction: 'show the more-information panel',
      report: { status: 'success', summary: 'shown', evidence: { values: {} } },
      session: 't',
      now: '2026-09-22T00:00:00.000Z',
    });
    expect(skill.steps).toHaveLength(1);
    expect(skill.steps[0].toggle).toBe(true);
    expect(skill.steps[0].expect?.addedContains).toEqual(expect.arrayContaining(['- link "Maker One"']));
  });
});
