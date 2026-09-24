import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreReadBack, type RecordedEntry, type RecordedReport, type RecordedStep } from '../src/daemon/recorder.js';
import { extractFramed } from '../src/execution/text.js';

/**
 * Round 57, kanboard fwkb41 02-create: n1 reported `new_task_numeric_id: "4"`
 * where the board shows only `link "#4"` — which the same finish pinned, as
 * `card_id_shown` / `board_tasks_after_7`. No element shows "4" whole, so it
 * stayed a recorded literal. The element text is `#4`, the value is its
 * letter/digit core, and the instruction stood on `…task_id=4`: a read of THAT
 * element, framed "#{{=}}", publishes the live core on every replay ("5" on
 * the run whose task is #5).
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDING = path.join(root, 'bench/fixtures/recordings/fwkb41-n1-script.jsonl');

function instruction(n: number): { steps: RecordedStep[]; report: RecordedReport } {
  const steps: RecordedStep[] = [];
  let report: RecordedReport | undefined;
  let at = 0;
  for (const line of fs.readFileSync(RECORDING, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const e = JSON.parse(line) as RecordedEntry;
    if (e.k === 'instruction') at += 1;
    else if (at === n && e.k === 'step') steps.push(e);
    else if (at === n && e.k === 'report') report = e;
  }
  return { steps, report: report! };
}

const read = (text: string, selector: string): RecordedStep => ({
  k: 'step',
  tool: 'read',
  args: { target: '(read-back)', what: 'text' },
  locators: { target: { expr: selector, verified: true, raw: '(read-back)', chain: [{ kind: 'css', selector }] } },
  result: JSON.stringify(text),
});
/** The recording stood on the task's own url: the id's provenance. */
const landed: RecordedStep = { k: 'step', tool: 'goto', args: { url: 'http://kb.test/?controller=TaskViewController&action=show&task_id=4' }, locators: {} };

describe('coreReadBack (fwkb41 02-create new_task_numeric_id)', () => {
  it('reads the one pinned element whose text is the value plus an affix, framed at the core', () => {
    const { steps } = instruction(2);
    const got = coreReadBack(steps, '4', 'new_task_numeric_id', { new_task_numeric_id: '4', new_task_card_id_shown: '#4' });
    expect(got).not.toBeNull();
    expect(got!.label).toBe('new_task_numeric_id');
    expect(got!.args).toMatchObject({ target: '(read-back)', what: 'text', frame: '#{{=}}' });
    expect(JSON.parse(got!.result!)).toBe('4');
    // Located as the recorded "#4" read-back was.
    const source = steps.find((s) => s.tool === 'read' && s.result === JSON.stringify('#4'))!;
    expect(got!.locators.target.chain).toEqual(source.locators.target.chain);
    // And on a replay whose task is #5, the frame yields the live core.
    expect(extractFramed('#5', got!.args.frame as string)).toBe('5');
  });

  it('reads nothing where another reported key carries the same value (fwkb41 i2: backlog_column_count_after is also "4")', () => {
    const { steps, report } = instruction(2);
    expect(coreReadBack(steps, '4', 'new_task_numeric_id', report.values)).toBeNull();
    expect(coreReadBack(steps, '4', 'backlog_column_count_after', report.values)).toBeNull();
  });

  it('reads nothing where no url of the instruction names the value (fwkb41 i1: a count of 3 beside task #3)', () => {
    const { steps, report } = instruction(1);
    expect(coreReadBack(steps, '3', 'backlog_task_count', report.values)).toBeNull();
  });

  it('does not fire on a bare number that merely stands inside a longer text', () => {
    expect(coreReadBack([landed, read('Task #4', 'h2')], '4', 'id')).toBeNull();
    expect(coreReadBack([landed, read('Backlog (4)', 'th')], '4', 'count')).toBeNull();
  });

  it('does not fire when two different pinned texts share the core', () => {
    expect(coreReadBack([landed, read('#4', 'a.card'), read('4.', 'span.n')], '4', 'id')).toBeNull();
  });

  it('does not fire on a value some read returned whole', () => {
    expect(coreReadBack([landed, read('#4', 'a.card'), read('4', 'span')], '4', 'id')).toBeNull();
    // …and does, with the same evidence, when none did.
    expect(coreReadBack([landed, read('#4', 'a.card')], '4', 'id')).not.toBeNull();
  });
});
