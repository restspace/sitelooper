import fs from 'node:fs';
import path from 'node:path';
import { identityPosition, type Flow, type FlowStep } from '../skills/flow.js';
import type { SiteFacts } from '../execution/facts.js';
import type { FlowStepResult } from '../shared/protocol.js';
import { formatDiagnostic, rerecordFix, type Diagnostic } from './diagnostics.js';
import { urlParts } from '../execution/url.js';

/**
 * `sitelooper rerecord <flow> <step>` — throw one step's recording away and
 * let the agent make a new one.
 *
 * The failure this exists for is not drift. fwod34's 08-open is pinned to a
 * skill whose FIRST action clicks a Cancel button that only existed on the
 * recording run (step 06 had already cancelled the order by the time 08 ran),
 * so the pin is demoted and every later run "passes" the step only because
 * the engine quietly replays some other, read-only skill instead. Nothing in
 * the app is broken and no locator has drifted: the recording is wrong. The
 * only repair for a wrong recording is another recording, and this is the
 * command that takes one — deterministically, against the real app, with the
 * store's own re-pin rule (learn.ts `decideRepin`) as the judge of whether
 * the new procedure is good enough to keep.
 *
 * The mechanism is deliberately small: unpin the step (below), run the flow a
 * couple of times in learning mode, and read the verdict off the step's own
 * run results. Everything that decides whether the new recording is trustworthy
 * — the recovery ladder, skill compilation, lifecycle promotion, the re-pin
 * gate — already exists and is exercised on every ordinary run.
 */

/** Raised for the caller's mistakes (unknown step, unwritable backup): exit 2, no daemon. */
export class RerecordError extends Error {}

/**
 * The shared diagnostic shape (src/spec/diagnostics.ts), narrowed to the one
 * code this surface emits. The formatter and the fix-command builder are the
 * shared ones, re-exported under this module's names so every surface prints
 * a rerecord verdict the same way.
 */
export type RerecordDiagnostic = Diagnostic & { code: 'needs-rerecord' };

/** `<severity> <step>: <what>` + indented why/fix — the contracted block form. */
export const formatRerecordDiagnostic = formatDiagnostic;

/** The command that re-records one step, quoted so a path with spaces survives. */
export const rerecordCommand = rerecordFix;

/**
 * The step, stripped back to "an instruction nobody has recorded yet".
 *
 * `adopted = true` is not decoration: it is the shape `decideRepin` pins on
 * the FIRST clean recovery (an adopted step's incumbent is scaffolding, so a
 * recovery that carried the whole step wins outright, provisional or not).
 * Without it the new procedure would enter the store provisional and need two
 * more clean runs before the pin moved, and a two-run rerecord would report
 * "nothing was pinned" about a perfectly good recording.
 *
 * `params` and `outputEvidence` go with the pin because both describe the
 * skill that is being discarded: params are ITS slot bindings, and evidence
 * is cross-run agreement about values the old recording read. `outputs` stays
 * — later steps reference this step's outputs by name, and renaming them
 * would break the flow's threading. `recorded` is emptied rather than deleted:
 * the field is required, and its recorded values are soft assertions made
 * about the run this command exists to replace.
 *
 * Pure, and returns a new flow: the caller decides when (and whether) it hits
 * disk, and the tests do not need one.
 */
export function unpinStep(flow: Flow, stepId: string, instruction?: string): Flow {
  const idx = flow.steps.findIndex((s) => s.id === stepId);
  if (idx < 0) {
    throw new RerecordError(
      `flow "${flow.name}" has no step "${stepId}" — steps are: ${flow.steps.map((s) => s.id).join(', ')}`,
    );
  }
  const old = flow.steps[idx];
  const next: FlowStep = {
    id: old.id,
    instruction: instruction ?? old.instruction,
    outputs: old.outputs,
    recorded: {},
    adopted: true,
  };
  const steps = flow.steps.slice();
  steps[idx] = next;
  return { ...flow, steps };
}

/** The flow-warning prefix a quarantined step carries; see `noopDiagnostics` in ir.ts. */
export const LEAKED_STEP = 'leaked-step:';

/**
 * Take the steps whose recording carries a CONFIDENT record leak out of
 * replay, instead of refusing the whole export.
 *
 * A fatal leak is a run value in a step's only locator — replaying it moves
 * that step onto the recording run's record without saying so. That poisons
 * ONE step. The export used to answer by writing the entire flow to
 * `.rejected.json`, so a 12-step recording with one bad locator was worth
 * nothing, and — the part nobody had noticed — the poisoned skill itself
 * stayed in the store, still matchable by any later instruction on the same
 * page. The response now matches the damage.
 *
 * A step is quarantined when its pin IS a poisoned skill or shares a segment
 * chain with one (`seq.chain`): a chain replays as a unit from its head, so a
 * bad locator in segment 3 is reached by the step that pins segment 1. Each
 * quarantined step is stripped by `unpinStep` — the same operation
 * `sitelooper rerecord` performs, so the step replays model-first until a
 * clean recovery earns a new pin — and carries a `leaked-step:` warning on
 * the flow file, so compile re-raises it long after this session is gone.
 *
 * Pure: the caller demotes the skills and writes the flow.
 *
 * @param poisoned skill id -> one line per fatal leak found in it
 */
export function quarantineLeakedSteps(
  flow: Flow,
  skills: { id: string; seq?: { chain: string } }[],
  poisoned: Map<string, string[]>,
): { flow: Flow; quarantined: { step: string; skills: string[]; leaks: string[] }[] } {
  const chainKey = (id: string) => skills.find((s) => s.id === id)?.seq?.chain ?? id;
  const byChain = new Map<string, string[]>();
  for (const id of poisoned.keys()) byChain.set(chainKey(id), [...(byChain.get(chainKey(id)) ?? []), id]);

  let next = flow;
  const quarantined: { step: string; skills: string[]; leaks: string[] }[] = [];
  const warnings = [...(flow.warnings ?? [])];
  for (const step of flow.steps) {
    if (!step.skill) continue;
    const hit = byChain.get(chainKey(step.skill));
    if (!hit) continue;
    const leaks = hit.flatMap((id) => poisoned.get(id) ?? []);
    next = unpinStep(next, step.id);
    quarantined.push({ step: step.id, skills: hit, leaks });
    warnings.push(
      `${LEAKED_STEP} ${step.id} was taken out of replay: its recorded procedure ` +
        `(${hit.join(', ')}) locates an element by a value the recording run made, so replaying it would act on ` +
        `the recording's record. It now replays model-first until a clean recovery earns a new pin. ` +
        `Leaked: ${leaks.slice(0, 3).join('; ')}`,
    );
  }
  return { flow: quarantined.length ? { ...next, warnings } : flow, quarantined };
}

/** `<file>.bak-<stamp>.json` beside the flow — the recording this command discards. */
export function backupPath(file: string, stamp: string = Date.now().toString(36)): string {
  const dir = path.dirname(file);
  const base = path.basename(file).replace(/\.json$/i, '');
  return path.join(dir, `${base}.bak-${stamp}.json`);
}

/** Copy the flow file aside before patching it. Returns the backup's path. */
export function backupFlowFile(file: string, stamp?: string): string {
  const to = backupPath(file, stamp);
  try {
    fs.copyFileSync(file, to);
  } catch (err) {
    throw new RerecordError(`could not back up ${file}: ${(err as Error).message}`);
  }
  return to;
}

/** One run's view of the step being re-recorded. `step` is absent when the run never reached it. */
export interface RerecordRun {
  /** "run 1", "run 2", … — printed verbatim. */
  label: string;
  step?: FlowStepResult;
  /**
   * What the daemon said about this step while the run was on it — above
   * all a re-pin refusal ("not re-pinning s_… — slot(s) v2 identify the
   * record but carry no origin to rebind from"). rr2od ran twice, pinned
   * nothing, and printed nothing about why: the reason only ever went to
   * --progress. It is the verdict's evidence, so it is kept per run.
   */
  notes?: string[];
}

/** Does a daemon progress line concern this flow step? `[flow <name>] <step>: …` */
export function stepNote(line: string, stepId: string): string | null {
  const m = /^\[flow [^\]]+\] ([^:]+): (.*)$/.exec(line);
  return m && m[1] === stepId ? m[2] : null;
}

/**
 * The daemon's `replayed` is "<steps run>/<steps total>" for the skill the
 * step actually ran; older results and repair's facts carry a skill id there
 * instead. Only an id is evidence that a DIFFERENT skill covered the step.
 */
export function replayedSkillId(replayed: string | null | undefined): string | null {
  if (!replayed) return null;
  return /^\d+\s*\/\s*\d+$/.test(replayed) ? null : replayed;
}

/** `run 2: 08-open  replay tier A (2/2)` / `run 1: 08-open  agent (12 turns) re-pinned s_ab12cd` */
export function stepLine(stepId: string, run: RerecordRun): string {
  const st = run.step;
  if (!st) return `${run.label}: ${stepId}  not reached`;
  const how =
    st.tier === 'A'
      ? `replay tier A${st.replayed ? ` (${st.replayed})` : ''}`
      : st.replayed
        ? `replay ${st.replayed}${st.repaired ? ' + repair' : ''}${st.turns ? ` (${st.turns} turns)` : ''}`
        : `agent${st.turns ? ` (${st.turns} turns)` : ''}`;
  const mark = st.status === 'success' ? '' : ` [${st.status.toUpperCase()}]`;
  return `${run.label}: ${stepId}  ${how}${mark}${st.repinned ? ` re-pinned ${st.repinned}` : ''}`;
}

export type RerecordVerdict =
  | { ok: true; pinned: string; runs: number }
  | { ok: false; pinned?: string; diagnostic: RerecordDiagnostic };

/**
 * After a re-record of `stepId`: reference the values it reported WHERE A
 * REPLAY RE-OBSERVES THEM. Export's buildFlow does this for a fresh recording
 * (round 62, grafana fwgr74: a reported value equal to a part of the url the
 * step ended on is referenced as `{{step.url.<label>}}`, which both runners
 * publish from the end url) — but a re-record never re-exports, so a consumer
 * still bound to the report key `{{01-open.dashboard_uid_from_url}}` refused
 * unsourced-ref after every one of fwgr74-cv2's four re-records. The end url
 * witness is the one the flow already recorded for the step (`recorded.url`;
 * a flow run result carries no url), which is stable for a slug and, for a
 * minted id, is a part the landing rule mints anyway. Every later step's
 * instruction and params are rewritten; the step records the part too.
 * Returns the references it rewired, for the log.
 *
 * `sf` (site facts stage 1, consumer 4): the origin's facts snapshot. A value
 * the end url carries at more than one position threads to the position a
 * reliable `route.path` `identity` fact names — the record, not a slug that
 * happens to spell the same (referencablePart's facts arm, flow.ts
 * identityPosition). A value found at any part is threaded whatever it looks
 * like, as before; without `sf`, or with no reliable fact, the first part
 * carrying the value, as before.
 */
export function rethreadUrlRefs(flow: Flow, stepId: string, endUrl: string | undefined, sf?: SiteFacts): { flow: Flow; rewired: string[] } {
  const idx = flow.steps.findIndex((s) => s.id === stepId);
  if (idx < 0 || !endUrl) return { flow, rewired: [] };
  const step = flow.steps[idx];
  const parts = urlParts(endUrl);
  const byKey = new Map<string, string>();
  for (const [key, value] of Object.entries(step.recorded ?? {})) {
    if (key === 'url' || key.startsWith('url.') || typeof value !== 'string' || !value.trim()) continue;
    const carrying = parts.filter((p) => p.value === value.trim());
    const at = (sf ? carrying.find((p) => identityPosition(sf, endUrl, p)) : undefined) ?? carrying[0];
    if (at) byKey.set(key, `url.${at.label}`);
  }
  if (!byKey.size) return { flow, rewired: [] };
  const rewired: string[] = [];
  const rewrite = (text: string): string =>
    text.replace(/\{\{([\w-]+)\.([\w.-]+?)(#[\w.-]+)?\}\}/g, (whole, sid: string, out: string, hash: string | undefined) => {
      if (sid !== stepId || hash) return whole;
      const part = byKey.get(out);
      if (!part) return whole;
      rewired.push(`{{${sid}.${out}}} -> {{${sid}.${part}}}`);
      return `{{${sid}.${part}}}`;
    });
  const steps = flow.steps.map((s, i) => {
    if (i <= idx) return s;
    const params = s.params ? Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, typeof v === 'string' ? rewrite(v) : v])) : s.params;
    return { ...s, instruction: rewrite(s.instruction), ...(params ? { params } : {}) };
  });
  if (!rewired.length) return { flow, rewired: [] };
  const recorded: Record<string, string> = { ...(step.recorded ?? {}), url: endUrl };
  for (const [key, part] of byKey) if (!(part in recorded)) recorded[part] = step.recorded[key];
  steps[idx] = { ...step, recorded };
  return { flow: { ...flow, steps }, rewired: [...new Set(rewired)] };
}

/**
 * The skills a re-record must retire so the store's re-pin rule cannot hand
 * the step back the procedure it was asked to replace: the previous pin and
 * every segment of its chain. odoo fwod88-cv2 re-recorded 03-create four
 * times; run 2 of each pair replayed the OLD chain (still a candidate: unpinned,
 * never demoted) clean, decideRepin re-pinned it, and the compile refused the
 * same unsourced-ref again — the old procedure was the one that never read the
 * value. Returns the ids to demote (empty when nothing was pinned).
 */
export function chainToRetire(skills: readonly { id: string; seq?: { chain: string } }[], pinned: string | undefined): string[] {
  if (!pinned) return [];
  const head = skills.find((s) => s.id === pinned);
  if (!head) return [];
  const members = head.seq ? skills.filter((s) => s.seq?.chain === head.seq!.chain) : [head];
  return [...new Set([pinned, ...members.map((s) => s.id)])];
}

/**
 * The values a re-record leaves as the step's record: the run with the most
 * reported values (the recording run, usually run 1 — a replay drops what it
 * could not re-read), or null when no run reported any. unpinStep empties
 * `recorded` and only export ever fills it; without this a compile rule keyed
 * on the recorded value (a url part a later step references) had nothing to
 * read after a re-record (fwgr74-cv: four re-records, four identical refusals).
 */
export function recordedFromRuns(runs: readonly RerecordRun[]): Record<string, string> | null {
  let best: Record<string, string> | null = null;
  for (const r of runs) {
    const values = r.step?.values;
    if (values && Object.keys(values).length > Object.keys(best ?? {}).length) best = { ...values };
  }
  return best;
}

/**
 * Did the re-recording take?
 *
 * The bar is the one the compiled spec has to clear, not "the run passed":
 * the LAST run must have replayed this step at tier A — no model, no repair —
 * with the skill this rerecord pinned. Anything else is the same failure mode
 * the command was built to expose. A step that passes because the engine
 * reached for a different skill is exactly fwod34/08-open, and reporting that
 * as success would put the wrong recording straight back into a spec.
 */
export function rerecordVerdict(input: { file: string; stepId: string; runs: RerecordRun[] }): RerecordVerdict {
  const { file, stepId, runs } = input;
  const fix = rerecordCommand(file, stepId);
  const trail = runs.map((r) => stepLine(stepId, r)).join('; ');
  const notes = runs.flatMap((r) => (r.notes ?? []).map((n) => `${r.label}: ${n}`));
  // The pin this rerecord made: the last re-pin any run reported. Later runs
  // replay it and report no re-pin of their own, which is the success shape.
  let pinned: string | undefined;
  for (const r of runs) if (r.step?.repinned) pinned = r.step.repinned;
  const bad = (what: string, why: string, extra?: Partial<RerecordDiagnostic>): RerecordVerdict => ({
    ok: false,
    ...(pinned ? { pinned } : {}),
    diagnostic: { code: 'needs-rerecord', step: stepId, what, why, fix, severity: 'error', ...extra },
  });

  if (!runs.length) {
    return bad(`${stepId} was not re-recorded — no run completed`, 'the flow never ran');
  }
  const last = runs[runs.length - 1];
  if (!last.step) {
    return bad(
      `${stepId} was not re-recorded — the last run never reached it`,
      `an earlier step halted the flow. ${trail}`,
    );
  }
  if (!pinned) {
    return bad(
      `${stepId} has no procedure after re-recording — nothing was pinned to it`,
      notes.length
        ? `the store's re-pin rule refused the result — ${notes.join('; ')}. ${trail}`
        : `the agent ran the step but the store's re-pin rule refused the result (a recovery that needed model gestures beyond its replay, or a locator carrying a value this run minted). ${trail}`,
      { fix: `${fix} --instruction "<a clearer instruction for this step>"` },
    );
  }
  if (last.step.status !== 'success') {
    return bad(
      `${stepId} did not pass on its last run after re-recording`,
      `pinned ${pinned}, then ${last.label} reported ${last.step.status}${last.step.summary ? `: ${last.step.summary}` : ''}. ${trail}`,
      { fix: `${fix} --instruction "<a clearer instruction for this step>"` },
    );
  }
  if (last.step.tier !== 'A') {
    return bad(
      `${stepId} still needs the model after re-recording — its new procedure did not replay cleanly`,
      `pinned ${pinned}, but ${last.label} ran the step at tier ${last.step.tier ?? 'none'}${last.step.fellBack ? ` (${last.step.fellBack})` : ''}; a compiled spec has no model to fall back on. ${trail}`,
      { fix: `${fix} --runs 3` },
    );
  }
  const covering = replayedSkillId(last.step.replayed);
  if (covering && covering !== pinned) {
    return bad(
      `${stepId} only passes because the engine replays ${covering} instead of its new pin ${pinned}`,
      `the re-recording pinned ${pinned}, but ${last.label} replayed ${covering}; a compiled spec emits the pin and halts here. ${trail}`,
      { fix: `${fix} --instruction "<an instruction that describes what this step should do>"` },
    );
  }
  return { ok: true, pinned, runs: runs.length };
}

/** The step's result in one run, by id. */
export function stepOf(steps: FlowStepResult[] | undefined, stepId: string): FlowStepResult | undefined {
  return steps?.find((s) => s.id === stepId);
}
