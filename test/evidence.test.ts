/**
 * §5.3 evidence reads: which strings are looked for, and how the block reads.
 * The page walk itself is browser-backed (test/browser.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { evidenceLiterals, renderEvidence } from '../src/agent/evidence.js';

describe('evidence literals', () => {
  it('are the names and phrases the instruction states, never its numbers', () => {
    const lits = evidenceLiterals("On ticket 'fx1 RD Bench Ticket', add a part named 'fx1 RD Part A' with cost 100 and markup 25.");
    expect(lits).toContain('fx1 RD Bench Ticket');
    expect(lits).toContain('fx1 RD Part A');
    expect(lits.some((l) => /^\d+$/.test(l))).toBe(false);
  });

  it('is empty for an instruction that names nothing', () => {
    expect(evidenceLiterals('Open the board and report its columns.')).toEqual([]);
  });
});

describe('the evidence block', () => {
  it('quotes the record and says it need not be read again', () => {
    const block = renderEvidence([{ literal: 'fx1 RD Part A', where: 'row', text: 'fx1 RD Part A $100.00 25% 1 $125.00 Edit Delete' }]);
    expect(block).toMatch(/^\n\[evidence: /);
    expect(block).toContain('- "fx1 RD Part A" — row: "fx1 RD Part A $100.00 25% 1 $125.00 Edit Delete"');
  });

  it('is nothing at all when nothing was found', () => {
    expect(renderEvidence([])).toBe('');
  });
});
