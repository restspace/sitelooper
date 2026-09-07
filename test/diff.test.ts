import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeTool } from '../src/agent/tools.js';
import { BrowserSession } from '../src/daemon/browser.js';
import { captureSignature, describeChange, diffSignatures, type PageSignature } from '../src/daemon/diff.js';
import { snapshot } from '../src/daemon/refs.js';

const sig = (over: Partial<PageSignature> = {}): PageSignature => ({
  url: 'https://app.test/',
  title: 'App',
  lines: [],
  alerts: [],
  ...over,
});

describe('diffSignatures', () => {
  it('reports added lines', () => {
    const out = diffSignatures(
      sig({ lines: ['- button "Save"'] }),
      sig({ lines: ['- button "Save"', '- option "Row 4"'] }),
    );
    expect(out).toBe('+ - option "Row 4"');
  });

  it('reports removed lines', () => {
    const out = diffSignatures(
      sig({ lines: ['- button "Save"', '- button "Cancel"'] }),
      sig({ lines: ['- button "Save"'] }),
    );
    expect(out).toBe('- - button "Cancel"');
  });

  it('reports a url change, with the new title when that changed too', () => {
    expect(diffSignatures(sig(), sig({ url: 'https://app.test/next' }))).toBe('url → https://app.test/next');
    expect(diffSignatures(sig(), sig({ url: 'https://app.test/next', title: 'Next' }))).toBe(
      'url → https://app.test/next — "Next"',
    );
  });

  it('surfaces alerts that appeared', () => {
    const out = diffSignatures(
      sig({ alerts: ['Loading'] }),
      sig({ alerts: ['Loading', 'Email is required'] }),
    );
    expect(out).toBe('alert: "Email is required"');
  });

  it('says so when nothing changed', () => {
    expect(diffSignatures(sig({ lines: ['- button "Save"'] }), sig({ lines: ['- button "Save"'] }))).toBe(
      'no visible change',
    );
  });

  it('treats a reordered line as no change (multiset compare)', () => {
    const before = sig({ lines: ['- button "A"', '- button "B"', '- button "C"'] });
    const after = sig({ lines: ['- button "C"', '- button "A"', '- button "B"'] });
    expect(diffSignatures(before, after)).toBe('no visible change');
  });

  it('counts duplicate lines, so one extra copy is one added line', () => {
    const before = sig({ lines: ['- cell "1"', '- cell "1"'] });
    const after = sig({ lines: ['- cell "1"', '- cell "1"', '- cell "1"'] });
    expect(diffSignatures(before, after)).toBe('+ - cell "1"');
  });

  // Roles spread thinly enough that the run-collapse below leaves them alone.
  const ROLES = ['button', 'link', 'textbox', 'checkbox', 'tab', 'menuitem', 'heading'];
  const spread = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => `- ${ROLES[i % ROLES.length]} "${tag} ${i}"`);

  it('falls back to a re-snapshot hint past the listing threshold', () => {
    const out = diffSignatures(sig(), sig({ lines: spread(14, 'new') }));
    expect(out).toBe('page changed substantially (~14 lines differ) — re-snapshot to see the new state');

    // exactly at the threshold it still lists
    const listed = diffSignatures(sig(), sig({ lines: spread(12, 'new') }));
    expect(listed).toContain('+ - link "new 8"');
    expect(listed).not.toContain('substantially');
  });

  // A table refresh is one fact, not forty. Before the collapse it read as
  // "page changed substantially", which cost the agent a whole snapshot turn
  // to learn that a list it was already looking at had repainted.
  it('collapses a repeated run to its first three plus a count', () => {
    const before = sig({ lines: Array.from({ length: 20 }, (_, i) => `- cell "old ${i}"`) });
    const after = sig({ lines: Array.from({ length: 20 }, (_, i) => `- cell "new ${i}"`) });
    const out = diffSignatures(before, after);
    expect(out).toContain('+ - cell "new 0"');
    expect(out).toContain('+ - cell "new 2"');
    expect(out).not.toContain('new 3"');
    expect(out).toContain('… and 17 more cell');
    expect(out).toContain('- - cell "old 0"');
    expect(out).toContain('… and 17 more cell');
    // and, because the collapse happens first, this is a SMALL diff
    expect(out).not.toContain('substantially');
  });

  it('leaves a run of six alone — only repetition past that is noise', () => {
    const out = diffSignatures(sig(), sig({ lines: Array.from({ length: 6 }, (_, i) => `- cell "c${i}"`) }));
    expect(out).toContain('+ - cell "c5"');
    expect(out).not.toContain('more cell');
  });

  it('collapses per role, so a new control beside a refreshed list still shows', () => {
    const after = sig({
      lines: [...Array.from({ length: 9 }, (_, i) => `- row "r${i}"`), '- button "Save"'],
    });
    const out = diffSignatures(sig(), after);
    expect(out).toContain('… and 6 more row');
    expect(out).toContain('+ - button "Save"');
  });

  it('describeChange flags a wholesale change and keeps the url/alert facts for it', () => {
    const change = describeChange(sig(), sig({ url: 'https://app.test/next', title: 'Next', lines: spread(14, 'new') }));
    expect(change.substantial).toBe(true);
    expect(change.urlChanged).toBe(true);
    expect(change.headline).toContain('url → https://app.test/next');
    expect(change.headline).toContain('page changed substantially');
    // the headline replaces the line list, so it never carries one
    expect(change.headline).not.toContain('+ -');

    const small = describeChange(sig(), sig({ lines: ['- button "Save"'] }));
    expect(small.substantial).toBe(false);
    expect(small.urlChanged).toBe(false);
    expect(small.nothingChanged).toBe(false);
    expect(small.headline).toBe(small.text);

    // "nothing changed" is the signal an action may simply not have landed yet
    expect(describeChange(sig(), sig()).nothingChanged).toBe(true);
  });

  it('clips long lines and the whole summary', () => {
    const long = (n: number) => `- ${ROLES[n % ROLES.length]} ${String(n).repeat(400)}`;
    const out = diffSignatures(sig(), sig({ lines: Array.from({ length: 12 }, (_, i) => long(i)) }));
    expect(out.length).toBeLessThan(900); // 700 budget + truncate's own note
    expect(out).toContain('truncated');
    expect(out).toContain('…');
  });
});

/**
 * Browser-backed: needs an installed Chrome/Edge, so opt-in like browser.test.ts.
 *   BP_BROWSER_TESTS=1 npx vitest run test/diff.test.ts
 */
const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><head><title>Diff fixture</title></head><body>
<h1>Diff fixture</h1>
<button id="add">Add row</button>
<button id="warn">Warn</button>
<ul id="rows" role="listbox"></ul>
<div id="alerts"></div>
<script>
  let n = 0;
  document.getElementById('add').addEventListener('click', () => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.textContent = 'Widget ' + (++n);
    document.getElementById('rows').appendChild(li);
  });
  document.getElementById('warn').addEventListener('click', () => {
    document.getElementById('alerts').innerHTML =
      '<div role="alert">Name is required</div>';
  });
</script>
</body></html>`;

const pageUrl = 'data:text/html,' + encodeURIComponent(PAGE);

d('post-action state diff (real page)', () => {
  let session: BrowserSession;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());

  beforeAll(async () => {
    process.env.SITELOOPER_HOME = path.join(os.tmpdir(), `bp-diff-test-${Date.now()}`);
    session = new BrowserSession({ session: 'diff', persist: false });
    await (await session.getPage()).goto(pageUrl);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
  });

  it('appends what the click added to the click result', async () => {
    const out = await run('click', { target: '#add' });
    expect(out.isError).toBe(false);
    expect(out.result).toContain('[state:');
    expect(out.result).toContain('Widget 1');
  }, 30_000);

  it('surfaces an alert that the action raised', async () => {
    const out = await run('click', { target: '#warn' });
    expect(out.result).toMatch(/alert: "Name is required"/);
  }, 30_000);

  it('says "no visible change" for an action that changed nothing', async () => {
    const out = await run('press', { key: 'Escape' });
    expect(out.result).toContain('[state: no visible change]');
  }, 30_000);

  // Regression guard: ariaSnapshot() re-mints Playwright's ref registry on
  // EVERY call (plain mode leaves it empty), so a capture built on it would
  // silently break the @refs the agent is still holding.
  it('leaves @refs from the last snapshot resolvable', async () => {
    const page = await session.getPage();
    const snap = await snapshot(page, { interactiveOnly: true });
    const ref = /button "Add row" \[@(e\d+)\]/.exec(snap)?.[1];
    expect(ref, 'snapshot should carry refs (needs Playwright 1.61+ ai mode)').toBeTruthy();

    const before = await captureSignature(page);
    expect(before).not.toBeNull();

    // the ref the agent still holds must survive the signature capture
    await page.locator(`aria-ref=${ref}`).click({ timeout: 5_000 });
    expect(await page.locator('#rows li').count()).toBeGreaterThan(1);
  }, 30_000);
});
