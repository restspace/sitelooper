/**
 * A record inside a semantic list item (kms.r-s.workers.dev, 2026-11-16).
 *
 * The KMS Pipeline board renders each column as `role="listitem"` and each
 * contact as a plain `<article>` card inside it. rowOf took the column as the
 * record row (el.closest found the listitem first), so the enrollment's
 * contact_name read-back was anchored as "the column containing 'Speaker f1'"
 * and the card picked by position (`article:nth-of-type(3)`). Replayed with
 * runid f2, the new card was fourth and the replay published "Test Speaker f1".
 * The card is the record: the nearest repeated container inside the listitem
 * that shows the identifying value.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/readback-card.browser.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { captureReadBack, describeLocator, makeLocator, setIdentityHints, type LocatorCandidate } from '../src/daemon/recorder.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

// The app marks the card just created with a modifier class and a badge
// (className `pl-card ${justAdded ? "just-added" : ""}`): its full class
// string differs from every sibling's.
const card = (name: string, i = 0, all: string[] = []) =>
  `<article class="pl-card ${i === all.length - 1 ? "just-added" : ""}"><button><span>${name}</span>${i === all.length - 1 ? "<span>Just added</span>" : ""}</button><div><label>Move ${name} to stage<select><option>Identified</option></select></label></div></article>`;
const board = (names: string[]) => `
  <main><div role="list">
    <section class="pl-column" role="listitem" aria-label="Identified column">
      <header><span>Identified</span><span>${names.length}</span></header>
      <div>${names.map(card).join('')}</div>
    </section>
    <section class="pl-column" role="listitem" aria-label="Contacted column">
      <header><span>Contacted</span><span>1</span></header>
      <div>${card('Ada Lovelace')}</div>
    </section>
  </div></main>`;

d('captureReadBack: a record card inside a list-item column', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `readback-card-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    setIdentityHints([]);
    await session?.close();
  });

  it('anchors the read-back on the card that shows the typed value, not by position in the column', async () => {
    const page = await session.getPage();
    await page.setContent(board(['Test Speaker K7', 'Test Speaker K8', 'Test Speaker f1']));
    setIdentityHints(['Test', 'Speaker f1', 'test.speaker.f1@example.com']);
    const step = await captureReadBack(page, 'Test Speaker f1', 'contact_name');
    expect(step).not.toBeNull();
    const chain = step!.locators.target.chain as LocatorCandidate[];
    const anchor = chain.find((c) => c.kind === 'scoped') as Extract<LocatorCandidate, { kind: 'scoped' }> | undefined;
    expect(anchor).toBeDefined();
    expect(anchor!.container).toMatch(/^article/);
    expect(anchor!.hasText).toBe('Speaker f1');
    expect(anchor!.selector ?? '').not.toMatch(/article:nth-of-type/);
    expect(chain[0]).toEqual(anchor);

    // The next run: this run's card sits below another one. The anchor, with
    // the run's value in it, finds that card and no other.
    await page.setContent(board(['Test Speaker K7', 'Test Speaker K8', 'Test Speaker f1', 'Test Speaker f2']));
    const next = makeLocator(page, { ...anchor!, hasText: 'Speaker f2' });
    expect(await next.count()).toBe(1);
    expect((await next.innerText()).trim()).toBe('Test Speaker f2');
  });

  it('finds the card in a column too long to be a row itself (kms j1: nine cards)', async () => {
    // rowAt gives up on a container over 400 characters. A column of nine
    // cards is that, and the card inside it was never looked for.
    const page = await session.getPage();
    const names = ['K7', 'K8', 'f1', 'f2', 'g1', 'h1', 'h2', 'i1', 'j1'].map((r) => `Test Speaker ${r}`);
    await page.setContent(board(names));
    expect((await page.locator('section.pl-column').first().innerText()).length).toBeGreaterThan(400);
    setIdentityHints(['Test', 'Speaker j1', 'test.speaker.j1@example.com']);
    const step = await captureReadBack(page, 'Test Speaker j1', 'contact_name');
    expect(step).not.toBeNull();
    const chain = step!.locators.target.chain as LocatorCandidate[];
    expect(chain[0]).toMatchObject({ kind: 'scoped', hasText: 'Speaker j1' });
    expect((chain[0] as Extract<LocatorCandidate, { kind: 'scoped' }>).container).toMatch(/^article/);
  });

  it('keeps a list row as the record when the element sits in one of its repeated cells', async () => {
    const page = await session.getPage();
    await page.setContent(`
      <ul>
        <li class="row"><span class="cell">rdx1-n1 RD Part A</span><span class="cell">$100.00</span></li>
        <li class="row"><span class="cell">rdx1-n1 RD Part B</span><span class="cell">$100.00</span></li>
      </ul>`);
    setIdentityHints(['rdx1-n1', 'rdx1-n1 RD Part B']);
    // The price shows in both rows: only the row says which one. The cell the
    // price sits in is repeated, but it does not show the identifying value,
    // so it never replaces the row.
    const price = page.locator('li.row').nth(1).locator('span.cell').nth(1);
    const described = await describeLocator(page, price, '@e9');
    const anchor = (described.chain ?? []).find((c) => c.kind === 'scoped') as Extract<LocatorCandidate, { kind: 'scoped' }> | undefined;
    expect(anchor).toBeDefined();
    expect(anchor!.container).toMatch(/^li/);
    expect(anchor!.hasText).toBe('rdx1-n1 RD Part B');
  });

  it('never takes a table cell as the record', async () => {
    const page = await session.getPage();
    await page.setContent(`
      <table><tbody>
        <tr><td>rdx2-n1 Bench Customer</td><td>Benchville</td></tr>
        <tr><td>Seed Customer</td><td>Otherton</td></tr>
      </tbody></table>`);
    setIdentityHints(['rdx2-n1 Bench Customer']);
    const step = await captureReadBack(page, 'Benchville', 'city');
    expect(step).not.toBeNull();
    const anchor = (step!.locators.target.chain as LocatorCandidate[]).find((c) => c.kind === 'scoped') as Extract<LocatorCandidate, { kind: 'scoped' }> | undefined;
    expect(anchor).toBeDefined();
    expect(anchor!.container).toMatch(/^tr/);
  });
});
