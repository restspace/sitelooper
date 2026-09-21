import type { Page } from 'playwright-core';
import { WILDCARD, escapeRe, identityRe } from './text.js';
import { settleDom } from './browser.js';

/**
 * The page-observation model both execution targets share: one STRUCTURED
 * observation of the live page (roles, names, values, states, where each
 * element sits, and how much of the page the look actually covered), the
 * snapshot-line dialects rendered from it (`- role "name": value`), and the
 * matchers that read those lines. The daemon imports this module (through
 * daemon/diff.ts and skills/replay.ts); a compiled `.flow.ts` artifact embeds
 * its exact source (spec/runtime-source.ts), so both runners ask their effect
 * and identity questions of the same observation. It must stay
 * self-contained: nothing but a sibling shared module or a Playwright type may
 * be imported.
 *
 * WHY TWO DIALECTS. Recorded lines are persisted — in recordings, in stored
 * step expectations, in compiled artifacts — and matched as substrings. The
 * first dialect named a `<label for>` input `""`, walked no frame or shadow
 * root, and carried no disabled state; fixing any of that in place would make
 * every stored line for such an element disagree with the live page. So a
 * recorded step says which dialect its lines are in (StepExpectation
 * .lineDialect, absent = 1), and each runner renders the live observation in
 * THAT dialect before comparing. Dialect 1 is byte-identical to the capture it
 * replaced (test/observation.browser.test.ts keeps the old function as its
 * oracle); dialect 2 is what new recordings are written in.
 *
 * WHY COVERAGE. A capture that walked 4,000 of 9,000 elements, stopped at the
 * line cap, could not read a visible iframe, or looked at a virtualised grid
 * showing 20 of 340 rows, has NOT established that something is absent. Every
 * absence question goes through `presence`, which answers 'unknown' there
 * instead of 'absent'.
 */

/** Which rendering of an observation a set of recorded lines is in. Absent on a stored step means 1. */
export type LineDialect = 1 | 2;

/** What new recordings are written in. */
export const CURRENT_DIALECT = 2 as const;

/** What a capture is allowed to walk and return — passed INTO the page, since observeDocumentInPage is serialised. */
export const SNAPSHOT_LIMITS = { maxAlerts: 5, maxAlertChars: 200, maxNodes: 4_000, maxLines: 400 };

/**
 * The budget open shadow roots are walked under, ON TOP of SNAPSHOT_LIMITS: a
 * separate budget, so the dialect-1 walk (and so every dialect-1 line) is
 * untouched by how much shadow content a page carries.
 */
export const SHADOW_LIMITS = { maxExtraNodes: 4_000, maxExtraLines: 400 };

/** A capture that has not answered in this long is a navigating or hung page: null, never a wait. */
export const CAPTURE_TIMEOUT_MS = 2_000;

/** How many visible child frames one observation evaluates; a visible frame past this is a coverage gap. */
export const MAX_FRAMES = 10;

/** The least time frames are given once the main document has answered, however long it took. */
export const FRAME_MIN_BUDGET_MS = 500;

/** Where an element sits: `frame` is the child-index path from the main frame ([] = main document); `shadow` the open shadow hosts above it, as `tag#id`. */
export interface NodeContext {
  frame: number[];
  shadow: string[];
}

export interface ObservedNode {
  role: string;
  /** The dialect-2 name: dialect 1's, except that an element with no name of its own is named by its `<label>`s and a shadow-scoped aria-labelledby resolves. */
  name: string;
  /** The dialect-1 name, exactly as the first capture computed it. */
  legacyName: string;
  /** Present when the element carries a nonempty string value (not for a checkbox or radio). */
  value?: string;
  /** Present for a checkbox or radio input: whether it is checked. */
  checked?: boolean;
  disabled?: boolean;
  context: NodeContext;
  /** Part of the dialect-1 walk: the main document, light DOM, within SNAPSHOT_LIMITS. */
  legacy: boolean;
}

export interface ObservedAlert {
  text: string;
  legacy: boolean;
}

export interface ObservationCoverage {
  nodesWalked: number;
  nodeCap: number;
  /** More elements existed than any walk was allowed to look at. */
  nodesTruncated: boolean;
  /** A walk stopped at its line cap. */
  linesTruncated: boolean;
  /** More visible live regions existed than were kept. */
  alertsTruncated: boolean;
  shadowRootsWalked: number;
  frames: {
    observed: number;
    /** Not rendered (no box): nothing in them is on screen, so not a gap. */
    hidden: number;
    /** Visible, or of unknown visibility, and past MAX_FRAMES: a gap. */
    overCap: number;
    /** Visible and could not be evaluated: a gap. */
    inaccessible: { path: number[]; url: string; reason: string }[];
  };
  /** A collection the page says is larger than what it rendered (aria-rowcount, aria-setsize) or still loading (aria-busy). */
  collections: { partial: boolean; evidence: string[] };
}

export interface PageObservation {
  url: string;
  nodes: ObservedNode[];
  alerts: ObservedAlert[];
  coverage: ObservationCoverage;
}

/** One document's half of an observation, as the page function returns it; frames are the caller's. */
export interface DocumentObservation {
  nodes: ObservedNode[];
  alerts: ObservedAlert[];
  coverage: Omit<ObservationCoverage, 'frames'>;
}

/** The answer to "is this on the page?": `unknown` when the look could not establish absence. */
export type Presence = 'present' | 'absent' | 'unknown';

export interface ObserveDocumentOptions {
  maxAlerts: number;
  maxAlertChars: number;
  maxNodes: number;
  maxLines: number;
  maxExtraNodes: number;
  maxExtraLines: number;
  /** This document is the main one, whose light-DOM walk is dialect 1's. False inside a frame. */
  legacy: boolean;
}

/**
 * Runs in the page (or a frame's document): the roles, names, values and
 * states currently on screen, plus live-region text and how much of the
 * document the walk covered. Deliberately hand-rolled rather than delegated
 * to ariaSnapshot — see daemon/diff.ts captureSignature. Everything it needs
 * is passed in: it is serialised into the page, so nothing at module level is
 * in scope there.
 *
 * ORDER IS WHAT KEEPS DIALECT 1 EXACT. Pass A is the first capture's loop,
 * unchanged — the first `maxNodes` elements of `querySelectorAll('*')`, the
 * line counter, the visibility and role rules, the name and value rules — so
 * the legacy nodes it produces render to the very lines it produced. Pass B
 * (open shadow roots) and the frames the caller adds come after, on their own
 * budgets, and are never legacy.
 */
export function observeDocumentInPage(opts: ObserveDocumentOptions): DocumentObservation {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

  const roleOf = (el: Element): string | null => {
    const explicit = clean(el.getAttribute('role'));
    if (explicit) return explicit.split(' ')[0];
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (tag === 'select') return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'option') return 'option';
    if (tag === 'td' || tag === 'th') return 'cell';
    if (tag === 'tr') return 'row';
    if (tag === 'dialog') return 'dialog';
    if (/^h[1-6]$/.test(tag)) return 'heading';
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

  // The attribute half of a name. `byRoot` resolves aria-labelledby ids in
  // the element's own root (a shadow root has its own id space); the first
  // capture resolved them in the owner document, and dialect 1 still does.
  const ownName = (el: Element, byRoot: boolean): string => {
    const labelledBy = el.getAttribute('aria-labelledby');
    const root = el.getRootNode() as Document | ShadowRoot;
    const lookup = (id: string) =>
      byRoot && typeof root.getElementById === 'function' ? root.getElementById(id) : el.ownerDocument.getElementById(id);
    const fromIds = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => lookup(id)?.textContent ?? '')
          .join(' ')
      : '';
    return clean(
      el.getAttribute('aria-label') ||
        fromIds ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder'),
    );
  };

  // The text of the element's own <label>s — `for` and enclosing alike — with
  // the control's own subtree left out (a select's options are not its name).
  const labelsText = (el: Element): string => {
    const labels = (el as HTMLInputElement).labels;
    if (!labels || !labels.length) return '';
    const parts: string[] = [];
    for (const label of Array.from(labels)) {
      if (!label.contains(el)) {
        parts.push(label.textContent ?? '');
        continue;
      }
      let text = '';
      const walker = label.ownerDocument.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) if (!el.contains(t)) text += t.textContent ?? '';
      parts.push(text);
    }
    return clean(parts.join(' '));
  };

  const namesOf = (el: Element): { name: string; legacyName: string } => {
    const own = ownName(el, false);
    const labelledBy = el.hasAttribute('aria-labelledby');
    const own2 = labelledBy ? ownName(el, true) : own;
    let label: string | undefined;
    let text: string | undefined;
    const enclosing = () => (label ??= clean(el.closest('label')?.textContent));
    // Only a short subtree reads as this element's own name; anything longer is
    // a container's text and would make the line churn on unrelated changes.
    const inner = () => (text ??= clean((el as HTMLElement).innerText));
    const fallback = () => (enclosing() ? enclosing().slice(0, 80) : inner().length <= 80 ? inner() : '');
    const legacyName = own ? own.slice(0, 80) : fallback();
    let name: string;
    if (own2) name = own2.slice(0, 80);
    else {
      const labels = labelsText(el);
      name = labels ? labels.slice(0, 80) : fallback();
    }
    return { name, legacyName };
  };

  const describe = (el: Element, shadow: string[], legacy: boolean): ObservedNode | null => {
    const role = roleOf(el);
    if (!role) return null;
    if (el.getClientRects().length === 0) return null;
    const { name, legacyName } = namesOf(el);
    const node: ObservedNode = { role, name, legacyName, context: { frame: [], shadow }, legacy };
    const input = el as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') {
      node.checked = Boolean(input.checked);
    } else if (typeof input.value === 'string' && input.value) {
      node.value = clean(input.value).slice(0, 80);
    }
    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') node.disabled = true;
    return node;
  };

  const LIVE_REGION = '[role=alert],[role=status]';
  const visibleText = (els: Element[]) =>
    els.map((el) => clean((el as HTMLElement).innerText).slice(0, opts.maxAlertChars)).filter((text) => text.length > 0);

  const coverage: DocumentObservation['coverage'] = {
    nodesWalked: 0,
    nodeCap: opts.maxNodes,
    nodesTruncated: false,
    linesTruncated: false,
    alertsTruncated: false,
    shadowRootsWalked: 0,
    collections: { partial: false, evidence: [] },
  };
  const nodes: ObservedNode[] = [];

  // Pass A: the dialect-1 walk, exactly as the first capture walked.
  const all = Array.from(document.querySelectorAll('*'));
  coverage.nodesTruncated = all.length > opts.maxNodes;
  const walked = all.slice(0, opts.maxNodes);
  let lines = 0;
  for (const el of walked) {
    if (lines >= opts.maxLines) {
      coverage.linesTruncated = true;
      break;
    }
    coverage.nodesWalked++;
    const node = describe(el, [], opts.legacy);
    if (node) {
      nodes.push(node);
      lines++;
    }
  }

  // Pass B: open shadow roots, on their own budget. A CLOSED root reports
  // `shadowRoot === null` and cannot be seen from script at all — it is
  // invisible here, and nothing can count it as a gap.
  let extraNodes = 0;
  let extraLines = 0;
  const shadowAlerts: Element[] = [];
  const hostKey = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`;
  const walkShadow = (host: Element, path: string[]): void => {
    const root = host.shadowRoot;
    if (!root) return;
    coverage.shadowRootsWalked++;
    const inner = [...path, hostKey(host)];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (extraNodes >= opts.maxExtraNodes) {
        coverage.nodesTruncated = true;
        return;
      }
      extraNodes++;
      coverage.nodesWalked++;
      const node = extraLines < opts.maxExtraLines ? describe(el, inner, false) : null;
      if (node) {
        nodes.push(node);
        extraLines++;
      }
      if (extraLines >= opts.maxExtraLines && !node && roleOf(el)) coverage.linesTruncated = true;
      if (el.matches(LIVE_REGION) && el.getClientRects().length > 0) shadowAlerts.push(el);
      if (el.shadowRoot) walkShadow(el, inner);
    }
  };
  for (const el of walked) if (el.shadowRoot) walkShadow(el, []);

  const lightAlerts = Array.from(document.querySelectorAll(LIVE_REGION)).filter((el) => el.getClientRects().length > 0);
  coverage.alertsTruncated = lightAlerts.length > opts.maxAlerts || shadowAlerts.length > opts.maxAlerts;
  const alerts: ObservedAlert[] = [
    ...visibleText(lightAlerts.slice(0, opts.maxAlerts)).map((text) => ({ text, legacy: opts.legacy })),
    ...visibleText(shadowAlerts.slice(0, opts.maxAlerts)).map((text) => ({ text, legacy: false })),
  ];

  // A collection the page itself says is bigger than what it rendered: a
  // virtualised grid (aria-rowcount), a windowed listbox (aria-setsize), or
  // one still loading (aria-busy). What is not rendered cannot be found
  // absent.
  const evidence: string[] = [];
  const nameForEvidence = (el: Element) => clean(el.getAttribute('aria-label')) || ownName(el, true);
  for (const el of Array.from(document.querySelectorAll('[aria-rowcount]'))) {
    if (el.getClientRects().length === 0) continue;
    const total = parseInt(el.getAttribute('aria-rowcount') ?? '', 10);
    if (!Number.isFinite(total)) continue;
    const rendered = el.querySelectorAll('[role=row],tr').length;
    if (total === -1 || total > rendered) {
      evidence.push(`${roleOf(el) ?? el.tagName.toLowerCase()} '${nameForEvidence(el)}' ${rendered}/${total === -1 ? '?' : total}`);
    }
  }
  const sized = new Set<Element>();
  for (const item of Array.from(document.querySelectorAll('[aria-setsize]'))) {
    const parent = item.parentElement;
    if (!parent || sized.has(parent) || item.getClientRects().length === 0) continue;
    sized.add(parent);
    const total = parseInt(item.getAttribute('aria-setsize') ?? '', 10);
    if (!Number.isFinite(total)) continue;
    const rendered = Array.from(parent.children).filter((c) => c.hasAttribute('aria-setsize')).length;
    if (total === -1 || total > rendered) {
      evidence.push(`${roleOf(parent) ?? parent.tagName.toLowerCase()} '${nameForEvidence(parent)}' ${rendered}/${total === -1 ? '?' : total}`);
    }
  }
  for (const el of Array.from(document.querySelectorAll('[aria-busy="true"]'))) {
    const role = roleOf(el) ?? '';
    if (!/^(grid|treegrid|table|list|listbox|tree|feed|rowgroup)$/.test(role) || el.getClientRects().length === 0) continue;
    evidence.push(`${role} '${nameForEvidence(el)}' busy`);
  }
  coverage.collections = { partial: evidence.length > 0, evidence: evidence.slice(0, 5) };

  return { nodes, alerts, coverage };
}

function isDocumentObservation(value: unknown): value is DocumentObservation {
  const v = value as DocumentObservation | null;
  return Boolean(v && Array.isArray(v.nodes) && Array.isArray(v.alerts) && v.coverage && typeof v.coverage === 'object');
}

/** A promise's value, or why it did not produce one within `ms` — never a throw. */
async function within<T>(work: Promise<T>, ms: number): Promise<{ value: T } | { error: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then((value) => ({ value })),
      new Promise<{ error: string }>((resolve) => {
        timer = setTimeout(() => resolve({ error: `did not answer within ${ms}ms` }), Math.max(1, ms));
      }),
    ]);
  } catch (err) {
    return { error: (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Playwright's Frame, named through Page: the artifact imports only `Page`
 * (and `Locator`) from @playwright/test, so this module may not name a third
 * Playwright type.
 */
type PageFrame = ReturnType<Page['mainFrame']>;

/** A frame's child-index path from the main frame. */
function framePath(frame: PageFrame): number[] {
  const path: number[] = [];
  for (let f: PageFrame | null = frame; f; ) {
    const parent: PageFrame | null = f.parentFrame();
    if (!parent) break;
    path.unshift(parent.childFrames().indexOf(f));
    f = parent;
  }
  return path;
}

/**
 * The page's child frames, observed: each rendered frame's document through
 * the same page function (cross-origin frames included — Playwright evaluates
 * out-of-process iframes), under what is left of the capture deadline. A
 * frame with no box is hidden and skipped; a visible frame that cannot be
 * evaluated, or one past MAX_FRAMES, is recorded as a gap.
 */
async function observeFrames(
  page: Page,
  budgetMs: number,
): Promise<{ nodes: ObservedNode[]; alerts: ObservedAlert[]; frames: ObservationCoverage['frames']; documents: DocumentObservation['coverage'][] }> {
  const frames: ObservationCoverage['frames'] = { observed: 0, hidden: 0, overCap: 0, inaccessible: [] };
  const out = { nodes: [] as ObservedNode[], alerts: [] as ObservedAlert[], frames, documents: [] as DocumentObservation['coverage'][] };
  // A stand-in page (a unit test's) has no frame tree; a real page always does.
  if (typeof (page as Partial<Page>).frames !== 'function' || typeof (page as Partial<Page>).mainFrame !== 'function') return out;
  let children: PageFrame[];
  try {
    const main = page.mainFrame();
    children = page.frames().filter((f) => f !== main && !f.isDetached());
  } catch (err) {
    frames.inaccessible.push({ path: [], url: '', reason: `the frame tree could not be listed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}` });
    return out;
  }
  if (!children.length) return out;
  const deadline = Date.now() + budgetMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  const url = (f: PageFrame) => {
    try {
      return f.url();
    } catch {
      return '';
    }
  };

  // Which are rendered. Checked for a bounded number of frames: a page with
  // dozens of iframes past that is not claimed to be covered.
  const checked = children.slice(0, MAX_FRAMES * 3);
  frames.overCap += children.length - checked.length;
  const visibility = await Promise.all(
    checked.map(async (frame) => {
      const seen = await within(
        (async () => {
          const handle = await frame.frameElement();
          try {
            const box = await handle.boundingBox();
            return Boolean(box && box.width > 0 && box.height > 0);
          } finally {
            await handle.dispose().catch(() => {});
          }
        })(),
        remaining(),
      );
      return { frame, seen };
    }),
  );
  const visible: PageFrame[] = [];
  for (const { frame, seen } of visibility) {
    if ('error' in seen) {
      if (frame.isDetached()) continue; // gone, not hidden from us
      frames.inaccessible.push({ path: framePath(frame), url: url(frame), reason: `its visibility could not be read (${seen.error})` });
    } else if (!seen.value) frames.hidden++;
    else if (visible.length >= MAX_FRAMES) frames.overCap++;
    else visible.push(frame);
  }

  const looks = await Promise.all(
    visible.map(async (frame) => ({
      frame,
      look: await within(frame.evaluate(observeDocumentInPage, { ...SNAPSHOT_LIMITS, ...SHADOW_LIMITS, legacy: false }), remaining()),
    })),
  );
  for (const { frame, look } of looks) {
    if ('error' in look || !isDocumentObservation(look.value)) {
      if (frame.isDetached()) continue;
      frames.inaccessible.push({ path: framePath(frame), url: url(frame), reason: 'error' in look ? look.error : 'it answered with something other than an observation' });
      continue;
    }
    const path = framePath(frame);
    frames.observed++;
    for (const node of look.value.nodes) out.nodes.push({ ...node, legacy: false, context: { ...node.context, frame: path } });
    for (const alert of look.value.alerts) out.alerts.push({ text: alert.text, legacy: false });
    out.documents.push(look.value.coverage);
  }
  return out;
}

/**
 * One structured look at the live page — the main document, its open shadow
 * roots and its rendered frames — or null when the main document cannot be
 * read (navigating, closed, a renderer that does not answer within
 * CAPTURE_TIMEOUT_MS). Null is "unavailable", never "empty". A frame that
 * cannot be read does not null the observation: it is recorded in the
 * coverage, which is what stops the observation proving an absence.
 */
export async function observePage(page: Page): Promise<PageObservation | null> {
  const started = Date.now();
  const main = await within(page.evaluate(observeDocumentInPage, { ...SNAPSHOT_LIMITS, ...SHADOW_LIMITS, legacy: true }), CAPTURE_TIMEOUT_MS);
  // A page that answered with something other than a capture (a frame torn
  // down mid-evaluate) is as unreadable as one that did not answer.
  if ('error' in main || !isDocumentObservation(main.value)) return null;
  const doc = main.value;
  const framed = await observeFrames(page, Math.max(FRAME_MIN_BUDGET_MS, CAPTURE_TIMEOUT_MS - (Date.now() - started)));
  const coverage: ObservationCoverage = { ...doc.coverage, collections: { ...doc.coverage.collections, evidence: [...doc.coverage.collections.evidence] }, frames: framed.frames };
  for (const c of framed.documents) {
    coverage.nodesWalked += c.nodesWalked;
    coverage.shadowRootsWalked += c.shadowRootsWalked;
    coverage.nodesTruncated ||= c.nodesTruncated;
    coverage.linesTruncated ||= c.linesTruncated;
    coverage.alertsTruncated ||= c.alertsTruncated;
    coverage.collections.partial ||= c.collections.partial;
    coverage.collections.evidence.push(...c.collections.evidence);
  }
  coverage.collections.evidence = coverage.collections.evidence.slice(0, 5);
  let url = '';
  try {
    url = page.url();
  } catch {
    // a stand-in page with no url; the observation is still one
  }
  return { url, nodes: [...doc.nodes, ...framed.nodes], alerts: [...doc.alerts, ...framed.alerts], coverage };
}

const INTERACTIVE_ROLES =
  /\b(button|link|textbox|searchbox|combobox|checkbox|radio|switch|slider|spinbutton|menu|menubar|menuitem|option|tab|listbox|grid|row|cell|dialog|alertdialog|heading|alert|status)\b/;

/**
 * The per-line heuristic behind the daemon's filterInteractive; shared with
 * signature capture, so the lines a step is judged against are the same lines
 * the recording kept. Matches any ref, in-frame ones included — testing for
 * "[@e" silently dropped every line inside an iframe, so an embedded editor or
 * payment form was invisible in the snapshot the agent works from.
 */
export function isInteractiveLine(line: string): boolean {
  return line.includes('[@') || INTERACTIVE_ROLES.test(line);
}

/**
 * An observation as snapshot lines, interactive lines only.
 *
 * Dialect 1 is the first capture's exact text: legacy nodes only (main
 * document, light DOM), the legacy name, ` [checked]` for a checked
 * checkbox/radio or `: value` otherwise. Dialect 2 is every node — shadow and
 * frame content included — with the dialect-2 name, ` [checked]`,
 * ` [disabled]`, then `: value`. Where an element sits (its frame, its shadow
 * host) is never part of the line text: a line says what is shown, and the
 * same control in an iframe reads as it does in the page.
 */
export function renderLines(o: PageObservation, d: LineDialect): string[] {
  const out: string[] = [];
  for (const n of o.nodes) {
    if (d === 1) {
      if (!n.legacy) continue;
      let line = `- ${n.role} ${JSON.stringify(n.legacyName)}`;
      if (n.checked !== undefined) line += n.checked ? ' [checked]' : '';
      else if (n.value !== undefined) line += `: ${n.value}`;
      out.push(line);
      continue;
    }
    let line = `- ${n.role} ${JSON.stringify(n.name)}`;
    if (n.checked) line += ' [checked]';
    if (n.disabled) line += ' [disabled]';
    if (n.checked === undefined && n.value !== undefined) line += `: ${n.value}`;
    out.push(line);
  }
  return out.filter(isInteractiveLine);
}

/** The observation's live-region texts in a dialect: dialect 1 keeps the main document's light DOM only. */
export function renderAlerts(o: PageObservation, d: LineDialect): string[] {
  return o.alerts.filter((a) => d === 2 || a.legacy).map((a) => a.text);
}

/**
 * Whether the observation covered enough of the page for a missing LINE to
 * mean absent: every element walked, no line cap reached, every rendered
 * frame read and none past the cap, and no collection the page says is only
 * partly rendered. A hidden frame is not a gap — nothing in it is on screen.
 */
export function coverageComplete(c: ObservationCoverage): boolean {
  return !c.nodesTruncated && !c.linesTruncated && c.frames.inaccessible.length === 0 && c.frames.overCap === 0 && !c.collections.partial;
}

/** The same question for live regions: every visible alert kept, and every rendered frame read. */
export function alertsComplete(c: ObservationCoverage): boolean {
  return !c.alertsTruncated && c.frames.inaccessible.length === 0 && c.frames.overCap === 0;
}

/** Why an observation is not complete, in a few words for a verdict message; '' when it is. */
export function describeCoverage(c: ObservationCoverage): string {
  const parts: string[] = [];
  if (c.nodesTruncated) parts.push(`the element cap was reached (${c.nodesWalked} walked)`);
  if (c.linesTruncated) parts.push('the line cap was reached');
  if (c.frames.inaccessible.length) {
    parts.push(`${c.frames.inaccessible.length} visible frame(s) could not be read (${c.frames.inaccessible.map((f) => f.reason).slice(0, 2).join('; ')})`);
  }
  if (c.frames.overCap) parts.push(`${c.frames.overCap} frame(s) past the frame cap`);
  if (c.collections.partial) parts.push(`a collection is only partly rendered (${c.collections.evidence.join(', ')})`);
  if (c.alertsTruncated) parts.push('the alert cap was reached');
  return parts.join('; ');
}

/**
 * One look at the live page in a dialect — its lines, its live-region
 * alerts, and the coverage behind them — or null when the page cannot be
 * read. Null is "unavailable", never "empty": a caller deciding whether an
 * effect landed, or whether an alert was raised, must not read a failed look
 * as a clean one. The single capture `capturePageLines`, `captureLines` and
 * the alert observation (observe.ts liveAlerts) are views of, so the walk,
 * the caps and the timeout exist once.
 */
export async function capturePage(page: Page, d: LineDialect = 1): Promise<{ lines: string[]; alerts: string[]; coverage: ObservationCoverage } | null> {
  const o = await observePage(page);
  return o ? { lines: renderLines(o, d), alerts: renderAlerts(o, d), coverage: o.coverage } : null;
}

/**
 * The lines the page shows right now, in a dialect (dialect 1 unless asked),
 * or null when the page cannot be read (see capturePage).
 */
export async function capturePageLines(page: Page, d: LineDialect = 1): Promise<string[] | null> {
  const captured = await capturePage(page, d);
  return captured ? captured.lines : null;
}

/** The lines, and whether the look covered enough of the page for a missing line to mean absent. */
export async function captureLines(page: Page, d: LineDialect): Promise<{ lines: string[]; complete: boolean; coverage: ObservationCoverage } | null> {
  const captured = await capturePage(page, d);
  return captured ? { lines: captured.lines, complete: coverageComplete(captured.coverage), coverage: captured.coverage } : null;
}

/** How many added lines a step diff keeps — the recorder's own cap, so a replay diff and an artifact diff carry the same evidence. */
export const MAX_ADDED_LINES = 20;

/**
 * The lines a step ADDED, as the recorder diffs its before/after signatures:
 * every after-line not present before, capped. Null when either capture
 * failed — a diff needs both legs, and a missing leg is not an empty change.
 */
export function addedLines(before: string[] | null, after: string[] | null): string[] | null {
  if (before === null || after === null) return null;
  return after.filter((l) => !before.includes(l)).slice(0, MAX_ADDED_LINES);
}

/** The mirror of addedLines: what was on the page before the action and is gone after it. */
export function removedLines(before: string[] | null, after: string[] | null): string[] | null {
  if (before === null || after === null) return null;
  return before.filter((l) => !after.includes(l)).slice(0, MAX_ADDED_LINES);
}

export interface LineShowsOptions {
  /**
   * Identity matching: the want must sit at a letter/digit boundary on both
   * sides (see IDENTITY_EDGE) instead of anywhere inside a longer run of
   * characters. Only for "is this the right RECORD" — the effect gate asks
   * whether a change LANDED, which is a substring question and stays one.
   */
  whole?: boolean;
}

const normWs = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Does any of `wants` appear in `haystack` (recorded page lines, or a diff's
 * added lines)? Whitespace-insensitive on both sides — a marker copied with
 * a trailing space is the same word — and a `{{*}}` wildcard (see
 * maskVolatile) matches anything within one line.
 *
 * `opts.whole` switches to the IDENTITY rule: same wildcards, but bounded at
 * both edges so `fwgr25-n1` is no longer satisfied by `fwgr25-n10`. Only the
 * identity callers pass it; the effect gate asks a different question.
 */
export function lineShows(haystack: string[], wants: string[], opts: LineShowsOptions = {}): boolean {
  const all = haystack.map(normWs).join('\n');
  return wants.some((raw) => {
    const want = normWs(raw);
    if (!want) return false;
    if (opts.whole) return identityRe(want).test(all);
    if (!want.includes(WILDCARD)) return all.includes(want);
    const re = new RegExp(want.split(WILDCARD).map(escapeRe).join('[^\\n]*?'));
    return re.test(all);
  });
}

/**
 * Is any of `lines` on the live page, in dialect `d`? 'present' needs only a
 * match. 'absent' needs a look that covered the page (coverageComplete);
 * a look that did not, or a page that could not be read at all, is
 * 'unknown' — a missing line there is not evidence of anything.
 */
export async function presence(page: Page, lines: string[], d: LineDialect, opts: LineShowsOptions = {}): Promise<Presence> {
  return (await lookFor(page, lines, d, opts)).presence;
}

/** presence, with why an 'unknown' is unknown. */
async function lookFor(page: Page, lines: string[], d: LineDialect, opts: LineShowsOptions): Promise<{ presence: Presence; why?: string }> {
  const live = await captureLines(page, d);
  if (!live) return { presence: 'unknown', why: 'the page could not be read' };
  if (lineShows(live.lines, lines, opts)) return { presence: 'present' };
  return live.complete ? { presence: 'absent' } : { presence: 'unknown', why: describeCoverage(live.coverage) };
}

/**
 * presence, asked once more after sweeping the page when the first answer is
 * 'unknown' — a lazily rendered page paints what it has once scrolled end to
 * end (sweepPage). Still 'unknown' after that is the answer; `why` says what
 * the look could not cover.
 */
export async function confirmPresence(page: Page, lines: string[], d: LineDialect, opts: LineShowsOptions = {}): Promise<{ presence: Presence; why?: string }> {
  const first = await lookFor(page, lines, d, opts);
  if (first.presence !== 'unknown' || !(await sweepPage(page))) return first;
  return lookFor(page, lines, d, opts);
}

/**
 * A parameterised line that did not *appear* may still be *there*: filling a
 * field with the value it already held produces no diff. One fresh look at the
 * live page settles it; only a match is a yes — a page that cannot be read,
 * or a look that could not cover it, shows nothing. Dialect 1 unless asked.
 */
export async function presentOnPage(page: Page, lines: string[], opts: LineShowsOptions = {}, d: LineDialect = 1): Promise<boolean> {
  return (await presence(page, lines, d, opts)) === 'present';
}

/**
 * Runs in the page: do the identity and the goal hold of the SAME record?
 *
 * The record's container is the OUTERMOST ancestor of the goal text that is
 * one of several siblings of its kind — the row among rows, the card among
 * cards. Outermost, not nearest: a cell is one of several cells too, and
 * stopping there would ask whether the identity is inside the status cell,
 * which it never is. The row above it is the scope the page itself asserts is
 * one record, and it is what a `scoped` locator names. If the goal text has
 * no repeated ancestor at all the page is not listing records, and page-wide
 * agreement is the right answer there (a detail page's heading and its status
 * field share no small container).
 *
 * `identity` arrives as regex SOURCE (identitySource), already bounded: this
 * function is serialised into the page, so it cannot call identityRe, and a
 * second hand-written copy of the boundary rule here would be free to drift.
 */
export function scopeCheckInPage(opts: { identity: string[]; goal: string[] }): boolean {
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const textOf = (el: Element) => norm((el as HTMLElement).innerText || el.textContent);
  const all = Array.from(document.querySelectorAll('*'));

  // The smallest elements that show a goal string: a container shows it too,
  // and starting from the container would skip the record scope below it.
  const holders: Element[] = [];
  for (const raw of opts.goal) {
    const want = norm(raw);
    if (!want) continue;
    const hits = all.filter((el) => textOf(el).includes(want));
    for (const el of hits) if (!hits.some((other) => other !== el && el.contains(other))) holders.push(el);
  }
  if (!holders.length) return false;

  // Siblings of a kind means STRUCTURALLY alike, not merely same-tag: two
  // unrelated buttons that happen to sit side by side are not a record list,
  // and treating them as one would scope a lone control to itself. Rows of a
  // list are rendered by one template and carry the same classes.
  const kindOf = (el: Element) => `${el.tagName}.${norm(el.getAttribute('class'))}`;
  const oneOfSeveral = (el: Element): boolean => {
    const parent = el.parentElement;
    // A direct child of <body> is a section of the page, not a record: a list
    // of records sits inside something. Without this, two unrelated top-level
    // controls make either of them its own "record" scope.
    if (!parent || parent === document.body) return false;
    const kind = kindOf(el);
    let same = 0;
    for (const sib of Array.from(parent.children)) if (kindOf(sib) === kind) same++;
    return same >= 2;
  };

  for (const holder of holders) {
    let node: Element | null = holder;
    let record: Element | null = null;
    while (node && node !== document.body) {
      if (oneOfSeveral(node)) record = node;
      node = node.parentElement;
    }
    if (!record) return true; // not a list: the whole page is about one record
    const inside = textOf(record);
    if (opts.identity.some((src) => new RegExp(src, 'iu').test(inside))) return true;
  }
  return false;
}

/**
 * Scroll the page end to end so a virtualised or lazily rendered UI paints
 * everything it has, then let the DOM settle. Returns false when the page
 * cannot be scripted (gone, cross-origin frame), in which case the caller
 * simply does not retry.
 */
export async function sweepPage(page: Page): Promise<boolean> {
  try {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await settleDom(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settleDom(page);
    return true;
  } catch {
    return false;
  }
}

/**
 * Does the live page show a flow reference's RECORDED value, so that value may
 * stand in for one this run did not publish? Asked by both runners at the
 * moment a step's references are resolved, before the step runs (the daemon's
 * runFlow; the artifact's `needShown`). fwrd54: 06-change replays at tier A
 * without re-reading `mark_ready_button` ("Mark Ready"), and 07-edit — whose
 * pinned procedure clicks that button — fell to model recovery on n2 and n3
 * although the button was on the page it started from.
 *
 * Only a whole-token match (identityRe's bounded rule, via lineShows) on the
 * observation — visible text and accessible names alike — counts. A value
 * holding one of this run's own values (a var: `fwrd54-n2 RD Part A`) is
 * refused before looking: it names this run's record, and a page showing the
 * RECORDING's version of it would be the wrong record. The caller refuses what
 * it knows beyond that (id shapes, recorded vars, ledger evidence).
 */
export async function recordedValueShown(page: Page, value: string, runValues: readonly string[]): Promise<boolean> {
  const want = value.replace(/\s+/g, ' ').trim();
  if (!want || want.includes('{{')) return false;
  const lower = want.toLowerCase();
  for (const raw of runValues) {
    const run = String(raw ?? '').trim().toLowerCase();
    if (run.length >= 2 && lower.includes(run)) return false;
  }
  try {
    return await presentOnPage(page, [want], { whole: true });
  } catch {
    return false;
  }
}
