import type { Page } from 'playwright-core';
import { captureLines } from './snapshot.js';
import { fillParams } from './url.js';
import { setsSomething } from './echo.js';

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

/**
 * Whether a template value is built from this run's parameters at all (a
 * recorded literal is not): a caller's slot `{{vN}}`, or a value the run
 * minted and bound from its own url `{{dN}}` (fwec8 02-create's record id).
 */
export function derivesFromParams(template: string): boolean {
  return /\{\{[vd]\d+\}\}/.test(template);
}

/** The `{{vN}}`/`{{dN}}` markers a template value names. */
export function templateMarkers(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(/\{\{([vd]\d+)\}\}/g), (m) => m[1]))];
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
 * look that could not cover the page only ever withholds.
 *
 * Compared by WORDS — the literal's runs of letters and digits, whole and in
 * order, within one line — not by its characters. A literal is the text
 * BETWEEN slots, so its edges are whatever joined it to them: fwec8
 * 02-create's close_date `"Dec 31 ({{v5}})"` looked for `"Dec 31 ("`, the
 * page showed "Dec 31", and an observed value was withheld. The punctuation
 * is the report's joinery; the words are what the page has to show.
 */
export function unshownLiterals(template: string, shown: readonly string[] | null | undefined): string[] {
  const literals = templateLiterals(template);
  if (!shown) return literals;
  const lines = shown.map((line) => ` ${wordRun(line)} `);
  return literals.filter((literal) => !lines.some((line) => line.includes(` ${wordRun(literal)} `)));
}

/** A text's words, case-folded and joined by single spaces. */
function wordRun(text: string): string {
  return words(text).join(' ');
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
export function templateValue(
  template: string,
  params: Record<string, string>,
  shown: readonly string[] | null | undefined,
  opts: { literal?: boolean; given?: GivenEvidence } = {},
): string | null {
  if (!opts.literal && !derivesFromParams(template)) return null;
  const filled = fillParams(template, params);
  if (!filled || /\{\{/.test(filled)) return null;
  if (unshownLiterals(template, shown).length) return null;
  if (opts.given && unobservedGiven(template, params, shown, opts.given).length) return null;
  return filled;
}

/*
 * A PARAM IS GIVEN, NOT OBSERVED (round 60, Gitea fwgt11 07-add). The rule
 * above checks the text BETWEEN a template's slots; a value made of slots
 * alone has none, so it published whatever the caller passed. s_c8e15e's
 * template carried `issue_content_right_a_it: "{{v7}}"` — the recording's
 * read of the sidebar labels, split into keys — and v7 was the flow's literal
 * "bug", taken from the instruction; no step of the chain typed or read it.
 * n2 and n3's issue carried priority-high alone (their live labels_shown said
 * so), and both published "bug" beside it as a finding.
 *
 * So a slot of a value with no recorded text is published only where THIS run
 * observed it: its words stand in one line of the page the step settled on
 * (shownForReport — the url included, so an id used only in the url is
 * observed there), or in a value a read of this run returned. A slot the
 * procedure TYPED (a setting step's `value`/`text` names it) keeps today's
 * rule: what the run put on the page is the echo rules' to judge, not this
 * one's. Otherwise the value is withheld, and said to be given, not observed.
 *
 * "Where the recording's read-back would look" has no recorded location for a
 * value no step reads, so the page's lines are where it looks; the page is
 * judged line by line, as the literal rule judges it. A `{{dN}}` is the run's
 * own url, observed by construction.
 */

/** What a run observed besides the page: the slots its procedure typed, and the values its reads returned. */
export interface GivenEvidence {
  typed: readonly string[];
  live: readonly string[];
}

/** A step the typed-slot walk reads: its tool, its args, and a loop's body. */
interface TypingStep {
  tool: string;
  args: Record<string, unknown>;
  body?: readonly TypingStep[];
}

/** The `{{vN}}` slots a procedure TYPED: named in the `value` or `text` a setting step put on the page, loop bodies included. */
export function typedSlots(steps: readonly TypingStep[]): string[] {
  const out = new Set<string>();
  const walk = (list: readonly TypingStep[]): void => {
    for (const s of list) {
      if (setsSomething(s.tool)) {
        for (const arg of [s.args.value, s.args.text]) {
          if (typeof arg === 'string') for (const m of templateMarkers(arg)) if (m.startsWith('v')) out.add(m);
        }
      }
      if (s.body) walk(s.body);
    }
  };
  walk(steps);
  return [...out];
}

/**
 * The `{{vN}}` slots of a template value made only of params that this run did
 * not observe (see above); [] when it observed them all, and for a value with
 * recorded text, which unshownLiterals governs. A slot unbound, or bound to a
 * value with no letter or digit, states nothing to observe.
 */
export function unobservedGiven(template: string, params: Record<string, string>, shown: readonly string[] | null | undefined, evidence: GivenEvidence): string[] {
  if (templateLiterals(template).length) return [];
  const typed = new Set(evidence.typed);
  const lines = [...(shown ?? []), ...evidence.live].map((line) => ` ${wordRun(line)} `);
  return templateMarkers(template).filter((slot) => {
    if (!slot.startsWith('v') || typed.has(slot)) return false;
    const run = wordRun(params[slot] ?? '');
    return run !== '' && !lines.some((line) => line.includes(` ${run} `));
  });
}

/** Whether a template value is withheld as given, not observed: it would publish, but for its unobserved slots. */
export function withheldAsGiven(template: string, params: Record<string, string>, shown: readonly string[] | null | undefined, evidence: GivenEvidence): boolean {
  return templateValue(template, params, shown) !== null && unobservedGiven(template, params, shown, evidence).length > 0;
}

/** The warning both runners give for a value withheld as given, not observed. */
export function givenWarning(key: string): string {
  return `report value ${key} is given, not observed: it is built only from the step's own parameters, and neither this run's page nor any of its reads shows it — withheld`;
}

/** Why a step whose instruction asked for such a value is PARTIAL (step-verdict.ts partialReasons; the artifact says the same). */
export function givenPartialReason(key: string): string {
  return `${key}, an output this step was asked to report, is only the step's own parameter and this run never observed it, so ${key} went unreported`;
}

/** The one slot a template value is built from, or null when it names none or several. */
export function templateSlot(template: string): string | null {
  const slots = templateMarkers(template);
  return slots.length === 1 ? slots[0] : null;
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
 *
 * And only if every marker in it is BOUND (`bound`): a declared param of the
 * procedure or a value its chain derives. fwec8 03-verify's s_55d615 carried
 * `record_id: "{{v2}}"` with no v2 among its params — the whole-url v1 had
 * swallowed it — and this still counted it, so compile and export promised
 * an output no replay could ever fill.
 */
export function templateSource(template: string, bound: (name: string) => boolean = () => true): boolean {
  return (
    derivesFromParams(template) &&
    templateMarkers(template).every(bound) &&
    (templateLiterals(template).length === 0 || templateSlot(template) !== null)
  );
}

/**
 * Does any of these template values need the page to decide it — a value with
 * recorded text to observe, or (round 60, fwgt11) a slot of a param-only value
 * the procedure did not type (`typed`, typedSlots), which is observed there.
 */
export function reportNeedsPage(templates: readonly string[], typed: readonly string[] = []): boolean {
  return templates.some((t) => templateLiterals(t).length > 0 || templateMarkers(t).some((m) => m.startsWith('v') && !typed.includes(m)));
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
 * By clause, not all or nothing. A sentence stands or falls on its lead
 * clause; inside a sentence that stands, each `;`-part and ` — `-part stands
 * or falls on its own text, and takes its parentheticals with it — an
 * enumeration label included. fwvk7 03-open, n2, published "2026-12-31; (d);
 * (e); (f) one comment …": the clauses had gone and their labels had not,
 * because a label was judged as a clause of its own. Inside a part that
 * stands, each parenthetical stands or falls alone, so "(previously
 * $375.00)" goes and the sentence around it stays. The sentence's own stop
 * is kept with the sentence. Quoted text is never cut. A clause holding an
 * unresolved `{{` goes too. Nothing left is '' (the caller then says what it
 * replayed and observed instead). Words are compared whole and case-folded,
 * and the page is one bag of words: the accepted whole-page caveat.
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
  const whole = (part: SummaryPart): string => part.pieces.map((p) => p.text).join('');
  // A part is judged on its own words; one that has none but its
  // parentheticals (a bare "(d)") on those.
  const stands = (part: SummaryPart): boolean => {
    const own = part.pieces.filter((p) => !p.paren).map((p) => p.text).join('');
    return ok(words(own).length ? own : whole(part));
  };
  const dropped: string[] = [];
  const out: string[] = [];
  for (const sentence of summarySentences(summary)) {
    const [lead, ...rest] = sentence.parts;
    if (!lead || !stands(lead)) {
      const text = (sentence.parts.map(whole).join('') + sentence.end).trim();
      if (text) dropped.push(text);
      continue;
    }
    for (const part of [lead, ...rest]) {
      if (part !== lead && !stands(part)) {
        dropped.push(whole(part).trim());
        continue;
      }
      for (const piece of part.pieces) {
        if (!piece.paren || ok(piece.text)) out.push(piece.text);
        else dropped.push(piece.text.trim());
      }
    }
    out.push(sentence.end);
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

/** A clause of a sentence: its own text and its parentheticals, in order. */
interface SummaryPart {
  pieces: { text: string; paren: boolean }[];
}

/**
 * The prose as sentences of clauses, every character kept so the kept ones
 * rejoin as written. A sentence ends at `.`, `!` or `?` followed by
 * whitespace and then a capital, a quote or an opening bracket — or by the
 * end — so "i.e. 2026-12-31" (fwvk7) does not end one. Its stop is held
 * apart (`end`). Within it, a `;` or ` — ` starts a new clause that runs to
 * the next one; the first clause is the lead. A parenthetical is a piece of
 * the clause it stands in. Nothing is cut inside quotes, straight or curly.
 */
function summarySentences(text: string): { parts: SummaryPart[]; end: string }[] {
  const sentences: { parts: SummaryPart[]; end: string }[] = [];
  let parts: SummaryPart[] = [{ pieces: [] }];
  let cur = '';
  let depth = 0;
  let quoted = false;
  let curly = 0;
  const piece = (paren: boolean): void => {
    if (cur) parts[parts.length - 1].pieces.push({ text: cur, paren });
    cur = '';
  };
  const clause = (lead: string): void => {
    piece(false);
    parts.push({ pieces: [] });
    cur = lead;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === '“') curly += 1;
    else if (ch === '”') curly = Math.max(0, curly - 1);
    const inQuote = quoted || curly > 0;
    if (!inQuote && ch === '(') {
      if (depth === 0) piece(false);
      depth += 1;
      cur += ch;
      continue;
    }
    if (!inQuote && ch === ')' && depth > 0) {
      cur += ch;
      depth -= 1;
      if (depth === 0) piece(true);
      continue;
    }
    if (inQuote || depth) {
      cur += ch;
      continue;
    }
    if ((ch === '.' || ch === '!' || ch === '?') && endsSentence(text, i)) {
      piece(false);
      sentences.push({ parts, end: ch });
      parts = [{ pieces: [] }];
    } else if (ch === ';') {
      // What follows a `;` is a clause of its own, and the `;` goes with it.
      clause(ch);
    } else if (ch === '—' && cur.endsWith(' ')) {
      cur = cur.slice(0, -1);
      clause(' —');
    } else cur += ch;
  }
  piece(false);
  if (parts.some((p) => p.pieces.length)) sentences.push({ parts, end: '' });
  return sentences;
}

/** Whether the stop at `i` ends its sentence: at the end, or before whitespace and a capital, quote or bracket. */
function endsSentence(text: string, i: number): boolean {
  const rest = text.slice(i + 1);
  if (!rest.trim()) return true;
  if (!/^\s/.test(rest)) return false;
  return /^\s+[\p{Lu}"“'‘(]/u.test(rest);
}
