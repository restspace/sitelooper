/**
 * Shadow rules: stricter checks under trial that report and never refuse.
 *
 * Each finding is one line, `[shadow:<kind>] step <tag>: <why>`. Replay
 * collects them on ReplayResult.shadow, the flow run carries them on
 * FlowStepResult.shadow, and a compiled artifact prints them as
 * `[sitelooper shadow] …`. A sweep counts them against its verifier: a rule
 * that flags the known false passes and stays quiet on green runs graduates
 * to a refusal; one that does not is dropped.
 *
 * Kinds:
 *  - `delta`: a step's success rested on page state that was already there
 *    before this run's segment began, so the run did not cause it (an expected
 *    change "found on the page instead", an "already in effect" skip, an
 *    "already satisfied" goal skip).
 *  - `read`: a published value whose recorded template is fully fixed (literal
 *    text and this run's own params) read something else on this replay.
 *
 * Embedded verbatim in the compiled artifact, like the rest of src/execution.
 */

export type ShadowKind = 'delta' | 'read';

/** Off only when SITELOOPER_SHADOW=off; on by default while rules are under trial. */
export function shadowEnabled(): boolean {
  return (typeof process !== 'undefined' ? process.env?.SITELOOPER_SHADOW : undefined) !== 'off';
}

export function shadowLine(kind: ShadowKind, tag: string, why: string): string {
  return `[shadow:${kind}] step ${tag}: ${why}`;
}

// --- read: a published value against its fixed recorded template ------------

/** Numbers to their plain value: thousands commas and trailing decimal zeros dropped ("12,500.00" → "12500"). */
function plainNumbers(text: string): string {
  return text.replace(/\d[\d,]*(?:\.\d+)?/g, (n) => {
    const plain = n.replace(/,/g, '');
    const value = Number(plain);
    return Number.isFinite(value) ? String(value) : plain;
  });
}

/**
 * A text as the read rule compares it: its words, numbers at their plain
 * value, case folded, every run of whitespace, punctuation and separator
 * dropped. So a "
"-joined multi-line read, a read_all's " | " list and a
 * report's ", " list of the same items are the same words, "12,500.00" is
 * "12500", and a CSS text-transform's "OVERVIEW" is "overview".
 */
export function readWords(text: string): string[] {
  // A word boundary where lower case or a digit meets upper case: a node's
  // text run into its neighbour's ("…fwvk1-n2Bench task…") still splits.
  return plainNumbers(text.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Whether `inner` occurs as a contiguous run of `outer`'s words. */
function wordsWithin(inner: readonly string[], outer: readonly string[]): boolean {
  for (let i = 0; i + inner.length <= outer.length; i++) {
    if (inner.every((w, j) => outer[i + j] === w)) return true;
  }
  return false;
}

/**
 * An in-progress status ("Saving...", "Loading…"): what the page showed while
 * a save or load was under way, which a read catches or misses by timing
 * alone (Ghost's editor header reads "Saving..." or "Draft - Saved" on runs
 * the app's verifier passed alike). Kept to a few generic progress verbs.
 */
const TRANSIENT_STATUS = /\b(?:saving|loading|updating|processing|submitting)\s*(?:\.{2,}|…)/i;

/** A minted reference as an app shows one: letters then digits ("RD-1019", "S00022", "INV/2026/0007"). */
const MINTED_ID = /^[A-Za-z]{1,6}[-_/#]?\d[\d/-]*\d$/;

/** Words as a multiset key: the same words in any order give the same key. */
function wordBag(words: readonly string[]): string {
  return [...words].sort().join(' ');
}

/**
 * Whether a template made of ONE slot was bound to something that is not a
 * value of the read's kind, so a mismatch says nothing about the app. The
 * binding is the recorder's guess at which typed or chosen value the read
 * shows; when the guess is wrong the template was never fixed:
 *  - the slot's value is "null"/"undefined" (a param that was never a value,
 *    Odoo fwod47's unit price);
 *  - the slot's value is a " | "-joined list: a read_all's whole table row
 *    bound where the read is one cell (Odoo fwod50's first_line_product);
 *  - the slot's value CONTAINS the read word-wise: the read is one cell of
 *    the row the slot holds (Odoo fwod39's "[FURN_7777] Office Chair");
 *  - the read is a minted reference ("RD-1019", "S00022") and the slot's
 *    value is not one (RepairDesk's run id "fwrd49-n3", Odoo's page title
 *    "Quotations"): an id the app mints is never one the run typed.
 * A slot bound to a value of the read's kind ("Bench Widget" read as "Bench
 * Gadget") is still judged.
 */
function badSlotBinding(value: string, read: string): boolean {
  const v = value.trim();
  if (/^(?:null|undefined)$/i.test(v)) return true;
  if (v.includes(' | ')) return true;
  const cell = readWords(read);
  if (cell.length && wordsWithin(cell, readWords(v))) return true;
  return MINTED_ID.test(read.trim()) && !MINTED_ID.test(v);
}

/** readShadowFinding's judgement, with the filled template readShadowLines compares siblings by. */
function readShadowMismatch(label: string, template: string, params: Record<string, string>, read: string | undefined): { filled: string; why: string } | null {
  if (typeof read !== 'string' || !read.trim()) return null;
  if (typeof template !== 'string' || !template.trim()) return null;
  let unfilled = false;
  const filled = template.replace(/\{\{(v\d+)\}\}/g, (m, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined;
    if (typeof value !== 'string' || !value.trim()) {
      unfilled = true;
      return m;
    }
    return value;
  });
  if (unfilled || filled.includes('{{')) return null;
  // A url (or about:blank) is where the page happened to be routed, not a
  // value the procedure published about the app's state: 30 of the green
  // runs' findings were a sign-in step's "initial page url".
  if (/^(?:https?:\/\/|about:|file:|data:)\S*$/i.test(filled.trim())) return null;
  // A progress status on either side was caught mid-save: timing, not state.
  if (TRANSIENT_STATUS.test(filled) || TRANSIENT_STATUS.test(read)) return null;
  const given = new Set(
    Object.values(params)
      .map((v) => plainNumbers(String(v).trim()))
      .filter((v) => /^\d+(?:\.\d+)?$/.test(v)),
  );
  const recordedNumbers = plainNumbers(template.replace(/\{\{v\d+\}\}/g, ' ')).match(/\d+(?:\.\d+)?/g) ?? [];
  if (recordedNumbers.some((n) => !given.has(n))) return null;
  const want = readWords(filled);
  const got = readWords(read);
  if (!want.length || wordsWithin(want, got)) return null;
  // The same words in another order: a list the app orders its own way
  // ("added the bug, priority-high labels" either way round). Only an equal
  // multiset agrees — a word missing or extra still flags.
  if (wordBag(want) === wordBag(got)) return null;
  const whole = /^\s*\{\{(v\d+)\}\}\s*$/.exec(template);
  if (whole && badSlotBinding(params[whole[1]], read)) return null;
  const show = (s: string) => JSON.stringify(s.length > 120 ? s.slice(0, 120) + '…' : s);
  const recorded = filled === template ? `recorded template ${show(template)}` : `recorded template ${show(template)} = ${show(filled)} this run`;
  return { filled, why: `label ${label} read ${show(read)}, ${recorded}` };
}

/**
 * The read shadow rule, for ONE published value: null when there is nothing
 * to judge or the read agrees, otherwise the finding's text.
 *
 * Judged only when the recorded template is FIXED for this run:
 *  - every `{{vN}}` slot is one of this run's params, none bound to '';
 *  - after filling them no `{{` marker is left (a derived `{{dN}}`, a `{{=}}`
 *    frame, the `{{*}}` wildcard, an `{{env:…}}` secret, an unknown slot);
 *  - the filled template is not a url (nor about:blank);
 *  - neither the template nor the read is an in-progress status
 *    (TRANSIENT_STATUS);
 *  - the template's own recorded text (outside its slots) carries no number,
 *    unless that number is one of this run's params written another way
 *    (EspoCRM fwec10's "$12,500.00" for an amount typed as 12500). Any other
 *    recorded number is the recording's moment — a minted id ("#4",
 *    "S00021", "RD-1015"), a clock time, a total over rows that vary — and
 *    published templates keep hundreds of them (the offline measurement over
 *    485 sweeps flagged most green runs on exactly these);
 *  - a template that is one whole slot had that slot bound to a value of the
 *    read's kind (see badSlotBinding).
 * A value the replay did not read (undefined, or empty as a skipped read
 * leaves it in either runner) is not judged.
 *
 * Agreement is the template's words occurring, in order and contiguous,
 * among the read's words (readWords): a read whose element also shows a
 * heading or a neighbour still shows the recorded value. Exactly the same
 * words in another order agree too. A read that is a PART of the template is
 * a finding — Odoo fwod98's status bar read without the "Cancelled" its
 * template begins with.
 */
export function readShadowFinding(label: string, template: string, params: Record<string, string>, read: string | undefined): string | null {
  return readShadowMismatch(label, template, params, read)?.why ?? null;
}

/**
 * The labels a segment's own top-level reads publish, each with the 1-based
 * number of the LAST step that reads it (the value that stands). Loop bodies
 * are left out: their reads repeat per iteration. Both runners ask this of
 * the same steps, so they judge the same labels.
 */
export function shadowReadLabels(steps: readonly { tool: string; label?: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  steps.forEach((s, i) => {
    if ((s.tool === 'read' || s.tool === 'read_all') && s.label) out[s.label] = i + 1;
  });
  return out;
}

/**
 * The report templates a segment's reads are judged against: every member of
 * the chain from this segment on, later members overriding earlier ones (as
 * daemon/step-verdict.ts merges them). A chain's report template sits on its
 * LAST segment, which is what lets an earlier segment's reads be judged.
 */
export function shadowReadTemplates(chain: readonly { reportTemplate?: { values?: Record<string, string> } }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const member of chain) for (const [k, v] of Object.entries(member.reportTemplate?.values ?? {})) out[k] = v;
  return out;
}

/**
 * Every read finding of one completed segment: each label it read (see
 * shadowReadLabels) that has a recorded template, was not an echo of what the
 * run itself typed or chose, and read something else than the template's
 * fixed text. Lines are shadowLine('read', <step number>, …).
 */
export function readShadowLines(
  labels: Record<string, number>,
  templates: Record<string, string>,
  params: Record<string, string>,
  values: Record<string, string | undefined>,
  echoed: readonly string[],
): string[] {
  const found: { at: number; read: string; filled: string; why: string }[] = [];
  for (const [label, at] of Object.entries(labels)) {
    if (!Object.prototype.hasOwnProperty.call(templates, label) || echoed.includes(label)) continue;
    const m = readShadowMismatch(label, templates[label], params, values[label]);
    if (m) found.push({ at, read: String(values[label]), filled: m.filled, why: m.why });
  }
  // Sibling labels swapped: reads of one segment that each found what ANOTHER
  // finding's template recorded (GitHub-like fwgt16's sidebar_label_bug read
  // "priority-high" while sidebar_label_priority_high read "bug": the app
  // listed the same labels in another order). Those findings are dropped
  // only when their reads and their templates are the same multiset, so two
  // reads of the same wrong value ("Part A", "Part A" for "Part B", "Part B")
  // still flag.
  const key = (s: string) => wordBag(readWords(s));
  const swapped = found.filter((f) => found.some((g) => g !== f && key(f.read) === key(g.filled)));
  const bag = (keys: string[]) => keys.sort().join('\n');
  const swap = swapped.length >= 2 && bag(swapped.map((f) => key(f.read))) === bag(swapped.map((f) => key(f.filled)));
  return found.filter((f) => !(swap && swapped.includes(f))).map((f) => shadowLine('read', String(f.at), f.why));
}
