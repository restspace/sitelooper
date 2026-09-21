import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ownmint-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * espocrm fwec1-n2: the recovery of adopted 02-create (ledger index i2) saved
 * the opportunity — `#Opportunity/create` → `#Opportunity/view/<id>` — and
 * went back to it by `goto`. The runner banks what a recovery minted before
 * the re-pin compile and keeps own url ids known (fwgr41), so the id became a
 * param bound to `url:i2:h2`, i.e. to 02-create's own output. A url id the
 * compiled span itself minted is derived ({{dN}}), never a param.
 */
describe('a url id the compiled span minted is derived, not a param (fwec1)', () => {
  const O = 'http://127.0.0.1:8097';
  const ID = '6ab1b0e3c2d9e9f95';
  const INSTRUCTION = "Create an opportunity named 'fwec1-n2 Bench Opportunity' and report its url.";
  const at = (url: string, added: string[] = []) => ({ url, alerts: [], added, dialect: 2 as const });
  const click = (name: string, url: string, added: string[] = []): RecordedStep => ({
    k: 'step',
    tool: 'click',
    args: { target: `role=button[name="${name}"]` },
    locators: { target: { expr: `page.getByRole('button', { name: '${name}' })`, verified: true, raw: name, chain: [{ kind: 'role', role: 'button', name }] } },
    diff: at(url, added),
  });
  const recording = (): RecordedEntry[] => [
    { k: 'instruction', text: INSTRUCTION, url: `${O}/#Opportunity` },
    click('Create Opportunity', `${O}/#Opportunity/create`, ['- textbox "Name"']),
    {
      k: 'step',
      tool: 'fill',
      args: { target: '@e2', value: 'fwec1-n2 Bench Opportunity' },
      locators: { target: { expr: "page.getByRole('textbox', { name: 'Name' })", verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'textbox', name: 'Name' }] } },
      diff: at(`${O}/#Opportunity/create`),
    },
    click('Save', `${O}/#Opportunity/view/${ID}`, ['- heading "fwec1-n2 Bench Opportunity"']),
    { k: 'step', tool: 'goto', args: { url: `${O}/#Opportunity/view/${ID}` }, locators: {}, diff: at(`${O}/#Opportunity/view/${ID}`) },
    { k: 'step', tool: 'read', args: { what: 'url', label: 'record_url' }, locators: {}, result: JSON.stringify(`${O}/#Opportunity/view/${ID}`) },
  ];
  const compile = (ownStep: string | undefined) =>
    compileSkills({
      entries: recording(),
      instruction: INSTRUCTION,
      report: { status: 'success', summary: 'saved', evidence: { values: { record_url: `${O}/#Opportunity/view/${ID}` } } },
      session: 's',
      knownValues: { 'var:runid': 'fwec1-n2', 'url:i2:h2': ID },
      ...(ownStep ? { ownStep } : {}),
    });
  const idParams = (skills: ReturnType<typeof compile>) =>
    skills.flatMap((s) => Object.values(s.params).filter((p) => p.example === ID).map((p) => p.binding));

  it('derives the id this instruction minted, and binds no param to it', () => {
    const skills = compile('i2');
    expect(idParams(skills)).toEqual([]);
    const all = JSON.stringify(skills.map((s) => s.steps));
    expect(all).not.toContain(ID);
    expect(all).toContain('#Opportunity/view/{{d1}}');
  });

  it('keeps an EARLIER step\'s url id a param — the record the step was told to act on', () => {
    // Same recording, but the id was banked by the instruction before (i2)
    // while this one runs as i3: it is an input, bound to the step that made it.
    const skills = compile('i3');
    expect(new Set(idParams(skills))).toEqual(new Set(['url:i2:h2']));
  });
});
