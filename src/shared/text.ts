/** `text` cut to `max` characters with an ellipsis, or unchanged when it fits. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}

/**
 * Clock and calendar tokens are the RECORDING's moment, not part of what a
 * page element IS: kanboard names its due-date textbox after the current
 * minute ("09/03/2026 07:22") and labels a summary row "Due date:
 * 12/31/2026 07:40". Recorded verbatim, such a name matches nothing nine
 * minutes later. maskVolatile() turns each token into the `{{*}}` wildcard
 * for stored expectations; volatileMatcher() turns a recorded locator name
 * into a RegExp that treats the same tokens as wildcards.
 */
export const WILDCARD = '{{*}}';
const VOLATILE_TOKEN = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g;

export function maskVolatile(line: string): string {
  return line.replace(VOLATILE_TOKEN, WILDCARD);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The recorded string itself when it carries no volatile token, else an
 * anchored RegExp in which each token matches any token of the same shape —
 * another time, another date — and nothing else, so the rest of the name is
 * still matched exactly.
 */
/**
 * What one masked token stood for, as regex SOURCE. Exported because a
 * compiled spec has to rebuild the same matcher from a line the store already
 * masked (see spec/locators.ts, maskedMatcherSource) and a second copy of this
 * shape would be free to drift away from this one.
 */
export const VOLATILE_TOKEN_SHAPE = '(?:\\d{1,2}:\\d{2}(?::\\d{2})?|\\d{1,4}[/.-]\\d{1,2}[/.-]\\d{1,4})';

/**
 * What may NOT sit against an identity marker: a letter or a digit.
 *
 * An identity marker is the only thing in the system that can tell ticket t15
 * from ticket t14 — a url pattern and a page fingerprint match every record of
 * a template, so when the url gate proceeds optimistically on a disagreeing
 * segment, this is the gate the decision falls to. Matched by plain substring
 * it does not decide anything: `fwgr25-n1` is satisfied by a page showing
 * `fwgr25-n10`, `RD-1015` by `RD-10150`, and a bare runid is the commonest
 * marker shape there is.
 *
 * So a marker matches only where neither edge is glued to another letter or
 * digit. BOTH lookarounds, unconditionally — not "when the marker looks like
 * an identifier". The shape is not a property of the MARKER but of what the
 * page may put beside it: `fwod28-n1 Bench Customer` is prose-shaped and
 * `…Bench Customers` is a different record. Punctuation is not a letter or a
 * digit, so `(INV-2024/17)` still matches while `INV-2024/170` does not, and
 * `\p{L}` (with `u`) keeps `Ångström` and `田中` right.
 *
 * Exported as SOURCE because a compiled spec must rebuild the same rule inside
 * the emitted artifact, and a second copy of the class would be free to drift
 * away from this one — the same reason VOLATILE_TOKEN_SHAPE is exported.
 */
export const IDENTITY_EDGE = '[\\p{L}\\p{N}]';

/**
 * `marker` as regex SOURCE for the bounded identity rule: whitespace-normalised,
 * every literal run of spaces matching any whitespace (the daemon's snapshot and
 * a DOM's textContent space things differently), `{{*}}` matching anything
 * within one line, and both edges guarded by IDENTITY_EDGE.
 */
export function identitySource(marker: string): string {
  const body = marker
    .replace(/\s+/g, ' ')
    .trim()
    .split(WILDCARD)
    .map((part) => escapeRe(part).replace(/ /g, '\\s+'))
    .join('[^\\n]*?');
  return `(?<!${IDENTITY_EDGE})${body}(?!${IDENTITY_EDGE})`;
}

/**
 * identitySource as a RegExp. Case-INSENSITIVE: the daemon was case-sensitive
 * here and the emitted artifact was not, and a case-insensitive BOUNDED match
 * is strictly tighter than the case-sensitive SUBSTRING it replaces — so
 * unifying on `i` is not a loosening, and it settles a real parity gap (a
 * rendered value is not always cased as it was typed).
 */
export function identityRe(marker: string): RegExp {
  return new RegExp(identitySource(marker), 'iu');
}
export function volatileMatcher(text: string): string | RegExp {
  const masked = maskVolatile(text);
  if (masked === text) return text;
  return new RegExp(`^${masked.split(WILDCARD).map(escapeRe).join(VOLATILE_TOKEN_SHAPE)}$`);
}
