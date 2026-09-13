import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PageSignature } from '../src/daemon/diff.js';
import { SiteModel, controlFromTarget, controlKey, maskDigits, parseSignatureLine, siteModel } from '../src/skills/sitemap.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.SITELOOPER_SKILLS_DIR;
});

function sig(lines: string[], title = 'Orders', url = 'https://app.test/orders'): PageSignature {
  return { url, title, lines, alerts: [] };
}

describe('line parsing', () => {
  it('reads role and name, and never the value or state suffix', () => {
    expect(parseSignatureLine('- button "Save"')).toEqual({ role: 'button', name: 'Save' });
    expect(parseSignatureLine('- textbox "Order Reference": SO0042')).toEqual({ role: 'textbox', name: 'Order Reference' });
    expect(parseSignatureLine('- checkbox "Taxed" [checked]')).toEqual({ role: 'checkbox', name: 'Taxed' });
    expect(parseSignatureLine('- link "Say \\"hi\\""')).toEqual({ role: 'link', name: 'Say "hi"' });
  });

  it('skips nameless lines, data roles and junk', () => {
    expect(parseSignatureLine('- button ""')).toBeNull();
    expect(parseSignatureLine('- cell "1,042.00"')).toBeNull();
    expect(parseSignatureLine('- row "Order 1042 draft"')).toBeNull();
    expect(parseSignatureLine('not a line')).toBeNull();
  });
});

describe('digit masking', () => {
  it('collapses runs of 3+ digits but leaves short ones alone', () => {
    expect(maskDigits('Order 1042')).toBe('Order #');
    expect(maskDigits('Step 2 of 12')).toBe('Step 2 of 12');
    expect(controlKey('link', 'Order 1042')).toBe(controlKey('link', 'Order 1043'));
  });

  it('makes two records one control and one page template', () => {
    const model = new SiteModel(dir);
    model.observe('https://app.test/orders/1042', sig(['- link "Order 1042"'], 'Order 1042'));
    model.observe('https://app.test/orders/1043', sig(['- link "Order 1043"'], 'Order 1043'));
    const map = model.load('https://app.test');
    expect(Object.keys(map.pages)).toHaveLength(1);
    const page = Object.values(map.pages)[0];
    expect(page.seen).toBe(2);
    expect(page.title).toBe('Order #');
    expect(Object.keys(page.controls)).toEqual(['link "Order #"']);
    expect(page.controls['link "Order #"'].seen).toBe(2);
  });
});

describe('observe → render', () => {
  it('describes the page, its controls and how it was reached', () => {
    const model = new SiteModel(dir);
    for (let i = 0; i < 3; i++) {
      model.observe(
        'https://app.test/orders',
        sig(['- heading "Sales Orders"', '- button "Save"', '- link "Customer"', '- textbox "Search": draft'], 'Sales Orders'),
      );
    }
    const out = model.render('https://app.test/orders');
    expect(out.startsWith('[site] This page matches /orders seen 3×')).toBe(true);
    expect(out).toContain('("Sales Orders")');
    expect(out).toContain('Known controls here:');
    expect(out).toContain('button "Save"');
    expect(out).toContain('textbox "Search"');
    // Never a value: "draft" was an input value on the textbox line.
    expect(out).not.toContain('draft');
    expect(out).toContain('role=button[name="Save"]');
  });

  it('orders controls by how often they were seen, then by name', () => {
    const model = new SiteModel(dir);
    model.observe('https://app.test/orders', sig(['- button "Rare"', '- button "Common"', '- button "Also"']));
    model.observe('https://app.test/orders', sig(['- button "Common"', '- button "Also"']));
    const list = model.render('https://app.test/orders');
    expect(list.indexOf('"Also"')).toBeLessThan(list.indexOf('"Rare"'));
    expect(list.indexOf('"Common"')).toBeLessThan(list.indexOf('"Rare"'));
    // Equal counts fall back to name order: Also before Common.
    expect(list.indexOf('"Also"')).toBeLessThan(list.indexOf('"Common"'));
  });

  it('is empty for an unknown page, an unknown origin and a non-url', () => {
    const model = new SiteModel(dir);
    model.observe('https://app.test/orders', sig(['- button "Save"']));
    expect(model.render('')).toBe('');
    expect(model.render('https://other.test/orders')).toBe('');
    expect(model.render('https://app.test/settings')).toBe('');
    expect(model.render('not a url at all')).toBe('');
  });

  it('drops one-off controls only on a crowded page', () => {
    const model = new SiteModel(dir);
    const many = Array.from({ length: 14 }, (_, i) => `- button "Fixed ${String.fromCharCode(97 + i)}"`);
    model.observe('https://app.test/orders', sig(many));
    model.observe('https://app.test/orders', sig([...many, '- button "Transient toast"']));
    const out = model.render('https://app.test/orders');
    expect(out).toContain('Fixed a');
    expect(out).not.toContain('Transient toast');
  });
});

describe('transitions', () => {
  it('records the destination template and renders "stays" for a self-edge', () => {
    const model = new SiteModel(dir);
    model.observe('https://app.test/orders/1042', sig(['- button "Confirm"', '- link "Orders"'], 'Order #'));
    model.transition('https://app.test/orders/1042', { role: 'link', name: 'Orders' }, 'https://app.test/orders');
    model.transition('https://app.test/orders/1042', { role: 'button', name: 'Confirm' }, 'https://app.test/orders/1042');
    const out = model.render('https://app.test/orders/1042');
    expect(out).toContain('From here:');
    expect(out).toContain('click link "Orders" → /orders');
    expect(out).toContain('click button "Confirm" → stays');
  });

  it('counts a repeat and ignores a control with no name', () => {
    const model = new SiteModel(dir);
    model.transition('https://app.test/orders', { role: 'link', name: 'Customer' }, 'https://app.test/contacts');
    model.transition('https://app.test/orders', { role: 'link', name: 'Customer' }, 'https://app.test/contacts');
    model.transition('https://app.test/orders', { role: 'button' }, 'https://app.test/contacts');
    model.transition('https://app.test/orders', null, 'https://app.test/contacts');
    const page = model.load('https://app.test').pages['https://app.test/orders'];
    expect(Object.keys(page.transitions)).toEqual(['link "Customer"']);
    expect(page.transitions['link "Customer"'].seen).toBe(2);
    // A transition alone is not a visit: only observe() counts one.
    expect(page.seen).toBe(0);
    expect(model.render('https://app.test/orders')).toBe('');
  });

  it('reads a control out of a ref hint or a role= selector', () => {
    expect(controlFromTarget('@e12', { role: 'button', name: 'Save' })).toEqual({ role: 'button', name: 'Save' });
    expect(controlFromTarget('role=button[name="Save"]')).toEqual({ role: 'button', name: 'Save' });
    expect(controlFromTarget("role=link[name='Orders']")).toEqual({ role: 'link', name: 'Orders' });
    expect(controlFromTarget('#save-btn')).toBeNull();
    expect(controlFromTarget('@e12', { role: 'button' })).toBeNull();
    expect(controlFromTarget(undefined)).toBeNull();
  });
});

describe('bounds', () => {
  it('caps pages, controls and transitions, evicting least-recently-seen', () => {
    const model = new SiteModel(dir);
    for (let i = 0; i < 70; i++) model.observe(`https://app.test/p${String.fromCharCode(97 + (i % 26))}${i}x`, sig([]));
    const map = model.load('https://app.test');
    expect(Object.keys(map.pages).length).toBeLessThanOrEqual(60);
    // The oldest page went; the newest stayed.
    expect(map.pages['https://app.test/pa0x']).toBeUndefined();

    const lines = Array.from({ length: 120 }, (_, i) => `- button "B${String.fromCharCode(97 + (i % 26))}-${i}-x"`);
    model.observe('https://app.test/big', sig(lines));
    expect(Object.keys(map.pages['https://app.test/big'].controls).length).toBe(80);

    for (let i = 0; i < 50; i++) {
      model.transition('https://app.test/big', { role: 'link', name: `L${i}x` }, `https://app.test/dest${i}x`);
    }
    expect(Object.keys(map.pages['https://app.test/big'].transitions).length).toBe(40);
  });

  it('truncates the render to the budget with a "+N more" tail', () => {
    const model = new SiteModel(dir);
    const lines = Array.from({ length: 40 }, (_, i) => `- button "Button number ${String.fromCharCode(97 + (i % 26))}${i}"`);
    model.observe('https://app.test/orders', sig(lines));
    model.observe('https://app.test/orders', sig(lines));
    const out = model.render('https://app.test/orders');
    expect(out.length).toBeLessThanOrEqual(700);
    expect(out).toMatch(/… \(\+\d+ more\)/);
    expect(out).toContain('role=button[name="Save"]');
    const tiny = model.render('https://app.test/orders', 200);
    expect(tiny).toContain('[site] This page matches /orders');
  });
});

describe('persistence', () => {
  it('writes atomically under the encoded origin and reloads', () => {
    const model = new SiteModel(dir);
    model.observe('https://app.test:8069/orders', sig(['- button "Save"'], 'Orders'));
    model.flush();
    const file = path.join(dir, 'https_app.test_8069', 'sitemap.json');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readdirSync(path.join(dir, 'https_app.test_8069'))).toEqual(['sitemap.json']);

    const reloaded = new SiteModel(dir).render('https://app.test:8069/orders');
    expect(reloaded).toContain('button "Save"');
  });

  it('tolerates a corrupt or foreign file', () => {
    fs.mkdirSync(path.join(dir, 'https_app.test'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'https_app.test', 'sitemap.json'), '{ not json');
    const model = new SiteModel(dir);
    expect(model.render('https://app.test/orders')).toBe('');
    expect(model.load('https://app.test').pages).toEqual({});
    model.observe('https://app.test/orders', sig(['- button "Save"']));
    model.flush();
    expect(new SiteModel(dir).render('https://app.test/orders')).toContain('button "Save"');

    fs.writeFileSync(path.join(dir, 'https_app.test', 'sitemap.json'), JSON.stringify({ version: 9, pages: 'nope' }));
    expect(new SiteModel(dir).render('https://app.test/orders')).toBe('');
  });

  it('never throws on garbage input', () => {
    const model = new SiteModel(path.join(dir, 'nope', 'deeper'));
    expect(() => model.observe('', undefined as unknown as PageSignature)).not.toThrow();
    expect(() => model.observe('javascript:void(0)', sig([]))).not.toThrow();
    expect(() => model.transition('', { role: 'button', name: 'x' }, '')).not.toThrow();
    expect(() => model.flush()).not.toThrow();
    expect(model.render('https://app.test/orders')).toBe('');
  });
});

describe('shared instance', () => {
  it('follows $SITELOOPER_SKILLS_DIR', () => {
    process.env.SITELOOPER_SKILLS_DIR = dir;
    const model = siteModel();
    expect(model.dir).toBe(dir);
    expect(siteModel()).toBe(model);
    model.observe('https://app.test/orders', sig(['- button "Save"']));
    model.flush();
    expect(fs.existsSync(path.join(dir, 'https_app.test', 'sitemap.json'))).toBe(true);
  });
});
