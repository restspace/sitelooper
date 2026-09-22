import { gateFor, type Reading } from '../agent/decide.js';
import {
  mapReduce,
  minConfidence,
  noul,
  noulConfidence,
  shardByTokens,
  type Entry,
  type NoulAnswer,
  type SystemOne,
  type SystemOneDecision,
} from '../agent/system-one.js';
import type { ExpectationDecision, ThreadingDecision } from './triage.js';
import { ruleAnswer } from './triage.js';

/**
 * notes/PLAN-jev.md sites I and J, ADVISORY ONLY.
 *
 * The enumerator (triage.ts) says what the shape rules ruled. This asks Jev
 * the same questions and logs where the two DISAGREE. Nothing here may change
 * a skill, a flow, an expectation or a verdict: compile, replay,
 * corpus-check and the compiled artifacts never call it, and a session that
 * ran it is byte-for-byte the session that did not.
 *
 * WHY THE WORDING IS WHAT IT IS.
 *
 * The step-0 probe asked the obvious question with the obvious state — the
 * value and the url — and MISSED fwgr8: 0.72 that the `bench` in
 * `fwgr8-n1-bench-dashboard` IS the reported tag `bench`. It is not a wrong
 * reading; it is the LITERAL one. The string in the slug does equal the tag,
 * and "is this the value" is a question about string equality, which code
 * already answered before asking.
 *
 * So every question below is about DERIVATION, never equality, and the state
 * carries what derivation needs: where the value was read from and what the
 * run called it, the WHOLE token the occurrence sits inside (the unit the
 * fwgr8/fwod5 class is about — `fwgr8-n1-bench-dashboard`, `o_form_view_group`
 * — not the substring), the characters on either side, and what the text
 * itself is. The ambiguous question is split into literal sub-questions and
 * combined in code, which is the docs' own advice: one noul asks whether the
 * app built the occurrence out of the value, a second asks whether the
 * enclosing token is a name the app already had, and they must agree.
 *
 * Shard by VALUE, not by pair. Several questions on one state are free, and
 * the occurrences of one value share the whole value block — the provenance,
 * the label, the fan-out about the value itself. One request per pair would
 * be hundreds of requests to learn what a dozen can say, and would give each
 * question LESS context, not more.
 */

// --- site I: is this occurrence the value, or a coincidence? -------------------

export const OCCURRENCE_SITE = 'triage.occurrence';
export const EXPECTATION_SITE = 'triage.expectation';

/** How many occurrences of one value ride in one request. Past this the state is mostly irrelevant to each question. */
const OCCURRENCES_PER_SHARD = 8;
/** Lines per expectation shard. They share only the procedure, so the state stays small. */
const LINES_PER_SHARD = 10;

/** What the fan-out establishes about the VALUE itself, once per shard. */
interface ValueReading {
  minted: number;
  typed: number;
  clock: number;
  stable: number;
}

/** A pair, plus what Jev made of it. */
export interface OccurrenceVerdict {
  decision: ThreadingDecision;
  jevSaid: 'same' | 'coincidence';
  confidence: number;
  agrees: boolean;
  value: ValueReading;
}

export interface ExpectationVerdict {
  decision: ExpectationDecision;
  jevSaid: 'every-run' | 'this-run';
  confidence: number;
  /** Absent when the rule's verdict answers a different question (ruleAnswer 'uninformative'). */
  agrees?: boolean;
}

/** Human names for the provenance the enumerator recorded — Jev reads English, not enum members. */
const PROVENANCE: Record<ThreadingDecision['whereReadFrom'], string> = {
  read: 'the procedure read it back off the page',
  typed: 'the person running the procedure typed or chose it',
  url: 'it first appeared in the address bar after a navigation',
  var: 'it was declared as a run variable before the session started',
  reported: 'the instruction reported it as one of its results',
};

const KIND: Record<ThreadingDecision['kind'], string> = {
  url: 'a web address the procedure navigated to',
  arg: 'a value the procedure typed, or the wording of the instruction it was given',
  locator: 'a description of the element on the page that the procedure acted on',
  expectation: 'a line of the page, as the recorder wrote it down after the step',
};

/**
 * One value's state: the value, its story, and each occurrence marked where it
 * sits. The occurrence is marked with guillemets rather than quoted separately,
 * so the question is about a position in a text and not about a string.
 */
export function occurrenceState(group: readonly ThreadingDecision[]): Entry {
  const first = group[0];
  return {
    value: first.value,
    the_run_called_it: first.label,
    how_the_run_obtained_it: PROVENANCE[first.whereReadFrom],
    ...(first.readFromText ? { obtained: first.readFromText } : {}),
    occurrences: group.map((d, i) => ({
      id: `o${i}`,
      what_this_text_is: KIND[d.kind],
      text: d.text,
      // The marked text: the same characters, with the occurrence fenced.
      text_with_the_occurrence_marked: `${d.text.slice(0, d.span[0])}«${d.value}»${d.text.slice(d.span[1])}`,
      the_whole_word_it_sits_inside: d.enclosingToken,
      character_before: d.precededBy || '(start of the text)',
      character_after: d.followedBy || '(end of the text)',
    })),
  };
}

function occurrenceQuestions(group: readonly ThreadingDecision[]): Record<string, ReturnType<typeof noul>> {
  const q: Record<string, ReturnType<typeof noul>> = {
    // The value fan-out. Free — they ride on the state the occurrence
    // questions already need — and they are what a later promotion would gate
    // on: a value the app minted this run is the one whose false "coincidence"
    // is silent, and a clock time is the round-26 case.
    v_minted: noul(
      'The application itself produced this value during this session — it generated it for a record that was created or changed, such as a reference, an order number, an id or a uid.',
      { true: 'the application generated it while the session ran', false: 'it existed before the session, or a person supplied it' },
    ),
    v_typed: noul('A person supplied this value: they typed it in or chose it from a list, rather than the application producing it.'),
    v_clock: noul('This value is a date, a clock time, a timestamp, or part of one.'),
    v_stable: noul(
      'This value is a fixed piece of the application\'s own vocabulary — a menu label, a column heading, a status word, a page name — that the application would show again tomorrow whatever record was open.',
    ),
  };
  group.forEach((d, i) => {
    const id = `o${i}`;
    // THE question, asked about derivation. "Was this text produced FROM the
    // value" is answerable literally and is not the same question as "does
    // this text contain the value", which is what the probe accidentally asked.
    q[`${id}_derived`] = noul(
      `Look at occurrence ${id}. The application put that text there. Did the marked part «${d.value}» get into it BECAUSE of the value above — copied from it, generated from it, or naming the very same record — rather than being a word of the text's own that happens to be spelled the same?`,
      {
        true: 'change the value above and that part of the text would change with it',
        false: 'the text would read exactly the same if the value above had never existed',
      },
    );
    // The second half, and the one that carries the site. Asked about
    // STRUCTURE, not about meaning: "is the marked part only a PIECE of
    // something longer" is a thing Jev can read off the characters, and it
    // covers the word case (`bench` in a slug, `form` in a class name) and the
    // number case (`5.00` in `425.00`, `21` in a clock time, `1` in
    // `127.0.0.1`) in ONE question. Measured on the zoo: derived alone 32/48,
    // derived AND not-a-piece 40/48.
    q[`${id}_piece`] = noul(
      `Occurrence ${id}: is the marked part «${d.value}» only a PIECE of something longer in that text — a longer number, a price, a date, a clock time, a version, a network address, a longer word, a compound name or slug — rather than standing there complete and on its own?`,
      {
        true: 'the characters on one or both sides belong to the same single thing as the marked part',
        false: 'the marked part is a complete thing; whatever is next to it is something separate',
      },
    );
  });
  return q;
}

/**
 * How sure the app built a fragment out of the value before we believe it.
 *
 * A value can legitimately be welded into a longer token — `ticket-link-t15`,
 * `fwgr8-n1-bench-dashboard`, the autocomplete echo `Product AProduct A` — so
 * "it is a piece of something longer" cannot be a veto. But it is the shape
 * every round-23-to-29 bug had, and a false "same" there is the expensive
 * direction (a reference threaded into a name the app owns, and a step that
 * loses the zero-model path). So a fragment has to clear a HIGHER bar on
 * derivation than a standalone occurrence does. Measured on the zoo: a flat
 * 0.5 with the piece question as a veto scores 40/48, this scores 42/48, and
 * the shape rules themselves score 41/48.
 */
const FRAGMENT_DERIVED = 0.8;
const STANDALONE_DERIVED = 0.5;

/**
 * Read one occurrence's two answers into a verdict.
 *
 * Confidence is distance from the bar that was actually applied, on the 0..1
 * scale the gate reads — not `noulConfidence`, which measures distance from a
 * coin flip and would call a 0.62 "derived" fairly sure when the bar it had to
 * clear was 0.8. The weaker of the two readings wins (the cookbook's min
 * rule): a decision made of two answers is as sure as its weakest.
 */
export function readOccurrence(derived: NoulAnswer, piece: NoulAnswer): { said: 'same' | 'coincidence'; confidence: number } {
  const bar = piece.noul >= 0.5 ? FRAGMENT_DERIVED : STANDALONE_DERIVED;
  const said = derived.noul >= bar ? 'same' : 'coincidence';
  const span = Math.max(bar, 1 - bar);
  return { said, confidence: minConfidence([Math.min(1, Math.abs(derived.noul - bar) / span), noulConfidence(piece)]) };
}

export async function triageOccurrences(
  client: SystemOne,
  decisions: readonly ThreadingDecision[],
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<OccurrenceVerdict[] | null> {
  const groups = groupByValue(decisions);
  if (!groups.length) return [];
  const res = await mapReduce(client, groups, (group) => ({ state: occurrenceState(group), questions: occurrenceQuestions(group) }), opts);
  if (!res) return null;
  const out: OccurrenceVerdict[] = [];
  for (const { shard, answers } of res.shards) {
    const value: ValueReading = {
      minted: (answers.v_minted as NoulAnswer).noul,
      typed: (answers.v_typed as NoulAnswer).noul,
      clock: (answers.v_clock as NoulAnswer).noul,
      stable: (answers.v_stable as NoulAnswer).noul,
    };
    shard.forEach((decision, i) => {
      const read = readOccurrence(answers[`o${i}_derived`] as NoulAnswer, answers[`o${i}_piece`] as NoulAnswer);
      out.push({ decision, jevSaid: read.said, confidence: read.confidence, agrees: read.said === decision.ruleSaid, value });
    });
  }
  return out;
}

/**
 * Shards: one value's occurrences together, capped by count and by the token
 * budget. Grouping by value is what makes the fan-out affordable AND accurate
 * — the value block is written once and every question in the request reads it.
 */
function groupByValue(decisions: readonly ThreadingDecision[]): ThreadingDecision[][] {
  const byValue = new Map<string, ThreadingDecision[]>();
  for (const d of decisions) {
    const key = `${d.value}\u0000${d.label}\u0000${d.whereReadFrom}`;
    const bucket = byValue.get(key);
    if (bucket) bucket.push(d);
    else byValue.set(key, [d]);
  }
  return [...byValue.values()].flatMap((group) => shardByTokens(group, undefined, OCCURRENCES_PER_SHARD));
}

// --- site J: would this line be on the page on every run? ---------------------

/**
 * One procedure's lines. The note matters as much as the lines: without it Jev
 * reads `- button "Confirm"` as a fact about one screenshot, and every stable
 * control comes back "specific to this run".
 */
export function expectationState(group: readonly ExpectationDecision[]): Entry {
  return {
    the_procedure: group[0].procedure,
    note:
      'Each line below is one line of the page, in accessibility-tree form (`- role "name": value`), as a recorder wrote it down just after one step of that procedure ran. ' +
      'Each will be used as a CHECK: a later run of the same procedure will look for a line like it and stop if it is not there. ' +
      'A `{{v1}}`, `{{v2}}` … marker inside a line is not text on the page: it stands for a value the procedure is given afresh on every run, so that part of the line is already taken care of.',
    lines: group.map((d, i) => ({ id: `l${i}`, after_a_step_that_did: d.tool, line: d.slotted })),
  };
}

function expectationQuestions(group: readonly ExpectationDecision[]): Record<string, ReturnType<typeof noul>> {
  const q: Record<string, ReturnType<typeof noul>> = {};
  group.forEach((d, i) => {
    const id = `l${i}`;
    // NOT "would a later run show this line". That is a counterfactual, and a
    // counterfactual is the shape Jev reads worst: measured on the zoo, the
    // obvious wording scored 19/40 and "would it be safe to check for this"
    // scored 18/40 — both barely better than answering "this run" to
    // everything. Asked as a question about the line's COMPOSITION, which is
    // there in the characters, the same reduce scores 36/40, against 28/39 for
    // the shape rules.
    // "ignoring any {{vN}} marker entirely" is load-bearing, and the state's
    // note saying the same thing was NOT enough on its own. Without it every
    // parameterised line — `- textbox "Customer": {{v1}}`,
    // `- combobox "e.g. Lumber Inc": {{v2}}` — came back "specific to this
    // run" at 0.6-0.9 confidence, which on the corpus was most of the noise:
    // 23% of lines disagreed at >= 0.6 before, 4% after.
    q[`${id}_stable`] = noul(
      `Line ${id}: ignoring any {{vN}} marker entirely, is every remaining word and number in it part of the application's own fixed vocabulary — control labels, headings, status words, menu names, column titles, placeholder text — with nothing left that belongs to one particular record, one particular moment or one particular run?`,
      {
        true: "what is left is the application's own fixed wording",
        false: "some part of what is left is this run's: a name, a number, a reference, a time, a count",
      },
    );
    // The literal vetoes. Each is a thing Jev can read off the line, and any
    // one of them is enough on its own — a line with a clock time in it is
    // this run's however fixed the rest of its wording looks.
    q[`${id}_moment`] = noul(`Line ${id} contains a date, a clock time, a timestamp, an elapsed time, or a count of the things that existed at one moment.`);
    q[`${id}_transient`] = noul(`Line ${id} is a message that shows for a moment and then goes: a toast, a notification, a progress or loading indicator, a confirmation that flashes up.`);
    q[`${id}_minted`] = noul(`Line ${id} contains an identifier or reference that the application generated for one particular record — an order number, a ticket reference, an id, a uid.`);
  });
  return q;
}

/**
 * The reduce for one line: the application's own wording, and none of the
 * three things that belong to a moment or a record.
 *
 * The two reductions are not the same shape and must not share a rule.
 * "Every run" is an ALL: it needs the composition answer and all three vetoes
 * to agree, so it is as sure as its weakest (minConfidence). "This run" is an
 * ANY: one firing veto settles it whatever the others said, so it is as sure
 * as its STRONGEST reason. Reducing an `any` by its weakest member would
 * report a confident clock time as a coin flip because two other vetoes were
 * undecided.
 */
export function readExpectation(a: { stable: NoulAnswer; moment: NoulAnswer; transient: NoulAnswer; minted: NoulAnswer }): {
  said: 'every-run' | 'this-run';
  confidence: number;
} {
  const vetoes = [a.moment, a.transient, a.minted];
  const fired = vetoes.filter((n) => n.noul >= 0.5);
  if (a.stable.noul >= 0.5 && !fired.length) {
    return { said: 'every-run', confidence: minConfidence([noulConfidence(a.stable), ...vetoes.map(noulConfidence)]) };
  }
  const reasons = [...fired.map(noulConfidence), ...(a.stable.noul < 0.5 ? [noulConfidence(a.stable)] : [])];
  return { said: 'this-run', confidence: reasons.length ? Math.max(...reasons) : 0 };
}

export async function triageExpectations(
  client: SystemOne,
  decisions: readonly ExpectationDecision[],
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ExpectationVerdict[] | null> {
  const groups = groupByProcedure(decisions);
  if (!groups.length) return [];
  const res = await mapReduce(client, groups, (group) => ({ state: expectationState(group), questions: expectationQuestions(group) }), opts);
  if (!res) return null;
  const out: ExpectationVerdict[] = [];
  for (const { shard, answers } of res.shards) {
    shard.forEach((decision, i) => {
      const read = readExpectation({
        stable: answers[`l${i}_stable`] as NoulAnswer,
        moment: answers[`l${i}_moment`] as NoulAnswer,
        transient: answers[`l${i}_transient`] as NoulAnswer,
        minted: answers[`l${i}_minted`] as NoulAnswer,
      });
      out.push({
        decision,
        jevSaid: read.said,
        confidence: read.confidence,
        // A line the rules dropped for identifying no element was not judged
        // on J's question at all (see ruleAnswer): reported, never scored.
        ...(ruleAnswer(decision) === 'uninformative' ? {} : { agrees: read.said === ruleAnswer(decision) }),
      });
    });
  }
  return out;
}

function groupByProcedure(decisions: readonly ExpectationDecision[]): ExpectationDecision[][] {
  const byProcedure = new Map<string, ExpectationDecision[]>();
  for (const d of decisions) {
    const bucket = byProcedure.get(d.procedure);
    if (bucket) bucket.push(d);
    else byProcedure.set(d.procedure, [d]);
  }
  return [...byProcedure.values()].flatMap((group) => shardByTokens(group, undefined, LINES_PER_SHARD));
}

// --- the shadow run -----------------------------------------------------------

export interface TriageInput {
  occurrences?: readonly ThreadingDecision[];
  expectations?: readonly ExpectationDecision[];
}

export interface TriageSummary {
  occurrences: { asked: number; agreed: number; disagreed: number };
  expectations: { asked: number; agreed: number; disagreed: number };
  /** A fan-out that failed or timed out: no rows, no opinion, and the caller is none the wiser. */
  deferred: string[];
  ms: number;
}

/**
 * Run both sites in SHADOW against what the rules said, and emit one decision
 * row per pair.
 *
 * Safe to call fire-and-forget, which is the contract the export path needs:
 * it never throws, never mutates its inputs, and is bounded by one deadline
 * for both fan-outs. A failure — no key, a timeout, one bad shard — produces
 * an empty summary and nothing else, exactly as Jev being absent does.
 *
 * `Reading`/`gateFor` are decide.ts's, so the gate that decides whether a row
 * says `acted` or `deferred` is read from the one table and not from a
 * literal here. `jevDecider` itself is NOT used: it is one ask per decision by
 * construction, and this site's whole shape is one fan-out for hundreds of
 * decisions. See the report accompanying this step for the minimal addition
 * (a batch-shaped `shadowAll`) that would let it be.
 */
export async function triageSession(
  client: SystemOne,
  input: TriageInput,
  log?: (d: SystemOneDecision) => void,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<TriageSummary> {
  const started = Date.now();
  const summary: TriageSummary = {
    occurrences: { asked: 0, agreed: 0, disagreed: 0 },
    expectations: { asked: 0, agreed: 0, disagreed: 0 },
    deferred: [],
    ms: 0,
  };
  const emit = (site: string, reading: Reading<string>, agrees: boolean | undefined): void => {
    const gate = gateFor(site);
    log?.({
      site,
      model: client.model,
      options: reading.options,
      chosen: reading.chosen,
      confidence: reading.confidence,
      outcome: reading.confidence >= gate ? 'acted' : 'deferred',
      ...(reading.confidence >= gate ? {} : { why: `below gate ${gate}` }),
      ...(agrees === undefined ? {} : { agrees }),
      ...(reading.detail !== undefined ? { detail: reading.detail } : {}),
    });
  };
  try {
    const [occ, exp] = await Promise.all([
      input.occurrences?.length ? triageOccurrences(client, input.occurrences, opts).catch(() => null) : Promise.resolve([]),
      input.expectations?.length ? triageExpectations(client, input.expectations, opts).catch(() => null) : Promise.resolve([]),
    ]);
    if (occ === null) summary.deferred.push('triage.occurrence: the fan-out did not complete');
    for (const v of occ ?? []) {
      summary.occurrences.asked += 1;
      summary.occurrences[v.agrees ? 'agreed' : 'disagreed'] += 1;
      emit(
        OCCURRENCE_SITE,
        {
          value: v.jevSaid,
          chosen: v.jevSaid,
          confidence: v.confidence,
          // Two nouls, not an option list: `options` is what the answer ranged
          // over, and a noul pair ranges over two.
          options: 2,
          detail: {
            value: v.decision.value,
            label: v.decision.label,
            from: v.decision.whereReadFrom,
            kind: v.decision.kind,
            where: v.decision.where,
            token: v.decision.enclosingToken,
            text: v.decision.context,
            rule: v.decision.rule,
            ruleSaid: v.decision.ruleSaid,
            jevSaid: v.jevSaid,
            minted: v.value.minted,
            clock: v.value.clock,
          },
        },
        v.agrees,
      );
    }
    if (exp === null) summary.deferred.push('triage.expectation: the fan-out did not complete');
    for (const v of exp ?? []) {
      summary.expectations.asked += 1;
      if (v.agrees !== undefined) summary.expectations[v.agrees ? 'agreed' : 'disagreed'] += 1;
      emit(
        EXPECTATION_SITE,
        {
          value: v.jevSaid,
          chosen: v.jevSaid,
          confidence: v.confidence,
          options: 2,
          detail: {
            line: v.decision.line,
            where: v.decision.where,
            rule: v.decision.rule,
            ruleSaid: v.decision.ruleSaid,
            jevSaid: v.jevSaid,
          },
        },
        v.agrees,
      );
    }
  } catch (err) {
    // The contract: Jev absent, Jev slow and Jev failing are one outcome.
    summary.deferred.push(`triage: ${err instanceof Error ? err.message : String(err)}`);
  }
  summary.ms = Date.now() - started;
  return summary;
}
