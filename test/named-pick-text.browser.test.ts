/**
 * A key pick compiled as a named click (namedKeyPicks) carries the journal's
 * name, which is the option's TEXT. gitea's assignee option holds an avatar
 * whose `title` Playwright's role engine counts into the accessible name, so
 * the role candidate misses (fwgt37-dg 05-change, n1, n2 and n3); the
 * role-scoped exact-text candidate behind it finds the option.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/named-pick-text.browser.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { describeTarget } from '../src/daemon/recorder.js';
import { snapshot } from '../src/daemon/refs.js';
import { namedKeyPicks } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

// The menu as n2 read it (script entry 74), avatars reduced to a pixel.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MENU = `
  <a href="/bench-assignee">bench-assignee (Bench Assignee) profile</a>
  <div class="menu" id="_aria_dropdown_menu_39" role="listbox"><div class="scrolling menu">
    <div class="item clear-selection">Clear assignees</div>
    <a class="item" href="/bench/bench-repo/issues?assignee=1" data-value="1"><span class="item-check-mark"><svg aria-hidden="true"></svg></span>
      <img alt="" src="${PIXEL}" title="admin" width="20" height="20"> <span class="username-display">admin </span></a>
    <a class="item" href="/bench/bench-repo/issues?assignee=3" data-value="3" onclick="event.preventDefault(); this.classList.toggle('checked')"><span class="item-check-mark"><svg aria-hidden="true"></svg></span>
      <img alt="" src="${PIXEL}" title="Bench Assignee" width="20" height="20"> <span class="username-display">bench-assignee <span class="username-fullname">(Bench Assignee)</span></span></a>
  </div></div>`;

d('a named key pick finds its option by text when the role name differs', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `namedpick-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    await session?.close();
  });

  it('resolves the gitea assignee option, and only it', async () => {
    const page = await session.getPage();
    await page.setContent(MENU);
    const steps: SkillStep[] = [{ tool: 'press', args: { key: 'Enter' }, locators: {}, picks: { role: 'link', name: 'bench-assignee (Bench Assignee)' } }];
    const chain = namedKeyPicks(steps)[0].locators.target!;
    const { resolveChain } = await import('../src/skills/replay.js');
    const hit = await resolveChain(page, chain as any, {});
    expect(hit?.candidate.kind).toBe('css');
    await hit!.locator.click();
    expect(await page.locator('a[data-value="3"]').getAttribute('class')).toContain('checked');
    // The role candidate alone matches nothing here: the name is the avatar's title plus the text.
    expect(await page.getByRole('link', { name: 'bench-assignee (Bench Assignee)', exact: true }).count()).toBe(0);
  }, 30_000);

  // The recorder: a click on that option (or on the bulk menu's item, fwgt37-dg
  // #126) recorded no role candidate, only a generated id and a point.
  it('records the option by role and whole text where its role name misses', async () => {
    const page = await session.getPage();
    await page.setContent(MENU);
    const snap = await snapshot(page, { full: true } as any);
    const ref = /link "[^"]*bench-assignee \(Bench Assignee\)" \[(@e\d+)\]/.exec(snap)![1];
    const described = await describeTarget(page, ref);
    const chain = described.chain!;
    expect(chain[0]).toEqual({ kind: 'css', selector: 'role=link >> internal:has-text="bench-assignee (Bench Assignee)"s' });
    expect(described.verified).toBe(true);
    // A link whose role name holds is recorded by it, as before.
    const profile = /link "bench-assignee \(Bench Assignee\) profile" \[(@e\d+)\]/.exec(snap)![1];
    const plain = (await describeTarget(page, profile)).chain!;
    expect(plain[0]).toEqual({ kind: 'role', role: 'link', name: 'bench-assignee (Bench Assignee) profile' });
    expect(plain.some((c) => c.kind === 'css' && c.selector.includes('internal:has-text'))).toBe(false);
  }, 30_000);
});
