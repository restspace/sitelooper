import type { BrowserSession } from '../daemon/browser.js';
import type { SessionState } from '../daemon/state.js';
import type { ChatMessage, Provider, ToolCall, ToolDef } from './llm.js';
import { isEmptyAssistant } from './llm.js';
import { captureSignature } from '../daemon/diff.js';
import { evidenceLiterals, readEvidence, renderEvidence } from './evidence.js';
import { CURRENT_DIALECT, coverageComplete } from '../execution/snapshot.js';
import { fingerprintPage } from '../daemon/fingerprint.js';
import { candidatesFor, renderCandidates, type ReplayResult } from '../skills/replay.js';
import { componentsOnPage, renderComponents } from '../skills/components.js';
import { originOf } from '../skills/store.js';
import { siteModel } from '../skills/sitemap.js';
import { buildSystemPrompt } from './prompt.js';
import { admitsIncompletion, artefactKeys, backfillReadValues, flattenComposedValues, flattenContainedComposite, flattenProvenComposite, mergeReportValues, namingAskMessage, positionDatumKeys, promoteLabelledReads, publishProseIdentifiers, unnamedReadValues, validateReport, type Report } from './report.js';
import { executeTool, toolDefsFor, type ToolExecution } from './tools.js';
import { visionSettings } from './vision.js';
import { captureReadBack, captureReadBackAt, coreReadBack, savedSelectionReadBack, selectionReadBack, setIdentityHints, shownReadBack, titleReadBack, visibleTextsWithin } from '../daemon/recorder.js';
import { describeOutcome, pinPart, sightValues, sourceReadBacks, type ReadBackDecider, type ReadBackTarget } from './readback.js';
import { SOURCING_HOLD_MIN_MS, applyCommentaryPrePass, decideSourcingHold, sourcingAskMessage, sourcingHoldOn, splitCommentary, type TierVerdict } from './sourcing.js';

/** Tools that change the page URL, staleing every existing snapshot's refs. */
const NAVIGATION_TOOLS = new Set(['goto', 'back', 'tabs']);

/** Per-turn LLM watchdog: a turn that hasn't produced a tool call by now is aborted. */
export const DEFAULT_TURN_TIMEOUT_MS = 90_000;

/**
 * Consecutive turns allowed to end without a tool call (watchdog abort or
 * prose-only reply) before the loop gives up. Bailing here turns a silent
 * multi-minute stall into a fast, explicit failure.
 */
const MAX_UNPRODUCTIVE_TURNS = 3;

/** Gestures that count towards cycle detection; observations never do. */
const CYCLE_TOOLS = new Set(['click', 'dblclick', 'modifier_click', 'right_click', 'fill', 'type', 'press', 'select', 'check', 'goto', 'back']);
/** Repetitions of a cycle before it counts as looping. */
const CYCLE_REPEATS = 3;
/** Longest cycle looked for (Exit edit ↔ Discard is 2; open-menu, pick, confirm is 3). */
const CYCLE_MAX_PERIOD = 3;

/**
 * The period of a short cycle that has just repeated CYCLE_REPEATS times at
 * the tail of `acts`, or 0. Entries carry the tool, its args AND the tool
 * result (state diff included), so a paginating "Next" click whose diff
 * differs each time is not a cycle — only identical responses to identical
 * gestures are.
 */
export function loopingCycle(acts: string[]): number {
  for (let p = 1; p <= CYCLE_MAX_PERIOD; p++) {
    const need = p * CYCLE_REPEATS;
    if (acts.length < need) return 0;
    const tail = acts.slice(-need);
    let same = true;
    for (let i = p; i < need && same; i++) if (tail[i] !== tail[i - p]) same = false;
    if (same) return p;
  }
  return 0;
}

/**
 * Extra turn/time budget the escalation attempt gets when the routine model
 * bailed by exhausting its own. Deliberately modest: the point is to clear a
 * wall the first attempt proved is there, not to let one instruction run away.
 */
const ESCALATION_BUDGET_MULTIPLIER = 1.5;

/** Tools that observe, arm or wait: nothing they do changes what the page shows. */
/** Browser gestures: the actions whose failure leaves the page short of what the instruction asked (see InstructionResult.unfinishedGesture). */
const GESTURE_TOOLS = new Set(['click', 'dblclick', 'modifier_click', 'right_click', 'fill', 'type', 'press', 'select', 'check', 'drag', 'upload', 'goto', 'back']);
const NOT_A_MUTATION = new Set(['snapshot', 'read', 'read_all', 'eval', 'screenshot', 'wait_for', 'fetch_source', 'dialog_expect', 'report', 'hover', 'scroll_into_view']);

/** How much of a tool result trace.jsonl keeps: enough to see the [state: …] note and the top of a [page: …] block. */
const TRACE_RESULT_CHARS = 2500;

/** Cap on the evidence values carried into the durable one-line report entry. */
const REPORT_FACTS_CHARS = 600;

/**
 * What a turn looks like to an observer standing beside the loop.
 *
 * A PLAIN interface, named here and implemented elsewhere (src/agent/
 * actor-jev.ts), so this file keeps no knowledge of what is watching: no
 * import, no branch on whether a watcher exists, no second code path. Absent,
 * the loop is byte for byte the loop that existed before — test/actor-jev.test
 * .ts asserts the InstructionResult and the turn count are identical with and
 * without one.
 *
 * Every method returns void and is called inside a swallow: a shadow that
 * throws, or that is slow inside its own async work, may not change what the
 * agent does, how long it takes, what it says, what it records, or the page.
 * Nothing here is awaited.
 */
export interface ShadowTurn {
  /** 1-based turn number within this instruction. */
  turn: number;
  instruction: string;
  browser: BrowserSession;
}

export interface LoopShadow {
  /**
   * The model has just been asked and is thinking. The page is idle for the
   * whole of that wait, which is why an observation taken here costs no
   * wall-clock — it is the one moment in the turn when looking is free.
   */
  onTurnStart(ctx: ShadowTurn): void;
  /** The model answered: these are the calls it chose, and this turn's timing so far (modelMs is final). */
  onTurnDecided(ctx: ShadowTurn, calls: readonly ToolCall[], timing: { modelMs: number; toolMs: number; tools: string[] }): void;
  /** One call ran. Index is its position in the turn; the recording now holds whatever step it filed. */
  onToolExecuted?(ctx: ShadowTurn, call: ToolCall, outcome: { ok: boolean; index: number }): void;
}

/**
 * A first tier that may take a turn INSTEAD of the model (notes/PLAN-jev.md §4c
 * step 7). Like the shadow it is a plain interface implemented elsewhere and
 * built at the composition root; unlike the shadow it is awaited, because its
 * answer decides what runs. It returns a whole tool call or null, and null is
 * always safe: the model is asked exactly as if no actor existed. It must not
 * throw — the loop treats a throw as null.
 */
export interface LoopActor {
  next(ctx: ShadowTurn): Promise<{ call: ToolCall; ms: number } | null>;
  /** Every tool call that ran — the actor's own and the model's — so its state has what was done. */
  /** `noEffect`: the call ran, and the page did not visibly change (an action result carrying "[state: no visible change"). */
  observed(call: ToolCall, outcome: { ok: boolean; noEffect?: boolean }): void;
}

export interface LoopOptions {
  maxTurns: number;
  timeoutMs: number;
  screenshotDir: string;
  /** Watchdog for a single LLM call; also clamped by the instruction deadline. */
  turnTimeoutMs?: number;
  /** Preempts the instruction (daemon `stop`); yields a blocked report, not a throw. */
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /**
   * Record this run under a different instruction text. The escalation path
   * sets it so the recording carries the caller's ORIGINAL wording (marked
   * `resume`), never the "You are RESUMING…" scaffold — a skill compiled from
   * scaffold text has an unmatchable template and a mid-crisis precondition,
   * so it refuses on every replay. The scaffold still goes to the model;
   * only what the recorder files changes.
   */
  recordAs?: { text: string; resume: true };
  /**
   * An observer beside the real turn (notes/PLAN-jev.md step 5). Optional and
   * advisory: it is told what happened and can say nothing back. Built at the
   * composition root, never here.
   */
  shadow?: LoopShadow;
  /** A first tier that may act before the model is asked. Optional; composed at the root. */
  actor?: LoopActor;
  /**
   * Who decides WHICH element a reported value is read back from, when the
   * page shows it in several places (notes/PLAN-jev.md site C). Optional, and a
   * plain function type: the cascade behind it — Jev, or nothing — is composed
   * at the composition root, and this module never asks whether a System One
   * tier exists. With no decider the ambiguous values go to the model exactly
   * as they always did.
   */
  locateReadBack?: ReadBackDecider;
}

/** One tool call the instruction made, for the resume-safety actions log. */
export interface ActionRecord {
  tool: string;
  args: string;
  ok: boolean;
}

/**
 * Where an instruction's wall-clock went: waiting on the model, or driving the
 * browser. Exists because every claim about speeding the loop up needs the
 * split — the record-vs-replay ratio (fwrd42: 1,212s vs 24s) says the model
 * dominates but is a proxy, and "how much would a faster decision layer save"
 * is exactly `modelMs / totalMs`, per kind of turn. Aborted model calls count:
 * a watchdog abort is time the model spent.
 */
export interface InstructionTiming {
  totalMs: number;
  modelMs: number;
  toolMs: number;
  modelCalls: number;
  /** One row per turn: what the model took to decide, what its tool calls took to run, and what they were. */
  turns: Array<{ modelMs: number; toolMs: number; tools: string[]; steps?: Array<{ tool: string; ms: number; ok: boolean }>; actorMs?: number; actorTools?: string[] }>;
  /** Time spent asking the first-tier actor, and how many actions it took. Absent without one. */
  actorMs?: number;
  actorActs?: number;
}

export interface InstructionResult {
  report: Report;
  turns: number;
  usage: { promptTokens: number; completionTokens: number; cachedTokens: number };
  timing: InstructionTiming;
  /** Last few transcript lines, included when the loop had to bail out. */
  transcriptTail?: string[];
  /**
   * Ordered tool calls this instruction made — included on bail-out (turn/time
   * cap) so a caller can see which state-changing actions ran before deciding
   * whether to resume. Omitted on a clean report to keep results lean.
   */
  actions?: ActionRecord[];
  /**
   * Where the browser was left on bail-out. Included even when nothing ran, so
   * a timed-out instruction still hands back something observable rather than
   * an empty actions log.
   */
  finalState?: { url: string; title?: string };
  /**
   * Paths of every screenshot the agent saved during this instruction, in the
   * order taken. Tracked by the loop from actual tool results (not the
   * model's self-report), and always included — screenshots are often the
   * caller's only evidence, so they must survive a run whether the report is
   * a clean success or a bail-out.
   */
  screenshots: string[];
  /**
   * Present only when the routine model left the instruction blocked and a
   * stronger fallback model retried it. `report`/`turns`/`usage` above are then
   * the COMBINED result (so cost accounting stays honest); this records what
   * the first attempt cost and why the retry happened.
   */
  escalation?: EscalationRecord;
  /**
   * Why the loop gave up, when it did. Lets a caller (notably the escalation
   * path) distinguish "ran out of road" from "decided it was stuck" instead of
   * pattern-matching the summary prose.
   */
  bailReason?: BailReason;
  /**
   * Present only on a SUCCESS report whose last attempted browser gesture
   * (click, fill, goto, … — alone or as a batch's last step) FAILED: nothing
   * after it changed the page, so the instruction's final act never landed,
   * whatever the report says. fwop10-n2 02-create: the "Submit comment" click
   * was not dispatched (the button was still disabled), the model reported
   * success with the comment "NOT confirmed as posted", and the recovery
   * banked a comment procedure with no submit as 1/1. Read off the executor's
   * own outcomes, never the model's prose; the flow runner decides what it
   * costs (src/daemon/step-verdict.ts).
   */
  unfinishedGesture?: { tool: string; args: string };
  /**
   * Learning-mode accounting: which stored skills were offered, which one
   * (if any) the agent replayed and how far it got, and what fraction of the
   * instruction's browser actions ran deterministically.
   */
  skill?: SkillRecord;
  /**
   * Present for a zero-model replay: every value its reads observed, ECHOES
   * INCLUDED — what a later step's `{{step.output}}` may resolve to, as the
   * compiled artifact's `outputs` carries them. The report's confident values
   * (`report.evidence.values`) still exclude an echo: a read of what the
   * procedure itself typed or clicked proves the control, not persistence.
   * The two are different questions — "did the app keep it?" and "what is this
   * page's word for it?" — and fwkb27 05-open paid two model recoveries for
   * conflating them: its pinned procedure clicked the link 04-open had read as
   * `sidebar_menu_edit_the_task` ("Edit the task"), the daemon dropped that
   * read as an echo of 04-open's own click and banked nothing, and the
   * reference went unresolved on a page that was showing the link.
   */
  published?: Record<string, string>;
  /**
   * Present for a zero-model replay: report-template keys it could not report
   * (their recorded text was not on the page) but whose one slot this run
   * supplied — referenceValue, src/execution/report.ts. For a later step's
   * reference only, and only where one consumes the key, as the artifact
   * publishes it; never a finding. fwod74's `second_product_name`.
   */
  references?: Record<string, string>;
}

export interface SkillRecord {
  listed: string[];
  invoked?: string;
  /**
   * The params `invoked` actually ran with. Export binds a flow step's params
   * from the skill's template, which only works while the instruction keeps
   * the wording the skill was learned from: fwrd51's "add a SECOND part"
   * replayed s_380adc with the agent's own params, the template bound nothing,
   * and the flow pinned the skill with no params at all.
   */
  invokedParams?: Record<string, string>;
  stepsReplayed: number;
  stepsTotal: number;
  /** The replay stopped part-way and the agent carried on. */
  repaired: boolean;
  /** Replay refused to start (wrong page / bad params). */
  refused: boolean;
  fallthroughs: number;
  similarity: number | null;
  /** Structured locator misses from the replay (drift telemetry). */
  misses?: import('../skills/replay.js').LocatorMiss[];
  /**
   * Steps whose effect evidence could not be captured (ReplayResult.unobserved).
   * The run may still have been right; what it cannot be is PROOF, so it does
   * not count towards promoting the procedure.
   */
  unobserved?: string[];
  /** Why the replay stopped, when it did (drift telemetry). */
  failReason?: string;
  /** The replay's own warnings, per segment, prefixed with the segment's skill id (tier A only). */
  warnings?: string[];
  /** Labels of the replay's labelled reads that were skipped — nothing observed (ReplayResult.skippedReads; tier A only). */
  skippedReads?: string[];
  /** Report values made only of params that the replay withheld as given, not observed (ReplayReport.given, round 60; tier A only). */
  given?: string[];
  /** 1-based skill step the replay failed at, when it did. */
  failedAt?: number;
  /** The url the replay finished (or stopped) on. */
  replayUrl?: string;
  /** Browser actions taken by replay vs. in total (batch steps count individually). */
  deterministicActions: number;
  totalActions: number;
  /** 'A' = replayed by the daemon without any model call; 'B' = the agent invoked run_skill. */
  tier?: 'A' | 'B';
}

export type BailReason = 'turn-cap' | 'timeout' | 'stalled' | 'stopped' | 'invalid-report' | 'looping';

/**
 * One reason to hold a schema-valid report and ask the model again. `check`
 * returns null when the report passes, else what to tell the model and how
 * to log it. Holds are consulted in order; each fires at most once.
 */
interface ReportHold {
  name: string;
  check: (report: Report) => HoldAsk | null | Promise<HoldAsk | null>;
}

interface HoldAsk {
  message: string;
  transcript: string;
  progress: string;
}

/**
 * The first hold not yet asked that has something to ask about `report`. A
 * hold's check may be async (the sourcing hold sweeps the live page); one
 * that throws asks nothing — a wedged page must never turn a good report
 * into no report.
 */
async function firstHold(holds: ReportHold[], asked: Set<string>, report: Report): Promise<(HoldAsk & { name: string }) | null> {
  for (const hold of holds) {
    if (asked.has(hold.name)) continue;
    let hit: HoldAsk | null = null;
    try {
      hit = await hold.check(report);
    } catch {
      hit = null;
    }
    if (hit) return { name: hold.name, ...hit };
  }
  return null;
}

export interface EscalationRecord {
  from: string;
  to: string;
  /** The blocked summary that triggered the retry. */
  reason: string;
  firstAttempt: {
    status: Report['status'];
    turns: number;
    usage: { promptTokens: number; completionTokens: number; cachedTokens: number };
  };
  /** Whether the stronger model actually rescued the instruction. */
  rescued: boolean;
  /** Tool results blanked from the failed attempt before the retry saw it. */
  compactedToolResults: number;
}

/**
 * The agentic loop: send instruction + history, execute the model's tool
 * calls in-process, feed results back, until a valid `report` (or turn/time
 * caps hit → blocked with a transcript tail).
 */
export async function runInstruction(
  provider: Provider,
  browser: BrowserSession,
  state: SessionState,
  instruction: string,
  opts: LoopOptions,
): Promise<InstructionResult> {
  const startedAt = Date.now();
  const deadline = startedAt + opts.timeoutMs;
  const usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
  const timing: InstructionTiming = { totalMs: 0, modelMs: 0, toolMs: 0, modelCalls: 0, turns: [] };
  const transcript: string[] = [];
  const actions: ActionRecord[] = [];
  /** The last browser gesture this instruction attempted, and whether it went through (see unfinishedGesture). */
  let lastGesture: { tool: string; args: string; ok: boolean } | null = null;
  const noteGesture = (tool: string, args: string, execution: { isError: boolean; stepMs?: Array<{ tool: string; ok: boolean }> }): void => {
    if (tool === 'batch') {
      for (const step of execution.stepMs ?? []) if (GESTURE_TOOLS.has(step.tool)) lastGesture = { tool: step.tool, args: '(in a batch)', ok: step.ok };
      return;
    }
    // A stored procedure's replay answers for itself (its gates); what the
    // agent attempted before it is no longer the last word on the page.
    if (tool === 'run_skill') {
      if (!execution.isError) lastGesture = null;
      return;
    }
    if (GESTURE_TOOLS.has(tool)) lastGesture = { tool, args, ok: !execution.isError };
  };
  const screenshots: string[] = [];
  let reportRetried = false;
  /** evidence.values from the report held for naming, so the retry cannot lose them. */
  let heldValues: Record<string, string | number | boolean | null> | undefined;
  /**
   * Reasons to hand a schema-valid report back to the model ONCE before
   * accepting it, asked in this order. Each fires at most once per
   * instruction and never on the last turn: a held report that then hits the
   * cap is reported as blocked, and losing a completed instruction costs far
   * more than anything a hold can win. The retry is accepted whatever it
   * says — so is the first report, if the model simply repeats it.
   */
  const holds: ReportHold[] = [
    {
      // A success whose own summary says the work was not finished: the
      // status and the prose must agree before a flow marks the step done on
      // the strength of the status alone.
      name: 'contradiction',
      check: (report) => {
        const admission = report.status === 'success' ? admitsIncompletion(report.summary) : null;
        if (!admission) return null;
        return {
          message: `report held — status is "success" but the summary says "${admission}". Those cannot both be true. If the instruction was FULLY completed and verified, call report again with a summary that does not describe unfinished work. If it was not, call report again with status "failure" or "blocked" and say exactly what is missing. Do not take further actions first.`,
          transcript: `report held for contradiction: success but "${admission}"`,
          progress: `holding success report that admits "${admission}"`,
        };
      },
    },
    {
      // Values the report describes but never named. Ask with the values
      // quoted back so the model supplies labels rather than re-reading the
      // page — see unnamedReadValues for what an unnamed value costs every
      // later replay.
      name: 'naming',
      check: (report) => {
        const unnamed = unnamedReadValues(report, browser.script?.readsThisInstruction() ?? []);
        if (!unnamed.length) return null;
        heldValues = report.evidence?.values;
        browser.script?.noteNamingAsk?.(unnamed);
        return {
          message: namingAskMessage(unnamed),
          transcript: `report held for naming: ${unnamed.join(', ')}`,
          progress: `asking for names for ${unnamed.length} unnamed read value(s): ${unnamed.join(', ')}`,
        };
      },
    },
    {
      // Asked-for values no element shows and nothing this instruction read
      // (hygiene design §4, behind SITELOOPER_SOURCING_HOLD): the same
      // read-back tiers finish runs, as a dry run over a copy of the report
      // that files nothing, then the page sweep's proof of absence. Never on
      // top of a naming hold (one extra turn at most), never near the
      // deadline, never when the page cannot be asked.
      name: 'sourcing',
      check: async (report) => {
        if (!sourcingHoldOn() || report.status !== 'success' || !browser.script || !browser.isOpen) return null;
        if (holdsAsked.has('naming') || Date.now() + SOURCING_HOLD_MIN_MS > deadline) return null;
        const script = browser.script;
        const page = await browser.getPage().catch(() => null);
        if (!page) return null;
        const text = opts.recordAs?.text ?? instruction;
        const draft: Report = structuredClone(report);
        const reads = script.readsThisInstruction();
        positionDatumKeys(draft, reads);
        flattenComposedValues(draft);
        promoteLabelledReads(draft, reads);
        backfillReadValues(draft, reads);
        const values = draft.evidence?.values ?? {};
        const listed = new Set([...(skill.listed ?? []), ...(skill.invoked ? [skill.invoked] : [])]);
        for (const k of artefactKeys(values, { screenshots, skills: (id) => listed.has(id) || Boolean(browser.learn?.get(id)) })) delete values[k];
        const steps = script.stepsThisInstruction?.() ?? [];
        const pin = (part: string, partName: string) => pinPart(page, part, partName);
        const verdict = async (key: string, value: string): Promise<TierVerdict> => {
          if (await captureReadBack(page, value, key)) return 'sourced';
          if (await titleReadBack(page, value, key).catch(() => null)) return 'sourced';
          if (selectionReadBack(steps, value, key)) return 'sourced';
          if (await savedSelectionReadBack(page, steps, value, key).catch(() => null)) return 'sourced';
          // The composite tiers rewrite the report they are given: a throwaway copy each.
          if ((await flattenProvenComposite(structuredClone(draft), key, pin)).names.length) return 'sourced';
          if ((await flattenContainedComposite(structuredClone(draft), key, await visibleTextsWithin(page, value), text, pin)).names.length) return 'sourced';
          if (await shownReadBack(steps, draft, key, text)) return 'sourced';
          if (coreReadBack(steps, value, key, values)) return 'sourced';
          // A head the page shows is sourced: the stage 3 pre-pass in finish publishes it.
          const split = splitCommentary(value);
          if (split && (await captureReadBack(page, split.head, key))) return 'sourced';
          const sighting = (await sightValues(page, [value])).get(value.trim());
          if (!sighting || sighting.incomplete || sighting.truncated || sighting.candidates.length || sighting.extra) return 'unknown';
          return 'absent';
        };
        const decision = await decideSourcingHold({
          instruction: text,
          values,
          alreadyRead: script.readResultsThisInstruction(),
          alertTexts: [...steps.flatMap((s) => s.diff?.alerts ?? []), ...(report.evidence?.capturedDialogs ?? [])],
          verdict,
          evalResults: steps.flatMap((s) => (s.tool === 'eval' && typeof s.evalResult === 'string' ? [s.evalResult] : [])),
        });
        if (!decision.held.length) return null;
        const keys = decision.held.map((h) => h.key);
        sourcingHold.held = { keys, readsBefore: reads.length };
        script.noteSourcingAsk?.(keys);
        // As the naming hold does: the retry is asked to change one thing and
        // models drop the rest — fwop19 04-open came back with values {} and
        // published nothing. Every value the held report named is kept.
        heldValues = report.evidence?.values;
        return {
          message: sourcingAskMessage(decision.held),
          transcript: `report held for sourcing: ${keys.join(', ')}`,
          progress: `holding success report for sourcing: ${keys.join(', ')}`,
        };
      },
    },
  ];
  const holdsAsked = new Set<string>();
  /** The sourcing hold that fired, so the retry can be scored: did it add a labelled read, did it change data. (A holder: it is set inside the hold's closure.) */
  const sourcingHold: { held: { keys: string[]; readsBefore: number } | null } = { held: null };
  let capWarned = false;
  let unproductiveTurns = 0;
  // Recent state-changing calls with their outcomes, for cycle detection —
  // see loopingCycle. Cleared when the nudge is issued so the second strike
  // needs a fresh full cycle.
  const recentActs: string[] = [];
  let loopNudged = false;

  // Previous instructions' raw tool output describes a page that has usually
  // moved on; their durable conclusion survives as the `[report]` line below.
  // Blanking it here keeps per-turn context flat across a long session instead
  // of letting it grow until trimHistory's size cap forces the same thing.
  const elided = state.elidePriorToolResults();
  if (elided.elided) {
    opts.onProgress?.(
      `[history] elided ${elided.elided} tool result(s) from earlier instructions (~${Math.round(elided.charsSaved / 4000)}k tokens/turn saved)`,
    );
  }
  state.trimHistory();
  const location = await describeLocation(browser);
  // Learning mode: offer the stored procedures that start on this page. They
  // go in the user message, not the system prompt, so the cached prefix stays
  // byte-identical across instructions.
  const offered = await offerSkills(browser);
  // Site knowledge is independent of learning mode: what earlier sessions saw
  // of this page template — its controls and where they lead — is offered
  // whenever the store knows the page, so turn one can act without observing.
  const site = await offerSite(browser);
  const skill: SkillRecord = {
    listed: offered.ids,
    stepsReplayed: 0,
    stepsTotal: 0,
    repaired: false,
    refused: false,
    fallthroughs: 0,
    similarity: null,
    deterministicActions: 0,
    totalActions: 0,
  };
  state.messages.push({
    role: 'user',
    content: [instruction, location, site, offered.text].filter(Boolean).join('\n\n'),
  });
  // Script recording (opt-in) groups this instruction's actions under one
  // test.step, so a generated spec reads as the plan that produced it.
  // Identity hints for this instruction's locators: the caller's declared
  // variables (the runid every record of this run is named after). Typed
  // values join them as the instruction runs — see ScriptRecorder.prepare.
  setIdentityHints(Object.values(state.vars ?? {}));
  browser.script?.beginInstruction(
    opts.recordAs?.text ?? instruction,
    opts.recordAs ? { ...offered.context, resume: true } : offered.context,
  );

  const system: ChatMessage = { role: 'system', content: buildSystemPrompt(state) };
  const toolDefs = toolDefsFor(browser, visionSettings());

  /** Resume advice differs sharply depending on whether anything actually ran. */
  const resumeHint = () =>
    actions.length
      ? 'Work may be partially complete — check the actions log and verify current state before resuming.'
      : 'No tool call ran, so the browser was not touched — nothing to undo.';
  /** Only for the failure modes where the agent never got going by itself. */
  const narrowHint = ' Re-run with one concrete artifact per instruction.';

  const finish = async (
    report: Report,
    turns: number,
    blockedTail = false,
    bailReason?: BailReason,
  ): Promise<InstructionResult> => {
    // Sitelooper's own artefacts are never findings: a screenshot this
    // instruction saved, a stored skill's id (fwsi7 04-report published
    // `ref: "s_d5098a"` and `/tmp/ba00005_view.png`). Out before anything
    // below can pin, split or record them, and again after the prose pass,
    // which can mint a `ref` from the summary's own words. See artefactKeys.
    const dropArtefacts = (): void => {
      const values = report.evidence?.values;
      if (!values) return;
      const listed = new Set([...(skill.listed ?? []), ...(skill.invoked ? [skill.invoked] : [])]);
      const keys = artefactKeys(values, { screenshots, skills: (id) => listed.has(id) || Boolean(browser.learn?.get(id)) });
      for (const k of keys) delete values[k];
      if (keys.length) opts.onProgress?.(`[report] dropped ${keys.length} value(s) naming sitelooper's own artefacts (a screenshot or a skill id), not the page: ${keys.join(', ')}`);
    };
    dropArtefacts();
    // Deterministic evidence backfill: a read value the model cited in prose
    // but left out of evidence.values would drop the read at compile time and
    // leave the step with no skill. Runs before the facts line and before
    // read-back synthesis so both see the promoted values.
    if (report.status === 'success' && browser.script) {
      // A value the model composed out of several page values (a JSON blob per
      // order line) is unpinnable and unrepublishable as one string. Split it
      // first, so everything below — backfill, read-back synthesis, compile —
      // sees the scalars a real element actually shows.
      // First of all: a key that is page text the instruction read is a
      // datum, not a name — positional, before anything mints a name from it
      // (fwgh8 01-open's seed titles; see positionDatumKeys).
      const datums = positionDatumKeys(report, browser.script.readsThisInstruction());
      if (datums.length) opts.onProgress?.(`[report] ${datums.length} reported key(s) were page text, published positionally: ${datums.join(', ')}`);
      const split = flattenComposedValues(report);
      if (split.length) opts.onProgress?.(`[report] split composed value(s) into ${split.join(', ')}`);
      // Read-time labels first: the model named these values in the read call
      // itself, and its name must win over the selector slug backfill derives.
      const labelled = promoteLabelledReads(report, browser.script.readsThisInstruction());
      if (labelled.length) opts.onProgress?.(`[report] published ${labelled.length} read-time labelled value(s): ${labelled.join(', ')}`);
      const promoted = backfillReadValues(report, browser.script.readsThisInstruction());
      if (promoted.length) opts.onProgress?.(`[report] promoted ${promoted.length} prose-cited read value(s) into evidence: ${promoted.join(', ')}`);
      // Second source, for the identifiers no read observed at all: a record
      // reference the model only ever put in prose (a confirmed order's
      // S00021). Pin it on the live page as a real read, so it becomes a
      // published output a later step can reference and a replay re-reads its
      // OWN — fwod5 cancelled the recorded run's order for want of this.
      //
      // Named `ref`, not after the target. The target of a synthesized
      // read-back is the literal "(read-back)" or, on the model-sourced path, a
      // CSS selector — odoo published a value called `o_subtotal_o_total_name_`,
      // slugged from `.o_subtotal, .o_total, [name="amount_untaxed"]`. A later
      // step can only reference a name a human or a model would write.
      //
      // A value that cannot be pinned is published anyway: see
      // publishProseIdentifiers for what leaving it as prose cost.
      const script = browser.script;
      const page = browser.isOpen ? await browser.getPage().catch(() => null) : null;
      const { pinned, unpinned } = await publishProseIdentifiers(report, async (value) => {
        if (!page) return false;
        const step = await captureReadBack(page, value);
        if (!step) return false;
        script.addStep(step);
        return true;
      });
      if (pinned.length) opts.onProgress?.(`[report] pinned ${pinned.length} prose-cited identifier(s) to the page: ${pinned.join(', ')}`);
      if (unpinned.length) opts.onProgress?.(`[report] published ${unpinned.length} prose-cited identifier(s) no single element shows (a replay re-reads them through recovery): ${unpinned.join(', ')}`);
    }
    dropArtefacts();
    // This line is what survives once the instruction's tool results are
    // elided at the next boundary, so the facts the caller asked for ride
    // along with the prose — otherwise a value read in step 3 would be gone
    // by step 4 despite having been correctly obtained and reported.
    const values = report.evidence?.values;
    const facts =
      values && Object.keys(values).length
        ? ' | ' +
          Object.entries(values)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')
            .slice(0, REPORT_FACTS_CHARS)
        : '';
    state.messages.push({
      role: 'assistant',
      content: `[report] ${report.status}: ${report.summary}${facts}`,
    });
    // Close the recording's instruction group with its outcome, so a flow can
    // be built from what each step achieved (values, the skill it used).
    if (browser.script) {
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries(report.evidence?.values ?? {})) values[k] = String(v);
      // Read-back synthesis: for each value the agent reported, capture a
      // durable read of the live element showing it, so a replay re-reads the
      // value rather than dropping it as stale. Record-time only, best-effort,
      // never blocks the report. Skip values already backed by a real read.
      if (report.status === 'success' && Object.keys(values).length) {
        try {
          const page = await browser.getPage();
          const alreadyRead = browser.script.readResultsThisInstruction();
          // Keyed from here on: the read-back cascade (site C) needs the
          // evidence KEY as well as the value — Jev is shown the name the
          // report published it under, and a step code or Jev sources is
          // filed with that label rather than left for compile to recover by
          // matching the read's result against every reported value.
          const stragglers: ReadBackTarget[] = [];
          const seenValue = new Set<string>();
          // Keyed, not just valued. The evidence KEY is the output name a later
          // flow step references, and compile used to recover it by matching
          // the read's result against every reported value for an exact hit —
          // so a read differing by a currency symbol was stored unlabelled,
          // published nothing, and stranded every reference to it.
          const composites: { name: string; value: string }[] = [];
          for (const [name, value] of Object.entries(values)) {
            if (!value || alreadyRead.has(value) || seenValue.has(value)) continue;
            seenValue.add(value);
            const step = await captureReadBack(page, value, name);
            if (step) {
              browser.script.addStep(step);
              continue;
            }
            // The document title, read as the title — never pinned by
            // containment to text that happens to include it (EspoCRM fwec11
            // page_title and the footer's "EspoCRM, Inc."). See titleReadBack.
            const titled = await titleReadBack(page, value, name).catch(() => null);
            if (titled) {
              browser.script.addStep(titled);
              continue;
            }
            // The procedure's own selection (odoo fwod82's product): the
            // option this instruction clicked, whose diff shows the control
            // holding it — read there, right after the click. See
            // selectionReadBack.
            const selected = selectionReadBack(browser.script.stepsThisInstruction?.() ?? [], value, name);
            if (selected && browser.script.insertStepAfter) {
              browser.script.insertStepAfter(selected.after, selected.read);
              opts.onProgress?.(`[report] ${name} is the option this instruction selected: read back from its control after the selection`);
              continue;
            }
            // An option clicked by its value attribute (EspoCRM fwec10's
            // `.field[data-name="stage"] .option[data-value="Negotiation"]`):
            // read from that field on the saved record. See savedSelectionReadBack.
            const saved = await savedSelectionReadBack(page, browser.script.stepsThisInstruction?.() ?? [], value, name).catch(() => null);
            if (saved) {
              browser.script.addStep(saved);
              opts.onProgress?.(`[report] ${name} is the option this instruction chose by value: read back from the saved field`);
              continue;
            }
            composites.push({ name, value }); // maybe several values — try splitting, then the model
          }
          // A value the page refuses AS ONE STRING may be several values the
          // page vouches for individually: kanboard fwkb17 reported
          // `columns_left_to_right = "Backlog, Ready, Work in progress, Done"`,
          // nothing pinned, the outputs were pruned and both replays scored
          // 5/6 where the recording scored 6/6.
          //
          // Sited HERE, after captureReadBack already returned null, so it can
          // only ADD reads: a value that pins today never reaches this line,
          // and a split that the page does not vouch for in full changes
          // nothing and falls through to the model exactly as before. Worst
          // case is one extra count() per candidate part.
          for (const { name, value } of composites) {
            const { names, pinned } = await flattenProvenComposite(report, name, (part, partName) =>
              pinPart(page, part, partName),
            );
            if (!names.length) {
              // Not a list of values the page shows — perhaps the page's
              // element texts wrapped in the model's labels and punctuation
              // (fwgt8 "Seed: triage inbox (#1)", fwsi8 "Asset Tag SEED-0001 /
              // Name Seed: Reception Laptop"). Carved only where the visible
              // elements account for every word of it; see planContainedParts.
              const contained = await flattenContainedComposite(report, name, await visibleTextsWithin(page, value), opts.recordAs?.text ?? instruction, (part, partName) =>
                pinPart(page, part, partName),
              );
              if (contained.names.length) {
                for (const step of contained.pinned) browser.script.addStep(step);
                opts.onProgress?.(`[report] ${name} is element texts the page shows, labelled: split into ${contained.names.join(', ')} (read-back)`);
                continue;
              }
              // Stage 3 (hygiene design §4, behind SITELOOPER_SOURCING_HOLD):
              // `head + commentary` whose head the page shows publishes the
              // head; the commentary goes into the summary.
              if (sourcingHoldOn()) {
                const headed = await applyCommentaryPrePass(
                  report,
                  async (head, key) => {
                    const step = await captureReadBack(page, head, key);
                    if (!step) return false;
                    browser.script!.addStep(step);
                    return true;
                  },
                  [name],
                );
                if (headed.length) {
                  opts.onProgress?.(`[report] ${name} is a value the page shows plus commentary: published the head (read-back), commentary kept in the summary`);
                  continue;
                }
              }
              // Not on THIS page, but shown on an earlier one of this
              // instruction (Gitea fwgt10 01-open: the issue titles on the
              // list, the report made on the search page): read there, right
              // after the step whose diff showed them. See shownReadBack.
              const shown = await shownReadBack(browser.script.stepsThisInstruction?.() ?? [], report, name, opts.recordAs?.text ?? instruction);
              if (shown) {
                let after = shown.after;
                for (const read of shown.reads) {
                  browser.script.insertStepAfter(after, read);
                  after = read;
                }
                opts.onProgress?.(`[report] ${name} was shown earlier in this instruction (${shown.after.tool}): split into ${shown.names.join(', ')}, read where it was shown`);
                continue;
              }
              stragglers.push({ name, value }); // not pinnable, whole or in parts — try the cascade next
              continue;
            }
            for (const step of pinned) browser.script.addStep(step);
            opts.onProgress?.(`[report] ${name} is several values the page shows: split into ${names.join(', ')} (read-back)`);
          }
          // The instruction's recorded values must follow the report: a split
          // composite publishes its parts, not the joined string.
          if (composites.length) {
            for (const k of Object.keys(values)) delete values[k];
            for (const [k, v] of Object.entries(report.evidence?.values ?? {})) values[k] = String(v);
          }
          // The read-back cascade (notes/PLAN-jev.md site C): code, then the
          // optional System One tier, then the model — which until this
          // existed ran on EVERY instruction (9 of 9 in fwrdj3-n1, 9 of 9 in
          // fwrdj4-n1, 2.0-7.4s each, 33s and 36s of those recordings) to
          // return a handful of selectors that a search of the page finds,
          // and that code then verified anyway.
          //
          // The model keeps the last word and its prompt is unchanged; it is
          // simply asked about less, and about nothing at all when code has
          // sourced everything it could and PROVED the rest unsourceable
          // (see readback.ts: refused on length, or nowhere on the page).
          // Never past the instruction deadline: this is one more model
          // call, and the caller believes the budget bounds the whole thing.
          // An id reported without the affix the page shows it with (kanboard
          // fwkb41 "4" beside a pinned `#4`): read from that element, framed at
          // its core. See coreReadBack.
          for (const straggler of [...stragglers]) {
            const cored = coreReadBack(browser.script.stepsThisInstruction?.() ?? [], straggler.value, straggler.name, report.evidence?.values ?? {});
            if (!cored) continue;
            browser.script.addStep(cored);
            stragglers.splice(stragglers.indexOf(straggler), 1);
            opts.onProgress?.(`[report] ${straggler.name} is the core of a text this instruction pinned: read there, framed`);
          }
          if (stragglers.length && Date.now() < deadline) {
            const sourced = await sourceReadBacks(stragglers, page, {
              instruction: opts.recordAs?.text ?? instruction,
              url: page.url(),
              ...(opts.locateReadBack ? { decider: opts.locateReadBack } : {}),
              // The same verifier the model's answer goes through: nothing
              // here is trusted for being deterministic.
              pin: (value, selector) => captureReadBackAt(page, value, selector),
              ...(opts.signal ? { signal: opts.signal } : {}),
            });
            for (const step of sourced.steps) browser.script.addStep(step);
            const line = describeOutcome(sourced);
            if (line) opts.onProgress?.(line);
            // A turn row for each tier that answered, modelMs 0: a saving is
            // only measurable in timing.jsonl if the model turns that did NOT
            // happen leave a trace beside the ones that did.
            if (sourced.byCode.length) timing.turns.push({ modelMs: 0, toolMs: sourced.ms.code, tools: ['locate(code)'] });
            if (sourced.byDecider.length) timing.turns.push({ modelMs: 0, toolMs: sourced.ms.decider, tools: ['locate(jev)'] });
            if (sourced.remaining.length && Date.now() < deadline) {
              const byModel = await sourceStragglers(provider, page, system, state, sourced.remaining.map((t) => t.value), opts, usage, timing);
              for (const step of byModel) browser.script.addStep(step);
            }
          }
        } catch {
          // a wedged/navigating page must never turn a good report into no report
        }
      }
      browser.script.endInstruction({
        status: report.status,
        summary: report.summary,
        values,
        ...(skill.invoked ? { skill: skill.invoked } : {}),
        ...(skill.invoked && !skill.refused && skill.invokedParams && Object.keys(skill.invokedParams).length ? { skillParams: skill.invokedParams } : {}),
        ...(skill.tier ? { tier: skill.tier } : {}),
      });
    }
    state.recordUsage(provider.model, usage);
    timing.totalMs = Date.now() - startedAt;
    state.recordTiming(provider.model, timing);
    // Any blocked outcome carries its evidence, not just loop-enforced bail-outs:
    // an agent that declares itself stuck is exactly when a caller — or the
    // escalation model — needs to know what already ran. Clean successes stay lean.
    const includeTail = blockedTail || report.status === 'blocked';
    const finalState = includeTail ? await captureFinalState(browser) : undefined;
    if (skill.invoked && !skill.refused && skill.stepsReplayed < skill.stepsTotal && report.status === 'success') {
      skill.repaired = true;
    }
    // One atomic write per instruction persists everything this run observed;
    // observe() only ever touched memory.
    siteModel().flush();
    return {
      report,
      turns,
      usage,
      timing,
      screenshots,
      ...(includeTail ? { transcriptTail: transcript.slice(-12), actions: actions.slice(-40) } : {}),
      ...(finalState ? { finalState } : {}),
      ...(bailReason ? { bailReason } : {}),
      ...(report.status === 'success' && lastGesture && !lastGesture.ok ? { unfinishedGesture: { tool: lastGesture.tool, args: lastGesture.args } } : {}),
      ...(browser.learn ? { skill } : {}),
    };
  };

  const timedOut = (turns: number) =>
    finish(
      {
        status: 'blocked',
        summary: `Instruction timed out after ${Math.round(opts.timeoutMs / 1000)}s (${turns} turns, ${actions.length} tool call(s)). ${resumeHint()}${actions.length ? '' : narrowHint}`,
      },
      turns,
      true,
      'timeout',
    );

  const looping = (turns: number, period: number) =>
    finish(
      {
        status: 'blocked',
        summary: `Agent looped: a cycle of ${period} action(s) repeated ${CYCLE_REPEATS}× with identical page responses, twice, despite being told to change approach — the state was not advancing. ${resumeHint()} Check the page for a dialog or unsaved-changes prompt that needs a different response.`,
      },
      turns,
      true,
      'looping',
    );

  const stalled = (turns: number) =>
    finish(
      {
        status: 'blocked',
        summary: `Agent stalled: ${MAX_UNPRODUCTIVE_TURNS} consecutive turns produced no tool call — it reasoned without driving the browser. ${resumeHint()}${narrowHint} Raise --turn-timeout if the model legitimately needs longer per step.`,
      },
      turns,
      true,
      'stalled',
    );

  /**
   * Run one tool call, bounded by the instruction deadline (and by `stop`).
   * Playwright actions have their own internal timeouts, but some can exceed
   * the remaining budget or wedge entirely (a drag against a blocked renderer),
   * which would otherwise let a single call run past `--timeout` unchecked.
   * On expiry we abandon the call — the cooperative signal stops wait_for's
   * polling, anything still in flight inside Playwright is left to settle
   * unobserved — and hand back an error result so the loop bails out with the
   * same blocked report a timeout produces.
   */
  const runTool = async (name: string, args: Record<string, unknown>): Promise<ToolExecution> => {
    // A stop that already landed must not let the rest of a multi-call turn
    // run: the listener below never fires on an already-aborted signal.
    if (opts.signal?.aborted) return { result: `ERROR: ${name} was not run — the instruction was stopped.`, isError: true };
    const abort = new AbortController();
    const abortTool = () => abort.abort();
    const timer = setTimeout(abortTool, Math.max(0, deadline - Date.now()));
    opts.signal?.addEventListener('abort', abortTool, { once: true });
    try {
      return await Promise.race([
        executeTool(browser, name, args, opts.screenshotDir, abort.signal),
        new Promise<ToolExecution>((resolve) => {
          abort.signal.addEventListener(
            'abort',
            () =>
              resolve({
                result: `ERROR: ${name} was abandoned — it did not finish within the remaining instruction budget. The page may be mid-action; verify state before repeating it.`,
                isError: true,
              }),
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', abortTool);
    }
  };

  /**
   * Tell the shadow, and forget about it. A shadow's exception is ITS failure,
   * never the instruction's — the whole contract of the tier is that a watcher
   * absent, slow or broken are the same thing to the agent.
   */
  const tellShadow = (say: (shadow: LoopShadow) => void): void => {
    if (!opts.shadow) return;
    try {
      say(opts.shadow);
    } catch {
      /* an observer may not break the thing it observes */
    }
  };

  type Ran = Awaited<ReturnType<typeof runTool>>;

  /**
   * §5.3: after an action that may have changed the page, attach where the page
   * now shows the instruction's own literals — the read the model was about to
   * spend a turn on (see evidence.ts). Only when it says something new: the
   * same block twice is noise. SITELOOPER_EVIDENCE=on while it is being measured.
   */
  const evidenceOn = process.env.SITELOOPER_EVIDENCE === 'on';
  const literals = evidenceOn ? evidenceLiterals(instruction) : [];
  let lastEvidence = '';
  const evidenceAfter = async (name: string, execution: Ran): Promise<string> => {
    if (!literals.length || execution.isError || NOT_A_MUTATION.has(name) || !browser.isOpen) return '';
    const page = await browser.getPage().catch(() => null);
    if (!page) return '';
    const block = renderEvidence(await readEvidence(page, literals));
    if (!block || block === lastEvidence) return '';
    lastEvidence = block;
    return block;
  };

  const settleSnapshots = (callId: string, name: string, args: Record<string, unknown>, execution: Ran): void => {
    if (execution.isError) return;
    if (execution.snapshotIncluded) {
      state.markSnapshot(callId);
      state.elideSnapshots(callId);
      supersedeOpening();
    } else if (name === 'snapshot') {
      state.elideSnapshots(callId);
      supersedeOpening();
    } else if (NAVIGATION_TOOLS.has(name) && !(name === 'tabs' && args.switch_to === undefined)) {
      state.elideSnapshots();
      supersedeOpening();
    }
  };

  /**
   * The page, handed over with the instruction instead of asked for.
   *
   * fwrdj9-n1 opened 5 of its 5 instructions with a bare `snapshot` turn, and
   * fwrdj11-n1's trace shows why: history carries over between instructions,
   * but the snapshots in it are stubbed and their @refs are dead, so the first
   * thing the model can usefully do is look. That is a full model round trip
   * (~1.5s) to obtain something that costs ~100ms to take, so it is taken here
   * and appended to the instruction's own message.
   *
   * In the USER message, not as a synthetic snapshot call: fwrdj12-n1 tried
   * the latter and DeepSeek refused every later request in the session with
   * "reasoning_content in the thinking mode must be passed back" — an
   * assistant turn it never wrote, first after the user's, is not something
   * that host accepts. The block is stubbed like any snapshot once a newer
   * view of the page exists (see settleSnapshots).
   * SITELOOPER_OPENING_SNAPSHOT=off for an A/B.
   */
  let opening: { message: { content: string | null }; without: string } | null = null;
  const openingSnapshot = async (): Promise<void> => {
    if (process.env.SITELOOPER_OPENING_SNAPSHOT === 'off' || !browser.isOpen) return;
    try {
      const url = (await browser.getPage()).url();
      if (url === 'about:blank' || url.startsWith('chrome-error://')) return;
    } catch {
      return;
    }
    const message = state.messages[state.messages.length - 1];
    if (message?.role !== 'user' || typeof message.content !== 'string') return;
    const execution = await runTool('snapshot', {});
    if (execution.isError || !execution.result.trim()) return;
    state.elideSnapshots();
    opening = { message, without: message.content };
    message.content = `${message.content}\n\n[page: the page as it is now — these @refs are current, so act on them without calling snapshot first]\n${execution.result}`;
    state.recordTrace({ turn: 0, tool: 'snapshot', args: {}, ok: true, result: execution.result.slice(0, TRACE_RESULT_CHARS) });
  };
  const supersedeOpening = (): void => {
    if (!opening) return;
    opening.message.content = `${opening.without}\n\n[page: superseded by a later view of the page]`;
    opening = null;
  };

  /**
   * The first tier's turn. Whatever it does is written into the conversation,
   * so the model that is asked next is TOLD what happened to the page rather
   * than finding it moved.
   *
   * It is asked WHILE the model is thinking, never before: the first A/B
   * (fwrdj7/8) asked it first and its 78 serial asks cost 18s, most of what
   * its 7 actions saved. Asked beside the model, a deferral costs nothing —
   * the model's answer is already on its way — and an action cancels a model
   * call that had barely begun.
   */
  const askActor = async (ctx: ShadowTurn, turnTiming: InstructionTiming['turns'][number]): Promise<ToolCall | null> => {
    const actor = opts.actor;
    if (!actor) return null;
    const askedAt = Date.now();
    const next = await actor.next(ctx).catch(() => null);
    turnTiming.actorMs = (turnTiming.actorMs ?? 0) + (Date.now() - askedAt);
    timing.actorMs = (timing.actorMs ?? 0) + (Date.now() - askedAt);
    return next?.call.args ? next.call : null;
  };

  const runActorCall = async (ctx: ShadowTurn, call: ToolCall, turnTiming: InstructionTiming['turns'][number]): Promise<void> => {
    const actor = opts.actor!;
    {
      const summary = summarizeArgs(call.args!);
      opts.onProgress?.(`[turn ${ctx.turn}/${opts.maxTurns}] (jev) ${call.name} ${summary}`);
      const toolAt = Date.now();
      const execution = await runTool(call.name, call.args!);
      turnTiming.toolMs += Date.now() - toolAt;
      timing.toolMs += Date.now() - toolAt;
      (turnTiming.actorTools ??= []).push(call.name);
      timing.actorActs = (timing.actorActs ?? 0) + 1;
      actions.push({ tool: call.name, args: summary, ok: !execution.isError });
      noteGesture(call.name, summary, execution);
      state.recordTrace({ turn: ctx.turn, tool: call.name, args: call.args, ok: !execution.isError, result: execution.result.slice(0, TRACE_RESULT_CHARS), by: 'jev' });
      // Told as a USER message, never as an assistant tool call the model did
      // not write: DeepSeek in thinking mode answers a synthetic assistant turn
      // with HTTP 400 ("reasoning_content … must be passed back"), which is
      // what crashed an instruction after every action in fwrdj8 and fwrdj10.
      state.messages.push({
        role: 'user',
        content: `[actor] This action was already taken for you on the live page — do not repeat it; continue from its result.\n${call.name} ${call.rawArgs}\n→ ${execution.result}`,
      });
      accountActions(skill, call.name, call.args!, execution);
      if (!execution.isError && (execution.snapshotIncluded || NAVIGATION_TOOLS.has(call.name))) {
        state.elideSnapshots();
        supersedeOpening();
      }
      transcript.push(`(jev) ${call.name} ${summary} → ${execution.isError ? execution.result.slice(0, 200) : 'ok'}`);
      try {
        actor.observed(call, { ok: !execution.isError, noEffect: !execution.isError && execution.result.includes('[state: no visible change') });
      } catch {
        /* the actor's bookkeeping is not the instruction's problem */
      }
    }
  };

  await openingSnapshot();

  for (let turn = 1; turn <= opts.maxTurns; turn++) {
    if (opts.signal?.aborted) {
      return finish(
        {
          status: 'blocked',
          summary: `Instruction was stopped after ${turn - 1} turns and ${actions.length} tool call(s). ${resumeHint()}`,
        },
        turn - 1,
        true,
        'stopped',
      );
    }
    if (Date.now() > deadline) return timedOut(turn - 1);

    // Near the cap, tell the agent to stop acting and report now — otherwise a
    // completed-but-unreported instruction is misreported as blocked/failed.
    if (!capWarned && turn > opts.maxTurns - 2) {
      capWarned = true;
      state.messages.push({
        role: 'user',
        content: `Only ${opts.maxTurns - turn + 1} turn(s) left before the cap. Call report NOW with your best current assessment of what was done and verified — do not start new actions. Flag anything you could not confirm.`,
      });
    }

    // Watchdog the LLM call itself: a model that reasons without emitting a tool
    // call would otherwise spend the entire instruction budget inside one
    // request, returning zero actions. Never wait past the instruction deadline.
    // Floor keeps a nearly-expired deadline from producing a zero-length budget;
    // the abort then falls through to the deadline check and reports a timeout.
    const turnBudgetMs = Math.max(
      250,
      Math.min(opts.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS, deadline - Date.now()),
    );
    const watchdog = new AbortController();
    const abortTurn = () => watchdog.abort();
    const timer = setTimeout(abortTurn, turnBudgetMs);
    opts.signal?.addEventListener('abort', abortTurn, { once: true });

    let completion;
    const turnTiming: InstructionTiming['turns'][number] = { modelMs: 0, toolMs: 0, tools: [] };
    timing.turns.push(turnTiming);
    const shadowCtx: ShadowTurn = { turn, instruction, browser };
    // Said before the model is asked, so the observation it may take rides
    // inside the model's own thinking time rather than beside it.
    tellShadow((s) => s.onTurnStart(shadowCtx));
    const askedAt = Date.now();
    const modelDone = () => {
      turnTiming.modelMs = Date.now() - askedAt;
      timing.modelMs += turnTiming.modelMs;
      timing.modelCalls += 1;
    };
    try {
      const asked = provider.complete([system, ...state.messages], toolDefs, {
        signal: watchdog.signal,
      });
      // The actor's answer arrives in ~300ms, long before the model's. If it
      // acts, the model call is cancelled and this turn is the actor's: the
      // same turn number is asked again with the action in the conversation.
      asked.catch(() => {});
      const actorCall = await askActor(shadowCtx, turnTiming);
      if (actorCall) {
        watchdog.abort();
        await runActorCall(shadowCtx, actorCall, turnTiming);
        turn--;
        continue;
      }
      completion = await asked;
      modelDone();
    } catch (err) {
      modelDone();
      if (!watchdog.signal.aborted) throw err;
      // Aborted: the assistant message never arrived, so history stays consistent.
      if (opts.signal?.aborted) continue; // stop requested — reported at the top of the next pass
      if (Date.now() > deadline) return timedOut(turn - 1);
      unproductiveTurns++;
      const secs = Math.round(turnBudgetMs / 1000);
      transcript.push(`turn ${turn}: aborted after ${secs}s — still reasoning, no tool call issued`);
      opts.onProgress?.(`[turn ${turn}/${opts.maxTurns}] watchdog: no tool call within ${secs}s, retrying`);
      if (unproductiveTurns >= MAX_UNPRODUCTIVE_TURNS) return stalled(turn);
      state.messages.push({
        role: 'user',
        content: `Your previous turn was aborted after ${secs}s because it produced no tool call. Stop planning and issue exactly ONE tool call now — the smallest observation that moves the instruction forward (snapshot, read, or eval). You will get another turn after you see its result.`,
      });
      continue;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', abortTurn);
    }

    usage.promptTokens += completion.usage.promptTokens;
    usage.completionTokens += completion.usage.completionTokens;
    usage.cachedTokens += completion.usage.cachedTokens;
    state.recordServed(provider.model, completion.served);
    // A turn with neither text nor tool calls is never history: an OpenAI-
    // compatible host 400s on it, and every later request of the session
    // carries it (fwgt3 n1 labels, then the next `do`). Dropped, not filled
    // in — a synthesized assistant turn is a 400 too — and the reminder below
    // asks again.
    if (!isEmptyAssistant(completion.assistantMessage)) state.messages.push(completion.assistantMessage);
    if (completion.text) transcript.push(`assistant: ${completion.text.slice(0, 300)}`);

    if (completion.toolCalls.length === 0) {
      // Model replied with prose only — remind it of the contract once per occurrence.
      unproductiveTurns++;
      if (unproductiveTurns >= MAX_UNPRODUCTIVE_TURNS) return stalled(turn);
      state.messages.push({
        role: 'user',
        content:
          'Reminder: act via tool calls only, and finish by calling the report tool. Continue with the instruction.',
      });
      continue;
    }
    unproductiveTurns = 0;
    tellShadow((s) => s.onTurnDecided(shadowCtx, completion!.toolCalls, turnTiming));

    // Every tool call on an assistant message must get a tool result, or the
    // history is malformed for every later request in the session (both
    // OpenAI-compatible and Anthropic hosts reject it with a 400). A turn that
    // ends early — deadline, stop, an accepted report mid-turn — answers the
    // calls it did not run with a stub. A nudge to the model is likewise held
    // until the turn's results are all in, never pushed between them.
    const calls = completion.toolCalls;
    const stubFrom = (index: number, why: string) => {
      for (const c of calls.slice(index)) state.messages.push({ role: 'tool', tool_call_id: c.id, content: `not executed — ${why}` });
    };
    let nudge: string | null = null;
    for (const [ci, call] of calls.entries()) {
      if (Date.now() > deadline || opts.signal?.aborted) {
        stubFrom(ci, 'the instruction ended first');
        break;
      }

      if (call.name === 'report') {
        const validation = call.args ? validateReport(call.args) : { ok: false as const, error: 'arguments were not valid JSON' };
        if (validation.ok) {
          // The report is schema-valid and will be accepted unless one of the
          // holds has something to ask first — see `holds`.
          const roomToHold = turn < opts.maxTurns && Date.now() < deadline;
          const hold = roomToHold ? await firstHold(holds, holdsAsked, validation.report) : null;
          if (hold) {
            holdsAsked.add(hold.name);
            state.messages.push({ role: 'tool', tool_call_id: call.id, content: hold.message });
            transcript.push(hold.transcript);
            opts.onProgress?.(`[turn ${turn}] ${hold.progress}`);
            continue;
          }
          if (sourcingHold.held && browser.script) {
            const added = browser.script.readsThisInstruction().slice(sourcingHold.held.readsBefore);
            const labelled = added.filter((r) => r.label).map((r) => r.label as string);
            const line = `sourcing retry: ${added.length} read(s) added, ${labelled.length} labelled${labelled.length ? ` (${labelled.join(', ')})` : ''}; asked for ${sourcingHold.held.keys.join(', ')}`;
            browser.script.noteSourcingRetry?.(added.length, labelled);
            transcript.push(line);
            opts.onProgress?.(`[turn ${turn}] ${line}`);
          }
          if (holdsAsked.has('naming') && Object.keys(validation.report.evidence?.values ?? {}).length) browser.script?.noteNamingAnswered?.();
          if (heldValues && sourcingHold.held && browser.script) {
            // A key the hold asked about that the retry READ under that label
            // is answered by the page, not by the held (unsourced) value: the
            // read's text goes under the key unless the retry set it itself.
            // (A labelled read_all is not promoted by promoteLabelledReads —
            // its label names a table — so it is put there here.)
            const added = browser.script.readsThisInstruction().slice(sourcingHold.held.readsBefore);
            const keep = { ...heldValues };
            for (const key of sourcingHold.held.keys) {
              const read = added.find((r) => r.label === key);
              if (!read) continue;
              delete keep[key];
              const text = read.values.join(', ');
              const values = (validation.report.evidence ??= {}).values ?? {};
              if (text && !(key in values)) validation.report.evidence.values = { ...values, [key]: text };
            }
            heldValues = keep;
          }
          if (heldValues && (holdsAsked.has('naming') || holdsAsked.has('sourcing'))) {
            // The retry asked for the report "unchanged except…"; models drop
            // things anyway — sometimes the whole evidence block. Keep every
            // value either report named — see mergeReportValues for the
            // trace that made this necessary. The sourcing hold's retry is
            // merged the same way (fwop19 04-open lost every value).
            (validation.report.evidence ??= {}).values = mergeReportValues(heldValues, validation.report.evidence.values);
          }
          // A repaired payload is accepted, not silently rewritten: the caller
          // and the transcript both see what was changed on the agent's behalf.
          if (validation.coerced?.length) {
            transcript.push(`report coerced: ${validation.coerced.join('; ')}`);
            opts.onProgress?.(`[turn ${turn}] report accepted after repair: ${validation.coerced.join('; ')}`);
          }
          state.messages.push({ role: 'tool', tool_call_id: call.id, content: 'report accepted' });
          stubFrom(ci + 1, 'the report closed the instruction');
          // A non-success report filed after the cap warning answers "Call
          // report NOW", not the instruction: the model ran out of road, it
          // did not check a negative. It is a turn-cap bail — blocked, so it
          // escalates with the headroom a bail earns — keeping the model's
          // summary and evidence for the escalation brief. fwec2 n1 03-create
          // reported "Turn budget ran out before the save" as failure; no
          // fallback tried and n2 spent 48 turns on the adopted step.
          if (capWarned && validation.report.status !== 'success') {
            return finish({ ...validation.report, status: 'blocked' }, turn, true, 'turn-cap');
          }
          return finish(validation.report, turn);
        }
        state.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `report rejected — ${validation.error}. Call report again with a valid payload (status: success|failure|blocked, summary: string).`,
        });
        transcript.push(`report rejected: ${validation.error}`);
        if (reportRetried) {
          stubFrom(ci + 1, 'the instruction ended first');
          return finish(
            {
              status: 'blocked',
              summary: `Agent could not produce a schema-valid report (last error: ${validation.error}).`,
            },
            turn,
            true,
            'invalid-report',
          );
        }
        reportRetried = true;
        continue;
      }

      if (!call.args) {
        state.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `ERROR: arguments for ${call.name} were not valid JSON. Re-issue the call.`,
        });
        transcript.push(`${call.name}: malformed arguments`);
        continue;
      }

      const summary = summarizeArgs(call.args);
      opts.onProgress?.(`[turn ${turn}/${opts.maxTurns}] ${call.name} ${summary}`);
      const toolAt = Date.now();
      const execution = await runTool(call.name, call.args);
      turnTiming.toolMs += Date.now() - toolAt;
      timing.toolMs += Date.now() - toolAt;
      turnTiming.tools.push(call.name);
      if (execution.stepMs) (turnTiming.steps ??= []).push(...execution.stepMs);
      actions.push({ tool: call.name, args: summary, ok: !execution.isError });
      noteGesture(call.name, summary, execution);
      if (sourcingHold.held) {
        // The one way the sourcing hold can make a recording worse: the model
        // re-does work instead of reading. Named in the transcript and the
        // progress log so a sweep can count it.
        const gestures = call.name === 'batch' ? (execution.stepMs ?? []).filter((st) => GESTURE_TOOLS.has(st.tool)).map((st) => st.tool) : GESTURE_TOOLS.has(call.name) ? [call.name] : [];
        for (const g of gestures) {
          browser.script?.noteSourcingGesture?.(g);
          transcript.push(`state-changing gesture after the sourcing hold: ${g}`);
          opts.onProgress?.(`[turn ${turn}] state-changing gesture after the sourcing hold: ${g} ${summary}`);
        }
      }
      state.recordTrace({ turn, tool: call.name, args: call.args, ok: !execution.isError, result: execution.result.slice(0, TRACE_RESULT_CHARS) });
      // After the recorder has filed this step: its locator chain is the exact
      // identity of the element the agent acted on, which is what an observer
      // needs to tell whether that element was ever on its ballot.
      tellShadow((s) => s.onToolExecuted?.(shadowCtx, call, { ok: !execution.isError, index: ci }));
      try {
        opts.actor?.observed(call, { ok: !execution.isError });
      } catch {
        /* as above */
      }
      const evidence = await evidenceAfter(call.name, execution);
      if (evidence) state.recordTrace({ turn, tool: '(evidence)', args: { after: call.name }, ok: true, result: evidence.slice(0, TRACE_RESULT_CHARS) });
      state.messages.push({ role: 'tool', tool_call_id: call.id, content: execution.result + evidence, ...(execution.images?.length ? { images: execution.images } : {}) });
      accountActions(skill, call.name, call.args, execution);

      // The same gesture cycle producing the same page response, over and
      // over, means the agent is not advancing — the r2 halt on grafana was
      // 75 turns of Exit edit ↔ Discard dialog. One nudge to break out, then
      // a blocked report that says so, instead of burning to the cap.
      if (CYCLE_TOOLS.has(call.name)) {
        recentActs.push(`${call.name} ${summary} → ${execution.result.slice(0, 600)}`);
        const period = loopingCycle(recentActs);
        if (period) {
          recentActs.length = 0;
          if (loopNudged) {
            stubFrom(ci + 1, 'the instruction ended first');
            return looping(turn, period);
          }
          loopNudged = true;
          transcript.push(`turn ${turn}: looping — the last ${period} action(s) repeated ${CYCLE_REPEATS}× with identical results`);
          opts.onProgress?.(`[turn ${turn}/${opts.maxTurns}] loop detected (period ${period}); nudging`);
          nudge = `You are looping: your last ${period} action(s) have run ${CYCLE_REPEATS} times in a row and the page responded identically each time, so repeating them will not change anything. Stop. Take a snapshot, work out why the state is not advancing (a dialog that needs a different button, an unsaved change to discard or keep, a control that is not the one you think), and take a DIFFERENT route. If there is no other route, call report with status blocked and say exactly what is stuck.`;
        }
      }

      if (call.name === 'screenshot' && !execution.isError) {
        // Multiline: a native-dialog note may follow the path on its own line.
        const m = execution.result.match(/^screenshot saved: (.+)$/m);
        if (m) screenshots.push(m[1]);
      } else if (call.name === 'batch') {
        // A screenshot taken as a batch step: `3. screenshot {…} → screenshot saved: <path>`.
        for (const m of execution.result.matchAll(/^\d+\. screenshot .*→ screenshot saved: (\S+)/gm)) screenshots.push(m[1]);
      }

      // Keep the re-sent context lean: a snapshot's @refs go stale on navigation
      // and when a newer snapshot arrives, so stub superseded snapshots now
      // rather than re-sending them (up to ~2k tokens each) every remaining turn.
      // A result that carried its own `[page: …]` snapshot counts as the
      // current snapshot: it is what the agent will act from, so it is the one
      // that must survive while the ones it superseded are stubbed.
      settleSnapshots(call.id, call.name, call.args, execution);
      transcript.push(
        `${call.name} ${summary} → ${execution.isError ? execution.result.slice(0, 200) : 'ok'}`,
      );
    }
    if (nudge) state.messages.push({ role: 'user', content: nudge });
  }

  return finish(
    {
      status: 'blocked',
      summary: `Turn cap (${opts.maxTurns}) reached without a final report. ${resumeHint()} Do not blindly repeat state-changing actions like submit/delete/move.`,
    },
    opts.maxTurns,
    true,
    'turn-cap',
  );
}

/**
 * Run an instruction on the routine model and, if it comes back blocked, retry
 * it once on a stronger fallback model.
 *
 * Why blocked only: `failure` is a verified negative answer (the assertion was
 * checked and did not hold) — retrying it on a better model just buys the same
 * answer twice. `blocked` means the agent could not determine the answer, which
 * is precisely the failure mode a stronger model can rescue, and the one this
 * project measured on a real app (a cheap model abandoned a supplier-autocomplete
 * step after 29 turns that a stronger model then solved). A `failure` filed in
 * answer to the cap warning is not a checked answer: runInstruction turns it
 * into a turn-cap bail, so it escalates here (fwec2 n1 03-create).
 *
 * The retry shares the SAME live browser and message history, so the fallback
 * inherits everything the first attempt discovered — and, critically, is told it
 * is resuming, so it verifies state before repeating anything destructive.
 */
export async function runEscalatingInstruction(
  primary: Provider,
  fallback: Provider | null,
  browser: BrowserSession,
  state: SessionState,
  instruction: string,
  opts: LoopOptions,
): Promise<InstructionResult> {
  // Where this instruction's history starts, so the failed attempt can be
  // compacted on handoff without touching earlier instructions (which are
  // already cached and were not the thing that went wrong).
  const historyMark = state.messages.length;
  const first = await runInstruction(primary, browser, state, instruction, opts);

  const blocked = first.report.status === 'blocked';
  // An operator `stop` also yields a blocked report — escalating there would
  // restart work the operator just killed, which is the opposite of the ask.
  const operatorStopped = Boolean(opts.signal?.aborted);
  if (!fallback || !blocked || operatorStopped || fallback.model === primary.model) return first;

  // A first attempt that exhausted its turn/time budget is positive evidence
  // that the instruction needs MORE of that budget — handing the fallback the
  // same allowance mostly buys a second bail-out at the same wall. Measured on
  // a real app: both tiers hit a 30-turn cap on one step that the routine model
  // then completed in 19 turns once the cap was raised.
  const headroom = (n: number) => Math.ceil(n * ESCALATION_BUDGET_MULTIPLIER);
  const escalatedOpts: LoopOptions = {
    ...opts,
    // The recording must carry the caller's wording, not the resume scaffold —
    // see LoopOptions.recordAs. Flow building then merges the continuation
    // into the failed first attempt's group.
    recordAs: { text: opts.recordAs?.text ?? instruction, resume: true },
    ...(first.bailReason === 'turn-cap' ? { maxTurns: headroom(opts.maxTurns) } : {}),
    ...(first.bailReason === 'timeout' ? { timeoutMs: headroom(opts.timeoutMs) } : {}),
  };

  // Hand the stronger model a clean brief, not a transcript of the failure.
  // escalationPrompt() below already carries what mattered — the blocked
  // report, the ordered actions log, where the browser was left — so leaving
  // the raw tool results in place would re-send that same information every
  // turn at the escalation tier's (much higher) cache rate.
  const compacted = state.compactToolResults(historyMark);

  opts.onProgress?.(
    `[escalating] ${primary.model} reported blocked (${first.bailReason ?? 'agent gave up'}) — ` +
      `retrying on ${fallback.model}${escalatedOpts.maxTurns !== opts.maxTurns ? ` with ${escalatedOpts.maxTurns} turns` : ''}` +
      `${compacted.elided ? `, compacted ${compacted.elided} tool result(s) (~${Math.round(compacted.charsSaved / 4000)}k tokens/turn saved)` : ''}`,
  );

  const second = await runInstruction(
    fallback,
    browser,
    state,
    escalationPrompt(instruction, first),
    escalatedOpts,
  );

  return {
    ...second,
    turns: first.turns + second.turns,
    usage: {
      promptTokens: first.usage.promptTokens + second.usage.promptTokens,
      completionTokens: first.usage.completionTokens + second.usage.completionTokens,
      cachedTokens: first.usage.cachedTokens + second.usage.cachedTokens,
    },
    timing: {
      totalMs: first.timing.totalMs + second.timing.totalMs,
      modelMs: first.timing.modelMs + second.timing.modelMs,
      toolMs: first.timing.toolMs + second.timing.toolMs,
      modelCalls: first.timing.modelCalls + second.timing.modelCalls,
      turns: [...first.timing.turns, ...second.timing.turns],
      ...(first.timing.actorMs || second.timing.actorMs ? { actorMs: (first.timing.actorMs ?? 0) + (second.timing.actorMs ?? 0) } : {}),
      ...(first.timing.actorActs || second.timing.actorActs ? { actorActs: (first.timing.actorActs ?? 0) + (second.timing.actorActs ?? 0) } : {}),
    },
    screenshots: [...first.screenshots, ...second.screenshots],
    escalation: {
      from: primary.model,
      to: fallback.model,
      reason: first.report.summary,
      firstAttempt: { status: first.report.status, turns: first.turns, usage: first.usage },
      rescued: second.report.status === 'success',
      compactedToolResults: compacted.elided,
    },
  };
}

function escalationPrompt(instruction: string, first: InstructionResult): string {
  const ran = first.actions?.length
    ? `\nActions the previous attempt ran (most recent last):\n${first.actions
        .map((a) => `  ${a.ok ? 'ok' : 'FAILED'} ${a.tool} ${a.args}`)
        .join('\n')}`
    : '';
  const where = first.finalState ? `\nThe browser was left at: ${first.finalState.url}` : '';
  return (
    `You are RESUMING an instruction that a previous, weaker model could not complete. ` +
    `It gave up with this report:\n"${first.report.summary}"${ran}${where}\n\n` +
    `The browser session is that same attempt — nothing has been reset — but the previous attempt's ` +
    `raw tool output has been elided from the conversation above to keep it small, so treat the ` +
    `summary and action list here as the record of it and re-observe the page for anything you need. ` +
    `Before you repeat ANY state-changing action (submit, create, delete, move), observe the current ` +
    `page and confirm whether it already took effect; the previous attempt may have partially ` +
    `succeeded. Do not assume its conclusions were correct — it may have been stuck because it ` +
    `misread the page or probed the wrong values, so re-examine the evidence yourself and look for an ` +
    `approach it did not try.\n\nThe original instruction to complete is:\n${instruction}`
  );
}

/**
 * Verified model fallback for read-back synthesis: ask the model where each
 * un-pinnable reported value lives on the current page, then trust the answer
 * only after it resolves to exactly that value. Ephemeral — does not touch the
 * running history — and bounded to one completion.
 *
 * Unchanged, and still the last word — but now the last TIER: `sourceReadBacks`
 * runs first and hands on only the values it could neither source nor prove
 * unsourceable, so this is asked about less and, when nothing is left, not at
 * all. Its prompt, its tool and its verification are what they were.
 */
async function sourceStragglers(
  provider: Provider,
  page: import('playwright-core').Page,
  system: ChatMessage,
  state: SessionState,
  values: string[],
  opts: LoopOptions,
  usage: { promptTokens: number; completionTokens: number; cachedTokens: number },
  timing: InstructionTiming,
): Promise<import('../daemon/recorder.js').RecordedStep[]> {
  const ask: ChatMessage = {
    role: 'user',
    content:
      `Before this instruction is filed, point to where these value(s) you just reported are shown on the CURRENT page, so they can be re-read on a later run. ` +
      `Call locate with, for each value, a CSS selector (or @ref from your latest snapshot) that resolves to EXACTLY the one element displaying it — or an empty selector if the value is computed and not shown verbatim on the page. Values:\n` +
      values.map((v) => `- ${JSON.stringify(v)}`).join('\n'),
  };
  let completion;
  const askedAt = Date.now();
  const modelDone = () => {
    const ms = Date.now() - askedAt;
    timing.modelMs += ms;
    timing.modelCalls += 1;
    timing.turns.push({ modelMs: ms, toolMs: 0, tools: ['locate'] });
  };
  try {
    // One structured answer from a page the model has already seen: low
    // reasoning effort, or a reasoning model spends a 16k budget on it.
    completion = await provider.complete([system, ...state.messages, ask], [LOCATE_TOOL], { signal: opts.signal, effort: 'low' });
    modelDone();
  } catch {
    modelDone();
    return [];
  }
  usage.promptTokens += completion.usage.promptTokens;
  usage.completionTokens += completion.usage.completionTokens;
  usage.cachedTokens += completion.usage.cachedTokens;
  state.recordServed(provider.model, completion.served);
  const call = completion.toolCalls.find((c) => c.name === 'locate');
  const sources = call?.args && Array.isArray((call.args as { sources?: unknown }).sources) ? ((call.args as { sources: unknown[] }).sources) : [];
  const out: import('../daemon/recorder.js').RecordedStep[] = [];
  for (const entry of sources) {
    const e = entry as { value?: unknown; selector?: unknown };
    if (typeof e.value !== 'string' || typeof e.selector !== 'string' || !e.selector.trim()) continue;
    const step = await captureReadBackAt(page, e.value, e.selector).catch(() => null);
    if (step) out.push(step);
  }
  if (out.length) opts.onProgress?.(`[read-back] model sourced ${out.length}/${values.length} un-pinnable value(s)`);
  return out;
}

const LOCATE_TOOL: ToolDef = {
  name: 'locate',
  description: 'Point to where each listed value is shown on the current page, so it can be re-read later.',
  parameters: {
    type: 'object',
    required: ['sources'],
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'object',
          required: ['value', 'selector'],
          properties: {
            value: { type: 'string', description: 'The reported value, exactly as given.' },
            selector: { type: 'string', description: 'CSS selector or @ref resolving to exactly the element that displays this value; "" if it is computed / not shown.' },
          },
        },
      },
    },
  },
};

/** What the stored-skill listing contributes to an instruction's first message. */
/** Cap on the recorded instruction-start page text (identity evidence, not a snapshot). */
const START_TEXT_BUDGET = 8000;

/** The [site] line for the current page, or '' — never launches a browser, never throws. */
async function offerSite(browser: BrowserSession): Promise<string> {
  if (!browser.isOpen) return '';
  try {
    const page = await browser.getPage();
    const url = page.url();
    const model = siteModel();
    const sig = await captureSignature(page);
    if (sig) model.observe(url, sig);
    return model.render(url);
  } catch {
    return '';
  }
}

async function offerSkills(
  browser: BrowserSession,
): Promise<{ ids: string[]; text: string; context: { url?: string; fingerprint?: number[]; startText?: string; startDialect?: 2; startTextComplete?: boolean } }> {
  const none = { ids: [], text: '', context: {} };
  if (!browser.learn || !browser.isOpen) return none;
  try {
    const page = await browser.getPage();
    const url = page.url();
    const origin = originOf(url);
    if (!origin) return none;
    const candidates = candidatesFor(browser.learn.list(origin), url);
    const fingerprint = (await fingerprintPage(page)) ?? undefined;
    // Recognized hard widgets on this page: one line telling the model that
    // plain fill/type/select on them is recipe-backed and self-verifying, so
    // it does not improvise long keyboard workarounds.
    const components = renderComponents(await componentsOnPage(page));
    // Which RECORD this page showed when the instruction started, capped: the
    // evidence compile needs to give a skill an identity precondition (see
    // RecordedInstruction.startText).
    const sig = await captureSignature(page);
    const joined = sig ? sig.lines.join('\n') : '';
    const startText = sig ? joined.slice(0, START_TEXT_BUDGET) : undefined;
    // Whether this is the WHOLE page: not cut at the budget, and taken by a
    // look that covered it. Compile reads "not in startText" as "not on the
    // page before the work", which only a complete startText can say.
    const startTextComplete = Boolean(sig) && joined.length <= START_TEXT_BUDGET && (!sig!.observation || coverageComplete(sig!.observation.coverage));
    const text = [renderCandidates(candidates), components].filter(Boolean).join('\n');
    return {
      ids: candidates.map((s) => s.id),
      text,
      context: {
        url,
        ...(fingerprint ? { fingerprint } : {}),
        ...(startText ? { startText, startDialect: CURRENT_DIALECT, ...(startTextComplete ? {} : { startTextComplete: false }) } : {}),
      },
    };
  } catch {
    return none;
  }
}

/** Count browser actions per tool call, and fold a replay's outcome into the record. */
function accountActions(skill: SkillRecord, name: string, args: Record<string, unknown>, execution: ToolExecution): void {
  if (name === 'snapshot' || name === 'report') return;
  if (name === 'run_skill') {
    const r: ReplayResult | undefined = execution.replay;
    if (!r) return;
    // First replay wins the record; a second run_skill in one instruction is
    // unusual and its steps still count as deterministic actions.
    if (!skill.invoked) {
      skill.tier = 'B';
      skill.invoked = r.skill;
      const raw = args.params && typeof args.params === 'object' && !Array.isArray(args.params) ? (args.params as Record<string, unknown>) : {};
      skill.invokedParams = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? '')]));
      skill.stepsReplayed = r.stepsRun;
      skill.stepsTotal = r.stepsTotal;
      skill.refused = Boolean(r.refused);
      skill.fallthroughs = r.fallthroughs;
      skill.similarity = r.similarity;
      if (r.misses.length) skill.misses = r.misses;
      if (r.unobserved.length) skill.unobserved = r.unobserved;
      if (r.reason) skill.failReason = r.reason;
      if (r.warnings.length) skill.warnings = r.warnings.map((w) => `${r.skill}: ${w}`);
      if (r.failedAt !== undefined) skill.failedAt = r.failedAt;
      skill.replayUrl = r.url;
    }
    skill.deterministicActions += r.stepsRun;
    skill.totalActions += r.stepsRun;
    return;
  }
  if (name === 'batch' && Array.isArray(args.steps)) {
    // Only the steps that ran count; the result lists one line per step that did.
    const ran = (execution.result.match(/^\d+\. /gm) ?? []).length;
    if (execution.isError && !ran) return; // rejected at validation — nothing ran
    skill.totalActions += ran || args.steps.length;
    return;
  }
  skill.totalActions += 1;
}

function summarizeArgs(args: Record<string, unknown>): string {
  // A batch's raw args are a wall of nested JSON; the step tools are what the
  // progress line and the actions log actually need to convey.
  if (Array.isArray(args.steps)) {
    const tools = args.steps.map((s) => String((s as { tool?: unknown })?.tool ?? '?'));
    return `[${tools.length} steps: ${tools.join(', ')}]`;
  }
  const s = JSON.stringify(args);
  return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

/**
 * Best-effort "where did this leave the browser" for bail-out results. Bounded
 * and never throws: this runs on the failure path, where a wedged page must not
 * turn a blocked report into no report at all.
 */
async function captureFinalState(
  browser: BrowserSession,
): Promise<{ url: string; title?: string } | undefined> {
  try {
    if (!browser.isOpen) return undefined; // never launch a browser just to report on one
    const page = await browser.getPage();
    const url = page.url();
    const title = await Promise.race([
      page.title().catch(() => undefined),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 2_000)),
    ]);
    return title ? { url, title } : { url };
  } catch {
    return undefined;
  }
}

/**
 * Where the browser is right now, as a line appended to every instruction.
 *
 * Without it the model starts blind and, being told to act rather than
 * deliberate, may guess. Bench run c0822bp (2026-08-22) began its first
 * instruction with `goto http://localhost:3000` although the caller had just
 * opened the app on another port: it landed on a browser error page,
 * port-scanned from inside it, reported the app unreachable, and — because
 * history persists across instructions — repeated that verdict 118 times.
 * Naming the page costs ~30 tokens per instruction and removes the guess.
 *
 * Never launches a browser: a session with no page yet gets no line, and the
 * rules then only allow a URL the instruction itself provides. Never throws —
 * a wedged page must not stop an instruction from starting.
 */
async function describeLocation(browser: BrowserSession): Promise<string | null> {
  if (!browser.isOpen) return null;
  try {
    const page = await browser.getPage();
    const url = page.url();
    const title = await Promise.race([
      page.title().catch(() => ''),
      new Promise<string>((r) => setTimeout(() => r(''), 2_000)),
    ]);
    let line = `[browser] You are currently on ${url}${title ? ` — "${title}"` : ''}.`;
    if (url.startsWith('chrome-error://')) {
      line +=
        ' That is a browser error page: the last navigation failed, so the app is NOT at that address. Use back to return to the page the caller set up, or goto a URL the instruction gives — do not guess one.';
    } else if (url === 'about:blank') {
      line += ' Nothing has been loaded yet: only navigate to a URL the instruction or briefing gives.';
    } else {
      line += ' Start from this page; the caller put the browser here on purpose.';
    }
    return line;
  } catch {
    return null;
  }
}
