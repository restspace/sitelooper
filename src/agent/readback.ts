import type { Frame, Page } from 'playwright-core';
import type { RecordedStep } from '../daemon/recorder.js';
import { captureReadBack, captureReadBackAt, noteReadBackFrame, onOwnLine, readBackRenderingsOn } from '../daemon/recorder.js';
import { foldValue } from '../skills/flow.js';
import { lineShows } from '../execution/snapshot.js';
import { MIN_ID_LEN } from '../skills/shape.js';
import { formatSession, observeOnPage, sweptObservations, type SweptFormat } from '../skills/facts-format.js';

/**
 * Site C of notes/PLAN-jev.md, the code half: source a reported value's read-back
 * WITHOUT asking the model where it is.
 *
 * What the model is asked today (`sourceStragglers` in loop.ts) is "point at
 * the element showing this value", answered with the ENTIRE session history as
 * prompt. It fired on 9 of 9 instructions in fwrdj3-n1 and 9 of 9 in fwrdj4-n1,
 * at 2.0-7.4s each — 33s and 36s of a 381s and a 269s recording, ~9-13% of
 * instruction time, for a handful of `{value, selector}` pairs.
 *
 * And the answer is already checked by code: `captureReadBackAt` trusts a
 * model-supplied selector only after it resolves to exactly ONE element whose
 * rendered text is, or carries on its own line, the value. So the model is not
 * being asked to know anything — it is being asked to pick, from the elements
 * that would pass that check, the right one. That is a search, and a search is
 * what code is for. Only when the search returns SEVERAL is there a judgement
 * to make, and only then does anything but code need to run.
 *
 * The cascade this file implements is therefore:
 *
 *   code (exactly one element displays it)  →  Jev (which of these N)  →  model
 *
 * Two classes of value are dropped before any of it, because the LAST step
 * cannot use them either — the model path would spend a full-history prompt to
 * produce a selector `captureReadBackAt` is guaranteed to refuse:
 *
 *  - a value longer than the read-back ceiling (`READ_BACK_MAX_VALUE_CHARS`):
 *    refused on length before the page is even looked at. Report prose —
 *    "none observed — no toast/alert appeared; the change was shown by …" —
 *    is most of what reaches the model today.
 *  - a value NO node on the page contains (`absent`): the same check that
 *    refuses the model's selector (`got !== want && !got.includes(want)`)
 *    refuses every selector there is. Screenshot filenames and `detail_url`s
 *    are the whole population of this class in the repairdesk recordings.
 *
 * Both are proofs about `captureReadBackAt`, not guesses about the page, which
 * is the only reason it is safe to skip the model on them: a wrongly sourced
 * read-back is worse than none (a later replay re-reads the wrong element and
 * publishes a wrong value), and neither class can produce one.
 */

/**
 * The read-back value ceiling, mirrored from `captureReadBack` /
 * `captureReadBackAt` (`want.length > 80` on the folded value, where it is
 * both the "this is prose, not a value" line and, as
 * READ_BACK_LINE_ALLOWANCE, how much more than the value one line may carry).
 * It is a literal there and a literal here rather than a shared constant,
 * because recorder.ts is a module this change may only add `export` keywords
 * to; `test/readback.test.ts` pins the two together.
 */
export const READ_BACK_MAX_VALUE_CHARS = 80;

/** Most elements that may go on one value's ballot; past it the value is list-page ambiguous. */
export const MAX_CANDIDATES = 12;

/** One element of the live page that displays a value, as the ballot sees it. */
export interface DisplayCandidate {
  /**
   * A structural CSS path (`html > body > … :nth-child(n)`) for the element,
   * unique by construction and thrown away immediately: it exists only to hand
   * `captureReadBackAt` something to resolve, which then derives the DURABLE
   * locator from the live element exactly as it does for the model's selector.
   * Nothing built here is ever stored.
   */
  path: string;
  /** What the element renders (innerText), capped. */
  text: string;
  tag: string;
  testid?: string;
  /** Surrounding context, for the Jev ballot only — never used by the code decider. */
  row?: string;
  column?: string;
  label?: string;
  heading?: string;
  dialog?: string;
}

/** A reported value that no deterministic pin could source, with the name it is published under. */
export interface ReadBackTarget {
  /** The evidence key — the output name a later flow step references. */
  name: string;
  value: string;
}

/** One value put to the System One tier: the value, its label, and the elements that show it. */
export interface ReadBackItem extends ReadBackTarget {
  candidates: DisplayCandidate[];
}

/** What the optional decider is asked: every ambiguous value of ONE instruction, at once. */
export interface ReadBackAsk {
  /** The instruction being filed — what the values were reported FOR. */
  instruction: string;
  url?: string;
  items: ReadBackItem[];
}

/** One answer: this value is shown by the element at this path (one of the offered candidates). */
export interface ReadBackPick {
  name: string;
  value: string;
  path: string;
}

/**
 * The decider `runInstruction` accepts for the ambiguous case. A plain function
 * type on purpose: loop.ts must never ask whether a System One tier exists —
 * the cascade is composed at the composition root (the daemon), and with no
 * tier there is simply no decider and the model path runs as it always did.
 */
export type ReadBackDecider = (ask: ReadBackAsk, ctx?: { signal?: AbortSignal }) => Promise<ReadBackPick[] | null>;

/** How an element's rendered text displays a value, or null when it does not. */
export type Display = 'exact' | 'rendered' | 'line' | null;

/**
 * Does this element's own rendered text display `value`?
 *
 * The two tiers are `captureReadBackAt`'s own two acceptances, in its order:
 * the folded text IS the value (`captureReadBack`'s rule, one fold for "are
 * these two strings the same value"), or it CARRIES the value on its own
 * rendered line (`onOwnLine`, the wrapper allowance — a label, a unit, a
 * sibling cell — that stopped grafana's 2,236-character JSON <pre> from
 * "showing" seventeen values).
 *
 * The line tier adds two conditions the model path does not need, because the
 * model knows where it read the value and this search does not:
 *
 *  - a whole-token match (`lineShows`'s identity rule, the repo's one boundary
 *    test), so "1" is not displayed by "$100.00" and `fwrd54-n1` is not
 *    displayed by `fwrd54-n10`;
 *  - a floor of MIN_ID_LEN on the value, so a one- or two-character value is
 *    only ever pinned to an element that shows it AND NOTHING ELSE. Kanboard
 *    task ids are one digit and grafana's `panel_count` is "3": the exact tier
 *    still sources those (`captureReadBack` deliberately dropped its length
 *    floor to 1 for exactly that case, letting the page's own count decide),
 *    but a lone digit sitting inside a longer line is not evidence of
 *    anything.
 */
export function displays(text: string, value: string, renderings: readonly string[] = []): Display {
  const want = foldValue(value);
  if (!want || want.length > READ_BACK_MAX_VALUE_CHARS) return null;
  const got = foldValue(text);
  if (got === want) return 'exact';
  // Site facts, consumer 3 (stage 2): the element's whole text IS one of the
  // value's reliable renderings on this origin ("#4" for a task id kanboard
  // frames with `#`), offered after the exact tier and before the line tier
  // (and so before the model). `renderings` is [] without a reliable fact:
  // then this is today's function.
  if (renderings.some((r) => foldValue(r) === got)) return 'rendered';
  if (!got.includes(want)) return null;
  if (want.length < MIN_ID_LEN) return null;
  if (!onOwnLine(text, want)) return null;
  return lineShows([text], [value], { whole: true }) ? 'line' : null;
}

/** Is `path` the structural path of a descendant of `of`? */
function descends(path: string, of: string): boolean {
  return path.startsWith(`${of} > `);
}

/**
 * The elements that display `value`, smallest first and ancestors removed.
 *
 * Two reductions, in this order:
 *
 *  1. an EXACT displayer beats a line displayer. A `<td>$250.00</td>` and a
 *     `<p>Total $250.00</p>` both pass `captureReadBackAt`; only one of them
 *     is the value's own element, and when any element shows the value and
 *     nothing else, the ones that merely carry it are not candidates.
 *  2. an ancestor of another displayer is dropped. The row that contains the
 *     cell displays the value only by containing the cell — "prefer the
 *     smallest element that displays the value" is this line, and it is what
 *     keeps a table row off the ballot beside its own cell.
 */
export function displayersOf(candidates: readonly DisplayCandidate[], value: string, renderings: readonly string[] = []): DisplayCandidate[] {
  const shown = candidates.map((c) => ({ c, d: displays(c.text, value, renderings) })).filter((x) => x.d !== null);
  const exact = shown.filter((x) => x.d === 'exact').map((x) => x.c);
  // A known rendering is the value's own element too, but only after the
  // exact spelling: exact, then rendered, then everything shown.
  const rendered = shown.filter((x) => x.d === 'rendered').map((x) => x.c);
  const kept = exact.length ? exact : rendered.length ? rendered : shown.map((x) => x.c);
  return kept.filter((c) => !kept.some((other) => other !== c && descends(other.path, c.path)));
}

// --- harvesting the live page ------------------------------------------------

/** What one frame's sweep found for one value. */
interface FrameHits {
  want: string;
  items: DisplayCandidate[];
  /**
   * Occurrences this sweep saw but will not offer: inside a shadow root, or in
   * a non-HTML namespace, where the structural path would not resolve. They
   * are counted rather than dropped because they are the difference between
   * "nothing on this page contains the value" — the proof that lets the model
   * call be skipped — and "nothing this code can point at does".
   */
  extra: number;
  /**
   * Site facts (c), observation only: occurrences that say how the app
   * RENDERS a value — a copy with no box beside a rendered one (`twice`), or
   * an element whose rendered text is its stored text upper-cased (`upper`).
   * Absent when there are none; nothing in the cascade reads it.
   */
  formats?: SweptFormat[];
}

/**
 * Sweep ONE frame for every value at once. Serialised into the page, so it can
 * import nothing: `foldValue` is inlined here for the fourth time (recorder.ts
 * inlines it twice for the same reason), same three operations in the same
 * order.
 *
 * `squeezed` — whitespace removed rather than collapsed — exists only for the
 * absence proof. `innerText` inserts whitespace `textContent` does not have (a
 * tab between table cells, a newline for a `<br>`), so a value read off the
 * rendered text can be absent from every `textContent` and still be found by
 * the model's selector. The squeezed form matches strictly more, so a value it
 * cannot find anywhere is one `captureReadBackAt` cannot source anywhere.
 */
function sweepFrame(payload: { wants: string[]; max: number }): FrameHits[] {
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'base']);
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const fold = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const squeeze = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, '').toLowerCase();
  const trim = (s: string | null | undefined, n: number): string => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

  const cssPath = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.parentElement) {
      const parent: Element = node.parentElement;
      let i = 1;
      for (const sib of Array.from(parent.children)) {
        if (sib === node) break;
        i += 1;
      }
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${i})`);
      node = parent;
    }
    parts.unshift('html');
    return parts.join(' > ');
  };

  const headingNear = (el: Element): string => {
    for (let a: Element | null = el; a; a = a.parentElement) {
      for (let s = a.previousElementSibling; s; s = s.previousElementSibling) {
        if (s.matches('h1, h2, h3, h4, h5, h6')) return trim((s as HTMLElement).innerText, 80);
      }
      const own = a.querySelector('h1, h2, h3, h4, h5, h6');
      if (own && !own.contains(el)) return trim((own as HTMLElement).innerText, 80);
    }
    return '';
  };

  const context = (el: Element): Partial<DisplayCandidate> => {
    const out: Partial<DisplayCandidate> = {};
    const testid = el.closest('[data-testid]');
    if (testid) out.testid = testid.getAttribute('data-testid') ?? undefined;
    const row = el.closest('tr, [role=row], li, [role=listitem]');
    if (row) out.row = trim((row as HTMLElement).innerText, 200);
    const cell = el.closest('td');
    if (cell && cell.parentElement) {
      const index = Array.from(cell.parentElement.children).indexOf(cell);
      const table = el.closest('table');
      const head = table ? table.querySelector('thead tr, tr') : null;
      const th = head ? head.children[index] : null;
      if (th) out.column = trim((th as HTMLElement).innerText, 60);
    }
    const labelled = el.closest('label');
    const aria = el.getAttribute('aria-label');
    const forId = (el as HTMLInputElement).labels && (el as HTMLInputElement).labels?.length ? (el as HTMLInputElement).labels![0] : null;
    const label = labelled ?? forId;
    if (aria) out.label = trim(aria, 60);
    else if (label) out.label = trim((label as HTMLElement).innerText, 60);
    const dialog = el.closest('[role=dialog], dialog, [aria-modal=true]');
    if (dialog) out.dialog = trim(dialog.getAttribute('aria-label') ?? (dialog as HTMLElement).innerText, 80);
    const heading = headingNear(el);
    if (heading) out.heading = heading;
    return out;
  };

  // Every element of this frame, shadow roots included, once — and its own
  // text squeezed ONCE. Read per value instead, this would re-squeeze every
  // ancestor's whole subtree for every value: an odoo form is ~3,000 elements
  // and a megabyte of nested text, and the lesson of notes/PLAN-jev.md's step 3 is
  // that the expensive thing in a recording is never the part anyone budgeted
  // for.
  const nodes: Element[] = [];
  const texts: string[] = [];
  const index = new Map<Element, number>();
  const roots: Array<Document | ShadowRoot> = [document];
  while (roots.length) {
    const root = roots.pop()!;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if ((el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot) roots.push((el as Element & { shadowRoot: ShadowRoot }).shadowRoot);
      const tag = el.tagName.toLowerCase();
      if (SKIP.has(tag)) continue;
      const control = tag === 'input' || tag === 'textarea' || tag === 'select';
      index.set(el, nodes.length);
      nodes.push(el);
      texts.push(squeeze(control ? (el as HTMLInputElement).value ?? '' : el.textContent ?? ''));
    }
  }

  // Site facts (c): the role and a name for an element whose rendering says
  // something about format. The name never carries the value itself.
  const IMPLICIT: Record<string, string> = { a: 'link', button: 'button', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', td: 'cell', th: 'columnheader', li: 'listitem', option: 'option' };
  const formatOf = (el: Element, kind: 'twice' | 'upper', want: string) => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || IMPLICIT[tag] || tag;
    const ctx = context(el);
    const name = ctx.label ?? ctx.column ?? ctx.heading ?? '';
    return { kind, role, name: fold(name).includes(fold(want)) ? '' : name };
  };
  const casedOnly = (el: Element): boolean => {
    const rendered = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, '');
    const stored = (el.textContent ?? '').replace(/\s+/g, '');
    return rendered !== stored && rendered.toLowerCase() === stored.toLowerCase() && rendered === rendered.toUpperCase();
  };

  return payload.wants.map((want) => {
    const squeezedWant = squeeze(want);
    const items: DisplayCandidate[] = [];
    let extra = 0;
    const hidden: Element[] = [];
    const formats: Array<{ kind: 'twice' | 'upper'; role: string; name: string }> = [];
    for (let n = 0; n < nodes.length; n++) {
      const el = nodes[n];
      const tag = el.tagName.toLowerCase();
      const control = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (!texts[n].includes(squeezedWant)) continue;
      // A form control is an occurrence, never a candidate: the shared
      // verifier reads an element's `innerText`, which is '' for an input, so
      // `captureReadBackAt` refuses a control whatever points at it. The
      // control path is `captureFormValue`'s, and it has already run and
      // already refused (that is why this value is here at all). Counting it
      // keeps `absent` honest without offering something that cannot be
      // sourced.
      if (control) {
        extra += 1;
        continue;
      }
      // The smallest node that holds it: an ancestor whose text contains the
      // value only because a child of it does is not displaying anything.
      let deeper = false;
      for (const child of Array.from(el.children)) {
        const at = index.get(child);
        if (at === undefined) continue; // skipped tag: it renders nothing
        if (texts[at].includes(squeezedWant)) deeper = true;
      }
      if (deeper) continue;
      // Not offerable, but it exists: it keeps `absent` honest (see FrameHits.extra).
      if (el.namespaceURI !== HTML_NS || el.getRootNode() !== document) {
        extra += 1;
        continue;
      }
      // An element with no box renders nothing, so it displays nothing — but
      // it is still a place the value IS, so it counts as an occurrence.
      if (!el.getClientRects().length) {
        extra += 1;
        hidden.push(el);
        continue;
      }
      const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
      if (casedOnly(el)) formats.push(formatOf(el, 'upper', want));
      if (!fold(text).includes(fold(want))) {
        // Rendered differently from how it is stored (an innerText tab, a
        // hidden sibling): the occurrence is real, the element is not a
        // candidate this code can judge.
        extra += 1;
        continue;
      }
      items.push({ path: cssPath(el), text: text.slice(0, 400), tag, ...context(el) });
      if (items.length > payload.max) break;
    }
    // A copy with no box beside one that renders: the app shows it twice.
    if (items.length) for (const el of hidden) formats.push(formatOf(el, 'twice', want));
    return formats.length ? { want, items, extra, formats } : { want, items, extra };
  });
}

/** Everything the live page offers for one value. */
export interface ValueSighting {
  candidates: DisplayCandidate[];
  /** Occurrences that exist but cannot be offered (shadow DOM, other frames, unrendered). */
  extra: number;
  /** More candidates than a ballot may hold — a list page, where picking one is guesswork. */
  truncated: boolean;
  /**
   * A frame refused to be swept (navigating, detached, cross-origin). Then
   * NOTHING is known: not that the value is absent — the proof that skips the
   * model rests on having looked everywhere — and not that one candidate is
   * the only one. An incomplete sweep decides nothing and the value goes on
   * to the model, which is where it went before this file existed.
   */
  incomplete: boolean;
}

/**
 * Where each value is displayed on the CURRENT page, main frame first.
 *
 * Every frame is swept, not just the one whose elements can be offered: the
 * question "is this value anywhere on this page" has to be answered over the
 * whole page for its answer to license skipping the model.
 */
export async function sightValues(page: Page, values: readonly string[]): Promise<Map<string, ValueSighting>> {
  const wants = [...new Set(values.map((v) => v.trim()).filter((v) => foldValue(v).length > 0 && foldValue(v).length <= READ_BACK_MAX_VALUE_CHARS))];
  const out = new Map<string, ValueSighting>();
  if (!wants.length) return out;
  for (const want of wants) out.set(want, { candidates: [], extra: 0, truncated: false, incomplete: false });
  const frames: Frame[] = page.frames();
  const main = page.mainFrame();
  const swept: SweptFormat[] = [];
  for (const frame of frames) {
    let hits: FrameHits[];
    try {
      hits = await frame.evaluate(sweepFrame, { wants, max: MAX_CANDIDATES });
    } catch {
      // A navigating or detached frame answers nothing, and a sweep that did
      // not cover the page cannot say what is not on it.
      for (const sighting of out.values()) sighting.incomplete = true;
      continue;
    }
    for (const hit of hits) {
      const sighting = out.get(hit.want);
      if (!sighting) continue;
      if (frame === main && hit.formats?.length) swept.push(...hit.formats);
      if (frame === main) {
        sighting.candidates.push(...hit.items.slice(0, MAX_CANDIDATES));
        if (hit.items.length > MAX_CANDIDATES) sighting.truncated = true;
      } else {
        sighting.extra += hit.items.length;
      }
      sighting.extra += hit.extra;
    }
  }
  // Site facts (c): observed under the daemon's recording session, never read here.
  if (swept.length && formatSession()) {
    try {
      observeOnPage(page.url(), sweptObservations(page.url(), swept));
    } catch {
      // an observer never breaks the sweep it watches
    }
  }
  return out;
}

// --- the cascade -------------------------------------------------------------

/** Why a value was not put to the model — each a proof that the model could not have sourced it. */
export type Unsourceable = 'prose' | 'absent';

export interface ReadBackOutcome {
  /** Read-back steps to file, labelled with the value's evidence key. */
  steps: RecordedStep[];
  /** Values sourced by code alone, by name. */
  byCode: string[];
  /** Values sourced by the optional decider, by name. */
  byDecider: string[];
  /** Still unsourced AND still worth asking the model about. */
  remaining: ReadBackTarget[];
  /** Unsourced and provably not worth a model call, with the proof that says so. */
  dropped: Array<{ name: string; value: string; why: Unsourceable }>;
  /** Whether the decider was consulted (it is only consulted when something is ambiguous). */
  askedDecider: boolean;
  /**
   * Wall-clock of each half, so the timing rows this replaces the model call
   * with say what the replacement cost. The model turn it stands in for was
   * 2.0-7.4s; these are expected to be tens of milliseconds and ~0.3s.
   */
  ms: { code: number; decider: number };
}

export interface ReadBackOptions {
  instruction: string;
  url?: string;
  decider?: ReadBackDecider | null;
  /**
   * How a chosen element becomes a step. Always `captureReadBackAt` in
   * production — the point of the whole cascade is that every path, code, Jev
   * and model, goes through the SAME verifier, which resolves the selector,
   * insists it is the only match, insists the text is the value, and derives a
   * non-circular locator from the live element.
   */
  pin: (value: string, selector: string) => Promise<RecordedStep | null>;
  signal?: AbortSignal;
}

/**
 * The read-back cascade for one instruction's un-pinnable values.
 *
 * Returns what to file and what is left for the model. It never throws: a page
 * that cannot be swept leaves every value `remaining`, which is exactly the
 * behaviour this file replaced.
 */
export async function sourceReadBacks(targets: readonly ReadBackTarget[], page: Page, opts: ReadBackOptions): Promise<ReadBackOutcome> {
  const out: ReadBackOutcome = { steps: [], byCode: [], byDecider: [], remaining: [], dropped: [], askedDecider: false, ms: { code: 0, decider: 0 } };
  const startedAt = Date.now();
  const live = targets.filter((t) => {
    const folded = foldValue(t.value);
    if (!folded) return false;
    // Refused on length by captureReadBackAt whatever selector it is given.
    if (folded.length > READ_BACK_MAX_VALUE_CHARS) {
      out.dropped.push({ name: t.name, value: t.value, why: 'prose' });
      return false;
    }
    return true;
  });
  if (!live.length) return out;

  let sightings: Map<string, ValueSighting>;
  try {
    sightings = await sightValues(page, live.map((t) => t.value));
  } catch {
    out.remaining = [...live];
    return out;
  }

  const ambiguous: ReadBackItem[] = [];
  for (const target of live) {
    const sighting = sightings.get(target.value.trim());
    if (!sighting) {
      out.remaining.push(target);
      continue;
    }
    if (sighting.incomplete) {
      out.remaining.push(target);
      continue;
    }
    const displayers = displayersOf(sighting.candidates, target.value, readBackRenderingsOn(page, target.value, target.name));
    if (displayers.length === 1 && !sighting.truncated) {
      const step = await opts.pin(target.value, displayers[0].path).catch(() => null);
      if (step) {
        await noteFramedPin(page, step, target.name);
        out.steps.push({ ...step, label: target.name });
        out.byCode.push(target.name);
        continue;
      }
      // The verifier refused what the search found (a value-only identity, a
      // re-render between the sweep and the pin). Not sourced, and not proven
      // absent either — the model still gets its turn.
      out.remaining.push(target);
      continue;
    }
    if (displayers.length > 1 && !sighting.truncated) {
      ambiguous.push({ ...target, candidates: displayers });
      continue;
    }
    if (!displayers.length && !sighting.candidates.length && !sighting.extra && !sighting.truncated) {
      // Nothing anywhere on the page contains this value, so the check that
      // guards the model's selector refuses every selector that exists.
      out.dropped.push({ name: target.name, value: target.value, why: 'absent' });
      continue;
    }
    out.remaining.push(target);
  }

  out.ms.code = Date.now() - startedAt;
  if (!ambiguous.length || !opts.decider) {
    out.remaining.push(...ambiguous);
    return out;
  }

  out.askedDecider = true;
  const askedAt = Date.now();
  const picks = await opts
    .decider({ instruction: opts.instruction, ...(opts.url ? { url: opts.url } : {}), items: ambiguous }, { ...(opts.signal ? { signal: opts.signal } : {}) })
    .catch(() => null);
  out.ms.decider = Date.now() - askedAt;
  const chosen = new Map((picks ?? []).map((p) => [p.name, p]));
  for (const item of ambiguous) {
    const pick = chosen.get(item.name);
    // A pick is only ever one of the elements code put on the ballot: the
    // decider ORDERS options, it never widens them (notes/PLAN-jev.md §2).
    const candidate = pick ? item.candidates.find((c) => c.path === pick.path && pick.value === item.value) : undefined;
    if (!candidate) {
      out.remaining.push({ name: item.name, value: item.value });
      continue;
    }
    const step = await opts.pin(item.value, candidate.path).catch(() => null);
    if (step) {
      await noteFramedPin(page, step, item.name);
      out.steps.push({ ...step, label: item.name });
      out.byDecider.push(item.name);
    } else {
      out.remaining.push({ name: item.name, value: item.value });
    }
  }
  return out;
}

/**
 * One PART of a split composite, pinned: captureReadBack first, and where it
 * refuses, the code tier's own judgement — the one element the page RENDERS
 * the part in (sightValues skips an element with no box; displayersOf keeps
 * the smallest exact displayer), verified by captureReadBackAt. No model: a
 * part is pinned by code or the split does not happen.
 *
 * kanboard fwkb41 is why. `board_columns_left_to_right = "Backlog, Ready, Work
 * in progress, Done"` split into four titles, but Kanboard renders each title
 * twice — the header, and a collapsed-column copy that is not rendered —
 * and captureReadBack's text count saw both, so every part was "ambiguous",
 * the all-or-nothing split published nothing, and both replays failed obj 1
 * (every kanboard flow had pruned the columns since fwkb18). The code tier
 * counts only what is shown. Visible matches in two records are still two
 * displayers, and still refused (fwod9).
 */
export async function pinPart(page: Page, value: string, name: string): Promise<RecordedStep | null> {
  const direct = await captureReadBack(page, value, name).catch(() => null);
  if (direct) return direct;
  let sighting: ValueSighting | undefined;
  try {
    sighting = (await sightValues(page, [value])).get(value.trim());
  } catch {
    return null;
  }
  if (!sighting || sighting.incomplete || sighting.truncated) return null;
  const displayers = displayersOf(sighting.candidates, value, readBackRenderingsOn(page, value, name));
  if (displayers.length !== 1) return null;
  const step = await captureReadBackAt(page, value, displayers[0].path, name).catch(() => null);
  return step ? { ...step, label: name } : null;
}

/**
 * Site facts (b) for a pin the cascade made: the verifier it is handed takes
 * no report key, so a framed pin is observed here, where the key is known.
 * Only under the daemon's recording session; never throws.
 */
async function noteFramedPin(page: Page, step: RecordedStep, key: string): Promise<void> {
  if (!formatSession() || typeof step.args.frame !== 'string' || typeof step.result !== 'string') return;
  let value: unknown;
  try {
    value = JSON.parse(step.result);
  } catch {
    return;
  }
  if (typeof value === 'string') await noteReadBackFrame(page, value, step.args.frame, key);
}

/** The `[read-back]` progress line for a cascade outcome, or '' when it did nothing worth saying. */
export function describeOutcome(out: ReadBackOutcome): string {
  const parts: string[] = [];
  if (out.byCode.length) parts.push(`code sourced ${out.byCode.length} (${out.byCode.join(', ')})`);
  if (out.byDecider.length) parts.push(`jev sourced ${out.byDecider.length} (${out.byDecider.join(', ')})`);
  const prose = out.dropped.filter((d) => d.why === 'prose').length;
  const absent = out.dropped.filter((d) => d.why === 'absent').length;
  if (prose) parts.push(`${prose} too long to pin`);
  if (absent) parts.push(`${absent} not shown anywhere on the page`);
  if (out.remaining.length) parts.push(`${out.remaining.length} left for the model`);
  return parts.length ? `[read-back] ${parts.join('; ')}` : '';
}
