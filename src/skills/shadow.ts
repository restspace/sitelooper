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
import { dropSupersededSets } from './toggles.js';

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
    const writes = between.filter((e) => WRITE_METHODS.has(String(e.m)) && !(e.c?.[0] === 'app'));
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

const OPTION_ATTRS = new Set(['class', 'aria-selected', 'aria-checked', 'checked']);
const OBSERVE_TOOLS = new Set(['read', 'read_all', 'wait_for', 'screenshot']);
const observesOnly = (s: RecordedStep) => OBSERVE_TOOLS.has(s.tool) || (s.tool === 'tabs' && typeof s.args.switch_to !== 'number');
const optionName = (d: unknown) =>
  String(d ?? '')
    .replace(/^[\w-]+ "(.*)"$/, '$1')
    .replace(/^[✓✔☑\s]+/, '')
    .trim();

/**
 * (a) A picker's recorded net option state (gitea fwgt12 03-set): the ticks
 * the journal saw (state events with a direction), which of them a close
 * COMMITTED (a hide followed by a write request), and what a reload threw
 * away (a goto or back returns the picker to the last commit). Beside it, the
 * state the compiled procedure's kept ticking steps produce from the same
 * start. They agree when the procedure ends with the same options selected.
 */
export function pickerNetState(steps: readonly RecordedStep[], skills: readonly Skill[], prior: readonly RecordedStep[] = []): ShadowRow[] {
  // A dead instruction just before (gitea fwgt11/fwgt12: blocked, then resumed)
  // ticked the same picker: its ticks and commits are part of the recorded
  // state, though its steps are not this procedure's unless carried in.
  const events = [...new Set([...eventsOf(prior), ...eventsOf(steps)])].sort((a, b) => a.t - b.t);
  const ticks = events.filter((e) => e.k === 'state' && typeof e.on === 'boolean' && OPTION_ATTRS.has(String(e.a)));
  if (!ticks.length) return [];
  const resets = [...prior, ...steps].filter((s) => (s.tool === 'goto' || s.tool === 'back') && dispatchOf(s) !== undefined).map((s) => dispatchOf(s)!);
  const initial = new Map<string, boolean>();
  for (const t of ticks) if (!initial.has(optionName(t.d))) initial.set(optionName(t.d), !t.on);
  let current = new Map(initial);
  let committed = new Map(initial);
  const commits: string[] = [];
  const selected = (m: Map<string, boolean>) =>
    [...m]
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
  const timeline = [
    ...ticks.map((e) => ({ t: e.t, e: e as JournalEvent | null })),
    ...events.filter((e) => e.k === 'hide').map((e) => ({ t: e.t, e: e as JournalEvent | null })),
    ...resets.map((t) => ({ t, e: null as JournalEvent | null })),
  ].sort((a, b) => a.t - b.t);
  for (const { t, e } of timeline) {
    if (!e) {
      current = new Map(committed);
      continue;
    }
    if (e.k === 'state') current.set(optionName(e.d), e.on as boolean);
    else {
      const write = events.find((r) => r.k === 'req' && WRITE_METHODS.has(String(r.m)) && r.c?.[0] !== 'app' && r.t >= t - 300 && r.t <= t + 1_500);
      if (write) {
        committed = new Map(current);
        commits.push(`{${selected(committed).join(', ')}} at #${causeWindowOf(e) ?? '?'}`);
      }
    }
  }
  const lastTick = ticks[ticks.length - 1].t;
  const pending = !timeline.some(({ t, e }) => e?.k === 'hide' && t > lastTick);
  // The procedure: the same start, ticked by the kept steps that ticked.
  const proc = new Map(initial);
  for (const t of ticks) {
    const step = t.c?.[0] === 'in' ? stepOfWindow(steps, t.c[1] as number) : undefined;
    if (step && keptOccurrence(step, steps, skills).kept) proc.set(optionName(t.d), t.on as boolean);
  }
  const fact = selected(pending ? current : committed);
  const procedure = selected(proc);
  return [
    {
      rule: 'pickerNetState',
      step: String(events.find((e) => e.k === 'show' && /^(listbox|menu|dialog)/.test(String(e.d)))?.d ?? 'picker'),
      fact: `net selected: [${fact.join(', ')}]${pending ? ' (not committed: no close after the last tick)' : ''}; commits: ${commits.join(' then ') || 'none'}`,
      heuristic: `the procedure's kept ticks give [${procedure.join(', ')}]`,
      agree: JSON.stringify(fact) === JSON.stringify(procedure),
      evidence: ticks.slice(0, 8).map(short),
    },
  ];
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
      const hit = events.find((e) => {
        if (e.t < prevEnd - 50 || e.t > end + 50) return false;
        const text = e.k === 'txt' ? String(e.x ?? '') : optionName(e.d);
        return text.length >= 3 && line.includes(text);
      });
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
    const mine = causedBy(s, events).filter((e) => e.k !== 'foc' && e.k !== 'hit');
    const hides = mine.filter((e) => e.k === 'hide');
    if (!hides.length || mine.some((e) => e.k === 'req' || e.k === 'val' || e.k === 'show' || (e.k === 'state' && e.a !== 'aria-expanded'))) continue;
    const shows = hides.map((h) => events.find((e) => e.k === 'show' && e.lm === h.lm && e.t <= h.t));
    const show = shows.find((e) => e && stepOfWindow(steps, causeWindowOf(e)));
    const shower = show ? stepOfWindow(steps, causeWindowOf(show)) : undefined;
    if (!show || !shower) continue;
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

const RULES: ShadowRule[] = [abandonedEdits, pickerNetState, flashCause, repeatClicks, hideRequired, supersededSets];

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
