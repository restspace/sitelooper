import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { buildFlow, commentaryReport } from '../src/skills/flow.js';

const ORIGIN = 'http://127.0.0.1:8095';
const ISSUE = `${ORIGIN}/bench/bench-repo/issues/4`;
const ISSUE_PAGE = '- heading "fx1 Bench Issue #4"\n- combobox "Labels"\n- button "Close Issue"';
const LIST_PAGE = ['- link "4 Open"', '- link "0 Closed"'];

function fill(target: string, value: string): RecordedEntry {
  return { k: 'step', tool: 'fill', args: { target, value }, locators: { target: { expr: 'x', verified: true, raw: target, chain: [{ kind: 'label', label: 'Title' }] } } };
}

/**
 * gitea fwgt17 (round 66): 03-open was asked for the labels shown and
 * reported, beside them, `labels_picker_state = "closed"` — a word no line
 * of the page carried. 08-report's wording "confirm the issue is open (not
 * closed)" was exported as "(not {{03-open.labels_picker_state}})", the word
 * became an identity marker of 08-report's procedure (the issues list shows
 * "0 Closed"), and the compile refused the flow (unsourced-ref).
 */
function recording(opts: { shown?: 'line' | 'read'; value?: string; evidence?: boolean } = {}): RecordedEntry[] {
  const value = opts.value ?? 'closed';
  const evidence = opts.evidence ?? true;
  const click: RecordedEntry = {
    k: 'step',
    tool: 'click',
    args: { target: '@e2' },
    locators: { target: { expr: 'x', verified: true, raw: '@e2', chain: [{ kind: 'role', role: 'link', name: 'bug' }] } },
    ...(evidence ? { diff: { url: ISSUE, alerts: [], added: ['- listbox "bug"', ...(opts.shown === 'line' ? [`- status "${value}"`] : [])] } } : {}),
  };
  return [
    { k: 'step', tool: 'goto', args: { url: `${ORIGIN}/` }, locators: {} },
    { k: 'instruction', text: "Create an issue titled 'fx1 Bench Issue' and report its number.", url: `${ORIGIN}/bench/bench-repo/issues`, ...(evidence ? { startText: '- link "New Issue"' } : {}) },
    fill('@e1', 'fx1 Bench Issue'),
    { k: 'report', status: 'success', summary: 'Created issue #4.', values: { issue_number: '4', issue_url: ISSUE }, skill: 's_create' },
    { k: 'instruction', text: 'Open the Labels picker, set the labels to bug and priority-high, then close it. Report the exact list of labels shown on the issue afterwards.', url: ISSUE, ...(evidence ? { startText: ISSUE_PAGE } : {}) },
    click,
    ...(opts.shown === 'read'
      ? [{ k: 'step', tool: 'read', args: { target: '@e3', what: 'text' }, locators: { target: { expr: 'x', verified: true, raw: '@e3', chain: [{ kind: 'css', selector: '.combo' }] } }, result: JSON.stringify(value) } as RecordedEntry]
      : []),
    { k: 'report', status: 'success', summary: 'Labels set.', values: { labels_shown: 'bug, priority-high', labels_picker_state: value }, skill: 's_labels' },
    { k: 'instruction', text: `Do a fresh full page load of ${ISSUE} and confirm the issue is open (not ${value}). Report the state.`, url: ISSUE, ...(evidence ? { startText: ISSUE_PAGE } : {}) },
    { k: 'step', tool: 'goto', args: { url: ISSUE }, locators: {}, ...(evidence ? { diff: { url: `${ORIGIN}/bench/bench-repo/issues`, alerts: [], added: LIST_PAGE } } : {}) },
    { k: 'report', status: 'success', summary: 'Open.', values: { issue_state: 'open' }, skill: 's_report' },
  ];
}

function build(entries: RecordedEntry[]) {
  const flow = buildFlow(entries, { name: 'gt', origin: ORIGIN, startUrl: `${ORIGIN}/`, vars: { runid: 'fx1' }, session: 's', now: '2026-09-26T00:00:00Z' });
  expect(flow).toBeTruthy();
  return flow!;
}

describe('a report value the page never showed is not threaded (gitea fwgt17 08-report)', () => {
  it("keeps the later step's task word literal when no line of the page carried the value", () => {
    const flow = build(recording());
    const report = flow.steps[2];
    expect(report.instruction).toContain('(not closed)');
    expect(report.instruction).not.toContain('labels_picker_state');
    expect(flow.steps[1].outputs).toContain('labels_shown');
  });

  it('still threads the value when a page line showed it', () => {
    expect(build(recording({ shown: 'line' })).steps[2].instruction).toContain('{{02-open.labels_picker_state}}');
  });

  it('still threads the value when a read of the instruction returned it', () => {
    expect(build(recording({ shown: 'read' })).steps[2].instruction).toContain('{{02-open.labels_picker_state}}');
  });

  it("still threads a value shaped like a record id (a literal id would act on the recording run's record)", () => {
    expect(build(recording({ value: 'LB-00931' })).steps[2].instruction).toContain('{{02-open.labels_picker_state}}');
  });

  it('threads as before when the recording carries no page evidence for the instruction', () => {
    expect(build(recording({ evidence: false })).steps[2].instruction).toContain('{{02-open.labels_picker_state}}');
  });
});

describe('commentaryReport, the shared predicate', () => {
  it('names the value no line showed, and nothing else', () => {
    const group = recording().slice(4, 7); // the labels instruction, its click, its report
    expect(commentaryReport(group, 'labels_picker_state', 'closed')).toBe(true);
    expect(commentaryReport(group, 'labels_picker_state', 'LB-00931')).toBe(false); // id-shaped
    expect(commentaryReport(group.slice(1), 'labels_picker_state', 'closed')).toBe(false); // no instruction entry
    expect(commentaryReport(recording({ evidence: false }).slice(4, 7), 'labels_picker_state', 'closed')).toBe(false); // no evidence
    // Whole tokens, case aside: "Close Issue" on the start page does not show "closed"; a line carrying the word does.
    // (08-report's own page later shows "0 Closed": another instruction's evidence is not this one's.)
    expect(commentaryReport(recording({ shown: 'line' }).slice(4, 7), 'labels_picker_state', 'closed')).toBe(false);
  });
});
