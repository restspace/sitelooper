/**
 * DISPLAY FORMAT facts (design-site-facts.md §3; the stage 0 contract's Piece
 * D2): how an app SHOWS a value it was given or holds — espo renders a typed
 * 12500 as "12,500.00", kanboard frames a task id as "#4", odoo titles a
 * record "S00023 - Odoo" — observed by the runner, kept per origin, and in
 * stage 0 only logged beside the heuristic each will one day replace.
 *
 * Two halves:
 *  - OBSERVERS (a)-(e), called from the daemon only (the recorder, the
 *    read-back cascade), each turning one piece of page evidence into format
 *    `Observation`s and writing them through the SiteFactStore. Only the
 *    transformation is stored, never the value.
 *  - SHADOW decisions: for the three consumers stage 2 will switch
 *    (captureReadBack, classifyReportValue, the identity gate), what a reliable
 *    rendering WOULD have decided beside what today's rule did. The rows are
 *    collected in memory and written by whoever drains them first: learn.ts's
 *    writeShadow call (a recording) or the run-outcome flush in
 *    daemon/server.ts (a replay). Stage 2 switches two of them on:
 *    shadowClassify and shadowIdentity return the verdict the shared
 *    decision (execution/facts-display.ts) takes where a reliable fact
 *    decides, today's otherwise, and stamp `applied` on the row when it did.
 *
 * Everything is best effort: an observer or a shadow that fails is a missing
 * row, never a failed step.
 */
import type { Locator, Page } from 'playwright-core';
import {
  emptyFacts,
  factsFor,
  reliable,
  renderings,
  routeTemplateOf,
  type Fact,
  type FactValue,
  type FormatKind,
  type Observation,
  type SiteFacts,
} from '../execution/facts.js';
import { originOf } from '../execution/url.js';
import { FRAME_MARK, maskCounters } from '../execution/text.js';
import { sameValue } from '../execution/refill.js';
import { captureLines, lineShows } from '../execution/snapshot.js';
import { classifyReportValue, type GivenEvidence, type ReportVerdict } from '../execution/report.js';
import { identityMarkerVerdict, type IdentityMarkerVerdict } from '../execution/gates.js';
import {
  classifyReportValueWithFacts,
  controlKey,
  identityMarkerVerdictWithFacts,
  reportFormatKey,
  titleKey,
  typedControls,
} from '../execution/facts-display.js';
import { siteFactStore, type SiteFactStore } from './facts.js';
import type { ShadowRow } from './shadow.js';
import type { Skill, SkillStep } from './store.js';

// --- the session and the store the daemon observes into ----------------------

let activeSession: string | null = null;
let storeOverride: SiteFactStore | null = null;

/**
 * The session the daemon's free-function observers (captureReadBackAt,
 * titleReadBack, the read-back cascade) write under: the recorder's session
 * name, set when the daemon builds its ScriptRecorder. Null (the default, and
 * every unit test that never builds one) means no observer writes anything.
 */
export function setFormatSession(session: string | null): void {
  activeSession = session;
  if (session === null) activeVars = [];
}

export function formatSession(): string | null {
  return activeSession;
}

let activeVars: string[] = [];

/**
 * The session's DECLARED variable values (the runid, …), set by the recorder
 * around each instruction (recorder.ts setIdentityHints, from the agent
 * loop's `state.vars`). Observers (a), (b) and (e) never observe a value equal
 * to one of them: a var is the caller's input, not a field the app displays,
 * and odoo fwod93 minted `{{=}} Bench Customer` for the `ref` key because the
 * runid sat inside the customer's name.
 */
export function setFormatVars(values: readonly unknown[]): void {
  activeVars = [...new Set(values.map((v) => (typeof v === 'string' ? v : String(v ?? ''))).map(foldVar).filter(Boolean))];
}

export function formatVars(): string[] {
  return [...activeVars];
}

function foldVar(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether `value` IS one of the declared var values (whitespace collapsed, case folded). */
export function isVarValue(value: string, vars: readonly string[] = activeVars): boolean {
  const v = foldVar(value);
  return v.length > 0 && vars.some((x) => foldVar(x) === v);
}

/**
 * An origin's facts through the observers' store (the test override
 * included), or null when it cannot be read: the daemon-only read-back
 * consumer (recorder.ts captureReadBack, agent/readback.ts) reads here.
 */
export function formatFactsOf(origin: string): SiteFacts | null {
  return factsOf(origin);
}

/** Tests: observe into this store instead of `siteFactStore()`. Null restores the default. */
export function useFormatStore(store: SiteFactStore | null): void {
  storeOverride = store;
}

function formatStore(): SiteFactStore {
  return storeOverride ?? siteFactStore();
}

/** Read an origin's facts; never throws (the store's own contract), empty on any failure. */
function factsOf(origin: string): SiteFacts | null {
  try {
    return formatStore().read(origin);
  } catch {
    return null;
  }
}

/**
 * An `ev` line fit to keep: dropped when it names the session or carries a
 * runid-shaped token (`fwod88-n1`), which would make the evidence line a copy
 * of one run's data. Length is observeFact's to clip.
 */
export function safeEv(ev: string, session: string): string | undefined {
  if (!ev) return undefined;
  if (session && ev.includes(session)) return undefined;
  if (/[\p{L}\p{N}]+-n\d+\b/u.test(ev)) return undefined;
  return ev;
}

/** Write format observations for one origin. Returns how many were written; never throws. */
export function writeFormats(store: SiteFactStore, origin: string, session: string, obs: readonly Omit<Observation, 'session' | 'k'>[]): number {
  if (!origin || !session || !obs.length) return 0;
  const full: Observation[] = obs.map((o) => {
    const ev = o.ev === undefined ? undefined : safeEv(o.ev, session);
    return { k: 'format', key: o.key, v: o.v, hard: o.hard, session, ...(o.at ? { at: o.at } : {}), ...(ev ? { ev } : {}) };
  });
  try {
    return store.observe(origin, full).written;
  } catch {
    return 0;
  }
}

// --- keys -------------------------------------------------------------------

// controlKey (`${route}|${role}|${name}`), reportFormatKey (`${route}|${reportKey}`)
// and titleKey (`${route}|title`) live in execution/facts-display.ts, where both
// runners' stage 2 decisions read them; re-exported here for the observers' callers.
export { controlKey, reportFormatKey, titleKey };

// --- (a) a typed value, read back at its own control --------------------------

const NUMBER_TYPED = /^-?\d+(?:\.\d+)?$/;
/** A number shown with digit grouping: "12,500", "12 500", "12.500,00", "1'000". */
const GROUPED = /^-?\d{1,3}(?:[,.  ' ]\d{3})+(?:[.,]\d+)?$/;

/**
 * How the app transformed what was typed into a control, from the value the
 * control holds after the commit settled. The contract's order, with one
 * reading: "equal after fold → nothing" is taken as EXACTLY equal → nothing,
 * because foldValue trims and lower-cases, so the trim and upper cases below
 * would otherwise never be reachable:
 *  - the same number in the page's own spelling (refill.ts sameValue's digit
 *    rule) with digit grouping → `thousands`, and a `.dd` tail the typed text
 *    had not → `decimals` (either alone, or both);
 *  - the typed text trimmed → `trim`;
 *  - the typed text upper-cased → `upper`.
 * Anything else (another value, a partial echo, a case change that is not all
 * capitals) says nothing about format.
 */
export function typedFormats(typed: string, shown: string): FormatKind[] {
  if (!typed || typed === shown) return [];
  const t = typed.trim();
  const s = shown.trim();
  if (NUMBER_TYPED.test(t) && s !== t && sameValue(s, t)) {
    const kinds: FormatKind[] = [];
    if (GROUPED.test(s)) kinds.push('thousands');
    if (!/[.,]\d+$/.test(t) && /[.,]\d{2}$/.test(s) && /^-?[\d,.  ' ]+$/.test(s)) kinds.push('decimals');
    if (kinds.length) return kinds;
  }
  if (shown === t && t !== typed) return ['trim'];
  if (shown === typed.toUpperCase() && shown !== typed) return ['upper'];
  return [];
}

/**
 * (a) observations for one committed fill/type: hard, keyed by the control.
 * Never for a typed value that IS a declared var's value (`vars`, the
 * session's by default): a var is the caller's input, not the field's format.
 */
export function typedObservations(
  url: string,
  role: string,
  name: string,
  typed: string,
  shown: string,
  vars: readonly string[] = activeVars,
): Omit<Observation, 'session' | 'k'>[] {
  if (!role || /\{\{/.test(typed) || isVarValue(typed, vars)) return [];
  const key = controlKey(url, role, name);
  return typedFormats(typed, shown).map((kind) => ({ key, v: { kind }, hard: true, ev: `typed into ${role} "${name}", shown as ${kind}` }));
}

/**
 * (a) as the recorder runs it after a fill/type commit: the control's value
 * (or innerText, for a contenteditable) read from the live element the step's
 * durable chain names, compared with the typed text. A password field is
 * never read.
 */
export async function observeTypedValue(
  page: Page,
  session: string,
  control: { role: string; name: string; locator: Locator },
  typed: string,
  store: SiteFactStore = formatStore(),
): Promise<number> {
  try {
    const url = page.url();
    const origin = originOf(url);
    if (!origin || !session || !control.role || /\{\{/.test(typed)) return 0;
    if ((await control.locator.count()) !== 1) return 0;
    const shown = await control.locator.evaluate(
      (el: Element) => {
        const input = el as HTMLInputElement;
        if (input.type === 'password') return null;
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return input.value ?? '';
        return (el as HTMLElement).innerText ?? el.textContent ?? '';
      },
      undefined,
      { timeout: 1_000 },
    );
    if (shown === null) return 0;
    return writeFormats(store, origin, session, typedObservations(url, control.role, control.name, typed, shown));
  } catch {
    return 0;
  }
}

// --- (b) a read-back pinned by containment ------------------------------------

/** A digit-group separator: `12,500`, `12.500`, `1'000`, `12 500` (and the no-break spaces). */
const GROUP_SEP = /^[,.' \u00a0\u202f]$/u;
const ONE_SPACE = /^[ \u00a0\u202f]$/u;

/**
 * Whether the text beside the mark, read OUTWARD from it (`side[0]` touches
 * the mark), continues a number: past at most one space, a digit, or a group
 * separator with a digit beyond it. odoo fwod93's `£ 2,{{=}}` was a subtotal
 * whose tail was cut out of "£ 2,450.00": the "affix" was the rest of the
 * number, not how the value is framed.
 */
function continuesNumber(side: string): boolean {
  const i = side.length && ONE_SPACE.test(side[0]) ? 1 : 0;
  const c = side[i];
  if (c === undefined) return false;
  if (/\d/u.test(c)) return true;
  if (GROUP_SEP.test(c) && /\d/u.test(side[i + 1] ?? '')) return true;
  // the space skipped was itself a separator: `2 {{=}}` is caught above ('2'
  // past one space); nothing more to ask
  return false;
}

/**
 * Whether the frame's remainder (the frame without the mark) says anything:
 * at least one letter, or an identifier / unit sigil (`#`, `№`, `%`, a
 * currency sign). gitea's `#{{=}}` stays; `({{=}})`, `{{=}},` and `"{{=}}"`
 * are punctuation around the value and say nothing about its format.
 */
function remainderSpeaks(rest: string): boolean {
  return /[\p{L}#№%\p{Sc}]/u.test(rest);
}

/**
 * An affix template from a read-back FRAME: one line, one mark, nothing else
 * still asking for a value. "Folder\n{{=}}" (a label line) and a frame with a
 * slot left in it describe a layout, not how the value is spelled. Refused as
 * well (stage 2's tightening, round 67):
 *  - a frame whose character on either side of the mark (past one space) is
 *    a digit, or a group separator next to a digit: the value was cut out of
 *    a number (`£ 2,{{=}}`, `{{=}}.00`);
 *  - a frame whose remainder has no letter and no sigil (`remainderSpeaks`).
 */
export function affixOfFrame(frame: string): string | null {
  if (!frame || frame === FRAME_MARK || /[\r\n]/.test(frame)) return null;
  const parts = frame.split(FRAME_MARK);
  if (parts.length !== 2) return null;
  if (/\{\{(?!=\}\})/.test(parts.join(''))) return null;
  const [before, after] = parts;
  if (continuesNumber([...before].reverse().join('')) || continuesNumber(after)) return null;
  if (!remainderSpeaks(before + after)) return null;
  return frame;
}

/**
 * (b) the observation for a read-back pinned by containment: the frame IS the
 * affix, keyed by the report key on the page's route. HARD when the value is
 * proven this page's record (the url names it: recorder.ts recordIdsOf) or the
 * page shows its text exactly once; SOFT otherwise. None for a `value` that IS
 * a declared var's value (`vars`, the session's by default): odoo fwod93's
 * runid, framed inside the customer's name, minted `{{=}} Bench Customer` for
 * the `ref` key. `value` omitted: that check is skipped.
 */
export function frameObservation(
  url: string,
  reportKey: string,
  frame: string,
  proven: boolean,
  value?: string,
  vars: readonly string[] = activeVars,
): Omit<Observation, 'session' | 'k'> | null {
  const tpl = affixOfFrame(frame);
  if (!tpl || !reportKey) return null;
  if (value !== undefined && isVarValue(value, vars)) return null;
  return { key: reportFormatKey(url, reportKey), v: { kind: 'affix', tpl }, hard: proven, ev: `read-back framed as ${tpl}` };
}

// --- (c) the sweep's unoffered occurrences ------------------------------------

/** What sweepFrame (agent/readback.ts) says about one occurrence it could not offer. */
export interface SweptFormat {
  kind: 'twice' | 'upper';
  role: string;
  name: string;
}

/** (c) observations: `twice` (a hidden duplicate) or `upper` (a case-only rendering), hard, keyed by role|name. */
export function sweptObservations(url: string, found: readonly SweptFormat[]): Omit<Observation, 'session' | 'k'>[] {
  const seen = new Set<string>();
  const out: Omit<Observation, 'session' | 'k'>[] = [];
  for (const f of found) {
    if (!f.role) continue;
    const key = controlKey(url, f.role, f.name);
    if (seen.has(`${key}\u0000${f.kind}`)) continue;
    seen.add(`${key}\u0000${f.kind}`);
    out.push({ key, v: { kind: f.kind }, hard: true, ev: f.kind === 'twice' ? 'shown twice, one copy unrendered' : 'rendered upper-case' });
  }
  return out;
}

// --- (d) counters on a control's name -----------------------------------------

const COUNTED_LINE = /^- (menu|menuitem|button|link|tab|treeitem) "(\d{1,3}(?: \d{1,3})*) ([^"]*)"/u;

/**
 * (d) observations from a step's added diff lines: a named control whose name
 * maskCounters strips leading counts from (odoo's `- menu "6 3 YourCompany"`)
 * → `counter`, SOFT (a regex match, not a proof), keyed by the role and the
 * name without its counts.
 */
export function counterObservations(url: string, added: readonly string[]): Omit<Observation, 'session' | 'k'>[] {
  const seen = new Set<string>();
  const out: Omit<Observation, 'session' | 'k'>[] = [];
  for (const line of added) {
    if (typeof line !== 'string' || maskCounters(line) === line) continue;
    const m = COUNTED_LINE.exec(line);
    if (!m || !m[3].trim()) continue;
    const key = controlKey(url, m[1], m[3]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, v: { kind: 'counter' }, hard: false, ev: `${m[1]} name led by counters` });
  }
  return out;
}

// --- (e) the document title -----------------------------------------------------

/**
 * (e) the title's affix around a reported value: "S00023 - Odoo" for
 * "S00023" → `{{=}} - Odoo`. The value at the head or the tail of the title
 * (whitespace collapsed), with something else beside it; null otherwise.
 */
export function titleAffix(title: string, value: string): string | null {
  const t = title.replace(/\s+/g, ' ').trim();
  const v = value.replace(/\s+/g, ' ').trim();
  if (!t || !v || t === v || t.split(v).length !== 2) return null;
  if (t.startsWith(v) && !/^[\p{L}\p{N}]/u.test(t.slice(v.length))) return `${FRAME_MARK}${t.slice(v.length)}`;
  if (t.endsWith(v) && !/[\p{L}\p{N}]$/u.test(t.slice(0, t.length - v.length))) return `${t.slice(0, t.length - v.length)}${FRAME_MARK}`;
  return null;
}

/** (e) the title's affix as an observation; none for a value that IS a declared var's value (`vars`, the session's by default). */
export function titleObservation(url: string, title: string, value: string, vars: readonly string[] = activeVars): Omit<Observation, 'session' | 'k'> | null {
  if (isVarValue(value, vars)) return null;
  const tpl = titleAffix(title, value);
  return tpl ? { key: titleKey(url), v: { kind: 'affix', tpl }, hard: true, ev: `title framed as ${tpl}` } : null;
}

/** Write one page's observations under the active session: the free-function observers' common tail. */
export function observeOnPage(url: string, obs: readonly (Omit<Observation, 'session' | 'k'> | null)[], session: string | null = activeSession): number {
  const origin = originOf(url);
  const kept = obs.filter((o): o is Omit<Observation, 'session' | 'k'> => o !== null);
  if (!origin || !session || !kept.length) return 0;
  return writeFormats(formatStore(), origin, session, kept);
}

// --- shadow rows ------------------------------------------------------------------

/** The evidence of a facts.* shadow row, as the contract fixes it. */
export interface FactEvidence {
  k: 'format';
  key: string;
  v: FactValue | null;
  reliable: boolean;
}

/**
 * A facts.* shadow row as this module builds it: shadow.ts's ShadowRow with the
 * contract's evidence OBJECT. `asShadowRows` turns it into the row the store
 * writes, whose `evidence` is one JSON string per fact consulted
 * (`{k, key, v, reliable}`, the convention Pieces D1, D3 and E share).
 */
export type FactShadowRow = Omit<ShadowRow, 'evidence'> & {
  evidence: FactEvidence;
  /** Stage 2: the fact DECIDED the verdict the runner acted on (absent when today's rule did). */
  applied?: boolean;
};

export function asShadowRows(rows: readonly FactShadowRow[]): ShadowRow[] {
  return rows.map((r) => ({ ...r, evidence: [JSON.stringify(r.evidence)] }));
}

const MAX_PENDING = 500;
let pending: FactShadowRow[] = [];

/** Keep a row until learn.ts or the run-outcome flush takes it. Bounded: the oldest go first. */
export function noteFormatShadow(row: FactShadowRow | null): void {
  if (!row) return;
  pending.push(row);
  if (pending.length > MAX_PENDING) pending = pending.slice(pending.length - MAX_PENDING);
}

/**
 * Every facts.readback / facts.classify / facts.identity row not yet written,
 * removed from the buffer, ready for writeShadow. Whichever writer drains
 * first (learn.ts after a recording, server.ts at a run's outcome) writes
 * them, so each row is written exactly once.
 */
export function takeFormatShadowRows(): ShadowRow[] {
  const out = pending;
  pending = [];
  return asShadowRows(out);
}

function evidenceOf(facts: readonly Fact[], chosen?: Fact): FactEvidence {
  const f = chosen ?? facts.find(reliable) ?? facts[0];
  return { k: 'format', key: f?.key ?? '', v: f?.v ?? null, reliable: f ? reliable(f) : false };
}

/**
 * facts.readback: the exact text match failed for `value`; would a reliable
 * rendering under the report key have pinned it (shown exactly once)?
 * `fact`: 'pin' | 'refuse' | 'none' (no reliable format); `heuristic`: what
 * captureReadBack returned, 'pinned' | 'refused'. Null when no format fact of
 * any standing exists under the key (nothing to shadow).
 */
export async function readBackShadow(
  sf: SiteFacts,
  key: string,
  value: string,
  heuristicPinned: boolean,
  showsOnce: (text: string) => Promise<boolean>,
): Promise<FactShadowRow | null> {
  const facts = factsFor(sf, 'format', key);
  if (!facts.length) return null;
  const shown = renderings(sf, key, value);
  let fact: 'pin' | 'refuse' | 'none' = shown.length ? 'refuse' : 'none';
  for (const r of shown) {
    if (await showsOnce(r).catch(() => false)) {
      fact = 'pin';
      break;
    }
  }
  const heuristic = heuristicPinned ? 'pinned' : 'refused';
  return {
    rule: 'facts.readback',
    step: `read-back ${key}`.slice(0, 100),
    fact,
    heuristic,
    agree: fact === 'none' || (fact === 'pin') === heuristicPinned,
    evidence: evidenceOf(facts),
  };
}

/** The role|name of the control each typed slot was typed into, from the skill's steps (execution/facts-display.ts typedControls). */
function slotControls(steps: readonly SkillStep[], slot: string): { role: string; name: string }[] {
  return typedControls(steps)[slot] ?? [];
}

/** Format facts on this origin for a control named `role|name`, on any route. */
function controlFacts(sf: SiteFacts, role: string, name: string): Map<string, Fact[]> {
  const suffix = `|${role}|${name.replace(/\s+/g, ' ').trim()}`;
  const byKey = new Map<string, Fact[]>();
  for (const f of sf.facts) {
    if (f.k !== 'format' || !f.key.endsWith(suffix)) continue;
    byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
  }
  return byKey;
}

/**
 * facts.classify: today's classifyReportValue called a template value an
 * ECHO; would a reliable rendering of each open slot, typed into a control
 * whose format is known, have made it `committed`? Re-asks the same shared
 * classification with the open slots spelled as the app renders them.
 * `fact`: 'committed' | 'echo' | 'none'; `heuristic`: 'echo'. Null when no
 * open slot's control has any format fact.
 */
export function classifyShadow(
  sf: SiteFacts,
  steps: readonly SkillStep[],
  template: string,
  params: Record<string, string>,
  shown: readonly string[] | null,
  evidence: GivenEvidence,
  verdict: ReportVerdict,
): FactShadowRow | null {
  if (verdict.class !== 'echo') return null;
  const all: Fact[] = [];
  const spellings = new Map<string, string[]>();
  for (const slot of verdict.slots) {
    const raw = params[slot];
    if (typeof raw !== 'string') continue;
    for (const c of slotControls(steps, slot)) {
      for (const [key, facts] of controlFacts(sf, c.role, c.name)) {
        all.push(...facts);
        spellings.set(slot, [...(spellings.get(slot) ?? []), ...renderings(sf, key, raw)]);
      }
    }
  }
  if (!all.length) return null;
  let fact: 'committed' | 'echo' | 'none' = [...spellings.values()].some((s) => s.length) ? 'echo' : 'none';
  if (fact === 'echo') {
    // One spelling per slot at a time, the rest as typed: a rendering that
    // makes the whole value committed on its own is the fact's decision.
    const tries: Record<string, string>[] = [];
    for (const [slot, list] of spellings) for (const r of list) tries.push({ ...params, [slot]: r });
    if (spellings.size > 1) {
      const combined = { ...params };
      for (const [slot, list] of spellings) if (list.length) combined[slot] = list[0];
      tries.push(combined);
    }
    for (const p of tries) {
      try {
        if (classifyReportValue(template, p, shown, evidence).class === 'committed') {
          fact = 'committed';
          break;
        }
      } catch {
        // a shadow never throws
      }
    }
  }
  return {
    rule: 'facts.classify',
    step: `report ${template}`.slice(0, 100),
    fact,
    heuristic: 'echo',
    agree: fact !== 'committed',
    evidence: evidenceOf(all, all.find(reliable)),
  };
}

/**
 * facts.identity: the identity gate did not see `want` on the page as
 * written. Would a reliable rendering of it — any format known on the page's
 * route, the title's affix included — have been there? `fact`: 'pass' |
 * 'refuse' | 'none'; `heuristic`: what the gate decided, 'pass' | 'refuse'.
 * Null when the route has no format fact at all.
 */
export function identityShadow(
  sf: SiteFacts,
  url: string,
  want: string,
  heuristicPass: boolean,
  lines: readonly string[] | null,
  title: string,
): FactShadowRow | null {
  const route = routeTemplateOf(url);
  const facts = sf.facts.filter((f) => f.k === 'format' && f.key.startsWith(`${route}|`));
  if (!facts.length) return null;
  const keys = [...new Set(facts.map((f) => f.key))];
  let fact: 'pass' | 'refuse' | 'none' = 'none';
  let chosen: Fact | undefined;
  const t = title.replace(/\s+/g, ' ').trim();
  for (const key of keys) {
    const shown = renderings(sf, key, want);
    if (!shown.length) continue;
    if (fact === 'none') fact = 'refuse';
    const hit = key.endsWith('|title') ? shown.some((r) => r.replace(/\s+/g, ' ').trim() === t) : Boolean(lines && lineShows([...lines], shown.filter((r) => r !== want), { whole: true }));
    if (hit) {
      fact = 'pass';
      chosen = factsFor(sf, 'format', key).find(reliable);
      break;
    }
  }
  const heuristic = heuristicPass ? 'pass' : 'refuse';
  return {
    rule: 'facts.identity',
    step: `identity ${route}`.slice(0, 100),
    fact,
    heuristic,
    agree: fact === 'none' || fact === heuristic,
    evidence: evidenceOf(facts, chosen),
  };
}

// --- the live call sites' wrappers (one line each at the site) -------------------

/**
 * captureReadBack's shadow (recorder.ts): only when the exact text match
 * failed (no element shows `value` as its whole text) and a format fact exists
 * under the report key. `showsOnce(text)` is the recorder's own
 * exactly-one-element test. `applied` (stage 2, consumer 3): captureReadBack
 * pinned the value through a reliable rendering under `applied.key` (the
 * report key or a control key of the route); the row is computed under that
 * key and stamped `applied: true` when its verdict is the pin.
 */
export async function shadowReadBack(
  page: Page,
  value: string,
  label: string | undefined,
  pinned: boolean,
  exactCount: (text: string) => Promise<number>,
  applied?: { key: string },
): Promise<void> {
  try {
    if ((!label && !applied) || !activeSession) return;
    const url = page.url();
    const origin = originOf(url);
    if (!origin) return;
    const sf = factsOf(origin);
    if (!sf) return;
    const key = applied?.key ?? reportFormatKey(url, label!);
    if (!factsFor(sf, 'format', key).length) return;
    if (!applied && (await exactCount(value.trim()).catch(() => 1)) !== 0) return; // the exact match did not fail
    const row = await readBackShadow(sf, key, value, pinned, async (r) => (await exactCount(r)) === 1);
    if (row && applied && row.fact === 'pin') Object.assign(row, { applied: true });
    noteFormatShadow(row);
  } catch {
    // a shadow never breaks the read-back it shadows
  }
}

/** learn.ts synthesize's shadow: one call after classifyReportValue, only for an echo. */
export function shadowClassify(
  skill: Pick<Skill, 'origin' | 'steps'>,
  chain: readonly Pick<Skill, 'steps'>[] | undefined,
  template: string,
  params: Record<string, string>,
  shown: readonly string[] | null,
  evidence: GivenEvidence,
  verdict: ReportVerdict,
  url?: string,
): ReportVerdict & { applied?: true } {
  if (verdict.class !== 'echo' || !skill.origin) return verdict;
  try {
    const sf = factsOf(skill.origin);
    if (!sf || !sf.facts.some((f) => f.k === 'format')) return verdict;
    const steps = (chain?.length ? chain : [skill]).flatMap((s) => s.steps);
    // Stage 2 (consumer 1): the shared decision both runners take — the
    // artifact asks it over the snapshot it carries, with the same controls.
    const decided = classifyReportValueWithFacts(sf, url ?? skill.origin, typedControls(steps), template, params, shown, evidence);
    try {
      const row = classifyShadow(sf, steps, template, params, shown, evidence, verdict);
      noteFormatShadow(row && decided.applied ? { ...row, applied: true } : row);
    } catch {
      // a shadow row never breaks the report it describes
    }
    return decided;
  } catch {
    return verdict;
  }
}

/**
 * replay.ts's identity gate, once the marker was not seen as written (stage 2,
 * consumer 2): today's identityMarkerVerdict, unless a reliable format fact on
 * this route renders the marker to a spelling the page shows
 * (execution/facts-display.ts identityMarkerVerdictWithFacts — the artifact
 * asks the same over the snapshot it carries). `snapshot` is the replay's
 * facts hook's (ReplayFactsHook.snapshot); none decides from no facts. The
 * facts.identity row keeps today's verdict as its heuristic and is stamped
 * `applied` when the fact decided. One read of the page, no sweep, shared by
 * the decision and the row.
 */
export async function shadowIdentity(
  page: Page,
  snapshot: SiteFacts | undefined,
  pattern: string | undefined,
  params: Record<string, string>,
  want: string,
  presence: 'present' | 'absent' | 'unknown',
): Promise<IdentityMarkerVerdict & { applied?: true; reason?: string }> {
  const url = page.url();
  const origin = originOf(url) ?? '';
  let lines: Promise<readonly string[] | null> | null = null;
  let title: Promise<string> | null = null;
  const look = {
    presence,
    lines: () => (lines ??= captureLines(page, 2).then((c) => c?.lines ?? null, () => null)),
    title: () => (title ??= page.title().then((t) => t ?? '', () => '')),
  };
  let verdict: IdentityMarkerVerdict & { applied?: true; reason?: string };
  try {
    verdict = await identityMarkerVerdictWithFacts(snapshot ?? emptyFacts(origin), pattern, url, params, want, look);
  } catch {
    verdict = identityMarkerVerdict(pattern, url, params, want, presence);
  }
  try {
    if (!origin) return verdict;
    const sf = snapshot ?? factsOf(origin);
    const route = routeTemplateOf(url);
    if (!sf || !sf.facts.some((f) => f.k === 'format' && f.key.startsWith(`${route}|`))) return verdict;
    const todayPass = verdict.applied ? false : verdict.pass;
    const row = identityShadow(sf, url, want, todayPass, await look.lines(), await look.title());
    noteFormatShadow(row && verdict.applied ? { ...row, applied: true } : row);
  } catch {
    // a shadow row never breaks the gate it describes
  }
  return verdict;
}
