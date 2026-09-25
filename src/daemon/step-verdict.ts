/**
 * When a flow step may call itself a SUCCESS (round 55, "honesty").
 *
 * A step reported `success` is taken at its word everywhere after: the flow
 * counts it passed, a recovery's recording is compiled and banked as a
 * working procedure, and the pin may move onto it. Round 54 showed two ways
 * that word was wrong, each visible in the executor's OWN record — never in
 * the model's prose, which this module does not read:
 *
 *  - fwop10-n2 02-create: the recovery's last gesture, the "Submit comment"
 *    click, was not dispatched (the button was still disabled). The model
 *    reported success anyway ("NOT confirmed as posted"), and the recording —
 *    which never contained the failed click — was banked as s_a575e9 and
 *    s_7b4c9e: comment procedures with no submit, 1/1, eligible to re-pin.
 *    The loop now says so (InstructionResult.unfinishedGesture).
 *  - fwsi7 05-open: a zero-model replay whose read of `checked_out_to_user`, a
 *    declared output, found no element and was skipped. The step reported
 *    success at tier A, with the value simply missing.
 *
 * Either is PARTIAL: not a success, not counted passed, and — for a recovery
 * — not banked and not re-pinned. The flow goes on, as it does for an adopted
 * step: the next step fails on its own terms if the work did not stick.
 *
 * WHAT IS DELIBERATELY NOT A REASON. Unreported outputs alone. A recovery
 * reports under its own names (fwop10-n2 02-create reported
 * `work_package_subject`, the flow declares `subject`: eight "unreported"
 * outputs, every one of them reported), and a zero-model replay drops an
 * ECHO — a read of the very value the procedure typed — from its confident
 * values by design: fwgr68, fwkb39, fwrd87 and fwvk7 all have such steps and
 * all were green in round 54. A skipped read is different: nothing was
 * observed at all.
 *
 * But only of a fact the instruction ASKED for (askedOutputs, round 56's rule).
 * EspoCRM fwec11 01-signin was asked to "confirm you are signed in and report
 * what page you land on"; its recording read a `page_title` off the footer's
 * "EspoCRM, Inc." link, and when no replay found that link both n2 and n3
 * ended partial with every verifier green. A skipped read of an output nobody
 * asked for stays what it is — a warning on the step and a drift ticket —
 * while fwsi7 05-open's `checked_out_to_user`, which "the user it is checked
 * out to" asks for, is still partial.
 */

import { givenPartialReason } from '../execution/report.js';

export interface StepVerdictInput {
  /** What the step reported. */
  reportStatus: 'success' | 'failure' | 'blocked';
  /** The model drove the step (a recovery), rather than a zero-model replay. */
  recovered: boolean;
  /** InstructionResult.unfinishedGesture: the last attempted gesture failed. */
  unfinishedGesture?: { tool: string; args: string };
  /** SkillRecord.skippedReads: labelled reads the replay skipped (tier A). */
  skippedReads?: readonly string[];
  /** The outputs the flow step declares. */
  declaredOutputs: readonly string[];
  /** The values the step reported. */
  values: Record<string, unknown>;
  /**
   * The step's instruction. When given, a skipped read counts only for an
   * output it explicitly asks to report (askedOutputs); without it, every
   * declared output counts, as before round 59.
   */
  instruction?: string;
  /**
   * SkillRecord.given: report values made only of params that the replay
   * withheld as given, not observed (round 60, fwgt11 07-add; src/execution/
   * report.ts). Like a skipped read, partial only for an output the
   * instruction asked for.
   */
  given?: readonly string[];
}

/**
 * Why a step that reported success is only PARTIAL, one sentence each; empty
 * when it is a clean success (or did not report success at all).
 */
export function partialReasons(input: StepVerdictInput): string[] {
  if (input.reportStatus !== 'success') return [];
  const reasons: string[] = [];
  if (input.recovered && input.unfinishedGesture) {
    const g = input.unfinishedGesture;
    reasons.push(
      `the recovery's last ${g.tool} (${g.args}) did not go through and nothing acted after it, yet the step reported success — its final action is unverified`,
    );
  }
  if (!input.recovered && input.skippedReads?.length) {
    const declared = new Set(input.instruction === undefined ? input.declaredOutputs : askedOutputs(input.instruction, input.declaredOutputs));
    const missed = [...new Set(input.skippedReads)].filter((label) => declared.has(label) && !(label in input.values));
    for (const label of missed) {
      reasons.push(`the procedure's read of ${label}, an output this step reports, was skipped (nothing matched on the page), so ${label} went unreported`);
    }
  }
  if (!input.recovered && input.given?.length) {
    // The artifact bakes the same ask in at compile time (emit.ts reportTemplateLines).
    const declared = new Set(input.instruction === undefined ? input.declaredOutputs : askedOutputs(input.instruction, input.declaredOutputs));
    for (const label of [...new Set(input.given)].filter((l) => declared.has(l) && !(l in input.values))) reasons.push(givenPartialReason(label));
  }
  return reasons;
}

/*
 * WHAT A STEP WAS ASKED TO REPORT (round 56: fwod82 02-create, fwgt8 01-open,
 * fwsi8 01-signin). Each replayed clean at tier A while publishing nothing
 * for the very fact its instruction asked it to report: fwod82 "report the
 * product name, the unit price … and the untaxed amount" published no product
 * and no untaxed amount (untaxed_amount was pruned at export); fwgt8 "report
 * the titles of all OPEN issues" published two counts; fwsi8 "report each
 * asset's name and asset tag" published a count.
 *
 * WHY THE INSTRUCTION'S WORDS. Nothing structural links an instruction's
 * clauses to the outputs the recording's report produced: the recording model
 * names each output from the instruction's own vocabulary, and that naming is
 * the only link there is. So an output is ASKED when every word of its name
 * (a trailing list index and one-letter enumeration labels aside, singular
 * and plural alike) occurs in a clause of the instruction that begins with
 * "report" — the ask, not the whole instruction: fwvk7 02-create's "verify
 * the task page shows … priority High … and report the task's identifier"
 * asks for the identifier, not the priority. It is ANSWERED when the replay
 * published it, echo-read it (the value was observed; see ReplayResult.
 * echoedValues), or published an output whose name holds every one of its
 * words (fwvk7 03-open's description_text answers b_description).
 *
 * WHY A WARNING AND NOT PARTIAL. On round 54 and 56's flow runs this also
 * names steps of apps the bench scored green — fwgr68 04-open's time-range
 * text, fwgh11 03-open's tag and 04-verify's publish date, fwgt7 04-add's
 * labels, fwrd87 04-add's new parts total — every one a fact the instruction
 * asked for and the replay did not publish (those apps are green because
 * their verifiers read the app, not the report). One of its hits is the
 * word-match's own miss: fwgt7 02-open's issue_exists, answered on the page
 * as "No results". A PARTIAL on that evidence would fail green steps; the
 * warning says it on every run.
 */

/** The words of every clause of `instruction` that asks to report something. */
function reportWords(instruction: string): Set<string> {
  const text = instruction.replace(/\{\{[^}]*\}\}/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];
  const out = new Set<string>();
  // Sentences, each with the clause of it that asks to report. A clause that
  // points back at what the sentence before it found ("Find all work
  // packages … whose subject starts with 'Seed:'. Report each of those
  // subjects …", openproject fwop18 02-open) asks for THAT: the words of the
  // sentence it points at are words of the ask. A clause that points at
  // nothing keeps its own words only (fwvk7 02-create's verified priority).
  const sentences = text.split(/[.!?](?:\s+|$)/);
  sentences.forEach((sentence, i) => {
    const at = sentence.search(/\breport/i);
    if (at < 0) return;
    const clause = sentence.slice(at);
    for (const w of words(clause)) out.add(w);
    // "say how many there are" asks for a count, in the words an output names one by.
    if (/\bhow many\b/i.test(clause)) for (const w of ['count', 'number', 'total']) out.add(w);
    // Only a demonstrative ("those subjects", "these values"): "report the
    // tag … as the app shows them" points within its own clause (fwgh11 03-open).
    if (i > 0 && /\b(those|these)\b/i.test(clause)) for (const w of words(sentences[i - 1])) out.add(w);
  });
  return out;
}

/** An output name's words: split on case and punctuation, one-letter labels and list indices dropped, singular. */
function nameWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !/^\d+$/.test(t))
    .map(singular);
}

function singular(word: string): string {
  return word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/** The outputs, of `outputs`, that `instruction` explicitly asks to report. */
export function askedOutputs(instruction: string, outputs: readonly string[]): string[] {
  const asked = new Set([...reportWords(instruction)].map(singular));
  return outputs.filter((o) => {
    if (o === 'url' || o.startsWith('url.') || o.includes('#')) return false;
    const words = nameWords(o);
    return words.length > 0 && words.every((w) => asked.has(w));
  });
}

/**
 * The asked outputs this replay published no value for: of `candidates` (the
 * step's declared outputs and those export pruned), the ones
 * askedOutputs names that `published` (reported values and echo-reads) does
 * not answer. Empty when the step answered every ask.
 */
export function unansweredAsks(
  instruction: string,
  candidates: readonly string[],
  published: readonly string[],
  /** The recording's own values (FlowStep.recorded), for a joined ask answered as its parts. */
  recorded: Readonly<Record<string, unknown>> = {},
): string[] {
  const answers = published.map((p) => new Set(nameWords(p)));
  return askedOutputs(instruction, [...new Set(candidates)]).filter((o) => {
    if (published.includes(o)) return false;
    const words = nameWords(o);
    if (answers.some((a) => words.every((w) => a.has(w)))) return false;
    return !answeredAsParts(recorded[o], published, recorded);
  });
}

/**
 * A joined ask answered as its parts, by the RECORDING's own values:
 * fwkb40 01-signin was asked for the columns left to right, recorded them
 * joined (columns_left_to_right = "Backlog, Ready, Work in progress, Done",
 * pruned at export) and publishes them split, column_1_name … column_4_name,
 * whose recorded values are each a whole part of the joined one. Two such
 * published parts at least; a name family alone is not enough — fwrd87
 * 04-add publishes parts_table_row_1 … 6 (Part A's row), and none of their
 * recorded values is its parts_total.
 */
function answeredAsParts(joined: unknown, published: readonly string[], recorded: Readonly<Record<string, unknown>>): boolean {
  if (typeof joined !== 'string') return false;
  const whole = ` ${joined.toLowerCase().replace(/\s+/g, ' ')} `;
  const parts = published.filter((p) => {
    const v = recorded[p];
    if (typeof v !== 'string' || !v.trim() || v.trim().toLowerCase() === joined.trim().toLowerCase()) return false;
    const part = v.toLowerCase().replace(/\s+/g, ' ').trim();
    const at = whole.indexOf(part);
    if (at < 0) return false;
    const before = whole[at - 1];
    const after = whole[at + part.length];
    return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
  });
  return parts.length >= 2;
}

/**
 * Asked outputs a step's procedure can publish only from a recorded LITERAL
 * in its report template: no read in the chain carries the output's label, and
 * the template's value holds no slot. A replay publishes such a value only when
 * the page it ends on shows that exact text (the round-53 withholding), so a
 * value the recording read on an earlier page, or took from an eval, is never
 * published — every replay claims the step without it.
 *
 * Gitea fwgt10 01-open: asked for "the exact titles of all OPEN issues"; chain
 * s_e270d0 has no read for open_issue_titles, s_2ea0ba's template carries it as
 * "#1 Seed: triage inbox, …", and the chain ends on the search page. Export's
 * round-56 warning named only PRUNED asked outputs, and this one was declared.
 * Names only; `chain` is the pinned procedure's segments, in order.
 */
export function literalOnlyAsks(
  instruction: string,
  outputs: readonly string[],
  chain: readonly { steps: readonly { label?: string; body?: readonly unknown[] }[]; reportTemplate?: { values?: Record<string, string> } }[],
): string[] {
  const read = new Set<string>();
  const walk = (steps: readonly { label?: string; body?: readonly unknown[] }[]): void => {
    for (const s of steps) {
      if (s.label) read.add(s.label);
      if (s.body) walk(s.body as typeof steps);
    }
  };
  for (const member of chain) walk(member.steps);
  const templated = new Map<string, string>();
  for (const member of chain) for (const [k, v] of Object.entries(member.reportTemplate?.values ?? {})) templated.set(k, v);
  return askedOutputs(instruction, outputs).filter((o) => {
    if (read.has(o)) return false;
    const literal = templated.get(o);
    return typeof literal === 'string' && literal.trim() !== '' && !/\{\{[^}]*\}\}/.test(literal);
  });
}

/**
 * What a zero-model success published no value for, of what its instruction
 * asked: unansweredAsks over the step's outputs (declared and pruned) against
 * what it reported and read, plus every asked output its pinned chain can
 * publish only from a template literal (literalOnlyAsks) that the report does
 * not carry — named whatever the replay's reads published. fwgt10-n2/n3 01-open
 * published nothing for open_issue_titles and its `unanswered` named only
 * bench_issue_exists; this backstop does not depend on the read-key set.
 */
export function unansweredForStep(input: {
  instruction: string;
  outputs: readonly string[];
  pruned: readonly string[];
  reported: Record<string, unknown>;
  published: readonly string[];
  recorded: Readonly<Record<string, unknown>>;
  chain: Parameters<typeof literalOnlyAsks>[2];
}): string[] {
  const asked = unansweredAsks(input.instruction, [...input.outputs, ...input.pruned], [...Object.keys(input.reported), ...input.published], input.recorded);
  const literal = literalOnlyAsks(input.instruction, input.outputs, input.chain).filter((o) => !(o in input.reported));
  return [...new Set([...asked, ...literal])];
}
