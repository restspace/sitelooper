/**
 * SITE FACTS, value class (design-site-facts.md §4; the stage 0 contract's
 * Piece D3): what a VALUE is on an origin — a catalogue constant the app
 * offered, something a run minted, or a credential — and the SHAPE of the
 * values minted under one label. Plus every url fact the run ledger derives
 * (`route.query` / `route.path` `identity`): the ledger is this piece's, so a
 * url part it admits by provenance is filed here, never by the url observer.
 *
 * Stage 0 is SHADOW ONLY. Nothing here changes a decision: the observers
 * write facts through the store (daemon side only — the artifact never
 * writes), and the shadow rows say whether the facts, had they decided, would
 * have agreed with today's heuristics (ledger kinding, stripLeakedCandidates,
 * the sourcing hold). Every entry point swallows its own errors: a fact that
 * cannot be written must never break the run it observes.
 *
 * Nothing secret is stored: a `value.class` key is `valueHash(value)`, its
 * `ev` holds at most the value's SHAPE and only for a value whose shape says
 * little more than "letters and digits" (see `shapeable`), a credential's
 * fact has no `ev` at all, and the store scrubs the whole document through
 * the secrets ledger on every write.
 */
import {
  factsFor,
  matchesShape,
  reliable,
  routeTemplateOf,
  shapeOf,
  valueClassFact,
  valueHash,
  MAX_EV,
  type Fact,
  type FactKind,
  type Observation,
  type SiteFacts,
} from '../execution/facts.js';
import { originOf, urlParts } from '../execution/url.js';
import type { RecordedEntry } from '../daemon/recorder.js';
import { isDataShaped } from '../agent/sourcing.js';
import { ambiguousCredentialHashes } from '../shared/secrets.js';
import { taskConstantArms, type RunSpecific } from './flow.js';
import { pathDigitPart, urlPartFactKey, type LedgerEntry } from './ledger.js';
import type { SiteFactStore } from './facts.js';
import { writeShadow, type ShadowRow } from './shadow.js';

/** How sure an admission is that its value was minted: `hard` by provenance, `soft` by variance, null by shape alone. */
export type Strength = 'hard' | 'soft' | null;

/** addUrlIds' options, as the daemon passes them (ledger.ts). */
export interface UrlAdmissionOpts {
  landed?: boolean;
  landedLabels?: readonly string[];
  linkMinted?: readonly { label: string; value: string }[];
}

/**
 * How strongly the ledger's admission of a url part proves it minted:
 *  - HARD: the landing put it there (a step's own action, or a goto's unseen
 *    part, ledger.ts pathDigitPart), a step's own mutation linked to it
 *    (linkMintedParts), or the url's vocabulary names it (`basis: position`);
 *  - SOFT: an earlier run watched the value change (`basis: variance`);
 *  - null: shape alone (`basis: shape` with no provenance) — a guess, no fact.
 */
export function admissionStrength(entry: LedgerEntry, opts: UrlAdmissionOpts = {}): Strength {
  if (entry.binding.from !== 'url') return entry.basis === 'variance' ? 'soft' : null;
  const label = entry.binding.label;
  const part = { label, value: entry.value };
  if (opts.linkMinted?.some((p) => p.label === label && p.value.trim() === entry.value)) return 'hard';
  if ((opts.landed || opts.landedLabels?.includes(label)) && pathDigitPart(part)) return 'hard';
  if (entry.basis === 'position') return 'hard';
  if (entry.basis === 'variance') return 'soft';
  return null;
}

/**
 * The url fact a minted part at `label` proves: `route.path` at a path index
 * (`p1` → `${route}#1`, a hash-route index `h2` → `${route}#h2`), or
 * `route.query` for a `q.<key>` (hash state and query string share the
 * `?key` spelling, as urlPart reads them). Null when the url is not a url.
 */
export function urlFactKey(url: string, label: string, identityParts: readonly string[] = []): { k: FactKind; key: string } | null {
  // One definition, shared with the ledger's reader (addUrlIds' facts).
  return urlPartFactKey(url, label, identityParts);
}

/**
 * The `value.shape` key of a label on a url's route: `${route}|${label}`,
 * the route keyed through `routeTemplateOf(url, identityParts)` as urlFactKey is.
 */
export function shapeKeyOf(url: string, label: string, identityParts: readonly string[] = []): string {
  return `${routeTemplateOf(url, identityParts)}|${label}`;
}

/**
 * The url's record parts the ledger admitted (`p<i>=<v>` / `h<i>=<v>`), from
 * addUrlIds' result: a path or hash-path part whose value this url holds at
 * that label. Query keys are not path parts; a route template never carries
 * them.
 */
export function admittedIdentityParts(url: string, admitted: readonly LedgerEntry[]): string[] {
  const at = new Map(urlParts(url).map((p) => [p.label, p.value]));
  const out: string[] = [];
  for (const e of admitted) {
    if (e.binding.from !== 'url' || !/^[ph]\d+$/.test(e.binding.label)) continue;
    const v = at.get(e.binding.label);
    if (v === undefined || v.trim() !== e.value) continue;
    const tag = `${e.binding.label}=${v}`;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Whether a value's SHAPE may be written down: a digit run to generalise, at
 * most four letters left literal, and short. S00023, BA-00001, RD-1015 and
 * "#4" qualify; a word ("Order Alpha") or a uid ("afw6yy5xx9") would be
 * written out nearly in clear, and a uid never shares a shape anyway.
 */
export function shapeable(value: string): boolean {
  const v = value.trim();
  return /\d/.test(v) && (v.match(/\p{L}/gu) ?? []).length <= 4 && v.length <= 40;
}

/**
 * A mint fact's `ev`: `${shapeKey} ${shape}` — what a later session needs to
 * recognise a second value of the same shape under the same label. Omitted
 * when the value is not `shapeable`, carries a run var (the runid), or the
 * line would be clipped (a clipped line matches nothing).
 */
export function mintEv(shapeKey: string, value: string, vars: readonly string[] = []): string | undefined {
  if (!shapeable(value)) return undefined;
  const ev = `${shapeKey} ${shapeOf(value.trim())}`;
  if (ev.length > MAX_EV) return undefined;
  if (vars.some((v) => v.length >= 2 && (value.includes(v) || ev.includes(v)))) return undefined;
  return ev;
}

/** A row's evidence line: the fact, never the value (a value.class key is a hash). */
function evidenceOf(f: Fact): string {
  return JSON.stringify({ k: f.k, key: f.key, v: f.v, reliable: reliable(f) });
}

type IdVerdict = 'identifier' | 'not-identifier' | 'none';

/**
 * What the facts would make of a value's KIND at the ledger (§4 consumer 1):
 * a reliable `constant` (or credential) is never an identifier; a reliable
 * `mint` is one; a value matching the label's reliable mint shape is one at
 * first sighting, whatever its length. 'none': no reliable fact speaks.
 */
export function factKind(sf: SiteFacts, value: string, shapeKey: string | undefined): IdVerdict {
  const cls = valueClassFact(sf, value);
  if (cls === 'constant' || cls === 'credential') return 'not-identifier';
  if (cls === 'mint') return 'identifier';
  if (shapeKey && matchesShape(sf, shapeKey, value)) return 'identifier';
  return 'none';
}

/** Every fact (reliable or not) that speaks about a value or its label's shape. */
function factsAbout(sf: SiteFacts, value: string, shapeKey: string | undefined): Fact[] {
  return [...factsFor(sf, 'value.class', valueHash(value)), ...(shapeKey ? factsFor(sf, 'value.shape', shapeKey) : [])];
}

/**
 * Row `facts.ledger`: would the facts change the ledger's kind for this
 * value? Null when no fact speaks about it at all (not a decision the facts
 * take part in). `kind` is today's: the ledger entry's, or undefined when
 * the ledger holds none (below the length floor, a skipped url part).
 */
export function ledgerRow(sf: SiteFacts, value: string, shapeKey: string | undefined, kind: LedgerEntry['kind'] | undefined): ShadowRow | null {
  const about = factsAbout(sf, value, shapeKey);
  if (!about.length) return null;
  const fact = factKind(sf, value, shapeKey);
  const heuristic = kind === 'identifier' ? 'identifier' : 'not-identifier';
  return {
    rule: 'facts.ledger',
    ...(shapeKey ? { step: shapeKey.slice(0, 100) } : {}),
    fact,
    heuristic,
    agree: fact === 'none' || fact === heuristic,
    evidence: about.map(evidenceOf),
  };
}

/**
 * Row `facts.strip`: would the facts strip locator candidates naming this
 * identifier (§4 consumer 2)? `stripped` is today's decision (the value is
 * among stripLeakedCandidates' run values).
 */
export function stripRow(sf: SiteFacts, value: string, shapeKey: string | undefined, stripped: boolean): ShadowRow | null {
  const about = factsAbout(sf, value, shapeKey);
  if (!about.length) return null;
  const kind = factKind(sf, value, shapeKey);
  const fact = kind === 'none' ? 'none' : kind === 'identifier' ? 'strip' : 'keep';
  const heuristic = stripped ? 'strip' : 'keep';
  return {
    rule: 'facts.strip',
    ...(shapeKey ? { step: shapeKey.slice(0, 100) } : {}),
    fact,
    heuristic,
    agree: fact === 'none' || fact === heuristic,
    evidence: about.map(evidenceOf),
  };
}

/**
 * Row `facts.sourcing` (§4 consumer 3): a reported value matching a reliable
 * mint shape, data-shaped and not read under its key, would be held for a
 * read even unasked. `held` is today's: the report's sourcingAsk named the
 * key. Null when no shape fact exists under the key; fact 'none' when no
 * reliable shape matches (the hold then decides alone).
 */
export function sourcingRow(sf: SiteFacts, key: string, value: string, shapeKey: string, held: boolean, readUnderKey: boolean): ShadowRow | null {
  const about = factsFor(sf, 'value.shape', shapeKey);
  if (!about.length) return null;
  // The fact only ever ADDS a hold (an unasked value of a known mint shape);
  // where it does not speak, the hold decides as today.
  const fact = matchesShape(sf, shapeKey, value) && isDataShaped(value) && (held || !readUnderKey) ? 'held' : 'none';
  const heuristic = held ? 'held' : 'not-held';
  return {
    rule: 'facts.sourcing',
    step: `report ${key}`.slice(0, 100),
    fact,
    heuristic,
    agree: fact === 'none' || fact === heuristic,
    evidence: about.map(evidenceOf),
  };
}

/** One value the instruction met, for the ledger rows and the shape memory. */
interface Candidate {
  value: string;
  shapeKey?: string;
  origin: string;
  /** Minted (a provenance or variance admission, or a reported identifier): counts toward the label's shape. */
  minted: boolean;
}

/** What the daemon hands the observer at an instruction's end. */
export interface InstructionEnd {
  /** Every entry the session's script holds (taskConstants judges over the whole script). */
  script: readonly RecordedEntry[];
  /** This instruction's entries (its instruction line, steps and report). */
  entries: readonly RecordedEntry[];
  /** The run ledger, as it stands now. */
  ledger: readonly LedgerEntry[];
  /** The session's declared vars' values (the runid). */
  vars: readonly string[];
  runSpecific?: RunSpecific;
  /** Whether SITELOOPER_SOURCING_HOLD is on: the `facts.sourcing` rows are written only then. */
  sourcingHold?: boolean;
}

/**
 * The value-class observer of one daemon: collects what each instruction's
 * ledger admissions, reports, task constants and credentials prove, and at
 * the instruction's end writes the shadow rows (judged against the facts as
 * they stood BEFORE this instruction's observations — a fact cannot vouch for
 * itself) and then the observations. Session memory keeps the last two
 * minted values' shapes per label, so two distinct values sharing a shape in
 * one session file a `value.shape` fact; two sessions meet through the mint
 * facts' `ev`.
 */
export class ValueFactObserver {
  private pendingObs: { origin: string; o: Omit<Observation, 'session'> }[] = [];
  private candidates: Candidate[] = [];
  /** shapeKey → the last two minted values' {hash, shape}, newest last. */
  private shapes = new Map<string, { hash: string; shape: string }[]>();
  /** Observations already filed this session: a constant or credential is observed once per session. */
  private filed = new Set<string>();
  /** Shadow rows already written this session (the daemon may end one instruction twice). */
  private rowsWritten = new Set<string>();
  /** value → the shape key it was last met under, for the strip rows. */
  private keyOfValue = new Map<string, string>();

  constructor(
    private readonly store: SiteFactStore,
    private sessionId: string,
    /** Where shadow.jsonl goes: the skill store's directory. */
    private readonly shadowDir: string = store.dir,
  ) {}

  get session(): string {
    return this.sessionId;
  }

  /**
   * The origin's facts as the store holds them now, for the ledger's
   * admission (addUrlIds' `facts`; stage 1 consumer 3). Undefined when the
   * url has no origin or the store cannot be read: the ledger then runs its
   * rules unchanged.
   */
  snapshot(url: string): SiteFacts | undefined {
    try {
      const origin = originOf(url);
      return origin ? this.store.read(origin) : undefined;
    } catch {
      return undefined;
    }
  }

  /** A new session (a flow run's replay): memory is per session. */
  beginSession(session: string): void {
    if (session === this.sessionId) return;
    this.sessionId = session;
    this.shapes.clear();
    this.filed.clear();
    this.rowsWritten.clear();
    this.keyOfValue.clear();
    this.pendingObs = [];
    this.candidates = [];
  }

  /**
   * The ledger admitted `admitted` from `url` (addUrlIds' result). Each part
   * proven minted files `value.class` `mint` and its url fact, hard or soft
   * by `admissionStrength`; every part of the url is a candidate for the
   * ledger row.
   */
  noteUrl(url: string, parts: readonly { label: string; value: string }[], opts: UrlAdmissionOpts, admitted: readonly LedgerEntry[], vars: readonly string[] = []): void {
    try {
      const origin = originOf(url);
      if (!origin) return;
      // The url's record parts this admission banked key the route, so a
      // letters-only record segment (a grafana uid at p1) is `*` in every key.
      const identityParts = admittedIdentityParts(url, admitted);
      const strengthOf = new Map<string, Strength>();
      for (const e of admitted) {
        if (e.binding.from !== 'url') continue;
        const strength = admissionStrength(e, opts);
        strengthOf.set(`${e.binding.label}\u0000${e.value}`, strength);
        if (!strength) continue;
        const hard = strength === 'hard';
        const shapeKey = shapeKeyOf(url, e.binding.label, identityParts);
        const ev = mintEv(shapeKey, e.value, vars);
        this.pendingObs.push({ origin, o: { k: 'value.class', key: valueHash(e.value), v: 'mint', hard, ...(ev ? { ev } : {}) } });
        const uf = urlFactKey(url, e.binding.label, identityParts);
        if (uf) this.pendingObs.push({ origin, o: { k: uf.k, key: uf.key, v: 'identity', hard } });
      }
      const all = [...parts, ...(opts.linkMinted ?? [])];
      for (const p of all) {
        const value = p.value.trim();
        if (!value) continue;
        const shapeKey = shapeKeyOf(url, p.label, identityParts);
        this.keyOfValue.set(value, shapeKey);
        this.candidates.push({ value, shapeKey, origin, minted: Boolean(strengthOf.get(`${p.label}\u0000${value}`)) });
      }
    } catch {
      /* shadow only: never breaks the run */
    }
  }

  /**
   * A reported value, and the ledger's entry for it (null when add() banked
   * nothing new). A variance-kinded report is a soft mint (no url fact: a
   * report has no position); a reported identifier counts toward its key's
   * shape.
   */
  noteReport(url: string | undefined, name: string, value: string, entry: LedgerEntry | null, vars: readonly string[] = []): void {
    try {
      const origin = url ? originOf(url) : null;
      const v = String(value ?? '').trim();
      if (!origin || !v) return;
      const shapeKey = shapeKeyOf(url!, name);
      this.keyOfValue.set(v, shapeKey);
      if (entry && entry.basis === 'variance') {
        const ev = mintEv(shapeKey, v, vars);
        this.pendingObs.push({ origin, o: { k: 'value.class', key: valueHash(v), v: 'mint', hard: false, ...(ev ? { ev } : {}) } });
      }
      this.candidates.push({ value: v, shapeKey, origin, minted: entry?.kind === 'identifier' });
    } catch {
      /* shadow only */
    }
  }

  /**
   * End of an instruction: the shadow rows first (against the facts before
   * this instruction), then the task constants, the credentials, the label
   * shapes, and every pending observation, written per origin. Returns the
   * rows written.
   */
  endInstruction(end: InstructionEnd): ShadowRow[] {
    const rows: ShadowRow[] = [];
    try {
      const origins = new Set(this.candidates.map((c) => c.origin));
      const instruction = [...end.entries].reverse().find((e) => e.k === 'instruction');
      const instrOrigin = (instruction?.k === 'instruction' && instruction.url ? originOf(instruction.url) : null) ?? [...origins].at(-1) ?? null;
      if (instrOrigin) origins.add(instrOrigin);
      const before = new Map<string, SiteFacts>();
      for (const o of origins) before.set(o, this.store.read(o));

      // Rows: the ledger's kind for every value the instruction met.
      const kindOf = new Map<string, LedgerEntry['kind']>();
      for (const e of end.ledger) if (!kindOf.has(e.value)) kindOf.set(e.value, e.kind);
      const seen = new Set<string>();
      for (const c of this.candidates) {
        const id = `${c.value}\u0000${c.shapeKey ?? ''}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const row = ledgerRow(before.get(c.origin)!, c.value, c.shapeKey, kindOf.get(c.value));
        if (row) rows.push(row);
      }
      // Rows: the sourcing hold, when it is on.
      const report = [...end.entries].reverse().find((e) => e.k === 'report');
      if (end.sourcingHold && report?.k === 'report' && instrOrigin) {
        const url = instructionUrl(end.entries);
        const held = new Set(report.sourcingAsk?.asked ?? []);
        const readKeys = new Set(
          end.entries.flatMap((e) => (e.k === 'step' && (e.tool === 'read' || e.tool === 'read_all') && typeof e.args.label === 'string' ? [e.args.label] : [])),
        );
        for (const [key, raw] of Object.entries(report.values ?? {})) {
          if (typeof raw !== 'string' || !url) continue;
          const row = sourcingRow(before.get(instrOrigin)!, key, raw.trim(), shapeKeyOf(url, key), held.has(key), readKeys.has(key));
          if (row) rows.push(row);
        }
      }

      // Task constants: offered → hard, stated → soft.
      if (instrOrigin) {
        const outputs = end.ledger.filter((e) => e.binding.from === 'output').map((e) => e.value);
        if (outputs.length && end.script.length) {
          for (const [value, arm] of taskConstantArms(end.script, outputs, end.vars, end.runSpecific)) {
            const key = valueHash(value);
            if (this.filed.has(`constant ${key}`)) continue;
            this.filed.add(`constant ${key}`);
            this.pendingObs.push({ origin: instrOrigin, o: { k: 'value.class', key, v: 'constant', hard: arm === 'offered' } });
          }
        }
        // Credentials the scrub filed ambiguous: hard, hash only, no ev.
        for (const key of ambiguousCredentialHashes()) {
          if (this.filed.has(`credential ${key}`)) continue;
          this.filed.add(`credential ${key}`);
          this.pendingObs.push({ origin: instrOrigin, o: { k: 'value.class', key, v: 'credential', hard: true } });
        }
      }

      // Label shapes: two distinct minted values under one key sharing a shape.
      for (const c of this.candidates) {
        if (!c.minted || !c.shapeKey || !shapeable(c.value)) continue;
        if (end.vars.some((v) => v.length >= 2 && c.value.includes(v))) continue;
        const hash = valueHash(c.value);
        const shape = shapeOf(c.value);
        const mem = (this.shapes.get(c.shapeKey) ?? []).filter((m) => m.hash !== hash);
        mem.push({ hash, shape });
        this.shapes.set(c.shapeKey, mem.slice(-2));
        const inSession = mem.length >= 2 && mem.at(-2)!.shape === shape;
        // Across sessions: a mint fact under this key from another value, same shape.
        const sf = before.get(c.origin);
        const across =
          !inSession &&
          !!sf?.facts.some((f) => f.k === 'value.class' && f.v === 'mint' && f.key !== hash && f.ev === `${c.shapeKey} ${shape}`);
        if (!inSession && !across) continue;
        const filedKey = `shape ${c.shapeKey} ${shape} ${hash}`;
        if (this.filed.has(filedKey)) continue;
        this.filed.add(filedKey);
        this.pendingObs.push({ origin: c.origin, o: { k: 'value.shape', key: c.shapeKey, v: { re: shape, n: 2 }, hard: true } });
      }

      this.writeRows(rows, instruction?.k === 'instruction' ? instruction.text : '');
      this.flushObservations();
    } catch {
      /* shadow only */
    } finally {
      this.candidates = [];
      this.pendingObs = [];
    }
    return rows;
  }

  /**
   * Rows `facts.strip` for the identifiers stripLeakedCandidates weighed:
   * `candidates` are the ledger's identifier entries it considered, `stripped`
   * the values it treats as run values. Written at once.
   */
  stripRows(candidates: readonly LedgerEntry[], stripped: ReadonlySet<string>, context = 'export'): ShadowRow[] {
    const rows: ShadowRow[] = [];
    try {
      const cache = new Map<string, SiteFacts>();
      const factsAt = (origin: string) => {
        if (!cache.has(origin)) cache.set(origin, this.store.read(origin));
        return cache.get(origin)!;
      };
      for (const e of candidates) {
        const shapeKey = this.keyOfValue.get(e.value);
        const origin = shapeKey ? originOf(shapeKey.split('|')[0]) : null;
        if (!origin) continue;
        const row = stripRow(factsAt(origin), e.value, shapeKey, stripped.has(e.value));
        if (row) rows.push(row);
      }
      this.writeRows(rows, context);
    } catch {
      /* shadow only */
    }
    return rows;
  }

  private writeRows(rows: ShadowRow[], instruction: string): void {
    const fresh = rows.filter((r) => {
      const id = JSON.stringify([r.rule, r.step, r.fact, r.heuristic, r.evidence]);
      if (this.rowsWritten.has(id)) return false;
      this.rowsWritten.add(id);
      return true;
    });
    rows.splice(0, rows.length, ...fresh);
    if (fresh.length) writeShadow(this.shadowDir, { session: this.sessionId, instruction }, fresh);
  }

  private flushObservations(): void {
    const byOrigin = new Map<string, Observation[]>();
    for (const { origin, o } of this.pendingObs) {
      const list = byOrigin.get(origin) ?? [];
      list.push({ ...o, session: this.sessionId });
      byOrigin.set(origin, list);
    }
    for (const [origin, obs] of byOrigin) this.store.observe(origin, obs);
  }
}

/** The url an instruction ended on: its last step's diff url, else the instruction's own. */
function instructionUrl(entries: readonly RecordedEntry[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.k === 'step' && e.diff?.url) return e.diff.url;
    if (e.k === 'instruction' && e.url) return e.url;
  }
  return undefined;
}
