import fs from 'node:fs';
import path from 'node:path';
import type { ElementHandle, Frame, Locator, Page } from 'playwright-core';
import { ensureSessionDir } from '../shared/paths.js';
import { FRAME_MARK, escapeRe, fieldByName, frameValue, hasTextMatcher, implicitRoles, roleName, unfreezeFrame, volatileMatcher } from '../shared/text.js';
import { urlParts } from '../execution/url.js';
import { pointLocator } from '../execution/point.js';
import { dispatchesFirstMatch } from '../execution/lifecycle.js';
import { rootFor, type FramePath, type PageEffect, type Root } from '../execution/context.js';
import { urlPattern } from '../skills/compile.js';
import { foldValue } from '../skills/flow.js';
import { isRefTarget, refHint, refOf, resolveTarget } from './refs.js';
import { tagComponent } from '../skills/components.js';
import { GENERATED_ID_HEX_RUN, skeleton } from '../skills/shape.js';
import { flattenContainedComposite, type Report } from '../agent/report.js';
import { evalResultForRecord } from './eval-result.js';
import type { StepEvidence, StepFailure } from './step-evidence.js';
import type { StepJournal } from './journal.js';

/**
 * One way of finding an element, in a form that can be rebuilt into a Locator
 * on a different page load (no expression strings to parse). `nth` is present
 * only when the candidate was checked against the recorded element and matched
 * at that index; a candidate without it is a fallback that must resolve to
 * exactly one element to be trusted at replay.
 */
export type LocatorCandidate = (
  | { kind: 'testid'; attr: string; value: string }
  | { kind: 'role'; role: string; name: string }
  | { kind: 'label'; label: string }
  | { kind: 'placeholder'; placeholder: string }
  | { kind: 'id'; selector: string }
  | { kind: 'text'; text: string }
  | { kind: 'css'; selector: string }
  /**
   * Identity-scoped: the element found INSIDE the repeated container (a table
   * row, a list item) that shows `hasText`. The one locator shape that names
   * a RECORD rather than a position — `hasText` carries a caller-vouched
   * value, so compile slots it and every replay re-binds it to its own
   * record. fwrd10-n2 is why it exists: its read-backs were pinned to
   * `#ticket-rows > tr:nth-of-type(1)`, the newly created ticket was not row
   * 1 on that run, and the flow published the SEED ticket's reference as its
   * own identity — every later step then worked the wrong ticket.
   */
  | { kind: 'scoped'; container: string; hasText: string; selector?: string }
  /**
   * Where the element WAS: its box in document coordinates and the viewport
   * it was recorded in, plus the role (or tag) it had. Last in every chain.
   * Two jobs: the element under the recorded point, walked up to its
   * actionable ancestor, is a final candidate that stands only when its role
   * matches — a locator, not a blind click; and the box is the yardstick a
   * positional guess is measured against (see resolveChain's plausible):
   * rpgr13's structural fallback resolved a header button when the recorded
   * control sat in the editor's side pane, and nothing could say so.
   */
  | { kind: 'point'; x: number; y: number; w: number; h: number; role: string | null; tag: string; vw: number; vh: number }
) & {
  nth?: number;
  /**
   * What LATER RUNS observed about this candidate: how often it resolved, and
   * how often it missed while a candidate behind it resolved (so the element
   * was there and this way of naming it failed).
   *
   * Whether a value is a stable app identifier or an ephemeral one is not
   * decidable from its shape — grafana's `_r8b_` is a React-minted id that
   * changes every load and matches no id-shaped pattern we have. It IS
   * decidable by observation: run it again and see whether it still finds the
   * element. Counted here, persisted only after the run past it succeeded,
   * and used to order the chain — the same evidence-then-persist rule as the
   * url `generalisations`, applied to locator values instead of url segments.
   */
  seen?: { hit: number; miss: number };
};

/**
 * Rebuild a candidate into a live Locator. Shared by recording and replay.
 * `page` is the ROOT the chain resolves against: the page, or the frame a
 * recorded frame path leads to (src/execution/context.ts rootFor) — Page and
 * FrameLocator build locators with the same calls.
 */
export function makeLocator(page: Root, c: LocatorCandidate): Locator {
  let loc: Locator;
  switch (c.kind) {
    case 'testid':
      loc = c.attr === 'data-testid' ? page.getByTestId(c.value) : page.locator(`[${c.attr}=${JSON.stringify(c.value)}]`);
      break;
    case 'role':
      // exact: Playwright's default name match is a case-insensitive substring,
      // so a recorded 'Edit' also matches a sibling 'Exit edit' — which is how
      // rpgr2-r2 left edit mode instead of entering it and halted the flow.
      // A name carrying a clock or calendar token ("Due date: 12/31/2026
      // 07:40") is matched with that token wildcarded — see volatileMatcher —
      // so a recording's minute does not push the step onto a positional path.
      // And the accessible name may carry what the recorded name cannot — an
      // icon font's glyph, a stray space — see roleName. The RegExp keeps the
      // whole-string rule `exact: true` stood for.
      loc = page.getByRole(c.role as Parameters<Page['getByRole']>[0], { name: roleName(c.name), exact: true });
      break;
    case 'label':
      loc = page.getByLabel(volatileMatcher(c.label));
      break;
    case 'placeholder':
      loc = page.getByPlaceholder(volatileMatcher(c.placeholder));
      break;
    case 'text':
      loc = page.getByText(volatileMatcher(c.text), { exact: true });
      break;
    case 'id':
    case 'css': {
      // As the live action resolved it: `[role=dialog]` also names a native
      // <dialog> (implicitRoles, shared with the artifact; fwrd82).
      const selector = implicitRoles(c.selector);
      loc = page.locator(selector);
      // A stored `role=textbox[name="Part name *"]` also finds the field by
      // its label's exact text (fieldByName, shared with the artifact).
      const field = c.kind === 'css' ? fieldByName(selector) : null;
      if (field) {
        const scope = field.scope === null ? page : page.locator(field.scope);
        loc = loc.or(scope.getByRole(field.role as Parameters<Page['getByRole']>[0]).and(scope.getByLabel(field.name, { exact: true })));
      }
      break;
    }
    case 'scoped': {
      // The record's text with its relative time or date wildcarded — see
      // hasTextMatcher (fwgh4 s_17f69b); the artifact calls the same function.
      const within = page.locator(c.container, { hasText: hasTextMatcher(c.hasText) });
      loc = c.selector ? within.locator(c.selector) : within;
      break;
    }
    case 'point':
      // Resolved in two moves: markPoint() finds the element under the
      // recorded point and tags it; this locator then names the tag. Both
      // live in the shared execution module so the artifact can do the same.
      // A point is a place in the PAGE's coordinates; inside a frame it names
      // nothing (the recorder records none there).
      if (!isPage(page)) throw new Error('a recorded point cannot be resolved inside a frame');
      loc = pointLocator(page, c);
      break;
  }
  return c.nth !== undefined ? loc.nth(c.nth) : loc;
}

/** A root that is the page itself, not a frame inside it. */
function isPage(root: Root): root is Page {
  return typeof (root as Page).mainFrame === 'function';
}

// The point machinery is a shared execution rule (src/execution/point.ts);
// re-exported so this module's callers need not know which owns the source.
export { POINT_MARK, markPoint, pointToken } from '../execution/point.js';

/** Source text for a candidate, e.g. `page.getByRole('button', { name: 'Save' })`. */
export function candidateExpr(c: LocatorCandidate): string {
  let expr: string;
  switch (c.kind) {
    case 'testid':
      expr = c.attr === 'data-testid' ? `page.getByTestId(${q(c.value)})` : `page.locator(${q(`[${c.attr}=${JSON.stringify(c.value)}]`)})`;
      break;
    case 'role':
      expr = `page.getByRole(${q(c.role)}, { name: ${q(c.name)}, exact: true })`;
      break;
    case 'label':
      expr = `page.getByLabel(${q(c.label)})`;
      break;
    case 'placeholder':
      expr = `page.getByPlaceholder(${q(c.placeholder)})`;
      break;
    case 'text':
      expr = `page.getByText(${q(c.text)}, { exact: true })`;
      break;
    case 'id':
    case 'css':
      expr = `page.locator(${q(c.selector)})`;
      break;
    case 'scoped':
      expr = `page.locator(${q(c.container)}, { hasText: ${q(c.hasText)} })` + (c.selector ? `.locator(${q(c.selector)})` : '');
      break;
    case 'point':
      expr = `elementAt(${c.x}, ${c.y}) /* ${c.role ?? c.tag} */`;
      break;
  }
  return c.nth !== undefined ? `${expr}.nth(${c.nth})` : expr;
}

/**
 * candidateExpr's judgement at the EXPRESSION level, for consumers that only
 * have the string (drift tickets, verify-artifacts, repair triage): does this
 * locator find its element by where it sits rather than by what it is? One
 * function, because replay, repair triage and the artifact gate disagreeing
 * on what "positional" means is how a repair promotes what the gate flags.
 *
 * An identity-scoped expression is NOT positional even when it ends in a
 * positional cell selector: `locator('#rows tr', { hasText: 'x7' })
 * .locator('td:nth-of-type(2)')` names the record first.
 */
export function positionalExpr(expr: string): boolean {
  if (/hasText:/.test(expr)) return false;
  return /^elementAt\(/.test(expr) || /nth-of-type|nth-child|>>\s*nth=|\.nth\(/.test(expr) || (expr.match(/>/g) ?? []).length > 2;
}

/**
 * A durable Playwright locator expression for one element the agent acted on,
 * resolved from the live page at record time. `verified` means the expression
 * was replayed against the page and resolved to exactly the element that was
 * acted on — an unverified expression is a best guess, and is flagged as such
 * in the generated script.
 */
export interface LocatorExpr {
  /** Source text, e.g. `page.getByRole('button', { name: 'Save' })`. Empty if nothing could be derived. */
  expr: string;
  verified: boolean;
  /** The agent's original target (an @ref or a raw selector), for TODO comments. */
  raw: string;
  /**
   * Every way the element could be found, best first; `expr` is the first one
   * that verified. Replay walks this chain when the page has drifted.
   */
  chain?: LocatorCandidate[];
  /**
   * The frame the element sat in, top-down, when it was not the main frame
   * (src/execution/context.ts). Every candidate in `chain` was verified
   * against THAT frame, so the chain means nothing resolved from the page.
   */
  frame?: FramePath;
}

/** What a state-changing step visibly did, kept so replay can check for it. */
export interface StepDiff {
  url: string;
  alerts: string[];
  added: string[];
  /**
   * What the action took OFF the page — recorded when that includes a dialog
   * (a step that closed one), and whenever the action added nothing (its whole
   * visible effect was to hide something: a disclosure toggle collapsing,
   * which compile's collapseTogglePairs reads — fwsi1 05-change). A dismissal's whole effect
   * is a disappearance, which `added` cannot express: fwop1's first-sign-in
   * "Close" recorded no added line at all, so nothing marked it as a step that
   * is already done when the dialog is not there (see dismissalAlreadyInEffect).
   */
  removed?: string[];
  /**
   * The line dialect `added` and `alerts` are written in (src/execution/
   * snapshot.ts LineDialect). Absent on recordings made before dialects
   * existed, which are dialect 1.
   */
  dialect?: 2;
}

export interface RecordedStep {
  k: 'step';
  tool: string;
  args: Record<string, unknown>;
  /** Keyed by the arg the expression replaces ("target" / "source"). */
  locators: Record<string, LocatorExpr>;
  /** Tool result, kept only for the tools whose output becomes an assertion. */
  result?: string;
  /** Page signature delta around a state-changing step (learning mode only). */
  diff?: StepDiff;
  /**
   * Structural fingerprint of the page AFTER this step, captured only when the
   * step navigated to a different page template (its url pattern changed).
   * This is a segment seam: compile splits skills here, and the fingerprint
   * becomes the next segment's precondition.
   */
  fingerprintAfter?: number[];
  /** Set when the step was executed by replaying a stored skill, not chosen by the agent. */
  via?: { skill: string; step: number };
  /**
   * The index of the page this step ran on among the browser's open pages,
   * written only when more than one page was open (see SkillStep.page).
   */
  page?: number;
  /** What the step did to the page itself: opened a popup, closed its page, switched tabs. */
  effect?: PageEffect;
  /**
   * Where a `popup`, `close` or `switch` effect left the procedure: the url of
   * the page it continues on. Compile starts the next segment there.
   */
  afterUrl?: string;
  /**
   * For a `goto`: the one visible link on the page it LEFT whose href is the
   * goto's target, described like a click target. The model sometimes reads a
   * link's address with an eval (unrecorded) and navigates to it; the address
   * then carries a record id nothing in the recording shows, and a goto to it
   * is a literal every replay aims at the recording's record. With this, compile
   * can replay the goto as the click it stands for (snipeit fwsi7's `goto
   * /hardware/4` was the saved asset's "Click here to view" link).
   */
  linkedFrom?: LocatorExpr;
  /**
   * For an `eval`: what it returned, bounded and credential-free
   * (eval-result.ts evalResultForRecord). Audit evidence ONLY — what the model
   * learned by a step no replay runs. It is deliberately not `result`: ledger
   * shownIn, flow shownBefore/textMints and the read-back cascade read that,
   * and an eval's answer is no source a replay has (fwsi7's href).
   */
  evalResult?: string;
  /** Set by compile (collapseTogglePairs), never by the recorder: see SkillStep.toggle. */
  toggle?: true;
  /** Set by compile (carryOpener), never by the recorder: see SkillStep.closedBefore. */
  closedBefore?: true;
  /** The recognized component the target sits inside, for recipe compilation. */
  component?: { family: string; rel: string };
  /**
   * For a synthesized read-back: the evidence key whose value this read
   * observes, carried from the report rather than re-derived.
   *
   * compile's `readLabel` used to recover this by comparing the read's result
   * against every reported value for an EXACT match, and a read whose result
   * differs by a currency symbol or a stray space matched nothing and was
   * stored unlabelled. An unlabelled read publishes nothing, so a zero-model
   * replay of that step republishes nothing, so every later step referencing
   * one of its outputs falls to recovery for ever — fwod20's 02-verify
   * recorded eight values and republished none of them on either replay.
   * The caller already knows the name; passing it is exact where matching is
   * a guess.
   */
  label?: string;
  /** This take's running entry number (stage 0 evidence; see step-evidence.ts). Absent on older stores. */
  seq?: number;
  /** Epoch ms the entry was written. Absent on older stores. */
  t?: number;
  /** What the recorder knew about the action: timing, settle verdict, capture, uncapped diff (step-evidence.ts). */
  obs?: StepEvidence;
  /**
   * The action FAILED (threw). Kept on disk as evidence of what was tried, and
   * never a gesture: ScriptRecorder keeps these out of `entries` and every
   * read of this take, and parseScript leaves them out of what it returns, so
   * no consumer (compile, the ledger, flow export, the supersede and repeat
   * rules) ever sees one. snipe-it fwsi1's select2 type depended on the
   * focus a failed, unrecorded fill had left.
   */
  failed?: true;
  failure?: StepFailure;
  /**
   * What the page did in and around this step, attributed (daemon/journal.ts,
   * SHADOW MODE: read only by the shadow report, never by replay, compile or
   * export). Absent on older stores and with SITELOOPER_JOURNAL=0.
   */
  journal?: StepJournal;
}

export interface RecordedInstruction {
  k: 'instruction';
  text: string;
  /** Where the browser was when the instruction started (learning mode). */
  url?: string;
  /** Structural fingerprint of that page (learning mode; see fingerprint.ts). */
  fingerprint?: number[];
  /**
   * The page's visible signature text when the instruction started, capped.
   * Textual counterpart to `fingerprint`: the fingerprint says which TEMPLATE
   * the page was, this says which RECORD it showed. Compile turns the
   * caller-vouched values visible here into the skill's identity
   * precondition, so a replay cannot run a ticket's procedure on a different
   * ticket that happens to share the template (fwrd8 did exactly that).
   */
  startText?: string;
  /** The line dialect `startText` is in; absent = 1. */
  startDialect?: 2;
  /**
   * False when `startText` is NOT the whole page: cut at its budget, or taken
   * by a look that could not cover the page. Text missing from an incomplete
   * startText was not shown to be absent, so compile derives no goal from it
   * ("not on the page before" is what a goal rests on). Absent = complete.
   */
  startTextComplete?: boolean;
  /**
   * This entry continues the immediately preceding instruction after an
   * escalation — `text` is the ORIGINAL caller wording, not the resume
   * scaffold the model was shown, and `url`/`fingerprint` describe wherever
   * the failed attempt happened to leave the browser (mid-crisis, not a
   * usable precondition). Flow building merges it into its predecessor.
   */
  resume?: true;
  /** Running entry number and write time (stage 0 evidence). Absent on older stores. */
  seq?: number;
  t?: number;
}

/** How one instruction ended — closes the group opened by the matching `instruction` entry. */
export interface RecordedReport {
  k: 'report';
  status: 'success' | 'failure' | 'blocked';
  summary: string;
  values: Record<string, string>;
  /** The skill this instruction compiled into, merged into, or fully replayed (learning mode). */
  skill?: string;
  /** The params `skill` replayed with, when this instruction replayed it (export's fallback when the template binds nothing). */
  skillParams?: Record<string, string>;
  /**
   * Renames the post-session relabel pass applied to this report's values,
   * old name -> new name. The durable trace of the pass (the daemon's stderr
   * goes nowhere), written when the entries are rewritten at export. An empty
   * object on the session's LAST successful report means the pass ran and
   * proposed nothing; a `(error)` key means it failed with that message —
   * fwod27's zero-field script could not tell those apart.
   */
  relabel?: Record<string, string>;
  tier?: 'A' | 'B';
  /**
   * Values the loop asked the model to NAME before accepting this report, and
   * whether the retry actually named them.
   *
   * fwod25 could not be read. Its flow came out with zero outputs, zero
   * cross-step references and seven literal `S00021`, because every report
   * carried `values: {}` — exactly what the naming ask exists to prevent. But
   * nothing published records whether the ask fired, so "the ask does not work"
   * and "the ask never ran" were indistinguishable after a 50-minute sweep. An
   * intervention that leaves no trace in the artifacts cannot be evaluated.
   */
  namingAsk?: { asked: string[]; named: boolean };
  /**
   * The sourcing hold (loop, SITELOOPER_SOURCING_HOLD; hygiene design §4)
   * this report was held for: the keys asked about, how many reads the retry
   * added and which of them were labelled, and every data-changing gesture
   * the model made after the hold (the one way the hold can make a recording
   * worse). Same reason as namingAsk: an intervention that leaves no trace
   * in the artifacts cannot be evaluated.
   */
  sourcingAsk?: { asked: string[]; readsAdded: number; labelled: string[]; gesturesAfter: string[] };
  /** Running entry number and write time (stage 0 evidence). Absent on older stores. */
  seq?: number;
  t?: number;
}

export type RecordedEntry = RecordedStep | RecordedInstruction | RecordedReport;

/** A step recorded for an action that failed: on disk only, never a gesture (RecordedStep.failed). */
export function isFailedStep(e: RecordedEntry): boolean {
  return e.k === 'step' && e.failed === true;
}

/**
 * script.jsonl parsed the way every reader must read it: the entries a
 * consumer may see (failed steps left out), each failed step filed after the
 * live entry it followed (null: before the first), and whether a torn last
 * line was dropped. The ONE parse: ScriptRecorder.load and the offline
 * rebuild (bench/rebuild-flow.mjs) both use it, so no reader sees a failed
 * action as something the recording did.
 */
export function parseScript(raw: string): { entries: RecordedEntry[]; failedAfter: Map<RecordedEntry | null, RecordedStep[]>; torn: boolean } {
  const entries: RecordedEntry[] = [];
  const failedAfter = new Map<RecordedEntry | null, RecordedStep[]>();
  let torn = !raw.endsWith('\n');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e: RecordedEntry;
    try {
      e = JSON.parse(line) as RecordedEntry;
    } catch {
      torn = true; // a partially written last line after a kill — drop it, keep the rest
      continue;
    }
    if (isFailedStep(e)) {
      const after = entries.length ? entries[entries.length - 1] : null;
      failedAfter.set(after, [...(failedAfter.get(after) ?? []), e as RecordedStep]);
      continue;
    }
    entries.push(e);
  }
  return { entries, failedAfter, torn };
}

/** Click tools: their target may be a table row whose durable locator is the record link inside it. */
const CLICK_TOOLS = new Set(['click', 'dblclick', 'modifier_click', 'right_click']);

/** Tools whose target is worth tagging with its component family (recipe compilation). */
const COMPONENT_TOOLS = new Set(['click', 'dblclick', 'fill', 'type', 'press']);

/** Tools that map onto Playwright script lines; everything else is agent-only scaffolding. */
/** Args whose typed value identifies a record (see addIdentityHint). */
const VALUE_ARG_KEYS = ['value', 'text', 'option'] as const;

const RECORDABLE = new Set([
  'click', 'dblclick', 'right_click', 'modifier_click', 'fill', 'type', 'press', 'select',
  'check', 'hover', 'scroll_into_view', 'drag', 'wait_for', 'read', 'read_all', 'eval',
  'goto', 'back', 'upload', 'download', 'set_viewport', 'set_offline', 'screenshot',
  'dialog_expect', 'tabs',
]);

/** Tools whose observed result is turned into a (commented) assertion. */
const RESULT_TOOLS = new Set(['read', 'read_all']);

export function isRecordable(tool: string): boolean {
  return RECORDABLE.has(tool);
}

/**
 * Captures the actions an instruction takes as replayable Playwright steps.
 *
 * The agent drives the page through `@ref` handles, which are snapshot-scoped
 * and meaningless in a standalone test, so every target is re-described against
 * the live DOM *before* the action runs (afterwards the element may be gone),
 * and the resulting expression is replayed to confirm it still resolves to that
 * exact element. Entries are appended to `script.jsonl` in the session dir as
 * they happen, so a recording survives a daemon restart or a hard kill.
 */
export class ScriptRecorder {
  readonly entries: RecordedEntry[] = [];

  /**
   * How many entries were already on disk when this daemon started — a
   * PREVIOUS take under the same session name. They are kept (a daemon that
   * crashed mid-instruction should not lose the run's history) but they are
   * not part of this take: fwrd16's container restarted, the runner cleared
   * bench/results and re-recorded, and because the session dir survived, the
   * exported flow contained the task TWICE — nine steps from the killed take
   * followed by eight from the re-run. Both replays dutifully did the whole
   * lifecycle twice and the verifier still scored them 6/6.
   */
  private priorCount = 0;

  get priorEntries(): number {
    return this.priorCount;
  }

  constructor(private readonly session: string) {
    this.load();
    this.priorCount = this.entries.length;
  }

  /** Entries recorded by THIS take — what a flow export may build from. */
  entriesThisTake(): RecordedEntry[] {
    return this.entries.slice(this.priorEntries);
  }

  private file(): string {
    return path.join(ensureSessionDir(this.session), 'script.jsonl');
  }

  private load(): void {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file(), 'utf8');
    } catch {
      return; // nothing recorded yet for this session
    }
    const parsed = parseScript(raw);
    this.entries.push(...parsed.entries);
    for (const [after, steps] of parsed.failedAfter) this.failedAfter.set(after, steps);
    for (const e of [...parsed.entries, ...[...parsed.failedAfter.values()].flat()]) {
      if (typeof e.seq === 'number' && e.seq >= this.nextSeq) this.nextSeq = e.seq + 1;
    }
    // Make the file canonical before the first append: appending after a
    // torn last line glued the next entry onto the fragment, and the NEXT
    // load lost that entry too.
    if (parsed.torn) this.rewrite();
  }

  /**
   * Failed steps (RecordedStep.failed), each filed after the live entry it
   * followed (null: before the first). They are written to script.jsonl in
   * place and never enter `entries`, so nothing that reads this take sees one.
   */
  private readonly failedAfter = new Map<RecordedEntry | null, RecordedStep[]>();

  /** The next entry's `seq`: one past the highest on disk, so a later take continues the count. */
  private nextSeq = 0;

  /** Number and time-stamp an entry as it is written (stage 0 evidence). */
  private stamp<E extends RecordedEntry>(entry: E): E {
    if (entry.seq === undefined) entry.seq = this.nextSeq++;
    if (entry.t === undefined) entry.t = Date.now();
    return entry;
  }

  private append(entry: RecordedEntry): void {
    this.entries.push(this.stamp(entry));
    try {
      fs.appendFileSync(this.file(), JSON.stringify(entry) + '\n');
    } catch {
      // recording must never break the run it is observing
    }
  }

  /**
   * Record an action that FAILED, as evidence only (RecordedStep.failed): it is
   * appended to script.jsonl after whatever was last recorded, and kept out of
   * `entries` — no read of this take, no compile, no export ever sees it.
   */
  fail(step: RecordedStep | null, failure: StepFailure, obs?: StepEvidence, journal?: StepJournal): void {
    if (!step) return;
    const entry = this.stamp<RecordedStep>({ ...step, failed: true, failure, ...(obs ? { obs } : {}), ...(journal ? { journal } : {}) });
    const after = this.entries.length ? this.entries[this.entries.length - 1] : null;
    this.failedAfter.set(after, [...(this.failedAfter.get(after) ?? []), entry]);
    try {
      fs.appendFileSync(this.file(), JSON.stringify(entry) + '\n');
    } catch {
      // recording must never break the run it is observing
    }
  }

  /** Mark the start of one `do` instruction; becomes a test.step in the script. */
  beginInstruction(
    text: string,
    context: { url?: string; fingerprint?: number[]; startText?: string; startDialect?: 2; startTextComplete?: boolean; resume?: true } = {},
  ): void {
    this.append({ k: 'instruction', text, ...context });
  }

  /** Close the current instruction with its outcome (learning mode; flows are built from these). */
  endInstruction(report: Omit<RecordedReport, 'k'>): void {
    this.append({ k: 'report', ...report, ...(this.pendingAsk ? { namingAsk: this.pendingAsk } : {}), ...(this.pendingSourcing ? { sourcingAsk: this.pendingSourcing } : {}) });
    this.pendingAsk = undefined;
    this.pendingSourcing = undefined;
  }

  /** The sourcing hold the loop asked this instruction — see RecordedReport.sourcingAsk. */
  private pendingSourcing?: NonNullable<RecordedReport['sourcingAsk']>;

  /** Record that the loop held the report for sourcing these keys. */
  noteSourcingAsk(asked: string[]): void {
    this.pendingSourcing = { asked, readsAdded: 0, labelled: [], gesturesAfter: [] };
  }

  /** A data-changing gesture the model made after the sourcing hold. */
  noteSourcingGesture(tool: string): void {
    this.pendingSourcing?.gesturesAfter.push(tool);
  }

  /** What the retry added: reads since the hold, and the labels among them. */
  noteSourcingRetry(readsAdded: number, labelled: string[]): void {
    if (this.pendingSourcing) Object.assign(this.pendingSourcing, { readsAdded, labelled });
  }

  /** Values the loop is holding this instruction's report to name — see RecordedReport.namingAsk. */
  private pendingAsk?: { asked: string[]; named: boolean };

  /** Record that the loop asked for names; call again with the outcome once the retry lands. */
  noteNamingAsk(asked: string[]): void {
    this.pendingAsk = { asked, named: false };
  }

  /** Mark the held report as having come back with names. */
  noteNamingAnswered(): void {
    if (this.pendingAsk) this.pendingAsk.named = true;
  }

  /**
   * Pin the skill this instruction produced onto its report entry, after
   * compilation (which happens once the report is already recorded). Rewrites
   * the last report entry in memory and in script.jsonl so a flow exported
   * later has the skill to replay.
   */
  pinSkill(skill: string): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.k === 'report') {
        if (!e.skill) e.skill = skill;
        this.rewrite();
        return;
      }
      if (e.k === 'instruction') return; // no report for this instruction
    }
  }

  /** Rewrite script.jsonl after in-place entry edits (post-session relabel). */
  persist(): void {
    this.rewrite();
  }

  private rewrite(): void {
    try {
      // Failed steps go back where they were recorded: after the live entry
      // they followed (with none, the file is exactly the entries, as before).
      const lines: RecordedEntry[] = [...(this.failedAfter.get(null) ?? [])];
      for (const e of this.entries) lines.push(e, ...(this.failedAfter.get(e) ?? []));
      fs.writeFileSync(this.file(), lines.map((e) => JSON.stringify(e)).join('\n') + '\n');
    } catch {
      // recording must never break the run it observes
    }
  }

  /** Append a synthetic step (a read-back captured at report time). */
  addStep(step: RecordedStep): void {
    this.append(step);
  }

  /**
   * Insert a synthetic step right after `anchor`, a step of this take: a
   * read-back that must run where the recording could still see its element
   * (selectionReadBack — the combobox a selection filled is gone once the
   * line is confirmed). Appended instead when the anchor is not found.
   */
  insertStepAfter(anchor: RecordedStep, step: RecordedStep): void {
    const at = this.entries.lastIndexOf(anchor);
    if (at < this.priorEntries) {
      this.append(step);
      return;
    }
    this.entries.splice(at + 1, 0, this.stamp(step));
    this.rewrite();
  }

  /** The steps recorded since the current instruction began, in order. */
  stepsThisInstruction(): RecordedStep[] {
    const out: RecordedStep[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.k === 'instruction') break;
      if (e.k === 'step') out.unshift(e);
    }
    return out;
  }

  /** Values already read via a read step since the last instruction began. */
  readResultsThisInstruction(): Set<string> {
    const out = new Set<string>();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.k === 'instruction') break;
      if (e.k === 'step' && (e.tool === 'read' || e.tool === 'read_all') && typeof e.result === 'string') {
        try {
          const v = JSON.parse(e.result);
          if (typeof v === 'string') out.add(v);
        } catch {
          out.add(e.result);
        }
      }
    }
    return out;
  }

  /**
   * The current instruction's real reads with their parsed values — target
   * label included, read_all arrays expanded — for report-time promotion of
   * prose-cited values into evidence.values. Synthetic read-backs excluded.
   */
  readsThisInstruction(): { target: string; values: string[]; label?: string }[] {
    const out: { target: string; values: string[]; label?: string }[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.k === 'instruction') break;
      if (e.k !== 'step' || (e.tool !== 'read' && e.tool !== 'read_all') || typeof e.result !== 'string') continue;
      if (e.args.target === '(read-back)') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.result);
      } catch {
        parsed = e.result;
      }
      const values = (Array.isArray(parsed) ? parsed : [parsed]).filter((v): v is string => typeof v === 'string');
      const label = typeof e.args.label === 'string' && e.args.label.trim() ? e.args.label.trim() : undefined;
      if (values.length) out.unshift({ target: String(e.args.target ?? ''), values, ...(label ? { label } : {}) });
    }
    return out;
  }

  /** Index just past the last entry — pass to entriesSince() to read back one instruction. */
  mark(): number {
    return this.entries.length;
  }

  entriesSince(mark: number): RecordedEntry[] {
    return this.entries.slice(mark);
  }

  clear(): void {
    this.entries.length = 0;
    this.failedAfter.clear();
    this.nextSeq = 0;
    this.priorCount = 0; // a cleared recording has no previous take to skip
    try {
      fs.rmSync(this.file(), { force: true });
    } catch {
      // best effort
    }
  }

  /**
   * Describe a step's targets against the live page. Called BEFORE the action,
   * because a click can navigate or unmount the very element being described.
   * Returns null for tools that do not map onto a script line.
   */
  async prepare(
    page: Page,
    tool: string,
    args: Record<string, unknown>,
    /** Pre-resolved locators (replay): described from the element itself, not from args. */
    resolved?: Record<string, Locator>,
  ): Promise<RecordedStep | null> {
    if (!RECORDABLE.has(tool)) return null;
    // What the agent types names what it creates: the ticket title typed here
    // is how every later read in this instruction can be anchored to the row
    // it belongs to rather than to a row number.
    for (const key of VALUE_ARG_KEYS) {
      const v = args[key];
      if (typeof v === 'string') addIdentityHint(v);
    }
    const locators: Record<string, LocatorExpr> = {};
    for (const key of ['target', 'source'] as const) {
      const raw = args[key];
      const retarget = key === 'target' && CLICK_TOOLS.has(tool);
      if (resolved?.[key]) {
        const rawText = typeof raw === 'string' ? raw : '';
        locators[key] = await describeLocator(page, resolved[key], rawText, retarget).catch(() => ({
          expr: '',
          verified: false,
          raw: rawText,
        }));
        continue;
      }
      if (typeof raw !== 'string' || !raw.trim()) continue;
      // Only this caller knows the step's tool, so only it can say whether an
      // ambiguous target is still describable — the dispatch acts on match 0
      // (fwgr43's `wait_for h2`) — or genuinely plural (read_all, a count).
      const firstOfMany = key === 'target' && dispatchesFirstMatch(tool, args);
      locators[key] = await describeTarget(page, raw, retarget, firstOfMany).catch(() => ({ expr: '', verified: false, raw }));
    }
    // Component tagging (PLAN-component-recipes): note which recognized
    // widget family the target sits inside, so a successful agent-driven
    // interaction with a hard component can later compile into a recipe.
    // Best effort like everything else here — a missing tag just means no
    // recipe is learned from this step.
    let component: RecordedStep['component'];
    if (COMPONENT_TOOLS.has(tool) && typeof args.target === 'string' && args.target.trim()) {
      const target = resolved?.target ?? resolveTarget(page, args.target);
      component = (await tagComponent(target).catch(() => null)) ?? undefined;
    }
    // A goto's target as a link on the page it leaves (RecordedStep.linkedFrom).
    let linkedFrom: LocatorExpr | undefined;
    if (tool === 'goto' && typeof args.url === 'string' && args.url) {
      const link = await linkTo(page, args.url).catch(() => null);
      if (link) {
        const described = await describeLocator(page, link, '', true).catch(() => null);
        if (described?.chain?.length) linkedFrom = described;
      }
    }
    return { k: 'step', tool, args, locators, ...(component ? { component } : {}), ...(linkedFrom ? { linkedFrom } : {}) };
  }

  /** Commit a prepared step once the action succeeded. Failed actions are dropped. */
  commit(
    step: RecordedStep | null,
    result: string,
    extra: { diff?: StepDiff; via?: RecordedStep['via']; fingerprintAfter?: number[]; page?: number; effect?: PageEffect; afterUrl?: string; obs?: StepEvidence; journal?: StepJournal } = {},
  ): void {
    if (!step) return;
    // A select is recorded by the option's visible LABEL whatever the caller
    // passed: the label is the term the procedure has provenance for (it is
    // what the instruction names, what an earlier step minted), while the
    // value is the app's key for that option and carries none. The value the
    // step actually selected is kept as the fallback `optionValue`.
    let args = step.args;
    const label = step.tool === 'select' ? /\blabel=("(?:[^"\\]|\\.)*")$/.exec(result)?.[1] : undefined;
    if (label) {
      const shown = JSON.parse(label) as string;
      if (shown && shown !== args.option) args = { ...args, option: shown, optionValue: String(args.option ?? '') };
    }
    const entry: RecordedStep = {
      ...step,
      args,
      ...(extra.diff ? { diff: extra.diff } : {}),
      ...(extra.via ? { via: extra.via } : {}),
      ...(extra.fingerprintAfter ? { fingerprintAfter: extra.fingerprintAfter } : {}),
      ...(extra.page !== undefined ? { page: extra.page } : {}),
      ...(extra.effect ? { effect: extra.effect } : {}),
      ...(extra.afterUrl ? { afterUrl: extra.afterUrl } : {}),
      ...(extra.obs ? { obs: extra.obs } : {}),
      ...(extra.journal ? { journal: extra.journal } : {}),
    };
    this.append(RESULT_TOOLS.has(step.tool) ? { ...entry, result } : step.tool === 'eval' ? { ...entry, evalResult: evalResultForRecord(result) } : entry);
  }
}

// --- selector derivation ---

interface ElementInfo {
  tag: string;
  testid: { attr: string; value: string } | null;
  id: string | null;
  /** isStableId's judgement made in the page, where a counter-shaped id's evidence (url, links) is. */
  idStable: boolean;
  role: string | null;
  name: string | null;
  label: string | null;
  placeholder: string | null;
  text: string | null;
  cssPath: string;
  /**
   * The nearest repeated container (table row, list item) this element sits
   * in: a GENERIC selector for containers of its kind, the container's
   * visible text, and this element's path relative to it. Raw material for an
   * identity-scoped candidate — see LocatorCandidate's 'scoped'.
   */
  row: { container: string; text: string; inner: string; cells: string[] } | null;
  /**
   * The nearest ANCESTOR carrying a testid, for the anchored fallback rung
   * between the element's own semantics and the bare positional path. cssPath
   * can break at an ancestor #id but never at a testid, so a testid-rich app
   * (grafana) whose input's own semantics drift used to fall straight from
   * `role` to `div:nth-of-type(1) > … > input` — position from the document
   * root, the wrong-record shape. `[ancestor-testid] input` survives the
   * input's own attributes churning while still naming a REGION.
   */
  anchor: { attr: string; value: string } | null;
  /**
   * A selector from the element's OWN stable attributes (`a[name="action_b"]`,
   * a `data-*`, `type`, an `aria-*` that is not state, an `href`) that matches
   * it alone on the page, or null. The naming rung for a control that has
   * none: fwod78 07-open's kanban-card anchor had no text, no name and no
   * testid, was recorded as a positional path and a point, and on both
   * replays the path reached the card's OTHER anchor — the sale.order list
   * instead of the contact form.
   */
  attrs: string | null;
  /** The element's box in document coordinates (viewport rect + scroll), null when it has no layout. */
  box: { x: number; y: number; w: number; h: number } | null;
  viewport: { w: number; h: number };
}

interface Candidate {
  expr: string;
  make: (root: Root) => Locator;
  spec: LocatorCandidate;
}

/**
 * Turn one agent-supplied target into a durable locator expression. Raw CSS
 * selectors pass through as-is (the agent already chose something stable);
 * `@ref` handles are re-derived from the element's own attributes, preferring
 * test ids and roles over structural paths.
 */
/**
 * How to record a raw target the agent typed. Almost everything is an opaque
 * selector string and stays `css` — but `text="..."` is Playwright's TEXT
 * engine, not CSS, and typing it as css cost us the whole identity guard:
 * identityOfPrimary reads name/text/label/hasText and deliberately skips css
 * ("a slot inside a selector is an address, not a name"), so a primary that
 * named the record by its title advertised NO identity, and every fallback —
 * including `tr:nth-of-type(1)` — was waved through unchecked.
 *
 * fwrd19l 01-open and 02-open, on every replay: the row was not painted yet
 * (repair-desk defers its list refetch BY DESIGN), all three text-bearing
 * candidates missed, and the positional one resolved instantly against
 * whatever sat in row 1. It passed only because a new ticket sorts to the top.
 *
 * Typing it correctly re-arms the guard, which rejects the positional
 * fallback, which makes the walk return nothing — which is what lets
 * resolveChain's wait run at all, so the anchor wins once the row lands.
 *
 * Only the quoted form maps cleanly: `text="X"` is exact and whitespace
 * -trimmed, which is what getByText(X, { exact: true }) does. Unquoted
 * (substring, case-insensitive) and regex forms have no equivalent, so they
 * stay css rather than being silently narrowed.
 */
export function primaryFor(raw: string): LocatorCandidate {
  const m = /^text=(?:"([^"]*)"|'([^']*)')$/.exec(raw.trim());
  const text = m ? (m[1] ?? m[2]) : undefined;
  return text ? { kind: 'text', text } : { kind: 'css', selector: raw };
}

export async function describeTarget(
  page: Page,
  raw: string,
  retarget = false,
  /**
   * The step's dispatch acts on the FIRST match (src/execution/lifecycle.ts
   * dispatchesFirstMatch), so a target matching several still names one
   * element — the one at index 0 — and is described as such.
   */
  firstOfMany = false,
): Promise<LocatorExpr> {
  if (!isRefTarget(raw)) {
    // A raw selector the agent chose: keep it as the primary, but still
    // describe the element it hit so replay has attribute-based fallbacks.
    // Probed and stored exactly as the action resolved it (resolveTarget:
    // implicitRoles, the label fallback). fwrd82 n1's `[role=dialog] >> …`
    // hit a native <dialog> live, matched nothing here, and was stored bare
    // with no testid or role behind it: 12 inline heals per replay, and the
    // compiled artifact, which cannot heal, ran 0/1.
    const loc = resolveTarget(page, raw);
    const count = await loc.count().catch(() => 0);
    const primary: LocatorCandidate = primaryFor(implicitRoles(raw.trim()));
    // A step that ACTS ON ONE of several matches is describable: it acted on
    // match 0, and that element has a testid, a role+name and a path like any
    // other. Bailing here — storing the bare plural selector with no index and
    // no alternates — is what stopped grafana fwgr43's `wait_for h2` on both
    // replays and failed its compiled arm 0/6: `h2` matched THREE panels, and
    // the very next steps of that same skill prove better locators were
    // derivable on that page. An ambiguous candidate needs its index to be
    // reproducible (the rule verifiedChain and readBackFromHandle state); this
    // was the third place that had to say so.
    //
    // A dispatch that spans every match (read_all, a count read or wait) keeps
    // the bare plural selector with no index: several matches are its point.
    const indexed: LocatorCandidate = count > 1 ? { ...primary, nth: 0 } : primary;
    if (count === 0 || (count > 1 && !firstOfMany)) return { expr: candidateExpr(primary), verified: false, raw, chain: [primary] };
    const handle = await loc.first().elementHandle({ timeout: 2_000 }).catch(() => null);
    if (!handle) return { expr: candidateExpr(indexed), verified: true, raw, chain: [indexed] };
    try {
      const info = (await handle.evaluate(describeInPage)) as ElementInfo;
      // Dedupe: a `text="X"` primary is now the same candidate the described
      // element yields, and carrying it twice only shortens the useful chain.
      const rest = (await verifiedChain(page, info, handle)).chain.filter((c) => candidateExpr(c) !== candidateExpr(indexed));
      return { expr: candidateExpr(indexed), verified: true, raw, chain: [indexed, ...rest] };
    } finally {
      await handle.dispose().catch(() => {});
    }
  }

  const ref = refOf(raw) ?? raw.trim().replace(/^@/, '');
  const handle = await page
    .locator(`aria-ref=${ref}`)
    .first()
    .elementHandle({ timeout: 2_000 })
    .catch(() => null);
  if (!handle) {
    // The element is already gone (re-rendered list, closed picker). The
    // snapshot that minted the ref still says what it was, and a role+name
    // locator beats no locator: unverified, but it can resolve on the next
    // run where "(none recorded)" never can — fwgr20's 02-create died on
    // exactly such a step, a data-source picker item, on every replay.
    const hint = refHint(page, ref);
    if (hint?.name) {
      const c: LocatorCandidate = { kind: 'role', role: hint.role, name: hint.name };
      return { expr: candidateExpr(c), verified: false, raw, chain: [c] };
    }
    return { expr: '', verified: false, raw };
  }
  try {
    return await describeHandle(page, handle, raw, retarget);
  } finally {
    await handle.dispose().catch(() => {});
  }
}

/**
 * The identifying string a candidate matches on — the thing that would make it
 * a *circular* locator if it equals the value we are trying to re-read. A price
 * cell must not be located by "125.00"; it is located by its testid or its
 * structural path instead.
 */
function candidateIdentity(c: LocatorCandidate): string | null {
  switch (c.kind) {
    case 'role':
      return c.name;
    case 'text':
      return c.text;
    case 'label':
      return c.label;
    case 'placeholder':
      return c.placeholder;
    case 'testid':
      return c.value;
    case 'scoped':
      // Anchoring a read to the very value it reads would re-read whatever
      // the next run happens to show there — the circularity this guards.
      return c.hasText;
    default:
      return null;
  }
}

/**
 * `v` as an anchored case-insensitive matcher for Playwright's text engines.
 *
 * Record time applies the SAME rule compile time does: `foldValue` (imported
 * from skills/flow.ts, where valueLineCandidates applies it to a snapshot line)
 * is the one spelling of "are these two strings the same value" — whitespace
 * collapsed, trimmed, case folded. Record time is where grafana's
 * `folder = "bench"` first failed to pin against a page rendering "Bench", so
 * the exact comparison had to go here too; two subtly different predicates for
 * one rule would be the defect, not the duplication.
 *
 * Folding LOOSENS what matches, so every uniqueness test below is judged AFTER
 * folding: two showings differing only in case are ambiguous and refused, not
 * silently resolved to the first.
 *
 * A RegExp, because `getByText(s, { exact: true })` is case-SENSITIVE and has no
 * option that is not. Playwright tests a RegExp against the element's full text
 * rather than its normalised text, so the anchors absorb surrounding whitespace
 * and each literal space matches any whitespace run — the equivalent of the
 * normalisation `exact: true` would have done.
 */
function foldedTextRe(v: string): RegExp {
  return new RegExp(`^\\s*${escapeRe(foldValue(v)).replace(/ /g, '\\s+')}\\s*$`, 'i');
}

/**
 * Record-time read-back synthesis (progressive automation option (c)): given a
 * value the agent just reported, find the live element showing it and derive a
 * durable, NON-value locator for it, so the same value can be re-read on a
 * later replay instead of being reported from memory. Returns a synthetic
 * `read` step, or null when the value cannot be pinned to a single element or
 * only a value-based (circular) locator would resolve — in which case the
 * value stays un-threadable and the caller falls back to recovery.
 */
/**
 * A reported value that IS the document title, read as the title.
 *
 * EspoCRM fwec11 01-signin reported `page_title: "EspoCRM"` — the tab's
 * title. No element shows it whole, so the read-back cascade pinned it by
 * containment to the footer's "EspoCRM, Inc." link (frame "{{=}}, Inc."), a
 * credit line that merely contains the word; no replay found that link, and
 * both n2 and n3 ended partial on it. The page's own title is the provenance:
 * a `read` of `what: 'title'`, which both runners take from `page.title()`.
 * Null unless the value equals the live title exactly (whitespace collapsed).
 */
export async function titleReadBack(page: Page, value: string, label: string): Promise<RecordedStep | null> {
  const want = value.replace(/\s+/g, ' ').trim();
  if (!want) return null;
  const title = ((await page.title().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  if (title !== want) return null;
  // No target, as a url read has none: nothing on the page is resolved for it.
  return { k: 'step', tool: 'read', args: { what: 'title' }, locators: {}, result: JSON.stringify(want), label };
}

/**
 * THE FIELD THE KEY NAMES. EspoCRM fwec10 02-create reported `stage:
 * "Negotiation"`; the saved record shows it in its stage field and again in
 * the Stream entry that narrates the save ("… assigned to Bench Assignee /
 * Negotiation / 07:20"). Two matches, not in one row, not a heading, no test
 * hook: captureReadBack refused, and the one value the instruction asked for
 * stayed a recorded literal.
 *
 * The page's own field structure decides which match is the value: the one
 * that IS a field whose name the reported key names — an element with
 * `data-name` equal to the key (EspoCRM's `.field[data-name=stage]`), a `dd`
 * whose `dt` is the key, or an element beside a `label`/`dt`/`th` whose text is
 * the key — each compared case- and separator-insensitively ("close_date" and
 * "Close date"), and each showing exactly the value. Exactly one such field,
 * and it must resolve to one element by its own selector: the read is pinned
 * there, the stream's copy left alone. The value's shape is never read.
 */
async function fieldReadBack(page: Page, loc: Locator, v: string, label: string): Promise<RecordedStep | null> {
  const selectors = await loc
    .evaluateAll(
      (els, { value, key }) => {
        const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const shows = (el: Element) => ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim() === value;
        const want = norm(key);
        const out = new Set<string>();
        for (const el of els) {
          for (let a: Element | null = el as Element; a && a !== document.body; a = a.parentElement) {
            if (!shows(a)) break; // climbed past the element that shows the value alone
            const tag = a.tagName.toLowerCase();
            const name = a.getAttribute('data-name');
            if (name && norm(name) === want) {
              const cls = (a.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)[0];
              out.add(`${cls ? `.${cls}` : tag}[data-name=${JSON.stringify(name)}]`);
              break;
            }
            const prev = a.previousElementSibling;
            if (tag === 'dd' && prev && prev.tagName === 'DT' && norm((prev as HTMLElement).innerText) === want) {
              out.add(`dt:text-is(${JSON.stringify((prev as HTMLElement).innerText.trim())}) + dd`);
              break;
            }
            const labelled = a.parentElement
              ? Array.from(a.parentElement.children).find((c) => c !== a && ['LABEL', 'DT', 'TH'].includes(c.tagName) && norm((c as HTMLElement).innerText) === want)
              : undefined;
            if (labelled) {
              const lt = labelled.tagName.toLowerCase();
              out.add(`:has(> ${lt}:text-is(${JSON.stringify((labelled as HTMLElement).innerText.trim())})) > ${tag}:not(${lt})`);
              break;
            }
          }
        }
        return [...out];
      },
      { value: v.replace(/\s+/g, ' ').trim(), key: label },
    )
    .catch(() => [] as string[]);
  if (selectors.length !== 1) return null;
  const field = page.locator(selectors[0]);
  if ((await field.count().catch(() => 0)) !== 1) return null;
  const handle = await field.elementHandle({ timeout: 1_000 }).catch(() => null);
  if (!handle) return null;
  try {
    const own: LocatorCandidate = { kind: 'css', selector: selectors[0] };
    const derived = await readBackFromHandle(page, handle, v);
    const chain = [own, ...(derived?.locators.target.chain ?? []).filter((c) => !(c.kind === 'css' && c.selector === selectors[0]))];
    return {
      k: 'step',
      tool: 'read',
      args: { target: '(read-back)', what: 'text' },
      locators: { target: { expr: candidateExpr(own), verified: true, raw: '(read-back)', chain } },
      result: JSON.stringify(v),
      label,
    };
  } finally {
    await handle.dispose().catch(() => {});
  }
}

export async function captureReadBack(page: Page, value: string, label?: string): Promise<RecordedStep | null> {
  const v = value.trim();
  const want = foldValue(v);
  // The floor was "too short to be distinctive": a one-character value was
  // assumed to match half the page, so the search was skipped rather than run.
  // That is a guess about the value; the page answers the same question for
  // real, one line down. Every path out of here already requires either
  // count === 1 (nothing else on the page shows this string) or a second,
  // independent identity — a row anchor, the page's only heading, the one
  // stable test hook — so a digit that IS noise is refused by the count and a
  // digit that is the page's own answer is kept. grafana's
  // `panel_count = "3"` was refused here, unique on the page, for being one
  // character long. 1, not 0: an empty value has nothing to find.
  if (want.length < 1 || want.length > 80) return null; // nothing to find, or prose
  const loc = page.getByText(foldedTextRe(v));
  const count = await loc.count().catch(() => 0);
  // Ambiguity is acceptable for a READ-BACK only when something ELSE names the
  // record. Within one page state, two matches of the same string do both read
  // that string — which is what made this look safe. Across RUNS it is not:
  // odoo keeps every run's records (no rollback, writes are runid-scoped), so
  // by run 2 the page holds n1's customer as well as n2's and `.first()` is
  // the wrong one. fwod9 replayed step 1 at tier A and published
  // "fwod9-n1 Bench Customer" as run n2's observation; 1/6 objectives passed.
  //
  // So an ambiguous match must resolve through a row anchor, which carries the
  // record's own identity and re-binds per run. Repairdesk never showed this
  // because the harness resets it between runs — there was no earlier record
  // to find.
  if (count >= 1) {
    const handle = await loc.first().elementHandle({ timeout: 1_000 }).catch(() => null);
    if (handle) {
      try {
        const step = await readBackFromHandle(page, handle, v);
        const winner = step?.locators.target.chain?.[0];
        if (step && (count === 1 || winner?.kind === 'scoped')) return label ? { ...step, label } : step;
      } finally {
        await handle.dispose().catch(() => {});
      }
    }
  }
  // Ambiguous by text, but the reported KEY names a field the page itself
  // labels, and exactly one match is that field's value (fieldReadBack).
  if (count > 1 && label) {
    const field = await fieldReadBack(page, loc, v, label);
    if (field) return field;
  }
  // Ambiguous by text, but every match inside ONE record: the same row
  // showing one value twice. An Odoo order line shows its product in the
  // product AND the description column, so odoo fwod82 04-change's
  // `line1_product` counted 2, had no row anchor that was not the value
  // itself, and was refused — the one value a later step keyed on. One row is
  // one record: this is the count === 1 case, pinned to the first match in
  // that row. The fwod9 hazard was matches across DIFFERENT records (an
  // earlier run's customer and this run's), which this does not admit.
  if (count > 1) {
    const oneRecord = await loc
      .evaluateAll((els) => {
        const rows = els.map((el) => (el as Element).closest('tr, [role="row"]'));
        return rows[0] !== null && rows.every((r) => r === rows[0]);
      })
      .catch(() => false);
    if (oneRecord) {
      const handle = await loc.first().elementHandle({ timeout: 1_000 }).catch(() => null);
      if (handle) {
        try {
          const step = await readBackFromHandle(page, handle, v);
          if (step) return label ? { ...step, label } : step;
        } finally {
          await handle.dispose().catch(() => {});
        }
      }
    }
  }
  // Ambiguous by text, but shown in exactly one HEADING. The row-anchor rule
  // above guards against LIST pages, where a matching string may belong to an
  // EARLIER run's record (fwod9 republished n1's customer as n2's
  // observation). A heading is the opposite case: it names the record THIS
  // PAGE displays, and a replay reaches this page by its own navigation, so
  // the heading shows the replay's own value. fwod26 is what refusing this
  // costs: S00021 sat in both the breadcrumb and the form's <h1>, the unique-
  // text pin bailed, the run's one record reference never became a replayable
  // read, and five later steps fell back with `unresolved reference(s)` on
  // BOTH replays — for a value that was on screen, correctly named, the
  // whole time.
  if (count > 1) {
    const inHeading = page.locator('h1, h2, h3').getByText(foldedTextRe(v));
    if ((await inHeading.count().catch(() => 0)) === 1) {
      const handle = await inHeading.elementHandle({ timeout: 1_000 }).catch(() => null);
      if (handle) {
        try {
          const step = await readBackFromHandle(page, handle, v);
          if (step) return label ? { ...step, label } : step;
        } finally {
          await handle.dispose().catch(() => {});
        }
      }
    }
    // Ambiguous by text, but exactly one match is held by an element with a
    // STABLE test hook — one whose testid names a role on the page, not a
    // record (shape.ts `skeleton`: `ticket-ref` qualifies, a per-row
    // `ticket-link-t15` does not). Same argument as the heading: the hook is
    // the app naming what this page displays, so a replay that reaches the
    // page re-reads its own record there. fwrd44-n1 is what refusing it cost:
    // repair-desk shows a ticket's ref in the breadcrumb AND in
    // `<p data-testid="ticket-ref">`, the pin bailed, and the recording's
    // RD-1128 rode into four flow instructions as a literal. A list page with
    // the same hook on every row matches it more than once and still refuses.
    // `foldValue` inlined: this body is serialised into the page, where nothing
    // of this module exists. Same three operations, in the same order.
    const hooked = await loc
      .evaluateAll((els, folded) =>
        els.map((el) => {
          const holder = (el as Element).closest('[data-testid]') as HTMLElement | null;
          const own = holder ? (holder.innerText ?? holder.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase() : '';
          return holder && own === folded ? holder.getAttribute('data-testid') ?? '' : '';
        }),
      want)
      .catch(() => [] as string[]);
    const stable = hooked.map((t, i) => ({ t, i })).filter(({ t }) => t && skeleton(t) === t);
    if (stable.length === 1) {
      const handle = await loc.nth(stable[0].i).elementHandle({ timeout: 1_000 }).catch(() => null);
      if (handle) {
        try {
          const step = await readBackFromHandle(page, handle, v);
          if (step) return label ? { ...step, label } : step;
        } finally {
          await handle.dispose().catch(() => {});
        }
      }
    }
  }
  // Not in a text node — try the form controls. An app that edits records
  // in-place holds its values in `input.value`, which getByText cannot see:
  // odoo reported six values from its order form and this pinned NONE of
  // them, so every later step referencing one lost its zero-model path. The
  // read is stored with what:'value' so the replay re-reads the control
  // rather than its label.
  const form = await captureFormValue(page, v);
  return form && label ? { ...form, label } : form;
}

/**
 * The single form control whose value IS this string.
 *
 * One round trip: comparing values element-by-element from here would be a
 * round trip each, and a record form can hold dozens.
 */
async function captureFormValue(page: Page, v: string): Promise<RecordedStep | null> {
  const controls = page.locator('input, textarea, select');
  let hits: number[];
  try {
    // `foldValue` inlined — this body runs in the page. Same rule as the text
    // path: a control holding "Bench" answers for a reported "bench", and
    // uniqueness is judged after folding, so two controls differing only in
    // case are ambiguous and refused below.
    hits = await controls.evaluateAll(
      (els, folded) =>
        els
          .map((el, i) =>
            ((((el as HTMLInputElement).value ?? '') as string).replace(/\s+/g, ' ').trim().toLowerCase() === folded ? i : -1),
          )
          .filter((i) => i >= 0),
      foldValue(v),
    );
  } catch {
    return null;
  }
  if (hits.length !== 1) return null; // ambiguous or absent — a form control has no row anchor to fall back on
  const handle = await controls.nth(hits[0]).elementHandle({ timeout: 1_000 }).catch(() => null);
  if (!handle) return null;
  try {
    return await readBackFromHandle(page, handle, v, 'value');
  } finally {
    await handle.dispose().catch(() => {});
  }
}

/**
 * Read-back from a selector the MODEL supplied (the verified-fallback path,
 * for values captureReadBack could not pin by text — e.g. a value that is not
 * unique). The selector is trusted only after it resolves to exactly one
 * element whose text actually IS the value; otherwise null and the value stays
 * un-threadable.
 */
/**
 * THE PROCEDURE'S OWN SELECTION IS A SOURCE. When a reported value is the
 * accessible name of an option this instruction CLICKED, and that click's own
 * recorded diff shows a control now holding it (`- combobox "…": <value>`),
 * the value was put there by the selection and the control shows it: a value
 * read of that control, right after the click, re-reads it on every replay.
 *
 * odoo fwod82 02-create clicked `role=option[name="[FURN_1118] Corner Desk
 * Left Sit"]`; its diff shows `- combobox "Type to find a product...":
 * [FURN_1118] Corner Desk Left Sit`. The saved row shows the name twice
 * (product and description), captureReadBack refused it as ambiguous, nothing
 * read `product`, and the compile refused 04-change, whose v2 is bound to
 * {{02-create.product}}. Placed right after the click because the combobox is
 * gone once the line is confirmed.
 *
 * It reads back what the step selected, so replay's echo guard keeps it out
 * of the step's confident values — and publishes it for a later step's
 * reference all the same (InstructionResult.published; the artifact's
 * echoRead), which is what 04-change needs.
 *
 * Provenance only: the recorded click, its option name, and the line its own
 * diff added. Located by the control the procedure itself typed into (the
 * latest earlier step naming that role and name), else by that role and name.
 * Pure; null when the recording shows no such selection.
 */
export function selectionReadBack(steps: readonly RecordedStep[], value: string, label: string): { after: RecordedStep; read: RecordedStep } | null {
  const want = value.replace(/\s+/g, ' ').trim();
  if (!want) return null;
  const holding = /^- (\S+) ("(?:[^"\\]|\\.)*")(?: \[[^\]]*\])*: (.*)$/;
  for (let i = steps.length - 1; i >= 0; i--) {
    const click = steps[i];
    if (click.tool !== 'click') continue;
    const chain = click.locators.target?.chain ?? [];
    if (!chain.some((c) => c.kind === 'role' && c.role === 'option' && (c.name ?? '').replace(/\s+/g, ' ').trim() === want)) continue;
    for (const line of click.diff?.added ?? []) {
      const m = holding.exec(line);
      if (!m || m[3].replace(/\s+/g, ' ').trim() !== want) continue;
      const role = m[1];
      let name: string;
      try {
        name = JSON.parse(m[2]) as string;
      } catch {
        continue;
      }
      if (role === 'option') continue;
      const control = steps
        .slice(0, i)
        .reverse()
        .find((s) => (s.locators.target?.chain ?? []).some((c) => c.kind === 'role' && c.role === role && c.name === name));
      const own: LocatorCandidate = { kind: 'role', role, name };
      const rest = (control?.locators.target?.chain ?? []).filter((c) => !(c.kind === 'role' && c.role === role && c.name === name));
      const candidates = [own, ...rest];
      return {
        after: click,
        read: {
          k: 'step',
          tool: 'read',
          args: { target: '(read-back)', what: 'value' },
          locators: { target: { expr: candidateExpr(own), verified: true, raw: '(read-back)', chain: candidates } },
          result: JSON.stringify(want),
          label,
        },
      };
    }
  }
  return null;
}

/**
 * A COMPOSITE value read where the recording SHOWED it — round 56's split
 * (flattenContainedComposite), asked of a recorded step's diff when the page
 * the report was made on no longer shows the value.
 *
 * Gitea fwgt10 01-open: n1 reported `open_issue_titles: "#1 Seed: triage
 * inbox, #2 Seed: order missing parts, #3 Seed: ship repaired device"`. Its
 * reads of the list came back empty on that Gitea build, it took the titles
 * with an `eval` (compile drops evals), and it reported from the search page
 * it went to next. The read-back looks only at the live page, which shows no
 * titles: nothing read them, the skill carried them as a template literal,
 * and both replays withheld it (obj 1 FAIL). Step 12's diff — the second
 * visit to /issues — added `- link "Seed: triage inbox"`, `- link "#1"` … for
 * all three.
 *
 * Newest step first, the first whose ADDED lines account for every word of
 * the value (planContainedParts, over those lines' names) wins; each part
 * must be the name of exactly one added line there, and is read by that
 * role and name. The reads go right after that step (the caller's
 * insertStepAfter), where compile keeps them ahead of the navigation away.
 * On success the report's composite gives way to its parts, as round 56
 * commits a split. A value some ONE line shows whole is left to the live
 * read-back: located by its own recorded text it would miss on every run
 * whose value differs. Provenance only: the recorded diff and the report.
 */
export async function shownReadBack(
  steps: readonly RecordedStep[],
  report: Report,
  key: string,
  instruction: string,
): Promise<{ after: RecordedStep; reads: RecordedStep[]; names: string[] } | null> {
  const raw = report.evidence?.values?.[key];
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const line = /^- ([\w-]+) ("(?:[^"\\]|\\.)*")/;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    const shown: { role: string; name: string }[] = [];
    for (const l of step.diff?.added ?? []) {
      const m = line.exec(l.trim());
      if (!m) continue;
      try {
        shown.push({ role: m[1], name: String(JSON.parse(m[2])).replace(/\s+/g, ' ').trim() });
      } catch {
        // an unparseable name shows nothing
      }
    }
    if (shown.length < 2) continue;
    const pin = async (text: string, label: string): Promise<RecordedStep | null> => {
      const hits = shown.filter((s) => s.name === text);
      if (hits.length !== 1) return null;
      const own: LocatorCandidate = { kind: 'role', role: hits[0].role, name: hits[0].name };
      return {
        k: 'step',
        tool: 'read',
        args: { target: '(read-back)', what: 'text' },
        locators: { target: { expr: candidateExpr(own), verified: true, raw: '(read-back)', chain: [own] } },
        result: JSON.stringify(text),
        label,
      };
    };
    const { names, pinned } = await flattenContainedComposite(report, key, shown.map((s) => s.name), instruction, pin);
    if (names.length) return { after: step, reads: pinned, names };
  }
  return null;
}

/**
 * An option chosen by its VALUE ATTRIBUTE, read back from the saved record.
 *
 * EspoCRM fwec10 02-create chose the stage by clicking
 * `.field[data-name="stage"] .option[data-value="Negotiation"]`: no
 * role=option candidate, and a click whose own diff shows nothing holding the
 * choice (selectionReadBack's evidence). What the recording does show is
 * WHERE the option sat — the selector's scope before the option itself — and
 * the value it carried. After the save the same scope is the saved record's
 * field; if the page the finish looks at shows exactly the value there, in one
 * element, that is the read: re-read at the end of every replay, where the
 * saved record is, not from the transient dropdown.
 *
 * Provenance: the recorded click's own selector (its `[data-value]` equal to
 * the reported value) and the live page confirming the scope shows it. Null
 * otherwise.
 */
export async function savedSelectionReadBack(page: Page, steps: readonly RecordedStep[], value: string, label: string): Promise<RecordedStep | null> {
  const want = value.replace(/\s+/g, ' ').trim();
  if (!want) return null;
  const scopes: string[] = [];
  for (const s of steps) {
    if (s.tool !== 'click') continue;
    for (const c of s.locators.target?.chain ?? []) {
      if (c.kind !== 'css') continue;
      const parts = cssCompounds(c.selector);
      const last = parts[parts.length - 1] ?? '';
      const m = /\[data-value=(["'])(.*?)\1\]/.exec(last);
      if (!m || m[2].replace(/\s+/g, ' ').trim() !== want || parts.length < 2) continue;
      scopes.push(parts.slice(0, -1).join(' '));
    }
  }
  for (const scope of [...new Set(scopes)].reverse()) {
    const field = page.locator(scope);
    if ((await field.count().catch(() => 0)) !== 1) continue;
    const shown = ((await field.innerText({ timeout: 1_000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
    if (shown !== want) continue;
    const own: LocatorCandidate = { kind: 'css', selector: scope };
    const handle = await field.elementHandle({ timeout: 1_000 }).catch(() => null);
    let rest: LocatorCandidate[] = [];
    if (handle) {
      try {
        rest = ((await readBackFromHandle(page, handle, want))?.locators.target.chain ?? []).filter((c) => !(c.kind === 'css' && c.selector === scope));
      } finally {
        await handle.dispose().catch(() => {});
      }
    }
    return {
      k: 'step',
      tool: 'read',
      args: { target: '(read-back)', what: 'text' },
      locators: { target: { expr: candidateExpr(own), verified: true, raw: '(read-back)', chain: [own, ...rest] } },
      result: JSON.stringify(want),
      label,
    };
  }
  return null;
}

/** A css selector's descendant compounds (top-level whitespace), brackets, quotes and parentheses kept whole. */
function cssCompounds(selector: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  let quote: string | null = null;
  for (const ch of selector.trim()) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '(') depth += 1;
    else if (ch === ']' || ch === ')') depth -= 1;
    if (depth === 0 && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  // A combinator (`>`, `+`, `~`) belongs to what follows it, not a scope of its own.
  return out.reduce<string[]>((acc, part) => {
    if (acc.length && /^[>+~]$/.test(acc[acc.length - 1])) acc[acc.length - 1] += ` ${part}`;
    else acc.push(part);
    return acc;
  }, []);
}

/**
 * AN ID REPORTED WITHOUT ITS AFFIX. kanboard fwkb41 02-create reported
 * `new_task_numeric_id: "4"`; the board shows only `link "#4"`, which the same
 * finish pinned (`card_id_shown`, `board_tasks_after_7`). No element shows "4"
 * whole, so the value stayed a recorded literal and no replay reported it.
 *
 * Provenance: a read this instruction PINNED returned `#4`, and the reported
 * value is exactly that text's letter/digit core — the text with only its
 * leading and trailing non-letter/digit characters taken off. When exactly one
 * distinct pinned text has that core, the value is read from that element,
 * framed at the core ("#{{=}}", FRAME_MARK), so both runners publish the live
 * core ("5" on the run whose task is #5; observe.ts framedRead).
 *
 * Never a bare number inside a longer text: "Task #4" and "Backlog (4)" have
 * cores "Task #4" and "Backlog (4", not "4". Never a value some read already
 * returned whole.
 *
 * And a core is only an IDENTITY where the recording says so: the value must
 * be a part of a url this instruction stood on (an id sits in `task_id=4`; a
 * count sits nowhere), and no other reported key may carry the same value.
 * Offline over every published n1 recording, the bare rule also fired on
 * fwkb41 i1 `backlog_task_count: "3"` (the pinned `#3` is a task) and i2
 * `backlog_column_count_after: "4"` — counts that happen to equal an id. The
 * url rule refuses the first; the second shares "4" with
 * `new_task_numeric_id` in the same report, so which key is the id is not
 * something the recording decides, and neither is read. Pure; null when no
 * pinned read qualifies.
 */
export function coreReadBack(steps: readonly RecordedStep[], value: string, label: string, reported: Record<string, unknown> = {}): RecordedStep | null {
  const want = value.replace(/\s+/g, ' ').trim();
  if (!want || !/[\p{L}\p{N}]/u.test(want)) return null;
  if (Object.entries(reported).some(([k, v]) => k !== label && String(v ?? '').replace(/\s+/g, ' ').trim() === want)) return null;
  const urls = steps.flatMap((s) => [s.diff?.url, typeof s.args.url === 'string' ? s.args.url : undefined]).filter((u): u is string => Boolean(u));
  // A path or hash part (urlParts), or a query value — Kanboard's `task_id=4`.
  const partsOf = (u: string): string[] => {
    const out = urlParts(u).map((p) => p.value);
    try {
      for (const v of new URL(u).searchParams.values()) out.push(v);
    } catch {
      /* not an absolute url: its path parts are all there is */
    }
    return out;
  };
  if (!urls.some((u) => partsOf(u).includes(want))) return null;
  const core = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const texts = new Map<string, RecordedStep>();
  for (const s of steps) {
    if (s.tool !== 'read' || s.args.target !== '(read-back)' || s.args.frame || typeof s.result !== 'string') continue;
    let text: unknown;
    try {
      text = JSON.parse(s.result);
    } catch {
      continue;
    }
    if (typeof text !== 'string') continue;
    const shown = text.replace(/\s+/g, ' ').trim();
    if (shown === want) return null; // shown whole: not this rule's to read
    if (core(shown) === want) texts.set(shown, s);
  }
  if (texts.size !== 1) return null;
  const [[shown, source]] = [...texts];
  const frame = frameValue(shown, want);
  if (!frame || frame === FRAME_MARK) return null;
  return {
    k: 'step',
    tool: 'read',
    args: { target: '(read-back)', what: 'text', frame },
    locators: source.locators,
    result: JSON.stringify(want),
    label,
  };
}

/**
 * The full visible texts of the page's elements that stand inside `value`
 * (whitespace collapsed), for planContainedParts (src/agent/report.ts): the
 * element texts a composite report value may be made of. Only rendered
 * elements count — a hidden template row or an off-screen tooltip is not what
 * the page showed. Includes an element showing the value WHOLE, so the planner
 * can refuse to split it. [] when the page cannot be read.
 */
export async function visibleTextsWithin(page: Page, value: string): Promise<string[]> {
  // Never a reason for the read-back pass to stop: a page that cannot answer
  // shows nothing, and the value goes on to the cascade as before.
  try {
    return await visibleTextsIn(page, value);
  } catch {
    return [];
  }
}

function visibleTextsIn(page: Page, value: string): Promise<string[]> {
  return page
    .evaluate((wanted: string) => {
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      const whole = norm(wanted);
      const out = new Set<string>();
      for (const el of Array.from(document.body?.querySelectorAll('*') ?? [])) {
        const h = el as HTMLElement;
        if (!h.getClientRects().length) continue;
        const style = getComputedStyle(h);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const text = norm(h.innerText ?? '');
        if (text && text.length <= whole.length && whole.includes(text)) out.add(text);
      }
      return [...out];
    }, value)
    .catch(() => []);
}

export async function captureReadBackAt(page: Page, value: string, selector: string): Promise<RecordedStep | null> {
  const v = value.trim();
  // Same floor and same fold as captureReadBack/captureFormValue: one rule for
  // "are these two strings the same value", three sites. 1, not 2 — a
  // one-character value is refused by the page (count !== 1 below), not by a
  // guess about its length; grafana's `panel_count = "3"` is the case that
  // guess cost. The length window is measured on the folded form for the same
  // reason the comparison is.
  const want = foldValue(v);
  if (!selector.trim() || want.length < 1 || want.length > 80) return null;
  let loc;
  try {
    loc = resolveTarget(page, selector);
  } catch {
    return null;
  }
  const count = await loc.count().catch(() => 0);
  if (count !== 1) return null; // must be unambiguous
  const handle = await loc.first().elementHandle({ timeout: 1_000 }).catch(() => null);
  if (!handle) return null;
  try {
    const raw = await handle
      .evaluate((el) => ((el as HTMLElement).innerText ?? (el as HTMLInputElement).value ?? '').trim())
      .catch(() => '');
    // Folded, like the two deterministic sites: an app renders a value in
    // whatever case it likes, and a model-supplied selector resolving to the
    // element showing "Bench" answers for a reported "bench" exactly as the
    // text path does — the exact comparison here was the third copy of the bug
    // grafana's `folder` found.
    //
    // CONTAINMENT is kept, unlike the deterministic path, and deliberately: the
    // text path locates the text node itself (getByText), so equality is all it
    // ever needs, while the model hands back a SELECTOR — usually the enclosing
    // cell, row or field wrapper, whose innerText carries a label or sibling
    // text around the value. Demanding equality here would refuse most correct
    // model answers. It stays safe because the trust is not in this predicate:
    // the selector must already resolve to exactly one element (count !== 1
    // above refuses), and readBackFromHandle then derives a NON-value locator
    // for that element, so a wrapper that merely contains the string still has
    // to yield an identity of its own.
    const got = foldValue(raw);
    if (got !== want && !got.includes(want)) return null; // the model pointed at the wrong element
    // Containment is a wrapper's worth, not a document's. fwgr56 07-report
    // opened grafana's dashboard JSON — one <pre>, one line, 2,236 characters
    // — and the model pointed every one of seventeen values at it. Each was
    // "contained", so each became a read of the whole body: the replay
    // published the document seventeen times over, and the report's summary,
    // swapping each recorded value for the body it now "showed", grew past
    // the engine's string limit and the step fell back to the model on both
    // replays. A wrapper carries a label or a sibling around the value on the
    // value's own rendered LINE; a line that goes on for a document's worth
    // past the value is not showing the value, it is containing it.
    if (got !== want && !onOwnLine(raw, want)) return null;
    // A contained value is published at its own position, never as the line
    // around it. fwvk3's runid "fwvk3-n1" was pinned here to the <h1>
    // "fwvk3-n1 Bench Task" and every replay published "fwvk3-nX Bench Task"
    // (fwgh5 s_5ee393's `ref` the same with "Bench Post"): the read stored no
    // record of where in the line the value sat. It stores its FRAME now —
    // the line with the value cut out (text.ts frameValue) — and both runners
    // publish only the span at the mark, or nothing (observe.ts framedRead).
    // An exact element records none and reads as it always did.
    if (got === want) return await readBackFromHandle(page, handle, v);
    const frame = frameValue(raw, v);
    if (!frame) return null;
    // ...and what else on that line this run made is not the frame's to keep:
    // fwgt4 s_4580f2's "{{=}} Bench Issue #4" carried the issue the recording
    // created, and missed "#5" on every replay (recordIdsOf, unfreezeFrame).
    return await readBackFromHandle(page, handle, v, 'text', unfreezeFrame(frame, recordIdsOf(page.url())));
  } finally {
    await handle.dispose().catch(() => {});
  }
}

/**
 * The record identifiers the page's url carries: the parts compile's own
 * urlPattern turns into `:id` (the one sanctioned reading of "this position
 * names a record", shape.ts's prior applied there, not a new test here). A
 * frame is built on this page, so a number it shows that is this page's
 * record is this run's, not the procedure's.
 */
function recordIdsOf(url: string): string[] {
  const pattern = new Map(urlParts(urlPattern(url)).map((p) => [p.label, p.value]));
  return urlParts(url)
    .filter((p) => pattern.get(p.label) === ':id' && p.value !== ':id')
    .map((p) => p.value);
}

/**
 * How much more than the value one rendered line may carry and still be that
 * value's line: a label ("Folder: Bench"), a unit, a sibling cell. The same
 * figure captureReadBack uses as its prose ceiling — a value longer than this
 * is prose, and so is a line that runs this far past its value.
 */
const READ_BACK_LINE_ALLOWANCE = 80;

/**
 * Whether `want` (folded) sits on a line of `raw` (an element's innerText)
 * that is at most READ_BACK_LINE_ALLOWANCE folded characters longer than it.
 */
export function onOwnLine(raw: string, want: string): boolean {
  return raw.split(/\r?\n/).some((line) => {
    const folded = foldValue(line);
    return folded.includes(want) && folded.length <= want.length + READ_BACK_LINE_ALLOWANCE;
  });
}

/** Derive a durable, non-circular read step for `value` from a live element. */
async function readBackFromHandle(page: Page, handle: ElementHandle<Node>, v: string, what: 'text' | 'value' = 'text', frame?: string): Promise<RecordedStep | null> {
  const info = (await handle.evaluate(describeInPage)) as ElementInfo;
  const chain: LocatorCandidate[] = [];
  let winner: LocatorCandidate | null = null;
  const want = foldValue(v);
  for (const candidate of candidatesFor(info)) {
    // Skip any candidate whose identity IS the value — locating the price by
    // "125.00" would never match a different price on the next run. Folded for
    // the same reason the search is: now that a reported "bench" reaches the
    // element the page names "Bench", a locator named "Bench" is exactly as
    // circular as one named "bench", and an exact comparison here would let it
    // through.
    const identity = candidateIdentity(candidate.spec);
    if (identity && foldValue(identity) === want) continue;
    // Same uniqueness rule as verifiedChain: an ambiguous anchor is not identity.
    if (candidate.spec.kind === 'scoped' && (await candidate.make(page).count().catch(() => 0)) !== 1) continue;
    if (candidate.spec.kind === 'point') {
      chain.push(candidate.spec);
      continue;
    }
    const loc = candidate.make(page);
    const match = await matchIndex(loc, handle);
    if (match === null) continue;
    // Same rule as verifiedChain: an AMBIGUOUS candidate needs its index, and
    // `match === 0` is not the same as "unique". This copy was missed when
    // that was fixed, so a read-back pinned to an ambiguous locator could not
    // be re-resolved.
    const spec = match.count > 1 || match.index !== 0 ? { ...candidate.spec, nth: match.index } : candidate.spec;
    if (!winner) winner = spec;
    chain.push(spec);
  }
  if (!winner) return null; // only a circular locator resolved — cannot re-read stably
  return {
    k: 'step',
    tool: 'read',
    args: frame ? { target: '(read-back)', what, frame } : { target: '(read-back)', what },
    locators: { target: { expr: candidateExpr(winner), verified: true, raw: '(read-back)', chain } },
    result: JSON.stringify(v),
  };
}

/** Describe the element a live Locator resolves to (replay path). */
/**
 * The one visible `a[href]` on the page whose resolved href is `url`, or null
 * when there is none or more than one (an ambiguous link is no evidence of
 * which element the address was read from). See RecordedStep.linkedFrom.
 */
async function linkTo(page: Page, url: string): Promise<Locator | null> {
  let want: string;
  try {
    want = new URL(url, page.url()).href;
  } catch {
    return null;
  }
  const anchors = page.locator('a[href]');
  const hits = await anchors.evaluateAll(
    (els, target) =>
      els
        .map((el, i) => {
          const a = el as HTMLAnchorElement;
          const r = a.getBoundingClientRect();
          return a.href === target && r.width > 0 && r.height > 0 ? i : -1;
        })
        .filter((i) => i >= 0),
    want,
  );
  return hits.length === 1 ? anchors.nth(hits[0]) : null;
}

export async function describeLocator(page: Page, locator: Locator, raw: string, retarget = false): Promise<LocatorExpr> {
  const handle = await locator.elementHandle({ timeout: 2_000 }).catch(() => null);
  if (!handle) return { expr: '', verified: false, raw };
  try {
    return await describeHandle(page, handle, raw, retarget);
  } finally {
    await handle.dispose().catch(() => {});
  }
}

async function describeHandle(page: Page, handle: ElementHandle<Node>, raw: string, retarget = false): Promise<LocatorExpr> {
  // Where the element lives. A live ref reaches into an iframe, so the agent
  // can act on an in-frame Save; a chain built from the PAGE cannot find it
  // again, and one that happens to resolve there has found a different Save.
  // So every candidate is verified against the element's own frame, and the
  // path to that frame travels beside the chain. A frame that cannot be named
  // again records no chain at all: a step with nothing to resolve stops at
  // replay, where a page-rooted guess would press the wrong control.
  const where = await targetRoot(page, handle);
  if (!where) return { expr: '', verified: false, raw };
  const { root, frame } = where;
  const framed = frame ? { frame } : {};
  // A click is recorded against the element that best survives the app
  // restyling itself — see CLICK_RETARGETS. The element the agent actually
  // clicked keeps its structural path as the chain's last fallback.
  if (retarget) {
    for (const better of CLICK_RETARGETS) {
      const el = await better(handle).catch(() => null);
      if (!el) continue;
      try {
        const info = (await el.evaluate(describeInPage)) as ElementInfo;
        const { winner, chain } = await verifiedChain(root, info, el, Boolean(frame));
        if (winner) {
          const selfInfo = (await handle.evaluate(describeInPage)) as ElementInfo;
          const fallback: LocatorCandidate = { kind: 'css', selector: selfInfo.cssPath };
          return { expr: candidateExpr(winner), verified: true, raw, chain: [...chain, fallback], ...framed };
        }
      } finally {
        await el.dispose().catch(() => {});
      }
    }
  }
  const info = (await handle.evaluate(describeInPage)) as ElementInfo;
  const { winner, chain } = await verifiedChain(root, info, handle, Boolean(frame));
  if (winner) return { expr: candidateExpr(winner), verified: true, raw, chain, ...framed };
  // Nothing resolved back to this element — hand over the structural path and
  // let the generated script flag it, rather than inventing something clean.
  return { expr: `page.locator(${q(info.cssPath)})`, verified: false, raw, chain, ...framed };
}

/**
 * The root an element's chain is verified against: the page for an element
 * of the main frame, else the frame it sits in, with the recorded path to it.
 * Null when the element sits in a frame that cannot be named again.
 */
async function targetRoot(page: Page, handle: ElementHandle<Node>): Promise<{ root: Root; frame?: FramePath } | null> {
  const owner = await handle.ownerFrame().catch(() => null);
  if (!owner || owner === page.mainFrame()) return { root: page };
  const frame = await framePathOf(page, owner);
  if (!frame) return null;
  const found = await rootFor(page, frame, 0);
  return 'root' in found ? { root: found.root, frame } : null;
}

/**
 * How to find `frame` again from the page, top-down: one hop per iframe
 * element between the main frame and it. Each hop keeps only the selectors
 * that match exactly that iframe in its parent RIGHT NOW — its name, its
 * title, a stable id, the path of its src, and its position as the last
 * resort (with the frame's url pattern, which rootFor then requires). Null
 * when some level has none, or its element cannot be read.
 */
export async function framePathOf(page: Page, frame: Frame): Promise<FramePath | null> {
  const levels: Frame[] = [];
  for (let f: Frame | null = frame; f && f !== page.mainFrame(); f = f.parentFrame()) levels.unshift(f);
  const path: FramePath = [];
  let root: Root = page;
  for (const level of levels) {
    const el = await level.frameElement().catch(() => null);
    if (!el) return null;
    try {
      const facts = await el
        .evaluate((node) => {
          const e = node as HTMLIFrameElement;
          const tag = e.tagName.toLowerCase();
          const raw = e.getAttribute('src') ?? '';
          let src = '';
          try {
            src = raw ? new URL(raw, e.ownerDocument.baseURI).pathname : '';
          } catch {
            src = '';
          }
          return {
            tag,
            name: e.getAttribute('name') ?? '',
            title: e.getAttribute('title') ?? '',
            id: e.id ?? '',
            src,
            index: Array.from(e.ownerDocument.querySelectorAll(tag)).indexOf(e),
          };
        })
        .catch(() => null);
      if (!facts) return null;
      const attr = (name: string, value: string) => `${facts.tag}[${name}=${JSON.stringify(value)}]`;
      const offered: string[] = [];
      if (facts.name) offered.push(attr('name', facts.name));
      if (facts.title) offered.push(attr('title', facts.title));
      if (facts.id && isStableId(facts.id, level.url())) offered.push(/^[A-Za-z][\w-]*$/.test(facts.id) ? `${facts.tag}#${facts.id}` : attr('id', facts.id));
      if (facts.src && facts.src !== '/') offered.push(`${facts.tag}[src*=${JSON.stringify(facts.src)}]`);
      // The position is kept only with the frame's url, which is what makes
      // "the second iframe" the recorded one rather than whichever sits there.
      const url = level.url();
      const pattern = url && url !== 'about:blank' ? urlPattern(url) : '';
      const nth = facts.index >= 0 && pattern ? `${facts.tag} >> nth=${facts.index}` : null;
      if (nth) offered.push(nth);
      const selectors: string[] = [];
      for (const selector of offered) {
        const match = await matchIndex(root.locator(selector), el);
        if (match && match.count === 1) selectors.push(selector);
      }
      if (!selectors.length) return null;
      path.push({
        selectors,
        ...(facts.name ? { name: facts.name } : {}),
        ...(facts.title ? { title: facts.title } : {}),
        ...(nth && selectors.includes(nth) ? { urlPattern: pattern } : {}),
      });
      root = root.locator(selectors[0]).contentFrame();
    } finally {
      await el.dispose().catch(() => {});
    }
  }
  return path.length ? path : null;
}

/**
 * Elements a click is better recorded against than the one the agent hit, in
 * preference order. Each returns a handle to the better target or null.
 *
 * 1. A click on a table ROW opening a record is more durably located by the
 *    record's own link inside it (name = the ref, which parameterises) than
 *    by the row (name = the whole volatile row text; a positional css
 *    otherwise).
 * 2. A click on an INERT element inside a control belongs to the control.
 *    The agent clicks whatever the snapshot handed it — often a text span
 *    inside a button — and the span's inner structure is the most volatile
 *    DOM in the app: fwgr18 recorded grafana's time-picker as
 *    `[testid] span > span`, the span nesting changed once a range was set,
 *    and every replay fell to a bare structural path (4 of the sweep's 11
 *    fallthroughs). The BUTTON has the testid and the stable identity; a
 *    click on it lands the same.
 */
const CLICK_RETARGETS: ((handle: ElementHandle<Node>) => Promise<ElementHandle<Element> | null>)[] = [recordLinkOf, interactiveAncestorOf];

/**
 * If `handle` is an inert presentational element (a span, an icon) sitting
 * inside an interactive control a few hops up, return the control — the
 * element whose identity (testid, role, accessible name) survives the app
 * restyling its innards. Null when the element is itself interactive or no
 * control encloses it.
 */
async function interactiveAncestorOf(handle: ElementHandle<Node>): Promise<ElementHandle<Element> | null> {
  const found = await handle.evaluateHandle((el) => {
    const node = el as Element;
    // SVG-namespace elements report a lowercase tagName ("svg", "path"), so
    // an icon click never matched the inert list until this upper-cased.
    const tag = (n: Element) => n.tagName.toUpperCase();
    const interactive = (n: Element): boolean => {
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL)$/.test(tag(n))) return true;
      const role = n.getAttribute('role');
      if (role && /^(button|link|menuitem|menuitemcheckbox|menuitemradio|tab|option|checkbox|radio|switch)$/.test(role)) return true;
      return n.hasAttribute('tabindex') && n.getAttribute('tabindex') !== '-1';
    };
    if (!/^(SPAN|I|EM|B|STRONG|SVG|PATH|USE|IMG|SMALL|SUP|SUB)$/.test(tag(node)) || interactive(node)) return null;
    for (let cur = node.parentElement, hops = 0; cur && hops < 4; cur = cur.parentElement, hops++) {
      if (interactive(cur)) return cur;
    }
    return null;
  });
  const el = found.asElement();
  if (!el) {
    await found.dispose().catch(() => {});
    return null;
  }
  return el as ElementHandle<Element>;
}

/**
 * If `handle` is a container (a table row, list item, card) that wraps exactly
 * one hyperlink, return a handle to that link — the durable, often
 * parameterisable target for a navigation click. Null otherwise, including
 * when the element already IS the link or has several links (ambiguous).
 */
async function recordLinkOf(handle: ElementHandle<Node>): Promise<ElementHandle<Element> | null> {
  const found = await handle.evaluateHandle((el) => {
    const node = el as Element;
    if (node.tagName === 'A') return null; // already a link
    const container = /^(TR|LI|TD|TH|DIV|SECTION|ARTICLE)$/.test(node.tagName) || node.getAttribute('role') === 'row' || node.getAttribute('role') === 'listitem';
    if (!container) return null;
    const links = Array.from(node.querySelectorAll('a[href]')).filter((a) => (a as HTMLElement).offsetParent !== null || a.getClientRects().length > 0);
    return links.length === 1 ? links[0] : null;
  });
  const el = found.asElement() as ElementHandle<Element> | null;
  if (!el) {
    await found.dispose().catch(() => {});
    return null;
  }
  return el;
}

/**
 * All candidates for an element, the first that resolves back to it marked
 * with its index. Later candidates are kept unindexed as replay fallbacks —
 * checking each costs round trips, and a fallback that resolves to exactly
 * one element needs no index anyway.
 */
async function verifiedChain(
  page: Root,
  info: ElementInfo,
  handle: ElementHandle<Node>,
  /** The element sits in a frame: a point in the page's coordinates would name something else. */
  noPoint = false,
): Promise<{ winner: LocatorCandidate | null; chain: LocatorCandidate[] }> {
  const chain: LocatorCandidate[] = [];
  let winner: LocatorCandidate | null = null;
  for (const candidate of candidatesFor(info, noPoint)) {
    // An identity anchor that matches several elements is not identity. It
    // would record clean (the handle is simply match 0) and then be discarded
    // at replay, where ambiguity in the primary reads as drift — so prove it
    // singles the record out HERE, while the page that produced it is live.
    if (candidate.spec.kind === 'scoped' && (await candidate.make(page).count().catch(() => 0)) !== 1) continue;
    // The point is where the element IS, so it always "matches"; it is never
    // the winner because it names no element, only a place.
    if (winner || candidate.spec.kind === 'point') {
      chain.push(candidate.spec);
      continue;
    }
    const loc = candidate.make(page);
    const match = await matchIndex(loc, handle);
    if (match === null) continue;
    // Record the index whenever the locator is AMBIGUOUS, including index 0.
    // `match === 0` used to mean "no nth needed", conflating "unique" with
    // "first of several": every part row carries an Edit button, so the
    // recorded getByRole('button', { name: 'Edit' }) stored no index, and at
    // replay it matched two elements, read as drift, and fell through to
    // `tr:nth-of-type(1) > td:nth-of-type(7)` — a structural path onto a
    // record row, which is the shape behind every wrong-record bug this plan
    // exists to stop. An ambiguous candidate needs its index to be
    // reproducible, exactly as an ambiguous anchor needs to be unique.
    winner = match.count > 1 || match.index !== 0 ? { ...candidate.spec, nth: match.index } : candidate.spec;
    chain.push(winner);
  }
  return { winner, chain };
}

/**
 * Index of `handle` within `locator`'s matches, or null if it is not among the
 * first few. Identity (not text equality) is the test: two buttons can share a
 * label, and only the one the agent actually used is the right recording.
 */
async function matchIndex(locator: Locator, handle: ElementHandle<Node>): Promise<{ index: number; count: number } | null> {
  // One round trip for the index AND the match count, instead of a count
  // plus one evaluate per candidate element (up to eleven per describe).
  try {
    const r = await locator.evaluateAll((els, other) => ({ index: (els as Element[]).indexOf(other as Element), count: els.length }), handle);
    return r.count === 0 || r.index < 0 || r.index >= MATCH_INDEX_LIMIT ? null : r;
  } catch {
    return null; // detached page or malformed selector
  }
}

/** How far into a locator's matches the recorded element may sit and still be indexed. */
const MATCH_INDEX_LIMIT = 10;

function candidatesFor(info: ElementInfo, noPoint = false): Candidate[] {
  const out: Candidate[] = [];
  // Identity first, when the element sits in a record's row that shows a
  // value the caller vouched for: that locator names the RECORD, so it is the
  // only candidate here that survives the record moving, being renumbered, or
  // another record sorting above it.
  const anchor = identityAnchor(info);
  if (anchor) out.push(cand(anchor));
  if (info.testid) {
    const { attr, value } = info.testid;
    out.push(cand({ kind: 'testid', attr, value }));
  }
  if (info.role && info.name) out.push(cand({ kind: 'role', role: info.role, name: info.name }));
  if (info.label) out.push(cand({ kind: 'label', label: info.label }));
  if (info.placeholder) out.push(cand({ kind: 'placeholder', placeholder: info.placeholder }));
  if (info.id && info.idStable) {
    const sel = /^[A-Za-z][\w-]*$/.test(info.id) ? `#${info.id}` : `[id=${JSON.stringify(info.id)}]`;
    out.push(cand({ kind: 'id', selector: sel }));
  }
  if (info.text && !info.role) out.push(cand({ kind: 'text', text: info.text }));
  // A control no rung above names — no testid, role+name, label, placeholder,
  // stable id or text — is named by its own attributes before any path: see
  // ElementInfo.attrs (fwod78 07-open). Only then: it must never displace a
  // name. A value carrying one of this run's own values (a typed title, a
  // declared var) is the run's, not the control's.
  const named = info.testid || (info.role && info.name) || info.label || info.placeholder || (info.id && info.idStable) || info.text;
  if (!named && info.attrs && !identityHints.some((h) => info.attrs!.includes(h))) out.push(cand({ kind: 'css', selector: info.attrs }));
  // The anchored rung between the element's own semantics and the bare
  // positional path: `[ancestor-testid] input` names a region and then the
  // element's kind within it. The chain walker verifies it against the live
  // element and adds `nth` only when the region holds several — which
  // structural() then honestly reports as positional. Without this rung a
  // testid-rich app whose input's own semantics drift falls straight to
  // position from the document root (fwgr17-n3's panel-title fill).
  if (info.anchor) {
    out.push(cand({ kind: 'css', selector: `[${info.anchor.attr}=${JSON.stringify(info.anchor.value)}] ${info.tag}` }));
  }
  out.push(cand({ kind: 'css', selector: info.cssPath }));
  // Where it was, last of all — see LocatorCandidate 'point'. Not inside a
  // frame: the box is in the frame's coordinates, and both runners mark a
  // point on the page.
  if (info.box && !noPoint) {
    const { x, y, w, h } = info.box;
    out.push(cand({ kind: 'point', x: Math.round(x + w / 2), y: Math.round(y + h / 2), w, h, role: info.role, tag: info.tag, vw: info.viewport.w, vh: info.viewport.h }));
  }
  return out;
}

/**
 * Values that IDENTIFY the record being worked on this instruction: the
 * caller's declared variables (a runid) plus anything typed during the
 * instruction (the title of the thing just created). Set by the agent loop
 * around each instruction; used only to prefer a record-anchored locator over
 * a positional one, so a stale or empty list costs nothing but the old
 * behaviour.
 */
let identityHints: string[] = [];

export function setIdentityHints(values: string[]): void {
  identityHints = values.map((v) => String(v ?? '').trim()).filter((v) => v.length >= MIN_HINT_LEN && v.length <= 120);
}

export function addIdentityHint(value: string): void {
  const v = String(value ?? '').trim();
  if (v.length >= MIN_HINT_LEN && v.length <= 120 && !identityHints.includes(v)) identityHints.push(v);
}

const MIN_HINT_LEN = 4;

/** The scoped candidate for this element, when its row shows an identity hint. */
function identityAnchor(info: ElementInfo): LocatorCandidate | null {
  const row = info.row;
  if (!row || !identityHints.length) return null;
  // Longest match wins: a part's full name is a sharper anchor than the runid
  // it starts with, and the runid alone would match every row of this run.
  const hit = identityHints.filter((h) => row.text.includes(h)).sort((a, b) => b.length - a.length)[0];
  if (!hit) return null;
  // A hint can be true of many rows at once: every part created this run is
  // named "<runid> RD Part X", so `hasText: runid` matches them all and replay
  // reads that ambiguity as drift (fwrd11l 03-add/04-edit/06-remove). Narrow
  // it to the shortest CELL containing the hint — that cell names this record
  // and still carries the hint, so compile slots the known value inside it.
  const narrowed = row.cells.filter((c) => c.includes(hit)).sort((a, b) => a.length - b.length)[0];
  const hasText = narrowed && narrowed.length <= 120 ? narrowed : hit;
  return { kind: 'scoped', container: row.container, hasText, ...(row.inner ? { selector: row.inner } : {}) };
}

function cand(spec: LocatorCandidate): Candidate {
  return { spec, expr: candidateExpr(spec), make: (p) => makeLocator(p, spec) };
}

/**
 * An id whose last `-`/`_` token is a number of 3+ digits: `opportunity-
 * detail-2662`. Either a render counter (a view numbered per render — fwec2
 * recorded `#opportunity-edit-3571` as the css root of a Save click and it
 * missed on every replay, leaving the point fallback to carry the step) or a
 * record's own id (`issue-4521`). Characters cannot tell them apart;
 * provenance can: a record id is also shown where the page names its record —
 * the url, or a link inside the element — and a render counter is shown only
 * in ids. Page-side copy in describeInPage; test/shape-gate.test.ts holds the
 * two literals equal.
 *
 * Glued to letters, 2+ digits already count: ember names every component
 * `ember<N>` per render (`ember101`, `ember-power-select-options-ember115`).
 * fwgh4 n2 clicked `#ember101` — the recording's "New post" link, another
 * post's row by then — and 04/05-open's `#ember114`/`#ember123` missed on
 * every replay. `col-12` and `h2` stay ids: the separated form keeps its
 * 3-digit rule and one digit is never a counter. Groups: prefix and digits
 * are 1/2 (separated) or 3/4 (glued).
 */
const COUNTER_ID = /^(?:(.+[-_])(\d{3,})|(.*[A-Za-z])(\d{2,}))$/;

/** Whether `digits` stands whole in `url`, between non-digits. */
function digitsInUrl(url: string | undefined, digits: string): boolean {
  return Boolean(url) && url!.split(/[^0-9]+/).includes(digits);
}

/**
 * Framework-generated ids (React's `:r3:`, hash suffixes, bare counters) are
 * re-minted on the next run, so they are worse than the structural path.
 * `url`, when known, is the page's: the only evidence node-side has that a
 * counter-shaped id names the record (see COUNTER_ID). Without it such an id
 * is demoted — the cost direction: the other candidates still stand.
 */
export function isStableId(id: string, url?: string): boolean {
  if (!id || id.length > 64) return false;
  if (/^[:\d]/.test(id)) return false;
  if (GENERATED_ID_HEX_RUN.test(id)) return false;
  // React's useId with the colons swapped for underscores (grafana does
  // this): `_rgl_`, `_r2u_`. Re-minted every render pass, so a primary built
  // on one misses on every replay — fwgr18 recorded `[id="_rgl_"]` and
  // `[id="_r2u_"]` as primaries and both were dead chains at replay time.
  if (/^_r[0-9a-z]{1,4}_$/i.test(id)) return false;
  const counter = COUNTER_ID.exec(id);
  if (counter && !digitsInUrl(url, counter[2] ?? counter[4])) return false;
  return !/^(radix|headlessui|mui|react-aria)[-:]/i.test(id);
}

/** Runs in the page: everything a locator can be built from, in one round trip. */
function describeInPage(node: Node): ElementInfo {
  const el = node as Element;
  const attr = (name: string) => el.getAttribute(name) || null;
  // The same judgement as isStableId (which this page-side code cannot
  // call): a framework-minted id (React's `_r8b_`, radix, a hash) anchoring
  // the structural path or a row container is dead on the next load. The hex
  // literal is shape.ts GENERATED_ID_HEX_RUN, inlined because this runs in the
  // page; test/shape-gate.test.ts holds the two equal.
  const minted = (id: string): boolean =>
    !id ||
    id.length > 64 ||
    /^[:\d]/.test(id) ||
    /[0-9a-f]{8,}/i.test(id) ||
    /^_r[0-9a-z]{1,4}_$/i.test(id) ||
    /^(radix|headlessui|mui|react-aria)[-:]/i.test(id);
  // COUNTER_ID, page-side (shape-gate holds the literal equal), with more
  // evidence than node-side has: the number names the record when the url or
  // a link on or inside the id's element shows it too. Returns the id's prefix
  // when the number is a render counter, else null — '' when the prefix names
  // no view kind (bare `ember` is every component: nothing to root at).
  // A ONE-digit glued id is a counter only on evidence: the document numbers
  // the same prefix again. fwgh5 s_8e130d kept `#ember5` as the Sign in
  // button's second candidate — the counter's early value, which the shape
  // rule's two digits cannot see — while `h1` or `col2` alone on a page are
  // names, not numbering. A family (`ember5` beside `ember3`) is what a render
  // counter leaves; a demoted enumeration (`tab1` beside `tab2`) costs one
  // candidate and the others still stand, which is the cost direction.
  const numberedAgain = (id: string, prefix: string): boolean => {
    const same = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+$`);
    for (const other of Array.from(document.querySelectorAll(`[id^="${CSS.escape(prefix)}"]`)).slice(0, 200)) {
      if (other.id !== id && same.test(other.id)) return true;
    }
    return false;
  };
  const COUNTER = /^(?:(.+[-_])(\d{3,})|(.*[A-Za-z])(\d{2,}))$/;
  const counterPrefix = (node: Element): string | null => {
    let m: (string | undefined)[] | null = COUNTER.exec(node.id);
    if (!m) {
      const one = /^(.*[A-Za-z])(\d)$/.exec(node.id);
      if (!one || !numberedAgain(node.id, one[1])) return null;
      m = [node.id, undefined, undefined, one[1], one[2]];
    }
    const digits = (m[2] ?? m[4])!;
    const shows = (s: string | null) => Boolean(s) && s!.split(/[^0-9]+/).includes(digits);
    if (shows(location.href) || shows(node.getAttribute('href'))) return null;
    for (const a of Array.from(node.querySelectorAll('[href]')).slice(0, 50)) if (shows(a.getAttribute('href'))) return null;
    const prefix = (m[1] ?? m[3])!;
    return /[-_]/.test(prefix) ? prefix : '';
  };
  const stableNode = (node: Element): boolean => !minted(node.id) && counterPrefix(node) === null;
  const clean = (s: string | null | undefined) => {
    const t = (s ?? '').replace(/\s+/g, ' ').trim();
    return t && t.length <= 80 ? t : null;
  };

  const TESTID_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy'];
  const testidAttr = TESTID_ATTRS.find((a) => el.getAttribute(a));

  // Nearest testid-carrying ANCESTOR — see ElementInfo.anchor.
  const anchorOf = (): { attr: string; value: string } | null => {
    for (let cur = el.parentElement, hops = 0; cur && hops < 10; cur = cur.parentElement, hops++) {
      const a = TESTID_ATTRS.find((x) => cur!.getAttribute(x));
      if (a) return { attr: a, value: cur.getAttribute(a)! };
    }
    return null;
  };
  const tag = el.tagName.toLowerCase();
  const type = (attr('type') || '').toLowerCase();

  // The element's own non-positional attributes, as one selector that singles
  // it out on the page — see ElementInfo.attrs. A value is used only when
  // nothing marks it as the run's: not minted (`minted`, COUNTER: a hash, a
  // render counter), and no number in it that the page url also shows (the
  // url-id provenance counterPrefix uses). State (`aria-expanded`) and
  // references to other elements' ids (`aria-controls`) are never identity.
  const ownAttributes = (): string | null => {
    const urlDigits = new Set(location.href.split(/[^0-9]+/).filter(Boolean));
    const stable = (v: string): boolean =>
      v.length <= 80 && !/[\n\r]/.test(v) && !minted(v) && !COUNTER.test(v) && !v.split(/[^0-9]+/).some((d) => d && urlDigits.has(d));
    const state = /^aria-(label|labelledby|describedby|controls|owns|activedescendant|expanded|selected|pressed|checked|current|hidden|disabled|busy|invalid|valuenow|valuetext|valuemin|valuemax|posinset|setsize|sort)$/;
    const parts: string[] = [];
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      const own = n === 'name' || n === 'type' || n === 'href' || (n.startsWith('data-') && !TESTID_ATTRS.includes(n)) || (n.startsWith('aria-') && !state.test(n));
      if (own && CSS.escape(n) === n && stable(a.value)) parts.push(`[${n}=${JSON.stringify(a.value)}]`);
    }
    const unique = (sel: string): boolean => {
      try {
        return el.ownerDocument.querySelectorAll(sel).length === 1;
      } catch {
        return false;
      }
    };
    const some = parts.slice(0, 8);
    for (const p of some) if (unique(`${tag}${p}`)) return `${tag}${p}`;
    for (let i = 0; i < some.length; i++) for (let j = i + 1; j < some.length; j++) if (unique(`${tag}${some[i]}${some[j]}`)) return `${tag}${some[i]}${some[j]}`;
    return null;
  };

  const implicitRole = (): string | null => {
    if (tag === 'button') return 'button';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (tag === 'select') return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'img') return 'img';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
      if (type === 'search') return 'searchbox';
      if (type === 'number') return 'spinbutton';
      if (['text', 'email', 'tel', 'url', 'password', ''].includes(type)) return 'textbox';
      return null;
    }
    return null;
  };

  const labelText = (): string | null => {
    const labelledBy = attr('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
        .join(' ');
      const cleaned = clean(parts);
      if (cleaned) return cleaned;
    }
    if (el.id) {
      const forLabel = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLabel) return clean(forLabel.textContent);
    }
    return clean(el.closest('label')?.textContent ?? null);
  };

  const cssPath = (): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur.nodeType === 1 && parts.length < 6) {
      const node: Element = cur;
      if (stableNode(node)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      // A render-counter id still names its view by its prefix: root there,
      // not at whatever six parts from the element happen to reach.
      const prefix = minted(node.id) ? null : counterPrefix(node);
      if (prefix) {
        parts.unshift(`[id^=${JSON.stringify(prefix)}]`);
        break;
      }
      let part = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  };

  // Nearest repeated container and this element's path inside it. The
  // container selector is deliberately GENERIC (its tag, scoped to a stable
  // ancestor id when there is one) so it matches every record's container on
  // a later run and `hasText` alone picks the record.
  const rowOf = (): { container: string; text: string; inner: string; cells: string[] } | null => {
    let box = el.closest('tr, li, [role="row"], [role="listitem"], [role="option"]');
    // Not every list is semantic: an app that renders rows as divs is just as
    // common. Fall back to the nearest ancestor that HAS siblings of its own
    // shape — that repetition is what makes it a record container.
    if (!box) {
      for (let cur: Element | null = el, hops = 0; cur && hops < 4; cur = cur.parentElement, hops++) {
        const parent = cur.parentElement;
        if (!parent) break;
        const shape = (n: Element) => `${n.tagName}.${n.getAttribute('class') ?? ''}`;
        const sibs = Array.from(parent.children).filter((c) => shape(c) === shape(cur!));
        if (sibs.length >= 2 && cur !== el) {
          box = cur;
          break;
        }
      }
    }
    if (!box) return null;
    const text = (box as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text || text.length > 400) return null;
    const cls = (box.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)[0];
    const tagOf = box.tagName.toLowerCase() + (cls && /^[A-Za-z][\w-]*$/.test(cls) ? `.${cls}` : '');
    let container = tagOf;
    for (let p = box.parentElement, hops = 0; p && hops < 3; p = p.parentElement, hops++) {
      if (stableNode(p)) {
        container = `#${CSS.escape(p.id)} ${tagOf}`;
        break;
      }
    }
    // The element's path relative to the container, same shape as cssPath.
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== box && parts.length < 5) {
      const parent: Element | null = cur.parentElement;
      let part = cur.tagName.toLowerCase();
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
    }
    // The row's own cells, so an anchor can be narrowed from "contains the
    // runid" (true of every row this run touched) to the one cell that
    // actually names this record.
    const cells = Array.from(box.children)
      .map((c) => (c as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((t) => t && t.length <= 120)
      .slice(0, 12);
    return { container, text, inner: cur === box ? parts.join(' > ') : '', cells };
  };

  const label = labelText();
  const name =
    clean(attr('aria-label')) ||
    label ||
    clean(attr('placeholder')) ||
    clean(attr('alt')) ||
    clean(attr('title')) ||
    // Never an input's VALUE: it is not an accessible name (getByRole would
    // not match it at replay), it changes every run, and on an unlabeled
    // password field it put the typed secret into the recording.
    clean(tag === 'input' ? '' : (el as HTMLElement).innerText);

  return {
    tag,
    testid: testidAttr ? { attr: testidAttr, value: el.getAttribute(testidAttr)! } : null,
    id: el.id || null,
    idStable: stableNode(el),
    role: attr('role') || implicitRole(),
    name,
    label,
    placeholder: clean(attr('placeholder')),
    text: clean(tag === 'input' ? null : (el as HTMLElement).innerText),
    cssPath: cssPath(),
    row: rowOf(),
    anchor: anchorOf(),
    attrs: ownAttributes(),
    box: (() => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      const round = (n: number) => Math.round(n * 10) / 10;
      return { x: round(r.left + window.scrollX), y: round(r.top + window.scrollY), w: round(r.width), h: round(r.height) };
    })(),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

/** Single-quoted JS string literal. */
export function q(value: string): string {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n')}'`;
}
