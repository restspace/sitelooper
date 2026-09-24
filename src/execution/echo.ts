/**
 * The ECHO rule both execution targets share: a read-back that returns only
 * what the procedure itself typed, selected or named confirms the control's
 * display, not that the app persisted anything. grafana's time picker read
 * back "Last 6 hours" after the replay had clicked the option of that name.
 *
 * The daemon (src/skills/replay.ts) keeps one ledger per replayed segment and
 * reports an echoed label in `ReplayResult.echoedValues`, which the flow runner
 * drops from its confident values. A compiled `.flow.ts` embeds this exact
 * source (spec/runtime-source.ts), keeps the same ledger per segment, and lists
 * the label in `run.echoed`. Neither runner withholds the value from a later
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
 *      navigation or reload, a url change, the control detaching with nothing
 *      matching its locator in its place, or a later click whose recorded
 *      effect shows the value appearing (a Save that adds the row).
 * Anything else stays an echo, as before: grafana's picker opener after
 * "Last 6 hours", ghost fwgh13's Excerpt textbox, a live preview mirroring a
 * field that was never saved.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */
import type { Locator, Page } from 'playwright-core';
import { clip } from './text.js';

/**
 * Shortest interacted/read value worth treating as an echo. Below this the
 * coincidence rate is too high (a "1m" refresh, a "3" quantity) — a false echo
 * would wrongly drop a legitimate finding, so only substantial values qualify.
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
    if (typeof text === 'string' && text.length >= MIN_ECHO_LEN) ledger.add(echoKey(text));
  }
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
  if (!value || value.length < MIN_ECHO_LEN || !ledger.has(echoKey(value))) return null;
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
export async function markActed(page: Page, loc: Locator, ledger: Set<string>, texts: readonly unknown[], step: string): Promise<void> {
  const meta = echoMeta(ledger);
  const keys = new Set(texts.filter((t): t is string => typeof t === 'string' && t.length >= MIN_ECHO_LEN).map(echoKey).filter(Boolean));
  // Best-effort, never a reason for a step to fail: whatever throws here — a
  // detached element, a closed page, a locator double — leaves the set
  // unmarked (index -1), which echoAt reads as "no element evidence".
  const index = await markInPage(loc, meta.id);
  let url = '';
  try {
    url = page.url();
  } catch {
    /* a page that cannot say where it is: the url rule decides nothing */
  }
  // Every acted element is marked in the page (an option's owner may be the
  // opener before it, whatever it set); only one that put text there can be
  // the source of a read, so only those are sets.
  if (!keys.size) return;
  meta.seq += 1;
  meta.sets.push({ seq: meta.seq, step, texts: keys, locator: loc, url, index });
}

/** The page-side mark (markActed); -1 on any failure. */
async function markInPage(loc: Locator, key: string): Promise<number> {
  try {
    return await loc.first().evaluate(
      (el, key) => {
        const w = window as unknown as { __sitelooperActed?: Record<string, { el: Element; control: Element }[]> };
        const all = (w.__sitelooperActed ??= {});
        const list = (all[key] ??= []);
        let control: Element = el;
        const role = el.getAttribute('role') ?? '';
        const owner = el.closest('[role="listbox"], [role="menu"]');
        if (owner || role === 'option' || role.startsWith('menuitem')) {
          const id = owner?.id;
          const named = id ? document.querySelector(`[aria-controls~="${CSS.escape(id)}"], [aria-owns~="${CSS.escape(id)}"]`) : null;
          control = named ?? (list.length ? list[list.length - 1].control : el);
        }
        list.push({ el, control });
        return list.length - 1;
      },
      key,
      { timeout: 1_000 },
    );
  } catch {
    return -1;
  }
}

/**
 * A click (or press) whose RECORDED effect added `lines`: if one of them shows
 * a value an earlier step set, the app took the value and displayed it — a
 * commit (echoAt's rule b). The step that set the value is never its own commit.
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
  if (!value || value.length < MIN_ECHO_LEN) return false;
  const want = echoKey(value);
  if (!ledger.has(want)) return false;
  // Past the text rule, anything that throws is no evidence: an echo.
  try {
    return await echoByElement(page, ledger, want, read);
  } catch {
    return true;
  }
}

/** echoAt past the text rule: true (an echo) unless both of the module comment's conditions hold for every source. */
async function echoByElement(page: Page, ledger: Set<string>, want: string, read: Locator | null): Promise<boolean> {
  const meta = ECHO_META.get(ledger);
  const sets = meta ? meta.sets.filter((s) => s.texts.has(want)) : [];
  if (!meta || !sets.length || !read) return true;
  // A source that could not be marked keeps the text rule for itself.
  if (sets.some((s) => s.index < 0)) return true;
  const readEl = await read.first().elementHandle({ timeout: 1_000 }).catch(() => null);
  if (!readEl) return true;
  try {
    for (const set of sets) {
      const current = await set.locator.first().elementHandle({ timeout: 250 }).catch(() => null);
      try {
        const seen = await readEl
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
        if (!seen) return true;
        if (seen.isControl) return true;
        const committed =
          seen.replaced ||
          seen.detached ||
          (set.url !== '' && page.url() !== set.url) ||
          meta.commits.some((c) => c.seq > set.seq && c.step !== set.step && c.lines.some((l) => ` ${echoKey(l)} `.includes(` ${want} `)));
        if (!committed) return true;
      } finally {
        await current?.dispose().catch(() => {});
      }
    }
    return false;
  } finally {
    await readEl.dispose().catch(() => {});
  }
}
