/**
 * GESTURES A PAGE LOAD THREW AWAY, dropped on the in-page journal's proof.
 *
 * gitea fwgt37-dg-n1 05-change (the orchestrator's retry of "assign
 * bench-assignee"): the sidebar Assignees picker ticks an option in the page
 * and commits only when the picker CLOSES. The model opened it and clicked
 * the option (#113: the journal shows `link "bench-assignee …" +checked`, no
 * request), then `goto` the same issue (#116) — a fresh document, so the tick
 * was gone and nothing was saved. It opened the picker again and picked the
 * option by keyboard (#118-#121: `+checked` again, no request), then `goto`
 * the issue list (#122) and assigned through the list's bulk action (#126: a
 * POST to /issues/assignee). Compiled whole, s_db788c replayed both abandoned
 * picker rounds ahead of the route that worked, and the second round's pick
 * (a named click, namedKeyPicks) stopped n2 and n3 alike: 30 and 21 recovery
 * turns for a step whose work three later gestures do.
 *
 * Every condition is a recorded fact:
 *  - the DISCARDING step is a `goto` whose own window loaded a document (a
 *    `req` of resource type `document`) and made no write: a full page load,
 *    which takes every client-side change with it. A hash-only goto inside a
 *    single-page app loads nothing and discards nothing;
 *  - the STRETCH is every step between that goto and the previous page load
 *    (a goto, a back, or any step whose window loaded a document), or the
 *    instruction's start. Each of its gestures carries a journal,
 *    and none of them caused a request of any kind, a navigation, a new page
 *    or a dialog: nothing it did reached the server or left the document;
 *  - the stretch stays on the goto's page: no popup, tab switch or step
 *    recorded on another tab;
 *  - a LATER step of the instruction made a write request: the work was done
 *    by another route, over HTTP. That is also what keeps an app that writes
 *    over a websocket (no `req` for it in the journal) out of this rule, and
 *    an instruction whose whole point was client-side state.
 * Then the stretch's gestures are dropped — reads excepted, as they may
 * publish values the report uses — and the goto is kept (dropSupersededNavigation
 * folds it into the page load before it when nothing is left between them).
 *
 * Over every published n1 recording (303 recordings, 1982 instructions,
 * 2026-10-27) this fires on 14 instructions: gitea pickers abandoned by a
 * reload (fwgt20/24/27/32/33/34/35/37, vgt1n) and openproject link clicks
 * that never navigated before a goto (fwop25/30, vop1v/3v: the fwop15 class
 * abandonedLinkClick also reads). A step
 * that moved only the url (a hash link, a pushState) bounds no stretch, it
 * refuses one: grocy hbgc3 04-edit's row action opened a delete confirm by a
 * `#` link and its "No" closed it, a pair dropDismissedDialogs takes whole.
 *
 * A repeated gesture is not the evidence, and a toggle undone by its twin is
 * not this rule's (collapseTogglePairs): what decides is that the document
 * the gestures changed was replaced before anything was sent. A recording
 * without a journal compiles exactly as before.
 *
 * Returns the kept steps, the same objects (compile matches kept steps
 * against the recording by identity).
 */
import type { RecordedStep } from '../daemon/recorder.js';
import type { JournalEvent } from '../daemon/journal-attribute.js';
import type { TransformNote } from './compile.js';
import { allEvents, caused, isWrite } from './restored-field.js';

/** Kept inside a dropped stretch: a read may publish a value the report uses. */
const KEEP = new Set(['read', 'read_all']);
/** Steps that look and change nothing; they may lack a journal of their own. */
const LOOKS = new Set(['read', 'read_all', 'screenshot', 'eval', 'wait_for']);
/** Events that say a gesture's effect left the document (or may have). */
const LEFT_DOCUMENT = new Set(['req', 'nav', 'page+', 'page-', 'dlg']);

const loadsDocument = (e: JournalEvent): boolean => e.k === 'req' && e.rt === 'document';

export interface DiscardedDetour {
  /** Indices of the dropped gestures. */
  dropped: number[];
  /** Index of the goto that discarded them. */
  load: number;
}

/** The stretches a later page load discarded, by index into `steps`. */
export function discardedDetours(steps: readonly RecordedStep[]): DiscardedDetour[] {
  if (!steps.some((s) => s.journal)) return [];
  const events = allEvents(steps);
  const out: DiscardedDetour[] = [];
  const pageLoad = (s: RecordedStep): boolean =>
    s.tool === 'goto' || s.tool === 'back' || caused(s, events).some(loadsDocument);
  for (let l = 0; l < steps.length; l++) {
    const load = steps[l];
    if (load.tool !== 'goto' || !load.journal) continue;
    const own = caused(load, events);
    if (!own.some((e) => loadsDocument(e) && e.m === 'GET') || own.some(isWrite)) continue;
    // A later write: the work was done another way, over HTTP.
    if (!steps.slice(l + 1).some((s) => caused(s, events).some(isWrite))) continue;
    let from = l - 1;
    while (from >= 0 && !pageLoad(steps[from])) from--;
    const stretch = steps.slice(from + 1, l).map((s, k) => ({ s, k: from + 1 + k }));
    const gestures = stretch.filter(({ s }) => !LOOKS.has(s.tool));
    if (!gestures.length) continue;
    if (gestures.some(({ s }) => !s.journal || caused(s, events).some((e) => LEFT_DOCUMENT.has(e.k)))) continue;
    // One page throughout: a tab switch, a popup or a step on another tab is
    // not a document this goto replaced.
    const pageOf = (s: RecordedStep) => s.page ?? 0;
    if (stretch.some(({ s }) => s.effect || pageOf(s) !== pageOf(load) || (s.tool === 'tabs' && s.args.switch_to !== undefined))) continue;
    // No write at all while the stretch ran, whoever the journal blamed it on
    // (an eval that posted, a request it could not attribute).
    const heard = (s: RecordedStep) => [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])];
    if ([...stretch.map(({ s }) => s), load].some((s) => heard(s).some(isWrite) || caused(s, events).some(isWrite))) continue;
    // ...and no url change a diff saw (a pushState the journal may not name).
    const urls = new Set([...(from >= 0 ? [steps[from]] : []), ...stretch.map(({ s }) => s)].map((s) => s.diff?.url).filter((u): u is string => Boolean(u)));
    if (urls.size > 1) continue;
    out.push({ dropped: stretch.filter(({ s }) => !KEEP.has(s.tool)).map(({ k }) => k), load: l });
  }
  return out;
}

export function dropDiscardedDetours<T extends RecordedStep>(steps: readonly T[], notes?: TransformNote[]): T[] {
  const detours = discardedDetours(steps);
  /** A step as the recording numbers it (its seq), else its place here. */
  const name = (k: number) => `${steps[k].tool} #${steps[k].seq ?? k + 1}`;
  for (const d of detours) {
    const gestures = d.dropped.filter((k) => !LOOKS.has(steps[k].tool));
    notes?.push({
      name: 'dropDiscardedDetours',
      at: d.dropped[0] + 1,
      reason: `${gestures.map(name).join(', ')}: nothing they did reached the server (no request in the journal) before ${name(d.load)} loaded a fresh document, and a later step wrote the work another way`,
    });
  }
  const dropped = new Set(detours.flatMap((d) => d.dropped));
  return dropped.size ? steps.filter((_, k) => !dropped.has(k)) : [...steps];
}
