/**
 * A record a gesture took away is waited out before the next step reads the
 * page (StepExpectation.goneContains).
 *
 * repairdesk fwrd63 s_1758ad: "delete BOTH parts … verify both rows are gone".
 * The app deletes on the confirm and repaints the table a beat later; the
 * confirm compiled to a url pattern alone, so nothing waited, and the read
 * right after the second confirm published both rows where the recording had
 * read "No parts on this ticket yet." The fixture here repaints 900ms after the
 * confirm with NO live region and no request in flight — the case the
 * announcement hold (action.ts ACTION_ANNOUNCE_WAIT_MS) cannot see.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/gone-records.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import type { ReplayResult } from '../src/skills/replay.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const ORIGIN = 'http://gone.test';
const PAGE = `<!doctype html><html><body><main>
<h1>Ticket</h1>
<table><thead><tr><th>Name</th><th>Actions</th></tr></thead><tbody id="parts"></tbody></table>
<dialog id="confirm"><h2>Confirm</h2><p>Delete this part?</p><button id="no">Cancel</button><button id="yes">Delete part</button></dialog>
</main><script>
let parts = ['Bench Part A', 'Bench Part B'];
let pending = null;
function paint() {
  const body = document.getElementById('parts');
  body.innerHTML = parts.length
    ? parts.map((p, i) => '<tr><td>' + p + '</td><td><button data-i="' + i + '">Delete</button></td></tr>').join('')
    : '<tr><td colspan="2">No parts on this ticket yet.</td></tr>';
}
paint();
document.getElementById('parts').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  pending = parts[Number(b.dataset.i)];
  document.getElementById('confirm').showModal();
});
document.getElementById('no').addEventListener('click', () => document.getElementById('confirm').close());
document.getElementById('yes').addEventListener('click', () => {
  document.getElementById('confirm').close();
  const gone = pending;
  // Deleted now, repainted later: no request, no announcement.
  setTimeout(() => { parts = parts.filter((p) => p !== gone); paint(); }, 900);
});
</script></body></html>`;

function deleteSkill(id: string, gone: boolean): Skill {
  const confirm = (slot: string): SkillStep => ({
    tool: 'click',
    args: { target: '@e2' },
    locators: { target: [{ kind: 'role', role: 'button', name: 'Delete part' }] },
    expect: { lineDialect: 2, ...(gone ? { goneContains: [`- cell "{{${slot}}}"`] } : {}) },
  });
  const open = (slot: string): SkillStep => ({
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: [{ kind: 'scoped', container: 'tr', hasText: `{{${slot}}}`, selector: 'button' }] },
    expect: { addedContains: ['- dialog "Confirm"'], lineDialect: 2 },
  });
  return {
    id,
    origin: ORIGIN,
    template: 'delete both parts {{v1}} and {{v2}}',
    params: { v1: { example: 'Bench Part A', usedIn: [1], known: true }, v2: { example: 'Bench Part B', usedIn: [3], known: true } },
    preconditions: { urlPattern: `${ORIGIN}/ticket` },
    steps: [
      open('v1'),
      confirm('v1'),
      open('v2'),
      confirm('v2'),
      { tool: 'read', args: { target: 'tbody', what: 'text', label: 'parts_after' }, locators: { target: [{ kind: 'css', selector: 'tbody' }] }, label: 'parts_after' },
    ],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 'gone', instruction: 'delete both parts', created: 't' },
  };
}

d('a record the gesture took away is waited out', () => {
  let home: string;
  let session: BrowserSession;
  let page: Page;
  const dir = os.tmpdir();

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-gone-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    process.env.SITELOOPER_COMPONENTS_FILE = path.join(home, 'components.json');
    session = new BrowserSession({ session: `gone-${Date.now()}`, persist: false, learn: true });
    page = await session.getPage();
    await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  }, 60_000);
  afterAll(async () => {
    await session?.close();
    fs.rmSync(home, { recursive: true, force: true });
  });

  const run = async (skill: Skill) => {
    await page.goto(`${ORIGIN}/ticket`);
    session.learn!.put(skill);
    const out = await executeTool(session, 'run_skill', { id: skill.id, params: { v1: 'Bench Part A', v2: 'Bench Part B' } }, dir);
    return out.replay as ReplayResult;
  };

  it('the read after the second delete sees the table repainted', async () => {
    const replay = await run(deleteSkill('s_gone', true));
    expect(replay.ok, replay.reason).toBe(true);
    expect(replay.values.parts_after).toContain('No parts on this ticket yet.');
    expect(replay.values.parts_after).not.toContain('Bench Part');
  }, 60_000);

  it('without the recorded removal the same replay reads the stale table (the bug)', async () => {
    const replay = await run(deleteSkill('s_stale', false));
    expect(replay.values.parts_after ?? '').toContain('Bench Part');
  }, 60_000);
});
