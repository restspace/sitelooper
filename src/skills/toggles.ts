import type { LocatorCandidate, RecordedStep } from '../daemon/recorder.js';
import { framesEqual } from '../execution/context.js';

/**
 * DISCLOSURE TOGGLE PAIRS, found in a recording before it compiles.
 *
 * fwsi1 05-change clicked "Show/Hide More Information" twice: the first click
 * recorded `added: []` — the panel was already open (an earlier instruction
 * had opened it), so its whole effect was to HIDE it — and the second showed
 * it again, recording the panel's links. Every replay starts with the panel
 * shut: the first click opened it, the second shut it, and the step stopped on
 * "none of the 2 recorded page change(s) appeared" (21 recovery turns).
 *
 * Both clicks are the recording getting to one state: the panel shown. So the
 * pair compiles to ONE click — the second, which carries what the panel shows
 * — flagged `toggle` (SkillStep.toggle): both runners skip it as already in
 * effect when everything it is recorded adding is already showing, and click
 * it when not.
 *
 * A pair is, conservatively:
 *  - two clicks on the same control: their target chains share a candidate
 *    that names it (not a point, not a position — `nth`, `:nth-of-type`), in
 *    the same frame, neither with a page effect, a navigation or an alert;
 *  - the first added nothing, and what it took off the page is what the
 *    second put back — at least half of the lines one of them could share (a
 *    recording made before the recorder kept add-less removals has no
 *    `removed` at all, and the first click adding nothing on the same control
 *    is then the whole evidence); a first click whose removal is known to be
 *    EMPTY did nothing visible and is not a toggle (a counter's "+" is two
 *    clicks);
 *  - nothing between them that could change the page (only observations:
 *    reads, evals, screenshots, waits, hovers, scrolls), all on one url.
 *
 * Returns the steps with each pair's first click dropped, and marks the
 * second `toggle: true` IN PLACE — identity is preserved, because compile
 * matches kept steps against the recording by object identity; the mark is a
 * pure function of the recording, so marking again is a no-op.
 */
export function collapseTogglePairs(steps: readonly RecordedStep[]): RecordedStep[] {
  const dropped = new Set<number>();
  for (let i = 0; i < steps.length; i++) {
    const first = steps[i];
    if (dropped.has(i) || !hidesOnly(first)) continue;
    for (let k = i + 1; k < steps.length; k++) {
      const next = steps[k];
      if (next.tool === 'click' && sameControl(first, next)) {
        if (showsWhatWasHidden(first, next)) {
          dropped.add(i);
          next.toggle = true;
        }
        break;
      }
      if (!OBSERVATIONS.has(next.tool) || (next.diff?.url !== undefined && next.diff.url !== first.diff!.url)) break;
    }
  }
  return dropped.size ? steps.filter((_, i) => !dropped.has(i)) : [...steps];
}

/** Steps that change nothing a replay depends on: between the two clicks of a pair, only these. */
const OBSERVATIONS = new Set(['read', 'read_all', 'eval', 'screenshot', 'wait_for', 'hover', 'scroll_into_view']);

/** A click whose only recorded effect is a disappearance (or, from an older recorder, nothing recorded). */
function hidesOnly(step: RecordedStep): boolean {
  const d = step.diff;
  if (step.tool !== 'click' || !d || d.added.length || d.alerts.length) return false;
  if (step.effect || step.fingerprintAfter) return false;
  return d.removed === undefined || d.removed.length > 0;
}

function showsWhatWasHidden(first: RecordedStep, second: RecordedStep): boolean {
  const a = first.diff!;
  const b = second.diff;
  if (!b || !b.added.length || b.alerts.length || second.effect || second.fingerprintAfter) return false;
  // The same PAGE, not the same url: a disclosure may write its view state
  // into the query. grafana fwgr69-n1's heading "Panel options" collapsed on
  // `…&editPanel=1` and re-expanded onto `…&editPanel=1&showCategory=Panel%20
  // options`; compared whole, the pair broke and compile dropped the collapse
  // alone (compile.ts abandonedRepeatClick). The query is dropped, as the
  // segment splitter drops it (urlPattern with `query: false`) — but only
  // when the first click's own removals are recorded, so the lines-shared
  // test below is the evidence. A recording from before add-less removals
  // were kept has only "the first added nothing" to go on, and there a query
  // change is the one thing that says the second click DID something:
  // fwgr18-25 opened the auto-refresh picker (added [], no removals kept) and
  // chose "1 minute" (`&refresh=1m`), and those two clicks are no toggle.
  if (b.url !== a.url && (!a.removed?.length || withoutQuery(b.url) !== withoutQuery(a.url))) return false;
  if (!framesEqual(first.locators.target?.frame, second.locators.target?.frame)) return false;
  if (a.removed === undefined) return true;
  const hidden = new Set(a.removed.map(norm));
  const shared = b.added.filter((l) => hidden.has(norm(l))).length;
  return shared > 0 && shared * 2 >= Math.min(a.removed.length, b.added.length);
}

const norm = (line: string) => line.trim();

/** A url with its query removed (origin, path and hash kept), or the url itself when it does not parse. */
function withoutQuery(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** Whether two clicks name the same control: one identifying (non-positional) candidate in common. */
export function sameControl(a: RecordedStep, b: RecordedStep): boolean {
  const names = (s: RecordedStep) => new Set((s.locators.target?.chain ?? []).filter(identifying).map(canonical));
  const left = names(a);
  return [...names(b)].some((n) => left.has(n));
}

function identifying(c: LocatorCandidate): boolean {
  if (c.kind === 'point') return false;
  if ('nth' in c && (c as { nth?: unknown }).nth !== undefined) return false;
  if ((c.kind === 'css' || c.kind === 'id') && /:nth-|>>\s*nth=/.test(c.selector)) return false;
  if (c.kind === 'role' && !c.name) return false;
  return true;
}

function canonical(c: LocatorCandidate): string {
  const o = c as unknown as Record<string, unknown>;
  // An id candidate and the css candidate carrying the same `#id` name one element.
  if ((c.kind === 'id' || c.kind === 'css') && /^#[\w-]+$/.test(c.selector)) return `sel:${c.selector}`;
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
}


/**
 * A SET THE RECORDING DID AGAIN, found before it compiles.
 *
 * fwvk4 n1 02-create clicked the task's description editor and typed the
 * description (recording `- heading "Description Saved!"`), reloaded the
 * task, read the editor back EMPTY — the first attempt had not persisted —
 * and did it again: click the editor, type the same text, click Save. Compile
 * kept both attempts, so s_76c6ba opened on the abandoned click+type, whose
 * recorded autosave the replayed type never raised; the step's own
 * expectation stopped it on both replays and the compiled script failed.
 *
 * The recording's own evidence says the first attempt is not part of the
 * procedure: it RELOADED the same url, looked, and set the same value on the
 * same target again. The later set supersedes the earlier one, so the earlier
 * set, the focus clicks that led into it and the reload between are dropped;
 * the second attempt compiles whole.
 *
 * Conservative, as a supersession is, pair by pair:
 *  - the earlier and later step are both sets (`fill` or `type`) of the same
 *    value (trimmed), on the same url and in the same frame;
 *  - they name the same target: an identifying candidate in common
 *    (toggles.ts sameControl), or — across a reload, where the recorder may
 *    describe one editor through a different element — recorded points on the
 *    same viewport whose centres each lie inside the other's box;
 *  - between them the page was RELOADED (a goto to that url) and nothing else
 *    happened but observations and focus clicks (a click that recorded no
 *    change and no effect). Anything that acts — a Save, another field's fill
 *    — ends the search, so a password and its confirmation (two targets, no
 *    reload) and a form's several fields are never pairs.
 *
 * And the plain REFILL, with no reload: two `fill`s of the same target on the
 * same url, only observations and focus clicks between, whatever the values —
 * the later fill replaces the field, so the earlier one is dropped alone
 * (gitea fwgt6, below).
 *
 * Returns the kept steps in order, the same objects (compile matches kept
 * steps against the recording by identity).
 */
export function dropSupersededSets(steps: readonly RecordedStep[]): RecordedStep[] {
  const dropped = new Set<number>();
  for (let i = 0; i < steps.length; i++) {
    const first = steps[i];
    const value = setValue(first);
    if (value === null || dropped.has(i)) continue;
    const url = first.diff?.url;
    if (!url) continue;
    let reload = false;
    const between: number[] = [];
    for (let k = i + 1; k < steps.length; k++) {
      const next = steps[k];
      if (setValue(next) !== null) {
        // A REFILL: `fill` replaces the field's value, so a later fill of the
        // same field, with nothing between that recorded a consequence, leaves
        // the earlier one nothing to do — whatever the two values (gitea
        // fwgt6-n1 01-signin filled #password 'admin', clicked Sign In, which
        // did nothing, and filled it again with {{env:APP_PASSWORD}};
        // s_9c4b07 kept both fills once the dead click was dropped). Only
        // fill after fill: `type` appends, so two types are both needed.
        //
        // The SAME FIELD is `samePrimaryControl`, not sameTarget: with no
        // reload between, two fields of one form are adjacent in the
        // recording, and every field of a dialog shares the recorder's
        // ambient fallbacks — repairdesk fwrd84-n1 gave Cost and Markup the
        // same `[data-testid="form-dialog"] input` candidate, so sameControl
        // found one in common and this rule dropped the fill that carried the
        // whole point of the step (05-edit saved an unchanged form and still
        // reported tier A; 02-create lost its Title and hit "Title is
        // required"). The reload arm above is not exposed to it: it also
        // demands the same VALUE and a reload between.
        //
        // And only a fill that did NOTHING but set its field: its own recorded
        // diff holds its value line and no other change. odoo fwod81-n1
        // 03-add filled "2" into the product combobox by mistake — its diff
        // opened the autocomplete menu and its options — then filled
        // "Cabinet" into the same field; dropping the "2" left a replay that
        // could not reproduce the page the recording reached (quietFill).
        if (!reload && first.tool === 'fill' && next.tool === 'fill' && next.diff?.url === url && samePrimaryControl(first, next) && quietFill(first)) {
          dropped.add(i);
          break;
        }
        if (reload && setValue(next) === value && next.diff?.url === url && sameTarget(first, next)) {
          dropped.add(i);
          // the focus clicks that led into the abandoned set
          for (let j = i - 1; j >= 0 && focusClick(steps[j]) && sameTarget(steps[j], first); j--) dropped.add(j);
          for (const b of between) dropped.add(b);
        }
        break;
      }
      if (next.tool === 'goto' && sameUrl(next, url)) {
        reload = true;
        between.push(k);
        continue;
      }
      if (OBSERVATIONS.has(next.tool) || focusClick(next)) continue;
      break;
    }
  }
  return dropped.size ? steps.filter((_, i) => !dropped.has(i)) : [...steps];
}

/**
 * A fill whose own recorded diff shows nothing beyond its field's value line:
 * no line removed, no alert, and at most one added line, which carries the
 * value this fill typed (`- textbox "Password": admin`). A menu, a listbox,
 * an option, a "Loading…" row, a recomputed total — anything else the fill
 * changed — is a consequence a later refill of the field does not undo
 * (fwod81). A fill recorded with no diff at all shows nothing and is judged
 * quiet, as the refill rule always judged it.
 */
function quietFill(step: RecordedStep): boolean {
  const d = step.diff;
  if (!d) return true;
  if (d.alerts.length || (d.removed?.length ?? 0) > 0 || d.added.length > 1) return false;
  if (!d.added.length) return true;
  const value = typeof step.args.value === 'string' ? step.args.value.trim() : '';
  const m = /^-\s*\w+(?:\s+"(?:[^"\\]|\\.)*")?(?:\s+\[[^\]]*\])*:\s*(.*)$/.exec(d.added[0].trim());
  return Boolean(m && value && m[1].trim() === value);
}

/** The value a `fill` or `type` sets, trimmed; null for any other step or an empty value. */
function setValue(step: RecordedStep): string | null {
  const raw = step.tool === 'fill' ? step.args.value : step.tool === 'type' ? step.args.text : undefined;
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v ? v : null;
}

/** A click that recorded no change at all: it put the caret somewhere. */
function focusClick(step: RecordedStep): boolean {
  const d = step.diff;
  if (step.tool !== 'click' || !d || step.effect || step.fingerprintAfter) return false;
  return !d.added.length && !d.alerts.length && (d.removed?.length ?? 0) === 0;
}

/** A goto that loaded `url` again: its argument, or where it landed. */
function sameUrl(step: RecordedStep, url: string): boolean {
  return step.args.url === url || step.diff?.url === url;
}

/**
 * The two steps' BEST identification of their element — the first identifying
 * candidate the recorder wrote down — is the same. Narrower than sameTarget
 * on purpose: the tail of a chain holds ambient fallbacks that match every
 * control of a form (fwrd84's `[data-testid="form-dialog"] input`), and a
 * rule with nothing else to lean on must not take those for identity.
 */
function samePrimaryControl(a: RecordedStep, b: RecordedStep): boolean {
  if (!framesEqual(a.locators.target?.frame, b.locators.target?.frame)) return false;
  const primary = (s: RecordedStep) => (s.locators.target?.chain ?? []).find(identifying);
  const left = primary(a);
  const right = primary(b);
  return Boolean(left && right && canonical(left) === canonical(right));
}

function sameTarget(a: RecordedStep, b: RecordedStep): boolean {
  if (!framesEqual(a.locators.target?.frame, b.locators.target?.frame)) return false;
  return sameControl(a, b) || samePlace(pointOf(a), pointOf(b));
}

type Point = Extract<LocatorCandidate, { kind: 'point' }>;

function pointOf(step: RecordedStep): Point | null {
  return ((step.locators.target?.chain ?? []).find((c) => c.kind === 'point') as Point | undefined) ?? null;
}

/** Two recorded boxes on the same viewport, each containing the other's centre. */
function samePlace(a: Point | null, b: Point | null): boolean {
  if (!a || !b || a.vw !== b.vw || a.vh !== b.vh) return false;
  const inside = (p: Point, q: Point) => Math.abs(p.x - q.x) * 2 <= q.w && Math.abs(p.y - q.y) * 2 <= q.h;
  return inside(a, b) && inside(b, a);
}
