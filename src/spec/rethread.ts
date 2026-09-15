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
 */

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
}

/**
 * Align `template` against `instruction` and rebind literal params.
 *
 * Only literals are considered — a param that already carries `{{` is
 * authoritative and is never touched. `stepId` only shapes the warnings.
 */
export function rethreadParams(
  stepId: string,
  instruction: string,
  template: string,
  params: Record<string, string>,
  runValues: string[] = [],
): RethreadOutcome {
  const out: RethreadOutcome = { params: { ...params }, warnings: [], rebound: {} };
  const literals = Object.entries(params).filter(([, v]) => typeof v === 'string' && !v.includes('{{'));
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
  if (!literals.length || !REF.test(instruction)) return out;

  const align = alignSlots(template, instruction);
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
  const m = new RegExp(`^${pattern}$`, 'i').exec(squash(instruction));
  if (!m) return null;

  // Slots with no literal text between them cannot be split reliably.
  const adjacent = new Set<string>();
  const spans = [...t.matchAll(/\{\{(v\d+)\}\}/g)];
  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1];
    const end = (prev.index ?? 0) + prev[0].length;
    if (!t.slice(end, spans[i].index ?? 0).trim()) {
      adjacent.add(prev[1]);
      adjacent.add(spans[i][1]);
    }
  }

  const seen = new Map<string, string | null>();
  names.forEach((name, i) => {
    const text = m[i + 1].trim();
    if (adjacent.has(name)) return seen.set(name, null);
    if (seen.has(name) && squash(seen.get(name) ?? '') !== squash(text)) return seen.set(name, null);
    if (!seen.has(name)) seen.set(name, text);
  });
  return seen;
}
