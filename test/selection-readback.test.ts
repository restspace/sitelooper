import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectionReadBack, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';

/**
 * Round 56, odoo fwod82: the compile refused with
 *   `04-change: slot v2 is bound to {{02-create.product}}, and nothing has
 *    ever published product`
 * and both replays paid three model turns on 04-change for it. 02-create's
 * recording typed "Desk" (#28), clicked `role=option[name="[FURN_1118] Corner
 * Desk Left Sit"]` (#29) — whose own diff shows `- combobox "Type to find a
 * product...": [FURN_1118] Corner Desk Left Sit` — and read the product only
 * inside whole rows (#34). The saved row shows the name twice (product and
 * description), so captureReadBack refused the text match as ambiguous and no
 * read-back was pinned.
 *
 * The procedure's OWN selection is a source: the value is the accessible name
 * of the option this instruction clicked, and the click's recorded diff shows
 * the control now holding it.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDING = path.join(root, 'bench/fixtures/recordings/fwod82-n1-script.jsonl');
const PRODUCT = '[FURN_1118] Corner Desk Left Sit';

function entries(): RecordedEntry[] {
  return fs
    .readFileSync(RECORDING, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);
}

/** The steps of instruction `n` (1-based), in order. */
function stepsOf(all: RecordedEntry[], n: number): RecordedStep[] {
  const out: RecordedStep[] = [];
  let at = 0;
  for (const e of all) {
    if (e.k === 'instruction') at += 1;
    else if (at === n && e.k === 'step') out.push(e);
  }
  return out;
}

describe('selectionReadBack (fwod82 02-create #28–#46)', () => {
  it('reads the control the selection filled, right after the click that filled it', () => {
    const steps = stepsOf(entries(), 2);
    const got = selectionReadBack(steps, PRODUCT, 'product');
    expect(got).not.toBeNull();
    // Anchored on #29, the option click.
    expect(got!.after.tool).toBe('click');
    expect(JSON.stringify(got!.after.locators.target.chain)).toContain(`"name":"${PRODUCT.replace(/"/g, '\\"')}"`);
    // A value read of the combobox the procedure typed into (#28), labelled with the output.
    expect(got!.read.tool).toBe('read');
    expect(got!.read.label).toBe('product');
    expect(got!.read.args).toMatchObject({ target: '(read-back)', what: 'value' });
    expect(got!.read.locators.target.chain?.[0]).toEqual({ kind: 'role', role: 'combobox', name: 'Type to find a product...' });
    expect(JSON.parse(got!.read.result!)).toBe(PRODUCT);
  });

  it('is no source for a value the instruction did not select', () => {
    expect(selectionReadBack(stepsOf(entries(), 2), '[E-COM06] Corner Desk Right Sit', 'product')).toBeNull();
    expect(selectionReadBack(stepsOf(entries(), 2), '85.00', 'unit_price')).toBeNull();
  });

  it('is no source when the click’s own diff does not show the control holding the value', () => {
    const steps = stepsOf(entries(), 2).map((s) =>
      s.tool === 'click' && JSON.stringify(s.locators.target?.chain ?? []).includes(PRODUCT)
        ? { ...s, diff: { ...s.diff!, added: (s.diff?.added ?? []).filter((l) => !l.startsWith('- combobox')) } }
        : s,
    );
    expect(selectionReadBack(steps, PRODUCT, 'product')).toBeNull();
  });
});

/**
 * The whole path, offline: the recording rebuilt with the current engine
 * (bench/rebuild-flow.mjs applies the same record-time pass), the flow
 * exported, and the flow COMPILED — where round 56 refused it.
 */
describe('fwod82 compiles once 02-create reads its own selection', () => {
  it('publishes 02-create.product and compiles with no unsourced-ref', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-fwod82-'));
    try {
      execFileSync(process.execPath, ['bench/rebuild-flow.mjs', '--tag', 'fwod82', '--dir', 'bench/fixtures/recordings'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, REBUILD_STORE_DIR: path.join(tmp, 'store'), REBUILD_DUMP: path.join(tmp, '{runid}.json') },
      });
      const flowFile = path.join(tmp, 'fwod82-n1.json');
      const flow = JSON.parse(fs.readFileSync(flowFile, 'utf8'));
      expect(flow.steps.find((s: { id: string }) => s.id === '02-create')?.outputs).toContain('product');
      let out = '';
      try {
        out = execFileSync(process.execPath, ['bin/sitelooper.js', 'compile', flowFile, '--out', path.join(tmp, 'out'), '--overwrite-spec', '--json'], {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, SITELOOPER_SKILLS_DIR: path.join(tmp, 'store'), APP_PASSWORD: 'bench-pass-1234' },
        });
      } catch (err) {
        out = String((err as { stdout?: string }).stdout ?? err);
      }
      const json = JSON.parse(out.slice(out.indexOf('{')));
      const unsourced = (json.diagnostics ?? []).filter((d: { code: string }) => d.code === 'unsourced-ref');
      expect(unsourced, JSON.stringify(unsourced)).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
