/**
 * A render-counter id (`opportunity-edit-3571`, a view numbered per render)
 * is not a css root: fwec2 recorded one as the primary of a Save click and it
 * missed on every replay. The recorder roots at the id's prefix instead, and
 * keeps a counter-shaped id whose number the page names elsewhere (a link, the
 * url) as a real id.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/counter-id.browser.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { candidateExpr, describeTarget } from '../src/daemon/recorder.js';
import { snapshot } from '../src/daemon/refs.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

d('counter-numbered ids', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `counterid-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    await session?.close();
  });

  it('roots the css path at the prefix of a render-counter id, never at the id', async () => {
    const page = await session.getPage();
    await page.setContent(`
      <div id="opportunity-edit-3571"><div><div><div>
        <div class="bar"><button type="button"><span aria-hidden="true"></span></button><button type="button">x</button></div>
      </div></div></div></div>`);
    const snap = await snapshot(page, { full: true } as any);
    const ref = /button \[(@e\d+)\]/.exec(snap)?.[1] ?? /button "[^"]*" \[(@e\d+)\]/.exec(snap)![1];
    const described = await describeTarget(page, ref);
    const exprs = described.chain!.map((c: any) => candidateExpr(c));
    expect(exprs.join('\n')).not.toContain('3571');
    expect(exprs.some((e) => e.includes('[id^=\\"opportunity-edit-\\"]') || e.includes('[id^="opportunity-edit-"]'))).toBe(true);
    // re-rendered under the next counter, the recorded chain still resolves
    await page.evaluate(() => {
      document.getElementById('opportunity-edit-3571')!.id = 'opportunity-edit-3958';
    });
    const { resolveChain } = await import('../src/skills/replay.js');
    const hit = await resolveChain(page, described.chain! as any, {});
    expect(hit && hit.candidate.kind).toBe('css');
  }, 30_000);

  it('keeps a counter-shaped id that a link inside it names as the record', async () => {
    const page = await session.getPage();
    await page.setContent(`
      <div id="issue-4521"><div><div><div><div>
        <a href="/issues/4521">Open</a><button type="button"><span aria-hidden="true"></span></button>
      </div></div></div></div></div>`);
    const snap = await snapshot(page, { full: true } as any);
    const ref = /button \[(@e\d+)\]/.exec(snap)![1];
    const described = await describeTarget(page, ref);
    const exprs = described.chain!.map((c: any) => candidateExpr(c));
    expect(exprs.some((e) => e.includes('#issue-4521'))).toBe(true);
  }, 30_000);

  // fwgh4: ember numbers every component per render; `#ember101` was a "New post" link.
  it('never records a glued ember counter as an id or a css root, and keeps the link by its name', async () => {
    const page = await session.getPage();
    await page.setContent(`<div id="ember37"><div><a id="ember101" href="/ghost/#/editor/post">New post</a></div></div>`);
    const snap = await snapshot(page, { full: true } as any);
    const ref = /link "New post" \[(@e\d+)\]/.exec(snap)![1];
    const described = await describeTarget(page, ref);
    const exprs = described.chain!.map((c: any) => candidateExpr(c));
    expect(exprs.join('\n')).not.toMatch(/ember\d/);
    expect(described.chain![0]).toMatchObject({ kind: 'role', role: 'link', name: 'New post' });
  }, 30_000);

  // fwgh5 s_8e130d: `#ember5` was the Sign in button's second candidate. One
  // digit is a counter only when the page numbers the same prefix again.
  it('treats a one-digit glued id as a counter when the page numbers its prefix again, and only then', async () => {
    const page = await session.getPage();
    const exprsOf = async (html: string, find: RegExp) => {
      await page.setContent(html);
      const snap = await snapshot(page, { full: true } as any);
      const described = await describeTarget(page, find.exec(snap)![1]);
      return described.chain!.map((c: any) => candidateExpr(c)).join('\n');
    };
    const family = await exprsOf(`<div id="ember3"><form><button id="ember5" type="submit">Sign in</button></form></div>`, /button "Sign in" \[(@e\d+)\]/);
    expect(family).not.toMatch(/ember\d/);
    // Alone on its page, a letter-then-digit id is a name: kept.
    const alone = await exprsOf(`<div><form><button id="col2" type="submit">Sign in</button></form></div>`, /button "Sign in" \[(@e\d+)\]/);
    expect(alone).toContain('#col2');
    const heading = await exprsOf(`<h1 id="h1">Title</h1><h2 id="intro">Intro</h2>`, /heading "Title"[^\n]*?\[(@e\d+)\]/);
    expect(heading).toContain('#h1');
  }, 30_000);

  // fwgh4 s_17f69b: the row anchor carried "a few seconds ago"; minutes later it must still resolve.
  it('resolves a scoped anchor recorded with a relative time on a row that has aged, in both runners', async () => {
    const { makeLocator } = await import('../src/daemon/recorder.js');
    const { candidateSource } = await import('../src/spec/locators.js');
    const { escapeRe } = await import('../src/shared/text.js');
    const page = await session.getPage();
    await page.setContent(`<ul>
      <li class="gh-list-row"><h3>Other Post</h3> <p>By Bench Admin - 2 minutes ago</p> <span>Draft</span></li>
      <li class="gh-list-row"><h3>Bench Post</h3>
        <p>By  Bench Admin -
        2 minutes ago</p> <span>Draft</span></li></ul>`);
    const recorded = { kind: 'scoped' as const, container: 'li.gh-list-row', hasText: '{{v2}} By Bench Admin - a few seconds ago Draft', selector: 'h3' };
    const daemon = makeLocator(page, { ...recorded, hasText: recorded.hasText.replace('{{v2}}', 'Bench Post') });
    expect(await daemon.count()).toBe(1);
    expect(await daemon.textContent()).toBe('Bench Post');
    const artifact = new Function('page', 'p', 'escapeRe', `return ${candidateSource(recorded)}`)(page, { v2: 'Bench Post' }, escapeRe);
    expect(await artifact.count()).toBe(1);
    expect(await artifact.textContent()).toBe('Bench Post');
  }, 30_000);
});
