/**
 * Stage 4 through the real tool layer: with SITELOOPER_JOURNAL_FEEDBACK=on a
 * gesture's tool result gains the journal's facts; with it off the result is
 * byte-identical to a run with no journal at all; and no credential text is
 * ever in it.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/journal-feedback.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import { clearSecretLedger } from '../src/shared/secrets.js';
import { startJournalApp } from './fixture/journal-app.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

d('journal feedback in tool results (stage 4)', () => {
  let home: string;
  let app: Awaited<ReturnType<typeof startJournalApp>>;
  const saved = { fb: process.env.SITELOOPER_JOURNAL_FEEDBACK, j: process.env.SITELOOPER_JOURNAL, pw: process.env.APP_PASSWORD };

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-journal-fb-'));
    process.env.SITELOOPER_HOME = home;
    app = await startJournalApp();
  }, 60_000);

  afterEach(() => {
    for (const [k, v] of [['SITELOOPER_JOURNAL_FEEDBACK', saved.fb], ['SITELOOPER_JOURNAL', saved.j], ['APP_PASSWORD', saved.pw]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearSecretLedger();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  /** One scripted session; the tool results, in order. */
  async function script(name: string, steps: [string, Record<string, unknown>][]): Promise<string[]> {
    const s = new BrowserSession({ session: name, persist: false, learn: true });
    s.script!.beginInstruction('feedback');
    const out: string[] = [];
    try {
      for (const [tool, args] of steps) out.push((await executeTool(s, tool, args, os.tmpdir())).result);
    } finally {
      await s.close();
    }
    return out;
  }

  it('on: the picker click says the listbox opened and no request was sent; the tick says the option is selected; the Save says its request', async () => {
    process.env.SITELOOPER_JOURNAL_FEEDBACK = 'on';
    const [, open, tick] = await script('fb-picker', [
      ['goto', { url: `${app.url}/picker` }],
      ['click', { target: '#open' }],
      ['click', { target: 'a[data-id="3"]' }],
    ]);
    expect(open).toMatch(/\njournal: .*listbox "Labels" opened/);
    expect(open).toMatch(/no request was sent/);
    expect(tick).toMatch(/'priority-high' is now selected/);
    const [, , save] = await script('fb-save', [
      ['goto', { url: `${app.url}/` }],
      ['fill', { target: '#title', value: 'Feedback title' }],
      ['click', { target: '#save' }],
    ]);
    expect(save).toMatch(/a request was sent: POST \/api\/save → 200/);
  }, 120_000);

  it('off: byte-identical to a session with no journal at all (after masking timings the page prints)', async () => {
    const steps: [string, Record<string, unknown>][] = [
      ['goto', { url: `${app.url}/picker` }],
      ['click', { target: '#open' }],
      ['click', { target: 'a[data-id="1"]' }],
      ['click', { target: '#elsewhere' }],
    ];
    delete process.env.SITELOOPER_JOURNAL_FEEDBACK;
    const withJournal = await script('fb-off', steps);
    process.env.SITELOOPER_JOURNAL = '0';
    const withoutJournal = await script('fb-none', steps);
    const mask = (r: string[]) => r.map((x) => x.replace(/127\.0\.0\.1:\d+/g, 'HOST').replace(/\d+ms/g, 'Nms'));
    expect(mask(withJournal)).toEqual(mask(withoutJournal));
    expect(withJournal.join('\n')).not.toContain('journal:');
  }, 120_000);

  it('no credential text: a password typed, and echoed by the page, never reaches the feedback', async () => {
    process.env.SITELOOPER_JOURNAL_FEEDBACK = 'on';
    process.env.APP_PASSWORD = 'Hunter2-secret-77';
    const results = await script('fb-secret', [
      ['goto', { url: `${app.url}/` }],
      ['fill', { target: '#title', value: '{{env:APP_PASSWORD}}' }],
      ['click', { target: '#save' }],
    ]);
    const all = results.join('\n');
    expect(all).toMatch(/journal: /);
    expect(all).not.toContain('Hunter2-secret-77');
  }, 120_000);
});
