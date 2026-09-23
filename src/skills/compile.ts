import { isMutatingAction, mutatesSteps } from '../execution/lifecycle.js';
import type { LocatorCandidate, RecordedEntry, RecordedInstruction, RecordedStep, StepDiff } from '../daemon/recorder.js';
import type { Report } from '../agent/report.js';
import { contractFor, newSkillId, originOf, type Skill, type SkillParam, type SkillStep, type StepExpectation } from './store.js';
import { MIN_ID_LEN, digitDominant, looksLikeId, skeleton, tokenPattern } from './shape.js';
import { occursAsToken, replaceAsToken, unseenGotoParts } from './ledger.js';
import { WILDCARD, escapeRe, identityRe, maskVolatile } from '../shared/text.js';
import { CREDENTIAL_KEY, fillParamsDeep, queryPairs, safeDecode, urlParts, urlShapeOf } from '../execution/url.js';
import { contextsEqual, framesEqual, stepEffect } from '../execution/context.js';
import { collapseTogglePairs, dropSupersededSets } from './toggles.js';

/**
 * The url rules live in src/execution/url.ts, where a compiled artifact embeds
 * the same source the daemon runs. Re-exported here so no call site changes.
 */
export {
  fillParams,
  fillParamsDeep,
  isWildcardSeg,
  safeDecode,
  serializeShape,
  softUrlMatch,
  urlDiff,
  urlMatches,
  urlPart,
  urlParts,
  urlShapeOf,
  type UrlSegDiff,
  type UrlShape,
} from '../execution/url.js';
export { escapeRe } from '../shared/text.js';

/**
 * One thing the compiler did to the recording, and why.
 *
 * Every transform below deletes or rewrites steps the recording actually
 * made, on evidence that is never conclusive: a dialog that looked inert, a
 * navigation that looked superseded, two deletions that looked like
 * iteration. Until this existed the only way to see what had fired was to
 * recompile every published recording under two builds and diff the stores —
 * which is how the "the remaining modal" misreading was found, and it took
 * 23 rebuilds. A transformation that cannot say why it fired cannot be
 * reviewed.
 */
export interface TransformNote {
  /** The transform: foldLoops, dropDismissedDialogs, ... */
  name: string;
  /** 1-based index into the steps the transform was GIVEN. */
  at: number;
  reason: string;
}

/** Args whose string values are candidates for parameter slots. */
const VALUE_ARGS = new Set(['value', 'text', 'option', 'url', 'prompt_text']);

/** Steps whose recorded diff is a landing, not an effect (see expectationFor). */
export const NAVIGATION_TOOLS = new Set(['goto', 'back']);

/** Steps that enter a value and never navigate (see expectationFor's urlPattern). */
const VALUE_ENTRY_TOOLS = new Set(['fill', 'type']);

const MAX_ADDED_LINES = 5;
const MAX_SLOT_VALUES = 12;

export interface CompileInput {
  /** The `instruction` entry and every step recorded after it. */
  entries: RecordedEntry[];
  instruction: string;
  report: Report;
  session: string;
  model?: string;
  now?: string;
  /** When the instruction repaired a partly-failed replay, the skill it was replaying. */
  variantOf?: string;
  /**
   * Run-scoped values the caller declared or minted (flow vars, url
   * provenance), slotted by policy wherever they occur — see discoverSlots.
   * Keys are informational; only the values matter.
   */
  knownValues?: Record<string, string>;
  /**
   * The ledger step this very instruction banks under (`i2`): a `url:i2:…`
   * known value is one THIS recording minted, and where the compiled span
   * itself minted it, it is derived, never a param (ownUrlMints).
   */
  ownStep?: string;
  /**
   * Known values that are constants of the TASK, not of this run: an
   * instruction stated each one before the run had shown it (flow.ts
   * taskConstants, which needs the whole recording). They still slot like any
   * known value; they only never strand a locator (`runValues` below).
   */
  taskConstants?: string[];
  /**
   * Values the run minted as page text under an EARLIER instruction and has
   * addressed its record by since (flow.ts textMints, which needs the whole
   * recording). Wherever this recording carries one its instruction does not
   * name, it is a slot bound to the output that captured it — or a wildcard,
   * where no known value says which output that was. See textMintSlots.
   */
  mintedValues?: string[];
  /**
   * Everything the run recorded BEFORE this instruction, for the one question
   * this instruction's own entries cannot answer: had the run already shown a
   * value a goto navigates to (sourcelessGoto)? Absent means only this
   * instruction's entries and the known values are consulted.
   */
  before?: readonly RecordedEntry[];
}

/**
 * Turn one successful instruction's recording into a skill.
 *
 * Parameterisation is deliberately deterministic: any literal the agent typed
 * (fill/type/select/goto values) that also occurs as a whole token in the
 * instruction text becomes a slot, substituted everywhere it appears — step
 * args, locator names, expectations, the report. Values that do not occur in
 * the instruction stay literal: they are defaults the agent invented, which is
 * the right thing to replay and worth being able to see in `skills show`.
 *
 * Returns null when there is nothing replayable (no steps, or no origin).
 */
export function compileSkill(input: CompileInput): Skill | null {
  return compileSkills(input)[0] ?? null;
}

/** A popup container's line: replay's OPENER_LINE (replay imports this module, so it is restated, not imported). */
const POPUP_LINE = /^-?\s*(dialog|alertdialog|menu|menubar|listbox|tooltip)\b/;

/**
 * One instruction's entries, with the click that OPENED the popup its first
 * gesture acts in carried in front of its steps, when an earlier instruction
 * opened it and left it open.
 *
 * gitea fwgt1-n1: 03-set clicked the Labels picker (added `- listbox …`,
 * `- link "bug"`) and gave up with the menu still open; 04-set, issued on
 * that page, began by ticking `link "bug"` in it. Compiled from its own
 * entries, 04-set's procedure started with the tick, so every clean replay
 * (and the artifact) aimed at an item in a menu nothing had opened. Its
 * procedure needs the opener; the recording has it, one instruction back.
 *
 * Carried only on the recording's own evidence: the first state-changing
 * step names its target by role and name; that element is on the page this
 * instruction started on (startText, when recorded); the latest step of the
 * instruction just before whose diff ADDED it is a click that opened a popup
 * without leaving this instruction's page; nothing navigated after it; and
 * that instruction reported failure (a successful one's procedure ends with
 * the click itself, and one with no report, or a resume, is the same
 * instruction still in flight). Over every published recording (935
 * instructions) this fires once, on fwgt1-n1 04-set. Safe when the popup is open after
 * all: a click whose recorded effect is a popup already showing is skipped
 * as already in effect by replay (openerLines) and by the artifact alike,
 * because such pickers toggle. Not for a recording that replayed stored
 * steps (`via`): a variant's start is variantStart's to decide.
 */
export function carryOpener(before: readonly RecordedEntry[], entries: RecordedEntry[]): RecordedEntry[] {
  const head = entries[0];
  // A resume carries on its own attempt, which it is compiled with.
  if (head?.k !== 'instruction' || !head.url || head.resume) return entries;
  const steps = entries.filter((e): e is RecordedStep => e.k === 'step');
  if (steps.some((s) => s.via)) return entries;
  const first = steps.find((s) => isMutatingAction(s.tool));
  const role = first?.locators?.target?.chain?.find((c): c is Extract<LocatorCandidate, { kind: 'role' }> => c.kind === 'role');
  if (!role) return entries;
  const line = `- ${role.role} ${JSON.stringify(role.name)}`;
  const names = (l: string): boolean => l.trim() === line || l.trim().startsWith(`${line}:`) || l.trim().startsWith(`${line} [`);
  if (head.startText !== undefined && !head.startText.split('\n').some(names)) return entries;
  const page = pathOf(head.url);
  // Only the instruction just before this one: what it left open is what
  // this one began in (a line an older instruction added may have been on
  // the page for other reasons ever since).
  //
  // Walked past: an instruction that recorded no step and reported no
  // success. It did nothing to the page, so the one before it is still what
  // this one began in (gitea fwgt3-n1: 38 opened the Labels menu and died on
  // a model error, 49 recorded nothing, 50 began inside the menu).
  let spanHasStep = false;
  for (let k = before.length - 1; k >= 0; k--) {
    const e = before[k];
    if (e.k === 'instruction') {
      const closed = reportAfter(before, k);
      if (!spanHasStep && closed?.status !== 'success') continue;
      return entries;
    }
    if (e.k !== 'step') continue;
    spanHasStep = true;
    if (e.tool === 'goto' || e.tool === 'back' || e.effect) return entries;
    if (e.diff?.url && pathOf(e.diff.url) !== page) return entries;
    if (!e.diff?.added?.some(names)) continue;
    if (e.tool !== 'click' || !e.diff.added.some((l) => POPUP_LINE.test(l))) return entries;
    // An opening, not an arrival: the page it was clicked on is the page it
    // left open (a link that navigated here also "added" every line of it).
    if (pathOf(urlBefore(before, k) ?? '') !== page) return entries;
    // Left open by an instruction that reported failure — work that is not a
    // step of the flow, or one replayed model-first. A successful one's own
    // procedure ends with this click, so its replay leaves the popup open as
    // the recording did; one with no report is the same instruction still
    // in flight, compiled with it.
    if (!endedInFailure(before, k)) return entries;
    // The opener AND every gesture the dead instruction made after it on this
    // page: fwgt3-n1's 38 opened the menu and ticked "bug" before it died, so
    // 50 began with "bug" already ticked, and its own first click on "bug"
    // UNticked it. Carrying the opener alone left every replay one toggle
    // out: "succeeded" at tier A with the labels never applied. With the
    // tick carried too, the toggles net out as they did in the recording.
    const carried = before
      .slice(k, instructionEnd(before, k))
      .filter((s): s is RecordedStep => s.k === 'step' && (s === e || isMutatingAction(s.tool)))
      .map(({ via: _via, result: _result, ...step }) => step);
    return [head, ...carried, ...entries.slice(1)];
  }
  return entries;
}

/** The index just past the last entry of the instruction entries[k] ran under (its next non-resume instruction, or the end). */
function instructionEnd(entries: readonly RecordedEntry[], k: number): number {
  for (let j = k + 1; j < entries.length; j++) {
    const e = entries[j];
    if (e.k === 'instruction' && !e.resume) return j;
  }
  return entries.length;
}

/**
 * Whether the instruction entries[k] ran under ENDED without success: it
 * reported a non-success status, or it reported nothing and a new instruction
 * (a non-resume one, in `entries` or the one being compiled, which carryOpener
 * has already required not to be a resume) came after it. The daemon issues
 * the next instruction only once the previous `do` returned, so a missing
 * report is a `do` that died — fwgt3-n1's 38, on an LLM 400 — never one still
 * in flight. A resume continues the same instruction, whose report may follow.
 */
function endedInFailure(entries: readonly RecordedEntry[], k: number): boolean {
  for (let j = k + 1; j < entries.length; j++) {
    const e = entries[j];
    if (e.k === 'report') return e.status !== 'success';
    if (e.k === 'instruction' && !e.resume) return true;
  }
  return true;
}

/** Actions whose gesture can open a tab (agent/tools.ts POPUP_TOOLS). */
const POPUP_CAPABLE = new Set(['click', 'dblclick', 'modifier_click', 'press', 'select', 'check']);

/**
 * A step recorded on a page index no earlier step was on, with no recorded
 * page effect to explain the arrival, credits a popup to the nearest earlier
 * popup-capable action on the page it came from.
 *
 * ghost fwgh6-n1 step 63 clicked the post-published modal's card, which opens
 * the public post in a new tab. The tab arrived after the step's capture, so
 * the recording wrote no effect; steps 64 on ran on page 1, compile emitted no
 * popup, and pageIndexVerdict stopped every replay at 04-set step 2 ("recorded
 * on page 1 … the procedure is on page 0"). The compiled artifact watched the
 * tab open and never switched to it. The later steps' page index IS the
 * evidence of the popup: nothing else in the recording opens a page.
 *
 * Pure. The walk back from the first step on the new page stops, crediting
 * nothing, at a recorded effect (a popup, close or tabs switch already
 * explains the page change), at a navigation, and at a state-changing action
 * that cannot open a tab; it steps over observations (reads, screenshots),
 * which change no page.
 *
 * An EVAL is not an observation here: script can open a page itself. ghost
 * fwgh8-n1 03-publish clicked "Publish post, right now" (step 56), read the
 * url, then ran `eval window.open(publicUrl)`, and steps 59-64 ran on page 1.
 * The walk stepped over the eval and credited the popup to the Publish click,
 * so every replay waited for a tab the click never opens ("step 4 was
 * recorded opening a popup, and none opened"); n2 and n3 fell back and the
 * compiled script ran 0/1. So the walk stops at an eval and credits nothing,
 * and the steps that ran on the page only the eval opened — up to and
 * including the one that switched back — are DROPPED, with a note: compile
 * drops every eval (it assumes the record-time DOM and is fatal on replay),
 * so no replay can ever open that page, and a step that needs it can only
 * stop the procedure. Replaying the eval instead was considered and refused
 * for the same reason evals are dropped everywhere else; what those steps
 * did (fwgh8: read the public post) is an observation the procedure's own
 * reads and the flow's recovery answer, not a gesture it depends on.
 *
 * The credited popup carries no urlPattern:
 * the url it opened was never recorded, so both runners follow whatever tab
 * the action raises (context.ts armPageEffect). A step with no `page` was
 * recorded while one page was open (page 0), except a synthesized read-back,
 * which records no page at all and is skipped.
 */
export function creditUncreditedPopups(steps: readonly RecordedStep[], notes?: TransformNote[]): RecordedStep[] {
  const out = [...steps];
  const pageOf = (s: RecordedStep): number | undefined => (s.page !== undefined ? s.page : s.args.target === '(read-back)' ? undefined : 0);
  const seen = new Set<number>();
  /** Indices (into `steps`) of steps that ran on a page only an eval opened. */
  const unreachable = new Set<number>();
  for (let i = 0; i < out.length; i++) {
    const at = pageOf(out[i]);
    if (at === undefined) continue;
    if (at > 0 && !seen.has(at)) {
      let byEval = false;
      for (let j = i - 1; j >= 0; j--) {
        const s = out[j];
        const effect = stepEffect(s);
        if (effect && effect.kind !== 'navigate') break;
        if (s.tool === 'goto' || s.tool === 'back' || s.tool === 'tabs') break;
        const from = pageOf(s);
        if (from === at) break;
        if (s.tool === 'eval') {
          byEval = true;
          break;
        }
        if (POPUP_CAPABLE.has(s.tool) && from !== undefined) {
          out[j] = { ...s, effect: { kind: 'popup' } };
          break;
        }
        if (isMutatingAction(s.tool)) break;
      }
      if (byEval) {
        // The run on that page: every step recorded on it, and a page-less
        // read-back only when more of the run follows it.
        let end = i;
        for (let k = i; k < out.length; k++) {
          const p = pageOf(out[k]);
          if (p === at) end = k;
          else if (p !== undefined) break;
        }
        for (let k = i; k <= end; k++) unreachable.add(k);
        notes?.push({
          name: 'creditUncreditedPopups',
          at: i + 1,
          reason: `steps ${i + 1}-${end + 1} ran on page ${at}, which only an eval opened; no replay can open it, so they are dropped`,
        });
        i = end;
      }
    }
    seen.add(at);
  }
  return unreachable.size ? out.filter((_, k) => !unreachable.has(k)) : out;
}

/** Where the browser was just before entries[k] ran: the latest earlier diffed step's url, or its instruction's. */
function urlBefore(entries: readonly RecordedEntry[], k: number): string | undefined {
  for (let j = k - 1; j >= 0; j--) {
    const e = entries[j];
    if (e.k === 'step' && e.diff?.url) return e.diff.url;
    if (e.k === 'instruction') return e.url;
  }
  return undefined;
}

/** The report that closed the instruction entries[k] ran under, if it has one. */
function reportAfter(entries: readonly RecordedEntry[], k: number): Extract<RecordedEntry, { k: 'report' }> | undefined {
  for (let j = k + 1; j < entries.length; j++) {
    const e = entries[j];
    if (e.k === 'report') return e;
    if (e.k === 'instruction') return undefined;
  }
  return undefined;
}

/** A url's origin and path, the page it addresses (query and hash are view state). */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${decodeURIComponent(u.pathname)}`;
  } catch {
    return url;
  }
}

/**
 * Where a VARIANT's own procedure starts: the page its first step ran on,
 * after every step the recording replayed through a different stored skill
 * ahead of it (`dropped`, the steps compileSkills leaves to that skill). Walked
 * with the seam rules compileSkills splits by — a popup/close/switch moves to
 * `afterUrl`, a navigation that crosses a template takes the landing's
 * fingerprint and added lines, one inside a template only moves the url — so
 * the variant is gated on the page its steps were recorded on. With nothing
 * dropped, the instruction's own start (`dropped` 0) and nothing changes.
 */
export function variantStart(
  entries: RecordedEntry[],
  variantOf: string | undefined,
  slots: Map<string, string> = new Map(),
): { url: string; fingerprint?: number[]; startText?: string; startTextComplete?: boolean; dropped: number } {
  const head = entries.find((e): e is RecordedInstruction => e.k === 'instruction');
  const steps = entries.filter((e): e is RecordedStep => e.k === 'step');
  let at: { url: string; fingerprint?: number[]; startText?: string; startTextComplete?: boolean } = {
    url: head?.url ?? firstUrl(steps) ?? '',
    fingerprint: head?.fingerprint,
    startText: head?.startText,
    startTextComplete: head?.startTextComplete,
  };
  let dropped = 0;
  if (!variantOf) return { ...at, dropped };
  for (const step of steps) {
    if (!step.via || step.via.skill === variantOf) break;
    dropped++;
    if (step.effect && step.effect.kind !== 'navigate' && step.afterUrl) {
      at = { url: step.afterUrl, ...(step.fingerprintAfter ? { fingerprint: step.fingerprintAfter } : {}) };
      continue;
    }
    if (step.diff?.url && step.diff.url !== at.url) {
      const crossed = urlPattern(step.diff.url, slots, { query: false }) !== urlPattern(at.url, slots, { query: false });
      at = crossed
        ? {
            url: step.diff.url,
            ...(step.fingerprintAfter ? { fingerprint: step.fingerprintAfter } : {}),
            // The landing's ADDED lines are not the whole page: a goal read
            // against them would take text that was already there for new.
            ...(step.diff.added?.length ? { startText: step.diff.added.join('\n'), startTextComplete: false } : {}),
          }
        : { ...at, url: step.diff.url };
    }
  }
  return { ...at, dropped };
}

/** One recorded segment: the steps that ran on one page template. */
interface Segment {
  steps: RecordedStep[];
  startUrl: string;
  fingerprint?: number[];
  /**
   * What the page showed where this segment starts: the instruction-start
   * snapshot for segment 0, the seam step's added lines for the rest. The
   * evidence behind `preconditions.requireText` — see identityText().
   */
  startText?: string;
}

/**
 * Like compileSkill, but the recording is first split at page-template seams
 * — a step whose url PATTERN changed navigated to a different template — and
 * each segment compiles into its own skill, scoped to the page it runs on
 * (its own startUrl precondition and, when the recorder captured one, its own
 * fingerprint). The segments share one template and one slot set and are
 * linked by `seq`, so a caller binds params once and replay composes them;
 * each segment is independently replayable, recoverable, and promotable, so a
 * drift in one cannot cascade — the next segment refuses unless the page
 * matches its template. A recording that never changes template compiles to
 * exactly one skill, as before.
 */
export function compileSkills(input: CompileInput): Skill[] {
  const head = input.entries.find((e): e is RecordedInstruction => e.k === 'instruction');
  const steps = input.entries.filter((e): e is RecordedStep => e.k === 'step');
  if (!steps.length) return [];
  const startUrl = head?.url ?? firstUrl(steps);
  const origin = startUrl ? originOf(startUrl) : null;
  if (!origin || !startUrl) return [];

  const slots = discoverSlots(input.instruction, steps, input.knownValues);
  const textMinted = textMintSlots(input, steps, slots);
  const sub = (s: string) => substitute(s, textSlots);

  const reportValues = input.report.evidence?.values ?? {};
  // Inspection-only actions the agent used to ORIENT itself — probe the DOM with
  // `eval`, grab a `screenshot`, read a value it never reported — are not part of
  // the reproducible procedure. An `eval` is worse than noise: it assumes the
  // record-time DOM and, unlike a read (which replay skips on failure), it is
  // fatal, which is exactly what sent the sign-in and archive steps to recovery
  // on every replay. Keep the actions, the synthetic read-backs, and any read
  // whose value the run actually reported; drop the rest.
  /** What the recording-level passes dropped, noted on the first segment (built below). */
  const recordingNotes: TransformNote[] = [];
  const replayable = dropSupersededSets(collapseTogglePairs(expandListReads(creditUncreditedPopups(steps, recordingNotes), reportValues))).filter((step) => {
    if (step.tool === 'screenshot' || step.tool === 'eval') return false;
    if (step.tool === 'read' || step.tool === 'read_all') {
      return step.args.target === '(read-back)' || Boolean(readLabel(step, reportValues));
    }
    return true;
  });
  let kept = replayable.length ? replayable : steps;
  // A variant covers only the territory it repaired: steps that were replayed
  // via a DIFFERENT stored skill (an earlier segment completing cleanly) are
  // that skill's procedure, not this variant's.
  if (input.variantOf) kept = kept.filter((s) => !s.via || s.via.skill === input.variantOf);
  kept = sourcelessGoto(kept, input, recordingNotes);
  if (!kept.length) return [];
  // A url id this span minted is its OUTPUT: derived ({{dN}}, discoverMinted),
  // never a param — even when the ledger, which banked it before this compile,
  // handed it in as known. See ownUrlMints.
  for (const name of ownUrlMints(startUrl, steps, kept, slots, input.knownValues, input.ownStep)) slots.delete(name);
  /** Slots whose value the ledger banked from a url POSITION under an earlier
   *  instruction, each carrying the label it was banked at — the only slots
   *  substituteUrlId may write into a navigation arg's url, and only there. */
  const urlIdSlots = urlIdSlotPositions(slots, input.knownValues);
  const urlIdNames = new Set(urlIdSlots.map((s) => s.name));
  /** Every slot EXCEPT those, for a navigation url: a url-origin slot is
   *  written by position, never by matching its characters (see below). */
  const nonUrlIdSlots = new Map([...slots].filter(([n]) => !urlIdNames.has(n)));
  /** Every slot that may be written as a TOKEN in text: all but a url id
   *  below the text floor (ledger.ts pathDigitPart — snipeit fwsi2's
   *  `/hardware/4`), which is written only at its url position
   *  (substituteUrlId) and bound by origin, never matched in prose, a
   *  selector or a page line, where a lone digit stands everywhere. */
  const textSlots = new Map([...slots].filter(([, v]) => v.length >= 2));
  /** The url-origin slots written ONLY by position (not in textSlots). */
  const positionalUrlSlots = urlIdSlots.filter((u) => !textSlots.has(u.name));
  /** The caller's values for THIS run — a runid, a record it vouched for. */
  // Less the task's constants: a seeded user an instruction named before the
  // run showed it is the same on every run, so a locator naming it is no
  // stranded anchor (snipeit fwsi4 05-open, espocrm fwec3; see taskConstants).
  const constants = new Set(input.taskConstants ?? []);
  const runValues = Object.values(input.knownValues ?? {})
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length >= 3 && !constants.has(v));
  // …and so it STARTS where its first kept step did, not where the
  // instruction began: the steps dropped ahead of it moved the page. fwop2's
  // 01-signin replayed its chain's sign-in and welcome-dialog segments, the
  // projects-list segment stopped, and the repair was stored gated on
  // `/login` (the instruction's start) with a first step that clicks a
  // project in the signed-in projects list — a precondition no page it can
  // run on satisfies, and the compiled artifact then ran it on the login form.
  const start = variantStart(input.entries, input.variantOf, slots);
  const beginsAt = start.dropped ? start : { url: startUrl, fingerprint: head?.fingerprint, startText: head?.startText, startTextComplete: head?.startTextComplete };

  // Split at page-template seams. A step that navigated (diff.url) to a url
  // with a DIFFERENT pattern ends its segment; the recorder's fingerprintAfter
  // (when captured) becomes the next segment's precondition. However the page
  // changed: a goto or back is diffed like a click (tools.ts runStep), so its
  // landing gates the next segment. Before that a navigation never ended a
  // segment, which kept the gate observed BEFORE it for the steps AFTER it
  // (fwrd53 07-report asked a ticket list for the detail page's markers).
  const segments: Segment[] = [];
  let seg: Segment = {
    steps: [],
    startUrl: beginsAt.url,
    ...(beginsAt.fingerprint ? { fingerprint: beginsAt.fingerprint } : {}),
    ...(beginsAt.startText ? { startText: beginsAt.startText } : {}),
  };
  let currentUrl = beginsAt.url;
  for (const [ki, step] of kept.entries()) {
    seg.steps.push(step);
    // A goto the next step immediately navigates away from is no page the
    // procedure used: dropSupersededNavigation removes it from the segment,
    // which it can only do while the two share one.
    if (step.tool === 'goto' && kept[ki + 1]?.tool === 'goto') continue;
    // A step that opened a popup, closed its page or switched tabs moved the
    // procedure to ANOTHER page: a seam whatever the urls say, and the next
    // segment is gated on the page the procedure continues on.
    if (step.effect && step.effect.kind !== 'navigate' && step.afterUrl) {
      currentUrl = step.afterUrl;
      segments.push(seg);
      seg = { steps: [], startUrl: currentUrl, ...(step.fingerprintAfter ? { fingerprint: step.fingerprintAfter } : {}) };
      continue;
    }
    if (step.diff?.url && step.diff.url !== currentUrl) {
      const crossed = urlPattern(step.diff.url, slots, { query: false }) !== urlPattern(currentUrl, slots, { query: false });
      currentUrl = step.diff.url;
      if (crossed) {
        segments.push(seg);
        seg = {
          steps: [],
          startUrl: currentUrl,
          ...(step.fingerprintAfter ? { fingerprint: step.fingerprintAfter } : {}),
          ...(step.diff?.added?.length ? { startText: step.diff.added.join('\n') } : {}),
        };
      }
    }
  }
  if (seg.steps.length) segments.push(seg);

  // Provenance slots: values this run minted (first surfaced in a step's
  // post-nav url). Kept only where they can pay: a later step or a later
  // segment's start url mentions the value — otherwise the marker would just
  // blunt the minting step's own expectation for nothing.
  const mintedAll = discoverMinted(kept, beginsAt.url, slots);
  const minted = mintedAll.filter(
    (m) =>
      JSON.stringify(kept.slice(m.keptIndex + 1).map((s) => [s.args, s.locators, s.diff ?? null])).includes(m.value) ||
      segments.some((sg, si) => si > 0 && urlParts(sg.startUrl).some((p) => p.value === m.value)),
  );
  const mintedMap = (pred: (m: MintedValue) => boolean) => new Map(minted.filter(pred).map((m) => [m.name, m.value] as const));

  // Build every segment's steps first: slot retention is decided across the
  // WHOLE chain (a slot used only by segment 2 must stay in the shared
  // template, or binding an instruction to segment 1 would fail).
  let segOffset = 0;
  const built = segments.map((sg) => {
    const base = segOffset;
    segOffset += sg.steps.length;
    const segParams: Record<string, SkillParam> = {};
    for (const [name, value] of slots) segParams[name] = { example: value, usedIn: [] };
    // What each built step recorded, for transforms that must look past its expectation (dropDismissedDialogs).
    const recordedDiffs = new WeakMap<SkillStep, StepDiff>();
    const skillSteps: SkillStep[] = sg.steps.map((step, i) => {
      const g = base + i;
      // A minted value is a reference only DOWNSTREAM of its mint: in this
      // step's args/locators when minted strictly earlier, and in this step's
      // expectation when minted here or earlier (the minting step's own
      // post-nav url is the first downstream occurrence).
      const mintedBefore = mintedMap((m) => m.keptIndex < g);
      const mintedHere = mintedMap((m) => m.keptIndex <= g);
      const args = substituteDeep(substituteDeep(step.args, textSlots), mintedBefore) as Record<string, unknown>;
      // A navigation url is rebuilt from the RECORDED string, because a
      // url-origin slot may only be written at the position the ledger banked
      // it at. substitute() is textual and position-blind: it refuses a number
      // after `=` (the nth=25 guard), which is exactly where odoo carries its
      // record id — and it happily rewrites grafana's uid anywhere in the url,
      // slug included, which is the free-text rewrite this rule must not be.
      // So the positional writer gets the url, and every OTHER slot keeps the
      // textual pass (a url-origin value typed into a search box is still a
      // slot there, through `slots` above).
      if (typeof step.args.url === 'string' && urlIdSlots.length) {
        args.url = substituteUrlId(
          substituteDeep(substituteDeep(step.args.url, nonUrlIdSlots), mintedBefore) as string,
          urlIdSlots,
        );
      }
      // The same `=` guard hides a MINTED value in a navigation url: fwod32's
      // sign-in recorded `goto #action=135&menu_id=120` right after the step
      // that minted action=135 and menu_id=120, so every replay navigated to
      // the RECORDING run's action id. A minted value is rewritten at the
      // url position it was minted from, and nowhere else.
      if (typeof args.url === 'string') args.url = substituteUrlParts(args.url, minted.filter((m) => m.keptIndex < g));
      // A position-only slot inside an href a selector matches on is at a url
      // position too (substituteHrefIds, snipeit fwsi3 `a[href$="/hardware/4/checkout"]`).
      if (typeof args.target === 'string' && positionalUrlSlots.length) args.target = substituteHrefIds(args.target, positionalUrlSlots);
      const locators: Record<string, LocatorCandidate[]> = {};
      for (const [key, loc] of Object.entries(step.locators)) {
        const filled = (loc.chain ?? []).map((c) => {
          const out = substituteDeep(substituteDeep(c, textSlots), mintedBefore) as LocatorCandidate;
          return out.kind === 'css' && positionalUrlSlots.length ? { ...out, selector: substituteHrefIds(out.selector, positionalUrlSlots) } : out;
        });
        // An identity anchor still carrying THIS RUN's known value after
        // slotting (the recorded runid, because the value was typed in an
        // earlier instruction and so is not a slot here) can never match
        // again — and worse, with no {{marker}} it carries no identity, so
        // replay stops holding its fallbacks to the record and follows a
        // positional one onto whatever sorted into that row (fwrd12l 04-add,
        // 06-set). An anchor that cannot parameterise is not an anchor.
        // Never strand the whole chain: a step with no way at all to find its
        // element is worse than one carrying a candidate that will miss.
        // `stranded` DELETES: the ledger knows the run made that value, so the
        // candidate demonstrably cannot match another run. That is provenance,
        // not a guess.
        //
        // `bookmarked` only DEMOTES. It reads an id's shape, and shape is a
        // weak signal: grafana's ephemeral `_r8b_` matches none of our
        // id patterns while odoo's stable `o_form_view` hooks trip several. A
        // wrong deletion costs a working locator permanently; a wrong demotion
        // costs one failed count(), and two replays of evidence put it right
        // either way. So the shape rule sets the starting order and the
        // running tally decides — see recordCandidateEvidence.
        const usable = filled.filter((c) => !stranded(c, runValues));
        const ranked = [...usable].sort((a, b) => Number(bookmarked(a)) - Number(bookmarked(b)));
        const kept = stableFirst(ranked.length ? ranked : filled);
        // A READ that lost its anchor and can now only be found BY POSITION
        // must not publish. fwrd16-n3 is the cost of the alternative: the
        // read fell back to `tbody > tr:nth-of-type(1) > td`, resolved
        // instantly on a list whose first row was a seed ticket, and the step
        // published `ref: RD-1014` at tier A with zero turns — a confidently
        // wrong identity, which every later step then carried. Emptying the
        // chain makes replay SKIP the read (reads are observations; a missing
        // one is recoverable), so the value comes back absent, not wrong.
        const lostAnchor = filled.length !== kept.length && filled.some((c) => c.kind === 'scoped');
        const isRead = step.tool === 'read' || step.tool === 'read_all';
        locators[key] = isRead && lostAnchor && kept.every(positional) ? [] : kept;
      }
      const out: SkillStep = { tool: step.tool, args, locators };
      // Where each target lives and what the step did to its page travel
      // verbatim: a frame path names an iframe, not a record, so nothing in
      // it is slotted (a frame retitled per record fails closed at replay).
      const contexts: NonNullable<SkillStep['contexts']> = {};
      for (const [key, loc] of Object.entries(step.locators)) {
        if (loc.frame?.length && (key === 'target' || key === 'source')) contexts[key] = { frame: loc.frame };
      }
      if (Object.keys(contexts).length) out.contexts = contexts;
      if (step.page !== undefined) out.page = step.page;
      if (step.toggle) out.toggle = true;
      if (step.effect) {
        out.effect =
          step.effect.kind === 'popup' && step.afterUrl
            ? { kind: 'popup', urlPattern: urlPattern(step.afterUrl, slots, { query: false }) }
            : step.effect;
      }
      // Record-minting, from the evidence discoverMinted already gathered:
      // this step's post-nav url carried an identifier the run had not seen
      // before. Stored per step because a replay that stops needs to know
      // whether it is past the point of creation, not merely how far it got.
      const mintedHereOnly = mintedAll.find((m) => m.keptIndex === g);
      // `sole` rides along for a state key (newStateKeys): mintedAhead reads
      // only a key minted alone as the record this procedure creates.
      if (mintedHereOnly) out.mints = { at: mintedHereOnly.at, ...(mintedHereOnly.sole !== undefined ? { sole: mintedHereOnly.sole } : {}) };
      // Minted values go into the url-pattern reduction as slots: an id-like
      // one (odoo's "44", repair-desk's "t15") is otherwise reduced to `:id`
      // before the {{dN}} marker can land, and the minting step then carries
      // no reference to what it minted — so `derived` could not find it.
      const expect = expectationFor(step, new Map([...textSlots, ...mintedHere]));
      if (expect) out.expect = substituteDeep(expect, mintedHere) as StepExpectation;
      // A text mint with no origin to bind is the recording's record all the
      // same: a wildcard, never its literal (textMintSlots).
      if (out.expect?.addedContains && textMinted.wildcard.length) {
        out.expect.addedContains = out.expect.addedContains.map((l) => maskPublishedValues(l, textMinted.wildcard));
      }
      const label = readLabel(step, reportValues);
      // A read with no way to find its element again publishes nothing, so it
      // must not advertise the value either — publishedOutputs reads `label`,
      // and a promised output that never arrives sends later steps to
      // recovery with the reference blank.
      const targetless = step.tool === 'read' && step.args.what === 'url';
      if (label && (targetless || Object.values(locators).some((chain) => chain.length))) out.label = label;
      if (step.via) out.via = step.via;
      // Args and locators are use; expectations are NOT. Counting them (f24bdf9)
      // kept a slot the procedure never types — a price the recording saw in
      // a row, a uid in a post-save url — as a param bound by ORIGIN, and
      // bindSkill then refused the whole skill whenever that origin had not
      // been published (fwgr23 05-open, fwkb3-n3 03-create: tier null, 14-44
      // model turns). The orphan-marker hazard it was fixing is handled below
      // by re-inlining every dropped slot into the steps, expectations included.
      for (const name of slotsUsed(JSON.stringify({ args, locators }))) segParams[name]?.usedIn.push(i + 1);
      if (step.diff) recordedDiffs.set(out, step.diff);
      return out;
    });
    const mintedForStart = mintedMap((m) => m.keptIndex < base);
    const notes: TransformNote[] = [];
    const folded = foldLoops(
      coalesceControls(dropDismissedDialogs(dropSupersededNavigation(skillSteps, notes), notes, (s) => recordedDiffs.get(s)), notes),
      input.instruction,
      notes,
    );
    return { sg, segParams, mintedForStart, folded, notes, recordedDiffs };
  });

  // A recorded expectation must not freeze a value only THIS run could
  // produce. Decided here, over the whole recording, because both the
  // evidence and the damage are cross-step: what the procedure's reads
  // published (any step may hold the read) and which names the recording
  // watched change (two steps, by definition). See unfreezeExpectations.
  const published = publishedReadValues(kept, reportValues);
  // Every read the recording made, kept or not: the alert read back is
  // evidence of its lines whether or not the procedure keeps the read.
  const reads = recordedReadTexts(steps);
  for (const b of built) unfreezeExpectations(b.folded, published, b.notes, { reads, diffOf: (s) => b.recordedDiffs.get(s), slots });
  if (built.length) built[0].notes.unshift(...recordingNotes);

  // Derived-param metadata lands on the MINTING segment: which post-fold step
  // to bind from, and which url part to read there. Replay binds the value
  // from the live run's own url right after that step executes.
  const segDerived: Record<number, Record<string, { step: number; at: string; example: string }>> = {};
  for (const m of minted) {
    const si = segments.findIndex((sg, k) => {
      const start = segments.slice(0, k).reduce((a, s) => a + s.steps.length, 0);
      return m.keptIndex >= start && m.keptIndex < start + sg.steps.length;
    });
    if (si < 0) continue;
    const marker = `{{${m.name}}}`;
    const stepIdx = built[si].folded.findIndex((st) => JSON.stringify(st).includes(marker));
    if (stepIdx < 0) continue;
    (segDerived[si] ??= {})[m.name] = { step: stepIdx + 1, at: m.at, example: m.value };
  }

  // Drop slots no segment uses: instruction-only words (e.g. an id the
  // orchestrator mentioned for context) would only make matching harder.
  // EXCEPT known run values: a runid or threaded ref that appears only in the
  // wording still changes every run, so leaving it literal would make the
  // template single-run — bindSkill could never match run n+1's instruction.
  const knownVals = new Set(Object.values(input.knownValues ?? {}).map((v) => String(v ?? '').trim()));
  const usedNames = new Set<string>();
  for (const b of built) for (const [name, p] of Object.entries(b.segParams)) if (p.usedIn.length) usedNames.add(name);
  // A known value can be wholly swallowed by a longer slot (the bare runid
  // inside the ticket-title slot): its marker then appears nowhere, and a
  // param that can never bind makes bindSkill refuse the skill's own source
  // instruction. Keep a known-value slot only when its marker survives.
  const tentative = sub(input.instruction);
  // A declared var's slot is kept even when its marker survives only in
  // expectations: it binds by origin, and a var is supplied on every run (see
  // discoverSlots' varOnly — the reason the general rule excludes expectations
  // does not apply to it).
  const varValues = new Set(
    Object.entries(input.knownValues ?? {})
      .filter(([key]) => isVarOrigin(key))
      .map(([, v]) => String(v ?? '').trim()),
  );
  const keptSlots = new Map(
    [...slots].filter(([n, v]) => usedNames.has(n) || (knownVals.has(v) && tentative.includes(`{{${n}}}`)) || varValues.has(v) || textMinted.slotted.has(v)),
  );
  const finalTemplate = substitute(input.instruction, new Map([...keptSlots].filter(([n]) => textSlots.has(n))));
  // The mirror hazard: a slot whose marker survives only in STEPS (its every
  // instruction occurrence was swallowed by a longer slot, or the value came
  // from an EARLIER instruction and this one never names it) can never bind
  // from the template — bindSkill derives values from the template alone,
  // then requires every param to have one.
  //
  // If the run banked the value, the param binds to its ORIGIN instead: a
  // later run resolves its own from the same place, and the marker stays. Only
  // when the origin is unknown do we fall back to re-inlining the recorded
  // literal, which is the compromise that put the recording run's runid inside
  // an anchor's hasText and cost every replay a positional fallback
  // (fwrd19l 04-edit, on both replays, deterministically).
  const originOfValue = new Map(Object.entries(input.knownValues ?? {}).map(([key, v]) => [String(v ?? '').trim(), key]));
  const bindings = new Map<string, string>();
  const inTemplate = new Set(Array.from(finalTemplate.matchAll(/\{\{(v\d+)\}\}/g), (m) => m[1]));
  for (const [name, value] of [...keptSlots]) {
    // Every slot whose origin is known records it — the ones the template
    // can supply too. A re-pin onto this skill from another run rebinds its
    // slots by origin (remapParams); without the origin it could only guess
    // by value, and rpat2 guessed an earlier run's literal into a live run.
    const origin = originOfValue.get(value);
    if (origin) bindings.set(name, origin);
    if (inTemplate.has(name) || origin) continue;
    keptSlots.delete(name);
  }
  // Every slot that did not survive is re-inlined as its recorded literal —
  // in args, locators AND expectations. A dropped slot whose marker lingered
  // only in addedContains was an orphan {{vN}} that replay treated as a HARD,
  // unfillable line.
  for (const [name, value] of slots) {
    if (keptSlots.has(name)) continue;
    for (const b of built) b.folded = fillParamsDeep(b.folded, { [name]: value }) as SkillStep[];
  }

  const now = input.now ?? new Date().toISOString();
  const reportTemplate = {
    summary: sub(input.report.summary),
    values: Object.fromEntries(Object.entries(reportValues).map(([k, v]) => [k, sub(String(v))])),
  };
  // What the page shows once this procedure's work is done. Derived from the
  // recording's own before/after pair: report text that was NOT on the page
  // when the instruction began. See deriveGoal.
  const goal = deriveGoal({
    startText: beginsAt.startText,
    startTextComplete: beginsAt.startTextComplete,
    reportValues,
    seen: seenOnPage(steps),
    sub,
    // Single-segment only: startText is the page the instruction BEGAN on,
    // and only when no page-template seam was crossed is that the same page
    // the report read its values from. A confirm that started on the list
    // would otherwise take "Sales Order" — listed in Odoo's status bar before
    // the confirm as well — for its goal, and skip the step on a form.
    mutating: built.length === 1 && built.some((b) => mutatesSteps(b.folded)),
    // Identities, not states: anything the caller vouched for, anything the
    // run minted, and every slot's recorded value. "S00021" appearing in the
    // report is the record's NAME — it was equally true before the work.
    identities: new Set(
      [...knownVals, ...minted.map((m) => m.value), ...(input.mintedValues ?? []), ...slots.values()].map((v) => String(v ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean),
    ),
  });
  const of = built.length;
  const chain = of > 1 ? newSkillId(origin, finalTemplate, now) : null;

  return built.map((b, k) => {
    const params: Record<string, SkillParam> = {};
    for (const name of keptSlots.keys()) {
      const value = keptSlots.get(name) ?? '';
      params[name] = {
        ...b.segParams[name],
        ...(derivesFromKnown(value, knownVals) ? { known: true as const } : {}),
        ...(bindings.has(name) ? { binding: bindings.get(name) as string } : {}),
      };
    }
    return {
      id: newSkillId(origin, of > 1 ? `${finalTemplate}#${k}` : finalTemplate, now),
      origin,
      template: finalTemplate,
      params,
      preconditions: {
        // keptSlots, not slots: a dropped slot has no param to bind, and its
        // marker in the pattern would read as a wildcard segment.
        urlPattern: urlPattern(b.sg.startUrl, new Map([...keptSlots, ...b.mintedForStart])),
        ...(b.sg.fingerprint ? { fingerprint: b.sg.fingerprint } : {}),
        ...(identityOf(b.sg.startText, keptSlots, knownVals, writtenSlots(b.folded)).length
          ? { requireText: identityOf(b.sg.startText, keptSlots, knownVals, writtenSlots(b.folded)) }
          : {}),
      },
      // Only the LAST segment finishes the work, so only it can vouch for the
      // end state — an earlier segment carrying the goal would let a chain be
      // skipped from its head on evidence its tail produced.
      ...(k === of - 1 && goal ? { goal } : {}),
      steps: b.folded,
      ...(segDerived[k] ? { derived: segDerived[k] } : {}),
      // Only the last segment can vouch for the instruction's end state.
      ...(k === of - 1 ? { reportTemplate } : {}),
      // Stamped where the procedure is BORN, not in SkillStore.write: every
      // outcome recorded against a legacy procedure goes through write too,
      // so stamping there would quietly relabel an old file as current on its
      // first replay — laundering exactly the artifact the version exists to
      // hold apart.
      //
      // The contract is the one these steps NEED (store.ts contractFor): 4 for
      // a procedure that navigates (its gate placement), 3 for one that carries
      // frame or page context, which a build that cannot follow it must refuse
      // rather than resolve against the main page.
      contract: contractFor(b.folded),
      stats: { uses: 1, successes: 1, partial: 0, created: now, failedAtStep: {}, fallthroughs: 0, verifiedContract: contractFor(b.folded) },
      status: 'provisional' as const,
      ...(chain ? { seq: { chain, index: k, of } } : {}),
      ...(input.variantOf ? { variantOf: input.variantOf } : {}),
      provenance: {
        session: input.session,
        instruction: input.instruction,
        ...(input.model ? { model: input.model } : {}),
        created: now,
        ...(b.notes.length ? { transforms: b.notes } : {}),
      },
    };
  });
}

const MIN_GOAL_LEN = 3;
const MAX_GOAL = 4;

/**
 * The GOAL: what the page shows once this procedure's work is done.
 *
 * The evidence is the recording's own before/after pair — `startText` (what
 * the page showed when the instruction began) against the report's read-back
 * values (what it showed when the work was finished). A report line that was
 * NOT in `startText` is text the procedure BROUGHT INTO EXISTENCE, which is
 * exactly the signal "already done" needs: Odoo's status bar lists every
 * reachable state, so "Sales Order" is showing whether or not the order was
 * cancelled, while "Cancelled" is listed only once it was.
 *
 * Everything here is a filter against FALSE POSITIVES, because a false
 * positive skips work that never happened while a false negative merely runs
 * the step as before:
 *  - text already in `startText` is not evidence of anything (it was true
 *    before);
 *  - an identity — a caller-vouched value, a minted id, a slot's recorded
 *    literal — names the RECORD, not its state, and is equally true before
 *    and after;
 *  - a line that still carries a `{{slot}}` after substitution cannot be
 *    checked against a live page without guessing what fills it;
 *  - and no startText, no report values, or a read-only procedure means no
 *    goal at all. Never guess one;
 *  - nor from a startText that is not the whole page (cut at its budget, or
 *    taken by a look that could not cover the page): text missing from it was
 *    never shown to be missing from the page, and "Sales Order" cut off the
 *    end of a long start page would read as brought into existence.
 */
function deriveGoal(opts: {
  startText: string | undefined;
  startTextComplete?: boolean;
  reportValues: Record<string, unknown>;
  /** What this instruction's steps saw on the page, folded (seenOnPage). */
  seen: readonly string[];
  sub: (s: string) => string;
  mutating: boolean;
  identities: Set<string>;
}): { requireText: string[] } | null {
  if (!opts.mutating || !opts.startText || opts.startTextComplete === false) return null;
  const before = opts.startText.replace(/\s+/g, ' ').toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of Object.values(opts.reportValues)) {
    for (const rawLine of String(raw ?? '').split('\n')) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (line.length < MIN_GOAL_LEN) continue;
      if (!/[A-Za-z]/.test(line)) continue; // digits and punctuation are ids and counts, not states
      if (before.includes(line.toLowerCase())) continue;
      if (opts.identities.has(line)) continue;
      if (!sawOnPage(line, opts.seen)) continue;
      const subbed = opts.sub(line);
      if (subbed.includes('{{')) continue;
      if (seen.has(subbed.toLowerCase())) continue;
      seen.add(subbed.toLowerCase());
      out.push(subbed);
      if (out.length >= MAX_GOAL) return { requireText: out };
    }
  }
  return out.length ? { requireText: out } : null;
}

/**
 * Every text this instruction's own steps saw APPEAR on the page, in the line
 * dialect the already-satisfied guard reads (goalSatisfied): each line a
 * step's diff added and each alert it raised, folded (whitespace collapsed,
 * lower-cased). A goal marker must stand in one of these (sawOnPage), never
 * be only the report's own wording.
 *
 * gitea fwgt1-n1: 04-set reported `labels_displayed_count: "2 (no other
 * labels, no \"No labels\" placeholder)"` and 05-set `milestone_shown_on_
 * issue_sidebar: "not set (not modified in this instruction)"` — prose no
 * start page carried, so both became goal markers. goalSatisfied requires
 * every marker and no page ever shows those sentences, so the already-
 * satisfied guard (fwod34) could never fire for either step.
 *
 * Not what a READ returned (fwgt2-n1): 04-open's goal came out
 * `["yes","No labels","bug","priority-high"]` — "No labels" from the
 * recording's own labels-BEFORE read (startText, a role-line outline, never
 * carries a placeholder's plain text, so it looked brought into existence),
 * "yes" from a read-back pinned to a "Yes" button. A read says what the page
 * held at some moment, not that the work put it there, and plain text is not
 * the dialect the guard matches. A goal known only from a read is no goal,
 * which only means the step runs.
 */
function seenOnPage(steps: readonly RecordedStep[]): string[] {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(add);
    if (typeof v !== 'string') return;
    for (const line of v.split('\n')) {
      const f = line.replace(/\s+/g, ' ').trim().toLowerCase();
      if (f) out.add(f);
    }
  };
  for (const s of steps) {
    add(s.diff?.added ?? []);
    add(s.diff?.alerts ?? []);
  }
  return [...out];
}

/** A report line the page showed: it stands, as a whole token run, in something a step saw. */
function sawOnPage(line: string, seen: readonly string[]): boolean {
  const f = line.replace(/\s+/g, ' ').trim().toLowerCase();
  return seen.some((s) => occursAsToken(s, f));
}

const MIN_IDENTITY_LEN = 4;
const MAX_IDENTITY = 2;

/**
 * Which caller-vouched values the page ALREADY showed where this segment
 * starts — the segment's identity precondition, as slot markers so replay
 * checks the live run's own values.
 *
 * Only known values qualify (the runid, a threaded ref, url provenance): they
 * are the ones that name the record the caller means, and a value the
 * compiler merely inferred from repeated text could easily be page furniture.
 * A value the segment is about to TYPE is not on the page yet, so it never
 * qualifies either — which is what keeps this from refusing a create step.
 */
/**
 * Caller-vouched, or built out of something the caller vouched for: the
 * ticket TITLE ("r9-n2 RD Bench Ticket") is as run-scoped as the runid inside
 * it, and it is usually the title — not the bare runid — that survives as a
 * slot, because the longer value swallows the shorter one. Treating only the
 * exact known value as identity would therefore lose identity on exactly the
 * skills that need it.
 */
function derivesFromKnown(value: string, known: Set<string>): boolean {
  if (known.has(value)) return true;
  for (const k of known) {
    if (k.length < 3 || k.length === value.length) continue;
    if (tokenPattern(k).test(value)) return true;
  }
  return false;
}

/**
 * A known-value key that names a DECLARED VAR — `var:runid`, as bindingKey
 * spells it. The flow runner passes its vars to a recovery's compile in the
 * same form, so this is the one spelling to test for.
 */
export function isVarOrigin(key: string): boolean {
  return key.startsWith('var:');
}

function identityOf(startText: string | undefined, slots: Map<string, string>, known: Set<string>, written: ReadonlySet<string> = new Set()): string[] {
  if (!startText) return [];
  const out: string[] = [];
  for (const [name, raw] of slots) {
    if (out.length >= MAX_IDENTITY) break;
    // A value this segment itself SETS is the record's state, not its name:
    // the page shows it before the work only because it is the setting being
    // changed, and the next run (or a stale view) can show any other value on
    // the very same record. See writtenSlots.
    if (written.has(name)) continue;
    // Whitespace is not identity. fwkb3 published a column name as "Backlog "
    // (trailing space, copied from the header's text), the slot became a
    // requireText marker, and every replay refused the create step because
    // the live page showed "Backlog" — the same word.
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!derivesFromKnown(raw, known) || value.length < MIN_IDENTITY_LEN || /^https?:/i.test(value)) continue;
    // The same bounded rule replay will apply (identityRe). If compile minted a
    // marker on a plain substring hit, it could mint one whose only appearance
    // was INSIDE a longer token — a marker the tightened replay gate can never
    // satisfy. Upstream of both runners, so it has to move with them.
    if (!identityRe(value).test(startText.replace(/\s+/g, ' '))) continue;
    out.push(`{{${name}}}`);
  }
  return out;
}

/** Roles whose element IS a value choice: clicking one sets state to its name. */
const VALUE_CHOICE_ROLES = new Set(['option', 'menuitemradio', 'menuitemcheckbox', 'radio', 'checkbox', 'switch']);

/**
 * The slots whose value these steps WRITE into the application: typed or
 * filled as a field's content, chosen as a select option, or named by the
 * option, radio or checkbox a click or check sets. Such a value is state, and
 * identityOf never makes it an identity marker — fwgr39's 05-set procedure was
 * the shape (a refresh interval picked from a menuitemradio named by its slot),
 * and a marker on a setting refuses the right record the moment the setting
 * reads differently.
 *
 * A marker counts only when it is the WHOLE value set: a field typed as
 * "Notes for {{v2}}" writes a value that merely contains the runid, which
 * still names the record. What the steps only look at or navigate by stays
 * eligible — a click on a link, row or button named by the slot opens that
 * record, it does not change it — and so does text typed into a search box,
 * which finds a record rather than editing one.
 */
function writtenSlots(steps: readonly SkillStep[]): Set<string> {
  const out = new Set<string>();
  const whole = (value: unknown) => {
    const m = typeof value === 'string' ? /^\s*\{\{(v\d+)\}\}\s*$/.exec(value) : null;
    if (m) out.add(m[1]);
  };
  const chain = (step: SkillStep) => (step.locators?.target ?? []) as LocatorCandidate[];
  const searching = (step: SkillStep) =>
    chain(step).some((c) => (c.kind === 'role' && c.role === 'searchbox') || (c.kind === 'css' && /type=["']?search\b|role=searchbox\b/i.test(c.selector)));
  // `role=option[name="{{v8}}"]` as a raw selector names the option as surely as a role candidate does.
  const roleSelector = (selector: string) => /^\s*role=(\w+)\s*\[\s*name\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(selector);
  const choices = (step: SkillStep, all: boolean) => {
    for (const c of chain(step)) {
      if (c.kind === 'role' && (all || VALUE_CHOICE_ROLES.has(c.role))) whole(c.name);
      else if (all && c.kind === 'label') whole(c.label);
      else if (all && c.kind === 'text') whole(c.text);
      else if (c.kind === 'css') {
        const m = roleSelector(c.selector);
        if (m && (all || VALUE_CHOICE_ROLES.has(m[1]))) whole(m[2]);
      }
    }
    if (typeof step.args.target === 'string') {
      const m = roleSelector(step.args.target);
      if (m && (all || VALUE_CHOICE_ROLES.has(m[1]))) whole(m[2]);
    }
  };
  const visit = (list: readonly SkillStep[]) => {
    for (const step of list) {
      if (step.body) visit(step.body);
      switch (step.tool) {
        case 'fill':
          if (!searching(step)) whole(step.args.value);
          break;
        case 'type':
          if (!searching(step)) whole(step.args.text);
          break;
        case 'select':
          whole(step.args.option);
          break;
        // A check's argument is its target: the checkbox or radio named by the
        // slot is the option being set, whatever role the recorder gave it.
        case 'check':
          choices(step, true);
          break;
        case 'click':
        case 'dblclick':
        case 'right_click':
        case 'modifier_click':
          choices(step, false);
          break;
      }
    }
  };
  visit(steps);
  return out;
}

const MAX_MINTED = 8;

interface MintedValue {
  name: string;
  value: string;
  /** Index into the kept-steps array of the step whose post-nav url minted it. */
  keptIndex: number;
  /** Which url part carried it (urlParts label), for live re-extraction. */
  at: string;
  /**
   * For a state key (`q.*`): whether it was the ONLY state key the minting
   * step's url gained over the url it acted on. See newStateKeys.
   */
  sole?: boolean;
}

/**
 * The query and hash-state keys `after` carries that `before` did not.
 *
 * A key minted ALONE is the fwod66 save shape: `…view_type=form` became
 * `…&id=44`, the one thing the step added being the record it made. Several
 * at once is a navigation filling in its state, not a creation: odoo fwod78's
 * login landed on `/web#cids=1` before Odoo wrote its default action into the
 * hash, and the next click (the app switcher) coincided with the hash filling
 * in `action=123&menu_id=81`. discoverMinted took `q.action` for a mint, and
 * mintedAhead then refused every replay — whose login had already landed on
 * the full url — as "past its start" (01-open fell back on n2 and n3; the
 * compiled script died on the same refusal).
 */
function newStateKeys(before: string, after: string): string[] {
  const b = urlShapeOf(before);
  const a = urlShapeOf(after);
  if (!b || !a) return [];
  const had = new Set([...b.query.keys(), ...b.hashState.keys()]);
  return [...new Set([...a.query.keys(), ...a.hashState.keys()])].filter((k) => !had.has(k));
}

/**
 * Mechanism-1 provenance (PLAN-replay-v2): values the run itself minted. A
 * url part that first appears in a step's post-navigation url — absent from
 * the start url, every earlier url, the caller's slot values and everything
 * the agent typed — was created by this run (a fresh record id, a generated
 * uid). Every later occurrence is downstream of that step's outcome, so it
 * becomes a {{dN}} reference bound at replay time from where the browser
 * actually lands — the same mechanism as discoverSlots, with a new value
 * source, and the same guards: id-shaped, whole-value match, first
 * appearance wins.
 */
function discoverMinted(kept: RecordedStep[], startUrl: string, slots: Map<string, string>): MintedValue[] {
  const seen = new Set<string>(urlParts(startUrl).map((p) => p.value));
  const slotVals = new Set(slots.values());
  const out: MintedValue[] = [];
  /** The url each step acted on: the latest diffed url before it, else the start. */
  let acted = startUrl;
  kept.forEach((step, i) => {
    const before = acted;
    if (step.diff?.url) acted = step.diff.url;
    // Values the agent TYPED are inputs, not mints, wherever they surface later.
    for (const v of Object.values(step.args)) if (typeof v === 'string') seen.add(v);
    // A navigation's landing names the page it was SENT to, not a record it
    // made; it was never diffed before, and minting from it is not proposed.
    if (!step.diff?.url || NAVIGATION_TOOLS.has(step.tool)) return;
    const gained = newStateKeys(before, step.diff.url);
    for (const part of urlParts(step.diff.url)) {
      const v = part.value;
      const fresh = !seen.has(v);
      seen.add(v);
      // Position is evidence. A bare "44" free in prose means nothing, which is
      // why the ledger keeps a length floor — but "44" sitting in a url part
      // is a record id, and the shape rule already says so for url-pattern
      // generalisation. Requiring 4 characters here contradicted that: odoo's
      // record ids are two-digit integers, so fwod15 compiled ZERO minting
      // steps and the whole `mints` mechanism was inert on that target.
      //
      // Same shape as the two floor mismatches already fixed today ("t15"
      // below looksLikeId's floor; url parts published at >= 4 while
      // buildFlow minted refs at >= 3). Three separate thresholds asking one
      // question, disagreeing three times. This one now asks the question the
      // url code already answers.
      if (!fresh || !looksLikeId(v, 'first-run') || slotVals.has(v) || /\{\{/.test(v)) continue;
      // A stable route word ("tickets", "dashboards") also first appears in a
      // post-nav url once; claiming it would wildcard preconditions that
      // should stay exact. Requiring a digit is a heuristic, but one whose
      // being wrong costs a soft-match comparison (mechanism 2 still catches
      // a digitless minted id), not a dead flow.
      if (!/\d/.test(v)) continue;
      if (out.length >= MAX_MINTED) continue;
      const sole = part.label.startsWith('q.') ? gained.length === 1 && gained[0] === part.label.slice(2) : undefined;
      out.push({ name: `d${out.length + 1}`, value: v, keptIndex: i, at: part.label, ...(sole !== undefined ? { sole } : {}) });
    }
  });
  return out;
}

/**
 * Text mints (flow.ts textMints) this recording CARRIES without its
 * instruction naming them: in what a step typed or located by, a page change
 * or alert it recorded, or what the report said. Each one with an origin in
 * the known values becomes a slot here, appended after discoverSlots' own
 * (their names do not move), bound to that origin by the usual `bindings`
 * pass and kept however it is used (`slotted`). One with no origin is
 * returned for the wildcard (`wildcard`).
 *
 * fwrd85 09-report is the case: its instruction names only the runid, yet
 * showing archived tickets recorded `- cell "RD-1015"`, and the report quoted
 * the row, so the expectation and the published `archived_search_result` both
 * froze the recording's ticket. As a slot bound to
 * `output:i2:ticket_reference` the flow binds it to
 * `{{02-create.ticket_reference}}`, which every replay's 02-create reads live
 * (RD-1016 on n2, RD-1017 on n3), and the report template fills from it.
 *
 * This is the output-bound slot that discoverSlots' varOnly refuses to mint
 * from expectations (fwgr23, fwkb3-n3: bindSkill refuses the whole skill when
 * the output goes unpublished). A text mint is different by construction: an
 * instruction since its mint has named it, so the flow already depends on that
 * output being published for an earlier step, and this adds no new way to
 * fail. A value only a report or expectation carried with no known origin
 * still gets the wildcard, never the literal.
 */
function textMintSlots(input: CompileInput, steps: readonly RecordedStep[], slots: Map<string, string>): { slotted: Set<string>; wildcard: string[] } {
  const slotted = new Set<string>();
  const wildcard: string[] = [];
  if (!input.mintedValues?.length) return { slotted, wildcard };
  const known = new Set(Object.values(input.knownValues ?? {}).map((v) => String(v ?? '').trim()));
  const carried = JSON.stringify([
    steps.map((s) => [s.args, s.locators, s.diff?.added ?? [], s.diff?.alerts ?? [], s.diff?.url ?? '']),
    input.report.summary,
    input.report.evidence?.values ?? {},
  ]);
  const taken = new Set(slots.values());
  for (const raw of input.mintedValues) {
    const value = String(raw ?? '').trim();
    if (value.length < 2 || taken.has(value) || occursAsToken(input.instruction, value) || !occursAsToken(carried, value)) continue;
    taken.add(value);
    if (!known.has(value)) {
      wildcard.push(value);
      continue;
    }
    slots.set(`v${slots.size + 1}`, value);
    slotted.add(value);
  }
  return { slotted, wildcard };
}

/**
 * A kept `goto` to a record the run had never shown (ledger.ts unseenGotoParts,
 * less the known values) has no source in the procedure: the model read the
 * address off the page by a step compile drops, so the literal url aims every
 * replay at the RECORDING's record.
 *
 * snipeit fwsi7: 02-create saved the asset, ran an `eval` for the "Click here
 * to view" link's href, and went `goto /hardware/4`. Compile dropped the eval
 * and stored s_5dcb48 = `goto /hardware/4`; n2 and n3 stopped on it (their
 * assets were 5 and 6), and n3's re-pin copied it into the artifact, which died
 * there. fwsi6 had clicked the link, which replays.
 *
 * So, in order:
 *  - the click it stands for, when the recorder saw exactly one visible link
 *    on the page carrying that href (RecordedStep.linkedFrom). The click lands
 *    the live record, as fwsi6's did; its candidates that spell the recorded
 *    address go, since they name the recording's record;
 *  - otherwise the procedure ENDS before it: nothing in the recording says how
 *    to reach the record, and a stopped replay costs a recovery turn where a
 *    literal costs the wrong record. The goto is not slotted from its own
 *    landing — the value is only known once the navigation it would supply
 *    has happened.
 */
function sourcelessGoto(kept: RecordedStep[], input: CompileInput, notes: TransformNote[]): RecordedStep[] {
  const known = new Set(Object.values(input.knownValues ?? {}).map((v) => String(v ?? '').trim()));
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    if (s.tool !== 'goto' || typeof s.args.url !== 'string') continue;
    const before = [...(input.before ?? []), ...input.entries.slice(0, Math.max(0, input.entries.indexOf(s)))];
    const unseen = unseenGotoParts(s.args.url, before).filter((p) => !known.has(p.value));
    if (!unseen.length) continue;
    const click = linkClick(s);
    if (click) {
      notes.push({ name: 'sourcelessGoto', at: i + 1, reason: `goto ${s.args.url} reached a record nothing had shown; replayed as a click on the link that carried it` });
      kept = [...kept.slice(0, i), click, ...kept.slice(i + 1)];
      continue;
    }
    notes.push({
      name: 'sourcelessGoto',
      at: i + 1,
      reason: `goto ${s.args.url} reached a record nothing had shown (${unseen.map((p) => `${p.label}=${p.value}`).join(', ')}) and no step supplies it; the procedure ends before it`,
    });
    return kept.slice(0, i);
  }
  return kept;
}

/** A goto recorded with the link that carried its href, as a click on that link (see sourcelessGoto). */
function linkClick(s: RecordedStep): RecordedStep | null {
  const url = String(s.args.url);
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const spells = (c: LocatorCandidate): boolean => {
    const t = JSON.stringify(c);
    return t.includes(url) || (path.length > 1 && occursAsToken(t, path));
  };
  const chain = (s.linkedFrom?.chain ?? []).filter((c) => !spells(c));
  const named = chain.find((c): c is Extract<LocatorCandidate, { kind: 'role' }> => c.kind === 'role' && Boolean(c.name));
  if (!named) return null;
  const { linkedFrom: _link, ...rest } = s;
  return {
    ...rest,
    tool: 'click',
    args: { target: `role=${named.role}[name=${JSON.stringify(named.name)}]` },
    locators: { target: { expr: s.linkedFrom?.expr ?? '', verified: Boolean(s.linkedFrom?.verified), raw: '', chain } },
  };
}

/**
 * The slots holding a url id THIS instruction minted inside the span being
 * compiled: a `url:<ownStep>:…` known value that first appears in a kept
 * step's post-action url (not a navigation's landing) — absent from the url
 * the instruction began on, from every url and argument before it (the
 * steps ahead of the span included, and the PARTS of every navigation's
 * url), and never typed. That step made the record; every later occurrence
 * is downstream of it, which is what discoverMinted's {{dN}} is for.
 *
 * espocrm fwec1-n2: the recovery of adopted 02-create saved the opportunity
 * (`#Opportunity/create` → `#Opportunity/view/6ab1b0e3…`) and then went back
 * to it by `goto`. The flow runner banks what a recovery minted BEFORE the
 * re-pin compile (server.ts), and keeps own url ids in the compile's known
 * values (ledger.ts withoutOwnOutputs, for fwgr41), so the id became slot
 * `v6` bound to `url:i2:h2` — and `i2` IS 02-create. The re-pin bound it as
 * `{{02-create.url.h2}}`, a step's param fed by its own output: n3 stopped
 * with that reference unresolved, and the compiled script died on it. n1's
 * own compile of the same save had derived it (`view/{{d1}}`).
 *
 * Only this instruction's own ids: a url id an EARLIER step banked that this
 * span lands on by a click (a list row opening the record 02-create made)
 * is the record the step was TOLD to act on, and stays a slot bound to that
 * step. And only an id minted inside the span: one minted by steps a variant
 * leaves to another skill reaches the span as an input (fwgr41's goto), and
 * stays a slot as before.
 */
function ownUrlMints(
  startUrl: string,
  steps: readonly RecordedStep[],
  kept: readonly RecordedStep[],
  slots: ReadonlyMap<string, string>,
  known: Record<string, string> = {},
  ownStep?: string,
): string[] {
  if (!ownStep) return [];
  const own = new Set(Object.entries(known).filter(([k]) => k.startsWith(`url:${ownStep}:`)).map(([, v]) => v));
  if (!own.size) return [];
  const seen = new Set<string>(urlParts(startUrl).map((p) => p.value));
  const saw = (s: RecordedStep): void => {
    for (const v of Object.values(s.args)) {
      if (typeof v !== 'string') continue;
      seen.add(v);
      if (s.args.url === v) for (const p of urlParts(v)) seen.add(p.value);
    }
  };
  const head = kept[0] ? steps.indexOf(kept[0]) : -1;
  for (const s of steps.slice(0, Math.max(0, head))) {
    saw(s);
    if (s.diff?.url) for (const p of urlParts(s.diff.url)) seen.add(p.value);
  }
  const minted = new Set<string>();
  for (const s of kept) {
    saw(s);
    if (!s.diff?.url) continue;
    for (const p of urlParts(s.diff.url)) {
      if (!seen.has(p.value) && !NAVIGATION_TOOLS.has(s.tool) && own.has(p.value)) minted.add(p.value);
      seen.add(p.value);
    }
  }
  return [...slots].filter(([, v]) => minted.has(v)).map(([name]) => name);
}

/**
 * Literal values the agent used that also appear as whole tokens in the
 * instruction. Ordered by first occurrence in the instruction, longest match
 * first when values nest ("x7 RD Part A" before "x7").
 *
 * `known` are run-scoped values the CALLER vouches for — declared flow vars
 * (the runid) and minted url-provenance parts. They are slotted by policy,
 * not heuristics: every occurrence in the instruction, args, and locators is
 * the same value playing the same role by construction, so the
 * single-occurrence guard below does not apply to them (unlike admin/admin,
 * where one string served two different roles). This is what keeps a run
 * identifier out of a compiled skill: fwrd3 baked "fwrd3-n1"/"RD-1015" into
 * templates and steps, so every skill was single-run poison — tier-A replay
 * died at the first stale literal on every later run, and repairs minted a
 * fresh single-run corpse each time instead of converging.
 */
export function discoverSlots(
  instruction: string,
  steps: RecordedStep[],
  known: Record<string, string> = {},
): Map<string, string> {
  const values = new Set<string>();
  const locatorCandidates = new Set<string>();
  for (const step of steps) {
    if (step.tool === 'read' || step.tool === 'read_all' || step.tool === 'eval') continue;
    for (const [key, v] of Object.entries(step.args)) {
      if (!VALUE_ARGS.has(key) || typeof v !== 'string') continue;
      const value = v.trim();
      if (value.length < 2 || value.length > 200) continue;
      if (!occursAsToken(instruction, value)) continue;
      values.add(value);
    }
    // wait_for text is a check, but a check on a parameter is still parameterised
    if (step.tool === 'wait_for' && typeof step.args.text === 'string' && occursAsToken(instruction, step.args.text.trim())) {
      values.add(step.args.text.trim());
    }
    // A locator that IDENTIFIES a record — clicking the row for ticket
    // "RD-1015", a link named after the value — hard-codes that record unless
    // its identifying string is parameterised too. Collect candidates now;
    // add them below only if they look record-specific, so a plain UI label
    // ("Save") that happens to appear in the instruction is not parameterised.
    for (const loc of Object.values(step.locators)) {
      for (const value of locatorValues(loc.chain ?? [])) {
        const v = value.trim();
        if (v.length >= 2 && v.length <= 200 && occursAsToken(instruction, v)) locatorCandidates.add(v);
      }
    }
  }
  for (const v of locatorCandidates) {
    // Record-specific = already a value the caller typed (an arg slot), or
    // carries a digit. Excludes stable UI text. (A second arm asked the url
    // segment test of each word; with digits already admitted, all it added
    // was a digit-free hex word like "deadbeef".)
    if (values.has(v) || /\d/.test(v)) values.add(v);
  }
  const knownVals: string[] = [];
  for (const raw of Object.values(known)) {
    const v = String(raw ?? '').trim();
    if (v.length < 2 || v.length > 200) continue;
    if (!occursAsToken(instruction, v) || knownVals.includes(v)) continue;
    knownVals.push(v);
  }
  knownVals.sort((a, b) => instruction.indexOf(a) - instruction.indexOf(b) || b.length - a.length);
  // A DECLARED VAR the instruction never names but the procedure still
  // carries — in what it typed, how it found things, or what the page showed
  // after. fwrd45's 06-change named its ticket only by reference, yet its
  // expectations quoted the parts table: `row "fwrd45-n1 RD Part B … Acme
  // Parts Co …"`. With no slot the runid stayed literal, the replay's row read
  // fwrd45-n2, step 7 (whose only expectation that was) could never match,
  // and both replays paid 15 recovery turns — the recovery then stored a
  // procedure with n2's runid baked in instead.
  //
  // Vars only. A var is supplied on every run, so a slot bound to it by
  // origin always binds. An earlier step's OUTPUT is not: f24bdf9 kept such
  // slots on expectation evidence, and bindSkill refused whole skills
  // whenever that output went unpublished (fwgr23 05-open, fwkb3-n3).
  // The post-nav URL counts too: a step's `expect.urlPattern` is built from it,
  // and a runid inside a slug is a url the replay waits for and never sees.
  // fwgr28's create step expected `/d/{{v2}}/fwgr28-n1-bench-dashboard` on six
  // steps — the uid was a slot, the runid beside it was not.
  const carried = JSON.stringify(steps.map((s) => [s.args, s.locators, s.diff?.added ?? [], s.diff?.alerts ?? [], s.diff?.url ?? '']));
  const varOnly: string[] = [];
  for (const [key, raw] of Object.entries(known)) {
    const v = String(raw ?? '').trim();
    if (!isVarOrigin(key) || v.length < 2 || v.length > 200) continue;
    if (knownVals.includes(v) || varOnly.includes(v) || !occursAsToken(carried, v)) continue;
    varOnly.push(v);
  }
  const ordered = [...values]
    .filter((v) => !knownVals.includes(v) && !varOnly.includes(v))
    // A value appearing twice in the instruction cannot be given a slot: one
    // slot name would stand for two roles. "sign in with email admin and
    // password admin" compiled to "email {{v1}} and password {{v1}}", and
    // bindSkill emits a capture group per OCCURRENCE, so replaying it with
    // "email alice@example.com and password hunter2" bound v1 to the last
    // group and typed the password into the email field — silently, and with
    // a credential. Leaving such a value literal costs generality (the skill
    // only replays for the values it was recorded with) and keeps
    // correctness, which is the right way round. Distinct positional slots
    // per occurrence would recover the generality, but they also need the
    // step-to-occurrence mapping that plain textual substitution cannot
    // recover, so that is a separate change.
    .filter((v) => countTokenOccurrences(instruction, v) === 1)
    .map((v) => ({ v, at: instruction.indexOf(v) }))
    .sort((a, b) => a.at - b.at || b.v.length - a.v.length)
    .slice(0, Math.max(0, MAX_SLOT_VALUES - knownVals.length - varOnly.length));
  // Third slot source, exempt from instruction anchoring: a part of a
  // NAVIGATION arg's url that the ledger already banked as an identifier from
  // a url position under an EARLIER instruction. The armdoc rightly forbids
  // instructions naming database ids, so this value can never anchor in prose
  // — but its ORIGIN is known (a `from: 'url'` binding, spelled
  // `url:<step>:<label>` by bindingKey), and slots bind by origin when the
  // template cannot supply them. fwod29 is the cost of the gap: three
  // downstream skills carried `...&id=21` literally, every replay navigated to
  // the recording run's deleted order, saw an empty page, and paid ~20
  // recovery turns.
  //
  // The rule keys on PROVENANCE and POSITION, never on the characters: the
  // value must have been banked at the SAME labelled position it now sits in.
  // It used to additionally require `idPositionPart` — a numeric `q.id` — and
  // that shape clause was the whole bug (fwgr41-n1 06-find): grafana's
  // dashboard uid lives in an unnamed PATH segment (`p1`), where there is no
  // name to read and the characters say nothing, so it stayed literal and
  // s_e013d1 step 7 navigated every later run to run 1's dead dashboard
  // (s_0e342c step 7 the same, one uid later). Position cannot grow by reading
  // more names (notes/PLAN-evidence-over-shape.md); it grows by trusting what the
  // ledger banked, whatever the label.
  const urlIdVals: string[] = [];
  const knownOrigins = urlOriginPositions(known);
  for (const step of steps) {
    if (!NAVIGATION_TOOLS.has(step.tool) || typeof step.args.url !== 'string') continue;
    for (const part of urlParts(step.args.url)) {
      if (!knownOrigins.some((o) => o.value === part.value && (o.label === part.label || relocatesTo(o, part.label)))) continue;
      if (urlIdVals.includes(part.value)) continue;
      if (knownVals.includes(part.value) || varOnly.includes(part.value) || values.has(part.value)) continue;
      urlIdVals.push(part.value);
    }
  }
  const slots = new Map<string, string>();
  // Known values first so a cap can never cut them: they are the slots that
  // decide whether the skill survives past the run that recorded it.
  [...knownVals, ...varOnly, ...ordered.map(({ v }) => v), ...urlIdVals].forEach((v, i) => slots.set(`v${i + 1}`, v));
  return slots;
}

/** A slot value and the url position (a `urlParts` label) it may be written at. */
export interface UrlPositionSlot {
  name: string;
  value: string;
  at: string;
  /** Banked at a path or hash-route position: may be written at ANOTHER
   *  position of the same kind in a later url (see relocatesTo). */
  relocatable?: boolean;
}

/**
 * A record id the ledger banked from one path position may stand at another
 * position in a later url: the same record has more than one route.
 * fwop4's 03-create banked work package 41 from
 * `/work_packages/details/41/overview` (p4); 08-open's goto was
 * `/work_packages/41` (p3), so the id stayed literal, n2 "replayed" 10/10
 * against the deleted work package (every read skipped, the report filled
 * from its template), n3 fell to the model and the pin was demoted.
 *
 * Provenance still decides, never the characters: the ledger banked this
 * value as an identifier from a url position. What relocation adds is only
 * WHERE it may be written — a WHOLE segment of the same kind (path to path,
 * hash route to hash route), and only where the url holds it exactly once
 * (substituteUrlId). The rule the exact-position arm guards — no rewrite of
 * a uid inside grafana's slug — still holds: a slug is never a whole segment
 * equal to the uid.
 */
function relocatesTo(origin: { label: string; value: string }, label: string): boolean {
  const from = /^(p|h)\d+$/.exec(origin.label);
  const to = /^(p|h)\d+$/.exec(label);
  return Boolean(from && to && from[1] === to[1]);
}

/** Where a relocatable slot stands in `url`: its banked position when it is
 *  there, else the one same-kind segment wholly equal to it, else nothing. */
function relocatedLabel(url: string, s: UrlPositionSlot): string | null {
  const parts = urlParts(url);
  if (parts.some((p) => p.label === s.at && p.value === s.value)) return s.at;
  const kind = s.at[0];
  const hits = parts.filter((p) => /^(p|h)\d+$/.test(p.label) && p.label[0] === kind && p.value === s.value);
  return hits.length === 1 ? hits[0].label : null;
}

/**
 * Rewrite minted url parts inside a navigation url at the position each was
 * minted from: a value minted at `q.action` replaces `action=<value>` (query
 * or hash state) with `action={{dN}}`, and nothing else — a "135" elsewhere
 * in the url is left alone.
 */
export function substituteUrlParts(url: string, minted: UrlPositionSlot[]): string {
  let out = url;
  for (const m of minted) {
    if (!m.at.startsWith('q.')) continue;
    out = replaceAtUrlPart(out, m.at, m.value, `{{${m.name}}}`);
  }
  return out;
}

/**
 * Rewrite a navigation url's record identifiers to slot markers, each at the
 * one labelled position the ledger banked it at — `q.id` for odoo's
 * `#…&id=21`, `p1` for grafana's `/d/<uid>/<slug>`. Positional, never textual:
 * the same characters standing somewhere else in the url (the slug, another
 * key) are a different thing and stay literal.
 */
export function substituteUrlId(url: string, slots: UrlPositionSlot[]): string {
  let out = url;
  for (const s of slots) {
    const at = s.relocatable ? relocatedLabel(out, s) : s.at;
    if (at) out = replaceAtUrlPart(out, at, s.value, `{{${s.name}}}`);
  }
  return out;
}

/**
 * Position-only url slots written into the href values a selector matches on
 * (`a[href$="/hardware/4/checkout"]`, `[href="…"]`): each href value is read as
 * a url path (resolved against a placeholder origin when relative) and
 * rewritten by substituteUrlId, so the id is replaced only at the path
 * position the ledger banked it at — never the "4" of `nth-of-type(4)`
 * elsewhere in the selector. snipeit fwsi3's 04-create clicked
 * `a[href$="/hardware/4/checkout"]` while its goto was slotted
 * `/hardware/{{v5}}`, so n2 looked for the recording run's asset link.
 */
export function substituteHrefIds(selector: string, slots: UrlPositionSlot[]): string {
  const BASE = 'http://href.invalid';
  return selector.replace(/(href[\^$*~|]?=)(["'])([^"']*)\2/g, (whole, op: string, quote: string, value: string) => {
    const absolute = value.includes('://');
    if (!absolute && !value.startsWith('/')) return whole;
    const written = substituteUrlId(absolute ? value : `${BASE}${value}`, slots);
    const back = absolute ? written : written.slice(BASE.length);
    return `${op}${quote}${back}${quote}`;
  });
}

/**
 * Replace `value` with `marker` at exactly one labelled url position, leaving
 * the url otherwise byte-identical (no re-serialisation: `urlShapeOf` sorts
 * hash state and drops noise keys, which would rewrite a url the recording
 * navigated to successfully). A no-op unless that position really holds that
 * value, so a caller passing a stale pair can never damage the url.
 */
function replaceAtUrlPart(url: string, at: string, value: string, marker: string): string {
  if (!value || !at) return url;
  if (at.startsWith('q.')) {
    const key = at.slice(2);
    return url.replace(new RegExp(`([?&#]${escapeRe(key)}=)${escapeRe(value)}(?=[&#]|$)`, 'g'), `$1${marker}`);
  }
  const m = /^(p|h)(\d+)$/.exec(at);
  if (!m) return url;
  const span = m[1] === 'p' ? pathSpan(url) : hashPathSpan(url);
  if (!span) return url;
  const segments = url.slice(span.start, span.end).split('/');
  // urlParts indexes the NON-EMPTY segments, so count them the same way.
  let index = -1;
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i]) continue;
    index += 1;
    if (index !== Number(m[2])) continue;
    if (safeDecode(segments[i]) !== value) return url;
    segments[i] = marker;
    return url.slice(0, span.start) + segments.join('/') + url.slice(span.end);
  }
  return url;
}

/** The path portion of a raw url string: after the authority, before `?` or `#`. */
function pathSpan(url: string): { start: number; end: number } | null {
  const scheme = url.indexOf('://');
  if (scheme < 0) return null;
  let start = scheme + 3;
  while (start < url.length && url[start] !== '/' && url[start] !== '?' && url[start] !== '#') start += 1;
  let end = start;
  while (end < url.length && url[end] !== '?' && url[end] !== '#') end += 1;
  return { start, end };
}

/** The route portion of a fragment: after `#`, before the fragment's own `?` (urlShapeOf). */
function hashPathSpan(url: string): { start: number; end: number } | null {
  const hash = url.indexOf('#');
  if (hash < 0) return null;
  let end = hash + 1;
  while (end < url.length && url[end] !== '?') end += 1;
  return { start: hash + 1, end };
}

/**
 * The url positions the caller's known values were banked at — every key the
 * ledger wrote for a `from: 'url'` binding, which `bindingKey` spells
 * `url:<step>:<label>`. The label is the position (`p1`, `h0`, `q.id`), and it
 * is the whole point: a value banked at `p1` may only be written back at `p1`.
 *
 * Only the ledger's own spelling is admitted. The flow runner's url outputs
 * reach a recovery compile as `<stepId>.url.<label>` (server.ts
 * provenanceValues), and a param bound to THAT key could not be resolved at
 * bind time — the daemon binds from the ledger (`knownValues()`), so bindSkill
 * would find no value, and a param that cannot bind refuses the whole skill.
 * An unslotted literal costs a recovery; an unbindable param costs the skill.
 */
export function urlOriginPositions(known: Record<string, string> = {}): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(known)) {
    const m = /^url:[^:]+:(.+)$/.exec(key);
    const value = String(raw ?? '').trim();
    if (!m || !value || !urlPartLabel(m[1])) continue;
    out.push({ label: m[1], value });
  }
  return out;
}

/** A `urlParts` position label: a path segment, a hash-route segment, a hash-state key. */
function urlPartLabel(label: string): boolean {
  return /^(p|h)\d+$/.test(label) || label.startsWith('q.');
}

/**
 * Which slots may be written into a navigation url, and at which position.
 * A value banked at two positions yields two entries: both name the same
 * record, and `replaceAtUrlPart` checks each position before writing.
 */
function urlIdSlotPositions(slots: Map<string, string>, known: Record<string, string> = {}): UrlPositionSlot[] {
  const positions = urlOriginPositions(known);
  const out: UrlPositionSlot[] = [];
  for (const [name, value] of slots) {
    for (const o of positions) if (o.value === value) out.push({ name, value, at: o.label, ...(relocatesTo(o, o.label) ? { relocatable: true } : {}) });
  }
  return out;
}

/** How many times `value` stands as a whole token in `text` (shape.ts `tokenPattern`). */
export function countTokenOccurrences(text: string, value: string): number {
  if (!value) return 0;
  return [...text.matchAll(tokenPattern(value, 'g'))].length;
}

/**
 * The human-meaningful identifying strings in a locator chain — the ones that
 * can carry a record identifier (a role/link name, visible text, a label). Id
 * and css selectors are excluded: their embedded ids are already handled by
 * stableFirst (demoted) and are not values a caller would supply.
 */
/**
 * An identity anchor left naming the recorded run's record: its text still
 * contains a value the caller vouched for THIS run, with no slot to swap.
 * Only anchors qualify — a role/text locator that survives un-slotted is
 * ordinary UI text, and dropping it would cost a working fallback.
 */
/**
 * Positional: this candidate finds an element by WHERE it sits (a structural
 * path, or an index into a set of matches), not by what it is. Fine as a
 * fallback for an action whose target is otherwise pinned; never sufficient
 * on its own for a read that names a record.
 */
function positional(c: LocatorCandidate): boolean {
  return c.kind === 'css' || c.kind === 'point' || c.nth !== undefined;
}

export function stranded(c: LocatorCandidate, runValues: string[]): boolean {
  const fields: string[] = [];
  if (c.kind === 'scoped') fields.push(c.hasText);
  // A NAME that is really a record reference. The rule used to stop at
  // anchors, reasoning that "a role/text locator that survives un-slotted is
  // ordinary UI text, and dropping it would cost a working fallback". True of
  // ordinary UI text — false of a link whose accessible name IS the ticket
  // ref. fwrd22l shipped six of these, `getByText('RD-1015')` and
  // `getByRole('link', { name: 'RD-1015' })`, every one of them pinned to the
  // record the RECORDING run created. A value that changes every run is not a
  // working fallback, it is a fallback that has already stopped working.
  else if (c.kind === 'role') fields.push(c.name);
  else if (c.kind === 'text') fields.push(c.text);
  else if (c.kind === 'label') fields.push(c.label);
  else if (c.kind === 'placeholder') fields.push(c.placeholder);
  // An ADDRESS welded out of a value this run minted. `ticket-link-t15` is
  // the record's own id inside a test hook, and it survived every fix so far
  // because this check only ever looked at anchors: fwrd20l and fwrd21l both
  // shipped it. stableFirst demotes it to the tail, so it is not usually
  // reached — but if the anchor and the structural path both miss, it
  // resolves against whatever wears that id NEXT run, which on an app that
  // reuses ids is a different record.
  else if (c.kind === 'testid') fields.push(c.value);
  else if (c.kind === 'id' || c.kind === 'css') fields.push(c.selector);
  // Whole tokens, not substrings — the same rule `scanForLeaks` uses
  // (occursAsToken), so the stripper and the scanner agree on what a match is.
  // `includes` let a banked quantity condemn any locator that merely contained
  // its characters: "5.00" deleted `text("£ 425.00")` and `£ 1,015.00` from
  // fwod28's store, "3.00" deleted `£ 113.00` from fwod32's, though neither
  // price was ever a run value. Measured over all 33 published recordings the
  // two rules disagree 10 times, every one of them that shape — no genuine id
  // is caught by substring alone.
  return fields.some((f) => runValues.some((v) => occursAsToken(f, v)));
}

/**
 * Retire a read's own value as a way of FINDING the element it read, once a
 * later run has proved that value varies.
 *
 * A read located by the text it reported is circular: `getByText('£ 133.33')`
 * for the output `total`. The recording cannot tell which of those are dead —
 * it saw each value exactly once, and the characters do not say (shape.ts).
 * Measured over the 33 published recordings, deleting them all is net
 * negative: 191 of 890 reads carry such a candidate, 48 of those values have
 * no digit and are page furniture a text locator is the RIGHT way to find
 * (`"Recipients"`, `"No supplier"`, an input's placeholder), 86 would be left
 * findable only by position, and 9 chains would empty outright — a recovery
 * turn on every replay, forever.
 *
 * So evidence decides, the same way it decides everything else here: run 1
 * proposes nothing, and a candidate is dropped only for an output
 * `outputEvidence` has actually seen change. Such a candidate is provably
 * dead — the value it looks for is not on the page any more — and the failure
 * it prevents is the narrow, silent one: the recording's value still present
 * somewhere else as the page's only match, so the read resolves and publishes
 * a stale identity with no sign of trouble.
 *
 * `volatile` maps a read's output name to the value the RECORDING saw, for
 * outputs now known to vary. Whole-token matching (`stranded`), and values
 * under three characters are left alone: too small to carry identity, and too
 * easy to hit by accident.
 *
 * Emptying a chain is deliberate and follows the compiler's own rule: a read
 * that can now only be found by position must not publish (fwrd16-n3 read
 * `tbody > tr:nth-of-type(1) > td` and confidently published the wrong
 * ticket's ref). Replay SKIPS a read with no locator, so the value comes back
 * absent, not wrong.
 *
 * Mutates `steps`; returns how many candidates went. The caller persists.
 */
export function dropDeadReadLocators(steps: SkillStep[], volatile: Record<string, string>): number {
  let removed = 0;
  for (const step of steps) {
    if (step.body) removed += dropDeadReadLocators(step.body, volatile);
    if (step.tool !== 'read' && step.tool !== 'read_all') continue;
    const dead = step.label ? (volatile[step.label] ?? '').trim() : '';
    if (dead.length < MIN_ID_LEN) continue;
    for (const [key, chain] of Object.entries(step.locators ?? {})) {
      const kept = chain.filter((c) => !stranded(c, [dead]));
      if (kept.length === chain.length) continue;
      removed += chain.length - kept.length;
      step.locators[key] = kept.length && !kept.every(positional) ? kept : [];
    }
  }
  return removed;
}

/**
 * The outcome `dropDeadReadLocators` cannot observe: a read that never
 * resolved at all.
 *
 * Retirement there is driven by `differed > 0` — a value a later run watched
 * CHANGE. A read whose locators match nothing produces no value, so it never
 * reaches a same/differed verdict and is never retired: fwkb14's synthesized
 * `column_3` read missed on n2 and again on n3 and the store learned nothing
 * either time, while fwod52's had no candidates left at all and was
 * guaranteed to publish nothing on any page, forever. `absent` (flow.ts
 * noteOutputEvidence) is what makes the miss countable.
 *
 * Same run-1-proposes / run-2-decides shape as its sibling, and the same
 * outcome — an emptied chain, which replay SKIPS — but narrowed to reads
 * carrying `unproven`. A RECORDED read that misses may be missing for this
 * run's reasons (a route the recovery took, a record in another state), and
 * emptying it would spend evidence the run does not have. An unproven read
 * has never resolved ANYWHERE: there is no run whose opinion is being
 * overruled, because no run ever had one.
 *
 * `labels` are the read labels evidence says came back absent on every run
 * that reached the step. Mutates `steps`; returns how many candidates went.
 */
export function dropAbsentReadLocators(steps: SkillStep[], labels: string[]): number {
  let removed = 0;
  for (const step of steps) {
    if (step.body) removed += dropAbsentReadLocators(step.body, labels);
    if (step.tool !== 'read' && step.tool !== 'read_all') continue;
    if (!step.unproven || !step.label || !labels.includes(step.label)) continue;
    for (const [key, chain] of Object.entries(step.locators ?? {})) {
      if (!chain.length) continue;
      removed += chain.length;
      step.locators[key] = [];
    }
  }
  return removed;
}

/**
 * Drop the `unproven` mark from every read that has now PROVED itself: a run
 * resolved it and read a value back, which is the only evidence that turns a
 * candidate source into a source (SkillStep.unproven).
 *
 * Once, and permanently. The claim being retired is "no run has ever resolved
 * this", and a later run that misses does not make that true again — a read
 * that has resolved once is an ordinary read, judged by the ordinary
 * evidence (`dropDeadReadLocators`).
 *
 * `labels` are the read labels this run reported a value for. Mutates
 * `steps`; returns how many marks went.
 */
export function markReadsProven(steps: SkillStep[], labels: string[]): number {
  let cleared = 0;
  for (const step of steps) {
    if (step.body) cleared += markReadsProven(step.body, labels);
    if (!step.unproven || !step.label || !labels.includes(step.label)) continue;
    delete step.unproven;
    cleared += 1;
  }
  return cleared;
}

/**
 * An ADDRESS that is really a bookmark: a test hook or an id whose text
 * carries a minted identifier, like `ticket-link-t15`. Next run the record is
 * t16 and it matches nothing — or worse, on an app that reuses ids, it
 * matches a DIFFERENT record.
 *
 * Distinct from `stranded`, which needs the value to be one the run
 * demonstrably made. That is not enough here: the id an instruction MINTS is
 * unknown while that instruction is compiling — repair-desk's create step
 * never visits a t15 url, so nothing banks it — yet the testid recorded on
 * that very step already has it welded in. fwrd19l shipped three, fwrd20l and
 * fwrd21l two each, all of them below `stranded`'s reach.
 *
 * Structural, so it needs no provenance: the address has a skeleton (shape.ts)
 * different from itself — some token in it is numeric and is neither a slot
 * marker nor an index. That includes `del-1` and `row-2`: a small number in a
 * hook names a row as surely as a large one, and this only demotes.
 */
function bookmarked(c: LocatorCandidate): boolean {
  if (c.kind !== 'testid' && c.kind !== 'id') return false;
  const text = c.kind === 'testid' ? c.value : c.selector;
  return skeleton(text) !== text;
}

function locatorValues(chain: LocatorCandidate[]): string[] {
  const out: string[] = [];
  for (const c of chain) {
    if (c.kind === 'scoped') out.push(c.hasText);
    else if (c.kind === 'role') out.push(c.name);
    else if (c.kind === 'text') out.push(c.text);
    else if (c.kind === 'label') out.push(c.label);
    else if (c.kind === 'placeholder') out.push(c.placeholder);
  }
  return out.filter(Boolean);
}

/** Replace every slot value in `text` by its "{{vN}}" marker, longest values first. */
export function substitute(text: string, slots: Map<string, string>): string {
  let out = text;
  const byLength = [...slots].sort((a, b) => b[1].length - a[1].length);
  for (const [name, value] of byLength) {
    if (!value) continue;
    // Whole-token only (shape.ts `tokenPattern`: a word's '-' and '_' bind, so
    // "form" never rewrites the middle of `o_form_view_group`). A bare number
    // additionally never rewrites a selector index — a cost of "25" must not
    // touch the 25 in `:nth-of-type(25)` or `nth=25` — nor a number inside a
    // dotted run of numbers (127.0.0.1, 1.2.3), which is part of that address
    // or version: fwod31 compiled the odoo start url as
    // `http://127.0.0.{{d1}}:8069/...` after `cids=1` minted d1 = "1". Nor a
    // number inside a run of numbers joined by ':' , '/' or ',' — a clock time,
    // a date, a thousands group: fwod67's order id 21 rewrote the "21" of
    // `- cell "09/17/2026 21:05"` in a list expectation to `{{v4}}`, and the
    // next run's order 22 then waited for a cell reading "22:…" that no clock
    // showed. All guards only narrow the shared boundary, which already lets
    // '-' and '_' split around a number.
    const numeric = /^\d+$/.test(value);
    const re = numeric
      ? new RegExp(`(?<![A-Za-z0-9(=]|\\d[.:/,])${escapeRe(value)}(?![A-Za-z0-9)]|[.:/,]\\d)`, 'g')
      : tokenPattern(value, 'g');
    out = out.replace(re, `{{${name}}}`);
  }
  return out;
}

export function substituteDeep(value: unknown, slots: Map<string, string>): unknown {
  if (typeof value === 'string') return substitute(value, slots);
  if (Array.isArray(value)) return value.map((v) => substituteDeep(v, slots));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substituteDeep(v, slots)]));
  }
  return value;
}

export function slotsUsed(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{(v\d+)\}\}/g)].map((m) => m[1]))];
}

/**
 * A url reduced to the shape that identifies its page: origin + path + query
 * + hash route, with id-like segments replaced by `:id`. Slot values become
 * their markers, so a skill recorded on `/tickets/x7` matches
 * `/tickets/{{v1}}` on the next run, and one recorded on `edit?id=x7` matches
 * `edit?id={{v1}}` — which, filled, refuses `edit?id=x8` (notes/ROBUSTNESS.md,
 * finding 3). Query pairs are reduced like hash-state pairs, less the keys
 * the shared `noiseQueryKey` drops; a credential-named key keeps its key and
 * stores a wildcard, never the value, since a pattern is persisted and
 * embedded in a compiled artifact.
 *
 * `query: false` leaves the query out, for the callers that ask "is this the
 * same page TEMPLATE" rather than "is this the page": segment seams, a flow
 * step's route, the sitemap. Those were keyed without a query before it was
 * modelled, and a dashboard gaining `refresh=1m` is not a new template.
 */
export function urlPattern(url: string, slots: Map<string, string> = new Map(), opts: { query?: boolean } = {}): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  /** One path segment, hash-state value or query value: its slot marker, `:id`, or itself. */
  const reduce = (raw: string, decoded = safeDecode(raw)): string => {
    const filled = substitute(decoded, slots);
    if (filled !== raw && filled.includes('{{')) return filled;
    return digitDominant(raw, 'proposal') ? ':id' : raw;
  };
  const norm = (p: string) =>
    p
      .split('/')
      .map((seg) => (seg ? reduce(seg) : seg))
      .join('/');
  /**
   * A hash-routed app puts its route in the fragment, in one of two shapes: a
   * path ("#/orders/123") or a query-like state string
   * ("#action=123&cids=1&menu_id=81", which is Odoo). Only the path shape was
   * being reduced, because norm() splits on "/" and a query-shaped fragment
   * has none — so the whole fragment survived verbatim, volatile ids and all.
   *
   * That made a segment's precondition unmatchable by anything but the run
   * that recorded it: Odoo hands out a fresh action id per session, so a
   * chain's second segment refused every replay and the work fell back to the
   * model, run after run, with the store looking perfectly healthy.
   *
   * Keys are kept (they are what distinguishes one template from another) and
   * id-like values reduced. Pairs are sorted because the app is free to emit
   * them in any order between runs, and two orderings of the same state are
   * the same page.
   */
  const normHash = (raw: string): string => {
    const body = raw.split('?')[0];
    if (!body) return '';
    if (body.startsWith('/') || !body.includes('=')) return '#' + norm(body);
    const pairs = body
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const eq = pair.indexOf('=');
        if (eq < 0) return pair;
        const key = pair.slice(0, eq);
        return `${key}=${reduce(pair.slice(eq + 1))}`;
      })
      .sort();
    return '#' + pairs.join('&');
  };
  const hash = u.hash && u.hash.length > 1 ? normHash(u.hash.slice(1)) : '';
  const pairs = opts.query === false ? [] : [...queryPairs(u.search)].map(([key, value]) => {
    if (CREDENTIAL_KEY.test(key)) return `${key}=:var`;
    return `${key}=${reduce(value, value)}`;
  });
  const query = pairs.length ? '?' + pairs.sort().join('&') : '';
  // An opaque origin (chrome-error://, about:) prints as "null"; keep the
  // url itself so a message says what the browser was actually showing.
  if (u.origin === 'null') return url;
  const origin = u.protocol === 'file:' ? 'file://' : u.origin;
  return `${origin}${norm(u.pathname)}${query}${hash}`;
}

/**
 * TRANSIENT_LINE and maskMinted are run-time rules as much as compile-time
 * ones — the replay gate and the compiled artifact both re-apply them to a
 * stored line — so they live in the shared src/execution/expect.ts, where the
 * daemon imports them and an artifact embeds them. Re-exported here so no
 * call site has to know which of the two owns the source.
 */
export { TRANSIENT_LINE, maskMinted } from '../execution/expect.js';
import { DIALOG_LINE, DISMISSAL, SLOT_LINE, TRANSIENT_LINE, identifiesNothing, maskForeignValue, maskMinted, maskPopupItem } from '../execution/expect.js';

/** A line naming one record of a collection — never part of a dialog's own chrome (see expectationFor's removals). */
const RECORD_LINE = /^-?\s*(row|cell|gridcell|rowheader|listitem|article|treeitem)\b/;

/**
 * Args that name WHERE the step acted, not WHAT it put on the page: a
 * selector, a handle, a url, the thing a read asks for. Everything else a step
 * carries as a string — a fill's `value`, a type's `text`, a select's `option`,
 * a press's `key` — is a value the procedure itself typed or chose, and is the
 * evidence maskForeignValue judges a control's displayed value against.
 */
const ELEMENT_ARG = /^(target|source|url|what|selector|frame|delay_ms)$/;

/** The values this step put on the page, slotted as the expectation lines are (see maskForeignValue). */
export function typedValues(step: RecordedStep, slots: Map<string, string>): string[] {
  return Object.entries(step.args ?? {})
    .filter(([key, value]) => !ELEMENT_ARG.test(key) && typeof value === 'string')
    .map(([, value]) => substitute(String(value), slots).trim())
    .filter((v) => v.length > 0);
}

function expectationFor(step: RecordedStep, slots: Map<string, string>): StepExpectation | undefined {
  // A navigation's diff is its LANDING — the next segment's start url,
  // fingerprint and startText — not an effect to assert: none of it becomes
  // an expectation, exactly as when goto/back were never diffed.
  if (!step.diff || NAVIGATION_TOOLS.has(step.tool)) return undefined;
  const out: StepExpectation = {};
  // A fill or a type never navigates: a url seen after one is where the page
  // happened to be while it settled, so only its path is evidence. snipeit
  // fwsi1 02-find filled "Seed:" then "" (a clear); the list rewrote its
  // query string on a debounce after its AJAX call, the rewrite landed during
  // the clear's settle, and every replay stopped on `…/hardware?…search=Seed:…`
  // against a browser at `…/hardware`.
  if (step.diff.url) out.urlPattern = urlPattern(step.diff.url, slots, VALUE_ENTRY_TOOLS.has(step.tool) ? { query: false } : {});
  if (step.diff.alerts[0]) out.alertContains = substitute(step.diff.alerts[0], slots).slice(0, 120);
  if (step.diff.added.length) {
    // A status or progress indicator is the page in transit, not where the
    // step left it: fwgr25's sign-in recorded `- status "Loading"` as its
    // click's only page change, and every replay — which caught the page
    // after the spinner — stopped there and recovered for 24 turns.
    // A line that identifies no element — no name, no value, or only one the
    // mask wildcarded — is on the page for incidental reasons and proves
    // nothing about the step (fwod47-n3 04-open stopped on an unnamed inline-
    // editor textbox). Judged after masking, so the budget goes to lines that
    // can tell right from wrong.
    // A control's displayed value is this step's evidence only when this step
    // put it there (maskForeignValue), and an open popup's items are never
    // the procedure's evidence at all (maskPopupItem) — both provenance
    // rules, decided here where the step's own args are still in hand, and
    // both leaving the wildcard that identifiesNothing then sweeps up.
    const typed = typedValues(step, slots);
    const lasting = step.diff.added
      .filter((l) => !TRANSIENT_LINE.test(l))
      .map((l) => maskPopupItem(maskForeignValue(maskMinted(maskVolatile(substitute(l, slots))), typed)))
      .filter((l) => !identifiesNothing(l));
    if (lasting.length) out.addedContains = lasting.slice(0, MAX_ADDED_LINES).map((l) => l.slice(0, 120));
  }
  // The dialog this step closed (StepDiff.removed, kept by the recorder only
  // when a dialog went) — recorded only when closing it was the step's WHOLE
  // effect: nothing lasting added, no alert, no navigation to another page
  // template, no popup/close/switch, not a read. That is what makes the step
  // conditional (dismissalAlreadyInEffect); a step with a consequence of its
  // own is the procedure's, dialog or not. Masked as added lines are, so a
  // later run's own values match; the dialog line itself is kept even unnamed
  // — `- dialog ""` identifies nothing as an EFFECT, but as the thing that
  // must be absent it is the conservative reading: any unnamed dialog on the
  // page counts as it.
  const inert = !out.addedContains && !out.alertContains && !step.fingerprintAfter && !step.effect && step.label === undefined;
  const removed = inert
    ? (step.diff.removed ?? [])
        .filter((l) => !TRANSIENT_LINE.test(l))
        .map((l) => maskMinted(maskVolatile(substitute(l, slots))))
        .filter((l) => DIALOG_LINE.test(l) || !identifiesNothing(l))
    : [];
  // A removal is a consequence too. Snapshot lines are flat, so what a step
  // took away cannot be proved to have been INSIDE the dialog — but a record's
  // own line (a row, a cell, a list item) or a line carrying this run's own
  // value is never dialog chrome. fwod74's configurator Cancel took away the
  // dialog AND the order line it had half-added (`- row "£ 0.00"`, the product
  // combobox showing {{v4}}): that step undid work, it did not merely dismiss.
  const consequential = removed.some((l) => RECORD_LINE.test(l) || SLOT_LINE.test(l));
  if (!consequential && removed.some((l) => DIALOG_LINE.test(l))) out.removedContains = removed.slice(0, MAX_ADDED_LINES).map((l) => l.slice(0, 120));
  if (!Object.keys(out).length) return undefined;
  // The recording's dialect travels with its lines, so replay and the artifact
  // render the live page the way these lines were written.
  if (step.diff.dialect === 2) out.lineDialect = 2;
  return out;
}

/**
 * `- role "name" [state]: value`, split so a rule can judge what a line SAYS
 * without touching the role that says which element said it. The closing
 * quote is optional because the 120-char stored-line cap can cut a name
 * short (src/execution/expect.ts LINE_PARTS makes the same allowance).
 */
const EXPECT_LINE = /^(-?\s*[A-Za-z][\w-]*)(?:(\s+")((?:[^"\\]|\\.)*)("?))?((?:\s+\[[^\]]*\])*)(?::\s*(.*?))?\s*$/;

/** A `{{vN}}`/`{{dN}}` marker: this run's own value, already substituted in. Never `{{*}}`. */
const NAME_SLOT = /\{\{[vd]\d+\}\}/g;

/** One expectation line, taken apart and put back together around its name and its value. */
interface SplitLine {
  role: string;
  name: string;
  value: string;
  rebuild(name: string, value: string): string;
}

function splitExpectLine(line: string): SplitLine | null {
  const m = EXPECT_LINE.exec(line);
  if (!m) return null;
  const [, head, openQ, name, closeQ, states, value] = m;
  return {
    role: head.replace(/^-?\s*/, ''),
    name: name ?? '',
    value: value ?? '',
    rebuild: (n, v) =>
      `${head}${openQ === undefined ? '' : `${openQ}${n}${closeQ}`}${states ?? ''}${value === undefined ? '' : `: ${v}`}`,
  };
}

/**
 * THE VALUES A PROCEDURE PUBLISHES ARE NOT EVIDENCE THAT IT RAN.
 *
 * A read step exists because the recording did NOT know the answer: it asked
 * the page, and the instruction's report carries what came back. A value the
 * run obtained that way is, by construction, this run's result — the second
 * line's tax, the untaxed total, the reference of the record the run just
 * made. Frozen into `addedContains` it asserts that a later run's arithmetic,
 * or a later run's record, equals the recording's, and the step stops for
 * ever (fwod60 s_292da2, fwrd65 s_ca1263 — both demoted to 1/3 with two
 * consecutive stops, and `demoted-pin` then refused the compile).
 *
 * Provenance, not shape: the recording's own reads say which strings these
 * are, so nothing here looks at whether a value is spelled like money or like
 * a ticket ref. A value the caller supplied, or one the procedure typed, is a
 * slot by the time this runs (substitute() went first) and is left alone —
 * only the wildcard lands, and only over what a read published.
 *
 * Applied to the NAME and the VALUE of a line, never to its role: a read that
 * published the word "row" must not turn `- row "…"` into `- {{*}} "…"`.
 */
export function maskPublishedValues(line: string, published: readonly string[], sets: readonly SetValue[] = []): string {
  const split = splitExpectLine(line);
  if (!split) return line;
  let { name, value } = split;
  for (const v of published) {
    const replacement = keepSetValues(v, sets) ?? WILDCARD;
    if (name && occursAsToken(name, v)) name = replaceAsToken(name, v, replacement);
    if (value && occursAsToken(value, v)) value = replaceAsToken(value, v, replacement);
  }
  return name === split.name && value === split.value ? line : split.rebuild(name, value);
}

/** A value the procedure itself set: what it typed (`value`, slots filled with their examples) and how the step wrote it (`template`). */
export interface SetValue {
  value: string;
  template: string;
}

/**
 * Every value a `fill`, `type` or `select` among `steps[0..upTo]` set: the
 * procedure's own work so far in this segment. A slotted value keeps its
 * marker as the template, so a later run's value replaces the recording's.
 */
export function setValuesUpTo(steps: readonly SkillStep[], upTo: number, slots: ReadonlyMap<string, string> = new Map()): SetValue[] {
  const out = new Map<string, SetValue>();
  for (const step of steps.slice(0, upTo + 1)) {
    const raw = step.tool === 'fill' ? step.args.value : step.tool === 'type' ? step.args.text : step.tool === 'select' ? step.args.option : undefined;
    if (typeof raw !== 'string') continue;
    const value = raw.replace(/\{\{(v\d+)\}\}/g, (m, n: string) => slots.get(n) ?? m).trim();
    if (!value || value.includes('{{')) continue;
    out.set(value, { value, template: raw.trim() });
  }
  return [...out.values()].sort((a, b) => b.value.length - a.value.length);
}

/**
 * A published value that CARRIES a value the procedure set, masked around it:
 * the set value stays (as its slot, or literally), every other part of the
 * published value that has a letter or a digit is wildcarded, and punctuation
 * stays. Null when no set value is in it.
 *
 * WHY. maskPublishedValues exists because a value the procedure's reads
 * published is one only the recording run could produce. A value the
 * procedure SET is the opposite: it is the step's work, and the one thing its
 * expectation must still check. repairdesk fwrd84-n1 05-edit filled Cost 150
 * and saved; the Save's recorded row read `… $150.00 25% 1 No supplier
 * $187.50 …`, its reads published "$150.00" and "$187.50", and both became
 * `{{*}}`, so the unchanged row, $100.00, matched too, and n3 saved an
 * unchanged form at tier A, 0 turns, reporting success. Kept around the set
 * value, "$150.00" becomes `${{v6}}{{*}}`: a replay whose cost never took
 * shows `$100.00`, which does not match it, and the line is a slot line, so
 * it is HARD (expect.ts expectedChangesVerdict). "$187.50", a figure the app
 * computed, stays masked. Provenance, not shape: what decides is that a fill
 * of this procedure typed the value.
 */
function keepSetValues(published: string, sets: readonly SetValue[]): string | null {
  const used: SetValue[] = [];
  let marked = published;
  for (const s of sets) {
    if (!occursAsToken(marked, s.value)) continue;
    marked = replaceAsToken(marked, s.value, `\u0000${used.length}\u0000`);
    used.push(s);
  }
  if (!used.length) return null;
  return marked
    .split(/\u0000(\d+)\u0000/)
    .map((part, i) => {
      if (i % 2) return used[Number(part)].template;
      if (!/[\p{L}\p{N}]/u.test(part)) return part;
      const lead = /^\s*/.exec(part)![0];
      const trail = /\s*$/.exec(part)![0];
      return `${lead}${WILDCARD}${trail}`;
    })
    .join('');
}

/**
 * identifiesNothing's rule, extended to a line the MASKING left
 * indistinguishable from what the page showed before the step: the masked
 * line, slots filled with their recorded examples and `{{*}}` matching
 * anything, matches one of the step's own recorded removals, the element as
 * it was before the action. Every token that made it this step's change was
 * wildcarded, so it proves nothing about the step: fwrd84's
 * `- row "Total (price × quantity) {{*}}"` matches the removed
 * `- row "Total (price × quantity) $375.00"` as well as the new $437.50, and
 * the runner counted it as found ("found on the page instead") whether or not
 * the save did anything. Whole-line and anchored: never a substring of a
 * longer line. Compile-time only, so both runners see the same expectation.
 */
function identifiesNothingNew(line: string, shownBefore: readonly string[], slots: ReadonlyMap<string, string> = new Map()): boolean {
  if (!shownBefore.length) return false;
  const filled = line.replace(/\{\{(v\d+)\}\}/g, (m, n: string) => slots.get(n) ?? m).replace(/\s+/g, ' ').trim();
  if (/\{\{(?!\*\}\})/.test(filled)) return false;
  const re = new RegExp(`^${filled.split(WILDCARD).map(escapeRe).join('.*?')}$`);
  return shownBefore.some((b) => re.test(b.replace(/\s+/g, ' ').trim()));
}

/**
 * `text` up to the first whole-token occurrence of a published value, trimmed;
 * `text` itself when none occurs. The alert's half of maskPublishedValues —
 * see unfreezeExpectations. Two values are skipped. One under two characters:
 * a lone digit a read published stands in any sentence, and cutting there
 * would throw away an alert on a coincidence. And the whole alert: a read OF
 * the alert (fwsi4 01-open's `login_alert`, "Success: × You have successfully
 * logged in.") says nothing about a value inside it, and the text every
 * sign-in raises is exactly what the step should expect.
 */
export function cutAtPublishedValue(text: string, published: readonly string[], lines: readonly string[] = []): string {
  let at = -1;
  for (const v of published) {
    if (v.length < 2 || v === text.trim() || lines.includes(v)) continue;
    // Where it stands, by the token rule the masking side uses (ledger.ts
    // replaceAsToken): mark it, then find the mark.
    const i = occursAsToken(text, v) ? replaceAsToken(text, v, '\u0000').indexOf('\u0000') : -1;
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  return at < 0 ? text : text.slice(0, at).trimEnd();
}

/** Whitespace collapsed, as a recorded alert is (renderAlerts). */
const collapseSpace = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Every text the recording's reads returned, multi-line ones included (an
 * array read's elements each on their own) — what alertLines looks for the
 * alert read back in.
 */
export function recordedReadTexts(steps: readonly RecordedStep[]): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if ((step.tool !== 'read' && step.tool !== 'read_all') || step.result === undefined) continue;
    let observed: unknown;
    try {
      observed = JSON.parse(step.result);
    } catch {
      observed = step.result;
    }
    for (const v of Array.isArray(observed) ? observed : [observed]) if (typeof v === 'string' && v.trim()) out.push(v);
  }
  return out;
}

/**
 * The LINES of a recorded alert, where the recording shows them. The alert
 * itself is stored whitespace-collapsed (renderAlerts), so its line breaks
 * are gone; two pieces of the recording's own evidence give them back:
 *  - a read that returned the alert's text with its breaks (collapsed, it
 *    equals the alert): repairdesk fwrd83-n1 06-change read the refusal
 *    `"Ticket is not ready\n\nPart … has no supplier\nPart …"`;
 *  - published values that TILE the alert, one after another, separated by
 *    whitespace, from its first character to its last: the same refusal
 *    read back as `refusal_text_1..3`, one line each.
 * Neither: no lines ([]), and every published value is judged as a value.
 */
export function alertLines(rawAlert: string, reads: readonly string[], published: readonly string[]): string[] {
  const alert = collapseSpace(rawAlert);
  if (!alert) return [];
  for (const r of reads) {
    if (r.includes('\n') && collapseSpace(r) === alert) return r.split('\n').map((l) => l.trim()).filter(Boolean);
  }
  const pieces = [...new Set(published.map(collapseSpace).filter(Boolean))].sort((a, b) => b.length - a.length);
  const lines: string[] = [];
  let pos = 0;
  while (pos < alert.length) {
    const next = pieces.find((v) => alert.startsWith(v, pos) && (pos + v.length === alert.length || alert[pos + v.length] === ' '));
    if (!next) return [];
    lines.push(next);
    pos += next.length + 1;
  }
  return lines;
}

/** The values this recording's own reads published — see maskPublishedValues. */
export function publishedReadValues(steps: readonly RecordedStep[], reportValues: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const step of steps) {
    if (step.tool !== 'read' && step.tool !== 'read_all') continue;
    if (step.args.target !== '(read-back)' && !readLabel(step, reportValues)) continue;
    if (step.result === undefined) continue;
    let observed: unknown;
    try {
      observed = JSON.parse(step.result);
    } catch {
      observed = step.result;
    }
    for (const v of Array.isArray(observed) ? observed : [observed]) {
      const s = String(v ?? '').trim();
      // A marker is already parameterised, and a multi-line read is prose the
      // page never shows as one snapshot line.
      if (s && !s.includes('{{') && !s.includes('\n')) out.add(s);
    }
  }
  // Longest first, so a read that published "£ 279.00" masks it before one
  // that published "279.00" can take half of it.
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * A NAME THE RECORDING ITSELF WATCHED CHANGE IS NOT A LANDMARK.
 *
 * maskPublishedValues reaches a value the procedure reported. It does not
 * reach one the recording merely passed THROUGH: fwod60 s_292da2 added a
 * £12 line to a £255 quotation and recorded `- row "{{v9}} £ 267.00"`, then
 * set the quantity to 2 and recorded `- row "{{v9}} £ 279.00"`. 267 was never
 * read and never reported — it is one keystroke of arithmetic — and as the
 * step's only slotted line it was the whole HARD half of the expectation.
 * Every replay stopped there ("the page did not show `- row \"Untaxed
 * Amount: £ 210.00 £ 267.00\"`"), twice, and the skill demoted.
 *
 * The evidence is the recording's own two looks: the SAME element — same
 * role, same run-scoped slots in the same order, which is what pins identity
 * across two snapshots — carried two different names. A name the procedure
 * changed is a field it moves, not a landmark it can be checked against, so
 * the parts that differ become the wildcard in every occurrence. This is the
 * ledger's `basis: 'variance'` argument (shape.ts, "cross-run variance")
 * applied inside one recording: one demonstration of difference decides, and
 * agreement decides nothing — a name seen once is left exactly as recorded.
 *
 * Two looks at DIFFERENT steps, never two lines of one diff: one snapshot
 * showing `- row "{{v1}} A"` and `- row "{{v1}} B"` is two rows, not one row
 * twice.
 */
function unfreezeWatchedNames(steps: readonly SkillStep[]): number {
  interface Occurrence {
    step: number;
    line: number;
    parts: string[];
    markers: string[];
  }
  const byKey = new Map<string, Occurrence[]>();
  steps.forEach((step, si) => {
    (step.expect?.addedContains ?? []).forEach((line, li) => {
      const split = splitExpectLine(line);
      if (!split?.name) return;
      const markers = split.name.match(NAME_SLOT);
      if (!markers) return;
      const key = `${split.role}|${markers.join('')}`;
      const parts = split.name.split(NAME_SLOT);
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push({ step: si, line: li, parts, markers });
    });
  });
  let changed = 0;
  for (const group of byKey.values()) {
    if (new Set(group.map((o) => o.step)).size < 2) continue;
    const width = group[0].parts.length;
    const variable = Array.from({ length: width }, (_, i) => new Set(group.map((o) => o.parts[i] ?? '')).size > 1);
    if (!variable.some(Boolean)) continue;
    for (const o of group) {
      // A part that only ever held whitespace between two markers is the
      // snapshot's own spacing, not a value: blanking it would say nothing
      // and would read as a second wildcard.
      const name = o.parts
        .map((p, i) => (variable[i] && p.trim() ? `${/^\s/.test(p) ? ' ' : ''}${WILDCARD}` : p))
        .reduce((acc, p, i) => acc + p + (o.markers[i] ?? ''), '');
      const line = steps[o.step].expect!.addedContains![o.line];
      const split = splitExpectLine(line)!;
      const next = split.rebuild(name, split.value);
      if (next === line) continue;
      steps[o.step].expect!.addedContains![o.line] = next;
      changed += 1;
    }
  }
  return changed;
}

/**
 * Both provenance rules above, over a whole segment's expectations, plus the
 * sweep that follows them: a line the wildcard has emptied identifies no
 * element and is dropped by the rule that already drops `- cell ""`
 * (identifiesNothing), and two lines that collapse onto each other are one.
 *
 * A step left with nothing keeps its url expectation and loses its content
 * one — which is the honest outcome, not a weakening: every line it held was
 * a value only the recording run could produce, so the gate had nothing to
 * check before this ran either, and stopping on it was the bug.
 */
export function unfreezeExpectations(
  steps: SkillStep[],
  published: readonly string[],
  notes: TransformNote[],
  alertEvidence: { reads: readonly string[]; diffOf: (step: SkillStep) => StepDiff | undefined; slots?: ReadonlyMap<string, string> } = { reads: [], diffOf: () => undefined },
): void {
  const watched = unfreezeWatchedNames(steps);
  steps.forEach((step, si) => {
    // The alert too: it is the same recorded page change, one channel over.
    // snipeit fwsi4 03-create's save expected an alert containing "Success: ×
    // Asset with tag BA-00004 was created successfully." — the tag the create
    // minted and the procedure's own reads published, so no other run could
    // raise it. alertVerdict (gates.ts, shared by both runners) matches a
    // plain substring with no wildcard, so the text is CUT before the first
    // published value rather than masked: "Success: × Asset with tag" is the
    // part every run shows. Nothing left before it, no alert expectation.
    //
    // A published value that is a whole LINE of the alert is the alert read
    // back, not a value inside it, and never cuts — the whole-alert
    // exemption, per line. repairdesk fwrd83-n1 06-change raised "Ticket is
    // not ready" over two part lines; its reads published the first line as
    // `refusal_text_1`, at offset 0, so the cut left "" and deleted the
    // expectation; alertVerdict then took the refusal the step exists to
    // provoke for an unexpected alert, and n2, n3 and the compiled script
    // all failed. The lines come from the recording (alertLines); the
    // stored alert stays collapsed. fwsi4's BA-00004 is inside a line and
    // still cuts.
    const alert = step.expect?.alertContains;
    if (alert !== undefined && published.length) {
      const raw = alertEvidence.diffOf(step)?.alerts?.[0] ?? alert;
      const cut = cutAtPublishedValue(alert, published, alertLines(raw, alertEvidence.reads, published));
      if (cut !== alert) {
        if (cut) step.expect!.alertContains = cut;
        else {
          delete step.expect!.alertContains;
          if (!step.expect!.addedContains?.length && !step.expect!.removedContains) delete step.expect!.lineDialect;
          if (!Object.keys(step.expect!).length) delete step.expect;
        }
        notes.push({ name: 'unfreezeExpectations', at: si + 1, reason: `recorded alert carried a value only the recording run could produce: ${JSON.stringify(alert)} → ${JSON.stringify(cut)}` });
      }
    }
    const lines = step.expect?.addedContains;
    if (!lines) return;
    const before = lines.join('\n');
    const kept: string[] = [];
    // What the procedure SET up to and including this step (setValuesUpTo),
    // and what this step's page showed before it acted (its recorded
    // removals) — see keepSetValues and identifiesNothingNew.
    const sets = setValuesUpTo(steps, si, alertEvidence.slots);
    const shownBefore = alertEvidence.diffOf(step)?.removed ?? [];
    for (const line of lines) {
      const masked = published.length ? maskPublishedValues(line, published, sets) : line;
      if (identifiesNothing(masked) || kept.includes(masked)) continue;
      if (masked !== line && identifiesNothingNew(masked, shownBefore, alertEvidence.slots)) continue;
      kept.push(masked);
    }
    if (kept.join('\n') === before) return;
    if (kept.length) step.expect!.addedContains = kept;
    else {
      delete step.expect!.addedContains;
      // lineDialect describes addedContains, alertContains and
      // removedContains; with none left it describes nothing, and an
      // expectation of nothing but a dialect is no expectation.
      if (!step.expect!.alertContains && !step.expect!.removedContains) delete step.expect!.lineDialect;
      if (!Object.keys(step.expect!).length) delete step.expect;
    }
    notes.push({
      name: 'unfreezeExpectations',
      at: si + 1,
      reason: `recorded page change(s) only the recording run could produce: ${JSON.stringify(before.split('\n'))} → ${JSON.stringify(kept)}`,
    });
  });
  if (watched && !notes.some((n) => n.name === 'unfreezeExpectations')) {
    notes.push({ name: 'unfreezeExpectations', at: 1, reason: `${watched} expectation line(s) carried a name this recording watched change` });
  }
}

/**
 * Clock and calendar tokens in a recorded page line are the RECORDING's
 * moment, not the procedure's effect: kanboard names its due-date textbox
 * after the current minute ("09/03/2026 07:22"), so the fill's expectation
 * `- textbox "09/03/2026 07:22": {{v3}}` — HARD, because it carries the slot
 * — could never match a replay nine minutes later, and fwkb3 sent every
 * due-date step to recovery. The caller's own date is already a slot by the
 * time this runs (substitute() went first), so what is left is volatile and
 * becomes a `{{*}}` wildcard that lineShows() matches against anything short
 * of a line break.
 */
export { WILDCARD, maskVolatile } from '../shared/text.js';

/** If a read's result equals one of the report's evidence values, label it with that key. */
function readLabel(step: RecordedStep, values: Record<string, unknown>): string | undefined {
  if (step.tool !== 'read' && step.tool !== 'read_all') return undefined;
  // Carried from the report, where the name came from. Exact beats matching.
  if (step.label && step.label in values) return step.label;
  if (step.result === undefined) return undefined;
  let observed: unknown;
  try {
    observed = JSON.parse(step.result);
  } catch {
    observed = step.result;
  }
  const flat = Array.isArray(observed) ? observed.map(String) : [String(observed)];
  // A list read is the LIST first: a read_all of three panel headings whose
  // first element happens to equal a per-item value was labelled with that
  // item (fwgr23: `read_all h2` → panel_title_request_rate) and the value the
  // report joined from the whole list — panel_titles — was never published.
  if (flat.length > 1) {
    const joined = new Set([', ', ' | ', '; ', ' ', '\n', ','].map((sep) => flat.map((f) => f.trim()).join(sep)));
    for (const [key, v] of Object.entries(values)) if (joined.has(String(v).trim())) return key;
    // …and ONLY the joined form. A plural read publishes what flattenRead
    // joins, so labelling it from one element names a value it will never
    // produce. fwod53: `read_all td` over an order row matched the reported
    // product_name on element two and took that label, so the reference
    // filled to the whole row — " | [FURN…] | [FURN…] | 3.00 | 295.00 | 20% |
    // £ 885.00 | " — and `- cell "{{v4}}"` could not match any cell. The step
    // had done its work; the value was garbage. Unlabelled, the output goes
    // unpublished and liveReadsFor synthesizes a real single-element read for
    // it, which the unproven machinery then proves, retires or refuses.
    return undefined;
  }
  for (const [key, v] of Object.entries(values)) {
    const s = String(v).trim();
    if (s && flat.some((f) => f.trim() === s)) return key;
  }
  return undefined;
}

/**
 * A list read that is the SOURCE of several reported values, split into one
 * read per element: the read_all's chain with `nth` i, labelled with the value
 * that element carried, at the read_all's position.
 *
 * openproject fwop7-n1 02-open read the seed subjects only through `read_all`
 * (three elements, each exactly a reported `seed_subject_N_full_cell_text`).
 * readLabel refuses a list read whose JOINED text matches no value (fwod53,
 * below), so the replayable filter dropped it; liveReadsFor found no page line
 * for values carrying "
"; export pruned them; and every replay then
 * reported no subjects at all (obj 1 FAIL on n2 and n3).
 *
 * Only a one-to-one match qualifies: EVERY non-empty element equals the whole
 * of a reported value, each a different one, and there are at least two. That
 * is what separates it from fwod53, where one cell of an order row matched
 * `product_name` and the rest was junk — that read stays dropped. A read_all
 * whose joined text is itself a reported value keeps its list label
 * (readLabel). Empty elements keep their position (nth counts every match)
 * and publish nothing. A point candidate names one spot, never the ith match,
 * and a candidate already carrying an nth is not re-indexed; they are left
 * out of each element's chain.
 */
export function expandListReads(steps: readonly RecordedStep[], values: Record<string, unknown>): RecordedStep[] {
  const out: RecordedStep[] = [];
  for (const step of steps) {
    const expanded = step.tool === 'read_all' && step.result !== undefined && readLabel(step, values) === undefined ? listSources(step, values) : null;
    if (!expanded) {
      out.push(step);
      continue;
    }
    const chain = (step.locators.target?.chain ?? []).filter((c) => c.kind !== 'point' && c.nth === undefined);
    if (!chain.length) {
      out.push(step);
      continue;
    }
    for (const { index, element, key } of expanded) {
      out.push({
        ...step,
        tool: 'read',
        args: { ...step.args, label: key },
        locators: { ...step.locators, target: { ...step.locators.target, chain: chain.map((c) => ({ ...c, nth: index })) } },
        result: JSON.stringify(element),
        label: key,
      });
    }
  }
  return out;
}

/** Each non-empty element of a list read with the distinct reported value it equals, or null unless every one has one (expandListReads). */
function listSources(step: RecordedStep, values: Record<string, unknown>): { index: number; element: string; key: string }[] | null {
  let observed: unknown;
  try {
    observed = JSON.parse(step.result!);
  } catch {
    return null;
  }
  if (!Array.isArray(observed)) return null;
  const used = new Set<string>();
  const out: { index: number; element: string; key: string }[] = [];
  for (const [index, raw] of observed.entries()) {
    if (typeof raw !== 'string') return null;
    const element = raw.trim();
    if (!element) continue;
    const key = Object.keys(values).find((k) => !used.has(k) && String(values[k] ?? '').trim() === element);
    if (!key) return null;
    used.add(key);
    out.push({ index, element: raw, key });
  }
  return out.length >= 2 ? out : null;
}

function firstUrl(steps: RecordedStep[]): string | undefined {
  const goto = steps.find((s) => s.tool === 'goto' && typeof s.args.url === 'string');
  return goto ? String(goto.args.url) : undefined;
}

/**
 * Candidates whose selector text embeds something id-like (`ticket-link-t15`,
 * `#row-1042`) were unique on the recorded page but will name a *different*
 * element on the next run. They stay in the chain as a last resort; the
 * semantic candidates (role+name, label, text — now parameterised) go first.
 */
export function stableFirst(chain: LocatorCandidate[]): LocatorCandidate[] {
  const volatile = (c: LocatorCandidate): boolean => {
    // Where it was is the last resort by definition: behind every name and
    // every path. fwgr27's store had it second, ahead of the anchored path.
    if (c.kind === 'point') return true;
    // The same test as `bookmarked`, extended to css paths.
    if (c.kind === 'testid' || c.kind === 'id' || c.kind === 'css') {
      const text = c.kind === 'testid' ? c.value : c.selector;
      return skeleton(text) !== text;
    }
    // A name that is nothing but an id ("RD-1017") names a record, not a
    // control: the same element next run will carry a different one.
    const name = c.kind === 'role' ? c.name : c.kind === 'text' ? c.text : '';
    return Boolean(name) && !name.includes('{{') && digitDominant(name, 'ordering');
  };
  const stable = chain.filter((c) => !volatile(c));
  const points = chain.filter((c) => c.kind === 'point');
  const rest = chain.filter((c) => volatile(c) && c.kind !== 'point');
  return stable.length || points.length ? [...stable, ...rest, ...points] : chain;
}

/** Steps are structurally the same procedure: same tools, same primary locator shapes. */
export function sameProcedure(a: Skill, b: Skill): boolean {
  if (a.steps.length !== b.steps.length) return false;
  return a.steps.every((s, i) => {
    const t = b.steps[i];
    if (s.tool !== t.tool) return false;
    // The same Save in the page and in a payment frame are two procedures.
    if (!contextsEqual(s.contexts, t.contexts) || s.page !== t.page || JSON.stringify(s.effect ?? null) !== JSON.stringify(t.effect ?? null)) return false;
    // Same procedure = same tools driven by the same KIND of primary locator,
    // regardless of the literal value (a label of 'Name' vs 'Name *', a role
    // name that is a parameter or a record id). This is what lets two runs'
    // "add a part" skills merge instead of fragmenting the store; the literal
    // differences are exactly the parameters the skills already carry.
    return locatorShape(s.locators.target?.[0]) === locatorShape(t.locators.target?.[0]);
  });
}

/**
 * Whether two procedures say the same things about WHERE they act: the frame
 * each target lives in, the page each step runs on and what it does to it.
 * A merge by template alone must not fold a recording of the payment frame's
 * Save into a procedure that presses the page's own.
 */
export function samePageContexts(a: Skill, b: Skill): boolean {
  const signature = (steps: SkillStep[]): unknown[] =>
    steps.map((s) => [
      Object.fromEntries(Object.entries(s.contexts ?? {}).filter(([, c]) => c?.frame?.length).map(([k, c]) => [k, c!.frame])),
      s.page ?? null,
      s.effect ?? null,
      s.whileContext?.frame ?? null,
      s.body ? signature(s.body) : null,
    ]);
  return JSON.stringify(signature(a.steps)) === JSON.stringify(signature(b.steps));
}

/** A locator's structural shape for merge comparison: its kind, plus the
 * skeleton of a css/id selector, so `#row-1042 > a` and `#row-77 > a` match. */
function locatorShape(c: LocatorCandidate | undefined): string {
  if (!c) return 'none';
  if (c.kind === 'css' || c.kind === 'id') return `${c.kind}:${skeleton(c.selector)}`;
  return c.kind;
}

const MAX_GROUP_LEN = 3;
const LOOP_MAX_ITER_CAP = 50;
// A loop iterates an ACTION over records (delete each part, ...). Its anchor
// must be a click; a group may carry connector controls (dialog_expect) but
// never an observation — folding consecutive read-backs into a loop, which they
// superficially resemble (same shape, per-record ids), is a bug: reads observe,
// they do not iterate.
const LOOP_ANCHOR_TOOLS = new Set(['click', 'dblclick', 'modifier_click', 'right_click']);
const NON_LOOP_TOOLS = new Set(['read', 'read_all', 'eval', 'screenshot']);

/**
 * Collapse a run of consecutive, identical control steps that carry no target
 * (chiefly `dialog_expect`, which the agent often re-arms redundantly) into
 * one. Arming the same handler twice is a no-op, but the extra copies land
 * unevenly between otherwise-identical action groups and stop foldLoops from
 * seeing the repetition. Only no-locator steps with byte-identical args are
 * touched, so real actions are never merged.
 */
export function coalesceControls(steps: SkillStep[], notes?: TransformNote[]): SkillStep[] {
  const out: SkillStep[] = [];
  for (const [i, step] of steps.entries()) {
    const prev = out[out.length - 1];
    const noTarget = !step.locators.target?.length && !step.locators.source?.length;
    if (prev && noTarget && !step.effect && !prev.effect && prev.tool === step.tool && !prev.locators.target?.length && JSON.stringify(prev.args) === JSON.stringify(step.args)) {
      notes?.push({ name: 'coalesceControls', at: i + 1, reason: `repeat of the previous ${step.tool} with identical args and no target of its own` });
      continue;
    }
    out.push(step);
  }
  return out;
}

/**
 * Drop a navigation whose destination another navigation immediately
 * replaces. The agent explores — fwod6's step-01 skill recorded `goto /web`,
 * a hand-built `#action=&…&menu_id=` url, then `goto /web?cids=1` — and a
 * procedure that re-walks the search is not the procedure, just its history.
 * Only strictly adjacent navigations qualify: once anything else ran, the
 * intermediate page may have been load-bearing (a session bootstrap, a
 * redirect that set a cookie), and this cannot tell from the outside.
 */
export function dropSupersededNavigation(steps: SkillStep[], notes?: TransformNote[]): SkillStep[] {
  return steps.filter((step, i) => {
    const superseded = step.tool === 'goto' && steps[i + 1]?.tool === 'goto';
    if (superseded) notes?.push({ name: 'dropSupersededNavigation', at: i + 1, reason: `the next step navigates again, to ${JSON.stringify(String(steps[i + 1].args.url ?? ''))}` });
    if (superseded) return false;
    const replacedBy = abandonedLinkClick(steps, i);
    if (replacedBy !== null) {
      notes?.push({ name: 'dropSupersededNavigation', at: i + 1, reason: `a link click that recorded no consequence, replaced by the goto at step ${replacedBy + 1}` });
      return false;
    }
    const repeatedBy = abandonedRepeatClick(steps, i);
    if (repeatedBy !== null) {
      notes?.push({ name: 'dropSupersededNavigation', at: i + 1, reason: `a click that recorded no consequence, repeated with one at step ${repeatedBy + 1}` });
      return false;
    }
    return true;
  });
}

/** A click's primary locator — the first candidate it was recorded with — as a comparable key. */
function primaryLocator(step: SkillStep): string | null {
  const first = step.locators.target?.[0];
  return first ? JSON.stringify(first) : null;
}

/** A click that recorded nothing at all: no page change, alert, effect, mint or label, and not a toggle. */
function consequenceFree(steps: readonly SkillStep[], k: number): boolean {
  const s = steps[k];
  if (s.tool !== 'click' || s.effect || s.mints || s.label !== undefined || s.toggle) return false;
  const e = s.expect;
  if (e?.addedContains?.length || e?.removedContains?.length || e?.alertContains) return false;
  const before = steps.slice(0, k).reverse().find((p) => p.expect?.urlPattern)?.expect?.urlPattern;
  return !before || !e?.urlPattern || e.urlPattern === before;
}

/**
 * A click the recording saw do NOTHING that a later click on the same element
 * then did for real: the index of that later click, else null.
 *
 * espocrm fwec5-n1 03-create: the first Save recorded no consequence (still
 * on /#Opportunity/create, nothing added, no alert); the agent re-entered the
 * amount and saved again, which navigated and minted the record. s_b45e41
 * kept both Saves, and on replay the FIRST one worked: it navigated, and its
 * own recorded url, `…/#Opportunity/create`, stopped the step (n2, n3: three
 * recovery turns each). The repeat is the gesture the procedure relies on;
 * the first was a failed attempt at the same thing.
 *
 * Narrow on purpose. The later click shares the first one's PRIMARY locator
 * and recorded a consequence (a different url, a mint, an added line or an
 * alert). Only field work lies between: fills, types, presses, reads, and
 * clicks with no consequence on an element a fill, type or press in the same
 * window acts on (focusing the field it re-entered). A repeat that ALSO
 * recorded nothing is no evidence either click failed; a toggle, a click with
 * a page effect, a mint or a label is never dropped (consequenceFree).
 */
function abandonedRepeatClick(steps: readonly SkillStep[], i: number): number | null {
  if (!consequenceFree(steps, i)) return null;
  const key = primaryLocator(steps[i]);
  if (!key) return null;
  const fieldTargets = new Set<string>();
  for (let j = i + 1; j < steps.length; j++) {
    const s = steps[j];
    if (s.tool === 'click' && primaryLocator(s) === key) break;
    if (s.tool === 'fill' || s.tool === 'type' || s.tool === 'press') {
      const k = primaryLocator(s);
      if (k) fieldTargets.add(k);
    }
  }
  for (let j = i + 1; j < steps.length; j++) {
    const s = steps[j];
    if (s.tool === 'click' && primaryLocator(s) === key) {
      if (consequenceFree(steps, j) || s.toggle || s.effect) return null;
      const e = s.expect;
      const before = steps.slice(0, j).reverse().find((p) => p.expect?.urlPattern)?.expect?.urlPattern;
      const moved = Boolean(e?.urlPattern && before && e.urlPattern !== before);
      return moved || s.mints || e?.addedContains?.length || e?.alertContains ? j : null;
    }
    if (['fill', 'type', 'press', 'read', 'read_all', 'wait_for'].includes(s.tool)) continue;
    const k = primaryLocator(s);
    if (s.tool === 'click' && consequenceFree(steps, j) && k && fieldTargets.has(k)) continue;
    return null;
  }
  return null;
}

/**
 * A link click the recording saw do NOTHING, that a goto then replaced: the
 * index of that goto, else null.
 *
 * openproject fwop6 01-signin clicked the Bench Project link twice; neither
 * click recorded a page change, `read url` still said /projects, and the
 * agent typed `goto /projects/bench-project`. s_4b8679 kept all three. On
 * replay the first click DID navigate, and the second was stranded on the
 * project page: "stopped at step 2 — expected url /projects but browser is
 * at /projects/bench-project". The goto is the navigation the procedure
 * relies on; the clicks before it were failed attempts at the same thing.
 *
 * Narrow on purpose. A LINK (a link role, or an <a> the recorder pointed
 * at) — a button click with no visible change can still have done work the
 * page does not show. No recorded consequence of any kind: no added or
 * removed line, no alert, no page effect, no mint, no label, and the url
 * pattern of the page it ran on (the previous step's, where one was
 * recorded). And the goto comes before any other gesture: only observations
 * (reads, waits) and further such clicks lie between.
 */
function abandonedLinkClick(steps: readonly SkillStep[], i: number): number | null {
  const inert = (k: number): boolean => {
    const s = steps[k];
    if (s.tool !== 'click' || s.effect || s.mints || s.label !== undefined || s.toggle) return false;
    const chain = s.locators.target ?? [];
    const link = chain.some((c) => (c.kind === 'role' && c.role === 'link') || (c.kind === 'point' && c.tag === 'a'));
    if (!link) return false;
    const e = s.expect;
    if (e?.addedContains?.length || e?.removedContains?.length || e?.alertContains) return false;
    const before = steps.slice(0, k).reverse().find((p) => p.expect?.urlPattern)?.expect?.urlPattern;
    return !before || !e?.urlPattern || e.urlPattern === before;
  };
  if (!inert(i)) return null;
  for (let j = i + 1; j < steps.length; j++) {
    const s = steps[j];
    if (s.tool === 'goto') return j;
    if (s.tool === 'read' || s.tool === 'read_all' || s.tool === 'wait_for') continue;
    if (inert(j)) continue;
    return null;
  }
  return null;
}


/**
 * Drop a dialog the recording opened and immediately dismissed. fwgr25's
 * create step recorded Exit edit → "Discard changes to dashboard?" → Cancel,
 * because the RECORDING had unsaved edits when the model clicked Exit edit
 * and then thought better of it. The pair did nothing to the app, but a
 * replay with nothing unsaved has no dialog to cancel: Exit edit simply
 * exits, and every step that expected to still be in edit mode fails (5/18
 * on both replays, 23–49 model turns). Evidence-based: step N's recorded
 * effect includes a dialog, step N+1 clicks a button that dialog listed,
 * that button is named as a dismissal, and step N+1 recorded no page change
 * of its own. A confirm ("Discard", "Delete", "Save") never matches.
 */
export function dropDismissedDialogs(steps: SkillStep[], notes?: TransformNote[], diffOf?: (step: SkillStep) => StepDiff | undefined): SkillStep[] {
  const out: SkillStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const opener = steps[i];
    const closer = steps[i + 1];
    const added = opener.expect?.addedContains ?? [];
    const opensDialog = added.some((l) => /^-\s*dialog\b/.test(l));
    // "Added nothing to the page" is not "did nothing". A dismissal that
    // NAVIGATED, that the procedure reads a value from, that raised an alert,
    // or that creates a record, has consequences the added-lines list cannot
    // show — and the pair used to be dropped on the strength of that list
    // alone. Every step carries the url it ran on, so what marks a navigation
    // is the closer's destination DIFFERING from the opener's, not its
    // presence. Any other recorded consequence keeps both steps.
    const inert =
      closer?.tool === 'click' &&
      !closer.expect?.addedContains?.length &&
      (closer.expect?.urlPattern ?? null) === (opener.expect?.urlPattern ?? null) &&
      !closer.expect?.alertContains &&
      !closer.mints &&
      !closer.effect &&
      framesEqual(opener.contexts?.target?.frame, closer.contexts?.target?.frame) &&
      closer.label === undefined &&
      !takesMoreThanTheDialog(diffOf?.(opener), diffOf?.(closer));
    if (opensDialog && inert) {
      const primary = (closer.locators.target ?? [])[0] as { kind?: string; role?: string; name?: string; text?: string } | undefined;
      const name = primary?.kind === 'role' && primary.role === 'button' ? primary.name : primary?.kind === 'text' ? primary.text : undefined;
      const listed = name !== undefined && added.some((l) => l.includes(`button "${name}"`));
      if (name && listed && DISMISSAL.test(name.trim())) {
        notes?.push({
          name: 'dropDismissedDialogs',
          at: i + 1,
          reason: `opened a dialog and step ${i + 2} clicked its ${JSON.stringify(name)}, a dismissal that recorded no consequence of its own`,
        });
        i += 1; // skip the closer too
        continue;
      }
    }
    out.push(opener);
  }
  return out;
}

/**
 * Whether a dialog's closer took away more than the dialog its opener raised.
 *
 * A closer's expectation cannot say: expectationFor keeps a removal only when
 * it was the dialog alone, and a consequential one leaves NO expectation — so
 * "recorded nothing" read as "did nothing". fwec4 n1 02-create pressed Escape
 * on a filled form ("Are you sure you want to leave the form?") and clicked
 * Cancel, whose removals included `- textbox "": 2026-12-31`: the close date
 * the form had held was gone. The pair was dropped as inert, and the retype
 * of that date landed on a field still holding the earlier fill, so its
 * calendar never showed "December 2026" (02-create stopped at s_524fe0 step
 * 19 on both replays, 26 and 29 recovery turns).
 *
 * The recording decides: a removed line the opener did not add, and that is
 * not a dialog line itself, is the page's own state going with the dialog.
 * No diffs (a caller with only the compiled steps, or a recorder that kept no
 * removals) leaves the verdict to the expectation, as before.
 */
function takesMoreThanTheDialog(opener: StepDiff | undefined, closer: StepDiff | undefined): boolean {
  if (!opener || !closer?.removed?.length) return false;
  const raised = new Set(opener.added.map((l) => l.trim()));
  return closer.removed.some((l) => !TRANSIENT_LINE.test(l) && !DIALOG_LINE.test(l) && !raised.has(l.trim()));
}

/** A candidate's identity with per-record ids blanked — its shape AND its name/value. */
function candSkeleton(c: LocatorCandidate): string {
  switch (c.kind) {
    case 'role':
      return `role:${c.role}:${skeleton(c.name ?? '')}`;
    case 'text':
      return `text:${skeleton(c.text ?? '')}`;
    case 'label':
      return `label:${skeleton(c.label ?? '')}`;
    case 'placeholder':
      return `placeholder:${skeleton(c.placeholder ?? '')}`;
    case 'testid':
      return `testid:${skeleton(c.value)}`;
    default:
      return locatorShape(c);
  }
}

function chainSkeleton(chain: LocatorCandidate[] | undefined): string {
  return (chain ?? []).map(candSkeleton).join('|');
}

/** Two steps are the same procedure applied to (possibly) a different record. */
function loopEquivalent(a: SkillStep, b: SkillStep): boolean {
  if (a.tool !== b.tool || a.tool === 'loop') return false;
  // Two identical controls in different frames or pages are not one control
  // met twice, and a step that moves the procedure to another page is never
  // iteration.
  if (!contextsEqual(a.contexts, b.contexts) || a.page !== b.page || a.effect || b.effect) return false;
  // Same procedure means the same TYPED values too: two edits that set
  // different quantities are two steps, not one loop replaying the first
  // group's value on every record. Targets are per-record by design.
  const typed = (s: SkillStep) => JSON.stringify(Object.fromEntries(Object.entries(s.args).filter(([k]) => k !== 'target' && k !== 'source')));
  return typed(a) === typed(b) && chainSkeleton(a.locators.target) === chainSkeleton(b.locators.target) && chainSkeleton(a.locators.source) === chainSkeleton(b.locators.source);
}

/** True when two groups differ in a *raw* id somewhere — proof they act on distinct records, not an accidental repeat. */
function differsInRawId(a: SkillStep[], b: SkillStep[]): boolean {
  const raw = (g: SkillStep[]) => JSON.stringify(g.map((s) => [s.locators.target ?? [], s.locators.source ?? []]));
  return raw(a) !== raw(b);
}

/**
 * A universal quantifier in the CALLER's own instruction: the one piece of
 * evidence in a recording that speaks about scope rather than about what
 * happened once. "Delete all the parts" authorises draining a collection;
 * "delete part A and part B" does not, however many times the two look alike
 * in the trace.
 *
 * The list is deliberately short, and "remaining" is deliberately not on it as
 * a bare word. Rebuilding every published recording found five folded loops,
 * and the one this rule sent to `drain` was a false positive: "after it closes,
 * the REMAINING modal is titled 'Cancel {{v3}}'" — an instruction that opens by
 * saying there are exactly TWO dialogs and then numbers the steps. There,
 * "remaining" is an adjective picking out one specific thing, not a quantifier
 * over a collection, and the giveaway is the definite article. "Delete
 * remaining items" and "any remaining rows" still read as universal; "the
 * remaining modal" no longer does. Missing a genuine universal costs a loop
 * that stops at the recorded count, which is the safe direction; reading one
 * into "the remaining modal" costs authority over a collection nobody counted.
 */
const UNIVERSAL = /\b(all|every|each|entire|whole)\b|(?<!\bthe\s)\bremaining\b/i;

/**
 * Collapse a run of ≥2 consecutive, structurally-identical action groups that
 * differ only in a per-record id — the signature of iterating over a list (e.g.
 * deleting each part in turn) — into a single `loop` step. Conservative by
 * construction: distinct fields (a title vs a customer box) have different
 * skeletons and never fold, and an accidental identical repeat (no id
 * difference) is left alone.
 *
 * What the fold does NOT decide is how many records the loop may touch. It
 * used to: two deletions became a loop capped at seven, which is authority
 * over a collection nobody had looked at, and a list of ten came back with
 * three rows left and a success. One trace cannot say whether the job was
 * "these two" or "all of them" — so the loop is bounded to the work that was
 * observed unless the instruction itself quantifies universally, and the
 * generalisation that remains by default is the one the evidence supports:
 * the locators are re-resolved every pass, so the SAME number of records is
 * worked however the app has reordered or renumbered them.
 */
export function foldLoops(steps: SkillStep[], instruction = '', notes?: TransformNote[]): SkillStep[] {
  const quantifier = UNIVERSAL.exec(instruction);
  const drain = Boolean(quantifier);
  const out: SkillStep[] = [];
  let i = 0;
  while (i < steps.length) {
    let folded = false;
    // Prefer the smallest group length so [del, confirm] folds before [del]×2.
    for (let len = 1; len <= MAX_GROUP_LEN && i + 2 * len <= steps.length; len++) {
      const group = steps.slice(i, i + len);
      if (group.some((s) => s.tool === 'loop' || NON_LOOP_TOOLS.has(s.tool))) continue;
      // The body must anchor on a repeatable, locate-able ACTION (a click on a
      // record's control), never an observation.
      if (!LOOP_ANCHOR_TOOLS.has(group[0].tool) || !group[0].locators.target?.length) continue;
      let count = 1;
      const groups: SkillStep[][] = [group];
      while (i + (count + 1) * len <= steps.length) {
        const next = steps.slice(i + count * len, i + (count + 1) * len);
        if (!group.every((s, k) => loopEquivalent(s, next[k]))) break;
        groups.push(next);
        count++;
      }
      if (count < 2) continue;
      // Require a real per-record id difference across at least one pair, so we
      // only fold genuine iteration, never a control legitimately hit twice.
      if (!groups.slice(1).some((g) => differsInRawId(group, g))) continue;
      out.push({
        tool: 'loop',
        args: {},
        locators: {},
        body: group,
        while: group[0].locators.target,
        ...(group[0].contexts?.target?.frame?.length ? { whileContext: group[0].contexts.target } : {}),
        // Bounded: exactly the records the recording worked. Drain: room to
        // outgrow the recorded list, still with a runaway guard.
        max: drain ? Math.min(count * 2 + 3, LOOP_MAX_ITER_CAP) : count,
        scope: drain ? 'drain' : 'observed',
      });
      notes?.push({
        name: 'foldLoops',
        at: i + 1,
        reason: drain
          ? `${count} identical action group(s) folded into a loop allowed to DRAIN the collection, because the instruction said ${JSON.stringify(quantifier![0])}`
          : `${count} identical action group(s) folded into a loop bounded to those ${count}, because the instruction quantifies nothing`,
      });
      i += count * len;
      folded = true;
      break;
    }
    if (!folded) out.push(steps[i++]);
  }
  return out;
}
