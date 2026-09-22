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
});
