import type { Page } from 'playwright-core';
import { candidateExpr, makeLocator, type LocatorCandidate } from '../daemon/recorder.js';
import { gateFor, jevDecider, type DecisionSink, type JevSite, type Reading } from '../agent/decide.js';
import type { SystemOne } from '../agent/system-one.js';
import {
  interactiveRows,
  kindFamily,
  liveKind,
  recordedKindOf,
  renderSnapshot,
  type ProposeContext,
  type SnapshotRow,
} from './repair.js';
import { candidateRows, repairProposeSite } from './repair-jev.js';
import type { HealProposal, HealRequest, InlineHealer } from './replay.js';

/**
 * Site B of PLAN-jev.md: inline replay healing.
 *
 * B IS SITE A, ASKED AT A DIFFERENT MOMENT. When a daemon replay finds that
 * every locator in a step's chain misses, today the step fails and goes to a
 * full agent recovery — 30-80s on repairdesk, 43 model turns on one odoo case
 * — and most such misses are a control that was renamed or moved, which is
 * precisely the question `repair.propose` answers post-session. So the chooser
 * is reused verbatim (`repairProposeSite.run`): same ballot, same two option
 * orders, same gone-noul veto, same code-built locator. Nothing here asks Jev
 * anything site A does not already ask it.
 *
 * What is different is the CONSEQUENCE, and everything in this file is about
 * that:
 *
 *  - it runs under its own site name, so it has its own gate. A proposal
 *    reviewed after the fact by `patchSegment`, stored as a provisional
 *    variant that must earn adoption, can be gated at 0.85. This one acts on
 *    the live page immediately, with no human and no later review, so it takes
 *    `gateFor`'s strict unlisted default (0.9) — and a deferral costs exactly
 *    what the tool cost before site B existed.
 *  - it VERIFIES before returning. `patchSegment` refuses a proposal that does
 *    not resolve to exactly one element of the recorded kind; that check is
 *    the only thing standing between the measured weakness of this chooser (N
 *    identically named rows, picked at <=0.77) and a step acting on the wrong
 *    row. Post-session that check happens after the proposal; here it has to
 *    happen BEFORE acting, so it is made here (and, belt and braces, again in
 *    replay.ts, which is the module that will actually act).
 *  - it changes NOTHING that is stored. The healed locator travels out on the
 *    drift ticket with the live page's rows attached; the chain is patched
 *    only later, by the ordinary drain, and only for a run that got past the
 *    step. That is the rule `recordCandidateEvidence` already enforces for
 *    every other kind of locator evidence, and healing has no business being
 *    the exception.
 */

/** Names the gate (decide.ts `gateFor`) and the decision rows in system-one.jsonl. */
export const REPLAY_HEAL_SITE = 'replay.heal';

/**
 * The verdict row's site. A `SystemOneDecision` carries `verified`, but the
 * heal row is written by `jevDecider` the moment the answer is read — seconds
 * before the step's own gates say whether it was right — and the sink is
 * append-only (SessionState writes system-one.jsonl line by line). So the
 * label arrives as a SECOND row under this name, keyed by the same
 * skill/step/key in `detail`, and calibration pairs them on that key. An
 * in-place update would mean holding the log open across a browser action,
 * which is a worse thing to own than a join.
 */
export const REPLAY_HEAL_VERDICT_SITE = 'replay.heal.verdict';

/**
 * How many of the live page's rows ride along on the drift ticket.
 *
 * This is the labelled-data half of the site (PLAN-jev.md, step-1 status, last
 * bullet): site A has NO offline corpus because nothing ever persisted the
 * element list a proposal was made against, so `bench/jev-repair-probe.mjs` is
 * synthetic. A heal already holds that list; storing it makes every repair
 * this tool performs a replayable case. Bounded because a ticket ends up in a
 * sweep sidecar and the cap is about file size, not about the question — the
 * ballot itself is capped at 40 rows by the chooser.
 */
export const HEAL_TICKET_ROWS = 60;

/** The drift ticket a heal is asked under: what the chooser reads, and nothing else. */
function healContext(req: HealRequest, rows: SnapshotRow[]): ProposeContext {
  const recorded = recordedKindOf(req.step, req.chain);
  return {
    skill: req.skill,
    // Shaped like the post-session ticket the chooser normally gets, because
    // it is the same question about the same step — `atStep`/`key` are what
    // its state actually renders. The fields that describe a RUN's telemetry
    // (similarity, the fallback that stood in) have no answer yet: nothing has
    // stood in, which is why this is being asked.
    ticket: {
      flow: '',
      step: req.tag,
      skill: req.skill.id,
      atStep: req.tag,
      key: req.key,
      similarity: null,
      missedLocator: req.chain[0] ? candidateExpr(req.chain[0]) : null,
      fallbackUsed: null,
      recovered: false,
    },
    chain: req.chain,
    rows,
    snapshot: renderSnapshot(rows),
    ...(recorded ? { recordedKind: recorded.label, recordedFamilies: recorded.families } : {}),
    tool: req.step.tool,
  };
}

/** The chooser, under site B's name so it takes site B's gate. Same `run`, deliberately. */
export const healProposeSite: JevSite<ProposeContext, LocatorCandidate> = {
  site: REPLAY_HEAL_SITE,
  run(client: SystemOne, input: ProposeContext, ctx): Promise<Reading<LocatorCandidate> | null> {
    return repairProposeSite.run(client, input, ctx);
  },
};

/**
 * Does this proposal name exactly one element of the recorded kind, right now?
 *
 * The same two questions `patchSegment` asks, in the same order and for the
 * same reasons: resolving is not intent, and a textbox's repair may not be a
 * button. Returns null when it passes, else why it did not — which is logged,
 * because a confident pick that fails this check is the most interesting row
 * in the calibration set.
 */
async function refuse(page: Page, input: ProposeContext, proposed: LocatorCandidate): Promise<string | null> {
  let count = 0;
  try {
    count = await makeLocator(page, proposed).count();
  } catch {
    count = 0;
  }
  if (count !== 1) return `${candidateExpr(proposed)} matched ${count} element(s)`;
  const families = input.recordedFamilies ?? [];
  if (!families.length) return null;
  const live = await liveKind(page, proposed);
  const family = live ? kindFamily(live) : null;
  // Unreadable kind is not a refusal: `patchSegment` takes such a proposal on
  // trust and says so. Here the step's own gates are the ones that will say.
  if (!live || !family) return null;
  return families.includes(family) ? null : `${candidateExpr(proposed)} is a ${live.role ?? live.tag}, the recorded control was a ${input.recordedKind ?? families.join('/')}`;
}

/**
 * The `InlineHealer` replay takes, backed by Jev.
 *
 * A plain `Decider` under the hood, so the composition root composes or omits
 * it exactly as it composes site A's proposer: with no System One tier the
 * daemon registers nothing and `replaySkill` runs the code path that existed
 * before this file did.
 */
export function inlineHealer(client: SystemOne, log?: DecisionSink): InlineHealer {
  const decide = jevDecider(client, healProposeSite, log);
  return async (req: HealRequest): Promise<HealProposal | null> => {
    const rows = await interactiveRows(req.page);
    const input = healContext(req, rows);
    // Nothing of the recorded kind on the page is not a deferral, it is an
    // empty ballot: the chooser answers null and no request is spent.
    if (!candidateRows(input).length) return null;

    const proposed = await decide(input, req.signal ? { signal: req.signal } : {});
    if (!proposed) return null;

    const why = await refuse(req.page, input, proposed);
    if (why) {
      // The pick cleared the gate and the deterministic check refused it —
      // exactly the label the gate is calibrated from, so it is logged as a
      // verdict row rather than silently dropped.
      log?.({
        site: REPLAY_HEAL_VERDICT_SITE,
        model: client.model,
        options: 1,
        chosen: candidateExpr(proposed),
        confidence: 0,
        outcome: 'deferred',
        verified: false,
        why,
        detail: { skill: req.skill.id, step: req.tag, key: req.key, stage: 'pre-act' },
      });
      return null;
    }

    return {
      candidate: proposed,
      note: `healed inline: the step ran on ${candidateExpr(proposed)}, proposed from the live page (nothing in the recorded chain resolved)`,
      rows: rows.slice(0, HEAL_TICKET_ROWS),
      settled: (verified) =>
        log?.({
          site: REPLAY_HEAL_VERDICT_SITE,
          model: client.model,
          options: 1,
          chosen: candidateExpr(proposed),
          confidence: 0,
          outcome: verified ? 'acted' : 'deferred',
          verified,
          ...(verified ? {} : { why: "the step's own expectations refused the healed locator" }),
          detail: { skill: req.skill.id, step: req.tag, key: req.key, stage: 'verified' },
        }),
    };
  };
}

/**
 * The composed healer: Jev, or nothing at all. Mirrors `cascadeProposer` —
 * there is no second tier to cascade to here, because the tier BEHIND a heal
 * is the model recovery the daemon already runs when a step fails, and
 * returning null is how this healer asks for it.
 *
 * `client` is passed in rather than resolved here: only the composition root
 * asks whether the tier exists (test/decide.test.ts enforces it).
 */
export function healerFor(client: SystemOne | null | undefined, log?: DecisionSink): InlineHealer | null {
  return client ? inlineHealer(client, log) : null;
}

/** The gate this site runs at, for a report or a config print. */
export function healGate(): number {
  return gateFor(REPLAY_HEAL_SITE);
}
