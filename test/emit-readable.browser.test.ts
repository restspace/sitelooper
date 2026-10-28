/**
 * The readable style, run for real against a static fixture app served by
 * Playwright's own routing (no server, no container). Gated like the other
 * browser tests:
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/emit-readable.browser.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitReadableFlowFile } from '../src/spec/emit-readable.js';
import type { SpecFlow } from '../src/spec/ir.js';

const enabled = process.env.BP_BROWSER_TESTS === '1' && fs.existsSync(chromium.executablePath());
const d = enabled ? describe : describe.skip;

const ORIGIN = 'http://readable.test';
const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;
const PAGES: Record<string, string> = {
  '/': page(`<button id="menu" onclick="document.getElementById('m').hidden=!document.getElementById('m').hidden">Menu</button>
    <nav id="m" hidden><a href="/items/new">New item</a></nav>`),
  // A select2-like dropdown that is slow to start: its click handler is attached 1.5 s after load (a click
  // before that opens nothing), and its options arrive 1.2 s after it opens (an AJAX search).
  '/items/new': page(`<form action="/items/save"><label>Name <input name="name"></label>
    <input type="hidden" name="size" id="size"><span class="dd" tabindex="0">Choose a size</span><ul role="listbox" aria-label="Sizes" hidden></ul>
    <button>Save</button></form>
    <script>
      const dd = document.querySelector('.dd'), list = document.querySelector('[role=listbox]');
      setTimeout(() => dd.addEventListener('click', () => {
        list.hidden = !list.hidden;
        if (!list.hidden) setTimeout(() => { list.innerHTML = '<li role="option">Small</li><li role="option">Large</li>'; }, 1200);
      }), 1500);
      list.addEventListener('click', (e) => { document.getElementById('size').value = e.target.textContent; dd.textContent = e.target.textContent; list.hidden = true; });
    </script>`),
};

const toggle = [{ kind: 'css' as const, selector: '#menu' }];
const SPEC: SpecFlow = {
  version: 2, name: 'readable-browser', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: ['name'],
  steps: [
    {
      id: '01-create', instruction: 'Create an item named {{name}}', params: { v1: '{{name}}' }, outputs: [],
      segments: [
        { id: 's_aaaaaa', template: 't', params: {}, preconditions: { urlPattern: `${ORIGIN}/` }, steps: [
          { tool: 'click', args: {}, locators: { target: toggle }, expect: { addedContains: ['- link "New item"'] } },
          { tool: 'click', args: {}, locators: { target: toggle }, expect: { removedContains: ['- link "New item"'] } },
          { tool: 'click', args: {}, locators: { target: toggle }, expect: { addedContains: ['- link "New item"'] } },
          { tool: 'click', args: {}, locators: { target: [{ kind: 'role', role: 'link', name: 'New item' }] }, expect: { urlPattern: `${ORIGIN}/items/new` } },
        ] },
        { id: 's_bbbbbb', template: 't', params: {}, preconditions: { urlPattern: `${ORIGIN}/items/new` }, derived: { d1: { step: 4, at: 'p1', example: '42' } }, steps: [
          { tool: 'click', args: {}, locators: { target: [{ kind: 'css', selector: '.dd' }] }, expect: { addedContains: ['- listbox "Sizes"', '- option "Small"', '- option "Large"'] } },
          { tool: 'click', args: {}, locators: { target: [{ kind: 'role', role: 'option', name: 'Large' }] } },
          { tool: 'fill', args: { value: '{{v1}}' }, locators: { target: [{ kind: 'label', label: 'Name' }] } },
          { tool: 'click', args: {}, locators: { target: [{ kind: 'role', role: 'button', name: 'Save' }] }, expect: { urlPattern: `${ORIGIN}/items/{{d1}}`, alertContains: 'Success: × Item saved' }, mints: { at: 'p1' } },
        ] },
      ],
    },
    {
      id: '02-check', instruction: 'Open the item and read its title', params: { v1: '{{01-create.url.p1}}' }, outputs: ['title'],
      segments: [{ id: 's_cccccc', template: 't', params: {}, preconditions: { urlPattern: `${ORIGIN}/items/{{v1}}` }, steps: [
        { tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} },
        { tool: 'goto', args: { url: `${ORIGIN}/items/{{v1}}` }, locators: {} },
        { tool: 'read', args: { what: 'text' }, label: 'title', locators: { target: [{ kind: 'css', selector: 'h1' }] } },
      ] }],
    },
    {
      id: '03-assert', instruction: 'the item page shows {{name}}', params: { v1: '{{name}}' }, outputs: [], kind: 'assert',
      segments: [{ id: 's_dddddd', template: 't', params: {}, preconditions: { urlPattern: `${ORIGIN}/items/:id` }, assert: true, steps: [
        { tool: 'wait_for', args: { state: 'text_contains', text: '{{v1}}' }, assert: { message: 'the item page shows {{v1}}' }, locators: { target: [{ kind: 'css', selector: 'h1' }] } },
      ] }],
    },
  ],
};

d('readable style on a real page', () => {
  let browser: Browser;
  let dir: string;
  beforeAll(async () => {
    browser = await chromium.launch();
    dir = fs.mkdtempSync(path.resolve('test/.emit-readable-browser-'));
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs the emitted steps: toggle pruned, a slow dropdown picked, minted id captured and reused, read published, assertion held', async () => {
    const { source, diagnostics } = emitReadableFlowFile(SPEC, { compilerVersion: 't', bundleRelPath: null });
    expect(diagnostics).toEqual([]);
    expect(source).toContain("await pick(page, page.locator('.dd'), page.getByRole('option', { name: 'Large', exact: true }));");
    expect(source).not.toContain('// @step 01-create s_aaaaaa/1\n');
    const file = path.join(dir, 'flow.mjs');
    fs.writeFileSync(file, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
    const mod = await import(pathToFileURL(file).href);

    const context = await browser.newContext();
    let saved = '';
    await context.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/items/save') {
        saved = `${url.searchParams.get('name') ?? ''} (${url.searchParams.get('size') ?? ''})`;
        return route.fulfill({ contentType: 'text/html', body: page("<script>location.replace('/items/42')</script>") });
      }
      const item = /^\/items\/(\d+)$/.exec(url.pathname);
      if (item) {
        const name = saved;
        return route.fulfill({ contentType: 'text/html', body: page(`<div role="status">Success: <button>×</button> Item saved</div><h1>${name}</h1>`) });
      }
      return route.fulfill({ contentType: 'text/html', body: PAGES[url.pathname] ?? page('not found') });
    });
    const p = await context.newPage();
    try {
      // The race the pick is for: a plain click straight after load opens nothing, and the option never shows.
      await p.goto(`${ORIGIN}/items/new`);
      await p.locator('.dd').click();
      await expect(p.getByRole('option', { name: 'Large', exact: true }).waitFor({ timeout: 4_000 })).rejects.toThrow(/Timeout/);
      await p.goto(`${ORIGIN}/`);
      const ctx ={ vars: { name: 'Widget run-7' }, env: {}, outputs: {} as Record<string, string> };
      for (const id of mod.flowStepIds) await mod.steps[id](p, ctx);
      expect(ctx.outputs['01-create.url.p1']).toBe('42');
      expect(ctx.outputs['01-create.minted']).toBe('42');
      expect(ctx.outputs['02-check.title']).toBe('Widget run-7 (Large)');
      // …and an assertion that does not hold fails with its sentence.
      await expect(mod.steps['03-assert'](p, { vars: { name: 'Gadget' }, env: {}, outputs: {} })).rejects.toThrow(/assertion failed: the item page shows Gadget/);
    } finally {
      await context.close();
    }
  }, 60_000);
});
