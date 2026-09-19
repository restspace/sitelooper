import type { Page } from 'playwright-core';
import { extractValues } from './actor.js';

/**
 * PLAN-jev.md §5.3: evidence reads in code.
 *
 * About half of the model's turns on a Kanboard-shaped app are LOOKS, and
 * jgkb1's traces show what most of them are: after a mutation the model wants
 * to see where the page now shows the thing it just typed, so it emits a
 * `read_all` or an `eval` carrying a selector it has to guess — often several
 * at once in the hope that one matches (`div.comment .comment-content,
 * #comments .comment div.markdown, .comment .markdown`). The call is ~70
 * characters; the turn is a full model round trip.
 *
 * Code does not have to guess a selector. It knows the strings the instruction
 * names, and it can ask the page where they are. So after an action that may
 * have changed the page, the records that now show one of the instruction's
 * own literals are read and attached to the action's result — the read the
 * model was about to ask for, already answered.
 *
 * What it is NOT: a verdict. It says what the page shows, in the page's words,
 * and the model decides what that means — exactly as with a read it made
 * itself. And it only looks for literals the instruction states: a value the
 * app computed (a total, an id it assigned) is only found when it sits in the
 * same record as one.
 */

/** Records quoted per block: a list of matches is evidence, a page dump is not. */
const MAX_RECORDS = 6;
const MAX_RECORD_CHARS = 220;
/** Shorter strings match half the page ("25", "Save"). */
const MIN_LITERAL_CHARS = 4;

export interface EvidenceRecord {
  /** The instruction's literal that was found. */
  literal: string;
  /** What kind of container the text was read from: row, item, region … */
  where: string;
  text: string;
}

/** The instruction's own strings worth looking for: names and quoted text, not numbers. */
export function evidenceLiterals(instruction: string): string[] {
  const seen = new Set<string>();
  for (const v of extractValues(instruction)) {
    if (v.kind !== 'text' || v.text.length < MIN_LITERAL_CHARS) continue;
    seen.add(v.text);
  }
  return [...seen];
}

/** Where the page shows these literals right now. Never throws: no evidence is a valid answer. */
export async function readEvidence(page: Page, literals: readonly string[]): Promise<EvidenceRecord[]> {
  if (!literals.length) return [];
  try {
    return await page.evaluate(
      ({ literals, maxRecords, maxChars }) => {
        const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
        const visible = (el: Element) => {
          const h = el as HTMLElement;
          return Boolean(h.offsetParent || h.getClientRects().length);
        };
        const out: Array<{ literal: string; where: string; text: string }> = [];
        const seen = new Set<string>();
        const wanted = literals.map((l) => ({ literal: l, low: l.toLowerCase() }));
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node && out.length < maxRecords; node = walker.nextNode()) {
          const text = (node.textContent ?? '').toLowerCase();
          if (text.length < 4) continue;
          const hit = wanted.find((w) => text.includes(w.low));
          const holder = node.parentElement;
          if (!hit || !holder || !visible(holder) || holder.closest('script,style,noscript,template')) continue;
          // The RECORD the text sits in: that is where a computed price, a status
          // or an assigned id will be, beside the name the instruction gave.
          const record =
            holder.closest('tr,[role=row],li,[role=listitem],article,[role=article],dl') ??
            holder.closest('section,form,[role=region],[role=dialog],dialog') ??
            holder;
          const where = record.matches('tr,[role=row]')
            ? 'row'
            : record.matches('li,[role=listitem]')
              ? 'item'
              : record.matches('dl')
                ? 'details'
                : record === holder
                  ? holder.tagName.toLowerCase()
                  : 'region';
          const body = clean((record as HTMLElement).innerText || record.textContent).slice(0, maxChars);
          // The literal alone — a heading that is just the ticket's title — tells the
          // model nothing it did not type itself; fxevon1-n1 sent that after every click.
          if (!body || seen.has(body) || body.toLowerCase() === hit.low) continue;
          seen.add(body);
          out.push({ literal: hit.literal, where, text: body });
        }
        return out;
      },
      { literals: [...literals], maxRecords: MAX_RECORDS, maxChars: MAX_RECORD_CHARS },
    );
  } catch {
    return [];
  }
}

/** The block appended to an action's result, or '' when there is nothing to say. */
export function renderEvidence(records: readonly EvidenceRecord[]): string {
  if (!records.length) return '';
  const lines = records.map((r) => `- ${JSON.stringify(r.literal)} — ${r.where}: ${JSON.stringify(r.text)}`);
  return `\n[evidence: where the page NOW shows values this instruction names — read after the action above, so there is no need to read them again]\n${lines.join('\n')}`;
}
