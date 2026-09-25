/**
 * The SHADOW report (design-recorder-evidence §3, §7.4): for each compile-time
 * heuristic that guesses the recording model's intent, the verdict the
 * recorder journal's FACTS give (daemon/journal.ts), beside what the heuristic
 * decided. Written to `shadow.jsonl` next to the skill store; read by nothing
 * that replays, compiles or exports. A recording with no journal (every store
 * before phase C, or SITELOOPER_JOURNAL=0) produces no rows.
 *
 * A row's `agree` says whether the fact and the heuristic lead to the same
 * procedure. Every disagreement is a case to read before any rule switches
 * from shadow to deciding.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { RecordedEntry, RecordedStep } from '../daemon/recorder.js';
import type { JournalEvent } from '../daemon/journal-attribute.js';
import type { LocatorCandidate } from '../daemon/recorder.js';
import type { Skill, SkillStep } from './store.js';
import { collapseTogglePairs, dropSupersededSets } from './toggles.js';
import { creditUncreditedPopups } from './compile.js';
import { keyPicks } from './key-pick.js';

export interface ShadowRow {
  /** The heuristic (or round-61 question) this row shadows. */
  rule: string;
  /** The recorded step it is about: its journal window and its seq, when stamped. */
  w?: number;
  seq?: number;
  /** What the step was: tool and target, short. */
  step?: string;
  /** The fact-based verdict. */
  fact: string;
  /** What the heuristic (the compiled procedure) did. */
  heuristic: string;
  agree: boolean;
  /** The events the fact rests on, short. */
  evidence?: string[];
}

/** The steps of an instruction's entries that the recording did (failed steps are never in `entries`). */
function stepsOf(entries: readonly RecordedEntry[]): RecordedStep[] {
  return entries.filter((e): e is RecordedStep => e.k === 'step');
}

/** Whether any step carries journal evidence: without it, the shadow has nothing to say. */
export function hasJournal(entries: readonly RecordedEntry[]): boolean {
  return stepsOf(entries).some((s) => s.journal !== undefined);
}

/** Every journal event of the instruction, each once, in time order. */
export function eventsOf(steps: readonly RecordedStep[]): JournalEvent[] {
  const out: JournalEvent[] = [];
  for (const s of steps) out.push(...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? []));
  return out.sort((a, b) => a.t - b.t);
}

/** A step's dispatch time (stage 0 evidence), for spans between steps. */
function dispatchOf(s: RecordedStep): number | undefined {
  return s.obs?.at.d;
}

const SET_TOOLS = new Set(['fill', 'type', 'select', 'check']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function label(s: RecordedStep): string {
  const target = typeof s.args.target === 'string' ? s.args.target : typeof s.args.url === 'string' ? s.args.url : '';
  return `${s.tool} ${target}`.slice(0, 100);
}

/** The first candidate of a chain, as identity for matching a recorded step to a compiled one. */
function primaryKey(chain: readonly LocatorCandidate[] | undefined): string | null {
  const c = chain?.find((x) => x.kind !== 'point');
  return c ? JSON.stringify(c) : null;
}

/** A chain's non-point candidates, as identities. */
function candidateKeys(chain: readonly LocatorCandidate[] | undefined): Set<string> {
  return new Set((chain ?? []).filter((c) => c.kind !== 'point').map((c) => JSON.stringify(c)));
}

/**
 * Compiled steps that are this recorded step: same tool, and a locator
 * candidate in common (compile reorders and prunes a chain, so the first
 * candidate alone is not an identity).
 */
function compiledMatches(step: RecordedStep, skills: readonly Skill[]): SkillStep[] {
  const mine = candidateKeys(step.locators.target?.chain);
  const out: SkillStep[] = [];
  const walk = (list: readonly SkillStep[]) => {
    for (const s of list) {
      if (s.tool === step.tool && mine.size && [...candidateKeys(s.locators.target)].some((k) => mine.has(k))) out.push(s);
      const nested = (s as { steps?: SkillStep[] }).steps;
      if (Array.isArray(nested)) walk(nested);
    }
  };
  for (const sk of skills) walk(sk.steps);
  return out;
}

function short(e: JournalEvent): string {
  const c = e.c ? `${e.c.join(':')}` : '';
  const what = e.k === 'req' ? `${String(e.m)} ${String(e.e).replace(/^https?:\/\/[^/]+/, '')}${e.carries ? ` carries[${(e.carries as number[]).join(',')}]` : ''}` : String(e.d ?? e.f ?? e.url ?? e.x ?? '');
  return `${e.k} ${what} (${c})`.slice(0, 140);
}

/**
 * (b) An edit abandoned before a navigation (grafana fwgr73 04-open): a set
 * (fill, type, select, check) followed, in the same instruction, by a goto or
 * back, with NO write request between them and none carrying its value. Fact:
 * abandoned. The heuristics keep such an edit unless the same value is set
 * again after a reload (dropSupersededSets), so a compiled procedure that
 * still holds it disagrees.
 */
export function abandonedEdits(steps: readonly RecordedStep[], skills: readonly Skill[]): ShadowRow[] {
  const events = eventsOf(steps);
  const rows: ShadowRow[] = [];
  for (let i = 0; i < steps.length; i++) {
    const edit = steps[i];
    if (!SET_TOOLS.has(edit.tool) || !edit.journal) continue;
    const j = steps.findIndex((s, k) => k > i && (s.tool === 'goto' || s.tool === 'back'));
    if (j < 0) continue;
    const leave = steps[j];
    const from = dispatchOf(edit);
    const to = dispatchOf(leave);
    if (from === undefined || to === undefined || !leave.journal) continue;
    const w = edit.journal.w;
    const between = events.filter((e) => e.k === 'req' && e.t >= from && e.t < to);
    const carrying = between.filter((e) => Array.isArray(e.carries) && (e.carries as number[]).includes(w));
    // Any write that is not the app polling counts as a save, whoever it is
    // attributed to: vikunja fwvk13 #64's Confirm saved the date by a POST that
    // left 139 ms after the click's window closed (filed app:timer before the
    // write-debounce rule), and the edit before it was not abandoned.
    const writes = between.filter((e) => WRITE_METHODS.has(String(e.m)) && !(e.c?.[0] === 'app' && e.c[1] === 'poll'));
    const fact = carrying.length || writes.length ? 'saved' : 'abandoned';
    const kept = compiledMatches(edit, skills).length > 0;
    rows.push({
      rule: 'abandonedEdit',
      w,
      ...(edit.seq !== undefined ? { seq: edit.seq } : {}),
      step: label(edit),
      fact: fact === 'abandoned' ? `abandoned: no write request between it and ${label(leave)}` : `saved (${carrying.length ? 'a request carried its value' : 'a write request followed'})`,
      heuristic: kept ? 'kept in the procedure' : 'dropped from the procedure',
      agree: fact === 'abandoned' ? !kept : kept,
      evidence: [...carrying, ...writes].slice(0, 4).map(short),
    });
  }
  return rows;
}

/**
 * Whether the compiled procedure keeps THIS occurrence of a recorded step.
 * Compiled steps are matched to recorded ones by tool and primary locator;
 * when compile kept fewer than were recorded, the earliest are taken as the
 * dropped ones (the supersede and repeat rules drop the earlier attempt).
 */
function keptOccurrence(step: RecordedStep, steps: readonly RecordedStep[], skills: readonly Skill[]): { kept: boolean; compiled?: SkillStep } {
  const mine = candidateKeys(step.locators.target?.chain);
  if (!mine.size) return { kept: true };
  const same = steps.filter((s) => s.tool === step.tool && [...candidateKeys(s.locators.target?.chain)].some((k) => mine.has(k)));
  const compiled = compiledMatches(step, skills);
  const idx = same.indexOf(step);
  const dropped = Math.max(0, same.length - compiled.length);
  const kept = idx >= dropped;
  return { kept, ...(kept ? { compiled: compiled[idx - dropped] } : {}) };
}

/** The recorded step whose journal window is w. */
function stepOfWindow(steps: readonly RecordedStep[], w: number | undefined): RecordedStep | undefined {
  return w === undefined ? undefined : steps.find((s) => s.journal?.w === w);
}

/** The window a cause names. */
function causeWindowOf(e: JournalEvent): number | undefined {
  const c = e.c;
  return c && (c[0] === 'in' || c[0] === 'late' || c[0] === 'undo' || c[0] === 'daemon') ? (c[1] as number) : undefined;
}

/** The events a step caused: in its window, or late from it (wherever they were filed). */
function causedBy(step: RecordedStep, events: readonly JournalEvent[]): JournalEvent[] {
  const w = step.journal?.w;
  if (w === undefined) return [];
  return events.filter((e) => (e.c?.[0] === 'in' || e.c?.[0] === 'late') && e.c[1] === w);
}

const OBSERVE_TOOLS = new Set(['read', 'read_all', 'wait_for', 'screenshot']);
const observesOnly = (s: RecordedStep) => OBSERVE_TOOLS.has(s.tool) || (s.tool === 'tabs' && typeof s.args.switch_to !== 'number');
const optionName = (d: unknown) =>
  String(d ?? '')
    .replace(/^[\w-]+ "(.*)"$/, '$1')
    .replace(/^[✓✔☑\s]+/, '')
    .trim();

/** A tick: an option's own checked/selected state changed, with a known direction. */
const TICK_ATTRS = new Set(['class', 'aria-checked', 'checked']);
const POPUP_D = /^(listbox|menu|menubar|dialog|alertdialog|tree|grid) "/;

/**
 * (a) Each picker's recorded net option state (gitea fwgt12 03-set, fwgt13
 * 02-create), one row per picker.
 *
 * Ticks are option state changes with a direction: a checked class, native
 * `checked`, aria-checked. aria-selected is not a tick: it moves with the
 * highlight (grafana fwgr74's search list, openproject fwop16's tabs). Each
 * tick belongs to the picker that was showing when it happened: the latest
 * popup shown before it and not hidden since. A tick with no picker showing
 * is not a picker's and is not counted.
 *
 * A picker's state is COMMITTED by the next write request after a tick: right
 * after it closes (a picker that commits on close) or later (a form submitted
 * with it: gitea's Create Issue). A goto or back before any commit throws the
 * uncommitted ticks away. The row compares that with the state the compiled
 * procedure's kept ticking steps produce, and says how many ticks were made by
 * a key press: those the procedure repeats by POSITION (see the keyPick rule).
 */
export function pickerNetState(steps: readonly RecordedStep[], skills: readonly Skill[], prior: readonly RecordedStep[] = []): ShadowRow[] {
  // A dead instruction just before (gitea fwgt11/fwgt12: blocked, then resumed)
  // ticked the same picker: its ticks and commits are part of the recorded
  // state, though its steps are not this procedure's unless carried in.
  const all = [...prior, ...steps];
  const events = [...new Set([...eventsOf(prior), ...eventsOf(steps)])].sort((a, b) => a.t - b.t);
  const ticks = events.filter((e) => e.k === 'state' && typeof e.on === 'boolean' && TICK_ATTRS.has(String(e.a)) && !/^tab "/.test(String(e.d)));
  if (!ticks.length) return [];
  const shows = events.filter((e) => e.k === 'show' && POPUP_D.test(String(e.d)));
  const hides = events.filter((e) => e.k === 'hide' && POPUP_D.test(String(e.d)));
  /** The picker showing at t: the latest popup shown before t and not hidden since. */
  const pickerAt = (t: number): JournalEvent | undefined =>
    [...shows].reverse().find((sh) => sh.t <= t && !hides.some((h) => h.lm === sh.lm && h.t > sh.t && h.t <= t));
  const groups = new Map<string, { picker: JournalEvent; ticks: JournalEvent[] }>();
  for (const t of ticks) {
    const p = pickerAt(t.t);
    if (!p) continue;
    const key = `${String(p.d)}#${String(p.fr ?? '')}`;
    const g = groups.get(key) ?? { picker: p, ticks: [] };
    g.ticks.push(t);
    groups.set(key, g);
  }
  const resets = all.filter((s) => (s.tool === 'goto' || s.tool === 'back') && dispatchOf(s) !== undefined).map((s) => dispatchOf(s)!);
  const writes = events.filter((r) => r.k === 'req' && WRITE_METHODS.has(String(r.m)) && !(r.c?.[0] === 'app' && r.c[1] === 'poll'));
  const selected = (m: Map<string, boolean>) =>
    [...m]
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
  const rows: ShadowRow[] = [];
  for (const { picker, ticks: gt } of groups.values()) {
    const initial = new Map<string, boolean>();
    for (const t of gt) if (!initial.has(optionName(t.d))) initial.set(optionName(t.d), !t.on);
    let current = new Map(initial);
    let committed = new Map(initial);
    let dirty = false;
    const commits: string[] = [];
    const pickerHides = hides.filter((h) => h.d === picker.d);
    const timeline = [
      ...gt.map((e) => ({ t: e.t, k: 'tick' as const, e: e as JournalEvent | null })),
      ...pickerHides.map((e) => ({ t: e.t, k: 'close' as const, e: e as JournalEvent | null })),
      ...writes.map((e) => ({ t: e.t, k: 'write' as const, e: e as JournalEvent | null })),
      ...resets.map((t) => ({ t, k: 'reset' as const, e: null as JournalEvent | null })),
    ].sort((a, b) => a.t - b.t);
    let closedAt = -Infinity;
    for (const x of timeline) {
      if (x.k === 'tick') {
        current.set(optionName(x.e!.d), x.e!.on as boolean);
        dirty = true;
      } else if (x.k === 'close') closedAt = x.t;
      else if (x.k === 'write' && dirty) {
        committed = new Map(current);
        dirty = false;
        commits.push(`{${selected(committed).join(', ')}} ${x.t - closedAt <= 1_500 ? 'when it closed' : 'with the form'} (#${causeWindowOf(x.e!) ?? '?'})`);
      } else if (x.k === 'reset' && dirty) {
        current = new Map(committed);
        dirty = false;
      }
    }
    const byKey = gt.filter((t) => stepOfWindow(all, causeWindowOf(t))?.tool === 'press');
    const proc = new Map(initial);
    for (const t of gt) {
      const step = t.c?.[0] === 'in' ? stepOfWindow(steps, t.c[1] as number) : undefined;
      if (step && keptOccurrence(step, steps, skills).kept) proc.set(optionName(t.d), t.on as boolean);
    }
    const fact = selected(dirty ? current : committed);
    const procedure = selected(proc);
    rows.push({
      rule: 'pickerNetState',
      step: String(picker.d).slice(0, 80),
      fact: `net selected: [${fact.join(', ')}]${dirty ? ' (not committed by any write)' : ''}; commits: ${commits.join(' then ') || 'none'}${byKey.length ? `; ${byKey.length} tick(s) made by a key press (positional in the procedure)` : ''}`,
      heuristic: `the procedure's kept ticks give [${procedure.join(', ')}]`,
      agree: JSON.stringify(fact) === JSON.stringify(procedure),
      evidence: gt.slice(0, 8).map(short),
    });
  }
  return rows;
}

/**
 * (c) What caused a flash a step's expectation rests on (vikunja fwvk12
 * 02-create #23): for each line the step's diff added whose text a journal
 * `txt`/`show` event carries, whether that event was the step's own (in its
 * window, nothing else answering), ambiguous (in its window, but another
 * request's answer landed with it), or another source's. An expectation built
 * on a change the step did not cause stops a replay that does the step right;
 * the heuristic side is whether the compiled step still expects it.
 */
export function flashCause(steps: readonly RecordedStep[], skills: readonly Skill[]): ShadowRow[] {
  // Flashes: text changes of headings and live regions, and live regions appearing — not a picker opening.
  const events = eventsOf(steps).filter((e) => e.k === 'txt' || (e.k === 'show' && /^(status|alert|log|tooltip) /.test(String(e.d))));
  const rows: ShadowRow[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const w = s.journal?.w;
    const added = s.diff?.added ?? [];
    if (w === undefined || !added.length) continue;
    const prev = i > 0 ? steps[i - 1] : undefined;
    const prevEnd = prev ? (prev.obs?.at.c ?? prev.obs?.at.s ?? dispatchOf(prev) ?? -Infinity) : -Infinity;
    const end = s.obs?.at.c ?? s.obs?.at.s ?? Infinity;
    for (const line of added) {
      const shows = (e: JournalEvent) => {
        const text = e.k === 'txt' ? String(e.x ?? '') : optionName(e.d);
        return text.length >= 3 && line.includes(text);
      };
      // The step's own event first, wherever it was filed; only then another
      // source's in the span (vikunja fwvk13 #31: an earlier unknown flash was
      // taken over the Save's own, which its POST explains).
      const hit =
        events.find((e) => e.c?.[0] === 'in' && e.c[1] === w && shows(e)) ??
        events.find((e) => e.t >= prevEnd - 50 && e.t <= end + 50 && shows(e));
      if (!hit) continue;
      const own = hit.c?.[0] === 'in' && hit.c[1] === w;
      const verdict = own && hit.also === undefined ? 'own' : own ? 'ambiguous' : 'foreign';
      const text = hit.k === 'txt' ? String(hit.x) : optionName(hit.d);
      const occ = keptOccurrence(s, steps, skills);
      const expects = Boolean(occ.compiled?.expect?.addedContains?.some((l) => l.includes(text) || l === line));
      const other = hit.also === 0 ? "the app's own request" : `window ${String(hit.also)}`;
      rows.push({
        rule: 'flashCause',
        w,
        ...(s.seq !== undefined ? { seq: s.seq } : {}),
        step: label(s),
        fact:
          verdict === 'own'
            ? `${JSON.stringify(line)} was this step's own change`
            : verdict === 'ambiguous'
              ? `${JSON.stringify(line)} landed in this step's window together with an answer it did not ask for (${other}): ambiguous`
              : `${JSON.stringify(line)} was not this step's (${hit.c?.join(':') ?? 'unknown'})`,
        heuristic: !occ.kept ? 'step dropped from the procedure' : expects ? 'the compiled step expects it' : 'the compiled step does not expect it',
        agree: verdict === 'own' || !occ.kept || !expects,
        evidence: [short(hit)],
      });
    }
  }
  return rows;
}

/**
 * A click repeated with only observations between (abandonedRepeatClick,
 * repeatOf; ghost fwgh12, espocrm fwec5): what the FIRST press did, from the
 * journal. `effective` (it changed something, in its window or late),
 * `ignored` (it landed on its target and nothing followed), `covered` (it
 * landed on something else). Beside: whether compile dropped a press, and
 * whether the kept one presses again when the first has no effect.
 */
export function repeatClicks(steps: readonly RecordedStep[], skills: readonly Skill[]): ShadowRow[] {
  const events = eventsOf(steps);
  const rows: ShadowRow[] = [];
  for (let i = 0; i < steps.length; i++) {
    const first = steps[i];
    if (!first.journal || !['click', 'dblclick'].includes(first.tool)) continue;
    const key = primaryKey(first.locators.target?.chain);
    if (key === null) continue;
    let j = i + 1;
    while (j < steps.length && observesOnly(steps[j])) j++;
    const again = steps[j];
    if (!again || again.tool !== first.tool || primaryKey(again.locators.target?.chain) !== key) continue;
    const mine = causedBy(first, events);
    const effects = mine.filter((e) => e.k !== 'foc' && e.k !== 'hit');
    const hits = mine.filter((e) => e.k === 'hit');
    const fact = effects.length ? 'effective' : hits.some((e) => e.on === 0) ? 'covered' : hits.some((e) => e.on === 1) ? 'ignored' : 'unknown';
    if (fact === 'unknown') continue;
    const compiled = compiledMatches(first, skills);
    const recorded = steps.filter((s) => s.tool === first.tool && primaryKey(s.locators.target?.chain) === key).length;
    const dropped = compiled.length < recorded;
    const repeat = compiled.some((c) => c.repeatIfNoEffect);
    rows.push({
      rule: 'repeatClick',
      w: first.journal.w,
      ...(first.seq !== undefined ? { seq: first.seq } : {}),
      step: label(first),
      fact:
        fact === 'effective'
          ? 'the first press had an effect'
          : fact === 'covered'
            ? `the first press landed on ${String(hits.find((e) => e.on === 0)?.cover ?? 'something else')}`
            : 'the first press reached its target and nothing followed (the app ignored it)',
      heuristic: dropped ? `one press dropped${repeat ? ', the kept one presses again if nothing happens' : ''}` : 'both presses kept',
      agree: fact === 'ignored' ? dropped && repeat : !dropped,
      evidence: [...effects, ...hits].slice(0, 4).map(short),
    });
  }
  return rows;
}

/**
 * A click whose whole effect was hiding something (entryPopupHides,
 * markRequiredRemovals; snipe-it fwsi10 #36): the journal says what showed the
 * hidden landmark. Shown by an entry (a fill/type/press, or right after focus
 * moved into a field): a dismissal a replay may skip, NOT required. Shown by
 * another gesture of the procedure (an opener click): required. Beside: the
 * compiled step's `removalRequired`.
 */
export function hideRequired(steps: readonly RecordedStep[], skills: readonly Skill[]): ShadowRow[] {
  const events = eventsOf(steps);
  const rows: ShadowRow[] = [];
  for (const s of steps) {
    if (!s.journal || s.tool !== 'click') continue;
    // Only a click compile itself would treat as a hide: its recorded diff
    // added nothing (grafana fwgr74 #41/#81 added lines; their hides were
    // incidental live regions), and it did nothing else (no request, value,
    // show, navigation or tick).
    if (!s.diff || s.diff.added.length) continue;
    const mine = causedBy(s, events).filter((e) => e.k !== 'foc' && e.k !== 'hit');
    const hides = mine.filter((e) => e.k === 'hide' && POPUP_D.test(String(e.d)));
    if (!hides.length || mine.some((e) => e.k === 'req' || e.k === 'val' || e.k === 'show' || e.k === 'nav' || (e.k === 'state' && e.a !== 'aria-expanded'))) continue;
    // The LATEST show of each hidden landmark before the hide (gitea fwgt13
    // #39: the re-open at #34, not the first opening at #26), and only a show
    // IN its step's own window, by a step that did not navigate (openproject
    // fwop16 #7: the login's navigation showed the onboarding dialog as a side
    // effect; the login click is not its opener).
    const shows = hides.map((h) => [...events].reverse().find((e) => e.k === 'show' && e.lm === h.lm && e.t <= h.t));
    const show = shows.find((e) => e && e.c?.[0] === 'in' && stepOfWindow(steps, causeWindowOf(e)));
    const shower = show ? stepOfWindow(steps, causeWindowOf(show)) : undefined;
    if (!show || !shower) continue;
    if (causedBy(shower, events).some((e) => e.k === 'nav' || (e.k === 'req' && e.rt === 'document'))) continue;
    const focused = events.some((e) => e.k === 'foc' && e.dir === 'in' && e.t <= show.t && show.t - e.t <= 300 && causeWindowOf(e) === causeWindowOf(show));
    const byEntry = ['fill', 'type', 'press'].includes(shower.tool) || (focused && shower.tool !== 'click');
    const occ = keptOccurrence(s, steps, skills);
    const required = Boolean(occ.compiled?.expect?.removalRequired);
    rows.push({
      rule: 'hideRequired',
      w: s.journal.w,
      ...(s.seq !== undefined ? { seq: s.seq } : {}),
      step: label(s),
      fact: byEntry ? `it only closed what the entry ${label(shower)} opened: not required` : `it closed what ${label(shower)} opened: required`,
      heuristic: !occ.kept ? 'dropped from the procedure' : required ? 'compiled as a required removal' : 'compiled as a skippable hide',
      agree: !occ.kept ? byEntry : required === !byEntry,
      evidence: [...hides, show].slice(0, 3).map(short),
    });
  }
  return rows;
}

/**
 * Two sets of the same field (dropSupersededSets, both arms; odoo fwod81,
 * gitea fwgt6): from the value journal, whether the first set's value was
 * replaced before any request carried it (dead) or not (live). Beside:
 * whether dropSupersededSets dropped it.
 */
export function supersededSets(steps: readonly RecordedStep[]): ShadowRow[] {
  const events = eventsOf(steps);
  const kept = new Set(dropSupersededSets(steps));
  const rows: ShadowRow[] = [];
  const fieldOf = (s: RecordedStep) => causedBy(s, events).find((e) => e.k === 'val')?.f;
  for (let i = 0; i < steps.length; i++) {
    const a = steps[i];
    if (!a.journal || !['fill', 'type'].includes(a.tool)) continue;
    const f = fieldOf(a);
    if (f === undefined) continue;
    const j = steps.findIndex((s, k) => k > i && ['fill', 'type'].includes(s.tool) && fieldOf(s) === f);
    if (j < 0) continue;
    const b = steps[j];
    const carried = events.some((e) => e.k === 'req' && Array.isArray(e.carries) && (e.carries as number[]).includes(a.journal!.w));
    const shown = causedBy(a, events).filter((e) => e.k === 'show');
    const dead = !carried;
    const dropped = !kept.has(a);
    // The same value set again (a password refilled after a failed submit, or
    // after the login page reloaded: grafana fwgr74 #3, vikunja fwvk13 #4):
    // keeping or dropping the first gives the same procedure.
    if (a.args.value !== undefined && a.args.value === b.args.value) {
      rows.push({ rule: 'supersededSet', w: a.journal.w, ...(a.seq !== undefined ? { seq: a.seq } : {}), step: label(a), fact: `the same value was set again by ${label(b)}: either set gives the same field`, heuristic: dropped ? 'dropped as superseded' : 'kept', agree: true });
      continue;
    }
    rows.push({
      rule: 'supersededSet',
      w: a.journal.w,
      ...(a.seq !== undefined ? { seq: a.seq } : {}),
      step: label(a),
      fact: dead ? `its value was replaced by ${label(b)} before any request carried it${shown.length ? ' (it did open something meanwhile)' : ''}` : 'a request carried its value: it mattered',
      heuristic: dropped ? 'dropped as superseded' : 'kept',
      agree: dead === dropped,
      evidence: shown.slice(0, 3).map(short),
    });
  }
  return rows;
}

/**
 * Which step opened each tab (creditUncreditedPopups; ghost fwgh6's late tab,
 * fwgh8's eval-opened one, snipe-it fwsi9's opener-less one). Fact: the
 * window a `page+` event is attributed to (in it, or the last gesture before
 * it). Beside: the popup effect the recording or the heuristic credits.
 */
export function popupCredit(steps: readonly RecordedStep[]): ShadowRow[] {
  const events = eventsOf(steps).filter((e) => e.k === 'page+');
  if (!events.length) return [];
  const credited = creditUncreditedPopups(steps);
  const creditedW = new Set(credited.filter((s) => s.effect?.kind === 'popup' && s.journal).map((s) => s.journal!.w));
  const rows: ShadowRow[] = [];
  const factW = new Set<number>();
  for (const e of events) {
    const opener = stepOfWindow(steps, causeWindowOf(e));
    if (opener?.journal) factW.add(opener.journal.w);
    rows.push({
      rule: 'popupCredit',
      ...(opener?.journal ? { w: opener.journal.w } : {}),
      ...(opener?.seq !== undefined ? { seq: opener.seq } : {}),
      ...(opener ? { step: label(opener) } : {}),
      fact: opener ? `${label(opener)} opened the tab ${String(e.url ?? '')} (${e.c?.join(':')}${e.op === null ? ', no opener' : ''})` : `a tab opened that no step explains (${e.c?.join(':') ?? 'unknown'})`,
      heuristic: opener ? (creditedW.has(opener.journal!.w) ? 'credited with a popup' : opener.tool === 'eval' ? 'an eval: dropped with its page' : 'not credited') : `credited to ${[...creditedW].map((w) => `#${w}`).join(', ') || 'nothing'}`,
      agree: opener ? creditedW.has(opener.journal!.w) || opener.tool === 'eval' : creditedW.size === 0,
      evidence: [short(e)],
    });
  }
  for (const w of creditedW) {
    if (factW.has(w)) continue;
    const s = stepOfWindow(steps, w)!;
    rows.push({ rule: 'popupCredit', w, ...(s.seq !== undefined ? { seq: s.seq } : {}), step: label(s), fact: 'no tab was opened by this step', heuristic: 'credited with a popup', agree: false });
  }
  return rows;
}

/**
 * A link click that recorded no consequence (abandonedLinkClick,
 * observesOnly; openproject fwop6, fwop13): whether the click did start its
 * navigation (a document request or url change it caused, in its window or
 * late) or was inert. Beside: whether compile dropped it.
 */
export function linkClicks(steps: readonly RecordedStep[], skills: readonly Skill[]): ShadowRow[] {
  const events = eventsOf(steps);
  const rows: ShadowRow[] = [];
  for (const s of steps) {
    if (!s.journal || s.tool !== 'click') continue;
    const isLink = (s.locators.target?.chain ?? []).some((c) => (c.kind === 'role' && c.role === 'link') || (c.kind === 'point' && c.tag === 'a'));
    const quiet = s.diff && !s.diff.added.length && !(s.diff.removed ?? []).length;
    if (!isLink || !quiet) continue;
    const mine = causedBy(s, events);
    const went = mine.filter((e) => e.k === 'nav' || (e.k === 'req' && e.rt === 'document'));
    // Anything else the click did makes it not inert either: gitea fwgt13
    // #27/#29's option links prevent their navigation and toggle the option.
    const did = mine.filter((e) => e.k === 'state' || e.k === 'show' || e.k === 'hide' || e.k === 'val' || e.k === 'txt' || e.k === 'req');
    const effective = went.length > 0 || did.length > 0;
    const occ = keptOccurrence(s, steps, skills);
    rows.push({
      rule: 'linkClick',
      w: s.journal.w,
      ...(s.seq !== undefined ? { seq: s.seq } : {}),
      step: label(s),
      fact: went.length
        ? `it navigated (${went.map((e) => e.c?.join(':')).join(', ')})`
        : did.length
          ? `it did not navigate, but changed the page (${[...new Set(did.map((e) => e.k))].join(', ')})`
          : 'inert: no request, no url change and no change of its own followed it',
      heuristic: occ.kept ? 'kept' : 'dropped as an abandoned link click',
      agree: effective ? occ.kept : !occ.kept,
      evidence: [...went, ...did].slice(0, 3).map(short),
    });
  }
  return rows;
}

/**
 * Two clicks on one control that toggle something back (collapseTogglePairs;
 * snipe-it fwsi1, grafana fwgr69): from aria-expanded, or a landmark the first
 * hid and the second showed again. Fact: a toggle pair (the first undone by
 * the second). Beside: whether collapseTogglePairs collapsed them.
 */
export function togglePairs(steps: readonly RecordedStep[]): ShadowRow[] {
  const events = eventsOf(steps);
  const collapsed = collapseTogglePairs(steps);
  const rows: ShadowRow[] = [];
  for (let i = 0; i + 1 < steps.length; i++) {
    const a = steps[i];
    if (!a.journal || a.tool !== 'click') continue;
    let j = i + 1;
    while (j < steps.length && observesOnly(steps[j])) j++;
    const b = steps[j];
    if (!b?.journal || b.tool !== 'click') continue;
    const mine = candidateKeys(a.locators.target?.chain);
    if (![...candidateKeys(b.locators.target?.chain)].some((k) => mine.has(k))) continue;
    const ea = causedBy(a, events);
    const eb = causedBy(b, events);
    const expandedA = ea.find((e) => e.k === 'state' && e.a === 'aria-expanded');
    const expandedB = eb.find((e) => e.k === 'state' && e.a === 'aria-expanded');
    const hidA = ea.filter((e) => e.k === 'hide').map((e) => e.lm);
    const reshown = eb.some((e) => e.k === 'show' && hidA.includes(e.lm));
    const undone = (expandedA && expandedB && expandedA.on !== expandedB.on) || reshown;
    if (!undone) continue;
    const dropped = !collapsed.includes(a);
    const marked = collapsed.find((s) => s.journal?.w === b.journal!.w)?.toggle === true;
    rows.push({
      rule: 'togglePair',
      w: a.journal.w,
      ...(a.seq !== undefined ? { seq: a.seq } : {}),
      step: label(a),
      fact: `${label(b)} undid it (${expandedA ? `aria-expanded ${String(expandedA.on)} then ${String(expandedB?.on)}` : 'what it hid was shown again'}): a toggle pair`,
      heuristic: dropped && marked ? 'collapsed into one idempotent toggle' : 'both clicks kept as they are',
      agree: dropped && marked,
      evidence: [...ea, ...eb].filter((e) => e.k === 'state' || e.k === 'show' || e.k === 'hide').slice(0, 4).map(short),
    });
  }
  return rows;
}

/**
 * A key press that picked an option (gitea fwgt13 02-create: ArrowDown ×k +
 * Enter for every label, the milestone and the assignee). Fact: the option it
 * picked, by name (key-pick.ts). Beside: whether the compiled procedure picks
 * it BY NAME (a kept step names the option) or BY POSITION (it replays the
 * same key presses, which pick whatever the highlight reaches: fwgt13's
 * replays ticked enhancement, admin and Backlog). Position disagrees.
 */
export function keyPick(steps: readonly RecordedStep[], skills: readonly Skill[]): ShadowRow[] {
  const picks = keyPicks(steps);
  if (!picks.size) return [];
  const compiled: SkillStep[] = [];
  const walk = (list: readonly SkillStep[]) => {
    for (const s of list) {
      compiled.push(s);
      const nested = (s as { steps?: SkillStep[] }).steps;
      if (Array.isArray(nested)) walk(nested);
    }
  };
  for (const sk of skills) walk(sk.steps);
  /** The compiled presses of one key, in order, beside the recorded ones: the earliest are the dropped ones. */
  const pressesOf = (key: string, list: readonly { tool: string; args: Record<string, unknown> }[]) => list.filter((s) => s.tool === 'press' && (s.args.key ?? s.args.text) === key);
  const rows: ShadowRow[] = [];
  for (const [i, p] of picks) {
    const s = steps[i];
    const recorded = pressesOf(p.key, steps);
    const kept = pressesOf(p.key, compiled);
    const occurrence = recorded.indexOf(s) - Math.max(0, recorded.length - kept.length);
    const byPosition = occurrence >= 0 && occurrence < kept.length;
    const named = compiled.some((c) => c.tool !== 'press' && JSON.stringify([c.args, c.locators]).includes(JSON.stringify(p.option).slice(1, -1)));
    // A press the procedure still makes picks by position, whatever else names
    // the option (gitea fwgt13's labels are named elsewhere by their own clicks).
    const how = byPosition ? 'by position' : named ? 'by name' : 'not at all';
    rows.push({
      rule: 'keyPick',
      ...(s.journal ? { w: s.journal.w } : {}),
      ...(s.seq !== undefined ? { seq: s.seq } : {}),
      step: label(s) + ` ${p.key}`,
      fact: `${p.key} ${p.kind === 'toggle' ? `${p.on ? 'picked' : 'unpicked'}` : 'picked the highlighted'} ${JSON.stringify(p.option)}`,
      heuristic: `the procedure picks it ${how}`,
      agree: !byPosition && named,
      evidence: [p.described],
    });
  }
  return rows;
}

/**
 * The instructions just before this one that did not succeed (back to the
 * last successful report): their page effects are part of what this one
 * started from.
 */
function deadBefore(before: readonly RecordedEntry[]): RecordedStep[] {
  let from = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const e = before[i];
    if (e.k === 'report' && e.status === 'success') {
      from = i + 1;
      break;
    }
  }
  return stepsOf(before.slice(from));
}

/** Every shadow rule over one compiled instruction. Never throws. */
export function shadowVerdicts(entries: readonly RecordedEntry[], skills: readonly Skill[], before: readonly RecordedEntry[] = []): ShadowRow[] {
  if (!hasJournal(entries)) return [];
  const steps = stepsOf(entries);
  const prior = deadBefore(before);
  const rows: ShadowRow[] = [];
  for (const rule of RULES) {
    try {
      rows.push(...rule(steps, skills, prior));
    } catch {
      // a shadow rule never breaks the compile it shadows
    }
  }
  return rows;
}

type ShadowRule = (steps: readonly RecordedStep[], skills: readonly Skill[], prior: readonly RecordedStep[]) => ShadowRow[];

const RULES: ShadowRule[] = [abandonedEdits, pickerNetState, flashCause, repeatClicks, hideRequired, supersededSets, popupCredit, linkClicks, togglePairs, keyPick];

/**
 * Append one instruction's rows to `<storeDir>/shadow.jsonl`. Best effort: a
 * shadow report that cannot be written changes nothing.
 */
export function writeShadow(storeDir: string, ctx: { session: string; instruction: string }, rows: readonly ShadowRow[]): void {
  if (!rows.length) return;
  try {
    fs.mkdirSync(storeDir, { recursive: true });
    const head = { session: ctx.session, instruction: ctx.instruction.slice(0, 120), at: new Date().toISOString() };
    fs.appendFileSync(path.join(storeDir, 'shadow.jsonl'), rows.map((r) => JSON.stringify({ ...head, ...r })).join('\n') + '\n');
  } catch {
    // never breaks the learning it shadows
  }
}
