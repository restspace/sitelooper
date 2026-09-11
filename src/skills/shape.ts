/**
 * THE SHAPE RULE — the one place in the product that reads a value's
 * characters to guess whether it is an identifier.
 *
 * > A value's KIND is never DECIDED by inspecting its characters. It is
 * > decided by what the run observed, or by what a later run demonstrates.
 * > A shape test may PROPOSE; only evidence may DECIDE.
 *
 * This exists because the alternative has a silent failure mode. A record id
 * that does not *look* like one gets left literal, the replay acts on the
 * recording run's record, and every check passes — a green run that did the
 * wrong work. Cost is recoverable; silence is not.
 *
 * The rule is enforced two ways:
 *
 *  1. Every character-reading id test lives here and nowhere else: the
 *     predicate (`digitDominant`, and `looksLikeId` built on it), the token
 *     boundary built from it (`tokenPattern`), and the skeleton built from it
 *     (`skeleton`). Callers of the predicate must name the `ShapePrior` they
 *     use it as; there is deliberately no `'verdict'` member.
 *  2. `test/shape-gate.test.ts` pins the complete inventory of call sites,
 *     file by file and question by question, with the direction each one
 *     fails in, and fences every other character-class regex in src/ behind
 *     an allowlist. Adding either fails the test until the inventory says
 *     why — which is the moment to ask whether evidence could decide instead.
 *
 * The evidence mechanisms that replace a verdict, in preference order:
 *
 *  - **Position.** `idPositionPart` (ledger.ts): a url query/hash param NAMED
 *    `id` holds a record id whatever its characters. The url's own vocabulary
 *    settles what a shape cannot.
 *  - **Provenance.** `RunLedger` (ledger.ts): the run demonstrably produced
 *    this value, so it is run-scoped whatever it looks like.
 *  - **Cross-run variance.** `noteOutputEvidence`/`varyingValues` (flow.ts): a
 *    value a later run contradicted is this run's. One demonstration of
 *    difference is a permanent veto; agreement demonstrates nothing.
 *
 * See PLAN-evidence-over-shape.md for the full argument.
 */

/**
 * What a caller is allowed to use a shape test AS.
 *
 * There is no `'verdict'`. That is the point of the type: a shape test that
 * decides something on its own has no legal spelling here.
 */
export type ShapePrior =
  /**
   * Run 1 has no cross-run evidence to consult and must act now. The answer
   * is provisional and a later run's evidence overrides it. Every site using
   * this prior must fail toward COST (an unnecessary reference, a recovery
   * turn) and never toward SILENCE (a literal acting on the wrong record).
   */
  | 'first-run'
  /**
   * Sorts or ranks candidates that are all admissible anyway. A wrong answer
   * changes which candidate is tried first, never whether it is tried.
   */
  | 'ordering'
  /**
   * Proposes a generalisation or a slot that a later run confirms or retires
   * (softUrlMatch's staged generalisations, discoverSlots' candidates). The
   * proposal has no authority until something observes it hold.
   */
  | 'proposal'
  /**
   * Shapes a diagnostic message or a similarity score. No control flow
   * depends on the answer.
   */
  | 'diagnostic';

/**
 * The length floor for BANKING a value on shape alone. Three, not four:
 * repair-desk's record ids are "t15". The predicates below have no floor —
 * "x7" and "44" are identifiers — and a caller that admits values on shape
 * applies this one explicitly, because a two-character value is too easy to
 * find by accident to thread as a reference.
 */
export const MIN_ID_LEN = 3;

/**
 * A measured quantity: exactly one '.' with a digit on each side of it.
 * "125.00", "$125.00", "4,550.00", "3.14", "1.5kg". A price or a quantity is
 * a figure the app computed, not a pointer to a record, and banking them as
 * identifiers deleted real locators out of fwod28's and fwrd39's stores
 * ("5.00" condemned `text("£ 425.00")`). Two dots ("127.0.0.1", "1.2.3") is
 * an address or a version and is not excluded here.
 */
function isDecimal(s: string): boolean {
  return (s.match(/\./g) ?? []).length === 1 && /\d\.\d/.test(s);
}

const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?$/i;

function isTime(s: string): boolean {
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s?([ap]\.?m\.?)?$/i.exec(s);
  if (!t) return false;
  const [h, m, sec, meridiem] = [Number(t[1]), Number(t[2]), t[3] === undefined ? 0 : Number(t[3]), t[4]];
  if (m > 59 || sec > 59) return false;
  return meridiem ? h >= 1 && h <= 12 : h <= 23;
}

/**
 * A numeric date with one separator used throughout: y-m-d (a four-digit
 * first part), or d/m/y and m/d/y (a two- or four-digit last part). The two
 * parts that are not the year must be a real month and day in either order,
 * so "12-34-56" — a plausible reference — is not a date.
 */
function isNumericDate(s: string): boolean {
  const d = /^(\d{1,4})([/.-])(\d{1,2})\2(\d{1,4})$/.exec(s);
  if (!d) return false;
  const [a, b, c] = [d[1], d[3], d[4]];
  let pair: [number, number];
  if (a.length === 4) pair = [Number(b), Number(c)];
  else if ((c.length === 2 || c.length === 4) && a.length <= 2) pair = [Number(a), Number(b)];
  else return false;
  const md = (m: number, day: number) => m >= 1 && m <= 12 && day >= 1 && day <= 31;
  return md(pair[0], pair[1]) || md(pair[1], pair[0]);
}

/** "1 Sep 2026", "1st September, 2026", "Sep 1, 2026". */
function isNamedDate(s: string): boolean {
  const w = s.split(/\s+/);
  if (w.length !== 3) return false;
  const day = (x: string) => {
    const m = /^(\d{1,2})(?:st|nd|rd|th)?,?$/i.exec(x);
    return Boolean(m) && Number(m![1]) >= 1 && Number(m![1]) <= 31;
  };
  const year = (x: string) => /^\d{2}(?:\d{2})?$/.test(x);
  return year(w[2]) && ((day(w[0]) && MONTH.test(w[1])) || (MONTH.test(w[0]) && day(w[1])));
}

/**
 * A real calendar date or clock time — range-checked, not merely date-SHAPED
 * — alone or as a date-time ("2026-09-01T14:30:00Z", kanboard's
 * "09/03/2026 07:22"). The recording's moment, never a record.
 */
function isDateOrTime(s: string): boolean {
  if (isTime(s) || isNumericDate(s) || isNamedDate(s)) return true;
  const dt = /^(\S+)[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (dt) return isNumericDate(dt[1]) && isTime(dt[2]);
  const withMeridiem = /^(\S+) (\d{1,2}:\d{2}(?::\d{2})?\s?[ap]\.?m\.?)$/i.exec(s);
  return Boolean(withMeridiem) && isNumericDate(withMeridiem![1]) && isTime(withMeridiem![2]);
}

/** At least as many digits as everything else. */
function dominated(s: string): boolean {
  const digits = (s.match(/\d/g) ?? []).length;
  return digits > 0 && digits >= s.length - digits;
}

/**
 * THE predicate: is this value NUMERIC in the sense every character-reading
 * site in the product means — a thing that counts or points, rather than a
 * word?
 *
 * A value is numeric when its digits are at least as many as its other
 * characters ("S00021", "RD-1015", "t15", "x7", "44", "a1b2c3d4"), unless it
 * is a measured quantity (one '.', "125.00") or a real date or time
 * ("2026-09-01", "14:30"). A value joined by '-' or '_' is also numeric when
 * any one of its pieces is: "fwrd24l-n1" is a runid because "n1" is, while
 * "bench-service-health" and "o_form_view_group" are words all the way
 * through. That is the same split the skeleton makes (see `skeleton`), so
 * the whole-value answer and the piece-by-piece answer cannot disagree.
 *
 * Used directly wherever an ID answer GENERALISES — a url segment becomes
 * `:id`, a locator token becomes `*`, a name demotes a candidate, a prose
 * token is proposed as the run's ref. There a false ID over-merges, which is
 * the silent direction, so this test stays narrow: a word with no digit is
 * never numeric, however long, and "form2" is a word.
 *
 * @param prior why the caller is entitled to read characters at all. Not used
 *   at runtime — it documents the site and is what `test/shape-gate.test.ts`
 *   counts. A site that cannot name a prior is a site that wants a verdict.
 */
export function digitDominant(value: string, prior: ShapePrior): boolean {
  void prior;
  const s = String(value ?? '').trim();
  if (!s || isDecimal(s) || isDateOrTime(s)) return false;
  if (dominated(s)) return true;
  return /[-_]/.test(s) && s.split(/[-_]+/).some(dominated);
}

/**
 * A generated token that is not digit-dominant: one unbroken token (no
 * whitespace) that carries a digit at all — grafana's uid "afw6yy5xx9" is
 * three digits in ten, "fwrd24l-n1" three in ten — or, with no '-' or '_',
 * is twelve or more characters ("cfwcsdxqdjabkf") or eight or more hex
 * letters ("deadbeef"). A hyphenated or underscored run of plain words is a
 * slug ("bench-service-health", "o_form_view_group"), never a token.
 *
 * Characters cannot tell "cfwcsdxqdjabkf" from "notifications", nor
 * "afw6yy5xx9" from "form2". That is why this arm is only ever reached
 * through `looksLikeId`, at sites where a false ID costs (a value banked, a
 * reference threaded that fails to resolve), and never where an ID answer
 * generalises.
 */
function generatedToken(s: string): boolean {
  if (/\s/.test(s)) return false;
  if (/\d/.test(s)) return true;
  if (/[_-]/.test(s)) return false;
  return s.length >= 12 || /^[0-9a-f]{8,}$/i.test(s);
}

/**
 * Identifier-like, for ADMITTING a value — banking it in the ledger,
 * minting a reference to it. `digitDominant`, plus the generated tokens it is
 * too narrow to see (`generatedToken`), which a first recording would
 * otherwise leave literal: fwgr2's and fwod27's leaks were both a record
 * pointer nobody banked, and real grafana uids are mostly letters.
 *
 * The two tests are one rule in two directions, not two rules. Every value
 * `digitDominant` calls numeric is identifier-like, and both refuse prices,
 * dates and times; the extra arm exists only because at an admission site
 * the wrong answer is a wasted reference, so the test may be generous —
 * while at a generalising site (url pattern, skeleton, token boundary) the
 * same generosity would merge "Administration" with "Configuration", or
 * "form2" with "form3". A caller picks by which way its failure goes.
 *
 * @param prior see `digitDominant`.
 */
export function looksLikeId(value: string, prior: ShapePrior): boolean {
  const s = String(value ?? '').trim();
  return digitDominant(s, prior) || (!isDecimal(s) && !isDateOrTime(s) && generatedToken(s));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * THE token boundary: where `value` stands as a whole token in some text.
 *
 * Letters and digits always bind. '-' and '_' bind only when the value is a
 * WORD: "form" must not match the middle of `o_form_view_group` (fwod5
 * shipped a var substituted into it) and "bench" must not match inside
 * `fr1-bench-dashboard` (fwgr8 referenced a tag that agreed with a slug by
 * coincidence). They split when the value is identifier-like, because a runid
 * prefix in "fr1-bench-dashboard" or a ticket ref in `ticket-link-t15` IS the
 * value.
 *
 * Keyed on `looksLikeId`, the generous test, not `digitDominant`, because of
 * which way a wrong answer goes. Every caller here is looking for a value the
 * run KNOWS (a var, an output, a slot, a banked leak): splitting too eagerly
 * substitutes where it should not, which leaves a reference that fails to
 * resolve (fwod5, fwgr8 — a recovery turn); binding too eagerly leaves the
 * recording's value literal, which is the silent direction. The runid "fr1"
 * is one digit in three: under `digitDominant` it would bind, and
 * "fr1-bench" would replay naming the recording run's dashboard.
 *
 * Every whole-token test in the product is built here — slot discovery, the
 * flow exporter's references, the ledger's leak scan and the stripper that
 * trusts it, report.ts's prose citation — so a match means the same thing to
 * all of them. There were six before this, with three different answers
 * about '_'.
 *
 * `elasticSpace` lets any run of whitespace inside the value match any run
 * (or none) in the text: models normalise "£ 1,599.00" to "£1,599.00" when
 * they write prose, and the page does not (fwod25).
 */
export function tokenPattern(value: string, flags = '', opts: { elasticSpace?: boolean } = {}): RegExp {
  const binds = looksLikeId(value, 'first-run') ? 'A-Za-z0-9' : 'A-Za-z0-9_-';
  const body = opts.elasticSpace ? escapeRe(value).replace(/\s+/g, '\\s*') : escapeRe(value);
  return new RegExp(`(?<![${binds}])${body}(?![${binds}])`, flags);
}

/**
 * THE skeleton: `text` with every numeric token blanked to `*`, so two
 * locators that differ only in the record they name compare equal
 * ("#row-1042 > a" and "#row-77 > a" → "#row-* > a"; "ticket-link-t15" →
 * "ticket-link-*").
 *
 * Tokens are maximal runs of letters and digits — every other character is a
 * separator and is kept — and each is tested with `digitDominant`, so this and
 * `tokenPattern` agree on what a piece is. Two things are never blanked:
 *
 *  - a `{{marker}}`, which is already a parameter;
 *  - a token straight after '(' or '=', which is an INDEX (`:nth-of-type(3)`,
 *    `nth=2`) — the one place a small number says "which one", not "whose".
 *
 * Blanking over-merges, which is the silent direction: two skills merged or a
 * loop folded over steps that were different procedures. So a digit-free word
 * is never blanked (see `digitDominant`).
 */
export function skeleton(text: string): string {
  return text.replace(/\{\{[^{}]*\}\}|[A-Za-z0-9]+/g, (tok: string, at: number, whole: string) => {
    if (tok.startsWith('{{')) return tok;
    const before = whole[at - 1];
    if (before === '(' || before === '=') return tok;
    return digitDominant(tok, 'proposal') ? '*' : tok;
  });
}

/**
 * Hex runs, which are tested in three places and deliberately NOT unified,
 * because they answer different questions and fail in different directions:
 *
 *  - `opaque` above: is this WHOLE value a generated token? Anchored
 *    (`^[0-9a-f]{8,}$`). Admission — a false yes costs a wasted reference.
 *  - `GENERATED_ID_HEX_RUN`, recorder.ts (twice — one copy runs in the page
 *    and cannot import): does a DOM id CONTAIN a hash, so it will be re-minted
 *    next load? Unanchored substring, eight long. A false yes demotes a
 *    working id to the structural path (cost); a false no makes a dead id the
 *    primary (a failed count(), then the fallbacks). Eight is where a word
 *    stops being a plausible accident ("deadbeef" is the rare English one).
 *  - fingerprint.ts `stableClass` (page-side): does a CSS class contain a
 *    build hash (emotion's `css-1a2b3c`)? Unanchored, SIX long, because those
 *    hashes are six — and the answer only moves a similarity score.
 *
 * The gate test pins each page-side literal to its constant here.
 */
export const GENERATED_ID_HEX_RUN = /[0-9a-f]{8,}/i;
export const CLASS_HASH_HEX_RUN = /[0-9a-f]{6,}/i;
