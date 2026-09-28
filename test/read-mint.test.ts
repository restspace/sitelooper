/**
 * A value the app minted that the procedure READ off the page and then typed
 * is bound from that read at run time, not cut off (compile.ts mintedFill's
 * read arm). GPT-6 Luna trial, snipeit fwsi29-luna 03-create
 * (test/fixture/fwsi29-luna-n1-script.jsonl): #50 read the create form's
 * pre-filled `#asset_tag` (asset_tag_field = BA-00004), #52 saved, #54 typed
 * BA-00004 into "Lookup by Asset Tag" and #55 pressed Enter onto /hardware/4.
 * The fwsi14 rule ended the procedure before #54, so the skill stopped on the
 * /hardware list, never published the asset id, and 04-edit/05-verify went to
 * the model on every replay.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow, SpecSegment } from '../src/spec/ir.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function compileCreate() {
  const e = parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwsi29-luna-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;
  const at = e.findIndex((x) => x.k === 'instruction' && x.text.startsWith('Create an asset'));
  const end = e.findIndex((x, i) => i > at && x.k === 'report');
  const create = e.slice(at, end + 1);
  const first = create[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = create[create.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
  return compileSkills({
    entries: create.slice(0, -1),
    instruction: first.text,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values ?? {} } },
    session: 'fwsi29-luna-n1',
    knownValues: { 'var:runid': 'fwsi29-luna-n1' },
    before: e.slice(0, at),
  });
}

describe('a minted value the procedure read and then typed is bound from the read (fwsi29-luna 03-create)', () => {
  const skills = compileCreate();
  const all = skills.flatMap((s) => s.steps);

  it('keeps the lookup and its Enter, typing a derived value, never the literal', () => {
    const fill = all.find((s) => s.tool === 'fill' && JSON.stringify(s.locators).includes('Lookup by Asset Tag'));
    expect(fill).toBeTruthy();
    expect(String(fill!.args.value)).toMatch(/^\{\{d\d+\}\}$/);
    expect(all.some((s) => (s.tool === 'fill' || s.tool === 'type') && JSON.stringify(s.args).includes('BA-00004'))).toBe(false);
    expect(all.some((s) => s.tool === 'press' && s.args.key === 'Enter')).toBe(true);
    const notes = skills.flatMap((s) => s.provenance.transforms ?? []).filter((t) => t.name === 'mintedFill');
    expect(notes.map((t) => t.reason)).toEqual([expect.stringContaining("bound from this procedure's own read")]);
  });

  it('binds that value at the read on the form, and the Enter mints the asset id the next steps need', () => {
    const slot = /^\{\{(d\d+)\}\}$/.exec(String(all.find((s) => s.tool === 'fill' && JSON.stringify(s.locators).includes('Lookup by Asset Tag'))!.args.value))![1];
    const owner = skills.find((s) => s.derived?.[slot]);
    expect(owner?.derived?.[slot]).toMatchObject({ at: '', example: 'BA-00004', read: expect.any(String) });
    const d = owner!.derived![slot];
    const read = owner!.steps[d.step - 1];
    expect([read.tool, read.args.target, read.label]).toEqual(['read', '#asset_tag', d.read]);
    // the url mint: the asset id off /hardware/:id, where the lookup landed
    expect(skills.some((s) => Object.values(s.derived ?? {}).some((x) => x.at === 'p1' && x.example === '4'))).toBe(true);
  });
});

const STEPS: SkillStep[] = [
  { tool: 'read', args: { target: '#asset_tag', what: 'value' }, locators: { target: [{ kind: 'css', selector: '#asset_tag' }] }, label: 'created_asset_tag' },
  { tool: 'fill', args: { target: '#lookup', value: '{{d1}}' }, locators: { target: [{ kind: 'css', selector: '#lookup' }] } },
];

describe('the artifact binds a read-minted value from the read it just published', () => {
  it('emits bindPart off the read output, never off the url', () => {
    const segment: SpecSegment = {
      id: 's_readmint',
      template: 'create an asset',
      params: {},
      preconditions: { urlPattern: 'http://app.test/hardware/create' },
      steps: STEPS,
      derived: { d1: { step: 1, at: '', example: 'BA-00004', read: 'created_asset_tag' } },
    };
    const spec: SpecFlow = {
      version: 1,
      name: 'demo',
      origin: 'http://app.test',
      startUrl: 'http://app.test/',
      vars: [],
      steps: [{ id: '03-create', instruction: 'create an asset', params: {}, outputs: ['created_asset_tag'], segments: [segment] }],
    };
    const source = emitFlowFile(spec, { tier: 'plain' }).source;
    expect(source).toContain("bindPart(p, 'd1', (outputs['03-create.created_asset_tag'] ?? '').trim() || undefined); // recorded example: BA-00004");
    expect(source).not.toMatch(/bindPart\(p, 'd1', (await )?urlPart/);
    expect(source.indexOf("outputs['03-create.created_asset_tag']")).toBeLessThan(source.indexOf("bindPart(p, 'd1'"));
  });
});
