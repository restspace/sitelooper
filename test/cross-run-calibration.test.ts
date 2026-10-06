/**
 * Item 2 of the compiled-spec reliability contract: calibrate checks with
 * cross-run evidence.
 *
 * 2a. Candidate retirement — the daemon orders a chain with a demonstrated-
 * volatile candidate last in its class (`retired()`, repair.ts); the artifact
 * used to omit it and so tried the candidates in another order. The compiler
 * reads the same store, so it renders the same verdict.
 *
 * 2b. Text generalisation for expectation lines (survey T1: a number the
 * recording froze into a line — "S00022", "#4", "Inbox 3"). A false match is
 * a false pass, so the negative cases matter as much as the positive ones.
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { observationSource, observationSources } from '../src/spec/locators.js';
import { retired } from '../src/skills/repair.js';
import { orderCandidates, structuralCandidate } from '../src/execution/resolve.js';
import { expectedChangesVerdict, generaliseLine, type ChangeObservation } from '../src/execution/expect.js';
import { replaySkill } from '../src/skills/replay.js';
import { confirmedGeneralisations, keepGeneralisations } from '../src/agent/tools.js';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import type { Skill } from '../src/skills/store.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';

describe('2a: retirement baked into the compiled observations', () => {
  const volatile: LocatorCandidate = { kind: 'role', role: 'button', name: 'Edit 1', seen: { hit: 0, miss: 2 } } as LocatorCandidate;

  it('renders retired: true exactly when the daemon\'s retired() holds, and never the raw counts', () => {
    const src = observationSource(volatile, 0);
    expect(src).toContain('retired: true');
    expect(src).not.toContain('seen');
    expect(src).not.toContain('miss');
    // one miss is a transient; a candidate that ever resolved is not volatile
    for (const seen of [{ hit: 0, miss: 1 }, { hit: 1, miss: 5 }, undefined]) {
      const c = { kind: 'role', role: 'button', name: 'Edit', ...(seen ? { seen } : {}) } as LocatorCandidate;
      expect(retired(c as { seen?: { hit: number; miss: number } })).toBe(false);
      expect(observationSource(c, 0)).not.toContain('retired');
    }
  });

  it('orders a chain in the artifact as replay orders it from the same store', () => {
    const chain = [
      volatile,
      { kind: 'role', role: 'button', name: 'Edit' },
      { kind: 'text', text: 'Edit row', seen: { hit: 0, miss: 3 } },
      { kind: 'css', selector: '#rows > tr:nth-of-type(1) button' },
      { kind: 'label', label: 'Edit item', seen: { hit: 2, miss: 4 } },
    ] as LocatorCandidate[];
    const fakeLoc = (what: string) => ({ toString: () => what });
    const page = {
      getByRole: (r: string) => fakeLoc(`role ${r}`),
      getByText: (t: string) => fakeLoc(`text ${t}`),
      getByLabel: (t: string) => fakeLoc(`label ${t}`),
      locator: (s: string) => fakeLoc(`css ${s}`),
    };
    const emitted = observationSources(chain).map(
      (src) => new Function('page', 'p', 'pointLocator', 'roleName', `return ${src}`)(page, {}, () => null, (n: string) => n) as { index: number; kind: string; structural: boolean; retired?: boolean },
    );
    // What replay's resolveChain builds per candidate (replay.ts): the same
    // three inputs to the shared ordering.
    const daemon = chain.map((c, index) => ({ index, kind: c.kind, structural: structuralCandidate(c), retired: retired(c as { seen?: { hit: number; miss: number } }) }));
    const artifactOrder = orderCandidates(emitted).map((o) => o.index);
    expect(artifactOrder).toEqual(orderCandidates(daemon).map((o) => o.index));
    // and the evidence moved something: the volatile primary is no longer first
    expect(artifactOrder[0]).not.toBe(0);
    expect(artifactOrder.indexOf(0)).toBeGreaterThan(artifactOrder.indexOf(1));
  });
});

const ctx = (over: Partial<{ tag: string; tool: string; value?: string }> = {}) => ({ tag: '3', tool: 'click', positionalResolution: false, ...over });
const seen = (added: string[] | null, live: string[] = added ?? []): ChangeObservation => ({ added, live: async () => ({ lines: live, complete: true }) });

describe('2b: generaliseLine — what may differ', () => {
  it('a minted number in a heading (S00022 → S00023)', () => {
    expect(generaliseLine('- heading "Quotation S00022"', ['- heading "Quotation S00023"'], [])).toEqual({
      to: '- heading "Quotation {{*}}"',
      seen: '- heading "Quotation S00023"',
    });
  });

  it('a counter in a name ("Inbox 3")', () => {
    expect(generaliseLine('- link "Inbox 3"', ['- link "Inbox 12"'], [])?.to).toBe('- link "Inbox {{*}}"');
  });

  it('a one-digit "#4" after a title (fwgt27)', () => {
    expect(generaliseLine('- heading "Fix the login page #4"', ['- heading "Fix the login page #5"'], [])?.to).toBe('- heading "Fix the login page #{{*}}"');
  });

  it('a relative time the volatile mask does not know', () => {
    expect(generaliseLine('- cell "Posted 3h"', ['- cell "Posted 14h"'], [])?.to).toBe('- cell "Posted {{*}}"');
  });

  it('keeps an unchanged number literal, and a value after the colon generalises the same way', () => {
    expect(generaliseLine('- row "Batch 7 of 12"', ['- row "Batch 8 of 12"'], [])?.to).toBe('- row "Batch {{*}} of 12"');
    expect(generaliseLine('- status "Queue": 4 jobs', ['- status "Queue": 9 jobs'], [])?.to).toBe('- status "Queue": {{*}} jobs');
  });

  it('works on a line that already carries a mask wildcard', () => {
    expect(generaliseLine('- row "Order 41 {{*}} Draft"', ['- row "Order 42 10:31 Draft"'], [])?.to).toBe('- row "Order {{*}} {{*}} Draft"');
  });
});

describe('2b: generaliseLine — what must NOT generalise', () => {
  it('a different record name: a word-only difference', () => {
    expect(generaliseLine('- heading "Quotation Draft"', ['- heading "Quotation Sent"'], [])).toBeNull();
    expect(generaliseLine('- row "Order Alpha 1"', ['- row "Order Beta 2"'], [])).toBeNull();
  });

  it('a token whose letters changed, not just its digits', () => {
    expect(generaliseLine('- link "Release v2"', ['- link "Release draft3"'], [])).toBeNull();
    expect(generaliseLine('- heading "Ticket SO22"', ['- heading "Ticket PO22x"'], [])).toBeNull();
  });

  it('a number turned into a word, or a word into a number', () => {
    expect(generaliseLine('- cell "Posted 3h"', ['- cell "Posted now"'], [])).toBeNull();
    expect(generaliseLine('- cell "Posted now"', ['- cell "Posted 3h"'], [])).toBeNull();
  });

  it('a differing token that is, sits inside, or contains a value of this run', () => {
    expect(generaliseLine('- heading "Quotation S00022"', ['- heading "Quotation S00023"'], ['S00023'])).toBeNull();
    expect(generaliseLine('- heading "Quotation S00022"', ['- heading "Quotation S00023"'], ['ref S00023 new'])).toBeNull();
    expect(generaliseLine('- heading "Ticket 4417"', ['- heading "Ticket 4418"'], ['18'])).toBeNull();
  });

  it('a line that is nothing but its number', () => {
    expect(generaliseLine('- cell "42"', ['- cell "43"'], [])).toBeNull();
    expect(generaliseLine('- link "#4"', ['- link "#5"'], [])).toBeNull();
    // a state word does not count as a word of the name
    expect(generaliseLine('- heading "42" [level=2]', ['- heading "43" [level=2]'], [])).toBeNull();
  });

  it('a different role, or a different state', () => {
    expect(generaliseLine('- heading "Quotation S00022"', ['- link "Quotation S00023"'], [])).toBeNull();
    expect(generaliseLine('- heading "Quotation S00022" [level=1]', ['- heading "Quotation S00023" [level=2]'], [])).toBeNull();
  });

  it('two candidates: a list of rows differing by number is a guess, not a match', () => {
    expect(generaliseLine('- row "Order 41 Draft"', ['- row "Order 42 Draft"', '- row "Order 43 Draft"'], [])).toBeNull();
  });

  it('a line carrying any marker: a slot is HARD, a derived value names its own, a secret is never filled', () => {
    expect(generaliseLine('- heading "Quotation {{v1}} 4"', ['- heading "Quotation Acme 5"'], [])).toBeNull();
    expect(generaliseLine('- heading "Order {{d1}} 4"', ['- heading "Order X 5"'], [])).toBeNull();
    expect(generaliseLine('- cell "{{env:USER}} 4"', ['- cell "bob 5"'], [])).toBeNull();
  });

  it('nothing differs, nothing to generalise', () => {
    expect(generaliseLine('- link "Inbox 3"', ['- link "Inbox 3"'], [])).toBeNull();
  });
});

describe('2b: the shared verdict', () => {
  it('passes with a warning and hands back the generalisation when the DIFF added the line', async () => {
    const v = await expectedChangesVerdict(['- heading "Quotation S00022"'], {}, ctx(), seen(['- heading "Quotation S00023"', '- button "Confirm"']));
    expect(v.stop).toBeUndefined();
    expect(v.confirmed).toBeUndefined();
    expect(v.generalised).toEqual({ from: '- heading "Quotation S00022"', to: '- heading "Quotation {{*}}"' });
    expect(v.warnings.join(' ')).toMatch(/differs from it only in numbers — matched as "- heading \\"Quotation \{\{\*\}\}\\""/);
  });

  it('does not generalise against the live page alone — an old sibling row is no evidence the step did anything', async () => {
    const v = await expectedChangesVerdict(['- row "Order S00022 Draft"'], {}, ctx(), seen([], ['- row "Order S00021 Draft"']));
    expect(v.stop).toMatch(/none of the 1 recorded page change/);
    expect(v.generalised).toBeUndefined();
  });

  it('does not generalise when the diff could not be captured', async () => {
    const v = await expectedChangesVerdict(['- heading "Quotation S00022"'], {}, ctx(), seen(null, ['- heading "Quotation S00023"']));
    expect(v.stop).toBeDefined();
    expect(v.generalised).toBeUndefined();
  });

  it('keeps a HARD line hard: a {{vN}} line still stops on a number difference', async () => {
    const v = await expectedChangesVerdict(['- heading "{{v1}} 4"'], { v1: 'Fix login' }, ctx(), seen(['- heading "Fix login 5"']));
    expect(v.stop).toMatch(/did not show/);
    expect(v.generalised).toBeUndefined();
  });

  it('refuses a token that is this run\'s typed value', async () => {
    const v = await expectedChangesVerdict(['- heading "Invoice 1001"'], {}, ctx({ tool: 'fill', value: '1002' }), seen(['- heading "Invoice 1002"']));
    expect(v.stop).toBeDefined();
    expect(v.generalised).toBeUndefined();
  });

  it('leaves an exact match alone', async () => {
    const v = await expectedChangesVerdict(['- heading "Quotation S00022"'], {}, ctx(), seen(['- heading "Quotation S00022"']));
    expect(v).toEqual({ warnings: [], confirmed: true, inDiff: ['- heading "Quotation S00022"'] });
  });
});

describe('2b: replay stages the generalisation for the caller', () => {
  function fakePage(state: { url: string }): Page {
    return { url: () => state.url, evaluate: async () => undefined, locator: () => ({ first: () => ({}) }) } as unknown as Page;
  }
  const skill = (line: string): Skill => ({
    id: 's_gen',
    origin: 'http://h:1',
    template: 'open the quotation',
    params: {},
    preconditions: { urlPattern: 'http://h:1/' },
    steps: [
      { tool: 'goto', args: { url: 'http://h:1/q' }, locators: {}, expect: { urlPattern: 'http://h:1/q', addedContains: [line] } },
      { tool: 'goto', args: { url: 'http://h:1/next' }, locators: {}, expect: { urlPattern: 'http://h:1/next' } },
    ],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
  });
  const run = (line: string, added: string[]) => {
    const state = { url: 'http://h:1/' };
    return replaySkill(skill(line), {}, {
      page: fakePage(state),
      exec: async (tool, args) => {
        if (tool === 'goto') state.url = String(args.url);
        return { result: 'ok', diff: { url: state.url, alerts: [], added } };
      },
    });
  };

  it('a line that differed only in its number: the replay continues and stages { kind: line }', async () => {
    const res = await run('- heading "Quotation S00022"', ['- heading "Quotation S00023"']);
    expect(res.ok).toBe(true);
    expect(res.generalisations).toContainEqual({ kind: 'line', step: 1, from: '- heading "Quotation S00022"', to: '- heading "Quotation {{*}}"' });
    expect(res.warnings.join(' ')).toMatch(/differs from it only in numbers/);
  });

  it('a word-only difference still stops the replay and stages nothing', async () => {
    const res = await run('- heading "Quotation Draft"', ['- heading "Quotation Sent"']);
    expect(res.ok).toBe(false);
    expect(res.failedAt).toBe(1);
    expect(res.generalisations.filter((g) => g.kind === 'line')).toEqual([]);
  });
});

describe('2b: the daemon keeps a line generalisation only once the replay walked past it (tools.ts)', () => {
  const stored = (over: Partial<Skill> = {}): Skill => ({
    id: 's_keep',
    origin: 'http://h:1',
    template: 'open the quotation',
    params: {},
    preconditions: { urlPattern: 'http://h:1/' },
    steps: [
      { tool: 'click', args: { target: '@e1' }, locators: {}, expect: { addedContains: ['- heading "Quotation S00022"', '- button "Confirm"'] } },
      { tool: 'click', args: { target: '@e2' }, locators: {} },
    ],
    stats: { uses: 3, successes: 3, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0, verifiedContract: true } as Skill['stats'],
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
    ...over,
  });
  const line = { kind: 'line' as const, step: 1, from: '- heading "Quotation S00022"', to: '- heading "Quotation {{*}}"' };

  it('is confirmed past its step, not before', () => {
    expect(confirmedGeneralisations({ generalisations: [line], stepsRun: 1, ok: false })).toEqual([]);
    expect(confirmedGeneralisations({ generalisations: [line], stepsRun: 2, ok: false })).toEqual([line]);
    expect(confirmedGeneralisations({ generalisations: [line], stepsRun: 1, ok: true })).toEqual([line]);
  });

  it('replaces the line in place, declares it as a replay line generalisation and gives up the verified contract', () => {
    const kept = keepGeneralisations(stored(), [line], 'now')!;
    expect(kept.steps[0].expect?.addedContains).toEqual(['- heading "Quotation {{*}}"', '- button "Confirm"']);
    expect(kept.provenance.contractChanges).toEqual([{ at: 'now', by: 'replay line generalisation', gave: ['step 1: no longer asserts page text "- heading \\"Quotation S00022\\""'] }]);
    expect((kept.stats as { verifiedContract?: unknown }).verifiedContract).toBeUndefined();
  });

  it('changes nothing on an assertion, a loop, or a line that is gone already', () => {
    const assertion = stored();
    (assertion.steps[0] as { assert?: true }).assert = true;
    expect(keepGeneralisations(assertion, [line])).toBeNull();
    expect(keepGeneralisations(stored(), [{ ...line, from: '- heading "Other"' }])).toBeNull();
    expect(keepGeneralisations(stored(), [{ ...line, step: 2 }])).toBeNull();
  });
});
