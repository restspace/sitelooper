import { afterEach, describe, expect, it } from 'vitest';
import type { JournalEvent } from '../src/daemon/journal-attribute.js';
import { feedbackLines, feedbackText, journalFeedbackOn, MAX_FEEDBACK_LINES } from '../src/daemon/journal-feedback.js';
import { clearSecretLedger, resolveSecrets } from '../src/shared/secrets.js';

/**
 * Stage 4: the journal's facts about a gesture, as the lines a tool result
 * gains behind SITELOOPER_JOURNAL_FEEDBACK=on. One case per fact type; only
 * events of the gesture's own window with no overlap count; never a value,
 * never credential text.
 */

const W = 7;
const own = (k: JournalEvent['k'], extra: Record<string, unknown> = {}): JournalEvent => ({ t: 1, k, c: ['in', W, 'gesture'], ...extra });

describe('journal feedback lines', () => {
  it('says where a click landed when an overlay covered its target', () => {
    const lines = feedbackLines('click', W, [own('hit', { ty: 'pd', d: 'presentation "Cover"', on: 0, cover: 'presentation "Cover"' })]);
    expect(lines).toContain('the click landed on presentation "Cover", not on its target (something covered it)');
  });

  it('says an option is now selected or not (gitea fwgt12: a CSS-class tick)', () => {
    expect(feedbackLines('click', W, [own('state', { d: 'option "✓bug"', a: 'class', on: true })])).toContain("'bug' is now selected");
    expect(feedbackLines('click', W, [own('state', { d: 'option "bug"', a: 'aria-selected', on: false })])).toContain("'bug' is now not selected");
    expect(feedbackLines('click', W, [own('state', { d: 'button "Panel options"', a: 'aria-expanded', on: false })])).toContain("'Panel options' is now collapsed");
  });

  it('says where focus went when it is not what was acted on (grafana fwgr73: the Find box, not the editor)', () => {
    const lines = feedbackLines('press', W, [own('val', { f: 'textbox "Editor content"', len: 3 }), own('foc', { dir: 'in', d: 'textbox "Find"' })]);
    expect(lines).toContain('focus is now in textbox "Find", not textbox "Editor content"');
  });

  it('says a popup opened or closed', () => {
    const lines = feedbackLines('click', W, [own('show', { d: 'listbox "Labels"' }), own('hide', { d: 'dialog "Discard changes?"' })]);
    expect(lines).toEqual(expect.arrayContaining(['listbox "Labels" opened', 'dialog "Discard changes?" closed']));
  });

  it('says whether a request was sent', () => {
    expect(feedbackLines('click', W, [])).toContain('no request was sent');
    expect(feedbackLines('click', W, [own('req', { m: 'POST', e: 'http://app/api/save', s: 200 })])).toContain('a request was sent: POST /api/save → 200');
    expect(feedbackLines('click', W, [], 1)).toContain('a request was sent and has not answered yet');
    // A fill's save may be debounced past its window: no claim either way.
    expect(feedbackLines('fill', W, []).some((l) => /request/.test(l))).toBe(false);
  });

  it('only facts attributed with confidence: another window\'s, an overlap, the app\'s — none', () => {
    const lines = feedbackLines('click', W, [
      { t: 1, k: 'show', d: 'dialog "Late"', c: ['late', 3, 'req'] },
      { t: 1, k: 'show', d: 'dialog "Both"', c: ['in', W, 'gesture'], also: 3 },
      { t: 1, k: 'state', d: 'option "x"', a: 'class', on: true, c: ['app', 'poll'] },
      own('req', { m: 'GET', e: 'http://app/x', s: 200 }),
    ]);
    expect(lines).toEqual(['a request was sent: GET /x → 200']);
  });

  it('at most a few lines', () => {
    const many = Array.from({ length: 10 }, (_, i) => own('state', { d: `option "o${i}"`, a: 'class', on: true }));
    expect(feedbackLines('click', W, many)).toHaveLength(MAX_FEEDBACK_LINES);
  });

  describe('credentials', () => {
    const saved = process.env.APP_PASSWORD;
    afterEach(() => {
      if (saved === undefined) delete process.env.APP_PASSWORD;
      else process.env.APP_PASSWORD = saved;
      clearSecretLedger();
    });
    it('a secret the page shows in a name is scrubbed to its marker', () => {
      process.env.APP_PASSWORD = 's3cret-pass-99';
      resolveSecrets('{{env:APP_PASSWORD}}'); // the session resolved it: now in the scrub ledger
      const lines = feedbackLines('click', W, [own('state', { d: 'option "s3cret-pass-99"', a: 'class', on: true })]);
      expect(lines.join('\n')).not.toContain('s3cret-pass-99');
      expect(lines.join('\n')).toContain('{{env:APP_PASSWORD}}');
    });
  });

  it('the text: nothing when there is nothing, else one short header', () => {
    expect(feedbackText([])).toBe('');
    expect(feedbackText(['a', 'b'])).toBe('\njournal: a; b');
  });

  it('off unless SITELOOPER_JOURNAL_FEEDBACK=on', () => {
    expect(journalFeedbackOn({})).toBe(false);
    expect(journalFeedbackOn({ SITELOOPER_JOURNAL_FEEDBACK: '1' })).toBe(false);
    expect(journalFeedbackOn({ SITELOOPER_JOURNAL_FEEDBACK: 'on' })).toBe(true);
  });
});
