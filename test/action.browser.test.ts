/**
 * Waiting on action-specific evidence, in a real browser (notes/ROBUSTNESS.md
 * finding 6). Browser-gated:
 *   BP_BROWSER_TESTS=1 npx vitest run test/action.browser.test.ts
 * Every case asserts what the fixture APPLICATION logged or rendered, not only
 * what a runner reported; the time bounds are generous ceilings that tell a
 * settled wait from a deadline paid, never tight measurements.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import type { ReplayResult } from '../src/skills/replay.js';
import type { Skill } from '../src/skills/store.js';
import { createFixtureServer, type FixtureServer } from './fixture/server.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

d('action observation (real page)', () => {
  let fx: FixtureServer;
  let home: string;
  let session: BrowserSession;
  const dir = os.tmpdir();

  beforeAll(async () => {
    fx = await createFixtureServer(0);
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-action-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    process.env.SITELOOPER_COMPONENTS_FILE = path.join(home, 'components.json');
    session = new BrowserSession({ session: `action-${Date.now()}`, persist: false, learn: true });
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await fx?.close();
    fs.rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => fx.reset(0));

  const open = async (route: string) => {
    const page = await session.getPage();
    await page.goto(`${fx.origin}${route}`);
    return page;
  };

  it('a debounced save is waited for: the fill result carries what the app answered', async () => {
    const page = await open('/debounce');
    const out = await executeTool(session, 'fill', { target: '#title', value: 'Hello' }, dir);
    expect(out.isError, out.result).toBe(false);
    // The save started 200ms after the input and answered 300ms later; the diff
    // was taken after it, so it shows the rendered answer.
    expect(fx.log).toEqual(['save:Hello']);
    expect(out.result).toContain('Saved: Hello');
    expect(await page.locator('h2').textContent()).toBe('Saved: Hello');
  }, 60_000);

  it('a replayed fill with a recorded effect waits for it and is effect-verified', async () => {
    await open('/debounce');
    const skill: Skill = {
      id: 's_debounce',
      origin: fx.origin,
      template: 'title the draft {{v1}}',
      params: { v1: { example: 'Hello', usedIn: [1], known: true } },
      preconditions: { urlPattern: `${fx.origin}/debounce` },
      steps: [{
        tool: 'fill',
        args: { target: '@e1', value: '{{v1}}' },
        locators: { target: [{ kind: 'role', role: 'textbox', name: 'Title' }] },
        expect: { addedContains: ['- heading "Saved: {{v1}}"'], lineDialect: 2 },
      }],
      stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
      status: 'validated',
      provenance: { session: 'action', instruction: 'title the draft', created: 't' },
    };
    session.learn!.put(skill);
    const out = await executeTool(session, 'run_skill', { id: skill.id, params: { v1: 'Replayed' } }, dir);
    const replay = out.replay as ReplayResult;
    expect(replay.ok, replay.reason ?? out.result).toBe(true);
    expect(replay.outcome).toBe('effect-verified');
    expect(fx.log).toEqual(['save:Replayed']);
  }, 60_000);

  it('a never-closing event stream does not stall a click whose effect is synchronous', async () => {
    await open('/live');
    const t0 = Date.now();
    const out = await executeTool(session, 'click', { target: '#refresh' }, dir);
    const elapsed = Date.now() - t0;
    expect(out.isError, out.result).toBe(false);
    expect(out.outcome).toBe('dispatched');
    expect(out.result).toContain('button "Refreshed"');
    expect(fx.log).toContain('mark:live');
    expect(fx.log).toContain('feed:open');
    // The stream is let go the moment its response says it streams: nowhere near
    // the 2s network cap, let alone the action deadline.
    expect(elapsed).toBeLessThan(1_900);
  }, 60_000);

  it('an ordinary request on a path named `notifications` is waited for', async () => {
    const page = await open('/notify');
    const out = await executeTool(session, 'click', { target: '#notify' }, dir);
    expect(out.isError, out.result).toBe(false);
    expect(fx.log).toEqual(['notify']);
    // Answered after 700ms; the state diff was taken after the answer rendered.
    expect(out.result).toContain('button "Dismiss notification"');
    expect(await page.locator('text=Dismiss notification').count()).toBe(1);
  }, 60_000);

  it('the deadline bounds the whole action: a click that lands late does not then wait out its request', async () => {
    const page = await open('/slowclick');
    const t0 = Date.now();
    const out = await executeTool(session, 'click', { target: '#start' }, dir, undefined, { deadlineMs: 3_000 });
    const elapsed = Date.now() - t0;
    expect(out.isError, out.result).toBe(false);
    // Landed once the overlay went (~2.5s), then settled only to the deadline,
    // not the 2s network cap after it, nor the request's 60s.
    expect(fx.log).toEqual(['slow:start']);
    expect(await page.locator('text=started').count()).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(2_400);
    expect(elapsed).toBeLessThan(6_000);
  }, 60_000);

  it('a click the deadline runs out on is NOT dispatched, and nothing reaches the app', async () => {
    await open('/slowclick?forever=1');
    const t0 = Date.now();
    const out = await executeTool(session, 'click', { target: '#start' }, dir, undefined, { deadlineMs: 2_000 });
    const elapsed = Date.now() - t0;
    expect(out.isError).toBe(true);
    expect(out.outcome).toBe('not-dispatched');
    expect(out.result).toMatch(/NOT dispatched: the action's deadline ran out.*\[outcome: not dispatched\]/s);
    expect(fx.log).toEqual([]);
    expect(elapsed).toBeLessThan(6_000); // not three 10s tiers and a re-render window
  }, 60_000);
});
