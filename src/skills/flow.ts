import type { BrowserProfile } from '../execution/browser.js';
import { isMutatingAction } from '../execution/lifecycle.js';
import { popupItem } from '../execution/expect.js';
import type { Skill, SkillStep } from './store.js';
import fs from 'node:fs';
import path from 'node:path';
import type { LocatorCandidate, RecordedEntry, RecordedInstruction, RecordedReport, RecordedStep, StepDiff } from '../daemon/recorder.js';
import { rootDir } from '../shared/paths.js';
import { escapeRe } from '../shared/text.js';
import { urlParts, urlPattern } from './compile.js';
import { mintedShape, urlShapeOf } from '../execution/url.js';
import { idPositionPart, pathDigitPart, pathIdPart } from './ledger.js';
import { MIN_ID_LEN, looksLikeId, tokenPattern } from './shape.js';
import { statedPlainly } from '../spec/rethread.js';

/**
 * A flow is the resolved path a session took: the instructions the caller
 * actually issued, in order, each pinned to the skill it produced and to the
 * values it read back. It is NOT authored up front — it is exported from a
 * recorded `--learn` session, so the caller's mid-run decisions are captured
 * as steps like any other. Replaying a flow (`run`) needs no caller: each step
 * replays its skill, repairs on the cheap model if a step drifted, and only
 * escalates or halts when a step genuinely cannot complete.
 */
export interface Flow {
  name: string;
  origin: string;
  /** Where the browser must start (the session's first observed url). */
  startUrl: string;
  /** Run variables the caller declared; the export turned their values into {{name}} refs. */
  vars: string[];
  steps: FlowStep[];
  provenance: { session: string; created: string; model?: string };
  /**
   * The browser the flow was recorded in — window size, and for an emulated
   * device its touch, mobile flag, scale and user agent. Replay and the
   * compiled artifact run it there (execution/browser.ts BrowserProfile).
   * Absent on a flow saved before it was stored: those were all recorded at
   * DEFAULT_BROWSER_PROFILE.
   */
  browser?: BrowserProfile;
  /**
   * Record-time problems the build found in this flow, each prefixed with the
   * diagnostic code it becomes (`noop-step:` or `contradicted-step:`). Compile
   * re-surfaces them as Diagnostics — see src/spec/diagnostics.ts.
   */
  warnings?: string[];
  /**
   * What `pruneUnsourcedOutputs` took off each step at export: a value the
   * step's instruction declared that no replay can produce from the page.
   *
   * Persisted because it is a fact about the RECORDING, and the session that
   * knows it ends. It reached only the export response's warnings, so
   * "01-open declared columns_left_to_right and nothing reads it" was gone by
   * the time kanboard fwkb17's replays scored 5/6 on exactly that value.
   *
   * Deliberately NOT a flow `warning`: warnings carry a diagnostic code prefix
   * and re-surface through compile (spec/ir.ts noopDiagnostics). Refusing a
   * compile over a pruned output was measured at twelve refused steps across
   * three currently-green flows (odoo prunes 6 of 7 steps and scores 6/6), so
   * this is a record, not a gate.
   */
  pruned?: { stepId: string; outputs: string[] }[];
}

export interface FlowStep {
  id: string;
  /** The instruction as issued, with {{var}} and {{step.output}} references substituted in. */
  instruction: string;
  /** The skill this instruction used, replayed first on `run`. Re-pinned when a repair validates. */
  skill?: string;
  /**
   * The skill's slot bindings, captured at record time so replay does not have
   * to re-derive them from the (reworded) instruction. Values may hold
   * {{var}}/{{step.output}} references, resolved the same way as the instruction.
   */
  params?: Record<string, string>;
  /** Report values this step produced, named, so later steps can reference them. */
  outputs: string[];
  /** Values observed at record time, kept for reference and as soft assertions. */
  recorded: Record<string, string>;
  /**
   * This step's recording instruction did NOT report success — it was adopted
   * because the session's resolved path demonstrably ran through the state it
   * produced (see resolveGroups). It replays model-first with extra budget,
   * and a non-success replay of it does not halt the flow: the recording's
   * own path also continued from this instruction's partial state.
   */
  adopted?: boolean;
  /**
   * Cross-run evidence about this step's outputs: for each output name, how
   * often a later run produced the SAME value here and how often it differed.
   *
   * This is what replaces reading a value's characters to decide whether it
   * names a record. Run 1 cannot know: "New (unsaved)" and "S00021" are both
   * just strings a step reported. Run 2 settles it by producing its own value
   * for the same output — Odoo says "New (unsaved)" again (app furniture) and
   * "S00023" (this run's record). Same mechanism as a locator candidate's
   * `seen: {hit, miss}`; see notes/PLAN-evidence-over-shape.md.
   *
   * `absent` is the third outcome, and the one this used to be blind to: the
   * replay SUCCEEDED and reported no value for an output the recording did
   * report. Without it a read that consistently MISSES tallies nothing at all,
   * so `retireDeadReadLocators` (which fires on `differed > 0`) can never
   * reach it — fwkb14's synthesized `column_3` read matched nothing in n2 and
   * nothing again in n3, and the store learned the same nothing both times.
   */
  outputEvidence?: Record<string, { same: number; differed: number; absent?: number; empty?: number }>;
  /**
   * The url PATTERN the recording ended this step on (compile.ts urlPattern,
   * so `/orders/1042` and `/orders/1043` are one route).
   *
   * Evidence about a value is only evidence if both runs were looking at the
   * same thing. Measured on fwod20's n1/n2/n3: comparing url parts step by
   * step, 21 parts "varied" — and the ones the shape gates had refused were
   * `q.model = "sale.order" vs "res.partner"` and
   * `q.view_type = "form" vs "kanban"`, which varied because a recovery turn
   * navigated somewhere else, not because the app minted anything. Require
   * the same route and 4 remain, every one of them `q.id`.
   *
   * So a comparison made from a different route is discarded rather than
   * counted. It costs the evidence mechanism its sparsest runs — 7 of
   * fwod20's 11 instructions diverged — but a verdict built from a different
   * page is not a slower verdict, it is a wrong one.
   */
  route?: string;
  /**
   * Values a run watched a url position hold that the recording did not, while
   * replaying this step — the volatile segment diffs a url gate reported
   * (ledger.ts `urlVarianceValues`), both sides of each.
   *
   * SEPARATE from `outputEvidence` on purpose: that is a per-output tally of a
   * step that SUCCEEDED, and this is an observation about the environment,
   * which is true whether or not the step went on to complete. fwgr41-n2 saw
   * `afyd7g0300dfkc→bfyd7wj0ceolcf` at 06-find's step 6 and stopped at step 7
   * (the recorded uid had been deleted); the observation was discarded with the
   * stop, and n3 went back to guessing the uid's shape. `varyingValues` reads
   * both, so a value that lands here banks with basis 'variance' from the next
   * run on and every `evidenced()` guard starts working with no new case.
   */
  urlVariance?: string[];
}

/**
 * Did an earlier run demonstrate that this value is specific to the run that
 * made it? Produced by `varyingValues` below and carried by the ledger for
 * the duration of a run.
 *
 * ONE DIRECTION, and the type is boolean so the other cannot be spelled.
 *
 * Disagreement is strong evidence: a run that produced a different value here
 * proves the recorded one was not the app's. Agreement is NOT the converse,
 * because a bench app reset between runs reproduces a minted record id
 * exactly — every repair-desk recording in bench/results creates ticket
 * `t15`, and `t15` is the canonical example of a value that MUST stay an
 * identifier. An earlier cut of this let agreement suppress admission, which
 * would have stopped banking t15 from run 2 on: no leak guard could see it,
 * and the recording's ticket would ride into every replay silently.
 *
 * So evidence may only ever ADD to what shape and position admit, never take
 * away. The last place that let agreement act — `stableOutputs`, which
 * resolved an unpublished `{{step.output}}` to the recorded literal once a
 * later run had reproduced it — was deleted for exactly this reason: two
 * reset runs both minting `t15` made it "stable", and a third run whose
 * create step went tier A and dropped the output would have edited run 1's
 * ticket. An unresolved reference now always goes to recovery.
 */
export type RunSpecific = (value: string) => boolean;

/**
 * Is this url part specific enough to publish as a reference?
 *
 * ONE function for the producer (buildFlow's minting) and the consumer
 * (urlOutputs), because they disagreeing is a silent dead reference — the
 * comment on urlOutputs has said so since it was written, and they had
 * drifted anyway: minting admitted `idPositionPart`, urlOutputs did not, so
 * odoo's `#id=44` was minted as `{{01-open.url.q.id}}` and then never
 * published by any replay. Every step referencing it fell to recovery with
 * the ref blank — the exact failure the length mismatch had caused before.
 *
 * Three arms, in order of what they know. A part an earlier run watched
 * CHANGE is a reference whatever its characters — the only arm that can see a
 * record pointer in an unnamed position, like a grafana uid at `p1`. Then the
 * url's own vocabulary (position), then the characters (shape). Evidence only
 * ever adds; see `RunSpecific` for why agreement may not take away.
 *
 * Position has two spellings below the shape arm's floor: an `id=` state key
 * (odoo's `#id=44`) and a digit run in a path segment (OpenProject's
 * `/work_packages/details/41/overview`). The path one is the ledger's
 * pathIdPart, shared so the ledger, this minting and the replay's publishing
 * cannot drift apart: fwop2's 02-create minted work package 41, and no
 * `{{02-create.url.p4}}` was minted, published or banked, so 06-open's goto
 * kept 41 literally and every replay opened a deleted work package.
 */
export function referencablePart(part: { label: string; value: string }, runSpecific?: RunSpecific): boolean {
  return Boolean(runSpecific?.(part.value)) || (part.value.length >= MIN_ID_LEN && looksLikeId(part.value, 'first-run')) || idPositionPart(part) || pathIdPart(part);
}

/**
 * The values this flow has WATCHED CHANGE — a later run produced something
 * different for the output that recorded them — for the ledger to bank as
 * identifiers instead of reading their characters (ledger.ts `seedVariance`).
 *
 * This is the only place in the product that answers "did the app make this,
 * or was it this run's record?" by watching rather than by reading. A value
 * that varied ANYWHERE is in the set, and nothing takes it back out: see
 * `RunSpecific` for why the converse is not collected at all.
 */
export function varyingValues(flow: Flow): Set<string> {
  const out = new Set<string>();
  for (const step of flow.steps) {
    for (const [name, ev] of Object.entries(step.outputEvidence ?? {})) {
      if (ev.differed < 1) continue;
      const value = step.recorded?.[name];
      if (typeof value === 'string' && value.trim()) out.add(value.trim());
    }
    // A url position a run watched change, banked whether or not that run then
    // stopped — see FlowStep.urlVariance (fwgr41-n2).
    for (const value of step.urlVariance ?? []) {
      if (typeof value === 'string' && value.trim()) out.add(value.trim());
    }
  }
  return out;
}

/**
 * Record what a replay of `step` produced, against what the recording run saw.
 * Only outputs BOTH runs reported can be compared — a tier-A replay honestly
 * drops what it could not re-observe, and silence is not disagreement.
 * Returns the names whose verdict changed, for progress reporting.
 */
export function noteOutputEvidence(step: FlowStep, reported: Record<string, string>, route?: string): string[] {
  const changed: string[] = [];
  // Same route, or no verdict. See FlowStep.route: a replay that recovered
  // onto a different page disagrees about where it is, not about what the
  // value is, and counting that as `differed` is how a route word gets a
  // permanent record-pointer verdict it never earned.
  if (step.route && route && step.route !== route) return changed;
  for (const [name, recorded] of Object.entries(step.recorded ?? {})) {
    const seen = reported[name];
    if (typeof recorded !== 'string' || !recorded) continue;
    // Silence is not disagreement — but it is not nothing either. This run
    // reached the step and finished it, and produced no value where the
    // recording had one: whatever was supposed to publish `name` matched
    // nothing. Tallied apart from same/differed so no verdict is built from
    // it (`varyingValues` and `recordedRef` still read only `differed`); its
    // one reader is the retirement of a read that has never once resolved
    // (server.ts settleUnprovenReads; fwkb14 missed in n2 and again in n3).
    //
    // A value reported EMPTY is not silence: the read resolved an element and
    // it gave back "". Its locator found something, so it is tallied as
    // `empty`, never `absent`, and nothing retires it (fwgt5 01-signin's
    // image-only org link read "" twice and lost its working locator).
    if (seen === '') {
      const ev = (step.outputEvidence ??= {})[name] ?? { same: 0, differed: 0 };
      ev.empty = (ev.empty ?? 0) + 1;
      step.outputEvidence[name] = ev;
      continue;
    }
    if (typeof seen !== 'string') {
      const ev = (step.outputEvidence ??= {})[name] ?? { same: 0, differed: 0 };
      ev.absent = (ev.absent ?? 0) + 1;
      step.outputEvidence[name] = ev;
      continue;
    }
    const ev = (step.outputEvidence ??= {})[name] ?? { same: 0, differed: 0 };
    const agrees = seen.trim() === recorded.trim();
    const wasStable = ev.differed === 0 && ev.same >= 1;
    if (agrees) ev.same += 1;
    else ev.differed += 1;
    step.outputEvidence[name] = ev;
    if (wasStable !== (ev.differed === 0 && ev.same >= 1)) changed.push(name);
    else if (ev.same + ev.differed === 1) changed.push(name);
  }
  return changed;
}

export function flowsDir(): string {
  return process.env.SITELOOPER_FLOWS_DIR || path.join(rootDir(), 'flows');
}

function flowFile(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_');
  return path.join(flowsDir(), `${safe}.json`);
}

/**
 * Write a flow. `file` defaults to the flows dir under the flow's own name;
 * a run that loaded the flow from somewhere else passes that path back so
 * evidence and re-pins land where they came from. Tmp + rename, so a reader
 * never sees a half-written file.
 */
export function saveFlow(flow: Flow, file: string = flowFile(flow.name)): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(flow, null, 2));
  fs.renameSync(tmp, file);
  return file;
}

/**
 * A flow the export REFUSED, written where nothing will replay it.
 *
 * Refusing is right — a flow carrying a run value in a locator quietly does
 * its work on the wrong record — but throwing the recording away with it is
 * not. fwrd23l cost 37 minutes and $0.26 to record and left nothing at all
 * behind, and a cloud run is dearer. The `.rejected.json` suffix keeps it out
 * of listFlows — which is excluded explicitly, since `.rejected.json` ends in
 * `.json` too — while leaving it for verify-artifacts and for a human to read.
 */
export function saveRejectedFlow(flow: Flow, reason: string): string {
  const dir = flowsDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = flowFile(flow.name).replace(/\.json$/, '.rejected.json');
  fs.writeFileSync(file, JSON.stringify({ rejected: reason, flow }, null, 2));
  return file;
}

/** A flow and the file it was read from — a path first, then a name in the flows dir. */
export function loadFlowFile(nameOrPath: string): { flow: Flow; file: string } | null {
  const candidates = [nameOrPath, flowFile(nameOrPath)];
  for (const file of candidates) {
    try {
      return { flow: JSON.parse(fs.readFileSync(file, 'utf8')) as Flow, file };
    } catch {
      /* try next */
    }
  }
  return null;
}

export function loadFlow(nameOrPath: string): Flow | null {
  return loadFlowFile(nameOrPath)?.flow ?? null;
}

export function listFlows(): Flow[] {
  let names: string[];
  try {
    names = fs.readdirSync(flowsDir()).filter((n) => n.endsWith('.json') && !n.endsWith('.rejected.json'));
  } catch {
    return [];
  }
  return names.map((n) => loadFlow(path.join(flowsDir(), n))).filter((f): f is Flow => Boolean(f));
}

/**
 * Build a flow from one session's recording.
 *
 * References are resolved in two passes so a step can never reference a value
 * that has not been produced yet:
 *  1. Declared run variables (`vars`) → `{{name}}`, everywhere they occur.
 *  2. A value that equals an *earlier* step's named output → `{{stepId.output}}`.
 * Anything left literal is a constant the caller typed, and stays literal.
 */
export function buildFlow(
  entries: RecordedEntry[],
  opts: {
    name: string;
    origin: string;
    startUrl: string;
    vars: Record<string, string>;
    session: string;
    model?: string;
    now?: string;
    /** Given a skill id and the raw recorded instruction, return the slot bindings. */
    bind?: (skillId: string, instruction: string) => Record<string, string> | null;
    /**
     * Given a skill id, each slot's recorded ORIGIN (its binding key,
     * `url:i3:p1`). A slot whose origin is a url part an earlier step of this
     * flow minted is written as that step's url reference, at any length —
     * origin wins over value matching (originRef).
     */
    origins?: (skillId: string) => Record<string, string> | null;
    /**
     * Which values earlier runs demonstrated are run-specific (see
     * `RunSpecific`). Absent on a first recording, which is the point: run 1
     * has nothing to consult and falls back to position and shape.
     */
    runSpecific?: RunSpecific;
  },
): Flow | null {
  const groups = resolveGroups(groupByInstruction(entries));
  if (!groups.length) return null;

  const steps: FlowStep[] = [];
  const warnings: string[] = [];
  const produced: Produced[] = [];
  const seenUrl = new Set(urlParts(opts.startUrl).map((p) => p.value));
  const varEntries = Object.entries(opts.vars).filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const baseline = baselineOf(entries);

  let prevId: string | undefined;
  let prevGroup: Group | undefined;
  /** Which flow step each kept instruction became, by its ledger index. */
  const byLedger = new Map<string, string>();
  groups.forEach((g, i) => {
    const id = stepId(g.instruction.text, i);
    // Read the RAW instruction, before references go in: a substituted
    // {{02-create.quotation_ref}} shifts every later word and can push the
    // ask outside the scan window.
    const noop = noopStepWarning(id, g);
    if (noop) warnings.push(noop);
    if (prevId && prevGroup) {
      const contradiction = contradictionWarning(prevId, prevGroup, id, g);
      if (contradiction) warnings.push(contradiction);
    }
    prevId = id;
    prevGroup = g;
    let text = g.instruction.text;
    for (const [name, value] of varEntries) text = replaceToken(text, value, `{{${name}}}`);
    // Reference earlier outputs (longest values first so nested ids resolve),
    // except one this instruction names only as an alternative its procedure
    // never acts on (namedAsAlternative, fwrd86 "a Draft or Closed status").
    const alternative = (value: string): boolean => namedAsAlternative(g.instruction.text, value) && !usedByProcedure(g, value);
    for (const p of [...produced].sort((a, b) => b.value.length - a.value.length)) {
      if (alternative(p.value)) continue;
      if (p.value.length >= 2) text = replaceToken(text, p.value, `{{${p.stepId}.${p.output}}}`);
      else if (p.path) text = replaceAtPath(text, p.path, `{{${p.stepId}.${p.output}}}`);
    }
    const outputs = Object.keys(g.report?.values ?? {});
    // Capture the skill's slot bindings, referencized like the instruction, so
    // replay binds params from the flow rather than re-parsing the wording.
    let params: Record<string, string> | undefined;
    if (g.report?.skill && opts.bind) {
      // The template first (it rethreads slots to their origins); else the
      // params the recording actually replayed the skill with.
      const raw = opts.bind(g.report.skill, g.instruction.text) ?? g.report.skillParams ?? null;
      const origins = opts.origins?.(g.report.skill) ?? {};
      if (raw) {
        params = {};
        for (const [k, v] of Object.entries(raw)) {
          const byOrigin = origins[k] ? originRef(origins[k], v, byLedger, produced) : null;
          if (byOrigin) {
            params[k] = byOrigin;
            continue;
          }
          let rv = v;
          for (const [name, value] of varEntries) rv = replaceToken(rv, value, `{{${name}}}`);
          for (const pr of [...produced].sort((a, b) => b.value.length - a.value.length)) {
            const marker = `{{${pr.stepId}.${pr.output}}}`;
            if (alternative(pr.value)) continue;
            if (pr.value.length >= 2) rv = replaceToken(rv, pr.value, marker);
            else if (pr.path) {
              // Below the floor only at its url position: inside a url or
              // path the param carries, or the WHOLE param when this step's
              // own instruction names that record by its path — the slot a
              // navigation to it was bound by (compile's url-origin slot).
              rv = replaceAtPath(rv, pr.path, marker);
              if (rv === pr.value && replaceAtPath(g.instruction.text, pr.path, marker) !== g.instruction.text) rv = marker;
            }
          }
          params[k] = rv;
        }
      }
    }
    byLedger.set(`i${g.ledgerIndex}`, id);
    steps.push({
      id,
      instruction: text,
      ...(g.report?.skill ? { skill: g.report.skill } : {}),
      ...(params ? { params } : {}),
      outputs,
      recorded: g.report?.values ?? {},
      ...(g.adopted ? { adopted: true } : {}),
    });
    // Provenance (PLAN-replay-v2): url parts this step MINTED (absent from
    // every earlier url) are outputs too — a later step's recorded literal
    // equal to one becomes {{stepId.url.<part>}}, re-bound each run from
    // where the replay's own browser lands. Same guards as report outputs:
    // length >= 4, first appearance wins.
    //
    // Url parts go into `produced` BEFORE report values, and a report value
    // that duplicates a minted part is not referencized under its report
    // name: a zero-model (tier-A) replay synthesizes its report from live
    // read-backs only and honestly DROPS recorded values it could not
    // re-observe, so a {{step.reportName}} ref dies exactly when the replay
    // is at its best — while {{step.url.<part>}} is published by every
    // replay unconditionally. fwgr-n2/n3 halted on precisely this: the
    // recorded instructions referenced {{02-create.dashboard_uid}}, the
    // tier-A replay's report legitimately omitted it, and recovery ran with
    // the uid blanked until it turn-capped.
    const minted: Produced[] = [];
    if (g.endUrl) {
      // The WHOLE url, not only its parts. A step's params often carry it
      // entire ("On ticket {{v1}} (url {{v2}})"), and without provenance that
      // literal gets referencized under whatever the RECORDING run's report
      // happened to name it. fwrd21l shows the cost: 02-add's model report
      // named it `url`, so the flow said {{02-add.url}} — then on replay 02-add
      // went tier A, synthesizeReport honestly dropped a recorded url it could
      // not re-observe, the ref went unresolved, and FOUR later steps skipped
      // the zero-model path entirely. Exactly the fwgr-n2/n3 failure the parts
      // loop below was written for, one level up.
      if (!produced.some((p) => p.value === g.endUrl) && !varEntries.some(([, v]) => v === g.endUrl)) {
        minted.push({ stepId: id, output: 'url', value: g.endUrl });
      }
      for (const part of urlParts(g.endUrl)) {
        const fresh = !seenUrl.has(part.value);
        seenUrl.add(part.value);
        // `referencablePart` is shared with urlOutputs, which is what a
        // replay publishes: the two must admit exactly the same parts or the
        // reference minted here resolves to nothing. See it for the arms and
        // their order.
        // A digit run at a path position that this step's own action LANDED
        // is its record id at any length (ledger.ts pathDigitPart): provenance,
        // not characters. Below the floor it is referenced only at its path.
        const landed = !referencablePart(part, opts.runSpecific) && pathDigitPart(part) && landedByAction(g, part);
        if (!fresh || !(referencablePart(part, opts.runSpecific) || landed)) continue;
        if (produced.some((p) => p.value === part.value) || varEntries.some(([, v]) => v === part.value)) continue;
        const path = part.value.length < 2 ? pathTo(g.endUrl, part.label) : undefined;
        minted.push({ stepId: id, output: `url.${part.label}`, value: part.value, ...(path ? { path } : {}) });
      }
    }
    produced.push(...minted);
    // A minted url part is a RECORDED value of this step, not only a source
    // for other steps' references. Without that, `noteOutputEvidence` had
    // nothing to compare a replay's url parts against, so the whole url
    // population sat outside the cross-run evidence mechanism — decided once,
    // by shape, on the run least able to judge (see shape.ts). Now a later run
    // that lands on the same part banks `same`, and one that lands on a
    // different part banks `differed`, exactly as it does for reported values.
    // Only `differed` is ever acted on (varyingValues, dead-read retirement);
    // agreement is recorded and never used — see `RunSpecific`.
    const step = steps[steps.length - 1];
    if (g.endUrl) step.route = urlPattern(g.endUrl, new Map(), { query: false });
    for (const m of minted) {
      if (!(m.output in step.recorded)) step.recorded = { ...step.recorded, [m.output]: m.value };
    }
    for (const [output, value] of Object.entries(g.report?.values ?? {})) {
      if (typeof value !== 'string' || !value) continue;
      if (minted.some((m) => m.value === value)) continue;
      // A value the step's own instruction handed it is an INPUT the report
      // echoed, not something the step observed: a later step quoting it
      // resolves the way this step did — a var, an earlier reference, or a
      // constant of the flow — never through this step's output, which a
      // tier-A replay has no read to republish. fwgr23 05-open referenced
      // {{04-open.tag}} for the "bench" its own instruction typed; the
      // zero-model replay of 04-open could not publish it, and 05-open went
      // to the model on every replay (19–44 turns).
      if (replaceToken(g.instruction.text, value, ' ') !== g.instruction.text) continue;
      // The same fact one instruction further back: a value the TASK stated
      // before this step ran, and before the run had shown it anywhere, is the
      // task's own vocabulary, so this step cannot be where it came from. See
      // statedBeforeShown for the evidence and the cases.
      if (statedBeforeShown(entries, g.instruction, value)) continue;
      // And the same question asked of the PAGE rather than the task: a value
      // the app was already showing before this run changed anything is the
      // app's baseline data, not something a step after that point produced.
      // A later run that saw it differ outranks the page (evidence only adds
      // threading, see `RunSpecific`). See baselineOf for the evidence and the
      // cases.
      if (!opts.runSpecific?.(value) && baseline && entries.indexOf(g.instruction) >= baseline.at && baseline.names.has(foldValue(value))) continue;
      // EVERY reported value becomes a reference. Run 1 makes no judgement
      // about which of them name a record, because it cannot: "New (unsaved)"
      // and "S00021" are both just strings a step reported, and the question
      // — does the app produce this again, or was it specific to this run? —
      // is about behaviour ACROSS runs.
      //
      // A previous cut of this gated on looksLikeId, which reads the
      // characters. That is the failure this plan exists to remove: a record
      // id that does not look like one would be left literal and every replay
      // would act on run 1's record while reporting success.
      //
      // So reference everything, which is the safe default (an unresolved
      // reference costs a recovery turn, never a wrong record). A reference a
      // replay cannot fill goes to recovery; there is no literal fallback,
      // because agreement across runs does not show the app owns a value
      // (see `RunSpecific` and notes/PLAN-evidence-over-shape.md).
      produced.push({ stepId: id, output, value });
      // An id can be minted where no url ever carries it: an app that saves
      // over its own API answers with JSON, and the run reads that answer
      // back rather than navigating. fwgr5 created its dashboard exactly so —
      // the uid existed only inside the response body — and every later step
      // kept n1's literal uid, which is what made those steps re-derive it on
      // the cheap model on every replay. Publish the JSON's scalar leaves
      // under `{{step.output#path}}`: a tier-A replay re-observes the read,
      // so the path re-reads THIS run's value.
      for (const leaf of jsonLeaves(value, opts.runSpecific)) {
        if (produced.some((p) => p.value === leaf.value) || varEntries.some(([, v]) => v === leaf.value)) continue;
        const name = `${output}#${leaf.path}`;
        produced.push({ stepId: id, output: name, value: leaf.value });
        // Per-LEAF evidence. `recorded` held the whole body under `output`, so
        // noteOutputEvidence compared the entire JSON string as one value and
        // a single volatile field vetoed every leaf in it at once — a response
        // carrying both a minted uid and a timestamp could never demonstrate
        // anything about either. Recording each published leaf under the name
        // it is referenced by makes the comparison per-path, so a leaf that
        // varies is known to vary without condemning its siblings. This does
        // NOT widen which leaves are published — see jsonLeaves, where the
        // shape prior stays, and shape.ts for why.
        if (!(name in step.recorded)) step.recorded = { ...step.recorded, [name]: leaf.value };
      }
    }
  });

  return {
    name: opts.name,
    origin: opts.origin,
    startUrl: opts.startUrl,
    vars: Object.keys(opts.vars),
    steps,
    provenance: { session: opts.session, created: opts.now ?? new Date().toISOString(), ...(opts.model ? { model: opts.model } : {}) },
    ...(warnings.length ? { warnings } : {}),
  };
}

/**
 * Did an instruction BEFORE `producer` already state `value`, at a moment when
 * nothing in the recording had yet shown it?
 *
 * buildFlow threads every reported value into later instructions by plain
 * token match, with no check that the later mention has anything to do with
 * the step that reported it. fwgr63's 03-open reported
 * `button_save_dashboard = "Save dashboard"`, the label of the app's own
 * button, and 05-open's wording "(Save dashboard, confirm the save…)" became
 * `({{03-open.button_save_dashboard}}, …)`. No replay ever published that
 * value (the export's synthesized read looked for the save drawer's heading,
 * which is gone once the save is done), so the sweep verified 6/6 while
 * `spec` refused the flow: `05-open: slot v5 is bound to
 * {{03-open.button_save_dashboard}}, and nothing has ever published
 * button_save_dashboard`. kanboard fwkb8/27/28/30/33 show the defect in its
 * plainest form: 02-create reported `status = "open"`, and a later step's
 * "open the task page" was exported as "{{02-create.status}} the task page".
 *
 * WHY THE EARLIER INSTRUCTION IS THE EVIDENCE. Whoever writes a flow's
 * instructions learns about the run through one channel, the `do` report (its
 * summary and values). A value stated in an instruction that comes before
 * every report and page that could have shown it was known before the run
 * produced anything, so it is a constant of the task. "Save dashboard" was in
 * 02-create's wording ("use Save dashboard, enter the name, confirm") before
 * 03-open ran, and "open" was in 01-open's. The earlier instruction keeps the
 * literal in the flow, so every replay runs with it whatever the later step
 * reports. Making a later step depend on the later producer adds a way to
 * fail and makes the flow no more specific to the run.
 *
 * WHAT IT MUST NOT CATCH. The author also copies values the run HAS shown
 * into later wording. fwod11's 03-open to 05-open say "quotation S00022"
 * because an earlier report named it, and 07-open's `{{06-open.e2551}}` is
 * the only thing that ties the cancel to THIS run's order. If the run showed
 * the value anywhere before the stating instruction, it stays threaded as
 * before. That covers a report's summary or values, a step's args, result,
 * locators and page diff, an earlier start page or url, and the stating
 * instruction's own start page. That net is wider than what the author saw, on
 * purpose: a net that is too wide leaves things as they were, while one that
 * is too narrow would turn a record's id into the recording's literal. It
 * ignores case for the same reason. Kanboard's legitimate threading never
 * reaches this test: no instruction up to the producer states fwkb34's
 * `{{02-open.board_column_work_in_progress}}` or
 * `{{03-create.task_id_as_displayed}}`.
 *
 * Measured on the 195 published flows (every origin/results/fw* branch that
 * carries its flow, checked against each n1 transcript's `do` output): 28
 * consumed references carry a value stated before its producer ran. The run
 * had not yet shown 17 of them: "Save dashboard" (fwgr10, fwgr63), "bench",
 * "Last 6 hours", "1m", "browser", "open", "admin", "Ready" and "Untaxed
 * Amount". Every one is the task's wording or the app's own text. The run had
 * already shown 8 of them, and those stay threaded: odoo's S00021/S00022,
 * grafana's "now" and "now-6h", "Dashboard saved", "Cancel", and fwgr53's
 * "text". The other 3 had no transcript to check.
 */
function statedBeforeShown(entries: readonly RecordedEntry[], producer: RecordedInstruction, value: string): boolean {
  const end = entries.indexOf(producer);
  if (end <= 0 || value.length < 2) return false;
  // Case aside, as shownBefore does. kanboard fwkb35 stated "open" only at the
  // head of a sentence ("Open http://…" in 01-open, "Open the task page" in
  // 06-open), 07-set reported `status = "open"`, and 08-change's "Then open
  // the 'Bench Board' board page" was exported as "Then {{07-set.status}} the
  // 'Bench Board' board page". A capital does not make the word something the
  // author learned from the run. Over the published flows and scripts, what
  // this adds is all of that kind: grafana's "bench" tag (fwgr7, fwgr17) and
  // its new-panel default "Panel Title" (fwgr18, stated as "the panel
  // title"), odoo's "Quotation" and "Cancel" — the task's words or the app's
  // own. A value the run made cannot be stated, in any case, before it exists.
  // The EARLIEST instruction that states it decides: if the run had already
  // shown the value by then, every later statement came after that too.
  const k = firstStatedAt(entries, value, end);
  return k >= 0 && !shownBefore(entries, k, value);
}

/**
 * The run's OUTPUT values that are constants of the task, not of the run: an
 * instruction stated the value (case aside, as a whole token) before any
 * REPORT had carried it — its own producing instruction included, which
 * statedBeforeShown (asking about an earlier one) does not reach.
 *
 * WHY THE REPORT IS THE EVIDENCE. statedBeforeShown's argument, taken at its
 * word: whoever writes a flow's instructions learns about the run through one
 * channel, the `do` report. A value an instruction states that no earlier
 * report carried was known before the run told anyone anything — the task's
 * wording, or seed data the app shows identically on every run. snipeit
 * fwsi4's 04-set was told to check the asset out to 'Bench Assignee', a
 * seeded user, and reported `assignee = "Bench Assignee"`; espocrm fwec3's
 * 01-signin was told to sign in as 'admin' and reported `logged_in_user =
 * "Admin"`. Not shownBefore's page-wide net: that one errs wide because a
 * wrong literal in a FLOW acts on run 1's record, and here it would condemn
 * seed data — fwsi4's dashboard listed 'Bench Assignee' in its activity feed
 * before anything ran.
 *
 * WHY IT MATTERS. The ledger banks every reported value as this run's
 * (server.ts noteMintedIds), and compile deletes any locator candidate naming
 * one (compile.ts `stranded`). fwsi4 05-open's read of the assignee, scoped by
 * hasText "Checked out to Bench Assignee for run {{v2}}", lost that anchor,
 * was left positional, and was stored with an empty chain and no label.
 *
 * WHAT IT MUST NOT CATCH. A value a report carried before any instruction
 * named it — the ticket ref a create reported, then quoted by the next
 * instruction (fwrd12l, fwrd22l) — is the run's own and stays a run value. So
 * does anything that embeds a declared var's value (the runid inside a typed
 * title): the var is the run value, and it goes on stranding by itself. And a
 * value an earlier run watched change (`runSpecific`) is the run's whatever
 * the recording says.
 */
export function taskConstants(
  entries: readonly RecordedEntry[],
  values: Iterable<string>,
  vars: Iterable<string> = [],
  runSpecific?: RunSpecific,
): Set<string> {
  const varValues = [...vars].map((v) => String(v ?? '').trim()).filter((v) => v.length >= 2);
  const out = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (value.length < 2 || out.has(value) || runSpecific?.(value)) continue;
    if (varValues.some((v) => replaceToken(value, v, ' ') !== value)) continue;
    const at = firstStatedAt(entries, value, entries.length);
    if (at >= 0 && !reportedBefore(entries, at, value)) out.add(value);
  }
  return out;
}

/**
 * The reported values the recording shows the run MINTED as page text, and
 * then addressed its record by — the text half of compile's url mints
 * (compile.ts discoverMinted), which only ever looks at urls.
 *
 * repairdesk fwrd85: 02-create's save put the ticket's number on the page
 * (`- cell "RD-1015"`, the list's url unchanged at `#/tickets`), its read-back
 * reported it as `ticket_reference`, and every later instruction named the
 * ticket by it. No url carried it, so nothing marked it minted: the ledger
 * banked it on shape alone, which slotKnownRunValues leaves alone, and
 * compile slots a known value only where an instruction names it. 02-create's
 * goal kept `requireText "RD-1015"`, 09-report (which never names it) kept it
 * in its expectation lines, and its report template published
 * `archived_search_result = "… single row: RD-1015 | fwrd85-n2 …"` on n2 and
 * n3, whose tickets were RD-1016 and RD-1017. The compiled flow hard-coded it
 * too.
 *
 * Provenance, three facts the recording holds, never the value's characters:
 *  - MINTED: the first thing in the recording to show the value is a
 *    state-changing step's change to the page it acted on (its url
 *    unchanged), naming an element that is no popup item by exactly it
 *    (valueLineCandidates' whole-name parse). No instruction stated it, no
 *    start page, url, earlier step, read or report showed it, and the step did
 *    not type it (shownBefore, firstStatedAt);
 *  - CAPTURED: a report after that step carries it as a whole value, so it has
 *    an origin a later run resolves its own from;
 *  - ADDRESSED: an instruction after that report names it — the run used it as
 *    the record's handle, and buildFlow threads it as a reference.
 * The third is what separates a record's number from what a save computes: a
 * part's price also first appears after its save and is read back, but no
 * instruction names a record by it, and a goal or an expectation keeps it. A
 * value only ever minted and read — never addressed — is left as before.
 */
export function textMints(entries: readonly RecordedEntry[]): string[] {
  const out: string[] = [];
  // Where each element name first appeared, in one pass: the daemon asks this
  // of the whole script before every instruction it compiles.
  const firstNamed = new Map<string, number>();
  entries.forEach((e, k) => {
    if (e.k === 'step') for (const name of addedNames(e)) if (!firstNamed.has(name)) firstNamed.set(name, k);
  });
  entries.forEach((report, ri) => {
    if (report.k !== 'report') return;
    for (const raw of Object.values(report.values ?? {})) {
      if (typeof raw !== 'string') continue;
      const value = raw.replace(/\s+/g, ' ').trim();
      if (value.length < 2 || value.length > 200 || value.includes('{{') || out.includes(value)) continue;
      const at = firstNamed.get(foldValue(value)) ?? -1;
      if (at < 0 || at > ri) continue;
      const step = entries[at] as RecordedStep;
      if (!isMutatingAction(step.tool) || replaceToken(JSON.stringify(step.args).toLowerCase(), value.toLowerCase(), ' ') !== JSON.stringify(step.args).toLowerCase()) continue;
      // On the page it acted on, its url unchanged. A step that moved the
      // browser showed the records of the page it reached, not one it made:
      // fwrd85's sign-in click landed on the ticket list, where the seed
      // ticket RD-1014 appeared for the first time, and kanboard fwkb1's
      // click into the board (a query-string route, so no path changed)
      // showed the default columns "Backlog" and "Work in progress". A save
      // that navigates to its record is compile's url mint already.
      if (!step.diff?.url || step.diff.url !== actedUrl(entries, at)) continue;
      if (shownBefore(entries, at, value) || firstStatedAt(entries, value, at) >= 0) continue;
      // By buildFlow's own rule, case and all, so the reference this implies is
      // one the flow really threads: fwrd85's 07-edit said "both parts have
      // no supplier", which never made `{{03-open.supplier}}` of "No supplier".
      if (!entries.slice(ri + 1).some((e) => e.k === 'instruction' && replaceToken(e.text, value, ' ') !== e.text)) continue;
      out.push(value);
    }
  });
  return out;
}

/** The url the step at `at` acted on: the latest diffed or instruction url before it. */
function actedUrl(entries: readonly RecordedEntry[], at: number): string | undefined {
  for (let k = at - 1; k >= 0; k--) {
    const e = entries[k];
    if (e.k === 'step' && e.diff?.url) return e.diff.url;
    if (e.k === 'instruction' && e.url) return e.url;
  }
  return undefined;
}

/**
 * The folded element names a step's page change added (baselineOf's parse),
 * less an open popup's items: a listbox answering what was typed lists the
 * app's records, it makes none (odoo fwod28's `- option "[FURN_6666] Acoustic
 * Bloc Screens"`; execution/expect.ts popupItem).
 */
function addedNames(step: RecordedStep): string[] {
  const out: string[] = [];
  for (const line of step.diff?.added ?? []) {
    const m = /^- ([\w-]+) ("(?:[^"\\]|\\.)*")/.exec(line.trim());
    if (!m || popupItem(line)) continue;
    try {
      const name = foldValue(String(JSON.parse(m[2])));
      if (name) out.push(name);
    } catch {
      // an unparseable name is no evidence
    }
  }
  return out;
}

/** Whether a report before entry `at` carried `value` (case aside, whole token) in its summary or values. See taskConstants. */
function reportedBefore(entries: readonly RecordedEntry[], at: number, value: string): boolean {
  const lower = value.toLowerCase();
  const hit = (s: unknown): boolean => typeof s === 'string' && replaceToken(s.toLowerCase(), lower, ' ') !== s.toLowerCase();
  for (let k = 0; k < at; k++) {
    const e = entries[k];
    if (e.k === 'report' && (hit(e.summary) || Object.values(e.values ?? {}).some(hit))) return true;
  }
  return false;
}

/** The entry index of the earliest instruction before `end` that states `value` (case aside, whole token), or -1. */
function firstStatedAt(entries: readonly RecordedEntry[], value: string, end: number): number {
  const lower = value.toLowerCase();
  for (let k = 0; k < end; k++) {
    const e = entries[k];
    if (e.k === 'instruction' && replaceToken(e.text.toLowerCase(), lower, ' ') !== e.text.toLowerCase()) return k;
  }
  return -1;
}

/** Whether anything recorded before entry `at`, or `at`'s own start page, could have shown `value`. See statedBeforeShown. */
function shownBefore(entries: readonly RecordedEntry[], at: number, value: string): boolean {
  // replaceToken's boundary, the same rule that threads the value, with both
  // sides lowered so a page's "Save Dashboard" also counts as having shown it.
  const lower = value.toLowerCase();
  const hit = (s: unknown): boolean => typeof s === 'string' && replaceToken(s.toLowerCase(), lower, ' ') !== s.toLowerCase();
  const page = (e: RecordedInstruction): boolean => hit(e.startText) || hit(e.url);
  for (let k = 0; k < at; k++) {
    const e = entries[k];
    if (e.k === 'report' && (hit(e.summary) || Object.values(e.values ?? {}).some(hit))) return true;
    if (e.k === 'instruction' && page(e)) return true;
    if (e.k === 'step' && hit(JSON.stringify(e))) return true;
  }
  const own = entries[at];
  return own.k === 'instruction' && page(own);
}

/**
 * What the app was showing before this run changed anything: the entry index
 * of the first instruction that asks for a change (mutatingIntent), and the
 * folded values the recording saw up to that point — element names on the
 * start pages of every instruction up to and including that one, element
 * names a step's diff added before it, and the values reported or read back
 * before it. Null when no instruction asks for a change, so a flow that only
 * observes is never touched.
 *
 * WHY. buildFlow threads a value to the step that reported it. For a value the
 * run MADE that is the point: odoo's S00022 first appears after the create,
 * and only the reference ties a later "cancel S00022" to this run's order. But
 * a value the app showed before the run did anything is the app's baseline —
 * a seed record, a column, the app's own chrome — and the bench resets to that
 * baseline before every run, so it is the same on every run and a step after
 * the first change is not where it came from. kanboard fwkb35: 03-verify's
 * drag displaced the seed task '#1 Seed: triage inbox' (the step failed and
 * was adopted), 03-verify reported `task_1_title = "Seed: triage inbox"`, and
 * the repair instruction 04-report was exported as "the task
 * '#1 {{03-verify.task_1_title}}' was accidentally moved". 03-verify has no
 * procedure that reads that, so `spec` refused the flow (unsourced-ref), and
 * n2's model-first 03-verify reported the bench task under that name instead,
 * so 04-report's replay was told to "restore" '#1 fwkb35-n2 Bench Task'. The
 * title was on the board 02-create started on, before that create ran.
 * statedBeforeShown does not reach it: no instruction stated it before
 * 03-verify did.
 *
 * WHAT IT MUST NOT CATCH. A value first shown after the first change is the
 * run's own and stays threaded: odoo's order number, kanboard's task "#4",
 * a grafana uid. A value reported by a step BEFORE the first change stays
 * threaded to that step too (the producer must be at or after the boundary):
 * fwkb34's `{{02-open.board_column_work_in_progress}}` is read by a step that
 * changes nothing, and a later identical report never displaces the earlier
 * producer anyway (the earliest producer of a value wins in buildFlow).
 *
 * Deliberately narrower than shownBefore, because it acts in the direction
 * that is dangerous: a wrongly literal value makes every replay act on run
 * 1's record. So it takes a whole element NAME (valueLineCandidates' parse),
 * or a whole reported or read value, never a substring of page text: a record
 * id "22" inside a date on a list page is not the page showing record 22.
 */
function baselineOf(entries: readonly RecordedEntry[]): { at: number; names: Set<string> } | null {
  const at = entries.findIndex((e) => e.k === 'instruction' && mutatingIntent(e.text) !== null);
  if (at < 0) return null;
  const names = new Set<string>();
  const addLines = (lines: readonly string[] | undefined): void => {
    for (const line of lines ?? []) {
      const m = /^- ([\w-]+) ("(?:[^"\\]|\\.)*")/.exec(line.trim());
      if (!m) continue;
      try {
        const name = foldValue(String(JSON.parse(m[2])));
        if (name) names.add(name);
      } catch {
        // an unparseable name is no evidence
      }
    }
  };
  const addValue = (v: unknown): void => {
    if (typeof v === 'string' && foldValue(v)) names.add(foldValue(v));
  };
  for (let k = 0; k <= at; k++) {
    const e = entries[k];
    if (e.k === 'instruction') addLines(e.startText?.split('\n'));
    if (k === at) break;
    if (e.k === 'step') {
      addLines(e.diff?.added);
      addValue(e.result);
    } else if (e.k === 'report') Object.values(e.values ?? {}).forEach(addValue);
  }
  return { at, names };
}

interface Group {
  instruction: RecordedInstruction;
  report?: RecordedReport;
  /** Where the browser ended up after this instruction's last navigation. */
  endUrl?: string;
  /** How many state-changing tool steps this instruction ran. */
  mutations: number;
  /** Of those, how many carried a recorded page diff at all (learning mode). */
  mutationsDiffed: number;
  /**
   * Of the diffed ones, how many VISIBLY did something: new signature lines,
   * an alert, or a url away from where the instruction started. A mutating
   * step whose diff is empty on all three touched the app's controls and
   * moved nothing the recorder could see.
   */
  mutationsEffective: number;
  /** The tool of this instruction's first recorded step. */
  firstTool?: string;
  /** Set by resolveGroups: kept despite a non-success report — see there. */
  adopted?: boolean;
  /**
   * Set by resolveGroups on a non-success group that would have been adopted,
   * but whose successor put back what it did (undoneByNext): the successor,
   * dropped with it. unbankedMutations names the pair.
   */
  undoneBy?: Group;
  /** Every recorded page diff of this instruction's steps, in order (liveReadsFor reads the last page's). */
  diffs: StepDiff[];
  /** This instruction's state-changing steps, in order (reappliedByNext compares them). */
  acts: RecordedStep[];
  /** Every step this instruction recorded, reads included (usedByProcedure). */
  steps: RecordedStep[];
  /**
   * The daemon's ledger index for this instruction (`i3` → 3): one per
   * recorded instruction, a resume continuing its predecessor's. A skill
   * slot's origin (`url:i3:p1`) names it — see originRef.
   */
  ledgerIndex: number;
}

function groupByInstruction(entries: RecordedEntry[]): Group[] {
  const groups: Group[] = [];
  let ledgerIndex = 0;
  for (const e of entries) {
    if (e.k === 'instruction') {
      if (!e.resume) ledgerIndex += 1;
      // An escalation continuation (recorded under the original wording,
      // marked `resume`) is the same instruction still in flight: keep the
      // predecessor's group open so its clean start context survives and the
      // continuation's report/endUrl land on it. A resume with no same-text
      // predecessor (truncated recording) stands alone.
      const prev = groups[groups.length - 1];
      if (e.resume && prev?.instruction.text === e.text) continue;
      groups.push({ instruction: e, mutations: 0, mutationsDiffed: 0, mutationsEffective: 0, diffs: [], acts: [], steps: [], ledgerIndex: Math.max(1, ledgerIndex) });
    } else if (e.k === 'report' && groups.length) groups[groups.length - 1].report = e;
    else if (e.k === 'step' && groups.length) {
      const g = groups[groups.length - 1];
      g.steps.push(e);
      if (e.diff?.url) g.endUrl = e.diff.url;
      if (e.diff) g.diffs.push(e.diff);
      if (!g.firstTool) g.firstTool = e.tool;
      if (isMutatingAction(e.tool)) {
        g.mutations += 1;
        g.acts.push(e);
        if (e.diff) {
          g.mutationsDiffed += 1;
          const moved = Boolean(e.diff.url) && Boolean(g.instruction.url) && e.diff.url !== g.instruction.url;
          if (e.diff.added?.length || e.diff.alerts?.length || moved) g.mutationsEffective += 1;
        }
      }
    }
  }
  return groups;
}

/** Same page, ignoring query and hash — view state, not location. */
function samePage(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && decodeURIComponent(ua.pathname) === decodeURIComponent(ub.pathname);
  } catch {
    return false;
  }
}

/**
 * The groups that ARE the resolved path, in order.
 *
 * Success groups, obviously. But dropping every other group loses work the
 * session provably built on: fwgr14's "create a NEW dashboard. Add a Stat
 * panel..." blocked on the turn budget, then failed on escalation — yet both
 * attempts HAD created the dashboard, and the very next (successful)
 * instruction began "The browser is on an unsaved new Grafana dashboard..."
 * and saved it. The exported flow started on in-memory state no replay could
 * reach and scored 1/6 on every replay. Same class as fwod27, where the
 * dropped create meant no step produced the record and its id could not be
 * referencized.
 *
 * So a non-success group is ADOPTED when the recording itself testifies its
 * work is part of the path:
 *   1. it changed the app (ran mutating tools) — an observing group that
 *      blocked contributed nothing a replay needs;
 *   2. the next kept group picked up exactly where it left off — issued on
 *      the same page the group ended on, and not opening with a `goto`
 *      (a successor that navigates away first is the workaround case, where
 *      the drop is correct);
 *   3. the next group did not throw that work away and do it again
 *      (redidFromScratch) — the same workaround, reached by a click instead
 *      of a `goto`;
 *   4. the groups after it did not make its choices over again
 *      (reappliedByNext) — the same workaround, done in place;
 *   5. the next group did not UNDO it (undoneByNext) — then neither group is
 *      part of the path: the next is dropped with it.
 * Scanned right-to-left so a chain of continuations adopts as a chain.
 *
 * Marks `adopted` (or `undoneBy`) on the group (unbankedMutations reads both)
 * and returns the kept groups.
 */
function resolveGroups(groups: Group[]): Group[] {
  const kept = groups.map((g) => g.report?.status === 'success');
  for (let i = groups.length - 2; i >= 0; i--) {
    if (kept[i]) continue;
    const g = groups[i];
    const next = groups[i + 1];
    if (!g.report || !g.mutations || !kept[i + 1]) continue;
    if (next.firstTool === 'goto') continue;
    if (!samePage(g.endUrl, next.instruction.url)) continue;
    if (redidFromScratch(g, next)) continue;
    if (reappliedByNext(groups, kept, i)) continue;
    if (undoneByNext(groups, i)) {
      g.undoneBy = next;
      kept[i + 1] = false;
      continue;
    }
    g.adopted = true;
    kept[i] = true;
  }
  // An adopted group that reached no record, continued by a group that
  // started on the very page it left and reached one, was COMPLETED by that
  // group: the two are one step of the flow, not two. Kept as two, the
  // continuation became a step of its own, pinned to a procedure recorded
  // on the unsaved form — which every clean replay refuses as past its
  // start (rule G) once the adopted step's model-first replay saves the
  // record itself — while the adopted step's outputs were the failed
  // attempt's and the continuation's reference targets moved with it.
  // fwod69/70/71's create-quotation recording: the create blocked on a
  // configurator modal, the next instruction dismissed it, kept one line and
  // saved (S00021), and 02-create/03-open (then 03-create/04-open) split that
  // one piece of work between a model-first step and an unreplayable pin.
  // Merged, the adopted step owns the whole outcome — the continuation's
  // report values, end url and diffs — replays model-first, graduates into a
  // procedure that does all of it, and no rescue pin exists to refuse. The
  // continuation's own procedure is not carried: it is a way of finishing a
  // page the merged step no longer leaves behind. A continuation that
  // reached no record (a mere next task on the same page) is left as the
  // step it is, and an adopted group that reached its record on its own
  // (fwod27's shape) keeps its successor too — wherever in its steps it
  // reached it (fwgh1: saved, then went back to the list).
  //
  // "Completed" is read off where the continuation's url went: a rescue
  // saves the page it was given, so it lands the record before it leaves
  // that page's route (odoo's form gains `&id=21` in place; grafana's
  // /dashboard/new opens its settings view, then lands on /d/<uid>/…). A
  // next task that happens to make a record leaves first — fwod26's
  // blocked sign-in was followed by the create-contact instruction on the
  // page it left, which walked to Contacts before it saved contact 44 —
  // and is a step of its own.
  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i];
    if (!kept[i] || !g.adopted) continue;
    while (i < groups.length - 1) {
      const next = groups[i + 1];
      if (!kept[i + 1] || next.firstTool === 'goto') break;
      // Reached ANYWHERE in its own steps, not only where it ended: ghost
      // fwgh1-n1's blocked create went list → #/editor/post/<id> (the post
      // saved, id minted) → back to the list, and the next instruction — a
      // settings check that opened that post from the list — "landed" the
      // id only by opening it. Merged, 02-create owned the check's reads
      // (post_list_row, publish_time_in_list) with a procedure that never
      // returns to the list: unreported on every replay, and the check
      // never got a pin of its own.
      const reached = g.diffs.some((d) => landsRecord(g.instruction.url, d.url)) || landsRecord(g.instruction.url, g.endUrl);
      if (reached || !sameUrlState(g.endUrl, next.instruction.url) || !landedBeforeLeaving(next)) break;
      const values = { ...(g.report?.values ?? {}), ...(next.report?.values ?? {}) };
      const { skill: _skill, skillParams: _params, ...rest } = next.report ?? { status: 'success' as const, summary: '', values: {} };
      g.report = { ...rest, values } as Group['report'];
      g.endUrl = next.endUrl ?? g.endUrl;
      g.diffs.push(...next.diffs);
      g.acts.push(...next.acts);
      g.steps.push(...next.steps);
      g.mutations += next.mutations;
      g.mutationsDiffed += next.mutationsDiffed;
      g.mutationsEffective += next.mutationsEffective;
      kept[i + 1] = false;
      // The merged group now ends where its continuation did; a further
      // continuation of THAT is judged against the merged group.
      groups.splice(i + 1, 1);
      kept.splice(i + 1, 1);
    }
  }
  return groups.filter((_, i) => kept[i]);
}

/**
 * Whether going from `from` to `to` landed a record: a url part with a
 * minted shape (execution/url.ts mintedShape — an id, a uid, never a word)
 * that `from` did not carry at that position, or carried as a word. Odoo's
 * save turns `…&model=sale.order&view_type=form` into the same with
 * `&id=21`; a list-to-form navigation gains only `model` and `view_type`.
 * An app constant that looks minted and merely changes value (odoo's
 * `action=123` → `action=316`) is not a landing: both sides look minted.
 */
function landsRecord(from?: string, to?: string): boolean {
  if (!from || !to) return false;
  const before = new Map(urlParts(from).map((p) => [p.label, p.value]));
  return urlParts(to).some((p) => {
    if (!mintedShape(p.value)) return false;
    const was = before.get(p.label);
    return was === undefined || (was !== p.value && !mintedShape(was));
  });
}

/**
 * Whether this group's steps landed a record (landsRecord, from the url the
 * instruction was issued on) before any of them left that url's route
 * (sameRoute). View state on the same route — grafana's `?editview=settings`,
 * a hash key gained — is not leaving.
 */
function landedBeforeLeaving(g: Group): boolean {
  const from = g.instruction.url;
  if (!from) return false;
  for (const u of g.diffs.map((d) => d.url)) {
    if (!u || u === from) continue;
    if (landsRecord(from, u)) return true;
    if (!sameRoute(from, u)) return false;
  }
  return false;
}

/**
 * Whether `next`, issued on the unsaved page `g` left, discarded that page and
 * made the record again from a fresh copy of it: its steps left `g`'s end
 * page (a different route) without landing a record there, later came back to
 * the same page in its record-less state — every url part equal, minted-shape
 * values aside, and no part gained — and landed a record from THAT.
 *
 * fwod74's recording: 03-create blocked on a configurator modal with the
 * quotation form unsaved (`…model=sale.order&view_type=form`, no id); the
 * next instruction, issued on that form, was "Discard that unsaved draft …
 * Then create a NEW quotation from scratch" — Discard (→ `view_type=list`),
 * New (→ the form again, no id), Save (→ `&id=21`). Rule 2 saw only the
 * shared start page and adopted 03-create, so every replay ran it
 * model-first to the save its own instruction asks for (S00022/S00024) and
 * then 04-open made the order the recording actually kept (S00023/S00025):
 * two orders where the task asked for one, objectives 1/6 on both replays —
 * n3 at tier A with no model turn at all, once 03-create had graduated into
 * a pin that saves. The recording made ONE order; the blocked attempt was
 * superseded, exactly as when the successor opens with a `goto`.
 *
 * The fresh copy is what tells a redo from a continuation that merely left
 * and came back: a successor that opens the record the blocked group's work
 * became (a list row → `…&id=21`) never passes through the record-less form,
 * and one that lands the record in place is resolveGroups' merge. A group
 * that had already landed its record (fwod27) is not "unsaved" and is never
 * judged here.
 */
function redidFromScratch(g: Group, next: Group): boolean {
  const page = g.endUrl;
  if (!page || landsRecord(g.instruction.url, page)) return false;
  let left = false;
  let fresh: string | undefined;
  for (const u of next.diffs.map((d) => d.url)) {
    if (!u) continue;
    if (!left) {
      if (landsRecord(page, u)) return false;
      if (!sameRoute(page, u)) left = true;
      continue;
    }
    if (fresh && landsRecord(fresh, u) && sameRoute(page, u)) return true;
    if (sameRoute(page, u) && sameRoute(u, page)) fresh = u;
  }
  return false;
}

/**
 * Whether the kept groups after `groups[i]`, carrying on from the page it
 * ended on, made one of its CHOICES over again: the same in-place pick (a
 * click whose recorded diff shows nothing added, no alert and no move — a
 * menu item ticked, an option chosen, never an opener or a commit) or the
 * same value typed into the same field, on the same element. Then `groups[i]`
 * was superseded where it stood, as redidFromScratch's successor supersedes
 * it after leaving the page, and adopting it makes every replay do the work
 * twice.
 *
 * gitea fwgt1-n1: 03-set was to set two labels, an assignee and a milestone
 * from the issue sidebar's pickers; it ticked 'bug' (twice), never saw a
 * label applied, and reported failure on the page it started on. 04-set,
 * 05-set and 06-set then did labels, assignee and milestone one at a time,
 * and 04-set's first gesture was the same `link "bug"` pick. Adopted, 03-set
 * replayed model-first and applied all three; 04-set's pin then ticked 'bug'
 * and 'priority-high' again — these pickers TOGGLE — and 05-set's the
 * assignee: n2 and n3 ended with no labels and no assignee (5/7).
 *
 * Only a group that took the flow nowhere (it ended on the very page state
 * it started on), so the successors' start is reached without it: fwgr14's
 * create left /dashboard/new behind, fwod69's form, fwod27's record, and
 * their continuations saved that page rather than re-picking on it. The scan
 * stops at the first group that does not carry straight on (another page, a
 * `goto` first, a dropped group).
 */
function reappliedByNext(groups: readonly Group[], kept: readonly boolean[], i: number): boolean {
  const g = groups[i];
  if (!g.instruction.url || !sameUrlState(g.instruction.url, g.endUrl)) return false;
  const choices = g.acts.filter(isChoice);
  if (!choices.length) return false;
  for (let j = i + 1; j < groups.length; j++) {
    const h = groups[j];
    if (!kept[j] || h.firstTool === 'goto' || !samePage(g.endUrl, h.instruction.url)) break;
    if (h.acts.some((s) => isChoice(s) && choices.some((c) => sameChoice(c, s)))) return true;
  }
  return false;
}

/** A value-bearing gesture: a value entered, or a click that changed nothing visible around it (a pick, not an opener or a commit). */
function isChoice(s: RecordedStep): boolean {
  if (typeof choiceValue(s) === 'string') return true;
  if (s.tool !== 'click' || !s.diff) return false;
  return !s.diff.added?.length && !s.diff.alerts?.length;
}

function choiceValue(s: RecordedStep): string | undefined {
  if (s.tool !== 'fill' && s.tool !== 'select' && s.tool !== 'type') return undefined;
  const v = s.args.value ?? s.args.text ?? s.args.values;
  return v === undefined ? undefined : JSON.stringify(v);
}

/** The same gesture on the same element: same tool and value, and a shared way of naming the target that is not a position on the screen. */
function sameChoice(a: RecordedStep, b: RecordedStep): boolean {
  if (a.tool !== b.tool || choiceValue(a) !== choiceValue(b)) return false;
  const la = a.locators?.target;
  const lb = b.locators?.target;
  if (!la || !lb) return false;
  if (la.expr && la.expr === lb.expr) return true;
  const key = (c: LocatorCandidate): string | null => {
    if (c.kind === 'point') return null;
    const { nth: _nth, seen: _seen, ...name } = c;
    return JSON.stringify(name);
  };
  const ka = new Set((la.chain ?? []).map(key).filter((k): k is string => k !== null));
  return (lb.chain ?? []).some((c) => {
    const k = key(c);
    return k !== null && ka.has(k);
  });
}

/**
 * Whether the group after `groups[i]` UNDID it: the page `groups[i]` was
 * issued on reads exactly as it did before, the next time an instruction
 * starts there, right after the successor — so whatever the failed group
 * changed, its successor put back, and the two together changed nothing.
 *
 * kanboard fwkb35's recording: 03-verify was to move the run's task #4 to
 * "Work in progress"; its drag missed, displaced the SEED task #1 into
 * Backlog instead, and it reported failure. The orchestrator's next
 * instruction, issued on the task page 03-verify had wandered to, was a
 * repair — "move task #1 back to the 'Work in progress' column" — which
 * succeeded, and the one after it (05-set) moved #4 properly. Rule 2 adopted
 * 03-verify (it mutated, and the repair began where it ended), so the flow
 * carried a failed attempt with no procedure — `spec` warned the compiled
 * test throws there, and every replay ran it model-first (6-15 turns) —
 * followed by a repair with nothing to repair ("No repair was needed" on
 * n2). The recording's path is 01, 02, 05: the accident and its repair net
 * to nothing, so neither is a step. This is redidFromScratch's sibling: there
 * the successor discarded the work and did it again, here it reverses it.
 *
 * THE EVIDENCE is the page itself, before and after the pair. 03-verify
 * started on the board with #1 in Work in progress and #2-#4 in Backlog;
 * 05-set started on the same board url and saw the same board, line for
 * line. Both snapshots must be whole pages (startTextComplete, which only
 * dialect 2 records) at the same address, or they prove nothing. And the
 * successor must itself have acted and succeeded: a group that changed
 * nothing cannot have put anything back, and one that failed too is not a
 * reversal anyone saw finish.
 *
 * WHAT IT MUST NOT CATCH, each checked from the recording, not the wording:
 *  - a continuation (fwgr13/14/16, fwod20/27, fwod69-71's merge): its work
 *    shows on the page it was aimed at — a saved dashboard, an order id in
 *    the url — so the start page never reads the same again, or the next
 *    instruction starts somewhere else;
 *  - a pair that reached a record the run had not shown before it (an
 *    id-like url part absent from the page the failed group started on and
 *    from every earlier url): a record made and deleted, or
 *    made on a page the start page does not list, is not "nothing" even if
 *    the start page cannot tell. fwkb35's pair only reached task #1, whose
 *    `#1` card was on that board all along;
 *  - a pair whose report a later instruction quotes (a value no earlier
 *    report, instruction or the start page had): the author learned
 *    something from it that the rest of the flow is worded on, so it is not
 *    without trace. fwkb35's later wording reuses only values 01-open and
 *    02-create had already reported.
 * Anything short of that keeps today's adoption: a wrongly dropped step loses
 * the run's work silently, while a wrongly kept one is only slow.
 */
function undoneByNext(groups: readonly Group[], i: number): boolean {
  const g = groups[i];
  const next = groups[i + 1];
  const before = g.instruction;
  const after = groups[i + 2]?.instruction;
  if (!after || !next.mutations || next.report?.status !== 'success') return false;
  if (!before.startText || before.startText !== after.startText) return false;
  // Only a snapshot that SAYS whether it is whole: dialect-1 recordings wrote
  // no startTextComplete and cut the page at a smaller budget. fwod20's shows
  // why that matters: its cancel instructions started on a sales order under
  // one Cancel dialog and then under two stacked ones, and the two capped
  // snapshots of the form beneath read the same.
  if (before.startDialect !== 2 || after.startDialect !== 2) return false;
  if (before.startTextComplete === false || after.startTextComplete === false) return false;
  // The WHOLE address, query included: urlParts leaves the query out as view
  // state, and kanboard keeps every page in it (`?controller=…&task_id=1`), so
  // by urlParts alone its board and a task page are the same place.
  const address = (u: string): Map<string, string> =>
    new Map([...urlParts(u).map((p): [string, string] => [p.label, p.value]), ...[...(urlShapeOf(u)?.query ?? [])].map(([k, v]): [string, string] => [`?${k}`, v])]);
  const sameAddress = (a?: string, b?: string): boolean => {
    if (!samePage(a, b)) return false;
    const pa = address(a!);
    const pb = address(b!);
    return pa.size === pb.size && [...pa].every(([k, v]) => pb.get(k) === v);
  };
  if (!sameAddress(before.url, after.url)) return false;
  const has = (text: string | undefined, value: string): boolean => Boolean(text) && replaceToken(text!, value, ' ') !== text;
  const earlier = groups.slice(0, i);
  const urlsBefore = new Set(
    [...earlier.flatMap((h) => [h.instruction.url, ...h.diffs.map((d) => d.url)]), before.url]
      .filter((u): u is string => Boolean(u))
      .flatMap((u) => [...address(u).values()]),
  );
  const trail = [before.url, ...g.diffs.map((d) => d.url), next.instruction.url, ...next.diffs.map((d) => d.url)].filter((u): u is string => Boolean(u));
  // What landedParts counts, over the whole address, plus an id-like value
  // swapped for another at the same place (task_id=1 → task_id=9), which
  // landsRecord deliberately does not count as a landing (odoo's `action=`
  // changes that way between menus) but which here may be another record.
  for (let k = 1; k < trail.length; k++) {
    const was = address(trail[k - 1]);
    for (const [label, value] of address(trail[k])) {
      const prior = was.get(label);
      if (prior === value || !mintedShape(value)) continue;
      if (prior !== undefined && mintedShape(prior) && !/\d/.test(value)) continue;
      if (!urlsBefore.has(value) && !has(before.startText, value)) return false;
    }
  }
  const known = (v: string): boolean =>
    has(before.startText, v) ||
    has(before.text, v) ||
    earlier.some((h) => has(h.instruction.text, v) || Object.values(h.report?.values ?? {}).some((x) => typeof x === 'string' && foldValue(x) === foldValue(v)));
  const later = groups.slice(i + 2);
  for (const v of [...Object.values(g.report?.values ?? {}), ...Object.values(next.report?.values ?? {})]) {
    if (typeof v !== 'string' || v.length < 2 || known(v)) continue;
    if (later.some((h) => has(h.instruction.text, v))) return false;
  }
  return true;
}

/**
 * Still on the page `a` addressed: every part `a` carries is in `b` with the
 * same value, or both sides look minted (odoo's `action=315` → `action=287`
 * says nothing on its own; `model=sale.order` → `model=res.partner` does).
 * Parts `b` gains are view state, not a departure.
 */
function sameRoute(a: string, b: string): boolean {
  const to = new Map(urlParts(b).map((p) => [p.label, p.value]));
  return urlParts(a).every((p) => {
    const v = to.get(p.label);
    return v !== undefined && (v === p.value || (mintedShape(v) && mintedShape(p.value)));
  });
}

/** The same page in the same state: every addressable part equal (samePage ignores hash state, which is where odoo keeps the record). */
function sameUrlState(a?: string, b?: string): boolean {
  if (!samePage(a, b)) return false;
  const pa = urlParts(a!);
  const pb = urlParts(b!);
  return pa.length === pb.length && pa.every((p, i) => pb[i].label === p.label && pb[i].value === p.value);
}

/**
 * Verbs whose presence makes an instruction MUTATING BY INTENT — the caller
 * asked for the app to be different afterwards, not merely observed.
 */
const MUTATING_VERBS = [
  'create', 'add', 'delete', 'remove', 'cancel', 'confirm', 'change', 'update',
  'set', 'save', 'submit', 'move', 'archive', 'rename', 'upload',
];

/**
 * One verb, in the shapes an orchestrator actually writes it. Spelled out
 * rather than a `verb\w{0,4}` wildcard on purpose: the wildcard makes "set"
 * match "settings" and "settled", and every false verb here becomes a false
 * warning against a step that is fine.
 */
function verbForms(verb: string): string[] {
  const noE = verb.replace(/e$/, '');
  const last = verb[verb.length - 1];
  return [verb, `${verb}s`, `${verb}es`, `${verb}d`, `${verb}ed`, `${verb}ing`, `${noE}ing`, `${verb}${last}ed`, `${verb}${last}ing`];
}

const MUTATING_VERB_RE = new RegExp(`^(?:${MUTATING_VERBS.flatMap(verbForms).join('|')})$`, 'i');

/** A word that turns the verb after it into an instruction NOT to do the thing. */
const NEGATOR_RE = /^(?:not|never|no|without|cannot|don't|dont|doesn't|isn't|avoid|skip)$/i;

/**
 * An instruction that says, anywhere, that it changes nothing. fwod34's
 * 07-open and 09-change both do ("this is a read-only check", "Read-only
 * check, do not change anything") while both quote a mutating verb — 09's
 * step id is literally `09-change`. Cheap, exact, and it costs only warnings
 * we would rather not have made.
 *
 * A prohibition must be GLOBAL to count. fwod50's 04-open adds a second order
 * line and says "Do not modify the first line" — a scope for the change it is
 * making, not a claim that it makes none. Read as read-only, that step became
 * a "read-only check" whose recomputed tax (£205 over two lines) contradicted
 * 03-create's (£177 over one), and it could have adopted a read-only pin for
 * a step that writes.
 */
const READ_ONLY_RE = /read[- ]?only|do(?: not|n't|nt) (?:change|modify|edit|alter) (?:any|anything|the app|the record|the data|it\b)|without (?:chang|modify|edit)(?:\w*) (?:any|anything|the app|the record|the data|it\b)/i;

/**
 * The verb this instruction asks for, or null if it asks for nothing that
 * changes the app.
 *
 * Scans the opening of the instruction — where the orchestrator states the
 * job, before the how-to prose and the reporting boilerplate. The window is
 * WIDE (40 words) because real wording puts the ask late: fwod34's 08-open
 * spends nineteen words identifying the record ("The sales order S00021
 * (model sale.order, record id 21) is currently in 'Sales Order' status and
 * needs to be") before it says "cancelled". A wide window is safe only
 * because both guards above run first — a negated verb and a self-declared
 * read-only instruction are dropped whatever the window.
 */
export function mutatingIntent(instruction: string): string | null {
  if (READ_ONLY_RE.test(instruction)) return null;
  const words = instruction.split(/\s+/).slice(0, 40).map((w) => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, ''));
  for (let i = 0; i < words.length; i++) {
    if (!MUTATING_VERB_RE.test(words[i])) continue;
    if (words.slice(Math.max(0, i - 6), i).some((w) => NEGATOR_RE.test(w))) continue;
    const lower = words[i].toLowerCase();
    const verb = MUTATING_VERBS.find((v) => verbForms(v).some((f) => f === lower));
    if (verb) return verb;
  }
  return null;
}

/**
 * A value this instruction reported that the page was ALREADY showing before
 * it ran — the strongest single line of evidence that the step's outcome was
 * not the step's doing.
 *
 * Conservative by construction: single-line values only (a status bar's whole
 * multi-line text is never a fair substring test), at least three characters,
 * and an exact match against the pre-state snapshot. When nothing qualifies
 * the caller omits the clause rather than guessing.
 */
function alreadyShown(g: Group): string | null {
  const before = g.instruction.startText;
  if (!before) return null;
  for (const value of Object.values(g.report?.values ?? {})) {
    if (typeof value !== 'string') continue;
    const v = value.trim();
    if (v.length < 3 || v.includes('\n')) continue;
    if (before.includes(v)) return v;
  }
  return null;
}

/**
 * A step whose instruction asked for a change and whose recording shows none.
 *
 * This is the record-time half of the fwod34 08-open failure. The recording
 * orchestrator wrote an instruction to cancel an order a previous instruction
 * had already been told to cancel; the step reported success, and every later
 * replay halts there because the Cancel button its skill clicks does not
 * exist once the order is cancelled. Every fact needed to say "re-record
 * 08-open" was already in the recording at export time — this reads them.
 *
 * Two shapes count as "changed nothing", and both need the report to say
 * SUCCESS (a blocked or failed instruction is reported elsewhere, and its
 * emptiness is expected rather than suspicious):
 *
 *  1. the instruction ran no state-changing tool at all; or
 *  2. it ran them and NONE of them moved the page — no signature line added,
 *     no alert, no navigation. fwod34's 08-open is this one: five clicks and
 *     an Escape against a form whose cancel dialog the previous instruction
 *     had already left open, every diff empty on all three counts, while its
 *     five genuinely mutating siblings (02-create through 05-open) each show
 *     one to eighteen effective diffs.
 *
 * Shape 2 demands that diffs were being captured at all (`mutationsDiffed`),
 * so a recording made without them cannot be read as a flow of no-ops.
 *
 * Warn-level, and worded as a suspicion: the flow still exports. What it buys
 * is that whoever can cheaply re-record is told, and that the warning rides
 * on the flow (`Flow.warnings`) for compile to raise again later.
 */
function noopStepWarning(id: string, g: Group): string | null {
  if (g.report?.status !== 'success') return null;
  const verb = mutatingIntent(g.instruction.text);
  if (!verb) return null;
  const noAction = g.mutations === 0;
  const noEffect = g.mutations > 0 && g.mutationsDiffed > 0 && g.mutationsEffective === 0;
  if (!noAction && !noEffect) return null;
  const evidence = noAction
    ? 'the recording made no state-changing action'
    : `the recording's ${g.mutations} state-changing action${g.mutations === 1 ? '' : 's'} left the page unchanged`;
  const shown = alreadyShown(g);
  const clause = shown ? `, and the page already showed '${shown}' before it ran` : '';
  return `noop-step: ${id} changed nothing: its instruction asks to ${verb}, ${evidence}${clause}. The step may be redundant.`;
}

/**
 * A mutating step's report contradicted by the very next read-only step.
 *
 * fwod34's 06-open reported "Cancelled" for the sales order; 07-open, a
 * read-only step immediately after it, read the same order's status back as
 * "Sales Order" — the value the order carries whenever it is NOT cancelled.
 * Nothing in the flow said this out loud: compile just kept both facts and
 * let a much later step (08-open, told to cancel an order that was already
 * cancelled) take the blame. The contradiction is visible at export time —
 * this reads it directly off the two instructions' report values, the same
 * way `noopStepWarning` reads a step's own report against its own pre-state.
 *
 * Scope is deliberately narrow: `i` must be mutating by intent and report
 * success (a step that failed or was never asked to change anything cannot
 * be "contradicted" — there is nothing for the next read to disagree with),
 * and `j` must immediately follow `i` with no gap and be read-only by intent
 * (a second mutating step is expected to change what the first one did, so
 * comparing it would be noise, not a contradiction).
 *
 * Values are matched by label first (the natural case — the same field read
 * twice), falling back to any label pair where BOTH names look like a status
 * or state field, since an orchestrator's wording for the same field drifts
 * step to step ("order_status" vs "current_status"). Only the first line of
 * each value is compared: a status bar lists every reachable state on one
 * line each, so the first line is the CURRENT one and the rest is noise the
 * same way `alreadyShown` treats it. Containment either way counts as
 * agreement (a single-line report next to a status bar's fuller line, or a
 * value that reappeared verbatim, is not a contradiction) — only two first
 * lines that share nothing warrant a warning.
 */
function contradictionWarning(idI: string, gi: Group, idJ: string, gj: Group): string | null {
  if (gi.report?.status !== 'success') return null;
  if (!mutatingIntent(gi.instruction.text)) return null;
  if (mutatingIntent(gj.instruction.text)) return null;
  // The later group CHANGED something itself (a state-changing action with a
  // visible effect): a differing read is its own change, not a sign that the
  // earlier one did not land. snipeit fwsi3's checkout moved the asset from
  // "Ready to Deploy" to "Deployed", which is the checkout working.
  if (gj.mutationsEffective > 0) return null;
  const iValues = gi.report?.values ?? {};
  const jValues = gj.report?.values ?? {};
  for (const [label, jRaw] of Object.entries(jValues)) {
    if (typeof jRaw !== 'string') continue;
    let iLabel: string | undefined = typeof iValues[label] === 'string' ? label : undefined;
    if (!iLabel && /status|state/i.test(label)) {
      iLabel = Object.keys(iValues).find((k) => typeof iValues[k] === 'string' && /status|state/i.test(k));
    }
    if (!iLabel) continue;
    const iRaw = iValues[iLabel] as string;
    const jLine = jRaw.split('\n')[0].trim();
    const iLine = iRaw.split('\n')[0].trim();
    if (!jLine || !iLine) continue;
    // The LEADING value, not the narration after it: fwod47's 08-create read
    // "Cancelled (current checked state in the status bar; …)" right after
    // 07-open reported "Cancelled (status bar radio "Cancelled" is the checked
    // state; …)" — the same state, described in different words, flagged as a
    // contradiction because the tails share nothing.
    const lj = leadingValue(jLine);
    const li = leadingValue(iLine);
    if (!lj || !li) continue;
    if (lj.includes(li) || li.includes(lj)) continue;
    return `contradicted-step: ${idJ} read ${label} "${jLine}" right after ${idI} reported "${iLine}"; ${idI}'s change may not have landed and a later step may be retrying it. Re-record ${idI}.`;
  }
  return null;
}

/**
 * The value a reported line LEADS with, lower-cased and whitespace-normalised:
 * the text before a parenthetical, a dash-led aside, or a `;` clause the
 * recording model appends to explain where it saw the value. Not a colon:
 * "Status: Cancelled" leads with its label. A line with no such tail is its
 * own leading value.
 */
export function leadingValue(line: string): string {
  const cut = /\s*(?:\(|\[|\s[—–-]\s|;)/.exec(line);
  const lead = cut && cut.index > 0 ? line.slice(0, cut.index) : line;
  return lead.replace(/\s+/g, ' ').replace(/[.,]+$/, '').trim().toLowerCase();
}

/**
 * Instructions that CHANGED the app but did not report success AND were not
 * adopted, so their work contributed nothing to the flow.
 *
 * resolveGroups now adopts the fwgr13/fwgr14 shape (the next kept group
 * carried straight on from the blocked work), so what remains here is the
 * genuinely dropped case: mutating work the session abandoned or worked
 * around. That drop is right — but it must not be silent, because whether the
 * workaround actually replaced the work is a judgement only the person
 * reading the export can make.
 */
/**
 * Flow instructions that quote a DATABASE ID this recording minted.
 *
 * The one channel no leak guard reads is the instruction prose itself. In
 * fwod27 the recording-time orchestrator wrote "You are on an Odoo contact
 * form for res.partner id 44" — the id of the record ITS run created (in a
 * blocked instruction, so no flow step produces the value and nothing can be
 * referencized). Locator and navigation guards all passed; both replays
 * navigated to record 44, which the reset had deleted, and halted at step 2
 * with 0/6.
 *
 * Scans EVERY recorded url (blocked instructions included — that is where
 * fwod27's id was minted) for id-position parts, then flags any flow
 * instruction that still quotes one as a literal id. Warn-level: the flow
 * still exports, but the person who can re-record is told while it is cheap.
 */
export function staleInstructionIds(entries: RecordedEntry[], flow: Flow): string[] {
  const minted = new Set<string>();
  // And a path id a step's own action landed (pathDigitPart), by its path:
  // snipeit fwsi2's "at /hardware/4" is the same leak spelled as a route.
  const paths = new Set<string>();
  for (const e of entries) {
    const url = e.k === 'step' ? e.diff?.url : e.k === 'instruction' ? e.url : undefined;
    if (!url) continue;
    for (const part of urlParts(url)) {
      if (idPositionPart(part)) minted.add(part.value);
      if (e.k === 'step' && e.tool !== 'goto' && e.tool !== 'back' && pathDigitPart(part)) {
        const path = pathTo(url, part.label);
        if (path) paths.add(path);
      }
    }
  }
  if (!minted.size && !paths.size) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const step of flow.steps) {
    for (const path of paths) {
      if (replaceAtPath(step.instruction, path, '') === step.instruction || seen.has(`${step.id}:${path}`)) continue;
      seen.add(`${step.id}:${path}`);
      out.push(
        `${step.id}'s instruction quotes ${path} — a record path this recording's own action landed on, so every replay ` +
          `will act on the RECORDING run's record (deleted by the next reset). Re-record with instructions that ` +
          `name records by what is on screen (a name or reference), never by internal id.`,
      );
    }
    for (const m of step.instruction.matchAll(/\bid\s*[:#]?\s*(\d{1,10})\b/gi)) {
      if (!minted.has(m[1]) || seen.has(`${step.id}:${m[1]}`)) continue;
      seen.add(`${step.id}:${m[1]}`);
      out.push(
        `${step.id}'s instruction quotes record id ${m[1]} — a database id this recording minted, so every replay ` +
          `will act on the RECORDING run's record (deleted by the next reset). Re-record with instructions that ` +
          `name records by what is on screen (a name or reference), never by internal id.`,
      );
    }
  }
  return out;
}

export function unbankedMutations(entries: RecordedEntry[]): string[] {
  const groups = groupByInstruction(entries);
  resolveGroups(groups); // marks `adopted` in place
  const out: string[] = [];
  const quote = (text: string): string => `"${text.slice(0, 70)}${text.length > 70 ? '…' : ''}"`;
  for (const g of groups) {
    if (g.report?.status === 'success' || g.adopted || !g.mutations) continue;
    const text = g.instruction.text;
    // The pair undoneByNext drops: the successor reported success, so this is
    // the only place its absence from the flow is said.
    if (g.undoneBy) {
      out.push(
        `instruction ${quote(text)} ran ${g.mutations} state-changing step(s) and reported ${g.report!.status}; ` +
          `the next instruction ${quote(g.undoneBy.instruction.text)} put back what it changed (the page it started on ` +
          `read the same afterwards) — the pair nets to nothing, so NEITHER is in the flow`,
      );
      continue;
    }
    out.push(
      `instruction "${text.slice(0, 70)}${text.length > 70 ? '…' : ''}" ran ${g.mutations} state-changing step(s) ` +
        `but reported ${g.report ? g.report.status : 'nothing'} — its work is NOT in the flow`,
    );
  }
  return out;
}

function stepId(text: string, i: number): string {
  const verb = (/\b(sign in|log ?in|create|add|edit|change|set|delete|remove|archive|open|verify|find|report)\b/i.exec(text)?.[1] ?? 'step')
    .toLowerCase()
    .replace(/\s+/g, '');
  return `${String(i + 1).padStart(2, '0')}-${verb}`;
}

/**
 * Whether `text` names `value` ONLY as one of a set of alternatives: every
 * whole-token occurrence (replaceToken's rule, case and all) stands directly
 * beside a disjunction — `X or Y`, `X nor Y`, `X and/or Y`, `either X` —
 * with nothing but a quote between. False when the text never names it.
 *
 * repairdesk fwrd86: 06-delete was told to archive "satisfying any
 * preconditions such as requiring a Draft or Closed status first". 01-signin
 * had reported `ticket_status = "Draft"`, so the export threaded the word to
 * `{{01-signin.ticket_status}}`, in the instruction and as param v6. The
 * sentence names the statuses the app accepts, not this ticket's status: had
 * 01-signin's ticket been created Ready, the instruction would have read
 * "requiring a Ready or Closed status".
 *
 * The wording decides, never the value's characters. It is only a veto on
 * threading, and usedByProcedure lifts it: a step that typed the value or
 * found an element by it took the value as data, alternative or not.
 */
function namedAsAlternative(text: string, value: string): boolean {
  if (value.length < 2) return false;
  const marked = replaceToken(text, value, '\u0000');
  if (marked === text) return false;
  const parts = marked.split('\u0000');
  for (let i = 0; i < parts.length - 1; i++) {
    const before = parts[i];
    const after = parts[i + 1];
    const orAfter = /^['"‘’“”]?\s+(or|nor|and\/or)\s/i.test(after);
    const orBefore = /\s(or|nor|and\/or|either)\s+['"‘’“”]?$/i.test(before) || /^(either)\s+['"‘’“”]?$/i.test(before);
    if (!orAfter && !orBefore) return false;
  }
  return true;
}

/**
 * Whether this instruction's recorded procedure took `value` as data: a step
 * typed it (any string arg) or found an element by it (a locator candidate
 * carrying it). What a page change or a read merely showed does not count —
 * fwrd86 06-delete's return to the list showed seed rows in status "Draft"
 * without the procedure touching one.
 */
function usedByProcedure(g: Group, value: string): boolean {
  return g.steps.some((s) => {
    const used = JSON.stringify([s.args, Object.values(s.locators ?? {}).map((l) => l.chain ?? [])]);
    return replaceToken(used, value, '\u0000') !== used;
  });
}

/**
 * Replace a value on token boundaries — the product's one boundary rule,
 * shape.ts `tokenPattern`.
 *
 * A word must stand alone: fwgr8 reported `tags: "bench"` beside the slug
 * `fwgr8-n1-bench-dashboard`, and four later steps had their url rewritten to
 * `{{runid}}-{{04-open.tags}}-dashboard` — a coincidence of one run that cost
 * every one of them the zero-model path. Likewise "form" inside
 * `o_form_view_group` (fwod5). A numeric value splits on '-' and '_', because
 * a runid prefix in `x7-bench-dashboard` IS worth threading.
 */
export function replaceToken(text: string, value: string, marker: string): string {
  if (!value) return text;
  const re = tokenPattern(value, 'g');
  // Never substitute INSIDE a reference already placed by an earlier pass: a
  // provenance value that happens to be a common word ("form") rewrote the
  // middle of an output NAME, and fwod5 shipped steps referencing
  // `{{02-create.o_{{01-open.url.q.view_type}}_view_o_group_tabl}}` — a ref
  // that can never resolve. Split on markers, rewrite only the gaps.
  return text
    .split(/(\{\{[^{}]*\}\})/g)
    .map((piece) => (piece.startsWith('{{') && piece.endsWith('}}') ? piece : piece.replace(re, marker)))
    .join('');
}

/**
 * Name the cause of a flow step's recovery, for the progress line and drift
 * telemetry. ALL causes now run cheap-first with the strong model as
 * escalation-on-blocked: the fwrd4l sweep showed the session model rescuing
 * every recovery — replay-failed ones included — at a fraction of the strong
 * model's rate ($0.041 warm vs $0.104 when the same steps routed straight to
 * the strong tier), and a replay refusal is usually a binding problem (a
 * stale template), not the genuine drift the straight-to-strong route was
 * priced for. The strong model is still one blocked report away.
 */
export function recoveryRoute(
  step: Pick<FlowStep, 'skill' | 'adopted'>,
  unresolved: boolean,
): { easy: boolean; cause: 'no-skill' | 'unthreaded-ref' | 'replay-failed' | 'adopted' } {
  if (step.adopted && !step.skill) return { easy: true, cause: 'adopted' };
  if (!step.skill) return { easy: true, cause: 'no-skill' };
  if (unresolved) return { easy: true, cause: 'unthreaded-ref' };
  return { easy: true, cause: 'replay-failed' };
}

/**
 * Export-time reference lint (PLAN-no-skill-steps case 4a): find every
 * `{{stepId.output}}` reference whose producing step cannot re-publish the
 * value deterministically on replay, and say so while the author can still do
 * something about it. `url` and its `url.*` parts are exempt — every replay re-binds them
 * from where its own browser lands. `publishes` answers, for a skill id, which
 * output names a tier-A replay re-observes (labelled reads + param-derived
 * report values); null when the skill is not in the store. Advisory only:
 * replay behaviour is unchanged — an unthreaded ref already routes to cheap
 * recovery — this surfaces the debt at build time instead of replay time.
 *
 * `actsOn` splits that one voice in two, and the split is the whole point.
 * A dead reference the consuming step merely QUOTES costs a recovery turn.
 * A dead reference the consuming step's PROCEDURE types or locates by is
 * fatal: `spec` refuses the whole artifact for it (emit.ts `unsourced-ref`).
 * Both were warned about in identical words, so on every one of the five
 * published branches that hit this the fatal one sat unremarked among the
 * harmless ones — fwod60's export warned about `{{02-create.product_name}}`,
 * `{{02-create.quantity}}` and `{{02-create.unit_price}}` in one breath, and
 * only the first two refused the compile. The export is the last moment the
 * session is live and re-recording is cheap; a warning that does not say
 * "this one costs you the artifact" is not information anyone can act on.
 *
 * The question is `ignorableRefs`', asked the other way round, and the caller
 * answers it — this file must not reach into the skill store. Omitted, every
 * dead reference keeps the advisory wording, which is what every caller did
 * before and what a caller with no store (bench/rebuild-flow.mjs) still does.
 */
export function lintFlowRefs(
  flow: Flow,
  publishes: (skillId: string) => string[] | null,
  actsOn?: (step: FlowStep, ref: string) => boolean,
): string[] {
  const byId = new Map(flow.steps.map((s) => [s.id, s]));
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const step of flow.steps) {
    const texts = [step.instruction, ...Object.values(step.params ?? {})];
    for (const text of texts) {
      for (const m of text.matchAll(/\{\{([\w-]+)\.([\w.#-]+)\}\}/g)) {
        const [, sid, out] = m;
        if (out === 'url' || out.startsWith('url.')) continue;
        const producer = byId.get(sid);
        if (!producer || seen.has(`${sid}.${out}`)) continue;
        seen.add(`${sid}.${out}`);
        const pubs = producer.skill ? publishes(producer.skill) : [];
        // A JSON-path ref (`body#dashboard.uid`) lives or dies with the read
        // that publishes `body`; the path itself is applied after the fact.
        if (pubs === null || pubs.includes(out.split('#')[0])) continue;
        warnings.push(
          actsOn?.(step, `${sid}.${out}`)
            ? `{{${sid}.${out}}} (used by ${step.id}) can only be re-observed by model recovery, ` +
              `and ${step.id}'s procedure types or locates by it — so \`sitelooper spec\` will REFUSE ` +
              `to compile this flow (unsourced-ref) until ${sid} reads ${out} from an element. ` +
              `Re-record ${sid} now, while this session is still open.`
            : `{{${sid}.${out}}} (used by ${step.id}) can only be re-observed by model recovery — ` +
              `consider re-recording so the value is read from the page.`,
        );
      }
    }
  }
  return warnings;
}

/**
 * What a step banks for later steps' `{{step.output}}` references: its
 * confident values, then every other value its zero-model replay read live —
 * echoes included. A read of what the procedure itself typed or clicked
 * proves the control, not persistence, so the REPORT leaves it out; but it is
 * the page's own word for that control, which is exactly what a later step
 * that clicks it by name needs, and the compiled artifact resolves the same
 * reference from it (emit.ts echoRead). fwkb27 05-open fell back on both
 * replays with `unresolved reference(s): 04-open.sidebar_menu_edit_the_task`
 * — a link 04-open had clicked and then read, standing on the page — because
 * the daemon banked only the confident set. A value still carrying a marker
 * is not a value (see the caller's rule for confident values) and stays out.
 */
export function referencableOutputs(confident: Record<string, string>, published?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...confident };
  for (const [k, v] of Object.entries(published ?? {})) {
    if (!(k in out) && typeof v === 'string' && !/\{\{/.test(v)) out[k] = v;
  }
  return out;
}

/** A read the export adds so a zero-model replay republishes an output a later step references. */
export interface LiveRead {
  /** The flow step whose output this read republishes. */
  stepId: string;
  /** That step's pinned skill; the caller appends the read to the LAST segment of its chain. */
  skill: string;
  output: string;
  /**
   * The value the recording REPORTED. The read's locators look for the name as
   * the PAGE spells it, which is the same string up to foldValue and may differ
   * in case (grafana reported "bench" for a folder rendered "Bench").
   */
  value: string;
  /** Where the recording showed it: the next instruction's start page, or this instruction's own page diffs. */
  source: 'start' | 'diff';
  read: SkillStep;
}

/** Roles whose accessible name is a label, not the text they show — a textbox named "Status" holds some other value. */
const LABELLED_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'listbox', 'option', 'checkbox', 'radio', 'switch']);

/** Roles tried first when several lines name the value: they SHOW it rather than act on it. */
const DISPLAY_ROLES = ['heading', 'columnheader', 'rowheader', 'cell', 'status'];

/**
 * Roles a snapshot line names that `page.getByRole` does NOT resolve to the
 * same elements — so a candidate naming one can never be the read it claims.
 *
 * A dialect-2 line's role token is NOT an ARIA role. The lines come from this
 * project's own DOM walk (`observeDocumentInPage`, execution/snapshot.ts), whose
 * `roleOf` is a small tag→role map, while `getByRole` asks the browser for the
 * element's computed role. The map agrees with the browser everywhere except
 * `src/execution/snapshot.ts:166`, which returns `cell` for BOTH `<td>` and
 * `<th>`, and `:167`, which returns `row` for every `<tr>`:
 *  - a `<th>` in a `<thead><tr>` computes as `columnheader` (`rowheader` with
 *    `scope="row"`), so `getByRole('cell', …)` matches it never. Measured in
 *    Chromium on kanboard's board markup: `getByRole('cell', { name: 'Work in
 *    progress', exact: true })` → 0 elements, and Playwright's own aria
 *    snapshot of the same `<thead>` reads `columnheader "0 Work in progress"`.
 *  - inside a `role="presentation"` table — odoo's totals block, and most
 *    layout tables — a `<td>`/`<tr>` has no role at all, so both tokens match
 *    nothing. Measured: 0 for `cell`/`Total` and `row`/`Total`.
 * Those two tokens are exactly the five misses round 17 filed: kanboard's three
 * `getByRole('cell', …)` column headers (fwkb20 n2/n3 drift) and odoo's four
 * `getByRole('row', { name: 'Total £ 1,188.00' … })` totals (fwod58 n2 drift),
 * every one of them `fallbackUsed: null`.
 *
 * Every OTHER token a line can carry is safe on the role axis: an explicit
 * `role=` attribute is passed through verbatim by the walk and read verbatim by
 * `getByRole` (this is the only way `columnheader`/`rowheader`/`status` can
 * appear in a line at all), and the remaining derived roles — `link` (`a[href]`),
 * `button`, `heading`, `dialog` — map 1:1. The rest of the map produces
 * LABELLED_ROLES, which are refused above for a different reason.
 *
 * The name axis has no such guarantee and cannot get one here: the walk names a
 * node `aria-label || aria-labelledby || alt || title || innerText` while ARIA
 * computes `aria-labelledby > aria-label > contents > title`, and nothing at
 * export time can run the browser's algorithm. That is stated, not fixed — see
 * liveReadsFor.
 */
const UNROUNDTRIPPED_ROLES = new Set(['cell', 'row']);

/** Most candidates one synthesized read carries. */
const MAX_LIVE_READ_CANDIDATES = 3;

/**
 * The form two DISPLAYED strings are compared in when the question is "are
 * these the same value?": whitespace collapsed, trimmed, case folded.
 *
 * This is normalisation of two strings compared for IDENTITY, not a guess
 * about what a string means — nothing here reads a value's characters to
 * decide what kind of thing it is (that rule lives in shape.ts, fenced by
 * test/shape-gate.test.ts). An app renders a value in whatever case it likes:
 * grafana's 02-open reported `folder = "bench"` where the page shows "Bench",
 * the exact comparison refused it, no read was synthesized, and that one value
 * was the whole of the compiled arm's refusal
 * (`05-open: slot v3 is bound to {{02-open.folder}}, and nothing has ever
 * published folder`).
 *
 * ONE exported spelling, because record time (recorder.ts captureReadBack) and
 * export time (valueLineCandidates) must agree about what counts as the same
 * value: two subtly different predicates would pin at one site and refuse at
 * the other.
 */
export function foldValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when two displayed strings are the same value — see foldValue for the folding and why. */
export function sameValue(a: string, b: string): boolean {
  return foldValue(a) === foldValue(b);
}

/**
 * Role+name candidates for the snapshot lines whose accessible NAME is the
 * value under foldValue (so a page's "Bench" answers for a reported "bench");
 * never a substring of a longer name, so "Ready" does not match "Mark Ready"
 * — the same bounded rule as identityRe.
 *
 * A role+name that occurs more than once in the lines is left out: a candidate
 * without `nth` must resolve to one element at replay (an ambiguous one with no
 * `nth` is a hard miss — execution/resolve.ts:349 — indistinguishable at the
 * drift ticket from an absent one), and an index guessed from line order is a
 * position, which is what a read must not publish by.
 *
 * The SAME fold is applied on both sides, and it cuts both ways — the comment
 * here used to claim folding "may only ever make a candidate set smaller",
 * which is true of the counting arm and false of the filter arm:
 *  - the filter (`foldValue(c.name) === want`) WIDENS the match, deliberately:
 *    a page rendering "Bench" answers for a run that reported "bench" (fwgr48),
 *    where an exact comparison matched nothing at all;
 *  - the count keys on the folded name, which NARROWS what survives: two lines
 *    differing only in case collapse to one key with count 2 and both are
 *    refused.
 * One fold on both sides is what makes that safe: a candidate that matches can
 * never be one of two the fold made indistinguishable. Behaviour is unchanged
 * by this correction.
 *
 * What the lines CANNOT establish is uniqueness on the page — they are a capped
 * look, and the count here is an absence claim over them. liveReadsFor gates on
 * that; see there.
 *
 * The candidate carries the PAGE's spelling of the name: the locator has to
 * find what the page renders, not what the run happened to report.
 */
export function valueLineCandidates(lines: string[], value: string): LocatorCandidate[] {
  const want = foldValue(value);
  if (!want) return [];
  const seen = new Map<string, { role: string; name: string; count: number; order: number }>();
  lines.forEach((line, order) => {
    const m = /^- ([\w-]+) ("(?:[^"\\]|\\.)*")/.exec(line.trim());
    if (!m) return;
    let name: string;
    try {
      name = String(JSON.parse(m[2])).replace(/\s+/g, ' ').trim();
    } catch {
      return;
    }
    const key = `${m[1]}\u0000${foldValue(name)}`;
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else seen.set(key, { role: m[1], name, count: 1, order });
  });
  const rank = (role: string): number => {
    const i = DISPLAY_ROLES.indexOf(role);
    return i < 0 ? DISPLAY_ROLES.length : i;
  };
  return [...seen.values()]
    .filter((c) => foldValue(c.name) === want && c.count === 1 && !LABELLED_ROLES.has(c.role) && !UNROUNDTRIPPED_ROLES.has(c.role))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.order - b.order)
    .slice(0, MAX_LIVE_READ_CANDIDATES)
    .map((c) => ({ kind: 'role' as const, role: c.role, name: c.name }));
}

/**
 * Reads that give every `{{step.output}}` reference a live source.
 *
 * A flow may only depend on values some replay reads live. buildFlow
 * references every reported value (see there for why), so a value the
 * recording model REPORTED from a snapshot, without any read the compiler
 * could pin, becomes a reference no replay publishes: fwkb8's 01-open reported
 * `column_3_name = "Work in progress"`, its skill had no read for it, and
 * 03-change went to recovery on every replay with nothing that could ever
 * correct it — cross-run evidence needs a second run to produce the value.
 *
 * The page the producing instruction ENDED on is the page the next instruction
 * STARTED on, so its `startText` is where the recording showed the value; the
 * producing instruction's own diffs on its final url are the fallback. A read
 * is proposed for a line whose accessible name is exactly the value.
 *
 * What such a read is worth, honestly: it is located BY the value. For app
 * furniture — a column name, a status word — that is exactly right, and it
 * republishes the constant every run. For a value that varies it can only
 * ever find the recording's value, so it misses (the read is skipped, the
 * value comes back absent, recovery runs as before) — or, where the old value
 * is still on the page, echoes it until a run reports a different value and
 * dead-read retirement (dropDeadReadLocators, keyed by the read's label and
 * the step's recorded value) strips the candidates. It never makes a
 * reference worse than unresolved for longer than that.
 *
 * Which is why a value the RUN is known to have made gets no read at all
 * (`runValue`, from the ledger's provenance — never from the value's
 * characters). A read located by a record's own id publishes the recording's
 * id wherever that record is still listed, a tier-A replay then AGREES with
 * the recording, and nothing ever retires it: fwkb3's `task_id "#4"` sat on
 * the board as `link "#4"`. Leaving the reference unresolved costs recovery
 * a turn; the read would have cost the right record.
 *
 * Pure: the caller decides which skills it may rewrite and persists.
 */
export function liveReadsFor(
  entries: RecordedEntry[],
  flow: Flow,
  publishes: (skillId: string) => string[] | null,
  runValue?: (value: string) => boolean,
): LiveRead[] {
  const groups = groupByInstruction(entries);
  const kept = resolveGroups(groups);
  const byId = new Map(flow.steps.map((s, i) => [s.id, i]));
  const out: LiveRead[] = [];
  const done = new Set<string>();
  // Referenced outputs first, then every DATA output a step declares, so a
  // value reported only to the caller gets a live source too: fwod47's
  // 02-create declared line_subtotal and untaxed_amount, no later step quoted
  // them, and every tier-A replay listed them `unreported`. What finds no
  // source here is pruned from the flow instead (pruneUnsourcedOutputs).
  const targets: [string, string][] = [];
  for (const step of flow.steps) {
    for (const text of [step.instruction, ...Object.values(step.params ?? {})]) {
      for (const m of text.matchAll(/\{\{([\w-]+)\.([\w.#-]+)\}\}/g)) targets.push([m[1], m[2]]);
    }
  }
  for (const step of flow.steps) {
    // An adopted step replays model-first: the model reports its values.
    if (!step.skill || step.adopted) continue;
    for (const output of step.outputs) if (heldOutput(step, output)) targets.push([step.id, output]);
  }
  for (const [sid, output] of targets) {
    // Url parts are re-bound from every replay's landing; a JSON path's
    // body is a response, not a line on the page.
    if (output === 'url' || output.startsWith('url.') || output.includes('#')) continue;
    const key = `${sid}.${output}`;
    if (done.has(key)) continue;
    done.add(key);
    const index = byId.get(sid);
    const producer = index === undefined ? undefined : flow.steps[index];
    const g = index === undefined ? undefined : kept[index];
    if (!producer?.skill || !g || stepId(g.instruction.text, index!) !== sid) continue;
    const pubs = publishes(producer.skill);
    if (pubs === null || pubs.includes(output)) continue;
    const raw = producer.recorded?.[output];
    if (typeof raw !== 'string' || raw.includes('\n')) continue;
    const value = raw.replace(/\s+/g, ' ').trim();
    // captureReadBack's bounds: too short to be distinctive, or prose.
    if (value.length < 2 || value.length > 80 || runValue?.(value)) continue;
    const next = groups[groups.indexOf(g) + 1];
    // Only a COMPLETE look at the start page may source a candidate. The
    // candidate's worth rests on valueLineCandidates' uniqueness test, and
    // uniqueness is an absence claim — "no second element carries this
    // role+name" — which a startText cut at its budget (loop.ts
    // START_TEXT_BUDGET, 8000 chars) or taken by a look that could not cover
    // the page has not shown. Same rule, same reason, as deriveGoal
    // (compile.ts: `startTextComplete === false` derives no goal), and the cost
    // of getting it wrong is the same either way: an ambiguous locator with no
    // `nth` misses exactly like an absent one (execution/resolve.ts:349), the
    // read publishes nothing, and two replays spend themselves retiring it.
    const startLines =
      next?.instruction.startText &&
      next.instruction.startTextComplete !== false &&
      !(g.endUrl && next.instruction.url && !samePage(g.endUrl, next.instruction.url))
        ? next.instruction.startText.split('\n')
        : [];
    let source: LiveRead['source'] = 'start';
    let candidates = valueLineCandidates(startLines, value);
    if (!candidates.length) {
      // Only diffs taken on the page the instruction ended on: the read is
      // appended there, and a line an earlier page showed is not on it.
      //
      // KNOWN WEAKER THAN THE START ARM, and left alone deliberately: `added`
      // lines are what CHANGED, so uniqueness within them cannot see a second
      // element that was on the page all along, and there is no
      // `startTextComplete` equivalent to gate on. No round-17 miss came from
      // this arm, so it is reported rather than narrowed on a guess — narrowing
      // it would remove the only source for a value that never appears on a
      // later instruction's start page.
      const finalUrl = g.diffs.length ? g.diffs[g.diffs.length - 1].url : undefined;
      const added = g.diffs.filter((d) => d.url === finalUrl).flatMap((d) => d.added ?? []);
      candidates = valueLineCandidates(added, value);
      source = 'diff';
    }
    if (!candidates.length) continue;
    out.push({
      stepId: sid,
      skill: producer.skill,
      output,
      value,
      source,
      // `unproven`: this read was synthesized here, from the characters of the
      // value the recording model reported, and no run has ever resolved it.
      // The mark travels with the step so the fact can be acted on later
      // without anyone having to re-derive it from `@synth` or from what the
      // locator looks like (SkillStep.unproven; fwkb14, fwod52).
      read: { tool: 'read', args: { target: '@synth', what: 'text' }, locators: { target: candidates }, label: output, unproven: true },
    });
  }
  return out;
}

/**
 * liveReadsFor's counterpart for a skill a RECOVERY compiled and a flow step
 * now pins (the flow runner's re-pin, not the export).
 *
 * A recovery's model reports its values the way a recording's does — from a
 * snapshot as often as from a read — and the skill compiled from it carries
 * only the reads the model actually issued. fwod71-n2's 03-create recovery
 * chose '[FURN_6666] Acoustic Bloc Screens' from the product dropdown,
 * reported `product_name` from the page, never read it, and graduated into
 * the pin; n3 replayed all 21 steps at tier A, published no product_name,
 * and 04-open and 06-open went to recovery on an unresolved reference while
 * the compiled artifact refused the flow (unsourced-ref). The export would
 * have given the recording's skill a synthesized read for exactly this case;
 * a graduated recovery met no such rule.
 *
 * The inputs are this run's, not the recording's: `reported` is what the
 * recovery reported (the value a later step will reference on THIS run), and
 * `pageLines` is the page the recovery ended on — the page the next step
 * starts on, taken by the caller after the step. Same bounds and the same
 * uniqueness test as liveReadsFor (valueLineCandidates), the same `unproven`
 * mark, and the same refusal of a value the run is known to have made.
 * Outputs a LATER step references only: a step's own instruction referencing
 * its own output is a recording artefact, not a dependency. Pure.
 */
export function liveReadsForRecovery(
  flow: Flow,
  stepId: string,
  skillId: string,
  reported: Record<string, string>,
  pageLines: string[],
  publishes: (skillId: string) => string[] | null,
  runValue?: (value: string) => boolean,
): LiveRead[] {
  const index = flow.steps.findIndex((s) => s.id === stepId);
  if (index < 0) return [];
  const pubs = publishes(skillId);
  if (pubs === null) return [];
  const referenced: string[] = [];
  for (const later of flow.steps.slice(index + 1)) {
    for (const text of [later.instruction, ...Object.values(later.params ?? {})]) {
      for (const m of text.matchAll(/\{\{([\w-]+)\.([\w.#-]+)\}\}/g)) {
        if (m[1] === stepId && !referenced.includes(m[2])) referenced.push(m[2]);
      }
    }
  }
  const out: LiveRead[] = [];
  for (const output of referenced) {
    if (output === 'url' || output.startsWith('url.') || output.includes('#')) continue;
    if (pubs.includes(output)) continue;
    const raw = reported[output];
    if (typeof raw !== 'string' || raw.includes('\n')) continue;
    const value = raw.replace(/\s+/g, ' ').trim();
    if (value.length < 2 || value.length > 80 || runValue?.(value)) continue;
    const candidates = valueLineCandidates(pageLines, value);
    if (!candidates.length) continue;
    out.push({
      stepId,
      skill: skillId,
      output,
      value,
      source: 'start',
      read: { tool: 'read', args: { target: '@synth', what: 'text' }, locators: { target: candidates }, label: output, unproven: true },
    });
  }
  return out;
}

/**
 * Drop, from each pinned step's declared outputs, the DATA outputs (heldOutput)
 * its skill chain still does not publish once the export's synthesized reads
 * are in — so a flow never advertises a value its zero-model replay cannot
 * produce. fwod47's n2/n3 replays ran 02-create, 05-change and 08-create at
 * tier A with 0 turns and every one listed real data (untaxed_amount, total …)
 * as `unreported`: the flow promised values nothing would ever read.
 *
 * Kept: an output any step references (dropping it would leave a dangling
 * reference; lintFlowRefs already names it for re-recording), url parts, JSON
 * paths' bodies that are referenced, narration (not held), and every output of
 * an adopted or unpinned step, which replays through the model. The recorded
 * values stay, so cross-run evidence and recorded-ref fallbacks are unchanged.
 *
 * Pure: returns the pruned flow and what was dropped, per step.
 */
export function pruneUnsourcedOutputs(
  flow: Flow,
  publishes: (skillId: string) => string[] | null,
): { flow: Flow; dropped: { stepId: string; outputs: string[] }[] } {
  const referenced = new Set<string>();
  for (const step of flow.steps) {
    for (const text of [step.instruction, ...Object.values(step.params ?? {})]) {
      for (const m of text.matchAll(/\{\{([\w-]+)\.([\w.#-]+)\}\}/g)) referenced.add(`${m[1]}.${m[2].split('#')[0]}`);
    }
  }
  const dropped: { stepId: string; outputs: string[] }[] = [];
  const steps = flow.steps.map((step) => {
    if (!step.skill || step.adopted) return step;
    const pubs = publishes(step.skill);
    if (pubs === null) return step;
    const gone = step.outputs.filter((o) => heldOutput(step, o) && !o.includes('#') && !pubs.includes(o) && !referenced.has(`${step.id}.${o}`));
    if (!gone.length) return step;
    dropped.push({ stepId: step.id, outputs: gone });
    return { ...step, outputs: step.outputs.filter((o) => !gone.includes(o)) };
  });
  return { flow: dropped.length ? { ...flow, steps } : flow, dropped };
}

/**
 * Whether a recorded output value is DATA a page could show — a status, an
 * amount, an id, a list of titles — rather than the recording agent narrating
 * what it did. The recording model names whatever it likes as a value:
 * fwrd52's report carried `actions_taken` ("Set Supplier = 'Bench Supplier Co'
 * on both parts via per-row Edit"), `screenshots` and `delete_a` ("clicked row
 * Delete -> in-page 'Confirm' dialog -> …"), and flagging every one of those as
 * unread buried the one that mattered. Empty values and file names are not
 * data; a short value is; a long one is only when it is a list (at least three
 * parts of a few words each, as "Request rate, Error count, Latency by
 * endpoint" is). An unknown value (none recorded) counts as data.
 */
export function looksLikeReportedData(value: string | undefined): boolean {
  if (value === undefined) return true;
  const v = value.trim();
  if (!v) return false;
  if (/\.(png|jpe?g|gif|webp|pdf)\b/i.test(v)) return false;
  const words = v.split(/\s+/).length;
  if (words < 6) return true;
  // `/` and the en/em dashes join a list as readily as a comma does: kanboard
  // fwkb17's `"Backlog / Ready / Work in progress / Done (each with a sort
  // drop-down)"` split into ONE part, so it counted as narration and was
  // invisible to prune, lint and unreportedOutputs alike — the one value the
  // objective was about. Same separator class the report splitter offers as
  // candidate boundaries (report.ts COMPOSED_SEPARATOR).
  const parts = v.split(/[,;|/–—\n\t]+/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 3 && words / parts.length <= 4;
}

/** A declared output worth holding a runner to: not a url part (bound from the landing), and data rather than narration. */
function heldOutput(step: Pick<FlowStep, 'recorded'>, output: string): boolean {
  if (output === 'url' || output.startsWith('url.')) return false;
  const recorded = step.recorded?.[output];
  return looksLikeReportedData(typeof recorded === 'string' ? recorded : undefined);
}

/**
 * The step's declared outputs a run did not report — those that are data
 * (heldOutput). `url` and its parts are exempt: the runner binds them from
 * where the browser lands, not the report.
 */
export function unreportedOutputs(step: Pick<FlowStep, 'outputs' | 'recorded'>, values: Record<string, string>): string[] {
  return step.outputs.filter((o) => heldOutput(step, o) && !(o in values));
}

/**
 * Export-time lint for the outputs a step DECLARES, referenced or not. A step
 * pinned to a skill that re-publishes none of an output (no labelled read, no
 * param-derived report value — see publishedOutputs) reports success on a
 * zero-model replay with that value silently missing: synthesizeReport drops
 * the recorded literal as stale, by design. fwgr36's 01-open declared
 * `panel_titles_in_order`; the recording saw the titles in a snapshot, the
 * chain it compiled into read only `dashboard_name`, and every replay reported
 * no panel titles at tier A. lintFlowRefs catches this only when a later step
 * consumes the value — a value reported to the CALLER has no consumer.
 *
 * The subject of the sentence is the PROCEDURE, not `step.skill`. A pin may be
 * the HEAD of a chain, `publishes` unions the whole chain (see the caller), and
 * a synthesized read is appended to the chain's LAST segment (LiveRead.skill
 * says so, and the server resolves the tail before updating). Naming the head
 * asserted something false about it: odoo's export said
 * `03-create reports product_name, untaxed_amount, but s_d401a3 re-reads none
 * of them` while the same export logged
 * `03-create: added a read for untaxed_amount_row to s_2df673` — the tail. The
 * head legitimately has no reads and the chain publishes nine values, so the
 * diagnostic read as "this skill publishes nothing" and cost an hour of a
 * round-15 diagnosis. A diagnostic that asserts something untrue about the
 * code is worse than no diagnostic: it must name what would have to change.
 *
 * `tailOf` is optional and only sharpens the sentence: the caller already
 * walks the chain to union its published outputs, so it can say WHICH segment
 * a re-recorded read has to land in (`s_2df673`) instead of "that procedure's
 * last segment". Without it — or when the tail is the pin itself — the
 * chain-shaped wording above stands unchanged.
 */
export function lintUnpublishedOutputs(
  flow: Flow,
  publishes: (skillId: string) => string[] | null,
  tailOf?: (skillId: string) => string | null | undefined,
): string[] {
  const warnings: string[] = [];
  for (const step of flow.steps) {
    if (!step.skill) continue;
    const pubs = publishes(step.skill);
    if (pubs === null) continue;
    const missing = step.outputs.filter((o) => heldOutput(step, o) && !pubs.includes(o.split('#')[0]));
    if (!missing.length) continue;
    const one = missing.length === 1;
    const tail = tailOf?.(step.skill);
    const named = tail && tail !== step.skill ? tail : null;
    warnings.push(
      `${step.id} reports ${missing.join(', ')}, but no segment of the procedure it pins ` +
        `(${step.skill}, ${named ? `through its last segment ${named}` : 'with any later segment of its chain'}) ` +
        `re-reads ${one ? 'it' : 'them'} from the page — ` +
        `a replay without the model will succeed without ${one ? 'that value' : 'those values'}; ` +
        `re-record so a read for ${one ? 'it' : 'them'} lands in ${named ?? "that procedure's last segment"}.`,
    );
  }
  return warnings;
}

/**
 * One step output, with support for a JSON path suffix: `body#dashboard.uid`
 * reads the `body` output, parses it as JSON, and walks the path. That is how
 * an id an app only ever returned in a response body gets threaded — see the
 * jsonLeaves() publication in buildFlow.
 */
/**
 * The outputs a step's END URL publishes: the whole url, plus every part
 * specific enough to be a reference.
 *
 * ONE function, because the producer and the consumer disagreeing is a silent
 * dead reference. buildFlow mints `{{step.url.h1}}` for any part that is
 * `looksLikeId` (three characters is enough — repair-desk's ids are "t15"),
 * while the daemon published parts at `length >= 4`. So every flow that named
 * a three-character record id minted a ref nothing would ever resolve, and the
 * four steps depending on it skipped the zero-model path on every replay.
 *
 * That is now enforced rather than asserted: both sides call
 * `referencablePart`. They had drifted again in the meantime — minting
 * admitted `idPositionPart` and this did not.
 */
export function urlOutputs(url: string, runSpecific?: RunSpecific): Record<string, string> {
  const out: Record<string, string> = { url };
  for (const part of urlParts(url)) {
    const key = `url.${part.label}`;
    // pathDigitPart too: the producer mints a landed path id below the floor
    // (buildFlow's landedByAction), and a replay cannot tell what landed its
    // url, so it publishes every candidate the producer might have minted.
    if ((referencablePart(part, runSpecific) || pathDigitPart(part)) && !(key in out)) out[key] = part.value;
  }
  return out;
}

/** A value an earlier step produced, and — for a url id below the text floor — the path it may be referenced at. */
interface Produced {
  stepId: string;
  output: string;
  value: string;
  /** `/hardware/4`: the url path up to and including the id (pathTo). */
  path?: string;
}

/**
 * A slot's recorded origin as a reference to the flow step that minted it, or
 * null. The origin is the binding key compile gave the slot (`url:i3:p1`, the
 * ledger's spelling — see remapParams, which spells re-pins the same way);
 * `byLedger` maps each EARLIER kept instruction's ledger index to its flow
 * step (buildFlow sets the current step's only after its params, so a step's
 * own mints never feed its own slots — fwec1), and the reference stands only
 * if that step minted exactly this value at that url position.
 *
 * snipeit fwsi3-n1: 04-create's skills bound v5 = "4" to `url:i3:p1` and
 * slotted `/hardware/{{v5}}` — but buildFlow saw only the value, and a one-
 * digit value is referenced only where its path is quoted; the instruction
 * named the asset by name and tag. The flow param stayed `"4"`, so every
 * replay and the compiled script expected /hardware/4 and refused. A binding
 * to an instruction that is not a step (dropped, merged) or that minted
 * something else falls back to value matching, as before.
 */
function originRef(binding: string, value: string, byLedger: ReadonlyMap<string, string>, produced: readonly Produced[]): string | null {
  const m = /^url:([^:]+):(.+)$/.exec(binding);
  if (!m) return null;
  const stepId = byLedger.get(m[1]) ?? ([...byLedger.values()].includes(m[1]) ? m[1] : undefined);
  if (!stepId) return null;
  const output = `url.${m[2]}`;
  const hit = produced.some((p) => p.stepId === stepId && p.output === output && p.value === value.trim());
  return hit ? `{{${stepId}.${output}}}` : null;
}

/**
 * Whether one of this group's own NON-navigation actions landed a url holding
 * `part` at its position: a save, a click on the new row. A `goto` names a
 * page it was sent to, not a record it made.
 */
function landedByAction(g: Group, part: { label: string; value: string }): boolean {
  return g.acts.some(
    (s) => s.tool !== 'goto' && s.tool !== 'back' && Boolean(s.diff?.url) && urlParts(s.diff!.url).some((p) => p.label === part.label && p.value === part.value),
  );
}

/** The url's path up to and including the path segment `label` names (`p1` of `/hardware/4/x` → `/hardware/4`); none for another position. */
function pathTo(url: string, label: string): string | undefined {
  const m = /^p(\d+)$/.exec(label);
  if (!m) return undefined;
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    const i = Number(m[1]);
    return i < segs.length ? `/${segs.slice(0, i + 1).join('/')}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `path`'s last segment replaced by `marker` wherever the whole path stands in
 * `text` (not continued by another word character): "at /hardware/4" and
 * `…/hardware/4/checkout`, never "/hardware/42" nor a bare "4".
 */
function replaceAtPath(text: string, path: string, marker: string): string {
  const cut = path.lastIndexOf('/') + 1;
  const head = path.slice(0, cut);
  const re = new RegExp(`${escapeRe(path)}(?![\\w-])`, 'g');
  return text.replace(re, `${head}${marker}`);
}

/**
 * Which of each step's `url.*` outputs some OTHER step actually consumes
 * (`{{03-open.url.q.id}}` in an instruction or a param). The flow runner
 * captures a step's end-url outputs in one snapshot — but an SPA can update
 * its URL a beat AFTER the page itself settles, and a structural replay is
 * fast enough to finish inside that beat. Odoo does exactly this with the
 * `id=` of a freshly saved record: fwod30's replays finished 03-open before
 * the hash carried the id, `{{03-open.url.q.id}}` went unresolved, and every
 * consumer of it fell to full recovery. Knowing which url outputs are
 * consumed lets the capture wait for them, bounded, instead of snapshotting
 * whatever the URL happened to say. The whole-url output (`url`) is always
 * present, so only dotted parts are listed.
 */
export function consumedUrlOutputs(steps: FlowStep[]): Map<string, Set<string>> {
  const wanted = new Map<string, Set<string>>();
  for (const s of steps) {
    for (const text of [s.instruction, ...Object.values(s.params ?? {})]) {
      for (const m of text.matchAll(/\{\{([\w-]+)\.(url\.[\w.-]+?)(#[\w.-]+)?\}\}/g)) {
        if (m[1] === s.id) continue; // own-step refs resolve after its capture regardless
        const set = wanted.get(m[1]) ?? new Set<string>();
        set.add(m[2]);
        wanted.set(m[1], set);
      }
    }
  }
  return wanted;
}

/**
 * The REPORTED outputs of `stepId` that some later step consumes — the names
 * a recovery of that step must report under, or every consumer falls to
 * recovery too. fwrd43-n3's recovered 01-open reported the ticket's reference
 * as `reference`; four later steps asked for `ticket_reference` and one for
 * `ticket_parts`, which it did not report at all, and 07-remove paid 16 turns.
 * Url parts are excluded: they are captured from the browser, not reported. A
 * `#path` suffix names a leaf of the output, so the output itself is listed.
 */
export function consumedReportedOutputs(steps: readonly Pick<FlowStep, 'id' | 'instruction' | 'params'>[], stepId: string): string[] {
  const out = new Set<string>();
  const at = steps.findIndex((s) => s.id === stepId);
  for (const s of steps.slice(at + 1)) {
    for (const text of [s.instruction, ...Object.values(s.params ?? {})]) {
      for (const m of text.matchAll(/\{\{([\w-]+)\.([\w.-]+?)(?:#[\w.-]+)?\}\}/g)) {
        if (m[1] !== stepId || m[2] === 'url' || m[2].startsWith('url.')) continue;
        out.add(m[2]);
      }
    }
  }
  return [...out];
}

export function lookupOutput(outputs: Record<string, Record<string, string>>, sid: string, out: string): string | undefined {
  const hash = out.indexOf('#');
  if (hash < 0) return outputs[sid]?.[out];
  const base = outputs[sid]?.[out.slice(0, hash)];
  if (base === undefined) return undefined;
  let node: unknown;
  try {
    node = JSON.parse(base);
  } catch {
    return undefined;
  }
  for (const key of out.slice(hash + 1).split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'string' || typeof node === 'number' ? String(node) : undefined;
}

/** What a flow reference can be filled from, in lookup order. */
interface RefSources {
  vars: Record<string, string>;
  outputs: Record<string, Record<string, string>>;
}

/**
 * One reference's value: a `{{var}}` from the run's vars, a `{{step.output}}`
 * from THIS run's outputs. Nothing else — a reference this run did not
 * publish is missing and goes to recovery, never to a recorded literal.
 */
function lookupRef(ref: string, src: RefSources): string | undefined {
  if (!ref.includes('.')) return ref in src.vars ? src.vars[ref] : undefined;
  const dot = ref.indexOf('.');
  return lookupOutput(src.outputs, ref.slice(0, dot), ref.slice(dot + 1));
}

/**
 * Fill every `{{ref}}` in `text`. ONE substitution for instructions and
 * params alike — a reference that resolves in one and not the other is a
 * silent way to send a step to recovery. `missing` names what could not be
 * filled; an unfilled reference is left in place (`keep`) or blanked.
 */
export function resolveRefs(text: string, src: RefSources, unresolved: 'keep' | 'blank' = 'keep'): { text: string; missing: string[] } {
  const missing: string[] = [];
  const filled = text.replace(/\{\{([\w.#-]+)\}\}/g, (m, ref: string) => {
    const v = lookupRef(ref, src);
    if (v !== undefined) return v;
    missing.push(ref);
    return unresolved === 'keep' ? m : '';
  });
  return { text: filled, missing };
}

/** Fill {{var}} and {{step.output}} references from run vars and prior outputs. */
export function resolveInstruction(
  step: FlowStep,
  vars: Record<string, string>,
  outputs: Record<string, Record<string, string>>,
): { text: string; missing: string[] } {
  return resolveRefs(step.instruction, { vars, outputs });
}

/**
 * Like resolveInstruction, but for the recovery path: fill every reference that
 * can be filled (rather than leaving `{{...}}` in the text), so the model gets a
 * readable instruction built from what IS known — e.g. the ticket title even
 * when its id could not be threaded.
 *
 * A reference this run did not publish is shown as the value the flow RECORDED
 * for it, marked as such, when `flow` is given; blank otherwise. A blank is
 * not neutral: fwkb8's 03-change told recovery to move the task "into the ''
 * column", the model rightly refused, and both replays halted on a value the
 * recording had seen ("Work in progress") and no replay could re-read. The
 * marker says the value is the recording's, so the model checks the page
 * rather than trusting it — and it goes to RECOVERY only: resolveStepParams
 * and the compiled artifact never act on a recorded literal (see
 * `RunSpecific` for why that would edit run 1's record silently).
 *
 * A value a later run has already watched CHANGE stays blank: it is known to
 * be the recording's record, not something this run's page will show.
 */
export function softResolveInstruction(
  step: FlowStep,
  vars: Record<string, string>,
  outputs: Record<string, Record<string, string>>,
  flow?: Pick<Flow, 'steps'>,
): string {
  const marked = new Set<string>();
  const text = step.instruction.replace(/(['"]?)\{\{([\w.#-]+)\}\}(['"]?)/g, (m, open: string, ref: string, close: string) => {
    // Only a matching pair is the instruction's own quoting of the value.
    const quoted = Boolean(open) && open === close;
    const lead = quoted ? '' : open;
    const trail = quoted ? '' : close;
    const live = lookupRef(ref, { vars, outputs });
    if (live !== undefined) return `${open}${live}${close}`;
    const recorded = flow ? recordedRef(ref, flow.steps) : undefined;
    if (recorded === undefined) return `${open}${close}`;
    const q = recorded.includes("'") ? (recorded.includes('"') ? '' : '"') : "'";
    // The caveat once per reference: repeating it at every use is noise.
    const caveat = marked.has(ref) ? '' : " (recorded when this flow was made; this run's value may differ — check the page)";
    marked.add(ref);
    return `${lead}${q}${recorded}${q}${caveat}${trail}`;
  });
  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Longest recorded value recovery is shown in place of a reference; a longer one is a body, not a detail. */
const MAX_RECORDED_REF_CHARS = 120;

/**
 * The value the recording saw for a `{{step.output}}` reference — the step's
 * `recorded` entry by its full name (minted url parts and JSON leaves are
 * recorded under it), else a JSON path walked from the base output. Undefined
 * for a `{{var}}`, an unknown step, a value a later run watched change, and a
 * value empty or too long to quote.
 */
function recordedRef(ref: string, steps: FlowStep[]): string | undefined {
  const dot = ref.indexOf('.');
  if (dot < 0) return undefined;
  const sid = ref.slice(0, dot);
  const out = ref.slice(dot + 1);
  const producer = steps.find((s) => s.id === sid);
  if (!producer) return undefined;
  if ((producer.outputEvidence?.[out]?.differed ?? 0) > 0) return undefined;
  const direct = producer.recorded?.[out];
  const raw = typeof direct === 'string' ? direct : lookupOutput({ [sid]: producer.recorded ?? {} }, sid, out);
  const value = raw?.replace(/\s+/g, ' ').trim();
  return value && value.length <= MAX_RECORDED_REF_CHARS ? value : undefined;
}

/** Resolve a step's stored param bindings from run vars and prior outputs. */
/**
 * Which of a step's unresolved references its pinned skill can do without.
 *
 * A reference lives in the step's wording and, sometimes, in a param. The
 * pinned procedure is fixed: only a param some step TYPES or LOCATES by, or
 * that names the record the skill must find (requireText), can change what
 * it does. A reference that reaches nothing else — a tag the instruction
 * mentions for context, a price quoted from the recording — cannot alter a
 * zero-model replay, so its absence is no reason to skip one. fwgr23 05-open
 * went to 19–44 model turns on both replays because `{{04-open.tag}}` was
 * blank, bound to a param no step used.
 *
 * THE WHOLE CHAIN, not the pinned head. A pin is one segment of a segment
 * chain and the replay runs every later segment with the same params
 * (server.ts replays each with `{ ...match.params, ...derived }`), so a slot
 * the head never touches can still be TYPED two segments on. fwod56's store
 * holds the witness: `s_73bb71` is the head 10-verify pins, its `v4`
 * (`{{05-open.quotation_reference}}`) reports `usedIn: []` — yet segment 3 of
 * the same chain, `s_4404a9`, step 1 is `type { text: "{{v4}}" }`. Judged on
 * the head alone the blank was "ignorable", tier A proceeded, and the literal
 * `{{05-open.quotation_reference}}` would have been typed into the page.
 *
 * This is the daemon half of one rule: the compile-time twin is `usedSlot`
 * (src/spec/emit.ts), which has always done `step.segments.some(…)` and whose
 * comment calls itself "the port of ignorableRefs". The two must stay tied —
 * change one, change the other, or the daemon and the artifact disagree about
 * whether a step may act with an unresolved reference in its slots.
 */
export function ignorableRefs(
  missing: string[],
  step: FlowStep,
  chain: ReadonlyArray<Pick<StandInSegment, 'params' | 'preconditions'>>,
): string[] {
  if (!chain.length) return [];
  const needed = new Set<string>();
  for (const seg of chain) {
    for (const [name, p] of Object.entries(seg.params)) if (p.usedIn.length) needed.add(name);
    for (const marker of seg.preconditions?.requireText ?? []) for (const m of marker.matchAll(/\{\{(v\d+)\}\}/g)) needed.add(m[1]);
  }
  return [...new Set(missing)].filter((ref) => {
    const token = `{{${ref}}}`;
    return !Object.entries(step.params ?? {}).some(([name, tmpl]) => needed.has(name) && tmpl.includes(token));
  });
}

/**
 * Slot bindings for a step that has just been re-pinned onto another skill.
 * The old bindings are keyed by the OLD skill's slot names, which mean
 * nothing to the new skill — rpat1-r1 re-pinned 04-add and kept
 * `v2: "{{runid}}"` where the new skill's v2 was the project name, so r2
 * bound the wrong values and the delete step was refused for a missing
 * slot. Bindings are re-derived by VALUE: each new slot's example (the value
 * the recovery actually used) is matched against what this run knew —
 * the old bindings as resolved, the declared vars, earlier steps' outputs —
 * and the matching template is carried over; a value containing a known
 * value is templated on that part; anything else stays literal, which is
 * what the recovery typed. `inherited` are the bindings a sibling step
 * that already pins this skill stores, used for slots with no origin.
 * `stepIds` are the step ids THIS flow can resolve; omitted means "trust
 * every origin", which is what the pre-fwgr47 callers did.
 *
 * Two more things the caller knows and the store does not (`opts`):
 *
 *  - `ledgerSteps`: which flow step ran under which ledger index in the run
 *    doing the re-pin. A skill compiled from a recovery binds by ledger
 *    origin — `output:i3:tag_chip_text` — because that is the spelling the
 *    ledger banks under; the flow spells the same fact `{{03-open.…}}`. With
 *    the map, an index origin whose step PUBLISHES the output (declares it in
 *    `outputs`) is a named origin like any other. One whose step does not is
 *    still no origin: the reference would resolve on no run.
 *  - `instruction`: the step's own instruction. A literal the instruction
 *    states in plain words is the instruction's to supply — the value is a
 *    constant of the flow, not a fact of the recording run — so it is not an
 *    unbound record identity even when `known`. fwgr50's 04-open said "add
 *    the tag 'bench'"; the recovery's compile banked `bench` under an earlier
 *    step's incidental read, the flow could not name that read, the re-pin
 *    was refused, and the flow stayed on a pin the store had already
 *    superseded. Same rule as the compile side's `statedPlainly`
 *    (spec/rethread.ts): a value carrying a run-scoped bound value (the
 *    runid) is never "stated plainly".
 *  - `self`: the step being re-pinned. No origin naming it (by id, or by the
 *    ledger index it ran under) is an origin for its own slots.
 */
export function remapParams(
  skill: Skill,
  inherited: Record<string, string> = {},
  stepIds?: Iterable<string>,
  opts: { instruction?: string; ledgerSteps?: ReadonlyMap<string, { id: string; outputs: readonly string[] }>; self?: string } = {},
): { params: Record<string, string>; unbound: string[] } {
  // A binding key names where a value comes from: "runid" / "var:runid" (a
  // declared var), "…:landed_page" / "output:…:landed_page" (an output), or
  // "url:…:p1" (a url part). The `step` inside an output/url key is whatever
  // MINTED the fact, and that is not always a flow step id: the flow's own
  // threading mints one, but the daemon mints `i2` — an instruction index
  // (`i${instructionIndex}`, server.ts) that ledger.ts serialises into
  // "output:i2:dashboard_title_saved". Nothing publishes `i2.*`, so emitting
  // `{{i2.dashboard_title_saved}}` hands the flow a reference no run can
  // resolve — grafana fwgr47's compiled 07-verify stopped at
  // "needs {{i2.dashboard_title_saved}}, and this run never published it".
  // Only the caller knows which ids this flow resolves, so it passes them in
  // and an origin naming anything else is no origin at all: the slot falls
  // through to `inherited`, then the literal example, then `unbound`.
  const known = stepIds ? new Set(stepIds) : null;
  // A step's slot is never fed by that step's own url or output: the value
  // does not exist until the step has run (espocrm fwec1-n2 re-pinned
  // 02-create with `v6: {{02-create.url.h2}}`; n3 stopped on it unresolved,
  // and the compiled script died on it). Such a slot has no origin, so a
  // record-identifying one leaves the re-pin refused.
  const resolvable = (step: string): boolean => step !== opts.self && (!known || known.has(step));
  // A ledger index the caller can place: the step that ran as `i3`, if it
  // publishes what the origin names. Url parts are published on demand (the
  // runner captures whatever the flow's references ask for), so a placed
  // index names one outright; an output must be declared.
  const placed = (step: string, output?: string): string | null => {
    const at = opts.ledgerSteps?.get(step);
    if (!at || at.id === opts.self) return null;
    if (output !== undefined && !at.outputs.includes(output)) return null;
    return at.id;
  };
  const templateOf = (key: string): string | null => {
    const m = /^(var|url|output|input)(?::(.*))?$/.exec(key);
    if (!m) return `{{${key}}}`;
    if (m[1] === 'var') return `{{${m[2]}}}`;
    if (m[1] === 'url') {
      const [step, label] = String(m[2]).split(':');
      if (!step || !label) return null;
      if (resolvable(step)) return `{{${step}.url.${label}}}`;
      const id = placed(step);
      return id ? `{{${id}.url.${label}}}` : null;
    }
    if (m[1] === 'output') {
      const [step, name] = String(m[2]).split(':');
      if (!step || !name) return null;
      if (resolvable(step)) return `{{${step}.${name}}}`;
      const id = placed(step, name);
      return id ? `{{${id}.${name}}}` : null;
    }
    return null; // 'input': the run typed it — the example is the value
  };
  // Slots with an origin, as (example → template) pairs; a slot whose
  // example is a composite ("<runid> MTP Bench Project") is templated on the
  // bound slots' examples — this skill's own run, so the values line up.
  const bound: Array<{ value: string; template: string }> = [];
  for (const p of Object.values(skill.params)) {
    const t = p.binding ? templateOf(p.binding) : null;
    if (t && p.example) bound.push({ value: String(p.example), template: t });
  }
  bound.sort((a, b) => b.value.length - a.value.length);
  const params: Record<string, string> = {};
  const unbound: string[] = [];
  for (const [name, p] of Object.entries(skill.params)) {
    const ex = String(p.example ?? '');
    const direct = p.binding ? templateOf(p.binding) : null;
    if (direct) {
      params[name] = direct;
      continue;
    }
    // A slot the skill recorded no origin for, but which another step of
    // the same flow already binds (the flow's `params` for that step are
    // {{ref}} templates that resolve on every run): inherit that binding.
    // rr2od's 08-open was covered by 07-open's read-only status check,
    // whose store entry predates slot origins; the flow knew them all along.
    if (inherited[name] !== undefined) {
      params[name] = inherited[name];
      continue;
    }
    let text = ex;
    for (const b of bound) if (b.value && text.includes(b.value)) text = text.split(b.value).join(b.template);
    params[name] = text;
    // A value that identifies the record (known) and could not be templated
    // would replay as the LEARNING run's literal — the re-pin is not safe.
    // Unless the instruction itself states it: then the literal IS the
    // binding, on every run, and the recording's origin for it was incidental.
    if (p.known && text === ex && !(opts.instruction && ex && statedPlainly(opts.instruction, ex, bound.map((b) => b.value)))) unbound.push(name);
  }
  return { params, unbound };
}

export function resolveStepParams(
  step: FlowStep,
  vars: Record<string, string>,
  outputs: Record<string, Record<string, string>>,
): { params: Record<string, string>; missing: string[] } | null {
  if (!step.params) return null;
  const params: Record<string, string> = {};
  const missing: string[] = [];
  for (const [k, tmpl] of Object.entries(step.params)) {
    const r = resolveRefs(tmpl, { vars, outputs });
    params[k] = r.text;
    missing.push(...r.missing);
  }
  return { params, missing };
}

/** Cap on JSON leaves published per read value, and how deep to walk. */
const MAX_JSON_LEAVES = 12;
const MAX_JSON_DEPTH = 4;


/**
 * Scalar leaves of a JSON read value, as `path` (dot/index joined) + value.
 *
 * `runSpecific` is the same evidence arm the url parts use: a leaf an earlier
 * run watched change is published whatever it looks like — the case this
 * exists for, since fwgr5's dashboard uid lived only inside a response body
 * and shape is all that stood between it and a literal. It only ever adds:
 * without evidence the shape prior still decides, and that prior fails toward
 * silence, since an unpublished leaf leaves the recording's literal in place
 * with nothing that could ever correct it.
 */
export function jsonLeaves(text: string, runSpecific?: RunSpecific): { path: string; value: string }[] {
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return [];
  let root: unknown;
  try {
    root = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const out: { path: string; value: string }[] = [];
  const walk = (node: unknown, path: string, depth: number): void => {
    if (out.length >= MAX_JSON_LEAVES || depth > MAX_JSON_DEPTH) return;
    if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    if (typeof node !== 'string' && typeof node !== 'number') return;
    const value = String(node);
    if (value.length > 120) return;
    if (!runSpecific?.(value) && !(value.length >= MIN_ID_LEN && looksLikeId(value, 'first-run'))) return;
    if (!path) return;
    out.push({ path, value });
  };
  walk(root, '', 0);
  return out;
}

/** Longest recorded value that may stand in for an unpublished reference; a longer one is prose, not a control's label. */
const MAX_STAND_IN_CHARS = 80;

/** Tools that ACT on a control (a read or a fill names data, not a control). */
const CONTROL_ACTS = new Set(['click', 'dblclick', 'check', 'uncheck']);

/**
 * Roles whose accessible name is the app's own vocabulary. `link` is left out
 * on purpose: a link is how an app names a RECORD (fwkb3's task sat on the
 * board as `link "#4"` long after the run that made it), so a link's name is
 * no evidence the value is furniture.
 */
const CONTROL_ROLES = new Set(['button', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'checkbox', 'switch']);

/** One segment of the consuming step's pinned procedure: what both runners carry (a Skill, or a SpecSegment). */
export interface StandInSegment {
  params: Skill['params'];
  steps: SkillStep[];
  preconditions?: { requireText?: string[] };
}

/**
 * Does this segment use `slot` ONLY as the accessible name of a control it
 * acts on — and at least once? That use is the evidence that the value is page
 * vocabulary (a button's label), not record data: a slot that is also typed,
 * read, navigated by, or named as the record's identity marker is data.
 */
function slotNamesControl(seg: StandInSegment, slot: string): boolean {
  const token = `{{${slot}}}`;
  if ((seg.preconditions?.requireText ?? []).some((m) => m.includes(token))) return false;
  let named = 0;
  const walk = (steps: SkillStep[]): boolean => {
    for (const step of steps) {
      const { body, ...own } = step;
      if (body?.length && !walk(body)) return false;
      if (!JSON.stringify(own).includes(token)) continue;
      const target = (step.locators as Record<string, unknown> | undefined)?.target;
      const controls = Array.isArray(target)
        ? target.filter((c): c is { kind: string; role?: string; name?: string } => Boolean(c) && typeof c === 'object' && (c as { kind?: unknown }).kind === 'role')
        : [];
      const isControl = CONTROL_ACTS.has(step.tool) && controls.some((c) => c.role !== undefined && CONTROL_ROLES.has(c.role) && c.name === token);
      // The slot anywhere but a control's name on a control act — typed, read,
      // in a url, a non-control role — makes it data.
      if (!isControl || controls.some((c) => c.name?.includes(token) && !(c.role !== undefined && CONTROL_ROLES.has(c.role)))) return false;
      named += 1;
    }
    return true;
  };
  return walk(seg.steps) && named > 0;
}

/**
 * The RECORDED value a `{{step.output}}` reference may resolve to when this
 * run did not publish it — provided the live page shows it (the caller asks
 * `recordedValueShown`). Undefined when no stand-in is safe.
 *
 * fwrd54 is the case: 06-change declares `mark_ready_button` ("Mark Ready")
 * but replays at tier A without reading it, so 07-edit, whose pinned
 * procedure clicks `{{06-change.mark_ready_button}}`, skipped the zero-model
 * replay and paid 6 and 11 model turns on n2 and n3 for a button its start
 * page was showing.
 *
 * ONE rule for both runners, so it is keyed on what both carry: the consuming
 * step's param bound to exactly `{{ref}}`, the example its pinned procedure's
 * slot recorded, and that procedure's steps (`segments`). The compiled spec
 * has no `recorded` map (see lower.ts's toFlowStep), so the producer's
 * recorded value is only a CHECK here — the daemon passes it, and a value the
 * slot and the producer disagree on is refused — never a source of its own.
 *
 * Evidence, not shape, says the value is furniture: every segment that uses
 * the slot uses it only as the name of a control it acts on (slotNamesControl).
 * Refused as run-specific, because such a value on the page is the RECORDING's
 * record, not this run's (the reason `lookupRef` never falls back to a literal
 * — `RunSpecific`): one holding a recorded var's value (a slot bound to
 * `var:*`, or a param that is exactly `{{var}}`); one a later run already
 * watched change (`differed`). The caller adds what only it knows at run
 * time: this run's var values, ledger evidence. Url parts and JSON paths are
 * never stood in for: those are bound from where the browser landed or from a
 * response body, not from what a page shows.
 */
export function recordedStandIn(
  ref: string,
  params: Record<string, string> | undefined,
  segments: ReadonlyArray<StandInSegment>,
  producer?: { recorded?: string; differed?: boolean },
): string | undefined {
  const dot = ref.indexOf('.');
  if (dot < 0 || ref.includes('#')) return undefined;
  const out = ref.slice(dot + 1);
  if (out === 'url' || out.startsWith('url.')) return undefined;
  if (producer?.differed) return undefined;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const exactRef = (tmpl: string) => /^\s*\{\{([\w.#:-]+)\}\}\s*$/.exec(tmpl)?.[1];
  const examples = new Set<string>();
  const recordedVars = new Set<string>();
  for (const [slot, tmpl] of Object.entries(params ?? {})) {
    const exact = exactRef(tmpl);
    for (const seg of segments) {
      const p = seg.params[slot];
      if (exact === ref && JSON.stringify(seg.steps).includes(`{{${slot}}}`) && !slotNamesControl(seg, slot)) return undefined;
      if (typeof p?.example !== 'string') continue;
      if (exact === ref) {
        if (p.example.includes('\n')) return undefined;
        examples.add(norm(p.example));
      }
      if ((exact !== undefined && !exact.includes('.')) || p.binding?.startsWith('var:')) recordedVars.add(norm(p.example));
    }
  }
  if (examples.size !== 1) return undefined;
  const value = [...examples][0];
  // At least one segment must name a control by this slot: a slot no step
  // uses at all carries no evidence either way.
  const slotsForRef = Object.entries(params ?? {}).filter(([, t]) => exactRef(t) === ref).map(([s]) => s);
  if (!segments.some((seg) => slotsForRef.some((slot) => slotNamesControl(seg, slot)))) return undefined;
  if (producer?.recorded !== undefined && norm(producer.recorded) !== value) return undefined;
  if (value.length < 2 || value.length > MAX_STAND_IN_CHARS || value.includes('{{')) return undefined;
  const lower = value.toLowerCase();
  for (const v of recordedVars) if (v.length >= 2 && lower.includes(v.toLowerCase())) return undefined;
  return value;
}
