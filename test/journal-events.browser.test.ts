/**
 * Recorder journal, stage 3 through the real tool layer: time-stamped page
 * and navigation events, attributed (a tab that opens late, with no opener, is
 * the click's — ghost fwgh6, snipe-it fwsi9; one an eval opens is the eval's —
 * ghost fwgh8; a url a debounced search pushes is the fill's — snipe-it
 * fwsi1), and the gap diff: what changed on the page between two gestures.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/journal-events.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedStep } from '../src/daemon/recorder.js';
import type { JournalEvent } from '../src/daemon/journal-attribute.js';
import { startJournalApp } from './fixture/journal-app.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

d('recorder journal: page events and the gap diff (stage 3)', () => {
  let home: string;
  let session: BrowserSession;
  let app: Awaited<ReturnType<typeof startJournalApp>>;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const steps = () => session.script!.entries.filter((e): e is RecordedStep => e.k === 'step');
  const last = (tool: string) => steps().filter((s) => s.tool === tool).at(-1)!;
  const since = (n: number): JournalEvent[] => steps().slice(n).flatMap((s) => [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])]);

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-journal-events-'));
    process.env.SITELOOPER_HOME = home;
    app = await startJournalApp();
    session = new BrowserSession({ session: 'journal-events', persist: false, learn: true });
    session.script!.beginInstruction('journal events');
  }, 60_000);

  afterEach(async () => {
    // Back to one tab on the first page.
    const pages = await session.listPages();
    for (const p of pages.slice(1)) await p.close().catch(() => {});
  });

  afterAll(async () => {
    await session?.close();
    await app?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("a tab that opens 700 ms after the click (noopener) is the click's (late, page), and so is its first navigation", async () => {
    await run('goto', { url: `${app.url}/popup` });
    const n = steps().length;
    await run('click', { target: '#later' });
    const click = last('click');
    await sleep(1_200);
    await run('read', { target: '#later', what: 'text' });
    const tab = since(n).find((e) => e.k === 'page+');
    expect(tab, JSON.stringify(since(n))).toMatchObject({ k: 'page+', c: ['late', click.journal!.w, 'page'] });
    // Not the daemon's look that happened to be running (the late-popup grace).
    const nav = since(n).find((e) => e.k === 'nav' && e.pg === tab!.pg);
    expect(nav?.c).toEqual(['late', click.journal!.w, 'page']);
  }, 90_000);

  // A tab an eval opens is the eval's (ghost fwgh8). Eval hygiene now refuses
  // window.open in an eval outright, so that case is covered by the
  // attribution unit test (rule 1, an eval window) rather than here.

  it('a url pushed by a debounced search is the fill\'s', async () => {
    await run('goto', { url: `${app.url}/search` });
    const n = steps().length;
    await run('fill', { target: '#q', value: 'gadget' });
    const fill = last('fill');
    await sleep(900);
    await run('read', { target: '#q', what: 'value' });
    const nav = since(n).find((e) => e.k === 'nav' && String(e.url).includes('q=gadget'));
    expect(nav, JSON.stringify(since(n))).toBeTruthy();
    expect(nav!.c?.[1]).toBe(fill.journal!.w);
  }, 90_000);

  it('the gap diff: what appeared between two gestures, since which step', async () => {
    await run('goto', { url: `${app.url}/` });
    await run('click', { target: '#noop' });
    const first = last('click');
    const page = await session.getPage();
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.textContent = 'Injected';
      document.body.appendChild(b);
    });
    await run('click', { target: '#noop' });
    const second = last('click');
    expect(second.journal?.gap, JSON.stringify(second.journal)).toMatchObject({ since: first.journal!.w, added: ['- button "Injected"'], totals: { added: 1, removed: 0 } });
    // A gesture's own change is its diff, not the next step's gap.
    expect(first.journal?.gap?.added ?? []).not.toContain('- button "Injected"');
  }, 90_000);
});
