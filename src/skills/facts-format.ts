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
 *    daemon/server.ts (a replay). Nothing here changes a decision.
 *
 * Everything is best effort: an observer or a shadow that fails is a missing
 * row, never a failed step.
 */
import type { Locator, Page } from 'playwright-core';
import {
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
import { classifyReportValue, templateMarkers, type GivenEvidence, type ReportVerdict } from '../execution/report.js';
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
}

export function formatSession(): string | null {
  return activeSession;
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

/** `${route}|${role}|${name}`: a control's format key. */
export function controlKey(url: string, role: string, name: string): string {
  return `${routeTemplateOf(url)}|${role}|${name.replace(/\s+/g, ' ').trim()}`;
}

/** `${route}|${reportKey}`: a report value's format key. */
export function reportFormatKey(url: string, reportKey: string): string {
  return `${routeTemplateOf(url)}|${reportKey}`;
}

/** `${route}|title`: the document title's format key. */
export function titleKey(url: string): string {
  return `${routeTemplateOf(url)}|title`;
}

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

/** (a) observations for one committed fill/type: hard, keyed by the control. */
export function typedObservations(url: string, role: string, name: string, typed: string, shown: string): Omit<Observation, 'session' | 'k'>[] {
  if (!role || /\{\{/.test(typed)) return [];
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

/**
 * An affix template from a read-back FRAME: one line, one mark, nothing else
 * still asking for a value. "Folder\n{{=}}" (a label line) and a frame with a
 * slot left in it describe a layout, not how the value is spelled.
 */
export function affixOfFrame(frame: string): string | null {
  if (!frame || frame === FRAME_MARK || /[\r\n]/.test(frame)) return null;
  if (frame.split(FRAME_MARK).length !== 2) return null;
  if (/\{\{(?!=\}\})/.test(frame.replace(FRAME_MARK, ''))) return null;
  return frame;
}

/**
 * (b) the observation for a read-back pinned by containment: the frame IS the
 * affix, keyed by the report key on the page's route. HARD when the value is
 * proven this page's record (the url names it: recorder.ts recordIdsOf) or the
 * page shows its text exactly once; SOFT otherwise.
 */
export function frameObservation(url: string, reportKey: string, frame: string, proven: boolean): Omit<Observation, 'session' | 'k'> | null {
  const tpl = affixOfFrame(frame);
  if (!tpl || !reportKey) return null;
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

export function titleObservation(url: string, title: string, value: string): Omit<Observation, 'session' | 'k'> | null {
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
export type FactShadowRow = Omit<ShadowRow, 'evidence'> & { evidence: FactEvidence };

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

/** The role|name of the control each typed slot was typed into, from the skill's steps. */
function slotControls(steps: readonly SkillStep[], slot: string): { role: string; name: string }[] {
  const out: { role: string; name: string }[] = [];
  const walk = (list: readonly SkillStep[]) => {
    for (const s of list) {
      const typed = [s.args?.value, s.args?.text].filter((a): a is string => typeof a === 'string');
      if (typed.some((a) => templateMarkers(a).includes(slot))) {
        const chain = s.locators?.target ?? [];
        const role = chain.find((c) => c.kind === 'role') as { role: string; name: string } | undefined;
        if (role) out.push({ role: role.role, name: role.name });
      }
      const body = (s as { body?: readonly SkillStep[] }).body;
      if (body) walk(body);
    }
  };
  walk(steps);
  return out;
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
 * exactly-one-element test.
 */
export async function shadowReadBack(
  page: Page,
  value: string,
  label: string | undefined,
  pinned: boolean,
  exactCount: (text: string) => Promise<number>,
): Promise<void> {
  try {
    if (!label || !activeSession) return;
    const url = page.url();
    const origin = originOf(url);
    if (!origin) return;
    const sf = factsOf(origin);
    if (!sf) return;
    const key = reportFormatKey(url, label);
    if (!factsFor(sf, 'format', key).length) return;
    if ((await exactCount(value.trim()).catch(() => 1)) !== 0) return; // the exact match did not fail
    noteFormatShadow(await readBackShadow(sf, key, value, pinned, async (r) => (await exactCount(r)) === 1));
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
): void {
  try {
    if (verdict.class !== 'echo' || !skill.origin) return;
    const sf = factsOf(skill.origin);
    if (!sf || !sf.facts.some((f) => f.k === 'format')) return;
    const steps = (chain?.length ? chain : [skill]).flatMap((s) => s.steps);
    noteFormatShadow(classifyShadow(sf, steps, template, params, shown, evidence, verdict));
  } catch {
    // a shadow never breaks the report it shadows
  }
}

/** replay.ts's identity gate shadow: one call after identityMarkerVerdict. One read of the page, no sweep. */
export async function shadowIdentity(page: Page, want: string, pass: boolean): Promise<void> {
  try {
    const url = page.url();
    const origin = originOf(url);
    if (!origin) return;
    const sf = factsOf(origin);
    const route = routeTemplateOf(url);
    if (!sf || !sf.facts.some((f) => f.k === 'format' && f.key.startsWith(`${route}|`))) return;
    const live = await captureLines(page, 2).catch(() => null);
    const title = (await page.title().catch(() => '')) ?? '';
    noteFormatShadow(identityShadow(sf, url, want, pass, live?.lines ?? null, title));
  } catch {
    // a shadow never breaks the gate it shadows
  }
}
