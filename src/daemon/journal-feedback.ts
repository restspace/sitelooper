/**
 * Stage 4: journal facts told back to the recording model, behind
 * SITELOOPER_JOURNAL_FEEDBACK=on (default off; with it off the tool result is
 * byte-identical). A few terse lines after a gesture, from events the journal
 * attributes to that gesture's own window with no overlap (`in`, no `also`):
 * never a guess, never a value (the journal holds none), never credential text
 * (every line is scrubbed). Model-independent: plain text any model reads.
 *
 *  - where a click landed, when not on its target (an overlay covered it)
 *  - option / checkbox / expanded state that changed ("'bug' is now selected")
 *  - where focus went, when not the element acted on
 *  - a popup (dialog, listbox, menu, tooltip) that opened or closed
 *  - whether a click or key press sent a request ("no request was sent")
 */
import { scrubSecrets } from '../shared/secrets.js';
import type { JournalEvent } from './journal-attribute.js';

/** Whether feedback is on (read per call: a test or a daemon restart may change it). */
export function journalFeedbackOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SITELOOPER_JOURNAL_FEEDBACK === 'on';
}

/** The most lines a tool result gains. */
export const MAX_FEEDBACK_LINES = 4;

const POPUP = /^(dialog|alertdialog|listbox|menu|menubar|tooltip) /;
/** Tools after which "no request was sent" is a fact worth saying: a fill's save may be debounced past its window. */
const SENDS = new Set(['click', 'dblclick', 'press', 'select', 'check']);

const name = (d: unknown) => {
  const m = /^[\w-]+ "(.*)"$/.exec(String(d ?? ''));
  // A check mark or icon glyph before the label is decoration, not its name.
  return (m ? m[1] : String(d ?? '')).replace(/^[^\p{L}\p{N}]+/u, '').trim();
};
const what = (d: unknown) => {
  const s = String(d ?? '');
  const role = s.split(' ')[0];
  const n = name(s);
  return n ? `${role} "${n.slice(0, 50)}"` : role;
};

/**
 * The feedback lines for one gesture: `own` are the events of its window
 * (StepJournal.ev), `inFlight` how many requests it started that have not
 * answered yet (still held by the journal).
 */
export function feedbackLines(tool: string, w: number, own: readonly JournalEvent[], inFlight = 0): string[] {
  const sure = own.filter((e) => e.c?.[0] === 'in' && e.c[1] === w && e.also === undefined);
  const lines: string[] = [];
  // Where the click landed.
  const covered = sure.find((e) => e.k === 'hit' && e.on === 0);
  if (covered) lines.push(`the click landed on ${what(covered.cover ?? covered.d)}, not on its target (something covered it)`);
  // Popups, before state and focus: under the line cap, what opened outranks where focus went (verify-main62).
  for (const e of sure) {
    if ((e.k === 'show' || e.k === 'hide') && POPUP.test(String(e.d))) lines.push(`${what(e.d)} ${e.k === 'show' ? 'opened' : 'closed'}`);
  }
  // State.
  const states = new Map<string, JournalEvent>();
  for (const e of sure) if (e.k === 'state' && typeof e.on === 'boolean') states.set(`${String(e.a) === 'aria-expanded' ? 'x' : 's'}:${name(e.d)}`, e);
  for (const e of states.values()) {
    const n = name(e.d);
    if (!n) continue;
    if (e.a === 'aria-expanded') lines.push(`'${n.slice(0, 50)}' is now ${e.on ? 'expanded' : 'collapsed'}`);
    else if (e.a === 'aria-pressed') lines.push(`'${n.slice(0, 50)}' is now ${e.on ? 'pressed' : 'not pressed'}`);
    else lines.push(`'${n.slice(0, 50)}' is now ${e.on ? 'selected' : 'not selected'}`);
  }
  // Focus, when it went somewhere other than what was acted on.
  const target = sure.find((e) => e.k === 'hit')?.d ?? sure.find((e) => e.k === 'val')?.f;
  const focus = [...sure].reverse().find((e) => e.k === 'foc' && e.dir === 'in');
  if (focus && target !== undefined && focus.d !== target) lines.push(`focus is now in ${what(focus.d)}, not ${what(target)}`);
  // Requests.
  if (SENDS.has(tool)) {
    const reqs = sure.filter((e) => e.k === 'req');
    if (!reqs.length && !inFlight) lines.push('no request was sent');
    else if (reqs.length) {
      const r = reqs[0];
      const path = String(r.e ?? '').replace(/^https?:\/\/[^/]+/, '');
      lines.push(`a request was sent: ${String(r.m)} ${path}${r.s !== undefined ? ` → ${String(r.s)}` : ''}${r.fail ? ' (failed)' : ''}${reqs.length > 1 ? ` (+${reqs.length - 1} more)` : ''}`);
    } else lines.push('a request was sent and has not answered yet');
  }
  return [...new Set(lines)].slice(0, MAX_FEEDBACK_LINES).map((l) => scrubSecrets(l));
}

/** The text a tool result gains: nothing, or the lines under one short header. */
export function feedbackText(lines: readonly string[]): string {
  return lines.length ? `\njournal: ${lines.join('; ')}` : '';
}
