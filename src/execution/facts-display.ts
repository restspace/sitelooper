/**
 * SITE FACTS, DISPLAY FORMAT DECISIONS (stage 2, Piece J of the stage 2
 * contract; design-site-facts.md §3 consumers 1, 2 and 5): how an app SHOWS a
 * value — espo renders a typed 12500 as "12,500.00", vikunja frames a task id,
 * odoo leads a menu's name with its activity counts — taken from the facts so
 * that BOTH runners decide identically: the daemon from the live store's
 * snapshot, the compiled artifact from the snapshot it carries
 * (`siteFactsAt(url)`). The artifact embeds this exact source
 * (spec/runtime-source.ts), so it imports its siblings and nothing else.
 *
 * Reliable or nothing: every rendering comes through `renderings`, which only
 * reads RELIABLE formats. And a rendering is only ever an ADDITIONAL spelling
 * to accept, never a replacement for the exact one: each decision asks today's
 * rule first, with the exact value, and tries the renderings only where that
 * refused. Where no reliable fact renders anything, each `…WithFacts` form
 * returns today's verdict, computed by the very call it replaces —
 * byte-identical.
 */
import { factsFor, reliable, renderings, routeTemplateOf, type Fact, type SiteFacts } from './facts.js';
import { identityRe, maskNamedCounters } from './text.js';
import { classifyReportValue, templateMarkers, templateValue, type GivenEvidence, type ReportVerdict } from './report.js';
import { identityMarkerVerdict, type IdentityMarkerVerdict } from './gates.js';

// ---------------------------------------------------------------------------
// keys (moved from skills/facts-format.ts, which re-exports them)
// ---------------------------------------------------------------------------

/** A control's name as its format key spells it: whitespace runs collapsed, edges trimmed. */
function foldControlName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** `${route}|${role}|${name}`: a control's format key. */
export function controlKey(url: string, role: string, name: string): string {
  return `${routeTemplateOf(url)}|${role}|${foldControlName(name)}`;
}

/** `${route}|${reportKey}`: a report value's format key. */
export function reportFormatKey(url: string, reportKey: string): string {
  return `${routeTemplateOf(url)}|${reportKey}`;
}

/** `${route}|title`: the document title's format key. */
export function titleKey(url: string): string {
  return `${routeTemplateOf(url)}|title`;
}

// ---------------------------------------------------------------------------
// consumer 1: report classification (learn.ts synthesize, the artifact's report lines)
// ---------------------------------------------------------------------------

/** A control a slot was typed into, as its role locator names it. */
export interface SlotControl {
  role: string;
  name: string;
}

/** Per slot, the controls the procedure typed it into. */
export type SlotControls = Record<string, SlotControl[]>;

/** A step as the typed-control walk reads it (SkillStep, structurally). */
interface TypedControlStep {
  args?: Record<string, unknown>;
  locators?: { target?: readonly { kind: string; role?: string; name?: string }[] };
  body?: readonly TypedControlStep[];
}

/**
 * The controls each slot was TYPED into: every step (loop bodies included)
 * whose `value` or `text` names the slot, by the role candidate of its target
 * chain. What the daemon computes from a replay's chain, and the compiler
 * from a segment's steps, so the artifact carries the same map as a literal.
 */
export function typedControls(steps: readonly TypedControlStep[]): SlotControls {
  const out: SlotControls = {};
  const walk = (list: readonly TypedControlStep[]): void => {
    for (const s of list) {
      const typed = [s.args?.value, s.args?.text].filter((a): a is string => typeof a === 'string');
      const role = (s.locators?.target ?? []).find((c) => c.kind === 'role');
      if (role && typeof role.role === 'string') {
        const control = { role: role.role, name: typeof role.name === 'string' ? role.name : '' };
        for (const slot of new Set(typed.flatMap((a) => templateMarkers(a)))) {
          const list = out[slot] ?? (out[slot] = []);
          if (!list.some((c) => c.role === control.role && c.name === control.name)) list.push(control);
        }
      }
      if (s.body) walk(s.body);
    }
  };
  walk(steps);
  return out;
}

/** Every format key of the origin that names this control, on any route (a field's format does not change by page); this url's route first. */
function controlFormatKeys(sf: SiteFacts, url: string, control: SlotControl): string[] {
  const suffix = `|${control.role}|${foldControlName(control.name)}`;
  const here = `${routeTemplateOf(url)}${suffix}`;
  const keys = [...new Set(sf.facts.filter((f) => f.k === 'format' && f.key.endsWith(suffix)).map((f) => f.key))];
  return [...keys.filter((k) => k === here), ...keys.filter((k) => k !== here)];
}

/**
 * For each slot, the spellings its param value takes under every reliable
 * format fact of the controls it was typed into, the exact value excluded,
 * each once. A slot with no rendering is absent.
 */
export function slotRenderings(sf: SiteFacts, url: string, controls: SlotControls, params: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [slot, list] of Object.entries(controls)) {
    const raw = params[slot];
    if (typeof raw !== 'string' || !raw) continue;
    const spelled: string[] = [];
    for (const control of list) {
      for (const key of controlFormatKeys(sf, url, control)) {
        for (const r of renderings(sf, key, raw)) if (r !== raw && !spelled.includes(r)) spelled.push(r);
      }
    }
    if (spelled.length) out[slot] = spelled;
  }
  return out;
}

/**
 * classifyReportValue, then — only when it calls the value an ECHO of the
 * run's own typing — once more per rendering of each open slot (the other
 * slots as typed), and once with every open slot rendered: a read that
 * returned "12,500.00" for a typed 12500 is the app committing the value in
 * its own spelling. The first retry that is `committed` decides, with
 * `applied: true`; its published value is the EXACT fill (the rendering was
 * only a spelling to accept, never the finding). Otherwise today's verdict,
 * unchanged.
 */
export function classifyReportValueWithFacts(
  sf: SiteFacts,
  url: string,
  controls: SlotControls,
  template: string,
  params: Record<string, string>,
  shown: readonly string[] | null | undefined,
  evidence: GivenEvidence,
  opts: { literal?: boolean } = {},
): ReportVerdict & { applied?: true } {
  const verdict = classifyReportValue(template, params, shown, evidence, opts);
  if (verdict.class !== 'echo' || !sf.facts.length) return verdict;
  const open: SlotControls = {};
  for (const slot of verdict.slots) if (controls[slot]?.length) open[slot] = controls[slot];
  const spelled = slotRenderings(sf, url, open, params);
  const slots = Object.keys(spelled);
  if (!slots.length) return verdict;
  const tries: Record<string, string>[] = [];
  for (const slot of slots) for (const r of spelled[slot]) tries.push({ ...params, [slot]: r });
  if (slots.length > 1) {
    const every = { ...params };
    for (const slot of slots) every[slot] = spelled[slot][0];
    tries.push(every);
  }
  for (const p of tries) {
    const retry = classifyReportValue(template, p, shown, evidence, opts);
    if (retry.class !== 'committed') continue;
    const value = templateValue(template, params, shown, opts);
    if (value === null) continue;
    return { value, class: 'committed', slots: [], applied: true };
  }
  return verdict;
}

// ---------------------------------------------------------------------------
// consumer 2: the identity gate (replay.ts checkIdentity, the artifact's identityChecks)
// ---------------------------------------------------------------------------

/**
 * What the identity gate saw, for identityMarkerVerdictWithFacts: the
 * presence of the marker as written, and — asked only when a reliable
 * rendering exists to look for — the page's lines (the gate's own dialect-2
 * look; null when the page cannot be read) and its title.
 */
export interface IdentityLook {
  presence: 'present' | 'absent' | 'unknown';
  lines: () => Promise<readonly string[] | null>;
  title: () => Promise<string>;
}

/** The one reliable format fact a key renders by (the first, as `renderings` combines them). */
function renderingFact(sf: SiteFacts, key: string): Fact | undefined {
  return factsFor(sf, 'format', key).find(reliable);
}

/** Whitespace collapsed and trimmed, as a snapshot line and a marker are compared. */
function displayWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * identityMarkerVerdict first. Where it refuses, every reliable format fact
 * on this route renders the marker (the bound value): a `|title` key's
 * rendering that IS the page title, or any other key's rendering the page's
 * lines show whole (the identity rule, lineShows' `whole`), passes the gate
 * with `applied: true` and a `reason` naming the fact. vikunja titles a task
 * page "Task #4 (#4)" where the marker is "#4"; espo shows a typed amount as
 * "12,500.00". Otherwise today's verdict, unchanged — and the page is not
 * looked at again unless a reliable rendering exists.
 */
export async function identityMarkerVerdictWithFacts(
  sf: SiteFacts,
  pattern: string | undefined,
  url: string,
  params: Record<string, string>,
  marker: string,
  look: IdentityLook,
): Promise<IdentityMarkerVerdict & { applied?: true; reason?: string }> {
  const verdict = identityMarkerVerdict(pattern, url, params, marker, look.presence);
  if (verdict.pass || !sf.facts.length) return verdict;
  const route = routeTemplateOf(url);
  const keys = [...new Set(sf.facts.filter((f) => f.k === 'format' && f.key.startsWith(`${route}|`)).map((f) => f.key))];
  const want = displayWs(marker);
  let lines: readonly string[] | null | undefined;
  let title: string | undefined;
  for (const key of keys) {
    const spelled = renderings(sf, key, marker).filter((r) => displayWs(r) && displayWs(r) !== want);
    if (!spelled.length) continue;
    let hit: string | undefined;
    if (key.endsWith('|title')) {
      if (title === undefined) title = displayWs(await look.title().catch(() => ''));
      hit = spelled.find((r) => displayWs(r) === title);
    } else {
      if (lines === undefined) lines = await look.lines().catch(() => null);
      const all = (lines ?? []).map(displayWs).join('\n');
      hit = lines ? spelled.find((r) => identityRe(displayWs(r)).test(all)) : undefined;
    }
    if (hit === undefined) continue;
    const fact = renderingFact(sf, key);
    const kind = fact && typeof fact.v === 'object' && 'kind' in fact.v ? fact.v.kind : 'format';
    return {
      pass: true,
      applied: true,
      reason: `identity marker ${JSON.stringify(marker.length > 60 ? `${marker.slice(0, 59)}…` : marker)} shown as ${JSON.stringify(hit.length > 60 ? `${hit.slice(0, 59)}…` : hit)} by fact: format ${kind} on ${key}`,
    };
  }
  return verdict;
}

// ---------------------------------------------------------------------------
// consumer 5: counters on a control's name (liveLines, both runners' effect gates)
// ---------------------------------------------------------------------------

/**
 * The `role|name` controls with a reliable `counter` fact on this url's
 * route: odoo's user menu whose name leads with its activity counts. What
 * liveLines' third argument takes.
 */
export function counterNames(sf: SiteFacts, url: string): string[] {
  if (!sf.facts.length) return [];
  const prefix = `${routeTemplateOf(url)}|`;
  const out: string[] = [];
  for (const f of sf.facts) {
    if (f.k !== 'format' || !f.key.startsWith(prefix) || !reliable(f)) continue;
    if (typeof f.v !== 'object' || !('kind' in f.v) || f.v.kind !== 'counter') continue;
    const name = f.key.slice(prefix.length);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * maskCounters, and — when the line's role and name (counts aside) are in
 * `names` — its leading counter run masked the same way whatever the role.
 * With no names this IS maskCounters.
 */
export function maskCountersWithFacts(line: string, names: readonly string[]): string {
  return maskNamedCounters(line, names);
}
