import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { buildFlow } from '../src/skills/flow.js';
import { emptyFacts, observeFact, type SiteFacts } from '../src/execution/facts.js';
import { shapeKeyOf, type ValueShadowRow } from '../src/skills/facts-value.js';

const GT = 'http://127.0.0.1:3000';
const ISSUE = `${GT}/bench/repo/issues/1`;

/**
 * gitea fwgt17's shape, where the page DOES show the word: 01-open reported
 * `labels_picker_state = "closed"` and the issues list it went on to shows
 * `"0 Closed"`, so commentaryReport (which asks only whether the page ever
 * showed the word) lets it through and 02-check's "open (not closed)" is
 * threaded to it today. A reliable `state` role under the label (two
 * sessions saw a state word reported there) stops it.
 */
// The picker state is ASKED here, so today's rule threads it and the facts are
// what decide; unasked (fwgt17's real wording) it stays literal without facts.
function recording(ask = ' and the labels picker state'): RecordedEntry[] {
  return [
    { k: 'step', tool: 'goto', args: { url: ISSUE }, locators: {} },
    { k: 'instruction', text: `Open ${ISSUE} and report the labels shown on the issue${ask}.`, url: ISSUE, startText: '- heading "Bench issue"\n- button "Labels"' },
    { k: 'step', tool: 'click', args: { target: '@e1' }, locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name: 'Labels' }] } }, diff: { url: ISSUE, alerts: [], added: ['- option "bug"'] } },
    { k: 'report', status: 'success', summary: 'Labels: none; the picker is closed.', values: { labels_picker_state: 'closed' }, skill: 's_open' },
    { k: 'instruction', text: 'Go to the issues list and confirm the issue is open (not closed).', url: `${GT}/bench/repo/issues`, startText: '- link "1 Open"\n- link "0 Closed"' },
    { k: 'report', status: 'success', summary: 'Confirmed.', values: { issue_state: 'open' }, skill: 's_check' },
  ];
}

const roleFacts = (role: 'state' | 'count' | 'name', sessions: string[]): SiteFacts => {
  const sf = emptyFacts(GT);
  for (const session of sessions) observeFact(sf, { k: 'value.role', key: shapeKeyOf(ISSUE, 'labels_picker_state'), v: role, hard: false, session });
  return sf;
};

const build = (facts?: SiteFacts, ask?: string) => {
  const rows: ValueShadowRow[] = [];
  const flow = buildFlow(recording(ask), { name: 'gt', origin: GT, startUrl: ISSUE, vars: { runid: 'fx1' }, session: 's', now: '2026-09-26T00:00:00Z', ...(facts ? { facts, onFactRow: (r: ValueShadowRow) => rows.push(r) } : {}) })!;
  return { flow, rows };
};

describe('a state-role label value is not threaded once the role is reliable (stage 4, gitea fwgt17)', () => {
  it('today (no facts) the shown word is threaded when the step was asked for it', () => {
    expect(build().flow.steps[1].instruction).toContain('(not {{01-open.labels_picker_state}})');
  });

  it('fwgt17 as recorded: an UNASKED word reported before the first change stays literal, facts or not', () => {
    expect(build(undefined, '').flow.steps[1].instruction).toBe('Go to the issues list and confirm the issue is open (not closed).');
  });

  it('a reliable state role keeps the word literal, and the facts.role row is applied', () => {
    const { flow, rows } = build(roleFacts('state', ['a', 'b']));
    expect(flow.steps[1].instruction).toContain('(not closed)');
    expect(rows.find((r) => r.rule === 'facts.role' && r.step === 'export labels_picker_state')).toMatchObject({ fact: 'state', heuristic: 'threaded', applied: true });
    expect(rows.find((r) => r.rule === 'facts.seed' && r.step === 'export labels_picker_state')).toMatchObject({ fact: 'none', heuristic: 'threaded', agree: true });
  });

  it('one session only: advisory, threaded as today', () => {
    expect(build(roleFacts('state', ['a'])).flow.steps[1].instruction).toContain('(not {{01-open.labels_picker_state}})');
  });

  it('a name role never decides', () => {
    expect(build(roleFacts('name', ['a', 'b'])).flow.steps[1].instruction).toContain('(not {{01-open.labels_picker_state}})');
  });

  it('empty facts: byte-identical to no facts', () => {
    expect(JSON.stringify(build(emptyFacts(GT)).flow)).toBe(JSON.stringify(build().flow));
  });
});
