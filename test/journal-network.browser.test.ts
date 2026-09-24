/**
 * Recorder journal, stage 1 (network) through the real tool layer: each
 * request is filed under the gesture that caused it, says which typed values
 * it carries (never the body), and a create's answer gives its minted ids.
 * Polling is the app's, not the gesture's. Nothing reaches the model's text.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/journal-network.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedStep } from '../src/daemon/recorder.js';
import type { JournalEvent } from '../src/daemon/journal-attribute.js';
import { startJournalApp } from './fixture/journal-app.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

d('recorder journal: network (stage 1)', () => {
  let home: string;
  let session: BrowserSession;
  let app: Awaited<ReturnType<typeof startJournalApp>>;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const steps = () => session.script!.entries.filter((e): e is RecordedStep => e.k === 'step');
  const last = (tool: string) => steps().filter((s) => s.tool === tool).at(-1)!;
  const all = (): JournalEvent[] => steps().flatMap((s) => [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])]);

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-journal-net-'));
    process.env.SITELOOPER_HOME = home;
    app = await startJournalApp();
    session = new BrowserSession({ session: 'journal-net', persist: false, learn: true });
    session.script!.beginInstruction('journal network');
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await app?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('files a save under its click, with the fill it carries and the id it minted, and tells the model nothing', async () => {
    await run('goto', { url: `${app.url}/` });
    await run('fill', { target: '#title', value: 'Bench Title 1' });
    const fill = last('fill');
    const out = await run('click', { target: '#save' });
    const click = last('click');
    const save = (click.journal?.ev ?? []).find((e) => e.k === 'req' && String(e.e).endsWith('/api/save'));
    expect(save, JSON.stringify(click.journal)).toBeTruthy();
    expect(save!.c).toEqual(['in', click.journal!.w, 'gesture']);
    expect(save!.m).toBe('POST');
    expect(save!.carries).toEqual([fill.journal!.w]);
    expect(save!.s).toBe(200);
    expect(save!.mint).toEqual([expect.objectContaining({ p: 'id' })]);
    // The body is never stored.
    expect(JSON.stringify(steps())).not.toContain('"title":"Bench Title 1"');
    expect(out.result).not.toMatch(/journal|carries|\/api\/save/);
  }, 60_000);

  it('a click that sent nothing has no request of its own', async () => {
    await run('click', { target: '#noop' });
    const noop = last('click');
    expect((noop.journal?.ev ?? []).filter((e) => e.k === 'req')).toEqual([]);
  }, 60_000);

  it('files a debounced search under the fill that typed it', async () => {
    await run('goto', { url: `${app.url}/search` });
    await run('fill', { target: '#q', value: 'widget' });
    const fill = last('fill');
    await new Promise((r) => setTimeout(r, 900)); // the model thinking; the journal keeps listening
    const readOut = await run('read', { target: '#q', what: 'value' });
    if (!steps().some((s) => s.tool === 'read')) throw new Error('read not recorded: ' + JSON.stringify(readOut));
    const search = all().find((e) => e.k === 'req' && String(e.e).endsWith('/api/search'));
    expect(search, JSON.stringify(all().filter((e) => e.k === "req").map((e) => [e.e, e.c, e.t])) + JSON.stringify(steps().slice(-3).map((s) => [s.tool, s.journal]))).toBeTruthy();
    expect([search!.c?.[0], search!.c?.[1]]).toEqual([expect.stringMatching(/^(in|late)$/), fill.journal!.w]);
    expect(search!.carries).toEqual([fill.journal!.w]);
  }, 60_000);

  it('polling is the app\'s, even while a gesture runs', async () => {
    await run('goto', { url: `${app.url}/?poll=1` });
    await new Promise((r) => setTimeout(r, 1_200));
    await run('click', { target: '#noop' });
    await new Promise((r) => setTimeout(r, 600));
    await run('read', { target: '#status', what: 'text' });
    const polls = all().filter((e) => e.k === 'req' && String(e.e).endsWith('/api/poll'));
    expect(polls.length).toBeGreaterThan(5);
    const late = polls.slice(-4);
    expect(late.every((e) => e.c?.[0] === 'app'), JSON.stringify(late.map((e) => e.c))).toBe(true);
    const noop = last('click');
    expect((noop.journal?.ev ?? []).filter((e) => e.k === 'req')).toEqual([]);
  }, 60_000);
});
