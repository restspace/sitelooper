import type { Locator, Page } from 'playwright-core';
import { markPoint, type PointGeometry } from './point.js';

/**
 * ONE locator-resolution policy, run by daemon replay and embedded verbatim
 * in the standalone artifact.
 *
 * A recorded step carries a CHAIN of ways to find its element. Picking one at
 * replay is not "the first that matches": it is a set of rules that used to
 * live only in replay's `resolveChain`, while the artifact's `pick` had one of
 * them (policy audit B8, gaps 14 and B8). The rules, in the order they apply:
 *
 *  1. ORDER. Identity (a candidate that names a RECORD) ahead of handles (a
 *     candidate that names a CONTROL) ahead of paths (a route to wherever
 *     that shape currently sits), with the recorded point last of all — each
 *     class keeping its recorded order. Within a class a candidate that later
 *     runs showed to be volatile (`retired`) goes last: the class order is a
 *     prior about what a candidate IS, retirement is a measurement of whether
 *     it WORKS.
 *  2. A POINT NAMES A PLACE. It is marked (the element under it, of the
 *     recorded kind) before its locator can name anything; nothing of that
 *     kind there is a miss.
 *  3. UNIQUE, THEN GUARDED. A candidate that resolves to exactly one element
 *     must still (a) keep the record's identity — bear every value the step
 *     was recorded against, unless it carries that value itself; the recorded
 *     primary is trusted, unless it is itself structural; (b) be plausible —
 *     a guess that resolves far from the recorded box is a different element;
 *     (c) stay on the recorded origin — a guess inside a link that leaves it
 *     cannot be the recorded control. The primary is exempt from (b) and (c)
 *     unless structural: the recording did click it.
 *  4. AMBIGUITY. Several matches are the normal shape only for a read across
 *     every match (`allowMultiple`) and for a loop body whose per-record
 *     locator matches every record (`ambiguousNth` narrows to the cursor,
 *     still identity-guarded). Otherwise an ambiguous primary that was unique
 *     when recorded is DRIFT — keep looking — and an ambiguous fallback is
 *     simply not a way of naming one thing.
 *  5. THE HOLD. A structural hit is not taken on the spot when the chain also
 *     names the element: a path resolves instantly against whatever sits in
 *     that slot while the named control is still rendering. The guess is held
 *     until the names have had the whole wait window, and stands only when
 *     none of them came.
 *  6. THE WAIT. When a pass resolves nothing, the WHOLE chain is re-walked on
 *     a poll for `waitMs` — not the primary alone — so the preference order
 *     stays intact and the best candidate wins the moment it appears. Misses
 *     are reported per pass, from the pass that resolved: a candidate that
 *     missed while the page was still painting and hits on the next poll is
 *     not volatile, it was early.
 *
 * What the runners supply is OBSERVATIONS — a locator per candidate and the
 * compile-time facts about it — and how they present the result. What they
 * must not do is reinterpret any rule above.
 */

/** One candidate, as this policy sees it. The runner builds the Locator; the policy decides. */
export interface CandidateObservation {
  /** The live locator for this candidate. For a point, the marker locator (see point.ts) — empty until marked. */
  locator: Locator;
  /** Its index in the STORED chain, so telemetry names the recorded candidate that took (or missed) the step. */
  index: number;
  /** Position, not identity: a path through the document, an index into a set of matches, or a point. See structuralCandidate. */
  structural: boolean;
  /** The candidate's kind ('scoped', 'role', 'css', 'point', ...). 'scoped' is the identity class; 'point' is marked before counting. */
  kind: string;
  /**
   * Text the candidate itself names, with params filled — the daemon passes
   * the candidate's JSON. An identity value found here needs no guarding:
   * the candidate already asks for it.
   */
  carries: string;
  /** The recorded match index, when the candidate was checked against the recorded element at that index. Set means ambiguity was expected. */
  nth?: number;
  /** For a point candidate: the recorded geometry. The FIRST point in the input is also the plausibility yardstick for every guess. */
  point?: PointGeometry;
  /** Demonstrated volatile by later runs (hit 0, missed repeatedly). Ordered last within its class. */
  retired?: boolean;
}

/** Policy for one resolution. Named, because seven positional flags is how a call site gets one wrong. */
export interface ResolvePolicy {
  /** read_all reads across every match, so its target need not be unique. */
  allowMultiple?: boolean;
  /**
   * Loop-body cursor: when a candidate matches several records, act on THIS
   * match index (the first unprocessed record) instead of skipping to a
   * fallback. A folded loop's per-record locator is often generic across rows
   * ("Edit" on every row), so ambiguity there is the loop's normal shape, not
   * drift — and the positional fallback it used to fall through to is pinned
   * to one recorded row, which is how fwrd4l edited part A seven times.
   */
  ambiguousNth?: number;
  /**
   * Identity the step carried: values the caller vouched for that named the
   * record this step acts on ("fwrd8-n2 RD Bench Ticket"). A fallback
   * candidate is a different way of finding the SAME element, so it must
   * still land on something bearing that text — the positional and record-id
   * fallbacks recorded beside it are pinned to the recorded run's row and id,
   * and following one silently moves the whole procedure onto another record
   * (fwrd8-n2/n3 worked a seed ticket to completion this way). When no
   * fallback qualifies, the step fails to recovery, which is cheap; acting on
   * the wrong record is not. Derive it with identityValues.
   */
  requireIdentity?: readonly string[];
  /**
   * The origin the recorded step stayed on. A candidate that resolves to a
   * link leaving that origin cannot be the recorded control: diaggr1's
   * replay of fwgr26 fell from `link "New dashboard"` (its menu had been
   * toggled shut) to the structural `div > … > a:nth-of-type(1)`, which
   * matched Grafana's footer link to grafana.com; the offline box answered
   * with an error page and the whole create step went to recovery.
   */
  stayOnOrigin?: string;
  /**
   * How long to keep re-trying the WHOLE chain when nothing resolves.
   *
   * The agent never needed this: a model turn is seconds and it re-snapshots
   * each time, so anything the app was about to paint (repair-desk defers its
   * list refetch ~1s BY DESIGN) had always landed before it looked. A replay
   * has no turns, and settling only proves the DOM went quiet, which it does
   * in the gap BEFORE the refetch paints. The wait costs nothing on a healthy
   * page — it runs only after a full pass found nothing.
   *
   * Zero for a caller ASKING whether something is still there rather than
   * looking for it: the loop guard reads a null return as "the list is empty,
   * stop", so waiting there would stall every loop's normal exit.
   */
  waitMs?: number;
  /** Poll cadence inside the wait. Default RESOLVE_POLL_MS. */
  pollMs?: number;
}

/** Why a candidate ahead of the winner was passed over — the same words in both runners' telemetry. */
export type MissReason =
  | 'absent' // matched nothing
  | 'unmarked' // a point with nothing of the recorded kind under it
  | 'identity' // resolved, but not to something bearing the record's identity
  | 'implausible' // resolved far from the recorded box
  | 'origin' // resolved inside a link leaving the recorded origin
  | 'ambiguous' // matched several, and this is not a place ambiguity is allowed
  | 'error'; // malformed selector or detached page

export interface Resolution {
  /** The locator to act on: the candidate's own, narrowed with `.nth()` when ambiguity was allowed by cursor. */
  locator: Locator;
  /** Stored-chain index of the winning candidate. 0 is the primary; anything else is drift. */
  index: number;
  /** Set when an ambiguous candidate was narrowed to the loop cursor — the runner sinks it beside the candidate. */
  nth?: number;
  /** Whether the winner was positional — the runner sharpens its effect gate and withholds evidence on such a hit. */
  structural: boolean;
  /** Every candidate rejected in the PASS that resolved, in walk order. Empty when nothing resolved is reported as null, not here. */
  missed: { index: number; reason: MissReason }[];
}

/** Default poll cadence of the wait loop. Runs only on a page that has already failed to answer, never on the fast path. */
export const RESOLVE_POLL_MS = 100;
/** Default wait window when nothing resolves, for a runner that does not configure its own. */
export const RESOLVE_WAIT_MS = 3_000;

/**
 * Structural: a path through the document, or an index into a set of matches,
 * or where the element was. Position, not identity.
 *
 * Note this is NOT "kind === css". An agent-chosen `#modal-save` is a handle
 * — it names one control — while `#view > div > button:nth-of-type(2)` is a
 * route to wherever that shape currently sits. Demoting the first alongside
 * the second would push a deliberate selector below a role guess.
 */
export function structuralCandidate(c: { kind: string; nth?: number; selector?: string }): boolean {
  if (c.nth !== undefined) return true;
  if (c.kind === 'point') return true; // where it was, not what it is
  if (c.kind !== 'css') return false;
  return /[>+~]|:nth-/.test(c.selector ?? '');
}

/**
 * The class a candidate belongs to, as a sort key: identity (0), handle (1),
 * path (2), point (3). A point is the last resort behind every path.
 */
export function candidateRank(c: { kind: string; structural: boolean }): number {
  if (c.kind === 'scoped') return 0;
  if (c.kind === 'point') return 3;
  return c.structural ? 2 : 1;
}

/**
 * Rule 1: class order, recorded order within a class, retired last within a
 * class. Stable, so nothing shuffles for free.
 */
export function orderCandidates<T extends { kind: string; structural: boolean; retired?: boolean }>(cands: readonly T[]): T[] {
  return cands
    .map((c, at) => ({ c, at }))
    .sort((a, b) => candidateRank(a.c) - candidateRank(b.c) || Number(!!a.c.retired) - Number(!!b.c.retired) || a.at - b.at)
    .map(({ c }) => c);
}

/** Does the resolved element sit inside a link that leaves the recorded origin? Rule 3(c). */
async function leavesOrigin(locator: Locator, origin: string | undefined): Promise<boolean> {
  if (!origin) return false;
  try {
    return await locator.first().evaluate((el, wanted) => {
      const a = (el as Element).closest('a[href]');
      if (!a) return false;
      try {
        const target = new URL((a as HTMLAnchorElement).href, location.href);
        // file:// pages have an opaque origin; a link there is "home" when
        // it stays on the same scheme.
        if (target.origin === 'null' || location.origin === 'null') return target.protocol !== location.protocol;
        return target.origin !== wanted;
      } catch {
        return false;
      }
    }, origin);
  } catch {
    return false;
  }
}

/**
 * Rule 3(b). The recorded geometry, when the chain carries it, is the
 * yardstick a guess is measured against: a structural fallback that resolves
 * far from where the recorded element sat is a different element — rpgr13's
 * `div > … > button` took a header button for a control in the editor's side
 * pane.
 */
async function plausible(page: Page, locator: Locator, recorded: PointGeometry | null): Promise<boolean> {
  if (!recorded) return true;
  try {
    const box = await locator.first().boundingBox();
    if (!box) return true; // nothing to measure — let the other guards judge
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const cx = box.x + box.width / 2 + scroll.x;
    const cy = box.y + box.height / 2 + scroll.y;
    const limit = Math.max(recorded.vw, recorded.vh) / 3;
    return Math.hypot(cx - recorded.x, cy - recorded.y) <= limit;
  } catch {
    return true;
  }
}

/**
 * Rule 3(a). Does this candidate still identify the record the step named?
 * The recorded primary is trusted — unless it is itself structural (an
 * agent-typed positional selector at the head), which names no record.
 */
async function keepsIdentity(c: CandidateObservation, locator: Locator, requireIdentity: readonly string[]): Promise<boolean> {
  if (!requireIdentity.length || (c.index === 0 && !c.structural)) return true;
  const wanted = requireIdentity.filter((v) => !c.carries.includes(v));
  if (!wanted.length) return true;
  let text: string;
  try {
    text = ((await locator.first().textContent({ timeout: 1_000 })) ?? '').replace(/\s+/g, ' ');
  } catch {
    return false;
  }
  return wanted.every((v) => text.toLowerCase().includes(v.toLowerCase()));
}

/**
 * Resolve one chain of candidates against the page under `policy`. `cands`
 * is given in STORED order (index ascending); this function orders it.
 * Returns null when nothing resolved within the wait.
 */
export async function resolveCandidates(page: Page, cands: readonly CandidateObservation[], policy: ResolvePolicy = {}): Promise<Resolution | null> {
  const { allowMultiple = false, ambiguousNth, requireIdentity = [], stayOnOrigin, waitMs = 0, pollMs = RESOLVE_POLL_MS } = policy;
  const ordered = orderCandidates(cands);
  const recordedBox = cands.find((c) => c.kind === 'point' && c.point)?.point ?? null;

  /**
   * One pass over the chain, best candidate first, reporting which candidates
   * it REJECTED before the winner. Per pass, deliberately (rule 6).
   */
  const walk = async (): Promise<Resolution | null> => {
    const missed: Resolution['missed'] = [];
    const miss = (index: number, reason: MissReason) => missed.push({ index, reason });
    for (const c of ordered) {
      const guess = c.index > 0 || c.structural;
      try {
        // A point names a place; find what is there (of the recorded kind)
        // before a locator can name it.
        if (c.kind === 'point' && (!c.point || !(await markPoint(page, c.point)))) {
          miss(c.index, 'unmarked');
          continue;
        }
        const count = await c.locator.count();
        if (count === 1) {
          if (!(await keepsIdentity(c, c.locator, requireIdentity))) {
            miss(c.index, 'identity');
            continue;
          }
          if (guess && c.kind !== 'point' && !(await plausible(page, c.locator, recordedBox))) {
            miss(c.index, 'implausible');
            continue;
          }
          // The recorded primary is trusted even when it is such a link — the
          // recording clicked it (rpgr12-r2's sign-in skill had a stray click
          // on Grafana's "Support" footer link, and refusing it cost a
          // 19-turn recovery). Only a guess may not leave the origin.
          if (guess && (await leavesOrigin(c.locator, stayOnOrigin))) {
            miss(c.index, 'origin');
            continue;
          }
          return { locator: c.locator, index: c.index, structural: c.structural, missed };
        }
        if (count > 1) {
          if (allowMultiple) return { locator: c.locator, index: c.index, structural: c.structural, missed };
          if (ambiguousNth !== undefined && c.nth === undefined && ambiguousNth < count) {
            const picked = c.locator.nth(ambiguousNth);
            if (!(await keepsIdentity(c, picked, requireIdentity))) {
              miss(c.index, 'identity');
              continue;
            }
            return { locator: picked, index: c.index, nth: ambiguousNth, structural: c.structural, missed };
          }
          miss(c.index, 'ambiguous'); // a primary that was unique: drift; a fallback: not a way of naming one thing
          continue;
        }
        miss(c.index, 'absent');
      } catch {
        miss(c.index, 'error'); // malformed selector or detached page — try the next
      }
    }
    return null;
  };

  // Fast path first: on a page that is ready this returns immediately and the
  // wait below never runs. Rules 5 and 6: a structural hit is held while the
  // chain also names the element; the whole chain is re-walked each poll.
  const named = ordered.some((c) => !c.structural);
  const guess = (hit: Resolution | null) => !!hit && named && hit.structural;
  const first = await walk();
  if (first && !guess(first)) return first;
  let held = first;
  for (let waited = 0; waited < waitMs; waited += pollMs) {
    // A plain timer, not page.waitForTimeout: this path runs precisely when
    // the page is unhappy, and a navigating or detached page makes its own
    // clock throw.
    await new Promise((r) => setTimeout(r, pollMs));
    const hit = await walk();
    if (hit && !guess(hit)) return hit;
    if (hit) held = hit;
  }
  return held;
}

/** The text-bearing fields of a candidate: what it NAMES. A slot inside a css selector or a testid is an address, not a name. */
export function identityFields(c: { name?: string; text?: string; label?: string; hasText?: string }): string[] {
  return [c.name, c.text, c.label, c.hasText].filter((v): v is string => typeof v === 'string');
}

/**
 * The identity values a step carried: known ({{known}}) slots whose value the
 * recorded run used to NAME the target by its visible text. `fields` are the
 * UNFILLED name/text/label/hasText strings of the WHOLE chain (identityFields
 * of every candidate) — identity is a property of the STEP, which record it
 * acts on, not of whichever candidate happens to sit first (fwrd26l: the
 * primary was an XPath stored as css and advertised nothing, while the scoped
 * anchor right behind it named the record). `known` maps a slot to its value
 * for KNOWN slots only; a value shorter than three characters is too weak to
 * pin a fallback to. Deduplicated, in first-seen order.
 */
export function identityValues(known: Record<string, string | undefined>, fields: readonly string[]): string[] {
  const out = new Set<string>();
  for (const field of fields) {
    for (const m of field.matchAll(/\{\{(v\d+)\}\}/g)) {
      const value = known[m[1]];
      if (value && value.length >= 3) out.add(value);
    }
  }
  return [...out];
}
