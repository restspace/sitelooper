import { describe, expect, it } from 'vitest';
import { filterInteractive, isRefTarget, normalizeRefs, refOf, truncate } from '../src/daemon/refs.js';

describe('ref handling', () => {
  it('normalizes Playwright [ref=eNN] markers to [@eNN]', () => {
    const input = '- button "Save" [ref=e12]\n- textbox "Name" [ref=e3]';
    expect(normalizeRefs(input)).toBe('- button "Save" [@e12]\n- textbox "Name" [@e3]');
  });

  it('classifies targets: @refs and bare refs vs CSS selectors', () => {
    expect(isRefTarget('@e12')).toBe(true);
    expect(isRefTarget('e12')).toBe(true);
    expect(isRefTarget(' @e5 ')).toBe(true);
    expect(isRefTarget('#e12')).toBe(false);
    expect(isRefTarget('button.save')).toBe(false);
    expect(isRefTarget('@e12 > span')).toBe(false);
  });

  // fwop3-n1 clicked a tab as `aria-ref=e423` (the spelling truncate teaches
  // for scoped snapshots). Taken for a selector, it was stored as the step's
  // primary css candidate and replayed onto whatever held e423 next time.
  it('reads the engine spelling aria-ref=eNN as the same ref', () => {
    expect(isRefTarget('aria-ref=e423')).toBe(true);
    expect(isRefTarget(' aria-ref=f1e2 ')).toBe(true);
    expect(refOf('aria-ref=e423')).toBe('e423');
    expect(refOf('@e12')).toBe('e12');
    expect(refOf('e7')).toBe('e7');
    expect(refOf('aria-ref=f1e2')).toBe('f1e2');
    // a selector is not a ref, even one that merely contains a ref
    expect(refOf('button.save')).toBeNull();
    expect(isRefTarget('aria-ref=e1 >> span')).toBe(false);
    expect(isRefTarget('aria-ref=@e1')).toBe(false);
  });

  it('filterInteractive keeps ref-carrying and interactive lines, drops decoration', () => {
    const snap = [
      '- generic',
      '- img "logo"',
      '- button "Save" [@e1]',
      '- paragraph: some text',
      '- link "Organisations"',
      '- heading "Dashboard" [level=1]',
    ].join('\n');
    const filtered = filterInteractive(snap).split('\n');
    expect(filtered).toContain('- button "Save" [@e1]');
    expect(filtered).toContain('- link "Organisations"');
    expect(filtered).toContain('- heading "Dashboard" [level=1]');
    expect(filtered).not.toContain('- generic');
    expect(filtered).not.toContain('- img "logo"');
  });

  it('truncate marks how much was cut', () => {
    const out = truncate('x'.repeat(100), 10);
    expect(out.startsWith('xxxxxxxxxx')).toBe(true);
    expect(out).toContain('truncated 90 chars');
    expect(truncate('short', 10)).toBe('short');
  });
});
