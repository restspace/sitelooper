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

// fwod78 07-open: a kanban card's textless anchor, recorded as a path and a
// point; on replay the path reached the card's other anchor.
d('attribute rung for nameless controls (fwod78)', () => {
  let session: BrowserSession;
  const card = (jitter: boolean) => `<!doctype html><html><head><style>a.x{display:inline-block;width:30px;height:16px;background:#ccc;margin:2px}</style></head><body><div class="o_kanban">
    <div class="card">${jitter ? '<div class="ribbon"><a href="#" name="ribbon"></a></div>' : ''}
      <div><span>fwod78-n1 Bench Customer</span></div>
      <div class="actions">${jitter ? '<a href="#" name="action_b" class="x"><i class="fa"></i></a><a href="#" name="action_a" class="x"><i class="fa"></i></a>' : '<a href="#" name="action_a" class="x"><i class="fa"></i></a><a href="#" name="action_b" class="x"><i class="fa"></i></a>'}</div>
    </div>
    <div class="other"><a href="#" data-cid="view-3571" data-rec="45" class="x"><i class="fa"></i></a></div>
  </div></body></html>`;
  beforeAll(async () => {
    session = new BrowserSession({ session: `attrrung-${Date.now()}`, persist: false });
    const page = await session.getPage();
    let jitter = false;
    await page.route('http://app.test/**', (route) => route.fulfill({ contentType: 'text/html', body: card(jitter) }));
    (session as any).__jitter = (on: boolean) => (jitter = on);
  });
  afterAll(async () => {
    await session?.close();
  });

  const nameless = async (page: import('playwright-core').Page, selector: string) => {
    const ref = await page.locator(selector).evaluate((el) => el.getAttribute('name') ?? el.getAttribute('data-cid'));
    const snap = await snapshot(page, { full: true } as any);
    // every anchor here is a nameless `link`; pick the one the selector names by its order among links
    const links = [...snap.matchAll(/link \[(@e\d+)\]/g)].map((m) => m[1]);
    const index = await page.evaluate((sel) => Array.from(document.querySelectorAll('a')).indexOf(document.querySelector(sel)!), selector);
    return { ref: links[index], name: ref };
  };

  it('records a[name="action_b"] above the positional path, and the replay finds it after the card moves things', async () => {
    const { compileSkill: _unused, stableFirst } = await import('../src/skills/compile.js');
    const { resolveChain } = await import('../src/skills/replay.js');
    const page = await session.getPage();
    (session as any).__jitter(false);
    await page.goto('http://app.test/web?action=156&id=45');
    const { ref } = await nameless(page, 'a[name="action_b"]');
    const described = await describeTarget(page, ref);
    const exprs = described.chain!.map((c: any) => candidateExpr(c));
    const attrAt = exprs.findIndex((e) => e.includes('a[name=\\"action_b\\"]') || e.includes('a[name="action_b"]'));
    const pathAt = exprs.findIndex((e) => /nth-of-type/.test(e));
    expect(attrAt).toBeGreaterThanOrEqual(0);
    expect(pathAt).toBeGreaterThan(attrAt);
    // compile's ordering keeps it ahead of the path
    const ranked = stableFirst(described.chain as any).map((c: any) => candidateExpr(c));
    expect(ranked.findIndex((e) => e.includes('action_b'))).toBeLessThan(ranked.findIndex((e) => /nth-of-type/.test(e)));
    // the card re-renders with a ribbon link and its actions reordered
    (session as any).__jitter(true);
    await page.goto('http://app.test/web?action=156&id=45');
    const hit = await resolveChain(page, described.chain as any, {});
    expect(await hit!.locator.getAttribute('name')).toBe('action_b');
  }, 60_000);

  it('never builds the rung from a render counter or a number the url shows', async () => {
    const page = await session.getPage();
    (session as any).__jitter(false);
    await page.goto('http://app.test/web?action=156&id=45');
    const { ref } = await nameless(page, 'a[data-cid]');
    const described = await describeTarget(page, ref);
    const exprs = described.chain!.map((c: any) => candidateExpr(c)).join('\n');
    expect(exprs).not.toContain('view-3571');
    expect(exprs).not.toContain('data-rec');
  }, 60_000);
});
