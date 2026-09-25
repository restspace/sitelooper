import { Ajv, type ValidateFunction } from 'ajv';
import { digitDominant, tokenPattern } from '../skills/shape.js';

export interface Report {
  status: 'success' | 'failure' | 'blocked';
  summary: string;
  details?: string;
  evidence?: {
    url?: string;
    capturedDialogs?: string[];
    values?: Record<string, string | number | boolean | null>;
  };
}

export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary'],
  properties: {
    status: { type: 'string', enum: ['success', 'failure', 'blocked'] },
    summary: { type: 'string', minLength: 1, maxLength: 2000 },
    details: { type: 'string' },
    evidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string' },
        capturedDialogs: { type: 'array', items: { type: 'string' } },
        values: {
          type: 'object',
          additionalProperties: { type: ['string', 'number', 'boolean', 'null'] },
        },
      },
    },
  },
} as const;

let compiled: ValidateFunction | null = null;

function validator(): ValidateFunction {
  if (!compiled) {
    const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
    compiled = ajv.compile(REPORT_SCHEMA);
  }
  return compiled;
}

export type ReportValidation =
  | { ok: true; report: Report; coerced?: string[] }
  | { ok: false; error: string };

/** Longest stringified value kept for a single evidence entry. */
const VALUE_CHARS = 300;
const SUMMARY_CHARS = 2000;

/**
 * Validate the agent's `report` tool call, repairing near-misses first.
 *
 * Providers vary in how strictly they honour tool schemas, and the common
 * failures are presentational rather than substantive: a list of ids where the
 * schema wants one scalar, a stray extra key, a status that differs only in
 * case. Rejecting those is expensive out of all proportion to the mistake —
 * it costs a retry turn, then a blocked bail-out, and (with escalation on) a
 * paid retry of the whole instruction on a pricier model, all because the
 * agent formatted a value it had already correctly obtained.
 *
 * So: repair what is unambiguously repairable, and report what was repaired.
 * Anything still invalid after coercion is a real disagreement about content
 * and is fed back to the model as before.
 */
/**
 * The phrase in a `success` summary that says the work was NOT finished, or
 * null. rpgr3-r2's 03-add reported success with "the visualization is still
 * 'Time series' rather than 'Text' … ran out of turns" — accepted as-is, the
 * flow marked the step done and the API verifier found no text panel. The
 * status and the prose disagree; the loop holds such a report once and asks
 * the model to make them agree.
 */
export function admitsIncompletion(summary: string): string | null {
  const m =
    /\b(ran out of turns|out of turns|unable to|was not able to|not able to|could not|couldn't|did not (?:complete|finish|save|succeed|manage)|failed to|not (?:yet )?saved|unsaved changes|incomplete|still (?:shows?|set to|the default|remains?)|remains? (?:unset|unchanged|the default))\b/i.exec(
      summary,
    );
  if (!m) return null;
  // "still shows 3 panels after refresh, as expected" is a verified
  // invariant, not an admission: an assertion word right after the phrase
  // clears it.
  const tail = summary.slice(m.index + m[0].length, m.index + m[0].length + 60);
  if (/\b(as (?:expected|required|intended|designed)|which is (?:correct|right|expected)|correctly)\b/i.test(tail)) return null;
  return m[1];
}

export function validateReport(input: unknown): ReportValidation {
  const validate = validator();
  if (validate(input)) return { ok: true, report: withoutNullValues(input as Report) };

  const { value, notes } = coerce(input);
  if (notes.length && validate(value)) {
    return { ok: true, report: value as unknown as Report, coerced: notes };
  }

  const error = (validate.errors ?? [])
    .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
    .join('; ');
  return { ok: false, error: error || 'report did not match the required schema' };
}

/**
 * The schema accepts a null value, so a schema-valid report skips coerce's
 * null drop; this applies the same rule there (see coerce for why a null is
 * absent, not the string "null").
 */
function withoutNullValues(report: Report): Report {
  const values = report.evidence?.values;
  if (!values || !Object.values(values).some((v) => v === null)) return report;
  const kept = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
  return { ...report, evidence: { ...report.evidence, values: kept } };
}

/** A scalar the schema accepts, or null when the input cannot be reduced to one. */
function toScalar(v: unknown): string | number | boolean | null {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return typeof v === 'string' && v.length > VALUE_CHARS ? v.slice(0, VALUE_CHARS - 1) + '…' : v;
  }
  // The frequent real-world miss: an array of ids/names where one scalar was asked for.
  const text = Array.isArray(v) ? v.map((x) => (x === null ? 'null' : String(x))).join(', ') : safeJson(v);
  return text.length > VALUE_CHARS ? text.slice(0, VALUE_CHARS - 1) + '…' : text;
}

/** At most this many fields are made from one record value. */
const MAX_RECORD_FIELDS = 60;

/**
 * A value that is a record (a plain object) or a list of records, as one
 * scalar per field: `key_field`, or `key_<n>_field` for the n-th record (from
 * 1). Null for anything else — a scalar, a list of scalars (toScalar joins
 * those), a list mixing records and scalars. Field names keep their letters,
 * digits and underscores; a nested value goes through toScalar.
 */
function recordFields(key: string, v: unknown): [string, string | number | boolean][] | null {
  const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  const records = isRecord(v) ? [v] : Array.isArray(v) && v.length && v.every(isRecord) ? v : null;
  if (!records) return null;
  const out: [string, string | number | boolean][] = [];
  records.forEach((r, i) => {
    for (const [field, value] of Object.entries(r)) {
      if (value === null || value === undefined || out.length >= MAX_RECORD_FIELDS) continue;
      const name = field.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '') || 'value';
      const scalar = toScalar(value);
      if (scalar === null) continue;
      out.push([Array.isArray(v) ? `${key}_${i + 1}_${name}` : `${key}_${name}`, scalar]);
    }
  });
  return out.length ? out : null;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function coerce(input: unknown): { value: Record<string, unknown>; notes: string[] } {
  const notes: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { value: {}, notes };
  }
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof src.status === 'string') {
    const norm = src.status.trim().toLowerCase();
    if (norm !== src.status) notes.push(`status normalised to "${norm}"`);
    out.status = norm;
  } else if (src.status !== undefined) {
    out.status = src.status; // leave it: not something we can guess
  }

  if (typeof src.summary === 'string') {
    out.summary =
      src.summary.length > SUMMARY_CHARS ? src.summary.slice(0, SUMMARY_CHARS - 1) + '…' : src.summary;
    if (out.summary !== src.summary) notes.push('summary truncated');
  } else if (src.summary !== undefined) {
    out.summary = String(src.summary);
    notes.push('summary stringified');
  }

  if (src.details !== undefined) {
    out.details = typeof src.details === 'string' ? src.details : safeJson(src.details);
    if (out.details !== src.details) notes.push('details stringified');
  }

  if (typeof src.evidence === 'object' && src.evidence !== null && !Array.isArray(src.evidence)) {
    const ev = src.evidence as Record<string, unknown>;
    const evOut: Record<string, unknown> = {};

    if (ev.url !== undefined) {
      evOut.url = typeof ev.url === 'string' ? ev.url : String(ev.url);
      if (evOut.url !== ev.url) notes.push('evidence.url stringified');
    }

    if (ev.capturedDialogs !== undefined) {
      const list = Array.isArray(ev.capturedDialogs) ? ev.capturedDialogs : [ev.capturedDialogs];
      if (!Array.isArray(ev.capturedDialogs)) notes.push('evidence.capturedDialogs wrapped in an array');
      const strs = list.map((d) => (typeof d === 'string' ? d : safeJson(d)));
      if (strs.some((s, i) => s !== list[i])) notes.push('evidence.capturedDialogs entries stringified');
      evOut.capturedDialogs = strs;
    }

    if (typeof ev.values === 'object' && ev.values !== null && !Array.isArray(ev.values)) {
      const vals: Record<string, unknown> = {};
      const fixed: string[] = [];
      for (const [k, v] of Object.entries(ev.values as Record<string, unknown>)) {
        // A null is the model saying it did NOT observe the value, and every
        // consumer stringifies values: fwod47-n3's failed 03-add reported
        // `second_product_unit_price: null`, 04-open bound "null" as the
        // price and replayed against it. Absent, like undefined.
        if (v === undefined || v === null) {
          fixed.push(k);
          continue; // JSON has no undefined; drop rather than invent a value
        }
        // Records — an object, or a list of them — become one value per field
        // (`assets_1_tag`, `assets_1_name`), each a string a later read can be
        // matched to. snipeit fwsi13-n1 02-report reported its seed assets as
        // [{tag, name}, …], and String() made each "[object Object]": the names
        // reached no value, no read and no replay's report (n2, n3 obj 1).
        const fields = recordFields(k, v);
        if (fields) {
          for (const [fk, fv] of fields) if (!(fk in vals) && !(fk in (ev.values as Record<string, unknown>))) vals[fk] = fv;
          fixed.push(k);
          continue;
        }
        const scalar = toScalar(v);
        if (scalar !== v) fixed.push(k);
        vals[k] = scalar;
      }
      if (fixed.length) notes.push(`evidence.values flattened to scalars: ${fixed.join(', ')}`);
      evOut.values = vals;
    } else if (ev.values !== undefined) {
      notes.push('evidence.values dropped (not an object)');
    }

    const extras = Object.keys(ev).filter((k) => !['url', 'capturedDialogs', 'values'].includes(k));
    if (extras.length) notes.push(`unknown evidence key(s) dropped: ${extras.join(', ')}`);
    out.evidence = evOut;
  } else if (src.evidence !== undefined) {
    notes.push('evidence dropped (not an object)');
  }

  const rootExtras = Object.keys(src).filter(
    (k) => !['status', 'summary', 'details', 'evidence'].includes(k),
  );
  if (rootExtras.length) notes.push(`unknown key(s) dropped: ${rootExtras.join(', ')}`);

  return { value: out, notes };
}

/** One read/read_all the instruction performed, with its parsed result values. */
export interface ObservedRead {
  target: string;
  values: string[];
  /** Name the model gave the value AT READ TIME (`read`'s label argument). */
  label?: string;
}

/**
 * Publish reads the model LABELLED at call time into `evidence.values`.
 *
 * The naming problem is an attention problem, not a comprehension one: asked at
 * report time, the model must recall a value it read fifteen turns earlier, and
 * the probe put wording changes at noise level while MOVING the ask 4x'd
 * compliance. This moves it all the way — the label is given in the same tool
 * call that reads the value, when the model's attention is on that exact value,
 * and everything after is deterministic: the labelled value goes into evidence
 * under the model's own name, the naming ask never needs to fire for it, and
 * `readLabel` in compile ties the recorded read to that name for replay.
 *
 * Runs BEFORE backfillReadValues so the model's name wins over a selector slug
 * — `order_reference`, not `h1`. Singular reads only: read_all's label would
 * name a table. Mutates the report; returns the names added.
 */
export function promoteLabelledReads(report: Report, reads: ObservedRead[]): string[] {
  if (report.status !== 'success') return [];
  const values: Record<string, string | number | boolean | null> = { ...(report.evidence?.values ?? {}) };
  const present = new Set(Object.values(values).map((v) => String(v).trim()));
  const added: string[] = [];
  for (const read of reads) {
    if (!read.label || read.values.length !== 1) continue;
    const v = read.values[0].trim();
    if (!v || v.length > VALUE_CHARS || present.has(v)) continue;
    // The model vouched for this value by labelling it, so an unusable label
    // falls back rather than dropping the value (same stance as addEvidenceValue).
    const name = uniqueName(slug(read.label) ?? 'value', values);
    values[name] = v;
    present.add(v);
    added.push(name);
  }
  if (added.length) (report.evidence ??= {}).values = values;
  return added;
}

/** Most read values promoted into evidence per report — enough for any real page summary, a cap against read_all floods. */
const MAX_PROMOTED = 8;
const MIN_PROMOTED_LEN = 3;

/**
 * Deterministically promote read results the report MENTIONED but did not
 * structure. Compile keeps a recorded `read` only when its value appears in
 * `evidence.values` (that is the proof the read mattered) — but models often
 * put the value in the summary prose instead, so the read is dropped, no
 * replayable step survives, and the instruction compiles to no skill. This
 * closes that gap without gating: for each value a real read observed, if the
 * prose cites it verbatim (token boundaries) and `evidence.values` does not
 * already carry it, add it under a name derived from the read's target.
 * Mutates the report; returns the names added.
 */
export function backfillReadValues(
  report: Report,
  reads: ObservedRead[],
  opts: { requireCitation?: boolean } = {},
): string[] {
  const values: Record<string, string | number | boolean | null> = { ...(report.evidence?.values ?? {}) };
  const present = new Set(Object.values(values).map((v) => String(v).trim()));
  const added: string[] = [];
  for (const { read, value: v } of promotableReads(report, reads, opts)) {
    if (added.length >= MAX_PROMOTED) break;
    // A value whose only available name would be "value" is not worth
    // publishing. fwod18's 03-create promoted the column heading "Untaxed
    // Amount" and the status badge "New" under `value` and `value_2`,
    // because both reads targeted a snapshot ref and slug() can make no
    // name from `@e757`. Those became report outputs no later step would
    // ever reference, while the value seven steps DID need went unpinned.
    // Publishing page furniture under a meaningless name is strictly worse
    // than not publishing it: it is noise a replay must still reproduce.
    const base = slug(read.target);
    if (!base) continue;
    const name = uniqueName(base, values);
    values[name] = v;
    present.add(v);
    added.push(name);
  }
  if (added.length) (report.evidence ??= {}).values = values;
  return added;
}

/**
 * Read values the report CITED in prose but did not put in `evidence.values`,
 * paired with the read that observed them. The one filter both the deterministic
 * backfill and the naming retry work from, so they can never disagree about
 * which values are unnamed.
 */
function promotableReads(
  report: Report,
  reads: ObservedRead[],
  opts: { requireCitation?: boolean } = {},
): Array<{ read: ObservedRead; value: string }> {
  const { requireCitation = true } = opts;
  const prose = `${report.summary} ${report.details ?? ''}`;
  const present = new Set(Object.values(report.evidence?.values ?? {}).map((v) => String(v).trim()));
  const out: Array<{ read: ObservedRead; value: string }> = [];
  const seen = new Set<string>();
  for (const read of reads) {
    for (const raw of read.values) {
      const v = raw.trim();
      if (v.length < MIN_PROMOTED_LEN || v.length > VALUE_CHARS || present.has(v) || seen.has(v)) continue;
      // Citation is the proof the read MATTERED, and dropping it is only safe
      // for singular reads: a read that deliberately targeted one element is
      // itself the claim the value matters, while read_all's forty cells are a
      // table, not forty claims. So `requireCitation: false` still requires it
      // of bulk values.
      if (!cites(prose, v) && (requireCitation || read.values.length > 1)) continue;
      seen.add(v);
      out.push({ read, value: v });
    }
  }
  return out;
}

/**
 * Values this instruction read off the page and then described in prose without
 * naming them in `evidence.values`.
 *
 * These are the values `backfillReadValues` would name from their SELECTOR, and
 * a selector is a bad name in a way that compounds. fwod24 recorded the odoo
 * quotation reference as `02-create.h1`, because the model returned
 * `evidence.values: {}` on five of nine instructions and every name in the flow
 * came from the backfill. Eleven flow references pointed at `h1`; on both
 * replays the bare `page.locator('h1')` read missed, nothing republished the
 * output, and four of seven steps fell to the model with
 * `unresolved reference(s): 02-create.h1`. The model had the right name — n3's
 * own recovery report called it `quotation_reference` — but run 1's naming is
 * permanent, so the good name never got in.
 *
 * Asking once, naming the values so the model only has to label them, costs one
 * cheap turn on the RECORDING run and buys a name every later run reproduces.
 * Strengthening the tool-schema wording did not work: this is the same ask made
 * where it cannot be skimmed past.
 */
/**
 * What the loop says when it holds a report for naming. Exported so
 * bench/naming-probe.mjs measures the text that actually ships rather than a
 * copy of it that can drift out of agreement with this one.
 */
/**
 * Union of two reports' evidence values, keeping every value either one names.
 *
 * The naming retry asks for the report "unchanged except that evidence.values
 * includes each of those values", and models do not honour the "unchanged"
 * half. Traced over the recorded corpus, one retry went
 *
 *   before ["contact_name","contact_city","sales_order_title","sales_order_status"]
 *   after  ["contact_name","contact_city","order_reference","order_status"]
 *
 * — it added the order reference we asked for and silently dropped the title.
 * Taking the second report wholesale meant the ask added and subtracted in
 * equal measure, which is why firing it 8 times moved the score not at all.
 *
 * Union by VALUE, not by key: a model that renames `sales_order_status` to
 * `order_status` has not lost anything, and carrying both would publish the
 * same value twice under two names for later steps to choose between. The
 * second report's naming wins; only values it dropped entirely come back.
 */
export function mergeReportValues(
  first: Record<string, string | number | boolean | null> | undefined,
  second: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> {
  const out = { ...(second ?? {}) };
  const held = new Set(Object.values(out).map((v) => String(v).trim()));
  for (const [k, v] of Object.entries(first ?? {})) {
    if (held.has(String(v).trim()) || k in out) continue;
    out[k] = v;
  }
  return out;
}

export function namingAskMessage(unnamed: string[]): string {
  const it = unnamed.length === 1 ? 'it' : 'them';
  return (
    `report not accepted yet — you read ${unnamed.map((v) => JSON.stringify(v)).join(', ')} off the page and described ${it} in the summary, but evidence.values does not name ${it}. ` +
    'Call report again, unchanged except that evidence.values includes each of those values under the name a person would use for it ' +
    '(order_reference, unit_price, customer_name — not a selector fragment). Later work addresses records by these names; a value left only in prose cannot be used.'
  );
}

export function unnamedReadValues(
  report: Report,
  reads: ObservedRead[],
  opts: { requireCitation?: boolean } = {},
): string[] {
  if (report.status !== 'success') return [];
  const { requireCitation = false } = opts;
  if (requireCitation) return promotableReads(report, reads).slice(0, MAX_PROMOTED).map((p) => p.value);
  // Key the ask on what the READS returned, not on what the prose happens to
  // quote. The citation test earns its place in backfillReadValues, which
  // invents a name unilaterally and needs proof the read mattered. As a gate on
  // ASKING the author it is far too strict, and the probe priced it: over the
  // recorded corpus the ask fired on 3 of 27 instructions and was answered 3
  // times out of 3. A mechanism that works whenever it runs and runs on a ninth
  // of cases is a trigger problem, not a mechanism problem — and a summary that
  // says "created the quotation and confirmed it" without repeating S00021
  // never tripped it, which is the common case rather than the odd one.
  const present = new Set(Object.values(report.evidence?.values ?? {}).map((v) => String(v).trim()));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const read of reads) {
    // read_all is bulk by nature — a table of forty cells is not forty values
    // the caller needs named, and asking about them would bury the one that
    // matters. Its values still reach evidence through the backfill.
    if (read.values.length > 1) continue;
    // A read the model labelled at call time is already named — promotion
    // publishes it deterministically, so asking again would nag about work
    // that is done.
    if (read.label) continue;
    for (const raw of read.values) {
      const v = raw.trim();
      if (v.length < MIN_PROMOTED_LEN || v.length > VALUE_CHARS || present.has(v) || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out.slice(0, MAX_PROMOTED);
}

/** A name derived from a read's target, or null when the target names nothing. */
function slug(target: string): string | null {
  const s = target.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  // A target that is a SNAPSHOT REF names nothing. `@e5322` slugged to
  // `e5322`, buildFlow minted {{03-report.e5322}} into three later steps of
  // fwgr10's flow, and no replay ever resolved it — a reference no human or
  // model would write, pointing at a handle that expires with the snapshot.
  // Same defect as the prose-identifier path, second site; fixing one and not
  // looking for the other is why this survived.
  //
  // A selector-derived slug (`dashboard_title`, `price_cell`) is meaningful
  // and is kept.
  if (!s || /^e\d+$/.test(s)) return null;
  return s;
}

function uniqueName(base: string, taken: Record<string, unknown>): string {
  if (!(base in taken)) return base;
  for (let i = 2; ; i++) if (!(`${base}_${i}` in taken)) return `${base}_${i}`;
}

/**
 * Does the prose quote this value? Internal whitespace is elastic.
 *
 * fwod25's instr 5 read "£ 1,599.00" off the totals and wrote "£1,599.00" in
 * the summary. A verbatim test called that a miss, so the value was never
 * promoted and never named — one space between a currency symbol and its
 * digits. Models normalise spacing when they write prose; the page does not.
 * Everything else stays strict: this matches the same characters in the same
 * order, only tolerant about how much space sits between them.
 */
function cites(prose: string, value: string): boolean {
  return tokenPattern(value, '', { elasticSpace: true }).test(prose);
}

/** Most scalars taken out of one composed value. A read_all dumped as JSON is a table, not evidence. */
const MAX_LEAVES = 8;

/**
 * Split a report value the model COMPOSED out of several page values into the
 * values it was made of.
 *
 * fwod17's 03-open reported two order lines as JSON blobs:
 *
 *   line_1: {"product":"Customizable Desk","qty":"3.00","unit_price":"750.00",…}
 *
 * Nothing downstream can use that. `captureReadBack` pins evidence values on
 * the page, and no element shows that string, so the six reads the run really
 * did were recorded with no label; `publishedOutputs` keeps a report value
 * only when it is a pure slot fill, and this one is a hand-built literal. So a
 * tier-A replay correctly dropped it — and took `{{03-open.line_1#qty}}` with
 * it, sending four steps of the flow to recovery for values sitting on screen.
 *
 * A composite is really several values, so make it several. Each leaf is a
 * string a real element shows, which means read-back can pin it, the read gets
 * a label, and the flow references `{{03-open.line_1_qty}}` — an output every
 * zero-model replay republishes from its OWN page.
 *
 * The composite itself is dropped: keeping it would leave the unreferencable
 * form available to reference. Mutates the report; returns the names added.
 */
export function flattenComposedValues(report: Report): string[] {
  const values = report.evidence?.values;
  if (!values) return [];
  const added: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    if (typeof raw !== 'string' || !/^\s*[[{]/.test(raw)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // prose that merely opens with a bracket
    }
    const leaves = leavesOf(parsed);
    // Nothing to split, or a table rather than a record: leave it whole.
    if (!leaves.length || leaves.length > MAX_LEAVES) continue;
    delete values[key];
    for (const [path, value] of leaves) {
      const name = uniqueName(`${key}_${slug(path)}`, values);
      values[name] = value;
      added.push(name);
    }
  }
  return added;
}

/**
 * A reported KEY that is text the instruction read off the page is a datum,
 * not a name. fwgh8's 01-open reported `{"Seed: House style guide":
 * "Published", …}`: the seed titles became output names, a replay published
 * those recorded names whatever the list showed (two of its three reads were
 * a synthesized `link "Published"` that holds for any title), and 04-open's
 * v3 bound to `output:i1:Seed: House style guide`.
 *
 * Provenance decides, not the key's spelling: a key is a datum when a read of
 * THIS instruction returned it as a whole value (whitespace-insensitive). Each
 * such pair becomes two positional values, `item_<n>` = the key's text and
 * `item_<n>_value` = its value, so both are data — read-back pins each to the
 * element that shows it, and a replay publishes them only by re-observing
 * them. Runs before everything else touches the names (splitting, read-back,
 * the ledger's `output:` bindings), so every consumer sees one naming.
 * Mutates; returns the datum keys it moved.
 */
export function positionDatumKeys(report: Report, reads: ObservedRead[]): string[] {
  const values = report.evidence?.values;
  if (report.status !== 'success' || !values) return [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const seen = new Set(reads.flatMap((r) => r.values.map(norm)).filter(Boolean));
  const datum = (k: string) => seen.has(norm(k));
  const moved = Object.keys(values).filter(datum);
  if (!moved.length) return [];
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(values)) if (!datum(k)) out[k] = v;
  let n = 0;
  for (const [k, v] of Object.entries(values)) {
    if (!datum(k)) continue;
    let name: string;
    do name = `item_${++n}`;
    while (name in out || `${name}_value` in out);
    out[name] = norm(k);
    out[`${name}_value`] = v;
  }
  report.evidence!.values = out;
  return moved;
}

/**
 * Candidate boundaries inside a value the model JOINED out of several page
 * values. Comma and semicolon are what a model reaches for first; `/` and the
 * en/em dashes are the other separators seen in reports, and a newline or tab
 * is a pasted list.
 *
 * These are candidates only — nothing here decides anything. The split is
 * committed by the PAGE (see flattenProvenComposite), so a decimal comma
 * ("1,599.00") or a comma-joined sentence simply fails to pin and stays whole.
 */
const COMPOSED_SEPARATOR = /\s*[,;|/–—]\s*|[\n\t]+/;

/**
 * The delimiter-joined sibling of `flattenComposedValues`: same "a composite is
 * really several values" rule in the notation a model uses when it does not
 * reach for JSON.
 *
 * kanboard fwkb17: 01-open reported
 * `columns_left_to_right = "Backlog, Ready, Work in progress, Done"` where the
 * previous round's agent reported four scalars. No element shows the joined
 * string, so `captureReadBack` pinned nothing, no read got a label,
 * `liveReadsFor` found no snapshot line with that accessible name and
 * `pruneUnsourcedOutputs` correctly dropped the outputs — both replays scored
 * 5/6 (`obj 1: FAIL — column(s) not in report: Ready, Done`) against the
 * recording's 6/6, with no code change between the rounds.
 *
 * Shape is NOT the gate: `pin` is, and the caller hands it `captureReadBack`
 * against the live recording page. The split is committed only when EVERY part
 * independently pins, so the parts become real `(read-back)` reads — resolved
 * once, on a real page, at record time — rather than `unproven` `@synth` ones.
 * A comma-joined prose sentence pins nothing and is left exactly as it was.
 *
 * The cap and the positional naming are `flattenComposedValues`' own: parts run
 * through the same two-level `leavesOf` and the same MAX_LEAVES bound, so
 * `columns_left_to_right` becomes `columns_left_to_right_1…_4`.
 *
 * Returns the names added and whatever `pin` produced for each (the caller's
 * recorded steps), or two empty lists when the page did not vouch for the
 * split. Mutates the report only on commit.
 */
export async function flattenProvenComposite<T>(
  report: Report,
  key: string,
  pin: (value: string, name: string) => Promise<T | null>,
): Promise<{ names: string[]; pinned: T[] }> {
  const empty = { names: [] as string[], pinned: [] as T[] };
  const values = report.evidence?.values;
  const raw = values?.[key];
  if (!values || typeof raw !== 'string') return empty;
  const parts = raw.split(COMPOSED_SEPARATOR).map((s) => s.trim()).filter(Boolean);
  // One part is not a join; more than MAX_LEAVES is a table, not a record.
  if (parts.length < 2 || parts.length > MAX_LEAVES) return empty;
  const leaves = leavesOf(parts);
  if (leaves.length < 2 || leaves.length > MAX_LEAVES) return empty;
  const pending: Record<string, string> = {};
  const names: string[] = [];
  const pinned: T[] = [];
  for (const [path, value] of leaves) {
    // Against values AND the siblings staged so far: two parts of one
    // composite must not claim the same name.
    const name = uniqueName(`${key}_${slug(path)}`, { ...values, ...pending });
    const got = await pin(value, name);
    if (!got) return empty; // one part the page does not show ends the split
    pending[name] = value;
    names.push(name);
    pinned.push(got);
  }
  // Only now, with every part proven: drop the composite (keeping it would
  // leave the unreferencable form available to reference) and publish the parts.
  delete values[key];
  Object.assign(values, pending);
  return { names, pinned };
}

/** Case-folded letter/digit runs of a text, with where each starts. */
function wordRuns(text: string): { word: string; at: number }[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (m) => ({ word: m[0].toLowerCase(), at: m.index ?? 0 }));
}

/** Whitespace collapsed and trimmed: the unit a visible text is compared in. */
const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * The element texts a reported value is MADE OF, in order — or null when the
 * page does not account for it.
 *
 * Round 56. fwgt8-n1 reported `seed_issue_1: "Seed: triage inbox (#1)"` and
 * fwsi8-n1 `asset_1: "Asset Tag SEED-0001 / Name Seed: Reception Laptop"`.
 * No element shows either whole, so captureReadBack pinned nothing; neither
 * holds a list separator between two values the page shows, so the list
 * splitter (flattenProvenComposite) had nothing either. Both stayed recorded
 * literals, no replay re-read them, and both apps' replays scored obj 1 FAIL
 * with the titles and tags on the page they stood on. fwgt7 and fwsi7 had
 * passed because their n1 reported the same facts one per value.
 *
 * `texts` are the full visible texts of elements on the page the read-back
 * runs against (visibleTextsWithin). The value is carved by PROVENANCE:
 *  - an element text that stands inside the value, at word boundaries, is a
 *    part. Longest first, and a span once claimed is not claimed again, so
 *    `#1` (the issue's own number element) wins over the bare `1` a
 *    pagination link also shows, and the two are never both taken;
 *  - an element text made only of the instruction's own words (less its
 *    addresses and markers) is the model
 *    LABELLING the value ("Asset Tag", "Name" — the table's headers, and the
 *    words the caller asked for) and is never a part;
 *  - every letter/digit run of the value must then lie inside a part or be one
 *    of those instruction words. Anything else — "assigned to nobody" — is
 *    something no element showed, and the value is left whole: no partial
 *    guess;
 *  - a value some element shows WHOLE is never split (captureReadBack may have
 *    refused it for ambiguity; that is not this function's to overrule);
 *  - and at least one part must be more than one word: a lone "1" or "#3" is
 *    too common a text to be a read on its own, so a bare part is admitted only
 *    beside a substantive one, the way `#1` rides with its title.
 * Each part still has to pin on its own (captureReadBack's uniqueness and row
 * rules) before anything is committed — see flattenContainedComposite.
 */
export function planContainedParts(value: string, texts: readonly string[], instruction: string): string[] | null {
  const whole = collapse(value);
  if (!whole) return null;
  const candidates = [...new Set(texts.map(collapse))].filter(Boolean);
  if (candidates.includes(whole)) return null;
  // The instruction's WORDS: its addresses and markers are not how anyone
  // labels a value (fwgt8's `127.0.0.1` would otherwise make `#1` a label).
  const labels = new Set(wordRuns(instruction.replace(/\S+:\/\/\S+|\{\{[^}]*\}\}/g, ' ')).map((w) => w.word));
  const isWord = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
  const claimed: { start: number; end: number; text: string }[] = [];
  const usable = candidates
    .filter((t) => t.length < whole.length)
    .filter((t) => {
      const words = wordRuns(t);
      return words.length > 0 && !words.every((w) => labels.has(w.word));
    })
    .sort((a, b) => b.length - a.length);
  for (const text of usable) {
    for (let at = whole.indexOf(text); at >= 0; at = whole.indexOf(text, at + 1)) {
      const end = at + text.length;
      // Word boundaries on the value's side, wherever the part's own edge is a word character.
      if (isWord(text[0]) && isWord(whole[at - 1])) continue;
      if (isWord(text[text.length - 1]) && isWord(whole[end])) continue;
      if (claimed.some((c) => at < c.end && end > c.start)) continue;
      claimed.push({ start: at, end, text });
    }
  }
  if (!claimed.length || claimed.length > MAX_LEAVES) return null;
  const covered = (at: number): boolean => claimed.some((c) => at >= c.start && at < c.end);
  for (const w of wordRuns(whole)) if (!covered(w.at) && !labels.has(w.word)) return null;
  if (!claimed.some((c) => wordRuns(c.text).length > 1)) return null;
  return claimed.sort((a, b) => a.start - b.start).map((c) => c.text);
}

/**
 * planContainedParts, committed the way flattenProvenComposite commits a list:
 * every part must pin on the live page (the caller's `pin`, captureReadBack),
 * or nothing changes; on commit the composite is replaced by its parts —
 * `seed_issue_1` by `seed_issue_1_1` ("Seed: triage inbox") and
 * `seed_issue_1_2` ("#1") — so a replay re-reads each. One part (a single
 * labelled value, "Name: Seed: Spare Laptop") keeps the key.
 */
export async function flattenContainedComposite<T>(
  report: Report,
  key: string,
  texts: readonly string[],
  instruction: string,
  pin: (value: string, name: string) => Promise<T | null>,
): Promise<{ names: string[]; pinned: T[] }> {
  const empty = { names: [] as string[], pinned: [] as T[] };
  const values = report.evidence?.values;
  const raw = values?.[key];
  if (!values || typeof raw !== 'string') return empty;
  const parts = planContainedParts(raw, texts, instruction);
  if (!parts) return empty;
  const rest = Object.fromEntries(Object.entries(values).filter(([k]) => k !== key));
  const pending: Record<string, string> = {};
  const names: string[] = [];
  const pinned: T[] = [];
  for (const [i, part] of parts.entries()) {
    const name = parts.length === 1 ? key : uniqueName(`${key}_${i + 1}`, { ...rest, ...pending });
    const got = await pin(part, name);
    if (!got) return empty;
    pending[name] = part;
    names.push(name);
    pinned.push(got);
  }
  delete values[key];
  Object.assign(values, pending);
  return { names, pinned };
}

/** Scalar leaves of a parsed value, two levels deep, as [path, text] pairs. */
function leavesOf(node: unknown, prefix = '', depth = 0): [string, string][] {
  if (node === null || typeof node !== 'object') {
    const text = String(node ?? '').trim();
    return prefix && text ? [[prefix, text]] : [];
  }
  if (depth >= 2) return [];
  const entries = Array.isArray(node) ? node.map((v, i) => [String(i + 1), v] as const) : Object.entries(node);
  return entries.flatMap(([k, v]) => leavesOf(v, prefix ? `${prefix}_${k}` : k, depth + 1));
}

/** Record identifiers cited in prose per report, and their shape. */
const MAX_PROSE_IDS = 3;
const MIN_PROSE_ID_LEN = 4;
const MAX_PROSE_ID_LEN = 40;

/**
 * Identifier-like tokens the report's prose cites but `evidence.values` does
 * not carry: an order reference (S00021), a ticket ref (RD-1015), a generated
 * uid. The test is the product's one shape predicate (shape.ts
 * `digitDominant`, which already refuses prices, dates and times) minus bare
 * integers — prose is full of counts ("added 2 lines", "1042 rows"), and a
 * count pinned as `ref` is a wrong identity, where a missed ref costs the
 * recovery turn it always did.
 *
 * These are the values later flow steps address the run's own record BY, so a
 * step that leaves one unstructured strands every later step on the RECORDED
 * run's record: fwod5-n2/n3 cancelled sales order S00021 — run n1's order —
 * because the confirm step reported its reference only in prose and the flow
 * had no reference to thread. The caller pins them on the live page (see
 * captureReadBack) so a replay re-reads its own.
 */
export function proseIdentifiers(report: Report): string[] {
  // A url in prose is an address, not a citation: its host ("127.0.0.1") and
  // path segments are the app's, and one published as `ref` would turn every
  // later url into a reference. Url parts have their own provenance path
  // (flow.ts url outputs), so they are skipped here, not judged.
  const prose = `${report.summary} ${report.details ?? ''}`.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ');
  const present = new Set(Object.values(report.evidence?.values ?? {}).map((v) => String(v).trim()));
  const out: string[] = [];
  for (const m of prose.matchAll(/[A-Za-z0-9][A-Za-z0-9._-]*/g)) {
    if (out.length >= MAX_PROSE_IDS) break;
    const v = m[0].replace(/[.\-_]+$/, '');
    if (v.length < MIN_PROSE_ID_LEN || v.length > MAX_PROSE_ID_LEN) continue;
    if (!digitDominant(v, 'proposal') || /^\d+$/.test(v)) continue;
    // Not references, though they pass the shape: a snapshot ref
    // (e1234), an ordinal (10th), a measurement (100px, 30s). Each used to
    // take one of the three slots and crowd out the real S00021.
    if (/^e\d+$/.test(v) || /^\d+(st|nd|rd|th)$/i.test(v) || /^\d+(px|ms|s|m|h|d|kb|mb|gb|%)$/i.test(v)) continue;
    if (present.has(v) || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

/**
 * Publish every prose-cited identifier as a `ref` output, pinned to the page
 * where possible (`pin` returns false when the value cannot be located to one
 * element) and published anyway where not.
 *
 * Unpinned used to mean "stays prose", and prose is invisible: fwrd44-n1's
 * create step reported its ticket only as "…appears in the refreshed list as
 * RD-1128", the detail page shows RD-1128 twice (breadcrumb and header), the
 * pin refused, and RD-1128 went into four later flow instructions as a
 * LITERAL — every replay naming the recording's ticket, with no guard able to
 * see it because nothing had banked it. Published, it becomes a reference:
 * a replay that cannot re-read it sends the consumer to recovery, which is
 * told the name to report. Cost, never a wrong record.
 */
export async function publishProseIdentifiers(
  report: Report,
  pin: (value: string) => Promise<boolean>,
): Promise<{ pinned: string[]; unpinned: string[] }> {
  const pinned: string[] = [];
  const unpinned: string[] = [];
  for (const value of proseIdentifiers(report)) {
    let ok = false;
    try {
      ok = await pin(value);
    } catch {
      ok = false; // a wedged page must not lose the citation
    }
    (ok ? pinned : unpinned).push(addEvidenceValue(report, 'ref', value));
  }
  return { pinned, unpinned };
}

/** Add a value to a report's evidence under a fresh name derived from `base`. */
export function addEvidenceValue(report: Report, base: string, value: string): string {
  const values: Record<string, string | number | boolean | null> = { ...(report.evidence?.values ?? {}) };
  // The caller vouched for this one by naming it explicitly ("ref"), so an
  // unusable base falls back rather than dropping the value.
  const name = uniqueName(slug(base) ?? 'value', values);
  values[name] = value;
  (report.evidence ??= {}).values = values;
  return name;
}

/** What this run itself produced: the screenshots it saved, and the stored skills it knows. */
export interface RunArtefacts {
  /** Paths of screenshots this instruction saved (the screenshot tool's "screenshot saved: <path>"). */
  screenshots: readonly string[];
  /** Whether an id names a stored skill (the skill store, or a skill this run listed or invoked). */
  skills: (id: string) => boolean;
}

/**
 * The report keys whose value names one of sitelooper's OWN artefacts: a
 * screenshot this run saved (its path, or its file name), or a stored skill's
 * id. None of that is page data, and a value that is not page data is never a
 * finding. fwsi7 04-report's recovery published `ref: "s_d5098a"` — the skill
 * it had just run — and `ref_3: "ba00005_view.png"`, `screenshot_view:
 * "/tmp/ba00005_view.png"`: its own screenshots, which the flow then declared
 * as outputs of every step and a compiled artifact could never produce.
 *
 * Provenance, not shape: a value is an artefact because THIS run made or
 * knows the thing it names, never because it looks like a path or an id — a
 * page that shows "invoice.png" or a code "s_abc123" is reporting data.
 */
export function artefactKeys(values: Record<string, unknown>, run: RunArtefacts): string[] {
  const files = run.screenshots.map((p) => p.trim()).filter(Boolean);
  const names = files.map((p) => p.split(/[\\/]/).pop() ?? p).filter(Boolean);
  return Object.entries(values)
    .filter(([, raw]) => {
      const v = String(raw ?? '').trim();
      if (!v) return false;
      if (run.skills(v)) return true;
      return files.some((f) => v === f || v.includes(f)) || names.some((n) => v === n);
    })
    .map(([k]) => k);
}
