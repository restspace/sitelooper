/**
 * Phase A hygiene: the eval guard's second pass (fwop10, fwod82, fwgh8).
 *
 * The round-18 guard (evalMutation) refuses clicks, value writes, navigation
 * and DOM edits made through eval. Across the 146 published n1 recordings it
 * let exactly seven state changes through, all after it shipped:
 *  - fwop10 gave inputs ids of its own (`ce.id='journal-editor-2'`) and filled
 *    them. Compile drops evals, so the ids never exist on a replay;
 *  - fwod82 did the same to two buttons in stacked Odoo modals;
 *  - fwgh8 opened the public post with `window.open(…)`, and
 *    creditUncreditedPopups later had to drop every step it ran there.
 * test/fixture/eval-expressions.json holds those seven, a sample of the
 * pre-guard mutations, and a per-app sample of the read-only evals, all
 * verbatim. bench/eval-audit.mjs runs the same check over all 2,503 distinct
 * recorded expressions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evalMutation, evalRefusal, evalTarget, withEmptyReadHint } from '../src/agent/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixture', 'eval-expressions.json'), 'utf8')) as {
  blocked: { run: string; expression: string; reason: string }[];
  alreadyBlocked: { run: string; expression: string }[];
  allowed: { run: string; expression: string }[];
};

describe('eval guard: what the recordings got through', () => {
  it('refuses every recorded identity assignment and window.open', () => {
    expect(fixture.blocked).toHaveLength(7);
    for (const e of fixture.blocked) expect([e.run, evalMutation(e.expression)]).toEqual([e.run, e.reason]);
  });

  it('still refuses the pre-guard mutations', () => {
    for (const e of fixture.alreadyBlocked) expect([e.run, evalMutation(e.expression)]).not.toEqual([e.run, null]);
  });

  it('lets every sampled read-only eval through', () => {
    expect(fixture.allowed.length).toBeGreaterThan(150);
    const refused = fixture.allowed.filter((e) => evalMutation(e.expression) !== null).map((e) => `${e.run}: ${evalMutation(e.expression)} in ${e.expression.slice(0, 120)}`);
    expect(refused).toEqual([]);
  });

  it('refuses the other ways to change identity, open a page or hide an element', () => {
    expect(evalMutation("el.name = 'q'")).toBe('assigns .name');
    expect(evalMutation("el.className = 'x'")).toBe('assigns .className');
    expect(evalMutation("el.dataset.testid = 'x'")).toBe('assigns .dataset.testid');
    expect(evalMutation("el.classList.add('open')")).toBe('edits the DOM with .classList.add()');
    expect(evalMutation("open('/x')")).toBe('opens a page with window.open()');
    expect(evalMutation("document.location = '/x'")).toBe('assigns location');
    expect(evalMutation("location='/x'")).toBe('assigns location');
    expect(evalMutation("document.write('<p>')")).toBe('rewrites the document with document.write()');
    expect(evalMutation("el.style.display = 'block'")).toBe('assigns .style.display');
    expect(evalMutation('el.hidden = false')).toBe('assigns .hidden');
    expect(evalMutation('btn.disabled=false')).toBe('assigns .disabled');
  });

  it('reads the code, not the strings in it', () => {
    expect(evalMutation("document.body.innerText.includes('window.open(')")).toBeNull();
    expect(evalMutation("[...document.querySelectorAll('[onclick]')].map(e => e.getAttribute('onclick')).filter(s => s.includes('.id = '))")).toBeNull();
    expect(evalMutation("({ id: el.id, name: el.name, same: el.id === 'x', cls: el.className })")).toBeNull();
    expect(evalMutation('const location = document.location.href; location')).toBeNull();
    expect(evalMutation("dialog.open === true")).toBeNull();
  });
});

describe('eval guard: the refusal names the target the tools can use', () => {
  const [op1, op2, op3] = fixture.blocked.filter((e) => e.run === 'fwop10').map((e) => e.expression);
  const od = fixture.blocked.filter((e) => e.run === 'fwod82').map((e) => e.expression);
  const gh = fixture.blocked.find((e) => e.run === 'fwgh8')!.expression;

  it('fwop10: the form and the contenteditable it found', () => {
    expect(evalTarget(op2)).toBe('#work-package-journal-form-element >> [contenteditable="true"]');
    expect(evalTarget(op3)).toBe('#work-package-journal-form-element >> [contenteditable="true"]');
    expect(evalTarget(op1)).toBe('op-editable-attribute-field:has([data-field-name="combinedDate"]) >> input');
    const message = evalRefusal(op3)!;
    expect(message).toContain('eval is read-only: the expression assigns .id.');
    expect(message).toContain('`#work-package-journal-form-element >> [contenteditable="true"]`');
    expect(message).toContain('never runs this eval');
  });

  it('fwod82: the modal by its text, the button by its label', () => {
    expect(evalTarget(od[0])).toBe('.modal:has-text("Cancel Sales Order") >> button:text-is("Send and cancel")');
    expect(evalTarget(od[1])).toBe('.modal >> button:text-is("Discard")');
  });

  it('fwgh8: window.open names the url to go to instead', () => {
    const message = evalRefusal(gh)!;
    expect(message).toContain('opens a page with window.open()');
    expect(message).toContain("goto 'http://127.0.0.1:8099/fwgh8-n1-bench-post/'");
    expect(message).toContain('Click the link or button that opens it');
  });

  it('a read-only eval is not refused, and a mutation that found nothing names no target', () => {
    expect(evalRefusal('document.title')).toBeNull();
    expect(evalTarget("el.id = 'x'")).toBeNull();
    expect(evalRefusal("el.id = 'x'")).not.toContain('`');
  });
});

describe('empty read_all: the model is told what to do, the recording is not touched', () => {
  it('fwgt10: `.issue-title` matched nothing', () => {
    const hint = withEmptyReadHint('read_all', { target: '.issue-title', what: 'text' }, '[]');
    expect(hint.startsWith('[] — 0 elements match ".issue-title".')).toBe(true);
    expect(hint).toContain('snapshot');
    expect(hint).toContain('never replayed');
  });

  it('leaves a match, a count and a singular read alone', () => {
    expect(withEmptyReadHint('read_all', { target: 'a', what: 'text' }, '["x"]')).toBe('["x"]');
    expect(withEmptyReadHint('read_all', { target: 'a', what: 'count' }, '0')).toBe('0');
    expect(withEmptyReadHint('read', { target: 'a', what: 'text' }, '""')).toBe('""');
  });
});
