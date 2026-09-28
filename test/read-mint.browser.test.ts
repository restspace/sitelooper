/**
 * Replay binds a value the procedure READ and then typed from THIS run's read
 * (compile.ts mintedFill's read arm, skills/replay.ts): snipeit fwsi29-luna
 * 03-create read the create form's pre-filled asset tag, saved, and typed the
 * tag into "Lookup by Asset Tag". Each run's form carries its own tag.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/read-mint.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import type { Skill } from '../src/skills/store.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const ORIGIN = 'http://readmint.test';
const page = (tag: string) => `<!doctype html><html><body>
<form><label>Asset Tag <input id="asset_tag" value="${tag}"></label></form>
<label>Lookup by Asset Tag <input id="lookup"></label>
</body></html>`;

const skill: Skill = {
  id: 's_readmint',
  origin: ORIGIN,
  template: 'create an asset',
  params: {},
  preconditions: { urlPattern: `${ORIGIN}/hardware/create` },
  steps: [
    { tool: 'read', args: { target: '#asset_tag', what: 'value' }, locators: { target: [{ kind: 'css', selector: '#asset_tag' }] }, label: 'created_asset_tag' },
    { tool: 'fill', args: { target: '#lookup', value: '{{d1}}' }, locators: { target: [{ kind: 'css', selector: '#lookup' }] } },
  ],
  derived: { d1: { step: 1, at: '', example: 'BA-00004', read: 'created_asset_tag' } },
  stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
  status: 'validated',
  provenance: { session: 's', instruction: 'create an asset', created: 't' },
};

d('a read-minted value in a live replay', () => {
  let home: string;
  let session: BrowserSession;
  let tab: Page;
  const dir = os.tmpdir();

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-readmint-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    session = new BrowserSession({ session: `readmint-${Date.now()}`, persist: false, learn: true });
    tab = await session.getPage();
    await tab.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: page('BA-00077') }));
    session.learn!.put(skill);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    delete process.env.SITELOOPER_SKILLS_DIR;
    delete process.env.SITELOOPER_HOME;
  });

  it("types THIS run's tag, not the recording's", async () => {
    await tab.goto(`${ORIGIN}/hardware/create`);
    const out = await executeTool(session, 'run_skill', { id: skill.id, params: {} }, dir);
    expect(out.replay?.ok, out.result).toBe(true);
    expect(await tab.locator('#lookup').inputValue()).toBe('BA-00077');
    expect(out.replay?.derivedValues).toMatchObject({ d1: 'BA-00077' });
  }, 30_000);
});
