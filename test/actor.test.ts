/**
 * Step 5 of notes/PLAN-jev.md, the deterministic half: what goes on the ballot.
 *
 * Candidate generation is a pure function of an observation and the
 * instruction, so all of this runs with no browser, no key and no model. What
 * is under test is the thing coverage depends on — whether the action a real
 * turn takes is on the list at all — over observations shaped like the four
 * bench apps: dialogs, tables with duplicate "Delete"/"Edit", comboboxes,
 * value x field binding, and the budget.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  buildCandidates,
  compatible,
  describeControl,
  extractValues,
  identityOf,
  valueKind,
  type ActorCandidate,
  type ActorControl,
  type ActorObservation,
} from '../src/agent/actor.js';

function control(over: Partial<ActorControl> & { id: string; role: string }): ActorControl {
  return { tag: 'div', ...over } as ActorControl;
}

function observation(controls: ActorControl[], over: Partial<ActorObservation> = {}): ActorObservation {
  return { id: 'obs1', url: 'http://127.0.0.1:4180/#/tickets', controls, ...over };
}

const ops = (cs: ActorCandidate[]) => cs.map((c) => c.operation);
const descriptions = (cs: ActorCandidate[]) => cs.map((c) => c.description);

describe('values from the instruction', () => {
  it('takes quoted spans, then the literals a person would recognise', () => {
    const v = extractValues('Create a ticket titled "Screen replacement" for bench@example.com, quantity 3, due 2026-10-01, total £425.00');
    expect(v.map((x) => x.text)).toEqual(['Screen replacement', 'bench@example.com', '2026-10-01', '£425.00', '3']);
    expect(v.map((x) => x.ref)).toEqual(['v0', 'v1', 'v2', 'v3', 'v4']);
    expect(v[0].source).toBe('quoted');
    expect(v.map((x) => x.kind)).toEqual(['text', 'email', 'date', 'money', 'number']);
  });

  it('reads an app reference as a value, because a procedure has to type it back', () => {
    expect(extractValues('Open ticket RD-1013 and set it to Ready').map((x) => x.text)).toEqual(['RD-1013']);
  });

  it('invents nothing: a value the instruction does not state is not a value', () => {
    // The honest failure. "next Tuesday" is a date this generator cannot
    // produce, and the shadow must record that turn as a COVERAGE MISS rather
    // than pretend a paraphraser exists — see actor.ts's list of gaps.
    expect(extractValues('set the due date to next Tuesday')).toEqual([]);
  });

  it('classifies what a field will accept', () => {
    expect(valueKind('bench@example.com')).toBe('email');
    expect(valueKind('$250.00')).toBe('money');
    expect(valueKind('12/31/2026')).toBe('date');
    expect(valueKind('Blue Fox Cafe')).toBe('text');
  });
});

describe('type compatibility, not label similarity', () => {
  const email = control({ id: 'c0', role: 'textbox', tag: 'input', type: 'email', name: 'Email' });
  const number = control({ id: 'c1', role: 'spinbutton', tag: 'input', type: 'number', name: 'Quantity' });
  const text = control({ id: 'c2', role: 'textbox', tag: 'input', type: 'text', name: 'Title' });
  const [name, addr, qty] = extractValues('add "Blue Fox Cafe" bench@example.com 3');

  it('refuses the bindings the browser itself would refuse', () => {
    expect(compatible(email, addr)).toBe(true);
    expect(compatible(email, name)).toBe(false);
    expect(compatible(number, qty)).toBe(true);
    expect(compatible(number, name)).toBe(false);
  });

  it('never filters a text field by whether the label looks like the value', () => {
    // The recommendations are explicit: filtering by label similarity removes
    // the correct action before it can be picked, and the correct action is
    // exactly what coverage is measuring.
    expect(compatible(text, qty)).toBe(true);
    expect(compatible(text, addr)).toBe(true);
  });

  it('nothing is typed into a checkbox, a file input or a submit button', () => {
    for (const type of ['checkbox', 'file', 'submit', 'hidden']) {
      expect(compatible(control({ id: 'c9', role: 'checkbox', tag: 'input', type }), name)).toBe(false);
    }
  });
});

describe('the ballot', () => {
  it('always carries the controller operations and the three abstentions', () => {
    const { candidates } = buildCandidates({ observation: observation([]), instruction: 'do something' });
    expect(ops(candidates)).toContain('observe');
    expect(ops(candidates)).toContain('read');
    expect(ops(candidates)).toContain('wait');
    expect(ops(candidates)).toContain('done');
    expect(ops(candidates)).toContain('need-info');
    expect(ops(candidates)).toContain('escalate');
    expect(ops(candidates)).toContain('none');
    // `none` is last, so an abstention is never the first thing read.
    expect(candidates[candidates.length - 1].operation).toBe('none');
  });

  it('binds each stated value to every field that could take it, and nothing else', () => {
    const obs = observation([
      control({ id: 'c0', role: 'textbox', tag: 'input', type: 'text', name: 'Title' }),
      control({ id: 'c1', role: 'spinbutton', tag: 'input', type: 'number', name: 'Quantity' }),
      control({ id: 'c2', role: 'button', tag: 'button', name: 'Save' }),
    ]);
    const { candidates } = buildCandidates({ observation: obs, instruction: 'add a part called "RD Part A" with quantity 2' });
    const fills = candidates.filter((c) => c.operation === 'fill');
    // "RD Part A" and 2 into the textbox; only 2 into the number field.
    expect(fills.map((c) => `${c.target!.control}:${c.valueRef}`)).toEqual(['c0:v0', 'c0:v1', 'c1:v1']);
    // The value is a REF; the string is never regenerated by whoever picks.
    expect(fills[0].valueRef).toBe('v0');
    expect(fills[0].observationId).toBe('obs1');
  });

  it('tells two "Delete" buttons apart by the row each sits in', () => {
    const obs = observation([
      control({ id: 'c0', role: 'button', tag: 'button', name: 'Delete', context: { row: 'RD-1013 Blue Fox Cafe Ready' } }),
      control({ id: 'c1', role: 'button', tag: 'button', name: 'Delete', context: { row: 'RD-1014 Acme Ltd New' } }),
    ]);
    const { candidates } = buildCandidates({ observation: obs, instruction: 'delete ticket RD-1014' });
    const clicks = candidates.filter((c) => c.operation === 'click');
    expect(clicks).toHaveLength(2);
    expect(clicks[0].description).toContain('RD-1013 Blue Fox Cafe');
    expect(clicks[1].description).toContain('RD-1014 Acme Ltd');
    expect(clicks[0].description).not.toBe(clicks[1].description);
  });

  it('names the dialog a control sits in, and its current value and enabled state', () => {
    const obs = observation([
      control({ id: 'c0', role: 'textbox', tag: 'input', type: 'text', name: 'Part name', value: 'old', context: { dialog: 'New part' } }),
      control({ id: 'c1', role: 'button', tag: 'button', name: 'Add', disabled: true, context: { dialog: 'New part' } }),
    ]);
    const { candidates } = buildCandidates({ observation: obs, instruction: 'add a part named "Screen"' });
    expect(descriptions(candidates).join('\n')).toContain('in dialog "New part"');
    expect(descriptions(candidates).join('\n')).toContain('currently "old"');
    const add = candidates.find((c) => c.target?.control === 'c1')!;
    expect(add.description).toContain('disabled');
  });

  it('offers a combobox its REAL options, the wanted one first, and typing for autocomplete', () => {
    const obs = observation([
      control({ id: 'c0', role: 'combobox', tag: 'select', name: 'Status', options: ['New', 'In progress', 'Ready', 'Archived'] }),
    ]);
    const { candidates } = buildCandidates({ observation: obs, instruction: 'set the status to "Ready"' });
    const selects = candidates.filter((c) => c.operation === 'select');
    expect(selects.map((c) => c.option)).toEqual(['Ready', 'New', 'In progress', 'Archived']);
    // A typed-into combobox also gets a `type`, because fill alone does not
    // raise the suggestions an autocomplete commits from.
    expect(ops(candidates)).toContain('type');
  });

  it('offers only the toggle move that would change the control', () => {
    const obs = observation([
      control({ id: 'c0', role: 'checkbox', tag: 'input', type: 'checkbox', name: 'Urgent', checked: false }),
      control({ id: 'c1', role: 'checkbox', tag: 'input', type: 'checkbox', name: 'Archived', checked: true }),
    ]);
    const { candidates } = buildCandidates({ observation: obs, instruction: 'mark it urgent' });
    const toggles = candidates.filter((c) => c.operation === 'check' || c.operation === 'uncheck');
    expect(toggles.map((c) => `${c.operation} ${c.target!.control}`)).toEqual(['check c0', 'uncheck c1']);
  });

  it('navigates only to a url the instruction itself states', () => {
    const none = buildCandidates({ observation: observation([]), instruction: 'open the tickets page' });
    expect(ops(none.candidates)).not.toContain('goto');
    const stated = buildCandidates({ observation: observation([]), instruction: 'open http://127.0.0.1:4180/#/parts' });
    const goto = stated.candidates.find((c) => c.operation === 'goto')!;
    expect(goto.url).toBe('http://127.0.0.1:4180/#/parts');
  });

  it('offers a read of every value a field already shows, as an evidence source', () => {
    const obs = observation([control({ id: 'c0', role: 'textbox', tag: 'input', name: 'Reference', value: 'RD-1013' })]);
    const { candidates } = buildCandidates({ observation: obs, instruction: 'report the reference' });
    const reads = candidates.filter((c) => c.operation === 'read' && c.target);
    expect(reads).toHaveLength(1);
    expect(reads[0].description).toContain('RD-1013');
  });

  it('carries enough identity to recognise the control in another reading of the page', () => {
    const c = control({ id: 'c0', role: 'button', tag: 'button', name: 'Save', testid: 'save-btn', elementId: 'save' });
    expect(identityOf(c)).toEqual({ tag: 'button', role: 'button', name: 'Save', testid: 'save-btn', elementId: 'save' });
    expect(describeControl(c)).toBe('button "Save"');
  });
});

describe('the budget', () => {
  const dense = observation(
    Array.from({ length: 400 }, (_, i) => control({ id: `c${i}`, role: 'button', tag: 'button', name: `Action ${i}` })),
  );

  it('stays inside one question, and says when it cut', () => {
    const { candidates, truncated } = buildCandidates({ observation: dense, instruction: 'press something' });
    expect(truncated).toBe(true);
    expect(candidates.length).toBeLessThanOrEqual(DEFAULT_BUDGET.maxCandidates);
    // The host allows 255 options; the working cap is far under it because
    // accuracy falls with irrelevant state.
    expect(candidates.length).toBeLessThanOrEqual(255);
  });

  it('cuts actions, never the abstention', () => {
    const { candidates } = buildCandidates({ observation: dense, instruction: 'press something' });
    expect(candidates[candidates.length - 1].operation).toBe('none');
    expect(ops(candidates.slice(0, 6))).toEqual(['observe', 'read', 'wait', 'done', 'need-info', 'escalate']);
  });

  it('respects a token budget below the count budget', () => {
    const { candidates, tokens } = buildCandidates({
      observation: dense,
      instruction: 'press something',
      budget: { maxStateTokens: 300 },
    });
    expect(tokens).toBeLessThanOrEqual(400); // the `none` line is re-appended past the cut
    expect(candidates.length).toBeLessThan(120);
  });

  it('an ordinary page fits in one question and is not truncated', () => {
    const obs = observation(
      Array.from({ length: 30 }, (_, i) => control({ id: `c${i}`, role: i % 3 ? 'button' : 'link', tag: 'button', name: `Control ${i}` })),
    );
    const { candidates, truncated } = buildCandidates({ observation: obs, instruction: 'open the ticket "RD-1013"' });
    expect(truncated).toBe(false);
    expect(candidates.length).toBe(30 + 8); // 6 controller ops + back + 30 clicks + none
  });
});
