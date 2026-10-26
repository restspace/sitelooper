import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitReadableFlowFile, NO_FALLBACK_WARNING } from '../src/spec/emit-readable.js';
import { emitSpecFile } from '../src/spec/emit.js';
import { findStepAnchor } from '../src/spec/check.js';
import { isReadableFlowFile, readableSource, readableSpecHash } from '../src/spec/lift.js';
import type { SpecFlow, SpecSegment, SpecStep } from '../src/spec/ir.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * The readable style (src/spec/emit-readable.ts): a compiled flow as plain
 * Playwright code. The primary fixture is the real SpecFlow of the Snipe-IT
 * pilot (cloud run sie2e1), whose runtime-style file was 17,700 lines.
 */
const SNIPEIT = JSON.parse(fs.readFileSync(path.resolve('test/fixture/readable-snipeit.spec.json'), 'utf8')) as SpecFlow;
const EXPECTED = path.resolve('test/fixture/readable-snipeit.flow.ts');
const OPTS = { compilerVersion: '0.8.0', bundleRelPath: '../.sitelooper/procedures.json' };
const emit = (spec: SpecFlow) => emitReadableFlowFile(spec, OPTS);

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.resolve('test/.emit-readable-'));
});
afterAll(() => {
  expect(path.basename(dir)).toMatch(/^\.emit-readable-/);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Type-check files against the repo's @playwright/test, as a consumer project would compile them. */
function typeErrors(files: Record<string, string>): string[] {
  const sub = fs.mkdtempSync(path.join(dir, 'tc-'));
  const paths = Object.entries(files).map(([name, source]) => {
    const p = path.join(sub, name);
    fs.writeFileSync(p, source);
    return p;
  });
  const program = ts.createProgram(paths, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file && d.start !== undefined ? `${path.basename(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1} ` : '';
    return where + ts.flattenDiagnosticMessageText(d.messageText, ' ');
  });
}

/** The emitted module, transpiled and imported (only what runs before any `test.*` call is exercised). */
async function load(source: string, name: string): Promise<Record<string, any>> {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

const lines = (source: string) => source.split('\n').map((l) => l.trim());

// --- small SpecFlow builders for the synthetic cases ---------------------------

const ORIGIN = 'http://app.test';
const role = (r: string, name: string) => ({ kind: 'role' as const, role: r, name });
const css = (selector: string) => ({ kind: 'css' as const, selector });
const point = { kind: 'point' as const, x: 1, y: 1, w: 1, h: 1, role: null, tag: 'div', vw: 1280, vh: 900 };

function seg(id: string, url: string, steps: SkillStep[], extra: Partial<SpecSegment> = {}): SpecSegment {
  return { id, template: id, params: {}, preconditions: { urlPattern: `${ORIGIN}${url}` }, steps, ...extra };
}
function flow(steps: SpecStep[], extra: Partial<SpecFlow> = {}): SpecFlow {
  return { version: 2, name: 'synthetic', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: [], steps, ...extra };
}
function fstep(id: string, segments: SpecSegment[], extra: Partial<SpecStep> = {}): SpecStep {
  return { id, instruction: `do ${id}`, params: {}, outputs: [], segments, ...extra };
}
const click = (target: unknown[], expect?: SkillStep['expect']): SkillStep => ({ tool: 'click', args: {}, locators: { target: target as never }, ...(expect ? { expect } : {}) });

describe('the Snipe-IT pilot', () => {
  const out = emit(SNIPEIT);

  it('compiles to the committed file, byte for byte, well under 250 lines', () => {
    expect(out.source).toBe(fs.readFileSync(EXPECTED, 'utf8'));
    expect(out.source.split('\n').length).toBeLessThan(250);
    expect(out.diagnostics).toEqual([]);
    expect(out.warnings[0]).toBe(NO_FALLBACK_WARNING);
  });

  it('is deterministic: the same SpecFlow (or a deep copy) gives identical source', () => {
    expect(emit(SNIPEIT).source).toBe(out.source);
    expect(emit(JSON.parse(JSON.stringify(SNIPEIT))).source).toBe(out.source);
  });

  it('type-checks against @playwright/test together with the unchanged runtime scaffold', () => {
    expect(typeErrors({ 'asset-checkout.flow.ts': out.source, 'asset-checkout.spec.ts': emitSpecFile(SNIPEIT) })).toEqual([]);
  }, 60_000);

  it('carries the header, marker and source line every tool detects it by', () => {
    const head = out.source.split('\n').slice(0, 4);
    expect(head[0]).toBe('// Generated by sitelooper 0.8.0 from flow "asset-checkout" (readable style) — regenerate, don\'t edit:');
    expect(head[1]).toBe('//   sitelooper compile asset-checkout --style readable');
    expect(head[2]).toBe('// @sitelooper-readable v1');
    expect(isReadableFlowFile(out.source)).toBe(true);
    expect(readableSource(out.source)).toEqual({ flow: 'asset-checkout', bundle: '../.sitelooper/procedures.json', specHash: readableSpecHash(SNIPEIT) });
    expect(out.source.match(/^import .*$/gm)).toEqual(["import { expect, test, type Page } from '@playwright/test';"]);
  });

  it('exports the metadata readiness parses, in its exact syntax', () => {
    const metadata = (name: string) => JSON.parse(out.source.match(new RegExp(`export const ${name} = (\\[[^;]*?\\]) as const;`))![1]);
    expect(metadata('flowStepIds')).toEqual(['01-signin', '02-create', '03-verify', '04-assert']);
    expect(metadata('requiredInputNames')).toEqual(['runid']);
    expect(metadata('requiredEnvNames')).toEqual(['E2E_ADMIN_PASSWORD', 'E2E_ADMIN_USERNAME']);
    for (const name of ['createFlowRun', 'runFlow', 'steps', 'BUDGET_MS', 'RECORDED_USE']) expect(out.source).toMatch(new RegExp(`export (?:async )?(?:function|const) ${name}\\b`));
    expect(out.source).toContain('export const RECORDED_USE = {"viewport":{"width":1280,"height":900}};');
  });

  it('writes relative urls: the recorded origin appears only as the last-resort fallback', () => {
    expect(out.source.split('http://127.0.0.1:8000').length - 1).toBe(1);
    expect(out.source).toContain("export const RECORDED_ORIGIN = 'http://127.0.0.1:8000';");
    const l = lines(out.source);
    expect(l).toContain('await expect(page).toHaveURL(/\\/hardware\\/create$/);');
    expect(l).toContain('await expect(page).toHaveURL(/:\\/\\/[^/]+\\/$/);');
    expect(l).toContain('await visit(page, `/hardware/${hardwareId}`);');
  });

  it("captures 02-create's minted asset id from the url and hands it to 03-verify as {{02-create.url.p1}}", () => {
    const l = lines(out.source);
    const at = l.indexOf('await expect(page).toHaveURL(/\\/hardware\\/(\\d+)$/);');
    expect(at).toBeGreaterThan(0);
    expect(l[at + 1]).toBe('const hardwareId = page.url().match(/\\/hardware\\/(\\d+)$/)![1];');
    expect(l).toContain("outputs['02-create.url.p1'] = hardwareId;");
    expect(l).toContain("const hardwareId = need(outputs, '02-create.url.p1', '03-verify');");
    expect(l).toContain('await page.locator(`.box-header a[href$="/hardware/${hardwareId}/checkout"]`).click();');
  });

  it('chooses one readable locator per action from the recorded evidence', () => {
    const l = lines(out.source);
    // The stored Playwright role selector vouches for the role candidate of the same name.
    expect(l).toContain("await page.getByRole('button', { name: 'Login', exact: true }).click();");
    // Recorded as ambiguous (nth 0): the first match is the one the recording acted on.
    expect(l).toContain("await page.getByRole('button', { name: 'Save', exact: true }).first().click();");
    // Only the primary was checked against the element; the label after it is unverified.
    expect(l).toContain('await page.locator(\'input[name="name"]\').fill(`${vars.runid} E2E Laptop`);');
    expect(l).toContain("await page.locator('.select2-container').nth(1).click();");
    expect(out.source).not.toMatch(/@[ef]\d+/);
    expect(out.source).not.toContain('.or(');
  });

  it('reads secrets from the environment and names no value', () => {
    expect(lines(out.source)).toContain("await page.getByRole('textbox', { name: 'Password', exact: true }).fill(env.E2E_ADMIN_PASSWORD);");
  });

  it('waits only where the recording shows the page moved or a submit raised an alert', () => {
    const l = lines(out.source);
    expect(l).toContain("await expect(page.getByText('You have successfully logged in.')).toBeVisible();");
    expect(l).toContain("await expect(page.getByText('Asset checked out successfully.')).toBeVisible();");
    // The option click's alert is not a submit's: no wait for it.
    expect(out.source).not.toContain('This asset can be checked out');
    // The checkout page's start pattern and its actions' expectations name one page: no url wait between them.
    expect(out.source.match(/toHaveURL\(/g)).toHaveLength(8);
    expect(out.source).toContain("await expect(page.locator('select[name=\"assigned_user\"]')).toBeVisible({ timeout: 8000 });");
  });

  it('keeps the reads a later step or the outputs use, and drops the report-only ones', () => {
    const published = [...out.source.matchAll(/outputs\['([^']+)'\] = /g)].map((m) => m[1]);
    expect(published).toEqual([
      '01-signin.dashboard_heading',
      '01-signin.final_url',
      '02-create.minted',
      '02-create.asset_page_url',
      '02-create.url.p1',
      '03-verify.asset_page_heading',
      '03-verify.checked_out_to',
    ]);
    // (read-back) targets, the title, and value reads of what 02-create typed
    expect(out.source).not.toMatch(/login_flash|page_title|asset_tag|item_1_value|purchase_date'\]|02-create\.asset_name/);
  });

  it('prunes the nav dropdown opened and closed with nothing between, and keeps the licenses detour', () => {
    expect(out.warnings).toContain('02-create: left out s_50255e/1, s_50255e/2 (toggle opened and closed again: the recording shows they changed nothing)');
    expect(out.source).not.toContain('// @step 02-create s_50255e/1\n');
    expect(out.source).not.toContain('// @step 02-create s_50255e/2\n');
    expect(out.source).toContain('// @step 02-create s_50255e/3\n');
    // A navigation away (to /licenses) followed by a goto somewhere ELSE than where it left (/hardware) is not a round trip.
    expect(out.source).toContain('// @step 03-verify s_130a91/1\n');
    expect(out.source).toContain('// @step 03-verify s_ead73d/1\n');
  });

  it("writes the assertion's checks as expects with its sentence, none skippable", () => {
    const l = lines(out.source);
    expect(l).toContain("const failed = `assertion failed: the page of the asset '${vars.runid} E2E Laptop' shows it is checked out to E2E Assignee`;");
    expect(l).toContain("await expect(page.getByRole('link', { name: 'E2E Assignee', exact: true }), failed).toHaveText('E2E Assignee', { useInnerText: true });");
    expect(l).toContain("await expect(page.getByRole('link', { name: 'E2E Assignee', exact: true }), failed).toBeVisible();");
    expect(l).toContain("await expect(page.locator('h1'), failed).toContainText(`${vars.runid} E2E Laptop`, { useInnerText: true });");
    expect(out.source).toContain('export const assertStepIds = ["04-assert"] as const;');
    const body = out.source.slice(out.source.indexOf('async function step04Assert'));
    expect(body.slice(0, body.indexOf('\n}\n'))).not.toMatch(/\b(?:if|catch|try)\b/);
  });

  it('puts a findStepAnchor-parsable @step marker above every action, and a [sitelooper step] line after each step', () => {
    const src = out.source.split('\n');
    const markers = src.map((l, i) => [l.trim(), i] as const).filter(([l]) => l.startsWith('// @step'));
    expect(markers.length).toBe(37);
    for (const [line, i] of markers) {
      expect(line).toMatch(/^\/\/ @step [\w-]+ s_[0-9a-f]{6}\/\d+$/);
      // The line under the marker (the action) anchors to it, as a stack frame there would.
      expect(findStepAnchor(out.source, i + 2)).toBe(line.slice('// @step '.length));
    }
    const at = src.findIndex((l) => l.includes("await page.getByRole('button', { name: 'Login', exact: true }).click();"));
    expect(findStepAnchor(out.source, at + 1)).toBe('01-signin s_6e55ea/3');
    for (const id of ['01-signin', '02-create', '03-verify', '04-assert']) {
      expect(out.source).toContain(`  console.log('[sitelooper step] ${id}');`);
    }
    expect(out.source).toContain("await test.step('01-signin: Sign in as {{env:E2E_ADMIN_USERNAME}} with password {{env:E2E_ADMIN_PASSWORD}} and verify the dashboard opens', () => step01Signin(page, ctx));");
  });

  it('budgets 30 s plus 10 s per action, capped at 10 minutes', () => {
    expect(out.source).toContain('export const BUDGET_MS = 400000;');
    const many = flow([fstep('01-a', [seg('s_aaaaaa', '/', Array.from({ length: 80 }, () => ({ tool: 'press', args: { key: 'Tab' }, locators: {} })))])]);
    expect(emit(many).source).toContain('export const BUDGET_MS = 600000;');
  });

  it('validates every missing input up front, before the browser goes anywhere', async () => {
    const mod = await load(out.source, 'snipeit');
    let navigated = false;
    const page = { goto: async () => { navigated = true; } };
    const saved = { u: process.env.E2E_ADMIN_USERNAME, p: process.env.E2E_ADMIN_PASSWORD };
    delete process.env.E2E_ADMIN_USERNAME;
    delete process.env.E2E_ADMIN_PASSWORD;
    try {
      await expect(mod.runFlow(page, { runid: '' })).rejects.toThrow('missing required flow inputs: RUNID, E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME');
      process.env.E2E_ADMIN_USERNAME = 'admin';
      await expect(mod.runFlow(page, { runid: 'r1' })).rejects.toThrow(/^missing required flow input: E2E_ADMIN_PASSWORD$/);
      expect(navigated).toBe(false);
      expect(mod.createFlowRun()).toEqual({ drift: [], warnings: [], echoed: [] });
      expect(Object.keys(mod.steps)).toEqual(['01-signin', '02-create', '03-verify', '04-assert']);
    } finally {
      for (const [k, v] of [['E2E_ADMIN_USERNAME', saved.u], ['E2E_ADMIN_PASSWORD', saved.p]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('stops a step whose reference was never published, naming it as converge reads it', async () => {
    const mod = await load(out.source, 'snipeit-need');
    await expect(mod.steps['03-verify']({}, { vars: { runid: 'r' }, env: {}, outputs: {} })).rejects.toThrow('03-verify needs {{02-create.url.p1}}, and this run never published it');
  });
});

describe('noise pruning only where the recording proves a no-op', () => {
  const menu = [css('#menu-toggle'), point];
  const opened = { addedContains: ['- link "Asset"', '- link "License"'] };
  const closed = { removedContains: ['- link "Asset"', '- link "License"'] };
  const go = click([role('link', 'Asset')], { urlPattern: `${ORIGIN}/asset/new` });
  const one = (steps: SkillStep[]) => emit(flow([fstep('01-a', [seg('s_aaaaaa', '/', steps)])]));
  const markers = (source: string) => [...source.matchAll(/\/\/ @step 01-a s_aaaaaa\/(\d+)/g)].map((m) => Number(m[1]));

  it('(a) drops a toggle opened and closed again on the same target', () => {
    const r = one([click(menu, opened), click(menu, closed), click(menu, opened), go]);
    expect(markers(r.source)).toEqual([3, 4]);
    expect(r.warnings.some((w) => w.includes('left out s_aaaaaa/1, s_aaaaaa/2 (toggle opened and closed again'))).toBe(true);
  });

  it('(a) near misses are kept: another target, other lines, or something between', () => {
    expect(markers(one([click(menu, opened), click([css('#other'), point], closed), go]).source)).toEqual([1, 2, 3]);
    expect(markers(one([click(menu, opened), click(menu, { removedContains: ['- link "Asset"'] }), go]).source)).toEqual([1, 2, 3]);
    const between: SkillStep = { tool: 'press', args: { key: 'Escape' }, locators: {} };
    expect(markers(one([click(menu, opened), between, click(menu, closed), go]).source)).toEqual([1, 2, 3, 4]);
    // A close that also navigated did something.
    expect(markers(one([click(menu, opened), click(menu, { ...closed, urlPattern: `${ORIGIN}/elsewhere` })]).source)).toEqual([1, 2]);
  });

  it('(b) drops a navigation away and a goto straight back with nothing done on the page between', () => {
    const away = click([css('header a.licenses')], { urlPattern: `${ORIGIN}/licenses` });
    const back: SkillStep = { tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} };
    const r = one([away, back, go]);
    expect(markers(r.source)).toEqual([3]);
    expect(r.warnings.some((w) => w.includes('navigated away and straight back'))).toBe(true);
  });

  it('(b) near misses are kept: a goto somewhere else, or a read on the page between', () => {
    const away = click([css('header a.licenses')], { urlPattern: `${ORIGIN}/licenses` });
    const elsewhere: SkillStep = { tool: 'goto', args: { url: `${ORIGIN}/hardware/1` }, locators: {} };
    expect(markers(one([away, elsewhere]).source)).toEqual([1, 2]);
    const back: SkillStep = { tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} };
    const read: SkillStep = { tool: 'read', args: { what: 'text' }, label: 'count', locators: { target: [css('.count')] } };
    const r = emit(flow([fstep('01-a', [seg('s_aaaaaa', '/', [away, read, back])], { outputs: ['count'] })]));
    expect(markers(r.source)).toEqual([1, 2, 3]);
  });
});

describe('every recorded tool', () => {
  const steps: SkillStep[] = [
    { tool: 'goto', args: { url: `${ORIGIN}/items?tab=all` }, locators: {} },
    { tool: 'goto', args: { url: 'https://other.example/login' }, locators: {} },
    { tool: 'back', args: {}, locators: {} },
    { tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [{ kind: 'label', label: 'Name' }] } },
    { tool: 'type', args: { text: 'hello', delay_ms: 20 }, locators: { target: [{ kind: 'placeholder', placeholder: 'Search' }] } },
    { tool: 'press', args: { key: 'Enter', target: 'x' }, locators: { target: [{ kind: 'testid', attr: 'data-testid', value: 'search' }] } },
    { tool: 'press', args: { key: 'Escape' }, locators: {} },
    { tool: 'select', args: { option: 'Large' }, locators: { target: [css('select#size')] } },
    { tool: 'check', args: { checked: false }, locators: { target: [role('checkbox', 'Agree')] } },
    { tool: 'hover', args: {}, locators: { target: [{ kind: 'text', text: 'Menu' }] } },
    { tool: 'dblclick', args: {}, locators: { target: [role('row', 'Item 1')] } },
    { tool: 'right_click', args: {}, locators: { target: [role('row', 'Item 1')] } },
    { tool: 'modifier_click', args: { modifiers: ['Shift'] }, locators: { target: [role('row', 'Item 2')] } },
    { tool: 'scroll_into_view', args: {}, locators: { target: [{ kind: 'id', selector: '#footer' }] } },
    { tool: 'upload', args: { paths: ['fixtures/a.png'] }, locators: { target: [css('input[type=file]')] } },
    { tool: 'download', args: {}, locators: { target: [role('link', 'Export')] } },
    { tool: 'drag', args: {}, locators: { source: [css('.card')], target: [css('.lane-2')] } },
    { tool: 'eval', args: { expression: 'window.scrollTo(0, 0)' }, locators: {} },
    { tool: 'dialog_expect', args: { action: 'accept' }, locators: {} },
    { tool: 'set_viewport', args: { width: 800, height: 600 }, locators: {} },
    { tool: 'set_offline', args: { offline: false }, locators: {} },
    { tool: 'screenshot', args: { path: 'x.png' }, locators: {} },
    { tool: 'click', args: {}, locators: { target: [{ kind: 'scoped', container: 'tr', hasText: '{{v1}}', selector: 'a.edit' }] } },
    { tool: 'click', args: {}, locators: { target: [role('button', 'Pay')] }, contexts: { target: { frame: [{ selectors: ['iframe[name="pay"]'] }] } } },
    { tool: 'click', args: {}, locators: { target: [role('link', 'Open report')] }, effect: { kind: 'popup' } },
    { tool: 'tabs', args: { switch_to: 0 }, locators: {} },
    { tool: 'read', args: { what: 'attr', attr: 'href' }, label: 'link', locators: { target: [css('a.permalink')] } },
    { tool: 'read', args: { what: 'count' }, label: 'rows', locators: { target: [css('tbody tr')] } },
    { tool: 'read', args: { what: 'title' }, label: 'title', locators: {} },
    {
      tool: 'loop', args: {}, locators: {}, while: [css('tr.draft')], max: 5, scope: 'drain',
      body: [{ tool: 'click', args: {}, locators: { target: [css('tr.draft button.delete')] } }],
    },
    { tool: 'wait_for', args: { state: 'hidden' }, locators: { target: [css('.spinner')] } },
    { tool: 'click', args: {}, locators: { target: [point] } },
    { tool: 'teleport', args: {}, locators: {} },
  ];
  const spec = flow(
    [
      fstep('01-sign', [seg('s_111111', '/login', [{ tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [role('textbox', 'Code')] } }])], { params: { v1: '{{totp:MFA_SEED}}' } }),
      fstep('02-all', [seg('s_222222', '/', steps)], { params: { v1: '{{name}}' }, outputs: ['link', 'rows', 'title'] }),
    ],
    { vars: ['name'] },
  );
  const out = emit(spec);
  const l = lines(out.source);

  it('writes one plain Playwright call per tool', () => {
    for (const line of [
      "await visit(page, '/items?tab=all');",
      "await page.goto('https://other.example/login');",
      'await page.goBack();',
      "await page.getByLabel('Name').fill(vars.name);",
      "await page.getByPlaceholder('Search').pressSequentially('hello', { delay: 20 });",
      "await page.getByTestId('search').press('Enter');",
      "await page.keyboard.press('Escape');",
      "await page.locator('select#size').selectOption('Large');",
      "await page.getByRole('checkbox', { name: 'Agree', exact: true }).uncheck();",
      "await page.getByText('Menu', { exact: true }).hover();",
      "await page.getByRole('row', { name: 'Item 1', exact: true }).dblclick();",
      "await page.getByRole('row', { name: 'Item 1', exact: true }).click({ button: 'right' });",
      "await page.getByRole('row', { name: 'Item 2', exact: true }).click({ modifiers: ['Shift'] });",
      "await page.locator('#footer').scrollIntoViewIfNeeded();",
      "await page.locator('input[type=file]').setInputFiles(['fixtures/a.png']);",
      "const download = page.waitForEvent('download');",
      "await page.locator('.card').dragTo(page.locator('.lane-2'));",
      "await page.evaluate('window.scrollTo(0, 0)');",
      "page.once('dialog', (dialog) => dialog.accept());",
      'await page.setViewportSize({ width: 800, height: 600 });',
      'await page.context().setOffline(false);',
      "await page.locator('tr', { hasText: vars.name }).locator('a.edit').click();",
      "await page.frameLocator('iframe[name=\"pay\"]').getByRole('button', { name: 'Pay', exact: true }).click();",
      "const popup = page.waitForEvent('popup');",
      'page = ctx.page = await popup;',
      'page = ctx.page = page.context().pages()[0];',
      "outputs['02-all.link'] = (await page.locator('a.permalink').getAttribute('href')) ?? '';",
      "outputs['02-all.rows'] = String(await page.locator('tbody tr').count());",
      "for (let pass = 0; pass < 5 && (await page.locator('tr.draft').count()) > 0; pass++) {",
      "await page.locator('tr.draft button.delete').first().click();",
      "await expect(page.locator('tr.draft')).toHaveCount(0);",
      "await expect(page.locator('.spinner')).toBeHidden();",
      "await page.getByRole('textbox', { name: 'Code', exact: true }).fill(await totp(env.MFA_SEED, 'MFA_SEED'));",
    ]) expect(l, line).toContain(line);
    expect(out.source).toContain('async function totp(seed: string, name: string)');
    expect(out.source).toContain('export const requiredEnvNames = ["MFA_SEED"] as const;');
  });

  it('never omits in silence: what has no plain form is a TODO, a throw and a diagnostic', () => {
    expect(out.source).toContain('// TODO: (click) has no locator a plain Playwright file can express (the recording kept only a position)');
    expect(out.source).toContain('// TODO: uses tool teleport, which has no plain Playwright form');
    expect(out.diagnostics.map((d) => [d.code, d.step])).toEqual([
      ['unsupported-capability', '02-all'],
      ['unsupported-capability', '02-all'],
    ]);
    expect(out.warnings.some((w) => w.includes('screenshot'))).toBe(true);
    // The title read is report-only.
    expect(out.source).not.toContain("outputs['02-all.title']");
  });

  it('type-checks, popups and tab switches included', () => {
    expect(typeErrors({ 'synthetic.flow.ts': out.source, 'synthetic.spec.ts': emitSpecFile(spec) })).toEqual([]);
    expect(out.source).toContain('export interface StepContext { vars: Vars; env: Env; outputs: Outputs; page?: Page }');
    expect(out.source).toContain('() => step02All(ctx.page ?? page, ctx)');
  }, 60_000);

  it('computes the TOTP code RFC 6238 gives for the test seed', async () => {
    const mod = await load(out.source.replace('async function totp(', 'export async function totp('), 'totp');
    const realNow = Date.now;
    // RFC 6238 appendix B, SHA-1, T = 59 s: 94287082 (8 digits) → 287082 (6 digits); seed "12345678901234567890" in base32.
    Date.now = () => 59_000 - 10_000;
    try {
      expect(await mod.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'MFA_SEED')).toBe(String(94287082 % 1e6).padStart(6, '0'));
    } finally {
      Date.now = realNow;
    }
  });
});

describe('references, minted values and url outputs', () => {
  it('publishes a consumed url part a step minted on a url it visited, and refuses a reference nothing can publish', () => {
    const create = fstep(
      '01-create',
      [
        seg('s_aaaaaa', '/tasks/new', [click([role('button', 'Save')], { urlPattern: `${ORIGIN}/tasks/{{d1}}` })], { derived: { d1: { step: 1, at: 'p1', example: 'abc12' } } }),
        seg('s_bbbbbb', '/tasks/{{d1}}', [
          click([role('link', 'Back to list')], { urlPattern: `${ORIGIN}/tasks` }),
          { tool: 'read', args: { what: 'text', target: '(read-back)' }, label: 'secret', locators: { target: [css('.x')] } },
        ]),
      ],
      { urlRoutes: { 'url.p1': `${ORIGIN} p0=tasks` } },
    );
    const use = fstep('02-open', [seg('s_cccccc', '/tasks', [{ tool: 'goto', args: { url: `${ORIGIN}/tasks/{{v1}}/edit` }, locators: {} }, { tool: 'fill', args: { value: '{{v2}}' }, locators: { target: [role('textbox', 'Ref')] } }])], {
      params: { v1: '{{01-create.url.p1}}', v2: '{{01-create.secret}}' },
    });
    const out = emit(flow([create, use]));
    const l = lines(out.source);
    expect(l).toContain('await expect(page).toHaveURL(/\\/tasks\\/([^/]+)$/);');
    expect(l).toContain('const taskId = page.url().match(/\\/tasks\\/([^/]+)$/)![1];');
    expect(l).toContain("outputs['01-create.url.p1'] = taskId;");
    // A consumed read is kept even when it is a read-back.
    expect(l).toContain("outputs['01-create.secret'] = (await page.locator('.x').innerText()).trim();");
    expect(l).toContain("const taskId = need(outputs, '01-create.url.p1', '02-open');");
    expect(l).toContain('await visit(page, `/tasks/${taskId}/edit`);');
    expect(l).toContain("await page.getByRole('textbox', { name: 'Ref', exact: true }).fill(secret);");
    expect(out.diagnostics).toEqual([]);

    const orphan = fstep('02-open', [seg('s_cccccc', '/tasks', [{ tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [role('textbox', 'Ref')] } }])], { params: { v1: '{{01-create.nothing}}' } });
    const refused = emit(flow([create, orphan]));
    expect(refused.diagnostics.map((d) => [d.code, d.step, d.severity])).toEqual([['unsourced-ref', '01-create', 'error']]);
    expect(refused.source).toContain('// TODO: publish 01-create.nothing');
  });

  it('refuses a slot the step acts by that the flow never binds', () => {
    const s = fstep('01-a', [seg('s_aaaaaa', '/', [{ tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [role('textbox', 'Name')] } }], { params: { v1: { example: 'run-1 thing', usedIn: [1], binding: 'var:runid' } } })]);
    const out = emit(flow([s]));
    expect(out.diagnostics.map((d) => [d.code, d.severity])).toEqual([['unbound-slot', 'error']]);
    expect(out.source).toContain("throw new Error('01-a: slot v1 has no flow binding — re-record this step');");
  });
});
