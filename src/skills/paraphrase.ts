import { extractValues, type TaskValue } from '../agent/actor.js';
import type { Decider } from '../agent/decide.js';
import { urlMatches } from './compile.js';
import { isVerified, type Skill } from './store.js';

/**
 * PLAN-jev.md §6, bet 1: a REWORDED instruction run without the model.
 *
 * `matchTemplate` (learn.ts) needs the instruction to match a validated skill's
 * template word for word, and an orchestrator never says the same thing twice —
 * the same RepairDesk task arrived as 4, 5, 6 and 13 differently worded
 * instructions across one branch's sweeps. This is the fallback behind it: a
 * decider says which stored procedure the instruction IS (or none), and the
 * slots are bound here.
 *
 * What was measured offline, and what it means for the rules below:
 *
 *  - MATCHING held: 0 wrong procedures in 600 (bench/jev-match-offline.mjs).
 *    It is a decider's job and this file only names its type.
 *  - BINDING is the weak half (bench/jev-bind-offline.mjs). "The only literal
 *    of that shape" is wrong 84% of the time once the shapes are generic (a run
 *    id and a ticket reference are both a token with a digit). What works is
 *    comparing a candidate with the value the blank was RECORDED with — and its
 *    one failure class is a blank the new wording does not state at all, given
 *    whatever literal is lying around. 63% of slots carry a SESSION BINDING and
 *    are exactly that class, so:
 *
 *      1. a slot with a binding the ledger can fill is filled from the ledger,
 *         as the exact binder does — never from the text;
 *      2. a slot with a binding the ledger CANNOT fill binds from text only on
 *         an unambiguous winner, and is never put to a decider;
 *      3. any other slot binds to the literal that resembles its recorded
 *         example; several that do are CONTESTED and go to the decider
 *         ('… Part A' / '… Part B' — where overlap follows the recording and
 *         the instruction may mean the other);
 *      4. a bound value must have the generic shape of the recorded one, no
 *         literal fills two different blanks, and every slot must bind — or
 *         nothing replays and the model runs the instruction as it always did.
 *
 * Nothing here knows whether a decider exists: both are plain `Decider`s,
 * composed at the root (daemon/server.ts).
 */

export interface MatchQuery {
  instruction: string;
  /** Verified chain heads whose start page is the current one — see `eligibleSkills`. */
  skills: Skill[];
}
/** Which stored procedure this instruction is, or null. */
export type MatchSkill = Decider<MatchQuery, Skill>;

export interface ContestQuery {
  instruction: string;
  skill: Skill;
  slot: string;
  candidates: TaskValue[];
}
/** Which of several plausible literals fills a blank, or null. */
export type PickLiteral = Decider<ContestQuery, TaskValue>;

/**
 * A start pattern that is itself an ADDRESS: no record id, no slot, no wildcard.
 *
 * A skill replays only from the page its recording started on, and where an instruction
 * starts is an accident of where the last one ended: across 18 RepairDesk stores "add a part"
 * was recorded from the tickets list 11 times and from the ticket's page 11 times
 * (bench/start-page-spread.mjs), so a stored skill is ineligible half the time for a reason
 * that has nothing to do with what it does. A skill whose start page is concrete can be run
 * from anywhere by going to that recorded address first — what a flow already does for its
 * own start. A pattern carrying a record id cannot: the address does not say WHICH record.
 */
export function concreteStart(skill: Skill): string | null {
  const pattern = skill.preconditions.urlPattern;
  if (!pattern || /:[A-Za-z]|\{\{|\*/.test(pattern.replace(/^https?:/i, ''))) return null;
  try {
    return new URL(pattern).href;
  } catch {
    return null;
  }
}

/**
 * Skills a zero-model path may run here: verified, a chain's head, and starting on this
 * page — or, with `anywhere`, on a concrete page that can be navigated to first.
 */
export function eligibleSkills(skills: readonly Skill[], url: string, anywhere = false): Skill[] {
  return skills.filter(
    (s) => isVerified(s) && !(s.seq && s.seq.index > 0) && (urlMatches(s.preconditions.urlPattern, url) || (anywhere && concreteStart(s) !== null)),
  );
}

export type ValueShape = 'url' | 'email' | 'number' | 'date' | 'code' | 'text';

/** What any app's values can be told apart by — deliberately nothing app-specific. */
export function shapeOf(value: string): ValueShape {
  const t = String(value).trim();
  if (/^https?:\/\//i.test(t)) return 'url';
  if (/^[^\s@]+@[^\s@]+$/.test(t)) return 'email';
  if (/^\$?\d+(?:[.,]\d+)?%?$/.test(t)) return 'number';
  if (/^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return 'date';
  if (!/\s/.test(t) && /\d/.test(t)) return 'code';
  return 'text';
}

const tokens = (v: string): Set<string> => new Set(String(v).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
/** Token overlap (Jaccard) between a candidate and the value the blank was recorded with. */
export function resemblance(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared || 1);
}

/** The word standing before a blank in the template: `cost {{v5}}` → "cost". */
function cueOf(template: string, slot: string): string | undefined {
  return new RegExp(`([A-Za-z]+)[\\s:=('"]*\\{\\{${slot}\\}\\}`).exec(template)?.[1]?.toLowerCase();
}

/** The literals of this shape that the same cue word precedes in the instruction. */
function byCue(template: string, slot: string, instruction: string, candidates: readonly TaskValue[]): TaskValue[] {
  const cue = cueOf(template, slot);
  if (!cue || cue.length < 3) return [];
  return candidates.filter((c) => {
    const at = instruction.indexOf(c.text);
    return at >= 0 && /([A-Za-z]+)[\s:=('"]*$/.exec(instruction.slice(0, at))?.[1]?.toLowerCase() === cue;
  });
}

export interface BindingPlan {
  /** Slots settled in code. */
  bound: Record<string, string>;
  /** Slots with several plausible literals: a decider's, or a refusal without one. */
  contested: Record<string, TaskValue[]>;
  /** Blanks the instruction does not state, with why — a value may still be DERIVED for them (see deriveUnstated). */
  unstated: Record<string, string>;
  /** Why this skill cannot be bound from this instruction at all. */
  refused?: string;
}

/** Everything code can settle about a skill's blanks, and what it cannot. */
export function planBinding(skill: Skill, instruction: string, known: Record<string, string>): BindingPlan {
  const literals = extractValues(instruction);
  const bound: Record<string, string> = {};
  const contested: Record<string, TaskValue[]> = {};
  const unstated: Record<string, string> = {};
  for (const [slot, p] of Object.entries(skill.params)) {
    // 1. The run's own ledger, exactly as bindSkill resolves it.
    if (p.binding && known[p.binding]) {
      bound[slot] = known[p.binding];
      continue;
    }
    const shape = shapeOf(p.example);
    const same = literals.filter((l) => shapeOf(l.text) === shape);
    if (!same.length) {
      unstated[slot] = `{{${slot}}} (recorded as ${JSON.stringify(p.example)}): the instruction states no ${shape}`;
      continue;
    }
    let plausible: TaskValue[];
    if (shape === 'number' || shape === 'url' || shape === 'date' || shape === 'email') {
      // These never resemble one another token-wise: the template's cue word, or being alone.
      const cued = byCue(skill.template, slot, instruction, same);
      plausible = cued.length ? cued : same;
    } else {
      const ranked = same.map((l) => ({ l, s: resemblance(l.text, p.example) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
      if (!ranked.length) {
        unstated[slot] = `{{${slot}}} (recorded as ${JSON.stringify(p.example)}): nothing the instruction states resembles it`;
        continue;
      }
      plausible = ranked.filter((r) => r.s === ranked[0].s).map((r) => r.l);
      // Several that resemble it AT ALL are rivals even when one resembles it more:
      // overlap follows the recording, and the instruction may mean the other one.
      if (ranked.length > 1 && !p.binding) plausible = ranked.map((r) => r.l);
    }
    if (plausible.length === 1) bound[slot] = plausible[0].text;
    else if (p.binding) return { bound, contested, unstated, refused: `{{${slot}}} is a session value the run has not produced, and the instruction does not single it out` };
    else contested[slot] = plausible;
  }
  return { bound, contested, unstated };
}

/**
 * A blank the instruction does not state, read off one it does.
 *
 * A run tag is the case (fxmtg50a-n1): the recording held {{v3}} = "fwrdev2-n1" and
 * {{v2}} = "fwrdev2-n1 RD Bench Ticket", and the new instruction states only the title.
 * Where one blank's recorded value sits INSIDE another's, the same cut of the other's new
 * value is this blank's new value — arithmetic on two strings the recording supplies, no
 * guess. Anything that does not line up exactly (the rest of the recorded value is not the
 * rest of the new one, or the cut changes shape) derives nothing, and the blank stays unbound.
 */
export function deriveUnstated(skill: Skill, params: Record<string, string>, slot: string): string | null {
  const example = skill.params[slot]?.example ?? '';
  if (example.length < 3) return null;
  for (const [other, value] of Object.entries(params)) {
    const whole = skill.params[other]?.example ?? '';
    const at = whole.indexOf(example);
    if (other === slot || at < 0 || whole === example) continue;
    const before = whole.slice(0, at);
    const after = whole.slice(at + example.length);
    if (!value.startsWith(before) || !value.endsWith(after) || value.length <= before.length + after.length) continue;
    const cut = value.slice(before.length, value.length - after.length);
    if (shapeOf(cut) === shapeOf(example)) return cut;
  }
  return null;
}

/**
 * The instruction as a stored procedure with every blank filled, or null.
 * `pick` settles contested blanks; without one a contested blank is a refusal.
 */
export async function bindParaphrase(
  skill: Skill,
  instruction: string,
  known: Record<string, string>,
  pick?: PickLiteral,
): Promise<{ params: Record<string, string> } | { refused: string }> {
  const plan = planBinding(skill, instruction, known);
  if (plan.refused) return { refused: plan.refused };
  const params = { ...plan.bound };
  for (const [slot, candidates] of Object.entries(plan.contested)) {
    const chosen = pick ? await pick({ instruction, skill, slot, candidates }, {}) : null;
    if (!chosen) return { refused: `{{${slot}}}: ${candidates.length} literals could fill it and none was singled out` };
    params[slot] = chosen.text;
  }
  for (const [slot, why] of Object.entries(plan.unstated)) {
    const derived = deriveUnstated(skill, params, slot);
    if (!derived) return { refused: why };
    params[slot] = derived;
  }
  // No literal fills two DIFFERENT blanks: that is one value read twice, not two values.
  const seen = new Map<string, string>();
  for (const [slot, value] of Object.entries(params)) {
    const other = seen.get(value);
    if (other !== undefined && skill.params[other]?.example !== skill.params[slot]?.example && !skill.params[slot]?.binding && !skill.params[other]?.binding) {
      return { refused: `{{${other}}} and {{${slot}}} were both given ${JSON.stringify(value)}` };
    }
    seen.set(value, slot);
  }
  return Object.keys(skill.params).every((slot) => params[slot]) ? { params } : { refused: 'a blank stayed empty' };
}
