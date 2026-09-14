/**
 * The structured observation (src/execution/snapshot.ts) against a real DOM.
 *
 * Two promises are pinned here. DIALECT 1 IS UNCHANGED: every stored
 * expectation compiled before dialects existed is matched against dialect-1
 * lines, so they must be the old capture's lines byte for byte — the old page
 * function is kept below, verbatim, as the oracle, and both are run against
 * the same live page. DIALECT 2 SEES WHAT DIALECT 1 COULD NOT (ROBUSTNESS.md
 * finding 4): a `<label for>` name, disabled state, open shadow roots, and
 * rendered frames, same- and cross-origin — and the coverage says when a look
 * cannot establish absence.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/observation.browser.test.ts
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import {
  SNAPSHOT_LIMITS,
  captureLines,
  coverageComplete,
  describeCoverage,
  isInteractiveLine,
  observePage,
  presence,
  renderAlerts,
  renderLines,
  type PageObservation,
} from '../src/execution/snapshot.js';
import { createFixtureServer, type FixtureServer } from './fixture/server.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

/**
 * THE ORACLE: `describeInPage` exactly as src/execution/snapshot.ts carried it
 * before the structured observation replaced it. Do not edit it to make a
 * test pass — a difference is a dialect-1 line that changed under every
 * stored recording.
 */
function describeInPage(opts: {
  maxAlerts: number;
  maxAlertChars: number;
  maxNodes: number;
  maxLines: number;
}): { lines: string[]; alerts: string[] } {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

  const roleOf = (el: Element): string | null => {
    const explicit = clean(el.getAttribute('role'));
    if (explicit) return explicit.split(' ')[0];
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (tag === 'select') return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'option') return 'option';
    if (tag === 'td' || tag === 'th') return 'cell';
    if (tag === 'tr') return 'row';
    if (tag === 'dialog') return 'dialog';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'search') return 'searchbox';
      if (type === 'number') return 'spinbutton';
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
      if (type === 'hidden' || type === 'file') return null;
      return 'textbox';
    }
    return null;
  };

  const nameOf = (el: Element): string => {
    const labelledBy = el.getAttribute('aria-labelledby');
    const fromIds = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
          .join(' ')
      : '';
    const own = clean(
      el.getAttribute('aria-label') ||
        fromIds ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder'),
    );
    if (own) return own.slice(0, 80);
    const label = clean(el.closest('label')?.textContent);
    if (label) return label.slice(0, 80);
    // Only a short subtree reads as this element's own name; anything longer is
    // a container's text and would make the line churn on unrelated changes.
    const text = clean((el as HTMLElement).innerText);
    return text.length <= 80 ? text : '';
  };

  const lines: string[] = [];
  const all = Array.from(document.querySelectorAll('*')).slice(0, opts.maxNodes);
  for (const el of all) {
    if (lines.length >= opts.maxLines) break;
    const role = roleOf(el);
    if (!role) continue;
    if (el.getClientRects().length === 0) continue;
    let line = `- ${role} ${JSON.stringify(nameOf(el))}`;
    const input = el as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') {
      line += input.checked ? ' [checked]' : '';
    } else if (typeof input.value === 'string' && input.value) {
      line += `: ${clean(input.value).slice(0, 80)}`;
    }
    lines.push(line);
  }

  const alerts = Array.from(document.querySelectorAll('[role=alert],[role=status]'))
    .filter((el) => el.getClientRects().length > 0)
    .slice(0, opts.maxAlerts)
    .map((el) => clean((el as HTMLElement).innerText).slice(0, opts.maxAlertChars))
    .filter((text) => text.length > 0);

  return { lines, alerts };
}

const fixtureFile = (name: string) => pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture', name)).href;

d('the structured observation (real browser)', () => {
  let fx: FixtureServer;
  let other: FixtureServer;
  let session: BrowserSession;
  let page: Page;
  /** The second server by a different HOST, so its frame is cross-origin and cross-site (an out-of-process iframe). */
  let cross: string;

  beforeAll(async () => {
    fx = await createFixtureServer(3);
    other = await createFixtureServer(0);
    cross = other.origin.replace('127.0.0.1', 'localhost');
    session = new BrowserSession({ session: `observe-${Date.now()}`, persist: false });
    page = await session.getPage();
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await fx?.close();
    await other?.close();
  });

  const open = async (url: string) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle').catch(() => {});
  };

  /** One look through each function, back to back, on the same page. */
  const bothOf = async (): Promise<{ old: { lines: string[]; alerts: string[] }; o: PageObservation }> => {
    const old = await page.evaluate(describeInPage, SNAPSHOT_LIMITS);
    const o = await observePage(page);
    expect(o, 'the observation came back null').not.toBeNull();
    return { old, o: o! };
  };

  it('renders dialect 1 byte-identical to the old capture, across the fixture pages', async () => {
    const pages = [
      `${fx.origin}/`,
      `${fx.origin}/record/rec-42`,
      `${fx.origin}/project/open`,
      `${fx.origin}/discard/dirty`,
      `${fx.origin}/rows`,
      `${fx.origin}/editor`,
      `${fx.origin}/controls`,
      `${fx.origin}/menu/open`,
      `${fx.origin}/create/form`,
      `${fx.origin}/embed/ok`,
      `${fx.origin}/observe`,
      `${fx.origin}/observe?cross=${encodeURIComponent(cross)}`,
      // past the element cap, and past the line cap: the caps are where a
      // rewritten loop would drift first
      `${fx.origin}/observe?pad=5000`,
      `${fx.origin}/observe?many=450&grid=0`,
      fixtureFile('page.html'),
      fixtureFile('detail.html'),
      fixtureFile('components.html'),
    ];
    for (const url of pages) {
      await open(url);
      const { old, o } = await bothOf();
      expect(renderLines(o, 1), url).toEqual(old.lines.filter(isInteractiveLine));
      expect(renderAlerts(o, 1), url).toEqual(old.alerts);
    }
    // and after the page's own state changes (a typed value, a toggled checkbox, an open dialog)
    await open(`${fx.origin}/observe`);
    await page.fill('#email', 'typed@x.test');
    await page.uncheck('#remember');
    const typed = await bothOf();
    expect(renderLines(typed.o, 1)).toEqual(typed.old.lines.filter(isInteractiveLine));
    await open(`${fx.origin}/discard/dirty`);
    await page.click('#exit');
    const dialog = await bothOf();
    expect(renderLines(dialog.o, 1)).toEqual(dialog.old.lines.filter(isInteractiveLine));
  }, 120_000);

  it('renders in dialect 2 what dialect 1 could not see: labels, disabled state, open shadow roots and rendered frames', async () => {
    await open(`${fx.origin}/observe?cross=${encodeURIComponent(cross)}`);
    const { o } = await bothOf();
    const v1 = renderLines(o, 1);
    const v2 = renderLines(o, 2);

    // the <label for> input: unnamed in dialect 1, named in dialect 2
    expect(v1).toContain('- textbox "": a@b.test');
    expect(v2).toContain('- textbox "Email": a@b.test');
    expect(v2).toContain('- checkbox "Remember" [checked]');
    // disabled, natively and by aria
    expect(v1).toContain('- button "Disabled save"');
    expect(v2).toContain('- button "Disabled save" [disabled]');
    expect(v2).toContain('- button "Soft disabled" [disabled]');
    // the open shadow root, with an aria-labelledby resolved in the shadow root's own id space
    expect(v2).toContain('- button "Shadow action"');
    expect(v2).toContain('- textbox "Shadow field"');
    expect(v1.some((l) => l.includes('Shadow'))).toBe(false);
    expect(o.nodes.find((n) => n.name === 'Shadow action')?.context).toEqual({ frame: [], shadow: ['x-panel#panel'] });
    // both rendered frames — same-origin and cross-origin — and not the hidden one
    expect(v2).toContain('- button "Frame button"');
    expect(v2).toContain('- button "Cross button"');
    expect(v2.some((l) => l.includes('Hidden button'))).toBe(false);
    expect(v1.some((l) => l.includes('Frame button') || l.includes('Cross button'))).toBe(false);
    expect(o.nodes.find((n) => n.name === 'Frame button')?.context.frame).toEqual([0]);
    expect(o.coverage.frames).toMatchObject({ observed: 2, hidden: 1, overCap: 0, inaccessible: [] });
    // live regions: the shadow toast is dialect 2's
    expect(renderAlerts(o, 1)).toEqual(['Saved']);
    expect(renderAlerts(o, 2)).toEqual(['Saved', 'Shadow toast']);
    // the grid says 500 rows and renders 20: partial, and so not a look that proves absence
    expect(o.coverage.collections.partial).toBe(true);
    expect(o.coverage.collections.evidence).toContain("grid 'Orders' 20/500");
    expect(coverageComplete(o.coverage)).toBe(false);
    expect(await presence(page, ['- row "Order 400"'], 2)).toBe('unknown');
    expect(await presence(page, ['- button "Cross button"'], 2)).toBe('present');
  }, 60_000);

  it('answers absent only on a look that covered the page, and unknown past the element or line cap', async () => {
    await open(`${fx.origin}/observe?grid=0`);
    const whole = await captureLines(page, 2);
    expect(whole?.complete, describeCoverage(whole!.coverage)).toBe(true);
    expect(await presence(page, ['- button "Nowhere"'], 2)).toBe('absent');
    expect(await presence(page, ['- button "Late"'], 2)).toBe('present');

    // 5,000 elements ahead of Late: past the element cap, so Late is not seen —
    // and its absence is not claimed
    await open(`${fx.origin}/observe?grid=0&pad=5000`);
    const padded = await captureLines(page, 2);
    expect(padded?.coverage.nodesTruncated).toBe(true);
    expect(padded?.complete).toBe(false);
    expect(padded?.lines).not.toContain('- button "Late"');
    expect(await presence(page, ['- button "Late"'], 2)).toBe('unknown');
    expect(await presence(page, ['- button "Late"'], 1)).toBe('unknown');

    await open(`${fx.origin}/observe?grid=0&many=450`);
    const many = await captureLines(page, 2);
    expect(many?.coverage.linesTruncated).toBe(true);
    expect(await presence(page, ['- button "Nowhere"'], 2)).toBe('unknown');
  }, 60_000);

  it('records a visible frame it could not read as a gap, never as an empty frame', async () => {
    await open(`${fx.origin}/observe?grid=0`);
    // A cross-site frame (its own renderer process, so the page itself stays
    // responsive) whose document never answers: its script spins forever.
    await page.evaluate((src) => {
      const f = document.createElement('iframe');
      f.style.width = '100px';
      f.style.height = '40px';
      f.src = src;
      document.body.appendChild(f);
    }, `${cross}/observe/stuck`);
    await page.waitForTimeout(1_000);
    const o = await observePage(page);
    expect(o).not.toBeNull();
    expect(o!.coverage.frames.inaccessible.length).toBe(1);
    expect(coverageComplete(o!.coverage)).toBe(false);
    expect(describeCoverage(o!.coverage)).toMatch(/1 visible frame\(s\) could not be read/);
  }, 60_000);
});
