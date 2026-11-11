/**
 * Two ways a zero-model replay used to report a step as done when the app did
 * not do it, each pinned by a ground-truth test (what the app actually did)
 * beside the verdict the replay gives. Both were confirmed as false passes
 * here before they were fixed; these are now the regression tests.
 *
 * (a) The navigation fallback stood in for clicks that were not navigation.
 *     A click whose target resolves nothing may be replaced by another link to
 *     the step's recorded destination, or a direct navigation there
 *     (src/execution/recover.ts). The only test was "a click with a recorded
 *     url the browser is not on" — which a Delete that redirects to its list
 *     satisfies as well as a plain link does — and on arrival replay returned
 *     'ran' with no gate asked. A renamed "Delete" button was replaced by the
 *     page's own "Tickets" link, and the replay reported ok with the ticket
 *     still there. Now only a click the recording shows as navigation and
 *     nothing else may be stood in for (recordedAsNavigation), and the page
 *     reached must show the lines carrying the run's own values (arrivalStop).
 *
 * (b) Effect lines were matched by substring.
 *     lineShows (src/execution/snapshot.ts) asked `all.includes(want)`, and a
 *     page line is `- role "name"`, then ` [checked]`, ` [disabled]`, then
 *     `: value` (renderLines) — so the line for less state is a prefix of the
 *     line for more. A recorded `- textbox "Total": 125` was "shown" by
 *     `- textbox "Total": 12500`, and a recorded `- checkbox "Notify"` by
 *     `- checkbox "Notify" [checked]`. The effect gate now matches a recorded
 *     line as a whole line (lineShows' `line`).
 *     Both (b) expectations are written by hand. A compile would wildcard a
 *     value its own step did not type (maskForeignValue), so the value case is
 *     the gate's rule in isolation, reachable from a recording through a
 *     fill, type or select step's own echo.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/replay-false-pass.browser.test.ts --pool=forks --poolOptions.forks.maxForks=1
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

const ORIGIN = 'http://falsepass.test';

function skillOf(id: string, urlPattern: string, params: Skill['params'], steps: SkillStep[]): Skill {
  return {
    id,
    origin: ORIGIN,
    template: `${id} ${Object.keys(params).map((k) => `{{${k}}}`).join(' ')}`.trim(),
    params,
    preconditions: { urlPattern },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 'falsepass', instruction: id, created: 't' },
  };
}

d('a replay that reports work the app did not do', () => {
  let home: string;
  let session: BrowserSession;
  let page: Page;
  const dir = os.tmpdir();

  // The app's own state, kept by the route handler below.
  let deleted = false;
  let deleteRequests = 0;
  let deleteLabel = 'Delete';
  let saveRequests = 0;
  let total = '125';
  let uncheckWorks = true;

  const detail = () => `<!doctype html><html><head><title>Ticket 15</title></head><body>
<nav><a href="/tickets">Tickets</a></nav>
<main><h1>Ticket 15</h1><p><a href="/tickets/15">Ticket 15</a></p>
<button id="del">${deleteLabel}</button></main>
<script>
document.getElementById('del').addEventListener('click', async () => {
  await fetch('/api/delete', { method: 'POST' });
  location.href = '/tickets';
});
</script></body></html>`;
  const edit = () => `<!doctype html><html><head><title>Edit ticket 15</title></head><body>
<main><h1>Edit ticket 15</h1><p><a href="/tickets/15">Cancel</a></p>
<button id="apply">Apply</button></main>
<script>
document.getElementById('apply').addEventListener('click', async () => {
  await fetch('/api/save', { method: 'POST' });
  location.href = '/tickets/15';
});
</script></body></html>`;
  const list = () => `<!doctype html><html><head><title>Tickets</title></head><body>
<nav><a href="/tickets">Tickets</a></nav>
<main><h1>Tickets</h1>${deleted ? '<p>No tickets.</p>' : '<ul><li><a href="/tickets/15">Ticket 15</a></li></ul>'}</main></body></html>`;
  const order = () => `<!doctype html><html><head><title>Order</title></head><body><main><h1>Order</h1>
<label>Total <input id="total" readonly value="0"></label>
<button id="recalc">Recalculate</button>
<label><input type="checkbox" id="notify" checked> Notify</label>
</main><script>
document.getElementById('recalc').addEventListener('click', () => { document.getElementById('total').value = ${JSON.stringify(total)}; });
document.getElementById('notify').addEventListener('click', (e) => { if (!${JSON.stringify(uncheckWorks)}) e.preventDefault(); });
</script></body></html>`;

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-falsepass-'));
    process.env.SITELOOPER_HOME = home;
    process.env.SITELOOPER_SKILLS_DIR = path.join(home, 'skills');
    process.env.SITELOOPER_COMPONENTS_FILE = path.join(home, 'components.json');
    session = new BrowserSession({ session: `falsepass-${Date.now()}`, persist: false, learn: true });
    page = await session.getPage();
    await page.route(`${ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/delete') {
        deleted = true;
        deleteRequests++;
        return route.fulfill({ status: 204, body: '' });
      }
      if (url.pathname === '/api/save') {
        saveRequests++;
        return route.fulfill({ status: 204, body: '' });
      }
      const body = url.pathname === '/tickets/15/edit' ? edit() : url.pathname === '/tickets/15' ? detail() : url.pathname === '/tickets' ? list() : order();
      return route.fulfill({ contentType: 'text/html', body });
    });
  }, 60_000);
  afterAll(async () => {
    await session?.close();
    fs.rmSync(home, { recursive: true, force: true });
  });

  const run = async (start: string, skill: Skill, params: Record<string, string> = {}) => {
    await page.goto(`${ORIGIN}${start}`);
    session.learn!.put(skill);
    const out = await executeTool(session, 'run_skill', { id: skill.id, params }, dir);
    return out.replay as ReplayResult;
  };

  describe('(a) a renamed Delete button, with another link to the page the delete landed on', () => {
    // Recorded on the ticket: click "Delete", land on the list, the ticket's link gone.
    const deleteSkill = (id: string) =>
      skillOf(id, `${ORIGIN}/tickets/15`, { v1: { example: 'Ticket 15', usedIn: [1], known: true } }, [
        {
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: [{ kind: 'role', role: 'button', name: 'Delete' }] },
          expect: { urlPattern: `${ORIGIN}/tickets`, goneContains: ['- link "{{v1}}"'], removedContains: ['- link "{{v1}}"'], removalRequired: true, lineDialect: 2 },
        },
      ]);
    let renamed: Promise<ReplayResult> | undefined;
    const replayRenamed = () =>
      (renamed ??= (async () => {
        deleted = false;
        deleteRequests = 0;
        deleteLabel = 'Remove ticket';
        return run('/tickets/15', deleteSkill('s_navfb1'), { v1: 'Ticket 15' });
      })());

    it('control: with the button as recorded, the replay deletes the ticket and says so', async () => {
      deleted = false;
      deleteRequests = 0;
      deleteLabel = 'Delete';
      const replay = await run('/tickets/15', deleteSkill('s_navfb0'), { v1: 'Ticket 15' });
      expect(replay.ok, replay.reason).toBe(true);
      expect(deleteRequests).toBe(1);
      expect(page.url()).toBe(`${ORIGIN}/tickets`);
    }, 60_000);

    it('ground truth: the app was never asked to delete, and no other link was clicked in its place', async () => {
      await replayRenamed();
      expect(deleteRequests).toBe(0);
      expect(deleted).toBe(false);
      // The browser never left the ticket: the page's "Tickets" link goes to
      // the recorded destination, and is not what the step was recorded doing.
      expect(page.url()).toBe(`${ORIGIN}/tickets/15`);
    }, 60_000);

    it('the replay does not report the delete as done', async () => {
      const replay = await replayRenamed();
      expect(replay.ok, 'a replay that deleted nothing reported the step as run').toBe(false);
      expect(replay.failedAt).toBe(1);
      expect(replay.reason).toContain('no element matched');
      expect(replay.warnings.join('\n')).not.toContain('recorded destination');
    }, 60_000);

    // What the fallback is FOR, and must go on doing: a link the recording
    // shows only moving, gone from the page, reached by the page's other link
    // to the same place — which then shows this run's own value as recorded.
    it('control: a renamed plain link is still reached by another link to its destination', async () => {
      deleted = false;
      const skill = skillOf('s_navfb2', `${ORIGIN}/tickets/15`, { v1: { example: 'Ticket 15', usedIn: [1], known: true } }, [
        {
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: [{ kind: 'role', role: 'link', name: 'Back to all tickets' }] },
          expect: { urlPattern: `${ORIGIN}/tickets`, addedContains: ['- link "{{v1}}"'], lineDialect: 2 },
        },
      ]);
      const replay = await run('/tickets/15', skill, { v1: 'Ticket 15' });
      expect(replay.ok, replay.reason).toBe(true);
      expect(page.url()).toBe(`${ORIGIN}/tickets`);
      expect(replay.fallthroughs).toBe(1);
      expect(replay.warnings.join('\n')).toContain('clicked another link to the recorded destination');
    }, 60_000);

    // A click recorded moving and nothing else that the recording can show —
    // but putting this run's own value on the page it landed on. Another link
    // reaches that page; it does not show the value, and the replay says so.
    it('a renamed Save reached by its Cancel link stops: the page reached never shows the saved title', async () => {
      saveRequests = 0;
      const skill = skillOf('s_navfb3', `${ORIGIN}/tickets/15/edit`, { v1: { example: 'Renamed ticket', usedIn: [1], known: true } }, [
        {
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: [{ kind: 'role', role: 'button', name: 'Save' }] },
          expect: { urlPattern: `${ORIGIN}/tickets/15`, addedContains: ['- link "{{v1}}"'], lineDialect: 2 },
        },
      ]);
      const replay = await run('/tickets/15/edit', skill, { v1: 'Renamed ticket' });
      expect(saveRequests).toBe(0);
      expect(replay.ok, 'a replay that saved nothing reported the step as run').toBe(false);
      expect(replay.acted).toBe(true);
      expect(replay.reason).toContain('clicked another link to the recorded destination');
      expect(replay.reason).toContain('did not show "- link \\"Renamed ticket\\""');
    }, 60_000);
  });

  describe('(b) an effect line that is a prefix of what the page shows', () => {
    // Recorded: click "Recalculate", and the Total field shows the caller's value.
    const recalcSkill = (id: string) =>
      skillOf(id, `${ORIGIN}/order`, { v1: { example: '125', usedIn: [1], known: true } }, [
        {
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: [{ kind: 'role', role: 'button', name: 'Recalculate' }] },
          expect: { addedContains: ['- textbox "Total": {{v1}}'] },
        },
      ]);
    // Recorded: click the checked "Notify" box, and it shows unchecked.
    const uncheckSkill = (id: string) =>
      skillOf(id, `${ORIGIN}/order`, {}, [
        {
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: [{ kind: 'role', role: 'checkbox', name: 'Notify' }] },
          expect: { addedContains: ['- checkbox "Notify"'] },
        },
      ]);

    it('control: the recorded value, shown exactly, passes; a different value stops', async () => {
      total = '125';
      const same = await run('/order', recalcSkill('s_sub0'), { v1: '125' });
      expect(same.ok, same.reason).toBe(true);
      total = '990';
      const other = await run('/order', recalcSkill('s_sub1'), { v1: '125' });
      expect(other.ok).toBe(false);
      expect(other.reason).toContain('did not show');
    }, 60_000);

    let longer: Promise<ReplayResult> | undefined;
    const replayLonger = () =>
      (longer ??= (async () => {
        total = '12500';
        return run('/order', recalcSkill('s_sub2'), { v1: '125' });
      })());

    it('ground truth: the app shows 12500 where 125 was recorded', async () => {
      await replayLonger();
      expect(await page.locator('#total').inputValue()).toBe('12500');
    }, 60_000);

    it('the replay does not accept 12500 as the recorded 125', async () => {
      const replay = await replayLonger();
      expect(replay.ok, 'a Total of 12500 satisfied the recorded "Total": 125').toBe(false);
    }, 60_000);

    let stuck: Promise<ReplayResult> | undefined;
    const replayStuck = () =>
      (stuck ??= (async () => {
        uncheckWorks = false;
        return run('/order', uncheckSkill('s_sub3'));
      })());

    it('control: an uncheck that works passes', async () => {
      uncheckWorks = true;
      const replay = await run('/order', uncheckSkill('s_sub4'));
      expect(replay.ok, replay.reason).toBe(true);
      expect(await page.locator('#notify').isChecked()).toBe(false);
    }, 60_000);

    it('ground truth: the box the app refused to uncheck is still checked', async () => {
      await replayStuck();
      expect(await page.locator('#notify').isChecked()).toBe(true);
    }, 60_000);

    it('the replay does not accept a still-checked box as the recorded unchecked one', async () => {
      const replay = await replayStuck();
      expect(replay.ok, 'a checked "Notify" satisfied the recorded unchecked "Notify"').toBe(false);
    }, 60_000);
  });
});
