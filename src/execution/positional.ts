import type { Locator, Page } from 'playwright-core';
import { SLOT_LINE, TRANSIENT_LINE, identifiesNothing, liveLines } from './expect.js';
import { captureLines, lineShows, type LineDialect } from './snapshot.js';

/**
 * RULE R2 (round 61, grafana fwgr73 05-open step 3): what both runners do
 * with a CLICK whose identifying rungs all missed, before dispatching it.
 * 04-open's model recovery had left the dashboard in edit mode, so s_c49ccb's
 * Edit click found no Edit button: its testid and role rung missed, and the
 * positional `…div:nth-of-type(5) > button` took the step onto another
 * toolbar button — none of the recorded additions appeared, and the step fell
 * to the model. Two halves, one verdict (positionalClickVerdict):
 *  (a) everything the click was recorded adding already shows: the state it
 *      produces is in place — skipped, and said (alreadyAddedLines says which
 *      clicks may be: never one that submits the segment's work);
 *  (b) otherwise a positional rung is accepted only when the element it found
 *      carries the recorded accessible name — never a different button.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */

/** How long a name probe of a resolved element may take. */
const POSITIONAL_PROBE_MS = 2_000;

/**
 * The accessible name a recorded chain gave its element, for a positional
 * fallback to be held to (positionalHitNamed): the first `role` rung's role
 * and name, else a `label` rung's label, else a `text` rung's text; null when
 * the chain names nothing. The name may carry `{{…}}` markers: the verdict
 * fills them with this run's params, and one it cannot fill vouches for
 * nothing (positionalClickVerdict).
 */
export function recordedAccessibleName(
  chain: readonly unknown[],
): { by: 'role' | 'label' | 'text'; role?: string; name: string } | null {
  const rungs = chain as { kind?: string; role?: string; name?: string; label?: string; text?: string }[];
  const role = rungs.find((c) => c.kind === 'role' && c.role && c.name);
  const label = rungs.find((c) => c.kind === 'label' && c.label);
  const text = rungs.find((c) => c.kind === 'text' && c.text);
  const want = role
    ? { by: 'role' as const, role: role.role!, name: role.name! }
    : label
      ? { by: 'label' as const, name: label.label! }
      : text
        ? { by: 'text' as const, name: text.text! }
        : null;
  return want;
}

/**
 * Whether a resolution reached its element by POSITION ALONE: the chain has
 * identifying rungs (anything not structural, never a snapshot ref, which is
 * never tried), and every one of them missed; `hit` null means nothing at all
 * resolved. A chain with no identifying rung was always positional, and is
 * not what this asks about. `identifying` is the stored-chain indices of the
 * identifying rungs; `missed` the indices the resolution passed over.
 *
 * A hit by a recorded POINT is never position alone (`hit.point`): the policy
 * only takes a point when an element of the recorded kind sits under it
 * (markPoint), and it is the yardstick that refuses a path landing far from
 * the recorded box — it is how the recording found that very element, not a
 * guess at a slot (the "recorded points" parity cells: a point's click on the
 * near Mark, with the recorded primary gone, is the recorded click).
 */
export function positionalOnly(hit: { structural: boolean; point?: boolean; missed: readonly number[] } | null, identifying: readonly number[]): boolean {
  if (!identifying.length) return false;
  if (!hit) return true;
  if (hit.point) return false;
  return hit.structural && identifying.every((i) => hit.missed.includes(i));
}

/**
 * RULE R2(b) — a positional fallback on an acting click must be the recorded
 * element BY NAME (round 61, grafana fwgr73 05-open step 3). The Edit click's
 * testid and role rung both missed — 04-open's recovery had left the
 * dashboard in edit mode, so there was no Edit button — and the positional
 * `…div:nth-of-type(5) > button` took the step onto whatever toolbar button
 * sat there. A path through the document names a slot, not a control; the
 * element it finds is accepted only when it carries the accessible name the
 * chain recorded (the same role, exactly that name — "Exit edit" is not
 * "Edit"). Otherwise the step stops, naming why, and never clicks a different
 * button. Asked of the element itself — its own aria snapshot's role and
 * accessible name, the terms the recording's lines are in — so both runners
 * read the name the same way.
 *
 * The resolution-time sibling of rule D (an inline heal of a different role
 * must not dispatch), which judges a HEALED locator; this judges a recorded
 * positional rung. Kept apart on purpose.
 */
export async function positionalHitNamed(hit: Locator, want: { by: 'role' | 'label' | 'text'; role?: string; name: string }): Promise<boolean> {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  let head: string;
  try {
    head = ((await hit.first().ariaSnapshot({ timeout: POSITIONAL_PROBE_MS })) ?? '').split('\n')[0] ?? '';
  } catch {
    return false;
  }
  // `- role "name" [state]…` — the element's own role and accessible name, as
  // the recording's lines state them.
  const m = /^-\s*([A-Za-z][\w-]*)(?:\s+"((?:[^"\\]|\\.)*)")?/.exec(head.trim());
  if (!m) return false;
  const role = m[1];
  const name = norm((m[2] ?? '').replace(/\\(.)/g, '$1'));
  if (want.by === 'role' && role !== want.role) return false;
  if (name === norm(want.name)) return true;
  if (want.by !== 'text') return false;
  try {
    return norm((await hit.first().innerText({ timeout: POSITIONAL_PROBE_MS })) ?? '') === norm(want.name);
  } catch {
    return false;
  }
}

/** A popup line: what the opener guard (replay's openerLines) owns. */
const POPUP_LINE = /^-?\s*(dialog|alertdialog|menu|menubar|listbox|tooltip)\b/;

/**
 * RULE R2(a) — the lines an ADDING-ONLY click may be skipped on, as already
 * in effect, when its identifying rungs all miss (round 61, grafana fwgr73
 * 05-open step 3: the Edit click on a dashboard 04-open's recovery had left
 * in edit mode — Add, Settings, Exit edit, Save dashboard all showing, the
 * Edit button gone). Empty — never skipped — for anything but a plain click
 * whose whole recorded effect was lines ADDED, and never for one the
 * segment's work depends on:
 *  - one that submits it: an earlier fill, type, select, check or uncheck in
 *    the same segment (the round-56 provenance: work the click may carry);
 *  - one that closes what it opened, or any recorded removal at all
 *    (`removedContains`, `removalRequired`), an alert, or a mint;
 *  - a popup opener (the opener guard's), a toggle or a re-open (their own
 *    rules).
 * Lines carrying this run's value, transient ones and ones that identify
 * nothing decide nothing, as for a toggle.
 */
export function alreadyAddedLines(
  steps: readonly {
    tool: string;
    mints?: unknown;
    toggle?: unknown;
    closedBefore?: unknown;
    expect?: { addedContains?: readonly string[]; alertContains?: string; removedContains?: readonly string[]; removalRequired?: unknown };
  }[],
  index: number,
): string[] {
  const step = steps[index];
  if (!step || step.tool !== 'click' || step.mints || step.toggle || step.closedBefore) return [];
  const e = step.expect;
  if (!e?.addedContains?.length || e.alertContains || e.removedContains?.length || e.removalRequired) return [];
  if (steps.slice(0, index).some((s) => ['fill', 'type', 'select', 'check', 'uncheck'].includes(s.tool))) return [];
  const lines = e.addedContains.filter((l) => !TRANSIENT_LINE.test(l) && !SLOT_LINE.test(l) && !identifiesNothing(l));
  if (!lines.length || lines.some((l) => POPUP_LINE.test(l))) return [];
  return lines;
}

/** Every one of `lines` (filled for this run) shows on one look at the page; no look is no. */
async function everyLineShows(page: Page, lines: readonly string[], params: Record<string, string>, d: LineDialect): Promise<boolean> {
  const live = await captureLines(page, d);
  if (!live) return false;
  return liveLines(lines, params).every((line) => lineShows(live.lines, [line]));
}

/**
 * RULE R2, both halves, for a click whose identifying rungs all missed
 * (positionalOnly): what both runners do BEFORE dispatching it.
 *  (a) `skip` when it has skip lines (alreadyAddedLines) and every one of
 *      them already shows — the state it was recorded producing is in place;
 *  (b) else `stop` when a positional rung took it (`hit`) and the element
 *      there does not carry the recorded accessible name (positionalHitNamed).
 * Null otherwise — including a chain that resolved by an identifying rung,
 * and a miss with nothing to skip on, which stops as a miss always has.
 */
export async function positionalClickVerdict(
  page: Page,
  hit: { locator: Locator; index: number; structural: boolean; point?: boolean; missed: readonly number[] } | null,
  identifying: readonly number[],
  lines: readonly string[],
  want: { by: 'role' | 'label' | 'text'; role?: string; name: string } | null,
  params: Record<string, string>,
  d: LineDialect = 1,
): Promise<{ skip: string } | { stop: string } | null> {
  if (!positionalOnly(hit, identifying)) return null;
  if (lines.length && (await everyLineShows(page, lines, params, d))) {
    return {
      skip: `every identifying locator missed and everything this click was recorded adding is already showing (${JSON.stringify(lines[0])}${lines.length > 1 ? ` and ${lines.length - 1} more` : ''}) — its recorded effect is in place, so it is skipped`,
    };
  }
  const name = want ? want.name.replace(/\{\{([\w.#:-]+)\}\}/g, (m, k: string) => params[k] || m) : '';
  const named = want && name && !/\{\{[^}]*\}\}/.test(name) ? { ...want, name } : null;
  if (hit && named && !(await positionalHitNamed(hit.locator, named))) {
    return {
      stop: `every identifying locator missed, and the positional fallback #${hit.index + 1} is not the recorded "${named.name}" — the element there carries another name, so it was not clicked`,
    };
  }
  return null;
}

/*
 * A READ OFF ITS RECORDED ELEMENT (round 62, gitea fwgt13 02-create). The
 * recording read the assignee LINK ("bench-assignee"); on n2 and n3 none of
 * its candidates matched, an inline heal proposed the "Add a link" BUTTON (a
 * role-and-name candidate) from the live page, and the button's text was
 * published as the assignee. A read resolved by an inline heal, or by a positional
 * candidate standing in for a better one that missed, reads an element the
 * recording's own names did not reach. It is published only where that
 * element is the KIND the recording read — the role a point or a role
 * candidate recorded, else the point's tag, as markPoint judges a point —
 * on the element itself, an ancestor it is painted inside, or the one
 * descendant that carries all its text (a wrapper the css named). Otherwise
 * the read is skipped, and said to be, in both runners. A chain that records
 * no kind has nothing to compare, and the read stands as before.
 */

/** A kind the recording read: a role, else a tag. */
export interface RecordedKind {
  role: string | null;
  tag: string | null;
}

/** The kinds a recorded chain names for its target: each point's role (else its tag), each role candidate's role. */
export function recordedKinds(chain: readonly unknown[] | undefined): RecordedKind[] {
  const out: RecordedKind[] = [];
  for (const c of chain ?? []) {
    const cand = c as { kind?: unknown; role?: unknown; tag?: unknown };
    if (cand.kind === 'point') out.push(typeof cand.role === 'string' && cand.role ? { role: cand.role, tag: null } : { role: null, tag: typeof cand.tag === 'string' ? cand.tag : null });
    else if (cand.kind === 'role' && typeof cand.role === 'string' && cand.role) out.push({ role: cand.role, tag: null });
  }
  return out.filter((k) => k.role || k.tag);
}

/**
 * Is the element `loc` resolved to the kind of thing the recording read (see
 * above)? True when the chain records no kind; null when the page cannot say
 * — which never withholds.
 */
export async function readsRecordedKind(loc: Locator, kinds: readonly RecordedKind[]): Promise<boolean | null> {
  if (!kinds.length) return true;
  try {
    return await loc.first().evaluate(
      (el, kinds) => {
        const kindOf = (e: Element): { role: string | null; tag: string } => {
          const tagOf = e.tagName.toLowerCase();
          const type = (e.getAttribute('type') || '').toLowerCase();
          const implicit = (): string | null => {
            if (tagOf === 'button') return 'button';
            if (tagOf === 'a') return e.hasAttribute('href') ? 'link' : null;
            if (tagOf === 'select') return e.hasAttribute('multiple') ? 'listbox' : 'combobox';
            if (tagOf === 'textarea') return 'textbox';
            if (tagOf === 'img') return 'img';
            if (/^h[1-6]$/.test(tagOf)) return 'heading';
            if (tagOf === 'input') {
              if (type === 'checkbox') return 'checkbox';
              if (type === 'radio') return 'radio';
              if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
              if (type === 'search') return 'searchbox';
              if (type === 'number') return 'spinbutton';
              if (['text', 'email', 'tel', 'url', 'password', ''].includes(type)) return 'textbox';
              return null;
            }
            return null;
          };
          return { role: e.getAttribute('role') || implicit(), tag: tagOf };
        };
        const is = (e: Element): boolean => {
          const k = kindOf(e);
          return kinds.some((want) => (want.role ? k.role === want.role : k.tag === want.tag));
        };
        for (let cur: Element | null = el, hops = 0; cur && hops < 6; cur = cur.parentElement, hops++) if (is(cur)) return true;
        const text = (e: Element): string => ((e as HTMLElement).innerText ?? e.textContent ?? '').replace(/\s+/g, ' ').trim();
        const own = text(el);
        return own !== '' && Array.from(el.querySelectorAll('*')).some((d) => is(d) && text(d) === own);
      },
      kinds as RecordedKind[],
      { timeout: 1_000 },
    );
  } catch {
    return null;
  }
}

/** Why both runners skip a read that resolved to another kind of element (the same words in each). */
export function offRecordReadReason(label: string, how: string, kinds: readonly RecordedKind[]): string {
  const wanted = kinds.map((k) => k.role ?? k.tag).join(' or ');
  return `read '${label}' resolved by ${how} to an element that is not a ${wanted}, the kind the recording read — its value is not published`;
}
