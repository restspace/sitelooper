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

/** Compiled steps with the recorded step's tool and primary locator: how many of them the procedure keeps. */
function compiledMatches(step: RecordedStep, skills: readonly Skill[]): SkillStep[] {
  const key = primaryKey(step.locators.target?.chain);
  const out: SkillStep[] = [];
  const walk = (list: readonly SkillStep[]) => {
    for (const s of list) {
      if (s.tool === step.tool && key !== null && primaryKey(s.locators.target) === key) out.push(s);
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

/** Every shadow rule over one compiled instruction. Never throws. */
export function shadowVerdicts(entries: readonly RecordedEntry[], skills: readonly Skill[]): ShadowRow[] {
  if (!hasJournal(entries)) return [];
  const steps = stepsOf(entries);
  const rows: ShadowRow[] = [];
  for (const rule of RULES) {
    try {
      rows.push(...rule(steps, skills));
    } catch {
      // a shadow rule never breaks the compile it shadows
    }
  }
  return rows;
}

type ShadowRule = (steps: readonly RecordedStep[], skills: readonly Skill[]) => ShadowRow[];

const RULES: ShadowRule[] = [abandonedEdits];

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
