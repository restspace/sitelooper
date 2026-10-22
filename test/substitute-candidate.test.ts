import { describe, expect, it } from 'vitest';
import type { LocatorCandidate } from '../src/skills/store.js';
import { substituteCandidate, substituteDeep } from '../src/skills/compile.js';

// hakm3-cv s_06578c step 13: v3's example was the word "text" (threaded from
// `04-edit.order_date_input_type`), and substituting the whole candidate
// stored `{"kind":"{{v3}}","text":"onsite","nth":0}` — the artifact then
// emitted `undefined.nth(0)` on every run.
describe('substituteCandidate', () => {
  const slots = new Map([['v3', 'text'], ['v4', 'button'], ['v5', 'onsite']]);

  it('never slots the structure of a candidate', () => {
    const c: LocatorCandidate = { kind: 'text', text: 'onsite', nth: 0 };
    expect(substituteDeep(c, slots)).toMatchObject({ kind: '{{v3}}' }); // the old behaviour
    expect(substituteCandidate(c, slots)).toEqual({ kind: 'text', text: '{{v5}}', nth: 0 });
    expect(substituteCandidate({ kind: 'role', role: 'button', name: 'onsite' }, slots)).toEqual({ kind: 'role', role: 'button', name: '{{v5}}' });
  });

  it('slots every value field', () => {
    expect(substituteCandidate({ kind: 'scoped', container: 'tr', hasText: 'onsite', selector: 'td > a' }, slots)).toEqual({
      kind: 'scoped',
      container: 'tr',
      hasText: '{{v5}}',
      selector: 'td > a',
    });
    expect(substituteCandidate({ kind: 'testid', attr: 'data-testid', value: 'onsite' }, slots)).toEqual({ kind: 'testid', attr: 'data-testid', value: '{{v5}}' });
    expect(substituteCandidate({ kind: 'label', label: 'onsite' }, slots)).toEqual({ kind: 'label', label: '{{v5}}' });
    expect(substituteCandidate({ kind: 'placeholder', placeholder: 'onsite' }, slots)).toEqual({ kind: 'placeholder', placeholder: '{{v5}}' });
  });
});
