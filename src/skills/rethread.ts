/**
 * Re-thread a flow step's literal params against its own instruction.
 *
 * WHY THIS EXISTS. A flow step carries both an instruction with `{{...}}`
 * references in it ("Open the confirmed sales order
 * {{02-create.quotation_ref}} for customer '{{runid}} Bench Customer' ...")
 * and the bindings for its pinned skill's `{{vN}}` slots. Those two are
 * supposed to agree, but an adoption during replay binds the slots to THAT
 * run's concrete values — the published odoo flow has 06-open pinned at
 * `{"v1":"S00022","v2":"fwod34-n2"}` while every sibling step is threaded.
 * A literal binding is stale on every later run: the compiled spec then
 * drives the recording's record, its identity checks look for the wrong
 * name, and replay falls back to the model on every run.
 *
 * WHAT IT DOES. The skill template and the step instruction are the same
 * sentence with slots — `{{vN}}` in one, `{{ref}}` in the other — so reading
 * the template as a pattern over the instruction (exactly as `bindSkill`
 * reads it over a real instruction) puts each slot on the text that filled
 * it. Where that text is (or contains) a reference, the literal is rebound
 * to it. Where it is plain text the literal is left alone: a param like
 * `v3: "Sales Order"` sitting on the words "Sales Order" is correctly bound,
 * not debt. Ambiguity — a template that will not align, two occurrences of
 * one slot disagreeing, adjacent slots with nothing between them — is left
 * alone and reported, never guessed at.
 *
 * ONE PATH (round 60). This used to run only inside the spec compiler, so the
 * artifact quietly repaired flows the daemon replayed as written. odoo fwod85
 * 05-open is what that cost: the export bound s_6a1629 over the RAW
 * instruction, where the product name "[E-COM11] Cabinet with Doors" carries
 * the template's own separator word, so v9 stopped at the first " with " and
 * the adjacent `{{v6}} {{v10}}` could not be split — v10 was dropped from the
 * flow. The artifact rethreaded v9 and passed; both daemon replays refused on
 * "missing params: v10". Now `threadStepParams` is the one entry: the export
 * (buildFlow) binds through it, and both runners pass every stored flow step
 * through it before binding (daemon runFlow, spec ir), so a flow written
 * before this rule is repaired the same way on both sides. Aligned against
 * the REFERENCED instruction, a value's own words cannot mislead the split: a
 * reference carries none. And a declared slot the params left out entirely is
 * filled when the instruction puts a reference at it (`declared`).
 */

import type { FlowStep } from './flow.js';
import type { Skill } from './store.js';

/** Same normalisation `skills/learn.ts` binds through: quote style and whitespace do not count. */
function squash(text: string): string {
  return text.replace(/[“”"]/g, "'").replace(/\s+/g, ' ').trim();
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const REF = /\{\{[\w.#:-]+\}\}/;

export interface RethreadOutcome {
  /** The step's params, with every unambiguously re-threadable literal rebound. */
  params: Record<string, string>;
  /** One line per param that was rebound, or that is literal and could not be. */
  warnings: string[];
  /** slot -> the reference text it was rebound to. */
  rebound: Record<string, string>;
  /** slot -> the reference text a declared slot the params left out was filled with. */
  filled: Record<string, string>;
}

/**
 * Align `template` against `instruction` and rebind literal params.
 *
 * Only literals are considered — a param that already carries `{{` is
 * authoritative and is never touched. `stepId` only shapes the warnings.
 * `declared` names the pinned skill's slots: one absent from `params` is
 * filled where the alignment puts a reference at it, and nowhere else — plain
 * text at an absent slot is no binding this function can vouch for.
 */
export function rethreadParams(
  stepId: string,
  instruction: string,
  template: string,
  params: Record<string, string>,
  runValues: string[] = [],
  declared: readonly string[] = [],
): RethreadOutcome {
  const out: RethreadOutcome = { params: { ...params }, warnings: [], rebound: {}, filled: {} };
  const literals = Object.entries(params).filter(([, v]) => typeof v === 'string' && !v.includes('{{'));
  const absent = declared.filter((slot) => !(slot in params) || params[slot] === '');
  // A literal the instruction states in its own plain words is bound right,
  // whether or not the template aligns: kanboard fwkb9's 03-verify/04-open/
  // 05-set bound v1/v3 to "Bench Board", the instruction says "project 'Bench
  // Board'" outside any reference, yet a reworded template failed alignSlots
  // and each step warned it "could not be rethreaded". There is no reference
  // it could be rethreaded TO. Only for the alignment's failure modes (no
  // alignment, ambiguous slot): an alignment that puts DIFFERENT plain text
  // at the slot is positive evidence and still warns.
  const stated = (value: string): boolean => statedPlainly(instruction, value, runValues);
  // Nothing to repair unless the step has a literal AND an instruction that
  // threads something: a flow whose instruction has no references has no
  // better binding to offer than the literal it already carries.
  if ((!literals.length && !absent.length) || !REF.test(instruction)) return out;

  const align = alignSlots(template, instruction);
  if (align) {
    for (const slot of absent) {
      const seen = align.get(slot);
      if (typeof seen !== 'string' || !REF.test(seen)) continue;
      out.params[slot] = seen;
      out.filled[slot] = seen;
      out.warnings.push(`step ${stepId} param ${slot} was unbound; threaded to ${seen} from the instruction`);
    }
  }
  if (!literals.length) return out;
  if (!align) {
    for (const [slot, value] of literals) {
      if (stated(value)) continue;
      out.warnings.push(
        `step ${stepId} param ${slot} is bound to the literal ${JSON.stringify(value)}; it could not be rethreaded — the step will run against the recording's record`,
      );
    }
    return out;
  }

  for (const [slot, value] of literals) {
    const seen = align.get(slot);
    if (seen === undefined) continue; // the template has no such slot: nothing to align against
    if (seen === null) {
      if (stated(value)) continue;
      out.warnings.push(
        `step ${stepId} param ${slot} is bound to the literal ${JSON.stringify(value)}; the alignment is ambiguous so it could not be rethreaded — the step will run against the recording's record`,
      );
      continue;
    }
    if (REF.test(seen)) {
      out.params[slot] = seen;
      out.rebound[slot] = seen;
      out.warnings.push(
        `step ${stepId} param ${slot} was bound to the literal ${JSON.stringify(value)}; rethreaded to ${seen} from the instruction`,
      );
      continue;
    }
    // Plain text at the slot. Equal to the literal (modulo quote style and
    // whitespace) means the binding is already right — silence is correct.
    if (squash(seen).toLowerCase() === squash(value).toLowerCase()) continue;
    out.warnings.push(
      `step ${stepId} param ${slot} is bound to the literal ${JSON.stringify(value)} but the instruction has plain text ${JSON.stringify(seen)} there; it could not be rethreaded — the step will run against the recording's record`,
    );
  }
  return out;
}

/**
 * Whether `value` appears verbatim (quote style, whitespace and case aside) in
 * the instruction's PLAIN text — every `{{…}}` reference cut out, so a literal
 * never matches across one — on word boundaries, and carries none of the run's
 * var values (a literal holding this run's runid is exactly the debt rethreading
 * exists for, however it reads). Exported for tests.
 */
export function statedPlainly(instruction: string, value: string, runValues: string[] = []): boolean {
  const want = squash(value).toLowerCase();
  if (!want || want.includes('{{')) return false;
  if (runValues.some((v) => v && want.includes(squash(v).toLowerCase()))) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(want)}(?![\\p{L}\\p{N}])`, 'u');
  return instruction
    .split(/\{\{[^}]*\}\}/)
    .some((piece) => re.test(squash(piece).toLowerCase()));
}

/**
 * The instruction text sitting at each `{{vN}}` slot of the template.
 *
 * `null` for a slot whose occurrences disagree or that abuts another slot
 * (nothing separates them, so the split between the two is a guess); the
 * whole result is null when the template does not read as a pattern over the
 * instruction at all. Exported for tests.
 */
export function alignSlots(template: string, instruction: string): Map<string, string | null> | null {
  const t = squash(template);
  const names: string[] = [];
  const pattern = escapeRe(t).replace(/\\\{\\\{(v\d+)\\\}\\\}/g, (_m, name: string) => {
    names.push(name);
    return '(.+?)';
  });
  if (!names.length) return null;
  const text = squash(instruction);
  const m = new RegExp(`^${pattern}$`, 'id').exec(text);
  if (!m) return null;

  // Runs of occurrences with no literal text between them: the split between
  // them is a guess unless evidence places it.
  const spans = [...t.matchAll(/\{\{(v\d+)\}\}/g)];
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1];
    const end = (prev.index ?? 0) + prev[0].length;
    if (!t.slice(end, spans[i].index ?? 0).trim()) {
      if (!run.length) run.push(i - 1);
      run.push(i);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  const inRun = new Set(runs.flat());

  const seen = new Map<string, string | null>();
  const place = (name: string, value: string): void => {
    if (seen.get(name) === null) return;
    if (seen.has(name) && squash(seen.get(name) ?? '').toLowerCase() !== squash(value).toLowerCase()) seen.set(name, null);
    else if (!seen.has(name)) seen.set(name, value);
  };
  names.forEach((name, i) => {
    if (!inRun.has(i)) place(name, m[i + 1].trim());
  });

  // A run is split only on what a SEPARATED occurrence of one of its slots
  // already placed (the hard-requirement evidence of learn.ts
  // resolveAdjacentRun): peel the placed slots off either end of the text the
  // run covers; exactly one unplaced slot may take what is left. fwod85
  // 05-open: `{{v6}} {{v10}}` over "Quantity {{04-open.line2_quantity}}",
  // where "first line's {{v6}} from 3" placed v6 = "Quantity". Anything else
  // — nothing placed, a placed value that does not lead or trail the text,
  // two unplaced slots — stays ambiguous: every slot of the run is null.
  const placed = new Map([...seen].filter((e): e is [string, string] => typeof e[1] === 'string'));
  const at = m.indices!;
  for (const r of runs) {
    const slots = r.map((i) => names[i]);
    const covered = text.slice(at[r[0] + 1][0], at[r[r.length - 1] + 1][1]).trim();
    const parts = splitRun(slots, covered, placed);
    if (parts) slots.forEach((name, k) => place(name, parts[k]));
    else for (const name of slots) seen.set(name, null);
  }
  return seen;
}

/** `covered` cut among `slots`, peeling placed values off both ends; null unless at most one unplaced slot is left, and it takes the rest. */
function splitRun(slots: string[], covered: string, placed: ReadonlyMap<string, string>): string[] | null {
  const parts: string[] = new Array<string>(slots.length).fill('');
  let rest = covered;
  let lo = 0;
  let hi = slots.length - 1;
  const lower = (x: string): string => squash(x).toLowerCase();
  while (lo <= hi) {
    const k = placed.get(slots[lo]);
    if (k === undefined) break;
    if (!lower(rest).startsWith(lower(k))) return null;
    parts[lo++] = k;
    rest = rest.slice(squash(k).length).trim();
  }
  while (hi >= lo) {
    const k = placed.get(slots[hi]);
    if (k === undefined) break;
    if (!lower(rest).endsWith(lower(k))) return null;
    parts[hi--] = k;
    rest = rest.slice(0, rest.length - squash(k).length).trim();
  }
  if (lo > hi) return rest ? null : parts;
  if (lo !== hi || !rest) return null;
  parts[lo] = rest;
  return parts;
}

/**
 * A flow step's params, threaded against its own instruction for the skill it
 * pins: literals rebound to the references at their slots, declared slots the
 * params left out filled where a reference stands at them. The one entry the
 * export (buildFlow) and both runners (daemon runFlow, spec ir) bind through,
 * so neither runner repairs a flow the other runs as written. A step with no
 * params is left alone: replay binds it from the instruction at run time.
 */
export function threadStepParams(
  step: Pick<FlowStep, 'id' | 'instruction' | 'params'>,
  skill: Pick<Skill, 'template' | 'params'> | null | undefined,
): { params: Record<string, string> | undefined; warnings: string[]; filled: Record<string, string>; rebound: Record<string, string> } {
  if (!skill || !step.params) return { params: step.params, warnings: [], filled: {}, rebound: {} };
  const out = rethreadParams(step.id, step.instruction, skill.template, step.params, [], Object.keys(skill.params ?? {}));
  return { params: out.params, warnings: out.warnings, filled: out.filled, rebound: out.rebound };
}
