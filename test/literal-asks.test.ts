/**
 * Round 59, Gitea fwgt10: an asked output held only by a template literal.
 *
 * 01-open's instruction asks to report "the exact titles of all OPEN issues".
 * Its procedure (chain s_e270d0, tail s_2ea0ba) has no read for
 * open_issue_titles; the value lives only as the literal "#1 Seed: triage
 * inbox, …" in s_2ea0ba's report template, which a replay publishes only when
 * the page it ends on shows that exact text — and it ends on the search page.
 * The round-56 export warning named asked outputs export PRUNED; this one was
 * declared, not pruned, so nothing said it. Test data: the published flow and
 * chain (test/fixture/fwgt10-flow.json, test/fixture/fwgt10-skills).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { literalOnlyAsks, unansweredForStep } from '../src/daemon/step-verdict.js';
import type { Skill } from '../src/skills/store.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture');
const flow = JSON.parse(fs.readFileSync(path.join(DIR, 'fwgt10-flow.json'), 'utf8'));
const chain: Skill[] = ['s_9d3a1a', 's_bf1a54', 's_1a62d4', 's_2ea0ba'].map((id) => JSON.parse(fs.readFileSync(path.join(DIR, 'fwgt10-skills', `${id}.json`), 'utf8')));

describe('literalOnlyAsks (fwgt10 01-open)', () => {
  it('names the asked outputs that only a template literal backs', () => {
    const step = flow.steps[0];
    // bench_issue_exists too: asked ("whether an issue titled … already exists"), and held only as the literal "no"
    expect(literalOnlyAsks(step.instruction, step.outputs, chain)).toEqual(['open_issue_titles', 'bench_issue_exists']);
  });

  it('never names an output a read publishes, one carried by a slot, or one nobody asked for', () => {
    const step = flow.steps[0];
    // open_issue_count is read (s_2ea0ba step 4); seed_prefixed_open_issues is a literal too but not asked
    const names = literalOnlyAsks(step.instruction, step.outputs, chain);
    expect(names).not.toContain('open_issue_count');
    expect(names).not.toContain('seed_prefixed_open_issues');
    const tail = chain[3];
    const slotted = { ...tail, reportTemplate: { ...tail.reportTemplate!, values: { ...tail.reportTemplate!.values, open_issue_titles: '{{v1}} titles' } } };
    expect(literalOnlyAsks(step.instruction, step.outputs, [...chain.slice(0, 3), slotted])).toEqual(['bench_issue_exists']);
    const read = { ...tail, steps: [...tail.steps, { tool: 'read', args: { target: '(read-back)', what: 'text' }, locators: {}, label: 'open_issue_titles' }] } as Skill;
    expect(literalOnlyAsks(step.instruction, step.outputs, [...chain.slice(0, 3), read])).toEqual(['bench_issue_exists']);
  });
});

describe('unansweredForStep: the replay warns whatever its reads published (fwgt10-n2 01-open)', () => {
  // fwgt10-n2's flowrun: 01-open succeeded with these values and `unanswered:
  // ["bench_issue_exists"]` — open_issue_titles, asked and never published, went
  // unsaid. main's unansweredAsks on these inputs names it, so some published
  // key answered it at runtime; the cause is not in the published artifacts.
  // The literal-only rule answers it without depending on that key set.
  const step = flow.steps[0];
  const n2 = { signed_in_username: 'admin', ref: 'fwgt10-n2', open_issue_count: '3', closed_issue_count: '0', closed_issue_count_menu: '0 Closed' };
  const input = { instruction: step.instruction, outputs: step.outputs, pruned: [], reported: n2, recorded: {}, chain };

  it('names open_issue_titles even when a published key would answer the ask by name', () => {
    expect(unansweredForStep({ ...input, published: [] })).toEqual(expect.arrayContaining(['open_issue_titles', 'bench_issue_exists']));
    expect(unansweredForStep({ ...input, published: ['open_issue_titles', 'bench_issue_exists'] })).toEqual(['open_issue_titles', 'bench_issue_exists']);
  });

  it('is quiet once the report carries the value', () => {
    const reported = { ...n2, open_issue_titles: '#1 Seed: triage inbox', bench_issue_exists: 'no' };
    expect(unansweredForStep({ ...input, reported, published: [] })).toEqual([]);
  });
});
