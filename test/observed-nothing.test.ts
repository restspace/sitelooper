import { describe, expect, it } from 'vitest';
import { observedNothing } from '../src/execution/observe.js';

const goto = { tool: 'goto', args: { url: 'http://h/wp/41' }, locators: {} };
const read = (chain = 1, what = 'text', label: string | undefined = 'f') => ({
  tool: 'read',
  args: { what },
  locators: { target: Array(chain).fill({ kind: 'css', selector: '.x' }) },
  ...(label ? { label } : {}),
});

// fwop4-n2 08-open: goto a deleted work package, every read skipped, and the
// step still reported tier A 10/10 with a report filled from its template.
describe('observedNothing', () => {
  it('a read-only procedure that skipped every read it could take did not replay', () => {
    expect(observedNothing([goto, read(), read()], 2)).toBe(true);
  });

  it('one read taken is an observation: the procedure ran', () => {
    expect(observedNothing([goto, read(), read()], 1)).toBe(false);
  });

  it('reads with no recorded way to find their element never count (skipped by design)', () => {
    expect(observedNothing([goto, read(), read(0)], 1)).toBe(true);
    expect(observedNothing([goto, read(0)], 1)).toBe(false);
    // A url read has no element to miss.
    expect(observedNothing([goto, read(1, 'url')], 1)).toBe(false);
    // An unlabelled read is a comment in the artifact: it is not a read either runner counts.
    expect(observedNothing([goto, read(1, 'text', '')], 1)).toBe(false);
  });

  it('a procedure that sets anything is judged by its own checks, not by its reads', () => {
    const click = { tool: 'click', args: {}, locators: { target: [{ kind: 'role' }] } };
    expect(observedNothing([goto, click, read()], 1)).toBe(false);
  });
});
