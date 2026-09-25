/**
 * Which option a key press picked, read from the recorder journal's option
 * state (daemon/journal-page.ts `state` events). The one reading of it: the
 * shadow report's keyPick rule and compile's named keyboard selection
 * (fix/round62-gt) both import it.
 *
 * gitea fwgt13-n1 02-create picked every label, the milestone and the
 * assignee by keyboard (ArrowDown ×k, Enter). The journal recorded, for each
 * key, the option whose class gained `active`/`selected` (the highlight) and,
 * for each Enter, the option whose class gained or lost `checked` (the pick):
 * Enter #65 ticked `priority-high`. Replayed by position, the same keys ticked
 * `enhancement` (labels), `admin` (assignee) and `Backlog` (milestone), and
 * every run reported success. The name is the fact; the position is a guess.
 *
 * Reads only events attributed to the press's own window (`in`, no overlap).
 */
import type { RecordedStep } from '../daemon/recorder.js';
import type { JournalEvent } from '../daemon/journal-attribute.js';

/** Keys that commit a pick in a picker. */
export const PICK_KEYS: ReadonlySet<string> = new Set(['Enter', 'Space', ' ']);
/** Keys that move the highlight. */
export const MOVE_KEYS: ReadonlySet<string> = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp', 'Tab']);

/** Roles whose state a pick changes. */
const OPTION_ROLE = /^(option|menuitem|menuitemcheckbox|menuitemradio|checkbox|radio|switch|treeitem|link|tab|gridcell|row|listitem|div|span|li|a) "/;
/** A class change that means "this one is highlighted" (keyboard focus), not ticked. */
const HIGHLIGHT = /(^|\s)\+(active|selected|highlighted|highlight|focus(ed)?|is-active|hover|current|focused)\b/;

export interface KeyPick {
  /** The key as the step pressed it. */
  key: string;
  /** The option's accessible name, as the journal described it. */
  option: string;
  /**
   * `toggle`: the press changed the option's own checked/selected state (`on`
   * says which way) — a pick. `highlight`: the press moved the highlight onto
   * it (arrow keys), nothing picked yet.
   */
  kind: 'toggle' | 'highlight';
  on?: boolean;
  /** How the option was described (role and name). */
  described: string;
}

const nameOf = (d: unknown): string => {
  const m = /^[\w-]+ "(.*)"$/.exec(String(d ?? ''));
  return (m ? m[1] : String(d ?? '')).replace(/^[^\p{L}\p{N}]+/u, '').trim();
};

/** The events of a step's own window, with no overlap. */
function ownEvents(step: RecordedStep): JournalEvent[] {
  const w = step.journal?.w;
  if (w === undefined) return [];
  return [...(step.journal?.ev ?? []), ...(step.journal?.gap?.ev ?? [])].filter((e) => e.c?.[0] === 'in' && e.c[1] === w && e.also === undefined);
}

/** The key a press step pressed (`press` with `key`, or `text` for a single key). */
export function keyOf(step: RecordedStep): string | null {
  if (step.tool !== 'press') return null;
  const k = step.args.key ?? step.args.text;
  return typeof k === 'string' && k ? k : null;
}

/**
 * The option key press `step` picked or highlighted, from its own journal
 * window; null when the step is not a key press, the journal says nothing,
 * or the evidence names no single option.
 *
 * A pick key (Enter, Space) is a `toggle` when an option's state changed with
 * a known direction; failing that, the option the press's own window still
 * shows highlighted. A move key (arrows, Home, End, Tab) is the `highlight`:
 * the last option whose class gained a highlight token.
 */
export function pickedByKey(step: RecordedStep): KeyPick | null {
  const key = keyOf(step);
  if (!key || !step.journal) return null;
  const own = ownEvents(step).filter((e) => e.k === 'state' && OPTION_ROLE.test(String(e.d ?? '')));
  const pick = PICK_KEYS.has(key);
  if (!pick && !MOVE_KEYS.has(key)) return null;
  if (pick) {
    const toggled = own.filter((e) => typeof e.on === 'boolean' && e.a !== 'aria-expanded');
    const names = new Set(toggled.map((e) => nameOf(e.d)));
    if (names.size === 1) {
      const e = toggled[toggled.length - 1];
      return { key, option: nameOf(e.d), kind: 'toggle', on: e.on as boolean, described: String(e.d) };
    }
    if (names.size > 1) return null; // a press that changed several options names none of them
  }
  const lit = own.filter((e) => e.a === 'class' && HIGHLIGHT.test(` ${String(e.x ?? '')}`));
  const last = lit[lit.length - 1];
  return last ? { key, option: nameOf(last.d), kind: 'highlight', described: String(last.d) } : null;
}

/**
 * The option each pick key of `steps` picked, by step index: what "key press
 * #N selected". A pick key whose own window shows no toggle is resolved to the
 * option the preceding move keys left highlighted, when those are journaled
 * and no other gesture came between (a select-one widget that commits the
 * highlight without a checked class).
 */
export function keyPicks(steps: readonly RecordedStep[]): Map<number, KeyPick> {
  const out = new Map<number, KeyPick>();
  let highlighted: KeyPick | null = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const key = keyOf(s);
    if (!key) {
      if (s.tool !== 'read' && s.tool !== 'read_all' && s.tool !== 'screenshot' && s.tool !== 'eval') highlighted = null;
      continue;
    }
    const p = pickedByKey(s);
    if (MOVE_KEYS.has(key)) {
      if (p) highlighted = p;
      continue;
    }
    if (!PICK_KEYS.has(key)) {
      highlighted = null;
      continue;
    }
    if (p?.kind === 'toggle') out.set(i, p);
    else if (p) out.set(i, { ...p, key });
    else if (highlighted) out.set(i, { ...highlighted, key, kind: 'highlight' });
    highlighted = null;
  }
  return out;
}
