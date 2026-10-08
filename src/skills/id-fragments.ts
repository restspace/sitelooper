/**
 * An element id is an ADDRESS, and the number inside one is either a value the
 * run has evidence for or nothing the run can stand on.
 *
 * gitea fwgt35-luna: every read-back the recorder pinned to a comment or the
 * issue body led with a structural path rooted at that element's id —
 * `#issuecomment-11 > span:nth-of-type(2) > span > a:nth-of-type(1)` (n3
 * 04-set, the label links), `#issue-4 > div > … > p` (n1 07-add, the body),
 * `#issuecomment-3 > span:nth-of-type(2) > a` (n1 05-open and 07-add, the
 * assignee event). The ids are gitea's database ids. On the converged spec's
 * readiness run each primary missed and the step fell back to its recorded
 * point: five drift lines and a refused readiness. The recorder's in-page rule
 * (describeInPage's COUNTER) lets them through by their shape — two digits
 * after a dash read as a name.
 *
 * Shape does not decide here (notes/PLAN-evidence-over-shape.md): a digit run
 * inside an id only PROPOSES a value, and the recording decides what it is.
 *
 *  - The run's own value at a url position: written as its slot
 *    (`#issue-{{v6}}`, slotIdFragments). The textual and minted passes already
 *    slot every value of two characters or more (`#{{d1}}` for gitea's
 *    `issuecomment-15`, which the Comment click's url fragment showed); what
 *    is left is a url-position slot below the text floor — the issue number
 *    `6` at `/issues/6`, the one the app prints as `#6` (substituteHashIds) —
 *    written inside an id only when the segment already uses that param, so
 *    the slot never changes which params a skill keeps or its url gates.
 *  - Shown AS AN ADDRESS by the recording: the whole id in a page line, a
 *    read, a url, a typed value, an instruction or a name a locator found an
 *    element by; or its number standing whole at a url position the recording
 *    visited, or as a value the ledger banked. Kept literal, as before.
 *  - Otherwise: not evidence of anything. The id step is dropped from the
 *    selector; when the id was the selector's root — the recorder's cssPath
 *    roots at the first id it meets, so it always is — nothing stable is left
 *    above it and the candidate goes — but only while the chain keeps another
 *    non-point candidate; otherwise the chain stands unchanged
 *    (anchorEvidencedIds).
 *
 * A bare number in page text is not the id's evidence: fwgt35-luna-n1 showed
 * "3" many times (`link "#3"` — issue 3, a seed — `Issues 3`, `Heading 3`)
 * and never comment 3; `#issuecomment-3` missed on every later run all the
 * same. What the recording shows by its own number is ANOTHER record or a
 * count, and the id's number names a record only where the app put it in an
 * address or the id itself.
 *
 * What counts as "shown" is the recording's OUTPUT side only: never a css, id
 * or test-id selector, an eval's source or result, or a gesture's `target`
 * argument — those are the DOM read back to the model, not the app showing a
 * user the value.
 */
import type { LocatorCandidate, RecordedEntry } from '../daemon/recorder.js';
import { escapeRe } from '../shared/text.js';

/** A url-position slot below the text floor (compile.ts UrlPositionSlot, the fields this needs). */
export interface IdSlot {
  name: string;
  value: string;
  at: string;
}

/** What the recording showed, for anchorEvidencedIds. */
export interface Shown {
  /** Every text: page lines, reads, urls, typed values, instructions, locator names, ledger values. */
  texts: string[];
  /** Every value standing whole at a url position (path or hash-route segment, query or hash-state value), and every ledger value. */
  addresses: Set<string>;
}

/** The values standing whole at a url's positions: path and hash-route segments, query and hash-state values. */
function urlValues(url: string): string[] {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  const out = u.pathname.split('/');
  for (const [, v] of u.searchParams) out.push(v);
  const hash = u.hash.slice(1);
  for (const part of hash.split(/[/?&]/)) out.push(part.includes('=') ? part.slice(part.indexOf('=') + 1) : part);
  return out.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }).filter(Boolean);
}

/**
 * Everything the recording showed — see the header for what counts. `known`
 * is the ledger's values for this run (urls, reads and declared vars of
 * earlier instructions, which `entries` may not hold).
 */
export function shownBy(entries: readonly RecordedEntry[], known: readonly string[] = []): Shown {
  const texts: string[] = [...known];
  const addresses = new Set<string>(known.map((k) => k.trim()).filter(Boolean));
  const push = (v: unknown) => {
    if (typeof v === 'string' && v) texts.push(v);
  };
  const url = (v: unknown) => {
    if (typeof v !== 'string' || !v) return;
    texts.push(v);
    for (const p of urlValues(v)) addresses.add(p);
  };
  for (const k of known) url(k);
  for (const e of entries) {
    if (e.k === 'instruction') {
      push(e.text);
      url(e.url);
      push(e.startText);
      continue;
    }
    if (e.k !== 'step') continue;
    url(e.args.url);
    push(e.args.value);
    push(e.args.text);
    push(e.args.option);
    url(e.afterUrl);
    if (e.diff) {
      url(e.diff.url);
      for (const l of [...e.diff.added, ...(e.diff.removed ?? []), ...e.diff.alerts]) push(l);
    }
    if (e.tool !== 'eval') push(e.result);
    for (const loc of Object.values(e.locators ?? {})) {
      for (const c of loc?.chain ?? []) {
        if (c.kind === 'role') push(c.name);
        else if (c.kind === 'text') push(c.text);
        else if (c.kind === 'label') push(c.label);
        else if (c.kind === 'placeholder') push(c.placeholder);
        else if (c.kind === 'scoped') push(c.hasText);
      }
    }
  }
  return { texts, addresses };
}

/** Whether `id` stands whole (no word character or '-' either side) in any shown text. */
function idShown(id: string, texts: readonly string[]): boolean {
  const re = new RegExp(`(?<![\\w-])${escapeRe(id)}(?![\\w-])`);
  return texts.some((t) => re.test(t));
}

/** One id a selector names: where it sits (`#id`, or an `[id…=…]` attribute, whole) and the id's text. */
interface IdAt {
  start: number;
  end: number;
  id: string;
}

const MARKER = /\{\{[vd]\d+\}\}/g;

/** The ids `selector` names: `#ident` (slot markers included) and `[id=…]` / `[id^=…]` attributes. */
function idsIn(selector: string): IdAt[] {
  const out: IdAt[] = [];
  for (const m of selector.matchAll(/#((?:[\w-]|\\.|\{\{[vd]\d+\}\})+)/g)) {
    // `a[href="#issuecomment-11"]` names an href, not an id.
    if (scan(selector, m.index!).nested) continue;
    out.push({ start: m.index!, end: m.index! + m[0].length, id: m[1] });
  }
  for (const m of selector.matchAll(/\[id[\^$*~|]?=\s*(["']?)([^"'\]]*)\1\s*\]/g)) out.push({ start: m.index!, end: m.index! + m[0].length, id: m[2] });
  return out;
}

/** The digit runs of an id, outside its slot markers. */
function digitRuns(id: string): string[] {
  return [...id.replace(MARKER, ' ').matchAll(/\d+/g)].map((m) => m[0]);
}

/**
 * The selector read up to `at`: whether a combinator stood before it at the
 * top level since the last list comma, and whether `at` itself sits inside
 * brackets, parens or quotes.
 */
function scan(selector: string, at: number): { combinator: boolean; nested: boolean } {
  let depth = 0;
  let quote: string | null = null;
  let combinator = false;
  /** A compound has started in the current list member: whitespace after it is a combinator, before it is padding. */
  let begun = false;
  for (let i = 0; i < at; i++) {
    const ch = selector[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (depth === 0 && ch === ',') {
      // A list comma starts a new selector, whose first compound is a root again.
      combinator = false;
      begun = false;
    } else if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (begun) combinator = true;
    } else {
      begun = true;
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '[' || ch === '(') depth += 1;
      else if (ch === ']' || ch === ')') depth -= 1;
    }
  }
  return { combinator, nested: depth > 0 || quote !== null };
}

/** Whether `at` is past the root compound of its (comma-separated) selector. */
function afterCombinator(selector: string, at: number): boolean {
  return scan(selector, at).combinator;
}

/** Whether a compound selector's text, less one id, is left with nothing: then it stands as `*`. */
function emptied(selector: string, idAt: IdAt): boolean {
  const before = selector.slice(0, idAt.start);
  const after = selector.slice(idAt.end);
  const lead = /[^\s>+~,]*$/.exec(before)![0];
  const tail = /^[^\s>+~,]*/.exec(after)![0];
  return !lead && !tail;
}

export interface IdFragmentOutcome {
  chain: LocatorCandidate[];
  /** Per candidate rewritten or removed: what, and why. */
  notes: string[];
}

/**
 * Drop what anchors on an id the recording never showed as an address (file
 * header), from one locator chain after the slot passes. `shown` is what the
 * recording showed (shownBy); `survives` says whether a candidate outlives the
 * compile passes after this one (compile.ts: not `stranded`).
 *
 * Only ever in favour of something better: a drop or rewrite stands only when
 * the chain keeps a NON-POINT candidate that survives, else the chain is
 * returned unchanged. A rebuild of every published n1 recording (bench/
 * rebuild-survey.mjs, 2026-10-08) left 188 chains point-only under the
 * unguarded rule; a gitea read-back's id css that misses is a readiness
 * warning (fix 5b), while a point-only chain is a position and nothing else.
 */
export function anchorEvidencedIds(chain: readonly LocatorCandidate[], shown: Shown, survives: (c: LocatorCandidate) => boolean = () => true): IdFragmentOutcome {
  const notes: string[] = [];
  const out: LocatorCandidate[] = [];
  for (const c of chain) {
    if (c.kind !== 'css' && c.kind !== 'id') {
      out.push(c);
      continue;
    }
    let selector = c.selector;
    let drop = false;
    // Right to left, so the offsets of the ids still to visit stand.
    for (const at of idsIn(selector).sort((a, b) => b.start - a.start)) {
      const runs = digitRuns(at.id);
      if (!runs.length) continue;
      if (idShown(at.id.replace(/\\/g, ''), shown.texts)) continue;
      const unshown = runs.filter((r) => !shown.addresses.has(r));
      if (!unshown.length) continue;
      if (!afterCombinator(selector, at.start) || c.kind === 'id') {
        drop = true;
        notes.push(`${c.selector}: removed — anchored on id "${at.id}", whose ${unshown.map((r) => `"${r}"`).join(', ')} the recording never showed as an address (the id itself nowhere, the number at no url position, in no ledger value), and nothing stable stands above it`);
        break;
      }
      const stand = emptied(selector, at) ? '*' : '';
      notes.push(`${c.selector}: id "${at.id}" dropped from the path — its ${unshown.map((r) => `"${r}"`).join(', ')} the recording never showed as an address`);
      selector = selector.slice(0, at.start) + stand + selector.slice(at.end);
    }
    if (drop) continue;
    out.push(selector === c.selector ? c : ({ ...c, selector } as LocatorCandidate));
  }
  if (!notes.length) return { chain: [...chain], notes };
  if (!out.some((c) => c.kind !== 'point' && survives(c))) return { chain: [...chain], notes: [] };
  return { chain: out, notes };
}

/**
 * Write a url-position slot below the text floor into the ids of a chain's
 * css and id candidates (`#issue-6` → `#issue-{{v6}}`). The caller passes
 * only slots the segment ALREADY uses elsewhere: a marker here must never be
 * what keeps a param, because a kept url param changes the segment's url
 * gates (`/issues/:id` became `/issues/{{v2}}` in ten gitea recordings under
 * the first cut of this rule). Returns the chain itself when nothing changed.
 */
export function slotIdFragments(chain: LocatorCandidate[], slots: readonly IdSlot[]): { chain: LocatorCandidate[]; notes: string[] } {
  const positionSlots = slots.filter((s) => /^(p|h)\d+$/.test(s.at) && /^\d+$/.test(s.value));
  if (!positionSlots.length) return { chain, notes: [] };
  const notes: string[] = [];
  let changed = false;
  const out = chain.map((c) => {
    if (c.kind !== 'css' && c.kind !== 'id') return c;
    let selector = c.selector;
    for (const at of idsIn(selector).sort((a, b) => b.start - a.start)) {
      let id = at.id;
      for (const run of new Set(digitRuns(at.id))) {
        const slot = positionSlots.find((s) => s.value === run);
        if (slot) id = id.replace(new RegExp(`(?<![\\d{])${run}(?![\\d}])`, 'g'), `{{${slot.name}}}`);
      }
      if (id === at.id) continue;
      const raw = selector.slice(at.start, at.end);
      selector = selector.slice(0, at.start) + raw.replace(at.id, id) + selector.slice(at.end);
      notes.push(`${c.selector}: id "${at.id}" carries the run's own url value — written as "${id}"`);
    }
    if (selector === c.selector) return c;
    changed = true;
    return { ...c, selector } as LocatorCandidate;
  });
  return { chain: changed ? out : chain, notes };
}
