/**
 * The sourcing hold and the stage-3 pre-pass through the real loop, recorder
 * and page (hygiene design §4, behind SITELOOPER_SOURCING_HOLD=on):
 *  - an asked value the page does not show, that an eval returned, is held
 *    ONCE; the retry's labelled read is published (fwgt10's shape);
 *  - the same value shown on the page is not held (captureReadBack sources it);
 *  - a stubborn retry is accepted as it stands;
 *  - a value a read produced is not held; with the flag off nothing is held;
 *  - stage 3: "head (commentary)" whose head the page shows publishes the head.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/sourcing-hold.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage, Completion, Provider, ToolDef } from '../src/agent/llm.js';
import type { RecordedReport, RecordedStep } from '../src/daemon/recorder.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><head><title>Issues</title></head><body>
<h1 id="heading">Bench Issues</h1>
<div id="status">Ready to Deploy</div>
<ul id="issue-list">
  <li><a class="flex-item-title" href="/bench/bench-repo/issues/1">Seed: triage inbox</a></li>
  <li><a class="flex-item-title" href="/bench/bench-repo/issues/2">Seed: order missing parts</a></li>
</ul>
</body></html>`;

/** Provider stub that plays back scripted tool calls, one array per turn. */
function scripted(script: Array<Array<{ name: string; args: Record<string, unknown> }>>): Provider {
  let i = 0;
  return {
    model: 'stub',
    async complete(_m: ChatMessage[], _t: ToolDef[]): Promise<Completion> {
      const calls = script[Math.min(i++, script.length - 1)].map((c, j) => ({ id: `c${i}-${j}`, name: c.name, args: c.args, rawArgs: JSON.stringify(c.args) }));
      return {
        text: null,
        toolCalls: calls,
        assistantMessage: { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.rawArgs } })) },
        usage: { promptTokens: 10, completionTokens: 1, cachedTokens: 0 },
        served: null,
      };
    },
  };
}

d('the sourcing hold at the loop', () => {
  let home: string;
  let session: import('../src/daemon/browser.js').BrowserSession;
  const loopOpts = { maxTurns: 6, timeoutMs: 60_000, screenshotDir: os.tmpdir() };
  const INSTRUCTION = 'Open the issue list and report the titles of all open issues.';

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-sourcing-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SOURCING_HOLD = 'on';
    const { BrowserSession } = await import('../src/daemon/browser.js');
    session = new BrowserSession({ session: 'sourcing', persist: false, learn: true });
    const page = await session.getPage();
    const file = path.join(home, 'issues.html');
    fs.writeFileSync(file, PAGE);
    await page.goto(pathToFileURL(file).href);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    delete process.env.SITELOOPER_HOME;
    delete process.env.SITELOOPER_SOURCING_HOLD;
    fs.rmSync(home, { recursive: true, force: true });
  });

  afterEach(() => {
    process.env.SITELOOPER_SOURCING_HOLD = 'on';
  });

  const run = async (script: Array<Array<{ name: string; args: Record<string, unknown> }>>, instruction = INSTRUCTION) => {
    const { runInstruction } = await import('../src/agent/loop.js');
    const { SessionState } = await import('../src/daemon/state.js');
    const progress: string[] = [];
    const result = await runInstruction(scripted(script), session, new SessionState(`sourcing-${Math.random()}`), instruction, { ...loopOpts, onProgress: (l: string) => progress.push(l) });
    const entries = session.script!.entries;
    const lastReport = [...entries].reverse().find((e): e is RecordedReport => e.k === 'report')!;
    const reads = entries.filter((e): e is RecordedStep => e.k === 'step' && (e.tool === 'read' || e.tool === 'read_all'));
    return { result, progress, lastReport, reads };
  };

  const evalTitles = { name: 'eval', args: { expression: "[...document.querySelectorAll('.flex-item-title')].map(a => a.textContent)" } };
  const notOnPage = 'Seed: retire old laptops';

  it('holds once for an asked value the page does not show that an eval returned, and publishes the retry\'s labelled read', async () => {
    const { result, progress, lastReport, reads } = await run([
      [evalTitles],
      [{ name: 'report', args: { status: 'success', summary: 'Listed the issues.', evidence: { values: { open_issue_titles: notOnPage } } } }],
      [{ name: 'read_all', args: { target: '.flex-item-title', what: 'text', label: 'open_issue_titles' } }],
      [{ name: 'report', args: { status: 'success', summary: 'Listed the issues.', evidence: { values: { open_issue_titles: 'Seed: triage inbox, Seed: order missing parts' } } } }],
    ]);
    expect(result.report.status).toBe('success');
    expect(progress.some((l) => /holding success report for sourcing: open_issue_titles/.test(l))).toBe(true);
    expect(progress.filter((l) => /holding success report for sourcing/.test(l)).length).toBe(1);
    expect(progress.some((l) => /sourcing retry: 1 read\(s\) added, 1 labelled \(open_issue_titles\)/.test(l))).toBe(true);
    expect(progress.some((l) => /state-changing gesture after the sourcing hold/.test(l))).toBe(false);
    expect(reads.some((r) => r.tool === 'read_all' && r.args.label === 'open_issue_titles')).toBe(true);
    expect(lastReport.status).toBe('success');
    expect(String(lastReport.values.open_issue_titles ?? Object.values(lastReport.values).join(', '))).toContain('Seed: triage inbox');
    expect(lastReport.sourcingAsk).toEqual({ asked: ['open_issue_titles'], readsAdded: 1, labelled: ['open_issue_titles'], gesturesAfter: [] });
  }, 60_000);

  it('keeps every value the held report named when the retry drops its evidence block (fwop19 04-open)', async () => {
    const { result, lastReport } = await run([
      [evalTitles],
      [{ name: 'report', args: { status: 'success', summary: 'Listed.', evidence: { values: { open_issue_titles: notOnPage, issue_count: '2' } } } }],
      [{ name: 'read_all', args: { target: '.flex-item-title', what: 'text', label: 'open_issue_titles' } }],
      [{ name: 'report', args: { status: 'success', summary: 'Listed the issues; titles read from the page.' } }],
    ]);
    expect(result.report.status).toBe('success');
    expect(result.report.evidence?.values?.issue_count).toBe('2');
    expect(String(lastReport.values.issue_count)).toBe('2');
    expect(Object.values(lastReport.values).join(' ')).toContain('Seed: triage inbox');
  }, 60_000);

  it('accepts a stubborn retry as it stands, and names a data-changing gesture after the hold', async () => {
    const stubborn = { name: 'report', args: { status: 'success', summary: 'Listed the issues (from memory).', evidence: { values: { open_issue_titles: notOnPage } } } };
    const { result, progress } = await run([[evalTitles], [stubborn], [{ name: 'click', args: { target: '#heading' } }], [stubborn]]);
    expect(result.report.status).toBe('success');
    expect(result.report.evidence?.values?.open_issue_titles).toBe(notOnPage);
    expect(progress.filter((l) => /holding success report for sourcing/.test(l)).length).toBe(1);
    expect(progress.some((l) => /state-changing gesture after the sourcing hold: click/.test(l))).toBe(true);
    const entries = session.script!.entries;
    const last = [...entries].reverse().find((e): e is RecordedReport => e.k === 'report')!;
    expect(last.sourcingAsk).toEqual({ asked: ['open_issue_titles'], readsAdded: 0, labelled: [], gesturesAfter: ['click'] });
  }, 60_000);

  it('does not hold for a value the page shows, nor for one a read produced', async () => {
    const shown = await run([[evalTitles], [{ name: 'report', args: { status: 'success', summary: 'ok', evidence: { values: { open_issue_titles: 'Seed: triage inbox' } } } }]]);
    expect(shown.result.turns).toBe(2);
    expect(shown.progress.some((l) => /holding success report for sourcing/.test(l))).toBe(false);
    const read = await run([
      [{ name: 'read_all', args: { target: '.flex-item-title', what: 'text', label: 'open_issue_titles' } }],
      [{ name: 'report', args: { status: 'success', summary: 'ok', evidence: { values: { open_issue_titles: 'Seed: triage inbox, Seed: order missing parts' } } } }],
    ]);
    expect(read.result.turns).toBe(2);
    expect(read.progress.some((l) => /holding success report for sourcing/.test(l))).toBe(false);
  }, 60_000);

  it('holds nothing when the value is not asked for, or the flag is off', async () => {
    const unasked = await run([[evalTitles], [{ name: 'report', args: { status: 'success', summary: 'ok', evidence: { values: { scratch: notOnPage } } } }]]);
    expect(unasked.result.turns).toBe(2);
    expect(unasked.progress.some((l) => /holding success report for sourcing/.test(l))).toBe(false);
    process.env.SITELOOPER_SOURCING_HOLD = 'off';
    const off = await run([[evalTitles], [{ name: 'report', args: { status: 'success', summary: 'ok', evidence: { values: { open_issue_titles: notOnPage } } } }]]);
    expect(off.result.turns).toBe(2);
    expect(off.progress.some((l) => /holding success report for sourcing/.test(l))).toBe(false);
  }, 60_000);

  it('stage 3: a "head (commentary)" whose head the page shows publishes the head as a read-back, commentary in the summary', async () => {
    const { result, progress, lastReport, reads } = await run(
      [[{ name: 'report', args: { status: 'success', summary: 'Checked the status.', evidence: { values: { deploy_status: 'Ready to Deploy (badge: Deployed)' } } } }]],
      'Open the record and report the deploy status.',
    );
    expect(result.turns).toBe(1);
    expect(progress.some((l) => /holding success report for sourcing/.test(l))).toBe(false);
    expect(progress.some((l) => /deploy_status is a value the page shows plus commentary/.test(l))).toBe(true);
    expect(lastReport.values.deploy_status).toBe('Ready to Deploy');
    expect(lastReport.summary).toBe('Checked the status. (deploy_status: badge: Deployed)');
    expect(reads.some((r) => r.label === 'deploy_status' && r.args.target === '(read-back)')).toBe(true);
  }, 60_000);
});
