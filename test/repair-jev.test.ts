/**
 * Site A of notes/PLAN-jev.md: the locator-repair proposer as a System One choice.
 *
 * Everything here runs against a SCRIPTED client — CI has no TypeSafe key, and
 * the point of the tier is that its absence is indistinguishable from its
 * silence. What is actually under test is the code around the ask: what gets
 * put on the ballot, which answers are refused, and that the locator is built
 * by this repo's rules rather than by whatever came back.
 */
import { describe, expect, it } from 'vitest';
import { GATES } from '../src/agent/decide.js';
import { parseAnswers, type AskResult, type Entry, type Questions, type SystemOne } from '../src/agent/system-one.js';
import type { SystemOneDecision } from '../src/agent/system-one.js';
import {
  GONE_VETO,
  MAX_ROWS_PER_STATE,
  candidateRows,
  cascadeProposer,
  jevProposer,
  locatorFromRow,
  rowKind,
} from '../src/skills/repair-jev.js';
import { renderSnapshot, renderSnapshotRow, type ProposeContext, type SnapshotRow, type DiagnosticProposer } from '../src/skills/repair.js';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import type { Skill } from '../src/skills/store.js';

/** The System One twin of loop.test's scriptedProvider (see test/system-one.test.ts). */
function scriptedSystemOne(
  answer: (state: Entry, questions: Questions, n: number) => Record<string, unknown> | Promise<Record<string, unknown>>,
): SystemOne & { asks: number; states: Entry[] } {
  const self = {
    model: 'jev-test',
    asks: 0,
    states: [] as Entry[],
    async ask<Q extends Questions>(state: Entry, questions: Q): Promise<AskResult<Q>> {
      const n = ++self.asks;
      self.states.push(state);
      const answers = await answer(state, questions, n);
      return { ...parseAnswers(questions, { model: 'jev-test', answers, usage: { input_tokens: 10, output_tokens: 0 } }), ms: 1 };
    },
  };
  return self;
}

const pick = (label: string, confidence = 0.97) => ({ type: 'choice', choice: label, confidence, probabilities: {} });
const gone = (n: number) => ({ type: 'noul', noul: n });

/** The happy answer: both orders agree on `label`, the control is not gone. */
const agrees = (label: string, confidence = 0.97) => ({
  pick: pick(label, confidence),
  pickReversed: pick(label, confidence),
  gone: gone(0.02),
});

const skill = { template: 'create a repair ticket for {{v1}}' } as unknown as Skill;

function context(rows: SnapshotRow[], over: Partial<ProposeContext> = {}): ProposeContext {
  return {
    skill,
    ticket: { flow: 'f', step: '01', skill: 's_x', atStep: '4', key: 'target', similarity: 0.97, missedLocator: 'x', fallbackUsed: null, recovered: false },
    chain: [{ kind: 'role', role: 'button', name: 'Save' }] as LocatorCandidate[],
    rows,
    snapshot: renderSnapshot(rows),
    recordedKind: 'button',
    recordedFamilies: ['command'],
    tool: 'click',
    ...over,
  };
}

const BUTTONS: SnapshotRow[] = [
  { tag: 'button', text: 'Cancel' },
  { tag: 'button', text: 'Save changes' },
  { tag: 'a', text: 'Back to list' },
];

// A gate this file owns, so these tests do not depend on what the site is
// eventually calibrated to (an unlisted site defaults to a strict 0.9).
function withGate(value: number, run: () => Promise<void>): Promise<void> {
  GATES['repair.propose'] = value;
  return run().finally(() => {
    delete GATES['repair.propose'];
  });
}

describe('the structured snapshot', () => {
  it('renders the line form the repair model has always been shown, byte for byte', () => {
    const row: SnapshotRow = {
      tag: 'input', role: 'spinbutton', id: 'quantity-field', testid: 'quantity',
      label: 'Amount', placeholder: 'e.g. 3', text: 'leftover', type: 'number',
    };
    // Field order, quoting and the un-rendered `type` are all the old walk's.
    expect(renderSnapshotRow(row)).toBe('input role=spinbutton id=quantity-field testid=quantity label="Amount" placeholder="e.g. 3" text="leftover"');
    expect(renderSnapshotRow({ tag: 'button' })).toBe('button');
    expect(renderSnapshot(BUTTONS)).toBe('button text="Cancel"\nbutton text="Save changes"\na text="Back to list"');
  });

  it('reads an input\'s kind from its type, which the line form never carried', () => {
    expect(rowKind({ tag: 'input', type: 'checkbox' })).toEqual({ role: 'checkbox', tag: 'input' });
    expect(rowKind({ tag: 'input', type: 'number' })).toEqual({ role: 'spinbutton', tag: 'input' });
    expect(rowKind({ tag: 'button' })).toEqual({ role: 'button', tag: 'button' });
    expect(rowKind({ tag: 'div', role: 'tab' })).toEqual({ role: 'tab', tag: 'div' });
  });
});

describe('the candidate ballot', () => {
  it('pre-filters to the recorded kind, and a checkbox is not a textbox', () => {
    const rows: SnapshotRow[] = [
      { tag: 'input', type: 'text', label: 'Customer' },
      { tag: 'input', type: 'checkbox', label: 'Urgent' },
      { tag: 'button', text: 'Save' },
    ];
    const asText = candidateRows(context(rows, { recordedKind: 'textbox', recordedFamilies: ['text-input'] }));
    expect(asText.map((r) => r.label)).toEqual(['Customer']);
    const asToggle = candidateRows(context(rows, { recordedKind: 'checkbox', recordedFamilies: ['toggle'] }));
    expect(asToggle.map((r) => r.label)).toEqual(['Urgent']);
    // A button that became a link is still a command: the family, not the role.
    expect(candidateRows(context(BUTTONS)).length).toBe(3);
  });

  it('drops rows nothing can be built from, and offers everything when the kind is unknown', () => {
    const rows: SnapshotRow[] = [{ tag: 'div' }, { tag: 'div', role: 'tab', text: 'Parts' }];
    expect(candidateRows(context(rows, { recordedKind: undefined, recordedFamilies: undefined }))).toEqual([rows[1]]);
  });

  // rdcal c36/c37: the step pressed the confirm dialog's "Delete part"; Jev
  // chose the part row's own "Delete" BEHIND the dialog at 0.81 and 0.94.
  it('while a modal dialog is open, only its controls are on the ballot', () => {
    const rows: SnapshotRow[] = [
      { tag: 'button', testid: 'part-delete-p18', text: 'Delete' },
      { tag: 'button', testid: 'confirm-no', text: 'Cancel', modal: true },
      { tag: 'button', testid: 'confirm-yes', text: 'Delete part', modal: true },
    ];
    expect(candidateRows(context(rows)).map((r) => r.testid)).toEqual(['confirm-no', 'confirm-yes']);
    // No modal open: the page is the ballot, as before.
    expect(candidateRows(context(rows.map(({ modal: _m, ...r }) => r))).length).toBe(3);
  });

  it('a page with no candidate of the recorded kind is not asked about at all', async () => {
    const s1 = scriptedSystemOne(() => ({}));
    const propose = jevProposer(s1);
    expect(await propose(context([{ tag: 'input', type: 'text', label: 'Search' }]))).toBeNull();
    expect(s1.asks).toBe(0);
    expect(propose.last!.reply).toMatch(/no candidate element of the recorded kind/);
  });
});

describe('locatorFromRow', () => {
  it('builds in the recorder\'s own candidate order, never from a generated string', () => {
    expect(locatorFromRow({ tag: 'button', testid: 'save', text: 'Save' })).toEqual({ kind: 'testid', attr: 'data-testid', value: 'save' });
    expect(locatorFromRow({ tag: 'button', text: 'Save changes' })).toEqual({ kind: 'role', role: 'button', name: 'Save changes' });
    expect(locatorFromRow({ tag: 'div', tabindex: '0' } as SnapshotRow)).toBeNull();
    // No role to name it by, so the label rung: a <label> element itself.
    expect(locatorFromRow({ tag: 'label', label: 'Amount' })).toEqual({ kind: 'label', label: 'Amount' });
    expect(locatorFromRow({ tag: 'label', placeholder: 'e.g. 3' })).toEqual({ kind: 'placeholder', placeholder: 'e.g. 3' });
    expect(locatorFromRow({ tag: 'label', id: 'amount-row' })).toEqual({ kind: 'id', selector: '#amount-row' });
    expect(locatorFromRow({ tag: 'label', text: 'Amount owed' })).toEqual({ kind: 'text', text: 'Amount owed' });
  });
});

describe('one-request rounds', () => {
  it('picks the renamed control and builds its locator', async () => {
    await withGate(0.8, async () => {
      const log: SystemOneDecision[] = [];
      const s1 = scriptedSystemOne(() => agrees('e1'));
      const out = await jevProposer(s1, (d) => log.push(d))(context(BUTTONS));
      expect(out).toEqual({ kind: 'role', role: 'button', name: 'Save changes' });
      expect(s1.asks).toBe(1); // both orders and the gone-noul ride in ONE request
      expect(log[0]).toMatchObject({ site: 'repair.propose', outcome: 'acted', chosen: 'e1', options: 4 });
    });
  });

  it('states only the step, the dead chain, the kind and the rows', async () => {
    const s1 = scriptedSystemOne(() => agrees('e1'));
    await jevProposer(s1)(context(BUTTONS));
    const state = s1.states[0] as Record<string, unknown>;
    expect(Object.keys(state).sort()).toEqual(['control', 'deadLocators', 'elements', 'procedure', 'step']);
    expect(state.deadLocators).toEqual(["page.getByRole('button', { name: 'Save', exact: true })"]);
    expect(Object.keys(state.elements as object)).toEqual(['e0', 'e1', 'e2']);
  });

  it('`none` defers, however sure it is', async () => {
    await withGate(0.5, async () => {
      const log: SystemOneDecision[] = [];
      const s1 = scriptedSystemOne(() => ({ pick: pick('none', 0.99), pickReversed: pick('none', 0.99), gone: gone(0.98) }));
      const propose = jevProposer(s1, (d) => log.push(d));
      expect(await propose(context(BUTTONS))).toBeNull();
      expect(log[0]).toMatchObject({ outcome: 'deferred', why: 'none' });
      expect(propose.last!.reply).toMatch(/deferred: none/);
    });
  });

  it('the two option orders disagreeing defers — position bias is not a reading', async () => {
    await withGate(0.5, async () => {
      const log: SystemOneDecision[] = [];
      const s1 = scriptedSystemOne(() => ({ pick: pick('e1'), pickReversed: pick('e0'), gone: gone(0.02) }));
      expect(await jevProposer(s1, (d) => log.push(d))(context(BUTTONS))).toBeNull();
      expect(log[0].why).toMatch(/option orders disagreed \(e1 vs e0\)/);
    });
  });

  it('a confident gone-noul vetoes the pick it contradicts', async () => {
    await withGate(0.5, async () => {
      const log: SystemOneDecision[] = [];
      const s1 = scriptedSystemOne(() => ({ pick: pick('e1'), pickReversed: pick('e1'), gone: gone(GONE_VETO) }));
      expect(await jevProposer(s1, (d) => log.push(d))(context(BUTTONS))).toBeNull();
      expect(log[0].why).toMatch(/judged the control gone/);
    });
  });

  it('an UNDECIDED gone-noul says nothing and does not drag the confidence down', async () => {
    await withGate(0.8, async () => {
      // The probe's finding (see GONE_VETO): a correct, confidently agreed
      // pick routinely sits beside a gone-noul of ~0.47. Folded into the min
      // as a distance-from-a-coin-flip that is 0.06, and the site never acts.
      const log: SystemOneDecision[] = [];
      const s1 = scriptedSystemOne(() => ({ pick: pick('e1', 0.95), pickReversed: pick('e1', 0.83), gone: gone(0.47) }));
      expect(await jevProposer(s1, (d) => log.push(d))(context(BUTTONS))).toEqual({ kind: 'role', role: 'button', name: 'Save changes' });
      expect(log[0].confidence).toBeCloseTo(0.83, 5); // the weaker of the two CHOICES
    });
  });
});

describe('the tournament', () => {
  const many: SnapshotRow[] = Array.from({ length: 60 }, (_, i) => ({ tag: 'button', text: `Action ${i}` }));

  it('shards the rows, shortlists the winners, and decides in one final choice', async () => {
    await withGate(0.8, async () => {
      const log: SystemOneDecision[] = [];
      // Each shard of 12 elects its first row; the final round takes the one
      // whose row is "Action 24" (the third shard's winner → e2 in the final).
      const s1 = scriptedSystemOne((_state, questions) => {
        if (!('gone' in questions)) {
          const first = Object.keys((questions.pick as { criteria: Record<string, unknown> }).criteria)[0];
          return { pick: pick(first, 0.9) };
        }
        return agrees('e2', 0.95);
      });
      const out = await jevProposer(s1, (d) => log.push(d))(context(many));
      expect(out).toEqual({ kind: 'role', role: 'button', name: 'Action 24' });
      expect(s1.asks).toBe(6); // five shards of 12, then one final
      // The decision is logged against the whole field it ranged over, and at
      // the weakest confidence anywhere in it (the shard heat, 0.9).
      expect(log[0]).toMatchObject({ outcome: 'acted', options: 61 });
      expect(log[0].confidence).toBeCloseTo(0.9, 5);
    });
  });

  it('every group answering none is a deferral, with no final round', async () => {
    const log: SystemOneDecision[] = [];
    const s1 = scriptedSystemOne(() => ({ pick: pick('none', 0.9) }));
    expect(await jevProposer(s1, (d) => log.push(d))(context(many))).toBeNull();
    expect(s1.asks).toBe(5);
    expect(log[0].why).toMatch(/every group of elements answered none/);
  });

  it('a failed shard defers the whole reduce and is not logged as a decision', async () => {
    const log: SystemOneDecision[] = [];
    const s1 = scriptedSystemOne((_state, questions, n) => {
      if (n === 2) throw new Error('503');
      return { pick: pick('none', 0.9) };
    });
    const propose = jevProposer(s1, (d) => log.push(d));
    expect(await propose(context(many))).toBeNull();
    expect(log).toEqual([]); // a missing shard is "no opinion", not a reading
    expect(propose.last!.reply).toMatch(/no answer/);
  });

  it('never puts more than the row cap in one state', async () => {
    const s1 = scriptedSystemOne((_state, questions) => {
      const criteria = (questions.pick as { criteria: Record<string, unknown> }).criteria;
      expect(Object.keys(criteria).length).toBeLessThanOrEqual(MAX_ROWS_PER_STATE + 1);
      return 'gone' in questions ? agrees('e0') : { pick: pick('none', 0.9) };
    });
    await jevProposer(s1)(context(many));
  });
});

describe('cascadeProposer', () => {
  const llmSays = (out: LocatorCandidate | null): DiagnosticProposer => {
    const p: DiagnosticProposer = async ({ snapshot }) => {
      p.last = { snapshotRows: snapshot ? snapshot.split('\n').length : 0, snapshotBytes: snapshot.length, reply: 'llm reply' };
      return out;
    };
    return p;
  };

  it('with no System One tier it IS the llm proposer, the same object', () => {
    const llm = llmSays(null);
    expect(cascadeProposer(null, llm)).toBe(llm);
    expect(cascadeProposer(undefined, llm)).toBe(llm);
  });

  it('falls to the llm proposer when Jev defers, and reports the llm\'s diagnostic', async () => {
    const llm = llmSays({ kind: 'testid', attr: 'data-testid', value: 'save' });
    const s1 = scriptedSystemOne(() => ({ pick: pick('none', 0.99), pickReversed: pick('none', 0.99), gone: gone(0.9) }));
    const propose = cascadeProposer(s1, llm);
    expect(await propose(context(BUTTONS))).toEqual({ kind: 'testid', attr: 'data-testid', value: 'save' });
    expect(propose.last!.reply).toBe('llm reply');
  });

  it('a confident Jev answer stands and the llm is never called', async () => {
    await withGate(0.8, async () => {
      let llmCalls = 0;
      const llm: DiagnosticProposer = async () => (llmCalls++, null);
      const s1 = scriptedSystemOne(() => agrees('e1'));
      const propose = cascadeProposer(s1, llm);
      expect(await propose(context(BUTTONS))).toEqual({ kind: 'role', role: 'button', name: 'Save changes' });
      expect(llmCalls).toBe(0);
      expect(propose.last!.reply).toMatch(/^jev: e1 \(0\.97\) → page\.getByRole/);
    });
  });

  it('a Jev that throws outright is indistinguishable from a Jev that is absent', async () => {
    const llm = llmSays({ kind: 'id', selector: '#save' });
    const s1 = scriptedSystemOne(() => {
      throw new Error('timed out');
    });
    expect(await cascadeProposer(s1, llm)(context(BUTTONS))).toEqual({ kind: 'id', selector: '#save' });
  });
});
