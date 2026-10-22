import type { LocatorCandidate } from '../daemon/recorder.js';
import { FRAME_MARK } from '../execution/text.js';
import { occursAsToken, replaceAsToken } from './ledger.js';
import { MIN_ID_LEN } from './shape.js';

/**
 * A read scoped by the slot its recorded value carries (round 55 item 17).
 *
 * repairdesk fwrd87 04-add: s_9e190d was recorded adding "fwrd87-n1 RD Part
 * A" and replayed for Part B. Its part_name reads (steps 7 and 12) recorded
 * exactly that name, yet — unlike their sibling cost/markup reads — carried no
 * candidate scoped by the part-name slot {{v4}}. On replay the positional
 * primary matched both rows, the fallback was Part A's own test hook
 * (`[data-testid="part-row-p18"] td`), and n2/n3 published Part A's name
 * beside Part B's cost. Step 18's frame, "{{=}} RD Part A", hard-coded the
 * recording's part the same way.
 *
 * Decided by PROVENANCE — the value the read recorded and the slot's example —
 * never by what the value looks like:
 *
 *  - The slot must be one the procedure LOCATES by: a `{{vN}}` some recorded
 *    candidate of the procedure carries (fwrd87's scoped cost/markup rows).
 *    That is the recording's own evidence that the value names a record; a
 *    typed cost "100" that a price "$100.00" happens to contain is not.
 *  - `args.scopedBy` names the slot. Both runners then refuse to publish a
 *    value that does not show this run's value for it (execution/observe.ts
 *    scopedRead): a read that resolved onto another record is skipped, never
 *    published. A slot name, not a `{{vN}}` marker, so it is not counted as a
 *    use (slotsUsed) and binds nothing the procedure did not already bind.
 *  - When the recorded value IS the slot's value, the slot finds the element:
 *    a `text` candidate `{{vN}}` leads the chain, unless one already names it
 *    — or, when the recording shows the value more than once on the page
 *    (shownMoreThanOnce), follows the recorded candidates (fwen9-luna).
 *  - A frame whose line (the mark put back as the recorded value) carries a
 *    locating slot's value that contains the recorded value, where the
 *    recorded value is itself a slot's value, is kept in slot form too:
 *    `slotFrame` (the line with that slot's marker) and `frameMark` (the slot
 *    the mark stands for). At run time the mark is placed at this run's value
 *    in this run's line (text.ts markFrame); the recorded frame is the
 *    fallback when it cannot be.
 *
 * Singular text reads only: a read_all publishes every match, joined, and has
 * no one record to be scoped to. Mutates `args` and `locators`.
 */
export function scopeReadBySlot(
  recorded: string | undefined,
  tool: string,
  args: Record<string, unknown>,
  locators: Record<string, LocatorCandidate[]>,
  slots: ReadonlyMap<string, string>,
  locating: ReadonlySet<string>,
  /** What the recording saw of this read's page before it (shownMoreThanOnce). Omitted: no evidence, today's order. */
  page?: PageEvidence,
): void {
  if (tool !== 'read' || (args.what !== undefined && args.what !== 'text')) return;
  const value = recordedText(recorded);
  if (!value) return;
  const values = [...slots]
    .map(([name, v]) => [name, collapse(v)] as const)
    .filter(([, v]) => v.length >= MIN_ID_LEN)
    .sort((a, b) => b[1].length - a[1].length);

  const within = values.find(([name, v]) => locating.has(name) && occursAsToken(value, v));
  if (within) {
    const [name, example] = within;
    args.scopedBy = name;
    const marker = `{{${name}}}`;
    const chain = locators.target;
    if (chain?.length && value === example && !chain.some((c) => JSON.stringify(c).includes(marker))) {
      // Only where the recording says the value names ONE element. erpnext
      // fwen9-luna s_1c570b steps 3 and 16 read "Bench Widget" — step 3 one
      // element of the item_code list read ["Bench Widget","Bench Gadget"],
      // step 16 its read-back — and the `text "{{v4}}"` primary was ambiguous
      // on n2, n3, the spec and all three readiness runs (a positional css
      // took the read every time). Then it is still a candidate, behind what
      // the recording located the element by: the point stays last.
      const text: LocatorCandidate = { kind: 'text', text: marker };
      if (page && shownMoreThanOnce(value, page)) {
        const at = chain.findIndex((c) => c.kind === 'point');
        chain.splice(at < 0 ? chain.length : at, 0, text);
      } else {
        chain.unshift(text);
      }
    }
  }

  if (typeof args.frame !== 'string') return;
  const lines = args.frame.split('\n');
  const at = lines.findIndex((l) => l.includes(FRAME_MARK));
  if (at < 0 || lines[at].split(FRAME_MARK).length !== 2) return;
  const markSlot = values.find(([, v]) => v === value);
  if (!markSlot) return;
  const line = lines[at].replace(FRAME_MARK, value);
  const host = values.find(([name, v]) => name !== markSlot[0] && locating.has(name) && v.length > value.length && occursAsToken(v, value) && occursAsToken(line, v));
  if (!host) return;
  lines[at] = replaceAsToken(line, host[1], `{{${host[0]}}}`);
  args.slotFrame = lines.join('\n');
  args.frameMark = markSlot[0];
}

/** What the recording read of a read's page: the read itself and the reads before it (`listOf` set on an element split from a list read). */
export interface PageEvidence {
  reads: readonly { tool: string; result?: string; listOf?: number }[];
}

/**
 * Does the recording show this value MORE THAN ONCE on the page, so that a
 * text locator naming it would match several elements? Recorded evidence
 * only, never the value's look:
 *
 *  - a read of the page that was one element of a list read (expandListReads)
 *    and returned exactly this value — the value is one of a set of like
 *    elements, rendered beside its siblings (fwen9-luna s_1c570b step 3, and
 *    step 16's read-back of the same value);
 *  - a list read of the page with the value in two or more of its elements.
 *
 * A value read twice by plain singular reads is NOT evidence: a read and its
 * read-back of one element is the usual shape (fwrd87's part_name reads).
 * Nor are the page's snapshot lines: a typed field's value and a cell, or a
 * cell and the link inside it, are two lines for what a text locator finds
 * once (fwrd87 recorded `textbox "Part name": …` beside `cell "…"`).
 */
export function shownMoreThanOnce(value: string, page: PageEvidence): boolean {
  for (const r of page.reads) {
    if (r.result === undefined) continue;
    if (r.listOf !== undefined && r.listOf >= 2 && recordedText(r.result) === value) return true;
    if (r.tool !== 'read_all') continue;
    let decoded: unknown;
    try {
      decoded = JSON.parse(r.result);
    } catch {
      continue;
    }
    if (Array.isArray(decoded) && decoded.filter((e) => typeof e === 'string' && occursAsToken(collapse(e), value)).length >= 2) return true;
  }
  return false;
}

/** The slots some candidate of `chains` locates by (a `{{vN}}` it carries). */
export function locatingSlots(chains: unknown): Set<string> {
  return new Set([...JSON.stringify(chains ?? null).matchAll(/\{\{(v\d+)\}\}/g)].map((m) => m[1]));
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A singular read's recorded result as text, whitespace collapsed; null for a list or nothing. */
function recordedText(result: string | undefined): string | null {
  if (result === undefined) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(result);
  } catch {
    decoded = result;
  }
  return typeof decoded === 'string' ? collapse(decoded) || null : null;
}
