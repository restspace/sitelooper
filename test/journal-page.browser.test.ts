/**
 * Recorder journal, stage 2 (the in-page journal) through the real tool
 * layer, one fixture per attribution rule: popup lineage and a close between
 * gestures (gitea fwgt11), option ticks made of a CSS class, a "Saved!" flash
 * from a timer versus from the click (vikunja fwvk12), a value the app emptied
 * with no event (espocrm fwec10), where a click landed when an overlay
 * covered its target, and a ticking clock (noise).
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/journal-page.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { RecordedStep } from '../src/daemon/recorder.js';
import type { JournalEvent } from '../src/daemon/journal-attribute.js';
import { valueHash } from '../src/daemon/journal-attribute.js';
import { startJournalApp } from './fixture/journal-app.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

d('recorder journal: in-page (stage 2)', () => {
  let home: string;
  let session: BrowserSession;
  let app: Awaited<ReturnType<typeof startJournalApp>>;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());
  const steps = () => session.script!.entries.filter((e): e is RecordedStep => e.k === 'step');
  const last = (tool: string) => steps().filter((s) => s.tool === tool).at(-1)!;
  const since = (n: number): JournalEvent[] => steps().slice(n).flatMap((s) => [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])]);

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-journal-page-'));
    process.env.SITELOOPER_HOME = home;
    app = await startJournalApp();
    session = new BrowserSession({ session: 'journal-page', persist: false, learn: true });
    session.script!.beginInstruction('journal in-page');
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await app?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('a picker: the opener shows it, a tick is a class change with its direction, a close between gestures is the opener\'s undo on blur and the commit follows', async () => {
    await run('goto', { url: `${app.url}/picker` });
    const n = steps().length;
    await run('click', { target: '#open' });
    const open = last('click');
    const shown = (open.journal?.ev ?? []).find((e) => e.k === 'show');
    expect(shown, JSON.stringify(open.journal)).toMatchObject({ k: 'show', d: 'listbox "Labels"', c: ['in', open.journal!.w, 'gesture'] });
    await run('click', { target: 'a[data-id="1"]' });
    const tick = last('click');
    const state = (tick.journal?.ev ?? []).find((e) => e.k === 'state');
    expect(state, JSON.stringify(tick.journal)).toMatchObject({ a: 'class', on: true, c: ['in', tick.journal!.w, 'gesture'] });
    expect(String(state!.d)).toMatch(/^option ".*bug"$/);
    // The picker shuts with no gesture: something else took focus (fwgt11).
    const page = await session.getPage();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await sleep(400);
    await run('read', { target: '#applied', what: 'text' });
    const events = since(n);
    const hide = events.find((e) => e.k === 'hide');
    expect(hide, JSON.stringify(events)).toMatchObject({ d: 'listbox "Labels"', c: ['undo', open.journal!.w, 'blur'] });
    const commit = events.find((e) => e.k === 'req' && String(e.e).endsWith('/api/labels'));
    expect(commit).toBeTruthy();
  }, 90_000);

  it('a flash from an autosave timer is not the click\'s; the same flash from the Save click is', async () => {
    await run('goto', { url: `${app.url}/flash` });
    const n = steps().length;
    await sleep(1_300); // the autosave timer fires (and its flash ends) while the model thinks
    await run('click', { target: '#save' });
    const save = last('click');
    const flashes = since(n).filter((e) => e.k === 'txt' && e.x === 'Description Saved!').sort((a, b) => a.t - b.t);
    expect(flashes.length, JSON.stringify(since(n))).toBeGreaterThanOrEqual(2);
    const [timer, own] = flashes;
    expect(timer.c).toEqual(['app', 'req']);
    expect(own.c).toEqual(['in', save.journal!.w, 'gesture']);
  }, 90_000);

  it('a value: typed (hash equals the fill), then emptied by the app with no event, caught at the next drain', async () => {
    await run('goto', { url: `${app.url}/` });
    await run('fill', { target: '#title', value: 'Bench Title 9' });
    const fill = last('fill');
    const val = (fill.journal?.ev ?? []).find((e) => e.k === 'val');
    expect(val, JSON.stringify(fill.journal)).toMatchObject({ f: 'textbox "Title"', len: 13, h: valueHash('Bench Title 9'), eq: fill.journal!.w });
    const page = await session.getPage();
    await page.evaluate(() => {
      (document.getElementById('title') as HTMLInputElement).value = '';
    });
    await run('click', { target: '#noop' });
    const emptied = since(steps().length - 1).find((e) => e.k === 'val' && e.len === 0);
    expect(emptied, JSON.stringify(last('click').journal)).toMatchObject({ f: 'textbox "Title"', src: 'd' });
    // Never the text itself.
    // No journal EVENT holds the text. (The gap diff's page lines show a field's value as every step diff does, scrubbed of secrets.)
    expect(JSON.stringify(steps().flatMap((s) => [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])]))).not.toContain('Bench Title 9');
  }, 90_000);

  it('a pre-filled value cleared and filled back: each set records the hash it replaced (`was`), so the restore is provable (fwsi13)', async () => {
    await run('goto', { url: `${app.url}/` });
    await run('fill', { target: '#tag', value: '' });
    const clear = (last('fill').journal?.ev ?? []).find((e) => e.k === 'val');
    expect(clear, JSON.stringify(last('fill').journal)).toMatchObject({ f: 'textbox "Tag"', len: 0, h: valueHash(''), was: valueHash('BA-00004') });
    await run('fill', { target: '#tag', value: 'BA-00004' });
    const restore = (last('fill').journal?.ev ?? []).find((e) => e.k === 'val');
    expect(restore, JSON.stringify(last('fill').journal)).toMatchObject({ f: 'textbox "Tag"', h: valueHash('BA-00004'), was: valueHash('') });
  }, 90_000);

  it('a click that landed on an overlay says so', async () => {
    await run('goto', { url: `${app.url}/overlay` });
    await run('click', { target: '#under', timeout: 1500 });
    const click = last('click');
    const hits = (click.journal?.ev ?? []).filter((e) => e.k === 'hit');
    expect(hits.some((e) => e.on === 0 && String(e.cover).includes('Cover')), JSON.stringify(click.journal)).toBe(true);
  }, 90_000);

  it('a ticking clock is marked periodic once, not recorded as changes', async () => {
    await run('goto', { url: `${app.url}/?poll=1` });
    const n = steps().length;
    await sleep(2_000);
    await run('read', { target: '#status', what: 'text' });
    const clock = since(n).filter((e) => e.k === 'txt' && e.d === 'heading');
    expect(clock.length, JSON.stringify(clock)).toBeLessThanOrEqual(4);
    expect(clock.some((e) => e.per === 1)).toBe(true);
  }, 90_000);
});
