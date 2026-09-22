import type { LocatorCandidate, RecordedEntry } from '../daemon/recorder.js';
import type { LoopShadow, ShadowTurn } from './loop.js';
import type { ToolCall } from './llm.js';
import { agreement, choice, minConfidence, type ChoiceAnswer, type Entry, type SystemOne } from './system-one.js';
import { gateFor, type DecideCtx, type DecisionSink, type JevSite, type Reading } from './decide.js';
import {
  buildCandidates,
  observeControls,
  type ActorCandidate,
  type ActorObservation,
  type ActorOperation,
  type ControlIdentity,
  type TaskValue,
} from './actor.js';

/**
 * Step 5 of notes/PLAN-jev.md, half two: the System One ACTOR, as a shadow.
 *
 * §4c's bet is that most routine turns of first-contact authoring are choices
 * among enumerable actions. The number that settles it is `q` — the share of
 * MODEL TIME a decider could take — and q is unknown. This file is the
 * instrument that measures it at zero risk: beside every real turn of a real
 * instruction, it builds the ballot (actor.ts), asks Jev which action to take,
 * waits to see what the model actually did, and logs the two together.
 *
 * It decides nothing. It cannot: the only thing it is given is a `LoopShadow`,
 * whose every method returns void.
 *
 * TWO NUMBERS, NOT ONE. They fail independently and must be reported apart:
 *
 *  - COVERAGE — was the action the model took on the ballot at all? A decider
 *    cannot pick what was never offered, so a candidate generator that misses
 *    is a ceiling on everything above it, whatever the agreement rate says.
 *  - AGREEMENT — given that it was offered, did Jev pick it?
 *
 * And a caveat that belongs on every reading of both: agreement with the model
 * is NOT correctness. The model's action is a proxy label — it is frequently
 * the wrong action (that is why recordings need recovery at all), and a
 * disagreement may be Jev being right. Only a human reading the
 * disagreements can tell, which is why the report prints them.
 */

/** Names the gate (decide.ts GATES) and the rows in system-one.jsonl. */
export const ACTOR_TURN_SITE = 'actor.turn';

/** Actions this instruction has already taken, as state. Not the transcript: see below. */
const MAX_HISTORY = 8;
/** Failed actions kept, which are worth more per line than successful ones. */
const MAX_FAILURES = 3;

// --- the state ------------------------------------------------------------------

export interface TurnAction {
  tool: string;
  /** One line: what it did, NOT the tool result. */
  summary: string;
  ok: boolean;
}

export interface TurnInput {
  instruction: string;
  observation: ActorObservation;
  candidates: ActorCandidate[];
  values: TaskValue[];
  /** What this instruction has done so far, oldest first. */
  history: readonly TurnAction[];
}

/**
 * Fresh, bounded state per decision — never the growing transcript.
 *
 * Two measured reasons, not one aesthetic one. Jev's accuracy falls with large
 * irrelevant state (step 0's probe: elements scored in isolation ranked
 * `Confirm` above `Save record`; the same elements in one relevant state were
 * picked at 0.98), and the transcript is mostly irrelevant by construction —
 * it is a log of pages that have since changed. So what goes in is what the
 * decision is ABOUT: the task, the values it stated, the page in front of us,
 * and what has already been done to it as one line each.
 *
 * Tool RESULTS are excluded on purpose, and that is the expensive-looking
 * choice: a result is where the last observation lives, and the model has it.
 * But a result is also the single largest thing in a turn (a snapshot is
 * thousands of tokens), it describes a page that the `page` key already
 * describes better, and putting it back would rebuild the very prompt this
 * tier exists to replace.
 */
export function buildTurnState(input: TurnInput): Entry {
  const obs = input.observation;
  const failures = input.history.filter((a) => !a.ok).slice(-MAX_FAILURES);
  const recent = input.history.slice(-MAX_HISTORY);
  return {
    task: input.instruction,
    values: Object.fromEntries(input.values.map((v) => [v.ref, v.text])),
    page: {
      url: obs.url,
      ...(obs.title ? { title: obs.title } : {}),
      ...(obs.alerts?.length ? { messagesOnScreen: obs.alerts } : {}),
      controls: obs.controls.length,
      // An incomplete look must never read as an empty page: what is not
      // listed was not shown to be absent.
      ...(obs.truncated ? { note: 'more of this page exists than is listed here' } : {}),
    },
    doneSoFar: recent.length ? recent.map((a, i) => `${i + 1}. ${a.tool} ${a.summary}${a.ok ? '' : ' — FAILED'}`) : 'nothing yet',
    ...(failures.length ? { failedAttempts: failures.map((a) => `${a.tool} ${a.summary}`) } : {}),
    actions: Object.fromEntries(input.candidates.map((c) => [c.id, c.description])),
  };
}

// --- the questions ---------------------------------------------------------------

/**
 * "What is in front of you", never "what would happen".
 *
 * Step 2 measured this as the difference between a usable site and a coin
 * flip: a counterfactual ("would a later run show this line?") scored 19/40,
 * and the same judgement restated as composition over what is on the page
 * scored 36/40. So the ask names the page, the task and the list, and asks
 * which listed action is the next one — not what would happen if it were
 * taken, and not whether the task would then be complete.
 *
 * The instruction that matters is IN THE QUESTION, not only in state: step 2
 * measured a note in state doing nothing and the same words in the question
 * cutting corpus noise from 23% to 19%.
 */
const ASK =
  'A browser is being driven to carry out `task`. `page` describes the page that is on screen right now, and `actions` lists every action that can be taken on it, with the control each one acts on and where that control sits. `doneSoFar` is what has already been done for this task. Which single action in `actions` is the right next one to take now? Judge only by what `page` and `actions` say is there — where two controls have the same name, the dialog or row each sits in is what tells them apart.';

/**
 * The same question with the options in the opposite order. Position bias is
 * the cheap failure at this price and agreement is the cheap defence — both
 * orders ride in ONE request (questions are free; the probe measured 1 → 286ms
 * and 40 → 276ms), and a pick that changes with the order of the list is not a
 * reading of the page, so it defers.
 */
const ASK_REVERSED =
  'The list `actions` contains the actions available on the page described by `page`. The job to be done is `task`, and `doneSoFar` records what has already been done towards it. Identify the one action in the list that carries the job forward from where it now stands. If none of them does, say so with the action that says none of these.';

/**
 * The turn's TYPE, asked beside the pick.
 *
 * Two reasons it is a separate question rather than a stage. Extra questions
 * on one state are free, so this costs nothing; and it is what makes the
 * measurement per-type — "which turns are takeable" is the actual deliverable
 * of this step, and reading the type off Jev's own pick would only tell us
 * which types it already agrees about.
 *
 * It is a CROSS-CHECK, not a gate. Dependent decisions must be composed in
 * code (the questions are answered independently of one another), so where
 * the type and the pick disagree the row is flagged and the disagreement is
 * logged; it does not veto. A veto here would be a second threshold nobody
 * has calibrated, on a question whose answer the pick already implies.
 */
const ASK_KIND = 'What does this task need next on this page: an action on a control, a value typed into a field, a value read as evidence, waiting for the page, finishing, or is it stuck?';

const KINDS = {
  act: 'press a control — a button, link, tab or menu item',
  fill: 'put one of the task\'s values into a field, or choose an option',
  read: 'read a value off the page as evidence',
  wait: 'wait: the page is still loading or updating',
  finish: 'the task is done on this page and only the report is left',
  stuck: 'the page does not offer what this task needs',
} as const;

export type TurnKind = keyof typeof KINDS;

/** Which turn kind an operation belongs to — the code half of the cross-check. */
export function kindOfOperation(op: ActorOperation): TurnKind {
  switch (op) {
    case 'click':
    case 'goto':
    case 'back':
      return 'act';
    case 'fill':
    case 'type':
    case 'select':
    case 'check':
    case 'uncheck':
      return 'fill';
    case 'read':
      return 'read';
    case 'observe':
    case 'wait':
      return 'wait';
    case 'done':
      return 'finish';
    default:
      return 'stuck';
  }
}

function questionsFor(candidates: readonly ActorCandidate[]) {
  const options: Record<string, Entry> = {};
  for (const c of candidates) options[c.id] = c.description;
  const reversed: Record<string, Entry> = {};
  for (const key of Object.keys(options).reverse()) reversed[key] = options[key];
  return {
    pick: choice(ASK, options),
    pickReversed: choice(ASK_REVERSED, reversed),
    kind: choice(ASK_KIND, { ...KINDS }),
  };
}

// --- the site --------------------------------------------------------------------

export interface TurnReadingDetail {
  pick: string;
  pickConfidence: number;
  reversed: string;
  reversedConfidence: number;
  kind: TurnKind;
  kindConfidence: number;
  /** The picked action's own kind disagrees with the kind question. */
  kindConflict?: boolean;
  operation?: ActorOperation;
}

/**
 * `JevSite` for 'actor.turn'. The value is a CANDIDATE ID: code holds the
 * element and the exact string, and resolves both itself. Null — a deferral —
 * when the two option orders disagree, or when the pick is an abstention
 * (`none`, `need-info`, `escalate`), all of which mean "the model path runs",
 * which is exactly what happens anyway while this is a shadow.
 */
export const actorTurnSite: JevSite<TurnInput, ActorCandidate> = {
  site: ACTOR_TURN_SITE,

  async run(client: SystemOne, input: TurnInput, ctx: DecideCtx): Promise<Reading<ActorCandidate> | null> {
    const candidates = input.candidates;
    // Fewer than two real options is not a decision. Nothing to ask, nothing
    // logged — a row here would be a free agreement that means nothing.
    if (candidates.length < 3) return null;
    const res = await client.ask(buildTurnState(input), questionsFor(candidates), { signal: ctx.signal });
    const a = res.answers as { pick: ChoiceAnswer; pickReversed: ChoiceAnswer; kind: ChoiceAnswer<TurnKind> };
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const agreed = agreement([a.pick.choice, a.pickReversed.choice]);
    const picked = agreed ? byId.get(agreed) : undefined;
    const detail: TurnReadingDetail = {
      pick: a.pick.choice,
      pickConfidence: a.pick.confidence,
      reversed: a.pickReversed.choice,
      reversedConfidence: a.pickReversed.confidence,
      kind: a.kind.choice,
      kindConfidence: a.kind.confidence,
      ...(picked ? { operation: picked.operation } : {}),
    };
    const base = { chosen: a.pick.choice, options: candidates.length, detail: detail as unknown as Reading<ActorCandidate>['detail'] };
    if (!agreed) {
      return { ...base, value: null, confidence: 0, why: `the two option orders disagreed (${a.pick.choice} vs ${a.pickReversed.choice})` };
    }
    if (!picked) return { ...base, value: null, confidence: 0, why: `chose ${agreed}, which is not an action that was offered` };
    if (picked.operation === 'none' || picked.operation === 'need-info' || picked.operation === 'escalate') {
      return { ...base, chosen: agreed, value: null, confidence: a.pick.confidence, why: picked.operation };
    }
    if (kindOfOperation(picked.operation) !== a.kind.choice) detail.kindConflict = true;
    return {
      ...base,
      chosen: agreed,
      value: picked,
      // The weakest answer used, never their product: one wrong argument
      // spoils the call. The kind is a cross-check and is NOT in the min — it
      // is a different question with its own distribution, and folding it in
      // would repeat step 1's mistake of mixing thresholds.
      confidence: minConfidence([a.pick.confidence, a.pickReversed.confidence]),
    };
  },
};

// --- matching the model's action to a candidate -----------------------------------

/**
 * How a turn compares to the ballot. Every turn gets exactly one of these, and
 * `unmatchable` is never counted as either an agreement or a miss — a turn we
 * could not read is missing data, and quietly filing it as one or the other is
 * how a measurement of this kind flatters itself.
 */
export type TurnCoverage =
  /** The model's action is on the ballot, unambiguously. */
  | 'matched'
  /** Several candidates fit equally: the ballot offered it, but not distinguishably. */
  | 'ambiguous'
  /** The ballot did not carry it — the element, the operation, or both. */
  | 'not-offered'
  /** We could not tell what the model acted on. Not evidence of anything. */
  | 'unmatchable'
  /** A tool this generator does not model at all (eval, screenshot, run_skill …). */
  | 'non-candidate-tool';

/** Tools that map onto an operation the generator enumerates. */
const TOOL_OPERATION: Record<string, ActorOperation> = {
  click: 'click',
  dblclick: 'click',
  modifier_click: 'click',
  right_click: 'click',
  hover: 'click',
  fill: 'fill',
  type: 'type',
  select: 'select',
  check: 'check',
  read: 'read',
  read_all: 'read',
  snapshot: 'observe',
  wait_for: 'wait',
  goto: 'goto',
  back: 'back',
  report: 'done',
};

/**
 * Tools that are a browser action an actor would have to take, but that this
 * generator does not enumerate (see actor.ts's list of what it does not
 * cover). A turn spent on one of these is a COVERAGE MISS, not a tool outside
 * the experiment — counting it as the latter would hide the ceiling.
 */
const UNGENERATED_TOOLS = new Set(['press', 'drag', 'scroll_into_view', 'upload', 'download', 'dialog_expect', 'tabs']);

/**
 * Operations whose target is not checked, because the ballot does not carry
 * one to check: "read a value", "wait", "observe", "finish". For these,
 * matching answers the weaker question "was this the right KIND of move now?".
 * Rows say so (`targetChecked: false`) and the report keeps them apart from
 * the rows where an element was actually identified — a mixed figure would
 * read as stronger evidence than it is.
 */
const TARGETLESS: ReadonlySet<ActorOperation> = new Set(['read', 'observe', 'wait', 'done', 'back']);

// A required field's label text ends in its marker ("Part name *") while its
// accessible name does not; they are the same control (see refs.ts resolveTarget).
const norm = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim().replace(/\s*\*$/, '').toLowerCase();

/**
 * Does this locator chain — the recorder's own description of the element the
 * agent acted on, derived from the live element before the action ran — name
 * this control?
 *
 * The chain is the best identity available and it is free: the recorder builds
 * it for every recordable step anyway, from the real DOM node, in the same
 * vocabulary the observation uses (testid, role+name, label, placeholder, id,
 * text). Comparing there rather than resolving both sides to a DOM node keeps
 * the whole comparison off the page — no evaluate, no race with the action
 * that is running, nothing that could perturb what is being measured.
 *
 * Null means UNDECIDABLE: the chain carried only shapes this cannot read (a
 * css path, a point, a scoped container), so the turn is unmatchable rather
 * than a miss.
 */
export function chainMatches(identity: ControlIdentity, chain: readonly LocatorCandidate[]): boolean | null {
  let decidable = false;
  for (const c of chain) {
    switch (c.kind) {
      case 'testid':
        decidable = true;
        if (identity.testid && identity.testid === c.value) return true;
        break;
      case 'role':
        decidable = true;
        if (identity.role === c.role && norm(identity.name) === norm(c.name)) return true;
        break;
      case 'label':
        decidable = true;
        if (norm(identity.label ?? identity.name) === norm(c.label)) return true;
        break;
      case 'placeholder':
        decidable = true;
        if (norm(identity.placeholder) === norm(c.placeholder)) return true;
        break;
      case 'id': {
        decidable = true;
        const m = /^#(.+)$|^\[id="?(.*?)"?\]$/.exec(c.selector);
        const id = m ? (m[1] ?? m[2]) : '';
        if (id && identity.elementId === id) return true;
        break;
      }
      case 'text':
        decidable = true;
        if (norm(identity.name) === norm(c.text)) return true;
        break;
      default:
        // css / scoped / point: they name a place, not a thing this side knows.
        break;
    }
  }
  return decidable ? false : null;
}

/** A raw target the agent wrote, when no recorded chain exists: only the shapes that are identities. */
export function rawTargetMatches(identity: ControlIdentity, raw: string): boolean | null {
  const t = raw.trim();
  const byTestid = /^\[data-testid=["']?(.+?)["']?\]$/.exec(t);
  if (byTestid) return identity.testid === byTestid[1];
  if (/^#[\w-]+$/.test(t)) return identity.elementId === t.slice(1);
  return null;
}

export interface ModelAction {
  tool: string;
  operation: ActorOperation | null;
  /** The recorder's chain for the element, when the step was recordable. */
  chain?: LocatorCandidate[];
  /** What the agent wrote as the target (an @ref or a selector). */
  raw?: string;
  /** Steps in the batch this action was the first of. */
  batchSize?: number;
}

export interface TurnMatch {
  coverage: TurnCoverage;
  /** The candidates the model's action corresponds to (one, unless ambiguous). */
  ids: string[];
  /** False when only the operation was compared — see TARGETLESS. */
  targetChecked: boolean;
  why?: string;
}

/**
 * Which candidate, if any, is the action the model took.
 *
 * The hard half of the whole instrument, and the one that can lie in both
 * directions: a miss recorded as a match inflates coverage, and a match
 * recorded as a miss makes the generator look worse than it is. So every
 * outcome here is one of five, undecidable is its own answer, and the rules
 * are the same in both directions.
 */
export function matchModelAction(candidates: readonly ActorCandidate[], action: ModelAction): TurnMatch {
  const op = action.operation;
  if (!op) {
    return UNGENERATED_TOOLS.has(action.tool)
      ? { coverage: 'not-offered', ids: [], targetChecked: false, why: `${action.tool} is a browser action this generator does not enumerate` }
      : { coverage: 'non-candidate-tool', ids: [], targetChecked: false, why: `${action.tool} is outside the candidate model` };
  }
  // `check` is two operations, told apart by the arg; either is a fair match
  // for the toggle the ballot offered, because the ballot only ever offers the
  // move that would change the control.
  const wanted = op === 'check' ? new Set<ActorOperation>(['check', 'uncheck']) : new Set<ActorOperation>([op]);
  const sameOp = candidates.filter((c) => wanted.has(c.operation));
  if (!sameOp.length) return { coverage: 'not-offered', ids: [], targetChecked: false, why: `no ${op} candidate was offered` };
  // A navigation's identity is its ADDRESS, not an element. Offered only for a
  // url the instruction states, so a goto to anywhere else — a url the model
  // worked out, or one it remembered — is a genuine coverage miss.
  if (op === 'goto') {
    const want = normalizeUrl(action.raw ?? '');
    const hits = sameOp.filter((c) => normalizeUrl(c.url ?? '') === want);
    return hits.length
      ? { coverage: 'matched', ids: hits.map((c) => c.id), targetChecked: true }
      : { coverage: 'not-offered', ids: [], targetChecked: true, why: 'the instruction does not state that address' };
  }
  if (TARGETLESS.has(op)) {
    // Operation-level only. The generic `read`/`observe`/`wait`/`done`
    // candidates are targetless by construction, so what is established is
    // that the KIND of move was on the ballot.
    return { coverage: 'matched', ids: sameOp.map((c) => c.id), targetChecked: false };
  }
  const targeted = sameOp.filter((c) => c.target);
  if (!targeted.length) return { coverage: 'not-offered', ids: [], targetChecked: false, why: `no ${op} candidate names a control` };

  const decide = (c: ActorCandidate): boolean | null => {
    const identity = c.target!.identity;
    if (action.chain?.length) {
      const byChain = chainMatches(identity, action.chain);
      if (byChain !== null) return byChain;
    }
    return action.raw ? rawTargetMatches(identity, action.raw) : null;
  };
  const verdicts = targeted.map((c) => ({ c, hit: decide(c) }));
  const hits = verdicts.filter((v) => v.hit === true).map((v) => v.c);
  if (hits.length === 1) return { coverage: 'matched', ids: [hits[0].id], targetChecked: true };
  if (hits.length > 1) return { coverage: 'ambiguous', ids: hits.map((c) => c.id), targetChecked: true, why: `${hits.length} candidates name the same control` };
  // No hit. Only a miss if SOMETHING could be compared: a chain of css paths
  // and a bare selector say nothing about identity either way.
  return verdicts.some((v) => v.hit === false)
    ? { coverage: 'not-offered', ids: [], targetChecked: true, why: 'the element acted on was not among the controls offered' }
    : { coverage: 'unmatchable', ids: [], targetChecked: true, why: 'the element acted on could not be identified from the recording' };
}

/** The model's action, read off its tool call and whatever the recorder filed for it. */
export function modelActionOf(call: ToolCall, recorded: readonly RecordedEntry[]): ModelAction {
  const args = call.args ?? {};
  if (call.name === 'batch') {
    const steps = Array.isArray(args.steps) ? (args.steps as Array<{ tool?: unknown; args?: unknown }>) : [];
    const first = steps[0];
    const inner: ToolCall = {
      id: call.id,
      name: String(first?.tool ?? ''),
      args: (first?.args && typeof first.args === 'object' ? first.args : {}) as Record<string, unknown>,
      rawArgs: '',
    };
    return { ...modelActionOf(inner, recorded), batchSize: steps.length };
  }
  const step = recorded.find((e): e is Extract<RecordedEntry, { k: 'step' }> => e.k === 'step');
  const chain = step?.locators?.target?.chain;
  let operation = TOOL_OPERATION[call.name] ?? null;
  if (call.name === 'check' && args.checked === false) operation = 'uncheck';
  return {
    tool: call.name,
    operation,
    ...(chain?.length ? { chain } : {}),
    // A navigation's "target" is its url argument; everything else names an element.
    ...(typeof args.target === 'string' ? { raw: args.target } : typeof args.url === 'string' ? { raw: args.url } : {}),
  };
}

/**
 * Every step of a batch as its own action, each with the chain the recorder
 * filed for it (the i-th recorded step; a failed step files nothing, so the
 * pairing is only trusted up to the first gap). The turn is SCORED on its first
 * action — that is the decision an actor would have made — but "was Jev's pick
 * something the model did soon after?" has to see the whole batch, or a pick
 * that was the batch's second step reads as one the model never took.
 */
export function batchActionsOf(call: ToolCall, recorded: readonly RecordedEntry[]): ModelAction[] {
  if (call.name !== 'batch' || !Array.isArray(call.args?.steps)) return [];
  const filed = recorded.filter((e): e is Extract<RecordedEntry, { k: 'step' }> => e.k === 'step');
  return (call.args.steps as Array<{ tool?: unknown; args?: unknown }>).map((step, i) => {
    const inner: ToolCall = {
      id: call.id,
      name: String(step?.tool ?? ''),
      args: (step?.args && typeof step.args === 'object' ? step.args : {}) as Record<string, unknown>,
      rawArgs: '',
    };
    return modelActionOf(inner, filed[i] ? [filed[i]] : []);
  });
}

/** Same address, modulo a trailing slash and a case-folded host. */
function normalizeUrl(url: string): string {
  const t = url.trim();
  try {
    const u = new URL(t);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}${u.search}${u.hash}`.toLowerCase();
  } catch {
    return t.replace(/\/$/, '').toLowerCase();
  }
}

// --- the shadow ------------------------------------------------------------------

export interface ActorShadowOptions {
  /** Where the rows go — the daemon passes `state.recordSystemOneDecision`. */
  sink: DecisionSink;
  /** One line per turn on the progress stream, for a human watching a live run. */
  onProgress?: (message: string) => void;
}

/** One turn in flight, from the moment the model is asked to the moment it is logged. */
interface PendingTurn {
  ctx: ShadowTurn;
  mark: number;
  started: number;
  ask: Promise<{ reading: Reading<ActorCandidate> | null; ms: number; candidates: ActorCandidate[]; observation: ActorObservation | null }>;
  modelMs: number;
  calls: readonly ToolCall[];
  logged: boolean;
}

export interface ActorShadow extends LoopShadow {
  /** Rows still being written. `stop` gives these a bounded moment, as it does the triage pass. */
  drain(timeoutMs?: number): Promise<void>;
}

/**
 * The instrument. Builds a ballot and asks Jev at the top of every turn, then
 * logs it against what the model did.
 *
 * Every method is void and nothing is awaited by the loop. The work rides on
 * promises this object owns: a failure anywhere in them is caught and turns
 * into a missing row, which is the correct outcome — a measurement that can
 * break the thing it measures is worse than no measurement.
 */
export function actorShadow(client: SystemOne, opts: ActorShadowOptions): ActorShadow {
  const history: TurnAction[] = [];
  let instruction = '';
  let pending: PendingTurn | null = null;
  const inflight = new Set<Promise<unknown>>();
  let revision = 0;

  const track = <T>(p: Promise<T>): Promise<T> => {
    const done = p.finally(() => inflight.delete(done)) as Promise<T>;
    inflight.add(done);
    return done;
  };

  /** Observe, enumerate, ask. Never throws: a failure is one unwritten row. */
  const askJev = async (ctx: ShadowTurn) => {
    const empty = { reading: null, ms: 0, candidates: [] as ActorCandidate[], observation: null as ActorObservation | null };
    if (!ctx.browser.isOpen) return empty;
    const page = await ctx.browser.getPage().catch(() => null);
    if (!page) return empty;
    const observation = await observeControls(page, `obs${++revision}`);
    if (!observation) return empty;
    const { candidates, values } = buildCandidates({ observation, instruction: ctx.instruction });
    const started = Date.now();
    const reading = await actorTurnSite
      .run(client, { instruction: ctx.instruction, observation, candidates, values, history }, {})
      .catch(() => null);
    return { reading, ms: Date.now() - started, candidates, observation };
  };

  /**
   * One row: what was offered, what Jev said, what the model did, and the
   * model time that turn cost. Joined here rather than at read time because
   * only here are all three in hand.
   */
  const log = async (turn: PendingTurn, action: ModelAction | null, why?: string, rest: ModelAction[] = []): Promise<void> => {
    if (turn.logged) return;
    turn.logged = true;
    const { reading, ms, candidates, observation } = await turn.ask;
    // Nothing was asked (no page, no ballot): not a decision, not a row.
    if (!reading || !candidates.length) return;
    const match = action
      ? matchModelAction(candidates, action)
      : { coverage: 'unmatchable' as TurnCoverage, ids: [], targetChecked: false, why: why ?? 'the turn ran no browser action' };
    const gate = gateFor(ACTOR_TURN_SITE);
    const acted = reading.value !== null && reading.confidence >= gate;
    const agrees = match.coverage === 'matched' || match.coverage === 'ambiguous' ? match.ids.includes(reading.chosen ?? '') : undefined;
    const detail = reading.detail as unknown as TurnReadingDetail | undefined;
    opts.sink({
      site: ACTOR_TURN_SITE,
      model: client.model,
      options: reading.options,
      chosen: reading.chosen,
      confidence: reading.confidence,
      outcome: acted ? 'acted' : 'deferred',
      ...(acted ? {} : { why: reading.why ?? `below gate ${gate}` }),
      ...(agrees === undefined ? {} : { agrees }),
      ms,
      detail: {
        turn: turn.ctx.turn,
        url: observation?.url ?? '',
        // What Jev said this turn needed, and what its pick actually is.
        turnType: detail?.kind ?? null,
        jevOperation: reading.value?.operation ?? null,
        jevPick: reading.chosen,
        // In WORDS, because candidate ids are per-ballot: "did the model take
        // Jev's pick a turn or two later?" can only be asked across turns by
        // what the action was, not by what it was numbered.
        jevPickIs: candidates.find((c) => c.id === reading.chosen)?.description ?? null,
        modelActionIs: match.ids.map((id) => candidates.find((c) => c.id === id)?.description ?? id),
        // The rest of a batch, matched the same way: what the model did NEXT in this same turn.
        ...(rest.length
          ? { modelThenIs: rest.flatMap((r) => matchModelAction(candidates, r).ids).map((id) => candidates.find((c) => c.id === id)?.description ?? id) }
          : {}),
        ...(detail?.kindConflict ? { kindConflict: true } : {}),
        // What the model did.
        modelTool: action?.tool ?? null,
        modelOperation: action?.operation ?? null,
        modelTarget: action?.chain?.length ? describeChain(action.chain) : (action?.raw ?? null),
        ...(action?.batchSize ? { batchSize: action.batchSize } : {}),
        // How the two were compared.
        coverage: match.coverage,
        targetChecked: match.targetChecked,
        ...(match.why ? { matchWhy: match.why } : {}),
        matchedIds: match.ids,
        candidates: candidates.length,
        ...(observation?.truncated ? { pageTruncated: true } : {}),
        // The weight. Every claim about q is Σ modelMs, never a count of calls.
        modelMs: turn.modelMs,
        jevMs: ms,
      },
    });
    opts.onProgress?.(
      `[actor] turn ${turn.ctx.turn}: model ${action?.tool ?? '(none)'} · jev ${reading.chosen ?? 'defer'} (${reading.confidence.toFixed(2)}) · ${match.coverage}${agrees === undefined ? '' : agrees ? ' · agreed' : ' · disagreed'} · ${turn.modelMs}ms model / ${ms}ms jev`,
    );
  };

  /** Close a turn that never reached a browser action (a report, a stub, a deadline). */
  const flush = (why: string): void => {
    const turn = pending;
    pending = null;
    if (!turn || turn.logged) return;
    const report = turn.calls.find((c) => c.name === 'report');
    const action: ModelAction | null = report ? { tool: 'report', operation: 'done' } : null;
    track(log(turn, action, why).catch(() => {}));
  };

  return {
    onTurnStart(ctx) {
      // A previous turn that never ran a tool is closed here rather than lost.
      flush('the turn ended without running a browser action');
      if (ctx.instruction !== instruction) {
        instruction = ctx.instruction;
        history.length = 0;
      }
      pending = {
        ctx,
        mark: ctx.browser.script?.mark() ?? 0,
        started: Date.now(),
        ask: track(askJev(ctx).catch(() => ({ reading: null, ms: 0, candidates: [], observation: null }))),
        modelMs: 0,
        calls: [],
        logged: false,
      };
    },

    onTurnDecided(ctx, calls, timing) {
      if (!pending || pending.ctx.turn !== ctx.turn) return;
      pending.modelMs = timing.modelMs;
      pending.calls = calls;
      // A turn whose only call is `report` runs no tool, so it is scored here.
      if (calls.length && calls.every((c) => c.name === 'report')) flush('the turn reported');
    },

    onToolExecuted(ctx, call, outcome) {
      const turn = pending;
      history.push({ tool: call.name, summary: summarize(call.args), ok: outcome.ok });
      if (!turn || turn.ctx.turn !== ctx.turn || turn.logged) return;
      // The FIRST browser action of the turn is the decision an actor would
      // have made; anything after it is a decision taken with knowledge this
      // ballot did not have.
      const recorded = ctx.browser.script?.entriesSince(turn.mark) ?? [];
      pending = null;
      track(log(turn, modelActionOf(call, recorded), undefined, batchActionsOf(call, recorded).slice(1)).catch(() => {}));
    },

    async drain(timeoutMs = 6_000) {
      flush('the instruction ended');
      const all = Promise.allSettled([...inflight]);
      await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
    },
  };
}

/** The chain's leading candidate, in words, for a human reading the log. */
function describeChain(chain: readonly LocatorCandidate[]): string {
  const c = chain[0];
  switch (c.kind) {
    case 'testid':
      return `testid=${c.value}`;
    case 'role':
      return `${c.role} "${c.name}"`;
    case 'label':
      return `label "${c.label}"`;
    case 'placeholder':
      return `placeholder "${c.placeholder}"`;
    case 'id':
    case 'css':
      return c.selector;
    case 'text':
      return `text "${c.text}"`;
    case 'scoped':
      return `${c.container} hasText "${c.hasText}"`;
    default:
      return `point ${c.x},${c.y}`;
  }
}

/** One short line for the history — the ARGS, never the tool result. */
function summarize(args: Record<string, unknown> | null): string {
  if (!args) return '';
  if (Array.isArray(args.steps)) return `[${args.steps.length} steps]`;
  const s = JSON.stringify(args);
  return s.length > 100 ? s.slice(0, 100) + '…' : s;
}
