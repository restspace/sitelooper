import type { Page } from 'playwright-core';
import { captureLines, lineShows } from './snapshot.js';
import { fillParams } from './url.js';

/**
 * REPORT-TEMPLATE VALUES, the rule both execution targets share. A zero-model
 * run reports what it read live, and — standing in for the recording's report
 * — every value of the skill's report template built from the caller's own
 * `{{vN}}` parameters, filled for this run. A recorded literal (run 1's record
 * id) is stale on any later run and is never published.
 *
 * The daemon applies it in synthesizeReport (src/skills/learn.ts) to the last
 * segment of the chain it replayed; a compiled artifact applies it after the
 * last segment of the step, for every value no live read of the step has
 * already published. fwgh4's artifact refused to compile over a value only the
 * daemon published: 03-open consumed `{{02-create.post_title_element_text}}`,
 * the template's `"{{v2}}"`, and the artifact carried the template only for a
 * goal guard.
 *
 * A PARAM DOES NOT VOUCH FOR THE TEXT AROUND IT. fwrd86's 06-delete template
 * held `list_row_RD-1015: "{{v1}} | {{v4}} RD Bench Ticket [Archived] | … |
 * Created: 2026-09-23"` and `list_default_count: "Showing 1–10 of 13 ({{v1}}
 * hidden …)"`. Each carries a slot, so each was "built from the caller's
 * params", and both replays published the recording's date and the
 * recording's counts as their own findings — n2 archived a second ticket and
 * still reported "of 15". The slot is this run's; the text between the slots
 * is the recording's. So every literal of a template value must stand on THIS
 * run's page before the value is published (unshownLiterals), and a value
 * whose literal the page does not show is withheld, in both runners, rather
 * than reported from memory.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */

/** Whether a template value is built from the caller's parameters at all (a recorded literal is not). */
export function derivesFromParams(template: string): boolean {
  return /\{\{v\d+\}\}/.test(template);
}

/**
 * The recording's own text in a template value: what stands between its
 * slots, whitespace collapsed. A run holding no letter or digit — the ` | `
 * or `%` the report joined its slots with — states nothing about the page and
 * is not a literal to observe.
 */
export function templateLiterals(template: string): string[] {
  return template
    .split(/\{\{[^{}]*\}\}/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/**
 * The literals of `template` this run's page does not show. `shown` is the
 * page as shownForReport captured it once the step's work was done; null (the
 * page could not be read) observed nothing, so every literal is unshown. A
 * whole-page substring question, the goal half of goalSatisfied: the text is
 * on the page or it is not, and a look that could not cover the page only
 * ever withholds.
 */
export function unshownLiterals(template: string, shown: readonly string[] | null | undefined): string[] {
  const literals = templateLiterals(template);
  if (!shown) return literals;
  const lines = [...shown];
  return literals.filter((literal) => !lineShows(lines, [literal]));
}

/**
 * The value a template entry publishes on this run, or null when it publishes
 * nothing: a recorded literal; a value that still asks for something once
 * filled (a slot left unbound, or a param that itself still holds a
 * `{{step.output}}` reference — fwod56); one that fills to nothing (a slot
 * bound to '' — round 26's rule J: an empty value is unfilled, not a value);
 * or one whose recorded text this run's page does not show (fwrd86, above).
 *
 * `opts.literal` admits a template with no slot at all, held to the same page
 * test: the already-satisfied guard publishes the values its skipped
 * read-backs would have, and there the page it just judged is the only
 * observation there is.
 */
export function templateValue(template: string, params: Record<string, string>, shown: readonly string[] | null | undefined, opts: { literal?: boolean } = {}): string | null {
  if (!opts.literal && !derivesFromParams(template)) return null;
  const filled = fillParams(template, params);
  if (!filled || /\{\{/.test(filled)) return null;
  if (unshownLiterals(template, shown).length) return null;
  return filled;
}

/** The one slot a template value is built from, or null when it names none or several. */
export function templateSlot(template: string): string | null {
  const slots = new Set(Array.from(template.matchAll(/\{\{(v\d+)\}\}/g), (m) => m[1]));
  return slots.size === 1 ? [...slots][0] : null;
}

/**
 * What a LATER STEP'S REFERENCE to a template value resolves to on this run.
 * The whole value where this page shows its recorded text (templateValue);
 * otherwise, for a value built from one slot, that slot's own value — the
 * part this run supplied. fwod74's 06-open referenced 05-open's
 * `second_product_name`, templated `"[FURN_6666] {{v7}}"`: the brackets are the
 * recording's, the product is this run's, and a consumer that cannot be given
 * the product would lose the step to recovery for want of decoration. Never
 * the recording's text: a value from several slots whose text the page does
 * not show resolves to nothing, as it does in the report.
 *
 * Only for references: the report keeps the confident rule, so this is asked
 * only of outputs a later step consumes (the daemon's flow runner, the
 * artifact's reportTemplateLines — the same set, consumedReportedOutputs).
 */
export function referenceValue(template: string, params: Record<string, string>, shown: readonly string[] | null | undefined, opts: { literal?: boolean } = {}): string | null {
  const whole = templateValue(template, params, shown, opts);
  if (whole !== null) return whole;
  const slot = templateSlot(template);
  const value = slot ? params[slot] : undefined;
  return value && !value.includes('{{') ? value : null;
}

/**
 * Whether a template value publishes for a reference on EVERY run whose
 * params bind: one built from slots alone, or from one slot (referenceValue's
 * fallback). A value from several slots with recorded text between them
 * publishes only on a run whose page shows that text, so it is no source a
 * compile can promise — the question publishedOutputs and the artifact's
 * unsourcedRef both ask, so compile and replay agree.
 */
export function templateSource(template: string): boolean {
  return derivesFromParams(template) && (templateLiterals(template).length === 0 || templateSlot(template) !== null);
}

/** Does any of these template values need the page to decide it — a value with recorded text to observe? */
export function reportNeedsPage(templates: readonly string[]): boolean {
  return templates.some((t) => templateLiterals(t).length > 0);
}

/**
 * The page a report's literals are observed on, taken once the step's work is
 * done — the daemon after the chain's last segment, the artifact after the
 * step's. Two looks: the dialect-2 lines (every control's name and value,
 * frames and open shadow roots included) and the document's rendered text,
 * line by line. The lines alone carry only interactive roles, and fwrd86's
 * "Showing 1–10 of 13" is plain text: a figure the page does show would be
 * withheld on every run. The page's own url is observed too: fwrd72's
 * `landing_page` is `"{{v1}}#/tickets"`, and `#/tickets` is only ever in the
 * address bar. Null only when nothing could read the page.
 */
export async function shownForReport(page: Page): Promise<string[] | null> {
  const lines = (await captureLines(page, 2).catch(() => null))?.lines ?? null;
  const text = await page
    .evaluate(() => document.body?.innerText ?? '')
    .then((t) => t.split('\n'))
    .catch(() => null);
  if (!lines && !text) return null;
  return [...(lines ?? []), ...(text ?? []), page.url()];
}


/**
 * THE SUMMARY, under the same provenance rule as the values. Recorded prose
 * is published only where every word of it was observed on this run: shown
 * on the page (`shown`), or supplied by it — the caller's instruction, a
 * slot's value, a live read, a value it kept (`observed`). fwrd86 06-delete's
 * summary still said "total 15 ({{v1}} plus the pre-existing archived
 * RD-1013)" on n2, which had archived a third ticket, and 04-edit's said
 * "(previously $375.00)", a figure 04-edit never read. Neither is a value, so
 * the value rule never reached them.
 *
 * By clause, not all or nothing. A sentence stands or falls on its main
 * clause; inside a sentence that stands, each parenthetical, `;`-part and
 * ` — `-part stands or falls on its own, so "(previously $375.00)" goes and
 * the sentence around it stays. A part of a fallen sentence goes with it —
 * "(Parts = 0)" alone says nothing. Quoted text is never cut. A clause
 * holding an unresolved `{{` goes too. Nothing left is '' (the caller then
 * says what it replayed and observed instead). Words are compared whole and
 * case-folded, and the page is one bag of words: the accepted whole-page
 * caveat.
 */
export function observedSummary(
  summary: string,
  observed: readonly string[],
  shown: readonly string[] | null | undefined,
  /** The caller's own further test of a clause (the daemon's stale-value rule); false drops it. */
  keep: (clause: string) => boolean = () => true,
): { text: string; dropped: string[] } {
  const bag = new Set<string>();
  for (const t of [...observed, ...(shown ?? [])]) for (const w of words(t)) bag.add(w);
  const ok = (clause: string): boolean => !clause.includes('{{') && words(clause).every((w) => bag.has(w)) && keep(clause);
  const dropped: string[] = [];
  const out: string[] = [];
  for (const sentence of summarySentences(summary)) {
    const main = sentence.filter((p) => p.main).map((p) => p.text).join('');
    if (!ok(main)) {
      if (sentence.some((p) => p.text.trim())) dropped.push(sentence.map((p) => p.text).join('').trim());
      continue;
    }
    for (const part of sentence) {
      if (part.main || ok(part.text)) out.push(part.text);
      else dropped.push(part.text.trim());
    }
  }
  const text = out
    .join('')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[;,:]\s*([.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text: /[\p{L}\p{N}]/u.test(text) ? text : '', dropped };
}

/** Case-folded words: runs of letters and digits, the unit a clause is observed in. */
function words(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu), (m) => m[0]);
}

/** A piece of a sentence: its main clause's text, or a droppable part. */
interface SummaryPart {
  text: string;
  main: boolean;
}

/**
 * The prose as sentences of parts, every character kept so the kept parts
 * rejoin as written. A sentence ends at `.`, `!` or `?` before whitespace or
 * the end. Within it, a parenthetical is a part, and a `;` or ` — ` starts a
 * part that runs to the next one or the sentence's end; everything else is
 * main clause. Nothing is cut inside quotes (straight or curly).
 */
function summarySentences(text: string): SummaryPart[][] {
  const sentences: SummaryPart[][] = [];
  let parts: SummaryPart[] = [];
  let cur = '';
  let main = true;
  let depth = 0;
  let quoted = false;
  let curly = 0;
  const flush = (nextMain: boolean): void => {
    if (cur) parts.push({ text: cur, main: depth > 0 ? false : main });
    cur = '';
    main = nextMain;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === '“') curly += 1;
    else if (ch === '”') curly = Math.max(0, curly - 1);
    const inQuote = quoted || curly > 0;
    if (!inQuote && ch === '(') {
      if (depth === 0) {
        if (cur) parts.push({ text: cur, main });
        cur = '';
      }
      depth += 1;
      cur += ch;
      continue;
    }
    cur += ch;
    if (!inQuote && ch === ')' && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        parts.push({ text: cur, main: false });
        cur = '';
      }
      continue;
    }
    if (inQuote || depth) continue;
    const next = text[i + 1];
    if ((ch === '.' || ch === '!' || ch === '?') && (next === undefined || /\s/.test(next))) {
      flush(true);
      sentences.push(parts);
      parts = [];
      main = true;
    } else if (ch === ';') {
      // What follows a `;` is a part of its own, and the `;` goes with it.
      cur = cur.slice(0, -1);
      flush(false);
      cur = ';';
    } else if (ch === '—' && text[i - 1] === ' ') {
      cur = cur.slice(0, -2);
      flush(false);
      cur = ' —';
    }
  }
  flush(true);
  if (parts.length) sentences.push(parts);
  return sentences;
}
