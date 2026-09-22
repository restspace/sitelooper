import type { Page } from 'playwright-core';
import { estimateTokens } from './system-one.js';

/**
 * Step 5 of notes/PLAN-jev.md, half one: EXECUTABLE CANDIDATE GENERATION.
 *
 * §4c's bet is that most routine turns of first-contact authoring are a choice
 * among actions the page mechanically offers, not an act of generation. This
 * module is the deterministic half of that claim — "code enumerates" — and it
 * contains no Jev, no model and no I/O beyond one read-only look at the page.
 * Everything here is a pure function of an observation plus the instruction
 * text, so the whole candidate model is testable without a browser and without
 * a key (test/actor.test.ts).
 *
 * The unit is a CANDIDATE: an executable object with provenance —
 * `{id, observationId, operation, target, valueRef, description}` — exactly as
 * notes/ASTRA_JEV_RECOMMENDATIONS.md specifies. A decider picks an `id`; code holds
 * the element identity and the exact string. Nothing a decider says can widen
 * what may happen, which is the whole containment argument of this tier.
 *
 * WHAT THIS DELIBERATELY DOES NOT GENERATE — being honest about it is the
 * point, because coverage (was the right action even on the ballot?) is a
 * first-class failure mode, and a measurement that hides its blind spots
 * measures nothing:
 *
 *  - `eval` / arbitrary JavaScript. The escape hatch is unbounded by
 *    construction; enumerating it is enumerating "any program".
 *  - FREE-TEXT VALUES. Values come from the instruction's own literals (see
 *    extractValues). A summary the model composes, a name it invents, a date
 *    it computes from "next Tuesday" — none of those are here. Step 6's task
 *    contract is where typed inputs are supposed to come from; until then a
 *    turn whose value is not written in the instruction is a coverage miss,
 *    and it SHOULD show up as one.
 *  - MULTI-STEP PLANS (`batch`). A batch is several decisions an actor would
 *    take one at a time; the shadow scores its first step and records the
 *    count. Enumerating sequences would be enumerating the cross product of
 *    everything below.
 *  - `drag`, `upload`, `download`, `set_viewport`, `set_offline`,
 *    `fetch_source`, `screenshot`, `run_skill`, `tabs`. Rare, and each needs an
 *    argument (a path, a size, a skill's params) that is not on the page.
 *  - Scrolling to reveal more page. `scroll_into_view` is a mechanical
 *    consequence of acting, and a virtualised list that hides its rows is a
 *    COVERAGE problem the observation reports, not an action to pick.
 *  - Anything about an element the observation could not see: a closed shadow
 *    root, a frame it could not read, a row a virtualised grid has not
 *    rendered. `ActorObservation.truncated` says when absence is not
 *    established, and a candidate list is never an assertion that nothing else
 *    exists.
 */

// --- the observation -----------------------------------------------------------

/** Where a control sits, which is what tells two "Delete" buttons apart. */
export interface ControlContext {
  /** The enclosing dialog's name, when the control is inside one. */
  dialog?: string;
  /** The enclosing record's text (table row, list item), capped — the row identity. */
  row?: string;
  /** The enclosing form/section/region's name, when it has one. */
  section?: string;
  /** Inside the page's own chrome — a nav, header, banner or footer — rather than its content. */
  chrome?: true;
}

/**
 * One live control, as the walk below reads it. Field-for-field this is
 * `SnapshotRow` (skills/repair.ts) plus what an ACTING decision needs and a
 * repairing one does not: the current value, the enabled state, a select's
 * real options, and where the control sits.
 */
export interface ActorControl {
  /** Stable within one observation, DOM order: `c0`, `c1`, … */
  id: string;
  tag: string;
  /** Explicit role, else the tag's implicit one. Never empty. */
  role: string;
  /** Accessible-name-ish text: aria-label, label, placeholder, title or own short text. */
  name?: string;
  label?: string;
  placeholder?: string;
  testid?: string;
  /** The element's `id` attribute (named `elementId` so it cannot be confused with `id`). */
  elementId?: string;
  /** An `<input>`'s type, which alone decides what may be typed into it. */
  type?: string;
  /** The value it currently holds. */
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  /** A `<select>`'s actual option labels, capped — an option that is not there is not a candidate. */
  options?: string[];
  context?: ControlContext;
}

export interface ActorObservation {
  /** Revision id: every candidate carries it, so a stale target can be refused. */
  id: string;
  url: string;
  title?: string;
  controls: ActorControl[];
  /** Visible live-region text (errors, toasts) — evidence for "did that work?". */
  alerts?: string[];
  /** The walk hit a cap: what is NOT listed was not shown to be absent. */
  truncated?: boolean;
}

// --- values from the instruction -------------------------------------------------

/** What kind of thing a literal is, which is what makes a binding legal or not. */
export type ValueKind = 'email' | 'url' | 'number' | 'money' | 'date' | 'text';

export interface TaskValue {
  /** `v0`, `v1`, … — a NAMED ref; the exact string is never regenerated by a decider. */
  ref: string;
  text: string;
  kind: ValueKind;
  /** How it was recognised, for the log: a quoted span is a far stronger signal than a bare word. */
  source: 'quoted' | 'literal';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const MONEY_RE = /^[£$€]\s?\d[\d,]*(?:\.\d+)?$|^\d[\d,]*(?:\.\d+)?\s?(?:USD|GBP|EUR)$/i;
const NUMBER_RE = /^-?\d[\d,]*(?:\.\d+)?$/;
const DATE_RE = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/;

export function valueKind(text: string): ValueKind {
  const t = text.trim();
  if (EMAIL_RE.test(t)) return 'email';
  if (URL_RE.test(t)) return 'url';
  if (DATE_RE.test(t)) return 'date';
  if (MONEY_RE.test(t)) return 'money';
  if (NUMBER_RE.test(t)) return 'number';
  return 'text';
}

/** Longest a literal may be before it is prose rather than a value. */
const MAX_VALUE_CHARS = 120;
/** Enough for any instruction this tool is given; a runaway list is a smell, not a feature. */
export const MAX_VALUES = 12;

/**
 * The literals an instruction states, as named refs.
 *
 * This is the STAND-IN for the task contract (plan step 6). The contract is
 * where named inputs are supposed to come from — from the outer agent, or from
 * one conventional-model interpretation call — and until it exists the honest
 * substitute is what the instruction says in so many words: quoted spans
 * first, then the unquoted literals a person would recognise as values
 * (emails, urls, money, dates, numbers, reference-shaped tokens).
 *
 * Deliberately NOT a paraphraser. "set it to next Tuesday" yields nothing
 * here, and the shadow will record that turn as a coverage miss — which is the
 * correct measurement, not a bug to paper over with a regex.
 */
export function extractValues(instruction: string): TaskValue[] {
  const out: TaskValue[] = [];
  const seen = new Set<string>();
  // Which characters are already spoken for. The patterns run coarse-first, so
  // without this `2026-10-01` would also yield 2026, 10 and 01, and `RD-1013`
  // would yield 1013 — four bindings per value, all of them nonsense, all of
  // them eating the per-field budget that the real value needed.
  const taken: Array<[number, number]> = [];
  const free = (at: number, end: number) => !taken.some(([s, e]) => at < e && end > s);
  const add = (raw: string, at: number, end: number, source: TaskValue['source']) => {
    if (!free(at, end)) return;
    taken.push([at, end]);
    const text = raw.trim();
    if (!text || text.length > MAX_VALUE_CHARS || seen.has(text) || out.length >= MAX_VALUES) return;
    seen.add(text);
    out.push({ ref: `v${out.length}`, text, kind: valueKind(text), source });
  };

  // Quoted spans, straight and curly. A quoted span is the one thing in an
  // instruction that a person meant EXACTLY, so it is bound to fields ahead of
  // everything else — and its INSIDE is consumed with it, so a number inside a
  // quoted phrase is part of the phrase rather than a value of its own.
  for (const m of instruction.matchAll(/"([^"\n]{1,120})"|'([^'\n]{1,120})'|[“„]([^”\n]{1,120})[”]/g)) {
    add(m[1] ?? m[2] ?? m[3] ?? '', m.index!, m.index! + m[0].length, 'quoted');
  }
  // Unquoted literals, coarse first so a compound is never split. Reference-
  // shaped tokens (RD-1013, S00021) are included because an app's own
  // identifiers are the values a procedure most often has to type back.
  const patterns = [
    /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi,
    // Trailing sentence punctuation is not part of a url: "at http://host/,"
    // yielded an address with a comma on it, and `goto` then matched nothing.
    /https?:\/\/[^\s,;)\]"'`]+/gi,
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /[£$€]\s?\d[\d,]*(?:\.\d+)?/g,
    /\b[A-Z][A-Z0-9]*-?\d{2,}\b/g,
    /\b\d[\d,]*(?:\.\d+)?\b/g,
  ];
  for (const re of patterns) for (const m of instruction.matchAll(re)) add(m[0], m.index!, m.index! + m[0].length, 'literal');
  return out;
}

// --- candidates ------------------------------------------------------------------

/**
 * What a candidate DOES. A one-to-one map onto the loop's tools for the acting
 * operations, plus the controller operations every decision must be allowed to
 * reach for — including the three abstentions the recommendations insist on
 * ("none suitable", "need more information", escalate), which are what keeps a
 * bad ballot from forcing a bad answer.
 */
export type ActorOperation =
  | 'click'
  | 'fill'
  | 'type'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'read'
  | 'observe'
  | 'wait'
  | 'goto'
  | 'back'
  | 'done'
  | 'need-info'
  | 'escalate'
  | 'none';

/**
 * Enough of a control to recognise it again in a DIFFERENT reading of the page
 * — the recorder's locator chain for the step the model actually ran, or a
 * later observation. Every field is one the recorder also derives, which is
 * what makes the two comparable at all (see matchesChain in actor-jev.ts).
 */
export interface ControlIdentity {
  tag: string;
  role: string;
  name?: string;
  label?: string;
  placeholder?: string;
  testid?: string;
  elementId?: string;
}

export interface ActorCandidate {
  /** `a0`, `a1`, … — what a decider answers with. */
  id: string;
  /** The observation revision this was built from; a stale target is refused, never acted on. */
  observationId: string;
  operation: ActorOperation;
  /** The control it acts on, for the operations that have one. */
  target?: { control: string; identity: ControlIdentity };
  /** The value it supplies, by NAME. The executor resolves it; a decider never sees a secret. */
  valueRef?: string;
  /** For `select`, the option label as the page actually renders it. */
  option?: string;
  /** For `goto`, the url the instruction stated. */
  url?: string;
  /** One line, with the context that tells two identically named controls apart. */
  description: string;
}

/** Roles that read as "press this". */
const COMMAND_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem']);
/** Roles that hold typed text. */
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox']);
const TOGGLE_ROLES = new Set(['checkbox', 'radio', 'switch']);

/** Input types nothing may be typed into by this generator. */
const UNTYPEABLE = new Set(['hidden', 'file', 'image', 'button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color']);

/**
 * May this value go in this field? Type compatibility only — NOT label
 * similarity. The recommendations are explicit about why: filtering by whether
 * the label looks like the value removes the correct action before the decider
 * ever sees it, and the correct action is exactly what coverage measures.
 */
export function compatible(control: ActorControl, value: TaskValue): boolean {
  const type = control.type ?? '';
  if (control.tag === 'input' && UNTYPEABLE.has(type)) return false;
  if (type === 'email') return value.kind === 'email';
  if (type === 'url') return value.kind === 'url';
  if (type === 'number' || control.role === 'spinbutton') return value.kind === 'number' || value.kind === 'money';
  if (type === 'date' || type === 'datetime-local' || type === 'month') return value.kind === 'date';
  if (type === 'tel') return value.kind === 'number' || value.kind === 'text';
  // A plain text field, a textarea, a searchbox or a typed-into combobox takes
  // anything the instruction stated, including a number.
  return true;
}

export interface CandidateBudget {
  /** Options in ONE question. The host's ceiling is 255; past this the caller shards. */
  maxCandidates: number;
  /** Values bound to any one field, best first — not the cross product. */
  maxValuesPerField: number;
  /** Options offered for one `<select>`. */
  maxOptionsPerSelect: number;
  /** Estimated tokens for the whole serialised request. */
  maxStateTokens: number;
}

/**
 * One request, not a fan-out. The probe measured one ask at ~0.3s and ANY
 * sharded fan-out at ~1.2s (notes/PLAN-jev.md step 0), and a per-turn decision that
 * costs 1.2s has spent most of what it was supposed to save. So the budget is
 * set where an ordinary page fits in one question, and the tournament exists
 * for the dense pages that do not — never as the default shape.
 *
 * The token ceiling is the host's 32k for state + the longest question; the
 * working number is far under it because accuracy falls with irrelevant state.
 */
export const DEFAULT_BUDGET: CandidateBudget = {
  maxCandidates: 120,
  maxValuesPerField: 3,
  maxOptionsPerSelect: 12,
  maxStateTokens: 6_000,
};

export interface BuildCandidatesInput {
  observation: ActorObservation;
  instruction: string;
  /** Pre-extracted values; extracted from the instruction when omitted. */
  values?: TaskValue[];
  budget?: Partial<CandidateBudget>;
}

export interface CandidateSet {
  candidates: ActorCandidate[];
  values: TaskValue[];
  /** True when the budget cut the list — the decider is then choosing from part of the page. */
  truncated: boolean;
  /** Estimated tokens of the candidate descriptions, for the budget assertion in tests. */
  tokens: number;
}

/** Same address, modulo a trailing slash and host case. */
export function sameAddress(a: string, b: string): boolean {
  const norm = (url: string) => {
    try {
      const u = new URL(url.trim());
      return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}${u.search}${u.hash}`.toLowerCase();
    } catch {
      return url.trim().replace(/\/$/, '').toLowerCase();
    }
  };
  return Boolean(a && b) && norm(a) === norm(b);
}

export function identityOf(c: ActorControl): ControlIdentity {
  return {
    tag: c.tag,
    role: c.role,
    ...(c.name ? { name: c.name } : {}),
    ...(c.label ? { label: c.label } : {}),
    ...(c.placeholder ? { placeholder: c.placeholder } : {}),
    ...(c.testid ? { testid: c.testid } : {}),
    ...(c.elementId ? { elementId: c.elementId } : {}),
  };
}

/** How a control is named in a description: what it is, plus where it is. */
export function describeControl(c: ActorControl): string {
  const bits = [c.role];
  if (c.name) bits.push(JSON.stringify(c.name));
  else if (c.placeholder) bits.push(`(placeholder ${JSON.stringify(c.placeholder)})`);
  else bits.push('(unnamed)');
  const state: string[] = [];
  if (c.value) state.push(`currently ${JSON.stringify(c.value)}`);
  if (c.checked !== undefined) state.push(c.checked ? 'checked' : 'unchecked');
  if (c.disabled) state.push('disabled');
  if (state.length) bits.push(`[${state.join(', ')}]`);
  const where: string[] = [];
  if (c.context?.dialog) where.push(`in dialog ${JSON.stringify(c.context.dialog)}`);
  if (c.context?.row) where.push(`in the row ${JSON.stringify(c.context.row)}`);
  if (c.context?.section && !c.context.dialog) where.push(`in ${JSON.stringify(c.context.section)}`);
  return [bits.join(' '), ...where].join(' ');
}

/**
 * The ballot for one turn: every mechanically available action, bound to the
 * values the instruction stated, plus the controller operations.
 *
 * Order matters and is not cosmetic. It is the order the budget cuts in, so
 * the cut falls on the least likely action, and it is a fixed order so the
 * same page always produces the same ballot (a decision that depends on
 * enumeration order is not a reading of the page):
 *
 *   1. controller operations — never cut, always reachable;
 *   2. value x field bindings — the actions an instruction with values is
 *      usually about, and the ones whose absence is unrecoverable;
 *   3. commands (buttons, links, tabs) in DOM order;
 *   4. toggles and select options.
 */
export function buildCandidates(input: BuildCandidatesInput): CandidateSet {
  const budget = { ...DEFAULT_BUDGET, ...input.budget };
  const obs = input.observation;
  const values = input.values ?? extractValues(input.instruction);
  const out: ActorCandidate[] = [];
  let next = 0;
  const push = (c: Omit<ActorCandidate, 'id' | 'observationId'>): void => {
    out.push({ id: `a${next++}`, observationId: obs.id, ...c });
  };

  // 1. Controller operations. These are the answers that are always available
  // and are not about any element — including the abstentions. `none` is last
  // by convention (as in site A), so it is never the first thing read.
  push({ operation: 'observe', description: 'observe the page again (take a fresh snapshot) before deciding' });
  push({ operation: 'read', description: 'read a specific value off the page as evidence (a reference, a total, a status)' });
  push({ operation: 'wait', description: 'wait for the page to finish loading or updating before deciding' });
  push({ operation: 'done', description: 'the instruction is finished on this page: report the outcome' });
  push({ operation: 'need-info', description: 'the instruction does not say enough to choose an action here' });
  push({ operation: 'escalate', description: 'this needs judgement or an action not listed here — hand it to the model' });

  // Navigation only where the instruction itself states a url: a generator
  // that invents addresses is a generator, not an enumerator.
  for (const v of values) {
    if (v.kind !== 'url') continue;
    // Not to where the browser already is. Instructions habitually name the
    // app's address as CONTEXT ("In Grafana at http://127.0.0.1:3000/, create
    // a dashboard"), and offering that as an action put a plausible no-op on
    // every ballot — measured: it drew 5 of the first 15 disagreements in
    // bench/jev-actor-offline.mjs, including one at 0.92. Same rule as the
    // toggles: only the move that would change something is an option.
    if (sameAddress(v.text, obs.url)) continue;
    push({ operation: 'goto', url: v.text, valueRef: v.ref, description: `navigate to ${v.text} (${v.ref})` });
  }
  if (obs.controls.length) push({ operation: 'back', description: 'go back to the previous page' });

  const fields = obs.controls.filter((c) => !c.disabled && (TEXT_ROLES.has(c.role) || c.tag === 'textarea' || (c.tag === 'input' && !UNTYPEABLE.has(c.type ?? ''))));
  const commands = obs.controls.filter((c) => COMMAND_ROLES.has(c.role));
  const toggles = obs.controls.filter((c) => TOGGLE_ROLES.has(c.role));
  const selects = obs.controls.filter((c) => c.options?.length);

  // 2. Value x field, type-compatible only, quoted values first. Generating
  // the ACTION AND ITS ARGUMENT together is the point: a decider that picked a
  // verb, an element and a value independently could compose a combination
  // that is not executable at all.
  const ranked = [...values].sort((a, b) => (a.source === b.source ? 0 : a.source === 'quoted' ? -1 : 1));
  for (const field of fields) {
    let bound = 0;
    for (const v of ranked) {
      if (bound >= budget.maxValuesPerField) break;
      if (!compatible(field, v)) continue;
      bound++;
      push({
        operation: 'fill',
        target: { control: field.id, identity: identityOf(field) },
        valueRef: v.ref,
        description: `fill ${describeControl(field)} with ${v.ref} = ${JSON.stringify(v.text)}`,
      });
    }
    // An autocomplete has to be TYPED into for its suggestions to appear, and
    // the app's own recipes key off that. Offered only for a combobox/search
    // field, where fill alone is known to be insufficient.
    if (bound && (field.role === 'combobox' || field.role === 'searchbox')) {
      const first = ranked.find((v) => compatible(field, v))!;
      push({
        operation: 'type',
        target: { control: field.id, identity: identityOf(field) },
        valueRef: first.ref,
        description: `type ${first.ref} = ${JSON.stringify(first.text)} into ${describeControl(field)} key by key, so its suggestions appear`,
      });
    }
  }

  // 3. Commands.
  for (const c of commands) {
    push({
      operation: 'click',
      target: { control: c.id, identity: identityOf(c) },
      description: `click ${describeControl(c)}${c.disabled ? ' — it is disabled, so this would not act' : ''}`,
    });
  }

  // 4. Toggles: only the move that would CHANGE the control. Offering "check
  // an already-checked box" is offering a no-op, and a no-op that is picked
  // looks like progress while the page stands still.
  for (const c of toggles) {
    const op = c.checked ? 'uncheck' : 'check';
    push({
      operation: op,
      target: { control: c.id, identity: identityOf(c) },
      description: `${op} ${describeControl(c)}`,
    });
  }

  // 5. Select options — the options the page ACTUALLY renders, never a value
  // typed into a dropdown. A value the instruction states is offered first
  // when some option carries it; the rest of the list follows, capped.
  for (const c of selects) {
    const options = c.options ?? [];
    const wanted = options.filter((o) => values.some((v) => o.toLowerCase().includes(v.text.toLowerCase())));
    const rest = options.filter((o) => !wanted.includes(o));
    for (const option of [...wanted, ...rest].slice(0, budget.maxOptionsPerSelect)) {
      push({
        operation: 'select',
        target: { control: c.id, identity: identityOf(c) },
        option,
        description: `select ${JSON.stringify(option)} in ${describeControl(c)}`,
      });
    }
  }

  // 6. Evidence sources: read the value a control already shows. Only for
  // controls actually holding one — "read something somewhere" is the generic
  // `read` above.
  for (const c of obs.controls) {
    if (!c.value || !TEXT_ROLES.has(c.role)) continue;
    push({
      operation: 'read',
      target: { control: c.id, identity: identityOf(c) },
      description: `read the value shown by ${describeControl(c)}`,
    });
  }

  push({ operation: 'none', description: 'none of these actions is the right next step on this page' });

  // The budget cut. Controller operations are index 0..5 and survive by
  // construction; `none` is re-appended so an abstention is never the thing
  // that was cut.
  const truncated = out.length > budget.maxCandidates || estimateTokens(out.map((c) => c.description)) > budget.maxStateTokens;
  let kept = out;
  if (truncated) {
    kept = out.slice(0, Math.max(8, budget.maxCandidates - 1));
    let tokens = estimateTokens(kept.map((c) => c.description));
    while (kept.length > 8 && tokens > budget.maxStateTokens) {
      kept = kept.slice(0, kept.length - 1);
      tokens = estimateTokens(kept.map((c) => c.description));
    }
    const none = out[out.length - 1];
    if (!kept.includes(none)) kept = [...kept, none];
  }
  return { candidates: kept, values, truncated, tokens: estimateTokens(kept.map((c) => c.description)) };
}

// --- focusing the ballot -----------------------------------------------------------

/** A search or filter box: it changes what is LISTED, not what is stored. */
const isSearchField = (c: ActorControl): boolean =>
  c.role === 'searchbox' || c.type === 'search' || /\b(search|filter|find)\b/i.test(`${c.name ?? ''} ${c.placeholder ?? ''} ${c.label ?? ''}`);

/** Rows before the row rule applies: a short list is cheap to offer whole. */
const ROWS_WORTH_FILTERING = 4;

/**
 * The part of the page this instruction is about — what an ACTING decider is
 * asked to choose from.
 *
 * Measured need (jakb1, Kanboard): the actor acted on 2 of 218 asks. Not for
 * want of a selector (4 deferrals) but of confidence — click median 0.41 — on
 * ballots of a median 72 options, where RepairDesk's were 13-37 and it acted on
 * a quarter. Step 0 had already measured that Jev's accuracy falls with large
 * irrelevant state. A board page offers the whole nav and every card's menu on
 * every turn; almost none of it is what any one instruction is about.
 *
 * Every rule here only REMOVES, and only what the instruction gives no reason
 * to touch, so the worst case is a deferral to the model — which sees the whole
 * page, as it always did:
 *
 *  1. An open dialog is the page. (The modal guard of repair-jev, generalised:
 *     what is behind a dialog is not actionable.)
 *  2. Chrome — nav, header, footer — goes unless the instruction names the control.
 *  3. Where the instruction names a record that is on the page, the other
 *     records' controls go. Where it names none, every row stays: code cannot
 *     tell which one is meant.
 *  4. Search and filter boxes go unless the instruction asks to search or filter.
 *     Both of jakb1's actions were the task title typed into the board's Filter
 *     box, at 0.75 and 0.83 — a field that takes any text is a magnet for one.
 */
export function focusObservation(obs: ActorObservation, instruction: string, values: readonly TaskValue[] = extractValues(instruction)): ActorObservation {
  const text = instruction.toLowerCase();
  const named = (c: ActorControl): boolean => Boolean(c.name && c.name.length > 2 && text.includes(c.name.toLowerCase()));
  let controls = obs.controls;

  const inDialog = controls.filter((c) => c.context?.dialog);
  if (inDialog.length) controls = inDialog;
  else controls = controls.filter((c) => !c.context?.chrome || named(c));

  // Only a NAME identifies a record: fxjevf1-n1 let "25" and "100" count, which
  // matched half the page and dropped the "Add part" button the task needed.
  // And only a control that is REPEATED per record is dropped — "Edit", "Delete",
  // a card's menu — since those are what a record's name disambiguates; a control
  // that merely sits in some list item is not a rival of anything.
  const literals = values.filter((v) => v.kind === 'text' && v.text.length >= 6).map((v) => v.text.toLowerCase());
  const rowOf = (c: ActorControl): string => c.context?.row?.toLowerCase() ?? '';
  const rows = new Set(controls.map(rowOf).filter(Boolean));
  const mentioned = (row: string): boolean => literals.some((t) => row.includes(t));
  if (rows.size >= ROWS_WORTH_FILTERING && [...rows].some(mentioned)) {
    const key = (c: ActorControl): string => `${c.role}|${c.name ?? ''}`;
    const inNamedRecord = new Set(controls.filter((c) => mentioned(rowOf(c))).map(key));
    controls = controls.filter((c) => !c.context?.row || mentioned(rowOf(c)) || !inNamedRecord.has(key(c)));
  }

  if (!/\b(search|filter|find)\b/i.test(instruction)) controls = controls.filter((c) => !isSearchField(c));
  return controls.length === obs.controls.length ? obs : { ...obs, controls };
}

// --- the live look ----------------------------------------------------------------

/** Controls one observation lists. Past this the page is dense enough for a tournament anyway. */
export const MAX_CONTROLS = 150;

/**
 * One READ-ONLY look at the live page's controls.
 *
 * It must be read-only in two senses, and both matter for the shadow:
 *
 *  - it writes nothing to the DOM (no markers, no attributes, no focus), so
 *    the agent's page is byte for byte what it would have been; and
 *  - it mints no `@eN` refs. Playwright's `ariaSnapshot({mode:'ai'})` — what
 *    daemon/refs.ts `snapshot()` calls — is what assigns those markers and
 *    what `rememberRefs` records; a second caller of it would be a second
 *    writer of the agent's ref space and of SessionState's snapshot-elision
 *    bookkeeping. This walk calls neither. It is its own `page.evaluate`, the
 *    same shape as skills/repair.ts `interactiveRows`, and the observation it
 *    returns is numbered `c0…` in ITS OWN namespace, never `@eN`.
 *
 * Returns null when the page cannot be read (navigating, closed, wedged) —
 * "unavailable", never "empty": an empty candidate list would otherwise be
 * logged as a page with nothing on it.
 */
export async function observeControls(page: Page, id: string, limit = MAX_CONTROLS): Promise<ActorObservation | null> {
  try {
    const raw = await page.evaluate(
      (max: number) => {
        const clean = (s: string | null | undefined, n = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
        // The same implicit-role table as execution/snapshot.ts and
        // recorder.ts. Mirrored (not imported) because this body is serialised
        // into the page, where nothing at module level is in scope.
        const roleOf = (el: Element): string | null => {
          const explicit = clean(el.getAttribute('role'), 40);
          if (explicit) return explicit.split(' ')[0];
          const tag = el.tagName.toLowerCase();
          const type = (el.getAttribute('type') || '').toLowerCase();
          if (tag === 'button') return 'button';
          if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
          if (tag === 'select') return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
          if (tag === 'textarea') return 'textbox';
          if (tag === 'summary') return 'button';
          if (tag === 'input') {
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            if (type === 'range') return 'slider';
            if (type === 'search') return 'searchbox';
            if (type === 'number') return 'spinbutton';
            if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
            if (type === 'hidden' || type === 'file') return null;
            return 'textbox';
          }
          return null;
        };
        const nameOf = (el: Element): string => {
          const aria = clean(el.getAttribute('aria-label'));
          if (aria) return aria;
          const labels = (el as HTMLInputElement).labels;
          if (labels && labels.length) return clean(Array.from(labels).map((l) => l.textContent).join(' '));
          const wrapping = clean(el.closest('label')?.textContent);
          if (wrapping) return wrapping;
          const title = clean(el.getAttribute('title'));
          if (title) return title;
          const text = clean((el as HTMLElement).innerText || el.textContent);
          if (text) return text;
          return clean(el.getAttribute('placeholder'));
        };
        const out: Record<string, unknown>[] = [];
        const els = Array.from(document.querySelectorAll('a, button, input, select, textarea, summary, [role], [tabindex]'));
        let truncated = els.length > max * 3;
        for (const el of els.slice(0, max * 3)) {
          if (out.length >= max) {
            truncated = true;
            break;
          }
          const h = el as HTMLElement;
          // Not rendered is not a candidate; an <option> has no box of its own
          // but is reached through its select, and is collected there.
          if (h.tagName !== 'OPTION' && h.getClientRects().length === 0) continue;
          const role = roleOf(el);
          if (!role) continue;
          const row: Record<string, unknown> = { tag: h.tagName.toLowerCase(), role };
          const name = nameOf(el);
          if (name) row.name = name;
          const label = clean(el.closest('label')?.textContent ?? el.getAttribute('aria-label'), 60);
          if (label) row.label = label;
          const placeholder = el.getAttribute('placeholder');
          if (placeholder) row.placeholder = clean(placeholder, 60);
          const testid = el.getAttribute('data-testid');
          if (testid) row.testid = testid;
          if (h.id) row.elementId = h.id;
          const type = el.getAttribute('type');
          if (type) row.type = type.toLowerCase();
          const input = el as HTMLInputElement;
          if (input.type === 'checkbox' || input.type === 'radio') row.checked = Boolean(input.checked);
          else if (typeof input.value === 'string' && input.value) row.value = clean(input.value);
          if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') row.disabled = true;
          const select = el as HTMLSelectElement;
          if (h.tagName === 'SELECT' && select.options) {
            row.options = Array.from(select.options).slice(0, 30).map((o) => clean(o.label || o.text, 60)).filter(Boolean);
          }
          // Where it sits. A dialog and a table row are what tell two
          // identically named controls apart, and nothing else here can.
          const context: Record<string, string | boolean> = {};
          const dialog = el.closest('[role=dialog],[role=alertdialog],dialog');
          if (dialog) {
            context.dialog =
              clean(dialog.getAttribute('aria-label')) ||
              clean(dialog.querySelector('h1,h2,h3,[role=heading]')?.textContent, 60) ||
              'dialog';
          }
          const record = el.closest('tr,[role=row],li,[role=listitem],[role=option]');
          if (record && record !== el) context.row = clean((record as HTMLElement).innerText || record.textContent, 90);
          const section = el.closest('form,fieldset,section,[role=region],[role=form]');
          if (section && section !== el) {
            const label = clean(section.getAttribute('aria-label')) || clean(section.querySelector('legend,h1,h2,h3')?.textContent, 60);
            if (label) context.section = label;
          }
          // The PAGE's chrome only. A <header> or <footer> inside a section, article,
          // dialog or main is that region's own heading row — fxjevg2-n1's "Add part"
          // button sits in one, and dropping it as chrome cost the actor both forms.
          const bar = el.closest('nav,header,footer,[role=navigation],[role=banner],[role=contentinfo]');
          if (bar && (bar.matches('nav,[role=navigation]') || !bar.parentElement?.closest('main,section,article,dialog,[role=main],[role=dialog],[role=region]'))) {
            context.chrome = true;
          }
          if (Object.keys(context).length) row.context = context;
          out.push(row);
        }
        const alerts = Array.from(document.querySelectorAll('[role=alert],[role=status]'))
          .filter((el) => (el as HTMLElement).getClientRects().length > 0)
          .slice(0, 5)
          .map((el) => clean((el as HTMLElement).innerText, 200))
          .filter(Boolean);
        return { controls: out, alerts, truncated, url: location.href, title: document.title };
      },
      limit,
    );
    const controls: ActorControl[] = (raw.controls as Record<string, unknown>[]).map((c, i) => ({ id: `c${i}`, ...(c as object) }) as ActorControl);
    return {
      id,
      url: String(raw.url ?? ''),
      ...(raw.title ? { title: String(raw.title) } : {}),
      controls,
      ...(Array.isArray(raw.alerts) && raw.alerts.length ? { alerts: raw.alerts as string[] } : {}),
      ...(raw.truncated ? { truncated: true } : {}),
    };
  } catch {
    return null;
  }
}
