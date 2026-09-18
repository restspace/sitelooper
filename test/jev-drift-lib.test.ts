import { describe, expect, it } from 'vitest';
// @ts-expect-error - a bench script, deliberately plain ESM with no types
import {
  driftIdentifier,
  driftSelector,
  driftWording,
  gateTable,
  identityOf,
  judgeProposal,
  parsePickedRow,
  perturbChain,
  recommendGate,
  reliability,
  renameMemo,
} from '../bench/jev-drift-lib.mjs';

/**
 * The pure half of the site-B calibration harness (bench/jev-drift-store.mjs).
 *
 * Two properties carry the whole measurement, and neither is obvious from
 * reading the transforms:
 *
 *  - a drifted chain must be DEAD. A rename that leaves the new name a
 *    substring of the old one still resolves (`getByLabel` matches a
 *    substring), so such a case silently is not a case.
 *  - a chain drifts under ONE rename event: the same original string must come
 *    out the same way in every rung it appears in, whatever kind of rung that
 *    is. A chain whose testid was renamed one way and whose css path renamed
 *    the same testid another way is a recording nothing ever made.
 *
 * The scoring half is tested for what it REFUSES to say: `undecidable` is a
 * real answer, and a harness that guesses its own labels is worth less than no
 * harness.
 */

describe('drifting the wording', () => {
  it('prefers a synonym from the table, keeping the casing', () => {
    expect(driftWording('Add part')).toEqual({ value: 'Attach part', transform: 'synonym' });
    expect(driftWording('Delete')).toEqual({ value: 'Remove', transform: 'synonym' });
  });

  it('never produces a name the real one CONTAINS, which would still resolve', () => {
    // "Markup % *" -> "Markup %" is the obvious rename and a dead case:
    // getByLabel matches a substring, so it finds the very control it drifted
    // away from.
    const drifted = driftWording('Markup % *');
    expect(drifted.value).not.toBe('Markup %');
    expect('Markup % *'.includes(drifted.value)).toBe(false);
  });

  it('falls through synonym -> affix -> punctuation and always changes the string', () => {
    for (const text of ['Sign in', 'Email address', 'Title *', 'Zzz', 'Zzz…']) {
      const drifted = driftWording(text);
      expect(drifted).not.toBeNull();
      expect(drifted.value).not.toBe(text);
      expect(text.includes(drifted.value)).toBe(false);
    }
  });

  it('leaves a parameter slot alone: it names the record, not the control', () => {
    expect(driftWording('{{v2}} RD Bench Ticket')).toBeNull();
    expect(driftIdentifier('row-{{v2}}')).toBeNull();
  });
});

describe('drifting an identifier', () => {
  it('reproduces the one real drift the bench has measured', () => {
    expect(driftIdentifier('add-part')).toEqual({ value: 'attach-part', transform: 'synonym' });
  });

  it('goes stale when there is no vocabulary to swap, keeping the separator', () => {
    expect(driftIdentifier('f7x2')).toEqual({ value: 'f7x2-legacy', transform: 'stale-id' });
    expect(driftIdentifier('form_field_9')).toEqual({ value: 'form_field_9_legacy', transform: 'stale-id' });
  });
});

describe('drifting a selector', () => {
  it('reads a quoted string by CONTEXT, not by shape', () => {
    const memo = renameMemo();
    // Inside a role engine selector, `name` is an accessible name...
    expect(driftSelector('role=textbox[name="Password"]', memo).value).toBe('role=textbox[name="Passphrase"]');
    // ...and the SAME string in the role rung beside it must drift identically.
    expect(driftWording('Password').value).toBe('Passphrase');
    // A data attribute is an identifier.
    expect(driftSelector('[data-testid="form-dialog"] input', renameMemo()).value).toBe('[data-testid="form-dialog-legacy"] input');
  });

  it('moves a path that has no name in it to have been renamed', () => {
    expect(driftSelector('#view > div:nth-of-type(2) > button', renameMemo()).transform).toBe('synonym'); // #view -> #show
    const positional = driftSelector('table tbody tr:nth-of-type(2)', renameMemo());
    expect(positional).toEqual({ value: 'table tbody tr:nth-of-type(9)', transform: 'moved-path' });
    // No index either: Playwright's own nth=, never a malformed css pseudo —
    // a bad selector resolves as an ERROR, and the harness needs a clean miss.
    expect(driftSelector('section > p', renameMemo()).value).toBe('section > p >> nth=96');
  });
});

describe('drifting a whole chain', () => {
  const chain = [
    { kind: 'testid', attr: 'data-testid', value: 'add-part' },
    { kind: 'role', role: 'button', name: 'Add part' },
    { kind: 'css', selector: 'role=button[name="Add part"]' },
    { kind: 'css', selector: '[data-testid="add-part"]' },
    { kind: 'point', x: 1112, y: 296, w: 90, h: 39, role: 'button', tag: 'button', vw: 1280, vh: 900 },
  ];

  it('drifts one control ONCE, however many rungs name it', () => {
    const out = perturbChain(chain);
    expect(out.chain[0].value).toBe('attach-part');
    expect(out.chain[1].name).toBe('Attach part');
    expect(out.chain[2].selector).toBe('role=button[name="Attach part"]');
    expect(out.chain[3].selector).toBe('[data-testid="attach-part"]');
  });

  it('keeps every kind and every family, because that is what the ballot is filtered on', () => {
    const out = perturbChain(chain);
    expect(out.chain.map((c: { kind: string }) => c.kind)).toEqual(chain.map((c) => c.kind));
    expect(out.chain[4].role).toBe('button');
  });

  it('pushes a recorded point off the document rather than to a nearby control', () => {
    const point = perturbChain(chain).chain[4];
    expect(point.x).toBe(1112);
    expect(point.y).toBeGreaterThan(900);
  });

  it('files the case under the hardest family present', () => {
    expect(perturbChain(chain).headline).toBe('synonym');
    expect(perturbChain([{ kind: 'css', selector: 'section > p' }]).headline).toBe('moved-path');
  });

  it('`strip` mode is the control condition: values that describe nothing', () => {
    const out = perturbChain(chain, 'strip');
    expect(out.headline).toBe('dead');
    expect(out.chain[0].value).toMatch(/^sl-dead-/);
    // Still deterministic, and still one event per original string.
    expect(perturbChain(chain, 'strip').chain[0].value).toBe(out.chain[0].value);
  });
});

describe('reading a pick back', () => {
  it('parses the line renderSnapshotRow produced', () => {
    expect(parsePickedRow('button role=button id=part-add testid=part-attach label="Attach part"')).toEqual({
      tag: 'button',
      role: 'button',
      id: 'part-add',
      testid: 'part-attach',
      label: 'Attach part',
    });
  });

  it('is not fooled by a quoted value that contains a keyword', () => {
    const row = parsePickedRow('input role=textbox label="Customer id=9" placeholder="name"');
    expect(row.label).toBe('Customer id=9');
    expect(row.placeholder).toBe('name');
  });
});

describe('judging a proposal against the chain it replaced', () => {
  const original = [
    { kind: 'testid', attr: 'data-testid', value: 'add-part' },
    { kind: 'role', role: 'button', name: 'Add part' },
  ];

  it('agreement on any identifying field is the same element', () => {
    expect(judgeProposal({ kind: 'testid', attr: 'data-testid', value: 'add-part' }, original).verdict).toBe('correct');
    // A different WAY of naming the same element still agrees, because the
    // recorded chain names it several ways at once.
    expect(judgeProposal({ kind: 'role', role: 'button', name: 'Add part' }, original).verdict).toBe('correct');
  });

  it('contradiction on a field an element has one of is a different element', () => {
    expect(judgeProposal({ kind: 'testid', attr: 'data-testid', value: 'del-part' }, original).verdict).toBe('wrong');
    expect(judgeProposal({ kind: 'role', role: 'button', name: 'Delete part' }, original).verdict).toBe('wrong');
  });

  it('says undecidable rather than guessing when nothing is comparable', () => {
    expect(judgeProposal({ kind: 'label', label: 'Add part' }, original).verdict).toBe('undecidable');
    expect(judgeProposal({ kind: 'point', x: 1, y: 1 }, original).verdict).toBe('undecidable');
    // A role name is only comparable within the SAME role: a button named
    // "Save" and a link named "Save" are different elements, and neither the
    // agreement nor the contradiction would mean anything.
    expect(identityOf({ kind: 'role', role: 'link', name: 'Add part' })).toEqual({ 'name:link': 'Add part' });
    expect(judgeProposal({ kind: 'role', role: 'link', name: 'Add part' }, original).verdict).toBe('undecidable');
  });
});

describe('the tables the gate is read off', () => {
  const cases = [
    { id: 'a', asked: true, confidence: 0.95, verdict: 'correct', guardsPassed: true, deadChain: true },
    { id: 'b', asked: true, confidence: 0.82, verdict: 'correct', guardsPassed: true, deadChain: true },
    { id: 'c', asked: true, confidence: 0.55, verdict: 'wrong', guardsPassed: true, deadChain: true },
    { id: 'd', asked: true, confidence: 0.72, verdict: 'undecidable', guardsPassed: true, deadChain: true },
    { id: 'e', asked: true, confidence: 0.91, verdict: 'wrong', guardsPassed: false, deadChain: true },
  ];

  it('counts undecidable cases in neither accuracy column', () => {
    const row = reliability(cases).find((r: { bucket: string }) => r.bucket === '0.70–0.80');
    expect(row).toMatchObject({ n: 0, undecidable: 1, accuracy: null });
  });

  it('a gate only accepts what the CODE guards already passed', () => {
    // 'e' is wrong and confident, and no gate may be blamed for it: the code
    // guards refused it, which is the whole reason site B can sit low.
    const table = gateTable(cases, [0.5, 0.6, 0.9]);
    expect(table[0]).toMatchObject({ gate: 0.5, accepted: 4, wrong: 1, wrongCases: ['c'] });
    expect(table[1]).toMatchObject({ gate: 0.6, accepted: 3, wrong: 0 });
    expect(table[2]).toMatchObject({ gate: 0.9, accepted: 1, wrong: 0 });
  });

  it('recommends the LOWEST gate with no false accept, and says how thin it is', () => {
    const rec = recommendGate(gateTable(cases, [0.5, 0.6, 0.9]));
    expect(rec.gate).toBe(0.6);
    expect(rec.correct).toBe(2);
  });

  it('recommends nothing at all when every gate accepts a wrong pick', () => {
    const bad = [{ id: 'z', asked: true, confidence: 0.99, verdict: 'wrong', guardsPassed: true, deadChain: true }];
    expect(recommendGate(gateTable(bad, [0.5, 0.9])).gate).toBeNull();
  });
});
