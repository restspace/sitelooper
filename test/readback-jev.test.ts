import { describe, expect, it } from 'vitest';
import { GATES } from '../src/agent/decide.js';
import { parseAnswers, type AskResult, type Entry, type Questions, type SystemOne } from '../src/agent/system-one.js';
import type { SystemOneDecision } from '../src/agent/system-one.js';
import { MAX_ITEMS_PER_ASK, READBACK_LOCATE_SITE, readBackDecider, readBackLocateSite } from '../src/agent/readback-jev.js';
import type { DisplayCandidate, ReadBackAsk, ReadBackItem } from '../src/agent/readback.js';

/**
 * Site C's ballot (notes/PLAN-jev.md). Scripted client throughout — CI has no
 * TypeSafe key, and the point of the tier is that its absence is
 * indistinguishable from its silence. What is under test is what goes ON the
 * ballot, which answers are refused, and that a pick is only ever one of the
 * elements code offered.
 */

/** The System One twin of loop.test's scriptedProvider (see test/repair-jev.test.ts). */
function scriptedSystemOne(
  answer: (state: Entry, questions: Questions, n: number) => Record<string, unknown>,
): SystemOne & { asks: number; states: Entry[]; questions: Questions[] } {
  const self = {
    model: 'jev-test',
    asks: 0,
    states: [] as Entry[],
    questions: [] as Questions[],
    async ask<Q extends Questions>(state: Entry, questions: Q): Promise<AskResult<Q>> {
      const n = ++self.asks;
      self.states.push(state);
      self.questions.push(questions);
      const answers = answer(state, questions, n);
      return { ...parseAnswers(questions, { model: 'jev-test', answers, usage: { input_tokens: 10, output_tokens: 0 } }), ms: 1 };
    },
  };
  return self;
}

const pick = (label: string, confidence = 0.97) => ({ type: 'choice', choice: label, confidence, probabilities: {} });

const el = (path: string, text: string, over: Partial<DisplayCandidate> = {}): DisplayCandidate => ({ path, text, tag: 'td', ...over });

const PRICE: ReadBackItem = {
  name: 'new_part_price',
  value: '$250.00',
  candidates: [
    el('html > tr:nth-child(3) > td:nth-child(6)', '$250.00', { row: 'fwrdj4-n1 RD Part B $200.00 25% 1 No supplier $250.00', column: 'Price' }),
    el('html > tr:nth-child(4) > td:nth-child(2)', '$250.00', { row: 'Total (price × quantity) $250.00', column: 'Price' }),
  ],
};

const ask = (items: ReadBackItem[] = [PRICE]): ReadBackAsk => ({
  instruction: "add a second part named 'RD Part B' with cost 200 and markup 25",
  url: 'http://127.0.0.1:4180/#/tickets/t15',
  items,
});

/** A gate this file owns, so these tests do not depend on what the site is calibrated to. */
async function withGate(value: number, run: () => Promise<void>): Promise<void> {
  const before = GATES[READBACK_LOCATE_SITE];
  GATES[READBACK_LOCATE_SITE] = value;
  try {
    await run();
  } finally {
    if (before === undefined) delete GATES[READBACK_LOCATE_SITE];
    else GATES[READBACK_LOCATE_SITE] = before;
  }
}

describe('what site C puts to Jev', () => {
  it('asks one question pair per ambiguous value, in one request', async () => {
    const second: ReadBackItem = { ...PRICE, name: 'ref', value: 'RD-1021', candidates: [el('a', 'RD-1021'), el('b', 'RD-1021')] };
    const client = scriptedSystemOne(() => ({ pick0: pick('c0'), rev0: pick('c0'), pick1: pick('c1'), rev1: pick('c1') }));
    const out = await readBackLocateSite.run(client, ask([PRICE, second]), {});
    expect(client.asks).toBe(1);
    expect(Object.keys(client.questions[0]).sort()).toEqual(['pick0', 'pick1', 'rev0', 'rev1']);
    expect(out?.value?.map((p) => p.name)).toEqual(['new_part_price', 'ref']);
  });

  it('shows the instruction, the published name and the surroundings — and no session history', async () => {
    const client = scriptedSystemOne(() => ({ pick0: pick('c0'), rev0: pick('c0') }));
    await readBackLocateSite.run(client, ask(), {});
    const state = JSON.stringify(client.states[0]);
    expect(state).toContain('add a second part');
    expect(state).toContain('new_part_price');
    expect(state).toContain('Total (price × quantity)');
    expect(state).toContain('"column":"Price"');
    // The structural path is never shown: it invites picking by position and
    // means nothing to a reader of the page.
    expect(state).not.toContain('nth-child');
  });

  it('offers the options in both orders, each with its own none', async () => {
    const client = scriptedSystemOne(() => ({ pick0: pick('c0'), rev0: pick('c0') }));
    await readBackLocateSite.run(client, ask(), {});
    const q = client.questions[0] as Record<string, { criteria: Record<string, unknown> }>;
    expect(Object.keys(q.pick0.criteria)).toEqual(['c0', 'c1', 'none']);
    expect(Object.keys(q.rev0.criteria)).toEqual(['none', 'c1', 'c0']);
  });

  it('has nothing to ask when nothing is ambiguous', async () => {
    const client = scriptedSystemOne(() => ({}));
    expect(await readBackLocateSite.run(client, ask([{ ...PRICE, candidates: [el('a', '$250.00')] }]), {})).toBe(null);
    expect(client.asks).toBe(0);
  });

  it('caps how many values ride on one state', async () => {
    const many = Array.from({ length: MAX_ITEMS_PER_ASK + 4 }, (_, i) => ({ ...PRICE, name: `v${i}` }));
    const client = scriptedSystemOne((_s, questions) => Object.fromEntries(Object.keys(questions).map((k) => [k, pick('c0')])));
    const out = await readBackLocateSite.run(client, ask(many), {});
    expect(out?.value).toHaveLength(MAX_ITEMS_PER_ASK);
  });
});

describe('what site C refuses', () => {
  it('defers a value whose two option orders disagree', async () => {
    const client = scriptedSystemOne(() => ({ pick0: pick('c0'), rev0: pick('c1') }));
    const out = await readBackLocateSite.run(client, ask(), {});
    expect(out?.value).toBe(null);
    expect(out?.detail?.new_part_price).toContain('orders disagreed');
  });

  it('defers a value Jev says has no element of its own', async () => {
    const client = scriptedSystemOne(() => ({ pick0: pick('none'), rev0: pick('none') }));
    const out = await readBackLocateSite.run(client, ask(), {});
    expect(out?.value).toBe(null);
    expect(out?.why).toContain('no value cleared');
  });

  it('takes the weaker of the two orders as the value\'s confidence', async () => {
    await withGate(0.5, async () => {
      const client = scriptedSystemOne(() => ({ pick0: pick('c0', 0.95), rev0: pick('c0', 0.61) }));
      const out = await readBackLocateSite.run(client, ask(), {});
      expect(out?.confidence).toBeCloseTo(0.61);
    });
  });

  it('gates each value on its own, so one weak answer does not veto a strong one', async () => {
    await withGate(0.8, async () => {
      const weak: ReadBackItem = { ...PRICE, name: 'ref', value: 'RD-1021', candidates: [el('a', 'RD-1021'), el('b', 'RD-1021')] };
      const rows: SystemOneDecision[] = [];
      const client = scriptedSystemOne(() => ({
        pick0: pick('c0', 0.97),
        rev0: pick('c0', 0.97),
        pick1: pick('c1', 0.55),
        rev1: pick('c1', 0.55),
      }));
      const decide = readBackDecider(client, (d) => rows.push(d))!;
      const picks = await decide(ask([PRICE, weak]));
      expect(picks?.map((p) => p.name)).toEqual(['new_part_price']);
      // Both answers are logged — the deferred ones are half the calibration set.
      expect(rows[0].outcome).toBe('acted');
      expect(String(rows[0].detail?.ref)).toContain('0.55');
      expect(rows[0].chosen).toBe('1/2: new_part_price=c0');
    });
  });

  it('declines everything below the gate', async () => {
    await withGate(0.9, async () => {
      const client = scriptedSystemOne(() => ({ pick0: pick('c0', 0.7), rev0: pick('c0', 0.7) }));
      const rows: SystemOneDecision[] = [];
      expect(await readBackDecider(client, (d) => rows.push(d))!(ask())).toBe(null);
      expect(rows[0].outcome).toBe('deferred');
    });
  });

  it('is indistinguishable from absent when the ask fails', async () => {
    const throwing: SystemOne = {
      model: 'jev-test',
      ask: async () => {
        throw new Error('timeout');
      },
    };
    expect(await readBackDecider(throwing)!(ask())).toBe(null);
    expect(readBackDecider(null)).toBe(null);
  });

  it('never returns an element that was not on the ballot', async () => {
    await withGate(0.5, async () => {
      const client = scriptedSystemOne(() => ({ pick0: pick('c9'), rev0: pick('c9') }));
      expect(await readBackDecider(client)!(ask())).toBe(null);
    });
  });

  it('answers with the path of an offered candidate, and nothing else', async () => {
    await withGate(0.5, async () => {
      const client = scriptedSystemOne(() => ({ pick0: pick('c1'), rev0: pick('c1') }));
      expect(await readBackDecider(client)!(ask())).toEqual([
        { name: 'new_part_price', value: '$250.00', path: 'html > tr:nth-child(4) > td:nth-child(2)' },
      ]);
    });
  });
});
