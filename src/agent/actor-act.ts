import type { Page } from 'playwright-core';
import type { LoopActor, ShadowTurn } from './loop.js';
import type { ToolCall } from './llm.js';
import type { SystemOne } from './system-one.js';
import { gateFor, type DecisionSink } from './decide.js';
import { buildCandidates, focusObservation, observeControls, type ActorCandidate, type ActorControl, type ActorOperation, type ControlIdentity, type TaskValue } from './actor.js';
import { actorTurnSite, type TurnAction, type TurnReadingDetail } from './actor-jev.js';

/**
 * PLAN-jev.md §4c step 7, behind a flag: the System One actor ACTS.
 *
 * The shadow (actor-jev.ts) scored Jev against the model's own next action,
 * which assumes the model is the reference. Re-reading its log showed that to
 * be the wrong yardstick: 22 of 49 "disagreements" were Jev picking the action
 * the model took one to three turns later, after a snapshot or a screenshot.
 * Agreement cannot tell early from wrong. Only a run scored by the bench's own
 * verifiers can, and that needs a tier that acts.
 *
 * So this is the smallest acting tier that can be measured safely:
 *
 *  - It takes ONLY element actions whose failure is visible: click, fill,
 *    select, check. Never `done`, `read`, `wait`, `goto` — Jev writes no report
 *    and its early `done` picks sat at ~0.5 while the model was still reading
 *    the values the report needed.
 *  - Code holds the element and the string. Jev returns a candidate id; the
 *    selector is built from the control's identity and must resolve to exactly
 *    one element, or the turn goes to the model.
 *  - The model is the fallback for everything: a deferral, a failed action, a
 *    repeat, a control whose name says it destroys something the task did not
 *    ask to destroy. After one failed action the tier is silent for the rest
 *    of the instruction.
 *  - What it did is written into the conversation as an ordinary tool call and
 *    result, so the model that follows it is told, not left to guess.
 */

/** Names the gate (decide.ts GATES) and the rows in system-one.jsonl. */
export const ACTOR_ACT_SITE = 'actor.act';

/** Operations this tier will take. Everything else is the model's. */
const ACT_OPS: ReadonlySet<ActorOperation> = new Set(['click', 'fill', 'select', 'check', 'uncheck']);

/** Actions per instruction. A task that needs more than this is not routine. */
const MAX_ACTS = 12;

/**
 * A control named for something that cannot be undone is taken only when the
 * instruction uses the same word. Cheap, and it is the one class of wrong
 * click the step's own outcome cannot put right.
 */
const DESTRUCTIVE = /\b(delete|remove|archive|discard|cancel|reset|pay|send|sign out|log ?out)\b/i;

export interface ActingActorOptions {
  sink: DecisionSink;
  onProgress?: (message: string) => void;
  /**
   * Ask, log, never act — the control arm. jakb1's acting runs used fewer model
   * calls than its model-only runs while acting on <1% of asks, which nothing in
   * this path explains; a muted arm says whether merely asking changes anything.
   */
  mute?: boolean;
}

const quote = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** The control's identity as selectors, strongest first — the recorder's own order. */
export function selectorsFor(identity: ControlIdentity): string[] {
  const out: string[] = [];
  if (identity.testid) out.push(`[data-testid="${quote(identity.testid)}"]`);
  if (identity.role && identity.name) out.push(`role=${identity.role}[name="${quote(identity.name)}"]`);
  if (identity.elementId && /^[A-Za-z][\w-]*$/.test(identity.elementId)) out.push(`#${identity.elementId}`);
  if (identity.placeholder) out.push(`[placeholder="${quote(identity.placeholder)}"]`);
  return out;
}

/** The first selector that names exactly one visible element, or null. */
async function uniqueSelector(page: Page, identity: ControlIdentity): Promise<string | null> {
  for (const selector of selectorsFor(identity)) {
    const loc = page.locator(selector);
    const n = await loc.count().catch(() => 0);
    if (n === 1 && (await loc.isVisible().catch(() => false))) return selector;
  }
  return null;
}

/** The tool call for a candidate, or null when the ballot entry lacks what the tool needs. */
export function toolCallFor(candidate: ActorCandidate, selector: string, values: readonly TaskValue[], id: string): ToolCall | null {
  const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id, name, args, rawArgs: JSON.stringify(args) });
  switch (candidate.operation) {
    case 'click':
      return call('click', { target: selector });
    case 'fill': {
      const value = values.find((v) => v.ref === candidate.valueRef);
      return value ? call('fill', { target: selector, value: value.text }) : null;
    }
    case 'select':
      return candidate.option ? call('select', { target: selector, option: candidate.option }) : null;
    case 'check':
      return call('check', { target: selector });
    case 'uncheck':
      return call('check', { target: selector, checked: false });
    default:
      return null;
  }
}

/** Why code refuses a pick Jev was confident about, or null. */
/** Words that say an existing value is to be replaced. */
const CHANGES_A_VALUE = /\b(change|edit|update|replace|rename|correct|set|modify|increase|decrease|clear)\b/i;

export function refusal(candidate: ActorCandidate, instruction: string, detail: TurnReadingDetail | undefined, control?: ActorControl): string | null {
  if (!ACT_OPS.has(candidate.operation)) return `${candidate.operation} is the model's to take`;
  if (!candidate.target) return 'the pick names no control';
  if (detail?.kindConflict) return 'the pick and the turn kind disagree';
  const name = candidate.target.identity.name ?? candidate.target.identity.label ?? '';
  const word = DESTRUCTIVE.exec(name)?.[1];
  if (word && !instruction.toLowerCase().includes(word.toLowerCase())) return `"${name}" destroys something the task does not mention`;
  // A field that already holds something is only typed over when the task says
  // to change a value. jakb1's two actions both overwrote a live filter.
  if (candidate.operation === 'fill' && control?.value && !CHANGES_A_VALUE.test(instruction)) {
    return 'the field already holds a value and the task does not say to change one';
  }
  return null;
}

export function actingActor(client: SystemOne, opts: ActingActorOptions): LoopActor {
  const history: TurnAction[] = [];
  const taken = new Set<string>();
  let instruction = '';
  let acts = 0;
  let silenced = false;
  let revision = 0;
  let last: { key: string; row: Parameters<DecisionSink>[0] } | null = null;

  return {
    async next(ctx: ShadowTurn) {
      if (ctx.instruction !== instruction) {
        instruction = ctx.instruction;
        history.length = 0;
        taken.clear();
        acts = 0;
        silenced = false;
      }
      if (silenced || acts >= MAX_ACTS || !ctx.browser.isOpen) return null;
      const page = await ctx.browser.getPage().catch(() => null);
      if (!page) return null;
      const seen = await observeControls(page, `act${++revision}`);
      if (!seen) return null;
      const observation = focusObservation(seen, instruction);
      const { candidates, values } = buildCandidates({ observation, instruction });
      const started = Date.now();
      const reading = await actorTurnSite.run(client, { instruction, observation, candidates, values, history }, {}).catch(() => null);
      const ms = Date.now() - started;
      if (!reading) return null;

      const gate = gateFor(ACTOR_ACT_SITE);
      const detail = reading.detail as unknown as TurnReadingDetail | undefined;
      const row = {
        site: ACTOR_ACT_SITE,
        model: client.model,
        options: reading.options,
        chosen: reading.chosen,
        confidence: reading.confidence,
        ms,
        detail: { turn: ctx.turn, url: observation.url, operation: reading.value?.operation ?? null, kind: detail?.kind ?? null, controls: observation.controls.length, controlsSeen: seen.controls.length } as Record<string, string | number | null>,
      };
      const defer = (why: string) => {
        opts.sink({ ...row, outcome: 'deferred', why });
        return null;
      };
      const picked = reading.value;
      if (!picked) return defer(reading.why ?? 'no pick');
      if (reading.confidence < gate) return defer(`below gate ${gate}`);
      const refused = refusal(picked, instruction, detail, observation.controls.find((c) => c.id === picked.target?.control));
      if (refused) return defer(refused);
      const selector = await uniqueSelector(page, picked.target!.identity);
      if (!selector) return defer('the control does not resolve to exactly one visible element');
      const call = toolCallFor(picked, selector, values, `jev_${ctx.turn}_${acts + 1}`);
      if (!call) return defer('the pick lacks the value its tool needs');
      if (opts.mute) return defer('muted: would have acted');
      const key = `${call.name} ${call.rawArgs}`;
      if (taken.has(key)) return defer('this exact action was already taken for this instruction');

      taken.add(key);
      acts++;
      row.detail.tool = call.name;
      row.detail.target = selector;
      last = { key, row: { ...row, outcome: 'acted' } };
      opts.onProgress?.(`[actor] turn ${ctx.turn}: jev ${call.name} ${selector} (${reading.confidence.toFixed(2)}, ${ms}ms)`);
      return { call, ms };
    },

    observed(call, outcome) {
      history.push({ tool: call.name, summary: summarize(call.args), ok: outcome.ok });
      if (!last || `${call.name} ${call.rawArgs}` !== last.key) return;
      // One failure and the tier is silent: the model recovers, with the
      // failed call and its error in front of it.
      if (!outcome.ok) silenced = true;
      opts.sink({ ...last.row, verified: outcome.ok });
      last = null;
    },
  };
}

function summarize(args: Record<string, unknown> | null): string {
  if (!args) return '';
  if (Array.isArray(args.steps)) return `[${args.steps.length} steps]`;
  const s = JSON.stringify(args);
  return s.length > 100 ? s.slice(0, 100) + '…' : s;
}
