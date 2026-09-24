/**
 * Vision at the tool layer (SITELOOPER_VISION=on): a screenshot is shown to the
 * model as a downscaled JPEG, never recorded; a page that shows a credential
 * value is not sent at all; a filled password field (masked by the browser)
 * is; VISION_AUTO attaches one after a state-changing action; off, nothing.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/vision.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import { clearImageStore, showsCredential, storedImage } from '../src/agent/vision.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const PAGE = `<!doctype html><html><head><title>Sign in</title></head><body style="margin:0">
<div style="height:120px;background:#c00">Dashboard</div>
<label for="pw">Password</label><input id="pw" type="password">
<button id="go" type="button" onclick="document.getElementById('out').textContent='Saved'">Save</button>
<p id="out"></p>
</body></html>`;

/** Width and height from a baseline JPEG's SOF0 marker. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

d('vision at the tool layer', () => {
  let home: string;
  let session: BrowserSession;
  const saved: Record<string, string | undefined> = {};
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, home);

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-vision-b-'));
    for (const k of ['SITELOOPER_HOME', 'SITELOOPER_VISION', 'SITELOOPER_VISION_AUTO', 'APP_PASSWORD']) saved[k] = process.env[k];
    process.env.SITELOOPER_HOME = home;
    process.env.APP_PASSWORD = 's3cret-pass';
    session = new BrowserSession({ session: 'vision', persist: false, learn: true });
    const page = await session.getPage();
    await page.setViewportSize({ width: 1600, height: 1000 });
    const file = path.join(home, 'page.html');
    fs.writeFileSync(file, PAGE);
    await page.goto(pathToFileURL(file).href);
    session.script!.beginInstruction('Check the dashboard.', { url: page.url() });
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearImageStore();
    delete process.env.SITELOOPER_VISION;
    delete process.env.SITELOOPER_VISION_AUTO;
  });

  it('off: a screenshot returns its path and no image', async () => {
    const out = await run('screenshot', { path: path.join(home, 'off.jpg') });
    expect(out.result).toBe(`screenshot saved: ${path.join(home, 'off.jpg')}`);
    expect(out.images).toBeUndefined();
  });

  it('on: the model gets the viewport as a JPEG scaled to 1280 wide; the saved file is untouched', async () => {
    process.env.SITELOOPER_VISION = 'on';
    const file = path.join(home, 'on.jpg');
    const out = await run('screenshot', { path: file });
    expect(out.result.split('\n')[0]).toBe(`screenshot saved: ${file}`);
    expect(out.images).toHaveLength(1);
    const img = storedImage(out.images![0])!;
    const bytes = Buffer.from(img.base64, 'base64');
    expect(img.mime).toBe('image/jpeg');
    expect(jpegSize(bytes)).toEqual({ width: 1280, height: 800 });
    expect(jpegSize(fs.readFileSync(file)).width).toBe(1600);
  });

  it('a filled password field is masked by the browser, so its page is sent; a page showing a credential value is not', async () => {
    process.env.SITELOOPER_VISION = 'on';
    const page = await session.getPage();
    await page.fill('#pw', 's3cret-pass');
    expect(await page.$eval('#pw', (el) => getComputedStyle(el).getPropertyValue('-webkit-text-security'))).toBe('disc');
    expect(await showsCredential(page)).toBe(false);
    expect((await run('screenshot', { path: path.join(home, 'masked.jpg') })).images).toHaveLength(1);
    // A "show password" toggle: the field becomes text.
    await page.$eval('#pw', (el) => ((el as HTMLInputElement).type = 'text'));
    const shown = await run('screenshot', { path: path.join(home, 'shown.jpg') });
    expect(shown.images).toBeUndefined();
    expect(shown.result).toContain('[image withheld: the page shows a credential value]');
    // A page style cannot unmask it: Chromium still draws bullets (checked by
    // eye on a 40px field), so the check does not look at password fields.
    await page.$eval('#pw', (el) => {
      (el as HTMLInputElement).type = 'password';
      (el as HTMLInputElement).value = '';
    });
    expect(await showsCredential(page)).toBe(false);
  });

  it('auto: a state-changing action carries a small screenshot only when VISION_AUTO is on', async () => {
    process.env.SITELOOPER_VISION = 'on';
    expect((await run('click', { target: '#go' })).images).toBeUndefined();
    process.env.SITELOOPER_VISION_AUTO = 'on';
    const out = await run('click', { target: '#go' });
    expect(out.images).toHaveLength(1);
    expect(jpegSize(Buffer.from(storedImage(out.images![0])!.base64, 'base64')).width).toBe(800);
    expect((await run('read', { target: '#out', what: 'text' })).images).toBeUndefined();
  });

  it('script.jsonl holds the screenshot steps with their paths and no image data', () => {
    const file = path.join(home, 'sessions', 'vision', 'script.jsonl');
    const text = fs.readFileSync(file, 'utf8');
    const shots = text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.k === 'step' && e.tool === 'screenshot');
    expect(shots.length).toBeGreaterThanOrEqual(3);
    for (const s of shots) expect(Object.keys(s.args)).toEqual(['path']);
    expect(text).not.toMatch(/base64|data:image|\/9j\/|"images"/);
  });
});
