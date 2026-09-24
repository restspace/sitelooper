/**
 * Phase A hygiene through the real tool layer:
 *  - an eval that gives an element an id is refused, recorded nowhere, and
 *    the refusal names the target the tools can use (fwop10);
 *  - a read-only eval runs, and the recorder keeps what it returned as
 *    evalResult, with no `result` (stage 0);
 *  - a read_all that matches nothing tells the MODEL how to find the element
 *    rather than reach for eval (fwgt10's `.issue-title` → eval), while the
 *    recording keeps `[]`, the value compile and the read-back cascade parse.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/eval-hygiene.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedStep } from '../src/daemon/recorder.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><head><title>Issues</title></head><body>
<form id="work-package-journal-form-element"><div contenteditable="true">Add a comment</div></form>
<ul id="issue-list">
  <li><a class="flex-item-title" href="/bench/bench-repo/issues/1">Seed: triage inbox</a></li>
  <li><a class="flex-item-title" href="/bench/bench-repo/issues/2">Seed: order missing parts</a></li>
</ul>
</body></html>`;

d('eval hygiene at the tool layer', () => {
  let home: string;
  let session: BrowserSession;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const steps = () => session.script!.entries.filter((e): e is RecordedStep => e.k === 'step');

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-evalhyg-'));
    process.env.SITELOOPER_HOME = home;
    session = new BrowserSession({ session: 'eval-hygiene', persist: false, learn: true });
    const page = await session.getPage();
    const file = path.join(home, 'issues.html');
    fs.writeFileSync(file, PAGE);
    await page.goto(pathToFileURL(file).href);
    session.script!.beginInstruction('Report the titles of all open issues.', { url: page.url() });
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('refuses an eval that assigns an id, records nothing, and names the replayable target', async () => {
    const before = steps().length;
    const out = await run('eval', {
      expression: "(() => { const form=document.getElementById('work-package-journal-form-element'); const ce=form.querySelector('[contenteditable=\"true\"]'); ce.id='journal-editor-2'; return ce.id; })()",
    });
    expect(out.isError).toBe(true);
    expect(out.result).toContain('assigns .id');
    expect(out.result).toContain('`#work-package-journal-form-element >> [contenteditable="true"]`');
    expect(steps().length).toBe(before);
    const page = await session.getPage();
    expect(await page.locator('#journal-editor-2').count()).toBe(0);
  });

  it('runs a read-only eval and records what it returned as evalResult', async () => {
    const expression = "[...document.querySelectorAll('#issue-list a')].map(a => a.textContent.trim())";
    const out = await run('eval', { expression });
    expect(out.isError).toBeFalsy();
    const recorded = steps().at(-1)!;
    expect(recorded.tool).toBe('eval');
    expect(recorded.evalResult).toBe('["Seed: triage inbox","Seed: order missing parts"]');
    expect(recorded).not.toHaveProperty('result');
  });

  it('an empty read_all tells the model what to do instead; the recording keeps []', async () => {
    const out = await run('read_all', { target: '.issue-title', what: 'text' });
    expect(out.result.startsWith('[]')).toBe(true);
    expect(out.result).toContain('0 elements match ".issue-title"');
    expect(out.result).toContain('never replayed');
    const recorded = steps().at(-1)!;
    expect([recorded.tool, recorded.result]).toEqual(['read_all', '[]']);
    // A read_all that matches is untouched.
    const hit = await run('read_all', { target: '#issue-list a', what: 'text' });
    expect(hit.result).toBe('["Seed: triage inbox","Seed: order missing parts"]');
  });
});
