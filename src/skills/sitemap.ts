import fs from 'node:fs';
import path from 'node:path';
import type { PageSignature } from '../daemon/diff.js';
import { urlPattern } from './compile.js';
import { originOf, originSlug, skillsDir } from './store.js';

/**
 * What the tool knows about an APP, as opposed to what it knows about a
 * procedure.
 *
 * A skill (store.ts) only pays off when an instruction repeats: it is a
 * recording of one successful `do`, gated on the page it was recorded from.
 * Most runs never repeat an instruction verbatim, so every run started blind —
 * the model's first move on a page it had visited fifty times before was still
 * `snapshot`, because nothing carried "this page has a Save button" from one
 * session to the next.
 *
 * The site model is the part of that knowledge which survives regardless of
 * instructions: for each page TEMPLATE (compile.ts urlPattern, so
 * /orders/1042 and /orders/1043 are one page), which interactive controls have
 * been seen on it and where acting on them leads. It is written from the
 * signatures the action path already captures, so gathering it costs no extra
 * page work; it is read as one `[site]` line in the instruction's first user
 * message, so acting on turn one needs no observation.
 *
 * Deliberately app-agnostic (README design boundary): a role+name control
 * inventory and a control → destination-template graph are things any web app
 * has. Nothing app-specific is encoded, and no VALUE is ever stored — only the
 * role and accessible name of interactive elements, with digit runs masked, so
 * the file cannot become a record of the data a run touched.
 */
export interface SiteMap {
  version: 1;
  origin: string;
  pages: Record<string, PageTemplate>;
}

export interface PageTemplate {
  /** The url pattern this template is keyed by — compile.ts urlPattern(url). */
  pattern: string;
  /** Last seen document title, digit runs masked so record titles collapse. */
  title?: string;
  seen: number;
  lastSeen: string;
  /** key = `${role} ${JSON.stringify(name)}` — see controlKey. */
  controls: Record<string, Observed>;
  /** key = the control key that was acted on; `to` = destination pattern. */
  transitions: Record<string, { to: string; seen: number; lastSeen: string }>;
}

export interface Observed {
  seen: number;
  lastSeen: string;
}

/**
 * Roles worth remembering: things the agent can act on, plus `heading`.
 * Headings are not actionable but they NAME the page ("Sales Orders"), which
 * is what lets a `[site]` line be recognised as describing the page in front
 * of the model rather than some other route with a similar url.
 *
 * Deliberately narrower than refs.ts INTERACTIVE_ROLES: that set also matches
 * row/cell/grid/status, which on a list view are the DATA. Storing those would
 * make the inventory churn per record, blow the per-template cap in one visit,
 * and leak page content into a file meant to hold structure only.
 */
const KEEP_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'option',
  'heading',
]);

/** Bounds. Least-recently-seen is evicted first; a stale page costs a slot. */
const MAX_PAGES = 60;
const MAX_CONTROLS = 80;
const MAX_TRANSITIONS = 40;
const MAX_NAME = 60;
const MAX_TITLE = 80;
const RENDER_BUDGET = 700;
const MAX_TRANSITIONS_SHOWN = 4;
/** Above this many controls, ones seen exactly once are noise from one visit. */
const CROWDED = 12;
const MIN_SHOWN = 8;

/**
 * Runs of 3+ digits are the volatile part of a name: "Order 1042" and
 * "Order 1043" are the same control on the same page template. Two digits are
 * left alone because they are usually structure ("Q4", "Step 2"), not identity.
 */
export function maskDigits(text: string): string {
  return text.replace(/\d{3,}/g, '#');
}

/** The stable identity of one control: role plus masked, capped name. */
export function controlKey(role: string, name: string): string {
  return `${role} ${JSON.stringify(maskDigits(name).slice(0, MAX_NAME))}`;
}

/**
 * One PageSignature line → the control it describes, or null.
 *
 * diff.ts emits `- role "name"` with an optional `: value` or ` [checked]`
 * suffix. Only the role and the name are read: the suffix is exactly the part
 * that carries user data, and it is never stored.
 */
export function parseSignatureLine(line: string): { role: string; name: string } | null {
  const m = /^-\s+([a-zA-Z][\w-]*)\s+("(?:[^"\\]|\\.)*")/.exec(line);
  if (!m) return null;
  const role = m[1];
  if (!KEEP_ROLES.has(role)) return null;
  let name: string;
  try {
    name = JSON.parse(m[2]) as string;
  } catch {
    return null;
  }
  name = name.trim();
  // A nameless control cannot be described to the model or targeted by name,
  // so remembering it would only consume a slot.
  if (!name) return null;
  return { role, name };
}

/**
 * The control a tool call acted on, from the `target` argument it was given.
 *
 * Two shapes reach here: an `@eN` ref, whose role/name the ref registry
 * remembers from the snapshot that minted it (refs.ts refHint), and a raw
 * selector. Only `role=…[name="…"]` selectors can be read back with
 * confidence; a CSS selector says nothing about the accessible name, and
 * inventing one would put a wrong edge in the graph, so it yields null and the
 * transition is simply not recorded.
 */
export function controlFromTarget(
  target: string | undefined,
  hint?: { role: string; name?: string } | null,
): { role: string; name?: string } | null {
  if (hint?.role && hint.name) return { role: hint.role, name: hint.name };
  const raw = (target ?? '').trim();
  const m = /^role=([a-zA-Z][\w-]*)\[name=(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(raw);
  if (!m) return null;
  const name = (m[2] ?? m[3] ?? '').replace(/\\"/g, '"');
  return name ? { role: m[1], name } : null;
}

/**
 * The accumulated site model, one file per origin under the skills dir.
 *
 * Reads are cached per instance (observe runs after every action, hundreds of
 * times a session, and must not touch the disk); writes happen only in
 * flush(), once per instruction, and are atomic so a killed daemon cannot
 * leave a half-written map that poisons every later run.
 *
 * NOTHING here may throw. It is an optimisation layered on top of work that
 * already succeeded: a corrupt file, an unwritable directory or a malformed
 * url must degrade to "no site knowledge", never to a failed instruction.
 */
export class SiteModel {
  private readonly cache = new Map<string, SiteMap>();
  private readonly dirty = new Set<string>();

  constructor(readonly dir: string = skillsDir()) {}

  /** `<dir>/<encoded origin>/sitemap.json`, mirroring SkillStore's encoding. */
  private file(origin: string): string {
    return path.join(this.dir, originSlug(origin), 'sitemap.json');
  }

  load(origin: string): SiteMap {
    const cached = this.cache.get(origin);
    if (cached) return cached;
    const map = this.read(origin);
    this.cache.set(origin, map);
    return map;
  }

  private read(origin: string): SiteMap {
    const empty: SiteMap = { version: 1, origin, pages: {} };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file(origin), 'utf8')) as Partial<SiteMap>;
      if (!raw || raw.version !== 1 || !raw.pages || typeof raw.pages !== 'object') return empty;
      const pages: Record<string, PageTemplate> = {};
      for (const [pattern, page] of Object.entries(raw.pages)) {
        const p = page as Partial<PageTemplate>;
        if (!p || typeof p !== 'object') continue;
        pages[pattern] = {
          pattern: typeof p.pattern === 'string' ? p.pattern : pattern,
          ...(typeof p.title === 'string' ? { title: p.title } : {}),
          seen: typeof p.seen === 'number' ? p.seen : 1,
          lastSeen: typeof p.lastSeen === 'string' ? p.lastSeen : '',
          controls: saneObserved(p.controls),
          transitions: saneTransitions(p.transitions),
        };
      }
      return { version: 1, origin, pages };
    } catch {
      return empty;
    }
  }

  /**
   * Fold one observation of a live page into the model. Called from every
   * signature capture, so it does string work only — no disk, no page calls.
   */
  observe(url: string, sig: PageSignature): void {
    try {
      const origin = originOf(url);
      if (!origin) return;
      const map = this.load(origin);
      const now = new Date().toISOString();
      const page = this.touch(map, urlPattern(url), now);
      const title = (sig?.title ?? '').trim();
      if (title) page.title = maskDigits(title).slice(0, MAX_TITLE);
      const seenHere = new Set<string>();
      for (const line of sig?.lines ?? []) {
        const control = parseSignatureLine(line);
        if (!control) continue;
        const key = controlKey(control.role, control.name);
        // One page can render the same masked control many times (a column of
        // "Order #" links); it is one control, counted once per visit.
        if (seenHere.has(key)) continue;
        seenHere.add(key);
        const entry = page.controls[key];
        if (entry) {
          entry.seen += 1;
          entry.lastSeen = now;
        } else {
          page.controls[key] = { seen: 1, lastSeen: now };
        }
      }
      evict(page.controls, MAX_CONTROLS);
      this.dirty.add(origin);
    } catch {
      // Site knowledge is an optimisation; losing an observation costs nothing.
    }
  }

  /**
   * Record that acting on `control` while on `fromUrl` left the browser on
   * `toUrl`. Recorded even when the destination pattern is unchanged: knowing
   * that "Confirm" keeps you on the record is as useful as knowing that
   * "Orders" leaves it, and it is what lets render() say "stays".
   */
  transition(fromUrl: string, control: { role: string; name?: string } | null | undefined, toUrl: string): void {
    try {
      if (!control?.role || !control.name) return;
      const origin = originOf(fromUrl);
      if (!origin) return;
      const to = urlPattern(toUrl);
      if (!to) return;
      const map = this.load(origin);
      const now = new Date().toISOString();
      // A transition is evidence the page existed, but not evidence of what it
      // showed; touch it without counting a visit or disturbing the inventory.
      const page = this.touch(map, urlPattern(fromUrl), now, false);
      const key = controlKey(control.role, control.name);
      const entry = page.transitions[key];
      if (entry && entry.to === to) {
        entry.seen += 1;
        entry.lastSeen = now;
      } else {
        page.transitions[key] = { to, seen: 1, lastSeen: now };
      }
      evict(page.transitions, MAX_TRANSITIONS);
      this.dirty.add(origin);
    } catch {
      // see observe
    }
  }

  /** Find (or create) the template for a pattern, bumping its recency. */
  private touch(map: SiteMap, pattern: string, now: string, count = true): PageTemplate {
    let page = map.pages[pattern];
    if (!page) {
      page = map.pages[pattern] = { pattern, seen: 0, lastSeen: now, controls: {}, transitions: {} };
    }
    if (count) page.seen += 1;
    page.lastSeen = now;
    evict(map.pages, MAX_PAGES);
    return page;
  }

  /**
   * The `[site]` block for the page the browser is on, or '' when this origin
   * or this template has never been seen. One line, because it rides in every
   * instruction's first user message and competes with the instruction itself
   * for attention; the budget is spent on controls first, since those are what
   * remove the opening `snapshot` turn.
   */
  render(url: string, budget: number = RENDER_BUDGET): string {
    try {
      const origin = originOf(url);
      if (!origin) return '';
      const pattern = urlPattern(url);
      const page = this.load(origin).pages[pattern];
      if (!page || !page.seen) return '';
      const head =
        `[site] This page matches ${shortPattern(pattern, origin)} seen ${page.seen}×` +
        (page.title ? ` (${JSON.stringify(page.title)})` : '') +
        '.';
      const legend = ' Controls are shown as role "name"; target one directly as role=button[name="Save"].';
      const transitions = renderTransitions(page, pattern, origin);
      const controls = rankControls(page);
      // The wrapper (" Known controls here: " … ".") and a worst-case
      // ", … (+NN more)" tail are charged up front, so the budget holds even
      // when the last control that fits is the one that needs the tail.
      let room = budget - head.length - legend.length - transitions.length - 24 - 16;
      const shown: string[] = [];
      for (const key of controls) {
        if (shown.length && room < key.length + 2) break;
        shown.push(key);
        room -= key.length + 2;
      }
      const list = (of: string[]): string =>
        of.length
          ? ` Known controls here: ${of.join(', ')}${
              controls.length > of.length ? `, … (+${controls.length - of.length} more)` : ''
            }.`
          : '';
      // Last-resort guard: whatever the arithmetic above missed (a long title,
      // a budget smaller than the fixed parts), the line still fits.
      while (shown.length > 1 && head.length + list(shown).length + transitions.length + legend.length > budget) {
        shown.pop();
      }
      return head + list(shown) + transitions + legend;
    } catch {
      return '';
    }
  }

  /** Persist every origin changed since the last flush. Called per instruction. */
  flush(): void {
    for (const origin of [...this.dirty]) {
      this.dirty.delete(origin);
      const map = this.cache.get(origin);
      if (!map) continue;
      try {
        const file = this.file(origin);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(map, null, 1));
        fs.renameSync(tmp, file);
      } catch {
        // An unwritable skills dir must not break the run; the in-memory model
        // still serves this session.
      }
    }
  }
}

/**
 * Which controls to show, best first: often-seen before rarely-seen, then
 * alphabetical so the line is stable between instructions (a line that churns
 * for no reason breaks the model's prompt cache and reads as a change).
 *
 * On a crowded page, controls seen exactly once are dropped: they are usually
 * artefacts of a single visit (a transient toast's button, a menu that
 * happened to be open) and would push out the controls that are always there.
 */
function rankControls(page: PageTemplate): string[] {
  let keys = Object.keys(page.controls);
  if (keys.length > CROWDED) {
    const repeated = keys.filter((k) => page.controls[k].seen > 1);
    if (repeated.length >= MIN_SHOWN) keys = repeated;
  }
  return keys.sort((a, b) => page.controls[b].seen - page.controls[a].seen || a.localeCompare(b));
}

function renderTransitions(page: PageTemplate, pattern: string, origin: string): string {
  const entries = Object.entries(page.transitions)
    .sort((a, b) => b[1].seen - a[1].seen || a[0].localeCompare(b[0]))
    .slice(0, MAX_TRANSITIONS_SHOWN);
  if (!entries.length) return '';
  const parts = entries.map(([key, t]) =>
    t.to === pattern ? `click ${key} → stays` : `click ${key} → ${shortPattern(t.to, origin)}`,
  );
  return ` From here: ${parts.join('; ')}.`;
}

/** A pattern is stored absolute; shown relative, since the origin is implied. */
function shortPattern(pattern: string, origin: string): string {
  const rest = pattern.startsWith(origin) ? pattern.slice(origin.length) : pattern;
  return rest || '/';
}

/** Drop least-recently-seen entries until `max` remain. */
function evict(bag: Record<string, { seen: number; lastSeen: string }>, max: number): void {
  const keys = Object.keys(bag);
  if (keys.length <= max) return;
  for (const key of keys
    .sort((a, b) => bag[a].lastSeen.localeCompare(bag[b].lastSeen) || bag[a].seen - bag[b].seen || a.localeCompare(b))
    .slice(0, keys.length - max)) {
    delete bag[key];
  }
}

function saneObserved(raw: unknown): Record<string, Observed> {
  const out: Record<string, Observed> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = value as Partial<Observed>;
    if (!v || typeof v !== 'object') continue;
    out[key] = {
      seen: typeof v.seen === 'number' ? v.seen : 1,
      lastSeen: typeof v.lastSeen === 'string' ? v.lastSeen : '',
    };
  }
  return out;
}

function saneTransitions(raw: unknown): PageTemplate['transitions'] {
  const out: PageTemplate['transitions'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = value as Partial<PageTemplate['transitions'][string]>;
    if (!v || typeof v !== 'object' || typeof v.to !== 'string') continue;
    out[key] = {
      to: v.to,
      seen: typeof v.seen === 'number' ? v.seen : 1,
      lastSeen: typeof v.lastSeen === 'string' ? v.lastSeen : '',
    };
  }
  return out;
}

/**
 * The process-wide model. Every call site (the turn loop's first message, the
 * action path's signature captures) wants the SAME instance: they share one
 * cache, so observing costs no read and rendering costs no disk access, and
 * one flush per instruction writes everything.
 */
let shared: SiteModel | null = null;

export function siteModel(): SiteModel {
  // Re-created when the skills dir moves under it, which is what a test that
  // points $SITELOOPER_SKILLS_DIR at a temp dir does.
  if (!shared || shared.dir !== skillsDir()) shared = new SiteModel();
  return shared;
}
