/**
 * The ECHO rule both execution targets share: a read-back that returns only
 * what the procedure itself typed, selected or named confirms the control's
 * display, not that the app persisted anything. grafana's time picker read
 * back "Last 6 hours" after the replay had clicked the option of that name.
 *
 * The daemon (src/skills/replay.ts) keeps one ledger per flow step's chain —
 * the flow runner passes it through every segment (round 61; a lone replay
 * keeps its own) — and reports an echoed label in `ReplayResult.echoedValues`,
 * which the flow runner drops from its confident values. A compiled `.flow.ts`
 * embeds this exact source (spec/runtime-source.ts), keeps one ledger per flow
 * step across its segments, and lists the label in `run.echoed`. Both ask
 * judgeEcho: the element first, then the text (ELEMENT BEFORE TEXT, below). Neither runner withholds the value from a later
 * step: an echo is a report-confidence finding, not a gate.
 *
 * TEXT ALONE IS NOT PROVENANCE (round 59). The ledger holds text, and text
 * alone called EspoCRM fwec11 01-signin's "Admin" — the user menu's display
 * name for the signed-in user — an echo of the "admin" typed into the
 * Username field (echoKey folds case), in both runners, on both replays; the
 * form had been submitted and was gone. So a read whose text matches the
 * ledger is OBSERVED only when both hold, for every set the text came from
 * (echoAt):
 *  (a) its element is not the control that set was made on, nor part of that
 *      control's widget — judged by the control's LOCATOR as well as its node
 *      (a re-render replaces the input; the same field is still the field),
 *      an option by the combobox or opener that owns it, and a widget as the
 *      nearest field wrapper (a display span beside a combobox input, a chip);
 *  (b) something COMMITTED the value between the set and the read: a
 *      navigation or reload, a route change (routeOf: a rewritten query string
 *      is not one), the control detaching with nothing matching its locator
 *      in its place, or a later click whose effect, as THIS run's diff added
 *      it, shows the value appearing (a Save that adds the row). Phase B
 *      (provenance, stage 1): the recorded effect alone used to count, so a
 *      Save that did nothing still "committed" a live preview's text.
 * Anything else stays an echo, as before: grafana's picker opener after
 * "Last 6 hours", ghost fwgh13's Excerpt textbox, a live preview mirroring a
 * field that was never saved.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */
import type { Locator, Page } from 'playwright-core';

/** A read's resolved element (Locator.elementHandle), named without importing another Playwright type into the artifact. */
type ReadElement = NonNullable<Awaited<ReturnType<Locator['elementHandle']>>>;
import { clip } from './text.js';

/**
 * Shortest value the TEXT rule treats as an echo. Below this the coincidence
 * rate is too high (a "1m" refresh, a "3" quantity) — a false echo would
 * wrongly drop a legitimate finding — so a shorter value is an echo only on
 * ELEMENT evidence: the read is the very control that set it, or its widget.
 * Until phase B (provenance, stage 1) a short value was never an echo at all,
 * so "150" read back from the input it was typed into was reported as observed.
 */
export const MIN_ECHO_LEN = 5;

/**
 * Tools that observe or position and SET nothing, so what they name is never
 * an interaction. A scroll to the heading "Latency by endpoint" set nothing,
 * but its target's name used to land in the ledger and the later read of that
 * heading was discounted as an echo — fwgr23 published two of three panel
 * titles on every replay and objective 1 failed each time.
 */
const OBSERVATION_TOOLS = new Set(['scroll_into_view', 'wait_for', 'hover', 'screenshot']);

/** Whether a step of this tool puts something on the page the ledger should remember. */
export function setsSomething(tool: string): boolean {
  return tool !== 'read' && tool !== 'read_all' && !OBSERVATION_TOOLS.has(tool);
}

/** Loosely keyed, so "Last 6 hours" matches "last 6 hours" and "Last 6 hours." */
export function echoKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Remember what a step put on the page: its filled `value`/typed `text`, and
 * the accessible name (else label) of every candidate of a target it resolved
 * — the name of a clicked option ("Last 6 hours") is the value it selects.
 * Callers pass only steps for which `setsSomething(tool)` holds, and the
 * candidates only once the chain RESOLVED, as replay does.
 */
export function noteInteraction(ledger: Set<string>, texts: readonly unknown[]): void {
  for (const text of texts) {
    // Every length: a short value is judged by its element (echoAt), not dropped here.
    const key = typeof text === 'string' ? echoKey(text) : '';
    if (key) ledger.add(key);
  }
}

/** Whether `value` is short enough that only element evidence makes it an echo (see MIN_ECHO_LEN). */
function shortEcho(value: string): boolean {
  return value.trim().length < MIN_ECHO_LEN;
}

/**
 * Where a url points, for the commit rule (echoAt's rule b): origin, path and
 * the hash's path — never the query string. A debounced search box rewrites
 * `?q=` as it is typed into; nothing was saved, and the value it mirrors is
 * still an echo (phase B provenance, stage 1). A route change — a save that
 * navigates, an editor that lands on its new record's `#/editor/post/<id>` —
 * still commits.
 */
export function routeOf(url: string): string {
  const [beforeHash, hash = ''] = url.split('#', 2);
  return `${beforeHash.split('?')[0]}#${hash.split('?')[0]}`;
}

/** The name, else the label, of each candidate: what a resolved target is known by. */
export function candidateNames(candidates: readonly { name?: unknown; label?: unknown }[]): unknown[] {
  return candidates.map((c) => c.name ?? c.label);
}

/**
 * The warning for a read whose value is an echo, or null when it is not one.
 * `where` is the caller's name for the step ("step 3" in the daemon,
 * "<stepId> <segmentId>/<n>" in the artifact); `label` is the read's own key.
 */
export function echoVerdict(ledger: Set<string>, label: string, value: string, where: string): string | null {
  if (!value || !echoKey(value) || !ledger.has(echoKey(value))) return null;
  return `${where}: read '${label}' returned a value the skill itself set/selected ('${clip(value, 60)}') — confirms the control, not persistence; dropped from the report's confident values`;
}


/** One step that set something: what it set, where, and how to find its control again. */
interface EchoSet {
  seq: number;
  /** The runner's name for the step (daemon: its tag; artifact: segment/index). */
  step: string;
  /** echoKey of every text it put on the page (its fill, its candidates' names). */
  texts: Set<string>;
  /** Its resolved target, re-evaluated at the read: a re-rendered control is found again. */
  locator: Locator;
  /** The page url when it acted. */
  url: string;
  /**
   * Its entry in the page-side list (markActed), or -1 when the element could
   * not be marked — a detached element, a closed page, a page double with no
   * evaluate. An unmarked set has no element evidence, so a read it could be
   * the source of keeps the text rule: an echo (echoAt).
   */
  index: number;
  /**
   * The step put a VALUE into a control: a fill, a type, a select, a check —
   * or an option it picked into the control that owns it. A read of that
   * control is judged by the element before any text (echoByControl, round 61).
   */
  value: boolean;
}

/** A later click whose recorded effect ADDED these lines (noteCommit). */
interface EchoCommit {
  seq: number;
  step: string;
  lines: string[];
}

interface EchoMeta {
  id: string;
  seq: number;
  sets: EchoSet[];
  commits: EchoCommit[];
}

/** The per-ledger half the text Set cannot hold. */
const ECHO_META = new WeakMap<Set<string>, EchoMeta>();
let echoLedgers = 0;
function echoMeta(ledger: Set<string>): EchoMeta {
  let meta = ECHO_META.get(ledger);
  if (!meta) {
    echoLedgers += 1;
    meta = { id: `echo-${echoLedgers}-${Date.now().toString(36)}`, seq: 0, sets: [], commits: [] };
    ECHO_META.set(ledger, meta);
  }
  return meta;
}

/**
 * Record a step that sets something on the element `loc` resolved to, with
 * the texts it set — the element half of the ledger (see echoAt). The page
 * keeps the element and its CONTROL: the element itself, or, for an option in
 * a listbox or menu, the combobox that owns it (aria-controls / aria-owns),
 * else the element the segment acted on just before (the opener). Never throws.
 */
export async function markActed(page: Page, loc: Locator, ledger: Set<string>, texts: readonly unknown[], step: string, tool = ''): Promise<void> {
  const meta = echoMeta(ledger);
  const keys = new Set(texts.filter((t): t is string => typeof t === 'string').map(echoKey).filter(Boolean));
  // Best-effort, never a reason for a step to fail: whatever throws here — a
  // detached element, a closed page, a locator double — leaves the set
  // unmarked (index -1), which echoAt reads as "no element evidence".
  const marked = await markInPage(loc, meta.id);
  // A page double's evaluate may answer anything: only a mark it returned counts.
  const index = marked && typeof marked.index === 'number' ? marked.index : -1;
  const option = marked?.option === true;
  const value = VALUE_TOOLS.has(tool) || option;
  let url = '';
  try {
    url = page.url();
  } catch {
    /* a page that cannot say where it is: the url rule decides nothing */
  }
  // Every acted element is marked in the page (an option's owner may be the
  // opener before it, whatever it set); only one that put text there can be
  // the source of a read, so only those are sets.
  // A step that put a value into a control is a set whatever its text: the
  // control is what a later read is judged by (echoByControl).
  if (!keys.size && !value) return;
  meta.seq += 1;
  meta.sets.push({ seq: meta.seq, step, texts: keys, locator: loc, url, index, value });
}

/** The tools that put a VALUE into the control they act on (EchoSet.value). */
const VALUE_TOOLS = new Set(['fill', 'type', 'select', 'check', 'uncheck', 'set_checked']);

/** The page-side mark (markActed): its index (-1 on any failure) and whether the element was an option picked into its owner. */
async function markInPage(loc: Locator, key: string): Promise<{ index: number; option: boolean }> {
  try {
    return await loc.first().evaluate(
      (el, key) => {
        const w = window as unknown as { __sitelooperActed?: Record<string, { el: Element; control: Element }[]> };
        const all = (w.__sitelooperActed ??= {});
        const list = (all[key] ??= []);
        let control: Element = el;
        const role = el.getAttribute('role') ?? '';
        const owner = el.closest('[role="listbox"], [role="menu"]');
        const option = Boolean(owner || role === 'option' || role.startsWith('menuitem'));
        if (option) {
          const id = owner?.id;
          const named = id ? document.querySelector(`[aria-controls~="${CSS.escape(id)}"], [aria-owns~="${CSS.escape(id)}"]`) : null;
          control = named ?? (list.length ? list[list.length - 1].control : el);
        }
        list.push({ el, control });
        return { index: list.length - 1, option };
      },
      key,
      { timeout: 1_000 },
    );
  } catch {
    return { index: -1, option: false };
  }
}

/**
 * A click (or press) whose effect added `lines` — the recorded lines THIS
 * run's diff added (expect.ts ChangeVerdict.inDiff), filled, noted after the
 * action ran: if one of them shows a value an earlier step set, the app took
 * the value and displayed it — a commit (echoAt's rule b). The step that set
 * the value is never its own commit.
 */
export function noteCommit(ledger: Set<string>, lines: readonly string[], step: string): void {
  const meta = echoMeta(ledger);
  const kept = lines.filter((l) => typeof l === 'string' && l.trim());
  if (!kept.length) return;
  meta.seq += 1;
  meta.commits.push({ seq: meta.seq, step, lines: kept });
}

/**
 * Is a read that returned `value` from `read` an ECHO of what this segment set
 * — see the module comment for the two conditions an observation must meet.
 * A value the ledger's text does not hold is never an echo. A read with no
 * element (a url or title read), or a text no marked set accounts for, keeps
 * the text rule: an echo. Anything the page cannot answer is an echo too:
 * this only ever relaxes the rule on positive evidence.
 */
export async function echoAt(page: Page, ledger: Set<string>, value: string, read: Locator | null): Promise<boolean> {
  if (!value) return false;
  const want = echoKey(value);
  if (!want || !ledger.has(want)) return false;
  // A short value has no text rule (MIN_ECHO_LEN): it is an echo only where
  // the element says so, and anything the page cannot answer leaves it observed.
  const short = shortEcho(value);
  // Past the text rule, anything that throws is no evidence: an echo.
  try {
    return await echoByElement(page, ledger, want, read, short);
  } catch {
    return !short;
  }
}

/** Where a set's control stands, seen from a read's element: see sourceState. */
interface SourceState {
  /** The page the set acted on was replaced (a navigation or reload): its marks are gone. */
  replaced: boolean;
  /** The control is gone, and nothing matching its locator stands in its place. */
  detached: boolean;
  /** The read IS the control, is inside its widget, or contains it. */
  isControl: boolean;
}

/**
 * The page-side half of the element rule, one set at a time: is the read's
 * element the set's control (or its widget), and is the control still the one
 * the set acted on. Null when the page cannot answer.
 */
async function sourceState(meta: EchoMeta, set: EchoSet, readEl: ReadElement): Promise<SourceState | null> {
  const current = await set.locator.first().elementHandle({ timeout: 250 }).catch(() => null);
  try {
    return await readEl
      .evaluate(
        (r, arg) => {
          const w = window as unknown as { __sitelooperActed?: Record<string, { el: Element; control: Element }[]> };
          const list = w.__sitelooperActed?.[arg.key];
          if (!list) return { replaced: true, detached: true, isControl: false };
          const mark = arg.index >= 0 ? list[arg.index] : undefined;
          let control: Element | null = null;
          if (mark && mark.control !== mark.el) control = mark.control.isConnected ? mark.control : null;
          else if (mark && mark.el.isConnected) control = mark.el;
          else control = (arg.current as Element | null) ?? null;
          if (!control) return { replaced: false, detached: true, isControl: false };
          // The control's widget: its nearest field wrapper — the closest
          // ancestor that holds anything beside it, while it holds no
          // other control.
          const CONTROLS =
            'input:not([type="hidden"]), select, textarea, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="textbox"], [role="searchbox"], [role="spinbutton"]';
          const controls = (a: Element) => a.querySelectorAll(CONTROLS).length + (a.matches(CONTROLS) ? 1 : 0);
          let widget: Element = control;
          for (let a = control.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
            if (controls(a) > 1) break;
            widget = a;
            const beside = Array.from(a.childNodes).some((n) => n !== control && !n.contains(control) && (n.nodeType === 1 || (n.textContent ?? '').trim() !== ''));
            if (beside) break;
          }
          const isControl = widget === r || widget.contains(r as Node) || (r as Element).contains(control);
          return { replaced: false, detached: false, isControl };
        },
        { key: meta.id, index: set.index, current },
      )
      .catch(() => null);
  } finally {
    await current?.dispose().catch(() => {});
  }
}

/**
 * Did something COMMIT between `set` and now (the module comment's rule b):
 * the page replaced, the control gone, a route change (never a rewritten query
 * string), or a later click whose own diff showed one of `keys` — the read's
 * value, or (for the element rule, where the read's text may be the app's
 * reformatting) what the set itself put there.
 */
function committedSince(page: Page, meta: EchoMeta, set: EchoSet, seen: SourceState, keys: readonly string[]): boolean {
  let url = '';
  try {
    url = page.url();
  } catch {
    /* a page that cannot say where it is: the url rule decides nothing */
  }
  return (
    seen.replaced ||
    seen.detached ||
    (set.url !== '' && url !== '' && routeOf(url) !== routeOf(set.url)) ||
    meta.commits.some((c) => c.seq > set.seq && c.step !== set.step && c.lines.some((l) => keys.some((k) => k !== '' && ` ${echoKey(l)} `.includes(` ${k} `))))
  );
}

/**
 * echoAt past the text rule: true (an echo) unless both of the module
 * comment's conditions hold for every source. For a `short` value only
 * condition (a) speaks: a read of the control that set it, or of its widget,
 * is an echo; anything else, or no evidence, is not.
 */
async function echoByElement(page: Page, ledger: Set<string>, want: string, read: Locator | null, short = false): Promise<boolean> {
  const meta = ECHO_META.get(ledger);
  const sets = meta ? meta.sets.filter((s) => s.texts.has(want)) : [];
  if (!meta || !sets.length || !read) return !short;
  // A source that could not be marked keeps the text rule for itself.
  if (sets.some((s) => s.index < 0)) return !short;
  const readEl = await read.first().elementHandle({ timeout: 1_000 }).catch(() => null);
  if (!readEl) return !short;
  try {
    for (const set of sets) {
      const seen = await sourceState(meta, set, readEl);
      if (!seen) return !short;
      if (seen.isControl) return true;
      if (short) continue;
      if (!committedSince(page, meta, set, seen, [want])) return true;
    }
    return false;
  } finally {
    await readEl.dispose().catch(() => {});
  }
}

/*
 * ELEMENT BEFORE TEXT (round 61, EspoCRM fwec13 03-create). The text rule asks
 * first whether the read's text is one the step set, and only then looks at
 * the element. EspoCRM formats what it is given: the Amount input typed with
 * "12500" read back "12,500" and "12,500.00", and the Close Date input, after
 * its picker toggled, read "2018-01-16" — neither text is in the ledger, so
 * the element rule was never asked and all three went out as observed values,
 * on n2, n3 and the compiled script alike. A control shows what it was given,
 * however it renders it; that is not what the app stored.
 *
 * So a read whose element IS a control a step of this chain put a value into
 * (EchoSet.value), or that control's widget, with nothing committed since the
 * set, is an echo whatever its text says. The text rule still decides every
 * read elsewhere. The ledger spans the flow step's whole chain (both runners
 * keep one per step, not per segment), so a control an earlier segment filled
 * is judged too — and a Save plus a reopen (odoo fwod86 02-create) is still a
 * commit: the reopened page's marks are gone.
 */

/**
 * Is the read's element a control this chain put a value into, with nothing
 * committed since? False wherever the page cannot say: this rule only ever
 * withholds on positive element evidence.
 */
export async function echoByControl(page: Page, ledger: Set<string>, value: string, read: Locator | null): Promise<boolean> {
  const meta = ECHO_META.get(ledger);
  const sets = meta ? meta.sets.filter((s) => s.value && s.index >= 0) : [];
  if (!meta || !sets.length || !read) return false;
  const readEl = await read.first().elementHandle({ timeout: 1_000 }).catch(() => null);
  if (!readEl) return false;
  try {
    const want = echoKey(value);
    for (const set of sets) {
      const seen = await sourceState(meta, set, readEl).catch(() => null);
      if (!seen?.isControl) continue;
      if (!committedSince(page, meta, set, seen, [want, ...set.texts])) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    await readEl.dispose().catch(() => {});
  }
}

/**
 * THE echo judgement both runners ask of a published read: the warning when it
 * is an echo, else null. The element first (echoByControl), then the text
 * rule (echoVerdict, echoAt) for a read anywhere else.
 */
export async function judgeEcho(page: Page, ledger: Set<string>, label: string, value: string, read: Locator | null, where: string): Promise<string | null> {
  if (!value) return null;
  const byText = echoVerdict(ledger, label, value, where);
  if (await echoByControl(page, ledger, value, read)) {
    return (
      byText ??
      `${where}: read '${label}' returned '${clip(value, 60)}' from a control this step set, and nothing committed it since — it shows the control, however the app formats it, not what the app stored; dropped from the report's confident values`
    );
  }
  if (!byText) return null;
  return (await echoAt(page, ledger, value, read)) ? byText : null;
}
