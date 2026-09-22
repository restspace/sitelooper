import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { alertLines, compileSkills, cutAtPublishedValue } from '../src/skills/compile.js';

/**
 * repairdesk fwrd83-n1 06-change: Mark Ready raised "Ticket is not ready" over
 * two part lines (stored collapsed, as every alert is); the step's reads
 * published the first line as `refusal_text_1`, at offset 0, so FIX P's cut
 * left "" and deleted the alert expectation. alertVerdict then took the
 * refusal for an unexpected alert (n2, n3 and the compiled script failed).
 * A published value that is a whole line of the alert is the alert read back.
 */
const LINE1 = 'Ticket is not ready';
const LINE2 = 'Part "fwrd83-n1 RD Part A" has no supplier';
const LINE3 = 'Part "fwrd83-n1 RD Part B" has no supplier';
const ALERT = `${LINE1} ${LINE2} ${LINE3}`;

describe('alertLines and the per-line exemption (FIX P follow-up)', () => {
  it('a two-line alert whose first line is published is returned unchanged', () => {
    const alert = `${LINE1} ${LINE2}`;
    const lines = alertLines(alert, [`${LINE1}\n\n${LINE2}`], [LINE1]);
    expect(lines).toEqual([LINE1, LINE2]);
    expect(cutAtPublishedValue(alert, [LINE1], lines)).toBe(alert);
    // …and without the lines, the old cut to nothing
    expect(cutAtPublishedValue(alert, [LINE1])).toBe('');
  });

  it('lines come from published values that tile the alert when no read kept its breaks', () => {
    expect(alertLines(ALERT, [], [LINE1, LINE2, LINE3, 'fwrd83-n1 RD Part A'])).toEqual([LINE1, LINE2, LINE3]);
    // a set that does not reach the end is no tiling
    expect(alertLines(ALERT, [], [LINE1, LINE2])).toEqual([]);
  });

  it('fwsi4: a value inside a line still cuts', () => {
    const alert = 'Success: × Asset with tag BA-00004 was created successfully. Click here to view.';
    const published = ['fwsi4-n1 Bench Asset', 'BA-00004'];
    const lines = alertLines(alert, ['Copy to Clipboard\nBA-00004'], published);
    expect(lines).toEqual([]);
    expect(cutAtPublishedValue(alert, published, lines)).toBe('Success: × Asset with tag');
  });

  it('compiles the fwrd83 shape with the refusal still expected', () => {
    const url = 'http://x.test/#/tickets/t15';
    const read = (label: string | undefined, result: unknown, tool = 'read'): RecordedStep => ({
      k: 'step',
      tool,
      args: { target: '[role=alert]', what: 'text', ...(label ? { label } : {}) },
      locators: { target: { expr: 'x', verified: true, raw: '[role=alert]', chain: [{ kind: 'css', selector: '[role=alert]' }] } },
      result: JSON.stringify(result),
      ...(label ? { label } : {}),
    });
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'Try to mark the ticket Ready and report the refusal', url },
      {
        k: 'step',
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Mark Ready' }] } },
        diff: { url, alerts: [ALERT], added: [], dialect: 2 },
      },
      read(undefined, [`${LINE1}\n\n${LINE2}\n${LINE3}`], 'read_all'),
      read('refusal_text_1', LINE1),
    ];
    const [skill] = compileSkills({ entries, instruction: 'Try to mark the ticket Ready and report the refusal', report: { status: 'success', summary: 'refused', evidence: { values: { refusal_text_1: LINE1 } } }, session: 's' });
    expect(skill.steps[0].expect?.alertContains).toBe(ALERT.slice(0, 120));
  });
});
