import type { TaskValue } from '../agent/actor.js';
import { jevDecider, type DecisionSink, type JevSite, type Reading } from '../agent/decide.js';
import { agreement, choice, minConfidence, type ChoiceAnswer, type SystemOne } from '../agent/system-one.js';
import type { ContestQuery, MatchQuery, MatchSkill, PickLiteral } from './paraphrase.js';
import type { Skill } from './store.js';

/**
 * The two System One sites behind paraphrase.ts (PLAN-jev.md §6, bet 1).
 *
 * Both follow the rules the earlier sites paid for: the instruction lives in
 * the QUESTION, the question is about what the texts SAY (never what would
 * happen), both option orders ride in one request and must agree, and the
 * confidence is the weaker of the two.
 */

/** A template is shown whole up to this: enough for a long instruction, bounded for the state. */
const TEMPLATE_CHARS = 600;

const ASK_MATCH =
  'A browser automation tool keeps stored procedures. `instruction` is a new request. `procedures` lists each stored procedure by the request it was recorded for; a mark like {{v1}} is a blank that takes a name, a reference or a number. Which stored procedure carries out EXACTLY what `instruction` asks — all of it and nothing more? A procedure that does only part of it, or that also does something the instruction does not ask for, is not a match. If no procedure is an exact match, answer none.';
const ASK_MATCH_REVERSED =
  'The request `instruction` has arrived. Each entry of `procedures` is the wording a stored procedure was recorded under, with {{vN}} standing for a blank. Pick the one entry whose task is the same task as the instruction — the same things done, no more and no fewer — or pick none if there is no such entry.';

/** Offline (bench/jev-match-offline.mjs): 0 wrong procedures in 600 at >= 0.7; 0.8 is the working gate. */
export const matchParaphraseSite: JevSite<MatchQuery, Skill> = {
  site: 'match.paraphrase',
  async run(client: SystemOne, input: MatchQuery, ctx): Promise<Reading<Skill> | null> {
    if (!input.skills.length) return null;
    // One entry per WORDING: variants of a procedure share a template, and offering the
    // same text twice only splits the vote. The first is the store's own best (caller's order).
    const byTemplate = new Map<string, Skill>();
    for (const s of input.skills) if (!byTemplate.has(s.template)) byTemplate.set(s.template, s);
    const entries = [...byTemplate.values()];
    const options: Record<string, string> = {};
    entries.forEach((s, i) => (options[`p${i}`] = s.template.slice(0, TEMPLATE_CHARS)));
    options.none = 'none of these procedures does exactly this';
    const reversed = Object.fromEntries(Object.entries(options).reverse());
    const res = await client.ask(
      { instruction: input.instruction, procedures: options },
      { pick: choice(ASK_MATCH, options), reversed: choice(ASK_MATCH_REVERSED, reversed) },
      { signal: ctx.signal },
    );
    const a = res.answers as { pick: ChoiceAnswer; reversed: ChoiceAnswer };
    const agreed = agreement([a.pick.choice, a.reversed.choice]);
    const base = { options: entries.length + 1, chosen: a.pick.choice, detail: { instruction: input.instruction.slice(0, 200) } };
    if (!agreed) return { ...base, value: null, confidence: 0, why: `the two option orders disagreed (${a.pick.choice} vs ${a.reversed.choice})` };
    const skill = agreed === 'none' ? null : entries[Number(agreed.slice(1))] ?? null;
    return {
      ...base,
      chosen: agreed,
      value: skill,
      confidence: minConfidence([a.pick.confidence, a.reversed.confidence]),
      ...(skill ? { detail: { ...base.detail, skill: skill.id, template: skill.template.slice(0, 200) } } : { why: 'none' }),
    };
  },
};

const askSlot = (slot: string, example: string): string =>
  `A stored browser procedure was recorded under the wording in \`procedure\`, where {{${slot}}} is a blank. When it was recorded that blank held ${JSON.stringify(example)}. A NEW request, \`instruction\`, asks for the same kind of task with its own values; \`literals\` lists the values of the new request that could go there. Which entry of \`literals\` belongs in the blank {{${slot}}} for the new request — the value that plays the same role there as ${JSON.stringify(example)} did? If none of them does, answer none.`;
const askSlotReversed = (slot: string, example: string): string =>
  `\`literals\` are values stated by the request \`instruction\`. The stored procedure \`procedure\` has a blank {{${slot}}} that was filled with ${JSON.stringify(example)} in the original recording. Choose the literal that should fill {{${slot}}} now, playing the same role; choose none if none of them is that value.`;

/** Offline (bench/jev-bind-offline.mjs): Jev's real errors on contested blanks sat under 0.8. */
export const bindContestedSite: JevSite<ContestQuery, TaskValue> = {
  site: 'bind.contested',
  async run(client: SystemOne, input: ContestQuery, ctx): Promise<Reading<TaskValue> | null> {
    if (input.candidates.length < 2) return null;
    const example = input.skill.params[input.slot]?.example ?? '';
    const options: Record<string, string> = {};
    input.candidates.forEach((c, i) => (options[`l${i}`] = c.text));
    options.none = 'none of these is that value';
    const reversed = Object.fromEntries(Object.entries(options).reverse());
    const res = await client.ask(
      { instruction: input.instruction, procedure: input.skill.template.slice(0, TEMPLATE_CHARS), literals: options },
      { pick: choice(askSlot(input.slot, example), options), reversed: choice(askSlotReversed(input.slot, example), reversed) },
      { signal: ctx.signal },
    );
    const a = res.answers as { pick: ChoiceAnswer; reversed: ChoiceAnswer };
    const agreed = agreement([a.pick.choice, a.reversed.choice]);
    const base = { options: input.candidates.length + 1, chosen: a.pick.choice, detail: { skill: input.skill.id, slot: input.slot, example } };
    if (!agreed) return { ...base, value: null, confidence: 0, why: `the two option orders disagreed (${a.pick.choice} vs ${a.reversed.choice})` };
    const value = agreed === 'none' ? null : input.candidates[Number(agreed.slice(1))] ?? null;
    return {
      ...base,
      chosen: agreed,
      value,
      confidence: minConfidence([a.pick.confidence, a.reversed.confidence]),
      ...(value ? { detail: { ...base.detail, value: value.text } } : { why: 'none' }),
    };
  },
};

export const jevMatchSkill = (client: SystemOne, log?: DecisionSink): MatchSkill => jevDecider(client, matchParaphraseSite, log);
export const jevPickLiteral = (client: SystemOne, log?: DecisionSink): PickLiteral => jevDecider(client, bindContestedSite, log);
