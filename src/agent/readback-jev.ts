import { gateFor, jevDecider, type DecideCtx, type DecisionSink, type JevSite, type Reading } from './decide.js';
import { agreement, choice, minConfidence, type ChoiceAnswer, type Entry, type Questions, type SystemOne } from './system-one.js';
import type { DisplayCandidate, ReadBackAsk, ReadBackDecider, ReadBackItem, ReadBackPick } from './readback.js';

/**
 * Site C of notes/PLAN-jev.md, the judgement half: WHICH of the elements that show
 * this value is the one a later run should read.
 *
 * The code decider (readback.ts) answers the whole question whenever the page
 * answers it — exactly one element displays the value — and proves the model
 * could not have answered it at all for prose and for values the page does not
 * contain. What is left is genuinely a choice: two cells showing `$250.00`,
 * one in Part B's row and one in the Total row; `RD-1021` in the breadcrumb
 * and in the heading. The model is asked that today at the price of a
 * full-history prompt (3.7s, 9 of 9 instructions in fwrdj4-n1); Jev is asked
 * it with the page alone in front of it, for ~0.3s and ~nothing.
 *
 * The design rule holds without effort here, because the site is literally a
 * ballot code built:
 *
 *  - code ENUMERATES: only elements whose own rendered text displays the value
 *    under `captureReadBackAt`'s own two rules are on the ballot, ancestors
 *    removed. Jev cannot name an element that was not offered, and a pick
 *    whose path is not on the ballot is discarded by the caller.
 *  - code VERIFIES: the winner goes through `captureReadBackAt` like every
 *    other path — resolves to exactly one element, whose text is the value,
 *    and the stored locator is derived from the live element, never from
 *    anything said here.
 *
 * And the consequence of a wrong pick is bounded by what the ballot is: every
 * option shows the value, this run, in the report's own terms. A wrong pick
 * stores a read that re-reads the value from the wrong place NEXT run — which
 * is the risk that keeps the gate high and the `none` option always present.
 *
 * The whole instruction's ambiguous values go in ONE request. Questions
 * against one state are evaluated in parallel and extra questions add ~no
 * latency, so asking about six values costs what asking about one costs.
 */

/** Names the gate (decide.ts `gateFor`) and the rows in system-one.jsonl. */
export const READBACK_LOCATE_SITE = 'readback.locate';

/**
 * Values put to one request. Past this the state stops being small and
 * relevant, which is the one thing the docs are unambiguous about; the
 * overflow stays `remaining` and the model answers it as it does today.
 */
export const MAX_ITEMS_PER_ASK = 16;

const NONE = 'none';

/** The option key for candidate j of item i — unique per question, and readable in a log row. */
const labelFor = (j: number): string => `c${j}`;

/**
 * What one element looks like on the ballot. Surroundings, not selectors: the
 * question is which PLACE on the page this value belongs to, and a row, a
 * column header, a heading or a dialog is what tells one `$250.00` from
 * another. The structural path is deliberately absent — it is meaningless to
 * read and it invites picking by position.
 */
export function describeCandidate(c: DisplayCandidate): Entry {
  const out: Record<string, string> = { shows: c.text.slice(0, 200), element: c.tag };
  if (c.column) out.column = c.column;
  if (c.row) out.row = c.row;
  if (c.label) out.label = c.label;
  if (c.heading) out.section = c.heading;
  if (c.dialog) out.dialog = c.dialog;
  if (c.testid) out.testHook = c.testid;
  return out;
}

/**
 * The state: the instruction the values were reported for, and per value its
 * published name, what was reported, and the elements showing it. Nothing of
 * the session history — the 3.7s the model path spends is mostly re-reading
 * that, and none of it bears on which cell shows `$250.00`.
 */
export function stateFor(ask: ReadBackAsk, items: readonly ReadBackItem[]): Entry {
  const values: Record<string, Entry> = {};
  for (const item of items) {
    values[item.name] = {
      reported: item.value,
      elements: Object.fromEntries(item.candidates.map((c, j) => [labelFor(j), describeCandidate(c)])),
    };
  }
  return { instruction: ask.instruction, ...(ask.url ? { page: ask.url } : {}), values };
}

const ask = (item: ReadBackItem): string =>
  `The page in front of you shows the value ${JSON.stringify(item.value)} in more than one place. ` +
  `The elements under \`values.${item.name}.elements\` are those places, each with what it displays and what surrounds it. ` +
  `This instruction reported that value under the name \`${item.name}\`. ` +
  `Which of these elements is that value's OWN place on the page — the one whose text is this value because the page is stating it there, ` +
  `rather than repeating or totalling it elsewhere? Answer none if two of them are equally that place, or if none of them is.`;

/**
 * The same question, options reversed. Position bias is the cheap failure at
 * this price point and agreement over two orders is the cheap defence — site A
 * measured it as the guard that turns a pick into a reading. Disagreement
 * defers to the model path, which is what ran here before.
 */
const askReversed = (item: ReadBackItem): string =>
  `Under \`values.${item.name}.elements\` are the elements of this page that display ${JSON.stringify(item.value)}. ` +
  `A later run of this instruction will re-read \`${item.name}\` from whichever one is chosen, on a page holding different records. ` +
  `Which element states this value in its own right — not as a copy, a total or a summary of it? Answer none if the page gives no single such element.`;

function questionsFor(items: readonly ReadBackItem[]): Questions {
  const questions: Questions = {};
  items.forEach((item, i) => {
    const options: Record<string, Entry> = {};
    item.candidates.forEach((c, j) => {
      options[labelFor(j)] = describeCandidate(c);
    });
    options[NONE] = 'no single element on this page is that value\'s own place';
    const reversed: Record<string, Entry> = {};
    for (const key of Object.keys(options).reverse()) reversed[key] = options[key];
    questions[`pick${i}`] = choice(ask(item), options);
    questions[`rev${i}`] = choice(askReversed(item), reversed);
  });
  return questions;
}

/** What one value's two answers came to, before the gate. */
interface ItemReading {
  item: ReadBackItem;
  pick: ReadBackPick | null;
  confidence: number;
  chosen: string;
  why?: string;
}

/** Read one value's pair of answers. Everything that is not two orders agreeing on one element is a deferral. */
export function readItem(item: ReadBackItem, pick: ChoiceAnswer, reversed: ChoiceAnswer): ItemReading {
  const agreed = agreement([pick.choice, reversed.choice]);
  if (!agreed) return { item, pick: null, confidence: 0, chosen: pick.choice, why: `orders disagreed (${pick.choice} vs ${reversed.choice})` };
  if (agreed === NONE) return { item, pick: null, confidence: pick.confidence, chosen: NONE, why: 'none' };
  const index = item.candidates.findIndex((_, j) => labelFor(j) === agreed);
  const candidate = index >= 0 ? item.candidates[index] : undefined;
  if (!candidate) return { item, pick: null, confidence: 0, chosen: agreed, why: `chose ${agreed}, which is not on the ballot` };
  return {
    item,
    pick: { name: item.name, value: item.value, path: candidate.path },
    // One wrong argument spoils the call: the weakest of the two orders.
    confidence: minConfidence([pick.confidence, reversed.confidence]),
    chosen: agreed,
  };
}

/**
 * `JevSite` for 'readback.locate'.
 *
 * One request, one logged row, but N independent answers — which is the one
 * place this site departs from the single-decision shape `jevDecider` assumes.
 * A batch cannot be gated as a unit: six values asked together are six
 * decisions, and letting the weakest of them veto the other five would throw
 * away the answers that were solid (and, with `minConfidence`, make a big
 * batch systematically less useful than a small one). So the gate is applied
 * per value HERE, with `gateFor` — the same number, read from the same table —
 * and the reading handed back carries only the picks that cleared it, at their
 * weakest confidence. `jevDecider`'s own gate check then passes by
 * construction, and the row it logs says how many of how many were kept.
 */
export const readBackLocateSite: JevSite<ReadBackAsk, ReadBackPick[]> = {
  site: READBACK_LOCATE_SITE,

  async run(client: SystemOne, input: ReadBackAsk, ctx: DecideCtx): Promise<Reading<ReadBackPick[]> | null> {
    const items = input.items.filter((i) => i.candidates.length > 1).slice(0, MAX_ITEMS_PER_ASK);
    // Nothing to ask: a single-candidate value is code's answer, not this
    // site's, and "nothing to ask" is not a decision and is not logged.
    if (!items.length) return null;
    const res = await client.ask(stateFor(input, items), questionsFor(items), { ...(ctx.signal ? { signal: ctx.signal } : {}) });
    const answers = res.answers as Record<string, ChoiceAnswer>;
    const readings = items.map((item, i) => readItem(item, answers[`pick${i}`], answers[`rev${i}`]));
    const gate = gateFor(READBACK_LOCATE_SITE);
    const kept = readings.filter((r) => r.pick !== null && r.confidence >= gate);
    const options = items.reduce((n, item) => n + item.candidates.length + 1, 0);
    const detail = Object.fromEntries(
      readings.map((r) => [
        r.item.name,
        `${r.chosen} (${r.confidence.toFixed(2)})${r.why ? ` deferred: ${r.why}` : ` → ${r.pick ? r.item.candidates.find((c) => c.path === r.pick!.path)?.text.slice(0, 60) : ''}`}`,
      ]),
    );
    if (!kept.length) {
      return { value: null, chosen: null, confidence: 0, options, why: `no value cleared ${gate} (${readings.length} asked)`, detail };
    }
    return {
      value: kept.map((r) => r.pick!),
      chosen: `${kept.length}/${readings.length}: ${kept.map((r) => `${r.item.name}=${r.chosen}`).join(', ')}`,
      confidence: minConfidence(kept.map((r) => r.confidence)),
      options,
      detail,
    };
  },
};

/**
 * The decider `runInstruction` takes for the ambiguous case, or null with no
 * System One tier — in which case loop.ts is handed nothing, asks nothing, and
 * the ambiguous values go to the model exactly as they did before this file
 * existed. Built at the composition root; loop.ts imports none of this.
 */
export function readBackDecider(client: SystemOne | null | undefined, log?: DecisionSink): ReadBackDecider | null {
  if (!client) return null;
  const decide = jevDecider(client, readBackLocateSite, log);
  return (input, ctx) => decide(input, ctx).catch(() => null);
}
