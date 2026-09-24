import { describe, expect, it } from 'vitest';
import { givenPartialReason, typedSlots, unobservedGiven } from '../src/execution/report.js';
import { synthesizeReport } from '../src/skills/learn.js';
import { partialReasons } from '../src/daemon/step-verdict.js';
import type { Skill } from '../src/skills/store.js';

/**
 * Round 60, Gitea fwgt11 07-add. Chain s_dba564: s_3db36f fills the comment
 * (`{{v11}}`) and submits it; s_c8e15e reads the issue back. s_c8e15e's
 * template carried `issue_content_right_a_it: "{{v7}}"` and `…_2: "{{v8}}"` —
 * the recording's read_all of the sidebar labels, split into keys — and v7/v8
 * are the flow's literals "bug" and "priority-high", taken from the
 * instruction. Nothing in the chain types or reads them (usedIn []). On n2 and
 * n3, 04-set had applied only priority-high: the live read of the same
 * sidebar published `labels_shown: "priority-high"`, and the template put
 * `issue_content_right_a_it: "bug"` beside it as if observed.
 */
const n2Params: Record<string, string> = {
  v1: 'http://127.0.0.1:8095/bench/bench-repo/issues/5',
  v4: 'bench-repo',
  v5: 'fwgt11-n2 Bench Issue',
  v6: 'fwgt11-n2',
  v7: 'bug',
  v8: 'priority-high',
  v9: 'bench-assignee',
  v10: 'Bench Milestone',
  v11: 'Comment for run fwgt11-n2.',
  d1: 'issuecomment-9',
};

const values = {
  issue_number: '#4',
  issue_title: '{{v5}}',
  comment_text: '{{v11}}',
  comment_anchor: '#{{d1}}',
  labels_shown: '{{v7}}, {{v8}}',
  assignee_username: '{{v9}}',
  milestone_name: '{{v10}}',
  milestone_id: '1',
  issue_content_right_a_it: '{{v7}}',
  issue_content_right_a_it_2: '{{v8}}',
  ref: '{{v6}}',
};

const param = (example: string) => ({ example, usedIn: [] as number[], known: true });

/** s_3db36f, the chain's first segment: fills the comment and submits it. */
const commentSegment: Skill = {
  id: 's_3db36f',
  origin: 'http://127.0.0.1:8095',
  template: 'add a comment',
  params: { v11: { example: 'Comment for run fwgt11-n1.', usedIn: [0] } },
  preconditions: {},
  steps: [
    { tool: 'fill', args: { target: '@e264', value: '{{v11}}' }, locators: { target: [{ kind: 'css', selector: 'textarea' }] } },
    { tool: 'click', args: { target: 'role=button[name="Comment"]' }, locators: { target: [{ kind: 'role', role: 'button', name: 'Comment' }] } },
  ],
  stats: { runs: 1, successes: 1, failures: 0 },
  seq: { chain: 's_dba564', index: 0, of: 2 },
} as unknown as Skill;

/** s_c8e15e, the tail: reads only, its template as n1 recorded it. */
const readSegment: Skill = {
  id: 's_c8e15e',
  origin: 'http://127.0.0.1:8095',
  template: 'confirm the issue',
  params: {
    v1: param('http://127.0.0.1:8095/bench/bench-repo/issues/4'),
    v4: param('bench-repo'),
    v5: param('fwgt11-n1 Bench Issue'),
    v6: param('fwgt11-n1'),
    v7: param('bug'),
    v8: param('priority-high'),
    v9: param('bench-assignee'),
    v10: param('Bench Milestone'),
    v11: param('Comment for run fwgt11-n1.'),
  },
  preconditions: {},
  steps: [
    { tool: 'read_all', args: { target: '.issue-content-right a.item[href*="labels="]:not([data-value])', what: 'text' }, locators: { target: [{ kind: 'css', selector: '.issue-content-right a.item' }] }, label: 'labels_shown' },
    { tool: 'read', args: { target: '(read-back)', what: 'value' }, locators: { target: [{ kind: 'css', selector: '#issue-title' }] }, label: 'issue_title' },
    { tool: 'read', args: { target: '(read-back)', what: 'text' }, locators: { target: [{ kind: 'css', selector: '#comment' }] }, label: 'comment_text' },
  ],
  reportTemplate: { summary: '', values },
  stats: { runs: 1, successes: 1, failures: 0 },
  seq: { chain: 's_dba564', index: 1, of: 2 },
} as unknown as Skill;

/** What n2's reads returned (fwgt11-n2-flowrun.json, 07-add). */
const n2Live = {
  labels_shown: 'priority-high',
  issue_number: '#5',
  issue_title: 'fwgt11-n2 Bench Issue',
  comment_text: 'Comment for run fwgt11-n2.',
  assignee_shown: 'bench-assignee\n(Bench Assignee)',
  milestone_id: '1',
};

/** n2's issue page once the comment was posted: the sidebar shows priority-high alone. */
const n2Page = [
  'fwgt11-n2 Bench Issue #5',
  'Labels',
  'priority-high',
  'Milestone',
  'Bench Milestone',
  'Assignees',
  'bench-assignee (Bench Assignee)',
  'admin added the priority-high label',
  'Comment for run fwgt11-n2.',
  'http://127.0.0.1:8095/bench/bench-repo/issues/5#issuecomment-9',
];

describe('a report value made only of params is published only where this run observed it (round 60, fwgt11 07-add)', () => {
  it('n2: withholds the label the issue does not show, and publishes the one it does', () => {
    const report = synthesizeReport(readSegment, n2Params, n2Live, n2Page, { chain: [commentSegment, readSegment] });
    const got = report.evidence?.values ?? {};
    expect(got.issue_content_right_a_it).toBeUndefined();
    expect(got.issue_content_right_a_it_2).toBe('priority-high');
    // Live reads win outright, as before.
    expect(got.labels_shown).toBe('priority-high');
    // Shown on the page: the milestone and the assignee.
    expect(got.milestone_name).toBe('Bench Milestone');
    expect(got.assignee_username).toBe('bench-assignee');
    // Held by a live read (issue_title "fwgt11-n2 Bench Issue") and the url.
    expect(got.ref).toBe('fwgt11-n2');
    expect(JSON.stringify(got)).not.toContain('"bug"');
  });

  it('the recording run, whose issue showed both labels, still publishes both', () => {
    const page = ['Labels', 'bug', 'priority-high', 'Milestone', 'Bench Milestone', 'http://127.0.0.1:8095/bench/bench-repo/issues/5'];
    const report = synthesizeReport(readSegment, n2Params, { ...n2Live, labels_shown: 'bug | priority-high' }, page, { chain: [commentSegment, readSegment] });
    expect(report.evidence?.values?.issue_content_right_a_it).toBe('bug');
    expect(report.evidence?.values?.issue_content_right_a_it_2).toBe('priority-high');
  });

  /**
   * Phase B provenance, stage 1: a slot the chain TYPED is no longer exempt.
   * The comment is published only where this run committed it — the Comment
   * click's own diff showed it outside the textarea (ReplayResult.committed) —
   * or a read returned it. Round 60 published it on the typing alone.
   */
  it('a value the chain TYPED is published only where this run committed it or read it', () => {
    const { comment_text: _read, ...live } = n2Live;
    const page = n2Page.filter((l) => !l.startsWith('Comment for run'));
    const typedOnly = synthesizeReport(readSegment, n2Params, live, page, { chain: [commentSegment, readSegment] });
    expect(typedOnly.evidence?.values?.comment_text).toBeUndefined();
    const committed = synthesizeReport(readSegment, n2Params, live, page, { chain: [commentSegment, readSegment], committed: ['v11'] });
    expect(committed.evidence?.values?.comment_text).toBe('Comment for run fwgt11-n2.');
    // A read of this run that returned it is observation enough.
    const read = synthesizeReport(readSegment, n2Params, { ...live, timeline: 'admin commented: Comment for run fwgt11-n2.' }, page, { chain: [commentSegment, readSegment] });
    expect(read.evidence?.values?.comment_text).toBe('Comment for run fwgt11-n2.');
    // Not typed by the tail alone: judged on the page, and withheld.
    const alone = synthesizeReport(readSegment, n2Params, live, page, { chain: [readSegment] });
    expect(alone.evidence?.values?.comment_text).toBeUndefined();
  });

  it('a page that could not be read observes nothing: only live reads and typed slots stand', () => {
    const report = synthesizeReport(readSegment, n2Params, n2Live, null, { chain: [commentSegment, readSegment] });
    const got = report.evidence?.values ?? {};
    expect(got.issue_content_right_a_it).toBeUndefined();
    expect(got.milestone_name).toBeUndefined();
    expect(got.issue_content_right_a_it_2).toBe('priority-high');
    expect(got.ref).toBe('fwgt11-n2');
  });

  it('an id used only in the url is observed there', () => {
    const skill = { ...readSegment, reportTemplate: { summary: '', values: { issue_index: '{{v12}}' } } } as Skill;
    const shown = ['Labels', 'http://127.0.0.1:8095/bench/bench-repo/issues/5'];
    expect(synthesizeReport(skill, { ...n2Params, v12: '5' }, {}, shown).evidence?.values?.issue_index).toBe('5');
    expect(synthesizeReport(skill, { ...n2Params, v12: '7' }, {}, shown).evidence?.values?.issue_index).toBeUndefined();
  });

  it('names the slots it did not observe, and the slots a chain typed', () => {
    expect(typedSlots([commentSegment, readSegment].flatMap((s) => s.steps))).toEqual(['v11']);
    expect(unobservedGiven('{{v7}}', n2Params, n2Page, { typed: [], live: Object.values(n2Live) })).toEqual(['v7']);
    expect(unobservedGiven('{{v8}}', n2Params, n2Page, { typed: [], live: [] })).toEqual([]);
    // A value with recorded text is the literal rule's (unshownLiterals), not this one's.
    expect(unobservedGiven('{{v7}} label', n2Params, n2Page, { typed: [], live: [] })).toEqual([]);
  });
});

describe('a withheld given value makes the step partial only when its instruction asked for it', () => {
  const instruction = 'Open the issue and report the milestone name and the labels shown.';
  it('asked: partial', () => {
    expect(
      partialReasons({
        reportStatus: 'success',
        recovered: false,
        given: ['labels_shown'],
        declaredOutputs: ['labels_shown', 'issue_content_right_a_it'],
        values: {},
        instruction,
      }),
    ).toEqual([givenPartialReason('labels_shown')]);
  });

  it('not asked (fwgt11 07-add’s issue_content_right_a_it): a warning, not partial', () => {
    expect(
      partialReasons({
        reportStatus: 'success',
        recovered: false,
        given: ['issue_content_right_a_it'],
        declaredOutputs: ['labels_shown', 'issue_content_right_a_it'],
        values: { labels_shown: 'priority-high' },
        instruction,
      }),
    ).toEqual([]);
  });
});
