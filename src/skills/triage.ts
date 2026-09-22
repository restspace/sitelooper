import type { LocatorCandidate, RecordedEntry, RecordedStep } from '../daemon/recorder.js';
import {
  NAVIGATION_TOOLS,
  maskPublishedValues,
  publishedReadValues,
  substitute,
  typedValues,
} from './compile.js';
import { replaceToken } from './flow.js';
import { TRANSIENT_LINE, identifiesNothing, maskForeignValue, maskMinted, maskPopupItem } from '../execution/expect.js';
import { maskVolatile } from '../shared/text.js';

/**
 * WHAT THE SHAPE RULES RULED ON, WRITTEN DOWN.
 *
 * Rounds 23–29 are mostly one question wearing different clothes: *is this
 * occurrence of this string the same thing as that value, or a coincidence?*
 * `bench` inside `fwgr8-n1-bench-dashboard`, `form` inside
 * `o_form_view_group` (fwod5), an order id `21` inside the clock time
 * `09/17/2026 21:05` (fwod67, round 26), `1` inside `127.0.0.1` (fwod31),
 * `25` inside `:nth-of-type(25)`. Each was answered with another character
 * rule — `tokenPattern`, `looksLikeId`, `digitDominant`, substitute's numeric
 * guard — and the rate of discovery has not fallen.
 *
 * The sibling question is the expectation lines: `TRANSIENT_LINE`,
 * `maskMinted`, `maskForeignValue`, `maskPopupItem`, `identifiesNothing`,
 * `maskPublishedValues` are shape and provenance guesses at "will this line
 * be on the page on EVERY run of this procedure?".
 *
 * This module is the ENUMERATOR half of notes/PLAN-jev.md sites I and J: it lists
 * every (value, occurrence) pair and every recorded expectation line the
 * rules ruled on, with the answer they gave. It is pure, synchronous and
 * model-free — nothing here may import the System One client (see
 * triage-jev.ts, which does) — because `compile.ts`, `corpus-check` and the
 * compiled artifacts read the same functions and must stay deterministic.
 *
 * THE ANSWERS ARE NOT REIMPLEMENTED. Every `ruleSaid` below is obtained by
 * CALLING the function that decides it in production — `substitute`,
 * `replaceToken`, the mask chain in `expectationFor` — and reading what came
 * back. A second copy of a rule that drifted would be a triage log about a
 * product that does not exist.
 */

// --- threading: (value, occurrence) pairs -------------------------------------

/** The four places a threaded value lands. Sites I/J judge occurrences in all four. */
export type ThreadingKind = 'url' | 'arg' | 'locator' | 'expectation';

/** How the run came by a value — the provenance half of the question. */
export type ValueProvenance =
  /** A read step asked the page and the report carries the answer. */
  | 'read'
  /** The procedure typed or chose it (a fill/type/select arg). */
  | 'typed'
  /** It first surfaced in a post-navigation url (flow.ts minting, compile's discoverMinted). */
  | 'url'
  /** A declared run variable (the runid). */
  | 'var'
  /** The instruction's report named it and nothing above says how it arrived. */
  | 'reported';

/** A value the run holds, as much of its story as record time knows. */
export interface ValueOrigin {
  value: string;
  /** What the run called it: report output name, url part label, var name. */
  label: string;
  /** How the run came by it (see ValueProvenance). */
  whereReadFrom: ValueProvenance;
  /** The url, page line or instruction the value came off, when there is one. */
  source?: string;
}

/** One text the threading rule was asked to rewrite. */
export interface ThreadingSite {
  kind: ThreadingKind;
  /** Where in the recording it came from — "step 7 locators.target[1].name". For the log. */
  where: string;
  text: string;
  /**
   * Which rule threads this text. The flow exporter rewrites an instruction
   * and a skill's bound params with `replaceToken`; the compiler rewrites
   * args, locators and expectation lines with `substitute`, whose numeric
   * branch narrows the same boundary further. Defaults by kind.
   */
  via?: 'substitute' | 'replaceToken';
}

export interface ThreadingDecision {
  value: string;
  label: string;
  whereReadFrom: ValueProvenance;
  /** Where the VALUE was read from (ValueOrigin.source), not where this occurrence is. */
  readFromText?: string;
  kind: ThreadingKind;
  where: string;
  text: string;
  /** Half-open character range of this occurrence in `text`. */
  span: [number, number];
  /** The character before and after the occurrence — the boundary the rule read. */
  precededBy: string;
  followedBy: string;
  /**
   * The whole run of characters this occurrence sits inside, letters, digits,
   * '-' and '_' — `fwgr8-n1-bench-dashboard` for the `bench` in it. The unit
   * the fwgr8/fwod5 class is actually about: the question is what that WHOLE
   * token is, not what the substring spells.
   */
  enclosingToken: string;
  /** Up to ~80 characters of `text` around the occurrence, for the state. */
  context: string;
  ruleSaid: 'same' | 'coincidence';
  /** Which rule gave that answer — the shared boundary, or substitute's numeric narrowing. */
  rule: 'tokenPattern' | 'substitute:numeric-guard';
}

/** A marker no page value contains, so the parallel walk below cannot mis-sync. */
const PROBE = '{{v0}}';

/** Every index at which `value` occurs in `text`, overlapping included. */
function occurrences(text: string, value: string): number[] {
  const out: number[] = [];
  if (!value) return out;
  for (let i = text.indexOf(value); i >= 0; i = text.indexOf(value, i + 1)) out.push(i);
  return out;
}

/**
 * Which occurrences the rule actually rewrote, read off its OUTPUT rather
 * than predicted from its regex.
 *
 * Both rules are a left-to-right, non-overlapping `replace` of `value` by
 * `marker` and touch nothing else, so walking the original and the rewrite in
 * step identifies each substitution exactly: the two agree until a rewrite,
 * where the original holds `value` and the rewrite holds `marker`. `marker`
 * begins with '{', and a pair whose value contains a brace is refused above,
 * so the first character can never be ambiguous. Anything else the rule did
 * is unexpected and ends the walk — the remaining occurrences are then simply
 * not reported, which is the honest failure for an advisory log.
 */
function threadedSpans(text: string, out: string, value: string, marker: string): Set<number> {
  const spans = new Set<number>();
  let t = 0;
  let o = 0;
  while (t < text.length && o <= out.length) {
    if (text[t] === out[o]) {
      t += 1;
      o += 1;
      continue;
    }
    if (text.startsWith(value, t) && out.startsWith(marker, o)) {
      spans.add(t);
      t += value.length;
      o += marker.length;
      continue;
    }
    break;
  }
  return spans;
}

/** Characters that bind into one token for the purpose of NAMING the enclosing run (see enclosingToken). */
function tokenAround(text: string, start: number, end: number): string {
  const bind = (ch: string | undefined): boolean => Boolean(ch) && !/[^\w-]/.test(ch as string);
  let a = start;
  let b = end;
  while (a > 0 && bind(text[a - 1])) a -= 1;
  while (b < text.length && bind(text[b])) b += 1;
  return text.slice(a, b);
}

/**
 * Every (value, occurrence) pair the threading rule ruled on, with its answer.
 *
 * A pair exists wherever a value the run holds occurs as a plain substring of
 * a text the rule was given — which is exactly the population the rule has an
 * opinion about. Where it substituted, it said "same"; where it left the
 * characters alone, it said "coincidence". Both halves matter: the round-23–29
 * bugs are all false "same", and the cost of a false "coincidence" is a
 * literal that replays the recording's record.
 */
export function threadingDecisions(values: readonly ValueOrigin[], sites: readonly ThreadingSite[]): ThreadingDecision[] {
  const out: ThreadingDecision[] = [];
  for (const site of sites) {
    const via = site.via ?? (site.kind === 'arg' && /^instruction\b/.test(site.where) ? 'replaceToken' : 'substitute');
    for (const origin of values) {
      const value = origin.value;
      // A value already carrying a marker is a reference, not a run value, and
      // a brace would break the parallel walk. No LENGTH floor here, unlike
      // every producer's (MIN_ID_LEN, buildFlow's >= 2): fwod31 is a
      // one-character value — `cids=1` minted "1" and the compiled start url
      // became `http://127.0.0.{{d1}}:8069/...` — and a triage that cannot see
      // the case cannot report on it. The floor lives on the COLLECTOR
      // (recordedValues), so ordinary sessions do not enumerate every digit.
      if (!value || value.includes('{{') || value.includes('}}')) continue;
      const at = occurrences(site.text, value);
      if (!at.length) continue;
      // The rule, as production runs it. `substitute` takes the slot map the
      // compiler builds; one entry is the whole question for one value.
      const rewritten =
        via === 'replaceToken'
          ? replaceToken(site.text, value, PROBE)
          : substitute(site.text, new Map([['v0', value]]));
      const threaded = threadedSpans(site.text, rewritten, value, PROBE);
      // WHICH rule refused, when one did. substitute's numeric branch only
      // ever NARROWS the shared boundary (the nth-index, dotted-number and
      // clock-time guards), so a pair the boundary threads and substitute does
      // not is the numeric guard's doing, and nothing else can be.
      const boundaryOnly = via === 'substitute' && /^\d+$/.test(value) ? threadedSpans(site.text, replaceToken(site.text, value, PROBE), value, PROBE) : null;
      for (const start of at) {
        const end = start + value.length;
        const same = threaded.has(start);
        const numericGuard = !same && Boolean(boundaryOnly?.has(start));
        out.push({
          value,
          label: origin.label,
          whereReadFrom: origin.whereReadFrom,
          ...(origin.source ? { readFromText: origin.source } : {}),
          kind: site.kind,
          where: site.where,
          text: site.text,
          span: [start, end],
          precededBy: site.text.slice(Math.max(0, start - 1), start),
          followedBy: site.text.slice(end, end + 1),
          enclosingToken: tokenAround(site.text, start, end),
          context: site.text.slice(Math.max(0, start - 40), end + 40),
          ruleSaid: same ? 'same' : 'coincidence',
          rule: numericGuard ? 'substitute:numeric-guard' : 'tokenPattern',
        });
      }
    }
  }
  return out;
}

// --- expectations -------------------------------------------------------------

/**
 * What the compiler did with one recorded page-change line.
 *
 * `mask` and `drop` are the same verdict at different strengths — the line, or
 * the part of it that was masked, is not something a later run will show — so
 * a triage that only asks "every run, or this one?" reads them together (see
 * `runSpecific` below).
 */
export interface ExpectationDecision {
  /** The line as the recorder wrote it. */
  line: string;
  /**
   * The line after the caller's slots were substituted — the first thing
   * `expectationFor` does, and the form every later rule judges. A `{{vN}}`
   * in it is a value the procedure is GIVEN afresh on every run, which is
   * exactly what tells "the customer name this run typed" from "the record id
   * this run happened to make".
   */
  slotted: string;
  /** What the rule chain made of it; equal to `slotted` when it said keep. */
  masked: string;
  where: string;
  tool: string;
  /** The instruction this line's step belongs to — the procedure being asserted. */
  procedure: string;
  ruleSaid: 'keep' | 'mask' | 'drop';
  /** The rule that decided, named as it is spelled in the source. */
  rule: string;
}

/**
 * The rule's verdict restated as the question site J asks — "would a line
 * like this be on the page on EVERY run of this procedure?".
 *
 * The mapping is not simply keep/not-keep, and the third answer is why. A
 * line the mask chain rewrote or emptied was rewritten BECAUSE something in it
 * belongs to the recording run (a moment, a minted id, another record's value,
 * a popup's current contents): that is an answer to J's question. A line
 * dropped by `identifiesNothing` ALONE was dropped for an unrelated reason —
 * `- textbox "": null` says nothing about which element appeared, and would
 * say nothing on every future run too. Scoring it against "every run or this
 * run" would put a rule and a model on opposite sides of a question neither
 * was asked, so it is reported and not scored.
 */
export function ruleAnswer(d: Pick<ExpectationDecision, 'ruleSaid' | 'rule'>): 'every-run' | 'this-run' | 'uninformative' {
  if (d.ruleSaid === 'keep') return 'every-run';
  if (d.rule === 'identifiesNothing') return 'uninformative';
  return 'this-run';
}

export interface ExpectationInput {
  /** One take's recording — the `instruction`/`step`/`report` stream. */
  entries: readonly RecordedEntry[];
  /**
   * The slot values the compiler substitutes BEFORE any mask runs (the
   * instruction's bound params and the values this run minted). Absent is
   * honest for a caller that has not compiled yet; the masks then judge the
   * raw line, exactly as they would for a recording with no slots.
   */
  slots?: Map<string, string>;
  /** The instruction's report values — `publishedReadValues` needs them to label reads. */
  reportValues?: Record<string, unknown>;
}

/**
 * Every recorded expectation line the compiler ruled on, with its verdict,
 * reproduced by running `expectationFor`'s own chain in its own order:
 * TRANSIENT_LINE, substitute, maskVolatile, maskMinted, maskForeignValue,
 * maskPopupItem, identifiesNothing — then `unfreezeExpectations`'
 * maskPublishedValues and its second identifiesNothing sweep.
 *
 * Two of the chain's steps are NOT reproduced, and the log says so rather than
 * guessing: `unfreezeWatchedNames` (which needs the whole compiled segment,
 * not one line) and the MAX_ADDED_LINES budget (which is a cap, not a
 * judgement about the line).
 */
export function expectationDecisions(input: ExpectationInput): ExpectationDecision[] {
  const slots = input.slots ?? new Map<string, string>();
  const steps = input.entries.filter((e): e is RecordedStep => e.k === 'step');
  const published = publishedReadValues(steps, input.reportValues ?? {});
  const out: ExpectationDecision[] = [];
  let procedure = '';
  let index = 0;
  for (const entry of input.entries) {
    if (entry.k === 'instruction') {
      procedure = entry.text;
      continue;
    }
    if (entry.k !== 'step') continue;
    index += 1;
    // A navigation's diff is its LANDING, not an effect: expectationFor never
    // looks at it, so there is no decision to report.
    if (!entry.diff?.added?.length || NAVIGATION_TOOLS.has(entry.tool)) continue;
    const typed = typedValues(entry, slots);
    for (const line of entry.diff.added) {
      const slotted = substitute(line, slots);
      const row = (ruleSaid: ExpectationDecision['ruleSaid'], rule: string, masked: string): ExpectationDecision => ({
        line,
        slotted,
        masked,
        where: `step ${index} (${entry.tool})`,
        tool: entry.tool,
        procedure,
        ruleSaid,
        rule,
      });
      if (TRANSIENT_LINE.test(line)) {
        out.push(row('drop', 'TRANSIENT_LINE', line));
        continue;
      }
      const volatile_ = maskVolatile(slotted);
      const minted = maskMinted(volatile_);
      const foreign = maskForeignValue(minted, typed);
      const popup = maskPopupItem(foreign);
      // The FIRST rule that changed the line is the one worth naming: the rest
      // of the chain then re-judges what it left. Order as expectationFor runs
      // them, so the name matches the source a reader will go and look at.
      const fired =
        volatile_ !== slotted
          ? 'maskVolatile'
          : minted !== volatile_
            ? 'maskMinted'
            : foreign !== minted
              ? 'maskForeignValue'
              : popup !== foreign
                ? 'maskPopupItem'
                : '';
      if (identifiesNothing(popup)) {
        out.push(row('drop', fired ? `${fired}+identifiesNothing` : 'identifiesNothing', popup));
        continue;
      }
      const unfrozen = published.length ? maskPublishedValues(popup, published) : popup;
      if (identifiesNothing(unfrozen)) {
        out.push(row('drop', 'maskPublishedValues+identifiesNothing', unfrozen));
        continue;
      }
      if (unfrozen !== popup) {
        out.push(row('mask', fired ? `${fired}+maskPublishedValues` : 'maskPublishedValues', unfrozen));
        continue;
      }
      if (fired) {
        out.push(row('mask', fired, popup));
        continue;
      }
      out.push(row('keep', 'kept', popup));
    }
  }
  return out;
}

// --- collecting the inputs from a recording -----------------------------------

/** Args that name WHERE a step acted rather than WHAT it typed (compile's ELEMENT_ARG, read the other way). */
const TYPED_ARG = new Set(['value', 'text', 'option', 'prompt_text', 'key']);

/** The strings a locator candidate carries that a value can be threaded into. */
function candidateTexts(c: LocatorCandidate): Array<{ field: string; text: string }> {
  const at = (field: string, text: unknown) => (typeof text === 'string' && text ? [{ field, text }] : []);
  const any = c as Record<string, unknown>;
  return [
    ...at('name', any.name),
    ...at('text', any.text),
    ...at('label', any.label),
    ...at('placeholder', any.placeholder),
    ...at('hasText', any.hasText),
    ...at('container', any.container),
    ...at('selector', any.selector),
    ...at('value', c.kind === 'testid' ? any.value : undefined),
  ];
}

/**
 * The texts a recording hands the threading rule, as the exporter and the
 * compiler hand them: the instruction (rewritten by `replaceToken`), then
 * every step's url, typed args, locator candidates and recorded page changes
 * (all rewritten by `substitute`).
 *
 * The POSITIONAL url writers — `substituteUrlId` and `substituteUrlParts` —
 * are deliberately not enumerated here. They rewrite a value at the url
 * position it was banked at and nowhere else, so they answer "which position"
 * rather than "same or coincidence", and a triage of them would be about a
 * different question. What IS enumerated for a url is the textual pass every
 * other slot still takes.
 */
export function recordedTexts(entries: readonly RecordedEntry[]): ThreadingSite[] {
  const out: ThreadingSite[] = [];
  let index = 0;
  for (const entry of entries) {
    if (entry.k === 'instruction') {
      out.push({ kind: 'arg', where: `instruction "${entry.text.slice(0, 40)}"`, text: entry.text, via: 'replaceToken' });
      continue;
    }
    if (entry.k !== 'step') continue;
    index += 1;
    const at = `step ${index} (${entry.tool})`;
    for (const [key, value] of Object.entries(entry.args ?? {})) {
      if (typeof value !== 'string' || !value) continue;
      if (key === 'url') out.push({ kind: 'url', where: `${at} args.url`, text: value });
      else if (TYPED_ARG.has(key)) out.push({ kind: 'arg', where: `${at} args.${key}`, text: value });
    }
    for (const [key, loc] of Object.entries(entry.locators ?? {})) {
      (loc.chain ?? []).forEach((c, i) => {
        for (const { field, text } of candidateTexts(c)) {
          out.push({ kind: 'locator', where: `${at} locators.${key}[${i}].${field} (${c.kind})`, text });
        }
      });
    }
    if (entry.diff?.added?.length && !NAVIGATION_TOOLS.has(entry.tool)) {
      entry.diff.added.forEach((line, i) => out.push({ kind: 'expectation', where: `${at} added[${i}]`, text: line }));
    }
  }
  return out;
}

/**
 * The values a recording holds, with how the run came by each — the half of
 * the state the step-0 probe was missing when it answered 0.72 that the
 * `bench` in `fwgr8-n1-bench-dashboard` was the reported tag. A value and a
 * url say nothing about identity; a value, its label, and the fact that a
 * `type` step put it in a tag field do.
 *
 * Provenance in preference order, first wins: what the procedure typed, what
 * a read published, what a url minted, what the caller declared.
 */
export function recordedValues(entries: readonly RecordedEntry[], vars: Record<string, string> = {}): ValueOrigin[] {
  const byValue = new Map<string, ValueOrigin>();
  const add = (o: ValueOrigin): void => {
    const value = o.value.trim();
    // buildFlow's own floor for minting a reference. A one-character value
    // occurs in half the digits on the page, and enumerating those would bury
    // the log the step exists to produce — threadingDecisions has no floor, so
    // a caller with a named short value can still ask about it.
    if (value.length < 2 || byValue.has(value)) return;
    byValue.set(value, { ...o, value });
  };
  let steps = 0;
  for (const entry of entries) {
    if (entry.k !== 'step') continue;
    steps += 1;
    for (const [key, value] of Object.entries(entry.args ?? {})) {
      if (!TYPED_ARG.has(key) || typeof value !== 'string') continue;
      const target = typeof entry.args.target === 'string' ? entry.args.target : '';
      add({
        value,
        label: key,
        whereReadFrom: 'typed',
        source: `the procedure ${entry.tool === 'select' ? 'chose' : 'typed'} it at step ${steps}${target ? ` into ${target}` : ''}`,
      });
    }
    if ((entry.tool === 'read' || entry.tool === 'read_all') && typeof entry.result === 'string') {
      const label = typeof entry.label === 'string' ? entry.label : 'read';
      let observed: unknown;
      try {
        observed = JSON.parse(entry.result);
      } catch {
        observed = entry.result;
      }
      for (const v of Array.isArray(observed) ? observed : [observed]) {
        const s = String(v ?? '').trim();
        if (!s || s.includes('\n')) continue;
        const what = typeof entry.args.what === 'string' ? entry.args.what : 'text';
        const target = typeof entry.args.target === 'string' ? entry.args.target : '';
        add({ value: s, label, whereReadFrom: 'read', source: `read back from the page at step ${steps} (${what}${target ? ` of ${target}` : ''})` });
      }
    }
  }
  for (const entry of entries) {
    if (entry.k !== 'report') continue;
    for (const [label, value] of Object.entries(entry.values ?? {})) {
      if (typeof value === 'string') add({ value, label, whereReadFrom: 'reported', source: 'reported by the instruction' });
    }
  }
  for (const [label, value] of Object.entries(vars)) add({ value, label, whereReadFrom: 'var', source: 'declared as a run variable before the session started' });
  return [...byValue.values()];
}
