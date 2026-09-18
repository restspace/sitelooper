import type { SystemOne, SystemOneDecision } from './system-one.js';

/**
 * How a call site uses the System One tier without knowing it exists.
 *
 * A site that needs a decision calls ONE `Decider`. What is behind it — Jev,
 * the model, a shape heuristic, or a cascade of them — is settled once, at the
 * composition root (the daemon, the repair CLI). No site asks "is Jev
 * available?"; with Jev off the cascade simply has one element fewer, and what
 * remains is, element for element, the code path that existed before.
 *
 * Everything a Jev decision repeats — the throw, the timeout, `none`, the
 * confidence gate, the calibration log — lives in `jevDecider`, so a new site
 * is three pure functions and no new control flow.
 */

export interface DecideCtx {
  signal?: AbortSignal;
}

/** A decision that can decline: null is "no opinion", and the next decider is asked. */
export type Decider<I, O> = (input: I, ctx?: DecideCtx) => Promise<O | null>;

/** The first opinion wins. A decider that throws has no opinion. */
export function cascade<I, O>(...deciders: Array<Decider<I, O> | null | undefined | false>): Decider<I, O> {
  const chain = deciders.filter(Boolean) as Decider<I, O>[];
  return async (input, ctx) => {
    for (const d of chain) {
      try {
        const out = await d(input, ctx);
        if (out !== null) return out;
      } catch (err) {
        // The LAST decider is the pre-existing path: its failure is the
        // site's failure, exactly as it was before there was a cascade.
        if (d === chain[chain.length - 1]) throw err;
      }
    }
    return null;
  };
}

/**
 * Confidence a site's answer must clear to be acted on, by site name. One
 * table, so thresholds are read (and recalibrated from system-one.jsonl) in
 * one place rather than found as literals at each site. Per SITE because the
 * docs are explicit that thresholds do not transfer between primitives, and
 * because the cost of a wrong answer differs: a proposal a verifier checks can
 * be gated lower than a click nothing checks.
 */
export const GATES: Record<string, number> = {
  // Site A. Calibrated on bench/jev-repair-probe.mjs (15 synthetic cases x 3,
  // dead chains copied from the published drift sidecars): correct picks sit
  // at 0.78-0.99 (median 0.99); the only wrong answers — N identically named
  // rows, which patchSegment's resolves-to-one check refuses anyway — top out
  // at 0.77. 0.85 clears every wrong answer and keeps 9 of 11 pick cases.
  // Deferring costs exactly what the tool cost before, so err high first and
  // revisit once system-one.jsonl has volume.
  // §4c step 7, the acting actor. From the shadow log (fwrdj4-n1, 87 turns):
  // element actions Jev picked that the model then took sit at 0.76-0.99; the
  // element actions nothing the model did ever matched top out at 0.69. One
  // run, so this is a starting point for the A/B, not a calibration.
  'actor.act': 0.75,
  'repair.propose': 0.85,
  // Site B. Same chooser as repair.propose, different consequence: it acts on
  // the live page with no human and no later variant review, so it is
  // stricter. Probe: wrong answers top out at 0.77-0.80 and are the
  // duplicate-row shape the resolves-to-one check refuses anyway; correct picks
  // sit 0.78-0.99, median 0.99. Deferring costs what the step cost before.
  //
  // It started at 0.9 and healed NOTHING on the first live drift (repairdesk
  // add-part-moved, fwrdj2heal-*): the right control, `button testid=part-attach
  // "Attach part"`, was picked in both option orders on all four asks, at 0.83,
  // 0.65, 0.86 and 0.59. A real renamed-and-moved control simply scores lower
  // than the synthetic ones. 0.6 is where one of the two dead steps heals; it
  // is safe to sit this low only because four guards stand behind it — both
  // orders agree, the locator resolves to exactly ONE element, of the recorded
  // KIND, and the step's own expectations verify the result (unverifiable
  // clicks are never healed). n=4, all correct: recalibrate from
  // replay.heal.verdict rows as they accumulate.
  'replay.heal': 0.6,
  // Site C. bench/readback-offline.mjs --probe (8 labelled shapes x 3 from the
  // repairdesk recordings): correct picks 0.38-0.93 (median 0.75), every wrong
  // pick tops out at 0.31 — a TOTAL read back off a part row, a customer off a
  // list row, both with the orders agreeing, so the number has to catch them.
  // Deferring costs what the site cost before (the model's locate turn).
  // n=24, one app: recalibrate from system-one.jsonl.
  'readback.locate': 0.6,
  // Sites I and J, advisory. From bench/jev-zoo.mjs: occurrence readings are
  // 100% right in every confidence bucket over 0.2 and contradict the rules
  // on 1.1% of ordinary corpus pairs at 0.6; expectation readings are 100%
  // right over 0.6. While advisory the gate only labels log rows acted /
  // deferred — it is here so promotion starts from a measured number.
  'triage.occurrence': 0.6,
  'triage.expectation': 0.6,
};

/** A site's gate; an unlisted site gets a strict default rather than none. */
export function gateFor(site: string): number {
  return gateOverrides()[site] ?? GATES[site] ?? 0.9;
}

/**
 * SITELOOPER_JEV_GATES='{"replay.heal":0.6}' — for calibration runs only: a
 * gate is set from what a site does at several values, and that cannot be
 * measured without moving it. Malformed JSON is ignored rather than fatal;
 * a bench run must not die on a typo, and the table above still applies.
 */
function gateOverrides(): Record<string, number> {
  const raw = process.env.SITELOOPER_JEV_GATES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** What a site read out of Jev's answers, before the gate. */
export interface Reading<O> {
  /** The decision, or null when the answers amount to none (`none of these`, a veto noul, …). */
  value: O | null;
  /** The label chosen, for the log. */
  chosen: string | null;
  /** The decision's confidence — for a composite, its weakest answer (minConfidence). */
  confidence: number;
  /** How many options/shards it ranged over. */
  options: number;
  /** Why `value` is null, when it is. */
  why?: string;
  detail?: SystemOneDecision['detail'];
}

export interface JevSite<I, O> {
  /** Names the gate and the log rows, e.g. 'repair.propose'. */
  site: string;
  /**
   * Ask whatever the site needs — one `ask`, or a `mapReduce` — and read the
   * answers. Return null when there is nothing to ask (no candidates): that is
   * not a decision and is not logged. May throw; a throw is "no opinion".
   */
  run(client: SystemOne, input: I, ctx: DecideCtx): Promise<Reading<O> | null>;
}

export type DecisionSink = (d: SystemOneDecision) => void;

/**
 * A Jev-backed decider. Declines (null) when the ask failed or timed out, when
 * the reading is null, or when confidence is under the site's gate; logs every
 * reading either way, because the deferred ones are half the calibration set.
 */
export function jevDecider<I, O>(client: SystemOne, site: JevSite<I, O>, log?: DecisionSink): Decider<I, O> {
  return async (input, ctx = {}) => {
    const started = Date.now();
    let reading: Reading<O> | null;
    try {
      reading = await site.run(client, input, ctx);
    } catch {
      return null;
    }
    if (!reading) return null;
    const gate = gateFor(site.site);
    const acted = reading.value !== null && reading.confidence >= gate;
    log?.({
      site: site.site,
      model: client.model,
      options: reading.options,
      chosen: reading.chosen,
      confidence: reading.confidence,
      outcome: acted ? 'acted' : 'deferred',
      ...(acted ? {} : { why: reading.why ?? (reading.value === null ? 'none' : `below gate ${gate}`) }),
      ...(reading.detail !== undefined ? { detail: reading.detail } : {}),
      ms: Date.now() - started,
    });
    return acted ? reading.value : null;
  };
}

/**
 * Run `shadowed` beside the authoritative decider and log whether they agree —
 * the authoritative answer is ALWAYS what is returned, and the shadow can
 * neither delay it past `waitMs` nor fail it. This is how a site earns trust
 * before it gets a say: advisory first, and the disagreements are the dataset.
 *
 * The shadow is a plain Decider, so it is usually `jevDecider(...)` with its
 * own sink; `onCompare` adds the agreement row.
 */
export function shadow<I, O>(
  authoritative: Decider<I, O>,
  shadowed: Decider<I, O> | null | undefined | false,
  onCompare: (input: I, authoritative: O | null, shadowed: O | null) => void,
  opts: { waitMs?: number } = {},
): Decider<I, O> {
  if (!shadowed) return authoritative;
  return async (input, ctx) => {
    const side = shadowed(input, ctx).catch(() => undefined);
    const out = await authoritative(input, ctx);
    const compare = side.then((s) => {
      if (s !== undefined) onCompare(input, out, s);
    });
    if (opts.waitMs) await Promise.race([compare, new Promise((r) => setTimeout(r, opts.waitMs))]);
    return out;
  };
}
