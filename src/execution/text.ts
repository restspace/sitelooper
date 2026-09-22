/**
 * Text rules both execution targets share: the volatile-token mask, the
 * bounded identity matcher, and the regex escape they are built on. The
 * daemon imports this module; a compiled `.flow.ts` artifact embeds its exact
 * source (spec/runtime-source.ts), so it must stay self-contained — no imports
 * beyond a sibling shared module or a Playwright type.
 */

/** `text` cut to `max` characters with an ellipsis, or unchanged when it fits. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}

/**
 * Clock, calendar and relative-time tokens are the RECORDING's moment, not part of what a
 * page element IS: kanboard names its due-date textbox after the current
 * minute ("09/03/2026 07:22") and labels a summary row "Due date:
 * 12/31/2026 07:40". Recorded verbatim, such a name matches nothing nine
 * minutes later. maskVolatile() turns each token into the `{{*}}` wildcard
 * for stored expectations; volatileMatcher() turns a recorded locator name
 * into a RegExp that treats the same tokens as wildcards.
 */
export const WILDCARD = '{{*}}';

/**
 * The volatile tokens, as regex SOURCE: a clock time, a numeric date, and a
 * relative time — anything whose value is how much wall-clock time has passed
 * since the recording, however it is spelled. ghost lists a seed post as
 * "… Bench Guides - 1 minute ago"; fwgh3's 01-signin stored that phrase in an
 * expectation, the post had aged by the replays, and n2, n3 and the compiled
 * spec all stopped on "the recorded page change did not appear".
 *
 * Only a leading capital is tolerated ("Just now", "A minute ago"), not a
 * case-insensitive flag: the same source builds the MATCHER
 * (VOLATILE_TOKEN_SHAPE, spliced into patterns whose flags it does not
 * choose), and a mask wider than its matcher turns a recorded name into one
 * nothing matches. The count may be a slot marker: compile substitutes before
 * it masks, and a run value "5" must not freeze "5 minutes ago" into
 * `{{v2}} minutes ago`. `today` is left out: it is a date picker's button as
 * often as it is a time.
 */
const CLOCK = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const NUMERIC_DATE = String.raw`\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}`;
const TIME_COUNT = String.raw`(?:\d+|\{\{[vd]\d+\}\}|[Aa] few|[Aa]n?|[Oo]ne|[Ff]ew)`;
const TIME_UNIT = String.raw`(?:[Ss]ec(?:ond)?|[Mm]in(?:ute)?|[Hh](?:ou)?r|[Dd]ay|[Ww]eek|[Mm]onth|[Yy]ear)s?`;
const RELATIVE_TIME = String.raw`(?:${TIME_COUNT}\s+${TIME_UNIT}\s+ago|\d+\s?(?:mo|[smhdwy])\s+ago|[Ii]n\s+${TIME_COUNT}\s+${TIME_UNIT}|[Jj]ust now|[Yy]esterday|[Tt]omorrow)`;
const VOLATILE_SOURCE = `(?:${CLOCK}|${NUMERIC_DATE}|${RELATIVE_TIME})`;
const VOLATILE_TOKEN = new RegExp(String.raw`(?<!\w)${VOLATILE_SOURCE}(?!\w)`, 'g');

export function maskVolatile(line: string): string {
  return line.replace(VOLATILE_TOKEN, WILDCARD);
}

/** A value interpolated into a pattern is DATA: its own metacharacters must not become pattern. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
export const VOLATILE_TOKEN_SHAPE = VOLATILE_SOURCE;

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

/**
 * A scoped candidate's `hasText`, as both runners pass it to
 * `locator(container, { hasText })`: the recorded text itself when it carries
 * no volatile token — Playwright's own substring match, case- and
 * whitespace-insensitive, unchanged — else a RegExp keeping those three
 * properties (unanchored, `i`, any whitespace run) with each volatile token
 * wildcarded as volatileMatcher does. fwgh4's s_17f69b scoped every read to
 * `li.gh-list-row` with hasText "{{v2}} By Bench Admin - a few seconds ago
 * Draft", which only held because the replay came seconds after the
 * recording. Called on the text with its slots already filled, in both
 * runners, so they cannot disagree about what a slot value contributes.
 */
export function hasTextMatcher(text: string): string | RegExp {
  const masked = maskVolatile(text);
  if (masked === text) return text;
  const body = masked
    .replace(/\s+/g, ' ')
    .trim()
    .split(WILDCARD)
    .map((part) => escapeRe(part).replace(/ /g, '\\s+'))
    .join(VOLATILE_TOKEN_SHAPE);
  return new RegExp(body, 'i');
}

/**
 * What an ACCESSIBLE NAME may carry that a recorded name never does.
 *
 * A recorded role name comes from this project's own DOM walk (execution/
 * snapshot.ts), which names an element by its text and collapses whitespace.
 * The browser's accessible name, which a role query compares against, is
 * computed from the rendered tree — including CSS-generated content. Kanboard's
 * column header is `<a>Ready <i class="fa fa-caret-down"></i></a>`: the walk
 * says `link "Ready"`, Chromium says "Ready " (the icon font's glyph,
 * a private-use code point), and `exact: true` on 'Ready' finds nothing. Every
 * synthesized column read of fwkb24 missed that way, on both replays, on the
 * very page the recording had seen them on.
 *
 * So the edges of a name may carry whitespace, private-use glyphs (icon
 * fonts), other symbols (a check mark, an emoji — \p{So}; not a math or
 * currency sign, which can be the name's own) and format characters, and every
 * run of whitespace inside it matches any run. Nothing else: a letter, a digit
 * or punctuation beside the name is a different name ("Ready?" is not
 * "Ready"), and two elements the tolerance makes indistinguishable are
 * refused by the resolver's own uniqueness rule, never picked. Exported as
 * SOURCE for the same reason VOLATILE_TOKEN_SHAPE is: the artifact rebuilds
 * the matcher from it.
 */
export const NAME_NOISE_SHAPE = '[\\s\\p{Co}\\p{So}\\p{Cf}]*';

/**
 * The matcher for a recorded ROLE name: volatileMatcher's wildcards for clock
 * and calendar tokens, with the accessible-name tolerance above at both edges
 * and across whitespace. Always a RegExp, so `exact: true` is moot — the
 * anchors carry the whole-string rule and the case stays as recorded.
 * One function for both runners: makeLocator (daemon/recorder.ts) calls it
 * and the compiled artifact calls the embedded copy (spec/locators.ts).
 */
export function roleName(text: string): RegExp {
  const masked = maskVolatile(text.replace(/\s+/g, ' ').trim());
  const body = masked
    .split(WILDCARD)
    .map((part) => escapeRe(part).replace(/ /g, '\\s+'))
    .join(VOLATILE_TOKEN_SHAPE);
  return new RegExp(`^${NAME_NOISE_SHAPE}${body}${NAME_NOISE_SHAPE}$`, 'u');
}

/** Roles a <label> names. */
const LABELLED_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider']);

/**
 * A selector naming a labelled field as `role=textbox[name="Part name *"]`,
 * optionally as the last link of a scoped chain (`dialog >> role=…`): the
 * scope, role and name, or null for any other selector.
 *
 * WHY IT IS SHARED. A label's text is not always the field's accessible name:
 * "Part name <span aria-hidden>*</span>" reads `Part name *` in our snapshot
 * and `Part name` to Playwright's role engine, so this selector matches
 * nothing as written. The daemon's live target resolution (daemon/refs.ts)
 * already accepted the field by its label's exact text; a STORED candidate of
 * this shape did not, in either runner. fwrd79's 03-open stored exactly this
 * as its fill's only candidate, and the compiled spec failed there with
 * "none of 1 recorded locators resolved". One parse, used by live resolution,
 * makeLocator and the emitted artifact alike.
 */
export function fieldByName(selector: string): { scope: string | null; role: string; name: string } | null {
  const cut = selector.lastIndexOf(' >> ');
  const last = (cut < 0 ? selector : selector.slice(cut + 4)).trim();
  const m = /^role=([a-z]+)\[name="((?:[^"\\]|\\.)*)"\]$/.exec(last);
  if (!m || !LABELLED_ROLES.has(m[1])) return null;
  return { scope: cut < 0 ? null : selector.slice(0, cut), role: m[1], name: m[2].replace(/\\(.)/g, '$1') };
}
