import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LocatorCandidate } from '../daemon/recorder.js';
import { rootDir } from '../shared/paths.js';

/**
 * A stored, parameterised procedure: what one successful `do` instruction did,
 * in a form that can be replayed on a later run of the same app without the
 * model. Keyed by origin, not session, because the point is that run N+1
 * benefits from run N.
 */
export interface Skill {
  id: string;
  origin: string;
  /** The instruction with its literal values replaced by {{vN}} slots. */
  template: string;
  params: Record<string, SkillParam>;
  preconditions: {
    urlPattern: string;
    fingerprint?: number[];
    /**
     * Identity: parameterised text ("{{v2}}") the page showed when this
     * segment started recording, and must show again before it replays. The
     * url pattern says the page is the right TEMPLATE and the fingerprint
     * says it is the right SHAPE; neither can tell one record from another,
     * so a replay would happily run a ticket's procedure on a different
     * ticket (fwrd8-n2/n3 added parts to a seed ticket and passed every
     * other gate). Only caller-vouched values qualify — see SkillParam.known.
     */
    requireText?: string[];
  };
  /**
   * What the page shows once this procedure's work is DONE, and did not show
   * when its recording began: slot-substituted visible texts ("Cancelled"), the
   * positive counterpart of preconditions.requireText. Only set on skills that
   * mutate. Replay and the compiled spec check identity (requireText) AND every
   * goal text before acting; when both hold the step is already satisfied.
   *
   * The point is that a RETRY is harmless. fwod34's 06-open asked for an order
   * to be cancelled and its recording struggled; the orchestrator wrote a
   * follow-up 08-open to cancel it again. On replay 06's skill cancels cleanly,
   * so 08's Cancel button no longer exists and the step failed — a step failing
   * because its work was already done. A goal is a POSITIVE text that appears
   * only when the work is done ("Cancelled"), never the absence of a
   * pre-state: Odoo's status bar lists every reachable state, so "Sales Order"
   * is showing whether or not the order was cancelled. A false positive here
   * would skip a step that never ran, so derivation only keeps text the
   * recording's own before/after pair proves is new (see compile.ts).
   */
  goal?: { requireText: string[] };
  steps: SkillStep[];
  /** The report the original run produced, with slots, for the zero-LLM path. */
  reportTemplate?: { summary: string; values: Record<string, string> };
  stats: SkillStats;
  status: SkillStatus;
  /** Set on a skill compiled from a replay-then-repair of another skill. */
  variantOf?: string;
  /**
   * Set when this skill is one page-template segment of a longer recorded
   * instruction: all segments of one compile share `chain` (and the template),
   * and replay composes them in `index` order. Absent on a single-segment
   * skill. Matching/selection always starts at index 0; later segments are
   * reached by following the chain, each gated by its own precondition.
   */
  seq?: { chain: string; index: number; of: number };
  /**
   * Values this procedure MINTS while running (a created record's id, a
   * generated uid), keyed by their {{dN}} marker: after `step` executes,
   * replay reads url part `at` (urlParts label) from the live page and binds
   * it, so later steps/segments reference the replay's own value, never the
   * recorded run's. `example` is what the recording observed.
   */
  derived?: Record<string, { step: number; at: string; example: string }>;
  provenance: {
    session: string;
    instruction: string;
    model?: string;
    created: string;
    /**
     * Edits that made this procedure promise LESS than the recording proved
     * — a widened start pattern, a dropped assertion, a loop given authority
     * over records nobody counted.
     *
     * Kept because invariant 7 does not forbid weakening, it forbids silent
     * weakening. Generalising a url segment that demonstrated volatility is a
     * genuine improvement; the same edit applied for no reason is how a
     * procedure drifts into matching pages it was never recorded against, and
     * from the JSON alone the two are identical. Each entry is also the
     * reason the procedure's validated status was given up.
     */
    contractChanges?: { at: string; by: string; gave: string[] }[];
    /**
     * What the compiler did to the recording on the way to this procedure,
     * and why: a folded loop and the quantifier that authorised its scope, a
     * dismissed dialog pair, a superseded navigation.
     *
     * Each of these deletes or rewrites steps that actually happened, on
     * evidence that is never conclusive. Recording the reason is what makes
     * the decision reviewable at all — the alternative, and what was actually
     * done once, is recompiling every published recording under two builds
     * and diffing the stores.
     */
    transforms?: { name: string; at: number; reason: string }[];
  };
  /**
   * The execution contract this procedure was written under. Absent means 1,
   * the contract every store predates this field.
   *
   * Not a field format version — a SEMANTICS version. It exists because the
   * meaning of what is already written here can change without the shape
   * changing at all: an absent `scope` used to be the only reading there was
   * and is now "drain"; an effect gate that could not capture a diff used to
   * pass and now reports `unobserved`; a click that produced no visible change
   * used to be retried. A procedure that earned its validated status under
   * those rules did not earn it under these, and nothing about its JSON says
   * so. Bump only when an existing field's INTERPRETATION moves; adding a new
   * optional field is not a bump.
   */
  contract?: number;
}

/**
 * The contract this build writes and is willing to execute.
 *
 * This is one-way, and worth being plain about: a build older than the field
 * ignores it entirely and will happily run a contract-2 procedure under
 * contract-1 semantics. The gate protects builds from here forward, not the
 * data already on disk.
 */
export const SKILL_CONTRACT = 2;

export function contractOf(s: Pick<Skill, 'contract'>): number {
  return typeof s.contract === 'number' ? s.contract : 1;
}

/**
 * Can this build execute the procedure as written?
 *
 * Refusing is the whole point: a procedure from a newer build means fields
 * this engine has never heard of, or — worse, because it is silent — fields
 * it knows by name and reads differently.
 */
export function contractVerdict(s: Pick<Skill, 'contract'>): { ok: true } | { ok: false; found: number; why: string } {
  const found = contractOf(s);
  if (!Number.isInteger(found) || found < 1) {
    return { ok: false, found, why: `has a malformed contract version (${JSON.stringify(s.contract)})` };
  }
  if (found > SKILL_CONTRACT) {
    return {
      ok: false,
      found,
      why: `was written by a newer Sitelooper (contract ${found}; this build reads up to ${SKILL_CONTRACT}) — upgrade sitelooper to use it`,
    };
  }
  return { ok: true };
}

/**
 * Is this procedure's validated status EVIDENCE, under the rules in force now?
 *
 * A procedure promoted under contract 1 was promoted by a replay that could
 * retry a click, skip a step whose dialog was absent, and pass a gate whose
 * evidence it never captured. Its two clean runs are a true record of what
 * happened and not a claim about this engine, so the status stands in the
 * file and is simply not trusted until it is re-earned.
 *
 * Resetting the status on read would be the other way to do this, and is
 * worse three times over: it makes reading a store mutate it, it rewrites
 * committed artifacts under bench/ on first read, and `successes: 0` destroys
 * the difference between "never verified" and "verified, then the contract
 * moved" — which is the distinction this exists to make.
 */
export function isVerified(s: Skill): boolean {
  return s.status === 'validated' && (s.stats.verifiedContract ?? 1) === contractOf(s);
}

export interface SkillParam {
  /** The value this slot had on the run that created the skill. */
  example: string;
  /** 1-based indices of the steps that use this slot. */
  usedIn: number[];
  /**
   * The caller vouched for this value (a declared flow var, url provenance, a
   * threaded {{step.output}} ref) rather than the compiler guessing it from
   * repeated text. Known values IDENTIFY the record the procedure runs on, so
   * replay treats them as identity: a fallback locator that drops the value
   * is not an acceptable substitute for the primary that carried it.
   */
  known?: true;
  /**
   * Where a later run gets its own value, as a RunLedger binding key
   * ("var:runid", "url:01-open:p1"). Present when the value cannot be read
   * out of this skill's own template — it was supplied by an EARLIER
   * instruction, so there is no word in this instruction to match it against.
   * Without it such a param used to be deleted and its value re-inlined as a
   * literal, which is how the recording run's runid ended up inside a locator
   * anchor that could never match again (fwrd19l 04-edit).
   */
  binding?: string;
}

export interface SkillStep {
  tool: string;
  /** Tool arguments with slot values substituted as "{{vN}}" in string fields. */
  args: Record<string, unknown>;
  /** Ways of finding each target, best first; strings inside may carry slots. */
  locators: Record<string, LocatorCandidate[]>;
  expect?: StepExpectation;
  /** For read/read_all steps: which report value this read supplied, if any. */
  label?: string;
  /** Step-level provenance: executed by replay of another skill, or chosen by the agent. */
  via?: { skill: string; step: number };
  /**
   * This step CREATED a record: the run's url carried an identifier after it
   * that had never appeared before. `at` is the url part that held it, so a
   * later run can re-read ITS identifier from the live page rather than
   * inheriting the recorded one.
   *
   * The distinction that matters is not "does this step mutate" — every click
   * does, which is why the tool-level MUTATING set is too coarse to act on —
   * but "does replaying this step bring a record into existence". Past such a
   * step, a stop is not a clean slate: fwod13's recovery created a second
   * order because the prelude could say which STEPS had run but not that a
   * record already existed.
   */
  mints?: { at: string };
  /**
   * `tool: 'loop'` only. The steps to repeat while `while` still matches an
   * element, capped at `max` iterations. Folded from a run of identical action
   * groups that differed only in a per-record id (e.g. deleting each part of a
   * list), so replay generalises past the exact count seen when recording.
   */
  body?: SkillStep[];
  /** `tool: 'loop'` only: repeat the body while this locator matches ≥1 element. */
  while?: LocatorCandidate[];
  /** `tool: 'loop'` only: hard cap on iterations, a runaway guard. */
  max?: number;
  /**
   * `tool: 'loop'` only: how far the loop's authority reaches.
   *
   * `observed` — do the work that was RECORDED and no more: the number of
   * records the recording actually acted on. Records beyond that are left
   * alone, and leaving them is not a failure. This is the default for a new
   * compile, because two deletions are evidence of two deletions and of
   * nothing else.
   *
   * `drain` — keep going until nothing matches. That is authority over every
   * record in the collection, including ones that did not exist when the
   * procedure was recorded, so it is taken from the caller's own words
   * ("delete ALL the parts") and never inferred from a repetition. A drain
   * that runs out of passes with records still matching has not finished its
   * work, and fails rather than reporting success.
   *
   * Absent on procedures compiled before the distinction existed. Those were
   * all written with drain intent and are read that way, so an old store
   * keeps behaving as it did — but now fails loudly where it used to stop
   * short in silence.
   */
  scope?: 'observed' | 'drain';
}

export interface StepExpectation {
  /** Hard: the normalised url after the step must match. Present only when the step changed the url. */
  urlPattern?: string;
  /** Soft: an alert containing this text appeared. */
  alertContains?: string;
  /** Soft: page lines that appeared after the step. */
  addedContains?: string[];
}

export interface SkillStats {
  uses: number;
  successes: number;
  /** Replays that stopped part-way (the agent may still have completed the instruction). */
  partial: number;
  created: string;
  lastUsed?: string;
  /** 1-based step index → how often replay failed there. */
  failedAtStep: Record<string, number>;
  lastFailedAt?: number;
  /** How often a fallback locator (not the recorded primary) had to be used — drift signal. */
  fallthroughs: number;
  /**
   * Steps, across all replays, whose effect evidence could not be captured.
   * Kept separately from successes and failures because it is neither: a
   * procedure with a standing count here has replays nobody could verify, and
   * that is a thing to look at rather than a thing to average away.
   */
  unobserved?: number;
  /**
   * The contract `successes` were counted under. Absent means 1. Read by
   * `isVerified`, which is what decides whether a validated status is
   * evidence about THIS engine or a record of an older one's.
   */
  verifiedContract?: number;
}

export type SkillStatus = 'provisional' | 'validated' | 'demoted';

export interface ReplayOutcome {
  ok: boolean;
  /** 1-based index of the step that failed, when !ok. */
  failedAt?: number;
  fallthroughs?: number;
  /** Whether the instruction around the replay ended in a successful report. */
  instructionSucceeded: boolean;
  /**
   * How many steps ran without their effect evidence being capturable. Such a
   * run is not a failure — its required expectations were still checked
   * against the live page — but it is not the clean, fully observed replay
   * that promotion is supposed to be counting.
   */
  unobserved?: number;
}

/** Where skills live: `$SITELOOPER_SKILLS_DIR` or `<home>/skills`. */
export function skillsDir(): string {
  return process.env.SITELOOPER_SKILLS_DIR || path.join(rootDir(), 'skills');
}

export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return u.protocol === 'file:' ? 'file://' : null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Filename-safe name for an origin. The SCHEME is part of it: dropping it put
 * `http://app.example.com` and `https://app.example.com` in one bucket, so a
 * procedure recorded over http was offered — and replayed — on https, which
 * is a different origin with different cookies, different session, and
 * potentially a different app. `originOf` already keeps them apart; only the
 * filename conflated them.
 */
export function originSlug(origin: string): string {
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/.exec(origin);
  const scheme = m ? m[1] : '';
  const rest = (m ? m[2] : origin).replace(/[^A-Za-z0-9.-]+/g, '_');
  if (!rest) return scheme || 'file';
  return scheme ? `${scheme}_${rest}` : rest;
}

/**
 * One DIRECTORY per origin, one JSON file per procedure inside it, matching
 * the layout the site model already uses.
 *
 * It used to be one whole-file array per origin, and every mutation was an
 * unguarded read-modify-write over it: two daemons (there is one per session,
 * and they share this store) that added a procedure, or recorded an outcome,
 * at the same time would each write back a list built before the other's
 * change, and the later rename silently dropped it. A file per procedure
 * removes the conflict rather than locking against it — two writes now touch
 * the same bytes only when they are about the SAME procedure, and each one is
 * a tmp-plus-rename, so a reader sees one whole version or the other.
 *
 * Reads stay fresh on every access, so daemons still see each other's work.
 */
/**
 * An origin directory holds one file per procedure, and these, which are not
 * procedures and must not be read as one.
 *
 * The list exists because the alternative failed quietly: `sitemap.json` sits
 * in the same directory (SiteModel.file), parses cleanly, and carries an
 * `origin` but no `id` — so the shape gate below filed it under `corrupt`, on
 * every single read, for every origin anyone had ever browsed. A permanent
 * entry on a list whose whole purpose is "this is a thing to look at".
 *
 * Anything else that comes to live beside the procedures belongs here too.
 */
export const SITEMAP_FILE = 'sitemap.json';
const NOT_A_PROCEDURE = new Set([SITEMAP_FILE]);

export class SkillStore {
  constructor(readonly dir: string = skillsDir()) {}

  /**
   * Files that would not parse. Never dropped and never overwritten: a
   * corrupt store is a thing to look at, and returning it as "no procedures
   * here" invites the next write to replace it with an empty one.
   */
  readonly corrupt: string[] = [];

  /**
   * Procedures this build will not execute, and why — almost always because
   * they were written by a newer one.
   *
   * Kept apart from `corrupt` deliberately. Corrupt means "would not parse,
   * never overwrite it"; these parse perfectly and are perfectly good files,
   * they are simply not ours to run. Folding them together would make the
   * never-overwrite rule and what `rm`/`clear` may do mean two different
   * things at once.
   *
   * They are excluded at the read, which is the strongest guarantee available
   * here: every selection path — list, all, get, candidatesFor, matchTemplate,
   * compile, export — derives from this, so a procedure from a newer build
   * cannot be replayed, promoted or emitted without any of those call sites
   * having to remember to check.
   */
  readonly unreadable: { file: string; id: string; origin: string; contract: number; why: string }[] = [];

  private originDir(origin: string): string {
    return path.join(this.dir, originSlug(origin));
  }

  private file(origin: string, id: string): string {
    return path.join(this.originDir(origin), `${encodeURIComponent(id)}.json`);
  }

  origins(): string[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out = new Set<string>();
    for (const e of entries) {
      if (e.isDirectory()) {
        for (const s of this.readDir(path.join(this.dir, e.name))) out.add(s.origin);
      } else if (e.isFile() && e.name.endsWith('.json')) {
        // A pre-directory whole-file store; its entries name their own origins.
        for (const s of this.legacyFile(path.join(this.dir, e.name))) out.add(s.origin);
      }
    }
    return [...out];
  }

  /** Every parsable procedure in one origin directory, corrupt files recorded and left alone. */
  private readDir(dir: string): Skill[] {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith('.json') && !NOT_A_PROCEDURE.has(n));
    } catch {
      return [];
    }
    const out: Skill[] = [];
    for (const n of names) {
      const file = path.join(dir, n);
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        if (!this.corrupt.includes(file)) this.corrupt.push(file);
        continue;
      }
      const skill = raw as Skill;
      if (skill && typeof skill === 'object' && typeof skill.id === 'string' && typeof skill.origin === 'string') {
        if (this.admit(skill, file)) out.push(skill);
      } else if (!this.corrupt.includes(file)) this.corrupt.push(file);
    }
    return out;
  }

  /**
   * Is this procedure ours to run? Records the refusal if not, so something
   * can say so later — silently dropping it is indistinguishable from the
   * procedure never having been recorded, which is the wrong story entirely.
   */
  private admit(skill: Skill, file: string): boolean {
    const verdict = contractVerdict(skill);
    if (verdict.ok) return true;
    // Keyed on the id as well as the file: a legacy whole-file store holds
    // many procedures, and each refused one is its own thing to report.
    if (!this.unreadable.some((u) => u.file === file && u.id === skill.id)) {
      this.unreadable.push({ file, id: skill.id, origin: skill.origin, contract: verdict.found, why: verdict.why });
    }
    return false;
  }

  private write(skill: Skill): void {
    const dir = this.originDir(skill.origin);
    fs.mkdirSync(dir, { recursive: true });
    const file = this.file(skill.origin, skill.id);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(skill, null, 1));
    fs.renameSync(tmp, file);
  }

  /**
   * Every procedure in a pre-directory whole-file store, read in place.
   *
   * Nothing is rewritten or renamed: a legacy file may be a committed
   * artifact — an exported bench store, a bundle someone pinned — and a read
   * is not permission to edit it. The entries are filed by the origin they
   * CARRY rather than the one the filename suggests, because that filename
   * dropped the scheme and one file can therefore hold both http and https
   * procedures. A per-procedure file of the same id wins, so the first `put`
   * after an upgrade migrates that procedure and later reads stop consulting
   * the legacy copy for it.
   */
  private legacyPath(origin: string): string {
    return path.join(this.dir, `${origin.replace(/^[a-z]+:\/\//, '').replace(/[^A-Za-z0-9.-]+/g, '_') || 'file'}.json`);
  }

  private legacyFile(file: string): Skill[] {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !this.corrupt.includes(file)) this.corrupt.push(file);
      return [];
    }
    if (!Array.isArray(raw)) {
      if (!this.corrupt.includes(file)) this.corrupt.push(file);
      return [];
    }
    return (raw as Skill[]).filter(
      (s) => s && typeof s.id === 'string' && typeof s.origin === 'string' && this.admit(s, file),
    );
  }

  private readLegacy(origin: string): Skill[] {
    return this.legacyFile(this.legacyPath(origin));
  }

  list(origin: string): Skill[] {
    // Filter by the origin each entry carries: the directory name is a
    // convenience, the entry is the record.
    const current = this.readDir(this.originDir(origin)).filter((s) => s.origin === origin);
    const have = new Set(current.map((s) => s.id));
    const legacy = this.readLegacy(origin).filter((s) => s.origin === origin && !have.has(s.id));
    return [...current, ...legacy];
  }

  all(): Skill[] {
    return this.origins().flatMap((o) => this.list(o));
  }

  get(id: string): Skill | null {
    return this.all().find((s) => s.id === id) ?? null;
  }

  put(skill: Skill): void {
    this.write(skill);
  }

  /**
   * Delete is the one operation that may edit a legacy whole-file store: the
   * caller is asking for the procedure to be gone, and shadowing it would
   * leave it to reappear. Entries for other origins in that file are kept.
   */
  private dropLegacy(origin: string, gone: (s: Skill) => boolean): void {
    const file = this.legacyPath(origin);
    const all = this.legacyFile(file);
    if (!all.length) return;
    const kept = all.filter((s) => !(s.origin === origin && gone(s)));
    if (kept.length === all.length) return;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(kept, null, 1));
    fs.renameSync(tmp, file);
  }

  remove(id: string): boolean {
    const skill = this.get(id);
    if (!skill) return false;
    try {
      fs.rmSync(this.file(skill.origin, id), { force: true });
    } catch {
      return false;
    }
    this.dropLegacy(skill.origin, (s) => s.id === id);
    return true;
  }

  clear(origin: string): number {
    const skills = this.list(origin);
    for (const s of skills) {
      try {
        fs.rmSync(this.file(origin, s.id), { force: true });
      } catch {
        // best effort
      }
    }
    this.dropLegacy(origin, () => true);
    return skills.length;
  }

  /**
   * Fold a replay's outcome into the skill's stats and status.
   *
   * Promotion: provisional → validated on the second clean end-to-end replay
   * inside a successful instruction. Demotion: the same step failing twice in
   * a row. One success is evidence, not proof (the bench caught a fabricated
   * "success" once); one failure can be a flaky page.
   *
   * A run with UNOBSERVED steps is neither. Its required expectations were
   * still checked — against the live page, because the step diff was missing
   * — so it is not a failure and not a strike. But promotion is a claim that
   * the procedure has been seen to work, and a step whose effect nobody could
   * capture has not been seen to do anything. It counts as a use, and stops
   * there: `successes` does not move, so the second clean replay that
   * promotes has to be a genuinely observed one.
   */
  recordOutcome(id: string, outcome: ReplayOutcome, now = new Date().toISOString()): Skill | null {
    const skill = this.get(id);
    if (!skill) return null;
    const st = skill.stats;
    st.uses += 1;
    st.lastUsed = now;
    st.fallthroughs += outcome.fallthroughs ?? 0;
    const unobserved = outcome.unobserved ?? 0;
    if (unobserved > 0) st.unobserved = (st.unobserved ?? 0) + unobserved;
    if (outcome.ok && outcome.instructionSucceeded && unobserved === 0) {
      st.successes += 1;
      st.lastFailedAt = undefined;
      if (skill.status === 'provisional' && st.successes >= 2) {
        skill.status = 'validated';
        // Say WHICH engine's rules these two clean runs were clean under.
        // Without this the status alone would carry over a contract bump and
        // claim evidence it does not have.
        st.verifiedContract = contractOf(skill);
      }
    } else if (outcome.ok && outcome.instructionSucceeded) {
      // Observed nothing conclusive: not a success, not a strike.
      st.lastFailedAt = undefined;
    } else if (!outcome.ok) {
      st.partial += 1;
      const at = outcome.failedAt ?? 0;
      st.failedAtStep[String(at)] = (st.failedAtStep[String(at)] ?? 0) + 1;
      if (st.lastFailedAt === at) skill.status = 'demoted';
      st.lastFailedAt = at;
    }
    this.write(skill);
    return skill;
  }

  /** A validated variant supersedes the skill it repaired. */
  supersede(originalId: string): void {
    const original = this.get(originalId);
    if (!original || original.status === 'demoted') return;
    original.status = 'demoted';
    this.put(original);
  }
}

export function newSkillId(origin: string, template: string, created: string): string {
  return 's_' + crypto.createHash('sha1').update(`${origin}\n${template}\n${created}`).digest('hex').slice(0, 6);
}

export function successRate(s: Skill): number {
  return s.stats.uses ? s.stats.successes / s.stats.uses : 0;
}
