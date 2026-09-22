import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { bindSkill } from '../src/skills/learn.js';
import { buildFlow, staleInstructionIds, urlOutputs } from '../src/skills/flow.js';
import { RunLedger, bindingKey } from '../src/skills/ledger.js';
import { urlParts } from '../src/execution/url.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-landed-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * snipeit fwsi2-n1: 03-create's own action landed `/hardware/4`; the length
 * floor kept `4` out of the ledger and the flow's references, so 04-create's
 * `goto /hardware/4/checkout` and the prose "at /hardware/4" stayed literal and
 * every replay checked out the deleted asset 4. A digit run a step's own
 * non-navigation action landed at a path position is that step's record id
 * at any length — used only at its url position, never as a bare token.
 */
const O = 'http://127.0.0.1:8098';
const click = (name: string, url: string, added: string[] = []): RecordedStep => ({
  k: 'step',
  tool: 'click',
  args: { target: `role=button[name="${name}"]` },
  locators: { target: { expr: `page.getByRole('button', { name: '${name}' })`, verified: true, raw: name, chain: [{ kind: 'role', role: 'button', name }] } },
  diff: { url, alerts: [], added, dialect: 2 },
});

describe('the ledger banks a landed path id below the floor, for its position only', () => {
  it('banks it when a step\'s own action landed it, and keeps it out of the text guards', () => {
    const ledger = new RunLedger();
    ledger.addUrlIds(`${O}/things/4`, 'i1', urlParts(`${O}/things/4`), { landed: true });
    const entry = ledger.all().find((e) => e.value === '4');
    expect(entry && bindingKey(entry.binding)).toBe('url:i1:p1');
    expect(entry?.positional).toBe(true);
    expect(ledger.runValuesIn('(4) Status')).toEqual([]);
  });

  it('does not bank it from a url a navigation was sent to', () => {
    const ledger = new RunLedger();
    ledger.addUrlIds(`${O}/things/4`, 'i1', urlParts(`${O}/things/4`));
    expect(ledger.has('4')).toBe(false);
  });
});

describe('compile slots a landed path id only at its url position', () => {
  it('slots the goto by position, and leaves "(4) Status" and nth-of-type(4) literal', () => {
    const instruction = "At /things/4, open the edit form and set (4) Status to 'Ready'.";
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: instruction, url: `${O}/things/4` },
      { k: 'step', tool: 'goto', args: { url: `${O}/things/4/edit` }, locators: {}, diff: { url: `${O}/things/4/edit`, alerts: [], added: ['- heading "Edit thing"'], dialect: 2 } },
      {
        k: 'step',
        tool: 'click',
        args: { target: 'tr:nth-of-type(4) button' },
        locators: { target: { expr: "page.locator('tr:nth-of-type(4) button')", verified: true, raw: 'x', chain: [{ kind: 'css', selector: 'tr:nth-of-type(4) button' }] } },
        diff: { url: `${O}/things/4/edit`, alerts: [], added: ['- cell "(4) Status"'], dialect: 2 },
      },
    ];
    const skills = compileSkills({
      entries,
      instruction,
      report: { status: 'success', summary: 'set', evidence: { values: {} } },
      session: 's',
      knownValues: { 'url:i1:p1': '4' },
    });
    const skill = skills[0];
    const slot = Object.entries(skill.params).find(([, p]) => p.example === '4');
    expect(slot?.[1].binding).toBe('url:i1:p1');
    const all = JSON.stringify(skills.map((k) => k.steps));
    expect(all).toContain(`/things/{{${slot![0]}}}/edit`);
    expect(all).toContain('tr:nth-of-type(4) button');
    expect(all).toContain('(4) Status');
    expect(skill.template).toBe(instruction);
    // It still binds, by origin.
    expect(bindSkill(skill, instruction, { 'url:i1:p1': '7' })?.[slot![0]]).toBe('7');
  });
});

describe('the flow references a landed path id at its path (fwsi2)', () => {
  const entries = (via: 'click' | 'goto' = 'click'): RecordedEntry[] => [
    { k: 'instruction', text: 'Create a thing and report its tag.', url: `${O}/things` },
    click('New', `${O}/things/create`, ['- textbox "Name"']),
    via === 'click'
      ? click('Save', `${O}/things/4`, ['- heading "x Thing"'])
      : ({ k: 'step', tool: 'goto', args: { url: `${O}/things/4` }, locators: {}, diff: { url: `${O}/things/4`, alerts: [], added: [], dialect: 2 } } as RecordedStep),
    { k: 'report', status: 'success', summary: 'created', values: { tag: 'TH-0004' }, skill: 's_create' },
    { k: 'instruction', text: 'Open the thing at /things/4 and set (4) Status; do not touch /things/42.', url: `${O}/things/4` },
    { k: 'step', tool: 'goto', args: { url: `${O}/things/4/edit` }, locators: {}, diff: { url: `${O}/things/4/edit`, alerts: [], added: [], dialect: 2 } },
    { k: 'report', status: 'success', summary: 'set', values: {}, skill: 's_edit' },
  ] as RecordedEntry[];
  const build = (e: RecordedEntry[]) =>
    buildFlow(e, { name: 'f', origin: O, startUrl: `${O}/things`, vars: {}, session: 's', bind: (id) => (id === 's_edit' ? { v1: '4', v2: `${O}/things/4/edit` } : {}) })!;

  it('references it in prose and params, and nowhere else', () => {
    const flow = build(entries());
    const edit = flow.steps[1];
    expect(edit.instruction).toBe('Open the thing at /things/{{01-create.url.p1}} and set (4) Status; do not touch /things/42.');
    expect(edit.params).toEqual({ v1: '{{01-create.url.p1}}', v2: '{{01-create.url}}/edit' });
    expect(flow.steps[0].recorded['url.p1']).toBe('4');
    expect(urlOutputs(`${O}/things/5`)['url.p1']).toBe('5');
    expect(staleInstructionIds(entries(), flow)).toEqual([]);
  });

  it('does not mint it from a url a navigation was sent to, and says the prose quotes it', () => {
    const e = entries('goto');
    const flow = build(e);
    expect(flow.steps[1].instruction).toContain('at /things/4 ');
    expect(flow.steps[1].params?.v1).toBe('4');
  });

  it('flags a landed path id the prose still quotes', () => {
    const e = entries();
    const flow = build(e);
    flow.steps[1].instruction = 'Open the thing at /things/4.';
    expect(staleInstructionIds(e, flow)).toHaveLength(1);
  });
});
