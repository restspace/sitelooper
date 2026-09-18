import { describe, expect, it } from 'vitest';
import { parseAnswers, type AskResult, type Entry, type Questions, type SystemOne, type SystemOneDecision } from '../src/agent/system-one.js';
import { expectationDecisions, threadingDecisions, type ThreadingDecision, type ValueOrigin } from '../src/skills/triage.js';
import { readExpectation, readOccurrence, triageOccurrences, triageSession } from '../src/skills/triage-jev.js';
import type { RecordedEntry } from '../src/daemon/recorder.js';

/**
 * Sites I and J are ADVISORY: the whole of their contract is that they log and
 * change nothing, and that Jev absent, Jev slow and Jev failing are the same
 * outcome. So the tests here are mostly about what must NOT happen.
 *
 * Same fake as test/system-one.test.ts — a client that answers from a script,
 * counting asks, so the batching claim (many pairs, few requests) is measured
 * rather than asserted in a comment.
 */
function scriptedSystemOne(
  answer: (state: Entry, questions: Questions, n: number) => Record<string, unknown> | Promise<Record<string, unknown>>,
): SystemOne & { asks: number; states: Entry[]; questionCounts: number[] } {
  const self = {
    model: 'jev-test',
    asks: 0,
    states: [] as Entry[],
    questionCounts: [] as number[],
    async ask<Q extends Questions>(state: Entry, questions: Q): Promise<AskResult<Q>> {
      const n = ++self.asks;
      self.states.push(state);
      self.questionCounts.push(Object.keys(questions).length);
      const answers = await answer(state, questions, n);
      return { ...parseAnswers(questions, { model: 'jev-test', answers, usage: { input_tokens: 10, output_tokens: 0 } }), ms: 1 };
    },
  };
  return self;
}

/** Answer every question by name: the value fan-out flat, the per-occurrence ones from `by`. */
const answerAll = (by: (key: string) => number) => (_state: Entry, questions: Questions): Record<string, unknown> =>
  Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'noul', noul: by(k) }]));

const value = (v: string, over: Partial<ValueOrigin> = {}): ValueOrigin => ({ value: v, label: 'v', whereReadFrom: 'read', ...over });

const pairs = (): ThreadingDecision[] =>
  threadingDecisions(
    [value('bench', { label: 'tags', whereReadFrom: 'typed' }), value('RD-1015', { label: 'ticket_ref' })],
    [
      { kind: 'url', where: 'step 1 args.url', text: 'http://h/d/uid/fwgr8-n1-bench-dashboard' },
      { kind: 'expectation', where: 'step 2 added[0]', text: '- row "RD-1015 bench"' },
    ],
  );

const lines = (added: string[]): ReturnType<typeof expectationDecisions> => {
  const entries: RecordedEntry[] = [
    { k: 'instruction', text: 'Do the thing.' },
    { k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: '', alerts: [], added } },
  ];
  return expectationDecisions({ entries });
};

describe('the reduces', () => {
  it('holds a fragment to a higher bar on derivation than a standalone occurrence', () => {
    const noul = (n: number) => ({ type: 'noul' as const, noul: n });
    // Standalone: 0.6 is enough. A fragment of a longer token: it is not.
    expect(readOccurrence(noul(0.6), noul(0.1)).said).toBe('same');
    expect(readOccurrence(noul(0.6), noul(0.9)).said).toBe('coincidence');
    expect(readOccurrence(noul(0.9), noul(0.9)).said).toBe('same');
    // Confidence is distance from the bar that was APPLIED, not from a coin flip.
    expect(readOccurrence(noul(0.8), noul(0.9)).confidence).toBeLessThan(0.2);
  });

  it('reduces "every run" by its weakest answer and "this run" by its strongest reason', () => {
    const noul = (n: number) => ({ type: 'noul' as const, noul: n });
    const every = readExpectation({ stable: noul(0.9), moment: noul(0.1), transient: noul(0.4), minted: noul(0.1) });
    expect(every.said).toBe('every-run');
    // The 0.4 transient answer is the weakest: 0.2 away from a coin flip.
    expect(every.confidence).toBeCloseTo(0.2, 5);
    // One confident veto settles it however undecided the others were: an
    // `any` reduced by its weakest member would report a certain clock time
    // as a coin flip.
    const clock = readExpectation({ stable: noul(0.9), moment: noul(0.99), transient: noul(0.5), minted: noul(0.5) });
    expect([clock.said, clock.confidence]).toEqual(['this-run', 0.98]);
  });
});

describe('triageOccurrences', () => {
  it('shards by value, so many pairs cost few requests and share one state', async () => {
    const s1 = scriptedSystemOne(answerAll(() => 0.9));
    const decisions = pairs();
    expect(decisions.length).toBeGreaterThan(2);
    const out = await triageOccurrences(s1, decisions);
    // Two values, so two requests — not one per pair.
    expect(s1.asks).toBe(2);
    expect(out!.length).toBe(decisions.length);
    // The value fan-out (4) plus two questions per occurrence, all in one ask.
    expect(s1.questionCounts.every((n) => n >= 6)).toBe(true);
  });

  it('reports agreement and disagreement against what the rule said', async () => {
    // Everything "derived", nothing "a piece": Jev says same to every pair.
    const s1 = scriptedSystemOne(answerAll((k) => (k.endsWith('_piece') ? 0.05 : 0.95)));
    const out = await triageOccurrences(s1, pairs());
    const bench = out!.find((v) => v.decision.enclosingToken === 'fwgr8-n1-bench-dashboard')!;
    expect([bench.decision.ruleSaid, bench.jevSaid, bench.agrees]).toEqual(['coincidence', 'same', false]);
    const ref = out!.find((v) => v.decision.value === 'RD-1015')!;
    expect([ref.decision.ruleSaid, ref.jevSaid, ref.agrees]).toEqual(['same', 'same', true]);
  });

  it('is all-or-nothing: one failed shard means no rows at all', async () => {
    let n = 0;
    const s1 = scriptedSystemOne((state, questions) => {
      if (++n === 2) throw new Error('boom');
      return answerAll(() => 0.9)(state, questions);
    });
    expect(await triageOccurrences(s1, pairs())).toBeNull();
  });

  it('leaves its inputs exactly as it found them', async () => {
    const decisions = pairs();
    const before = JSON.stringify(decisions);
    await triageOccurrences(scriptedSystemOne(answerAll(() => 0.9)), decisions);
    expect(JSON.stringify(decisions)).toBe(before);
  });
});

describe('triageSession', () => {
  const decisions = () => ({ occurrences: pairs(), expectations: lines(['- button "Confirm"', '- status "Loading"']) });

  it('emits one row per pair, with agrees, the gate outcome and a compact detail', async () => {
    const log: SystemOneDecision[] = [];
    const s1 = scriptedSystemOne(answerAll((k) => (k.endsWith('_piece') || k.endsWith('_moment') || k.endsWith('_transient') || k.endsWith('_minted') ? 0.05 : 0.95)));
    const input = decisions();
    const summary = await triageSession(s1, input, (d) => log.push(d));
    expect(summary.occurrences.asked).toBe(input.occurrences.length);
    expect(log.length).toBe(summary.occurrences.asked + summary.expectations.asked);
    const row = log.find((d) => d.site === 'triage.occurrence')!;
    expect(row.model).toBe('jev-test');
    expect(typeof row.agrees).toBe('boolean');
    expect(row.outcome === 'acted' || row.outcome === 'deferred').toBe(true);
    expect(Object.keys(row.detail as Record<string, unknown>)).toContain('ruleSaid');
    expect(Object.keys(row.detail as Record<string, unknown>)).toContain('jevSaid');
    // A line the rules dropped for identifying no element is not scored
    // against site J's question, so it carries no `agrees`.
    const unscored = await triageSession(s1, { expectations: lines(['- cell ""']) }, () => {});
    expect(unscored.expectations).toEqual({ asked: 1, agreed: 0, disagreed: 0 });
  });

  it('a failing client produces no rows, no throw and a named deferral', async () => {
    const log: SystemOneDecision[] = [];
    const s1 = scriptedSystemOne(() => {
      throw new Error('no key');
    });
    const summary = await triageSession(s1, decisions(), (d) => log.push(d));
    expect(log).toEqual([]);
    expect(summary.occurrences.asked).toBe(0);
    expect(summary.deferred.length).toBe(2);
  });

  it('nothing to ask is not an error, and asks nothing', async () => {
    const s1 = scriptedSystemOne(answerAll(() => 0.9));
    const summary = await triageSession(s1, {}, () => {});
    expect([s1.asks, summary.occurrences.asked, summary.expectations.asked, summary.deferred]).toEqual([0, 0, 0, []]);
  });

  it('leaves its inputs exactly as it found them', async () => {
    const input = decisions();
    const before = JSON.stringify(input);
    await triageSession(scriptedSystemOne(answerAll(() => 0.9)), input, () => {});
    expect(JSON.stringify(input)).toBe(before);
  });
});
