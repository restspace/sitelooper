import { describe, expect, it } from 'vitest';
import { offRecordReadReason, readsRecordedKind, recordedKinds } from '../src/execution/positional.js';

/**
 * Round 62, gitea fwgt13 02-create: s_71a916 step 1 read `assignee_applied`
 * ("bench-assignee" when recorded) through this chain; on n2 and n3 both
 * candidates missed and an inline heal read the "Add a link" BUTTON instead.
 * The recorded kind is the point's role, link. The parity cases in
 * execution-parity.test.ts run both runners; these pin the rule's pieces.
 */
const FWGT13_CHAIN = [
  { kind: 'css', selector: '#issuecomment-{{d1}} > span:nth-of-type(2) > a' },
  { kind: 'point', x: 214, y: 474, w: 123.5, h: 16, role: 'link', tag: 'a', vw: 1280, vh: 900 },
];

describe('a read off its recorded element (round 62)', () => {
  it("takes the recorded kind from a point's role, else its tag, and from role candidates", () => {
    expect(recordedKinds(FWGT13_CHAIN)).toEqual([{ role: 'link', tag: null }]);
    expect(recordedKinds([{ kind: 'point', x: 1, y: 1, w: 1, h: 1, role: null, tag: 'p' }])).toEqual([{ role: null, tag: 'p' }]);
    expect(recordedKinds([{ kind: 'role', role: 'heading', name: '{{v1}}' }, { kind: 'css', selector: 'h1' }])).toEqual([{ role: 'heading', tag: null }]);
    // A chain that records no kind has nothing to compare: the read stands as before.
    expect(recordedKinds([{ kind: 'css', selector: '#issue-title-display > h1' }])).toEqual([]);
  });

  it('never withholds without an answer from the page, or without a recorded kind', async () => {
    const throwing = { first: () => ({ evaluate: async () => { throw new Error('detached'); } }) };
    expect(await readsRecordedKind(throwing as never, recordedKinds(FWGT13_CHAIN))).toBeNull();
    expect(await readsRecordedKind(throwing as never, [])).toBe(true);
  });

  it('says why, in the words both runners log', () => {
    expect(offRecordReadReason('assignee_applied', 'an inline heal', recordedKinds(FWGT13_CHAIN))).toBe(
      "read 'assignee_applied' resolved by an inline heal to an element that is not a link, the kind the recording read — its value is not published",
    );
  });
});
