/**
 * The RunLedger: one registry for everything a RUN made, as opposed to what
 * the app provides.
 *
 * Seven defects in six cloud takes were the same bug wearing different
 * clothes — a value or a procedure from the recording run surviving into a
 * replay: a read pinned to row 1 publishing a seed record's ref; a runid
 * baked into a locator's hasText; a dashboard uid embedded 62 times in skill
 * templates; a three-character record id below a minting floor. Each was
 * fixed where it was found, and the next take produced a fresh instance,
 * because the rule they all violate had no home: recognition was
 * re-implemented per call site (three copies of the same length gate), and
 * relied on text matching against whatever the current instruction happened
 * to mention.
 *
 * This is that home. A value enters ONCE, with a Binding saying how a later
 * run re-derives its own, and every producer asks the ledger rather than
 * guessing. See notes/PLAN-provenance.md.
 */

/** How a later run obtains its own value for a slot. */
import type { RecordedEntry, RecordedStep } from '../daemon/recorder.js';
import { factFor, routeTemplateOf, type FactKind, type SiteFacts } from '../execution/facts.js';
import { isMutatingAction } from '../execution/lifecycle.js';
import { originOf, urlParts as urlPartsOf, urlShapeOf, type UrlSegDiff } from '../execution/url.js';
import { MIN_ID_LEN, looksLikeId, tokenPattern } from './shape.js';
import type { Skill } from './store.js';
// A cycle (facts-value.ts reads this module's url helpers); function bindings only, read at call time.
import { valueVerdict } from './facts-value.js';

export type Binding =
  /** The caller declared it (a flow var). */
  | { from: 'var'; name: string }
  /** The run typed it into the page. */
  | { from: 'input' }
  /** A part of a url the run landed on: `p1` (path), `h0` (hash path), `q.action` (hash state). */
  | { from: 'url'; step: string; label: string }
  /** A value an earlier step reported, optionally a JSON path into it. */
  | { from: 'output'; step: string; name: string; path?: string };

export interface LedgerEntry {
  /** What it was on the recording run. An EXAMPLE — never a value to replay. */
  value: string;
  binding: Binding;
  /**
   * `identifier` names a record (a ref, a uid, a row id) and may anchor a
   * locator; `name` is human-chosen text the run supplied; `text` is
   * everything else.
   */
  kind: 'identifier' | 'name' | 'text';
  /**
   * WHAT ENTITLED this entry to its `kind` — the provenance of the JUDGEMENT,
   * not of the value.
   *
   * This is the distinction `known` used to gesture at and could not make.
   * `known` recorded whether the run produced the value, which is true of
   * almost everything the ledger banks and so discriminated nothing; it was
   * written by every caller, read by no production code, and its doc claimed
   * an invariant ("known values are the only ones allowed to carry record
   * IDENTITY") that nothing enforced. What actually matters downstream is how
   * confident the `identifier` verdict is, because that verdict can refuse an
   * export — see `fatal`.
   *
   *  - `position` — the url's own vocabulary said so (idPositionPart).
   *  - `var`      — the caller declared it a run variable; a var's value is
   *                 run-scoped by definition.
   *  - `variance` — a later run landed a different value in the same place.
   *                 The only arm reached by watching rather than by reading,
   *                 and the only one that can see a record pointer in an
   *                 unnamed position (a grafana uid at `p1`). Seeded from the
   *                 flow's outputEvidence at the start of a flow run, so it
   *                 is empty on a first recording by construction.
   *  - `shape`    — nothing but the characters. A guess, and never enough on
   *                 its own to bin a recording.
   */
  basis: 'position' | 'var' | 'variance' | 'shape';
  /** Where it first appeared, for ordering and for diagnostics. */
  firstSeen: { instruction: number; step: number };
  /**
   * Banked for its URL POSITION only (landedPathDigits below the text floor):
   * compile may slot it where a later navigation url holds it at a path
   * position, but it is never looked for as a token in text — a single digit
   * stands in every page and selector (`(4) Status`, `nth-of-type(4)`), so
   * the text leak guards (runValuesIn) do not see it.
   */
  positional?: true;
}

/**
 * A url part that is an identifier by POSITION, whatever its characters.
 *
 * looksLikeId reads the value's shape, and a shape gate has a floor: odoo's
 * database ids are short integers (`#id=44`), invisible to it — and through
 * it, to the ledger, the leak guards, flow minting and compile slotting all at
 * once. fwod27 is the bill: the recording's contact id 44 rode into a flow
 * instruction as prose ("res.partner id 44"), no guard saw it, and both
 * replays navigated to the recording's deleted record and halted at step 2.
 *
 * The url's own vocabulary settles what a shape cannot: a query/hash param
 * NAMED id holds a record id. Only all-digit values qualify — a param named
 * `id` carrying a word is some app's routing, not a record number.
 *
 * Exactly `id`, not `.*_id`. The wider match was speculation beyond the
 * evidence (fwod27's leak was `#id=44`), and fwod29 showed what it costs:
 * odoo's `menu_id=181` — a routing constant every run shares — banked as a
 * run-made record id and flunked verify-artifacts' navigation check on a
 * clean 8/8 sweep. An app calls its record pointer `id`; a `<thing>_id`
 * param in a url is that thing's ADDRESS in the app's chrome.
 */
export function idPositionPart(part: { label: string; value: string }): boolean {
  return part.label === 'q.id' && /^\d{1,10}$/.test(part.value);
}

/**
 * A digit run in a PATH (or hash-path) segment: the url addressing a record
 * by position, `/work_packages/details/41/overview`. The ledger has always
 * banked these as identifiers — "a digit run in a PATH position is the app
 * saying this is the record" (addUrlIds) — but only through the length
 * floor, which is a noise guard for SHAPE-guessed values and so silently
 * dropped every record id shorter than three characters.
 *
 * fwop2 (OpenProject) is the bill. 02-create minted work package 41 at `p4`;
 * the floor kept `41` out of the ledger, so 06-open's compile had no
 * `url:i2:p4` origin to slot its `goto …/details/41/activity` against, and
 * s_71f332 step 7 carried 41 literally. Both replays navigated to a work
 * package the reset had deleted ("The work package you are looking for
 * cannot be found or has been deleted.") and paid 15 and 7 recovery turns.
 * The flow could not reference it either: buildFlow's minting and the
 * replay's urlOutputs (referencablePart) applied the same floor, so no
 * `{{02-create.url.p4}}` existed to bind the slot from.
 *
 * Two digits at least: a single digit stands as a whole token in too much of
 * every url and page (a page number, a tab index, `nth-of-type(1)`) for the
 * leak guards keyed on the banked value to stay meaningful.
 *
 * The same kind of thing as idPositionPart — a record pointer named by where
 * it sits in the url — but not the same confidence: a path digit run can be
 * an app constant a click revealed (`/projects/12/…`), which is fwod19's
 * lesson for query params. So it only vouches a value past the FLOOR; it
 * never earns `basis: 'position'`, and never refuses an export on its own
 * (see fatal).
 */
export function pathIdPart(part: { label: string; value: string }): boolean {
  return /^(p|h)\d+$/.test(part.label) && /^\d{2,10}$/.test(part.value);
}

/**
 * A digit run at a path (or hash-route) position, at ANY length — the
 * candidate half of the landed-id rule. What makes it a record id is not the
 * characters but provenance: a step's own non-navigation action LANDED the url
 * that carries it (the ledger's `landed`, buildFlow's landedByAction). Below
 * pathIdPart's two-digit floor such an id is used only at its url position,
 * never as a token in text.
 *
 * snipeit fwsi2-n1: 03-create's save and a click landed `/hardware/4`; the
 * floor kept `4` out of the ledger and out of the flow's references, so
 * 04-create's `goto /hardware/4/checkout` and 04/05's prose "at /hardware/4"
 * stayed literal, and both replays and the compiled script checked out the
 * deleted asset 4 ("That asset was not found").
 */
export function pathDigitPart(part: { label: string; value: string }): boolean {
  return /^(p|h)\d+$/.test(part.label) && /^\d{1,10}$/.test(part.value);
}

/**
 * The site-facts key of a labelled url part (design-site-facts.md §2):
 * `route.path` at a path index (`p1` → `${route}#1`, a hash-route index `h2`
 * → `${route}#h2`), or `route.query` for a `q.<key>` (hash state and query
 * string share the `?key` spelling, as urlPart reads them). The route is
 * `routeTemplateOf(url, identityParts)`: the url parts known to be records
 * (`p<i>=<v>` / `h<i>=<v>`) written `*` whatever their characters, so a
 * letters-only grafana uid does not freeze inside the key (fwgr78). Null when
 * the url is not a url. The one definition: facts-value.ts urlFactKey writes
 * through it and addUrlIds reads through it.
 */
export function urlPartFactKey(url: string, label: string, identityParts: readonly string[] = []): { k: FactKind; key: string } | null {
  if (!originOf(url)) return null;
  const route = routeTemplateOf(url, identityParts);
  if (label.startsWith('q.')) return { k: 'route.query', key: `${route}?${label.slice(2)}` };
  const m = /^([ph])(\d+)$/.exec(label);
  if (!m) return null;
  return { k: 'route.path', key: `${route}#${m[1] === 'p' ? '' : 'h'}${m[2]}` };
}

/** The reliable string fact about a url part, or null (no store, no reliable fact, or not a url). */
function partFact(facts: SiteFacts | undefined, url: string, label: string, identityParts: readonly string[]): string | null {
  if (!facts) return null;
  const at = urlPartFactKey(url, label, identityParts);
  const v = at ? factFor(facts, at.k, at.key)?.v : undefined;
  return typeof v === 'string' ? v : null;
}

/**
 * The record-position parts of a `goto` target that nothing before it in the
 * run ever showed: no earlier url (an instruction's, a landing's, a goto's), no
 * step argument, no page line a step recorded (added, alert, read result), no
 * instruction or report text. Such a goto was not SENT to a known page; the
 * run read the address off the page by some route the recording cannot
 * replay, so its landing is where the record was first reached — a landing,
 * like a click's (`landed`).
 *
 * snipeit fwsi7: n1 saved the asset, ran an `eval` for the "Click here to view"
 * link's href (its result is not recorded), and went `goto /hardware/4`. fwsi6
 * had clicked the link instead, and there `4` was banked as 02-create's landed
 * id. Here goto/back were excluded from landings in three places (server.ts
 * noteMintedIds, flow.ts landedByAction, flow.ts staleInstructionIds), so `4`
 * was never banked, never minted, and 04-report's param stayed literal "4".
 *
 * Record POSITION only — a digit run in a path segment (pathDigitPart) or an
 * `id=` value (idPositionPart) — never a route word or a shaped token: a goto
 * to `/admin/settings` names a page, and a first visit to a page is not a
 * landing. And only a value the run had NOT shown: a goto to `/hardware/4`
 * after a click, a row, or an instruction had shown 4 is a navigation to a
 * known record, which stays what it was.
 */
export function unseenGotoParts(url: string, before: readonly RecordedEntry[]): { label: string; value: string }[] {
  const parts = urlPartsOf(url).filter((p) => pathDigitPart(p) || idPositionPart(p));
  if (!parts.length) return [];
  const shown = shownIn(before);
  return parts.filter((p) => !shown(p.value));
}

/** Whether anything in `before` showed a value: a url part, or a whole token of any recorded text (unseenGotoParts' net). */
function shownIn(before: readonly RecordedEntry[]): (value: string) => boolean {
  const urlValues = new Set<string>();
  const texts: string[] = [];
  const addUrl = (u: unknown): void => {
    if (typeof u !== 'string' || !u) return;
    for (const p of urlPartsOf(u)) urlValues.add(p.value);
  };
  for (const e of before) {
    if (e.k === 'instruction') {
      addUrl(e.url);
      texts.push(e.text ?? '', e.startText ?? '');
    } else if (e.k === 'report') {
      texts.push(e.summary ?? '', JSON.stringify(e.values ?? {}));
    } else {
      addUrl(e.diff?.url);
      addUrl(e.afterUrl);
      for (const v of Object.values(e.args ?? {})) addUrl(v);
      texts.push(JSON.stringify(e.args ?? {}), ...(e.diff?.added ?? []), ...(e.diff?.alerts ?? []), e.result ?? '');
    }
  }
  const text = texts.join('\n');
  return (value) => urlValues.has(value) || occursAsToken(text, value);
}

/**
 * The url parts — at ANY position, whatever the param is called — that a
 * step's own mutation minted and then linked to. Three facts from the
 * recording, never the part's name or characters:
 *  - a state-changing step M of this instruction (not a typed value: fill and
 *    type add what was typed) ADDED an element named by exactly the part's
 *    value at its core (`- link "#4"`: core `4`, idCore), and nothing before M
 *    had shown that value (shownIn);
 *  - M also added the element the url was reached BY: the link a goto was read
 *    from (RecordedStep.linkedFrom), or the element a click acted on;
 *  - `reached` is that goto or click, after M in the same instruction.
 *
 * kanboard fwkb41: 02-create's save (#37) added `- link "#4"` and `- link
 * "fwkb41-n1 Bench Task"`, and the next navigation (#41) was `goto
 * …?controller=TaskViewController&action=show&task_id=4`, linked from the
 * title link. idPositionPart admits only a param named exactly `id` (fwod29's
 * menu_id lesson), so `task_id=4` was no record position: never banked, never
 * minted. The report's new_task_numeric_id stayed the literal "4" and was
 * pruned, and s_2977d9 kept `goto …task_id=4` and the goal "Task #4" — right
 * only because the reset makes the new task #4 again.
 *
 * Odoo's `menu_id=120` stays out: no mutation adds an element named 120. A
 * seed card's `#1` stays out: the page showed it before any mutation.
 */
export function linkMintedParts(reached: RecordedStep, before: readonly RecordedEntry[]): { label: string; value: string }[] {
  const url = reached.diff?.url;
  if (!url || (reached.tool !== 'goto' && !isMutatingAction(reached.tool))) return [];
  const by = (reached.tool === 'goto' ? reached.linkedFrom?.chain : reached.locators?.target?.chain) ?? [];
  const byName = by.map((c) => (c.kind === 'role' ? c.name : c.kind === 'text' ? c.text : undefined)).find((n): n is string => Boolean(n?.trim()));
  if (!byName) return [];
  for (let k = before.length - 1; k >= 0; k--) {
    const m = before[k];
    if (m.k === 'instruction') return [];
    if (m.k !== 'step' || !isMutatingAction(m.tool) || m.tool === 'fill' || m.tool === 'type') continue;
    const names = addedElementNames(m);
    if (!names.includes(byName.trim())) continue;
    const shown = shownIn(before.slice(0, k));
    const cores = new Set(names.map(idCore).filter(Boolean));
    // Not the label of the element it was reached by: a url keyed by the name
    // you clicked (grafana fwgr25 `showCategory=Panel options`, reached by the
    // "Panel options" button its Add click had shown) addresses that label,
    // not a record. Kanboard's `#4` names the task; its url carries `4`.
    return partsWithQuery(url).filter((p) => cores.has(p.value) && p.value !== byName.trim() && !shown(p.value));
  }
  return [];
}

/**
 * urlParts plus the ordinary query string's values, labelled `q.<key>` as the
 * hash state is (execution/url.ts urlPart reads both). Only linkMintedParts
 * enumerates these: a query value is a record position here by provenance.
 */
function partsWithQuery(url: string): { label: string; value: string }[] {
  const out = urlPartsOf(url);
  for (const [key, value] of urlShapeOf(url)?.query ?? []) if (!out.some((p) => p.label === `q.${key}`)) out.push({ label: `q.${key}`, value });
  return out;
}

/** The names of the elements a step's page change added (`- role "name"`), trimmed. */
function addedElementNames(step: RecordedStep): string[] {
  const out: string[] = [];
  for (const line of step.diff?.added ?? []) {
    const m = /^- [\w-]+ ("(?:[^"\\]|\\.)*")/.exec(line.trim());
    if (!m) continue;
    try {
      const name = String(JSON.parse(m[1])).trim();
      if (name) out.push(name);
    } catch {
      // an unparseable name is no evidence
    }
  }
  return out;
}

/** A name with the punctuation around it taken off (`#4` → `4`, `(12)` → `12`); inner characters are kept. */
function idCore(name: string): string {
  const isWord = (c: string): boolean => (c >= '0' && c <= '9') || c.toLowerCase() !== c.toUpperCase();
  let a = 0;
  let b = name.length;
  while (a < b && !isWord(name[a])) a++;
  while (b > a && !isWord(name[b - 1])) b--;
  return name.slice(a, b);
}

/**
 * The values a run WATCHED CHANGE at a url position, from the segment diffs a
 * url gate treated as volatile (gates.ts urlEffectVerdict, "url segment(s)
 * differ from recorded (X→Y)"). Both sides: the recording's value and this
 * run's, because they are the same position seen twice, and a later run may
 * meet either one.
 *
 * Variance is an observation about the ENVIRONMENT, so it is collected whether
 * or not the step that saw it went on to succeed — which is the whole point of
 * routing it here (fwgr41-n2 printed `afyd7g0300dfkc→bfyd7wj0ceolcf` one step
 * before it navigated to the recording's now-deleted dashboard and stopped, and
 * the observation died with the stop; n3 then shape-guessed the same uid again).
 *
 * Only positions that ADDRESS the record count: a path or hash-path segment
 * (the url saying which record this is — the same reasoning addUrlIds states
 * for a digit run in a path position), or a query/state key the url's own
 * vocabulary names `id` (idPositionPart). A disagreeing query/state value
 * elsewhere says the two runs are looking at different VIEWS, not that the app
 * minted a different value: fwod20 measured 21 "varying" parts across three
 * runs and the ones that mattered were `q.model = sale.order vs res.partner`
 * and `q.view_type = form vs list`, both of which varied because a recovery
 * turn navigated somewhere else (see flow.ts FlowStep.route, which discards
 * exactly these), and rpod1 prints that same pair as a volatile-segment
 * warning. Banking `form` as an identifier would make every locator naming it
 * a fatal leak.
 */
export function urlVarianceValues(diffs: readonly UrlSegDiff[]): string[] {
  const out: string[] = [];
  for (const d of diffs) {
    const label = d.key === undefined ? '' : `q.${d.key}`;
    const addresses =
      d.where === 'path' ||
      d.where === 'hashPath' ||
      idPositionPart({ label, value: d.actual }) ||
      idPositionPart({ label, value: d.expected });
    if (!addresses) continue;
    for (const side of [d.expected, d.actual]) {
      const v = String(side ?? '').trim();
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

const MAX_VALUE_LEN = 200;

/**
 * A binding's stable identity, so a compiled param can name the ORIGIN of its
 * value ("var:runid", "url:01-open:p1") and a later run resolve its own from
 * the same origin. This is what lets a value cross an instruction boundary: a
 * skill whose template never mentions the runid can still bind it, because the
 * param points at where the value comes from rather than at a word to match.
 */
export function bindingKey(b: Binding): string {
  switch (b.from) {
    case 'var':
      return `var:${b.name}`;
    case 'input':
      return 'input';
    case 'url':
      return `url:${b.step}:${b.label}`;
    case 'output':
      return `output:${b.step}:${b.name}${b.path ? `#${b.path}` : ''}`;
  }
}

/**
 * The run values a given instruction may be compiled AGAINST: everything the
 * ledger holds except what that same instruction REPORTED.
 *
 * A value first banked under the instruction being compiled was read BY that
 * instruction, from the page it was already on — an OUTPUT of the procedure,
 * never an input to it. Slotting it mints a parameter whose origin is
 * `output:i<N>:<name>`: a LEDGER instruction index, which no flow step id can
 * ever name (see flow.ts remapParams), so the slot falls through to its
 * recorded literal and the re-pin is refused for identifying the record —
 * every run, forever. fwod60's 02-create is the shape of it: `v1`, example
 * `"New"` (the heading of the not-yet-saved quotation), `usedIn: []`, bound to
 * `output:i2:record_heading` where `i2` IS 02-create. fwod61's 03-create is
 * the same with `output:i3:oe_subtotal_footer_tr_1`. Both refused the pin the
 * recovery had earned, so the adopted step never graduated.
 *
 * This is provenance, not shape, and it relaxes nothing: a value banked by an
 * EARLIER instruction still reaches compile, still gets its origin, and is
 * still held to remapParams' record-identifier guard. First appearance wins in
 * the ledger (see `add`), so a threaded value an earlier step minted is never
 * re-banked here and never dropped by this filter.
 *
 * Outputs only. A url id this instruction minted (`url:i<N>:…`) may legitimately
 * appear in a navigation the same procedure makes, and slotting it is what keeps
 * the recording run's id out of the STORE — fwgr41's n2 welded its own dashboard
 * uid into a goto and n3 replayed onto a deleted dashboard. That slot is refused
 * a pin by the same rule, but the refusal is the cheaper failure.
 */
export function withoutOwnOutputs(values: Record<string, string>, instructionStep: string): Record<string, string> {
  const own = `output:${instructionStep}:`;
  return Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith(own)));
}

export class RunLedger {
  private entries: LedgerEntry[] = [];
  /** Values already banked, so first appearance wins. */
  private seen = new Set<string>();
  /**
   * When each entry's value was last SEEN at its own origin: banked, or — for
   * a url id — shown again by that same step at that same position. See
   * byOrigin.
   */
  private sighted = new Map<LedgerEntry, number>();
  private sightings = 0;
  private instruction = 0;
  private step = 0;
  /**
   * Values an EARLIER RUN watched change — the arm that finally outranks the
   * characters.
   *
   * A flow accumulates, per step output, how often a later run reproduced the
   * recording's value and how often it produced a different one (flow.ts
   * outputEvidence). A value some run contradicted is a record pointer
   * whatever it looks like, and that is the question shape has been standing
   * in for all along: "did the app make this, or was it this run's record?"
   *
   * A SET, not a verdict map, and deliberately so. The converse does not
   * follow: a bench app reset between runs reproduces a minted record id
   * exactly — every repair-desk recording here creates ticket `t15` — so
   * agreement across runs is not evidence that a value is the app's. Letting
   * it suppress admission would have stopped banking t15 from run 2 on, and
   * an unbanked record id is one no leak guard can see. Evidence may only add
   * to what shape and position admit. See flow.ts `RunSpecific`.
   *
   * Empty on a first recording, which is correct and is the whole design: run
   * 1 proposes with shape, run 2 adds what it has seen.
   */
  private variance = new Set<string>();

  /**
   * Hand the ledger the values earlier runs demonstrated are run-specific,
   * before it starts banking. See `variance`.
   */
  seedVariance(values: Iterable<string>): void {
    for (const value of values) {
      const v = String(value ?? '').trim();
      if (v) this.variance.add(v);
    }
  }

  /** Did an earlier run watch this value change? */
  runSpecific(value: string): boolean {
    return this.variance.has(String(value ?? '').trim());
  }

  /** Advance the cursor used to stamp `firstSeen`. */
  beginInstruction(index: number): void {
    this.instruction = index;
    this.step = 0;
  }

  beginStep(index: number): void {
    this.step = index;
  }

  /**
   * Bank a value with its provenance. Returns the entry, or null when the
   * value is unusable (too short, too long, already known). First appearance
   * wins: the step that MINTED a value owns it, so later steps reference it
   * rather than re-minting a duplicate.
   */
  add(
    value: string,
    binding: Binding,
    opts: {
      kind?: LedgerEntry['kind'];
      basis?: LedgerEntry['basis'];
      vouched?: boolean;
      positional?: true;
      /** The `value.shape` key the value was met under (facts-value.ts shapeKeyOf(url, name)); read only with `facts`. */
      shapeKey?: string;
    } = {},
    /**
     * The origin's site facts (design-site-facts.md §4 consumer 1; stage 3).
     * Asked only where the caller states no `kind`, through valueVerdict (a
     * RELIABLE fact, or nothing):
     *  - `not-identifier` (a catalogue constant the app offered, a
     *    credential): banked as `text` whatever its characters or its
     *    variance, and never vouched past the length floor (odoo's FURN_7777);
     *  - `identifier` (a mint, or the label's reliable mint shape): banked as
     *    an identifier at first sighting, vouched past the floor as addUrlIds'
     *    fact-admitted parts are, and below the floor for its position only
     *    (kanboard's "4" under `task_id`). Its basis stays `shape` (variance
     *    where an earlier run watched it change): the fact entitles it to be
     *    BANKED, not to refuse a recording (fatal).
     * Absent, or no reliable fact about the value, and the rules below run
     * exactly as they always have.
     */
    facts?: SiteFacts,
  ): LedgerEntry | null {
    const v = String(value ?? '').trim();
    const verdict = facts && opts.kind === undefined && v ? valueVerdict(facts, v, opts.shapeKey) : null;
    if (verdict?.kind === 'identifier') {
      opts = { ...opts, kind: 'identifier', vouched: true, ...(v.length < MIN_ID_LEN ? { positional: true as const } : {}) };
      if (opts.basis === undefined && binding.from !== 'var') opts.basis = this.variance.has(v) ? 'variance' : 'shape';
    } else if (verdict?.kind === 'not-identifier') {
      opts = { ...opts, kind: 'text', vouched: false };
      if (opts.basis === undefined && binding.from !== 'var') opts.basis = 'shape';
    }
    // The length floor guards against banking junk from shape-guessing
    // callers. A VOUCHED value has positional evidence instead (a `q.id` url
    // part — see idPositionPart), and odoo's two-digit record ids are exactly
    // what the floor was silently discarding: fwod27's contact id 44 never
    // banked, so no guard downstream could see it leak.
    if ((v.length < MIN_ID_LEN && !opts.vouched) || !v.length || v.length > MAX_VALUE_LEN || this.seen.has(v)) return null;
    // What earlier runs demonstrated, where they demonstrated anything. It
    // outranks the shape prior below and is outranked only by a caller that
    // states the kind outright, because a caller that states it has read the
    // url's own vocabulary (addUrlIds/idPositionPart) — position and variance
    // are both evidence, and where they disagree the closer one wins.
    const runSpecific = this.variance.has(v);
    const entry: LedgerEntry = {
      value: v,
      binding,
      // A caller that KNOWS passes `kind` (addUrlIds always does). Where none
      // does — a reported read-back, a var — run 1 has nothing but the
      // characters to go on, so this is the shape rule's 'first-run' prior
      // (see shape.ts).
      //
      // It fails toward SILENCE, and this is the sharpest instance of it in
      // the product: `fatal()` refuses an export only for `kind: 'identifier'`
      // in a locator. So a record id that does not LOOK like one is banked as
      // 'text', the export gate declines to call its leak fatal, and the
      // compiled locator carries the recording run's record into every replay
      // while every check passes. `identifierLike("Order Alpha")` is false;
      // so is `identifierLike("abcd")`. That is the exact case
      // notes/PLAN-evidence-over-shape.md was written for.
      //
      // Widening the shape test cannot fix it — fatal() already lost a
      // release cycle to the opposite error (odoo's menu id 123 banked as a
      // record, a clean 6/6 recording refused). The fix is a run-2 verdict,
      // which `runSpecific` now is: a value an earlier run watched change is
      // an identifier however ordinary it looks — "Order Alpha" and "abcd"
      // included, the two cases named above that no regex reaches.
      //
      // It only ever ADDS. Agreement across runs does not demote an
      // identifier back to text, because a bench app reset between runs
      // reproduces a minted record id exactly; see `variance`.
      kind: opts.kind ?? (runSpecific || looksLikeId(v, 'first-run') ? 'identifier' : 'text'),
      // A declared run variable is run-scoped because the caller said so, which
      // is evidence about the value's origin and not about its spelling.
      // Everything else that reaches here without a stated basis got its kind
      // from the line above — from evidence where a run supplied any, and
      // otherwise from the characters.
      basis: opts.basis ?? (binding.from === 'var' ? 'var' : !opts.kind && runSpecific ? 'variance' : 'shape'),
      firstSeen: { instruction: this.instruction, step: this.step },
      ...(opts.positional ? { positional: true as const } : {}),
    };
    this.seen.add(v);
    this.entries.push(entry);
    this.sighted.set(entry, ++this.sightings);
    return entry;
  }

  /** Bank the identifier-like parts of a url the run just landed on. */
  addUrlIds(
    url: string,
    step: string,
    parts: { label: string; value: string }[],
    /** `landedLabels`: the parts a goto LANDED (unseenGotoParts) — landed at those positions only. */
    opts: { landed?: boolean; landedLabels?: readonly string[]; linkMinted?: readonly { label: string; value: string }[] } = {},
    /**
     * The origin's site facts (design-site-facts.md §2 consumer 3; stage 1).
     * Only a RELIABLE fact speaks: a query key known `identity` on this route
     * is admitted on the first run, past the shape test and the `id`-only
     * digit rule (kanboard's `task_id`, vikunja's ids); a key known `routing`
     * is never admitted, whatever its digits or its variance; a path position
     * known `identity` is admitted as vouched. Absent, or no reliable fact
     * about a part, and the rules below run exactly as they always have.
     */
    facts?: SiteFacts,
  ): LedgerEntry[] {
    const out: LedgerEntry[] = [];
    const { verdict, scan } = this.urlFactVerdicts(url, parts, facts);
    for (const part of scan) {
      // Shown again at the position it was banked at, by the same step: this
      // origin's value is this one again (byOrigin).
      const again = this.entries.find((e) => e.value === part.value.trim() && e.binding.from === 'url' && e.binding.step === step && e.binding.label === part.label);
      if (again) {
        this.sighted.set(again, ++this.sightings);
        continue;
      }
      // A reliable `routing` fact: this key selects the page, it never holds a record.
      const fact = verdict.get(part.label);
      if (fact === 'routing' && part.label.startsWith('q.')) continue;
      // A reliable `identity` fact: the position holds a record on this route.
      const factId = fact === 'identity';
      // `landed`: the caller saw a step's own non-navigation action land this
      // url, so a path digit run in it is that step's record id at any length
      // (pathDigitPart). Below the floor it is banked for its position only.
      const landedId = (Boolean(opts.landed) || Boolean(opts.landedLabels?.includes(part.label))) && pathDigitPart(part);
      // Shape proposes, position decides: idPositionPart is the evidence arm
      // (a param NAMED id holds a record id whatever its characters) and the
      // shape test is the 'first-run' prior beside it, for the parts no
      // position vouches for. Fails toward SILENCE when it says no — an
      // unbanked url id is one no leak guard can see (fwod27) — which is why
      // this pair is the standing candidate for a variance-based replacement,
      // not a site to widen with another regex clause.
      //
      // Evidence first, where there is any. A part earlier runs CONTRADICTED
      // is a record pointer whatever its characters (this is the only arm
      // that can catch a grafana uid in an unnamed path position — `p1`,
      // where there is no name to read and shape is all that was left). A
      // part every run REPRODUCED is app furniture whatever its characters,
      // which is the honest form of the fwod29 patch below: odoo's
      // `action=315` stops being banked because runs demonstrated the app
      // reproduces it, not because we hard-coded a rule about digits.
      const runSpecific = this.runSpecific(part.value);
      if (landedId || factId) {
        // Admitted on provenance, the landing, before any shape is asked —
        // or on a reliable identity fact, which is provenance from earlier sessions.
      } else if (!runSpecific && !looksLikeId(part.value, 'first-run') && !idPositionPart(part)) continue;
      // A pure-digit QUERY param the app does not call `id` is routing
      // vocabulary, not a record: fwod29 banked odoo's `action=315` and
      // `action=126` (window-action numbers, identical on every run) and the
      // navigation check flagged 16 "leaks" on a clean sweep. A digit run in
      // a PATH position (`/tickets/315`) still banks — there the position is
      // the app saying "this is the record".
      // Evidence overrides it: that patch is a standing guess about what
      // digits in a query param mean, and a run that watched this exact value
      // change is not guessing.
      // A reliable identity fact overrides it too: the app was watched minting
      // records under this key (kanboard fwkb41's `task_id=4`).
      if (!runSpecific && !factId && /^\d+$/.test(part.value) && part.label.startsWith('q.') && !idPositionPart(part)) continue;
      // Vouched by the fact alone: banked for its position only below the
      // floor, as a landed path digit is.
      const factOnly = factId && !runSpecific && !idPositionPart(part) && !landedId;
      const entry = this.add(
        part.value,
        { from: 'url', step, label: part.label },
        // The admission test above has three arms and they are not equally
        // sure of themselves. Say which one let this part through, so a
        // refusal downstream can require a confident one. Ranked as they are
        // trusted: a run that watched the value change, then the url's own
        // vocabulary, then the characters.
        //
        // A path digit run is vouched past the length floor (pathIdPart) and
        // still kinded on `shape`: its position entitles `41` to be BANKED —
        // so compile slots a later navigation to it, and a recovery that
        // navigates to it is not pinned — not to refuse a recording.
        {
          kind: 'identifier',
          basis: runSpecific ? 'variance' : idPositionPart(part) ? 'position' : 'shape',
          // A fact-admitted part keeps `shape` (as a linkMinted part does): the
          // fact entitles it to be BANKED, not to refuse a recording (fatal).
          vouched: runSpecific || idPositionPart(part) || pathIdPart(part) || landedId || factId,
          ...((landedId || factOnly) && !pathIdPart(part) && part.value.length < MIN_ID_LEN ? { positional: true as const } : {}),
        },
      );
      if (entry) out.push(entry);
    }
    // Parts a step's own mutation minted and linked to (linkMintedParts),
    // whatever their position is called: a record id by provenance. Kanboard
    // fwkb41's `task_id=4` is below the floor, so it is banked for its position
    // only, as a landed path digit is.
    for (const part of opts.linkMinted ?? []) {
      // ...except at a key a reliable fact says routes: never admitted.
      if (part.label.startsWith('q.') && verdict.get(part.label) === 'routing') continue;
      const entry = this.add(
        part.value,
        { from: 'url', step, label: part.label },
        { kind: 'identifier', basis: 'shape', vouched: true, ...(part.value.length < MIN_ID_LEN ? { positional: true as const } : {}) },
      );
      if (entry) out.push(entry);
    }
    return out;
  }

  /**
   * What the origin's reliable facts say about each part of `url` (label →
   * fact value), and the parts addUrlIds walks: `parts` as given, plus — only
   * where a reliable `identity` fact names it — an ordinary query-string key
   * urlParts does not enumerate (kanboard's `?task_id=4`, read as urlPart
   * reads `q.<key>`: hash state first, then the query string). With no facts
   * the verdicts are empty and the walk is `parts`, untouched.
   *
   * Keys are built as the value observer writes them (urlPartFactKey): the
   * route with the url's known record parts written `*` — the path parts this
   * ledger already holds at their label, a path position under test itself,
   * and every path position a reliable identity fact vouches, before any
   * query key is asked about.
   */
  private urlFactVerdicts(
    url: string,
    parts: { label: string; value: string }[],
    facts: SiteFacts | undefined,
  ): { verdict: Map<string, string>; scan: { label: string; value: string }[] } {
    const verdict = new Map<string, string>();
    if (!facts) return { verdict, scan: parts };
    const pathLabel = (label: string) => /^[ph]\d+$/.test(label);
    const tag = (p: { label: string; value: string }) => `${p.label}=${p.value}`;
    const held = parts
      .filter((p) => pathLabel(p.label) && this.entries.some((e) => e.binding.from === 'url' && e.binding.label === p.label && e.value === p.value.trim()))
      .map(tag);
    const identityParts = [...held];
    for (const p of parts) {
      if (!pathLabel(p.label)) continue;
      const self = tag(p);
      const v = partFact(facts, url, p.label, held.includes(self) ? held : [...held, self]);
      if (!v) continue;
      verdict.set(p.label, v);
      if (v === 'identity' && !identityParts.includes(self)) identityParts.push(self);
    }
    const extra: { label: string; value: string }[] = [];
    for (const [key, value] of urlShapeOf(url)?.query ?? []) {
      if (!parts.some((p) => p.label === `q.${key}`)) extra.push({ label: `q.${key}`, value });
    }
    for (const p of [...parts, ...extra]) {
      if (!p.label.startsWith('q.')) continue;
      const v = partFact(facts, url, p.label, identityParts);
      if (v) verdict.set(p.label, v);
    }
    return { verdict, scan: [...parts, ...extra.filter((p) => verdict.get(p.label) === 'identity')] };
  }

  /**
   * Follow a relabel (relabel.ts) of what `step` reported: `renames` is
   * old name -> new name. Returns how many entries moved.
   *
   * The post-session relabel renames the entries and the compiled skills'
   * `output:i<n>:<name>` bindings, and the flow export then binds every pinned
   * skill against THIS ledger (server.ts `knownValues`). A ledger still keyed
   * by the old name answers no renamed binding. grafana fwgr64: i1 reported
   * the host as `ref`, the relabel made it `grafana_host` in 07-report's skill
   * (v3's origin), the ledger kept `output:i1:ref`, bindSkill found no value
   * for v3 and refused the whole skill — so the export wrote 07-report with
   * no params at all, and both replays took the model and the compile
   * refused it as `unbound-pin`.
   */
  renameOutputs(step: string, renames: Readonly<Record<string, string>>): number {
    let moved = 0;
    this.entries = this.entries.map((e) => {
      const b = e.binding;
      if (b.from !== 'output' || b.step !== step || !renames[b.name] || renames[b.name] === b.name) return e;
      moved++;
      return { ...e, binding: { ...b, name: renames[b.name] } };
    });
    return moved;
  }

  /** Every entry, oldest first. */
  all(): LedgerEntry[] {
    return [...this.entries];
  }

  /**
   * The run's values keyed by their ORIGIN (bindingKey), so a param can bind
   * to where a value comes from — what compile is handed as `knownValues`.
   *
   * Two values can share an origin: one step's url showed `4` at `p1`, then
   * `bulkcheckout`, then `4` again. The origin's value is the one SEEN there
   * last. snipeit fwsi14-n1 02-create landed its asset (`/hardware/4`), clicked
   * through to `/hardware/bulkcheckout`, went back and ended on `/hardware/4`;
   * keyed by whichever was BANKED last, `url:i2:p1` read `bulkcheckout`, so
   * 03-open's `goto /hardware/4/edit` found no origin for its 4 and every
   * replay opened n1's asset. The flow publishes `{{02-create.url.p1}}` from
   * the step's end url; the latest sighting is that same value.
   */
  byOrigin(): Record<string, string> {
    const out: Record<string, string> = {};
    const at: Record<string, number> = {};
    for (const e of this.entries) {
      const key = bindingKey(e.binding);
      const when = this.sighted.get(e) ?? 0;
      if (key in out && at[key] > when) continue;
      out[key] = e.value;
      at[key] = when;
    }
    return out;
  }

  has(value: string): boolean {
    return this.seen.has(String(value ?? '').trim());
  }

  /**
   * THE predicate. Every producer that needs to know "does this string carry
   * something this run made?" asks here — compile's slot discovery, the flow
   * exporter's referencizing, the recorder's identity hints, the scanner.
   *
   * Longest first, so a value nested inside a longer one (a runid inside a
   * part name) does not shadow the more specific match.
   */
  runValuesIn(text: string): LedgerEntry[] {
    const s = String(text ?? '');
    if (!s) return [];
    return this.entries.filter((e) => !e.positional && occursAsToken(s, e.value)).sort((a, b) => b.value.length - a.value.length);
  }

  /** The values themselves, for callers that only need strings (identity hints). */
  values(opts: { basis?: LedgerEntry['basis'] } = {}): string[] {
    return this.entries.filter((e) => (opts.basis === undefined ? true : e.basis === opts.basis)).map((e) => e.value);
  }
}

/**
 * Whole-token occurrence, by the product's one boundary rule (shape.ts
 * `tokenPattern`): a word's '-' and '_' bind — "form" never matches inside
 * `o_form_view_group` (fwod5) — and a numeric value's split, so a runid
 * prefix in "x7-bench-dashboard" is a reference worth threading.
 */
export function occursAsToken(text: string, value: string): boolean {
  if (!value) return false;
  return tokenRe(value).test(text);
}

/** Every whole-token occurrence of `value` in `text` replaced — the same boundary rule as occursAsToken. */
export function replaceAsToken(text: string, value: string, replacement: string): string {
  if (!value) return text;
  return text.replace(tokenRe(value, 'g'), () => replacement);
}

/** The module's one boundary pattern (shape-gate pins tokenPattern to a single site here). */
function tokenRe(value: string, flags = ''): RegExp {
  return tokenPattern(value, flags);
}


/**
 * Fields whose CONTRACT is to hold the recording run's value: a param's
 * example, the provenance of the recording, a flow step's record of what it
 * observed. They are documentation, never replayed, and exempting them is
 * what keeps the scanner's output all signal.
 *
 * Deliberately NOT exempt, though both hold recorded text: `reportTemplate`
 * (a tier-A replay synthesises its report from it, so an unslotted value is
 * published as this run's answer) and `expect.urlPattern` (a replay checks
 * the live url against it).
 */
const EXEMPT = [/(^|\.)provenance(\.|$)/, /(^|\.)params\.[^.]+\.example$/, /(^|\.)derived\.[^.]+\.example$/, /(^|\.)recorded(\.|$)/, /(^|\.)stats(\.|$)/];

function exempt(path: string): boolean {
  return EXEMPT.some((re) => re.test(path));
}

/** One artifact carrying a run value verbatim. */
export interface Leak {
  /** Which artifact: "skill.template", "step 3 args.url", "flow 02-create.instruction". */
  where: string;
  value: string;
  binding: Binding;
  /** The entry's kind. Only an `identifier` leak can be fatal — see `fatal`. */
  kind: LedgerEntry['kind'];
  /** How sure we are of that kind. A `shape` verdict never refuses — see `fatal`. */
  basis: LedgerEntry['basis'];
  /** The surrounding text, trimmed, so a reader can see it in context. */
  context: string;
}

/**
 * Walk anything JSON-shaped and report every run value that survived
 * unslotted. This is an INSTRUMENT before it is a guard: what it actually
 * measures is ledger coverage, since a converter given a complete slot set is
 * a total function. Every one of the seven known defects was a recognition
 * gap, not a conversion error, and each cost a two-hour sweep plus a reading
 * of the drift files to find. This finds them in milliseconds.
 *
 * It can only report values it knows about, so it can never prove absence —
 * only ever "here are more".
 */
export function scanForLeaks(artifact: unknown, ledger: RunLedger, where = ''): Leak[] {
  const out: Leak[] = [];
  const walk = (node: unknown, path: string): void => {
    if (exempt(path)) return;
    if (typeof node === 'string') {
      for (const entry of ledger.runValuesIn(node)) {
        out.push({ where: path, value: entry.value, binding: entry.binding, kind: entry.kind, basis: entry.basis, context: node.slice(0, 160) });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(artifact, where);
  return out;
}

/** One line per leak, for a warning or a thrown error. */
export function describeLeaks(leaks: Leak[]): string {
  return leaks
    .map((l) => `  ${l.where}: ${JSON.stringify(l.value)} (${l.binding.from}) in ${JSON.stringify(l.context)}`)
    .join('\n');
}

/**
 * A leak whose value is KNOWN to be this run's, by evidence rather than
 * shape: a declared var, a url `id=` position, a value a later run watched
 * change. Every one of these is a replay acting on — or waiting for — the
 * recording's value. A `shape` leak may be page copy the run merely saw
 * ("Ready", the login email), and there are usually hundreds.
 *
 * The export lists these first and in full. fwrd45 printed "183 run value(s)
 * survived unslotted" with the first ten, all noise; the runid baked into
 * 06-change's expectations — which cost both replays 15 turns — was not
 * among them.
 */
export function evidenced(leak: Leak): boolean {
  return leak.basis !== 'shape';
}

/**
 * The identifiers a skill learned in a flow run's recovery would navigate to
 * that make it unfit to pin: an identifier this run read off a URL POSITION —
 * under this step's own instruction (`step`) or any earlier one — standing in
 * a navigation target (`args.url`). fwod45-n2's recovery navigated to `&id=22`,
 * the order its own 02-create had made; the old rule asked only about THIS
 * step's mints and pinned it.
 *
 * The basis no longer narrows it. It used to: an earlier instruction's
 * SHAPE-banked id was let through, because fwod19's odoo menu id
 * (`#action=123&menu_id=81`) looked minted and was a permanent app constant,
 * and demoting a skill over it costs a whole recording. That exemption is
 * bought and paid for upstream now — addUrlIds does not bank a digit run at a
 * query/state key the app does not call `id` at all, so fwod19's menu id never
 * reaches a leak — while the exemption's own cost went unpaid: fwgr41-n2's
 * recovery welded ITS OWN dashboard uid (a path segment, banked on shape under
 * an earlier instruction) into `goto /d/bfyd7wj0ceolcf/…`, the leak was
 * filtered out as shape-only, n3 pinned the skill, and it navigated to a
 * dashboard that no longer exists.
 *
 * What survives banking from a url position is a path/hash-path segment, an
 * `id=` position, or a value a run watched change — every one of them the app
 * saying "this is the record". A navigation to one of those is the recording's
 * record, whatever the ledger's confidence in the characters, so the skill is
 * demoted rather than pinned and the step re-learns a generic route.
 */
export function navigationLeaks(leaks: Leak[], step?: string): string[] {
  // `step` no longer narrows anything — this step's mints and an earlier
  // instruction's are both the recording's record — and is kept so callers
  // that name the minting instruction for diagnostics still typecheck.
  void step;
  return [...new Set(leaks.filter((l) => /args\.url/.test(l.where) && l.binding.from === 'url').map((l) => l.value))];
}

/**
 * Which leaks are fatal.
 *
 * A leak in a LOCATOR or a precondition acts on the wrong record silently:
 * the step resolves, the run continues, and nothing in the output says the
 * procedure moved. That is the failure this whole plan exists to stop, and it
 * is worth refusing an export over.
 *
 * Everywhere else the leak announces itself. A stale `expect.urlPattern`
 * fails its assertion loudly; a stale `reportTemplate` is caught at replay by
 * synthesizeReport, which refuses to publish a value this run did not
 * observe. Those stay warnings — blocking an export on a defect that is
 * already contained would only teach people to pass a --force flag.
 */
export function fatal(leak: Leak): boolean {
  // Only an IDENTIFIER. A run also reports text it merely observed — an error
  // heading, a status word — and a locator matching the app's own copy is
  // doing its job. Refusing an export over one of those trains people to
  // force past the gate, which costs more than the leak it caught.
  if (leak.kind !== 'identifier') return false;
  // ...and only in a LOCATOR, which is the silent case: the step resolves,
  // the run continues, and nothing says the procedure moved record.
  //
  // A precondition is loud. A stale urlPattern or requireText makes the skill
  // REFUSE — softUrlMatch may generalise it, requireText gates identity, and
  // either way the step falls to recovery and says so. Grafana's dashboards
  // put a minted uid in almost every precondition, so treating those as fatal
  // refused whole recordings for a defect that announces itself.
  //
  // A NAVIGATION TARGET was fatal here for one release cycle and is not any
  // more. The reasoning was sound -- fwgr11 went to
  // `/d/<run-1-uid>/{{runid}}-bench-dashboard` and a url is a locator for a
  // page -- but deciding it needs a judgement that cannot be made from one
  // run. fwod19 refused a clean 6/6 recording over
  //
  //   args.url: "123" in "http://127.0.0.1:8069/web#action=123&cids=1&menu_id=81"
  //
  // where 123 is Odoo's Discuss MENU id, present in the first post-login
  // navigation and identical on every run. looksLikeId("123") is true, so
  // the ledger banked a permanent app constant as a record this run made, and
  // the whole export died. No record-time discriminator survives contact with
  // it: the navigation that reveals 123 is a click, and the step before it is
  // the login fill, so neither "before the first mutation" nor "before the
  // run typed anything" separates it from a real minted uid.
  //
  // So the rule moved to bench/verify-artifacts.mjs, where a false positive
  // costs a look instead of a run. A gate may only enforce what a single run
  // can actually establish; see notes/PLAN-evidence-over-shape.md, which makes the
  // deferred version -- run 1 proposes, run 2 decides -- stage 1.
  // ...and only when something better than the token's spelling put it here.
  //
  // A fatal leak is the harshest verdict this tool reaches about a recording:
  // the step that replays the locator is unpinned, its skill is demoted out
  // of candidate selection, and the flow is flagged `needs-rerecord` (see
  // quarantineLeakedSteps). It used to be harsher still — the whole flow went
  // to `.rejected.json` and 20-50 minutes of babysitting plus real model spend
  // was gone. Either way a verdict that throws work away has to be met by
  // evidence, and `shape` is not evidence — it is the same regex that called
  // Odoo's menu id a record above.
  //
  // The reachable false refusal, with nothing exotic in it: an app shows a
  // constant catalogue code, the model reports it as a value, `looksLikeId`
  // sees a separator and a digit and kinds it `identifier`, and the step's
  // only locator is `getByRole('link', { name: 'SKU-4471' })` — a stable
  // locator that would have worked forever. stripLeakedCandidates cannot drop
  // it without emptying the chain, so it survives to here — and before
  // quarantine existed, it binned the run.
  //
  // Demoting shape to a warning does not leave the leak unattended: the flow
  // still exports with the leak listed, and stripLeakedCandidates still
  // deletes the candidate wherever the chain survives without it. What
  // changes is only the last-candidate case, which goes from "this step is
  // quarantined" to "this leak is reported".
  //
  // The gate is not permanently weaker, it is DEFERRED. A value a later run
  // demonstrates it lands differently on gets `basis: 'variance'` and refuses
  // again, with something behind it. Run 1 warns and strips; run 2 refuses.
  // That is PLAN-evidence-over-shape's "run 1 proposes, run 2 decides",
  // applied to the most expensive action the tool can take.
  if (leak.basis === 'shape') return false;
  return inLocator(leak);
}

/**
 * A run value sitting in a locator, whatever the ledger's confidence in it.
 *
 * The location half of `fatal`, on its own, because a REPORTER wants every
 * one of these and a GATE wants only the sure ones. bench/verify-artifacts.mjs
 * is the reporter: there a false positive costs a look, so it keeps flagging
 * shape-based leaks that no longer refuse an export.
 */
export function inLocator(leak: Leak): boolean {
  return /(^|\.)locators(\.|\[)/.test(leak.where);
}

/**
 * Slot or drop the run values the ledger KNOWS are this run's (`evidenced`)
 * that survived into a skill's `goal.requireText` and `reportTemplate` — the
 * export-time counterpart of dropping a locator's minted candidates.
 *
 * fwod47's export listed nine: s_010d93's goal waited for a marker naming the
 * recording's url `…&id=21`, and s_55a5e1/s_7dbdeb's report templates carried
 * `id=44` and `21`. A goal marker naming the recording's record is never shown
 * on a later run's record, so the skill can never be found already done — or,
 * where the recording's record survives, is found done on the wrong one. A
 * report template's literal is dropped by synthesizeReport as stale anyway, so
 * leaving it only keeps the leak in the artifact.
 *
 * Slotted when the value has an origin: a param whose `example` IS the value
 * and which carries a `binding` resolves to this run's value wherever
 * `{{vN}}` stands (goalSatisfied and synthesizeReport both fill params).
 * Otherwise the carrier goes: the marker, the template value, or the summary
 * (synthesizeReport falls back to its plain replay sentence). A goal left with
 * no marker is removed, which goalSatisfied already reads as "never done".
 *
 * Shape-only values are left alone: those are usually page copy, and dropping
 * a marker over a guess would weaken skills that were right — except a value
 * in `minted` (flow.ts textMints), which the recording shows the run minted
 * as page text and then named its record by. The ledger banks those on shape
 * (no url position carried them), and fwrd85 exported 02-create's goal as
 * `requireText ["RD-1015", …]`: a marker no later run's ticket shows. Pure;
 * returns null when nothing changed.
 */
export function slotKnownRunValues(skill: Skill, ledger: RunLedger, minted: ReadonlySet<string> = new Set()): { skill: Skill; changes: string[] } | null {
  const changes: string[] = [];
  const params = Object.entries(skill.params ?? {});
  // One string: every evidenced value in it slotted, or null when one has no origin.
  const rewrite = (text: string): { text: string; slotted: string[] } | null => {
    let out = text;
    const slotted: string[] = [];
    for (const entry of ledger.runValuesIn(text)) {
      if ((entry.basis === 'shape' && !minted.has(entry.value)) || !occursAsToken(out, entry.value)) continue;
      const param = params.find(([, p]) => p.binding && String(p.example ?? '').trim() === entry.value);
      if (!param) return null;
      out = replaceAsToken(out, entry.value, `{{${param[0]}}}`);
      slotted.push(`${JSON.stringify(entry.value)} → {{${param[0]}}}`);
    }
    return { text: out, slotted };
  };
  let goal = skill.goal;
  if (goal?.requireText?.length) {
    const kept: string[] = [];
    goal.requireText.forEach((marker, i) => {
      const r = rewrite(marker);
      if (!r) changes.push(`goal.requireText[${i}] dropped (names a value this run made, with no slot to bind it)`);
      else {
        if (r.slotted.length) changes.push(`goal.requireText[${i}] slotted ${r.slotted.join(', ')}`);
        kept.push(r.text);
      }
    });
    goal = kept.length ? { ...goal, requireText: kept } : undefined;
  }
  let reportTemplate = skill.reportTemplate;
  if (reportTemplate) {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(reportTemplate.values ?? {})) {
      const r = typeof v === 'string' ? rewrite(v) : { text: v, slotted: [] };
      if (!r) changes.push(`reportTemplate.values.${k} dropped (recorded literal of a value this run made)`);
      else {
        if (r.slotted.length) changes.push(`reportTemplate.values.${k} slotted ${r.slotted.join(', ')}`);
        values[k] = r.text;
      }
    }
    const s = typeof reportTemplate.summary === 'string' ? rewrite(reportTemplate.summary) : { text: reportTemplate.summary, slotted: [] };
    if (!s) changes.push('reportTemplate.summary dropped (narrates a value this run made)');
    else if (s.slotted.length) changes.push(`reportTemplate.summary slotted ${s.slotted.join(', ')}`);
    reportTemplate = { summary: s ? s.text : '', values };
  }
  if (!changes.length) return null;
  const next: Skill = { ...skill, ...(reportTemplate ? { reportTemplate } : {}) };
  if (goal) next.goal = goal;
  else delete next.goal;
  return { skill: next, changes };
}
