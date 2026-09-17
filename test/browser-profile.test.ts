import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { profileEnv, profileFromEnv, resolveBrowserProfile } from '../src/daemon/browser.js';
import { DEFAULT_BROWSER_PROFILE, RECORDING_VIEWPORT, profileMismatch, readLiveBrowser } from '../src/execution/browser.js';
import { emitFlowFile, emitSpecFile } from '../src/spec/emit.js';
import { flowToSpec } from '../src/spec/ir.js';
import { SkillStore } from '../src/skills/store.js';
import type { Flow } from '../src/skills/flow.js';

/**
 * The browser a flow is recorded in travels with it: chosen when a session
 * starts (--viewport / --device), stored on the flow, applied by the compiled
 * spec's scaffold and judged by both runners. fwod39's compiled spec ran at
 * Playwright Test's 1280x720 default against a 1280x900 recording and missed
 * the steps daemon replay ran cleanly; a mobile flow is the same problem from
 * the other side.
 */
describe('resolveBrowserProfile: what --viewport and --device launch', () => {
  it('defaults to the window every session recorded in before the option existed', () => {
    expect(resolveBrowserProfile()).toEqual({ viewport: { ...RECORDING_VIEWPORT } });
    expect(resolveBrowserProfile()).toEqual(DEFAULT_BROWSER_PROFILE);
  });

  it('takes a size alone, with x or ×', () => {
    expect(resolveBrowserProfile({ viewport: '390x844' })).toEqual({ viewport: { width: 390, height: 844 } });
    expect(resolveBrowserProfile({ viewport: '1024 × 768' }).viewport).toEqual({ width: 1024, height: 768 });
  });

  it('takes a Playwright device whole: size, scale, touch, mobile and user agent', () => {
    const phone = resolveBrowserProfile({ device: 'iPhone 13' });
    expect(phone).toMatchObject({ device: 'iPhone 13', viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    expect(phone.userAgent).toContain('iPhone');
  });

  it('lets a size override a device’s window and nothing else', () => {
    const p = resolveBrowserProfile({ device: 'iPhone 13', viewport: '390x844' });
    expect(p.viewport).toEqual({ width: 390, height: 844 });
    expect(p.hasTouch).toBe(true);
  });

  it('refuses a size that does not parse and a device Playwright does not know, naming close matches', () => {
    expect(() => resolveBrowserProfile({ viewport: 'wide' })).toThrow('--viewport must be WIDTHxHEIGHT');
    expect(() => resolveBrowserProfile({ device: 'iPhone 99' })).toThrow(/unknown device "iPhone 99" — did you mean: .*iPhone 13/);
  });

  it('crosses to a spawned daemon through its environment and back unchanged', () => {
    const phone = resolveBrowserProfile({ device: 'Pixel 7' });
    expect(profileFromEnv(profileEnv(phone))).toEqual(phone);
    const sized = resolveBrowserProfile({ viewport: '800x600' });
    expect(profileFromEnv(profileEnv(sized))).toEqual(sized);
  });
});

describe('profileMismatch: the one judgement both runners make', () => {
  const phone = resolveBrowserProfile({ device: 'iPhone 13' });

  it('is silent when the browser is the recorded one', () => {
    expect(profileMismatch(DEFAULT_BROWSER_PROFILE, { viewport: { width: 1280, height: 900 } })).toBeNull();
    expect(profileMismatch(phone, { viewport: { ...phone.viewport }, userAgent: phone.userAgent, hasTouch: true })).toBeNull();
  });

  it('names the window it got and the one recorded (fwod39: 1280x720 against 1280x900)', () => {
    expect(profileMismatch(DEFAULT_BROWSER_PROFILE, { viewport: { width: 1280, height: 720 } })).toBe(
      'the browser has window 1280x720 (recorded 1280x900) — the flow was recorded at 1280x900, and locators that depend on layout may not hold',
    );
  });

  it('names the device facts a page can act on, and the device it was recorded on', () => {
    const desktop = { viewport: { width: 1280, height: 720 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome', hasTouch: false };
    const said = profileMismatch(phone, desktop)!;
    expect(said).toContain('window 1280x720 (recorded 390x664)');
    expect(said).toContain('a different user agent');
    expect(said).toContain('no touch input (recorded with)');
    expect(said).toContain('recorded on iPhone 13');
  });

  it('does not compare what the recording did not set, or what the page could not report', () => {
    expect(profileMismatch(DEFAULT_BROWSER_PROFILE, { viewport: { width: 1280, height: 900 }, userAgent: 'anything', hasTouch: true })).toBeNull();
    expect(profileMismatch(phone, { viewport: null })).toBeNull();
  });

  it('reads the live page the same way for both runners, and survives a page it cannot evaluate', async () => {
    const page = { viewportSize: () => ({ width: 390, height: 664 }), evaluate: async () => ({ userAgent: 'ua', hasTouch: true }) };
    expect(await readLiveBrowser(page as never)).toEqual({ viewport: { width: 390, height: 664 }, userAgent: 'ua', hasTouch: true });
    const dead = { viewportSize: () => null, evaluate: async () => Promise.reject(new Error('closed')) };
    expect(await readLiveBrowser(dead as never)).toEqual({ viewport: null });
  });
});

describe('the compiled artifact carries the recorded browser', () => {
  const phone = resolveBrowserProfile({ device: 'iPhone 13' });
  const flow: Flow = {
    name: 'mobile',
    origin: 'http://app.test',
    startUrl: 'http://app.test/',
    vars: [],
    steps: [],
    provenance: { session: 'test', created: new Date(0).toISOString() },
    browser: phone,
  };
  const { spec } = flowToSpec(flow, new SkillStore('test/.no-such-store'));
  const flowSource = emitFlowFile(spec, { tier: 'plain' }).source;
  const specSource = emitSpecFile(spec);

  it('keeps the flow’s profile in the spec IR', () => {
    expect(spec.browser).toEqual(phone);
  });

  it('exports the profile and its Playwright options, and applies them in the user’s file', () => {
    expect(flowSource).toContain(`export const RECORDED_BROWSER: BrowserProfile = ${JSON.stringify(phone)};`);
    expect(flowSource).toContain('"isMobile":true');
    expect(flowSource).not.toMatch(/export const RECORDED_USE = [^\n]*"device"/);
    expect(specSource).toContain('(iPhone 13)');
    expect(specSource).toContain('test.use(RECORDED_USE);');
  });

  it('judges the page before navigating, and never resizes it', () => {
    const at = flowSource.indexOf('const browserMismatch = profileMismatch(RECORDED_BROWSER, await readLiveBrowser(page));');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(flowSource.indexOf("await page.goto(options.startUrl ?? 'http://app.test/', { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });"));
    expect(flowSource).not.toContain('setViewportSize(RECORDED');
    expect(flowSource).toContain('run.warnings.push(browserMismatch);');
  });

  it('transpiles', () => {
    const out = ts.transpileModule(flowSource, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    expect((out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
  });
});
